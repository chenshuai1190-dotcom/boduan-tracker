import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAWDOWN_PREVIEW,
  deriveObservation,
  getSamePeriodReturn,
  selectObservationRows,
} from '../src/dev/drawdownObservationData.js';

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(typeof actual === 'number' && Math.abs(actual - expected) < tolerance, `${actual} should be close to ${expected}`);
}

function instrument(entries, extra = {}) {
  return { symbol: 'TEST', name: '测试', kind: 'stock', inWatchlist: true, inHoldings: false, ...extra,
    points: entries.map(([date, close]) => ({ date, close })) };
}

test('preview is explicitly synthetic and covers the requested instruments and scopes', () => {
  assert.equal(DRAWDOWN_PREVIEW.source, 'SYNTHETIC');
  assert.equal(DRAWDOWN_PREVIEW.asOfDate, '2026-09-08');
  assert.equal(DRAWDOWN_PREVIEW.vix, 24.8);
  const raw = DRAWDOWN_PREVIEW.instruments;
  assert.deepEqual(raw.map((item) => item.symbol), ['SPY', 'QQQ', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'AVGO']);
  assert.deepEqual(raw.filter((item) => item.inHoldings).map((item) => item.symbol).sort(), ['AVGO', 'META', 'MSFT', 'NVDA']);
  for (const item of raw) {
    assert.equal(item.inWatchlist, item.kind === 'stock');
    assert.ok(item.points.length > 260);
    assert.equal(item.points.at(-1).date, DRAWDOWN_PREVIEW.asOfDate);
    assert.ok(item.points.every((point, index) => point.close > 0 && (!index || point.date > item.points[index - 1].date)));
    assert.equal(deriveObservation(item, DRAWDOWN_PREVIEW.asOfDate).historySufficient, true);
  }
});

test('fixture card depths equal their chart endpoints and preserve both rebound and new-low examples', () => {
  const depths = { SPY: -9.2, QQQ: -14.6, TSLA: -37, NVDA: -25, AVGO: -23, AMZN: -18, GOOGL: -13.8, META: -12.8, MSFT: -8.2, AAPL: -5 };
  const rows = DRAWDOWN_PREVIEW.instruments.map((item) => deriveObservation(item, DRAWDOWN_PREVIEW.asOfDate));
  for (const row of rows) {
    near(row.drawdownPct, depths[row.symbol]);
    assert.equal(row.pointsSinceHigh[0].date, row.highDate);
    assert.equal(row.pointsSinceHigh[0].drawdownPct, 0);
    assert.equal(row.pointsSinceHigh.at(-1).close, row.price);
    assert.equal(row.pointsSinceHigh.at(-1).drawdownPct, row.drawdownPct);
    for (const point of row.pointsSinceHigh) near(point.drawdownPct, (point.close / row.high - 1) * 100);
  }
  const nvda = rows.find((row) => row.symbol === 'NVDA');
  assert.ok(nvda.todayPct > 0 && nvda.drawdownPct < -20 && nvda.reboundPct > 0);
  const tsla = rows.find((row) => row.symbol === 'TSLA');
  assert.ok(tsla.todayPct < 0);
  assert.equal(tsla.troughDate, DRAWDOWN_PREVIEW.asOfDate);
  assert.equal(tsla.reboundPct, 0);
});

test('derives close-to-close change, post-peak trough, required recovery, and calendar duration', () => {
  const raw = instrument([
    ['2025-01-01', 30], // The global minimum predates this high and must not be the trough.
    ['2026-06-01', 120], ['2026-06-08', 60], ['2026-09-04', 75], ['2026-09-08', 90],
  ]);
  const row = deriveObservation(raw, '2026-09-08');
  assert.equal(row.price, 90);
  assert.equal(row.previousClose, 75);
  near(row.todayPct, 20);
  assert.equal(row.high, 120);
  assert.equal(row.highDate, '2026-06-01');
  near(row.drawdownPct, -25);
  assert.equal(row.trough, 60);
  assert.equal(row.troughDate, '2026-06-08');
  near(row.reboundPct, 50);
  near(row.recoveryPct, 100 / 3);
  assert.equal(row.elapsedDays, 99);
});

test('52 weeks is an inclusive 364-calendar-day window, not all-time or 380-day history', () => {
  const asOfDate = '2026-09-08';
  const cutoff = new Date(Date.parse(`${asOfDate}T00:00:00Z`) - 364 * 86400000).toISOString().slice(0, 10);
  const beforeCutoff = new Date(Date.parse(`${cutoff}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const raw = instrument([[beforeCutoff, 999], [cutoff, 200], ['2026-09-04', 110], [asOfDate, 100]]);
  const row = deriveObservation(raw, asOfDate);
  assert.equal(row.high, 200);
  assert.equal(row.highDate, cutoff);
  assert.equal(row.elapsedDays, 364);
  near(row.drawdownPct, -50);
  assert.equal(row.historySufficient, true);
  const short = deriveObservation(instrument([[asOfDate, 100]]), asOfDate);
  assert.equal(short.historySufficient, false);
  assert.equal(short.previousClose, null);
  assert.equal(short.todayPct, null);
});

test('equal highs choose the most recent date and reset the subsequent trough', () => {
  const raw = instrument([
    ['2026-06-01', 100], ['2026-06-02', 50], ['2026-07-01', 100], ['2026-07-02', 90],
  ]);
  const row = deriveObservation(raw, '2026-07-02');
  assert.equal(row.highDate, '2026-07-01');
  assert.equal(row.trough, 90);
  assert.equal(row.troughDate, '2026-07-02');
  assert.deepEqual(row.pointsSinceHigh.map((point) => point.date), ['2026-07-01', '2026-07-02']);
  const atHigh = deriveObservation(raw, '2026-07-01');
  assert.equal(atHigh.drawdownPct, 0);
  assert.equal(atHigh.recoveryPct, 0);
  assert.equal(atHigh.trough, null);
  assert.equal(atHigh.troughDate, null);
  assert.equal(atHigh.reboundPct, null);
  assert.equal(atHigh.elapsedDays, 0);
});

test('the observation boundary excludes future highs and does not backfill the chart with them', () => {
  const raw = instrument([
    ['2026-06-01', 100], ['2026-06-02', 80], ['2026-06-03', 90], ['2026-06-04', 150],
  ]);
  const row = deriveObservation(raw, '2026-06-03');
  assert.equal(row.high, 100);
  near(row.drawdownPct, -10);
  assert.deepEqual(row.pointsSinceHigh.map((point) => point.close), [100, 80, 90]);
  near(row.pointsSinceHigh[1].drawdownPct, -20);
  assert.equal(deriveObservation(raw, '2026-06-04').highDate, '2026-06-04');
});

test('invalid or missing observations fail closed without manufacturing zero prices or returns', () => {
  const emptyInputs = [null, {}, { points: null }, { points: [] }, instrument([['2026-09-09', 100]])];
  for (const raw of emptyInputs) {
    const row = deriveObservation(raw, '2026-09-08');
    for (const field of ['price', 'previousClose', 'todayPct', 'high', 'drawdownPct', 'trough', 'reboundPct', 'recoveryPct', 'elapsedDays']) assert.equal(row[field], null);
    assert.equal(row.historySufficient, false);
    assert.deepEqual(row.pointsSinceHigh, []);
  }
  for (const close of [0, -1, null, undefined, '', '100', false, NaN, Infinity, -Infinity]) {
    const row = deriveObservation(instrument([['2026-09-04', 100], ['2026-09-08', close]]), '2026-09-08');
    assert.equal(row.price, null);
    assert.equal(row.drawdownPct, null);
    assert.equal(row.todayPct, null);
  }
  for (const date of ['2026-02-30', '2026-9-08', '2026-09-08T00:00:00Z', '', null, undefined]) {
    assert.equal(deriveObservation(instrument([['2026-09-08', 100]]), date).price, null);
    assert.equal(deriveObservation(instrument([[date, 100]]), '2026-09-08').price, null);
  }
  assert.equal(deriveObservation(instrument([['2026-09-08', 100], ['2026-09-08', 80]]), '2026-09-08').price, null);
});

test('unchanged valid closes produce zero change while a short valid history stays explicitly insufficient', () => {
  const row = deriveObservation(instrument([['2026-09-04', 80], ['2026-09-08', 80]]), '2026-09-08');
  assert.equal(row.price, 80);
  assert.equal(row.todayPct, 0);
  assert.equal(row.drawdownPct, 0);
  assert.equal(row.historySufficient, false);
});

test('scope, depth, and stable sorting keep missing observations last without claiming they meet a depth filter', () => {
  const rows = [
    { symbol: 'A', inWatchlist: true, inHoldings: false, drawdownPct: -5 },
    { symbol: 'MISSING', inWatchlist: true, inHoldings: true, drawdownPct: null },
    { symbol: 'B', inWatchlist: true, inHoldings: true, drawdownPct: -20 },
    { symbol: 'C', inWatchlist: true, inHoldings: true, drawdownPct: -10 },
    { symbol: 'D', inWatchlist: true, inHoldings: true, drawdownPct: -20 },
    { symbol: 'ETF', inWatchlist: false, inHoldings: false, drawdownPct: -30 },
    { symbol: 'INVALID', inWatchlist: true, inHoldings: true, drawdownPct: NaN },
  ];
  const symbols = (options) => selectObservationRows(rows, options).map((row) => row.symbol);
  assert.deepEqual(symbols({ scope: 'watchlist', order: 'deepest' }), ['B', 'D', 'C', 'A', 'MISSING', 'INVALID']);
  assert.deepEqual(symbols({ scope: 'holdings', order: 'shallowest' }), ['C', 'B', 'D', 'MISSING', 'INVALID']);
  assert.deepEqual(symbols({ scope: 'watchlist', minDepth: 10 }), ['B', 'D', 'C']);
  assert.deepEqual(symbols({ scope: 'holdings', minDepth: 20 }), ['B', 'D']);
  assert.deepEqual(selectObservationRows(null), []);
});

test('same-period returns require exact, unique valid endpoints with no nearest-date substitution', () => {
  const raw = instrument([['2026-06-01', 100], ['2026-06-03', 80], ['2026-09-08', 90]]);
  near(getSamePeriodReturn(raw, '2026-06-01', '2026-09-08'), -10);
  near(getSamePeriodReturn(raw, '2026-06-03', '2026-09-08'), 12.5);
  assert.equal(getSamePeriodReturn(raw, '2026-06-03', '2026-06-03'), 0);
  for (const [start, end] of [
    ['2026-06-02', '2026-09-08'], ['2026-06-01', '2026-09-07'],
    ['2026-09-08', '2026-06-01'], ['2026-02-30', '2026-09-08'], [null, '2026-09-08'],
  ]) assert.equal(getSamePeriodReturn(raw, start, end), null);
  for (const close of [0, null, '100', false, Infinity]) {
    assert.equal(getSamePeriodReturn(instrument([['2026-06-01', close], ['2026-09-08', 90]]), '2026-06-01', '2026-09-08'), null);
  }
  assert.equal(getSamePeriodReturn(instrument([['2026-06-01', 100], ['2026-06-01', 110], ['2026-09-08', 90]]), '2026-06-01', '2026-09-08'), null);
  assert.equal(getSamePeriodReturn(null, '2026-06-01', '2026-09-08'), null);
});

test('derivation and selection do not mutate caller-owned points or row order', () => {
  const raw = instrument([['2026-09-08', 90], ['2026-06-01', 100], ['2026-06-02', 80]]);
  const snapshot = structuredClone(raw);
  raw.points.forEach(Object.freeze);
  Object.freeze(raw.points);
  Object.freeze(raw);
  const derived = deriveObservation(raw, '2026-09-08');
  assert.deepEqual(raw, snapshot);
  assert.equal(derived.points, raw.points);
  derived.pointsSinceHigh[0].close = 999;
  assert.deepEqual(raw, snapshot);
  const rows = Object.freeze([
    Object.freeze({ symbol: 'A', inWatchlist: true, drawdownPct: -5 }),
    Object.freeze({ symbol: 'B', inWatchlist: true, drawdownPct: -20 }),
  ]);
  assert.deepEqual(selectObservationRows(rows).map((row) => row.symbol), ['B', 'A']);
  assert.deepEqual(rows.map((row) => row.symbol), ['A', 'B']);
});
