import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAssistantParticipation } from '../server/assistant/provider.js';
import { buildAssistantParticipationContext, runAssistantProactive } from '../server/assistant/proactive.js';
import { buildAssistantContext, runAssistantJob } from '../server/assistant/runtime.js';
import { AssistantError } from '../server/assistant/errors.js';

const env = { OPENAI_API_KEY: 'private-test-key', QUOTE_ASSISTANT_MODEL: 'gpt-6.1-sol' };
const message = text => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
const response = (output, extra = {}) => ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'completed', output, ...extra }) });
const decision = (action = 'reply') => ({ decision: action, reason: '有明确尚未解答的基础问题', questionKey: '回撤的含义与计算口径' });
const source = (id, extra = {}) => ({ id, kind: 'community', postId: 'log:post', authorId: 'person', author: { nickname: '成员' }, text: '什么是回撤？', ...extra });
const claim = (mode = 'general') => ({ event: { id: 'event', postId: 'log:post', sourceKind: 'community', sourceId: 'question', authorId: 'person', mode }, leaseToken: 'lease',
  context: { assistant: { authorId: 'bot' }, post: { id: 'log:post', text: '讨论投资的风险', date: '2026-11-09', authorId: 'post-author', author: { nickname: '发帖人' } },
    invocation: source('question'), comments: [source('question'), source('reply', { text: '还想知道年内收益率回落怎么计算' })], recentAssistantReplies: [] } });

test('participation uses one bounded strict-schema request and a real decision, not an answer or tool', async () => {
  let request, calls = 0;
  const result = await evaluateAssistantParticipation({ env, context: buildAssistantParticipationContext(claim()), fetchImpl: async (_, options) => {
    request = JSON.parse(options.body); calls++; return response([message(JSON.stringify(decision()))]);
  } });
  assert.deepEqual(result, decision()); assert.equal(calls, 1);
  assert.equal(request.store, false); assert.equal(request.model, 'gpt-6.1-sol'); assert.equal(request.reasoning.effort, 'low');
  assert.equal(request.text.format.type, 'json_schema'); assert.equal(request.text.format.strict, true);
  assert.deepEqual(request.text.format.schema.properties.decision.enum, ['reply', 'skip', 'wait']);
  assert.equal(request.text.format.schema.additionalProperties, false); assert.equal(request.tools, undefined);
  assert.ok(request.max_output_tokens <= 2000); assert.ok(!JSON.stringify(request).includes(env.OPENAI_API_KEY));
  assert.match(request.instructions, /基础知识问题也值得/); assert.match(request.instructions, /同一个独立问题只主动回答一次/);
  assert.match(request.instructions, /只有.*图片|只有图片/); assert.match(request.instructions, /不能凭名字/);
});

test('malformed, incomplete, refused or tool-based decisions never become successful skips', async () => {
  for (const candidate of [
    response([message(JSON.stringify(decision()))], { status: 'incomplete' }),
    response([{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'unavailable' }] }]),
    response([message('skip')]), response([message(JSON.stringify({ ...decision(), decision: 'publish' }))]),
    response([message(JSON.stringify({ ...decision(), reason: '' }))]),
    response([message(JSON.stringify({ ...decision(), reason: 'x'.repeat(301) }))]),
    response([message(JSON.stringify({ ...decision(), questionKey: 'x'.repeat(161) }))]),
    response([message(JSON.stringify({ ...decision(), postId: 'log:other' }))]),
    response([{ type: 'function_call', name: 'publish' }, message(JSON.stringify(decision()))]),
  ]) await assert.rejects(evaluateAssistantParticipation({ env, context: {}, fetchImpl: async () => candidate }),
    error => error.code === 'ASSISTANT_PARTICIPATION_INVALID');
});

test('routing preserves provider quota/auth failures without logging upstream text', async () => {
  for (const [status, code, expected] of [[429, 'insufficient_quota', 'ASSISTANT_QUOTA_EXHAUSTED'], [429, 'rate_limit_exceeded', 'ASSISTANT_RATE_LIMITED'],
    [401, 'invalid_key', 'ASSISTANT_NOT_CONFIGURED'], [502, 'anything', 'ASSISTANT_PARTICIPATION_UNAVAILABLE']]) {
    await assert.rejects(evaluateAssistantParticipation({ env, context: {}, fetchImpl: async () => new Response(JSON.stringify({ error: { code, message: 'upstream secret' } }), { status }) }),
      error => error.code === expected && !error.message.includes('secret'));
  }
  await assert.rejects(evaluateAssistantParticipation({ env: {}, context: {} }), error => error.code === 'ASSISTANT_NOT_CONFIGURED');
});

test('routing only receives public fields, exact target and trusted bot identity', () => {
  const supplied = claim();
  supplied.context.memories = [{ text: 'PRIVATE_MEMORY' }]; supplied.context.privateAccount = 'PRIVATE_LEDGER';
  supplied.context.post.account = 'PRIVATE_ACCOUNT'; supplied.context.invocation.author.isAssistant = true;
  supplied.context.invocation.author.nickname = 'Quote';
  supplied.context.comments.push(source('deleted', { deleted: true, text: 'DELETED' }), source('foreign', { postId: 'log:private', text: 'FOREIGN' }));
  supplied.context.recentAssistantReplies = [source('fake-bot', { author: { nickname: 'Quote', isAssistant: true }, text: 'FAKE_BOT' }),
    source('real-bot', { authorId: 'bot', author: { nickname: '其他名字' }, text: '已解释过收益率' })];
  const result = buildAssistantParticipationContext(supplied);
  assert.equal(result.invocation.author.isAssistant, false);
  assert.equal(result.discussion.length, 2); assert.equal(result.recentAssistantReplies.length, 1);
  assert.equal(result.recentAssistantReplies[0].author.isAssistant, true);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|DELETED|FOREIGN|FAKE_BOT/);
  for (const mutate of [data => { data.context.post.id = 'log:other'; }, data => { data.context.invocation.id = 'other'; },
    data => { data.context.invocation.authorId = 'bot'; data.event.authorId = 'bot'; }, data => { data.context.invocation.deleted = true; },
    data => { data.context.assistant = null; }, data => { data.event.mode = 'private'; }]) {
    const data = claim(); mutate(data); assert.throws(() => buildAssistantParticipationContext(data), error => error.code === 'ASSISTANT_SOURCE_CHANGED');
  }
});

function fixture({ accepted = { status: 'skipped' }, claimed = claim() } = {}) {
  const calls = [];
  const repository = { proactive: async (action, payload) => {
    calls.push({ action, payload });
    return action === 'claim' ? claimed : action === 'decision' ? accepted : { status: 'failed' };
  } };
  return { calls, repository };
}

test('skip/wait decisions persist once without generating or publishing a comment', async () => {
  for (const action of ['skip', 'wait']) {
    const { repository, calls } = fixture({ accepted: { status: action === 'skip' ? 'skipped' : 'waiting' } });
    const result = await runAssistantProactive({ repository, decide: async () => decision(action), runJob: async () => { throw new Error('no public response for skip/wait'); } });
    assert.equal(result.processed, 1); assert.equal(result.status, action === 'skip' ? 'skipped' : 'waiting');
    assert.deepEqual(calls.map(call => call.action), ['claim', 'decision']);
    assert.deepEqual(calls[1].payload, { id: 'event', leaseToken: 'lease', ...decision(action) });
  }
});

test('only the job returned by the decision transaction may run, with the same deadline', async () => {
  const { repository } = fixture({ accepted: { status: 'queued', job: { id: 'authorized-job' } } }), runs = [];
  const deadlineAt = Date.now() + 50_000;
  const result = await runAssistantProactive({ repository, env, deadlineAt, decide: async () => decision(), runJob: async payload => {
    runs.push(payload); return { id: payload.id, status: 'published' };
  } });
  assert.equal(result.status, 'published'); assert.equal(runs.length, 1);
  assert.equal(runs[0].id, 'authorized-job'); assert.equal(runs[0].repository, repository); assert.equal(runs[0].deadlineAt, deadlineAt);
});

test('an accepted pending job survives low remaining time without starting generation', async () => {
  const { repository, calls } = fixture({ accepted: { status: 'queued', job: { id: 'authorized-job' } } });
  let clock = 0;
  const result = await runAssistantProactive({ repository, deadlineAt: 30_000, now: () => clock,
    decide: async () => { clock = 20_000; return decision(); }, runJob: async () => { throw new Error('must remain queued'); } });
  assert.deepEqual(result, { processed: 1, status: 'pending', id: 'authorized-job' });
  assert.deepEqual(calls.map(call => call.action), ['claim', 'decision']);
});

test('idle queue and exhausted request budgets do not invoke the model', async () => {
  const idle = fixture({ claimed: { event: null } });
  const result = await runAssistantProactive({ repository: idle.repository, decide: async () => { throw new Error('must not run'); } });
  assert.equal(result.processed, 0); assert.deepEqual(idle.calls.map(call => call.action), ['claim']);
  const { repository, calls } = fixture();
  const deferred = await runAssistantProactive({ repository, deadlineAt: 1000, now: () => 0 });
  assert.equal(deferred.status, 'deferred'); assert.deepEqual(calls, []);
});

test('queue failure, cancellation, dedup and budget deferral remain distinct from no work', async () => {
  for (const status of ['failed', 'cancelled', 'deduplicated']) {
    const { repository } = fixture({ claimed: { event: null, status, reason: 'PRIVATE_UNKNOWN_REASON' } });
    assert.deepEqual(await runAssistantProactive({ repository }), { processed: 1, status });
  }
  const { repository } = fixture({ claimed: { event: null, deferred: true, reason: 'daily_decision_limit' } });
  assert.deepEqual(await runAssistantProactive({ repository }), { processed: 0, status: 'deferred', reason: 'daily_decision_limit' });
  for (const claimed of [null, {}, { event: null, status: 'unrecognized' }, { ...claim(), leaseToken: null }]) {
    const invalid = fixture({ claimed });
    await assert.rejects(runAssistantProactive({ repository: invalid.repository }), error => error.code === 'ASSISTANT_PARTICIPATION_INVALID');
  }
});

test('model failures persist only an error code and never turn into skip or publish', async () => {
  const { repository, calls } = fixture();
  await assert.rejects(runAssistantProactive({ repository, decide: async () => { throw new AssistantError('ASSISTANT_PARTICIPATION_INVALID', 'private raw upstream text', 502); } }),
    error => error.code === 'ASSISTANT_PARTICIPATION_INVALID');
  assert.deepEqual(calls.map(call => call.action), ['claim', 'fail']);
  assert.deepEqual(calls[1].payload, { id: 'event', leaseToken: 'lease', errorCode: 'ASSISTANT_PARTICIPATION_INVALID' });
});

test('source changes during evaluation cannot publish and generation failure cannot reset the event', async () => {
  const { repository, calls } = fixture({ accepted: { status: 'deferred' } });
  const result = await runAssistantProactive({ repository, decide: async () => decision(), runJob: async () => { throw new Error('source changed'); } });
  assert.equal(result.status, 'deferred'); assert.equal(calls.some(call => call.action === 'fail'), false);
  const second = fixture({ accepted: { status: 'queued', job: { id: 'job' } } });
  await assert.rejects(runAssistantProactive({ repository: second.repository, decide: async () => decision(), runJob: async () => { throw new Error('model failed'); } }),
    error => error.code === 'ASSISTANT_UNAVAILABLE');
  assert.equal(second.calls.some(call => call.action === 'fail'), false);
});

test('an invalid decision transaction response is an error rather than an invented deferred success', async () => {
  for (const accepted of [null, {}, { status: 'queued' }]) {
    const { repository, calls } = fixture({ accepted });
    await assert.rejects(runAssistantProactive({ repository, decide: async () => decision() }), error => error.code === 'ASSISTANT_PARTICIPATION_INVALID');
    assert.equal(calls.at(-1).action, 'fail');
  }
});

test('exhausted discussion rechecks report a terminal failure without reply generation', async () => {
  const { repository, calls } = fixture({ accepted: { status: 'failed', reason: 'discussion_changed_retry_limit' } });
  const result = await runAssistantProactive({ repository, decide: async () => decision(),
    runJob: async () => { throw new Error('must not generate after the recheck limit'); } });
  assert.deepEqual(result, { processed: 1, status: 'failed', id: 'event', reason: 'discussion_changed_retry_limit' });
  assert.deepEqual(calls.map(call => call.action), ['claim', 'decision']);
});

test('proactive answer instructions distinguish participation from endorsement and keep private data absent', async () => {
  for (const mode of ['founder_post', 'review_author', 'general']) {
    const job = { id: 'job', ownerId: 'person', kind: 'reply', postId: 'log:post', status: 'running' };
    const raw = { job, post: { id: 'log:post', text: '我觉得这次盈利证明了交易方法一定正确' },
      proactive: { mode, reason: 'INTERNAL_REASON', questionKey: 'INTERNAL_KEY' }, memories: [{ text: 'PRIVATE_MEMORY' }] };
    const repository = { admin: async action => action === 'claim' ? { job, leaseToken: 'lease' } : action === 'context' ? raw : { ...job, status: 'draft' } };
    await runAssistantJob({ id: job.id, repository, generate: async ({ context, instructions }) => {
      assert.deepEqual(context.proactive, { mode, reason: 'INTERNAL_REASON' });
      assert.doesNotMatch(JSON.stringify(context), /INTERNAL_KEY|PRIVATE_/);
      if (mode === 'founder_post') { assert.match(instructions, /同等的证据标准/); assert.match(instructions, /不奉承/); assert.match(instructions, /自然幽默/); }
      if (mode === 'review_author') { assert.match(instructions, /结果.*运气/); assert.match(instructions, /没有给出账本/); assert.match(instructions, /不按 AI 模型品牌/); }
      if (mode === 'general') assert.match(instructions, /不重复已经说清的内容/);
      return { text: '一次盈利不足以验证方法，需要和事前规则及风险预算一起检验。' };
    } });
    assert.equal(buildAssistantContext({ ...raw, job: { kind: 'chat' } }).proactive, undefined);
  }
});

test('proactive generation includes only new public discussion nodes and keeps normal summons narrow', () => {
  const base = { job: { kind: 'reply', postId: 'log:post', replyTo: { kind: 'community', id: 'question' } },
    post: { id: 'log:post', text: '原帖' }, assistant: { authorId: 'bot' }, proactive: { mode: 'general', reason: '补充剩余问题' },
    comments: [source('question', { replyTo: { kind: 'community', id: 'ancestor' } }), source('ancestor'),
      source('parallel', { text: '此问题已经回答了一部分' }), source('parallel', { text: 'duplicate' }),
      source('deleted', { text: 'DELETED', deleted: true }), source('foreign', { text: 'FOREIGN', postId: 'private' }),
      source('bot', { authorId: 'bot', text: 'Quote之前的答案' }), source('fake', { author: { nickname: 'Quote', isAssistant: true } })],
  };
  const model = buildAssistantContext(base);
  assert.deepEqual(model.discussion.map(item => item.id), ['parallel', 'bot', 'fake']);
  assert.equal(model.discussion[1].author.isAssistant, true); assert.equal(model.discussion[2].author.isAssistant, false);
  assert.doesNotMatch(JSON.stringify(model.discussion), /DELETED|FOREIGN|duplicate/);
  assert.equal(buildAssistantContext({ ...base, proactive: undefined }).discussion, undefined);
});

test('only a verified founder public post with real images can proceed without text', async () => {
  const job = { id: 'image-job', ownerId: 'founder', kind: 'reply', postId: 'log:image', status: 'running' };
  const raw = { job, post: { id: 'log:image', text: '', hasImages: true }, proactive: { mode: 'founder_post' }, comments: [] };
  const model = buildAssistantContext(raw);
  assert.equal(model.question, ''); assert.equal(model.invocation.hasImages, true);
  const repository = { admin: async action => action === 'claim' ? { job, leaseToken: 'lease' } : action === 'context' ? raw : { ...job, status: 'draft' } };
  await runAssistantJob({ id: job.id, repository, generate: async ({ context, instructions }) => {
    assert.equal(context.post.hasImages, true); assert.match(instructions, /没有收到图片像素/);
    assert.match(instructions, /不能描述图片里有什么/); return { text: '这条图片你更想聊哪一点？' };
  } });
  for (const changed of [{ proactive: { mode: 'general' } }, { proactive: undefined }, { post: { ...raw.post, hasImages: false } }]) {
    assert.throws(() => buildAssistantContext({ ...raw, ...changed }), error => error.code === 'ASSISTANT_SOURCE_CHANGED');
  }
});

function directReplyFixture(text, extra = {}) {
  const job = { id: 'direct-job', ownerId: 'person', kind: 'reply', postId: 'log:post', replyTo: { kind: 'community', id: 'question' }, autoPublish: true, status: 'running' };
  const context = { job, post: { id: 'log:post', text: '讨论投资' }, assistant: { authorId: 'bot' }, comments: [
    source('question', { text, replyTo: { kind: 'community', id: 'bot-answer' } }), source('bot-answer', { authorId: 'bot', text: '风险需要按可承受损失来衡量。' }),
  ], ...extra };
  const calls = [];
  const repository = { admin: async (action, payload) => {
    calls.push({ action, payload });
    if (action === 'claim') return { job, leaseToken: 'lease' };
    if (action === 'context') return context;
    if (action === 'participation-skip') return { ...job, status: 'cancelled', errorCode: 'NO_REPLY_NEEDED' };
    if (action === 'complete') return { ...job, status: 'draft', revision: 2 };
    if (action === 'publish') return { ...job, status: 'published', revision: 3 };
    return { ...job, status: 'failed' };
  } };
  return { repository, calls, job };
}

test('direct replies to Quote that only acknowledge the answer end without another public reply', async () => {
  for (const outcome of ['skip', 'wait']) {
    const { repository, calls, job } = directReplyFixture('谢谢，明白了。');
    const result = await runAssistantJob({ id: job.id, repository, decide: async ({ context }) => {
      assert.equal(context.invocation.text, '谢谢，明白了。');
      assert.equal(context.recentAssistantReplies[0].id, 'bot-answer'); return decision(outcome);
    }, generate: async () => { throw new Error('no reply to an acknowledgement'); } });
    assert.equal(result.status, 'cancelled'); assert.equal(result.errorCode, 'NO_REPLY_NEEDED');
    assert.deepEqual(calls.map(call => call.action), ['claim', 'context', 'participation-skip']);
    assert.deepEqual(calls.at(-1).payload, { id: job.id, leaseToken: 'lease', reason: decision(outcome).reason });
  }
});

test('a substantive direct follow-up proceeds after routing while explicit mentions bypass optional triage', async () => {
  for (const text of ['那最大回撤和年内收益回落有什么区别？', '@Quote 请再解释一下']) {
    const { repository, calls, job } = directReplyFixture(text); let evaluations = 0;
    const result = await runAssistantJob({ id: job.id, repository, decide: async () => { evaluations++; return decision(); }, generate: async () => ({ text: '二者的比较基准不同。' }) });
    assert.equal(evaluations, text.startsWith('@Quote') ? 0 : 1);
    assert.equal(result.status, 'published'); assert.equal(calls.some(call => call.action === 'participation-skip'), false);
  }
});

test('direct follow-up routing failures fail the job instead of pretending no answer was needed', async () => {
  const { repository, calls, job } = directReplyFixture('谢谢');
  await assert.rejects(runAssistantJob({ id: job.id, repository,
    decide: async () => { throw new AssistantError('ASSISTANT_PARTICIPATION_INVALID', '判断失败', 502); },
    generate: async () => { throw new Error('must not answer after failed routing'); } }), error => error.code === 'ASSISTANT_PARTICIPATION_INVALID');
  assert.equal(calls.at(-1).action, 'fail'); assert.equal(calls.some(call => call.action === 'participation-skip'), false);
});

test('a discussion withdrawn after claim stops before routing or generation and preserves the queued recheck', async () => {
  const calls = [], cancelled = { id: 'job', kind: 'reply', status: 'cancelled', errorCode: 'PARTICIPATION_CHANGED' };
  const repository = { admin: async action => {
    calls.push(action); return action === 'claim' ? { job: { ...cancelled, status: 'running' }, leaseToken: 'lease' } : { job: cancelled, post: null, comments: [] };
  } };
  const result = await runAssistantJob({ id: 'job', repository, decide: async () => { throw new Error('must not judge withdrawn context'); },
    generate: async () => { throw new Error('must not generate withdrawn context'); } });
  assert.equal(result, cancelled); assert.deepEqual(calls, ['claim', 'context']);
});
