import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockComparison, comparisonRangeStart } from '../src/lib/stockComparisonModel.js';
import { STOCK_COMPARISON_DEMO } from '../src/dev/stockComparisonFixture.js';
import { INVESTMENT_SYMBOL_PRESETS } from '../src/lib/investmentSymbolPresets.js';

const observations = (values) => ({ rows: values.map(([date, close]) => ({ date, close })) });
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-9, `${value} != ${expected}`);

test('comparison uses common observed dates for weekend ranges and identical baselines', () => {
  const result = buildStockComparison({
    series: {
      QQQ: observations([['2026-10-02', 80], ['2026-10-05', 100], ['2026-10-06', 110], ['2026-10-09', 120]]),
      TQQQ: observations([['2026-10-05', 20], ['2026-10-06', 19], ['2026-10-09', 24], ['2026-10-12', 30]]),
    },
    symbols: ['QQQ', 'TQQQ'], startDate: '2026-10-03', endDate: '2026-10-11',
  });
  assert.equal(result.startDate, '2026-10-05');
  assert.equal(result.endDate, '2026-10-09');
  assert.equal(result.rangeAdjusted, true);
  assert.deepEqual(result.rows[0].returns, { QQQ: 0, TQQQ: 0 });
  near(result.stats.QQQ.returnPct, 20);
  near(result.stats.TQQQ.returnPct, 20);
  near(result.stats.TQQQ.maxDrawdownPct, -5);
});

test('a later listing moves every stock to the same actual starting date', () => {
  const result = buildStockComparison({
    series: {
      QQQ: observations([['2026-01-02', 100], ['2026-01-05', 120], ['2026-01-06', 132]]),
      NEW: observations([['2026-01-05', 10], ['2026-01-06', 8]]),
    }, symbols: ['QQQ', 'NEW'], startDate: '2026-01-01', endDate: '2026-01-06',
  });
  assert.equal(result.startDate, '2026-01-05');
  assert.equal(result.stats.QQQ.startPrice, 120);
  near(result.stats.QQQ.returnPct, 10);
  near(result.stats.NEW.returnPct, -20);
});

test('interior holes remain unknown and cannot become zero price or zero return', () => {
  const result = buildStockComparison({
    series: {
      QQQ: observations([['2026-10-05', 100], ['2026-10-06', 120], ['2026-10-07', 90]]),
      TQQQ: observations([['2026-10-05', 20], ['2026-10-07', 22]]),
    }, symbols: ['QQQ', 'TQQQ'], startDate: '2026-10-05', endDate: '2026-10-07',
  });
  assert.deepEqual(result.rows[1].prices, { QQQ: 120, TQQQ: null });
  assert.equal(result.rows[1].returns.TQQQ, null);
  near(result.stats.QQQ.maxDrawdownPct, -25);
  assert.deepEqual(result.stats.QQQ.high, { date: '2026-10-06', price: 120 });
  assert.deepEqual(result.stats.QQQ.low, { date: '2026-10-07', price: 90 });
});

test('four series share dates without multiplying TQQQ returns by leverage', () => {
  const series = Object.fromEntries(['QQQ', 'TQQQ', 'NVDA', 'SMH'].map((symbol, index) => [symbol,
    observations([['2026-10-05', (index + 1) * 10], ['2026-10-06', (index + 1) * 11]]),
  ]));
  const result = buildStockComparison({ series, symbols: Object.keys(series), startDate: '2026-10-05', endDate: '2026-10-06' });
  assert.equal(result.rangeAdjusted, false);
  for (const stats of Object.values(result.stats)) near(stats.returnPct, 10);
  assert.equal(result.stats.TQQQ.endPrice, 22);
});

test('invalid price observations and dates cannot establish a common baseline', () => {
  const result = buildStockComparison({
    series: {
      QQQ: observations([['2026-02-30', 100], ['2026-10-05', 0], ['2026-10-06', NaN], ['2026-10-07', Infinity], ['2026-10-08', -2], ['2026-10-09', 100]]),
      TQQQ: observations([['2026-02-30', 20], ['2026-10-05', 20], ['2026-10-06', 20], ['2026-10-07', 20], ['2026-10-08', 20], ['2026-10-09', 20]]),
    }, symbols: ['QQQ', 'TQQQ'], startDate: '2026-01-01', endDate: '2026-10-09',
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.startDate, '2026-10-09');
  assert.deepEqual(result.rows[0].returns, { QQQ: 0, TQQQ: 0 });
});

test('disjoint dates return no comparison instead of comparing different dates', () => {
  const result = buildStockComparison({
    series: { QQQ: observations([['2026-10-05', 100]]), TQQQ: observations([['2026-10-06', 20]]) },
    symbols: ['QQQ', 'TQQQ'], startDate: '2026-10-05', endDate: '2026-10-06',
  });
  assert.equal(result.error, 'no_common_dates');
  assert.deepEqual(result.rows, []);
  assert.equal(result.startDate, null);
});

test('invalid ranges, duplicate symbols and more than four stocks are rejected', () => {
  assert.equal(buildStockComparison({ startDate: '2026-02-30', endDate: '2026-10-06' }).error, 'invalid_range');
  assert.equal(buildStockComparison({ startDate: '2026-10-06', endDate: '2026-10-05' }).error, 'invalid_range');
  const range = { startDate: '2026-10-05', endDate: '2026-10-06' };
  assert.equal(buildStockComparison({ ...range, symbols: ['QQQ', 'QQQ'] }).error, 'invalid_symbols');
  assert.equal(buildStockComparison({ ...range, symbols: ['A', 'B', 'C', 'D', 'E'] }).error, 'invalid_symbols');
});

test('calendar shortcuts clamp month-end and do not change with timezone', () => {
  assert.equal(comparisonRangeStart('1m', '2026-03-31'), '2026-02-28');
  assert.equal(comparisonRangeStart('1y', '2024-02-29'), '2023-02-28');
  assert.equal(comparisonRangeStart('3m', '2026-10-26'), '2026-07-26');
  assert.equal(comparisonRangeStart('6m', '2026-10-26'), '2026-04-26');
  assert.equal(comparisonRangeStart('ytd', '2026-10-26'), '2026-01-01');
  assert.equal(comparisonRangeStart('custom', '2026-10-26'), null);
});

test('local fixture is explicitly synthetic, covers shared presets, and remains deterministic', () => {
  assert.equal(STOCK_COMPARISON_DEMO.synthetic, true);
  assert.match(STOCK_COMPARISON_DEMO.sourceLabel, /非真实行情/);
  assert.deepEqual(Object.keys(STOCK_COMPARISON_DEMO.series), INVESTMENT_SYMBOL_PRESETS.map(({ symbol }) => symbol));
  const { series, startDate, asOfDate } = STOCK_COMPARISON_DEMO;
  for (const item of Object.values(series)) {
    assert.equal(item.rows[0].date, startDate);
    assert.equal(item.rows.at(-1).date, asOfDate);
    assert.ok(item.rows.every(({ close }) => Number.isFinite(close) && close > 0));
  }
  const input = { series, symbols: ['QQQ', 'TQQQ', 'NVDA', 'SMH'], startDate: '2025-10-26', endDate: asOfDate };
  const before = JSON.stringify(series.QQQ.rows);
  assert.deepEqual(buildStockComparison(input), buildStockComparison(input));
  assert.equal(JSON.stringify(series.QQQ.rows), before);
});

const rsiObservations = values => ({ rsiPeriod: 6, rsiPriceBasis: 'adjusted_close', rows: values.map(([date, close, rsi6]) => ({ date, close, rsi6 })) });

test('RSI remains attached to the exact historical price date, including zero and gaps', () => {
  const result = buildStockComparison({
    series: {
      QQQ: rsiObservations([['2026-10-05', 100, 0], ['2026-10-06', 120, 28.5], ['2026-10-07', 90, 15.5]]),
      TQQQ: rsiObservations([['2026-10-05', 20, 10], ['2026-10-07', 22, 100]]),
    }, symbols: ['QQQ', 'TQQQ'], startDate: '2026-10-05', endDate: '2026-10-07',
  });
  assert.deepEqual(result.rows.map(row => row.rsi6), [
    { QQQ: 0, TQQQ: 10 }, { QQQ: 28.5, TQQQ: null }, { QQQ: 15.5, TQQQ: 100 },
  ]);
  assert.equal(result.rows[1].prices.TQQQ, null);
  near(result.stats.QQQ.returnPct, -10);
});

test('missing historical RSI never borrows a later or current value or recalculates a shortened window', () => {
  const input = {
    series: {
      QQQ: { ...rsiObservations([['2026-10-05', 100, 12], ['2026-10-06', 120], ['2026-10-07', 90, 80]]), latestRsi: 95 },
      TQQQ: rsiObservations([['2026-10-05', 20, 20], ['2026-10-06', 21, null], ['2026-10-07', 22, 90]]),
    }, symbols: ['QQQ', 'TQQQ'], startDate: '2026-10-05', endDate: '2026-10-07',
  };
  const full = buildStockComparison(input);
  const shortened = buildStockComparison({ ...input, startDate: '2026-10-06' });
  assert.deepEqual(full.rows[1].rsi6, { QQQ: null, TQQQ: null });
  assert.deepEqual(shortened.rows[0].rsi6, full.rows[1].rsi6);
  assert.deepEqual(shortened.rows[1].rsi6, full.rows[2].rsi6);
  assert.equal(shortened.rows[0].returns.QQQ, 0);
});

test('unverified or corrupted RSI is hidden and a missing price cannot expose RSI', () => {
  const values = [undefined, '20', null, NaN, Infinity, -1, 101, false];
  for (const rsi6 of values) {
    const result = buildStockComparison({
      series: { QQQ: rsiObservations([['2026-10-05', 100, rsi6]]), TQQQ: rsiObservations([['2026-10-05', 20, 10]]) },
      symbols: ['QQQ', 'TQQQ'], startDate: '2026-10-05', endDate: '2026-10-05',
    });
    assert.equal(result.rows[0].rsi6.QQQ, null);
  }
  for (const metadata of [{}, { rsiPeriod: 6 }, { rsiPeriod: 14, rsiPriceBasis: 'adjusted_close' }, { rsiPeriod: 6, rsiPriceBasis: 'split_adjusted_close' }]) {
    const result = buildStockComparison({
      series: { QQQ: { ...metadata, rows: [{ date: '2026-10-05', close: 100, rsi6: 20 }] }, TQQQ: rsiObservations([['2026-10-05', 20, 10]]) },
      symbols: ['QQQ', 'TQQQ'], startDate: '2026-10-05', endDate: '2026-10-05',
    });
    assert.equal(result.rows[0].rsi6.QQQ, null);
  }
  const result = buildStockComparison({
    series: {
      QQQ: rsiObservations([['2026-10-05', 100, 20], ['2026-10-06', null, 15], ['2026-10-07', 110, 35]]),
      TQQQ: rsiObservations([['2026-10-05', 20, 10], ['2026-10-06', 21, 25], ['2026-10-07', 22, 35]]),
    }, symbols: ['QQQ', 'TQQQ'], startDate: '2026-10-05', endDate: '2026-10-07',
  });
  assert.deepEqual(result.rows[1].rsi6, { QQQ: null, TQQQ: 25 });
});
