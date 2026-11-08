// Isolated sample data for DevVisualPreview. No network or account writes.
import { mapReviewPublicReplies } from '../lib/reviewPublicModel.js';

export function createReviewPublicPreview({ ownerId, getEntries, getImage, market }) {
  const likes = new Map();
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
  const posts = () => [...(refreshScenario === 'empty' ? [] : refreshScenario === 'published' ? [{ ...samples[0], id:'insight:sample-fresh-post', sourceId:'sample-fresh-post', text:'刷新验收示例：这是其他账号刚刚发布的公开帖子。', publishedAt:'2026-11-08T06:00:00Z' }] : samples),...(refreshScenario ? [] : getEntries()).filter(row=>row.visibility==='public'&&!row.timelineEvent).map(row=>({
    id:`${row.type}:${row.id}`,type:row.type,sourceId:String(row.id),authorId:ownerId,author:{nickname:'波段玩家1836',avatarKey:'gold',avatarPath:null},
    text:row.text,date:row.date,stocks:row.stocks||[],images:row.images||[],market:row.market||null,replies:row.replies||[],publishedAt:row.publishedAt||row.createdAt||'2026-11-07T04:00:00Z',updatedAt:row.updatedAt||row.createdAt||'2026-11-07T04:00:00Z',likeCount:0,liked:false,
  }))].map(row=>({...row,replies:mapReviewPublicReplies(row.replies,row.authorId),liked:likes.get(row.id)===true,likeCount:row.likeCount+(likes.get(row.id)?1:0)}))
    .sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||b.id.localeCompare(a.id));
  return {
    setReviewPublicPreviewScenario(value) { refreshScenario = ['empty','published'].includes(value) ? value : ''; },
    async fetchReviewPublicFeed({cursor,query='',symbol='',limit=20}={},userId) {
      assertOwner(userId);
      const term=query.trim().toLowerCase();
      const matching=posts().filter(row=>(!term||`${row.text} ${row.stocks.join(' ')} ${row.author.nickname}`.toLowerCase().includes(term))&&(!symbol||row.stocks.includes(symbol))&&(!cursor||row.publishedAt<cursor.publishedAt||row.publishedAt===cursor.publishedAt&&row.id<cursor.id));
      const page=matching.slice(0,limit),last=page.at(-1);
      return {posts:page,hasMore:matching.length>page.length,nextCursor:matching.length>page.length&&last?{publishedAt:last.publishedAt,id:last.id}:null};
    },
    async fetchReviewPublicPost(id,userId) {assertOwner(userId);return posts().find(row=>row.id===id)||null;},
    async setReviewPublicLike(id,liked,userId) {assertOwner(userId);if(!posts().some(row=>row.id===id))throw new Error('这条动态已撤回或删除');likes.set(id,liked===true);const row=posts().find(row=>row.id===id);return {postId:id,liked:row.liked,likeCount:row.likeCount};},
    async downloadReviewPublicImage(path,userId) {assertOwner(userId);if(!posts().some(row=>[...row.images,...row.replies.flatMap(reply=>reply.images)].some(image=>image.path===path)))throw new Error('图片不可用');const file=getImage(path);if(!file)throw new Error('预览图片已失效');return file;},
    async downloadReviewPublicAvatar() {throw new Error('预览不包含自定义头像');},
  };
}
