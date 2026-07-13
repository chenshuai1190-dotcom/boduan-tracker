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

test('starts both ledgers at zero on the first common formal snapshot date', () => {
  const result = buildStockReturnComparison(stockDetail(), qqqRows(), stockRawRows());

  assert.equal(result.available, true);
  assert.equal(result.positionStartDate, '2026-06-01');
  assert.equal(result.requestedBaselineDate, '2026-06-01');
  assert.equal(result.baselineDate, '2026-06-01');
  assert.equal(result.snapshotDate, '2026-06-30');
  assert.equal(result.initialPrincipalUsd, 1_000);
  assert.equal(result.stockBaselineRawClose, 100);
  assert.equal(result.stockSnapshotRawClose, 150);
  assert.equal(result.trend[0].stockRawClose, 100);
  assert.equal(result.trend[0].stockPnlUsd, 0);
  assert.equal(result.trend[0].benchmarkPnlUsd, 0);
  assert.equal(result.trend[0].excessPnlUsd, 0);
  assert.equal(result.trend[0].stockPnlPct, 0);
  assert.equal(result.trend[0].benchmarkPnlPct, 0);
});

test('a later buy uses moving average cost and invests the same dollars in QQQ', () => {
  const result = buildStockReturnComparison(stockDetail(), qqqRows(), stockRawRows());
  const afterBuy = result.trend.find((point) => point.date === '2026-06-10');

  assert.equal(afterBuy.stockHeldShares, 20);
  assert.equal(afterBuy.stockAvgCostUsd, 110);
  assert.equal(afterBuy.stockBasisUsd, 2_200);
  assert.equal(afterBuy.stockPnlUsd, 400);
  assertClose(afterBuy.stockPnlPct, 400 / 2_200);
  assertClose(afterBuy.benchmarkHeldShares, 10 + (1_200 / 110));
  assert.equal(afterBuy.benchmarkBasisUsd, 2_200);
  assertClose(afterBuy.benchmarkPnlUsd, 100);
});

test('a partial sell mirrors the pre-sale holding ratio and uses diluted cost on both sides', () => {
  const result = buildStockReturnComparison(stockDetail(), qqqRows(), stockRawRows());
  const afterSell = result.trend.find((point) => point.date === '2026-06-19');

  // Stock: average cost 110, sell 5 at 150 => realized +200. The remaining
  // accounting cost is 1,650 and the diluted return basis is 1,450.
  assert.equal(afterSell.stockHeldShares, 15);
  assert.equal(afterSell.stockAvgCostUsd, 110);
  assert.equal(afterSell.stockRealizedPnlUsd, 200);
  assert.equal(afterSell.stockBasisUsd, 1_450);
  assert.equal(afterSell.stockPnlUsd, 650);
  assertClose(afterSell.stockPnlPct, 650 / 1_450);

  // Five of twenty stock shares is 25%, so exactly 25% of the QQQ holding is
  // sold too. Its realized gain also dilutes the remaining QQQ basis.
  assertClose(afterSell.benchmarkHeldShares, (10 + (1_200 / 110)) * 0.75);
  assertClose(afterSell.benchmarkRealizedPnlUsd, 82.5);
  assertClose(afterSell.benchmarkBasisUsd, 1_567.5);
  assertClose(afterSell.benchmarkPnlUsd, 330);
  assertClose(afterSell.benchmarkPnlPct, 330 / 1_567.5);
  assertClose(afterSell.excessPnlUsd, 320);
});

test('final amounts and percentages remain cash-flow matched after add and trim', () => {
  const result = buildStockReturnComparison(stockDetail(), qqqRows(), stockRawRows());

  assert.equal(result.stockPnlUsd, 800);
  assert.equal(result.periodBasisUsd, 1_450);
  assertClose(result.stockPnlPct, 800 / 1_450);
  assertClose(result.benchmarkPnlUsd, 502.5);
  assertClose(result.benchmarkBasisUsd, 1_567.5);
  assertClose(result.benchmarkPnlPct, 502.5 / 1_567.5);
  assertClose(result.excessPnlUsd, 297.5);
  assertClose(result.excessPnlPct, (800 / 1_450) - (502.5 / 1_567.5));
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
  assertClose(result.stockPnlUsd, 60.5);
  assertClose(result.stockPnlPct, 60.5 / 99.5);
  assertClose(result.benchmarkPnlUsd, 50);
  assertClose(result.benchmarkPnlPct, 1);
  assertClose(result.excessPnlUsd, 10.5);
  assertClose(result.excessPnlPct, (60.5 / 99.5) - 1);
  assert.ok(result.excessPnlUsd > 0 && result.excessPnlPct < 0);
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
  assert.equal(result.initialPrincipalUsd, 1_000);
  assert.equal(result.stockBaselineRawClose, 100);
  assert.equal(result.stockSnapshotRawClose, 150);
  assert.equal(result.trend.find((point) => point.date === '2026-06-10').stockRawClose, 130);
  assert.equal(result.stockPnlUsd, 800);
  assertClose(result.stockPnlPct, 800 / 1_450);
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

test('uses rawClose only and requires exact QQQ closes for later cash flows', () => {
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

test('keeps dollar P&L but returns null percentages when realized profit exhausts diluted basis', () => {
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
  assert.equal(result.stockPnlUsd, 2_000);
  assert.equal(result.periodBasisUsd, -1_700);
  assert.equal(result.stockPnlPct, null);
  assert.equal(result.excessPnlPct, null);
});

test('full liquidation clamps both ledgers to zero shares without division artifacts', () => {
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

  assert.equal(result.available, true);
  const last = result.trend.at(-1);
  assert.equal(last.stockHeldShares, 0);
  assert.equal(last.benchmarkHeldShares, 0);
  assert.equal(Number.isFinite(last.stockPnlUsd), true);
  assert.equal(last.stockPnlPct, null);
  assert.equal(last.benchmarkPnlPct, null);
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

test('honors created-at order for same-day add and trim cash flows', () => {
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
  assert.equal(latest.stockRealizedPnlUsd, 750);
  assert.equal(latest.stockBasisUsd, 1_500);
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
      { snapshotDate: '2026-07-04', symbol: 'NVDA', heldShares: 10, currentPriceUsd: 160, marketValueUsd: 1600 },
      { snapshotDate: '2026-07-08', symbol: 'NVDA', heldShares: 10, currentPriceUsd: 170, marketValueUsd: 1700 },
    ],
    range: 'all',
    now: new Date('2026-07-08T22:00:00.000Z'),
  });
  const result = buildStockReturnComparison(view, [
    { date: '2026-07-01', rawClose: 100 },
    { date: '2026-07-04', rawClose: 105 },
    { date: '2026-07-08', rawClose: 110 },
  ], [
    { date: '2026-07-01', rawClose: 150 },
    { date: '2026-07-04', rawClose: 160 },
    { date: '2026-07-08', rawClose: 170 },
  ]);

  assert.equal(view.comparisonPositionStartDate, '2026-07-01');
  assert.deepEqual(view.comparisonTrades.map((trade) => trade.id), ['new-buy', 'new-add']);
  assert.equal(result.available, true);
  assert.equal(result.baselineDate, '2026-07-01');
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
