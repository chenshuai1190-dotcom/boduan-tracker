import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/pages/ReviewJournalPage.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pages/ReviewJournalPage.css', import.meta.url), 'utf8');
const sourceStart = source.indexOf('const loadedJournalAvatars =');
const sourceEnd = source.indexOf('function Photo(');
assert.ok(sourceStart > 0 && sourceEnd > sourceStart);
const avatarSource = source.slice(sourceStart, sourceEnd);
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const object = '33333333-3333-4333-8333-333333333333';
const origin = 'https://avatar.test';
const path = `${owner}/${object}.webp`;
const signed = (imagePath = path, token = 'first') => `${origin}/storage/v1/object/sign/community-avatars/${imagePath}?token=${token}`;
const identity = (overrides = {}) => ({ nickname: '复盘用户', avatarKey: 'fox', avatarPath: path, avatarUrl: signed(), ...overrides });

let fixtureId = 0;
async function harness(initialProps = {}) {
  let slots = [], cursor = 0, pendingEffects = [], mountedKey;
  const images = [], timers = new Map();
  const fixture = {
    now: 0,
    Image: class {
      constructor() { images.push(this); }
      set src(value) { this.url = value; this.corsAtSource = this.crossOrigin; }
    },
    setTimeout(callback) { const key = Symbol(); timers.set(key, callback); return key; },
    clearTimeout(key) { timers.delete(key); },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[index];
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      previous?.cleanup?.();
      const slot = { deps }; slots[index] = slot;
      pendingEffects.push(() => { slot.cleanup = effect(); });
    },
  };
  const fixtureKey = `__reviewAvatarUI${++fixtureId}`;
  globalThis[fixtureKey] = fixture;
  const input = `
    import React from ${JSON.stringify(import.meta.resolve('react'))};
    import { isCommunityAvatarSignedUrl, normalizeCommunityAvatarPath } from ${JSON.stringify(new URL('../src/lib/communityAvatarModel.js', import.meta.url).href)};
    import { isReviewAvatarDataUrl } from ${JSON.stringify(new URL('../src/lib/reviewIdentityStorage.js', import.meta.url).href)};
    import { getCommunityAvatarOption } from ${JSON.stringify(new URL('../src/lib/communityProfile.js', import.meta.url).href)};
    const fixture = globalThis[${JSON.stringify(fixtureKey)}];
    const { useState, useEffect, Image, setTimeout, clearTimeout } = fixture;
    const Date = { now: () => fixture.now };
    const User = () => React.createElement('svg', { 'data-neutral-avatar': true });
    ${avatarSource.replaceAll('import.meta.env.VITE_SUPABASE_URL', JSON.stringify(origin))}
    export { Avatar, AuthorName };
  `;
  const compiled = await transformWithOxc(input, 'ReviewJournalIdentity.jsx', { jsx: { runtime: 'classic' } });
  const components = await import(dataUrl(compiled.code));
  delete globalThis[fixtureKey];
  let props = { userId: owner, preview: false, ...initialProps };
  const unmount = () => {
    for (const slot of slots) slot?.cleanup?.();
    slots = []; mountedKey = undefined;
  };
  return {
    components, images, timers, fixture,
    render(nextProps = {}) {
      props = { ...props, ...nextProps };
      const wrapper = components.Avatar(props);
      if (mountedKey !== wrapper.key) { unmount(); mountedKey = wrapper.key; }
      cursor = 0; pendingEffects = [];
      const tree = wrapper.type(wrapper.props);
      for (const effect of pendingEffects) effect();
      return tree;
    },
    image(tree) { return tree.props.children?.type === 'img' ? tree.props.children : null; },
    timeout() { for (const callback of [...timers.values()]) callback(); },
    unmount,
  };
}

test('pending identity and unresolved custom metadata stay neutral; only confirmed null uses the preset', async () => {
  const h = await harness();
  for (const value of [null, identity({ avatarPath: undefined, avatarUrl: undefined }), identity({ avatarUrl: undefined }), identity({ avatarUrl: signed().replace('avatar.test', 'foreign.test') })]) {
    const tree = h.render({ identity: value });
    assert.equal(h.image(tree), null);
    assert.match(tree.props.className, /rj-avatar-empty/);
  }
  assert.equal(h.images.length, 0);
  const preset = h.image(h.render({ identity: identity({ avatarPath: null, avatarUrl: undefined }) }));
  assert.equal(preset.props.src, '/community-avatars/avatar-animal-fox.jpg');
  assert.equal(preset.props['data-custom-avatar'], false);
  h.unmount();
});

test('custom image is loaded with CORS before being atomically displayed', async () => {
  const h = await harness({ identity: identity() });
  assert.equal(h.image(h.render()), null);
  assert.equal(h.images.length, 1);
  assert.equal(h.images[0].url, signed());
  assert.equal(h.images[0].corsAtSource, 'anonymous');
  h.images[0].onload();
  const visible = h.image(h.render());
  assert.equal(visible.props.src, signed());
  assert.equal(visible.props['data-custom-avatar'], true);
  assert.equal(visible.props.crossOrigin, 'anonymous');
  assert.equal(h.timers.size, 0);
  h.unmount();
});

test('same-owner replacements retain the loaded photo during download, signature failure and timeout', async () => {
  const h = await harness({ identity: identity() });
  h.render(); h.images[0].onload(); h.render();
  const next = identity({ avatarUrl: signed(path, 'next') });
  assert.equal(h.image(h.render({ identity: next })).props.src, signed());
  h.timeout();
  assert.equal(h.image(h.render()).props.src, signed());
  assert.equal(h.images.length, 2, 'timeout must not start an automatic retry loop');
  assert.equal(h.image(h.render({ identity: identity({ avatarUrl: undefined }) })).props.src, signed());
  const third = signed(path, 'third');
  h.render({ identity: identity({ avatarUrl: third }) });
  h.images.at(-1).onload();
  assert.equal(h.image(h.render()).props.src, third);
  const preset = h.image(h.render({ identity: identity({ avatarPath: null, avatarUrl: undefined }) }));
  assert.equal(preset.props.src, '/community-avatars/avatar-animal-fox.jpg', 'confirmed preset selection replaces an earlier custom photo');
  h.unmount();
});

test('first-image failures and timeouts stay neutral without retrying or flashing the preset', async () => {
  for (const mode of ['error', 'timeout']) {
    const h = await harness({ identity: identity() });
    h.render();
    if (mode === 'error') h.images[0].onerror(); else h.timeout();
    assert.equal(h.image(h.render()), null);
    assert.equal(h.image(h.render()), null);
    assert.equal(h.images.length, 1);
    assert.equal(h.timers.size, 0);
    h.unmount();
  }
});

test('a displayed custom image failing later returns to neutral and cannot trigger the global preset fallback', async () => {
  const h = await harness({ identity: identity() });
  h.render(); h.images[0].onload();
  h.image(h.render()).props.onError();
  assert.equal(h.image(h.render()), null);
  assert.equal(h.images.length, 1, 'display errors do not start an automatic retry loop');
  h.unmount();
  assert.equal(h.image(h.render()), null, 'a failed image must not be considered loaded on remount');
  assert.equal(h.images.length, 2);
  h.unmount();
  assert.doesNotMatch(avatarSource, /UserAvatar/);
});

test('owner changes clear the visible photo and cancel obsolete loads; warm same-owner remounts are synchronous', async () => {
  const h = await harness({ identity: identity() });
  h.render(); h.images[0].onload(); h.render();
  h.render({ identity: identity({ avatarUrl: signed(path, 'pending') }) });
  const obsoleteLoad = h.images.at(-1).onload;
  const otherPath = `${other}/${object}.webp`;
  assert.equal(h.image(h.render({ userId: other, identity: identity({ avatarPath: otherPath, avatarUrl: signed(otherPath) }) })), null);
  obsoleteLoad();
  assert.equal(h.image(h.render()), null);
  const warm = h.image(h.render({ userId: owner, identity: identity() }));
  assert.equal(warm.props.src, signed());
  assert.equal(h.images.length, 3, 'the known same-owner image must not need a new preload');
  h.unmount();
  h.fixture.now = 480001;
  assert.equal(h.image(h.render()), null, 'expired decoded-image metadata must be loaded again on remount');
  assert.equal(h.images.length, 4);
  h.unmount();
});

test('all journal author locations use a stable name placeholder with accessible loading text', async () => {
  const h = await harness();
  const pending = renderToStaticMarkup(React.createElement(h.components.AuthorName, { identity: null }));
  assert.match(pending, /rj-name-skeleton/);
  assert.match(pending, /rj-visually-hidden[^>]*>作者资料加载中/);
  const ready = renderToStaticMarkup(React.createElement(h.components.AuthorName, { identity: identity() }));
  assert.equal(ready, '<strong>复盘用户</strong>');
  assert.doesNotMatch(source, /昵称加载中/);
  assert.equal((source.match(/<AuthorName identity=\{identity\}/g) || []).length, 7,
    'post, composer, evaluation, settings, system-post and timeline-detail bylines share the stable identity');
  assert.match(css, /\.rj-name-skeleton\{[^}]*width:72px[^}]*height:12px/);
  h.unmount();
});


test('persisted custom image is visible on first render and remount without another image request', async () => {
  const avatarDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
  const h = await harness({ identity: identity({ avatarUrl: undefined, avatarDataUrl }) });
  assert.equal(h.image(h.render()).props.src, avatarDataUrl);
  h.unmount();
  assert.equal(h.image(h.render()).props.src, avatarDataUrl);
  assert.equal(h.images.length, 0, 'local image bytes must not be preloaded from storage again');
  assert.equal(h.image(h.render({ userId: other })), null, 'persisted image never renders for another owner');
  h.unmount();
});
