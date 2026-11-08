import { isReviewJournalDate, isReviewJournalOperationId, reviewJournalError } from './reviewJournalModel.js';
import { isReviewPublicPostId, mapReviewPublicReplies } from './reviewPublicModel.js';
import { mapReviewCommunityEvaluation, normalizeReviewCommunityReplyTarget } from './reviewCommunityEvaluationModel.js';
import { normalizeCommunityAvatarKey, normalizeCommunityNickname } from './communityProfile.js';
import { normalizeCommunityAvatarPath } from './communityAvatarModel.js';

export const isReviewInteractionObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && isReviewJournalDate(value.slice(0,10)) && Number.isFinite(Date.parse(value));
const count = value => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw reviewJournalError('REVIEW_INTERACTION_INVALID_DATA', '评论数据暂不可用，请重新读取。'); };
export const reviewCommentKey = target => `${target.kind}:${target.id}`;
export function normalizeReviewCommentTarget(value) {
  if (!isReviewInteractionObject(value)) return invalid();
  return normalizeReviewCommunityReplyTarget(value);
}
export function normalizeReviewCommentCursor(value) {
  if (value == null) return null;
  const target = normalizeReviewCommentTarget(value);
  if (!timestamp(value.createdAt)) return invalid();
  return { ...target, createdAt: value.createdAt };
}
export function normalizeReviewFeedCursor(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value) || BigInt(value) > 9223372036854775807n) return invalid();
  return value;
}
export function mapReviewFeedUnread(value) {
  if (!isReviewInteractionObject(value) || !count(value.unreadCount)) return invalid();
  return { unreadCount: value.unreadCount, cursor: normalizeReviewFeedCursor(value.cursor) };
}
export function mapReviewEvaluationLike(value, expectedTarget) {
  const target = normalizeReviewCommentTarget(value);
  if (expectedTarget && reviewCommentKey(target) !== reviewCommentKey(expectedTarget)
    || !count(value.likeCount) || typeof value.liked !== 'boolean' || value.liked && value.likeCount < 1) return invalid();
  return { ...target, likeCount: value.likeCount, liked: value.liked };
}
export function mapReviewEvaluationLikes(value, targets) {
  if (!isReviewInteractionObject(value) || !Array.isArray(value.likes) || value.likes.length !== targets.length) return invalid();
  return { likes: value.likes.map((item,index) => mapReviewEvaluationLike(item, targets[index])) };
}
export function mapReviewThreadComment(value, postId) {
  if (!isReviewInteractionObject(value) || value.postId !== postId || !isReviewPublicPostId(postId)
    || !isReviewJournalOperationId(value.authorId) || !isReviewInteractionObject(value.author)
    || !timestamp(value.sortCreatedAt) || value.createdAt != null && !timestamp(value.createdAt) || typeof value.deleted !== 'boolean' || !count(value.directReplyCount)) return invalid();
  const target = normalizeReviewCommentTarget(value), reaction = mapReviewEvaluationLike(value);
  const author = { nickname: normalizeCommunityNickname(value.author.nickname) || 'Quote 用户',
    avatarKey: normalizeCommunityAvatarKey(value.author.avatarKey), avatarPath: normalizeCommunityAvatarPath(value.author.avatarPath,value.authorId) };
  let payload;
  if (value.deleted) payload = { date: value.sortCreatedAt.slice(0,10), text:'', score:null, tags:[],images:[],stocks:[],trades:[],market:null,account:null,mood:'',replyTo:null };
  else if (value.kind === 'community') payload = mapReviewCommunityEvaluation(value,postId);
  else { payload = mapReviewPublicReplies([value],value.authorId)[0]; if (!payload) return invalid(); }
  return { ...payload,...target,...reaction,postId,source:target.kind,authorId:value.authorId,author,
    createdAt:value.createdAt??null,sortCreatedAt:value.sortCreatedAt,deleted:value.deleted,directReplyCount:value.directReplyCount };
}
function page(value,items,limit) {
  if (typeof value.hasMore !== 'boolean' || items.length>limit || new Set(items.map(reviewCommentKey)).size!==items.length) return invalid();
  const cursor = normalizeReviewCommentCursor(value.nextCursor);
  if (value.hasMore && (!cursor || !items.length) || !value.hasMore && cursor !== null) return invalid();
  if (cursor) { const last=items.at(-1); if (reviewCommentKey(cursor)!==reviewCommentKey(last)||cursor.createdAt!==last.sortCreatedAt) return invalid(); }
  return {hasMore:value.hasMore,nextCursor:cursor};
}
export function mapReviewCommentThreads(value,postId,limit=20) {
  if (!isReviewInteractionObject(value)||!Array.isArray(value.threads)||!count(value.totalCount)||!count(value.communityCount)||value.communityCount>value.totalCount) return invalid();
  const threads=value.threads.map(item=>{
    if (!isReviewInteractionObject(item)||!count(item.replyCount)) return invalid();
    return {root:mapReviewThreadComment(item.root,postId),replyCount:item.replyCount};
  });
  return {threads,totalCount:value.totalCount,communityCount:value.communityCount,...page(value,threads.map(item=>item.root),limit)};
}
export function mapReviewCommentThreadReplies(value,postId,limit=50) {
  if (!isReviewInteractionObject(value)||!Array.isArray(value.replies)||!count(value.replyCount)) return invalid();
  const replies=value.replies.map(item=>mapReviewThreadComment(item,postId));
  return {replies,replyCount:value.replyCount,...page(value,replies,limit)};
}
