import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPublicRepository } from '../src/lib/reviewPublicRepository.js';
import { buildReviewCommunityEvaluation, mapReviewCommunityEvaluation, mapReviewCommunityEvaluations } from '../src/lib/reviewCommunityEvaluationModel.js';
import { mapReviewPublicPost } from '../src/lib/reviewPublicModel.js';
import { createReviewPublicPreview } from '../src/dev/reviewPublicPreview.js';

const VIEWER = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const SECOND_ID = '44444444-4444-4444-8444-444444444444';
const POST = 'log:42';
const image = { path: `${VIEWER}/${ID}.png`, name: '示例.png', mimeType: 'image/png', size: 128 };
const market = { version: 1, kind: 'market_snapshot', basis: 'close', asOfDate: '2026-11-05', recordDate: '2026-11-06',
  items: [{ key: 'vix', value: 25, basis: 'close', source: 'CBOE', asOfDate: '2026-11-05' }] };
const account = { version: 1, kind: 'account_snapshot', basis: 'close', source: 'pnl_report', asOfDate: '2026-11-06', recordDate: '2026-11-05',
  items: [{ key: 'cumulativeReturnPct', value: 3.39, asOfDate: '2026-11-06', basis: 'close', source: 'pnl_report' }] };
const trade = { id: 'trade-sample', symbol: 'NVDA', date: '2026-11-05', side: 'buy', price: 123.45, shares: 10 };
const draft = extra => ({ id: ID, date: '2026-11-08', text: '', score: 8, ...extra });
const saved = extra => ({ ...draft(), postId: POST, authorId: VIEWER,
  author: { nickname: '评价者', avatarKey: 'gold', avatarPath: `${VIEWER}/${ID}.png` }, revision: 1,
  createdAt: '2026-11-08T01:00:00.123456+00:00', updatedAt: '2026-11-08T01:00:00.123456+00:00', ...extra });
const page = extra => ({ evaluations: [saved()], hasMore: false, nextCursor: null, totalCount: 1, ...extra });
function fixture({ users = [VIEWER], response = { data: page() } } = {}) {
  let authCalls = 0; const calls = [];
  const repository = createReviewPublicRepository({
    auth: { async getUser() { const id = users[Math.min(authCalls++, users.length - 1)]; return { data: { user: id ? { id } : null } }; } },
    async rpc(name, args) { calls.push({ name, args }); return typeof response === 'function' ? response(name, args) : response; },
    from() { throw new Error('community operations must not write the original source row'); },
  });
  return { repository, calls, authCalls: () => authCalls };
}

test('community writes reuse full evaluation attachments but strip supplied identity, evidence and server timestamps', () => {
  const value = draft({ text: '  按计划执行  ', authorId: AUTHOR, author: { nickname: '冒名' }, revision: 100,
    createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z', source: 'author', secret: 'discard',
    tags: [' 自定义 '], mood: '冷静', stocks: ['nvda'], images: [{ ...image, signedUrl: 'discard' }],
    trades: [{ ...trade, user_id: VIEWER, note: 'discard' }], market: { ...market, secret: 'discard' },
    account: { ...account, sourceSnapshotId: 'internal-id', sourceVersion: 'pnl_snapshot_v2', capturedAt: '2026-11-07T01:00:00Z', secret: 'discard' } });
  const original = structuredClone(value), result = buildReviewCommunityEvaluation(value, VIEWER);
  assert.deepEqual(Object.keys(result).sort(), ['account', 'date', 'id', 'images', 'market', 'mood', 'score', 'stocks', 'tags', 'text', 'trades']);
  assert.equal(result.text, '按计划执行'); assert.equal(result.score, 8); assert.deepEqual(result.tags, ['自定义']);
  assert.deepEqual(result.images, [image]); assert.deepEqual(result.trades, [trade]); assert.deepEqual(result.account, account);
  assert.equal(result.market.items[0].value, 25); assert.deepEqual(result.stocks, ['NVDA']); assert.equal(result.mood, '冷静');
  assert.doesNotMatch(JSON.stringify(result), /discard|internal-id|sourceSnapshotId|sourceVersion|capturedAt|authorId|revision|createdAt|updatedAt|signedUrl|user_id/);
  assert.deepEqual(value, original);
});

test('rating-only community creates are valid and retry with the same evaluation id and normalized payload', async () => {
  const f = fixture({ response: (_name, args) => ({ data: saved(args.p_evaluation) }) });
  const result = await f.repository.saveEvaluation(POST, draft(), VIEWER);
  assert.equal(result.score, 8); assert.equal(result.text, ''); assert.equal(result.source, 'community');
  assert.deepEqual(await f.repository.saveEvaluation(POST, draft(), VIEWER), result);
  assert.deepEqual(f.calls[0], { name: 'save_review_community_evaluation', args: { p_post_id: POST, p_evaluation_id: ID,
    p_expected_revision: 0, p_evaluation: buildReviewCommunityEvaluation(draft(), VIEWER), p_expected_user_id: VIEWER } });
  assert.deepEqual(f.calls[0], f.calls[1]); assert.equal(f.authCalls(), 4);
});

test('community edits and deletes send the selected reply revision and verify returned identities', async () => {
  const f = fixture({ response: (name, args) => ({ data: name === 'delete_review_community_evaluation'
    ? { id: ID, postId: POST, deleted: true, internal: 'discard' }
    : saved({ ...args.p_evaluation, revision: 5 }) }) });
  assert.equal((await f.repository.saveEvaluation(POST, draft({ revision: 4, text: '修改后' }), VIEWER)).revision, 5);
  assert.deepEqual(await f.repository.deleteEvaluation(POST, { id: ID, revision: 5 }, VIEWER), { id: ID, postId: POST, deleted: true });
  assert.deepEqual(f.calls.map(call => call.args.p_expected_revision), [4, 5]);
  assert.ok(f.calls.every(call => call.args.p_expected_user_id === VIEWER));
  for (const data of [saved({ id: SECOND_ID }), saved({ authorId: AUTHOR }), saved({ postId: 'log:43' })]) {
    await assert.rejects(fixture({ response: { data } }).repository.saveEvaluation(POST, draft(), VIEWER), { code: 'REVIEW_COMMUNITY_INVALID_DATA' });
  }
  await assert.rejects(fixture({ response: { data: { id: SECOND_ID, postId: POST, deleted: true } } }).repository.deleteEvaluation(POST, { id: ID, revision: 1 }, VIEWER), { code: 'REVIEW_COMMUNITY_INVALID_DATA' });
});

test('community pages preserve each reviewer identity and microsecond cursor without source-row reads', async () => {
  const cursor = { createdAt: saved().createdAt, id: ID };
  const f = fixture({ response: { data: page({ evaluations: [saved({ authorId: AUTHOR, author: { nickname: '其他评价者', avatarKey: 'green', avatarPath: `${AUTHOR}/${SECOND_ID}.webp`, email: 'discard' } })], hasMore: true, nextCursor: cursor, totalCount: 21 }) } });
  const result = await f.repository.fetchEvaluations({ postId: POST, limit: 20, cursor }, VIEWER);
  assert.deepEqual(f.calls, [{ name: 'fetch_review_community_evaluations', args: { p_post_id: POST, p_limit: 20, p_before: cursor.createdAt, p_before_id: cursor.id, p_expected_user_id: VIEWER } }]);
  assert.equal(result.evaluations[0].authorId, AUTHOR); assert.equal(result.evaluations[0].author.nickname, '其他评价者');
  assert.equal(result.evaluations[0].author.avatarPath, `${AUTHOR}/${SECOND_ID}.webp`); assert.equal(result.evaluations[0].author.email, undefined);
  assert.deepEqual(result.nextCursor, cursor); assert.equal(result.totalCount, 21);
  assert.equal(mapReviewCommunityEvaluation(saved({ author: { ...saved().author, avatarPath: `${AUTHOR}/${ID}.png` } }), POST).author.avatarPath, null);
});

test('invalid scores, dates, foreign attachments, revisions and paging are rejected before any request', async () => {
  const f = fixture();
  for (const patch of [{ score: 0 }, { score: 11 }, { score: 2.5 }, { score: '8' }, { score: null }, { id: 'source-reply-id' },
    { date: '2026-02-30' }, { revision: -1 }, { revision: '1' }, { revision: 1.5 }, { revision: 2147483647 },
    { images: [{ ...image, path: `${AUTHOR}/${ID}.png` }] }, { market: { private: 'not a market' } },
    { tags: ['x'.repeat(13)] }, { trades: [{ ...trade, shares: 0 }] }, { account: { netAssets: 100 } }]) {
    await assert.rejects(f.repository.saveEvaluation(POST, draft(patch), VIEWER));
  }
  for (const options of [null, [], {}, { postId: POST, limit: 0 }, { postId: POST, limit: 21 },
    { postId: POST, cursor: { id: ID, createdAt: 'yesterday' } }, { postId: '../source' }]) await assert.rejects(f.repository.fetchEvaluations(options, VIEWER));
  await assert.rejects(f.repository.deleteEvaluation(POST, { id: ID, revision: 0 }, VIEWER));
  assert.equal(f.calls.length, 0);
});

test('malformed pages, cross-post rows and invalid timestamps cannot appear as a successful empty result', () => {
  for (const value of [null, {}, page({ totalCount: -1 }), page({ totalCount: 0 }), page({ totalCount: '1' }),
    page({ evaluations: [saved(), saved()] }), page({ hasMore: true }), page({ nextCursor: { createdAt: saved().createdAt, id: ID } }),
    page({ hasMore: true, nextCursor: { createdAt: saved().createdAt, id: SECOND_ID } }),
    page({ evaluations: [saved({ postId: 'log:43' })] }), page({ evaluations: [saved({ authorId: 'invalid' })] }),
    page({ evaluations: [saved({ revision: 0 })] }), page({ evaluations: [saved({ updatedAt: '2026-02-30T01:00:00Z' })] })]) {
    assert.throws(() => mapReviewCommunityEvaluations(value, POST), { code: 'REVIEW_COMMUNITY_INVALID_DATA' });
  }
  assert.deepEqual(mapReviewCommunityEvaluations({ evaluations: [], hasMore: false, nextCursor: null, totalCount: 0 }, POST), { evaluations: [], hasMore: false, nextCursor: null, totalCount: 0 });
});

test('all community operations reject account swaps before and after RPC and send expected JWT identity', async () => {
  const operations = [r => r.fetchEvaluations({ postId: POST }, VIEWER), r => r.saveEvaluation(POST, draft(), VIEWER), r => r.deleteEvaluation(POST, { id: ID, revision: 1 }, VIEWER)];
  for (const operation of operations) {
    for (const users of [[AUTHOR], [VIEWER, AUTHOR], [VIEWER, null]]) {
      const f = fixture({ users });
      await assert.rejects(operation(f.repository), { code: users.at(-1) ? 'REVIEW_ACCOUNT_CHANGED' : 'REVIEW_AUTH_REQUIRED' });
      assert.equal(f.calls.length, users[0] === VIEWER ? 1 : 0);
      if (f.calls.length) assert.equal(f.calls[0].args.p_expected_user_id, VIEWER);
    }
    let mutations = 0;
    const f = fixture({ response: (_name, args) => {
      if (args.p_expected_user_id !== AUTHOR) return { error: { code: '42501' } };
      mutations++; return { data: null };
    } });
    await assert.rejects(operation(f.repository), { code: 'REVIEW_PUBLIC_FORBIDDEN' });
    assert.equal(mutations, 0, 'server identity guards remain necessary even if both local checks see the old viewer');
  }
});

test('community conflicts, missing schema and withdrawal remain actionable failures without leaking server detail', async () => {
  for (const [code, expected] of [['40001', 'REVIEW_COMMUNITY_CONFLICT'], ['22023', 'REVIEW_COMMUNITY_INVALID_INPUT'],
    ['P0002', 'REVIEW_PUBLIC_NOT_FOUND'], ['42501', 'REVIEW_PUBLIC_FORBIDDEN'], ['PGRST202', 'REVIEW_PUBLIC_NOT_CONFIGURED']]) {
    const f = fixture({ response: { error: { code, message: 'private-server-detail' } } });
    await assert.rejects(f.repository.saveEvaluation(POST, draft(), VIEWER), error => error.code === expected && !error.message.includes('private-server-detail'));
  }
  const f = fixture({ response: { error: { code: '22023' } } });
  await assert.rejects(f.repository.fetchFeed({}, VIEWER), { code: 'REVIEW_PUBLIC_REQUEST_FAILED' }, 'community-specific errors do not alter existing public feed errors');
});

test('public comment counts combine source and community totals without merging or fabricating source replies', () => {
  const post = { id: POST, type: 'log', sourceId: '42', authorId: AUTHOR, author: { nickname: '原作者' },
    text: '正文', date: '2026-11-06', stocks: [], images: [], replies: [{ id: 'old', date: '2026-11-07', text: '作者自评' }],
    publishedAt: '2026-11-06T01:00:00Z', updatedAt: '2026-11-08T01:00:00Z', liked: false, likeCount: 1 };
  assert.equal(mapReviewPublicPost(post).commentCount, 1, 'old schema responses keep the source count');
  assert.equal(mapReviewPublicPost({ ...post, commentCount: 12 }).commentCount, 12);
  assert.equal(mapReviewPublicPost({ ...post, commentCount: 12 }).replies.length, 1);
  for (const commentCount of [-1, 0, 1.5, '12']) assert.throws(() => mapReviewPublicPost({ ...post, commentCount }), { code: 'REVIEW_PUBLIC_INVALID_DATA' });
});

test('isolated community preview supports create, edit, delete and parent withdrawal without writing personal sources', async () => {
  const rows = [{ id: '42', type: 'log', text: '自己的博文', date: '2026-11-06', visibility: 'public', replies: [] }];
  const original = structuredClone(rows), blob = new Blob(['sample'], { type: 'image/png' });
  const preview = createReviewPublicPreview({ ownerId: VIEWER, getEntries: () => rows, getImage: path => path === image.path ? blob : null, market });
  const postId = 'insight:sample-reader';
  const created = await preview.saveReviewCommunityEvaluation(postId, draft({ images: [image] }), VIEWER);
  assert.equal(created.authorId, VIEWER); assert.equal(created.revision, 1); assert.equal(created.score, 8);
  assert.equal((await preview.fetchReviewPublicPost(postId, VIEWER)).commentCount, 1);
  assert.equal((await preview.fetchReviewPublicPost(postId, VIEWER)).replies.length, 0);
  assert.deepEqual(await preview.saveReviewCommunityEvaluation(postId, draft({ images: [image] }), VIEWER), created);
  const edited = await preview.saveReviewCommunityEvaluation(postId, { ...created, score: 7, text: '补充评价' }, VIEWER);
  assert.equal(edited.revision, 2); assert.equal(edited.createdAt, created.createdAt);
  await assert.rejects(preview.saveReviewCommunityEvaluation(postId, { ...created, text: '过时的修改' }, VIEWER), { code: 'REVIEW_COMMUNITY_CONFLICT' });
  assert.equal(await preview.downloadReviewPublicImage(image.path, VIEWER), blob);
  preview.setReviewCommunityPreviewVisibility(postId, 'private');
  assert.equal(await preview.fetchReviewPublicPost(postId, VIEWER), null);
  await assert.rejects(preview.fetchReviewCommunityEvaluations({ postId }, VIEWER), { code: 'REVIEW_PUBLIC_NOT_FOUND' });
  await assert.rejects(preview.saveReviewCommunityEvaluation(postId, edited, VIEWER), { code: 'REVIEW_PUBLIC_NOT_FOUND' });
  await assert.rejects(preview.deleteReviewCommunityEvaluation(postId, edited, VIEWER), { code: 'REVIEW_PUBLIC_NOT_FOUND' });
  await assert.rejects(preview.downloadReviewPublicImage(image.path, VIEWER), /图片不可用/);
  preview.setReviewCommunityPreviewVisibility(postId, 'public');
  assert.equal((await preview.fetchReviewCommunityEvaluations({ postId }, VIEWER)).evaluations[0].score, 7);
  await preview.deleteReviewCommunityEvaluation(postId, edited, VIEWER);
  assert.deepEqual(await preview.deleteReviewCommunityEvaluation(postId, edited, VIEWER), { id: edited.id, postId, deleted: true });
  await assert.rejects(preview.saveReviewCommunityEvaluation(postId, draft(), VIEWER), { code: 'REVIEW_PUBLIC_NOT_FOUND' }, 'retrying a deleted create cannot resurrect it');
  assert.equal((await preview.fetchReviewPublicPost(postId, VIEWER)).commentCount, 0);
  assert.deepEqual(rows, original, 'community writes must not replace or append to the viewer source entries');
});

test('isolated community preview paginates current-post reviews with cursor tie breaking and total count', async () => {
  const rows = [{ id: '42', type: 'log', text: '自己的博文', date: '2026-11-06', visibility: 'public', replies: [] }];
  const evaluations = Array.from({ length: 22 }, (_, i) => saved({ id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}` }));
  const preview = createReviewPublicPreview({ ownerId: VIEWER, getEntries: () => rows, communityEvaluations: [...evaluations, saved({ id: SECOND_ID, postId: 'log:other' })] });
  const first = await preview.fetchReviewCommunityEvaluations({ postId: POST }, VIEWER);
  const second = await preview.fetchReviewCommunityEvaluations({ postId: POST, cursor: first.nextCursor }, VIEWER);
  assert.equal(first.evaluations.length, 20); assert.equal(first.totalCount, 22); assert.equal(first.hasMore, true);
  assert.equal(second.evaluations.length, 2); assert.equal(second.totalCount, 22); assert.equal(second.hasMore, false); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.evaluations, ...second.evaluations].map(row => row.id)).size, 22);
  assert.equal((await preview.fetchReviewPublicPost(POST, VIEWER)).commentCount, 22);
});

test('isolated preview retains other reviewers on the parent owner private detail and respects their ownership', async () => {
  const rows = [{ id: '42', type: 'log', text: '自己的博文', date: '2026-11-06', visibility: 'public', replies: [] }];
  const external = saved({ authorId: AUTHOR, author: { nickname: '其他评价者', avatarKey: 'green' } });
  const preview = createReviewPublicPreview({ ownerId: VIEWER, getEntries: () => rows, market, communityEvaluations: [external] });
  assert.equal((await preview.fetchReviewPublicPost(POST, VIEWER)).commentCount, 1);
  rows[0].visibility = 'private';
  assert.equal(await preview.fetchReviewPublicPost(POST, VIEWER), null);
  assert.equal((await preview.fetchReviewCommunityEvaluations({ postId: POST }, VIEWER)).evaluations[0].authorId, AUTHOR);
  await assert.rejects(preview.saveReviewCommunityEvaluation(POST, { ...external, text: '修改他人评价' }, VIEWER), { code: 'REVIEW_PUBLIC_FORBIDDEN' });
  await assert.rejects(preview.deleteReviewCommunityEvaluation(POST, external, VIEWER), { code: 'REVIEW_PUBLIC_FORBIDDEN' });
  rows.length = 0;
  await assert.rejects(preview.fetchReviewCommunityEvaluations({ postId: POST }, VIEWER), { code: 'REVIEW_PUBLIC_NOT_FOUND' });
});
