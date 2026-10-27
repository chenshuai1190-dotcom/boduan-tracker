import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStockComparison, resetStockComparisonCache, STOCK_COMPARISON_CACHE_MS, STOCK_COMPARISON_TIMEOUT_MS } from '../src/lib/stockComparison.js';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const START = '2026-10-22';
const END = '2026-10-26';
const auth = (id = 'user-a') => async () => ({ data: { session: { user: { id }, access_token: `test-token-${id}` } } });
function fixture(symbols = ['QQQ', 'TQQQ'], startDate = START, endDate = END) {
  const dates = ['2026-10-22', '2026-10-23', '2026-10-26'].filter(date => date >= startDate && date <= endDate);
  return { version: 1, source: 'EODHD_EOD_SPLITS', priceBasis: 'split_adjusted_close', currency: 'USD', symbols,
    requestedStartDate: startDate, requestedEndDate: endDate, expectedAsOfDate: END, splitBasisDate: END, asOfDate: dates.at(-1),
    fetchedAt: new Date(NOW).toISOString(), series: Object.fromEntries(symbols.map(symbol => [symbol, { symbol, name: `${symbol} test`, type: 'ETF', rows: dates.map((date, index) => ({ date, close: 100 + index * 10 })) }])) };
}
const response = (data = fixture(), status = 200, code) => ({ ok: status === 200, status, json: async () => ({ success: status === 200, data, ...(code ? { details: { code } } : {}) }) });
const args = overrides => ({ userId: 'user-a', symbols: ['QQQ', 'TQQQ'], startDate: START, endDate: END, getSession: auth(), fetchImpl: async () => response(), now: () => NOW, ...overrides });
const settle = () => new Promise(resolve => setImmediate(resolve));

test.beforeEach(() => resetStockComparisonCache());

test('production comparison loader sends authenticated scoped query and caches only validated data', async () => {
  let calls = 0;
  const options = args({ fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, '/api/quote?view=stock-comparison&symbols=QQQ%2CTQQQ&from=2026-10-22&to=2026-10-26');
    assert.equal(options.headers.Authorization, 'Bearer test-token-user-a');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return response();
  } });
  const first = await loadStockComparison(options);
  assert.equal(first.priceBasis, 'split_adjusted_close');
  assert.equal(first.series.QQQ.rows[0].close, 100);
  assert.strictEqual(await loadStockComparison(options), first);
  assert.equal(calls, 1);
  assert.throws(() => { first.series.QQQ.rows[0].close = 1; }, TypeError);
  await loadStockComparison({ ...options, force: true });
  assert.equal(calls, 2);
});

test('auth is checked before a warm cache, cache remains isolated by user and request dates', async () => {
  let calls = 0;
  const fetchImpl = async url => {
    calls += 1;
    const params = new URL(url, 'https://test.invalid').searchParams;
    return response(fixture(params.get('symbols').split(','), params.get('from'), params.get('to')));
  };
  await loadStockComparison(args({ fetchImpl }));
  await loadStockComparison(args({ fetchImpl, startDate: '2026-10-23' }));
  await loadStockComparison(args({ fetchImpl, symbols: ['QQQ', 'NVDA', 'SMH', 'TQQQ'] }));
  await loadStockComparison(args({ fetchImpl, userId: 'user-b', getSession: auth('user-b') }));
  assert.equal(calls, 4);
  await assert.rejects(loadStockComparison(args({ fetchImpl, getSession: auth('user-b') })), { code: 'AUTH_REQUIRED' });
  await assert.rejects(loadStockComparison(args({ fetchImpl, getSession: async () => ({ data: { session: null } }) })), { code: 'AUTH_REQUIRED' });
  assert.equal(calls, 4);
});

test('cache expires and completed-close rotation cannot reuse the prior split basis', async () => {
  let now = NOW, calls = 0;
  const options = args({ now: () => now, fetchImpl: async () => { calls += 1; return response(); } });
  await loadStockComparison(options);
  now += STOCK_COMPARISON_CACHE_MS;
  await loadStockComparison(options);
  assert.equal(calls, 2);
  now = Date.parse('2026-10-27T20:01:00Z');
  await assert.rejects(loadStockComparison(options), { code: 'INVALID_DATA' });
  assert.equal(calls, 3);
  const current = fixture();
  current.expectedAsOfDate = current.splitBasisDate = '2026-10-27';
  assert.equal((await loadStockComparison({ ...options, fetchImpl: async () => response(current) })).splitBasisDate, '2026-10-27');
});

test('symbols, date ranges, future dates and weekends in returned rows are fail closed', async () => {
  const fetchImpl = async () => assert.fail('Invalid query must not fetch.');
  for (const symbols of [[], ['QQQ'], ['QQQ', 'QQQ'], ['QQQ', 'TQQQ', 'NVDA', 'SMH', 'SPY'], ['QQQ', 'BAD.US']]) {
    await assert.rejects(loadStockComparison(args({ symbols, fetchImpl })), { code: 'INVALID_SYMBOLS' });
  }
  for (const range of [{ startDate: '1999-01-01' }, { startDate: '2026-02-30' }, { startDate: '2026-10-27' }, { endDate: '2026-10-27' }, { startDate: '' }]) {
    await assert.rejects(loadStockComparison(args({ ...range, fetchImpl })), { code: 'INVALID_RANGE' });
  }
  const weekend = fixture(); weekend.series.QQQ.rows[1].date = '2026-10-24';
  await assert.rejects(loadStockComparison(args({ fetchImpl: async () => response(weekend) })), { code: 'INVALID_DATA' });
});

test('same-day history is valid and missing sessions remain absent', async () => {
  const single = await loadStockComparison(args({ startDate: END, fetchImpl: async () => response(fixture(['QQQ', 'TQQQ'], END, END)) }));
  assert.equal(single.series.QQQ.rows.length, 1);
  const sparse = fixture();
  sparse.series.QQQ.rows.splice(1, 1);
  sparse.series.TQQQ.rows.pop();
  sparse.asOfDate = '2026-10-23';
  const result = await loadStockComparison(args({ fetchImpl: async () => response(sparse) }));
  assert.deepEqual(result.series.QQQ.rows.map(row => row.date), [START, END]);
  assert.equal(result.series.TQQQ.rows.at(-1).date, '2026-10-23');
});

test('raw, dividend-adjusted, mixed, malformed and mismatched payloads never enter cache', async () => {
  const changes = [
    value => { value.source = 'EODHD_EOD'; },
    value => { value.priceBasis = 'close'; },
    value => { value.priceBasis = 'adjusted_close'; },
    value => { value.series.QQQ.priceBasis = 'adjusted_close'; },
    value => { value.series.QQQ.currency = 'CNY'; },
    value => { value.currency = 'CNY'; },
    value => { value.symbols = ['QQQ', 'QQQ']; },
    value => { value.series.SPY = value.series.QQQ; },
    value => { value.series.QQQ.rows[0].close = '100'; },
    value => { value.series.QQQ.rows[0].close = null; },
    value => { value.series.QQQ.rows[0].close = Infinity; },
    value => { value.series.QQQ.rows[0].date = '2026-10-21'; },
    value => { value.series.QQQ.rows[1].date = START; },
    value => { value.series.QQQ.rows = []; },
    value => { value.series.QQQ.type = 'Mutual Fund'; },
    value => { value.series.QQQ.symbol = 'SPY'; },
    value => { value.requestedStartDate = '2026-10-21'; },
    value => { value.requestedEndDate = '2026-10-27'; },
    value => { value.expectedAsOfDate = '2026-10-23'; },
    value => { value.splitBasisDate = '2026-10-23'; },
    value => { value.asOfDate = '2026-10-23'; },
    value => { value.fetchedAt = 'not-a-date'; },
    value => { value.fetchedAt = new Date(NOW + 300001).toISOString(); },
  ];
  for (const change of changes) {
    resetStockComparisonCache();
    const invalid = fixture(); change(invalid);
    await assert.rejects(loadStockComparison(args({ fetchImpl: async () => response(invalid) })), { code: 'INVALID_DATA' });
    await assert.rejects(loadStockComparison(args({ fetchImpl: async () => response(null, 502) })), { code: 'NETWORK_ERROR' });
  }
});

test('warm history is not used as a silent fallback after provider or malformed responses', async () => {
  await loadStockComparison(args());
  await assert.rejects(loadStockComparison(args({ force: true, fetchImpl: async () => response({}, 200) })), { code: 'INVALID_DATA' });
  await assert.rejects(loadStockComparison(args({ fetchImpl: async () => response(null, 502) })), { code: 'NETWORK_ERROR' });
});

test('401 and 403 clear cached history and safe provider codes preserve failure meaning', async () => {
  for (const status of [401, 403]) {
    resetStockComparisonCache();
    await loadStockComparison(args());
    await assert.rejects(loadStockComparison(args({ force: true, fetchImpl: async () => response(null, status) })), { code: 'AUTH_REQUIRED' });
    await assert.rejects(loadStockComparison(args({ fetchImpl: async () => response(null, 502) })), { code: 'NETWORK_ERROR' });
  }
  for (const [status, code] of [[400, 'UNSUPPORTED_INSTRUMENT'], [422, 'NO_DATA'], [502, 'INVALID_DATA'], [503, 'QUOTA_EXHAUSTED'], [429, 'RATE_LIMITED']]) {
    await assert.rejects(loadStockComparison(args({ fetchImpl: async () => response(null, status, code) })), { code });
  }
});

test('a caller abort cancels fetch promptly and a late old response cannot poison a subsequent query', async () => {
  const controller = new AbortController();
  let resolveOld, fetchSignal;
  const pending = loadStockComparison(args({ signal: controller.signal, fetchImpl: (_url, options) => {
    fetchSignal = options.signal;
    return new Promise(resolve => { resolveOld = resolve; });
  } }));
  await settle();
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError', code: 'REQUEST_ABORTED' });
  assert.equal(fetchSignal.aborted, true);
  const fresh = fixture(); fresh.series.QQQ.rows[0].close = 300;
  await loadStockComparison(args({ fetchImpl: async () => response(fresh) }));
  resolveOld(response());
  await settle();
  assert.equal((await loadStockComparison(args())).series.QQQ.rows[0].close, 300);
});

test('account switches during successful, failed and cached requests cannot return prior user data', async () => {
  for (const outcome of ['success', 'failure']) {
    resetStockComparisonCache();
    let active = 'user-a';
    await assert.rejects(loadStockComparison(args({ getSession: () => auth(active)(), fetchImpl: async () => {
      active = 'user-b';
      if (outcome === 'failure') throw new Error('private upstream detail');
      return response();
    } })), { code: 'AUTH_REQUIRED' });
  }
  resetStockComparisonCache();
  await loadStockComparison(args());
  let authCalls = 0;
  await assert.rejects(loadStockComparison(args({ getSession: () => auth(++authCalls === 1 ? 'user-a' : 'user-b')() })), { code: 'AUTH_REQUIRED' });
});

test('cache reset and account invalidation reject pending results', async () => {
  for (const invalidate of ['reset', 'identity']) {
    resetStockComparisonCache();
    let resolveFetch;
    const pending = loadStockComparison(args({ fetchImpl: () => new Promise(resolve => { resolveFetch = resolve; }) }));
    await settle();
    if (invalidate === 'reset') resetStockComparisonCache();
    else await assert.rejects(loadStockComparison(args({ getSession: auth('user-b') })), { code: 'AUTH_REQUIRED' });
    resolveFetch(response());
    await assert.rejects(pending, { code: invalidate === 'reset' ? 'REQUEST_SUPERSEDED' : 'AUTH_REQUIRED' });
  }
});

test('later refresh wins the same-query cache even when an older response finishes afterward', async () => {
  let resolveOld;
  const old = loadStockComparison(args({ fetchImpl: () => new Promise(resolve => { resolveOld = resolve; }) }));
  await settle();
  const newer = fixture(); newer.series.QQQ.rows[0].close = 300;
  await loadStockComparison(args({ force: true, fetchImpl: async () => response(newer) }));
  resolveOld(response());
  await old;
  assert.equal((await loadStockComparison(args())).series.QQQ.rows[0].close, 300);
});

test('different requested dates retain their own responses when requests finish out of order', async () => {
  let resolveOld;
  const old = loadStockComparison(args({ fetchImpl: () => new Promise(resolve => { resolveOld = resolve; }) }));
  await settle();
  const nextStart = '2026-10-23';
  const newer = await loadStockComparison(args({ startDate: nextStart, fetchImpl: async () => response(fixture(['QQQ', 'TQQQ'], nextStart)) }));
  resolveOld(response());
  assert.equal((await old).requestedStartDate, START);
  assert.equal(newer.requestedStartDate, nextStart);
  assert.equal((await loadStockComparison(args({ startDate: nextStart }))).requestedStartDate, nextStart);
});

test('timeout aborts network and ignores late data without exposing provider details', async () => {
  let fetchSignal;
  await assert.rejects(loadStockComparison(args({ timeoutMs: 5, fetchImpl: (_url, options) => {
    fetchSignal = options.signal;
    return new Promise(() => {});
  } })), { code: 'NETWORK_ERROR' });
  assert.equal(fetchSignal.aborted, true);
  await assert.rejects(loadStockComparison(args({ fetchImpl: async () => { throw new Error('upstream-secret-token'); } })), error => error.code === 'NETWORK_ERROR' && !error.message.includes('upstream-secret-token'));
});

test('the success cache has a finite per-query bound', async () => {
  let originalCalls = 0;
  const fetchImpl = async url => {
    const symbols = new URL(url, 'https://test.invalid').searchParams.get('symbols').split(',');
    if (symbols.includes('TQQQ')) originalCalls += 1;
    return response(fixture(symbols));
  };
  await loadStockComparison(args({ fetchImpl }));
  for (let index = 0; index < 16; index += 1) await loadStockComparison(args({ symbols: ['QQQ', `TEST${index}`], fetchImpl }));
  await loadStockComparison(args({ fetchImpl }));
  assert.equal(originalCalls, 2, 'The oldest of more than 16 query entries must be fetched again.');
});

test('a close rollover during cache auth validation cannot expose a prior split basis', async () => {
  await loadStockComparison(args());
  let now = NOW, authCalls = 0;
  await assert.rejects(loadStockComparison(args({ now: () => now, getSession: async () => {
    if (++authCalls === 2) now = Date.parse('2026-10-27T20:01:00Z');
    return auth()();
  } })), { code: 'REQUEST_SUPERSEDED' });
});

test('default deadline covers four cold instrument waves and authentication within the API limit', () => {
  assert.ok(STOCK_COMPARISON_TIMEOUT_MS > 4 * 10_000 + 6_000);
  assert.ok(STOCK_COMPARISON_TIMEOUT_MS < 90_000);
});
