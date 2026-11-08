import React from 'react';
import { ArrowLeft, Heart, Loader2, MessageCircle, MoreHorizontal, User, X } from 'lucide-react';
import { getCommunityAvatarOption } from '../lib/communityProfile.js';
import ReviewPostBody from './ReviewPostBody.jsx';
import { SnapshotCard } from './ReviewMarketSnapshot.jsx';
import { EvaluationRating, ReviewAccountCard } from './ReviewEvaluation.jsx';
import { normalizeReviewTradeReferences } from '../lib/reviewEvaluationModel.js';
import ReviewActivityTime from './ReviewActivityTime.js';
import ReviewCommentThreadList from './ReviewCommentThreads.jsx';
import { reviewPublicAvatarCache } from '../lib/reviewPublicAvatarCache.js';
import { reviewCommentAccessRevoked } from '../lib/reviewCommentThreads.js';
import './ReviewPublicFeed.css';

// Share only in-flight attachment downloads. Avatars use the separate bounded
// session cache below; post/comment images always recheck Storage authorization.
const pendingMedia = new WeakMap();
function publicMedia(db, userId, kind, path) {
  let requests = pendingMedia.get(db);
  if (!requests) { requests = new Map(); pendingMedia.set(db, requests); }
  const key = JSON.stringify([userId, kind, path]);
  if (!requests.has(key)) {
    const loader = kind === 'avatar' ? db.downloadReviewPublicAvatar : db.downloadReviewPublicImage;
    const request = Promise.resolve().then(() => {
      if (typeof loader !== 'function') throw new Error('Public image access is unavailable');
      return loader(path, userId);
    }).finally(() => { if (requests.get(key) === request) requests.delete(key); });
    requests.set(key, request);
  }
  return requests.get(key);
}

function PublicMedia({ db, userId, path, kind = 'image', fallback = '', language = 'zh' }) {
  const key = JSON.stringify([userId, kind, path]);
  const [state, setState] = React.useState({ key: '', url: '', status: 'loading' });
  React.useEffect(() => {
    if (!path || !userId) return undefined;
    let active = true, finished = false, objectUrl = '', image, timer;
    setState({ key, url: '', status: 'loading' });
    const finish = success => {
      if (!active || finished) return;
      finished = true;
      clearTimeout(timer);
      if (image) { image.onload = null; image.onerror = null; }
      setState({ key, url: success ? objectUrl : '', status: success ? 'ready' : 'error' });
      if (!success && objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
    };
    publicMedia(db, userId, kind, path).then(blob => {
      if (!active) return;
      if (!(blob instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('Invalid public image');
      objectUrl = URL.createObjectURL(blob); image = new Image(); image.decoding = 'async';
      image.onload = () => { Promise.resolve(image.decode?.()).then(() => finish(true), () => finish(false)); };
      image.onerror = () => finish(false);
      timer = setTimeout(() => finish(false), 8000);
      image.src = objectUrl;
    }).catch(() => finish(false));
    return () => {
      active = false; clearTimeout(timer);
      if (image) { image.onload = null; image.onerror = null; }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [db, userId, kind, path, key]);
  const source = state.key === key && state.status === 'ready' ? state.url : fallback;
  if (source) return <img src={source} alt={kind === 'avatar' ? '' : language.startsWith('en') ? 'Public post image' : '公开博文图片'} draggable={false} loading="lazy" onError={() => setState({ key, url: '', status: 'error' })} />;
  return kind === 'avatar' ? <User size={20} aria-hidden="true" /> : <span className="rpf-image-status" role="status">{state.key === key && state.status === 'error' ? language.startsWith('en') ? 'Image unavailable' : '图片暂不可用' : <Loader2 size={18} className="rj-spin" aria-label={language.startsWith('en') ? 'Loading image' : '正在读取图片'} />}</span>;
}

function PublicAvatarMedia({ db, userId, path }) {
  const key = JSON.stringify([userId, path]);
  const [state, setState] = React.useState(() => ({ db, key, url: reviewPublicAvatarCache.peek(db, userId, path) }));
  React.useEffect(() => {
    let active = true, lease;
    const invalidate = () => { if (active) setState({ db, key, url: '' }); };
    try {
      lease = reviewPublicAvatarCache.acquire(db, userId, path, invalidate);
      setState({ db, key, url: lease.url });
      lease.promise.then(() => { if (active) setState({ db, key, url: lease.url }); }, invalidate);
    } catch { invalidate(); }
    return () => { active = false; lease?.release(); };
  }, [db, userId, path, key]);
  const source = state.db === db && state.key === key ? state.url : '';
  return source ? <img src={source} alt="" draggable={false} onError={() => setState({ db, key, url: '' })}/>
    : <User size={20} aria-hidden="true"/>;
}

export function PublicAvatar({ post, db, userId }) {
  const preset = getCommunityAvatarOption(post.author?.avatarKey).src;
  return <span className="rj-avatar rpf-avatar">{post.author?.avatarPath
    ? <PublicAvatarMedia db={db} userId={userId} path={post.author.avatarPath} />
    : <img src={preset} alt="" draggable={false} />}</span>;
}

function PublicPost({ post, full = false, db, userId, language, onOpen, onLike, pending, error, onSelectSymbol, onManageOwnEntry, onOpenComments, interactionsDisabled = false }) {
  const [expanded, setExpanded] = React.useState(false);
  const english = language.startsWith('en');
  const commentCount = post.commentCount ?? post.replies?.length ?? 0;
  const open = event => {
    if (full || event.defaultPrevented || event.target.closest('button,a,input,textarea,select') || window.getSelection?.()?.toString()) return;
    onOpen(post);
  };
  return <article className={`rj-post rpf-post${full ? ' rj-post-full rpf-post-full' : ' rj-post-link'}`} tabIndex={full ? undefined : 0}
    aria-label={full ? undefined : `${post.author?.nickname || (english ? 'Quote user' : 'Quote 用户')} · ${post.date}`}
    onClick={open} onKeyDown={event => {
      if (full || event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); onOpen(post);
    }}>
    <PublicAvatar post={post} db={db} userId={userId} language={language} />
    <div className="rj-post-main">
      <div className="rj-post-heading"><strong>{post.author?.nickname || (english ? 'Quote user' : 'Quote 用户')}</strong><span>·</span><ReviewActivityTime createdAt={post.publishedAt} date={post.date} language={language}/>{post.authorId === userId && typeof onManageOwnEntry === 'function' && <button type="button" className="rj-icon rj-post-more" disabled={interactionsDisabled} aria-label={english ? 'Record actions' : '记录操作'} onClick={event => { event.stopPropagation(); if (!interactionsDisabled) onManageOwnEntry(post.type, post.sourceId); }}><MoreHorizontal size={19}/></button>}</div>
      <ReviewPostBody text={post.text} candidates={post.stocks} onSelectSymbol={onSelectSymbol} language={language} full={full} expanded={expanded} onToggle={() => setExpanded(value => !value)} />
      {!!post.images?.length && <div className={`rj-photo-grid rj-images-${post.images.length} rpf-images`}>{post.images.map(item => <span key={item.path} className="rpf-image"><PublicMedia db={db} userId={userId} path={item.path} language={language} /></span>)}</div>}
      {!!post.stocks?.length && <div className="rpf-symbols">{post.stocks.map(symbol => <button key={symbol} type="button" onClick={event => onSelectSymbol(symbol, event)}>${symbol}</button>)}</div>}
      {post.market && <SnapshotCard value={post.market} language={language} />}
      <div className="rj-post-actions rpf-actions"><button type="button" className={`rpf-like${post.liked ? ' rpf-liked' : ''}`} aria-pressed={Boolean(post.liked)} disabled={pending || interactionsDisabled}
        aria-label={english ? `${post.liked ? 'Unlike' : 'Like'} · ${post.likeCount}` : `${post.liked ? '取消点赞' : '点赞'} · ${post.likeCount}`} onClick={() => { if (!interactionsDisabled) onLike(post); }}>
        <Heart size={19} fill={post.liked ? 'currentColor' : 'none'} />{post.likeCount > 0 && <span>{post.likeCount.toLocaleString()}</span>}
      </button><button type="button" aria-label={english ? 'View comments' : '查看评论'} onClick={event => { event.stopPropagation(); onOpenComments?.(post, event); }}><MessageCircle size={19}/><span>{commentCount || (english ? 'Comment' : '评论')}</span></button></div>
      {error && <p className="rpf-inline-error" role="alert">{error}</p>}
    </div>
  </article>;
}

function PublicDetailSkeleton({ language }) {
  return <div className="rpf-detail-skeleton" role="status" aria-label={language.startsWith('en') ? 'Loading post' : '正在读取博文'} aria-busy="true">
    <div className="rpf-skeleton-avatar" aria-hidden="true"/><div className="rpf-skeleton-body" aria-hidden="true"><span className="rpf-skeleton-byline"/><span/><span/><span/><span className="rpf-skeleton-short"/></div>
  </div>;
}

function PublicCommentsSkeleton({ language }) {
  return <div className="rpf-comments-skeleton" role="status" aria-label={language.startsWith('en') ? 'Loading comments' : '正在读取评论'} aria-busy="true">
    {[0, 1].map(index => <div className="rpf-skeleton-comment" key={index} aria-hidden="true"><span className="rpf-skeleton-avatar"/><div className="rpf-skeleton-body"><span className="rpf-skeleton-byline"/><span/><span className="rpf-skeleton-short"/></div></div>)}
  </div>;
}

export function ReplyBody({ children, onReply, language = 'zh' }) {
  const open = event => {
    if (!onReply || event.defaultPrevented || event.target.closest('button,a,input,textarea,select') || window.getSelection?.()?.toString()) return;
    event.stopPropagation(); onReply();
  };
  return <div className="rpf-reply-body" role={onReply ? 'button' : undefined} tabIndex={onReply ? 0 : undefined} aria-label={onReply ? language.startsWith('en') ? 'Reply to comment' : '回复这条评论' : undefined} onClick={open} onKeyDown={event=>{
    if (!onReply || event.target !== event.currentTarget || !['Enter',' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); onReply();
  }}>{children}</div>;
}

function PublicTradeReferences({ trades, language }) {
  const valid = normalizeReviewTradeReferences(trades);
  if (!valid.length) return null;
  const english = language.startsWith('en');
  return <div className="rev-trade-references"><div className="rev-trade-track" aria-label={english ? 'Shared trade references' : '引用的交易记录'}>{valid.map(trade => <article className="rev-trade-reference rpf-trade-reference" key={trade.id}><header><strong>{trade.symbol}</strong><span className={`rev-side-${trade.side}`}>{english ? trade.side === 'buy' ? 'Buy' : 'Sell' : trade.side === 'buy' ? '买入' : '卖出'}</span><time dateTime={trade.date}>{trade.date}</time></header><div><strong>{trade.price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span>{trade.shares.toLocaleString('en-US', { maximumFractionDigits: 6 })} {english ? 'shares' : '股'}</span></div></article>)}</div></div>;
}

export function ReviewCommunityEvaluations({ postId, db, userId, language = 'zh', marketColorMode, onSelectSymbol, onManageReply, onReply, onCountChange, refreshToken = 0, showEmpty = false, notificationTarget = null }) {
  const english = language.startsWith('en'), key = `${userId}:${postId}:${notificationTarget?.notificationId||''}`;
  const listRef=React.useRef(null), focused=React.useRef(null);
  const [state, setState] = React.useState({ key, evaluations: [], status: 'loading', error: '', hasMore: false, nextCursor: null, totalCount: 0 });
  const [retry, setRetry] = React.useState(0);
  const context = React.useRef(key), generation = React.useRef(0), paging = React.useRef(false), countCallback = React.useRef(onCountChange);
  context.current = key; countCallback.current = onCountChange;
  React.useEffect(() => {
    let active = true; const version = ++generation.current; paging.current = false;
    // The public token changes only after an actual post/evaluation update.
    // Revalidate from page one: retained tails can otherwise contain a remote
    // edit or deletion that is no longer present in the newest page.
    setState({ key, evaluations: [], totalCount: 0, hasMore: false, nextCursor: null, status: 'loading', error: '', more: false });
    Promise.resolve().then(() => {
      if (typeof db.fetchReviewCommunityEvaluations !== 'function') throw new Error(english ? 'Community reviews are unavailable.' : '社区评价暂时不可用，请稍后重试。');
      return Promise.all([db.fetchReviewCommunityEvaluations({ postId, limit: 20, cursor: null }, userId),
        notificationTarget?.notificationId ? db.readReviewNotificationTarget(notificationTarget.notificationId,userId).then(target=>({target})).catch(error=>({error})) : null,
      ]);
    }).then(([result,located]) => {
      if (!active || context.current !== key || generation.current !== version) return;
      if (located?.error && ['REVIEW_AUTH_REQUIRED','REVIEW_ACCOUNT_CHANGED','REVIEW_NOTIFICATION_FORBIDDEN','REVIEW_NOTIFICATION_NOT_FOUND'].includes(located.error.code)) throw located.error;
      const target=located?.target, targetEvaluation=target?.postId===postId&&target.commentId===notificationTarget?.commentId?target.evaluation:null;
      if(located&&!targetEvaluation)throw new Error(english?'This comment is no longer available.':'这条评论已不可用。');
      setState({ key, ...result, targetEvaluation, targetError:located&&!targetEvaluation?(located.error?.message||(english?'This comment is no longer available.':'这条评论已不可用。')):'', status: 'ready', error: '', more: false });
      countCallback.current?.(postId, result.totalCount);
    }).catch(failure => {
      if (active && context.current === key && generation.current === version) setState({ key, evaluations: [], status: 'error', error: failure?.message || (english ? 'Reviews could not be loaded.' : '评价暂时无法读取，请重试。'), hasMore: false, nextCursor: null, totalCount: 0, more: false });
    });
    return () => { active = false; generation.current += 1; };
  }, [db, userId, postId, key, refreshToken, retry]);
  const owned = state.key === key ? state : { evaluations: [], status: 'loading' };
  React.useEffect(()=>{
    if(owned.status!=='ready'||!notificationTarget?.commentId||focused.current===key)return;
    const node=listRef.current?.querySelector(`[data-rj-reply-id="${notificationTarget.commentId}"]`);
    if(node){focused.current=key;requestAnimationFrame(()=>{node.scrollIntoView({block:'center',behavior:'auto'});node.focus({preventScroll:true});});}
  },[key,owned.status,owned.targetEvaluation,notificationTarget?.commentId]);
  const shownReplies=owned.targetEvaluation?[owned.targetEvaluation,...owned.evaluations.filter(reply=>reply.id!==owned.targetEvaluation.id)]:owned.evaluations;
  const loadMore = async () => {
    if (paging.current || owned.status !== 'ready' || !owned.hasMore || !owned.nextCursor) return;
    const version = generation.current; paging.current = true; setState(old => ({ ...old, more: true, error: '' }));
    try {
      const result = await db.fetchReviewCommunityEvaluations({ postId, limit: 20, cursor: owned.nextCursor }, userId);
      if (context.current !== key || generation.current !== version) return;
      setState(old => ({ ...old, key, ...result, evaluations: [...new Map([...old.evaluations, ...result.evaluations].map(reply => [reply.id, reply])).values()]
        .sort((left,right)=>beforeTimestampCursor({id:left.id,publishedAt:left.createdAt},{id:right.id,publishedAt:right.createdAt})?1:-1), status: 'ready', error: '', more: false }));
      countCallback.current?.(postId, result.totalCount);
    } catch (failure) {
      if (context.current === key && generation.current === version) {
        const withdrawn = ['REVIEW_PUBLIC_NOT_FOUND', 'REVIEW_PUBLIC_FORBIDDEN', 'REVIEW_AUTH_REQUIRED', 'REVIEW_ACCOUNT_CHANGED'].includes(failure?.code);
        setState(old => ({ ...old, ...(withdrawn ? { evaluations: [], targetEvaluation: null, totalCount: 0, hasMore: false, nextCursor: null, status: 'error' } : {}), more: false, error: failure?.message || (english ? 'Reviews could not be loaded.' : '评价暂时无法读取，请重试。') }));
      }
    } finally { if (context.current === key && generation.current === version) paging.current = false; }
  };
  return <div className="rpf-community-replies" ref={listRef}>
    {owned.targetError&&<p className="rj-note" role="status">{owned.targetError}</p>}
    {shownReplies.map(reply => <div className={`rj-reply${reply.id===notificationTarget?.commentId?' rpf-notification-target':''}`} tabIndex={reply.id===notificationTarget?.commentId?-1:undefined} key={reply.id} data-rj-reply-id={reply.id}><PublicAvatar post={reply} db={db} userId={userId} language={language}/><div><div className="rev-reply-byline"><button type="button" className="rpf-reply-author" disabled={!onReply} onClick={()=>onReply?.(reply)}>{reply.author?.nickname || (english ? 'Quote user' : 'Quote 用户')}</button><span>·</span><ReviewActivityTime createdAt={reply.createdAt} date={reply.date} language={language}/>{reply.authorId === userId && typeof onManageReply === 'function' && <button type="button" className="rj-icon rj-reply-more" aria-label={english ? 'Comment actions' : '评论操作'} onClick={() => onManageReply(reply)}><MoreHorizontal size={19}/></button>}</div>
      {reply.replyTo && <p className="rpf-reply-target">{reply.replyTo.available === false ? (english ? 'Original comment deleted' : '原评论已删除') : `${english ? 'Replying to' : '回复'} @${reply.replyTo.nickname || (english ? 'Quote user' : 'Quote 用户')}`}</p>}
      {!reply.replyTo&&<EvaluationRating score={reply.score} tags={reply.tags || []}/>}
      {reply.text && <ReplyBody onReply={onReply ? ()=>onReply(reply) : undefined} language={language}><ReviewPostBody text={reply.text} candidates={reply.stocks || []} onSelectSymbol={onSelectSymbol} language={language} full/></ReplyBody>}
      {reply.mood && <p className="rj-note">{english ? 'Mood · ' : '心情 · '}{reply.mood}</p>}
      {!!reply.stocks?.length && <div className="rpf-symbols">{reply.stocks.map(symbol => <button key={symbol} type="button" onClick={event => onSelectSymbol?.(symbol, event)}>${symbol}</button>)}</div>}
      {!!reply.images?.length && <div className={`rj-photo-grid rj-images-${reply.images.length} rpf-images`}>{reply.images.map(item => <span key={item.path} className="rpf-image"><PublicMedia db={db} userId={userId} path={item.path} language={language}/></span>)}</div>}
      {reply.market && <SnapshotCard value={reply.market} language={language}/>}
      {reply.account && <ReviewAccountCard value={reply.account} marketColorMode={marketColorMode}/>}
      {!!reply.trades?.length && <PublicTradeReferences trades={reply.trades} language={language}/>}
      {onReply && <button type="button" className="rpf-reply-action" onClick={()=>onReply(reply)}>{english ? 'Reply' : '回复'}</button>}
    </div></div>)}
    {owned.status === 'loading' && !owned.evaluations.length && <p className="rj-note" role="status">{english ? 'Loading comments…' : '正在读取评论…'}</p>}
    {showEmpty && owned.status === 'ready' && !owned.totalCount && <p className="rj-note">{english ? 'No comments yet.' : '还没有评论。'}</p>}
    {owned.error && <div className="rpf-inline-error" role="alert"><p>{owned.error}</p><button className="rj-text-button" type="button" onClick={() => setRetry(value => value + 1)}>{english ? 'Retry' : '重新读取'}</button></div>}
    {owned.hasMore && <button className="rpf-more" type="button" disabled={owned.more} onClick={loadMore}>{owned.more ? english ? 'Loading…' : '正在读取…' : english ? 'More comments' : '更多评论'}</button>}
  </div>;
}

export function ReviewCommentThreads({ postId, db, userId, language = 'zh', marketColorMode, onSelectSymbol, renderAuthorContent, renderAuthorAvatar, ...props }) {
  const english = language.startsWith('en');
  return <ReviewCommentThreadList {...props} postId={postId} db={db} userId={userId} language={language}
    renderAvatar={reply => reply.kind === 'author' && renderAuthorAvatar ? renderAuthorAvatar(reply) : <PublicAvatar post={reply} db={db} userId={userId} language={language}/>}
    renderContent={(reply, onReply) => <>
      {!reply.replyTo && <EvaluationRating score={reply.score} tags={reply.tags || []}/>}
      {reply.kind === 'author' && renderAuthorContent ? renderAuthorContent(reply, onReply) : <>
      {reply.text && <ReplyBody onReply={props.onReply ? onReply : undefined} language={language}><ReviewPostBody text={reply.text} candidates={reply.stocks || []} onSelectSymbol={onSelectSymbol} language={language} full/></ReplyBody>}
      {reply.mood && <p className="rj-note">{english ? 'Mood · ' : '心情 · '}{reply.mood}</p>}
      {!!reply.stocks?.length && <div className="rpf-symbols">{reply.stocks.map(symbol => <button key={symbol} type="button" onClick={event => onSelectSymbol?.(symbol, event)}>${symbol}</button>)}</div>}
      {!!reply.images?.length && <div className={`rj-photo-grid rj-images-${reply.images.length} rpf-images`}>{reply.images.map(item => <span key={item.path} className="rpf-image"><PublicMedia db={db} userId={userId} path={item.path} language={language}/></span>)}</div>}
      {reply.market && <SnapshotCard value={reply.market} language={language}/>}
      {reply.account && <ReviewAccountCard value={reply.account} marketColorMode={marketColorMode}/>}
      {!!reply.trades?.length && <PublicTradeReferences trades={reply.trades} language={language}/>}
      </>}
    </>}/>;
}

function PublicReplies({ post, db, userId, language, marketColorMode, onSelectSymbol, onEvaluateOwnEntry, onManageOwnReply, onEvaluateCommunityEntry, onManageCommunityReply, onReplyToReview, onCommunityCountChange, sectionRef, notificationTarget, replyTarget = null, interactionsDisabled = false, onAccessRevoked }) {
  const english = language.startsWith('en'), ownPost = post.authorId === userId, replies = post.replies || [];
  const countKey = JSON.stringify([userId, post.id, post.updatedAt, post.commentCount ?? '']);
  const [loadedCount,setLoadedCount]=React.useState({key:'',count:0});
  const count = loadedCount.key===countKey?(loadedCount.totalCount ?? replies.length+loadedCount.count):post.commentCount ?? replies.length;
  const evaluate = ownPost ? typeof onEvaluateOwnEntry === 'function' ? () => onEvaluateOwnEntry(post.type, post.sourceId) : null
    : typeof onEvaluateCommunityEntry === 'function' ? () => onEvaluateCommunityEntry(post) : null;
  if (typeof db.fetchReviewCommentThreads === 'function') return <section ref={sectionRef} className="rj-replies rpf-replies" aria-label={english ? 'Comments' : '评论'}>
    <div className="rj-replies-header"><h2>{english ? 'Comments' : '评论'}{count ? ` · ${count}` : ''}</h2>{evaluate && <button type="button" className="rj-evaluate-button" disabled={interactionsDisabled} onClick={() => { if (!interactionsDisabled) evaluate(); }}>{english ? 'Write review' : '写评价'}</button>}</div>
    <ReviewCommentThreads postId={post.id} db={db} userId={userId} language={language} marketColorMode={marketColorMode} onSelectSymbol={onSelectSymbol}
      refreshToken={`${post.updatedAt}:${post.commentCount ?? ''}`} showEmpty notificationTarget={notificationTarget} replyTarget={replyTarget?.postId===post.id?replyTarget:null}
      interactionsDisabled={interactionsDisabled} onAccessRevoked={onAccessRevoked} loadingPlaceholder={<PublicCommentsSkeleton language={language}/>}
      onCountChange={(postId, communityCount, totalCount) => { setLoadedCount({ key: countKey, count: communityCount, totalCount }); onCommunityCountChange?.(postId, communityCount); }}
      onManageReply={reply => reply.kind === 'author' ? onManageOwnReply?.(post.type, post.sourceId, reply.id) : onManageCommunityReply?.(post, reply)}
      onReply={onReplyToReview ? reply => onReplyToReview(post, { kind: reply.kind, id: reply.id, authorId: reply.authorId, nickname: reply.author?.nickname, available: true }) : undefined}/>
  </section>;
  // Compatibility for isolated legacy fixtures; formal DB always provides the
  // threaded RPC and never falls back after a permission or network failure.
  if (interactionsDisabled) return <section ref={sectionRef} className="rj-replies rpf-replies" aria-label={english ? 'Comments' : '评论'}>
    <div className="rj-replies-header"><h2>{english ? 'Comments' : '评论'}{count ? ` · ${count}` : ''}</h2>{evaluate && <button type="button" className="rj-evaluate-button" disabled>{english ? 'Write review' : '写评价'}</button>}</div>
    <PublicCommentsSkeleton language={language}/>
  </section>;
  return <section ref={sectionRef} className="rj-replies rpf-replies" aria-label={english ? 'Comments' : '评论'}>
    <div className="rj-replies-header"><h2>{english ? 'Comments' : '评论'}{count ? ` · ${count}` : ''}</h2>{evaluate && <button type="button" className="rj-evaluate-button" disabled={interactionsDisabled} onClick={() => { if (!interactionsDisabled) evaluate(); }}>{english ? 'Write review' : '写评价'}</button>}</div>
    {replies.map(reply => <div className="rj-reply" key={reply.id} data-rj-reply-id={reply.id}><PublicAvatar post={post} db={db} userId={userId} language={language}/><div><div className="rev-reply-byline"><button type="button" className="rpf-reply-author" disabled={!onReplyToReview} onClick={()=>onReplyToReview?.(post,{kind:'author',id:reply.id,authorId:post.authorId,nickname:post.author?.nickname,available:true})}>{post.author?.nickname || (english ? 'Quote user' : 'Quote 用户')}</button><span>·</span><ReviewActivityTime createdAt={reply.createdAt} date={reply.date} language={language}/>{ownPost && typeof onManageOwnReply === 'function' && <button type="button" className="rj-icon rj-reply-more" aria-label={english ? 'Comment actions' : '评论操作'} onClick={() => onManageOwnReply(post.type, post.sourceId, reply.id)}><MoreHorizontal size={19}/></button>}</div>
      {!reply.replyTo&&<EvaluationRating score={reply.score} tags={reply.tags || []}/>}
      {reply.text && <ReplyBody onReply={onReplyToReview ? ()=>onReplyToReview(post,{kind:'author',id:reply.id,authorId:post.authorId,nickname:post.author?.nickname,available:true}) : undefined} language={language}><ReviewPostBody text={reply.text} candidates={reply.stocks || []} onSelectSymbol={onSelectSymbol} language={language} full/></ReplyBody>}
      {reply.mood && <p className="rj-note">{english ? 'Mood · ' : '心情 · '}{reply.mood}</p>}
      {!!reply.stocks?.length && <div className="rpf-symbols">{reply.stocks.map(symbol => <button key={symbol} type="button" onClick={event => onSelectSymbol(symbol, event)}>${symbol}</button>)}</div>}
      {!!reply.images?.length && <div className={`rj-photo-grid rj-images-${reply.images.length} rpf-images`}>{reply.images.map(item => <span key={item.path} className="rpf-image"><PublicMedia db={db} userId={userId} path={item.path} language={language}/></span>)}</div>}
      {reply.market && <SnapshotCard value={reply.market} language={language}/>}
      {reply.account && <ReviewAccountCard value={reply.account} marketColorMode={marketColorMode}/>}
      {!!reply.trades?.length && <PublicTradeReferences trades={reply.trades} language={language}/>}
      {onReplyToReview && <button type="button" className="rpf-reply-action" onClick={()=>onReplyToReview(post,{kind:'author',id:reply.id,authorId:post.authorId,nickname:post.author?.nickname,available:true})}>{english ? 'Reply' : '回复'}</button>}
    </div></div>)}
    <ReviewCommunityEvaluations notificationTarget={notificationTarget} postId={post.id} db={db} userId={userId} language={language} marketColorMode={marketColorMode} onSelectSymbol={onSelectSymbol} refreshToken={`${post.updatedAt}:${post.commentCount??''}`} showEmpty={!replies.length} onCountChange={(postId,total)=>{setLoadedCount({key:countKey,count:total});onCommunityCountChange?.(postId,total);}} onManageReply={reply => onManageCommunityReply?.(post, reply)} onReply={onReplyToReview ? reply => onReplyToReview(post, {kind:'community',id:reply.id,authorId:reply.authorId,nickname:reply.author?.nickname,available:true}) : undefined}/>
  </section>;
}

const blankFeed = key => ({ key, posts: [], status: 'loading', error: '', hasMore: false, nextCursor: null, more: false });
const errorMessage = (failure, english) => failure?.message || (english ? 'Public activity is unavailable. Please retry.' : '公开动态暂时无法读取，请重试。');
// PostgreSQL pagination retains microseconds. Compare the whole second and the
// complete fractional part separately instead of truncating through Date alone.
const beforeTimestampCursor = (post, cursor) => {
  const postSecond = Math.floor(Date.parse(post.publishedAt) / 1000), cursorSecond = Math.floor(Date.parse(cursor.publishedAt) / 1000);
  if (postSecond !== cursorSecond) return postSecond < cursorSecond;
  const postFraction = post.publishedAt.match(/\.(\d+)/)?.[1] || '', cursorFraction = cursor.publishedAt.match(/\.(\d+)/)?.[1] || '';
  const precision = Math.max(postFraction.length, cursorFraction.length);
  const left = postFraction.padEnd(precision, '0'), right = cursorFraction.padEnd(precision, '0');
  return left === right ? post.id < cursor.id : left < right;
};

const beforePublicCursor = (post, cursor) => {
  const left = post.date || post.recordDate, right = cursor.recordDate || cursor.date;
  if (left && right && left !== right) return left < right;
  return beforeTimestampCursor(post, cursor);
};

function ScopedPublicFeed({ db, userId, language = 'zh', marketColorMode, query = '', symbol = '', refreshToken = 0, refreshRef, active = true, openRequest = null, replyTarget = null, onOpenRequestHandled, onManageOwnEntry, onEvaluateOwnEntry, onManageOwnReply, onEvaluateCommunityEntry, onManageCommunityReply, onReplyToReview, onCommunityCountChange, onDetailChange, unreadController, reviewFeedUnread }) {
  const english = language.startsWith('en');
  const [localSymbol, setLocalSymbol] = React.useState('');
  const [retry, setRetry] = React.useState(0), [detailRetry, setDetailRetry] = React.useState(0);
  const scopeKey = JSON.stringify([userId, query, symbol || localSymbol]);
  const feedKey = JSON.stringify([userId, query, symbol || localSymbol, refreshToken, retry]);
  const currentKey = React.useRef(feedKey), scopeVersion = React.useRef(0);
  if (currentKey.current !== feedKey) { currentKey.current = feedKey; scopeVersion.current += 1; }
  const version = scopeVersion.current;
  const [feed, setFeed] = React.useState(() => blankFeed(feedKey));
  const [detail, setDetail] = React.useState(null), [likes, setLikes] = React.useState({});
  const [notificationContext,setNotificationContext]=React.useState(null), handledOpen=React.useRef(null);
  const currentDetail = detail?.scopeKey === scopeKey ? detail : null;
  const readyPost = currentDetail?.requestKey === feedKey && currentDetail.status === 'ready' ? currentDetail.post : null;
  const visiblePost = currentDetail?.requestKey === feedKey && ['preview', 'ready'].includes(currentDetail.status) ? currentDetail.post : null;
  const detailId = React.useRef(null); detailId.current = currentDetail?.id || null;
  const detailCallback = React.useRef(onDetailChange); detailCallback.current = onDetailChange;
  const alive = React.useRef(true), paging = React.useRef(false), pendingLikes = React.useRef(new Set()), likeVersions = React.useRef(new Map()), withdrawn = React.useRef(new Map());
  const withdrawalEpoch = React.useRef(0), withdrawalHistory = React.useRef(new Map());
  const isCurrent = () => alive.current && currentKey.current === feedKey && scopeVersion.current === version;
  const activity = React.useRef(active); activity.current = active;
  const unread = React.useRef(unreadController || reviewFeedUnread); unread.current = unreadController || reviewFeedUnread;
  const seenBoundary = React.useRef(null), acknowledgedBoundary = React.useRef(null);
  const feedRequest = React.useRef(null), detailRequest = React.useRef(null), refreshRequest = React.useRef(null);
  const feedSerial = React.useRef(0), detailSerial = React.useRef(0), lastRefresh = React.useRef(0);
  const latestRefresh = React.useRef(null);
  const canRefresh = () => activity.current && userId && (typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const scrollPosition = React.useRef(0);
  const commentsRef = React.useRef(null), pendingComments = React.useRef(false);
  const historyToken = React.useRef(null), historyRoutes = React.useRef(new Map()), navigation = React.useRef(null);
  if (!historyToken.current) historyToken.current = crypto.randomUUID();
  navigation.current = { scopeKey, feedKey, posts: feed.key === feedKey ? feed.posts : [] };
  const restoreListPosition = () => requestAnimationFrame(() => window.scrollTo({ top: scrollPosition.current, behavior: 'auto' }));
  React.useEffect(() => {
    const onPopState = event => {
      const state = event.state?.reviewPublicEntry;
      const route = state?.token === historyToken.current ? historyRoutes.current.get(state.id) : null;
      if (route?.scopeKey === navigation.current.scopeKey && !withdrawn.current.has(route.id)) {
        setNotificationContext(route.notification||null);
        const preview = navigation.current.posts.find(post => post.id === route.id) || null;
        setDetail({ ...route, requestKey: navigation.current.feedKey, status: preview ? 'preview' : 'loading', post: preview, error: '' });
        window.scrollTo({ top: 0, behavior: 'auto' });
      } else if (detailId.current) { setDetail(null); restoreListPosition(); }
    };
    window.addEventListener?.('popstate', onPopState);
    return () => {
      window.removeEventListener?.('popstate', onPopState);
      if (window.history?.state?.reviewPublicEntry?.token === historyToken.current) {
        const { reviewPublicEntry: discarded, ...rest } = window.history.state;
        window.history.replaceState(rest, '');
      }
    };
  }, []);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; detailCallback.current?.(false, null); }; }, []);
  React.useEffect(() => { detailCallback.current?.(Boolean(currentDetail), readyPost, currentDetail?.id); }, [currentDetail?.id, readyPost]);
  React.useEffect(() => {
    if (!visiblePost || !pendingComments.current) return;
    pendingComments.current = false;
    requestAnimationFrame(() => commentsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }));
  }, [visiblePost]);
  React.useEffect(() => {
    setDetail(null); historyRoutes.current.clear(); pendingComments.current = false;
    if (window.history?.state?.reviewPublicEntry?.token === historyToken.current) {
      const { reviewPublicEntry: discarded, ...rest } = window.history.state;
      window.history.replaceState(rest, '');
    }
  }, [scopeKey]);
  React.useEffect(() => { setLocalSymbol(''); }, [symbol, query]);
  const reconcileLikes = (posts, versions, pendingAtStart) => {
    setLikes(old => {
      const next = { ...old };
      for (const post of posts) {
        if (!pendingAtStart.has(post.id) && !pendingLikes.current.has(post.id)
          && (versions.get(post.id) || 0) === (likeVersions.current.get(post.id) || 0)) delete next[post.id];
      }
      return next;
    });
  };
  const restorePublication = (id, epochAtStart) => {
    if (withdrawalHistory.current.get(id) !== epochAtStart) return false;
    withdrawn.current.delete(id);
    return true;
  };
  const markWithdrawn = id => {
    const epoch = ++withdrawalEpoch.current;
    withdrawalHistory.current.set(id, epoch); withdrawn.current.set(id, epoch);
  };
  const revokeDetailAccess = (id, failure = null) => {
    if (!isCurrent()) return;
    markWithdrawn(id);
    setFeed(old => ({ ...old, posts: old.posts.filter(item => item.id !== id) }));
    setLikes(old => { const next = { ...old }; delete next[id]; return next; });
    if (detailId.current !== id) return;
    // A comment denial can arrive before an older successful detail response.
    // Invalidate that response before clearing either piece of visible content.
    detailSerial.current += 1; detailRequest.current = null;
    const unavailable = !failure || failure.code === 'REVIEW_PUBLIC_NOT_FOUND';
    // These errors can mean only the linked comment was deleted. Do not claim
    // the post is private, and drop that obsolete locator before manual retry.
    if (['REVIEW_INTERACTION_NOT_FOUND', 'REVIEW_NOTIFICATION_NOT_FOUND'].includes(failure?.code)) {
      setNotificationContext(old => old?.postId === id ? { ...old, commentId: null } : old);
    }
    setDetail({ id, scopeKey, requestKey: feedKey, status: unavailable ? 'missing' : 'error', post: null, error: unavailable ? '' : errorMessage(failure, english) });
  };
  const readFeed = ({ preserveTail = false } = {}) => {
    if (feedRequest.current?.key === feedKey) {
      if (!preserveTail) feedRequest.current.preserveTail = false;
      return feedRequest.current.promise;
    }
    const serial = ++feedSerial.current;
    const versions = new Map(likeVersions.current), pendingAtStart = new Set(pendingLikes.current);
    const withdrawalsAtStart = new Map(withdrawalHistory.current);
    paging.current = false;
    setFeed(old => old.key === feedKey ? { ...old, more: false, error: '' } : blankFeed(feedKey));
    const request = { key: feedKey, preserveTail, promise: null, seen: null };
    request.promise = Promise.resolve().then(async () => {
      if (typeof db.fetchReviewPublicFeed !== 'function') throw new Error(english ? 'Public activity has not been configured.' : '公开动态尚未配置，请稍后重试。');
      if (activity.current && !detailId.current && !query && !symbol && !localSymbol && typeof unread.current?.captureBoundary === 'function') {
        try { request.seen = await unread.current.captureBoundary(); } catch { /* A failed badge read must not block the feed. */ }
      }
      return db.fetchReviewPublicFeed({ limit: 20, query, symbol: symbol || localSymbol }, userId);
    }).then(result => {
      if (!isCurrent() || serial !== feedSerial.current) return;
      seenBoundary.current = request.seen ? { key: feedKey, serial, token: request.seen } : null;
      const fresh = result.posts.filter(post => restorePublication(post.id, withdrawalsAtStart.get(post.id)));
      setFeed(old => {
        const freshIds = new Set(fresh.map(post => post.id));
        const tail = request.preserveTail && result.hasMore && result.nextCursor && old.key === feedKey
          ? old.posts.filter(post => !freshIds.has(post.id) && !withdrawn.current.has(post.id) && beforePublicCursor(post, result.nextCursor)) : [];
        // With an overlap, the already loaded tail retains its older cursor. If
        // a whole page of new posts arrived, paginate from the new boundary so
        // the unseen gap is not skipped, while keeping existing cards visible.
        const overlaps = tail.length && fresh.some(post => old.posts.some(item => item.id === post.id));
        return { ...blankFeed(feedKey), ...result, posts: [...fresh, ...tail], status: 'ready',
          ...(overlaps ? { hasMore: old.hasMore, nextCursor: old.nextCursor } : {}) };
      });
      reconcileLikes(result.posts, versions, pendingAtStart);
    }).catch(failure => {
      if (!isCurrent() || serial !== feedSerial.current) return;
      seenBoundary.current = null;
      setFeed(old => ({ ...(old.key === feedKey ? old : blankFeed(feedKey)), more: false,
        status: old.key === feedKey && old.posts.length ? 'ready' : 'error', error: errorMessage(failure, english) }));
      throw failure;
    }).finally(() => { if (feedRequest.current === request) feedRequest.current = null; });
    feedRequest.current = request;
    return request.promise;
  };
  const readDetail = id => {
    if (detailRequest.current?.key === feedKey && detailRequest.current.id === id) return detailRequest.current.promise;
    const serial = ++detailSerial.current;
    const versions = new Map(likeVersions.current), pendingAtStart = new Set(pendingLikes.current);
    const withdrawalAtStart = withdrawalHistory.current.get(id);
    const detailContext = { id, scopeKey, requestKey: feedKey };
    setDetail(previous => {
      const retained = previous?.id === id && previous.requestKey === feedKey && ['preview', 'ready'].includes(previous.status) ? previous.post : null;
      return { ...detailContext, status: retained ? previous.status : 'loading', post: retained, error: '' };
    });
    const request = { key: feedKey, id, promise: null };
    request.promise = Promise.resolve().then(() => db.fetchReviewPublicPost(id, userId)).then(post => {
      if (!isCurrent() || serial !== detailSerial.current || detailId.current !== id) return;
      if (!post) {
        revokeDetailAccess(id); return;
      }
      if (!restorePublication(id, withdrawalAtStart)) return;
      setDetail({ ...detailContext, status: 'ready', post, error: '' });
      setFeed(old => ({ ...old, posts: old.posts.map(item => item.id === id ? post : item) }));
      reconcileLikes([post], versions, pendingAtStart);
    }).catch(failure => {
      if (!isCurrent() || serial !== detailSerial.current || detailId.current !== id || withdrawalHistory.current.get(id) !== withdrawalAtStart) return;
      if (reviewCommentAccessRevoked(failure)) revokeDetailAccess(id, failure);
      else setDetail(previous => {
        const retained = previous?.id === id && previous.requestKey === feedKey && ['preview', 'ready'].includes(previous.status) ? previous.post : null;
        return { ...detailContext, status: retained ? previous.status : 'error', post: retained, error: errorMessage(failure, english) };
      });
      throw failure;
    }).finally(() => { if (detailRequest.current === request) detailRequest.current = null; });
    detailRequest.current = request;
    return request.promise;
  };
  const refresh = ({ automatic = false } = {}) => {
    if (!isCurrent() || !canRefresh()) return Promise.resolve();
    if (refreshRequest.current?.key === feedKey && refreshRequest.current.id === detailId.current) {
      if (!automatic && feedRequest.current?.key === feedKey) feedRequest.current.preserveTail = false;
      return refreshRequest.current.promise;
    }
    // Returning to the foreground may emit focus, pageshow and visibilitychange
    // together. They share one bounded refresh, including any initial request.
    if (automatic && Date.now() - lastRefresh.current < 1000) return Promise.resolve();
    lastRefresh.current = Date.now();
    const request = { key: feedKey, id: detailId.current, promise: null };
    const reads = [readFeed({ preserveTail: automatic })];
    if (detailId.current) reads.push(readDetail(detailId.current));
    request.promise = Promise.allSettled(reads).then(results => {
      if (!isCurrent()) return;
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    }).finally(() => { if (refreshRequest.current === request) refreshRequest.current = null; });
    refreshRequest.current = request;
    return request.promise;
  };
  latestRefresh.current = refresh;
  React.useEffect(() => {
    paging.current = false; setFeed(blankFeed(feedKey)); setLikes({}); pendingLikes.current.clear(); withdrawn.current.clear(); withdrawalHistory.current.clear();
    lastRefresh.current = 0;
    if (!userId) { setFeed({ ...blankFeed(feedKey), status: 'error', error: english ? 'Sign in to view public activity.' : '登录后可查看公开动态。' }); return undefined; }
    if (canRefresh()) { lastRefresh.current = Date.now(); readFeed().catch(() => {}); }
    return () => { feedSerial.current += 1; feedRequest.current = null; refreshRequest.current = null; };
  }, [db, userId, feedKey]);

  React.useEffect(() => {
    if (!currentDetail?.id || !canRefresh()) return undefined;
    readDetail(currentDetail.id).catch(() => {});
    return () => { detailSerial.current += 1; detailRequest.current = null; };
  }, [db, userId, currentDetail?.id, detailRetry, feedKey]);

  React.useEffect(() => {
    if (!active || !userId) return undefined;
    let timer, disposed = false;
    const manualRefresh = () => latestRefresh.current();
    if (refreshRef) refreshRef.current = manualRefresh;
    const schedule = () => {
      clearTimeout(timer);
      if (!disposed && canRefresh()) timer = setTimeout(() => {
        timer = null;
        latestRefresh.current({ automatic: true }).catch(() => {}).finally(schedule);
      }, 30000);
    };
    const resume = () => {
      clearTimeout(timer);
      if (!canRefresh()) return;
      latestRefresh.current({ automatic: true }).catch(() => {}).finally(schedule);
    };
    for (const event of ['focus', 'pageshow', 'online']) window.addEventListener?.(event, resume);
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', resume);
    resume();
    return () => {
      disposed = true; clearTimeout(timer);
      if (refreshRef?.current === manualRefresh) refreshRef.current = null;
      for (const event of ['focus', 'pageshow', 'online']) window.removeEventListener?.(event, resume);
      if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', resume);
    };
  }, [active, userId, refreshRef]);

  const loadMore = async () => {
    if (paging.current || feedRequest.current?.key === feedKey || feed.key !== feedKey || feed.status !== 'ready' || !feed.hasMore || !feed.nextCursor) return;
    const serial = feedSerial.current;
    paging.current = true; setFeed(old => ({ ...old, more: true, error: '' }));
    try {
      const result = await db.fetchReviewPublicFeed({ limit: 20, query, symbol: symbol || localSymbol, cursor: feed.nextCursor }, userId);
      if (!isCurrent() || serial !== feedSerial.current) return;
      setFeed(old => ({ ...old, posts: [...new Map([...old.posts, ...result.posts].filter(post => !withdrawn.current.has(post.id)).map(post => [post.id, post])).values()]
        .sort((left, right) => beforePublicCursor(left, right) ? 1 : -1), hasMore: result.hasMore, nextCursor: result.nextCursor, more: false }));
    } catch (failure) {
      if (isCurrent() && serial === feedSerial.current) setFeed(old => ({ ...old, more: false, error: errorMessage(failure, english) }));
    } finally { if (isCurrent() && serial === feedSerial.current) paging.current = false; }
  };
  const display = post => ({ ...post, ...(likes[post.id] || {}) });
  const like = async post => {
    if (detailId.current === post.id && !readyPost) return;
    if (pendingLikes.current.has(post.id)) return;
    const id = post.id, before = { liked: Boolean(post.liked), likeCount: post.likeCount };
    const liked = !before.liked;
    pendingLikes.current.add(id); likeVersions.current.set(id, (likeVersions.current.get(id) || 0) + 1);
    setLikes(old => ({ ...old, [id]: { liked, likeCount: Math.max(0, before.likeCount + (liked ? 1 : -1)), pending: true, error: '' } }));
    try {
      const result = await db.setReviewPublicLike(id, liked, userId);
      if (!isCurrent()) return;
      setLikes(old => ({ ...old, [id]: { liked: result.liked, likeCount: result.likeCount, pending: false, error: '' } }));
    } catch (failure) {
      if (!isCurrent()) return;
      if (reviewCommentAccessRevoked(failure)) {
        revokeDetailAccess(id, failure);
        return;
      }
      setLikes(old => ({ ...old, [id]: { ...before, pending: false, error: errorMessage(failure, english) } }));
      if (detailId.current === id) setDetailRetry(value => value + 1);
    } finally { if (isCurrent()) pendingLikes.current.delete(id); }
  };
  const open = (post, comments = false, notification = null) => {
    if (!isCurrent()) return;
    setNotificationContext(notification);
    pendingComments.current = comments;
    if (currentDetail?.id === post.id && visiblePost) {
      if (comments) { pendingComments.current = false; commentsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      return;
    }
    scrollPosition.current = window.scrollY;
    const route = { id: post.id, scopeKey, notification };
    historyRoutes.current.set(post.id, route);
    try { window.history?.pushState({ ...window.history.state, ...(notification?.journalRoute?{reviewJournalEntry:notification.journalRoute}:{}), reviewPublicEntry: { token: historyToken.current, id: post.id } }, ''); } catch { /* The local return button remains usable if history is unavailable. */ }
    // Only the current account/scope's visible feed can seed this preview. The
    // passed object may be just a notification ID, or an obsolete click closure.
    const preview = feed.key === feedKey && !withdrawn.current.has(post.id) ? feed.posts.find(item => item.id === post.id) || null : null;
    setDetail({ id: post.id, scopeKey, requestKey: feedKey, post: preview, status: preview ? 'preview' : 'loading', error: '' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  React.useEffect(()=>{
    if(!openRequest||openRequest.userId!==userId||handledOpen.current===openRequest.id)return;
    handledOpen.current=openRequest.id;
    open({id:openRequest.postId},Boolean(openRequest.commentId),openRequest);
    onOpenRequestHandled?.(openRequest.id);
  },[openRequest?.id,userId]);
  const back = () => {
    pendingComments.current = false;
    if (window.history?.state?.reviewPublicEntry?.token === historyToken.current && window.history.state.reviewPublicEntry.id === detailId.current) window.history.back();
    else { setDetail(null); restoreListPosition(); }
  };
  const selectSymbol = (value, event) => {
    event?.stopPropagation(); setDetail(null); setLocalSymbol(value);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const postNode = (post, full = false) => <PublicPost key={post.id} post={display(post)} full={full} db={db} userId={userId} language={language} onOpen={open} onLike={like}
    pending={Boolean(likes[post.id]?.pending)} interactionsDisabled={full && !readyPost} error={likes[post.id]?.error || ''} onSelectSymbol={selectSymbol} onManageOwnEntry={onManageOwnEntry} onOpenComments={post => open(post, true)} />;
  const ownedFeed = feed.key === feedKey ? feed : blankFeed(feedKey);
  const detailStatus = currentDetail?.requestKey === feedKey ? currentDetail.status : 'loading';
  React.useEffect(() => {
    const seen = seenBoundary.current;
    if (!seen || seen.key !== feedKey || seen.serial !== feedSerial.current || acknowledgedBoundary.current === seen
      || ownedFeed.status !== 'ready' || ownedFeed.error || currentDetail || !active || query || symbol || localSymbol
      || typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    acknowledgedBoundary.current = seen;
    Promise.resolve(unread.current?.markSeen?.(seen.token)).catch(() => {});
  }, [ownedFeed, currentDetail, active, query, symbol, localSymbol, feedKey]);
  return <section className="rpf-feed" aria-label={english ? 'Public activity' : '公开动态'}>
    {currentDetail ? <div className="rpf-detail"><header className="rj-page-header rpf-detail-header"><button type="button" className="rj-icon" onClick={back} aria-label={notificationContext ? (english?'Back to messages':'返回消息') : english ? 'Back to public activity' : '返回公开动态'}><ArrowLeft size={22} /></button><h1>{english ? 'Content Details' : '内容详情'}</h1><span className="rj-header-spacer" aria-hidden="true" /></header>
      {detailStatus === 'loading' && <PublicDetailSkeleton language={language}/>}
      {visiblePost && <div className="rj-entry-content">{postNode(visiblePost, true)}
        {currentDetail.error && <div className="rpf-detail-retry rpf-inline-error" role="alert"><p>{currentDetail.error}</p><button type="button" className="rj-text-button" onClick={() => setDetailRetry(value => value + 1)}>{english ? 'Retry' : '重试'}</button></div>}
        <PublicReplies post={visiblePost} db={db} userId={userId} language={language} marketColorMode={marketColorMode} onSelectSymbol={selectSymbol} onEvaluateOwnEntry={onEvaluateOwnEntry} onManageOwnReply={onManageOwnReply} onEvaluateCommunityEntry={onEvaluateCommunityEntry} onManageCommunityReply={onManageCommunityReply} onReplyToReview={onReplyToReview} onCommunityCountChange={onCommunityCountChange} sectionRef={commentsRef} replyTarget={replyTarget?.postId===currentDetail.id?replyTarget:null} interactionsDisabled={!readyPost} onAccessRevoked={failure => revokeDetailAccess(visiblePost.id, failure)} notificationTarget={notificationContext?.postId===currentDetail.id&&notificationContext.commentId?notificationContext:null}/></div>}
      {detailStatus === 'missing' && <p className="rpf-status" role="status">{english ? 'This post is no longer public.' : '这条博文已不再公开。'}</p>}
      {detailStatus === 'error' && <div className="rpf-status" role="alert"><p>{currentDetail.error}</p><button type="button" onClick={() => setDetailRetry(value => value + 1)}>{english ? 'Retry' : '重试'}</button></div>}
    </div> : <>
      {!!(symbol || localSymbol) && <div className="rpf-filter"><span>${symbol || localSymbol}</span>{!symbol && <button type="button" onClick={() => setLocalSymbol('')} aria-label={english ? 'Clear stock filter' : '取消股票筛选'}><X size={16} /></button>}</div>}
      {ownedFeed.status === 'loading' && <p className="rpf-status" role="status"><Loader2 size={18} className="rj-spin" />{english ? 'Loading public activity…' : '正在读取公开动态…'}</p>}
      {ownedFeed.status === 'error' && <div className="rpf-status" role="alert"><p>{ownedFeed.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{english ? 'Retry' : '重试'}</button></div>}
      {ownedFeed.posts.map(post => postNode(post))}
      {ownedFeed.status === 'ready' && !ownedFeed.posts.length && <div className="rpf-status"><p>{query || symbol || localSymbol ? english ? 'No matching public posts.' : '没有符合条件的公开博文。' : english ? 'No public posts yet.' : '还没有公开动态。'}</p><span>{english ? 'Choose Public when publishing to share a post.' : '发布时选择“公开”，就会展示在这里。'}</span></div>}
      {ownedFeed.status === 'ready' && ownedFeed.error && <p className="rpf-inline-error" role="alert">{ownedFeed.error}</p>}
      {ownedFeed.status === 'ready' && ownedFeed.hasMore && <button type="button" className="rpf-more" disabled={ownedFeed.more} onClick={loadMore}>{ownedFeed.more ? english ? 'Loading…' : '正在读取…' : english ? 'Load more' : '加载更多'}</button>}
    </>}
  </section>;
}

export default function ReviewPublicFeed(props) {
  return <ScopedPublicFeed key={props.userId || 'signed-out'} {...props} />;
}
