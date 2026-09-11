import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/quote.js';
import {
  createFearGreedService,
  FEAR_GREED_TTL_MS,
  FEAR_GREED_FAILURE_BACKOFF_MS,
  FEAR_GREED_RATE_LIMIT_BACKOFF_MS,
  normalizeFearGreedPayload,
} from '../server/quote/fearGreed.js';

const CURRENT_AT = Date.parse('2026-09-10T23:59:55Z');
const FETCHED_AT = Date.parse('2026-09-11T01:40:00Z');
const SEPT_9 = Date.parse('2026-09-09T00:00:00Z');
const SEPT_10 = Date.parse('2026-09-10T00:00:00Z');

// Small public CNN graphdata sample, including deliberately different raw units and score metadata.
function fixture(at = CURRENT_AT) {
  const payload = {
    fear_and_greed: {
      score: 33.2571428571429, rating: 'fear', timestamp: new Date(at).toISOString(),
      previous_close: 38.2, previous_1_week: 47.51428571428572,
      previous_1_month: 64.37142857142858, previous_1_year: 57.94285714285714,
    },
    fear_and_greed_historical: { data: [
      { x: SEPT_9, y: 38.2, rating: 'fear' },
      { x: SEPT_10, y: 33.2571428571429, rating: 'fear' },
      { x: at, y: 33.2571428571429, rating: 'fear' },
    ] },
  };
  for (const [key, value, score, rating] of [
    ['market_momentum_sp500', 7591.7, 24.4, 'extreme fear'],
    ['market_momentum_sp125', 7329.79952, 24.4, 'extreme fear'],
    ['stock_price_strength', -1.89447848846893, 6.8, 'extreme fear'],
    ['stock_price_breadth', 843.183023130558, 19.2, 'extreme fear'],
    ['put_call_options', 0.740904444505589, 42, 'fear'],
    ['market_volatility_vix', 17.84, 50, 'neutral'],
    ['market_volatility_vix_50', 16.1502, 50, 'neutral'],
    ['safe_haven_demand', -0.242569480215727, 21.4, 'extreme fear'],
    ['junk_bond_demand', 1.22037261874269, 69, 'greed'],
  ]) {
    payload[key] = { score, rating, timestamp: at - 60_000, data: [
      { x: SEPT_9, y: value, rating: 'extreme greed' },
      { x: SEPT_10, y: value, rating: 'extreme greed' },
      { x: at - 60_000, y: value, rating: 'extreme greed' },
    ] };
  }
  return payload;
}

const normalize = payload => normalizeFearGreedPayload(payload, { fetchedAt: FETCHED_AT });
const response = (payload = fixture()) => ({ ok: true, json: async () => payload });

test('CNN detail separates seven scored indicators from nine raw series and keeps source dates', () => {
  const data = normalize(fixture());
  assert.equal(data.source, 'CNN');
  assert.equal(data.asOf, '2026-09-10T23:59:55.000Z');
  assert.equal(data.fetchedAt, '2026-09-11T01:40:00.000Z');
  assert.equal(data.stale, false);
  assert.deepEqual(data.indicators.map(item => item.id), ['momentum', 'strength', 'breadth', 'options', 'volatility', 'safeHaven', 'junkBonds']);
  assert.equal(data.indicators.flatMap(item => item.series).length, 9);
  assert.equal(data.indicators[0].score, 24.4);
  assert.equal(data.indicators[0].rating, 'extreme fear');
  assert.equal(data.indicators[0].series[0].points.at(-1).value, 7591.7);
  assert.equal(data.indicators[1].series[0].points.at(-1).value, -1.89447848846893);
  assert.ok(data.indicators.flatMap(item => item.series).flatMap(item => item.points).every(point => !('rating' in point)));
  assert.deepEqual(data.history.map(point => point.timestamp), [SEPT_9, CURRENT_AT]);
  assert.equal(new Date(data.history[0].timestamp).toISOString().slice(0, 10), '2026-09-09');
  assert.equal(data.comparisons.weekAgo, 47.51428571428572);
});

test('CNN detail never coerces missing values to zero or substitutes raw units for scores', () => {
  const payload = fixture();
  Object.assign(payload.fear_and_greed, { previous_close: 0, previous_1_week: null, previous_1_month: '', previous_1_year: 101 });
  Object.assign(payload.market_momentum_sp500, { score: null, rating: null });
  Object.assign(payload.stock_price_strength, { score: 0, rating: 'extreme fear' });
  delete payload.junk_bond_demand;
  const data = normalize(payload);
  assert.deepEqual(data.comparisons, { previousClose: 0, weekAgo: null, monthAgo: null, yearAgo: null });
  assert.equal(data.indicators[0].score, null);
  assert.equal(data.indicators[0].rating, null);
  assert.equal(data.indicators[0].series[0].points.at(-1).value, 7591.7);
  assert.equal(data.indicators[1].score, 0);
  assert.deepEqual(data.indicators.at(-1), { id: 'junkBonds', score: null, rating: null, timestamp: null, series: [{ id: 'junk_bond_demand', points: [] }] });
});

test('CNN detail rejects invalid current scores, ratings, dates and empty valid history', () => {
  for (const value of [null, undefined, '', '33', false, {}, NaN, Infinity, -1, 101]) {
    const payload = fixture();
    payload.fear_and_greed.score = value;
    assert.throws(() => normalize(payload), { code: 'INVALID_DATA' });
  }
  for (const value of [null, 'unknown', 0]) {
    const payload = fixture();
    payload.fear_and_greed.rating = value;
    assert.throws(() => normalize(payload), { code: 'INVALID_DATA' });
  }
  for (const value of [null, '', 0, CURRENT_AT / 1000, '2026-02-31T00:00:00Z', '2026-09-10', FETCHED_AT + 1]) {
    const payload = fixture();
    payload.fear_and_greed.timestamp = value;
    assert.throws(() => normalize(payload), { code: 'INVALID_DATA' });
  }
  const payload = fixture();
  payload.fear_and_greed_historical.data = [{ x: SEPT_9, y: null }];
  assert.throws(() => normalize(payload), { code: 'INVALID_DATA' });
});

test('CNN history sorts and keeps the final source-day observation, preserving official ratings or null', () => {
  const payload = fixture();
  payload.fear_and_greed_historical.data = [
    { x: CURRENT_AT, y: payload.fear_and_greed.score, rating: 'fear' },
    { x: SEPT_10, y: 40, rating: 'fear' },
    { x: SEPT_9, y: 38.2, rating: 'not-a-rating' },
    { x: Date.parse('2025-01-01T00:00:00Z'), y: 50, rating: 'neutral' },
    { x: FETCHED_AT + 1, y: 30, rating: 'fear' },
    { x: SEPT_9 / 1000, y: 35, rating: 'fear' },
    { x: SEPT_9 - 86_400_000, y: null, rating: 'fear' },
  ];
  payload.stock_price_strength.data.push({ x: SEPT_9 - 86_400_000, y: null, rating: 'extreme fear' });
  const data = normalize(payload);
  assert.deepEqual(data.history, [
    { timestamp: SEPT_9, value: 38.2, rating: null },
    { timestamp: CURRENT_AT, value: payload.fear_and_greed.score, rating: 'fear' },
  ]);
  assert.equal(data.indicators[1].series[0].points.length, 2);
  payload.fear_and_greed_historical.data.push({ x: CURRENT_AT, y: 41, rating: 'fear' });
  assert.throws(() => normalize(payload), { code: 'INVALID_DATA' });
});

test('CNN detail coalesces concurrent reads and caches for fifteen minutes without an EODHD request', async () => {
  let now = FETCHED_AT;
  let calls = 0;
  let resolve;
  const service = createFearGreedService({
    now: () => now,
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata/2025-08-07');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.headers.Authorization, undefined);
      if (calls === 1) return new Promise(done => { resolve = done; });
      return response();
    },
  });
  const first = service();
  const second = service();
  assert.equal(calls, 1);
  resolve(response());
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  now += FEAR_GREED_TTL_MS - 1;
  assert.equal(await service(), a);
  assert.equal(calls, 1);
  now += 1;
  assert.equal((await service()).stale, false);
  assert.equal(calls, 2);
});

test('CNN detail retains valid data on failures, backs off and recovers without falsifying fetchedAt', async () => {
  let now = FETCHED_AT;
  let calls = 0;
  const service = createFearGreedService({ now: () => now, fetchImpl: async () => {
    calls += 1;
    if (calls === 2) throw new Error('upstream unavailable');
    return response();
  } });
  const original = await service();
  now += FEAR_GREED_TTL_MS;
  const failed = await service();
  assert.equal(failed.stale, true);
  assert.equal(failed.fetchedAt, original.fetchedAt);
  assert.equal(failed.current, original.current);
  now += FEAR_GREED_FAILURE_BACKOFF_MS - 1;
  assert.equal((await service()).stale, true);
  assert.equal(calls, 2);
  now += 1;
  const recovered = await service();
  assert.equal(recovered.stale, false);
  assert.equal(recovered.fetchedAt, new Date(now).toISOString());
  assert.equal(calls, 3);
});

test('CNN 429 extends backoff using Retry-After and cold failures do not create fake data', async () => {
  let now = FETCHED_AT;
  let calls = 0;
  const service = createFearGreedService({ now: () => now, fetchImpl: async () => {
    calls += 1;
    return { ok: false, status: 429, headers: new Headers({ 'Retry-After': '3600' }) };
  } });
  await assert.rejects(service(), { code: 'RATE_LIMITED' });
  now += FEAR_GREED_RATE_LIMIT_BACKOFF_MS;
  await assert.rejects(service(), { code: 'RATE_LIMITED' });
  assert.equal(calls, 1);
  now += 30 * 60_000;
  await assert.rejects(service(), { code: 'RATE_LIMITED' });
  assert.equal(calls, 2);
});

test('CNN older timestamps and same-time conflicts retain the newest valid snapshot as stale', async () => {
  for (const change of [
    payload => { payload.fear_and_greed.timestamp = new Date(CURRENT_AT - 1000).toISOString(); },
    payload => { payload.fear_and_greed.score = 40; payload.fear_and_greed_historical.data.at(-1).y = 40; },
    payload => { payload.stock_price_strength.data.at(-1).y = -99; },
  ]) {
    let now = FETCHED_AT;
    let calls = 0;
    const service = createFearGreedService({ now: () => now, fetchImpl: async () => {
      const payload = fixture();
      if (calls++ > 0) change(payload);
      return response(payload);
    } });
    const accepted = await service();
    now += FEAR_GREED_TTL_MS;
    const rejected = await service();
    assert.equal(rejected.stale, true);
    assert.equal(rejected.current, accepted.current);
    assert.equal(rejected.fetchedAt, accepted.fetchedAt);
    assert.equal(rejected.indicators[1].series[0].points.at(-1).value, -1.89447848846893);
  }
});

test('CNN repeated timestamps can add missing history while later daily points and indicator times stay monotonic', async () => {
  let now = FETCHED_AT;
  let calls = 0;
  const service = createFearGreedService({ now: () => now, fetchImpl: async () => {
    const payload = fixture();
    if (calls++ === 0) {
      payload.fear_and_greed_historical.data = payload.fear_and_greed_historical.data.slice(1);
      payload.market_momentum_sp500.score = null;
      payload.market_momentum_sp500.rating = null;
    } else if (calls === 3) {
      payload.stock_price_strength.timestamp -= 1000;
      payload.stock_price_strength.score = 10;
    }
    return response(payload);
  } });
  const first = await service();
  assert.equal(first.history.length, 1);
  now += FEAR_GREED_TTL_MS;
  const enriched = await service();
  assert.equal(enriched.history.length, 2);
  assert.equal(enriched.indicators[0].score, 24.4);
  assert.equal(enriched.stale, false);
  now += FEAR_GREED_TTL_MS;
  const olderIndicator = await service();
  assert.equal(olderIndicator.indicators[1].score, 6.8);
  assert.equal(olderIndicator.indicators[1].timestamp, enriched.indicators[1].timestamp);
  assert.equal(olderIndicator.stale, true);
});

function createResponse() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

test('fear-greed view requires login even with legacy auth disabled, rejects extra/repeated parameters, and needs no EODHD key', async () => {
  const envKeys = ['QUOTE_API_AUTH_REQUIRED', 'EODHD_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  let providerCalls = 0;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  delete process.env.EODHD_API_KEY;
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-test-key';
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return { ok: options.headers.Authorization === 'Bearer good-token', json: async () => ({ id: 'user-1' }) };
    }
    assert.match(String(url), /^https:\/\/production\.dataviz\.cnn\.io\//);
    providerCalls += 1;
    return response(fixture(Date.now() - 10_000));
  };
  const request = (query, authorization) => ({ method: 'GET', headers: authorization ? { authorization } : {}, query });
  try {
    for (const authorization of [undefined, 'Bearer bad-token']) {
      const res = createResponse();
      await handler(request({ view: 'fear-greed' }, authorization), res);
      assert.equal(res.statusCode, 401);
      assert.match(res.headers['Cache-Control'], /private, no-store/);
    }
    for (const query of [
      { view: ['fear-greed'] }, { view: ['stock-detail', 'fear-greed'] },
      { view: 'fear-greed', symbols: 'TQQQ' }, { view: 'fear-greed', date: '2026-09-10' },
    ]) {
      const res = createResponse();
      await handler(request(query, 'Bearer good-token'), res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.details.code, 'INVALID_PARAMETERS');
      assert.match(res.headers['Cache-Control'], /private, no-store/);
    }
    assert.equal(providerCalls, 0);
    const res = createResponse();
    await handler(request({ view: 'fear-greed' }, 'Bearer good-token'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.source, 'CNN');
    assert.equal(providerCalls, 1);
    assert.match(res.headers['Cache-Control'], /private, no-store/);
    assert.equal(res.headers.Pragma, 'no-cache');
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});
