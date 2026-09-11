import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeFearGreed, loadFearGreed, clearFearGreedCache } from '../src/lib/fearGreed.js';

const instant = Date.parse('2026-09-11T01:00:00Z');
const asOf = '2026-09-10T23:59:55.000Z';
const contracts = {
  momentum: ['market_momentum_sp500', 'market_momentum_sp125'], strength: ['stock_price_strength'],
  breadth: ['stock_price_breadth'], options: ['put_call_options'],
  volatility: ['market_volatility_vix', 'market_volatility_vix_50'],
  safeHaven: ['safe_haven_demand'], junkBonds: ['junk_bond_demand'],
};
function payload() {
  return { source: 'CNN', asOf, fetchedAt: new Date(instant).toISOString(), stale: false,
    current: { score: 33.25, rating: 'fear', timestamp: asOf },
    comparisons: { previousClose: 38.2, weekAgo: 47.5, monthAgo: null, yearAgo: 57.9 },
    history: [{ timestamp: instant - 2 * 86400000, value: 38.2, rating: 'fear' },
      { timestamp: Date.parse(asOf), value: 33.25, rating: 'fear' }],
    indicators: Object.entries(contracts).map(([id, keys]) => ({ id, score: 24.4, rating: 'extreme fear',
      timestamp: asOf, series: keys.map(key => ({ id: key, points: [
        { timestamp: instant - 2 * 86400000, value: 7200 }, { timestamp: Date.parse(asOf), value: 7300 },
      ] })) })),
  };
}
const session = id => async () => ({ data: { session: { user: { id }, access_token: 'test-session' } } });
const response = data => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const options = id => ({ userId: id, getSession: session(id), now: () => instant });

test('recorded CNN preview uses the production data contract and its original dates', () => {
  const recorded = JSON.parse(readFileSync(new URL('../src/dev/fixtures/cnnFearGreedSnapshot.json', import.meta.url), 'utf8'));
  const data = normalizeFearGreed(recorded, { now: Date.parse(recorded.fetchedAt) });
  assert.ok(data);
  assert.ok(data.history.length > 200);
  assert.equal(data.history.at(-1).timestamp, Date.parse(data.current.timestamp));
  assert.equal(data.history.at(-1).value, data.current.score);
});

test('CNN contract preserves raw series units, official ratings and missing comparisons', () => {
  const data = normalizeFearGreed(payload(), { now: instant });
  assert.equal(data.comparisons.monthAgo, null);
  assert.equal(data.indicators[0].series[0].points[1].value, 7300);
  assert.equal(data.indicators[0].score, 24.4);
  const missing = payload();
  missing.history[0].rating = null;
  assert.equal(normalizeFearGreed(missing, { now: instant }).history[0].rating, null);
});

test('CNN contract rejects null current score, wrong units, future or reversed history', () => {
  for (const mutate of [
    data => { data.current.score = null; }, data => { data.current.score = 101; },
    data => { data.indicators[0].series[0].points[0].value = null; },
    data => { data.history.reverse(); }, data => { data.history[1].timestamp = instant + 1000; },
    data => { data.indicators[0].series[0].id = 'VIX'; },
    data => { data.current.timestamp = 'bad-date'; },
  ]) {
    const data = payload(); mutate(data);
    assert.equal(normalizeFearGreed(data, { now: instant }), null);
  }
});

test('CNN loader authenticates cache reads and reuses only the same user snapshot', async () => {
  clearFearGreedCache();
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls += 1;
    assert.equal(url, '/api/quote?view=fear-greed');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, 'Bearer test-session');
    return response(payload());
  };
  await loadFearGreed({ ...options('a'), fetchImpl });
  await loadFearGreed({ ...options('a'), fetchImpl });
  assert.equal(calls, 1);
  await assert.rejects(loadFearGreed({ ...options('a'), getSession: session('b'), fetchImpl }), { code: 'AUTH_REQUIRED' });
  await loadFearGreed({ ...options('b'), fetchImpl });
  assert.equal(calls, 2);
});

test('CNN loader rejects account changes and aborted late responses', async () => {
  clearFearGreedCache();
  let count = 0;
  await assert.rejects(loadFearGreed({ ...options('a'),
    getSession: () => session(++count === 1 ? 'a' : 'b')(), fetchImpl: async () => response(payload()),
  }), { code: 'AUTH_REQUIRED' });
  const controller = new AbortController();
  await assert.rejects(loadFearGreed({ ...options('a'), signal: controller.signal,
    fetchImpl: async () => { controller.abort(); return response(payload()); },
  }), { code: 'REQUEST_ABORTED' });
});

test('CNN same-reading responses retain full history and reject older capture metadata', async () => {
  clearFearGreedCache();
  await loadFearGreed({ ...options('a'), fetchImpl: async () => response(payload()) });
  const shortened = payload(); shortened.history = shortened.history.slice(-1);
  shortened.indicators[0].series[0].points = [];
  shortened.fetchedAt = new Date(instant + 1000).toISOString();
  const combined = await loadFearGreed({ ...options('a'), force: true, fetchImpl: async () => response(shortened) });
  assert.equal(combined.history.length, 2);
  assert.equal(combined.indicators[0].series[0].points.length, 2);
  const older = await loadFearGreed({ ...options('a'), force: true, fetchImpl: async () => response(payload()) });
  assert.equal(older.fetchedAt, shortened.fetchedAt);
  assert.equal(older.stale, true);
});

test('CNN loader retains newer valid data on network failure or older response; auth failure clears it', async () => {
  clearFearGreedCache();
  await loadFearGreed({ ...options('a'), fetchImpl: async () => response(payload()) });
  const stale = await loadFearGreed({ ...options('a'), force: true, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(stale.stale, true);
  assert.equal(stale.current.score, 33.25);
  const old = payload(); old.asOf = old.current.timestamp = '2026-09-09T23:59:55.000Z';
  old.history = []; old.indicators.forEach(item => { item.timestamp = old.asOf; item.series.forEach(line => { line.points = []; }); });
  const retained = await loadFearGreed({ ...options('a'), force: true, fetchImpl: async () => response(old) });
  assert.equal(retained.asOf, asOf);
  const conflict = payload(); conflict.current.score = 35;
  const accepted = await loadFearGreed({ ...options('a'), force: true, fetchImpl: async () => response(conflict) });
  assert.equal(accepted.current.score, 33.25);
  assert.equal(accepted.stale, true);
  await assert.rejects(loadFearGreed({ ...options('a'), force: true, fetchImpl: async () => ({ status: 401, ok: false }) }), { code: 'AUTH_REQUIRED' });
  await assert.rejects(loadFearGreed({ ...options('a'), fetchImpl: async () => { throw new Error('offline'); } }), { code: 'NETWORK_ERROR' });
});
