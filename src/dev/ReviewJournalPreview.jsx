import React from 'react';
import ReviewJournalPage from '../pages/ReviewJournalPage.jsx';
import { STOCK_COMPARISON_DEMO } from './stockComparisonFixture.js';
import { isRegularNyseHoliday } from '../lib/quoteRefreshPolicy.js';
import { createReviewMarketSnapshot, readReviewMarketDate } from '../lib/reviewMarketSnapshot.js';

// Only imported by DevVisualPreview. No account requests or production writes.
const OWNER = 'local-review-journal-preview';
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
  {...base,id:'insight-risk',type:'insight',date:'2026-10-30',text:'把仓位留给真正理解的机会。\n盈利可以等待，风险需要在买入之前想清楚。📝'},
];
const seedLogs = [
  {...base,id:'log-nvda',type:'log',date:'2026-11-06',text:'$NVDA 回看这段交易，最需要复盘的不是某一次涨跌，而是每次操作有没有遵守最初的计划。\n\n把买卖节点放回走势图里，节奏就清楚了。',stocks:['NVDA'],replies:[{id:'note-1',date:'2026-11-06',text:'下次买入前，先把失效条件也写下来。'}]},
  {...base,id:'log-market',type:'log',date:'2026-11-05',text:'今天的波动很大。先记录当时的市场环境，等情绪平静下来再回看自己的判断。\n\n暂时不急着给每一次下跌找答案。',market:snapshot,mood:'冷静'},
  {...base,id:'log-smh',type:'log',date:'2026-11-04',text:'$SMH 同样的价格区间，这次想更耐心一点。先确认自己能承受多少波动，再决定下一步。',stocks:['SMH']},
];
const stockTrades = [
  {id:'nv1',user_id:OWNER,symbol:'NVDA',date:'2026-08-20',side:'buy',price:188.45,shares:100},
  {id:'nv2',user_id:OWNER,symbol:'NVDA',date:'2026-09-15',side:'buy',price:194.20,shares:50},
  {id:'nv3',user_id:OWNER,symbol:'NVDA',date:'2026-10-15',side:'sell',price:219.30,shares:50},
  {id:'sm1',user_id:OWNER,symbol:'SMH',date:'2026-09-03',side:'buy',price:524.32,shares:30},
  {id:'sm2',user_id:OWNER,symbol:'SMH',date:'2026-10-20',side:'sell',price:552.10,shares:10},
];
export default function ReviewJournalPreview({language,onBack}) {
  const [disciplines,setDisciplines] = React.useState(seedInsights);
  const [reviewLogs,setReviewLogs] = React.useState(seedLogs);
  const rows = React.useRef([...seedInsights,...seedLogs]); const imageUrls = React.useRef(new Map());
  React.useEffect(()=>()=>imageUrls.current.forEach(url=>URL.revokeObjectURL(url)),[]);
  const db = React.useMemo(()=>({
    saveReviewJournalEntry:async(entry,userId)=>{
      if(userId!==OWNER)throw new Error('预览账户不匹配');
      if(new URLSearchParams(window.location.search).get('reviewFailure')==='save')throw new Error('模拟保存失败：正文与附件仍保留，请重试。');
      const existing=rows.current.find(row=>row.id===entry.id&&row.type===entry.type);
      if(existing&&existing.revision!==(entry.revision||0))throw new Error('记录已在其他页面更新，请刷新后重试');
      const stored={...base,...entry,id:entry.id||crypto.randomUUID(),revision:(entry.revision||0)+1,createdAt:entry.createdAt||new Date().toISOString()};
      rows.current=[stored,...rows.current.filter(row=>!(row.id===stored.id&&row.type===stored.type))];return stored;
    },
    deleteReviewJournalEntry:async entry=>{rows.current=rows.current.filter(row=>!(row.id===entry.id&&row.type===entry.type));},
    uploadReviewJournalImage:async file=>{const path=`${OWNER}/${crypto.randomUUID()}.${file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'}`;const url=URL.createObjectURL(file);imageUrls.current.set(path,url);return{path,name:file.name,mimeType:file.type,size:file.size,previewUrl:url};},
    resolveReviewJournalImage:async path=>{if(!imageUrls.current.has(path))throw new Error('预览图片已失效');return imageUrls.current.get(path);},
    removeReviewJournalImage:async path=>{const url=imageUrls.current.get(path);if(url)URL.revokeObjectURL(url);imageUrls.current.delete(path);},
  }),[]);
  if(!import.meta.env.DEV)return null;
  return <ReviewJournalPage ctx={{db,userId:OWNER,language,disciplines,reviewLogs,setDisciplines,setReviewLogs,stockTrades,onBack,previewData:{identity:{nickname:'波段玩家1836',avatarKey:'gold'},history,market}}}/>;
}
