import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewIdentityStorage, isReviewAvatarDataUrl } from '../src/lib/reviewIdentityStorage.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const path = `${owner}/33333333-3333-4333-8333-333333333333.png`;
const day = 86400000;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')}`;
const webp = `data:image/webp;base64,${Buffer.from('RIFFxxxxWEBP').toString('base64')}`;
const entry = (overrides = {}) => ({ identity: { nickname: '复盘用户', avatarKey: 'fox', avatarPath: path, avatarDataUrl: png }, freshUntil: day, ...overrides });
function fixture() {
  const values = new Map([['unrelated', 'keep']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let clock = 0;
  return { values, storage, cache: createReviewIdentityStorage({ storage, now: () => clock }), tick: value => { clock = value; }, key: () => [...values.keys()].find(key => key !== 'unrelated') };
}

test('snapshot roundtrip restores nickname and image bytes without persisting signed links or unrelated fields', () => {
  const f = fixture();
  assert.equal(f.cache.write(owner, entry({ identity: { ...entry().identity, avatarUrl: 'https://private.test/?token=secret', avatarExpiresAt: day, token: 'secret', email: 'private@example.test' } })), true);
  assert.deepEqual(f.cache.read(owner), { ...entry(), savedAt: 0 });
  const encoded = f.values.get(f.key());
  assert.doesNotMatch(encoded, /avatarUrl|avatarExpiresAt|secret|email/);
  const reopened = createReviewIdentityStorage({ storage: f.storage, now: () => 1000 });
  assert.deepEqual(reopened.read(owner), { ...entry(), savedAt: 0 });
});

test('a single snapshot is isolated by owner and only its own key is removed', () => {
  const f = fixture(); f.cache.write(owner, entry());
  assert.equal(f.cache.read(other), null);
  f.cache.remove(other); assert.ok(f.cache.read(owner));
  assert.equal(f.cache.write(other, entry()), false, 'another owner cannot use the first owner image path');
  f.cache.write(other, entry({ identity: { nickname: '其他用户', avatarKey: 'blue', avatarPath: null } }));
  assert.equal(f.cache.read(owner), null);
  assert.equal(f.cache.read(other).identity.nickname, '其他用户');
  f.cache.clear(); assert.deepEqual([...f.values], [['unrelated', 'keep']]);
});

test('stale snapshots stay readable for thirty days but invalidation does not renew freshness or age', () => {
  const f = fixture(); f.cache.write(owner, entry());
  f.tick(day + 1); const previous = f.cache.read(owner);
  assert.equal(previous.freshUntil, day);
  f.cache.write(owner, { ...previous, freshUntil: 0 });
  assert.equal(f.cache.read(owner).savedAt, 0);
  assert.equal(f.cache.read(owner).freshUntil, 0);
  f.tick(30 * day); assert.ok(f.cache.read(owner));
  f.tick(30 * day + 1); assert.equal(f.cache.read(owner), null);
});

test('future timestamps, unbounded freshness, malformed envelopes and unknown image states are rejected', () => {
  const f = fixture();
  for (const value of [entry({ savedAt: 1 }), entry({ savedAt: -1 }), entry({ freshUntil: day + 1 }), entry({ freshUntil: -1 }), entry({ savedAt: NaN }), entry({ identity: { nickname: '有效昵称', avatarKey: 'fox' } }), entry({ identity: { ...entry().identity, nickname: '' } }), entry({ identity: { ...entry().identity, nickname: {} } }), entry({ identity: { ...entry().identity, avatarKey: 'invalid' } }), entry({ identity: { ...entry().identity, avatarPath: null } })]) {
    assert.equal(f.cache.write(owner, value), false);
  }
  assert.equal(f.cache.write('invalid', entry()), false);
  f.cache.write(owner, entry());
  const key = f.key();
  for (const raw of ['{', 'null', '[]', JSON.stringify({ version: 2, ownerId: owner, ...entry(), savedAt: 0 }), JSON.stringify({ version: 1, ownerId: other, ...entry(), savedAt: 0 }), JSON.stringify({ version: 1, ownerId: owner, ...entry({ freshUntil: day + 1 }), savedAt: 0 })]) {
    f.values.set(key, raw); assert.equal(f.cache.read(owner), null);
  }
});

test('storage denial and quota errors fall back safely without throwing or touching unrelated data', () => {
  const fail = () => { throw new Error('storage unavailable'); };
  const cache = createReviewIdentityStorage({ storage: { getItem: fail, setItem: fail, removeItem: fail }, now: () => 0 });
  assert.equal(cache.read(owner), null); assert.equal(cache.write(owner, entry()), false);
  assert.doesNotThrow(() => cache.remove(owner)); assert.doesNotThrow(() => cache.clear());
  const unavailable = createReviewIdentityStorage({ storage: null, now: () => 0 });
  assert.equal(unavailable.read(owner), null); assert.equal(unavailable.write(owner, entry()), false);
});

test('only bounded raster data with matching magic bytes is accepted', () => {
  for (const value of [png, jpeg, webp]) assert.equal(isReviewAvatarDataUrl(value), true);
  const html = `data:image/png;base64,${Buffer.from('<svg onload="bad()"></svg>').toString('base64')}`;
  for (const value of [null, '', 'blob:example', 'https://example.test/avatar.png', 'data:image/svg+xml;base64,PHN2Zy8+', html, png.replace('image/png', 'image/jpeg'), png + '\n', png.slice(0, -1), 'data:image/png;base64,!!!!', `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`]) assert.equal(isReviewAvatarDataUrl(value), false);
  const f = fixture();
  assert.equal(f.cache.write(owner, entry({ identity: { ...entry().identity, avatarDataUrl: html } })), false);
});
