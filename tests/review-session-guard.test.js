import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewSessionGuard } from '../src/lib/reviewSessionGuard.js';
import { createReviewPublicRepository } from '../src/lib/reviewPublicRepository.js';
import { createReviewInteractionRepository } from '../src/lib/reviewInteractionRepository.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const IMAGE = `${A}/33333333-3333-4333-8333-333333333333.jpg`;
const feed = { posts: [], hasMore: false, nextCursor: null };
const unread = { unreadCount: 1, cursor: '12' };
const sessionFor = (id = A, token = 'session-token') => ({ access_token: token, user: { id } });
function fixture() {
  let session = sessionFor();
  const listeners = new Set();
  const calls = { sessions: 0, users: 0, subscriptions: 0, rpc: [], downloads: [] };
  const hooks = {};
  const client = {
    auth: {
      async getSession() {
        calls.sessions++;
        if (hooks.session) return hooks.session(calls.sessions);
        return { data: { session } };
      },
      async getUser() { calls.users++; return { data: { user: session?.user || null } }; },
      onAuthStateChange(listener) {
        calls.subscriptions++;
        listeners.add(listener);
        if (hooks.subscribe) hooks.subscribe(listener);
        return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
      },
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (hooks.rpc) return hooks.rpc(name, args);
      return { data: name === 'fetch_review_public_feed_v2' ? feed : unread };
    },
    storage: { from(bucket) { return { async download(path) {
      calls.downloads.push({ bucket, path });
      if (hooks.download) return hooks.download();
      return { data: new Blob(['image'], { type: 'image/jpeg' }) };
    } }; } },
  };
  return {
    client, calls, hooks,
    setSession: value => { session = value; },
    emit(event, value) { session = value; for (const listener of listeners) listener(event, value); },
  };
}

test('public feed, threads/unread and storage share one observer and remove all routine getUser round trips', async () => {
  const f = fixture();
  const publicRepo = createReviewPublicRepository(f.client);
  const interactionRepo = createReviewInteractionRepository(f.client);
  assert.deepEqual(await publicRepo.fetchFeed({}, A), feed);
  assert.deepEqual(await interactionRepo.fetchFeedUnread(A), unread);
  await publicRepo.downloadAvatar(IMAGE, A);
  assert.equal(f.calls.subscriptions, 1);
  assert.equal(f.calls.sessions, 6, 'session is still checked before and after every request');
  assert.equal(f.calls.users, 0, 'three operations avoid six remote /auth/v1/user calls');
  assert.equal(f.calls.rpc.length, 2);
  assert.equal(f.calls.downloads.length, 1);
  assert.ok(f.calls.rpc.every(call => call.args.p_expected_user_id === A));
});

test('same-account token refresh and repeated initial/sign-in events preserve a valid request', async () => {
  const f = fixture();
  f.hooks.subscribe = listener => listener('INITIAL_SESSION', sessionFor());
  f.hooks.rpc = () => {
    f.emit('TOKEN_REFRESHED', sessionFor(A, 'refreshed-token'));
    f.emit('SIGNED_IN', sessionFor(A, 'refreshed-token'));
    f.emit('USER_UPDATED', sessionFor(A, 'refreshed-token'));
    return { data: feed };
  };
  assert.deepEqual(await createReviewPublicRepository(f.client).fetchFeed({}, A), feed);
  assert.equal(f.calls.users, 0);
});

test('A to B to A during a public request rejects the response even when both session reads would see A', async () => {
  const f = fixture();
  f.hooks.rpc = () => {
    f.emit('SIGNED_IN', sessionFor(B));
    f.emit('SIGNED_IN', sessionFor(A));
    return { data: feed };
  };
  await assert.rejects(createReviewPublicRepository(f.client).fetchFeed({}, A), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.equal(f.calls.rpc[0].args.p_expected_user_id, A);
  assert.equal(f.calls.users, 0);
});

test('sign-out then sign-in to the same account invalidates in-flight unread acknowledgements', async () => {
  const f = fixture();
  f.hooks.rpc = () => {
    f.emit('SIGNED_OUT', null);
    f.emit('SIGNED_IN', sessionFor(A));
    return { data: unread };
  };
  await assert.rejects(createReviewInteractionRepository(f.client).markFeedSeen('12', A), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.deepEqual(f.calls.rpc[0].args, { p_cursor: '12', p_expected_user_id: A });
});

test('identity changes while the initial or final getSession is pending are rejected', async () => {
  for (const boundary of [1, 2]) {
    const f = fixture();
    f.hooks.session = count => {
      if (count === boundary) {
        f.emit('SIGNED_IN', sessionFor(B));
        f.emit('SIGNED_IN', sessionFor(A));
      }
      return { data: { session: sessionFor() } };
    };
    await assert.rejects(createReviewPublicRepository(f.client).fetchFeed({}, A), { code: 'REVIEW_ACCOUNT_CHANGED' });
    assert.equal(f.calls.rpc.length, boundary === 1 ? 0 : 1);
  }
});

test('the synchronous pre-dispatch check rejects a ticket after an account changes between awaited steps', async () => {
  const f = fixture(), guard = createReviewSessionGuard(f.client);
  const ticket = await guard.begin(A);
  f.emit('SIGNED_OUT', null);
  f.emit('SIGNED_IN', sessionFor(A));
  assert.throws(() => guard.assertCurrent(ticket), { code: 'REVIEW_ACCOUNT_CHANGED' });
  await assert.rejects(guard.verify(ticket), { code: 'REVIEW_ACCOUNT_CHANGED' });
});

test('an identity change observed by one repository invalidates tickets held by another', async () => {
  const f = fixture(), first = createReviewSessionGuard(f.client), second = createReviewSessionGuard(f.client);
  const oldTicket = await first.begin(A);
  f.setSession(sessionFor(B)); // Storage changes can be seen before the auth event.
  await second.begin(B);
  f.setSession(sessionFor(A));
  await second.begin(A);
  await assert.rejects(first.verify(oldTicket), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.equal(f.calls.subscriptions, 1);
});

test('supported clients fail closed on missing, malformed or errored sessions without getUser fallback', async () => {
  for (const response of [undefined, {}, { data: {} }, { data: { session: null } },
    { data: { session: {} } }, { data: { session: { user: { id: A } } } },
    { data: { session: sessionFor(A, '') } }, { data: { session: sessionFor(A, '   ') } },
    { data: { session: sessionFor('') } }, { data: { session: sessionFor() }, error: { message: 'invalid' } }]) {
    const f = fixture();
    f.hooks.session = () => response;
    await assert.rejects(createReviewPublicRepository(f.client).fetchFeed({}, A), { code: 'REVIEW_AUTH_REQUIRED' });
    assert.equal(f.calls.rpc.length, 0);
    assert.equal(f.calls.users, 0);
  }
});

test('missing sessions and changed accounts after a request never return response data', async () => {
  for (const [session, code] of [[null, 'REVIEW_AUTH_REQUIRED'], [sessionFor(B), 'REVIEW_ACCOUNT_CHANGED']]) {
    const f = fixture();
    f.hooks.rpc = () => { f.setSession(session); return { data: feed }; };
    await assert.rejects(createReviewPublicRepository(f.client).fetchFeed({}, A), { code });
    assert.equal(f.calls.rpc.length, 1);
    assert.equal(f.calls.users, 0);
  }
});

test('a missing session observed by another operation invalidates older tickets even before a sign-out event arrives', async () => {
  const f = fixture(), first = createReviewSessionGuard(f.client), second = createReviewSessionGuard(f.client);
  const oldTicket = await first.begin(A);
  f.setSession(null);
  await assert.rejects(second.begin(A), { code: 'REVIEW_AUTH_REQUIRED' });
  f.setSession(sessionFor(A));
  await second.begin(A);
  await assert.rejects(first.verify(oldTicket), { code: 'REVIEW_ACCOUNT_CHANGED' });
});

test('invalid expected identities and a different signed-in account are rejected before RPC', async () => {
  for (const id of [null, '', ' ', B]) {
    const f = fixture();
    await assert.rejects(createReviewPublicRepository(f.client).fetchFeed({}, id), { code: id === B ? 'REVIEW_ACCOUNT_CHANGED' : 'REVIEW_AUTH_REQUIRED' });
    assert.equal(f.calls.rpc.length, 0);
  }
  const f = fixture();
  await assert.rejects(createReviewInteractionRepository(f.client).fetchFeedUnread('not-a-uuid'), { code: 'REVIEW_AUTH_REQUIRED' });
  assert.equal(f.calls.sessions, 0);
});

test('session transport failures are sanitized without remote-auth fallback', async () => {
  const f = fixture();
  f.hooks.session = () => { throw new Error('sensitive session transport details'); };
  await assert.rejects(createReviewPublicRepository(f.client).fetchFeed({}, A), error => error.code === 'REVIEW_PUBLIC_REQUEST_FAILED' && !error.message.includes('sensitive'));
  assert.equal(f.calls.users, 0);
  assert.equal(f.calls.rpc.length, 0);
});

test('clients missing either session capability keep strict pre/post remote user checks', async () => {
  for (const capability of ['getSession', 'onAuthStateChange', 'invalidSubscription', 'throwingSubscription']) {
    const f = fixture();
    if (capability === 'invalidSubscription') f.client.auth.onAuthStateChange = () => ({});
    else if (capability === 'throwingSubscription') f.client.auth.onAuthStateChange = () => { throw new Error('not supported'); };
    else delete f.client.auth[capability];
    const repo = createReviewPublicRepository(f.client);
    assert.deepEqual(await repo.fetchFeed({}, A), feed);
    assert.equal(f.calls.users, 2);
    assert.equal(f.calls.sessions, 0);
    f.hooks.rpc = () => { f.setSession(sessionFor(B)); return { data: feed }; };
    await assert.rejects(repo.fetchFeed({}, A), { code: 'REVIEW_ACCOUNT_CHANGED' });
    assert.equal(f.calls.users, 4);
  }
});

test('storage downloads reject switched or restarted sessions and never release the fetched blob', async () => {
  for (const next of ['other-user', 'same-user']) {
    const f = fixture();
    f.hooks.download = () => {
      f.emit('SIGNED_OUT', null);
      f.emit('SIGNED_IN', sessionFor(next === 'other-user' ? B : A));
      return { data: new Blob(['private-image'], { type: 'image/jpeg' }) };
    };
    await assert.rejects(createReviewPublicRepository(f.client).downloadImage(IMAGE, A), { code: 'REVIEW_ACCOUNT_CHANGED' });
    assert.equal(f.calls.downloads.length, 1);
    assert.equal(f.calls.users, 0);
  }
});

test('replacing the auth client cannot validate an existing session ticket', async () => {
  const f = fixture(), guard = createReviewSessionGuard(f.client);
  const ticket = await guard.begin(A);
  f.client.auth = fixture().client.auth;
  await assert.rejects(guard.verify(ticket), { code: 'REVIEW_ACCOUNT_CHANGED' });
});
