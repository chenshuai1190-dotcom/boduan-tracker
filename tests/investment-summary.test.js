import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveInvestmentSummary, derivePositionsFromTrades } from '../src/lib/investmentSummary.js';

const watchlist = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 120, high: 140, previousClose: 118, changePercent: 1.69 },
  { symbol: 'MSFT', name: 'Microsoft', price: 210, high: 240, previousClose: 205, changePercent: 2.44 },
];

test('derives active positions from buy and sell records with moving average cost', () => {
  const positions = derivePositionsFromTrades([
    { id: 1, symbol: 'AAPL', name: 'Apple Inc.', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
    { id: 2, symbol: 'AAPL', name: 'Apple Inc.', side: 'buy', date: '2026-01-02', price: 110, shares: 10 },
    { id: 3, symbol: 'AAPL', name: 'Apple Inc.', side: 'sell', date: '2026-01-03', price: 130, shares: 5 },
  ], watchlist);

  assert.equal(positions.length, 1);
  assert.equal(positions[0].heldShares, 15);
  assert.equal(positions[0].avgCost, 105);
  assert.equal(Number(positions[0].effectiveCost.toFixed(6)), Number((105 - 125 / 15).toFixed(6)));
  assert.equal(positions[0].remainingCost, 1575);
  assert.equal(Number(positions[0].effectiveRemainingCost.toFixed(6)), Number((1575 - 125).toFixed(6)));
  assert.equal(positions[0].realizedPnl, 125);
  assert.equal(positions[0].unrealizedPnl, 225);
  assert.equal(positions[0].activeRealizedPnl, 125);
  assert.equal(positions[0].holdingPnl, 350);
  assert.equal(positions[0].totalPnl, 350);
  assert.equal(positions[0].returnCostBasis, 1450);
  assert.equal(positions[0].totalPnlPct, 350 / 1450);
  assert.equal(positions[0].holdingPnlPct, 350 / 1450);
  assert.equal(positions[0].high, 140);
});

test('effective cost is diluted by realized sell profit for remaining shares', () => {
  const positions = derivePositionsFromTrades([
    { id: 1, symbol: 'NVDA', name: '英伟达', side: 'buy', date: '2026-01-01', price: 100, shares: 100 },
    { id: 2, symbol: 'NVDA', name: '英伟达', side: 'sell', date: '2026-01-02', price: 150, shares: 10 },
  ], [{ symbol: 'NVDA', name: '英伟达', price: 120, previousClose: 119 }]);

  assert.equal(positions.length, 1);
  assert.equal(positions[0].heldShares, 90);
  assert.equal(positions[0].avgCost, 100);
  assert.equal(positions[0].realizedPnl, 500);
  assert.equal(positions[0].activeRealizedPnl, 500);
  assert.equal(Number(positions[0].effectiveCost.toFixed(2)), 94.44);
  assert.equal(positions[0].effectiveRemainingCost, 8500);
  assert.equal(positions[0].holdingPnl, 2300);
  assert.equal(positions[0].returnCostBasis, 8500);
  assert.equal(positions[0].totalPnlPct, 2300 / 8500);
  assert.equal(positions[0].holdingPnlPct, 2300 / 8500);
});

test('active holding pnl resets after a full close and new buy cycle', () => {
  const positions = derivePositionsFromTrades([
    { id: 1, symbol: 'NVDA', name: '英伟达', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
    { id: 2, symbol: 'NVDA', name: '英伟达', side: 'sell', date: '2026-01-02', price: 150, shares: 10 },
    { id: 3, symbol: 'NVDA', name: '英伟达', side: 'buy', date: '2026-01-03', price: 200, shares: 10 },
  ], [{ symbol: 'NVDA', name: '英伟达', price: 220, previousClose: 219 }]);

  assert.equal(positions.length, 1);
  assert.equal(positions[0].heldShares, 10);
  assert.equal(positions[0].realizedPnl, 500);
  assert.equal(positions[0].activeRealizedPnl, 0);
  assert.equal(positions[0].unrealizedPnl, 200);
  assert.equal(positions[0].holdingPnl, 200);
  assert.equal(positions[0].totalPnl, 700);
  assert.equal(positions[0].effectiveCost, 200);
  assert.equal(positions[0].holdingPnlPct, 200 / 2000);
});

test('investment summary counts held stocks and sell records only', () => {
  const summary = deriveInvestmentSummary({
    trades: [
      { id: 1, symbol: 'AAPL', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
      { id: 2, symbol: 'AAPL', side: 'sell', date: '2026-01-02', price: 120, shares: 4 },
      { id: 3, symbol: 'MSFT', side: 'buy', date: '2026-01-03', price: 200, shares: 2 },
    ],
    watchlist,
    usdRate: 7.2,
  });

  assert.equal(summary.holdingStockCount, 2);
  assert.equal(summary.sellTradeCount, 1);
  assert.equal(summary.totalAssetsUsd, 1140);
  assert.equal(summary.totalAssetsCny, 8208);
  assert.equal(summary.todayPnl, 22);
  assert.equal(summary.todayPnlPct, 22 / 1118);
  assert.equal(summary.realizedPnl, 80);
  assert.equal(summary.unrealizedPnl, 140);
  assert.equal(summary.holdingPnl, 220);
  assert.equal(summary.cumulativePnl, 220);
  assert.equal(summary.returnCostBasis, 920);
  assert.equal(summary.cumulativePnlPct, 220 / 920);
});

test('investment summary can infer daily pnl from realtime change fields when previous close is missing', () => {
  const summary = deriveInvestmentSummary({
    stockTrades: [
      { id: 1, symbol: 'MSFT', name: '微软', side: 'buy', date: '2026-01-03', price: 380, shares: 2300 },
    ],
    watchlist: [
      { symbol: 'MSFT', name: '微软', price: 390.83, previousClose: 0, changePercent: 0.0827 },
    ],
    usdRate: 7.2,
  });

  assert.equal(Number(summary.activePositions[0].previousClose.toFixed(3)), 390.507);
  assert.equal(Number(summary.activePositions[0].todayPnl.toFixed(2)), 742.78);
  assert.equal(Number(summary.todayPnl.toFixed(2)), 742.78);
});

test('investment summary uses locked daily pnl price instead of postmarket display price', () => {
  const summary = deriveInvestmentSummary({
    stockTrades: [
      { id: 1, symbol: 'NVDA', name: '英伟达', side: 'buy', date: '2026-01-03', price: 179.78, shares: 7000 },
    ],
    watchlist: [
      {
        symbol: 'NVDA',
        name: '英伟达',
        price: 195.274,
        previousClose: 195.55,
        dailyPnlPrice: 195.55,
        dailyPnlBaselineClose: 194.8,
        dailyPnlPriceDate: '2026-07-06',
        dailyPnlBaselineDate: '2026-07-02',
        dailyPnlLocked: true,
        dailyPnlSession: 'post',
        changePercent: 0.2433,
      },
    ],
    usdRate: 7.2,
  });

  assert.equal(summary.activePositions[0].previousClose, 194.8);
  assert.equal(summary.activePositions[0].dailyBaselineClose, 194.8);
  assert.equal(summary.activePositions[0].dailyPnlPrice, 195.55);
  assert.equal(summary.activePositions[0].dailyPnlLocked, true);
  assert.equal(Number(summary.activePositions[0].marketValue.toFixed(2)), 1366918.00);
  assert.equal(Number(summary.activePositions[0].todayPnl.toFixed(2)), 5250.00);
  assert.equal(Number(summary.todayPnl.toFixed(2)), 5250.00);
  assert.equal(summary.todayPnlLocked, true);
});

test('investment summary marks daily pnl unavailable when the quote has no daily pnl price', () => {
  const summary = deriveInvestmentSummary({
    stockTrades: [
      { id: 1, symbol: 'NVDA', name: '英伟达', side: 'buy', date: '2026-01-03', price: 179.78, shares: 7000 },
    ],
    watchlist: [
      {
        symbol: 'NVDA',
        name: '英伟达',
        price: 195.274,
        previousClose: 195.55,
        dailyPnlPrice: 0,
        dailyPnlBaselineClose: 194.8,
      },
    ],
    usdRate: 7.2,
  });

  assert.equal(summary.activePositions[0].todayPnl, null);
  assert.equal(summary.activePositions[0].todayPnlPct, null);
  assert.equal(summary.activePositions[0].hasTodayPnl, false);
  assert.equal(summary.todayPnl, null);
  assert.equal(summary.todayPnlPct, null);
  assert.equal(summary.hasTodayPnl, false);
  assert.equal(summary.todayPnlUnavailableCount, 1);
});

test('cumulative return rate uses current effective cost after sells', () => {
  const summary = deriveInvestmentSummary({
    stockTrades: [
      { id: 1, symbol: 'AAPL', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
      { id: 2, symbol: 'AAPL', side: 'sell', date: '2026-01-02', price: 120, shares: 4 },
    ],
    watchlist: [
      { symbol: 'AAPL', name: 'Apple Inc.', price: 120, previousClose: 118 },
    ],
  });

  assert.equal(summary.totalAssetsUsd, 720);
  assert.equal(summary.realizedPnl, 80);
  assert.equal(summary.unrealizedPnl, 120);
  assert.equal(summary.holdingPnl, 200);
  assert.equal(summary.cumulativePnl, 200);
  assert.equal(summary.totalBuyCost, 1000);
  assert.equal(summary.returnCostBasis, 520);
  assert.equal(summary.cumulativePnlPct, 200 / 520);
  assert.equal(summary.activePositions[0].totalPnlPct, 200 / 520);
});

test('sell records cannot close more shares than currently held', () => {
  const positions = derivePositionsFromTrades([
    { id: 1, symbol: 'AAPL', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
    { id: 2, symbol: 'AAPL', side: 'sell', date: '2026-01-02', price: 120, shares: 15 },
  ], [{ symbol: 'AAPL', price: 130, previousClose: 128 }]);

  assert.equal(positions[0].heldShares, 0);
  assert.equal(positions[0].totalSellShares, 10);
  assert.equal(positions[0].ignoredSellShares, 5);
  assert.equal(positions[0].soldCost, 1000);
  assert.equal(positions[0].sellProceeds, 1200);
  assert.equal(positions[0].realizedPnl, 200);
  assert.equal(positions[0].unrealizedPnl, 0);
  assert.equal(positions[0].returnCostBasis, 0);
});

test('investment summary ignores independent cost-basis tool data by interface', () => {
  const summary = deriveInvestmentSummary({
    trades: [],
    watchlist,
    usdRate: 7.2,
  });

  assert.equal(summary.totalAssetsUsd, 0);
  assert.equal(summary.holdingStockCount, 0);
  assert.equal(summary.sellTradeCount, 0);
  assert.deepEqual(summary.activePositions, []);
});

test('investment summary prefers independent stockTrades over legacy wave trades', () => {
  const summary = deriveInvestmentSummary({
    trades: [
      { id: 1, symbol: 'AAPL', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
    ],
    stockTrades: [
      { id: 'ledger-1', symbol: 'MSFT', side: 'buy', date: '2026-01-03', price: 200, shares: 2 },
    ],
    watchlist,
    usdRate: 7.2,
  });

  assert.equal(summary.holdingStockCount, 1);
  assert.equal(summary.activePositions[0].symbol, 'MSFT');
  assert.equal(summary.totalAssetsUsd, 420);
  assert.equal(summary.tradeCount, 1);
});
