import React from 'react';
import { ArrowDown, ArrowUp, Flame, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import { createBtcPlaceholderMarketCard, isBtcMarketCard } from '../lib/btcRealtime.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import { mergeIndexCardsWithPlaceholders } from '../lib/indexRealtime.js';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';

const PORTFOLIO_CURRENCY_STORAGE_KEY = 'xmoney_portfolio_currency';
const HOME_CURRENCY_STORAGE_KEY = 'xmoney_home_currency';
const BTC_STATUS_DISPLAY_GRACE_MS = 60_000;
const HOME_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const POPULAR_US_STOCKS = [
  { symbol: 'NVDA', name: '英伟达', company: 'NVIDIA' },
  { symbol: 'MSFT', name: '微软', company: 'Microsoft' },
  { symbol: 'AAPL', name: '苹果', company: 'Apple' },
  { symbol: 'TSLA', name: '特斯拉', company: 'Tesla' },
  { symbol: 'AMZN', name: '亚马逊', company: 'Amazon' },
  { symbol: 'GOOGL', name: '谷歌A', company: 'Alphabet' },
  { symbol: 'META', name: 'Meta', company: 'Meta' },
  { symbol: 'IBKR', name: '盈透证券', company: 'Interactive Brokers' },
];

const emptySummary = {
  activePositions: [],
  positions: [],
  totalAssetsUsd: 0,
  totalAssetsCny: 0,
  todayPnl: 0,
  todayPnlPct: 0,
  cumulativePnl: 0,
  cumulativePnlPct: 0,
  holdingStockCount: 0,
  sellTradeCount: 0,
  usdRate: 7.2,
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(value, digits = 2) {
  return num(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtOptionalMoney(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtCurrency(value, currency = 'USD', digits = 2) {
  return `${currency === 'CNY' ? '¥' : '$'}${fmtMoney(value, digits)}`;
}

function fmtSignedCurrency(value, currency = 'USD', digits = 2) {
  const n = num(value);
  return `${n >= 0 ? '+' : '-'}${currency === 'CNY' ? '¥' : '$'}${fmtMoney(Math.abs(n), digits)}`;
}

function fmtSignedPct(value, digits = 2) {
  const n = num(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function fmtMarketPct(value) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtOptionalMarketPct(value) {
  if (value === null || value === undefined || value === '') return '--';
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function drawdownFromHigh(price, high) {
  const p = num(price);
  const h = num(high);
  if (p <= 0 || h <= 0) return null;
  return (p - h) / h;
}

function fmtDrawdownPct(value) {
  if (value === null || value === undefined) return '--';
  const n = num(value) * 100;
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function pnlColor(value, mode) {
  return marketTextClass(value, mode);
}

function marketColor(value, mode) {
  return marketHexColor(value, mode);
}

function hasFiniteMarketValue(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

function sortMetricValue(item, key) {
  if (key === 'price') return num(item.price);
  if (key === 'change') return num(item.changePct);
  if (key === 'drawdown') return item.highDrawdown === null ? null : num(item.highDrawdown);
  if (key === 'ytd') return item.ytdChangePercent === null ? null : num(item.ytdChangePercent);
  if (key === 'pnl') return item.pnlValue === null ? null : num(item.pnlValue);
  return null;
}

function freshnessTimestamp(row) {
  const candidates = [row?.clientReceivedAt, row?.receivedAt, row?.realtimeAt];
  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 1000000000000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function shouldMaskFreshPrice(symbol, quoteRow, stockFreshnessStartedAt) {
  const startedAt = Number(stockFreshnessStartedAt) || 0;
  if (!startedAt) return false;
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) return false;
  const quoteSymbol = String(quoteRow?.symbol || '').trim().toUpperCase();
  if (!quoteRow || quoteSymbol !== normalizedSymbol) return true;
  return freshnessTimestamp(quoteRow) < startedAt;
}

function SortIcon({ active, direction }) {
  return (
    <span className="flex h-4 w-2.5 shrink-0 flex-col items-center justify-center gap-[2px]" aria-hidden="true">
      <span className={`h-0 w-0 border-x-[4px] border-b-[5px] border-x-transparent ${active && direction === 'asc' ? 'border-b-[#f6b54b]' : 'border-b-white/35'}`} />
      <span className={`h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent ${active && direction === 'desc' ? 'border-t-[#f6b54b]' : 'border-t-white/35'}`} />
    </span>
  );
}

function SortHeader({ label, sortKey, sortState, onSort }) {
  const active = sortState?.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex min-w-0 items-center justify-end gap-1 text-right active:scale-95 ${active ? 'text-[#f6b54b]' : 'text-white/40'}`}
    >
      <span className="truncate">{label}</span>
      <SortIcon active={active} direction={sortState?.direction} />
    </button>
  );
}

function normalizeLogoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return `https://eodhd.com${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

function logoUrlCandidates(symbol, ...explicitUrls) {
  const urls = explicitUrls.map(normalizeLogoUrl).filter(Boolean);
  const raw = String(symbol || '').trim();
  if (/^[A-Za-z0-9.-]+$/.test(raw)) {
    const upper = raw.toUpperCase();
    urls.push(`https://eodhd.com/img/logos/US/${upper}.png`);
    urls.push(`https://eodhd.com/img/logos/US/${raw.toLowerCase()}.png`);
    urls.push(`https://financialmodelingprep.com/image-stock/${upper}.png`);
    urls.push(`https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/${upper}.png`);
  }
  return Array.from(new Set(urls));
}

function LogoPlaceholder({ symbol, className = '' }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-[9px] font-black text-white/55 ${className}`}>
      {String(symbol || '?').slice(0, 2)}
    </span>
  );
}

function StockLogo({ symbol, urls, onLogoLoad, className = '' }) {
  const candidates = React.useMemo(() => (urls || []).filter(Boolean), [urls]);
  const candidateKey = candidates.join('|');
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(0);
  }, [symbol, candidateKey]);

  if (candidates.length === 0 || index >= candidates.length) {
    return <LogoPlaceholder symbol={symbol} className={className} />;
  }

  return (
    <img
      src={candidates[index]}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(event) => onLogoLoad?.(symbol, event.currentTarget.currentSrc || event.currentTarget.src)}
      onError={() => setIndex((current) => current + 1)}
      className={`h-6 w-6 shrink-0 rounded-md bg-white object-contain p-0.5 ${className}`}
    />
  );
}

function cleanSignalText(value, language = 'zh') {
  const text = String(value || '等待中').replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+ */u, '');
  if (isEnglishLanguage(language) && text === '等待中') return t(language, 'home.waiting', '等待中');
  return text;
}

function dataDateLabel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function Sparkline({ values = [], color = '#22c55e', className = 'h-9' }) {
  const series = values.filter((v) => Number.isFinite(Number(v))).map(Number);
  if (series.length < 2) {
    return <div className={`${className} flex items-center justify-center text-[10px] text-white/25`}>--</div>;
  }

  const width = 100;
  const height = 34;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const points = series.map((value, index) => {
    const x = (index / (series.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(' L ')}`;
  const fill = `${path} L ${width},${height} L 0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`w-full ${className}`} preserveAspectRatio="none">
      <path d={fill} fill={color} opacity="0.16" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function marketCardName(item, language) {
  if (!isEnglishLanguage(language)) return item?.name || item?.ticker;
  const ticker = String(item?.displaySymbol || item?.symbol || item?.ticker || '').toUpperCase();
  const map = {
    '.SPX': 'S&P 500',
    'SPX': 'S&P 500',
    '.NDX': 'Nasdaq 100',
    'NDX': 'Nasdaq 100',
    '.DJI': 'Dow Jones',
    'DJI': 'Dow Jones',
    'BTCUSD': 'BTC',
    'BTC/USD': 'BTC',
    'BTC': 'BTC',
  };
  return map[ticker] || item?.displaySymbol || item?.symbol || item?.ticker || item?.name;
}

function marketRealtimeLabel(realtimeStatus, language) {
  if (realtimeStatus === 'live') return 'LIVE';
  if (realtimeStatus === 'fallback') return 'REST';
  if (realtimeStatus === 'warming') return t(language, 'home.market.warming', '同步中');
  if (realtimeStatus === 'connecting' || realtimeStatus === 'reconnecting') {
    return t(language, 'home.market.connecting', '连接中');
  }
  if (realtimeStatus === 'paused') return t(language, 'home.market.paused', '暂停');
  if (realtimeStatus === 'stale') return t(language, 'home.market.stale', '延迟');
  return '';
}

function isFreshBtcMarketCard(item, now = Date.now()) {
  const realtimeAt = Number(item?.realtimeReceivedAt || item?.realtimeAt || 0);
  return Boolean(realtimeAt && now - realtimeAt <= BTC_STATUS_DISPLAY_GRACE_MS);
}

function resolveBtcDisplayRealtimeStatus(item, nextStatus) {
  const currentStatus = item?.realtimeStatus || (item?.realtime ? 'live' : '');
  const status = nextStatus || currentStatus;
  if (
    ['connecting', 'reconnecting', 'paused'].includes(status)
    && ['live', 'fallback'].includes(currentStatus)
    && isFreshBtcMarketCard(item)
  ) {
    return currentStatus;
  }
  return status;
}

function MiniMarketCard({ item, marketColorMode, language }) {
  if (item?.error) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 min-h-[122px]">
        <div className="text-[10px] font-normal leading-tight text-white/80">{marketCardName(item, language)}</div>
        <div className="mt-3 text-[11px] text-rose-300">{t(language, 'home.market.fetchFailed', '拉取失败')}</div>
      </div>
    );
  }

  const color = hasFiniteMarketValue(item?.changePercent) ? marketColor(item?.changePercent, marketColorMode) : '#8b949e';
  const ticker = item?.displaySymbol || item?.symbol || item?.ticker || '--';
  const isBtc = isBtcMarketCard(item);
  const realtimeStatus = item?.realtimeStatus || (item?.realtime ? 'live' : '');
  const realtimeLabel = marketRealtimeLabel(realtimeStatus, language);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-2.5 min-h-[122px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <div className="min-w-0 truncate text-[10px] font-normal leading-tight text-white/80">{marketCardName(item, language)}</div>
        {isBtc && realtimeLabel && (
          <span className={`shrink-0 rounded-full border px-1.5 py-[1px] text-[8px] font-normal leading-none ${realtimeStatus === 'live' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-300' : 'border-amber-300/25 bg-amber-400/10 text-amber-300'}`}>
            {realtimeLabel}
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-white/40">{ticker}</div>
      <div className="mt-2 -ml-1 whitespace-nowrap text-[14px] font-normal leading-none tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>
        {fmtOptionalMoney(item?.price, 2)}
      </div>
      <div className="mt-1 text-[11px] font-normal tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>
        {fmtOptionalMarketPct(item?.changePercent)}
      </div>
      <Sparkline values={item?.intraday || []} color={color} />
    </div>
  );
}

function RadarVisual({ active }) {
  return (
    <div className="relative h-[62px] w-[62px] shrink-0 rounded-full border border-emerald-400/10 bg-emerald-400/[0.03]">
      <div className="absolute inset-2 rounded-full border border-emerald-400/10" />
      <div className="absolute inset-[13px] rounded-full border border-emerald-400/10" />
      <div className="absolute inset-[19px] rounded-full border border-emerald-400/10" />
      <div className="radar-sweep absolute inset-2 rounded-full" />
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
      <span className={`absolute right-2.5 top-2.5 h-3 w-3 rounded-full ${active ? 'bg-emerald-400' : 'bg-amber-400'} shadow-[0_0_12px_rgba(52,211,153,0.75)]`} />
    </div>
  );
}

function fgiLevel(value, language = 'zh') {
  const v = num(value);
  if (v <= 20) return { label: t(language, 'home.fgi.extremeFear', '极度恐惧'), color: '#f43f5e', desc: t(language, 'home.fgi.extremeFearDesc', '市场极度恐惧') };
  if (v <= 40) return { label: t(language, 'home.fgi.fear', '恐惧'), color: '#fb7185', desc: t(language, 'home.fgi.fearDesc', '市场偏恐惧, 谨慎布局') };
  if (v <= 60) return { label: t(language, 'home.fgi.neutral', '中性'), color: '#facc15', desc: t(language, 'home.fgi.neutralDesc', '市场情绪中性') };
  if (v <= 80) return { label: t(language, 'home.fgi.greed', '贪婪'), color: '#22c55e', desc: t(language, 'home.fgi.greedDesc', '市场偏贪婪, 控制追高') };
  return { label: t(language, 'home.fgi.extremeGreed', '极度贪婪'), color: '#16a34a', desc: t(language, 'home.fgi.extremeGreedDesc', '高风险区, 减仓为主') };
}

function fgiValueToAngle(value) {
  return 180 - (Math.max(0, Math.min(100, num(value))) / 100) * 180;
}

function fgiPolarPoint(cx, cy, radiusX, radiusY, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: cx + radiusX * Math.cos(radians),
    y: cy - radiusY * Math.sin(radians),
  };
}

function describeFgiArc(cx, cy, radiusX, radiusY, startValue, endValue) {
  const startAngle = fgiValueToAngle(startValue);
  const endAngle = fgiValueToAngle(endValue);
  const start = fgiPolarPoint(cx, cy, radiusX, radiusY, startAngle);
  const end = fgiPolarPoint(cx, cy, radiusX, radiusY, endAngle);
  const largeArcFlag = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radiusX} ${radiusY} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function FgiGauge({ value, language }) {
  const v = Math.max(0, Math.min(100, num(value)));
  const cx = 80;
  const cy = 57;
  const radiusX = 54;
  const radiusY = 36;
  const angle = fgiValueToAngle(v);
  const level = fgiLevel(v, language);
  const pointer = fgiPolarPoint(cx, cy, 42, 28, angle);
  const arcPath = describeFgiArc(cx, cy, radiusX, radiusY, 0, 100);
  const separators = [20, 50, 80].map((tick) => ({
    inner: fgiPolarPoint(cx, cy, radiusX - 6, radiusY - 4, fgiValueToAngle(tick)),
    outer: fgiPolarPoint(cx, cy, radiusX + 1, radiusY + 1, fgiValueToAngle(tick)),
  }));
  const labelStyle = {
    fontFamily: NUMBER_FONT,
    textShadow: '0 1px 2px #0b0f14, 0 0 4px #0b0f14',
  };
  return (
    <div className="relative h-[54px] w-full" aria-label={t(language, 'home.fgiAria', 'CNN 恐慌贪婪指数 {{value}} {{level}}', { value: Math.round(v), level: level.label })}>
      <svg viewBox="0 0 160 72" className="absolute inset-x-0 top-0 h-[54px] w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="fgiArcGradient" x1="26" y1="57" x2="134" y2="57" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="33%" stopColor="#fb923c" />
            <stop offset="53%" stopColor="#facc15" />
            <stop offset="72%" stopColor="#a3e635" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="fgiPointerGradient" x1={cx} y1={cy} x2={pointer.x} y2={pointer.y} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={level.color} stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f8fafc" stopOpacity="0.95" />
          </linearGradient>
          <filter id="fgiGaugeGlow" x="-30%" y="-40%" width="160%" height="170%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="fgiPointGlow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={arcPath} fill="none" stroke="url(#fgiArcGradient)" strokeWidth="7.5" strokeLinecap="round" opacity="0.24" filter="url(#fgiGaugeGlow)" />
        <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
        <path d={arcPath} fill="none" stroke="url(#fgiArcGradient)" strokeWidth="6" strokeLinecap="round" filter="url(#fgiGaugeGlow)" />
        {separators.map((tick, index) => (
          <line key={index} x1={tick.inner.x} y1={tick.inner.y} x2={tick.outer.x} y2={tick.outer.y} stroke="#0b0f14" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
        ))}
        <line x1={cx} y1={cy} x2={pointer.x} y2={pointer.y} stroke="url(#fgiPointerGradient)" strokeWidth="1.7" strokeLinecap="round" filter="url(#fgiGaugeGlow)" />
        <circle cx={cx} cy={cy} r="11" fill="none" stroke={level.color} strokeOpacity="0.08" />
        <circle cx={cx} cy={cy} r="7.5" fill="none" stroke={level.color} strokeOpacity="0.14" />
        <circle cx={cx} cy={cy} r="5" fill={level.color} fillOpacity="0.22" filter="url(#fgiPointGlow)" />
        <circle cx={cx} cy={cy} r="3.2" fill="#f8fafc" />
        <circle cx={pointer.x} cy={pointer.y} r="6.2" fill={level.color} fillOpacity="0.26" filter="url(#fgiPointGlow)" />
        <circle cx={pointer.x} cy={pointer.y} r="4" fill={level.color} stroke="#f8fafc" strokeWidth="1.4" />
        <text x="80" y="53" textAnchor="middle" fill={level.color} fontSize="14" fontWeight="600" style={{ fontFamily: NUMBER_FONT }}>{Math.round(v)}</text>
      </svg>
      <span className="pointer-events-none absolute bottom-[3px] -translate-x-1/2 text-[8px] font-medium leading-none text-[#8f98a6]" style={{ ...labelStyle, left: '21%' }}>0</span>
      <span className="pointer-events-none absolute left-1/2 top-[4px] -translate-x-1/2 text-[8px] font-medium leading-none text-[#8f98a6]" style={labelStyle}>50</span>
      <span className="pointer-events-none absolute bottom-[3px] -translate-x-1/2 text-[8px] font-medium leading-none text-[#8f98a6]" style={{ ...labelStyle, left: '81.5%' }}>100</span>
    </div>
  );
}

export default function HomeTab({ ctx }) {
  const {
    addStock,
    benchmarkDrawdown,
    benchmarkMenuOpen,
    benchmarkOptions,
    benchmarkStatus,
    benchmarkStock,
    benchmarkSymbol,
    btcMarketCard,
    btcRealtimeLastTick,
    btcRealtimeStatus,
    cacheStockLogo,
    CheckCircle2,
    ChevronRight,
    deleteWatchlistItem,
    displayStockName,
    fetchRealtimePrices,
    fetching,
    fgi,
    fgiDataDate,
    fgiMonth,
    fgiPrev,
    fgiWeek,
    fgiYear,
    fmtPct,
    homeWatchlist,
    indices,
    investmentSummary,
    language = 'zh',
    Loader2,
    logoCache,
    marketColorMode,
    marketIndices,
    newStock,
    portfolioCurrencyMode,
    quoteRows,
    RefreshCw,
    reorderWatchlist,
    setBenchmarkMenuOpen,
    setBenchmarkSymbol,
    setNewStock,
    setPortfolioCurrencyMode,
    setShowAddStock,
    showAddStock,
    stockFreshnessStartedAt = 0,
    vix,
    vixDataDate,
    vixSignal,
    watchlist,
  } = ctx;

  const [tableTab, setTableTab] = React.useState('watchlist');
  const [stockSearch, setStockSearch] = React.useState('');
  const [addingStockSymbol, setAddingStockSymbol] = React.useState(null);
  const [addStockNotice, setAddStockNotice] = React.useState(null);
  const [showEditWatchlist, setShowEditWatchlist] = React.useState(false);
  const [editWatchlistSearch, setEditWatchlistSearch] = React.useState('');
  const [editActionKey, setEditActionKey] = React.useState(null);
  const [editNotice, setEditNotice] = React.useState(null);
  const [pendingDeleteSymbol, setPendingDeleteSymbol] = React.useState(null);
  const [tableSorts, setTableSorts] = React.useState({
    watchlist: { key: null, direction: 'desc' },
    positions: { key: null, direction: 'desc' },
  });
  const [fallbackCurrencyMode, setFallbackCurrencyMode] = React.useState(() => {
    try {
      const shared = localStorage.getItem(PORTFOLIO_CURRENCY_STORAGE_KEY);
      if (shared === 'USD' || shared === 'CNY') return shared;
      return localStorage.getItem(HOME_CURRENCY_STORAGE_KEY) === 'CNY' ? 'CNY' : 'USD';
    } catch {
      return 'USD';
    }
  });
  const currencyMode = portfolioCurrencyMode === 'USD' || portfolioCurrencyMode === 'CNY' ? portfolioCurrencyMode : fallbackCurrencyMode;
  const setCurrencyMode = React.useCallback((nextMode) => {
    const normalized = nextMode === 'CNY' ? 'CNY' : 'USD';
    setFallbackCurrencyMode(normalized);
    if (typeof setPortfolioCurrencyMode === 'function') setPortfolioCurrencyMode(normalized);
  }, [setPortfolioCurrencyMode]);
  const summary = investmentSummary || emptySummary;
  const englishMode = isEnglishLanguage(language);
  const positions = summary.activePositions || [];
  const stockDisplayName = typeof displayStockName === 'function'
    ? displayStockName
    : ((symbol, name) => String(name || symbol || '').trim());
  const positionsBySymbol = React.useMemo(() => new Map(positions.map((p) => [p.symbol, p])), [positions]);
  const displayWatchlist = homeWatchlist || watchlist || [];
  const vixDateLabel = dataDateLabel(vixDataDate);
  const fgiDateLabel = dataDateLabel(fgiDataDate);
  const fgiInfo = fgiLevel(fgi, language);
  const rawIndexCards = React.useMemo(() => (
    Array.isArray(marketIndices) && marketIndices.length > 0
      ? marketIndices
      : (indices || []).filter((item) => !isBtcMarketCard(item))
  ), [indices, marketIndices]);
  const resolvedIndexCards = React.useMemo(() => (
    mergeIndexCardsWithPlaceholders(rawIndexCards, 'connecting')
  ), [rawIndexCards]);
  const resolvedBtcCard = btcMarketCard || (indices || []).find((item) => isBtcMarketCard(item)) || null;
  const marketCards = React.useMemo(() => {
    const indexCards = (resolvedIndexCards || []).slice(0, 3);
    const placeholderStatus = btcRealtimeStatus && !['idle', 'disabled'].includes(btcRealtimeStatus) ? btcRealtimeStatus : 'connecting';
    const btcCardSource = resolvedBtcCard || createBtcPlaceholderMarketCard(placeholderStatus);
    const btcCard = {
      ...btcCardSource,
      realtimeStatus: resolvedBtcCard
        ? resolveBtcDisplayRealtimeStatus(resolvedBtcCard, btcRealtimeStatus)
        : placeholderStatus,
      realtimeTransportStatus: btcRealtimeStatus,
      realtimeAt: resolvedBtcCard?.realtimeAt || btcRealtimeLastTick || btcCardSource.realtimeAt,
    };
    return [...indexCards, btcCard];
  }, [resolvedIndexCards, resolvedBtcCard, btcRealtimeStatus, btcRealtimeLastTick]);
  const signalIsCalm = num(benchmarkDrawdown) > -0.05;
  const isCnyMode = currencyMode === 'CNY';
  const displayCurrency = isCnyMode ? 'CNY' : 'USD';
  const displayCurrencyLabel = isCnyMode ? 'CNY' : 'USD';
  const displayRate = isCnyMode ? summary.usdRate : 1;
  const displayAssets = isCnyMode ? summary.totalAssetsCny : summary.totalAssetsUsd;
  const displayAssetMoney = splitCurrencyAmount(displayAssets, displayCurrency, 2);
  const hasTodayPnl = summary.hasTodayPnl !== false;
  const displayTodayPnl = hasTodayPnl ? summary.todayPnl * displayRate : null;
  const displayCumulativePnl = summary.cumulativePnl * displayRate;
  const pnlAmountClass = 'text-[13px]';

  React.useEffect(() => {
    try {
      localStorage.setItem(PORTFOLIO_CURRENCY_STORAGE_KEY, currencyMode);
      localStorage.setItem(HOME_CURRENCY_STORAGE_KEY, currencyMode);
    } catch {}
  }, [currencyMode]);

  const resetNewStock = () => setNewStock({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' });

  const isWatchlistTab = tableTab === 'watchlist';
  const allRows = tableTab === 'positions' ? positions : displayWatchlist;
  const rows = allRows;
  const watchlistSymbols = React.useMemo(
    () => new Set((watchlist || []).map((item) => String(item?.symbol || '').toUpperCase())),
    [watchlist],
  );
  const quoteBySymbol = React.useMemo(() => {
    const map = new Map();
    [...displayWatchlist, ...positions].forEach((item) => {
      if (item?.symbol) map.set(String(item.symbol).toUpperCase(), item);
    });
    return map;
  }, [displayWatchlist, positions]);
  const freshQuoteBySymbol = React.useMemo(() => {
    const map = new Map();
    (quoteRows || []).forEach((item) => {
      if (item?.symbol) map.set(String(item.symbol).toUpperCase(), item);
    });
    return map;
  }, [quoteRows]);
  const normalizedSearch = stockSearch.trim().toUpperCase();
  const filteredPopularStocks = POPULAR_US_STOCKS.filter((item) => {
    if (!normalizedSearch) return true;
    const haystack = `${item.symbol} ${item.name} ${item.company}`.toUpperCase();
    return haystack.includes(normalizedSearch);
  });
  const canAddCustomStock = /^[A-Z0-9.-]{1,12}$/.test(normalizedSearch)
    && !POPULAR_US_STOCKS.some((item) => item.symbol === normalizedSearch)
    && !watchlistSymbols.has(normalizedSearch);
  const isAddingStock = Boolean(addingStockSymbol);
  const activeTableSort = tableSorts[tableTab] || { key: null, direction: 'desc' };
  const showPnlColumn = tableTab === 'positions';
  const metricGridTemplate = showPnlColumn ? '68px 70px 88px 84px 112px' : '68px 70px 88px 84px';
  const metricMinWidth = showPnlColumn ? 438 : 322;
  const metricColumns = [
    { key: 'price', label: t(language, 'home.price', '价格') },
    { key: 'change', label: t(language, 'home.change', '涨跌幅') },
    { key: 'drawdown', label: t(language, 'home.drawdown52w', '52周跌幅') },
    { key: 'ytd', label: t(language, 'home.ytd', '年初至今') },
    ...(showPnlColumn ? [{ key: 'pnl', label: t(language, 'home.holdingPnl', '持仓盈亏') }] : []),
  ];
  const handleTableSort = (key) => {
    setTableSorts((current) => {
      const previous = current[tableTab] || { key: null, direction: 'desc' };
      const direction = previous.key === key && previous.direction === 'desc' ? 'asc' : 'desc';
      return { ...current, [tableTab]: { key, direction } };
    });
  };

  React.useEffect(() => {
    if ((!showAddStock && !showEditWatchlist) || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddStock, showEditWatchlist]);

  const closeAddStockSheet = () => {
    if (isAddingStock) return;
    setShowAddStock(false);
    setStockSearch('');
    resetNewStock();
  };
  const closeEditWatchlist = () => {
    if (editActionKey) return;
    setShowEditWatchlist(false);
    setEditWatchlistSearch('');
    setPendingDeleteSymbol(null);
    setEditNotice(null);
  };
  const handleAddStock = async (stockDraft) => {
    if (isAddingStock) return;
    const symbol = String(stockDraft?.symbol || '').trim().toUpperCase();
    setAddingStockSymbol(symbol || 'CUSTOM');
    try {
      const result = await addStock(stockDraft);
      if (result?.success) {
        const added = result.item?.symbol || symbol;
        setStockSearch('');
        setAddStockNotice({
          type: 'success',
          title: t(language, 'home.addSuccess', '添加成功'),
          desc: t(language, 'home.addSuccessDesc', '{{symbol}} 已加入自选股票', { symbol: added }),
        });
        return;
      }
      setAddStockNotice({
        type: 'error',
        title: t(language, 'home.addFailed', '添加失败'),
        desc: result?.error || t(language, 'home.addFailedDesc', '添加自选股票失败, 请稍后重试'),
      });
    } catch (error) {
      setAddStockNotice({
        type: 'error',
        title: t(language, 'home.addFailed', '添加失败'),
        desc: error?.message || t(language, 'home.addFailedDesc', '添加自选股票失败, 请稍后重试'),
      });
    } finally {
      setAddingStockSymbol(null);
    }
  };
  const rawTableRows = rows.map((row) => {
    const isPosition = tableTab === 'positions';
    const symbol = row.symbol;
    const quote = quoteBySymbol.get(symbol) || row;
    const freshQuote = freshQuoteBySymbol.get(String(symbol || '').toUpperCase());
    const position = isPosition ? row : positionsBySymbol.get(symbol);
    const price = isPosition ? row.currentPrice : row.price;
    const changePct = isPosition ? row.changePercent : row.changePercent;
    const pnlValue = position ? position.totalPnl : null;
    const pnlPct = position ? position.totalPnlPct : null;
    const pnlDisplayValue = pnlValue === null ? null : pnlValue * displayRate;
    const high = row.high || row.week52High || quote?.high || quote?.week52High;
    const highDrawdown = drawdownFromHigh(price, high);
    const ytdRaw = quote?.ytdChangePercent ?? row.ytdChangePercent;
    const ytdChangePercent = Number.isFinite(Number(ytdRaw)) ? Number(ytdRaw) : null;
    const color = marketColor(changePct, marketColorMode);
    const ytdColor = ytdChangePercent === null ? '#ffffff40' : marketColor(ytdChangePercent, marketColorMode);
    const cachedLogoUrl = logoCache?.[String(symbol || '').toUpperCase()]?.url;
    const logoUrls = logoUrlCandidates(symbol, cachedLogoUrl, row.logoURL, row.logoUrl, quote?.logoURL, quote?.logoUrl);
    const displayName = stockDisplayName(symbol, row.name || quote?.name, language);

    return {
      row,
      isPosition,
      symbol,
      quote,
      price,
      maskPrice: isPosition && shouldMaskFreshPrice(symbol, freshQuote, stockFreshnessStartedAt),
      changePct,
      pnlValue,
      pnlPct,
      pnlDisplayValue,
      highDrawdown,
      ytdChangePercent,
      color,
      ytdColor,
      logoUrls,
      displayName,
    };
  });
  const tableRows = React.useMemo(() => {
    if (!activeTableSort?.key) return rawTableRows;
    const direction = activeTableSort.direction === 'asc' ? 1 : -1;
    return [...rawTableRows].sort((a, b) => {
      const av = sortMetricValue(a, activeTableSort.key);
      const bv = sortMetricValue(b, activeTableSort.key);
      const aMissing = av === null || av === undefined || !Number.isFinite(Number(av));
      const bMissing = bv === null || bv === undefined || !Number.isFinite(Number(bv));
      if (aMissing && bMissing) return a.symbol.localeCompare(b.symbol);
      if (aMissing) return 1;
      if (bMissing) return -1;
      const diff = (Number(av) - Number(bv)) * direction;
      return diff || a.symbol.localeCompare(b.symbol);
    });
  }, [rawTableRows, activeTableSort]);
  const editSearchKey = editWatchlistSearch.trim().toUpperCase();
  const editWatchlistRows = (watchlist || []).map((row) => {
    const symbol = String(row?.symbol || '').toUpperCase();
    const quote = quoteBySymbol.get(symbol) || row;
    const cachedLogoUrl = logoCache?.[symbol]?.url;
    return {
      ...row,
      symbol,
      displayName: stockDisplayName(symbol, row?.name || quote?.name, language),
      price: quote?.price || row?.price,
      changePercent: quote?.changePercent ?? row?.changePercent,
      logoUrls: logoUrlCandidates(symbol, cachedLogoUrl, row?.logoURL, row?.logoUrl, quote?.logoURL, quote?.logoUrl),
    };
  });
  const filteredEditWatchlistRows = editWatchlistRows.filter((row) => {
    if (!editSearchKey) return true;
    return `${row.symbol} ${row.displayName || ''}`.toUpperCase().includes(editSearchKey);
  });
  const moveWatchlistItem = async (symbol, action) => {
    if (editActionKey) return;
    const index = (watchlist || []).findIndex((item) => String(item?.symbol || '').toUpperCase() === symbol);
    if (index < 0) return;
    const next = [...watchlist];
    const [target] = next.splice(index, 1);
    if (action === 'pin') {
      next.unshift(target);
    } else if (action === 'up') {
      next.splice(Math.max(0, index - 1), 0, target);
    } else if (action === 'down') {
      next.splice(Math.min(next.length, index + 1), 0, target);
    }
    const actionText = action === 'pin' ? t(language, 'home.pin', '置顶') : action === 'up' ? t(language, 'home.moveUp', '上移') : t(language, 'home.moveDown', '下移');
    setEditActionKey(`${symbol}:${action}`);
    setEditNotice(null);
    const result = await reorderWatchlist(next);
    if (result?.success) {
      setEditNotice({ type: 'success', title: t(language, 'home.sortSaved', '排序已保存'), desc: t(language, 'home.sortSavedDesc', '{{symbol}} 已{{action}}', { symbol, action: actionText }) });
    } else {
      setEditNotice({ type: 'error', title: t(language, 'home.saveFailed', '保存失败'), desc: result?.error || t(language, 'home.actionFailedDesc', '{{symbol}} {{action}}失败', { symbol, action: actionText }) });
    }
    setEditActionKey(null);
  };
  const confirmDeleteWatchlistItem = async (symbol) => {
    if (editActionKey) return;
    setEditActionKey(`${symbol}:delete`);
    setEditNotice(null);
    const result = await deleteWatchlistItem(symbol);
    if (result?.success) {
      setPendingDeleteSymbol(null);
      setEditNotice({ type: 'success', title: t(language, 'home.deleteSuccess', '删除成功'), desc: t(language, 'home.deleteSuccessDesc', '{{symbol}} 已移出自选股票', { symbol }) });
    } else {
      setEditNotice({ type: 'error', title: t(language, 'home.deleteFailed', '删除失败'), desc: result?.error || t(language, 'home.deleteFailedDesc', '{{symbol}} 删除失败', { symbol }) });
    }
    setEditActionKey(null);
  };

  return (
    <div className="mx-auto max-w-[430px] overflow-x-hidden pb-2 text-white" style={{ fontFamily: HOME_FONT }}>
      <style>{`
        @keyframes radarSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .radar-sweep {
          background: conic-gradient(from 0deg, rgba(34,197,94,0.42), rgba(34,197,94,0.06) 52deg, transparent 96deg);
          animation: radarSpin 4.8s linear infinite;
          opacity: 0.9;
        }
      `}</style>

      <section className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-[13px] font-normal text-white/70">{t(language, 'home.totalAssets', '总资产')} ({displayCurrencyLabel}) <span className="ml-1 text-white/50">◎</span></div>
          <div className="ml-auto flex justify-end">
            <div className="flex rounded-full border border-white/10 bg-black/20 p-0.5">
              {['USD', 'CNY'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCurrencyMode(mode)}
                  className={`h-7 rounded-full px-2.5 text-[11px] font-normal active:scale-95 ${currencyMode === mode ? 'bg-[#f6b54b] text-[#101318]' : 'text-white/45'}`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={fetchRealtimePrices}
              disabled={fetching}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="mt-3 whitespace-nowrap text-[34px] font-normal leading-none tracking-normal text-[#ffd18a] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
          <span>{displayAssetMoney.main}</span>
          <span className="ml-0.5 align-baseline text-[20px] font-normal leading-none text-[#ffd18a]/90">{displayAssetMoney.decimal}</span>
        </div>
        <div
          className="mt-6 grid grid-cols-[1fr_1.12fr_0.96fr] divide-x divide-white/10"
        >
          <div className="min-w-0 pr-3">
            <div className="text-[12px] text-white/50">{t(language, 'home.todayPnl', '今日盈亏')}</div>
            <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-normal leading-tight tabular-nums ${pnlColor(hasTodayPnl ? summary.todayPnl : 0, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
              {hasTodayPnl ? fmtSignedCurrency(displayTodayPnl, displayCurrency, 2) : '--'}
            </div>
            <div className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-1 text-[12px] font-normal tabular-nums ${pnlColor(hasTodayPnl ? summary.todayPnl : 0, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
              <span>{hasTodayPnl ? fmtSignedPct(summary.todayPnlPct, 2) : '--'}</span>
              {hasTodayPnl && summary.todayPnlLocked && (
                <span className="text-[10px] text-[#6f7785]">{t(language, 'home.pnlLocked', '收盘锁定')}</span>
              )}
            </div>
          </div>
          <div className="min-w-0 px-3">
            <div className="text-[12px] text-white/50">{t(language, 'home.totalPnl', '累计盈亏')}</div>
            <div className={`mt-2 whitespace-nowrap ${pnlAmountClass} font-normal leading-tight tabular-nums ${pnlColor(summary.cumulativePnl, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
              {fmtSignedCurrency(displayCumulativePnl, displayCurrency, 2)}
            </div>
            <div className={`mt-1 text-[12px] font-normal tabular-nums ${pnlColor(summary.cumulativePnl, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
              {fmtSignedPct(summary.cumulativePnlPct, 2)}
            </div>
          </div>
          <div className="min-w-0 pl-3">
            <div className="text-[12px] text-white/50">{t(language, 'home.positions', '持仓数量')}</div>
            <div className={`mt-3 whitespace-nowrap ${englishMode ? 'text-[14px]' : 'text-[15px]'} font-normal leading-tight text-white/90`}>
              {t(language, 'home.holdingsTrades', '{{holdings}}只 · {{trades}}笔', { holdings: summary.holdingStockCount, trades: summary.sellTradeCount })}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-[#0b0f14] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12px] font-semibold text-white/70">{t(language, 'home.currentSignal', '当前信号')}</div>
          <button
            type="button"
            onClick={() => setBenchmarkMenuOpen(!benchmarkMenuOpen)}
            className="relative rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white/50 active:scale-95"
          >
            {t(language, 'home.strategyStatus', '策略状态')}
          </button>
        </div>
        <div className="grid grid-cols-[62px_minmax(0,1fr)_70px] items-center gap-3">
          <RadarVisual active={signalIsCalm} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="truncate text-base font-black text-white">{cleanSignalText(benchmarkStatus?.text, language)}</div>
              <span className={`h-3 w-3 shrink-0 rounded-full ${signalIsCalm ? 'bg-emerald-400' : 'bg-amber-400'} shadow-[0_0_12px_rgba(52,211,153,0.75)]`} />
            </div>
            <div className="mt-1.5 text-[11px] text-white/50">{englishMode ? t(language, 'home.pullbackStayCash', '回撤<5%, 空仓等待') : (benchmarkStatus?.desc || '回撤<5%, 空仓等待')}</div>
            <div className="mt-2.5 truncate text-[11px] text-white/40">{t(language, 'home.waitHigherProbability', '耐心等待更高胜率机会')}</div>
          </div>
          <div className="relative text-right">
            <button
              type="button"
              onClick={() => setBenchmarkMenuOpen(!benchmarkMenuOpen)}
              className={`text-[19px] font-black leading-none tabular-nums ${pnlColor(benchmarkDrawdown, marketColorMode)}`}
              style={{ fontFamily: NUMBER_FONT }}
            >
              {fmtPct ? fmtPct(benchmarkDrawdown) : fmtSignedPct(benchmarkDrawdown, 1)}
            </button>
            <div className="mt-1.5 text-[10px] text-white/50">{benchmarkStock?.symbol || benchmarkSymbol || 'QQQ'} {t(language, 'home.pullback', '回撤')}</div>
            {benchmarkMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBenchmarkMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#111820] text-left shadow-2xl">
                  <div className="border-b border-white/10 px-3 py-2 text-[11px] font-bold text-white/40">{t(language, 'home.switchBenchmark', '切换基准')}</div>
                  {(benchmarkOptions || []).map((item) => {
                    const active = item.symbol === benchmarkSymbol;
                    return (
                      <button
                        key={item.symbol}
                        type="button"
                        onClick={() => {
                          setBenchmarkSymbol(item.symbol);
                          setBenchmarkMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2.5 text-sm ${active ? 'bg-emerald-400/10 text-emerald-200' : 'text-white/70'}`}
                      >
                        <span>
                          <span className="block font-black">{item.symbol}</span>
                          <span className="block truncate text-[11px] text-white/40">{item.name}</span>
                        </span>
                        {active && <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        {benchmarkStock && (
          <div className="mt-2.5 flex justify-end whitespace-nowrap text-[10px] text-white/40 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
            ${fmtMoney(benchmarkStock.price, 2)} / {t(language, 'home.week52High', '52周高')} ${fmtMoney(benchmarkStock.high, 2)}
            <ChevronRight className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-white/25" />
          </div>
        )}
      </section>

      {marketCards.length > 0 && (
      <section className="mt-3 grid grid-cols-4 gap-2">
        {marketCards.map((item) => <MiniMarketCard key={item?.ticker || item?.displaySymbol || item?.name} item={item} marketColorMode={marketColorMode} language={language} />)}
      </section>
      )}

      <section className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] px-3.5 py-2.5">
          <div className={`flex items-center gap-1.5 ${englishMode ? 'text-[10px]' : 'text-[12px]'} font-normal text-white/60`}>
            {t(language, 'home.vix.title', 'VIX 恐慌指数')}
            {vixDateLabel && <span className="text-[10px] text-white/40">{vixDateLabel} {t(language, 'home.vix.close', '收盘')}</span>}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-2xl font-normal text-emerald-400 tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{fmtMoney(vix, 1)}</span>
            <span className="h-3.5 w-3.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.75)]" />
          </div>
          <div className="mt-1.5 text-[11px] text-white/50">{englishMode ? t(language, 'home.vix.calmDesc', '市场平静, 无操作') : (vixSignal?.desc || '市场平静, 无操作')}</div>
          <div className="mt-3 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500 shadow-[0_0_10px_rgba(52,211,153,0.18)]">
            <div className="relative h-1.5">
              <span
                className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]"
                style={{ left: `${Math.max(0, Math.min(100, (num(vix) / 50) * 100))}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-white/40"><span>0</span><span>20</span><span>30</span><span>50</span></div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0b0f14] px-3.5 py-2.5">
          <div className={`flex items-center gap-1.5 ${englishMode ? 'text-[10px]' : 'text-[12px]'} font-normal text-white/60`}>
            {t(language, 'home.fgi.title', 'CNN 恐慌贪婪指数')}
            {fgiDateLabel && <span className="text-[10px] text-white/40">{fgiDateLabel}</span>}
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-normal tabular-nums" style={{ color: fgiInfo.color, fontFamily: NUMBER_FONT }}>{Math.round(num(fgi))}</span>
            <span className="text-sm font-normal" style={{ color: fgiInfo.color }}>{fgiInfo.label}</span>
          </div>
          <div className="mt-1.5 text-[11px] text-white/50">{fgiInfo.desc}</div>
          <div className="mt-0">
            <FgiGauge value={fgi} language={language} />
          </div>
        </div>
      </section>

      <section className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setTableTab('watchlist')}
              className={`text-[14px] font-bold leading-none ${tableTab === 'watchlist' ? 'text-white' : 'text-white/40'}`}
            >
              {t(language, 'home.watchlist', '自选')}
            </button>
            <button
              type="button"
              onClick={() => setTableTab('positions')}
              className={`text-[14px] font-bold leading-none ${tableTab === 'positions' ? 'text-white' : 'text-white/40'}`}
            >
              {t(language, 'home.holdings', '持仓')}
            </button>
          </div>
          <span className="h-5 w-14" aria-hidden="true" />
        </div>

        {tableRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-white/40">
            {tableTab === 'positions' ? t(language, 'home.noPositions', '暂无持仓记录, 先在交易页添加买入记录。') : t(language, 'home.noWatchlist', '暂无自选股票。')}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(92px,0.7fr)_minmax(0,3.15fr)] px-3">
              <div>
                <div className="pb-1.5 pt-2 text-[11px] font-medium leading-none text-white/36">{t(language, 'home.name', '名称')}</div>
                <div className="divide-y divide-white/[0.06]">
                  {tableRows.map((item) => (
                    <div
                      key={item.symbol}
                      className="flex min-h-[54px] w-full min-w-0 items-center gap-2 py-2 pr-2 text-left"
                    >
                      <StockLogo symbol={item.symbol} urls={item.logoUrls} onLogoLoad={cacheStockLogo} className="h-7 w-7 rounded-lg" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold leading-[14px] text-white">{item.symbol}</span>
                        <span className="block truncate text-[10px] leading-[12px] text-white/40">{item.displayName}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div style={{ minWidth: `${metricMinWidth}px` }}>
                  <div
                    className="grid gap-1 pb-1.5 pt-2 text-[11px] font-medium leading-none"
                    style={{ gridTemplateColumns: metricGridTemplate }}
                  >
                    {metricColumns.map((column) => (
                      <SortHeader
                        key={column.key}
                        label={column.label}
                        sortKey={column.key}
                        sortState={activeTableSort}
                        onSort={handleTableSort}
                      />
                    ))}
                  </div>
                  <div className="divide-y divide-white/[0.06]">
                    {tableRows.map((item) => (
                      <div
                        key={item.symbol}
                        className="grid min-h-[54px] w-full items-center gap-1 py-2 text-left"
                        style={{ gridTemplateColumns: metricGridTemplate }}
                      >
                        <span className="text-right text-[13px] tabular-nums text-white/78" style={{ fontFamily: NUMBER_FONT }}>{item.maskPrice ? '--' : fmtMoney(item.price, 2)}</span>
                        <span className="text-right text-[13px] font-medium tabular-nums" style={{ color: item.color, fontFamily: NUMBER_FONT }}>{fmtMarketPct(item.changePct)}</span>
                        <span className={`text-right text-[13px] font-medium tabular-nums ${item.highDrawdown === null ? 'text-white/25' : pnlColor(item.highDrawdown, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                          {fmtDrawdownPct(item.highDrawdown)}
                        </span>
                        <span className="text-right text-[13px] font-medium tabular-nums" style={{ color: item.ytdColor, fontFamily: NUMBER_FONT }}>
                          {fmtOptionalMarketPct(item.ytdChangePercent)}
                        </span>
                        {showPnlColumn && (
                          <span className={`text-right tabular-nums ${item.pnlValue === null ? 'text-white/25' : pnlColor(item.pnlValue, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
                            {item.pnlValue === null ? (
                              <span className="text-[13px] font-medium">--</span>
                            ) : (
                              <>
                                <span className="block text-[13px] font-black leading-[15px]">{fmtSignedCurrency(item.pnlDisplayValue, displayCurrency, 2)}</span>
                                <span className="mt-1 block text-[11px] font-bold leading-[13px]">{fmtSignedPct(item.pnlPct, 2)}</span>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </section>

      {isWatchlistTab && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowAddStock(true)}
            className="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-[#f6b54b]/80 bg-[#0b0f14] px-2 text-[13px] font-normal text-[#f6b54b] shadow-[0_0_20px_rgba(246,181,75,0.08)] active:scale-[0.99]"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(language, 'home.addWatchlistStock', '添加自选股票')}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowEditWatchlist(true)}
            className="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-[#0b0f14] px-2 text-[13px] font-normal text-white/80 shadow-[0_0_20px_rgba(255,255,255,0.04)] active:scale-[0.99]"
          >
            <Pencil className="h-4 w-4 shrink-0 text-[#f6b54b]" />
            <span className="truncate">{t(language, 'home.editWatchlistStock', '编辑自选股票')}</span>
          </button>
        </div>
      )}

      {showAddStock && isWatchlistTab && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/70 px-3 py-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeAddStockSheet();
          }}
        >
          <div className="flex max-h-[min(76dvh,620px)] w-full max-w-[400px] flex-col rounded-[22px] border border-white/10 bg-[#0b0f14] p-4 shadow-[0_24px_58px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h3 className="text-[17px] font-normal text-white">{t(language, 'home.addWatchlistStock', '添加自选股票')}</h3>
              <button
                type="button"
                onClick={closeAddStockSheet}
                disabled={isAddingStock}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-white/55 active:scale-95 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-white/70 focus-within:border-[#f6b54b]/70">
              <Search className="h-4 w-4 shrink-0 text-white/35" />
              <input
                value={stockSearch}
                onChange={(event) => setStockSearch(event.target.value.toUpperCase())}
                onFocus={(event) => {
                  const input = event.currentTarget;
                  setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
                }}
                placeholder={t(language, 'home.searchStock', '搜索股票名称或代码')}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-sm font-normal text-white outline-none placeholder:text-white/25"
              />
            </label>

            <div className="mt-3 flex shrink-0 gap-2">
              <span className="flex h-9 items-center gap-1.5 rounded-lg border border-[#f6b54b]/60 bg-[#f6b54b]/10 px-3 text-[12px] font-normal text-[#f6b54b]">
                <Flame className="h-3.5 w-3.5" />
                {t(language, 'home.trending', '热门')}
              </span>
              <span className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-[12px] font-normal text-white/70">
                {t(language, 'home.usStocks', '美股')}
              </span>
            </div>

            <div className="mt-4 shrink-0 text-[12px] font-normal text-white/55">
              {normalizedSearch ? t(language, 'home.searchResults', '搜索结果') : t(language, 'home.popularStocks', '热门股票')}
            </div>

            <div className="mt-2 min-h-[160px] flex-1 overflow-y-auto overscroll-contain rounded-xl border border-white/[0.06] bg-white/[0.025]">
              {filteredPopularStocks.length === 0 && !canAddCustomStock ? (
                <div className="px-4 py-8 text-center text-[13px] text-white/35">{t(language, 'home.noMatches', '没有匹配结果')}</div>
              ) : (
                <>
                  {filteredPopularStocks.map((item) => {
                    const symbol = item.symbol;
                    const quote = quoteBySymbol.get(symbol);
                    const quotePrice = quote?.price || quote?.currentPrice;
                    const isAdded = watchlistSymbols.has(symbol);
                    const color = marketColor(quote?.changePercent, marketColorMode);
                    const logoUrls = logoUrlCandidates(symbol, logoCache?.[symbol]?.url);
                    return (
                      <div key={symbol} className="flex min-h-[61px] items-center gap-3 border-b border-white/[0.06] px-3 py-2 last:border-b-0">
                        <StockLogo symbol={symbol} urls={logoUrls} onLogoLoad={cacheStockLogo} className="h-9 w-9 rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[14px] font-normal text-white">{symbol}</span>
                            <span className="truncate text-[12px] font-normal text-white/55">{englishMode ? item.symbol : item.name}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-white/35">{item.company}</div>
                        </div>
                        <div className="w-[74px] text-right">
                          <div className="text-[13px] font-semibold tabular-nums text-white/78" style={{ fontFamily: NUMBER_FONT }}>
                            {quotePrice ? fmtMoney(quotePrice, 2) : '--'}
                          </div>
                          <div className="mt-0.5 text-[12px] font-semibold tabular-nums" style={{ color, fontFamily: NUMBER_FONT }}>
                            {quote?.changePercent !== undefined ? fmtMarketPct(quote.changePercent) : '--'}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isAdded || isAddingStock}
                          onClick={() => handleAddStock({ symbol, name: item.name })}
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border active:scale-95 disabled:active:scale-100 ${
                            isAdded
                              ? 'border-white/10 bg-white/[0.04] text-white/25'
                              : 'border-[#f6b54b]/70 bg-[#f6b54b]/10 text-[#f6b54b]'
                          }`}
                          aria-label={isAdded ? t(language, 'home.alreadyAdded', '{{symbol}} 已添加', { symbol }) : t(language, 'home.addSymbol', '添加 {{symbol}}', { symbol })}
                        >
                          {addingStockSymbol === symbol && Loader2 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                  {canAddCustomStock && (
                    <button
                      type="button"
                      disabled={isAddingStock}
                      onClick={() => handleAddStock({ symbol: normalizedSearch, name: newStock.name || normalizedSearch })}
                      className="flex min-h-[58px] w-full items-center gap-3 px-3 py-2 text-left active:bg-white/[0.04] disabled:opacity-50"
                    >
                      <LogoPlaceholder symbol={normalizedSearch} className="h-9 w-9 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-normal text-white">{normalizedSearch}</span>
                        <span className="block truncate text-[11px] text-white/35">{t(language, 'home.addCustomTicker', '添加自定义股票代码')}</span>
                      </span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#f6b54b]/70 bg-[#f6b54b]/10 text-[#f6b54b]">
                        {addingStockSymbol === normalizedSearch && Loader2 ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>

            <button
              type="button"
              disabled={!canAddCustomStock || isAddingStock}
              onClick={() => handleAddStock({ symbol: normalizedSearch, name: newStock.name || normalizedSearch })}
              className="mt-4 flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-[#f6b54b]/70 bg-transparent text-[14px] font-normal text-[#f6b54b] active:scale-[0.99] disabled:border-white/10 disabled:text-white/25"
            >
              {isAddingStock && Loader2 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isAddingStock ? t(language, 'home.adding', '添加中...') : (normalizedSearch ? t(language, 'home.addSymbol', '添加 {{symbol}}', { symbol: normalizedSearch }) : t(language, 'home.addCustomStock', '添加自定义股票'))}
            </button>
          </div>
        </div>
      )}

      {showEditWatchlist && isWatchlistTab && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden bg-black/70 px-3 py-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditWatchlist();
          }}
        >
          <div className="flex max-h-[min(78dvh,650px)] w-full max-w-[400px] flex-col rounded-[22px] border border-white/10 bg-[#0b0f14] p-4 shadow-[0_24px_58px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h3 className="text-[17px] font-normal text-white">{t(language, 'home.editWatchlistStock', '编辑自选股票')}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeEditWatchlist}
                  disabled={Boolean(editActionKey)}
                  className="h-8 rounded-full px-3 text-[12px] font-normal text-[#f6b54b] active:scale-95 disabled:opacity-40"
                >
                  {t(language, 'home.done', '完成')}
                </button>
                <button
                  type="button"
                  onClick={closeEditWatchlist}
                  disabled={Boolean(editActionKey)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-white/55 active:scale-95 disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <label className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-white/70 focus-within:border-[#f6b54b]/70">
              <Search className="h-4 w-4 shrink-0 text-white/35" />
              <input
                value={editWatchlistSearch}
                onChange={(event) => setEditWatchlistSearch(event.target.value.toUpperCase())}
                onFocus={(event) => {
                  const input = event.currentTarget;
                  setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
                }}
                placeholder={t(language, 'home.searchStock', '搜索股票名称或代码')}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-sm font-normal text-white outline-none placeholder:text-white/25"
              />
            </label>

            {editNotice && (
              <div className={`mt-3 shrink-0 rounded-xl border px-3 py-2 text-[12px] leading-5 ${
                editNotice.type === 'success'
                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                  : 'border-rose-400/25 bg-rose-400/10 text-rose-200'
              }`}>
                <div className="font-normal">{editNotice.title}</div>
                <div className="text-white/60">{editNotice.desc}</div>
              </div>
            )}

            <div className="mt-3 shrink-0 text-[12px] font-normal text-white/55">
              {t(language, 'home.currentWatchlistCount', '当前自选 · {{count}} 只', { count: editWatchlistRows.length })}
            </div>

            <div className="mt-2 min-h-[210px] flex-1 overflow-y-auto overscroll-contain rounded-xl border border-white/[0.06] bg-white/[0.025]">
              {editWatchlistRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-[13px] text-white/35">{t(language, 'home.noWatchlist', '暂无自选股票。')}</div>
              ) : filteredEditWatchlistRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-[13px] text-white/35">{t(language, 'home.noMatches', '没有匹配结果')}</div>
              ) : (
                filteredEditWatchlistRows.map((item) => {
                  const symbol = item.symbol;
                  const fullIndex = editWatchlistRows.findIndex((row) => row.symbol === symbol);
                  const isFirst = fullIndex <= 0;
                  const isLast = fullIndex === editWatchlistRows.length - 1;
                  const deletePending = pendingDeleteSymbol === symbol;
                  const busy = Boolean(editActionKey);
                  const rowBusy = editActionKey?.startsWith(`${symbol}:`);
                  return (
                    <div key={symbol} className="flex min-h-[64px] items-center gap-3 border-b border-white/[0.06] px-3 py-2 last:border-b-0">
                      <StockLogo symbol={symbol} urls={item.logoUrls} onLogoLoad={cacheStockLogo} className="h-9 w-9 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[14px] font-normal text-white">{symbol}</span>
                          <span className="truncate text-[12px] font-normal text-white/55">{item.displayName}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/35">
                          <span className="tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                            {item.price ? fmtMoney(item.price, 2) : '--'}
                          </span>
                          <span className="tabular-nums" style={{ color: marketColor(item.changePercent, marketColorMode), fontFamily: NUMBER_FONT }}>
                            {item.changePercent !== undefined ? fmtMarketPct(item.changePercent) : '--'}
                          </span>
                        </div>
                      </div>

                      {deletePending ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="text-[11px] font-bold text-rose-200">{t(language, 'home.confirmDelete', '确认删除?')}</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingDeleteSymbol(null)}
                            className="h-8 rounded-full border border-white/10 px-2.5 text-[11px] font-bold text-white/55 active:scale-95 disabled:opacity-40"
                          >
                            {t(language, 'home.cancel', '取消')}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => confirmDeleteWatchlistItem(symbol)}
                            className="flex h-8 min-w-[2rem] items-center justify-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 text-[11px] font-black text-rose-200 active:scale-95 disabled:opacity-40"
                          >
                            {rowBusy && Loader2 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t(language, 'home.delete', '删除')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={busy || isFirst}
                            onClick={() => moveWatchlistItem(symbol, 'pin')}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 active:scale-95 disabled:opacity-25"
                            title={t(language, 'home.pin', '置顶')}
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={busy || isFirst}
                            onClick={() => moveWatchlistItem(symbol, 'up')}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 active:scale-95 disabled:opacity-25"
                            title={t(language, 'home.moveUp', '上移')}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={busy || isLast}
                            onClick={() => moveWatchlistItem(symbol, 'down')}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 active:scale-95 disabled:opacity-25"
                            title={t(language, 'home.moveDown', '下移')}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingDeleteSymbol(symbol)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/20 bg-rose-400/10 text-rose-200 active:scale-95 disabled:opacity-40"
                            title={t(language, 'home.delete', '删除')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {addStockNotice && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAddStockNotice(null);
          }}
        >
          <div className="w-full max-w-[310px] rounded-2xl border border-white/10 bg-[#0b0f14] p-5 text-center shadow-[0_22px_54px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
              addStockNotice.type === 'success'
                ? 'bg-emerald-400/12 text-emerald-300'
                : 'bg-rose-400/12 text-rose-300'
            }`}>
              {addStockNotice.type === 'success' && CheckCircle2 ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <X className="h-5 w-5" />
              )}
            </div>
            <div className="mt-3 text-[17px] font-normal text-white">{addStockNotice.title}</div>
            <div className="mt-2 text-[13px] leading-5 text-white/52">{addStockNotice.desc}</div>
            <button
              type="button"
              onClick={() => setAddStockNotice(null)}
              className="mt-5 h-11 w-full rounded-xl bg-[#f6b54b] text-[14px] font-normal text-[#111318] active:scale-[0.99]"
            >
              {t(language, 'home.gotIt', '知道了')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
