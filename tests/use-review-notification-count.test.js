import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/hooks/useReviewNotificationCount.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
let sequence = 0;

async function harness(initial = {}) {
  let cursor = 0, effects = [], now = 10000, timerId = 0;
  const slots = [], requests = [], writes = [], timers = new Map(), windowListeners = new Map(), documentListeners = new Map();
  const events = registry => ({
    addEventListener(type, fn) { const listeners = registry.get(type) || new Set(); listeners.add(fn); registry.set(type, listeners); },
    removeEventListener(type, fn) { registry.get(type)?.delete(fn); },
  });
  const db = { fetchReviewNotificationCount: userId => new Promise((resolve, reject) => requests.push({ userId, resolve, reject })) };
  const fixture = {
    useState(initialValue) { const index = cursor++; slots[index] ||= { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; writes.push(slots[index].value); }]; },
    useRef(initialValue) { return slots[cursor++] ||= { current: initialValue }; },
    useEffect(effect, deps) { const index = cursor++, previous = slots[index];
      if (previous && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      previous?.cleanup?.(); const slot = { deps }; slots[index] = slot; effects.push(() => { slot.cleanup = effect(); }); },
    Date: class extends Date { static now() { return now; } },
    window: events(windowListeners), document: { ...events(documentListeners), visibilityState: 'visible' },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const key = `__reviewNotificationCountTest${++sequence}`;
  globalThis[key] = fixture;
  let hook;
  try {
    const code = source.replace("import { useEffect, useRef, useState } from 'react';",
      `const { useEffect, useRef, useState, window, document, Date, setTimeout, clearTimeout } = globalThis[${JSON.stringify(key)}];`);
    hook = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
  } finally { delete globalThis[key]; }
  let props = { db, userId: 'viewer', ...initial };
  const render = (patch = {}) => { props = { ...props, ...patch }; cursor = 0; effects = []; const value = hook(props); effects.forEach(effect => effect()); return value; };
  return {
    render, db, requests, writes, timers,
    async load(count = 3) { render(); await flush(); requests.at(-1).resolve({ unreadCount: count }); await flush(); return render(); },
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); } },
    event(type) { for (const listener of windowListeners.get(type) || []) listener({ type }); },
    visibility(value) { fixture.document.visibilityState = value; for (const listener of documentListeners.get('visibilitychange') || []) listener(); },
    listenerCount() { return [...windowListeners.values(), ...documentListeners.values()].reduce((total, set) => total + set.size, 0); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('badge reads once on mount and polls only after 30 visible seconds', async () => {
  const h = await harness();
  const loading = h.render(); assert.equal(loading.unreadCount, null); assert.equal(loading.error, false);
  await flush(); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].userId, 'viewer');
  h.requests[0].resolve({ unreadCount: 7 }); await flush();
  assert.equal(h.render().unreadCount, 7); assert.equal(h.timers.size, 1); assert.equal(h.listenerCount(), 4);
  assert.equal([...h.timers.values()][0].delay, 30000);
  h.advance(29999); await flush(); assert.equal(h.requests.length, 1);
  h.advance(1); await flush(); assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0, 'no concurrent polling loop while the count read is pending');
  h.requests[1].resolve({ unreadCount: 8 }); await flush();
  assert.equal(h.render().unreadCount, 8); assert.equal(h.timers.size, 1);
  h.unmount();
});

test('hidden document stops polling and suppresses manual refresh and resume events', async () => {
  const h = await harness(); await h.load();
  h.visibility('hidden'); assert.equal(h.timers.size, 0);
  h.advance(90000); h.event('focus'); h.event('pageshow'); h.event('online'); await h.render().refresh(); await flush();
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  h.visibility('visible'); await flush(); assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ unreadCount: 4 }); await flush();
  assert.equal(h.render().unreadCount, 4); assert.equal(h.timers.size, 1); h.unmount();
});

test('focus pageshow online and visibility bursts merge into one bounded request and timer', async () => {
  const h = await harness(); await h.load(); h.advance(2000);
  h.event('focus'); h.event('pageshow'); h.event('online'); h.visibility('visible');
  const pending = h.render().refresh(); await flush();
  assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0);
  h.requests[1].resolve({ unreadCount: 9 }); await pending; await flush();
  assert.equal(h.render().unreadCount, 9); assert.equal(h.timers.size, 1);
  h.event('focus'); h.event('pageshow'); h.event('online'); h.visibility('visible'); await flush();
  assert.equal(h.requests.length, 2, 'settled event burst inside one second is throttled');
  assert.equal(h.timers.size, 1); h.unmount();
});

test('backgrounding while an in-flight read settles never reschedules a background timer', async () => {
  const h = await harness(); h.render(); await flush(); h.visibility('hidden');
  h.requests[0].resolve({ unreadCount: 2 }); await flush();
  assert.equal(h.timers.size, 0); h.advance(31000); await flush(); assert.equal(h.requests.length, 1);
  h.visibility('visible'); await flush(); assert.equal(h.requests.length, 2); h.unmount();
});

test('switching account hides previous count immediately and ignores previous pending success or error', async () => {
  for (const failOld of [false, true]) {
    const h = await harness(); await h.load(9); h.advance(30000); await flush(); const old = h.requests[1];
    const next = h.render({ userId: 'other' }); assert.equal(next.unreadCount, null); assert.equal(next.error, false);
    await flush(); assert.equal(h.requests.at(-1).userId, 'other');
    h.requests.at(-1).resolve({ unreadCount: 1 }); await flush();
    if (failOld) old.reject(new Error('old account failed')); else old.resolve({ unreadCount: 999 });
    await flush(); const result = h.render(); assert.equal(result.unreadCount, 1); assert.equal(result.error, false);
    assert.equal(h.timers.size, 1); assert.equal(h.listenerCount(), 4); h.unmount();
  }
});

test('logging out or disabling polling clears listeners and pending refresh callback', async () => {
  for (const patch of [{ userId: null }, { enabled: false }]) {
    const h = await harness(); const old = await h.load(4); h.render(patch);
    assert.equal(h.listenerCount(), 0); assert.equal(h.timers.size, 0);
    await old.refresh(); h.advance(30000); h.event('online'); await flush(); assert.equal(h.requests.length, 1);
    if (patch.userId === null) assert.equal(h.render().unreadCount, null);
    h.unmount();
  }
});

test('reenabling starts one fresh count read and no duplicate listener or timer survives', async () => {
  const h = await harness(); h.render(); await flush(); const pendingOld = h.requests[0];
  h.render({ enabled: false }); h.render({ enabled: true }); await flush();
  assert.equal(h.requests.length, 2); assert.equal(h.listenerCount(), 4);
  h.requests[1].resolve({ unreadCount: 5 }); pendingOld.resolve({ unreadCount: 30 }); await flush();
  assert.equal(h.render().unreadCount, 5); assert.equal(h.timers.size, 1); h.unmount();
});

test('direct inbox count overrides a pending badge read or failure and future polling remains live', async () => {
  for (const failPending of [false, true]) {
    const h = await harness(); h.render(); await flush();
    h.render().update(0); assert.equal(h.render().unreadCount, 0);
    if (failPending) h.requests[0].reject(new Error('stale badge failure')); else h.requests[0].resolve({ unreadCount: 12 });
    await flush(); const result = h.render(); assert.equal(result.unreadCount, 0); assert.equal(result.error, false);
    h.advance(30000); await flush(); assert.equal(h.requests.length, 2);
    h.requests[1].resolve({ unreadCount: 2 }); await flush(); assert.equal(h.render().unreadCount, 2); h.unmount();
  }
});

test('inbox updates for an old account cannot replace the current badge', async () => {
  const h = await harness(); const old = await h.load(5);
  h.render({ userId: 'other' }); await flush(); h.requests.at(-1).resolve({ unreadCount: 1 }); await flush();
  old.update(99); const result = h.render(); assert.equal(result.unreadCount, 1); assert.equal(result.error, false); h.unmount();
});

test('failed reads expose unavailable state instead of a false zero and later success clears it', async () => {
  const h = await harness(); await h.load(6); h.advance(30000); await flush();
  h.requests.at(-1).reject(new Error('network failed')); await flush();
  const failure = h.render(); assert.equal(failure.unreadCount, null); assert.equal(failure.error, true);
  h.advance(30000); await flush(); h.requests.at(-1).resolve({ unreadCount: 0 }); await flush();
  const recovered = h.render(); assert.equal(recovered.unreadCount, 0); assert.equal(recovered.error, false); h.unmount();
});

test('disabled or unauthenticated mounts do not start reads, and missing count capability does not poll', async () => {
  for (const initial of [{ enabled: false }, { userId: null }, { db: {} }]) {
    const h = await harness(initial); const result = h.render(); await flush();
    assert.equal(result.unreadCount, null); assert.equal(result.error, false); assert.equal(h.requests.length, 0);
    assert.equal(h.listenerCount(), 0); assert.equal(h.timers.size, 0); await result.refresh(); h.unmount();
  }
});

test('unmount removes polling and lifecycle listeners and discards pending output', async () => {
  for (const reject of [false, true]) {
    const h = await harness(); const result = h.render(); await flush(); const before = h.writes.length;
    h.unmount(); assert.equal(h.listenerCount(), 0); assert.equal(h.timers.size, 0);
    if (reject) h.requests[0].reject(new Error('late failure')); else h.requests[0].resolve({ unreadCount: 8 });
    await flush(); await result.refresh(); h.advance(60000); h.event('focus'); await flush();
    assert.equal(h.writes.length, before); assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  }
});
