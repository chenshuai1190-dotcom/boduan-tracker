import React from 'react';
import { ArrowLeft, BarChart3, ChevronDown, ChevronRight, Filter, RefreshCw, X } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import { buildPnlReportCloseSnapshotInput, buildPnlReportHistoricalSnapshots } from '../lib/pnlReportSnapshots.js';
import { buildPnlReportViewModel } from '../lib/pnlReportViewModel.js';

const REPORT_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const USD_CNY_FALLBACK = 7.2;
const PNL_REPORT_HISTORY_SNAPSHOT_COUNT = 45;
const PNL_REPORT_HISTORY_CLOSE_ROWS = PNL_REPORT_HISTORY_SNAPSHOT_COUNT + 1;
const PNL_CHART_WIDTH = 310;
const PNL_CHART_HEIGHT = 150;
const PNL_CHART_PAD = 10;
// Kept for controlled local/testing use; hidden from the product page for now.
const SHOW_PNL_REPORT_SNAPSHOT_REBUILD_CONTROLS = false;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

function signedPct(value, digits = 2) {
  const n = toNumber(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function alphaHex(alpha) {
  return Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
}

function signedCompactAmount(value, englishMode = false) {
  const n = toNumber(value);
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  if (englishMode) {
    if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}K`;
    return `${sign}${abs >= 100 ? abs.toFixed(0) : abs.toFixed(2)}`;
  }
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(2)}万`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}K`;
  return `${sign}${abs >= 100 ? abs.toFixed(0) : abs.toFixed(2)}`;
}

function displayName(row, englishMode) {
  if (!row) return '--';
  if (!englishMode) return row.name || row.symbol || '--';
  const map = {
    英伟达: 'NVIDIA',
    '谷歌-A': 'Alphabet',
    '3 倍做多纳指 ETF': 'TQQQ ETF',
    台积电: 'TSMC',
    微软: 'Microsoft',
  };
  return map[row.name] || row.name || row.symbol;
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function uniqueTradeSymbols(stockTrades = []) {
  return [...new Set((Array.isArray(stockTrades) ? stockTrades : [])
    .map((trade) => normalizeSymbol(trade?.symbol))
    .filter(Boolean))].sort();
}

function dateKeyToday() {
  return new Date().toISOString().slice(0, 10);
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDatePair(startDate, endDate) {
  if (!isDateKey(startDate) || !isDateKey(endDate)) return null;
  return startDate <= endDate
    ? { startDate, endDate }
    : { startDate: endDate, endDate: startDate };
}

function buildCalendarDays(monthLabelValue) {
  const [yearText, monthText] = String(monthLabelValue || '').split('/');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return [];
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}

function monthKeyFromLabel(monthLabelValue) {
  const [yearText, monthText] = String(monthLabelValue || '').split('/');
  return yearText && monthText ? `${yearText}-${monthText}` : '';
}

function monthDateKey(year, month) {
  const normalizedYear = String(year || '').padStart(4, '0');
  const normalizedMonth = String(month || '').padStart(2, '0');
  return `${normalizedYear}-${normalizedMonth}-01`;
}

function monthName(month, englishMode) {
  const index = Number(month) - 1;
  const zh = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (englishMode ? en : zh)[index] || '--';
}

function convertUsd(value, displayRate) {
  return toNumber(value) * displayRate;
}

function isRenderableChartValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function displayTooltipDate(dateKey, englishMode) {
  const [year, month, day] = String(dateKey || '').split('-');
  if (!year || !month || !day) return '--';
  const date = new Date(`${dateKey}T00:00:00Z`);
  const weekday = Number.isNaN(date.getTime()) ? null : date.getUTCDay();
  if (englishMode) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${names[weekday] || ''} ${Number(month)}/${Number(day)}/${year}`.trim();
  }
  const names = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${year}/${Number(month)}/${Number(day)} ${names[weekday] || ''}`.trim();
}

function nullableSignedPct(value, digits = 2) {
  return isRenderableChartValue(value) ? signedPct(value, digits) : '--';
}

function chartX(index, total, width = PNL_CHART_WIDTH, pad = PNL_CHART_PAD) {
  return pad + (index / Math.max(total - 1, 1)) * (width - pad * 2);
}

function buildLinePoints(points, key, width = PNL_CHART_WIDTH, height = PNL_CHART_HEIGHT, pad = PNL_CHART_PAD) {
  const validPoints = points
    .map((point, index) => ({ point, index, value: Number(point?.[key]) }))
    .filter(({ point }) => isRenderableChartValue(point?.[key]));
  if (!validPoints.length) return [];
  const values = validPoints.map(({ value }) => value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const fixedPctDomain = key !== 'assetUsd';
  const min = fixedPctDomain ? Math.min(rawMin, -0.1956) : rawMin;
  const max = fixedPctDomain ? Math.max(rawMax, 0.7848) : rawMax;
  const padding = fixedPctDomain ? 0 : Math.max((max - min) * 0.12, 1);
  const domainMin = min - padding;
  const domainMax = max + padding;
  const span = domainMax - domainMin || 1;
  return validPoints.map(({ point, index, value }) => {
    const x = chartX(index, points.length, width, pad);
    const y = pad + (1 - ((value - domainMin) / span)) * (height - pad * 2);
    return { point, index, value, x, y };
  });
}

function buildLinePathFromPoints(points) {
  return points.map(({ x, y }, pathIndex) => (
    `${pathIndex === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  )).join(' ');
}

function buildLinePath(points, key, width = PNL_CHART_WIDTH, height = PNL_CHART_HEIGHT, pad = PNL_CHART_PAD) {
  return buildLinePathFromPoints(buildLinePoints(points, key, width, height, pad));
}

function validPointCount(points, key) {
  return points.filter((point) => isRenderableChartValue(point?.[key])).length;
}

function buildAreaPath(linePath, width = PNL_CHART_WIDTH, height = PNL_CHART_HEIGHT, pad = PNL_CHART_PAD) {
  if (!linePath) return '';
  return `${linePath} L${width - pad} ${height - pad} L${pad} ${height - pad} Z`;
}

function SparkArea({ data, mode, color, language, marketColorMode, initialSelectedDate = '' }) {
  const englishMode = isEnglishLanguage(language);
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const chartRootRef = React.useRef(null);
  const primaryKey = mode === 'assets' ? 'assetUsd' : 'pnlPct';
  const hasBenchmark = data.some(point => Number.isFinite(Number(point?.benchmarkPct)));
  const showBenchmark = mode === 'pnl' && hasBenchmark;
  const primaryPoints = React.useMemo(() => buildLinePoints(data, primaryKey), [data, primaryKey]);
  const benchmarkPoints = React.useMemo(() => (showBenchmark ? buildLinePoints(data, 'benchmarkPct') : []), [data, showBenchmark]);
  const primaryPath = buildLinePathFromPoints(primaryPoints);
  const benchmarkPath = showBenchmark ? buildLinePathFromPoints(benchmarkPoints) : '';
  const areaPath = validPointCount(data, primaryKey) > 1 ? buildAreaPath(primaryPath) : '';
  const firstLabel = data[0]?.label || '--';
  const middleLabel = data[Math.floor(data.length / 2)]?.label || firstLabel;
  const lastLabel = data[data.length - 1]?.label || firstLabel;
  const pointSlots = React.useMemo(() => data.map((point, index) => ({
    point,
    index,
    x: chartX(index, data.length),
  })), [data]);
  const primaryByIndex = React.useMemo(() => new Map(primaryPoints.map((point) => [point.index, point])), [primaryPoints]);
  const benchmarkByIndex = React.useMemo(() => new Map(benchmarkPoints.map((point) => [point.index, point])), [benchmarkPoints]);
  const selectedSlot = selectedIndex == null ? null : pointSlots[selectedIndex] || null;
  const selectedPrimary = selectedSlot ? primaryByIndex.get(selectedSlot.index) || null : null;
  const selectedBenchmark = selectedSlot ? benchmarkByIndex.get(selectedSlot.index) || null : null;
  const selectedTooltipLeft = '50%';
  const selectedTooltipTop = '0px';

  React.useEffect(() => {
    setSelectedIndex(null);
  }, [data, mode]);

  React.useEffect(() => {
    if (!initialSelectedDate || mode !== 'pnl') return;
    const nextIndex = data.findIndex((point) => point?.date === initialSelectedDate);
    if (nextIndex >= 0) setSelectedIndex(nextIndex);
  }, [data, initialSelectedDate, mode]);

  React.useEffect(() => {
    if (selectedIndex == null) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!chartRootRef.current?.contains(event.target)) setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [selectedIndex]);

  const updateSelection = React.useCallback((event) => {
    if (mode !== 'pnl' || pointSlots.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) / rect.width) * PNL_CHART_WIDTH;
    let nextIndex = pointSlots[0].index;
    let nextDistance = Number.POSITIVE_INFINITY;
    pointSlots.forEach((slot) => {
      const distance = Math.abs(slot.x - x);
      if (distance < nextDistance) {
        nextDistance = distance;
        nextIndex = slot.index;
      }
    });
    setSelectedIndex(nextIndex);
  }, [mode, pointSlots]);

  const handlePointerDown = React.useCallback((event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateSelection(event);
  }, [updateSelection]);

  const handlePointerMove = React.useCallback((event) => {
    if (selectedIndex != null) updateSelection(event);
  }, [selectedIndex, updateSelection]);

  return (
    <div
      ref={chartRootRef}
      className="relative mt-3 h-[170px] select-none"
      data-pnl-report-chart-hit-area="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      style={{ touchAction: 'pan-y' }}
    >
      <svg viewBox="0 0 310 150" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="pnlReportArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[18, 50, 82, 114].map((y) => (
          <line key={y} x1="10" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.09)" strokeDasharray="3 4" />
        ))}
        {areaPath && <path d={areaPath} fill="url(#pnlReportArea)" />}
        {primaryPath && <path d={primaryPath} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
        {benchmarkPath && <path d={benchmarkPath} fill="none" stroke="#51a7ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.82" />}
        {selectedSlot && mode === 'pnl' && (
          <>
            <line
              x1={selectedSlot.x}
              y1="14"
              x2={selectedSlot.x}
              y2="132"
              stroke="rgba(255,255,255,0.28)"
              strokeDasharray="4 4"
            />
            {selectedPrimary && (
              <circle cx={selectedPrimary.x} cy={selectedPrimary.y} r="3.4" fill={color} stroke="#101318" strokeWidth="1.2" />
            )}
            {selectedBenchmark && (
              <circle cx={selectedBenchmark.x} cy={selectedBenchmark.y} r="3.4" fill="#51a7ff" stroke="#101318" strokeWidth="1.2" />
            )}
          </>
        )}
        <text x="300" y="21" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">78.48%</text>
        <text x="300" y="54" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">58.87%</text>
        <text x="300" y="87" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">39.26%</text>
        <text x="300" y="122" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">19.66%</text>
        <text x="10" y="146" fontSize="9" fill="rgba(255,255,255,0.38)">{firstLabel}</text>
        <text x="148" y="146" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.38)">{middleLabel}</text>
        <text x="300" y="146" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">{lastLabel}</text>
      </svg>
      {selectedSlot && mode === 'pnl' && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl bg-[#111820] px-4 py-3 text-left shadow-2xl backdrop-blur"
          data-pnl-report-compare-tooltip="true"
          style={{
            left: selectedTooltipLeft,
            top: selectedTooltipTop,
            width: 'calc(100% - 22px)',
          }}
        >
          <div className="grid grid-cols-[1fr_64px_64px] items-center gap-x-3 text-[12px] leading-5">
            <div className="truncate text-white/[0.78]">{displayTooltipDate(selectedSlot.point?.date, englishMode)}</div>
            <div className="text-right text-white/[0.46]">{t(language, 'pnlReport.tooltip.daily', '当日')}</div>
            <div className="text-right text-white/[0.46]">{t(language, 'pnlReport.tooltip.cumulative', '累计')}</div>
            <div className="mt-1 inline-flex min-w-0 items-center gap-1.5 text-white/[0.82]">
              <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="truncate">{t(language, 'pnlReport.mine', '我的')}</span>
            </div>
            <div className={`mt-1 text-right text-[12px] font-normal tabular-nums ${isRenderableChartValue(selectedSlot.point?.dailyPnlPct) ? marketTextClass(selectedSlot.point?.dailyPnlPct, marketColorMode) : 'text-white/[0.34]'}`} style={{ fontFamily: NUMBER_FONT }}>
              {nullableSignedPct(selectedSlot.point?.dailyPnlPct, 2)}
            </div>
            <div className={`mt-1 text-right text-[12px] font-normal tabular-nums ${isRenderableChartValue(selectedSlot.point?.pnlPct) ? marketTextClass(selectedSlot.point?.pnlPct, marketColorMode) : 'text-white/[0.34]'}`} style={{ fontFamily: NUMBER_FONT }}>
              {nullableSignedPct(selectedSlot.point?.pnlPct, 2)}
            </div>
            {showBenchmark && (
              <>
                <div className="mt-1 inline-flex min-w-0 items-center gap-1.5 text-white/[0.82]">
                  <i className="h-2 w-2 shrink-0 rounded-full bg-[#51a7ff]" />
                  <span className="truncate">{t(language, 'pnlReport.nasdaq', '纳斯达克')}</span>
                </div>
                <div className={`mt-1 text-right text-[12px] font-normal tabular-nums ${isRenderableChartValue(selectedSlot.point?.benchmarkDailyPct) ? marketTextClass(selectedSlot.point?.benchmarkDailyPct, marketColorMode) : 'text-white/[0.34]'}`} style={{ fontFamily: NUMBER_FONT }}>
                  {nullableSignedPct(selectedSlot.point?.benchmarkDailyPct, 2)}
                </div>
                <div className={`mt-1 text-right text-[12px] font-normal tabular-nums ${isRenderableChartValue(selectedSlot.point?.benchmarkPct) ? marketTextClass(selectedSlot.point?.benchmarkPct, marketColorMode) : 'text-white/[0.34]'}`} style={{ fontFamily: NUMBER_FONT }}>
                  {nullableSignedPct(selectedSlot.point?.benchmarkPct, 2)}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RangePill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-normal transition active:scale-95 ${
        active
          ? 'border border-[#f6b54b]/55 bg-[#f6b54b]/16 text-[#ffd18a]'
          : 'border border-white/10 bg-white/[0.055] text-white/[0.46]'
      }`}
    >
      {children}
    </button>
  );
}

function SegmentButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-normal transition active:scale-95 ${
        active ? 'bg-white/[0.68] text-[#101318]' : 'text-white/[0.42]'
      }`}
    >
      {children}
    </button>
  );
}

function CalendarSegmentButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-7 min-w-0 items-center justify-center rounded-full px-2 text-[11px] font-normal transition active:scale-95 ${
        active ? 'bg-white/[0.68] text-[#101318]' : 'bg-transparent text-white/[0.42]'
      }`}
    >
      {children}
    </button>
  );
}

export default function PnlReportPage({ ctx = {} }) {
  const {
    closePnlReport,
    db,
    fetchPnlBenchmarkRows,
    investmentSummary,
    language = 'zh',
    marketColorMode,
    pnlReportTooltipDate = '',
    quoteRows,
    stockTrades,
    supabase,
    usdRate,
    user,
  } = ctx;
  const englishMode = isEnglishLanguage(language);
  const [reportCurrencyMode, setReportCurrencyMode] = React.useState('CNY');
  const [currencyMenuOpen, setCurrencyMenuOpen] = React.useState(false);
  const displayCurrency = reportCurrencyMode === 'USD' ? 'USD' : 'CNY';
  const displayRate = displayCurrency === 'CNY' ? (toNumber(usdRate) || toNumber(investmentSummary?.usdRate) || USD_CNY_FALLBACK) : 1;
  const [range, setRange] = React.useState('ytd');
  const [customRange, setCustomRange] = React.useState(null);
  const [dateFilterOpen, setDateFilterOpen] = React.useState(false);
  const [dateFilterMode, setDateFilterMode] = React.useState('single');
  const [draftDate, setDraftDate] = React.useState(dateKeyToday());
  const [draftStartDate, setDraftStartDate] = React.useState(dateKeyToday());
  const [draftEndDate, setDraftEndDate] = React.useState(dateKeyToday());
  const [chartMode, setChartMode] = React.useState('pnl');
  const [calendarMode, setCalendarMode] = React.useState('pnl');
  const [calendarView, setCalendarView] = React.useState('month');
  const [calendarDate, setCalendarDate] = React.useState(null);
  const [calendarPickerOpen, setCalendarPickerOpen] = React.useState(false);
  const [draftCalendarYear, setDraftCalendarYear] = React.useState('');
  const [draftCalendarMonth, setDraftCalendarMonth] = React.useState('01');
  const [rankMode, setRankMode] = React.useState('gain');
  const [portfolioSnapshots, setPortfolioSnapshots] = React.useState([]);
  const [symbolSnapshots, setSymbolSnapshots] = React.useState([]);
  const [baselineSymbolSnapshots, setBaselineSymbolSnapshots] = React.useState([]);
  const [rebuildState, setRebuildState] = React.useState(null);
  const [reportLoading, setReportLoading] = React.useState(false);
  const [reportError, setReportError] = React.useState('');
  const [reportMessage, setReportMessage] = React.useState('');
  const [rebuilding, setRebuilding] = React.useState(false);
  const [benchmarkRows, setBenchmarkRows] = React.useState([]);
  const [benchmarkLoading, setBenchmarkLoading] = React.useState(false);
  const [benchmarkError, setBenchmarkError] = React.useState('');
  const loadReportSnapshots = React.useCallback(async () => {
    if (!db?.fetchPnlReportSnapshots) return;
    setReportLoading(true);
    setReportError('');
    try {
      const snapshots = await db.fetchPnlReportSnapshots(null, 370);
      setPortfolioSnapshots(snapshots);
      const state = db.fetchPnlReportRebuildState ? await db.fetchPnlReportRebuildState() : null;
      setRebuildState(state);
    } catch (error) {
      setReportError(error?.message || String(error));
    } finally {
      setReportLoading(false);
    }
  }, [db]);

  React.useEffect(() => {
    loadReportSnapshots();
  }, [loadReportSnapshots, user?.id]);

  const reportData = React.useMemo(() => buildPnlReportViewModel({
    portfolioSnapshots,
    symbolSnapshots,
    baselineSymbolSnapshots,
    stockTrades,
    benchmarkRows,
    benchmarkSymbol: 'QQQ',
    range,
    customRange,
    calendarDate,
  }), [baselineSymbolSnapshots, benchmarkRows, calendarDate, customRange, portfolioSnapshots, range, stockTrades, symbolSnapshots]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadSymbolSnapshotsForReport() {
      if (!db?.fetchPnlReportSymbolSnapshots || !reportData.snapshotDate) {
        setSymbolSnapshots([]);
        setBaselineSymbolSnapshots([]);
        return;
      }
      setSymbolSnapshots([]);
      setBaselineSymbolSnapshots([]);
      try {
        const [symbols, baselineSymbols] = await Promise.all([
          db.fetchPnlReportSymbolSnapshots(reportData.snapshotDate),
          reportData.baselineSnapshotDate
            ? db.fetchPnlReportSymbolSnapshots(reportData.baselineSnapshotDate)
            : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setSymbolSnapshots(symbols);
          setBaselineSymbolSnapshots(baselineSymbols);
        }
      } catch (error) {
        if (!cancelled) {
          setSymbolSnapshots([]);
          setBaselineSymbolSnapshots([]);
          setReportError(error?.message || String(error));
        }
      }
    }
    loadSymbolSnapshotsForReport();
    return () => {
      cancelled = true;
    };
  }, [db, reportData.baselineSnapshotDate, reportData.snapshotDate, user?.id]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadBenchmarkRows() {
      if (!reportData.hasData || (!supabase?.auth?.getSession && typeof fetchPnlBenchmarkRows !== 'function')) {
        setBenchmarkRows([]);
        setBenchmarkError('');
        return;
      }
      const from = reportData.benchmarkStartDate;
      const to = reportData.benchmarkEndDate;
      if (!from || !to || from === '--' || to === '--') return;
      setBenchmarkLoading(true);
      setBenchmarkError('');
      setBenchmarkRows([]);
      try {
        if (typeof fetchPnlBenchmarkRows === 'function') {
          const rows = await fetchPnlBenchmarkRows({ symbol: 'QQQ', from, to });
          if (!cancelled) setBenchmarkRows(Array.isArray(rows) ? rows : []);
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error(t(language, 'pnlReport.benchmarkAuthRequired', '请重新登录后读取基准行情'));
        const res = await fetch(`/api/pnl-benchmark?symbol=QQQ&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || body?.success === false) {
          throw new Error(body?.error || t(language, 'pnlReport.benchmarkFailed', '纳斯达克基准读取失败'));
        }
        if (!cancelled) setBenchmarkRows(Array.isArray(body?.rows) ? body.rows : []);
      } catch (error) {
        if (!cancelled) {
          setBenchmarkRows([]);
          setBenchmarkError(error?.message || String(error));
        }
      } finally {
        if (!cancelled) setBenchmarkLoading(false);
      }
    }
    loadBenchmarkRows();
    return () => {
      cancelled = true;
    };
  }, [fetchPnlBenchmarkRows, language, reportData.benchmarkEndDate, reportData.benchmarkStartDate, reportData.hasData, supabase, user?.id]);

  const handleRebuildToday = React.useCallback(async () => {
    if (!db?.upsertPnlReportSnapshots) return;
    setRebuilding(true);
    setReportError('');
    setReportMessage('');
    try {
      const trades = Array.isArray(stockTrades) ? stockTrades : [];
      if (trades.length === 0) throw new Error(t(language, 'pnlReport.noTrades', '交易账本为空,无法生成收益快照'));
      const lockedAt = new Date();
      const reportQuoteInput = buildPnlReportCloseSnapshotInput({
        quoteRows: Array.isArray(quoteRows) ? quoteRows : [],
        now: lockedAt,
      });
      const symbols = uniqueTradeSymbols(trades);
      if (symbols.length === 0) throw new Error(t(language, 'pnlReport.noTrades', '交易账本为空,无法生成收益快照'));
      if (!supabase?.auth?.getSession) throw new Error(t(language, 'pnlReport.benchmarkAuthRequired', '请重新登录后读取基准行情'));
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error(t(language, 'pnlReport.benchmarkAuthRequired', '请重新登录后读取基准行情'));
      const historyRes = await fetch(`/api/pnl-history-closes?symbols=${encodeURIComponent(symbols.join(','))}&to=${encodeURIComponent(reportQuoteInput.snapshotDate)}&days=${PNL_REPORT_HISTORY_CLOSE_ROWS}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const historyBody = await historyRes.json().catch(() => null);
      if (!historyRes.ok || historyBody?.success === false) {
        throw new Error(historyBody?.error || t(language, 'pnlReport.historyFailed', '历史收盘价读取失败'));
      }
      const builtHistory = buildPnlReportHistoricalSnapshots({
        stockTrades: trades,
        historicalClosesBySymbol: historyBody?.rowsBySymbol || {},
        quoteRows: Array.isArray(quoteRows) ? quoteRows : [],
        cashUsd: toNumber(investmentSummary?.cashUsd),
        toDate: reportQuoteInput.snapshotDate,
        maxSnapshots: PNL_REPORT_HISTORY_SNAPSHOT_COUNT,
        lockedAt: lockedAt.toISOString(),
        backfillMode: 'currentPositions',
      });
      if (builtHistory.snapshots.length === 0) {
        const missingSymbols = [...new Set(builtHistory.skippedDates.flatMap((item) => item.symbols || []))];
        throw new Error(`${t(language, 'pnlReport.quotesNotReady', '行情未就绪,缺少收盘价')}${missingSymbols.length ? `: ${missingSymbols.join(', ')}` : ''}`);
      }
      for (const built of builtHistory.snapshots) {
        await db.upsertPnlReportSnapshots(built);
      }
      if (db.clearPnlReportRebuildState) await db.clearPnlReportRebuildState();
      await loadReportSnapshots();
      setReportMessage(t(language, 'pnlReport.rebuildSuccess', '收盘收益快照已生成'));
    } catch (error) {
      setReportError(error?.message || String(error));
    } finally {
      setRebuilding(false);
    }
  }, [db, investmentSummary?.cashUsd, language, loadReportSnapshots, quoteRows, stockTrades, supabase]);

  const openDateFilter = React.useCallback(() => {
    const fallbackEnd = customRange?.endDate
      || reportData.benchmarkEndDate
      || portfolioSnapshots[0]?.snapshotDate
      || dateKeyToday();
    const fallbackStart = customRange?.startDate
      || reportData.benchmarkStartDate
      || fallbackEnd;
    const normalized = normalizeDatePair(fallbackStart, fallbackEnd) || {
      startDate: fallbackEnd,
      endDate: fallbackEnd,
    };
    const single = normalized.startDate === normalized.endDate;
    setDateFilterMode(single ? 'single' : 'range');
    setDraftDate(normalized.endDate);
    setDraftStartDate(normalized.startDate);
    setDraftEndDate(normalized.endDate);
    setDateFilterOpen(true);
  }, [customRange, portfolioSnapshots, reportData.benchmarkEndDate, reportData.benchmarkStartDate]);

  const confirmDateFilter = React.useCallback(() => {
    const normalized = dateFilterMode === 'single'
      ? normalizeDatePair(draftDate, draftDate)
      : normalizeDatePair(draftStartDate, draftEndDate);
    if (!normalized) return;
    setCustomRange(normalized);
    setRange('custom');
    setDateFilterOpen(false);
  }, [dateFilterMode, draftDate, draftEndDate, draftStartDate]);

  const positiveColor = marketHexColor(1, marketColorMode);
  const negativeColor = marketHexColor(-1, marketColorMode);
  const totalColor = marketHexColor(reportData.totalPnlUsd, marketColorMode);
  const reportTotal = convertUsd(reportData.totalPnlUsd, displayRate);
  const rangeItems = [
    ['month', t(language, 'pnlReport.range.month', '本月')],
    ['1m', t(language, 'pnlReport.range.1m', '近 1 月')],
    ['6m', t(language, 'pnlReport.range.6m', '近 6 月')],
    ['ytd', t(language, 'pnlReport.range.ytd', '本年')],
    ['1y', t(language, 'pnlReport.range.1y', '近 1 年')],
    ['all', t(language, 'pnlReport.range.all', '全部')],
  ];
  const customRangeIsSingleDay = customRange?.startDate && customRange.startDate === customRange.endDate;
  const customRangeLabel = customRangeIsSingleDay
    ? t(language, 'pnlReport.range.singleDay', '单日')
    : t(language, 'pnlReport.range.custom', '自定义');
  const calendarValues = new Map(reportData.calendar.map(item => [item.day, item]));
  const calendarDays = buildCalendarDays(reportData.selectedMonth);
  const yearCalendarValues = new Map((reportData.yearCalendar || []).map(item => [item.month, item]));
  const availableCalendarMonths = reportData.availableCalendarMonths || [];
  const availableCalendarYears = reportData.availableCalendarYears || [];
  const availableCalendarMonthSet = React.useMemo(() => new Set(availableCalendarMonths), [availableCalendarMonths]);
  const selectedCalendarMonthKey = monthKeyFromLabel(reportData.selectedMonth);
  const selectedCalendarYear = reportData.selectedYear || selectedCalendarMonthKey.slice(0, 4) || String(new Date().getFullYear());
  const calendarMagnitudeMax = Math.max(1, ...reportData.calendar.map((item) => {
    if (calendarMode === 'rate') return Math.abs(toNumber(item.rate));
    return Math.abs(convertUsd(item.valueUsd, displayRate));
  }));
  const yearCalendarMagnitudeMax = Math.max(1, ...(reportData.yearCalendar || []).map((item) => {
    if (calendarMode === 'rate') return Math.abs(toNumber(item.rate));
    return Math.abs(convertUsd(item.valueUsd, displayRate));
  }));
  const rankingRows = reportData.rankings[rankMode] || [];
  const hasBenchmarkTrend = reportData.trend.some(point => Number.isFinite(Number(point?.benchmarkPct)));
  const currentRangeLabel = range === 'custom'
    ? customRangeLabel
    : rangeItems.find(([id]) => id === range)?.[1] || t(language, 'pnlReport.range.all', '全部');
  const benchmarkActionLabel = reportData.outperformPct == null
    ? t(language, 'pnlReport.compare.vs', '对比')
    : reportData.outperformPct >= 0
      ? t(language, 'pnlReport.compare.outperform', '跑赢')
      : t(language, 'pnlReport.compare.underperform', '跑输');
  const benchmarkName = t(language, 'pnlReport.nasdaq', '纳斯达克');
  const benchmarkCompareLabel = englishMode
    ? `${currentRangeLabel} ${benchmarkActionLabel} ${benchmarkName}`
    : `${currentRangeLabel}${benchmarkActionLabel} ${benchmarkName}`;
  const rankingTitle = englishMode
    ? `${currentRangeLabel} ${t(language, 'pnlReport.rankingShort', 'P&L Ranking')}`
    : `${currentRangeLabel}${t(language, 'pnlReport.rankingShort', '盈亏排行榜')}`;
  const summaryTitle = englishMode
    ? `${currentRangeLabel} ${t(language, 'pnlReport.summaryShort', 'P&L Summary')}`
    : `${currentRangeLabel}${t(language, 'pnlReport.summaryShort', '盈亏总结')}`;
  const statusText = reportLoading
    ? t(language, 'pnlReport.loadingSnapshots', '正在读取收益快照')
    : reportError
      ? reportError
      : reportMessage || (rebuildState?.dirtyFromDate
        ? `${t(language, 'pnlReport.dirtyNotice', '交易已更新,建议重新生成快照')} · ${rebuildState.dirtyFromDate}`
        : reportData.hasData
          ? t(language, 'pnlReport.snapshotNotice', '当前页面读取数据库收盘收益快照。手动生成只更新最新已完成交易日快照,不影响交易页实时显示。')
          : range === 'custom'
            ? t(language, 'pnlReport.noSnapshotForRange', '所选日期没有收益快照。页面不会用其他日期数据替代。')
            : t(language, 'pnlReport.noSnapshotNotice', '暂无收益快照。先生成收盘快照后,页面会读取数据库里的真实报表数据。'));
  const firstAvailableMonthForYear = React.useCallback((year) => {
    const prefix = `${year}-`;
    return (availableCalendarMonths.find((month) => month.startsWith(prefix)) || `${year}-01`).slice(5, 7);
  }, [availableCalendarMonths]);
  const openCalendarPicker = React.useCallback(() => {
    const fallbackYear = selectedCalendarYear || availableCalendarYears.at(-1) || String(new Date().getFullYear());
    const fallbackMonth = selectedCalendarMonthKey.slice(5, 7) || firstAvailableMonthForYear(fallbackYear);
    setDraftCalendarYear(fallbackYear);
    setDraftCalendarMonth(fallbackMonth);
    setCalendarPickerOpen(true);
  }, [availableCalendarYears, firstAvailableMonthForYear, selectedCalendarMonthKey, selectedCalendarYear]);
  const confirmCalendarPicker = React.useCallback(() => {
    if (!draftCalendarYear) return;
    const month = draftCalendarMonth || firstAvailableMonthForYear(draftCalendarYear);
    setCalendarDate(monthDateKey(draftCalendarYear, month));
    setCalendarPickerOpen(false);
  }, [draftCalendarMonth, draftCalendarYear, firstAvailableMonthForYear]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-[#05070b] pb-[calc(env(safe-area-inset-bottom)+28px)] text-white/[0.86]" style={{ fontFamily: REPORT_FONT }}>
      <header className="sticky top-0 z-20 -mx-4 border-b border-white/10 bg-[#05070b]/88 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+4px)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={closePnlReport}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.72] transition active:scale-95"
            aria-label={t(language, 'pnlReport.back', '返回')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <h1 className="text-[17px] font-semibold leading-tight text-white/[0.86]">{t(language, 'pnlReport.title', '收益报表')}</h1>
            <div className="mt-0.5 text-[11px] text-white/[0.36]">
              Quote Data testing
            </div>
          </div>
          <button
            type="button"
            onClick={openDateFilter}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-95 ${
              range === 'custom'
                ? 'border-[#f6b54b]/55 bg-[#f6b54b]/14 text-[#ffd18a]'
                : 'border-white/10 bg-white/[0.055] text-white/[0.52]'
            }`}
            aria-label={t(language, 'pnlReport.filter', '筛选')}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
          {rangeItems.map(([id, label]) => (
            <RangePill key={id} active={range === id} onClick={() => {
              setRange(id);
              setCustomRange(null);
            }}>
              {label}
            </RangePill>
          ))}
          {range === 'custom' && (
            <RangePill active onClick={openDateFilter}>
              {customRangeLabel}
            </RangePill>
          )}
        </div>
      </header>

      <section className="pt-5 text-center">
        <div className="relative inline-flex flex-col items-center">
          <button
            type="button"
            onClick={() => setCurrencyMenuOpen((open) => !open)}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-semibold text-white/[0.86] transition active:scale-95"
            aria-expanded={currencyMenuOpen}
            aria-label={t(language, 'pnlReport.currencySwitch', '切换报表币种')}
          >
            <span>{t(language, 'pnlReport.totalPnl', '盈亏总额')} ({displayCurrency})</span>
            <ChevronDown className={`h-3.5 w-3.5 text-white/[0.38] transition ${currencyMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {currencyMenuOpen && (
            <div className="absolute left-1/2 top-full z-20 mt-2 w-28 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#10151c]/95 p-1 shadow-2xl backdrop-blur-xl">
              {['CNY', 'USD'].map((currency) => (
                <button
                  key={currency}
                  type="button"
                  onClick={() => {
                    setReportCurrencyMode(currency);
                    setCurrencyMenuOpen(false);
                  }}
                  className={`flex h-8 w-full items-center justify-center rounded-lg text-[12px] font-normal transition active:scale-95 ${
                    displayCurrency === currency
                      ? 'bg-[#f6b54b] text-[#101318]'
                      : 'text-white/[0.62] hover:bg-white/[0.06]'
                  }`}
                >
                  {currency}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 text-[35px] font-semibold leading-none tracking-normal tabular-nums" style={{ color: totalColor, fontFamily: NUMBER_FONT }}>
          {reportData.hasData ? signedCurrency(reportTotal, displayCurrency, 2) : '--'}
        </div>
        <div className={`mt-2 text-[15px] font-semibold tabular-nums ${marketTextClass(reportData.totalPnlPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
          {reportData.hasData ? signedPct(reportData.totalPnlPct, 2) : '--'}
        </div>
        <div className="mt-3 text-[12px] text-white/[0.38]">{reportData.startDate} - {reportData.endDate}</div>

        <div className="mx-auto mt-6 inline-flex rounded-full border border-white/10 bg-white/[0.055] p-1">
          <SegmentButton active={chartMode === 'pnl'} onClick={() => setChartMode('pnl')}>{t(language, 'pnlReport.pnlTrend', '收益率走势')}</SegmentButton>
          <SegmentButton active={chartMode === 'assets'} onClick={() => setChartMode('assets')}>{t(language, 'pnlReport.assetTrend', '总资产走势')}</SegmentButton>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-start text-[12px] text-white/[0.52]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: totalColor }} />{t(language, 'pnlReport.mine', '我的')}</span>
            {hasBenchmarkTrend && <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#51a7ff]" />{t(language, 'pnlReport.nasdaq', '纳斯达克')}</span>}
          </div>
        </div>
        <SparkArea
          data={reportData.trend}
          mode={chartMode}
          color={totalColor}
          language={language}
          marketColorMode={marketColorMode}
          initialSelectedDate={pnlReportTooltipDate}
        />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
          <div className="text-[12px] text-white/[0.46]">{t(language, 'pnlReport.turnover', '累计成交金额')} ({displayCurrency})</div>
          <div className="mt-3 text-[19px] font-semibold leading-none text-white/[0.86] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{reportData.hasData ? fmt(convertUsd(reportData.turnoverUsd, displayRate), 2) : '--'}</div>
          <div className="mt-2 text-[12px] text-white/[0.42]">{t(language, 'pnlReport.tradeStocks', '交易股票数')} {reportData.tradeStockCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
          <div className="text-[12px] leading-snug text-white/[0.46]">{benchmarkCompareLabel}</div>
          <div className={`mt-3 text-[20px] font-semibold leading-none tabular-nums ${reportData.outperformPct == null ? 'text-white/[0.36]' : marketTextClass(reportData.outperformPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
            {benchmarkLoading && reportData.outperformPct == null ? '--' : reportData.outperformPct == null ? '--' : signedPct(reportData.outperformPct, 2)}
          </div>
          {benchmarkError && <div className="mt-2 truncate text-[10px] text-white/[0.28]">{benchmarkError}</div>}
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white/[0.86]">{t(language, 'pnlReport.calendar', '收益日历')} ({displayCurrency})</h2>
          <ChevronRight className="h-4 w-4 text-white/[0.36]" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={openCalendarPicker}
            className="flex min-w-[76px] items-center gap-1.5 text-[15px] font-normal text-white/[0.86] transition active:scale-95"
          >
            {calendarView === 'year' ? selectedCalendarYear : reportData.selectedMonth}
            <ChevronDown className="h-3.5 w-3.5 text-white/[0.42]" />
          </button>
          <div className="grid min-w-[100px] grid-cols-2 rounded-full border border-white/10 bg-white/[0.055] p-1">
            <CalendarSegmentButton active={calendarView === 'year'} onClick={() => setCalendarView('year')}>{t(language, 'pnlReport.year', '年')}</CalendarSegmentButton>
            <CalendarSegmentButton active={calendarView === 'month'} onClick={() => setCalendarView('month')}>{t(language, 'pnlReport.month', '月')}</CalendarSegmentButton>
          </div>
          <div className="grid min-w-[116px] grid-cols-2 rounded-full border border-white/10 bg-white/[0.055] p-1">
            <CalendarSegmentButton active={calendarMode === 'pnl'} onClick={() => setCalendarMode('pnl')}>{t(language, 'pnlReport.pnl', '收益')}</CalendarSegmentButton>
            <CalendarSegmentButton active={calendarMode === 'rate'} onClick={() => setCalendarMode('rate')}>{t(language, 'pnlReport.pnlRate', '收益率')}</CalendarSegmentButton>
          </div>
        </div>
        {calendarView === 'month' ? (
          <>
            <div className="mt-5 grid grid-cols-7 text-center text-[12px] text-white/[0.54]">
              {['日', '一', '二', '三', '四', '五', '六'].map((day, index) => (
                <div key={day}>{englishMode ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][index] : day}</div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center">
              {calendarDays.map((day, index) => {
                const calendarItem = day ? calendarValues.get(day) : undefined;
                const valueUsd = calendarItem?.valueUsd;
                const rate = calendarItem?.rate;
                const hasValue = valueUsd != null || rate != null;
                const signedValue = calendarMode === 'rate' ? rate : valueUsd;
                const displayValue = calendarMode === 'rate' ? rate : convertUsd(valueUsd, displayRate);
                const magnitude = calendarMode === 'rate' ? Math.abs(toNumber(rate)) : Math.abs(toNumber(displayValue));
                const hasTint = hasValue && magnitude > 0.000001;
                const tileColor = marketHexColor(signedValue ?? 0, marketColorMode);
                const intensity = Math.min(1, magnitude / calendarMagnitudeMax);
                const tileStyle = hasTint
                  ? {
                    background: `linear-gradient(180deg, ${tileColor}${alphaHex(0.16 + intensity * 0.12)}, ${tileColor}${alphaHex(0.08 + intensity * 0.08)})`,
                    borderColor: `${tileColor}${alphaHex(0.16 + intensity * 0.12)}`,
                  }
                  : undefined;
                return (
                  <div
                    key={`${day || 'blank'}-${index}`}
                    className="flex h-[52px] flex-col items-center justify-center rounded-[10px] border border-transparent"
                    style={tileStyle}
                  >
                    {day && (
                      <>
                        <span className="text-[15px] font-normal text-white/[0.86]">{String(day).padStart(2, '0')}</span>
                        {hasValue && (
                          <span className={`mt-1 whitespace-nowrap text-[10px] font-normal tabular-nums ${marketTextClass(signedValue, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                            {calendarMode === 'rate'
                              ? (rate == null ? '--' : signedPct(rate, 2))
                              : signedCompactAmount(displayValue, englishMode)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mt-5 grid grid-cols-4 gap-1 text-center">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
              const calendarItem = yearCalendarValues.get(month);
              const valueUsd = calendarItem?.valueUsd;
              const rate = calendarItem?.rate;
              const hasValue = valueUsd != null || rate != null;
              const signedValue = calendarMode === 'rate' ? rate : valueUsd;
              const displayValue = calendarMode === 'rate' ? rate : convertUsd(valueUsd, displayRate);
              const magnitude = calendarMode === 'rate' ? Math.abs(toNumber(rate)) : Math.abs(toNumber(displayValue));
              const hasTint = hasValue && magnitude > 0.000001;
              const tileColor = marketHexColor(signedValue ?? 0, marketColorMode);
              const intensity = Math.min(1, magnitude / yearCalendarMagnitudeMax);
              const tileStyle = hasTint
                ? {
                  background: `linear-gradient(180deg, ${tileColor}${alphaHex(0.14 + intensity * 0.12)}, ${tileColor}${alphaHex(0.07 + intensity * 0.08)})`,
                }
                : undefined;
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => {
                    setCalendarDate(monthDateKey(selectedCalendarYear, month));
                    setCalendarView('month');
                  }}
                  className="flex h-[76px] flex-col items-center justify-center rounded-xl bg-white/[0.02] transition active:scale-[0.98]"
                  style={tileStyle}
                >
                  <span className="text-[14px] font-normal text-white/[0.86]">{monthName(month, englishMode)}</span>
                  {hasValue && (
                    <span className={`mt-1 whitespace-nowrap text-[11px] font-normal tabular-nums ${marketTextClass(signedValue, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                      {calendarMode === 'rate'
                        ? (rate == null ? '--' : signedPct(rate, 2))
                        : signedCompactAmount(displayValue, englishMode)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white/[0.86]">{summaryTitle} ({displayCurrency})</h2>
          <span className="text-[12px] text-white/[0.40]">{t(language, 'pnlReport.updatedAt', '更新至')}: {reportData.updatedAt}</span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-[13px] text-white/[0.62]">{t(language, 'pnlReport.stockPnl', '股票累计盈亏')}</div>
          <div className={`flex items-center gap-1 text-[17px] font-normal tabular-nums ${marketTextClass(reportData.summary.stockPnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
            {fmt(convertUsd(reportData.summary.stockPnlUsd, displayRate), 2)}<ChevronRight className="h-4 w-4 text-white/[0.30]" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]">
          <div className="min-h-[74px] p-3" style={{ background: `${positiveColor}F0` }}>
            <div className="text-[12px] text-white/[0.86]">{t(language, 'pnlReport.gain', '盈利')}</div>
            <div className="mt-2 text-[13px] text-white/[0.86]">{displayName(reportData.summary.best, englishMode)}{reportData.summary.best ? '.US' : ''}</div>
            <div className="text-[14px] tabular-nums text-white/[0.86]" style={{ fontFamily: NUMBER_FONT }}>
              {reportData.summary.best ? signedCurrency(convertUsd(reportData.summary.best.pnlUsd, displayRate), displayCurrency, 2) : '--'}
            </div>
          </div>
          <div className="min-h-[74px] p-3 text-right" style={{ background: `${negativeColor}D8` }}>
            <div className="text-[12px] text-white/[0.86]">{t(language, 'pnlReport.loss', '亏损')}</div>
            <div className="mt-2 text-[13px] text-white/[0.86]">{displayName(reportData.summary.worst, englishMode)}{reportData.summary.worst ? '.US' : ''}</div>
            <div className="text-[14px] tabular-nums text-white/[0.86]" style={{ fontFamily: NUMBER_FONT }}>
              {reportData.summary.worst ? signedCurrency(convertUsd(reportData.summary.worst.pnlUsd, displayRate), displayCurrency, 2) : '--'}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white/[0.86]">{rankingTitle} ({displayCurrency})</h2>
          <span className="text-[12px] text-white/[0.40]">{t(language, 'pnlReport.updatedAt', '更新至')}: {reportData.updatedAt}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.055] p-1">
          <SegmentButton active={rankMode === 'gain'} onClick={() => setRankMode('gain')}>{t(language, 'pnlReport.gainTop5', '盈利 Top5')}</SegmentButton>
          <SegmentButton active={rankMode === 'loss'} onClick={() => setRankMode('loss')}>{t(language, 'pnlReport.lossTop5', '亏损 Top5')}</SegmentButton>
        </div>
        <div className="mt-5 flex justify-between text-[12px] text-white/[0.40]">
          <span>{t(language, 'pnlReport.rank', '排行榜')}</span>
          <span>{t(language, 'pnlReport.pnlTotal', '盈亏总额')}</span>
        </div>
        <div className="mt-2 space-y-1.5">
          {rankingRows.length === 0 && (
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-3 text-center text-[12px] text-white/[0.36]">
              {t(language, 'pnlReport.noRankingRows', '暂无排行数据')}
            </div>
          )}
          {rankingRows.map((row, index) => {
            const displayValue = convertUsd(row.pnlUsd, displayRate);
            const color = marketHexColor(row.pnlUsd, marketColorMode);
            const width = `${Math.max(18, 96 - index * 12)}%`;
            return (
              <div key={row.symbol} className="relative overflow-hidden rounded-xl bg-white/[0.03] px-2.5 py-2">
                <div className="absolute inset-y-1 right-1 rounded-[10px]" style={{ width, background: color, opacity: 0.18 }} />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#f6b54b] text-[10px] font-semibold text-[#101318]">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-normal text-white/[0.86]">{displayName(row, englishMode)}</div>
                      <div className="text-[10px] text-white/[0.34]">US {row.symbol}</div>
                    </div>
                  </div>
                  <div className={`shrink-0 text-[13px] font-normal tabular-nums ${marketTextClass(row.pnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                    {signedCurrency(displayValue, displayCurrency, 2)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {SHOW_PNL_REPORT_SNAPSHOT_REBUILD_CONTROLS && (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-[12px] leading-5 text-white/[0.40]">
          <div className="flex items-start gap-3">
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-[#f6b54b]" />
            <div className="min-w-0 flex-1">{statusText}</div>
          </div>
          <button
            type="button"
            onClick={handleRebuildToday}
            disabled={rebuilding || reportLoading}
            className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[#f6b54b]/45 bg-[#f6b54b]/12 px-3 text-[12px] font-normal text-[#ffd18a] transition active:scale-95 disabled:opacity-45"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
            {rebuilding ? t(language, 'pnlReport.rebuilding', '生成中') : t(language, 'pnlReport.rebuildToday', '生成收盘快照')}
          </button>
        </div>
      )}

      {calendarPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/62 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-t-[26px] border border-white/10 bg-[#0b0f14] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-white/[0.86]">{t(language, 'pnlReport.calendarPickerTitle', '选择月份')}</h2>
              <button
                type="button"
                onClick={() => setCalendarPickerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.48] transition active:scale-95"
                aria-label={t(language, 'pnlReport.closeFilter', '关闭筛选')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {availableCalendarYears.length === 0 ? (
              <div className="mt-6 rounded-2xl bg-white/[0.04] px-4 py-5 text-center text-[12px] text-white/[0.36]">
                {t(language, 'pnlReport.noCalendarYears', '暂无可选择的快照年份')}
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                <div className="min-w-0">
                  <div className="mb-2 text-[12px] text-white/[0.42]">{t(language, 'pnlReport.selectYear', '年份')}</div>
                  <div className="max-h-[190px] space-y-1 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none]">
                    {availableCalendarYears.map((year) => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setDraftCalendarYear(year);
                          setDraftCalendarMonth(firstAvailableMonthForYear(year));
                        }}
                        className={`h-9 w-full rounded-xl text-[13px] font-normal transition active:scale-95 ${
                          draftCalendarYear === year
                            ? 'bg-white/[0.68] text-[#101318]'
                            : 'bg-white/[0.045] text-white/[0.58]'
                        }`}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="mb-2 text-[12px] text-white/[0.42]">{t(language, 'pnlReport.selectMonth', '月份')}</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => {
                      const monthKey = `${draftCalendarYear}-${month}`;
                      const enabled = availableCalendarMonthSet.has(monthKey);
                      return (
                        <button
                          key={month}
                          type="button"
                          disabled={!enabled}
                          onClick={() => setDraftCalendarMonth(month)}
                          className={`h-9 rounded-xl text-[12px] font-normal transition active:scale-95 disabled:active:scale-100 ${
                            draftCalendarMonth === month && enabled
                              ? 'bg-[#f6b54b] text-[#101318]'
                              : enabled
                                ? 'bg-white/[0.055] text-white/[0.62]'
                                : 'bg-white/[0.025] text-white/[0.18]'
                          }`}
                        >
                          {month}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={confirmCalendarPicker}
              disabled={availableCalendarYears.length === 0}
              className="mt-6 h-11 w-full rounded-2xl bg-[#f6b54b] text-[14px] font-semibold text-[#101318] shadow-[0_14px_30px_rgba(246,181,75,0.20)] transition active:scale-[0.98] disabled:opacity-45"
            >
              {t(language, 'pnlReport.confirmFilter', '确定')}
            </button>
          </div>
        </div>
      )}

      {dateFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/62 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-t-[26px] border border-white/10 bg-[#0b0f14] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-white/[0.86]">{t(language, 'pnlReport.dateFilterTitle', '时间筛选')}</h2>
              <button
                type="button"
                onClick={() => setDateFilterOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.48] transition active:scale-95"
                aria-label={t(language, 'pnlReport.closeFilter', '关闭筛选')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.055] p-1">
              <SegmentButton active={dateFilterMode === 'single'} onClick={() => setDateFilterMode('single')}>{t(language, 'pnlReport.singleDay', '单日')}</SegmentButton>
              <SegmentButton active={dateFilterMode === 'range'} onClick={() => setDateFilterMode('range')}>{t(language, 'pnlReport.dateRange', '区间')}</SegmentButton>
            </div>

            {dateFilterMode === 'single' ? (
              <div className="mt-5">
                <label className="text-[12px] text-white/[0.42]">{t(language, 'pnlReport.reportDate', '报表日期')}</label>
                <input
                  type="date"
                  value={draftDate}
                  onChange={(event) => setDraftDate(event.target.value)}
                  className="mt-2 block h-11 min-w-0 w-full max-w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-0 text-center text-[14px] font-normal leading-[44px] text-white/[0.86] outline-none [color-scheme:dark]"
                />
              </div>
            ) : (
              <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                <div className="min-w-0">
                  <label className="text-[12px] text-white/[0.42]">{t(language, 'pnlReport.startDate', '开始日期')}</label>
                  <input
                    type="date"
                    value={draftStartDate}
                    onChange={(event) => setDraftStartDate(event.target.value)}
                    className="mt-2 block h-11 min-w-0 w-full max-w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.055] px-2 py-0 text-center text-[13px] font-normal leading-[44px] text-white/[0.86] outline-none [color-scheme:dark]"
                  />
                </div>
                <div className="mb-3 text-[14px] text-white/[0.30]">-</div>
                <div className="min-w-0">
                  <label className="text-[12px] text-white/[0.42]">{t(language, 'pnlReport.endDate', '结束日期')}</label>
                  <input
                    type="date"
                    value={draftEndDate}
                    onChange={(event) => setDraftEndDate(event.target.value)}
                    className="mt-2 block h-11 min-w-0 w-full max-w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.055] px-2 py-0 text-center text-[13px] font-normal leading-[44px] text-white/[0.86] outline-none [color-scheme:dark]"
                  />
                </div>
              </div>
            )}

            <div className="mt-4 px-1 text-[11px] leading-4 text-white/[0.32]">
              {t(language, 'pnlReport.dateFilterHint', '只读取已有数据，没有快照的日期不会使用其他日期替代。')}
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={confirmDateFilter}
                className="h-11 w-full rounded-2xl bg-[#f6b54b] text-[14px] font-semibold text-[#101318] shadow-[0_14px_30px_rgba(246,181,75,0.20)] transition active:scale-[0.98]"
              >
                {t(language, 'pnlReport.confirmFilter', '确定')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
