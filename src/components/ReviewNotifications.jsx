import React from 'react';
import { ArrowLeft, Check, CheckCheck, ListChecks, Loader2, MoreHorizontal } from 'lucide-react';
import { PublicAvatar } from './ReviewPublicFeed.jsx';
import ReviewActivityTime from './ReviewActivityTime.js';
import './ReviewNotifications.css';

const unavailable = code => ['REVIEW_NOTIFICATION_NOT_FOUND', 'REVIEW_NOTIFICATION_FORBIDDEN', 'REVIEW_AUTH_REQUIRED', 'REVIEW_ACCOUNT_CHANGED'].includes(code);
const withdrawn = code => ['REVIEW_NOTIFICATION_NOT_FOUND', 'REVIEW_NOTIFICATION_FORBIDDEN'].includes(code);
const blank = key => ({ key, notifications: [], status: 'loading', error: '', hasMore: false, nextCursor: null, unreadCount: 0 });
const newerBoundary = (left, right) => {
  if (!right) return true;
  const leftSecond = Math.floor(Date.parse(left.createdAt) / 1000), rightSecond = Math.floor(Date.parse(right.createdAt) / 1000);
  if (leftSecond !== rightSecond) return leftSecond > rightSecond;
  const leftFraction = left.createdAt.match(/\.(\d+)/)?.[1] || '', rightFraction = right.createdAt.match(/\.(\d+)/)?.[1] || '';
  const width = Math.max(leftFraction.length, rightFraction.length);
  const a = leftFraction.padEnd(width, '0'), b = rightFraction.padEnd(width, '0');
  return a === b ? left.id > right.id : a > b;
};

function actionText(item, english) {
  if (item.kind === 'reply') return english ? 'replied to your comment' : '回复了你的评论';
  if (item.kind === 'like') return english ? 'liked your post' : '赞了你的帖子';
  if (item.kind === 'rating') return english ? `rated your post ${item.score} out of 10` : `为你的帖子打了 ${item.score} 分`;
  return english ? 'commented on your post' : '评论了你的帖子';
}

export default function ReviewNotifications({ db, userId, language = 'zh', onBack, onOpen, onUnreadCountChange, refreshToken = 0, refreshRef }) {
  const english = language.startsWith('en');
  const [filter, setFilter] = React.useState('all');
  const key = `${userId}:${filter}`;
  const [state, setState] = React.useState(() => blank(key));
  const [retry, setRetry] = React.useState(0);
  const [busy, setBusy] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [selection, setSelection] = React.useState(null);
  const [management, setManagement] = React.useState(null);
  const managementRef = React.useRef(null), managementButtonRef = React.useRef(null);
  const selectionScope = React.useRef(null), refreshNow = React.useRef(null);
  selectionScope.current = selection?.key === key ? key : null;
  const context = React.useRef(key), generation = React.useRef(0), operation = React.useRef(null);
  const observed = React.useRef({ userId, head: null });
  if (observed.current.userId !== userId) observed.current = { userId, head: null };
  const observe = notifications => {
    if (observed.current.userId !== userId) return;
    for (const item of notifications) if (newerBoundary(item, observed.current.head)) observed.current.head = { createdAt: item.createdAt, id: item.id };
  };
  const countCallback = React.useRef(onUnreadCountChange), openCallback = React.useRef(onOpen);
  context.current = key; countCallback.current = onUnreadCountChange; openCallback.current = onOpen;
  const current = (expectedKey, version) => context.current === expectedKey && generation.current === version;
  React.useEffect(() => { setSelection(null); setManagement(null); }, [key]);
  React.useEffect(() => {
    if (management !== key) return undefined;
    const outside = event => { if (!managementRef.current?.contains(event.target)) setManagement(null); };
    const escape = event => { if (event.key === 'Escape') { setManagement(null); managementButtonRef.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [management, key]);
  React.useEffect(() => {
    generation.current += 1;
    operation.current = null; setBusy(null); if (selectionScope.current !== key) setState(blank(key));
    let disposed = false, pending = null, pendingVersion, timer, lastResume = -Infinity;
    const visible = () => !disposed && (typeof document === 'undefined' || document.visibilityState !== 'hidden');
    const refresh = () => {
      if (!visible()) return Promise.resolve();
      // Selection may include later pages. A first-page poll must not erase
      // those choices, especially the retryable remainder of a partial batch.
      if (selectionScope.current === key) return Promise.resolve();
      // A single read follows any active mutation. Do not let an older unread
      // snapshot overwrite its result, and let pull-to-refresh await that read.
      if (operation.current?.key === key) return operation.current.done.then(refresh);
      if (pending) return pendingVersion === generation.current ? pending : pending.then(refresh);
      const version = ++generation.current;
      pendingVersion = version;
      pending = Promise.resolve().then(() => db.fetchReviewNotifications({ limit: 20, cursor: null, filter }, userId)).then(result => {
        if (disposed || !current(key, version)) return;
        observe(result.notifications);
        setState({ key, ...result, status: 'ready', error: '' });
        setSelection(old => old?.key === key ? { ...old, ids: old.ids.filter(id => result.notifications.some(item => item.id === id && !item.readAt)) } : old);
        countCallback.current?.(result.unreadCount);
      }).catch(error => {
        if (disposed || !current(key, version)) return;
        setState({ ...blank(key), status: 'error', error: error?.message || (english ? 'Messages could not be loaded.' : '消息暂时无法读取，请重试。') });
      }).finally(() => { pending = null; });
      return pending;
    };
    const schedule = () => {
      clearTimeout(timer);
      if (visible()) timer = setTimeout(() => { refresh().finally(schedule); }, 30000);
    };
    const resume = () => {
      clearTimeout(timer);
      if (!visible()) return;
      if (Date.now() - lastResume < 1000) { schedule(); return; }
      lastResume = Date.now();
      refresh().finally(schedule);
    };
    const manualRefresh = () => refresh().finally(schedule);
    refreshNow.current = manualRefresh;
    if (refreshRef) refreshRef.current = manualRefresh;
    resume();
    for (const event of ['focus', 'pageshow', 'online']) window.addEventListener(event, resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true; generation.current += 1; clearTimeout(timer);
      if (refreshRef?.current === manualRefresh) refreshRef.current = null;
      if (refreshNow.current === manualRefresh) refreshNow.current = null;
      for (const event of ['focus', 'pageshow', 'online']) window.removeEventListener(event, resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [db, userId, filter, key, refreshToken, refreshRef, retry]);
  const owned = state.key === key ? state : blank(key);
  const working = busy?.key === key ? busy.action : '';
  const selecting = selection?.key === key;
  const unreadIds = owned.notifications.filter(item => !item.readAt).map(item => item.id);
  const selectedIds = selecting ? unreadIds.filter(id => selection.ids.includes(id)) : [];
  const allSelected = unreadIds.length > 0 && selectedIds.length === unreadIds.length;
  const beginSelection = () => {
    if (context.current !== key || operation.current?.key === key) return;
    generation.current += 1; // Ignore a list refresh already in flight.
    selectionScope.current = key; setSelection({ key, ids: [] }); setManagement(null); setNotice(null);
  };
  const leaveSelection = () => {
    if (context.current !== key) return;
    selectionScope.current = null; setSelection(null); refreshNow.current?.();
  };
  const toggleSelection = item => {
    if (context.current !== key || operation.current?.key === key || item.readAt) return;
    setSelection(old => old?.key === key ? { key, ids: old.ids.includes(item.id) ? old.ids.filter(id => id !== item.id) : [...old.ids, item.id] } : old);
  };
  const start = action => {
    if (operation.current?.key === key) return null;
    // Invalidate a refresh that began before this click. Its stale count and
    // rows must not restore an unread state after the mutation completes.
    const token = { key, version: ++generation.current, action };
    token.done = new Promise(resolve => { token.resolve = resolve; });
    operation.current = token; setBusy(token); setNotice(null);
    return token;
  };
  const finish = token => {
    token.resolve();
    if (operation.current !== token) return;
    operation.current = null;
    if (current(token.key, token.version)) setBusy(null);
  };
  const fail = (error, token) => {
    if (!current(token.key, token.version)) return;
    const message = error?.message || (english ? 'Please try again.' : '操作失败，请重试。');
    setNotice({ key, text: message });
    if (unavailable(error?.code)) {
      selectionScope.current = null;
      setSelection(null);
      setState({ ...blank(key), status: withdrawn(error.code) ? 'loading' : 'error', error: withdrawn(error.code) ? '' : message });
      if (withdrawn(error.code)) setRetry(value => value + 1);
    }
  };
  const more = async () => {
    if (owned.status !== 'ready' || !owned.hasMore || !owned.nextCursor) return;
    const token = start('more'); if (!token) return;
    try {
      const result = await db.fetchReviewNotifications({ limit: 20, cursor: owned.nextCursor, filter }, userId);
      if (!current(key, token.version)) return;
      observe(result.notifications);
      setState(old => ({ key, ...result, notifications: [...new Map([...old.notifications, ...result.notifications].map(item => [item.id, item])).values()], status: 'ready', error: '' }));
      countCallback.current?.(result.unreadCount);
    } catch (error) { fail(error, token); }
    finally { finish(token); }
  };
  const open = async item => {
    const token = start(item.id); if (!token) return;
    try {
      // Resolve through the server again: a notification is never access to a
      // withdrawn post, deleted comment, or another account's old inbox.
      const target = await db.readReviewNotificationTarget(item.id, userId);
      if (!current(key, token.version)) return;
      if (!item.readAt) {
        const result = await db.markReviewNotificationsRead({ ids: [item.id] }, userId);
        if (!current(key, token.version)) return;
        setState(old => ({ ...old, unreadCount: result.unreadCount, notifications: old.notifications.map(row => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row) }));
        countCallback.current?.(result.unreadCount);
      }
      openCallback.current?.(target, item);
    } catch (error) { fail(error, token); }
    finally { finish(token); }
  };
  const readAll = async () => {
    const head = observed.current.userId === userId ? observed.current.head : null;
    if (owned.status !== 'ready' || !head || !owned.unreadCount) return;
    const token = start('read-all'); if (!token) return;
    try {
      // Keep the newest observed head across categories. An older ratings page
      // cannot lower the boundary and leave already-seen likes unread. Preserve
      // its microseconds and ID; arrivals after this boundary remain unread.
      const result = await db.markReviewNotificationsRead({ before: { createdAt: head.createdAt, id: head.id } }, userId);
      if (!current(key, token.version)) return;
      setState(old => ({ ...old, unreadCount: result.unreadCount, notifications: old.notifications.map(item => ({ ...item, readAt: item.readAt || new Date().toISOString() })) }));
      setSelection(null);
      countCallback.current?.(result.unreadCount);
    } catch (error) { fail(error, token); }
    finally { finish(token); }
  };
  const readSelected = async () => {
    if (!selecting || owned.status !== 'ready' || !selectedIds.length) return;
    const token = start('read-selected'); if (!token) return;
    try {
      // The API accepts at most 100 explicit IDs. Each successful chunk alone
      // becomes read; if a later chunk fails, its selections remain retryable.
      for (let index = 0; index < selectedIds.length; index += 100) {
        const ids = selectedIds.slice(index, index + 100);
        const result = await db.markReviewNotificationsRead({ ids }, userId);
        if (!current(key, token.version)) return;
        setState(old => ({ ...old, unreadCount: result.unreadCount, notifications: old.notifications.map(item => ids.includes(item.id) ? { ...item, readAt: new Date().toISOString() } : item) }));
        setSelection(old => old?.key === key ? { ...old, ids: old.ids.filter(id => !ids.includes(id)) } : old);
        countCallback.current?.(result.unreadCount);
      }
      leaveSelection();
    } catch (error) { fail(error, token); }
    finally { finish(token); }
  };
  const filters = english ? [['all', 'All'], ['comments', 'Replies'], ['likes', 'Likes'], ['ratings', 'Ratings']]
    : [['all', '全部'], ['comments', '评论与回复'], ['likes', '点赞'], ['ratings', '评分']];
  return <section className="rni-page" aria-label={english ? 'Messages' : '消息'}>
    <header className="rni-header"><button type="button" className="rj-icon" aria-label={english ? 'Back to activity' : '返回动态'} onClick={onBack}><ArrowLeft size={22}/></button><h1>{english ? 'Messages' : '消息'}</h1>
      {selecting ? <button type="button" className="rni-cancel-selection" disabled={Boolean(working)} onClick={leaveSelection}>{english ? 'Cancel' : '取消'}</button>
        : <div className="rni-management" ref={managementRef}><button type="button" className="rj-icon" ref={managementButtonRef} aria-label={english ? 'Manage messages' : '消息管理'} aria-expanded={management === key} onClick={() => setManagement(old => old === key ? null : key)}><MoreHorizontal size={22}/></button>
          {management === key && <div className="rni-management-menu" role="group" aria-label={english ? 'Message actions' : '消息管理选项'}>
            <button type="button" disabled={Boolean(working) || owned.status !== 'ready' || !observed.current.head || !owned.unreadCount} onClick={() => { setManagement(null); return readAll(); }}><CheckCheck size={18}/><span>{english ? 'Read all' : '全部已读'}</span></button>
            <button type="button" disabled={Boolean(working) || owned.status !== 'ready' || !unreadIds.length} onClick={beginSelection}><ListChecks size={18}/><span>{english ? 'Select messages' : '批量已读'}</span></button>
          </div>}
        </div>}
    </header>
    <nav className="rni-filters" aria-label={english ? 'Message categories' : '消息分类'}>{filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setNotice(null); }}>{label}</button>)}</nav>
    {selecting ? <div className="rni-selection-toolbar" role="group" aria-label={english ? 'Select messages to mark read' : '选择消息并标记已读'}>
      <button type="button" disabled={Boolean(working) || !unreadIds.length} onClick={() => setSelection({ key, ids: allSelected ? [] : unreadIds })}>{allSelected ? english ? 'Clear selection' : '取消全选' : english ? 'Select loaded unread' : '全选已加载未读'}</button>
      <button type="button" className="rni-mark-selected" disabled={Boolean(working) || !selectedIds.length} onClick={readSelected}>{working === 'read-selected' ? english ? 'Marking…' : '正在标记…' : english ? `Mark read (${selectedIds.length})` : `标记已读（${selectedIds.length}）`}</button>
    </div> : null}
    {notice?.key === key && <p className="rni-error" role="alert">{notice.text}</p>}
    {owned.status === 'loading' && <div className="rni-status" role="status"><Loader2 size={20} className="rj-spin"/><span>{english ? 'Loading messages…' : '正在读取消息…'}</span></div>}
    {owned.status === 'error' && <div className="rni-status" role="alert"><p>{owned.error}</p><button type="button" onClick={() => { setNotice(null); setRetry(value => value + 1); }}>{english ? 'Retry' : '重新读取'}</button></div>}
    {owned.status === 'ready' && !owned.notifications.length && <p className="rni-status">{english ? 'No messages yet.' : '暂无消息'}</p>}
    {owned.status === 'ready' && <div className="rni-list">{owned.notifications.map(item => <article className="rni-item" key={item.id} data-notification-id={item.id} data-unread={!item.readAt || undefined}>
      <button type="button" className={`rni-row${selecting ? ' rni-row-selecting' : ''}`} disabled={Boolean(working) || selecting && Boolean(item.readAt)} aria-pressed={selecting ? selectedIds.includes(item.id) : undefined} aria-label={`${item.actor.nickname} · ${actionText(item, english)} · ${item.readAt ? english ? 'Read' : '已读' : english ? 'Unread' : '未读'}`} onClick={() => selecting ? toggleSelection(item) : open(item)}>
        {selecting && <span className={`rni-checkbox${selectedIds.includes(item.id) ? ' rni-checkbox-selected' : ''}`} aria-hidden="true">{selectedIds.includes(item.id) && <Check size={13}/>}</span>}
        <PublicAvatar post={{ author: item.actor }} db={db} userId={userId} language={language}/><span className="rni-content"><span className="rni-byline"><strong>{item.actor.nickname}</strong><ReviewActivityTime createdAt={item.createdAt} language={language}/></span><span className="rni-action">{actionText(item, english)}</span>{item.excerpt && <span className="rni-excerpt">{item.excerpt}</span>}{item.postExcerpt && <span className="rni-post-excerpt"><span className="rni-post-excerpt-text">{item.postExcerpt}</span></span>}</span>
        {working === item.id ? <Loader2 size={14} className="rj-spin rni-indicator"/> : !item.readAt && <span className="rni-unread rni-indicator" aria-hidden="true"/>}
      </button>
    </article>)}</div>}
    {owned.status === 'ready' && owned.hasMore && <button type="button" className="rni-more" disabled={Boolean(working)} onClick={more}>{working === 'more' ? english ? 'Loading…' : '正在读取…' : english ? 'More messages' : '更多消息'}</button>}
  </section>;
}
