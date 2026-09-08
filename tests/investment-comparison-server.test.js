import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';

import handler from '../api/quote.js';
import {
  buildInvestmentComparisonData,
  buildInvestmentHistoryRows,
  buildInvestmentSearchResults,
  fetchInvestmentComparison,
  normalizeInvestmentComparisonSymbols,
  normalizeInvestmentSearchQuery,
  resetInvestmentComparisonCacheForTests,
  searchInvestmentSymbols,
} from '../server/quote/investmentComparison.js';

const NOW = Date.parse('2026-09-08T21:00:00Z');
const BEFORE_CLOSE = Date.parse('2026-09-08T19:00:00Z');
const DATES = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08'];
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalKey = process.env.EODHD_API_KEY;
const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;

beforeEach(() => resetInvestmentComparisonCacheForTests());
afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  if (originalKey === undefined) delete process.env.EODHD_API_KEY;
  else process.env.EODHD_API_KEY = originalKey;
  if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
  else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
  resetInvestmentComparisonCacheForTests();
});

function rawInstrument(symbol, overrides = {}) {
  return { Code: symbol, Name: `${symbol} Test Fund`, Exchange: 'US', Currency: 'USD', Country: 'USA', Type: 'ETF', ...overrides };
}

function rawRows(dates = DATES, offset = 0) {
  return dates.map((date, index) => ({ date, close: 1000 + index + offset, adjusted_close: 100 + index + offset }));
}

function instrumentHistory(symbol, dates = DATES, overrides = {}) {
  return {
    symbol, name: `${symbol} Test Fund`, currency: 'USD', type: 'ETF', exchange: 'US',
    rows: rawRows(dates).map((row) => ({ date: row.date, close: row.adjusted_close })),
    fetchedAt: new Date(NOW).toISOString(), stale: false, staleReason: '', ...overrides,
  };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function fixtureFetch({ dates = DATES, calls = [], search, history } = {}) {
  return async (input, options) => {
    const url = new URL(input);
    calls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    if (url.pathname.startsWith('/api/search/')) {
      const query = decodeURIComponent(url.pathname.slice('/api/search/'.length));
      return search ? search(query, url) : response([rawInstrument(query.toUpperCase())]);
    }
    assert.match(url.pathname, /^\/api\/eod\/[A-Z0-9.-]+\.US$/);
    const symbol = decodeURIComponent(url.pathname.split('/').at(-1).replace(/\.US$/, ''));
    return history ? history(symbol, url) : response(rawRows(dates, symbol === 'TQQQ' ? 50 : 0));
  };
}

function apiResponse() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request(query, overrides = {}) { return { method: 'GET', headers: {}, query, ...overrides }; }
function isCode(code) { return (cause) => cause.code === code; }

test('only exactly two distinct canonical ticker inputs are accepted; names remain search queries', () => {
  assert.deepEqual(normalizeInvestmentComparisonSymbols(' qqq , tqqq '), ['QQQ', 'TQQQ']);
  assert.deepEqual(normalizeInvestmentComparisonSymbols(['BRK-B', 'BRK.B']), ['BRK-B', 'BRK.B']);
  for (const value of [undefined, 'QQQ', 'QQQ,QQQ', 'QQQ,,TQQQ', ['QQQ,TQQQ'], 'QQQ,^VIX', 'QQQ,VIX',
    'QQQ,BTC-USD.CC', 'QQQ,EURUSD.FOREX', 'QQQ,SPX.INDX', 'QQQ,QQQ.US', 'QQQ,AAPL.LSE',
    'QQQ,ANALYST:AAPL', 'QQQ,A..B', 'QQQ,A-', 'QQQ,1A', 'QQQ,DROP TABLE']) {
    assert.throws(() => normalizeInvestmentComparisonSymbols(value), isCode('INVALID_SYMBOLS'));
  }
  assert.equal(normalizeInvestmentSearchQuery('  Berkshire   Hathaway '), 'Berkshire Hathaway');
  assert.equal(normalizeInvestmentSearchQuery('Procter & Gamble'), 'Procter & Gamble');
  for (const value of ['', '  ', ['QQQ'], '../api/user', 'QQQ?api_token=x', 'x'.repeat(61), '---']) {
    assert.throws(() => normalizeInvestmentSearchQuery(value), isCode('INVALID_QUERY'));
  }
});

test('search whitelist requires exact USD US instrument identity and excludes funds, indices, crypto and foreign listings', () => {
  const result = buildInvestmentSearchResults([
    rawInstrument('QQQ'), rawInstrument('AAPL', { Type: 'Common Stock' }),
    rawInstrument('BRK-B', { Type: 'Common Stock', Exchange: 'NYSE' }),
    rawInstrument('QQQ'),
    rawInstrument('FOREIGN', { Currency: 'CAD' }),
    rawInstrument('LONDON', { Exchange: 'LSE' }),
    rawInstrument('CANADA', { Country: 'Canada' }),
    rawInstrument('INDEX', { Type: 'Index' }),
    rawInstrument('BTC-USD', { Type: 'Crypto' }),
    rawInstrument('FUND', { Type: 'Mutual Fund' }),
    rawInstrument('PINK', { Exchange: 'PINK' }),
    rawInstrument('BAD', { Name: '' }),
    rawInstrument('MISSING', { Currency: undefined }), null,
  ]);
  assert.deepEqual(result.map((row) => row.symbol), ['QQQ', 'AAPL', 'BRK-B']);
  assert.ok(result.every((row) => row.currency === 'USD' && row.exchange === 'US'));
  assert.throws(() => buildInvestmentSearchResults({ error: 'not a list' }), isCode('INVALID_DATA'));
  assert.throws(() => buildInvestmentSearchResults([
    rawInstrument('QQQ'), rawInstrument('QQQ', { Type: 'Common Stock' }),
  ]), isCode('INVALID_DATA'));
});

test('history canonicalizes real adjusted closes, deduplicates identical rows and excludes outside requested bounds', () => {
  const payload = [
    ...rawRows().reverse(), { date: '2026-09-04', close: 99999, adjusted_close: '102' },
    { date: '1999-12-31', adjusted_close: null }, { date: '2026-09-09', adjusted_close: null },
  ];
  const result = buildInvestmentHistoryRows(payload, { throughDate: '2026-09-08' });
  assert.deepEqual(result, DATES.map((date, index) => ({ date, close: 100 + index })));
  assert.equal(result[0].close, 100, 'raw close is not the price basis');
});

test('bad or conflicting valid-date historical values fail closed instead of skipping rows or using raw close', () => {
  for (const value of [null, undefined, '', ' ', false, [], {}, 0, -1, NaN, Infinity, '10junk']) {
    const payload = rawRows();
    payload[1].adjusted_close = value;
    assert.throws(() => buildInvestmentHistoryRows(payload, { throughDate: '2026-09-08' }), isCode('INVALID_DATA'));
  }
  for (const extra of [
    { date: '2026-09-04', adjusted_close: 999 },
    { date: '2026-02-30', adjusted_close: 100 },
    { date: '2026-09-05', adjusted_close: 100 },
    { date: '2026-09-07', adjusted_close: 100 },
    { error: 'provider failure' },
  ]) {
    assert.throws(() => buildInvestmentHistoryRows([...rawRows(), extra], { throughDate: '2026-09-08' }), isCode('INVALID_DATA'));
  }
  assert.throws(() => buildInvestmentHistoryRows(rawRows(DATES.slice(0, 1)), { throughDate: '2026-09-08' }), isCode('INVALID_DATA'));
});

test('comparison keeps pre-IPO history while using the later real inception and matching end date', () => {
  const data = buildInvestmentComparisonData({
    QQQ: instrumentHistory('QQQ'), TQQQ: instrumentHistory('TQQQ', DATES.slice(1)),
  }, { symbols: ['QQQ', 'TQQQ'], expectedAsOfDate: '2026-09-08', now: NOW });
  assert.equal(data.availableFromDate, '2026-09-03');
  assert.equal(data.asOfDate, '2026-09-08');
  assert.equal(data.series.QQQ.rows.length, 4);
  assert.equal(data.series.TQQQ.rows.length, 3);
  assert.equal(data.stale, false);
  assert.equal(data.priceBasis, 'adjusted_close');
  assert.equal(data.currency, 'USD');
  assert.deepEqual(data.symbols, ['QQQ', 'TQQQ']);
});

test('one-sided missing internal sessions fail; no common intersection is silently substituted', () => {
  for (const dates of [
    ['2026-09-02', '2026-09-04', '2026-09-08'],
    ['2026-09-01', '2026-09-08'],
    ['2026-09-08', '2026-09-09'],
  ]) {
    assert.throws(() => buildInvestmentComparisonData({
      QQQ: instrumentHistory('QQQ'), TQQQ: instrumentHistory('TQQQ', dates),
    }, { symbols: ['QQQ', 'TQQQ'], expectedAsOfDate: '2026-09-08', now: NOW }), isCode('INVALID_DATA'));
  }
});

test('an unready final close truncates both real series to their matching close and labels the comparison stale', () => {
  const data = buildInvestmentComparisonData({
    QQQ: instrumentHistory('QQQ'), TQQQ: instrumentHistory('TQQQ', DATES.slice(0, -1)),
  }, { symbols: ['QQQ', 'TQQQ'], expectedAsOfDate: '2026-09-08', now: NOW });
  assert.equal(data.asOfDate, '2026-09-04');
  assert.equal(data.stale, true);
  assert.equal(data.staleReason, 'incomplete_close');
  assert.ok(Object.values(data.series).every((series) => series.rows.at(-1).date === '2026-09-04'));
  assert.throws(() => buildInvestmentComparisonData({
    QQQ: instrumentHistory('QQQ'), TQQQ: instrumentHistory('TQQQ'),
  }, { symbols: ['QQQ', 'TQQQ'], expectedAsOfDate: '2026-09-08', now: BEFORE_CLOSE }), isCode('INVALID_DATA'));
});

test('search uses one bounded, encoded official request and a case-insensitive cache', async () => {
  const calls = [];
  const fetchImpl = fixtureFetch({ calls, search: () => response([rawInstrument('PG', { Type: 'Common Stock' })]) });
  const data = await searchInvestmentSymbols('Procter & Gamble', { eodhdKey: 'fake&test', fetchImpl, now: NOW });
  assert.equal(data.source, 'EODHD_SEARCH');
  assert.equal(data.version, 1);
  assert.equal(data.results[0].symbol, 'PG');
  assert.equal(calls[0].pathname, '/api/search/Procter%20%26%20Gamble');
  assert.equal(calls[0].searchParams.get('exchange'), 'US');
  assert.equal(calls[0].searchParams.get('type'), 'all');
  assert.equal(calls[0].searchParams.get('limit'), '50');
  assert.equal(calls[0].searchParams.get('api_token'), 'fake&test');
  const cached = await searchInvestmentSymbols('procter & gamble', { eodhdKey: 'fake&test', fetchImpl, now: NOW + 1000 });
  assert.equal(cached.query, 'procter & gamble');
  assert.equal(calls.length, 1);
  assert.doesNotMatch(JSON.stringify(cached), /fake&test/);
});

test('both exact identities are verified before historical requests, with only EOD history from 2000 onward', async () => {
  const calls = [];
  const fetchImpl = fixtureFetch({ calls });
  const data = await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl, now: NOW });
  assert.equal(calls.length, 4);
  assert.ok(calls.slice(0, 2).every((url) => url.pathname.startsWith('/api/search/')));
  for (const url of calls.slice(2)) {
    assert.ok(url.pathname.startsWith('/api/eod/'));
    assert.equal(url.searchParams.get('from'), '2000-01-01');
    assert.equal(url.searchParams.get('to'), '2026-09-08');
    assert.equal(url.searchParams.get('period'), 'd');
  }
  assert.equal(data.series.QQQ.rows[0].close, 100);
  assert.equal(data.series.TQQQ.rows[0].close, 150);
  const cached = await fetchInvestmentComparison('TQQQ,QQQ', { eodhdKey: 'test', fetchImpl, now: NOW + 1000 });
  assert.deepEqual(cached.symbols, ['TQQQ', 'QQQ']);
  assert.equal(calls.length, 4);
});

test('an exact unsupported symbol cannot borrow a fuzzy search match or reach a history provider', async () => {
  for (const row of [rawInstrument('TQQQ'), rawInstrument('QQQ', { Currency: 'CAD' }), rawInstrument('QQQ', { Type: 'Index' })]) {
    resetInvestmentComparisonCacheForTests();
    const calls = [];
    const fetchImpl = fixtureFetch({ calls, search: (query) => response([query === 'QQQ' ? row : rawInstrument('SPY')]) });
    await assert.rejects(fetchInvestmentComparison('QQQ,SPY', { eodhdKey: 'test', fetchImpl, now: NOW }), isCode('UNSUPPORTED_INSTRUMENT'));
    assert.ok(calls.every((url) => url.pathname.startsWith('/api/search/')));
  }
});

test('search-verified identities and per-symbol histories are reused across different pairs', async () => {
  const calls = [];
  const fetchImpl = fixtureFetch({ calls, search: (query) => response(query === 'Funds'
    ? ['QQQ', 'TQQQ', 'SPY'].map((symbol) => rawInstrument(symbol)) : [rawInstrument(query)]) });
  await searchInvestmentSymbols('Funds', { eodhdKey: 'test', fetchImpl, now: NOW });
  await fetchInvestmentComparison(['QQQ', 'TQQQ'], { eodhdKey: 'test', fetchImpl, now: NOW });
  await fetchInvestmentComparison(['QQQ', 'SPY'], { eodhdKey: 'test', fetchImpl, now: NOW });
  assert.equal(calls.filter((url) => url.pathname.startsWith('/api/search/')).length, 1);
  assert.equal(calls.filter((url) => url.pathname.includes('/eod/QQQ.US')).length, 1);
  assert.equal(calls.length, 4);
});

test('simultaneous comparisons singleflight both symbol identity and history requests', async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fake = fixtureFetch({ calls });
  const fetchImpl = async (url, options) => { await gate; return fake(url, options); };
  const first = fetchInvestmentComparison(['QQQ', 'TQQQ'], { eodhdKey: 'test', fetchImpl, now: NOW });
  const second = fetchInvestmentComparison(['QQQ', 'TQQQ'], { eodhdKey: 'test', fetchImpl, now: NOW });
  release();
  assert.deepEqual(await first, await second);
  assert.equal(calls.length, 4);
});

test('many distinct concurrent searches are bounded without interrupting already running requests', async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fake = fixtureFetch({ calls });
  const fetchImpl = async (url, options) => { await gate; return fake(url, options); };
  const pending = Array.from({ length: 8 }, (_, index) => searchInvestmentSymbols(`TEST${index}`, { eodhdKey: 'test', fetchImpl, now: NOW }));
  await assert.rejects(searchInvestmentSymbols('OVERFLOW', { eodhdKey: 'test', fetchImpl, now: NOW }), isCode('PROVIDER_UNAVAILABLE'));
  release();
  await Promise.all(pending);
  assert.equal(calls.length, 8);
});

test('same-day incomplete history is retried after five minutes without re-fetching the complete symbol', async () => {
  const calls = [];
  let ready = false;
  const fetchImpl = fixtureFetch({ calls, history: (symbol) => response(rawRows(!ready && symbol === 'TQQQ' ? DATES.slice(0, -1) : DATES)) });
  const initial = await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl, now: NOW });
  assert.equal(initial.stale, true);
  await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl, now: NOW + 299_999 });
  assert.equal(calls.length, 4);
  ready = true;
  const updated = await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl, now: NOW + 300_001 });
  assert.equal(updated.stale, false);
  assert.equal(calls.length, 5);
  assert.equal(calls.at(-1).pathname, '/api/eod/TQQQ.US');
});

test('provider failures preserve validated history with its old timestamp, backed off for one minute', async () => {
  const calls = [];
  await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: fixtureFetch({ calls, dates: DATES.slice(0, -1) }), now: BEFORE_CLOSE });
  const unavailable = fixtureFetch({ calls, history: () => response({ error: 'fail' }, 503) });
  const stale = await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: unavailable, now: NOW });
  assert.equal(stale.staleReason, 'provider_unavailable');
  assert.equal(stale.asOfDate, '2026-09-04');
  assert.equal(stale.expectedAsOfDate, '2026-09-08');
  assert.equal(stale.fetchedAt, new Date(BEFORE_CLOSE).toISOString());
  await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: unavailable, now: NOW + 59_999 });
  assert.equal(calls.length, 6);
  const recovered = await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: fixtureFetch({ calls }), now: NOW + 60_001 });
  assert.equal(recovered.stale, false);
  assert.equal(calls.length, 8);
});

test('invalid current history never falls back to valid old history as if only the network failed', async () => {
  const calls = [];
  await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: fixtureFetch({ calls, dates: DATES.slice(0, -1) }), now: BEFORE_CLOSE });
  const invalid = fixtureFetch({ calls, history: (symbol) => {
    const rows = rawRows();
    if (symbol === 'TQQQ') rows[1].adjusted_close = null;
    return response(rows);
  } });
  await assert.rejects(fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: invalid, now: NOW }), isCode('INVALID_DATA'));
  await assert.rejects(fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: invalid, now: NOW + 30_000 }), isCode('INVALID_DATA'));
  assert.equal(calls.length, 6);
});

test('402 opens a shared circuit until UTC midnight; new searches do not consume more provider requests', async () => {
  const calls = [];
  const exhausted = fixtureFetch({ calls, search: () => response(null, 402) });
  await assert.rejects(searchInvestmentSymbols('QQQ', { eodhdKey: 'test', fetchImpl: exhausted, now: NOW }), isCode('QUOTA_EXHAUSTED'));
  await assert.rejects(searchInvestmentSymbols('TQQQ', { eodhdKey: 'test', fetchImpl: exhausted, now: NOW + 60_001 }), isCode('QUOTA_EXHAUSTED'));
  assert.equal(calls.length, 1);
  const nextDay = Date.parse('2026-09-09T00:00:01Z');
  const recovered = await searchInvestmentSymbols('QQQ', { eodhdKey: 'test', fetchImpl: fixtureFetch({ calls }), now: nextDay });
  assert.equal(recovered.results[0].symbol, 'QQQ');
  assert.equal(calls.length, 2);
});

test('402 after a prior comparison preserves the old common result and does not issue further EOD calls', async () => {
  const calls = [];
  await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: fixtureFetch({ calls, dates: DATES.slice(0, -1) }), now: BEFORE_CLOSE });
  const exhausted = fixtureFetch({ calls, history: () => response(null, 402) });
  const data = await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: exhausted, now: NOW });
  assert.equal(data.staleReason, 'quota_exhausted');
  assert.equal(data.asOfDate, '2026-09-04');
  const count = calls.length;
  await fetchInvestmentComparison('QQQ,TQQQ', { eodhdKey: 'test', fetchImpl: exhausted, now: NOW + 6 * 60 * 1000 });
  assert.equal(calls.length, count);
});

test('network errors and malformed JSON are sanitized with distinct failure semantics', async () => {
  await assert.rejects(searchInvestmentSymbols('QQQ', {
    eodhdKey: 'fake-sensitive-value', now: NOW,
    fetchImpl: async () => { throw new Error('https://provider?api_token=fake-sensitive-value'); },
  }), (cause) => cause.code === 'PROVIDER_UNAVAILABLE' && !cause.message.includes('fake-sensitive-value'));
  await assert.rejects(searchInvestmentSymbols('SPY', {
    eodhdKey: 'test', now: NOW,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
  }), isCode('INVALID_DATA'));
});

test('both API views require authentication before any provider work and preserve method checks', async () => {
  delete process.env.QUOTE_API_AUTH_REQUIRED;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('unexpected network'); };
  for (const query of [{ view: 'investment-search', q: 'QQQ' }, { view: 'investment-comparison', symbols: 'QQQ,TQQQ' }]) {
    const res = apiResponse();
    await handler(request(query), res);
    assert.equal(res.statusCode, 401);
    assert.match(res.headers['Cache-Control'], /private, no-store/);
  }
  const res = apiResponse();
  await handler(request({ view: 'investment-comparison' }, { method: 'POST' }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(calls, 0);
});

test('API rejects malformed and repeated parameters before reading a provider key', async () => {
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  delete process.env.EODHD_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('unexpected network'); };
  for (const query of [
    { view: 'investment-comparison', symbols: 'QQQ,QQQ' },
    { view: 'investment-comparison', symbols: ['QQQ,TQQQ', 'SPY,QQQ'] },
    { view: ['investment-search', 'investment-comparison'], q: 'QQQ' },
    { view: 'investment-search', q: ['QQQ', 'SPY'] },
    { view: 'investment-search', q: '../bad' },
    { view: 'investment-search', q: 'QQQ', symbols: 'QQQ' },
  ]) {
    const res = apiResponse();
    await handler(request(query), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(calls, 0);
});

test('API exposes the documented search and comparison envelopes via the existing quote handler', async () => {
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test';
  Date.now = () => NOW;
  const calls = [];
  globalThis.fetch = fixtureFetch({ calls, search: () => response([rawInstrument('QQQ'), rawInstrument('TQQQ')]) });
  const search = apiResponse();
  await handler(request({ view: 'investment-search', q: 'QQQ' }), search);
  assert.equal(search.statusCode, 200);
  assert.equal(search.body.success, true);
  assert.equal(search.body.data.source, 'EODHD_SEARCH');
  const comparison = apiResponse();
  await handler(request({ view: 'investment-comparison', symbols: 'QQQ,TQQQ' }), comparison);
  assert.equal(comparison.statusCode, 200);
  assert.equal(comparison.body.success, true);
  assert.equal(comparison.body.data.source, 'EODHD_EOD');
  assert.equal(comparison.body.data.asOfDate, '2026-09-08');
  assert.equal(calls.length, 3);
});

test('API provider failures expose a safe code and message without upstream credentials', async () => {
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'fake-sensitive-value';
  Date.now = () => NOW;
  globalThis.fetch = async () => { throw new Error('api_token=fake-sensitive-value'); };
  const res = apiResponse();
  await handler(request({ view: 'investment-search', q: 'QQQ' }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.details.code, 'PROVIDER_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(res.body), /fake-sensitive-value|api_token/);
});
