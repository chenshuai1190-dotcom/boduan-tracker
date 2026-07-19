import React from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  Info,
  Minus,
  Pencil,
  Plus,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';

const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif';
const MARKET_RED = '#ff4b1f';
const MARKET_GREEN = '#22c55e';
const SOFT_GOLD = '#ffd18a';
const CURRENT_PRICE = 202.81;
const AVG_COST = 195.3;

const RANGE_SERIES = {
  '1m': {
    labels: ['06/17', '06/25', '07/02', '07/10', '07/17'],
    values: [181.2, 187.8, 197.6, 192.4, 202.8, 211.7, 208.9, 219.4, 225.1, 217.3, 231.8, 225.7, 212.1, 220.6, 216.4, 224.8, 218.6, 214.2, 202.81],
  },
  '3m': {
    labels: ['04/17', '05/09', '06/02', '06/25', '07/17'],
    values: [146.4, 151.7, 158.6, 154.2, 163.8, 172.4, 169.1, 181.3, 188.6, 184.9, 196.4, 205.7, 198.8, 214.3, 209.7, 224.2, 217.1, 202.81],
  },
  '6m': {
    labels: ['01/17', '03/03', '04/15', '06/02', '07/17'],
    values: [138.2, 132.7, 146.1, 141.8, 153.4, 149.6, 160.8, 156.1, 169.7, 176.5, 171.4, 184.2, 193.8, 188.1, 207.5, 216.3, 202.81],
  },
  '1y': {
    labels: ['07/17', '10/17', '01/17', '04/17', '07/17'],
    values: [116.4, 123.8, 119.1, 136.2, 131.7, 149.8, 142.4, 158.1, 151.6, 168.9, 162.3, 179.4, 171.2, 188.5, 181.7, 211.8, 202.81],
  },
};

const RANGE_DATE_BOUNDS = {
  '1m': ['2026-06-17', '2026-07-17'],
  '3m': ['2026-04-17', '2026-07-17'],
  '6m': ['2026-01-17', '2026-07-17'],
  '1y': ['2025-07-17', '2026-07-17'],
};

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
  if (!(target > AVG_COST) || CURRENT_PRICE <= AVG_COST) return null;
  return Math.max(0, Math.min(100, ((CURRENT_PRICE - AVG_COST) / (target - AVG_COST)) * 100));
}

function chartGeometry(values) {
  const width = 340;
  const height = 148;
  const left = 8;
  const right = 40;
  const top = 8;
  const bottom = 24;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(1, high - low);
  const min = low - span * 0.12;
  const max = high + span * 0.12;
  const points = values.map((value, index) => ({
    x: left + (index / Math.max(1, values.length - 1)) * plotWidth,
    y: top + ((max - value) / (max - min)) * plotHeight,
    value,
  }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${points.at(-1).x.toFixed(2)} ${(top + plotHeight).toFixed(2)} L ${points[0].x.toFixed(2)} ${(top + plotHeight).toFixed(2)} Z`;
  const priceLines = [0, 0.5, 1].map((ratio) => ({
    y: top + ratio * plotHeight,
    value: max - ratio * (max - min),
  }));
  return { width, height, left, right, top, bottom, plotWidth, plotHeight, points, linePath, areaPath, priceLines };
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
  const series = RANGE_SERIES[range] || RANGE_SERIES['1m'];
  const chart = chartGeometry(series.values);
  const last = chart.points.at(-1);
  const chartRef = React.useRef(null);
  const activePointerIdRef = React.useRef(null);
  const previousRangeRef = React.useRef(range);
  const [selectedIndex, setSelectedIndex] = React.useState(() => (
    initialTooltipOpen ? Math.round((series.values.length - 1) * 0.78) : null
  ));
  const selectedPoint = Number.isInteger(selectedIndex) ? chart.points[selectedIndex] || null : null;
  const selectedValue = selectedPoint?.value;
  const previousValue = selectedIndex > 0 ? series.values[selectedIndex - 1] : null;
  const selectedChange = Number.isFinite(selectedValue) && Number.isFinite(previousValue)
    ? selectedValue - previousValue
    : null;
  const selectedChangePct = selectedChange != null && previousValue > 0
    ? (selectedChange / previousValue) * 100
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
    setSelectedIndex(Math.round(ratio * Math.max(0, chart.points.length - 1)));
  }, [chart.left, chart.plotWidth, chart.points.length, chart.width]);

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
      aria-label="查看 NVDA 股价走势"
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
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-[148px] w-full overflow-visible" role="img" aria-label={`${range} 普通收盘价走势`}>
        <defs>
          <linearGradient id="watchlist-stock-price-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={MARKET_GREEN} stopOpacity="0.26" />
            <stop offset="100%" stopColor={MARKET_GREEN} stopOpacity="0" />
          </linearGradient>
          <filter id="watchlist-stock-price-glow" x="-20%" y="-35%" width="140%" height="170%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {chart.priceLines.map((line) => (
          <g key={line.y}>
            <line x1={chart.left} x2={chart.width - chart.right + 2} y1={line.y} y2={line.y} stroke="rgba(255,255,255,0.055)" strokeDasharray="2 4" />
            <text x={chart.width - 1} y={line.y + 3} textAnchor="end" fill="rgba(255,255,255,0.28)" fontSize="8.5" style={{ fontFamily: NUMBER_FONT }}>{Math.round(line.value)}</text>
          </g>
        ))}
        <path d={chart.areaPath} fill="url(#watchlist-stock-price-area)" />
        <path d={chart.linePath} fill="none" stroke={MARKET_GREEN} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" filter="url(#watchlist-stock-price-glow)" />
        <circle cx={last.x} cy={last.y} r="3" fill={MARKET_GREEN} stroke="#d6fff0" strokeWidth="0.7" />
        {selectedPoint ? (
          <g aria-hidden="true">
            <line x1={selectedPoint.x} x2={selectedPoint.x} y1={chart.top} y2={chart.height - chart.bottom} stroke="rgba(255,255,255,0.24)" strokeWidth="0.8" strokeDasharray="3 3" />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="8" fill="#f6b54b" opacity="0.13" />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="3.8" fill="#05070b" stroke="#ffd18a" strokeWidth="1.25" />
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
          className={`pointer-events-none absolute top-2 w-[174px] rounded-xl border border-white/10 bg-[#121821]/95 px-3 py-2.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.48)] backdrop-blur ${selectedPoint.x > chart.width * 0.56 ? 'left-2' : 'right-2'}`}
        >
          <div className="text-[9px] text-white/[0.42]">{chartPointDate(range, selectedIndex, series.values.length)} · 普通收盘</div>
          <div className="mt-1 text-[18px] font-normal text-white/[0.88] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>${formatNumber(selectedValue)}</div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[9px]">
            <span className="text-white/[0.3]">当日涨跌</span>
            <span className="whitespace-nowrap tabular-nums" style={{ color: selectedColor, fontFamily: NUMBER_FONT }}>
              {selectedChange == null ? '--' : `${selectedChange >= 0 ? '+' : ''}${formatNumber(selectedChange)}  ${signedPct(selectedChangePct)}`}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCell({ label, value, detail, color = 'rgba(255,255,255,0.82)' }) {
  return (
    <div className="min-w-0 px-3 py-3">
      <div className="truncate text-[10.5px] text-white/[0.37]">{label}</div>
      <div className="mt-1.5 truncate text-[17px] font-normal tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>{value}</div>
      <div className="mt-1 truncate text-[10px] text-white/[0.29]">{detail}</div>
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
        <StockLogo symbol="NVDA" urls={stockLogoCandidates('NVDA')} className="h-10 w-10 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-white/[0.78]">NVDA <span className="ml-1 text-[12px] text-white/[0.38]">英伟达</span></div>
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
  const [range, setRange] = React.useState('1m');
  const [targetPrice, setTargetPrice] = React.useState(250);
  const [showTargetEditor, setShowTargetEditor] = React.useState(initialEditorOpen);
  const gap = targetSpace(targetPrice);
  const progress = targetProgress(targetPrice);

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
      <main className="mx-auto min-h-[100dvh] w-full max-w-[430px] pb-[calc(env(safe-area-inset-bottom)+28px)]" data-prototype-width="home">
        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#05070b]/92 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
          <div className="grid h-10 grid-cols-[40px_minmax(0,1fr)_40px] items-center">
            <button type="button" onClick={() => window.history.back()} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.045] text-white/[0.66] active:scale-95" aria-label="返回">
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
            <h1 className="text-center text-[17px] font-normal tracking-[0.02em] text-white/[0.88]">股票详情</h1>
            <div aria-hidden="true" />
          </div>
        </header>

        <section className="mt-3 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]" data-prototype-header-chart="full-width">
          <div className="flex min-w-0 items-center gap-3">
            <StockLogo symbol="NVDA" urls={stockLogoCandidates('NVDA')} className="h-11 w-11 rounded-[11px]" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-[18px] font-normal text-white/[0.9]">NVDA</span>
                <span className="truncate text-[13px] text-white/[0.45]">英伟达</span>
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
              <span className="text-[15px]" style={{ color: MARKET_GREEN }}>-2.21%</span>
              <span className="text-[13px] opacity-75" style={{ color: MARKET_GREEN }}>(-4.58)</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9.5px] text-white/[0.31]">
              <span>7/17 收盘</span><span aria-hidden="true">·</span><span>美东时间</span><span aria-hidden="true">·</span><span>USD</span>
            </div>
          </div>

          <div className="mt-3 min-w-0" data-prototype-chart-row="full-width">
            <PriceChart range={range} initialTooltipOpen={initialChartTooltipOpen} />
          </div>

          <div className="mt-1 grid grid-cols-4 gap-1 border-t border-white/[0.06] pt-2">
            {Object.keys(RANGE_SERIES).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={`h-7 rounded-lg px-1.5 text-[10px] transition active:scale-95 ${range === item ? 'bg-white/[0.08] text-white/[0.74]' : 'text-white/[0.3]'}`}
              >
                {item === '1m' ? '1月' : item === '3m' ? '3月' : item === '6m' ? '6月' : '1年'}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
          <div className="flex min-w-0 items-center gap-2 border-b border-white/[0.06] px-4 py-3.5">
            <h2 className="shrink-0 text-[15px] font-normal text-white/[0.82]">关键指标</h2>
            <span className="min-w-0 truncate text-[11px] text-[#f6b54b]/80">中期高于MA200 · 短期低于EMA30</span>
            <Info className="ml-auto h-3.5 w-3.5 shrink-0 text-white/[0.24]" />
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.06]">
            <MetricCell label="距52周高点" value="-14.16%" detail="高点 235.88" color={MARKET_GREEN} />
            <MetricCell label="距MA200" value="+12.40%" detail="MA200 180.34" color={MARKET_RED} />
            <MetricCell label="距EMA30" value="-3.25%" detail="EMA30 209.58" color={MARKET_GREEN} />
            <MetricCell label="20日年化波动率" value="23.4%" detail="基于普通收盘价" color={SOFT_GOLD} />
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
          className="mt-3 block w-full scroll-mt-20 overflow-hidden rounded-2xl border border-[#f6b54b]/15 bg-[#0b0f14] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] active:scale-[0.995]"
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
                <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#f6b54b] shadow-[0_0_11px_rgba(246,181,75,0.55)]" style={{ left: `${progress ?? 0}%` }} />
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
