import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../src/pages/WatchlistStockDetailPage.jsx', import.meta.url), 'utf8');
const cardSource = readFileSync(new URL('../src/components/Ma200RetestHistoryCard.jsx', import.meta.url), 'utf8');
const devPreviewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');

test('daily MA200 retest history sits directly below key metrics and before company valuation', () => {
  const metricsIndex = pageSource.indexOf('data-watchlist-key-metrics="spacious"');
  const metricsCloseIndex = pageSource.indexOf('</section>', metricsIndex);
  const retestIndex = pageSource.indexOf('<Ma200RetestHistoryCard');
  const valuationIndex = pageSource.indexOf('<CompanyValuationCard');
  assert.ok(metricsIndex >= 0);
  assert.ok(metricsCloseIndex > metricsIndex);
  assert.ok(metricsIndex < retestIndex && retestIndex < valuationIndex);
  assert.match(pageSource.slice(metricsCloseIndex + '</section>'.length, retestIndex), /^\s*$/);
  assert.ok(pageSource.includes('data={stockDetail?.ma200RetestHistory}'));
});

test('daily MA200 card labels its basis and never presents weekly MA as the retest source', () => {
  assert.ok(cardSource.includes('回踩历史（MA200）'));
  assert.ok(cardSource.includes("import { Info } from 'lucide-react'"));
  assert.ok(cardSource.includes('近5次回踩'));
  assert.ok(cardSource.includes('价格仅拆股复权，不含分红'));
  assert.ok(cardSource.includes('拆股复权收盘价（不含现金分红）'));
  assert.ok(cardSource.includes('顶部汇总按近5次触发中已完成的60个交易日样本计算'));
  assert.ok(cardSource.includes('明细均观察30个交易日'));
  assert.ok(cardSource.includes('未满窗口不计入统计'));
  assert.ok(cardSource.includes('仅供历史参考'));
  assert.equal(cardSource.includes('回踩后观察20个交易日'), false);
  assert.equal(cardSource.includes('20日反弹'), false);
  assert.equal(cardSource.includes('20 sessions'), false);
  assert.equal(cardSource.includes('MA200周线'), false);
  assert.ok(cardSource.includes('data-watchlist-ma200-retest-history="daily"'));
});

test('daily MA200 card renders real event states and respects the 10px typography floor', () => {
  assert.ok(cardSource.includes("status === 'recovered'"));
  assert.ok(cardSource.includes("status === 'failed'"));
  assert.ok(cardSource.includes('观察中'));
  assert.ok(cardSource.includes('已重返MA200'));
  assert.ok(cardSource.includes('连续2日站上'));
  assert.ok(cardSource.includes('event?.series'));
  assert.ok(cardSource.includes('event?.retestDepth30Pct'));
  assert.ok(cardSource.includes('event?.maxRebound30Pct'));
  assert.ok(cardSource.includes('lowDate={event?.low30Date}'));
  assert.ok(cardSource.includes("status === 'failed' ? '>30' : '—'"));
  assert.ok(cardSource.includes('event?.recovery30TradingDays'));
  assert.ok(cardSource.includes('event?.rebound30Status'));
  assert.equal(/text-\\[(?:8|8\\.5|9|9\\.5)px\\]/.test(cardSource), false);
  assert.equal(/fontSize=["'](?:8|8\\.5|9|9\\.5)["']/.test(cardSource), false);
});

test('daily MA200 summary keeps all four metrics in one compact row on mobile', () => {
  assert.ok(cardSource.includes('data-ma200-retest-summary="compact-four-column"'));
  assert.ok(cardSource.includes('data-ma200-retest-summary-shell="rounded-inset"'));
  const summaryStart = cardSource.indexOf('data-ma200-retest-summary="compact-four-column"');
  const summaryWrapperStart = cardSource.lastIndexOf('<div', summaryStart);
  const summaryEnd = cardSource.indexOf('<RetestEventsTable', summaryStart);
  const summarySource = cardSource.slice(summaryWrapperStart, summaryEnd);
  assert.ok(summaryWrapperStart >= 0 && summaryEnd > summaryStart);
  assert.equal(summarySource.includes('grid-cols-2'), false);
  assert.ok(summarySource.includes('grid-cols-4'));
  assert.ok(summarySource.includes('overflow-hidden'));
  assert.ok(summarySource.includes('rounded-xl'));
  assert.ok(cardSource.includes('whitespace-nowrap'));
  assert.equal((summarySource.match(/<SummaryMetric/g) || []).length, 4);
});

test('daily MA200 events use the reference-style compact seven-column table', () => {
  assert.ok(cardSource.includes("const TABLE_GRID = 'grid-cols-[15px_62px_42px_minmax(76px,1fr)_47px_30px_44px]'"));
  assert.ok(cardSource.includes('data-ma200-retest-table="compact-seven-column"'));
  assert.ok(cardSource.includes('data-ma200-retest-table-header="seven-columns"'));
  assert.ok(cardSource.includes('data-ma200-retest-row="compact-table"'));
  assert.ok(cardSource.includes('const visibleEvents = events.slice(0, 5)'));
  assert.ok(cardSource.includes('data-ma200-result-badge={status'));
  assert.ok(cardSource.includes('compactDate(event?.triggerDate, language)'));
  [
    '#',
    '触发日期',
    '回踩幅度',
    '迷你V形日线MA200图',
    '30日内最深回踩后的最大反弹',
    '反弹天数',
    '30日观察结果',
    '结果',
  ].forEach((label) => assert.ok(cardSource.includes(label), label));
  assert.ok(cardSource.includes('min-h-[58px]'));
  assert.ok(cardSource.includes('px-0.5'));
  assert.equal(cardSource.includes('gap-x-'), false);
  assert.equal(cardSource.includes('ChevronDown'), false);
  assert.equal(cardSource.includes('aria-expanded'), false);
  assert.equal(cardSource.includes('setExpanded'), false);
  assert.equal(cardSource.includes("copy(language, '最近事件'"), false);
});

test('daily MA200 mini chart is calculated from real event series with zero, low, and rebound segments', () => {
  assert.ok(cardSource.includes('normalizeSeries(rows)'));
  assert.ok(cardSource.includes('points.findIndex((point) => point.date === lowDate)'));
  assert.ok(cardSource.includes('data-ma200-event-mini-chart="actual-series"'));
  assert.ok(cardSource.includes('data-ma200-mini-zero-line="daily-ma200"'));
  assert.ok(cardSource.includes('data-ma200-mini-depth-segment="actual"'));
  assert.ok(cardSource.includes('data-ma200-mini-rebound-segment="actual"'));
  assert.ok(cardSource.includes('data-ma200-mini-low-point="actual"'));
  assert.ok(cardSource.includes('data-ma200-mini-rebound-point="actual"'));
  assert.ok(cardSource.includes('point.close > points[highestIndex].close'));
  assert.ok(cardSource.includes('if (points.length < 2)'));
});

test('daily MA200 history plots only completed 30-session windows after the compact event table', () => {
  assert.ok(cardSource.includes('data-ma200-retest-distribution="completed-events"'));
  assert.ok(cardSource.includes('data-watchlist-detail-section="ma200-distribution"'));
  assert.ok(cardSource.includes("event?.rebound30Complete === true"));
  assert.ok(cardSource.includes('finiteNumber(event?.retestDepth30Pct)'));
  assert.ok(cardSource.includes('finiteNumber(event?.maxRebound30Pct)'));
  assert.ok(cardSource.includes('if (points.length === 0) return null'));
  assert.ok(cardSource.includes('未满30日不计'));
  assert.ok(cardSource.includes('近5次回踩结果'));
  assert.ok(cardSource.includes('data-ma200-distribution-point="retest-depth"'));
  assert.ok(cardSource.includes('data-ma200-distribution-point="max-rebound"'));
  assert.ok(cardSource.includes('data-ma200-distribution-label="retest-depth"'));
  assert.ok(cardSource.includes('data-ma200-distribution-label="max-rebound"'));
  assert.ok(cardSource.includes('{formatPercent(event.retestDepthPct)}'));
  assert.ok(cardSource.includes('{formatPercent(event.maxReboundPct)}'));
  assert.ok(cardSource.includes('回踩幅度与30日反弹分布'));
  assert.ok(cardSource.includes('.sort((left, right) => left.triggerDate.localeCompare(right.triggerDate))'));

  const eventTableIndex = cardSource.indexOf('<RetestEventsTable');
  const distributionIndex = cardSource.indexOf('<RetestHistoryDistribution', eventTableIndex);
  const distributionInvocation = cardSource.slice(
    distributionIndex,
    cardSource.indexOf('/>', distributionIndex) + 2,
  );
  const basisCopyIndex = cardSource.indexOf('口径：收盘触及或跌破日线MA200');
  assert.ok(eventTableIndex >= 0);
  assert.ok(distributionIndex > eventTableIndex);
  assert.ok(
    distributionInvocation.includes('events={visibleEvents}'),
    'the distribution must use the same latest-five rows as the table',
  );
  assert.ok(basisCopyIndex > distributionIndex);
});

test('daily MA200 UI keeps the 60-session summary separate from the 30-session latest-five metrics', () => {
  assert.ok(cardSource.includes('value={formatPercent(summary?.averageMaxReboundPct)}'));
  assert.ok(cardSource.includes("detail={copy(language, '60日内最大', '60-session max')}"));
  assert.ok(cardSource.includes('{formatPercent(event?.maxRebound30Pct)}'));
  assert.ok(cardSource.includes('{formatPercent(event?.retestDepth30Pct)}'));
  assert.ok(cardSource.includes("copy(language, '30日反弹', '30d rebound')"));
  assert.ok(cardSource.includes("copy(language, '30日观察结果', '30-session result')"));
  assert.equal(cardSource.includes('event?.recoveryTradingDays'), false);
  assert.equal(cardSource.includes('{formatPercent(event?.maxReboundPct)}'), false);
});

test('daily MA200 distribution has a factual zero line and mobile-safe SVG contract', () => {
  assert.ok(cardSource.includes('data-ma200-distribution-zero-line="0-percent"'));
  assert.ok(cardSource.includes('const axisBound = Math.max('));
  assert.ok(cardSource.includes('depthY + 17 <= height - bottom - 2'));
  assert.ok(cardSource.includes('y={depthLabelY}'));
  assert.ok(cardSource.includes('reboundY - 8'));
  assert.ok(cardSource.includes('strokeDasharray="4 4"'));
  assert.ok(cardSource.includes('className="mt-1.5 h-[126px] w-full max-w-full"'));
  assert.ok(cardSource.includes('scroll-mt-28 overflow-hidden rounded-xl'));
  assert.equal(cardSource.includes('overflow-x-auto'), false);
  assert.equal(cardSource.includes('overflow-x-scroll'), false);
  assert.equal(/fontSize=["'](?:8|8\\.5|9|9\\.5)["']/.test(cardSource), false);
});

test('development screenshot path loads a sanitized real local provider result', () => {
  assert.ok(devPreviewSource.includes("get('ma200Live') === '1'"));
  assert.ok(devPreviewSource.includes('window.location.hostname}:4175/stock-detail?symbol=NVDA'));
  assert.ok(devPreviewSource.includes('{ ...mockWatchlistStockDetailData, ...ma200LiveStockDetail }'));
  assert.ok(devPreviewSource.includes("get('visualWidth')"));
  assert.ok(devPreviewSource.includes("width: `${visualViewportWidth}px`"));
});
