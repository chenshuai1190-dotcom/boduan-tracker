import React from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  ChevronUp,
  FileText,
  Info,
  Loader2,
  Plus,
} from 'lucide-react';
import StockReportModal from '../components/StockReportModal.jsx';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';
import './WaveTrackerPage.css';
import './WaveTrackerDialogs.css';
import { t } from '../lib/i18n.js';
import { normalizeStrictUserStockSymbol } from '../lib/symbols.js';
import { userScopedStorageKey } from '../lib/userScopedStorage.js';
import {
  buildSwingWaveDashboard,
  calculateSwingWaveForecast,
  mergeSwingWaveQuoteRows,
  summarizeSwingWaveGroup,
} from '../lib/swingWavesViewModel.js';

const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const PROFIT = '#ff4b1f';
const LOSS = '#36c49a';
const FALLBACK_USD_CNY_RATE = 7.2;
const EXPANDED_STATE_STORAGE_KEY = 'boduan_wave_tracker_expanded_v1';
const FILTER_KEYS = ['all', 'active', 'completed'];
const FORECAST_PRESETS = [
  { id: 'current', labelKey: 'swing.forecastCurrent', label: '当前价' },
  { id: 'cost', labelKey: 'swing.forecastCost', label: '成本价' },
  { id: 'up10', label: '+10%', multiplier: 1.1 },
  { id: 'up20', label: '+20%', multiplier: 1.2 },
  { id: 'up30', label: '+30%', multiplier: 1.3 },
];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatNumber(value, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatShares(value) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function formatUsdPrice(value) {
  const parsed = positive(value);
  return parsed > 0 ? `$${formatNumber(parsed, 2)}` : '--';
}

function formatPnl(value, currency = 'USD', digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  const amount = Number(value);
  return `${amount >= 0 ? '+' : '-'}${currency === 'CNY' ? '¥' : '$'}${formatNumber(Math.abs(amount), digits)}`;
}

function formatPct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  const pct = Number(value) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function tone(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) === 0) return 'rgba(255,255,255,0.5)';
  return Number(value) > 0 ? PROFIT : LOSS;
}

function shortDate(value) {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.slice(5) : '--';
}

function waveRecordId(wave) {
  return wave?.recordId || wave?.id || '';
}

function waveExitId(wave) {
  return wave?.exitId || (wave?.legacyExit ? (wave?.segmentId || wave?.id) : null);
}

function waveLabel(wave, tt) {
  const base = tt('swing.waveNumber', '波段 {{number}}', { number: String(wave?.sequence || 0).padStart(2, '0') });
  if (wave?.status !== 'completed') return base;
  return tt('swing.completedWaveLabel', '{{wave}} · 第{{number}}次卖出', {
    wave: base,
    number: wave?.exitSequence || 1,
  });
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeExpandedState(value) {
  if (!value || typeof value !== 'object') return {};
  return FILTER_KEYS.reduce((result, filterKey) => {
    const bySymbol = value[filterKey];
    if (!bySymbol || typeof bySymbol !== 'object') return result;
    const entries = Object.entries(bySymbol)
      .map(([symbol, expanded]) => [String(symbol || '').trim().toUpperCase(), expanded])
      .filter(([symbol, expanded]) => /^[A-Z0-9._-]{1,24}$/.test(symbol) && typeof expanded === 'boolean');
    if (entries.length > 0) result[filterKey] = Object.fromEntries(entries);
    return result;
  }, {});
}

function readExpandedState(userId) {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    return normalizeExpandedState(JSON.parse(window.localStorage.getItem(userScopedStorageKey(EXPANDED_STATE_STORAGE_KEY, userId)) || '{}'));
  } catch {
    return {};
  }
}

function writeExpandedState(value, userId) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const storageKey = userScopedStorageKey(EXPANDED_STATE_STORAGE_KEY, userId);
    if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(normalizeExpandedState(value)));
  } catch {}
}

function setExpandedMemory(current, filterKey, symbol, expanded) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!FILTER_KEYS.includes(filterKey) || !/^[A-Z0-9._-]{1,24}$/.test(normalizedSymbol)) {
    return normalizeExpandedState(current);
  }
  const normalized = normalizeExpandedState(current);
  return {
    ...normalized,
    [filterKey]: {
      ...(normalized[filterKey] || {}),
      [normalizedSymbol]: Boolean(expanded),
    },
  };
}

function statusAccent(status, value) {
  if (status === 'completed' || value == null || Number(value) === 0) return 'gray';
  return Number(value) > 0 ? 'red' : 'green';
}

function StatusDot({ accent = 'gray' }) {
  const color = accent === 'gray' ? '#8d949d' : accent === 'green' ? LOSS : PROFIT;
  return (
    <span
      className="wave-status-dot"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

function Metric({ label, value, valueColor = 'rgba(255,255,255,0.84)', align = 'left' }) {
  return (
    <div className={`wave-metric ${align === 'right' ? 'wave-metric-right' : ''}`}>
      <div className="wave-metric-label">{label}</div>
      <div
        className="wave-metric-value"
        style={{ color: valueColor, fontFamily: NUMBER_FONT }}
      >
        {value}
      </div>
    </div>
  );
}

function FormField({ label, prefix, children, ...inputProps }) {
  const isDateInput = inputProps.type === 'date';
  return (
    <label className="wave-dialog-field">
      <span className="wave-dialog-field-label">{label}</span>
      <span className="wave-dialog-field-control">
        {prefix ? <span className="wave-dialog-field-prefix">{prefix}</span> : null}
        {children || (
          <input
            {...inputProps}
            className={`wave-dialog-input ${isDateInput ? 'wave-form-date-input' : ''}`}
            style={{
              boxSizing: 'border-box',
              colorScheme: 'dark',
              fontFamily: NUMBER_FONT,
              maxWidth: '100%',
              minWidth: 0,
              ...(isDateInput ? {
                lineHeight: '48px',
                paddingBottom: 0,
                paddingTop: 0,
                textAlign: 'center',
                WebkitAppearance: 'none',
              } : {}),
              WebkitMinLogicalWidth: '0px',
              width: '100%',
            }}
          />
        )}
      </span>
    </label>
  );
}

function ModalFormScroller({ children }) {
  return (
    <div className="wave-dialog-form-scroller">
      {children}
    </div>
  );
}

function LogoBadge({ symbol, logoCache, cacheStockLogo }) {
  return (
    <div className="wave-stock-logo">
      <StockLogo
        symbol={symbol}
        urls={stockLogoCandidates(symbol, logoCache?.[symbol]?.url)}
        onLogoLoad={cacheStockLogo}
        className="h-7 w-7 rounded-[6px]"
      />
    </div>
  );
}

function ModalStockHeader({ group, wave, sideLabel, logoCache, cacheStockLogo }) {
  return (
    <div className="wave-dialog-stock">
      <div className="wave-dialog-stock-logo">
        <StockLogo
          symbol={group.symbol}
          urls={stockLogoCandidates(group.symbol, logoCache?.[group.symbol]?.url)}
          onLogoLoad={cacheStockLogo}
          className="h-6 w-6 rounded-[4px]"
        />
      </div>
      <div className="wave-dialog-stock-identity">
        <div className="wave-dialog-stock-symbol">{group.symbol}</div>
        <div className="wave-dialog-stock-name">{group.displayName}</div>
      </div>
      <div className="wave-dialog-stock-position">
        <div className="wave-dialog-stock-status">{sideLabel}</div>
        <div className="wave-dialog-stock-shares" style={{ fontFamily: NUMBER_FONT }}>
          {wave ? `${formatShares(wave.shares)} · ${formatUsdPrice(wave.buyPriceUsd)}` : '--'}
        </div>
      </div>
    </div>
  );
}

function WaveRow({ group, wave, onAction, tt, displayRate, displayCurrency }) {
  const isActive = wave.status === 'active';
  const displayPnl = wave.pnlUsd == null ? null : wave.pnlUsd * displayRate;
  return (
    <button
      type="button"
      onClick={() => onAction(group, wave)}
      className="wave-record"
      aria-label={tt('swing.openWaveActions', '打开 {{symbol}} {{wave}} 操作', { symbol: group.symbol, wave: waveLabel(wave, tt) })}
    >
      <div className="wave-record-heading">
        <div className="wave-record-identity">
          <span className="wave-record-label">{waveLabel(wave, tt)}</span>
          <span className="wave-record-status">
            <StatusDot accent={statusAccent(wave.status, wave.returnPct)} />
            {isActive ? tt('trades.active', '进行中') : tt('trades.completed', '已完成')}
          </span>
        </div>
        <div className="wave-record-profit" style={{ color: tone(displayPnl) }}>
          <span>{formatPnl(displayPnl, displayCurrency, 2)}</span>
          <span className="wave-record-return" style={{ color: tone(wave.returnPct) }}>{formatPct(wave.returnPct)}</span>
        </div>
      </div>

      <div className="wave-record-date">
        {isActive
          ? tt('swing.startedDays', '{{date}} 开始 · 第 {{days}} 天', { date: shortDate(wave.buyDate), days: wave.heldDays ?? '--' })
          : tt('swing.completedDays', '{{start}} ~ {{end}} · {{days}} 天', { start: shortDate(wave.buyDate), end: shortDate(wave.sellDate), days: wave.heldDays ?? '--' })}
      </div>
      <div className="wave-record-metrics">
        <Metric label={tt('swing.buyAverage', '买入均价')} value={formatUsdPrice(wave.buyPriceUsd)} />
        <Metric label={isActive ? tt('swing.currentPrice', '现价') : tt('swing.sellAverage', '卖出均价')} value={formatUsdPrice(isActive ? wave.currentPriceUsd : wave.sellPriceUsd)} valueColor={tone(wave.returnPct)} />
        <Metric label={isActive ? tt('swing.heldShares', '持有') : tt('swing.soldShares', '卖出')} value={tt('swing.sharesValue', '{{shares}} 股', { shares: formatShares(wave.shares) })} align="right" />
      </div>

      <div className="wave-record-note">
        <FileText size={13} strokeWidth={1.6} />
        <span>{wave.note || tt('swing.noNote', '暂无计划备注')}</span>
        <ChevronRight size={14} strokeWidth={1.6} />
      </div>
    </button>
  );
}

function StockCard({ group, expanded, filter, onToggle, onAction, tt, displayRate, displayCurrency, logoCache, cacheStockLogo, todayKey }) {
  const summary = summarizeSwingWaveGroup(group, filter, todayKey);
  const isActive = summary.status === 'active';
  const displayPnl = summary.performancePnlUsd == null ? null : summary.performancePnlUsd * displayRate;
  const pnlLabel = filter === 'all'
    ? tt('swing.cumulativePnl', '累计盈亏')
    : isActive
      ? (expanded ? tt('swing.totalUnrealized', '总浮盈') : tt('swing.unrealized', '浮盈'))
      : tt('swing.realized', '已实现');
  return (
    <article className="wave-stock" data-expanded={expanded}>
      <button type="button" onClick={onToggle} className="wave-stock-toggle" aria-expanded={expanded}>
        <div className="wave-stock-heading">
          <LogoBadge symbol={group.symbol} logoCache={logoCache} cacheStockLogo={cacheStockLogo} />
          <div className="min-w-0">
            <div className="wave-stock-symbol">{group.symbol}</div>
            <div className="wave-stock-name">{group.displayName}</div>
          </div>
          <div className="wave-stock-performance">
            <div>
              <div className="wave-stock-pnl" style={{ color: tone(displayPnl), fontFamily: NUMBER_FONT }}>
                {formatPnl(displayPnl, displayCurrency, 2)}
              </div>
              <div className="wave-stock-return"><span>{pnlLabel}</span><span style={{ color: tone(summary.performanceReturnPct) }}>{formatPct(summary.performanceReturnPct)}</span></div>
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-white/[0.68]" /> : <ChevronRight className="h-4 w-4 text-white/[0.48]" />}
          </div>
        </div>

        <div className="wave-stock-metrics">
          <Metric label={isActive ? (expanded ? tt('swing.totalHeld', '总持仓') : tt('swing.position', '持仓')) : tt('swing.soldShares', '卖出')} value={tt('swing.sharesValue', '{{shares}} 股', { shares: formatShares(summary.shares) })} />
          <Metric label={expanded ? tt('swing.average', '均价') : tt('swing.buyAverage', '买入均价')} value={formatUsdPrice(summary.averageBuyPriceUsd)} />
          <Metric label={isActive ? tt('swing.latestPrice', '最新价') : tt('swing.sellAverage', '卖出均价')} value={formatUsdPrice(summary.referencePriceUsd)} valueColor={tone(summary.performanceReturnPct)} align="right" />
        </div>
        {!expanded ? <div className="wave-stock-date">
          {isActive
            ? tt('swing.startedDays', '{{date}} 开始 · 第 {{days}} 天', { date: shortDate(summary.firstDate), days: summary.heldDays ?? '--' })
            : tt('swing.completedDays', '{{start}} ~ {{end}} · {{days}} 天', { start: shortDate(summary.firstDate), end: shortDate(summary.endDate), days: summary.heldDays ?? '--' })}
        </div> : null}
      </button>

      {expanded ? (
        <div className="wave-records">
          {summary.visibleWaves.map((wave) => (
            <WaveRow key={wave.id} group={group} wave={wave} onAction={onAction} tt={tt} displayRate={displayRate} displayCurrency={displayCurrency} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function WaveTrackerPage({ ctx = {}, fetchSwingWaveRealtimeSnapshot }) {
  const {
    cacheStockLogo,
    closeWaveTracker,
    db,
    displayStockName,
    fetchPopularStockQuotes,
    language = 'zh',
    logoCache = {},
    portfolioCurrencyMode = 'USD',
    quoteRows = [],
    showConfirm,
    syncSwingWaveQuoteRows,
    usdRate,
    user,
  } = ctx;
  const todayKey = localDateKey();
  const displayCurrency = portfolioCurrencyMode === 'CNY' ? 'CNY' : 'USD';
  const displayRate = displayCurrency === 'CNY' ? (positive(usdRate) || FALLBACK_USD_CNY_RATE) : 1;
  const tt = React.useCallback((key, fallback, values) => t(language, key, fallback, values), [language]);
  const [rows, setRows] = React.useState([]);
  const [localQuotes, setLocalQuotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [expandedState, setExpandedState] = React.useState(() => readExpandedState(user?.id));
  const [filter, setFilter] = React.useState('active');
  const [modal, setModal] = React.useState(null);
  const [draft, setDraft] = React.useState({});
  const [forecastTargetInput, setForecastTargetInput] = React.useState('');
  const [forecastPreset, setForecastPreset] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const submittingRef = React.useRef(false);
  const quoteRequestRef = React.useRef(0);
  const realtimeSnapshotRequestRef = React.useRef(0);

  const activeSymbols = React.useMemo(() => Array.from(new Set(rows
    .filter((wave) => wave?.status === 'active')
    .map((wave) => normalizeStrictUserStockSymbol(wave?.symbol))
    .filter(Boolean))).sort(), [rows]);
  const activeSymbolsKey = activeSymbols.join(',');

  const displayName = React.useCallback((symbol, name) => (
    typeof displayStockName === 'function'
      ? displayStockName(symbol, name, language)
      : (name || symbol)
  ), [displayStockName, language]);

  const refreshQuotes = React.useCallback(async (symbols) => {
    if (typeof fetchPopularStockQuotes !== 'function') return;
    const normalizedSymbols = Array.from(new Set((symbols || [])
      .map((symbol) => normalizeStrictUserStockSymbol(symbol))
      .filter(Boolean)));
    const requestId = ++quoteRequestRef.current;
    if (normalizedSymbols.length === 0) {
      setLocalQuotes([]);
      return;
    }
    try {
      const result = await fetchPopularStockQuotes(normalizedSymbols);
      if (requestId !== quoteRequestRef.current || !Array.isArray(result?.data)) return;
      const fetchedAt = Date.now();
      const nextQuotes = result.data.map((row) => ({ ...row, waveFetchedAt: fetchedAt }));
      setLocalQuotes((current) => mergeSwingWaveQuoteRows(current, nextQuotes));
    } catch (error) {
      console.warn('[SwingWaves] quote refresh failed:', error?.message || error);
    }
  }, [fetchPopularStockQuotes]);

  const refreshRealtimeSnapshot = React.useCallback(async (symbols) => {
    if (typeof fetchSwingWaveRealtimeSnapshot !== 'function') return;
    const normalizedSymbols = Array.from(new Set((symbols || [])
      .map((symbol) => normalizeStrictUserStockSymbol(symbol))
      .filter(Boolean)));
    const requestId = ++realtimeSnapshotRequestRef.current;
    if (normalizedSymbols.length === 0) return;
    try {
      const result = await fetchSwingWaveRealtimeSnapshot(normalizedSymbols);
      if (requestId !== realtimeSnapshotRequestRef.current || !Array.isArray(result?.data)) return;
      setLocalQuotes((current) => mergeSwingWaveQuoteRows(current, result.data));
    } catch (error) {
      console.warn('[SwingWaves] realtime snapshot failed:', error?.message || error);
    }
  }, [fetchSwingWaveRealtimeSnapshot]);

  const loadRows = React.useCallback(async ({ silent = false } = {}) => {
    if (!db?.listSwingWaves) throw new Error(tt('swing.dataUnavailable', '波段数据服务暂不可用'));
    if (!silent) setLoading(true);
    try {
      const nextRows = await db.listSwingWaves(user);
      setRows(Array.isArray(nextRows) ? nextRows : []);
      setLoadError('');
      return nextRows;
    } catch (error) {
      setLoadError(error?.message || tt('swing.loadFailed', '波段记录加载失败'));
      throw error;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [db, tt, user]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.resolve(db?.listSwingWaves ? db.listSwingWaves(user) : Promise.reject(new Error(tt('swing.dataUnavailable', '波段数据服务暂不可用'))))
      .then((nextRows) => {
        if (!active) return;
        const normalized = Array.isArray(nextRows) ? nextRows : [];
        setRows(normalized);
        setLoadError('');
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error?.message || tt('swing.loadFailed', '波段记录加载失败'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, tt, user]);

  React.useEffect(() => {
    refreshRealtimeSnapshot(activeSymbols).catch(() => {});
    refreshQuotes(activeSymbols).catch(() => {});
    // activeSymbolsKey intentionally limits snapshot and REST refreshes to membership changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbolsKey, refreshQuotes, refreshRealtimeSnapshot]);

  const activeWaveQuoteRows = React.useMemo(() => {
    const quotesBySymbol = new Map(localQuotes.map((quote) => [
      normalizeStrictUserStockSymbol(quote?.symbol),
      quote,
    ]));
    const bySymbol = new Map();
    rows.filter((wave) => wave?.status === 'active').forEach((wave) => {
      const symbol = normalizeStrictUserStockSymbol(wave?.symbol);
      if (!symbol) return;
      const quote = quotesBySymbol.get(symbol) || {};
      const existing = bySymbol.get(symbol) || {};
      bySymbol.set(symbol, {
        ...existing,
        ...quote,
        symbol,
        name: wave?.name || quote?.name || existing?.name || symbol,
      });
    });
    return Array.from(bySymbol.values());
  }, [localQuotes, rows]);

  React.useEffect(() => {
    if (typeof syncSwingWaveQuoteRows !== 'function') return;
    syncSwingWaveQuoteRows(activeWaveQuoteRows);
  }, [activeWaveQuoteRows, syncSwingWaveQuoteRows]);

  React.useEffect(() => () => {
    quoteRequestRef.current += 1;
    realtimeSnapshotRequestRef.current += 1;
    syncSwingWaveQuoteRows?.([]);
  }, [syncSwingWaveQuoteRows]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const refreshWhenVisible = () => {
      if (!document.hidden) refreshQuotes(activeSymbols);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('pageshow', refreshWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshWhenVisible);
    };
  }, [activeSymbols, refreshQuotes]);

  React.useEffect(() => {
    if (!modal || typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const previous = {
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      bodyLeft: document.body.style.left,
      bodyRight: document.body.style.right,
      bodyWidth: document.body.style.width,
      bodyTouchAction: document.body.style.touchAction,
      htmlOverflow: document.documentElement.style.overflow,
      htmlOverscrollBehavior: document.documentElement.style.overscrollBehavior,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.position = previous.bodyPosition;
      document.body.style.top = previous.bodyTop;
      document.body.style.left = previous.bodyLeft;
      document.body.style.right = previous.bodyRight;
      document.body.style.width = previous.bodyWidth;
      document.body.style.touchAction = previous.bodyTouchAction;
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.documentElement.style.overscrollBehavior = previous.htmlOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [modal]);

  const mergedQuotes = React.useMemo(() => mergeSwingWaveQuoteRows(quoteRows, localQuotes), [localQuotes, quoteRows]);
  const dashboard = React.useMemo(() => buildSwingWaveDashboard(rows, mergedQuotes, { todayKey }), [mergedQuotes, rows, todayKey]);
  const groups = React.useMemo(() => dashboard.groups.map((group) => ({
    ...group,
    displayName: displayName(group.symbol, group.name),
  })), [dashboard.groups, displayName]);
  const visibleGroups = groups.filter((group) => (
    filter === 'active' ? group.activeCount > 0 : filter === 'completed' ? group.completedCount > 0 : true
  ));
  const cumulativeDisplayPnl = dashboard.cumulativePnlUsd == null ? null : dashboard.cumulativePnlUsd * displayRate;
  const selection = React.useMemo(() => {
    if (!modal?.waveId) return { group: null, wave: null };
    const group = groups.find((item) => item.waves.some((wave) => wave.id === modal.waveId)) || null;
    const wave = group?.waves.find((item) => item.id === modal.waveId) || null;
    return { group, wave };
  }, [groups, modal]);
  const forecast = React.useMemo(() => calculateSwingWaveForecast({
    buyPriceUsd: selection.wave?.buyPriceUsd,
    currentPriceUsd: selection.wave?.currentPriceUsd,
    shares: selection.wave?.shares,
    targetPriceUsd: forecastTargetInput,
  }), [forecastTargetInput, selection.wave]);

  const showNotice = React.useCallback((title, desc) => {
    if (typeof showConfirm === 'function') {
      showConfirm({
        title,
        desc,
        confirmText: tt('trades.close', '关闭'),
        confirmStyle: 'primary',
        icon: '!',
        showCancel: false,
      });
      return;
    }
    setLoadError(desc || title);
  }, [showConfirm, tt]);

  React.useEffect(() => {
    writeExpandedState(expandedState, user?.id);
  }, [expandedState, user?.id]);

  const visibleWaveCountForGroup = React.useCallback((group) => (
    filter === 'active'
      ? group.activeCount
      : filter === 'completed'
        ? group.completedCount
        : group.waves.length
  ), [filter]);

  const isGroupExpanded = React.useCallback((group) => {
    const symbol = normalizeStrictUserStockSymbol(group?.symbol);
    const stored = expandedState?.[filter]?.[symbol];
    if (typeof stored === 'boolean') return stored;
    return visibleWaveCountForGroup(group) > 1;
  }, [expandedState, filter, visibleWaveCountForGroup]);

  const toggleGroupExpanded = React.useCallback((group) => {
    const symbol = normalizeStrictUserStockSymbol(group?.symbol);
    const currentExpanded = isGroupExpanded(group);
    setExpandedState((current) => setExpandedMemory(current, filter, symbol, !currentExpanded));
  }, [filter, isGroupExpanded]);

  const runMutation = React.useCallback(async (task, applyResult, { closeModal = true } = {}) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await task();
      applyResult?.(result);
      if (closeModal) setModal(null);
    } catch (error) {
      const message = error?.message || tt('swing.saveFailed', '波段记录保存失败');
      if (/其他设备修改|stale/i.test(message)) {
        try { await loadRows({ silent: true }); } catch {}
      }
      showNotice(tt('swing.operationFailed', '操作未完成'), message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [loadRows, showNotice, tt]);

  const openAdd = () => {
    setDraft({ symbol: '', buyPrice: '', shares: '', startDate: todayKey, note: '' });
    setModal({ type: 'add' });
  };
  const openActions = (group, wave) => {
    const currentPrice = positive(wave?.currentPriceUsd);
    if (wave?.status === 'active' && currentPrice > 0) {
      setForecastTargetInput((currentPrice * 1.1).toFixed(2));
      setForecastPreset('up10');
    } else {
      setForecastTargetInput('');
      setForecastPreset('');
    }
    setModal({ type: 'actions', waveId: wave.id, symbol: group.symbol });
  };
  const openDetail = (wave) => setModal({ type: 'detail', waveId: wave.id });
  const openEdit = (wave, target = wave.status === 'completed' ? 'exit' : 'parent') => {
    const editingExit = target === 'exit' && wave.status === 'completed';
    setDraft(editingExit ? {
      sellPrice: wave.sellPriceUsd ? String(wave.sellPriceUsd) : '',
      sellShares: String(wave.shares),
      endDate: wave.sellDate || '',
    } : {
      symbol: wave.symbol,
      buyPrice: String(wave.buyPriceUsd),
      shares: String(wave.originalShares ?? wave.shares),
      startDate: wave.buyDate,
      note: wave.note || '',
    });
    setModal({ type: 'edit', waveId: wave.id, editTarget: editingExit ? 'exit' : 'parent' });
  };
  const openSell = (wave) => {
    setDraft({ sellPrice: '', sellShares: String(wave.shares), endDate: todayKey });
    setModal({ type: 'sell', waveId: wave.id });
  };

  const createWave = () => {
    const symbol = normalizeStrictUserStockSymbol(draft.symbol);
    const name = displayName(symbol, symbol);
    runMutation(
      () => db.createSwingWave({
        symbol,
        name,
        buyDate: draft.startDate,
        buyPriceUsd: draft.buyPrice,
        shares: draft.shares,
        note: draft.note || '',
      }),
      (created) => {
        setRows((current) => [created, ...current]);
        setExpandedState((current) => setExpandedMemory(current, 'active', created.symbol, true));
        setFilter('active');
      },
    );
  };

  const saveEdit = () => {
    if (!selection.wave) return;
    if (modal?.editTarget === 'exit') {
      runMutation(async () => {
        await db.updateSwingWaveExit(waveRecordId(selection.wave), waveExitId(selection.wave), {
          sellDate: draft.endDate,
          sellPriceUsd: draft.sellPrice,
          sellShares: draft.sellShares,
        });
        return loadRows({ silent: true });
      });
      return;
    }
    const input = {
      symbol: selection.wave.symbol,
      name: selection.wave.name,
      buyDate: draft.startDate,
      buyPriceUsd: draft.buyPrice,
      shares: draft.shares,
      note: draft.note || '',
    };
    runMutation(async () => {
      await db.updateSwingWave(waveRecordId(selection.wave), input);
      return loadRows({ silent: true });
    });
  };

  const sellWave = () => {
    if (!selection.wave) return;
    runMutation(async () => {
      await db.sellSwingWave(waveRecordId(selection.wave), {
        sellDate: draft.endDate,
        sellPriceUsd: draft.sellPrice,
        sellShares: draft.sellShares,
      });
      return loadRows({ silent: true });
    });
  };

  const requestDelete = (deleteWholeWave = false) => {
    if (!selection.wave || !selection.group || typeof showConfirm !== 'function') return;
    const { wave, group } = selection;
    const deletingExit = wave.status === 'completed' && !deleteWholeWave;
    setModal(null);
    showConfirm({
      title: deletingExit
        ? tt('swing.deleteExitTitle', '删除这次卖出?')
        : tt('swing.deleteTitle', '删除整段波段?'),
      desc: deletingExit
        ? tt('swing.deleteExitDesc', '只删除这次卖出记录，对应股数将恢复到进行中；不影响正式交易、持仓或收益快照。')
        : tt('swing.deleteDesc', '将删除整段波段及其所有卖出记录；不影响正式交易、持仓或收益快照。'),
      info: `${group.symbol} · ${waveLabel(wave, tt)}`,
      confirmText: tt('trades.delete', '删除'),
      confirmStyle: 'danger',
      icon: '🗑',
      onConfirm: async () => {
        try {
          if (deletingExit) {
            await db.deleteSwingWaveExit(waveRecordId(wave), waveExitId(wave));
          } else {
            await db.deleteSwingWave(waveRecordId(wave));
          }
          await loadRows({ silent: true });
        } catch (error) {
          const message = error?.message || tt('swing.saveFailed', '波段记录保存失败');
          if (/其他设备修改|stale/i.test(message)) {
            try { await loadRows({ silent: true }); } catch {}
          }
          window.setTimeout(() => showNotice(tt('swing.operationFailed', '操作未完成'), message), 0);
        }
      },
    });
  };
  const confirmDelete = () => requestDelete(false);
  const confirmDeleteWholeWave = () => requestDelete(true);

  const applyForecastPreset = (preset) => {
    const currentPrice = positive(selection.wave?.currentPriceUsd);
    const buyPrice = positive(selection.wave?.buyPriceUsd);
    const nextPrice = preset.id === 'current'
      ? currentPrice
      : preset.id === 'cost'
        ? buyPrice
        : currentPrice * positive(preset.multiplier);
    if (!(nextPrice > 0)) return;
    setForecastTargetInput(nextPrice.toFixed(2));
    setForecastPreset(preset.id);
  };

  const addReady = normalizeStrictUserStockSymbol(draft.symbol)
    && positive(draft.buyPrice) > 0
    && positive(draft.shares) > 0
    && draft.startDate;
  const activeSibling = selection.wave?.status === 'completed'
    ? selection.group?.waves.find((wave) => wave.status === 'active' && wave.recordId === selection.wave.recordId)
    : null;
  const editableExitMaxShares = selection.wave?.status === 'completed'
    ? number(selection.wave.shares) + number(activeSibling?.shares)
    : 0;
  const editingExit = modal?.type === 'edit' && modal?.editTarget === 'exit';
  const editReady = editingExit
    ? positive(draft.sellPrice) > 0
      && positive(draft.sellShares) > 0
      && positive(draft.sellShares) <= editableExitMaxShares + 1e-9
      && draft.endDate
      && draft.endDate >= selection.wave.buyDate
    : positive(draft.buyPrice) > 0
      && positive(draft.shares) > 0
      && draft.startDate;
  const remainingShares = number(selection.wave?.shares);
  const sellShares = positive(draft.sellShares);
  const sellSharesValid = sellShares > 0 && sellShares <= remainingShares + 1e-9;
  const remainingAfterSell = sellSharesValid ? Math.max(0, remainingShares - sellShares) : remainingShares;
  const sellReady = positive(draft.sellPrice) > 0
    && sellSharesValid
    && draft.endDate
    && selection.wave
    && draft.endDate >= selection.wave.buyDate;

  return (
    <main className="wave-page" style={{ fontFamily: PAGE_FONT }}>
      <header className="wave-header">
        <div className="wave-title-row">
          <button type="button" onClick={closeWaveTracker} className="wave-icon-button" aria-label={tt('swing.back', '返回')}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1>{tt('trades.swingLog', '波段记录')}</h1>
          <button type="button" onClick={() => setModal({ type: 'info' })} className="wave-icon-button" aria-label={tt('swing.openRules', '查看波段规则')}>
            <Info className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </button>
        </div>
      </header>

      <div className="wave-body">
        <section className="wave-hero" aria-busy={loading}>
          <div className="wave-hero-label">
            <span>{tt('swing.cumulativePnl', '累计盈亏')}</span>
            <span>{displayCurrency}</span>
          </div>
          <div className="wave-hero-value" style={{ color: tone(loading || loadError ? null : cumulativeDisplayPnl), fontFamily: NUMBER_FONT }}>
            {formatPnl(loading || loadError ? null : cumulativeDisplayPnl, displayCurrency, 2)}
          </div>
          <div className="wave-hero-stats">
            <Metric label={tt('swing.positions', '持仓数量')} value={loading || loadError ? '--' : tt('swing.positionsValue', '{{stocks}}只 · {{waves}}段', { stocks: dashboard.activeStockCount, waves: dashboard.activeWaveCount })} />
            <Metric label={tt('trades.completed', '已完成')} value={loading || loadError ? '--' : dashboard.completedWaveCount} align="right" />
          </div>
        </section>

        <div className="wave-toolbar">
          <div className="wave-filters">
            {[
              ['all', tt('swing.all', '全部')],
              ['active', tt('trades.active', '进行中')],
              ['completed', tt('trades.completed', '已完成')],
            ].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} className="wave-filter">
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={openAdd} className="wave-add">
            <Plus size={16} strokeWidth={1.6} />
            {tt('swing.add', '新增波段')}
          </button>
        </div>

        <section className="wave-stock-list">
          {loading ? (
            <div className="wave-empty" role="status">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
              {tt('swing.loading', '正在读取波段记录')}
            </div>
          ) : loadError ? (
            <div className="wave-empty" role="status">
              <div>{tt('swing.loadFailed', '波段记录加载失败')}</div>
              <p>{loadError}</p>
              <button type="button" onClick={() => loadRows().catch(() => {})} className="wave-add">{tt('swing.retry', '重新加载')}</button>
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="wave-empty">
              <div>{filter === 'all' ? tt('swing.empty', '暂无波段记录') : tt('swing.emptyFilter', '当前分类暂无记录')}</div>
              <p>{tt('swing.emptyDesc', '每个波段支持分批卖出，卖出批次分别进入已完成。')}</p>
              {filter === 'all' ? <button type="button" onClick={openAdd} className="wave-add">{tt('swing.addFirst', '新增第一个波段')}</button> : null}
            </div>
          ) : visibleGroups.map((group) => (
            <StockCard
              key={group.symbol}
              group={group}
              expanded={isGroupExpanded(group)}
              filter={filter}
              onToggle={() => toggleGroupExpanded(group)}
              onAction={openActions}
              tt={tt}
              displayRate={displayRate}
              displayCurrency={displayCurrency}
              logoCache={logoCache}
              cacheStockLogo={cacheStockLogo}
              todayKey={todayKey}
            />
          ))}
        </section>

        {!loading && !loadError && visibleGroups.length > 0 ? (
          <div className="wave-list-end">
            {tt('swing.allShown', '已显示全部')}
          </div>
        ) : null}
      </div>

      {modal?.type === 'info' ? (
        <StockReportModal panelClassName="wave-dialog" title={tt('swing.rules', '波段规则')} closeLabel={tt('swing.closeRules', '关闭波段规则')} onClose={() => setModal(null)}>
          <ol className="wave-dialog-rules">
            <li><span aria-hidden="true">01</span><p>{tt('swing.ruleOne', '每个波段可分多次卖出；每次卖出的数量和盈亏独立进入已完成。')}</p></li>
            <li><span aria-hidden="true">02</span><p>{tt('swing.ruleMany', '同一股票可以同时建立多个独立波段；未卖股数继续保留在进行中。')}</p></li>
            <li><span aria-hidden="true">03</span><p>{tt('swing.ruleCurrency', '单价始终按 USD 录入，第一版不计算佣金和手续费。')}</p></li>
          </ol>
        </StockReportModal>
      ) : null}

      {modal?.type === 'add' ? (
        <StockReportModal panelClassName="wave-dialog" title={tt('swing.add', '新增波段')} closeLabel={tt('swing.closeAdd', '关闭新增波段')} onClose={() => !submitting && setModal(null)} actions={[
          { key: 'confirm', label: submitting ? tt('swing.processing', '处理中...') : tt('swing.confirmBuy', '确认买入'), onClick: createWave, disabled: !addReady || submitting, className: 'srm-primary' },
        ]}>
          <ModalFormScroller>
            <div className="wave-dialog-form">
              <div className="wave-dialog-intro">
                <span className="wave-dialog-badge wave-dialog-badge-buy">{tt('swing.buyBadge', '买入')}</span>
                <p>{tt('swing.addHint', '新建一个独立波段，后续可分批卖出')}</p>
              </div>
              <FormField label={tt('swing.symbol', '股票代码')} value={draft.symbol || ''} onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} placeholder="NVDA" autoCapitalize="characters" />
              <div className="wave-dialog-field-pair">
                <FormField label={tt('swing.buyPriceUsd', '买入成本价（USD）')} prefix="$" value={draft.buyPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, buyPrice: event.target.value }))} inputMode="decimal" placeholder="0.00" />
                <FormField label={tt('swing.buyShares', '买入数量')} value={draft.shares || ''} onChange={(event) => setDraft((current) => ({ ...current, shares: event.target.value }))} inputMode="decimal" placeholder="0" />
              </div>
              <FormField label={tt('swing.startDate', '开始日期')} type="date" value={draft.startDate || ''} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
              <FormField label={tt('swing.note', '计划 / 备注')} value={draft.note || ''} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder={tt('swing.notePlaceholder', '例如：250 开始卖出')} />
            </div>
          </ModalFormScroller>
        </StockReportModal>
      ) : null}

      {modal?.type === 'actions' && selection.group && selection.wave ? (
        <StockReportModal
          title={tt('swing.actions', '波段操作')}
          closeLabel={tt('swing.closeActions', '关闭波段操作')}
          onClose={() => setModal(null)}
          widthClassName="w-[calc(100vw-32px)] max-w-[420px]"
          panelClassName="wave-dialog wave-dialog-actions"
          actions={[
          { key: 'detail', label: tt('swing.detail', '详情'), onClick: () => openDetail(selection.wave) },
          { key: 'edit', label: selection.wave.status === 'active' ? tt('trades.edit', '编辑') : tt('swing.editSellAction', '修改卖出'), onClick: () => openEdit(selection.wave) },
          ...(selection.wave.status === 'completed' ? [{ key: 'edit-parent', label: tt('swing.editParentAction', '编辑波段'), onClick: () => openEdit(selection.wave, 'parent') }] : []),
          ...(selection.wave.status === 'active' ? [{ key: 'sell', label: tt('trades.sell', '卖出'), onClick: () => openSell(selection.wave) }] : []),
        ]}
        >
          <ModalStockHeader
            group={selection.group}
            wave={selection.wave}
            sideLabel={selection.wave.status === 'active' ? (
              <span className="wave-dialog-status-line">
                <span>{tt('swing.waveNumber', '波段 {{number}}', { number: String(selection.wave.sequence).padStart(2, '0') })}</span>
                <span className="wave-dialog-badge">{tt('trades.active', '进行中')}</span>
              </span>
            ) : waveLabel(selection.wave, tt)}
            logoCache={logoCache}
            cacheStockLogo={cacheStockLogo}
          />
          {selection.wave.status === 'active' ? (
            <>
              <div className="wave-dialog-current-metrics">
                <div>
                  <div className="wave-dialog-metric-label">{tt('swing.currentPnl', '当前收益')}</div>
                  <div className="wave-dialog-metric-value" style={{ color: tone(selection.wave.pnlUsd), fontFamily: NUMBER_FONT }}>
                    {formatPnl(selection.wave.pnlUsd == null ? null : selection.wave.pnlUsd * displayRate, displayCurrency)}
                  </div>
                </div>
                <div>
                  <div className="wave-dialog-metric-label">{tt('swing.currentPrice', '现价')}</div>
                  <div className="wave-dialog-metric-value" style={{ fontFamily: NUMBER_FONT }}>{formatUsdPrice(selection.wave.currentPriceUsd)}</div>
                </div>
                <div>
                  <div className="wave-dialog-metric-label">{tt('swing.unrealized', '浮盈')}</div>
                  <div className="wave-dialog-metric-value" style={{ color: tone(selection.wave.returnPct), fontFamily: NUMBER_FONT }}>{formatPct(selection.wave.returnPct)}</div>
                </div>
              </div>

              <div className="wave-dialog-forecast">
                <label htmlFor="wave-forecast-target" className="wave-dialog-field-label">{tt('swing.targetPriceUsd', '目标股价（USD）')}</label>
                <div className="wave-dialog-target-control">
                  <span className="wave-dialog-target-prefix">$</span>
                  <input
                    id="wave-forecast-target"
                    value={forecastTargetInput}
                    onChange={(event) => { setForecastTargetInput(event.target.value); setForecastPreset(''); }}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    className="wave-dialog-input wave-dialog-target-input"
                    style={{ boxSizing: 'border-box', fontFamily: NUMBER_FONT, minWidth: 0, width: '100%', WebkitMinLogicalWidth: '0px' }}
                  />
                  {forecastTargetInput ? (
                    <button type="button" onClick={() => { setForecastTargetInput(''); setForecastPreset(''); }} className="wave-dialog-clear-target" aria-label={tt('swing.clearTarget', '清空目标股价')}>
                      ×
                    </button>
                  ) : null}
                </div>

                <div className="wave-dialog-presets">
                  {FORECAST_PRESETS.map((preset) => {
                    const needsCurrent = preset.id !== 'cost';
                    const disabled = needsCurrent && !(positive(selection.wave.currentPriceUsd) > 0);
                    const active = forecastPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => applyForecastPreset(preset)}
                        className={`wave-dialog-preset${active ? ' is-active' : ''}`}
                        aria-pressed={active}
                      >
                        {preset.labelKey ? tt(preset.labelKey, preset.label) : preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="wave-dialog-forecast-result">
                <div className="wave-dialog-metric-label">{tt('swing.forecastPnl', '预计收益')}</div>
                <div className="wave-dialog-result-values">
                  <div className="wave-dialog-result-amount" style={{ color: tone(forecast.forecastPnlUsd), fontFamily: NUMBER_FONT }}>
                    {formatPnl(forecast.forecastPnlUsd == null ? null : forecast.forecastPnlUsd * displayRate, displayCurrency, 2)}
                  </div>
                  <div className="wave-dialog-result-percent" style={{ color: tone(forecast.forecastReturnPct), fontFamily: NUMBER_FONT }}>{formatPct(forecast.forecastReturnPct)}</div>
                </div>
                <div className="wave-dialog-forecast-track" aria-hidden="true">
                  <div className="wave-dialog-forecast-fill" style={{ width: `${forecast.progressPct * 100}%`, backgroundColor: tone(forecast.forecastPnlUsd) }} />
                  <span className="wave-dialog-forecast-thumb" style={{ left: `${2 + forecast.progressPct * 96}%`, borderColor: tone(forecast.forecastPnlUsd) }} />
                </div>
                <div className="wave-dialog-forecast-endpoints" style={{ fontFamily: NUMBER_FONT }}>
                  <span>{formatUsdPrice(selection.wave.buyPriceUsd)} {tt('swing.forecastCost', '成本价')}</span>
                  <span className="text-right">{formatUsdPrice(forecast.targetPriceUsd)} {tt('swing.forecastTarget', '目标')}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="wave-dialog-metrics wave-dialog-completed-metrics">
                <Metric label={tt('swing.returnRate', '收益率')} value={formatPct(selection.wave.returnPct)} valueColor={tone(selection.wave.returnPct)} />
                <Metric label={tt('swing.sellPrice', '卖出价')} value={formatUsdPrice(selection.wave.exitPriceUsd)} valueColor={tone(selection.wave.returnPct)} />
                <Metric label={tt('swing.realized', '已实现')} value={formatPnl(selection.wave.pnlUsd == null ? null : selection.wave.pnlUsd * displayRate, displayCurrency)} valueColor={tone(selection.wave.pnlUsd)} align="right" />
              </div>
              <div className="wave-dialog-note">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{selection.wave.note || tt('swing.noNote', '暂无计划备注')}</span>
              </div>
            </>
          )}
        </StockReportModal>
      ) : null}

      {modal?.type === 'detail' && selection.group && selection.wave ? (
        <StockReportModal panelClassName="wave-dialog" title={tt('swing.detailTitle', '波段详情')} closeLabel={tt('swing.closeDetail', '关闭波段详情')} onClose={() => setModal(null)} actions={[
          { key: 'edit', label: tt('swing.modify', '修改'), onClick: () => openEdit(selection.wave) },
          { key: 'delete', label: tt('trades.delete', '删除'), onClick: confirmDelete },
        ]}>
          <ModalStockHeader group={selection.group} wave={selection.wave} sideLabel={selection.wave.status === 'active' ? tt('trades.active', '进行中') : waveLabel(selection.wave, tt)} logoCache={logoCache} cacheStockLogo={cacheStockLogo} />
          <div className="wave-dialog-metrics wave-dialog-detail-metrics">
            <Metric label={tt('swing.buyCost', '买入成本价')} value={formatUsdPrice(selection.wave.buyPriceUsd)} />
            <Metric label={selection.wave.status === 'active' ? tt('swing.remainingSharesLabel', '剩余数量') : tt('swing.thisSellShares', '本次卖出')} value={tt('swing.sharesValue', '{{shares}} 股', { shares: formatShares(selection.wave.shares) })} align="right" />
            <Metric label={selection.wave.status === 'active' ? tt('swing.currentPrice', '当前价') : tt('swing.sellPrice', '卖出价')} value={formatUsdPrice(selection.wave.exitPriceUsd)} valueColor={tone(selection.wave.returnPct)} />
            <Metric label={selection.wave.status === 'active' ? tt('swing.floatingPnl', '浮动盈亏') : tt('swing.realizedPnl', '已实现盈亏')} value={formatPnl(selection.wave.pnlUsd == null ? null : selection.wave.pnlUsd * displayRate, displayCurrency)} valueColor={tone(selection.wave.pnlUsd)} align="right" />
          </div>
          <div className="wave-dialog-note">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{selection.wave.note || tt('swing.noNote', '暂无计划备注')}</span>
          </div>
        </StockReportModal>
      ) : null}

      {modal?.type === 'edit' && selection.group && selection.wave ? (
        <StockReportModal panelClassName="wave-dialog" title={editingExit ? tt('swing.editExitTitle', '编辑本次卖出') : tt('swing.editTitle', '编辑波段')} closeLabel={tt('swing.closeEdit', '关闭编辑波段')} onClose={() => !submitting && setModal(null)} actions={[
          ...(!editingExit && selection.wave.status === 'completed' ? [{ key: 'delete-wave', label: tt('swing.deleteWholeWave', '删除整段'), onClick: confirmDeleteWholeWave, disabled: submitting }] : []),
          { key: 'save', label: submitting ? tt('swing.processing', '处理中...') : tt('swing.saveChanges', '保存修改'), onClick: saveEdit, disabled: !editReady || submitting, className: 'srm-primary' },
        ]}>
          <ModalFormScroller>
            <div className="wave-dialog-form">
              <ModalStockHeader
                group={selection.group}
                wave={editingExit ? selection.wave : { ...selection.wave, shares: selection.wave.originalShares ?? selection.wave.shares }}
                sideLabel={editingExit ? waveLabel(selection.wave, tt) : tt('swing.editBuy', '编辑买入')}
                logoCache={logoCache}
                cacheStockLogo={cacheStockLogo}
              />
              {editingExit ? (
                <>
                  <div className="wave-dialog-field-pair">
                    <FormField label={tt('swing.sellPriceUsd', '卖出价格（USD）')} prefix="$" value={draft.sellPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, sellPrice: event.target.value }))} inputMode="decimal" />
                    <FormField label={tt('swing.sellQuantity', '卖出数量')} value={draft.sellShares || ''} onChange={(event) => setDraft((current) => ({ ...current, sellShares: event.target.value }))} inputMode="decimal" />
                  </div>
                  <FormField label={tt('swing.sellDate', '卖出日期')} type="date" min={selection.wave.buyDate} value={draft.endDate || ''} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
                  {positive(draft.sellShares) > editableExitMaxShares + 1e-9 ? <div className="wave-dialog-validation" style={{ color: PROFIT }}>{tt('swing.editSellExceeds', '卖出数量最多可调整为 {{shares}} 股', { shares: formatShares(editableExitMaxShares) })}</div> : null}
                </>
              ) : (
                <>
                  <div className="wave-dialog-field-pair">
                    <FormField label={tt('swing.buyPriceUsd', '买入成本价（USD）')} prefix="$" value={draft.buyPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, buyPrice: event.target.value }))} inputMode="decimal" />
                    <FormField label={tt('swing.buyShares', '买入数量')} value={draft.shares || ''} onChange={(event) => setDraft((current) => ({ ...current, shares: event.target.value }))} inputMode="decimal" />
                  </div>
                  <FormField label={tt('swing.startDate', '开始日期')} type="date" value={draft.startDate || ''} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
                  <FormField label={tt('swing.note', '计划 / 备注')} value={draft.note || ''} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
                </>
              )}
            </div>
          </ModalFormScroller>
        </StockReportModal>
      ) : null}

      {modal?.type === 'sell' && selection.group && selection.wave ? (
        <StockReportModal panelClassName="wave-dialog" title={tt('swing.sellWave', '卖出波段')} closeLabel={tt('swing.closeSell', '关闭卖出波段')} onClose={() => !submitting && setModal(null)} actions={[
          { key: 'confirm', label: submitting ? tt('swing.processing', '处理中...') : tt('swing.sellShares', '卖出 {{shares}} 股', { shares: formatShares(sellShares || 0) }), onClick: sellWave, disabled: !sellReady || submitting, className: 'srm-primary' },
        ]}>
          <ModalFormScroller>
            <div className="wave-dialog-form">
              <ModalStockHeader group={selection.group} wave={selection.wave} sideLabel={<span className="wave-dialog-badge wave-dialog-badge-sell">{tt('swing.partialSell', '分批卖出')}</span>} logoCache={logoCache} cacheStockLogo={cacheStockLogo} />
              <div className="wave-dialog-hint">
                {tt('swing.sellHint', '可卖出部分或全部剩余股数；每次卖出都会独立进入已完成。')}
              </div>
              <div className="wave-dialog-field-pair">
                <FormField label={tt('swing.sellPriceUsd', '卖出价格（USD）')} prefix="$" value={draft.sellPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, sellPrice: event.target.value }))} inputMode="decimal" placeholder="0.00" />
                <FormField label={tt('swing.sellQuantity', '卖出数量')} value={draft.sellShares || ''} onChange={(event) => setDraft((current) => ({ ...current, sellShares: event.target.value }))} inputMode="decimal" placeholder="0" />
              </div>
              <FormField label={tt('swing.sellDate', '卖出日期')} type="date" min={selection.wave.buyDate} value={draft.endDate || ''} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
              {draft.endDate && draft.endDate < selection.wave.buyDate ? <div className="wave-dialog-validation" style={{ color: PROFIT }}>{tt('swing.endBeforeStart', '结束日期不能早于开始日期')}</div> : null}
              {sellShares > remainingShares + 1e-9 ? (
                <div className="wave-dialog-validation" style={{ color: PROFIT }}>{tt('swing.sellExceedsRemaining', '卖出数量不能超过剩余 {{shares}} 股', { shares: formatShares(remainingShares) })}</div>
              ) : sellSharesValid ? (
                <div className="wave-dialog-validation">
                  {remainingAfterSell > 1e-9
                    ? tt('swing.partialSellRemaining', '卖出后剩余 {{shares}} 股，继续保留在进行中。', { shares: formatShares(remainingAfterSell) })
                    : tt('swing.sellAllRemaining', '本次卖出后，这段波段将全部卖完。')}
                </div>
              ) : null}
              <div className="wave-dialog-footnote">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                {tt('swing.noFees', '第一版不计算佣金和手续费')}
              </div>
            </div>
          </ModalFormScroller>
        </StockReportModal>
      ) : null}
    </main>
  );
}
