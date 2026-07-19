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

test('production watchlist detail reads one authenticated daily and weekly history payload on demand', () => {
  assert.ok(pageSource.includes('/api/quote?symbols=${encodeURIComponent(symbol)}&view=stock-detail'));
  assert.ok(pageSource.includes("Authorization: `Bearer ${token}`"));
  assert.ok(pageSource.includes("cache: 'no-store'"));
  assert.ok(pageSource.includes('stockDetail?.history'));
  assert.ok(pageSource.includes('stockDetail?.weeklyHistory'));
  assert.ok(pageSource.includes('indicators?.week52High'));
  assert.ok(pageSource.includes('indicators?.ma200'));
  assert.equal(pageSource.includes('indicators?.ema30'), false, 'EMA30 should remain an API compatibility field, not a visible page metric');
  assert.ok(pageSource.includes('indicators?.ma200Weekly'));
  assert.ok(pageSource.includes('indicators?.ma200WeeklyStatus'));
  assert.equal(pageSource.includes('indicators?.volatility20AnnualizedPct'), false, 'volatility should no longer occupy the approved indicator surface');
});

test('production watchlist detail reads an optional authenticated QQQ benchmark without blocking the page', () => {
  assert.ok(pageSource.includes('/api/pnl-benchmark?symbol=QQQ&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}'));
  assert.ok(pageSource.includes("fetchRows({ symbol: 'QQQ', from, to })"));
  assert.ok(pageSource.includes('QQQ_BENCHMARK_CACHE_TTL_MS = 15 * 60 * 1000'));
  assert.ok(pageSource.includes('headers: { Authorization: `Bearer ${token}` }'));
  assert.ok(pageSource.includes("cache: 'no-store'"));
  assert.ok(pageSource.includes('const [nextDetail, nextEarnings] = await Promise.all([detailPromise, earningsPromise])'));
  assert.ok(pageSource.includes('void qqqPromise.then((nextQqqHistory) => {'));
  assert.ok(pageSource.includes("console.warn('[WatchlistStockDetail] QQQ benchmark unavailable:'"));
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

test('technical indicators use a borderless daily row plus one detailed weekly MA panel', () => {
  assert.equal(pageSource.includes('metricSummary'), false);
  assert.ok(pageSource.includes('data-watchlist-key-metrics="spacious"'));
  assert.ok(pageSource.includes('data-watchlist-daily-metrics="borderless"'));
  assert.ok(pageSource.includes('data-watchlist-weekly-ma-panel="true"'));
  assert.ok(pageSource.includes('data-watchlist-ma200-entry-indicator="true"'));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.ma200Entry', 'MA200')"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.entryIndicator', '建仓指标')"));
  assert.equal(pageSource.includes('distanceMa200Daily'), false);
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.relativeQqq3m', '相对QQQ（3个月）')"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.relativeQqq3mDetail', '个股 {{stock}} · QQQ {{qqq}}'"));
  assert.ok(pageSource.includes('deriveThreeMonthQqqRelativeReturn(history, qqqComparisonHistory)'));
  assert.equal(pageSource.includes('distanceEma30'), false);
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.completedWeeksBasis', '基于已完成交易周')"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.longTermTrend', '芒格指标')"));
  assert.equal((pageSource.match(/<IndicatorBadge>/g) || []).length, 2, 'daily entry and weekly Munger labels should share one badge component');
  assert.ok(i18nSource.includes("'watchlistDetail.entryIndicator': '建仓指标'"));
  assert.ok(i18nSource.includes("'watchlistDetail.entryIndicator': 'Entry Indicator'"));
  assert.ok(i18nSource.includes("'watchlistDetail.longTermTrend': '芒格指标'"));
  assert.ok(i18nSource.includes("'watchlistDetail.relativeQqq3m': '相对QQQ（3个月）'"));
  assert.ok(i18nSource.includes("'watchlistDetail.relativeQqq3m': 'vs QQQ (3M)'"));
  assert.equal(pageSource.includes('grid-cols-2 divide-x divide-y'), false);
});

test('production detail shares the Home logo candidate chain and reads the persisted cache URL', () => {
  assert.ok(pageSource.includes('const cachedLogoUrl = cachedLogoEntry?.url || cachedLogoEntry'));
  assert.ok(pageSource.includes('rows.watchlistRow?.logoURL'));
  assert.ok(pageSource.includes('rows.quoteRow?.logoURL'));
  assert.ok(pageSource.includes('onLogoLoad={cacheStockLogo}'));
});

test('target card keeps whole-card editing without redundant edit chrome or scale animation', () => {
  const targetButtonLine = pageSource.split('\n').find((line) => line.includes('data-watchlist-detail-section="target"')) || '';
  assert.ok(targetButtonLine.includes('setShowTargetEditor(true)'));
  assert.ok(targetButtonLine.includes('editTargetAria'));
  assert.equal(targetButtonLine.includes('scale-'), false);
  assert.equal(pageSource.includes('<Pencil'), false);
  assert.equal(pageSource.includes('<ChevronRight'), false);
  assert.equal(pageSource.includes("t(language, 'watchlistDetail.edit', '编辑')"), false);
  assert.ok(pageSource.includes('targetProgressPositionPercent(targetProgress)'));
});

test('production watchlist detail only mutates its isolated target and keeps holdings and trades read-only', () => {
  assert.ok(pageSource.includes('saveWatchlistStockTarget(symbol, normalizedTarget)'));
  assert.equal(pageSource.includes('autoRead'), false);
  assert.equal(pageSource.includes('formalLedgerReadOnly'), false);
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

test('production price chart uses real daily MA for short ranges and weekly MA only for five years', () => {
  assert.ok(pageSource.includes('data-watchlist-stock-detail-header="full-width-chart"'));
  assert.ok(pageSource.includes('data-watchlist-stock-price-chart="true"'));
  assert.ok(pageSource.includes('data-watchlist-stock-price-tooltip="true"'));
  assert.ok(pageSource.includes("stockDetailInitialRange = '5y'"));
  assert.ok(pageSource.includes("RANGE_IDS.includes(stockDetailInitialRange) ? stockDetailInitialRange : '5y'"));
  assert.ok(pageSource.includes('data-watchlist-stock-chart-ranges="five"'));
  assert.ok(pageSource.includes("data-watchlist-stock-chart-legend={range === '5y' ? 'price-weekly-ma' : 'price-daily-ma'}"));
  assert.ok(pageSource.includes("range === '5y'"));
  assert.ok(pageSource.includes('visibleWeeklyHistory.map(({ date, close })'));
  assert.ok(pageSource.includes('row?.completed === true && Number.isFinite(row?.ma200)'));
  assert.ok(pageSource.includes("const MA200_DAY_COLOR = '#60a5fa'"));
  assert.ok(pageSource.includes("const maColor = weeklyMa ? MA200_WEEK_COLOR : MA200_DAY_COLOR"));
  assert.ok(pageSource.includes("data-watchlist-daily-ma-line={weeklyMa ? undefined : 'true'}"));
  assert.ok(pageSource.includes("data-watchlist-weekly-ma-line={weeklyMa ? 'true' : undefined}"));
  assert.ok(pageSource.includes("Number.isFinite(selectedPoint.ma200) ? selectedPoint : null"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.ma200Daily', 'MA200（日）')"));
  assert.ok(devPreviewSource.includes('ma200: index >= 199 ? Number((rollingSum / 200).toFixed(4)) : null'));
  assert.ok(pageSource.includes('strokeWidth="0.95"'));
  assert.ok(pageSource.includes('strokeWidth="1.15"'));
  assert.ok(pageSource.includes('@keyframes watchlist-stock-price-breathe'));
  assert.ok(pageSource.includes('animation: watchlist-stock-price-breathe 3.2s ease-in-out infinite'));
  assert.ok(pageSource.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(pageSource.includes('data-watchlist-endpoint-breathe-ring="true"'));
  assert.ok(pageSource.includes('r="4.4" fill={PRICE_LINE_COLOR} pointerEvents="none"'));
  assert.ok(pageSource.includes('r="2.2" fill={PRICE_LINE_COLOR} stroke="#d6fff0" strokeWidth="0.65"'), 'the endpoint body should keep its existing size and styling');
  assert.equal(pageSource.includes('price-glow'), false);
  assert.equal(pageSource.includes('formatCurrency(last.close, currency)'), false, 'the chart endpoint should not repeat the latest stock price');
  assert.equal(pageSource.includes('chart.points'), false);
  assert.ok(pageSource.includes('setSelectedIndex(nearestIndex)'));
  assert.ok(pageSource.includes('window.setTimeout(() => setSelectedIndex(null), 12_000)'));
});

test('five-year chart pinches and supports single-finger horizontal panning without blocking vertical scroll', () => {
  assert.ok(pageSource.includes('const pinchEnabled = weeklyMa && rows.length > 26'));
  assert.ok(pageSource.includes('touchPointersRef = React.useRef(new Map())'));
  assert.ok(pageSource.includes('singleTouchGestureRef = React.useRef(null)'));
  assert.ok(pageSource.includes('transformStockDetailChartWindow(gesture.startWindow'));
  assert.ok(pageSource.includes('minPointCount: 26'));
  assert.ok(pageSource.includes('currentCenterRatio: plotRatioForClientX(currentCenterX)'));
  assert.ok(pageSource.includes('window.requestAnimationFrame'));
  assert.ok(pageSource.includes('suppressSinglePointerRef.current'));
  assert.ok(pageSource.includes("style={{ touchAction: 'pan-y' }}"));
  assert.ok(pageSource.includes('singleGesture.intent = stockDetailChartDragIntent(deltaX, deltaY)'));
  assert.ok(pageSource.includes('singleGesture.startedZoomed'));
  assert.ok(pageSource.includes('startCenterRatio: singleGesture.startCenterRatio'));
  assert.ok(pageSource.includes('currentCenterRatio: plotRatioForClientX(event.clientX)'));
  assert.ok(pageSource.includes('data-watchlist-stock-chart-reset="true"'));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.resetZoom', '重置')"));
  assert.ok(i18nSource.includes("'watchlistDetail.resetZoom': '重置'"));
  assert.ok(i18nSource.includes("'watchlistDetail.resetZoom': 'Reset'"));
  assert.ok(pageSource.includes('rows.findIndex((row) => row?.date === selectedPoint.date)'));
  assert.ok(pageSource.includes('const latestPointVisible = !weeklyMa || effectiveChartWindow.end === rows.length - 1'));
  assert.ok(pageSource.includes('{latestPointVisible ? ('));
  assert.ok(pageSource.includes('spanDays <= 370'));
  assert.ok(pageSource.includes('weeklyMa ? sliceStockDetailChartWindow(rows, effectiveChartWindow) : rows'));
});
