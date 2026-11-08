import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

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
  let historyIndex = 0;
  const requests = [], images = [], created = [], revoked = [], timers = new Map(), detailChanges = [], detailNotifications = [], scrolls = [], commentScrolls = [];
  const request = (kind, args) => new Promise((resolve, reject) => requests.push({ kind, args, resolve, reject }));
  const db = {
    fetchReviewPublicFeed: (...args) => request('feed', args),
    fetchReviewPublicPost: (...args) => request('post', args),
    setReviewPublicLike: (...args) => request('like', args),
    downloadReviewPublicImage: (...args) => request('image', args),
    downloadReviewPublicAvatar: (...args) => request('avatar', args),
  };
  const fixture = {
    useState(initial) { const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (old && deps.every((dep, j) => Object.is(dep, old.deps[j]))) return; old?.cleanup?.(); const slot = { deps }; slots[i] = slot; effects.push(() => { slot.cleanup = effect(); }); },
    window: { scrollY: 420, scrollTo: value => scrolls.push(value), getSelection: () => ({ toString: () => '' }) },
    requestAnimationFrame: fn => fn(), Blob,
    Image: class { constructor() { images.push(this); } decode() { return Promise.resolve(); } },
    URL: { createObjectURL: blob => { const url = `blob:public-${created.length}`; created.push({ blob, url }); return url; }, revokeObjectURL: url => revoked.push(url) },
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
  };
  fixture.window.addEventListener = (type, listener) => { const values = listeners.get(type) || new Set(); values.add(listener); listeners.set(type, values); };
  fixture.window.removeEventListener = (type, listener) => listeners.get(type)?.delete(listener);
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
      import { getCommunityAvatarOption } from ${JSON.stringify(new URL('../src/lib/communityProfile.js', import.meta.url).href)};
      import { normalizeReviewTradeReferences } from ${JSON.stringify(new URL('../src/lib/reviewEvaluationModel.js', import.meta.url).href)};
      const fixture = globalThis[${JSON.stringify(key)}];
      const React = { ...ActualReact, useState: fixture.useState, useRef: fixture.useRef, useEffect: fixture.useEffect };
      const { window, requestAnimationFrame, Blob, Image, URL, setTimeout, clearTimeout } = fixture;
      const ReviewPostBody = props => React.createElement('p', null, props.text);
      const SnapshotCard = () => React.createElement('section', null, '市场快照');
      const EvaluationRating = () => React.createElement('div', null, '评分及标签');
      const ReviewAccountCard = () => React.createElement('section', null, '账户快照');
      ${source.slice(source.indexOf('// Share only in-flight'))}
      export { ScopedPublicFeed, PublicPost, PublicReplies, PublicTradeReferences, PublicMedia, ReviewPostBody, EvaluationRating, ReviewAccountCard, SnapshotCard };
    `, 'ReviewPublicFeedUITest.jsx', { jsx: { runtime: 'classic' } });
    components = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  } finally { delete globalThis[key]; }
  const props = { db, userId: 'viewer', onDetailChange: (value, post) => { detailChanges.push(value); detailNotifications.push({ open: value, post }); } };
  const render = (component, values) => { cursor = 0; effects = []; const tree = component(values); for (const node of walk(tree)) if (node.type === components.PublicReplies) node.props.sectionRef.current = { scrollIntoView: value => commentScrolls.push(value) }; for (const effect of effects) effect(); return tree; };
  return { db, props, components, requests, images, created, revoked, timers, detailChanges, detailNotifications, scrolls, commentScrolls, history: fixture.window.history,
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

test('a public detail fetches fresh data, and withdrawal removes both the detail and stale list item', async () => {
  const h = await harness(); h.feed(); await flush();
  const old = post(); h.requests[0].resolve(result([old])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpen(old); tree = h.feed(); await flush();
  assert.equal(h.posts(tree).length, 0, 'list content must not be used as an authorized detail');
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

test('load more is bounded to one request and merges overlapping pages without duplicate posts', async () => {
  const h = await harness(); h.feed(); await flush();
  const cursor = { publishedAt: '2026-11-06T12:00:00Z', id: 'log:1' };
  h.requests[0].resolve(result([post()], cursor)); await flush();
  let tree = h.feed(); const more = button(tree, '加载更多'); more.props.onClick(); more.props.onClick();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests[1].args[0].cursor, cursor);
  h.requests[1].resolve(result([post(), post('log:2')])); await flush(); tree = h.feed();
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
    if (!full) assert.equal(words(walk(tree).find(node => node.type === 'time')), '11月06日');
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

test('comment entry opens an authenticated detail then scrolls to its public reply section', async () => {
  const h = await harness(); const withReplies = post('log:1', { replies: [{ id: 'reply-1', text: '已公开评价' }] });
  h.feed(); await flush(); h.requests[0].resolve(result([withReplies])); await flush();
  let tree = h.feed(); h.posts(tree)[0].props.onOpenComments(withReplies); h.feed(); await flush();
  assert.equal(h.commentScrolls.length, 0); h.requests[1].resolve(withReplies); await flush(); tree = h.feed();
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
  assert.equal(words(walk(header).find(node => node.type === 'h1')), '复盘记录');
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
  assert.equal(h.posts(tree).length, 0); assert.deepEqual(h.requests[2].args, ['log:1', 'viewer']);
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
