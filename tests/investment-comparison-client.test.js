import assert from 'node:assert/strict';
import test from 'node:test';
import { getInvestmentComparisonExpectedCloseDate, loadInvestmentComparison, searchInvestmentSymbols, normalizeInvestmentSearchData, resetInvestmentComparisonMemoryCache, INVESTMENT_COMPARISON_FAILURE_RETRY_MS, INVESTMENT_COMPARISON_STALE_RETRY_MS, INVESTMENT_SEARCH_CACHE_MS } from '../src/lib/investmentComparison.js';

const NOW = Date.parse('2026-09-08T12:00:00Z');
function fixture(symbols = ['QQQ', 'TQQQ']) {
  return { version: 1, source: 'EODHD_EOD', priceBasis: 'adjusted_close', currency: 'USD',
    expectedAsOfDate: '2026-09-04', asOfDate: '2026-09-04', availableFromDate: '2026-09-03',
    fetchedAt: new Date(NOW).toISOString(), stale: false, staleReason: '', symbols,
    series: Object.fromEntries(symbols.map((symbol) => [symbol, { symbol, name: `${symbol} test`, type: 'ETF', currency: 'USD', priceBasis: 'adjusted_close', rows: [{ date: '2026-09-03', close: 100 }, { date: '2026-09-04', close: 110 }] }])) };
}
function searchFixture(query = 'qqq') {
  return { version: 1, source: 'EODHD_SEARCH', query, fetchedAt: new Date(NOW).toISOString(), results: [{ symbol: 'QQQ', name: 'QQQ test', currency: 'USD', type: 'ETF', exchange: 'US' }] };
}
const auth = (id = 'user-a') => async () => ({ data: { session: { user: { id }, access_token: `test-token-${id}` } } });
const response = (data = fixture(), status = 200, code) => ({ ok: status === 200, status, json: async () => ({ success: status === 200, data, ...(code ? { details: { code } } : {}) }) });
const args = (overrides = {}) => ({ userId: 'user-a', getSession: auth(), fetchImpl: async () => response(), now: () => NOW, ...overrides });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test.beforeEach(() => resetInvestmentComparisonMemoryCache());

test('close-version keys skip holidays and rotate only after completed sessions', () => {
  assert.equal(getInvestmentComparisonExpectedCloseDate(NOW), '2026-09-04');
  assert.equal(getInvestmentComparisonExpectedCloseDate(Date.parse('2026-09-08T20:00:00Z')), '2026-09-08');
  assert.equal(getInvestmentComparisonExpectedCloseDate(Date.parse('2026-07-06T12:00:00Z')), '2026-07-02');
});

test('authenticated pair cache ignores input order and does not poll a completed close version', async () => {
  let calls = 0, now = NOW;
  const options = args({ now: () => now, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, '/api/quote?view=investment-comparison&symbols=QQQ%2CTQQQ');
    assert.equal(options.headers.Authorization, 'Bearer test-token-user-a');
    assert.equal(options.cache, 'no-store');
    return response();
  } });
  const first = await loadInvestmentComparison(options);
  now += 5 * 60 * 60 * 1000;
  const cached = await loadInvestmentComparison({ ...options, symbols: ['tqqq', ' qqq '] });
  assert.strictEqual(cached, first);
  assert.equal(calls, 1);
  now = Date.parse('2026-09-08T20:00:00Z');
  const stale = await loadInvestmentComparison(options);
  assert.equal(stale.stale, true);
  assert.equal(stale.expectedAsOfDate, '2026-09-08');
  await loadInvestmentComparison(options);
  assert.equal(calls, 2);
  now += INVESTMENT_COMPARISON_STALE_RETRY_MS;
  await loadInvestmentComparison(options);
  assert.equal(calls, 3);
});

test('identity is validated before warm caches and isolated across users and pairs', async () => {
  let calls = 0;
  const fetchImpl = async (url) => { calls += 1; return response(fixture(new URL(url, 'https://test.invalid').searchParams.get('symbols').split(','))); };
  await loadInvestmentComparison(args({ fetchImpl }));
  await loadInvestmentComparison(args({ fetchImpl, symbols: ['SPY', 'QQQ'] }));
  await loadInvestmentComparison(args({ fetchImpl, userId: 'user-b', getSession: auth('user-b') }));
  assert.equal(calls, 3);
  await assert.rejects(loadInvestmentComparison(args({ fetchImpl, getSession: auth('user-b') })), { code: 'AUTH_REQUIRED' });
  await assert.rejects(loadInvestmentComparison(args({ fetchImpl, getSession: async () => ({ data: { session: null } }) })), { code: 'AUTH_REQUIRED' });
  assert.equal(calls, 3);
});

test('single-flight shares requests while every subscriber can cancel independently', async () => {
  let resolveFetch, calls = 0;
  const options = args({ fetchImpl: () => { calls += 1; return new Promise((resolve) => { resolveFetch = resolve; }); } });
  const controller = new AbortController();
  const first = loadInvestmentComparison({ ...options, signal: controller.signal });
  const second = loadInvestmentComparison({ ...options, force: true });
  await settle();
  assert.equal(calls, 1);
  controller.abort();
  await assert.rejects(first, { code: 'REQUEST_ABORTED' });
  resolveFetch(response());
  assert.equal((await second).asOfDate, '2026-09-04');
});

test('network failure preserves last valid prices explicitly stale and observes cooldown', async () => {
  let calls = 0, now = NOW;
  const options = args({ now: () => now, fetchImpl: async () => { calls += 1; if (calls > 1) throw new Error('offline'); return response(); } });
  const fresh = await loadInvestmentComparison(options);
  const stale = await loadInvestmentComparison({ ...options, force: true });
  assert.equal(stale.staleReason, 'provider_unavailable');
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, fresh.fetchedAt);
  assert.deepEqual(stale.series, fresh.series);
  await loadInvestmentComparison(options);
  assert.equal(calls, 2);
  now += INVESTMENT_COMPARISON_FAILURE_RETRY_MS;
  await loadInvestmentComparison(options);
  assert.equal(calls, 3);
});

test('cold failures back off and manual force can recover', async () => {
  let calls = 0;
  const options = args({ fetchImpl: async () => { calls += 1; return calls === 1 ? response(null, 502) : response(); } });
  await assert.rejects(loadInvestmentComparison(options), { code: 'NETWORK_ERROR' });
  await assert.rejects(loadInvestmentComparison(options), { code: 'NETWORK_ERROR' });
  assert.equal(calls, 1);
  assert.equal((await loadInvestmentComparison({ ...options, force: true })).stale, false);
});

test('authorization failures invalidate old data and never return stale fallback', async () => {
  for (const status of [401, 403]) {
    resetInvestmentComparisonMemoryCache();
    await loadInvestmentComparison(args());
    await assert.rejects(loadInvestmentComparison(args({ force: true, fetchImpl: async () => response(null, status) })), { code: 'AUTH_REQUIRED' });
    await assert.rejects(loadInvestmentComparison(args({ fetchImpl: async () => response(null, 502) })), { code: 'NETWORK_ERROR' });
  }
});

test('account changes during success, error and cache-subscriber waits cannot return the old user result', async () => {
  for (const mode of ['success', 'failure', 'invalid']) {
    resetInvestmentComparisonMemoryCache();
    await loadInvestmentComparison(args());
    let active = 'user-a';
    await assert.rejects(loadInvestmentComparison(args({ force: true, getSession: () => auth(active)(), fetchImpl: async () => {
      active = 'user-b';
      if (mode === 'failure') throw new Error('offline');
      return mode === 'invalid' ? response({}) : response();
    } })), { code: 'AUTH_REQUIRED' });
  }
});

test('invalid response is fail-closed even with a warm successful cache', async () => {
  await loadInvestmentComparison(args());
  const invalid = fixture(); invalid.series.QQQ.rows[0].close = null;
  await assert.rejects(loadInvestmentComparison(args({ force: true, fetchImpl: async () => response(invalid) })), { code: 'INVALID_DATA' });
  await assert.rejects(loadInvestmentComparison(args()), { code: 'INVALID_DATA' });
});

test('server machine errors preserve unsupported/history/quota distinctions instead of becoming auth errors', async () => {
  for (const [code, status] of [['UNSUPPORTED_INSTRUMENT', 400], ['INVALID_DATA', 502], ['QUOTA_EXHAUSTED', 503]]) {
    resetInvestmentComparisonMemoryCache();
    await assert.rejects(loadInvestmentComparison(args({ fetchImpl: async () => response(null, status, code) })), { code });
  }
  resetInvestmentComparisonMemoryCache();
  await loadInvestmentComparison(args());
  const stale = await loadInvestmentComparison(args({ force: true, fetchImpl: async () => response(null, 503, 'QUOTA_EXHAUSTED') }));
  assert.equal(stale.staleReason, 'quota_exhausted');
});

test('older provider data cannot overwrite newer cached history', async () => {
  await loadInvestmentComparison(args());
  const data = fixture();
  data.availableFromDate = '2026-09-02'; data.asOfDate = '2026-09-03'; data.stale = true; data.staleReason = 'incomplete_close';
  for (const series of Object.values(data.series)) series.rows = [{ date: '2026-09-02', close: 80 }, { date: '2026-09-03', close: 100 }];
  const result = await loadInvestmentComparison(args({ force: true, fetchImpl: async () => response(data) }));
  assert.equal(result.asOfDate, '2026-09-04');
  assert.equal(result.stale, true);
});

test('timeouts abort the request and reset supersedes outstanding cache writes', async () => {
  let signal;
  await assert.rejects(loadInvestmentComparison(args({ timeoutMs: 5, fetchImpl: (_url, options) => { signal = options.signal; return new Promise(() => {}); } })), { code: 'NETWORK_ERROR' });
  assert.equal(signal.aborted, true);
  assert.equal((await loadInvestmentComparison(args({ force: true }))).stale, false);
  resetInvestmentComparisonMemoryCache();
  let resolveFetch;
  const pending = loadInvestmentComparison(args({ fetchImpl: () => new Promise((resolve) => { resolveFetch = resolve; }) }));
  await settle(); resetInvestmentComparisonMemoryCache(); resolveFetch(response());
  await assert.rejects(pending, { code: 'REQUEST_SUPERSEDED' });
  let calls = 0;
  await loadInvestmentComparison(args({ fetchImpl: async () => { calls += 1; return response(); } }));
  assert.equal(calls, 1);
});

test('history memory is bounded rather than retaining every pair forever', async () => {
  let calls = 0;
  const fetchImpl = async (url) => { calls += 1; return response(fixture(new URL(url, 'https://test.invalid').searchParams.get('symbols').split(','))); };
  for (let index = 0; index < 17; index += 1) await loadInvestmentComparison(args({ symbols: ['QQQ', `TEST${index}`], fetchImpl }));
  await loadInvestmentComparison(args({ symbols: ['QQQ', 'TEST0'], fetchImpl }));
  assert.equal(calls, 18);
});

test('search is authenticated, bounded by query and TTL, strict on US USD identity', async () => {
  let calls = 0, now = NOW;
  const options = args({ query: 'qqq', now: () => now, fetchImpl: async (url, options) => {
    calls += 1; assert.equal(url, '/api/quote?view=investment-search&q=qqq');
    assert.equal(options.headers.Authorization, 'Bearer test-token-user-a');
    return response(searchFixture());
  } });
  const result = await searchInvestmentSymbols(options);
  assert.equal(result.results[0].symbol, 'QQQ');
  await searchInvestmentSymbols({ ...options, query: ' QQQ ' });
  assert.equal(calls, 1);
  now += INVESTMENT_SEARCH_CACHE_MS;
  await searchInvestmentSymbols(options);
  assert.equal(calls, 2);
  await assert.rejects(searchInvestmentSymbols({ ...options, getSession: auth('user-b') }), { code: 'AUTH_REQUIRED' });
  for (const mutate of [value => { value.results[0].currency = 'HKD'; }, value => { value.results[0].exchange = 'HK'; }, value => { value.results[0].symbol = 'QQQ.US'; }, value => { value.results.push(value.results[0]); }, value => { value.query = 'wrong'; }]) {
    const value = searchFixture(); mutate(value);
    assert.equal(normalizeInvestmentSearchData(value, { query: 'qqq', now: NOW }), null);
  }
});

test('search single-flight, cooldown and account-switch checks also cover async searches', async () => {
  let resolveFetch, calls = 0;
  const options = args({ query: 'qqq', fetchImpl: () => { calls += 1; return new Promise((resolve) => { resolveFetch = resolve; }); } });
  const first = searchInvestmentSymbols(options), second = searchInvestmentSymbols(options);
  await settle(); assert.equal(calls, 1); resolveFetch(response(searchFixture()));
  assert.strictEqual(await first, await second);
  let active = 'user-a';
  await assert.rejects(searchInvestmentSymbols(args({ query: 'qqq', force: true, getSession: () => auth(active)(), fetchImpl: async () => { active = 'user-b'; return response(searchFixture()); } })), { code: 'AUTH_REQUIRED' });
  resetInvestmentComparisonMemoryCache(); calls = 0;
  const failed = args({ query: 'qqq', fetchImpl: async () => { calls += 1; return response(null, 503, 'QUOTA_EXHAUSTED'); } });
  await assert.rejects(searchInvestmentSymbols(failed), { code: 'QUOTA_EXHAUSTED' });
  await assert.rejects(searchInvestmentSymbols(failed), { code: 'QUOTA_EXHAUSTED' });
  assert.equal(calls, 1);
});

test('search query whitespace and invalid characters agree with the server contract', async () => {
  const data = await searchInvestmentSymbols(args({ query: ' Berkshire   Hathaway ', fetchImpl: async (url) => {
    assert.equal(url, '/api/quote?view=investment-search&q=Berkshire%20Hathaway');
    return response(searchFixture('Berkshire Hathaway'));
  } }));
  assert.equal(data.query, 'Berkshire Hathaway');
  for (const query of ['', '---', '../api/user', 'x'.repeat(61)]) await assert.rejects(searchInvestmentSymbols(args({ query })), { code: 'INVALID_QUERY' });
});
