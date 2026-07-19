import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveCloseBasedPosition,
  filterStockDetailHistory,
  filterStockDetailWeeklyHistory,
  findStockDetailWeeklyMaOnOrBefore,
  findWatchlistStockDetailRows,
  normalizeStockDetailHistory,
  normalizeStockDetailWeeklyHistory,
  resolveStockDetailClose,
  targetProgressPercent,
  targetProgressPositionPercent,
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

test('weekly history preserves missing MA values, filters five years, and resolves the latest locked MA by date', () => {
  const rows = normalizeStockDetailWeeklyHistory([
    { date: '2021-07-09', weekEndDate: '2021-07-09', close: 100, ma200: 80, completed: true },
    { date: '2026-07-10', weekEndDate: '2026-07-10', close: 200, ma200: 150, completed: true },
    { date: '2026-07-15', weekEndDate: '2026-07-17', close: 205, ma200: 999, completed: false },
    { date: 'bad', close: 999, ma200: 999 },
  ]);

  assert.equal(rows.length, 3);
  assert.equal(rows.at(-1).ma200, 999, 'normalization should preserve the provider payload for diagnostics');
  assert.equal(rows.at(-1).completed, false);
  const visible = filterStockDetailWeeklyHistory(rows, '5y');
  assert.deepEqual(visible.map((row) => row.date), ['2026-07-10', '2026-07-15']);
  assert.deepEqual(findStockDetailWeeklyMaOnOrBefore(rows, '2026-07-15'), rows[1], 'tooltips must ignore any MA attached to an unfinished week');
  assert.equal(findStockDetailWeeklyMaOnOrBefore(rows, '2021-01-01'), null);
});

test('portfolio conversion is reserved for holding totals while target math stays canonical in USD', () => {
  const targetUsd = 250;
  assert.equal(usdToDisplayCurrency(2000, 'USD', 7.2), 2000);
  assert.equal(usdToDisplayCurrency(2000, 'CNY', 7.2), 14400);
  assert.equal(targetSpacePercent(targetUsd, 200), 25);
  assert.equal(targetProgressPercent(targetUsd, 200, 150), 50);
});

test('cost-to-target progress keeps the real signed value while the visual marker stays bounded', () => {
  const belowCost = targetProgressPercent(550, 393.82, 412.07);
  assert.equal(belowCost, ((393.82 - 412.07) / (550 - 412.07)) * 100);
  assert.equal(targetProgressPositionPercent(belowCost), 0);

  const aboveTarget = targetProgressPercent(250, 300, 150);
  assert.equal(aboveTarget, 150);
  assert.equal(targetProgressPositionPercent(aboveTarget), 100);

  assert.equal(targetProgressPercent(150, 200, 150), null);
  assert.equal(targetProgressPercent(250, 200, null), null);
  assert.equal(targetProgressPositionPercent(null), 0);
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
