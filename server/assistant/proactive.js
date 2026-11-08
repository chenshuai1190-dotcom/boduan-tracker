import { AssistantError, assistantFailure, withinAssistantDeadline } from './errors.js';
import { evaluateAssistantParticipation, ASSISTANT_PARTICIPATION_TIMEOUT_MS } from './provider.js';
import { runAssistantJob } from './runtime.js';
import { publicAssistantAttachments } from './accountAccess.js';

const MODES = new Set(['general', 'founder_post', 'review_author']);
const KINDS = new Set(['post', 'author', 'community']);
const REASONS = new Set(['disabled', 'daily_decision_limit', 'discussion_changed', 'discussion_changed_retry_limit', 'reply_budget', 'duplicate_question']);
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const unavailable = () => new AssistantError('ASSISTANT_SOURCE_CHANGED', '这条公开内容已不可用。', 409);
const invalid = () => new AssistantError('ASSISTANT_PARTICIPATION_INVALID', '这次主动回复状态暂未确认。', 502);
const safeReason = value => REASONS.has(value) ? { reason: value } : {};

function node(source, assistantId, postId) {
  if (!source || !KINDS.has(source.kind) || typeof source.id !== 'string' || !source.id
    || source.deleted === true || source.deletedAt || source.postId && source.postId !== postId) return null;
  const authorId = typeof source.authorId === 'string' ? source.authorId : null;
  return { id: source.id, kind: source.kind, postId,
    text: text(source.text, source.kind === 'post' ? 12000 : 4000),
    ...publicAssistantAttachments(source, { comment: source.kind !== 'post' }),
    ...(source.hasImages === true ? { hasImages: true } : {}),
    author: { id: authorId, nickname: text(source.author?.nickname || source.nickname, 80),
      isAssistant: Boolean(assistantId && authorId === assistantId) },
    createdAt: text(source.createdAt, 40),
    replyTo: source.replyTo && ['author', 'community'].includes(source.replyTo.kind) && typeof source.replyTo.id === 'string'
      ? { kind: source.replyTo.kind, id: source.replyTo.id } : null,
  };
}

/** Only service-owned public projections enter the routing pass. In particular
 * do not forward arbitrary context fields, private memories or unshared data. */
export function buildAssistantParticipationContext({ event, context } = {}) {
  if (!event || !context?.post?.id || context.post.id !== event.postId || !MODES.has(event.mode)
    || !KINDS.has(event.sourceKind)) throw unavailable();
  const assistantId = context.assistant?.authorId;
  if (typeof assistantId !== 'string' || !assistantId) throw unavailable();
  const invocation = node(context.invocation, assistantId, event.postId);
  if (!invocation || invocation.kind !== event.sourceKind || invocation.id !== event.sourceId
    || invocation.author.id !== event.authorId || invocation.author.isAssistant) throw unavailable();
  const project = (items, limit) => {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).flatMap(source => {
      const value = node(source, assistantId, event.postId), key = value && `${value.kind}:${value.id}`;
      if (!value || seen.has(key)) return [];
      seen.add(key); return [value];
    }).slice(0, limit);
  };
  return {
    mode: event.mode,
    post: { id: context.post.id, text: text(context.post.text, 12000), date: text(context.post.date, 10),
      author: { id: context.post.authorId || null, nickname: text(context.post.author?.nickname, 80) },
      ...publicAssistantAttachments(context.post, { comment: false }),
      ...(context.post.hasImages === true ? { hasImages: true } : {}) },
    invocation,
    discussion: project(context.comments, 40),
    recentAssistantReplies: project(context.recentAssistantReplies, 20).filter(reply => reply.author.isAssistant),
  };
}

/** One bounded queue occurrence per cron. DB leases and its decision transaction
 * own retries, skip/wait states, quotas, exact-source dedup and publication CAS. */
export async function runAssistantProactive({ repository, signal, env = process.env,
  decide = evaluateAssistantParticipation, runJob = runAssistantJob,
  deadlineAt = Date.now() + 80_000, now = Date.now } = {}) {
  if (deadlineAt - now() < 6000) return { processed: 0, status: 'deferred', reason: 'time_budget' };
  signal?.throwIfAborted();
  const claimed = await repository.proactive('claim', {});
  if (!claimed || !Object.hasOwn(claimed, 'event')) throw invalid();
  if (claimed.event === null) {
    if (['failed', 'cancelled', 'deduplicated'].includes(claimed.status)) return { processed: 1, status: claimed.status, ...safeReason(claimed.reason) };
    if (claimed.deferred === true) return { processed: 0, status: 'deferred', ...safeReason(claimed.reason) };
    if (claimed.status != null) throw invalid();
    return { processed: 0, status: 'idle' };
  }
  if (!claimed.event?.id || typeof claimed.leaseToken !== 'string' || !claimed.leaseToken) throw invalid();
  const { event, leaseToken } = claimed;
  let decisionSaved = false;
  try {
    const context = buildAssistantParticipationContext(claimed);
    const budget = Math.min(ASSISTANT_PARTICIPATION_TIMEOUT_MS, deadlineAt - now() - 5000);
    if (budget < 1000) throw new AssistantError('ASSISTANT_TIMEOUT', '这次主动回复判断超时。', 504);
    const decision = await withinAssistantDeadline(() => decide({ context, env, signal, timeoutMs: budget }), signal);
    signal?.throwIfAborted();
    const accepted = await repository.proactive('decision', { id: event.id, leaseToken,
      decision: decision.decision, reason: decision.reason, questionKey: decision.questionKey });
    if (!accepted || !['queued', 'deduplicated', 'skipped', 'waiting', 'deferred', 'cancelled', 'failed'].includes(accepted.status)
      || ['queued', 'deduplicated'].includes(accepted.status) && !accepted.job?.id) {
      throw invalid();
    }
    decisionSaved = true;
    if (!accepted?.job?.id) return { processed: 1, status: accepted.status, id: event.id, ...safeReason(accepted.reason) };
    // Generation may take longer than triage. The authorized job remains in due
    // and is claimed by a future cron; don't start a request destined to timeout.
    if (deadlineAt - now() < 15_000) return { processed: 1, status: 'pending', id: accepted.job.id };
    const job = await runJob({ id: accepted.job.id, repository, signal, env, deadlineAt });
    return { processed: 1, status: job?.status || 'pending', id: job?.id || accepted.job.id };
  } catch (error) {
    const failure = assistantFailure(error);
    // Once a job exists its own lease/failure flow owns the state. Never reset a
    // successful decision because answer generation or publication failed.
    if (!decisionSaved) {
      try { await repository.proactive('fail', { id: event.id, leaseToken, errorCode: failure.code }, { signal: AbortSignal.timeout(5000) }); }
      catch { /* Source may have been withdrawn or the lease replaced. */ }
    }
    throw failure;
  }
}
