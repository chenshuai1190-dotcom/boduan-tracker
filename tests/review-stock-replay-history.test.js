import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewStockReplayHistoryLoader, REVIEW_STOCK_REPLAY_MAX_IN_FLIGHT, REVIEW_STOCK_REPLAY_CACHE_MS, REVIEW_STOCK_REPLAY_INCOMPLETE_CACHE_MS, REVIEW_STOCK_REPLAY_DISPLAY_MS } from '../src/lib/reviewStockReplayHistory.js';
import { loadStockComparison, resetStockComparisonCache, STOCK_COMPARISON_CACHE_MS } from '../src/lib/stockComparison.js';
import { createReviewSessionGuard } from '../src/lib/reviewSessionGuard.js';
import { getInvestmentComparisonExpectedCloseDate } from '../src/lib/investmentComparison.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
const NOW = Date.parse('2026-10-27T12:00:00Z');
const args = overrides => ({ userId: 'user-a', symbols: ['NVDA', 'QQQ'], startDate: '2026-10-22', endDate: '2026-10-26', now: () => NOW, ...overrides });
const aborted = { name: 'AbortError', code: 'REQUEST_ABORTED' };

function sessionFixture(initialUser = 'user-a', { legacy = false } = {}) {
  let session = { access_token: `token-${initialUser}`, user: { id: initialUser } };
  const listeners = new Set(), calls = { session: 0, user: 0 };
  const client = { auth: {
    async getSession() { calls.session++; return { data: { session } }; },
    async getUser() { calls.user++; return { data: { user: session?.user || null } }; },
    onAuthStateChange(listener) { listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }; },
  } };
  if (legacy) delete client.auth.onAuthStateChange;
  const guard = createReviewSessionGuard(client);
  return {
    client, calls,
    async getSessionGuard(onIdentityChange) {
      let owner = session?.user?.id || null;
      client.auth.onAuthStateChange?.((event, value) => {
        const next = value?.user?.id || null;
        if (event === 'SIGNED_OUT' || next !== owner) onIdentityChange();
        owner = next;
      });
      return guard;
    },
    emit(event, userId) {
      session = userId ? { access_token: `token-${userId}`, user: { id: userId } } : null;
      for (const listener of listeners) listener(event, session);
    },
    setUser(userId) { session = userId ? { access_token: `token-${userId}`, user: { id: userId } } : null; },
  };
}

function historyFor(options = args(), close = 100) {
  const timestamp = typeof options.now === 'function' ? options.now() : options.now ?? NOW;
  const expected = getInvestmentComparisonExpectedCloseDate(timestamp);
  return { version: 1, source: 'EODHD_EOD_SPLITS', priceBasis: 'split_adjusted_close', currency: 'USD',
    symbols: [...options.symbols], requestedStartDate: options.startDate, requestedEndDate: options.endDate,
    expectedAsOfDate: expected, splitBasisDate: expected, asOfDate: options.endDate, fetchedAt: new Date(timestamp).toISOString(),
    series: Object.fromEntries(options.symbols.map(symbol => [symbol, { symbol, name: symbol, type: 'ETF', rows: [{ date: options.endDate, close }] }])) };
}

function controlledPool() {
  const calls = [];
  const auth = sessionFixture();
  let active = 0, peak = 0;
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: auth.getSessionGuard, loadHistory: options => {
    active += 1;
    peak = Math.max(peak, active);
    return new Promise((resolve, reject) => {
      calls.push({ options, resolve: data => { active -= 1; resolve(data); }, reject: error => { active -= 1; reject(error); } });
    });
  } });
  return { load, calls, auth, get peak() { return peak; } };
}

test('duplicate cards share pending work and completed results become synchronous display cache', async () => {
  const { load, calls } = controlledPool();
  const first = load(args()), duplicate = load(args({ force: true }));
  await settle();
  assert.equal(calls.length, 1);
  assert.notStrictEqual(first, duplicate);
  const history = historyFor();
  calls[0].resolve(history);
  assert.strictEqual(await first, history);
  assert.strictEqual(await duplicate, history);
  assert.strictEqual(load.peek(args()), history);
  assert.strictEqual(await load(args()), history);
  assert.equal(calls.length, 1, 'warm replay prices do not repeat the underlying history request');
});

test('at most two history loads run, and distinct queued requests start in order', async () => {
  const pool = controlledPool();
  const requests = ['NVDA', 'MSFT', 'AAPL', 'GOOG', 'META'].map(symbol => pool.load(args({ symbols: [symbol, 'QQQ'] })));
  await settle();
  assert.equal(REVIEW_STOCK_REPLAY_MAX_IN_FLIGHT, 2);
  assert.equal(pool.calls.length, 2);
  pool.calls[0].resolve('NVDA');
  await settle();
  assert.equal(pool.calls.length, 3);
  assert.equal(pool.calls[2].options.symbols[0], 'AAPL');
  pool.calls[1].resolve('MSFT');
  await settle();
  assert.equal(pool.calls[3].options.symbols[0], 'GOOG');
  pool.calls[2].resolve('AAPL');
  await settle();
  assert.equal(pool.calls[4].options.symbols[0], 'META');
  pool.calls[3].resolve('GOOG');
  pool.calls[4].resolve('META');
  assert.deepEqual(await Promise.all(requests), ['NVDA', 'MSFT', 'AAPL', 'GOOG', 'META']);
  assert.equal(pool.peak, 2);
});

test('cancelling one card does not abort history still needed by another card', async () => {
  const { load, calls } = controlledPool();
  const controller = new AbortController();
  const cancelled = load(args({ signal: controller.signal })), survivor = load(args());
  const rejection = assert.rejects(cancelled, aborted);
  await settle();
  assert.notStrictEqual(calls[0].options.signal, controller.signal);
  controller.abort();
  await rejection;
  assert.equal(calls[0].options.signal.aborted, false);
  calls[0].resolve('history');
  assert.equal(await survivor, 'history');
});

test('last running consumer aborts the loader, holding its slot until cancellation settles', async () => {
  const pool = controlledPool(), controller = new AbortController();
  const cancelled = pool.load(args({ signal: controller.signal }));
  const rejection = assert.rejects(cancelled, aborted);
  const second = pool.load(args({ symbols: ['MSFT', 'QQQ'] }));
  await settle();
  controller.abort();
  await rejection;
  assert.equal(pool.calls[0].options.signal.aborted, true);
  const retry = pool.load(args());
  await settle();
  assert.equal(pool.calls.length, 2);
  pool.calls[0].resolve('ignored late result');
  await settle();
  assert.equal(pool.calls.length, 3);
  const joinedRetry = pool.load(args({ force: true }));
  await settle();
  assert.equal(pool.calls.length, 3, 'old completion cannot remove the replacement request');
  pool.calls[1].resolve('MSFT');
  pool.calls[2].resolve('new history');
  assert.deepEqual(await Promise.all([second, retry, joinedRetry]), ['MSFT', 'new history', 'new history']);
  assert.equal(pool.peak, 2);
});

test('queued consumers cancel independently, and the last cancellation removes queued work', async () => {
  const { load, calls } = controlledPool();
  const first = load(args()), second = load(args({ symbols: ['MSFT', 'QQQ'] }));
  const left = new AbortController(), right = new AbortController();
  const queuedArgs = args({ symbols: ['AAPL', 'QQQ'] });
  const leftRequest = load({ ...queuedArgs, signal: left.signal });
  const rightRequest = load({ ...queuedArgs, signal: right.signal });
  const leftRejection = assert.rejects(leftRequest, aborted), rightRejection = assert.rejects(rightRequest, aborted);
  const following = load(args({ symbols: ['GOOG', 'QQQ'] }));
  left.abort();
  await leftRejection;
  right.abort();
  await rightRejection;
  await settle();
  assert.equal(calls.length, 2);
  calls[0].resolve('NVDA');
  await settle();
  assert.deepEqual(calls.map(call => call.options.symbols[0]), ['NVDA', 'MSFT', 'GOOG']);
  calls[1].resolve('MSFT');
  calls[2].resolve('GOOG');
  await Promise.all([first, second, following]);
});

test('an already-aborted caller never joins or schedules work', async () => {
  const { load, calls } = controlledPool(), controller = new AbortController();
  controller.abort();
  await assert.rejects(load(args({ signal: controller.signal })), aborted);
  await settle();
  assert.equal(calls.length, 0);
});

test('a surviving queued consumer still loads, and force promotes work that has not started', async () => {
  const { load, calls } = controlledPool(), controller = new AbortController();
  const first = load(args()), second = load(args({ symbols: ['MSFT', 'QQQ'] }));
  const queuedArgs = args({ symbols: ['AAPL', 'QQQ'] });
  const cancelled = load({ ...queuedArgs, signal: controller.signal });
  const rejection = assert.rejects(cancelled, aborted);
  const survivor = load({ ...queuedArgs, force: true });
  controller.abort();
  await rejection;
  await settle();
  calls[0].resolve('NVDA');
  await settle();
  assert.equal(calls.length, 3);
  assert.equal(calls[2].options.force, true);
  assert.equal(calls[2].options.signal.aborted, false);
  calls[1].resolve('MSFT');
  calls[2].resolve('AAPL');
  assert.deepEqual(await Promise.all([first, second, survivor]), ['NVDA', 'MSFT', 'AAPL']);
});

test('keys isolate accounts, ordered symbols and date windows while normalizing valid identities', async () => {
  const calls = [];
  const auth = sessionFixture();
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: auth.getSessionGuard, loadHistory: async options => { calls.push(options); return historyFor(options); } });
  const base = load(args());
  const normalized = load(args({ userId: ' user-a ', symbols: [' nvda ', 'qqq'] }));
  const otherRequests = [
    { symbols: ['NVDA', 'SPY'] },
    { symbols: ['QQQ', 'NVDA'] },
    { startDate: '2026-10-23' },
    { endDate: '2026-10-23' },
  ].map(overrides => load(args(overrides)));
  const [first, equivalent] = await Promise.all([base, normalized, ...otherRequests]);
  assert.strictEqual(first, equivalent);
  assert.equal(calls.length, 5);
  auth.emit('SIGNED_IN', 'user-b');
  assert.equal(load.peek(args()), null, 'switching users invalidates the previous owner synchronously');
  await load(args({ userId: 'user-b' }));
  assert.equal(calls.length, 6);
});

test('shared errors are delivered without retries or retention, and a later explicit call can retry', async () => {
  const { load, calls } = controlledPool();
  const first = load(args()), duplicate = load(args());
  const failure = Object.assign(new Error('History unavailable'), { code: 'NETWORK_ERROR' });
  const firstRejection = assert.rejects(first, error => error === failure);
  const duplicateRejection = assert.rejects(duplicate, error => error === failure);
  await settle();
  calls[0].reject(failure);
  await Promise.all([firstRejection, duplicateRejection]);
  await settle();
  assert.equal(calls.length, 1);
  const retried = load(args({ force: true }));
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.force, true);
  calls[1].resolve('recovered');
  assert.equal(await retried, 'recovered');
});

test('synchronous loader failures release their slot and can be retried', async () => {
  let calls = 0;
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: sessionFixture().getSessionGuard, loadHistory: () => {
    if (++calls === 1) throw Object.assign(new Error('Invalid request'), { code: 'INVALID_RANGE' });
    return 'history';
  } });
  await assert.rejects(load(args()), { code: 'INVALID_RANGE' });
  assert.equal(await load(args()), 'history');
});

test('replay cache extends only replay reuse; ordinary comparisons still expire after five minutes', async () => {
  resetStockComparisonCache();
  const auth = sessionFixture();
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: auth.getSessionGuard });
  const initialTime = NOW;
  let now = initialTime, fetches = 0;
  const options = args({ now: () => now,
    getSession: auth.client.auth.getSession,
    fetchImpl: async () => {
      fetches += 1;
      const data = { version: 1, source: 'EODHD_EOD_SPLITS', priceBasis: 'split_adjusted_close', currency: 'USD',
        symbols: ['NVDA', 'QQQ'], requestedStartDate: '2026-10-22', requestedEndDate: '2026-10-26',
        expectedAsOfDate: '2026-10-26', splitBasisDate: '2026-10-26', asOfDate: '2026-10-26', fetchedAt: new Date(now).toISOString(),
        series: Object.fromEntries(['NVDA', 'QQQ'].map(symbol => [symbol, { symbol, name: symbol, type: 'ETF', rows: [{ date: '2026-10-26', close: 100 }] }])) };
      return { ok: true, status: 200, json: async () => ({ success: true, data }) };
    },
  });
  const original = await load(options);
  now += STOCK_COMPARISON_CACHE_MS - 1;
  assert.strictEqual(await load(options), original);
  assert.equal(fetches, 1);
  assert.equal(auth.calls.session, 6, 'cold history checks and both warm replay session checks remain enabled');
  now = initialTime + STOCK_COMPARISON_CACHE_MS;
  assert.strictEqual(await load(options), original);
  assert.equal(fetches, 1);
  assert.notStrictEqual(await loadStockComparison(options), original);
  assert.equal(fetches, 2, 'the ordinary comparison cache retains its original five-minute lifetime');
  auth.emit('SIGNED_IN', 'user-b');
  await assert.rejects(load(options), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.equal(fetches, 2);
  resetStockComparisonCache();
});

test('complete prices remain fresh for six hours and warm reads do not slide that deadline', async () => {
  const auth = sessionFixture();
  let now = NOW, calls = 0;
  const options = args({ now: () => now });
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: auth.getSessionGuard,
    loadHistory: async request => historyFor(request, ++calls) });
  const original = await load(options);
  assert.equal(REVIEW_STOCK_REPLAY_CACHE_MS, 6 * 60 * 60 * 1000);
  assert.strictEqual(load.peek(options), original);
  assert.equal(load.isCurrent(options, original), true);
  now += REVIEW_STOCK_REPLAY_CACHE_MS - 1;
  assert.strictEqual(await load(options), original);
  assert.equal(calls, 1);
  now++;
  assert.strictEqual(load.peek(options), original, 'expired prices remain displayable while this close is unchanged');
  assert.notStrictEqual(await load(options), original);
  assert.equal(calls, 2, 'the earlier warm read did not renew freshness');
  assert.equal(auth.calls.session, 6, 'every replay delivery verifies its session twice');
});

test('an incomplete close retries after five minutes without freezing partial history for six hours', async () => {
  let now = NOW, calls = 0;
  const options = args({ now: () => now });
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: sessionFixture().getSessionGuard,
    loadHistory: async request => {
      calls++;
      const data = historyFor(request);
      data.series.QQQ.rows[0].date = data.asOfDate = '2026-10-23';
      return data;
    } });
  const original = await load(options);
  assert.equal(REVIEW_STOCK_REPLAY_INCOMPLETE_CACHE_MS, 5 * 60 * 1000);
  now += REVIEW_STOCK_REPLAY_INCOMPLETE_CACHE_MS - 1;
  assert.strictEqual(await load(options), original);
  now++;
  assert.notStrictEqual(await load(options), original);
  assert.equal(calls, 2);
});

test('stale same-close display survives a network failure for at most twenty-four hours', async () => {
  const weekend = Date.parse('2026-11-07T02:00:00Z');
  let now = weekend, failure = null;
  const options = args({ startDate: '2026-11-02', endDate: '2026-11-06', now: () => now });
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: sessionFixture().getSessionGuard,
    loadHistory: async request => { if (failure) throw failure; return historyFor(request); } });
  const original = await load(options);
  failure = Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' });
  now += REVIEW_STOCK_REPLAY_CACHE_MS;
  await assert.rejects(load(options), error => error === failure);
  assert.strictEqual(load.peek(options), original);
  assert.equal(load.isCurrent(options, original), true);
  now = weekend + REVIEW_STOCK_REPLAY_DISPLAY_MS - 1;
  assert.strictEqual(load.peek(options), original);
  now++;
  assert.equal(load.peek(options), null);
  assert.equal(load.isCurrent(options, original), false, 'mounted data also expires instead of bypassing the display bound');
});

test('a completed market session rotates cache keys and cannot display the previous split basis', async () => {
  let now = NOW, calls = 0;
  const options = args({ now: () => now });
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: sessionFixture().getSessionGuard,
    loadHistory: async request => historyFor(request, ++calls) });
  const old = await load(options);
  now = Date.parse('2026-10-27T20:01:00Z');
  assert.equal(load.peek(options), null, 'even a fixed historical window uses the current split basis');
  assert.equal(load.isCurrent(options, old), false);
  const current = await load(options);
  assert.equal(current.splitBasisDate, '2026-10-27');
  assert.equal(calls, 2);
});

test('crossing a completed close during a request rejects its response and clears the obsolete delivery', async () => {
  const pool = controlledPool();
  let now = NOW;
  const options = args({ now: () => now });
  const originalRequest = pool.load(options);
  await settle();
  const old = historyFor(options);
  pool.calls[0].resolve(old); await originalRequest;
  const refresh = pool.load({ ...options, force: true });
  const rejection = assert.rejects(refresh, { code: 'REQUEST_SUPERSEDED' });
  await settle();
  now = Date.parse('2026-10-27T20:01:00Z');
  pool.calls[1].resolve(historyFor(args()));
  await rejection;
  assert.equal(pool.load.peek(options), null);
  assert.equal(pool.load.isCurrent(args(), old), false, 'failure also invalidates an already delivered old-key object');
});

test('explicit force refresh replaces fresh history while ordinary reopens reuse it', async () => {
  let calls = 0;
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: sessionFixture().getSessionGuard,
    loadHistory: async request => historyFor(request, ++calls) });
  const original = await load(args());
  const forced = await load(args({ force: true }));
  assert.notStrictEqual(forced, original);
  assert.strictEqual(load.peek(args()), forced);
  assert.strictEqual(await load(args()), forced);
  assert.equal(calls, 2);
});

test('invalid, unauthorized and superseded refreshes remove cached and already delivered prices', async () => {
  for (const code of ['INVALID_DATA', 'AUTH_REQUIRED', 'REVIEW_AUTH_REQUIRED', 'REVIEW_ACCOUNT_CHANGED', 'REQUEST_SUPERSEDED']) {
    let failure = null;
    const load = createReviewStockReplayHistoryLoader({ getSessionGuard: sessionFixture().getSessionGuard,
      loadHistory: async request => { if (failure) throw failure; return historyFor(request); } });
    const original = await load(args());
    failure = Object.assign(new Error(code), { code });
    await assert.rejects(load(args({ force: true })), error => error === failure);
    assert.equal(load.peek(args()), null, code);
    assert.equal(load.isCurrent(args(), original), false, code);
  }
});

test('same-user token refresh preserves display, but signout and account changes notify and invalidate synchronously', async () => {
  const auth = sessionFixture();
  let notifications = 0;
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: auth.getSessionGuard, loadHistory: async request => historyFor(request) });
  const unsubscribe = load.subscribe(() => notifications++);
  const original = await load(args());
  auth.emit('TOKEN_REFRESHED', 'user-a');
  auth.emit('SIGNED_IN', 'user-a');
  assert.strictEqual(load.peek(args()), original);
  assert.equal(notifications, 0);
  auth.emit('SIGNED_OUT', null);
  auth.emit('SIGNED_IN', 'user-a');
  assert.equal(load.peek(args()), null);
  assert.equal(load.isCurrent(args(), original), false);
  assert.ok(notifications > 0);
  await load(args());
  auth.emit('SIGNED_IN', 'user-b');
  assert.equal(load.peek(args()), null);
  const next = await load(args({ userId: 'user-b' }));
  assert.strictEqual(load.peek(args({ userId: 'user-b' })), next);
  assert.equal(load.peek(args()), null);
  const before = notifications;
  unsubscribe(); auth.emit('SIGNED_OUT', null);
  assert.equal(notifications, before);
});

test('a session mismatch without an auth event is still detected on a warm load', async () => {
  const auth = sessionFixture();
  let calls = 0;
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: auth.getSessionGuard,
    loadHistory: async request => { calls++; return historyFor(request); } });
  const original = await load(args());
  auth.setUser('user-b');
  await assert.rejects(load(args()), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.equal(load.peek(args()), null);
  assert.equal(load.isCurrent(args(), original), false);
  assert.equal(calls, 1);
});

test('identity invalidation aborts queued work and late previous-session data cannot repopulate the cache', async () => {
  const pool = controlledPool();
  const requests = [pool.load(args()), pool.load(args({ symbols: ['MSFT', 'QQQ'] })), pool.load(args({ symbols: ['AAPL', 'QQQ'] }))];
  const rejections = requests.map(request => assert.rejects(request, error => ['REQUEST_ABORTED', 'REVIEW_ACCOUNT_CHANGED'].includes(error.code)));
  await settle();
  pool.auth.emit('SIGNED_IN', 'user-b'); pool.auth.emit('SIGNED_IN', 'user-a');
  assert.ok(pool.calls.every(call => call.options.signal.aborted));
  pool.calls.forEach(call => call.resolve(historyFor(call.options)));
  await Promise.all(rejections);
  assert.equal(pool.calls.length, 2, 'cancelled queued work must not dispatch to the loader');
  assert.equal(pool.load.peek(args()), null);
});

test('a late failure from a prior login cannot invalidate the new login successful cache', async () => {
  const pool = controlledPool();
  const oldRequest = pool.load(args());
  const rejection = assert.rejects(oldRequest, error => ['REQUEST_ABORTED', 'REVIEW_ACCOUNT_CHANGED'].includes(error.code));
  await settle();
  pool.auth.emit('SIGNED_OUT', null); pool.auth.emit('SIGNED_IN', 'user-a');
  const newRequest = pool.load(args());
  await settle();
  const current = historyFor(args(), 200);
  pool.calls[1].resolve(current); await newRequest;
  assert.strictEqual(pool.load.peek(args()), current);
  pool.calls[0].resolve(historyFor(args(), 100));
  await rejection;
  assert.strictEqual(pool.load.peek(args()), current, 'late old completion must not delete or invalidate the replacement entry');
  assert.equal(pool.load.isCurrent(args(), current), true);
});

test('the bounded cache evicts after sixteen keys without invalidating a currently mounted delivery', async () => {
  let calls = 0;
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: sessionFixture().getSessionGuard,
    loadHistory: async request => { calls++; return historyFor(request); } });
  const original = await load(args());
  for (let index = 0; index < 16; index++) await load(args({ symbols: [`TEST${index}`, 'QQQ'] }));
  assert.equal(load.peek(args()), null);
  assert.equal(load.isCurrent(args(), original), true, 'eviction controls shared retention, not an authenticated live card');
  assert.ok(load.peek(args({ symbols: ['TEST15', 'QQQ'] })));
  await load(args());
  assert.equal(calls, 18);
});

test('legacy getUser-only clients cannot obtain a synchronous cache hit without session events', async () => {
  const auth = sessionFixture('user-a', { legacy: true });
  let calls = 0;
  const load = createReviewStockReplayHistoryLoader({ getSessionGuard: auth.getSessionGuard,
    loadHistory: async request => { calls++; return historyFor(request); } });
  const original = await load(args());
  assert.equal(load.peek(args()), null);
  assert.equal(load.isCurrent(args(), original), false, 'legacy delivery cannot bypass the synchronous identity check through mounted component state');
  assert.strictEqual(await load(args()), original);
  assert.equal(calls, 1);
  assert.equal(auth.calls.user, 4);
  auth.setUser('user-b');
  assert.equal(load.isCurrent(args(), original), false);
  await assert.rejects(load(args()), { code: 'REVIEW_ACCOUNT_CHANGED' });
});

test('invalid refreshes revoke every same-key delivery even after replacement or shared-cache eviction', async () => {
  for (const evict of [false, true]) {
    let failure = null;
    const load = createReviewStockReplayHistoryLoader({ getSessionGuard: sessionFixture().getSessionGuard,
      loadHistory: async request => { if (failure) throw failure; return historyFor(request); } });
    const original = await load(args());
    if (evict) {
      for (let index = 0; index < 16; index++) await load(args({ symbols: [`TEST${index}`, 'QQQ'] }));
      assert.equal(load.peek(args()), null);
    } else {
      const replacement = await load(args({ force: true }));
      assert.notStrictEqual(replacement, original);
    }
    if (evict) assert.equal(load.isCurrent(args(), original), true);
    failure = Object.assign(new Error('invalid response'), { code: 'INVALID_DATA' });
    await assert.rejects(load(args({ force: true })), error => error === failure);
    assert.equal(load.isCurrent(args(), original), false, `${evict ? 'evicted' : 'replaced'} live data must not bypass a same-key validation failure`);
  }
});

test('late invalid errors from cancelled work cannot remove a successful replacement request', async () => {
  const pool = controlledPool(), controller = new AbortController();
  const oldRequest = pool.load(args({ signal: controller.signal }));
  const rejection = assert.rejects(oldRequest, aborted);
  await settle();
  controller.abort(); await rejection;
  const nextRequest = pool.load(args());
  await settle();
  const current = historyFor(args(), 200);
  pool.calls[1].resolve(current); await nextRequest;
  pool.calls[0].reject(Object.assign(new Error('late invalid response'), { code: 'INVALID_DATA' }));
  await settle();
  assert.strictEqual(pool.load.peek(args()), current);
  assert.equal(pool.load.isCurrent(args(), current), true);
});
