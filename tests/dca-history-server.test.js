import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/quote.js';
import { fetchDcaHistory, fetchInvestmentComparison, normalizeDcaHistorySymbol, resetInvestmentComparisonCacheForTests } from '../server/quote/investmentComparison.js';
import { normalizeDcaHistoryData } from '../src/lib/dcaHistory.js';

const NOW = Date.parse('2026-09-08T21:00:00Z');
const DATES = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08'];
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const instrument = (symbol, extra = {}) => ({ Code: symbol, Name: `${symbol} Test`, Type: 'ETF', Country: 'USA', Exchange: 'US', Currency: 'USD', ...extra });
const rawRows = (dates = DATES) => dates.map((date, index) => ({ date, close: 9999, adjusted_close: 100 + index }));
function provider({ calls = [], dates = DATES, search, history } = {}) {
  return async (input, options) => {
    const url = new URL(input);
    assert.ok(options.signal instanceof AbortSignal);
    calls.push(url.pathname);
    if (url.pathname.startsWith('/api/search/')) {
      const symbol = decodeURIComponent(url.pathname.split('/').at(-1));
      return response(search ? search(symbol) : [instrument(symbol)]);
    }
    assert.match(url.pathname, /^\/api\/eod\/[A-Z0-9.-]+\.US$/);
    assert.equal(url.searchParams.get('from'), '2000-01-01');
    assert.equal(url.searchParams.get('period'), 'd');
    return history ? history(url) : response(rawRows(dates));
  };
}
const options = (overrides = {}) => ({ eodhdKey: 'test-key', now: NOW, fetchImpl: provider(), ...overrides });
const res = () => ({ headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; },
  status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, end() {} });

test.beforeEach(() => resetInvestmentComparisonCacheForTests());

test('single-history accepts exactly one canonical ticker without loosening comparison pairs', async () => {
  assert.equal(normalizeDcaHistorySymbol(' qqq '), 'QQQ');
  assert.equal(normalizeDcaHistorySymbol('BRK-B'), 'BRK-B');
  for (const value of [undefined, null, '', [], ['QQQ'], 'QQQ,TQQQ', 'QQQ.US', 'VIX', 'A..B', 'QQQ&secret=x', 'AAPL.LSE']) {
    assert.throws(() => normalizeDcaHistorySymbol(value), { code: 'INVALID_SYMBOL' });
  }
  await assert.rejects(fetchInvestmentComparison(['QQQ'], options()), { code: 'INVALID_SYMBOLS' });
});

test('cold DCA requires one identity plus one selected history; warm calls consume no provider requests', async () => {
  const calls = [], config = options({ fetchImpl: provider({ calls }) });
  const data = await fetchDcaHistory('QQQ', config);
  assert.deepEqual(calls, ['/api/search/QQQ', '/api/eod/QQQ.US']);
  assert.deepEqual(data.rows, DATES.map((date, index) => ({ date, close: 100 + index })));
  assert.equal(data.availableFromDate, DATES[0]);
  assert.equal(data.asOfDate, DATES.at(-1));
  assert.equal(data.stale, false);
  assert.deepEqual(normalizeDcaHistoryData(data, { symbol: 'QQQ', now: NOW }), data);
  await fetchDcaHistory(' qqq ', config);
  assert.equal(calls.length, 2);
  await fetchInvestmentComparison(['QQQ', 'TQQQ'], config);
  assert.deepEqual(calls, ['/api/search/QQQ', '/api/eod/QQQ.US', '/api/search/TQQQ', '/api/eod/TQQQ.US']);
  await fetchDcaHistory('TQQQ', config);
  assert.equal(calls.length, 4, 'comparison and DCA must reuse the same per-symbol history');
});

test('parallel DCA and pair requests single-flight shared verification and historical work', async () => {
  const calls = [], config = options({ fetchImpl: provider({ calls }) });
  const values = await Promise.all([fetchDcaHistory('QQQ', config), fetchDcaHistory('QQQ', config), fetchInvestmentComparison(['QQQ', 'TQQQ'], config)]);
  assert.equal(values[0].rows.length, 4);
  assert.equal(calls.filter(path => path === '/api/search/QQQ').length, 1);
  assert.equal(calls.filter(path => path === '/api/eod/QQQ.US').length, 1);
  assert.equal(calls.length, 4);
});

test('unsupported identity must fail before historical prices are requested', async () => {
  for (const extra of [{ Currency: 'CAD' }, { Type: 'Index' }, { Exchange: 'LSE' }, { Country: 'Canada' }]) {
    resetInvestmentComparisonCacheForTests(); const calls = [];
    await assert.rejects(fetchDcaHistory('QQQ', options({ fetchImpl: provider({ calls, search: symbol => [instrument(symbol, extra)] }) })), { code: 'UNSUPPORTED_INSTRUMENT' });
    assert.deepEqual(calls, ['/api/search/QQQ']);
  }
});

test('raw close, missing adjusted prices and conflicting rows never silently enter a DCA history', async () => {
  for (const bad of [null, undefined, 0, -1, '', false, NaN]) {
    resetInvestmentComparisonCacheForTests();
    const rows = rawRows(); rows[1].adjusted_close = bad;
    await assert.rejects(fetchDcaHistory('QQQ', options({ fetchImpl: provider({ history: () => response(rows) }) })), { code: 'INVALID_DATA' });
  }
  resetInvestmentComparisonCacheForTests();
  await assert.rejects(fetchDcaHistory('QQQ', options({ fetchImpl: provider({ history: () => response([...rawRows(), { date: DATES[1], adjusted_close: 999 }]) }) })), { code: 'INVALID_DATA' });
});

test('incomplete close is explicitly stale and shared failure cooldown limits provider consumption', async () => {
  const calls = [];
  const before = NOW - 3 * 60 * 60 * 1000;
  const fresh = await fetchDcaHistory('QQQ', options({ now: before, fetchImpl: provider({ calls, dates: DATES.slice(0, -1) }) }));
  assert.equal(fresh.stale, false);
  const config = options({ fetchImpl: provider({ calls, history: () => response(null, 503) }) });
  const stale = await fetchDcaHistory('QQQ', config);
  assert.equal(stale.staleReason, 'provider_unavailable');
  assert.deepEqual(stale.rows, fresh.rows);
  await fetchDcaHistory('QQQ', config);
  assert.equal(calls.filter(path => path === '/api/eod/QQQ.US').length, 2);
  resetInvestmentComparisonCacheForTests();
  const incomplete = await fetchDcaHistory('QQQ', options({ fetchImpl: provider({ dates: DATES.slice(0, -1) }) }));
  assert.equal(incomplete.staleReason, 'incomplete_close');
  assert.equal(incomplete.asOfDate, '2026-09-04');
});

async function withHandler(fn) {
  const names = ['QUOTE_API_AUTH_REQUIRED', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'EODHD_API_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const oldFetch = globalThis.fetch, oldNow = Date.now;
  const calls = [];
  process.env.QUOTE_API_AUTH_REQUIRED = 'true'; process.env.SUPABASE_URL = 'https://auth.test.invalid';
  process.env.SUPABASE_ANON_KEY = 'test-anon'; process.env.EODHD_API_KEY = 'test-key';
  Date.now = () => NOW;
  const fetchProvider = provider({ calls });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://auth.test.invalid/auth/v1/user') {
      calls.push('auth');
      assert.equal(options.headers.Authorization, 'Bearer test-session');
      return response({ id: 'test-user' });
    }
    return fetchProvider(url, options);
  };
  try { await fn(calls); }
  finally {
    globalThis.fetch = oldFetch; Date.now = oldNow;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    resetInvestmentComparisonCacheForTests();
  }
}
const request = (query = { view: 'dca-history', symbol: 'QQQ' }, authorized = false) => ({ method: 'GET', headers: authorized ? { authorization: 'Bearer test-session' } : {}, query });

test('DCA endpoint rejects unauthenticated requests before any provider or auth network work', async () => {
  await withHandler(async calls => {
    const result = res(); await handler(request(), result);
    assert.equal(result.statusCode, 401);
    assert.match(result.headers['Cache-Control'], /private, no-store/);
    assert.equal(result.headers.Pragma, 'no-cache');
    assert.equal(calls.length, 0);
  });
});

test('DCA endpoint returns only its standalone history after auth, with no secret or user data', async () => {
  await withHandler(async calls => {
    const result = res(); await handler(request(undefined, true), result);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.symbol, 'QQQ');
    assert.equal(result.body.data.rows[0].close, 100);
    assert.match(result.headers['Cache-Control'], /private, no-store/);
    assert.doesNotMatch(JSON.stringify(result.body), /test-key|test-user|test-session|api_token|9999/);
    assert.deepEqual(calls, ['auth', '/api/search/QQQ', '/api/eod/QQQ.US']);
  });
});

test('DCA endpoint rejects ambiguous query values without historical work and never returns shared cache headers', async () => {
  await withHandler(async calls => {
    const queries = [{ view: ['dca-history', 'stock-detail'], symbol: 'QQQ' }, { view: ['stock-detail', 'dca-history'], symbol: 'QQQ' }, { view: 'dca-history', symbol: ['QQQ', 'SPY'] },
      { view: 'dca-history' }, { view: 'dca-history', symbol: 'QQQ,SPY' }, { view: 'dca-history', symbol: 'QQQ', symbols: 'SPY' },
      { view: 'dca-history', symbol: 'QQQ', q: ['QQQ'] }];
    for (const query of queries) {
      const result = res(); await handler(request(query, true), result);
      assert.equal(result.statusCode, 400);
      assert.equal(result.body.details.code, 'INVALID_SYMBOL');
      assert.match(result.headers['Cache-Control'], /private, no-store/);
    }
    assert.deepEqual(calls, queries.map(() => 'auth'));
    process.env.QUOTE_API_AUTH_REQUIRED = 'false';
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const result = res(); await handler({ ...request({ view: 'dca-history', symbol: 'QQQ,SPY' }), method }, result);
      assert.match(result.headers['Cache-Control'], /private, no-store/);
    }
  });
});
