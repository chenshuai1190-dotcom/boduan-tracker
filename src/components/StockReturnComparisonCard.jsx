import React from 'react';
import { Copy, Info, X } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { t } from '../lib/i18n.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const MINE_LINE_COLOR = '#f6b54b';
const BENCHMARK_LINE_COLOR = '#9aa4b2';
const CHART_TOOLTIP_HOLD_MS = 12000;

function finite(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return false;
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

function compactSignedCurrency(value, currency = 'USD') {
  if (!finite(value)) return '--';
  const amount = Number(value);
  const abs = Math.abs(amount);
  const sign = amount >= 0 ? '+' : '-';
  const symbol = currency === 'CNY' ? '¥' : '$';
  if (currency === 'CNY' && abs >= 10000) {
    return `${sign}${symbol}${(abs / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`;
  }
  if (abs >= 1000000) return `${sign}${symbol}${(abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
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

function chartGeometry(points, width = 320, height = 176) {
  const pad = { left: 42, right: 12, top: 16, bottom: 30 };
  const rows = (Array.isArray(points) ? points : [])
    .filter((point) => point?.date && finite(point?.stockPnlUsd) && finite(point?.benchmarkPnlUsd));
  if (rows.length < 2) return { rows, minePath: '', benchmarkPath: '', ticks: [] };

  const values = rows.flatMap((point) => [Number(point.stockPnlUsd), Number(point.benchmarkPnlUsd), 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, 1);
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
    mineY: y(point.stockPnlUsd),
    benchmarkY: y(point.benchmarkPnlUsd),
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
    benchmarkPath: pathFor('benchmarkY'),
    ticks,
  };
}

function Metric({ label, amount, pct, pctLabel = '', displayRate, displayCurrency, marketColorMode }) {
  const displayedAmount = finite(amount) ? Number(amount) * displayRate : null;
  const tone = valueClass(amount, marketColorMode);
  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0">
      <div className="truncate text-[11px] text-white/[0.42]">{label}</div>
      <div className={`mt-2 truncate text-[18px] font-semibold leading-none tabular-nums ${tone}`} style={{ fontFamily: NUMBER_FONT }}>
        {compactSignedCurrency(displayedAmount, displayCurrency)}
      </div>
      <div className={`mt-2 text-[12px] font-medium leading-4 tabular-nums ${valueClass(pct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
        {pctLabel ? <span className="mr-1 text-white/[0.32]">{pctLabel}</span> : null}
        {signedPct(pct, 2)}
      </div>
    </div>
  );
}

function ComparisonChart({ comparison, displayRate, displayCurrency, language, marketColorMode, initialTooltipOpen = false }) {
  const points = React.useMemo(() => (
    (comparison?.trend || []).map((point) => ({
      ...point,
      stockPnlUsd: finite(point.stockPnlUsd) ? Number(point.stockPnlUsd) * displayRate : null,
      benchmarkPnlUsd: finite(point.benchmarkPnlUsd) ? Number(point.benchmarkPnlUsd) * displayRate : null,
      excessPnlUsd: finite(point.excessPnlUsd) ? Number(point.excessPnlUsd) * displayRate : null,
    }))
  ), [comparison?.trend, displayRate]);
  const chart = React.useMemo(() => chartGeometry(points), [points]);
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
  const comparisonStartLabel = isPositionStart
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
    setSelectedIndex(initialTooltipOpen && chart.rows.length > 0 ? Math.floor(chart.rows.length / 2) : null);
    window.clearTimeout(hideTimerRef.current);
  }, [chart.rows.length, comparison?.baselineDate, comparison?.snapshotDate, initialTooltipOpen]);

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
    const cursorX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 320;
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
  }, [chart.rows, keepSelectedPointVisible]);

  const handlePointerDown = React.useCallback((event) => {
    if (event.isPrimary === false) return;
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

  if (!chart.minePath || !chart.benchmarkPath) {
    return (
      <div className="mt-4 flex h-[154px] items-center justify-center rounded-xl bg-white/[0.025] px-4 text-center text-[12px] leading-5 text-white/[0.34]">
        {t(language, 'stockDetail.comparison.noCommonTrend', '双方没有足够的同日收盘快照，暂不绘制对比曲线')}
      </div>
    );
  }

  return (
    <div ref={chartRootRef} className="relative mt-4">
      <div className="mb-2 flex items-center gap-5 text-[11px] text-white/[0.42]">
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 rounded-full" style={{ background: MINE_LINE_COLOR }} />{t(language, 'stockDetail.comparison.mineLine', '我的收益线')}</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 rounded-full" style={{ background: BENCHMARK_LINE_COLOR }} />{t(language, 'stockDetail.comparison.qqqLine', '基准：QQQ')}</span>
      </div>
      <div
        className="relative h-[190px] select-none"
        data-stock-return-comparison-chart="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerTracking}
        onPointerCancel={finishPointerTracking}
        onLostPointerCapture={finishPointerTracking}
        style={{ touchAction: 'pan-y' }}
      >
        <svg viewBox="0 0 320 176" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="stockReturnComparisonArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={MINE_LINE_COLOR} stopOpacity="0.16" />
              <stop offset="100%" stopColor={MINE_LINE_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>
          {chart.ticks.map((tick) => (
            <React.Fragment key={`${tick.value}-${tick.y}`}>
              <line x1="42" y1={tick.y} x2="308" y2={tick.y} stroke="rgba(255,255,255,0.07)" strokeDasharray="4 6" />
              <text x="0" y={Math.min(148, Math.max(14, tick.y + 3))} fontSize="9" fill="rgba(255,255,255,0.32)">{axisMoney(tick.value, displayCurrency)}</text>
            </React.Fragment>
          ))}
          <line x1="42" y1="14" x2="42" y2="146" stroke={MINE_LINE_COLOR} strokeWidth="0.8" strokeDasharray="2 4" opacity="0.38" />
          <text x="48" y="11" fontSize="7.5" fill="rgba(246,181,75,0.62)">{comparisonStartLabel}</text>
          {chart.minePath && (
            <path
              d={`${chart.minePath} L${chart.rows.at(-1).x.toFixed(2)} 146 L${chart.rows[0].x.toFixed(2)} 146 Z`}
              fill="url(#stockReturnComparisonArea)"
            />
          )}
          <path d={chart.benchmarkPath} fill="none" stroke={BENCHMARK_LINE_COLOR} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" opacity="0.86" />
          <path d={chart.minePath} fill="none" stroke={MINE_LINE_COLOR} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          {selected && (
            <>
              <line x1={selected.x} y1="12" x2={selected.x} y2="146" stroke="rgba(255,255,255,0.25)" strokeDasharray="3 5" />
              <circle cx={selected.x} cy={selected.mineY} r="4" fill="#05070b" stroke={MINE_LINE_COLOR} strokeWidth="1.8" />
              <circle cx={selected.x} cy={selected.benchmarkY} r="4" fill="#05070b" stroke={BENCHMARK_LINE_COLOR} strokeWidth="1.8" />
            </>
          )}
          <text x="42" y="171" fontSize="9" fill="rgba(255,255,255,0.34)">{axisDate(firstDate)}</text>
          <text x="175" y="171" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.34)">{axisDate(middleDate)}</text>
          <text x="308" y="171" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.34)">{axisDate(lastDate)}</text>
        </svg>
        {selected && (
          <div className="pointer-events-none absolute left-1/2 top-1 z-10 w-[252px] -translate-x-1/2 rounded-xl border border-white/10 bg-[#121821]/95 px-3 py-2.5 shadow-xl backdrop-blur">
            <div
              key={`stock-return-comparison-tooltip-date-${selected.date}`}
              className="text-[11px] tabular-nums text-white/[0.68]"
              data-stock-return-comparison-tooltip-date={selected.date}
            >
              {String(selected.date).replaceAll('-', '/')}
            </div>
            <div className="mt-1.5 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[11px]">
              <span className="text-white/[0.40]">{t(language, 'stockDetail.comparison.mine', '我的收益')}</span>
              <span className="whitespace-nowrap text-right font-medium tabular-nums" style={{ color: valueColor(selected.stockPnlUsd, marketColorMode), fontFamily: NUMBER_FONT }}>{signedCurrency(selected.stockPnlUsd, displayCurrency)}</span>
              <span className="text-white/[0.40]">QQQ</span>
              <span className="whitespace-nowrap text-right font-medium tabular-nums" style={{ color: valueColor(selected.benchmarkPnlUsd, marketColorMode), fontFamily: NUMBER_FONT }}>{signedCurrency(selected.benchmarkPnlUsd, displayCurrency)}</span>
              <span className="text-white/[0.40]">{t(language, 'stockDetail.comparison.excessAmount', '超额金额')}</span>
              <span className="whitespace-nowrap text-right font-medium tabular-nums" style={{ color: valueColor(selected.excessPnlUsd, marketColorMode), fontFamily: NUMBER_FONT }}>{signedCurrency(selected.excessPnlUsd, displayCurrency)}</span>
              <span className="text-white/[0.40]">{t(language, 'stockDetail.comparison.rateGap', '收益率差')}</span>
              <span className="whitespace-nowrap text-right font-medium tabular-nums" style={{ color: valueColor(selected.excessPnlPct, marketColorMode), fontFamily: NUMBER_FONT }}>{signedPct(selected.excessPnlPct)}</span>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-3 pb-[calc(env(safe-area-inset-bottom)+92px)] pt-[calc(env(safe-area-inset-top)+18px)] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t(language, 'stockDetail.comparison.sharePreview', '收益对比分享预览')}>
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label={t(language, 'stockDetail.comparison.closePreview', '关闭分享预览')} />
      <div className="relative max-h-[calc(100dvh-env(safe-area-inset-top)-116px)] w-full max-w-[410px] overflow-y-auto rounded-[24px] border border-white/10 bg-[#0d1118] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-[18px] font-semibold text-white/[0.88]">{t(language, 'stockDetail.comparison.activeValue', '主动投资价值')}</h3>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/[0.52]" aria-label={t(language, 'stockDetail.comparison.closePreview', '关闭分享预览')}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
          <div className="text-[11px] text-white/[0.38]">{t(language, 'stockDetail.comparison.yourResult', '你的结果')}</div>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[17px] font-semibold text-white/[0.82]">{symbol}</span>
            <span className="flex shrink-0 items-baseline justify-end gap-2 whitespace-nowrap">
              <span className={`text-[21px] font-semibold tabular-nums ${valueClass(comparison.stockPnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{compactSignedCurrency(stockAmount, displayCurrency)}</span>
              <span className={`text-[12px] font-medium tabular-nums ${valueClass(comparison.stockPnlPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{signedPct(comparison.stockPnlPct)}</span>
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-white/[0.06] pt-4">
            <span className="text-[15px] text-white/[0.68]">QQQ</span>
            <span className="flex shrink-0 items-baseline justify-end gap-2 whitespace-nowrap">
              <span className={`text-[19px] font-semibold tabular-nums ${valueClass(comparison.benchmarkPnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{compactSignedCurrency(benchmarkAmount, displayCurrency)}</span>
              <span className={`text-[12px] font-medium tabular-nums ${valueClass(comparison.benchmarkPnlPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{signedPct(comparison.benchmarkPnlPct)}</span>
            </span>
          </div>
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <div className="text-[11px] text-white/[0.38]">{action}</div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className={`whitespace-nowrap text-[24px] font-semibold tabular-nums ${valueClass(comparison.excessPnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{compactSignedCurrency(excessAmount, displayCurrency)}</div>
              <div className={`shrink-0 whitespace-nowrap text-[12px] font-medium tabular-nums ${valueClass(comparison.excessPnlPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                <span className="mr-1 text-white/[0.34]">{t(language, 'stockDetail.comparison.rateGap', '收益率差')}</span>
                {signedPct(comparison.excessPnlPct)}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 text-[11px] leading-4 text-white/[0.30]">
          {String(comparison.baselineDate).replaceAll('-', '/')} - {String(comparison.snapshotDate).replaceAll('-', '/')} · {visualPreview
            ? t(language, 'stockDetail.comparison.previewBasisShort', '固定起点 · 完整账本重算 · 本地只读视觉样例')
            : t(language, 'stockDetail.comparison.closeBasisShort', '固定起点 · 完整账本重算')}
        </div>
      </div>
    </div>
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
}) {
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
    <section id="stock-return-comparison" className="mt-3 scroll-mt-[132px] rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[13px] font-semibold text-white/[0.72]">{t(language, 'stockDetail.comparison.title', '收益对比')}</h2>
          <button type="button" onClick={() => setShowMethod((value) => !value)} className="-m-2 flex h-8 w-8 items-center justify-center text-white/[0.28] transition active:scale-90" aria-expanded={showMethod} aria-label={t(language, 'stockDetail.comparison.method', '查看收益对比口径')}><Info className="h-3.5 w-3.5" /></button>
        </div>
        <button type="button" onClick={() => setShowShare(true)} disabled={!available} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-white/[0.42] transition enabled:active:scale-90 disabled:opacity-25" aria-label={t(language, 'stockDetail.comparison.openShare', '打开收益对比分享预览')}><Copy className="h-4 w-4" /></button>
      </div>

      {showMethod && (
        <div className="mt-3 rounded-xl border border-[#f6b54b]/15 bg-[#f6b54b]/[0.055] px-3 py-2.5 text-[11px] leading-[18px] text-white/[0.46]">
          {t(language, 'stockDetail.comparison.methodText', '日线估值中，个股与 QQQ 均使用普通收盘价。收益率差 = 我的收益率 − QQQ 收益率。系统固定本轮对比起点，并在正式交易新增、修改或删除后，从起点按交易日期完整重算；后续买入按实际成交额等额加入 QQQ，卖出按卖出前持仓比例同步减仓。双方收益率统一除以从起点起累计投入本金，卖出不缩小分母。')}
        </div>
      )}

      {!available ? (
        <div className="mt-4 flex h-[218px] items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-6 text-center text-[12px] leading-5 text-white/[0.34]">
          {unavailableText}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.07]">
            <Metric label={t(language, 'stockDetail.comparison.mine', '我的收益')} amount={comparison.stockPnlUsd} pct={comparison.stockPnlPct} displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
            <Metric label={t(language, 'stockDetail.comparison.samePeriodQqqShort', '同期 QQQ')} amount={comparison.benchmarkPnlUsd} pct={comparison.benchmarkPnlPct} displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
            <Metric label={t(language, 'stockDetail.comparison.excessAmount', '超额金额')} amount={comparison.excessPnlUsd} pct={comparison.excessPnlPct} pctLabel={t(language, 'stockDetail.comparison.rateGapShort', '率差')} displayRate={displayRate} displayCurrency={displayCurrency} marketColorMode={marketColorMode} />
          </div>
          <ComparisonChart comparison={comparison} displayRate={displayRate} displayCurrency={displayCurrency} language={language} marketColorMode={marketColorMode} initialTooltipOpen={initialTooltipOpen} />
          <div className="mt-2 text-[10px] leading-4 text-white/[0.38]">
            <div>{startExplanation}</div>
            <div>{visualPreview
              ? t(language, 'stockDetail.comparison.previewBasis', '固定起点 · 完整账本重算 · 同步加减仓 · 本地只读样例')
              : t(language, 'stockDetail.comparison.closeBasis', '固定起点 · 完整账本重算 · 同步加减仓 · 个股/QQQ 普通收盘价')}</div>
          </div>
        </>
      )}

      {showShare && available ? <SharePreview comparison={comparison} symbol={symbol} displayCurrency={displayCurrency} displayRate={displayRate} language={language} marketColorMode={marketColorMode} onClose={() => setShowShare(false)} visualPreview={visualPreview} /> : null}
    </section>
  );
}
