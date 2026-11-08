// Isolated sample data for DevVisualPreview. No network or account writes.
import { mapReviewPublicReplies, normalizeReviewPublicCursor } from '../lib/reviewPublicModel.js';
import { buildReviewCommunityEvaluation, normalizeReviewCommunityCursor, normalizeReviewCommunityReplyTarget } from '../lib/reviewCommunityEvaluationModel.js';
import { isReviewJournalOperationId, reviewJournalError } from '../lib/reviewJournalModel.js';

export function reviewPreviewEntryTimestamps(entry, existing, now = new Date().toISOString()) {
  const createdAt = existing?.createdAt || entry.createdAt || (existing ? `${existing.date}T04:00:00Z` : now);
  return { createdAt, publishedAt: entry.visibility === 'public' ? createdAt : null };
}

export function createReviewPublicPreview({ ownerId, getEntries, getImage, market, communityEvaluations = [] }) {
  const likes = new Map();
  const evaluations = new Map(communityEvaluations.map(row => [row.id, { ...row, source: 'community' }]));
  const deletedEvaluations = new Map();
  const sampleVisibility = new Map();
  let refreshScenario = '';
  const exampleAccount = { version:1,kind:'account_snapshot',asOfDate:'2026-11-06',recordDate:'2026-11-05',basis:'close',source:'pnl_report',
    items:[['cumulativeReturnPct',12.5],['yearPeakReturnPct',22.5],['declineFromYearPeakPp',10],['dailyReturnPct',-1.82],['leverage',1.28]].map(([key,value])=>({key,value,asOfDate:'2026-11-06',basis:'close',source:'pnl_report',...(['yearPeakReturnPct','declineFromYearPeakPp'].includes(key)?{peakDate:'2026-10-23'}:{})})) };
  const samples = [
    { id:'insight:sample-reader',type:'insight',sourceId:'sample-reader',authorId:'sample-reader',author:{nickname:'山间慢行',avatarKey:'green',avatarPath:null},text:'给自己的交易留一点耐心。先写下理由，再决定是否行动。\n\n最近在观察 $QQQ，也欢迎分享你的复盘方法。',date:'2026-11-06',stocks:['QQQ'],images:[],market:null,publishedAt:'2026-11-07T03:00:00Z',updatedAt:'2026-11-07T03:00:00Z',likeCount:12,liked:false },
    { id:'log:sample-market',type:'log',sourceId:'sample-market',authorId:'sample-market',author:{nickname:'记录每一步',avatarKey:'blue',avatarPath:null},text:'留下一张当时的市场快照，方便以后回看自己的判断。',date:'2026-11-05',stocks:[],images:[],market,
      replies:[{id:'sample-public-evaluation',date:'2026-11-07',text:'回看这笔示例交易，判断有依据，但买入节奏仍然可以更耐心。保留当时的账户、市场与成交记录，继续检查执行。',score:6,tags:['买入过急','分批执行'],stocks:['SMH'],images:[],market,account:exampleAccount,trades:[{id:'sample-smh-buy',symbol:'SMH',date:'2026-11-05',side:'buy',price:524.32,shares:30}],mood:'冷静'}],
      publishedAt:'2026-11-06T05:00:00Z',updatedAt:'2026-11-07T06:00:00Z',likeCount:4,liked:false },
  ];
  const assertOwner = userId => { if(userId!==ownerId)throw new Error('预览账户不匹配'); };
  const sourceParent = postId => {
    const own = getEntries().find(row => `${row.type}:${row.id}` === postId && !row.timelineEvent);
    return own ? { ...own, authorId: ownerId, author: { nickname: '波段玩家1836' } } : samples.find(row => row.id === postId);
  };
  const targetRecord = (postId, target) => {
    if (target.kind === 'author') {
      const parent = sourceParent(postId);
      return parent?.replies?.some(reply => reply.id === target.id) ? { authorId: parent.authorId, nickname: parent.author.nickname } : null;
    }
    const reply = evaluations.get(target.id);
    return reply?.postId === postId ? { authorId: reply.authorId, nickname: reply.author.nickname } : null;
  };
  const readEvaluation = row => {
    if (!row.replyTo) return { ...row, replyTo: null };
    const current = targetRecord(row.postId, row.replyTo);
    return { ...row, replyTo: { kind: row.replyTo.kind, id: row.replyTo.id, authorId: row.replyTo.authorId,
      nickname: current?.nickname || row.replyTo.nickname || 'Quote 用户', available: current?.authorId === row.replyTo.authorId } };
  };
  const communityRows = postId => [...evaluations.values()].filter(row => row.postId === postId).map(readEvaluation)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const availableSamples = () => (refreshScenario === 'empty' ? [] : refreshScenario === 'published' ? [{ ...samples[0], id:'insight:sample-fresh-post', sourceId:'sample-fresh-post', text:'刷新验收示例：这是其他账号刚刚发布的公开帖子。', date:'2026-11-08', publishedAt:'2026-11-08T06:00:00Z' }] : samples).filter(row => sampleVisibility.get(row.id) !== 'private');
  const posts = () => [...availableSamples(),...(refreshScenario ? [] : getEntries()).filter(row=>row.visibility==='public'&&!row.timelineEvent).map(row=>({
    id:`${row.type}:${row.id}`,type:row.type,sourceId:String(row.id),authorId:ownerId,author:{nickname:'波段玩家1836',avatarKey:'gold',avatarPath:null},
    text:row.text,date:row.date,stocks:row.stocks||[],images:row.images||[],market:row.market||null,replies:row.replies||[],publishedAt:row.createdAt||`${row.date}T04:00:00Z`,updatedAt:row.updatedAt||row.createdAt||`${row.date}T04:00:00Z`,likeCount:0,liked:false,
  }))].map(row=>{const replies=mapReviewPublicReplies(row.replies,row.authorId);return {...row,replies,commentCount:replies.length+communityRows(row.id).length,liked:likes.get(row.id)===true,likeCount:row.likeCount+(likes.get(row.id)?1:0)};})
    .sort((a,b)=>b.date.localeCompare(a.date)||b.publishedAt.localeCompare(a.publishedAt)||b.id.localeCompare(a.id));
  const assertParent = postId => {
    if (!posts().some(row => row.id === postId) && !getEntries().some(row => `${row.type}:${row.id}` === postId && !row.timelineEvent)) {
      throw reviewJournalError('REVIEW_PUBLIC_NOT_FOUND', '这条动态已删除或改为私密。');
    }
  };
  const validateReply = (reply, create = false) => {
    if (!isReviewJournalOperationId(reply?.id) || !Number.isSafeInteger(reply.revision ?? 0)
      || (reply.revision ?? 0) < (create ? 0 : 1)) throw reviewJournalError('REVIEW_INVALID_REPLY', '评价标识或版本无效，请重新读取。');
  };
  const writePayload = row => buildReviewCommunityEvaluation(row, ownerId);
  return {
    setReviewPublicPreviewScenario(value) { refreshScenario = ['empty','published'].includes(value) ? value : ''; },
    // DEV-only external author action. It changes only this isolated data source;
    // the next list/detail/comment read must observe the withdrawal itself.
    setReviewCommunityPreviewVisibility(postId, visibility) {
      if (!samples.some(row => row.id === postId)) throw new Error('示例动态不存在');
      sampleVisibility.set(postId, visibility === 'private' ? 'private' : 'public');
    },
    async fetchReviewPublicFeed({cursor,query='',symbol='',limit=20}={},userId) {
      assertOwner(userId);
      const term=query.trim().toLowerCase(), before=normalizeReviewPublicCursor(cursor);
      const matching=posts().filter(row=>(!term||`${row.text} ${row.stocks.join(' ')} ${row.author.nickname}`.toLowerCase().includes(term))&&(!symbol||row.stocks.includes(symbol))&&(!before||row.date<before.recordDate||row.date===before.recordDate&&(row.publishedAt<before.publishedAt||row.publishedAt===before.publishedAt&&row.id<before.id)));
      const page=matching.slice(0,limit),last=page.at(-1);
      return {posts:page,hasMore:matching.length>page.length,nextCursor:matching.length>page.length&&last?{recordDate:last.date,publishedAt:last.publishedAt,id:last.id}:null};
    },
    async fetchReviewPublicPost(id,userId) {assertOwner(userId);return posts().find(row=>row.id===id)||null;},
    async fetchReviewCommunityEvaluations({ postId, limit = 20, cursor = null } = {}, userId) {
      assertOwner(userId); assertParent(postId);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error('评价分页范围无效');
      const before = normalizeReviewCommunityCursor(cursor);
      const all = communityRows(postId), matching = all.filter(row => !before || row.createdAt < before.createdAt || row.createdAt === before.createdAt && row.id < before.id);
      const page = matching.slice(0, limit), last = page.at(-1), hasMore = matching.length > page.length;
      return { evaluations: page, hasMore, nextCursor: hasMore ? { createdAt: last.createdAt, id: last.id } : null, totalCount: all.length };
    },
    async saveReviewCommunityEvaluation(postId, reply, userId) {
      assertOwner(userId); assertParent(postId); validateReply(reply, true);
      const payload = writePayload(reply), existing = evaluations.get(reply.id), revision = reply.revision ?? 0;
      const requestedTarget = normalizeReviewCommunityReplyTarget(reply.replyTo);
      if (deletedEvaluations.has(reply.id)) throw reviewJournalError('REVIEW_PUBLIC_NOT_FOUND', '评价已删除。');
      if (existing && (existing.authorId !== userId || existing.postId !== postId)) throw reviewJournalError('REVIEW_PUBLIC_FORBIDDEN', '只能修改自己的评价。');
      let replyTo = existing?.replyTo || null;
      if (existing && requestedTarget && JSON.stringify(normalizeReviewCommunityReplyTarget(existing.replyTo)) !== JSON.stringify(requestedTarget)) {
        throw reviewJournalError('REVIEW_COMMUNITY_INVALID_INPUT', '回复对象不能修改。');
      }
      if (!existing && requestedTarget) {
        const target = targetRecord(postId, requestedTarget);
        if (!target) throw reviewJournalError('REVIEW_PUBLIC_NOT_FOUND', '回复对象已删除或不可用。');
        replyTo = { ...requestedTarget, ...target, available: true };
      }
      if (existing && JSON.stringify(writePayload(existing)) === JSON.stringify(payload)
        && (revision === existing.revision || revision === existing.revision - 1)) return readEvaluation(existing);
      if (!existing && revision !== 0) throw reviewJournalError('REVIEW_PUBLIC_NOT_FOUND', '评价已删除。');
      if (existing && revision !== existing.revision) throw reviewJournalError('REVIEW_COMMUNITY_CONFLICT', '评价已被修改，请重新读取后再操作。');
      const timestamp = new Date().toISOString();
      const saved = { ...payload, postId, replyTo, authorId: userId, author: { nickname: '波段玩家1836', avatarKey: 'gold', avatarPath: null },
        revision: (existing?.revision || 0) + 1, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp, source: 'community' };
      evaluations.set(saved.id, saved); return readEvaluation(saved);
    },
    async deleteReviewCommunityEvaluation(postId, reply, userId) {
      assertOwner(userId); assertParent(postId); validateReply(reply);
      const existing = evaluations.get(reply.id) || deletedEvaluations.get(reply.id);
      if (!existing) throw reviewJournalError('REVIEW_PUBLIC_NOT_FOUND', '评价已删除。');
      if (existing.authorId !== userId || existing.postId !== postId) throw reviewJournalError('REVIEW_PUBLIC_FORBIDDEN', '只能删除自己的评价。');
      if (existing.revision !== reply.revision) throw reviewJournalError('REVIEW_COMMUNITY_CONFLICT', '评价已被修改，请重新读取后再操作。');
      deletedEvaluations.set(reply.id, { id: existing.id, postId: existing.postId, authorId: existing.authorId, revision: existing.revision });
      evaluations.delete(reply.id); return { id: reply.id, postId, deleted: true };
    },
    async setReviewPublicLike(id,liked,userId) {assertOwner(userId);if(!posts().some(row=>row.id===id))throw new Error('这条动态已撤回或删除');likes.set(id,liked===true);const row=posts().find(row=>row.id===id);return {postId:id,liked:row.liked,likeCount:row.likeCount};},
    async downloadReviewPublicImage(path,userId) {assertOwner(userId);const publicImage=posts().some(row=>[...row.images,...row.replies.flatMap(reply=>reply.images)].some(image=>image.path===path));const communityImage=[...evaluations.values()].some(row=>{if(!row.images?.some(image=>image.path===path))return false;try{assertParent(row.postId);return true;}catch{return false;}});if(!publicImage&&!communityImage)throw new Error('图片不可用');const file=getImage(path);if(!file)throw new Error('预览图片已失效');return file;},
    async downloadReviewPublicAvatar() {throw new Error('预览不包含自定义头像');},
  };
}
