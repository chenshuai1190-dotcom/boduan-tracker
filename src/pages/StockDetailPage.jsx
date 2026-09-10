import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { t } from '../lib/i18n.js';
import { buildStockDetailViewModel } from '../lib/stockDetailViewModel.js';
import { buildStockReturnComparison } from '../lib/stockReturnComparison.js';
import {
  findWatchlistStockDetailRows,
  targetProgressPercent,
  targetProgressPositionPercent,
  targetSpacePercent,
} from '../lib/watchlistStockDetail.js';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';
import StockReturnComparisonCard from '../components/StockReturnComparisonCard.jsx';
import TargetEditor from '../components/StockTargetEditor.jsx';
import './StockDetailPage.css';
import './StockDetailPnlChart.css';

const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const USD_CNY_FALLBACK = 7.2;
const DETAIL_LABEL_CLASS = 'text-white/40';
const DETAIL_VALUE_CLASS = 'text-white/[0.86]';
const DETAIL_MUTED_VALUE_CLASS = 'text-white/[0.86]';
const CHART_TOOLTIP_HOLD_MS = 12000;
const BENCHMARK_CACHE_TTL_MS = 15 * 60 * 1000;
const comparisonRawRowsCache = new Map();

function readCachedComparisonRawRows(key) {
  const cached = comparisonRawRowsCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    comparisonRawRowsCache.delete(key);
    return null;
  }
  return cached.rows;
}

function cacheComparisonRawRows(key, rows) {
  comparisonRawRowsCache.set(key, {
    rows,
    expiresAt: Date.now() + BENCHMARK_CACHE_TTL_MS,
  });
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function fmt(value, digits = 2) {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signedCurrency(value, currency = 'USD', digits = 2) {
  const n = toNumber(value);
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${n >= 0 ? '+' : '-'}${symbol}${fmt(Math.abs(n), digits)}`;
}

function currency(value, currencyMode = 'USD', digits = 2) {
  return `${currencyMode === 'CNY' ? '¥' : '$'}${fmt(value, digits)}`;
}

function signedPct(value, digits = 2) {
  if (value == null) return '--';
  const n = toNumber(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function signedPercentValue(value, digits = 2) {
  if (value == null) return '--';
  const n = toNumber(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function displayDate(value) {
  return String(value || '--').replaceAll('-', '/');
}

function parseDateMs(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function formatAxisDate(value) {
  const parts = String(value || '').split('-');
  if (parts.length !== 3) return '--';
  return `${parts[1]}/${parts[2]}`;
}

function formatAxisMoney(value, currencyMode = 'USD') {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  if (currencyMode === 'CNY') {
    if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`;
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${abs.toFixed(0)}`;
  }
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function compactSignedCurrency(value, currencyMode = 'USD') {
  const symbol = currencyMode === 'CNY' ? '¥' : '$';
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  if (currencyMode === 'CNY' && abs >= 10000) {
    return `${sign}${symbol}${(abs / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`;
  }
  if (abs >= 1000000) return `${sign}${symbol}${(abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

function sideLabel(language, side) {
  return side === 'sell'
    ? t(language, 'stockDetail.sell', '卖出')
    : t(language, 'stockDetail.buy', '买入');
}

const PNL_CHART_GEOMETRY = Object.freeze({
  width: 360,
  height: 292,
  padLeft: 44,
  padRight: 10,
  padTop: 24,
  padBottom: 32,
  tooltipWidth: 276,
  tooltipHeight: 174,
  tooltipGutter: 8,
});

function buildLineChart(points, { startDate, endDate, width = PNL_CHART_GEOMETRY.width, height = PNL_CHART_GEOMETRY.height } = {}) {
  const { padLeft, padRight, padTop, padBottom } = PNL_CHART_GEOMETRY;
  const bounds = { width, height, plotLeft: padLeft, plotRight: width - padRight, plotTop: padTop, plotBottom: height - padBottom };
  const valid = (Array.isArray(points) ? points : [])
    .map((point, index) => ({ point, index, value: Number(point?.pnlUsd) }))
    .filter(({ value }) => Number.isFinite(value));
  if (valid.length === 0) return {
    ...bounds,
    path: '',
    areaPath: '',
    points: [],
    ticks: [],
    peakPoint: null,
    currentPoint: null,
    yLines: [0, 1 / 3, 2 / 3, 1].map((ratio) => padTop + ratio * (height - padTop - padBottom)),
  };
  const values = valid.map(({ value }) => value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const padding = Math.max((max - min) * 0.12, 1);
  const domainMin = min - padding;
  const domainMax = max + padding;
  const span = domainMax - domainMin || 1;
  const xStart = parseDateMs(startDate);
  const xEnd = parseDateMs(endDate);
  const xSpan = xStart != null && xEnd != null && xEnd > xStart ? xEnd - xStart : null;
  const xForPoint = ({ point, index }) => {
    const pointMs = parseDateMs(point?.date);
    if (xSpan && pointMs != null) {
      const progress = Math.min(1, Math.max(0, (pointMs - xStart) / xSpan));
      return padLeft + progress * (width - padLeft - padRight);
    }
    return padLeft + (index / Math.max(points.length - 1, 1)) * (width - padLeft - padRight);
  };
  const yForValue = (value) => padTop + (1 - ((value - domainMin) / span)) * (height - padTop - padBottom);
  const plottedPoints = valid.map(({ point, index, value }) => ({
    point,
    index,
    value,
    date: point?.date,
    x: xForPoint({ point, index }),
    y: yForValue(value),
  }));
  const path = valid.length === 1
    ? `M${padLeft} ${yForValue(valid[0].value).toFixed(2)} L${width - padRight} ${yForValue(valid[0].value).toFixed(2)}`
    : plottedPoints.map(({ x, y }, pathIndex) => {
      return `${pathIndex === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
  const areaPath = plottedPoints.length > 0
    ? `${path} L${plottedPoints.at(-1).x.toFixed(2)} ${height - padBottom} L${plottedPoints[0].x.toFixed(2)} ${height - padBottom} Z`
    : '';
  const ticks = [domainMax, domainMin + span * 0.66, domainMin + span * 0.33, domainMin].map((value) => ({
    value,
    y: yForValue(value),
  }));
  const peakPoint = plottedPoints.reduce((best, point) => (point.value > best.value ? point : best), plottedPoints[0]);
  return {
    ...bounds,
    path,
    areaPath,
    points: plottedPoints,
    ticks,
    peakPoint,
    currentPoint: plottedPoints.at(-1) || null,
    yLines: ticks.map((tick) => tick.y),
  };
}

function StatCell({ label, value, valueClass = DETAIL_VALUE_CLASS }) {
  return (
    <div className="sdp-stat">
      <div className={`sdp-stat-label ${DETAIL_LABEL_CLASS}`}>{label}</div>
      <div className={`sdp-stat-value ${valueClass}`} style={{ fontFamily: NUMBER_FONT }}>
        {value}
      </div>
    </div>
  );
}

function RangePill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="sdp-range"
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function PnlSparkline({ points, color, emptyText, startDate, endDate, currencyMode, marketColorMode, displayRate, language, trendStats }) {
  const [chartWidth, setChartWidth] = React.useState(PNL_CHART_GEOMETRY.width);
  const pointsKey = React.useMemo(() => (
    (Array.isArray(points) ? points : [])
      .map((point) => `${point?.date || ''}:${Number(point?.pnlUsd || 0).toFixed(4)}`)
      .join('|')
  ), [points]);
  const chart = React.useMemo(() => buildLineChart(points, { startDate, endDate, width: chartWidth }), [points, startDate, endDate, chartWidth]);
  const [selection, setSelection] = React.useState(null);
  const chartRootRef = React.useRef(null);
  const chartViewportRef = React.useRef(null);
  const hideTimerRef = React.useRef(null);
  const activePointerIdRef = React.useRef(null);
  const startMs = parseDateMs(startDate);
  const endMs = parseDateMs(endDate);
  const middleDate = startMs != null && endMs != null
    ? new Date(startMs + ((endMs - startMs) / 2)).toISOString().slice(0, 10)
    : startDate;
  const first = formatAxisDate(startDate);
  const middle = formatAxisDate(middleDate);
  const last = formatAxisDate(endDate);
  const selectedPoint = selection?.type === 'point' ? chart.points[selection.index] || null : null;
  const hasSelection = selection != null;
  const selectedPointColor = selectedPoint ? marketHexColor(selectedPoint.value, marketColorMode) : color;
  const peakPointColor = chart.peakPoint ? marketHexColor(chart.peakPoint.value, marketColorMode) : color;
  const tooltipWidth = Math.min(PNL_CHART_GEOMETRY.tooltipWidth, chart.width - PNL_CHART_GEOMETRY.tooltipGutter * 2);
  const selectedPointLeft = selectedPoint
    ? Math.max(PNL_CHART_GEOMETRY.tooltipGutter, Math.min(selectedPoint.x - tooltipWidth / 2, chart.width - tooltipWidth - PNL_CHART_GEOMETRY.tooltipGutter))
    : PNL_CHART_GEOMETRY.tooltipGutter;
  const selectedPointTop = selectedPoint
    ? Math.max(PNL_CHART_GEOMETRY.tooltipGutter, Math.min(selectedPoint.y - PNL_CHART_GEOMETRY.tooltipHeight - 12, chart.height - PNL_CHART_GEOMETRY.tooltipHeight - PNL_CHART_GEOMETRY.tooltipGutter))
    : PNL_CHART_GEOMETRY.tooltipGutter;
  const peakText = chart.peakPoint ? compactSignedCurrency(chart.peakPoint.value, currencyMode) : '--';
  const peakMetricUsd = trendStats?.peakPnlUsd == null ? null : toNumber(trendStats.peakPnlUsd);
  const peakMetricText = peakMetricUsd == null
    ? '--'
    : signedCurrency(peakMetricUsd * displayRate, currencyMode);
  const peakMetricClass = peakMetricUsd == null
    ? 'text-white/[0.34]'
    : marketTextClass(peakMetricUsd, marketColorMode);
  const maxGivebackUsd = trendStats?.maxGivebackUsd ?? trendStats?.maxDrawdownUsd;
  const maxGivebackText = maxGivebackUsd == null
    ? '--'
    : signedCurrency(toNumber(maxGivebackUsd) * displayRate, currencyMode);
  const drawdownRateText = trendStats?.drawdownRate == null
    ? ''
    : signedPct(trendStats.drawdownRate, 1);
  const givebackRateText = trendStats?.givebackRate == null
    ? ''
    : `${Math.abs(toNumber(trendStats.givebackRate) * 100).toFixed(1)}%`;
  const showPeakCallout = Boolean(chart.peakPoint && chart.currentPoint);
  const peakCalloutOnRight = Boolean(chart.peakPoint && chart.peakPoint.x > chart.plotRight - 100);

  React.useEffect(() => {
    const viewport = chartViewportRef.current;
    if (!viewport) return undefined;
    const updateWidth = () => {
      const width = viewport.getBoundingClientRect().width;
      if (width > 0) setChartWidth((current) => Math.abs(current - width) < 0.5 ? current : width);
    };
    updateWidth();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateWidth) : null;
    observer?.observe(viewport);
    window.addEventListener('resize', updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  React.useEffect(() => {
    setSelection(null);
    window.clearTimeout(hideTimerRef.current);
  }, [pointsKey, startDate, endDate]);

  React.useEffect(() => {
    return () => {
      window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!hasSelection) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!chartRootRef.current?.contains(event.target)) {
        window.clearTimeout(hideTimerRef.current);
        setSelection(null);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [hasSelection]);

  const keepSelectedPointVisible = React.useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setSelection(null);
    }, CHART_TOOLTIP_HOLD_MS);
  }, []);

  const updateSelectedPoint = React.useCallback((event) => {
    if (!chart.points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) / rect.width) * chart.width;
    let nextIndex = 0;
    let nextDistance = Number.POSITIVE_INFINITY;
    chart.points.forEach((point, index) => {
      const distance = Math.abs(point.x - x);
      if (distance < nextDistance) {
        nextDistance = distance;
        nextIndex = index;
      }
    });
    setSelection((current) => (
      current?.type === 'point' && current.index === nextIndex
        ? current
        : { type: 'point', index: nextIndex }
    ));
    keepSelectedPointVisible();
  }, [chart.points, chart.width, keepSelectedPointVisible]);

  const handlePointerDown = React.useCallback((event) => {
    if (event.isPrimary === false) return;
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateSelectedPoint(event);
  }, [updateSelectedPoint]);

  const handlePointerMove = React.useCallback((event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    updateSelectedPoint(event);
  }, [updateSelectedPoint]);

  const finishPointerTracking = React.useCallback((event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }, []);

  return (
    <div ref={chartRootRef} className="stock-detail-pnl-chart">
      <div
        ref={chartViewportRef}
        className="stock-detail-pnl-viewport"
        data-stock-detail-pnl-chart="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerTracking}
        onPointerCancel={finishPointerTracking}
        onLostPointerCapture={finishPointerTracking}
        style={{ touchAction: 'pan-y', height: PNL_CHART_GEOMETRY.height }}
      >
        {!chart.path && (
          <div className="stock-detail-pnl-empty">
            {emptyText}
          </div>
        )}
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" className="stock-detail-pnl-svg" aria-label={t(language, 'stockDetail.totalPnl', '累计盈亏')}>
          <defs>
            <style>
              {`
                @keyframes stock-detail-peak-breathe {
                  0%, 100% {
                    opacity: 0.22;
                    transform: scale(0.72);
                  }
                  50% {
                    opacity: 0.06;
                    transform: scale(1.42);
                  }
                }

                .stock-detail-peak-breathe-ring {
                  animation: stock-detail-peak-breathe 3.2s ease-in-out infinite;
                  transform-box: fill-box;
                  transform-origin: center;
                  will-change: opacity, transform;
                }

                @media (prefers-reduced-motion: reduce) {
                  .stock-detail-peak-breathe-ring {
                    animation: none !important;
                    opacity: 0.16;
                    transform: scale(1);
                  }
                }
              `}
            </style>
            <linearGradient id="stockDetailPnlArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.15" />
              <stop offset="58%" stopColor={color} stopOpacity="0.04" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <filter id="stockDetailPnlGlow" x="-18%" y="-60%" width="136%" height="220%">
              <feGaussianBlur stdDeviation="0.45" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {chart.yLines.map((y) => (
            <line key={y} x1={chart.plotLeft} y1={y} x2={chart.plotRight} y2={y} stroke="rgba(255,255,255,0.065)" />
          ))}
          {chart.ticks.map((tick) => (
            <text key={`${tick.y}-${tick.value}`} x="0" y={Math.min(chart.plotBottom + 4, Math.max(chart.plotTop, tick.y + 4))} fontSize="11" fill="#74747e">
              {formatAxisMoney(tick.value, currencyMode)}
            </text>
          ))}
          {chart.areaPath && <path d={chart.areaPath} fill="url(#stockDetailPnlArea)" />}
          {chart.path && <path d={chart.path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" filter="url(#stockDetailPnlGlow)" />}
          {showPeakCallout && (
            <>
              <circle
                className="stock-detail-peak-breathe-ring"
                cx={chart.peakPoint.x}
                cy={chart.peakPoint.y}
                r="7"
                fill={peakPointColor}
                pointerEvents="none"
              />
              <circle cx={chart.peakPoint.x} cy={chart.peakPoint.y} r="3.6" fill={peakPointColor} stroke="#08090b" strokeWidth="1.4" />
              <text
                x={peakCalloutOnRight ? chart.peakPoint.x - 5 : chart.peakPoint.x + 4}
                y={Math.max(12, chart.peakPoint.y - 9)}
                textAnchor={peakCalloutOnRight ? 'end' : 'start'}
                fontSize="11"
                fill={peakPointColor}
              >
                {t(language, 'stockDetail.peakLabel', '峰值')} {peakText}
              </text>
            </>
          )}
          {selectedPoint && (
            <>
              <line
                x1={selectedPoint.x}
                y1={chart.plotTop}
                x2={selectedPoint.x}
                y2={chart.plotBottom}
                stroke="rgba(255,255,255,0.24)"
                strokeDasharray="4 5"
              />
              <circle cx={selectedPoint.x} cy={selectedPoint.y} r="10" fill={selectedPointColor} opacity="0.13" />
              <circle cx={selectedPoint.x} cy={selectedPoint.y} r="5" fill="#08090b" stroke={selectedPointColor} strokeWidth="1.6" />
            </>
          )}
          <text x={chart.plotLeft} y={chart.height - 5} fontSize="11" fill="#74747e">{first}</text>
          <text x={(chart.plotLeft + chart.plotRight) / 2} y={chart.height - 5} textAnchor="middle" fontSize="11" fill="#74747e">{middle}</text>
          <text x={chart.plotRight} y={chart.height - 5} textAnchor="end" fontSize="11" fill="#74747e">{last}</text>
        </svg>
        {selectedPoint && (
          <div
            className="stock-detail-pnl-tooltip"
            data-stock-detail-pnl-tooltip="true"
            style={{
              width: tooltipWidth,
              left: selectedPointLeft,
              top: selectedPointTop,
            }}
          >
            <div
              key={`stock-detail-tooltip-date-${selectedPoint.date}`}
              className="stock-detail-pnl-tooltip-date"
              data-stock-detail-tooltip-date={selectedPoint.date}
            >
              {displayDate(selectedPoint.date)}
            </div>
            <div className="stock-detail-pnl-tooltip-readings">
              <span className="stock-detail-pnl-tooltip-label">{t(language, 'stockDetail.totalPnl', '累计盈亏')}</span>
              <span className="stock-detail-pnl-tooltip-value" style={{ color: selectedPointColor, fontFamily: NUMBER_FONT }}>{signedCurrency(selectedPoint.value, currencyMode, 2)}</span>
              <span className="stock-detail-pnl-tooltip-label">{t(language, 'stockDetail.dailyPnl', '当日盈亏')}</span>
              <span className={`stock-detail-pnl-tooltip-value ${selectedPoint.point.dailyPnlUsd == null ? 'text-white/[0.34]' : marketTextClass(selectedPoint.point.dailyPnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                {selectedPoint.point.dailyPnlUsd == null ? '--' : signedCurrency(selectedPoint.point.dailyPnlUsd * displayRate, currencyMode, 2)}
              </span>
              <span className="stock-detail-pnl-tooltip-label">{t(language, 'stockDetail.returnRate', '收益率')}</span>
              <span className={`stock-detail-pnl-tooltip-value ${selectedPoint.point.returnPct == null ? 'text-white/[0.34]' : marketTextClass(selectedPoint.point.returnPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{signedPct(selectedPoint.point.returnPct, 2)}</span>
              <span className="stock-detail-pnl-tooltip-label">{t(language, 'stockDetail.marketValue', '持仓市值')}</span>
              <span className="stock-detail-pnl-tooltip-value" style={{ fontFamily: NUMBER_FONT }}>{currency(selectedPoint.point.marketValueUsd * displayRate, currencyMode, 2)}</span>
              <span className="stock-detail-pnl-tooltip-label">{t(language, 'stockDetail.closePrice', '收盘价')}</span>
              <span className="stock-detail-pnl-tooltip-value" style={{ fontFamily: NUMBER_FONT }}>${fmt(selectedPoint.point.closePriceUsd, 2)}</span>
            </div>
          </div>
        )}
      </div>
      <div className="stock-detail-pnl-metrics" data-stock-detail-pnl-metrics="true">
          <div className="stock-detail-pnl-metric">
            <span className="stock-detail-pnl-metric-label">{t(language, 'stockDetail.peak', '峰值')}</span>
            <span className={`stock-detail-pnl-metric-value ${peakMetricClass}`} style={{ fontFamily: NUMBER_FONT }}>
              {peakMetricText}
            </span>
          </div>
          <div className="stock-detail-pnl-metric">
            <span className="stock-detail-pnl-metric-label">{t(language, 'stockDetail.maxGiveback', '最大回吐')}</span>
            <span className={`stock-detail-pnl-metric-value ${maxGivebackUsd == null ? 'text-white/[0.34]' : marketTextClass(toNumber(maxGivebackUsd), marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
              {maxGivebackText}
            </span>
          </div>
          <div className="stock-detail-pnl-metric">
            <span className="stock-detail-pnl-metric-label">{t(language, 'stockDetail.drawdownRate', '回撤率')}</span>
            <span className={`stock-detail-pnl-metric-value ${trendStats?.drawdownRate == null ? 'text-white/[0.34]' : marketTextClass(toNumber(trendStats.drawdownRate), marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
              {drawdownRateText || '--'}
            </span>
          </div>
          <div className="stock-detail-pnl-metric">
            <span className="stock-detail-pnl-metric-label">{t(language, 'stockDetail.givebackRate', '回吐率')}</span>
            <span className={`stock-detail-pnl-metric-value ${trendStats?.givebackRate == null ? 'text-white/[0.34]' : marketTextClass(toNumber(maxGivebackUsd || 0), marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
              {givebackRateText || '--'}
            </span>
          </div>
      </div>
    </div>
  );
}

export default function StockDetailPage({ ctx = {} }) {
  const {
    closeStockDetail,
    cacheStockLogo,
    db,
    displayStockName,
    fetchPnlBenchmarkRows,
    language = 'zh',
    logoCache = {},
    marketColorMode,
    pnlReportRefreshVersion = 0,
    portfolioCurrencyMode,
    saveWatchlistStockTarget,
    stockDetailSymbol,
    stockDetailInitialRange = 'all',
    stockDetailTargetEditorOpen = false,
    stockReturnComparisonMethodPreview = false,
    stockReturnComparisonSharePreview = false,
    stockReturnComparisonTooltipPreview = false,
    stockReturnComparisonVisualPreview = false,
    stockTrades,
    supabase,
    usdRate,
    investmentSummary,
    user,
    watchlist = [],
  } = ctx;
  const [range, setRange] = React.useState(() => (
    ['ytd', '1m', '6m', '1y', 'all'].includes(stockDetailInitialRange)
      ? stockDetailInitialRange
      : 'all'
  ));
  const [snapshots, setSnapshots] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [comparisonMarketRows, setComparisonMarketRows] = React.useState({
    key: '',
    qqqRows: [],
    stockRawRows: [],
  });
  const [benchmarkLoading, setBenchmarkLoading] = React.useState(false);
  const [benchmarkError, setBenchmarkError] = React.useState('');
  const [showTargetEditor, setShowTargetEditor] = React.useState(Boolean(stockDetailTargetEditorOpen));
  const [targetSaving, setTargetSaving] = React.useState(false);
  const [targetSaveError, setTargetSaveError] = React.useState(false);
  const [targetOverrideUsd, setTargetOverrideUsd] = React.useState(null);
  const displayCurrency = portfolioCurrencyMode === 'USD' ? 'USD' : 'CNY';
  const displayRate = displayCurrency === 'CNY' ? (toNumber(usdRate) || toNumber(investmentSummary?.usdRate) || USD_CNY_FALLBACK) : 1;
  const symbol = String(stockDetailSymbol || '').trim().toUpperCase();

  React.useEffect(() => {
    setShowTargetEditor(Boolean(stockDetailTargetEditorOpen));
    setTargetSaving(false);
    setTargetSaveError(false);
    setTargetOverrideUsd(null);
  }, [stockDetailTargetEditorOpen, symbol]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadSnapshots() {
      if (!db?.fetchPnlReportSymbolSnapshotHistory || !symbol) {
        setSnapshots([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const rows = await db.fetchPnlReportSymbolSnapshotHistory(symbol, null);
        if (!cancelled) setSnapshots(rows);
      } catch (err) {
        if (!cancelled) {
          setSnapshots([]);
          setError(err?.message || String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, [db, pnlReportRefreshVersion, symbol, user?.id]);

  const view = React.useMemo(() => buildStockDetailViewModel({
    symbol,
    stockTrades,
    symbolSnapshots: snapshots,
    range,
  }), [range, snapshots, stockTrades, symbol]);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadComparisonMarketRows() {
      const from = view.benchmarkQueryStartDate;
      const to = view.benchmarkQueryEndDate;
      if (!view.hasData || !symbol || !from || !to) {
        setComparisonMarketRows({ key: '', qqqRows: [], stockRawRows: [] });
        setBenchmarkError('');
        setBenchmarkLoading(false);
        return;
      }

      const comparisonKey = `${symbol}:${from}:${to}`;
      const requestedSymbols = [...new Set([symbol, 'QQQ'])];
      const rowsBySymbol = new Map();
      const missingSymbols = [];
      requestedSymbols.forEach((requestedSymbol) => {
        const cacheKey = `${requestedSymbol}:${from}:${to}`;
        const cachedRows = readCachedComparisonRawRows(cacheKey);
        if (cachedRows) rowsBySymbol.set(requestedSymbol, cachedRows);
        else missingSymbols.push(requestedSymbol);
      });

      setBenchmarkLoading(true);
      setBenchmarkError('');
      setComparisonMarketRows({ key: '', qqqRows: [], stockRawRows: [] });
      try {
        let token = '';
        if (missingSymbols.length > 0 && typeof fetchPnlBenchmarkRows !== 'function') {
          if (!supabase?.auth?.getSession) throw new Error('benchmark_auth_unavailable');
          const { data: { session } } = await supabase.auth.getSession();
          token = session?.access_token;
          if (!token) throw new Error('benchmark_auth_required');
        }

        const fetchedEntries = await Promise.all(missingSymbols.map(async (requestedSymbol) => {
          let rows;
          if (typeof fetchPnlBenchmarkRows === 'function') {
            rows = await fetchPnlBenchmarkRows({
              symbol: requestedSymbol,
              from,
              to,
              signal: controller.signal,
            });
          } else {
            const response = await fetch(`/api/pnl-benchmark?symbol=${encodeURIComponent(requestedSymbol)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
              cache: 'no-store',
              signal: controller.signal,
              headers: { Authorization: `Bearer ${token}` },
            });
            const body = await response.json().catch(() => null);
            if (!response.ok || body?.success === false) throw new Error('benchmark_request_failed');
            rows = body?.rows;
          }
          if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error('benchmark_rows_missing');
          }
          return [requestedSymbol, rows];
        }));

        // Only publish or cache the pair after every required symbol succeeds.
        // This keeps a partial provider response from mixing with the other side.
        fetchedEntries.forEach(([requestedSymbol, rows]) => {
          rowsBySymbol.set(requestedSymbol, rows);
        });
        const qqqRows = rowsBySymbol.get('QQQ');
        const stockRawRows = rowsBySymbol.get(symbol);
        if (!Array.isArray(qqqRows) || qqqRows.length === 0
          || !Array.isArray(stockRawRows) || stockRawRows.length === 0) {
          throw new Error('benchmark_rows_missing');
        }
        fetchedEntries.forEach(([requestedSymbol, rows]) => {
          cacheComparisonRawRows(`${requestedSymbol}:${from}:${to}`, rows);
        });
        if (!cancelled) {
          setComparisonMarketRows({ key: comparisonKey, qqqRows, stockRawRows });
        }
      } catch (benchmarkLoadError) {
        if (cancelled || benchmarkLoadError?.name === 'AbortError') return;
        setComparisonMarketRows({ key: '', qqqRows: [], stockRawRows: [] });
        setBenchmarkError(benchmarkLoadError?.message || 'benchmark_request_failed');
      } finally {
        if (!cancelled) setBenchmarkLoading(false);
      }
    }

    loadComparisonMarketRows();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetchPnlBenchmarkRows, supabase, symbol, user?.id, view.benchmarkQueryEndDate, view.benchmarkQueryStartDate, view.hasData]);

  const expectedComparisonMarketKey = view.hasData
    && symbol
    && view.benchmarkQueryStartDate
    && view.benchmarkQueryEndDate
    ? `${symbol}:${view.benchmarkQueryStartDate}:${view.benchmarkQueryEndDate}`
    : '';
  const comparisonRowsReady = Boolean(
    expectedComparisonMarketKey && comparisonMarketRows.key === expectedComparisonMarketKey,
  );

  const comparison = React.useMemo(
    () => buildStockReturnComparison(
      view,
      comparisonRowsReady ? comparisonMarketRows.qqqRows : [],
      comparisonRowsReady ? comparisonMarketRows.stockRawRows : [],
    ),
    [comparisonMarketRows, comparisonRowsReady, view],
  );

  const displayName = typeof displayStockName === 'function'
    ? displayStockName(view.symbol, view.name, language)
    : (view.name || view.symbol);
  const targetRows = React.useMemo(
    () => findWatchlistStockDetailRows({ symbol, watchlist }),
    [symbol, watchlist],
  );
  const targetWatchlistRow = targetRows.watchlistRow;
  const targetPriceUsd = targetOverrideUsd ?? positiveNumber(targetWatchlistRow?.targetPriceUsd);
  const targetGap = targetSpacePercent(targetPriceUsd, view.currentPriceUsd);
  const targetProgress = targetProgressPercent(targetPriceUsd, view.currentPriceUsd, view.avgCostUsd);
  const targetProgressPosition = targetProgressPositionPercent(targetProgress);
  const targetEditable = Boolean(targetWatchlistRow && typeof saveWatchlistStockTarget === 'function');
  const cachedLogoEntry = logoCache instanceof Map ? logoCache.get(symbol) : logoCache?.[symbol];
  const cachedLogoUrl = cachedLogoEntry?.url || cachedLogoEntry;
  const targetLogoUrls = stockLogoCandidates(
    symbol,
    cachedLogoUrl,
    targetWatchlistRow?.logoURL,
    targetWatchlistRow?.logoUrl,
    targetWatchlistRow?.logo,
  );
  const totalColor = marketHexColor(view.periodPnlUsd || 0, marketColorMode);
  const totalValue = view.periodPnlUsd == null ? null : view.periodPnlUsd * displayRate;
  const rangeItems = [
    ['ytd', t(language, 'stockDetail.range.ytd', '本年')],
    ['1m', t(language, 'stockDetail.range.1m', '近 1 月')],
    ['6m', t(language, 'stockDetail.range.6m', '近 6 月')],
    ['1y', t(language, 'stockDetail.range.1y', '近 1 年')],
    ['all', t(language, 'stockDetail.range.all', '全部')],
  ];
  const compactRangeLabel = rangeItems.find(([id]) => id === range)?.[1] || rangeItems[0][1];

  const saveTarget = async (targetUsd) => {
    if (!(targetUsd > 0) || !targetEditable) {
      setTargetSaveError(true);
      return;
    }
    setTargetSaving(true);
    setTargetSaveError(false);
    try {
      const normalizedTarget = Number(targetUsd.toFixed(6));
      const result = await saveWatchlistStockTarget(symbol, normalizedTarget);
      if (result?.success === false) throw new Error(result.error || 'target save failed');
      setTargetOverrideUsd(normalizedTarget);
      setShowTargetEditor(false);
    } catch (targetSaveFailure) {
      console.warn('[StockDetail] target save failed:', targetSaveFailure?.message || targetSaveFailure);
      setTargetSaveError(true);
    } finally {
      setTargetSaving(false);
    }
  };

  return (
    <main className="stock-detail-report" style={{ fontFamily: PAGE_FONT }}>
      <header className="sdp-header">
          <button
            type="button"
            onClick={closeStockDetail}
            className="sdp-back"
            aria-label={t(language, 'stockDetail.back', '返回')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
            <h1>
              {t(language, 'stockDetail.subtitle', '个股收益详情')}
            </h1>
          <span className="sdp-header-currency">{displayCurrency}</span>
      </header>

      <nav className="sdp-ranges" aria-label={language === 'en' ? 'Return period' : '收益区间'}>
          {rangeItems.map(([id, label]) => (
            <RangePill key={id} active={range === id} onClick={() => setRange(id)}>
              {label}
            </RangePill>
          ))}
      </nav>

      <section
        className="sdp-summary"
        data-stock-detail-summary-card="true"
      >
          <div className="sdp-identity">
            <StockLogo symbol={symbol} urls={targetLogoUrls} onLogoLoad={cacheStockLogo} className="sdp-logo" />
            <div>
              <div className="sdp-symbol">{view.symbol || '--'}</div>
              <div className="sdp-company">{displayName && displayName !== view.symbol ? displayName : ''}</div>
            </div>
          </div>
          <div className="sdp-pnl-label">{t(language, 'stockDetail.totalPnl', '累计盈亏')}</div>
          <div className="sdp-total" data-stock-detail-total-pnl style={{ color: totalColor, fontFamily: NUMBER_FONT }}>
            {totalValue == null ? '--' : signedCurrency(totalValue, displayCurrency, 2)}
          </div>
          <div className={`sdp-total-percent ${view.periodPnlPct == null ? 'text-white/[0.32]' : marketTextClass(view.periodPnlUsd || 0, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
            {signedPct(view.periodPnlPct, 2)}
          </div>
          <div className="sdp-period">{view.startDate} — {view.endDate}</div>

          <div className="sdp-pnl-breakdown">
            <StatCell
              label={t(language, 'stockDetail.realizedPnl', '已实现盈亏')}
              value={view.hasData ? signedCurrency(view.realizedPnlUsd * displayRate, displayCurrency, 2) : '--'}
              valueClass={marketTextClass(view.realizedPnlUsd, marketColorMode)}
            />
            <StatCell
              label={t(language, 'stockDetail.unrealizedPnl', '未实现盈亏')}
              value={view.hasData ? signedCurrency(view.unrealizedPnlUsd * displayRate, displayCurrency, 2) : '--'}
              valueClass={marketTextClass(view.unrealizedPnlUsd, marketColorMode)}
            />
          </div>
          <div className="sdp-holding-facts">
            <StatCell
              label={t(language, 'stockDetail.heldShares', '持仓数量')}
              value={view.hasData ? `${fmt(view.heldShares, 0)} ${t(language, 'stockDetail.shares', '股')}` : '--'}
            />
            <StatCell
              label={t(language, 'stockDetail.avgCost', '会计平均成本')}
              value={view.avgCostUsd > 0 ? `$${fmt(view.avgCostUsd, 3)}` : '--'}
            />
            <StatCell
              label={t(language, 'stockDetail.holdingDays', '持仓天数')}
              value={view.holdingDays != null ? `${fmt(view.holdingDays, 0)} ${t(language, 'stockDetail.days', '天')}` : '--'}
            />
            <StatCell
              label={t(language, 'stockDetail.firstEntry', '首次建仓')}
              value={view.holdingStartDate ? displayDate(view.holdingStartDate) : '--'}
            />
          </div>
      </section>

      {showTargetEditor && targetEditable ? (
        <TargetEditor
          language={language}
          symbol={symbol}
          name={displayName}
          logoUrls={targetLogoUrls}
          onLogoLoad={cacheStockLogo}
          currency="USD"
          currentCloseUsd={view.currentPriceUsd}
          averageCostUsd={view.avgCostUsd}
          targetPriceUsd={targetPriceUsd}
          marketColorMode={marketColorMode}
          saving={targetSaving}
          error={targetSaveError}
          onCancel={() => !targetSaving && setShowTargetEditor(false)}
          onSave={saveTarget}
        />
      ) : null}

      <section
        className="sdp-section sdp-trend"
        data-stock-detail-pnl-trend-card="true"
      >
        <div className="sdp-section-heading">
          <h2>{t(language, 'stockDetail.pnlTrend', '收益走势')}</h2>
          <span>{compactRangeLabel}</span>
        </div>
        <PnlSparkline
          points={view.trend.map((point) => ({ ...point, pnlUsd: point.pnlUsd * displayRate }))}
          color={totalColor}
          emptyText={loading ? t(language, 'stockDetail.loading', '正在读取快照') : t(language, 'stockDetail.noTrend', '暂无足够快照')}
          startDate={view.axisStartDate}
          endDate={view.axisEndDate}
          currencyMode={displayCurrency}
          marketColorMode={marketColorMode}
          displayRate={displayRate}
          language={language}
          trendStats={view.trendStats}
        />
      </section>

      <StockReturnComparisonCard
        comparison={comparison}
        loading={benchmarkLoading || loading || Boolean(expectedComparisonMarketKey && !comparisonRowsReady && !benchmarkError)}
        error={benchmarkError}
        symbol={view.symbol}
        language={language}
        marketColorMode={marketColorMode}
        displayCurrency={displayCurrency}
        displayRate={displayRate}
        initialMethodOpen={stockReturnComparisonMethodPreview}
        initialShareOpen={stockReturnComparisonSharePreview}
        initialTooltipOpen={stockReturnComparisonTooltipPreview}
        visualPreview={stockReturnComparisonVisualPreview}
      />

      <section className="sdp-section sdp-target-section">
        <button
          type="button"
          data-stock-detail-target-plan="true"
          onClick={() => {
            if (!targetEditable) return;
            setTargetSaveError(false);
            setShowTargetEditor(true);
          }}
          disabled={!targetEditable}
          className="sdp-target-plan"
          aria-label={t(language, 'watchlistDetail.editTargetAria', '编辑 {{symbol}} 目标价', { symbol })}
        >
          <div className="sdp-section-heading">
            <h2>{t(language, 'watchlistDetail.personalPlan', '个人计划')}</h2>
            <ChevronRight className={`h-4 w-4 ${targetEditable ? 'text-white/[0.40]' : 'text-transparent'}`} />
          </div>
          <div className="sdp-target-numbers">
            <div>
              <div className="sdp-stat-label">{t(language, 'watchlistDetail.singleTargetPrice', '单一目标价（{{currency}}）', { currency: 'USD' })}</div>
              <div className="sdp-target-price" style={{ fontFamily: NUMBER_FONT }}>
                {targetPriceUsd === null ? '--' : currency(targetPriceUsd, 'USD', 2)}
              </div>
            </div>
            <div className="sdp-target-gap">
              <div className="sdp-stat-label">{t(language, 'watchlistDetail.targetSpace', '距目标空间')}</div>
              <div className="sdp-target-percent" style={{ color: targetGap === null ? '#85858d' : marketHexColor(targetGap, marketColorMode), fontFamily: NUMBER_FONT }}>
                {signedPercentValue(targetGap)}
              </div>
            </div>
          </div>
          <div className="sdp-target-track">
            <span style={{ left: `${targetProgressPosition}%`, opacity: targetProgress === null ? 0.35 : 1 }} />
          </div>
          <div className="sdp-target-references">
            <span>{t(language, 'watchlistDetail.cost', '成本 {{price}}', { price: view.avgCostUsd > 0 ? currency(view.avgCostUsd, 'USD', 2) : '--' })}</span>
            <span>{t(language, 'watchlistDetail.current', '当前 {{price}}', { price: view.currentPriceUsd > 0 ? currency(view.currentPriceUsd, 'USD', 2) : '--' })}</span>
            <span>{t(language, 'watchlistDetail.target', '目标 {{price}}', { price: targetPriceUsd === null ? '--' : currency(targetPriceUsd, 'USD', 2) })}</span>
          </div>
          <div className="sdp-target-progress">
            {t(language, 'watchlistDetail.costToTargetProgress', '成本至目标已完成')}
            <span>{targetProgress === null ? '--' : `${targetProgress.toFixed(1)}%`}</span>
          </div>
        </button>
      </section>

      <section className="sdp-section" data-stock-detail-trade-stats="true">
        <div className="sdp-section-heading"><h2>{t(language, 'stockDetail.tradeStats', '交易统计')}</h2></div>
        <div className="sdp-trade-stats">
          <StatCell label={t(language, 'stockDetail.buyAmount', '买入金额')} value={currency(view.stats.buyAmountUsd * displayRate, displayCurrency, 2)} />
          <StatCell label={t(language, 'stockDetail.sellAmount', '卖出金额')} value={currency(view.stats.sellAmountUsd * displayRate, displayCurrency, 2)} />
          <StatCell label={t(language, 'stockDetail.buyCount', '买入次数')} value={`${view.stats.buyCount} ${t(language, 'stockDetail.tradesCount', '笔')}`} />
          <StatCell label={t(language, 'stockDetail.sellCount', '卖出次数')} value={`${view.stats.sellCount} ${t(language, 'stockDetail.tradesCount', '笔')}`} />
        </div>
      </section>

      <section className="sdp-section" data-stock-detail-records="true">
        <div className="sdp-section-heading">
          <h2>{t(language, 'stockDetail.tradeRecords', '交易记录')}</h2>
          <span>{compactRangeLabel}</span>
        </div>
        {view.tradeRecords.length === 0 ? (
          <div className="sdp-empty">
              {t(language, 'stockDetail.noTrades', '当前周期暂无交易记录')}
          </div>
        ) : (
          <div
            className="stock-detail-trade-records-scroll"
            data-pull-refresh-block="true"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="sdp-records-table" role="table" aria-label={t(language, 'stockDetail.tradeRecords', '交易记录')}>
              <div className="sdp-record-head sdp-record-row" role="row">
                <span className="sdp-record-date" role="columnheader">{t(language, 'stockDetail.dateAction', '日期 / 操作')}</span>
                <span role="columnheader">{t(language, 'stockDetail.qtyPrice', '数量 / 价格')}</span>
                <span role="columnheader">{t(language, 'stockDetail.amount', '成交额')}</span>
                <span role="columnheader">{t(language, 'stockDetail.realized', '实现盈亏')}</span>
              </div>
              <div role="rowgroup">
                {view.tradeRecords.map((record) => {
                  const isSell = record.side === 'sell';
                  const realizedValue = record.realizedPnlUsd == null ? null : record.realizedPnlUsd * displayRate;
                  return (
                    <div key={`${record.id || record.date}-${record.side}-${record.shares}`} className="sdp-record-row" role="row">
                      <div className="sdp-record-date" role="cell">
                        <div className={DETAIL_MUTED_VALUE_CLASS} style={{ fontFamily: NUMBER_FONT }}>{displayDate(record.date)}</div>
                        <div className={`sdp-record-secondary ${isSell ? marketTextClass(-1, marketColorMode) : marketTextClass(1, marketColorMode)}`}>
                          {sideLabel(language, record.side)}
                        </div>
                      </div>
                      <div role="cell">
                        <div className={DETAIL_MUTED_VALUE_CLASS} style={{ fontFamily: NUMBER_FONT }}>{fmt(record.shares, 0)} {t(language, 'stockDetail.shares', '股')}</div>
                        <div className="sdp-record-secondary sdp-record-price" style={{ fontFamily: NUMBER_FONT }}>@ ${fmt(record.price, 2)}</div>
                      </div>
                      <div className={DETAIL_MUTED_VALUE_CLASS} role="cell" style={{ fontFamily: NUMBER_FONT }}>
                        {currency(record.amountUsd * displayRate, displayCurrency, 2)}
                      </div>
                      <div className={realizedValue == null ? 'text-white/[0.34]' : marketTextClass(realizedValue, marketColorMode)} role="cell" style={{ fontFamily: NUMBER_FONT }}>
                        {realizedValue == null ? '--' : signedCurrency(realizedValue, displayCurrency, 2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {(error || (!view.hasData && !loading)) && (
        <div className="sdp-status" role="status">
          {error || t(language, 'stockDetail.noSnapshotNotice', '暂无该股票收盘快照。页面只读取已有快照和交易账本,不会使用假数据替代。')}
        </div>
      )}
      <div className="h-2" />
    </main>
  );
}
