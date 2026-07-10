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
});
