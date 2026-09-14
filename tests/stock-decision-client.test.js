import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStockDecision, normalizeStockDecisionData, normalizeStockDecisionSymbol } from '../src/lib/stockDecision.js';
import { getInvestmentComparisonExpectedCloseDate } from '../src/lib/investmentComparison.js';

const timestamp = Date.parse('2026-09-14T19:00:00Z');
const session = userId => async () => ({ data: { session: { user: { id: userId }, access_token: `test-token-${userId}` } } });
const response = data => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const errorResponse = (status, code) => ({ ok: false, status, json: async () => ({ success: false, details: { code } }) });
const options = (userId, extra = {}) => ({ userId, symbol: 'AAPL', getSession: session(userId), now: () => timestamp, ...extra });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function payload(symbol = 'AAPL', now = timestamp) {
  const asOf = getInvestmentComparisonExpectedCloseDate(now);
  const dates = [];
  const cursor = new Date(`${asOf}T00:00:00Z`);
  while (dates.length < 120) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  const history = dates.map((date, index) => ({ date, close: 100 + index * 0.02 }));
  return {
    schemaVersion: 1, source: 'EODHD', symbol, currency: 'USD', name: 'Example stock',
    priceBasis: 'adjusted_ohlc', asOf, expectedAsOfDate: asOf, stale: false, fetchedAt: new Date(now).toISOString(),
    model: {
      version: 'stock-decision-v1', asOf, price: history.at(-1).close, changePct: 0.02, history,
      verdict: 'observe', reasons: ['structure_improving'],
      trend: { state: 'uptrend', lastHigh: 104, lastLow: 90 },
      position: { state: 'above_support', atr: 2, resistance: null, brokenSupport: null,
        support: { lower: 89, upper: 91, touches: 1, pivots: [{ date: dates.at(-10), confirmedAt: dates.at(-7), price: 90 }] } },
      volume: { state: 'neutral', ratio: 1, medianRatio: 1, breakout: null },
      momentum: { period: 6, priceBasis: 'adjusted_close', value: 55, asOf, bearishDivergence: 'none', divergenceDate: null },
    },
  };
}

test('stock symbols normalize US tickers and reject paths, foreign suffixes and query fragments', () => {
  for (const [input, expected] of [[' aapl.us ', 'AAPL'], ['brk.b', 'BRK.B'], ['brk-b', 'BRK-B'], ['QQQ', 'QQQ']]) {
    assert.equal(normalizeStockDecisionSymbol(input), expected);
  }
  for (const input of [null, 0, '', '../AAPL', 'AAPL&user=other', 'AAPL?force=1', 'A..B', '9988.HK', 'USD.FOREX', 'BTC.CC', 'GSPC.INDX', 'VOD.LSE', 'SHOP.TO', 'ABCDEFGHIJKLMNOP']) {
    assert.equal(normalizeStockDecisionSymbol(input), '', String(input));
  }
});

test('normalization enforces schema, basis, symbol and causal close dates', () => {
  assert.ok(normalizeStockDecisionData(payload(), { symbol: 'aapl.us', now: timestamp }));
  const mutations = [
    data => { data.schemaVersion = 2; },
    data => { data.source = 'unverified'; },
    data => { data.symbol = 'MSFT'; },
    data => { data.currency = 'HKD'; },
    data => { data.priceBasis = 'split_adjusted_close'; },
    data => { data.model.momentum.priceBasis = 'raw_close'; },
    data => { data.asOf = '2026-02-30'; },
    data => { data.expectedAsOfDate = '2026-09-15'; },
    data => { data.model.asOf = '2026-09-10'; },
    data => { data.model.history.at(-1).close += 1; },
    data => { data.model.history.at(-1).date = '2026-09-15'; },
    data => { data.model.history[1].date = data.model.history[0].date; },
    data => { data.model.position.support.pivots[0].confirmedAt = '2026-09-15'; },
    data => { data.fetchedAt = '2030-01-01T00:00:00Z'; },
    data => { data.model.momentum.bearishDivergence = 'confirmed'; data.model.momentum.divergenceDate = '2026-09-15'; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const data = payload(); mutate(data);
    assert.equal(normalizeStockDecisionData(data, { symbol: 'AAPL', now: timestamp }) === null, true, `invalid contract case ${index}`);
  }
});

test('valuation close retains its separate unadjusted basis without changing the technical report or input quote', () => {
  const data = payload();
  data.valuationClose = { price: 105, date: data.asOf, basis: 'unadjusted_close', providerExtra: 'discard' };
  const original = structuredClone(data);
  const normalized = normalizeStockDecisionData(data, { symbol: 'AAPL', now: timestamp });
  assert.deepEqual(normalized.valuationClose, { price: 105, date: data.asOf, basis: 'unadjusted_close' });
  assert.notEqual(normalized.valuationClose.price, normalized.model.price);
  assert.deepEqual(normalized.model, original.model);
  assert.equal(normalized.priceBasis, 'adjusted_ohlc');
  assert.deepEqual(data, original);
  const nextClose = Date.parse('2026-09-14T20:30:00Z');
  const stale = normalizeStockDecisionData(data, { symbol: 'AAPL', now: nextClose });
  assert.equal(stale.stale, true);
  assert.equal(stale.expectedAsOfDate, '2026-09-14');
  assert.equal(stale.valuationClose.date, '2026-09-11', 'valuation keeps the actual historical close date');
});

test('missing or invalid valuation closes stay null without replacing or disabling valid technical data', () => {
  const valid = { price: 105, date: '2026-09-11', basis: 'unadjusted_close' };
  const values = [undefined, null, [], 105, '105', {},
    ...[undefined, null, '', '105', false, 0, -1, NaN, Infinity].map(price => ({ ...valid, price })),
    ...[undefined, null, '2026-02-30', '2026-09-10', '2026-09-14'].map(date => ({ ...valid, date })),
    ...[undefined, null, 'adjusted_close', 'adjusted_ohlc', 'split_adjusted_close'].map(basis => ({ ...valid, basis })),
  ];
  for (const [index, valuationClose] of values.entries()) {
    const data = payload();
    if (valuationClose !== undefined) data.valuationClose = valuationClose;
    const normalized = normalizeStockDecisionData(data, { symbol: 'AAPL', now: timestamp });
    assert.ok(normalized, `technical report remains available: case ${index}`);
    assert.equal(normalized.valuationClose, null, `no adjusted/model-price fallback: case ${index}`);
    assert.deepEqual(normalized.model, data.model);
    assert.equal(normalized.model.verdict, 'observe');
  }
});

test('missing numbers stay null while real zero values remain valid', () => {
  const data = payload();
  Object.assign(data.model, { verdict: 'insufficient', price: null, changePct: null, history: [] });
  data.model.trend = { state: 'insufficient', lastHigh: null, lastLow: null };
  data.model.position = { state: 'unavailable', atr: null, support: null, resistance: null, brokenSupport: null };
  data.model.volume = { state: 'insufficient', ratio: null, medianRatio: null, breakout: null };
  data.model.momentum = { period: 6, priceBasis: 'adjusted_close', value: null, asOf: null, bearishDivergence: 'insufficient_data', divergenceDate: null };
  const normalized = normalizeStockDecisionData(data, { symbol: 'AAPL', now: timestamp });
  assert.ok(normalized);
  assert.deepEqual([
    normalized.model.price, normalized.model.changePct, normalized.model.trend.lastHigh, normalized.model.trend.lastLow,
    normalized.model.position.atr, normalized.model.volume.ratio, normalized.model.volume.medianRatio,
    normalized.model.momentum.value,
  ], Array(8).fill(null));
  const zero = payload();
  zero.model.verdict = 'wait';
  zero.model.changePct = 0;
  zero.model.volume.ratio = 0;
  zero.model.volume.medianRatio = 0;
  zero.model.momentum.value = 0;
  assert.ok(normalizeStockDecisionData(zero, { symbol: 'AAPL', now: timestamp }));
  for (const badValue of [undefined, '', '0', NaN, Infinity]) {
    const invalid = payload(); invalid.model.changePct = badValue;
    assert.equal(normalizeStockDecisionData(invalid, { symbol: 'AAPL', now: timestamp }), null);
  }
});

test('observe cannot claim a usable setup while its required analysis data is absent', () => {
  const mutations = [
    ['trend', data => { data.model.trend.state = 'insufficient'; }],
    ['momentum', data => { data.model.momentum.value = null; }],
    ['divergence coverage', data => { data.model.momentum.bearishDivergence = 'insufficient_data'; }],
    ['volume state', data => { data.model.volume.state = 'insufficient'; }],
    ['price position', data => { data.model.position.state = 'unavailable'; data.model.position.support = null; }],
    ['ATR', data => { data.model.position.atr = null; }],
    ['mean volume ratio', data => { data.model.volume.ratio = null; }],
    ['median volume ratio', data => { data.model.volume.medianRatio = null; }],
  ];
  const acceptedMissingData = [];
  for (const [name, mutate] of mutations) {
    const data = payload(); mutate(data);
    if (normalizeStockDecisionData(data, { symbol: 'AAPL', now: timestamp }) !== null) acceptedMissingData.push(name);
  }
  assert.deepEqual(acceptedMissingData, [], 'observe must reject each incomplete analysis category');
});

test('malformed nested history and pivot entries fail closed without throwing', () => {
  for (const mutate of [
    data => { data.model.history = [null]; },
    data => { data.model.position.support.pivots = [null]; },
  ]) {
    const data = payload(); mutate(data);
    let normalized;
    assert.doesNotThrow(() => { normalized = normalizeStockDecisionData(data, { symbol: 'AAPL', now: timestamp }); });
    assert.equal(normalized === null, true);
  }
});

test('freshness preserves explicit stale and recalculates the expected completed session', () => {
  const explicit = payload(); explicit.stale = true;
  assert.equal(normalizeStockDecisionData(explicit, { symbol: 'AAPL', now: timestamp }).stale, true);
  const nextClose = Date.parse('2026-09-14T20:30:00Z');
  const normalized = normalizeStockDecisionData(payload(), { symbol: 'AAPL', now: nextClose });
  assert.equal(normalized.asOf, '2026-09-11');
  assert.equal(normalized.expectedAsOfDate, '2026-09-14');
  assert.equal(normalized.stale, true);
});

test('cache and single-flight keys isolate authenticated user, symbol and completed trading date', async () => {
  let clock = timestamp;
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls += 1;
    const requested = new URL(url, 'https://example.test').searchParams.get('symbol');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    assert.doesNotMatch(url, /test-token|client-keys|shares|amount/);
    assert.equal(init.body, undefined);
    return response(payload(requested, clock));
  };
  const first = options('client-keys-first', { now: () => clock, fetchImpl });
  await loadStockDecision(first);
  await loadStockDecision({ ...first, symbol: 'aapl.us' });
  assert.equal(calls, 1);
  await loadStockDecision(options('client-keys-second', { now: () => clock, fetchImpl }));
  await loadStockDecision({ ...first, symbol: 'MSFT' });
  assert.equal(calls, 3);
  clock = Date.parse('2026-09-14T20:30:00Z');
  const nextSession = await loadStockDecision(first);
  assert.equal(nextSession.asOf, '2026-09-14');
  assert.equal(calls, 4, 'a new completed session bypasses the prior still-valid six-hour cache');
});

test('four complete technical dimensions remain usable and cached across NY midnight without an event field', async () => {
  let clock = Date.parse('2026-09-12T03:50:00Z');
  let calls = 0;
  const config = options('client-no-event-midnight', {
    now: () => clock,
    fetchImpl: async () => { calls += 1; return response(payload('AAPL', clock)); },
  });
  const first = await loadStockDecision(config);
  assert.equal(first.model.verdict, 'observe');
  assert.equal(Object.hasOwn(first.model, 'events'), false);
  clock = Date.parse('2026-09-12T04:10:00Z');
  const nextDay = await loadStockDecision(config);
  assert.equal(nextDay, first);
  assert.equal(calls, 1, 'crossing a calendar day does not invalidate the same completed price session');
});

test('session is checked before a request, on cache hits and after the response', async () => {
  const userId = 'client-session-checks';
  let checks = 0;
  let calls = 0;
  let identity = userId;
  const config = options(userId, { getSession: async () => { checks += 1; return session(identity)(); },
    fetchImpl: async () => { calls += 1; return response(payload()); } });
  await loadStockDecision(config);
  assert.equal(checks, 2);
  await loadStockDecision(config);
  assert.equal(checks, 3);
  identity = 'another-user';
  await assert.rejects(loadStockDecision(config), { code: 'AUTH_REQUIRED' });
  assert.equal(calls, 1, 'mismatched cached readers must not fetch');
  await assert.rejects(loadStockDecision(options('client-session-rejected', { getSession: async () => { throw new Error('session unavailable'); },
    fetchImpl: async () => { throw new Error('must not fetch'); } })), { code: 'AUTH_REQUIRED' });
});

test('concurrent subscribers share one request while an aborted caller cannot receive its result', async () => {
  const userId = 'client-shared-abort';
  const started = deferred();
  const pending = deferred();
  const controller = new AbortController();
  let calls = 0;
  const config = options(userId, { fetchImpl: () => { calls += 1; started.resolve(); return pending.promise; } });
  const first = loadStockDecision({ ...config, signal: controller.signal });
  await started.promise;
  const second = loadStockDecision(config);
  controller.abort();
  await assert.rejects(first, { code: 'REQUEST_ABORTED' });
  pending.resolve(response(payload()));
  assert.equal((await second).symbol, 'AAPL');
  assert.equal(calls, 1);
});

test('abort during session lookup does not start a network request', async () => {
  const userId = 'client-auth-abort';
  const auth = deferred();
  const controller = new AbortController();
  let calls = 0;
  const request = loadStockDecision(options(userId, { signal: controller.signal, getSession: () => auth.promise,
    fetchImpl: async () => { calls += 1; return response(payload()); } }));
  controller.abort();
  auth.resolve(await session(userId)());
  await assert.rejects(request, { code: 'REQUEST_ABORTED' });
  assert.equal(calls, 0);
});

test('account switches reject late responses and cannot populate the previous user cache', async () => {
  const userId = 'client-account-switch';
  const started = deferred();
  const pending = deferred();
  let identity = userId;
  const getSession = () => session(identity)();
  const request = loadStockDecision(options(userId, { getSession, fetchImpl: () => { started.resolve(); return pending.promise; } }));
  await started.promise;
  identity = 'client-account-switch-other';
  pending.resolve(response(payload()));
  await assert.rejects(request, { code: 'AUTH_REQUIRED' });
  identity = userId;
  let calls = 0;
  await loadStockDecision(options(userId, { getSession, fetchImpl: async () => { calls += 1; return response(payload()); } }));
  assert.equal(calls, 1, 're-entering the original account must fetch instead of reading the rejected result');
});

test('network and quota failures back off without repeated forced requests, then recover', async () => {
  for (const [suffix, status, code, retryMs] of [['network', 503, 'NETWORK_ERROR', 60000], ['quota', 429, 'QUOTA_EXHAUSTED', 300000]]) {
    const userId = `client-backoff-${suffix}`;
    let clock = timestamp;
    let calls = 0;
    const config = options(userId, { now: () => clock, fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? errorResponse(status, code) : response(payload('AAPL', clock));
    } });
    await assert.rejects(loadStockDecision(config), { code });
    await assert.rejects(loadStockDecision({ ...config, force: true }), { code });
    clock += retryMs - 1;
    await assert.rejects(loadStockDecision(config), { code });
    assert.equal(calls, 1);
    clock += 1;
    assert.equal((await loadStockDecision(config)).stale, false);
    assert.equal(calls, 2);
  }
});

test('a failed refresh retains the last complete report with stale visible on every cached read', async () => {
  const userId = 'client-retained-stale';
  let calls = 0;
  const config = options(userId, { fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? response(payload()) : errorResponse(503, 'NETWORK_ERROR');
  } });
  const fresh = await loadStockDecision(config);
  assert.equal(fresh.stale, false);
  const failedRefresh = await loadStockDecision({ ...config, force: true });
  assert.equal(failedRefresh.stale, true);
  assert.deepEqual(failedRefresh.model, fresh.model);
  const reread = await loadStockDecision(config);
  assert.equal(reread.stale, true, 'a cache hit after the failed refresh must not claim the old report is fresh');
  assert.equal(calls, 2);
});
