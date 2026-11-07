import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewIdentityCache } from '../src/lib/reviewIdentityCache.js';
import { createReviewIdentityStorage } from '../src/lib/reviewIdentityStorage.js';

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
  clock = 86400001; const wait = deferred(); request = wait.promise;
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

const ownerId = '11111111-1111-4111-8111-111111111111';
const photoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const persistedPhoto = { nickname: 'Alice', avatarKey: 'fox', avatarPath: `${ownerId}/33333333-3333-4333-8333-333333333333.png`, avatarDataUrl: photoData };
function persistentFixture() {
  const values = new Map(); let clock = 100;
  const disk = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const storage = createReviewIdentityStorage({ storage: disk, now: () => clock });
  return { values, storage, tick: value => { clock = value; }, cache: load => createReviewIdentityCache({ load, storage, now: () => clock }) };
}

test('cold reopening restores both nickname and image before any fetch; reuse keeps original refresh date', async () => {
  const f = persistentFixture(); let calls = 0;
  const load = async () => { calls++; return persistedPhoto; };
  const first = f.cache(load); first.setOwner(ownerId); await first.fetch(ownerId);
  const raw = [...f.values.values()][0];
  f.tick(3600100);
  const reopened = f.cache(load); reopened.setOwner(ownerId);
  assert.deepEqual(reopened.peek(ownerId), persistedPhoto);
  assert.deepEqual(await reopened.fetch(ownerId), persistedPhoto);
  assert.equal(calls, 1);
  assert.equal([...f.values.values()][0], raw, 'opening the page must not extend cache freshness');
  f.tick(86400101);
  assert.deepEqual(reopened.peek(ownerId), persistedPhoto, 'a stale snapshot remains visible during refresh');
  await reopened.fetch(ownerId); assert.equal(calls, 2);
});

test('an edit invalidation survives reload and signout removes the private snapshot', async () => {
  const f = persistentFixture(); const first = f.cache(async () => persistedPhoto);
  first.setOwner(ownerId); await first.fetch(ownerId); first.invalidate();
  const updated = { ...persistedPhoto, nickname: 'Updated Alice' }; let calls = 0;
  const reopened = f.cache(async () => { calls++; return updated; }); reopened.setOwner(ownerId);
  assert.equal(reopened.peek(ownerId).nickname, 'Alice');
  assert.equal((await reopened.fetch(ownerId)).nickname, 'Updated Alice'); assert.equal(calls, 1);
  reopened.setOwner(null); assert.equal(f.values.size, 0);
  assert.equal(reopened.peek(ownerId), null);
});

test('late image downloads cannot repopulate storage after an account switch', async () => {
  const f = persistentFixture(); const wait = deferred();
  const cache = f.cache(() => wait.promise); cache.setOwner(ownerId);
  const pending = cache.fetch(ownerId); await Promise.resolve();
  cache.setOwner('22222222-2222-4222-8222-222222222222');
  wait.resolve(persistedPhoto); await assert.rejects(pending, /已更新/);
  assert.equal(f.values.size, 0); assert.equal(cache.peek(ownerId), null);
});

test('restored custom metadata without image bytes cannot masquerade as a fresh complete cache', async () => {
  const f = persistentFixture();
  f.storage.write(ownerId, { identity: { ...persistedPhoto, avatarDataUrl: '' }, freshUntil: 86400100, savedAt: 100 });
  let calls = 0; const cache = f.cache(async () => { calls++; return persistedPhoto; }); cache.setOwner(ownerId);
  assert.equal(cache.peek(ownerId).nickname, 'Alice');
  assert.equal((await cache.fetch(ownerId)).avatarDataUrl, photoData); assert.equal(calls, 1);
});
