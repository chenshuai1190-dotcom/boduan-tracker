import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPublicRepository, assertReviewPublicAvailable } from '../src/lib/reviewPublicRepository.js';
import { mapReviewPublicFeed, mapReviewPublicPost } from '../src/lib/reviewPublicModel.js';

const VIEWER = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const UUID = '33333333-3333-4333-8333-333333333333';
const image = { path: `${AUTHOR}/${UUID}.jpg`, name: '示例.jpg', mimeType: 'image/jpeg', size: 512 };
const post = extra => ({ id: 'log:42', type: 'log', sourceId: '42', authorId: AUTHOR,
  author: { nickname: '示例作者', avatarKey: 'fox', avatarPath: `${AUTHOR}/${UUID}.webp` },
  text: '这是一条公开示例', date: '2026-11-06', stocks: ['NVDA'], images: [image], market: null,
  publishedAt: '2026-11-08T01:00:00+00:00', updatedAt: '2026-11-08T02:00:00+00:00', likeCount: 2, liked: false, ...extra });
const feed = extra => ({ posts: [post()], hasMore: false, nextCursor: null, ...extra });
function fixture({ users = [VIEWER], result = { data: feed(), error: null }, download = { data: new Blob(['image'], { type: 'image/jpeg' }), error: null } } = {}) {
  let authCalls = 0;
  const calls = [], downloads = [];
  const client = {
    auth: { async getUser() { const id = users[Math.min(authCalls++, users.length - 1)]; return { data: { user: id ? { id } : null }, error: null }; } },
    async rpc(name, args) { calls.push({ name, args }); return typeof result === 'function' ? result(name, args) : result; },
    storage: { from(bucket) { return { async download(path) { downloads.push({ bucket, path }); return download; } }; } },
  };
  return { client, repository: createReviewPublicRepository(client), calls, downloads, authCalls: () => authCalls };
}

test('public projection strips private evaluations, account, trades and unknown identity/image fields', () => {
  const value = post({ replies: [{ text: '私密评价' }], account: { netAssets: 999 }, trades: [{ shares: 100 }], timelineEvent: { hidden: true },
    author: { ...post().author, email: 'private@example.test' }, images: [{ ...image, signedUrl: 'private-token', metadata: 'private' }] });
  const mapped = mapReviewPublicPost(value);
  assert.deepEqual(Object.keys(mapped).sort(), ['author', 'authorId', 'date', 'id', 'images', 'likeCount', 'liked', 'market', 'publishedAt', 'sourceId', 'stocks', 'text', 'type', 'updatedAt']);
  assert.deepEqual(mapped.author, post().author);
  assert.deepEqual(mapped.images, [image]);
  assert.doesNotMatch(JSON.stringify(mapped), /私密|private|netAssets|shares|timelineEvent/);
  assert.equal(value.replies[0].text, '私密评价', 'the source response is never mutated');
});

test('invalid foreign images, malformed identifiers and unsafe counts fail visibly', () => {
  for (const value of [post({ sourceId: 'wrong' }), post({ authorId: 'unknown' }), post({ likeCount: -1 }), post({ liked: 'true' }),
    post({ images: [{ ...image, path: `${VIEWER}/${UUID}.jpg` }] }), post({ images: [{ ...image, mimeType: 'image/svg+xml' }] }),
    post({ publishedAt: 'yesterday' }), post({ stocks: ['not a symbol'] })]) {
    assert.throws(() => mapReviewPublicPost(value), { code: 'REVIEW_PUBLIC_INVALID_DATA' });
  }
  const badAvatar = mapReviewPublicPost(post({ author: { ...post().author, avatarPath: `${VIEWER}/${UUID}.webp` } }));
  assert.equal(badAvatar.author.avatarPath, null);
  assert.equal(mapReviewPublicPost(post({ market: { oldValue: 10, privateNote: 'discard' } })).market, null);
});

test('feed validates pagination and does not mistake malformed responses for empty results', () => {
  assert.deepEqual(mapReviewPublicFeed({ posts: [], hasMore: false, nextCursor: null }), { posts: [], hasMore: false, nextCursor: null });
  const cursor = { publishedAt: post().publishedAt, id: post().id };
  assert.deepEqual(mapReviewPublicFeed(feed({ hasMore: true, nextCursor: cursor })).nextCursor, cursor);
  for (const value of [null, {}, feed({ hasMore: true }), feed({ nextCursor: cursor }), feed({ posts: [post(), post()] }),
    feed({ hasMore: true, nextCursor: { ...cursor, id: 'log:43' } })]) assert.throws(() => mapReviewPublicFeed(value), { code: 'REVIEW_PUBLIC_INVALID_DATA' });
});

test('public feed uses authenticated bounded cursor RPC and returns no private source rows', async () => {
  const f = fixture();
  const cursor = { publishedAt: '2026-11-09T01:00:00.123456+00:00', id: 'log:50' };
  const result = await f.repository.fetchFeed({ limit: 12, cursor, query: ' NVDA ', symbol: 'NVDA' }, VIEWER);
  assert.equal(result.posts[0].authorId, AUTHOR, 'public authors may differ from the authenticated viewer');
  assert.equal(f.authCalls(), 2);
  assert.deepEqual(f.calls, [{ name: 'fetch_review_public_feed', args: { p_limit: 12, p_before: cursor.publishedAt, p_before_id: cursor.id, p_query: 'NVDA', p_symbol: 'NVDA', p_expected_user_id: VIEWER } }]);
  for (const options of [{ limit: 100 }, { query: 'x'.repeat(201) }, { symbol: 'bad symbol' }, { cursor: { id: 'log:1', publishedAt: 'bad' } }]) {
    await assert.rejects(f.repository.fetchFeed(options, VIEWER));
  }
  assert.equal(f.calls.length, 1);
});

test('missing schema, transport and access failures are errors rather than successful empty feeds', async () => {
  for (const [code, expected] of [['PGRST202', 'REVIEW_PUBLIC_NOT_CONFIGURED'], ['42501', 'REVIEW_PUBLIC_FORBIDDEN'], ['NETWORK_ERROR', 'REVIEW_PUBLIC_REQUEST_FAILED']]) {
    const f = fixture({ result: { data: null, error: { code, message: 'secret backend detail' } } });
    await assert.rejects(f.repository.fetchFeed({}, VIEWER), error => error.code === expected && !error.message.includes('secret'));
  }
  const absent = createReviewPublicRepository({ auth: { getUser: async () => ({ data: { user: { id: VIEWER } } }) } });
  await assert.rejects(absent.fetchFeed({}, VIEWER), { code: 'REVIEW_PUBLIC_NOT_CONFIGURED' });
  await assert.rejects(assertReviewPublicAvailable({}, VIEWER), { code: 'REVIEW_PUBLIC_NOT_CONFIGURED' });
  await assert.rejects(assertReviewPublicAvailable({}), { code: 'REVIEW_AUTH_REQUIRED' });
  const throwing = fixture({ result: () => { throw new Error('secret transport detail'); } });
  await assert.rejects(throwing.repository.fetchFeed({}, VIEWER), { code: 'REVIEW_PUBLIC_REQUEST_FAILED' });
  assert.equal(throwing.authCalls(), 2);
});

test('account changes before and after requests never return cross-session data', async () => {
  for (const users of [[AUTHOR], [VIEWER, AUTHOR], [VIEWER, null]]) {
    const f = fixture({ users });
    await assert.rejects(f.repository.fetchFeed({}, VIEWER), { code: users.at(-1) ? 'REVIEW_ACCOUNT_CHANGED' : 'REVIEW_AUTH_REQUIRED' });
    assert.equal(f.calls.length, users[0] === VIEWER ? 1 : 0);
  }
  const f = fixture();
  await assert.rejects(f.repository.fetchFeed({}, ''), { code: 'REVIEW_AUTH_REQUIRED' });
  assert.equal(f.calls.length, 0);
});

test('server expected-user guards reject an account swap during RPC even if local checks both see the original user', async () => {
  const calls = []; let mutationCount = 0;
  const f = fixture({ result: (name, args) => {
    calls.push({ name, args });
    // Shared-client session changed after getUser(), then changes back before
    // the post-request check. Only the authenticated server can detect this gap.
    const requestJwtUser = AUTHOR;
    if (args.p_expected_user_id !== requestJwtUser) return { data: null, error: { code: '42501' } };
    if (name === 'set_review_public_like') mutationCount++;
    return { data: feed(), error: null };
  } });
  for (const request of [
    () => f.repository.fetchFeed({}, VIEWER),
    () => f.repository.fetchPost('log:42', VIEWER),
    () => f.repository.setLike('log:42', true, VIEWER),
    () => assertReviewPublicAvailable(f.client, VIEWER),
  ]) await assert.rejects(request(), { code: 'REVIEW_PUBLIC_FORBIDDEN' });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.args.p_expected_user_id === VIEWER));
  assert.equal(mutationCount, 0);
  assert.equal(f.authCalls(), 6, 'pre/post client checks alone both saw the same original account');
});

test('post reads distinguish withdrawal from an unrelated returned post', async () => {
  assert.equal(await fixture({ result: { data: null } }).repository.fetchPost('log:42', VIEWER), null);
  assert.equal((await fixture({ result: { data: post() } }).repository.fetchPost('log:42', VIEWER)).id, 'log:42');
  await assert.rejects(fixture({ result: { data: post({ id: 'log:43', sourceId: '43' }) } }).repository.fetchPost('log:42', VIEWER), { code: 'REVIEW_PUBLIC_INVALID_DATA' });
  const f = fixture();
  await assert.rejects(f.repository.fetchPost('../private', VIEWER), { code: 'REVIEW_PUBLIC_INVALID_ID' });
  assert.equal(f.calls.length, 0);
});

test('like requests set a desired value so retries cannot add duplicate likes', async () => {
  const f = fixture({ result: (_name, args) => ({ data: { postId: args.p_post_id, likeCount: args.p_liked ? 3 : 2, liked: args.p_liked, account: 'discard' } }) });
  const liked = await f.repository.setLike('log:42', true, VIEWER);
  assert.deepEqual(liked, { postId: 'log:42', likeCount: 3, liked: true });
  assert.deepEqual(await f.repository.setLike('log:42', true, VIEWER), liked);
  assert.equal((await f.repository.setLike('log:42', false, VIEWER)).likeCount, 2);
  assert.deepEqual(f.calls.map(row => row.args.p_liked), [true, true, false]);
  assert.ok(f.calls.every(row => row.args.p_expected_user_id === VIEWER));
  await assert.rejects(f.repository.setLike('log:42', 'true', VIEWER), { code: 'REVIEW_PUBLIC_INVALID_LIKE' });
  await assert.rejects(fixture({ result: { data: null, error: { code: 'P0002' } } }).repository.setLike('log:42', true, VIEWER), { code: 'REVIEW_PUBLIC_NOT_FOUND' });
});

test('public images use authenticated downloads, never signed URLs or owner-only resolvers', async () => {
  const f = fixture();
  const blob = await f.repository.downloadImage(image.path, VIEWER);
  assert.ok(blob instanceof Blob);
  await f.repository.downloadAvatar(image.path, VIEWER);
  assert.deepEqual(f.downloads, [{ bucket: 'review-journal-images', path: image.path }, { bucket: 'community-avatars', path: image.path }]);
  assert.equal(f.authCalls(), 4);
  for (const path of ['https://example.test/private.jpg', `${AUTHOR}/../x.jpg`, `${AUTHOR}/x.svg`]) {
    await assert.rejects(f.repository.downloadImage(path, VIEWER), { code: 'REVIEW_INVALID_IMAGE' });
  }
  await assert.rejects(fixture({ users: [VIEWER, AUTHOR] }).repository.downloadImage(image.path, VIEWER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  for (const data of [new Blob(['svg'], { type: 'image/svg+xml' }), null, new Blob([], { type: 'image/jpeg' })]) {
    await assert.rejects(fixture({ download: { data } }).repository.downloadImage(image.path, VIEWER), { code: 'REVIEW_PUBLIC_IMAGE_UNAVAILABLE' });
  }
});
