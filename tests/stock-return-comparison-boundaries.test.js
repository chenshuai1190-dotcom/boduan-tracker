import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stockDetailPageSource = readFileSync(new URL('../src/pages/StockDetailPage.jsx', import.meta.url), 'utf8');
const comparisonCardSource = readFileSync(new URL('../src/components/StockReturnComparisonCard.jsx', import.meta.url), 'utf8');
const benchmarkApiSource = readFileSync(new URL('../api/pnl-benchmark.js', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');

test('stock comparison remains read-only and uses the existing authenticated benchmark boundary', () => {
  assert.match(stockDetailPageSource, /fetchPnlReportSymbolSnapshotHistory\(symbol, null\)/);
  assert.match(stockDetailPageSource, /\/api\/pnl-benchmark\?symbol=QQQ/);
  assert.match(stockDetailPageSource, /Authorization: `Bearer \$\{token\}`/);
  assert.match(stockDetailPageSource, /buildStockReturnComparison\(view, benchmarkRows\)/);
  assert.doesNotMatch(stockDetailPageSource, /stock_trades[^\n]*(insert|update|delete|upsert)/i);
  assert.match(benchmarkApiSource, /requireQuoteAuth/);
  assert.match(benchmarkApiSource, /rawClose/);
});

test('comparison UI uses system market colors and does not embed production financial fixtures', () => {
  assert.match(comparisonCardSource, /marketTextClass/);
  assert.match(comparisonCardSource, /marketHexColor/);
  assert.match(comparisonCardSource, /MINE_LINE_COLOR/);
  assert.match(comparisonCardSource, /BENCHMARK_LINE_COLOR/);
  assert.doesNotMatch(comparisonCardSource, /mock|fixture|sampleData/i);
  assert.match(previewSource, /mockStockComparisonLossPnlByDate/);
  assert.match(previewSource, /stockDetailComparison/);
});

test('missing comparison data is disclosed instead of replaced with zero or a synthetic line', () => {
  assert.match(comparisonCardSource, /双方没有足够的同周期正式收盘数据/);
  assert.match(comparisonCardSource, /双方没有足够的同日收盘快照/);
  assert.match(comparisonCardSource, /QQQ 普通收盘价/);
  assert.match(comparisonCardSource, /本地只读视觉样例/);
  assert.doesNotMatch(stockDetailPageSource, /benchmarkRows\s*\|\|\s*\[/);
});
