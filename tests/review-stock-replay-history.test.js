import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewStockReplayHistoryLoader, REVIEW_STOCK_REPLAY_MAX_IN_FLIGHT } from '../src/lib/reviewStockReplayHistory.js';
import { resetStockComparisonCache, STOCK_COMPARISON_CACHE_MS } from '../src/lib/stockComparison.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
const args = overrides => ({ userId: 'user-a', symbols: ['NVDA', 'QQQ'], startDate: '2026-10-22', endDate: '2026-10-26', ...overrides });
const aborted = { name: 'AbortError', code: 'REQUEST_ABORTED' };

function controlledPool() {
  const calls = [];
  let active = 0, peak = 0;
  const load = createReviewStockReplayHistoryLoader({ loadHistory: options => {
    active += 1;
    peak = Math.max(peak, active);
    return new Promise((resolve, reject) => {
      calls.push({ options, resolve: data => { active -= 1; resolve(data); }, reject: error => { active -= 1; reject(error); } });
    });
  } });
  return { load, calls, get peak() { return peak; } };
}

test('duplicate cards and forced callers share pending work, without a new success cache', async () => {
  const { load, calls } = controlledPool();
  const first = load(args()), duplicate = load(args({ force: true }));
  await settle();
  assert.equal(calls.length, 1);
  assert.notStrictEqual(first, duplicate);
  const history = { series: { NVDA: { rows: [] } } };
  calls[0].resolve(history);
  assert.strictEqual(await first, history);
  assert.strictEqual(await duplicate, history);
  const next = load(args());
  await settle();
  assert.equal(calls.length, 2, 'completed requests always return through the existing loader');
  calls[1].resolve(history);
  await next;
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
  const load = createReviewStockReplayHistoryLoader({ loadHistory: async options => { calls.push(options); return options; } });
  const base = load(args());
  const normalized = load(args({ userId: ' user-a ', symbols: [' nvda ', 'qqq'] }));
  const otherRequests = [
    { userId: 'user-b' },
    { symbols: ['NVDA', 'SPY'] },
    { symbols: ['QQQ', 'NVDA'] },
    { startDate: '2026-10-23' },
    { endDate: '2026-10-23' },
  ].map(overrides => load(args(overrides)));
  const [first, equivalent] = await Promise.all([base, normalized, ...otherRequests]);
  assert.strictEqual(first, equivalent);
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
  const load = createReviewStockReplayHistoryLoader({ loadHistory: () => {
    if (++calls === 1) throw Object.assign(new Error('Invalid request'), { code: 'INVALID_RANGE' });
    return 'history';
  } });
  await assert.rejects(load(args()), { code: 'INVALID_RANGE' });
  assert.equal(await load(args()), 'history');
});

test('existing loader still rechecks authentication and owns the original success-cache expiry', async () => {
  resetStockComparisonCache();
  const load = createReviewStockReplayHistoryLoader();
  const initialTime = Date.parse('2026-10-27T12:00:00Z');
  let now = initialTime, activeUser = 'user-a', fetches = 0, authChecks = 0;
  const options = args({ now: () => now,
    getSession: async () => { authChecks += 1; return { data: { session: { user: { id: activeUser }, access_token: 'test-token' } } }; },
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
  assert.equal(authChecks, 4, 'warm results still pass through both existing auth checks');
  now = initialTime + STOCK_COMPARISON_CACHE_MS;
  assert.notStrictEqual(await load(options), original);
  assert.equal(fetches, 2, 'the replay pool does not extend a warm success-cache lifetime');
  activeUser = 'user-b';
  await assert.rejects(load(options), { code: 'AUTH_REQUIRED' });
  assert.equal(fetches, 2);
  resetStockComparisonCache();
});
