import React from 'react';
import { ArrowLeft, BarChart3, ChevronDown } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { isEnglishLanguage } from '../lib/i18n.js';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import {
  buildChartDomain,
  buildLinePathFromPoints,
  buildLinePoints,
  chartX,
  isRenderableChartValue,
} from '../lib/pnlReportChart.js';
import { buildStockPnlReportViewModel } from '../lib/stockPnlReportViewModel.js';
import PnlReportTrendChart from '../components/PnlReportTrendChart.jsx';
import { PnlReportCalendarPicker } from '../components/PnlReportFilters.jsx';
import './PnlReportPage.css';
import './StockPnlReportPage.css';

const REPORT_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const USD_CNY_FALLBACK = 7.2;
const BENCHMARK_COLOR = '#789ac0';
const PRICE_BENCHMARKS = {
  QQQ: { zh: '纳斯达克100 ETF', en: 'Nasdaq-100 ETF' },
  SPY: { zh: '标普500 ETF', en: 'S&P 500 ETF' },
  VGT: { zh: '信息技术 ETF', en: 'Information Technology ETF' },
};
const CHART_WIDTH = 310;
const CHART_HEIGHT = 210;
const CHART_PAD = 8;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value, digits = 2) {
  return finite(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signedCurrency(value, currency = 'USD') {
  if (!isRenderableChartValue(value)) return '--';
  const n = Number(value);
  return `${n >= 0 ? '+' : '-'}${currency === 'CNY' ? '¥' : '$'}${formatNumber(Math.abs(n))}`;
}

function signedPercent(value) {
  if (!isRenderableChartValue(value)) return '--';
  const n = Number(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function compactAmount(value, englishMode) {
  if (!isRenderableChartValue(value)) return '--';
  const n = Number(value);
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  if (!englishMode && abs >= 10000) return `${sign}${(abs / 10000).toFixed(2)}万`;
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}K`;
  return `${sign}${abs >= 100 ? abs.toFixed(0) : abs.toFixed(2)}`;
}

function alphaHex(alpha) {
  return Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function calendarDays(monthLabel) {
  const [year, month] = String(monthLabel || '').split('/').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return [];
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [...Array.from({ length: firstDay }, () => null), ...Array.from({ length: count }, (_, i) => i + 1)];
}

function monthDateKey(year, month) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

function monthLabel(month, englishMode) {
  const zh = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (englishMode ? en : zh)[Number(month) - 1] || '--';
}

function RangeButton({ active, children, onClick }) {
  return <button type="button" onClick={onClick} className="pnl-report-range" aria-pressed={active}>{children}</button>;
}

function SegmentButton({ active, children, onClick, className = 'pnl-report-segment' }) {
  return <button type="button" onClick={onClick} className={className} aria-pressed={active}>{children}</button>;
}

function PriceComparisonChart({ data = [], symbol, benchmarkSymbol = 'QQQ', language, marketColorMode }) {
  const englishMode = isEnglishLanguage(language);
  const benchmarkName = PRICE_BENCHMARKS[benchmarkSymbol]?.[englishMode ? 'en' : 'zh'] || benchmarkSymbol;
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const activePointer = React.useRef(null);
  const domain = React.useMemo(() => buildChartDomain(data, ['pricePct', 'priceBenchmarkPct'], 'percentage'), [data]);
  const stockPoints = React.useMemo(() => buildLinePoints(data, 'pricePct', domain), [data, domain]);
  const benchmarkPoints = React.useMemo(() => buildLinePoints(data, 'priceBenchmarkPct', domain), [data, domain]);
  const stockPath = buildLinePathFromPoints(stockPoints);
  const benchmarkPath = buildLinePathFromPoints(benchmarkPoints);
  const selected = selectedIndex == null ? null : data[selectedIndex] || null;
  const latest = [...data].reverse().find(point => isRenderableChartValue(point?.pricePct)) || null;
  const readout = selected || latest;
  const stockColor = marketHexColor(latest?.pricePct || 0, marketColorMode);
  const lines = [0, 0.25, 0.5, 0.75, 1].map(ratio => CHART_PAD + ratio * (CHART_HEIGHT - CHART_PAD * 2));
  const axisValues = domain ? lines.map(y => domain.max - ((y - CHART_PAD) / (CHART_HEIGHT - CHART_PAD * 2)) * (domain.max - domain.min)) : [];

  React.useEffect(() => setSelectedIndex(null), [data, benchmarkSymbol]);
  const updateSelection = React.useCallback((event) => {
    if (!data.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = (event.clientX - rect.left) / rect.width * CHART_WIDTH;
    let nearest = 0;
    data.forEach((_, index) => {
      if (Math.abs(chartX(index, data.length) - x) < Math.abs(chartX(nearest, data.length) - x)) nearest = index;
    });
    setSelectedIndex(nearest);
  }, [data]);
  const onPointerDown = React.useCallback((event) => {
    if (event.isPrimary === false) return;
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateSelection(event);
  }, [updateSelection]);
  const onPointerMove = React.useCallback((event) => {
    if (activePointer.current === event.pointerId) updateSelection(event);
  }, [updateSelection]);
  const onPointerEnd = React.useCallback((event) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  return <div className="stock-pnl-price-chart">
    <div className="stock-pnl-price-readout">
      <div className="stock-pnl-price-date">{readout?.date?.replaceAll('-', '/') || '--'}</div>
      <div className="stock-pnl-price-readout-row"><span><i style={{ background: stockColor }} />{symbol}</span><strong className={isRenderableChartValue(readout?.pricePct) ? marketTextClass(readout.pricePct, marketColorMode) : ''}>{signedPercent(readout?.pricePct)}</strong></div>
      <div className="stock-pnl-price-readout-row"><span><i style={{ background: BENCHMARK_COLOR }} />{englishMode ? `${benchmarkName} (${benchmarkSymbol})` : `${benchmarkName}（${benchmarkSymbol}）`}</span><strong className={isRenderableChartValue(readout?.priceBenchmarkPct) ? marketTextClass(readout.priceBenchmarkPct, marketColorMode) : ''}>{signedPercent(readout?.priceBenchmarkPct)}</strong></div>
    </div>
    <div className="stock-pnl-price-plot-layout">
      <div className="stock-pnl-price-plot" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd} style={{ touchAction: 'pan-y' }}>
        {stockPath || benchmarkPath ? <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={englishMode ? `${symbol} price versus ${benchmarkName} (${benchmarkSymbol})` : `${symbol} 股价与${benchmarkName}（${benchmarkSymbol}）对比`}>
          {lines.map((y, index) => <line key={index} x1={CHART_PAD} x2={CHART_WIDTH - CHART_PAD} y1={y} y2={y} stroke="rgba(255,255,255,.065)" />)}
          {benchmarkPath && <path d={benchmarkPath} fill="none" stroke={BENCHMARK_COLOR} strokeWidth="1.7" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
          {stockPath && <path d={stockPath} fill="none" stroke={stockColor} strokeWidth="1.9" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
          {selectedIndex != null && <line x1={chartX(selectedIndex, data.length)} x2={chartX(selectedIndex, data.length)} y1={CHART_PAD} y2={CHART_HEIGHT - CHART_PAD} stroke="rgba(255,255,255,.22)" strokeDasharray="3 3" />}
        </svg> : <div className="stock-pnl-price-empty">{englishMode ? 'No comparable close prices yet' : '暂无可对比的收盘价格'}</div>}
      </div>
      <div className="stock-pnl-price-axis">{axisValues.map((value, index) => <span key={index} style={{ top: `${lines[index] / CHART_HEIGHT * 100}%` }}>{signedPercent(value)}</span>)}</div>
    </div>
    <div className="stock-pnl-price-dates"><span>{data[0]?.date?.slice(0, 7)?.replace('-', '/') || '--'}</span><span>{data.at(-1)?.date?.slice(0, 7)?.replace('-', '/') || '--'}</span></div>
    <div className="stock-pnl-price-note">{englishMode ? 'Both price series start at 0% on the same date. This is market price movement, not your trading return.' : '两条价格走势以同期起点为 0%；仅比较市场价格，不代表您的交易收益。'}</div>
  </div>;
}

export default function StockPnlReportPage({ ctx = {} }) {
  const {
    closeStockPnlReport,
    db,
    fetchPnlBenchmarkRows,
    investmentSummary,
    language = 'zh',
    marketColorMode,
    pnlReportRefreshVersion = 0,
    portfolioCurrencyMode,
    stockDetailSymbol,
    stockTrades,
    supabase,
    usdRate,
    user,
  } = ctx;
  const englishMode = isEnglishLanguage(language);
  const label = (zh, en) => englishMode ? en : zh;
  const symbol = String(stockDetailSymbol || '').trim().toUpperCase();
  const [range, setRange] = React.useState('ytd');
  const [chartMode, setChartMode] = React.useState('amount');
  const [priceBenchmarkSymbol, setPriceBenchmarkSymbol] = React.useState('QQQ');
  const [calendarMode, setCalendarMode] = React.useState('pnl');
  const [calendarView, setCalendarView] = React.useState('month');
  const [calendarDate, setCalendarDate] = React.useState(null);
  const [calendarPickerOpen, setCalendarPickerOpen] = React.useState(false);
  const [draftCalendarYear, setDraftCalendarYear] = React.useState('');
  const [draftCalendarMonth, setDraftCalendarMonth] = React.useState('01');
  const [currencyMode, setCurrencyMode] = React.useState(() => portfolioCurrencyMode === 'USD' ? 'USD' : 'CNY');
  const [currencyMenuOpen, setCurrencyMenuOpen] = React.useState(false);
  const [symbolSnapshots, setSymbolSnapshots] = React.useState([]);
  const [snapshotLoading, setSnapshotLoading] = React.useState(true);
  const [snapshotError, setSnapshotError] = React.useState('');
  const [stockPriceRows, setStockPriceRows] = React.useState([]);
  const [benchmarkData, setBenchmarkData] = React.useState({ symbol: '', from: '', to: '', rows: [] });
  const [priceLoading, setPriceLoading] = React.useState(false);
  const [priceError, setPriceError] = React.useState('');
  const priceRowsCache = React.useRef(new Map());
  const benchmarkRows = benchmarkData.symbol === priceBenchmarkSymbol ? benchmarkData.rows : [];
  const displayCurrency = currencyMode;
  const displayRate = displayCurrency === 'CNY' ? (finite(usdRate) || finite(investmentSummary?.usdRate) || USD_CNY_FALLBACK) : 1;

  React.useEffect(() => {
    let cancelled = false;
    if (!symbol || !db?.fetchPnlReportSymbolSnapshotHistory) {
      setSymbolSnapshots([]);
      setSnapshotLoading(false);
      return undefined;
    }
    setSnapshotLoading(true);
    setSnapshotError('');
    void db.fetchPnlReportSymbolSnapshotHistory(symbol, null)
      .then(rows => { if (!cancelled) setSymbolSnapshots(Array.isArray(rows) ? rows : []); })
      .catch(error => {
        if (cancelled) return;
        setSymbolSnapshots([]);
        setSnapshotError(error?.message || String(error));
      })
      .finally(() => { if (!cancelled) setSnapshotLoading(false); });
    return () => { cancelled = true; };
  }, [db, pnlReportRefreshVersion, symbol, user?.id]);

  const report = React.useMemo(() => buildStockPnlReportViewModel({
    symbol,
    stockTrades,
    symbolSnapshots,
    stockPriceRows,
    benchmarkRows,
    range,
    calendarDate,
  }), [symbol, stockTrades, symbolSnapshots, stockPriceRows, benchmarkRows, range, calendarDate]);

  const benchmarkFrom = report.rangeStartDate;
  const benchmarkTo = report.rangeEndDate;
  const priceRequestCurrent = benchmarkData.symbol === priceBenchmarkSymbol
    && benchmarkData.from === benchmarkFrom && benchmarkData.to === benchmarkTo;
  const shownPriceLoading = priceLoading || !priceRequestCurrent;
  const shownPriceError = priceRequestCurrent ? priceError : '';
  React.useEffect(() => { priceRowsCache.current.clear(); }, [fetchPnlBenchmarkRows, user?.id]);
  React.useEffect(() => {
    let cancelled = false;
    if (!symbol || !isDateKey(benchmarkFrom) || !isDateKey(benchmarkTo)) {
      setStockPriceRows([]);
      setBenchmarkData({ symbol: priceBenchmarkSymbol, from: benchmarkFrom, to: benchmarkTo, rows: [] });
      setPriceError('');
      setPriceLoading(false);
      return undefined;
    }
    if (!supabase?.auth?.getSession && typeof fetchPnlBenchmarkRows !== 'function') {
      setStockPriceRows([]);
      setBenchmarkData({ symbol: priceBenchmarkSymbol, from: benchmarkFrom, to: benchmarkTo, rows: [] });
      setPriceError(label('缺少可用的只读行情连接', 'Read-only price data is unavailable'));
      setPriceLoading(false);
      return undefined;
    }
    setPriceLoading(true);
    setPriceError('');
    async function load() {
      try {
        let tokenPromise;
        const fetchRows = async (requestedSymbol) => {
          const cacheKey = `${requestedSymbol}|${benchmarkFrom}|${benchmarkTo}`;
          const cached = priceRowsCache.current.get(cacheKey);
          if (cached) return cached;
          let rows;
          if (typeof fetchPnlBenchmarkRows === 'function') {
            rows = await fetchPnlBenchmarkRows({ symbol: requestedSymbol, from: benchmarkFrom, to: benchmarkTo });
            if (!Array.isArray(rows) || rows.length === 0) throw new Error(label(`${requestedSymbol} 暂无可用收盘价格`, `No completed-close prices for ${requestedSymbol}`));
          } else {
            tokenPromise ||= supabase.auth.getSession().then(({ data: { session } }) => {
              if (!session?.access_token) throw new Error(label('登录已失效，请重新登录后读取价格行情', 'Sign in again to load market prices'));
              return session.access_token;
            });
            const token = await tokenPromise;
            const response = await fetch(`/api/pnl-benchmark?symbol=${encodeURIComponent(requestedSymbol)}&from=${encodeURIComponent(benchmarkFrom)}&to=${encodeURIComponent(benchmarkTo)}`, {
              cache: 'no-store', headers: { Authorization: `Bearer ${token}` },
            });
            const body = await response.json().catch(() => null);
            if (!response.ok || body?.success === false) throw new Error(body?.error || label(`${requestedSymbol} 收盘价格读取失败`, `Could not load ${requestedSymbol} close prices`));
            rows = body?.rows;
            if (!Array.isArray(rows) || rows.length === 0) throw new Error(label(`${requestedSymbol} 暂无可用收盘价格`, `No completed-close prices for ${requestedSymbol}`));
          }
          priceRowsCache.current.set(cacheKey, rows);
          return rows;
        };
        const [stockResult, benchmarkResult] = await Promise.allSettled([fetchRows(symbol), fetchRows(priceBenchmarkSymbol)]);
        if (stockResult.status === 'rejected' || benchmarkResult.status === 'rejected') {
          throw stockResult.status === 'rejected' ? stockResult.reason : benchmarkResult.reason;
        }
        if (!cancelled) {
          setStockPriceRows(stockResult.value);
          setBenchmarkData({ symbol: priceBenchmarkSymbol, from: benchmarkFrom, to: benchmarkTo, rows: benchmarkResult.value });
        }
      } catch (error) {
        if (!cancelled) {
          setStockPriceRows([]);
          setBenchmarkData({ symbol: priceBenchmarkSymbol, from: benchmarkFrom, to: benchmarkTo, rows: [] });
          setPriceError(error?.message || String(error));
        }
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [symbol, benchmarkFrom, benchmarkTo, priceBenchmarkSymbol, fetchPnlBenchmarkRows, supabase, user?.id, language]);

  const ranges = [
    ['month', label('本月', 'This month')], ['1m', label('近 1 月', '1 month')],
    ['6m', label('近 6 月', '6 months')], ['ytd', label('本年', 'This year')],
    ['1y', label('近 1 年', '1 year')], ['all', label('全部', 'All')],
  ];
  const trend = Array.isArray(report.trend) ? report.trend : [];
  const priceTrend = Array.isArray(report.priceTrend) ? report.priceTrend : [];
  // The selected ETF series is a market-price comparison, not a cash-flow-matched investment return.
  const personalTrend = React.useMemo(() => trend.map(point => ({ ...point, benchmarkPct: null, benchmarkDailyPct: null })), [trend]);
  const totalColor = report.hasData ? marketHexColor(report.totalPnlUsd, marketColorMode) : '#e4e4e7';
  const totalAmount = finite(report.totalPnlUsd) * displayRate;
  const splitAmount = splitCurrencyAmount(Math.abs(totalAmount), displayCurrency, 2);
  const calendar = Array.isArray(report.calendar) ? report.calendar : [];
  const yearCalendar = Array.isArray(report.yearCalendar) ? report.yearCalendar : [];
  const calendarValues = new Map(calendar.map(item => [Number(item.day), item]));
  const yearValues = new Map(yearCalendar.map(item => [Number(item.month), item]));
  // The report model exposes YYYY/MM for display; the shared picker uses YYYY-MM keys.
  const availableMonths = React.useMemo(() => (
    Array.isArray(report.availableCalendarMonths)
      ? report.availableCalendarMonths.map(month => month.replace('/', '-'))
      : []
  ), [report.availableCalendarMonths]);
  const availableYears = Array.isArray(report.availableCalendarYears) ? report.availableCalendarYears : [];
  const availableMonthSet = React.useMemo(() => new Set(availableMonths), [availableMonths]);
  const selectedMonthKey = String(report.selectedMonth || '').replace('/', '-');
  const selectedYear = String(report.selectedYear || selectedMonthKey.slice(0, 4) || new Date().getFullYear());
  const calendarMax = Math.max(1, ...calendar.map(item => Math.abs(finite(calendarMode === 'rate' ? item.rate : item.valueUsd * displayRate))));
  const yearMax = Math.max(1, ...yearCalendar.map(item => Math.abs(finite(calendarMode === 'rate' ? item.rate : item.valueUsd * displayRate))));
  const firstMonthForYear = React.useCallback(year => (availableMonths.find(month => month.startsWith(`${year}-`)) || `${year}-01`).slice(5, 7), [availableMonths]);
  const openCalendarPicker = () => {
    const year = selectedYear || availableYears.at(-1) || String(new Date().getFullYear());
    setDraftCalendarYear(year);
    setDraftCalendarMonth(selectedMonthKey.slice(5, 7) || firstMonthForYear(year));
    setCalendarPickerOpen(true);
  };
  const confirmCalendarPicker = () => {
    if (!draftCalendarYear) return;
    setCalendarDate(monthDateKey(draftCalendarYear, draftCalendarMonth || firstMonthForYear(draftCalendarYear)));
    setCalendarPickerOpen(false);
  };
  const calendarTile = (item, size, key, heading, onClick) => {
    const value = calendarMode === 'rate' ? item?.rate : item?.valueUsd;
    const converted = calendarMode === 'rate' ? value : value == null ? null : value * displayRate;
    const hasValue = value != null;
    const intensity = Math.min(1, Math.abs(finite(converted)) / (size === 'month' ? calendarMax : yearMax));
    const tileColor = hasValue ? marketHexColor(value, marketColorMode) : null;
    const tileStyle = hasValue && Math.abs(finite(value)) > 0.000001 ? { background: `${tileColor}${alphaHex(0.07 + intensity * 0.13)}` } : undefined;
    const content = <><span className="stock-pnl-calendar-day">{heading}</span>{hasValue && <span className={`stock-pnl-calendar-value ${marketTextClass(value, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{calendarMode === 'rate' ? signedPercent(value) : compactAmount(converted, englishMode)}</span>}</>;
    return onClick
      ? <button key={key} type="button" onClick={onClick} className="stock-pnl-calendar-tile stock-pnl-calendar-tile-year" style={tileStyle}>{content}</button>
      : <div key={key} className="stock-pnl-calendar-tile" style={tileStyle}>{content}</div>;
  };

  const showStatus = Boolean(snapshotError) || (!snapshotLoading && !report.hasData);
  const status = snapshotError || label('暂无该股票的完整收盘收益记录。缺失日期不会按零收益填充。', 'No completed-close return records are available for this stock. Missing dates are not treated as zero.');
  return <main className="pnl-report-page stock-pnl-report-page" style={{ fontFamily: REPORT_FONT }} data-stock-pnl-report-page="true">
    <header className="pnl-report-header">
      <div className="pnl-report-nav">
        <button type="button" onClick={closeStockPnlReport} className="pnl-report-icon-button" aria-label={label('返回个股详情', 'Back to stock details')}><ArrowLeft size={20} /></button>
        <h1>{label('个股详细收益报表', 'Detailed stock P&L report')}</h1>
        <span className="stock-pnl-header-symbol">{symbol}</span>
      </div>
      <nav className="pnl-report-ranges" aria-label={label('收益时间范围', 'Return period')}>
        {ranges.map(([id, text]) => <RangeButton key={id} active={range === id} onClick={() => setRange(id)}>{text}</RangeButton>)}
      </nav>
    </header>

    {showStatus && <div className="pnl-report-status" role="status"><BarChart3 size={16} /><span>{status}</span></div>}

    <section className="pnl-report-hero">
      <div className="pnl-report-hero-heading">
        <span>{symbol} · {label('区间盈亏', 'Period P&L')}</span>
        <div className="pnl-report-currency">
          <button type="button" onClick={() => setCurrencyMenuOpen(open => !open)} aria-expanded={currencyMenuOpen} aria-label={label('切换报表币种', 'Change report currency')}>{displayCurrency}<ChevronDown size={13} /></button>
          {currencyMenuOpen && <div className="pnl-report-currency-menu">{['CNY', 'USD'].map(currency => <button key={currency} type="button" aria-pressed={displayCurrency === currency} onClick={() => { setCurrencyMode(currency); setCurrencyMenuOpen(false); }}>{currency}</button>)}</div>}
        </div>
      </div>
      <div className="pnl-report-amount" style={{ color: totalColor, fontFamily: NUMBER_FONT }} data-stock-pnl-total>
        {report.hasData ? <>{totalAmount >= 0 ? '+' : '-'}{splitAmount.main}<span>{splitAmount.decimal}</span></> : '--'}
      </div>
      <div className={`pnl-report-rate stock-pnl-hero-rate ${report.hasData && isRenderableChartValue(report.totalPnlPct) ? marketTextClass(report.totalPnlPct, marketColorMode) : ''}`}>{report.hasData ? signedPercent(report.totalPnlPct) : '--'}</div>
      <div className="pnl-report-period">{report.startDate || '--'} — {report.endDate || '--'} · {label('截至收盘', 'Completed close')}</div>
    </section>

    <section className="pnl-report-chart-section">
      <div className="pnl-report-chart-modes">
        <SegmentButton active={chartMode === 'amount'} onClick={() => setChartMode('amount')}>{label('我的收益', 'My P&L')}</SegmentButton>
        <SegmentButton active={chartMode === 'price'} onClick={() => setChartMode('price')}>{label('股价对比', 'Price comparison')}</SegmentButton>
      </div>
      {chartMode === 'price' && <div className="stock-pnl-benchmark-picker">
        <span>{label('对比基准', 'Benchmark')}</span>
        <div className="pnl-report-calendar-toggle stock-pnl-benchmark-options" role="group" aria-label={label('选择股价对比基准', 'Select price benchmark')}>
          {Object.entries(PRICE_BENCHMARKS).map(([ticker, names]) => <button key={ticker} type="button" className="pnl-report-calendar-segment"
            data-stock-pnl-benchmark-choice={ticker} aria-pressed={priceBenchmarkSymbol === ticker}
            aria-label={`${ticker} · ${names[englishMode ? 'en' : 'zh']}`}
            onClick={() => setPriceBenchmarkSymbol(ticker)}>{ticker}</button>)}
        </div>
      </div>}
      {chartMode === 'price'
        ? shownPriceError
          ? <div className="stock-pnl-price-unavailable" role="status">{label('股价对比暂不可用。我的收益数据仍可查看。', 'Price comparison is unavailable. Your P&L data is still available.')}</div>
          : shownPriceLoading
            ? <div className="stock-pnl-price-unavailable" role="status">{label('正在读取同期收盘价格…', 'Loading comparable close prices…')}</div>
            : <PriceComparisonChart data={priceTrend} symbol={symbol} benchmarkSymbol={priceBenchmarkSymbol} language={language} marketColorMode={marketColorMode} />
        : <PnlReportTrendChart data={personalTrend} mode="amount" showCombinedPersonalReadout color={totalColor} language={language} marketColorMode={marketColorMode} displayCurrency={displayCurrency} displayRate={displayRate} />}
    </section>

    <section className="stock-pnl-breakdown">
      <div><span>{label('已实现盈亏', 'Realized P&L')}</span><strong className={report.hasData && isRenderableChartValue(report.realizedPnlUsd) ? marketTextClass(report.realizedPnlUsd, marketColorMode) : ''}>{report.hasData ? signedCurrency(report.realizedPnlUsd == null ? null : report.realizedPnlUsd * displayRate, displayCurrency) : '--'}</strong></div>
      <div><span>{label('未实现盈亏', 'Unrealized P&L')}</span><strong className={report.hasData && isRenderableChartValue(report.unrealizedPnlUsd) ? marketTextClass(report.unrealizedPnlUsd, marketColorMode) : ''}>{report.hasData ? signedCurrency(report.unrealizedPnlUsd == null ? null : report.unrealizedPnlUsd * displayRate, displayCurrency) : '--'}</strong></div>
    </section>

    <section className="pnl-report-section pnl-report-calendar">
      <div className="pnl-report-section-heading"><h2>{label('收益日历', 'Returns calendar')}</h2><span>{displayCurrency}</span></div>
      <div className="pnl-report-calendar-controls">
        <button type="button" onClick={openCalendarPicker} className="pnl-report-calendar-date">{calendarView === 'year' ? selectedYear : report.selectedMonth}<ChevronDown size={14} /></button>
        <div className="pnl-report-calendar-toggle">
          <SegmentButton className="pnl-report-calendar-segment" active={calendarView === 'year'} onClick={() => setCalendarView('year')}>{label('年', 'Year')}</SegmentButton>
          <SegmentButton className="pnl-report-calendar-segment" active={calendarView === 'month'} onClick={() => setCalendarView('month')}>{label('月', 'Month')}</SegmentButton>
        </div>
        <div className="pnl-report-calendar-toggle pnl-report-calendar-value-toggle">
          <SegmentButton className="pnl-report-calendar-segment" active={calendarMode === 'pnl'} onClick={() => setCalendarMode('pnl')}>{label('收益', 'P&L')}</SegmentButton>
          <SegmentButton className="pnl-report-calendar-segment" active={calendarMode === 'rate'} onClick={() => setCalendarMode('rate')}>{label('收益率', 'Return')}</SegmentButton>
        </div>
      </div>
      {calendarView === 'month' ? <>
        <div className="stock-pnl-weekdays">{(englishMode ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['日', '一', '二', '三', '四', '五', '六']).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
        <div className="stock-pnl-month-grid">{calendarDays(report.selectedMonth).map((day, index) => day ? calendarTile(calendarValues.get(day), 'month', `${day}-${index}`, String(day).padStart(2, '0')) : <div key={`blank-${index}`} />)}</div>
      </> : <div className="stock-pnl-year-grid">{Array.from({ length: 12 }, (_, i) => i + 1).map(month => calendarTile(yearValues.get(month), 'year', month, monthLabel(month, englishMode), () => { setCalendarDate(monthDateKey(selectedYear, month)); setCalendarView('month'); }))}</div>}
    </section>
    <PnlReportCalendarPicker
      language={language}
      calendarPickerOpen={calendarPickerOpen}
      setCalendarPickerOpen={setCalendarPickerOpen}
      availableCalendarYears={availableYears}
      availableCalendarMonthSet={availableMonthSet}
      draftCalendarYear={draftCalendarYear}
      draftCalendarMonth={draftCalendarMonth}
      setDraftCalendarYear={setDraftCalendarYear}
      setDraftCalendarMonth={setDraftCalendarMonth}
      firstAvailableMonthForYear={firstMonthForYear}
      confirmCalendarPicker={confirmCalendarPicker}
    />
  </main>;
}
