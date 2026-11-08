import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { compareReviewCommentTime, mergeReviewCommentReplies, mergeReviewCommentThreads } from '../src/lib/reviewCommentThreads.js';

const source = readFileSync(new URL('../src/components/ReviewCommentThreads.jsx', import.meta.url), 'utf8');
const walk = value => !React.isValidElement(value) ? Array.isArray(value) ? value.flatMap(walk) : [] : [value, ...walk(value.props.children)];
const words = value => !React.isValidElement(value) ? Array.isArray(value) ? value.map(words).join('') : String(value ?? '') : words(value.props.children);
const button = (tree, name) => walk(tree).find(node => node.type === 'button' && (node.props['aria-label'] === name || words(node) === name));
const rows = tree => walk(tree).filter(node => node.props['data-review-comment-key']);
const flush = () => new Promise(resolve => setImmediate(resolve));
let sequence = 0;
const comment = (id, extra = {}) => ({ id, kind: 'community', source: 'community', authorId: 'author', author: { nickname: '山间慢行' }, createdAt: '2026-11-08T01:00:00.000001Z', date: '2026-11-08', text: `评论 ${id}`, score: 8, tags: [], likeCount: 12, liked: false, deleted: false, replyTo: null, directReplyCount: 0, ...extra });
const roots = (threads = [], extra = {}) => ({ threads, totalCount: threads.length, communityCount: threads.length, hasMore: false, nextCursor: null, ...extra });
const replies = (values = [], extra = {}) => ({ replies: values, replyCount: values.length, hasMore: false, nextCursor: null, ...extra });
const cursorFor = row => ({ createdAt: row.createdAt, id: row.id, kind: row.kind });

async function harness(initial = {}) {
  let cursor = 0, effects = []; const slots = [], requests = [], counts = [], repliesTo = [], managed = [], scrolled = [];
  const request = (kind, args) => new Promise((resolve, reject) => requests.push({ kind, args, resolve, reject }));
  const db = { fetchReviewCommentThreads: (...args) => request('roots', args), fetchReviewCommentThreadReplies: (...args) => request('children', args),
    setReviewEvaluationLike: (...args) => request('like', args), readReviewNotificationTarget: (...args) => request('notification', args) };
  const fixture = {
    useState(initial) { const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (old && deps.length === old.deps.length && deps.every((value, j) => Object.is(value, old.deps[j]))) return; old?.cleanup?.(); const slot = { deps }; slots[i] = slot; effects.push(() => { slot.cleanup = effect(); }); },
    requestAnimationFrame: fn => fn(),
  };
  const key = `__threadUI${++sequence}`; globalThis[key] = fixture;
  let component;
  try {
    const transformed = await transformWithOxc(`
      import ActualReact from ${JSON.stringify(import.meta.resolve('react'))};
      import { ChevronDown, Heart, Loader2, MessageCircle, MoreHorizontal } from ${JSON.stringify(import.meta.resolve('lucide-react'))};
      import { mergeReviewCommentReplies, mergeReviewCommentThreads, reviewCommentAccessRevoked, reviewCommentKey, reviewCommentTarget } from ${JSON.stringify(new URL('../src/lib/reviewCommentThreads.js', import.meta.url).href)};
      const fixture = globalThis[${JSON.stringify(key)}];
      const React = { ...ActualReact, useState: fixture.useState, useRef: fixture.useRef, useEffect: fixture.useEffect };
      const { requestAnimationFrame } = fixture;
      const ReviewActivityTime = props => React.createElement('time', {dateTime:props.createdAt}, props.date);
      ${source.slice(source.indexOf('const empty'))}
    `, 'ReviewCommentThreadUITest.jsx', { jsx: { runtime: 'classic' } });
    component = (await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`)).default;
  } finally { delete globalThis[key]; }
  let props = { db, postId: 'log:1', userId: 'viewer', onCountChange: (...args) => counts.push(args), onReply: row => repliesTo.push(row), onManageReply: row => managed.push(row),
    renderAvatar: row => React.createElement('img', {alt:row.author.nickname}), renderContent: row => React.createElement('p', null, row.text), ...initial };
  const render = (patch = {}) => {
    props = { ...props, ...patch }; cursor = 0; effects = []; const tree = component(props);
    const rendered = rows(tree);
    if (tree.ref) tree.ref.current = { querySelectorAll: () => rendered.map(row => ({ dataset: { reviewCommentKey: row.props['data-review-comment-key'] }, isConnected: true,
      scrollIntoView: () => scrolled.push(row.props['data-review-comment-key']), focus() {} })) };
    effects.forEach(fn => fn()); return tree;
  };
  return { render, requests, counts, repliesTo, managed, scrolled, db,
    async load(result) { render(); await flush(); requests.find(row => row.kind === 'roots').resolve(result); await flush(); return render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('legacy threads without a preview load on demand and retain the first verified reply when collapsed', async () => {
  const h = await harness(), root = comment('a'), child = comment('b', { replyTo: {kind:'community',id:'a',nickname:'山间慢行',available:true}, directReplyCount:1 }), nested = comment('c', { replyTo: {kind:'community',id:'b',nickname:'山间慢行',available:true} });
  let tree = await h.load(roots([{root,replyCount:2}], {totalCount:3,communityCount:3}));
  assert.equal(rows(tree).length,1); assert.equal(h.requests.length,1); assert.ok(button(tree,'查看 2 条回复'));
  assert.ok(button(tree,'回复山间慢行 · 2 条回复')); assert.deepEqual(h.counts,[['log:1',3,3]]);
  button(tree,'查看 2 条回复').props.onClick(); tree=h.render(); await flush();
  assert.deepEqual(h.requests[1].args,[{postId:'log:1',root:{kind:'community',id:'a'},limit:50,cursor:null},'viewer']);
  h.requests[1].resolve(replies([child,nested])); await flush(); tree=h.render();
  assert.equal(rows(tree).length,3); assert.equal(walk(tree).filter(row=>row.props.className==='rct-reply-list').length,1);
  assert.equal(rows(tree).filter(row=>row.props.className.includes('rct-child')).length,2);
  button(rows(tree)[1],'回复山间慢行 · 1 条回复').props.onClick(); assert.equal(h.repliesTo[0].id,'b');
  button(tree,'收起回复').props.onClick(); tree=h.render(); assert.equal(rows(tree).length,2);
  assert.equal(rows(tree)[1].props['data-review-comment-key'],'community:b');
  button(tree,'查看其余 1 条回复').props.onClick(); tree=h.render(); await flush(); assert.equal(h.requests.length,2,'reopening an unchanged thread reuses its verified page'); h.unmount();
});

test('zero replies have no expansion control and one preview reply is visible without another request', async () => {
  for (const count of [0, 1]) {
    const h = await harness(), root = comment('root');
    const previewReply = count ? comment('first', { replyTo: { kind: 'community', id: root.id, nickname: '原作者', available: true } }) : null;
    let tree = await h.load(roots([{ root, replyCount: count, previewReply }], { totalCount: count + 1 }));
    assert.deepEqual(rows(tree).map(row => row.props['data-review-comment-key']), count ? ['community:root', 'community:first'] : ['community:root']);
    assert.equal(walk(tree).filter(row => row.props.className === 'rct-toggle').length, 0);
    assert.doesNotMatch(words(tree), /正在读取回复|查看.*条回复|收起回复/);
    assert.equal(h.requests.length, 1, 'the root response already contains the first valid reply');
    if (count) {
      button(rows(tree)[1], '回复山间慢行 · 0 条回复').props.onClick(); tree = h.render(); await flush();
      assert.equal(h.repliesTo[0].id, 'first');
      assert.equal(h.requests.filter(request => request.kind === 'children').length, 0, 'replying to the only visible child must not issue a redundant page read');
      assert.equal(rows(tree).length, 2);
      assert.doesNotMatch(words(tree), /正在读取回复/);
    }
    h.unmount();
  }
});

test('multiple replies keep their preview during loading, deduplicate paged results and stay at one visual level', async () => {
  const h = await harness(), root = comment('root');
  const first = comment('first', { text: '最早回复预览', createdAt: '2026-11-08T01:01:00Z', replyTo: { kind: 'community', id: root.id, available: true } });
  const second = comment('second', { createdAt: '2026-11-08T01:02:00Z', replyTo: { kind: 'community', id: first.id, available: true } });
  const third = comment('third', { createdAt: '2026-11-08T01:03:00Z', replyTo: { kind: 'community', id: second.id, available: true } });
  let tree = await h.load(roots([{ root, replyCount: 3, previewReply: first }], { totalCount: 4 }));
  assert.equal(rows(tree).length, 2); assert.ok(button(tree, '查看其余 2 条回复'));
  assert.equal(h.requests.length, 1);
  button(tree, '查看其余 2 条回复').props.onClick(); tree = h.render(); await flush();
  assert.equal(rows(tree).length, 2, 'the visible first reply remains while the rest load');
  assert.match(words(tree), /最早回复预览.*正在读取回复/s);
  const page = h.requests.find(request => request.kind === 'children');
  assert.deepEqual(page.args, [{ postId: 'log:1', root: { kind: 'community', id: root.id }, limit: 50, cursor: null }, 'viewer']);
  page.resolve(replies([{ ...first, text: '首屏核验后的最早回复' }, second], { replyCount: 3, hasMore: true, nextCursor: cursorFor(second) }));
  await flush(); tree = h.render();
  assert.deepEqual(rows(tree).map(row => row.props['data-review-comment-key']), ['community:root', 'community:first', 'community:second']);
  assert.doesNotMatch(words(tree), /最早回复预览/);
  button(tree, '收起回复').props.onClick(); tree = h.render();
  assert.equal(rows(tree).length, 2); assert.match(words(tree), /首屏核验后的最早回复/);
  button(tree, '查看其余 2 条回复').props.onClick(); tree = h.render(); await flush();
  assert.equal(h.requests.length, 2, 'reopening uses the authorized page already loaded');
  button(tree, '更多回复').props.onClick(); await flush();
  assert.deepEqual(h.requests.at(-1).args[0].cursor, cursorFor(second));
  h.requests.at(-1).resolve(replies([second, third], { replyCount: 3 })); await flush(); tree = h.render();
  assert.deepEqual(rows(tree).map(row => row.props['data-review-comment-key']), ['community:root', 'community:first', 'community:second', 'community:third']);
  assert.equal(walk(tree).filter(row => row.props.className === 'rct-reply-list').length, 1);
  assert.equal(rows(tree).filter(row => row.props.className.includes('rct-child')).length, 3, 'replies to replies remain a single visual level');
  button(tree, '收起回复').props.onClick(); tree = h.render(); assert.equal(rows(tree).length, 2);
  h.unmount();
});

test('a complete first reply page replaces an edited or deleted list preview rather than reviving it', async () => {
  for (const freshReplies of [[comment('fresh-first'), comment('fresh-second')], []]) {
    const h = await harness();
    let tree = await h.load(roots([{ root: comment('root'), replyCount: 2, previewReply: comment('deleted-preview', { text: '已删除预览正文' }) }]));
    assert.match(words(tree), /已删除预览正文/);
    button(tree, '查看其余 1 条回复').props.onClick(); h.render(); await flush();
    h.requests.find(request => request.kind === 'children').resolve(replies(freshReplies)); await flush(); tree = h.render();
    assert.doesNotMatch(words(tree), /已删除预览正文/);
    assert.equal(rows(tree).length, freshReplies.length + 1);
    if (freshReplies.length) {
      button(tree, '收起回复').props.onClick(); tree = h.render();
      assert.deepEqual(rows(tree).map(row => row.props['data-review-comment-key']), ['community:root', 'community:fresh-first']);
    } else {
      assert.equal(walk(tree).filter(row => row.props.className === 'rct-toggle').length, 0);
    }
    h.unmount();
  }
});

test('reply page network failures keep the first preview and permit retry without parent revocation', async () => {
  const revoked = [], h = await harness({ onAccessRevoked: error => revoked.push(error) });
  let tree = await h.load(roots([{ root: comment('root'), replyCount: 2, previewReply: comment('first') }]));
  button(tree, '查看其余 1 条回复').props.onClick(); h.render(); await flush();
  h.requests.find(request => request.kind === 'children').reject(new Error('回复暂时无法读取')); await flush(); tree = h.render();
  assert.equal(rows(tree).length, 2); assert.match(words(tree), /评论 first.*回复暂时无法读取/s); assert.deepEqual(revoked, []);
  button(tree, '重新读取').props.onClick(); h.render(); await flush();
  h.requests.filter(request => request.kind === 'children').at(-1).resolve(replies([comment('first'), comment('second')])); await flush(); tree = h.render();
  assert.equal(rows(tree).length, 3); assert.doesNotMatch(words(tree), /回复暂时无法读取/); assert.deepEqual(revoked, []);
  h.unmount();
});

test('read-only detail previews load comments immediately but enable mutations only after detail verification', async () => {
  const h = await harness({ interactionsDisabled: true });
  let tree = h.render(); await flush();
  assert.equal(h.requests.length, 1, 'the comments reader starts on mount without a verified parent response');
  assert.deepEqual(h.requests[0].args, [{ postId: 'log:1', limit: 20, cursor: null }, 'viewer']);
  h.requests[0].resolve(roots([{ root: comment('owned', { authorId: 'viewer' }), replyCount: 0 }])); await flush(); tree = h.render();
  assert.equal(rows(tree).length, 1, 'an independently authorized comment read may be displayed');
  for (const name of ['点赞山间慢行的评论 · 12', '回复山间慢行 · 0 条回复', '评论操作', '山间慢行']) {
    const action = button(tree, name);
    assert.ok(!action || action.props.disabled, `${name} cannot write while the parent is a preview`);
  }
  assert.equal(h.requests.length, 1);
  assert.equal(h.repliesTo.length, 0); assert.equal(h.managed.length, 0);
  tree = h.render({ interactionsDisabled: false }); await flush();
  assert.equal(h.requests.length, 1, 'authorizing the same parent does not refetch unchanged comments');
  const like = button(tree, '点赞山间慢行的评论 · 12'); assert.ok(like && !like.props.disabled);
  like.props.onClick(); await flush();
  assert.equal(h.requests.filter(request => request.kind === 'like').length, 1);
  h.unmount();
});

test('a comments permission failure informs the parent once and blocks older reply pages from returning', async () => {
  const revoked = [], h = await harness({ showEmpty: true, onAccessRevoked: error => revoked.push(error) });
  const root = comment('root');
  let tree = await h.load(roots([{ root, replyCount: 2, previewReply: comment('first-preview') }], { hasMore: true, nextCursor: cursorFor(root) }));
  assert.equal(rows(tree).length, 2);
  button(tree, '查看其余 1 条回复').props.onClick(); tree = h.render(); await flush();
  const olderReplies = h.requests.find(request => request.kind === 'children');
  button(tree, '更多评论').props.onClick(); await flush();
  const failure = Object.assign(new Error('父帖已不再可见'), { code: 'REVIEW_INTERACTION_FORBIDDEN' });
  h.requests.filter(request => request.kind === 'roots').at(-1).reject(failure); await flush(); tree = h.render();
  assert.deepEqual(revoked, [failure]);
  assert.equal(rows(tree).length, 0);
  assert.doesNotMatch(words(tree), /还没有评论/);
  olderReplies.resolve(replies([comment('LATE_PRIVATE_REPLY')])); await flush(); tree = h.render();
  assert.equal(rows(tree).length, 0); assert.doesNotMatch(words(tree), /LATE_PRIVATE_REPLY/);
  assert.equal(revoked.length, 1);
  h.unmount();
});

test('a comment network failure remains retryable and does not report parent access revocation', async () => {
  const revoked = [], h = await harness({ showEmpty: true, onAccessRevoked: error => revoked.push(error) });
  h.render(); await flush(); h.requests[0].reject(new Error('评论网络暂时不可用')); await flush();
  let tree = h.render(); assert.deepEqual(revoked, []);
  assert.match(words(tree), /评论网络暂时不可用/); assert.doesNotMatch(words(tree), /还没有评论/);
  button(tree, '重新读取').props.onClick(); h.render(); await flush();
  h.requests.filter(request => request.kind === 'roots').at(-1).resolve(roots([{ root: comment('recovered'), replyCount: 0 }]));
  await flush(); tree = h.render(); assert.equal(rows(tree).length, 1); assert.deepEqual(revoked, []);
  h.unmount();
});

test('a missing notification or located comment invalidates parent content without classifying why access failed', async () => {
  for (const removed of ['notification', 'located-comment']) {
    const revoked = [], h = await harness({ showEmpty: true, notificationTarget: { notificationId: 'notice', commentId: 'removed' },
      onAccessRevoked: error => revoked.push(error) });
    h.render(); await flush();
    const notification = h.requests.find(request => request.kind === 'notification');
    if (removed === 'notification') {
      notification.reject(Object.assign(new Error('此通知对应的评论已删除'), { code: 'REVIEW_NOTIFICATION_NOT_FOUND' }));
    } else {
      notification.resolve({ postId: 'log:1', commentId: 'removed' }); await flush();
      h.requests.find(request => request.kind === 'roots' && request.args[0].locate)
        .reject(Object.assign(new Error('定位的评论已删除'), { code: 'REVIEW_INTERACTION_NOT_FOUND' }));
    }
    h.requests.find(request => request.kind === 'roots' && !request.args[0].locate).resolve(roots([{ root: comment('still-public'), replyCount: 0 }]));
    await flush(); const tree = h.render();
    assert.equal(revoked.length, 1, 'a missing target may also indicate that its parent became private');
    assert.equal(revoked[0].code, removed === 'notification' ? 'REVIEW_NOTIFICATION_NOT_FOUND' : 'REVIEW_INTERACTION_NOT_FOUND');
    assert.match(words(tree), /评论已删除/);
    assert.doesNotMatch(words(tree), /还没有评论|已不再公开|已改为私密/);
    h.unmount();
  }
});

test('a missing parent from the ordinary root-list request does revoke the detail', async () => {
  const revoked = [], h = await harness({ showEmpty: true, onAccessRevoked: error => revoked.push(error) });
  h.render(); await flush();
  const failure = Object.assign(new Error('博文已删除'), { code: 'REVIEW_INTERACTION_NOT_FOUND' });
  h.requests.find(request => request.kind === 'roots').reject(failure); await flush(); const tree = h.render();
  assert.deepEqual(revoked, [failure]); assert.equal(rows(tree).length, 0);
  assert.match(words(tree), /博文已删除/); assert.doesNotMatch(words(tree), /还没有评论/);
  h.unmount();
});

test('ambiguous missing replies and like targets revoke stale parent content and block concurrent root pages', async () => {
  for (const operation of ['children', 'like']) {
    const revoked = [], h = await harness({ showEmpty: true, onAccessRevoked: error => revoked.push(error) });
    const root = comment('root');
    let tree = await h.load(roots([{ root, replyCount: 1 }], { hasMore: true, nextCursor: cursorFor(root) }));
    button(tree, '更多评论').props.onClick(); await flush();
    const oldPage = h.requests.filter(request => request.kind === 'roots').at(-1);
    if (operation === 'children') {
      button(tree, '查看 1 条回复').props.onClick(); tree = h.render(); await flush();
    } else {
      button(tree, '点赞山间慢行的评论 · 12').props.onClick(); await flush();
    }
    const failure = Object.assign(new Error('评论对象不可访问，请重试'), { code: 'REVIEW_INTERACTION_NOT_FOUND' });
    h.requests.find(request => request.kind === operation).reject(failure); await flush(); tree = h.render();
    assert.deepEqual(revoked, [failure], operation);
    assert.equal(rows(tree).length, 0);
    assert.match(words(tree), /评论对象不可访问，请重试/);
    assert.doesNotMatch(words(tree), /已不再公开|已改为私密|还没有评论/);
    oldPage.resolve(roots([{ root: comment('LATE_POSSIBLY_PRIVATE'), replyCount: 0 }])); await flush(); tree = h.render();
    assert.equal(rows(tree).length, 0); assert.doesNotMatch(words(tree), /LATE_POSSIBLY_PRIVATE/);
    h.unmount();
  }
});

test('comment likes serialize taps, confirm server counts and rollback a failed mutation', async () => {
  const h=await harness(); let tree=await h.load(roots([{root:comment('a'),replyCount:0}]));
  button(tree,'点赞山间慢行的评论 · 12').props.onClick(); button(tree,'点赞山间慢行的评论 · 12').props.onClick(); await flush();
  assert.equal(h.requests.filter(row=>row.kind==='like').length,1); tree=h.render(); assert.equal(button(tree,'取消点赞山间慢行的评论 · 13').props.disabled,true);
  h.requests[1].resolve({kind:'community',id:'a',liked:true,likeCount:15}); await flush(); tree=h.render();
  button(tree,'取消点赞山间慢行的评论 · 15').props.onClick(); await flush(); tree=h.render(); assert.ok(button(tree,'点赞山间慢行的评论 · 14'));
  h.requests[2].reject(new Error('点赞保存失败')); await flush(); tree=h.render(); assert.ok(button(tree,'取消点赞山间慢行的评论 · 15')); assert.match(words(tree),/点赞保存失败/); h.unmount();
});

test('new account immediately hides comments and rejects former page and like responses', async () => {
  const h=await harness(); let tree=await h.load(roots([{root:comment('a'),replyCount:2,previewReply:comment('old-account-preview')}],{hasMore:true,nextCursor:cursorFor(comment('a'))}));
  assert.equal(rows(tree).length,2);
  button(tree,'查看其余 1 条回复').props.onClick();h.render();await flush();
  button(tree,'点赞山间慢行的评论 · 12').props.onClick(); button(tree,'更多评论').props.onClick(); await flush();
  tree=h.render({userId:'other',postId:'log:2'}); assert.equal(rows(tree).length,0); await flush();
  h.requests.filter(row=>row.kind==='roots').at(-1).resolve(roots());
  h.requests.find(row=>row.kind==='like').resolve({kind:'community',id:'a',liked:true,likeCount:99});
  h.requests.find(row=>row.kind==='children').resolve(replies([comment('late-old-account-child')]));
  h.requests.filter(row=>row.kind==='roots')[1].resolve(roots([{root:comment('late'),replyCount:0}]));
  await flush(); tree=h.render(); assert.equal(rows(tree).length,0); assert.doesNotMatch(words(tree),/late|99/); h.unmount();
});

test('deleted roots retain their conversation position without like or reply actions', async () => {
  const h=await harness(); let tree=await h.load(roots([{root:comment('removed',{deleted:true,text:'old content'}),replyCount:1}],{totalCount:1}));
  assert.match(words(tree),/原评论已删除/); assert.doesNotMatch(words(tree),/old content/); assert.equal(button(tree,'点赞山间慢行的评论 · 12'),undefined);
  button(tree,'查看 1 条回复').props.onClick(); h.render(); await flush();
  h.requests[1].resolve(replies([comment('b',{replyTo:{kind:'community',id:'removed',available:false,nickname:'old author'}})])); await flush(); tree=h.render();
  assert.equal(rows(tree).length,2); assert.doesNotMatch(words(tree),/@old author/); h.unmount();
});

test('paging permission failures clear all cached roots, children and counts rather than empty success', async () => {
  const h=await harness({showEmpty:true}); let tree=await h.load(roots([{root:comment('a'),replyCount:0}],{hasMore:true,nextCursor:cursorFor(comment('a'))}));
  button(tree,'更多评论').props.onClick(); await flush(); h.requests[1].reject(Object.assign(new Error('已改为私密'),{code:'REVIEW_PUBLIC_NOT_FOUND'})); await flush(); tree=h.render();
  assert.equal(rows(tree).length,0); assert.match(words(tree),/已改为私密/); assert.doesNotMatch(words(tree),/还没有评论/); assert.ok(button(tree,'重新读取')); h.unmount();
});

test('notification locates an old thread and an off-page reply without skipping the normal paging gap', async () => {
  const target=comment('target',{createdAt:'2026-11-08T02:00:00Z',replyTo:{kind:'community',id:'old-root',nickname:'甲',available:true}}), root=comment('old-root');
  const h=await harness({notificationTarget:{notificationId:'n1',commentId:'target'}});
  h.render(); await flush(); h.requests.find(row=>row.kind==='notification').resolve({postId:'log:1',commentId:'target'}); await flush();
  const requests=h.requests.filter(row=>row.kind==='roots'); assert.equal(requests.length,2);
  requests[0].resolve(roots([{root:comment('new-root'),replyCount:0}],{totalCount:80,communityCount:80}));
  requests[1].resolve(roots([{root,replyCount:75}],{totalCount:80,communityCount:80})); await flush(); h.render(); await flush();
  const children=h.requests.filter(row=>row.kind==='children'); assert.equal(children.length,2);
  const page=children.find(row=>!row.args[0].locate), located=children.find(row=>row.args[0].locate);
  const first=comment('first',{createdAt:'2026-11-08T01:01:00Z',replyTo:{kind:'community',id:'old-root',available:true}}), cursor=cursorFor(first);
  page.resolve(replies([first],{replyCount:75,hasMore:true,nextCursor:cursor})); located.resolve(replies([target],{replyCount:75})); await flush(); let tree=h.render();
  assert.ok(h.scrolled.includes('community:target')); assert.equal(rows(tree).filter(row=>row.props['data-rj-reply-id']==='target').length,1);
  button(tree,'更多回复').props.onClick(); await flush(); assert.deepEqual(h.requests.at(-1).args[0].cursor,cursor,'target location must not advance the ordinary chronological cursor');
  h.requests.at(-1).resolve(replies([target],{replyCount:75})); await flush(); tree=h.render(); assert.equal(rows(tree).filter(row=>row.props['data-rj-reply-id']==='target').length,1); h.unmount();
});

test('a notification targeting the visible first reply highlights it without another reply locate request', async () => {
  for (const count of [1, 3]) {
    const target = comment('first', { replyTo: { kind: 'community', id: 'root', available: true } });
    const thread = { root: comment('root'), replyCount: count, previewReply: target };
    const h = await harness({ notificationTarget: { notificationId: `notice-${count}`, commentId: target.id } });
    h.render(); await flush();
    h.requests.find(request => request.kind === 'notification').resolve({ postId: 'log:1', commentId: target.id }); await flush();
    for (const request of h.requests.filter(request => request.kind === 'roots')) request.resolve(roots([thread], { totalCount: count + 1 }));
    await flush(); let tree = h.render(); await flush(); tree = h.render();
    assert.ok(h.scrolled.includes('community:first'));
    assert.equal(rows(tree).filter(row => row.props['data-review-comment-key'] === 'community:first').length, 1);
    const children = h.requests.filter(request => request.kind === 'children');
    assert.equal(children.filter(request => request.args[0].locate).length, 0, 'the already authorized preview is the requested target');
    assert.equal(children.length, count === 1 ? 0 : 1, 'a multi-reply notification may open its normal page, while a single preview is complete');
    h.unmount();
  }
});

test('a just-saved off-page reply takes priority over an old notification and preserves the ordinary paging cursor', async () => {
  const first = comment('first', { createdAt: '2026-11-08T01:01:00Z', replyTo: { kind: 'community', id: 'root', available: true } });
  const saved = comment('saved', { authorId: 'viewer', createdAt: '2026-11-08T02:00:00Z', replyTo: { kind: 'community', id: 'off-page-parent', available: true } });
  const thread = { root: comment('root'), replyCount: 75, previewReply: first };
  const h = await harness({ notificationTarget: { notificationId: 'old-notice', commentId: 'old-target' },
    replyTarget: { id: 'save-request-1', postId: 'log:1', commentKind: 'community', commentId: saved.id } });
  h.render(); await flush();
  assert.equal(h.requests.filter(request => request.kind === 'notification').length, 0, 'a successful save has its own target and does not re-authorize a stale notification');
  const rootRequests = h.requests.filter(request => request.kind === 'roots');
  assert.equal(rootRequests.length, 2);
  assert.deepEqual(rootRequests.find(request => request.args[0].locate).args[0].locate, { kind: 'community', id: saved.id });
  for (const request of rootRequests) request.resolve(roots([thread], { totalCount: 76, communityCount: 76 }));
  await flush(); let tree = h.render(); await flush();
  assert.match(words(tree), /评论 first/, 'the earliest reply remains visible while the saved target is located');
  const children = h.requests.filter(request => request.kind === 'children');
  assert.equal(children.length, 2);
  const page = children.find(request => !request.args[0].locate), located = children.find(request => request.args[0].locate);
  assert.deepEqual(located.args[0].locate, { kind: 'community', id: saved.id });
  const cursor = cursorFor(first);
  page.resolve(replies([first], { replyCount: 75, hasMore: true, nextCursor: cursor }));
  located.resolve(replies([saved], { replyCount: 75 })); await flush(); tree = h.render();
  assert.ok(h.scrolled.includes('community:saved'));
  assert.equal(rows(tree).filter(row => row.props['data-review-comment-key'] === 'community:saved').length, 1);
  assert.equal(walk(tree).filter(row => row.props.className === 'rct-reply-list').length, 1);
  button(tree, '更多回复').props.onClick(); await flush();
  assert.deepEqual(h.requests.at(-1).args[0].cursor, cursor, 'locating the save must not skip unread reply pages');
  h.requests.at(-1).resolve(replies([saved], { replyCount: 75 })); await flush(); tree = h.render();
  assert.equal(rows(tree).filter(row => row.props['data-review-comment-key'] === 'community:saved').length, 1);
  button(tree, '收起回复').props.onClick(); tree = h.render();
  assert.deepEqual(rows(tree).map(row => row.props['data-review-comment-key']), ['community:root', 'community:first']);
  assert.equal(h.scrolled.filter(key => key === 'community:saved').length, 1);
  for (const [patch, expectedScrolls] of [
    [{ refreshToken: 1 }, 1],
    [{ replyTarget: { id: 'save-request-2', postId: 'log:1', commentKind: 'community', commentId: saved.id } }, 2],
  ]) {
    const before = h.requests.length;
    h.render(patch); await flush();
    const refreshedRoots = h.requests.slice(before).filter(request => request.kind === 'roots');
    assert.equal(refreshedRoots.length, 2, 'refresh may revalidate the thread and locate its saved target');
    for (const request of refreshedRoots) request.resolve(roots([thread], { totalCount: 76, communityCount: 76 }));
    await flush(); h.render(); await flush();
    const refreshedChildren = h.requests.slice(before).filter(request => request.kind === 'children');
    assert.equal(refreshedChildren.length, 2);
    for (const request of refreshedChildren) request.resolve(request.args[0].locate
      ? replies([saved], { replyCount: 75 })
      : replies([first], { replyCount: 75, hasMore: true, nextCursor: cursor }));
    await flush(); tree = h.render(); h.render();
    assert.equal(rows(tree).filter(row => row.props['data-review-comment-key'] === 'community:saved').length, 1);
    assert.equal(h.scrolled.filter(key => key === 'community:saved').length, expectedScrolls,
      'the same save request must preserve reading position; a new save request may focus again');
  }
  h.unmount();
});

test('a saved reply target for another post is ignored without displacing a valid notification target', async () => {
  for (const withNotification of [false, true]) {
    const h = await harness({ replyTarget: { id: 'other-save', postId: 'log:another', commentKind: 'community', commentId: 'foreign-saved' },
      notificationTarget: withNotification ? { notificationId: 'current-notice', commentId: 'first' } : null });
    h.render(); await flush();
    const notification = h.requests.find(request => request.kind === 'notification');
    assert.equal(Boolean(notification), withNotification);
    if (notification) { notification.resolve({ postId: 'log:1', commentId: 'first' }); await flush(); }
    const rootRequests = h.requests.filter(request => request.kind === 'roots');
    assert.equal(rootRequests.length, withNotification ? 2 : 1);
    assert.equal(rootRequests.some(request => request.args[0].locate?.id === 'foreign-saved'), false);
    if (withNotification) assert.deepEqual(rootRequests.find(request => request.args[0].locate).args[0].locate, { kind: 'community', id: 'first' });
    for (const request of rootRequests) request.resolve(roots([{ root: comment('root'), replyCount: 1, previewReply: comment('first') }]));
    await flush(); h.render(); await flush(); h.render();
    assert.equal(h.requests.filter(request => request.kind === 'children').length, 0);
    assert.equal(h.scrolled.includes('community:first'), withNotification);
    assert.equal(h.scrolled.includes('community:foreign-saved'), false);
    h.unmount();
  }
});

test('unchanged threads retain expanded state while mutation refresh drops old data and invalidates late children', async () => {
  const h=await harness(), result=roots([{root:comment('a'),replyCount:2}]); let tree=await h.load(result);
  button(tree,'查看 2 条回复').props.onClick(); h.render(); await flush(); const late=h.requests[1];
  h.render({refreshToken:1}); await flush(); assert.equal(rows(h.render()).length,0);
  h.requests.filter(row=>row.kind==='roots').at(-1).resolve(result); await flush(); h.render(); await flush();
  late.resolve(replies([comment('deleted-old-tail')])); h.requests.filter(row=>row.kind==='children').at(-1).resolve(replies([comment('fresh'),comment('fresh-second')])); await flush(); tree=h.render();
  assert.match(words(tree),/fresh/); assert.doesNotMatch(words(tree),/deleted-old-tail/); assert.ok(button(tree,'收起回复')); h.unmount();
});

test('thread presentation keys preserve microseconds and separate author IDs from community IDs', () => {
  const a=comment('same',{kind:'author'}), b=comment('same',{kind:'community'}), c=comment('c',{createdAt:'2026-11-08T01:00:00.000002Z'});
  assert.ok(compareReviewCommentTime(c,a)>0);
  assert.equal(mergeReviewCommentReplies([a,b],[{...a,text:'updated'},c]).length,3);
  assert.equal(mergeReviewCommentReplies([a,b],[{...a,text:'updated'},c]).at(-1).id,'c');
  assert.equal(mergeReviewCommentThreads([{root:a,replyCount:0}],[{root:a,replyCount:2},{root:b,replyCount:1}]).length,2);
});

test('a revoked like invalidates a simultaneous older root page so withdrawn text cannot return', async()=>{
  const h=await harness();let tree=await h.load(roots([{root:comment('a'),replyCount:0}],{hasMore:true,nextCursor:cursorFor(comment('a'))}));
  button(tree,'更多评论').props.onClick();button(tree,'点赞山间慢行的评论 · 12').props.onClick();await flush();
  h.requests.find(row=>row.kind==='like').reject(Object.assign(new Error('父帖不再可见'),{code:'REVIEW_INTERACTION_FORBIDDEN'}));await flush();
  h.requests.filter(row=>row.kind==='roots').at(-1).resolve(roots([{root:comment('old-private'),replyCount:0}]));await flush();
  tree=h.render();assert.equal(rows(tree).length,0);assert.match(words(tree),/父帖不再可见/);assert.doesNotMatch(words(tree),/old-private/);h.unmount();
});

test('a concurrently deleted located reply is reported once without repeated locate requests',async()=>{
  const h=await harness({notificationTarget:{notificationId:'n2',commentId:'removed'}});h.render();await flush();
  h.requests.find(row=>row.kind==='notification').resolve({postId:'log:1',commentId:'removed'});await flush();
  for(const req of h.requests.filter(row=>row.kind==='roots'))req.resolve(roots([{root:comment('a'),replyCount:1}]));
  await flush();h.render();await flush();
  for(const req of h.requests.filter(row=>row.kind==='children'))req.resolve(replies([],{replyCount:1}));
  await flush();let tree=h.render();await flush();tree=h.render();await flush();
  assert.equal(h.requests.filter(row=>row.kind==='children').length,2);assert.match(words(tree),/这条回复已不可用/);h.unmount();
});

test('legacy author comments sort using server cursor time without inventing their displayed creation instant',()=>{
 const old=comment('legacy',{kind:'author',createdAt:null,sortCreatedAt:'2026-11-07T00:00:00.000001Z',date:'2026-11-06'});
 const later=comment('later',{createdAt:'2026-11-07T00:00:00.000002Z'});
 assert.ok(compareReviewCommentTime(later,old)>0);
 const rows=mergeReviewCommentReplies([later],[old]);assert.deepEqual(rows.map(row=>row.id),['legacy','later']);assert.equal(rows[0].createdAt,null);
});
