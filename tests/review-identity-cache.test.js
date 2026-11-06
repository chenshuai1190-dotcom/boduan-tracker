import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewIdentityCache } from '../src/lib/reviewIdentityCache.js';

const alice = { nickname: 'Alice', avatarKey: 'fox', avatarPath: 'alice/photo', avatarUrl: 'signed-one', avatarExpiresAt: Number.MAX_SAFE_INTEGER };
const bob = { nickname: 'Bob', avatarKey: 'blue', avatarPath: null, avatarUrl: '' };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('returning to journal reuses identity synchronously and shares one in-flight request', async () => {
  const wait = deferred(); let calls = 0, clock = 100;
  const cache = createReviewIdentityCache({ load: () => { calls++; return wait.promise; }, now: () => clock });
  cache.setOwner('alice');
  const first = cache.fetch('alice'); assert.equal(cache.fetch('alice'), first);
  wait.resolve(alice); await first;
  assert.equal(cache.peek('alice'), alice); assert.equal(await cache.fetch('alice'), alice);
  clock += 299999; await cache.fetch('alice'); assert.equal(calls, 1);
});

test('expired refresh and failure retain the visible identity without extending freshness', async () => {
  let clock = 0, request = Promise.resolve(alice), calls = 0;
  const cache = createReviewIdentityCache({ load: () => { calls++; return request; }, now: () => clock });
  cache.setOwner('alice'); await cache.fetch('alice');
  clock = 300001; const wait = deferred(); request = wait.promise;
  const refresh = cache.fetch('alice'); assert.equal(cache.peek('alice'), alice);
  wait.reject(new Error('offline')); await assert.rejects(refresh, /offline/);
  assert.equal(cache.peek('alice'), alice);
  request = Promise.resolve({ ...alice, avatarUrl: 'signed-two' });
  assert.equal((await cache.fetch('alice')).avatarUrl, 'signed-two'); assert.equal(calls, 3);
});

test('account switching and signout clear visible identity and reject late responses', async () => {
  let request = Promise.resolve(alice);
  const cache = createReviewIdentityCache({ load: () => request });
  cache.setOwner('alice'); await cache.fetch('alice');
  assert.equal(cache.peek('bob'), null);
  cache.invalidate(); const wait = deferred(); request = wait.promise;
  const old = cache.fetch('alice'); await Promise.resolve();
  cache.setOwner('bob'); assert.equal(cache.peek('alice'), null); assert.equal(cache.peek('bob'), null);
  wait.resolve(alice); await assert.rejects(old, /已更新/);
  request = Promise.resolve(bob); await cache.fetch('bob'); assert.equal(cache.peek('bob'), bob);
  cache.setOwner(null); assert.equal(cache.peek('bob'), null); await assert.rejects(cache.fetch('bob'));
});

test('profile edits invalidate old requests but preserve current display until replacement is ready', async () => {
  let request = Promise.resolve(alice), notices = 0;
  const cache = createReviewIdentityCache({ load: () => request });
  cache.setOwner('alice'); await cache.fetch('alice');
  const unsubscribe = cache.subscribe(() => notices++);
  cache.invalidate(); assert.equal(cache.peek('alice'), alice);
  const wait = deferred(); request = wait.promise; const old = cache.fetch('alice'); await Promise.resolve();
  cache.invalidate(); request = Promise.resolve({ ...alice, nickname: 'New name', avatarUrl: 'new-url' });
  const latest = await cache.fetch('alice');
  wait.resolve(alice); await assert.rejects(old, /已更新/);
  assert.equal(cache.peek('alice'), latest); assert.equal(notices, 2); unsubscribe();
});

test('unknown or unavailable custom image is not treated as a fresh preset identity', async () => {
  let calls = 0;
  const cache = createReviewIdentityCache({ load: async () => { calls++; return { ...alice, avatarUrl: '' }; } });
  cache.setOwner('alice'); await cache.fetch('alice'); await cache.fetch('alice');
  assert.equal(calls, 2); assert.equal(cache.peek('alice').avatarPath, alice.avatarPath);
});

test('identity reuse never extends the actual avatar signature deadline', async () => {
  let clock = 100, calls = 0;
  const cache = createReviewIdentityCache({ now: () => clock, load: async () => { calls++; return { ...alice, avatarExpiresAt: 200 }; } });
  cache.setOwner('alice'); await cache.fetch('alice');
  clock = 199; await cache.fetch('alice'); assert.equal(calls, 1);
  clock = 201; assert.equal(cache.peek('alice').avatarUrl, '');
  await cache.fetch('alice'); assert.equal(calls, 2);
});
