import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const object = '33333333-3333-4333-8333-333333333333';
const object2 = '44444444-4444-4444-8444-444444444444';
const photo = 'data:image/png;base64,iVBORw0KGgo=';
const otherPhoto = 'data:image/jpeg;base64,/9j/4A==';
const identity = (overrides = {}) => ({ nickname: 'Alice 当前昵称', avatarKey: 'fox', avatarPath: `${alice}/${object}.webp`, avatarDataUrl: photo, ...overrides });
const walk = value => React.isValidElement(value) ? [value, ...walk(value.props.children)] : Array.isArray(value) ? value.flatMap(walk) : [];
const words = value => React.isValidElement(value) ? words(value.props.children) : Array.isArray(value) ? value.map(words).join('') : String(value ?? '');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let fixtureId = 0;

// Execute the production component with deterministic React hook scheduling;
// requests are deliberately allowed to complete after cleanup/account changes.
async function componentHarness(file, stubs = {}) {
  let slots = [], cursor = 0, effects = [];
  const fixture = {
    ...stubs,
    React: {
      ...React,
      memo: component => component,
      useState(initial) {
        const index = cursor++;
        slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
        const slot = slots[index];
        return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
      },
      useRef(initial) { return slots[cursor++] ||= { current: initial }; },
      useEffect(effect, deps) {
        const index = cursor++, previous = slots[index];
        if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
        previous?.cleanup?.();
        const slot = { deps }; slots[index] = slot;
        effects.push(() => { slot.cleanup = effect(); });
      },
      useMemo(fn, deps) {
        const index = cursor++, previous = slots[index];
        if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return previous.value;
        const value = fn(); slots[index] = { deps, value }; return value;
      },
      useCallback(fn, deps) { return fixture.React.useMemo(() => fn, deps); },
    },
  };
  const url = new URL(file, import.meta.url), key = `__settingsIdentityUi${++fixtureId}`;
  const source = readFileSync(url, 'utf8')
    .replace(/^import ['"][^'"]+['"];?\n/gm, '')
    .replace(/^import ([\w\s{},*]+) from ['"]([^'"]+)['"];?$/gm, (_match, bindings, specifier) => {
      if (specifier === 'react') return `const React = fixture.React; ${bindings.includes('{') ? `const ${bindings.slice(bindings.indexOf('{'))} = React;` : ''}`;
      if (Object.hasOwn(stubs, bindings.trim())) return `const ${bindings} = fixture[${JSON.stringify(bindings.trim())}];`;
      const resolved = specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier);
      return `import ${bindings} from ${JSON.stringify(resolved)};`;
    })
    .replace("import('../lib/settingsChangelog.js')", `import(${JSON.stringify(new URL('../src/lib/settingsChangelog.js', import.meta.url).href)})`);
  globalThis[key] = fixture;
  let component;
  try {
    const compiled = await transformWithOxc(`const fixture = globalThis[${JSON.stringify(key)}];\n${source}`, 'SettingsIdentityTest.jsx', { jsx: { runtime: 'classic' } });
    component = (await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`)).default;
  } finally { delete globalThis[key]; }
  return {
    render(props) { cursor = 0; effects = []; const tree = component(props); for (const effect of effects) effect(); return tree; },
    unmount() { for (const slot of slots) slot?.cleanup?.(); slots = []; },
  };
}

async function headerHarness(cached = null) {
  let owner = alice, current = cached;
  const requests = [], listeners = new Set();
  const db = {
    readCachedReviewIdentity: userId => userId === owner ? current : null,
    fetchReviewIdentity(userId) { const wait = deferred(); requests.push({ ...wait, userId }); return wait.promise; },
    subscribeReviewIdentity(userId, listener) { const record = { userId, listener }; listeners.add(record); return () => listeners.delete(record); },
  };
  const h = await componentHarness('../src/components/SettingsCommunityIdentity.jsx');
  let props = { db, userId: alice, language: 'zh' };
  return {
    ...h, db, requests, listeners,
    render(overrides = {}) { props = { ...props, ...overrides }; return h.render(props); },
    notify(next = current) { current = next; for (const record of listeners) record.listener(); },
    changeOwner(next) { owner = next; current = null; for (const record of listeners) record.listener(); },
    images: tree => walk(tree).filter(node => node.type === 'img'),
  };
}

test('settings header uses the confirmed same-account photo and nickname on its first render and remount', async () => {
  const h = await headerHarness(identity());
  let tree = h.render();
  assert.equal(h.images(tree)[0]?.props.src, photo);
  assert.match(words(tree), /Alice 当前昵称/);
  await flush();
  assert.equal(h.requests.length, 1, 'background verification must not block the first paint');
  h.unmount();
  tree = h.render();
  assert.equal(h.images(tree)[0]?.props.src, photo);
  assert.match(words(tree), /Alice 当前昵称/);
  h.unmount();
});

test('unknown or unverified avatar metadata is neutral; only a confirmed null path renders a preset', async () => {
  for (const cached of [null, identity({ avatarPath: undefined }), identity({ avatarPath: `${bob}/${object}.webp` }), identity({ avatarDataUrl: '' }), identity({ avatarDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })]) {
    const h = await headerHarness(cached), tree = h.render();
    assert.equal(h.images(tree).length, 0, 'an unresolved or invalid photo cannot reveal the old preset');
    h.unmount();
  }
  const h = await headerHarness(identity({ avatarPath: null, avatarDataUrl: '' }));
  assert.equal(h.images(h.render())[0]?.props.src, '/community-avatars/avatar-animal-fox.jpg');
  h.unmount();
});

test('cold settings identity changes atomically from neutral to the verified custom image and nickname', async () => {
  const h = await headerHarness();
  let tree = h.render(); assert.equal(h.images(tree).length, 0); await flush();
  h.requests[0].resolve(identity()); await flush(); tree = h.render();
  assert.equal(h.images(tree)[0]?.props.src, photo);
  assert.match(words(tree), /Alice 当前昵称/);
  h.unmount();
});

test('background identity failures keep the last confirmed same-account photo and nickname', async () => {
  const h = await headerHarness(identity()); h.render(); await flush();
  h.requests[0].reject(new Error('offline')); await flush();
  let tree = h.render(); assert.equal(h.images(tree)[0]?.props.src, photo); assert.match(words(tree), /Alice 当前昵称/);
  h.notify(); h.render(); await flush();
  assert.equal(h.requests.length, 2);
  h.requests[1].reject(new Error('avatar image unavailable')); await flush(); tree = h.render();
  assert.equal(h.images(tree)[0]?.props.src, photo); assert.match(words(tree), /Alice 当前昵称/);
  h.unmount();
});

test('avatar invalidation refreshes the displayed identity without resetting it to a preset', async () => {
  const h = await headerHarness(identity()); h.render(); await flush();
  h.requests[0].resolve(identity()); await flush(); h.render();
  h.notify(); let tree = h.render(); await flush();
  assert.equal(h.images(tree)[0]?.props.src, photo);
  const updated = identity({ nickname: 'Alice 新昵称', avatarPath: `${alice}/${object2}.webp`, avatarDataUrl: otherPhoto });
  h.requests.at(-1).resolve(updated); await flush(); tree = h.render();
  assert.equal(h.images(tree)[0]?.props.src, otherPhoto); assert.match(words(tree), /Alice 新昵称/);
  h.notify(updated); h.render(); await flush();
  h.requests.at(-1).resolve(identity({ nickname: 'Alice 默认头像', avatarPath: null, avatarDataUrl: '' })); await flush(); tree = h.render();
  assert.equal(h.images(tree)[0]?.props.src, '/community-avatars/avatar-animal-fox.jpg');
  h.unmount(); assert.equal(h.listeners.size, 0);
});

test('switching accounts or signing out removes the previous header immediately and ignores late responses', async () => {
  for (const nextOwner of [bob, null]) {
    const h = await headerHarness(identity()); h.render(); await flush();
    const old = h.requests[0];
    h.changeOwner(nextOwner);
    let tree = h.render({ userId: nextOwner });
    assert.equal(h.images(tree).length, 0); assert.doesNotMatch(words(tree), /Alice/);
    await flush();
    old.resolve(identity({ nickname: 'Alice 旧回包' })); await flush(); tree = h.render();
    assert.equal(h.images(tree).length, 0); assert.doesNotMatch(words(tree), /Alice/);
    if (nextOwner) {
      h.requests.at(-1).resolve(identity({ nickname: 'Bob 当前昵称', avatarPath: null, avatarDataUrl: '', avatarKey: 'panda' })); await flush(); tree = h.render();
      assert.match(words(tree), /Bob 当前昵称/);
      assert.equal(h.images(tree)[0]?.props.src, '/community-avatars/avatar-animal-panda.jpg');
    }
    h.unmount();
  }
});

test('switching A to B to A does not let the first A request overwrite the new account epoch', async () => {
  const h = await headerHarness(); h.render(); await flush(); const old = h.requests[0];
  h.changeOwner(bob); h.render({ userId: bob }); await flush();
  h.changeOwner(alice); h.render({ userId: alice }); await flush();
  const current = h.requests.at(-1);
  current.resolve(identity({ nickname: 'Alice 最新读取' })); await flush(); h.render();
  old.resolve(identity({ nickname: 'Alice 过期读取', avatarDataUrl: otherPhoto })); await flush();
  const tree = h.render(); assert.match(words(tree), /Alice 最新读取/); assert.doesNotMatch(words(tree), /过期读取/); assert.equal(h.images(tree)[0]?.props.src, photo);
  h.unmount();
});

test('a failed decoded image stays neutral instead of reverting to the old preset', async () => {
  const h = await headerHarness(identity());
  h.images(h.render())[0].props.onError();
  const tree = h.render(); assert.equal(h.images(tree).length, 0); assert.match(words(tree), /Alice 当前昵称/);
  h.unmount();
});

test('replacing the repository scope rejects the old scope even for the same user id', async () => {
  const h = await headerHarness(identity()); h.render(); await flush(); const old = h.requests[0];
  const next = deferred(), scopedIdentity = identity({ nickname: '当前作用域', avatarDataUrl: otherPhoto });
  const db = { readCachedReviewIdentity: () => scopedIdentity, fetchReviewIdentity: () => next.promise, subscribeReviewIdentity: () => () => {} };
  let tree = h.render({ db }); assert.equal(h.images(tree)[0]?.props.src, otherPhoto); assert.match(words(tree), /当前作用域/);
  old.resolve(identity({ nickname: '旧作用域' })); await flush(); tree = h.render();
  assert.doesNotMatch(words(tree), /旧作用域/); assert.equal(h.images(tree)[0]?.props.src, otherPhoto);
  h.unmount();
});

test('opening profile editing always refreshes its CAS base instead of using the header display cache', async () => {
  const requests = [], writes = [];
  const request = (kind, args) => { const wait = deferred(); requests.push({ ...wait, kind, args }); return wait.promise; };
  const db = {
    readCachedReviewIdentity: () => identity(),
    fetchCommunityProfile: (...args) => request('profile', args),
    fetchCommunityAvatar: (...args) => request('avatar', args),
    upsertCommunityProfile: async (...args) => { writes.push(['profile', args]); return args[0]; },
    uploadCommunityAvatar: async () => { throw new Error('choosing a preset must not upload'); },
    saveCommunityAvatarProfile: async (...args) => { writes.push(['avatar', args]); return args[0]; },
    removeCommunityAvatarImage: async () => {},
  };
  const StockReportModal = () => null, UserAvatar = () => null, AvatarCropper = () => null, SettingsCommunityIdentity = () => null;
  const h = await componentHarness('../src/tabs/SettingsTab.jsx', { StockReportModal, UserAvatar, AvatarCropper, SettingsCommunityIdentity });
  const ctx = { db, user: { id: alice, email: 'alice@example.test' }, language: 'zh', supabase: { auth: {} } };
  const render = () => h.render({ ctx });
  const open = tree => walk(tree).find(node => node.type === 'button' && node.props['aria-label'] === '编辑社区资料');
  const modal = tree => walk(tree).find(node => node.type === StockReportModal && node.props.title === '社区资料');
  let tree = render();
  for (const pending of requests) pending.resolve(pending.kind === 'profile' ? { nickname: 'Alice 旧昵称', avatarKey: 'fox', profileCompletedAt: '2026-11-01' } : { path: `${alice}/${object}.webp`, configured: true, url: '' });
  await flush(); tree = render(); const beforeOpen = requests.length;
  open(tree).props.onClick(); tree = render();
  const firstOpen = requests.slice(beforeOpen);
  assert.deepEqual(firstOpen.map(entry => entry.kind), ['profile', 'avatar']);
  assert.deepEqual(firstOpen[1].args, [alice, { force: true }]);
  assert.equal(modal(tree).props.actions.find(action => action.key === 'save').disabled, true);
  const freshPath = `${alice}/${object2}.webp`;
  firstOpen[0].resolve({ nickname: 'Alice 实时昵称', avatarKey: 'fox', profileCompletedAt: '2026-11-01' });
  firstOpen[1].resolve({ path: freshPath, configured: true, url: '' });
  await flush(); tree = render();
  const preset = walk(modal(tree)).find(node => node.type === 'button' && node.props['aria-label'] === '熊猫');
  preset.props.onClick(); tree = render();
  const save = modal(tree).props.actions.find(action => action.key === 'save');
  assert.equal(save.disabled, false); await save.onClick(); await flush(); tree = render();
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'avatar');
  assert.deepEqual(writes[0][1], [{ nickname: 'Alice 实时昵称', avatarKey: 'panda', avatarPath: null, expectedAvatarPath: freshPath }, alice]);
  const beforeReopen = requests.length; open(tree).props.onClick(); render();
  assert.deepEqual(requests.slice(beforeReopen).map(entry => entry.kind), ['profile', 'avatar']);
  assert.deepEqual(requests.at(-1).args, [alice, { force: true }]);
  h.unmount();
});
