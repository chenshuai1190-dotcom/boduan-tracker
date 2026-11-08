// In-memory counterpart for the production unread hook. Imported only from the
// DEV visual shell; no network, storage, credentials or business writes.
export const REVIEW_FEED_PREVIEW_OWNER = 'local-review-journal-preview';

export function createReviewFeedUnreadPreview({ userId = REVIEW_FEED_PREVIEW_OWNER } = {}) {
  let next = 0n, seen = 0n;
  const events = new Map();
  const assertUser = expected => { if (expected !== userId) throw new Error('预览账户不匹配'); };
  const snapshot = () => ({ unreadCount: [...events.values()].filter(event => event.sequence > seen && event.public && event.authorId !== userId && !event.system).length, cursor: next.toString() });
  const publish = (id, { authorId = 'sample-reader', system = false } = {}) => {
    const existing = events.get(id);
    if (existing) existing.public = true;
    else events.set(id, { sequence: ++next, public: true, authorId, system });
    return snapshot();
  };
  // Existing sample cards are treated as arrivals for this explicit QA scenario.
  publish('insight:sample-reader');
  publish('log:sample-market', { authorId: 'sample-market' });
  return {
    publish,
    withdraw(id) { const event = events.get(id); if (event) event.public = false; return snapshot(); },
    db: {
      async fetchReviewFeedUnread(expectedUserId) { assertUser(expectedUserId); return snapshot(); },
      async markReviewFeedSeen(cursor, expectedUserId) {
        assertUser(expectedUserId);
        if (typeof cursor !== 'string' || !/^\d+$/.test(cursor) || BigInt(cursor) > next) throw new Error('预览读取边界无效');
        if (BigInt(cursor) > seen) seen = BigInt(cursor);
        return snapshot();
      },
    },
  };
}
