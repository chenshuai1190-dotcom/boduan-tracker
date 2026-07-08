import React from 'react';
import { ArrowLeft, BarChart3, ChevronDown, ChevronRight, Filter, Info, Maximize2 } from 'lucide-react';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';

const REPORT_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const USD_CNY_FALLBACK = 7.2;

const reportMock = {
  startDate: '2025/4/5',
  endDate: '2026/7/8',
  totalPnlUsd: 173007.98,
  totalPnlPct: 0.4866,
  turnoverUsd: 2922927.2,
  tradeStockCount: 9,
  outperformPct: -0.0059,
  updatedAt: '07.07',
  trend: [
    { label: '2025/04', pnlPct: 0.12, benchmarkPct: 0.03, assetUsd: 2860000 },
    { label: '2025/05', pnlPct: 0.01, benchmarkPct: 0.12, assetUsd: 2925000 },
    { label: '2025/06', pnlPct: 0.18, benchmarkPct: 0.19, assetUsd: 3028000 },
    { label: '2025/07', pnlPct: -0.01, benchmarkPct: 0.24, assetUsd: 2916000 },
    { label: '2025/09', pnlPct: 0.40, benchmarkPct: 0.33, assetUsd: 3215000 },
    { label: '2025/11', pnlPct: 0.42, benchmarkPct: 0.31, assetUsd: 3274000 },
    { label: '2026/01', pnlPct: 0.52, benchmarkPct: 0.34, assetUsd: 3418000 },
    { label: '2026/03', pnlPct: 0.21, benchmarkPct: 0.24, assetUsd: 3180000 },
    { label: '2026/05', pnlPct: 0.56, benchmarkPct: 0.52, assetUsd: 3510000 },
    { label: '2026/07', pnlPct: 0.4866, benchmarkPct: 0.4807, assetUsd: 3392144 },
  ],
  calendar: [
    { day: 1, valueUsd: -35.19 },
    { day: 2, valueUsd: -40.63 },
    { day: 3, valueUsd: 0 },
    { day: 6, valueUsd: 24.81 },
    { day: 7, valueUsd: -24.47 },
    { day: 8, valueUsd: 1.27 },
  ],
  summary: {
    stockPnlUsd: 185477.49,
    best: { symbol: 'NVDA', name: '英伟达', pnlUsd: 65887.35 },
    worst: { symbol: 'META', name: 'Meta', pnlUsd: -2473.22 },
  },
  rankings: {
    gain: [
      { symbol: 'NVDA', name: '英伟达', pnlUsd: 65887.35 },
      { symbol: 'GOOGL', name: '谷歌-A', pnlUsd: 46806.23 },
      { symbol: 'TQQQ', name: '3 倍做多纳指 ETF', pnlUsd: 39923.2 },
      { symbol: 'TSM', name: '台积电', pnlUsd: 26981.64 },
      { symbol: 'MSFT', name: '微软', pnlUsd: 10306.23 },
    ],
    loss: [
      { symbol: 'META', name: 'Meta', pnlUsd: -2473.22 },
      { symbol: 'NOK', name: 'NOK', pnlUsd: -1819.4 },
      { symbol: 'SPCX', name: 'SpaceX', pnlUsd: -520.16 },
      { symbol: 'IBKR', name: 'IBKR', pnlUsd: -115.91 },
      { symbol: 'QQQ', name: '纳指100 ETF', pnlUsd: -80.12 },
    ],
  },
};

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

function currency(value, currency = 'USD', digits = 2) {
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${symbol}${fmt(value, digits)}`;
}

function signedPct(value, digits = 2) {
  const n = toNumber(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function displayName(row, englishMode) {
  if (!englishMode) return row.name;
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
  const benchmarkPath = buildLinePath(data, 'benchmarkPct');
  const areaPath = buildAreaPath(primaryPath);

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
      <path d={areaPath} fill="url(#pnlReportArea)" />
      <path d={primaryPath} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={benchmarkPath} fill="none" stroke="#51a7ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.82" />
      <text x="300" y="21" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">78.48%</text>
      <text x="300" y="54" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">58.87%</text>
      <text x="300" y="87" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">39.26%</text>
      <text x="300" y="122" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">19.66%</text>
      <text x="10" y="146" fontSize="9" fill="rgba(255,255,255,0.38)">2025/04</text>
      <text x="148" y="146" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.38)">2025/12</text>
      <text x="300" y="146" textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.38)">2026/07</text>
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
    investmentSummary,
    language = 'zh',
    marketColorMode,
    portfolioCurrencyMode,
    usdRate,
  } = ctx;
  const englishMode = isEnglishLanguage(language);
  const displayCurrency = portfolioCurrencyMode === 'CNY' ? 'CNY' : 'USD';
  const displayRate = displayCurrency === 'CNY' ? (toNumber(usdRate) || toNumber(investmentSummary?.usdRate) || USD_CNY_FALLBACK) : 1;
  const [range, setRange] = React.useState('all');
  const [chartMode, setChartMode] = React.useState('pnl');
  const [calendarMode, setCalendarMode] = React.useState('pnl');
  const [rankMode, setRankMode] = React.useState('gain');
  const positiveColor = marketHexColor(1, marketColorMode);
  const negativeColor = marketHexColor(-1, marketColorMode);
  const totalColor = marketHexColor(reportMock.totalPnlUsd, marketColorMode);
  const reportTotal = convertUsd(reportMock.totalPnlUsd, displayRate);
  const rangeItems = [
    ['month', t(language, 'pnlReport.range.month', '本月')],
    ['1m', t(language, 'pnlReport.range.1m', '近 1 月')],
    ['6m', t(language, 'pnlReport.range.6m', '近 6 月')],
    ['ytd', t(language, 'pnlReport.range.ytd', '本年')],
    ['1y', t(language, 'pnlReport.range.1y', '近 1 年')],
    ['all', t(language, 'pnlReport.range.all', '全部')],
  ];
  const calendarValues = new Map(reportMock.calendar.map(item => [item.day, item.valueUsd]));
  const rankingRows = reportMock.rankings[rankMode];

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
            <div className="mt-0.5 text-[11px] text-white/36">X MONEY · {t(language, 'pnlReport.mockBadge', '前端预览')}</div>
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

      <section className="pt-7 text-center">
        <div className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white/86">
          <span>{t(language, 'pnlReport.totalPnl', '盈亏总额')} ({displayCurrency})</span>
          <ChevronDown className="h-3.5 w-3.5 text-white/38" />
          <Info className="h-3.5 w-3.5 text-white/32" />
          <Maximize2 className="ml-8 h-4 w-4 text-white/32" />
        </div>
        <div className="mt-3 text-[42px] font-semibold leading-none tracking-normal tabular-nums" style={{ color: totalColor, fontFamily: NUMBER_FONT }}>
          {signedCurrency(reportTotal, displayCurrency, 2)}
        </div>
        <div className={`mt-2 text-[17px] font-semibold tabular-nums ${marketTextClass(reportMock.totalPnlPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
          {signedPct(reportMock.totalPnlPct, 2)}
        </div>
        <div className="mt-3 text-[12px] text-white/38">{reportMock.startDate} - {reportMock.endDate}</div>

        <div className="mx-auto mt-6 inline-flex rounded-full border border-white/10 bg-white/[0.055] p-1">
          <SegmentButton active={chartMode === 'pnl'} onClick={() => setChartMode('pnl')}>{t(language, 'pnlReport.pnlTrend', '收益率走势')}</SegmentButton>
          <SegmentButton active={chartMode === 'assets'} onClick={() => setChartMode('assets')}>{t(language, 'pnlReport.assetTrend', '总资产走势')}</SegmentButton>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between text-[12px] text-white/52">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: totalColor }} />{t(language, 'pnlReport.mine', '我的')}</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#51a7ff]" />{t(language, 'pnlReport.nasdaq', '纳斯达克')}</span>
          </div>
          <span>{t(language, 'pnlReport.simpleWeighted', '简单加权')} <ChevronDown className="inline h-3 w-3" /></span>
        </div>
        <SparkArea data={reportMock.trend} mode={chartMode} color={totalColor} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
          <div className="text-[12px] text-white/46">{t(language, 'pnlReport.turnover', '累计成交金额')} ({displayCurrency})</div>
          <div className="mt-3 text-[22px] font-semibold leading-none text-white tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{fmt(convertUsd(reportMock.turnoverUsd, displayRate), 2)}</div>
          <div className="mt-2 text-[12px] text-white/42">{t(language, 'pnlReport.tradeStocks', '交易股票数')} {reportMock.tradeStockCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
          <div className="text-[12px] text-white/46">{t(language, 'pnlReport.outperform', '全部跑赢')} {t(language, 'pnlReport.nasdaq', '纳斯达克')}</div>
          <div className={`mt-3 text-[24px] font-semibold leading-none tabular-nums ${marketTextClass(reportMock.outperformPct, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>{signedPct(reportMock.outperformPct, 2)}</div>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">{t(language, 'pnlReport.calendar', '收益日历')} ({displayCurrency})</h2>
          <ChevronRight className="h-4 w-4 text-white/36" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" className="flex items-center gap-1.5 text-[15px] font-normal text-white">
            2026/07 <ChevronDown className="h-3.5 w-3.5 text-white/42" />
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
            const valueUsd = day ? calendarValues.get(day) : undefined;
            const hasValue = valueUsd !== undefined;
            const bgColor = hasValue
              ? `${marketHexColor(valueUsd, marketColorMode)}18`
              : 'transparent';
            return (
              <div
                key={`${day || 'blank'}-${index}`}
                className="flex h-[54px] flex-col items-center justify-center rounded-lg"
                style={{ background: bgColor }}
              >
                {day && (
                  <>
                    <span className="text-[17px] font-normal text-white">{String(day).padStart(2, '0')}</span>
                    {hasValue && (
                      <span className={`mt-1 text-[10px] tabular-nums ${marketTextClass(valueUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                        {calendarMode === 'rate'
                          ? signedPct(valueUsd / 10000, 2)
                          : signedCurrency(convertUsd(valueUsd, displayRate), displayCurrency, 2)}
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
          <span className="text-[12px] text-white/40">{t(language, 'pnlReport.updatedAt', '更新至')}: {reportMock.updatedAt}</span>
        </div>
        <div className="mt-4 flex gap-2">
          {[t(language, 'pnlReport.stocks', '股票'), t(language, 'pnlReport.funds', '基金'), t(language, 'pnlReport.ipo', '新股'), t(language, 'pnlReport.cash', '余额通')].map((label, index) => (
            <span key={label} className={`rounded-full px-3 py-1.5 text-[12px] ${index === 0 ? 'border border-[#f6b54b]/35 bg-[#f6b54b]/10 text-[#ffd18a]' : 'bg-white/[0.055] text-white/34'}`}>{label}</span>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="text-[13px] text-white/62">{t(language, 'pnlReport.stockOptionsPnl', '股票期权累计盈亏')}</div>
          <div className={`flex items-center gap-1 text-[20px] font-normal tabular-nums ${marketTextClass(reportMock.summary.stockPnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
            {fmt(convertUsd(reportMock.summary.stockPnlUsd, displayRate), 2)}<ChevronRight className="h-4 w-4 text-white/30" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]">
          <div className="min-h-[74px] p-3" style={{ background: `${positiveColor}F0` }}>
            <div className="text-[12px] text-white/82">{t(language, 'pnlReport.gain', '盈利')}</div>
            <div className="mt-2 text-[14px] text-white">{displayName(reportMock.summary.best, englishMode)}.US</div>
            <div className="text-[15px] tabular-nums text-white" style={{ fontFamily: NUMBER_FONT }}>{signedCurrency(convertUsd(reportMock.summary.best.pnlUsd, displayRate), displayCurrency, 2)}</div>
          </div>
          <div className="min-h-[74px] p-3 text-right" style={{ background: `${negativeColor}D8` }}>
            <div className="text-[12px] text-white/82">{t(language, 'pnlReport.loss', '亏损')}</div>
            <div className="mt-2 text-[14px] text-white">{displayName(reportMock.summary.worst, englishMode)}.US</div>
            <div className="text-[15px] tabular-nums text-white" style={{ fontFamily: NUMBER_FONT }}>{signedCurrency(convertUsd(reportMock.summary.worst.pnlUsd, displayRate), displayCurrency, 2)}</div>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">{t(language, 'pnlReport.ranking', '全部盈亏排行榜')} ({displayCurrency})</h2>
          <span className="text-[12px] text-white/40">{t(language, 'pnlReport.updatedAt', '更新至')}: {reportMock.updatedAt}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.055] p-1">
          <SegmentButton active={rankMode === 'gain'} onClick={() => setRankMode('gain')}>{t(language, 'pnlReport.gainTop5', '盈利 Top5')}</SegmentButton>
          <SegmentButton active={rankMode === 'loss'} onClick={() => setRankMode('loss')}>{t(language, 'pnlReport.lossTop5', '亏损 Top5')}</SegmentButton>
        </div>
        <div className="mt-5 flex justify-between text-[12px] text-white/40">
          <span>{t(language, 'pnlReport.rank', '排行榜')}</span>
          <span>{t(language, 'pnlReport.pnlTotal', '盈亏总额')}</span>
        </div>
        <div className="mt-2 space-y-2">
          {rankingRows.map((row, index) => {
            const displayValue = convertUsd(row.pnlUsd, displayRate);
            const color = marketHexColor(row.pnlUsd, marketColorMode);
            const width = `${Math.max(18, 100 - index * 13)}%`;
            return (
              <div key={row.symbol} className="relative overflow-hidden rounded-xl border border-white/6 bg-white/[0.035] px-3 py-2.5">
                <div className="absolute inset-y-1 right-1 rounded-lg" style={{ width, background: color, opacity: 0.18 }} />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#f6b54b] text-[11px] font-semibold text-[#101318]">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-normal text-white">{displayName(row, englishMode)}</div>
                      <div className="text-[11px] text-white/36">US {row.symbol}</div>
                    </div>
                  </div>
                  <div className={`shrink-0 text-[14px] font-normal tabular-nums ${marketTextClass(row.pnlUsd, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                    {signedCurrency(displayValue, displayCurrency, 2)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-[12px] leading-5 text-white/40">
        <BarChart3 className="mb-2 h-4 w-4 text-[#f6b54b]" />
        {t(language, 'pnlReport.mockNotice', '当前为前端静态预览数据。后续接入数据库快照后,这里会读取每日收盘锁定后的历史收益。')}
      </div>
    </main>
  );
}
