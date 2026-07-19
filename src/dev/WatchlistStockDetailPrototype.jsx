import React from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  Home,
  ListChecks,
  Minus,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif';
const MARKET_RED = '#ff4b1f';
const MARKET_GREEN = '#22c55e';
const MA200_DAY_COLOR = '#60a5fa';
const MA200_WEEK_COLOR = '#f6b54b';
const CURRENT_PRICE = 398.37;
const AVG_COST = 286.44;

const RANGE_SERIES = {
  '1m': {
    labels: ['06/17', '06/25', '07/02', '07/10', '07/17'],
    values: [435.2, 467.8, 470.1, 438.4, 443.7, 435.9, 431.6, 447.8, 479.0, 445.2, 437.8, 444.6, 450.3, 429.7, 436.6, 435.2, 431.8, 421.4, 416.2, 410.75, 398.37],
    ma200: [344.8, 345.1, 345.4, 345.7, 346.0, 346.3, 346.7, 347.0, 347.3, 347.6, 347.9, 348.2, 348.5, 348.8, 349.1, 349.4, 349.7, 350.0, 350.2, 350.4, 350.6],
  },
  '3m': {
    labels: ['04/17', '05/09', '06/02', '06/25', '07/17'],
    values: [330.4, 345.8, 360.1, 342.6, 372.4, 389.3, 375.8, 405.1, 392.4, 418.7, 447.3, 432.8, 460.5, 479.0, 445.2, 437.8, 430.6, 410.75, 398.37],
    ma200: [309.8, 312.1, 314.4, 316.8, 319.2, 321.7, 324.1, 326.6, 329.0, 331.5, 334.0, 336.4, 338.9, 341.3, 343.7, 346.0, 348.0, 349.4, 350.6],
  },
  '6m': {
    labels: ['01/17', '03/03', '04/15', '06/02', '07/17'],
    values: [286.2, 300.8, 294.1, 318.5, 309.6, 337.4, 326.8, 354.7, 346.1, 372.4, 389.3, 375.8, 405.1, 418.7, 447.3, 479.0, 398.37],
    ma200: [271.4, 276.3, 281.2, 286.1, 291.0, 296.0, 300.9, 305.8, 310.8, 315.7, 320.7, 325.7, 330.7, 335.7, 340.7, 345.7, 350.6],
  },
  '1y': {
    labels: ['07/17', '10/17', '01/17', '04/17', '07/17'],
    values: [188.4, 201.7, 195.2, 218.6, 210.1, 235.8, 226.4, 252.1, 243.8, 271.6, 286.2, 300.8, 294.1, 337.4, 354.7, 389.3, 398.37],
    ma200: [207.4, 216.3, 225.2, 234.2, 243.1, 252.1, 261.1, 270.0, 279.0, 288.0, 297.0, 306.0, 315.0, 324.0, 333.0, 342.0, 350.6],
  },
  '5y': {
    labels: ['2021', '2022', '2023', '2024', '2025', '2026'],
    values: [58.3, 66.7, 75.4, 89.1, 82.2, 70.4, 64.5, 72.2, 86.7, 104.6, 127.9, 151.8, 180.5, 169.9, 198.2, 238.0, 276.7, 262.4, 301.1, 284.8, 317.2, 344.6, 329.5, 362.8, 391.2, 374.7, 416.9, 448.3, 429.4, 398.37],
    ma200: [49.6, 52.1, 54.7, 57.4, 60.1, 63.0, 66.2, 69.3, 72.1, 75.2, 78.5, 82.2, 86.4, 91.0, 96.2, 102.0, 108.7, 116.4, 124.1, 131.8, 139.9, 147.1, 154.4, 161.0, 167.5, 172.8, 177.2, 180.4, 182.0, 183.18],
  },
};

const RANGE_DATE_BOUNDS = {
  '1m': ['2026-06-17', '2026-07-17'],
  '3m': ['2026-04-17', '2026-07-17'],
  '6m': ['2026-01-17', '2026-07-17'],
  '1y': ['2025-07-17', '2026-07-17'],
  '5y': ['2021-07-17', '2026-07-17'],
};

const RANGE_LABELS = {
  '1m': '1月',
  '3m': '3月',
  '6m': '6月',
  '1y': '1年',
  '5y': '5年',
};

const NAV_ITEMS = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'trades', label: '交易', icon: ListChecks },
  { id: 'analysis', label: '资产', icon: Wallet },
  { id: 'target', label: '目标', icon: Target },
  { id: 'settings', label: '设置', icon: Settings },
];

const TRADES = [
  { id: 'trade-1', side: '买入', date: '2026/06/12', shares: 200, price: 198.45, amount: -39690 },
  { id: 'trade-2', side: '买入', date: '2026/05/20', shares: 150, price: 191.2, amount: -28680 },
  { id: 'trade-3', side: '卖出', date: '2026/04/02', shares: 100, price: 178.66, amount: 17866 },
];

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return number.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signedPct(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

function targetSpace(targetPrice) {
  const target = Number(targetPrice);
  return target > 0 ? ((target / CURRENT_PRICE) - 1) * 100 : null;
}

function targetProgress(targetPrice) {
  const target = Number(targetPrice);
  if (!(target > AVG_COST)) return null;
  return ((CURRENT_PRICE - AVG_COST) / (target - AVG_COST)) * 100;
}

function chartGeometry(values, ma200) {
  const width = 352;
  const height = 184;
  const left = 30;
  const right = 10;
  const top = 10;
  const bottom = 25;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const combined = [...values, ...ma200].filter(Number.isFinite);
  const low = Math.min(...combined);
  const high = Math.max(...combined);
  const span = Math.max(1, high - low);
  const min = Math.max(0, low - span * 0.08);
  const max = high + span * 0.08;
  const toPoints = (series) => series.map((value, index) => ({
    x: left + (index / Math.max(1, series.length - 1)) * plotWidth,
    y: top + ((max - value) / Math.max(1, max - min)) * plotHeight,
    value,
  }));
  const toPath = (points) => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const pricePoints = toPoints(values);
  const maPoints = toPoints(ma200);
  const pricePath = toPath(pricePoints);
  const maPath = toPath(maPoints);
  const areaPath = `${pricePath} L ${pricePoints.at(-1).x.toFixed(2)} ${(top + plotHeight).toFixed(2)} L ${pricePoints[0].x.toFixed(2)} ${(top + plotHeight).toFixed(2)} Z`;
  const priceLines = [0, 0.33, 0.66, 1].map((ratio) => ({
    y: top + ratio * plotHeight,
    value: max - ratio * (max - min),
  }));
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    plotWidth,
    plotHeight,
    pricePoints,
    maPoints,
    pricePath,
    maPath,
    areaPath,
    priceLines,
  };
}

function chartPointDate(range, index, count) {
  const [startKey, endKey] = RANGE_DATE_BOUNDS[range] || RANGE_DATE_BOUNDS['1m'];
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const end = Date.parse(`${endKey}T00:00:00Z`);
  const ratio = count <= 1 ? 1 : index / (count - 1);
  const date = new Date(start + ((end - start) * ratio));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function PriceChart({ range, initialTooltipOpen = false }) {
  const series = RANGE_SERIES[range] || RANGE_SERIES['5y'];
  const weeklyMa = range === '5y';
  const maLabel = weeklyMa ? 'MA200（周）' : 'MA200（日）';
  const maColor = weeklyMa ? MA200_WEEK_COLOR : MA200_DAY_COLOR;
  const chart = chartGeometry(series.values, series.ma200);
  const last = chart.pricePoints.at(-1);
  const chartRef = React.useRef(null);
  const activePointerIdRef = React.useRef(null);
  const previousRangeRef = React.useRef(range);
  const [selectedIndex, setSelectedIndex] = React.useState(() => (
    initialTooltipOpen ? Math.round((series.values.length - 1) * 0.78) : null
  ));
  const selectedPoint = Number.isInteger(selectedIndex) ? chart.pricePoints[selectedIndex] || null : null;
  const selectedMaPoint = Number.isInteger(selectedIndex) ? chart.maPoints[selectedIndex] || null : null;
  const selectedValue = selectedPoint?.value;
  const selectedMaValue = selectedMaPoint?.value;
  const previousValue = selectedIndex > 0 ? series.values[selectedIndex - 1] : null;
  const selectedChange = Number.isFinite(selectedValue) && Number.isFinite(previousValue)
    ? selectedValue - previousValue
    : null;
  const selectedChangePct = selectedChange != null && previousValue > 0
    ? (selectedChange / previousValue) * 100
    : null;
  const selectedMaDistance = Number.isFinite(selectedValue) && Number.isFinite(selectedMaValue) && selectedMaValue > 0
    ? ((selectedValue / selectedMaValue) - 1) * 100
    : null;

  React.useEffect(() => {
    if (previousRangeRef.current === range) return;
    previousRangeRef.current = range;
    setSelectedIndex(null);
  }, [range]);

  React.useEffect(() => {
    if (selectedIndex == null) return undefined;
    const timeoutId = window.setTimeout(() => setSelectedIndex(null), 12_000);
    return () => window.clearTimeout(timeoutId);
  }, [selectedIndex]);

  React.useEffect(() => {
    const closeOutside = (event) => {
      if (!chartRef.current?.contains(event.target)) setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  const selectNearestPoint = React.useCallback((clientX) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const viewBoxX = ((clientX - rect.left) / rect.width) * chart.width;
    const ratio = Math.max(0, Math.min(1, (viewBoxX - chart.left) / chart.plotWidth));
    setSelectedIndex(Math.round(ratio * Math.max(0, chart.pricePoints.length - 1)));
  }, [chart.left, chart.plotWidth, chart.pricePoints.length, chart.width]);

  const handlePointerDown = (event) => {
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectNearestPoint(event.clientX);
  };

  const handlePointerMove = (event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    selectNearestPoint(event.clientX);
  };

  const finishPointerSelection = (event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    selectNearestPoint(event.clientX);
    activePointerIdRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const selectedColor = selectedChange == null || selectedChange >= 0 ? MARKET_RED : MARKET_GREEN;
  return (
    <div
      ref={chartRef}
      role="button"
      tabIndex={0}
      aria-label="查看 TSM 股价走势"
      data-watchlist-price-chart-trigger="true"
      className="relative min-w-0 cursor-crosshair rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-[#f6b54b]/45"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerSelection}
      onPointerCancel={() => { activePointerIdRef.current = null; }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setSelectedIndex(series.values.length - 1);
      }}
    >
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-[184px] w-full overflow-visible" role="img" aria-label={`${RANGE_LABELS[range]}普通收盘价与${maLabel}走势`}>
        <defs>
          <linearGradient id="watchlist-stock-price-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={MARKET_GREEN} stopOpacity="0.14" />
            <stop offset="100%" stopColor={MARKET_GREEN} stopOpacity="0" />
          </linearGradient>
        </defs>
        {chart.priceLines.map((line) => (
          <g key={line.y}>
            <line x1={chart.left} x2={chart.width - chart.right} y1={line.y} y2={line.y} stroke="rgba(255,255,255,0.052)" strokeDasharray="2 4" />
            <text x={chart.left - 6} y={line.y + 3} textAnchor="end" fill="rgba(255,255,255,0.28)" fontSize="8.3" style={{ fontFamily: NUMBER_FONT }}>{Math.round(line.value)}</text>
          </g>
        ))}
        <path d={chart.areaPath} fill="url(#watchlist-stock-price-area)" />
        <path data-watchlist-daily-ma-line={weeklyMa ? undefined : 'true'} data-watchlist-weekly-ma-line={weeklyMa ? 'true' : undefined} d={chart.maPath} fill="none" stroke={maColor} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={chart.pricePath} fill="none" stroke={MARKET_GREEN} strokeWidth="0.95" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={last.x} cy={last.y} r="2.2" fill={MARKET_GREEN} stroke="#d6fff0" strokeWidth="0.65" />
        {selectedPoint ? (
          <g aria-hidden="true">
            <line x1={selectedPoint.x} x2={selectedPoint.x} y1={chart.top} y2={chart.height - chart.bottom} stroke="rgba(255,255,255,0.24)" strokeWidth="0.8" strokeDasharray="3 3" />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="8" fill="#f6b54b" opacity="0.13" />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="3.8" fill="#05070b" stroke="#ffd18a" strokeWidth="1.25" />
            {selectedMaPoint ? <circle cx={selectedMaPoint.x} cy={selectedMaPoint.y} r="2.8" fill="#05070b" stroke={maColor} strokeWidth="1.1" /> : null}
          </g>
        ) : null}
        {series.labels.map((label, index) => {
          const x = chart.left + (index / Math.max(1, series.labels.length - 1)) * chart.plotWidth;
          return <text key={label + index} x={x} y={chart.height - 3} textAnchor={index === 0 ? 'start' : index === series.labels.length - 1 ? 'end' : 'middle'} fill="rgba(255,255,255,0.25)" fontSize="8.2" style={{ fontFamily: NUMBER_FONT }}>{label}</text>;
        })}
      </svg>
      {selectedPoint ? (
        <div
          data-watchlist-price-chart-tooltip="true"
          className={`pointer-events-none absolute top-2 w-[184px] rounded-xl border border-white/10 bg-[#121821]/95 px-3 py-2.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.48)] backdrop-blur ${selectedPoint.x > chart.width * 0.56 ? 'left-8' : 'right-2'}`}
        >
          <div className="text-[9px] text-white/[0.42]">{chartPointDate(range, selectedIndex, series.values.length)} · 普通收盘</div>
          <div className="mt-1 text-[18px] font-normal text-white/[0.88] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>${formatNumber(selectedValue)}</div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[9px]">
            <span className="text-white/[0.3]">{weeklyMa ? '周涨跌' : '当日涨跌'}</span>
            <span className="whitespace-nowrap tabular-nums" style={{ color: selectedColor, fontFamily: NUMBER_FONT }}>
              {selectedChange == null ? '--' : `${selectedChange >= 0 ? '+' : ''}${formatNumber(selectedChange)}  ${signedPct(selectedChangePct)}`}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px]">
            <span className="text-white/[0.3]">{maLabel}</span>
            <span className="whitespace-nowrap tabular-nums" style={{ color: maColor, fontFamily: NUMBER_FONT }}>
              {Number.isFinite(selectedMaValue) ? `$${formatNumber(selectedMaValue)} · ${signedPct(selectedMaDistance)}` : '--'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCell({ label, value, detail, color = 'rgba(255,255,255,0.82)' }) {
  return (
    <div className="min-w-0 text-center">
      <div className="truncate text-[9.5px] text-white/[0.36]">{label}</div>
      <div className="mt-1.5 truncate text-[15px] font-normal tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{value}</div>
      <div className="mt-1 truncate text-[9px] text-white/[0.26]">{detail}</div>
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

function TargetEditor({ targetPrice, onCancel, onSave }) {
  const [draft, setDraft] = React.useState(() => String(targetPrice));
  const value = Number(draft);
  const valid = Number.isFinite(value) && value > 0;
  const space = valid ? targetSpace(value) : null;
  const progress = valid ? targetProgress(value) : null;
  const adjust = (delta) => {
    const current = Number(draft);
    setDraft(String(Math.max(0, (Number.isFinite(current) ? current : 0) + delta).toFixed(2)));
  };

  return (
    <ActionModalCard
      title="编辑目标价"
      closeLabel="关闭目标价编辑"
      onClose={onCancel}
      showGrabber
      widthClassName="w-[calc(100vw-38px)] max-w-[372px]"
      actions={[
        { key: 'cancel', label: '取消', onClick: onCancel },
        { key: 'save', label: '保存目标价', disabled: !valid, onClick: () => onSave(value) },
      ]}
    >
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
        <StockLogo symbol="TSM" urls={stockLogoCandidates('TSM')} className="h-10 w-10 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-white/[0.78]">TSM <span className="ml-1 text-[12px] text-white/[0.38]">台积电</span></div>
          <div className="mt-1 text-[10px] text-white/[0.29]">当前收盘价 ${formatNumber(CURRENT_PRICE)}</div>
        </div>
      </div>

      <label className="mt-4 block text-[10.5px] text-white/[0.38]" htmlFor="watchlist-stock-target-price">目标价（USD）</label>
      <div className="mt-2 grid h-[50px] grid-cols-[46px_minmax(0,1fr)_46px] overflow-hidden rounded-xl border border-white/[0.09] bg-black/[0.28]">
        <button type="button" onClick={() => adjust(-1)} className="flex items-center justify-center border-r border-white/[0.07] text-white/[0.48] active:bg-white/[0.05]" aria-label="目标价减一美元"><Minus className="h-4 w-4" /></button>
        <div className="flex min-w-0 items-center px-3">
          <span className="mr-1.5 text-[14px] text-white/[0.28]">$</span>
          <input
            id="watchlist-stock-target-price"
            inputMode="decimal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-center text-[19px] font-normal text-white/[0.86] outline-none tabular-nums"
            style={{ fontFamily: NUMBER_FONT, WebkitMinLogicalWidth: '0px' }}
          />
        </div>
        <button type="button" onClick={() => adjust(1)} className="flex items-center justify-center border-l border-white/[0.07] text-white/[0.48] active:bg-white/[0.05]" aria-label="目标价加一美元"><Plus className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 grid grid-cols-2 divide-x divide-white/[0.07] rounded-xl border border-white/[0.06] bg-white/[0.025] py-3">
        <div className="px-3 text-center">
          <div className="text-[10px] text-white/[0.31]">距目标空间</div>
          <div className="mt-1.5 text-[15px] tabular-nums" style={{ color: space != null && space >= 0 ? MARKET_RED : MARKET_GREEN, fontFamily: NUMBER_FONT }}>{space == null ? '--' : signedPct(space)}</div>
        </div>
        <div className="px-3 text-center">
          <div className="text-[10px] text-white/[0.31]">成本至目标进度</div>
          <div className="mt-1.5 text-[15px] text-[#f6b54b] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{progress == null ? '--' : `${progress.toFixed(1)}%`}</div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#f6b54b]/10 bg-[#f6b54b]/[0.035] px-3 py-2.5 text-[10.5px] leading-4 text-white/[0.36]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f6b54b]/65" />
        目标价只保存个人计划，不修改持仓、正式交易记录或比赛账本。
      </div>
    </ActionModalCard>
  );
}

export default function WatchlistStockDetailPrototype() {
  const previewParams = React.useMemo(() => (
    typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  ), []);
  const initialEditorOpen = previewParams.get('targetEditor') === '1';
  const initialChartTooltipOpen = previewParams.get('chartTooltip') === '1';
  const requestedRange = previewParams.get('chartRange');
  const [range, setRange] = React.useState(() => (
    Object.hasOwn(RANGE_SERIES, requestedRange) ? requestedRange : '5y'
  ));
  const [targetPrice, setTargetPrice] = React.useState(500);
  const [showTargetEditor, setShowTargetEditor] = React.useState(initialEditorOpen);
  const gap = targetSpace(targetPrice);
  const progress = targetProgress(targetPrice);
  const progressPosition = Math.max(0, Math.min(100, progress ?? 0));

  React.useEffect(() => {
    const focusSection = previewParams.get('focusSection');
    if (!focusSection) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-prototype-section="${focusSection}"]`)?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [previewParams]);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#05070b] text-white" data-watchlist-stock-detail-prototype="phase-1" style={{ fontFamily: PAGE_FONT }}>
      <main className="mx-auto min-h-[100dvh] w-full max-w-[430px] pb-[calc(env(safe-area-inset-bottom)+86px)]" data-prototype-width="home">
        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#05070b]/92 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
          <div className="grid h-10 grid-cols-[40px_minmax(0,1fr)_40px] items-center">
            <button type="button" onClick={() => window.history.back()} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.045] text-white/[0.66] active:scale-95" aria-label="返回">
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
            <h1 className="text-center text-[17px] font-normal tracking-[0.02em] text-white/[0.88]">股票趋势</h1>
            <div aria-hidden="true" />
          </div>
        </header>

        <section className="mt-3 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]" data-prototype-header-chart="full-width">
          <div className="flex min-w-0 items-center gap-3">
            <StockLogo symbol="TSM" urls={stockLogoCandidates('TSM')} className="h-11 w-11 rounded-[11px]" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-[18px] font-normal text-white/[0.9]">TSM</span>
                <span className="truncate text-[13px] text-white/[0.45]">台积电</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[9.5px] text-white/[0.29]">
                <span className="rounded-md bg-white/[0.045] px-1.5 py-0.5">美股</span>
                <span className="rounded-md bg-white/[0.045] px-1.5 py-0.5">半导体</span>
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.035] px-2 py-1 text-[9px] text-white/[0.34]">普通收盘</div>
          </div>

          <div className="mt-4" data-prototype-price-summary="inline">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
              <span className="text-[29px] font-normal leading-none tracking-[-0.02em] text-white/[0.92]">${formatNumber(CURRENT_PRICE)}</span>
              <span className="text-[15px]" style={{ color: MARKET_GREEN }}>-2.77%</span>
              <span className="text-[13px] opacity-75" style={{ color: MARKET_GREEN }}>(-11.37)</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9.5px] text-white/[0.31]">
              <span>7/17 收盘</span><span aria-hidden="true">·</span><span>美东时间</span><span aria-hidden="true">·</span><span>USD</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-1" data-prototype-chart-ranges="five">
            {Object.keys(RANGE_SERIES).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={`h-8 rounded-lg px-1.5 text-[10.5px] transition active:scale-95 ${range === item ? 'border border-[#f6b54b]/20 bg-[#f6b54b]/[0.11] text-[#ffd18a]' : 'border border-transparent text-white/[0.34]'}`}
              >
                {RANGE_LABELS[item]}
              </button>
            ))}
          </div>

          <div className="mt-2 min-w-0" data-prototype-chart-row="full-width">
            <PriceChart range={range} initialTooltipOpen={initialChartTooltipOpen} />
          </div>

          <div className="mt-1 flex items-center justify-center gap-6 text-[9.5px] text-white/[0.4]" data-prototype-chart-legend={range === '5y' ? 'price-weekly-ma' : 'price-daily-ma'}>
            <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 rounded-full bg-[#22c55e]" />股价</span>
            <span className="inline-flex items-center gap-1.5"><i className={`h-0.5 w-4 rounded-full ${range === '5y' ? 'bg-[#f6b54b]' : 'bg-[#60a5fa]'}`} />{range === '5y' ? 'MA200（周）' : 'MA200（日）'}</span>
          </div>
        </section>

        <section className="mt-3 scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]" data-prototype-key-metrics="spacious" data-prototype-section="weekly-ma">
          <div className="px-4 pb-2 pt-4">
            <h2 className="text-[15px] font-normal text-white/[0.82]">关键指标</h2>
          </div>
          <div className="grid grid-cols-3 gap-3 px-4 pb-4 pt-2" data-prototype-daily-metrics="borderless">
            <MetricCell label="距52周高点" value="-16.83%" detail="高点 479.00" color={MARKET_GREEN} />
            <MetricCell label="距MA200（日）" value="+13.63%" detail="日线 350.60" color={MARKET_RED} />
            <MetricCell label="距EMA30（日）" value="-6.84%" detail="日线 427.60" color={MARKET_GREEN} />
          </div>

          <div className="mx-4 mb-4 rounded-[14px] bg-[#f6b54b]/[0.055] px-4 py-3.5" data-watchlist-weekly-ma-panel="true">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="text-[13px] font-normal text-white/[0.76]">MA200（周）</h3>
              <span className="rounded-md bg-[#f6b54b]/[0.1] px-1.5 py-0.5 text-[8.5px] text-[#f6b54b]/75">芒格指标</span>
              <span className="ml-auto text-[9px] text-white/[0.28]">周收盘锁定</span>
            </div>

            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <div className="text-[9.5px] text-white/[0.32]">距200周均线</div>
                <div className="mt-1 text-[22px] font-normal text-[#ff4b1f] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>+117.47%</div>
              </div>
              <div className="pb-0.5 text-right">
                <div className="text-[12px] text-[#ff4b1f]/90">长期趋势上方</div>
                <div className="mt-1 text-[9px] text-white/[0.27]">基于已完成交易周</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4">
              <div><div className="text-[8.5px] text-white/[0.27]">200周均线</div><div className="mt-1 text-[11.5px] text-white/[0.65] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>$183.18</div></div>
              <div className="text-center"><div className="text-[8.5px] text-white/[0.27]">近4周变化</div><div className="mt-1 text-[11.5px] text-[#ff4b1f]/85 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>+3.95%</div></div>
              <div className="text-right"><div className="text-[8.5px] text-white/[0.27]">连续状态</div><div className="mt-1 text-[11.5px] text-white/[0.65]">上方 142 周</div></div>
            </div>

            <div className="mt-3.5 text-[8.5px] text-white/[0.22]">更新至 7/17 周收盘 · 200周数据完整</div>
          </div>
        </section>

        <section className="mt-3 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
          <SectionHeading title="我的持仓" trailing="更新于 7/17 收盘" />
          <div className="px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[10.5px] text-white/[0.35]">持仓市值（USD）</div>
                <div className="mt-1.5 text-[25px] font-normal text-white/[0.88] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>101,405.00</div>
              </div>
              <div className="pb-0.5 text-right">
                <div className="text-[10.5px] text-white/[0.35]">当前盈亏</div>
                <div className="mt-1 text-[14px] tabular-nums" style={{ color: MARKET_RED, fontFamily: NUMBER_FONT }}>+$3,755.00</div>
                <div className="mt-0.5 text-[10.5px] tabular-nums" style={{ color: MARKET_RED, fontFamily: NUMBER_FONT }}>+3.84%</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.06] pt-3">
              <div className="pr-3"><div className="text-[9.5px] text-white/[0.31]">持仓数量</div><div className="mt-1.5 text-[13px] text-white/[0.72] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>500 股</div></div>
              <div className="px-3"><div className="text-[9.5px] text-white/[0.31]">平均成本</div><div className="mt-1.5 text-[13px] text-white/[0.72] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>$195.30</div></div>
              <div className="pl-3"><div className="text-[9.5px] text-white/[0.31]">仓位占比</div><div className="mt-1.5 text-[13px] text-white/[0.72] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>12.68%</div></div>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.055]"><div className="h-full rounded-full bg-[#f6b54b]/80" style={{ width: '12.68%' }} /></div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setShowTargetEditor(true)}
          className="mt-3 block w-full scroll-mt-20 overflow-hidden rounded-2xl border border-[#f6b54b]/15 bg-[#0b0f14] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
          data-prototype-section="target"
          aria-label="编辑目标价"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-normal text-white/[0.82]">目标价</h2>
              <span className="rounded-md border border-[#f6b54b]/15 bg-[#f6b54b]/[0.055] px-1.5 py-0.5 text-[9px] text-[#f6b54b]/75">个人计划</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-white/[0.32]"><Pencil className="h-3 w-3" />编辑<ChevronRight className="h-3.5 w-3.5" /></div>
          </div>
          <div className="px-4 py-4">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <div className="text-[10px] text-white/[0.33]">单一目标价（USD）</div>
                <div className="mt-1.5 text-[27px] font-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>${formatNumber(targetPrice)}</div>
              </div>
              <div className="pb-1 text-right">
                <div className="text-[10px] text-white/[0.33]">距目标空间</div>
                <div className="mt-1 text-[16px] tabular-nums" style={{ color: gap >= 0 ? MARKET_RED : MARKET_GREEN, fontFamily: NUMBER_FONT }}>{signedPct(gap)}</div>
              </div>
            </div>
            <div className="mt-5">
              <div className="relative h-1.5 rounded-full bg-gradient-to-r from-[#36c49a] via-[#f6b54b] to-[#ff4b1f]">
                <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#f6b54b] shadow-[0_0_11px_rgba(246,181,75,0.55)]" style={{ left: `${progressPosition}%` }} />
              </div>
              <div className="mt-2 grid grid-cols-3 text-[9.5px] text-white/[0.29]">
                <span>成本 ${formatNumber(AVG_COST)}</span>
                <span className="text-center text-[#f6b54b]/75">当前 ${formatNumber(CURRENT_PRICE)}</span>
                <span className="text-right">目标 ${formatNumber(targetPrice)}</span>
              </div>
              <div className="mt-3 text-right text-[10px] text-white/[0.3]">成本至目标进度 <span className="ml-1 text-white/[0.58] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{progress == null ? '--' : `${progress.toFixed(1)}%`}</span></div>
            </div>
          </div>
        </button>

        <section className="mt-3 scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]" data-prototype-section="events">
          <SectionHeading title="关键事件" trailing="自动读取" />
          <div className="grid grid-cols-3 divide-x divide-white/[0.06] px-1 py-4">
            <div className="px-3 text-center"><CalendarDays className="mx-auto h-4 w-4 text-white/[0.35]" /><div className="mt-2 text-[9.5px] text-white/[0.3]">下次财报</div><div className="mt-1 text-[13px] text-white/[0.72] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>8/28</div><div className="mt-0.5 text-[9px] text-white/[0.25]">预计盘后</div></div>
            <div className="px-3 text-center"><Clock3 className="mx-auto h-4 w-4 text-white/[0.35]" /><div className="mt-2 text-[9.5px] text-white/[0.3]">距离财报</div><div className="mt-1 text-[13px] text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>42 天</div><div className="mt-0.5 text-[9px] text-white/[0.25]">2026 Q2</div></div>
            <div className="px-3 text-center"><TrendingUp className="mx-auto h-4 w-4 text-white/[0.35]" /><div className="mt-2 text-[9.5px] text-white/[0.3]">最近财报反应</div><div className="mt-1 text-[13px] tabular-nums" style={{ color: MARKET_RED, fontFamily: NUMBER_FONT }}>+7.32%</div><div className="mt-0.5 text-[9px] text-white/[0.25]">盘后涨幅</div></div>
          </div>
        </section>

        <section className="mt-3 scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]" data-prototype-section="trades">
          <SectionHeading title="最近交易记录" trailing="正式账本 · 只读" />
          <div className="divide-y divide-white/[0.055] px-4">
            {TRADES.map((trade) => {
              const buy = trade.side === '买入';
              return (
                <div key={trade.id} className="grid grid-cols-[88px_minmax(0,1fr)_96px] items-center gap-3 py-3">
                  <div><div className="text-[12px]" style={{ color: buy ? MARKET_RED : MARKET_GREEN }}>{trade.side}</div><div className="mt-1 text-[9.5px] text-white/[0.27] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{trade.date}</div></div>
                  <div className="text-right"><div className="text-[11.5px] text-white/[0.61] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{trade.shares} 股</div><div className="mt-1 text-[9.5px] text-white/[0.27] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>@ ${formatNumber(trade.price)}</div></div>
                  <div className="text-right text-[11.5px] text-white/[0.62] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{trade.amount > 0 ? '+' : '-'}${formatNumber(Math.abs(trade.amount))}</div>
                </div>
              );
            })}
          </div>
        </section>

        <p className="mt-4 text-center text-[9px] tracking-[0.06em] text-white/[0.16]">HTML 视觉原型 · 不连接真实账户</p>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.09] bg-[#070a0f]/95 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} data-prototype-bottom-tabs="five">
        <div className="mx-auto grid h-[58px] max-w-[430px] grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === 'home';
            return (
              <button key={item.id} type="button" className={`flex flex-col items-center justify-center gap-1 ${active ? 'text-[#f6a524]' : 'text-white/[0.36]'}`}>
                <Icon className={`h-[19px] w-[19px] ${active ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
                <span className="text-[9.5px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showTargetEditor ? (
        <TargetEditor
          targetPrice={targetPrice}
          onCancel={() => setShowTargetEditor(false)}
          onSave={(nextTarget) => {
            setTargetPrice(Number(nextTarget.toFixed(2)));
            setShowTargetEditor(false);
          }}
        />
      ) : null}
    </div>
  );
}
