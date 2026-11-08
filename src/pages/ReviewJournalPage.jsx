import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Search, Plus, MoreHorizontal, Pin, MessageCircle, ImagePlus, LineChart, Activity, Smile, X, Check, Loader2, Pencil, Trash2, User, ChevronDown, Bell } from 'lucide-react';
import { getCommunityAvatarOption } from '../lib/communityProfile.js';
import { isCommunityAvatarSignedUrl, normalizeCommunityAvatarPath } from '../lib/communityAvatarModel.js';
import { isReviewAvatarDataUrl } from '../lib/reviewIdentityStorage.js';
import { emptyReviewEntry, localReviewDate, reviewDraftKey, reviewJournalFeed, restoreReviewDraft } from '../lib/reviewJournalFeed.js';
import { readReviewAudiencePreference, writeReviewAudiencePreference } from '../lib/reviewAudiencePreferences.js';
import { findReviewStockMentions, resolveReviewStockLinks } from '../lib/reviewStockMentions.js';
import ReviewStockCarousel from '../components/ReviewStockCarousel.jsx';
import ReviewPostBody from '../components/ReviewPostBody.jsx';
import { reviewCommentPostsForDetail, reviewAuthorCommentForManagement, reviewCommunityPostAllowed } from '../lib/reviewThreadContext.js';
import ReviewPublicFeed, { ReviewCommentThreads, ReviewCommunityEvaluations, ReplyBody } from '../components/ReviewPublicFeed.jsx';
import ReviewTimeline from '../components/ReviewTimeline.jsx';
import ReviewTimelinePost from '../components/ReviewTimelinePost.jsx';
import { ReviewSystemAvatar, ReviewSystemName } from '../components/ReviewSystemIdentity.jsx';
import ReviewPreferences from '../components/ReviewPreferences.jsx';
import QuoteAssistantWorkbench from '../components/QuoteAssistantWorkbench.jsx';
import { quoteAssistantApi } from '../lib/quoteAssistantApi.js';
import { createQuoteAssistantSaveBridge } from '../lib/quoteAssistantTriggers.js';
import useReviewPreferences from '../hooks/useReviewPreferences.js';
import ReviewNotifications from '../components/ReviewNotifications.jsx';
import useReviewNotificationCount from '../hooks/useReviewNotificationCount.js';
import { mergeReviewTimelineFeed, reviewTimelineFeedDate } from '../lib/reviewTimelineFeed.js';
import { groupReviewTimelineEvents } from '../lib/reviewTimelineGroups.js';
import { findReviewEntryByKey, projectReviewTimelineEntry, resolveReviewReplySource, resolveReviewTimelineEvent, reviewTimelineAnchorEntry, reviewTimelineReplyKey } from '../lib/reviewTimelineEntries.js';
import { SnapshotCard, SnapshotPicker } from '../components/ReviewMarketSnapshot.jsx';
import ReviewEvaluationComposer, { EvaluationRating, ReviewAccountCard, ReviewTradeReferences } from '../components/ReviewEvaluation.jsx';
import ReviewActivityTime from '../components/ReviewActivityTime.js';
import './ReviewJournalPage.css';

let dialogCount = 0;
let previousBodyOverflow = '';
function Dialog({ title, onClose, children, wide = false, composer = false, headerAction }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [frame, setFrame] = useState(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const lastFocus = document.activeElement;
    if (dialogCount++ === 0) { previousBodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    ref.current?.focus({ preventScroll: true });
    const update = () => {
      const v = window.visualViewport;
      setFrame(v ? { top: v.offsetTop, height: v.height } : null);
      setKeyboardOpen(Boolean(v && Math.abs(v.scale - 1) < 0.05 && window.innerHeight - v.height > 120));
    };
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
  return createPortal(<>{wide && <div className="rj-screen-mask" aria-hidden="true"/>}<div className={`rj-overlay ${wide ? 'rj-overlay-wide' : ''} ${composer ? 'rj-overlay-composer' : ''}`} style={frame || undefined} onClick={event => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section ref={ref} tabIndex={-1} data-rj-dialog data-keyboard-open={composer && keyboardOpen ? 'true' : undefined} role="dialog" aria-modal="true" aria-label={title} className={`rj-dialog ${wide ? 'rj-dialog-wide' : ''} ${composer ? 'rj-composer' : ''}`}>
      <header className="rj-dialog-header"><button type="button" className="rj-icon" aria-label="关闭" onClick={onClose}><X size={21} /></button><h2>{title}</h2>{headerAction || <span className="rj-header-spacer" />}</header>
      {children}
    </section>
  </div></>, document.body);
}
const loadedJournalAvatars = new Map();
function cachedJournalAvatar(userId, path, url) {
  const cached = url && loadedJournalAvatars.get(`${userId}:${url}`);
  return cached?.path === path && cached.until > Date.now() ? cached : null;
}
function Avatar(props) {
  return <JournalAvatar key={props.preview ? 'preview' : props.userId || 'signed-out'} {...props} />;
}
function JournalAvatar({ identity, userId, preview }) {
  const path = !preview && userId && normalizeCommunityAvatarPath(identity?.avatarPath, userId);
  const customUrl = path && isCommunityAvatarSignedUrl(identity?.avatarUrl, { supabaseUrl: import.meta.env.VITE_SUPABASE_URL, path }) ? identity.avatarUrl : '';
  const localAvatar = path && isReviewAvatarDataUrl(identity?.avatarDataUrl) ? { path, url: identity.avatarDataUrl } : null;
  const cached = cachedJournalAvatar(userId, path, customUrl);
  const [loaded, setLoaded] = useState(() => cached);
  const [failedSource, setFailedSource] = useState('');
  useEffect(() => {
    if (!customUrl) return undefined;
    const known = cachedJournalAvatar(userId, path, customUrl);
    if (known) { setLoaded(known); return undefined; }
    let active = true;
    const image = new Image();
    const finish = success => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      image.onload = null; image.onerror = null;
      if (success) {
        const value = { path, url: customUrl, until: Date.now() + 480000 };
        loadedJournalAvatars.set(`${userId}:${customUrl}`, value);
        while (loadedJournalAvatars.size > 32) loadedJournalAvatars.delete(loadedJournalAvatars.keys().next().value);
        setLoaded(value);
      }
    };
    const timer = setTimeout(() => finish(false), 8000);
    image.decoding = 'async'; image.crossOrigin = 'anonymous';
    image.onload = () => finish(true); image.onerror = () => finish(false);
    image.src = customUrl;
    if (image.complete && image.naturalWidth > 0) finish(true);
    return () => { active = false; clearTimeout(timer); image.onload = null; image.onerror = null; };
  }, [customUrl, path, userId]);
  // A pending replacement keeps the same owner's decoded image. The keyed
  // wrapper above discards it immediately when the account changes.
  const preset = preview || identity?.avatarPath === null;
  const shown = preset ? null : localAvatar || cached || loaded;
  const source = shown?.url || (preset && identity?.avatarKey ? getCommunityAvatarOption(identity.avatarKey).src : '');
  if (!identity?.avatarKey || !source || failedSource === source) {
    return <span className="rj-avatar rj-avatar-empty" aria-hidden="true"><User size={20} /></span>;
  }
  return <span className="rj-avatar"><img key={source} src={source} alt="" draggable={false} data-custom-avatar={Boolean(shown)} crossOrigin={shown ? 'anonymous' : undefined} onError={() => {
    setFailedSource(source);
    if (shown) {
      loadedJournalAvatars.delete(`${userId}:${source}`);
      setLoaded(value => value?.url === source ? null : value);
    }
  }} /></span>;
}
function AuthorName({ identity }) {
  return identity?.nickname ? <strong>{identity.nickname}</strong> : <strong className="rj-author-placeholder"><span className="rj-name-skeleton" aria-hidden="true" /><span className="rj-visually-hidden">作者资料加载中</span></strong>;
}
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
function SymbolPicker({ selected, suggestions, text = '', onChange, onClose }) {
  const [input, setInput] = useState(''); const [error, setError] = useState('');
  const mentioned = findReviewStockMentions(text, [...selected, ...suggestions]);
  const choices = [...new Set([...mentioned, ...selected, ...suggestions, 'NVDA','TSM','SMH','QQQ','SPY','GOOGL'])];
  const visibleChoices = choices.filter((symbol, index) => index < 20 || selected.includes(symbol));
  const add = raw => { const symbol = raw.trim().toUpperCase(); if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) { setError('请输入有效的美股代码'); return; } if (!selected.includes(symbol) && selected.length >= 4) { setError('每条最多关联 4 只股票'); return; } onChange(selected.includes(symbol) ? selected.filter(s => s !== symbol) : [...selected, symbol]); setInput(''); setError(''); };
  return <Dialog title="关联股票" onClose={onClose} headerAction={<button className="rj-text-button" onClick={onClose}>完成</button>}><div className="rj-dialog-body"><form className="rj-symbol-search" onSubmit={event => { event.preventDefault(); add(input); }}><input aria-label="输入股票代码" value={input} onChange={event => setInput(event.target.value)} placeholder="输入股票代码，例如 NVDA" autoCapitalize="characters" /><button className="rj-icon" aria-label="添加股票" type="submit"><Plus size={20} /></button></form>{error && <p role="alert" className="rj-error">{error}</p>}<div className="rj-chip-row rj-stock-choices">{visibleChoices.map(symbol => <button key={symbol} aria-pressed={selected.includes(symbol)} onClick={() => add(symbol)}>{symbol}{selected.includes(symbol) && <Check size={14}/>}</button>)}</div><p className="rj-note">正文提到的股票会自动关联并按顺序排列，可在这里调整。</p></div></Dialog>;
}
function Composer({ entry, defaultType, identity, userId, db, onSaved, onClose, suggestions, preview, previewMarket, language }) {
  const key = reviewDraftKey(userId);
  const [draft, setDraft] = useState(() => { if (entry) return { ...emptyReviewEntry(entry.type), ...entry, visibility: !entry.timelineEvent && entry.visibility === 'public' ? 'public' : 'private' }; try { const saved = key && sessionStorage.getItem(key); if (saved) { const parsed = JSON.parse(saved); if (parsed) return restoreReviewDraft(parsed,userId,defaultType); } } catch { /* A blocked session store does not block writing. */ } return { ...emptyReviewEntry(defaultType), visibility: readReviewAudiencePreference(userId, 'publishVisibility') }; });
  const [files, setFiles] = useState([]); const filesRef = useRef([]); filesRef.current = files;
  const [picker, setPicker] = useState(''); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [error, setError] = useState(''); const [closing, setClosing] = useState(false);
  const textarea = useRef(null); const fileInput = useRef(null); const selection = useRef({ start: draft.text.length, end: draft.text.length });
  const stockLinks = React.useMemo(() => resolveReviewStockLinks({ text: draft.text, selected: draft.stocks, suggestions, excluded: draft.excludedStocks }), [draft.text, draft.stocks, suggestions, draft.excludedStocks]);
  const patch = value => setDraft(current => ({ ...current, ...value }));
  const changeVisibility = visibility => {
    if (!['public', 'private'].includes(visibility)) return;
    patch({ visibility });
    writeReviewAudiencePreference(userId, 'publishVisibility', visibility);
  };
  const changeStocks = next => {
    const removed = stockLinks.stocks.filter(symbol => !next.includes(symbol));
    const added = next.filter(symbol => !stockLinks.stocks.includes(symbol));
    patch({ stocks: [...draft.stocks.filter(symbol => next.includes(symbol)), ...added],
      excludedStocks: [...new Set([...(draft.excludedStocks || []).filter(symbol => !next.includes(symbol)), ...removed])] });
  };
  const rememberCursor = () => { if (textarea.current) selection.current = { start: textarea.current.selectionStart, end: textarea.current.selectionEnd }; };
  useEffect(() => { if (entry || !key) return; try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* UI still works if storage is full. */ } }, [draft, entry, key]);
  useEffect(() => () => filesRef.current.forEach(file => URL.revokeObjectURL(file.url)), []);
  const dismiss = () => { if (busyRef.current) return; if (draft.text.trim() || stockLinks.stocks.length || draft.images.length || files.length || draft.market) setClosing(true); else onClose(); };
  const pickFiles = event => {
    const chosen = [...(event.target.files || [])]; event.target.value = ''; setError('');
    if (chosen.length + files.length + draft.images.length > 4) { setError('每条最多 4 张图片'); return; }
    if (chosen.some(file => !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)) { setError('请选择不超过 10 MB 的 JPG、PNG 或 WebP 图片'); return; }
    setFiles(old => [...old, ...chosen.map(file => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const save = async () => {
    if (busyRef.current) return;
    if (!draft.text.trim() && !files.length && !draft.images.length && !stockLinks.stocks.length && !draft.market) return;
    busyRef.current = true; setBusy(true); setError(''); const uploaded = [];
    try {
      for (const { file } of files) uploaded.push(await db.uploadReviewJournalImage(file, userId));
      // Retain successful uploads on uncertain saves; retry references the same objects.
      patch({ images: [...draft.images, ...uploaded] });
      files.forEach(({url}) => URL.revokeObjectURL(url));
      setFiles([]);
      const { excludedStocks: ignoredStocks, ...entryDraft } = draft;
      const saved = await db.saveReviewJournalEntry({ ...entryDraft, stocks: stockLinks.stocks, images: [...draft.images, ...uploaded] }, userId);
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
  const insertQuote = () => {
    if (busy || entry || draft.visibility !== 'public') return;
    const start = Math.max(0, Math.min(selection.current.start, draft.text.length)), end = Math.max(start, Math.min(selection.current.end, draft.text.length));
    const before = draft.text.slice(0, start), after = draft.text.slice(end), mention = `${before && !/\s$/.test(before) ? ' ' : ''}@Quote${/^\s/.test(after) ? '' : ' '}`;
    if (before.length + mention.length + after.length > 20000) { setError('正文已达到字数上限。'); return; }
    selection.current = { start, end }; insertEmoji(mention); restoreCursor();
  };
  return <Dialog title={entry ? '编辑复盘' : '写复盘'} wide composer onClose={dismiss} headerAction={<button type="button" className="rj-publish" disabled={busy || (!draft.text.trim() && !files.length && !draft.images.length && !stockLinks.stocks.length && !draft.market)} onClick={save}>{busy ? <Loader2 size={16} className="rj-spin" /> : entry ? '保存' : '发布'}</button>}>
    <div className="rj-compose-scroll"><div className="rj-compose-author"><Avatar identity={identity} userId={userId} preview={preview}/><div><AuthorName identity={identity} /><select className="rj-visibility" aria-label="发布可见范围" disabled={busy} value={draft.visibility==='public'?'public':'private'} onChange={event=>changeVisibility(event.target.value)}><option value="private">仅自己可见</option><option value="public">公开 · Quote 用户可见</option></select></div></div>
      <div className="rj-compose-content"><div className="rj-compose-meta"><select aria-label="记录类型" disabled={Boolean(entry) || busy} value={draft.type} onChange={event => patch({type:event.target.value})}><option value="log">复盘日志</option><option value="insight">投资心得</option></select><input type="date" aria-label="记录日期" value={draft.date} max={localReviewDate()} onChange={event => patch({date:event.target.value})} disabled={busy}/></div>
      <div className="rj-writing-area" data-text={draft.text}><textarea ref={textarea} className="rj-body-input" rows={1} aria-label="复盘正文" placeholder="这一刻，有什么想记录的？" value={draft.text} maxLength={20000} disabled={busy} onChange={event => { patch({text:event.target.value}); rememberCursor(); }} onSelect={rememberCursor} onKeyUp={rememberCursor} onBlur={rememberCursor}/></div>
      {!!stockLinks.stocks.length && <div className="rj-chip-row">{stockLinks.stocks.map(symbol => <button key={symbol} disabled={busy} aria-label={`移除关联股票 ${symbol}`} onClick={() => changeStocks(stockLinks.stocks.filter(s=>s!==symbol))}>${symbol}<X size={12}/></button>)}</div>}
      {!!stockLinks.omitted.length && <p className="rj-note" role="status">自动关联最多 4 只，其他代码可在“股票”中调整。</p>}
      {draft.market && <div className="rj-compose-attachment"><SnapshotCard value={draft.market} language={language}/><button className="rj-remove" aria-label="移除市场快照" disabled={busy} onClick={()=>patch({market:null})}><X size={15}/></button></div>}
      <div className="rj-photo-grid">{draft.images.map(item => <div className="rj-compose-attachment" key={item.path}><Photo item={item} db={db} userId={userId} preview={preview} onOpen={()=>{}}/><button className="rj-remove" aria-label="移除图片" disabled={busy} onClick={()=>patch({images:draft.images.filter(image=>image.path!==item.path)})}><X size={15}/></button></div>)}{files.map(({url}, i)=><div className="rj-compose-attachment" key={url}><img className="rj-local-photo" alt="待上传图片" src={url}/><button className="rj-remove" disabled={busy} aria-label="移除待上传图片" onClick={()=>{URL.revokeObjectURL(url);setFiles(old=>old.filter((_,index)=>index!==i));}}><X size={15}/></button></div>)}</div>
      {draft.mood && <p className="rj-note">{draft.mood}</p>}{error && <p className="rj-error" role="alert">{error}</p>}{preview && <p className="rj-note">本地示例 · 保存仅在当前预览中生效</p>}
      </div></div>
    <div className="rj-compose-toolbar"><input hidden ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={pickFiles}/>{[[ImagePlus,'图片',()=>fileInput.current.click()],[LineChart,'股票',()=>setPicker('stock')],[Activity,'市场',()=>setPicker('market')],[Smile,'表情',()=>setPicker('emoji')],[MoreHorizontal,'更多',()=>setPicker('more')]].map(([Icon,label,action])=><button key={label} aria-label={label} disabled={busy} onClick={action}><Icon size={21}/><span>{label}</span></button>)}{!entry&&draft.visibility==='public'&&<button type="button" aria-label="@Quote" disabled={busy} onPointerDown={event=>{event.preventDefault();rememberCursor();}} onClick={insertQuote}>@Quote</button>}</div>
    {picker==='stock'&&<SymbolPicker selected={stockLinks.stocks} suggestions={suggestions} text={draft.text} onChange={changeStocks} onClose={()=>setPicker('')}/>}
    {picker==='market'&&<SnapshotPicker userId={userId} language={language} recordDate={draft.date} value={draft.market} onChange={market=>{patch({market});setPicker('');}} onClose={()=>setPicker('')} previewData={preview ? previewMarket : undefined}/>}
    {picker==='emoji'&&<EmojiPicker onSelect={insertEmoji} onClose={restoreCursor}/>}
    {picker==='more'&&<Dialog title="记录设置" onClose={()=>setPicker('')}><div className="rj-dialog-body"><p className="rj-note">记录当时的心情</p><div className="rj-chip-row">{['冷静','谨慎','乐观','焦虑','满意','后悔'].map(mood=><button key={mood} aria-pressed={draft.mood===mood} onClick={()=>patch({mood:draft.mood===mood?'':mood})}>{mood}</button>)}</div>{draft.type==='insight'&&<><p className="rj-note">重要程度</p><div className="rj-chip-row">{[['🟢','一般'],['🔺','重要'],['📣','强调'],['❗','警告']].map(([level,label])=><button key={level} aria-pressed={draft.level===level} onClick={()=>patch({level})}>{label}</button>)}</div></>}</div></Dialog>}
    {closing&&<Dialog title={entry ? '放弃这次修改？' : '保留草稿？'} onClose={()=>setClosing(false)}><div className="rj-dialog-body"><p className="rj-note">{entry?'原有记录不会改变。':files.length?'文字和关联信息会保留；待上传图片需要重新选择。':'下次打开可继续编辑。'}</p><button className="rj-wide-button" onClick={onClose}>{entry?'放弃修改':'保留草稿'}</button>{!entry&&<button className="rj-wide-button rj-danger" onClick={()=>{try{if(key)sessionStorage.removeItem(key);}catch{/* Keep close usable when storage is blocked. */}onClose();}}>放弃草稿</button>}</div></Dialog>}
  </Dialog>;
}

export default function ReviewJournalPage({ ctx }) {
  const { db, userId, language='zh', disciplines=[], reviewLogs=[], setDisciplines, setReviewLogs, stockTrades=[], onBack, previewData, marketColorMode, usdCny = null, fxDate = '', navigationTab = false, reviewPublicRefreshRef, reviewFeedUnread, reviewOpenAllRequest = 0 } = ctx;
  const preview = Boolean(import.meta.env.DEV && previewData);
  const assistantApi = preview ? previewData?.assistantApi : quoteAssistantApi;
  const assistantRequestRef = useRef(null);
  const assistantBridge = useMemo(() => createQuoteAssistantSaveBridge(db, {userId,request:payload=>assistantRequestRef.current?.(payload)}),[db,userId]);
  const assistantJournalDb = useMemo(()=>assistantApi?({...db,...assistantBridge}):db,[db,assistantBridge,assistantApi]);
  const [assistantStatus,setAssistantStatus]=useState(null);
  const assistantScope=useRef({userId});
  if(assistantScope.current.userId!==userId)assistantScope.current={userId};
  useEffect(()=>{const scope=assistantScope.current;return()=>{if(assistantScope.current===scope)assistantScope.current={userId:null};};},[userId]);
  const requestAssistant=async payload=>{
    if(!assistantApi)return;
    const scope=assistantScope.current;
    setAssistantStatus({userId,status:'running',payload});
    try {
      const state=await assistantApi.state(userId);
      if(assistantScope.current!==scope)return;
      if(!state.configured||state.enabled===false)throw new Error(state.configurationError||'小助手尚未配置；你的内容已正常保存。');
      const previous=state.jobs.find(job=>job.id===payload.requestId);
      const result=previous?.status==='failed'?await assistantApi.retry({id:previous.id,revision:previous.revision},userId):await assistantApi.run(payload,userId);
      if(assistantScope.current!==scope)return;
      const job=result?.job||result;
      if(job?.status==='failed')throw new Error(job.errorMessage||'小助手暂未回复；你的内容已正常保存。');
      setAssistantStatus({userId,status:job?.status==='published'?'done':'queued',payload,job});
      setPublicRefresh(value=>value+1);
    } catch(failure) { if(assistantScope.current===scope)setAssistantStatus({userId,status:'failed',payload,error:failure?.message||'小助手暂未回复；你的内容已正常保存。'}); }
  };
  assistantRequestRef.current=requestAssistant;
  const preferenceState = useReviewPreferences({ db, userId, preview, previewPreferences: previewData?.preferences });
  const { preferences, ready: preferencesReady } = preferenceState;
  const currencyProps = { displayCurrency: preferences.currency, usdCny, fxDate };
  const [identity,setIdentity]=useState(() => preview ? previewData.identity : db.readCachedReviewIdentity(userId));
  const [identityError,setIdentityError]=useState(false); const [identityAttempt,setIdentityAttempt]=useState(0);
  const [filter,setFilter]=useState(() => preview && previewData.initialTimeline ? 'timeline' : 'all'); const [search,setSearch]=useState(false); const [query,setQuery]=useState('');
  const initialAllScope = () => preview && ['public', 'private'].includes(previewData.initialAllScope)
    ? previewData.initialAllScope : readReviewAudiencePreference(userId, 'feedScope');
  // Only an explicit browsing choice updates this preference. Notification
  // targets and newly saved posts can temporarily display another audience.
  const browsingScope=useRef(null);
  if(!browsingScope.current||browsingScope.current.userId!==userId)browsingScope.current={userId,value:initialAllScope()};
  const [scopeSelection,setScopeSelection]=useState(()=>({...browsingScope.current}));
  const allScope=scopeSelection.userId===userId?scopeSelection.value:browsingScope.current.value;
  const setAllScope=value=>setScopeSelection({userId,value});
  const chooseAllScope=value=>{
    if(!['public','private'].includes(value))return;
    browsingScope.current={userId,value};setAllScope(value);writeReviewAudiencePreference(userId,'feedScope',value);
    if(value==='public'&&allScope==='public')setPublicRefresh(old=>old+1);
  };
  useEffect(()=>{setScopeSelection({...browsingScope.current});},[userId]);
  const publicUnreadCount=reviewFeedUnread?.unreadCount>0?reviewFeedUnread.unreadCount:0;
  const publicUnreadDescription=publicUnreadCount?(language==='en'?`${publicUnreadCount} new public posts`:`${publicUnreadCount} 条公开新帖子`):undefined;
  const showPrivateUnread=allScope==='private'&&publicUnreadCount>0;
  const publicUnreadBadge=publicUnreadCount>0?<span className="rj-scope-unread-badge" aria-hidden="true">{publicUnreadCount>99?'99+':publicUnreadCount}</span>:null;
  const [scopeMenu,setScopeMenu]=useState(false); const [publicDetail,setPublicDetail]=useState(false); const [publicRefresh,setPublicRefresh]=useState(0);
  const [publicEvaluationContext,setPublicEvaluationContext]=useState(null);
  const [publicPostContext,setPublicPostContext]=useState(null);
  const [notificationOpenRequest,setNotificationOpenRequest]=useState(null);
  const [submittedReplyTarget,setSubmittedReplyTarget]=useState(null);
  const replyTargetScope=useRef({userId});
  if(replyTargetScope.current.userId!==userId)replyTargetScope.current={userId};
  const clearSubmittedReplyTarget=()=>{replyTargetScope.current={userId};setSubmittedReplyTarget(null);};
  const [communityDrafts,setCommunityDrafts]=useState([]), [communityEditing,setCommunityEditing]=useState(null), [communityReplyMenu,setCommunityReplyMenu]=useState(null);
  const [communityCounts,setCommunityCounts]=useState({userId,values:{}});
  const communityView=useRef(null);
  const scopeRef=useRef(null);
  const [timelineState,setTimelineState]=useState({userId:null,status:'idle',data:null,error:''});
  const [timelineAttempt,setTimelineAttempt]=useState(0);
  const loadedTimelineAttempt = useRef(-1);
  const pendingFeedAnchor = useRef(null);
  const [composer,setComposer]=useState(null); const [menu,setMenu]=useState(null); const [detailKey,setDetailKey]=useState(()=>preview&&previewData?.initialAssistant?'assistant':null);
  const [tagSymbol,setTagSymbol]=useState(''); const [routeId,setRouteId]=useState('root');
  const publicFeedVisible=filter==='all'&&allScope==='public'&&!tagSymbol;
  const evaluationKey=detailKey||(publicFeedVisible&&publicDetail&&publicEvaluationContext?.userId===userId?publicEvaluationContext.key:null);
  useEffect(()=>{setScopeMenu(false);setPublicDetail(false);setPublicEvaluationContext(null);setPublicPostContext(null);setCommunityReplyMenu(null);setCommunityEditing(null);clearSubmittedReplyTarget();},[filter,allScope,userId]);
  useEffect(()=>{setCommunityDrafts([]);setCommunityCounts({userId,values:{}});},[userId]);
  useEffect(()=>{
    if(!scopeMenu)return undefined;
    const outside=event=>{if(!scopeRef.current?.contains(event.target))setScopeMenu(false);};
    const escape=event=>{if(event.key==='Escape')setScopeMenu(false);};
    document.addEventListener?.('pointerdown',outside);document.addEventListener?.('keydown',escape);
    return()=>{document.removeEventListener?.('pointerdown',outside);document.removeEventListener?.('keydown',escape);};
  },[scopeMenu]);
  const [expanded,setExpanded]=useState(new Set()); const [lightbox,setLightbox]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const busyRef=useRef(false);
  const [evaluations,setEvaluations]=useState([]); const [confirmDelete,setConfirmDelete]=useState(false);
  const [replyMenu,setReplyMenu]=useState(null); const [editingEvaluation,setEditingEvaluation]=useState(null);
  // Keep each opened editor mounted within this account; drafts stay in memory only.
  useEffect(()=>{setEvaluations([]);setReplyMenu(null);setEditingEvaluation(null);},[userId]);
  const closeEvaluations=()=>setEvaluations(old=>old.map(item=>item.open?{...item,open:false}:item));
  const openEvaluationForKey=key=>setEvaluations(old=>{
    if(!key)return old;
    const owned=old.filter(item=>item.userId===userId).map(item=>({...item,open:item.key===key}));
    return owned.some(item=>item.key===key)?owned:[...owned,{key,userId,open:true}];
  });
  const openEvaluation=()=>openEvaluationForKey(evaluationKey);
  const pendingPosition=useRef(null); const positions=useRef(new Map()); const routes=useRef(new Map()); const pageTitle=useRef(null);
  const historyToken=useRef(null); const navigation=useRef(null);
  if(!historyToken.current)historyToken.current=crypto.randomUUID();
  useEffect(()=>{if(preview)return;let active=true;setIdentityError(false);db.fetchReviewIdentity(userId).then(value=>{if(active){setIdentity(value);setIdentityError(!value);}}).catch(()=>{if(active)setIdentityError(true);});return()=>{active=false;};},[db,userId,preview,identityAttempt]);
  useEffect(()=>{if(preview)return undefined;return db.subscribeReviewIdentity(userId,()=>setIdentityAttempt(value=>value+1));},[db,userId,preview]);
  // All-feed history follows confirmed owner preferences; manual posts never wait for it.
  const mixedFeedEnabled = preferencesReady && preferences.showTimeline && preferences.eventTypes.length > 0 && filter === 'all' && allScope==='private' && !tagSymbol;
  const timelineRequested=filter==='timeline'||Boolean(detailKey?.startsWith('timeline:'))||mixedFeedEnabled;
  const captureFeedAnchor = () => {
    if (navigation.current?.key || typeof document === 'undefined' || !document.querySelectorAll || window.scrollY < 80) return null;
    const nodes = [...document.querySelectorAll('.rj-list-page:not([hidden]) [data-rj-entry-key]')];
    const first = nodes.find(node => node.getBoundingClientRect().bottom > 80);
    return first ? { key: first.getAttribute('data-rj-entry-key'), top: first.getBoundingClientRect().top } : null;
  };
  useEffect(()=>{
    if(!timelineRequested)return undefined;
    if(timelineState.userId===userId && ['ready','empty','pending'].includes(timelineState.status) && loadedTimelineAttempt.current===timelineAttempt)return undefined;
    let active=true;
    loadedTimelineAttempt.current=timelineAttempt;
    setTimelineState(previous=>({userId,status:'loading',data:previous.userId===userId?previous.data:null,error:''}));
    const request=preview?Promise.resolve(previewData.timeline||{status:'empty',events:[],years:[],coverage:{},warnings:[]}):db.fetchReviewTimeline(userId);
    request.then(data=>{if(active){pendingFeedAnchor.current=captureFeedAnchor();setTimelineState({userId,status:data.status||'ready',data,error:''});}})
      .catch(failure=>{if(active)setTimelineState(previous=>({userId,status:'error',data:previous.userId===userId?previous.data:null,error:failure?.message||'时间线暂时无法读取，请重试。'}));});
    return()=>{active=false;};
  },[db,userId,preview,previewData?.timeline,timelineRequested,timelineAttempt]);
  const suggestions=[...new Set(stockTrades.map(row=>String(row.symbol||'').toUpperCase()).filter(Boolean))];
  const journalEntries=reviewJournalFeed(disciplines,reviewLogs);
  const ownedTimeline=timelineState.userId===userId?timelineState:{status:'idle',data:null,error:''};
  const storedTimelineEntries=reviewLogs.filter(entry=>entry.timelineEvent);
  const loadedTimelineEvents=ownedTimeline.data?.events||[];
  const archivedTimelineEvents=ownedTimeline.status==='ready'||ownedTimeline.status==='empty'?storedTimelineEntries.filter(entry=>!loadedTimelineEvents.some(event=>event.id===entry.timelineEvent.id)).map(entry=>({
    id:entry.timelineEvent.id,kind:entry.timelineEvent.kind,metric:entry.timelineEvent.metric,date:entry.timelineEvent.date,
    startDate:entry.timelineEvent.date,endDate:entry.timelineEvent.date,title:entry.timelineEvent.title,status:'archived',value:null,valueType:'money',points:[],nodes:[],
    description:'来源数据已更新，保留此前写下的评价。',
  })):[];
  const rawTimelineEvents=[...loadedTimelineEvents,...archivedTimelineEvents];
  const timelineEvents=groupReviewTimelineEvents(rawTimelineEvents);
  const timelineData=ownedTimeline.data?{...ownedTimeline.data,events:timelineEvents,years:[...new Set([...(ownedTimeline.data.years||[]),...archivedTimelineEvents.map(event=>Number(event.date.slice(0,4)))])].sort().reverse()}:null;
  const timelineEntries=timelineEvents.map(event=>projectReviewTimelineEntry(event,storedTimelineEntries));
  const getTimelineCommentCount=event=>{const projected=projectReviewTimelineEntry(resolveReviewTimelineEvent(timelineEvents,event.id)||event,storedTimelineEntries);return projected.replies.length+(communityCounts.userId===userId?storedTimelineEntries.filter(entry=>projected.timelineSourceEventIds?.includes(entry.timelineEvent?.id)).reduce((sum,entry)=>sum+(communityCounts.values[`log:${entry.id}`]||0),0):0);};
  const all=[...journalEntries,...timelineEntries];
  const ordinaryFeed=reviewJournalFeed(disciplines,reviewLogs,filter,query);
  const feed=tagSymbol?journalEntries.filter(entry=>(entry.stocks||[]).includes(tagSymbol)||findReviewStockMentions(entry.text,[...(entry.stocks||[]),...suggestions]).includes(tagSymbol))
    :filter==='all'?mergeReviewTimelineFeed(journalEntries.filter(entry=>entry.visibility!=='public'),rawTimelineEvents,{...preferences,showTimeline:mixedFeedEnabled},{query}):ordinaryFeed;
  const entryKey=entry=>entry.timelineEvent?`timeline:${entry.timelineEvent.id}`:`${entry.type}:${entry.id}`;
  const detail=findReviewEntryByKey(all,detailKey);
  const evaluationDetail=findReviewEntryByKey(all,evaluationKey);
  const timelineEventId=detailKey?.startsWith('timeline:')?detailKey.slice(9):null;
  const selectedTimelineEvent=resolveReviewTimelineEvent(timelineEvents,timelineEventId);
  const isTimelineDetail=Boolean(timelineEventId);
  const isSettings=detailKey==='settings';
  const isAssistant=detailKey==='assistant';
  const isNotifications=detailKey==='notifications';
  const activeReplyMenu=replyMenu?.userId===userId&&replyMenu.entryKey===evaluationKey?replyMenu:null;
  const editingSource=editingEvaluation?.userId===userId&&editingEvaluation.entryKey===evaluationKey
    ?resolveReviewReplySource(evaluationDetail,editingEvaluation.reply,storedTimelineEntries):null;
  const editingEntry=editingSource?.entry;
  const evaluationEntryForKey=key=>{
    const entry=findReviewEntryByKey(all,key);
    if(!entry?.timelineEvent)return entry;
    const event=resolveReviewTimelineEvent(timelineEvents,key.slice(9));
    return event?reviewTimelineAnchorEntry(event,storedTimelineEntries):null;
  };
  const showingDetail=Boolean(detail)||isTimelineDetail||isSettings||isNotifications||isAssistant;
  const notificationCount=useReviewNotificationCount({db,userId,enabled:!showingDetail&&!publicDetail&&!composer});
  const openNotification=(target,item)=>{
    const route={id:crypto.randomUUID(),key:null,symbol:'',parent:routeId};
    routes.current.set(route.id,route);applyRoute(route);
    setFilter('all');setAllScope('public');setQuery('');setSearch(false);setScopeMenu(false);
    setNotificationOpenRequest({id:crypto.randomUUID(),userId,postId:target.postId,commentId:target.commentId,notificationId:item.id,
      journalRoute:{token:historyToken.current,id:route.id,key:null,symbol:''}});
  };
  const privateCommentPosts=reviewCommentPostsForDetail(detail,storedTimelineEntries,userId);
  const communityPostId=publicFeedVisible&&publicDetail&&publicPostContext?.userId===userId?publicPostContext.post.id:detail&&!isTimelineDetail?entryKey(detail):null;
  const allowedCommunityPostIds=[...new Set([communityPostId,...privateCommentPosts.map(post=>post.id)].filter(Boolean))];
  communityView.current={userId,postId:communityPostId,postIds:allowedCommunityPostIds};
  const activeCommunityMenu=communityReplyMenu?.userId===userId&&allowedCommunityPostIds.includes(communityReplyMenu.post.id)?communityReplyMenu:null;
  const activeCommunityIsReply=Boolean(activeCommunityMenu?.reply.replyTo);
  const activeCommunityEdit=communityEditing?.userId===userId&&allowedCommunityPostIds.includes(communityEditing.post.id)?communityEditing:null;
  const communityCount=communityCounts.userId===userId?allowedCommunityPostIds.reduce((sum,id)=>sum+(communityCounts.values[id]||0),0):undefined;
  const rootRoute={id:'root',key:null,symbol:''};
  if(!routes.current.has('root'))routes.current.set('root',rootRoute);
  navigation.current={id:routeId,key:detailKey,symbol:tagSymbol,entries:all,userId};
  const rememberPosition=(event,focusPost=false)=>{
    const current=navigation.current,trigger=event?.currentTarget;
    const keyboard=event?.type==='keydown'||(event?.type==='click'&&event.detail===0&&!event.nativeEvent?.pointerType&&trigger?.ownerDocument?.activeElement===trigger&&trigger?.matches?.(':focus-visible'));
    positions.current.set(current.id,{x:window.scrollX||0,y:window.scrollY||0,anchor:captureFeedAnchor(),focus:event?(keyboard?(focusPost?trigger?.closest('[data-rj-entry-key]'):trigger):null):positions.current.get(current.id)?.focus});
  };
  const applyRoute=route=>{
    clearSubmittedReplyTarget();
    pendingPosition.current=positions.current.get(route.id)||{x:0,y:0};
    setRouteId(route.id);setDetailKey(route.key);setTagSymbol(route.symbol);closeEvaluations();setReplyMenu(null);setEditingEvaluation(null);setCommunityReplyMenu(null);setCommunityEditing(null);setError('');
  };
  const handledOpenAllRequest=useRef(null);
  useEffect(()=>{
    if(!reviewOpenAllRequest||(handledOpenAllRequest.current?.userId===userId&&handledOpenAllRequest.current.request===reviewOpenAllRequest))return;
    handledOpenAllRequest.current={userId,request:reviewOpenAllRequest};
    applyRoute(rootRoute);setFilter('all');setAllScope(browsingScope.current.value);setQuery('');setSearch(false);setScopeMenu(false);
    setPublicDetail(false);setPublicPostContext(null);setPublicEvaluationContext(null);setNotificationOpenRequest(null);
    setPublicRefresh(value=>value+1);
  },[reviewOpenAllRequest,userId]);
  useEffect(()=>{
    const previousRestoration=window.history?.scrollRestoration;
    if(window.history)window.history.scrollRestoration='manual';
    const onPopState=event=>{
      rememberPosition();
      const state=event.state?.reviewJournalEntry;
      const known=state?.token===historyToken.current?routes.current.get(state.id):null;
      // Only this mount's own routes can restore a private entry or stock view.
      const valid=known&&(!known.key||known.key==='settings'||known.key==='notifications'||known.key==='assistant'||findReviewEntryByKey(navigation.current.entries,known.key));
      applyRoute(valid?known:rootRoute);
    };
    window.addEventListener?.('popstate',onPopState);
    return()=>{
      window.removeEventListener?.('popstate',onPopState);
      if(window.history){
        window.history.scrollRestoration=previousRestoration;
        if(window.history.state?.reviewJournalEntry?.token===historyToken.current){
          const {reviewJournalEntry:discarded,...rest}=window.history.state;
          window.history.replaceState(rest,'');
        }
      }
    };
  },[]);
  useLayoutEffect(()=>{
    const previous=pendingPosition.current;
    if(previous){
      pendingPosition.current=null;
      if(previous.focus?.isConnected)previous.focus.focus({preventScroll:true});
      else pageTitle.current?.focus({preventScroll:true});
      const anchor = previous.anchor && typeof document !== 'undefined' && document.querySelectorAll
        ? [...document.querySelectorAll('.rj-list-page:not([hidden]) [data-rj-entry-key]')].find(node => node.getAttribute('data-rj-entry-key') === previous.anchor.key) : null;
      const top = anchor ? window.scrollY + anchor.getBoundingClientRect().top - previous.anchor.top : previous.y;
      window.scrollTo({left:previous.x,top,behavior:'instant'});
    }
  },[routeId]);
  useLayoutEffect(()=>{
    const anchor=pendingFeedAnchor.current;
    pendingFeedAnchor.current=null;
    if(!anchor||showingDetail||typeof document==='undefined'||!document.querySelectorAll)return;
    const target=[...document.querySelectorAll('.rj-list-page:not([hidden]) [data-rj-entry-key]')].find(node=>node.getAttribute('data-rj-entry-key')===anchor.key);
    if(target)window.scrollTo({left:window.scrollX||0,top:window.scrollY+target.getBoundingClientRect().top-anchor.top,behavior:'instant'});
  },[ownedTimeline.data,showingDetail]);
  const saved=entry=>{if(navigation.current.userId!==userId)return;const setter=entry.type==='insight'?setDisciplines:setReviewLogs;setter(old=>old.some(row=>row.id===entry.id)?old.map(row=>row.id===entry.id?entry:row):[entry,...old]);setPublicRefresh(value=>value+1);setError('');};
  const mutate=async action=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await action();}catch(failure){setError(failure?.message||'操作失败，请重试');}finally{busyRef.current=false;setBusy(false);}};
  const navigate=(key,symbol,event,focusPost=false)=>{
    rememberPosition(event,focusPost);
    const route={id:crypto.randomUUID(),key,symbol,parent:routeId};
    routes.current.set(route.id,route);
    // Navigation stays inside this mounted journal; no URL or data writes.
    try{window.history?.pushState({...window.history.state,reviewJournalEntry:{token:historyToken.current,id:route.id,key,symbol}},'');}catch{/* The local parent route still supports the back button. */}
    applyRoute(route);
  };
  const openDetail=(entry,event)=>navigate(entryKey(entry),tagSymbol,event,true);
  const manageOwnPublicEntry=(type,id)=>{
    if(navigation.current.userId!==userId)return;
    const entry=journalEntries.find(item=>item.type===type&&String(item.id)===String(id));
    if(!entry){setError('原记录暂未读取，请返回后重试。');return;}
    setMenu(entry);setConfirmDelete(false);setError('');
  };
  const publicDetailChanged=(open,post,postId=post?.id)=>{
    if(!open||(postId&&replyTargetScope.current.publicPostId!==postId)){
      clearSubmittedReplyTarget();
      replyTargetScope.current.publicPostId=open?postId:null;
    }
    setPublicDetail(open);
    setPublicPostContext(open&&post?{userId,post}:null);
    setPublicEvaluationContext(open&&post?.authorId===userId?{userId,key:`${post.type}:${post.sourceId}`} : null);
  };
  const openCommunityDraft=(post,replyTo=null)=>{
    if(!reviewCommunityPostAllowed(communityView.current,userId,post.id)||(!replyTo&&post.authorId===userId))return;
    if(replyTo&&(!['author','community'].includes(replyTo.kind)||typeof replyTo.id!=='string'||!replyTo.id))return;
    const target=replyTo?{kind:replyTo.kind,id:replyTo.id,authorId:replyTo.authorId,nickname:replyTo.isAssistant===true?'Quote':replyTo.nickname,...(replyTo.isAssistant===true?{isAssistant:true}:{}),available:replyTo.available!==false}:null;
    const key=JSON.stringify([post.id,target?.kind||'comment',target?.id||'']);
    setError('');setCommunityEditing(null);setCommunityReplyMenu(null);
    setCommunityDrafts(old=>{
      const drafts=old.filter(item=>item.userId===userId).map(item=>({...item,open:item.key===key,...(item.key===key?{post,replyTo:target}:{})}));
      return drafts.some(item=>item.key===key)?drafts:[...drafts,{userId,post,replyTo:target,key,open:true}];
    });
  };
  const evaluateCommunityEntry=post=>openCommunityDraft(post);
  const replyToReview=(post,target)=>openCommunityDraft(post,target);
  const manageCommunityReply=(post,reply)=>{
    if(!reviewCommunityPostAllowed(communityView.current,userId,post.id)||reply.authorId!==userId||reply.postId!==post.id)return;
    setCommunityReplyMenu({userId,post,reply,confirmDelete:false});setError('');
  };
  const communitySaved=()=>{
    if(navigation.current.userId!==userId)return;
    setPublicRefresh(value=>value+1);setError('');
  };
  const updateCommunityCount=(postId,count)=>{
    if(!reviewCommunityPostAllowed(communityView.current,userId,postId))return;
    setCommunityCounts(old=>({userId,values:{...(old.userId===userId?old.values:{}),[postId]:count}}));
  };
  const evaluateOwnPublicEntry=(type,id,replyId)=>{
    if(navigation.current.userId!==userId)return;
    const entry=journalEntries.find(item=>item.type===type&&String(item.id)===String(id)&&item.visibility==='public');
    if(!entry){setError('原记录暂未读取，请返回后重试。');return;}
    const key=entryKey(entry);
    setPublicEvaluationContext({userId,key});setError('');
    if(replyId===undefined){openEvaluationForKey(key);return;}
    const reply=entry.replies?.find(item=>item.id===replyId);
    if(!reply){setError('评价已更新，请返回后重试。');return;}
    setReplyMenu({userId,entryKey:key,reply,confirmDelete:false});
  };
  const openTimeline=(id,event)=>navigate(`timeline:${id}`,'',event);
  const openTimelineEvaluation=event=>{
    const key=`timeline:${event.id}`;
    if(detailKey!==key)openTimeline(event.id);
    setEvaluations(old=>{const owned=old.filter(item=>item.userId===userId).map(item=>({...item,open:item.key===key}));return owned.some(item=>item.key===key)?owned:[...owned,{key,userId,open:true}];});
  };
  const openStockTag=(symbol,event)=>{
    event?.preventDefault?.();event?.stopPropagation?.();
    if(!symbol||(!detailKey&&tagSymbol===symbol))return;
    navigate(null,symbol,event);
  };
  const closeDetail=()=>{
    closeEvaluations();setError('');
    if(window.history?.state?.reviewJournalEntry?.token===historyToken.current&&window.history.state.reviewJournalEntry.id===routeId)window.history.back();
    else{rememberPosition();applyRoute(routes.current.get(routes.current.get(routeId)?.parent)||rootRoute);}
  };
  const openPost=(entry,event)=>{
    // Ignore interactive attachments, portal events, and selecting/copying text.
    if(event.defaultPrevented||!event.currentTarget.contains(event.target)||event.target.closest('button,a,input,textarea,select,[role="button"],[data-rj-interactive]')||window.getSelection?.()?.toString())return;
    openDetail(entry,event);
  };
  const attachments=entry=><>
    {!!entry.images?.length&&<div className={`rj-photo-grid rj-images-${entry.images.length}`}>{entry.images.map(item=><Photo key={item.path} item={item} db={db} userId={userId} preview={preview} onOpen={setLightbox}/>)}</div>}
    <ReviewStockCarousel symbols={entry.stocks||[]} recordDate={entry.date} stockTrades={stockTrades} userId={userId} language={language} previewHistory={preview?previewData.history:undefined}/>
    {entry.market&&<SnapshotCard value={entry.market} language={language}/>}
    {entry.account&&<ReviewAccountCard value={entry.account} marketColorMode={marketColorMode}/>}
    {!!entry.trades?.length&&<ReviewTradeReferences trades={entry.trades} userId={userId} language={language} previewHistory={preview?previewData.history:undefined}/>}
  </>;
  const entryNotes=entry=><div className="rj-entry-notes">
    {entry.mood&&<span>心情 · {entry.mood}</span>}
    {entry.type==='insight'&&entry.level&&entry.level!=='🟢'&&<span>重要程度 · {{'🔺':'重要','📣':'强调','❗':'警告'}[entry.level]||entry.level}</span>}
  </div>;
  const toggleExpanded=entry=>setExpanded(old=>{const next=new Set(old);const key=entryKey(entry);if(next.has(key))next.delete(key);else next.add(key);return next;});
  const post=(entry,full=false)=> <article className={`rj-post ${full?'rj-post-full':'rj-post-link'}`} key={entryKey(entry)}
    data-rj-entry-key={entryKey(entry)} role={full?undefined:'link'} tabIndex={full?undefined:0}
    aria-label={full?undefined:`查看 ${entry.date} 的内容详情`}
    onClick={full?undefined:event=>openPost(entry,event)}
    onKeyDown={full?undefined:event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openDetail(entry,event);}}}>
    <Avatar identity={identity} userId={userId} preview={preview}/><div className="rj-post-main"><div className="rj-post-heading"><AuthorName identity={identity} />{!tagSymbol&&(full||filter!=='all')&&entry.pinned&&<span className="rj-inline-pin" role="img" aria-label="已置顶"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h14M12 21V9m-5 5 5-5 5 5"/></svg></span>}<span>·</span><ReviewActivityTime createdAt={entry.createdAt} date={entry.date} language={language}/>{entry.visibility==='public'&&<span className="rj-public-label">公开</span>}<button className="rj-icon rj-post-more" aria-label="记录操作" onClick={()=>{setMenu(entry);setConfirmDelete(false);setError('');}}><MoreHorizontal size={19}/></button></div>
      <ReviewPostBody text={entry.text} candidates={[...(entry.stocks||[]),...suggestions]} onSelectSymbol={openStockTag} language={language} full={full} expanded={expanded.has(entryKey(entry))} onToggle={()=>toggleExpanded(entry)}/>
      {full&&entryNotes(entry)}
      {attachments(entry)}
      {!full&&<div className="rj-post-actions"><button onClick={event=>openDetail(entry,event)} aria-label="查看评论"><MessageCircle size={18}/><span>{(entry.replies?.length||0)+(communityCounts.userId===userId?communityCounts.values[entryKey(entry)]||0:0)||'评论'}</span></button></div>}
    </div></article>;
  const evaluationDb=useMemo(()=>isTimelineDetail?{...db,appendReviewJournalReply:(entry,reply,expectedUserId)=>db.appendReviewTimelineReply(entry,reply,expectedUserId)}:assistantJournalDb,[db,assistantJournalDb,isTimelineDetail]);
  const communityDb=useMemo(()=>({...db,
    appendReviewJournalReply:(entry,reply,expectedUserId)=>assistantBridge.appendCommunityReply(entry,reply,expectedUserId),
    updateReviewJournalReply:(entry,original,reply,expectedUserId)=>db.saveReviewCommunityEvaluation(entry.communityPostId,{...reply,id:original.id,revision:original.revision,replyTo:original.replyTo?{kind:original.replyTo.kind,id:original.replyTo.id}:null},expectedUserId),
  }),[db,assistantBridge]);
  const communityEntry=(post,replyTo=null)=>({id:post.sourceId,type:post.type,communityPostId:post.id,communityReplyTo:replyTo,date:post.date,text:post.text,stocks:post.stocks||[],visibility:post.visibility||'public'});
  const privateCommunityPost=!isTimelineDetail?privateCommentPosts[0]||null:null;
  const evaluationEditorProps={identityNode:<><Avatar identity={identity} userId={userId} preview={preview}/><div><AuthorName identity={identity}/><span>现在的评价 · {evaluationDetail?.visibility==='public'?'公开可见':'仅自己可见'}</span></div></>,db:evaluationDb,userId,stockTrades,onSaved:saved,Dialog,EmojiPicker,
    renderPhotos:images=><div className={`rj-photo-grid rj-images-${images.length}`}>{images.map(item=><Photo key={item.path} item={item} db={db} userId={userId} preview={preview} onOpen={setLightbox}/>)}</div>,
    knownTags:[...new Set(all.flatMap(entry=>(entry.replies||[]).flatMap(reply=>reply.tags||[])))],preview,previewData,language,marketColorMode};
  const communityEditorProps=(replyTarget,newReplyPostId=null)=>{
    const scope=replyTargetScope.current;
    return {...evaluationEditorProps,db:communityDb,onSaved:result=>{
      communitySaved();
      // Only a confirmed new reply may locate itself. A late save from an old
      // account/detail, an edit, or a top-level review must not move this view.
      if(!replyTarget||!newReplyPostId||replyTargetScope.current!==scope||navigation.current.userId!==userId
        ||!reviewCommunityPostAllowed(communityView.current,userId,newReplyPostId)
        ||result?.postId!==newReplyPostId||result?.authorId!==userId||!result?.id)return;
      setSubmittedReplyTarget({userId,id:crypto.randomUUID(),postId:newReplyPostId,commentKind:'community',commentId:result.id});
    },identityNode:<><Avatar identity={identity} userId={userId} preview={preview}/><div><AuthorName identity={identity}/><span>{replyTarget?'回复':'现在的评价'} · {(privateCommunityPost?.visibility==='private'||isTimelineDetail)?'仅自己可见':'公开可见'}</span></div></>};
  };
  const renderReplies=()=>detail?(<section className="rj-replies" aria-labelledby="rj-comments-title">
        <div className="rj-replies-header"><h2 id="rj-comments-title">评论{(detail.replies?.length||0)+(communityCount||0)?` · ${(detail.replies?.length||0)+(communityCount||0)}`:''}</h2><button type="button" className="rj-evaluate-button" onClick={openEvaluation}>写评价</button></div>
        {typeof db.fetchReviewCommentThreads==='function'?privateCommentPosts.map(post=><ReviewCommentThreads key={`${userId}:${post.id}`} postId={post.id} db={db} userId={userId} language={language} marketColorMode={marketColorMode} onSelectSymbol={openStockTag} refreshToken={`${publicRefresh}:${post.sourceEntry.revision||0}`} showEmpty={privateCommentPosts.length===1} onCountChange={updateCommunityCount} replyTarget={submittedReplyTarget?.userId===userId&&submittedReplyTarget.postId===post.id?submittedReplyTarget:null}
          renderAuthorAvatar={()=><Avatar identity={identity} userId={userId} preview={preview}/>}
          renderAuthorContent={reply=>{const original=post.sourceEntry.replies?.find(item=>item.id===reply.id)||reply;return <>{original.text&&<ReplyBody onReply={()=>replyToReview(post,{kind:'author',id:reply.id,authorId:userId,nickname:identity?.nickname,available:true})} language={language}><p className="rev-reply-body">{original.text}</p></ReplyBody>}{entryNotes(original)}{attachments(original)}</>;}}
          onReply={reply=>replyToReview(post,{kind:reply.kind||reply.source||'community',id:reply.id,authorId:reply.authorId,nickname:reply.author?.nickname,...(reply.author?.isAssistant?{isAssistant:true}:{}),available:true})}
          onManageReply={reply=>{if((reply.kind||reply.source)==='author'){const shown=reviewAuthorCommentForManagement(post,reply);if(!shown)return;setReplyMenu({userId,entryKey:detailKey,reply:shown,confirmDelete:false});setError('');}else manageCommunityReply(post,reply);}}/>):<>
        {(detail.replies||[]).map(item=><div className="rj-reply" key={reviewTimelineReplyKey(item)} data-rj-reply-id={item.id}><Avatar identity={identity} userId={userId} preview={preview}/><div><div className="rev-reply-byline">{privateCommunityPost?<button type="button" className="rpf-reply-author" onClick={()=>replyToReview(privateCommunityPost,{kind:'author',id:item.id,authorId:userId,nickname:identity?.nickname,available:true})}><AuthorName identity={identity}/></button>:<AuthorName identity={identity}/>}<span>·</span><ReviewActivityTime createdAt={item.createdAt} date={item.date} language={language}/><button type="button" className="rj-icon rj-reply-more" aria-label="评论操作" disabled={busy} onClick={()=>{setReplyMenu({userId,entryKey:detailKey,reply:item,confirmDelete:false});setError('');}}><MoreHorizontal size={19}/></button></div><EvaluationRating score={item.score} tags={item.tags}/>{item.text&&<ReplyBody onReply={privateCommunityPost?()=>replyToReview(privateCommunityPost,{kind:'author',id:item.id,authorId:userId,nickname:identity?.nickname,available:true}):undefined} language={language}><p className="rev-reply-body">{item.text}</p></ReplyBody>}{entryNotes(item)}{attachments(item)}{privateCommunityPost&&<button type="button" className="rpf-reply-action" onClick={()=>replyToReview(privateCommunityPost,{kind:'author',id:item.id,authorId:userId,nickname:identity?.nickname,available:true})}>回复</button>}</div></div>)}
        {privateCommunityPost&&<ReviewCommunityEvaluations key={`${userId}:${privateCommunityPost.id}`} postId={privateCommunityPost.id} db={db} userId={userId} language={language} marketColorMode={marketColorMode} onSelectSymbol={openStockTag} refreshToken={publicRefresh} showEmpty={!detail.replies?.length} onCountChange={updateCommunityCount} onManageReply={reply=>manageCommunityReply(privateCommunityPost,reply)} onReply={reply=>replyToReview(privateCommunityPost,{kind:'community',id:reply.id,authorId:reply.authorId,nickname:reply.author?.nickname,...(reply.author?.isAssistant?{isAssistant:true}:{}),available:true})}/>}
        </>}
        {isTimelineDetail&&!detail.replies?.length&&<p className="rj-note">还没有评论，写下现在对当时的评价。</p>}
        {error&&!menu&&!activeReplyMenu&&<p role="alert" className="rj-error">{error}</p>}
      </section>):null;
  return <div className={`rj-page ${navigationTab?'rj-navigation-tab':''} ${showingDetail||(publicFeedVisible&&publicDetail)?'rj-entry-page':''} ${isTimelineDetail?'rj-timeline-detail':''} ${isSettings?'rj-settings-page':''}`}><header className="rj-page-header" hidden={isAssistant||isNotifications||(publicFeedVisible&&publicDetail&&!showingDetail)}>
    {showingDetail||tagSymbol?<button className="rj-icon" aria-label="返回投资动态" onClick={closeDetail}><ArrowLeft size={22}/></button>
      :<button className="rj-header-avatar" aria-label={language==='en'?'Activity settings':'动态设置'} onClick={event=>navigate('settings','',event)}><Avatar identity={identity} userId={userId} preview={preview}/></button>}
    <h1 ref={pageTitle} tabIndex={-1}>{isAssistant?'Quote 小助手':isSettings?(language==='en'?'Activity Settings':'动态设置'):isTimelineDetail?(language==='en'?'Timeline Event':'时间线记录'):showingDetail?(language==='en'?'Content Details':'内容详情'):tagSymbol?`$${tagSymbol}`:(language==='en'?'Investment Activity':'投资动态')}</h1>
    {showingDetail||tagSymbol?<span className="rj-header-spacer"/>:<div className="rj-header-actions"><button type="button" className="rj-icon rj-notification-bell" aria-label={language==='en'?`Messages${notificationCount.unreadCount>0?` · ${notificationCount.unreadCount} unread`:''}`:`消息${notificationCount.unreadCount>0?` · ${notificationCount.unreadCount} 条未读`:''}`} onClick={event=>navigate('notifications','',event)}><Bell size={21}/>{notificationCount.unreadCount>0&&<span className="rj-notification-badge" aria-hidden="true">{notificationCount.unreadCount>99?'99+':notificationCount.unreadCount}</span>}{notificationCount.error&&<span className="rj-notification-unavailable" aria-hidden="true">!</span>}</button>{filter!=='timeline'&&<button className="rj-icon" aria-label="搜索动态" aria-pressed={search} onClick={()=>{setSearch(!search);setQuery('');}}><Search size={21}/></button>}</div>}
  </header>
    {preview&&<div className="rj-preview-note">本地预览 · 示例记录 · 不写入真实账户</div>}
    {identityError&&<button className="rj-identity-error" onClick={()=>setIdentityAttempt(value=>value+1)}>{identity ? '资料暂未更新，点击重试' : '资料暂未读取，点击重试'}</button>}
    {isNotifications&&<ReviewNotifications key={userId} db={db} userId={userId} language={language} onBack={closeDetail} onOpen={openNotification} onUnreadCountChange={notificationCount.update} refreshRef={reviewPublicRefreshRef}/>}
    {isSettings&&<ReviewPreferences identityNode={<><Avatar identity={identity} userId={userId} preview={preview}/><AuthorName identity={identity}/></>} {...preferenceState} onChange={preferenceState.updatePreferences} onRetry={preferenceState.retry} onOpenAssistant={event=>navigate('assistant','',event)} language={language}/>}
    {isAssistant&&assistantApi&&<QuoteAssistantWorkbench key={userId} api={assistantApi} db={db} onBack={closeDetail} Dialog={Dialog} userId={userId} language={language} preview={preview} onPublished={()=>setPublicRefresh(value=>value+1)} onOpenPost={(postId,source)=>{if(source?.scope==='milestone'){const entry=storedTimelineEntries.find(row=>`log:${row.id}`===postId);if(entry)navigate(`timeline:${entry.timelineEvent.id}`,'');else setError('这条时间线记录暂未读取，请刷新后重试。');}else openNotification({postId},{id:null});}}/>}
    {assistantStatus?.userId===userId&&<div className="rj-assistant-status" role={assistantStatus.status==='failed'?'alert':'status'} style={{padding:'10px 18px',fontSize:14,color:assistantStatus.status==='failed'?'#e6aaa2':'#aab9ca'}}>
      {assistantStatus.status==='running'?'内容已保存，Quote 正在回复…':assistantStatus.status==='done'?'Quote 已完成回复。':assistantStatus.status==='queued'?'内容已保存，小助手任务已提交，可在任务记录中查看进度。':assistantStatus.error}
      {assistantStatus.status==='failed'&&<button type="button" className="rj-text-button" onClick={()=>requestAssistant(assistantStatus.payload)}>重试小助手</button>}
      {assistantStatus.status!=='running'&&<button type="button" className="rj-text-button" onClick={()=>setAssistantStatus(null)}>关闭</button>}
    </div>}
    <div className="rj-list-page" hidden={showingDetail}>
      {!tagSymbol&&!(publicFeedVisible&&publicDetail)&&<div className="rj-scope-navigation" ref={scopeRef}>
        <nav className="rj-tabs" aria-label="复盘分类" data-public-unread={showPrivateUnread||undefined}>
          {[['all','全部'],['log','复盘日志'],['insight','投资心得'],['timeline','时间线']].map(([id,name])=><button key={id} aria-pressed={filter===id} aria-expanded={id==='all'?scopeMenu:undefined} aria-label={id==='all'?'全部动态范围':undefined} aria-description={id==='all'&&showPrivateUnread?publicUnreadDescription:undefined} onClick={()=>{setFilter(id);setScopeMenu(id==='all'?!scopeMenu:false);}}>
            {id==='all'?<>{allScope==='private'?'私密':'全部'}<ChevronDown size={13}/>{showPrivateUnread&&publicUnreadBadge}</>:name}
          </button>)}
        </nav>
        {scopeMenu&&<div className="rj-scope-menu" role="group" aria-label="全部页面显示范围">
          {[['public','全部 · 公开动态','所有 Quote 用户的公开内容'],['private','私密 · 仅自己','自己的私密记录和时间线']].map(([value,label,description])=><button key={value} type="button" aria-label={value==='public'?'显示公开动态':'显示私密记录'} aria-description={value==='public'?publicUnreadDescription:undefined} aria-pressed={allScope===value} onClick={()=>{chooseAllScope(value);setScopeMenu(false);setQuery('');setSearch(false);}}>
            <span><strong>{label}</strong><small>{description}</small></span><span className="rj-scope-menu-status">{value==='public'&&publicUnreadBadge}{allScope===value&&<Check size={16}/>}</span>
          </button>)}
        </div>}
      </div>}
      {tagSymbol&&<p className="rj-tag-summary">{language==='en'?`${feed.length} related posts`:`${feed.length} 篇相关博文`}</p>}
      {!tagSymbol&&filter!=='timeline'&&!(publicFeedVisible&&publicDetail)&&search&&<div className="rj-search"><Search size={17}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} aria-label="搜索正文、股票或日期" placeholder="搜索正文、股票或日期"/></div>}
      {error&&!menu&&!showingDetail&&<p className="rj-error" role="alert">{error}</p>}
      {!publicFeedVisible&&(tagSymbol||filter!=='timeline')&&<div className="rj-feed">{feed.map(entry=>entry.type==='timeline'?<ReviewTimelinePost key={`timeline:${entry.event.id}`} event={entry.event} avatarNode={<ReviewSystemAvatar/>} authorNode={<ReviewSystemName language={language}/>} commentCount={getTimelineCommentCount(entry.event)} onOpen={openTimeline} {...currencyProps} marketColorMode={marketColorMode} language={language}/>:post(entry))}{!feed.length&&!(mixedFeedEnabled&&['idle','loading'].includes(ownedTimeline.status))&&<div className="rj-empty"><MessageCircle size={28}/><h2>{tagSymbol?'暂无相关博文':query?'没有匹配的记录':'从第一条复盘开始'}</h2><p>{tagSymbol?`提到 $${tagSymbol} 的博文会显示在这里。`:query?'换个关键词试试':'投资心得和复盘日志，都在这里。'}</p></div>}</div>}
      {!tagSymbol&&filter==='all'&&allScope==='private'&&!preferencesReady&&preferenceState.error&&<p className="rj-note rj-feed-status">{language==='en'?'Activity preferences unavailable. Open your avatar to retry.':'动态偏好暂未读取，点击头像可重试。'}</p>}
      {mixedFeedEnabled&&['idle','loading'].includes(ownedTimeline.status)&&<p className="rj-note rj-feed-status" role="status">{language==='en'?'Loading timeline…':'正在读取时间线…'}</p>}
      {mixedFeedEnabled&&ownedTimeline.status==='pending'&&<div className="rj-feed-status" role="status"><p className="rj-note">{language==='en'?'Closing history is being updated. The timeline will be available when complete.':'收盘历史正在更新，完成后可查看时间线。'}</p><button className="rj-text-button" onClick={()=>setTimelineAttempt(value=>value+1)}>{language==='en'?'Retry':'重新读取'}</button></div>}
      {mixedFeedEnabled&&ownedTimeline.error&&<div className="rj-feed-status" role="alert"><p className="rj-note">{ownedTimeline.error}</p><button className="rj-text-button" onClick={()=>setTimelineAttempt(value=>value+1)}>{language==='en'?'Retry':'重新读取'}</button></div>}
      {publicFeedVisible&&<ReviewPublicFeed key={`${userId}:${reviewOpenAllRequest}`} db={db} userId={userId} language={language} marketColorMode={marketColorMode} query={query} openRequest={notificationOpenRequest?.userId===userId?notificationOpenRequest:null} onOpenRequestHandled={id=>setNotificationOpenRequest(old=>old?.id===id?null:old)} refreshToken={publicRefresh} replyTarget={submittedReplyTarget?.userId===userId?submittedReplyTarget:null} refreshRef={reviewPublicRefreshRef} reviewFeedUnread={browsingScope.current.value==='public'?reviewFeedUnread:undefined} active={!showingDetail&&!composer&&!menu&&!activeReplyMenu&&!editingEntry&&!activeCommunityMenu&&!activeCommunityEdit&&!communityDrafts.some(item=>item.userId===userId&&item.open&&allowedCommunityPostIds.includes(item.post.id))&&!lightbox&&!evaluations.some(item=>item.userId===userId&&item.open&&item.key===evaluationKey)} onDetailChange={publicDetailChanged} onManageOwnEntry={manageOwnPublicEntry} onEvaluateOwnEntry={(type,id)=>evaluateOwnPublicEntry(type,id)} onManageOwnReply={evaluateOwnPublicEntry} onEvaluateCommunityEntry={evaluateCommunityEntry} onReplyToReview={replyToReview} onManageCommunityReply={manageCommunityReply} onCommunityCountChange={updateCommunityCount}/>}
      {filter!=='timeline'&&!(publicFeedVisible&&publicDetail)&&<button className="rj-fab" aria-label="写复盘" onClick={()=>setComposer({entry:null})}><Plus size={28}/></button>}
    </div>
    {isTimelineDetail&&selectedTimelineEvent&&<div className="rj-timeline-author"><ReviewSystemAvatar/><div className="rj-post-heading"><ReviewSystemName language={language}/><span>·</span><time dateTime={reviewTimelineFeedDate(selectedTimelineEvent)}>{reviewTimelineFeedDate(selectedTimelineEvent)}</time></div></div>}
    {((filter==='timeline'&&!tagSymbol)||isTimelineDetail)&&<div hidden={showingDetail&&!isTimelineDetail}><ReviewTimeline data={timelineData} loading={ownedTimeline.status==='loading'||ownedTimeline.status==='idle'} error={ownedTimeline.error} onRetry={()=>setTimelineAttempt(value=>value+1)} selectedEventId={selectedTimelineEvent?.id||timelineEventId} onSelectEvent={openTimeline} onBack={closeDetail} marketColorMode={marketColorMode} stockTrades={stockTrades} entries={journalEntries} onOpenEntry={openDetail} onEvaluate={openTimelineEvaluation} renderEvaluations={()=>renderReplies()} getCommentCount={getTimelineCommentCount} {...currencyProps} language={language}/></div>}
    {detail&&!isTimelineDetail&&<div className="rj-entry-content" key={detailKey}>
      {post(detail,true)}
      {renderReplies()}
    </div>}
    {menu&&<Dialog title={confirmDelete?'删除这条记录？':'记录操作'} onClose={()=>{if(!busy){setMenu(null);setConfirmDelete(false);setError('');}}}><div className="rj-dialog-body">{error&&<p className="rj-error" role="alert">{error}</p>}{confirmDelete?<><p className="rj-note">正文、关联信息及评论将一起删除。</p><button className="rj-wide-button rj-danger" disabled={busy} onClick={()=>mutate(async()=>{await db.deleteReviewJournalEntry(menu,userId);await Promise.allSettled([...new Set([...(menu.images||[]),...(menu.replies||[]).flatMap(item=>item.images||[])].map(image=>image.path))].map(path=>db.removeReviewJournalImage(path,userId)));(menu.type==='insight'?setDisciplines:setReviewLogs)(old=>old.filter(row=>row.id!==menu.id));setMenu(null);setPublicRefresh(value=>value+1);if(detailKey===entryKey(menu))closeDetail();})}>确认删除</button></>:<><button className="rj-menu-item" onClick={()=>{setComposer({entry:menu});setMenu(null);}}><Pencil size={18}/>编辑记录</button>{!tagSymbol&&filter!=='all'&&<button className="rj-menu-item" disabled={busy} onClick={()=>mutate(async()=>{saved(await db.saveReviewJournalEntry({...menu,pinned:!menu.pinned},userId));setMenu(null);})}><Pin size={18}/>{menu.pinned?'取消置顶':'置顶'}</button>}<button className="rj-menu-item rj-danger" onClick={()=>setConfirmDelete(true)}><Trash2 size={18}/>删除记录</button></>}</div></Dialog>}
    {activeReplyMenu&&<Dialog title={activeReplyMenu.confirmDelete?'删除这条评价？':'评论操作'} onClose={()=>{if(!busy){setReplyMenu(null);setError('');}}}><div className="rj-dialog-body">{error&&<p className="rj-error" role="alert">{error}</p>}{activeReplyMenu.confirmDelete?<><p className="rj-note">这条评价及其中的关联内容将从博文中移除，原始交易记录不受影响。</p><button type="button" className="rj-wide-button rj-danger" disabled={busy} onClick={()=>mutate(async()=>{const source=resolveReviewReplySource(evaluationDetail,activeReplyMenu.reply,storedTimelineEntries);if(!source)throw new Error('记录已不存在，请刷新后重试。');const updated=await db.deleteReviewJournalReply(source.entry,source.reply,userId);saved(updated);setReplyMenu(null);})}>{busy?'删除中…':'确认删除评价'}</button><button type="button" className="rj-wide-button" disabled={busy} onClick={()=>{setReplyMenu(null);setError('');}}>取消</button></>:<><button type="button" className="rj-menu-item" onClick={()=>{closeEvaluations();setEditingEvaluation({userId,entryKey:evaluationKey,reply:activeReplyMenu.reply,sessionId:crypto.randomUUID()});setReplyMenu(null);setError('');}}><Pencil size={18}/>修改评价</button><button type="button" className="rj-menu-item rj-danger" onClick={()=>setReplyMenu({...activeReplyMenu,confirmDelete:true})}><Trash2 size={18}/>删除评价</button></>}</div></Dialog>}
    {activeCommunityMenu&&<Dialog title={activeCommunityMenu.confirmDelete?(activeCommunityIsReply?'删除这条回复？':'删除这条评价？'):'评论操作'} onClose={()=>{if(!busy){setCommunityReplyMenu(null);setError('');}}}><div className="rj-dialog-body">{error&&<p className="rj-error" role="alert">{error}</p>}{activeCommunityMenu.confirmDelete?<><p className="rj-note">这条{activeCommunityIsReply?'回复':'评价'}及其中的关联内容将从博文中移除，原始交易记录不受影响。</p><button type="button" className="rj-wide-button rj-danger" disabled={busy} onClick={()=>mutate(async()=>{await db.deleteReviewCommunityEvaluation(activeCommunityMenu.post.id,activeCommunityMenu.reply,userId);if(navigation.current.userId!==userId)return;communitySaved();setCommunityReplyMenu(null);})}>{busy?'删除中…':activeCommunityIsReply?'确认删除回复':'确认删除评价'}</button><button type="button" className="rj-wide-button" disabled={busy} onClick={()=>{setCommunityReplyMenu(null);setError('');}}>取消</button></>:<><button type="button" className="rj-menu-item" onClick={()=>{setCommunityDrafts(old=>old.map(item=>({...item,open:false})));setCommunityEditing({...activeCommunityMenu,sessionId:crypto.randomUUID()});setCommunityReplyMenu(null);setError('');}}><Pencil size={18}/>{activeCommunityIsReply?'修改回复':'修改评价'}</button><button type="button" className="rj-menu-item rj-danger" onClick={()=>setCommunityReplyMenu({...activeCommunityMenu,confirmDelete:true})}><Trash2 size={18}/>{activeCommunityIsReply?'删除回复':'删除评价'}</button></>}</div></Dialog>}
    {composer&&<Composer entry={composer.entry} defaultType={filter==='insight'?'insight':'log'} identity={identity} userId={userId} db={assistantJournalDb} language={language} onSaved={entry=>{saved(entry);if(filter==='all'){setAllScope(entry.visibility==='public'?'public':'private');if(!composer.entry)window.requestAnimationFrame?.(()=>{if(navigation.current.userId===userId)window.scrollTo({left:0,top:0,behavior:'instant'});});}}} onClose={()=>setComposer(null)} suggestions={suggestions} preview={preview} previewMarket={previewData?.market}/>}
    {evaluations.filter(evaluation=>evaluation.userId===userId&&findReviewEntryByKey(all,evaluation.key)).map(evaluation=><ReviewEvaluationComposer {...evaluationEditorProps} key={`${userId}:${evaluation.key}`} open={evaluation.open&&evaluationKey===evaluation.key&&!editingEntry} entry={evaluationEntryForKey(evaluation.key)} onClose={()=>setEvaluations(old=>old.map(item=>item.userId===userId&&item.key===evaluation.key?{...item,open:false}:item))}/>)}
    {editingEntry&&<ReviewEvaluationComposer {...evaluationEditorProps} key={`${userId}:${editingEvaluation.entryKey}:${editingEntry.id}:${editingEvaluation.reply.id}:${editingEvaluation.sessionId}`} open entry={editingEntry} reply={editingSource.reply} onClose={()=>setEditingEvaluation(null)}/>}
    {communityDrafts.filter(item=>item.userId===userId).map(item=><ReviewEvaluationComposer {...communityEditorProps(item.replyTo,item.post.id)} key={`${userId}:community:${item.key}`} open={item.open&&allowedCommunityPostIds.includes(item.post.id)&&!activeCommunityEdit} entry={communityEntry(item.post,item.replyTo)} replyTarget={item.replyTo} onClose={()=>setCommunityDrafts(old=>old.map(draft=>draft.userId===userId&&draft.key===item.key?{...draft,open:false}:draft))}/>)}
    {activeCommunityEdit&&<ReviewEvaluationComposer {...communityEditorProps(activeCommunityEdit.reply.replyTo)} key={`${userId}:community:${activeCommunityEdit.post.id}:${activeCommunityEdit.reply.id}:${activeCommunityEdit.sessionId}`} open entry={communityEntry(activeCommunityEdit.post)} reply={activeCommunityEdit.reply} replyTarget={activeCommunityEdit.reply.replyTo} onClose={()=>setCommunityEditing(null)}/>}
    {lightbox&&<Dialog title="图片" wide onClose={()=>setLightbox('')}><div className="rj-lightbox"><img src={lightbox} alt="复盘图片原图"/></div></Dialog>}
  </div>;
}
