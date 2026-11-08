import assert from 'node:assert/strict';
import test from 'node:test';
import { readReviewAudiencePreference, writeReviewAudiencePreference } from '../src/lib/reviewAudiencePreferences.js';

function fixture() {
  const values = new Map(), reads = [], writes = [];
  const storage = {
    getItem(key) { reads.push(key); return values.get(key) ?? null; },
    setItem(key, value) { writes.push({ key, value }); values.set(key, value); },
  };
  return { storage, values, reads, writes };
}

test('first use defaults public and explicit choices remain independent across accounts', () => {
  const f = fixture();
  for (const kind of ['feedScope', 'publishVisibility']) {
    assert.equal(readReviewAudiencePreference('user-a', kind, f.storage), 'public');
  }
  assert.equal(writeReviewAudiencePreference('user-a', 'feedScope', 'private', f.storage), true);
  assert.equal(readReviewAudiencePreference('user-a', 'feedScope', f.storage), 'private');
  assert.equal(readReviewAudiencePreference('user-a', 'publishVisibility', f.storage), 'public');
  assert.equal(readReviewAudiencePreference('user-b', 'feedScope', f.storage), 'public');
  assert.equal(writeReviewAudiencePreference('user-b', 'publishVisibility', 'private', f.storage), true);
  assert.equal(readReviewAudiencePreference('user-a', 'publishVisibility', f.storage), 'public');
  assert.equal(readReviewAudiencePreference('user-b', 'publishVisibility', f.storage), 'private');
  assert.equal(f.values.size, 2);
  assert.notEqual(f.writes[0].key, f.writes[1].key);
});

test('writing either audience keeps the other selection and persists no content or arbitrary fields', () => {
  const f = fixture();
  writeReviewAudiencePreference('user-a', 'feedScope', 'private', f.storage);
  const key = f.writes[0].key;
  f.values.set(key, JSON.stringify({ feedScope: 'private', text: 'private body', account: { balance: 123 }, other: 'private' }));
  writeReviewAudiencePreference('user-a', 'publishVisibility', 'private', f.storage);
  assert.deepEqual(JSON.parse(f.values.get(key)), { feedScope: 'private', publishVisibility: 'private' });
  writeReviewAudiencePreference('user-a', 'feedScope', 'public', f.storage);
  assert.deepEqual(JSON.parse(f.values.get(key)), { feedScope: 'public', publishVisibility: 'private' });
  writeReviewAudiencePreference('user-a', 'publishVisibility', 'public', f.storage);
  assert.deepEqual(JSON.parse(f.values.get(key)), { feedScope: 'public', publishVisibility: 'public' });
});

test('missing account, unknown preference kinds and invalid write values never access storage', () => {
  const f = fixture();
  for (const userId of [undefined, null, '', '   ', 123, {}]) {
    assert.equal(readReviewAudiencePreference(userId, 'feedScope', f.storage), 'public');
    assert.equal(writeReviewAudiencePreference(userId, 'publishVisibility', 'private', f.storage), false);
  }
  for (const kind of ['text', '__proto__', 'constructor', '', null, undefined]) {
    assert.equal(readReviewAudiencePreference('user-a', kind, f.storage), 'public');
    assert.equal(writeReviewAudiencePreference('user-a', kind, 'private', f.storage), false);
  }
  for (const value of ['friends', '', true, {}, null, undefined]) {
    assert.equal(writeReviewAudiencePreference('user-a', 'feedScope', value, f.storage), false);
  }
  assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
});

test('malformed stored data falls back public and a new valid choice can repair it', () => {
  const f = fixture();
  writeReviewAudiencePreference('user-a', 'feedScope', 'private', f.storage);
  const key = f.writes[0].key;
  for (const raw of ['broken-json', 'null', '[]', '123', '"private"', '{"feedScope":"friends","publishVisibility":true}']) {
    f.values.set(key, raw);
    for (const kind of ['feedScope', 'publishVisibility']) {
      assert.equal(readReviewAudiencePreference('user-a', kind, f.storage), 'public');
    }
    assert.equal(writeReviewAudiencePreference('user-a', 'feedScope', 'private', f.storage), true);
    assert.deepEqual(JSON.parse(f.values.get(key)), { feedScope: 'private' });
  }
});

test('storage failures do not prevent audience selection', () => {
  for (const storage of [null, {}, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } },
    { getItem: () => '{"feedScope":"private"}', setItem() { throw new Error('quota exceeded'); } }]) {
    assert.doesNotThrow(() => readReviewAudiencePreference('user-a', 'publishVisibility', storage));
    assert.equal(readReviewAudiencePreference('user-a', 'publishVisibility', storage), 'public');
    assert.equal(writeReviewAudiencePreference('user-a', 'publishVisibility', 'private', storage), false);
  }
  let writes = 0;
  const unreadable = { getItem() { throw new Error('read disabled'); }, setItem() { writes++; } };
  assert.equal(writeReviewAudiencePreference('user-a', 'feedScope', 'private', unreadable), false);
  assert.equal(writes, 0, 'a failed read must not overwrite the other saved preference');
});

test('default browser storage access is guarded even when its property getter throws', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const f = fixture();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: f.storage });
    assert.equal(writeReviewAudiencePreference('user-a', 'publishVisibility', 'private'), true);
    assert.equal(readReviewAudiencePreference('user-a', 'publishVisibility'), 'private');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('storage disabled'); } });
    assert.equal(readReviewAudiencePreference('user-a', 'feedScope'), 'public');
    assert.equal(writeReviewAudiencePreference('user-a', 'feedScope', 'private'), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
