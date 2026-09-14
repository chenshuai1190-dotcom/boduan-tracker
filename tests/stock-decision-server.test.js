import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/quote.js';
import {
  buildStockDecisionRows, createStockDecisionService,
  STOCK_DECISION_TTL_MS, STOCK_DECISION_FAILURE_MS, STOCK_DECISION_RATE_LIMIT_MS,
} from '../server/quote/stockDecision.js';
import { resetInvestmentComparisonCacheForTests } from '../server/quote/investmentComparison.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';
import { buildStockDecisionModel } from '../server/quote/stockDecisionModel.js';

const NOW = Date.parse('2026-09-12T05:00:00Z');
const LAST_CLOSE = '2026-09-11';
const FROM = '2025-06-18';
const TEST_KEY = 'test-decision-key';
function history(through = LAST_CLOSE) {
  const rows = [];
  for (let timestamp = Date.parse(`${FROM}T00:00:00Z`); timestamp <= Date.parse(`${through}T00:00:00Z`); timestamp += 86400000) {
    const day = new Date(timestamp);
    const date = day.toISOString().slice(0, 10);
    if ([0, 6].includes(day.getUTCDay()) || isRegularNyseHoliday(date)) continue;
    const close = 100 + rows.length * 0.12 + Math.sin(rows.length / 4) * 5;
    rows.push({ date, open: close - 0.3, high: close + 1, low: close - 1, close, adjusted_close: close * 0.98, volume: 10000 + rows.length * 20 });
  }
  return rows;
}
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
function instrument(code = 'MSFT', extra = {}) {
  return { Code: code, Name: 'Microsoft Corporation', Exchange: 'NASDAQ', Currency: 'USD', Country: 'USA', Type: 'Common Stock', ...extra };
}
function provider({ search, eod, onCall } = {}) {
  return async (input, options) => {
    const url = new URL(input);
    onCall?.(url, options);
    assert.equal(url.origin, 'https://eodhd.com');
    assert.equal(url.searchParams.get('api_token'), TEST_KEY);
    assert.equal(options.cache, 'no-store');
    if (url.pathname.startsWith('/api/search/')) return response(search ?? [instrument(decodeURIComponent(url.pathname.split('/').at(-1)))]);
    if (url.pathname.startsWith('/api/eod/')) return response(eod ?? history());
    assert.fail(`decision service must only request identity and daily OHLCV; unexpected path: ${url.pathname}`);
  };
}
const normalize = (rows) => buildStockDecisionRows(rows, { symbol: 'MSFT', fromDate: FROM, throughDate: LAST_CLOSE });

test('decision OHLC shares adjusted-close basis and volume is never dividend-adjusted', () => {
  const raw = history();
  raw[20] = { ...raw[20], open: '98', high: '102', low: '97', close: '100', adjusted_close: '49', volume: '123456' };
  const rows = normalize(raw);
  assert.deepEqual(rows[20], { date: raw[20].date, open: 48.019999999999996, high: 49.98, low: 47.53, close: 49, volume: 123456 });
  assert.equal(rows.at(-1).date, LAST_CLOSE);
  assert.ok(rows.length >= 140);
  assert.ok(rows.every((row) => Object.keys(row).join(',') === 'date,open,high,low,close,volume'));
});

test('decision OHLC rejects missing, malformed, conflicting, foreign, duplicate and discontinuous completed rows', () => {
  for (const [field, value] of [
    ['close', null], ['open', ''], ['low', false], ['high', 0], ['adjusted_close', null],
    ['volume', null], ['volume', 'NaN'], ['volume', -1], ['open', '0x10'],
    ['date', '2026-02-31'], ['date', '2026-09-12'], ['symbol', 'META.US'], ['currency', 'CNY'],
    ['high', 1], ['low', 999], ['adjusted_close', Infinity],
  ]) {
    const raw = history();
    raw[20] = { ...raw[20], [field]: value };
    assert.throws(() => normalize(raw), { code: 'INVALID_DATA' }, `${field}=${value}`);
  }
  const duplicate = history();
  duplicate.push({ ...duplicate[20] });
  assert.throws(() => normalize(duplicate), { code: 'INVALID_DATA' });
  const gap = history();
  gap.splice(25, 1);
  assert.throws(() => normalize(gap), { code: 'INVALID_DATA' });
  assert.throws(() => normalize(history().slice(-139)), { code: 'INSUFFICIENT_DATA' });
});

test('decision excludes in-progress future rows before numeric checks but never fabricates the missing latest close', () => {
  const raw = history();
  raw.push({ date: '2026-09-14', close: null, high: Infinity, volume: -1 });
  assert.equal(normalize(raw).at(-1).date, LAST_CLOSE);
  assert.equal(normalize(history().slice(0, -1)).at(-1).date, '2026-09-10');
});

test('ordinary stock decision requires no calendar endpoint and contains only price-derived dimensions', async () => {
  resetInvestmentComparisonCacheForTests();
  const calls = [];
  const service = createStockDecisionService({ now: NOW, fetchImpl: provider({ onCall: (url) => calls.push(url.pathname) }) });
  const data = await service('MSFT', { eodhdKey: TEST_KEY });
  assert.deepEqual(calls, ['/api/search/MSFT', '/api/eod/MSFT.US']);
  assert.equal(Object.hasOwn(data.model, 'events'), false);
  assert.ok(['trend', 'position', 'volume', 'momentum'].every((key) => Object.hasOwn(data.model, key)));
});

test('decision verifies exact USD US identity, filters unfinished session, coalesces and caches one completed version', async () => {
  resetInvestmentComparisonCacheForTests();
  const calls = [];
  const fetchImpl = provider({ onCall: (url) => calls.push(url.pathname), eod: [...history(), { date: '2026-09-14', volume: null }] });
  const service = createStockDecisionService({ fetchImpl, now: () => NOW });
  const [first, second] = await Promise.all([service(' msft ', { eodhdKey: TEST_KEY }), service('MSFT', { eodhdKey: TEST_KEY })]);
  assert.equal(first, second);
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.symbol, 'MSFT');
  assert.equal(first.currency, 'USD');
  assert.equal(first.source, 'EODHD');
  assert.equal(first.priceBasis, 'adjusted_ohlc');
  assert.equal(first.asOf, LAST_CLOSE);
  assert.equal(first.expectedAsOfDate, LAST_CLOSE);
  assert.equal(first.stale, false);
  assert.equal(first.fetchedAt, new Date(NOW).toISOString());
  assert.ok(first.model);
  assert.equal(first.rows, undefined);
  assert.equal(await service('MSFT', { eodhdKey: TEST_KEY }), first);
  assert.deepEqual(calls.sort(), ['/api/eod/MSFT.US', '/api/search/MSFT']);
});

test('valuation uses the actual same-session raw close while all technical values retain their adjusted basis', async () => {
  resetInvestmentComparisonCacheForTests();
  const raw = history();
  const last = raw.at(-1);
  const expectedModel = buildStockDecisionModel({ rows: normalize(raw), asOf: LAST_CLOSE });
  const eod = [{ date: '2026-09-14', close: 999 }, ...raw.toReversed()];
  const original = structuredClone(eod);
  const calls = [];
  const service = createStockDecisionService({ now: NOW, fetchImpl: provider({ eod, onCall: url => calls.push(url.pathname) }) });
  const data = await service('MSFT', { eodhdKey: TEST_KEY });
  assert.deepEqual(data.valuationClose, { price: last.close, date: LAST_CLOSE, basis: 'unadjusted_close' });
  assert.notEqual(data.valuationClose.price, data.model.price, 'dividend adjustment must not become the valuation reference price');
  assert.equal(data.model.price, last.adjusted_close);
  assert.equal(data.model.history.at(-1).close, last.adjusted_close);
  assert.deepEqual(data.model, expectedModel);
  assert.deepEqual(eod, original, 'retaining the valuation close must not rewrite provider quotes');
  assert.deepEqual(calls, ['/api/search/MSFT', '/api/eod/MSFT.US']);
});

test('a missing raw close cannot be fabricated from adjusted close or a saved research price', async () => {
  for (const close of [undefined, null, '', 0]) {
    resetInvestmentComparisonCacheForTests();
    const eod = history();
    eod.at(-1).close = close;
    assert.ok(eod.at(-1).adjusted_close > 0);
    const service = createStockDecisionService({ now: NOW, fetchImpl: provider({ eod }) });
    await assert.rejects(service('MSFT', { eodhdKey: TEST_KEY }), { code: 'INVALID_DATA' });
  }
});

test('decision refuses unverified/mismatching, non-USD and non-common instruments before history access', async () => {
  for (const search of [[instrument('META')], [instrument('MSFT', { Currency: 'EUR' })], [instrument('MSFT', { Type: 'Preferred Stock' })], [instrument('MSFT', { Country: 'Germany' })]]) {
    resetInvestmentComparisonCacheForTests();
    const calls = [];
    const service = createStockDecisionService({ fetchImpl: provider({ search, onCall: (url) => calls.push(url.pathname) }), now: NOW });
    await assert.rejects(service('MSFT', { eodhdKey: TEST_KEY }), { code: 'UNSUPPORTED_INSTRUMENT' });
    assert.deepEqual(calls, ['/api/search/MSFT']);
  }
  const service = createStockDecisionService({ fetchImpl: () => { throw new Error('should not request'); }, now: NOW });
  for (const value of [[], 'MSFT.US', 'MSFT,META', '../MSFT', '', null, 'BTC.CC']) {
    await assert.rejects(service(value, { eodhdKey: TEST_KEY }), { code: 'INVALID_PARAMETERS' });
  }
  await assert.rejects(service('MSFT', { eodhdKey: '' }), { code: 'NOT_CONFIGURED' });
});

test('ETF uses the same price-only analysis without a calendar request or event placeholder', async () => {
  resetInvestmentComparisonCacheForTests();
  const calls = [];
  const service = createStockDecisionService({ fetchImpl: provider({ search: [instrument('SPY', { Type: 'ETF' })], onCall: (url) => calls.push(url.pathname) }), now: NOW });
  const data = await service('SPY', { eodhdKey: TEST_KEY });
  assert.equal(Object.hasOwn(data.model, 'events'), false);
  assert.deepEqual(calls, ['/api/search/SPY', '/api/eod/SPY.US']);
});

test('missing expected close is stale and retains its actual completed price date', async () => {
  resetInvestmentComparisonCacheForTests();
  const service = createStockDecisionService({ now: NOW, fetchImpl: provider({ eod: history().slice(0, -1) }) });
  const data = await service('MSFT', { eodhdKey: TEST_KEY });
  assert.equal(data.stale, true);
  assert.equal(data.asOf, '2026-09-10');
  assert.equal(data.expectedAsOfDate, LAST_CLOSE);
  assert.deepEqual(data.valuationClose, { price: history().at(-2).close, date: '2026-09-10', basis: 'unadjusted_close' });
  assert.equal(Object.hasOwn(data.model, 'events'), false);
});

test('transient failure retains exact last data, backs off, and recovers without falsifying its fetch time', async () => {
  resetInvestmentComparisonCacheForTests();
  let now = NOW;
  let fail = false;
  let calls = 0;
  const base = provider();
  const service = createStockDecisionService({ now: () => now, fetchImpl: async (url, options) => {
    calls += 1;
    if (fail) throw new Error('URL contains sensitive-key');
    return base(url, options);
  } });
  const first = await service('MSFT', { eodhdKey: TEST_KEY });
  now += STOCK_DECISION_TTL_MS;
  fail = true;
  const stale = await service('MSFT', { eodhdKey: TEST_KEY });
  assert.equal(stale.stale, true);
  assert.equal(stale.model, first.model);
  assert.deepEqual(stale.valuationClose, first.valuationClose);
  assert.equal(stale.fetchedAt, first.fetchedAt);
  const afterFailure = calls;
  now += STOCK_DECISION_FAILURE_MS - 1;
  assert.equal((await service('MSFT', { eodhdKey: TEST_KEY })).stale, true);
  assert.equal(calls, afterFailure);
  now += 1;
  fail = false;
  const recovered = await service('MSFT', { eodhdKey: TEST_KEY });
  assert.equal(recovered.stale, false);
  assert.notEqual(recovered.fetchedAt, first.fetchedAt);
});

test('rate limits pause other new symbols and use a longer retry window with sanitized errors', async () => {
  resetInvestmentComparisonCacheForTests();
  let now = NOW;
  let calls = 0;
  const service = createStockDecisionService({ now: () => now, fetchImpl: async () => { calls += 1; return response(null, 429); } });
  await assert.rejects(service('MSFT', { eodhdKey: TEST_KEY }), { code: 'RATE_LIMITED', status: 503 });
  await assert.rejects(service('META', { eodhdKey: TEST_KEY }), { code: 'RATE_LIMITED' });
  now += STOCK_DECISION_RATE_LIMIT_MS - 1;
  await assert.rejects(service('MSFT', { eodhdKey: TEST_KEY }), { code: 'RATE_LIMITED' });
  assert.equal(calls, 1);
  now += 1;
  await assert.rejects(service('MSFT', { eodhdKey: TEST_KEY }), (error) => error.code === 'RATE_LIMITED' && !error.message.includes(TEST_KEY));
  assert.equal(calls, 2);
});

test('crossing a NY natural-day boundary reuses the same completed-day cache without provider work', async () => {
  resetInvestmentComparisonCacheForTests();
  let now = Date.parse('2026-09-12T03:00:00Z');
  const calls = [];
  const service = createStockDecisionService({ now: () => now, fetchImpl: provider({ onCall: (url) => calls.push(url.pathname) }) });
  const first = await service('MSFT', { eodhdKey: TEST_KEY });
  now += 2 * 60 * 60 * 1000;
  const nextDay = await service('MSFT', { eodhdKey: TEST_KEY });
  assert.equal(nextDay, first);
  assert.equal(nextDay.expectedAsOfDate, LAST_CLOSE);
  assert.equal(nextDay.stale, false);
  assert.equal(nextDay.fetchedAt, first.fetchedAt);
  assert.deepEqual(calls, ['/api/search/MSFT', '/api/eod/MSFT.US']);
});

test('a newly completed session requires its own history version rather than reusing the prior date', async () => {
  resetInvestmentComparisonCacheForTests();
  let now = Date.parse('2026-09-14T19:59:00Z');
  const calls = [];
  const base = provider({ onCall: (url) => calls.push(url.pathname), eod: history('2026-09-14') });
  const service = createStockDecisionService({ now: () => now, fetchImpl: (url, options) => {
    return base(url, options);
  } });
  const first = await service('MSFT', { eodhdKey: TEST_KEY });
  assert.equal(first.asOf, LAST_CLOSE);
  now += 2 * 60 * 1000;
  const nextClose = await service('MSFT', { eodhdKey: TEST_KEY });
  assert.equal(nextClose.asOf, '2026-09-14');
  assert.equal(nextClose.expectedAsOfDate, '2026-09-14');
  assert.equal(nextClose.stale, false);
  assert.notEqual(nextClose.model, first.model);
  assert.deepEqual(calls, ['/api/search/MSFT', '/api/eod/MSFT.US', '/api/eod/MSFT.US']);
});

test('request and total timeouts cover JSON bodies and enforce limited concurrent work', async () => {
  resetInvestmentComparisonCacheForTests();
  const service = createStockDecisionService({ now: NOW, requestTimeoutMs: 10, totalTimeoutMs: 25, fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) });
  const calls = ['MSFT', 'META', 'NVDA'].map((symbol) => service(symbol, { eodhdKey: TEST_KEY }).catch((error) => error));
  await assert.rejects(service('AAPL', { eodhdKey: TEST_KEY }), { code: 'PROVIDER_UNAVAILABLE' });
  const errors = await Promise.all(calls);
  assert.ok(errors.every((error) => error.code === 'PROVIDER_UNAVAILABLE'));
});

function createResponse() {
  return { headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }, end() { return this; } };
}

test('stock-decision endpoint stays private/authenticated with legacy auth disabled and rejects array/extra parameters', async () => {
  const envKeys = ['QUOTE_API_AUTH_REQUIRED', 'EODHD_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const before = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  let providerCalls = 0;
  Object.assign(process.env, { QUOTE_API_AUTH_REQUIRED: 'false', EODHD_API_KEY: TEST_KEY, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public-test-key' });
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) return { ok: options.headers.Authorization === 'Bearer good-token', json: async () => ({ id: 'test-user' }) };
    providerCalls += 1;
    throw new Error('unreachable');
  };
  const request = (query, authorization) => ({ method: 'GET', headers: authorization ? { authorization } : {}, query });
  try {
    for (const authorization of [undefined, 'Bearer bad-token']) {
      const res = createResponse();
      await handler(request({ view: 'stock-decision', symbol: 'MSFT' }, authorization), res);
      assert.equal(res.statusCode, 401);
      assert.match(res.headers['Cache-Control'], /private, no-store/);
    }
    for (const query of [
      { view: ['stock-decision'], symbol: 'MSFT' }, { view: ['stock-detail', 'stock-decision'], symbol: 'MSFT' },
      { view: 'stock-decision', symbol: ['MSFT'] }, { view: 'stock-decision', symbol: 'MSFT', date: LAST_CLOSE },
      { view: 'stock-decision', symbols: 'MSFT' }, { view: 'stock-decision', symbol: 'MSFT.US' },
    ]) {
      const res = createResponse();
      await handler(request(query, 'Bearer good-token'), res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.details.code, 'INVALID_PARAMETERS');
      assert.match(res.headers['Cache-Control'], /private, no-store/);
    }
    assert.equal(providerCalls, 0);
    delete process.env.EODHD_API_KEY;
    const res = createResponse();
    await handler(request({ view: 'stock-decision', symbol: 'MSFT' }, 'Bearer good-token'), res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.details.code, 'NOT_CONFIGURED');
    assert.equal(res.headers.Pragma, 'no-cache');
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of envKeys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
