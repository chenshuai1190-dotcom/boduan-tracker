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

test('thread roots are collapsed, replies load on demand and stay exactly one visual level', async () => {
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
  button(tree,'收起回复').props.onClick(); tree=h.render(); assert.equal(rows(tree).length,1);
  button(tree,'查看 2 条回复').props.onClick(); tree=h.render(); await flush(); assert.equal(h.requests.length,2,'reopening an unchanged thread reuses its verified page'); h.unmount();
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
  const h=await harness(); let tree=await h.load(roots([{root:comment('a'),replyCount:2}],{hasMore:true,nextCursor:cursorFor(comment('a'))}));
  button(tree,'点赞山间慢行的评论 · 12').props.onClick(); button(tree,'更多评论').props.onClick(); await flush();
  tree=h.render({userId:'other',postId:'log:2'}); assert.equal(rows(tree).length,0); await flush();
  h.requests.filter(row=>row.kind==='roots').at(-1).resolve(roots());
  h.requests.find(row=>row.kind==='like').resolve({kind:'community',id:'a',liked:true,likeCount:99});
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

test('unchanged threads retain expanded state while mutation refresh drops old data and invalidates late children', async () => {
  const h=await harness(), result=roots([{root:comment('a'),replyCount:1}]); let tree=await h.load(result);
  button(tree,'查看 1 条回复').props.onClick(); h.render(); await flush(); const late=h.requests[1];
  h.render({refreshToken:1}); await flush(); assert.equal(rows(h.render()).length,0);
  h.requests.filter(row=>row.kind==='roots').at(-1).resolve(result); await flush(); h.render(); await flush();
  late.resolve(replies([comment('deleted-old-tail')])); h.requests.filter(row=>row.kind==='children').at(-1).resolve(replies([comment('fresh')])); await flush(); tree=h.render();
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
