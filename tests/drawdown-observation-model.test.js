import test from 'node:test';
import assert from 'node:assert/strict';
import { buildObservationUniverse, deriveObservation, getSamePeriodReturn } from '../src/lib/drawdownObservationModel.js';

test('observation universe contains benchmarks and only the current user watchlist and positive positions', () => {
  const input = {
    watchlist: [' qqq ', { symbol: 'nvda.us', name: '英伟达' }, 'NVDA', { symbol: 'VIX' }, 'AAPL.LSE', null, '../TSLA'],
    positions: [
      { symbol: 'NVDA', name: 'NVIDIA', quantity: 10 }, { symbol: 'MSFT', name: '微软', quantity: 0.5 },
      { symbol: 'ZERO', quantity: 0 }, { symbol: 'SHORT', quantity: -1 },
      { symbol: 'INVALID', quantity: NaN }, { symbol: 'STRING', quantity: '10' },
      { symbol: 'BAD', quantity: Infinity }, { symbol: 'MISSING' },
    ],
  };
  const before = structuredClone(input);
  const rows = buildObservationUniverse(input);
  assert.deepEqual(rows.map((row) => row.symbol), ['SPY', 'QQQ', 'NVDA', 'MSFT']);
  assert.equal(rows[0].isBenchmark, true);
  assert.equal(rows[0].inWatchlist, false);
  assert.equal(rows[1].isBenchmark, true);
  assert.equal(rows[1].inWatchlist, true);
  assert.equal(rows[2].name, '英伟达');
  assert.equal(rows[2].inWatchlist, true);
  assert.equal(rows[2].inHoldings, true);
  assert.equal(rows[3].inWatchlist, false);
  assert.equal(rows[3].inHoldings, true);
  assert.deepEqual(input, before);
  assert.deepEqual(buildObservationUniverse().map((row) => row.symbol), ['SPY', 'QQQ']);
  assert.ok(buildObservationUniverse({ watchlist: null, positions: null }).every((row) => !row.inHoldings));
});

test('stale observation windows and elapsed days end at actual close date, never an expected future close', () => {
  const row = deriveObservation({
    symbol: 'TEST', status: 'ready', asOfDate: '2026-09-04', expectedAsOfDate: '2026-09-08',
    stale: true, staleReason: 'incomplete_close',
    points: [{ date: '2025-09-05', close: 200 }, { date: '2026-09-03', close: 100 }, { date: '2026-09-04', close: 90 }],
  }, '2026-09-08');
  assert.equal(row.asOfDate, '2026-09-04');
  assert.equal(row.expectedAsOfDate, '2026-09-08');
  assert.equal(row.high, 200);
  assert.equal(row.highDate, '2025-09-05');
  assert.equal(row.elapsedDays, 364);
  assert.equal(row.drawdownPct, -55.00000000000001);
  assert.equal(row.stale, true);
  assert.equal(row.staleReason, 'incomplete_close');
  assert.equal(row.historySufficient, true);
});

test('unavailable or loading rows cannot expose stale carried-over prices as current results', () => {
  for (const status of ['loading', 'error']) {
    const raw = { symbol: 'TEST', status, error: { code: 'PROVIDER_UNAVAILABLE' }, asOfDate: '2026-09-04',
      points: [{ date: '2026-09-03', close: 100 }, { date: '2026-09-04', close: 90 }] };
    const row = deriveObservation(raw);
    assert.equal(row.price, null);
    assert.equal(row.drawdownPct, null);
    assert.equal(row.todayPct, null);
    assert.equal(row.historySufficient, false);
    assert.deepEqual(row.pointsSinceHigh, []);
    assert.equal(row.status, status);
    assert.deepEqual(row.error, raw.error);
    assert.equal(getSamePeriodReturn(raw, '2026-09-03', '2026-09-04'), null);
  }
});

test('no data-source fallback or investor cost is used in close-based drawdown arithmetic', () => {
  const row = deriveObservation({
    symbol: 'TEST', asOfDate: '2026-09-04', source: 'EODHD_EOD', priceBasis: 'adjusted_close',
    averageCost: 600, price: 999, week52High: 2000,
    points: [{ date: '2025-09-01', close: 95 }, { date: '2026-06-01', close: 120 },
      { date: '2026-06-02', close: 60 }, { date: '2026-09-03', close: 75 }, { date: '2026-09-04', close: 90 }],
  });
  assert.equal(row.high, 120);
  assert.equal(row.price, 90);
  assert.equal(row.drawdownPct, -25);
  assert.ok(Math.abs(row.todayPct - 20) < 1e-10);
  assert.equal(row.reboundPct, 50);
  assert.ok(Math.abs(row.recoveryPct - 100 / 3) < 1e-10);
  assert.equal(row.pointsSinceHigh.at(-1).drawdownPct, row.drawdownPct);
});
