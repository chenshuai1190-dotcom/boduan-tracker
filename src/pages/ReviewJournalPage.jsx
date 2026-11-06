import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Search, Plus, MoreHorizontal, Pin, MessageCircle, ImagePlus, LineChart, Activity, Smile, X, Check, ChevronRight, Loader2, Pencil, Trash2, User } from 'lucide-react';
import UserAvatar from '../components/UserAvatar.jsx';
import { subscribeCommunityAvatar } from '../lib/communityAvatarDb.js';
import { emptyReviewEntry, localReviewDate, reviewDraftKey, reviewJournalFeed, restoreReviewDraft } from '../lib/reviewJournalFeed.js';
import ReviewStockReplay from '../components/ReviewStockReplay.jsx';
import { SnapshotCard, SnapshotPicker } from '../components/ReviewMarketSnapshot.jsx';
import './ReviewJournalPage.css';

let dialogCount = 0;
let previousBodyOverflow = '';
function Dialog({ title, onClose, children, wide = false, headerAction }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [frame, setFrame] = useState(null);
  useEffect(() => {
    const lastFocus = document.activeElement;
    if (dialogCount++ === 0) { previousBodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    ref.current?.focus({ preventScroll: true });
    const update = () => { const v = window.visualViewport; setFrame(v ? { top: v.offsetTop, height: v.height } : null); };
    const key = event => {
      if (document.querySelector('dialog[open]') || [...document.querySelectorAll('[data-rj-dialog]')].at(-1) !== ref.current) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); }
      if (event.key === 'Tab') {
        const nodes = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length);
        const first = nodes[0]; const last = nodes.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
      }
    };
    update(); window.visualViewport?.addEventListener('resize', update); window.visualViewport?.addEventListener('scroll', update); document.addEventListener('keydown', key);
    return () => { if (--dialogCount === 0) document.body.style.overflow = previousBodyOverflow; window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); document.removeEventListener('keydown', key); if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<>{wide && <div className="rj-screen-mask" aria-hidden="true"/>}<div className={`rj-overlay ${wide ? 'rj-overlay-wide' : ''}`} style={frame || undefined} onClick={event => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section ref={ref} tabIndex={-1} data-rj-dialog role="dialog" aria-modal="true" aria-label={title} className={`rj-dialog ${wide ? 'rj-dialog-wide' : ''}`}>
      <header className="rj-dialog-header"><button type="button" className="rj-icon" aria-label="关闭" onClick={onClose}><X size={21} /></button><h2>{title}</h2>{headerAction || <span className="rj-header-spacer" />}</header>
      {children}
    </section>
  </div></>, document.body);
}
function Avatar({ identity, userId, preview }) { return identity?.avatarKey ? <span className="rj-avatar"><UserAvatar userId={preview ? undefined : userId} avatarKey={identity.avatarKey} avatarPath={preview ? null : undefined} /></span> : <span className="rj-avatar rj-avatar-empty"><User size={20} /></span>; }
function Photo({ item, db, userId, preview, onOpen }) {
  const ref = useRef(null); const live = useRef(true); const refreshing = useRef(false);
  const [url, setUrl] = useState(''); const [failed, setFailed] = useState(false); const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0); const autoRetry = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!window.IntersectionObserver) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    if (ref.current) observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return; let active = true; setUrl(''); setFailed(false);
    if (preview && item.previewUrl) { setUrl(item.previewUrl); return; }
    db.resolveReviewJournalImage(item.path, userId).then(value => { if (active) setUrl(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [db, item.path, item.previewUrl, preview, userId, visible, attempt]);
  const open = async () => {
    if (failed) { autoRetry.current = false; setAttempt(value => value + 1); return; }
    if (refreshing.current) return; refreshing.current = true;
    try { const fresh = preview ? url : await db.resolveReviewJournalImage(item.path, userId); if (live.current) onOpen(fresh); }
    catch { if (live.current) setFailed(true); } finally { refreshing.current = false; }
  };
  return <button ref={ref} type="button" className="rj-photo" onClick={open} disabled={!url && !failed} aria-label={failed ? '重试读取图片' : '查看图片'}>
    {url && !failed ? <img src={url} alt={item.name || '复盘图片'} loading="lazy" onError={() => { if (!preview && !autoRetry.current) { autoRetry.current = true; setAttempt(value => value + 1); } else setFailed(true); }} /> : <span>{failed ? '图片暂不可用 · 点此重试' : '加载图片…'}</span>}
  </button>;
}
const EMOJI_GROUPS = [
  ['常用', ['🙂','😊','😂','🥹','🤔','😎','😭','😅','👍','👏','🙏','💪','❤️','🔥','✨','🎉','📈','📉','💰','🎯','📝','✅','⚠️','💡']],
  ['表情', ['😀','😄','😁','🤣','🥰','😍','🤩','🥳','😌','😉','🙃','🫠','😐','😮','😱','😰','😨','😤','😡','🤯','🧐','🤫','🫡','😴']],
  ['投资', ['📊','📈','📉','💵','💸','💰','🏦','⚖️','🧭','🎯','🛡️','🧠','🔍','📝','📌','⏳','🚀','🐂','🐻','💎','✋','🔔','🟢','🔴']],
  ['符号', ['❤️','🧡','💛','💚','💙','💜','🤍','🖤','✅','❌','❗','❓','⚠️','💯','⭐','✨','➕','➖','⬆️','⬇️','🔄','✔️','☀️','🌙']],
];
function EmojiPicker({ onSelect, onClose }) {
  const [group, setGroup] = useState(0);
  return <Dialog title="插入表情" onClose={onClose} headerAction={<button className="rj-text-button" onClick={onClose}>完成</button>}><div className="rj-dialog-body"><div className="rj-chip-row">{EMOJI_GROUPS.map(([name], i) => <button key={name} aria-pressed={group === i} onClick={() => setGroup(i)}>{name}</button>)}</div><div className="rj-emoji-grid">{EMOJI_GROUPS[group][1].map(emoji => <button key={emoji} onClick={() => onSelect(emoji)} aria-label={`插入 ${emoji}`}>{emoji}</button>)}</div></div></Dialog>;
}
function SymbolPicker({ selected, suggestions, onChange, onClose }) {
  const [input, setInput] = useState(''); const [error, setError] = useState('');
  const add = raw => { const symbol = raw.trim().toUpperCase(); if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) { setError('请输入有效的美股代码'); return; } if (!selected.includes(symbol) && selected.length >= 4) { setError('每条最多关联 4 只股票'); return; } onChange(selected.includes(symbol) ? selected.filter(s => s !== symbol) : [...selected, symbol]); setInput(''); setError(''); };
  return <Dialog title="关联股票" onClose={onClose} headerAction={<button className="rj-text-button" onClick={onClose}>完成</button>}><div className="rj-dialog-body"><form className="rj-symbol-search" onSubmit={event => { event.preventDefault(); add(input); }}><input aria-label="输入股票代码" value={input} onChange={event => setInput(event.target.value)} placeholder="输入股票代码，例如 NVDA" autoCapitalize="characters" /><button className="rj-icon" aria-label="添加股票" type="submit"><Plus size={20} /></button></form>{error && <p role="alert" className="rj-error">{error}</p>}<div className="rj-chip-row rj-stock-choices">{[...new Set([...selected, ...suggestions, 'NVDA','TSM','SMH','QQQ','SPY','GOOGL'])].slice(0,20).map(symbol => <button key={symbol} aria-pressed={selected.includes(symbol)} onClick={() => add(symbol)}>{symbol}{selected.includes(symbol) && <Check size={14}/>}</button>)}</div><p className="rj-note">关联后可查看价格走势及你的买卖记录，仅做复盘引用。</p></div></Dialog>;
}
function Composer({ entry, defaultType, identity, userId, db, onSaved, onClose, suggestions, preview, previewMarket, language }) {
  const key = reviewDraftKey(userId);
  const [draft, setDraft] = useState(() => { if (entry) return { ...emptyReviewEntry(entry.type), ...entry }; try { const saved = key && sessionStorage.getItem(key); if (saved) { const parsed = JSON.parse(saved); if (parsed) return restoreReviewDraft(parsed,userId,defaultType); } } catch { /* A blocked session store does not block writing. */ } return emptyReviewEntry(defaultType); });
  const [files, setFiles] = useState([]); const filesRef = useRef([]); filesRef.current = files;
  const [picker, setPicker] = useState(''); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [error, setError] = useState(''); const [closing, setClosing] = useState(false);
  const textarea = useRef(null); const fileInput = useRef(null); const selection = useRef({ start: draft.text.length, end: draft.text.length });
  const patch = value => setDraft(current => ({ ...current, ...value }));
  const rememberCursor = () => { if (textarea.current) selection.current = { start: textarea.current.selectionStart, end: textarea.current.selectionEnd }; };
  useEffect(() => { if (entry || !key) return; try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* UI still works if storage is full. */ } }, [draft, entry, key]);
  useEffect(() => () => filesRef.current.forEach(file => URL.revokeObjectURL(file.url)), []);
  const dismiss = () => { if (busyRef.current) return; if (draft.text.trim() || draft.stocks.length || draft.images.length || files.length || draft.market) setClosing(true); else onClose(); };
  const pickFiles = event => {
    const chosen = [...(event.target.files || [])]; event.target.value = ''; setError('');
    if (chosen.length + files.length + draft.images.length > 4) { setError('每条最多 4 张图片'); return; }
    if (chosen.some(file => !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)) { setError('请选择不超过 10 MB 的 JPG、PNG 或 WebP 图片'); return; }
    setFiles(old => [...old, ...chosen.map(file => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const save = async () => {
    if (busyRef.current) return;
    if (!draft.text.trim() && !files.length && !draft.images.length && !draft.stocks.length && !draft.market) return;
    busyRef.current = true; setBusy(true); setError(''); const uploaded = [];
    try {
      for (const { file } of files) uploaded.push(await db.uploadReviewJournalImage(file, userId));
      // Retain successful uploads on uncertain saves; retry references the same objects.
      patch({ images: [...draft.images, ...uploaded] });
      files.forEach(({url}) => URL.revokeObjectURL(url));
      setFiles([]);
      const saved = await db.saveReviewJournalEntry({ ...draft, images: [...draft.images, ...uploaded] }, userId);
      if (!entry && key) { try { sessionStorage.removeItem(key); } catch { /* A successful server write is not undone by local storage. */ } }
      // Delete removed objects only AFTER a successful row update. A failure is recoverable by storage cleanup.
      const retained = new Set(saved.images.map(image => image.path));
      await Promise.allSettled((entry?.images || []).filter(image => !retained.has(image.path)).map(image => db.removeReviewJournalImage(image.path, userId)));
      onSaved(saved); onClose();
    } catch (failure) {
      if (uploaded.length && uploaded.length < files.length) {
        patch({images:[...draft.images,...uploaded]});
        files.slice(0,uploaded.length).forEach(({url})=>URL.revokeObjectURL(url));
        setFiles(old=>old.slice(uploaded.length));
      }
      setError(failure?.message || '保存失败，请重试');
    } finally { busyRef.current = false; setBusy(false); }
  };
  const insertEmoji = emoji => { const { start, end } = selection.current; setDraft(old => ({ ...old, text: old.text.slice(0, start) + emoji + old.text.slice(end) })); selection.current = { start: start + emoji.length, end: start + emoji.length }; };
  const restoreCursor = () => { setPicker(''); requestAnimationFrame(() => { textarea.current?.focus({ preventScroll: true }); textarea.current?.setSelectionRange(selection.current.start, selection.current.end); }); };
  return <Dialog title={entry ? '编辑复盘' : '写复盘'} wide onClose={dismiss} headerAction={<button type="button" className="rj-publish" disabled={busy || (!draft.text.trim() && !files.length && !draft.images.length && !draft.stocks.length && !draft.market)} onClick={save}>{busy ? <Loader2 size={16} className="rj-spin" /> : entry ? '保存' : '发布'}</button>}>
    <div className="rj-compose-scroll"><div className="rj-compose-author"><Avatar identity={identity} userId={userId} preview={preview}/><div><strong>{identity?.nickname || '昵称加载中'}</strong><span>仅自己可见</span></div></div>
      <div className="rj-compose-content"><div className="rj-compose-meta"><select aria-label="记录类型" disabled={Boolean(entry) || busy} value={draft.type} onChange={event => patch({type:event.target.value})}><option value="log">复盘日志</option><option value="insight">投资心得</option></select><input type="date" aria-label="记录日期" value={draft.date} max={localReviewDate()} onChange={event => patch({date:event.target.value})} disabled={busy}/></div>
      <textarea ref={textarea} className="rj-body-input" aria-label="复盘正文" placeholder="这一刻，有什么想记录的？" value={draft.text} maxLength={20000} disabled={busy} onChange={event => { patch({text:event.target.value}); rememberCursor(); }} onSelect={rememberCursor} onKeyUp={rememberCursor} onBlur={rememberCursor}/>
      {!!draft.stocks.length && <div className="rj-chip-row">{draft.stocks.map(symbol => <button key={symbol} disabled={busy} onClick={() => patch({stocks:draft.stocks.filter(s=>s!==symbol)})}>${symbol}<X size={12}/></button>)}</div>}
      {draft.market && <div className="rj-compose-attachment"><SnapshotCard value={draft.market} language={language}/><button className="rj-remove" aria-label="移除市场快照" disabled={busy} onClick={()=>patch({market:null})}><X size={15}/></button></div>}
      <div className="rj-photo-grid">{draft.images.map(item => <div className="rj-compose-attachment" key={item.path}><Photo item={item} db={db} userId={userId} preview={preview} onOpen={()=>{}}/><button className="rj-remove" aria-label="移除图片" disabled={busy} onClick={()=>patch({images:draft.images.filter(image=>image.path!==item.path)})}><X size={15}/></button></div>)}{files.map(({url}, i)=><div className="rj-compose-attachment" key={url}><img className="rj-local-photo" alt="待上传图片" src={url}/><button className="rj-remove" disabled={busy} aria-label="移除待上传图片" onClick={()=>{URL.revokeObjectURL(url);setFiles(old=>old.filter((_,index)=>index!==i));}}><X size={15}/></button></div>)}</div>
      {draft.mood && <p className="rj-note">{draft.mood}</p>}{error && <p className="rj-error" role="alert">{error}</p>}{preview && <p className="rj-note">本地示例 · 保存仅在当前预览中生效</p>}
      </div></div>
    <div className="rj-compose-toolbar"><input hidden ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={pickFiles}/>{[[ImagePlus,'图片',()=>fileInput.current.click()],[LineChart,'股票',()=>setPicker('stock')],[Activity,'市场',()=>setPicker('market')],[Smile,'表情',()=>setPicker('emoji')],[MoreHorizontal,'更多',()=>setPicker('more')]].map(([Icon,label,action])=><button key={label} aria-label={label} disabled={busy} onClick={action}><Icon size={21}/><span>{label}</span></button>)}</div>
    {picker==='stock'&&<SymbolPicker selected={draft.stocks} suggestions={suggestions} onChange={stocks=>patch({stocks})} onClose={()=>setPicker('')}/>}
    {picker==='market'&&<SnapshotPicker userId={userId} language={language} recordDate={draft.date} value={draft.market} onChange={market=>{patch({market});setPicker('');}} onClose={()=>setPicker('')} previewData={preview ? previewMarket : undefined}/>}
    {picker==='emoji'&&<EmojiPicker onSelect={insertEmoji} onClose={restoreCursor}/>}
    {picker==='more'&&<Dialog title="记录设置" onClose={()=>setPicker('')}><div className="rj-dialog-body"><p className="rj-note">记录当时的心情</p><div className="rj-chip-row">{['冷静','谨慎','乐观','焦虑','满意','后悔'].map(mood=><button key={mood} aria-pressed={draft.mood===mood} onClick={()=>patch({mood:draft.mood===mood?'':mood})}>{mood}</button>)}</div>{draft.type==='insight'&&<><p className="rj-note">重要程度</p><div className="rj-chip-row">{[['🟢','一般'],['🔺','重要'],['📣','强调'],['❗','警告']].map(([level,label])=><button key={level} aria-pressed={draft.level===level} onClick={()=>patch({level})}>{label}</button>)}</div></>}</div></Dialog>}
    {closing&&<Dialog title={entry ? '放弃这次修改？' : '保留草稿？'} onClose={()=>setClosing(false)}><div className="rj-dialog-body"><p className="rj-note">{entry?'原有记录不会改变。':files.length?'文字和关联信息会保留；待上传图片需要重新选择。':'下次打开可继续编辑。'}</p><button className="rj-wide-button" onClick={onClose}>{entry?'放弃修改':'保留草稿'}</button>{!entry&&<button className="rj-wide-button rj-danger" onClick={()=>{try{if(key)sessionStorage.removeItem(key);}catch{/* Keep close usable when storage is blocked. */}onClose();}}>放弃草稿</button>}</div></Dialog>}
  </Dialog>;
}

export default function ReviewJournalPage({ ctx }) {
  const { db, userId, language='zh', disciplines=[], reviewLogs=[], setDisciplines, setReviewLogs, stockTrades=[], onBack, previewData } = ctx;
  const preview = Boolean(import.meta.env.DEV && previewData);
  const [identity,setIdentity]=useState(preview ? previewData.identity : null);
  const [identityError,setIdentityError]=useState(false); const [identityAttempt,setIdentityAttempt]=useState(0);
  const [filter,setFilter]=useState('all'); const [search,setSearch]=useState(false); const [query,setQuery]=useState('');
  const [composer,setComposer]=useState(null); const [menu,setMenu]=useState(null); const [detailKey,setDetailKey]=useState(null);
  const [expanded,setExpanded]=useState(new Set()); const [lightbox,setLightbox]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const busyRef=useRef(false);
  const [reply,setReply]=useState(''); const [confirmDelete,setConfirmDelete]=useState(false);
  useEffect(()=>{if(preview)return;let active=true;setIdentityError(false);db.fetchPnlShareIdentity({id:userId}).then(value=>{if(active){setIdentity(value);setIdentityError(!value);}}).catch(()=>{if(active)setIdentityError(true);});return()=>{active=false;};},[db,userId,preview,identityAttempt]);
  useEffect(()=>{if(preview)return undefined;return subscribeCommunityAvatar(userId,()=>setIdentityAttempt(value=>value+1));},[userId,preview]);
  const all=reviewJournalFeed(disciplines,reviewLogs); const feed=reviewJournalFeed(disciplines,reviewLogs,filter,query);
  const entryKey=entry=>`${entry.type}:${entry.id}`;
  const detail=all.find(entry=>entryKey(entry)===detailKey);
  const suggestions=[...new Set(stockTrades.map(row=>String(row.symbol||'').toUpperCase()).filter(Boolean))];
  const saved=entry=>{const setter=entry.type==='insight'?setDisciplines:setReviewLogs;setter(old=>old.some(row=>row.id===entry.id)?old.map(row=>row.id===entry.id?entry:row):[entry,...old]);setError('');};
  const mutate=async action=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await action();}catch(failure){setError(failure?.message||'操作失败，请重试');}finally{busyRef.current=false;setBusy(false);}};
  const openDetail=entry=>{setReply('');setDetailKey(entryKey(entry));};
  const toggleExpanded=entry=>setExpanded(old=>{const next=new Set(old);const key=entryKey(entry);if(next.has(key))next.delete(key);else next.add(key);return next;});
  const post=(entry,full=false)=> <article className="rj-post" key={entryKey(entry)}>
    <Avatar identity={identity} userId={userId} preview={preview}/><div className="rj-post-main"><div className="rj-post-heading"><strong>{identity?.nickname||'昵称加载中'}</strong>{filter!=='all'&&entry.pinned&&<Pin className="rj-inline-pin" size={12} aria-label="已置顶"/>}<span>·</span><time dateTime={entry.date}>{entry.date?.slice(5).replace('-','月')}日</time><button className="rj-icon rj-post-more" aria-label="记录操作" onClick={()=>{setMenu(entry);setConfirmDelete(false);setError('');}}><MoreHorizontal size={19}/></button></div>
      <div className={`rj-post-text ${full||expanded.has(entryKey(entry))||String(entry.text||'').length<=160?'':'rj-clamped'}`}>{entry.text}</div>{!full&&String(entry.text||'').length>160&&<button className="rj-text-button rj-expand" onClick={()=>toggleExpanded(entry)}>{expanded.has(entryKey(entry))?'收起':'展开全文'}</button>}
      {!!entry.images?.length&&<div className={`rj-photo-grid rj-images-${entry.images.length}`}>{entry.images.map(item=><Photo key={item.path} item={item} db={db} userId={userId} preview={preview} onOpen={setLightbox}/>)}</div>}
      {(entry.stocks||[]).map(symbol=><ReviewStockReplay key={symbol} symbol={symbol} stockTrades={stockTrades} userId={userId} language={language} previewHistory={preview?previewData.history:undefined}/>)}
      {entry.market&&<SnapshotCard value={entry.market} language={language}/>}
      {!full&&<div className="rj-post-actions"><button onClick={()=>openDetail(entry)} aria-label="查看补记"><MessageCircle size={18}/><span>{entry.replies?.length||'补记'}</span></button><button onClick={()=>openDetail(entry)} className="rj-detail-link">查看记录<ChevronRight size={14}/></button></div>}
    </div></article>;
  return <div className="rj-page"><header className="rj-page-header"><button className="rj-icon" aria-label="返回" onClick={onBack}><ArrowLeft size={22}/></button><h1>复盘</h1><button className="rj-icon" aria-label="搜索复盘" aria-pressed={search} onClick={()=>{setSearch(!search);setQuery('');}}><Search size={21}/></button></header>
    {preview&&<div className="rj-preview-note">本地预览 · 示例记录 · 不写入真实账户</div>}
    {identityError&&<button className="rj-identity-error" onClick={()=>setIdentityAttempt(value=>value+1)}>昵称暂未读取，点击重试</button>}
    <nav className="rj-tabs" aria-label="复盘分类">{[['all','全部'],['insight','投资心得'],['log','复盘日志']].map(([id,name])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{name}</button>)}</nav>
    {search&&<div className="rj-search"><Search size={17}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} aria-label="搜索正文、股票或日期" placeholder="搜索正文、股票或日期"/></div>}
    <button className="rj-compose-prompt" onClick={()=>setComposer({entry:null})}><Avatar identity={identity} userId={userId} preview={preview}/><span>记录想法，留给未来的自己</span><Pencil size={19}/></button>
    {error&&!menu&&<p className="rj-error" role="alert">{error}</p>}
    <div className="rj-feed">{feed.map(entry=>post(entry))}{!feed.length&&<div className="rj-empty"><MessageCircle size={28}/><h2>{query?'没有匹配的记录':'从第一条复盘开始'}</h2><p>{query?'换个关键词试试':'投资心得和复盘日志，都在这里。'}</p></div>}</div>
    <button className="rj-fab" aria-label="写复盘" onClick={()=>setComposer({entry:null})}><Plus size={28}/></button>
    {detail&&<Dialog title="复盘记录" wide onClose={()=>setDetailKey(null)}><div className="rj-detail-scroll">{post(detail,true)}<section className="rj-replies"><h3>后来的想法</h3>{(detail.replies||[]).map(item=><div className="rj-reply" key={item.id}><Avatar identity={identity} userId={userId} preview={preview}/><div><strong>{identity?.nickname}</strong><time>{item.date}</time><p>{item.text}</p></div></div>)}{!detail.replies?.length&&<p className="rj-note">随着时间，补上新的观察。</p>}<textarea aria-label="补充想法" placeholder="补充后来的想法…" maxLength={5000} value={reply} onChange={event=>setReply(event.target.value)} disabled={busy}/>{error&&<p role="alert" className="rj-error">{error}</p>}<button className="rj-publish" disabled={busy||!reply.trim()} onClick={()=>mutate(async()=>{saved(await db.saveReviewJournalEntry({...detail,replies:[...(detail.replies||[]),{id:crypto.randomUUID(),date:localReviewDate(),text:reply.trim()}]},userId));setReply('');})}>添加补记</button></section></div></Dialog>}
    {menu&&<Dialog title={confirmDelete?'删除这条记录？':'记录操作'} onClose={()=>{if(!busy){setMenu(null);setConfirmDelete(false);setError('');}}}><div className="rj-dialog-body">{error&&<p className="rj-error" role="alert">{error}</p>}{confirmDelete?<><p className="rj-note">正文、关联信息及补记将一起删除。</p><button className="rj-wide-button rj-danger" disabled={busy} onClick={()=>mutate(async()=>{await db.deleteReviewJournalEntry(menu,userId);await Promise.allSettled([...new Set([...(menu.images||[]),...(menu.replies||[]).flatMap(item=>item.images||[])].map(image=>image.path))].map(path=>db.removeReviewJournalImage(path,userId)));(menu.type==='insight'?setDisciplines:setReviewLogs)(old=>old.filter(row=>row.id!==menu.id));setMenu(null);if(detailKey===entryKey(menu))setDetailKey(null);})}>确认删除</button></>:<><button className="rj-menu-item" onClick={()=>{setComposer({entry:menu});setMenu(null);}}><Pencil size={18}/>编辑记录</button>{filter!=='all'&&<button className="rj-menu-item" disabled={busy} onClick={()=>mutate(async()=>{saved(await db.saveReviewJournalEntry({...menu,pinned:!menu.pinned},userId));setMenu(null);})}><Pin size={18}/>{menu.pinned?'取消置顶':'置顶'}</button>}<button className="rj-menu-item rj-danger" onClick={()=>setConfirmDelete(true)}><Trash2 size={18}/>删除记录</button></>}</div></Dialog>}
    {composer&&<Composer entry={composer.entry} defaultType={filter==='insight'?'insight':'log'} identity={identity} userId={userId} db={db} language={language} onSaved={saved} onClose={()=>setComposer(null)} suggestions={suggestions} preview={preview} previewMarket={previewData?.market}/>}
    {lightbox&&<Dialog title="图片" wide onClose={()=>setLightbox('')}><div className="rj-lightbox"><img src={lightbox} alt="复盘图片原图"/></div></Dialog>}
  </div>;
}
