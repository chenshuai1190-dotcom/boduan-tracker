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

test('daily MA200 card keeps its methodology in the info hint and never presents weekly MA as the retest source', () => {
  assert.ok(cardSource.includes('回踩历史（MA200）'));
  assert.ok(cardSource.includes("import { Info } from 'lucide-react'"));
  assert.ok(cardSource.includes('近5次回踩'));
  assert.ok(cardSource.includes('拆股复权收盘价（不含现金分红）'));
  assert.ok(cardSource.includes('const DEFAULT_RECENT_REBOUND_DAYS = 20'));
  assert.ok(cardSource.includes('const DEFAULT_QUALIFICATION_VALID_TRADING_DAYS = 60'));
  assert.ok(cardSource.includes('const DEFAULT_OBSERVATION_TRADING_DAYS = 60'));
  assert.ok(cardSource.includes('finiteNumber(data?.recentReboundTradingDays)'));
  assert.ok(cardSource.includes('finiteNumber(data?.qualificationValidTradingDays)'));
  assert.ok(cardSource.includes('finiteNumber(data?.observationTradingDays)'));
  assert.ok(cardSource.includes('资格在未来${qualificationValidTradingDays}个交易日内有效'));
  assert.ok(cardSource.includes(`底图为触发日至第\${observationTradingDays}日终点收益`));
  assert.equal(cardSource.includes('口径：连续5个交易日'), false);
  assert.equal(cardSource.includes('仅供历史参考'), false);
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
  assert.ok(cardSource.includes('event?.recentRetestDepthPct'));
  assert.ok(cardSource.includes('event?.recentMaxReboundPct'));
  assert.ok(cardSource.includes('lowDate={event?.recentLowDate}'));
  assert.ok(cardSource.includes("status === 'failed' ? `>${recentReboundTradingDays}` : '—'"));
  assert.ok(cardSource.includes('event?.recentRecoveryTradingDays'));
  assert.ok(cardSource.includes('event?.recentReboundStatus'));
  assert.equal(/text-\\[(?:8|8\\.5|9|9\\.5)px\\]/.test(cardSource), false);
  assert.equal(/fontSize=["'](?:8|8\\.5|9|9\\.5)["']/.test(cardSource), false);
});

test('daily MA200 summary keeps all four metrics in one compact row on mobile', () => {
  assert.ok(cardSource.includes('data-ma200-retest-summary="compact-four-column"'));
  assert.ok(cardSource.includes('data-ma200-retest-summary-shell="borderless-inset"'));
  const summaryStart = cardSource.indexOf('data-ma200-retest-summary="compact-four-column"');
  const summaryWrapperStart = cardSource.lastIndexOf('<div', summaryStart);
  const summaryEnd = cardSource.indexOf('<RetestEventsTable', summaryStart);
  const summarySource = cardSource.slice(summaryWrapperStart, summaryEnd);
  assert.ok(summaryWrapperStart >= 0 && summaryEnd > summaryStart);
  assert.equal(summarySource.includes('grid-cols-2'), false);
  assert.ok(summarySource.includes('grid-cols-4'));
  assert.ok(summarySource.includes('overflow-hidden'));
  assert.ok(summarySource.includes('rounded-xl'));
  assert.equal(summarySource.includes('divide-x'), false);
  assert.equal(summarySource.includes('border border-white'), false);
  assert.ok(cardSource.includes('whitespace-nowrap'));
  assert.equal((summarySource.match(/<SummaryMetric/g) || []).length, 4);
  assert.ok(summarySource.includes('`${recentReboundTradingDays}日恢复率`'));
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
    '${recentReboundTradingDays}日内最深回踩后的最大反弹',
    '反弹天数',
    '${recentReboundTradingDays}日观察结果',
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

test('daily MA200 history plots only complete 60-session endpoint returns after the compact event table', () => {
  assert.ok(cardSource.includes('data-ma200-retest-distribution="forward-return"'));
  assert.ok(cardSource.includes('data-watchlist-detail-section="ma200-distribution"'));
  assert.ok(cardSource.includes('completedForwardReturnEvents(events, observationTradingDays)'));
  assert.ok(cardSource.includes("event?.status === 'recovered' || event?.status === 'failed'"));
  assert.ok(cardSource.includes('finiteNumber(event?.observedTradingDays)'));
  assert.ok(cardSource.includes('observedTradingDays < observationTradingDays'));
  assert.ok(cardSource.includes('finiteNumber(event?.forwardReturnPct)'));
  assert.ok(cardSource.includes("String(event?.forwardReturnEndDate || '')"));
  assert.ok(cardSource.includes('if (points.length === 0) return null'));
  assert.ok(cardSource.includes('${observationTradingDays}日样本 ${points.length} 次 · 未满${observationTradingDays}日不计'));
  assert.ok(cardSource.includes('触发后${observationTradingDays}日涨跌幅'));
  assert.ok(cardSource.includes('data-ma200-distribution-point="forward-return"'));
  assert.ok(cardSource.includes('data-ma200-distribution-label="forward-return"'));
  assert.ok(cardSource.includes('data-ma200-forward-return-end-date={event.forwardReturnEndDate}'));
  assert.ok(cardSource.includes('{formatPercent(event.forwardReturnPct)}'));
  assert.ok(cardSource.includes('第${observationTradingDays}个交易日收盘的涨跌幅'));
  assert.ok(cardSource.includes('.sort((left, right) => left.triggerDate.localeCompare(right.triggerDate))'));

  const eventTableIndex = cardSource.indexOf('<RetestEventsTable');
  const distributionIndex = cardSource.indexOf('<RetestHistoryDistribution', eventTableIndex);
  const distributionInvocation = cardSource.slice(
    distributionIndex,
    cardSource.indexOf('/>', distributionIndex) + 2,
  );
  const asOfDateIndex = cardSource.indexOf('data-ma200-retest-as-of-date=');
  assert.ok(eventTableIndex >= 0);
  assert.ok(distributionIndex > eventTableIndex);
  assert.ok(
    distributionInvocation.includes('events={visibleEvents}'),
    'the distribution must use the same latest-five rows as the table',
  );
  assert.ok(
    distributionInvocation.includes('observationTradingDays={observationTradingDays}'),
    'the distribution must enforce the post-trigger observation window',
  );
  assert.ok(asOfDateIndex > distributionIndex);
});

test('daily MA200 UI keeps the 60-session summary separate from the 20-session latest-five metrics', () => {
  assert.ok(cardSource.includes('value={formatPercent(summary?.averageMaxReboundPct)}'));
  assert.ok(cardSource.includes('finiteNumber(summary?.maxReboundSampleSize)'));
  assert.ok(cardSource.includes('`60日 · ${maxReboundSampleSize}次`'));
  assert.ok(cardSource.includes('{formatPercent(event?.recentMaxReboundPct)}'));
  assert.ok(cardSource.includes('{formatPercent(event?.recentRetestDepthPct)}'));
  assert.ok(cardSource.includes('`${recentReboundTradingDays}日反弹`'));
  assert.ok(cardSource.includes('`${recentReboundTradingDays}-session result`'));
  assert.equal(cardSource.includes('event?.recoveryTradingDays'), false);
  assert.equal(cardSource.includes('{formatPercent(event?.maxReboundPct)}'), false);
});

test('daily MA200 forward-return distribution has one market-colored point per event and no duplicate legend', () => {
  const distributionStart = cardSource.indexOf('function RetestHistoryDistribution');
  const distributionEnd = cardSource.indexOf('function EmptyState', distributionStart);
  const distributionSource = cardSource.slice(distributionStart, distributionEnd);

  assert.ok(cardSource.includes('data-ma200-distribution-zero-line="0-percent"'));
  assert.ok(cardSource.includes('const axisBound = Math.max('));
  assert.ok(distributionSource.includes('event.forwardReturnPct > 0'));
  assert.ok(distributionSource.includes('event.forwardReturnPct < 0'));
  assert.ok(distributionSource.includes('positiveColor'));
  assert.ok(distributionSource.includes('negativeColor'));
  assert.ok(distributionSource.includes('y1={zeroY}'));
  assert.ok(distributionSource.includes('y2={stemEndY}'));
  assert.ok(distributionSource.includes('data-ma200-distribution-stem="stops-before-point"'));
  assert.ok(distributionSource.includes('Math.max(12, returnY - 9)'));
  assert.ok(distributionSource.includes('Math.min(height - 20, returnY + 16)'));
  assert.ok(distributionSource.includes("style={{ fontFamily: NUMBER_FONT, paintOrder: 'stroke' }}"));
  assert.ok(distributionSource.includes('stroke="#0b0f14"'));
  assert.ok(distributionSource.includes('strokeWidth="2.5"'));
  assert.ok(distributionSource.includes("index === 0"));
  assert.ok(distributionSource.includes("index === points.length - 1"));
  assert.ok(cardSource.includes('strokeDasharray="4 4"'));
  assert.ok(cardSource.includes('className="mt-1.5 h-[126px] w-full max-w-full"'));
  assert.ok(cardSource.includes('scroll-mt-28 overflow-hidden rounded-xl'));
  assert.equal(distributionSource.includes('border border-white/[0.065]'), false);
  assert.equal(distributionSource.includes('data-ma200-distribution-point="retest-depth"'), false);
  assert.equal(distributionSource.includes('data-ma200-distribution-point="max-rebound"'), false);
  assert.equal(distributionSource.includes("copy(language, '回踩幅度', 'Retest depth')"), false);
  assert.equal(distributionSource.includes('日内最大反弹'), false);
  assert.equal((distributionSource.match(/data-ma200-distribution-point=/g) || []).length, 1);
  assert.equal(cardSource.includes('overflow-x-auto'), false);
  assert.equal(cardSource.includes('overflow-x-scroll'), false);
  assert.equal(/fontSize=["'](?:8|8\\.5|9|9\\.5)["']/.test(cardSource), false);
});

test('daily MA200 card keeps one outer frame and uses borderless inset sections', () => {
  const tableStart = cardSource.indexOf('function RetestEventsTable');
  const tableEnd = cardSource.indexOf('function completedForwardReturnEvents', tableStart);
  const tableSource = cardSource.slice(tableStart, tableEnd);
  const distributionStart = cardSource.indexOf('function RetestHistoryDistribution');
  const distributionEnd = cardSource.indexOf('function EmptyState', distributionStart);
  const distributionSource = cardSource.slice(distributionStart, distributionEnd);
  const cardStart = cardSource.indexOf('export default function Ma200RetestHistoryCard');
  const cardBody = cardSource.slice(cardStart);

  assert.ok(cardBody.includes('rounded-2xl border border-white/[0.09]'));
  assert.equal(tableSource.includes('border-y'), false);
  assert.equal(distributionSource.includes('rounded-xl border'), false);
  assert.ok(cardBody.includes('data-ma200-retest-summary-shell="borderless-inset"'));
  assert.ok(cardBody.includes('rounded-full bg-white/[0.045]'));
  assert.equal(cardBody.includes('rounded-full border'), false);
  assert.equal(cardBody.includes('mt-3 border-t border-white/[0.06] px-4 py-3'), false);
  assert.ok(cardBody.includes('data-ma200-retest-as-of-date={data.asOfDate}'));
  assert.equal(cardBody.includes('口径：'), false);
  assert.ok(cardSource.includes('items-center border-t border-white/[0.045]'));
  assert.equal(cardSource.includes('rounded-md border px-[1px]'), false);
});

test('development screenshot path loads a sanitized real local provider result', () => {
  assert.ok(devPreviewSource.includes("get('ma200Live') === '1'"));
  assert.ok(devPreviewSource.includes('window.location.hostname}:4175/stock-detail?symbol=NVDA'));
  assert.ok(devPreviewSource.includes('{ ...mockWatchlistStockDetailData, ...ma200LiveStockDetail }'));
  assert.ok(devPreviewSource.includes("get('visualWidth')"));
  assert.ok(devPreviewSource.includes("width: `${visualViewportWidth}px`"));
});
