import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bindEarningsCalendarRefresh,
  EARNINGS_CALENDAR_REFRESH_INTERVAL_MS,
  fetchEarningsCalendarEvents,
  getEarningsRefreshCandidates,
  getNewYorkEarningsClock,
  mergeEarningsRefreshEvents,
  preservePublishedEarningsEvents,
  requestDueEarningsRefresh,
  resetEarningsRefreshRequestsForTests,
} from '../src/lib/earningsCalendarRefresh.js';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = {}) {
    [...(this.listeners.get(type) || [])].forEach((listener) => listener({ type, ...event }));
  }
}

class FakeClock {
  constructor(now = 0) {
    this.nowMs = now;
    this.nextId = 1;
    this.timers = new Map();
  }

  now = () => this.nowMs;

  setTimeout = (callback, delay = 0) => this.addTimer(callback, delay, 0);

  clearTimeout = (timerId) => this.timers.delete(timerId);

  setInterval = (callback, delay = 0) => this.addTimer(callback, delay, Math.max(1, Number(delay) || 0));

  clearInterval = (timerId) => this.timers.delete(timerId);

  addTimer(callback, delay, interval) {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, {
      callback,
      at: this.nowMs + Math.max(0, Number(delay) || 0),
      interval,
    });
    return id;
  }

  advance(milliseconds) {
    const target = this.nowMs + Math.max(0, Number(milliseconds) || 0);
    let guard = 0;
    while (guard < 10_000) {
      guard += 1;
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      this.nowMs = timer.at;
      if (timer.interval > 0) timer.at += timer.interval;
      else this.timers.delete(id);
      timer.callback();
    }
    assert.ok(guard < 10_000, 'fake clock should not spin forever');
    this.nowMs = target;
  }
}

function createBindingHarness({ hidden = false, online = true, due = true, now = 1000 } = {}) {
  const clock = new FakeClock(now);
  const windowTarget = new FakeEventTarget();
  const documentTarget = new FakeEventTarget();
  windowTarget.navigator = { onLine: online };
  documentTarget.hidden = hidden;
  documentTarget.visibilityState = hidden ? 'hidden' : 'visible';
  const calls = [];
  let shouldRefresh = due;
  const binding = bindEarningsCalendarRefresh({
    windowTarget,
    documentTarget,
    shouldRefresh: () => shouldRefresh,
    onVisibleRefresh: (trigger) => calls.push(trigger),
    now: clock.now,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    setIntervalFn: clock.setInterval,
    clearIntervalFn: clock.clearInterval,
  });
  return {
    binding,
    calls,
    clock,
    documentTarget,
    windowTarget,
    setDue(value) { shouldRefresh = value; },
  };
}

test('earnings refresh uses New York time for pre, post, unknown, and DST boundaries', () => {
  const pre = [{ symbol: 'ASML', reportDate: '2026-07-15', session: 'pre' }];
  const post = [{ symbol: 'MSFT', reportDate: '2026-07-15', session: 'post' }];
  const unknown = [{ symbol: 'META', reportDate: '2026-07-15', session: 'unknown' }];

  assert.equal(getEarningsRefreshCandidates(pre, Date.parse('2026-07-15T03:59:59Z')).length, 0);
  assert.equal(getEarningsRefreshCandidates(pre, Date.parse('2026-07-15T04:00:00Z')).length, 1);
  assert.equal(getEarningsRefreshCandidates(post, Date.parse('2026-07-15T19:59:59Z')).length, 0);
  assert.equal(getEarningsRefreshCandidates(post, Date.parse('2026-07-15T20:00:00Z')).length, 1);
  assert.equal(getEarningsRefreshCandidates(unknown, Date.parse('2026-07-15T09:59:59Z')).length, 0);
  assert.equal(getEarningsRefreshCandidates(unknown, Date.parse('2026-07-15T10:00:00Z')).length, 1);

  assert.deepEqual(getNewYorkEarningsClock(Date.parse('2026-01-15T05:00:00Z')), {
    date: '2026-01-15',
    hour: 0,
    minute: 0,
    second: 0,
    minuteOfDay: 0,
  });
  assert.equal(getEarningsRefreshCandidates(
    [{ symbol: 'TSM', reportDate: '2026-01-15', session: 'pre' }],
    Date.parse('2026-01-15T04:59:59Z'),
  ).length, 0);
  assert.equal(getEarningsRefreshCandidates(
    [{ symbol: 'TSM', reportDate: '2026-01-15', session: 'pre' }],
    Date.parse('2026-01-15T05:00:00Z'),
  ).length, 1);
});

test('earnings refresh never treats time or estimates as published and stops only on real actuals', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');
  const candidates = getEarningsRefreshCandidates([
    { symbol: 'ASML', reportDate: '2026-07-15', session: 'pre', epsEstimate: 7.98 },
    { symbol: 'NVDA', reportDate: '2026-07-13', session: 'post' },
    { symbol: 'OLD', reportDate: '2026-07-12', session: 'pre' },
    { symbol: 'FUTURE', reportDate: '2026-07-16', session: 'pre' },
    { symbol: 'ZEROEPS', reportDate: '2026-07-15', session: 'pre', epsActual: 0 },
    { symbol: 'ZEROREV', reportDate: '2026-07-15', session: 'pre', revenueActualUsd: 0 },
    { symbol: 'FLAGGED', reportDate: '2026-07-15', session: 'pre', earningsPublished: true },
  ], now);

  assert.deepEqual(candidates.map((event) => event.symbol), ['ASML', 'NVDA']);
});

test('partial refresh merges ASML actuals without dropping other calendar events or rolling back published data', () => {
  const current = [
    { symbol: 'ASML', reportDate: '2026-07-15', session: 'pre', epsEstimate: 7.98, epsActual: null },
    { symbol: 'NVDA', reportDate: '2026-08-20', session: 'post', epsEstimate: 1.2 },
  ];
  const merged = mergeEarningsRefreshEvents(current, [
    { symbol: 'ASML', reportDate: '2026-07-15', session: 'pre', epsEstimate: 7.98, epsActual: 7.59, earningsPublished: true },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].epsActual, 7.59);
  assert.equal(merged[1].symbol, 'NVDA');
  assert.deepEqual(mergeEarningsRefreshEvents(merged, []), merged);

  const preserved = preservePublishedEarningsEvents(merged, [
    { symbol: 'ASML', reportDate: '2026-07-15', session: 'pre', epsEstimate: 7.98, epsActual: null },
    current[1],
  ]);
  assert.equal(preserved[0].epsActual, 7.59);
});

test('forced earnings request bypasses browser cache and carries a five-minute refresh bucket', async () => {
  let capturedUrl = '';
  let capturedOptions = null;
  const events = await fetchEarningsCalendarEvents({
    token: 'test-token',
    symbols: ['ASML'],
    from: '2026-07-15',
    to: '2026-07-15',
    includePreviousPublished: false,
    forceRefresh: true,
    refreshBucket: 123,
    fetchFn: async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return {
        ok: true,
        async json() { return { success: true, events: [{ symbol: 'ASML' }] }; },
      };
    },
  });
  const parsed = new URL(capturedUrl, 'https://local.test');
  assert.equal(parsed.searchParams.get('symbols'), 'ASML');
  assert.equal(parsed.searchParams.get('includePreviousPublished'), '0');
  assert.equal(parsed.searchParams.get('refresh'), '1');
  assert.equal(parsed.searchParams.get('refreshBucket'), '123');
  assert.equal(capturedOptions.cache, 'no-store');
  assert.equal(capturedOptions.headers.Authorization, 'Bearer test-token');
  assert.equal(events.length, 1);
});

test('due refresh requests only the due symbols and dedupes remounts within the same five-minute bucket', async () => {
  resetEarningsRefreshRequestsForTests();
  const calls = [];
  const requestFn = async (options) => {
    calls.push(options);
    return [{ symbol: 'ASML', reportDate: '2026-07-15', session: 'pre', epsActual: 7.59 }];
  };
  const events = [
    { symbol: 'ASML', reportDate: '2026-07-15', session: 'pre' },
    { symbol: 'NVDA', reportDate: '2026-08-20', session: 'post' },
  ];
  const firstNow = Date.parse('2026-07-15T12:01:00Z');
  const first = requestDueEarningsRefresh({ baseCacheKey: 'user|full', events, token: 'token', now: firstNow, requestFn });
  const duplicate = requestDueEarningsRefresh({ baseCacheKey: 'user|full', events, token: 'token', now: firstNow + 1000, requestFn });
  assert.strictEqual(first, duplicate);
  const firstResult = await first;
  assert.equal(firstResult.requested, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].symbols, ['ASML']);
  assert.equal(calls[0].from, '2026-07-15');
  assert.equal(calls[0].to, '2026-07-15');
  assert.equal(calls[0].includePreviousPublished, false);

  await requestDueEarningsRefresh({
    baseCacheKey: 'user|full',
    events,
    token: 'token',
    now: firstNow + EARNINGS_CALENDAR_REFRESH_INTERVAL_MS,
    requestFn,
  });
  assert.equal(calls.length, 2);
  resetEarningsRefreshRequestsForTests();
});

test('a failed refresh is also bounded to one attempt per five minutes', async () => {
  resetEarningsRefreshRequestsForTests();
  let calls = 0;
  const requestFn = async () => {
    calls += 1;
    throw new Error('temporary upstream failure');
  };
  const input = {
    baseCacheKey: 'user|full',
    events: [{ symbol: 'ASML', reportDate: '2026-07-15', session: 'pre' }],
    token: 'token',
    now: Date.parse('2026-07-15T12:01:00Z'),
    requestFn,
  };
  await assert.rejects(requestDueEarningsRefresh(input), /temporary upstream failure/);
  await assert.rejects(requestDueEarningsRefresh({ ...input, now: input.now + 1000 }), /temporary upstream failure/);
  assert.equal(calls, 1);
  await assert.rejects(requestDueEarningsRefresh({
    ...input,
    now: input.now + EARNINGS_CALENDAR_REFRESH_INTERVAL_MS,
  }), /temporary upstream failure/);
  assert.equal(calls, 2);
  resetEarningsRefreshRequestsForTests();
});

test('a five-minute minimum separates requests even when signals cross a bucket boundary', async () => {
  resetEarningsRefreshRequestsForTests();
  let calls = 0;
  const requestFn = async () => {
    calls += 1;
    return [];
  };
  const input = {
    baseCacheKey: 'user|full',
    events: [{ symbol: 'ASML', reportDate: '2026-07-15', session: 'pre' }],
    token: 'token',
    requestFn,
  };
  const firstNow = Date.parse('2026-07-15T12:04:59Z');
  const first = requestDueEarningsRefresh({ ...input, now: firstNow });
  const acrossBucket = requestDueEarningsRefresh({ ...input, now: firstNow + 2000 });
  assert.strictEqual(first, acrossBucket);
  await first;
  assert.equal(calls, 1);

  await requestDueEarningsRefresh({
    ...input,
    now: firstNow + EARNINGS_CALENDAR_REFRESH_INTERVAL_MS,
  });
  assert.equal(calls, 2);
  resetEarningsRefreshRequestsForTests();
});

test('iOS PWA refresh waits for visibility, ignores offline state, polls while visible, and cleans up', () => {
  const harness = createBindingHarness({ hidden: true });
  harness.windowTarget.dispatch('pageshow');
  assert.deepEqual(harness.calls, []);
  harness.documentTarget.hidden = false;
  harness.documentTarget.visibilityState = 'visible';
  harness.clock.advance(120);
  assert.deepEqual(harness.calls, ['pageshow']);

  harness.windowTarget.dispatch('focus');
  assert.deepEqual(harness.calls, ['pageshow']);
  harness.clock.advance(1200);
  harness.windowTarget.dispatch('focus');
  assert.deepEqual(harness.calls, ['pageshow', 'focus']);

  harness.clock.advance(EARNINGS_CALENDAR_REFRESH_INTERVAL_MS);
  assert.equal(harness.calls.at(-1), 'visible-poll');
  harness.setDue(false);
  harness.clock.advance(EARNINGS_CALENDAR_REFRESH_INTERVAL_MS);
  assert.equal(harness.calls.filter((trigger) => trigger === 'visible-poll').length, 1);

  const beforeCleanup = harness.calls.length;
  harness.binding.cleanup();
  harness.clock.advance(EARNINGS_CALENDAR_REFRESH_INTERVAL_MS);
  harness.windowTarget.dispatch('pageshow');
  harness.documentTarget.dispatch('visibilitychange');
  assert.equal(harness.calls.length, beforeCleanup);
});

test('offline earnings refresh resumes only after the online event', () => {
  const harness = createBindingHarness({ online: false });
  harness.binding.request('initial-due');
  harness.windowTarget.dispatch('pageshow');
  harness.windowTarget.dispatch('focus');
  assert.deepEqual(harness.calls, []);
  harness.windowTarget.navigator.onLine = true;
  harness.windowTarget.dispatch('online');
  assert.deepEqual(harness.calls, ['online']);
  harness.binding.cleanup();
});

test('a visible poll notices when an event becomes due without rebinding the page', () => {
  const harness = createBindingHarness({ due: false });
  harness.clock.advance(EARNINGS_CALENDAR_REFRESH_INTERVAL_MS);
  assert.deepEqual(harness.calls, []);

  harness.setDue(true);
  harness.clock.advance(EARNINGS_CALENDAR_REFRESH_INTERVAL_MS);
  assert.deepEqual(harness.calls, ['visible-poll']);
  harness.binding.cleanup();
});

test('visible polling stops after twelve attempts while a later resume can still recheck', () => {
  const harness = createBindingHarness();
  for (let index = 0; index < 13; index += 1) {
    harness.clock.advance(EARNINGS_CALENDAR_REFRESH_INTERVAL_MS);
  }
  assert.equal(harness.calls.filter((trigger) => trigger === 'visible-poll').length, 12);

  harness.clock.advance(1200);
  harness.windowTarget.dispatch('pageshow');
  assert.equal(harness.calls.at(-1), 'pageshow');
  harness.binding.cleanup();
});
