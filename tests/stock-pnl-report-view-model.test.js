import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStockPnlReportViewModel } from '../src/lib/stockPnlReportViewModel.js';

const NOW = new Date('2026-09-28T22:00:00Z');

function snapshot(date, cumulativePnlUsd, marketValueUsd, extras = {}) {
  return {
    snapshotDate: date,
    symbol: 'META',
    cumulativePnlUsd,
    marketValueUsd,
    realizedPnlUsd: extras.realizedPnlUsd ?? 0,
    unrealizedPnlUsd: extras.unrealizedPnlUsd ?? cumulativePnlUsd,
    currentPriceUsd: extras.currentPriceUsd ?? 100,
    dailyPnlUsd: extras.dailyPnlUsd ?? null,
    dailyPnlPct: extras.dailyPnlPct ?? null,
  };
}

function trade(date, side, shares, price) {
  return { tradeDate: date, symbol: 'META', side, shares, price };
}

test('daily amounts use cumulative personal P&L changes rather than stock-price daily fields', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [trade('2026-09-21', 'buy', 10, 100)],
    symbolSnapshots: [
      snapshot('2026-09-21', 100, 1100, { currentPriceUsd: 110, dailyPnlUsd: 999, dailyPnlPct: 0.9 }),
      snapshot('2026-09-22', 150, 1150, { currentPriceUsd: 115, dailyPnlUsd: 999, dailyPnlPct: 0.9 }),
    ],
    benchmarkRows: [
      { date: '2026-09-21', adjustedClose: 500 },
      { date: '2026-09-22', adjustedClose: 510 },
    ],
    stockPriceRows: [
      { date: '2026-09-21', adjustedClose: 110 },
      { date: '2026-09-22', adjustedClose: 115 },
    ],
    range: 'all',
    now: NOW,
  });

  assert.equal(report.hasData, true);
  assert.equal(report.totalPnlUsd, 150);
  assert.equal(report.totalPnlPct, 0.15);
  assert.deepEqual(report.trend.map((point) => point.dailyPnlUsd), [100, 50]);
  assert.deepEqual(report.trend.map((point) => point.dailyPnlPct), [0.1, 50 / 1100]);
  assert.equal(report.calendar[1].valueUsd, 50);
  assert.equal(report.calendar[1].rate, 50 / 1100);
  assert.equal(report.benchmarkPct, null);
  assert.equal(report.outperformPct, null);
  assert.equal(report.trend[1].benchmarkPct, null);
  assert.ok(Math.abs(report.priceBenchmarkReturnPct - 0.02) < 1e-12);
  assert.equal(report.trend[1].pricePct, 115 / 110 - 1);
  assert.ok(Math.abs(report.trend[1].priceBenchmarkPct - 0.02) < 1e-12);
});

test('buy, partial sell, full sell, and flat day retain realized P&L and do not invent a no-capital rate', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'meta',
    stockTrades: [
      trade('2026-09-21', 'buy', 10, 100),
      trade('2026-09-22', 'buy', 10, 120),
      trade('2026-09-23', 'sell', 10, 140),
      trade('2026-09-24', 'sell', 10, 160),
    ],
    symbolSnapshots: [
      snapshot('2026-09-21', 100, 1100, { currentPriceUsd: 110 }),
      snapshot('2026-09-22', 400, 2600, { currentPriceUsd: 130 }),
      snapshot('2026-09-23', 700, 1500, { currentPriceUsd: 150, realizedPnlUsd: 300, unrealizedPnlUsd: 400 }),
      snapshot('2026-09-24', 800, 0, { currentPriceUsd: 160, realizedPnlUsd: 800, unrealizedPnlUsd: 0 }),
      snapshot('2026-09-25', 800, 0, { currentPriceUsd: 160, realizedPnlUsd: 800, unrealizedPnlUsd: 0 }),
    ],
    range: 'all',
    now: NOW,
  });

  assert.equal(report.totalPnlUsd, 800);
  assert.equal(report.periodBasisUsd, 2200);
  assert.equal(report.totalPnlPct, 800 / 2200);
  assert.equal(report.realizedPnlUsd, 800);
  assert.equal(report.unrealizedPnlUsd, 0);
  assert.deepEqual(report.trend.map((point) => point.dailyPnlUsd), [100, 300, 300, 100, 0]);
  assert.equal(report.trend[1].dailyPnlPct, 300 / 2300);
  assert.equal(report.trend[3].dailyPnlPct, 100 / 1500);
  assert.equal(report.trend[4].dailyPnlPct, null);
  assert.equal(report.yearCalendar[8].valueUsd, 800);
  assert.equal(report.yearCalendar[8].rate, 800 / 2200);
});

test('monthly amount and rate use the pre-month close and period buy cash, never the sum of daily rates', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [trade('2026-08-28', 'buy', 10, 100)],
    symbolSnapshots: [
      snapshot('2026-08-28', 40, 1040, { currentPriceUsd: 104 }),
      snapshot('2026-08-31', 100, 1100, { currentPriceUsd: 110 }),
      snapshot('2026-09-01', 130, 1130, { currentPriceUsd: 113 }),
      snapshot('2026-09-02', 160, 1160, { currentPriceUsd: 116 }),
    ],
    range: 'month',
    calendarDate: '2026-09-02',
    now: NOW,
  });

  assert.equal(report.startDate, '2026/09/01');
  assert.equal(report.totalPnlUsd, 60);
  assert.equal(report.totalPnlPct, 60 / 1100);
  assert.equal(report.yearCalendar[8].valueUsd, 60);
  assert.equal(report.yearCalendar[8].rate, 60 / 1100);
  assert.equal(report.calendar[0].rate, 30 / 1100);
  assert.equal(report.calendar[1].rate, 30 / 1130);
  assert.notEqual(report.yearCalendar[8].rate, report.calendar[0].rate + report.calendar[1].rate);
});

test('a missing intervening trading-day snapshot leaves the next daily result unavailable', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [trade('2026-09-21', 'buy', 10, 100)],
    symbolSnapshots: [
      snapshot('2026-09-21', 100, 1100),
      snapshot('2026-09-23', 300, 1300),
    ],
    range: 'all',
    now: NOW,
  });

  assert.equal(report.totalPnlUsd, 300);
  assert.equal(report.trend[1].dailyPnlUsd, null);
  assert.equal(report.trend[1].dailyPnlPct, null);
  assert.equal(report.calendar[1].valueUsd, null);
});

test('missing pre-period baseline fails closed while independent later daily values remain available', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [trade('2026-08-28', 'buy', 10, 100)],
    symbolSnapshots: [
      snapshot('2026-09-21', 100, 1100),
      snapshot('2026-09-22', 130, 1130),
    ],
    range: 'month',
    now: NOW,
  });

  assert.equal(report.hasData, false);
  assert.equal(report.totalPnlUsd, null);
  assert.equal(report.totalPnlPct, null);
  assert.equal(report.yearCalendar[8].valueUsd, null);
  assert.equal(report.trend[1].dailyPnlUsd, 30);
});

test('a partial or future close does not enter the report before the New York close', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [trade('2026-09-24', 'buy', 10, 100)],
    symbolSnapshots: [
      snapshot('2026-09-24', 50, 1050),
      snapshot('2026-09-25', 100, 1100),
    ],
    range: 'all',
    now: new Date('2026-09-25T18:00:00Z'),
  });

  assert.equal(report.snapshotDate, '2026-09-24');
  assert.equal(report.totalPnlUsd, 50);
  assert.deepEqual(report.trend.map((row) => row.date), ['2026-09-24']);
});

test('price comparison starts only at a common exact close and does not create personal QQQ alpha', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [trade('2026-09-21', 'buy', 10, 100)],
    symbolSnapshots: [
      snapshot('2026-09-21', 100, 1100, { currentPriceUsd: 110 }),
      snapshot('2026-09-22', 150, 1150, { currentPriceUsd: 115 }),
      snapshot('2026-09-23', 200, 1200, { currentPriceUsd: 120 }),
    ],
    benchmarkRows: [
      { date: '2026-09-22', adjustedClose: 500 },
      { date: '2026-09-23', adjustedClose: 550 },
    ],
    stockPriceRows: [
      { date: '2026-09-21', adjustedClose: 110 },
      { date: '2026-09-22', adjustedClose: 115 },
      { date: '2026-09-23', adjustedClose: 120 },
    ],
    range: 'all',
    now: NOW,
  });

  assert.equal(report.trend[0].pricePct, null);
  assert.equal(report.trend[0].priceBenchmarkPct, null);
  assert.equal(report.trend[1].pricePct, 0);
  assert.equal(report.trend[1].priceBenchmarkPct, 0);
  assert.equal(report.trend[2].pricePct, 120 / 115 - 1);
  assert.ok(Math.abs(report.trend[2].priceBenchmarkPct - 0.1) < 1e-12);
  assert.equal(report.benchmarkPct, null);
  assert.equal(report.outperformPct, null);
});

test('custom weekend end uses the last completed close and labels its actual as-of date', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [trade('2026-09-21', 'buy', 10, 100)],
    symbolSnapshots: [
      snapshot('2026-09-21', 100, 1100),
      snapshot('2026-09-25', 200, 1200),
    ],
    range: 'custom',
    customRange: { startDate: '2026-09-21', endDate: '2026-09-27' },
    now: NOW,
  });

  assert.equal(report.hasData, true);
  assert.equal(report.requestedEndDate, '2026-09-27');
  assert.equal(report.endDate, '2026/09/25');
  assert.equal(report.rangeEndDate, '2026-09-25');
  assert.equal(report.snapshotDate, '2026-09-25');
  assert.equal(report.totalPnlUsd, 200);
});

test('without an exact common price date neither price comparison line is invented', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [trade('2026-09-21', 'buy', 10, 100)],
    symbolSnapshots: [snapshot('2026-09-21', 100, 1100, { currentPriceUsd: 110 })],
    stockPriceRows: [{ date: '2026-09-21', adjustedClose: 110 }],
    benchmarkRows: [{ date: '2026-09-22', adjustedClose: 500 }],
    range: 'all',
    now: NOW,
  });

  assert.equal(report.trend[0].pricePct, null);
  assert.equal(report.trend[0].priceBenchmarkPct, null);
  assert.equal(report.priceBenchmarkReturnPct, null);
});

test('market price trend continues after a full sale even if snapshot quote is zero and skips missing snapshot dates', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [
      trade('2026-09-21', 'buy', 10, 100),
      trade('2026-09-24', 'sell', 10, 130),
    ],
    symbolSnapshots: [
      snapshot('2026-09-21', 100, 1100, { currentPriceUsd: 110 }),
      snapshot('2026-09-24', 300, 0, { currentPriceUsd: 0, realizedPnlUsd: 300, unrealizedPnlUsd: 0 }),
      snapshot('2026-09-25', 300, 0, { currentPriceUsd: 0, realizedPnlUsd: 300, unrealizedPnlUsd: 0 }),
    ],
    stockPriceRows: [
      { date: '2026-09-21', adjustedClose: 110 },
      { date: '2026-09-22', adjustedClose: 115 },
      { date: '2026-09-23', adjustedClose: 120 },
      { date: '2026-09-24', adjustedClose: 130 },
      { date: '2026-09-25', adjustedClose: 135 },
    ],
    benchmarkRows: [
      { date: '2026-09-21', adjustedClose: 500 },
      { date: '2026-09-22', adjustedClose: 505 },
      { date: '2026-09-23', adjustedClose: 510 },
      { date: '2026-09-24', adjustedClose: 515 },
      { date: '2026-09-25', adjustedClose: 520 },
    ],
    range: 'all',
    now: NOW,
  });

  assert.deepEqual(report.priceTrend.map((point) => point.date), [
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
  ]);
  assert.equal(report.priceTrend.at(-1).pricePct, 135 / 110 - 1);
  assert.equal(report.priceTrend.at(-1).priceBenchmarkPct, 520 / 500 - 1);
  assert.equal(report.trend.at(-1).pricePct, 135 / 110 - 1);
  assert.equal(report.priceComparisonStartDate, '2026-09-21');
  assert.equal(report.priceComparisonEndDate, '2026-09-25');
});

test('market price comparison never mixes adjusted and raw closes across a split', () => {
  const report = buildStockPnlReportViewModel({
    symbol: 'META',
    stockTrades: [trade('2026-09-21', 'buy', 10, 100)],
    symbolSnapshots: [
      snapshot('2026-09-21', 0, 1000),
      snapshot('2026-09-22', 0, 1000),
      snapshot('2026-09-23', 50, 1050),
    ],
    stockPriceRows: [
      { date: '2026-09-21', adjustedClose: 100, close: 100 },
      { date: '2026-09-22', adjustedClose: null, close: 50 },
      { date: '2026-09-23', adjustedClose: 105, close: 52.5 },
    ],
    benchmarkRows: [
      { date: '2026-09-21', adjustedClose: 200, close: 200 },
      { date: '2026-09-22', adjustedClose: null, close: 100 },
      { date: '2026-09-23', adjustedClose: 210, close: 105 },
    ],
    range: 'all',
    now: NOW,
  });
  assert.deepEqual(report.priceTrend.map((point) => point.date), ['2026-09-21', '2026-09-23']);
  assert.equal(report.priceTrend.at(-1).pricePct, 105 / 100 - 1);
  assert.equal(report.priceTrend.at(-1).priceBenchmarkPct, 210 / 200 - 1);
});

test('market price comparison fails closed when either EOD series is unavailable', () => {
  const common = {
    symbol: 'META',
    stockTrades: [trade('2026-09-21', 'buy', 10, 100)],
    symbolSnapshots: [snapshot('2026-09-21', 100, 1100)],
    range: 'all',
    now: NOW,
  };
  const withoutStock = buildStockPnlReportViewModel({
    ...common,
    benchmarkRows: [{ date: '2026-09-21', adjustedClose: 500 }],
  });
  const withoutQqq = buildStockPnlReportViewModel({
    ...common,
    stockPriceRows: [{ date: '2026-09-21', adjustedClose: 110 }],
  });

  for (const report of [withoutStock, withoutQqq]) {
    assert.equal(report.hasData, true);
    assert.deepEqual(report.priceTrend, []);
    assert.equal(report.priceBenchmarkReturnPct, null);
    assert.equal(report.trend[0].pricePct, null);
    assert.equal(report.trend[0].priceBenchmarkPct, null);
  }
});
