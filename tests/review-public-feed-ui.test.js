import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/ReviewPublicFeed.jsx', import.meta.url), 'utf8');
const walk = value => !React.isValidElement(value) ? Array.isArray(value) ? value.flatMap(walk) : [] : [value, ...walk(value.props.children)];
const words = value => !React.isValidElement(value) ? Array.isArray(value) ? value.map(words).join('') : String(value ?? '') : words(value.props.children);
const button = (tree, name) => walk(tree).find(node => node.type === 'button' && (node.props['aria-label'] === name || words(node) === name));
const flush = () => new Promise(resolve => setImmediate(resolve));
const post = (id = 'log:1', extra = {}) => ({ id, type: 'log', sourceId: id.split(':')[1], authorId: 'author', author: { nickname: '公开作者', avatarKey: 'fox', avatarPath: null }, text: '公开正文', date: '2026-11-05', stocks: ['NVDA'], images: [], market: null, publishedAt: '2026-11-06T12:00:00Z', updatedAt: '2026-11-06T12:00:00Z', likeCount: 0, liked: false, ...extra });
const result = (posts, nextCursor = null) => ({ posts, hasMore: Boolean(nextCursor), nextCursor });
let nextId = 0;

async function harness() {
  let slots = [], cursor = 0, effects = [];
  const requests = [], images = [], created = [], revoked = [], timers = new Map(), detailChanges = [], scrolls = [];
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
  const key = `__publicFeedUI${++nextId}`; globalThis[key] = fixture;
  let components;
  try {
    const compiled = await transformWithOxc(`
      import ActualReact from ${JSON.stringify(import.meta.resolve('react'))};
      import { ArrowLeft, Heart, Loader2, RefreshCw, User, X } from ${JSON.stringify(import.meta.resolve('lucide-react'))};
      import { getCommunityAvatarOption } from ${JSON.stringify(new URL('../src/lib/communityProfile.js', import.meta.url).href)};
      const fixture = globalThis[${JSON.stringify(key)}];
      const React = { ...ActualReact, useState: fixture.useState, useRef: fixture.useRef, useEffect: fixture.useEffect };
      const { window, requestAnimationFrame, Blob, Image, URL, setTimeout, clearTimeout } = fixture;
      const ReviewPostBody = props => React.createElement('p', null, props.text);
      const SnapshotCard = () => React.createElement('section', null, '市场快照');
      ${source.slice(source.indexOf('// Share only in-flight'))}
      export { ScopedPublicFeed, PublicPost, PublicMedia };
    `, 'ReviewPublicFeedUITest.jsx', { jsx: { runtime: 'classic' } });
    components = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  } finally { delete globalThis[key]; }
  const props = { db, userId: 'viewer', onDetailChange: value => detailChanges.push(value) };
  const render = (component, values) => { cursor = 0; effects = []; const tree = component(values); for (const effect of effects) effect(); return tree; };
  return { db, props, components, requests, images, created, revoked, timers, detailChanges, scrolls,
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

test('public post presentation never renders private evaluations or account/trade data', async () => {
  const h = await harness();
  const unsafe = post('log:1', { replies: [{ text: 'PRIVATE_EVALUATION' }], account: { total: 'PRIVATE_ACCOUNT' }, trades: [{ price: 'PRIVATE_EXECUTION' }], text: 'Visible post', market: { public: true } });
  let tree = h.render(h.components.PublicPost, { post: unsafe, full: true, db: h.db, userId: 'viewer', language: 'zh', onOpenOwnEntry() {} });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Visible post/); assert.match(html, /市场快照/);
  assert.doesNotMatch(html, /PRIVATE_|写评价|查看我的记录/);
  h.unmount();
  tree = h.render(h.components.PublicPost, { post: unsafe, full: true, db: h.db, userId: 'author', language: 'zh', onOpenOwnEntry() {} });
  assert.ok(button(tree, '查看我的记录'));
  assert.doesNotMatch(source, /stockTrades|ReviewStockReplay|ReviewEvaluation|ReviewAccountCard|resolveReviewJournalImage/);
  h.unmount();
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
