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
    version: 2,
    source: 'CBOE_EODHD_EOD',
    fetchedAt: new Date(NOW).toISOString(),
    expectedAsOfDate: '2026-09-04',
    asOfDate: '2026-09-04',
    availableFromDate: '2026-09-03',
    pointCount: 2,
    stale: false,
    staleReason: '',
    termStructure: {
      source: 'CBOE', asOfDate: '2026-09-04', expectedAsOfDate: '2026-09-04',
      fetchedAt: new Date(NOW).toISOString(), stale: false, staleReason: '',
      rows: [
        { date: '2026-09-03', vix: 18, vix3m: 20, ratio: 0.9 },
        { date: '2026-09-04', vix: 17, vix3m: 20, ratio: 0.85 },
      ],
    },
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
  assert.equal(getVixComparisonExpectedCloseDate(new Date('2026-09-08T20:00:00Z')), '2026-09-04');
  assert.equal(getVixComparisonExpectedCloseDate(new Date('2026-09-08T20:30:00Z')), '2026-09-08');
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
    (value) => { value.version = 1; },
    (value) => { value.termStructure.source = 'EODHD'; },
    (value) => { value.termStructure.rows[1].vix3m = 0; },
    (value) => { value.termStructure.rows[1].ratio = 1.1; },
    (value) => { value.termStructure.rows[1].date = '2026-09-08'; },
    (value) => { value.termStructure.rows.reverse(); },
    (value) => { value.termStructure.asOfDate = '2026-09-03'; },
    (value) => { value.termStructure.fetchedAt = '2099-01-01T00:00:00Z'; },
    (value) => { value.termStructure.rows[0].vix = 17; value.termStructure.rows[0].ratio = 0.85; },
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
  now = Date.parse('2026-09-08T20:30:00Z');
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
  older.termStructure = {
    ...older.termStructure, asOfDate: '2026-09-03', stale: true, staleReason: 'incomplete_close',
    rows: [{ date: '2026-09-02', vix: 18, vix3m: 20, ratio: .9 }, { date: '2026-09-03', vix: 17, vix3m: 20, ratio: .85 }],
  };
  const result = await loadVixComparison(args({ force: true, fetchImpl: async () => response(older) }));
  assert.equal(result.asOfDate, '2026-09-04');
  assert.equal(result.stale, true);
  assert.deepEqual(result.series, payload().series);
});

test('missing VIX3M leaves market history available and retries within the same completed version', async () => {
  resetVixComparisonMemoryCache();
  let now = NOW;
  let count = 0;
  const partial = payload({ termStructure: {
    source: 'CBOE', asOfDate: null, expectedAsOfDate: '2026-09-04', fetchedAt: new Date(NOW).toISOString(),
    stale: true, staleReason: 'provider_unavailable', rows: [],
  } });
  const options = args({ now: () => now, fetchImpl: async () => { count += 1; return response(count === 1 ? partial : payload()); } });
  const first = await loadVixComparison(options);
  assert.equal(first.stale, false, 'complete market history remains usable');
  assert.equal(first.termStructure.stale, true);
  assert.equal(first.termStructure.asOfDate, null);
  assert.deepEqual(first.termStructure.rows, []);
  now += VIX_COMPARISON_STALE_RETRY_MS - 1;
  await loadVixComparison(options);
  assert.equal(count, 1);
  now += 2;
  const recovered = await loadVixComparison(options);
  assert.equal(count, 2);
  assert.equal(recovered.termStructure.stale, false);
  assert.equal(recovered.termStructure.asOfDate, '2026-09-04');
});

test('a new close version invalidates term assessment even when server metadata has not rolled yet', () => {
  const normalized = normalizeVixComparison(payload(), { now: Date.parse('2026-09-08T21:00:00Z') });
  assert.equal(normalized.termStructure.expectedAsOfDate, '2026-09-08');
  assert.equal(normalized.termStructure.stale, true);
  assert.equal(normalized.termStructure.asOfDate, '2026-09-04');
});

test('same-day term regression retains original observations and marks only the term block stale', async () => {
  resetVixComparisonMemoryCache();
  const first = await loadVixComparison(args());
  const older = payload();
  older.termStructure.rows.pop();
  older.termStructure.asOfDate = '2026-09-03';
  older.termStructure.stale = true;
  older.termStructure.staleReason = 'incomplete_close';
  const next = await loadVixComparison(args({ force: true, fetchImpl: async () => response(older) }));
  assert.equal(next.stale, false);
  assert.equal(next.termStructure.stale, true);
  assert.equal(next.termStructure.asOfDate, '2026-09-04');
  assert.deepEqual(next.termStructure.rows, first.termStructure.rows);
  assert.equal(next.termStructure.fetchedAt, first.termStructure.fetchedAt);
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

function crossedDatePayloads() {
  const previous = payload();
  previous.termStructure.rows.pop();
  previous.termStructure.asOfDate = '2026-09-03';
  previous.termStructure.stale = true;
  previous.termStructure.staleReason = 'incomplete_close';
  const incoming = payload({
    asOfDate: '2026-09-03', availableFromDate: '2026-09-02',
    stale: true, staleReason: 'incomplete_close', fetchedAt: new Date(NOW + 1000).toISOString(),
  });
  for (const series of Object.values(incoming.series)) {
    series.rows = [
      { date: '2026-09-02', close: series.symbol === 'VIX' ? 19 : 390 },
      { date: '2026-09-03', close: series.symbol === 'VIX' ? 18 : 400 },
    ];
  }
  incoming.termStructure.fetchedAt = new Date(NOW + 1000).toISOString();
  return { previous, incoming };
}

test('price regression preserves newer independent term observations and their actual freshness', async () => {
  resetVixComparisonMemoryCache();
  const { previous, incoming } = crossedDatePayloads();
  const first = await loadVixComparison(args({ fetchImpl: async () => response(previous) }));
  const merged = await loadVixComparison(args({
    force: true, now: NOW + 1000, fetchImpl: async () => response(incoming),
  }));
  assert.equal(merged.asOfDate, '2026-09-04');
  assert.equal(merged.fetchedAt, first.fetchedAt);
  assert.equal(merged.stale, true);
  assert.deepEqual(merged.series, first.series);
  assert.equal(merged.termStructure.asOfDate, '2026-09-04');
  assert.equal(merged.termStructure.stale, false);
  assert.equal(merged.termStructure.staleReason, '');
  assert.equal(merged.termStructure.fetchedAt, incoming.termStructure.fetchedAt);
  assert.deepEqual(merged.termStructure.rows, incoming.termStructure.rows);
});

test('price-cache merge rejects a newly overlapping conflicting VIX term close without replacing the cache', async () => {
  resetVixComparisonMemoryCache();
  const { previous, incoming } = crossedDatePayloads();
  const first = await loadVixComparison(args({ fetchImpl: async () => response(previous) }));
  incoming.termStructure.rows.at(-1).vix = 17.25;
  incoming.termStructure.rows.at(-1).ratio = 17.25 / 20;
  assert.ok(normalizeVixComparison(incoming, { now: NOW + 1000 }), 'incoming prices have no conflicting date before the cache merge');
  await assert.rejects(loadVixComparison(args({
    force: true, now: NOW + 1000, fetchImpl: async () => response(incoming),
  })), { code: 'INVALID_DATA' });
  const retained = await loadVixComparison(args({
    now: NOW + 1000, fetchImpl: async () => { throw new Error('cache should remain intact'); },
  }));
  assert.strictEqual(retained, first);
});

test('term-cache merge also rejects conflicting revised prices instead of mixing valid but inconsistent sources', async () => {
  resetVixComparisonMemoryCache();
  const first = await loadVixComparison(args());
  const incoming = payload();
  incoming.series.VIX.rows.at(-1).close = 16;
  incoming.termStructure.rows.pop();
  incoming.termStructure.asOfDate = '2026-09-03';
  incoming.termStructure.stale = true;
  incoming.termStructure.staleReason = 'incomplete_close';
  assert.ok(normalizeVixComparison(incoming, { now: NOW }), 'incoming term has no overlapping revised close');
  await assert.rejects(loadVixComparison(args({ force: true, fetchImpl: async () => response(incoming) })), { code: 'INVALID_DATA' });
  const retained = await loadVixComparison(args({ fetchImpl: async () => { throw new Error('cache should remain intact'); } }));
  assert.strictEqual(retained, first);
});
