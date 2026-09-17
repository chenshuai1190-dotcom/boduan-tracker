import React from 'react';
import { Copy, Info } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import StockReportModal from './StockReportModal.jsx';
import './StockReturnComparisonCard.css';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const BENCHMARK_LINE_COLOR = '#85858f';
const CHART_TOOLTIP_HOLD_MS = 12000;
const CHART_WIDTH = 360;
const CHART_HEIGHT = 270;
const CHART_PAD = { left: 38, right: 8, top: 24, bottom: 30 };

function finite(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || typeof value === 'boolean') return false;
  return Number.isFinite(Number(value));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value, digits = 2) {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signedCurrency(value, currency = 'USD', digits = 2) {
  if (!finite(value)) return '--';
  const amount = Number(value);
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${amount >= 0 ? '+' : '-'}${symbol}${fmt(Math.abs(amount), digits)}`;
}

function signedPct(value, digits = 2) {
  if (!finite(value)) return '--';
  const pct = Number((Number(value) * 100).toFixed(digits));
  return `${pct > 0 ? '+' : ''}${pct.toFixed(digits)}%`;
}

function valueClass(value, marketColorMode) {
  if (!finite(value) || Math.abs(Number(value)) < 1e-12) return 'text-white/[0.52]';
  return marketTextClass(value, marketColorMode);
}

function valueColor(value, marketColorMode) {
  if (!finite(value) || Math.abs(Number(value)) < 1e-12) return 'rgba(255,255,255,0.52)';
  return marketHexColor(value, marketColorMode);
}

function dateMs(value) {
  const date = Date.parse(`${String(value || '')}T00:00:00Z`);
  return Number.isFinite(date) ? date : null;
}

function axisDate(value) {
  const parts = String(value || '').split('-');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : '--';
}

function axisMoney(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '--';
  const abs = Math.abs(amount);
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  if (currency === 'CNY') {
    if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`;
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${abs.toFixed(0)}`;
  }
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function chartGeometry(points, width = CHART_WIDTH, height = CHART_HEIGHT, mode = 'amount', stockOnly = false) {
  const pad = CHART_PAD;
  const stockKey = mode === 'percent' ? 'stockPnlPct' : 'stockPnlUsd';
  const benchmarkKey = mode === 'percent' ? 'benchmarkPnlPct' : 'benchmarkPnlUsd';
  const rows = (Array.isArray(points) ? points : [])
    .filter((point) => point?.date && finite(point?.[stockKey]) && (stockOnly || finite(point?.[benchmarkKey])));
  if (rows.length < 2) return { rows, minePath: '', benchmarkPath: '', ticks: [] };

  const values = rows.flatMap((point) => stockOnly
    ? [Number(point[stockKey]), 0]
    : [Number(point[stockKey]), Number(point[benchmarkKey]), 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, mode === 'percent' ? 0.001 : 1);
  const domainMin = min - padding;
  const domainMax = max + padding;
  const span = domainMax - domainMin || 1;
  const start = dateMs(rows[0].date);
  const end = dateMs(rows.at(-1).date);
  const dateSpan = start != null && end != null && end > start ? end - start : null;
  const x = (point, index) => {
    const current = dateMs(point.date);
    const progress = dateSpan && current != null
      ? (current - start) / dateSpan
      : index / Math.max(rows.length - 1, 1);
    return pad.left + Math.min(1, Math.max(0, progress)) * (width - pad.left - pad.right);
  };
  const y = (value) => pad.top + (1 - ((Number(value) - domainMin) / span)) * (height - pad.top - pad.bottom);
  const plotted = rows.map((point, index) => ({
    ...point,
    x: x(point, index),
    mineY: y(point[stockKey]),
    benchmarkY: stockOnly ? null : y(point[benchmarkKey]),
  }));
  const pathFor = (key) => {
    if (plotted.length === 1) {
      const yValue = plotted[0][key];
      return `M${pad.left} ${yValue.toFixed(2)} L${width - pad.right} ${yValue.toFixed(2)}`;
    }
    return plotted.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point[key].toFixed(2)}`).join(' ');
  };
  const ticks = [domainMax, domainMin + span * 0.66, domainMin + span * 0.33, domainMin]
    .map((value) => ({ value, y: y(value) }));
  return {
    rows: plotted,
    minePath: pathFor('mineY'),
    benchmarkPath: stockOnly ? '' : pathFor('benchmarkY'),
    ticks,
  };
}

function Metric({ metric, label, amount, pct, pctLabel = '', displayRate, displayCurrency, marketColorMode }) {
  const displayedAmount = finite(amount) ? Number(amount) * displayRate : null;
  const tone = valueClass(amount, marketColorMode);
  return (
    <div className="stock-comparison-metric" data-stock-comparison-metric={metric}>
      <div className="stock-comparison-metric-label">{label}</div>
      <div data-stock-comparison-metric-amount className={`stock-comparison-metric-amount ${tone}`} style={{ fontFamily: NUMBER_FONT }}>
        {signedCurrency(displayedAmount, displayCurrency)}
      </div>
      <div data-stock-comparison-metric-pct className={`stock-comparison-metric-pct ${valueClass(pct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
        {pctLabel ? <span>{pctLabel}</span> : null}
        {signedPct(pct, 2)}
      </div>
    </div>
  );
}

function SummaryMetric({ metric, label, value, isAmount = false, displayRate, displayCurrency, marketColorMode }) {
  return <div className="stock-comparison-metric" data-stock-comparison-summary-metric={metric}>
    <div className="stock-comparison-metric-label">{label}</div>
    <div className={`stock-comparison-summary-value ${valueClass(value, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
      {isAmount ? signedCurrency(finite(value) ? Number(value) * displayRate : null, displayCurrency) : signedPct(value)}
    </div>
  </div>;
}

export function ComparisonChart({
  comparison,
  displayRate = 1,
  displayCurrency = 'USD',
  language = 'zh',
  marketColorMode,
  initialTooltipOpen = false,
  mode = 'amount',
  stockOnly = false,
  tradeMarkers = [],
  onSelectTradeMarker,
}) {
  const percentMode = mode === 'percent';
  const englishMode = isEnglishLanguage(language);
  const points = React.useMemo(() => (
    (comparison?.trend || []).map((point) => ({
      ...point,
      stockPnlUsd: finite(point.stockPnlUsd) ? Number(point.stockPnlUsd) * displayRate : null,
      benchmarkPnlUsd: finite(point.benchmarkPnlUsd) ? Number(point.benchmarkPnlUsd) * displayRate : null,
      excessPnlUsd: finite(point.excessPnlUsd) ? Number(point.excessPnlUsd) * displayRate : null,
    }))
  ), [comparison?.trend, displayRate]);
  const [chartWidth, setChartWidth] = React.useState(CHART_WIDTH);
  const chart = React.useMemo(() => chartGeometry(points, chartWidth, CHART_HEIGHT, mode, stockOnly), [points, chartWidth, mode, stockOnly]);
  const mineLineValue = stockOnly
    ? chart.rows.at(-1)?.[percentMode ? 'stockPnlPct' : 'stockPnlUsd']
    : comparison?.stockPnlUsd;
  const mineLineColor = valueColor(mineLineValue, marketColorMode);
  const buyMarkerColor = marketHexColor(-1, marketColorMode);
  const sellMarkerColor = marketHexColor(1, marketColorMode);
  const plottedMarkers = React.useMemo(() => {
    const rowsByDate = new Map(chart.rows.map(point => [point.date, point]));
    return (Array.isArray(tradeMarkers) ? tradeMarkers : []).flatMap(marker => {
      const point = rowsByDate.get(marker?.markerDate || marker?.date);
      if (!point || !['buy', 'sell', 'mixed'].includes(marker?.side) || !Array.isArray(marker?.records) || marker.records.length === 0) return [];
      return [{ marker, point, label: marker.side === 'buy' ? 'B' : marker.side === 'sell' ? 'S' : 'B/S' }];
    });
  }, [chart.rows, tradeMarkers]);
  const [selectedIndex, setSelectedIndex] = React.useState(() => (
    initialTooltipOpen && chart.rows.length > 0 ? Math.floor(chart.rows.length / 2) : null
  ));
  const chartRootRef = React.useRef(null);
  const hideTimerRef = React.useRef(null);
  const activePointerIdRef = React.useRef(null);
  const selected = selectedIndex == null ? null : chart.rows[selectedIndex] || null;
  const hasSelection = selectedIndex != null;
  const firstDate = chart.rows[0]?.date || comparison?.baselineDate;
  const lastDate = chart.rows.at(-1)?.date || comparison?.snapshotDate;
  const isPositionStart = comparison?.positionStartDate === comparison?.baselineDate;
  const comparisonStartLabel = stockOnly
    ? `${englishMode ? 'Cycle start' : '本轮建仓'} ${axisDate(comparison?.baselineDate)}`
    : isPositionStart
    ? t(language, 'stockDetail.comparison.chartFirstBuy', '首笔买入 {{date}}', {
      date: axisDate(comparison?.baselineDate),
    })
    : t(language, 'stockDetail.comparison.chartStart', '对比起点 {{date}}', {
      date: axisDate(comparison?.baselineDate),
    });
  const firstMs = dateMs(firstDate);
  const lastMs = dateMs(lastDate);
  const middleDate = firstMs != null && lastMs != null
    ? new Date(firstMs + ((lastMs - firstMs) / 2)).toISOString().slice(0, 10)
    : firstDate;

  React.useEffect(() => {
    const root = chartRootRef.current;
    if (!root) return undefined;
    const measure = () => {
      const width = root.getBoundingClientRect().width;
      if (Number.isFinite(width) && width > 0) setChartWidth(width);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [chart.rows.length > 1]);

  React.useEffect(() => {
    setSelectedIndex(initialTooltipOpen && chart.rows.length > 0 ? Math.floor(chart.rows.length / 2) : null);
    window.clearTimeout(hideTimerRef.current);
  }, [chart.rows.length, comparison?.baselineDate, comparison?.snapshotDate, initialTooltipOpen, mode, stockOnly]);

  React.useEffect(() => {
    return () => window.clearTimeout(hideTimerRef.current);
  }, []);

  React.useEffect(() => {
    if (!hasSelection) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!chartRootRef.current?.contains(event.target)) {
        window.clearTimeout(hideTimerRef.current);
        setSelectedIndex(null);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [hasSelection]);

  const keepSelectedPointVisible = React.useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setSelectedIndex(null), CHART_TOOLTIP_HOLD_MS);
  }, []);

  const selectNearest = React.useCallback((event) => {
    if (chart.rows.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * chartWidth;
    let index = 0;
    let distance = Number.POSITIVE_INFINITY;
    chart.rows.forEach((point, pointIndex) => {
      const nextDistance = Math.abs(point.x - cursorX);
      if (nextDistance < distance) {
        index = pointIndex;
        distance = nextDistance;
      }
    });
    setSelectedIndex(index);
    keepSelectedPointVisible();
  }, [chart.rows, chartWidth, keepSelectedPointVisible]);

  const handlePointerDown = React.useCallback((event) => {
    if (event.isPrimary === false) return;
    if (event.target?.closest?.('[data-stock-comparison-trade-marker]')) return;
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectNearest(event);
  }, [selectNearest]);

  const handlePointerMove = React.useCallback((event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    selectNearest(event);
  }, [selectNearest]);

  const finishPointerTracking = React.useCallback((event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }, []);

  if (!chart.minePath || (!stockOnly && !chart.benchmarkPath)) {
    return (
      <div className="stock-comparison-empty stock-comparison-chart-empty">
        {stockOnly
          ? (englishMode ? 'Not enough closing records for this cycle' : '暂无足够的本轮收盘记录')
          : t(language, 'stockDetail.comparison.noCommonTrend', '双方没有足够的同日收盘快照，暂不绘制对比曲线')}
      </div>
    );
  }

  return (
    <div ref={chartRootRef} className="stock-comparison-chart-section">
      {!stockOnly && <div className="stock-comparison-legend">
        <span><i style={{ background: mineLineColor }} />{t(language, 'stockDetail.comparison.mineLine', '当前持仓收益线')}</span>
        <span><i className="stock-comparison-benchmark-key" style={{ borderColor: BENCHMARK_LINE_COLOR }} />{t(language, 'stockDetail.comparison.qqqLine', '基准：QQQ')}</span>
      </div>}
      <div
        className="stock-comparison-chart"
        data-stock-return-comparison-chart="true"
        data-stock-return-comparison-mode={mode}
        data-stock-return-chart-stock-only={stockOnly || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerTracking}
        onPointerCancel={finishPointerTracking}
        onLostPointerCapture={finishPointerTracking}
        style={{ touchAction: 'pan-y' }}
      >
        <svg viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="stock-comparison-chart-svg">
          <defs>
            <linearGradient id="stockReturnComparisonArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={mineLineColor} stopOpacity="0.1" />
              <stop offset="100%" stopColor={mineLineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {chart.ticks.map((tick) => (
            <React.Fragment key={`${tick.value}-${tick.y}`}>
              <line x1={CHART_PAD.left} y1={tick.y} x2={chartWidth - CHART_PAD.right} y2={tick.y} stroke="rgba(255,255,255,0.065)" />
              <text x="0" y={Math.min(CHART_HEIGHT - CHART_PAD.bottom, Math.max(14, tick.y + 3))} fontSize="10" fill="#74747e">{percentMode ? signedPct(tick.value, Math.abs(tick.value) < 0.01 ? 2 : 1) : axisMoney(tick.value, displayCurrency)}</text>
            </React.Fragment>
          ))}
          <text x={CHART_PAD.left} y="12" fontSize="10" fill="#85858f">{comparisonStartLabel}</text>
          {chart.minePath && (
            <path
              d={`${chart.minePath} L${chart.rows.at(-1).x.toFixed(2)} ${CHART_HEIGHT - CHART_PAD.bottom} L${chart.rows[0].x.toFixed(2)} ${CHART_HEIGHT - CHART_PAD.bottom} Z`}
              fill="url(#stockReturnComparisonArea)"
            />
          )}
          {!stockOnly && <path data-stock-comparison-benchmark-path d={chart.benchmarkPath} fill="none" stroke={BENCHMARK_LINE_COLOR} strokeWidth="1.4" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" />}
          <path data-stock-comparison-mine-path d={chart.minePath} fill="none" stroke={mineLineColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {plottedMarkers.map(({ marker, point, label }) => (
            <g key={`${marker.date}-${marker.side}`} data-stock-comparison-marker-glyph={marker.side} transform={`translate(${point.x} ${point.mineY})`} aria-hidden="true" pointerEvents="none">
              <circle r={marker.side === 'mixed' ? 13 : 10} fill="#101112" stroke={marker.side === 'buy' ? buyMarkerColor : marker.side === 'sell' ? sellMarkerColor : '#919199'} strokeWidth="1.4" />
              {marker.side === 'mixed' ? <text textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="400"><tspan fill={buyMarkerColor}>B</tspan><tspan fill="#919199">/</tspan><tspan fill={sellMarkerColor}>S</tspan></text> : <text textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="400" fill={marker.side === 'buy' ? buyMarkerColor : sellMarkerColor}>{label}</text>}
            </g>
          ))}
          {selected && (
            <>
              <line x1={selected.x} y1={CHART_PAD.top} x2={selected.x} y2={CHART_HEIGHT - CHART_PAD.bottom} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 5" />
              <circle cx={selected.x} cy={selected.mineY} r="4" fill="#08090b" stroke={mineLineColor} strokeWidth="1.8" />
              {!stockOnly && <circle cx={selected.x} cy={selected.benchmarkY} r="4" fill="#08090b" stroke={BENCHMARK_LINE_COLOR} strokeWidth="1.8" />}
            </>
          )}
          <text x={CHART_PAD.left} y={CHART_HEIGHT - 6} fontSize="10" fill="#74747e">{axisDate(firstDate)}</text>
          <text x={(CHART_PAD.left + chartWidth - CHART_PAD.right) / 2} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="10" fill="#74747e">{axisDate(middleDate)}</text>
          <text x={chartWidth - CHART_PAD.right} y={CHART_HEIGHT - 6} textAnchor="end" fontSize="10" fill="#74747e">{axisDate(lastDate)}</text>
        </svg>
        {plottedMarkers.map(({ marker, point, label }) => (
          <button
            key={`${marker.date}-${marker.side}`}
            type="button"
            className="stock-comparison-trade-marker"
            data-stock-comparison-trade-marker={marker.side}
            data-stock-comparison-marker-date={marker.date}
            aria-label={`${marker.date} · ${englishMode ? marker.side === 'mixed' ? 'Buy and sell' : marker.side === 'buy' ? 'Buy' : 'Sell' : marker.side === 'mixed' ? '买入及卖出' : marker.side === 'buy' ? '买入' : '卖出'} · ${marker.records.length}${englishMode ? ' records' : ' 笔'}`}
            style={{ left: `${Math.max(22, Math.min(chartWidth - 22, point.x)) / chartWidth * 100}%`, top: `${point.mineY / CHART_HEIGHT * 100}%` }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              window.clearTimeout(hideTimerRef.current);
              setSelectedIndex(null);
              onSelectTradeMarker?.(marker);
            }}
          ><span className="stock-comparison-marker-accessible-label">{label}</span></button>
        ))}
        {selected && (
          <div className="stock-comparison-tooltip">
            <div
              key={`stock-return-comparison-tooltip-date-${selected.date}`}
              className="stock-comparison-tooltip-date"
              data-stock-return-comparison-tooltip-date={selected.date}
            >
              {String(selected.date).replaceAll('-', '/')}
            </div>
            <div className="stock-comparison-tooltip-readings">
              <span>{stockOnly ? (englishMode ? 'Cycle return' : '本轮收益') : t(language, 'stockDetail.comparison.mine', '当前持仓收益')}</span>
              <span className="stock-comparison-tooltip-result" style={{ fontFamily: NUMBER_FONT }}>
                <span style={{ color: valueColor(percentMode ? selected.stockPnlPct : selected.stockPnlUsd, marketColorMode) }}>{percentMode ? signedPct(selected.stockPnlPct) : signedCurrency(selected.stockPnlUsd, displayCurrency)}</span>
                <small style={{ color: valueColor(percentMode ? selected.stockPnlUsd : selected.stockPnlPct, marketColorMode) }}>{percentMode ? signedCurrency(selected.stockPnlUsd, displayCurrency) : signedPct(selected.stockPnlPct)}</small>
              </span>
              {!stockOnly && <><span>QQQ</span>
              <span className="stock-comparison-tooltip-result" style={{ fontFamily: NUMBER_FONT }}>
                <span style={{ color: valueColor(percentMode ? selected.benchmarkPnlPct : selected.benchmarkPnlUsd, marketColorMode) }}>{percentMode ? signedPct(selected.benchmarkPnlPct) : signedCurrency(selected.benchmarkPnlUsd, displayCurrency)}</span>
                <small style={{ color: valueColor(percentMode ? selected.benchmarkPnlUsd : selected.benchmarkPnlPct, marketColorMode) }}>{percentMode ? signedCurrency(selected.benchmarkPnlUsd, displayCurrency) : signedPct(selected.benchmarkPnlPct)}</small>
              </span>
              <span>{t(language, 'stockDetail.comparison.excessAmount', '超额金额')}</span>
              <span style={{ color: valueColor(selected.excessPnlUsd, marketColorMode), fontFamily: NUMBER_FONT }}>{signedCurrency(selected.excessPnlUsd, displayCurrency)}</span>
              <span>{t(language, 'stockDetail.comparison.rateGap', '收益率差')}</span>
              <span style={{ color: valueColor(selected.excessPnlPct, marketColorMode), fontFamily: NUMBER_FONT }}>{signedPct(selected.excessPnlPct)}</span></>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SharePreview({ comparison, symbol, displayCurrency, displayRate, language, marketColorMode, onClose, visualPreview = false }) {
  const stockAmount = Number(comparison.stockPnlUsd) * displayRate;
  const benchmarkAmount = Number(comparison.benchmarkPnlUsd) * displayRate;
  const excessAmount = Number(comparison.excessPnlUsd) * displayRate;
  const excess = Number(comparison.excessPnlUsd);
  const action = Math.abs(excess) < 1e-12
    ? t(language, 'stockDetail.comparison.equal', '收益金额与 QQQ 持平')
    : excess > 0
      ? t(language, 'stockDetail.comparison.outperform', '收益金额跑赢 QQQ')
      : t(language, 'stockDetail.comparison.underperform', '收益金额跑输 QQQ');
  return (
    <StockReportModal
      title={t(language, 'stockDetail.comparison.activeValue', '主动投资价值')}
      closeLabel={t(language, 'stockDetail.comparison.closePreview', '关闭分享预览')}
      onClose={onClose}
      panelClassName="stock-comparison-dialog"
    >
      <div data-stock-comparison-share-dialog="true">
        <div className="stock-comparison-share-label">{t(language, 'stockDetail.comparison.yourResult', '你的结果')}</div>
        <div className="stock-comparison-share-row">
          <span className="stock-comparison-share-symbol">{symbol}</span>
          <div className="stock-comparison-share-readings">
            <span className={valueClass(comparison.stockPnlUsd, marketColorMode)} style={{ fontFamily: NUMBER_FONT }}>{signedCurrency(stockAmount, displayCurrency)}</span>
            <small className={valueClass(comparison.stockPnlPct, marketColorMode)} style={{ fontFamily: NUMBER_FONT }}>{signedPct(comparison.stockPnlPct)}</small>
          </div>
        </div>
        <div className="stock-comparison-share-row">
          <span className="stock-comparison-share-symbol">QQQ</span>
          <div className="stock-comparison-share-readings">
            <span className={valueClass(comparison.benchmarkPnlUsd, marketColorMode)} style={{ fontFamily: NUMBER_FONT }}>{signedCurrency(benchmarkAmount, displayCurrency)}</span>
            <small className={valueClass(comparison.benchmarkPnlPct, marketColorMode)} style={{ fontFamily: NUMBER_FONT }}>{signedPct(comparison.benchmarkPnlPct)}</small>
          </div>
        </div>
        <div className="stock-comparison-share-excess">
          <div className="stock-comparison-share-label">{action}</div>
          <div className={`stock-comparison-share-excess-amount ${valueClass(comparison.excessPnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{signedCurrency(excessAmount, displayCurrency)}</div>
          <div className={`stock-comparison-metric-pct ${valueClass(comparison.excessPnlPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
            <span>{t(language, 'stockDetail.comparison.rateGap', '收益率差')}</span>
            {signedPct(comparison.excessPnlPct)}
          </div>
        </div>
        <div className="stock-comparison-basis">
          {String(comparison.baselineDate).replaceAll('-', '/')} - {String(comparison.snapshotDate).replaceAll('-', '/')} · {visualPreview
            ? t(language, 'stockDetail.comparison.previewBasisShort', '固定起点 · 仅当前存续仓位 · 本地只读视觉样例')
            : t(language, 'stockDetail.comparison.closeBasisShort', '固定起点 · 仅当前存续仓位')}
        </div>
      </div>
    </StockReportModal>
  );
}

export default function StockReturnComparisonCard({
  comparison,
  loading = false,
  error = '',
  symbol,
  language = 'zh',
  marketColorMode,
  displayCurrency = 'USD',
  displayRate = 1,
  initialMethodOpen = false,
  initialShareOpen = false,
  initialTooltipOpen = false,
  visualPreview = false,
  summaryOnly = false,
  title,
}) {
  const englishMode = isEnglishLanguage(language);
  const [showMethod, setShowMethod] = React.useState(initialMethodOpen);
  const [showShare, setShowShare] = React.useState(false);
  const initialShareOpenedRef = React.useRef(false);
  const available = Boolean(comparison?.available);
  const positionStartDate = String(comparison?.positionStartDate || '').replaceAll('-', '/');
  const comparisonStartDate = String(comparison?.baselineDate || '').replaceAll('-', '/');
  const startExplanation = positionStartDate && positionStartDate === comparisonStartDate
    ? t(language, 'stockDetail.comparison.sameStart', '本轮首笔买入/对比起点 {{date}}', { date: positionStartDate })
    : t(language, 'stockDetail.comparison.separateStart', '本轮首笔买入 {{positionDate}} · 对比起点 {{comparisonDate}}', {
      positionDate: positionStartDate || '--',
      comparisonDate: comparisonStartDate || '--',
    });

  React.useEffect(() => {
    setShowShare(false);
    initialShareOpenedRef.current = false;
  }, [comparison?.baselineDate, comparison?.snapshotDate, symbol]);

  React.useEffect(() => {
    if (!initialShareOpen || !available || initialShareOpenedRef.current) return;
    initialShareOpenedRef.current = true;
    setShowShare(true);
  }, [available, initialShareOpen]);

  const unavailableText = loading
    ? t(language, 'stockDetail.comparison.loading', '正在读取个股与 QQQ 普通收盘价')
    : error
      ? t(language, 'stockDetail.comparison.unavailable', '收益对比暂不可用')
      : t(language, 'stockDetail.comparison.insufficient', '双方没有足够的同周期正式收盘数据');

  return (
    <section id="stock-return-comparison" className="stock-comparison-report" data-summary-only={summaryOnly || undefined}>
      <div className="stock-comparison-heading">
        <div className="stock-comparison-heading-title">
          <h2>{title || t(language, 'stockDetail.comparison.title', '收益对比')}</h2>
          <button type="button" onClick={() => setShowMethod((value) => !value)} className="stock-comparison-info-button" aria-expanded={showMethod} aria-label={t(language, 'stockDetail.comparison.method', '查看收益对比口径')}><Info className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={() => setShowShare(true)} disabled={!available} className="stock-comparison-share-button" aria-label={t(language, 'stockDetail.comparison.openShare', '打开收益对比分享预览')}><Copy className="h-4 w-4" /></button>
      </div>

      {showMethod && (
        <StockReportModal
          title={t(language, 'stockDetail.comparison.method', '查看收益对比口径')}
          closeLabel={t(language, 'trades.close', '关闭')}
          onClose={() => setShowMethod(false)}
          panelClassName="stock-comparison-dialog"
        >
          <p data-stock-comparison-method-dialog="true" className="stock-comparison-method-copy">
            {t(language, 'stockDetail.comparison.methodText', '个股与 QQQ 均使用普通完成收盘价。这里仅比较当前仍持有的仓位；已卖出部分、对应 QQQ 仓位及其已实现盈亏会从整段对比中剔除。正式交易变化后，系统会从固定起点按当前存续仓位完整重算。')}
          </p>
        </StockReportModal>
      )}

      {!available ? (
        <div className="stock-comparison-empty">
          {unavailableText}
        </div>
      ) : (
        <>
          {summaryOnly ? <div className="stock-comparison-metrics stock-comparison-summary-metrics">
            <SummaryMetric metric="stock-rate" label={englishMode ? 'Stock return' : '股票收益率'} value={comparison.stockPnlPct} displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
            <SummaryMetric metric="benchmark-rate" label={englishMode ? 'QQQ return' : 'QQQ 收益率'} value={comparison.benchmarkPnlPct} displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
            <SummaryMetric metric="excess-rate" label={englishMode ? 'Excess return' : '超额收益率'} value={comparison.excessPnlPct} displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
            <SummaryMetric metric="excess-amount" label={t(language, 'stockDetail.comparison.excessAmount', '超额金额')} value={comparison.excessPnlUsd} isAmount displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
          </div> : <div className="stock-comparison-metrics">
            <Metric metric="mine" label={t(language, 'stockDetail.comparison.mine', '当前持仓收益')} amount={comparison.stockPnlUsd} pct={comparison.stockPnlPct} displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
            <Metric metric="benchmark" label={t(language, 'stockDetail.comparison.samePeriodQqqShort', '对应 QQQ')} amount={comparison.benchmarkPnlUsd} pct={comparison.benchmarkPnlPct} displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
            <Metric metric="excess" label={t(language, 'stockDetail.comparison.excessAmount', '超额金额')} amount={comparison.excessPnlUsd} pct={comparison.excessPnlPct} pctLabel={t(language, 'stockDetail.comparison.rateGapShort', '率差')} displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
          </div>}
          {!summaryOnly && <ComparisonChart comparison={comparison} displayRate={displayRate} displayCurrency={displayCurrency} language={language} marketColorMode={marketColorMode} initialTooltipOpen={initialTooltipOpen} />}
          <div className="stock-comparison-basis">
            <div>{startExplanation}</div>
            <div>{visualPreview
              ? t(language, 'stockDetail.comparison.previewBasis', '固定起点 · 仅当前存续仓位 · 本地只读样例')
              : t(language, 'stockDetail.comparison.closeBasis', '固定起点 · 仅当前存续仓位 · 个股/QQQ 普通收盘价')}</div>
          </div>
        </>
      )}

      {showShare && available ? <SharePreview comparison={comparison} symbol={symbol} displayCurrency={displayCurrency} displayRate={displayRate} language={language} marketColorMode={marketColorMode} onClose={() => setShowShare(false)} visualPreview={visualPreview} /> : null}
    </section>
  );
}
