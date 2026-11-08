import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/hooks/useReviewFeedUnread.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
let sequence = 0;

async function harness(initial = {}) {
  let cursor = 0, effects = [], now = 10000, timerId = 0;
  const slots = [], requests = [], marks = [], writes = [], timers = new Map(), windowListeners = new Map(), documentListeners = new Map();
  const events = registry => ({
    addEventListener(type, fn) { const listeners = registry.get(type) || new Set(); listeners.add(fn); registry.set(type, listeners); },
    removeEventListener(type, fn) { registry.get(type)?.delete(fn); },
  });
  const db = { fetchReviewFeedUnread: userId => new Promise((resolve, reject) => requests.push({ userId, resolve, reject })),
    markReviewFeedSeen: (boundary, userId) => new Promise((resolve, reject) => marks.push({ userId, boundary, resolve, reject })) };
  const fixture = {
    useState(initialValue) { const index = cursor++; slots[index] ||= { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; writes.push(slots[index].value); }]; },
    useRef(initialValue) { return slots[cursor++] ||= { current: initialValue }; },
    useEffect(effect, deps) { const index = cursor++, previous = slots[index];
      if (previous && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      previous?.cleanup?.(); const slot = { deps }; slots[index] = slot; effects.push(() => { slot.cleanup = effect(); }); },
    useCallback(callback, deps) { const index = cursor++, previous = slots[index];
      if (previous && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return previous.value;
      slots[index] = { deps, value: callback }; return callback; },
    Date: class extends Date { static now() { return now; } },
    window: events(windowListeners), document: { ...events(documentListeners), visibilityState: 'visible' },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const key = `__reviewFeedUnreadTest${++sequence}`;
  globalThis[key] = fixture;
  let hook;
  try {
    const code = source.replace("import { useCallback, useEffect, useRef, useState } from 'react';",
      `const { useCallback, useEffect, useRef, useState, window, document, Date, setTimeout, clearTimeout } = globalThis[${JSON.stringify(key)}];`);
    hook = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
  } finally { delete globalThis[key]; }
  let props = { db, userId: 'viewer', ...initial };
  const render = (patch = {}) => { props = { ...props, ...patch }; cursor = 0; effects = []; const value = hook(props); effects.forEach(effect => effect()); return value; };
  return {
    render, db, requests, marks, writes, timers,
    async load(count = 3) { render(); await flush(); requests.at(-1).resolve({ unreadCount: count, cursor: '10' }); await flush(); return render(); },
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); } },
    event(type) { for (const listener of windowListeners.get(type) || []) listener({ type }); },
    visibility(value) { fixture.document.visibilityState = value; for (const listener of documentListeners.get('visibilitychange') || []) listener(); },
    listenerCount() { return [...windowListeners.values(), ...documentListeners.values()].reduce((total, set) => total + set.size, 0); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}


test('new-post badge polls independently with one visible 30-second timer and no hidden requests', async () => {
  const h = await harness(); assert.equal(h.render().unreadCount, null); await flush();
  h.requests[0].resolve({ unreadCount: 4, cursor: '10' }); await flush();
  assert.equal(h.render().unreadCount, 4); assert.equal(h.listenerCount(), 4);
  h.advance(30000); await flush(); assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ unreadCount: 5, cursor: '11' }); await flush();
  assert.equal(h.render().unreadCount, 5);
  h.visibility('hidden'); assert.equal(h.timers.size, 0);
  h.advance(90000); h.event('focus'); await h.render().refresh(); await flush();
  assert.equal(h.requests.length, 2);
  h.visibility('visible'); await flush(); assert.equal(h.requests.length, 3);
  h.requests[2].resolve({ unreadCount: 5, cursor: '11' }); await flush();
  assert.equal(h.timers.size, 1); h.unmount(); assert.equal(h.listenerCount(), 0);
});

test('captured feed boundary is acknowledged exactly and late arrivals remain unread', async () => {
  const h = await harness(); h.render(); await flush();
  h.requests[0].resolve({ unreadCount: 3, cursor: '9007199254740993' }); await flush();
  const callbacks = h.render(); const boundaryPromise = callbacks.captureBoundary(); await flush();
  const token = await boundaryPromise;
  assert.equal(h.requests.length, 1, 'confirmed boundary does not add a blocking read');
  assert.equal(token.cursor, '9007199254740993'); assert.equal(h.marks.length, 0, 'capture alone cannot mark read');
  const marked = h.render().markSeen(token); await flush();
  assert.equal(h.marks.length, 1); assert.equal(h.marks[0].boundary, '9007199254740993');
  assert.equal(h.render().unreadCount, 3, 'no false optimistic zero before server confirmation');
  h.marks[0].resolve({ unreadCount: 1, cursor: '9007199254740994' }); await marked;
  assert.equal(h.render().unreadCount, 1, 'post arriving after boundary survives');
  assert.equal(h.render().captureBoundary, callbacks.captureBoundary);
  assert.equal(h.render().markSeen, callbacks.markSeen); h.unmount();
});

test('failed or abandoned feed capture never writes and failure preserves the last known count', async () => {
  const h = await harness(); h.render(); await flush();
  const capture = h.render().captureBoundary(); h.requests[0].reject(new Error('offline'));
  assert.equal(await capture, null); assert.equal(h.render().unreadCount, null); assert.equal(h.render().error, true);
  await h.render().markSeen(null); assert.equal(h.marks.length, 0);
  const captured = h.render().captureBoundary(); await flush(); h.requests[1].resolve({ unreadCount: 4, cursor: '10' });
  await captured; assert.equal(h.marks.length, 0, 'successful capture without feed success remains unread');
  const refresh = h.render().refresh(); await flush(); h.requests[2].reject(new Error('offline')); await refresh;
  assert.equal(h.render().unreadCount, 4); assert.equal(h.render().error, true);
  const retained = await h.render().captureBoundary(); assert.equal(retained.cursor, '10');
  assert.equal(h.requests.length, 3, 'failed background refresh does not discard the safe old boundary');
  assert.equal(h.marks.length, 0); h.unmount();
});

test('cached capture does not wait for an in-flight poll or acknowledge its newer arrivals', async () => {
  const h = await harness(); await h.load(3);
  const poll = h.render().refresh(); await flush(); assert.equal(h.requests.length, 2);
  const token = await h.render().captureBoundary();
  assert.equal(token.cursor, '10'); assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ unreadCount: 4, cursor: '11' }); await poll;
  const mark = h.render().markSeen(token); await flush();
  assert.equal(h.marks[0].boundary, '10', 'feed acknowledges the copied pre-request cursor');
  h.marks[0].resolve({ unreadCount: 1, cursor: '11' }); await mark;
  assert.equal(h.render().unreadCount, 1); h.unmount();
});

test('a switched account waits for its own first boundary and cannot reuse the old snapshot', async () => {
  const h = await harness(); await h.load(4);
  h.render({ userId: 'other' }); await flush();
  let resolved = false;
  const capture = h.render().captureBoundary().then(token => { resolved = true; return token; });
  await flush(); assert.equal(resolved, false, 'no old-account boundary can resolve the new capture');
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].userId, 'other');
  h.requests[1].resolve({ unreadCount: 2, cursor: '20' });
  const token = await capture; assert.equal(token.userId, 'other'); assert.equal(token.cursor, '20'); h.unmount();
});

test('read started before a successful acknowledge cannot restore an old unread count', async () => {
  const h = await harness(); h.render(); await flush();
  const capture = h.render().captureBoundary(); h.requests[0].resolve({ unreadCount: 8, cursor: '10' });
  const token = await capture;
  const stale = h.render().refresh(); await flush();
  const mark = h.render().markSeen(token); await flush();
  h.marks[0].resolve({ unreadCount: 0, cursor: '10' }); await mark;
  h.requests[1].resolve({ unreadCount: 8, cursor: '10' }); await stale;
  assert.equal(h.render().unreadCount, 0); assert.equal(h.render().error, false); h.unmount();
});

test('duplicate acknowledgements merge and failed mark does not clear the badge', async () => {
  const h = await harness(); h.render(); await flush(); const capture = h.render().captureBoundary();
  h.requests[0].resolve({ unreadCount: 2, cursor: '10' }); const token = await capture;
  const first = h.render().markSeen(token), second = h.render().markSeen(token); await flush();
  assert.equal(h.marks.length, 1); assert.equal(first, second);
  h.marks[0].reject(new Error('offline')); await first;
  assert.equal(h.render().unreadCount, 2); assert.equal(h.render().error, true);
  const retry = h.render().markSeen(token); await flush(); assert.equal(h.marks.length, 2);
  h.marks[1].resolve({ unreadCount: 0, cursor: '10' }); await retry;
  assert.equal(h.render().unreadCount, 0); assert.equal(h.render().error, false); h.unmount();
});

test('old account reads, writes and tokens cannot leak into the next account or a returned account', async () => {
  const h = await harness(); h.render(); await flush(); const capture = h.render().captureBoundary();
  h.requests[0].resolve({ unreadCount: 9, cursor: '10' }); const token = await capture;
  const oldMark = h.render().markSeen(token); await flush();
  assert.equal(h.render({ userId: 'other' }).unreadCount, null); await flush();
  h.requests[1].resolve({ unreadCount: 1, cursor: '12' }); await flush();
  h.marks[0].resolve({ unreadCount: 0, cursor: '10' }); await oldMark;
  assert.equal(h.render().unreadCount, 1);
  await h.render().markSeen(token); assert.equal(h.marks.length, 1);
  assert.equal(h.render({ userId: 'viewer' }).unreadCount, null); await flush();
  await h.render().markSeen(token); assert.equal(h.marks.length, 1, 'same user ID returning still rejects prior scope');
  h.requests[2].resolve({ unreadCount: 2, cursor: '13' }); await flush();
  assert.equal(h.render().unreadCount, 2); h.unmount();
});

test('hidden page cannot acknowledge an already captured boundary and unmount ignores late callbacks', async () => {
  const h = await harness(); h.render(); await flush(); const capture = h.render().captureBoundary();
  h.requests[0].resolve({ unreadCount: 3, cursor: '10' }); const token = await capture;
  h.visibility('hidden'); assert.equal(await h.render().captureBoundary(), null);
  await h.render().markSeen(token); assert.equal(h.marks.length, 0);
  h.visibility('visible'); await flush();
  const mark = h.render().markSeen(token); await flush(); const before = h.writes.length;
  h.unmount(); h.marks[0].resolve({ unreadCount: 0, cursor: '10' }); await mark;
  assert.equal(h.writes.length, before); assert.equal(h.timers.size, 0); assert.equal(h.listenerCount(), 0);
});

test('unavailable capabilities, disabled and unauthenticated hooks perform no reads or writes', async () => {
  for (const initial of [{ db: {} }, { enabled: false }, { userId: '' }]) {
    const h = await harness(initial), result = h.render(); await flush();
    assert.equal(h.requests.length, 0); assert.equal(h.marks.length, 0); assert.equal(result.unreadCount, null);
    assert.equal(await result.captureBoundary(), null); assert.equal(h.listenerCount(), 0); h.unmount();
  }
});

test('an older view cannot supersede a newer in-flight acknowledgement', async () => {
  const h = await harness(); h.render(); await flush();
  const earlyCapture = h.render().captureBoundary(); h.requests[0].resolve({ unreadCount: 2, cursor: '10' }); const early = await earlyCapture;
  const refreshed = h.render().refresh(); await flush(); h.requests[1].resolve({ unreadCount: 3, cursor: '11' }); await refreshed;
  const late = await h.render().captureBoundary();
  const newer = h.render().markSeen(late), older = h.render().markSeen(early); await flush();
  assert.equal(newer, older); assert.equal(h.marks.length, 1); assert.equal(h.marks[0].boundary, '11');
  h.marks[0].resolve({ unreadCount: 0, cursor: '11' }); await newer;
  assert.equal(h.render().unreadCount, 0); h.unmount();
});
