import React from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';
import { fetchEarningsCalendarEvents, getNewYorkEarningsClock } from '../lib/earningsCalendarRefresh.js';
import { dateKey, isEarningsPublished, normalizeEarningsSession } from '../lib/earningsCalendarModel.js';
import { t } from '../lib/i18n.js';
import { marketHexColor } from '../lib/marketColorMode.js';
import {
  deriveCloseBasedPosition,
  displayCurrencyRate,
  filterStockDetailHistory,
  filterStockDetailWeeklyHistory,
  findStockDetailWeeklyMaOnOrBefore,
  findWatchlistStockDetailRows,
  normalizeStockDetailHistory,
  normalizeStockDetailWeeklyHistory,
  resolveStockDetailClose,
  targetProgressPercent,
  targetProgressPositionPercent,
  targetSpacePercent,
  usdToDisplayCurrency,
} from '../lib/watchlistStockDetail.js';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif';
const PRICE_LINE_COLOR = '#22c55e';
const MA200_DAY_COLOR = '#60a5fa';
const MA200_WEEK_COLOR = '#f6b54b';
const CHART_WIDTH = 352;
const CHART_HEIGHT = 184;
const RANGE_IDS = ['1m', '3m', '6m', '1y', '5y'];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function formatNumber(value, digits = 2) {
  const number = finiteNumber(value);
  if (number === null) return '--';
  return number.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatShares(value) {
  const number = finiteNumber(value);
  if (number === null) return '--';
  return number.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function formatSignedPercent(value, digits = 2) {
  const number = finiteNumber(value);
  if (number === null) return '--';
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

function formatCurrency(value, currency, digits = 2, { signed = false } = {}) {
  const number = finiteNumber(value);
  if (number === null) return '--';
  const symbol = currency === 'CNY' ? '¥' : '$';
  const sign = signed ? (number >= 0 ? '+' : '-') : (number < 0 ? '-' : '');
  return `${sign}${symbol}${formatNumber(Math.abs(number), digits)}`;
}

function formatDate(value, language, { year = false } = {}) {
  const key = dateKey(value);
  if (!key) return '--';
  const date = new Date(`${key}T00:00:00Z`);
  if (language === 'en') {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    }).format(date);
  }
  return year ? key.replaceAll('-', '/') : `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}

function addUtcDays(value, days) {
  const key = dateKey(value);
  if (!key) return '';
  const result = new Date(`${key}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const start = Date.parse(`${dateKey(from)}T00:00:00Z`);
  const end = Date.parse(`${dateKey(to)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function quarterLabel(event, language) {
  const key = dateKey(event?.fiscalDate || event?.date || event?.reportDate);
  if (!key) return '--';
  const quarter = Math.floor((Number(key.slice(5, 7)) - 1) / 3) + 1;
  return t(language, 'watchlistDetail.quarter', '{{year}} Q{{quarter}}', {
    year: key.slice(0, 4),
    quarter,
  });
}

function chartGeometry(rows, movingAverageRows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const left = 30;
  const right = 10;
  const top = 10;
  const bottom = 25;
  const plotWidth = CHART_WIDTH - left - right;
  const plotHeight = CHART_HEIGHT - top - bottom;
  const domainStart = Date.parse(`${rows[0].date}T00:00:00Z`);
  const domainEnd = Date.parse(`${rows.at(-1).date}T00:00:00Z`);
  const domainSpan = Math.max(86_400_000, domainEnd - domainStart);
  const maRows = (Array.isArray(movingAverageRows) ? movingAverageRows : [])
    .filter((row) => Number.isFinite(row?.ma200))
    .filter((row) => row.date >= rows[0].date && row.date <= rows.at(-1).date);
  const values = [
    ...rows.map((row) => row.close),
    ...maRows.map((row) => row.ma200),
  ];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(0.01, high - low);
  const min = Math.max(0, low - span * 0.08);
  const max = high + span * 0.08;
  const xForDate = (date) => {
    const time = Date.parse(`${date}T00:00:00Z`);
    return left + ((time - domainStart) / domainSpan) * plotWidth;
  };
  const yForValue = (value) => top + ((max - value) / Math.max(0.01, max - min)) * plotHeight;
  const pricePoints = rows.map((row) => ({ ...row, x: xForDate(row.date), y: yForValue(row.close) }));
  const maPoints = maRows.map((row) => ({ ...row, x: xForDate(row.date), y: yForValue(row.ma200) }));
  const pathFor = (points) => points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const pricePath = pathFor(pricePoints, 'close');
  const maPath = pathFor(maPoints, 'ma200');
  const floorY = top + plotHeight;
  const areaPath = `${pricePath} L ${pricePoints.at(-1).x.toFixed(2)} ${floorY.toFixed(2)} L ${pricePoints[0].x.toFixed(2)} ${floorY.toFixed(2)} Z`;
  const priceLines = [0, 0.33, 0.66, 1].map((ratio) => ({
    y: top + ratio * plotHeight,
    value: max - ratio * (max - min),
  }));
  return { left, right, top, bottom, plotWidth, plotHeight, pricePoints, maPoints, pricePath, maPath, areaPath, priceLines };
}

function chartDateLabels(points, language, range) {
  if (!points.length) return [];
  const ratios = range === '5y' ? [0, 0.2, 0.4, 0.6, 0.8, 1] : [0, 0.25, 0.5, 0.75, 1];
  const labels = [...new Set(ratios.map((ratio) => Math.round((points.length - 1) * ratio)))]
    .map((index) => ({
      index,
      point: points[index],
      label: range === '5y' ? points[index]?.date?.slice(0, 4) : formatDate(points[index]?.date, language),
    }));
  return labels.filter((item, index) => labels.findIndex((candidate) => candidate.label === item.label) === index);
}

function PriceChart({ rows, weeklyRows, weeklyLookupRows, range, currency, language, marketColorMode, symbol, initialTooltipOpen = false }) {
  const weeklyMa = range === '5y';
  const maLabel = weeklyMa
    ? t(language, 'watchlistDetail.ma200Weekly', 'MA200（周）')
    : t(language, 'watchlistDetail.ma200Daily', 'MA200（日）');
  const maColor = weeklyMa ? MA200_WEEK_COLOR : MA200_DAY_COLOR;
  const movingAverageRows = React.useMemo(() => (
    weeklyMa
      ? weeklyRows.filter((row) => row?.completed === true && Number.isFinite(row?.ma200))
      : rows.filter((row) => Number.isFinite(row?.ma200))
  ), [rows, weeklyMa, weeklyRows]);
  const chart = React.useMemo(
    () => chartGeometry(rows, movingAverageRows),
    [movingAverageRows, rows],
  );
  const chartRef = React.useRef(null);
  const activePointerIdRef = React.useRef(null);
  const previousSeriesRef = React.useRef({ range, rows, weeklyRows });
  const [selectedIndex, setSelectedIndex] = React.useState(() => (
    initialTooltipOpen && rows.length > 1 ? Math.round((rows.length - 1) * 0.72) : null
  ));

  React.useEffect(() => {
    const previous = previousSeriesRef.current;
    previousSeriesRef.current = { range, rows, weeklyRows };
    if (previous.range === range && previous.rows === rows && previous.weeklyRows === weeklyRows) return;
    setSelectedIndex(null);
  }, [range, rows, weeklyRows]);
  React.useEffect(() => {
    if (selectedIndex == null) return undefined;
    const timerId = window.setTimeout(() => setSelectedIndex(null), 12_000);
    return () => window.clearTimeout(timerId);
  }, [selectedIndex]);
  React.useEffect(() => {
    const closeOutside = (event) => {
      if (!chartRef.current?.contains(event.target)) setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  if (!chart || chart.pricePoints.length < 2) {
    return (
      <div className="flex h-[184px] items-center justify-center rounded-xl bg-black/[0.08] text-[11px] text-white/[0.3]">
        {t(language, 'watchlistDetail.noCloseHistory', '暂无足够的收盘数据')}
      </div>
    );
  }

  const last = chart.pricePoints.at(-1);
  const selectedPoint = Number.isInteger(selectedIndex) ? chart.pricePoints[selectedIndex] || null : null;
  const previousPoint = selectedIndex > 0 ? chart.pricePoints[selectedIndex - 1] : null;
  const selectedChange = selectedPoint && previousPoint ? selectedPoint.close - previousPoint.close : null;
  const selectedChangePct = selectedChange !== null && previousPoint?.close > 0
    ? (selectedChange / previousPoint.close) * 100
    : null;
  const selectedMaRow = selectedPoint
    ? (weeklyMa
      ? findStockDetailWeeklyMaOnOrBefore(weeklyLookupRows, selectedPoint.date)
      : (Number.isFinite(selectedPoint.ma200) ? selectedPoint : null))
    : null;
  const selectedMaDistance = selectedPoint && selectedMaRow?.ma200 > 0
    ? ((selectedPoint.close / selectedMaRow.ma200) - 1) * 100
    : null;
  const selectedMaPoint = selectedMaRow
    ? chart.maPoints.find((point) => point.date === selectedMaRow.date) || null
    : null;
  const labels = chartDateLabels(chart.pricePoints, language, range);

  const selectNearestPoint = (clientX) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const viewBoxX = ((clientX - rect.left) / rect.width) * CHART_WIDTH;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    chart.pricePoints.forEach((point, index) => {
      const distance = Math.abs(point.x - viewBoxX);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });
    setSelectedIndex(nearestIndex);
  };

  return (
    <div
      ref={chartRef}
      role="button"
      tabIndex={0}
      data-watchlist-stock-price-chart="true"
      aria-label={t(language, 'watchlistDetail.chartAria', '查看 {{symbol}} 股价走势', { symbol })}
      className="relative min-w-0 cursor-crosshair rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-[#f6b54b]/45"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(event) => {
        activePointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        selectNearestPoint(event.clientX);
      }}
      onPointerMove={(event) => {
        if (activePointerIdRef.current === event.pointerId) selectNearestPoint(event.clientX);
      }}
      onPointerUp={(event) => {
        if (activePointerIdRef.current !== event.pointerId) return;
        selectNearestPoint(event.clientX);
        activePointerIdRef.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
      onPointerCancel={() => { activePointerIdRef.current = null; }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setSelectedIndex(chart.pricePoints.length - 1);
      }}
    >
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-[184px] w-full overflow-visible" role="img" aria-label={t(language, 'watchlistDetail.chartImageAria', '{{range}} 收盘价与{{maLabel}}走势', { range: range.toUpperCase(), maLabel })}>
        <defs>
          <style>
            {`
              @keyframes watchlist-stock-price-breathe {
                0%, 100% {
                  opacity: 0.22;
                  transform: scale(0.72);
                }
                50% {
                  opacity: 0.06;
                  transform: scale(1.42);
                }
              }

              .watchlist-stock-price-breathe-ring {
                animation: watchlist-stock-price-breathe 3.2s ease-in-out infinite;
                transform-box: fill-box;
                transform-origin: center;
                will-change: opacity, transform;
              }

              @media (prefers-reduced-motion: reduce) {
                .watchlist-stock-price-breathe-ring {
                  animation: none !important;
                  opacity: 0.16;
                  transform: scale(1);
                }
              }
            `}
          </style>
          <linearGradient id="watchlist-stock-detail-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={PRICE_LINE_COLOR} stopOpacity="0.14" />
            <stop offset="100%" stopColor={PRICE_LINE_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>
        {chart.priceLines.map((line) => (
          <g key={line.y}>
            <line x1={chart.left} x2={CHART_WIDTH - chart.right} y1={line.y} y2={line.y} stroke="rgba(255,255,255,0.052)" strokeDasharray="2 4" />
            <text x={chart.left - 6} y={line.y + 3} textAnchor="end" fill="rgba(255,255,255,0.28)" fontSize="8.3" style={{ fontFamily: NUMBER_FONT }}>
              {formatNumber(line.value, line.value >= 1000 ? 0 : 1)}
            </text>
          </g>
        ))}
        <path d={chart.areaPath} fill="url(#watchlist-stock-detail-area)" />
        {chart.maPoints.length >= 2 ? <path data-watchlist-daily-ma-line={weeklyMa ? undefined : 'true'} data-watchlist-weekly-ma-line={weeklyMa ? 'true' : undefined} d={chart.maPath} fill="none" stroke={maColor} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
        <path d={chart.pricePath} fill="none" stroke={PRICE_LINE_COLOR} strokeWidth="0.95" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle data-watchlist-endpoint-breathe-ring="true" className="watchlist-stock-price-breathe-ring" cx={last.x} cy={last.y} r="4.4" fill={PRICE_LINE_COLOR} pointerEvents="none" />
        <circle cx={last.x} cy={last.y} r="2.2" fill={PRICE_LINE_COLOR} stroke="#d6fff0" strokeWidth="0.65" />
        {selectedPoint ? (
          <g aria-hidden="true">
            <line x1={selectedPoint.x} x2={selectedPoint.x} y1={chart.top} y2={CHART_HEIGHT - chart.bottom} stroke="rgba(255,255,255,0.24)" strokeWidth="0.8" strokeDasharray="3 3" />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="8" fill="#f6b54b" opacity="0.13" />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="3.8" fill="#05070b" stroke="#ffd18a" strokeWidth="1.25" />
            {selectedMaPoint ? <circle cx={selectedMaPoint.x} cy={selectedMaPoint.y} r="2.8" fill="#05070b" stroke={maColor} strokeWidth="1.1" /> : null}
          </g>
        ) : null}
        {labels.map(({ index, point, label }) => (
          <text key={`${point.date}-${index}`} x={point.x} y={CHART_HEIGHT - 3} textAnchor={index === 0 ? 'start' : index === chart.pricePoints.length - 1 ? 'end' : 'middle'} fill="rgba(255,255,255,0.25)" fontSize="8.2" style={{ fontFamily: NUMBER_FONT }}>{label}</text>
        ))}
      </svg>
      {selectedPoint ? (
        <div
          data-watchlist-stock-price-tooltip="true"
          className={`pointer-events-none absolute top-2 w-[188px] rounded-xl border border-white/10 bg-[#121821]/95 px-3 py-2.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.48)] backdrop-blur ${selectedPoint.x > CHART_WIDTH * 0.56 ? 'left-8' : 'right-2'}`}
        >
          <div className="text-[9px] text-white/[0.42]">{formatDate(selectedPoint.date, language, { year: true })} · {t(language, 'watchlistDetail.chartClose', '收盘')}</div>
          <div className="mt-1 text-[18px] font-normal text-white/[0.88] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatCurrency(selectedPoint.close, currency)}</div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[9px]">
            <span className="text-white/[0.3]">{range === '5y' ? t(language, 'watchlistDetail.weeklyChange', '周涨跌') : t(language, 'watchlistDetail.dailyChange', '当日涨跌')}</span>
            <span className="whitespace-nowrap tabular-nums" style={{ color: marketHexColor(selectedChange || 0, marketColorMode), fontFamily: NUMBER_FONT }}>
              {selectedChange === null ? '--' : `${selectedChange >= 0 ? '+' : ''}${formatNumber(selectedChange)}  ${formatSignedPercent(selectedChangePct)}`}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px]">
            <span className="text-white/[0.3]">{maLabel}</span>
            <span className="whitespace-nowrap tabular-nums" style={{ color: maColor, fontFamily: NUMBER_FONT }}>
              {selectedMaRow?.ma200 > 0 ? `${formatCurrency(selectedMaRow.ma200, currency)} · ${formatSignedPercent(selectedMaDistance)}` : '--'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCell({ label, value, detail, color = 'rgba(255,255,255,0.82)' }) {
  return (
    <div className="min-w-0 overflow-hidden text-center">
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[9.5px] text-white/[0.36]">{label}</div>
      <div className="mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-normal tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{value}</div>
      <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-white/[0.26]">{detail}</div>
    </div>
  );
}

function SectionHeading({ title, trailing }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
      <h2 className="truncate text-[15px] font-normal text-white/[0.82]">{title}</h2>
      {trailing ? <div className="shrink-0 text-[10px] text-white/[0.31]">{trailing}</div> : null}
    </div>
  );
}

function TargetEditor({
  language,
  symbol,
  name,
  logoUrls,
  currency,
  currentCloseUsd,
  averageCostUsd,
  targetPriceUsd,
  marketColorMode,
  saving,
  error,
  onCancel,
  onSave,
}) {
  const [draft, setDraft] = React.useState(() => {
    return targetPriceUsd === null ? '' : String(Number(targetPriceUsd.toFixed(2)));
  });
  const value = positiveNumber(draft);
  const targetUsd = value;
  const space = targetSpacePercent(targetUsd, currentCloseUsd);
  const progress = targetProgressPercent(targetUsd, currentCloseUsd, averageCostUsd);
  const adjust = (delta) => {
    const current = finiteNumber(draft);
    setDraft(String(Math.max(0, (current ?? currentCloseUsd ?? 0) + delta).toFixed(2)));
  };
  const currentDisplay = currentCloseUsd;

  return (
    <ActionModalCard
      title={t(language, 'watchlistDetail.editTarget', '编辑目标价')}
      closeLabel={t(language, 'watchlistDetail.closeTargetEditor', '关闭目标价编辑')}
      onClose={() => !saving && onCancel()}
      showGrabber
      widthClassName="w-[calc(100vw-38px)] max-w-[372px]"
      actions={[
        { key: 'cancel', label: t(language, 'watchlistDetail.cancel', '取消'), disabled: saving, onClick: onCancel },
        { key: 'save', label: saving ? t(language, 'watchlistDetail.saving', '保存中') : t(language, 'watchlistDetail.saveTarget', '保存目标价'), disabled: value === null || saving, onClick: () => onSave(targetUsd) },
      ]}
    >
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
        <StockLogo symbol={symbol} urls={logoUrls} className="h-10 w-10 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] text-white/[0.78]">{symbol} <span className="ml-1 text-[12px] text-white/[0.38]">{name}</span></div>
          <div className="mt-1 text-[10px] text-white/[0.29]">{t(language, 'watchlistDetail.currentClosePrice', '当前收盘价 {{price}}', { price: formatCurrency(currentDisplay, currency) })}</div>
        </div>
      </div>

      <label className="mt-4 block text-[10.5px] text-white/[0.38]" htmlFor="watchlist-stock-target-price">
        {t(language, 'watchlistDetail.singleTargetPrice', '单一目标价（{{currency}}）', { currency })}
      </label>
      <div className="mt-2 grid h-[50px] grid-cols-[46px_minmax(0,1fr)_46px] overflow-hidden rounded-xl border border-white/[0.09] bg-black/[0.28]">
        <button type="button" onClick={() => adjust(-1)} className="flex items-center justify-center border-r border-white/[0.07] text-white/[0.48] active:bg-white/[0.05]" aria-label={t(language, 'watchlistDetail.decreaseTarget', '目标价减少一个单位')}><Minus className="h-4 w-4" /></button>
        <div className="flex min-w-0 items-center px-3">
          <span className="mr-1.5 text-[14px] text-white/[0.28]">{currency === 'CNY' ? '¥' : '$'}</span>
          <input
            id="watchlist-stock-target-price"
            inputMode="decimal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="0.00"
            className="min-w-0 flex-1 bg-transparent text-center text-[19px] font-normal text-white/[0.86] outline-none tabular-nums"
            style={{ fontFamily: NUMBER_FONT, WebkitMinLogicalWidth: '0px' }}
          />
        </div>
        <button type="button" onClick={() => adjust(1)} className="flex items-center justify-center border-l border-white/[0.07] text-white/[0.48] active:bg-white/[0.05]" aria-label={t(language, 'watchlistDetail.increaseTarget', '目标价增加一个单位')}><Plus className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 grid grid-cols-2 divide-x divide-white/[0.07] rounded-xl border border-white/[0.06] bg-white/[0.025] py-3">
        <div className="px-3 text-center">
          <div className="text-[10px] text-white/[0.31]">{t(language, 'watchlistDetail.targetSpace', '距目标空间')}</div>
          <div className="mt-1.5 text-[15px] tabular-nums" style={{ color: marketHexColor(space || 0, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(space)}</div>
        </div>
        <div className="px-3 text-center">
          <div className="text-[10px] text-white/[0.31]">{t(language, 'watchlistDetail.costToTargetProgress', '成本至目标进度')}</div>
          <div className="mt-1.5 text-[15px] text-[#f6b54b] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{progress === null ? '--' : `${progress.toFixed(1)}%`}</div>
        </div>
      </div>

      {error ? <div className="mt-3 text-center text-[10.5px] text-[#ff4b1f]">{t(language, 'watchlistDetail.targetSaveFailed', '目标价保存失败')}</div> : null}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#f6b54b]/10 bg-[#f6b54b]/[0.035] px-3 py-2.5 text-[10.5px] leading-4 text-white/[0.36]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f6b54b]/65" />
        {t(language, 'watchlistDetail.targetBoundary', '目标价只保存个人计划，不修改持仓、正式交易记录或比赛账本。')}
      </div>
    </ActionModalCard>
  );
}

function resolveEarningsEvents(events, symbol, marketDate) {
  const rows = (Array.isArray(events) ? events : [])
    .filter((event) => String(event?.symbol || '').trim().toUpperCase() === symbol)
    .filter((event) => dateKey(event?.reportDate || event?.report_date || event?.date));
  const upcoming = rows
    .filter((event) => !isEarningsPublished(event) && dateKey(event?.reportDate || event?.report_date || event?.date) >= marketDate)
    .sort((left, right) => dateKey(left?.reportDate).localeCompare(dateKey(right?.reportDate)))[0] || null;
  const latestPublished = rows
    .filter((event) => isEarningsPublished(event) || dateKey(event?.reportDate) < marketDate)
    .sort((left, right) => dateKey(right?.reportDate).localeCompare(dateKey(left?.reportDate)))
    .find((event) => finiteNumber(event?.marketReactionPercent) !== null) || null;
  return { upcoming, latestPublished };
}

export default function WatchlistStockDetailPage({ ctx = {} }) {
  const {
    watchlistStockDetailSymbol = '',
    closeWatchlistStockDetail = () => {},
    language = 'zh',
    portfolioCurrencyMode = 'USD',
    usdRate = 7.2,
    marketColorMode,
    watchlist = [],
    homeWatchlist = [],
    quoteRows = [],
    investmentSummary = {},
    stockTrades = [],
    displayStockName,
    logoCache = {},
    cacheStockLogo,
    supabase,
    saveWatchlistStockTarget,
    watchlistStockDetailDataOverride,
    watchlistStockDetailEarningsOverride,
    watchlistStockDetailChartTooltipOpen = false,
    stockDetailInitialRange = '5y',
    watchlistStockDetailFocusSection = '',
    watchlistStockDetailTargetEditorOpen = false,
  } = ctx;
  const symbol = String(watchlistStockDetailSymbol || '').trim().toUpperCase();
  const [range, setRange] = React.useState(
    RANGE_IDS.includes(stockDetailInitialRange) ? stockDetailInitialRange : '5y',
  );
  const [stockDetail, setStockDetail] = React.useState(() => watchlistStockDetailDataOverride?.stockDetail || watchlistStockDetailDataOverride || null);
  const [earningsEvents, setEarningsEvents] = React.useState(() => watchlistStockDetailEarningsOverride || []);
  const [loading, setLoading] = React.useState(!watchlistStockDetailDataOverride);
  const [loadError, setLoadError] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [showTargetEditor, setShowTargetEditor] = React.useState(Boolean(watchlistStockDetailTargetEditorOpen));
  const [targetSaving, setTargetSaving] = React.useState(false);
  const [targetSaveError, setTargetSaveError] = React.useState(false);
  const [targetOverrideUsd, setTargetOverrideUsd] = React.useState(null);

  const rows = React.useMemo(() => findWatchlistStockDetailRows({
    symbol,
    watchlist,
    homeWatchlist,
    quoteRows,
    positions: investmentSummary?.positions,
    stockTrades,
  }), [homeWatchlist, investmentSummary?.positions, quoteRows, stockTrades, symbol, watchlist]);

  const previousSymbolRef = React.useRef(symbol);
  React.useEffect(() => {
    if (previousSymbolRef.current === symbol) return;
    previousSymbolRef.current = symbol;
    setTargetOverrideUsd(null);
    setShowTargetEditor(false);
  }, [symbol]);

  React.useEffect(() => {
    if (watchlistStockDetailDataOverride) {
      setStockDetail(watchlistStockDetailDataOverride.stockDetail || watchlistStockDetailDataOverride);
      setEarningsEvents(watchlistStockDetailEarningsOverride || []);
      setLoading(false);
      setLoadError(false);
      return undefined;
    }
    if (!symbol || !supabase?.auth?.getSession) {
      setLoading(false);
      setLoadError(true);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('missing session');
        const marketDate = getNewYorkEarningsClock(Date.now()).date;
        const detailPromise = fetch(`/api/quote?symbols=${encodeURIComponent(symbol)}&view=stock-detail`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).then(async (response) => {
          const body = await response.json().catch(() => null);
          if (!response.ok || body?.success === false) throw new Error(body?.error || 'stock detail request failed');
          const quote = body?.data?.find((item) => item?.symbol === symbol);
          if (!quote?.stockDetail) throw new Error('stock detail unavailable');
          return quote.stockDetail;
        });
        const earningsPromise = fetchEarningsCalendarEvents({
          token,
          symbols: [symbol],
          from: addUtcDays(marketDate, -7),
          to: addUtcDays(marketDate, 45),
          includePreviousPublished: true,
        }).catch(() => []);
        const [nextDetail, nextEarnings] = await Promise.all([detailPromise, earningsPromise]);
        if (!active) return;
        setStockDetail(nextDetail);
        setEarningsEvents(nextEarnings);
      } catch (error) {
        console.warn('[WatchlistStockDetail] load failed:', error?.message || error);
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reloadKey, supabase, symbol, watchlistStockDetailDataOverride, watchlistStockDetailEarningsOverride]);

  React.useEffect(() => {
    if (!watchlistStockDetailFocusSection) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      document.querySelector(`[data-watchlist-detail-section="${watchlistStockDetailFocusSection}"]`)?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [loading, watchlistStockDetailFocusSection]);

  const history = React.useMemo(() => normalizeStockDetailHistory(stockDetail?.history), [stockDetail?.history]);
  const weeklyHistory = React.useMemo(
    () => normalizeStockDetailWeeklyHistory(stockDetail?.weeklyHistory),
    [stockDetail?.weeklyHistory],
  );
  const visibleDailyHistory = React.useMemo(() => filterStockDetailHistory(history, range), [history, range]);
  const visibleWeeklyHistory = React.useMemo(
    () => filterStockDetailWeeklyHistory(weeklyHistory, range),
    [range, weeklyHistory],
  );
  const visibleHistory = React.useMemo(() => (
    range === '5y'
      ? visibleWeeklyHistory.map(({ date, close }) => ({ date, close }))
      : visibleDailyHistory
  ), [range, visibleDailyHistory, visibleWeeklyHistory]);
  const close = React.useMemo(() => resolveStockDetailClose(history), [history]);
  const indicators = stockDetail?.indicators || {};
  const portfolioCurrency = String(portfolioCurrencyMode || '').toUpperCase() === 'CNY' ? 'CNY' : 'USD';
  const portfolioRate = displayCurrencyRate(portfolioCurrency, usdRate);
  const stockCurrency = String(stockDetail?.currency || 'USD').toUpperCase() === 'CNY' ? 'CNY' : 'USD';
  const displayName = typeof displayStockName === 'function'
    ? displayStockName(symbol, rows.watchlistRow?.name || rows.quoteRow?.name || symbol, language)
    : (rows.watchlistRow?.name || rows.quoteRow?.name || symbol);
  const cachedLogoEntry = logoCache instanceof Map ? logoCache.get(symbol) : logoCache?.[symbol];
  const cachedLogoUrl = cachedLogoEntry?.url || cachedLogoEntry;
  const logoUrls = stockLogoCandidates(
    symbol,
    cachedLogoUrl,
    rows.watchlistRow?.logoURL,
    rows.watchlistRow?.logoUrl,
    rows.watchlistRow?.logo,
    rows.quoteRow?.logoURL,
    rows.quoteRow?.logoUrl,
    rows.quoteRow?.logo,
  );
  const closeDisplay = close.closeUsd;
  const changeDisplay = close.changeUsd;
  const closeColor = marketHexColor(close.changeUsd || 0, marketColorMode);
  const position = React.useMemo(() => deriveCloseBasedPosition(
    rows.position,
    close.closeUsd,
    investmentSummary?.totalAssetsUsd,
  ), [close.closeUsd, investmentSummary?.totalAssetsUsd, rows.position]);
  const targetPriceUsd = targetOverrideUsd ?? positiveNumber(rows.watchlistRow?.targetPriceUsd);
  const targetDisplay = targetPriceUsd;
  const targetGap = targetSpacePercent(targetPriceUsd, close.closeUsd);
  const targetProgress = targetProgressPercent(targetPriceUsd, close.closeUsd, position.averageCostUsd);
  const targetProgressPosition = targetProgressPositionPercent(targetProgress);
  const high52 = positiveNumber(indicators?.week52High);
  const ma200 = positiveNumber(indicators?.ma200);
  const ema30 = positiveNumber(indicators?.ema30);
  const ma200Weekly = positiveNumber(indicators?.ma200Weekly);
  const ma200WeeklyDistance = finiteNumber(indicators?.ma200WeeklyDistancePct);
  const ma200WeeklyChange4Week = finiteNumber(indicators?.ma200WeeklyChange4WeekPct);
  const ma200WeeklySide = ['above', 'below', 'equal'].includes(indicators?.ma200WeeklySide)
    ? indicators.ma200WeeklySide
    : null;
  const ma200WeeklyStreakWeeks = finiteNumber(indicators?.ma200WeeklyStreakWeeks);
  const ma200WeeklyAvailableWeeks = Math.max(0, finiteNumber(indicators?.ma200WeeklyAvailableWeeks) || 0);
  const ma200WeeklyRequiredWeeks = Math.max(1, finiteNumber(indicators?.ma200WeeklyRequiredWeeks) || 200);
  const ma200WeeklyAsOfDate = dateKey(indicators?.ma200WeeklyAsOfDate);
  const ma200WeeklyStatus = String(indicators?.ma200WeeklyStatus || 'unavailable');
  const distance52 = high52 && close.closeUsd ? ((close.closeUsd / high52) - 1) * 100 : null;
  const distanceMa200 = ma200 && close.closeUsd ? ((close.closeUsd / ma200) - 1) * 100 : null;
  const distanceEma30 = ema30 && close.closeUsd ? ((close.closeUsd / ema30) - 1) * 100 : null;
  const marketDate = getNewYorkEarningsClock(Date.now()).date;
  const earnings = resolveEarningsEvents(earningsEvents, symbol, marketDate);
  const upcomingDate = dateKey(earnings.upcoming?.reportDate);
  const countdown = upcomingDate ? daysBetween(marketDate, upcomingDate) : null;
  const upcomingSession = normalizeEarningsSession(earnings.upcoming?.session);
  const latestReaction = finiteNumber(earnings.latestPublished?.marketReactionPercent);
  const latestSession = normalizeEarningsSession(earnings.latestPublished?.session);
  const weeklyPanelReady = !loading
    && ma200WeeklyStatus === 'ready'
    && ma200Weekly !== null
    && ma200WeeklyDistance !== null;
  const weeklySideLabel = ma200WeeklySide === 'above'
    ? t(language, 'watchlistDetail.weeklyAbove', '长期趋势上方')
    : ma200WeeklySide === 'below'
      ? t(language, 'watchlistDetail.weeklyBelow', '长期趋势下方')
      : t(language, 'watchlistDetail.weeklyEqual', '位于长期均线');
  const weeklyStreakLabel = ma200WeeklyStreakWeeks === null || !ma200WeeklySide
    ? '--'
    : ma200WeeklySide === 'above'
      ? t(language, 'watchlistDetail.weeklyAboveStreak', '上方 {{weeks}} 周', { weeks: Math.round(ma200WeeklyStreakWeeks) })
      : ma200WeeklySide === 'below'
        ? t(language, 'watchlistDetail.weeklyBelowStreak', '下方 {{weeks}} 周', { weeks: Math.round(ma200WeeklyStreakWeeks) })
        : t(language, 'watchlistDetail.weeklyEqualStreak', '持平 {{weeks}} 周', { weeks: Math.round(ma200WeeklyStreakWeeks) });

  const saveTarget = async (targetUsd) => {
    if (!(targetUsd > 0) || typeof saveWatchlistStockTarget !== 'function') {
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
    } catch (error) {
      console.warn('[WatchlistStockDetail] target save failed:', error?.message || error);
      setTargetSaveError(true);
    } finally {
      setTargetSaving(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-[#05070b] pb-[calc(env(safe-area-inset-bottom)+86px)] text-white" data-watchlist-stock-detail-page="production" style={{ fontFamily: PAGE_FONT }}>
      <header className="sticky top-0 z-30 -mx-4 border-b border-white/[0.07] bg-[#05070b]/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
        <div className="grid h-10 grid-cols-[40px_minmax(0,1fr)_40px] items-center">
          <button type="button" onClick={closeWatchlistStockDetail} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.045] text-white/[0.66] active:scale-95" aria-label={t(language, 'watchlistDetail.back', '返回首页')}>
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
          <h1 className="text-center text-[17px] font-normal tracking-[0.02em] text-white/[0.88]">{t(language, 'watchlistDetail.title', '股票趋势')}</h1>
          <div aria-hidden="true" />
        </div>
      </header>

      <section className="mt-3 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]" data-watchlist-stock-detail-header="full-width-chart">
        <div className="flex min-w-0 items-center gap-3">
          <StockLogo symbol={symbol} urls={logoUrls} onLogoLoad={cacheStockLogo} className="h-11 w-11 rounded-[11px]" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="text-[18px] font-normal text-white/[0.9]">{symbol || '--'}</span>
              <span className="truncate text-[13px] text-white/[0.45]">{displayName}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[9.5px] text-white/[0.29]">
              <span className="rounded-md bg-white/[0.045] px-1.5 py-0.5">{t(language, 'watchlistDetail.usStock', '美股')}</span>
            </div>
          </div>
          <div className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.035] px-2 py-1 text-[9px] text-white/[0.34]">{t(language, 'watchlistDetail.regularClose', '收盘')}</div>
        </div>

        <div className="mt-4">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
            <span className="text-[29px] font-normal leading-none tracking-[-0.02em] text-white/[0.92]">{formatCurrency(closeDisplay, stockCurrency)}</span>
            <span className="text-[15px]" style={{ color: closeColor }}>{formatSignedPercent(close.changePercent)}</span>
            <span className="text-[13px] opacity-75" style={{ color: closeColor }}>{changeDisplay === null ? '(--)' : `(${changeDisplay >= 0 ? '+' : ''}${formatNumber(changeDisplay)})`}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9.5px] text-white/[0.31]">
            <span>{t(language, 'watchlistDetail.asOfClose', '{{date}} 收盘', { date: formatDate(close.asOfDate, language) })}</span><span aria-hidden="true">·</span><span>{t(language, 'watchlistDetail.easternTime', '美东时间')}</span><span aria-hidden="true">·</span><span>{stockCurrency}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-1" data-watchlist-stock-chart-ranges="five">
          {RANGE_IDS.map((item) => (
            <button key={item} type="button" onClick={() => setRange(item)} className={`h-8 rounded-lg border px-1.5 text-[10.5px] transition active:scale-95 ${range === item ? 'border-[#f6b54b]/20 bg-[#f6b54b]/[0.11] text-[#ffd18a]' : 'border-transparent text-white/[0.34]'}`}>
              {t(language, `watchlistDetail.range.${item}`, item.toUpperCase())}
            </button>
          ))}
        </div>
        <div className="mt-2 min-w-0">
          <PriceChart rows={visibleHistory} weeklyRows={visibleWeeklyHistory} weeklyLookupRows={weeklyHistory} range={range} currency={stockCurrency} language={language} marketColorMode={marketColorMode} symbol={symbol} initialTooltipOpen={watchlistStockDetailChartTooltipOpen} />
        </div>
        <div className="mt-1 flex items-center justify-center gap-6 text-[9.5px] text-white/[0.4]" data-watchlist-stock-chart-legend={range === '5y' ? 'price-weekly-ma' : 'price-daily-ma'}>
          <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 rounded-full bg-[#22c55e]" />{t(language, 'watchlistDetail.priceLegend', '股价')}</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 rounded-full" style={{ backgroundColor: range === '5y' ? MA200_WEEK_COLOR : MA200_DAY_COLOR }} />{range === '5y' ? t(language, 'watchlistDetail.ma200Weekly', 'MA200（周）') : t(language, 'watchlistDetail.ma200Daily', 'MA200（日）')}</span>
        </div>
      </section>

      {loading ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-[#0b0f14] px-4 py-5 text-[11px] text-white/[0.38]">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#f6b54b]" />
          {t(language, 'watchlistDetail.loading', '正在加载股票详情')}
        </div>
      ) : null}
      {loadError ? (
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ff4b1f]/20 bg-[#0b0f14] px-4 py-4 text-[11px] text-white/[0.52] active:scale-[0.995]">
          <RefreshCw className="h-3.5 w-3.5 text-[#ff4b1f]" />
          {t(language, 'watchlistDetail.loadFailed', '股票详情加载失败')}
        </button>
      ) : null}

      <section data-watchlist-detail-section="weekly-ma" className="mt-3 scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]" data-watchlist-key-metrics="spacious">
        <div className="px-4 pb-2 pt-4">
          <h2 className="text-[15px] font-normal text-white/[0.82]">{t(language, 'watchlistDetail.technicalIndicators', '关键指标')}</h2>
        </div>
        <div className="grid grid-cols-3 gap-3 px-4 pb-4 pt-2" data-watchlist-daily-metrics="borderless">
          <MetricCell label={t(language, 'watchlistDetail.distance52High', '距52周高点')} value={formatSignedPercent(distance52)} detail={t(language, 'watchlistDetail.highValue', '高点 {{price}}', { price: formatCurrency(high52, stockCurrency) })} color={marketHexColor(distance52 || 0, marketColorMode)} />
          <MetricCell label={t(language, 'watchlistDetail.distanceMa200Daily', '距MA200（日）')} value={formatSignedPercent(distanceMa200)} detail={t(language, 'watchlistDetail.ma200DailyValue', '日线 {{price}}', { price: formatCurrency(ma200, stockCurrency) })} color={marketHexColor(distanceMa200 || 0, marketColorMode)} />
          <MetricCell label={t(language, 'watchlistDetail.distanceEma30Daily', '距EMA30（日）')} value={formatSignedPercent(distanceEma30)} detail={t(language, 'watchlistDetail.ema30DailyValue', '日线 {{price}}', { price: formatCurrency(ema30, stockCurrency) })} color={marketHexColor(distanceEma30 || 0, marketColorMode)} />
        </div>

        <div className="mx-4 mb-4 rounded-[14px] bg-[#f6b54b]/[0.055] px-4 py-3.5" data-watchlist-weekly-ma-panel="true">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-[13px] font-normal text-white/[0.76]">{t(language, 'watchlistDetail.ma200Weekly', 'MA200（周）')}</h3>
            <span className="rounded-md bg-[#f6b54b]/[0.1] px-1.5 py-0.5 text-[8.5px] text-[#f6b54b]/75">{t(language, 'watchlistDetail.longTermTrend', '长期趋势')}</span>
            {weeklyPanelReady ? <span className="ml-auto text-[9px] text-white/[0.28]">{t(language, 'watchlistDetail.weeklyCloseLocked', '周收盘锁定')}</span> : null}
          </div>

          {loading ? (
            <div className="py-7 text-center text-[10.5px] text-white/[0.32]">{t(language, 'watchlistDetail.weeklyLoading', '正在读取长期周线')}</div>
          ) : weeklyPanelReady ? (
            <>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <div className="text-[9.5px] text-white/[0.32]">{t(language, 'watchlistDetail.distanceMa200Weekly', '距200周均线')}</div>
                  <div className="mt-1 text-[22px] font-normal tabular-nums" style={{ color: marketHexColor(ma200WeeklyDistance || 0, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(ma200WeeklyDistance)}</div>
                </div>
                <div className="pb-0.5 text-right">
                  <div className="text-[12px]" style={{ color: marketHexColor(ma200WeeklyDistance || 0, marketColorMode) }}>{weeklySideLabel}</div>
                  <div className="mt-1 text-[9px] text-white/[0.27]">{t(language, 'watchlistDetail.completedWeeksBasis', '基于已完成交易周')}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-4">
                <div><div className="text-[8.5px] text-white/[0.27]">{t(language, 'watchlistDetail.weeklyMaValueLabel', '200周均线')}</div><div className="mt-1 text-[11.5px] text-white/[0.65] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatCurrency(ma200Weekly, stockCurrency)}</div></div>
                <div className="text-center"><div className="text-[8.5px] text-white/[0.27]">{t(language, 'watchlistDetail.weeklyChange4', '近4周变化')}</div><div className="mt-1 text-[11.5px] tabular-nums" style={{ color: marketHexColor(ma200WeeklyChange4Week || 0, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(ma200WeeklyChange4Week)}</div></div>
                <div className="text-right"><div className="text-[8.5px] text-white/[0.27]">{t(language, 'watchlistDetail.consecutiveStatus', '连续状态')}</div><div className="mt-1 text-[11.5px] text-white/[0.65]">{weeklyStreakLabel}</div></div>
              </div>

              <div className="mt-3.5 text-[8.5px] text-white/[0.22]">{t(language, 'watchlistDetail.weeklyUpdatedComplete', '更新至 {{date}} 周收盘 · 200周数据完整', { date: formatDate(ma200WeeklyAsOfDate, language) })}</div>
            </>
          ) : (
            <div className="py-7 text-center">
              <div className="text-[11px] text-white/[0.48]">
                {ma200WeeklyStatus === 'insufficient_data'
                  ? t(language, 'watchlistDetail.weeklyInsufficient', '历史不足 · 已取得 {{available}}/{{required}} 周', { available: Math.min(ma200WeeklyAvailableWeeks, ma200WeeklyRequiredWeeks), required: ma200WeeklyRequiredWeeks })
                  : t(language, 'watchlistDetail.weeklyUnavailable', '长期周线暂不可用')}
              </div>
              <div className="mt-1.5 text-[9px] text-white/[0.24]">{t(language, 'watchlistDetail.noSyntheticWeekly', '不会补造均线或趋势结论')}</div>
            </div>
          )}
        </div>
      </section>

      <section className="mt-3 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
        <SectionHeading title={t(language, 'watchlistDetail.myPosition', '我的持仓')} trailing={t(language, 'watchlistDetail.updatedAtClose', '更新于 {{date}} 收盘', { date: formatDate(close.asOfDate, language) })} />
        {position.held ? (
          <div className="px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[10.5px] text-white/[0.35]">{t(language, 'watchlistDetail.marketValue', '持仓市值（{{currency}}）', { currency: portfolioCurrency })}</div>
                <div className="mt-1.5 text-[25px] font-normal text-white/[0.88] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatNumber(usdToDisplayCurrency(position.marketValueUsd, portfolioCurrency, portfolioRate), 2)}</div>
              </div>
              <div className="pb-0.5 text-right">
                <div className="text-[10.5px] text-white/[0.35]">{t(language, 'watchlistDetail.currentPnl', '当前盈亏')}</div>
                <div className="mt-1 text-[14px] tabular-nums" style={{ color: marketHexColor(position.pnlUsd || 0, marketColorMode), fontFamily: NUMBER_FONT }}>{formatCurrency(usdToDisplayCurrency(position.pnlUsd, portfolioCurrency, portfolioRate), portfolioCurrency, 2, { signed: true })}</div>
                <div className="mt-0.5 text-[10.5px] tabular-nums" style={{ color: marketHexColor(position.pnlPercent || 0, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(position.pnlPercent)}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.06] pt-3">
              <div className="pr-3"><div className="text-[9.5px] text-white/[0.31]">{t(language, 'watchlistDetail.heldShares', '持仓数量')}</div><div className="mt-1.5 text-[13px] text-white/[0.72] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatShares(position.shares)} {t(language, 'watchlistDetail.shares', '股')}</div></div>
              <div className="px-3"><div className="text-[9.5px] text-white/[0.31]">{t(language, 'watchlistDetail.averageCost', '平均成本')}</div><div className="mt-1.5 text-[13px] text-white/[0.72] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatCurrency(position.averageCostUsd, stockCurrency)}</div></div>
              <div className="pl-3"><div className="text-[9.5px] text-white/[0.31]">{t(language, 'watchlistDetail.allocation', '仓位占比')}</div><div className="mt-1.5 text-[13px] text-white/[0.72] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{position.allocationPercent === null ? '--' : `${formatNumber(position.allocationPercent, 2)}%`}</div></div>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.055]"><div className="h-full rounded-full bg-[#f6b54b]/80" style={{ width: `${Math.max(0, Math.min(100, position.allocationPercent || 0))}%` }} /></div>
          </div>
        ) : (
          <div className="px-4 py-5 text-center text-[11px] text-white/[0.32]">{t(language, 'watchlistDetail.noPosition', '当前没有持仓')}</div>
        )}
      </section>

      <button type="button" data-watchlist-detail-section="target" onClick={() => { setTargetSaveError(false); setShowTargetEditor(true); }} className="mt-3 scroll-mt-20 block w-full overflow-hidden rounded-2xl border border-[#f6b54b]/15 bg-[#0b0f14] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]" aria-label={t(language, 'watchlistDetail.editTargetAria', '编辑 {{symbol}} 目标价', { symbol })}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
          <div className="flex items-center gap-2"><h2 className="text-[15px] font-normal text-white/[0.82]">{t(language, 'watchlistDetail.targetPrice', '目标价')}</h2><span className="rounded-md border border-[#f6b54b]/15 bg-[#f6b54b]/[0.055] px-1.5 py-0.5 text-[9px] text-[#f6b54b]/75">{t(language, 'watchlistDetail.personalPlan', '个人计划')}</span></div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/[0.32]"><Pencil className="h-3 w-3" />{t(language, 'watchlistDetail.edit', '编辑')}<ChevronRight className="h-3.5 w-3.5" /></div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <div><div className="text-[10px] text-white/[0.33]">{t(language, 'watchlistDetail.singleTargetPrice', '单一目标价（{{currency}}）', { currency: stockCurrency })}</div><div className="mt-1.5 text-[27px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatCurrency(targetDisplay, stockCurrency)}</div></div>
            <div className="pb-1 text-right"><div className="text-[10px] text-white/[0.33]">{t(language, 'watchlistDetail.targetSpace', '距目标空间')}</div><div className="mt-1 text-[16px] tabular-nums" style={{ color: marketHexColor(targetGap || 0, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(targetGap)}</div></div>
          </div>
          <div className="mt-5">
            <div className="relative h-1.5 rounded-full bg-gradient-to-r from-[#36c49a] via-[#f6b54b] to-[#ff4b1f]"><span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#f6b54b] shadow-[0_0_11px_rgba(246,181,75,0.55)]" style={{ left: `${targetProgressPosition}%`, opacity: targetProgress === null ? 0.35 : 1 }} /></div>
            <div className="mt-2 grid grid-cols-3 text-[9.5px] text-white/[0.29]">
              <span>{t(language, 'watchlistDetail.cost', '成本 {{price}}', { price: formatCurrency(position.averageCostUsd, stockCurrency) })}</span>
              <span className="text-center text-[#f6b54b]/75">{t(language, 'watchlistDetail.current', '当前 {{price}}', { price: formatCurrency(closeDisplay, stockCurrency) })}</span>
              <span className="text-right">{t(language, 'watchlistDetail.target', '目标 {{price}}', { price: formatCurrency(targetDisplay, stockCurrency) })}</span>
            </div>
            <div className="mt-3 text-right text-[10px] text-white/[0.3]">{t(language, 'watchlistDetail.costToTargetProgress', '成本至目标进度')} <span className="ml-1 text-white/[0.58] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{targetProgress === null ? '--' : `${targetProgress.toFixed(1)}%`}</span></div>
          </div>
        </div>
      </button>

      <section data-watchlist-detail-section="events" className="mt-3 scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
        <SectionHeading title={t(language, 'watchlistDetail.keyEvents', '关键事件')} trailing={t(language, 'watchlistDetail.autoRead', '自动读取')} />
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] px-1 py-4">
          <div className="px-3 text-center"><CalendarDays className="mx-auto h-4 w-4 text-white/[0.35]" /><div className="mt-2 text-[9.5px] text-white/[0.3]">{t(language, 'watchlistDetail.nextEarnings', '下次财报')}</div><div className="mt-1 text-[13px] text-white/[0.72] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{upcomingDate ? formatDate(upcomingDate, language) : '--'}</div><div className="mt-0.5 text-[9px] text-white/[0.25]">{upcomingSession === 'pre' ? t(language, 'watchlistDetail.expectedPreMarket', '预计盘前') : upcomingSession === 'post' ? t(language, 'watchlistDetail.expectedPostMarket', '预计盘后') : t(language, 'watchlistDetail.sessionUnknown', '时间待定')}</div></div>
          <div className="px-3 text-center"><Clock3 className="mx-auto h-4 w-4 text-white/[0.35]" /><div className="mt-2 text-[9.5px] text-white/[0.3]">{t(language, 'watchlistDetail.earningsCountdown', '距离财报')}</div><div className="mt-1 text-[13px] text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{countdown === null ? '--' : t(language, 'watchlistDetail.days', '{{days}} 天', { days: countdown })}</div><div className="mt-0.5 text-[9px] text-white/[0.25]">{earnings.upcoming ? quarterLabel(earnings.upcoming, language) : t(language, 'watchlistDetail.noEarnings', '暂无财报日程')}</div></div>
          <div className="px-3 text-center"><TrendingUp className="mx-auto h-4 w-4 text-white/[0.35]" /><div className="mt-2 text-[9.5px] text-white/[0.3]">{t(language, 'watchlistDetail.latestEarningsReaction', '最近财报反应')}</div><div className="mt-1 text-[13px] tabular-nums" style={{ color: marketHexColor(latestReaction || 0, marketColorMode), fontFamily: NUMBER_FONT }}>{formatSignedPercent(latestReaction)}</div><div className="mt-0.5 text-[9px] text-white/[0.25]">{latestSession === 'pre' ? t(language, 'watchlistDetail.preMarketMove', '盘前涨跌') : latestSession === 'post' ? t(language, 'watchlistDetail.postMarketMove', '盘后涨跌') : t(language, 'watchlistDetail.sessionUnknown', '时间待定')}</div></div>
        </div>
      </section>

      <section data-watchlist-detail-section="trades" className="mt-3 scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
        <SectionHeading title={t(language, 'watchlistDetail.recentTrades', '最近交易记录')} trailing={t(language, 'watchlistDetail.formalLedgerReadOnly', '正式账本 · 只读')} />
        {rows.trades.length ? (
          <div className="divide-y divide-white/[0.055] px-4">
            {rows.trades.slice(0, 5).map((trade) => {
              const buy = trade?.side !== 'sell';
              const shares = finiteNumber(trade?.shares) || 0;
              const priceUsd = finiteNumber(trade?.price);
              const amountUsd = priceUsd === null ? null : shares * priceUsd;
              return (
                <div key={trade?.id || `${trade?.date}-${trade?.side}-${trade?.price}`} className="grid grid-cols-[88px_minmax(0,1fr)_96px] items-center gap-3 py-3">
                  <div><div className="text-[12px]" style={{ color: marketHexColor(buy ? 1 : -1, marketColorMode) }}>{buy ? t(language, 'watchlistDetail.buy', '买入') : t(language, 'watchlistDetail.sell', '卖出')}</div><div className="mt-1 text-[9.5px] text-white/[0.27] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatDate(trade?.date, language, { year: true })}</div></div>
                  <div className="text-right"><div className="text-[11.5px] text-white/[0.61] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{formatShares(shares)} {t(language, 'watchlistDetail.shares', '股')}</div><div className="mt-1 text-[9.5px] text-white/[0.27] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>@ {formatCurrency(priceUsd, stockCurrency)}</div></div>
                  <div className="text-right text-[11.5px] text-white/[0.62] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{amountUsd === null ? '--' : formatCurrency(buy ? -amountUsd : amountUsd, stockCurrency, 2, { signed: true })}</div>
                </div>
              );
            })}
          </div>
        ) : <div className="px-4 py-5 text-center text-[11px] text-white/[0.32]">{t(language, 'watchlistDetail.noTrades', '暂无正式交易记录')}</div>}
      </section>

      {showTargetEditor ? (
        <TargetEditor
          language={language}
          symbol={symbol}
          name={displayName}
          logoUrls={logoUrls}
          currency={stockCurrency}
          currentCloseUsd={close.closeUsd}
          averageCostUsd={position.averageCostUsd}
          targetPriceUsd={targetPriceUsd}
          marketColorMode={marketColorMode}
          saving={targetSaving}
          error={targetSaveError}
          onCancel={() => !targetSaving && setShowTargetEditor(false)}
          onSave={saveTarget}
        />
      ) : null}
    </main>
  );
}
