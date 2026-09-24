import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPnlReportViewModel } from '../src/lib/pnlReportViewModel.js';

const now = new Date('2026-09-24T22:00:00.000Z');

function snapshot(snapshotDate, cumulativePnlUsd, dailyPnlUsd, overrides = {}) {
  return {
    snapshotDate,
    cumulativePnlUsd,
    cumulativePnlPct: cumulativePnlUsd / 10000,
    dailyPnlUsd,
    dailyPnlPct: dailyPnlUsd / 10000,
    totalAssetsUsd: 10000,
    ...overrides,
  };
}

function amountAt(report, date) {
  return report.trend.find((point) => point.date === date);
}

test('amount trend uses report P&L snapshots, never asset deltas or benchmark-only dates', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      snapshot('2026-09-23', 750, 50, { totalAssetsUsd: 50000 }),
      snapshot('2026-09-22', 700, 100, { totalAssetsUsd: 8000 }),
      snapshot('2026-09-18', 600, 40, { totalAssetsUsd: 30000 }),
    ],
    benchmarkRows: [
      { date: '2026-09-18', close: 100 },
      { date: '2026-09-21', close: 101 },
      { date: '2026-09-22', close: 102 },
      { date: '2026-09-23', close: 103 },
    ],
    range: 'all',
    now,
  });

  assert.deepEqual(
    report.trend.map(({ date, pnlUsd, dailyPnlUsd }) => [date, pnlUsd, dailyPnlUsd]),
    [
      ['2026-09-18', 600, 40],
      ['2026-09-21', null, null],
      ['2026-09-22', 700, 100],
      ['2026-09-23', 750, 50],
    ],
  );
  assert.equal(report.trend.at(-1).pnlUsd, report.totalPnlUsd);
});

test('a prior snapshot supplies the same fixed period baseline as the headline', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      snapshot('2026-01-06', 150, 30),
      snapshot('2026-01-02', 120, 20),
      snapshot('2025-12-31', 100, 10),
    ],
    range: 'ytd',
    now,
  });

  assert.equal(amountAt(report, '2026-01-01').pnlUsd, null);
  assert.equal(amountAt(report, '2026-01-02').pnlUsd, 20);
  assert.equal(amountAt(report, '2026-01-06').pnlUsd, 50);
  assert.equal(report.totalPnlUsd, 50);
});

test('first in-range snapshot starts at zero when it is the chosen baseline', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      snapshot('2026-01-06', 150, 30),
      snapshot('2026-01-02', 120, 20),
    ],
    range: 'ytd',
    now,
  });

  assert.equal(amountAt(report, '2026-01-02').pnlUsd, 0);
  assert.equal(amountAt(report, '2026-01-06').pnlUsd, 30);
  assert.equal(report.totalPnlUsd, 30);
});

test('first trade inside the range preserves the existing zero-baseline treatment', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      snapshot('2026-01-06', 150, 30),
      snapshot('2026-01-02', 120, 20),
    ],
    stockTrades: [{ trade_date: '2026-01-02', symbol: 'META', shares: 1, price: 100 }],
    range: 'ytd',
    now,
  });

  assert.equal(amountAt(report, '2026-01-02').pnlUsd, 120);
  assert.equal(amountAt(report, '2026-01-06').pnlUsd, 150);
  assert.equal(report.totalPnlUsd, 150);
});

test('single-day amount follows the report daily value and retains its fallback', () => {
  const shared = {
    portfolioSnapshots: [
      snapshot('2026-07-08', 350, 75),
      snapshot('2026-07-07', 200, 20),
    ],
    range: 'custom',
    customRange: { startDate: '2026-07-08', endDate: '2026-07-08' },
    now,
  };
  const direct = buildPnlReportViewModel(shared);
  assert.equal(direct.totalPnlUsd, 75);
  assert.equal(direct.trend[0].pnlUsd, 75);
  assert.equal(direct.trend[0].dailyPnlUsd, 75);

  const fallback = buildPnlReportViewModel({
    ...shared,
    portfolioSnapshots: [
      snapshot('2026-07-08', 350, 75, { dailyPnlPct: null }),
      shared.portfolioSnapshots[1],
    ],
  });
  assert.equal(fallback.totalPnlUsd, 150);
  assert.equal(fallback.trend[0].pnlUsd, 150);
  assert.equal(fallback.trend[0].dailyPnlUsd, 75);
});

test('one available in-range snapshot follows the existing daily fallback', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [snapshot('2026-07-08', 1300, 75)],
    range: 'ytd',
    now,
  });

  assert.equal(report.totalPnlUsd, 75);
  assert.equal(amountAt(report, '2026-07-08').pnlUsd, 75);
});

test('incomplete portfolio snapshot amounts are gaps, not fabricated zeroes', () => {
  const report = buildPnlReportViewModel({
    portfolioSnapshots: [
      snapshot('2026-07-09', 1300, 30),
      snapshot('2026-07-08', null, 50),
      snapshot('2026-07-07', 1200, 10),
    ],
    range: 'all',
    now,
  });

  assert.equal(amountAt(report, '2026-07-08').pnlUsd, null);
  assert.equal(amountAt(report, '2026-07-08').dailyPnlUsd, null);
  assert.equal(amountAt(report, '2026-07-09').pnlUsd, report.totalPnlUsd);
});

test('the last plotted amount matches the headline across all report ranges', () => {
  const portfolioSnapshots = [
    snapshot('2025-01-02', 10, 10),
    snapshot('2025-09-01', 100, 90),
    snapshot('2026-01-02', 150, 50),
    snapshot('2026-03-02', 200, 50),
    snapshot('2026-07-01', 300, 100),
    snapshot('2026-08-24', 350, 50),
    snapshot('2026-09-01', 380, 30),
    snapshot('2026-09-23', 400, 20),
  ];
  const expectedByRange = {
    month: 50,
    '1m': 100,
    '6m': 200,
    ytd: 300,
    '1y': 300,
    all: 400,
    custom: 50,
  };

  for (const [range, expected] of Object.entries(expectedByRange)) {
    const report = buildPnlReportViewModel({
      portfolioSnapshots,
      range,
      customRange: range === 'custom'
        ? { startDate: '2026-09-01', endDate: '2026-09-23' }
        : null,
      now,
    });
    const lastValid = report.trend.filter((point) => point.pnlUsd != null).at(-1);
    assert.equal(report.totalPnlUsd, expected, `${range} headline`);
    assert.equal(lastValid?.pnlUsd, report.totalPnlUsd, `${range} final plotted point`);
  }
});
