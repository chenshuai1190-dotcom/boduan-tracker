import React from 'react';
import { ArrowLeft, Heart, Loader2, RefreshCw, User, X } from 'lucide-react';
import { getCommunityAvatarOption } from '../lib/communityProfile.js';
import ReviewPostBody from './ReviewPostBody.jsx';
import { SnapshotCard } from './ReviewMarketSnapshot.jsx';
import './ReviewPublicFeed.css';

// Share only in-flight downloads. Completed public assets are not cached across
// visits, so a later visit checks the current post/avatar authorization again.
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

function PublicAvatar({ post, db, userId, language }) {
  const preset = getCommunityAvatarOption(post.author?.avatarKey).src;
  return <span className="rj-avatar rpf-avatar">{post.author?.avatarPath
    ? <PublicMedia db={db} userId={userId} kind="avatar" path={post.author.avatarPath} fallback={preset} language={language} />
    : <img src={preset} alt="" draggable={false} />}</span>;
}

function PublicPost({ post, full = false, db, userId, language, onOpen, onLike, pending, error, onSelectSymbol, onOpenOwnEntry }) {
  const [expanded, setExpanded] = React.useState(false);
  const english = language.startsWith('en');
  const open = event => {
    if (full || event.defaultPrevented || event.target.closest('button,a,input,textarea,select') || window.getSelection?.()?.toString()) return;
    onOpen(post);
  };
  return <article className={`rj-post rpf-post${full ? ' rpf-post-full' : ' rj-post-link'}`} tabIndex={full ? undefined : 0}
    aria-label={full ? undefined : `${post.author?.nickname || (english ? 'Quote user' : 'Quote 用户')} · ${post.date}`}
    onClick={open} onKeyDown={event => {
      if (full || event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); onOpen(post);
    }}>
    <PublicAvatar post={post} db={db} userId={userId} language={language} />
    <div className="rj-post-main">
      <div className="rj-post-heading"><strong>{post.author?.nickname || (english ? 'Quote user' : 'Quote 用户')}</strong><span>·</span><time dateTime={post.publishedAt}>{full ? post.publishedAt.slice(0, 10) : post.publishedAt.slice(5, 10).replace('-', '/')}</time></div>
      {full && post.date !== post.publishedAt.slice(0, 10) && <p className="rpf-record-date">{english ? 'Record date · ' : '记录日期 · '}{post.date}</p>}
      <ReviewPostBody text={post.text} candidates={post.stocks} onSelectSymbol={onSelectSymbol} language={language} full={full} expanded={expanded} onToggle={() => setExpanded(value => !value)} />
      {!!post.images?.length && <div className={`rj-photo-grid rj-images-${post.images.length} rpf-images`}>{post.images.map(item => <span key={item.path} className="rpf-image"><PublicMedia db={db} userId={userId} path={item.path} language={language} /></span>)}</div>}
      {!!post.stocks?.length && <div className="rpf-symbols">{post.stocks.map(symbol => <button key={symbol} type="button" onClick={event => onSelectSymbol(symbol, event)}>${symbol}</button>)}</div>}
      {post.market && <SnapshotCard value={post.market} language={language} />}
      <div className="rj-post-actions rpf-actions"><button type="button" className={`rpf-like${post.liked ? ' rpf-liked' : ''}`} aria-pressed={Boolean(post.liked)} disabled={pending}
        aria-label={english ? `${post.liked ? 'Unlike' : 'Like'} · ${post.likeCount}` : `${post.liked ? '取消点赞' : '点赞'} · ${post.likeCount}`} onClick={() => onLike(post)}>
        <Heart size={19} fill={post.liked ? 'currentColor' : 'none'} /><span>{post.likeCount > 0 ? post.likeCount.toLocaleString() : english ? 'Like' : '点赞'}</span>
      </button>{full && post.authorId === userId && onOpenOwnEntry && <button type="button" className="rpf-own-entry" onClick={() => onOpenOwnEntry(post.type, post.sourceId)}>{english ? 'My record' : '查看我的记录'}</button>}</div>
      {error && <p className="rpf-inline-error" role="alert">{error}</p>}
    </div>
  </article>;
}

const blankFeed = key => ({ key, posts: [], status: 'loading', error: '', hasMore: false, nextCursor: null, more: false });
const errorMessage = (failure, english) => failure?.message || (english ? 'Public activity is unavailable. Please retry.' : '公开动态暂时无法读取，请重试。');

function ScopedPublicFeed({ db, userId, language = 'zh', query = '', symbol = '', refreshToken = 0, onOpenOwnEntry, onDetailChange }) {
  const english = language.startsWith('en');
  const [localSymbol, setLocalSymbol] = React.useState('');
  const [retry, setRetry] = React.useState(0), [detailRetry, setDetailRetry] = React.useState(0);
  const feedKey = JSON.stringify([userId, query, symbol || localSymbol, refreshToken, retry]);
  const currentKey = React.useRef(feedKey), scopeVersion = React.useRef(0);
  if (currentKey.current !== feedKey) { currentKey.current = feedKey; scopeVersion.current += 1; }
  const version = scopeVersion.current;
  const [feed, setFeed] = React.useState(() => blankFeed(feedKey));
  const [detail, setDetail] = React.useState(null), [likes, setLikes] = React.useState({});
  const detailId = React.useRef(null); detailId.current = detail?.id || null;
  const detailCallback = React.useRef(onDetailChange); detailCallback.current = onDetailChange;
  const alive = React.useRef(true), paging = React.useRef(false), pendingLikes = React.useRef(new Set()), likeVersions = React.useRef(new Map()), withdrawn = React.useRef(new Set());
  const isCurrent = () => alive.current && currentKey.current === feedKey && scopeVersion.current === version;
  const scrollPosition = React.useRef(0);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; detailCallback.current?.(false); }; }, []);
  React.useEffect(() => { detailCallback.current?.(Boolean(detail)); }, [Boolean(detail)]);
  React.useEffect(() => { setLocalSymbol(''); }, [symbol, query]);
  React.useEffect(() => {
    let active = true;
    paging.current = false; setFeed(blankFeed(feedKey)); setDetail(null); setLikes({}); pendingLikes.current.clear(); withdrawn.current.clear();
    if (!userId) { setFeed({ ...blankFeed(feedKey), status: 'error', error: english ? 'Sign in to view public activity.' : '登录后可查看公开动态。' }); return undefined; }
    Promise.resolve().then(() => {
      if (typeof db.fetchReviewPublicFeed !== 'function') throw new Error(english ? 'Public activity has not been configured.' : '公开动态尚未配置，请稍后重试。');
      return db.fetchReviewPublicFeed({ limit: 20, query, symbol: symbol || localSymbol }, userId);
    }).then(result => {
      if (!active || !isCurrent()) return;
      setFeed({ ...blankFeed(feedKey), ...result, status: 'ready' });
    }).catch(failure => {
      if (active && isCurrent()) setFeed({ ...blankFeed(feedKey), status: 'error', error: errorMessage(failure, english) });
    });
    return () => { active = false; };
  }, [db, userId, feedKey]);

  React.useEffect(() => {
    if (!detail?.id) return undefined;
    let active = true;
    const id = detail.id, likeVersion = likeVersions.current.get(id) || 0, hadPendingLike = pendingLikes.current.has(id);
    setDetail({ id, status: 'loading', post: null, error: '' });
    Promise.resolve().then(() => db.fetchReviewPublicPost(id, userId)).then(post => {
      if (!active || !isCurrent() || detailId.current !== id || withdrawn.current.has(id)) return;
      if (!post) {
        withdrawn.current.add(id);
        setFeed(old => ({ ...old, posts: old.posts.filter(item => item.id !== id) }));
        setDetail({ id, status: 'missing', post: null, error: '' }); return;
      }
      setDetail({ id, status: 'ready', post, error: '' });
      setFeed(old => ({ ...old, posts: old.posts.map(item => item.id === id ? post : item) }));
      if (!hadPendingLike && !pendingLikes.current.has(id) && (likeVersions.current.get(id) || 0) === likeVersion) setLikes(old => { const next = { ...old }; delete next[id]; return next; });
    }).catch(failure => {
      if (active && isCurrent() && detailId.current === id && !withdrawn.current.has(id)) setDetail({ id, status: 'error', post: null, error: errorMessage(failure, english) });
    });
    return () => { active = false; };
  }, [db, userId, detail?.id, detailRetry, feedKey]);

  const loadMore = async () => {
    if (paging.current || feed.key !== feedKey || feed.status !== 'ready' || !feed.hasMore || !feed.nextCursor) return;
    paging.current = true; setFeed(old => ({ ...old, more: true, error: '' }));
    try {
      const result = await db.fetchReviewPublicFeed({ limit: 20, query, symbol: symbol || localSymbol, cursor: feed.nextCursor }, userId);
      if (!isCurrent()) return;
      setFeed(old => ({ ...old, posts: [...new Map([...old.posts, ...result.posts].filter(post => !withdrawn.current.has(post.id)).map(post => [post.id, post])).values()], hasMore: result.hasMore, nextCursor: result.nextCursor, more: false }));
    } catch (failure) {
      if (isCurrent()) setFeed(old => ({ ...old, more: false, error: errorMessage(failure, english) }));
    } finally { if (isCurrent()) paging.current = false; }
  };
  const display = post => ({ ...post, ...(likes[post.id] || {}) });
  const like = async post => {
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
      if (failure?.code === 'REVIEW_PUBLIC_NOT_FOUND') {
        withdrawn.current.add(id);
        setFeed(old => ({ ...old, posts: old.posts.filter(item => item.id !== id), error: english ? 'This post is no longer public.' : '这条博文已不再公开。' }));
        setLikes(old => { const next = { ...old }; delete next[id]; return next; });
        if (detailId.current === id) setDetail({ id, status: 'missing', post: null, error: '' });
        return;
      }
      setLikes(old => ({ ...old, [id]: { ...before, pending: false, error: errorMessage(failure, english) } }));
      if (detailId.current === id) setDetailRetry(value => value + 1);
    } finally { if (isCurrent()) pendingLikes.current.delete(id); }
  };
  const open = post => {
    scrollPosition.current = window.scrollY;
    setDetail({ id: post.id, post: null, status: 'loading', error: '' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const back = () => {
    setDetail(null);
    requestAnimationFrame(() => window.scrollTo({ top: scrollPosition.current, behavior: 'auto' }));
  };
  const selectSymbol = (value, event) => {
    event?.stopPropagation(); setDetail(null); setLocalSymbol(value);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const postNode = (post, full = false) => <PublicPost key={post.id} post={display(post)} full={full} db={db} userId={userId} language={language} onOpen={open} onLike={like}
    pending={Boolean(likes[post.id]?.pending)} error={likes[post.id]?.error || ''} onSelectSymbol={selectSymbol} onOpenOwnEntry={onOpenOwnEntry} />;
  const ownedFeed = feed.key === feedKey ? feed : blankFeed(feedKey);
  return <section className="rpf-feed" aria-label={english ? 'Public activity' : '公开动态'}>
    {detail ? <div className="rpf-detail"><div className="rpf-detail-header"><button type="button" className="rj-icon" onClick={back} aria-label={english ? 'Back to public activity' : '返回公开动态'}><ArrowLeft size={21} /></button><span>{english ? 'Public post' : '公开博文'}</span></div>
      {detail.status === 'loading' && <p className="rpf-status" role="status"><Loader2 size={18} className="rj-spin" />{english ? 'Loading post…' : '正在读取博文…'}</p>}
      {detail.status === 'ready' && detail.post && postNode(detail.post, true)}
      {detail.status === 'missing' && <p className="rpf-status" role="status">{english ? 'This post is no longer public.' : '这条博文已不再公开。'}</p>}
      {detail.status === 'error' && <div className="rpf-status" role="alert"><p>{detail.error}</p><button type="button" onClick={() => setDetailRetry(value => value + 1)}>{english ? 'Retry' : '重试'}</button></div>}
    </div> : <>
      {!!(symbol || localSymbol) && <div className="rpf-filter"><span>${symbol || localSymbol}</span>{!symbol && <button type="button" onClick={() => setLocalSymbol('')} aria-label={english ? 'Clear stock filter' : '取消股票筛选'}><X size={16} /></button>}</div>}
      <div className="rpf-list-tools"><span>{english ? 'Shared with Quote members' : 'Quote 用户公开发布'}</span><button type="button" onClick={() => setRetry(value => value + 1)} disabled={ownedFeed.status === 'loading'} aria-label={english ? 'Refresh public activity' : '刷新公开动态'}><RefreshCw size={15} /></button></div>
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
