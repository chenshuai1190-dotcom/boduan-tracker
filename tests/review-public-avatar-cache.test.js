import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPublicAvatarCache } from '../src/lib/reviewPublicAvatarCache.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  let time = 100, nextTimer = 0;
  const requests = [], images = [], created = [], revoked = [], timers = new Map();
  const db = { downloadReviewPublicAvatar: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })) };
  const cache = createReviewPublicAvatarCache({ now: () => time,
    createUrl: () => { const url = `blob:${created.length}`; created.push(url); return url; }, revokeUrl: url => revoked.push(url),
    makeImage: () => { const image = { decode: () => Promise.resolve() }; images.push(image); return image; },
    timeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, cancelTimeout: id => timers.delete(id), ...options });
  async function resolve(index, size = 10) { requests[index].resolve(new Blob(['a'.repeat(size)], { type: 'image/webp' })); await flush(); images.at(-1).onload(); await flush(); }
  return { cache, db, requests, images, created, revoked, timers, resolve, advance(ms) { time += ms; } };
}

test('same viewer and immutable path share download/decode and reuse the warm URL across visits', async () => {
  const h = fixture(), a = h.cache.acquire(h.db, 'a', 'photo'), b = h.cache.acquire(h.db, 'a', 'photo');
  await flush(); assert.equal(h.requests.length, 1); assert.equal(a.url, '');
  h.requests[0].resolve(new Blob(['sample'], { type: 'image/webp' })); await flush();
  assert.equal(h.cache.peek(h.db, 'a', 'photo'), '', 'unverified image bytes are not displayed');
  h.images[0].onload(); await a.promise;
  assert.equal(a.url, b.url); a.release(); b.release();
  const revisit = h.cache.acquire(h.db, 'a', 'photo');
  assert.equal(revisit.url, 'blob:0'); assert.equal(h.images.length, 1); assert.equal(h.requests.length, 1);
  revisit.release(); h.cache.clear(); assert.deepEqual(h.revoked, ['blob:0']);
});

test('new avatar paths never borrow the previous photo and failures can retry', async () => {
  const h = fixture(), a = h.cache.acquire(h.db, 'a', 'old'); await flush(); await h.resolve(0); a.release();
  const b = h.cache.acquire(h.db, 'a', 'new'); await flush();
  assert.equal(b.url, ''); assert.equal(h.cache.peek(h.db, 'a', 'new'), '');
  h.requests[1].reject(new Error('offline')); await assert.rejects(b.promise); b.release();
  const retry = h.cache.acquire(h.db, 'a', 'new'); await flush(); assert.equal(h.requests.length, 3);
  await h.resolve(2); assert.equal(retry.url, 'blob:1'); retry.release(); h.cache.clear();
});

test('account changes invalidate live leases and pending old-account responses including A-B-A', async () => {
  const h = fixture(); let invalidations = 0;
  const old = h.cache.acquire(h.db, 'a', 'old', () => invalidations++); await flush(); await h.resolve(0);
  const pending = h.cache.acquire(h.db, 'a', 'late'); await flush();
  const other = h.cache.acquire(h.db, 'b', 'old'); await flush();
  assert.equal(invalidations, 1); assert.equal(old.url, ''); assert.equal(h.cache.peek(h.db, 'a', 'old'), '');
  const back = h.cache.acquire(h.db, 'a', 'old'); await flush();
  h.requests[1].resolve(new Blob(['late'], { type: 'image/webp' }));
  h.requests[2].resolve(new Blob(['other'], { type: 'image/webp' })); await flush();
  assert.equal(h.created.length, 1, 'cancelled downloads cannot create object URLs');
  await assert.rejects(pending.promise); await assert.rejects(other.promise);
  await h.resolve(3); assert.equal(back.url, 'blob:1');
  old.release(); pending.release(); other.release(); back.release(); h.cache.clear();
});

test('logout between resolution and consumer callback cannot expose an already revoked URL', async () => {
  const h = fixture(), lease = h.cache.acquire(h.db, 'a', 'photo'); await flush(); await h.resolve(0);
  const display = lease.promise.then(() => lease.url); h.cache.clear();
  assert.equal(await display, ''); lease.release(); assert.equal(h.timers.size, 0);
});

test('expired and LRU entries release URLs; active retired leases survive only until release or logout', async () => {
  const h = fixture({ maxEntries: 1, ttl: 100 }); let invalidated = 0;
  const a = h.cache.acquire(h.db, 'a', 'one', () => invalidated++); await flush(); await h.resolve(0);
  h.advance(1); const b = h.cache.acquire(h.db, 'a', 'two'); await flush(); await h.resolve(1);
  assert.equal(h.cache.peek(h.db, 'a', 'one'), ''); assert.equal(a.url, 'blob:0', 'mounted lease still owns its URL');
  h.cache.clear(); assert.equal(invalidated, 1); assert.equal(a.url, ''); assert.equal(b.url, '');
  a.release(); b.release(); assert.deepEqual(h.revoked.sort(), ['blob:0', 'blob:1']);
  const c = h.cache.acquire(h.db, 'a', 'three'); await flush(); await h.resolve(2); c.release();
  h.advance(101); assert.equal(h.cache.peek(h.db, 'a', 'three'), '');
  const d = h.cache.acquire(h.db, 'a', 'three'); await flush(); assert.ok(h.revoked.includes('blob:2')); d.release(); h.cache.clear();
});

test('byte cap applies to retained images and decode timeout rejects late success without leaking URLs', async () => {
  const h = fixture({ maxBytes: 15 });
  const a = h.cache.acquire(h.db, 'a', 'one'); await flush(); await h.resolve(0); a.release();
  h.advance(1); const b = h.cache.acquire(h.db, 'a', 'two'); await flush(); await h.resolve(1); b.release();
  assert.equal(h.cache.peek(h.db, 'a', 'one'), ''); assert.ok(h.revoked.includes('blob:0'));
  const c = h.cache.acquire(h.db, 'a', 'three'); await flush();
  h.requests[2].resolve(new Blob(['sample'], { type: 'image/webp' })); await flush();
  let complete; h.images[2].decode = () => new Promise(resolve => { complete = resolve; }); h.images[2].onload(); await flush();
  [...h.timers.values()][0](); complete(); await assert.rejects(c.promise); await flush();
  assert.equal(c.url, ''); assert.equal(h.cache.peek(h.db, 'a', 'three'), '');
  assert.equal(h.revoked.filter(url => url === 'blob:2').length, 1); c.release(); h.cache.clear();
});

test('invalid bytes are rejected and separate repository clients never reuse one another’s avatar', async () => {
  const h = fixture(), first = h.cache.acquire(h.db, 'a', 'photo'); await flush();
  h.requests[0].resolve(new Blob(['bad'], { type: 'text/html' })); await assert.rejects(first.promise); first.release();
  assert.equal(h.created.length, 0);
  const good = h.cache.acquire(h.db, 'a', 'photo'); await flush(); await h.resolve(1); good.release();
  const db2 = { ...h.db }, separate = h.cache.acquire(db2, 'a', 'photo'); await flush();
  assert.equal(separate.url, ''); assert.equal(h.requests.length, 3); separate.release(); h.cache.clear();
});

test('cache capacity never cancels a currently displayed cold avatar', async () => {
  const h = fixture({ maxEntries: 1 });
  const a = h.cache.acquire(h.db, 'a', 'one'), b = h.cache.acquire(h.db, 'a', 'two'); await flush();
  await h.resolve(0); await h.resolve(1);
  assert.equal(await a.promise, 'blob:0'); assert.equal(a.url, 'blob:0'); assert.equal(b.url, 'blob:1');
  a.release(); b.release(); h.cache.clear(); assert.deepEqual(h.revoked.sort(), ['blob:0', 'blob:1']);
});
