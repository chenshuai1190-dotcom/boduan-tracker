import React from 'react';
import { Activity, Check, ImagePlus, LineChart, Loader2, Smile, Star, Wallet, X } from 'lucide-react';
import { localReviewDate } from '../lib/reviewJournalFeed.js';
import { normalizeReviewEvaluationTags, normalizeReviewAccountSnapshot, normalizeReviewTradeReferences } from '../lib/reviewEvaluationModel.js';
import { collectReviewReplayTrades } from '../lib/reviewStockReplayModel.js';
import { getVixComparisonExpectedCloseDate } from '../lib/vixComparisonSession.js';
import { marketTextHexColor } from '../lib/marketColorMode.js';
import { latestReviewAccountCloseDate, isReviewAccountCloseDate } from '../lib/reviewAccountSnapshot.js';
import { SnapshotCard, SnapshotPicker } from './ReviewMarketSnapshot.jsx';
import ReviewStockReplay from './ReviewStockReplay.jsx';
import { keepReviewComposerInputVisible } from '../lib/reviewComposerVisibility.js';
import './ReviewEvaluation.css';

const PRESET_TAGS = ['仓位过重', '买入过急', '过早卖出', '按计划执行', '判断得到验证'];
const ACCOUNT_LABELS = { cumulativeReturnPct: '截至该日累计收益率', yearPeakReturnPct: '年内收益率高点', declineFromYearPeakPp: '较高点回落', dailyReturnPct: '当日收益率', leverage: '杠杆' };
const money = value => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatMetric = item => item.key === 'leverage' ? `${item.value.toFixed(2)}×`
  : item.key === 'declineFromYearPeakPp' ? `${item.value.toFixed(2)}%`
  : `${item.value > 0 ? '+' : ''}${item.value.toFixed(2)}%`;
const metricStyle = (item, marketColorMode) => !item || item.key === 'leverage'
  || (item.key === 'declineFromYearPeakPp' && item.value === 0) ? undefined
  : { color: marketTextHexColor(item.key === 'declineFromYearPeakPp' ? -item.value : item.value, marketColorMode) };
const blank = () => ({ id: crypto.randomUUID(), date: localReviewDate(), text: '', score: null, tags: [], trades: [], account: null, market: null, images: [], stocks: [], mood: '' });
const initialDraft = reply => {
  const value = reply ? structuredClone(reply) : {};
  return { ...blank(), ...value, text: value.text || '', tags: value.tags || [], trades: value.trades || [], images: value.images || [], stocks: value.stocks || [], mood: value.mood || '' };
};

export function EvaluationRating({ score, tags = [] }) {
  if (!score && !tags.length) return null;
  return <div className="rev-rating-summary">{score && <><span className="rev-stars-small" aria-label={`${score} 分，共 10 分`}>{[0,1,2,3,4].map(i => <RatingStar key={i} fill={Math.min(1,Math.max(0,score/2-i))}/>)}</span><span className="rev-score-small">{score} 分</span></>}{tags.map(tag => <span key={tag} className="rev-tag">{tag}</span>)}</div>;
}
function RatingStar({ fill }) {
  return <span className="rev-star"><Star aria-hidden="true"/><span style={{ width: `${fill*100}%` }}><Star aria-hidden="true"/></span></span>;
}
export function ReviewAccountCard({ value, marketColorMode }) {
  const snapshot = normalizeReviewAccountSnapshot(value);
  if (!snapshot) return null;
  const daysAfterPost = (Date.parse(`${snapshot.asOfDate}T00:00:00Z`) - Date.parse(`${snapshot.recordDate}T00:00:00Z`)) / 86400000;
  const keys = Object.keys(ACCOUNT_LABELS);
  const items = [...snapshot.items].sort((a,b)=>keys.indexOf(a.key)-keys.indexOf(b.key));
  return <section className="review-market-card rev-account-card" aria-label="已保存的账户快照"><div className="review-market-card-heading"><span>{daysAfterPost>0?'后续账户':'当时的账户'}</span><time dateTime={snapshot.asOfDate}>{snapshot.asOfDate}</time></div><div className="rev-account-values" data-count={items.length}>{items.map(item => <div key={item.key} data-metric={item.key} className={item.key === 'cumulativeReturnPct' ? 'rev-account-primary' : undefined}><span>{item.key==='cumulativeReturnPct'&&daysAfterPost>0?`博文发布后 ${daysAfterPost} 天账户收益率变化`:ACCOUNT_LABELS[item.key]}</span><strong style={metricStyle(item,marketColorMode)}>{formatMetric(item)}</strong>{item.key === 'yearPeakReturnPct' && <small><time dateTime={item.peakDate}>{Number(item.peakDate.slice(5,7))}月{Number(item.peakDate.slice(8,10))}日</time></small>}{item.key === 'leverage' && <small>总资产 / 净资产</small>}</div>)}</div></section>;
}
export function ReviewTradeReferences({ trades, userId, language, previewHistory }) {
  const [open, setOpen] = React.useState(null);
  const valid = normalizeReviewTradeReferences(trades);
  if (!valid.length) return null;
  return <div className="rev-trade-references"><div className="rev-trade-track" aria-label="引用的交易记录">{valid.map(trade => <button type="button" className="rev-trade-reference" key={trade.id} aria-expanded={open === trade.id} onClick={()=>setOpen(open===trade.id?null:trade.id)}><header><strong>{trade.symbol}</strong><span className={`rev-side-${trade.side}`}>{trade.side==='buy'?'买入':'卖出'}</span><time dateTime={trade.date}>{trade.date}</time></header><div><strong>{money(trade.price)}</strong><span>{trade.shares.toLocaleString('en-US',{maximumFractionDigits:6})} 股</span></div><small>成交记录 · 点击查看该笔走势</small></button>)}</div>{valid.length>1 && <div className="rev-swipe-note">左右滑动查看 · {valid.length} 笔引用</div>}{open && valid.some(item=>item.id===open) && <ReviewStockReplay symbol={valid.find(item=>item.id===open).symbol} stockTrades={valid.filter(item=>item.id===open)} userId={userId} language={language} recordDate={valid.find(item=>item.id===open).date} previewHistory={previewHistory}/>}</div>;
}

function TradePicker({ selected, stockTrades, userId, onChange, onClose, Dialog, relatedSymbols = [] }) {
  const [query,setQuery]=React.useState('');
  const [side,setSide]=React.useState('all');
  const [chosen,setChosen]=React.useState(selected);
  const symbols=[...new Set(stockTrades.map(row=>String(row.symbol||'').toUpperCase()).filter(Boolean))];
  // This attachment stores actual executions. Do not strip an explicit holding
  // classification and accidentally freeze an average-cost entry as a purchase.
  const current=symbols.flatMap(symbol=>collectReviewReplayTrades({stockTrades,symbol,userId}).filter(row=>row.id && row.recordKind!=='historical_holding' && row.date<=localReviewDate()).map(row=>({id:String(row.id),symbol,date:row.date,side:row.side,price:row.price,shares:row.shares})));
  // Saved references are frozen: retain their price/date even if the live ledger changes.
  const choices=[...new Map([...current,...normalizeReviewTradeReferences(selected)].map(row=>[row.id,row])).values()]
    .sort((a,b)=>Number(relatedSymbols.includes(b.symbol))-Number(relatedSymbols.includes(a.symbol)) || b.date.localeCompare(a.date));
  const visible=choices.filter(row=>(!query || row.symbol.includes(query.trim().toUpperCase()) || row.date.includes(query))&&(side==='all'||row.side===side));
  const toggle=trade=>setChosen(old=>old.some(item=>item.id===trade.id)?old.filter(item=>item.id!==trade.id):old.length<20?[...old,trade]:old);
  return <Dialog title="关联交易" onClose={onClose} headerAction={<button className="rj-text-button" onClick={()=>{onChange(chosen);onClose();}}>插入{chosen.length?` ${chosen.length} 笔`:''}</button>}><div className="rj-dialog-body"><input className="rev-search" aria-label="搜索交易代码或日期" placeholder="股票代码或日期" value={query} onChange={e=>setQuery(e.target.value)}/><div className="rj-chip-row">{[['all','全部'],['buy','买入'],['sell','卖出']].map(([id,label])=><button key={id} aria-pressed={side===id} onClick={()=>setSide(id)}>{label}</button>)}</div><p className="rj-note">引用已记录的成交，最多 20 笔。</p>{visible.map(row=><button type="button" className="rev-trade-choice" key={row.id} aria-pressed={chosen.some(item=>item.id===row.id)} onClick={()=>toggle(row)} disabled={chosen.length>=20&&!chosen.some(item=>item.id===row.id)}><span><strong>{row.symbol} <em className={`rev-side-${row.side}`}>{row.side==='buy'?'买入':'卖出'}</em></strong><small>{row.date} · {row.shares.toLocaleString()} 股</small></span><strong>{money(row.price)}</strong><span className="rev-check">{chosen.some(item=>item.id===row.id)&&<Check size={14}/>}</span></button>)}{!visible.length&&<p className="rj-note">没有符合条件的交易记录。</p>}</div></Dialog>;
}
function AccountPicker({ value, initialDate, recordDate, db, userId, preview, previewAccount, onChange, onClose, Dialog, marketColorMode }) {
  const now=Date.now(), maxDate=latestReviewAccountCloseDate(now);
  const fetchAccountSnapshot=db?.fetchReviewAccountSnapshot;
  const [date,setDate]=React.useState(value?.asOfDate||initialDate);
  const dateAllowed=isReviewAccountCloseDate(date,now);
  const [selected,setSelected]=React.useState(value?.items?.map(item=>item.key)||Object.keys(ACCOUNT_LABELS));
  const [request,setRequest]=React.useState({date:null,status:'loading',snapshot:null});
  const [retry,setRetry]=React.useState(0);
  React.useEffect(()=>{let active=true;
    if(!dateAllowed){setRequest({date,status:'invalid_date',snapshot:null});return()=>{active=false;};}
    setRequest({date,status:'loading',snapshot:null});
    const load=preview?Promise.resolve(previewAccount?.[date]?{status:'ready',snapshot:previewAccount[date]}:{status:'missing',snapshot:null}):fetchAccountSnapshot(date,userId);
    load.then(result=>{if(active)setRequest({...result,date});}).catch(error=>{if(active)setRequest({date,status:'error',snapshot:null,error:error.message});});
    return()=>{active=false;};
  },[date,dateAllowed,userId,fetchAccountSnapshot,preview,previewAccount,retry]);
  const result=request.date===date?request:{status:'loading'};
  const snapshot=result.status==='ready'?normalizeReviewAccountSnapshot(result.snapshot):null;
  const items=snapshot?.items.filter(item=>selected.includes(item.key))||[];
  const chosen=items.length&&dateAllowed&&snapshot.asOfDate===date?{...snapshot,recordDate,items}:null;
  const missingYearHistory=snapshot&&!snapshot.items.some(item=>item.key==='yearPeakReturnPct');
  const messageStatus=result.reason==='incomplete_close'?'incomplete_close':result.status;
  const messages={loading:'正在读取该日账户…',missing:'该日没有可用的正式账户快照。',pending:'该日历史数据待更新，暂不能引用。',incomplete_close:'该日尚未完成收盘。',not_session:'请选择已完成收盘的交易日。',invalid_date:'请选择有效的已完成收盘日期。',error:result.error||'暂时无法读取，请重试。'};
  return <Dialog title="插入账户快照" onClose={onClose} headerAction={<button className="rj-text-button" disabled={!chosen} onClick={()=>{if(!chosen)return;onChange(chosen);onClose();}}>插入</button>}><div className="rj-dialog-body"><label className="rev-date-label">来源日期<input type="date" value={date} max={maxDate} onChange={e=>setDate(e.target.value)}/></label><p className="rj-note">默认博文当日，也可选择之后已完成收盘的交易日。收益、高点与回落按所选日期读取，保存后保持不变。</p>{!snapshot&&<p className="rj-note" role="status">{messages[messageStatus]||'该日数据不可用。'}</p>}{Object.entries(ACCOUNT_LABELS).map(([key,label])=>{const item=snapshot?.items.find(row=>row.key===key);return <label className="rev-account-option" key={key}><input type="checkbox" checked={Boolean(item&&selected.includes(key))} disabled={!item} onChange={()=>setSelected(old=>old.includes(key)?old.filter(k=>k!==key):[...old,key])}/><span>{label}{key==='leverage'&&!item&&<small>需完整历史现金及负债记录</small>}</span><strong style={metricStyle(item,marketColorMode)}>{item?formatMetric(item):'—'}</strong></label>;})}{missingYearHistory&&<p className="rj-note">该日期暂无可用的收益报表历史记录，高点与回落暂不可用。</p>}{['error','pending'].includes(messageStatus)&&<button className="rj-wide-button" onClick={()=>setRetry(n=>n+1)}>重新读取</button>}{chosen&&<ReviewAccountCard value={chosen} marketColorMode={marketColorMode}/>}</div></Dialog>;
}

export default function ReviewEvaluationComposer({ open, entry, reply = null, replyTarget = null, identityNode, db, userId, stockTrades, onSaved, onClose, Dialog, EmojiPicker, renderPhotos, knownTags=[], preview=false, previewData, language='zh', marketColorMode }) {
  const target=replyTarget||reply?.replyTo||entry?.communityReplyTo||null;
  const isReply=Boolean(target);
  const [draft,setDraft]=React.useState(()=>{const value=initialDraft(reply);return isReply?{...value,score:null,tags:[]}:value;});
  const [files,setFiles]=React.useState([]);const filesRef=React.useRef(files);filesRef.current=files;
  const [customTags,setCustomTags]=React.useState([]);const [customOpen,setCustomOpen]=React.useState(false);const [tagInput,setTagInput]=React.useState('');
  const [tagError,setTagError]=React.useState('');const composing=React.useRef(false);
  const [picker,setPicker]=React.useState('');const [busy,setBusy]=React.useState(false);const busyRef=React.useRef(false);const [error,setError]=React.useState('');
  const submissionTime=React.useRef(null);
  const scrollRef=React.useRef(null);const tagRef=React.useRef(null);const fileRef=React.useRef(null);const textRef=React.useRef(null);const selection=React.useRef({start:0,end:0});
  const visibilityRef=React.useRef(()=>{});
  const keepInputVisible=()=>visibilityRef.current();
  const patch=value=>setDraft(old=>({...old,...value}));
  const nonempty=Boolean(draft.text.trim()||(!isReply&&(draft.score||draft.tags.length))||draft.trades.length||draft.market||draft.account||draft.images.length||draft.stocks.length||draft.mood||files.length);
  const availableTags=[...new Set([...PRESET_TAGS,...knownTags,...customTags,...draft.tags])];
  React.useEffect(()=>()=>filesRef.current.forEach(item=>URL.revokeObjectURL(item.url)),[]);
  React.useEffect(()=>{
    if(!open)return undefined;
    let frame;
    let settledTimer;
    const measure=()=>{
      const input=document.activeElement;
      if(input!==textRef.current&&input!==tagRef.current)return;
      keepReviewComposerInputVisible(scrollRef.current,input,{contextElement:input===tagRef.current?input.closest('form'):undefined});
    };
    // Wait for Dialog's viewport frame and the growing textarea to finish layout.
    const schedule=()=>{
      if(frame!==undefined)cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{frame=undefined;measure();});});
    };
    // WebKit can apply its native caret scroll after viewport resize/paint.
    const settle=()=>{
      schedule();
      clearTimeout(settledTimer);
      settledTimer=setTimeout(schedule,350);
    };
    visibilityRef.current=settle;
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
    if(scrollRef.current)observer?.observe(scrollRef.current);
    if(textRef.current)observer?.observe(textRef.current);
    window.visualViewport?.addEventListener('resize',settle);
    window.visualViewport?.addEventListener('scroll',settle);
    document.addEventListener?.('selectionchange',schedule);
    return()=>{
      visibilityRef.current=()=>{};
      if(frame!==undefined)cancelAnimationFrame(frame);
      clearTimeout(settledTimer);
      observer?.disconnect();
      window.visualViewport?.removeEventListener('resize',settle);
      window.visualViewport?.removeEventListener('scroll',settle);
      document.removeEventListener?.('selectionchange',schedule);
    };
  },[open]);
  const toggleTag=tag=>{if(busy)return;setTagError('');if(!draft.tags.includes(tag)&&draft.tags.length>=8){setTagError('最多选择 8 个标签');return;}patch({tags:draft.tags.includes(tag)?draft.tags.filter(t=>t!==tag):[...draft.tags,tag]});};
  const addTag=e=>{e.preventDefault();if(composing.current)return;try{const [name]=normalizeReviewEvaluationTags([tagInput],{strict:true});if(!name)throw new Error('请输入标签名称');const existing=availableTags.find(tag=>tag.toLocaleLowerCase()===name.toLocaleLowerCase());const tag=existing||name;if(!draft.tags.includes(tag)&&draft.tags.length>=8)throw new Error('最多选择 8 个标签');if(!existing)setCustomTags(old=>[...old,tag]);patch({tags:draft.tags.includes(tag)?draft.tags:[...draft.tags,tag]});setTagInput('');setTagError('');setCustomOpen(false);document.activeElement?.blur();}catch(failure){setTagError(failure.message);}};
  const pickFiles=e=>{const chosen=[...(e.target.files||[])];e.target.value='';setError('');if(chosen.length+files.length+draft.images.length>4){setError('每条评价最多 4 张图片');return;}if(chosen.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<=0||file.size>10*1024*1024)){setError('请选择 10 MB 以内的 JPG、PNG 或 WebP 图片');return;}setFiles(old=>[...old,...chosen.map(file=>({file,url:URL.createObjectURL(file)}))]);};
  const save=async()=>{
    if(busyRef.current||!nonempty)return;busyRef.current=true;setBusy(true);setError('');const uploaded=[];
    try{for(const item of files)uploaded.push(await db.uploadReviewJournalImage(item.file,userId));
      // Freeze a new review's time only when its first database attempt is ready.
      // Upload delays and overnight drafts must not move it to an earlier day;
      // uncertain retries keep this same identity, date and creation instant.
      if(!reply&&submissionTime.current?.id!==draft.id){const now=new Date();submissionTime.current={id:draft.id,createdAt:draft.createdAt||now.toISOString(),date:draft.createdAt?draft.date:localReviewDate(now)};}
      const timing=reply?{}:{createdAt:submissionTime.current.createdAt,date:submissionTime.current.date};
      const submitted={...draft,...timing,score:isReply?null:draft.score,tags:isReply?[]:draft.tags,images:[...draft.images,...uploaded]};patch({...timing,images:submitted.images});files.forEach(item=>URL.revokeObjectURL(item.url));setFiles([]);
      const saved=reply?await db.updateReviewJournalReply(entry,reply,submitted,userId):await db.appendReviewJournalReply(entry,submitted,userId);onSaved(saved);if(!reply){submissionTime.current=null;setDraft(blank());}setCustomOpen(false);onClose();
    }catch(failure){if(uploaded.length&&uploaded.length<files.length){patch({images:[...draft.images,...uploaded]});files.slice(0,uploaded.length).forEach(item=>URL.revokeObjectURL(item.url));setFiles(old=>old.slice(uploaded.length));}setError(failure?.message||(reply?'保存失败，修改已保留，请重试。':'发布失败，内容已保留，请重试。'));}
    finally{busyRef.current=false;setBusy(false);}
  };
  const dismiss=()=>{if(busyRef.current)return;setPicker('');setCustomOpen(false);onClose();};
  const remember=()=>{if(textRef.current)selection.current={start:textRef.current.selectionStart,end:textRef.current.selectionEnd};};
  const insertQuote=()=>{
    if(busyRef.current||reply||entry.visibility!=='public')return;
    const start=Math.max(0,Math.min(selection.current.start,draft.text.length)),end=Math.max(start,Math.min(selection.current.end,draft.text.length));
    const before=draft.text.slice(0,start),after=draft.text.slice(end),mention=`${before&&!/\s$/.test(before)?' ':''}@Quote${/^\s/.test(after)?'':' '}`;
    if(before.length+mention.length+after.length>20000){setError('正文已达到字数上限。');return;}
    patch({text:before+mention+after});selection.current={start:start+mention.length,end:start+mention.length};
    requestAnimationFrame(()=>{textRef.current?.focus({preventScroll:true});textRef.current?.setSelectionRange(selection.current.start,selection.current.end);keepInputVisible();});
  };
  const initialDate=entry.date>getVixComparisonExpectedCloseDate()?getVixComparisonExpectedCloseDate():entry.date;
  if(!open)return null;
  return <Dialog title={reply?isReply?'修改回复':'修改评价':isReply?'回复评论':'写评价'} wide composer onClose={dismiss} headerAction={<button className="rj-publish" disabled={busy||!nonempty} onClick={save}>{busy?<Loader2 className="rj-spin" size={16}/>:reply?'保存':'发布'}</button>}>
    <div className="rj-compose-scroll" ref={scrollRef}><div className="rev-original"><time>回看 · {entry.date}</time><p>{entry.text}</p></div><div className="rj-compose-author">{identityNode}</div>{target&&target.available!==false&&<p className="rev-reply-target">{`回复 @${target.nickname||'Quote 用户'}`}</p>}<div className="rj-compose-content rev-compose-content">{!isReply&&<><div className="rev-score-label"><span>给当时的判断打个分</span>{draft.score&&<button disabled={busy} onClick={()=>patch({score:null})}>清除</button>}</div><div className="rev-score-row"><div className="rev-rating-input" role="slider" tabIndex={busy?-1:0} aria-label="评价评分" aria-valuemin={0} aria-valuemax={10} aria-valuenow={draft.score||0} aria-valuetext={draft.score?`${draft.score} 分，共 10 分`:'未评分'} onPointerDown={e=>{if(busy)return;const box=e.currentTarget.getBoundingClientRect();patch({score:Math.max(1,Math.min(10,Math.ceil((e.clientX-box.left)/box.width*10)))});}} onKeyDown={e=>{if(busy)return;if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const score=e.key==='Home'?0:e.key==='End'?10:Math.max(0,Math.min(10,(draft.score||0)+(['ArrowRight','ArrowUp'].includes(e.key)?1:-1)));patch({score:score||null});}}}>{[0,1,2,3,4].map(i=><RatingStar key={i} fill={Math.min(1,Math.max(0,(draft.score||0)/2-i))}/>)}</div><div className="rev-score-number"><strong>{draft.score||'—'}</strong><span>{draft.score?'分':'未评分'}</span></div></div><p className="rev-hint">轻点选星 · 支持半星 · 评分可留空</p><div className="rev-tag-toolbar"><div className="rev-tag-options">{availableTags.map(tag=><button key={tag} type="button" disabled={busy} aria-pressed={draft.tags.includes(tag)} onClick={()=>toggleTag(tag)}>{tag}</button>)}</div><button className="rev-custom-trigger" disabled={busy} aria-expanded={customOpen} onClick={()=>{setCustomOpen(!customOpen);setTagError('');requestAnimationFrame(()=>tagRef.current?.focus());}}>＋ 自定义</button></div>
      {customOpen&&<form className="rev-custom-form" onSubmit={addTag}><label htmlFor="rev-custom-tag">自定义评价标签</label><div><input id="rev-custom-tag" ref={tagRef} value={tagInput} placeholder="例如：耐心不足" maxLength={48} disabled={busy} onFocus={keepInputVisible} onChange={e=>{setTagInput(e.target.value);setTagError('');keepInputVisible();}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&(composing.current||e.nativeEvent.isComposing||e.keyCode===229))e.preventDefault();}}/><button type="submit">添加</button><button type="button" onClick={()=>{setCustomOpen(false);setTagInput('');setTagError('');}}>取消</button></div><small>最多 12 个字符，添加后自动选中</small></form>}{tagError&&<p className="rj-error" role="alert">{tagError}</p>}</>}
      <div className="rj-writing-area" data-text={draft.text}><textarea ref={textRef} className="rj-body-input" rows={1} aria-label="评价正文" placeholder={isReply?'写下你的回复…':'现在回看，哪里做对了，哪里需要改进？'} value={draft.text} maxLength={20000} disabled={busy} onFocus={keepInputVisible} onChange={e=>{patch({text:e.target.value});remember();keepInputVisible();}} onSelect={()=>{remember();keepInputVisible();}} onKeyUp={keepInputVisible} onBlur={remember}/></div>
      {draft.market&&<div className="rj-compose-attachment"><SnapshotCard value={draft.market} language={language}/><button className="rj-remove" aria-label="移除市场快照" disabled={busy} onClick={()=>patch({market:null})}><X size={14}/></button></div>}
      {draft.account&&<div className="rj-compose-attachment"><ReviewAccountCard value={draft.account} marketColorMode={marketColorMode}/><button className="rj-remove" aria-label="移除账户快照" disabled={busy} onClick={()=>patch({account:null})}><X size={14}/></button></div>}
      {!!draft.trades.length&&<div className="rj-compose-attachment"><ReviewTradeReferences trades={draft.trades} userId={userId} language={language} previewHistory={preview?previewData?.history:undefined}/><button className="rj-remove" aria-label="移除交易引用" disabled={busy} onClick={()=>patch({trades:[]})}><X size={14}/></button></div>}
      {!!draft.images.length&&<div className={`rj-photo-grid rj-images-${draft.images.length}`}>{draft.images.map((item,index)=><div className="rj-compose-attachment" key={item.path}>{renderPhotos([item])}<button type="button" className="rj-remove" aria-label={`移除已上传图片 ${index+1}`} disabled={busy} onClick={()=>{if(busyRef.current)return;setDraft(old=>({...old,images:old.images.filter(image=>image.path!==item.path)}));}}><X size={14}/></button></div>)}</div>}{!!files.length&&<div className="rj-photo-grid">{files.map((item,index)=><div className="rj-compose-attachment" key={item.url}><img className="rev-local-photo" src={item.url} alt="待添加图片"/><button className="rj-remove" aria-label="移除待上传图片" disabled={busy} onClick={()=>{URL.revokeObjectURL(item.url);setFiles(old=>old.filter((_,i)=>i!==index));}}><X size={14}/></button></div>)}</div>}{error&&<p className="rj-error" role="alert">{error}</p>}
    </div></div><div className="rj-compose-toolbar">{[['trades',LineChart,'交易'],['market',Activity,'市场'],['account',Wallet,'账户'],['images',ImagePlus,'图片'],['emoji',Smile,'表情']].map(([id,Icon,label])=><button key={id} disabled={busy} onClick={()=>id==='images'?fileRef.current?.click():setPicker(id)}><Icon size={20}/><span>{label}</span></button>)}{!reply&&entry.visibility==='public'&&<button type="button" aria-label="@Quote" disabled={busy} onPointerDown={event=>{event.preventDefault();remember();}} onClick={insertQuote}>@Quote</button>}</div><input type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp" multiple hidden onChange={pickFiles}/>
    {picker==='trades'&&<TradePicker selected={draft.trades} stockTrades={stockTrades} userId={userId} onChange={trades=>patch({trades})} onClose={()=>setPicker('')} Dialog={Dialog} relatedSymbols={entry.stocks||[]}/>}
    {picker==='market'&&<SnapshotPicker userId={userId} language={language} recordDate={draft.date} initialDate={initialDate} value={draft.market} onChange={market=>patch({market})} onClose={()=>setPicker('')} previewData={preview?previewData?.market:undefined}/>}
    {picker==='account'&&<AccountPicker value={draft.account} initialDate={entry.date} recordDate={entry.date} db={db} userId={userId} preview={preview} previewAccount={previewData?.account} onChange={account=>patch({account})} onClose={()=>setPicker('')} Dialog={Dialog} marketColorMode={marketColorMode}/>}
    {picker==='emoji'&&<EmojiPicker onSelect={emoji=>{const {start,end}=selection.current;patch({text:draft.text.slice(0,start)+emoji+draft.text.slice(end)});selection.current={start:start+emoji.length,end:start+emoji.length};}} onClose={()=>{setPicker('');requestAnimationFrame(()=>{textRef.current?.focus({preventScroll:true});textRef.current?.setSelectionRange(selection.current.start,selection.current.end);});}}/>}
  </Dialog>;
}
