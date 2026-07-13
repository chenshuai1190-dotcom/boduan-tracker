import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStockDetailViewModel } from '../src/lib/stockDetailViewModel.js';

test('builds read-only stock detail with trade stats and sell realized P&L', () => {
  const detail = buildStockDetailViewModel({
    symbol: 'NVDA',
    stockTrades: [
      { id: '1', trade_date: '2026-07-04', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', shares: 10, price: 100 },
      { id: '2', trade_date: '2026-07-08', symbol: 'NVDA', name: 'NVIDIA', side: 'sell', shares: 2, price: 130 },
    ],
    symbolSnapshots: [
      {
        snapshotDate: '2026-07-07',
        symbol: 'NVDA',
        name: 'NVIDIA',
        heldShares: 10,
        avgCostUsd: 100,
        currentPriceUsd: 110,
        marketValueUsd: 1100,
        realizedPnlUsd: 0,
        unrealizedPnlUsd: 100,
        cumulativePnlUsd: 100,
        dailyPnlUsd: 100,
        totalBuyCostUsd: 1000,
      },
      {
        snapshotDate: '2026-07-08',
        symbol: 'NVDA',
        name: 'NVIDIA',
        heldShares: 8,
        avgCostUsd: 100,
        currentPriceUsd: 118,
        marketValueUsd: 944,
        realizedPnlUsd: 60,
        unrealizedPnlUsd: 144,
        cumulativePnlUsd: 204,
        dailyPnlUsd: 104,
        totalBuyCostUsd: 1000,
        sellProceedsUsd: 260,
      },
    ],
    range: 'ytd',
    now: new Date('2026-07-08T22:00:00.000Z'),
  });

  assert.equal(detail.hasData, true);
  assert.equal(detail.periodPnlUsd, 204);
  assert.equal(Number(detail.periodPnlPct.toFixed(3)), 0.204);
  assert.equal(detail.periodBasisUsd, 1000);
  assert.equal(detail.benchmarkBaselineDate, '2026-07-04');
  assert.equal(detail.benchmarkBaselineMode, 'on_or_after');
  assert.equal(detail.benchmarkEndDate, '2026-07-08');
  assert.equal(detail.benchmarkQueryStartDate, '2026-07-04');
  assert.equal(detail.benchmarkQueryEndDate, '2026-07-08');
  assert.equal(detail.comparisonPositionStartDate, '2026-07-04');
  assert.equal(detail.comparisonTrend.length, 2);
  assert.equal(detail.comparisonTrend[0].holdingPnlUsd, 100);
  assert.equal(detail.comparisonTrend[1].avgCostUsd, 100);
  assert.equal(detail.comparisonTrend[1].activeRealizedPnlUsd, 60);
  assert.equal(detail.comparisonTrend[1].effectiveCostUsd, 92.5);
  assert.equal(detail.comparisonTrend[1].holdingPnlUsd, 204);
  assert.equal(detail.realizedPnlUsd, 60);
  assert.equal(detail.unrealizedPnlUsd, 144);
  assert.equal(detail.heldShares, 8);
  assert.equal(detail.holdingStartDate, '2026-07-04');
  assert.equal(detail.holdingDays, 5);
  assert.equal(detail.stats.buyAmountUsd, 1000);
  assert.equal(detail.stats.sellAmountUsd, 260);
  assert.equal(detail.stats.buyCount, 1);
  assert.equal(detail.stats.sellCount, 1);
  assert.equal(detail.tradeRecords[0].side, 'sell');
  assert.equal(detail.tradeRecords[0].realizedPnlUsd, 60);
  assert.equal(detail.trend.length, 2);
  assert.equal(detail.trend[1].dailyPnlUsd, 104);
  assert.equal(detail.trend[1].marketValueUsd, 944);
  assert.equal(detail.trend[1].closePriceUsd, 118);
  assert.equal(Number(detail.trend[1].returnPct.toFixed(3)), 0.204);
  assert.equal(detail.trendStats.peakPnlUsd, 204);
  assert.equal(detail.trendStats.maxGivebackUsd, 0);
  assert.equal(detail.trendStats.maxDrawdownUsd, 0);
  assert.equal(detail.trendStats.drawdownRate, 0);
  assert.equal(detail.trendStats.givebackRate, 0);
  assert.equal(detail.tradeEvents.length, 2);
  assert.equal(detail.tradeEvents[0].side, 'sell');
  assert.equal(detail.tradeEvents[0].markerDate, '2026-07-08');
  assert.equal(detail.tradeEvents[1].side, 'buy');
  assert.equal(detail.tradeEvents[1].markerDate, '2026-07-07');
});

test('separates stock detail giveback from net-asset drawdown rate', () => {
  const detail = buildStockDetailViewModel({
    symbol: 'NVDA',
    stockTrades: [
      { id: '1', trade_date: '2026-01-02', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 },
    ],
    symbolSnapshots: [
      {
        snapshotDate: '2026-05-01',
        symbol: 'NVDA',
        cumulativePnlUsd: 100,
        marketValueUsd: 1100,
        remainingCostUsd: 1000,
        totalBuyCostUsd: 1000,
      },
      {
        snapshotDate: '2026-06-04',
        symbol: 'NVDA',
        cumulativePnlUsd: 300,
        marketValueUsd: 1300,
        remainingCostUsd: 1000,
        totalBuyCostUsd: 1000,
      },
      {
        snapshotDate: '2026-07-08',
        symbol: 'NVDA',
        cumulativePnlUsd: 120,
        marketValueUsd: 1120,
        remainingCostUsd: 1000,
        totalBuyCostUsd: 1000,
      },
    ],
    range: 'all',
    now: new Date('2026-07-08T22:00:00.000Z'),
  });

  assert.equal(detail.trendStats.peakPnlUsd, 300);
  assert.equal(detail.trendStats.maxGivebackUsd, -180);
  assert.equal(detail.trendStats.maxDrawdownUsd, -180);
  assert.equal(Number(detail.trendStats.drawdownRate.toFixed(3)), -0.138);
  assert.equal(Number(detail.trendStats.maxDrawdownPct.toFixed(3)), -0.138);
  assert.equal(Number(detail.trendStats.givebackRate.toFixed(3)), 0.6);
});

test('uses baseline snapshot for older holdings in selected ranges', () => {
  const detail = buildStockDetailViewModel({
    symbol: 'MSFT',
    stockTrades: [
      { id: '1', trade_date: '2025-11-10', symbol: 'MSFT', side: 'buy', shares: 10, price: 100 },
    ],
    symbolSnapshots: [
      {
        snapshotDate: '2025-12-31',
        symbol: 'MSFT',
        cumulativePnlUsd: 200,
        marketValueUsd: 1200,
        remainingCostUsd: 1000,
        totalBuyCostUsd: 1000,
      },
      {
        snapshotDate: '2026-07-08',
        symbol: 'MSFT',
        heldShares: 10,
        avgCostUsd: 100,
        cumulativePnlUsd: 650,
        unrealizedPnlUsd: 650,
        marketValueUsd: 1650,
        remainingCostUsd: 1000,
        totalBuyCostUsd: 1000,
      },
    ],
    range: 'ytd',
    now: new Date('2026-07-08T22:00:00.000Z'),
  });

  assert.equal(detail.startDate, '2026/01/01');
  assert.equal(detail.periodPnlUsd, 450);
  assert.equal(Number(detail.periodPnlPct.toFixed(3)), 0.375);
  assert.equal(detail.periodBasisUsd, 1200);
  assert.equal(detail.benchmarkBaselineDate, '2026-01-01');
  assert.equal(detail.benchmarkBaselineMode, 'on_or_after');
  assert.equal(detail.benchmarkEndDate, '2026-07-08');
});

test('keeps closed positions visible from symbol snapshots and trade ledger', () => {
  const detail = buildStockDetailViewModel({
    symbol: 'TSM',
    stockTrades: [
      { id: '1', trade_date: '2026-03-01', symbol: 'TSM', side: 'buy', shares: 10, price: 100 },
      { id: '2', trade_date: '2026-07-01', symbol: 'TSM', side: 'sell', shares: 10, price: 130 },
    ],
    symbolSnapshots: [
      {
        snapshotDate: '2026-07-08',
        symbol: 'TSM',
        name: 'TSMC',
        heldShares: 0,
        avgCostUsd: 0,
        currentPriceUsd: 132,
        marketValueUsd: 0,
        realizedPnlUsd: 300,
        unrealizedPnlUsd: 0,
        cumulativePnlUsd: 300,
        totalBuyCostUsd: 1000,
        sellProceedsUsd: 1300,
        isOpen: false,
      },
    ],
    range: 'all',
    now: new Date('2026-07-08T22:00:00.000Z'),
  });

  assert.equal(detail.hasData, true);
  assert.equal(detail.heldShares, 0);
  assert.equal(detail.unrealizedPnlUsd, 0);
  assert.equal(detail.realizedPnlUsd, 300);
  assert.equal(detail.periodPnlUsd, 300);
  assert.equal(detail.tradeRecords.length, 2);
  assert.equal(detail.tradeRecords[0].realizedPnlUsd, 300);
  assert.equal(detail.holdingStartDate, null);
  assert.equal(detail.holdingDays, null);
});

test('stock detail holding period resets after a full close and rebuy', () => {
  const detail = buildStockDetailViewModel({
    symbol: 'NVDA',
    stockTrades: [
      { id: '1', trade_date: '2026-05-01', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 },
      { id: '2', trade_date: '2026-06-01', symbol: 'NVDA', side: 'sell', shares: 10, price: 130 },
      { id: '3', trade_date: '2026-07-01', symbol: 'NVDA', side: 'buy', shares: 5, price: 150 },
      { id: '4', trade_date: '2026-07-04', symbol: 'NVDA', side: 'buy', shares: 2, price: 155 },
    ],
    symbolSnapshots: [
      {
        snapshotDate: '2026-07-09',
        symbol: 'NVDA',
        heldShares: 7,
        avgCostUsd: 151.428571,
        currentPriceUsd: 180,
        marketValueUsd: 1260,
        realizedPnlUsd: 300,
        unrealizedPnlUsd: 200,
        cumulativePnlUsd: 500,
        totalBuyCostUsd: 1810,
      },
    ],
    range: 'all',
    now: new Date('2026-07-09T22:00:00.000Z'),
  });

  assert.equal(detail.holdingStartDate, '2026-07-01');
  assert.equal(detail.holdingDays, 9);
  assert.equal(detail.comparisonPositionStartDate, '2026-07-01');
  assert.deepEqual(detail.comparisonTrades.map((trade) => trade.date), ['2026-07-01', '2026-07-04']);
  assert.equal(detail.comparisonTrend[0].activeRealizedPnlUsd, 0);
  assert.equal(Number(detail.comparisonTrend[0].avgCostUsd.toFixed(6)), 151.428571);
  assert.equal(detail.comparisonTrend[0].holdingPnlUsd, 200);
});

test('comparison ledger uses moving-average buys and diluted cost after a partial sell', () => {
  const detail = buildStockDetailViewModel({
    symbol: 'NVDA',
    stockTrades: [
      { id: '1', trade_date: '2026-06-01', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 },
      { id: '2', trade_date: '2026-06-10', symbol: 'NVDA', side: 'buy', shares: 10, price: 120 },
      { id: '3', trade_date: '2026-06-19', symbol: 'NVDA', side: 'sell', shares: 5, price: 150 },
    ],
    symbolSnapshots: [
      { snapshotDate: '2026-06-01', symbol: 'NVDA', heldShares: 10, currentPriceUsd: 100, marketValueUsd: 1000 },
      { snapshotDate: '2026-06-10', symbol: 'NVDA', heldShares: 20, currentPriceUsd: 120, marketValueUsd: 2400 },
      { snapshotDate: '2026-06-19', symbol: 'NVDA', heldShares: 15, currentPriceUsd: 140, marketValueUsd: 2100 },
    ],
    range: 'all',
    now: new Date('2026-06-19T22:00:00.000Z'),
  });

  const latestPoint = detail.comparisonTrend.at(-1);
  assert.equal(detail.benchmarkBaselineDate, '2026-06-01');
  assert.equal(detail.benchmarkBaselineMode, 'on_or_after');
  assert.equal(latestPoint.heldShares, 15);
  assert.equal(latestPoint.avgCostUsd, 110);
  assert.equal(latestPoint.remainingCostUsd, 1650);
  assert.equal(latestPoint.activeRealizedPnlUsd, 200);
  assert.equal(latestPoint.effectiveRemainingCostUsd, 1450);
  assert.equal(Number(latestPoint.effectiveCostUsd.toFixed(6)), 96.666667);
  assert.equal(latestPoint.holdingPnlUsd, 650);
  assert.equal(latestPoint.returnCostBasisUsd, 1450);
});

test('comparison fails closed when the formal trade replay disagrees with a personal snapshot', () => {
  const detail = buildStockDetailViewModel({
    symbol: 'NVDA',
    stockTrades: [
      { id: '1', trade_date: '2026-06-01', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 },
      { id: '2', trade_date: '2026-06-10', symbol: 'NVDA', side: 'buy', shares: 10, price: 120 },
    ],
    symbolSnapshots: [
      { snapshotDate: '2026-06-01', symbol: 'NVDA', heldShares: 10, currentPriceUsd: 100, marketValueUsd: 1000 },
      { snapshotDate: '2026-06-10', symbol: 'NVDA', heldShares: 19, currentPriceUsd: 120, marketValueUsd: 2280 },
    ],
    range: 'all',
    now: new Date('2026-06-10T22:00:00.000Z'),
  });

  assert.equal(detail.comparisonIntegrityReason, 'stock_trade_snapshot_mismatch');
  assert.deepEqual(detail.comparisonTrend, []);
  assert.equal(detail.benchmarkQueryEndDate, null);
});

test('comparison preserves canonical created-at order for same-day buys and sells', () => {
  const detail = buildStockDetailViewModel({
    symbol: 'NVDA',
    stockTrades: [
      { id: 'sell', trade_date: '2026-06-10', created_at: '2026-06-10T15:00:00Z', symbol: 'NVDA', side: 'sell', shares: 5, price: 300 },
      { id: 'base', trade_date: '2026-06-01', created_at: '2026-06-01T15:00:00Z', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 },
      { id: 'buy', trade_date: '2026-06-10', created_at: '2026-06-10T14:00:00Z', symbol: 'NVDA', side: 'buy', shares: 10, price: 200 },
    ],
    symbolSnapshots: [
      { snapshotDate: '2026-06-01', symbol: 'NVDA', heldShares: 10, currentPriceUsd: 100, marketValueUsd: 1000 },
      { snapshotDate: '2026-06-10', symbol: 'NVDA', heldShares: 15, currentPriceUsd: 300, marketValueUsd: 4500 },
    ],
    range: 'all',
    now: new Date('2026-06-10T22:00:00.000Z'),
  });

  assert.deepEqual(detail.comparisonTrades.map((trade) => trade.id), ['base', 'buy', 'sell']);
  assert.deepEqual(detail.comparisonTrades.map((trade) => trade.createdAt), [
    '2026-06-01T15:00:00Z',
    '2026-06-10T14:00:00Z',
    '2026-06-10T15:00:00Z',
  ]);
  assert.equal(detail.comparisonTrend.at(-1).avgCostUsd, 150);
  assert.equal(detail.comparisonTrend.at(-1).activeRealizedPnlUsd, 750);
});

test('comparison keeps dollar P&L but no percentage basis after sale profit fully dilutes cost', () => {
  const detail = buildStockDetailViewModel({
    symbol: 'NVDA',
    stockTrades: [
      { id: '1', trade_date: '2026-06-01', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 },
      { id: '2', trade_date: '2026-06-10', symbol: 'NVDA', side: 'sell', shares: 9, price: 300 },
    ],
    symbolSnapshots: [
      { snapshotDate: '2026-06-01', symbol: 'NVDA', heldShares: 10, currentPriceUsd: 100, marketValueUsd: 1000 },
      { snapshotDate: '2026-06-10', symbol: 'NVDA', heldShares: 1, currentPriceUsd: 300, marketValueUsd: 300 },
    ],
    range: 'all',
    now: new Date('2026-06-10T22:00:00.000Z'),
  });

  const latestPoint = detail.comparisonTrend.at(-1);
  assert.equal(latestPoint.holdingPnlUsd, 2000);
  assert.equal(latestPoint.effectiveRemainingCostUsd, -1700);
  assert.equal(latestPoint.returnCostBasisUsd, null);
  assert.equal(latestPoint.holdingPnlPct, null);
});
