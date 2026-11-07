import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReviewIdentityCache } from '../src/lib/reviewIdentityCache.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const identity = nickname => ({ nickname, avatarKey: 'fox', avatarPath: null, avatarUrl: '' });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
let fixtureNumber = 0;

async function fixture() {
  let authListener, currentUser = alice, nextAuth = null;
  const avatars = new Map(), profiles = new Map([[alice, identity('Alice')], [bob, identity('Bob')]]);
  const calls = [], authCalls = [];
  const injected = {
    createReviewIdentityCache,
    supabase: { auth: {
      onAuthStateChange(listener) { authListener = listener; },
      async getUser() { authCalls.push(true); return nextAuth || { data: { user: currentUser ? { id: currentUser } : null }, error: null }; },
    } },
    createReviewIdentityStorage: () => undefined,
    createReviewIdentityLoader(client) { return async userId => {
      const { data, error } = await client.auth.getUser();
      if (error || data?.user?.id !== userId) throw new Error('账户已更新');
      calls.push({ id: userId }); return profiles.get(userId);
    }; },
    subscribeCommunityAvatar(userId, listener) {
      avatars.set(userId, listener);
      return () => { if (avatars.get(userId) === listener) avatars.delete(userId); };
    },
  };
  const key = `__reviewIdentityDbFixture${++fixtureNumber}`;
  globalThis[key] = injected;
  const source = readFileSync(new URL('../src/lib/reviewIdentityDb.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('import.meta.env.VITE_SUPABASE_URL', "'https://avatar.test'");
  const module = await import(`data:text/javascript;base64,${Buffer.from(`const { supabase, createReviewIdentityLoader, createReviewIdentityStorage, subscribeCommunityAvatar, createReviewIdentityCache } = globalThis[${JSON.stringify(key)}];\n${source}`).toString('base64')}`);
  delete globalThis[key];
  return { module, calls, authCalls, profiles, avatars,
    auth(userId, event = 'SIGNED_IN') { currentUser = userId; authListener(event, userId ? { user: { id: userId } } : null); },
    pauseAuth(promise) { nextAuth = promise; },
    resumeAuth() { nextAuth = null; },
  };
}

test('review identity authenticates before cold fetch and accepts delayed initial session for the same owner', async () => {
  const f = await fixture();
  assert.equal(f.module.readCachedReviewIdentity(alice), null);
  const loaded = await f.module.fetchReviewIdentity(alice);
  assert.equal(loaded.nickname, 'Alice');
  assert.deepEqual(f.calls, [{ id: alice }]);
  f.auth(alice, 'INITIAL_SESSION');
  assert.equal(f.module.readCachedReviewIdentity(alice), loaded);
  const authCount = f.authCalls.length;
  await f.module.fetchReviewIdentity(alice);
  assert.equal(f.calls.length, 1);
  assert.equal(f.authCalls.length, authCount, 'warm entry must not make another auth request');
});

test('same-owner token refresh preserves identity while avatar save invalidates its freshness', async () => {
  const f = await fixture(); f.auth(alice, 'INITIAL_SESSION');
  const first = await f.module.fetchReviewIdentity(alice);
  let notifications = 0;
  const unsubscribe = f.module.subscribeReviewIdentity(alice, () => notifications++);
  f.auth(alice, 'TOKEN_REFRESHED');
  assert.equal(f.module.readCachedReviewIdentity(alice), first);
  await f.module.fetchReviewIdentity(alice); assert.equal(f.calls.length, 1);
  assert.equal(notifications, 0);
  const next = identity('Updated Alice'); f.profiles.set(alice, next);
  f.avatars.get(alice)();
  assert.equal(notifications, 1);
  assert.equal(f.module.readCachedReviewIdentity(alice), first, 'refresh retains current visible profile');
  assert.equal(await f.module.fetchReviewIdentity(alice), next);
  assert.equal(f.calls.length, 2); unsubscribe();
});

test('a late getUser response cannot restore an account after switching or signing out', async () => {
  for (const nextOwner of [bob, null]) {
    const f = await fixture();
    const wait = deferred(); f.pauseAuth(wait.promise);
    const pending = f.module.fetchReviewIdentity(alice);
    f.auth(nextOwner, nextOwner ? 'SIGNED_IN' : 'SIGNED_OUT');
    assert.equal(f.module.readCachedReviewIdentity(alice), null);
    assert.equal(f.avatars.has(alice), false);
    wait.resolve({ data: { user: { id: alice } }, error: null });
    await assert.rejects(pending, /账户已更新/);
    assert.equal(f.calls.length, 0, 'late authentication must not dispatch an old-owner profile read');
    assert.equal(f.module.readCachedReviewIdentity(alice), null);
    if (nextOwner) {
      f.resumeAuth();
      assert.equal((await f.module.fetchReviewIdentity(bob)).nickname, 'Bob');
      assert.equal(f.avatars.has(bob), true);
    }
  }
});

test('expired or invalidated reads authenticate while keeping the last display during failure', async () => {
  const f = await fixture(); f.auth(alice);
  const first = await f.module.fetchReviewIdentity(alice);
  f.avatars.get(alice)();
  f.pauseAuth(Promise.resolve({ data: { user: null }, error: new Error('offline') }));
  await assert.rejects(f.module.fetchReviewIdentity(alice), /账户已更新/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.module.readCachedReviewIdentity(alice), first, 'the previous visible same-owner identity remains available');
});
