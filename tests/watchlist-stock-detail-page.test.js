import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const devPreviewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/lib/i18n.js', import.meta.url), 'utf8');
const fundamentalsCacheSource = readFileSync(new URL('../src/lib/stockFundamentals.js', import.meta.url), 'utf8');
const valuationCacheSource = readFileSync(new URL('../src/lib/stockValuation.js', import.meta.url), 'utf8');
const valuationCardSource = readFileSync(new URL('../src/components/CompanyValuationCard.jsx', import.meta.url), 'utf8');

test('watchlist detail keeps the existing bottom tabs and shows the symbol beside the stock-trend title', () => {
  assert.ok(pageSource.includes('pb-[calc(env(safe-area-inset-bottom)+86px)]'));
  assert.ok(pageSource.includes('data-watchlist-detail-heading="symbol-title"'));
  assert.ok(pageSource.includes('items-baseline justify-center gap-2'));
  assert.ok(pageSource.includes("{symbol || '--'}"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.title', '股票趋势')"));
  assert.ok(i18nSource.includes("'watchlistDetail.title': '股票趋势'"));
  assert.ok(i18nSource.includes("'watchlistDetail.title': 'Stock Detail'"), 'English title should remain unchanged');
  assert.ok(appSource.includes('hideBottomNavigation = isPnlReportPage;'));
  assert.equal(appSource.includes('hideBottomNavigation = isPnlReportPage || isHomeMarginRiskPage'), false);
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

test('company fundamentals load independently, cache per user for six hours, and fail closed inside their own card', () => {
  assert.ok(pageSource.includes('loadStockFundamentals({ userId, symbol, token })'));
  assert.ok(pageSource.includes("setFundamentalsStatus('loading')"));
  assert.ok(pageSource.includes("setFundamentalsStatus('unavailable')"));
  assert.ok(pageSource.includes("console.warn('[WatchlistStockDetail] fundamentals unavailable:'"));
  assert.ok(pageSource.includes('data-watchlist-company-fundamentals="true"'));
  assert.ok(pageSource.includes('data-fundamentals-status={status}'));
  assert.ok(pageSource.includes("return '—'"), 'missing fundamentals must use one em dash');
  assert.ok(pageSource.includes('grid grid-cols-3 gap-x-3 gap-y-[18px]'));
  assert.ok(pageSource.includes('text-[15px] font-normal tabular-nums'));
  assert.ok(pageSource.includes('text-[10px]'), 'fundamental suffixes should respect the global readable text floor');
  assert.equal(pageSource.includes('fundamentalsPromise'), false, 'the chart/detail Promise must never await fundamentals');
  assert.ok(fundamentalsCacheSource.includes('6 * 60 * 60 * 1000'));
  assert.ok(fundamentalsCacheSource.includes('`${normalizedUserId}:${normalized}`'));
  assert.ok(fundamentalsCacheSource.includes('inFlightRequests'));
  assert.ok(fundamentalsCacheSource.includes("cache: 'no-store'"));
  assert.ok(i18nSource.includes("'watchlistDetail.companyFundamentals': '基本信息'"));
  assert.ok(i18nSource.includes("'watchlistDetail.companyFundamentals': 'Company Fundamentals'"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.companyFundamentals', '基本信息')"));
  assert.ok(devPreviewSource.includes('marketCapitalization: 4_912_000_000_000'));
});

test('latest published earnings appear below fundamentals and open the existing detail page directly', () => {
  assert.ok(pageSource.includes('resolveWatchlistEarningsEvents(earningsEvents, symbol, marketDate)'));
  assert.ok(pageSource.includes('data-watchlist-published-earnings="true"'));
  assert.ok(pageSource.includes('data-watchlist-detail-section="earnings"'));
  assert.ok(pageSource.includes("onOpenDetail?.(event, { returnPage: 'watchlist-stock-detail' })"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.latestPublishedEarnings', '最近财报')"));
  assert.ok(pageSource.includes("t(language, 'earningsCalendar.revenueMetric', '营业收入')"));
  assert.ok(pageSource.includes("t(language, 'earningsCalendar.ebitMetric', '息税前利润')"));
  assert.ok(pageSource.includes("t(language, 'earningsCalendar.epsMetric', '每股收益')"));
  assert.ok(pageSource.includes("estimate: '—'"), 'profit estimates must remain unavailable instead of being inferred');
  assert.ok(pageSource.includes('earningsDetailSourceBadgeKind(null, event)'));
  assert.ok(pageSource.includes('formatEarningsDetailMoney(revenueActual, language)'));
  assert.ok(pageSource.includes('event={earnings.latestPublished}'));
  assert.ok(pageSource.includes('earnings.latestReactionEvent?.marketReactionPercent'));
  assert.ok(i18nSource.includes("'watchlistDetail.latestPublishedEarnings': '最近财报'"));
  assert.ok(i18nSource.includes("'watchlistDetail.latestPublishedEarnings': 'Latest Earnings'"));
  assert.ok(devPreviewSource.includes("officialActualSource: 'sec-companyfacts'"));
  assert.ok(devPreviewSource.includes('revenueActualUsd: 81_615_000_000'));
  assert.ok(devPreviewSource.includes('ebitActualUsd: 47_010_000_000'));

  const fundamentalsIndex = pageSource.indexOf('<CompanyFundamentalsCard');
  const earningsIndex = pageSource.indexOf('<PublishedEarningsCard');
  const targetIndex = pageSource.indexOf('data-watchlist-detail-section="target"');
  assert.ok(fundamentalsIndex < earningsIndex && earningsIndex < targetIndex, 'published earnings should sit between fundamentals and the target plan');
});

test('company valuation loads independently and presents only real five-year provider history', () => {
  assert.ok(pageSource.includes('loadStockValuation({ userId, symbol, token })'));
  assert.ok(pageSource.includes("setValuationStatus('loading')"));
  assert.ok(pageSource.includes("setValuationStatus('unavailable')"));
  assert.ok(pageSource.includes("console.warn('[WatchlistStockDetail] valuation unavailable:'"));
  assert.equal(pageSource.includes('valuationPromise'), false, 'the chart/detail Promise must never await valuation');
  assert.ok(pageSource.includes('<CompanyValuationCard'));
  assert.ok(valuationCardSource.includes('data-watchlist-detail-section="valuation"'));
  assert.ok(valuationCardSource.includes('data-watchlist-company-valuation="true"'));
  assert.ok(valuationCardSource.includes('data-watchlist-valuation-chart="true"'));
  assert.ok(valuationCardSource.includes('data-watchlist-valuation-tooltip="true"'));
  assert.ok(valuationCardSource.includes("document.addEventListener('pointerdown', closeOnOutsidePointer, true)"));
  assert.ok(valuationCardSource.includes("document.removeEventListener('pointerdown', closeOnOutsidePointer, true)"));
  assert.ok(valuationCardSource.includes('chartRef.current?.contains(event.target)'));
  assert.ok(valuationCardSource.includes('data-watchlist-valuation-summary="true"'));
  assert.match(valuationCardSource, /className="[^"]*text-center[^"]*"\s+data-watchlist-valuation-summary="true"/);
  assert.ok(valuationCardSource.includes("summaryParts.join(' · ')"));
  assert.ok(valuationCardSource.includes("'watchlistDetail.valuationObservations'"));
  assert.ok(valuationCardSource.includes("'watchlistDetail.valuationRange'"));
  assert.ok(valuationCardSource.includes("'watchlistDetail.valuationMedian'"));
  assert.ok(valuationCardSource.includes('items-center justify-center'));
  assert.equal(valuationCardSource.includes('复权收盘价 ÷ 当时已披露的滚动四季 EPS'), false);
  assert.equal(valuationCardSource.includes('统计：日频 · 曲线：每月最后交易日'), false);
  assert.equal(i18nSource.includes("'watchlistDetail.valuationMethod'"), false);
  assert.equal(i18nSource.includes("'watchlistDetail.valuationFrequencies'"), false);
  assert.ok(valuationCardSource.includes('不会补造历史百分位或比较基准'));
  assert.equal(valuationCardSource.includes('行业平均'), false);
  assert.equal(valuationCardSource.includes('标普500'), false);
  assert.ok(valuationCacheSource.includes('6 * 60 * 60 * 1000'));
  assert.ok(valuationCacheSource.includes('`${normalizedUserId}:${normalized}`'));
  assert.ok(valuationCacheSource.includes('inFlightRequests'));
  assert.ok(valuationCacheSource.includes('view=valuation'));
  assert.ok(valuationCacheSource.includes("'monthly-last-trading-day'"));
  assert.ok(valuationCacheSource.includes("'daily'"));
  assert.ok(valuationCacheSource.includes("cache: 'no-store'"));
  assert.ok(i18nSource.includes("'watchlistDetail.companyValuation': '公司估值'"));
  assert.ok(i18nSource.includes("'watchlistDetail.companyValuation': 'Company Valuation'"));
  assert.ok(valuationCardSource.includes("t(language, 'watchlistDetail.valuationPercentile', '超过历史（5年）')"));
  assert.ok(i18nSource.includes("'watchlistDetail.valuationPercentile': '超过历史（5年）'"));
  assert.ok(i18nSource.includes("'watchlistDetail.valuationPercentile': 'Above 5Y History'"));
  assert.equal(valuationCardSource.includes("t(language, 'watchlistDetail.valuationPercentile', '历史百分位')"), false);
  assert.ok(devPreviewSource.includes('percentile5y: 2.15'));
  assert.ok(devPreviewSource.includes('observationCount: 1254'));
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
  assert.ok(pageSource.includes('grid-cols-[0.84fr_0.84fr_1.32fr]'), 'the relative QQQ metric should receive enough width to keep both returns on one line');
  assert.ok(pageSource.includes('overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-white/[0.40]">{detail}'), 'metric details should remain single-line at the shared auxiliary size');
  assert.ok(pageSource.includes('normalizeStockDetailHistory(stockDetail?.relativeReturnHistory)'));
  assert.ok(pageSource.includes("stockDetail?.relativeReturnPriceBasis === 'adjusted_close'"));
  assert.ok(pageSource.includes('deriveThreeMonthQqqRelativeReturn(relativeReturnHistory, qqqComparisonHistory)'));
  assert.equal(pageSource.includes('deriveThreeMonthQqqRelativeReturn(history, qqqComparisonHistory)'), false);
  assert.ok(pageSource.includes('relativeReturnHistory.map((row) => ({ date: row.date, adjustedClose: row.close }))'));
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
  const targetBlock = pageSource.slice(
    pageSource.indexOf('data-watchlist-detail-section="target"'),
    pageSource.indexOf('data-watchlist-detail-section="events"'),
  );
  assert.ok(targetButtonLine.includes('setShowTargetEditor(true)'));
  assert.ok(targetButtonLine.includes('editTargetAria'));
  assert.equal(targetButtonLine.includes('scale-'), false);
  assert.equal(targetBlock.includes('<Pencil'), false);
  assert.equal(targetBlock.includes('<ChevronRight'), false);
  assert.equal(targetBlock.includes("t(language, 'watchlistDetail.edit', '编辑')"), false);
  assert.ok(pageSource.includes('targetProgressPositionPercent(targetProgress)'));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.costToTargetProgress', '成本至目标已完成')"));
  assert.ok(i18nSource.includes("'watchlistDetail.costToTargetProgress': '成本至目标已完成'"));
  assert.ok(i18nSource.includes("'watchlistDetail.costToTargetProgress': 'Cost-to-Target Completion'"));
  assert.equal(pageSource.includes("'成本至目标进度'"), false);
  const metricsIndex = pageSource.indexOf('data-watchlist-key-metrics="spacious"');
  const valuationIndex = pageSource.indexOf('<CompanyValuationCard');
  const fundamentalsIndex = pageSource.indexOf('<CompanyFundamentalsCard');
  const earningsIndex = pageSource.indexOf('<PublishedEarningsCard');
  const targetIndex = pageSource.indexOf('data-watchlist-detail-section="target"');
  const eventsIndex = pageSource.indexOf('data-watchlist-detail-section="events"');
  const positionIndex = pageSource.indexOf("t(language, 'watchlistDetail.myPosition'");
  const tradesIndex = pageSource.indexOf('data-watchlist-detail-section="trades"');
  assert.ok(metricsIndex < valuationIndex && valuationIndex < fundamentalsIndex && fundamentalsIndex < earningsIndex && earningsIndex < targetIndex && targetIndex < eventsIndex && eventsIndex < positionIndex && positionIndex < tradesIndex, 'approved module order should be metrics, valuation, fundamentals, published earnings, target, key events, position, then trades');
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
  assert.ok(pageSource.includes("touchAction: 'pan-y'"));
  assert.ok(pageSource.includes("userSelect: 'none'"));
  assert.ok(pageSource.includes("WebkitUserSelect: 'none'"));
  assert.ok(pageSource.includes("WebkitTouchCallout: 'none'"));
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
