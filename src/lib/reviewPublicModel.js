import { isReviewJournalDate, reviewJournalError, reviewJournalImagePathBelongsToUser } from './reviewJournalModel.js';
import { normalizeReviewMarketSnapshot } from './reviewMarketSnapshot.js';
import { normalizeCommunityAvatarKey, normalizeCommunityNickname } from './communityProfile.js';
import { normalizeCommunityAvatarPath } from './communityAvatarModel.js';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const uuid = value => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const sourceId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export const isReviewPublicPostId = value => typeof value === 'string' && /^(?:log|insight):[A-Za-z0-9_-]{1,100}$/.test(value);
const timestamp = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && isReviewJournalDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const invalid = () => { throw reviewJournalError('REVIEW_PUBLIC_INVALID_DATA', '公开动态数据暂不可用，请刷新后重试。'); };
const imageMime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function publicImages(value, authorId) {
  if (!Array.isArray(value) || value.length > 4) return invalid();
  return value.map(item => {
    if (!plain(item) || !reviewJournalImagePathBelongsToUser(item.path, authorId)
      || imageMime[item.path.split('.').at(-1).toLowerCase()] !== item.mimeType
      || !Number.isSafeInteger(item.size) || item.size <= 0 || item.size > 10 * 1024 * 1024) return invalid();
    return { path: item.path, name: typeof item.name === 'string' ? item.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) : '图片', mimeType: item.mimeType, size: item.size };
  });
}

/** Public posts are deliberately NOT mapped through the private journal row model.
 * Unknown fields (including replies, account, trades and signed URLs) never escape. */
export function mapReviewPublicPost(value) {
  if (!plain(value) || !['log', 'insight'].includes(value.type) || !sourceId(value.sourceId)
    || value.id !== `${value.type}:${value.sourceId}` || !uuid(value.authorId)
    || !plain(value.author) || typeof value.text !== 'string' || value.text.length > 50000
    || !isReviewJournalDate(value.date) || !timestamp(value.publishedAt) || !timestamp(value.updatedAt)
    || !Array.isArray(value.stocks) || value.stocks.length > 20
    || value.stocks.some(symbol => typeof symbol !== 'string' || !/^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/.test(symbol))
    || !Number.isSafeInteger(value.likeCount) || value.likeCount < 0 || typeof value.liked !== 'boolean') return invalid();
  const market = value.market == null ? null : normalizeReviewMarketSnapshot(value.market);
  // Older private notes may contain legacy market JSON. Drop an invalid optional
  // snapshot without exposing its unknown fields or hiding the valid public post.
  return {
    id: value.id, type: value.type, sourceId: value.sourceId, authorId: value.authorId,
    author: { nickname: normalizeCommunityNickname(value.author.nickname) || 'Quote 用户',
      avatarKey: normalizeCommunityAvatarKey(value.author.avatarKey),
      avatarPath: normalizeCommunityAvatarPath(value.author.avatarPath, value.authorId) },
    text: value.text, date: value.date, stocks: [...new Set(value.stocks)],
    images: publicImages(value.images, value.authorId), market,
    publishedAt: value.publishedAt, updatedAt: value.updatedAt, likeCount: value.likeCount, liked: value.liked,
  };
}

export function normalizeReviewPublicCursor(value) {
  if (value == null) return null;
  if (!plain(value) || !timestamp(value.publishedAt) || !isReviewPublicPostId(value.id)) return invalid();
  return { publishedAt: value.publishedAt, id: value.id };
}

export function mapReviewPublicFeed(value) {
  if (!plain(value) || !Array.isArray(value.posts) || value.posts.length > 50 || typeof value.hasMore !== 'boolean') return invalid();
  const posts = value.posts.map(mapReviewPublicPost), nextCursor = normalizeReviewPublicCursor(value.nextCursor);
  if (new Set(posts.map(post => post.id)).size !== posts.length
    || value.hasMore && (!nextCursor || !posts.length)
    || !value.hasMore && nextCursor != null) return invalid();
  if (nextCursor && (nextCursor.id !== posts.at(-1).id || nextCursor.publishedAt !== posts.at(-1).publishedAt)) return invalid();
  return { posts, hasMore: value.hasMore, nextCursor };
}

export function mapReviewPublicLike(value, expectedPostId) {
  if (!plain(value) || value.postId !== expectedPostId || !isReviewPublicPostId(value.postId)
    || !Number.isSafeInteger(value.likeCount) || value.likeCount < 0 || typeof value.liked !== 'boolean') return invalid();
  return { postId: value.postId, likeCount: value.likeCount, liked: value.liked };
}
