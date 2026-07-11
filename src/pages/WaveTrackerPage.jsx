import React from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Info,
  Loader2,
  Plus,
} from 'lucide-react';
import ActionModalCard from '../components/ActionModalCard.jsx';
import StockLogo, { stockLogoCandidates } from '../components/StockLogo.jsx';
import { t } from '../lib/i18n.js';
import { normalizeStrictUserStockSymbol } from '../lib/symbols.js';
import {
  buildSwingWaveDashboard,
  mergeSwingWaveQuoteRows,
  summarizeSwingWaveGroup,
} from '../lib/swingWavesViewModel.js';

const PAGE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';
const PROFIT = '#ff5b50';
const LOSS = '#36c49a';
const GOLD = '#f6b54b';
const FALLBACK_USD_CNY_RATE = 7.2;

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

function formatPnl(value, currency = 'USD', digits = 0) {
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

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function statusAccent(status, value) {
  if (status === 'completed' || value == null || Number(value) === 0) return 'gray';
  return Number(value) > 0 ? 'red' : 'green';
}

function StatusDot({ accent = 'gray', pulse = false }) {
  const color = accent === 'gray' ? '#8d949d' : accent === 'green' ? LOSS : PROFIT;
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}55` }}
      aria-hidden="true"
    />
  );
}

function Metric({ label, value, valueColor = 'rgba(255,255,255,0.84)', align = 'left' }) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <div className="truncate text-[9px] leading-3 text-white/[0.36]">{label}</div>
      <div
        className="mt-1 truncate text-[11.5px] font-normal leading-[15px] tabular-nums"
        style={{ color: valueColor, fontFamily: NUMBER_FONT }}
      >
        {value}
      </div>
    </div>
  );
}

function FormField({ label, prefix, children, ...inputProps }) {
  return (
    <label className="block min-w-0 max-w-full overflow-hidden">
      <span className="mb-1.5 block text-[10.5px] font-normal text-white/[0.38]">{label}</span>
      <span className="flex h-10 w-full min-w-0 max-w-full items-center overflow-hidden rounded-[11px] border border-white/[0.08] bg-black/[0.18] px-2.5 focus-within:border-[#f6b54b]/35">
        {prefix ? <span className="mr-1.5 text-[13px] text-white/[0.38]">{prefix}</span> : null}
        {children || (
          <input
            {...inputProps}
            className="block h-full min-w-0 max-w-full flex-1 appearance-none bg-transparent text-[12.5px] font-normal text-white/[0.82] outline-none placeholder:text-white/[0.18] tabular-nums"
            style={{
              boxSizing: 'border-box',
              colorScheme: 'dark',
              fontFamily: NUMBER_FONT,
              maxWidth: '100%',
              minWidth: 0,
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
    <div className="max-h-[52dvh] min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">
      {children}
    </div>
  );
}

function LogoBadge({ symbol, logoCache, cacheStockLogo }) {
  return (
    <div className="flex h-[48px] w-[48px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.13] bg-black/[0.38] shadow-[0_8px_22px_rgba(0,0,0,0.36)]">
      <StockLogo
        symbol={symbol}
        urls={stockLogoCandidates(symbol, logoCache?.[symbol]?.url)}
        onLogoLoad={cacheStockLogo}
        className="h-8 w-8 rounded-[7px]"
      />
    </div>
  );
}

function ModalStockHeader({ group, wave, sideLabel, logoCache, cacheStockLogo }) {
  return (
    <div className="grid min-h-[58px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.5">
      <div className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-full border border-white/[0.13] bg-black/[0.38]">
        <StockLogo
          symbol={group.symbol}
          urls={stockLogoCandidates(group.symbol, logoCache?.[group.symbol]?.url)}
          onLogoLoad={cacheStockLogo}
          className="h-6 w-6 rounded-[4px]"
        />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-normal leading-5 text-white/[0.82]">{group.symbol}</div>
        <div className="mt-[3px] truncate text-[11.5px] leading-4 text-white/[0.42]">{group.displayName}</div>
      </div>
      <div className="text-right">
        <div className="whitespace-nowrap text-[13px] text-white/[0.5]">{sideLabel}</div>
        <div className="mt-0.5 whitespace-nowrap text-[11px] text-white/[0.34] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
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
      className="block w-full border-t border-white/[0.075] px-3.5 py-3 text-left outline-none first:border-t-0 active:bg-white/[0.025] focus-visible:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#f6b54b]/35"
      aria-label={tt('swing.openWaveActions', '打开 {{symbol}} 波段 {{number}} 操作', { symbol: group.symbol, number: String(wave.sequence).padStart(2, '0') })}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
        <span className="rounded-[7px] border border-[#f6b54b]/55 px-2 py-1 text-[10px] font-normal text-[#f5bd62] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          {tt('swing.waveNumber', '波段 {{number}}', { number: String(wave.sequence).padStart(2, '0') })}
        </span>
        <div className="flex min-w-0 items-center gap-2 text-[10.5px] text-white/[0.58]">
          <StatusDot accent={statusAccent(wave.status, wave.returnPct)} pulse={isActive} />
          <span className="shrink-0 text-white/[0.76]">{isActive ? tt('trades.active', '进行中') : tt('trades.completed', '已完成')}</span>
          <span className="h-3 w-px shrink-0 bg-white/[0.09]" />
          <span className="truncate tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
            {isActive
              ? tt('swing.startedDays', '{{date}} 开始 · 第 {{days}} 天', { date: shortDate(wave.buyDate), days: wave.heldDays ?? '--' })
              : tt('swing.completedDays', '{{start}} ~ {{end}} · {{days}} 天', { start: shortDate(wave.buyDate), end: shortDate(wave.sellDate), days: wave.heldDays ?? '--' })}
          </span>
        </div>
        <span className="text-[16px] font-normal tabular-nums" style={{ color: tone(wave.returnPct), fontFamily: NUMBER_FONT }}>
          {formatPct(wave.returnPct)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <Metric label={tt('swing.buyAverage', '买入均价')} value={formatUsdPrice(wave.buyPriceUsd)} />
        <Metric label={isActive ? tt('swing.currentPrice', '现价') : tt('swing.sellAverage', '卖出均价')} value={formatUsdPrice(isActive ? wave.currentPriceUsd : wave.sellPriceUsd)} valueColor={tone(wave.returnPct)} />
        <Metric label={isActive ? tt('swing.heldShares', '持有') : tt('swing.soldShares', '卖出')} value={tt('swing.sharesValue', '{{shares}} 股', { shares: formatShares(wave.shares) })} />
        <Metric label={isActive ? tt('swing.unrealized', '浮盈') : tt('swing.realized', '已实现')} value={formatPnl(displayPnl, displayCurrency)} valueColor={tone(displayPnl)} align="right" />
      </div>

      <div className="mt-3 flex min-h-6 items-center gap-2 border-t border-white/[0.045] pt-2.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-white/[0.32]" strokeWidth={1.7} />
        <span className="min-w-0 flex-1 truncate text-[10.5px] text-white/[0.42]">{wave.note || tt('swing.noNote', '暂无计划备注')}</span>
      </div>
    </button>
  );
}

function StockCard({ group, expanded, filter, onToggle, onAction, tt, displayRate, displayCurrency, logoCache, cacheStockLogo, todayKey }) {
  const summary = summarizeSwingWaveGroup(group, filter, todayKey);
  const isActive = summary.status === 'active';
  const displayPnl = summary.pnlUsd == null ? null : summary.pnlUsd * displayRate;
  return (
    <article className="overflow-hidden rounded-[18px] border border-[#1a2530] bg-[linear-gradient(145deg,rgba(15,21,29,0.98),rgba(8,13,19,0.98))] shadow-[0_15px_38px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.025)]">
      <button type="button" onClick={onToggle} className="block w-full px-3.5 py-3.5 text-left outline-none active:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-[#f6b54b]/40" aria-expanded={expanded}>
        <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3">
          <LogoBadge symbol={group.symbol} logoCache={logoCache} cacheStockLogo={cacheStockLogo} />
          <div className="min-w-0">
            <div className="truncate text-[19px] font-normal leading-6 tracking-[0.01em] text-white/[0.94]">{group.symbol}</div>
            <div className="mt-0.5 truncate text-[10.5px] text-white/[0.43]">{group.displayName}</div>
            {!expanded ? (
              <div className="mt-1.5 whitespace-nowrap text-[10px] text-white/[0.38] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
                {isActive
                  ? tt('swing.startedDays', '{{date}} 开始 · 第 {{days}} 天', { date: shortDate(summary.firstDate), days: summary.heldDays ?? '--' })
                  : tt('swing.completedDays', '{{start}} ~ {{end}} · {{days}} 天', { start: shortDate(summary.firstDate), end: shortDate(summary.endDate), days: summary.heldDays ?? '--' })}
              </div>
            ) : null}
          </div>
          <div className="flex min-w-[54px] items-center justify-end gap-2 text-right">
            <div>
              <div className="text-[19px] font-normal tabular-nums" style={{ color: tone(summary.returnPct), fontFamily: NUMBER_FONT }}>
                {formatPct(summary.returnPct)}
              </div>
              {expanded ? <div className="mt-0.5 text-[9px] text-white/[0.35]">{tt('swing.totalReturn', '总收益率')}</div> : null}
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-white/[0.68]" /> : <ChevronRight className="h-4 w-4 text-white/[0.48]" />}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/[0.075] pt-3">
          <Metric label={expanded && isActive ? tt('swing.totalHeld', '总持仓') : tt('swing.position', '持仓')} value={tt('swing.sharesValue', '{{shares}} 股', { shares: formatShares(summary.shares) })} />
          <Metric label={expanded ? tt('swing.average', '均价') : tt('swing.buyAverage', '买入均价')} value={formatUsdPrice(summary.averageBuyPriceUsd)} />
          <Metric label={isActive ? tt('swing.latestPrice', '最新价') : tt('swing.sellAverage', '卖出均价')} value={formatUsdPrice(summary.referencePriceUsd)} valueColor={tone(summary.returnPct)} />
          <Metric label={isActive ? (expanded ? tt('swing.totalUnrealized', '总浮盈') : tt('swing.unrealized', '浮盈')) : tt('swing.realized', '已实现')} value={formatPnl(displayPnl, displayCurrency)} valueColor={tone(displayPnl)} align="right" />
        </div>
      </button>

      {expanded ? (
        <div>
          {summary.visibleWaves.map((wave) => (
            <WaveRow key={wave.id} group={group} wave={wave} onAction={onAction} tt={tt} displayRate={displayRate} displayCurrency={displayCurrency} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function WaveTrackerPage({ ctx = {} }) {
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
  const [expandedSymbol, setExpandedSymbol] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [modal, setModal] = React.useState(null);
  const [draft, setDraft] = React.useState({});
  const [submitting, setSubmitting] = React.useState(false);
  const submittingRef = React.useRef(false);
  const quoteRequestRef = React.useRef(0);

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
    refreshQuotes(activeSymbols).catch(() => {});
    // activeSymbolsKey intentionally limits REST refreshes to membership changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbolsKey, refreshQuotes]);

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
      bodyWidth: document.body.style.width,
      htmlOverflow: document.documentElement.style.overflow,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.position = previous.bodyPosition;
      document.body.style.top = previous.bodyTop;
      document.body.style.width = previous.bodyWidth;
      document.documentElement.style.overflow = previous.htmlOverflow;
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
  const openActions = (group, wave) => setModal({ type: 'actions', waveId: wave.id, symbol: group.symbol });
  const openDetail = (wave) => setModal({ type: 'detail', waveId: wave.id });
  const openEdit = (wave) => {
    setDraft({
      symbol: wave.symbol,
      buyPrice: String(wave.buyPriceUsd),
      shares: String(wave.shares),
      startDate: wave.buyDate,
      sellPrice: wave.sellPriceUsd ? String(wave.sellPriceUsd) : '',
      endDate: wave.sellDate || '',
      note: wave.note || '',
    });
    setModal({ type: 'edit', waveId: wave.id });
  };
  const openSell = (wave) => {
    setDraft({ sellPrice: '', endDate: todayKey });
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
        setExpandedSymbol(created.symbol);
        setFilter('all');
      },
    );
  };

  const saveEdit = () => {
    if (!selection.wave) return;
    const input = {
      symbol: selection.wave.symbol,
      name: selection.wave.name,
      buyDate: draft.startDate,
      buyPriceUsd: draft.buyPrice,
      shares: draft.shares,
      note: draft.note || '',
      ...(selection.wave.status === 'completed' ? {
        sellDate: draft.endDate,
        sellPriceUsd: draft.sellPrice,
      } : {}),
    };
    runMutation(
      () => db.updateSwingWave(selection.wave.id, input),
      (updated) => setRows((current) => current.map((wave) => (wave.id === updated.id ? updated : wave))),
    );
  };

  const completeWave = () => {
    if (!selection.wave) return;
    runMutation(
      () => db.completeSwingWave(selection.wave.id, {
        sellDate: draft.endDate,
        sellPriceUsd: draft.sellPrice,
      }),
      (updated) => setRows((current) => current.map((wave) => (wave.id === updated.id ? updated : wave))),
    );
  };

  const confirmDelete = () => {
    if (!selection.wave || !selection.group || typeof showConfirm !== 'function') return;
    const { wave, group } = selection;
    setModal(null);
    showConfirm({
      title: tt('swing.deleteTitle', '删除这段波段?'),
      desc: tt('swing.deleteDesc', '只会删除独立波段记录，不影响正式交易、持仓或收益快照。'),
      info: `${group.symbol} · ${tt('swing.waveNumber', '波段 {{number}}', { number: String(wave.sequence).padStart(2, '0') })}`,
      confirmText: tt('trades.delete', '删除'),
      confirmStyle: 'danger',
      icon: '🗑',
      onConfirm: async () => {
        try {
          await db.deleteSwingWave(wave.id);
          setRows((current) => current.filter((item) => item.id !== wave.id));
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

  const addReady = normalizeStrictUserStockSymbol(draft.symbol)
    && positive(draft.buyPrice) > 0
    && positive(draft.shares) > 0
    && draft.startDate;
  const editReady = positive(draft.buyPrice) > 0
    && positive(draft.shares) > 0
    && draft.startDate
    && (selection.wave?.status !== 'completed' || (
      positive(draft.sellPrice) > 0 && draft.endDate && draft.endDate >= draft.startDate
    ));
  const sellReady = positive(draft.sellPrice) > 0
    && draft.endDate
    && selection.wave
    && draft.endDate >= selection.wave.buyDate;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-[radial-gradient(circle_at_50%_-20%,rgba(27,53,78,0.18),transparent_42%),#05080d] pb-[calc(env(safe-area-inset-bottom)+92px)] text-white" style={{ fontFamily: PAGE_FONT }}>
      <header className="sticky top-0 z-30 -mx-4 border-b border-white/[0.07] bg-[#05080d]/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={closeWaveTracker} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/[0.72] active:scale-95" aria-label={tt('swing.back', '返回')}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h1 className="truncate text-[18px] font-normal tracking-[0.01em] text-white/[0.94]">{tt('trades.swingLog', '波段记录')}</h1>
            <button type="button" onClick={() => setModal({ type: 'info' })} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/[0.43] active:scale-90" aria-label={tt('swing.openRules', '查看波段规则')}>
              <Info className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
          <button type="button" onClick={openAdd} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#f6b54b]/[0.08] px-3.5 text-[12px] font-normal text-[#f6bd61] shadow-[0_0_22px_rgba(246,181,75,0.08)] active:scale-95">
            <Plus className="h-4 w-4" strokeWidth={1.8} />
            {tt('swing.add', '新增波段')}
          </button>
        </div>
      </header>

      <div className="px-0.5 pt-5">
        <section className="relative grid grid-cols-2 items-center gap-y-3 px-1 min-[360px]:grid-cols-[0.82fr_1.32fr_1fr_auto] min-[360px]:gap-y-0">
          <div className="pr-2">
            <div className="flex items-center gap-2 whitespace-nowrap text-[11px] text-white/[0.66]">
              <span className="h-2 w-2 rounded-full bg-[#ff5b50] shadow-[0_0_10px_rgba(255,91,80,0.55)]" />
              <span>{tt('trades.active', '进行中')}</span>
              <span className="text-[16px] tabular-nums" style={{ color: PROFIT, fontFamily: NUMBER_FONT }}>{dashboard.activeStockCount}</span>
            </div>
          </div>
          <div className="min-w-0 border-l border-white/[0.12] px-3">
            <div className="text-[9.5px] text-white/[0.36]">{tt('swing.cumulativePnl', '累计盈亏')}</div>
            <div className="mt-1 whitespace-nowrap text-[12px] tabular-nums" style={{ color: tone(cumulativeDisplayPnl), fontFamily: NUMBER_FONT }}>{formatPnl(cumulativeDisplayPnl, displayCurrency, 2)}</div>
          </div>
          <div className="min-w-0 pr-2 min-[360px]:border-l min-[360px]:border-white/[0.12] min-[360px]:px-3">
            <div className="text-[9.5px] text-white/[0.36]">{tt('swing.positions', '持仓数量')}</div>
            <div className="mt-1 whitespace-nowrap text-[12px] text-white/[0.84] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>
              {tt('swing.positionsValue', '{{stocks}}只 · {{waves}}段', { stocks: dashboard.activeStockCount, waves: dashboard.activeWaveCount })}
            </div>
          </div>
          <div className="relative justify-self-end">
            <button type="button" onClick={() => setFilterOpen((open) => !open)} className="flex h-9 items-center gap-1 whitespace-nowrap pl-2 text-[11px] text-white/[0.62] active:scale-95" aria-expanded={filterOpen}>
              {filter === 'all' ? tt('swing.all', '全部') : filter === 'active' ? tt('trades.active', '进行中') : tt('trades.completed', '已完成')}
              <ChevronDown className={`h-3.5 w-3.5 transition ${filterOpen ? 'rotate-180' : ''}`} />
            </button>
            {filterOpen ? (
              <div className="absolute right-0 top-10 z-20 w-[94px] overflow-hidden rounded-xl border border-white/[0.12] bg-[#111720]/95 p-1 shadow-2xl backdrop-blur-xl">
                {[
                  ['all', tt('swing.all', '全部')],
                  ['active', tt('trades.active', '进行中')],
                  ['completed', tt('trades.completed', '已完成')],
                ].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => { setFilter(id); setFilterOpen(false); setExpandedSymbol(''); }} className={`block w-full rounded-lg px-2 py-2 text-left text-[11px] ${filter === id ? 'bg-white/[0.07] text-[#f6bd61]' : 'text-white/[0.58]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5 space-y-3">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center rounded-[18px] border border-white/[0.08] bg-[#0b0f14] text-[12px] text-white/[0.45]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#f6b54b]" />
              {tt('swing.loading', '正在读取波段记录')}
            </div>
          ) : loadError ? (
            <div className="rounded-[18px] border border-[#ff5b50]/20 bg-[#ff5b50]/[0.035] px-4 py-7 text-center">
              <div className="text-[13px] text-white/[0.7]">{tt('swing.loadFailed', '波段记录加载失败')}</div>
              <div className="mt-1 break-words text-[10.5px] text-white/[0.38]">{loadError}</div>
              <button type="button" onClick={() => loadRows().catch(() => {})} className="mt-4 rounded-full bg-[#f6b54b]/[0.09] px-4 py-2 text-[11px] text-[#f6bd61] active:scale-95">{tt('swing.retry', '重新加载')}</button>
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-white/[0.1] bg-[#0b0f14] px-4 py-10 text-center">
              <div className="text-[13px] text-white/[0.68]">{filter === 'all' ? tt('swing.empty', '暂无波段记录') : tt('swing.emptyFilter', '当前分类暂无记录')}</div>
              <div className="mt-1 text-[10.5px] text-white/[0.34]">{tt('swing.emptyDesc', '每个波段独立记录一次完整买入和完整卖出。')}</div>
              {filter === 'all' ? <button type="button" onClick={openAdd} className="mt-4 rounded-full bg-[#f6b54b]/[0.09] px-4 py-2 text-[11px] text-[#f6bd61] active:scale-95">{tt('swing.addFirst', '新增第一个波段')}</button> : null}
            </div>
          ) : visibleGroups.map((group) => (
            <StockCard
              key={group.symbol}
              group={group}
              expanded={expandedSymbol === group.symbol}
              filter={filter}
              onToggle={() => setExpandedSymbol((current) => (current === group.symbol ? '' : group.symbol))}
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
          <div className="mt-5 flex items-center gap-3 px-8 text-[9.5px] text-white/[0.22]">
            <span className="h-px flex-1 bg-white/[0.07]" />
            {tt('swing.allShown', '已显示全部')}
            <span className="h-px flex-1 bg-white/[0.07]" />
          </div>
        ) : null}
      </div>

      {modal?.type === 'info' ? (
        <ActionModalCard title={tt('swing.rules', '波段规则')} closeLabel={tt('swing.closeRules', '关闭波段规则')} onClose={() => setModal(null)} actions={[{ key: 'close', label: tt('swing.gotIt', '知道了'), onClick: () => setModal(null) }]}>
          <div className="space-y-2 text-[11.5px] leading-5 text-white/[0.5]">
            <p>{tt('swing.ruleOne', '每个波段只记录一次完整买入和一次完整卖出。')}</p>
            <p>{tt('swing.ruleMany', '同一股票可以同时建立多个独立波段；卖出数量固定等于该波段买入数量。')}</p>
            <p>{tt('swing.ruleCurrency', '单价始终按 USD 录入，第一版不计算佣金和手续费。')}</p>
          </div>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'add' ? (
        <ActionModalCard title={tt('swing.add', '新增波段')} closeLabel={tt('swing.closeAdd', '关闭新增波段')} onClose={() => !submitting && setModal(null)} actions={[
          { key: 'cancel', label: tt('trades.cancel', '取消'), onClick: () => setModal(null), disabled: submitting },
          { key: 'confirm', label: submitting ? tt('swing.processing', '处理中...') : tt('swing.confirmBuy', '确认买入'), onClick: createWave, disabled: !addReady || submitting },
        ]}>
          <ModalFormScroller>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] text-white/[0.42]">
                <span className="flex h-7 min-w-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#f6b54b]/25 bg-[#f6b54b]/[0.07] px-2 text-[#f6b54b]">{tt('swing.buyBadge', '买入')}</span>
                {tt('swing.addHint', '新建一个独立波段，后续需整段完整卖出')}
              </div>
              <FormField label={tt('swing.symbol', '股票代码')} value={draft.symbol || ''} onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} placeholder="NVDA" autoCapitalize="characters" />
              <div className="grid min-w-0 grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
                <FormField label={tt('swing.buyPriceUsd', '买入成本价（USD）')} prefix="$" value={draft.buyPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, buyPrice: event.target.value }))} inputMode="decimal" placeholder="0.00" />
                <FormField label={tt('swing.buyShares', '买入数量')} value={draft.shares || ''} onChange={(event) => setDraft((current) => ({ ...current, shares: event.target.value }))} inputMode="decimal" placeholder="0" />
              </div>
              <FormField label={tt('swing.startDate', '开始日期')} type="date" value={draft.startDate || ''} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
              <FormField label={tt('swing.note', '计划 / 备注')} value={draft.note || ''} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder={tt('swing.notePlaceholder', '例如：250 开始卖出')} />
            </div>
          </ModalFormScroller>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'actions' && selection.group && selection.wave ? (
        <ActionModalCard title={tt('swing.actions', '波段操作')} closeLabel={tt('swing.closeActions', '关闭波段操作')} onClose={() => setModal(null)} actionGridClassName={selection.wave.status === 'active' ? 'grid-cols-3' : 'grid-cols-2'} actions={[
          { key: 'detail', label: tt('swing.detail', '详情'), onClick: () => openDetail(selection.wave) },
          { key: 'edit', label: tt('trades.edit', '编辑'), onClick: () => openEdit(selection.wave) },
          ...(selection.wave.status === 'active' ? [{ key: 'sell', label: tt('trades.sell', '卖出'), onClick: () => openSell(selection.wave) }] : []),
        ]}>
          <ModalStockHeader group={selection.group} wave={selection.wave} sideLabel={`${tt('swing.waveNumber', '波段 {{number}}', { number: String(selection.wave.sequence).padStart(2, '0') })} · ${selection.wave.status === 'active' ? tt('trades.active', '进行中') : tt('trades.completed', '已完成')}`} logoCache={logoCache} cacheStockLogo={cacheStockLogo} />
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
            <Metric label={tt('swing.returnRate', '收益率')} value={formatPct(selection.wave.returnPct)} valueColor={tone(selection.wave.returnPct)} />
            <Metric label={selection.wave.status === 'active' ? tt('swing.currentPrice', '当前价') : tt('swing.sellPrice', '卖出价')} value={formatUsdPrice(selection.wave.exitPriceUsd)} valueColor={tone(selection.wave.returnPct)} />
            <Metric label={selection.wave.status === 'active' ? tt('swing.unrealized', '浮盈') : tt('swing.realized', '已实现')} value={formatPnl(selection.wave.pnlUsd == null ? null : selection.wave.pnlUsd * displayRate, displayCurrency)} valueColor={tone(selection.wave.pnlUsd)} align="right" />
          </div>
          <div className="mt-3 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[10.5px] leading-4 text-white/[0.4]">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{selection.wave.note || tt('swing.noNote', '暂无计划备注')}</span>
          </div>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'detail' && selection.group && selection.wave ? (
        <ActionModalCard title={tt('swing.detailTitle', '波段详情')} closeLabel={tt('swing.closeDetail', '关闭波段详情')} onClose={() => setModal(null)} actionGridClassName="grid-cols-3" actions={[
          { key: 'close', label: tt('trades.close', '关闭'), onClick: () => setModal(null) },
          { key: 'edit', label: tt('swing.modify', '修改'), onClick: () => openEdit(selection.wave) },
          { key: 'delete', label: tt('trades.delete', '删除'), onClick: confirmDelete },
        ]}>
          <ModalStockHeader group={selection.group} wave={selection.wave} sideLabel={selection.wave.status === 'active' ? tt('trades.active', '进行中') : tt('trades.completed', '已完成')} logoCache={logoCache} cacheStockLogo={cacheStockLogo} />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] pt-3">
            <Metric label={tt('swing.buyCost', '买入成本价')} value={formatUsdPrice(selection.wave.buyPriceUsd)} />
            <Metric label={tt('swing.buyShares', '买入数量')} value={tt('swing.sharesValue', '{{shares}} 股', { shares: formatShares(selection.wave.shares) })} align="right" />
            <Metric label={selection.wave.status === 'active' ? tt('swing.currentPrice', '当前价') : tt('swing.sellPrice', '卖出价')} value={formatUsdPrice(selection.wave.exitPriceUsd)} valueColor={tone(selection.wave.returnPct)} />
            <Metric label={selection.wave.status === 'active' ? tt('swing.floatingPnl', '浮动盈亏') : tt('swing.realizedPnl', '已实现盈亏')} value={formatPnl(selection.wave.pnlUsd == null ? null : selection.wave.pnlUsd * displayRate, displayCurrency)} valueColor={tone(selection.wave.pnlUsd)} align="right" />
          </div>
          <div className="mt-3 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[11px] leading-4 text-white/[0.4]">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {selection.wave.note || tt('swing.noNote', '暂无计划备注')}
          </div>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'edit' && selection.group && selection.wave ? (
        <ActionModalCard title={tt('swing.editTitle', '编辑波段')} closeLabel={tt('swing.closeEdit', '关闭编辑波段')} onClose={() => !submitting && setModal(null)} actions={[
          { key: 'cancel', label: tt('trades.cancel', '取消'), onClick: () => setModal(null), disabled: submitting },
          { key: 'save', label: submitting ? tt('swing.processing', '处理中...') : tt('swing.saveChanges', '保存修改'), onClick: saveEdit, disabled: !editReady || submitting },
        ]}>
          <ModalFormScroller>
            <div className="space-y-3">
              <ModalStockHeader group={selection.group} wave={selection.wave} sideLabel={selection.wave.status === 'active' ? tt('swing.editBuy', '编辑买入') : tt('swing.editRecord', '编辑记录')} logoCache={logoCache} cacheStockLogo={cacheStockLogo} />
              <div className="grid min-w-0 grid-cols-1 gap-2.5 border-t border-white/[0.06] pt-3 min-[360px]:grid-cols-2">
                <FormField label={tt('swing.buyPriceUsd', '买入成本价（USD）')} prefix="$" value={draft.buyPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, buyPrice: event.target.value }))} inputMode="decimal" />
                <FormField label={tt('swing.buyShares', '买入数量')} value={draft.shares || ''} onChange={(event) => setDraft((current) => ({ ...current, shares: event.target.value }))} inputMode="decimal" />
              </div>
              <FormField label={tt('swing.startDate', '开始日期')} type="date" value={draft.startDate || ''} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
              {selection.wave.status === 'completed' ? (
                <div className="grid min-w-0 grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
                  <FormField label={tt('swing.sellPriceUsd', '卖出价格（USD）')} prefix="$" value={draft.sellPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, sellPrice: event.target.value }))} inputMode="decimal" />
                  <FormField label={tt('swing.endDate', '结束日期')} type="date" min={draft.startDate || undefined} value={draft.endDate || ''} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
                </div>
              ) : null}
              <FormField label={tt('swing.note', '计划 / 备注')} value={draft.note || ''} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
            </div>
          </ModalFormScroller>
        </ActionModalCard>
      ) : null}

      {modal?.type === 'sell' && selection.group && selection.wave ? (
        <ActionModalCard title={tt('swing.completeSell', '完整卖出')} closeLabel={tt('swing.closeSell', '关闭完整卖出')} onClose={() => !submitting && setModal(null)} actions={[
          { key: 'cancel', label: tt('trades.cancel', '取消'), onClick: () => setModal(null), disabled: submitting },
          { key: 'confirm', label: submitting ? tt('swing.processing', '处理中...') : tt('swing.sellShares', '卖出 {{shares}} 股', { shares: formatShares(selection.wave.shares) }), onClick: completeWave, disabled: !sellReady || submitting },
        ]}>
          <ModalFormScroller>
            <div className="space-y-3">
              <ModalStockHeader group={selection.group} wave={selection.wave} sideLabel={tt('swing.endWave', '结束波段')} logoCache={logoCache} cacheStockLogo={cacheStockLogo} />
              <div className="rounded-[11px] border border-[#ff5b50]/15 bg-[#ff5b50]/[0.045] px-3 py-2.5 text-[10.5px] leading-4 text-white/[0.42]">
                {tt('swing.fullSellOnly', '波段需一次性卖出，不支持部分卖出。')}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
                <FormField label={tt('swing.sellPriceUsd', '卖出价格（USD）')} prefix="$" value={draft.sellPrice || ''} onChange={(event) => setDraft((current) => ({ ...current, sellPrice: event.target.value }))} inputMode="decimal" placeholder="0.00" />
                <FormField label={tt('swing.sellQuantity', '卖出数量')}>
                  <span className="text-[12.5px] text-white/[0.48] tabular-nums" style={{ fontFamily: NUMBER_FONT }}>{tt('swing.sharesValue', '{{shares}} 股', { shares: formatShares(selection.wave.shares) })}</span>
                </FormField>
              </div>
              <FormField label={tt('swing.endDate', '结束日期')} type="date" min={selection.wave.buyDate} value={draft.endDate || ''} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
              {draft.endDate && draft.endDate < selection.wave.buyDate ? <div className="text-[10px]" style={{ color: PROFIT }}>{tt('swing.endBeforeStart', '结束日期不能早于开始日期')}</div> : null}
              <div className="flex items-center gap-2 text-[10px] text-white/[0.28]">
                <CalendarDays className="h-3.5 w-3.5" />
                {tt('swing.noFees', '第一版不计算佣金和手续费')}
              </div>
            </div>
          </ModalFormScroller>
        </ActionModalCard>
      ) : null}
    </main>
  );
}
