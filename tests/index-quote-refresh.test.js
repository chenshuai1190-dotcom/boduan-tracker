import assert from 'node:assert/strict';
import test from 'node:test';

import { createIndexQuotePoller } from '../src/lib/indexQuoteRefresh.js';

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function fakeClock() {
  let currentTime = 0;
  let nextId = 1;
  const timers = new Map();
  const allCallbacks = [];
  return {
    now: () => currentTime,
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: currentTime + delay });
      allCallbacks.push(callback);
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    timerCount: () => timers.size,
    allCallbacks,
    async advance(milliseconds) {
      const target = currentTime + milliseconds;
      while (true) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
        if (!due) break;
        const [id, timer] = due;
        currentTime = timer.at;
        timers.delete(id);
        timer.callback();
        await flushPromises();
      }
      currentTime = target;
      await flushPromises();
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function setup(options = {}) {
  const clock = fakeClock();
  const requests = [];
  const snapshots = [];
  const errors = [];
  const poller = createIndexQuotePoller({
    fetchSnapshot: ({ signal }) => {
      const response = deferred();
      requests.push({ ...response, signal, at: clock.now() });
      return response.promise;
    },
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onError: (error) => errors.push(error),
    isVisible: () => true,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...options,
  });
  return { ...clock, poller, requests, snapshots, errors };
}

test('index poller starts immediately and repeated resume events share one request and TTL', async () => {
  const ctx = setup();
  ctx.poller.start();
  ctx.poller.start();
  ctx.poller.resume();
  await flushPromises();
  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.requests[0].at, 0);
  await ctx.advance(1_000);
  ctx.requests[0].resolve({ sp500: { price: 6_000 } });
  await flushPromises();
  assert.equal(ctx.snapshots.length, 1);
  for (let index = 0; index < 5; index += 1) {
    await ctx.advance(10_000);
    ctx.poller.resume();
  }
  assert.equal(ctx.requests.length, 1, 'focus/pageshow/online do not bypass the current TTL');
  assert.equal(ctx.timerCount(), 1, 'there is only one scheduled check');
  await ctx.advance(8_999);
  assert.equal(ctx.requests.length, 1);
  await ctx.advance(1);
  assert.equal(ctx.requests.length, 2, 'resume must not push the original 60s deadline back');
  assert.equal(ctx.requests[1].at, 60_000);
  ctx.poller.dispose();
});

test('hidden pause aborts and discards unfinished work, then resumes only when due', async () => {
  let visible = true;
  const ctx = setup({ isVisible: () => visible });
  ctx.poller.start();
  await flushPromises();
  await ctx.advance(5_000);
  visible = false;
  ctx.poller.pause();
  assert.equal(ctx.requests[0].signal.aborted, true);
  assert.equal(ctx.timerCount(), 0);
  ctx.requests[0].resolve({ stale: true });
  await flushPromises();
  assert.deepEqual(ctx.snapshots, []);
  assert.deepEqual(ctx.errors, []);
  await ctx.advance(5_000);
  ctx.poller.resume();
  assert.equal(ctx.timerCount(), 0, 'a hidden resume cannot restart timers');
  visible = true;
  ctx.poller.resume();
  await ctx.advance(49_999);
  assert.equal(ctx.requests.length, 1);
  await ctx.advance(1);
  assert.equal(ctx.requests.length, 2);
  ctx.requests[1].resolve({ fresh: true });
  await flushPromises();
  assert.deepEqual(ctx.snapshots, [{ fresh: true }]);
  visible = false;
  ctx.poller.pause();
  await ctx.advance(900_000);
  visible = true;
  ctx.poller.resume();
  await flushPromises();
  assert.equal(ctx.requests.length, 3, 'returning after expiry requests once immediately');
  ctx.poller.dispose();
});

test('visibility checks suppress hidden startup and timer work without external pause', async () => {
  let visible = false;
  const ctx = setup({ isVisible: () => visible });
  ctx.poller.start();
  await flushPromises();
  assert.equal(ctx.requests.length, 0);
  visible = true;
  ctx.poller.resume();
  await flushPromises();
  ctx.requests[0].resolve({ ready: true });
  await flushPromises();
  visible = false;
  await ctx.advance(60_000);
  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.timerCount(), 0);
  visible = true;
  ctx.poller.resume();
  await flushPromises();
  assert.equal(ctx.requests.length, 2);
  ctx.poller.dispose();
});

test('failed requests keep the last snapshot and cool down despite repeated resumes', async () => {
  const ctx = setup();
  ctx.poller.start();
  await flushPromises();
  const good = { nasdaq: { price: 22_000 } };
  ctx.requests[0].resolve(good);
  await flushPromises();
  await ctx.advance(60_000);
  const failure = new Error('upstream unavailable');
  ctx.requests[1].reject(failure);
  await flushPromises();
  assert.deepEqual(ctx.errors, [failure]);
  assert.deepEqual(ctx.snapshots, [good], 'failure publishes no empty or zero snapshot');
  for (let index = 0; index < 20; index += 1) ctx.poller.resume();
  await ctx.advance(59_999);
  assert.equal(ctx.requests.length, 2);
  await ctx.advance(1);
  assert.equal(ctx.requests.length, 3);
  ctx.poller.dispose();
});

test('a true timeout releases hung auth/fetch/json work even if abort is ignored', async () => {
  const ctx = setup();
  ctx.poller.start();
  await flushPromises();
  await ctx.advance(11_999);
  assert.equal(ctx.errors.length, 0);
  await ctx.advance(1);
  assert.equal(ctx.errors.length, 1);
  assert.equal(ctx.errors[0].name, 'TimeoutError');
  assert.equal(ctx.errors[0].code, 'INDEX_QUOTE_TIMEOUT');
  assert.equal(ctx.requests[0].signal.aborted, true);
  ctx.poller.resume();
  await ctx.advance(48_000);
  assert.equal(ctx.requests.length, 2, 'ignored abort must not hold the poller in flight forever');
  ctx.requests[1].resolve({ current: true });
  await flushPromises();
  ctx.requests[0].resolve({ obsolete: true });
  await flushPromises();
  assert.deepEqual(ctx.snapshots, [{ current: true }], 'late completion cannot overwrite newer results');
  assert.equal(ctx.errors.length, 1);
  ctx.poller.dispose();
});

test('dispose invalidates old responses and already-queued timer callbacks permanently', async () => {
  const ctx = setup();
  ctx.poller.start();
  await flushPromises();
  ctx.poller.dispose();
  ctx.poller.dispose();
  assert.equal(ctx.requests[0].signal.aborted, true);
  assert.equal(ctx.timerCount(), 0);
  for (const callback of [...ctx.allCallbacks]) callback();
  ctx.requests[0].reject(new Error('late abort or provider failure'));
  ctx.poller.start();
  ctx.poller.resume();
  await ctx.advance(900_000);
  assert.equal(ctx.requests.length, 1);
  assert.deepEqual(ctx.snapshots, []);
  assert.deepEqual(ctx.errors, []);
});

test('a queued scheduled check cannot restart a disposed poller after a successful fetch', async () => {
  const ctx = setup();
  ctx.poller.start();
  await flushPromises();
  ctx.requests[0].resolve({ ready: true });
  await flushPromises();
  assert.equal(ctx.timerCount(), 1);
  const queuedCallbacks = [...ctx.allCallbacks];
  ctx.poller.dispose();
  for (const callback of queuedCallbacks) callback();
  await ctx.advance(900_000);
  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.timerCount(), 0);
  assert.deepEqual(ctx.snapshots, [{ ready: true }]);
});

test('timeout remains distinguishable when the fetch rejects synchronously on abort', async () => {
  const ctx = setup({
    fetchSnapshot: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });
  ctx.poller.start();
  await flushPromises();
  await ctx.advance(12_000);
  assert.equal(ctx.errors.length, 1);
  assert.equal(ctx.errors[0].code, 'INDEX_QUOTE_TIMEOUT');
  assert.equal(ctx.timerCount(), 1, 'the next refresh remains scheduled after the abort');
  ctx.poller.dispose();
});

test('market interval changes are checked at most 60s later without polling every minute off-hours', async () => {
  let interval = 900_000;
  const ctx = setup({ getIntervalMs: () => interval });
  ctx.poller.start();
  await flushPromises();
  ctx.requests[0].resolve({ initial: true });
  await flushPromises();
  await ctx.advance(600_000);
  assert.equal(ctx.requests.length, 1, 'off-hours checks do not fetch before the 15-minute TTL');
  interval = 60_000;
  await ctx.advance(59_999);
  assert.equal(ctx.requests.length, 1);
  await ctx.advance(1);
  assert.equal(ctx.requests.length, 2, 'the next cadence check notices the market opening');
  ctx.requests[1].resolve({ regular: true });
  await flushPromises();
  interval = 900_000;
  await ctx.advance(60_000);
  assert.equal(ctx.requests.length, 2, 'closing extends the cadence without one extra regular-session request');
  for (let index = 0; index < 10; index += 1) ctx.poller.resume();
  await ctx.advance(839_999);
  assert.equal(ctx.requests.length, 2);
  await ctx.advance(1);
  assert.equal(ctx.requests.length, 3);
  assert.equal(ctx.requests[2].at, 1_560_000);
  ctx.poller.dispose();
});

test('pausing before fetch dispatch invalidates its microtask and invalid intervals cannot spin', async () => {
  const ctx = setup({ getIntervalMs: () => 0 });
  ctx.poller.start();
  ctx.poller.pause();
  await flushPromises();
  assert.equal(ctx.requests.length, 0);
  ctx.poller.resume();
  await ctx.advance(60_000);
  assert.equal(ctx.requests.length, 1);
  ctx.poller.dispose();
});
