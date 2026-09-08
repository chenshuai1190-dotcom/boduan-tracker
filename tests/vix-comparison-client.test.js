import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getVixComparisonExpectedCloseDate,
  loadVixComparison,
  normalizeVixComparison,
  resetVixComparisonMemoryCache,
  VIX_COMPARISON_FAILURE_RETRY_MS,
  VIX_COMPARISON_STALE_RETRY_MS,
} from '../src/lib/vixComparison.js';

const NOW = Date.parse('2026-09-08T12:00:00Z');

function payload(overrides = {}) {
  return {
    version: 1,
    source: 'EODHD_EOD',
    fetchedAt: new Date(NOW).toISOString(),
    expectedAsOfDate: '2026-09-04',
    asOfDate: '2026-09-04',
    availableFromDate: '2026-09-03',
    pointCount: 2,
    stale: false,
    staleReason: '',
    series: Object.fromEntries(['VIX', 'SPY', 'QQQ'].map((symbol) => [symbol, {
      symbol,
      priceBasis: symbol === 'VIX' ? 'close' : 'adjusted_close',
      unit: symbol === 'VIX' ? 'points' : 'USD',
      rows: [
        { date: '2026-09-03', close: symbol === 'VIX' ? 18 : 400 },
        { date: '2026-09-04', close: symbol === 'VIX' ? 17 : 410 },
      ],
    }])),
    ...overrides,
  };
}

function auth(userId = 'user-a') {
  return async () => ({ data: { session: { user: { id: userId }, access_token: `test-${userId}` } } });
}

function response(data = payload(), status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ success: status === 200, data }) };
}

function args(overrides = {}) {
  return { userId: 'user-a', getSession: auth(), now: () => NOW, fetchImpl: async () => response(), ...overrides };
}

test('expected close key skips weekends, holidays and unfinished sessions', () => {
  assert.equal(getVixComparisonExpectedCloseDate(new Date('2026-09-08T12:00:00Z')), '2026-09-04', 'Labor Day is not a new cache version');
  assert.equal(getVixComparisonExpectedCloseDate(new Date('2026-09-08T20:00:00Z')), '2026-09-08');
  assert.equal(getVixComparisonExpectedCloseDate(new Date('2026-07-06T12:00:00Z')), '2026-07-02', 'observed Independence Day is skipped');
  assert.throws(() => getVixComparisonExpectedCloseDate(Number.MAX_VALUE), /invalid comparison clock/);
});

test('normalizer accepts only aligned positive completed historical values and expected metadata', () => {
  assert.deepEqual(normalizeVixComparison(payload(), { now: NOW }), payload());
  const mutations = [
    (value) => { value.series.SPY.rows[0].close = 0; },
    (value) => { value.series.VIX.rows[0].close = Infinity; },
    (value) => { value.series.SPY.rows[0].close = '400'; },
    (value) => { value.series.SPY.rows[0].date = '2026-09-02'; },
    (value) => { value.series.SPY.rows[0].date = '2026-02-30'; },
    (value) => { value.series.QQQ.rows.reverse(); },
    (value) => { value.series.QQQ.rows[0].date = value.series.QQQ.rows[1].date; },
    (value) => { value.series.SPY.rows[1].date = '2026-09-08'; },
    (value) => { value.series.SPY.priceBasis = 'close'; },
    (value) => { value.series.VIX.unit = 'USD'; },
    (value) => { value.series.VIX.symbol = 'SPY'; },
    (value) => { value.series.QQQ.rows = []; },
    (value) => { value.expectedAsOfDate = '2026-09-08'; },
    (value) => { value.asOfDate = '2026-09-03'; },
    (value) => { value.availableFromDate = '2026-09-02'; },
    (value) => { value.pointCount = 1; },
    (value) => { value.fetchedAt = '2099-01-01T00:00:00Z'; },
    (value) => { value.version = 2; },
  ];
  for (const mutate of mutations) {
    const value = payload();
    mutate(value);
    assert.equal(normalizeVixComparison(value, { now: NOW }), null);
  }
});

test('complete cache persists through focus-like calls but rotates on a completed trading day', async () => {
  resetVixComparisonMemoryCache();
  let now = NOW;
  let count = 0;
  const options = args({ now: () => now, fetchImpl: async () => { count += 1; return response(); } });
  await loadVixComparison(options);
  now += 5 * 60 * 60 * 1000;
  await loadVixComparison(options);
  assert.equal(count, 1, 'same close version never starts a focus/short-interval refresh');
  now = Date.parse('2026-09-08T20:00:00Z');
  const data = await loadVixComparison(options);
  assert.equal(count, 2);
  assert.equal(data.stale, true);
  assert.equal(data.expectedAsOfDate, '2026-09-08');
  await loadVixComparison(options);
  assert.equal(count, 2, 'incomplete daily data has a bounded retry window');
  now += VIX_COMPARISON_STALE_RETRY_MS;
  await loadVixComparison(options);
  assert.equal(count, 3);
});

test('requests carry authenticated token and never reuse another user cache', async () => {
  resetVixComparisonMemoryCache();
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, options }); return response(); };
  await loadVixComparison(args({ fetchImpl }));
  await loadVixComparison(args({ fetchImpl, userId: 'user-b', getSession: auth('user-b') }));
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, '/api/quote?view=vix-comparison');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-user-a');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer test-user-b');
  await assert.rejects(loadVixComparison(args({ fetchImpl, getSession: auth('user-b') })), { code: 'AUTH_REQUIRED' });
  assert.equal(requests.length, 2, 'identity mismatch cannot unlock a cache or start a request');
});

test('missing session fails even on a warm cache, without stale fallback', async () => {
  resetVixComparisonMemoryCache();
  await loadVixComparison(args());
  await assert.rejects(loadVixComparison(args({ getSession: async () => ({ data: { session: null } }) })), { code: 'AUTH_REQUIRED' });
  await assert.rejects(loadVixComparison(args({ userId: '' })), { code: 'AUTH_REQUIRED' });
});

test('concurrent requests share one network call including forced refresh', async () => {
  resetVixComparisonMemoryCache();
  let resolveFetch;
  let count = 0;
  const options = args({ fetchImpl: () => { count += 1; return new Promise((resolve) => { resolveFetch = resolve; }); } });
  const first = loadVixComparison(options);
  const second = loadVixComparison({ ...options, force: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(count, 1);
  resolveFetch(response());
  const [a, b] = await Promise.all([first, second]);
  assert.strictEqual(a, b);
});

test('network failure preserves actual historical dates, marks stale, and backs off', async () => {
  resetVixComparisonMemoryCache();
  let count = 0;
  let now = NOW;
  const options = args({
    now: () => now,
    fetchImpl: async () => { count += 1; if (count > 1) throw new Error('offline'); return response(); },
  });
  await loadVixComparison(options);
  const stale = await loadVixComparison({ ...options, force: true });
  assert.equal(stale.stale, true);
  assert.equal(stale.staleReason, 'provider_unavailable');
  assert.equal(stale.asOfDate, '2026-09-04');
  assert.equal(stale.fetchedAt, new Date(NOW).toISOString());
  await loadVixComparison(options);
  assert.equal(count, 2);
  now += VIX_COMPARISON_FAILURE_RETRY_MS;
  await loadVixComparison(options);
  assert.equal(count, 3, 'failure expires before a cache hit can hide the missing retry');
});

test('cold request errors back off and explicit retry may recover', async () => {
  resetVixComparisonMemoryCache();
  let count = 0;
  const options = args({ fetchImpl: async () => { count += 1; return count === 1 ? response(null, 502) : response(); } });
  await assert.rejects(loadVixComparison(options), { code: 'NETWORK_ERROR' });
  await assert.rejects(loadVixComparison(options), { code: 'NETWORK_ERROR' });
  assert.equal(count, 1);
  assert.equal((await loadVixComparison({ ...options, force: true })).stale, false);
  assert.equal(count, 2);
});

test('401/403 invalidate successful cache and are never degraded to stale data', async () => {
  for (const status of [401, 403]) {
    resetVixComparisonMemoryCache();
    await loadVixComparison(args());
    await assert.rejects(loadVixComparison(args({ force: true, fetchImpl: async () => response(null, status) })), { code: 'AUTH_REQUIRED' });
    await assert.rejects(loadVixComparison(args({ fetchImpl: async () => response(null, 502) })), { code: 'NETWORK_ERROR' });
  }
});

test('account switch during success or network failure rejects the old request', async () => {
  for (const failed of [false, true]) {
    resetVixComparisonMemoryCache();
    await loadVixComparison(args());
    let activeUser = 'user-a';
    await assert.rejects(loadVixComparison(args({
      force: true,
      getSession: () => auth(activeUser)(),
      fetchImpl: async () => {
        activeUser = 'user-b';
        if (failed) throw new Error('offline');
        return response();
      },
    })), { code: 'AUTH_REQUIRED' });
  }
});

test('invalid response never silently falls back to earlier successful data', async () => {
  resetVixComparisonMemoryCache();
  await loadVixComparison(args());
  await assert.rejects(loadVixComparison(args({ force: true, fetchImpl: async () => response(payload({ pointCount: 0 })) })), { code: 'INVALID_DATA' });
});

test('a response with an older common close never overwrites newer successful history', async () => {
  resetVixComparisonMemoryCache();
  await loadVixComparison(args());
  const older = payload({ asOfDate: '2026-09-03', availableFromDate: '2026-09-02', stale: true, staleReason: 'incomplete_close' });
  for (const series of Object.values(older.series)) {
    series.rows[0].date = '2026-09-02';
    series.rows[1].date = '2026-09-03';
  }
  const result = await loadVixComparison(args({ force: true, fetchImpl: async () => response(older) }));
  assert.equal(result.asOfDate, '2026-09-04');
  assert.equal(result.stale, true);
  assert.deepEqual(result.series, payload().series);
});

test('request timeout aborts and releases the in-flight entry for an explicit retry', async () => {
  resetVixComparisonMemoryCache();
  let signal;
  await assert.rejects(loadVixComparison(args({ timeoutMs: 5, fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } })), { code: 'NETWORK_ERROR' });
  assert.equal(signal.aborted, true);
  assert.equal((await loadVixComparison(args({ force: true }))).stale, false);
});
