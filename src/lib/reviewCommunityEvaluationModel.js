import { buildReviewJournalWrite, isReviewJournalDate, isReviewJournalOperationId, reviewJournalError } from './reviewJournalModel.js';
import { isReviewPublicPostId, mapReviewPublicReplies } from './reviewPublicModel.js';
import { normalizeCommunityAvatarKey, normalizeCommunityNickname } from './communityProfile.js';
import { normalizeCommunityAvatarPath } from './communityAvatarModel.js';
import { normalizeReviewMarketSnapshot } from './reviewMarketSnapshot.js';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const timestamp = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && isReviewJournalDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const invalid = () => { throw reviewJournalError('REVIEW_COMMUNITY_INVALID_DATA', '评价数据暂不可用，请刷新后重试。'); };

/** The client supplies only a same-post target key. Its author and current
 * availability are server-owned; a reply never copies the target's content. */
export function normalizeReviewCommunityReplyTarget(value) {
  if (value == null) return null;
  const id = typeof value?.id === 'string' ? value.id.trim() : '';
  if (!plain(value) || !['author', 'community'].includes(value.kind) || !id || id.length > 100
    || /[\u0000-\u001f\u007f]/.test(id) || value.kind === 'community' && !isReviewJournalOperationId(id)) {
    throw reviewJournalError('REVIEW_INVALID_REPLY_TARGET', '回复对象无效，请重新打开评论。');
  }
  return { kind: value.kind, id: value.kind === 'community' ? id.toLowerCase() : id };
}

export function mapReviewCommunityReplyTarget(value) {
  if (value == null) return null;
  let target;
  try { target = normalizeReviewCommunityReplyTarget(value); } catch { return invalid(); }
  if (!isReviewJournalOperationId(value.authorId) || typeof value.available !== 'boolean') return invalid();
  return { ...target, authorId: value.authorId, nickname: normalizeCommunityNickname(value.nickname) || 'Quote 用户', available: value.available };
}

/** Validate the reviewer's saved values, then rebuild the public attachment
 * allowlist. No original post, live account data, author identity or internal
 * snapshot evidence can be carried through this write payload. */
export function buildReviewCommunityEvaluation(reply, userId) {
  if (!plain(reply) || !isReviewJournalOperationId(reply.id)) {
    throw reviewJournalError('REVIEW_INVALID_REPLY', '评价标识无效，请重新打开评价窗口。');
  }
  if (reply.market != null && !normalizeReviewMarketSnapshot(reply.market)) {
    throw reviewJournalError('REVIEW_INVALID_MARKET', '市场快照格式无效，请重新选择。');
  }
  const normalized = buildReviewJournalWrite({ type: 'log', date: reply.date, text: '评价', replies: [reply] }, userId).review_data.replies[0];
  const safe = mapReviewPublicReplies([normalized], userId)[0];
  if (!safe) throw reviewJournalError('REVIEW_EMPTY_REPLY', '请添加文字、评分、标签或附件。');
  const { createdAt: discarded, ...payload } = safe;
  return payload;
}

export function mapReviewCommunityEvaluation(value, expectedPostId) {
  if (!plain(value) || !isReviewJournalOperationId(value.id) || !isReviewPublicPostId(value.postId)
    || value.postId !== expectedPostId || !isReviewJournalOperationId(value.authorId) || !plain(value.author)
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !timestamp(value.createdAt) || !timestamp(value.updatedAt)) return invalid();
  let payload;
  try { payload = buildReviewCommunityEvaluation(value, value.authorId); } catch { return invalid(); }
  return { ...payload, postId: value.postId, authorId: value.authorId,
    author: { nickname: normalizeCommunityNickname(value.author.nickname) || 'Quote 用户',
      avatarKey: normalizeCommunityAvatarKey(value.author.avatarKey),
      avatarPath: normalizeCommunityAvatarPath(value.author.avatarPath, value.authorId),
      ...(value.author.isAssistant === true ? { isAssistant: true } : {}) },
    revision: value.revision, createdAt: value.createdAt, updatedAt: value.updatedAt, source: 'community', replyTo: mapReviewCommunityReplyTarget(value.replyTo) };
}

export function normalizeReviewCommunityCursor(value) {
  if (value == null) return null;
  if (!plain(value) || !timestamp(value.createdAt) || !isReviewJournalOperationId(value.id)) return invalid();
  return { createdAt: value.createdAt, id: value.id };
}

export function mapReviewCommunityEvaluations(value, postId) {
  if (!plain(value) || !Array.isArray(value.evaluations) || value.evaluations.length > 20
    || typeof value.hasMore !== 'boolean' || !Number.isSafeInteger(value.totalCount) || value.totalCount < value.evaluations.length) return invalid();
  const evaluations = value.evaluations.map(item => mapReviewCommunityEvaluation(item, postId));
  const nextCursor = normalizeReviewCommunityCursor(value.nextCursor);
  if (new Set(evaluations.map(item => item.id)).size !== evaluations.length
    || value.hasMore && (!nextCursor || !evaluations.length)
    || !value.hasMore && nextCursor != null
    || nextCursor && (nextCursor.id !== evaluations.at(-1).id || nextCursor.createdAt !== evaluations.at(-1).createdAt)) return invalid();
  return { evaluations, hasMore: value.hasMore, nextCursor, totalCount: value.totalCount };
}

export function mapReviewCommunityDelete(value, postId, id) {
  if (!plain(value) || value.postId !== postId || value.id !== id || value.deleted !== true) return invalid();
  return { id, postId, deleted: true };
}
