import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStockReturnComparison,
  STOCK_RETURN_COMPARISON_CONFIG,
} from '../src/lib/stockReturnComparison.js';
import { buildStockDetailViewModel } from '../src/lib/stockDetailViewModel.js';

function assertClose(actual, expected, tolerance = 0.000000001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function stockDetail(overrides = {}) {
  return {
    comparisonPositionStartDate: '2026-06-01',
    benchmarkBaselineDate: '2026-06-01',
    benchmarkBaselineMode: 'on_or_after',
    benchmarkEndDate: '2026-06-30',
    comparisonTrend: [
      { date: '2026-06-01', heldShares: 10, closePriceUsd: 100, marketValueUsd: 1_000 },
      { date: '2026-06-10', heldShares: 20, closePriceUsd: 130, marketValueUsd: 2_600 },
      { date: '2026-06-19', heldShares: 15, closePriceUsd: 140, marketValueUsd: 2_100 },
      { date: '2026-06-30', heldShares: 15, closePriceUsd: 150, marketValueUsd: 2_250 },
    ],
    comparisonTrades: [
      { id: '1', date: '2026-06-01', side: 'buy', shares: 10, price: 100 },
      { id: '2', date: '2026-06-10', side: 'buy', shares: 10, price: 120 },
      { id: '3', date: '2026-06-19', side: 'sell', shares: 5, price: 150 },
    ],
    ...overrides,
  };
}

function qqqRows(overrides = []) {
  return [
    { date: '2026-01-02', rawClose: 50 },
    { date: '2026-06-01', rawClose: 100, adjustedClose: 90, close: 90 },
    { date: '2026-06-10', rawClose: 110, adjustedClose: 95, close: 95 },
    { date: '2026-06-19', rawClose: 121, adjustedClose: 100, close: 100 },
    { date: '2026-06-30', rawClose: 132, adjustedClose: 105, close: 105 },
    ...overrides,
  ];
}

function stockRawRows(overrides = []) {
  return [
    { date: '2026-01-02', rawClose: 75 },
    { date: '2026-06-01', rawClose: 100, adjustedClose: 900, close: 900 },
    { date: '2026-06-10', rawClose: 130, adjustedClose: 901, close: 901 },
    { date: '2026-06-19', rawClose: 140, adjustedClose: 902, close: 902 },
    { date: '2026-06-30', rawClose: 150, adjustedClose: 903, close: 903 },
    ...overrides,
  ];
}

test('starts both survivor ledgers at zero on the first common formal snapshot date', () => {
  const result = buildStockReturnComparison(stockDetail(), qqqRows(), stockRawRows());

  assert.equal(result.available, true);
  assert.equal(result.positionStartDate, '2026-06-01');
  assert.equal(result.requestedBaselineDate, '2026-06-01');
  assert.equal(result.baselineDate, '2026-06-01');
  assert.equal(result.snapshotDate, '2026-06-30');
  assert.equal(result.comparisonScope, 'current_holding_only');
  assert.equal(result.initialPrincipalUsd, 750);
  assert.equal(result.stockBaselineRawClose, 100);
  assert.equal(result.stockSnapshotRawClose, 150);
  assert.equal(result.trend[0].stockRawClose, 100);
  assert.equal(result.trend[0].stockPnlUsd, 0);
  assert.equal(result.trend[0].benchmarkPnlUsd, 0);
  assert.equal(result.trend[0].excessPnlUsd, 0);
  assert.equal(result.trend[0].stockPnlPct, 0);
  assert.equal(result.trend[0].benchmarkPnlPct, 0);
});

test('a later surviving buy uses moving average cost and invests the same surviving dollars in QQQ', () => {
  const result = buildStockReturnComparison(stockDetail(), qqqRows(), stockRawRows());
  const afterBuy = result.trend.find((point) => point.date === '2026-06-10');

  assert.equal(afterBuy.stockHeldShares, 15);
  assert.equal(afterBuy.stockAvgCostUsd, 110);
  assert.equal(afterBuy.stockBasisUsd, 1_650);
  assert.equal(afterBuy.stockPnlUsd, 300);
  assertClose(afterBuy.stockPnlPct, 300 / 1_650);
  assertClose(afterBuy.benchmarkHeldShares, 7.5 + (900 / 110));
  assert.equal(afterBuy.benchmarkBasisUsd, 1_650);
  assertClose(afterBuy.benchmarkPnlUsd, 75);
});

test('an existing partial sell removes its stock and QQQ portions from the whole comparison', () => {
  const result = buildStockReturnComparison(stockDetail(), qqqRows(), stockRawRows());
  const afterSell = result.trend.find((point) => point.date === '2026-06-19');

  // The 25% sale removes 25% of each then-open stock lot and its matched QQQ
  // position from the entire rebuilt history. Realized P&L is not retained.
  assert.equal(afterSell.stockHeldShares, 15);
  assert.equal(afterSell.stockAvgCostUsd, 110);
  assert.equal(afterSell.stockRealizedPnlUsd, 0);
  assert.equal(afterSell.stockBasisUsd, 1_650);
  assert.equal(afterSell.stockPnlUsd, 450);
  assertClose(afterSell.stockPnlPct, 450 / 1_650);

  assertClose(afterSell.benchmarkHeldShares, 7.5 + (900 / 110));
  assertClose(afterSell.benchmarkRealizedPnlUsd, 0);
  assertClose(afterSell.benchmarkBasisUsd, 1_650);
  assertClose(afterSell.benchmarkPnlUsd, 247.5);
  assertClose(afterSell.benchmarkPnlPct, 247.5 / 1_650);
  assertClose(afterSell.excessPnlUsd, 202.5);
});

test('a 50% trim rebuilds the whole comparison with only the remaining half', () => {
  const result = buildStockReturnComparison(stockDetail({
    benchmarkEndDate: '2026-06-11',
    comparisonTrend: [
      { date: '2026-06-01', heldShares: 100 },
      { date: '2026-06-10', heldShares: 100 },
      { date: '2026-06-11', heldShares: 50 },
    ],
    comparisonTrades: [
      { id: 'base', date: '2026-06-01', side: 'buy', shares: 100, price: 100 },
      { id: 'existing-sell', date: '2026-06-11', side: 'sell', shares: 50, price: 150 },
    ],
  }), [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 120 },
    { date: '2026-06-11', rawClose: 120 },
  ], [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 150 },
    { date: '2026-06-11', rawClose: 150 },
  ]);

  assert.equal(result.available, true);
  const beforeSell = result.trend.find((point) => point.date === '2026-06-10');
  const afterSell = result.trend.find((point) => point.date === '2026-06-11');
  assert.equal(beforeSell.stockPnlUsd, 2_500);
  assert.equal(afterSell.stockPnlUsd, beforeSell.stockPnlUsd);
  assert.equal(afterSell.stockPnlPct, beforeSell.stockPnlPct);
  assert.equal(afterSell.benchmarkPnlUsd, beforeSell.benchmarkPnlUsd);
  assert.equal(afterSell.benchmarkPnlPct, beforeSell.benchmarkPnlPct);
  assert.equal(afterSell.excessPnlUsd, beforeSell.excessPnlUsd);
  assert.equal(afterSell.excessPnlPct, beforeSell.excessPnlPct);
  assert.equal(beforeSell.stockHeldShares, 50);
  assert.equal(afterSell.stockHeldShares, 50);
  assert.equal(afterSell.stockRealizedPnlUsd, 0);
  assert.equal(afterSell.benchmarkRealizedPnlUsd, 0);
  assert.equal(afterSell.stockBasisUsd, 5_000);
  assert.equal(afterSell.benchmarkBasisUsd, 5_000);
  assertClose(afterSell.stockPnlPct, 0.5);
  assertClose(afterSell.benchmarkPnlPct, 0.2);
  assertClose(afterSell.excessPnlPct, 0.3);
});

test('editing or deleting an existing sell rebuilds the fixed-start current position', () => {
  const benchmarkRows = [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 110 },
    { date: '2026-06-19', rawClose: 120 },
    { date: '2026-06-30', rawClose: 140 },
  ];
  const stockRows = [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 120 },
    { date: '2026-06-19', rawClose: 150 },
    { date: '2026-06-30', rawClose: 170 },
  ];
  const baseTrades = [
    { id: 'base', date: '2026-06-01', side: 'buy', shares: 100, price: 100 },
    { id: 'add', date: '2026-06-10', side: 'buy', shares: 50, price: 120 },
  ];
  const build = (sellShares) => buildStockReturnComparison(stockDetail({
    comparisonTrend: [
      { date: '2026-06-01', heldShares: 100 },
      { date: '2026-06-10', heldShares: 150 },
      { date: '2026-06-19', heldShares: sellShares === null ? 150 : 150 - sellShares },
      { date: '2026-06-30', heldShares: sellShares === null ? 150 : 150 - sellShares },
    ],
    comparisonTrades: sellShares === null
      ? baseTrades
      : [...baseTrades, { id: 'sell', date: '2026-06-19', side: 'sell', shares: sellShares, price: 150 }],
  }), benchmarkRows, stockRows);

  const originalSell = build(75);
  assert.equal(originalSell.available, true);
  assertClose(originalSell.stockPnlUsd, 4_750);
  assertClose(originalSell.benchmarkPnlUsd, 2_818.181818181818);
  assertClose(originalSell.excessPnlPct, 0.2414772727272727);

  const editedSell = build(30);
  assert.equal(editedSell.available, true);
  assertClose(editedSell.stockPnlUsd, 7_600);
  assertClose(editedSell.benchmarkPnlUsd, 4_509.090909090908);
  assertClose(editedSell.excessPnlPct, 0.24147727272727276);

  const deletedSell = build(null);
  assert.equal(deletedSell.available, true);
  assertClose(deletedSell.stockPnlUsd, 9_500);
  assertClose(deletedSell.benchmarkPnlUsd, 5_636.363636363636);
  assertClose(deletedSell.excessPnlPct, 0.24147727272727273);
  assert.equal(originalSell.periodBasisUsd, 8_000);
  assert.equal(editedSell.periodBasisUsd, 12_800);
  assert.equal(deletedSell.periodBasisUsd, 16_000);
});

test('final amounts and percentages use only matched surviving stock and QQQ capital', () => {
  const result = buildStockReturnComparison(stockDetail(), qqqRows(), stockRawRows());

  assert.equal(result.stockPnlUsd, 600);
  assert.equal(result.periodBasisUsd, 1_650);
  assertClose(result.stockPnlPct, 600 / 1_650);
  assertClose(result.benchmarkPnlUsd, 420);
  assertClose(result.benchmarkBasisUsd, 1_650);
  assertClose(result.benchmarkPnlPct, 420 / 1_650);
  assertClose(result.excessPnlUsd, 180);
  assertClose(result.excessPnlPct, 180 / 1_650);
});

test('multiple existing sells rebuild the full history for only the final remaining shares', () => {
  const result = buildStockReturnComparison(stockDetail({
    comparisonPositionStartDate: '2026-07-04',
    benchmarkBaselineDate: '2026-07-04',
    benchmarkEndDate: '2026-07-31',
    comparisonTrend: [
      { date: '2026-07-06', heldShares: 23 },
      { date: '2026-07-30', heldShares: 10 },
      { date: '2026-07-31', heldShares: 10 },
    ],
    comparisonTrades: [
      { id: 'buy', date: '2026-07-04', side: 'buy', shares: 23, price: 41.207 },
      { id: 'sell-1', date: '2026-07-30', side: 'sell', shares: 5, price: 44.618, orderIndex: 1 },
      { id: 'sell-2', date: '2026-07-30', side: 'sell', shares: 5, price: 44.7, orderIndex: 2 },
      { id: 'sell-3', date: '2026-07-30', side: 'sell', shares: 3, price: 42, orderIndex: 3 },
    ],
  }), [
    { date: '2026-07-06', rawClose: 61 },
    { date: '2026-07-30', rawClose: 68 },
    { date: '2026-07-31', rawClose: 68.799 },
  ], [
    { date: '2026-07-06', rawClose: 38.674 },
    { date: '2026-07-30', rawClose: 45 },
    { date: '2026-07-31', rawClose: 46.472 },
  ]);

  assert.equal(result.available, true);
  assertClose(result.initialPrincipalUsd, 386.74);
  assertClose(result.periodBasisUsd, 386.74);
  assertClose(result.trend[0].stockHeldShares, 10);
  assertClose(result.trend.at(-1).stockHeldShares, 10);
  assertClose(result.trend.at(-1).stockRealizedPnlUsd, 0);
  assertClose(result.stockPnlUsd, 77.98);
  assertClose(result.stockPnlPct, 77.98 / 386.74);
});

test('keeps excess dollars and return-rate gap as separate honest measures after trims', () => {
  const result = buildStockReturnComparison(stockDetail({
    benchmarkBaselineDate: '2026-06-01',
    benchmarkEndDate: '2026-06-10',
    comparisonPositionStartDate: '2026-06-01',
    comparisonTrades: [
      { id: 'base', date: '2026-06-01', side: 'buy', shares: 1, price: 100, orderIndex: 0 },
      { id: 'trim', date: '2026-06-05', side: 'sell', shares: 0.5, price: 1, orderIndex: 1 },
    ],
    comparisonTrend: [
      { date: '2026-06-01', heldShares: 1 },
      { date: '2026-06-05', heldShares: 0.5 },
      { date: '2026-06-10', heldShares: 0.5 },
    ],
  }), [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-05', rawClose: 100 },
    { date: '2026-06-10', rawClose: 200 },
  ], [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-05', rawClose: 1 },
    { date: '2026-06-10', rawClose: 320 },
  ]);

  assert.equal(result.available, true);
  assertClose(result.stockPnlUsd, 110);
  assertClose(result.stockPnlPct, 110 / 50);
  assertClose(result.benchmarkPnlUsd, 50);
  assertClose(result.benchmarkPnlPct, 50 / 50);
  assertClose(result.excessPnlUsd, 60);
  assertClose(result.excessPnlPct, 60 / 50);
  assert.ok(result.excessPnlUsd > 0 && result.excessPnlPct > 0);
});

test('personal adjusted snapshot prices never affect the raw/raw comparison', () => {
  const detailWithConflictingSnapshotPrices = stockDetail({
    comparisonTrend: stockDetail().comparisonTrend.map((point, index) => ({
      ...point,
      closePriceUsd: 900 + index,
      currentPriceUsd: 800 + index,
      marketValueUsd: 900_000 + index,
    })),
  });
  const result = buildStockReturnComparison(
    detailWithConflictingSnapshotPrices,
    qqqRows(),
    stockRawRows(),
  );

  assert.equal(result.available, true);
  assert.equal(result.initialPrincipalUsd, 750);
  assert.equal(result.stockBaselineRawClose, 100);
  assert.equal(result.stockSnapshotRawClose, 150);
  assert.equal(result.trend.find((point) => point.date === '2026-06-10').stockRawClose, 130);
  assert.equal(result.stockPnlUsd, 600);
  assertClose(result.stockPnlPct, 600 / 1_650);
});

test('never starts QQQ before the current position even when the selected range starts earlier', () => {
  const result = buildStockReturnComparison(stockDetail({
    comparisonPositionStartDate: '2026-06-01',
    benchmarkBaselineDate: '2026-01-01',
  }), qqqRows(), stockRawRows());

  assert.equal(result.available, true);
  assert.equal(result.requestedBaselineDate, '2026-01-01');
  assert.equal(result.positionStartDate, '2026-06-01');
  assert.equal(result.baselineDate, '2026-06-01');
  assert.equal(result.benchmarkBaselineRawClose, 100);
});

test('moves a weekend inception to the first exact stock and QQQ close without carrying prior profit', () => {
  const result = buildStockReturnComparison(stockDetail({
    comparisonPositionStartDate: '2026-05-31',
    benchmarkBaselineDate: '2026-05-31',
    benchmarkEndDate: '2026-06-10',
    comparisonTrades: [
      { date: '2026-05-31', side: 'buy', shares: 10, price: 100 },
    ],
    comparisonTrend: [
      // The position already gained $500 before the first common close. d0 is
      // re-based to this market value, so the comparison still begins at zero.
      { date: '2026-06-01', heldShares: 10, closePriceUsd: 150, marketValueUsd: 1_500 },
      { date: '2026-06-10', heldShares: 10, closePriceUsd: 165, marketValueUsd: 1_650 },
    ],
  }), [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 105 },
  ], [
    { date: '2026-06-01', rawClose: 150 },
    { date: '2026-06-10', rawClose: 165 },
  ]);

  assert.equal(result.available, true);
  assert.equal(result.baselineDate, '2026-06-01');
  assert.equal(result.initialPrincipalUsd, 1_500);
  assert.equal(result.trend[0].stockPnlUsd, 0);
  assert.equal(result.trend[0].benchmarkPnlUsd, 0);
  assert.equal(result.stockPnlUsd, 150);
  assert.equal(result.benchmarkPnlUsd, 75);
});

test('exact baseline mode never advances to a later close', () => {
  const result = buildStockReturnComparison(stockDetail({
    comparisonPositionStartDate: '2026-05-31',
    benchmarkBaselineDate: '2026-05-31',
    benchmarkBaselineMode: 'exact',
  }), qqqRows(), stockRawRows());

  assert.equal(result.available, false);
  assert.equal(result.reason, 'missing_exact_common_baseline');
});

test('uses rawClose only and fails closed when a regular-session QQQ trade close is missing', () => {
  const adjustedOnlyBaseline = buildStockReturnComparison(stockDetail(), [
    { date: '2026-06-01', adjustedClose: 100, close: 100 },
    { date: '2026-06-10', rawClose: 110 },
    { date: '2026-06-19', rawClose: 121 },
    { date: '2026-06-30', rawClose: 132 },
  ], stockRawRows());
  assert.equal(adjustedOnlyBaseline.available, true);
  assert.equal(adjustedOnlyBaseline.baselineDate, '2026-06-10');
  assert.equal(adjustedOnlyBaseline.benchmarkBaselineRawClose, 110);

  const missingBuyDate = buildStockReturnComparison(stockDetail(), [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-19', rawClose: 121 },
    { date: '2026-06-30', rawClose: 132 },
  ], stockRawRows());
  assert.equal(missingBuyDate.available, false);
  assert.equal(missingBuyDate.reason, 'missing_exact_benchmark_trade_close');
});

test('requires the exact common end date and never fills a nearby close', () => {
  const missingStockEnd = buildStockReturnComparison(stockDetail({
    comparisonTrend: stockDetail().comparisonTrend.slice(0, -1),
  }), qqqRows(), stockRawRows());
  assert.equal(missingStockEnd.available, false);
  assert.equal(missingStockEnd.reason, 'missing_exact_stock_snapshot');

  const missingStockRawEnd = buildStockReturnComparison(
    stockDetail(),
    qqqRows(),
    stockRawRows()
      .filter((row) => row.date !== '2026-06-30')
      .concat({ date: '2026-06-30', adjustedClose: 150, close: 150 }),
  );
  assert.equal(missingStockRawEnd.available, false);
  assert.equal(missingStockRawEnd.reason, 'missing_exact_stock_raw_snapshot');

  const missingQqqEnd = buildStockReturnComparison(
    stockDetail(),
    qqqRows().filter((row) => row.date !== '2026-06-30'),
    stockRawRows(),
  );
  assert.equal(missingQqqEnd.available, false);
  assert.equal(missingQqqEnd.reason, 'missing_exact_benchmark_snapshot');
});

test('keeps finite fixed-start returns for the shares surviving a profitable trim', () => {
  const result = buildStockReturnComparison(stockDetail({
    benchmarkEndDate: '2026-06-10',
    comparisonTrend: [
      { date: '2026-06-01', heldShares: 10, closePriceUsd: 100, marketValueUsd: 1_000 },
      { date: '2026-06-10', heldShares: 1, closePriceUsd: 300, marketValueUsd: 300 },
    ],
    comparisonTrades: [
      { date: '2026-06-01', side: 'buy', shares: 10, price: 100 },
      { date: '2026-06-10', side: 'sell', shares: 9, price: 300 },
    ],
  }), [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 100 },
  ], [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 300 },
  ]);

  assert.equal(result.available, true);
  assert.equal(result.stockPnlUsd, 200);
  assert.equal(result.periodBasisUsd, 100);
  assert.equal(result.stockPnlPct, 2);
  assert.equal(result.benchmarkPnlPct, 0);
  assert.equal(result.excessPnlPct, 2);
});

test('full liquidation has no current position to compare', () => {
  const result = buildStockReturnComparison(stockDetail({
    benchmarkEndDate: '2026-06-10',
    comparisonTrend: [
      { date: '2026-06-01', heldShares: 10, closePriceUsd: 100, marketValueUsd: 1_000 },
      { date: '2026-06-10', heldShares: 0, closePriceUsd: 300, marketValueUsd: 0 },
    ],
    comparisonTrades: [
      { date: '2026-06-01', side: 'buy', shares: 10, price: 100 },
      { date: '2026-06-10', side: 'sell', shares: 10, price: 300 },
    ],
  }), [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 110 },
  ], [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 300 },
  ]);

  assert.equal(result.available, false);
  assert.equal(result.reason, 'missing_positive_current_position');
  assert.equal(result.comparisonScope, 'current_holding_only');
});

test('fails closed when formal trades and personal snapshot holdings disagree', () => {
  const result = buildStockReturnComparison(stockDetail({
    comparisonTrend: stockDetail().comparisonTrend.map((point) => (
      point.date === '2026-06-30' ? { ...point, heldShares: 14 } : point
    )),
  }), qqqRows(), stockRawRows());

  assert.equal(result.available, false);
  assert.equal(result.reason, 'stock_trade_snapshot_mismatch');
});

test('honors created-at order when deriving same-day surviving lots', () => {
  const result = buildStockReturnComparison(stockDetail({
    benchmarkEndDate: '2026-06-10',
    comparisonTrend: [
      { date: '2026-06-01', heldShares: 10, closePriceUsd: 100, marketValueUsd: 1_000 },
      { date: '2026-06-10', heldShares: 15, closePriceUsd: 300, marketValueUsd: 4_500 },
    ],
    comparisonTrades: [
      { id: 'base', date: '2026-06-01', createdAt: '2026-06-01T15:00:00Z', side: 'buy', shares: 10, price: 100 },
      { id: 'sell', date: '2026-06-10', createdAt: '2026-06-10T15:00:00Z', side: 'sell', shares: 5, price: 300 },
      { id: 'buy', date: '2026-06-10', createdAt: '2026-06-10T14:00:00Z', side: 'buy', shares: 10, price: 200 },
    ],
  }), [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 110 },
  ], [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 300 },
  ]);

  assert.equal(result.available, true);
  const latest = result.trend.at(-1);
  assert.equal(latest.stockAvgCostUsd, 150);
  assert.equal(latest.stockRealizedPnlUsd, 0);
  assert.equal(latest.stockBasisUsd, 2_250);
});

test('a sale before a later buy only removes shares from lots already open at that time', () => {
  const result = buildStockReturnComparison(stockDetail({
    benchmarkEndDate: '2026-06-10',
    comparisonTrend: [
      { date: '2026-06-01', heldShares: 10 },
      { date: '2026-06-10', heldShares: 15 },
    ],
    comparisonTrades: [
      { id: 'base', date: '2026-06-01', createdAt: '2026-06-01T15:00:00Z', side: 'buy', shares: 10, price: 100 },
      { id: 'sell', date: '2026-06-10', createdAt: '2026-06-10T14:00:00Z', side: 'sell', shares: 5, price: 300 },
      { id: 'buy', date: '2026-06-10', createdAt: '2026-06-10T15:00:00Z', side: 'buy', shares: 10, price: 200 },
    ],
  }), [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 110 },
  ], [
    { date: '2026-06-01', rawClose: 100 },
    { date: '2026-06-10', rawClose: 300 },
  ]);

  assert.equal(result.available, true);
  const baseline = result.trend[0];
  const latest = result.trend.at(-1);
  assert.equal(baseline.stockHeldShares, 5);
  assert.equal(latest.stockHeldShares, 15);
  assertClose(latest.stockBasisUsd, 2_500);
  assertClose(latest.stockAvgCostUsd, 2_500 / 15);
  assertClose(latest.stockPnlUsd, 2_000);
  assert.equal(latest.stockRealizedPnlUsd, 0);
});

test('full close and rebuy integration starts a fresh comparison cycle', () => {
  const view = buildStockDetailViewModel({
    symbol: 'NVDA',
    stockTrades: [
      { id: 'old-buy', trade_date: '2026-05-01', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 },
      { id: 'old-close', trade_date: '2026-06-01', symbol: 'NVDA', side: 'sell', shares: 10, price: 200 },
      { id: 'new-buy', trade_date: '2026-07-01', symbol: 'NVDA', side: 'buy', shares: 5, price: 150 },
      { id: 'new-add', trade_date: '2026-07-04', symbol: 'NVDA', side: 'buy', shares: 5, price: 155 },
    ],
    symbolSnapshots: [
      { snapshotDate: '2026-07-01', symbol: 'NVDA', heldShares: 5, currentPriceUsd: 150, marketValueUsd: 750 },
      { snapshotDate: '2026-07-06', symbol: 'NVDA', heldShares: 10, currentPriceUsd: 160, marketValueUsd: 1600 },
      { snapshotDate: '2026-07-08', symbol: 'NVDA', heldShares: 10, currentPriceUsd: 170, marketValueUsd: 1700 },
    ],
    range: 'all',
    now: new Date('2026-07-08T22:00:00.000Z'),
  });
  const result = buildStockReturnComparison(view, [
    { date: '2026-07-01', rawClose: 100 },
    { date: '2026-07-06', rawClose: 105 },
    { date: '2026-07-08', rawClose: 110 },
  ], [
    { date: '2026-07-01', rawClose: 150 },
    { date: '2026-07-06', rawClose: 160 },
    { date: '2026-07-08', rawClose: 170 },
  ]);

  assert.equal(view.comparisonPositionStartDate, '2026-07-01');
  assert.deepEqual(view.comparisonTrades.map((trade) => trade.id), ['new-buy', 'new-add']);
  assert.equal(result.available, true);
  assert.equal(result.baselineDate, '2026-07-01');
  assert.equal(result.trend.find((point) => point.date === '2026-07-06').stockHeldShares, 10);
  assertClose(result.trend.find((point) => point.date === '2026-07-06').benchmarkHeldShares, 7.5 + (775 / 105));
  assert.equal(result.trend.at(-1).stockRealizedPnlUsd, 0);
  assert.equal(result.stockPnlUsd, 175);
});

test('returns explicit reasons for missing comparison inputs', () => {
  const cases = [
    [null, 'missing_stock_detail'],
    [stockDetail({ comparisonPositionStartDate: null }), 'missing_position_start_date'],
    [stockDetail({ benchmarkBaselineDate: null }), 'missing_benchmark_baseline_date'],
    [stockDetail({ benchmarkEndDate: null, snapshotDate: null }), 'missing_snapshot_date'],
    [stockDetail({ benchmarkBaselineMode: 'nearest' }), 'invalid_benchmark_baseline_mode'],
    [stockDetail({ comparisonTrend: [] }), 'missing_stock_comparison_trend'],
  ];

  cases.forEach(([detail, reason]) => {
    const result = buildStockReturnComparison(detail, qqqRows(), stockRawRows());
    assert.equal(result.available, false);
    assert.equal(result.reason, reason);
  });

  const missingStockRaw = buildStockReturnComparison(stockDetail(), qqqRows(), []);
  assert.equal(missingStockRaw.available, false);
  assert.equal(missingStockRaw.reason, 'missing_stock_raw_closes');
});

test('exposes the benchmark identity and supported baseline modes', () => {
  assert.deepEqual(STOCK_RETURN_COMPARISON_CONFIG, {
    benchmarkSymbol: 'QQQ',
    baselineModes: {
      exact: 'exact',
      onOrAfter: 'on_or_after',
    },
  });
});
