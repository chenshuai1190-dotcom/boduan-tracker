import test from 'node:test';
import assert from 'node:assert/strict';
import { mapReviewPublicPost, mapReviewPublicReplies } from '../src/lib/reviewPublicModel.js';
import { createReviewPublicRepository } from '../src/lib/reviewPublicRepository.js';
import { createReviewPublicPreview } from '../src/dev/reviewPublicPreview.js';

const AUTHOR = '11111111-1111-4111-8111-111111111111';
const VIEWER = '22222222-2222-4222-8222-222222222222';
const IMAGE_ID = '33333333-3333-4333-8333-333333333333';
const image = { path: `${AUTHOR}/${IMAGE_ID}.png`, name: '示例图片.png', mimeType: 'image/png', size: 128 };
const market = { version: 1, kind: 'market_snapshot', basis: 'close', asOfDate: '2026-11-05', recordDate: '2026-11-06',
  items: [{ key: 'vix', value: 25, basis: 'close', source: 'CBOE', asOfDate: '2026-11-05' }] };
const account = { version: 1, kind: 'account_snapshot', basis: 'close', source: 'pnl_report', asOfDate: '2026-11-06', recordDate: '2026-11-05',
  items: [['cumulativeReturnPct', 2], ['yearPeakReturnPct', 12], ['declineFromYearPeakPp', 10], ['dailyReturnPct', -1], ['leverage', 1.25]].map(([key, value]) => ({ key, value, basis: 'close', source: 'pnl_report', asOfDate: '2026-11-06',
    ...(['yearPeakReturnPct', 'declineFromYearPeakPp'].includes(key) ? { peakDate: '2026-10-23' } : {}) })) };
const trade = { id: 'trade-sample', symbol: 'NVDA', date: '2026-11-05', side: 'buy', price: 123.45, shares: 10 };
const evaluation = extra => ({ id: 'evaluation-1', date: '2026-11-07', text: '公开的作者评价', score: 6, tags: ['耐心不足', '自定义'], stocks: ['NVDA'],
  images: [image], market, account, trades: [trade], mood: '冷静', createdAt: '2026-11-07T01:00:00.123456Z', ...extra });
const post = extra => ({ id: 'log:42', type: 'log', sourceId: '42', authorId: AUTHOR, author: { nickname: '示例作者', avatarKey: 'gold', avatarPath: null },
  date: '2026-11-05', text: '公开正文', stocks: [], images: [], market: null, replies: [evaluation()], publishedAt: '2026-11-06T01:00:00Z', updatedAt: '2026-11-07T01:00:00Z', likeCount: 0, liked: false, ...extra });

test('public author evaluations preserve all displayed features without exposing unknown source metadata', () => {
  const input = evaluation({ authorId: VIEWER, user_id: VIEWER, unknown: 'drop-this', signedUrl: 'drop-this',
    images: [{ ...image, signedUrl: 'drop-this', hidden: 'drop-this' }],
    trades: [{ ...trade, user_id: AUTHOR, costBasis: 999, note: 'drop-this' }],
    market: { ...market, private: 'drop-this', items: market.items.map(item => ({ ...item, private: 'drop-this' })) },
    account: { ...account, sourceSnapshotId: 'internal-snapshot', sourceVersion: 'pnl_snapshot_v2', capturedAt: '2026-11-07T01:00:00Z', private: 'drop-this',
      items: account.items.map(item => ({ ...item, user_id: AUTHOR, private: 'drop-this' })) },
  });
  const before = structuredClone(input);
  const result = mapReviewPublicPost(post({ replies: [input], account: { hidden: true }, trades: [{ hidden: true }] }));
  const reply = result.replies[0];
  assert.equal(reply.text, input.text); assert.equal(reply.score, 6); assert.deepEqual(reply.tags, input.tags);
  assert.equal(reply.createdAt, input.createdAt); assert.equal(reply.mood, '冷静'); assert.deepEqual(reply.stocks, ['NVDA']);
  assert.deepEqual(reply.images, [image]); assert.deepEqual(reply.trades, [trade]); assert.deepEqual(reply.account, account);
  assert.equal(reply.market.items[0].value, 25);
  assert.deepEqual(Object.keys(reply).sort(), ['account', 'createdAt', 'date', 'id', 'images', 'market', 'mood', 'score', 'stocks', 'tags', 'text', 'trades']);
  assert.equal(result.account, undefined); assert.equal(result.trades, undefined);
  assert.doesNotMatch(JSON.stringify(reply), /drop-this|internal-snapshot|sourceSnapshotId|sourceVersion|capturedAt|costBasis|user_id|authorId/);
  assert.deepEqual(input, before, 'normalization must not mutate the source evaluation');
});

test('legacy invalid attachments and foreign images are dropped while valid evaluation text remains readable', () => {
  const [reply] = mapReviewPublicReplies([evaluation({ images: [{ ...image, path: `${VIEWER}/${IMAGE_ID}.png` }],
    score: 100, tags: ['ok', 'x'.repeat(13)], market: { private: 'not a market' }, account: { netAssets: 123 },
    trades: [{ ...trade, price: -1 }], createdAt: 'invalid', stocks: ['nvda', 'invalid symbol'], unknown: 'hidden' })], AUTHOR);
  assert.equal(reply.text, '公开的作者评价'); assert.deepEqual(reply.images, []);
  assert.equal(reply.score, null); assert.deepEqual(reply.tags, ['ok']); assert.deepEqual(reply.stocks, ['NVDA']);
  assert.equal(reply.market, null); assert.equal(reply.account, null); assert.deepEqual(reply.trades, []); assert.equal(reply.createdAt, undefined);
  assert.doesNotMatch(JSON.stringify(reply), /netAssets|hidden|not a market/);
  assert.deepEqual(mapReviewPublicReplies(undefined, AUTHOR), []);
  assert.throws(() => mapReviewPublicReplies({}, AUTHOR), { code: 'REVIEW_PUBLIC_INVALID_DATA' });
  assert.throws(() => mapReviewPublicReplies(Array(501).fill(evaluation()), AUTHOR), { code: 'REVIEW_PUBLIC_INVALID_DATA' });
});

test('duplicate, empty and invalid evaluations cannot inflate the public count; historical stock/mood-only evaluations survive', () => {
  const minimal = { id: 'minimal', date: '2026-11-07', text: '' };
  const replies = mapReviewPublicReplies([evaluation(), evaluation({ text: 'duplicate' }), { ...minimal }, { ...minimal, id: 'legacy-json', market: { legacy: true } },
    { ...minimal, id: 'stock', stocks: ['SMH'] }, { ...minimal, id: 'mood', mood: '耐心' }, { ...minimal, id: 'score', score: 10 },
    { ...minimal, id: 'bad-date', date: 'not-a-date', text: 'bad' }], AUTHOR);
  assert.deepEqual(replies.map(reply => reply.id), ['evaluation-1', 'stock', 'mood', 'score']);
});

test('public detail and feed read evaluations only from the account-bound public projection RPC', async () => {
  const calls = [];
  const repository = createReviewPublicRepository({
    auth: { getUser: async () => ({ data: { user: { id: VIEWER } } }) },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'read_review_public_post' ? post() : { posts: [post()], hasMore: false, nextCursor: null }, error: null }; },
    from: () => { throw new Error('must not read owner source tables or viewer account data'); },
  });
  assert.equal((await repository.fetchPost('log:42', VIEWER)).replies[0].account.items[0].value, 2);
  assert.equal((await repository.fetchFeed({}, VIEWER)).posts[0].replies[0].trades[0].shares, 10);
  assert.deepEqual(calls.map(call => call.name), ['read_review_public_post', 'fetch_review_public_feed_v2']);
  assert.ok(calls.every(call => call.args.p_expected_user_id === VIEWER));
});

test('isolated preview publishes normalized evaluations and withdraws their image access with the parent', async () => {
  const row = { id: '42', type: 'log', date: '2026-11-05', text: '预览正文', visibility: 'public', images: [], stocks: [], replies: [evaluation()] };
  const blob = new Blob(['sample'], { type: 'image/png' });
  const preview = createReviewPublicPreview({ ownerId: AUTHOR, getEntries: () => [row], getImage: path => path === image.path ? blob : null, market });
  const feed = await preview.fetchReviewPublicFeed({}, AUTHOR);
  assert.ok(feed.posts.find(post => post.id === 'log:sample-market').replies[0].account);
  assert.deepEqual(feed.posts.find(post => post.id === 'log:42').replies[0].trades, [trade]);
  assert.equal(await preview.downloadReviewPublicImage(image.path, AUTHOR), blob);
  row.replies = [];
  await assert.rejects(preview.downloadReviewPublicImage(image.path, AUTHOR), /图片不可用/);
  row.replies = [evaluation()]; row.visibility = 'private';
  assert.equal(await preview.fetchReviewPublicPost('log:42', AUTHOR), null);
  await assert.rejects(preview.downloadReviewPublicImage(image.path, AUTHOR), /图片不可用/);
  await assert.rejects(preview.fetchReviewPublicPost('log:42', VIEWER), /预览账户不匹配/);
});
