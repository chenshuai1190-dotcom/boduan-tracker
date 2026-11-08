import { isReviewJournalOperationId, reviewJournalError } from './reviewJournalModel.js';
import { normalizeCommunityAvatarPath } from './communityAvatarModel.js';
import { isReviewPublicPostId, mapReviewPublicFeed, mapReviewPublicPost, mapReviewPublicLike, normalizeReviewPublicCursor } from './reviewPublicModel.js';
import { buildReviewCommunityEvaluation, mapReviewCommunityEvaluation, mapReviewCommunityEvaluations, mapReviewCommunityDelete, normalizeReviewCommunityCursor, normalizeReviewCommunityReplyTarget } from './reviewCommunityEvaluationModel.js';

export function reviewPublicError(error) {
  if (['42883', '42P01', '42703', 'PGRST202', 'PGRST204'].includes(error?.code)) {
    return reviewJournalError('REVIEW_PUBLIC_NOT_CONFIGURED', '公开动态尚未配置，请稍后重试；可以先保存为仅自己可见。');
  }
  if (error?.code === 'P0002' || error?.code === '23503') return reviewJournalError('REVIEW_PUBLIC_NOT_FOUND', '这条动态已删除或改为私密。');
  if (error?.code === '42501') return reviewJournalError('REVIEW_PUBLIC_FORBIDDEN', '当前无法访问这条公开动态。');
  return reviewJournalError('REVIEW_PUBLIC_REQUEST_FAILED', '公开动态暂时无法读取，请重试。');
}

function reviewCommunityError(error) {
  if (error?.code === '40001') return reviewJournalError('REVIEW_COMMUNITY_CONFLICT', '评价已被修改，请重新读取后再操作。');
  if (error?.code === '22023') return reviewJournalError('REVIEW_COMMUNITY_INVALID_INPUT', '评价内容无效，请检查后重试。');
  return reviewPublicError(error);
}

/** Do not successfully save "public" into an environment without its read/like
 * migration. The surrounding private repository still owns user/CAS checks. */
export async function assertReviewPublicAvailable(client, expectedUserId) {
  if (typeof expectedUserId !== 'string' || !expectedUserId.trim()) throw reviewJournalError('REVIEW_AUTH_REQUIRED', '请先登录后查看公开动态。');
  if (typeof client?.rpc !== 'function') throw reviewPublicError({ code: 'PGRST202' });
  let result;
  try { result = await client.rpc('fetch_review_public_feed_v2', {
    p_limit: 1, p_before_date: null, p_before: null, p_before_id: null, p_query: '', p_symbol: '', p_expected_user_id: expectedUserId,
  }); } catch { throw reviewPublicError(null); }
  const { data, error } = result || {};
  if (error) throw reviewPublicError(error);
  mapReviewPublicFeed(data);
}

export function createReviewPublicRepository(client) {
  async function authenticate(expectedUserId) {
    if (typeof expectedUserId !== 'string' || !expectedUserId || !client?.auth?.getUser) {
      throw reviewJournalError('REVIEW_AUTH_REQUIRED', '请先登录后查看公开动态。');
    }
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id) throw reviewJournalError('REVIEW_AUTH_REQUIRED', '登录状态已失效，请重新登录。');
    if (data.user.id !== expectedUserId) throw reviewJournalError('REVIEW_ACCOUNT_CHANGED', '账户已切换，请重新打开动态。');
    return data.user;
  }
  async function rpc(name, args, userId, toError = reviewPublicError) {
    await authenticate(userId);
    if (typeof client?.rpc !== 'function') throw reviewPublicError({ code: 'PGRST202' });
    let result;
    // The server checks this against the request JWT before reading or mutating.
    // Local getUser checks alone cannot prevent a shared client switching accounts
    // in the gap before an RPC is sent (or switching away and back afterwards).
    try { result = await client.rpc(name, { ...args, p_expected_user_id: userId }); }
    catch { result = { error: { code: 'NETWORK_ERROR' } }; }
    await authenticate(userId);
    if (!result || result.error) throw toError(result?.error);
    return result.data;
  }
  async function fetchFeed(options = {}, userId) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw reviewJournalError('REVIEW_PUBLIC_INVALID_QUERY', '动态筛选条件无效，请重新选择。');
    const cursor = normalizeReviewPublicCursor(options.cursor);
    const limit = options.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50
      || options.query != null && (typeof options.query !== 'string' || options.query.length > 200)
      || options.symbol != null && options.symbol !== '' && (typeof options.symbol !== 'string' || !/^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/.test(options.symbol))) {
      throw reviewJournalError('REVIEW_PUBLIC_INVALID_QUERY', '动态筛选条件无效，请重新选择。');
    }
    return mapReviewPublicFeed(await rpc('fetch_review_public_feed_v2', { p_limit: limit,
      p_before_date: cursor?.recordDate || null, p_before: cursor?.publishedAt || null, p_before_id: cursor?.id || null,
      p_query: options.query?.trim() || '', p_symbol: options.symbol || '' }, userId));
  }
  async function fetchPost(id, userId) {
    if (!isReviewPublicPostId(id)) throw reviewJournalError('REVIEW_PUBLIC_INVALID_ID', '动态标识无效。');
    const data = await rpc('read_review_public_post', { p_post_id: id }, userId);
    if (data == null) return null;
    const post = mapReviewPublicPost(data);
    if (post.id !== id) throw reviewJournalError('REVIEW_PUBLIC_INVALID_DATA', '公开动态不匹配，请刷新后重试。');
    return post;
  }
  async function setLike(id, liked, userId) {
    if (!isReviewPublicPostId(id) || typeof liked !== 'boolean') throw reviewJournalError('REVIEW_PUBLIC_INVALID_LIKE', '点赞状态无效，请重试。');
    return mapReviewPublicLike(await rpc('set_review_public_like', { p_post_id: id, p_liked: liked }, userId), id);
  }
  const validatePost = postId => {
    if (!isReviewPublicPostId(postId)) throw reviewJournalError('REVIEW_PUBLIC_INVALID_ID', '动态标识无效。');
  };
  const validateEvaluation = (reply, allowCreate = false) => {
    if (!isReviewJournalOperationId(reply?.id) || !Number.isSafeInteger(reply.revision ?? 0)
      || (reply.revision ?? 0) < (allowCreate ? 0 : 1) || reply.revision > 2147483646) throw reviewJournalError('REVIEW_INVALID_REPLY', '评价标识或版本无效，请重新读取。');
  };
  async function fetchEvaluations(options, userId) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw reviewJournalError('REVIEW_PUBLIC_INVALID_QUERY', '评价筛选条件无效。');
    validatePost(options.postId);
    const limit = options.limit ?? 20, cursor = normalizeReviewCommunityCursor(options.cursor);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw reviewJournalError('REVIEW_PUBLIC_INVALID_QUERY', '评价分页范围无效。');
    return mapReviewCommunityEvaluations(await rpc('fetch_review_community_evaluations', { p_post_id: options.postId, p_limit: limit,
      p_before: cursor?.createdAt || null, p_before_id: cursor?.id || null }, userId, reviewCommunityError), options.postId);
  }
  async function saveEvaluation(postId, reply, userId) {
    validatePost(postId); validateEvaluation(reply, true);
    const payload = buildReviewCommunityEvaluation(reply, userId), replyTo = normalizeReviewCommunityReplyTarget(reply.replyTo);
    const result = mapReviewCommunityEvaluation(await rpc('save_review_community_evaluation_v2', { p_post_id: postId,
      p_evaluation_id: reply.id, p_expected_revision: reply.revision ?? 0, p_evaluation: payload, p_reply_to: replyTo }, userId, reviewCommunityError), postId);
    if (result.id !== reply.id || result.authorId !== userId) throw reviewJournalError('REVIEW_COMMUNITY_INVALID_DATA', '保存的评价与当前账户不匹配，请重新读取。');
    if ((replyTo || !(reply.revision > 0)) && JSON.stringify(normalizeReviewCommunityReplyTarget(result.replyTo)) !== JSON.stringify(replyTo)) {
      throw reviewJournalError('REVIEW_COMMUNITY_INVALID_DATA', '保存的回复对象不匹配，请重新读取。');
    }
    return result;
  }
  async function deleteEvaluation(postId, reply, userId) {
    validatePost(postId); validateEvaluation(reply);
    return mapReviewCommunityDelete(await rpc('delete_review_community_evaluation', { p_post_id: postId,
      p_evaluation_id: reply.id, p_expected_revision: reply.revision }, userId, reviewCommunityError), postId, reply.id);
  }
  async function download(path, bucket, maxBytes, userId) {
    if (!normalizeCommunityAvatarPath(path)) throw reviewJournalError('REVIEW_INVALID_IMAGE', '图片引用无效。');
    await authenticate(userId);
    if (!client.storage?.from) throw reviewJournalError('REVIEW_STORAGE_NOT_CONFIGURED', '图片存储暂不可用。');
    let result;
    try { result = await client.storage.from(bucket).download(path); }
    catch { result = { error: true }; }
    await authenticate(userId);
    if (!result || result.error) throw reviewJournalError('REVIEW_PUBLIC_IMAGE_UNAVAILABLE', '图片已移除或暂时不可用。');
    const data = result.data;
    if (!(data instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(data.type)
      || data.size <= 0 || data.size > maxBytes) throw reviewJournalError('REVIEW_PUBLIC_IMAGE_UNAVAILABLE', '图片格式无效或暂时不可用。');
    return data;
  }
  return { fetchFeed, fetchPost, setLike, fetchEvaluations, saveEvaluation, deleteEvaluation,
    downloadImage: (path, userId) => download(path, 'review-journal-images', 10 * 1024 * 1024, userId),
    downloadAvatar: (path, userId) => download(path, 'community-avatars', 2 * 1024 * 1024, userId) };
}
