import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import handler from '../api/quote.js';
import { ProviderTimeoutError, QUOTE_TIMEOUTS } from '../server/quote/http.js';
import {
  buildVixComparisonData,
  fetchVixComparison,
  getVixComparisonExpectedCloseDate,
  resetVixComparisonCacheForTests,
} from '../server/quote/vixComparison.js';

const NOW = Date.parse('2026-09-08T21:00:00Z');
const DATES = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08'];
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalAuthRequired = process.env.QUOTE_API_AUTH_REQUIRED;
const originalKey = process.env.EODHD_API_KEY;

beforeEach(() => resetVixComparisonCacheForTests());
afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  if (originalAuthRequired === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
  else process.env.QUOTE_API_AUTH_REQUIRED = originalAuthRequired;
  if (originalKey === undefined) delete process.env.EODHD_API_KEY;
  else process.env.EODHD_API_KEY = originalKey;
  resetVixComparisonCacheForTests();
});

function fixture(dates = DATES) {
  return {
    VIX: dates.map((date, index) => ({ date, close: 20 + index, adjusted_close: 100 + index })),
    SPY: dates.map((date, index) => ({ date, close: 600 + index, adjusted_close: 580 + index })),
    QQQ: dates.map((date, index) => ({ date, close: 550 + index, adjusted_close: 540 + index })),
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fetchFixture(data = fixture(), calls = []) {
  return async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    const providerSymbol = parsed.pathname.split('/').at(-1);
    const symbol = providerSymbol.split('.')[0];
    return response(data[symbol]);
  };
}

function apiResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request(overrides = {}) {
  return { method: 'GET', headers: {}, query: { view: 'vix-comparison' }, ...overrides };
}

test('expected close uses New York time, excludes in-progress days, weekends, and regular holidays', () => {
  const expected = [
    ['2026-09-08T19:59:59Z', '2026-09-04'],
    ['2026-09-08T20:00:00Z', '2026-09-08'],
    ['2026-09-07T23:00:00Z', '2026-09-04'],
    ['2026-09-06T21:00:00Z', '2026-09-04'],
    ['2026-09-05T03:00:00Z', '2026-09-04'],
    ['2026-01-05T20:59:59Z', '2026-01-02'],
    ['2026-01-05T21:00:00Z', '2026-01-05'],
    ['2026-04-03T21:00:00Z', '2026-04-02'],
    ['2022-01-01T03:00:00Z', '2021-12-31'],
  ];
  for (const [now, date] of expected) {
    assert.equal(getVixComparisonExpectedCloseDate(Date.parse(now)), date, now);
  }
  assert.throws(() => getVixComparisonExpectedCloseDate(NaN), /time is invalid/);
});

test('build keeps raw VIX points and strictly adjusted ETF closes on sorted, common dates', () => {
  const data = fixture();
  data.VIX.reverse();
  data.VIX.push({ date: '2026-09-04', close: '40', adjusted_close: 999 });
  data.VIX.push({ date: '2026-09-04', close: null });
  data.SPY = data.SPY.filter((row) => row.date !== '2026-09-03');
  data.QQQ.push({ date: '2026-09-01', adjusted_close: 999 });
  const result = buildVixComparisonData(data, { expectedAsOfDate: '2026-09-08', now: NOW });
  assert.equal(result.stale, false);
  assert.equal(result.staleReason, '');
  assert.equal(result.source, 'EODHD_EOD');
  assert.equal(result.fetchedAt, '2026-09-08T21:00:00.000Z');
  assert.equal(result.availableFromDate, '2026-09-02');
  assert.equal(result.asOfDate, '2026-09-08');
  assert.equal(result.pointCount, 3);
  assert.deepEqual(result.series.VIX.rows, [
    { date: '2026-09-02', close: 20 },
    { date: '2026-09-04', close: 40 },
    { date: '2026-09-08', close: 23 },
  ]);
  assert.deepEqual(result.series.SPY.rows.map((row) => row.close), [580, 582, 583]);
  assert.deepEqual(result.series.QQQ.rows.map((row) => row.date), ['2026-09-02', '2026-09-04', '2026-09-08']);
  assert.equal(result.series.VIX.priceBasis, 'close');
  assert.equal(result.series.VIX.unit, 'points');
  for (const symbol of ['SPY', 'QQQ']) {
    assert.equal(result.series[symbol].priceBasis, 'adjusted_close');
    assert.equal(result.series[symbol].unit, 'USD');
  }
});

test('build drops invalid dates and prices, future/in-progress rows, holidays, and rows outside five years', () => {
  const data = fixture(['2026-09-02', '2026-09-03', '2026-09-04']);
  const badRows = [
    { date: '2026-02-30', close: 100, adjusted_close: 100 },
    { date: 'invalid', close: 100, adjusted_close: 100 },
    { date: '2026-09-08', close: 100, adjusted_close: 100 },
    { date: '2026-09-07', close: 100, adjusted_close: 100 },
    { date: '2026-09-05', close: 100, adjusted_close: 100 },
    { date: '2021-09-02', close: 100, adjusted_close: 100 },
    ...[null, '', ' ', false, [], 0, -1, NaN, Infinity, '12invalid'].map((value) => ({
      date: '2026-09-01', close: value, adjusted_close: value,
    })),
  ];
  for (const rows of Object.values(data)) rows.push(...badRows);
  const result = buildVixComparisonData(data, {
    expectedAsOfDate: '2026-09-04', now: Date.parse('2026-09-08T19:59:00Z'),
  });
  assert.deepEqual(result.series.VIX.rows.map((row) => row.date), ['2026-09-02', '2026-09-03', '2026-09-04']);
  assert.equal(result.pointCount, 3);
  assert.throws(() => buildVixComparisonData(data, {
    expectedAsOfDate: '2026-09-08', now: Date.parse('2026-09-08T19:59:00Z'),
  }), /completed date is invalid/);
});

test('missing adjusted close never silently uses raw ETF close; a lagging series marks the common result stale', () => {
  const data = fixture();
  data.QQQ.at(-1).adjusted_close = null;
  const result = buildVixComparisonData(data, { expectedAsOfDate: '2026-09-08', now: NOW });
  assert.equal(result.stale, true);
  assert.equal(result.staleReason, 'incomplete_close');
  assert.equal(result.asOfDate, '2026-09-04');
  assert.equal(result.pointCount, 3);
  assert.ok(Object.values(result.series).every((series) => series.rows.at(-1).date === '2026-09-04'));
});

test('no intersection, malformed payload, or only one common point is unavailable, not an empty success', () => {
  for (const data of [
    fixture([]),
    fixture(['2026-09-04']),
    { ...fixture(), QQQ: [{ date: '2026-09-01', adjusted_close: 500 }] },
    { ...fixture(), SPY: { error: 'provider failure' } },
  ]) {
    assert.throws(() => buildVixComparisonData(data, {
      expectedAsOfDate: '2026-09-08', now: NOW,
    }), /insufficient common daily closes/);
  }
});

test('fetch issues exactly three bounded EOD requests, safely encodes the key, and caches completed versions', async () => {
  const calls = [];
  const fetchImpl = fetchFixture(fixture(), calls);
  const first = await fetchVixComparison({ eodhdKey: 'test&key', fetchImpl, now: () => NOW });
  assert.deepEqual(calls.map((url) => url.pathname).sort(), [
    '/api/eod/QQQ.US', '/api/eod/SPY.US', '/api/eod/VIX.INDX',
  ]);
  for (const url of calls) {
    assert.equal(url.origin, 'https://eodhd.com');
    assert.equal(url.searchParams.get('api_token'), 'test&key');
    assert.equal(url.searchParams.get('from'), '2021-09-08');
    assert.equal(url.searchParams.get('to'), '2026-09-08');
    assert.equal(url.searchParams.get('period'), 'd');
  }
  const cached = await fetchVixComparison({ eodhdKey: 'test&key', fetchImpl, now: NOW + 18 * 60 * 60 * 1000 });
  assert.equal(calls.length, 3);
  assert.deepEqual(cached, first);
  assert.doesNotMatch(JSON.stringify(first), /test&key/);
});

test('concurrent requests for the same completed date share one provider batch', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const fixtureFetch = fetchFixture(fixture(), calls);
  const fetchImpl = async (url) => { await pending; return fixtureFetch(url); };
  const first = fetchVixComparison({ eodhdKey: 'test', fetchImpl, now: NOW });
  const second = fetchVixComparison({ eodhdKey: 'test', fetchImpl, now: NOW });
  assert.equal(first, second);
  release();
  assert.deepEqual(await first, await second);
  assert.equal(calls.length, 3);
});

test('an incomplete version retries only after five minutes and promotes a newly complete response', async () => {
  const calls = [];
  let data = fixture(DATES.slice(0, -1));
  const fetchImpl = (url) => fetchFixture(data, calls)(url);
  const first = await fetchVixComparison({ eodhdKey: 'test', fetchImpl, now: NOW });
  assert.equal(first.stale, true);
  await fetchVixComparison({ eodhdKey: 'test', fetchImpl, now: NOW + 299_999 });
  assert.equal(calls.length, 3);
  data = fixture();
  const complete = await fetchVixComparison({ eodhdKey: 'test', fetchImpl, now: NOW + 300_001 });
  assert.equal(calls.length, 6);
  assert.equal(complete.asOfDate, '2026-09-08');
  assert.equal(complete.stale, false);
});

test('new-version provider failure preserves the previous success and its original timestamp with explicit stale status', async () => {
  const calls = [];
  const previousNow = Date.parse('2026-09-04T21:00:00Z');
  const original = await fetchVixComparison({
    eodhdKey: 'test', fetchImpl: fetchFixture(fixture(DATES.slice(0, -1)), calls), now: previousNow,
  });
  const failingFetch = async (url) => { calls.push(new URL(url)); return response({ error: 'limit' }, 429); };
  const fallback = await fetchVixComparison({ eodhdKey: 'test', fetchImpl: failingFetch, now: NOW });
  assert.equal(fallback.stale, true);
  assert.equal(fallback.staleReason, 'provider_unavailable');
  assert.equal(fallback.expectedAsOfDate, '2026-09-08');
  assert.equal(fallback.asOfDate, '2026-09-04');
  assert.equal(fallback.fetchedAt, original.fetchedAt);
  assert.deepEqual(fallback.series, original.series);
  await fetchVixComparison({ eodhdKey: 'test', fetchImpl: failingFetch, now: NOW + 59_999 });
  assert.equal(calls.length, 6);
  await fetchVixComparison({ eodhdKey: 'test', fetchImpl: failingFetch, now: NOW + 60_001 });
  assert.equal(calls.length, 9);
});

test('one failed series never publishes a partial result and failures without prior data are backed off', async () => {
  const calls = [];
  const successFetch = fetchFixture(fixture(), calls);
  const fetchImpl = async (url) => url.includes('QQQ.US')
    ? (calls.push(new URL(url)), response(null, 503))
    : successFetch(url);
  await assert.rejects(fetchVixComparison({ eodhdKey: 'test', fetchImpl, now: NOW }), /history unavailable/);
  await assert.rejects(fetchVixComparison({ eodhdKey: 'test', fetchImpl, now: NOW + 30_000 }), /retry deferred/);
  assert.equal(calls.length, 3);
  const recovered = await fetchVixComparison({ eodhdKey: 'test', fetchImpl: successFetch, now: NOW + 60_001 });
  assert.equal(recovered.stale, false);
  assert.equal(calls.length, 6);
});

test('successful but older provider rows cannot regress the most recent usable cached closes', async () => {
  await fetchVixComparison({
    eodhdKey: 'test', fetchImpl: fetchFixture(fixture(DATES.slice(0, -1))),
    now: Date.parse('2026-09-04T21:00:00Z'),
  });
  const result = await fetchVixComparison({
    eodhdKey: 'test', fetchImpl: fetchFixture(fixture(DATES.slice(0, -2))), now: NOW,
  });
  assert.equal(result.asOfDate, '2026-09-04');
  assert.equal(result.stale, true);
  assert.equal(result.staleReason, 'incomplete_close');
});

test('provider timeout failures are backed off without caching an empty successful response', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new ProviderTimeoutError('eodhd:vix-comparison', QUOTE_TIMEOUTS.eodhd);
  };
  await assert.rejects(fetchVixComparison({ eodhdKey: 'test', fetchImpl, now: NOW }), /history unavailable/);
  assert.equal(calls, 3);
  await assert.rejects(fetchVixComparison({ eodhdKey: 'test', fetchImpl, now: NOW }), /retry deferred/);
  assert.equal(calls, 3);
});

test('API authentication and methods are checked before VIX history provider work', async () => {
  delete process.env.QUOTE_API_AUTH_REQUIRED;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not call'); };
  const unauthorized = apiResponse();
  await handler(request(), unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.headers['Cache-Control'], 'private, no-store, max-age=0, must-revalidate');
  const unsupported = apiResponse();
  await handler(request({ method: 'POST' }), unsupported);
  assert.equal(unsupported.statusCode, 405);
  assert.equal(calls, 0);
});

test('API fixed view rejects arbitrary symbols before missing-key validation and never calls providers', async () => {
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  delete process.env.EODHD_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not call'); };
  const invalid = apiResponse();
  await handler(request({ query: { view: 'vix-comparison', symbols: 'AAPL' } }), invalid);
  assert.equal(invalid.statusCode, 400);
  const missingKey = apiResponse();
  await handler(request(), missingKey);
  assert.equal(missingKey.statusCode, 500);
  assert.equal(calls, 0);
});

test('API serves the comparison envelope and no normal quote/intraday/splits requests', async () => {
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test';
  Date.now = () => NOW;
  const calls = [];
  globalThis.fetch = fetchFixture(fixture(), calls);
  const res = apiResponse();
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.asOfDate, '2026-09-08');
  assert.equal(calls.length, 3);
  assert.ok(calls.every((url) => url.pathname.startsWith('/api/eod/')));
});

test('API provider errors return a generic 502 without exposing credentials or provider exception details', async () => {
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'sensitive-test-key';
  Date.now = () => NOW;
  globalThis.fetch = async () => { throw new Error('provider url contained sensitive-test-key'); };
  const res = apiResponse();
  await handler(request(), res);
  assert.equal(res.statusCode, 502);
  assert.equal(typeof res.body.error, 'string');
  assert.doesNotMatch(JSON.stringify(res.body), /sensitive-test-key|provider url/);
});
