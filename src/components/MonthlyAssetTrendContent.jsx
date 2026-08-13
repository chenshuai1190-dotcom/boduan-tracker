import React from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { t } from '../lib/i18n.js';
import {
  buildMonthlyAssetTrend,
  DEFAULT_COLLAPSED_MONTH_COUNT,
  visibleMonthlyAssetTrendSlots,
} from '../lib/monthlyAssetTrend.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const UP_COLOR = '#ff4b1f';
const DOWN_COLOR = '#50d0a2';
const CHART_COLOR = '#50d0a2';
const CHART_LATEST_COLOR = '#75a7ff';
const CHART_BOUNDS = Object.freeze({ left: 48, right: 348, top: 22, bottom: 162 });

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatWan(value, language, digits = 1) {
  if (!Number.isFinite(value)) return '--';
  if (language === 'zh') return `${formatNumber(value / 10000, digits)}万`;
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${formatNumber(value / 1_000_000, digits)}M`;
  if (absolute >= 1_000) return `${formatNumber(value / 1_000, digits)}K`;
  return formatNumber(value, digits);
}

function formatMoney(value, language) {
  if (!Number.isFinite(value)) return '--';
  return `¥${formatWan(value, language)}`;
}

function formatPrimaryMoney(value, language) {
  if (!Number.isFinite(value)) return { amount: '--', unit: '' };
  if (language === 'zh') return { amount: `¥${formatNumber(value / 10000, 1)}`, unit: '万' };
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return { amount: `¥${formatNumber(value / 1_000_000, 1)}`, unit: 'M' };
  if (absolute >= 1_000) return { amount: `¥${formatNumber(value / 1_000, 1)}`, unit: 'K' };
  return { amount: `¥${formatNumber(value, 1)}`, unit: '' };
}

function formatSignedAmount(value, language) {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : '-'}${formatWan(Math.abs(value), language)}`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatMonthAxis(month, language, first = false) {
  const [year, rawMonth] = String(month || '').split('-');
  if (!year || !rawMonth) return '--';
  if (first) return language === 'zh' ? `${year}-${rawMonth}` : `${rawMonth}/${year.slice(-2)}`;
  return language === 'zh' ? `${rawMonth}月` : rawMonth;
}

function smoothPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function chartScale(model, monthCount) {
  const values = model.points.map(point => point.balance);
  const rawMin = values.length > 0 ? Math.min(...values) : 0;
  const rawMax = values.length > 0 ? Math.max(...values) : 1;
  const rawRange = Math.max(rawMax - rawMin, rawMax * 0.08, 1);
  const stepMagnitude = 10 ** Math.floor(Math.log10(rawRange / 4));
  const normalizedStep = rawRange / 4 / stepMagnitude;
  const roundedStep = (normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10) * stepMagnitude;
  const min = Math.max(0, Math.floor((rawMin - rawRange * 0.15) / roundedStep) * roundedStep);
  const max = Math.max(min + roundedStep, Math.ceil((rawMax + rawRange * 0.12) / roundedStep) * roundedStep);
  const range = max - min;
  const xForIndex = index => CHART_BOUNDS.left
    + (index / Math.max(monthCount - 1, 1)) * (CHART_BOUNDS.right - CHART_BOUNDS.left);
  const yForValue = value => CHART_BOUNDS.bottom
    - ((value - min) / range) * (CHART_BOUNDS.bottom - CHART_BOUNDS.top);
  const pointsByIndex = new Map(model.points.map(point => [point.index, {
    ...point,
    x: xForIndex(point.index),
    y: yForValue(point.balance),
  }]));

  return {
    min,
    max,
    range,
    xForIndex,
    yForValue,
    pointsByIndex,
    ticks: Array.from({ length: 5 }, (_, index) => max - (range / 4) * index),
  };
}

function TrendValueLabel({ x, y, width, children, tone = 'peak' }) {
  const boxX = Math.max(2, Math.min(354 - width, x - width / 2));
  return (
    <g pointerEvents="none">
      <rect
        x={boxX}
        y={y}
        width={width}
        height="24"
        rx="7"
        fill={tone === 'latest' ? '#111a29' : '#101a19'}
        stroke={tone === 'latest' ? 'rgba(117,167,255,.52)' : 'rgba(80,208,162,.45)'}
      />
      <text
        x={boxX + width / 2}
        y={y + 15.5}
        textAnchor="middle"
        fill={tone === 'latest' ? '#eef4ff' : '#6ce0b6'}
        fontSize="10"
        fontFamily={NUMBER_FONT}
      >
        {children}
      </text>
    </g>
  );
}

export default function MonthlyAssetTrendContent({
  language = 'zh',
  months = [],
  values = [],
  currentMonth = '',
  comparisonStartMonth = '',
  comparisonStartValue = null,
  onEditMonth,
}) {
  const activePointerIdRef = React.useRef(null);
  const [expanded, setExpanded] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const detailModel = React.useMemo(() => buildMonthlyAssetTrend({ months, values }), [months, values]);
  const chartMonths = React.useMemo(() => (
    comparisonStartMonth && comparisonStartMonth !== months[0]
      ? [comparisonStartMonth, ...months]
      : months
  ), [comparisonStartMonth, months]);
  const chartValues = React.useMemo(() => (
    comparisonStartMonth && comparisonStartMonth !== months[0]
      ? [comparisonStartValue, ...values]
      : values
  ), [comparisonStartMonth, comparisonStartValue, months, values]);
  const chartModel = React.useMemo(
    () => buildMonthlyAssetTrend({ months: chartMonths, values: chartValues }),
    [chartMonths, chartValues],
  );
  const scale = React.useMemo(() => chartScale(chartModel, chartMonths.length), [chartModel, chartMonths.length]);
  const visibleSlots = React.useMemo(
    () => visibleMonthlyAssetTrendSlots(detailModel.slots, expanded),
    [detailModel.slots, expanded],
  );
  const tt = React.useCallback((key, fallback, replacements) => (
    t(language, key, fallback, replacements)
  ), [language]);

  const currentSlot = chartModel.currentSlot;
  const selectedSlot = selectedIndex === null ? null : chartModel.slots[selectedIndex];
  const selectedPoint = selectedSlot?.hasData ? scale.pointsByIndex.get(selectedIndex) : null;
  const latestPoint = currentSlot ? scale.pointsByIndex.get(currentSlot.index) : null;
  const maxPoint = chartModel.maxPoint ? scale.pointsByIndex.get(chartModel.maxPoint.index) : null;
  const maxLabelOverlapsLatest = maxPoint && latestPoint && maxPoint.index === latestPoint.index;
  const comparison = currentSlot?.hasPreviousMonth ? currentSlot : null;
  const comparisonTone = comparison && comparison.changeAmount >= 0 ? UP_COLOR : DOWN_COLOR;
  const primaryMoney = formatPrimaryMoney(currentSlot?.balance, language);
  const lineSegments = chartModel.segments.map(segment => segment.map(point => scale.pointsByIndex.get(point.index)));
  const labelIndexes = new Set([0, 2, 4, 6, 8, 10, chartMonths.length - 1].filter(index => index >= 0 && index < chartMonths.length));

  const selectNearestPoint = React.useCallback((event) => {
    if (chartModel.points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const viewX = ((event.clientX - bounds.left) / bounds.width) * 356;
    let nearest = chartModel.points[0];
    let distance = Number.POSITIVE_INFINITY;
    chartModel.points.forEach((point) => {
      const candidateDistance = Math.abs(scale.xForIndex(point.index) - viewX);
      if (candidateDistance < distance) {
        nearest = point;
        distance = candidateDistance;
      }
    });
    setSelectedIndex(nearest.index);
  }, [chartModel.points, scale]);

  const handlePointerDown = React.useCallback((event) => {
    if (event.isPrimary === false) return;
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectNearestPoint(event);
  }, [selectNearestPoint]);

  const handlePointerMove = React.useCallback((event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    selectNearestPoint(event);
  }, [selectNearestPoint]);

  const finishPointerTracking = React.useCallback((event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }, []);

  return (
    <div className="min-w-0" data-monthly-asset-trend="true">
      <section className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3" aria-label={tt('analysis.currentAssetSummary', '当前资产摘要')}>
        <div className="min-w-0">
          <div className="text-[11px] leading-tight text-white/[0.50]">
            {tt('analysis.currentAssetsForMonth', '当前资产（{{month}}）', { month: currentMonth })}
          </div>
          <div
            className="mt-[7px] overflow-hidden text-ellipsis whitespace-nowrap text-[34px] font-medium leading-none tracking-[-0.8px] text-white/[0.95] tabular-nums"
            style={{ fontFamily: NUMBER_FONT }}
          >
            <span>{primaryMoney.amount}</span>
            {primaryMoney.unit && (
              <span className="ml-1 align-baseline text-[17px] font-normal tracking-normal text-white/[0.72]">
                {primaryMoney.unit}
              </span>
            )}
          </div>
        </div>
        <div className="pb-0.5 text-right">
          <div className="text-[11px] leading-tight text-white/[0.50]">{tt('analysis.vsLastMonth', '较上月')}</div>
          {comparison ? (
            <div
              className="mt-[7px] flex items-center justify-end gap-[7px] whitespace-nowrap text-[13px] tabular-nums"
              style={{ color: comparisonTone, fontFamily: NUMBER_FONT }}
            >
              <span>{formatSignedAmount(comparison.changeAmount, language)}</span>
              <span>{formatSignedPercent(comparison.changePct)}</span>
              <span>{comparison.changeAmount >= 0 ? '↑' : '↓'}</span>
            </div>
          ) : (
            <div className="mt-[7px] text-[12px] text-white/[0.30]">--</div>
          )}
        </div>
      </section>

      <div
        className="mt-2 h-[199px] select-none touch-pan-y"
        aria-label={tt('analysis.assetTrendChartRange', '{{start}} 至 {{end}}资产走势', {
          start: chartMonths[0] || '--',
          end: chartMonths.at(-1) || '--',
        })}
      >
        {chartModel.points.length > 0 ? (
          <svg
            viewBox="0 0 356 199"
            className="block h-full w-full overflow-visible"
            data-monthly-asset-trend-chart="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerTracking}
            onPointerCancel={finishPointerTracking}
            onLostPointerCapture={finishPointerTracking}
            style={{ touchAction: 'pan-y' }}
          >
            <defs>
              <linearGradient id="monthlyAssetTrendArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLOR} stopOpacity="0.28" />
                <stop offset="100%" stopColor={CHART_COLOR} stopOpacity="0.015" />
              </linearGradient>
              <filter id="monthlyAssetLatestGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {scale.ticks.map((tick, index) => {
              const y = CHART_BOUNDS.top + ((CHART_BOUNDS.bottom - CHART_BOUNDS.top) / 4) * index;
              return (
                <g key={`${tick}-${index}`}>
                  <line x1={CHART_BOUNDS.left} x2={CHART_BOUNDS.right} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                  <text x={CHART_BOUNDS.left - 7} y={y + 3.5} textAnchor="end" fill="rgba(235,239,245,0.48)" fontSize="10" fontFamily={NUMBER_FONT}>
                    {formatWan(tick, language, 0)}
                  </text>
                </g>
              );
            })}

            {lineSegments.map((points, index) => {
              if (points.length < 2) return null;
              const path = smoothPath(points);
              return (
                <React.Fragment key={`segment-${index}`}>
                  <path d={`${path} L ${points.at(-1).x} ${CHART_BOUNDS.bottom} L ${points[0].x} ${CHART_BOUNDS.bottom} Z`} fill="url(#monthlyAssetTrendArea)" />
                  <path d={path} fill="none" stroke={CHART_COLOR} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </React.Fragment>
              );
            })}

            {chartModel.segments.filter(segment => segment.length === 1).map((segment) => {
              const point = scale.pointsByIndex.get(segment[0].index);
              return <circle key={`single-${point.index}`} cx={point.x} cy={point.y} r="2.4" fill={CHART_COLOR} />;
            })}

            {maxPoint && !maxLabelOverlapsLatest && (
              <>
                <circle cx={maxPoint.x} cy={maxPoint.y} r="5.3" fill="#153e32" stroke={CHART_COLOR} strokeWidth="2" />
                <TrendValueLabel x={maxPoint.x - 3} y={Math.max(1, maxPoint.y - 31)} width={language === 'zh' ? 102 : 112}>
                  {tt('analysis.highestAssetShort', '最高 {{amount}}', { amount: formatWan(maxPoint.balance, language) })}
                </TrendValueLabel>
              </>
            )}

            {latestPoint && (
              <>
                <circle cx={latestPoint.x} cy={latestPoint.y} r="8" fill={CHART_LATEST_COLOR} opacity="0.18" filter="url(#monthlyAssetLatestGlow)" />
                <circle cx={latestPoint.x} cy={latestPoint.y} r="4.5" fill="#f5f7fb" stroke={CHART_LATEST_COLOR} strokeWidth="2" />
                <TrendValueLabel x={latestPoint.x - 30} y={Math.min(169, latestPoint.y + 13)} width={maxLabelOverlapsLatest ? 104 : 78} tone="latest">
                  {maxLabelOverlapsLatest
                    ? tt('analysis.highestAssetShort', '最高 {{amount}}', { amount: formatWan(latestPoint.balance, language) })
                    : formatWan(latestPoint.balance, language)}
                </TrendValueLabel>
              </>
            )}

            {selectedPoint && selectedPoint.index !== latestPoint?.index && (
              <>
                <line x1={selectedPoint.x} x2={selectedPoint.x} y1={CHART_BOUNDS.top} y2={CHART_BOUNDS.bottom} stroke="rgba(255,255,255,.16)" strokeDasharray="3 4" />
                <circle cx={selectedPoint.x} cy={selectedPoint.y} r="4" fill="#f5f7fb" stroke={CHART_COLOR} strokeWidth="2" />
                <TrendValueLabel x={selectedPoint.x} y={Math.max(1, selectedPoint.y - 31)} width={language === 'zh' ? 112 : 118} tone="latest">
                  {`${selectedPoint.month} · ${formatWan(selectedPoint.balance, language)}`}
                </TrendValueLabel>
              </>
            )}

            {chartMonths.map((month, index) => {
              if (!labelIndexes.has(index)) return null;
              const first = index === 0;
              const last = index === chartMonths.length - 1;
              const labelX = scale.xForIndex(index) + (index === 2 ? 8 : 0);
              return (
                <text
                  key={month}
                  x={labelX}
                  y="187"
                  textAnchor={first ? 'start' : last ? 'end' : 'middle'}
                  fill="rgba(235,239,245,0.43)"
                  fontSize="10"
                  fontFamily={NUMBER_FONT}
                >
                  {formatMonthAxis(month, language, first)}
                </text>
              );
            })}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-white/[0.32]">
            {tt('analysis.noData', '无数据')}
          </div>
        )}
      </div>

      <section
        className="mx-0.5 grid min-h-[60px] grid-cols-2 rounded-[16px] border border-white/[0.075] bg-white/[0.045] py-[10px]"
        aria-label={tt('analysis.assetTrendSummary', '资产走势摘要')}
      >
        <div className="min-w-0 px-3">
          <div className="text-[10px] leading-none text-white/[0.50]">{tt('analysis.twelveMonthAssetChange', '近 12 月资产变化')}</div>
          <div className="mt-[8px] flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[16px] tabular-nums" style={{ color: Number.isFinite(chartModel.windowChangeAmount) ? (chartModel.windowChangeAmount >= 0 ? UP_COLOR : DOWN_COLOR) : 'rgba(255,255,255,.28)', fontFamily: NUMBER_FONT }}>
              {formatSignedAmount(chartModel.windowChangeAmount, language)}
            </span>
            <span className="text-[11px] tabular-nums" style={{ color: Number.isFinite(chartModel.windowChangePct) ? (chartModel.windowChangePct >= 0 ? UP_COLOR : DOWN_COLOR) : 'rgba(255,255,255,.28)', fontFamily: NUMBER_FONT }}>
              {formatSignedPercent(chartModel.windowChangePct)}
            </span>
          </div>
        </div>
        <div className="min-w-0 border-l border-white/[0.09] px-3">
          <div className="text-[10px] leading-none text-white/[0.50]">{tt('analysis.highestAssets', '最高资产')}</div>
          <div className="mt-[8px] flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[16px] text-white/[0.94] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
              {chartModel.maxPoint ? formatMoney(chartModel.maxPoint.balance, language) : '--'}
            </span>
            <span className="text-[11px] text-white/[0.47] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
              {chartModel.maxPoint?.month || '--'}
            </span>
          </div>
        </div>
      </section>

      <section className="mt-[11px] overflow-hidden rounded-[17px] border border-white/[0.075] bg-black/[0.12]">
        <div className="flex min-h-[45px] items-center justify-between gap-2 px-[11px]">
          <div className={`${language === 'en' ? 'flex-col items-start justify-center' : 'items-baseline'} flex min-w-0 gap-[3px] whitespace-nowrap`}>
            <span className="text-[14px] font-medium text-white/[0.91]">{tt('analysis.monthlyDetails', '月度明细')}</span>
            <span className="truncate text-[10px] text-white/[0.34]">
              {tt('analysis.recentMonthsDefault', '默认最近 {{count}} 个月', { count: DEFAULT_COLLAPSED_MONTH_COUNT })}
            </span>
          </div>
          <button
            type="button"
            data-asset-trend-toggle="true"
            className="flex shrink-0 items-center gap-1 border-0 bg-transparent py-1.5 pl-1.5 text-[10px] text-white/[0.53]"
            aria-expanded={expanded}
            onClick={() => setExpanded(value => !value)}
          >
            <span>
              {expanded
                ? tt('analysis.collapseToRecentMonths', '收起至最近 {{count}} 个月', { count: DEFAULT_COLLAPSED_MONTH_COUNT })
                : tt('analysis.expandAllMonths', '展开全部 {{count}} 个月', { count: detailModel.slots.length })}
            </span>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? '-rotate-90' : 'rotate-90'}`} strokeWidth={1.8} />
          </button>
        </div>

        <div className="grid min-h-[32px] grid-cols-[86px_minmax(70px,1fr)_minmax(68px,0.96fr)_49px_10px] items-center gap-x-0.5 border-y border-white/[0.055] bg-white/[0.035] px-2 text-[10px] text-white/[0.43]">
          <span>{tt('analysis.monthColumn', '月份')}</span>
          <span className="text-right">{tt('analysis.monthEndAssets', '月末资产')}</span>
          <span className="text-right">{tt('analysis.monthlyChange', '月度涨跌')}</span>
          <span className="text-right">{tt('analysis.changeRate', '涨跌幅')}</span>
          <span />
        </div>

        <div>
          {visibleSlots.map((slot) => {
            const tone = slot.changeAmount >= 0 ? UP_COLOR : DOWN_COLOR;
            return (
              <button
                key={slot.month}
                type="button"
                data-asset-trend-month-row={slot.month}
                className="grid min-h-[42px] w-full grid-cols-[86px_minmax(70px,1fr)_minmax(68px,0.96fr)_49px_10px] items-center gap-x-0.5 border-0 border-b border-solid border-white/[0.055] bg-transparent px-2 text-left last:border-b-0 active:bg-white/[0.045]"
                aria-label={tt('analysis.editMonthlyBalanceFor', '修改 {{month}} 月度余额', { month: slot.month })}
                onClick={() => onEditMonth?.(slot.month)}
              >
                <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-white/[0.86] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                  <span>{slot.month}</span>
                  {slot.month === currentMonth && (
                    <span className="shrink-0 rounded-[5px] border border-[#f6b54b]/25 bg-[#f6b54b]/[0.09] px-1 py-0.5 text-[10px] leading-none text-[#f6b54b]">
                      {tt('analysis.thisMonth', '本月')}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap text-right text-[11px] text-white/[0.86] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                  {slot.hasData ? formatWan(slot.balance, language) : '--'}
                </span>
                <span className="whitespace-nowrap text-right text-[11px] tabular-nums" style={{ color: Number.isFinite(slot.changeAmount) ? tone : 'rgba(255,255,255,.28)', fontFamily: NUMBER_FONT }}>
                  {formatSignedAmount(slot.changeAmount, language)}
                </span>
                <span className="whitespace-nowrap text-right text-[11px] tabular-nums" style={{ color: Number.isFinite(slot.changePct) ? tone : 'rgba(255,255,255,.28)', fontFamily: NUMBER_FONT }}>
                  {formatSignedPercent(slot.changePct)}
                </span>
                <ChevronRight className="h-4 w-4 text-white/[0.44]" strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-[9px] flex items-start gap-1.5 px-0.5 text-[10px] leading-[1.35] text-white/[0.35]">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        <span>{tt('analysis.monthEndAssetSource', '资产数据按月末余额统计，单位：人民币')}</span>
      </div>
    </div>
  );
}
