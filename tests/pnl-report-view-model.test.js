import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPnlReportViewModel, filterPnlSnapshotsByRange, getPnlReportRangeBounds } from '../src/lib/pnlReportViewModel.js';

test('builds P&L report view model from database snapshots', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-08',
        cumulativePnlUsd: 1500,
        cumulativePnlPct: 0.15,
        totalAssetsUsd: 11500,
        totalBuyCostUsd: 12000,
        sellProceedsUsd: 3000,
        dailyPnlUsd: 120,
        dailyPnlPct: 0.011,
        updatedAt: '2026-07-08T21:00:00Z',
      },
      {
        snapshotDate: '2026-07-07',
        cumulativePnlUsd: 1380,
        cumulativePnlPct: 0.138,
        totalAssetsUsd: 11380,
        totalBuyCostUsd: 12000,
        sellProceedsUsd: 3000,
        dailyPnlUsd: -80,
        dailyPnlPct: -0.007,
      },
    ],
    symbolSnapshots: [
      { symbol: 'NVDA', name: 'NVIDIA', cumulativePnlUsd: 900 },
      { symbol: 'MSFT', name: 'Microsoft', cumulativePnlUsd: -140 },
      { symbol: 'TSM', name: 'TSMC', cumulativePnlUsd: 740 },
    ],
    range: 'all',
    now: new Date('2026-07-08T12:00:00Z'),
  });

  assert.equal(report.hasData, true);
  assert.equal(report.startDate, '2026/07/07');
  assert.equal(report.endDate, '2026/07/08');
  assert.equal(report.totalPnlUsd, 1500);
  assert.equal(report.turnoverUsd, 15000);
  assert.equal(report.tradeStockCount, 3);
  assert.equal(report.calendar.length, 2);
  assert.equal(report.calendar[1].day, 8);
  assert.equal(report.calendar[1].valueUsd, 120);
  assert.equal(report.rankings.gain[0].symbol, 'NVDA');
  assert.equal(report.rankings.loss[0].symbol, 'MSFT');
  assert.equal(report.summary.best.symbol, 'NVDA');
  assert.equal(report.summary.worst.symbol, 'MSFT');
});

test('filters snapshots by range without mutating source order', () => {
  const snapshots = [
    { snapshotDate: '2026-01-01' },
    { snapshotDate: '2026-06-08' },
    { snapshotDate: '2026-07-08' },
  ];

  const filtered = filterPnlSnapshotsByRange(snapshots, '1m', new Date('2026-07-08T12:00:00Z'));

  assert.deepEqual(filtered.map((snapshot) => snapshot.snapshotDate), ['2026-06-08', '2026-07-08']);
  assert.deepEqual(snapshots.map((snapshot) => snapshot.snapshotDate), ['2026-01-01', '2026-06-08', '2026-07-08']);
});

test('computes period turnover and Nasdaq outperformance from independent inputs', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-08',
        cumulativePnlUsd: 1300,
        cumulativePnlPct: 0.13,
        totalAssetsUsd: 11300,
        dailyPnlUsd: 300,
      },
      {
        snapshotDate: '2026-07-07',
        cumulativePnlUsd: 1000,
        cumulativePnlPct: 0.10,
        totalAssetsUsd: 11000,
        dailyPnlUsd: 120,
      },
      {
        snapshotDate: '2026-01-02',
        cumulativePnlUsd: 100,
        cumulativePnlPct: 0.01,
        totalAssetsUsd: 10100,
        dailyPnlUsd: 100,
      },
    ],
    stockTrades: [
      { tradeDate: '2025-12-30', symbol: 'OLD', shares: 1, price: 1000 },
      { tradeDate: '2026-01-02', symbol: 'NVDA', shares: 10, price: 100 },
      { trade_date: '2026-07-08', symbol: 'MSFT', shares: 2, price: 200, side: 'sell' },
    ],
    benchmarkRows: [
      { date: '2026-01-02', adjusted_close: 500 },
      { date: '2026-07-07', adjusted_close: 545 },
      { date: '2026-07-08', adjusted_close: 550 },
    ],
    range: 'ytd',
    now: new Date('2026-07-08T12:00:00Z'),
  });

  assert.equal(report.benchmarkStartDate, '2026-01-01');
  assert.equal(report.benchmarkEndDate, '2026-07-08');
  assert.equal(report.totalPnlUsd, 1200);
  assert.equal(Number(report.totalPnlPct.toFixed(4)), 0.12);
  assert.equal(report.turnoverUsd, 1400);
  assert.equal(report.tradeStockCount, 2);
  assert.equal(Number(report.benchmarkReturnPct.toFixed(4)), 0.1);
  assert.equal(Number(report.outperformPct.toFixed(4)), 0.02);
  assert.equal(report.trend.find((point) => point.date === '2026-01-02').benchmarkPct, 0);
  assert.equal(Number(report.trend.find((point) => point.date === '2026-07-08').benchmarkPct.toFixed(4)), 0.1);
});

test('returns report range bounds from latest snapshot and first trade', () => {
  const bounds = getPnlReportRangeBounds({
    portfolioSnapshots: [{ snapshotDate: '2026-07-08' }],
    stockTrades: [{ tradeDate: '2026-04-05', symbol: 'NVDA' }],
    range: 'all',
    now: new Date('2026-07-08T12:00:00Z'),
  });

  assert.deepEqual(bounds, { startDate: '2026-04-05', endDate: '2026-07-08' });
});

test('keeps selected range dates even when portfolio snapshots only exist today', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-08',
        cumulativePnlUsd: 1300,
        cumulativePnlPct: 0.13,
        totalAssetsUsd: 11300,
        dailyPnlUsd: 300,
      },
    ],
    benchmarkRows: [
      { date: '2026-01-02', adjusted_close: 500 },
      { date: '2026-04-01', adjusted_close: 525 },
      { date: '2026-07-08', adjusted_close: 550 },
    ],
    range: 'ytd',
    now: new Date('2026-07-08T12:00:00Z'),
  });

  assert.equal(report.startDate, '2026/01/01');
  assert.equal(report.endDate, '2026/07/08');
  assert.equal(report.benchmarkStartDate, '2026-01-01');
  assert.equal(report.trend[0].date, '2026-01-01');
  assert.equal(report.trend[0].pnlPct, null);
  assert.ok(report.trend.some((point) => point.date === '2026-04-01' && point.benchmarkPct != null));
  assert.equal(report.trend.at(-1).date, '2026-07-08');
});

test('builds single-day custom report from the exact daily snapshot only', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-08',
        cumulativePnlUsd: 1300,
        cumulativePnlPct: 0.13,
        totalAssetsUsd: 11300,
        dailyPnlUsd: 300,
        dailyPnlPct: 0.03,
      },
      {
        snapshotDate: '2026-07-07',
        cumulativePnlUsd: 1000,
        cumulativePnlPct: 0.10,
        totalAssetsUsd: 11000,
        dailyPnlUsd: 120,
        dailyPnlPct: 0.012,
      },
    ],
    symbolSnapshots: [
      { symbol: 'NVDA', name: 'NVIDIA', cumulativePnlUsd: 900, dailyPnlUsd: 80 },
      { symbol: 'MSFT', name: 'Microsoft', cumulativePnlUsd: 400, dailyPnlUsd: -25 },
    ],
    range: 'custom',
    customRange: { startDate: '2026-07-08', endDate: '2026-07-08' },
  });

  assert.equal(report.hasData, true);
  assert.equal(report.snapshotDate, '2026-07-08');
  assert.equal(report.startDate, '2026/07/08');
  assert.equal(report.endDate, '2026/07/08');
  assert.equal(report.totalPnlUsd, 300);
  assert.equal(report.totalPnlPct, 0.03);
  assert.equal(report.rankings.gain[0].symbol, 'NVDA');
  assert.equal(report.rankings.gain[0].pnlUsd, 80);
  assert.equal(report.rankings.loss[0].symbol, 'MSFT');
  assert.equal(report.rankings.loss[0].pnlUsd, -25);
});

test('does not substitute another portfolio snapshot for a missing custom end date', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-07',
        cumulativePnlUsd: 1000,
        cumulativePnlPct: 0.10,
        totalAssetsUsd: 11000,
        dailyPnlUsd: 120,
      },
    ],
    range: 'custom',
    customRange: { startDate: '2026-07-08', endDate: '2026-07-08' },
  });

  assert.equal(report.hasData, false);
  assert.equal(report.snapshotDate, null);
  assert.equal(report.startDate, '2026/07/08');
  assert.equal(report.endDate, '2026/07/08');
  assert.equal(report.totalPnlUsd, 0);
  assert.deepEqual(report.rankings.gain, []);
});

test('period ranking uses end symbol snapshot minus baseline symbol snapshot', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-08',
        cumulativePnlUsd: 1300,
        cumulativePnlPct: 0.13,
        totalAssetsUsd: 11300,
        dailyPnlUsd: 300,
      },
      {
        snapshotDate: '2026-01-02',
        cumulativePnlUsd: 100,
        cumulativePnlPct: 0.01,
        totalAssetsUsd: 10100,
        dailyPnlUsd: 100,
      },
    ],
    symbolSnapshots: [
      { symbol: 'NVDA', name: 'NVIDIA', cumulativePnlUsd: 900 },
      { symbol: 'MSFT', name: 'Microsoft', cumulativePnlUsd: 100 },
      { symbol: 'TSM', name: 'TSMC', cumulativePnlUsd: 50 },
    ],
    baselineSymbolSnapshots: [
      { symbol: 'NVDA', name: 'NVIDIA', cumulativePnlUsd: 100 },
      { symbol: 'MSFT', name: 'Microsoft', cumulativePnlUsd: 200 },
    ],
    range: 'ytd',
    now: new Date('2026-07-08T12:00:00Z'),
  });

  assert.equal(report.baselineSnapshotDate, '2026-01-02');
  assert.equal(report.rankings.gain[0].symbol, 'NVDA');
  assert.equal(report.rankings.gain[0].pnlUsd, 800);
  assert.equal(report.rankings.loss[0].symbol, 'MSFT');
  assert.equal(report.rankings.loss[0].pnlUsd, -100);
  assert.equal(report.rankings.gain.some((row) => row.symbol === 'TSM'), false);
});

test('returns explicit empty report when there are no snapshots', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [],
    symbolSnapshots: [],
    now: new Date('2026-07-08T12:00:00Z'),
  });

  assert.equal(report.hasData, false);
  assert.equal(report.totalPnlUsd, 0);
  assert.equal(report.selectedMonth, '2026/07');
  assert.deepEqual(report.rankings.gain, []);
});
