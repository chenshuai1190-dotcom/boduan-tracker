import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const devPreviewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/lib/i18n.js', import.meta.url), 'utf8');

test('watchlist detail keeps the existing bottom tabs and uses the Chinese stock-trend title', () => {
  assert.ok(pageSource.includes('pb-[calc(env(safe-area-inset-bottom)+86px)]'));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.title', '股票趋势')"));
  assert.ok(i18nSource.includes("'watchlistDetail.title': '股票趋势'"));
  assert.ok(i18nSource.includes("'watchlistDetail.title': 'Stock Detail'"), 'English title should remain unchanged');
  assert.ok(appSource.includes('{!isPnlReportPage && ('));
  assert.equal(appSource.includes('!isPnlReportPage && !isWatchlistStockDetailPage'), false);
  assert.ok(devPreviewSource.includes("activeTab !== 'pnl-report' && ("));
  assert.ok(devPreviewSource.includes("activeTab === 'watchlist-stock-detail' && tab.id === 'home'"));
});

test('production watchlist detail reads one authenticated close-history payload on demand', () => {
  assert.ok(pageSource.includes('/api/quote?symbols=${encodeURIComponent(symbol)}&view=stock-detail'));
  assert.ok(pageSource.includes("Authorization: `Bearer ${token}`"));
  assert.ok(pageSource.includes("cache: 'no-store'"));
  assert.ok(pageSource.includes('stockDetail?.history'));
  assert.ok(pageSource.includes('indicators?.week52High'));
  assert.ok(pageSource.includes('indicators?.ma200'));
  assert.ok(pageSource.includes('indicators?.ema30'));
  assert.ok(pageSource.includes('indicators?.volatility20AnnualizedPct'));
});

test('production watchlist detail only converts holding asset totals and keeps stock prices in their quote currency', () => {
  assert.ok(pageSource.includes("language = 'zh'"));
  assert.ok(pageSource.includes("portfolioCurrencyMode = 'USD'"));
  assert.ok(pageSource.includes('displayCurrencyRate(portfolioCurrency, usdRate)'));
  assert.ok(pageSource.includes("stockDetail?.currency || 'USD'"));
  assert.ok(pageSource.includes('const closeDisplay = close.closeUsd'));
  assert.ok(pageSource.includes('const targetDisplay = targetPriceUsd'));
  assert.ok(pageSource.includes('position.marketValueUsd, portfolioCurrency, portfolioRate'));
  assert.ok(pageSource.includes('position.pnlUsd, portfolioCurrency, portfolioRate'));
  assert.ok(pageSource.includes('formatCurrency(position.averageCostUsd, stockCurrency)'));
  assert.ok(pageSource.includes('formatCurrency(priceUsd, stockCurrency)'));
  assert.equal((pageSource.match(/usdToDisplayCurrency\(/g) || []).length, 2, 'only holding market value and P&L may be converted');
  assert.equal(pageSource.includes('displayCurrencyToUsd'), false, 'target prices must never be reinterpreted through the portfolio currency');
  assert.equal(pageSource.includes('displayRate='), false, 'the stock chart must never receive a portfolio FX rate');
  assert.ok(pageSource.includes('Number(targetUsd.toFixed(6))'));
  assert.ok(pageSource.includes("result?.success === false"), 'a failed DB result must not close the target editor optimistically');
});

test('technical indicator heading does not repeat MA200 and EMA30 summary values', () => {
  assert.equal(pageSource.includes('metricSummary'), false);
  assert.ok(pageSource.includes("<SectionHeading title={t(language, 'watchlistDetail.technicalIndicators', '关键指标')} />"));
});

test('production detail shares the Home logo candidate chain and reads the persisted cache URL', () => {
  assert.ok(pageSource.includes('const cachedLogoUrl = cachedLogoEntry?.url || cachedLogoEntry'));
  assert.ok(pageSource.includes('rows.watchlistRow?.logoURL'));
  assert.ok(pageSource.includes('rows.quoteRow?.logoURL'));
  assert.ok(pageSource.includes('onLogoLoad={cacheStockLogo}'));
});

test('target card keeps whole-card editing without the scale animation', () => {
  const targetButtonLine = pageSource.split('\n').find((line) => line.includes('data-watchlist-detail-section="target"')) || '';
  assert.ok(targetButtonLine.includes('setShowTargetEditor(true)'));
  assert.ok(targetButtonLine.includes('editTargetAria'));
  assert.equal(targetButtonLine.includes('scale-'), false);
  assert.ok(pageSource.includes('targetProgressPositionPercent(targetProgress)'));
});

test('production watchlist detail only mutates its isolated target and keeps holdings and trades read-only', () => {
  assert.ok(pageSource.includes('saveWatchlistStockTarget(symbol, normalizedTarget)'));
  assert.ok(pageSource.includes('formalLedgerReadOnly'));
  assert.ok(pageSource.includes('targetBoundary'));
  for (const forbidden of [
    'insertStockTrade',
    'updateStockTrade',
    'deleteStockTrade',
    'markPnlReportDirty',
    "from('stock_trades')",
  ]) {
    assert.equal(pageSource.includes(forbidden), false, `detail page must not call ${forbidden}`);
  }
  assert.ok(appSource.includes('await db.updateWatchlistTargetPrice(symbol, targetPriceUsd)'));
});

test('production price chart keeps the approved full-width tooltip interaction', () => {
  assert.ok(pageSource.includes('data-watchlist-stock-detail-header="full-width-chart"'));
  assert.ok(pageSource.includes('data-watchlist-stock-price-chart="true"'));
  assert.ok(pageSource.includes('data-watchlist-stock-price-tooltip="true"'));
  assert.ok(pageSource.includes('setSelectedIndex(Math.round'));
  assert.ok(pageSource.includes('window.setTimeout(() => setSelectedIndex(null), 12_000)'));
});
