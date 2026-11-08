// In-memory samples only. Imported exclusively by the DEV activity preview.
export function createReviewNotificationPreview({ ownerId, samples, evaluations, posts, readEvaluation, assertOwner }) {
  const now = Date.now(), at = minutes => new Date(now - minutes * 60000).toISOString();
  const postId = 'log:notification-example';
  samples.push({ id: postId, type: 'log', sourceId: 'notification-example', authorId: ownerId,
    author: { nickname: '波段玩家1836', avatarKey: 'gold', avatarPath: null },
    date: at(180).slice(0, 10), publishedAt: at(180), updatedAt: at(2),
    text: '示例复盘：先记录判断，再回头检查执行。欢迎交流你观察到的风险和变化。我们会把买入理由、仓位安排和失效条件一起写清楚，后续按照同一口径回看。一次涨跌并不能验证整个判断，持续记录才便于发现执行中的偏差。', stocks: [], images: [], market: null, replies: [], likeCount: 1, liked: false });
  const actors = [{ nickname: '山间慢行', avatarKey: 'green', avatarPath: null }, { nickname: '记录每一步', avatarKey: 'blue', avatarPath: null }];
  const items = ['reply', 'comment', 'like', 'rating'].map((kind, index) => {
    const id = `00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
    const commentId = kind === 'like' ? null : `10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
    const actor = actors[index%2], actorId = `sample-notifier-${index%2}`, createdAt = at([2, 37, 125, 1620][index]);
    const text = ['同意，先把买入理由写清楚，下次复盘就更有依据了。也希望用可复核的长期记录判断策略是否有效，回看时区分事实、推测与执行结果。把失效条件提前写下来，后续讨论才能围绕当时的信息展开。', '我也在关注这个问题，期待你后续的观察。', '', '复盘很完整，尤其是对仓位和执行节奏的总结。'][index];
    if (commentId) evaluations.set(commentId, { id: commentId, postId, authorId: actorId, author: actor, createdAt, updatedAt: createdAt, date: createdAt.slice(0, 10),
      score: kind==='rating'?8:null, tags: [], text, images: [], stocks: [], trades: [], market: null, account: null, mood: '', revision: 1, source: 'community', replyTo: null });
    return { id, postId, commentId, kind, actorId, actor, createdAt, readAt: index===3?at(60):null, score: kind==='rating'?8:null, excerpt: text, postExcerpt: samples.at(-1).text };
  });
  const visible = () => items.filter(item => posts().some(post => post.id===item.postId) && (!item.commentId || evaluations.has(item.commentId)));
  const count = () => ({ unreadCount: visible().filter(item=>!item.readAt).length });
  return {
    async fetchReviewNotificationCount(userId) { assertOwner(userId); return count(); },
    async fetchReviewNotifications({filter='all',limit=20,cursor=null}={},userId) {
      assertOwner(userId);
      const rows=visible().filter(item=>(filter==='all'||filter==='comments'&&['comment','reply'].includes(item.kind)||filter==='likes'&&item.kind==='like'||filter==='ratings'&&item.kind==='rating')&&(!cursor||item.createdAt<cursor.createdAt||item.createdAt===cursor.createdAt&&item.id<cursor.id));
      const notifications=rows.slice(0,limit).map(item=>({...item})), last=notifications.at(-1),hasMore=rows.length>limit;
      return { notifications, hasMore, nextCursor:hasMore?{createdAt:last.createdAt,id:last.id}:null,...count() };
    },
    async markReviewNotificationsRead({ids=null,before=null},userId) {
      assertOwner(userId);
      for(const item of visible()) if(ids?ids.includes(item.id):before&&(item.createdAt<before.createdAt||item.createdAt===before.createdAt&&item.id<=before.id)) item.readAt ||= new Date().toISOString();
      return count();
    },
    async readReviewNotificationTarget(id,userId) {
      assertOwner(userId);const item=visible().find(row=>row.id===id);
      if(!item)throw Object.assign(new Error('这条消息已不可用。'),{code:'REVIEW_NOTIFICATION_NOT_FOUND'});
      return { notificationId:id, postId:item.postId, commentId:item.commentId, evaluation:item.commentId?readEvaluation(evaluations.get(item.commentId)):null };
    },
  };
}
