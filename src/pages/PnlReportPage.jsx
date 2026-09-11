import React from 'react';
import { ArrowLeft, BarChart3, ChevronDown, Filter } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import SparkArea from '../components/PnlReportTrendChart.jsx';
import { PnlReportCalendarPicker, PnlReportDateFilter } from '../components/PnlReportFilters.jsx';
import './PnlReportPage.css';
import { buildPnlReportViewModel } from '../lib/pnlReportViewModel.js';

const REPORT_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const USD_CNY_FALLBACK = 7.2;
const PNL_REPORT_FOREGROUND_READ_MIN_INTERVAL_MS = 60_000;

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

function RangePill({ active, children, onClick }) {
  return <button type="button" onClick={onClick} className="pnl-report-range" aria-pressed={active}>{children}</button>;
}

function SegmentButton({ active, children, onClick }) {
  return <button type="button" onClick={onClick} className="pnl-report-segment" aria-pressed={active}>{children}</button>;
}

function CalendarSegmentButton({ active, children, onClick }) {
  return <button type="button" onClick={onClick} className="pnl-report-calendar-segment" aria-pressed={active}>{children}</button>;
}

export default function PnlReportPage({ ctx = {} }) {
  const {
    closePnlReport,
    db,
    fetchPnlBenchmarkRows,
    investmentSummary,
    language = 'zh',
    marketColorMode,
    pnlReportInitialChartMode = 'pnl',
    pnlReportRefreshVersion = 0,
    pnlReportTooltipDate = '',
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
  const [chartMode, setChartMode] = React.useState(
    pnlReportInitialChartMode === 'assets' ? 'assets' : 'pnl'
  );
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
  const [reportLoading, setReportLoading] = React.useState(true);
  const [reportError, setReportError] = React.useState('');
  const [snapshotLoadVersion, setSnapshotLoadVersion] = React.useState(0);
  const [benchmarkRows, setBenchmarkRows] = React.useState([]);
  const [benchmarkLoading, setBenchmarkLoading] = React.useState(false);
  const [benchmarkError, setBenchmarkError] = React.useState('');
  const hasFormalStockLedger = Array.isArray(stockTrades) && stockTrades.length > 0;
  const lastSnapshotLoadAtRef = React.useRef(0);
  const loadReportSnapshots = React.useCallback(async () => {
    if (!db?.fetchPnlReportSnapshots) {
      setReportLoading(false);
      return;
    }
    lastSnapshotLoadAtRef.current = Date.now();
    setReportLoading(true);
    setReportError('');
    try {
      const snapshots = await db.fetchPnlReportSnapshots(null, 370);
      setPortfolioSnapshots(snapshots);
      setSnapshotLoadVersion((version) => version + 1);
      return snapshots;
    } catch (error) {
      setReportError(error?.message || String(error));
      return null;
    } finally {
      setReportLoading(false);
    }
  }, [db]);

  React.useEffect(() => {
    loadReportSnapshots();
  }, [loadReportSnapshots, pnlReportRefreshVersion, user?.id]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refreshOnForeground = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (Date.now() - lastSnapshotLoadAtRef.current < PNL_REPORT_FOREGROUND_READ_MIN_INTERVAL_MS) return;
      void loadReportSnapshots();
    };
    const refreshWhenVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') refreshOnForeground();
    };
    window.addEventListener('focus', refreshOnForeground);
    window.addEventListener('pageshow', refreshOnForeground);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshOnForeground);
      window.removeEventListener('pageshow', refreshOnForeground);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadReportSnapshots]);

  const reportData = React.useMemo(() => buildPnlReportViewModel({
    portfolioSnapshots,
    symbolSnapshots,
    baselineSymbolSnapshots,
    stockTrades,
    benchmarkRows: hasFormalStockLedger ? benchmarkRows : [],
    benchmarkSymbol: 'QQQ',
    range,
    customRange,
    calendarDate,
  }), [baselineSymbolSnapshots, benchmarkRows, calendarDate, customRange, hasFormalStockLedger, portfolioSnapshots, range, stockTrades, symbolSnapshots]);

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
  }, [db, reportData.baselineSnapshotDate, reportData.snapshotDate, snapshotLoadVersion, user?.id]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadBenchmarkRows() {
      if (!hasFormalStockLedger || !reportData.hasData || (!supabase?.auth?.getSession && typeof fetchPnlBenchmarkRows !== 'function')) {
        setBenchmarkRows([]);
        setBenchmarkError('');
        setBenchmarkLoading(false);
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
  }, [fetchPnlBenchmarkRows, hasFormalStockLedger, language, reportData.benchmarkEndDate, reportData.benchmarkStartDate, reportData.hasData, supabase, user?.id]);

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

  const totalColor = marketHexColor(reportData.totalPnlUsd, marketColorMode);
  const reportTotal = convertUsd(reportData.totalPnlUsd, displayRate);
  const reportAmount = splitCurrencyAmount(Math.abs(reportTotal), displayCurrency, 2);
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
  const hasAssetSnapshotsWithoutMargin = reportData.trend.some(
    (point) => isRenderableChartValue(point?.totalAssetUsd) && !isRenderableChartValue(point?.netAssetUsd)
  );
  const hasAssetSnapshotsWithoutCash = reportData.trend.some(
    (point) => isRenderableChartValue(point?.totalAssetUsd) && !point?.cashKnown
  );
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
  const statusText = reportError
    ? reportError
    : reportData.hasData
      ? ''
      : range === 'custom'
        ? t(language, 'pnlReport.noSnapshotForRange', '所选日期没有收益快照。页面不会用其他日期数据替代。')
        : t(language, 'pnlReport.noSnapshotNotice', '暂无收益快照。先生成收盘快照后，页面会读取数据库里的真实报表数据。');
  const showReportStatus = Boolean(reportError)
    || (!reportLoading && !reportData.hasData);
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
    <main className="pnl-report-page" style={{ fontFamily: REPORT_FONT }}>
      <header className="pnl-report-header">
        <div className="pnl-report-nav">
          <button type="button" onClick={closePnlReport} className="pnl-report-icon-button" aria-label={t(language, 'pnlReport.back', '返回')}>
            <ArrowLeft size={20} />
          </button>
          <h1>{t(language, 'pnlReport.title', '收益报表')}</h1>
          <button type="button" onClick={openDateFilter} className="pnl-report-icon-button" aria-pressed={range === 'custom'} aria-label={t(language, 'pnlReport.filter', '筛选')}>
            <Filter size={18} />
          </button>
        </div>
        <div className="pnl-report-ranges">
          {rangeItems.map(([id, label]) => (
            <RangePill key={id} active={range === id} onClick={() => { setRange(id); setCustomRange(null); }}>{label}</RangePill>
          ))}
          {range === 'custom' && <RangePill active onClick={openDateFilter}>{customRangeLabel}</RangePill>}
        </div>
      </header>

      {showReportStatus && (
        <div className="pnl-report-status">
          <BarChart3 size={16} /><span>{statusText}</span>
        </div>
      )}

      <section className="pnl-report-hero">
        <div className="pnl-report-hero-heading">
          <span>{t(language, 'pnlReport.totalPnl', '盈亏总额')}</span>
          <div className="pnl-report-currency">
            <button type="button" onClick={() => setCurrencyMenuOpen((open) => !open)} aria-expanded={currencyMenuOpen} aria-label={t(language, 'pnlReport.currencySwitch', '切换报表币种')}>
              {displayCurrency}<ChevronDown size={13} />
            </button>
            {currencyMenuOpen && (
              <div className="pnl-report-currency-menu">
                {['CNY', 'USD'].map((currency) => (
                  <button key={currency} type="button" aria-pressed={displayCurrency === currency} onClick={() => { setReportCurrencyMode(currency); setCurrencyMenuOpen(false); }}>{currency}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="pnl-report-amount" style={{ color: totalColor, fontFamily: NUMBER_FONT }}>
          {reportData.hasData ? <>{reportTotal >= 0 ? '+' : '-'}{reportAmount.main}<span>{reportAmount.decimal}</span></> : '--'}
        </div>
        <div className="pnl-report-returns">
          <span className={`pnl-report-rate ${marketTextClass(reportData.totalPnlPct, marketColorMode)}`}>
            {reportData.hasData ? signedPct(reportData.totalPnlPct, 2) : '--'}
          </span>
          <span className="pnl-report-benchmark">
            <span>{benchmarkCompareLabel}</span>
            <span className={reportData.outperformPct == null ? '' : marketTextClass(reportData.outperformPct, marketColorMode)}>
              {benchmarkLoading && reportData.outperformPct == null ? '--' : reportData.outperformPct == null ? '--' : signedPct(reportData.outperformPct, 2)}
            </span>
          </span>
        </div>
        {benchmarkError && <div className="pnl-report-benchmark-error">{benchmarkError}</div>}
        <div className="pnl-report-period">{reportData.startDate} — {reportData.endDate}</div>
      </section>

      <section className="pnl-report-chart-section">
        <div className="pnl-report-chart-modes">
          <SegmentButton active={chartMode === 'pnl'} onClick={() => setChartMode('pnl')}>{t(language, 'pnlReport.pnlTrend', '收益率走势')}</SegmentButton>
          <SegmentButton active={chartMode === 'assets'} onClick={() => setChartMode('assets')}>{t(language, 'pnlReport.assetTrend', '总资产走势')}</SegmentButton>
        </div>
        <SparkArea
          data={reportData.trend}
          mode={chartMode}
          color={totalColor}
          language={language}
          marketColorMode={marketColorMode}
          displayCurrency={displayCurrency}
          displayRate={displayRate}
          initialSelectedDate={pnlReportTooltipDate}
        />
        {chartMode === 'assets' && hasAssetSnapshotsWithoutMargin && (
          <div className="mt-1 text-center text-[10px] leading-4 text-white/[0.38]">
            {t(language, 'pnlReport.netAssetsHistoryNotice', '净资产自融资负债记录生效日起展示')}
          </div>
        )}
        {chartMode === 'assets' && hasAssetSnapshotsWithoutCash && (
          <div className="mt-1 text-center text-[10px] leading-4 text-white/[0.38]">
            {t(language, 'pnlReport.cashHistoryNotice', '部分资产快照未包含可用现金')}
          </div>
        )}
      </section>

      <section className="pnl-report-trade-stats">
        <div><span>{t(language, 'pnlReport.turnover', '累计成交金额')} ({displayCurrency})</span><strong>{reportData.hasData ? fmt(convertUsd(reportData.turnoverUsd, displayRate), 2) : '--'}</strong></div>
        <div><span>{t(language, 'pnlReport.tradeStocks', '交易股票数')}</span><strong>{reportData.hasData ? reportData.tradeStockCount : '--'}</strong></div>
      </section>

      <section className="pnl-report-section pnl-report-calendar">
        <div className="pnl-report-section-heading"><h2>{t(language, 'pnlReport.calendar', '收益日历')}</h2><span>{displayCurrency}</span></div>
        <div className="pnl-report-calendar-controls">
          <button type="button" onClick={openCalendarPicker} className="pnl-report-calendar-date">
            {calendarView === 'year' ? selectedCalendarYear : reportData.selectedMonth}<ChevronDown size={14} />
          </button>
          <div className="pnl-report-calendar-toggle">
            <CalendarSegmentButton active={calendarView === 'year'} onClick={() => setCalendarView('year')}>{t(language, 'pnlReport.year', '年')}</CalendarSegmentButton>
            <CalendarSegmentButton active={calendarView === 'month'} onClick={() => setCalendarView('month')}>{t(language, 'pnlReport.month', '月')}</CalendarSegmentButton>
          </div>
          <div className="pnl-report-calendar-toggle pnl-report-calendar-value-toggle">
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
                const displayValue = calendarMode === 'rate' ? rate : valueUsd == null ? null : convertUsd(valueUsd, displayRate);
                const magnitude = calendarMode === 'rate' ? Math.abs(toNumber(rate)) : Math.abs(toNumber(displayValue));
                const hasTint = hasValue && magnitude > 0.000001;
                const tileColor = marketHexColor(signedValue ?? 0, marketColorMode);
                const intensity = Math.min(1, magnitude / calendarMagnitudeMax);
                const tileStyle = hasTint
                  ? {
                    background: `${tileColor}${alphaHex(0.07 + intensity * 0.13)}`,
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
                              : (displayValue == null ? '--' : signedCompactAmount(displayValue, englishMode))}
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
              const displayValue = calendarMode === 'rate' ? rate : valueUsd == null ? null : convertUsd(valueUsd, displayRate);
              const magnitude = calendarMode === 'rate' ? Math.abs(toNumber(rate)) : Math.abs(toNumber(displayValue));
              const hasTint = hasValue && magnitude > 0.000001;
              const tileColor = marketHexColor(signedValue ?? 0, marketColorMode);
              const intensity = Math.min(1, magnitude / yearCalendarMagnitudeMax);
              const tileStyle = hasTint
                ? {
                  background: `${tileColor}${alphaHex(0.07 + intensity * 0.13)}`,
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
                        : (displayValue == null ? '--' : signedCompactAmount(displayValue, englishMode))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="pnl-report-section pnl-report-contribution">
        <div className="pnl-report-section-heading"><h2>{englishMode ? 'P&L Contribution' : '收益贡献'}</h2><span>{currentRangeLabel} · {displayCurrency}</span></div>
        <div className="pnl-report-stock-total">
          <span>{t(language, 'pnlReport.stockPnl', '股票累计盈亏')}</span>
          <span className={marketTextClass(reportData.summary.stockPnlUsd, marketColorMode)}>{reportData.hasData ? signedCurrency(convertUsd(reportData.summary.stockPnlUsd, displayRate), displayCurrency, 2) : '--'}</span>
        </div>
        <div className="pnl-report-highlights">
          {[['best', englishMode ? 'Largest gain' : '最大盈利'], ['worst', englishMode ? 'Largest loss' : '最大亏损']].map(([key, label]) => {
            const row = reportData.summary[key];
            return <div key={key}>
              <span className="pnl-report-highlight-label">{label}</span>
              <div className="pnl-report-highlight-name">{displayName(row, englishMode)}</div>
              <div className="pnl-report-highlight-value" style={{ color: row ? marketHexColor(row.pnlUsd, marketColorMode) : undefined }}>{row ? signedCurrency(convertUsd(row.pnlUsd, displayRate), displayCurrency, 2) : '--'}</div>
            </div>;
          })}
        </div>
        <div className="pnl-report-rank-controls">
          <SegmentButton active={rankMode === 'gain'} onClick={() => setRankMode('gain')}>{t(language, 'pnlReport.gainTop5', '盈利 Top5')}</SegmentButton>
          <SegmentButton active={rankMode === 'loss'} onClick={() => setRankMode('loss')}>{t(language, 'pnlReport.lossTop5', '亏损 Top5')}</SegmentButton>
        </div>
        <div className="pnl-report-ranking">
          {rankingRows.length === 0 && <div className="pnl-report-empty">{t(language, 'pnlReport.noRankingRows', '暂无排行数据')}</div>}
          {rankingRows.map((row, index) => (
            <div key={row.symbol} className="pnl-report-rank-row">
              <span className="pnl-report-rank-number">{index + 1}</span>
              <div className="pnl-report-rank-name"><span>{displayName(row, englishMode)}</span><small>{row.symbol}</small></div>
              <span className={`pnl-report-rank-amount ${marketTextClass(row.pnlUsd, marketColorMode)}`}>{signedCurrency(convertUsd(row.pnlUsd, displayRate), displayCurrency, 2)}</span>
            </div>
          ))}
        </div>
      </section>
      <PnlReportCalendarPicker
        language={language}
        calendarPickerOpen={calendarPickerOpen}
        setCalendarPickerOpen={setCalendarPickerOpen}
        availableCalendarYears={availableCalendarYears}
        availableCalendarMonthSet={availableCalendarMonthSet}
        draftCalendarYear={draftCalendarYear}
        draftCalendarMonth={draftCalendarMonth}
        setDraftCalendarYear={setDraftCalendarYear}
        setDraftCalendarMonth={setDraftCalendarMonth}
        firstAvailableMonthForYear={firstAvailableMonthForYear}
        confirmCalendarPicker={confirmCalendarPicker}
      />
      <PnlReportDateFilter
        language={language}
        dateFilterOpen={dateFilterOpen}
        setDateFilterOpen={setDateFilterOpen}
        dateFilterMode={dateFilterMode}
        setDateFilterMode={setDateFilterMode}
        draftDate={draftDate}
        setDraftDate={setDraftDate}
        draftStartDate={draftStartDate}
        setDraftStartDate={setDraftStartDate}
        draftEndDate={draftEndDate}
        setDraftEndDate={setDraftEndDate}
        confirmDateFilter={confirmDateFilter}
      />
    </main>
  );
}
