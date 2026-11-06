import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewJournalFeed, reviewDraftKey } from '../src/lib/reviewJournalFeed.js';

test('all feed ignores pinning while category feed prioritizes pins', () => {
  const insights = [{ id: 'a', date: '2026-11-01', pinned: true, text: '耐心' }, { id: 'b', date: '2026-11-05', text: '等待' }];
  const logs = [{ id: 'c', date: '2026-11-06', text: '交易', stocks: ['NVDA'] }];
  assert.deepEqual(reviewJournalFeed(insights, logs).map(row => row.id), ['c', 'b', 'a']);
  assert.deepEqual(reviewJournalFeed(insights, logs, 'insight').map(row => row.id), ['a', 'b']);
  assert.deepEqual(reviewJournalFeed(insights, logs, 'all', 'nvda').map(row => row.id), ['c']);
  assert.equal(insights[0].type, undefined);
});

test('draft keys require and separate account identities', () => {
  assert.equal(reviewDraftKey(''), null);
  assert.notEqual(reviewDraftKey('user-a'), reviewDraftKey('user-b'));
});

test('restoring a malformed draft cannot leak owners or crash array rendering', async () => {
  const { restoreReviewDraft } = await import('../src/lib/reviewJournalFeed.js');
  const draft = restoreReviewDraft({type:'log',text:'保留正文',date:'invalid',stocks:null,images:{path:'other/file'},replies:'bad',market:[],id:'stale-id'}, 'user-a');
  assert.equal(draft.text,'保留正文');
  assert.deepEqual(draft.stocks,[]); assert.deepEqual(draft.images,[]); assert.deepEqual(draft.replies,[]);
  assert.equal(draft.market,null); assert.equal(draft.id,undefined);
  assert.match(draft.operationId,/^[a-f0-9-]{36}$/i);
});
