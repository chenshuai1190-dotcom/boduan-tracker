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
    now: new Date('2026-07-08T22:00:00Z'),
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

  const filtered = filterPnlSnapshotsByRange(snapshots, '1m', new Date('2026-07-08T22:00:00Z'));

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
    now: new Date('2026-07-08T22:00:00Z'),
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

test('keeps known, zero, unknown, and negative net assets distinct from benchmark-only dates', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-13',
        cumulativePnlUsd: 300,
        cumulativePnlPct: 0.03,
        totalAssetsUsd: 1300,
        marginDebtUsd: 1500,
        netAssetsUsd: -200,
        dailyPnlUsd: 20,
        dailyPnlPct: 0.02,
      },
      {
        snapshotDate: '2026-07-10',
        cumulativePnlUsd: 280,
        cumulativePnlPct: 0.028,
        totalAssetsUsd: 1200,
        marginDebtUsd: 200,
        dailyPnlUsd: 10,
        dailyPnlPct: 0.01,
      },
      {
        snapshotDate: '2026-07-08',
        cumulativePnlUsd: 270,
        cumulativePnlPct: 0.027,
        totalAssetsUsd: 1100,
        marginDebtUsd: 0,
        netAssetsUsd: 1100,
        dailyPnlUsd: 5,
        dailyPnlPct: 0.005,
      },
      {
        snapshotDate: '2026-07-06',
        cumulativePnlUsd: 265,
        cumulativePnlPct: 0.0265,
        totalAssetsUsd: 1000,
        marginDebtUsd: null,
        netAssetsUsd: null,
        dailyPnlUsd: 5,
        dailyPnlPct: 0.005,
      },
    ],
    benchmarkRows: [
      { date: '2026-07-06', adjustedClose: 500 },
      { date: '2026-07-07', adjustedClose: 505 },
      { date: '2026-07-08', adjustedClose: 510 },
      { date: '2026-07-10', adjustedClose: 515 },
      { date: '2026-07-13', adjustedClose: 520 },
    ],
    range: 'all',
    now: new Date('2026-07-13T22:00:00.000Z'),
  });

  const trendByDate = new Map(report.trend.map((point) => [point.date, point]));

  assert.deepEqual(
    {
      totalAssetUsd: trendByDate.get('2026-07-10').totalAssetUsd,
      marginDebtUsd: trendByDate.get('2026-07-10').marginDebtUsd,
      netAssetUsd: trendByDate.get('2026-07-10').netAssetUsd,
    },
    {
      totalAssetUsd: 1200,
      marginDebtUsd: 200,
      netAssetUsd: 1000,
    },
  );

  assert.equal(trendByDate.get('2026-07-08').marginDebtUsd, 0);
  assert.equal(trendByDate.get('2026-07-08').netAssetUsd, 1100);

  assert.equal(trendByDate.get('2026-07-06').totalAssetUsd, 1000);
  assert.equal(trendByDate.get('2026-07-06').marginDebtUsd, null);
  assert.equal(trendByDate.get('2026-07-06').netAssetUsd, null);

  assert.equal(trendByDate.get('2026-07-13').marginDebtUsd, 1500);
  assert.equal(trendByDate.get('2026-07-13').netAssetUsd, -200);

  assert.equal(trendByDate.get('2026-07-07').totalAssetUsd, null);
  assert.equal(trendByDate.get('2026-07-07').marginDebtUsd, null);
  assert.equal(trendByDate.get('2026-07-07').netAssetUsd, null);
  assert.notEqual(trendByDate.get('2026-07-07').benchmarkPct, null);
});

test('returns report range bounds from latest snapshot and first trade', () => {
  const bounds = getPnlReportRangeBounds({
    portfolioSnapshots: [{ snapshotDate: '2026-07-08' }],
    stockTrades: [{ tradeDate: '2026-04-05', symbol: 'NVDA' }],
    range: 'all',
    now: new Date('2026-07-08T22:00:00Z'),
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
    now: new Date('2026-07-08T22:00:00Z'),
  });

  assert.equal(report.startDate, '2026/01/01');
  assert.equal(report.endDate, '2026/07/08');
  assert.equal(report.benchmarkStartDate, '2026-01-01');
  assert.equal(report.trend[0].date, '2026-01-01');
  assert.equal(report.trend[0].pnlPct, null);
  assert.ok(report.trend.some((point) => point.date === '2026-04-01' && point.benchmarkPct != null));
  assert.equal(report.trend.at(-1).date, '2026-07-08');
});

test('ignores snapshots generated before their trading day has completed', () => {
  const portfolioSnapshots = [
    {
      snapshotDate: '2026-07-07',
      cumulativePnlUsd: 6200,
      cumulativePnlPct: 0.0019,
      totalAssetsUsd: 3390000,
      dailyPnlUsd: 6200,
      dailyPnlPct: 0.0019,
      lockedAt: '2026-07-08T10:00:00.000Z',
      updatedAt: '2026-07-08T10:00:00.000Z',
    },
    {
      snapshotDate: '2026-07-08',
      cumulativePnlUsd: -3740,
      cumulativePnlPct: -0.0012,
      totalAssetsUsd: 3380000,
      dailyPnlUsd: -3740,
      dailyPnlPct: -0.0012,
      lockedAt: '2026-07-08T10:00:00.000Z',
      updatedAt: '2026-07-08T10:00:00.000Z',
    },
  ];

  const premarketReport = buildPnlReportViewModel({
    portfolioSnapshots,
    range: 'ytd',
    now: new Date('2026-07-08T10:00:00.000Z'),
  });

  assert.equal(premarketReport.snapshotDate, '2026-07-07');
  assert.equal(premarketReport.endDate, '2026/07/07');
  assert.equal(premarketReport.totalPnlUsd, 6200);

  const afterCloseReport = buildPnlReportViewModel({
    portfolioSnapshots: [
      portfolioSnapshots[0],
      {
        ...portfolioSnapshots[1],
        cumulativePnlUsd: 7100,
        cumulativePnlPct: 0.0021,
        lockedAt: '2026-07-08T21:00:00.000Z',
        updatedAt: '2026-07-08T21:00:00.000Z',
      },
    ],
    range: 'ytd',
    now: new Date('2026-07-08T22:00:00.000Z'),
  });

  assert.equal(afterCloseReport.snapshotDate, '2026-07-08');
  assert.equal(afterCloseReport.endDate, '2026/07/08');
  assert.equal(afterCloseReport.totalPnlUsd, 900);
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
    now: new Date('2026-07-08T22:00:00.000Z'),
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
    now: new Date('2026-07-08T22:00:00Z'),
  });

  assert.equal(report.baselineSnapshotDate, '2026-01-02');
  assert.equal(report.rankings.gain[0].symbol, 'NVDA');
  assert.equal(report.rankings.gain[0].pnlUsd, 800);
  assert.equal(report.rankings.loss[0].symbol, 'MSFT');
  assert.equal(report.rankings.loss[0].pnlUsd, -100);
  assert.equal(report.rankings.gain.some((row) => row.symbol === 'TSM'), false);
});

test('period ranking uses zero baseline for symbols first traded inside the selected range', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-07',
        cumulativePnlUsd: 500,
        cumulativePnlPct: 0.05,
        totalAssetsUsd: 10500,
        dailyPnlUsd: 80,
      },
    ],
    symbolSnapshots: [
      { symbol: 'NVDA', name: 'NVIDIA', cumulativePnlUsd: 700 },
      { symbol: 'OLD', name: 'Old Holding', cumulativePnlUsd: 300 },
      { symbol: 'MSFT', name: 'Microsoft', cumulativePnlUsd: -200 },
    ],
    stockTrades: [
      { trade_date: '2026-03-05', symbol: 'NVDA', shares: 10, price: 100 },
      { trade_date: '2025-11-20', symbol: 'OLD', shares: 10, price: 100 },
      { trade_date: '2026-04-01', symbol: 'MSFT', shares: 5, price: 200 },
    ],
    range: 'ytd',
    now: new Date('2026-07-08T22:00:00Z'),
  });

  assert.equal(report.startDate, '2026/01/01');
  assert.equal(report.rankings.gain[0].symbol, 'NVDA');
  assert.equal(report.rankings.gain[0].pnlUsd, 700);
  assert.equal(report.rankings.gain.some((row) => row.symbol === 'OLD'), false);
  assert.equal(report.rankings.loss[0].symbol, 'MSFT');
});

test('period ranking ignores backfilled baseline before the real first trade date', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-08',
        cumulativePnlUsd: -250,
        cumulativePnlPct: -0.025,
        totalAssetsUsd: 9750,
        dailyPnlUsd: -40,
      },
      {
        snapshotDate: '2026-07-01',
        cumulativePnlUsd: -900,
        cumulativePnlPct: -0.09,
        totalAssetsUsd: 9100,
        dailyPnlUsd: 0,
      },
    ],
    symbolSnapshots: [
      { symbol: 'NVDA', name: 'NVIDIA', cumulativePnlUsd: 500 },
      { symbol: 'MSFT', name: 'Microsoft', cumulativePnlUsd: -300 },
      { symbol: 'META', name: 'Meta', cumulativePnlUsd: -450 },
    ],
    baselineSymbolSnapshots: [
      { symbol: 'NVDA', name: 'NVIDIA', cumulativePnlUsd: 200 },
      { symbol: 'MSFT', name: 'Microsoft', cumulativePnlUsd: -800 },
      { symbol: 'META', name: 'Meta', cumulativePnlUsd: -1000 },
    ],
    stockTrades: [
      { trade_date: '2026-07-04', symbol: 'NVDA', shares: 10, price: 100 },
      { trade_date: '2026-07-04', symbol: 'MSFT', shares: 5, price: 200 },
      { trade_date: '2026-07-04', symbol: 'META', shares: 5, price: 300 },
    ],
    range: 'ytd',
    now: new Date('2026-07-08T22:00:00Z'),
  });

  assert.equal(report.totalPnlUsd, -250);
  assert.equal(report.summary.stockPnlUsd, -250);
  assert.equal(report.rankings.gain[0].symbol, 'NVDA');
  assert.equal(report.rankings.gain[0].pnlUsd, 500);
  assert.equal(report.rankings.loss[0].symbol, 'META');
  assert.equal(report.rankings.loss[0].pnlUsd, -450);
  assert.equal(report.rankings.loss[1].symbol, 'MSFT');
  assert.equal(report.rankings.loss[1].pnlUsd, -300);
});

test('period totals use zero baseline when the portfolio first traded inside the selected range', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-07',
        cumulativePnlUsd: 500,
        cumulativePnlPct: 0.05,
        totalAssetsUsd: 10500,
        dailyPnlUsd: 80,
      },
    ],
    symbolSnapshots: [
      { symbol: 'NVDA', name: 'NVIDIA', cumulativePnlUsd: 700 },
      { symbol: 'MSFT', name: 'Microsoft', cumulativePnlUsd: -200 },
    ],
    stockTrades: [
      { trade_date: '2026-03-05', symbol: 'NVDA', shares: 10, price: 100 },
      { trade_date: '2026-04-01', symbol: 'MSFT', shares: 5, price: 200 },
    ],
    range: 'ytd',
    now: new Date('2026-07-08T22:00:00Z'),
  });

  assert.equal(report.totalPnlUsd, 500);
  assert.equal(report.summary.stockPnlUsd, 500);
});

test('builds calendar data for a selected month independent of the report range end', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-07',
        cumulativePnlUsd: 700,
        cumulativePnlPct: 0.07,
        totalAssetsUsd: 10700,
        dailyPnlUsd: 70,
        dailyPnlPct: 0.007,
      },
      {
        snapshotDate: '2026-06-30',
        cumulativePnlUsd: 500,
        cumulativePnlPct: 0.05,
        totalAssetsUsd: 10500,
        dailyPnlUsd: -20,
        dailyPnlPct: -0.002,
      },
    ],
    range: 'ytd',
    calendarDate: '2026-06-01',
    now: new Date('2026-07-08T22:00:00Z'),
  });

  assert.equal(report.selectedMonth, '2026/06');
  assert.deepEqual(report.calendar.map((item) => item.day), [30]);
  assert.equal(report.calendar[0].valueUsd, -20);
  assert.deepEqual(report.availableCalendarYears, ['2026']);
  assert.deepEqual(report.availableCalendarMonths, ['2026-06', '2026-07']);
});

test('builds year calendar from monthly snapshot sums', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      {
        snapshotDate: '2026-07-07',
        cumulativePnlUsd: 700,
        cumulativePnlPct: 0.07,
        totalAssetsUsd: 10700,
        dailyPnlUsd: 70,
        dailyPnlPct: 0.007,
      },
      {
        snapshotDate: '2026-07-06',
        cumulativePnlUsd: 630,
        cumulativePnlPct: 0.063,
        totalAssetsUsd: 10630,
        dailyPnlUsd: 30,
        dailyPnlPct: 0.003,
      },
      {
        snapshotDate: '2026-06-30',
        cumulativePnlUsd: 500,
        cumulativePnlPct: 0.05,
        totalAssetsUsd: 10500,
        dailyPnlUsd: -20,
        dailyPnlPct: -0.002,
      },
    ],
    range: 'ytd',
    calendarDate: '2026-07-01',
    now: new Date('2026-07-08T22:00:00Z'),
  });

  assert.equal(report.selectedYear, '2026');
  assert.equal(report.yearCalendar.length, 12);
  assert.equal(report.yearCalendar[5].month, 6);
  assert.equal(report.yearCalendar[5].valueUsd, -20);
  assert.equal(report.yearCalendar[6].month, 7);
  assert.equal(report.yearCalendar[6].valueUsd, 100);
});

test('returns explicit empty report when there are no snapshots', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [],
    symbolSnapshots: [],
    now: new Date('2026-07-08T22:00:00Z'),
  });

  assert.equal(report.hasData, false);
  assert.equal(report.totalPnlUsd, 0);
  assert.equal(report.selectedMonth, '2026/07');
  assert.deepEqual(report.rankings.gain, []);
});

test('adds known cash to asset lines without diluting stock return percentages', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [{
      snapshotDate: '2026-07-08',
      marketValueUsd: 100,
      cashUsd: 900,
      cashKnown: true,
      cashBasis: 'event',
      cashEventId: '8',
      cashEffectiveAt: '2026-07-07T18:00:00.000Z',
      totalAssetsUsd: 9999,
      marginDebtUsd: 20,
      netAssetsUsd: 9979,
      cumulativePnlUsd: 10,
      cumulativePnlPct: 0.1,
      dailyPnlUsd: 10,
      dailyPnlPct: null,
    }],
    range: 'custom',
    customRange: { startDate: '2026-07-08', endDate: '2026-07-08' },
    now: new Date('2026-07-08T22:00:00Z'),
  });

  assert.equal(report.totalPnlPct, 10 / 90);
  assert.equal(report.trend[0].cashUsd, 900);
  assert.equal(report.trend[0].cashKnown, true);
  assert.equal(report.trend[0].totalAssetUsd, 1000);
  assert.equal(report.trend[0].netAssetUsd, 980);
});
