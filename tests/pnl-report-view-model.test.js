import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPnlReportViewModel, filterPnlSnapshotsByRange } from '../src/lib/pnlReportViewModel.js';

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
