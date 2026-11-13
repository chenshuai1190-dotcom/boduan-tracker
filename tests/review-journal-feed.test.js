import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewJournalFeed, reviewDraftKey, emptyReviewEntry, restoreReviewDraft } from '../src/lib/reviewJournalFeed.js';

test('all feed ignores pinning while category feed prioritizes pins', () => {
  const insights = [{ id: 'a', date: '2026-11-01', pinned: true, text: '耐心' }, { id: 'b', date: '2026-11-05', text: '等待' }];
  const logs = [{ id: 'c', date: '2026-11-06', text: '交易', stocks: ['NVDA'] }];
  assert.deepEqual(reviewJournalFeed(insights, logs).map(row => row.id), ['c', 'b', 'a']);
  assert.deepEqual(reviewJournalFeed(insights, logs, 'insight').map(row => row.id), ['a', 'b']);
  assert.deepEqual(reviewJournalFeed(insights, logs, 'all', 'nvda').map(row => row.id), ['c']);
  assert.equal(insights[0].type, undefined);
});

test('each category displays its selected record ahead of ordinary pins and still respects search', () => {
  const insights = [
    { id: 1, date: '2026-11-01', text: '旧心得' },
    { id: 2, date: '2026-11-02', pinned: true, text: '复盘心得' },
    { id: 3, date: '2026-11-03', text: '最新心得' },
  ];
  const logs = [
    { id: 1, date: '2026-11-04', text: '上周复盘' },
    { id: 2, date: '2026-11-06', pinned: true, text: '本周复盘' },
  ];
  const ids = (filter, query, firstId) => reviewJournalFeed(insights, logs, filter, query, firstId).map(row => row.id);
  assert.deepEqual(ids('insight', '', '1'), [1, 2, 3]);
  assert.deepEqual(ids('log', '', '1'), [1, 2]);
  assert.deepEqual(ids('insight', '复盘', '1'), [2]);
  assert.deepEqual(ids('insight', '', 'missing'), [2, 3, 1]);
  assert.deepEqual(ids('all', '', '1'), ids('all', '', null));
});

test('draft keys require and separate account identities', () => {
  assert.equal(reviewDraftKey(''), null);
  assert.notEqual(reviewDraftKey('user-a'), reviewDraftKey('user-b'));
});

test('new posts default public while existing drafts retain their original visibility', () => {
  for (const type of ['log', 'insight']) assert.equal(emptyReviewEntry(type).visibility, 'public');
  assert.equal(restoreReviewDraft({ type: 'log', text: '示例' }, 'user-a').visibility, 'private');
  assert.equal(restoreReviewDraft({ type: 'log', text: '示例', visibility: 'private' }, 'user-a').visibility, 'private');
  assert.equal(restoreReviewDraft({ type: 'insight', text: '示例', visibility: 'public' }, 'user-a').visibility, 'public');
  assert.equal(restoreReviewDraft({ type: 'log', text: '示例', visibility: 'friends' }, 'user-a').visibility, 'private');
});

test('restoring a malformed draft cannot leak owners or crash array rendering', async () => {
  const { restoreReviewDraft } = await import('../src/lib/reviewJournalFeed.js');
  const draft = restoreReviewDraft({type:'log',text:'保留正文',date:'invalid',stocks:null,images:{path:'other/file'},replies:'bad',market:[],id:'stale-id'}, 'user-a');
  assert.equal(draft.text,'保留正文');
  assert.deepEqual(draft.stocks,[]); assert.deepEqual(draft.images,[]); assert.deepEqual(draft.replies,[]);
  assert.equal(draft.market,null); assert.equal(draft.id,undefined);
  assert.match(draft.operationId,/^[a-f0-9-]{36}$/i);
});
