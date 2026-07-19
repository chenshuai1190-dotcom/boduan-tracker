import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveCloseBasedPosition,
  filterStockDetailHistory,
  findWatchlistStockDetailRows,
  normalizeStockDetailHistory,
  resolveStockDetailClose,
  targetProgressPercent,
  targetSpacePercent,
  usdToDisplayCurrency,
} from '../src/lib/watchlistStockDetail.js';

test('stock detail history is normalized and ranges use the latest completed close', () => {
  const rows = normalizeStockDetailHistory([
    { date: '2026-07-17', close: 202 },
    { date: 'bad', close: 999 },
    { date: '2026-06-17', close: 180 },
    { date: '2026-07-17', close: 203 },
    { date: '2026-07-16', close: 0 },
  ]);
  assert.deepEqual(rows, [
    { date: '2026-06-17', close: 180 },
    { date: '2026-07-17', close: 203 },
  ]);
  assert.equal(filterStockDetailHistory(rows, '1m').length, 2);
  assert.deepEqual(resolveStockDetailClose(rows), {
    asOfDate: '2026-07-17',
    closeUsd: 203,
    previousCloseUsd: 180,
    changeUsd: 23,
    changePercent: (23 / 180) * 100,
  });
});

test('portfolio conversion is reserved for holding totals while target math stays canonical in USD', () => {
  const targetUsd = 250;
  assert.equal(usdToDisplayCurrency(2000, 'USD', 7.2), 2000);
  assert.equal(usdToDisplayCurrency(2000, 'CNY', 7.2), 14400);
  assert.equal(targetSpacePercent(targetUsd, 200), 25);
  assert.equal(targetProgressPercent(targetUsd, 200, 150), 50);
});

test('watchlist detail derives read-only holdings and formal trades by symbol', () => {
  const rows = findWatchlistStockDetailRows({
    symbol: 'nvda',
    watchlist: [{ symbol: 'NVDA', targetPriceUsd: 250 }],
    quoteRows: [{ symbol: 'NVDA', price: 202 }],
    positions: [{ symbol: 'NVDA', heldShares: 10, avgCost: 180, remainingCost: 1800 }],
    stockTrades: [
      { id: 1, symbol: 'NVDA', date: '2026-01-01' },
      { id: 2, symbol: 'AAPL', date: '2026-02-01' },
      { id: 3, symbol: 'NVDA', date: '2026-03-01' },
    ],
  });
  assert.equal(rows.watchlistRow.targetPriceUsd, 250);
  assert.deepEqual(rows.trades.map((trade) => trade.id), [3, 1]);
  assert.deepEqual(deriveCloseBasedPosition(rows.position, 200, 5000), {
    held: true,
    shares: 10,
    averageCostUsd: 180,
    marketValueUsd: 2000,
    pnlUsd: 200,
    pnlPercent: (200 / 1800) * 100,
    allocationPercent: 40,
  });
});
