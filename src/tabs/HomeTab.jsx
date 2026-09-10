import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronRight, Flame, GripVertical, LockKeyhole, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { splitCurrencyAmount } from '../lib/amountDisplay.js';
import { createBtcPlaceholderMarketCard, isBtcMarketCard } from '../lib/btcRealtime.js';
import {
  HOME_SIGNAL_ET_OPEN_TIME,
  buildHomeSignalBenchmarkRows,
  nextHomeSignalBenchmarkSortDirection,
  sortHomeSignalBenchmarkRows,
} from '../lib/homeSignalBenchmark.js';
import { resolveHomeMarketDisplayMetrics } from '../lib/homeMarketDisplay.js';
import { isEnglishLanguage, t } from '../lib/i18n.js';
import { mergeIndexCardsWithPlaceholders } from '../lib/indexRealtime.js';
import { marketHexColor, marketTextClass } from '../lib/marketColorMode.js';
import { POPULAR_US_STOCKS, POPULAR_US_STOCK_SYMBOLS } from '../lib/popularStocks.js';
import { stockLogoCandidates } from '../lib/stockLogo.js';
import { deriveHomeMarginOverview, homeMarginLeverageStatus, normalizeMarginDebtUsd } from '../lib/homeMarginRisk.js';
import ActionModalCard from '../components/ActionModalCard.jsx';
import StockReportModal from '../components/StockReportModal.jsx';
import { useWatchlistReorder } from '../components/useWatchlistReorder.js';
import AccountLeverageBadge from '../components/AccountLeverageBadge.jsx';
import AvailableCashEditor from '../components/AvailableCashEditor.jsx';
import EarningsCalendar from './EarningsCalendar.jsx';
import HomeWatchlistReport from '../components/HomeWatchlistReport.jsx';
import './HomeTab.css';
import './HomeWatchlistDialogs.css';

const PORTFOLIO_CURRENCY_STORAGE_KEY = 'xmoney_portfolio_currency';
const HOME_CURRENCY_STORAGE_KEY = 'xmoney_home_currency';
const BTC_STATUS_DISPLAY_GRACE_MS = 60_000;
const HOME_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const POPULAR_US_STOCK_BY_SYMBOL = new Map(POPULAR_US_STOCKS.map((item) => [item.symbol, item]));
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

function splitSignedCurrencyAmount(value, currency = 'USD', digits = 2) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const parts = splitCurrencyAmount(Math.abs(safeValue), currency, digits);
  return safeValue < 0 ? { ...parts, main: `-${parts.main}` } : parts;
}

function fmtLeverage(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}×` : '—';
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

function formatMarketMoversDate(value, language = 'zh') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  if (isEnglishLanguage(language)) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: Number(year) === new Date().getFullYear() ? undefined : 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${year}-${month}-${day}T00:00:00Z`));
  }
  return `${month}/${day}`;
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


function LogoPlaceholder({ symbol, className = '' }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-[10px] font-black text-white/55 ${className}`}>
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


function dataDateLabel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function Sparkline({ values = [], color = '#22c55e', className = 'h-9', showUnavailableText = true }) {
  const series = values.filter((v) => Number.isFinite(Number(v))).map(Number);
  if (series.length < 2) {
    if (!showUnavailableText) return <div className={className} aria-hidden="true" />;
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
  if (isBtcMarketCard(item)) return 'BTC';
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
  if (status === 'live' && currentStatus === 'fallback') return currentStatus;
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
      <div className="home-report-quote">
        <div className="text-[11px] font-normal leading-tight text-white/80">{marketCardName(item, language)}</div>
        <div className="mt-3 text-[11px] text-rose-300">{t(language, 'home.market.fetchFailed', '拉取失败')}</div>
      </div>
    );
  }

  const color = hasFiniteMarketValue(item?.changePercent) ? marketColor(item?.changePercent, marketColorMode) : '#8b949e';
  const isBtc = isBtcMarketCard(item);
  const realtimeStatus = item?.realtimeStatus || (item?.realtime ? 'live' : '');
  const realtimeLabel = marketRealtimeLabel(realtimeStatus, language);
  return (
    <div className="home-report-quote">
      <div className={`flex min-w-0 items-start justify-between ${isBtc ? 'gap-1' : 'gap-1.5'}`}>
        <div className="min-w-0 truncate text-[11px] font-normal leading-tight text-white/80">{marketCardName(item, language)}</div>
        {isBtc && realtimeLabel && (
          <span className="home-report-realtime-status" data-state={realtimeStatus}>
            {realtimeStatus === 'live' && <i className="home-report-live-dot" aria-hidden="true" />}
            {realtimeLabel}
          </span>
        )}
      </div>
      <div className="home-report-quote-price" style={{ fontFamily: NUMBER_FONT }}>
        {fmtOptionalMoney(item?.price, 2)}
      </div>
      <div className="home-report-quote-change" style={{ color, fontFamily: NUMBER_FONT }}>
        {fmtOptionalMarketPct(item?.changePercent)}
      </div>
      <Sparkline values={item?.intraday || []} color={color} className="home-report-sparkline" showUnavailableText={isBtc} />
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


export default function HomeTab({ ctx }) {
  const {
    addStock,
    availableCashStatus,
    availableCashStatusReady = false,
    benchmarkDrawdown,
    benchmarkMenuOpen,
    benchmarkOptions,
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
    earningsCalendarEvents,
    earningsCalendarNow,
    earningsCalendarRequest,
    fetchPopularStockQuotes,
    fetchMarketMovers,
    fgi,
    fgiDataDate,
    fmtPct,
    homeWatchlist,
    indices,
    investmentSummary,
    language = 'zh',
    Loader2,
    logoCache,
    marginStatus,
    marginStatusReady = true,
    marketColorMode,
    marketIndices,
    newStock,
    openHomeMarginRisk,
    openDrawdownObservation,
    openVixComparison,
    openEarningsCalendar,
    openEarningsDetail,
    openPnlReport,
    openPnlShare,
    openWatchlistStockDetail,
    portfolioCurrencyMode,
    quoteRows,
    RefreshCw,
    reorderWatchlist,
    loadAvailableCashMovements,
    mutateAvailableCash,
    reverseAvailableCashMovement,
    setBenchmarkMenuOpen,
    setBenchmarkSymbol,
    setNewStock,
    setPortfolioCurrencyMode,
    setShowAddStock,
    showAddStock,
    stockFreshnessStartedAt = 0,
    supabase,
    vix,
    vixDataDate,
    watchlist,
  } = ctx;

  const [tableTab, setTableTab] = React.useState('watchlist');
  const [stockSearch, setStockSearch] = React.useState('');
  const [addingStockSymbol, setAddingStockSymbol] = React.useState(null);
  const [addStockNotice, setAddStockNotice] = React.useState(null);
  const [popularQuoteRows, setPopularQuoteRows] = React.useState([]);
  const [popularQuoteStatus, setPopularQuoteStatus] = React.useState('idle');
  const [stockDiscoveryTab, setStockDiscoveryTab] = React.useState('trending');
  const [marketMovers, setMarketMovers] = React.useState({ gainers: [], losers: [], dataDate: '' });
  const [marketMoversStatus, setMarketMoversStatus] = React.useState('idle');
  const marketMoversRequestIdRef = React.useRef(0);
  const marketMoversLoadedAtRef = React.useRef(0);
  const [showAvailableCashEditor, setShowAvailableCashEditor] = React.useState(false);
  const [showEditWatchlist, setShowEditWatchlist] = React.useState(false);
  const [editWatchlistSearch, setEditWatchlistSearch] = React.useState('');
  const [editActionKey, setEditActionKey] = React.useState(null);
  const [editNotice, setEditNotice] = React.useState(null);
  const [pendingDeleteSymbol, setPendingDeleteSymbol] = React.useState(null);
  const [benchmarkSortDirection, setBenchmarkSortDirection] = React.useState(null);
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
  const benchmarkRows = React.useMemo(
    () => buildHomeSignalBenchmarkRows(benchmarkOptions, { selectedSymbol: benchmarkSymbol }),
    [benchmarkOptions, benchmarkSymbol],
  );
  const visibleBenchmarkRows = React.useMemo(
    () => sortHomeSignalBenchmarkRows(benchmarkRows, benchmarkSortDirection),
    [benchmarkRows, benchmarkSortDirection],
  );
  const selectedBenchmarkRow = benchmarkRows.find((row) => row.selected) || null;
  const benchmarkSheetMarketState = selectedBenchmarkRow?.marketState || 'locked';
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
  const isCnyMode = currencyMode === 'CNY';
  const displayCurrency = isCnyMode ? 'CNY' : 'USD';
  const displayRate = isCnyMode ? summary.usdRate : 1;
  const displayAssets = isCnyMode ? summary.totalAssetsCny : summary.totalAssetsUsd;
  const availableCashIsSet = Boolean(availableCashStatus?.isSet);
  const availableCashUsd = availableCashStatusReady && Number.isFinite(Number(availableCashStatus?.availableCashUsd))
    ? Math.max(0, Number(availableCashStatus.availableCashUsd))
    : 0;
  const displayAvailableCash = availableCashUsd * displayRate;
  const availableCashWriteReady = availableCashStatusReady && availableCashStatus?.writeReady === true;
  const availableCashReversalReady = availableCashWriteReady && availableCashStatus?.reversalReady === true;
  const assetStatusReady = marginStatusReady && availableCashStatusReady;
  const marginDebtUsd = normalizeMarginDebtUsd(marginStatus?.currentMargin);
  const marginOverview = React.useMemo(() => deriveHomeMarginOverview({
    totalAssetsUsd: summary.totalAssetsUsd,
    marginDebtUsd,
  }), [marginDebtUsd, summary.totalAssetsUsd]);
  const marginLeverageStatus = React.useMemo(() => homeMarginLeverageStatus(marginOverview), [marginOverview]);
  const displayNetAssets = marginOverview.netAssetsUsd * displayRate;
  const displayAssetMoney = splitSignedCurrencyAmount(displayNetAssets, displayCurrency, 2);
  const displayMarginDebt = marginOverview.marginDebtUsd * displayRate;
  const hasTodayPnl = summary.hasTodayPnl !== false;
  const displayTodayPnl = hasTodayPnl ? summary.todayPnl * displayRate : null;
  const displayCumulativePnl = summary.cumulativePnl * displayRate;
  const pnlAmountClass = 'home-report-pnl-amount';

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
  const popularQuoteBySymbol = React.useMemo(() => {
    const map = new Map();
    (popularQuoteRows || []).forEach((item) => {
      if (item?.symbol) map.set(String(item.symbol).toUpperCase(), item);
    });
    return map;
  }, [popularQuoteRows]);
  const normalizedSearch = stockSearch.trim().toUpperCase();
  const popularStocksWithQuotes = React.useMemo(() => POPULAR_US_STOCKS.map((item, index) => {
    const quote = popularQuoteBySymbol.get(item.symbol) || quoteBySymbol.get(item.symbol) || null;
    return { ...item, quote, rank: index };
  }).sort((a, b) => {
    if (normalizedSearch) return a.rank - b.rank;
    const aHasQuote = Number(a.quote?.price) > 0;
    const bHasQuote = Number(b.quote?.price) > 0;
    if (aHasQuote !== bHasQuote) return aHasQuote ? -1 : 1;
    if (aHasQuote && bHasQuote) {
      const diff = Math.abs(Number(b.quote?.changePercent) || 0) - Math.abs(Number(a.quote?.changePercent) || 0);
      if (Math.abs(diff) > 0.000001) return diff;
    }
    return a.rank - b.rank;
  }), [normalizedSearch, popularQuoteBySymbol, quoteBySymbol]);
  const marketMoverRows = React.useMemo(() => {
    const rows = stockDiscoveryTab === 'losers' ? marketMovers.losers : marketMovers.gainers;
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
      const symbol = String(row?.symbol || row?.ticker || row?.code || '').trim().toUpperCase();
      const name = String(row?.name || row?.company || row?.companyName || symbol).trim();
      return {
        ...row,
        symbol,
        name,
        company: String(row?.company || row?.companyName || name).trim(),
        quote: {
          ...row,
          symbol,
          price: row?.price ?? row?.close,
          changePercent: row?.changePercent ?? row?.change_p,
        },
        rank: index,
      };
    }).filter((row) => row.symbol && Number(row.quote?.price) > 0);
  }, [marketMovers.gainers, marketMovers.losers, stockDiscoveryTab]);
  const isMarketMoversTab = stockDiscoveryTab === 'gainers' || stockDiscoveryTab === 'losers';
  const discoveryStocks = isMarketMoversTab ? marketMoverRows : popularStocksWithQuotes;
  const filteredDiscoveryStocks = React.useMemo(() => discoveryStocks.filter((item) => {
    if (!normalizedSearch) return true;
    const haystack = `${item.symbol} ${item.name} ${item.company}`.toUpperCase();
    return haystack.includes(normalizedSearch);
  }), [discoveryStocks, normalizedSearch]);
  const moverSymbolSet = React.useMemo(
    () => new Set(marketMoverRows.map((item) => item.symbol)),
    [marketMoverRows],
  );
  const activeListContainsSearch = stockDiscoveryTab === 'trending'
    ? POPULAR_US_STOCK_SYMBOLS.has(normalizedSearch)
    : moverSymbolSet.has(normalizedSearch);
  const canAddCustomStock = /^[A-Z0-9.-]{1,12}$/.test(normalizedSearch)
    && !activeListContainsSearch
    && !watchlistSymbols.has(normalizedSearch);
  const marketMoversDate = formatMarketMoversDate(
    marketMovers.dataDate || marketMoverRows.find((row) => row?.dataDate)?.dataDate,
    language,
  );
  const isAddingStock = Boolean(addingStockSymbol);
  const activeTableSort = tableSorts[tableTab] || { key: null, direction: 'desc' };
  const handleTableSort = (key) => {
    setTableSorts((current) => {
      const previous = current[tableTab] || { key: null, direction: 'desc' };
      const direction = previous.key === key && previous.direction === 'desc' ? 'asc' : 'desc';
      return { ...current, [tableTab]: { key, direction } };
    });
  };

  React.useEffect(() => {
    if ((!showAddStock && !showEditWatchlist && !benchmarkMenuOpen) || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddStock, showEditWatchlist, benchmarkMenuOpen]);

  React.useEffect(() => {
    if (!benchmarkMenuOpen) setBenchmarkSortDirection(null);
  }, [benchmarkMenuOpen]);

  React.useEffect(() => {
    if (!showAddStock || !isWatchlistTab || typeof fetchPopularStockQuotes !== 'function') return undefined;
    let cancelled = false;
    setPopularQuoteStatus('loading');
    fetchPopularStockQuotes(POPULAR_US_STOCKS.map((item) => item.symbol))
      .then((result) => {
        if (cancelled) return;
        setPopularQuoteRows(Array.isArray(result?.data) ? result.data : []);
        setPopularQuoteStatus('success');
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[热门股票] 行情加载失败:', error?.message || error);
        setPopularQuoteStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [showAddStock, isWatchlistTab, fetchPopularStockQuotes]);

  const loadMarketMovers = React.useCallback(async ({ fresh = false } = {}) => {
    if (typeof fetchMarketMovers !== 'function') {
      setMarketMoversStatus('error');
      return;
    }
    const requestId = marketMoversRequestIdRef.current + 1;
    marketMoversRequestIdRef.current = requestId;
    setMarketMoversStatus('loading');
    try {
      const result = await fetchMarketMovers({ fresh });
      if (marketMoversRequestIdRef.current !== requestId) return;
      const gainers = Array.isArray(result?.gainers) ? result.gainers : [];
      const losers = Array.isArray(result?.losers) ? result.losers : [];
      const dataDate = String(result?.dataDate || '').slice(0, 10);
      if (gainers.length === 0 || losers.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dataDate)) {
        throw new Error('invalid market movers');
      }
      setMarketMovers({
        gainers,
        losers,
        dataDate,
      });
      marketMoversLoadedAtRef.current = Date.now();
      setMarketMoversStatus('success');
    } catch (error) {
      if (marketMoversRequestIdRef.current !== requestId) return;
      console.warn('[美股收盘榜] 加载失败:', error?.message || error);
      setMarketMoversStatus('error');
    }
  }, [fetchMarketMovers]);

  React.useEffect(() => {
    if (!showAddStock || !isWatchlistTab || !isMarketMoversTab || marketMoversStatus === 'loading' || marketMoversStatus === 'error') return;
    const stale = Date.now() - marketMoversLoadedAtRef.current >= 15 * 60 * 1000;
    if (marketMoversStatus === 'success' && !stale) return;
    loadMarketMovers();
  }, [showAddStock, isWatchlistTab, isMarketMoversTab, stockDiscoveryTab, marketMoversStatus, loadMarketMovers]);

  const closeAddStockSheet = () => {
    if (isAddingStock) return;
    setShowAddStock(false);
    setStockSearch('');
    setStockDiscoveryTab('trending');
    resetNewStock();
  };
  const closeEditWatchlist = () => {
    if (editActionKey || watchlistReorder.draggingSymbol || watchlistReorder.isReordering) return;
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
  const rawTableRows = React.useMemo(() => rows.map((row) => {
    const isPosition = tableTab === 'positions';
    const symbol = row.symbol;
    const quote = quoteBySymbol.get(symbol) || row;
    const position = isPosition ? row : positionsBySymbol.get(symbol);
    const rawPrice = isPosition ? row.currentPrice : row.price;
    const rawChangePct = row.changePercent;
    const pnlValue = position ? (position.holdingPnl ?? position.totalPnl) : null;
    const pnlPct = position ? (position.holdingPnlPct ?? position.totalPnlPct) : null;
    const pnlDisplayValue = pnlValue === null ? null : pnlValue * displayRate;
    const high = row.high || row.week52High || quote?.high || quote?.week52High;
    const marketDisplay = resolveHomeMarketDisplayMetrics(row, {
      livePrice: rawPrice,
      liveChangePercent: rawChangePct,
      high,
    });
    const price = marketDisplay.price;
    const changePct = marketDisplay.changePercent;
    const highDrawdown = marketDisplay.highDrawdown;
    const ytdRaw = quote?.ytdChangePercent ?? row.ytdChangePercent;
    const ytdChangePercent = Number.isFinite(Number(ytdRaw)) ? Number(ytdRaw) : null;
    const color = changePct === null ? '#ffffff40' : marketColor(changePct, marketColorMode);
    const ytdColor = ytdChangePercent === null ? '#ffffff40' : marketColor(ytdChangePercent, marketColorMode);
    const cachedLogoUrl = logoCache?.[String(symbol || '').toUpperCase()]?.url;
    const logoUrls = stockLogoCandidates(symbol, cachedLogoUrl, row.logoURL, row.logoUrl, quote?.logoURL, quote?.logoUrl);
    const displayName = stockDisplayName(symbol, row.name || quote?.name, language);

    return {
      row,
      isPosition,
      symbol,
      quote,
      price,
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
  }), [rows, tableTab, quoteBySymbol, positionsBySymbol, displayRate, marketColorMode, logoCache, language]);
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
  const editWatchlistRows = React.useMemo(() => (watchlist || []).map((row) => {
    const symbol = String(row?.symbol || '').toUpperCase();
    const quote = quoteBySymbol.get(symbol) || row;
    const cachedLogoUrl = logoCache?.[symbol]?.url;
    return {
      ...row,
      symbol,
      displayName: stockDisplayName(symbol, row?.name || quote?.name, language),
      price: quote?.price || row?.price,
      changePercent: quote?.changePercent ?? row?.changePercent,
      logoUrls: stockLogoCandidates(symbol, cachedLogoUrl, row?.logoURL, row?.logoUrl, quote?.logoURL, quote?.logoUrl),
    };
  }), [watchlist, quoteBySymbol, logoCache, language]);
  const filteredEditWatchlistRows = React.useMemo(() => editWatchlistRows.filter((row) => {
    if (!editSearchKey) return true;
    return `${row.symbol} ${row.displayName || ''}`.toUpperCase().includes(editSearchKey);
  }), [editWatchlistRows, editSearchKey]);
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

  const watchlistReorder = useWatchlistReorder({
    rows: editWatchlistRows,
    disabled: !showEditWatchlist || Boolean(editSearchKey || editActionKey || pendingDeleteSymbol),
    onReorder: async (orderedRows) => {
      if (editActionKey) return { success: false };
      // Only reorder current source objects; never save enriched or stale quote rows.
      const sourceRows = new Map((watchlist || []).map((row) => [String(row.symbol).toUpperCase(), row]));
      const next = orderedRows.map((row) => sourceRows.get(row.symbol));
      if (next.length !== sourceRows.size || next.some((row) => !row) || new Set(next).size !== sourceRows.size) return { success: false };
      setEditActionKey('watchlist:drag');
      setEditNotice(null);
      try {
        const result = await reorderWatchlist(next);
        if (!result?.success) throw new Error(result?.error || t(language, 'home.saveFailed', '保存失败'));
        setEditNotice({ type: 'success', title: t(language, 'home.sortSaved', '排序已保存'), desc: englishMode ? 'Watchlist order updated' : '自选顺序已更新' });
        return result;
      } catch (error) {
        setEditNotice({ type: 'error', title: t(language, 'home.saveFailed', '保存失败'), desc: error?.message || t(language, 'home.saveFailed', '保存失败') });
        return { success: false };
      } finally {
        setEditActionKey(null);
      }
    },
  });

  return (
    <div className="home-report mx-auto max-w-[430px] flex flex-col pb-2 text-white" style={{ fontFamily: HOME_FONT }}>
      <section className="home-report-hero" data-home-net-assets-card="true">
        <div className="home-report-hero-header">
          <span className="home-report-label">{t(language, 'home.netAssets', '净资产')}</span>
          <div className="home-report-currency" aria-label={englishMode ? 'Display currency' : '显示币种'}>
            {['USD', 'CNY'].map((mode) => (
              <button key={mode} type="button" aria-pressed={currencyMode === mode} onClick={() => setCurrencyMode(mode)}>
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="home-report-net-amount text-white/[0.95] tabular-nums" style={{ fontFamily: NUMBER_FONT }} data-home-net-assets="true">
          {assetStatusReady ? (
            <><span>{displayAssetMoney.main}</span><span className="home-report-decimal">{displayAssetMoney.decimal}</span></>
          ) : <span className="text-white/30">--</span>}
        </div>

        <div className="home-report-pnl-grid">
          <button type="button" onClick={openPnlShare} aria-label={t(language, 'home.openPnlShare', '分享今日盈亏')} data-home-pnl-share-trigger="true">
            <span className="home-report-label">{t(language, 'home.todayPnl', '今日盈亏')}</span>
            <span className={`${pnlAmountClass} ${pnlColor(hasTodayPnl ? summary.todayPnl : 0, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
              {hasTodayPnl ? fmtSignedCurrency(displayTodayPnl, displayCurrency, 2) : '--'}
            </span>
            <span className={`home-report-pnl-percent ${pnlColor(hasTodayPnl ? summary.todayPnl : 0, marketColorMode)}`}>
              {hasTodayPnl ? fmtSignedPct(summary.todayPnlPct, 2) : '--'}
              {hasTodayPnl && summary.todayPnlLocked && <small>{t(language, 'home.pnlLocked', '收盘锁定')}</small>}
            </span>
          </button>
          <button type="button" onClick={openPnlReport}>
            <span className="home-report-label">{t(language, 'home.totalPnl', '累计盈亏')}<ChevronRight size={12} /></span>
            <span className={`${pnlAmountClass} ${pnlColor(summary.cumulativePnl, marketColorMode)}`} style={{ fontFamily: NUMBER_FONT }}>
              {fmtSignedCurrency(displayCumulativePnl, displayCurrency, 2)}
            </span>
            <span className={`home-report-pnl-percent ${pnlColor(summary.cumulativePnl, marketColorMode)}`}>{fmtSignedPct(summary.cumulativePnlPct, 2)}</span>
          </button>
        </div>

        <div className="home-report-balances" data-home-total-assets="true">
          <div className="home-report-balance">
            <span className="home-report-label">{t(language, 'home.totalAssets', '总资产')}</span>
            <span className="home-report-balance-value" style={{ fontFamily: NUMBER_FONT }}>{assetStatusReady ? fmtCurrency(displayAssets, displayCurrency, 2) : '--'}</span>
          </div>
          <button type="button" disabled={!availableCashWriteReady} onClick={() => setShowAvailableCashEditor(true)}
            className="home-report-balance" aria-label={t(language, 'home.availableCashBalance', '设置可用现金')} data-home-available-cash-trigger="true">
            <span className="home-report-label">{t(language, 'home.cash', '现金')}<ChevronRight size={12} /></span>
            <span className="home-report-balance-value" style={{ fontFamily: NUMBER_FONT }}>
              {availableCashStatusReady ? fmtCurrency(displayAvailableCash, displayCurrency, availableCashIsSet ? 2 : 0) : '--'}
            </span>
          </button>
          <button type="button" disabled={!assetStatusReady} onClick={openHomeMarginRisk}
            className="home-report-financing" data-home-margin-trigger="true">
            <span className="home-report-balance">
              <span className="home-report-label">{t(language, 'home.marginDebt', '融资负债')}<ChevronRight size={12} /></span>
              <span className="home-report-balance-value" style={{ fontFamily: NUMBER_FONT }}>{marginStatusReady ? fmtCurrency(displayMarginDebt, displayCurrency, 2) : '--'}</span>
            </span>
            <span className="home-report-balance">
              <span className="home-report-label">{t(language, 'home.leverage', '杠杆')}</span>
              <span className="home-report-leverage">
                <span className="home-report-balance-value">{assetStatusReady ? fmtLeverage(marginOverview.leverage) : '—'}</span>
                {assetStatusReady && marginLeverageStatus && <AccountLeverageBadge className="h-[17px] px-1 text-[10px]" language={language} tierId={marginLeverageStatus.id} />}
              </span>
            </span>
          </button>
        </div>
      </section>

      <section className="home-report-market" data-home-market-overview="true">
        <div className="home-report-section-heading"><h2>{englishMode ? 'Market overview' : '市场观察'}</h2></div>
        {marketCards.length > 0 && <div className="home-report-quotes">
          {marketCards.map((item) => <MiniMarketCard key={item?.ticker || item?.displaySymbol || item?.name} item={item} marketColorMode={marketColorMode} language={language} />)}
        </div>}

        <div className="home-report-market-position">
          <div className="home-report-position-header">
            <span className="home-report-label">{englishMode ? 'Distance from 52-week high' : '距 52 周高点'}</span>
            <button type="button" data-home-signal-trigger onClick={() => setBenchmarkMenuOpen(true)} className="home-report-benchmark"
              aria-label={t(language, 'home.switchBenchmark', '切换基准')}>
              {benchmarkStock?.symbol || benchmarkSymbol || 'QQQ'}
              <span>{t(language, 'home.switchBenchmark', '切换基准')}</span><ChevronRight size={12} />
            </button>
          </div>
          <button type="button" data-home-drawdown-trigger onClick={() => openDrawdownObservation?.()}
            aria-label={englishMode ? 'Open drawdown observation' : '打开回撤观察'} className="home-report-drawdown">
            <span className={`home-report-drawdown-value ${pnlColor(benchmarkDrawdown, marketColorMode)}`}>
              {hasFiniteMarketValue(benchmarkDrawdown) ? (fmtPct ? fmtPct(benchmarkDrawdown) : fmtSignedPct(benchmarkDrawdown, 1)) : '--'}
            </span>
            <span className="home-report-drawdown-context">
              <span>{englishMode ? 'Drawdown observation' : '回撤观察'}<ChevronRight size={13} /></span>
              {benchmarkStock && <small>
                ${fmtOptionalMoney(benchmarkStock.price, 2)} / {t(language, 'home.week52High', '52周高')} ${fmtOptionalMoney(benchmarkStock.high, 2)}
              </small>}
            </span>
          </button>
        </div>

        <div className="home-report-sentiment">
          <button type="button" onClick={() => openVixComparison?.()} aria-label={t(language, 'home.vix.compareAria', '查看 VIX 与 SPY、QQQ 走势对比')}>
            <span className="home-report-label">{t(language, 'home.vix.title', 'VIX 恐慌指数')}<ChevronRight size={12} /></span>
            <span className="home-report-sentiment-reading">{fmtOptionalMoney(vix, 1)}</span>
            <span className="home-report-meter" aria-hidden="true">
              {hasFiniteMarketValue(vix) && <i style={{ left: `${Math.max(0, Math.min(100, (Number(vix) / 50) * 100))}%` }} />}
            </span>
            <span className="home-report-sentiment-date">{vixDateLabel ? `${vixDateLabel} ${t(language, 'home.vix.close', '收盘')}` : '—'}</span>
          </button>
          <div>
            <span className="home-report-label">{englishMode ? 'Fear & Greed' : '恐慌贪婪指数'}<small>CNN</small></span>
            <span className="home-report-sentiment-reading">{hasFiniteMarketValue(fgi) ? Math.round(Number(fgi)) : '--'}<small>{hasFiniteMarketValue(fgi) ? fgiInfo.label : ''}</small></span>
            <span className="home-report-meter" aria-hidden="true">
              {hasFiniteMarketValue(fgi) && <i style={{ left: `${Math.max(0, Math.min(100, Number(fgi)))}%` }} />}
            </span>
            <span className="home-report-sentiment-date">{fgiDateLabel || '—'}</span>
          </div>
        </div>
      </section>

      {benchmarkMenuOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 backdrop-blur-[6px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) setBenchmarkMenuOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-signal-benchmark-title"
            data-home-signal-sheet
            className="flex max-h-[82dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[26px] bg-[#101112] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_55px_rgba(0,0,0,0.35)]"
          >
            <div className="mx-auto mb-5 h-1 w-8 shrink-0 rounded-full bg-white/[0.16]" aria-hidden="true" />
            <div className="relative shrink-0 pb-4">
              <button
                type="button"
                aria-label={t(language, 'home.closeBenchmarkSheet', '关闭当前回撤')}
                onClick={() => setBenchmarkMenuOpen(false)}
                className="absolute right-0 top-[-3px] flex h-9 w-9 items-center justify-center rounded-full bg-[#1b1c1e] text-[#98989f] active:opacity-70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60"
              >
                <X className="h-4 w-4" strokeWidth={1.7} />
              </button>
              <h2 id="home-signal-benchmark-title" className="pr-11 text-[17px] font-medium leading-7 text-[#e1e1e6]">
                {t(language, 'home.switchBenchmark', '切换基准')}
              </h2>
              {benchmarkSheetMarketState === 'live' ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] leading-[18px] text-white/40">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-white/45" aria-hidden="true" />
                  <span>{t(language, 'home.realtime', '实时')}</span>
                  <span className="mx-0.5 text-white/20" aria-hidden="true">·</span>
                  <span>{t(language, 'home.easternOpenTime', '美东开盘 {{time}}', { time: HOME_SIGNAL_ET_OPEN_TIME })}</span>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] leading-[18px] text-white/40">
                  <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                  <span>{t(language, 'home.pnlLocked', '收盘锁定')}</span>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-white/[0.065] pb-2 pl-3 pr-10 pt-2 text-[11px] text-white/40">
              <span>{t(language, 'home.stock', '股票')}</span>
              <button
                type="button"
                aria-label={t(language, 'home.sortDrawdown', '按回撤排序')}
                onClick={() => setBenchmarkSortDirection((current) => nextHomeSignalBenchmarkSortDirection(current))}
                className={`flex min-h-9 items-center gap-1.5 rounded-md px-1 active:opacity-70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60 ${benchmarkSortDirection ? 'text-white/80' : 'text-white/40'}`}
              >
                <span>{t(language, 'home.pullback', '回撤')}</span>
                {benchmarkSortDirection === 'desc' ? <ArrowDown className="h-3 w-3" aria-hidden="true" />
                  : benchmarkSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    : <ArrowUpDown className="h-3 w-3" aria-hidden="true" />}
              </button>
            </div>

            <div className="min-h-0 space-y-1 overflow-y-auto overscroll-contain">
              {visibleBenchmarkRows.map((row) => {
                const directoryEntry = POPULAR_US_STOCK_BY_SYMBOL.get(row.symbol) || null;
                const name = stockDisplayName(row.symbol, row.name || directoryEntry?.name || row.symbol, language);
                const company = String(row.company || directoryEntry?.company || '').trim();
                const cachedLogoUrl = logoCache?.[row.symbol]?.url;
                const logoUrls = stockLogoCandidates(row.symbol, cachedLogoUrl, row.logoURL, row.logoUrl, row.logo);
                const drawdownLabel = row.drawdown === null || !Number.isFinite(Number(row.drawdown))
                  ? '--'
                  : `${(Number(row.drawdown) * 100).toFixed(1)}%`;
                // Match the new observation page's tones while respecting the
                // same global up/down convention as the rest of Home.
                const drawdownUsesRed = (Number(row.drawdown) >= 0) === (marketColorMode === 'redUpGreenDown');
                const drawdownClass = row.drawdown === null || !Number.isFinite(Number(row.drawdown))
                  ? 'text-white/28'
                  : drawdownUsesRed ? 'text-[#ff604f]' : 'text-[#50c8a0]';
                return (
                  <button
                    key={row.symbol}
                    type="button"
                    data-home-signal-option={row.symbol}
                    aria-pressed={row.selected}
                    onClick={() => {
                      setBenchmarkSymbol(row.symbol);
                      setBenchmarkMenuOpen(false);
                    }}
                    className={`flex min-h-[70px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-white/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-white/60 ${row.selected ? 'bg-[#1b1c1e]' : 'bg-transparent'}`}
                  >
                    <StockLogo
                      symbol={row.symbol}
                      urls={logoUrls}
                      onLogoLoad={cacheStockLogo}
                      className="h-9 w-9 rounded-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-normal tracking-[0.01em] text-white/85">{row.symbol}</span>
                      <span className="mt-1 block truncate text-[11px] text-white/40">{company || name}</span>
                    </span>
                    <span className={`shrink-0 text-[15px] font-normal tabular-nums ${drawdownClass}`} style={{ fontFamily: NUMBER_FONT }}>
                      {drawdownLabel}
                    </span>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#c5c5cb]" aria-hidden="true">
                      {row.selected && <Check className="h-4 w-4" strokeWidth={1.8} />}
                    </span>
                  </button>
                );
              })}
              {visibleBenchmarkRows.length === 0 && (
                <div className="px-4 py-10 text-center text-[12px] text-white/30">--</div>
              )}
            </div>
          </section>
        </div>
      )}

      <HomeWatchlistReport
        language={language}
        tableTab={tableTab}
        onTabChange={setTableTab}
        rows={tableRows}
        sortState={activeTableSort}
        onSort={handleTableSort}
        onAdd={() => setShowAddStock(true)}
        onEdit={() => setShowEditWatchlist(true)}
        onOpenStock={openWatchlistStockDetail}
        renderLogo={(item) => <StockLogo symbol={item.symbol} urls={item.logoUrls} onLogoLoad={cacheStockLogo} className="h-8 w-8 rounded-lg" />}
        formatPrice={(value) => hasFiniteMarketValue(value) && Number(value) > 0 ? fmtMoney(value, 2) : '--'}
        formatChange={fmtOptionalMarketPct}
        formatDrawdown={fmtDrawdownPct}
        formatPnl={(value) => fmtSignedCurrency(value, displayCurrency, 2)}
        formatPnlPct={(value) => fmtSignedPct(value, 2)}
        marketColor={(value) => marketColor(value, marketColorMode)}
      />

      <EarningsCalendar
        visualVariant="report"
        watchlist={displayWatchlist}
        positions={positions}
        quoteRows={quoteRows}
        stockFreshnessStartedAt={stockFreshnessStartedAt}
        logoCache={logoCache}
        cacheStockLogo={cacheStockLogo}
        displayStockName={stockDisplayName}
        language={language}
        marketColorMode={marketColorMode}
        supabase={supabase}
        eventsOverride={earningsCalendarEvents}
        requestEventsOverride={earningsCalendarRequest}
        now={earningsCalendarNow || Date.now}
        onOpenCalendar={openEarningsCalendar}
        onOpenDetail={(event) => openEarningsDetail(event, { returnPage: 'home' })}
      />

      {showAddStock && isWatchlistTab && (
        <StockReportModal
          title={t(language, 'home.addWatchlistStock', '添加自选股票')}
          closeLabel={englishMode ? 'Close add stocks' : '关闭添加自选'}
          onClose={closeAddStockSheet}
          panelClassName="watchlist-dialog watchlist-dialog-add"
        >
            <label className="watchlist-search">
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
                aria-label={t(language, 'home.searchStock', '搜索股票名称或代码')}
                className="watchlist-search-input"
              />
              {stockSearch && <button type="button" onClick={() => setStockSearch('')} aria-label={englishMode ? 'Clear search' : '清空搜索'}><X size={15} /></button>}
            </label>

            <div className="watchlist-discovery-tabs" aria-label={englishMode ? 'Discover stocks' : '发现股票'}>
              <button
                type="button"
                onClick={() => setStockDiscoveryTab('trending')}
                className="watchlist-discovery-tab"
                aria-pressed={stockDiscoveryTab === 'trending'}
              >
                <Flame className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t(language, 'home.trending', '热门')}</span>
              </button>
              <button
                type="button"
                onClick={() => setStockDiscoveryTab('gainers')}
                className="watchlist-discovery-tab"
                aria-pressed={stockDiscoveryTab === 'gainers'}
              >
                <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t(language, 'home.marketGainers', '涨幅榜')}</span>
              </button>
              <button
                type="button"
                onClick={() => setStockDiscoveryTab('losers')}
                className="watchlist-discovery-tab"
                aria-pressed={stockDiscoveryTab === 'losers'}
              >
                <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t(language, 'home.marketLosers', '跌幅榜')}</span>
              </button>
            </div>

            <div className="watchlist-list-heading">
              <span className="shrink-0 leading-4">
                {normalizedSearch
                  ? t(language, 'home.searchResults', '搜索结果')
                  : stockDiscoveryTab === 'gainers'
                    ? t(language, 'home.marketGainers', '涨幅榜')
                    : stockDiscoveryTab === 'losers'
                      ? t(language, 'home.marketLosers', '跌幅榜')
                      : t(language, 'home.popularStocks', '热门股票')}
              </span>
              {!normalizedSearch && stockDiscoveryTab === 'trending' && popularQuoteStatus === 'loading' && Loader2 ? (
                <Loader2 className="h-3 w-3 animate-spin text-white/35" aria-hidden="true" />
              ) : null}
              {!normalizedSearch && isMarketMoversTab && marketMoversStatus === 'loading' && Loader2 ? (
                <Loader2 className="h-3 w-3 animate-spin text-white/35" aria-hidden="true" />
              ) : null}
              {!normalizedSearch && isMarketMoversTab && marketMoversStatus === 'success' && marketMoversDate ? (
                <span className="ml-auto flex min-w-0 max-w-[260px] flex-col items-end text-right text-[10px] leading-[13px] text-white/35">
                  <span className="whitespace-nowrap">{t(language, 'home.marketMoversAsOfClose', '截至 {{date}} 收盘', { date: marketMoversDate })}</span>
                  <span className="max-w-full truncate whitespace-nowrap">{t(language, 'home.marketMoversUniverse', 'NASDAQ / NYSE / NYSE American 普通股')}</span>
                </span>
              ) : null}
            </div>

            <div className="watchlist-scroll-list" aria-busy={isAddingStock}>
              {isMarketMoversTab && !normalizedSearch && marketMoversStatus === 'loading' ? (
                <div className="flex min-h-[160px] items-center justify-center gap-2 px-4 text-[13px] text-white/35">
                  {Loader2 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  <span>{t(language, 'home.marketMoversLoading', '榜单加载中...')}</span>
                </div>
              ) : isMarketMoversTab && !normalizedSearch && (
                marketMoversStatus === 'error'
                || (marketMoversStatus === 'success' && filteredDiscoveryStocks.length === 0)
              ) ? (
                <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 px-4 text-center">
                  <span className="text-[13px] text-white/35">{t(language, 'home.marketMoversUnavailable', '榜单暂不可用')}</span>
                  <button
                    type="button"
                    onClick={() => loadMarketMovers({ fresh: true })}
                    className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[12px] text-white/65 active:scale-95"
                  >
                    {t(language, 'home.marketMoversRetry', '重试')}
                  </button>
                </div>
              ) : filteredDiscoveryStocks.length === 0 && !canAddCustomStock ? (
                <div className="px-4 py-8 text-center text-[13px] text-white/35">{t(language, 'home.noMatches', '没有匹配结果')}</div>
              ) : (
                <>
                  {filteredDiscoveryStocks.map((item) => {
                    const symbol = item.symbol;
                    const quote = item.quote || quoteBySymbol.get(symbol);
                    const quotePrice = quote?.price || quote?.currentPrice;
                    const isAdded = watchlistSymbols.has(symbol);
                    const color = marketColor(quote?.changePercent, marketColorMode);
                    const logoUrls = stockLogoCandidates(symbol, item?.logo, quote?.logo, logoCache?.[symbol]?.url);
                    return (
                      <div key={`${stockDiscoveryTab}-${symbol}`} className="watchlist-discovery-row">
                        <StockLogo symbol={symbol} urls={logoUrls} onLogoLoad={cacheStockLogo} className="watchlist-logo" />
                        <div className="min-w-0 flex-1">
                          <div className="watchlist-symbol">{symbol}</div>
                          <div className="watchlist-company">{englishMode ? (item.company || item.name) : item.name}</div>
                        </div>
                        <div className="watchlist-quote">
                          <div className="watchlist-price" style={{ fontFamily: NUMBER_FONT }}>
                            {quotePrice ? fmtMoney(quotePrice, 2) : '--'}
                          </div>
                          <div className="watchlist-change" style={{ color, fontFamily: NUMBER_FONT }}>
                            {hasFiniteMarketValue(quote?.changePercent) ? fmtMarketPct(quote.changePercent) : '--'}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isAdded || isAddingStock}
                          onClick={() => handleAddStock({ symbol, name: item.name })}
                          className="watchlist-add-button"
                          data-added={isAdded}
                          aria-label={isAdded ? t(language, 'home.alreadyAdded', '{{symbol}} 已添加', { symbol }) : t(language, 'home.addSymbol', '添加 {{symbol}}', { symbol })}
                        >
                          {addingStockSymbol === symbol && Loader2 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isAdded ? (
                            <Check className="h-4 w-4" />
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
                      className="watchlist-custom-row"
                    >
                      <LogoPlaceholder symbol={normalizedSearch} className="watchlist-logo" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-normal text-white">{normalizedSearch}</span>
                        <span className="block truncate text-[11px] text-white/35">{t(language, 'home.addCustomTicker', '添加自定义股票代码')}</span>
                      </span>
                      <span className="watchlist-add-button">
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

        </StockReportModal>
      )}

      {showEditWatchlist && isWatchlistTab && (
        <StockReportModal
          title={t(language, 'home.editWatchlistStock', '编辑自选股票')}
          closeLabel={englishMode ? 'Close edit watchlist' : '关闭编辑自选'}
          onClose={closeEditWatchlist}
          panelClassName="watchlist-dialog watchlist-dialog-edit"
        >
            <label className="watchlist-search">
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
                aria-label={t(language, 'home.searchStock', '搜索股票名称或代码')}
                className="watchlist-search-input"
              />
              {editWatchlistSearch && <button type="button" onClick={() => setEditWatchlistSearch('')} aria-label={englishMode ? 'Clear search' : '清空搜索'}><X size={15} /></button>}
            </label>

            {editNotice && (
              <div className="watchlist-notice" data-status={editNotice.type} role="status">
                <div className="font-normal">{editNotice.title}</div>
                <div className="text-white/60">{editNotice.desc}</div>
              </div>
            )}

            <div className="watchlist-list-heading">
              <span>{t(language, 'home.currentWatchlistCount', '当前自选 · {{count}} 只', { count: editWatchlistRows.length })}</span>
              <span className="watchlist-drag-hint" id="watchlist-drag-hint">
                {editSearchKey ? (englishMode ? 'Clear search to reorder' : '清空搜索后排序') : (englishMode ? 'Drag to reorder' : '按住拖动排序')}
              </span>
            </div>

            <div className="watchlist-scroll-list" ref={watchlistReorder.listRef} aria-busy={Boolean(editActionKey)}>
              {editWatchlistRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-[13px] text-white/35">{t(language, 'home.noWatchlist', '暂无自选股票。')}</div>
              ) : filteredEditWatchlistRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-[13px] text-white/35">{t(language, 'home.noMatches', '没有匹配结果')}</div>
              ) : (
                (editSearchKey ? filteredEditWatchlistRows : watchlistReorder.orderedRows).map((item) => {
                  const symbol = item.symbol;
                  const fullIndex = editWatchlistRows.findIndex((row) => row.symbol === symbol);
                  const isFirst = fullIndex <= 0;
                  const deletePending = pendingDeleteSymbol === symbol;
                  const busy = Boolean(editActionKey || watchlistReorder.draggingSymbol || watchlistReorder.isReordering);
                  const rowBusy = editActionKey?.startsWith(`${symbol}:`);
                  return (
                    <div key={symbol} className="watchlist-edit-row" data-watchlist-reorder-symbol={symbol} data-dragging={watchlistReorder.draggingSymbol === symbol}>
                      <StockLogo symbol={symbol} urls={item.logoUrls} onLogoLoad={cacheStockLogo} className="watchlist-logo" />
                      <div className="min-w-0 flex-1">
                        <div className="watchlist-edit-identity">
                          <span className="watchlist-symbol">{symbol}</span>
                          <span className="watchlist-company">{item.displayName}</span>
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
                      <button
                        {...watchlistReorder.getHandleProps(item)}
                        className="watchlist-drag-handle"
                        aria-label={englishMode ? `Reorder ${symbol}, drag or use arrow keys` : `调整 ${symbol} 顺序，拖动或使用上下方向键`}
                        aria-describedby="watchlist-drag-hint"
                      ><GripVertical size={20} /></button>

                      {deletePending ? (
                        <div className="watchlist-row-actions watchlist-delete-confirm">
                          <span>{t(language, 'home.confirmDelete', '确认删除?')}</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingDeleteSymbol(null)}
                            className="watchlist-text-action"
                          >
                            {t(language, 'home.cancel', '取消')}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => confirmDeleteWatchlistItem(symbol)}
                            className="watchlist-text-action watchlist-destructive"
                          >
                            {rowBusy && Loader2 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t(language, 'home.delete', '删除')}
                          </button>
                        </div>
                      ) : (
                        <div className="watchlist-row-actions">
                          <button
                            type="button"
                            disabled={busy || isFirst}
                            onClick={() => moveWatchlistItem(symbol, 'pin')}
                            className="watchlist-text-action watchlist-pin"
                            title={t(language, 'home.pin', '置顶')}
                            aria-label={`${symbol} ${t(language, 'home.pin', '置顶')}`}
                          >
                            <Pin className="h-3.5 w-3.5" />
                            <span>{t(language, 'home.pin', '置顶')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingDeleteSymbol(symbol)}
                            className="watchlist-icon-action watchlist-remove"
                            title={t(language, 'home.delete', '删除')}
                            aria-label={`${symbol} ${t(language, 'home.delete', '删除')}`}
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
        </StockReportModal>
      )}

      <AvailableCashEditor
        availableCashUsd={availableCashUsd}
        currency={displayCurrency}
        isOpen={showAvailableCashEditor}
        isSet={availableCashIsSet}
        language={language}
        onClose={() => setShowAvailableCashEditor(false)}
        onLoadCashMovements={loadAvailableCashMovements}
        onMutateCash={availableCashWriteReady ? mutateAvailableCash : null}
        onReverseCashMovement={availableCashReversalReady ? reverseAvailableCashMovement : null}
        usdRate={summary.usdRate}
      />

      {addStockNotice && (
        <ActionModalCard
          title={addStockNotice.title}
          closeLabel={t(language, 'home.closeAddStockNotice', '关闭添加自选结果')}
          onClose={() => setAddStockNotice(null)}
          widthClassName="w-[310px] max-w-[calc(100vw-32px)]"
          actions={[
            { key: 'close', label: t(language, 'home.gotIt', '知道了'), onClick: () => setAddStockNotice(null) },
          ]}
        >
          <div className="min-w-0 py-1 text-center">
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
            <div className="mt-3 break-words text-[13px] leading-5 text-white/52">{addStockNotice.desc}</div>
          </div>
        </ActionModalCard>
      )}
    </div>
  );
}
