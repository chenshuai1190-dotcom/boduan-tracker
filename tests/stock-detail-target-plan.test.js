import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stockDetailSource = readFileSync(new URL('../src/pages/StockDetailPage.jsx', import.meta.url), 'utf8');
const stockDetailCss = readFileSync(new URL('../src/pages/StockDetailPage.css', import.meta.url), 'utf8');
const watchlistDetailSource = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');
const targetEditorSource = readFileSync(new URL('../src/components/StockTargetEditor.jsx', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/lib/i18n.js', import.meta.url), 'utf8');

function sourceSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

test('individual return report preserves all six facts and moves the isolated target plan below both charts', () => {
  const summarySource = sourceSlice(
    stockDetailSource,
    'data-stock-detail-summary-card="true"',
    'data-stock-detail-pnl-trend-card="true"',
  );

  assert.doesNotMatch(summarySource, /data-stock-detail-target-plan="true"/, 'the target plan should not crowd the summary before the primary chart');
  assert.match(summarySource, /className="sdp-pnl-breakdown"/);
  assert.match(summarySource, /className="sdp-holding-facts"/);
  assert.match(stockDetailCss, /\.sdp-pnl-breakdown\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(stockDetailCss, /\.sdp-holding-facts\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);

  const approvedOrder = [
    "'stockDetail.realizedPnl'",
    "'stockDetail.unrealizedPnl'",
    "'stockDetail.heldShares'",
    "'stockDetail.avgCost'",
    "'stockDetail.holdingDays'",
    "'stockDetail.firstEntry'",
  ];
  let previousIndex = -1;
  approvedOrder.forEach((marker) => {
    const index = summarySource.indexOf(marker);
    assert.ok(index > previousIndex, `${marker} must keep the approved summary-card order`);
    previousIndex = index;
  });
  assert.match(summarySource, /'stockDetail\.avgCost', '会计平均成本'/);
  assert.match(i18nSource, /'stockDetail\.avgCost': '会计平均成本'/);
  assert.match(i18nSource, /'stockDetail\.avgCost': 'Accounting Average Cost'/);

  const chartIndex = stockDetailSource.indexOf('data-stock-detail-pnl-trend-card="true"');
  const comparisonIndex = stockDetailSource.indexOf('<StockReturnComparisonCard', chartIndex);
  const targetIndex = stockDetailSource.indexOf('data-stock-detail-target-plan="true"', comparisonIndex);
  const statsIndex = stockDetailSource.indexOf('data-stock-detail-trade-stats="true"', targetIndex);
  assert.ok(chartIndex >= 0 && comparisonIndex > chartIndex && targetIndex > comparisonIndex && statsIndex > targetIndex, 'the report should place both returns charts before the single target plan, followed by trading facts');
  assert.equal((stockDetailSource.match(/data-stock-detail-target-plan="true"/g) || []).length, 1, 'there must still be only one editable target plan');
  assert.match(stockDetailSource, /value=\{view\.hasData \? signedCurrency\(view\.realizedPnlUsd/);
  assert.match(stockDetailSource, /value=\{view\.hasData \? signedCurrency\(view\.unrealizedPnlUsd/);
  assert.match(stockDetailSource, /value=\{view\.hasData \? `\$\{fmt\(view\.heldShares, 0\)\}/, 'missing close snapshots must not display invented zero holdings');
});

test('target editor uses the neutral report dialog with one save action and guarded close', () => {
  assert.ok(targetEditorSource.includes("import StockReportModal from './StockReportModal.jsx'"));
  assert.ok(targetEditorSource.includes('<StockReportModal'));
  assert.ok(targetEditorSource.includes('onClose={() => !saving && onCancel()}'));
  assert.equal(targetEditorSource.includes("key: 'cancel'"), false);
  assert.ok(targetEditorSource.includes("key: 'save'"));
  assert.ok(targetEditorSource.includes("className: 'srm-primary'"));
  assert.ok(targetEditorSource.includes('disabled: value === null || saving'));
  assert.ok(targetEditorSource.includes('onClick: () => onSave(targetUsd)'));
  assert.ok(targetEditorSource.includes('onClick={() => adjust(-1)}'));
  assert.ok(targetEditorSource.includes('onClick={() => adjust(1)}'));
  assert.ok(targetEditorSource.includes("'watchlistDetail.targetBoundary'"));
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
