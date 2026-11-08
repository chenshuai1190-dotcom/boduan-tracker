import { isReviewJournalDate, isReviewJournalOperationId, reviewJournalError } from './reviewJournalModel.js';
import { isReviewPublicPostId } from './reviewPublicModel.js';
import { mapReviewCommunityEvaluation } from './reviewCommunityEvaluationModel.js';
import { normalizeCommunityNickname, normalizeCommunityAvatarKey } from './communityProfile.js';
import { normalizeCommunityAvatarPath } from './communityAvatarModel.js';

export const REVIEW_NOTIFICATION_FILTERS = Object.freeze(['all', 'comments', 'likes', 'ratings']);
const KINDS = new Set(['like', 'comment', 'rating', 'reply']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const timestamp = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && isReviewJournalDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const excerpt = value => typeof value === 'string' && Array.from(value).length <= 160;
const invalid = () => { throw reviewJournalError('REVIEW_NOTIFICATION_INVALID_DATA', '消息数据暂不可用，请刷新后重试。'); };
const uuid = value => isReviewJournalOperationId(value) ? value.toLowerCase() : invalid();

export function normalizeReviewNotificationCursor(value) {
  if (value == null) return null;
  if (!plain(value) || !timestamp(value.createdAt)) return invalid();
  return { createdAt: value.createdAt, id: uuid(value.id) };
}

export function mapReviewNotification(value) {
  if (!plain(value) || !KINDS.has(value.kind) || !isReviewPublicPostId(value.postId) || !plain(value.actor)
    || !timestamp(value.createdAt) || value.readAt !== null && !timestamp(value.readAt)
    || value.score !== null && (!Number.isInteger(value.score) || value.score < 1 || value.score > 10)
    || !excerpt(value.excerpt) || !excerpt(value.postExcerpt)) return invalid();
  const actorId = uuid(value.actorId);
  return { id: uuid(value.id), kind: value.kind, postId: value.postId,
    commentId: value.commentId === null ? null : uuid(value.commentId), actorId,
    actor: { nickname: normalizeCommunityNickname(value.actor.nickname) || 'Quote 用户',
      avatarKey: normalizeCommunityAvatarKey(value.actor.avatarKey),
      avatarPath: normalizeCommunityAvatarPath(value.actor.avatarPath, actorId),
      ...(value.actor.isAssistant === true ? { isAssistant: true } : {}) },
    createdAt: value.createdAt, readAt: value.readAt, score: value.score, excerpt: value.excerpt, postExcerpt: value.postExcerpt };
}

export function mapReviewNotificationCount(value) {
  if (!plain(value) || !Number.isSafeInteger(value.unreadCount) || value.unreadCount < 0) return invalid();
  return { unreadCount: value.unreadCount };
}

export function mapReviewNotificationsPage(value, limit = 20) {
  if (!plain(value) || !Array.isArray(value.notifications) || value.notifications.length > limit
    || value.notifications.length > 20 || typeof value.hasMore !== 'boolean') return invalid();
  const notifications = value.notifications.map(mapReviewNotification), nextCursor = normalizeReviewNotificationCursor(value.nextCursor);
  if (new Set(notifications.map(item => item.id)).size !== notifications.length
    || value.hasMore && (!notifications.length || !nextCursor)
    || !value.hasMore && nextCursor !== null
    || nextCursor && (nextCursor.id !== notifications.at(-1).id || nextCursor.createdAt !== notifications.at(-1).createdAt)) return invalid();
  return { notifications, hasMore: value.hasMore, nextCursor, ...mapReviewNotificationCount(value) };
}

/** The target is re-resolved by the server against current post permissions.
 * Notification excerpts and stale client rows are never used to rebuild it. */
export function mapReviewNotificationTarget(value, expectedNotificationId) {
  if (!plain(value) || uuid(value.notificationId) !== uuid(expectedNotificationId) || !isReviewPublicPostId(value.postId)) return invalid();
  const commentId = value.commentId === null ? null : uuid(value.commentId);
  let evaluation = null;
  if (value.evaluation !== null) {
    try { evaluation = mapReviewCommunityEvaluation(value.evaluation, value.postId); } catch { return invalid(); }
    if (!commentId || evaluation.id.toLowerCase() !== commentId) return invalid();
  }
  return { notificationId: uuid(value.notificationId), postId: value.postId, commentId, evaluation };
}
