import React from 'react';
import { t } from '../lib/i18n.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const CHART_WIDTH = 360;
const CHART_HEIGHT = 198;
const CHART_MARGIN = Object.freeze({
  left: 41,
  right: 10,
  top: 14,
  bottom: 27,
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function validDateKey(value) {
  const key = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : '';
}

function formatPe(value, digits = 2) {
  const number = positiveNumber(value);
  return number === null ? '—' : number.toFixed(digits);
}

function formatPercentile(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 && number <= 100 ? `${number.toFixed(2)}%` : '—';
}

function formatDate(value, language, { includeDay = true } = {}) {
  const key = validDateKey(value);
  if (!key) return '—';
  const date = new Date(`${key}T00:00:00Z`);
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    ...(includeDay ? { day: '2-digit' } : {}),
    timeZone: 'UTC',
  }).format(date);
}

function quantizedAxisLabel(value) {
  const number = positiveNumber(value);
  if (number === null) return '—';
  return number >= 100 ? number.toFixed(0) : number.toFixed(1);
}

function uniqueNumbers(values) {
  return values.filter((value, index) => (
    Number.isFinite(value)
    && values.findIndex((candidate) => Math.abs(candidate - value) < 1e-9) === index
  ));
}

export function valuationPercentileColor(value) {
  const percentile = finiteNumber(value);
  if (percentile === null) return 'rgba(255,255,255,0.72)';
  if (percentile <= 25) return '#36c49a';
  if (percentile >= 75) return '#ff4b1f';
  return '#f6b54b';
}

export function buildValuationChartGeometry(series = [], summary = {}) {
  const rows = (Array.isArray(series) ? series : [])
    .map((row) => ({
      date: validDateKey(row?.date),
      peTtm: positiveNumber(row?.peTtm),
    }))
    .filter((row) => row.date && row.peTtm !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (rows.length < 2) return null;

  const observedValues = rows.map((row) => row.peTtm);
  const observedMin = Math.min(...observedValues);
  const observedMax = Math.max(...observedValues);
  const summaryMin = positiveNumber(summary?.min);
  const summaryMax = positiveNumber(summary?.max);
  const dataMin = Math.min(observedMin, summaryMin ?? observedMin);
  const dataMax = Math.max(observedMax, summaryMax ?? observedMax);
  const rawSpan = Math.max(dataMax - dataMin, dataMax * 0.08, 1);
  const yMin = Math.max(0, dataMin - rawSpan * 0.06);
  const yMax = dataMax + rawSpan * 0.06;
  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const firstTime = Date.parse(`${rows[0].date}T00:00:00Z`);
  const lastTime = Date.parse(`${rows.at(-1).date}T00:00:00Z`);
  const timeSpan = Math.max(86_400_000, lastTime - firstTime);
  const x = (date) => (
    CHART_MARGIN.left
    + ((Date.parse(`${date}T00:00:00Z`) - firstTime) / timeSpan) * plotWidth
  );
  const y = (value) => (
    CHART_MARGIN.top
    + ((yMax - value) / (yMax - yMin)) * plotHeight
  );
  const points = rows.map((row) => ({
    ...row,
    x: x(row.date),
    y: y(row.peTtm),
  }));
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
  const bottomY = CHART_HEIGHT - CHART_MARGIN.bottom;
  const areaPath = `${path} L${points.at(-1).x.toFixed(2)},${bottomY} L${points[0].x.toFixed(2)},${bottomY} Z`;
  const midpointTime = firstTime + timeSpan / 2;
  const midpoint = points.reduce((nearest, point) => {
    const distance = Math.abs(Date.parse(`${point.date}T00:00:00Z`) - midpointTime);
    return !nearest || distance < nearest.distance ? { point, distance } : nearest;
  }, null)?.point;

  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    ...CHART_MARGIN,
    plotWidth,
    plotHeight,
    yMin,
    yMax,
    points,
    path,
    areaPath,
    y,
    axisValues: uniqueNumbers([yMax, (yMax + yMin) / 2, yMin]),
    dateLabels: [points[0], midpoint, points.at(-1)].filter((point, index, values) => (
      point && values.findIndex((candidate) => candidate?.date === point.date) === index
    )),
  };
}

function ValuationStat({ label, value, detail, color = 'rgba(255,255,255,0.82)', suffix }) {
  return (
    <div className="min-w-0 px-2 text-center">
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-white/[0.50]">
        {label}
        {suffix ? <span className="relative -top-[0.38em] ml-0.5 text-[10px] tracking-normal text-white/[0.40]">{suffix}</span> : null}
      </div>
      <div className="mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-[21px] font-normal leading-none tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>
        {value}
      </div>
      <div className="mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-white/[0.40]">
        {detail}
      </div>
    </div>
  );
}

function ValuationChart({ data, language, initialTooltipOpen = false }) {
  const chartRef = React.useRef(null);
  const activePointerRef = React.useRef(null);
  const gradientId = React.useId().replaceAll(':', '');
  const chart = React.useMemo(
    () => buildValuationChartGeometry(data?.series, data?.summary),
    [data?.series, data?.summary],
  );
  const [selectedIndex, setSelectedIndex] = React.useState(() => (
    initialTooltipOpen && chart?.points?.length ? chart.points.length - 1 : null
  ));

  React.useEffect(() => {
    setSelectedIndex(initialTooltipOpen && chart?.points?.length ? chart.points.length - 1 : null);
  }, [chart, initialTooltipOpen]);
  React.useEffect(() => {
    if (selectedIndex === null) return undefined;
    const timerId = window.setTimeout(() => setSelectedIndex(null), 12_000);
    return () => window.clearTimeout(timerId);
  }, [selectedIndex]);
  React.useEffect(() => {
    if (selectedIndex === null) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (chartRef.current?.contains(event.target)) return;
      setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [selectedIndex]);

  if (!chart) return null;

  const summary = data?.summary || {};
  const average = positiveNumber(summary.average);
  const p25 = positiveNumber(summary.p25);
  const p75 = positiveNumber(summary.p75);
  const bandTop = p75 === null ? null : chart.y(Math.min(chart.yMax, Math.max(chart.yMin, p75)));
  const bandBottom = p25 === null ? null : chart.y(Math.min(chart.yMax, Math.max(chart.yMin, p25)));
  const selectedPoint = Number.isInteger(selectedIndex) ? chart.points[selectedIndex] || null : null;
  const latestPoint = chart.points.at(-1);

  const selectNearestPoint = (clientX) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const viewBoxX = ((clientX - rect.left) / rect.width) * CHART_WIDTH;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    chart.points.forEach((point, index) => {
      const distance = Math.abs(point.x - viewBoxX);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });
    setSelectedIndex(nearestIndex);
  };

  const finishPointer = (event) => {
    if (activePointerRef.current === event.pointerId) selectNearestPoint(event.clientX);
    activePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  return (
    <div
      ref={chartRef}
      role="button"
      tabIndex={0}
      data-watchlist-valuation-chart="true"
      aria-label={t(language, 'watchlistDetail.valuationChartAria', '查看过去五年市盈率走势')}
      className="relative mx-3 mt-1 min-w-0 cursor-crosshair select-none rounded-xl bg-black/[0.10] outline-none focus-visible:ring-1 focus-visible:ring-[#f6b54b]/45"
      style={{
        touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      onPointerDown={(event) => {
        activePointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        selectNearestPoint(event.clientX);
      }}
      onPointerMove={(event) => {
        if (activePointerRef.current === event.pointerId) selectNearestPoint(event.clientX);
      }}
      onPointerUp={finishPointer}
      onPointerCancel={() => { activePointerRef.current = null; }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setSelectedIndex(chart.points.length - 1);
      }}
    >
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="block h-[198px] w-full overflow-visible" role="img" aria-label={t(language, 'watchlistDetail.valuationChartImageAria', '过去五年市盈率 TTM 历史曲线')}>
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f6b54b" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#f6b54b" stopOpacity="0" />
          </linearGradient>
        </defs>
        {bandTop !== null && bandBottom !== null && bandBottom > bandTop ? (
          <rect
            x={chart.left}
            y={bandTop}
            width={chart.plotWidth}
            height={bandBottom - bandTop}
            rx="4"
            fill="rgba(246,181,75,0.075)"
            stroke="rgba(246,181,75,0.10)"
          />
        ) : null}
        {chart.axisValues.map((value) => {
          const y = chart.y(value);
          return (
            <g key={value}>
              <line x1={chart.left} x2={CHART_WIDTH - chart.right} y1={y} y2={y} stroke="rgba(255,255,255,0.055)" strokeDasharray="3 5" />
              <text x={chart.left - 7} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.32)" fontSize="11" style={{ fontFamily: NUMBER_FONT }}>
                {quantizedAxisLabel(value)}
              </text>
            </g>
          );
        })}
        {average !== null ? (
          <line
            x1={chart.left}
            x2={CHART_WIDTH - chart.right}
            y1={chart.y(average)}
            y2={chart.y(average)}
            stroke="rgba(255,255,255,0.30)"
            strokeWidth="1"
            strokeDasharray="5 5"
          />
        ) : null}
        <path d={chart.areaPath} fill={`url(#${gradientId}-area)`} />
        <path d={chart.path} fill="none" stroke="#f6b54b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={latestPoint.x} cy={latestPoint.y} r="7" fill="rgba(246,181,75,0.13)" />
        <circle cx={latestPoint.x} cy={latestPoint.y} r="3.2" fill="#0b0f14" stroke="#ffd18a" strokeWidth="1.35" />
        {selectedPoint ? (
          <g aria-hidden="true">
            <line x1={selectedPoint.x} x2={selectedPoint.x} y1={chart.top} y2={CHART_HEIGHT - chart.bottom} stroke="rgba(255,255,255,0.24)" strokeWidth="0.8" strokeDasharray="3 3" />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="7" fill="#f6b54b" opacity="0.14" />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="3.7" fill="#0b0f14" stroke="#ffd18a" strokeWidth="1.3" />
          </g>
        ) : null}
        {chart.dateLabels.map((point, index) => (
          <text
            key={point.date}
            x={point.x}
            y={CHART_HEIGHT - 5}
            textAnchor={index === 0 ? 'start' : index === chart.dateLabels.length - 1 ? 'end' : 'middle'}
            fill="rgba(255,255,255,0.30)"
            fontSize="11"
            style={{ fontFamily: NUMBER_FONT }}
          >
            {formatDate(point.date, language, { includeDay: false })}
          </text>
        ))}
      </svg>
      {selectedPoint ? (
        <div
          data-watchlist-valuation-tooltip="true"
          className={`pointer-events-none absolute top-2 min-w-[126px] rounded-xl border border-white/10 bg-[#121821]/95 px-3 py-2 text-left shadow-[0_10px_26px_rgba(0,0,0,0.45)] backdrop-blur ${selectedPoint.x > CHART_WIDTH * 0.58 ? 'left-12' : 'right-2'}`}
        >
          <div className="text-[11px] text-white/[0.42]">{formatDate(selectedPoint.date, language)}</div>
          <div className="mt-1 text-[16px] text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
            PE {formatPe(selectedPoint.peTtm)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CompanyValuationCard({
  data,
  status,
  language,
  initialTooltipOpen = false,
}) {
  const chartReady = status === 'ready' && Array.isArray(data?.series) && data.series.length >= 2;
  const asOfDate = validDateKey(data?.asOfDate);
  const summary = data?.summary || {};
  const summaryParts = [
    summary.observationCount
      ? t(language, 'watchlistDetail.valuationObservations', '{{count}} 个有效交易日', {
        count: Number(summary.observationCount).toLocaleString(language === 'en' ? 'en-US' : 'zh-CN'),
      })
      : '',
    positiveNumber(summary.min) !== null && positiveNumber(summary.max) !== null
      ? t(language, 'watchlistDetail.valuationRange', '区间 {{min}}–{{max}}', {
        min: formatPe(summary.min),
        max: formatPe(summary.max),
      })
      : '',
    positiveNumber(summary.median) !== null
      ? t(language, 'watchlistDetail.valuationMedian', '中位数 {{value}}', {
        value: formatPe(summary.median),
      })
      : '',
  ].filter(Boolean);

  return (
    <section
      className="mt-3 scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0c0e] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
      data-watchlist-detail-section="valuation"
      data-watchlist-company-valuation="true"
      data-valuation-status={status}
      aria-busy={status === 'loading'}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <h2 className="truncate text-[15px] font-normal text-white/[0.82]">{t(language, 'watchlistDetail.companyValuation', '公司估值')}</h2>
        {asOfDate ? (
          <div className="shrink-0 text-[11px] text-white/[0.40]">
            {t(language, 'watchlistDetail.valuationAsOf', '截至 {{date}}', {
              date: formatDate(asOfDate, language),
            })}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/[0.07] px-2 py-4">
        <ValuationStat
          label={t(language, 'watchlistDetail.peRatio', '市盈率')}
          suffix="TTM"
          value={formatPe(data?.current?.peTtm)}
          detail={t(language, 'watchlistDetail.valuationSameBasis', '同历史曲线口径')}
        />
        <ValuationStat
          label={t(language, 'watchlistDetail.valuationPercentile', '超过历史（5年）')}
          value={formatPercentile(data?.percentile5y)}
          detail={t(language, 'watchlistDetail.valuationFiveYearDaily', '过去5年 · 日频')}
          color={valuationPercentileColor(data?.percentile5y)}
        />
        <ValuationStat
          label={t(language, 'watchlistDetail.forwardPe', '预期市盈率')}
          value={formatPe(data?.current?.peForward)}
          detail="EODHD Forward"
        />
      </div>

      {chartReady ? (
        <>
          <ValuationChart data={data} language={language} initialTooltipOpen={initialTooltipOpen} />
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 pt-3 text-center text-[11px] text-white/[0.40]">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><i className="h-0.5 w-4 rounded-full bg-[#f6b54b]" />{t(language, 'watchlistDetail.peTtmLegend', '市盈率 TTM')}</span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><i className="h-px w-4 border-t border-dashed border-white/35" />{t(language, 'watchlistDetail.valuationAverage', '五年平均 {{value}}', { value: formatPe(summary.average) })}</span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><i className="h-2 w-4 rounded-[3px] border border-[#f6b54b]/15 bg-[#f6b54b]/[0.08]" />{t(language, 'watchlistDetail.valuationQuartileBand', 'P25–P75 区间')}</span>
          </div>
          <div
            className="mx-4 mb-4 mt-3 border-t border-white/[0.06] pt-3 text-center text-[11px] leading-[1.55] text-white/[0.40]"
            data-watchlist-valuation-summary="true"
          >
            {summaryParts.length ? <div>{summaryParts.join(' · ')}</div> : null}
          </div>
        </>
      ) : (
        <div className="px-4 pb-7 pt-5 text-center">
          <div className="text-[12px] text-white/[0.50]">
            {status === 'loading'
              ? t(language, 'watchlistDetail.valuationLoading', '正在计算五年历史估值')
              : t(language, 'watchlistDetail.valuationUnavailable', '五年历史估值暂不可用')}
          </div>
          {status !== 'loading' ? (
            <div className="mt-1.5 text-[11px] text-white/[0.40]">{t(language, 'watchlistDetail.valuationNoSynthetic', '不会补造历史百分位或比较基准')}</div>
          ) : null}
        </div>
      )}
    </section>
  );
}
