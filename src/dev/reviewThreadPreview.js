// Explicit DEV-only in-memory adapter for the shared production thread UI.
import { compareReviewCommentTime, reviewCommentKey } from '../lib/reviewCommentThreads.js';

export function createReviewThreadPreview({ ownerId, getEntries, getCommunityRows, getDeletedRows, sourceParent, assertParent, assertOwner }) {
  const reactions = new Map();
  const parent = postId => {
    const own = getEntries().find(entry => `${entry.type}:${entry.id}` === postId);
    if (own) return { ...own, authorId: ownerId, author: { nickname: '波段玩家1836', avatarKey: 'gold', avatarPath: null } };
    assertParent(postId);
    return sourceParent(postId);
  };
  const data = postId => {
    const post = parent(postId);
    const authorRows = (post?.replies || []).map(reply => ({ ...reply, postId, kind: 'author', source: 'author', authorId: post.authorId, author: post.author,
      createdAt: reply.createdAt || null, sortCreatedAt: reply.sortCreatedAt || reply.createdAt || `${reply.date}T04:00:00Z`, replyTo: null, deleted: false }));
    const community = getCommunityRows(postId).map(reply => ({ ...reply, kind: 'community', source: 'community', deleted: false }));
    const deleted = getDeletedRows(postId).map(reply => ({ ...reply, kind: 'community', source: 'community', deleted: true, text: '', images: [], trades: [], market: null, account: null, score: null, tags: [] }));
    const rows = [...authorRows, ...community, ...deleted], byKey = new Map(rows.map(row => [reviewCommentKey(row), row]));
    const rootFor = row => {
      const seen = new Set(); let current = row;
      while (current.replyTo) {
        const key = reviewCommentKey(current.replyTo);
        if (seen.has(key)) break;
        seen.add(key);
        const target = byKey.get(key);
        if (!target) {
          const missing = { id: current.replyTo.id, kind: current.replyTo.kind, source: current.replyTo.kind, authorId: current.replyTo.authorId,
            author: { nickname: current.replyTo.nickname || 'Quote 用户', avatarKey: 'gold' }, createdAt: current.createdAt, date: current.date, deleted: true, replyTo: null };
          byKey.set(key, missing); return missing;
        }
        current = target;
      }
      return current;
    };
    const groups = new Map();
    for (const row of [...authorRows, ...community]) {
      const root = rootFor(row), key = reviewCommentKey(root);
      if (!groups.has(key)) groups.set(key, { root, replies: [] });
      if (reviewCommentKey(row) !== key) groups.get(key).replies.push(row);
    }
    const decorate = row => {
      const liked = reactions.get(`${postId}:${reviewCommentKey(row)}`) === true;
      return { ...row, likeCount: (row.likeCount || 0) + (liked ? 1 : 0), liked,
        directReplyCount: community.filter(reply => reviewCommentKey(reply.replyTo) === reviewCommentKey(row)).length };
    };
    const threads = [...groups.values()].map(group => ({ root: decorate(group.root), replies: group.replies.map(decorate).sort(compareReviewCommentTime), replyCount: group.replies.length }))
      .sort((left, right) => compareReviewCommentTime(right.root, left.root));
    return { threads, totalCount: authorRows.length + community.length, communityCount: community.length, byKey, decorate };
  };
  const cursorFor = row => ({ createdAt: row.sortCreatedAt || row.createdAt, id: row.id, kind: row.kind });
  return {
    async fetchReviewCommentThreads({ postId, limit = 20, cursor = null, locate = null }, userId) {
      assertOwner(userId); const all = data(postId);
      let matching = all.threads;
      if (locate) matching = matching.filter(thread => reviewCommentKey(thread.root) === reviewCommentKey(locate) || thread.replies.some(reply => reviewCommentKey(reply) === reviewCommentKey(locate)));
      else if (cursor) matching = matching.filter(thread => compareReviewCommentTime(thread.root, cursor) < 0);
      const selected = matching.slice(0, limit), hasMore = !locate && matching.length > selected.length;
      return { threads: selected.map(({ root, replyCount, replies }) => ({ root, replyCount, previewReply: replies[0] || null })), totalCount: all.totalCount, communityCount: all.communityCount,
        hasMore, nextCursor: hasMore ? cursorFor(selected.at(-1).root) : null };
    },
    async fetchReviewCommentThreadReplies({ postId, root, limit = 50, cursor = null, locate = null }, userId) {
      assertOwner(userId); const all = data(postId), thread = all.threads.find(item => reviewCommentKey(item.root) === reviewCommentKey(root));
      if (!thread) throw new Error('这条评论已不可用。');
      const located = locate && thread.replies.find(row => reviewCommentKey(row) === reviewCommentKey(locate));
      const matching = thread.replies.filter(row => (!cursor || compareReviewCommentTime(row, cursor) > 0) && (!locate || located && compareReviewCommentTime(row, located) >= 0));
      const replies = matching.slice(0, limit), hasMore = matching.length > replies.length;
      return { replies, replyCount: thread.replyCount, hasMore, nextCursor: hasMore ? cursorFor(replies.at(-1)) : null };
    },
    async fetchReviewEvaluationLikes({ postId, targets }, userId) {
      assertOwner(userId); const all = data(postId);
      return { likes: targets.map(target => { const row = all.byKey.get(reviewCommentKey(target)); if (!row || row.deleted) throw new Error('这条评论已不可用。'); const value = all.decorate(row); return { ...target, likeCount: value.likeCount, liked: value.liked }; }) };
    },
    async setReviewEvaluationLike(postId, target, liked, userId) {
      assertOwner(userId); const all = data(postId), row = all.byKey.get(reviewCommentKey(target));
      if (!row || row.deleted) throw new Error('这条评论已不可用。');
      reactions.set(`${postId}:${reviewCommentKey(target)}`, liked === true);
      const value = all.decorate(row); return { ...target, likeCount: value.likeCount, liked: value.liked };
    },
  };
}
