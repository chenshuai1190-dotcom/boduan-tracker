import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stockDetailSource = readFileSync(new URL('../src/pages/StockDetailPage.jsx', import.meta.url), 'utf8');
const watchlistDetailSource = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');
const targetEditorSource = readFileSync(new URL('../src/components/StockTargetEditor.jsx', import.meta.url), 'utf8');

function sourceSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

test('individual return summary keeps all three approved two-column rows before the integrated target plan', () => {
  const summarySource = sourceSlice(
    stockDetailSource,
    'data-stock-detail-summary-card="true"',
    "t(language, 'stockDetail.pnlTrend', '收益走势')",
  );

  assert.match(summarySource, /data-stock-detail-target-plan="true"/);
  assert.equal(
    (summarySource.match(/className="mt-4 grid grid-cols-2 border-t border-white\/\[0\.06\] pt-3"/g) || []).length,
    1,
    'the realized P&L row must keep its original top spacing',
  );
  assert.equal(
    (summarySource.match(/className="mt-3 grid grid-cols-2 border-t border-white\/\[0\.06\] pt-3"/g) || []).length,
    2,
    'the holding and holding-days rows must keep their original vertical structure',
  );

  const approvedOrder = [
    "'stockDetail.realizedPnl'",
    "'stockDetail.unrealizedPnl'",
    "'stockDetail.heldShares'",
    "'stockDetail.avgCost'",
    "'stockDetail.holdingDays'",
    "'stockDetail.firstEntry'",
    'data-stock-detail-target-plan="true"',
  ];
  let previousIndex = -1;
  approvedOrder.forEach((marker) => {
    const index = summarySource.indexOf(marker);
    assert.ok(index > previousIndex, `${marker} must keep the approved summary-card order`);
    previousIndex = index;
  });
});

test('integrated target editing keeps the isolated watchlist saver and no ledger write path', () => {
  assert.match(stockDetailSource, /import TargetEditor from '\.\.\/components\/StockTargetEditor\.jsx'/);
  assert.match(watchlistDetailSource, /import TargetEditor from '\.\.\/components\/StockTargetEditor\.jsx'/);
  assert.match(stockDetailSource, /\bwatchlist(?:\s*=\s*\[\])?,/);
  assert.match(stockDetailSource, /\bsaveWatchlistStockTarget,\s/);
  assert.match(stockDetailSource, /saveWatchlistStockTarget\(symbol, normalizedTarget\)/);
  assert.match(stockDetailSource, /data-stock-detail-target-plan="true"/);
  assert.match(stockDetailSource, /targetPriceUsd/);

  const isolatedSaveCalls = [
    ...(stockDetailSource.matchAll(/saveWatchlistStockTarget\(symbol, normalizedTarget\)/g)),
    ...(watchlistDetailSource.matchAll(/saveWatchlistStockTarget\(symbol, normalizedTarget\)/g)),
  ];
  assert.equal(isolatedSaveCalls.length, 2, 'both target surfaces must reuse the same isolated save callback');

  for (const forbidden of [
    'updateWatchlistTargetPrice',
    'insertStockTrade',
    'updateStockTrade',
    'deleteStockTrade',
    'markPnlReportDirty',
    "from('stock_trades')",
  ]) {
    assert.equal(stockDetailSource.includes(forbidden), false, `individual return detail must not call ${forbidden}`);
    assert.equal(targetEditorSource.includes(forbidden), false, `shared target editor must not call ${forbidden}`);
  }
  assert.doesNotMatch(targetEditorSource, /saveWatchlistStockTarget/, 'the shared editor must save only through its injected callback');
});

test('stock-trend page keeps its existing standalone target card and shared editing path', () => {
  assert.match(watchlistDetailSource, /data-watchlist-detail-section="target"/);
  assert.match(watchlistDetailSource, /saveWatchlistStockTarget\(symbol, normalizedTarget\)/);
  assert.doesNotMatch(watchlistDetailSource, /data-stock-detail-target-plan="true"/);
  assert.match(watchlistDetailSource, /<TargetEditor\b/);
  assert.match(watchlistDetailSource, /targetPriceUsd/);
});
