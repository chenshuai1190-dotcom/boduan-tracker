import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveInvestmentSummary, derivePositionsFromTrades } from '../src/lib/investmentSummary.js';

const watchlist = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 120, previousClose: 118, changePercent: 1.69 },
  { symbol: 'MSFT', name: 'Microsoft', price: 210, previousClose: 205, changePercent: 2.44 },
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
  assert.equal(Number(positions[0].effectiveCost.toFixed(2)), 94.44);
  assert.equal(positions[0].effectiveRemainingCost, 8500);
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
