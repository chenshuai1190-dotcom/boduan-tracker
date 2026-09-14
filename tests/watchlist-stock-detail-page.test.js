import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildEodhdStockDetail } from '../server/quote/stockDetail.js';
import { deriveMa200RetestDetail } from '../src/lib/ma200RetestDetail.js';
import { marketHexColor } from '../src/lib/marketColorMode.js';

const pageSource = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const devPreviewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/lib/i18n.js', import.meta.url), 'utf8');
const fundamentalsCacheSource = readFileSync(new URL('../src/lib/stockFundamentals.js', import.meta.url), 'utf8');
const valuationCacheSource = readFileSync(new URL('../src/lib/stockValuation.js', import.meta.url), 'utf8');
const valuationCardSource = readFileSync(new URL('../src/components/CompanyValuationCard.jsx', import.meta.url), 'utf8');
const targetEditorSource = readFileSync(new URL('../src/components/StockTargetEditor.jsx', import.meta.url), 'utf8');
const pageCssSource = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.css', import.meta.url), 'utf8');

test('watchlist detail keeps the existing bottom tabs and shows the symbol beside the stock-trend title', () => {
  assert.equal(pageSource.includes('pb-[calc(env(safe-area-inset-bottom)+86px)]'), false, 'the page must not duplicate the App bottom-navigation clearance');
  assert.ok(appSource.includes("hideBottomNavigation ? 'pb-0' : 'pb-24'"), 'the App shell should remain the single owner of bottom-navigation clearance');
  assert.ok(pageSource.includes('data-watchlist-detail-heading="symbol-title"'));
  assert.ok(pageSource.includes('items-baseline justify-center gap-2'));
  assert.ok(pageSource.includes("{symbol || '--'}"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.title', '股票趋势')"));
  assert.ok(
    pageSource.includes('<h1 className="flex min-w-0 items-baseline justify-center gap-2 text-center text-[17px] font-semibold leading-tight text-white/[0.78]" data-watchlist-detail-heading="symbol-title">'),
    'the symbol and stock-trend title should share the Stock P&L detail stock-code title treatment',
  );
  assert.ok(pageSource.includes('<span className="shrink-0">{symbol || \'--\'}</span>'));
  assert.equal(pageSource.includes('tracking-[0.08em] text-[#f6b54b]/80'), false, 'the symbol must not retain the old small gold treatment');
  assert.ok(i18nSource.includes("'watchlistDetail.title': '股票趋势'"));
  assert.ok(i18nSource.includes("'watchlistDetail.title': 'Stock Detail'"), 'English title should remain unchanged');
  assert.ok(appSource.includes('hideBottomNavigation = isPnlReportPage || isPnlSharePage;'));
  assert.equal(appSource.includes('hideBottomNavigation = isPnlReportPage || isHomeMarginRiskPage'), false);
  assert.ok(devPreviewSource.includes("activeTab !== 'pnl-report' && activeTab !== 'pnl-share' && ("));
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
  assert.ok(pageSource.includes('indicators?.ma50Weekly'));
  assert.ok(pageSource.includes('indicators?.ma50WeeklyStatus'));
  assert.ok(pageSource.includes('indicators?.ma200Weekly'));
  assert.ok(pageSource.includes('indicators?.ma200WeeklyStatus'));
  assert.equal(pageSource.includes('indicators?.volatility20AnnualizedPct'), false, 'volatility should no longer occupy the approved indicator surface');
});

test('stock trend reuses the detail response for RSI without requesting a separate benchmark or indicator', () => {
  assert.doesNotMatch(pageSource, /QQQ_BENCHMARK_CACHE|qqqBenchmarkRowsCache|fetchQqqBenchmarkRows|qqqPromise|fetchPnlBenchmarkRows|qqqHistory|qqqRelativeReturn/);
  assert.doesNotMatch(pageSource, /\/api\/pnl-benchmark|\/api\/technical|function=rsi/);
  assert.equal((pageSource.match(/\/api\/quote\?symbols=/g) || []).length, 1, 'the existing stock-detail response is the only quote read');
  assert.ok(pageSource.includes('const [nextDetail, nextEarnings] = await Promise.all([detailPromise, earningsPromise])'));
  assert.ok(pageSource.includes('setStockDetail(nextDetail)'));
  assert.match(pageSource, /stockRsiPresentation\(rsiSignal, language === 'en'\)/);
  assert.doesNotMatch(pageSource, /(?:rows\.(?:quoteRow|watchlistRow)|quoteRows|homeWatchlist)\??\.stockRsi/, 'the metric must not mix a cached quote signal with a different detail history');
  assert.ok(pageSource.includes("['QQQ', 'TQQQ'].includes(symbol)"), 'the independent fund-composition feature remains available');
  assert.ok(pageSource.includes('fetchFundComposition({ token, symbol })'));
});

// Execute the actual response callback: the production API returns stockRsi
// beside stockDetail, so checking the metric alone would miss a dropped field.
async function projectStockDetailResponse(body, { ok = true, symbol = 'META' } = {}) {
  const start = pageSource.indexOf('const detailPromise = fetch(');
  const callbackStart = pageSource.indexOf('.then(async (response) => {', start);
  const callbackEnd = pageSource.indexOf('\n        });', callbackStart);
  assert.ok(start >= 0 && callbackStart > start && callbackEnd > callbackStart, 'the authenticated detail response projection must be testable');
  const callbackBody = pageSource.slice(callbackStart + '.then(async (response) => {'.length, callbackEnd);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction('response', 'symbol', callbackBody)({ ok, json: async () => body }, symbol);
}

test('the actual detail response projection keeps RSI paired with the selected stock history', async () => {
  const stockDetail = Object.freeze({ history: [{ date: '2026-09-11', close: 648.03 }], currency: 'USD' });
  const stockRsi = Object.freeze({ period: 6, value: 78.540061933, asOf: '2026-09-11', priceBasis: 'adjusted_close', bearishDivergence: 'none', divergenceDate: null });
  const result = await projectStockDetailResponse({ success: true, data: [
    { symbol: 'NVDA', stockDetail: { history: [] }, stockRsi: { ...stockRsi, value: 12 } },
    { symbol: 'META', stockDetail, stockRsi },
  ] });
  assert.deepEqual(result, { ...stockDetail, stockRsi });
  assert.equal(result.history, stockDetail.history, 'the existing daily/weekly payload is not rebuilt or reinterpreted');
  assert.equal(result.stockRsi, stockRsi);
  assert.equal(Object.hasOwn(stockDetail, 'stockRsi'), false, 'the provider payload is not mutated');

  for (const freshSignal of [null, undefined]) {
    const missing = await projectStockDetailResponse({ data: [{
      symbol: 'META', stockDetail: { ...stockDetail, stockRsi }, stockRsi: freshSignal,
    }] });
    assert.equal(missing.stockRsi, null, 'an absent fresh signal cannot inherit a stale signal from another object');
  }
  for (const body of [
    { data: [{ symbol: 'NVDA', stockDetail, stockRsi }] },
    { data: [{ symbol: 'META', stockRsi }] },
    { success: false, error: 'request failed', data: [{ symbol: 'META', stockDetail, stockRsi }] },
  ]) {
    await assert.rejects(projectStockDetailResponse(body));
  }
  await assert.rejects(projectStockDetailResponse({ data: [{ symbol: 'META', stockDetail, stockRsi }] }, { ok: false }));
});

test('the trend metric waits for its completed chart date and cannot show an old symbol signal while loading', () => {
  const expression = pageSource.match(/const rsiSignal = ([\s\S]*?);/)?.[1];
  assert.ok(expression, 'the chart/signal pairing guard must precede presentation');
  const selectSignal = new Function('loading', 'stockDetail', 'close', `return (${expression});`);
  const stockRsi = { period: 6, value: 82.6, asOf: '2026-09-11', priceBasis: 'adjusted_close', bearishDivergence: 'confirmed', divergenceDate: '2026-09-10' };
  assert.equal(selectSignal(false, { stockRsi }, { asOfDate: '2026-09-11' }), stockRsi);
  assert.equal(selectSignal(true, { stockRsi }, { asOfDate: '2026-09-11' }), null);
  assert.equal(selectSignal(false, { stockRsi }, { asOfDate: '2026-09-10' }), null, 'a later RSI date must not be paired with an older chart close');
  assert.equal(selectSignal(false, { stockRsi }, { asOfDate: '2026-09-14' }), null, 'an older RSI date must not be promoted to the latest chart close');
  assert.equal(selectSignal(false, {}, { asOfDate: '2026-09-11' }), null);
  assert.equal(selectSignal(false, null, { asOfDate: null }), null);
  assert.equal(selectSignal(false, null, {}), null);
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
  assert.equal((pageSource.match(/usdToDisplayCurrency\(/g) || []).length, 2, 'only holding market value and P&L may be converted');
  assert.equal(pageSource.includes('displayCurrencyToUsd'), false, 'target prices must never be reinterpreted through the portfolio currency');
  assert.equal(pageSource.includes('displayRate='), false, 'the stock chart must never receive a portfolio FX rate');
  assert.ok(pageSource.includes('Number(targetUsd.toFixed(6))'));
  assert.ok(pageSource.includes("result?.success === false"), 'a failed DB result must not close the target editor optimistically');
});

test('watchlist position allocation fails closed until available cash is authoritative', () => {
  assert.ok(pageSource.includes('availableCashStatusReady = false'));
  assert.ok(pageSource.includes('availableCashStatusReady ? investmentSummary?.totalAssetsUsd : null'));
  assert.ok(pageSource.includes('[availableCashStatusReady, close.closeUsd, investmentSummary?.totalAssetsUsd, rows.position]'));
});

test('technical indicators retain the daily facts and expose three independently expandable moving-average rows', () => {
  assert.equal(pageSource.includes('metricSummary'), false);
  assert.ok(pageSource.includes('data-watchlist-key-metrics="spacious"'));
  assert.ok(pageSource.includes('data-watchlist-daily-metrics="borderless"'));
  assert.ok(pageSource.includes('data-watchlist-weekly-ma50-panel="true"'));
  assert.ok(pageSource.includes('data-watchlist-weekly-ma-panel="true"'));
  assert.ok(pageSource.includes('data-watchlist-ma200-entry-indicator="true"'));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.ma200Entry', 'MA200')"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.entryIndicator', '建仓指标')"));
  assert.ok(pageSource.includes('<IndicatorBadge indicator="entry" tone="blue">'));
  assert.equal(pageSource.includes('distanceMa200Daily'), false);
  assert.ok(pageSource.includes('data-watchlist-rsi-metric="true"'));
  assert.ok(pageSource.includes('stock-report-rsi-metric'));
  assert.ok(pageSource.includes('data-rsi-zone='));
  assert.ok(pageSource.includes('data-watchlist-rsi-divergence="true"'));
  assert.doesNotMatch(pageSource, /watchlistDetail\.relativeQqq3m|relativeReturnHistory|deriveThreeMonthQqqRelativeReturn/);
  assert.match(pageSource, /whitespace-nowrap text-\[11px\][^>]*>\{detail\}/, 'existing metric details remain single-line and readable');
  assert.equal(pageSource.includes('distanceEma30'), false);
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.completedWeeksBasis', '基于已完成交易周')"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.ma50Weekly', 'MA50（周）')"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.buffettIndicator', '巴菲特指标')"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.longTermTrend', '芒格指标')"));
  assert.ok(pageSource.includes('<IndicatorBadge indicator="ma50" tone="purple">'));
  assert.ok(pageSource.includes('<IndicatorBadge indicator="ma200">'));
  assert.ok(pageSource.includes("'bg-[#60a5fa]/[0.12] text-[#60a5fa]/85'"));
  assert.ok(pageSource.includes("'bg-[#a78bfa]/[0.12] text-[#a78bfa]/85'"));
  assert.ok(pageSource.includes("'bg-[#f6b54b]/[0.1] text-[#f6b54b]/75'"));
  assert.ok(i18nSource.includes("'watchlistDetail.entryIndicator': '建仓指标'"));
  assert.ok(i18nSource.includes("'watchlistDetail.entryIndicator': 'Entry Indicator'"));
  assert.ok(i18nSource.includes("'watchlistDetail.longTermTrend': '芒格指标'"));
  assert.ok(i18nSource.includes("'watchlistDetail.buffettIndicator': '巴菲特指标'"));
  assert.equal(pageSource.includes('grid-cols-2 divide-x divide-y'), false);
  const movingAverageRows = [...pageSource.matchAll(/<details\b[^>]*data-watchlist-(daily-ma|weekly-ma50|weekly-ma)-panel="true"[^>]*>[\s\S]*?<\/details>/g)].map((match) => match[0]);
  assert.equal(movingAverageRows.length, 3);
  for (const row of movingAverageRows) {
    assert.match(row, /className="stock-report-ma-row"/);
    assert.match(row, /<summary>/);
    assert.match(row, /className="stock-report-ma-expanded"/);
    assert.doesNotMatch(row.split('>')[0], /\bopen(?:=|\s|$)/, 'moving-average explanations should start collapsed');
  }
  assert.match(movingAverageRows[0], /MA200_DAY_COLOR/);
  assert.match(movingAverageRows[1], /MA50_WEEK_COLOR/);
  assert.match(movingAverageRows[2], /MA200_WEEK_COLOR/);
});

test('production detail shares the Home logo candidate chain and reads the persisted cache URL', () => {
  assert.ok(pageSource.includes('const cachedLogoUrl = cachedLogoEntry?.url || cachedLogoEntry'));
  assert.ok(pageSource.includes('rows.watchlistRow?.logoURL'));
  assert.ok(pageSource.includes('rows.quoteRow?.logoURL'));
  assert.ok(pageSource.includes('onLogoLoad={cacheStockLogo}'));
});

test('target report keeps whole-section editing with one quiet affordance and no scale animation', () => {
  const targetButtonSource = pageSource.match(/<button\b(?:(?!<button)[\s\S])*?data-watchlist-detail-section="target"[\s\S]*?<\/button>/)?.[0] || '';
  const targetBlock = pageSource.slice(
    pageSource.indexOf('data-watchlist-detail-section="target"'),
    pageSource.indexOf("t(language, 'watchlistDetail.myPosition'"),
  );
  assert.ok(targetButtonSource.includes('setShowTargetEditor(true)'));
  assert.ok(targetButtonSource.includes('editTargetAria'));
  assert.equal(targetButtonSource.includes('scale-'), false);
  assert.equal(targetBlock.includes('<Pencil'), false);
  assert.equal((targetButtonSource.match(/<ChevronRight\b/g) || []).length, 1);
  assert.ok(targetButtonSource.includes("language === 'en' ? 'Edit' : '编辑'"));
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
  assert.ok(metricsIndex < valuationIndex && valuationIndex < fundamentalsIndex && fundamentalsIndex < earningsIndex && earningsIndex < eventsIndex && eventsIndex < targetIndex && targetIndex < positionIndex, 'approved module order should be metrics, valuation, fundamentals, published earnings, key events, target, then position');
  assert.equal(tradesIndex, -1, 'recent trades should not appear on the stock-trend page');
});

test('production watchlist detail only mutates its isolated target, keeps holdings read-only, and omits recent trades', () => {
  assert.ok(pageSource.includes('saveWatchlistStockTarget(symbol, normalizedTarget)'));
  assert.equal(pageSource.includes('autoRead'), false);
  assert.equal(pageSource.includes('formalLedgerReadOnly'), false);
  assert.equal(pageSource.includes('data-watchlist-detail-section="trades"'), false);
  assert.equal(pageSource.includes("t(language, 'watchlistDetail.recentTrades'"), false);
  assert.equal(pageSource.includes('rows.trades.slice('), false);
  assert.ok(pageSource.includes("import TargetEditor from '../components/StockTargetEditor.jsx'"));
  assert.ok(targetEditorSource.includes('targetBoundary'));
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

test('production chart pairs daily and weekly MA200 in five-year view without duplicating daily MA200 elsewhere', () => {
  const chartSource = pageSource.slice(pageSource.indexOf('function PriceChart('), pageSource.indexOf('\nfunction MetricCell('));
  assert.ok(pageSource.includes('data-watchlist-stock-detail-header="full-width-chart"'));
  assert.ok(pageSource.includes('data-watchlist-stock-price-chart="true"'));
  assert.ok(pageSource.includes('data-watchlist-stock-price-tooltip="true"'));
  assert.ok(pageSource.includes("stockDetailInitialRange = '5y'"));
  assert.ok(pageSource.includes("RANGE_IDS.includes(stockDetailInitialRange) ? stockDetailInitialRange : '5y'"));
  assert.ok(pageSource.includes('data-watchlist-stock-chart-ranges="five"'));
  assert.ok(pageSource.includes("? 'price-weekly-ma-daily-ma'"));
  assert.ok(pageSource.includes(": 'price-daily-ma'"));
  assert.ok(pageSource.includes("range === '5y'"));
  assert.ok(chartSource.includes("const showDailyMa = range === '5y'"), 'the additional daily line appears only beside the five-year weekly line');
  assert.ok(pageSource.includes('visibleWeeklyHistory.map(({ date, close })'));
  assert.ok(pageSource.includes('dailyRows={visibleDailyMaHistory}'), 'the extra daily average must come from the full daily-MA history rather than relabeling weekly values');
  assert.ok(pageSource.includes('stockDetail?.ma200DailyHistory ?? stockDetail?.history'), 'older payloads retain the existing daily-history fallback');
  assert.ok(pageSource.includes('row?.completed === true && Number.isFinite(row?.ma200)'));
  assert.ok(pageSource.includes("const MA200_DAY_COLOR = '#60a5fa'"));
  assert.ok(pageSource.includes("const MA200_WEEK_COLOR = '#f6b54b'"));
  assert.ok(pageSource.includes("const MA50_WEEK_COLOR = '#a78bfa'"));
  assert.ok(pageSource.includes("const maColor = weeklyMa ? MA200_WEEK_COLOR : MA200_DAY_COLOR"));
  assert.ok(pageSource.includes("data-watchlist-daily-ma-line={weeklyMa ? undefined : 'true'}"));
  assert.ok(pageSource.includes("data-watchlist-weekly-ma-line={weeklyMa ? 'true' : undefined}"));
  assert.match(chartSource, /data-watchlist-daily-ma-line="true"[^>]*d=\{chart\.dailyMaPath\}[^>]*stroke=\{MA200_DAY_COLOR\}/);
  assert.ok(chartSource.includes('chart.dailyMaPoints.length >= 2'));
  assert.doesNotMatch(chartSource, /showWeeklyMa50|weekly-ma50-line|selectedMa50|ma50Label|MA50_WEEK_COLOR/,
    'weekly MA50 stays in the report below, not in the chart or tooltip');
  assert.ok(pageSource.includes("Number.isFinite(selectedPoint.ma200) ? selectedPoint : null"));
  const selectedDailyMa = chartSource.match(/const selectedDailyMaRow = ([\s\S]*?);/)?.[1];
  assert.ok(selectedDailyMa?.includes('dailyRows.find('));
  assert.match(selectedDailyMa, /row\??\.date === selectedPoint\.date/);
  assert.match(selectedDailyMa, /Number\.isFinite\(row\??\.ma200\)/);
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.ma200Daily', 'MA200（日）')"));
  assert.ok(pageSource.includes("t(language, 'watchlistDetail.ma50Weekly', 'MA50（周）')"));
  assert.ok(devPreviewSource.includes('ma200: index >= 199 ? Number((rollingSum / 200).toFixed(4)) : null'));
  assert.ok(devPreviewSource.includes('ma50: Number(ma50.toFixed(4))'));
  assert.ok(pageSource.includes('data-watchlist-price-line="range-direction"'));
  assert.match(pageSource, /data-watchlist-price-line="range-direction"[^>]*stroke=\{priceColor\}[^>]*strokeWidth="1\.3"/);
  assert.ok(pageSource.includes('strokeWidth="1.15"'));
  assert.ok(pageSource.includes('@keyframes watchlist-stock-price-breathe'));
  assert.ok(pageSource.includes('animation: watchlist-stock-price-breathe 3.2s ease-in-out infinite'));
  assert.ok(pageSource.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(pageSource.includes('data-watchlist-endpoint-breathe-ring="true"'));
  assert.ok(pageSource.includes('r="4.4" fill={priceColor} pointerEvents="none"'));
  assert.ok(pageSource.includes('r="2.2" fill={priceColor} stroke="#e4e4e7" strokeWidth="0.65"'), 'the endpoint should share the range direction and keep its compact size');
  assert.equal(pageSource.includes('price-glow'), false);
  assert.equal(pageSource.includes('formatCurrency(last.close, currency)'), false, 'the chart endpoint should not repeat the latest stock price');
  assert.equal(pageSource.includes('chart.points'), false);
  assert.ok(pageSource.includes('setSelectedIndex(nearestIndex)'));
  assert.equal(pageSource.includes('window.setTimeout(() => setSelectedIndex(null), 12_000)'), false);
});

test('the larger report chart follows the selected range direction and the configured market colors', () => {
  assert.ok(pageSource.includes('const CHART_HEIGHT = 308'));
  assert.ok(pageSource.includes('className="stock-report-chart-svg w-full overflow-visible"'));
  assert.match(pageCssSource, /\.stock-report-chart-svg(?:\s*,\s*\.stock-report-chart-empty)?\s*\{[^}]*height:\s*308px/);
  assert.ok(pageSource.includes('rangePriceColor(visibleHistory, marketColorMode)'));
  assert.ok(pageSource.includes('priceColor={chartPriceColor}'));
  assert.ok(pageSource.includes('style={{ backgroundColor: chartPriceColor }}'));
  assert.equal(pageSource.includes('const PRICE_LINE_COLOR'), false, 'the price line must not remain hard-coded green');
  const colorFunction = pageSource.match(/^function rangePriceColor\(rows, marketColorMode\) \{[\s\S]*?^\}/m)?.[0];
  assert.ok(colorFunction);
  const resolveColor = new Function('marketHexColor', `return (${colorFunction});`)(marketHexColor);
  const rise = [{ close: 100 }, { close: 110 }];
  const fall = [{ close: 110 }, { close: 100 }];
  assert.equal(resolveColor(rise, 'redUpGreenDown'), '#ff4b1f');
  assert.equal(resolveColor(fall, 'redUpGreenDown'), '#22c55e');
  assert.equal(resolveColor(rise, 'greenUpRedDown'), '#22c55e');
  assert.equal(resolveColor(fall, 'greenUpRedDown'), '#ff4b1f');
  for (const rows of [[], [{ close: 100 }], [{ close: 100 }, { close: 100 }], [{ close: null }, { close: 100 }]]) {
    assert.equal(resolveColor(rows, 'redUpGreenDown'), '#a1a1aa');
  }
});

test('price tooltip has wider mobile-bounded single-line metric rows', () => {
  const tooltipStart = pageSource.indexOf('data-watchlist-stock-price-tooltip="true"');
  const tooltipSource = pageSource.slice(tooltipStart, pageSource.indexOf('\nfunction MetricCell(', tooltipStart));
  assert.ok(tooltipSource.includes('stock-report-price-tooltip'));
  assert.ok(tooltipSource.includes("? 'left-2' : 'right-2'"));
  assert.equal(tooltipSource.includes('w-[188px]'), false);
  assert.equal((tooltipSource.match(/className="stock-report-tooltip-row"/g) || []).length, 3);
  assert.ok(tooltipSource.includes('{showDailyMa ?'));
  assert.ok(tooltipSource.includes('selectedDailyMaRow.ma200'));
  assert.doesNotMatch(tooltipSource, /MA50|ma50|Ma50/);
  assert.match(pageCssSource, /\.stock-report-price-tooltip\s*\{\s*width:\s*min\(300px,\s*calc\(100% - 16px\)\)/);
  assert.match(pageCssSource, /\.stock-report-tooltip-row > span\s*\{\s*white-space:\s*nowrap/);
  assert.match(pageCssSource, /\.stock-report-tooltip-row > span:first-child\s*\{\s*flex-shrink:\s*0/);
});

test('historical price selection persists until outside interaction, Escape, or Back to latest', () => {
  const chartSource = pageSource.slice(pageSource.indexOf('function PriceChart('), pageSource.indexOf('\nfunction MetricCell('));
  assert.doesNotMatch(chartSource, /setTimeout\(/, 'selection must not disappear on an elapsed timer');
  assert.ok(chartSource.includes('if (!chartRef.current?.contains(event.target)) setSelectedIndex(null)'));
  assert.ok(chartSource.includes("document.addEventListener('pointerdown', closeOutside)"));
  assert.ok(chartSource.includes("document.removeEventListener('pointerdown', closeOutside)"));
  assert.ok(chartSource.includes("if (event.key === 'Escape') { setSelectedIndex(null); return; }"));
  assert.match(chartSource, /selectedPoint\s*\?\s*<button[^>]*className="stock-report-chart-latest"[^>]*onClick=\{\(\) => setSelectedIndex\(null\)\}/);
  assert.ok(chartSource.includes("language === 'en' ? 'Back to latest' : '回到最新'"));
});

test('the default local MA200 fixture is deterministic, explicitly simulated, and uses the production result schema', () => {
  assert.ok(devPreviewSource.includes('ma200RetestHistory: buildMockWatchlistMa200RetestHistory()'));
  assert.match(devPreviewSource, /watchlistStockDetailDataOverride:\s*ma200LivePreview\s*\?/, 'a requested real preview must select its branch before the provider response arrives');
  const fixtureFunction = devPreviewSource.match(/^function buildMockWatchlistMa200RetestHistory\(\) \{[\s\S]*?^\}/m)?.[0];
  assert.ok(fixtureFunction);
  assert.doesNotMatch(fixtureFunction, /fetch\(|process\.env|Math\.random|Date\.now/);
  const createHistory = new Function('buildEodhdStockDetail', `return (${fixtureFunction})();`);
  const history = createHistory(buildEodhdStockDetail);
  assert.deepEqual(history, createHistory(buildEodhdStockDetail));
  assert.equal(history.previewOnly, true);
  assert.match(history.previewLabel, /模拟数据/);
  assert.equal(history.algorithmVersion, 'daily-ma200-retest-v5');
  assert.equal(history.basis, 'split_adjusted_close');
  assert.equal(history.asOfDate, '2026-07-17');
  assert.equal(history.status, 'ready');
  assert.equal(history.events.length, 5);
  assert.deepEqual(history.events.map((event) => event.status), ['observing', 'recovered', 'recovered', 'failed', 'recovered']);
  assert.equal(history.summary.resolvedSampleSize, 4);
  assert.equal(history.summary.recoveryRatePct, 75);
  assert.equal(history.currentCycle, null, 'independent historical examples must not claim a current price or cycle inconsistent with the page daily series');
  assert.equal(history.events[0].recentRetestDepthPct, null);
  assert.equal(history.events[0].forwardReturnPct, null);
  for (const event of history.events) {
    const detail = deriveMa200RetestDetail(event, history.observationTradingDays);
    assert.equal(detail.trigger.date, event.triggerDate);
    assert.equal(detail.complete, event.status !== 'observing');
    if (detail.complete) assert.equal(detail.endpoint.returnPct, event.forwardReturnPct);
  }
});

function selectLocalStockDetailOverride(ma200LivePreview, ma200LiveStockDetail, mockWatchlistStockDetailData) {
  const expression = devPreviewSource.match(/watchlistStockDetailDataOverride:\s*([\s\S]*?),\n\s*watchlistStockDetailEarningsOverride:/)?.[1];
  assert.ok(expression, 'the actual preview override must be available for behavioral verification');
  return new Function('ma200LivePreview', 'ma200LiveStockDetail', 'mockWatchlistStockDetailData', `return (${expression});`)(
    ma200LivePreview, ma200LiveStockDetail, mockWatchlistStockDetailData,
  );
}

test('requested real stock-trend preview never falls back to sample series or RSI while pending or failed', () => {
  const sample = Object.freeze({
    asOfDate: '2026-07-17',
    history: [{ date: '2026-07-17', close: 185 }],
    ma200DailyHistory: [{ date: '2026-07-17', close: 185, ma200: 160 }],
    weeklyHistory: [{ date: '2026-07-17', close: 185 }],
    ma200RetestHistory: { previewOnly: true, events: [{ status: 'recovered' }] },
    indicators: { ma200: 160, week52High: 195 },
    stockRsi: { period: 6, value: 83.6, asOf: '2026-07-17', priceBasis: 'adjusted_close', bearishDivergence: 'confirmed' },
  });
  assert.equal(selectLocalStockDetailOverride(false, null, sample), sample, 'ordinary visual fixtures remain unchanged');
  for (const missing of [null, undefined]) {
    const actual = selectLocalStockDetailOverride(true, missing, sample);
    assert.equal(actual.asOfDate, null);
    for (const key of ['history', 'ma200DailyHistory', 'weeklyHistory']) {
      assert.deepEqual(actual[key], [], `${key} cannot inherit simulated prices during a real-data load`);
    }
    assert.equal(actual.ma200RetestHistory, null);
    assert.deepEqual(actual.indicators, {});
    assert.equal(actual.stockRsi, null, 'neither a pending nor failed real request may display the 83.6 sample');
  }
});

test('real preview retains its provider history and paired RSI without filling an absent signal from the sample', () => {
  const sample = { stockRsi: { value: 83.6 }, history: [{ date: '2026-07-17', close: 185 }] };
  const signal = Object.freeze({ period: 6, value: 78.540061933, asOf: '2026-09-11', priceBasis: 'adjusted_close', bearishDivergence: 'none' });
  const live = Object.freeze({ asOfDate: '2026-09-11', history: [{ date: '2026-09-11', close: 648.03 }], stockRsi: signal });
  const actual = selectLocalStockDetailOverride(true, live, sample);
  assert.equal(actual.history, live.history);
  assert.equal(actual.stockRsi, signal);
  assert.equal(actual.stockRsi.asOf, actual.asOfDate);
  assert.equal(actual.history.at(-1).date, actual.stockRsi.asOf);
  const absent = selectLocalStockDetailOverride(true, { asOfDate: live.asOfDate, history: live.history }, sample);
  assert.equal(absent.stockRsi, null, 'an older local artifact without the new field must remain missing');
});

test('the actual local preview server projection carries the sibling RSI field into its stock-detail payload', () => {
  const serverSource = readFileSync(new URL('../scripts/ma200-retest-preview-server.mjs', import.meta.url), 'utf8');
  const dataExpression = serverSource.match(/const data = (\{[\s\S]*?\n    \});/)?.[1];
  assert.ok(dataExpression, 'the actual sanitized preview response projection must be testable');
  const project = new Function('quote', 'symbol', `return (${dataExpression});`);
  const signal = Object.freeze({ period: 6, value: 78.540061933, asOf: '2026-09-11', priceBasis: 'adjusted_close' });
  const history = Object.freeze([{ date: '2026-09-11', close: 648.03 }]);
  const detail = Object.freeze({ history, asOfDate: signal.asOf });
  const actual = project({ stockDetail: detail, stockRsi: signal }, 'META');
  assert.equal(actual.symbol, 'META');
  assert.equal(actual.stockDetail.stockRsi, signal);
  assert.equal(actual.stockDetail.history, history);
  assert.equal(actual.stockDetail.asOfDate, signal.asOf);
  assert.equal(Object.hasOwn(detail, 'stockRsi'), false);
  for (const missing of [null, undefined]) {
    const withoutSignal = project({ stockDetail: { ...detail, stockRsi: signal }, stockRsi: missing }, 'META');
    assert.equal(withoutSignal.stockDetail.stockRsi, null, 'missing provider RSI cannot inherit a signal nested in another payload');
  }
});

test('one-year and five-year charts share pinch zoom and horizontal panning without changing MA cadence', () => {
  assert.ok(pageSource.includes("const weeklyMa = range === '5y'"), 'one-year must keep the daily MA200 cadence');
  assert.ok(pageSource.includes("const chartZoomEnabled = range === '1y' || range === '5y'"));
  assert.ok(pageSource.includes('const pinchEnabled = chartZoomEnabled && rows.length > 26'));
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
  assert.ok(pageSource.includes('const latestPointVisible = !chartZoomEnabled || effectiveChartWindow.end === rows.length - 1'));
  assert.ok(pageSource.includes('{latestPointVisible ? ('));
  assert.ok(pageSource.includes('spanDays <= 370'));
  assert.ok(pageSource.includes('chartZoomEnabled ? sliceStockDetailChartWindow(rows, effectiveChartWindow) : rows'));
});
