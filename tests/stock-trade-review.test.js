import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockDetailViewModel } from '../src/lib/stockDetailViewModel.js';
import {
  calculateTotalPnL, calculateMFE, calculateMAE, calculateProfitCapture,
  calculateMaxDrawdown, buildTradeMarkers, filterReviewRange, defaultReviewRange,
} from '../src/lib/stockTradeReview.js';

const symbol = 'TEST';
const trade = (id, date, side, shares, price, extra = {}) => ({ id, symbol, trade_date: date, side, shares, price, ...extra });
const snapshot = (date, shares, price, extra = {}) => ({
  symbol, snapshotDate: date, heldShares: shares, currentPriceUsd: price, marketValueUsd: shares * price, ...extra,
});
function fixture() {
  return {
    symbol, now: new Date('2026-06-05T22:00:00Z'),
    stockTrades: [
      trade('old-buy', '2026-05-01', 'buy', 10, 50),
      trade('old-sell', '2026-05-05', 'sell', 10, 60),
      trade('buy', '2026-06-01', 'buy', 10, 100),
      trade('add', '2026-06-03', 'buy', 10, 120),
      trade('trim', '2026-06-04', 'sell', 5, 150),
    ],
    symbolSnapshots: [
      snapshot('2026-05-05', 0, 60, { cumulativePnlUsd: 100 }),
      snapshot('2026-06-01', 10, 110, { realizedPnlUsd: 100, unrealizedPnlUsd: 100, cumulativePnlUsd: 200 }),
      snapshot('2026-06-03', 20, 140, { realizedPnlUsd: 100, unrealizedPnlUsd: 600, cumulativePnlUsd: 700 }),
      snapshot('2026-06-04', 15, 130, { realizedPnlUsd: 300, unrealizedPnlUsd: 300, cumulativePnlUsd: 600 }),
    ],
  };
}

test('a consistently split-normalized ledger preserves economic returns and the equity curve', () => {
  const original = fixture();
  const normalized = {
    ...original,
    stockTrades: original.stockTrades.map(row => ({ ...row, shares: row.shares * 4, price: row.price / 4 })),
    symbolSnapshots: original.symbolSnapshots.map(row => ({ ...row, heldShares: row.heldShares * 4, currentPriceUsd: row.currentPriceUsd / 4 })),
  };
  const before = buildStockDetailViewModel(original).cycleReview;
  const after = buildStockDetailViewModel(normalized).cycleReview;
  assert.equal(after.available, true);
  assert.deepEqual(after.trend.map(row => [row.date, row.totalPnlUsd, row.returnPct, row.marketValueUsd]), before.trend.map(row => [row.date, row.totalPnlUsd, row.returnPct, row.marketValueUsd]));
  assert.equal(after.breakEvenPriceUsd, before.breakEvenPriceUsd / 4);
  assert.deepEqual(calculateMFE(after.trend), calculateMFE(before.trend));
  assert.deepEqual(calculateMaxDrawdown(after.trend.map(row => ({ date: row.date, equity: row.marketValueUsd }))), calculateMaxDrawdown(before.trend.map(row => ({ date: row.date, equity: row.marketValueUsd }))));
});

test('cycle review reuses moving-average accounting across adds and partial sales without prior-cycle profit', () => {
  const view = buildStockDetailViewModel(fixture());
  const review = view.cycleReview;
  assert.equal(view.periodPnlUsd, 600, 'existing all-history result remains unchanged');
  assert.equal(review.available, true);
  assert.equal(review.startDate, '2026-06-01');
  assert.equal(review.endDate, '2026-06-04');
  assert.equal(review.holdingDays, 4);
  assert.equal(review.currentTotalPnlUsd, 500);
  assert.equal(review.realizedPnlUsd, 200);
  assert.equal(review.unrealizedPnlUsd, 300);
  assert.equal(review.totalBuyCostUsd, 2200);
  assert.equal(review.returnPct, 500 / 2200);
  assert.equal(review.avgCostUsd, 110);
  assert.equal(review.breakEvenPriceUsd, 1450 / 15);
  assert.deepEqual(review.trend.map(point => point.totalPnlUsd), [100, 600, 500]);
  assert.deepEqual(review.tradeRecords.map(record => [record.id, record.heldSharesAfter]), [['buy', 10], ['add', 20], ['trim', 15]]);
  assert.deepEqual(buildStockDetailViewModel({ ...fixture(), range: '1m' }).cycleReview, review, 'chart range cannot change the holding cycle');
});

test('selling part of a position at an unchanged mark transfers floating profit to realized profit without a total-profit drop', () => {
  const data = fixture();
  data.stockTrades.at(-1).price = 140;
  data.symbolSnapshots[data.symbolSnapshots.length - 1] = snapshot('2026-06-04', 15, 140);
  const review = buildStockDetailViewModel(data).cycleReview;
  assert.equal(review.available, true);
  assert.equal(review.trend.at(-2).marketValueUsd, 2800);
  assert.equal(review.trend.at(-1).marketValueUsd, 2100);
  assert.equal(review.unrealizedPnlUsd, 450);
  assert.equal(review.realizedPnlUsd, 150);
  assert.equal(review.currentTotalPnlUsd, review.trend.at(-2).totalPnlUsd);
  assert.equal(Object.hasOwn(review, 'maxDrawdownPct'), false, 'cash-flow-ambiguous equity is not silently derived');
});

test('closing ends the active cycle and a later reopening starts fresh', () => {
  const data = fixture();
  data.stockTrades.push(trade('close', '2026-06-05', 'sell', 15, 130));
  data.symbolSnapshots.push(snapshot('2026-06-05', 0, 130));
  const closed = buildStockDetailViewModel(data).cycleReview;
  assert.equal(closed.available, false);
  assert.equal(closed.reason, 'no_active_cycle');
  assert.equal(closed.currentTotalPnlUsd, null);
  assert.deepEqual(closed.trend, []);
  data.stockTrades.push(trade('reopen', '2026-07-02', 'buy', 3, 50));
  data.symbolSnapshots.push(snapshot('2026-07-02', 3, 60, { realizedPnlUsd: 600, cumulativePnlUsd: 630 }));
  data.now = new Date('2026-07-02T22:00:00Z');
  const reopened = buildStockDetailViewModel(data).cycleReview;
  assert.equal(reopened.available, true);
  assert.equal(reopened.startDate, '2026-07-02');
  assert.equal(reopened.holdingDays, 1);
  assert.equal(reopened.currentTotalPnlUsd, 30);
  assert.equal(reopened.realizedPnlUsd, 0);
  assert.equal(reopened.totalBuyCostUsd, 150);
  assert.deepEqual(reopened.tradeRecords.map(record => record.id), ['reopen']);
});

test('same-day unsnapshotted trades remain records without changing completed-close review numbers', () => {
  const data = fixture();
  const before = buildStockDetailViewModel(data).cycleReview;
  data.stockTrades.push(trade('today', '2026-06-05', 'sell', 2, 150));
  data.stockTrades.push(trade('future', '2026-06-08', 'buy', 2, 150));
  const after = buildStockDetailViewModel(data).cycleReview;
  assert.equal(after.currentTotalPnlUsd, before.currentTotalPnlUsd);
  assert.deepEqual(after.trend, before.trend);
  assert.equal(after.tradeRecords.at(-1).id, 'today');
  assert.equal(after.tradeRecords.at(-1).heldSharesAfter, 13);
  const markers = buildTradeMarkers(after.tradeRecords, after.trend);
  assert.equal(markers.at(-1).date, '2026-06-05');
  assert.equal(markers.at(-1).markerDate, null);
});

test('same-day liquidation and reopening excludes earlier-cycle records by ledger order rather than date alone', () => {
  const review = buildStockDetailViewModel({
    symbol, now: new Date('2026-06-03T22:00:00Z'),
    stockTrades: [
      trade('old', '2026-06-01', 'buy', 10, 100),
      trade('close', '2026-06-03', 'sell', 10, 120, { created_at: '2026-06-03T14:00:00Z' }),
      trade('new', '2026-06-03', 'buy', 4, 125, { created_at: '2026-06-03T15:00:00Z' }),
    ],
    symbolSnapshots: [snapshot('2026-06-01', 10, 100), snapshot('2026-06-03', 4, 130)],
  }).cycleReview;
  assert.equal(review.available, true);
  assert.equal(review.currentTotalPnlUsd, 20);
  assert.equal(review.realizedPnlUsd, 0);
  assert.deepEqual(review.tradeRecords.map(record => record.id), ['new']);
  assert.deepEqual(buildTradeMarkers(review.tradeRecords, review.trend).map(marker => marker.side), ['buy']);
});

test('added heldSharesAfter preserves the original fee-aware trade-record computation', () => {
  const view = buildStockDetailViewModel({
    symbol, now: new Date('2026-06-03T22:00:00Z'),
    stockTrades: [trade('buy', '2026-06-01', 'buy', 10, 100, { fee: 10 }), trade('sell', '2026-06-03', 'sell', 4, 120, { fee: 2 })],
    symbolSnapshots: [snapshot('2026-06-01', 10, 100), snapshot('2026-06-03', 6, 120)],
  });
  assert.equal(view.tradeRecords[0].realizedPnlUsd, 74);
  assert.equal(view.tradeRecords[0].heldSharesAfter, 6);
  assert.equal(view.cycleReview.currentTotalPnlUsd, 200, 'review retains the existing snapshot/comparison fee-excluded basis');
});

test('missing, invalid or mismatched snapshots cannot create fabricated zero review metrics', () => {
  for (const [field, value] of [['marketValueUsd', null], ['currentPriceUsd', undefined], ['currentPriceUsd', 0], ['heldShares', null], ['marketValueUsd', NaN], ['marketValueUsd', 999]]) {
    const data = fixture();
    data.symbolSnapshots[2][field] = value;
    const review = buildStockDetailViewModel(data).cycleReview;
    assert.equal(review.available, false, `${field}=${value}`);
    assert.equal(review.currentTotalPnlUsd, null);
    assert.equal(review.returnPct, null);
    assert.deepEqual(review.trend, []);
  }
  const splitMismatch = fixture();
  splitMismatch.symbolSnapshots[2] = snapshot('2026-06-03', 40, 70);
  const mismatch = buildStockDetailViewModel(splitMismatch);
  assert.equal(mismatch.comparisonIntegrityReason, 'stock_trade_snapshot_mismatch');
  assert.equal(mismatch.cycleReview.available, false);
  assert.equal(mismatch.cycleReview.reason, 'stock_trade_snapshot_mismatch');
  assert.equal(buildStockDetailViewModel({ symbol }).cycleReview.available, false);
});

test('profit excursions retain observed extrema while one-sided histories report no opposite excursion', () => {
  const points = [
    { date: '2026-06-01', totalPnlUsd: -100 }, { date: '2026-06-03', totalPnlUsd: 300 },
    { date: '2026-06-04', totalPnlUsd: 120 },
  ];
  assert.equal(calculateTotalPnL(40, -50), -10);
  assert.equal(calculateTotalPnL(0, 0), 0);
  for (const bad of [null, undefined, NaN, Infinity, '', '1']) assert.equal(calculateTotalPnL(bad, 1), null);
  assert.deepEqual(calculateMFE(points), { valueUsd: 300, date: '2026-06-03', observedValue: 300, observedDate: '2026-06-03' });
  assert.deepEqual(calculateMAE(points), { valueUsd: -100, date: '2026-06-01', observedValue: -100, observedDate: '2026-06-01' });
  assert.deepEqual(calculateMFE(points.slice(0, 1)), {
    valueUsd: 0, date: null, observedValue: -100, observedDate: '2026-06-01',
  }, 'all-loss observations have no favorable excursion, while their actual peak stays available');
  assert.deepEqual(calculateMAE(points.slice(1)), {
    valueUsd: 0, date: null, observedValue: 120, observedDate: '2026-06-04',
  }, 'all-profit observations must not be labelled a positive maximum loss');
  assert.deepEqual(calculateMFE([{ date: '2026-06-01', totalPnlUsd: 0 }]), {
    valueUsd: 0, date: null, observedValue: 0, observedDate: '2026-06-01',
  });
  assert.equal(calculateProfitCapture(120, 300), 0.4);
  assert.equal(calculateProfitCapture(-30, 300), -0.1);
  assert.equal(calculateProfitCapture(0, 300), 0);
  assert.equal(calculateProfitCapture(-30, 0), null);
  for (const bad of [[], [...points, { date: '2026-06-05', totalPnlUsd: null }], [...points].reverse()]) {
    assert.equal(calculateMFE(bad), null);
    assert.equal(calculateMAE(bad), null);
  }
});

test('maximum equity drawdown selects percentage depth instead of the largest dollar loss', () => {
  const result = calculateMaxDrawdown([
    { date: '2026-06-01', equity: 100 }, { date: '2026-06-02', equity: 50 },
    { date: '2026-06-03', equity: 1000 }, { date: '2026-06-04', equity: 800 },
  ]);
  assert.deepEqual(result, { drawdownPct: -0.5, drawdownUsd: -50, peakDate: '2026-06-01', troughDate: '2026-06-02' });
  assert.equal(calculateMaxDrawdown([{ date: '2026-06-01', equity: 100 }, { date: '2026-06-02', equity: 120 }]).drawdownPct, 0);
  assert.deepEqual(calculateMaxDrawdown([{ date: '2026-06-01', equity: 100 }, { date: '2026-06-02', equity: 0 }]), {
    drawdownPct: -1, drawdownUsd: -100, peakDate: '2026-06-01', troughDate: '2026-06-02',
  }, 'zero equity after a positive peak records a complete loss');
  for (const bad of [[], [{ date: '2026-06-01', equity: 0 }], [{ date: '2026-06-01', equity: -1 }],
    [{ date: '2026-06-01', price: 100 }], [{ date: '2026-06-01', totalPnlUsd: 100 }],
    [{ date: '2026-06-01', equity: null }], [{ date: '2026-02-30', equity: 100 }],
    [{ date: '2026-06-01', equity: 100 }, { date: '2026-06-01', equity: 90 }]]) assert.equal(calculateMaxDrawdown(bad), null);
});

test('trade markers combine exact same-day records and never move unmatched executions to another day', () => {
  const records = [
    { id: 'one', date: '2026-06-01', side: 'buy', shares: 10, price: 100 },
    { id: 'two', date: '2026-06-01', side: 'sell', shares: 2, price: 110 },
    { id: 'three', date: '2026-06-02', side: 'buy', shares: 1, price: 100 },
  ];
  const markers = buildTradeMarkers(records, [{ date: '2026-06-01' }, { date: '2026-06-03' }]);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].side, 'mixed');
  assert.equal(markers[0].markerDate, '2026-06-01');
  assert.deepEqual(markers[0].records, records.slice(0, 2));
  assert.equal(markers[0].buyAmountUsd, 1000);
  assert.equal(markers[0].sellAmountUsd, 220);
  assert.equal(markers[1].date, '2026-06-02');
  assert.equal(markers[1].markerDate, null);
  assert.equal(markers[1].side, 'buy');
});

test('range filtering preserves original values without rebasing and picks the smallest complete supported window', () => {
  const points = ['2025-08-28', '2025-11-28', '2026-02-28', '2026-03-31'].map((date, index) => Object.freeze({ date, totalPnlUsd: index * 100 }));
  Object.freeze(points);
  assert.deepEqual(filterReviewRange(points, '1m'), points.slice(2), 'month-end subtraction clamps to a real date');
  assert.equal(filterReviewRange(points, '1m')[0], points[2]);
  assert.deepEqual(filterReviewRange(points, 'all'), points);
  assert.equal(defaultReviewRange(points), 'all');
  assert.equal(defaultReviewRange(points.slice(1)), '6m');
  assert.equal(defaultReviewRange(points.slice(2)), '1m');
  assert.equal(defaultReviewRange([{ date: '2026-01-01' }, { date: '2026-03-01' }]), '3m');
  assert.deepEqual(filterReviewRange(points, '1y'), []);
  assert.deepEqual(filterReviewRange([...points].reverse(), 'all'), []);
  assert.equal(defaultReviewRange([]), 'all');
});
