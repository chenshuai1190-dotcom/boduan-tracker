import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stockDetailPageSource = readFileSync(new URL('../src/pages/StockDetailPage.jsx', import.meta.url), 'utf8');
const comparisonCardSource = readFileSync(new URL('../src/components/StockReturnComparisonCard.jsx', import.meta.url), 'utf8');
const comparisonCardCss = readFileSync(new URL('../src/components/StockReturnComparisonCard.css', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/lib/i18n.js', import.meta.url), 'utf8');
const benchmarkApiSource = readFileSync(new URL('../api/pnl-benchmark.js', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const shareVisualStart = comparisonCardSource.indexOf('<div data-stock-comparison-share-dialog="true">');
const shareVisualEnd = comparisonCardSource.indexOf('<div className="stock-comparison-basis">', shareVisualStart);
const shareVisualSource = comparisonCardSource.slice(shareVisualStart, shareVisualEnd);
const tooltipVisualStart = comparisonCardSource.indexOf('<div className="stock-comparison-tooltip">');
const tooltipVisualEnd = comparisonCardSource.indexOf('function SharePreview', tooltipVisualStart);
const tooltipVisualSource = comparisonCardSource.slice(tooltipVisualStart, tooltipVisualEnd);
const sharePreviewStart = comparisonCardSource.indexOf('function SharePreview');
const sharePreviewEnd = comparisonCardSource.indexOf('export default function StockReturnComparisonCard', sharePreviewStart);
const sharePreviewSource = comparisonCardSource.slice(sharePreviewStart, sharePreviewEnd);

test('stock comparison remains read-only and loads both raw-close sides through the authenticated market-data boundary', () => {
  assert.match(stockDetailPageSource, /fetchPnlReportSymbolSnapshotHistory\(symbol, null\)/);
  assert.match(stockDetailPageSource, /pnlReportRefreshVersion = 0/);
  assert.match(stockDetailPageSource, /\[db, pnlReportRefreshVersion, symbol, user\?\.id\]/);
  assert.match(stockDetailPageSource, /requestedSymbols = \[\.\.\.new Set\(\[symbol, 'QQQ'\]\)\]/);
  assert.match(stockDetailPageSource, /Promise\.all\(missingSymbols\.map/);
  assert.match(stockDetailPageSource, /\/api\/pnl-benchmark\?symbol=\$\{encodeURIComponent\(requestedSymbol\)\}/);
  assert.match(stockDetailPageSource, /Authorization: `Bearer \$\{token\}`/);
  assert.equal(
    (stockDetailPageSource.match(/supabase\.auth\.getSession\(\)/g) || []).length,
    1,
    'both symbol requests must reuse one authenticated session lookup',
  );
  assert.match(stockDetailPageSource, /`\$\{requestedSymbol\}:\$\{from\}:\$\{to\}`/);
  assert.match(stockDetailPageSource, /buildStockReturnComparison\([\s\S]*comparisonMarketRows\.qqqRows[\s\S]*comparisonMarketRows\.stockRawRows/);
  assert.match(stockDetailPageSource, /setComparisonMarketRows\(\{ key: '', qqqRows: \[\], stockRawRows: \[\] \}\)/);
  assert.doesNotMatch(stockDetailPageSource, /stock_trades[^\n]*(insert|update|delete|upsert)/i);
  assert.match(benchmarkApiSource, /requireQuoteAuth/);
  assert.match(benchmarkApiSource, /rawClose/);
});

test('stock detail and comparison charts keep continuous pointer tracking independent from async tooltip state', () => {
  assert.match(stockDetailPageSource, /data-stock-detail-pnl-chart="true"/);
  assert.match(stockDetailPageSource, /activePointerIdRef\.current = event\.pointerId/);
  assert.match(stockDetailPageSource, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(stockDetailPageSource, /if \(activePointerIdRef\.current !== event\.pointerId\) return;[\s\S]*updateSelectedPoint\(event\)/);
  assert.match(stockDetailPageSource, /onPointerUp=\{finishPointerTracking\}/);
  assert.match(stockDetailPageSource, /onPointerCancel=\{finishPointerTracking\}/);
  assert.match(stockDetailPageSource, /onLostPointerCapture=\{finishPointerTracking\}/);
  assert.match(stockDetailPageSource, /key=\{`stock-detail-tooltip-date-\$\{selectedPoint\.date\}`\}/);
  assert.match(stockDetailPageSource, /data-stock-detail-tooltip-date=\{selectedPoint\.date\}/);
  assert.match(stockDetailPageSource, /current\?\.type === 'point' && current\.index === nextIndex/);
  assert.match(stockDetailPageSource, /\}, \[hasSelection\]\);/);

  assert.match(comparisonCardSource, /data-stock-return-comparison-chart="true"/);
  assert.match(comparisonCardSource, /activePointerIdRef\.current = event\.pointerId/);
  assert.match(comparisonCardSource, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(comparisonCardSource, /if \(activePointerIdRef\.current !== event\.pointerId\) return;[\s\S]*selectNearest\(event\)/);
  assert.match(comparisonCardSource, /onPointerUp=\{finishPointerTracking\}/);
  assert.match(comparisonCardSource, /onPointerCancel=\{finishPointerTracking\}/);
  assert.match(comparisonCardSource, /onLostPointerCapture=\{finishPointerTracking\}/);
  assert.match(comparisonCardSource, /key=\{`stock-return-comparison-tooltip-date-\$\{selected\.date\}`\}/);
  assert.match(comparisonCardSource, /data-stock-return-comparison-tooltip-date=\{selected\.date\}/);
  assert.match(comparisonCardSource, /ref=\{chartRootRef\} className="stock-comparison-chart-section"/);
  assert.match(comparisonCardSource, /document\.addEventListener\('pointerdown', closeOnOutsidePointer, true\)/);
  assert.match(comparisonCardSource, /document\.removeEventListener\('pointerdown', closeOnOutsidePointer, true\)/);
  assert.match(comparisonCardSource, /window\.setTimeout\(\(\) => setSelectedIndex\(null\), CHART_TOOLTIP_HOLD_MS\)/);
  assert.match(comparisonCardSource, /preserveAspectRatio="none"/, 'responsive pointer tracking must use the same visible SVG coordinates without letterboxing');
  assert.match(comparisonCardSource, /new ResizeObserver\(measure\)/);
  assert.match(comparisonCardSource, /return \(\) => observer\.disconnect\(\)/);
});

test('comparison UI uses system market colors and does not embed production financial fixtures', () => {
  assert.match(comparisonCardSource, /marketTextClass/);
  assert.match(comparisonCardSource, /marketHexColor/);
  assert.match(comparisonCardSource, /const mineLineColor = valueColor\(comparison\?\.stockPnlUsd, marketColorMode\)/);
  assert.match(comparisonCardSource, /BENCHMARK_LINE_COLOR/);
  assert.match(comparisonCardSource, /stockDetail\.comparison\.rateGap/);
  assert.match(comparisonCardSource, /stockDetail\.comparison\.rateGapShort/);
  assert.match(comparisonCardSource, /pctLabel=\{t\(language, 'stockDetail\.comparison\.rateGapShort'/);
  assert.match(comparisonCardSource, /signedPct\(comparison\.excessPnlPct\)/);
  assert.doesNotMatch(comparisonCardSource, /个百分点|\}pp/);
  assert.match(comparisonCardSource, /import StockReportModal from '\.\/StockReportModal\.jsx'/);
  assert.equal((comparisonCardSource.match(/<StockReportModal/g) || []).length, 2, 'both disclosure and share views should use the standard report modal');
  assert.doesNotMatch(comparisonCardSource, /#0d1118|#f6b54b|#ffd18a|\btruncate\b/, 'comparison presentation should not restore legacy colored shells or truncate financial amounts');
  assert.match(i18nSource, /'stockDetail\.comparison\.rateGap': '收益率差'/);
  assert.match(i18nSource, /'stockDetail\.comparison\.rateGap': 'Return-rate Gap'/);
  assert.match(i18nSource, /收益率差 = 当前持仓收益率 − QQQ 收益率/);
  assert.match(i18nSource, /Return-rate gap = current-position return rate − QQQ return rate/);
  assert.match(i18nSource, /已卖出部分及其已实现盈亏不再计入整段对比/);
  assert.match(i18nSource, /the sold portion and its realized P&L are excluded from the entire comparison/);
  assert.ok(shareVisualStart > -1 && shareVisualEnd > shareVisualStart, 'share-card visual source should be detectable');
  assert.match(shareVisualSource, /signedCurrency\(stockAmount/);
  assert.match(shareVisualSource, /signedCurrency\(benchmarkAmount/);
  assert.match(shareVisualSource, /signedCurrency\(excessAmount/);
  assert.match(shareVisualSource, /signedPct\(comparison\.excessPnlPct\)/);
  assert.match(shareVisualSource, /signedPct\(comparison\.stockPnlPct\)/);
  assert.match(shareVisualSource, /signedPct\(comparison\.benchmarkPnlPct\)/);
  assert.ok(tooltipVisualStart > -1 && tooltipVisualEnd > tooltipVisualStart, 'chart-tooltip visual source should be detectable');
  assert.match(tooltipVisualSource, /className="stock-comparison-tooltip-readings"/);
  assert.match(comparisonCardCss, /\.stock-comparison-tooltip-readings\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/, 'tooltip readings should reserve their natural amount width rather than a narrow fixed amount column');
  assert.match(comparisonCardCss, /\.stock-comparison-tooltip\s*\{[^}]*width:\s*min\(340px, calc\(100% - 16px\)\);/, 'the expanded tooltip must still fit mobile widths');
  assert.match(tooltipVisualSource, /signedCurrency\(selected\.stockPnlUsd/);
  assert.match(tooltipVisualSource, /signedCurrency\(selected\.benchmarkPnlUsd/);
  assert.match(tooltipVisualSource, /signedPct\(selected\.excessPnlPct\)/);
  assert.doesNotMatch(tooltipVisualSource, /signedPct\(selected\.(stockPnlPct|benchmarkPnlPct)\)/);
  assert.match(comparisonCardSource, /收益金额跑赢 QQQ/);
  assert.ok(sharePreviewStart > -1 && sharePreviewEnd > sharePreviewStart, 'share preview source should be detectable');
  assert.doesNotMatch(sharePreviewSource, /navigator\.clipboard|copyText|setCopied|samePeriodQqq/);
  assert.doesNotMatch(sharePreviewSource, /复制对比文字|Copy comparison/);
  assert.match(i18nSource, /'stockDetail\.comparison\.closeBasisShort': '固定起点 · 仅当前存续仓位'/);
  assert.match(i18nSource, /'stockDetail\.comparison\.previewBasisShort': '固定起点 · 仅当前存续仓位 · 本地只读视觉样例'/);
  assert.match(i18nSource, /'stockDetail\.comparison\.closeBasisShort': 'Fixed start · current position only'/);
  assert.doesNotMatch(i18nSource, /stockDetail\.comparison\.(samePeriodQqq|copyText|copied)'\s*:/);
  assert.equal((sharePreviewSource.match(/className="stock-comparison-share-readings"/g) || []).length, 2, 'stock and QQQ share rows should use identical amount and rate hierarchy');
  assert.match(comparisonCardCss, /\.stock-comparison-share-readings > span\s*\{[^}]*font-weight:\s*400;[^}]*overflow-wrap:\s*anywhere;/, 'full-precision share amounts must remain readable and may wrap without being cut off');
  assert.match(sharePreviewSource, /stock-comparison-share-excess-amount/, 'share preview should keep excess amount separate from its return-rate gap label');
  assert.doesNotMatch(comparisonCardSource, /mock|fixture|sampleData/i);
  assert.match(previewSource, /mockStockComparisonLossPnlByDate/);
  assert.match(previewSource, /mockStockComparisonNvdaRawRows/);
  assert.match(previewSource, /stockReturnRawRowsBySymbol/);
  assert.match(previewSource, /symbol: requestedSymbol = 'QQQ'/);
  assert.match(previewSource, /stockDetailTooltip/);
  assert.match(previewSource, /stockDetailComparison/);
});

test('missing comparison data is disclosed instead of replaced with zero or a synthetic line', () => {
  assert.match(comparisonCardSource, /双方没有足够的同周期正式收盘数据/);
  assert.match(comparisonCardSource, /双方没有足够的同日收盘快照/);
  assert.match(comparisonCardSource, /QQQ 普通收盘价/);
  assert.match(comparisonCardSource, /本地只读视觉样例/);
  assert.doesNotMatch(stockDetailPageSource, /benchmarkRows\s*\|\|\s*\[/);
});
