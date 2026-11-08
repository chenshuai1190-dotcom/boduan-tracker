import React from 'react';
import { ChevronDown, Heart, Loader2, MessageCircle, MoreHorizontal } from 'lucide-react';
import ReviewActivityTime from './ReviewActivityTime.js';
import { mergeReviewCommentReplies, mergeReviewCommentThreads, reviewCommentAccessRevoked, reviewCommentKey, reviewCommentTarget } from '../lib/reviewCommentThreads.js';
import './ReviewCommentThreads.css';

const empty = key => ({ key, status: 'loading', threads: [], children: {}, likes: {}, totalCount: 0, communityCount: 0, hasMore: false, nextCursor: null, error: '', more: false });
const message = (error, english) => error?.message || (english ? 'Comments are unavailable. Please retry.' : '评论暂时无法读取，请重试。');
const targetKey = target => target ? reviewCommentKey(target) : '';

/** One shared, server-paged discussion for public, owner-private and timeline
 * containers. Descendants have one visual indentation; parent identities remain
 * exact, including when an original comment has been deleted. */
export default function ReviewCommentThreadList({ postId, db, userId, language = 'zh', onReply, onManageReply,
  onCountChange, refreshToken = 0, showEmpty = false, notificationTarget = null, renderAvatar, renderContent,
  interactionsDisabled = false, onAccessRevoked, loadingPlaceholder = null }) {
  const english = language.startsWith('en');
  const key = `${userId}:${postId}`, notificationKey = notificationTarget?.notificationId || notificationTarget?.id || '';
  const [state, setState] = React.useState(() => empty(key));
  const [retry, setRetry] = React.useState(0), [expanded, setExpanded] = React.useState({ key, values: [] });
  const [focus, setFocus] = React.useState(null);
  const owner = React.useRef(key), generation = React.useRef(0), stateRef = React.useRef(state);
  const callbacks = React.useRef({ onCountChange, onAccessRevoked }); callbacks.current = { onCountChange, onAccessRevoked };
  const pending = React.useRef(new Set()), listRef = React.useRef(null), focused = React.useRef('');
  owner.current = key; stateRef.current = state;
  const owned = state.key === key ? state : empty(key);
  const openKeys = expanded.key === key ? expanded.values : [];
  const current = version => owner.current === key && generation.current === version;
  const updateCount = result => callbacks.current.onCountChange?.(postId, result.communityCount, result.totalCount);
  const fail = (failure, version, patch = {}) => {
    if (!current(version)) return;
    if (reviewCommentAccessRevoked(failure)) {
      // Invalidate every concurrent root/reply/like request before clearing.
      // Otherwise an earlier successful page could revive withdrawn content.
      generation.current += 1; pending.current.clear();
      setState({ ...empty(key), status: 'error', error: message(failure, english) });
      // NOT_FOUND can mean either the target or its parent was withdrawn. The
      // parent must hide its content until a fresh detail read resolves that.
      callbacks.current.onAccessRevoked?.(failure);
      return;
    }
    setState(old => ({ ...old, ...patch, error: message(failure, english) }));
  };

  React.useEffect(() => {
    const version = ++generation.current; pending.current.clear(); focused.current = '';
    setState(empty(key)); setFocus(null);
    Promise.resolve().then(async () => {
      const list = db.fetchReviewCommentThreads({ postId, limit: 20, cursor: null }, userId);
      // A notification must still be visible before its old reference is used.
      const located = notificationTarget?.commentId ? Promise.resolve().then(async () => {
        if (notificationTarget.notificationId && typeof db.readReviewNotificationTarget === 'function') {
          const target = await db.readReviewNotificationTarget(notificationTarget.notificationId, userId);
          if (target?.postId !== postId || target?.commentId !== notificationTarget.commentId) {
            throw Object.assign(new Error(english ? 'This comment is no longer available.' : '这条评论已不可用。'), { code: 'REVIEW_NOTIFICATION_NOT_FOUND' });
          }
        }
        const target = { kind: notificationTarget.commentKind || notificationTarget.targetKind || 'community', id: notificationTarget.commentId };
        return { target, result: await db.fetchReviewCommentThreads({ postId, limit: 20, cursor: null, locate: target }, userId) };
      }) : null;
      return Promise.all([list, located]);
    }).then(([result, located]) => {
      if (!current(version)) return;
      if (located && !located.result.threads.length) throw Object.assign(new Error(english ? 'This comment is no longer available.' : '这条评论已不可用。'), { code: 'REVIEW_NOTIFICATION_NOT_FOUND' });
      setState({ ...empty(key), ...result, threads: mergeReviewCommentThreads(result.threads, located?.result.threads || []), status: 'ready' });
      updateCount(result);
      if (located) {
        const rootKey = reviewCommentKey(located.result.threads[0].root);
        setExpanded(old => ({ key, values: [...new Set([...(old.key === key ? old.values : []), rootKey])] }));
        setFocus({ rootKey, target: located.target, token: `${notificationKey}:${version}` });
      }
    }).catch(error => fail(error, version, { status: 'error' }));
    return () => { generation.current += 1; };
  }, [db, key, postId, userId, refreshToken, retry, notificationKey]);

  const loadReplies = (thread, { more = false, locate = null } = {}) => {
    const rootKey = reviewCommentKey(thread.root), version = generation.current;
    const previous = stateRef.current.key === key ? stateRef.current.children[rootKey] : null;
    const requestKey = `${rootKey}:${locate ? `locate:${targetKey(locate)}` : 'page'}`;
    if (pending.current.has(requestKey) || more && (!previous?.hasMore || !previous.nextCursor)) return Promise.resolve();
    pending.current.add(requestKey);
    if (!locate) setState(old => ({ ...old, children: { ...old.children, [rootKey]: { ...previous, status: previous?.status === 'ready' ? 'ready' : 'loading', error: '', more } } }));
    return Promise.resolve().then(() => db.fetchReviewCommentThreadReplies({ postId, root: reviewCommentTarget(thread.root), limit: 50,
      cursor: more ? previous.nextCursor : null, ...(locate ? { locate } : {}) }, userId)).then(result => {
      if (!current(version)) return;
      setState(old => {
        const before = old.children[rootKey] || {};
        const next = locate ? { ...before, locatedTarget: targetKey(locate), locatedReplies: mergeReviewCommentReplies(before.locatedReplies, result.replies), locateError: result.replies.some(row => reviewCommentKey(row) === targetKey(locate)) ? '' : (english ? 'This reply is no longer available.' : '这条回复已不可用。') }
          : { ...before, ...result, replies: mergeReviewCommentReplies(more ? before.replies : [], result.replies), status: 'ready', more: false, error: '' };
        return { ...old, threads: old.threads.map(item => reviewCommentKey(item.root) === rootKey ? { ...item, replyCount: result.replyCount } : item), children: { ...old.children, [rootKey]: next } };
      });
    }).catch(error => {
      if (!current(version)) return;
      if (reviewCommentAccessRevoked(error)) { fail(error, version); return; }
      setState(old => ({ ...old, children: { ...old.children, [rootKey]: { ...old.children[rootKey], status: old.children[rootKey]?.status === 'ready' ? 'ready' : 'error', more: false, error: message(error, english) } } }));
    }).finally(() => { if (current(version)) pending.current.delete(requestKey); });
  };

  React.useEffect(() => {
    if (owned.status !== 'ready') return;
    for (const thread of owned.threads) {
      const rootKey = reviewCommentKey(thread.root);
      if (openKeys.includes(rootKey) && !owned.children[rootKey]?.status) loadReplies(thread);
    }
    if (focus && focus.rootKey !== targetKey(focus.target)) {
      const thread = owned.threads.find(row => reviewCommentKey(row.root) === focus.rootKey);
      const childState = owned.children[focus.rootKey];
      if (thread && !childState?.locatedReplies?.some(row => reviewCommentKey(row) === targetKey(focus.target))
        && !childState?.replies?.some(row => reviewCommentKey(row) === targetKey(focus.target)) && childState?.locatedTarget !== targetKey(focus.target) && !childState?.error) loadReplies(thread, { locate: focus.target });
    }
  }, [owned.status, owned.threads, expanded, focus]);

  React.useEffect(() => {
    if (!focus || focused.current === focus.token || owned.status !== 'ready') return;
    const node = [...(listRef.current?.querySelectorAll('[data-review-comment-key]') || [])].find(item => item.dataset.reviewCommentKey === targetKey(focus.target));
    if (node) {
      focused.current = focus.token;
      requestAnimationFrame(() => { if (node.isConnected !== false) { node.scrollIntoView({ block: 'center', behavior: 'auto' }); node.focus({ preventScroll: true }); } });
    }
  }, [focus, owned.status, owned.children, owned.threads]);

  const loadMore = async () => {
    const version = generation.current;
    if (pending.current.has('roots') || owned.status !== 'ready' || !owned.hasMore || !owned.nextCursor) return;
    pending.current.add('roots'); setState(old => ({ ...old, more: true, error: '' }));
    try {
      const result = await db.fetchReviewCommentThreads({ postId, limit: 20, cursor: owned.nextCursor }, userId);
      if (!current(version)) return;
      setState(old => ({ ...old, ...result, threads: mergeReviewCommentThreads(old.threads, result.threads), status: 'ready', more: false, error: '' })); updateCount(result);
    } catch (error) { fail(error, version, { more: false }); }
    finally { if (current(version)) pending.current.delete('roots'); }
  };
  const locate = async target => {
    const version = generation.current, token = `target:${targetKey(target)}:${Date.now()}`;
    try {
      const result = await db.fetchReviewCommentThreads({ postId, limit: 20, cursor: null, locate: { kind: target.kind, id: target.id } }, userId);
      if (!current(version)) return;
      if (!result.threads.length) throw new Error(english ? 'Original comment deleted.' : '原评论已删除。');
      const rootKey = reviewCommentKey(result.threads[0].root);
      setState(old => ({ ...old, threads: mergeReviewCommentThreads(old.threads, result.threads), error: '' }));
      setExpanded(old => ({ key, values: [...new Set([...(old.key === key ? old.values : []), rootKey])] }));
      setFocus({ rootKey, target, token });
    } catch (error) { fail(error, version); }
  };
  const like = async comment => {
    const id = reviewCommentKey(comment), version = generation.current, requestKey = `like:${id}`;
    if (interactionsDisabled || comment.deleted || pending.current.has(requestKey)) return;
    const before = { liked: Boolean(comment.liked), likeCount: comment.likeCount ?? 0 };
    pending.current.add(requestKey);
    setState(old => ({ ...old, likes: { ...old.likes, [id]: { liked: !before.liked, likeCount: Math.max(0, before.likeCount + (before.liked ? -1 : 1)), pending: true, error: '' } } }));
    try {
      const result = await db.setReviewEvaluationLike(postId, reviewCommentTarget(comment), !before.liked, userId);
      if (current(version)) setState(old => ({ ...old, likes: { ...old.likes, [id]: { ...result, pending: false, error: '' } } }));
    } catch (error) {
      if (!current(version)) return;
      if (reviewCommentAccessRevoked(error)) { fail(error, version); return; }
      setState(old => ({ ...old, likes: { ...old.likes, [id]: { ...before, pending: false, error: message(error, english) } } }));
    } finally { if (current(version)) pending.current.delete(requestKey); }
  };
  const reply = (comment, rootKey) => {
    if (interactionsDisabled) return;
    setExpanded(old => ({ key, values: [...new Set([...(old.key === key ? old.values : []), rootKey])] }));
    onReply?.(comment);
  };
  const row = (item, rootKey, replyCount, child = false) => {
    const id = reviewCommentKey(item), comment = { ...item, ...owned.likes[id] }, nickname = comment.author?.nickname || (english ? 'Quote user' : 'Quote 用户');
    const highlighted = focus && targetKey(focus.target) === id;
    return <div className={`rj-reply rct-comment${child ? ' rct-child' : ''}${highlighted ? ' rpf-notification-target' : ''}${comment.deleted ? ' rct-deleted' : ''}`}
      key={id} data-rj-reply-id={comment.id} data-review-comment-key={id} tabIndex={highlighted ? -1 : undefined}>
      {comment.deleted ? <span className="rj-avatar rct-deleted-avatar" aria-hidden="true"/> : renderAvatar?.(comment)}<div className="rct-main">
        {comment.deleted ? <p className="rj-note">{english ? 'Original comment deleted' : '原评论已删除'}</p> : <>
          <div className="rev-reply-byline"><button type="button" className="rpf-reply-author" disabled={!onReply || interactionsDisabled} onClick={() => reply(comment, rootKey)}>{nickname}</button><span>·</span><ReviewActivityTime createdAt={comment.createdAt} date={comment.date} language={language}/>
            {comment.authorId === userId && onManageReply && <button type="button" className="rj-icon rj-reply-more" disabled={interactionsDisabled} aria-label={english ? 'Comment actions' : '评论操作'} onClick={() => { if (!interactionsDisabled) onManageReply(comment); }}><MoreHorizontal size={19}/></button>}</div>
          {comment.replyTo && <p className="rpf-reply-target">{comment.replyTo.available === false ? (english ? 'Original comment deleted' : '原评论已删除')
            : <>{english ? 'Replying to' : '回复'} <button type="button" onClick={() => locate(comment.replyTo)}>@{comment.replyTo.nickname || (english ? 'Quote user' : 'Quote 用户')}</button></>}</p>}
          {renderContent?.(comment, interactionsDisabled || !onReply ? undefined : () => reply(comment, rootKey))}
          <div className="rct-actions"><button type="button" className={`rct-like${comment.liked ? ' rpf-liked' : ''}`} aria-pressed={Boolean(comment.liked)} disabled={interactionsDisabled || comment.pending || typeof db.setReviewEvaluationLike !== 'function'}
            aria-label={english ? `${comment.liked ? 'Unlike' : 'Like'} ${nickname}'s comment · ${comment.likeCount || 0}` : `${comment.liked ? '取消点赞' : '点赞'}${nickname}的评论 · ${comment.likeCount || 0}`}
            onClick={() => like(comment)}><Heart size={19} fill={comment.liked ? 'currentColor' : 'none'}/>{comment.likeCount > 0 && <span>{comment.likeCount.toLocaleString()}</span>}</button>
            {onReply && <button type="button" disabled={interactionsDisabled} aria-label={english ? `Reply to ${nickname} · ${replyCount || 0} replies` : `回复${nickname} · ${replyCount || 0} 条回复`} onClick={() => reply(comment, rootKey)}><MessageCircle size={19}/><span>{replyCount || (english ? 'Reply' : '回复')}</span></button>}</div>
          {comment.error && <p className="rpf-inline-error" role="alert">{comment.error}</p>}
        </>}
      </div>
    </div>;
  };
  return <div className="rct-list" ref={listRef}>
    {owned.threads.map(thread => {
      const rootKey = reviewCommentKey(thread.root), open = openKeys.includes(rootKey), childState = owned.children[rootKey];
      const children = mergeReviewCommentReplies(childState?.replies, childState?.locatedReplies);
      const hasReplies = thread.replyCount > 0 || children.length > 0;
      return <article className={`rct-thread${hasReplies ? ' rct-has-replies' : ''}`} key={rootKey} data-review-thread-key={rootKey}>
        {row(thread.root, rootKey, thread.replyCount)}
        {open && hasReplies && <div className="rct-reply-list">
          {children.map(comment => row(comment, rootKey, comment.directReplyCount, true))}
          {(!childState?.status || childState.status === 'loading') && <p className="rj-note" role="status"><Loader2 size={14} className="rj-spin"/> {english ? 'Loading replies…' : '正在读取回复…'}</p>}
          {childState?.locateError && <p className="rj-note" role="status">{childState.locateError}</p>}
          {childState?.error && <div className="rpf-inline-error" role="alert"><p>{childState.error}</p><button type="button" className="rj-text-button" onClick={() => loadReplies(thread)}>{english ? 'Retry' : '重新读取'}</button></div>}
          {childState?.hasMore && <button className="rct-load-more" type="button" disabled={childState.more} onClick={() => loadReplies(thread, { more: true })}>{childState.more ? (english ? 'Loading…' : '正在读取…') : (english ? 'More replies' : '更多回复')}</button>}
        </div>}
        {hasReplies && <button type="button" className="rct-toggle" aria-expanded={open} onClick={() => setExpanded(old => ({ key, values: open ? openKeys.filter(value => value !== rootKey) : [...new Set([...openKeys, rootKey])] }))}>
          <span>{open ? (english ? 'Hide replies' : '收起回复') : thread.replyCount ? (english ? `View ${thread.replyCount} replies` : `查看 ${thread.replyCount} 条回复`) : (english ? 'View conversation' : '查看对话')}</span><ChevronDown size={15}/></button>}
      </article>;
    })}
    {owned.status === 'loading' && (loadingPlaceholder || <p className="rj-note" role="status">{english ? 'Loading comments…' : '正在读取评论…'}</p>)}
    {showEmpty && owned.status === 'ready' && !owned.totalCount && <p className="rj-note">{english ? 'No comments yet.' : '还没有评论。'}</p>}
    {owned.error && <div className="rpf-inline-error" role="alert"><p>{owned.error}</p><button className="rj-text-button" type="button" onClick={() => setRetry(value => value + 1)}>{english ? 'Retry' : '重新读取'}</button></div>}
    {owned.hasMore && <button className="rpf-more" type="button" disabled={owned.more} onClick={loadMore}>{owned.more ? (english ? 'Loading…' : '正在读取…') : (english ? 'More comments' : '更多评论')}</button>}
  </div>;
}
