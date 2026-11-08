import React from 'react';
import { createQuoteAssistantPreview } from './quoteAssistantPreview.js';
import { quoteCommunityPreview } from './quoteCommunityPreview.js';
import { createReviewPublicPreview, reviewPreviewEntryTimestamps } from './reviewPublicPreview.js';
import { createReviewTimelinePreview } from './reviewTimelinePreview.js';
import ReviewJournalPage from '../pages/ReviewJournalPage.jsx';
import { buildReviewJournalWrite } from '../lib/reviewJournalModel.js';
import { STOCK_COMPARISON_DEMO } from './stockComparisonFixture.js';
import { isRegularNyseHoliday } from '../lib/quoteRefreshPolicy.js';
import { createReviewMarketSnapshot, readReviewMarketDate } from '../lib/reviewMarketSnapshot.js';
import { withStockTradeRecordKind } from '../lib/stockTradeRecordKind.js';
import { reviewPublicAvatarCache } from '../lib/reviewPublicAvatarCache.js';
const ReviewReplayCachePreview = React.lazy(() => import('./ReviewReplayCachePreview.jsx'));

// Only imported by DevVisualPreview. No account requests or production writes.
const OWNER = 'local-review-journal-preview';
const timeline = createReviewTimelinePreview(OWNER);
const now = Date.parse('2026-11-06T04:00:00Z');
const date = '2026-11-05';
const market = {
  now,
  vixComparison: { source:'CBOE_EODHD_EOD', series:{VIX:{rows:[{date,close:28.18}]}}, termStructure:{source:'CBOE',rows:[{date,vix:28.18,vix3m:25.55,ratio:28.18/25.55}]} },
  fearGreed: { source:'CNN',fetchedAt:'2026-11-06T01:00:00Z',history:[{timestamp:Date.parse(`${date}T00:00:00Z`),value:24,rating:'extreme fear'}] },
};
const snapshot = createReviewMarketSnapshot({date,recordDate:date,items:readReviewMarketDate({date,recordDate:date,vixComparison:market.vixComparison,fearGreed:market.fearGreed,now}).items,selectedKeys:['vix','ratio','fearGreed'],example:true,now});
const history = { ...STOCK_COMPARISON_DEMO, priceBasis:'split_adjusted_close', series:Object.fromEntries(Object.entries(STOCK_COMPARISON_DEMO.series).map(([symbol,item])=>[symbol,{...item,rows:item.rows.filter(row=>!isRegularNyseHoliday(row.date))}])) };
const base = { revision:0,stocks:[],images:[],replies:[],market:null,mood:'',level:'🟢',pinned:false };
const seedInsights = [
  {...base,id:'insight-patience',type:'insight',date:'2026-11-03',text:'好的交易，不一定每天都发生。\n\n先写清楚自己在等什么，再决定要不要行动。价格到了、仓位允许、理由还在，才是值得出手的时候。',pinned:true},
  {...base,id:'insight-risk',type:'insight',date:'2026-10-30',text:'SMH 这段交易提醒我：把仓位留给真正理解的机会。\n盈利可以等待，风险需要在买入之前想清楚。📝'},
];
const seedLogs = [
  {...base,id:'log-nvda',type:'log',date:'2026-11-06',text:'NVDA 回看这段交易，最需要复盘的不是某一次涨跌，而是操作有没有遵守最初的计划。\n\nNVDA 和 SMH 的买卖节点放回走势图里，节奏就清楚了。',stocks:['NVDA','SMH','QQQ'],replies:[{id:'note-1',date:'2026-11-06',text:'下次买入前，先把失效条件也写下来。'}]},
  {...base,id:'log-market',type:'log',date:'2026-11-05',text:'今天的波动很大。先记录当时的市场环境，等情绪平静下来再回看自己的判断。\n\n暂时不急着给每一次下跌找答案。',market:snapshot,mood:'冷静'},
  {...base,id:'log-smh',type:'log',date:'2026-11-04',text:'$SMH 同样的价格区间，这次想更耐心一点。先确认自己能承受多少波动，再决定下一步。',stocks:['SMH']},
];
const stockTrades = [
  // Explicitly classified aggregate holding; its entry date is not a purchase date.
  {id:'nv-weekend',user_id:OWNER,symbol:'NVDA',date:'2026-07-04',side:'buy',price:180,shares:10,note:withStockTradeRecordKind('', 'historical_holding')},
  {id:'nv1',user_id:OWNER,symbol:'NVDA',date:'2026-08-20',side:'buy',price:188.45,shares:100},
  {id:'nv2',user_id:OWNER,symbol:'NVDA',date:'2026-09-15',side:'buy',price:194.20,shares:50},
  {id:'nv3',user_id:OWNER,symbol:'NVDA',date:'2026-10-15',side:'sell',price:219.30,shares:50},
  {id:'sm1',user_id:OWNER,symbol:'SMH',date:'2026-09-03',side:'buy',price:524.32,shares:30},
  {id:'sm2',user_id:OWNER,symbol:'SMH',date:'2026-10-20',side:'sell',price:552.10,shares:10},
];
const account = Object.fromEntries(['2026-11-03','2026-11-05','2026-11-06'].map(asOfDate=>[asOfDate,{version:1,kind:'account_snapshot',asOfDate,recordDate:asOfDate,basis:'close',source:'pnl_report',items:[['cumulativeReturnPct',12.5],['yearPeakReturnPct',22.5],['declineFromYearPeakPp',10],['dailyReturnPct',-1.82],['leverage',1.28]].map(([key,value])=>({key,value,asOfDate,basis:'close',source:'pnl_report',...(['yearPeakReturnPct','declineFromYearPeakPp'].includes(key)?{peakDate:'2026-10-23'}:{})}))}]));
const evaluationLog = {...base,id:'evaluation-example',type:'log',date:'2026-11-05',text:'以后要把 VIX 倒挂作为重要参考。比率大于 1 时，结合仓位，耐心寻找买入机会。',replies:[{id:'evaluation-reply',date:'2026-11-07',text:'方向判断可以保留，但“出现倒挂”不等于立即加大融资。回看这笔买入，仓位加得太快了。下次分批执行，先给后续波动留出余地。',score:6,tags:['仓位过重','耐心不足'],market:snapshot,account:account['2026-11-05'],trades:[{id:'sm1',symbol:'SMH',date:'2026-09-03',side:'buy',price:524.32,shares:30}],images:[],stocks:[]}]};
const communityEvaluation = { id:'40000000-0000-4000-8000-000000000001',postId:'log:evaluation-example',authorId:'sample-community-reviewer',
  author:{nickname:'山间慢行',avatarKey:'green',avatarPath:null},revision:1,createdAt:'2026-11-08T05:00:00Z',updatedAt:'2026-11-08T05:00:00Z',
  date:'2026-11-08',text:'赞同先写下交易条件。这个示例评价来自另一位用户，可以用来检查公开转私密后，作者仍能回看已有讨论。',score:8,tags:['按计划执行'],images:[],stocks:[],trades:[],market:null,account:null,mood:'' };
// Deliberately isolated conversation fixtures for the approved threaded view.
const threadNow=Date.now();
const threadEvaluation=(id,authorId,nickname,avatarKey,minutes,text,replyTo=null)=>({id,postId:'insight:sample-reader',authorId,author:{nickname,avatarKey,avatarPath:null},revision:1,createdAt:new Date(threadNow-minutes*60000).toISOString(),updatedAt:new Date(threadNow-minutes*60000).toISOString(),date: new Date(threadNow).toISOString().slice(0,10),text,score:null,tags:[],images:[],stocks:[],trades:[],market:null,account:null,mood:'',replyTo});
const threadedEvaluations=[
  {...threadEvaluation('50000000-0000-4000-8000-000000000001','sample-commenter','记录每一步','blue',28,'赞同。先把买入条件写清楚，回看时才知道是判断出了问题，还是执行偏离了计划。'),score:8,tags:['按计划执行']},
  threadEvaluation('50000000-0000-4000-8000-000000000002',OWNER,'波段玩家1836','gold',24,'是的，这次我想把仓位和买入理由也一起记下来。',{kind:'community',id:'50000000-0000-4000-8000-000000000001',authorId:'sample-commenter',nickname:'记录每一步',available:true}),
  threadEvaluation('50000000-0000-4000-8000-000000000003','sample-commenter','记录每一步','blue',18,'再加一条“什么情况下改变判断”，后面复盘会更清楚。',{kind:'community',id:'50000000-0000-4000-8000-000000000002',authorId:OWNER,nickname:'波段玩家1836',available:true}),
  threadEvaluation('50000000-0000-4000-8000-000000000004',OWNER,'波段玩家1836','gold',12,'这个提醒很好，下次记录的时候把失效条件补上。',{kind:'community',id:'50000000-0000-4000-8000-000000000003',authorId:'sample-commenter',nickname:'记录每一步',available:true}),
];
const readingLogs = [
  {...base,id:'reading-medium',type:'log',date:'2026-11-08',text:'NVDA 与 SMH 的复盘，不应该只记住买卖价格。真正值得留下的是：当时看到了什么信息，为什么认为这个价格可以接受，以及准备在什么条件下改变判断。\n\n这次先把交易原因、当时的仓位和后续观察分开记录。NVDA 的价格变化只是结果，是否遵守计划才是可以反复检查的部分。短期波动出现时，回到当时写下的条件，比事后用新的信息解释过去更有帮助。\n\n这是一条中等长度的示例记录。正文超过原来的字数限制，但仍能在手机一屏内读完，所以应该直接完整显示。'},
  {...base,id:'reading-long',type:'log',date:'2026-11-07',text:[
    '长文复盘示例：把一次操作放回完整的决策过程。',
    '第一部分，记录当时知道的信息。观察 NVDA 和 SMH 时，我希望先写下已经确认的事实，再写自己的推测。行情价格、公开报告和自己能接受的仓位是不同层面的信息，不能因为它们出现在同一张页面上，就把它们当成同一种判断依据。写复盘的目的，是留下当时的思考过程，方便以后检查，而不是替已经发生的结果寻找理由。',
    '第二部分，回看执行。计划中的操作条件有没有出现，实际动作有没有偏离，偏离时是不是受到了情绪影响？这些问题需要具体到日期和步骤。一次买卖的盈亏，并不足以说明整个过程是否合理；同样，一次结果不理想，也不能直接抹掉之前认真做过的准备。先把过程写清楚，才能知道下一次究竟应该改哪一步。',
    '第三部分，区分事实与后来的认识。写下这些文字时，我已经知道后面的价格走势，这会影响自己对当时决定的评价。因此需要保留原始判断，再单独记录现在的补充。不能把后来才知道的信息，假装成当时就能确认的事实。对自己的判断保持诚实，才有可能从重复出现的问题里发现可以改善的地方。',
    '第四部分，检查仓位与节奏。这里不预设某个比例一定正确，而是记录自己当时为什么采用这个安排，以及变化发生以后能否继续按照计划行动。如果连续几次操作都出于同一种急迫感，就需要把这种感受写出来。复盘不仅是看图表，也包括理解自己在不同环境里的反应，避免下一次在同样的地方重复犹豫或冲动。',
    '第五部分，留下可以验证的问题。下次再次打开这篇记录时，希望能够逐条回答：原来的条件是否仍成立，新的信息改变了哪一部分判断，当时的计划有哪些地方过于模糊？把问题写成可以核对的句子，比只写一句看好或者不看好更有价值。这里的示例内容只用于查看长文排版，不代表实时市场观点。',
    '最后，把没有答案的问题也保留下来。复盘并不要求每一次都得到确定结论；有些判断需要更多时间。完整记录自己的观察、行动和后续变化，让未来的自己有材料可以回看，这就是持续记录的意义。超过手机一屏的部分在列表里折叠，点击展开全文后可以继续阅读到这里。',
  ].join('\n\n')},
];
export default function ReviewJournalPreview({language,onBack,marketColorMode,navigationTab=false,reviewFeedUnread,reviewFeedUnreadPreview,reviewOpenAllRequest=0}) {
  const communityAssistant = React.useMemo(() => new URLSearchParams(window.location.search).get('quoteCommunity') === '1' ? quoteCommunityPreview(OWNER) : null, []);
  const avatarCacheEnabled = new URLSearchParams(window.location.search).get('reviewAvatarCache') === '1';
  const detailLoadingEnabled = new URLSearchParams(window.location.search).get('reviewDetailLoading') === '1';
  const detailWaiters = React.useRef([]);
  const [detailPending, setDetailPending] = React.useState(0);
  const finishDetailReads = failed => {
    const pending = detailWaiters.current.splice(0); setDetailPending(0);
    pending.forEach(request => failed ? request.reject(new Error('模拟网络失败，请重试。')) : request.resolve());
  };
  React.useEffect(() => () => detailWaiters.current.splice(0).forEach(request => request.reject(new Error('预览已关闭'))), []);
  const initialLogs = new URLSearchParams(window.location.search).get('quoteAssistant')==='1' ? [{...base,id:'local-quote-ai-source',type:'log',date:'2026-11-08',visibility:'public',text:'示例观点：这次先把观察条件写下来，一个月后再回看判断。'},...seedLogs] : new URLSearchParams(window.location.search).get('reviewPublicOwner') === '1' ? [{...evaluationLog,visibility:'public',publishedAt:'2026-11-08T04:00:00Z'},...seedLogs] : new URLSearchParams(window.location.search).get('reviewEvaluation') === '1' ? [evaluationLog,...seedLogs] : new URLSearchParams(window.location.search).get('reviewReading') === '1' ? [...readingLogs,...seedLogs] : seedLogs;
  const [disciplines,setDisciplines] = React.useState(communityAssistant ? [communityAssistant.entry, ...seedInsights] : seedInsights);
  const [reviewLogs,setReviewLogs] = React.useState(initialLogs);
  const reviewPublicRefreshRef = React.useRef(null);
  const [refreshScenarioStatus,setRefreshScenarioStatus] = React.useState('');
  const [communityScenarioStatus,setCommunityScenarioStatus] = React.useState('');
  const [avatarStats,setAvatarStats] = React.useState({version:1,total:0,requests:{}});
  const [avatarScenarioStatus,setAvatarScenarioStatus] = React.useState('首次头像下载模拟 300ms；全部内容仅为本地示例，不写入真实数据。');
  const [avatarPageVersion,setAvatarPageVersion] = React.useState(0), [avatarReopen,setAvatarReopen] = React.useState(false);
  const avatarPageRef = React.useRef(null);
  const rows = React.useRef([...disciplines,...initialLogs]); const imageUrls = React.useRef(new Map()); const imageFiles=React.useRef(new Map());
  const assistantApi = React.useMemo(()=>createQuoteAssistantPreview({userId:OWNER,getEntries:()=>rows.current}),[]);
  React.useEffect(()=>()=>imageUrls.current.forEach(url=>URL.revokeObjectURL(url)),[]);
  const db = React.useMemo(()=>({
    ...createReviewPublicPreview({ownerId:OWNER,getEntries:()=>rows.current,getImage:path=>imageFiles.current.get(path),market:snapshot,notifications:true,threaded:true,
      beforeReadPost: detailLoadingEnabled ? () => new Promise((resolve, reject) => {
        detailWaiters.current.push({resolve,reject}); setDetailPending(detailWaiters.current.length);
      }) : undefined,
      avatarCache: avatarCacheEnabled ? {onRequest:setAvatarStats,loadBlob:async asset=>{
        // Fixed repository assets, never arbitrary URLs or remote account media.
        const response=await fetch(asset);if(!response.ok)throw new Error('本地示例头像读取失败');return response.blob();
      }} : null,
      communityEvaluations:[...(communityAssistant?.comments || []),...(initialLogs.some(row=>row.id===evaluationLog.id)?[communityEvaluation]:[]),...(new URLSearchParams(window.location.search).get('reviewThreads')==='1'?threadedEvaluations:[])]}),
    saveReviewJournalEntry:async(entry,userId)=>{
      if(userId!==OWNER)throw new Error('预览账户不匹配');
      if(new URLSearchParams(window.location.search).get('reviewFailure')==='save')throw new Error('模拟保存失败：正文与附件仍保留，请重试。');
      const existing=rows.current.find(row=>row.id===entry.id&&row.type===entry.type);
      if(existing&&existing.revision!==(entry.revision||0))throw new Error('记录已在其他页面更新，请刷新后重试');
      const stored={...base,...entry,id:entry.id||crypto.randomUUID(),revision:(entry.revision||0)+1,...reviewPreviewEntryTimestamps(entry,existing)};
      rows.current=[stored,...rows.current.filter(row=>!(row.id===stored.id&&row.type===stored.type))];return stored;
    },
    appendReviewJournalReply:async(entry,reply,userId)=>{
      if(userId!==OWNER)throw new Error('预览账户不匹配');
      if(new URLSearchParams(window.location.search).get('reviewFailure')==='save')throw new Error('模拟保存失败：评价内容与附件仍保留，请重试。');
      const existing=rows.current.find(row=>row.id===entry.id&&row.type===entry.type);
      if(!existing)throw new Error('记录已删除');
      const normalized=buildReviewJournalWrite({...existing,replies:[reply]},OWNER).review_data.replies[0];
      if(existing.replies.some(item=>item.id===normalized.id))return existing;
      const stored={...existing,replies:[...existing.replies,normalized],revision:existing.revision+1};
      rows.current=rows.current.map(row=>row.id===stored.id&&row.type===stored.type?stored:row);return stored;
    },
    appendReviewTimelineReply:async(entry,reply,userId)=>{
      if(userId!==OWNER)throw new Error('预览账户不匹配');
      const existing=rows.current.find(row=>row.timelineEvent?.id===entry.timelineEvent?.id);
      const normalized=buildReviewJournalWrite({...entry,replies:[reply]},OWNER);
      if(existing?.replies.some(item=>item.id===reply.id))return existing;
      const stored={...entry,...existing,id:existing?.id||crypto.randomUUID(),type:'log',timelineEvent:normalized.review_data.timelineEvent,replies:[...(existing?.replies||[]),normalized.review_data.replies[0]],revision:(existing?.revision||0)+1};
      rows.current=[stored,...rows.current.filter(row=>row.id!==stored.id)];return stored;
    },
    updateReviewJournalReply:async(entry,original,reply,userId)=>{
      if(userId!==OWNER)throw new Error('预览账户不匹配');
      if(new URLSearchParams(window.location.search).get('reviewFailure')==='save')throw new Error('模拟保存失败：评价内容与附件仍保留，请重试。');
      const existing=rows.current.find(row=>row.id===entry.id&&row.type===entry.type);
      if(!existing)throw new Error('记录已删除');
      const current=existing.replies.find(item=>item.id===original.id);
      if(!current||JSON.stringify(current)!==JSON.stringify(original))throw new Error('评价已被修改或删除，请重新打开后操作。');
      const normalized=buildReviewJournalWrite({...existing,replies:[{...reply,id:original.id,date:original.date}]},OWNER).review_data.replies[0];
      const stored={...existing,replies:existing.replies.map(item=>item.id===original.id?normalized:item),revision:existing.revision+1};
      rows.current=rows.current.map(row=>row.id===stored.id&&row.type===stored.type?stored:row);return stored;
    },
    deleteReviewJournalReply:async(entry,original,userId)=>{
      if(userId!==OWNER)throw new Error('预览账户不匹配');
      if(new URLSearchParams(window.location.search).get('reviewFailure')==='save')throw new Error('模拟删除失败：评价仍保留，请重试。');
      const existing=rows.current.find(row=>row.id===entry.id&&row.type===entry.type);
      if(!existing)throw new Error('记录已删除');
      const current=existing.replies.find(item=>item.id===original.id);
      if(!current)return existing;
      if(JSON.stringify(current)!==JSON.stringify(original))throw new Error('评价已被修改，请重新打开后操作。');
      const stored={...existing,replies:existing.replies.filter(item=>item.id!==original.id),revision:existing.revision+1};
      rows.current=rows.current.map(row=>row.id===stored.id&&row.type===stored.type?stored:row);return stored;
    },
    deleteReviewJournalEntry:async entry=>{rows.current=rows.current.filter(row=>!(row.id===entry.id&&row.type===entry.type));},
    uploadReviewJournalImage:async file=>{const path=`${OWNER}/${crypto.randomUUID()}.${file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'}`;const url=URL.createObjectURL(file);imageUrls.current.set(path,url);imageFiles.current.set(path,file);return{path,name:file.name,mimeType:file.type,size:file.size,previewUrl:url};},
    resolveReviewJournalImage:async path=>{if(!imageUrls.current.has(path))throw new Error('预览图片已失效');return imageUrls.current.get(path);},
    removeReviewJournalImage:async path=>{const url=imageUrls.current.get(path);if(url)URL.revokeObjectURL(url);imageUrls.current.delete(path);imageFiles.current.delete(path);},
  }),[]);
  React.useEffect(()=>{
    if(!avatarCacheEnabled||!avatarReopen)return undefined;
    let stopped=false,observer,timer;
    const open=()=>{
      if(stopped)return;
      const target=[...(avatarPageRef.current?.querySelectorAll('article.rpf-post.rj-post-link')||[])].find(node=>node.getAttribute('aria-label')?.startsWith('山间慢行 ·'));
      if(!target)return;
      stopped=true;observer?.disconnect();clearTimeout(timer);target.click();setAvatarReopen(false);
    };
    observer=new MutationObserver(open);if(avatarPageRef.current)observer.observe(avatarPageRef.current,{childList:true,subtree:true});
    timer=setTimeout(()=>{stopped=true;observer.disconnect();setAvatarReopen(false);setAvatarScenarioStatus('示例文章尚未出现，请确认示例列表已恢复，然后手动点进“山间慢行”的帖子。');},5000);
    open();return()=>{stopped=true;observer.disconnect();clearTimeout(timer);};
  },[avatarCacheEnabled,avatarPageVersion,avatarReopen]);
  const reopenAvatarArticle=message=>{setAvatarScenarioStatus(message);setAvatarReopen(true);setAvatarPageVersion(value=>value+1);};
  if(!import.meta.env.DEV)return null;
  if(new URLSearchParams(window.location.search).get('reviewReplayCache')==='1')return <React.Suspense fallback={null}><ReviewReplayCachePreview snapshot={snapshot}/></React.Suspense>;
  const journal=<ReviewJournalPage key={avatarCacheEnabled?avatarPageVersion:'default'} ctx={{db,userId:OWNER,language,disciplines,reviewLogs,setDisciplines,setReviewLogs,stockTrades,onBack,marketColorMode,usdCny:7.12,fxDate:'2026-11-07T00:00:00Z',navigationTab,reviewPublicRefreshRef,reviewFeedUnread,reviewOpenAllRequest,previewData:{assistantApi,initialAssistant:new URLSearchParams(window.location.search).get('quoteAssistant')==='1',initialAllScope:avatarCacheEnabled?'public':new URLSearchParams(window.location.search).get('reviewScope')||undefined,timeline,initialTimeline:new URLSearchParams(window.location.search).get('reviewTimeline')==='1',identity:{nickname:'波段玩家1836',avatarKey:'gold'},history,market,account}}}/>;
  return <>
    {detailLoadingEnabled&&<section aria-label="本地详情加载验收" style={{padding:'calc(env(safe-area-inset-top) + 12px) 16px 12px',fontSize:13,color:'#94a3b8',background:'#11151b'}}>
      <strong>详情加载验收 · 本地示例，不写真实数据</strong>
      <p role="status">待完成详情请求：{detailPending}。点开帖子后保持请求未完成，核对正文与评论是否已经显示。</p>
      <button type="button" style={{padding:'10px 8px'}} onClick={()=>finishDetailReads(false)}>完成详情读取</button>
      <button type="button" style={{padding:'10px 8px'}} onClick={()=>finishDetailReads(true)}>模拟详情网络失败</button>
    </section>}
    {avatarCacheEnabled&&<section aria-label="本地头像缓存验收" style={{padding:'calc(env(safe-area-inset-top) + 12px) 16px 12px',fontSize:13,color:'#94a3b8',background:'#11151b'}}>
      <strong>头像缓存验收 · 本地示例，不写真实数据</strong>
      <p role="status">头像下载请求：{avatarStats.total} 次 · 当前头像版本：{avatarStats.version} · 本版本请求：{avatarStats.requests[avatarStats.path]||0} 次</p>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        <button type="button" style={{padding:'10px 8px'}} onClick={()=>reopenAvatarArticle('已重新进入示例文章；同一路径应复用头像，请求次数保持不变。')}>重进示例文章（保留缓存）</button>
        <button type="button" style={{padding:'10px 8px'}} onClick={()=>{db.changeReviewAvatarPreview();reopenAvatarArticle('已更换 immutable 头像路径；帖子和同作者评论将显示新头像，新增一次下载。');}}>更换示例头像</button>
        <button type="button" style={{padding:'10px 8px'}} onClick={()=>{reviewPublicAvatarCache.clear();reopenAvatarArticle('已清空头像缓存并重进文章；本版本将重新下载一次。');}}>清空缓存并重进文章</button>
      </div>
      <p>{avatarScenarioStatus}</p>
    </section>}
    <details style={{padding:'calc(env(safe-area-inset-top) + 12px) 16px 12px',fontSize:13,color:'#94a3b8'}}>
      <summary>本地刷新验收 · 示例数据</summary>
      <a href="?devPreview=1&tab=review-journal&reviewThreads=1&reviewScope=public&reviewDetailLoading=1" style={{display:'block',padding:'12px 8px'}}>正文即时显示与评论并行示例</a>
      <a href="?devPreview=1&tab=home&reviewUnread=1&reviewThreads=1" style={{display:'block',padding:'12px 8px'}}>评论与新帖提醒示例</a>
      <a href="?devPreview=1&tab=review-journal&reviewThreads=1&reviewScope=public&reviewAvatarCache=1" style={{display:'block',padding:'12px 8px'}}>头像缓存示例</a>
      <a href="?devPreview=1&tab=settings&settingsAvatarCache=1" style={{display:'block',padding:'12px 8px'}}>设置头像缓存示例</a>
      <a href="?devPreview=1&tab=review&reviewReplayCache=1" style={{display:'block',padding:'12px 8px'}}>帖子附件缓存示例</a>
      <button type="button" style={{padding:'12px 8px'}} onClick={async()=>{db.setReviewPublicPreviewScenario('empty');await reviewPublicRefreshRef.current?.();setRefreshScenarioStatus('示例列表已清空');}}>清空示例公开列表</button>
      <button type="button" style={{padding:'12px 8px'}} onClick={()=>{db.setReviewPublicPreviewScenario('published');reviewFeedUnreadPreview?.publish('insight:sample-fresh-post');reviewFeedUnread?.refresh();setRefreshScenarioStatus('已模拟其他账号发布，等待自动读取');}}>模拟其他账号发布</button>
      <button type="button" style={{padding:'12px 8px'}} onClick={async()=>{await reviewPublicRefreshRef.current?.();setRefreshScenarioStatus('手动读取完成');}}>读取最新示例</button>
      {refreshScenarioStatus&&<p role="status">{refreshScenarioStatus}</p>}
    </details>
    <details style={{padding:'0 16px 12px',fontSize:13,color:'#94a3b8'}}>
      <summary>本地社区评价验收 · 示例数据</summary>
      <button type="button" style={{padding:'12px 8px'}} onClick={()=>{db.setReviewCommunityPreviewVisibility('insight:sample-reader','private');setCommunityScenarioStatus('山间慢行的示例帖已改为私密；后续评价读取和保存会拒绝访问。');}}>模拟他人帖子转私密</button>
      <button type="button" style={{padding:'12px 8px'}} onClick={async()=>{db.setReviewCommunityPreviewVisibility('insight:sample-reader','public');await reviewPublicRefreshRef.current?.();setCommunityScenarioStatus('山间慢行的示例帖恢复公开，已有评价仍保留。');}}>恢复示例帖子公开</button>
      {communityScenarioStatus&&<p role="status">{communityScenarioStatus}</p>}
    </details>
    {avatarCacheEnabled?<div ref={avatarPageRef}>{journal}</div>:journal}
  </>;
}
