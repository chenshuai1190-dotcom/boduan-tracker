import React from 'react';
import { ArrowLeft, BarChart3, ChevronDown, ChevronRight, Filter, RefreshCw } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import { buildPnlReportSnapshots } from '../lib/pnlReportSnapshots.js';
import { buildPnlReportViewModel } from '../lib/pnlReportViewModel.js';

const REPORT_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const USD_CNY_FALLBACK = 7.2;

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

function convertUsd(value, displayRate) {
  return toNumber(value) * displayRate;
}

function buildLinePath(points, key, width = 310, height = 150, pad = 10) {
  if (!points.length) return '';
  const values = points.map(point => toNumber(point[key]));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const fixedPctDomain = key !== 'assetUsd';
  const min = fixedPctDomain ? Math.min(rawMin, -0.1956) : rawMin;
  const max = fixedPctDomain ? Math.max(rawMax, 0.7848) : rawMax;
  const padding = fixedPctDomain ? 0 : Math.max((max - min) * 0.12, 1);
  const domainMin = min - padding;
  const domainMax = max + padding;
  const span = domainMax - domainMin || 1;
  return points.map((point, index) => {
    const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = pad + (1 - ((toNumber(point[key]) - domainMin) / span)) * (height - pad * 2);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function buildAreaPath(linePath, width = 310, height = 150, pad = 10) {
  if (!linePath) return '';
  return `${linePath} L${width - pad} ${height - pad} L${pad} ${height - pad} Z`;
}

function SparkArea({ data, mode, color }) {
  const primaryKey = mode === 'assets' ? 'assetUsd' : 'pnlPct';
  const primaryPath = buildLinePath(data, primaryKey);
  const hasBenchmark = data.some(point => Number.isFinite(Number(point?.benchmarkPct)));
  const benchmarkPath = hasBenchmark ? buildLinePath(data, 'benchmarkPct') : '';
  const areaPath = buildAreaPath(primaryPath);
  const firstLabel = data[0]?.label || '--';
  const middleLabel = data[Math.floor(data.length / 2)]?.label || firstLabel;
  const lastLabel = data[data.length - 1]?.label || firstLabel;

  return (
    <svg viewBox="0 0 310 150" className="mt-3 h-[170px] w-full overflow-visible">
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
      <text x="300" y="21" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">78.48%</text>
      <text x="300" y="54" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">58.87%</text>
      <text x="300" y="87" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">39.26%</text>
      <text x="300" y="122" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">19.66%</text>
      <text x="10" y="146" fontSize="9" fill="rgba(255,255,255,0.38)">{firstLabel}</text>
      <text x="148" y="146" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.38)">{middleLabel}</text>
      <text x="300" y="146" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">{lastLabel}</text>
    </svg>
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
          : 'border border-white/10 bg-white/[0.055] text-white/46'
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
        active ? 'bg-white text-[#101318]' : 'text-white/42'
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
    investmentSummary,
    language = 'zh',
    marketColorMode,
    portfolioCurrencyMode,
    quoteRows,
    stockTrades,
    supabase,
    usdRate,
    user,
  } = ctx;
  const englishMode = isEnglishLanguage(language);
  const displayCurrency = portfolioCurrencyMode === 'CNY' ? 'CNY' : 'USD';
  const displayRate = displayCurrency === 'CNY' ? (toNumber(usdRate) || toNumber(investmentSummary?.usdRate) || USD_CNY_FALLBACK) : 1;
  const [range, setRange] = React.useState('all');
  const [chartMode, setChartMode] = React.useState('pnl');
  const [calendarMode, setCalendarMode] = React.useState('pnl');
  const [rankMode, setRankMode] = React.useState('gain');
  const [portfolioSnapshots, setPortfolioSnapshots] = React.useState([]);
  const [symbolSnapshots, setSymbolSnapshots] = React.useState([]);
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
      const latestDate = snapshots[0]?.snapshotDate;
      const [symbols, state] = await Promise.all([
        latestDate && db.fetchPnlReportSymbolSnapshots
          ? db.fetchPnlReportSymbolSnapshots(latestDate)
          : Promise.resolve([]),
        db.fetchPnlReportRebuildState ? db.fetchPnlReportRebuildState() : Promise.resolve(null),
      ]);
      setSymbolSnapshots(symbols);
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
    stockTrades,
    benchmarkRows,
    benchmarkSymbol: 'QQQ',
    range,
  }), [benchmarkRows, portfolioSnapshots, range, stockTrades, symbolSnapshots]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadBenchmarkRows() {
      if (!reportData.hasData || !supabase?.auth?.getSession) {
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
  }, [language, reportData.benchmarkEndDate, reportData.benchmarkStartDate, reportData.hasData, supabase, user?.id]);

  const handleRebuildToday = React.useCallback(async () => {
    if (!db?.upsertPnlReportSnapshots) return;
    setRebuilding(true);
    setReportError('');
    setReportMessage('');
    try {
      const trades = Array.isArray(stockTrades) ? stockTrades : [];
      if (trades.length === 0) throw new Error(t(language, 'pnlReport.noTrades', '交易账本为空,无法生成收益快照'));
      const built = buildPnlReportSnapshots({
        stockTrades: trades,
        quoteRows: Array.isArray(quoteRows) ? quoteRows : [],
        cashUsd: toNumber(investmentSummary?.cashUsd),
        snapshotDate: new Date(),
        lockedAt: new Date().toISOString(),
      });
      const missingSymbols = built.symbolSnapshots
        .filter((snapshot) => snapshot.isOpen && !(toNumber(snapshot.currentPriceUsd) > 0))
        .map((snapshot) => snapshot.symbol);
      if (missingSymbols.length > 0) {
        throw new Error(`${t(language, 'pnlReport.quotesNotReady', '行情未就绪,缺少现价')}: ${missingSymbols.join(', ')}`);
      }
      await db.upsertPnlReportSnapshots(built);
      if (db.clearPnlReportRebuildState) await db.clearPnlReportRebuildState();
      await loadReportSnapshots();
      setReportMessage(t(language, 'pnlReport.rebuildSuccess', '今日收益快照已生成'));
    } catch (error) {
      setReportError(error?.message || String(error));
    } finally {
      setRebuilding(false);
    }
  }, [db, investmentSummary?.cashUsd, language, loadReportSnapshots, quoteRows, stockTrades]);

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
  const calendarValues = new Map(reportData.calendar.map(item => [item.day, item]));
  const calendarMagnitudeMax = Math.max(1, ...reportData.calendar.map((item) => {
    if (calendarMode === 'rate') return Math.abs(toNumber(item.rate));
    return Math.abs(convertUsd(item.valueUsd, displayRate));
  }));
  const rankingRows = reportData.rankings[rankMode] || [];
  const hasBenchmarkTrend = reportData.trend.some(point => Number.isFinite(Number(point?.benchmarkPct)));
  const benchmarkCompareLabel = reportData.outperformPct == null
    ? t(language, 'pnlReport.vsNasdaq', '对比纳斯达克')
    : reportData.outperformPct >= 0
      ? t(language, 'pnlReport.outperformNasdaq', '跑赢纳斯达克')
      : t(language, 'pnlReport.underperformNasdaq', '跑输纳斯达克');
  const statusText = reportLoading
    ? t(language, 'pnlReport.loadingSnapshots', '正在读取收益快照')
    : reportError
      ? reportError
      : reportMessage || (rebuildState?.dirtyFromDate
        ? `${t(language, 'pnlReport.dirtyNotice', '交易已更新,建议重新生成快照')} · ${rebuildState.dirtyFromDate}`
        : reportData.hasData
          ? t(language, 'pnlReport.snapshotNotice', '当前页面读取数据库收益快照。手动生成只更新今日快照,不影响交易页实时显示。')
          : t(language, 'pnlReport.noSnapshotNotice', '暂无收益快照。先生成今日快照后,页面会读取数据库里的真实报表数据。'));

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-[#05070b] pb-[calc(env(safe-area-inset-bottom)+28px)] text-white" style={{ fontFamily: REPORT_FONT }}>
      <header className="sticky top-0 z-20 -mx-4 border-b border-white/10 bg-[#05070b]/88 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+4px)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={closePnlReport}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/72 transition active:scale-95"
            aria-label={t(language, 'pnlReport.back', '返回')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <h1 className="text-[17px] font-semibold leading-tight text-white">{t(language, 'pnlReport.title', '收益报表')}</h1>
            <div className="mt-0.5 text-[11px] text-white/36">
              X MONEY · {reportData.hasData ? t(language, 'pnlReport.snapshotBadge', '快照数据') : t(language, 'pnlReport.noSnapshotBadge', '等待快照')}
            </div>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/52 transition active:scale-95"
            aria-label={t(language, 'pnlReport.filter', '筛选')}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
          {rangeItems.map(([id, label]) => (
            <RangePill key={id} active={range === id} onClick={() => setRange(id)}>
              {label}
            </RangePill>
          ))}
        </div>
      </header>

      <section className="pt-5 text-center">
        <div className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white/86">
          <span>{t(language, 'pnlReport.totalPnl', '盈亏总额')} ({displayCurrency})</span>
          <ChevronDown className="h-3.5 w-3.5 text-white/38" />
        </div>
        <div className="mt-3 text-[35px] font-semibold leading-none tracking-normal tabular-nums" style={{ color: totalColor, fontFamily: NUMBER_FONT }}>
          {signedCurrency(reportTotal, displayCurrency, 2)}
        </div>
        <div className={`mt-2 text-[15px] font-semibold tabular-nums ${marketTextClass(reportData.totalPnlPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
          {signedPct(reportData.totalPnlPct, 2)}
        </div>
        <div className="mt-3 text-[12px] text-white/38">{reportData.startDate} - {reportData.endDate}</div>

        <div className="mx-auto mt-6 inline-flex rounded-full border border-white/10 bg-white/[0.055] p-1">
          <SegmentButton active={chartMode === 'pnl'} onClick={() => setChartMode('pnl')}>{t(language, 'pnlReport.pnlTrend', '收益率走势')}</SegmentButton>
          <SegmentButton active={chartMode === 'assets'} onClick={() => setChartMode('assets')}>{t(language, 'pnlReport.assetTrend', '总资产走势')}</SegmentButton>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-start text-[12px] text-white/52">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: totalColor }} />{t(language, 'pnlReport.mine', '我的')}</span>
            {hasBenchmarkTrend && <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#51a7ff]" />{t(language, 'pnlReport.nasdaq', '纳斯达克')}</span>}
          </div>
        </div>
        <SparkArea data={reportData.trend} mode={chartMode} color={totalColor} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
          <div className="text-[12px] text-white/46">{t(language, 'pnlReport.turnover', '累计成交金额')} ({displayCurrency})</div>
          <div className="mt-3 text-[19px] font-semibold leading-none text-white tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{fmt(convertUsd(reportData.turnoverUsd, displayRate), 2)}</div>
          <div className="mt-2 text-[12px] text-white/42">{t(language, 'pnlReport.tradeStocks', '交易股票数')} {reportData.tradeStockCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
          <div className="text-[12px] text-white/46">{benchmarkCompareLabel}</div>
          <div className={`mt-3 text-[20px] font-semibold leading-none tabular-nums ${reportData.outperformPct == null ? 'text-white/36' : marketTextClass(reportData.outperformPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
            {benchmarkLoading && reportData.outperformPct == null ? '--' : reportData.outperformPct == null ? '--' : signedPct(reportData.outperformPct, 2)}
          </div>
          {benchmarkError && <div className="mt-2 truncate text-[10px] text-white/28">{benchmarkError}</div>}
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">{t(language, 'pnlReport.calendar', '收益日历')} ({displayCurrency})</h2>
          <ChevronRight className="h-4 w-4 text-white/36" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" className="flex items-center gap-1.5 text-[15px] font-normal text-white">
            {reportData.selectedMonth} <ChevronDown className="h-3.5 w-3.5 text-white/42" />
          </button>
          <div className="flex rounded-full border border-white/10 bg-white/[0.055] p-1">
            <SegmentButton active={false}>{t(language, 'pnlReport.year', '年')}</SegmentButton>
            <SegmentButton active>{t(language, 'pnlReport.month', '月')}</SegmentButton>
          </div>
          <div className="flex rounded-full border border-white/10 bg-white/[0.055] p-1">
            <SegmentButton active={calendarMode === 'pnl'} onClick={() => setCalendarMode('pnl')}>{t(language, 'pnlReport.pnl', '收益')}</SegmentButton>
            <SegmentButton active={calendarMode === 'rate'} onClick={() => setCalendarMode('rate')}>{t(language, 'pnlReport.pnlRate', '收益率')}</SegmentButton>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-7 text-center text-[12px] text-white/54">
          {['日', '一', '二', '三', '四', '五', '六'].map((day, index) => (
            <div key={day}>{englishMode ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][index] : day}</div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {[null, null, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].map((day, index) => {
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
                    <span className="text-[15px] font-normal text-white">{String(day).padStart(2, '0')}</span>
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
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">{t(language, 'pnlReport.summary', '全部盈亏总结')} ({displayCurrency})</h2>
          <span className="text-[12px] text-white/40">{t(language, 'pnlReport.updatedAt', '更新至')}: {reportData.updatedAt}</span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-[13px] text-white/62">{t(language, 'pnlReport.stockPnl', '股票累计盈亏')}</div>
          <div className={`flex items-center gap-1 text-[17px] font-normal tabular-nums ${marketTextClass(reportData.summary.stockPnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
            {fmt(convertUsd(reportData.summary.stockPnlUsd, displayRate), 2)}<ChevronRight className="h-4 w-4 text-white/30" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]">
          <div className="min-h-[74px] p-3" style={{ background: `${positiveColor}F0` }}>
            <div className="text-[12px] text-white/82">{t(language, 'pnlReport.gain', '盈利')}</div>
            <div className="mt-2 text-[13px] text-white">{displayName(reportData.summary.best, englishMode)}{reportData.summary.best ? '.US' : ''}</div>
            <div className="text-[14px] tabular-nums text-white" style={{ fontFamily: NUMBER_FONT }}>
              {reportData.summary.best ? signedCurrency(convertUsd(reportData.summary.best.pnlUsd, displayRate), displayCurrency, 2) : '--'}
            </div>
          </div>
          <div className="min-h-[74px] p-3 text-right" style={{ background: `${negativeColor}D8` }}>
            <div className="text-[12px] text-white/82">{t(language, 'pnlReport.loss', '亏损')}</div>
            <div className="mt-2 text-[13px] text-white">{displayName(reportData.summary.worst, englishMode)}{reportData.summary.worst ? '.US' : ''}</div>
            <div className="text-[14px] tabular-nums text-white" style={{ fontFamily: NUMBER_FONT }}>
              {reportData.summary.worst ? signedCurrency(convertUsd(reportData.summary.worst.pnlUsd, displayRate), displayCurrency, 2) : '--'}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">{t(language, 'pnlReport.ranking', '全部盈亏排行榜')} ({displayCurrency})</h2>
          <span className="text-[12px] text-white/40">{t(language, 'pnlReport.updatedAt', '更新至')}: {reportData.updatedAt}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.055] p-1">
          <SegmentButton active={rankMode === 'gain'} onClick={() => setRankMode('gain')}>{t(language, 'pnlReport.gainTop5', '盈利 Top5')}</SegmentButton>
          <SegmentButton active={rankMode === 'loss'} onClick={() => setRankMode('loss')}>{t(language, 'pnlReport.lossTop5', '亏损 Top5')}</SegmentButton>
        </div>
        <div className="mt-5 flex justify-between text-[12px] text-white/40">
          <span>{t(language, 'pnlReport.rank', '排行榜')}</span>
          <span>{t(language, 'pnlReport.pnlTotal', '盈亏总额')}</span>
        </div>
        <div className="mt-2 space-y-1.5">
          {rankingRows.length === 0 && (
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-3 text-center text-[12px] text-white/36">
              {t(language, 'pnlReport.noRankingRows', '暂无排行数据')}
            </div>
          )}
          {rankingRows.map((row, index) => {
            const displayValue = convertUsd(row.pnlUsd, displayRate);
            const color = marketHexColor(row.pnlUsd, marketColorMode);
            const width = `${Math.max(18, 100 - index * 13)}%`;
            return (
              <div key={row.symbol} className="relative overflow-hidden rounded-lg bg-white/[0.03] px-2.5 py-2">
                <div className="absolute inset-y-1 right-1 rounded-lg" style={{ width, background: color, opacity: 0.18 }} />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#f6b54b] text-[10px] font-semibold text-[#101318]">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-normal text-white">{displayName(row, englishMode)}</div>
                      <div className="text-[10px] text-white/34">US {row.symbol}</div>
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
      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-[12px] leading-5 text-white/40">
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
          {rebuilding ? t(language, 'pnlReport.rebuilding', '生成中') : t(language, 'pnlReport.rebuildToday', '生成今日快照')}
        </button>
      </div>
    </main>
  );
}
