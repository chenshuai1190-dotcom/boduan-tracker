import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTqqqRsiReference, normalizeTqqqRsiQuote, tqqqRsiLocalDateKey,
  tqqqRsiTradeDateReason } from '../src/lib/tqqqRsiReference.js';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const TODAY = tqqqRsiLocalDateKey(NOW);
const quote = (rsi = {}, row = {}) => ({ symbol: 'TQQQ', stockRsi: {
  period: 6, value: 32.4, asOf: '2026-10-02', priceBasis: 'adjusted_close',
  previousValue: 27.8, previousAsOf: '2026-10-01', ...rsi,
}, ...row });
const session = (id = 'user-a', token = 'token-a') => ({ data: { session: { user: { id }, access_token: token } } });
const response = (data = [quote()], status = 200, success = status === 200) => ({
  ok: status === 200, status, json: async () => ({ success, data }),
});
const args = (overrides = {}) => ({ userId: 'user-a', getSession: async () => session(),
  tradeDate: TODAY, now: () => NOW, fetchImpl: async () => response(), ...overrides });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('only current local date before its same-day completed close permits a reference', () => {
  assert.equal(tqqqRsiTradeDateReason(TODAY, NOW), '');
  assert.equal(tqqqRsiTradeDateReason('2026-10-03', NOW), 'historical-unavailable', 'weekend backfill is still historical');
  assert.equal(tqqqRsiTradeDateReason('2026-10-06', NOW), 'invalid-date');
  for (const date of ['', null, '2026-02-30', '2026-10-5', '2026-10-05T12:00:00Z']) {
    assert.equal(tqqqRsiTradeDateReason(date, NOW), 'invalid-date');
  }
  assert.equal(tqqqRsiTradeDateReason(TODAY, NaN), 'invalid-date');
  const afterClose = Date.parse('2026-10-05T20:10:00Z');
  if (tqqqRsiLocalDateKey(afterClose) === '2026-10-05') {
    assert.equal(tqqqRsiTradeDateReason('2026-10-05', afterClose), 'historical-unavailable', 'date-only recording cannot establish that the same-day close was available at execution');
  } else {
    assert.equal(tqqqRsiTradeDateReason(tqqqRsiLocalDateKey(afterClose), afterClose), '');
  }
});

test('normalizer accepts only TQQQ completed Wilder RSI(6) on the latest expected close', () => {
  assert.deepEqual(normalizeTqqqRsiQuote(quote(), { tradeDate: TODAY, now: NOW }), {
    status: 'ready', reason: '', observation: { value: 32.4, asOf: '2026-10-02', previousValue: 27.8, previousAsOf: '2026-10-01' },
  });
  for (const value of [0, 30, 70, 100]) {
    assert.equal(normalizeTqqqRsiQuote(quote({ value }), { tradeDate: TODAY, now: NOW }).observation.value, value);
  }
  for (const value of [null, undefined, '', '32.4', NaN, Infinity, -1, 101]) {
    assert.equal(normalizeTqqqRsiQuote(quote({ value }), { tradeDate: TODAY, now: NOW }).reason, 'data-unavailable');
  }
  for (const signal of [{ period: 14 }, { priceBasis: 'close' }, { asOf: '2026-02-30' }]) {
    assert.equal(normalizeTqqqRsiQuote(quote(signal), { tradeDate: TODAY, now: NOW }).reason, 'data-unavailable');
  }
  for (const row of [{ symbol: 'QQQ' }, { symbol: 'TQQQ.US' }, { error: 'upstream unavailable' }]) {
    assert.equal(normalizeTqqqRsiQuote(quote({}, row), { tradeDate: TODAY, now: NOW }).reason, 'data-unavailable');
  }
  for (const signal of [{ asOf: '2026-10-01' }, { asOf: '2026-10-05' }, { asOf: '2026-10-03' }]) {
    assert.equal(normalizeTqqqRsiQuote(quote(signal), { tradeDate: TODAY, now: NOW }).reason, 'stale-data');
  }
  assert.equal(normalizeTqqqRsiQuote(quote({}, { stale: true }), { tradeDate: TODAY, now: NOW }).reason, 'stale-data');
});

test('missing or gapped previous RSI preserves the valid current value without fabricating a crossing', () => {
  for (const patch of [{ previousValue: null }, { previousValue: '27.8' }, { previousValue: 101 },
    { previousAsOf: null }, { previousAsOf: '2026-09-30' }, { previousAsOf: '2026-10-02' }, { previousAsOf: '2026-10-05' }]) {
    const result = normalizeTqqqRsiQuote(quote(patch), { tradeDate: TODAY, now: NOW });
    assert.equal(result.observation.value, 32.4);
    assert.equal(result.observation.previousValue, null);
    assert.equal(result.observation.previousAsOf, null);
  }
});

test('completed-session freshness bridges weekends and ordinary exchange holidays', () => {
  for (const [time, asOf, previousAsOf] of [
    ['2026-10-06T12:00:00Z', '2026-10-05', '2026-10-02'],
    ['2026-09-09T12:00:00Z', '2026-09-08', '2026-09-04'],
  ]) {
    const now = Date.parse(time);
    const result = normalizeTqqqRsiQuote(quote({ asOf, previousAsOf }), { tradeDate: tqqqRsiLocalDateKey(now), now });
    assert.equal(result.status, 'ready');
    assert.equal(result.observation.previousAsOf, previousAsOf);
  }
});

test('a qualified existing quote is authenticated and reused without a provider request', async () => {
  let authCalls = 0;
  const result = await loadTqqqRsiReference(args({ quote: () => quote(), getSession: async () => { authCalls++; return session(); },
    fetchImpl: async () => { assert.fail('qualified quote must not be fetched again'); } }));
  assert.equal(result.status, 'ready');
  assert.equal(authCalls, 1);
  await assert.rejects(loadTqqqRsiReference(args({ quote: quote(), getSession: async () => session('user-b') })), { code: 'AUTH_REQUIRED' });
});

test('first purchase without cached TQQQ fetches one authenticated ordinary quote', async () => {
  let calls = 0;
  const result = await loadTqqqRsiReference(args({ fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, '/api/quote?symbols=TQQQ');
    assert.equal(options.headers.Authorization, 'Bearer token-a');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return response();
  } }));
  assert.equal(result.status, 'ready');
  assert.equal(calls, 1);
  assert.equal(result.observation.previousValue, 27.8);
});

test('stale cache receives one attempt, while malformed or still-stale replies stay unavailable', async () => {
  for (const [reply, expected] of [[response([], 200), 'data-unavailable'], [response(null), 'data-unavailable'],
    [response([quote({ value: null })]), 'data-unavailable'], [response([quote({ asOf: '2026-10-01' })]), 'stale-data'],
    [response([quote()], 200, false), 'data-unavailable']]) {
    let calls = 0;
    const result = await loadTqqqRsiReference(args({ quote: quote({ asOf: '2026-10-01' }),
      fetchImpl: async () => { calls++; return reply; } }));
    assert.equal(result.reason, expected);
    assert.equal(result.observation, null);
    assert.equal(calls, 1);
  }
});

test('historical and future dates skip both authentication and HTTP rather than using current RSI', async () => {
  for (const tradeDate of ['2026-10-02', '2026-10-03', '2026-10-06', '']) {
    const result = await loadTqqqRsiReference(args({ tradeDate,
      getSession: async () => { assert.fail('date is not eligible'); }, fetchImpl: async () => { assert.fail('date is not eligible'); } }));
    assert.equal(result.status, 'unavailable');
    assert.equal(result.observation, null);
  }
});

test('logout, identity switch and changed credentials during HTTP discard the response', async () => {
  for (const nextSession of [session('user-b'), session('user-a', 'token-refreshed'), { data: { session: null } }]) {
    let authCalls = 0;
    await assert.rejects(loadTqqqRsiReference(args({ getSession: async () => ++authCalls === 1 ? session() : nextSession })), { code: 'AUTH_REQUIRED' });
  }
});

test('closing aborts promptly even when the HTTP implementation ignores cancellation', async () => {
  const pending = deferred();
  const started = deferred();
  const controller = new AbortController();
  const request = loadTqqqRsiReference(args({ signal: controller.signal,
    fetchImpl: async () => { started.resolve(); return pending.promise; } }));
  await started.promise;
  controller.abort();
  await assert.rejects(request, { code: 'REQUEST_ABORTED' });
  pending.resolve(response());
});

test('timeouts and failed authentication finish without retries or a fallback zero', async () => {
  await assert.rejects(loadTqqqRsiReference(args({ timeoutMs: 1, fetchImpl: async () => new Promise(() => {}) })), { code: 'NETWORK_ERROR' });
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    await assert.rejects(loadTqqqRsiReference(args({ fetchImpl: async () => { calls++; return response([], status); } })),
      { code: [401, 403].includes(status) ? 'AUTH_REQUIRED' : 'NETWORK_ERROR' });
    assert.equal(calls, 1);
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadTqqqRsiReference(args({ signal: controller.signal })), { code: 'REQUEST_ABORTED' });
});
