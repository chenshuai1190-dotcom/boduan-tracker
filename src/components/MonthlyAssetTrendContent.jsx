import React from 'react';
import { ChevronRight, Info } from 'lucide-react';
import MonthlyAssetTrendChart, {
  MONTHLY_ASSET_CHART_WIDTH,
  buildMonthlyAssetTrendChartScale,
} from './MonthlyAssetTrendChart.jsx';
import { t } from '../lib/i18n.js';
import {
  buildMonthlyAssetTrend,
  DEFAULT_COLLAPSED_MONTH_COUNT,
  visibleMonthlyAssetTrendSlots,
} from '../lib/monthlyAssetTrend.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const UP_COLOR = '#ff4b1f';
const DOWN_COLOR = '#50d0a2';

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
  const chartInteractionRef = React.useRef(null);
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
  const scale = React.useMemo(
    () => buildMonthlyAssetTrendChartScale(chartModel, chartMonths.length),
    [chartModel, chartMonths.length],
  );
  const visibleSlots = React.useMemo(
    () => visibleMonthlyAssetTrendSlots(detailModel.slots, expanded),
    [detailModel.slots, expanded],
  );
  const tt = React.useCallback((key, fallback, replacements) => (
    t(language, key, fallback, replacements)
  ), [language]);

  React.useEffect(() => {
    if (selectedIndex === null) return undefined;

    const clearSelectedPointOutsideChart = (event) => {
      if (chartInteractionRef.current?.contains(event.target)) return;
      activePointerIdRef.current = null;
      setSelectedIndex(null);
    };

    document.addEventListener('pointerdown', clearSelectedPointOutsideChart, true);
    return () => document.removeEventListener('pointerdown', clearSelectedPointOutsideChart, true);
  }, [selectedIndex]);

  const currentSlot = chartModel.currentSlot;
  const comparison = currentSlot?.hasPreviousMonth ? currentSlot : null;
  const comparisonTone = comparison && comparison.changeAmount >= 0 ? UP_COLOR : DOWN_COLOR;
  const primaryMoney = formatPrimaryMoney(currentSlot?.balance, language);

  const selectNearestPoint = React.useCallback((event) => {
    if (chartModel.points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const viewX = ((event.clientX - bounds.left) / bounds.width) * MONTHLY_ASSET_CHART_WIDTH;
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
      <section className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 pt-px" aria-label={tt('analysis.currentAssetSummary', '当前资产摘要')}>
        <div className="min-w-0">
          <div className="pl-px text-[11px] leading-[15px] text-white/[0.50]">
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
        ref={chartInteractionRef}
        className="mt-2 aspect-[370/206] select-none touch-pan-y"
        aria-label={tt('analysis.assetTrendChartRange', '{{start}} 至 {{end}}资产走势', {
          start: chartMonths[0] || '--',
          end: chartMonths.at(-1) || '--',
        })}
      >
        {chartModel.points.length > 0 ? (
          <MonthlyAssetTrendChart
            language={language}
            months={chartMonths}
            model={chartModel}
            scale={scale}
            selectedIndex={selectedIndex}
            latestPointIndex={currentSlot?.index ?? null}
            maxPointIndex={chartModel.maxPoint?.index ?? null}
            ariaLabel={tt('analysis.assetTrendChartRange', '{{start}} 至 {{end}}资产走势', {
              start: chartMonths[0] || '--',
              end: chartMonths.at(-1) || '--',
            })}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerTracking}
            onPointerCancel={finishPointerTracking}
            onLostPointerCapture={finishPointerTracking}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-white/[0.32]">
            {tt('analysis.noData', '无数据')}
          </div>
        )}
      </div>

      <section
        className="grid min-h-[64px] grid-cols-2 rounded-[16px] border border-white/[0.075] bg-white/[0.045] py-[11px]"
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

      <section className="mt-3 overflow-hidden rounded-[17px] border border-white/[0.075] bg-black/[0.12]">
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

        <div className="grid min-h-[32px] grid-cols-[90px_minmax(70px,1fr)_minmax(68px,0.96fr)_49px_18px] items-center gap-x-0.5 border-y border-white/[0.055] bg-white/[0.035] px-2 text-[10px] text-white/[0.43]">
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
              <div
                key={slot.month}
                data-asset-trend-month-row={slot.month}
                className="grid min-h-[42px] w-full grid-cols-[90px_minmax(70px,1fr)_minmax(68px,0.96fr)_49px_18px] items-center gap-x-0.5 border-b border-solid border-white/[0.055] px-2 text-left last:border-b-0"
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
                <button
                  type="button"
                  data-asset-trend-month-edit={slot.month}
                  aria-label={tt('analysis.editMonthlyBalanceFor', '修改 {{month}} 月度余额', { month: slot.month })}
                  onClick={() => onEditMonth?.(slot.month)}
                  className="flex h-[42px] w-[26px] -translate-x-1 items-center justify-end border-0 bg-transparent text-white/[0.44] active:text-white/[0.72]"
                >
                  <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
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
