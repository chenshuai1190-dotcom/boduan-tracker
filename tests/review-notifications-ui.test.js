import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/components/ReviewNotifications.jsx', import.meta.url), 'utf8');
const walk = value => !React.isValidElement(value) ? Array.isArray(value) ? value.flatMap(walk) : [] : [value, ...walk(value.props.children)];
const words = value => !React.isValidElement(value) ? Array.isArray(value) ? value.map(words).join('') : String(value ?? '') : words(value.props.children);
const button = (tree, name) => walk(tree).find(node => node.type === 'button' && (node.props['aria-label'] === name || words(node) === name));
const rows = tree => walk(tree).filter(node => node.type === 'article' && node.props['data-notification-id']);
const rowButton = (tree, id) => rows(tree).find(node => node.props['data-notification-id'] === id)?.props.children;
const managementButton = (h, tree, name) => {
  tree = h.render();
  let found = button(tree, name);
  if (!found) { button(tree, '消息管理').props.onClick(); found = button(h.render(), name); }
  return found;
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const item = (id = 'n1', extra = {}) => ({ id, kind: 'reply', postId: 'post1', commentId: 'comment1', actorId: 'actor1', actor: { nickname: '团团', avatarKey: 'fox', avatarPath: null }, createdAt: '2026-11-08T06:12:00.123456+00:00', readAt: null, score: null, excerpt: '回复正文', postExcerpt: '原帖正文', ...extra });
const result = (notifications, extra = {}) => ({ notifications, hasMore: false, nextCursor: null, unreadCount: notifications.filter(value => !value.readAt).length, ...extra });
const error = code => Object.assign(new Error(code === 'NETWORK' ? '暂时无法读取，请重试。' : '这条内容已不可见。'), { code });
let nextId = 0;

async function harness() {
  let slots = [], cursor = 0, effects = [], now = 10000, nextTimer = 0;
  const requests = [], opened = [], counts = [], timers = new Map(), windowListeners = new Map(), documentListeners = new Map();
  const request = (kind, args) => new Promise((resolve, reject) => requests.push({ kind, args, resolve, reject }));
  const db = {
    fetchReviewNotifications: (...args) => request('list', args),
    markReviewNotificationsRead: (...args) => request('read', args),
    readReviewNotificationTarget: (...args) => request('target', args),
  };
  const listenerAPI = registry => ({
    addEventListener(type, callback) { const set = registry.get(type) || new Set(); set.add(callback); registry.set(type, set); },
    removeEventListener(type, callback) { registry.get(type)?.delete(callback); },
  });
  const fixture = {
    useState(initial) { const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useEffect(effect, deps) { const i = cursor++, previous = slots[i]; if (previous && deps.every((value, j) => Object.is(value, previous.deps[j]))) return; previous?.cleanup?.(); const slot = { deps }; slots[i] = slot; effects.push(() => { slot.cleanup = effect(); }); },
    window: listenerAPI(windowListeners), document: { ...listenerAPI(documentListeners), visibilityState: 'visible' },
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const globalKey = `__reviewNotificationsUI${++nextId}`;
  globalThis[globalKey] = fixture;
  let component;
  try {
    const compiled = await transformWithOxc(`
      import ActualReact from ${JSON.stringify(import.meta.resolve('react'))};
      import { ArrowLeft, Check, CheckCheck, ListChecks, Loader2, MoreHorizontal } from ${JSON.stringify(import.meta.resolve('lucide-react'))};
      const fixture = globalThis[${JSON.stringify(globalKey)}];
      const React = { ...ActualReact, useState: fixture.useState, useRef: fixture.useRef, useEffect: fixture.useEffect };
      const { window, document, Date, setTimeout, clearTimeout } = fixture;
      const PublicAvatar = ({ post }) => React.createElement('img', { alt: post.author.nickname, className: 'rj-avatar' });
      const ReviewActivityTime = ({ createdAt }) => React.createElement('time', { dateTime: createdAt }, '3 分钟前');
      ${source.slice(source.indexOf('const unavailable'))}
    `, 'ReviewNotificationsUITest.jsx', { jsx: { runtime: 'classic' } });
    component = (await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`)).default;
  } finally { delete globalThis[globalKey]; }
  const refreshRef = { current: null };
  let props = { db, userId: 'viewer', onOpen: (...args) => opened.push(args), onUnreadCountChange: value => counts.push(value), refreshRef };
  const render = (overrides = {}) => { props = { ...props, ...overrides }; cursor = 0; effects = []; const tree = component(props); for (const effect of effects) effect(); return tree; };
  return {
    db, requests, opened, counts, refreshRef, timers, render,
    async load(notifications = [item()], extra = {}) { render(); await flush(); requests.at(-1).resolve(result(notifications, extra)); await flush(); return render(); },
    advance(ms) { now += ms; },
    dispatch(type) { for (const callback of windowListeners.get(type) || []) callback({ type }); },
    documentEvent(type, values = {}) { for (const callback of documentListeners.get(type) || []) callback({ type, ...values }); },
    visibility(value) { fixture.document.visibilityState = value; for (const callback of documentListeners.get('visibilitychange') || []) callback(); },
    tick() { const [id, timer] = [...timers.entries()].find(([, value]) => value.delay === 30000) || []; assert.ok(timer, 'one 30-second visible poll exists'); timers.delete(id); now += 30000; timer.callback(); },
    listenerCount() { return [...windowListeners.values(), ...documentListeners.values()].reduce((sum, value) => sum + value.size, 0); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('inbox distinguishes loading, failed request, retry and a successful empty inbox', async () => {
  const h = await harness();
  let tree = h.render();
  assert.match(words(tree), /正在读取消息/); assert.doesNotMatch(words(tree), /暂无消息/);
  await flush();
  assert.deepEqual(h.requests[0].args, [{ limit: 20, cursor: null, filter: 'all' }, 'viewer']);
  h.requests[0].reject(error('NETWORK')); await flush(); tree = h.render();
  assert.match(words(tree), /暂时无法读取/); assert.doesNotMatch(words(tree), /暂无消息/);
  button(tree, '重新读取').props.onClick(); h.render(); await flush();
  h.requests.at(-1).resolve(result([])); await flush(); tree = h.render();
  assert.match(words(tree), /暂无消息/); assert.equal(managementButton(h, tree, '全部已读').props.disabled, true);
  assert.deepEqual(h.counts, [0]); h.unmount();
});

test('all four actions render safely with current actor, relative date and unread markers; no financial snapshots', async () => {
  const h = await harness();
  const tree = await h.load([
    item('reply', { excerpt: '<script>alert(1)</script>', accountSnapshot: { netAssets: 'SECRET_BALANCE' } }),
    item('comment', { kind: 'comment' }), item('rating', { kind: 'rating', score: 8 }), item('like', { kind: 'like', excerpt: '', readAt: '2026-11-08T06:15:00Z' }),
  ]);
  const html = renderToStaticMarkup(tree);
  for (const text of ['回复了你的评论', '评论了你的帖子', '为你的帖子打了 8 分', '赞了你的帖子', '3 分钟前']) assert.ok(html.includes(text));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('SECRET_BALANCE'));
  assert.equal(rows(tree).filter(node => node.props['data-unread']).length, 3);
  assert.equal(rows(tree).length, 4); h.unmount();
});

test('opening checks current permission before marking read, blocks duplicate taps and then routes to exact target', async () => {
  const h = await harness(); let tree = await h.load();
  const pending = rowButton(tree, 'n1').props.onClick(); rowButton(tree, 'n1').props.onClick();
  assert.deepEqual(h.requests.map(value => value.kind), ['list', 'target']); assert.equal(h.opened.length, 0);
  const target = { notificationId: 'n1', postId: 'post1', commentId: 'comment1', evaluation: { id: 'comment1' } };
  h.requests.at(-1).resolve(target); await flush();
  assert.deepEqual(h.requests.at(-1).args, [{ ids: ['n1'] }, 'viewer']); assert.equal(h.opened.length, 0);
  h.requests.at(-1).resolve({ unreadCount: 0 }); await pending;
  tree = h.render(); assert.equal(rows(tree)[0].props['data-unread'], undefined);
  assert.deepEqual(h.opened, [[target, item()]]); assert.deepEqual(h.counts, [1, 0]); h.unmount();
});

test('already read messages still recheck access but do not write read state', async () => {
  const h = await harness(); const tree = await h.load([item('n1', { readAt: '2026-11-08T06:15:00Z' })]);
  const pending = rowButton(tree, 'n1').props.onClick();
  assert.equal(h.opened.length, 0);
  h.requests.at(-1).resolve({ notificationId: 'n1', postId: 'post1', commentId: 'comment1' }); await pending;
  assert.deepEqual(h.requests.map(value => value.kind), ['list', 'target']); assert.equal(h.opened.length, 1); h.unmount();
});

test('read failure keeps message unread and does not route; a later tap can retry', async () => {
  const h = await harness(); let tree = await h.load();
  const pending = rowButton(tree, 'n1').props.onClick(); h.requests.at(-1).resolve({ postId: 'post1' }); await flush();
  h.requests.at(-1).reject(error('NETWORK')); await pending; tree = h.render();
  assert.equal(h.opened.length, 0); assert.equal(rows(tree)[0].props['data-unread'], true); assert.match(words(tree), /暂时无法读取/);
  rowButton(tree, 'n1').props.onClick(); assert.equal(h.requests.at(-1).kind, 'target'); h.unmount();
});

test('all-read submits the visible head exact tuple and preserves server count for newer arrivals', async () => {
  const h = await harness(); let tree = await h.load([item('n2'), item('n1', { createdAt: '2026-11-08T05:00:00Z' })]);
  const pending = managementButton(h, tree, '全部已读').props.onClick(); managementButton(h, tree, '全部已读').props.onClick();
  assert.deepEqual(h.requests.at(-1).args, [{ before: { createdAt: '2026-11-08T06:12:00.123456+00:00', id: 'n2' } }, 'viewer']);
  assert.equal(h.requests.filter(value => value.kind === 'read').length, 1);
  h.requests.at(-1).resolve({ unreadCount: 1 }); await pending; tree = h.render();
  assert.equal(rows(tree).filter(node => node.props['data-unread']).length, 0); assert.deepEqual(h.counts, [2, 1]); h.unmount();
});

test('all-read retains the newest observed boundary when switching to an older rating category', async () => {
  const h = await harness(), like = item('new-like', { kind: 'like' });
  const rating = item('old-rating', { kind: 'rating', score: 8, createdAt: '2026-11-07T04:00:00Z', readAt: '2026-11-07T05:00:00Z' });
  let tree = await h.load([like, rating]);
  button(tree, '评分').props.onClick(); h.render(); await flush();
  h.requests.at(-1).resolve(result([rating], { unreadCount: 1 })); await flush(); tree = h.render();
  assert.equal(managementButton(h, tree, '全部已读').props.disabled, false);
  const pending = managementButton(h, tree, '全部已读').props.onClick();
  assert.deepEqual(h.requests.at(-1).args, [{ before: { createdAt: like.createdAt, id: like.id } }, 'viewer']);
  h.requests.at(-1).resolve({ unreadCount: 0 }); await pending;
  assert.deepEqual(h.counts, [1, 1, 0]); h.unmount();
});

test('observed boundary advances at microsecond and ID precision and also works from an empty category', async () => {
  const h = await harness(), head = item('n1', { createdAt: '2026-11-08T06:12:00.123455Z' });
  let tree = await h.load([head]);
  const newer = item('n2', { createdAt: '2026-11-08T06:12:00.123456Z' });
  const refresh = h.refreshRef.current(); await flush(); h.requests.at(-1).resolve(result([newer])); await refresh; tree = h.render();
  button(tree, '评分').props.onClick(); h.render(); await flush();
  const sameTimeNewerId = item('n3', { kind: 'rating', score: 5, createdAt: '2026-11-08T14:12:00.123456+08:00' });
  h.requests.at(-1).resolve(result([sameTimeNewerId])); await flush(); tree = h.render();
  button(tree, '评论与回复').props.onClick(); h.render(); await flush(); h.requests.at(-1).resolve(result([], { unreadCount: 3 })); await flush(); tree = h.render();
  assert.equal(managementButton(h, tree, '全部已读').props.disabled, false);
  const pending = managementButton(h, tree, '全部已读').props.onClick();
  assert.deepEqual(h.requests.at(-1).args[0], { before: { createdAt: sameTimeNewerId.createdAt, id: sameTimeNewerId.id } });
  h.requests.at(-1).resolve({ unreadCount: 0 }); await pending; h.unmount();
});

test('switching accounts clears the observed boundary before the next account can mark all read', async () => {
  const h = await harness(); await h.load([item('old-account-newer')]);
  h.render({ userId: 'other' }); await flush(); h.requests.at(-1).resolve(result([], { unreadCount: 2 })); await flush();
  let tree = h.render(); assert.equal(managementButton(h, tree, '全部已读').props.disabled, true);
  const other = item('other-account', { createdAt: '2026-11-01T01:00:00Z' });
  const refresh = h.refreshRef.current(); await flush(); h.requests.at(-1).resolve(result([other])); await refresh; tree = h.render();
  const pending = managementButton(h, tree, '全部已读').props.onClick();
  assert.deepEqual(h.requests.at(-1).args, [{ before: { createdAt: other.createdAt, id: other.id } }, 'other']);
  h.requests.at(-1).resolve({ unreadCount: 0 }); await pending; h.unmount();
});

test('filter changes request their own category and ignore old first page content/count', async () => {
  const h = await harness(); let tree = h.render(); await flush(); const previous = h.requests[0];
  button(tree, '评论与回复').props.onClick(); tree = h.render(); await flush();
  assert.deepEqual(h.requests.at(-1).args[0], { limit: 20, cursor: null, filter: 'comments' });
  previous.resolve(result([item('old')])); await flush(); tree = h.render();
  assert.equal(rows(tree).length, 0); assert.deepEqual(h.counts, []);
  h.requests.at(-1).resolve(result([item('new')])); await flush(); tree = h.render();
  assert.deepEqual(rows(tree).map(node => node.props['data-notification-id']), ['new']);
  button(tree, '点赞').props.onClick(); h.render(); await flush(); assert.equal(h.requests.at(-1).args[0].filter, 'likes');
  button(h.render(), '评分').props.onClick(); h.render(); await flush(); assert.equal(h.requests.at(-1).args[0].filter, 'ratings'); h.unmount();
});

test('account switch immediately hides previous inbox and suppresses its delayed click response', async () => {
  const h = await harness(); const tree = await h.load(); const pending = rowButton(tree, 'n1').props.onClick(); const targetRequest = h.requests.at(-1);
  const other = h.render({ userId: 'other' }); assert.equal(rows(other).length, 0); await flush();
  targetRequest.resolve({ postId: 'post1' }); await pending;
  assert.equal(h.opened.length, 0); assert.equal(h.requests.filter(value => value.kind === 'read').length, 0);
  assert.deepEqual(h.counts, [1]); assert.equal(h.requests.at(-1).args[1], 'other'); h.unmount();
});

test('filter switch while read is pending suppresses old navigation and old unread count', async () => {
  const h = await harness(); let tree = await h.load(); const pending = rowButton(tree, 'n1').props.onClick();
  h.requests.at(-1).resolve({ postId: 'post1' }); await flush(); const read = h.requests.at(-1);
  button(tree, '点赞').props.onClick(); h.render(); await flush();
  read.resolve({ unreadCount: 0 }); await pending; assert.deepEqual(h.counts, [1]); assert.equal(h.opened.length, 0); h.unmount();
});

for (const code of ['REVIEW_NOTIFICATION_NOT_FOUND', 'REVIEW_NOTIFICATION_FORBIDDEN']) test(`${code} clears withdrawn content and fetches a fresh inbox`, async () => {
  const h = await harness(); let tree = await h.load(); const pending = rowButton(tree, 'n1').props.onClick();
  h.requests.at(-1).reject(error(code)); await pending; tree = h.render();
  assert.equal(rows(tree).length, 0); assert.doesNotMatch(words(tree), /原帖正文/); assert.equal(h.opened.length, 0); await flush();
  assert.equal(h.requests.at(-1).kind, 'list'); h.requests.at(-1).resolve(result([])); await flush(); tree = h.render();
  assert.match(words(tree), /暂无消息/); assert.deepEqual(h.counts, [1, 0]); h.unmount();
});

for (const code of ['REVIEW_AUTH_REQUIRED', 'REVIEW_ACCOUNT_CHANGED']) test(`${code} clears old body without redirecting or treating it as an empty inbox`, async () => {
  const h = await harness(); let tree = await h.load(); const pending = rowButton(tree, 'n1').props.onClick();
  h.requests.at(-1).reject(error(code)); await pending; tree = h.render();
  assert.equal(rows(tree).length, 0); assert.doesNotMatch(words(tree), /原帖正文|暂无消息/); assert.equal(h.opened.length, 0); h.unmount();
});

test('pagination uses the cursor, deduplicates overlap and permits retry after a transient failure', async () => {
  const h = await harness(); const cursor = { createdAt: '2026-11-08T06:12:00.123456+00:00', id: 'n1' }; let tree = await h.load([item()], { hasMore: true, nextCursor: cursor });
  let pending = button(tree, '更多消息').props.onClick(); button(tree, '更多消息').props.onClick();
  assert.deepEqual(h.requests.at(-1).args, [{ limit: 20, cursor, filter: 'all' }, 'viewer']); assert.equal(h.requests.length, 2);
  h.requests.at(-1).reject(error('NETWORK')); await pending; tree = h.render(); assert.equal(rows(tree).length, 1);
  pending = button(tree, '更多消息').props.onClick(); h.requests.at(-1).resolve(result([item(), item('n0')], { unreadCount: 2 })); await pending;
  tree = h.render(); assert.deepEqual(rows(tree).map(node => node.props['data-notification-id']), ['n1', 'n0']); assert.equal(button(tree, '更多消息'), undefined); h.unmount();
});

test('manual refresh is awaitable and coalesces with visible 30-second polling and resume events', async () => {
  const h = await harness(); await h.load(); assert.equal(h.listenerCount(), 4);
  h.tick(); await flush(); const request = h.requests.at(-1); assert.equal(h.requests.length, 2);
  let completed = false; const pending = h.refreshRef.current().then(() => { completed = true; });
  h.dispatch('focus'); h.dispatch('pageshow'); h.dispatch('online'); await flush();
  assert.equal(h.requests.length, 2); assert.equal(completed, false);
  request.resolve(result([item('new')])); await pending; assert.equal(completed, true);
  assert.deepEqual(rows(h.render()).map(node => node.props['data-notification-id']), ['new']); h.unmount();
  assert.equal(h.listenerCount(), 0); assert.equal(h.timers.size, 0); assert.equal(h.refreshRef.current, null);
});

test('background cancels polling, resume event burst is throttled, and unmount drops pending output', async () => {
  const h = await harness(); await h.load(); h.visibility('hidden'); assert.equal(h.timers.size, 0);
  await h.refreshRef.current(); h.dispatch('online'); await flush(); assert.equal(h.requests.length, 1);
  h.advance(1001); h.visibility('visible'); h.dispatch('focus'); h.dispatch('pageshow'); await flush(); assert.equal(h.requests.length, 2);
  h.requests.at(-1).resolve(result([item('visible')])); await flush();
  h.dispatch('focus'); h.dispatch('online'); await flush(); assert.equal(h.requests.length, 2);
  h.advance(1001); const pending = h.refreshRef.current(); await flush(); const latest = h.requests.at(-1); h.unmount(); latest.resolve(result([item('late')], { unreadCount: 99 })); await pending;
  assert.deepEqual(h.counts, [1, 1]); assert.equal(h.timers.size, 0); assert.equal(h.listenerCount(), 0);
});

test('refresh waits for active mark-read and a stale pre-click refresh cannot restore unread rows', async () => {
  const h = await harness(); let tree = await h.load(); const oldRefresh = h.refreshRef.current(); await flush(); const oldRequest = h.requests.at(-1);
  const opening = rowButton(tree, 'n1').props.onClick(); h.requests.at(-1).resolve({ postId: 'post1' }); await flush(); const mark = h.requests.at(-1);
  const refresh = h.refreshRef.current(); oldRequest.resolve(result([item()], { unreadCount: 20 })); await oldRefresh;
  assert.deepEqual(h.counts, [1]); mark.resolve({ unreadCount: 0 }); await opening; await flush();
  assert.equal(h.requests.at(-1).kind, 'list'); h.requests.at(-1).resolve(result([item('n1', { readAt: '2026-11-08T06:15:00Z' })], { unreadCount: 0 })); await refresh;
  tree = h.render(); assert.equal(rows(tree)[0].props['data-unread'], undefined); assert.deepEqual(h.counts, [1, 0, 0]); h.unmount();
});

test('refresh token discards an old pagination response and reloads the first page', async () => {
  const h = await harness(); let tree = await h.load([item()], { hasMore: true, nextCursor: { createdAt: item().createdAt, id: 'n1' } });
  const more = button(tree, '更多消息').props.onClick(); const oldPage = h.requests.at(-1);
  h.render({ refreshToken: 1 }); await flush(); const fresh = h.requests.at(-1);
  oldPage.resolve(result([item('stale')], { unreadCount: 30 })); await more; assert.deepEqual(h.counts, [1]);
  fresh.resolve(result([item('fresh')])); await flush(); tree = h.render(); assert.deepEqual(rows(tree).map(node => node.props['data-notification-id']), ['fresh']); h.unmount();
});

test('batch mode selects explicit unread IDs without opening a target and updates only successful selected messages', async () => {
  const h = await harness();
  const ids = [1, 2, 3, 4].map(value => `20000000-0000-4000-8000-${String(value).padStart(12, '0')}`);
  let tree = await h.load(ids.map((id, index) => item(id, index === 3 ? { readAt: '2026-11-08T06:13:00Z' } : {})));
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render();
  assert.equal(button(tree, '标记已读（0）').props.disabled, true);
  rowButton(tree, ids[0]).props.onClick(); tree = h.render(); rowButton(tree, ids[2]).props.onClick(); tree = h.render();
  assert.equal(rowButton(tree, ids[0]).props['aria-pressed'], true); assert.equal(rowButton(tree, ids[1]).props['aria-pressed'], false);
  assert.equal(rowButton(tree, ids[3]).props.disabled, true); rowButton(tree, ids[3]).props.onClick();
  assert.deepEqual(h.requests.map(request => request.kind), ['list']); assert.equal(h.opened.length, 0);
  const pending = button(tree, '标记已读（2）').props.onClick(); button(tree, '标记已读（2）').props.onClick();
  assert.deepEqual(h.requests.at(-1).args, [{ ids: [ids[0], ids[2]] }, 'viewer']); assert.equal(h.requests.filter(request => request.kind === 'read').length, 1);
  h.requests.at(-1).resolve({ unreadCount: 1 }); await pending; tree = h.render();
  assert.equal(button(tree, '取消'), undefined); assert.ok(managementButton(h, tree, '批量已读'));
  assert.deepEqual(rows(tree).filter(row => row.props['data-unread']).map(row => row.props['data-notification-id']), [ids[1]]);
  assert.equal(h.counts.at(-1), 1); assert.equal(h.opened.length, 0); h.unmount();
});

test('select-all includes loaded unread only, supports deselection and cancel restores normal navigation', async () => {
  const h = await harness(); let tree = await h.load([item('a'), item('b'), item('read', { readAt: '2026-11-08T06:13:00Z' })]);
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render(); button(tree, '全选已加载未读').props.onClick(); tree = h.render();
  assert.ok(button(tree, '标记已读（2）')); assert.equal(rowButton(tree, 'read').props['aria-pressed'], false);
  button(tree, '取消全选').props.onClick(); tree = h.render(); assert.equal(button(tree, '标记已读（0）').props.disabled, true);
  button(tree, '取消').props.onClick(); tree = h.render(); assert.equal(rowButton(tree, 'a').props['aria-pressed'], undefined);
  rowButton(tree, 'a').props.onClick(); assert.equal(h.requests.at(-1).kind, 'target'); h.unmount();
});

test('failed batch-read keeps selections and unread state for an explicit retry', async () => {
  const h = await harness(); let tree = await h.load([item('a'), item('b')]);
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render(); button(tree, '全选已加载未读').props.onClick(); tree = h.render();
  const pending = button(tree, '标记已读（2）').props.onClick(); h.requests.at(-1).reject(error('NETWORK')); await pending; tree = h.render();
  assert.match(words(tree), /暂时无法读取/); assert.equal(rows(tree).filter(row => row.props['data-unread']).length, 2);
  assert.ok(button(tree, '标记已读（2）')); assert.deepEqual(h.counts, [2]);
  const retry = button(tree, '标记已读（2）').props.onClick(); assert.deepEqual(h.requests.at(-1).args[0], { ids: ['a', 'b'] });
  h.requests.at(-1).resolve({ unreadCount: 0 }); await retry; tree = h.render();
  assert.equal(rows(tree).filter(row => row.props['data-unread']).length, 0); assert.equal(managementButton(h, tree, '批量已读').props.disabled, true); h.unmount();
});

for (const change of ['account', 'filter']) test(`switching ${change} resets batch selection and ignores a delayed read response`, async () => {
  const h = await harness(); let tree = await h.load([item('selected')]);
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render(); button(tree, '全选已加载未读').props.onClick(); tree = h.render();
  const pending = button(tree, '标记已读（1）').props.onClick(), oldRead = h.requests.at(-1);
  if (change === 'filter') { button(tree, '点赞').props.onClick(); tree = h.render(); }
  else tree = h.render({ userId: 'other' });
  assert.equal(button(tree, '取消'), undefined); await flush();
  h.requests.at(-1).resolve(result([item('new-view', { kind: 'like' })], { unreadCount: 8 })); await flush();
  oldRead.resolve({ unreadCount: 0 }); await pending; tree = h.render();
  assert.deepEqual(h.counts, [1, 8]); assert.equal(rows(tree)[0].props['data-unread'], true); assert.equal(h.opened.length, 0);
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render(); assert.ok(button(tree, '标记已读（0）')); h.unmount();
});

test('selecting over 100 loaded messages uses bounded chunks and preserves only the failed remainder', async () => {
  const h = await harness(), values = Array.from({ length: 102 }, (_, index) => item(`batch-${String(index).padStart(3, '0')}`));
  const cursorFor = index => ({ createdAt: values[index].createdAt, id: values[index].id });
  let tree = await h.load(values.slice(0, 20), { hasMore: true, nextCursor: cursorFor(19), unreadCount: 102 });
  for (let index = 20; index < values.length; index += 20) {
    const page = values.slice(index, index + 20), end = index + page.length;
    const pending = button(tree, '更多消息').props.onClick();
    h.requests.at(-1).resolve(result(page, { hasMore: end < values.length, nextCursor: end < values.length ? cursorFor(end - 1) : null, unreadCount: 102 }));
    await pending; tree = h.render();
  }
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render(); button(tree, '全选已加载未读').props.onClick(); tree = h.render();
  const pending = button(tree, '标记已读（102）').props.onClick(); assert.equal(h.requests.at(-1).args[0].ids.length, 100);
  const readRequests = h.requests.filter(request => request.kind === 'list').length;
  const waitingRefresh = h.refreshRef.current(); h.tick(); h.dispatch('focus'); await waitingRefresh; await flush();
  assert.equal(h.requests.filter(request => request.kind === 'list').length, readRequests);
  h.requests.at(-1).resolve({ unreadCount: 2 }); await flush(); assert.deepEqual(h.requests.at(-1).args[0].ids, values.slice(100).map(row => row.id));
  h.requests.at(-1).reject(error('NETWORK')); await pending; tree = h.render();
  assert.equal(rows(tree).filter(row => row.props['data-unread']).length, 2); assert.ok(button(tree, '标记已读（2）')); assert.equal(h.counts.at(-1), 2);
  await flush(); assert.equal(h.requests.filter(request => request.kind === 'list').length, readRequests);
  const retry = button(tree, '标记已读（2）').props.onClick(); assert.deepEqual(h.requests.at(-1).args[0].ids, values.slice(100).map(row => row.id));
  h.requests.at(-1).resolve({ unreadCount: 0 }); await retry; assert.equal(h.counts.at(-1), 0); h.unmount();
});

test('selection retains later-page rows during focus and interval refresh, then refreshes after cancel', async () => {
  const h = await harness(); let tree = await h.load([item('first')], { hasMore: true, nextCursor: { createdAt: item().createdAt, id: 'first' } });
  const page = button(tree, '更多消息').props.onClick(); h.requests.at(-1).resolve(result([item('later')])); await page; tree = h.render();
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render(); rowButton(tree, 'later').props.onClick(); tree = h.render();
  await h.refreshRef.current(); h.tick(); h.dispatch('focus'); await flush(); tree = h.render();
  assert.equal(h.requests.length, 2); assert.ok(button(tree, '标记已读（1）')); assert.equal(rowButton(tree, 'later').props['aria-pressed'], true);
  button(tree, '取消').props.onClick(); h.render(); await flush(); assert.equal(h.requests.at(-1).kind, 'list'); assert.equal(h.requests.length, 3);
  h.requests.at(-1).resolve(result([item('replacement')])); await flush(); tree = h.render();
  assert.equal(button(tree, '取消'), undefined); assert.equal(rowButton(tree, 'replacement').props['aria-pressed'], undefined); h.unmount();
});

test('existing all-read stays in the management menu after cancelling selection', async () => {
  const h = await harness(); let tree = await h.load([item('a'), item('b')]);
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render(); rowButton(tree, 'a').props.onClick(); tree = h.render();
  assert.equal(button(tree, '消息管理'), undefined); button(tree, '取消').props.onClick(); tree = h.render();
  const pending = managementButton(h, tree, '全部已读').props.onClick(); assert.ok(h.requests.at(-1).args[0].before); assert.equal(h.requests.at(-1).args[0].ids, undefined);
  h.requests.at(-1).resolve({ unreadCount: 0 }); await pending; tree = h.render();
  assert.equal(button(tree, '取消'), undefined); assert.equal(rows(tree).filter(row => row.props['data-unread']).length, 0); h.unmount();
});

test('management actions stay behind the header icon and selection controls appear only in selection mode', async () => {
  const h = await harness(); let tree = await h.load();
  assert.equal(button(tree, '全部已读'), undefined); assert.equal(button(tree, '批量已读'), undefined);
  assert.equal(walk(tree).some(node => node.props.className === 'rni-selection-toolbar'), false);
  button(tree, '消息管理').props.onClick(); tree = h.render(); assert.ok(button(tree, '全部已读')); assert.ok(button(tree, '批量已读'));
  h.documentEvent('keydown', { key: 'Escape' }); tree = h.render(); assert.equal(button(tree, '批量已读'), undefined);
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render();
  assert.ok(button(tree, '取消')); assert.ok(button(tree, '全选已加载未读')); assert.equal(button(tree, '消息管理'), undefined);
  const css = readFileSync(new URL('../src/components/ReviewNotifications.css', import.meta.url), 'utf8');
  assert.match(css, /\.rni-header\{[^}]*height:calc\(58px \+ env\(safe-area-inset-top\)\)/);
  assert.match(css, /\.rni-header\{[^}]*padding:env\(safe-area-inset-top\)/); h.unmount();
});

test('entering selection invalidates a pre-existing refresh instead of losing later choices', async () => {
  const h = await harness(); let tree = await h.load([item('selected')]);
  const refresh = h.refreshRef.current(); await flush(); const oldRequest = h.requests.at(-1);
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render(); rowButton(tree, 'selected').props.onClick(); tree = h.render();
  oldRequest.resolve(result([item('replacement')])); await refresh; tree = h.render();
  assert.ok(button(tree, '标记已读（1）')); assert.equal(rowButton(tree, 'selected').props['aria-pressed'], true);
  assert.equal(rowButton(tree, 'replacement'), undefined); assert.deepEqual(h.counts, [1]); h.unmount();
});

test('account switch during the second batch prevents remaining batches and stale count updates', async () => {
  const h = await harness(), values = Array.from({ length: 201 }, (_, index) => item(`switch-${String(index).padStart(3, '0')}`));
  const pageResult = (from, end) => result(values.slice(from, end), { hasMore: end < values.length, nextCursor: end < values.length ? { createdAt: item().createdAt, id: values[end - 1].id } : null, unreadCount: 201 });
  let tree = await h.load(values.slice(0, 20), { hasMore: true, nextCursor: { createdAt: item().createdAt, id: values[19].id }, unreadCount: 201 });
  for (let from = 20; from < values.length; from += 20) {
    const page = button(tree, '更多消息').props.onClick(); h.requests.at(-1).resolve(pageResult(from, Math.min(from + 20, values.length))); await page; tree = h.render();
  }
  managementButton(h, tree, '批量已读').props.onClick(); tree = h.render(); button(tree, '全选已加载未读').props.onClick(); tree = h.render();
  const marking = button(tree, '标记已读（201）').props.onClick(); h.requests.at(-1).resolve({ unreadCount: 101 }); await flush(); const secondBatch = h.requests.at(-1);
  assert.equal(secondBatch.args[0].ids.length, 100); h.render({ userId: 'other' }); await flush();
  h.requests.at(-1).resolve(result([item('other-user')], { unreadCount: 7 })); await flush();
  secondBatch.resolve({ unreadCount: 1 }); await marking; tree = h.render();
  assert.equal(h.requests.filter(request => request.kind === 'read').length, 2); assert.equal(h.counts.at(-1), 7);
  assert.equal(rows(tree)[0].props['data-unread'], true); assert.equal(button(tree, '取消'), undefined); assert.equal(h.opened.length, 0); h.unmount();
});
