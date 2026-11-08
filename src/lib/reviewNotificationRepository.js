import { isReviewJournalOperationId, reviewJournalError } from './reviewJournalModel.js';
import { createReviewSessionGuard } from './reviewSessionGuard.js';
import { REVIEW_NOTIFICATION_FILTERS, normalizeReviewNotificationCursor, mapReviewNotificationsPage,
  mapReviewNotificationCount, mapReviewNotificationTarget } from './reviewNotificationModel.js';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const invalidQuery = () => { throw reviewJournalError('REVIEW_NOTIFICATION_INVALID_QUERY', '消息操作参数无效，请刷新后重试。'); };

export function reviewNotificationError(error) {
  if (['42883', '42P01', '42703', 'PGRST202', 'PGRST204'].includes(error?.code)) {
    return reviewJournalError('REVIEW_NOTIFICATION_NOT_CONFIGURED', '消息功能尚未配置，请稍后重试。');
  }
  if (error?.code === 'P0002' || error?.code === '23503') return reviewJournalError('REVIEW_NOTIFICATION_NOT_FOUND', '这条消息对应的内容已删除或不再可见。');
  if (error?.code === '42501') return reviewJournalError('REVIEW_NOTIFICATION_FORBIDDEN', '当前无法访问这条消息，请刷新后重试。');
  if (error?.code === '22023') return reviewJournalError('REVIEW_NOTIFICATION_INVALID_QUERY', '消息操作参数无效，请刷新后重试。');
  return reviewJournalError('REVIEW_NOTIFICATION_REQUEST_FAILED', '消息暂时无法读取，请重试。');
}

/** The local guard prevents stale account results; every RPC still authorizes
 * the authenticated JWT, expected account, recipient and current visibility. */
export function createReviewNotificationRepository(client) {
  const sessionGuard = createReviewSessionGuard(client, {
    isValidUserId: isReviewJournalOperationId,
    requestError: () => reviewNotificationError(null),
  });
  async function rpc(name, args, userId) {
    const session = await sessionGuard.begin(userId);
    if (typeof client?.rpc !== 'function') throw reviewNotificationError({ code: 'PGRST202' });
    sessionGuard.assertCurrent(session);
    let result;
    try { result = await client.rpc(name, { ...args, p_expected_user_id: userId }); }
    catch { result = { error: { code: 'NETWORK_ERROR' } }; }
    await sessionGuard.verify(session);
    if (!result || result.error) throw reviewNotificationError(result?.error);
    return result.data;
  }
  async function fetchNotifications(options = {}, userId) {
    if (!plain(options)) return invalidQuery();
    const limit = options.limit ?? 20, filter = options.filter ?? 'all';
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20 || !REVIEW_NOTIFICATION_FILTERS.includes(filter)) return invalidQuery();
    const cursor = normalizeReviewNotificationCursor(options.cursor);
    return mapReviewNotificationsPage(await rpc('fetch_review_activity_notifications', { p_limit: limit,
      p_before: cursor?.createdAt || null, p_before_id: cursor?.id || null, p_filter: filter }, userId), limit);
  }
  async function fetchCount(userId) {
    return mapReviewNotificationCount(await rpc('fetch_review_activity_notification_count', {}, userId));
  }
  async function markRead(options, userId) {
    if (!plain(options)) return invalidQuery();
    let ids = null, before = null;
    if (options.ids != null) {
      if (!Array.isArray(options.ids) || !options.ids.length || options.ids.length > 100
        || options.ids.some(id => !isReviewJournalOperationId(id)) || options.before != null) return invalidQuery();
      ids = [...new Set(options.ids.map(id => id.toLowerCase()))];
    } else {
      before = normalizeReviewNotificationCursor(options.before);
      if (!before) return invalidQuery();
    }
    return mapReviewNotificationCount(await rpc('mark_review_activity_notifications_read', {
      p_ids: ids, p_before: before?.createdAt || null, p_before_id: before?.id || null }, userId));
  }
  async function readTarget(id, userId) {
    if (!isReviewJournalOperationId(id)) throw reviewJournalError('REVIEW_NOTIFICATION_INVALID_ID', '消息标识无效，请重新打开消息。');
    const notificationId = id.toLowerCase();
    const value = await rpc('read_review_activity_notification_target', { p_notification_id: notificationId }, userId);
    if (value === null) throw reviewNotificationError({ code: 'P0002' });
    return mapReviewNotificationTarget(value, notificationId);
  }
  return { fetchNotifications, fetchCount, markRead, readTarget };
}
