import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const systemIdentitySource = readFileSync(new URL('../src/components/ReviewSystemIdentity.jsx', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/components/ReviewPublicFeed.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/ReviewPublicFeed.css', import.meta.url), 'utf8');
const journalCss = readFileSync(new URL('../src/pages/ReviewJournalPage.css', import.meta.url), 'utf8');
const walk = value => !React.isValidElement(value) ? Array.isArray(value) ? value.flatMap(walk) : [] : [value, ...walk(value.props.children)];
const words = value => !React.isValidElement(value) ? Array.isArray(value) ? value.map(words).join('') : String(value ?? '') : words(value.props.children);
const button = (tree, name) => walk(tree).find(node => node.type === 'button' && (node.props['aria-label'] === name || words(node) === name));
const flush = () => new Promise(resolve => setImmediate(resolve));
const post = (id = 'log:1', extra = {}) => ({ id, type: 'log', sourceId: id.split(':')[1], authorId: 'author', author: { nickname: '公开作者', avatarKey: 'fox', avatarPath: null }, text: '公开正文', date: '2026-11-05', stocks: ['NVDA'], images: [], market: null, publishedAt: '2026-11-06T12:00:00Z', updatedAt: '2026-11-06T12:00:00Z', likeCount: 0, liked: false, ...extra });
const result = (posts, nextCursor = null) => ({ posts, hasMore: Boolean(nextCursor), nextCursor });
let nextId = 0;

async function harness() {
  let slots = [], cursor = 0, effects = [];
  const listeners = new Map(), historyStates = [{ reviewJournalEntry: { token: 'parent', id: 'root' }, otherAppState: 'retained' }];
  let historyIndex = 0, now = 10000, nextTimer = 0;
  const documentListeners = new Map(), delays = new Map(), refreshRef = { current: null };
  const requests = [], images = [], created = [], revoked = [], timers = new Map(), detailChanges = [], detailNotifications = [], scrolls = [], commentScrolls = [];
  const request = (kind, args) => new Promise((resolve, reject) => requests.push({ kind, args, resolve, reject }));
  const db = {
    fetchReviewPublicFeed: (...args) => request('feed', args),
    fetchReviewPublicPost: (...args) => request('post', args),
    fetchReviewCommunityEvaluations: (...args) => request('community', args),
    readReviewNotificationTarget: (...args) => request('target', args),
    setReviewPublicLike: (...args) => request('like', args),
    downloadReviewPublicImage: (...args) => request('image', args),
    downloadReviewPublicAvatar: (...args) => request('avatar', args),
  };
  const fixture = {
    useState(initial) { const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (old && deps.every((dep, j) => Object.is(dep, old.deps[j]))) return; old?.cleanup?.(); const slot = { deps }; slots[i] = slot; effects.push(() => { slot.cleanup = effect(); }); },
    window: { scrollY: 420, scrollTo: value => scrolls.push(value), getSelection: () => ({ toString: () => '' }) },
    document: { visibilityState: 'visible' }, Date: { now: () => now, parse: Date.parse },
    requestAnimationFrame: fn => fn(), Blob,
    Image: class { constructor() { images.push(this); } decode() { return Promise.resolve(); } },
    URL: { createObjectURL: blob => { const url = `blob:public-${created.length}`; created.push({ blob, url }); return url; }, revokeObjectURL: url => revoked.push(url) },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, fn); delays.set(id, delay); return id; }, clearTimeout: id => { timers.delete(id); delays.delete(id); },
  };
  fixture.window.addEventListener = (type, listener) => { const values = listeners.get(type) || new Set(); values.add(listener); listeners.set(type, values); };
  fixture.window.removeEventListener = (type, listener) => listeners.get(type)?.delete(listener);
  fixture.document.addEventListener = (type, listener) => { const values = documentListeners.get(type) || new Set(); values.add(listener); documentListeners.set(type, values); };
  fixture.document.removeEventListener = (type, listener) => documentListeners.get(type)?.delete(listener);
  fixture.window.history = {
    get state() { return historyStates[historyIndex]; },
    pushState(state) { historyStates.splice(++historyIndex, Infinity, state); },
    replaceState(state) { historyStates[historyIndex] = state; },
    back() { if (historyIndex > 0) { historyIndex--; for (const listener of listeners.get('popstate') || []) listener({ state: historyStates[historyIndex] }); } },
    forward() { if (historyIndex < historyStates.length - 1) { historyIndex++; for (const listener of listeners.get('popstate') || []) listener({ state: historyStates[historyIndex] }); } },
  };
  const key = `__publicFeedUI${++nextId}`; globalThis[key] = fixture;
  let components;
  try {
    const compiled = await transformWithOxc(`
      import ActualReact from ${JSON.stringify(import.meta.resolve('react'))};
      import { ArrowLeft, Heart, Loader2, MessageCircle, MoreHorizontal, User, X } from ${JSON.stringify(import.meta.resolve('lucide-react'))};
      import ReviewActivityTime from ${JSON.stringify(new URL('../src/components/ReviewActivityTime.js', import.meta.url).href)};
      import { getCommunityAvatarOption } from ${JSON.stringify(new URL('../src/lib/communityProfile.js', import.meta.url).href)};
      import { normalizeReviewTradeReferences } from ${JSON.stringify(new URL('../src/lib/reviewEvaluationModel.js', import.meta.url).href)};
      import { createReviewPublicAvatarCache } from ${JSON.stringify(new URL('../src/lib/reviewPublicAvatarCache.js', import.meta.url).href)};
      import { reviewCommentAccessRevoked } from ${JSON.stringify(new URL('../src/lib/reviewCommentThreads.js', import.meta.url).href)};
      const fixture = globalThis[${JSON.stringify(key)}];
      const React = { ...ActualReact, useState: fixture.useState, useRef: fixture.useRef, useEffect: fixture.useEffect };
      const { window, document, Date, requestAnimationFrame, Blob, Image, URL, setTimeout, clearTimeout } = fixture;
      const reviewPublicAvatarCache = createReviewPublicAvatarCache({ now: Date.now, createUrl: URL.createObjectURL, revokeUrl: URL.revokeObjectURL, makeImage: () => new Image(), timeout: setTimeout, cancelTimeout: clearTimeout });
      const ReviewPostBody = props => React.createElement('p', null, props.text);
      const SnapshotCard = () => React.createElement('section', null, '市场快照');
      const EvaluationRating = () => React.createElement('div', null, '评分及标签');
      const ReviewAccountCard = () => React.createElement('section', null, '账户快照');
      const avatar = '/test/quote-system-fox.jpg';
      ${systemIdentitySource.slice(systemIdentitySource.indexOf('export function'))}
      ${source.slice(source.indexOf('// Share only in-flight'))}
      export { ReviewActivityTime, ScopedPublicFeed, PublicPost, PublicReplies, PublicDetailSkeleton, PublicTradeReferences, PublicMedia, PublicAvatarMedia, reviewPublicAvatarCache, ReviewPostBody, EvaluationRating, ReviewAccountCard, SnapshotCard };
    `, 'ReviewPublicFeedUITest.jsx', { jsx: { runtime: 'classic' } });
    components = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  } finally { delete globalThis[key]; }
  const props = { db, userId: 'viewer', refreshRef, onDetailChange: (value, post) => { detailChanges.push(value); detailNotifications.push({ open: value, post }); } };
  const render = (component, values) => { cursor = 0; effects = []; const tree = component(values); for (const node of walk(tree)) if (node.type === components.PublicReplies) node.props.sectionRef.current = { scrollIntoView: value => commentScrolls.push(value) }; for (const effect of effects) effect(); return tree; };
  return { db, props, components, requests, images, created, revoked, timers, detailChanges, detailNotifications, scrolls, commentScrolls, history: fixture.window.history, refreshRef,
    advance(ms) { now += ms; },
    setScroll(value) { fixture.window.scrollY = value; },
    dispatch(type) { for (const listener of listeners.get(type) || []) listener({ type }); },
    visibility(value) { fixture.document.visibilityState = value; for (const listener of documentListeners.get('visibilitychange') || []) listener(); },
    tick() { const entry = [...delays.entries()].find(([, delay]) => delay === 30000); assert.ok(entry, 'visible feed schedules a bounded refresh'); const [id, delay] = entry; const fn = timers.get(id); timers.delete(id); delays.delete(id); now += delay; fn(); },
    listenerCount() { return [...listeners.values(), ...documentListeners.values()].reduce((count, set) => count + set.size, 0); },
    feed: overrides => render(components.ScopedPublicFeed, { ...props, ...overrides }),
    render, posts: tree => walk(tree).filter(node => node.type === components.PublicPost),
    unmount() { for (const slot of slots) slot?.cleanup?.(); slots = []; },
  };
}

test('public feed authenticates through the viewer-scoped repository and separates empty from failed reads', async () => {
  const h = await harness();
  let tree = h.feed(); await flush();
  assert.match(words(tree), /正在读取公开动态/);
  assert.deepEqual(h.requests[0].args, [{ limit: 20, query: '', symbol: '' }, 'viewer']);
  h.requests[0].reject(new Error('公开动态尚未配置')); await flush(); tree = h.feed();
  assert.match(words(tree), /公开动态尚未配置/);
  assert.doesNotMatch(words(tree), /还没有公开动态/);
  button(tree, '重试').props.onClick(); h.feed(); await flush();
  h.requests[1].resolve(result([])); await flush(); tree = h.feed();
  assert.match(words(tree), /还没有公开动态/);
  h.unmount();
});

test('a public detail shows its known body while checking access, and withdrawal removes both it and the list item', async () => {
  const h = await harness(); h.feed(); await flush();
  const old = post(); h.requests[0].resolve(result([old])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(old); tree = h.feed(); await flush();
  assert.equal(h.posts(tree).length, 1, 'the current list body is immediately readable');
  assert.equal(h.posts(tree)[0].props.post.text, old.text);
  assert.equal(h.posts(tree)[0].props.interactionsDisabled, true, 'a visible preview does not authorize writes');
  assert.equal(h.detailNotifications.at(-1).post, null, 'the parent receives only freshly verified details');
  assert.deepEqual(h.requests[1].args, [old.id, 'viewer']);
  assert.equal(h.detailChanges.at(-1), true);
  h.requests[1].resolve(null); await flush(); tree = h.feed();
  assert.match(words(tree), /已不再公开/);
  assert.equal(h.posts(tree).length, 0);
  button(tree, '返回公开动态').props.onClick(); tree = h.feed();
  assert.equal(h.detailChanges.at(-1), false);
  assert.equal(h.posts(tree).length, 0);
  assert.deepEqual(h.scrolls.at(-1), { top: 420, behavior: 'auto' });
  h.unmount();
});

test('known detail content and the comments reader mount before the detail request resolves', async () => {
  const h = await harness(), known = post('log:1', { text: '列表里已经读到的完整正文' });
  h.feed(); await flush(); h.requests[0].resolve(result([known])); await flush();
  let tree = h.feed();
  h.posts(tree)[0].props.onOpen({ ...known, text: 'UNTRUSTED_CLICK_PAYLOAD' });
  tree = h.feed(); await flush();
  const preview = h.posts(tree)[0], comments = walk(tree).find(node => node.type === h.components.PublicReplies);
  assert.equal(preview.props.post.text, known.text, 'only the current viewer and filter list supplies the preview');
  assert.equal(preview.props.full, true);
  assert.ok(comments, 'comments can start their own authenticated read without waiting for the post RPC');
  assert.equal(comments.props.post.id, known.id);
  assert.equal(comments.props.interactionsDisabled, true);
  assert.equal(preview.props.interactionsDisabled, true);
  assert.equal(h.requests.filter(request => request.kind === 'post').length, 1);
  assert.equal(walk(tree).some(node => node.type === h.components.PublicDetailSkeleton), false);
  assert.equal(h.detailNotifications.at(-1).post, null);
  const fresh = { ...known, text: '详情后台核验后的正文' };
  h.requests.find(request => request.kind === 'post').resolve(fresh); await flush(); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.text, fresh.text);
  assert.equal(Boolean(h.posts(tree)[0].props.interactionsDisabled), false);
  assert.equal(Boolean(walk(tree).find(node => node.type === h.components.PublicReplies).props.interactionsDisabled), false);
  assert.equal(h.detailNotifications.at(-1).post, fresh);
  h.unmount();
});

test('preview presentation cannot invoke post likes, record management or a new evaluation', async () => {
  const known = post('log:1', { authorId: 'viewer' }), actions = [];
  const h = await harness();
  const tree = h.render(h.components.PublicPost, { post: known, full: true, db: h.db, userId: 'viewer', language: 'zh',
    interactionsDisabled: true, onLike: () => actions.push('like'), onManageOwnEntry: () => actions.push('manage') });
  const like = button(tree, '点赞 · 0'), manage = button(tree, '记录操作');
  assert.equal(like.props.disabled, true); assert.equal(manage.props.disabled, true);
  like.props.onClick(); manage.props.onClick({ stopPropagation() {} });
  assert.deepEqual(actions, [], 'even a stale queued handler cannot start a write from a preview');
  h.unmount();
  const replies = await harness();
  const section = replies.render(replies.components.PublicReplies, { post: known, db: replies.db, userId: 'viewer', language: 'zh',
    interactionsDisabled: true, onEvaluateOwnEntry: () => actions.push('evaluate') });
  const evaluate = button(section, '写评价'); assert.ok(!evaluate || evaluate.props.disabled);
  evaluate?.props.onClick?.(); assert.deepEqual(actions, []);
  replies.unmount();
});

test('unknown notification details show a skeleton without trusting a notification body or author', async () => {
  const h = await harness(), openRequest = { id: 'unknown-detail', userId: 'viewer', postId: 'log:absent',
    text: 'UNTRUSTED_NOTIFICATION_BODY', authorId: 'viewer', commentId: null };
  h.feed({ openRequest }); await flush(); const tree = h.feed({ openRequest }); await flush();
  assert.equal(h.posts(tree).length, 0);
  assert.ok(walk(tree).find(node => node.type === h.components.PublicDetailSkeleton));
  assert.equal(h.detailNotifications.at(-1).post, null);
  assert.deepEqual(h.requests.find(request => request.kind === 'post').args, ['log:absent', 'viewer']);
  assert.doesNotMatch(words(tree), /UNTRUSTED_NOTIFICATION_BODY|还没有评论/);
  h.unmount();
});

test('a transient detail failure retains the readable preview and retry without granting write permission', async () => {
  const h = await harness(), known = post();
  h.feed(); await flush(); h.requests[0].resolve(result([known])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(known); h.feed(); await flush();
  h.requests.find(request => request.kind === 'post').reject(new Error('暂时网络中断')); await flush(); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.text, known.text);
  assert.equal(h.posts(tree)[0].props.interactionsDisabled, true);
  assert.match(words(tree), /暂时网络中断/);
  assert.doesNotMatch(words(tree), /已不再公开|还没有公开动态/);
  assert.equal(h.detailNotifications.at(-1).post, null);
  button(tree, '重试').props.onClick(); h.feed(); await flush();
  h.requests.filter(request => request.kind === 'post').at(-1).resolve(post('log:1', { text: '重试确认可见' })); await flush(); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.text, '重试确认可见');
  assert.equal(Boolean(h.posts(tree)[0].props.interactionsDisabled), false);
  h.unmount();
});

test('private, forbidden and invalid-session detail responses remove preview and stale list content', async () => {
  for (const code of ['REVIEW_PUBLIC_NOT_FOUND', 'REVIEW_PUBLIC_FORBIDDEN', 'REVIEW_AUTH_REQUIRED', 'REVIEW_ACCOUNT_CHANGED']) {
    const h = await harness(), known = post();
    h.feed(); await flush(); h.requests[0].resolve(result([known])); await flush();
    let tree = h.feed(); h.posts(tree)[0].props.onOpen(known); h.feed(); await flush();
    h.requests.find(request => request.kind === 'post').reject(Object.assign(new Error('当前内容不可访问'), { code }));
    await flush(); tree = h.feed();
    assert.equal(h.posts(tree).length, 0, code);
    assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies), undefined, code);
    assert.equal(h.detailNotifications.at(-1).post, null, code);
    button(tree, '返回公开动态').props.onClick(); tree = h.feed();
    assert.equal(h.posts(tree).length, 0, `${code} cannot leave a still-readable list copy`);
    h.unmount();
  }
});

test('a retry after access denial can show a network error and recover instead of remaining a loading skeleton', async () => {
  const h = await harness(), known = post();
  h.feed(); await flush(); h.requests[0].resolve(result([known])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(known); h.feed(); await flush();
  h.requests.find(request => request.kind === 'post').reject(Object.assign(new Error('暂时无权访问'), { code: 'REVIEW_PUBLIC_FORBIDDEN' }));
  await flush(); tree = h.feed(); assert.equal(h.posts(tree).length, 0);
  button(tree, '重试').props.onClick(); h.feed(); await flush();
  h.requests.filter(request => request.kind === 'post').at(-1).reject(new Error('重试时网络中断'));
  await flush(); tree = h.feed();
  assert.match(words(tree), /重试时网络中断/);
  assert.equal(walk(tree).some(node => node.type === h.components.PublicDetailSkeleton), false);
  assert.equal(h.posts(tree).length, 0);
  button(tree, '重试').props.onClick(); h.feed(); await flush();
  h.requests.filter(request => request.kind === 'post').at(-1).resolve(post('log:1', { text: '重新核验后恢复可见' }));
  await flush(); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.text, '重新核验后恢复可见');
  assert.equal(Boolean(h.posts(tree)[0].props.interactionsDisabled), false);
  h.unmount();
});

test('a comments access failure removes preview and invalidates the earlier successful detail response', async () => {
  const h = await harness(), known = post();
  h.feed(); await flush(); h.requests[0].resolve(result([known])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(known); tree = h.feed(); await flush();
  const comments = walk(tree).find(node => node.type === h.components.PublicReplies);
  assert.equal(typeof comments.props.onAccessRevoked, 'function');
  comments.props.onAccessRevoked(Object.assign(new Error('帖子已改为私密'), { code: 'REVIEW_INTERACTION_FORBIDDEN' }));
  tree = h.feed(); assert.equal(h.posts(tree).length, 0);
  h.requests.find(request => request.kind === 'post').resolve({ ...known, text: 'LATE_WITHDRAWN_BODY' }); await flush(); tree = h.feed();
  assert.equal(h.posts(tree).length, 0);
  assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies), undefined);
  assert.equal(h.detailNotifications.at(-1).post, null);
  button(tree, '返回公开动态').props.onClick(); tree = h.feed();
  assert.equal(h.posts(tree).length, 0);
  h.unmount();
});

test('ambiguous missing comment targets clear stale content, preserve the original error and retry without the deleted target', async () => {
  for (const code of ['REVIEW_NOTIFICATION_NOT_FOUND', 'REVIEW_INTERACTION_NOT_FOUND']) {
    const h = await harness(), known = post();
    h.feed(); await flush(); h.requests[0].resolve(result([known])); await flush(); h.feed();
    const openRequest = { id: `missing-${code}`, userId: 'viewer', postId: known.id, notificationId: 'notice', commentId: 'removed-comment' };
    h.feed({ openRequest }); await flush(); let tree = h.feed({ openRequest }); await flush();
    const comments = walk(tree).find(node => node.type === h.components.PublicReplies);
    assert.equal(comments.props.notificationTarget.commentId, 'removed-comment');
    const oldDetail = h.requests.find(request => request.kind === 'post');
    comments.props.onAccessRevoked(Object.assign(new Error('引用对象暂不可用，请重新读取'), { code }));
    tree = h.feed({ openRequest });
    assert.equal(h.posts(tree).length, 0);
    assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies), undefined);
    assert.match(words(tree), /引用对象暂不可用，请重新读取/);
    assert.doesNotMatch(words(tree), /已不再公开|已改为私密/);
    oldDetail.resolve({ ...known, text: 'LATE_AMBIGUOUS_BODY' }); await flush(); tree = h.feed({ openRequest });
    assert.equal(h.posts(tree).length, 0, 'a missing object may also mean the parent became private');
    button(tree, '重试').props.onClick(); h.feed({ openRequest }); await flush();
    h.requests.filter(request => request.kind === 'post').at(-1).resolve({ ...known, text: '重新确认正文可访问' });
    await flush(); tree = h.feed({ openRequest });
    assert.equal(h.posts(tree)[0].props.post.text, '重新确认正文可访问');
    assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies).props.notificationTarget, null);
    h.unmount();
  }
});

test('comments arriving before the detail retain their count when the same post revision is replaced', async () => {
  const h = await harness(), known = post('log:1', { commentCount: 1 });
  const db = { ...h.db, fetchReviewCommentThreads() { throw new Error('the section does not load threads itself'); } };
  const props = { post: known, db, userId: 'viewer', language: 'zh', interactionsDisabled: true };
  let tree = h.render(h.components.PublicReplies, props);
  const reader = walk(tree).find(node => node.props.postId === known.id && typeof node.props.onCountChange === 'function');
  assert.ok(reader); reader.props.onCountChange(known.id, 6, 6);
  tree = h.render(h.components.PublicReplies, { ...props, post: { ...known }, interactionsDisabled: false });
  assert.match(words(tree), /评论 · 6/);
  tree = h.render(h.components.PublicReplies, { ...props, post: { ...known, updatedAt: '2026-11-06T13:00:00Z', commentCount: 2 } });
  assert.match(words(tree), /评论 · 2/);
  h.unmount();
});

test('switching viewer or filter immediately hides the preview and rejects its pending detail', async () => {
  for (const replacement of [{ userId: 'new-viewer' }, { query: 'new-filter' }]) {
    const h = await harness(), known = post('log:1', { text: 'OLD_SCOPE_BODY' });
    h.feed(); await flush(); h.requests[0].resolve(result([known])); await flush();
    let tree = h.feed(); h.posts(tree)[0].props.onOpen(known); tree = h.feed(); await flush();
    const pending = h.requests.find(request => request.kind === 'post');
    const previousComments = walk(tree).find(node => node.type === h.components.PublicReplies);
    tree = h.feed(replacement); await flush();
    assert.equal(h.posts(tree).length, 0);
    assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies), undefined);
    const fresh = post('log:1', { text: 'NEW_SCOPE_BODY' });
    h.requests.filter(request => request.kind === 'feed').at(-1).resolve(result([fresh]));
    await flush(); h.feed(replacement);
    previousComments.props.onAccessRevoked(Object.assign(new Error('OLD_SCOPE_ACCESS_ERROR'), { code: 'REVIEW_INTERACTION_FORBIDDEN' }));
    pending.resolve({ ...known, text: 'LATE_OLD_SCOPE_BODY' }); await flush(); tree = h.feed(replacement);
    assert.deepEqual(h.posts(tree).map(node => node.props.post.text), ['NEW_SCOPE_BODY']);
    assert.equal(button(tree, '返回公开动态'), undefined);
    h.unmount();
  }
});

test('returning during preview restores the list offset and a late detail cannot reopen it', async () => {
  const h = await harness(), known = post();
  h.feed(); await flush(); h.requests[0].resolve(result([known])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(known); tree = h.feed(); await flush();
  button(tree, '返回公开动态').props.onClick(); tree = h.feed();
  assert.deepEqual(h.scrolls.at(-1), { top: 420, behavior: 'auto' });
  h.requests.find(request => request.kind === 'post').resolve({ ...known, text: 'LATE_DETAIL_BODY' }); await flush(); tree = h.feed();
  assert.equal(button(tree, '返回公开动态'), undefined);
  assert.equal(h.posts(tree)[0].props.full, false);
  assert.equal(h.posts(tree)[0].props.post.text, known.text);
  assert.equal(h.detailChanges.at(-1), false);
  h.unmount();
});

test('clicking comments during preview scrolls without adding another history entry or losing the list offset', async () => {
  const h = await harness(), known = post();
  h.feed(); await flush(); h.requests[0].resolve(result([known])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(known); tree = h.feed(); await flush();
  h.setScroll(100);
  h.posts(tree)[0].props.onOpenComments(known); tree = h.feed(); await flush();
  assert.deepEqual(h.commentScrolls.at(-1), { block: 'start', behavior: 'smooth' });
  assert.equal(h.requests.filter(request => request.kind === 'post').length, 1);
  assert.equal(h.posts(tree)[0].props.interactionsDisabled, true);
  button(tree, '返回公开动态').props.onClick(); tree = h.feed();
  assert.equal(button(tree, '返回公开动态'), undefined, 'one back returns to the list, not a duplicate preview route');
  assert.deepEqual(h.scrolls.at(-1), { top: 420, behavior: 'auto' });
  h.unmount();
});

test('load more is bounded to one request and merges overlapping pages without duplicate posts', async () => {
  const h = await harness(); h.feed(); await flush();
  const cursor = { recordDate: '2026-11-05', publishedAt: '2026-11-06T12:00:00Z', id: 'log:1' };
  h.requests[0].resolve(result([post()], cursor)); await flush();
  let tree = h.feed(); const more = button(tree, '加载更多'); more.props.onClick(); more.props.onClick();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests[1].args[0].cursor, cursor);
  h.requests[1].resolve(result([post(), post('log:2', { publishedAt: '2026-11-06T11:00:00Z' })])); await flush(); tree = h.feed();
  assert.deepEqual(h.posts(tree).map(node => node.props.post.id), ['log:1', 'log:2']);
  assert.equal(button(tree, '加载更多'), undefined);
  h.unmount();
});

test('likes update immediately, serialize repeated taps and reconcile with authoritative counts', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(), card = h.posts(tree)[0];
  card.props.onLike(card.props.post); card.props.onLike(card.props.post); tree = h.feed();
  assert.equal(h.requests.filter(item => item.kind === 'like').length, 1);
  assert.deepEqual(h.requests[1].args, ['log:1', true, 'viewer']);
  assert.equal(h.posts(tree)[0].props.post.liked, true);
  assert.equal(h.posts(tree)[0].props.post.likeCount, 1);
  assert.equal(h.posts(tree)[0].props.pending, true);
  h.requests[1].resolve({ postId: 'log:1', liked: true, likeCount: 7 }); await flush(); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.likeCount, 7);
  card = h.posts(tree)[0]; card.props.onLike(card.props.post); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.likeCount, 6);
  h.requests[2].reject(new Error('连接失败')); await flush(); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.likeCount, 7);
  assert.equal(h.posts(tree)[0].props.post.liked, true);
  assert.equal(h.posts(tree)[0].props.error, '连接失败');
  h.unmount();
});

test('older queries and pending likes cannot write into a replacement account or scope', async () => {
  const h = await harness(); h.feed({ query: 'old' }); await flush();
  h.feed({ query: 'new' }); await flush();
  h.requests[1].resolve(result([post('log:2')])); await flush();
  h.requests[0].resolve(result([post('log:1')])); await flush();
  let tree = h.feed({ query: 'new' }); assert.deepEqual(h.posts(tree).map(node => node.props.post.id), ['log:2']);
  h.posts(tree)[0].props.onLike(h.posts(tree)[0].props.post);
  h.feed({ query: 'new', userId: 'different-viewer' }); await flush();
  h.requests[3].resolve(result([post('log:2', { likeCount: 3 })])); await flush();
  h.requests[2].resolve({ postId: 'log:2', liked: true, likeCount: 8 }); await flush();
  tree = h.feed({ query: 'new', userId: 'different-viewer' });
  assert.equal(h.posts(tree)[0].props.post.likeCount, 3);
  assert.equal(h.posts(tree)[0].props.post.liked, false);
  h.unmount();
});

test('a revoked post cannot reappear from an earlier detail response after a failed like', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(), card = h.posts(tree)[0];
  card.props.onLike(card.props.post); card.props.onOpen(card.props.post); h.feed(); await flush();
  h.requests[1].reject(Object.assign(new Error('Post withdrawn'), { code: 'REVIEW_PUBLIC_NOT_FOUND' })); await flush();
  h.requests[2].resolve(post()); await flush(); tree = h.feed();
  assert.match(words(tree), /已不再公开/);
  assert.equal(h.posts(tree).length, 0);
  button(tree, '返回公开动态').props.onClick(); tree = h.feed();
  assert.equal(h.posts(tree).length, 0);
  h.unmount();
});

test('a detail read started during a pending like cannot overwrite the confirmed count', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(), card = h.posts(tree)[0];
  card.props.onLike(card.props.post); card.props.onOpen(card.props.post); h.feed(); await flush();
  h.requests[1].resolve({ postId: 'log:1', liked: true, likeCount: 7 }); await flush();
  h.requests[2].resolve(post()); await flush(); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.likeCount, 7);
  assert.equal(h.posts(tree)[0].props.post.liked, true);
  button(tree, '返回公开动态').props.onClick(); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.likeCount, 7);
  h.unmount();
});

test('returning to the same filter cannot accept a like response from its previous visit', async () => {
  const h = await harness(); h.feed({ query: 'old' }); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed({ query: 'old' }), card = h.posts(tree)[0]; card.props.onLike(card.props.post);
  h.feed({ query: 'new' }); await flush(); h.feed({ query: 'old' }); await flush();
  h.requests[3].resolve(result([post('log:1', { likeCount: 3 })])); await flush();
  h.requests[1].resolve({ postId: 'log:1', liked: true, likeCount: 8 }); await flush();
  tree = h.feed({ query: 'old' }); assert.equal(h.posts(tree)[0].props.post.likeCount, 3);
  assert.equal(h.posts(tree)[0].props.post.liked, false);
  h.unmount();
});

test('public cards do not render unprojected top-level account/trade data or inline reply bodies', async () => {
  const h = await harness();
  const unsafe = post('log:1', { replies: [{ text: 'PRIVATE_EVALUATION' }], account: { total: 'PRIVATE_ACCOUNT' }, trades: [{ price: 'PRIVATE_EXECUTION' }], text: 'Visible post', market: { public: true } });
  const tree = h.render(h.components.PublicPost, { post: unsafe, full: true, db: h.db, userId: 'viewer', language: 'zh', onManageOwnEntry() {} });
  assert.ok(tree.props.className.split(' ').includes('rj-post-full'), 'public details use the shared border-free full-post class');
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Visible post/); assert.match(html, /市场快照/);
  assert.doesNotMatch(html, /PRIVATE_|写评价|查看我的记录|记录操作/);
  assert.doesNotMatch(source, /stockTrades|ReviewStockReplay|resolveReviewJournalImage|onOpenOwnEntry|查看我的记录|rpf-list-tools|getOwnCommentCount|renderOwnReplies/);
  h.unmount();
});

test('only the author gets the shared record action menu on both cards and details', async () => {
  const h = await harness(), calls = [];
  for (const full of [false, true]) {
    const props = { post: post(), full, db: h.db, userId: 'author', language: 'zh', onManageOwnEntry: (...args) => calls.push(args) };
    let tree = h.render(h.components.PublicPost, props);
    const action = button(tree, '记录操作'); assert.ok(action);
    assert.match(action.props.className, /rj-post-more/);
    let stopped = false; action.props.onClick({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true); assert.deepEqual(calls.at(-1), ['log', '1']);
    const date = walk(tree).find(node => node.type === h.components.ReviewActivityTime);
    assert.equal(date.props.createdAt, props.post.publishedAt, 'cards and detail use the original creation instant');
    assert.equal(date.props.date, props.post.date, 'the review date is only the legacy fallback');
    assert.match(renderToStaticMarkup(date), /dateTime="2026-11-06T12:00:00Z"/);
    assert.doesNotMatch(words(tree), /记录日期/);
    tree = h.render(h.components.PublicPost, { ...props, userId: 'another-user' });
    assert.equal(button(tree, '记录操作'), undefined);
    assert.equal(button(tree, '查看我的记录'), undefined);
  }
  assert.equal(calls.length, 2); h.unmount();
});

test('all public visitors can see projected comment counts and open comments from list or detail', async () => {
  const h = await harness(), opens = [];
  for (const full of [false, true]) {
    for (const userId of ['author', 'another-user']) {
      const publicPost = post('log:1', { replies: full ? [{ id: 'reply-1' }, { id: 'reply-2' }] : [] });
      const tree = h.render(h.components.PublicPost, { post: publicPost, full, db: h.db, userId, language: 'zh', onOpenComments: (...args) => opens.push(args) });
      const actionRow = walk(tree).find(node => node.props.className === 'rj-post-actions rpf-actions');
      assert.deepEqual(walk(actionRow).filter(node => node.type === 'button').map(node => node.props['aria-label']), ['点赞 · 0', '查看评论']);
      const action = button(tree, '查看评论'); assert.ok(action);
      assert.equal(words(action), full ? '2' : '评论');
      const event = { stopped: false, stopPropagation() { this.stopped = true; } }; action.props.onClick(event);
      assert.equal(event.stopped, true); assert.deepEqual(opens.at(-1), [publicPost, event]);
    }
  }
  assert.match(css, /\.rj-post-actions\.rpf-actions\{justify-content:flex-start;gap:24px\}/);
  assert.equal(opens.length, 4); h.unmount();
});

test('public replies show every saved attachment while only their author receives editing actions', async () => {
  const h = await harness(), evaluations = [], actions = [];
  const trade = { id: 'trade-1', symbol: 'NVDA', date: '2026-11-04', side: 'buy', price: 123.45, shares: 7 };
  const reply = { id: 'reply-1', date: '2026-11-07', text: '公开的复盘评价', score: 8, tags: ['按计划执行'], mood: '冷静', stocks: ['NVDA'], images: [{ path: 'author/shared-reply.webp' }], market: { id: 'saved-market' }, account: { id: 'saved-account' }, trades: [trade] };
  const publicPost = post('log:1', { replies: [reply] });
  const props = { post: publicPost, db: h.db, userId: 'author', language: 'zh', onEvaluateOwnEntry: (...args) => evaluations.push(args), onManageOwnReply: (...args) => actions.push(args), onSelectSymbol() {} };
  let tree = h.render(h.components.PublicReplies, props);
  button(tree, '写评价').props.onClick(); button(tree, '评论操作').props.onClick();
  assert.deepEqual(evaluations, [['log', '1']]); assert.deepEqual(actions, [['log', '1', 'reply-1']]);
  tree = h.render(h.components.PublicReplies, { ...props, userId: 'another-user' });
  assert.equal(button(tree, '写评价'), undefined); assert.equal(button(tree, '评论操作'), undefined);
  assert.equal(walk(tree).find(node => node.type === h.components.ReviewPostBody).props.text, reply.text);
  assert.deepEqual(walk(tree).find(node => node.type === h.components.EvaluationRating).props.tags, reply.tags);
  assert.equal(walk(tree).find(node => node.type === h.components.EvaluationRating).props.score, 8);
  assert.equal(walk(tree).find(node => node.type === h.components.ReviewAccountCard).props.value, reply.account);
  assert.equal(walk(tree).find(node => node.type === h.components.SnapshotCard).props.value, reply.market);
  assert.equal(walk(tree).find(node => node.type === h.components.PublicMedia).props.path, reply.images[0].path);
  assert.equal(walk(tree).find(node => node.type === h.components.PublicMedia).props.userId, 'another-user');
  assert.deepEqual(walk(tree).find(node => node.type === h.components.PublicTradeReferences).props.trades, [trade]);
  assert.ok(button(tree, '$NVDA')); assert.equal(h.requests.length, 0, 'rendering shared data never consults the viewer account or ledger');
  h.unmount();
  tree = h.render(h.components.PublicTradeReferences, { trades: [trade], language: 'zh' });
  assert.match(words(tree), /NVDA.*买入.*123\.45.*7 股/);
  assert.equal(walk(tree).filter(node => node.type === 'button').length, 0, 'shared executions are read-only saved values'); h.unmount();
});

test('comment entry opens the preview reply section immediately and keeps it after detail verification', async () => {
  const h = await harness(); const withReplies = post('log:1', { replies: [{ id: 'reply-1', text: '已公开评价' }] });
  h.feed(); await flush(); h.requests[0].resolve(result([withReplies])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpenComments(withReplies); h.feed(); await flush();
  assert.deepEqual(h.commentScrolls.at(-1), { block: 'start', behavior: 'auto' });
  h.requests[1].resolve(withReplies); await flush(); tree = h.feed();
  assert.deepEqual(h.commentScrolls.at(-1), { block: 'start', behavior: 'auto' });
  assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies).props.post, withReplies);
  h.posts(tree)[0].props.onOpenComments(withReplies);
  assert.deepEqual(h.commentScrolls.at(-1), { block: 'start', behavior: 'smooth' });
  assert.equal(h.requests.filter(item => item.kind === 'post').length, 1);
  tree = h.feed({ refreshToken: 1 }); await flush();
  assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies), undefined, 'revoked or rechecking details cannot retain the old reply section');
  h.requests[2].resolve(result([])); h.requests[3].resolve(null); await flush(); tree = h.feed({ refreshToken: 1 });
  assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies), undefined); h.unmount();
});

test('detail notifications carry only the latest verified post without firing on routine rerenders', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(); assert.deepEqual(h.detailNotifications.at(-1), { open: false, post: null });
  h.posts(tree)[0].props.onOpen(post()); h.feed(); await flush();
  assert.deepEqual(h.detailNotifications.at(-1), { open: true, post: null });
  const verified = post('log:1', { text: '已核验正文' }); h.requests[1].resolve(verified); await flush(); h.feed();
  assert.equal(h.detailNotifications.at(-1).post, verified);
  const notices = h.detailNotifications.length; h.feed(); h.feed(); assert.equal(h.detailNotifications.length, notices);
  h.feed({ refreshToken: 1 }); await flush(); assert.deepEqual(h.detailNotifications.at(-1), { open: true, post: null });
  const updated = post('log:1', { text: '核验后的新版本' }); h.requests[2].resolve(result([updated])); h.requests[3].resolve(updated); await flush(); tree = h.feed({ refreshToken: 1 });
  assert.equal(h.detailNotifications.at(-1).post, updated);
  button(tree, '返回公开动态').props.onClick(); h.feed({ refreshToken: 1 });
  assert.deepEqual(h.detailNotifications.at(-1), { open: false, post: null }); h.unmount();
  assert.deepEqual(h.detailNotifications.at(-1), { open: false, post: null });
});

test('public details reuse the safe-area sticky centered header and private body typography', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(post()); tree = h.feed(); await flush();
  const header = walk(tree).find(node => node.type === 'header');
  assert.match(header.props.className, /rj-page-header/);
  assert.equal(words(walk(header).find(node => node.type === 'h1')), '内容详情');
  assert.ok(button(header, '返回公开动态'));
  assert.ok(walk(header).find(node => node.props.className === 'rj-header-spacer'));
  assert.match(journalCss, /\.rj-page-header\{[^}]*safe-area-inset-top[^}]*position:sticky/);
  assert.match(journalCss, /\.rj-page-header\{[^}]*grid-template-columns:44px minmax\(0,1fr\) 44px/);
  assert.doesNotMatch(css, /\.rpf-detail-header\{/);
  h.requests[1].resolve(post()); await flush(); tree = h.feed();
  assert.ok(walk(tree).find(node => node.props.className === 'rj-entry-content'));
  button(tree, '返回公开动态').props.onClick(); tree = h.feed();
  assert.equal(walk(tree).find(node => node.type === 'header'), undefined); h.unmount();
});

test('refresh after editing retains the detail, reads the revision, and clears withdrawn content', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(post()); h.feed(); await flush();
  h.requests[1].resolve(post()); await flush(); tree = h.feed(); assert.equal(h.posts(tree)[0].props.post.text, '公开正文');
  tree = h.feed({ refreshToken: 1 }); await flush();
  assert.equal(h.posts(tree).length, 0, 'stale text hides immediately while the edited detail is rechecked');
  assert.ok(button(tree, '返回公开动态')); assert.equal(h.detailChanges.at(-1), true);
  assert.deepEqual(h.requests[3].args, ['log:1', 'viewer']);
  h.requests[2].resolve(result([post('log:1', { text: '编辑后的公开正文' })]));
  h.requests[3].resolve(post('log:1', { text: '编辑后的公开正文' })); await flush(); tree = h.feed({ refreshToken: 1 });
  assert.equal(h.posts(tree)[0].props.post.text, '编辑后的公开正文');
  h.feed({ refreshToken: 2 }); await flush(); h.requests[5].resolve(null); await flush();
  h.requests[4].resolve(result([post()])); await flush(); tree = h.feed({ refreshToken: 2 });
  assert.match(words(tree), /已不再公开/); assert.equal(h.posts(tree).length, 0);
  button(tree, '返回公开动态').props.onClick(); tree = h.feed({ refreshToken: 2 });
  assert.equal(h.posts(tree).length, 0, 'a delayed list response cannot restore a withdrawn post'); h.unmount();
});

test('browser back and forward restore the public list position and fetch the detail again', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(post()); h.feed(); await flush();
  assert.ok(h.history.state.reviewPublicEntry);
  assert.deepEqual(h.history.state.reviewJournalEntry, { token: 'parent', id: 'root' });
  h.requests[1].resolve(post()); await flush(); h.feed();
  h.history.back(); tree = h.feed();
  assert.equal(button(tree, '返回公开动态'), undefined);
  assert.deepEqual(h.scrolls.at(-1), { top: 420, behavior: 'auto' });
  h.history.forward(); tree = h.feed(); await flush();
  assert.equal(h.posts(tree).length, 1, 'forward navigation can show the current list copy while rechecking');
  assert.equal(h.posts(tree)[0].props.interactionsDisabled, true);
  assert.equal(h.detailNotifications.at(-1).post, null);
  assert.deepEqual(h.requests[2].args, ['log:1', 'viewer']);
  h.requests[2].resolve(post('log:1', { text: '前进时重新读取' })); await flush(); tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.text, '前进时重新读取'); h.unmount();
  assert.equal(h.history.state.reviewPublicEntry, undefined);
  assert.deepEqual(h.history.state.reviewJournalEntry, { token: 'parent', id: 'root' });
  assert.equal(h.history.state.otherAppState, 'retained');
});

test('parent history navigation cannot be scrolled by an inactive public detail', async () => {
  const h = await harness(); h.feed(); await flush();
  h.history.pushState({ reviewJournalEntry: { token: 'parent', id: 'settings' }, otherAppState: 'retained' });
  const scrollCount = h.scrolls.length;
  h.history.back(); h.feed(); h.history.forward(); h.feed();
  assert.equal(h.scrolls.length, scrollCount, 'the parent settings route owns its own scroll restoration');
  assert.equal(h.detailChanges.at(-1), false); h.unmount();
});

test('changing the stock/search scope closes the detail and rejects the earlier history route', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(post()); h.feed(); await flush();
  h.requests[1].resolve(post()); await flush(); h.feed();
  tree = h.feed({ query: 'new filter' }); await flush();
  assert.equal(button(tree, '返回公开动态'), undefined); assert.equal(h.history.state.reviewPublicEntry, undefined);
  h.history.back(); h.feed({ query: 'new filter' }); h.history.forward(); tree = h.feed({ query: 'new filter' }); await flush();
  assert.equal(button(tree, '返回公开动态'), undefined);
  assert.equal(h.requests.filter(item => item.kind === 'post').length, 1); h.unmount();
});

test('public image URLs are decoded before display and revoked on replacement or unmount', async () => {
  const h = await harness();
  const props = { db: h.db, userId: 'viewer', path: 'author/one.webp' };
  h.render(h.components.PublicMedia, props); await flush();
  h.requests[0].resolve(new Blob(['sample'], { type: 'image/webp' })); await flush();
  assert.equal(h.created.length, 1);
  let tree = h.render(h.components.PublicMedia, props);
  assert.notEqual(tree.type, 'img', 'downloaded bytes must be decoded first');
  h.images[0].onload(); await flush(); tree = h.render(h.components.PublicMedia, props);
  assert.equal(tree.props.src, 'blob:public-0');
  h.render(h.components.PublicMedia, { ...props, path: 'author/two.webp' }); await flush();
  assert.deepEqual(h.revoked, ['blob:public-0']);
  h.unmount(); h.requests[1].resolve(new Blob(['late'], { type: 'image/webp' })); await flush();
  assert.equal(h.created.length, 1, 'late data cannot create a URL after leaving the view');
  assert.equal(h.timers.size, 0);
});

test('custom public avatars use a neutral placeholder then reuse the decoded photo across visits', async () => {
  const h = await harness(), props = { db: h.db, userId: 'viewer', path: 'author/one.webp' };
  const author = h.components.PublicAvatar({ post: post('log:1', { author: { avatarKey: 'fox', avatarPath: props.path } }), ...props });
  assert.equal(walk(author).some(node => node.type === 'img'), false, 'custom author never renders their old preset');
  let tree = h.render(h.components.PublicAvatarMedia, props); await flush(); assert.notEqual(tree.type, 'img');
  h.requests[0].resolve(new Blob(['photo'], { type: 'image/webp' })); await flush(); h.images[0].onload(); await flush();
  tree = h.render(h.components.PublicAvatarMedia, props); assert.equal(tree.props.src, 'blob:public-0'); h.unmount();
  tree = h.render(h.components.PublicAvatarMedia, props); assert.equal(tree.props.src, 'blob:public-0', 'warm visit has the real avatar on its first render');
  await flush(); assert.equal(h.requests.length, 1);
  tree = h.render(h.components.PublicAvatarMedia, { ...props, path: 'author/two.webp' }); assert.notEqual(tree.type, 'img', 'changed path never shows old custom avatar'); await flush();
  h.components.reviewPublicAvatarCache.clear(); h.unmount();
  h.requests[1].resolve(new Blob(['late'], { type: 'image/webp' })); await flush();
  assert.equal(h.created.length, 1); assert.deepEqual(h.revoked, ['blob:public-0']);
});

test('a timed-out image decode cannot later restore a revoked image URL', async () => {
  const h = await harness(); const props = { db: h.db, userId: 'viewer', path: 'author/one.webp' };
  h.render(h.components.PublicMedia, props); await flush();
  h.requests[0].resolve(new Blob(['sample'], { type: 'image/webp' })); await flush();
  let decoded; h.images[0].decode = () => new Promise(resolve => { decoded = resolve; });
  h.images[0].onload(); [...h.timers.values()][0](); decoded(); await flush();
  const tree = h.render(h.components.PublicMedia, props);
  assert.notEqual(tree.type, 'img'); assert.match(words(tree), /图片暂不可用/);
  assert.deepEqual(h.revoked, ['blob:public-0']); h.unmount();
});

test('a visible empty public feed discovers another author without remounting or changing its viewer', async () => {
  const h = await harness(); h.feed(); await flush();
  h.requests[0].resolve(result([])); await flush();
  assert.match(words(h.feed()), /还没有公开动态/);
  h.tick(); await flush();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests[1].args, [{ limit: 20, query: '', symbol: '' }, 'viewer']);
  const other = post('log:new', { authorId: 'northstar', text: 'Northstar 报到' });
  h.requests[1].resolve(result([other])); await flush();
  const tree = h.feed();
  assert.equal(h.posts(tree)[0].props.post.authorId, 'northstar');
  assert.doesNotMatch(words(tree), /还没有公开动态/);
  assert.equal(h.scrolls.length, 0, 'background refresh does not move the reading position');
  h.unmount(); assert.equal(h.refreshRef.current, null); assert.equal(h.listenerCount(), 0); assert.equal(h.timers.size, 0);
});

test('manual refresh is shared in flight and awaits both the public list and opened detail', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(post()); h.feed(); await flush(); h.requests[1].resolve(post()); await flush(); h.feed();
  let settled = false;
  const refreshing = h.refreshRef.current(); refreshing.then(() => { settled = true; });
  assert.equal(h.refreshRef.current(), refreshing); await flush();
  assert.equal(h.requests.length, 4);
  assert.equal(h.posts(h.feed())[0].props.post.text, '公开正文', 'revalidation does not flash an empty detail');
  h.requests[2].resolve(result([post('log:1', { text: '更新后的正文' })])); await flush(); assert.equal(settled, false);
  h.requests[3].resolve(post('log:1', { text: '更新后的正文', replies: [{ id: 'reply-new', text: '新评价' }] }));
  await refreshing; tree = h.feed();
  assert.equal(settled, true); assert.equal(h.posts(tree)[0].props.post.text, '更新后的正文');
  assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies).props.post.replies[0].text, '新评价');
  const withdrawn = h.refreshRef.current(); await flush();
  h.requests[5].resolve(null); await flush(); h.requests[4].resolve(result([post()])); await withdrawn;
  tree = h.feed(); assert.match(words(tree), /已不再公开/); assert.equal(h.posts(tree).length, 0);
  button(tree, '返回公开动态').props.onClick(); assert.equal(h.posts(h.feed()).length, 0); h.unmount();
});

test('refresh failure rejects its caller after all reads settle and never reports an empty success', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(post()); h.feed(); await flush(); h.requests[1].resolve(post()); await flush(); h.feed();
  let settled = false;
  const refreshing = h.refreshRef.current(); const checked = assert.rejects(refreshing, /公开列表网络失败/).then(() => { settled = true; });
  await flush(); h.requests[2].reject(new Error('公开列表网络失败')); await flush(); assert.equal(settled, false);
  h.requests[3].resolve(post()); await checked; tree = h.feed();
  button(tree, '返回公开动态').props.onClick(); tree = h.feed();
  assert.match(words(tree), /公开列表网络失败/); assert.doesNotMatch(words(tree), /还没有公开动态/); assert.equal(h.posts(tree).length, 1);
  h.unmount();
});

test('foreground signals coalesce while hidden or inactive public views do not poll', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([])); await flush(); h.feed();
  h.advance(2000); h.visibility('hidden'); h.dispatch('focus'); h.dispatch('pageshow'); await flush();
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  h.visibility('visible'); h.dispatch('focus'); h.dispatch('pageshow'); h.dispatch('online'); await flush();
  assert.equal(h.requests.length, 2, 'a resume burst shares one list request');
  h.requests[1].resolve(result([post()])); await flush(); h.feed();
  h.dispatch('focus'); await flush(); assert.equal(h.requests.length, 2, 'settled resume signals within one second are also coalesced');
  h.feed({ active: false }); assert.equal(h.refreshRef.current, null); assert.equal(h.timers.size, 0);
  h.advance(30000); h.dispatch('focus'); h.visibility('hidden'); h.visibility('visible'); await flush(); assert.equal(h.requests.length, 2);
  h.feed({ active: true }); await flush(); assert.equal(h.requests.length, 3);
  h.requests[2].resolve(result([post('log:new')])); await flush(); assert.equal(h.posts(h.feed())[0].props.post.id, 'log:new');
  h.unmount(); h.dispatch('online'); await flush(); assert.equal(h.requests.length, 3); assert.equal(h.timers.size, 0);
});

test('a refresh cannot append an old page or replace an in-flight like with stale server counts', async () => {
  const h = await harness(); h.feed(); await flush();
  const cursor = { recordDate: '2026-11-05', publishedAt: '2026-11-06T12:00:00Z', id: 'log:1' };
  h.requests[0].resolve(result([post()], cursor)); await flush(); let tree = h.feed();
  button(tree, '加载更多').props.onClick();
  h.posts(tree)[0].props.onLike(h.posts(tree)[0].props.post);
  const refreshing = h.refreshRef.current(); await flush();
  h.requests[2].resolve({ postId: 'log:1', liked: true, likeCount: 7 }); await flush();
  h.requests[3].resolve(result([post(), post('log:new')])); await refreshing;
  h.requests[1].resolve(result([post('log:old-page')])); await flush(); tree = h.feed();
  assert.deepEqual(h.posts(tree).map(node => node.props.post.id), ['log:1', 'log:new']);
  assert.equal(h.posts(tree)[0].props.post.likeCount, 7); assert.equal(h.posts(tree)[0].props.post.liked, true);
  assert.equal(button(tree, '加载更多'), undefined); h.unmount();
});

test('a refresh response from a previous viewer or filter cannot enter the replacement scope', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([])); await flush(); h.feed();
  const oldRefresh = h.refreshRef.current(); await flush();
  h.feed({ userId: 'new-viewer', query: 'new' }); await flush();
  h.requests[2].resolve(result([post('log:current')])); await flush();
  h.requests[1].resolve(result([post('log:obsolete')])); await oldRefresh;
  const tree = h.feed({ userId: 'new-viewer', query: 'new' });
  assert.deepEqual(h.posts(tree).map(node => node.props.post.id), ['log:current']);
  h.unmount();
});

const datedPost = index => post(`log:${String(index).padStart(3, '0')}`, { publishedAt: `2026-11-06T12:00:00.${String(index).padStart(6, '0')}Z` });
const datedRange = (high, low) => Array.from({ length: high - low + 1 }, (_, index) => datedPost(high - index));
const cursorFor = value => ({ recordDate: value.date, id: value.id, publishedAt: value.publishedAt });

test('automatic refresh retains a loaded tail and removes only vanished posts inside the refreshed time window', async () => {
  const h = await harness(); h.feed(); await flush();
  h.requests[0].resolve(result(datedRange(60, 41), cursorFor(datedPost(41)))); await flush();
  button(h.feed(), '加载更多').props.onClick();
  const secondPage = datedRange(40, 21); secondPage[0].publishedAt = '2026-11-06T20:00:00.000040+08:00';
  h.requests[1].resolve(result(secondPage, cursorFor(datedPost(21)))); await flush();
  assert.equal(h.posts(h.feed()).length, 40);
  h.tick(); await flush();
  const newest = [datedPost(62), datedPost(61), datedPost(60), ...datedRange(58, 42)];
  h.requests[2].resolve(result(newest, cursorFor(datedPost(42)))); await flush(); let tree = h.feed();
  const ids = h.posts(tree).map(node => node.props.post.id);
  assert.equal(ids.length, 41); assert.equal(ids.includes('log:059'), false); assert.equal(ids.includes('log:040'), true);
  assert.deepEqual(ids.slice(-3), ['log:023', 'log:022', 'log:021']);
  button(tree, '加载更多').props.onClick(); assert.deepEqual(h.requests[3].args[0].cursor, cursorFor(datedPost(21)));
  h.requests[3].resolve(result(datedRange(20, 1))); await flush(); h.feed();
  const manual = h.refreshRef.current(); await flush(); h.requests[4].resolve(result(newest, cursorFor(datedPost(42)))); await manual;
  assert.equal(h.posts(h.feed()).length, 20, 'explicit refresh may restart pagination');
  h.tick(); await flush(); h.requests[5].resolve(result([datedPost(62)])); await flush();
  tree = h.feed(); assert.equal(h.posts(tree).length, 1, 'a complete authoritative result removes all stale tail entries');
  assert.equal(button(tree, '加载更多'), undefined); h.unmount();
});

test('a whole new page keeps previous cards while subsequent pagination fills and sorts the intervening gap', async () => {
  const h = await harness(); h.feed(); await flush();
  h.requests[0].resolve(result(datedRange(40, 21), cursorFor(datedPost(21)))); await flush();
  button(h.feed(), '加载更多').props.onClick(); h.requests[1].resolve(result(datedRange(20, 1))); await flush(); h.feed();
  h.tick(); await flush(); h.requests[2].resolve(result(datedRange(100, 81), cursorFor(datedPost(81)))); await flush();
  let tree = h.feed(); assert.equal(h.posts(tree).length, 60);
  button(tree, '加载更多').props.onClick(); assert.deepEqual(h.requests[3].args[0].cursor, cursorFor(datedPost(81)));
  h.requests[3].resolve(result(datedRange(80, 61), cursorFor(datedPost(61)))); await flush(); tree = h.feed();
  assert.deepEqual(h.posts(tree).map(node => node.props.post.id), [...datedRange(100, 61), ...datedRange(40, 1)].map(item => item.id));
  h.tick(); await flush(); h.requests[4].resolve(result(datedRange(100, 81), cursorFor(datedPost(81)))); await flush();
  button(h.feed(), '加载更多').props.onClick(); assert.deepEqual(h.requests[5].args[0].cursor, cursorFor(datedPost(61)), 'refresh retains the unfinished gap cursor rather than the visible oldest item');
  h.requests[5].resolve(result(datedRange(60, 41), cursorFor(datedPost(41)))); await flush(); tree = h.feed();
  assert.deepEqual(h.posts(tree).map(node => node.props.post.id), datedRange(100, 1).map(item => item.id)); h.unmount();
});

test('a fresh republication restores an earlier withdrawn post and its currently open detail', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  h.posts(h.feed())[0].props.onOpen(post()); h.feed(); await flush(); h.requests[1].resolve(null); await flush();
  assert.match(words(h.feed()), /已不再公开/);
  const refreshed = h.refreshRef.current(); await flush();
  const republished = post('log:1', { publishedAt: '2026-11-08T13:00:00Z', text: '重新公开的正文' });
  h.requests[2].resolve(result([republished])); await flush(); h.requests[3].resolve(republished); await refreshed;
  let tree = h.feed(); assert.equal(h.posts(tree)[0].props.post.text, '重新公开的正文');
  button(tree, '返回公开动态').props.onClick(); tree = h.feed(); assert.equal(h.posts(tree)[0].props.post.text, '重新公开的正文'); h.unmount();
});

test('a second withdrawal during republication recheck defeats a delayed formerly public list result', async () => {
  const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([post()])); await flush();
  h.posts(h.feed())[0].props.onOpen(post()); h.feed(); await flush(); h.requests[1].resolve(null); await flush(); h.feed();
  const refreshed = h.refreshRef.current(); await flush();
  h.requests[3].resolve(null); await flush(); h.requests[2].resolve(result([post()])); await refreshed;
  let tree = h.feed(); assert.match(words(tree), /已不再公开/); assert.equal(h.posts(tree).length, 0);
  button(tree, '返回公开动态').props.onClick(); assert.equal(h.posts(h.feed()).length, 0); h.unmount();
});

test('late refresh failures from an obsolete viewer or unmounted page do not reject the current global refresh flow', async () => {
  for (const leave of ['switch', 'unmount']) {
    const h = await harness(); h.feed(); await flush(); h.requests[0].resolve(result([])); await flush(); h.feed();
    const oldRefresh = h.refreshRef.current(); await flush();
    if (leave === 'switch') {
      h.feed({ userId: 'new-viewer' }); await flush(); h.requests[2].resolve(result([post('log:new')])); await flush();
    } else h.unmount();
    h.requests[1].reject(new Error('obsolete user failure')); await assert.doesNotReject(oldRefresh);
    if (leave === 'switch') { const tree = h.feed({ userId: 'new-viewer' }); assert.doesNotMatch(words(tree), /obsolete user failure/); h.unmount(); }
  }
});

test('every signed-in visitor can open the shared review composer while owner reviews keep their source path', async () => {
  const h = await harness(), own = [], community = [];
  const publicPost = post('log:1', { replies: [{ id: 'self-review' }], commentCount: 4 });
  const props = { post: publicPost, db: h.db, userId: 'viewer', language: 'zh', onEvaluateOwnEntry: (...args) => own.push(args), onEvaluateCommunityEntry: value => community.push(value) };
  let tree = h.render(h.components.PublicReplies, props);
  assert.match(words(tree), /评论 · 4/); button(tree, '写评价').props.onClick();
  assert.deepEqual(community, [publicPost]); assert.equal(own.length, 0);
  const list = walk(tree).find(node => node.type === h.components.ReviewCommunityEvaluations);
  assert.equal(list.props.postId, publicPost.id); assert.equal(list.props.userId, 'viewer');
  tree = h.render(h.components.PublicReplies, { ...props, userId: 'author' }); button(tree, '写评价').props.onClick();
  assert.deepEqual(own, [['log', '1']]); assert.equal(community.length, 1);
  tree = h.render(h.components.PublicPost, { ...props, onSelectSymbol() {}, onOpenComments() {} });
  assert.equal(words(button(tree, '查看评论')), '4', 'list count includes source reviews and community reviews'); h.unmount();
});

const communityReply = (id = 'evaluation-1', extra = {}) => ({ id, postId: 'log:1', authorId: 'other-reviewer', author: { nickname: '另一位评价者', avatarKey: 'panda', avatarPath: null }, revision: 3, date: '2026-11-08', createdAt: '2026-11-08T08:00:00Z', updatedAt: '2026-11-08T08:00:00Z', text: '其他用户的评价', score: 9, tags: ['按计划执行'], images: [], trades: [], stocks: [], ...extra });

test('public author and community comments use creation instants rather than submitted calendar dates', async () => {
  const author = { id: 'self-review', date: '2026-11-07', createdAt: '2026-11-08T06:00:00Z', text: 'self review' };
  const h = await harness();
  const tree = h.render(h.components.PublicReplies, { post: post('log:1', { replies: [author] }), db: h.db, userId: 'author', language: 'zh' });
  const timestamp = walk(tree).find(node => node.type === h.components.ReviewActivityTime);
  assert.equal(timestamp.props.createdAt, author.createdAt);
  assert.equal(timestamp.props.date, author.date);
  h.unmount();
  const c = await harness(), reply = communityReply('reply', { date: '2026-11-07', updatedAt: '2026-11-09T06:00:00Z' });
  const props = { postId: 'log:1', db: c.db, userId: 'viewer' };
  c.render(c.components.ReviewCommunityEvaluations, props); await flush();
  c.requests[0].resolve(communityPage([reply])); await flush();
  const displayed = walk(c.render(c.components.ReviewCommunityEvaluations, props)).find(node => node.type === c.components.ReviewActivityTime);
  assert.equal(displayed.props.createdAt, reply.createdAt);
  assert.notEqual(displayed.props.createdAt, reply.updatedAt, 'editing must not restart relative time');
  c.unmount();
});
const communityPage = (evaluations, totalCount = evaluations.length, nextCursor = null) => ({ evaluations, totalCount, hasMore: Boolean(nextCursor), nextCursor });

test('community rows use reviewer identities, display saved attachments, and expose actions only on the viewer own reviews', async () => {
  const h = await harness(), actions = [], counts = [];
  const mine = communityReply('mine', { authorId: 'viewer', author: { nickname: '我的评价身份', avatarKey: 'fox' }, images: [{ path: 'viewer/evaluation.webp' }], account: { id: 'viewer-account' }, market: { id: 'frozen-market' }, trades: [{ id: 'trade', symbol: 'NVDA', date: '2026-11-07', side: 'buy', shares: 1, price: 100 }] });
  const props = { postId: 'log:1', db: h.db, userId: 'viewer', language: 'zh', onManageReply: value => actions.push(value), onCountChange: (...args) => counts.push(args) };
  h.render(h.components.ReviewCommunityEvaluations, props); await flush();
  assert.deepEqual(h.requests[0].args, [{ postId: 'log:1', limit: 20, cursor: null }, 'viewer']);
  h.requests[0].resolve(communityPage([communityReply(), mine])); await flush(); const tree = h.render(h.components.ReviewCommunityEvaluations, props);
  assert.match(words(tree), /另一位评价者/); assert.match(words(tree), /我的评价身份/); assert.doesNotMatch(words(tree), /公开作者/);
  const menus = walk(tree).filter(node => node.type === 'button' && node.props['aria-label'] === '评论操作'); assert.equal(menus.length, 1); menus[0].props.onClick(); assert.equal(actions[0], mine);
  assert.deepEqual(counts, [['log:1', 2]]);
  assert.equal(walk(tree).find(node => node.type === h.components.ReviewAccountCard).props.value.id, 'viewer-account');
  assert.equal(walk(tree).find(node => node.type === h.components.PublicTradeReferences).props.trades[0].id, 'trade');
  assert.equal(walk(tree).find(node => node.type === h.components.PublicMedia).props.userId, 'viewer'); h.unmount();
});

test('community review paging is bounded and late responses cannot leak into another account or post', async () => {
  const h = await harness(), props = { postId: 'log:1', db: h.db, userId: 'viewer' };
  h.render(h.components.ReviewCommunityEvaluations, props); await flush();
  const cursor = { createdAt: '2026-11-08T08:00:00Z', id: 'evaluation-1' };
  h.requests[0].resolve(communityPage([communityReply()], 3, cursor)); await flush(); let tree = h.render(h.components.ReviewCommunityEvaluations, props);
  button(tree, '更多评论').props.onClick(); button(tree, '更多评论').props.onClick(); assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests[1].args[0].cursor, cursor);
  tree = h.render(h.components.ReviewCommunityEvaluations, { ...props, userId: 'new-viewer', postId: 'log:2' }); await flush();
  h.requests[2].resolve(communityPage([])); await flush(); h.requests[1].resolve(communityPage([communityReply('late')])); await flush();
  tree = h.render(h.components.ReviewCommunityEvaluations, { ...props, userId: 'new-viewer', postId: 'log:2' });
  assert.doesNotMatch(words(tree), /另一位评价者/); assert.equal(button(tree, '更多评论'), undefined); h.unmount();
});

test('revoked community review reads clear formerly visible content and offer a retry', async () => {
  const h = await harness(), props = { postId: 'log:1', db: h.db, userId: 'viewer' };
  h.render(h.components.ReviewCommunityEvaluations, props); await flush(); h.requests[0].resolve(communityPage([communityReply()])); await flush();
  assert.match(words(h.render(h.components.ReviewCommunityEvaluations, props)), /另一位评价者/);
  h.render(h.components.ReviewCommunityEvaluations, { ...props, refreshToken: 1 }); await flush(); h.requests[1].reject(new Error('这条博文已不再公开')); await flush();
  const tree = h.render(h.components.ReviewCommunityEvaluations, { ...props, refreshToken: 1 });
  assert.doesNotMatch(words(tree), /另一位评价者/); assert.match(words(tree), /已不再公开/); assert.ok(button(tree, '重新读取')); h.unmount();
});

test('unchanged community refresh retains loaded pages but a changed post token discards stale deleted tails', async () => {
  const h = await harness(), props = { postId: 'log:1', db: h.db, userId: 'viewer', refreshToken: 'first' };
  const row = index => communityReply(`reply-${String(index).padStart(3,'0')}`, { createdAt: `2026-11-08T08:00:00.${String(index).padStart(6,'0')}Z`, text: `评论 ${index}` });
  const rows = (high, low) => Array.from({length:high-low+1},(_,index)=>row(high-index));
  const cursor = index => ({id:row(index).id,createdAt:row(index).createdAt});
  h.render(h.components.ReviewCommunityEvaluations,props); await flush(); h.requests[0].resolve(communityPage(rows(40,21),40,cursor(21))); await flush();
  let tree=h.render(h.components.ReviewCommunityEvaluations,props); button(tree,'更多评论').props.onClick(); h.requests[1].resolve(communityPage(rows(20,1),40)); await flush();
  tree=h.render(h.components.ReviewCommunityEvaluations,props); assert.equal(walk(tree).filter(node=>node.props['data-rj-reply-id']).length,40);
  h.render(h.components.ReviewCommunityEvaluations,{...props}); await flush(); assert.equal(h.requests.length,2,'an unchanged updatedAt/count token must not refetch or discard pagination');
  const deleted=rows(20,1).find(reply=>reply.id==='reply-010');
  h.render(h.components.ReviewCommunityEvaluations,{...props,refreshToken:'remote-delete-updatedAt'}); await flush();
  tree=h.render(h.components.ReviewCommunityEvaluations,{...props,refreshToken:'remote-delete-updatedAt'});
  assert.equal(walk(tree).filter(node=>node.props['data-rj-reply-id']).length,0,'remote deletion invalidates the complete old window before revalidation');
  h.requests[2].resolve(communityPage(rows(40,21),39,cursor(21))); await flush();
  tree=h.render(h.components.ReviewCommunityEvaluations,{...props,refreshToken:'remote-delete-updatedAt'});
  assert.equal(walk(tree).filter(node=>node.props['data-rj-reply-id']).length,20); assert.ok(button(tree,'更多评论'));
  button(tree,'更多评论').props.onClick(); h.requests[3].resolve(communityPage(rows(20,1).filter(reply=>reply.id!==deleted.id),39)); await flush();
  tree=h.render(h.components.ReviewCommunityEvaluations,{...props,refreshToken:'remote-delete-updatedAt'});
  assert.equal(walk(tree).filter(node=>node.props['data-rj-reply-id']).length,39);
  assert.equal(walk(tree).find(node=>node.props['data-rj-reply-id']===deleted.id),undefined);
  h.render(h.components.ReviewCommunityEvaluations,{...props,refreshToken:'all-withdrawn'}); await flush(); h.requests[4].resolve(communityPage([])); await flush();
  tree=h.render(h.components.ReviewCommunityEvaluations,{...props,refreshToken:'all-withdrawn'}); assert.equal(walk(tree).filter(node=>node.props['data-rj-reply-id']).length,0); h.unmount();
});

test('explicit community mutation refresh removes a deleted own tail and invalidates pending pagination', async () => {
  const h=await harness(),props={postId:'log:1',db:h.db,userId:'viewer',refreshToken:0};
  const head=communityReply('head'), mine=communityReply('mine',{authorId:'viewer',text:'本人第二页评价',createdAt:'2026-11-08T07:00:00Z'});
  const cursor={id:head.id,createdAt:head.createdAt},tailCursor={id:mine.id,createdAt:mine.createdAt};
  h.render(h.components.ReviewCommunityEvaluations,props); await flush();h.requests[0].resolve(communityPage([head],3,cursor));await flush();
  let tree=h.render(h.components.ReviewCommunityEvaluations,props);button(tree,'更多评论').props.onClick();h.requests[1].resolve(communityPage([mine],3,tailCursor));await flush();
  tree=h.render(h.components.ReviewCommunityEvaluations,props);assert.ok(walk(tree).find(node=>node.props['data-rj-reply-id']===mine.id));button(tree,'更多评论').props.onClick();
  h.render(h.components.ReviewCommunityEvaluations,{...props,refreshToken:1});await flush();h.requests[3].resolve(communityPage([head],2,cursor));await flush();
  h.requests[2].resolve(communityPage([mine]));await flush();tree=h.render(h.components.ReviewCommunityEvaluations,{...props,refreshToken:1});
  assert.equal(walk(tree).find(node=>node.props['data-rj-reply-id']===mine.id),undefined);assert.equal(walk(tree).filter(node=>node.props['data-rj-reply-id']).length,1);h.unmount();
});

test('community pagination privacy and permission failures clear all previously loaded evaluations', async () => {
  for(const code of ['REVIEW_PUBLIC_NOT_FOUND','REVIEW_PUBLIC_FORBIDDEN']){
    const h=await harness(),props={postId:'log:1',db:h.db,userId:'viewer',showEmpty:true};
    const first=communityReply(),cursor={id:first.id,createdAt:first.createdAt};
    h.render(h.components.ReviewCommunityEvaluations,props);await flush();h.requests[0].resolve(communityPage([first],2,cursor));await flush();
    let tree=h.render(h.components.ReviewCommunityEvaluations,props);button(tree,'更多评论').props.onClick();
    h.requests[1].reject(Object.assign(new Error('这条动态已删除或改为私密。'),{code}));await flush();tree=h.render(h.components.ReviewCommunityEvaluations,props);
    assert.equal(walk(tree).filter(node=>node.props['data-rj-reply-id']).length,0);assert.match(words(tree),/改为私密/);assert.doesNotMatch(words(tree),/还没有评论/);assert.equal(button(tree,'更多评论'),undefined);assert.ok(button(tree,'重新读取'));h.unmount();
  }
});

test('a community read error never claims there are no comments', async () => {
  const h=await harness(), props={postId:'log:1',db:h.db,userId:'viewer',showEmpty:true};
  let tree=h.render(h.components.ReviewCommunityEvaluations,props); assert.doesNotMatch(words(tree),/还没有评论/); await flush();
  h.requests[0].reject(new Error('网络暂不可用')); await flush(); tree=h.render(h.components.ReviewCommunityEvaluations,props);
  assert.match(words(tree),/网络暂不可用/); assert.doesNotMatch(words(tree),/还没有评论/);
  button(tree,'重新读取').props.onClick(); h.render(h.components.ReviewCommunityEvaluations,props); await flush(); h.requests[1].resolve(communityPage([])); await flush();
  tree=h.render(h.components.ReviewCommunityEvaluations,props); assert.match(words(tree),/还没有评论/); h.unmount();
});

test('public feed paging and background tail merges use record date before the source creation timestamp', async () => {
  const h=await harness();
  const newest=post('log:newest',{date:'2026-11-07',publishedAt:'2026-11-07T01:00:00Z'});
  const first=post('log:first',{date:'2026-11-06',publishedAt:'2026-11-06T01:00:00Z'});
  const lateImport=post('log:import',{date:'2026-10-06',publishedAt:'2026-11-08T01:00:00.123456Z'});
  const older=post('log:older',{date:'2026-10-05',publishedAt:'2026-11-08T01:00:00.123457Z'});
  h.feed();await flush();h.requests[0].resolve(result([first],cursorFor(first)));await flush();
  button(h.feed(),'加载更多').props.onClick();assert.deepEqual(h.requests[1].args[0].cursor,{recordDate:first.date,publishedAt:first.publishedAt,id:first.id});
  h.requests[1].resolve(result([lateImport],cursorFor(lateImport)));await flush();
  assert.deepEqual(h.posts(h.feed()).map(node=>node.props.post.id),[first.id,lateImport.id]);
  h.tick();await flush();h.requests[2].resolve(result([newest,first],cursorFor(first)));await flush();
  let tree=h.feed();assert.deepEqual(h.posts(tree).map(node=>node.props.post.id),[newest.id,first.id,lateImport.id]);
  button(tree,'加载更多').props.onClick();assert.deepEqual(h.requests[3].args[0].cursor,cursorFor(lateImport));
  h.requests[3].resolve(result([older]));await flush();assert.deepEqual(h.posts(h.feed()).map(node=>node.props.post.id),[newest.id,first.id,lateImport.id,older.id]);h.unmount();
});

test('author self-evaluations and community evaluations both expose separate flat reply actions', async () => {
  const h=await harness(),calls=[];
  const original={id:'legacy-author-review',date:'2026-11-06',text:'作者自己的评价',score:8,images:[],stocks:[],tags:[],trades:[]};
  const item=post('log:1',{replies:[original]});
  let tree=h.render(h.components.PublicReplies,{post:item,db:h.db,userId:'author',language:'zh',onReplyToReview:(...args)=>calls.push(args)});
  const authorTarget={kind:'author',id:original.id,authorId:item.authorId,nickname:item.author.nickname,available:true};
  button(tree,'公开作者').props.onClick();assert.deepEqual(calls.at(-1),[item,authorTarget]);
  button(tree,'回复').props.onClick();assert.deepEqual(calls.at(-1),[item,authorTarget]);
  walk(tree).find(node=>node.type===h.components.ReplyBody).props.onReply();assert.deepEqual(calls.at(-1),[item,authorTarget]);
  const community=walk(tree).find(node=>node.type===h.components.ReviewCommunityEvaluations),reply=communityReply();
  community.props.onReply(reply);assert.deepEqual(calls.at(-1),[item,{kind:'community',id:reply.id,authorId:reply.authorId,nickname:reply.author.nickname,available:true}]);h.unmount();
});

test('flat community replies show only recipient identity and allow replying to an existing reply', async () => {
  const h=await harness(),calls=[];
  const reply=communityReply('reply-to-review',{replyTo:{kind:'author',id:'source',authorId:'author',nickname:'原评论人',available:true}});
  const deleted=communityReply('reply-to-deleted',{replyTo:{kind:'community',id:'deleted',authorId:'former-author',nickname:'已删目标昵称',available:false}});
  const props={postId:'log:1',db:h.db,userId:'viewer',onReply:reply=>calls.push(reply)};
  h.render(h.components.ReviewCommunityEvaluations,props);await flush();h.requests[0].resolve(communityPage([reply,deleted]));await flush();
  const tree=h.render(h.components.ReviewCommunityEvaluations,props);
  assert.match(words(tree),/回复 @原评论人/);assert.match(words(tree),/原评论已删除/);assert.doesNotMatch(words(tree),/已删目标昵称/);
  const row=walk(tree).find(node=>node.props['data-rj-reply-id']===reply.id);
  button(row,'另一位评价者').props.onClick();assert.equal(calls.at(-1),reply);
  button(row,'回复').props.onClick();assert.equal(calls.at(-1),reply);
  walk(row).find(node=>node.type===h.components.ReplyBody).props.onReply();assert.equal(calls.at(-1),reply);h.unmount();
});

test('reply body gestures ignore stock controls and keyboard events from nested controls', async () => {
  const h=await harness();let replies=0,stops=0;
  const tree=h.render(h.components.ReplyBody,{onReply:()=>replies++,children:'评论正文'});
  const bodyTarget={closest:()=>null},control={closest:()=>({})};
  tree.props.onClick({target:control,stopPropagation:()=>stops++});assert.equal(replies,0);
  tree.props.onClick({target:bodyTarget,defaultPrevented:true,stopPropagation:()=>stops++});assert.equal(replies,0);
  tree.props.onClick({target:bodyTarget,stopPropagation:()=>stops++});assert.equal(replies,1);assert.equal(stops,1);
  tree.props.onKeyDown({target:control,currentTarget:bodyTarget,key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(replies,1);
  tree.props.onKeyDown({target:bodyTarget,currentTarget:bodyTarget,key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(replies,2);h.unmount();
});

test('historical scored and tagged replies retain actions without rating summaries while post evaluations keep theirs', async () => {
  const h=await harness(),props={postId:'log:1',db:h.db,userId:'viewer',onManageReply(){},onReply(){}};
  const evaluation=communityReply('normal',{authorId:'viewer',score:8,tags:['按计划执行']});
  const reply=communityReply('response',{authorId:'viewer',score:9,text:'',tags:['自定义'],replyTo:{kind:'community',id:'target',nickname:'访客',available:true}});
  h.render(h.components.ReviewCommunityEvaluations,props);await flush();h.requests[0].resolve(communityPage([evaluation,reply]));await flush();let tree=h.render(h.components.ReviewCommunityEvaluations,props);
  const rows=walk(tree).filter(node=>node.props['data-rj-reply-id']);assert.equal(rows.length,2,'legacy score-only replies remain visible');
  const summaries=rows.map(row=>walk(row).find(node=>node.type===h.components.EvaluationRating));assert.equal(summaries[0].props.score,8);assert.deepEqual(summaries[0].props.tags,['按计划执行']);assert.equal(summaries[1],undefined);
  assert.ok(button(rows[1],'评论操作'));assert.ok(button(rows[1],'回复'));assert.match(words(rows[1]),/回复 @访客/);h.unmount();
});


test('notification opens a post absent from page one and preserves a comment target', async () => {
  const h=await harness(), openRequest={id:'open-1',userId:'viewer',postId:'log:older',commentId:'target-comment',notificationId:'notification-1'};
  h.feed({openRequest});await flush();h.feed({openRequest});await flush();
  const detail=h.requests.find(row=>row.kind==='post');assert.deepEqual(detail.args,['log:older','viewer']);
  detail.resolve(post('log:older'));await flush();const tree=h.feed({openRequest});
  assert.equal(walk(tree).find(row=>row.type===h.components.PublicReplies).props.notificationTarget,openRequest);
  assert.ok(button(tree,'返回消息'));
  h.feed({openRequest});await flush();assert.equal(h.requests.filter(row=>row.kind==='post').length,1);
  button(tree,'返回消息').props.onClick();h.feed({openRequest});await flush();
  assert.equal(h.requests.filter(row=>row.kind==='post').length,1,'returning must not reopen the consumed request');h.unmount();
});

test('notification target beyond the first comment page is loaded once and removed on withdrawal', async()=>{
  const h=await harness(), notificationTarget={notificationId:'notification-1',commentId:'older'};
  const props={db:h.db,userId:'viewer',postId:'log:1',notificationTarget,refreshToken:0};
  const render=()=>h.render(h.components.ReviewCommunityEvaluations,props);
  render();await flush();
  h.requests.find(row=>row.kind==='community').resolve({evaluations:[],totalCount:21,hasMore:true,nextCursor:{createdAt:'2026-11-08T00:00:00Z',id:'newer'}});
  h.requests.find(row=>row.kind==='target').resolve({notificationId:'notification-1',postId:'log:1',commentId:'older',evaluation:{id:'older',text:'旧评论定位',authorId:'someone',author:{nickname:'甲'},createdAt:'2026-11-01T00:00:00Z'}});
  await flush();let tree=render();assert.equal(walk(tree).filter(row=>row.props['data-rj-reply-id']==='older').length,1);
  props.refreshToken=1;render();await flush();
  h.requests.filter(row=>row.kind==='community').at(-1).resolve({evaluations:[],totalCount:20,hasMore:false,nextCursor:null});
  h.requests.filter(row=>row.kind==='target').at(-1).reject(Object.assign(new Error('评论已不可用'),{code:'REVIEW_NOTIFICATION_NOT_FOUND'}));
  await flush();tree=render();assert.equal(walk(tree).filter(row=>row.props['data-rj-reply-id']==='older').length,0);assert.match(words(tree),/评论已不可用/);h.unmount();
});

test('public All captures its unread boundary before reading and clears only after successful visible list render', async () => {
  const h=await harness(), events=[], token={userId:'viewer',cursor:'14',scope:1};
  let resolveBoundary;
  const unreadController={captureBoundary:()=>{events.push('capture');return new Promise(resolve=>{resolveBoundary=resolve;});},markSeen:value=>{events.push(['seen',value]);return Promise.resolve();}};
  h.feed({unreadController}); await flush(); assert.deepEqual(events,['capture']); assert.equal(h.requests.length,0,'capture precedes the feed snapshot');
  resolveBoundary(token); await flush(); assert.equal(h.requests.length,1); assert.deepEqual(events,['capture']);
  h.requests[0].resolve(result([post()])); await flush(); assert.equal(events.length,1,'request completion alone must not mark a still-unrendered list');
  h.feed({unreadController}); assert.deepEqual(events,['capture',['seen',token]]);
  h.feed({unreadController}); assert.equal(events.length,2,'the same rendered snapshot is acknowledged once'); h.unmount();
});

test('search and failed public feed loads never clear the unread boundary', async () => {
  for(const query of ['NVDA','']){
    const h=await harness(),seen=[];
    const unreadController={captureBoundary:async()=>({userId:'viewer',cursor:'14'}),markSeen:value=>seen.push(value)};
    h.feed({query,unreadController});await flush();
    if(query)h.requests[0].resolve(result([post()]));else h.requests[0].reject(new Error('network unavailable'));
    await flush();h.feed({query,unreadController});assert.equal(seen.length,0);h.unmount();
  }
});

test('public detail forwards only its own saved reply target while retaining a separate notification target', async () => {
  const h = await harness(), item = post(), target = { id: 'saved-request', postId: item.id, commentKind: 'community', commentId: 'saved-reply' };
  const changes = [], options = { replyTarget: target, onDetailChange: (...args) => changes.push(args) };
  h.feed(options); await flush(); h.requests[0].resolve(result([item])); await flush();
  let tree = h.feed(options); h.posts(tree)[0].props.onOpen(item); tree = h.feed(options); await flush();
  let comments = walk(tree).find(node => node.type === h.components.PublicReplies);
  assert.equal(comments.props.replyTarget, target);
  assert.equal(changes.at(-1)[2], item.id, 'route identity is available while the detail is still being verified');
  h.requests.find(request => request.kind === 'post').resolve(item); await flush(); tree = h.feed(options);
  assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies).props.replyTarget, target);
  tree = h.feed({ ...options, replyTarget: { ...target, postId: 'log:another' } });
  assert.equal(walk(tree).find(node => node.type === h.components.PublicReplies).props.replyTarget, null);
  h.unmount();
  const section = await harness(), notificationTarget = { notificationId: 'notification', commentId: 'old-reply' };
  const props = { post: item, db: { ...section.db, fetchReviewCommentThreads() {} }, userId: 'viewer', language: 'zh', replyTarget: target, notificationTarget };
  tree = section.render(section.components.PublicReplies, props);
  comments = walk(tree).find(node => node.type === section.components.ReviewCommentThreads);
  assert.equal(comments.props.replyTarget, target); assert.equal(comments.props.notificationTarget, notificationTarget);
  tree = section.render(section.components.PublicReplies, { ...props, replyTarget: { ...target, postId: 'log:another' } });
  assert.equal(walk(tree).find(node => node.type === section.components.ReviewCommentThreads).props.replyTarget, null);
  section.unmount();
});

test('only verified assistant authors use the shared fox identity in public posts and avatars',async()=>{
 const h=await harness();
 for(const assistant of [true,false]){
  const author={nickname:'Quote',avatarKey:'fox',...(assistant?{isAssistant:true}:{})};
  const tree=h.render(h.components.PublicPost,{post:post('log:quote',{author}),db:h.db,userId:'viewer',language:'zh'});
  const markup=renderToStaticMarkup(tree);
  assert.equal(markup.includes('rj-system-badge'),assistant);
  assert.equal(markup.includes('quote-system-fox.jpg'),assistant);
  if(assistant)assert.match(markup,/Quote<\/strong><span class="rj-system-badge">小助手/);
  else assert.match(markup,/<strong>Quote<\/strong>/);
 }
 assert.equal(h.requests.filter(row=>row.kind==='avatar').length,0,'verified assistant avatar is a bundled asset');h.unmount();
});
