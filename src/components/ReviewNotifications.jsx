import React from 'react';
import { ArrowLeft, CheckCheck, Loader2 } from 'lucide-react';
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
  React.useEffect(() => {
    generation.current += 1;
    operation.current = null; setBusy(null); setState(blank(key));
    let disposed = false, pending = null, pendingVersion, timer, lastResume = -Infinity;
    const visible = () => !disposed && (typeof document === 'undefined' || document.visibilityState !== 'hidden');
    const refresh = () => {
      if (!visible()) return Promise.resolve();
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
    if (refreshRef) refreshRef.current = manualRefresh;
    resume();
    for (const event of ['focus', 'pageshow', 'online']) window.addEventListener(event, resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true; generation.current += 1; clearTimeout(timer);
      if (refreshRef?.current === manualRefresh) refreshRef.current = null;
      for (const event of ['focus', 'pageshow', 'online']) window.removeEventListener(event, resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [db, userId, filter, key, refreshToken, refreshRef, retry]);
  const owned = state.key === key ? state : blank(key);
  const working = busy?.key === key ? busy.action : '';
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
      countCallback.current?.(result.unreadCount);
    } catch (error) { fail(error, token); }
    finally { finish(token); }
  };
  const filters = english ? [['all', 'All'], ['comments', 'Replies'], ['likes', 'Likes'], ['ratings', 'Ratings']]
    : [['all', '全部'], ['comments', '评论与回复'], ['likes', '点赞'], ['ratings', '评分']];
  return <section className="rni-page" aria-label={english ? 'Messages' : '消息'}>
    <header className="rni-header"><button type="button" className="rj-icon" aria-label={english ? 'Back to activity' : '返回动态'} onClick={onBack}><ArrowLeft size={22}/></button><h1>{english ? 'Messages' : '消息'}</h1><button type="button" className="rni-read-all" disabled={Boolean(working) || owned.status !== 'ready' || !observed.current.head || !owned.unreadCount} onClick={readAll}><CheckCheck size={17}/><span>{english ? 'Read all' : '全部已读'}</span></button></header>
    <nav className="rni-filters" aria-label={english ? 'Message categories' : '消息分类'}>{filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setNotice(null); }}>{label}</button>)}</nav>
    {notice?.key === key && <p className="rni-error" role="alert">{notice.text}</p>}
    {owned.status === 'loading' && <div className="rni-status" role="status"><Loader2 size={20} className="rj-spin"/><span>{english ? 'Loading messages…' : '正在读取消息…'}</span></div>}
    {owned.status === 'error' && <div className="rni-status" role="alert"><p>{owned.error}</p><button type="button" onClick={() => { setNotice(null); setRetry(value => value + 1); }}>{english ? 'Retry' : '重新读取'}</button></div>}
    {owned.status === 'ready' && !owned.notifications.length && <p className="rni-status">{english ? 'No messages yet.' : '暂无消息'}</p>}
    {owned.status === 'ready' && <div className="rni-list">{owned.notifications.map(item => <article className="rni-item" key={item.id} data-notification-id={item.id} data-unread={!item.readAt || undefined}>
      <button type="button" className="rni-row" disabled={Boolean(working)} aria-label={`${item.actor.nickname} · ${actionText(item, english)} · ${item.readAt ? english ? 'Read' : '已读' : english ? 'Unread' : '未读'}`} onClick={() => open(item)}>
        <PublicAvatar post={{ author: item.actor }} db={db} userId={userId} language={language}/><span className="rni-content"><span className="rni-byline"><strong>{item.actor.nickname}</strong><ReviewActivityTime createdAt={item.createdAt} language={language}/></span><span className="rni-action">{actionText(item, english)}</span>{item.excerpt && <span className="rni-excerpt">{item.excerpt}</span>}{item.postExcerpt && <span className="rni-post-excerpt">{item.postExcerpt}</span>}</span>
        {working === item.id ? <Loader2 size={14} className="rj-spin rni-indicator"/> : !item.readAt && <span className="rni-unread rni-indicator" aria-hidden="true"/>}
      </button>
    </article>)}</div>}
    {owned.status === 'ready' && owned.hasMore && <button type="button" className="rni-more" disabled={Boolean(working)} onClick={more}>{working === 'more' ? english ? 'Loading…' : '正在读取…' : english ? 'More messages' : '更多消息'}</button>}
  </section>;
}
