import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewNotificationRepository } from '../src/lib/reviewNotificationRepository.js';
import { mapReviewNotification, mapReviewNotificationsPage, mapReviewNotificationCount,
  mapReviewNotificationTarget, normalizeReviewNotificationCursor } from '../src/lib/reviewNotificationModel.js';

const VIEWER = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMMENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const POST = 'log:42';
const TIME = '2026-11-08T06:00:00.123456+00:00';
const image = { path: `${ACTOR}/${COMMENT}.png`, name: '示例.png', mimeType: 'image/png', size: 128 };
const account = { version: 1, kind: 'account_snapshot', basis: 'close', source: 'pnl_report', asOfDate: '2026-11-06', recordDate: '2026-11-05',
  items: [{ key: 'cumulativeReturnPct', value: 3.39, asOfDate: '2026-11-06', basis: 'close', source: 'pnl_report' }] };
const trade = { id: 'trade-sample', symbol: 'NVDA', date: '2026-11-05', side: 'buy', price: 123.45, shares: 10 };
const notification = extra => ({ id: ID, kind: 'comment', postId: POST, commentId: COMMENT, actorId: ACTOR,
  actor: { nickname: '评价者', avatarKey: 'gold', avatarPath: `${ACTOR}/${COMMENT}.png` },
  createdAt: TIME, readAt: null, score: null, excerpt: '按照计划执行', postExcerpt: '原帖摘要', ...extra });
const page = extra => ({ notifications: [notification()], hasMore: false, nextCursor: null, unreadCount: 1, ...extra });
const evaluation = extra => ({ id: COMMENT, postId: POST, authorId: ACTOR, author: notification().actor,
  date: '2026-11-08', text: '按计划执行', score: 8, revision: 2, createdAt: TIME, updatedAt: TIME, replyTo: null, ...extra });
const target = extra => ({ notificationId: ID, postId: POST, commentId: COMMENT, evaluation: evaluation(), ...extra });
const errorCode = code => ({ code });
function fixture({ users = [VIEWER], response = { data: page() }, authError = null, authThrow = false } = {}) {
  let authCalls = 0;
  const calls = [];
  const client = {
    auth: { async getUser() {
      const id = users[Math.min(authCalls++, users.length - 1)];
      if (authThrow) throw new Error('private-auth-transport-detail');
      return { data: { user: id ? { id } : null }, error: authError };
    } },
    async rpc(name, args) { calls.push({ name, args }); return typeof response === 'function' ? response(name, args) : response; },
    from() { throw new Error('notification operations must only use scoped RPCs'); },
  };
  return { client, repository: createReviewNotificationRepository(client), calls, authCalls: () => authCalls };
}

test('notification projection preserves only bounded display fields and actor-owned avatar', () => {
  const original = notification({ actor: { ...notification().actor, email: 'private' }, account: { balance: 900 }, recipientId: VIEWER,
    accessToken: 'private', extra: 'private' });
  const mapped = mapReviewNotification(original);
  assert.deepEqual(mapped, notification());
  assert.equal(original.actor.email, 'private', 'the server response is never mutated');
  assert.doesNotMatch(JSON.stringify(mapped), /private|balance|recipientId|accessToken/);
  assert.equal(mapReviewNotification(notification({ actor: { ...notification().actor, avatarPath: `${VIEWER}/${COMMENT}.png` } })).actor.avatarPath, null);
  assert.equal(mapReviewNotification(notification({ actor: { nickname: '\u0000  ', avatarKey: 'unknown', avatarPath: 'https://secret/image' } })).actor.nickname, 'Quote 用户');
  assert.equal(mapReviewNotification(notification({ id: ID.toUpperCase(), actorId: ACTOR.toUpperCase() })).id, ID);
});

test('all four event kinds preserve scores, read state and Unicode excerpts without time precision loss', () => {
  for (const kind of ['like', 'comment', 'rating', 'reply']) {
    const item = mapReviewNotification(notification({ kind, score: kind === 'rating' ? 10 : null,
      commentId: kind === 'like' ? null : COMMENT, readAt: TIME, excerpt: '😀'.repeat(160), postExcerpt: '原'.repeat(160) }));
    assert.equal(item.kind, kind); assert.equal(item.createdAt, TIME); assert.equal(item.readAt, TIME);
    assert.equal(Array.from(item.excerpt).length, 160);
  }
});

test('malformed events cannot be silently displayed or mistaken for empty events', () => {
  for (const value of [null, [], {}, notification({ id: 'bad' }), notification({ actorId: 'bad' }), notification({ actor: [] }),
    notification({ kind: 'email' }), notification({ postId: 'private:42' }), notification({ commentId: undefined }),
    notification({ commentId: 'author-source-id' }), notification({ createdAt: 'yesterday' }), notification({ createdAt: '2026-02-30T06:00:00Z' }),
    notification({ readAt: undefined }), notification({ readAt: 'yesterday' }), notification({ score: undefined }),
    ...[0, 11, 3.5, '8', NaN].map(score => notification({ score })), notification({ excerpt: 1 }),
    notification({ excerpt: '😀'.repeat(161) }), notification({ postExcerpt: 'x'.repeat(161) })]) {
    assert.throws(() => mapReviewNotification(value), errorCode('REVIEW_NOTIFICATION_INVALID_DATA'));
  }
});

test('pages preserve exact microsecond cursor and all-filter unread count', () => {
  const cursor = { createdAt: TIME, id: ID };
  assert.deepEqual(mapReviewNotificationsPage(page({ hasMore: true, nextCursor: cursor, unreadCount: 42, hidden: 'discard' })),
    { notifications: [notification()], hasMore: true, nextCursor: cursor, unreadCount: 42 });
  assert.deepEqual(mapReviewNotificationsPage({ notifications: [], hasMore: false, nextCursor: null, unreadCount: 3 }),
    { notifications: [], hasMore: false, nextCursor: null, unreadCount: 3 });
  assert.deepEqual(normalizeReviewNotificationCursor({ ...cursor, extra: 'discard' }), cursor);
  assert.equal(normalizeReviewNotificationCursor(null), null);
});

test('page validation rejects bad counts, duplicate ids, excessive rows and mismatched cursor tuples', () => {
  const cursor = { createdAt: TIME, id: ID };
  for (const value of [null, {}, page({ unreadCount: -1 }), page({ unreadCount: '1' }), page({ unreadCount: Number.MAX_SAFE_INTEGER + 1 }),
    page({ notifications: [notification(), notification({ id: ID.toUpperCase() })] }), page({ hasMore: 'false' }),
    page({ hasMore: true }), page({ hasMore: true, notifications: [], nextCursor: cursor }), page({ nextCursor: cursor }),
    page({ hasMore: true, nextCursor: { ...cursor, id: OTHER } }),
    page({ hasMore: true, nextCursor: { ...cursor, createdAt: TIME.replace('123456', '123000') } }),
    page({ hasMore: true, nextCursor: { createdAt: 'yesterday', id: ID } }),
    page({ notifications: Array.from({ length: 21 }, () => notification()) })]) {
    assert.throws(() => mapReviewNotificationsPage(value), errorCode('REVIEW_NOTIFICATION_INVALID_DATA'));
  }
  assert.throws(() => mapReviewNotificationsPage(page({ notifications: [notification(), notification({ id: OTHER })] }), 1), errorCode('REVIEW_NOTIFICATION_INVALID_DATA'));
  for (const value of [null, {}, { unreadCount: -1 }, { unreadCount: 0.5 }, { unreadCount: '0' }]) {
    assert.throws(() => mapReviewNotificationCount(value), errorCode('REVIEW_NOTIFICATION_INVALID_DATA'));
  }
});

test('fetch uses bounded filtered cursor RPC with authenticated expected account', async () => {
  const f = fixture(), cursor = { createdAt: TIME, id: ID };
  for (const filter of ['all', 'comments', 'likes', 'ratings']) {
    assert.deepEqual(await f.repository.fetchNotifications({ filter, limit: 12, cursor }, VIEWER), page());
    assert.deepEqual(f.calls.at(-1), { name: 'fetch_review_activity_notifications', args: {
      p_limit: 12, p_before: TIME, p_before_id: ID, p_filter: filter, p_expected_user_id: VIEWER } });
  }
  await f.repository.fetchNotifications(undefined, VIEWER);
  assert.deepEqual(f.calls.at(-1).args, { p_limit: 20, p_before: null, p_before_id: null, p_filter: 'all', p_expected_user_id: VIEWER });
  assert.equal(f.authCalls(), 10);
});

test('invalid list and cursor inputs stop before requests', async () => {
  const f = fixture();
  for (const options of [null, [], { limit: 0 }, { limit: 21 }, { limit: 1.5 }, { limit: '20' }, { filter: 'replies' },
    { cursor: {} }, { cursor: { createdAt: TIME, id: 'bad' } }, { cursor: { id: ID, createdAt: '2026-02-30T00:00:00Z' } }]) {
    await assert.rejects(f.repository.fetchNotifications(options, VIEWER));
  }
  assert.equal(f.calls.length, 0); assert.equal(f.authCalls(), 0);
});

test('count reads current server count every time without a cross-account cache', async () => {
  let count = 2;
  const f = fixture({ response: () => ({ data: { unreadCount: count--, private: 'discard' } }) });
  assert.deepEqual(await f.repository.fetchCount(VIEWER), { unreadCount: 2 });
  assert.deepEqual(await f.repository.fetchCount(VIEWER), { unreadCount: 1 });
  assert.deepEqual(f.calls, Array.from({ length: 2 }, () => ({ name: 'fetch_review_activity_notification_count', args: { p_expected_user_id: VIEWER } })));
  assert.equal(f.authCalls(), 4);
});

test('mark selected ids read sends a deduplicated desired-state operation and retries without toggling', async () => {
  const unread = new Set([ID, OTHER]);
  const f = fixture({ response: (_name, args) => { for (const id of args.p_ids) unread.delete(id); return { data: { unreadCount: unread.size } }; } });
  assert.deepEqual(await f.repository.markRead({ ids: [ID, ID.toUpperCase()] }, VIEWER), { unreadCount: 1 });
  assert.deepEqual(await f.repository.markRead({ ids: [ID] }, VIEWER), { unreadCount: 1 });
  assert.deepEqual(f.calls[0], { name: 'mark_review_activity_notifications_read', args: {
    p_ids: [ID], p_before: null, p_before_id: null, p_expected_user_id: VIEWER } });
  assert.deepEqual(f.calls[0], f.calls[1]);
});

test('mark all read keeps last-seen head cutoff and never consumes a concurrently arriving notification', async () => {
  const oldTime = TIME.replace('123456', '123455'), newTime = TIME.replace('123456', '123457');
  const rows = [{ id: COMMENT, time: oldTime, read: false }, { id: ID, time: TIME, read: false }, { id: OTHER, time: newTime, read: false }];
  const f = fixture({ response: (_name, args) => {
    for (const row of rows) if (row.time < args.p_before || row.time === args.p_before && row.id <= args.p_before_id) row.read = true;
    return { data: { unreadCount: rows.filter(row => !row.read).length } };
  } });
  const before = { createdAt: TIME, id: ID };
  assert.deepEqual(await f.repository.markRead({ before }, VIEWER), { unreadCount: 1 });
  assert.deepEqual(await f.repository.markRead({ before }, VIEWER), { unreadCount: 1 });
  assert.deepEqual(rows.map(row => row.read), [true, true, false]);
  assert.deepEqual(f.calls[0], { name: 'mark_review_activity_notifications_read', args: {
    p_ids: null, p_before: TIME, p_before_id: ID, p_expected_user_id: VIEWER } });
  assert.deepEqual(f.calls[0], f.calls[1]);
});

test('mark-read rejects empty, unbounded or ambiguous operations before touching server', async () => {
  const f = fixture();
  for (const options of [undefined, null, [], {}, { ids: [] }, { ids: ['bad'] }, { ids: ID }, { ids: Array(101).fill(ID) },
    { ids: [ID], before: { createdAt: TIME, id: ID } }, { before: { createdAt: TIME } }, { before: { id: ID } }]) {
    await assert.rejects(f.repository.markRead(options, VIEWER));
  }
  assert.equal(f.calls.length, 0); assert.equal(f.authCalls(), 0);
});

test('notification target maps current full evaluation attachments while stripping unknown data', async () => {
  const source = evaluation({ images: [{ ...image, signedUrl: 'private' }], trades: [{ ...trade, user_id: ACTOR, note: 'private' }],
    account: { ...account, sourceSnapshotId: 'private' }, secret: 'private', author: { ...notification().actor, email: 'private' },
    replyTo: { kind: 'author', id: 'original-self-review', authorId: VIEWER, nickname: '原作者', available: false, text: 'private' } });
  const f = fixture({ response: { data: target({ evaluation: source, secret: 'private' }) } });
  const result = await f.repository.readTarget(ID.toUpperCase(), VIEWER);
  assert.equal(result.notificationId, ID); assert.equal(result.commentId, COMMENT); assert.equal(result.evaluation.authorId, ACTOR);
  assert.equal(result.evaluation.createdAt, TIME); assert.equal(result.evaluation.revision, 2);
  assert.deepEqual(result.evaluation.images, [image]); assert.deepEqual(result.evaluation.account, account); assert.deepEqual(result.evaluation.trades, [trade]);
  assert.deepEqual(result.evaluation.replyTo, { kind: 'author', id: 'original-self-review', authorId: VIEWER, nickname: '原作者', available: false });
  assert.doesNotMatch(JSON.stringify(result), /private|sourceSnapshotId|signedUrl|user_id/);
  assert.deepEqual(f.calls, [{ name: 'read_review_activity_notification_target', args: { p_notification_id: ID, p_expected_user_id: VIEWER } }]);
});

test('like target can return only a post and historical score-only reply remains readable', () => {
  assert.deepEqual(mapReviewNotificationTarget(target({ commentId: null, evaluation: null }), ID),
    { notificationId: ID, postId: POST, commentId: null, evaluation: null });
  const result = mapReviewNotificationTarget(target({ evaluation: evaluation({ text: '', score: 8,
    replyTo: { kind: 'community', id: OTHER, authorId: VIEWER, nickname: '原评价者', available: true } }) }), ID);
  assert.equal(result.evaluation.text, ''); assert.equal(result.evaluation.score, 8);
});

test('target rejects mismatched identities, cross-post rows or malformed evaluation instead of exposing them', () => {
  for (const value of [null, {}, target({ notificationId: OTHER }), target({ postId: 'private:42' }),
    target({ commentId: OTHER }), target({ commentId: null }), target({ evaluation: undefined }),
    target({ evaluation: evaluation({ postId: 'log:43' }) }), target({ evaluation: evaluation({ authorId: 'bad' }) }),
    target({ evaluation: evaluation({ revision: 0 }) }), target({ evaluation: evaluation({ images: [{ ...image, path: `${VIEWER}/${ID}.png` }] }) })]) {
    assert.throws(() => mapReviewNotificationTarget(value, ID), errorCode('REVIEW_NOTIFICATION_INVALID_DATA'));
  }
});

test('withdrawn target is explicitly unavailable but malformed missing data is an error', async () => {
  for (const response of [{ data: null }, { error: { code: 'P0002' } }]) {
    await assert.rejects(fixture({ response }).repository.readTarget(ID, VIEWER), errorCode('REVIEW_NOTIFICATION_NOT_FOUND'));
  }
  for (const response of [{}, { data: undefined }]) {
    await assert.rejects(fixture({ response }).repository.readTarget(ID, VIEWER), errorCode('REVIEW_NOTIFICATION_INVALID_DATA'));
  }
  const f = fixture();
  await assert.rejects(f.repository.readTarget('invalid', VIEWER), errorCode('REVIEW_NOTIFICATION_INVALID_ID'));
  assert.equal(f.calls.length, 0);
});

test('every operation checks account before and after request and sends server expected identity', async () => {
  const operations = [r => r.fetchNotifications({}, VIEWER), r => r.fetchCount(VIEWER),
    r => r.markRead({ ids: [ID] }, VIEWER), r => r.readTarget(ID, VIEWER)];
  for (const operation of operations) {
    for (const users of [[ACTOR], [VIEWER, ACTOR], [VIEWER, null]]) {
      const f = fixture({ users });
      await assert.rejects(operation(f.repository), errorCode(users.at(-1) ? 'REVIEW_ACCOUNT_CHANGED' : 'REVIEW_AUTH_REQUIRED'));
      assert.equal(f.calls.length, users[0] === VIEWER ? 1 : 0);
      if (f.calls.length) assert.equal(f.calls[0].args.p_expected_user_id, VIEWER);
    }
    let readOrWrite = 0;
    const f = fixture({ response: (_name, args) => {
      if (args.p_expected_user_id !== ACTOR) return { error: { code: '42501' } };
      readOrWrite++; return { data: null };
    } });
    await assert.rejects(operation(f.repository), errorCode('REVIEW_NOTIFICATION_FORBIDDEN'));
    assert.equal(readOrWrite, 0, 'server JWT prevents an in-flight swap that switches back before the local post-check');
    assert.equal(f.authCalls(), 2);
  }
});

test('missing authentication or failed auth prevents all RPCs', async () => {
  for (const f of [fixture({ users: [null] }), fixture({ authError: { message: 'expired' } })]) {
    await assert.rejects(f.repository.fetchCount(VIEWER), errorCode('REVIEW_AUTH_REQUIRED'));
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  await assert.rejects(f.repository.fetchCount('invalid'), errorCode('REVIEW_AUTH_REQUIRED'));
  assert.equal(f.authCalls(), 0); assert.equal(f.calls.length, 0);
  await assert.rejects(createReviewNotificationRepository({}).fetchCount(VIEWER), errorCode('REVIEW_AUTH_REQUIRED'));
});

test('missing configuration, permissions and network failures stay visible and sanitize backend details', async () => {
  for (const [code, expected] of [['PGRST202', 'REVIEW_NOTIFICATION_NOT_CONFIGURED'], ['42P01', 'REVIEW_NOTIFICATION_NOT_CONFIGURED'],
    ['42501', 'REVIEW_NOTIFICATION_FORBIDDEN'], ['22023', 'REVIEW_NOTIFICATION_INVALID_QUERY'],
    ['P0002', 'REVIEW_NOTIFICATION_NOT_FOUND'], ['NETWORK_ERROR', 'REVIEW_NOTIFICATION_REQUEST_FAILED']]) {
    const f = fixture({ response: { error: { code, message: 'private-server-detail' } } });
    await assert.rejects(f.repository.fetchCount(VIEWER), error => error.code === expected && !error.message.includes('private'));
    assert.equal(f.authCalls(), 2);
  }
  const f = fixture(); delete f.client.rpc;
  await assert.rejects(f.repository.fetchCount(VIEWER), errorCode('REVIEW_NOTIFICATION_NOT_CONFIGURED'));
  const throwing = fixture({ response: () => { throw new Error('private-server-detail'); } });
  await assert.rejects(throwing.repository.fetchCount(VIEWER), error => error.code === 'REVIEW_NOTIFICATION_REQUEST_FAILED' && !error.message.includes('private'));
  assert.equal(throwing.authCalls(), 2);
  const authThrowing = fixture({ authThrow: true });
  await assert.rejects(authThrowing.repository.fetchCount(VIEWER), error => error.code === 'REVIEW_NOTIFICATION_REQUEST_FAILED' && !error.message.includes('private'));
  assert.equal(authThrowing.calls.length, 0);
});

test('malformed count and RPC result never report successful zero unread messages', async () => {
  for (const response of [null, { data: null }, { data: {} }, { data: { unreadCount: '0' } }]) {
    await assert.rejects(fixture({ response }).repository.fetchCount(VIEWER));
    await assert.rejects(fixture({ response }).repository.markRead({ ids: [ID] }, VIEWER));
  }
});
