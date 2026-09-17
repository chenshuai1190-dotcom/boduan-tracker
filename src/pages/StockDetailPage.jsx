import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { t } from '../lib/i18n.js';
import { buildStockDetailViewModel } from '../lib/stockDetailViewModel.js';
import {
  findWatchlistStockDetailRows,
  targetProgressPercent,
  targetProgressPositionPercent,
  targetSpacePercent,
} from '../lib/watchlistStockDetail.js';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';
import { ComparisonChart } from '../components/StockReturnComparisonCard.jsx';
import StockTradeEvents from '../components/StockTradeEvents.jsx';
import { calculateMFE, calculateMAE, calculateMaxDrawdown, calculateProfitCapture, buildTradeMarkers, filterReviewRange, defaultReviewRange } from '../lib/stockTradeReview.js';
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
    language = 'zh',
    logoCache = {},
    marketColorMode,
    pnlReportRefreshVersion = 0,
    portfolioCurrencyMode,
    saveWatchlistStockTarget,
    stockDetailSymbol,
    stockDetailInitialRange,
    stockDetailTargetEditorOpen = false,
    stockReturnComparisonTooltipPreview = false,
    stockTrades,
    usdRate,
    investmentSummary,
    user,
    watchlist = [],
  } = ctx;
  const [range, setRange] = React.useState(() => (
    ['1m', '3m', '6m', 'all'].includes(stockDetailInitialRange)
      ? stockDetailInitialRange
      : null
  ));
  const [selectedTradeEvent, setSelectedTradeEvent] = React.useState(null);
  const [snapshots, setSnapshots] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
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
    range: 'all',
  }), [snapshots, stockTrades, symbol]);

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
  const label = (zh, en) => language === 'en' ? en : zh;
  const cycle = view.cycleReview || {};
  const cycleReady = cycle.available === true;
  const cycleTrend = cycleReady ? cycle.trend : [];
  const totalColor = marketHexColor(cycle.currentTotalPnlUsd || 0, marketColorMode);
  const totalValue = cycle.currentTotalPnlUsd == null ? null : cycle.currentTotalPnlUsd * displayRate;
  const activeRange = range || defaultReviewRange(cycle.startDate && cycle.endDate && cycle.startDate < cycle.endDate
    ? [{ date: cycle.startDate }, { date: cycle.endDate }] : cycleTrend);
  const stockSeries = {
    symbol,
    available: cycleReady,
    baselineDate: cycle.startDate,
    stockPnlUsd: cycle.currentTotalPnlUsd,
    stockPnlPct: cycle.returnPct,
    trend: filterReviewRange(cycleTrend, activeRange).map(point => ({
      ...point, stockPnlUsd: point.totalPnlUsd, stockPnlPct: point.returnPct,
    })),
  };
  const reviewRecords = cycle.startDate ? cycle.tradeRecords : view.tradeRecords;
  const tradeMarkers = buildTradeMarkers(reviewRecords, stockSeries.trend);
  const mfe = calculateMFE(cycleTrend);
  const mae = calculateMAE(cycleTrend);
  const drawdown = calculateMaxDrawdown(cycleTrend.map(point => ({ date: point.date, equity: point.marketValueUsd })));
  const profitCapture = calculateProfitCapture(cycle.currentTotalPnlUsd, mfe?.valueUsd);
  const moneyOrMissing = value => value == null ? '--' : signedCurrency(value * displayRate, displayCurrency, 2);
  const holdingDetails = [
    { label: label('持仓数量', 'Shares'), value: view.hasData ? `${fmt(view.heldShares, 0)} ${label('股', 'shares')}` : '--' },
    { label: label('会计平均成本', 'Average cost'), value: view.avgCostUsd > 0 ? `$${fmt(view.avgCostUsd, 3)}` : '--' },
    { label: label('最新收盘价', 'Latest close'), value: view.currentPriceUsd > 0 ? `$${fmt(view.currentPriceUsd, 2)}` : '--' },
    { label: label('盈亏平衡价', 'Break-even price'), value: cycle.breakEvenPriceUsd == null ? '--' : `$${fmt(cycle.breakEvenPriceUsd, 3)}` },
    { label: label('持仓天数', 'Holding days'), value: cycle.holdingDays == null ? '--' : `${cycle.holdingDays} ${label('天', 'days')}` },
    { label: label('本轮首次建仓', 'Cycle first buy'), value: cycle.startDate ? displayDate(cycle.startDate) : '--' },
  ];
  const rangeItems = [
    ['1m', label('1个月', '1 month')], ['3m', label('3个月', '3 months')],
    ['6m', label('6个月', '6 months')], ['all', label('全部', 'All')],
  ];

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
          <div className="sdp-pnl-label">{label('累积总收益', 'Cumulative total return')}</div>
          <div className="sdp-total" data-stock-detail-total-pnl style={{ color: totalColor, fontFamily: NUMBER_FONT }}>
            {totalValue == null ? '--' : signedCurrency(totalValue, displayCurrency, 2)}
          </div>
          <div className={`sdp-total-percent ${cycle.returnPct == null ? 'text-white/[0.32]' : marketTextClass(cycle.currentTotalPnlUsd || 0, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
            {signedPct(cycle.returnPct, 2)}
          </div>
          <div className="sdp-period">{cycle.startDate ? displayDate(cycle.startDate) : '--'} — {view.endDate} · {label('收盘', 'Close')}</div>

          <div className="sdp-pnl-breakdown">
            <StatCell
              label={t(language, 'stockDetail.realizedPnl', '已实现盈亏')}
              value={moneyOrMissing(cycle.realizedPnlUsd)}
              valueClass={marketTextClass(cycle.realizedPnlUsd, marketColorMode)}
            />
            <StatCell
              label={t(language, 'stockDetail.unrealizedPnl', '未实现盈亏')}
              value={moneyOrMissing(cycle.unrealizedPnlUsd)}
              valueClass={marketTextClass(cycle.unrealizedPnlUsd, marketColorMode)}
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
              label={label('最新收盘价', 'Latest close')}
              value={view.currentPriceUsd > 0 ? `$${fmt(view.currentPriceUsd, 2)}` : '--'}
            />
            <StatCell
              label={label('盈亏平衡价', 'Break-even price')}
              value={cycle.breakEvenPriceUsd == null ? '--' : `$${fmt(cycle.breakEvenPriceUsd, 3)}`}
            />
            <StatCell label={label('持仓天数', 'Holding days')} value={holdingDetails[4].value} />
            <StatCell label={label('本轮首次建仓', 'Cycle first buy')} value={holdingDetails[5].value} />
          </div>
          <div className="sdp-review-note">{label('盈亏平衡价扣除本轮已实现收益，与会计成本分开。', 'Break-even price deducts this cycle’s realized return from remaining cost.')}</div>
          {view.hasData && !cycleReady && !loading && <div className="sdp-review-note" role="status">{cycle.reason === 'no_active_cycle'
            ? label('当前没有存续持仓，本轮收益暂不显示。', 'No active position; current-cycle returns are unavailable.')
            : label('本轮账本与收盘记录未能完整匹配，收益与风险指标暂不显示。', 'Cycle ledger and closing records do not fully match; return and risk metrics are unavailable.')}</div>}
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

      <section className="sdp-section" data-stock-detail-trade-quality="true">
        <div className="sdp-section-heading"><h2>{label('交易质量', 'Trade quality')}</h2><span>{label('本轮 · 收盘记录', 'Current cycle · closes')}</span></div>
        <div className="sdp-quality-grid">
          <StatCell label={label('最大浮盈 MFE', 'Maximum profit · MFE')} value={moneyOrMissing(mfe?.valueUsd)} valueClass={marketTextClass(mfe?.valueUsd, marketColorMode)} />
          <StatCell label={label('最大浮亏 MAE', 'Maximum loss · MAE')} value={moneyOrMissing(mae?.valueUsd)} valueClass={marketTextClass(mae?.valueUsd, marketColorMode)} />
          <StatCell label={label('最大回撤', 'Maximum drawdown')} value={signedPct(drawdown?.drawdownPct)} valueClass={marketTextClass(drawdown?.drawdownPct, marketColorMode)} />
          <StatCell label={label('利润保留率', 'Profit capture')} value={profitCapture == null ? '--' : `${fmt(profitCapture * 100, 2)}%`} />
          <StatCell label={label('收益最高日期', 'Highest return date')} value={mfe?.observedDate ? displayDate(mfe.observedDate) : '--'} />
          <StatCell label={label('收益最低日期', 'Lowest return date')} value={mae?.observedDate ? displayDate(mae.observedDate) : '--'} />
          <StatCell label={label('持仓天数', 'Holding days')} value={holdingDetails[4].value} />
        </div>
      </section>

      <section className="sdp-section sdp-trend" data-stock-detail-pnl-trend-card="true">
        <div className="sdp-section-heading"><h2>{t(language, 'stockDetail.pnlTrend', '收益走势')}</h2><span>{displayCurrency}</span></div>
        <div className="sdp-review-legend">
          <span style={{ color: totalColor }}><i />{symbol} {moneyOrMissing(cycle.currentTotalPnlUsd)}</span>
        </div>
        <nav className="sdp-ranges sdp-review-ranges" aria-label={label('图表时间范围', 'Chart range')}>
          {rangeItems.map(([id, text]) => <RangePill key={id} active={activeRange === id} onClick={() => setRange(id)}>{text}</RangePill>)}
        </nav>
        <ComparisonChart stockOnly comparison={stockSeries} displayRate={displayRate} displayCurrency={displayCurrency} language={language} marketColorMode={marketColorMode} mode="amount" tradeMarkers={tradeMarkers} onSelectTradeMarker={setSelectedTradeEvent} initialTooltipOpen={stockReturnComparisonTooltipPreview} />
        <div className="sdp-review-note">{label('本轮累计收益 · 已实现 + 未实现；切换时间范围不重置收益。', 'Current-cycle realized + unrealized return; changing the range does not rebase returns.')}</div>
        <div className="sdp-review-marker-key"><span style={{ color: marketHexColor(-1, marketColorMode) }}>B {label('买入', 'Buy')}</span><span style={{ color: marketHexColor(1, marketColorMode) }}>S {label('卖出', 'Sell')}</span><span>{label('点击标记查看成交', 'Tap a marker for trades')}</span></div>
      </section>

      <StockTradeEvents records={reviewRecords} selectedEvent={selectedTradeEvent} onSelectEvent={setSelectedTradeEvent} onCloseEvent={() => setSelectedTradeEvent(null)} language={language} displayCurrency={displayCurrency} displayRate={displayRate} marketColorMode={marketColorMode} holdingDetails={holdingDetails} />

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

      {(error || (!view.hasData && !loading)) && (
        <div className="sdp-status" role="status">
          {error || t(language, 'stockDetail.noSnapshotNotice', '暂无该股票收盘快照。页面只读取已有快照和交易账本,不会使用假数据替代。')}
        </div>
      )}
      <div className="h-2" />
    </main>
  );
}
