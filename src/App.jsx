import React, { lazy, Suspense, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { TrendingDown, TrendingUp, Target, AlertCircle, CheckCircle2, Clock, Trash2, Plus, RefreshCw, Wifi, WifiOff, Home, ListChecks, BarChart3, Settings, LogOut, Loader2, Wallet, Calendar, X, Edit2, ChevronRight, AlertTriangle, Pin, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from './lib/supabase';
import * as db from './lib/db';
import { deriveInvestmentSummary } from './lib/investmentSummary.js';
import { deriveTqqqTradePreview, isTqqqFormalTradeEntry } from './lib/tqqqTradeDiscipline.js';
import { normalizeMarginDebtUsd } from './lib/homeMarginRisk.js';
import { MARKET_COLOR_MODE_STORAGE_KEY, normalizeMarketColorMode } from './lib/marketColorMode.js';
import { buildLedgerQuoteUniverse } from './lib/stockUniverse.js';
import { applyBtcTickToMarketCard, resolveBtcSnapshotRealtimeStatus } from './lib/btcRealtime.js';
import { applyIndexTickToMarketCards, mergeIndexRestCardsIntoMarketCards, shouldAppendIndexIntraday } from './lib/indexRealtime.js';
import { applyStockTickToQuoteRows, buildStockRealtimeSymbolsKey, canStartStockRealtime, getUsEquityRealtimeSession, isFreshStockRealtimeTick, mergeFreshStockRealtimeRows, mergeStockSnapshotPollRequest, mergeStockTicksIntoQuoteRows, selectStockRealtimeSymbols, shouldApplyStockSnapshotTick, shouldPollStockRealtimeSnapshot } from './lib/stockRealtime.js';
import { normalizeStrictUserStockSymbol, normalizeUserStockSymbol } from './lib/symbols.js';
import { resolveStockDisplayName } from './lib/stockDisplayName.js';
import { getStoredLanguage, isEnglishLanguage, saveStoredLanguage, t } from './lib/i18n.js';
import { isEarningsPublished } from './lib/earningsCalendarModel.js';
import { localMonthKey } from './lib/calendarMonth.js';
import { buildQuoteSymbolBatches } from './lib/quoteRequestBatches.js';
import { buildQuoteBaselineRows, buildQuoteBaselineUniverseKey, getQuoteBaselineRefreshDelay, getQuoteBaselineSession, getQuoteCloseSettlementKey, isQuoteBaselineUniverseExpansion, mergeQuoteBaselineRows, shouldQueueQuoteBaselineExpansion, shouldRunQuoteBaselineRefresh } from './lib/quoteRefreshPolicy.js';
import { formatWaveCurrencyAmount, formatWaveUsdPrice } from './lib/waveCurrencyDisplay.js';
import { userScopedStorageKey } from './lib/userScopedStorage.js';
import { clearStockQuoteBootstrapCache, readStockQuoteBootstrapCache, writeStockQuoteBootstrapCache } from './lib/stockQuoteBootstrapCache.js';
import { createRealtimeStartupTrace } from './lib/realtimeStartupTrace.js';
import { resolveBottomTabTap, resolveNavigationScrollTarget } from './lib/bottomTabNavigation.js';
import { communityCompetitionApi } from './lib/communityCompetitionApi.js';
import {
  invalidateCommunityCompetitionRequests,
  recordCommunityCompetitionObservedPublication,
} from './lib/communityCompetitionCache.js';
import { COMMUNITY_COMPETITION_PUBLICATION_EVENT } from './lib/communityCompetitionResume.js';
import { enqueuePnlReportRecalculationAfterLedgerMutation } from './lib/pnlReportRecalculation.js';
import { createPnlShareIdentity } from './lib/pnlShareIdentity.js';
import ActionModalCard from './components/ActionModalCard.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import { normalizeConfirmModalOptions } from './lib/confirmModal.js';
const HomeTab = lazy(() => import('./tabs/HomeTab.jsx'));
const TradesTab = lazy(() => import('./tabs/TradesTab.jsx'));
const AnalysisTab = lazy(() => import('./tabs/AnalysisTab.jsx'));
const ReviewTab = lazy(() => import('./tabs/ReviewTab.jsx'));
const SettingsTab = lazy(() => import('./tabs/SettingsTab.jsx'));
const PnlReportPage = lazy(() => import('./pages/PnlReportPage.jsx'));
const PnlSharePage = lazy(() => import('./pages/PnlSharePage.jsx'));
const HomeMarginRiskPage = lazy(() => import('./pages/HomeMarginRiskPage.jsx'));
const StockDetailPage = lazy(() => import('./pages/StockDetailPage.jsx'));
const WatchlistStockDetailPage = lazy(() => import('./pages/WatchlistStockDetailPage.jsx'));
const WaveTrackerPage = lazy(() => import('./pages/WaveTrackerPage.jsx'));
const CommunityCompetitionPage = lazy(() => import('./pages/CommunityCompetitionPage.jsx'));
const EarningsCalendarPage = lazy(() => import('./pages/EarningsCalendarPage.jsx'));
const EarningsDetailPage = lazy(() => import('./pages/EarningsDetailPage.jsx'));
const FX_RATES_STORAGE_KEY = 'xmoney_fx_rates_v1';
const STOCK_LOGO_CACHE_STORAGE_KEY = 'xmoney_stock_logo_cache_v1';
const DEFAULT_USD_CNY_RATE = 7.20;
const DEFAULT_HKD_CNY_RATE = 0.87;
const BTC_REALTIME_PROTOCOL = 'xmoney-btc';
const INDICES_REALTIME_PROTOCOL = 'xmoney-indices';
const STOCKS_REALTIME_PROTOCOL = 'xmoney-stocks';
const REALTIME_TOKEN_PROTOCOL_PREFIX = 'supabase.';
const REALTIME_STALE_MS = 15_000;
const REALTIME_RESUME_RECONNECT_STALE_MS = 5000;
const REALTIME_RESUME_RECONNECT_THROTTLE_MS = 3000;
const REALTIME_FORCE_RECONNECT_THROTTLE_MS = 1000;
const BTC_RESUME_RECONNECT_GRACE_MS = REALTIME_STALE_MS;
const STOCK_REALTIME_FIRST_TICK_TIMEOUT_MS = 8000;
const IOS_PWA_STOCK_REALTIME_FIRST_TICK_TIMEOUT_MS = 4000;
const STOCK_REALTIME_NO_TICK_RECONNECT_MS = 30_000;
const REALTIME_RECONNECT_MAX_MS = 30_000;
const PULL_REFRESH_THRESHOLD = 72;
const PULL_REFRESH_MAX_DISTANCE = 96;
const PULL_REFRESH_ACTIVATION_DISTANCE = 34;
const PULL_REFRESH_ROOT_TOP_TOLERANCE = 1;
const APP_SHELL_REFRESH_PARAM = '__xmoney_refresh';
const QUOTE_DIAGNOSTIC_LOG_STORAGE_KEY = 'xmoney_quote_diagnostic_log_v1';
const QUOTE_DIAGNOSTIC_LOG_LIMIT = 30;
const AUTO_NETWORK_DIAGNOSTIC_TRIGGERS = new Set([
  'auto-start',
  'auto-start-cloud',
  'auto-interval',
  'auto-visible',
  'auto-focus',
  'auto-pageshow',
  'auto-tab',
  'auto-realtime-open',
  'auto-ios-resume',
  'auto-ios-resume-cloud',
  'auto-ios-touch-resume',
  'auto-ios-online',
  'auto-ios-visible-heartbeat',
]);
const QUICK_QUOTE_REFRESH_MIN_INTERVAL_MS = 2500;
const IOS_PWA_FOREGROUND_HEARTBEAT_MS = 2000;
const IOS_PWA_RESUME_REFRESH_THROTTLE_MS = 1200;
const IOS_PWA_VISIBLE_RETRY_MS = 120;
const IOS_PWA_VISIBLE_RETRY_MAX_MS = 6000;
const IOS_PWA_TOUCH_RESUME_THROTTLE_MS = 3000;
const IOS_PWA_APP_SHELL_CHECK_MIN_INTERVAL_MS = 30_000;
const IOS_PWA_REALTIME_SNAPSHOT_ACTIVE_INTERVAL_MS = 1250;
const IOS_PWA_REALTIME_SNAPSHOT_IDLE_INTERVAL_MS = 2500;
const IOS_PWA_REALTIME_SNAPSHOT_BURST_DELAYS_MS = [0, 800, 1600, 3000, 5000];
const PORTFOLIO_CURRENCY_STORAGE_KEY = 'xmoney_portfolio_currency';
const HOME_CURRENCY_STORAGE_KEY = 'xmoney_home_currency';

function readRootScrollTop() {
  if (typeof window === 'undefined') return 0;
  const scrollTop = Number(
    window.scrollY
    || window.pageYOffset
    || document.documentElement?.scrollTop
    || document.body?.scrollTop
    || 0,
  );
  return Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
}
const TRADE_CURRENCY_STORAGE_KEY = 'xmoney_trade_currency';

const TAB_COMPONENTS = {
  home: HomeTab,
  trades: TradesTab,
  analysis: AnalysisTab,
  review: ReviewTab,
  settings: SettingsTab,
};
const QUOTE_ERROR_VISIBLE_TABS = ['home', 'trades'];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getUsMarketSession(date = new Date()) {
  const etStr = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const day = et.getDay();
  const time = et.getHours() + et.getMinutes() / 60;

  if (day === 0 || day === 6) return 'closed';
  if (time >= 9.5 && time < 16) return 'regular';
  if (time >= 4 && time < 9.5) return 'premarket';
  if (time >= 16 && time < 20) return 'postmarket';
  return 'closed';
}

function getIosPwaRealtimeSnapshotInterval(date = new Date()) {
  const session = getUsMarketSession(date);
  return session === 'regular' || session === 'premarket' || session === 'postmarket'
    ? IOS_PWA_REALTIME_SNAPSHOT_ACTIVE_INTERVAL_MS
    : IOS_PWA_REALTIME_SNAPSHOT_IDLE_INTERVAL_MS;
}

function getIndexChartOptions(date = new Date()) {
  const session = getUsMarketSession(date);
  return {
    session,
    appendIntraday: shouldAppendIndexIntraday(session),
  };
}

function validRate(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizePortfolioCurrency(value) {
  return value === 'CNY' ? 'CNY' : 'USD';
}

function isIosStandaloneWebApp() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const platform = navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(userAgent)
    || (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  const standalone = window.navigator?.standalone === true
    || window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  return Boolean(isIos && standalone);
}

function readStoredPortfolioCurrency() {
  try {
    const shared = localStorage.getItem(PORTFOLIO_CURRENCY_STORAGE_KEY);
    if (shared === 'USD' || shared === 'CNY') return shared;
    const home = localStorage.getItem(HOME_CURRENCY_STORAGE_KEY);
    if (home === 'USD' || home === 'CNY') return home;
    const trade = localStorage.getItem(TRADE_CURRENCY_STORAGE_KEY);
    if (trade === 'USD' || trade === 'CNY') return trade;
  } catch {}
  return 'USD';
}

function readCachedFxRates() {
  try {
    const raw = localStorage.getItem(FX_RATES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const usdCny = validRate(parsed?.rates?.CNY);
    const hkdCny = validRate(parsed?.rates?.HKD);
    if (!usdCny && !hkdCny) return null;
    return {
      dateKey: parsed.dateKey || '',
      fetchedAt: parsed.fetchedAt || '',
      source: parsed.source || 'cache',
      rates: {
        CNY: usdCny,
        HKD: hkdCny,
      },
    };
  } catch {
    return null;
  }
}

function normalizeSymbolKey(symbol) {
  return normalizeUserStockSymbol(symbol);
}

function normalizeStrictSymbolKey(symbol) {
  return normalizeStrictUserStockSymbol(symbol);
}

function normalizeCostBasisSymbol(symbol) {
  const value = normalizeSymbolKey(symbol);
  return /^[A-Z0-9.^-]{1,16}$/.test(value) ? value : '';
}

function sanitizeCostBasisData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [rawSymbol, trades]) => {
    const symbol = normalizeCostBasisSymbol(rawSymbol);
    if (!symbol) return acc;
    const validTrades = Array.isArray(trades) ? trades.filter(Boolean) : [];
    acc[symbol] = [...(acc[symbol] || []), ...validTrades];
    return acc;
  }, {});
}

function normalizeAppShellAssetUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl || window.location.href);
    if (url.origin !== window.location.origin) return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}

function extractAppShellAssetsFromHtml(html, baseUrl) {
  const assets = new Set();
  if (!html) return assets;
  const attrPattern = /(?:src|href)=["']([^"']*\/assets\/[^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g;
  let match = attrPattern.exec(html);
  while (match) {
    const asset = normalizeAppShellAssetUrl(match[1], baseUrl);
    if (asset) assets.add(asset);
    match = attrPattern.exec(html);
  }
  return assets;
}

function getCurrentAppShellAssets() {
  const assets = new Set();
  if (typeof document === 'undefined') return assets;
  document.querySelectorAll('script[src*="/assets/"], link[href*="/assets/"]').forEach((node) => {
    const asset = normalizeAppShellAssetUrl(node.getAttribute('src') || node.getAttribute('href'));
    if (asset) assets.add(asset);
  });
  return assets;
}

async function clearAppShellCaches() {
  if (typeof window === 'undefined') return;
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister().catch(() => false)));
    }
  } catch (e) {
    console.warn('[App Shell] Service Worker 清理失败:', e);
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => /^bottomline-|^xmoney-|vite/i.test(key))
          .map(key => caches.delete(key).catch(() => false))
      );
    }
  } catch (e) {
    console.warn('[App Shell] Cache Storage 清理失败:', e);
  }
}

async function checkForAppShellUpdate() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const currentAssets = getCurrentAppShellAssets();
  if (currentAssets.size === 0) return false;

  const htmlUrl = new URL(window.location.href);
  htmlUrl.searchParams.set(`${APP_SHELL_REFRESH_PARAM}_check`, String(Date.now()));

  try {
    const response = await fetch(htmlUrl.toString(), {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) return false;

    const html = await response.text();
    const latestAssets = extractAppShellAssetsFromHtml(html, htmlUrl.toString());
    if (latestAssets.size === 0) return false;

    const changed = [...latestAssets].some(asset => !currentAssets.has(asset));
    if (!changed) return false;

    await clearAppShellCaches();
    return true;
  } catch (e) {
    console.warn('[App Shell] 更新检查失败:', e);
    return false;
  }
}

function reloadAppShellWithFreshHtml() {
  if (typeof window === 'undefined') return;
  const reloadUrl = new URL(window.location.href);
  reloadUrl.searchParams.set(APP_SHELL_REFRESH_PARAM, String(Date.now()));
  reloadUrl.searchParams.delete(`${APP_SHELL_REFRESH_PARAM}_check`);
  window.location.replace(reloadUrl.toString());
}

function normalizeExternalLogoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return `https://eodhd.com${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

function normalizeWatchlistOrder(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((item) => {
    const symbol = normalizeSymbolKey(item);
    if (!symbol || seen.has(symbol)) return [];
    seen.add(symbol);
    return [symbol];
  });
}

function orderWatchlistRows(list, order) {
  const rows = Array.isArray(list) ? list : [];
  const normalizedOrder = normalizeWatchlistOrder(order);
  if (normalizedOrder.length === 0) return rows;
  const bySymbol = new Map(rows.map((item) => [normalizeSymbolKey(item?.symbol), item]));
  const ordered = normalizedOrder.map((symbol) => bySymbol.get(symbol)).filter(Boolean);
  const orderedSymbols = new Set(ordered.map((item) => normalizeSymbolKey(item?.symbol)));
  const rest = rows.filter((item) => !orderedSymbols.has(normalizeSymbolKey(item?.symbol)));
  return [...ordered, ...rest];
}

function formatRealtimeFetchError(error) {
  const rawMessage = String(error?.message || error || '').trim();
  if (/load failed|failed to fetch|networkerror|network request failed|fetch failed/i.test(rawMessage)) {
    return '行情网络请求失败,已保留现有数据';
  }
  return rawMessage || '行情拉取失败';
}

function readQuoteDiagnosticLogs(userId) {
  if (typeof localStorage === 'undefined') return [];
  try {
    const storageKey = userScopedStorageKey(QUOTE_DIAGNOSTIC_LOG_STORAGE_KEY, userId);
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, QUOTE_DIAGNOSTIC_LOG_LIMIT) : [];
  } catch {
    return [];
  }
}

function persistQuoteDiagnosticLogs(logs, userId) {
  if (typeof localStorage === 'undefined') return;
  try {
    const storageKey = userScopedStorageKey(QUOTE_DIAGNOSTIC_LOG_STORAGE_KEY, userId);
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(logs.slice(0, QUOTE_DIAGNOSTIC_LOG_LIMIT)));
  } catch {
    // ignore storage failures, diagnostics should never block quotes
  }
}

function inferQuoteProvider(message = '') {
  const text = String(message || '').toLowerCase();
  if (/supabase|auth|未授权|登录/.test(text)) return 'Supabase Auth';
  if (/cnn|fear|fgi/.test(text)) return 'CNN FGI';
  if (/calendar|日历/.test(text)) return 'EODHD Calendar';
  if (/yahoo/.test(text)) return 'Yahoo Finance';
  if (/eodhd|vix|api key|real-time|us-quote|eod/.test(text)) return 'EODHD';
  if (/vercel|function|timeout/.test(text)) return 'Vercel Function';
  if (/load failed|failed to fetch|networkerror|network request failed|fetch failed/.test(text)) return 'Browser Network';
  return 'Quote API';
}

function inferQuoteRoot(message = '', status = 0) {
  const text = String(message || '').toLowerCase();
  if (/load failed|failed to fetch|networkerror|network request failed|fetch failed/.test(text)) return 'browser-network';
  if (status === 401 || status === 403 || /未授权|登录|auth|supabase/.test(text)) return 'auth';
  if (status === 400 || /symbols|参数|代码不合法/.test(text)) return 'request-params';
  if (status === 429 || /rate|limit|quota|too many/.test(text)) return 'rate-limit';
  if (status >= 500 || /timeout|function|vercel/.test(text)) return 'quote-api';
  if (/api key|eodhd_api_key/.test(text)) return 'server-config';
  return 'quote-api';
}

function collectQuoteProviderErrors(data) {
  const errors = [];
  const visit = (item, parentSymbol = '') => {
    if (!item || typeof item !== 'object') return;
    const symbol = String(item.symbol || item.ticker || item.displaySymbol || parentSymbol || 'UNKNOWN');
    if (item.error) {
      const message = String(item.error).slice(0, 180);
      errors.push({
        symbol,
        provider: inferQuoteProvider(message),
        message,
      });
    }
    if (Array.isArray(item.data)) item.data.forEach(child => visit(child, symbol));
  };
  if (Array.isArray(data)) data.forEach(item => visit(item));
  return errors.slice(0, 12);
}

function compactQuoteSymbolsForLog(symbols = []) {
  const list = Array.isArray(symbols)
    ? symbols.map(symbol => String(symbol || '').trim()).filter(Boolean)
    : String(symbols || '').split(',').map(symbol => symbol.trim()).filter(Boolean);
  const preview = list.slice(0, 12);
  return {
    count: list.length,
    preview,
    text: `${preview.join(',')}${list.length > preview.length ? ` +${list.length - preview.length}` : ''}`,
  };
}

function buildQuoteDiagnosticEntry({
  trigger = 'auto',
  notifyOnError = false,
  symbols = [],
  rowsCount = 0,
  status = 0,
  result = null,
  error = null,
  durationMs = 0,
}) {
  const providerErrors = collectQuoteProviderErrors(result?.data);
  const rawMessage = String(error?.message || result?.error || providerErrors[0]?.message || '').trim();
  const userMessage = error ? formatRealtimeFetchError(error) : (rawMessage || '第三方行情部分失败');
  const symbolsInfo = compactQuoteSymbolsForLog(symbols);
  const root = providerErrors.length > 0 && !error && !result?.error
    ? 'provider-partial'
    : inferQuoteRoot(rawMessage || userMessage, status);
  const provider = providerErrors[0]?.provider || inferQuoteProvider(rawMessage || userMessage);

  return {
    id: `quote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    lastAt: new Date().toISOString(),
    count: 1,
    endpoint: '/api/quote',
    trigger,
    mode: notifyOnError ? 'manual-visible' : 'auto-silent',
    root,
    provider,
    status: status || null,
    message: userMessage,
    symbols: symbolsInfo.text,
    symbolCount: symbolsInfo.count,
    rowsCount,
    durationMs,
    providerErrors,
    fingerprint: [
      trigger,
      root,
      provider,
      status || '',
      userMessage,
      providerErrors.map(item => `${item.symbol}:${item.provider}:${item.message}`).join('|'),
    ].join('::'),
  };
}

function shouldRecordQuoteDiagnosticEntry(entry) {
  if (!entry) return false;
  if (
    entry.mode === 'auto-silent'
    && entry.root === 'browser-network'
    && AUTO_NETWORK_DIAGNOSTIC_TRIGGERS.has(entry.trigger)
  ) {
    return false;
  }
  return true;
}

function readCachedStockLogos() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STOCK_LOGO_CACHE_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      const symbol = normalizeSymbolKey(key);
      const url = normalizeExternalLogoUrl(value?.url || value);
      return symbol && url ? [[symbol, { url, updatedAt: value?.updatedAt || '' }]] : [];
    }));
  } catch {
    return {};
  }
}

function TabFallback() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0c0e] p-5 mb-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] text-sm text-white/50">
      <div className="flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-[#f6b54b]" />
        加载中...
      </div>
    </div>
  );
}

// ============ 复盘 tab 专用 Modal 组件 ============

// 添加/编辑心得 Modal
function DisciplineModal({ initial, language = 'zh', onCancel, onSave, onDelete }) {
  const [level, setLevel] = useState(initial.level || '🟢');
  const [text, setText] = useState(initial.text || '');
  const [pinned, setPinned] = useState(initial.pinned || false);
  const [error, setError] = useState('');
  const isEdit = Boolean(initial?.isEdit || onDelete);
  const tt = (key, fallback, values) => t(language, key, fallback, values);

  const LEVELS = [
    { level: '🟢', label: tt('review.levelNormal', '一般'), dotColor: '#18d66b', ringColor: 'rgba(24, 214, 107, 0.12)', ringBorder: 'rgba(24, 214, 107, 0.14)' },
    { level: '🔺', label: tt('review.levelImportant', '重要'), dotColor: '#ff0f35', ringColor: 'rgba(255, 15, 53, 0.13)', ringBorder: 'rgba(255, 15, 53, 0.15)' },
    { level: '📣', label: tt('review.levelEmphasis', '强调'), dotColor: '#ffa42b', ringColor: 'rgba(255, 164, 43, 0.13)', ringBorder: 'rgba(255, 164, 43, 0.16)' },
    { level: '❗', label: tt('review.levelWarning', '警告'), dotColor: '#ef0018', ringColor: 'rgba(239, 0, 24, 0.13)', ringBorder: 'rgba(239, 0, 24, 0.16)' },
  ];

  const saveDiscipline = () => {
    if (!text.trim()) { setError(tt('review.contentRequired', '请输入内容')); return; }
    onSave({ level, text: text.trim(), pinned });
  };

  return (
    <ActionModalCard
      title={isEdit ? tt('review.editDiscipline', '编辑心得') : tt('review.addDiscipline', '添加心得')}
      closeLabel={tt('review.closeDisciplineEditor', '关闭心得编辑')}
      onClose={onCancel}
      widthClassName="w-[calc(100vw-32px)] max-w-sm"
      actionGridClassName={onDelete ? 'grid-cols-3' : 'grid-cols-2'}
      actions={[
        { key: 'cancel', label: tt('review.cancel', '取消'), onClick: onCancel },
        ...(onDelete ? [{ key: 'delete', label: tt('review.delete', '删除'), onClick: onDelete }] : []),
        { key: 'save', label: tt('review.save', '保存'), onClick: saveDiscipline },
      ]}
    >
      <div className="min-w-0">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-white/50">{tt('review.level', '等级')}</label>
            <div className="grid grid-cols-4 gap-1.5">
              {LEVELS.map(l => (
                <button
                  key={l.level}
                  onClick={() => setLevel(l.level)}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-xs font-normal active:scale-95 ${level === l.level ? 'border-white/[0.12] bg-white/[0.06] text-white/82' : 'border-white/10 bg-white/[0.045] text-white/55'}`}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full border"
                    style={{ backgroundColor: l.ringColor, borderColor: l.ringBorder }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.dotColor, boxShadow: `0 0 10px ${l.dotColor}66` }} />
                  </span>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">{tt('review.content', '内容')}</label>
              <textarea
                value={text}
                onChange={e => { setText(e.target.value); if (error) setError(''); }}
                placeholder={tt('review.disciplinePlaceholder', '写下你的投资心得...')}
                rows={4}
                className="block w-full min-w-0 max-w-full box-border resize-none rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f6b54b]/70"
                style={{ colorScheme: 'dark' }}
              />
              <div className="mt-0.5 text-[10px] text-white/35">{tt('review.disciplineHint', '超过 60 字会折叠, 点"展开"查看全文')}</div>
              {error && <div className="mt-1 text-[11px] text-rose-300">{error}</div>}
            </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={e => setPinned(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-white/70">{tt('review.pinImportant', '置顶 (重要心得永远显示在最上)')}</span>
          </label>
        </div>
      </div>
    </ActionModalCard>
  );
}

// 添加/编辑日志 Modal
function LogModal({ initial, language = 'zh', onCancel, onSave, onDelete }) {
  const [date, setDate] = useState(initial.date || new Date().toISOString().slice(0, 10));
  const [mood, setMood] = useState(initial.mood || '');
  const [text, setText] = useState(initial.text || '');
  const [error, setError] = useState('');
  const isEdit = !!onDelete;
  const tt = (key, fallback, values) => t(language, key, fallback, values);

  const MOODS = [
    tt('review.moodCautiousOptimism', '谨慎乐观'),
    tt('review.moodSatisfied', '满意'),
    tt('review.moodAnxious', '焦虑'),
    tt('review.moodGreedy', '贪婪'),
    tt('review.moodFearful', '恐惧'),
    tt('review.moodCalm', '冷静'),
  ];

  const saveLog = () => {
    if (!text.trim()) { setError(tt('review.contentRequired', '请输入内容')); return; }
    onSave({ date, mood: mood.trim(), text: text.trim() });
  };

  return (
    <ActionModalCard
      title={isEdit ? tt('review.editReview', '编辑复盘') : tt('review.addReview', '写复盘')}
      closeLabel={tt('review.closeReviewEditor', '关闭复盘编辑')}
      onClose={onCancel}
      widthClassName="w-[calc(100vw-32px)] max-w-sm"
      actionGridClassName={isEdit ? 'grid-cols-3' : 'grid-cols-2'}
      actions={[
        { key: 'cancel', label: tt('review.cancel', '取消'), onClick: onCancel },
        ...(isEdit ? [{ key: 'delete', label: tt('review.delete', '删除'), onClick: onDelete }] : []),
        { key: 'save', label: tt('review.save', '保存'), onClick: saveLog },
      ]}
    >
      <div className="min-w-0">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-white/50">{tt('review.date', '日期')}</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="block h-11 w-full min-w-0 max-w-full box-border appearance-none rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm text-white outline-none focus:border-[#f6b54b]/70"
              style={{ colorScheme: 'dark', WebkitAppearance: 'none' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">{tt('review.moodOptional', '当时心情 (可选)')}</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {MOODS.map(m => (
                <button
                  key={m}
                  onClick={() => setMood(m === mood ? '' : m)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-normal ${mood === m ? 'border-[#f6b54b]/45 bg-[#f6b54b]/10 text-[#f6b54b]' : 'border-white/10 bg-white/[0.045] text-white/55'}`}
                >{m}</button>
              ))}
            </div>
            <input
              type="text"
              value={mood}
              onChange={e => setMood(e.target.value)}
              placeholder={tt('review.customMoodPlaceholder', '或自己写')}
              className="block w-full min-w-0 max-w-full box-border rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f6b54b]/70"
              style={{ colorScheme: 'dark' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">{tt('review.reviewContent', '复盘内容')}</label>
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); if (error) setError(''); }}
              placeholder={tt('review.reviewPlaceholder', '今天做了什么操作? 对错? 下周计划? 市场感受?')}
              rows={6}
              className="block w-full min-w-0 max-w-full box-border resize-none rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f6b54b]/70"
              style={{ colorScheme: 'dark' }}
            />
            {error && <div className="mt-1 text-[11px] text-rose-300">{error}</div>}
          </div>
        </div>
      </div>
    </ActionModalCard>
  );
}

// 编辑年度实际数据 Modal
function YearlyActualModal({ year, initial, language = 'zh', onCancel, onSave, currency, rate }) {
  const isCNY = currency === 'CNY';
  const symbol = isCNY ? '¥' : '$';
  const tt = (key, fallback, values) => t(language, key, fallback, values);
  // 显示时: USD存储 × rate → 展示值
  // 保存时: 展示值 / rate → 存回 USD
  const [actualGain, setActualGain] = useState(initial.actualGain !== null && initial.actualGain !== undefined ? String(Math.round(initial.actualGain * rate)) : '');
  const [endBalance, setEndBalance] = useState(initial.endBalance !== null && initial.endBalance !== undefined ? String(Math.round(initial.endBalance * rate)) : '');

  const saveYearlyActual = () => {
    const divisor = isCNY ? rate : 1;
    const ag = actualGain === '' ? null : parseFloat(actualGain) / divisor;
    const eb = endBalance === '' ? null : parseFloat(endBalance) / divisor;
    onSave(ag, eb);
  };

  return (
    <ActionModalCard
      title={tt('review.actualDataTitle', '{{year}} 年实际数据', { year })}
      closeLabel={tt('review.closeActualData', '关闭年度实际编辑')}
      onClose={onCancel}
      widthClassName="w-[calc(100vw-32px)] max-w-sm"
      actions={[
        { key: 'cancel', label: tt('review.cancel', '取消'), onClick: onCancel },
        { key: 'save', label: tt('review.save', '保存'), onClick: saveYearlyActual },
      ]}
    >
      <div className="min-w-0">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-white/50">{tt('review.actualGrowth', '实际增长 ({{symbol}})', { symbol })}</label>
            <input
              type="number"
              value={actualGain}
              onChange={e => setActualGain(e.target.value)}
              placeholder={isCNY ? tt('review.actualGrowthPlaceholderCny', '例: 1440000 (144万¥)') : tt('review.actualGrowthPlaceholderUsd', '例: 200000 (20万$)')}
              className="block w-full min-w-0 max-w-full box-border rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none tabular-nums placeholder:text-white/25 focus:border-[#f6b54b]/70"
              style={{ colorScheme: 'dark' }}
            />
            <div className="mt-0.5 text-[10px] text-white/35">{tt('review.actualGrowthHint', '这一年涨了多少 (留空则按年末余额倒算)')}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">{tt('review.yearEndBalance', '年末余额 ({{symbol}})', { symbol })}</label>
            <input
              type="number"
              value={endBalance}
              onChange={e => setEndBalance(e.target.value)}
              placeholder={isCNY ? tt('review.yearEndPlaceholderCny', '例: 19440000 (1944万¥)') : tt('review.yearEndPlaceholderUsd', '例: 2600000 (260万$)')}
              className="block w-full min-w-0 max-w-full box-border rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none tabular-nums placeholder:text-white/25 focus:border-[#f6b54b]/70"
              style={{ colorScheme: 'dark' }}
            />
            <div className="mt-0.5 text-[10px] text-white/35">{tt('review.yearEndHint', '这一年结束总共多少 (留空则按上年余额+本年增长自动算)')}</div>
          </div>
          <div className="rounded-xl border border-[#f6b54b]/15 bg-[#f6b54b]/10 px-3 py-2 text-[11px] text-[#ffd18a]">
            {tt('review.currentCurrency', '当前币种: {{currency}}', { currency: '' })}<span className="font-semibold">{currency}</span>{isCNY ? tt('review.currencySaveNote', ' · 汇率 1 USD = {{rate}} CNY · 保存时自动换算为 USD 存储', { rate }) : ''}
          </div>
        </div>
      </div>
    </ActionModalCard>
  );
}



// ============ 美股中英对照表 ============
// 主流热门股票 + 美股 ETF + 中概股(共 220+)
const STOCK_NAME_CN = {
  // 科技七姐妹
  AAPL: '苹果', MSFT: '微软', GOOGL: '谷歌A', GOOG: '谷歌C', AMZN: '亚马逊',
  META: 'Meta', NVDA: '英伟达', TSLA: '特斯拉',
  // 半导体
  TSM: '台积电', AMD: '超威半导体', AVGO: '博通', QCOM: '高通', INTC: '英特尔',
  ARM: 'Arm', MU: '美光', AMAT: '应用材料', LRCX: '泛林半导体', KLAC: '科磊',
  ASML: '阿斯麦', TXN: '德州仪器', MRVL: '迈威尔', ADI: '亚德诺', NXPI: '恩智浦',
  ON: '安森美', MPWR: '芯源系统', SMCI: '超微电脑',
  // 软件 / 云 / SaaS
  ORCL: '甲骨文', CRM: 'Salesforce', ADBE: 'Adobe', NOW: 'ServiceNow', INTU: 'Intuit',
  WDAY: 'Workday', SNOW: 'Snowflake', PLTR: 'Palantir', NET: 'Cloudflare',
  CRWD: 'CrowdStrike', PANW: 'Palo Alto Networks', FTNT: 'Fortinet', ZS: 'Zscaler',
  DDOG: 'Datadog', MDB: 'MongoDB', TEAM: 'Atlassian', DBX: 'Dropbox',
  SHOP: 'Shopify', SQ: 'Block', PYPL: 'PayPal',
  // 中概股
  BABA: '阿里巴巴', JD: '京东', PDD: '拼多多', BIDU: '百度', NTES: '网易',
  TCOM: '携程', BILI: '哔哩哔哩', NIO: '蔚来', XPEV: '小鹏汽车', LI: '理想汽车',
  TME: '腾讯音乐', DIDI: '滴滴', BEKE: '贝壳', YMM: '满帮', FUTU: '富途',
  TIGR: '老虎证券', IQ: '爱奇艺', VIPS: '唯品会', WB: '微博', LU: '陆金所',
  ZH: '知乎', DUOL: '多邻国', RLX: '雾芯科技', EDU: '新东方', TAL: '好未来',
  // 互联网 / 传媒
  NFLX: '奈飞', DIS: '迪士尼', SPOT: 'Spotify', RBLX: 'Roblox', U: 'Unity',
  TTWO: 'Take-Two', EA: '艺电', SNAP: 'Snap', PINS: 'Pinterest',
  MTCH: 'Match', ABNB: '爱彼迎', UBER: '优步', LYFT: 'Lyft', DASH: 'DoorDash',
  // 金融
  JPM: '摩根大通', BAC: '美国银行', WFC: '富国银行', C: '花旗', GS: '高盛',
  MS: '摩根士丹利', SCHW: '嘉信理财', BLK: '贝莱德', BX: '黑石', KKR: 'KKR',
  V: 'Visa', MA: '万事达', AXP: '美国运通', COF: '第一资本',
  BRK_B: '伯克希尔B',
  // 保险
  BRK: '伯克希尔A', AIG: '美国国际', MET: '大都会', PRU: '保德信', PGR: '前进保险',
  CB: '安达保险', TRV: '旅行者', ALL: '好事达',
  // 消费品
  KO: '可口可乐', PEP: '百事', MCD: '麦当劳', SBUX: '星巴克', NKE: '耐克',
  LULU: '露露柠檬', WMT: '沃尔玛', COST: '好市多', TGT: '塔吉特', HD: '家得宝',
  LOW: '劳氏', PG: '宝洁', UL: '联合利华', CL: '高露洁', KMB: '金佰利',
  PM: '菲利普莫里斯', MO: '奥驰亚', BUD: '百威英博', DEO: '帝亚吉欧',
  EL: '雅诗兰黛', CHWY: 'Chewy', ETSY: 'Etsy', EBAY: 'eBay',
  // 医药 / 生物
  LLY: '礼来', JNJ: '强生', UNH: '联合健康', PFE: '辉瑞', MRK: '默沙东',
  ABBV: '艾伯维', BMY: '百时美施贵宝', AZN: '阿斯利康', NVS: '诺华', GSK: '葛兰素史克',
  AMGN: '安进', GILD: '吉利德', BIIB: '渤健', REGN: '再生元', VRTX: '福泰制药',
  MRNA: 'Moderna', BNTX: 'BioNTech', NVAX: 'Novavax',
  ISRG: '直觉外科', DXCM: 'Dexcom', ZBH: '捷迈邦美',
  CVS: 'CVS健康', WBA: '沃博联',
  // 工业 / 材料
  GE: '通用电气', BA: '波音', LMT: '洛克希德马丁', RTX: '雷神技术', NOC: '诺斯罗普',
  CAT: '卡特彼勒', DE: '迪尔', HON: '霍尼韦尔', MMM: '3M',
  UPS: '联合包裹', FDX: '联邦快递', LIN: '林德', SHW: '宣伟',
  // 能源
  XOM: '埃克森美孚', CVX: '雪佛龙', COP: '康菲', EOG: 'EOG能源', SLB: '斯伦贝谢',
  OXY: '西方石油', PSX: '菲利普斯66', MPC: '马拉松石油', VLO: '瓦莱罗',
  // 汽车
  F: '福特', GM: '通用汽车', TM: '丰田', RIVN: 'Rivian', LCID: 'Lucid',
  // 通信 / 电信
  T: 'AT&T', VZ: '威瑞森', TMUS: 'T-Mobile', CMCSA: '康卡斯特',
  // 房地产
  PLD: '安博', AMT: '美国电塔', CCI: '冠城国际', EQIX: 'Equinix', SPG: '西蒙地产',
  // ETF - 大盘指数
  SPY: '标普500', QQQ: 'QQQ', DIA: '道琼斯', IWM: '罗素2000',
  VTI: '全市场', VOO: '标普500(先锋)', VEA: '发达市场', VWO: '新兴市场',
  IVV: '标普500(贝莱德)', VUG: '成长股', VTV: '价值股',
  // ETF - 行业
  XLK: '科技', XLF: '金融', XLV: '医疗', XLE: '能源', XLI: '工业',
  XLY: '可选消费', XLP: '日用消费', XLU: '公用事业', XLRE: '房地产', XLB: '材料',
  SMH: '半导体', SOXX: '半导体', IBB: '生物科技', ARKK: 'ARK创新', ARKG: 'ARK基因',
  KWEB: '中概互联', FXI: '中国大盘', MCHI: '中国MSCI', YINN: '中国3X多',
  EWJ: '日本', EWZ: '巴西', INDA: '印度',
  // ETF - 杠杆
  TQQQ: 'TQQQ', SQQQ: '3倍做空纳指', QLD: '2倍纳指', PSQ: '反向纳指',
  SOXL: '3倍半导体', SOXS: '3倍做空半导体',
  UPRO: '3倍标普', SPXU: '3倍做空标普', SDS: '2倍做空标普',
  UDOW: '3倍道指', SDOW: '3倍做空道指',
  TNA: '3倍小盘股', TZA: '3倍做空小盘',
  FAS: '3倍金融', FAZ: '3倍做空金融',
  TMF: '3倍长债', TMV: '3倍做空长债',
  LABU: '3倍生物科技', LABD: '3倍做空生物',
  NVDL: '2倍英伟达', TSLL: '2倍特斯拉', AAPU: '2倍苹果',
  // ETF - 债券 / 现金
  TLT: '20年长债', IEF: '7-10年债', SHY: '1-3年短债', SGOV: '0-3月国债',
  AGG: '综合债', BND: '综合债(先锋)', LQD: '投资级公司债', HYG: '高收益债',
  // ETF - 商品 / 黄金
  GLD: '黄金', SLV: '白银', USO: '原油', UNG: '天然气', DBC: '商品综合',
  GDX: '金矿股', GDXJ: '小金矿股',
  // ETF - VIX
  VIXY: 'VIX短期', UVXY: '1.5倍VIX', VXX: 'VIX期货',
  // ETF - 波动率 / 加密
  BITO: '比特币期货', GBTC: '灰度比特币', IBIT: '贝莱德比特币', FBTC: '富达比特币',
  ETHE: '灰度以太坊',
  // 加密相关股
  COIN: 'Coinbase', MSTR: 'MicroStrategy', MARA: '马拉松数字', RIOT: 'Riot平台',
  // 航空 / 旅游
  AAL: '美国航空', DAL: '达美航空', UAL: '联合航空', LUV: '西南航空',
  CCL: '嘉年华邮轮', RCL: '皇家加勒比', NCLH: '挪威邮轮',
  MAR: '万豪', HLT: '希尔顿', BKNG: 'Booking', EXPE: 'Expedia',
};

const STOCK_NAME_EN = {
  AAPL: 'Apple',
  MSFT: 'Microsoft',
  GOOGL: 'Alphabet',
  GOOG: 'Alphabet',
  AMZN: 'Amazon',
  META: 'Meta',
  NVDA: 'NVIDIA',
  TSLA: 'Tesla',
  TSM: 'TSMC',
  AMD: 'AMD',
  AVGO: 'Broadcom',
  QCOM: 'Qualcomm',
  INTC: 'Intel',
  ARM: 'Arm',
  MU: 'Micron',
  ASML: 'ASML',
  MRVL: 'Marvell',
  ORCL: 'Oracle',
  CRM: 'Salesforce',
  ADBE: 'Adobe',
  PLTR: 'Palantir',
  NFLX: 'Netflix',
  DIS: 'Disney',
  UBER: 'Uber',
  ABNB: 'Airbnb',
  HOOD: 'Robinhood',
  JPM: 'JPMorgan Chase',
  BAC: 'Bank of America',
  WFC: 'Wells Fargo',
  GS: 'Goldman Sachs',
  MS: 'Morgan Stanley',
  SCHW: 'Charles Schwab',
  BLK: 'BlackRock',
  V: 'Visa',
  MA: 'Mastercard',
  KO: 'Coca-Cola',
  PEP: 'PepsiCo',
  MCD: "McDonald's",
  SBUX: 'Starbucks',
  NKE: 'Nike',
  WMT: 'Walmart',
  COST: 'Costco',
  HD: 'Home Depot',
  PG: 'Procter & Gamble',
  LLY: 'Eli Lilly',
  JNJ: 'Johnson & Johnson',
  UNH: 'UnitedHealth',
  PFE: 'Pfizer',
  MRK: 'Merck',
  ABBV: 'AbbVie',
  NVS: 'Novartis',
  GSK: 'GSK',
  AMGN: 'Amgen',
  GILD: 'Gilead',
  GE: 'GE Aerospace',
  BA: 'Boeing',
  LMT: 'Lockheed Martin',
  CAT: 'Caterpillar',
  DE: 'Deere',
  HON: 'Honeywell',
  XOM: 'Exxon Mobil',
  CVX: 'Chevron',
  F: 'Ford',
  GM: 'General Motors',
  TM: 'Toyota',
  T: 'AT&T',
  VZ: 'Verizon',
  TMUS: 'T-Mobile',
  BABA: 'Alibaba',
  JD: 'JD.com',
  PDD: 'PDD',
  BIDU: 'Baidu',
  NIO: 'NIO',
  XPEV: 'XPeng',
  LI: 'Li Auto',
  FUTU: 'Futu',
  TIGR: 'UP Fintech',
  QQQ: 'Invesco QQQ',
  TQQQ: 'ProShares UltraPro QQQ',
  SPY: 'SPDR S&P 500',
  DIA: 'SPDR Dow Jones',
  IWM: 'iShares Russell 2000',
  VTI: 'Vanguard Total Market',
  VOO: 'Vanguard S&P 500',
  IVV: 'iShares Core S&P 500',
  XLK: 'Technology SPDR',
  SMH: 'VanEck Semiconductor',
  SOXX: 'iShares Semiconductor',
  SOXL: 'Direxion Semiconductor 3X',
  SGOV: 'iShares 0-3 Month Treasury',
  TLT: 'iShares 20+ Year Treasury',
  GLD: 'SPDR Gold',
  SLV: 'iShares Silver',
  COIN: 'Coinbase',
  MSTR: 'MicroStrategy',
  MARA: 'MARA',
  RIOT: 'Riot Platforms',
  AAL: 'American Airlines',
  DAL: 'Delta Air Lines',
  UAL: 'United Airlines',
  LUV: 'Southwest Airlines',
  CCL: 'Carnival',
  RCL: 'Royal Caribbean',
  NCLH: 'Norwegian Cruise Line',
  IBKR: 'Interactive Brokers',
  NOK: 'Nokia',
};

function normalizeStockSymbolForName(symbol) {
  return normalizeSymbolKey(symbol);
}

function displayStockName(symbol, name, language = 'zh') {
  const normalizedSymbol = normalizeStockSymbolForName(symbol);
  return resolveStockDisplayName({
    symbol: normalizedSymbol,
    name,
    english: isEnglishLanguage(language),
    chineseName: STOCK_NAME_CN[normalizedSymbol],
    englishName: STOCK_NAME_EN[normalizedSymbol],
  });
}

function localizeStockNameRow(row) {
  if (!row?.symbol) return row;
  const symbol = normalizeStockSymbolForName(row.symbol);
  if (!symbol) return row;
  return {
    ...row,
    symbol,
    name: displayStockName(symbol, row.name),
  };
}

function buildToolQuoteRows({ trades = [], costBasisData = {}, swingWaves = [] } = {}) {
  const bySymbol = new Map();
  const addSymbol = (symbol, name = '', quoteRow = null) => {
    const normalizedSymbol = normalizeStockSymbolForName(symbol);
    if (!normalizedSymbol) return;
    const existing = bySymbol.get(normalizedSymbol) || {};
    const incoming = quoteRow && typeof quoteRow === 'object' ? quoteRow : {};
    const incomingPrice = Number(incoming.price);
    const incomingHigh = Number(incoming.high || incoming.week52High);
    bySymbol.set(normalizedSymbol, {
      ...existing,
      ...incoming,
      symbol: normalizedSymbol,
      name: displayStockName(normalizedSymbol, name || existing.name || normalizedSymbol),
      price: Number.isFinite(incomingPrice) && incomingPrice > 0 ? incomingPrice : (existing.price || 0),
      high: Number.isFinite(incomingHigh) && incomingHigh > 0 ? incomingHigh : (existing.high || 0),
    });
  };

  Object.keys(sanitizeCostBasisData(costBasisData)).forEach((symbol) => addSymbol(symbol));
  (trades || []).forEach((trade) => addSymbol(trade?.symbol || 'TQQQ', trade?.name));
  (swingWaves || []).forEach((wave) => addSymbol(wave?.symbol, wave?.name, wave));

  return Array.from(bySymbol.values());
}

function createRealtimeStartupMilestones(sessionStartedAt = 0, generation = 0) {
  return {
    sessionStartedAt,
    generation,
    socketConnectStarted: false,
    socketOpened: false,
    firstTick: false,
    pricesApplied: false,
    snapshotStarted: false,
    snapshotFirstTick: false,
    snapshotDone: false,
    startupComplete: false,
  };
}

// ============ 内部主 App 组件(要求已登录) ============
function MainApp({ accountManager, onAddAccount, user, onLogout }) {
  // ============ 核心状态 ============
  const [marketColorMode, setMarketColorMode] = useState(() => {
    try {
      return normalizeMarketColorMode(localStorage.getItem(MARKET_COLOR_MODE_STORAGE_KEY));
    } catch {
      return normalizeMarketColorMode();
    }
  });
  const [qqqHigh, setQqqHigh] = useState(640.47);
  const [qqqCurrent, setQqqCurrent] = useState(640.47);
  const [qqqSignalQuote, setQqqSignalQuote] = useState(null);

  // 关注股票列表(可编辑价格)
  // high = 6个月滚动最高价,用于计算回撤预警
  // 默认为空,新用户登录后看到引导界面 → 点"添加你的第一只股票"
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistOrder, setWatchlistOrder] = useState([]);
  const [stockQuoteBootstrapRows] = useState(() => readStockQuoteBootstrapCache({ userId: user.id }));
  const [quoteCache, setQuoteCache] = useState([]);
  const initialQuoteBootstrapCountRef = useRef(stockQuoteBootstrapRows.length);
  const quoteBootstrapPersistReadyRef = useRef(false);
  const quoteBootstrapLatestRowsRef = useRef(quoteCache);
  const quoteBootstrapPersistTimerRef = useRef(null);
  const stockRealtimeUniverseResolvedRef = useRef(false);
  const [realtimeStartupTrace] = useState(() => createRealtimeStartupTrace({ userId: user.id }));
  const realtimeStartupMilestonesRef = useRef(createRealtimeStartupMilestones());
  const startRealtimeStartupTraceSession = useCallback((trigger = 'startup') => {
    const now = Date.now();
    const previousStartedAt = realtimeStartupMilestonesRef.current.sessionStartedAt || 0;
    if (trigger !== 'startup' && previousStartedAt && now - previousStartedAt < 1000) {
      return false;
    }
    const generation = (realtimeStartupMilestonesRef.current.generation || 0) + 1;
    realtimeStartupMilestonesRef.current = createRealtimeStartupMilestones(now, generation);
    const standalone = isIosStandaloneWebApp();
    realtimeStartupTrace.startSession({
      runtime: standalone ? 'ios_standalone' : 'browser',
      standalone,
      trigger,
    });
    return true;
  }, [realtimeStartupTrace]);
  const [logoCache, setLogoCache] = useState(() => readCachedStockLogos());
  const [editingStock, setEditingStock] = useState(null);
  const [showAddStock, setShowAddStock] = useState(false);
  const [newStock, setNewStock] = useState({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' });

  // VIX 恐慌指数
  const [vix, setVix] = useState(16.5);
  const [vixDataDate, setVixDataDate] = useState(null); // FRED 返回的数据日期

  // CNN 恐慌贪婪指数(0-100)
  const [fgi, setFgi] = useState(50);
  const [fgiLabel, setFgiLabel] = useState('neutral');
  const [fgiPrev, setFgiPrev] = useState(null);
  const [fgiWeek, setFgiWeek] = useState(null);
  const [fgiMonth, setFgiMonth] = useState(null);
  const [fgiYear, setFgiYear] = useState(null);
  const [fgiDataDate, setFgiDataDate] = useState(null);

  // 三大指数和 BTC 分开维护,首页只在渲染层并排展示。
  const [marketIndices, setMarketIndices] = useState([]);
  const [btcMarketCard, setBtcMarketCard] = useState(null);

  // 顶部市场状态卡的基准股票(默认 QQQ,可切换关注列表里其他 1x 标的)
  const [benchmarkSymbol, setBenchmarkSymbol] = useState('QQQ');
  const [benchmarkMenuOpen, setBenchmarkMenuOpen] = useState(false);

  // 杠杆 ETF 黑名单(不允许作为基准,因为回撤不该 ×3 来判断)
  const LEVERAGED_ETFS = ['TQQQ', 'SQQQ', 'QLD', 'PSQ', 'SOXL', 'SOXS', 'UPRO', 'SPXU', 'UDOW', 'SDOW', 'TNA', 'TZA', 'FAS', 'FAZ', 'TMF', 'TMV', 'LABU', 'LABD'];
  
  // 预警通知开关 (持久化 localStorage)
  // v10.7.9.41: 用户折叠后记住, 下次打开还是折叠
  const [alertsMuted, setAlertsMuted] = useState(() => {
    try { return localStorage.getItem(userScopedStorageKey('bottomline_alerts_muted', user.id)) === 'true'; } catch { return false; }
  });
  // 上次看到的预警股票 + 等级 (用于检测"新预警")
  // 格式: { TQQQ: 3, SOXL: 7 }
  const [lastSeenAlerts, setLastSeenAlerts] = useState(() => {
    try {
      const raw = localStorage.getItem(userScopedStorageKey('bottomline_last_seen_alerts', user.id));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  // 三档配置(可调)
  const [batches, setBatches] = useState([
    { id: 1, name: '第1批', drawdown: -0.10, allocation: 0.25 },
    { id: 2, name: '第2批', drawdown: -0.15, allocation: 0.35 },
    { id: 3, name: '第3批', drawdown: -0.20, allocation: 0.40 },
  ]);

  // 波段记录旧账本:只给波段工具兼容使用,不再作为首页/交易主持仓来源。
  const [trades, setTrades] = useState([]);
  // 主交易账本:独立记录真实股票买入/卖出流水,由 stock_trades 表持久化。
  const [stockTrades, setStockTrades] = useState([]);
  // 收益报表服务端重算完成后递增，只作为页面重新读取数据库快照的信号。
  const [pnlReportRefreshVersion, setPnlReportRefreshVersion] = useState(0);
  // V2 波段页面只向全局行情层同步最小 symbol/name 集合;真实记录仍由独立页面按需读取。
  const [swingWaveQuoteRows, setSwingWaveQuoteRows] = useState([]);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [tradeEntryScope, setTradeEntryScope] = useState('ledger'); // ledger = 主交易账本, wave = 波段记录旧账本
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  const tradeSubmittingRef = useRef(false);
  const [newTrade, setNewTrade] = useState({
    symbol: 'TQQQ',
    name: '3倍纳指',
    side: 'buy',
    date: new Date().toISOString().split('T')[0],
    price: '',
    shares: '',
    batch: '第1批',  // 兼容老结构
  });
  // 添加交易时的"查询股票"状态
  const [lookupStatus, setLookupStatus] = useState(null);  // null | 'loading' | 'found' | 'notfound'

  // 波段备注 { 'wave-id': '关税恐慌' }
  const [waveNotes, setWaveNotes] = useState({});
  const [editingNoteId, setEditingNoteId] = useState(null);  // 正在编辑哪个波段的备注

  // ===== 家庭资产 =====
  const [accounts, setAccounts] = useState([]);          // [{id, owner, type, name, currency, icon}]
  const [snapshots, setSnapshots] = useState([]);        // [{id, accountId, month, balance}]
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_CNY_RATE); // 美元换人民币汇率
  const [hkdRate, setHkdRate] = useState(DEFAULT_HKD_CNY_RATE); // 港币换人民币汇率
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showFillSnapshot, setShowFillSnapshot] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [accountDeleteConfirmId, setAccountDeleteConfirmId] = useState(null);
  const [newAccount, setNewAccount] = useState({
    owner: '我',
    type: '',
    name: '',
    currency: 'CNY',
    icon: '',
    balance: '',
  });
  const [snapshotDraft, setSnapshotDraft] = useState({}); // { account_id: '12345' } 填快照时的暂存值
  const [snapshotTab, setSnapshotTab] = useState('我');    // 录入界面当前 Tab: '我' or '老婆'

  // 🔑 修改密码 (设置页)
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState(null);  // { type: 'error'|'success', text: '...' }
  const [pwdLoading, setPwdLoading] = useState(false);
  const [fillMonth, setFillMonth] = useState(() => localMonthKey()); // 填快照 Modal 里当前选择的本地月份
  const [showMonthsDetail, setShowMonthsDetail] = useState(false); // 12 个月资产走势 Modal
  const [chartSelectedMonthIdx, setChartSelectedMonthIdx] = useState(null); // v40 fix46: 12月走势点圆点

  // ===== 复盘 tab =====
  const [investmentPlan, setInvestmentPlan] = useState({
    startCapital: 0,
    targetAnnualRate: 0.20,
    startYear: new Date().getFullYear(),
    totalYears: 10,
    ageGoalAge: 0,
    motto: '',
    displayCurrency: 'USD',  // USD | CNY
  });
  const [marginStatus, setMarginStatus] = useState({ currentMargin: 0, marginLimit: 0 });
  const [marginStatusReady, setMarginStatusReady] = useState(false);
  const [availableCashStatus, setAvailableCashStatus] = useState({ availableCashUsd: 0, isSet: false, updatedAt: null, writeReady: false });
  const [availableCashStatusReady, setAvailableCashStatusReady] = useState(false);
  const [disciplines, setDisciplines] = useState([]);
  const [reviewLogs, setReviewLogs] = useState([]);
  const [yearlyActuals, setYearlyActuals] = useState([]); // [{year, actualGain, endBalance}]

  const [showPlanSettings, setShowPlanSettings] = useState(false);
  const [showEditMargin, setShowEditMargin] = useState(false);
  const [showAddDiscipline, setShowAddDiscipline] = useState(false);
  const [editingDisciplineId, setEditingDisciplineId] = useState(null);
  const [showAddLog, setShowAddLog] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  const [filterLevel, setFilterLevel] = useState('all'); // all / 🟢 / 🔺 / 📣 / ❗
  const [showAllDisciplines, setShowAllDisciplines] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [expandedDisciplines, setExpandedDisciplines] = useState({}); // { id: bool } 长戒律展开
  const [editYearlyActualId, setEditYearlyActualId] = useState(null); // 编辑哪个年份的实际数据
  const [showAllYears, setShowAllYears] = useState(false); // 年度表默认显示 3 个, 点击展开全部
  // 防重复提交: 记录最近一次提交的内容 + 时间戳 (10 秒内相同内容拒绝)
  const lastSubmitRef = useRef({}); // { [key]: { text: '', at: timestamp } }

  // 波段展开状态(点击波段可展开看明细) { 'wave-id': true }
  const [expandedWaves, setExpandedWaves] = useState({});

  // === FGI 仪表盘动画:从 0 缓动到目标值 ===
  const [displayFgi, setDisplayFgi] = useState(0);
  const fgiAnimRef = useRef({ from: 0, hasInit: false });
  useEffect(() => {
    const targetFgi = fgi;
    // 起点:首次永远从 0 开始;后续从当前显示值出发
    const startFgi = fgiAnimRef.current.hasInit ? displayFgi : 0;
    fgiAnimRef.current.hasInit = true;

    const duration = 1200;
    const startTime = performance.now();
    let rafId;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = startFgi + (targetFgi - startFgi) * eased;
      setDisplayFgi(current);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplayFgi(targetFgi);
      }
    };

    // 立即把 displayFgi 设回起点(避免第一帧闪现到旧值)
    setDisplayFgi(startFgi);
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fgi]);

  // 止盈配置
  const [exitTargets, setExitTargets] = useState([
    { id: 1, name: '止盈点1', gain: 0.50, sellRatio: 0.50 },
    { id: 2, name: '止盈点2', gain: 0.70, sellRatio: 0.30 },
  ]);

  // 拉取实时行情状态
  const [fetching, setFetching] = useState(false);
  const quoteFetchInFlightRef = useRef(false);
  const pendingQuoteRefreshRef = useRef(null);
  const quickQuoteRefreshRef = useRef({ timer: null, lastAt: 0, dueAt: 0, priority: 0 });
  const quoteBaselineRefreshRef = useRef({
    lastAttemptAt: 0,
    lastSuccessAt: 0,
    lastAttemptSession: '',
    lastCloseSettlementKey: '',
    lastAttemptUniverseKey: '',
    lastAttemptRowCount: 0,
  });
  const quoteRefreshFromCloudResultRef = useRef(null);
  const pendingPwaResumeRefreshRef = useRef(null);
  const realtimeResumeReconnectHandlersRef = useRef(new Set());
  const cloudLoadingRef = useRef(true);
  const foregroundHeartbeatAtRef = useRef(Date.now());
  const pwaHiddenAtRef = useRef(0);
  const pwaLastTouchResumeAtRef = useRef(0);
  const pwaLastResumeRefreshAtRef = useRef(0);
  const pwaResumeRetryTimerRef = useRef(null);
  const pwaResumeRetryDeadlineRef = useRef(0);
  const pwaAppShellCheckInFlightRef = useRef(false);
  const pwaLastAppShellCheckAtRef = useRef(0);
  const pwaAppShellReloadQueuedRef = useRef(false);
  const iosPwaRealtimeSnapshotBurstRef = useRef(() => false);
  const marketMoversCacheRef = useRef(null);
  const marketMoversRequestRef = useRef(null);

  const buildPwaResumeRequest = (trigger = 'auto-ios-resume', options = {}) => ({
    trigger: trigger || 'auto-ios-resume',
    resetFreshness: options?.resetFreshness !== false,
  });

  const readPwaResumeRequest = (request) => {
    if (!request) return null;
    if (typeof request === 'string') return buildPwaResumeRequest(request);
    if (typeof request === 'object') return buildPwaResumeRequest(request.trigger, {
      resetFreshness: request.resetFreshness !== false,
    });
    return null;
  };

  const fetchQuote = useCallback(async (symbols, options = {}) => {
    const requestOptions = (options && typeof options === 'object') ? options : {};
    const fresh = requestOptions.fresh === true;
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    if (fresh) {
      headers['Cache-Control'] = 'no-cache';
      headers.Pragma = 'no-cache';
    }
    const params = new URLSearchParams({ symbols });
    if (fresh) {
      params.set('_ts', String(Date.now()));
    }
    return fetch(`/api/quote?${params.toString()}`, {
      headers,
      ...(fresh ? { cache: 'no-store' } : {}),
    });
  }, []);

  const fetchPopularStockQuotes = useCallback(async (symbols = []) => {
    const normalizedSymbols = Array.from(new Set(
      (Array.isArray(symbols) ? symbols : [])
        .map((symbol) => normalizeStrictSymbolKey(symbol))
        .filter(Boolean),
    )).slice(0, 30);
    if (normalizedSymbols.length === 0) return { success: true, data: [] };

    const r = await fetchQuote(normalizedSymbols.join(','), { fresh: true });
    const result = await r.json().catch(() => ({}));
    if (!r.ok || !result?.success) {
      throw new Error(result?.error || `热门股票行情校验失败: ${r.status}`);
    }

    const allowedSymbols = new Set(normalizedSymbols);
    const data = (Array.isArray(result?.data) ? result.data : [])
      .map((row) => ({ ...row, symbol: normalizeStrictSymbolKey(row?.symbol) }))
      .filter((row) => (
        allowedSymbols.has(row.symbol)
        && !row.error
        && Number(row.price) > 0
        && row.priceSource === 'EODHD-v2'
      ));
    return { success: true, data };
  }, [fetchQuote]);

  const fetchMarketMovers = useCallback(async (options = {}) => {
    const fresh = options?.fresh === true;
    const cached = marketMoversCacheRef.current;
    if (!fresh && cached?.expiresAt > Date.now()) return cached.payload;
    if (!fresh && marketMoversRequestRef.current) return marketMoversRequestRef.current;

    const request = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('未登录或登录已过期');

      const params = new URLSearchParams({ view: 'market-movers' });
      if (fresh) params.set('_ts', String(Date.now()));
      const response = await fetch(`/api/quote?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Cache-Control': fresh ? 'no-cache' : 'max-age=0',
          ...(fresh ? { Pragma: 'no-cache' } : {}),
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `美股收盘榜加载失败: ${response.status}`);
      }

      const dataDate = /^\d{4}-\d{2}-\d{2}$/.test(String(result.dataDate || '').slice(0, 10))
        ? String(result.dataDate).slice(0, 10)
        : '';
      if (!dataDate) throw new Error('美股收盘榜缺少有效数据日期');
      const expiresAt = Date.now() + 15 * 60 * 1000;
      const payload = {
        success: true,
        source: result.source || '',
        dataDate,
        fetchedAt: result.fetchedAt || null,
        expiresAt: new Date(expiresAt).toISOString(),
        gainers: Array.isArray(result.gainers) ? result.gainers.slice(0, 30) : [],
        losers: Array.isArray(result.losers) ? result.losers.slice(0, 30) : [],
      };
      marketMoversCacheRef.current = { payload, expiresAt };
      return payload;
    })();

    marketMoversRequestRef.current = request;
    try {
      return await request;
    } finally {
      if (marketMoversRequestRef.current === request) marketMoversRequestRef.current = null;
    }
  }, []);

  const fetchRealtimeSnapshot = useCallback(async (endpoint, options = {}) => {
    const requestOptions = (options && typeof options === 'object') ? options : {};
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('未登录或登录已过期');
    const params = new URLSearchParams({
      snapshot: '1',
      _ts: String(Date.now()),
    });
    if (requestOptions.symbols) params.set('symbols', requestOptions.symbols);
    return fetch(`${endpoint}?${params.toString()}`, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
  }, []);

  const fetchSwingWaveRealtimeSnapshot = useCallback(async (symbols = []) => {
    const normalizedSymbols = Array.from(new Set(
      (Array.isArray(symbols) ? symbols : [])
        .map((symbol) => normalizeStrictSymbolKey(symbol))
        .filter(Boolean),
    )).slice(0, 50);
    if (normalizedSymbols.length === 0) return { success: true, data: [], coverage: null };

    const response = await fetchRealtimeSnapshot('/api/stocks-realtime', {
      symbols: normalizedSymbols.join(','),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.success) {
      throw new Error(result?.error || `波段实时快照失败: ${response.status}`);
    }

    const allowedSymbols = new Set(normalizedSymbols);
    const data = (Array.isArray(result?.data?.ticks) ? result.data.ticks : [])
      .map((row) => ({
        ...row,
        symbol: normalizeStrictSymbolKey(row?.symbol),
        realtime: true,
        realtimeStatus: 'live',
      }))
      .filter((row) => (
        allowedSymbols.has(row.symbol)
        && row.type === 'stock_tick'
        && Number(row.price) > 0
      ));

    return {
      success: true,
      data,
      coverage: result?.data?.coverage || null,
    };
  }, [fetchRealtimeSnapshot]);

  const applyBtcRealtimeTick = useCallback((tick, realtimeStatus = 'live', options = {}) => {
    const price = Number(tick?.price);
    if (!Number.isFinite(price) || price <= 0) return;
    const receivedAt = Date.now();
    const tickAt = Number(tick?.timestamp || tick?.receivedAt || Date.now());
    btcRealtimeRef.current.lastTick = tick;
    btcRealtimeRef.current.lastTickAt = receivedAt;
    if (options?.transport === 'websocket') {
      btcRealtimeRef.current.lastWebSocketTickAt = receivedAt;
    }
    setBtcRealtimeStatus(realtimeStatus);
    setBtcRealtimeLastTick(new Date(tickAt).toISOString());
    setBtcRealtimeError(null);
    setBtcMarketCard((current) => applyBtcTickToMarketCard(current, tick, realtimeStatus));
  }, []);

  const applyIndexRealtimeTick = useCallback((tick, realtimeStatus = 'live') => {
    const price = Number(tick?.price);
    if (!Number.isFinite(price) || price <= 0) return;
    const tickAt = Number(tick?.timestamp || tick?.receivedAt || Date.now());
    const key = String(tick?.symbol || tick?.ticker || tick?.displaySymbol || '').toUpperCase();
    if (!key) return;
    indexRealtimeRef.current.lastTicks.set(key, tick);
    indexRealtimeRef.current.lastTickAt = Date.now();
    setIndexRealtimeStatus(realtimeStatus);
    setIndexRealtimeLastTick(new Date(tickAt).toISOString());
    setIndexRealtimeError(null);
    setMarketIndices((current) => applyIndexTickToMarketCards(current, tick, realtimeStatus, getIndexChartOptions()));
  }, []);

  const applyStockRealtimeTick = useCallback((tick, realtimeStatus = 'live', options = {}) => {
    const price = Number(tick?.price);
    if (!Number.isFinite(price) || price <= 0) return;
    const tickAt = Number(tick?.timestamp || tick?.receivedAt || Date.now());
    const key = normalizeSymbolKey(tick?.symbol || tick?.ticker || tick?.displaySymbol);
    if (!key) return;
    const officialRealtimeBaseRows = quoteRowsRef.current;
    if (
      stockRealtimeUniverseResolvedRef.current
      && !officialRealtimeBaseRows.some((row) => normalizeSymbolKey(row?.symbol) === key)
    ) {
      return;
    }
    const ref = stockRealtimeRef.current;
    const clientReceivedAt = Date.now();
    const enrichedTick = {
      ...tick,
      clientReceivedAt,
    };
    ref.lastTicks.set(key, enrichedTick);
    ref.lastTickAt = clientReceivedAt;
    if (options?.transport === 'websocket') {
      ref.lastWebSocketTickAt = clientReceivedAt;
      ref.lastWebSocketTickAtBySymbol.set(key, clientReceivedAt);
    } else if (options?.transport === 'snapshot') {
      ref.lastSnapshotTickAt = clientReceivedAt;
    }
    ref.lastTickIso = new Date(tickAt).toISOString();
    ref.status = realtimeStatus;
    ref.error = null;
    const realtimeBaseRows = officialRealtimeBaseRows.length > 0
      ? officialRealtimeBaseRows
      : stockQuoteBootstrapRows;
    setQuoteCache((current) => applyStockTickToQuoteRows(current, enrichedTick, realtimeStatus, realtimeBaseRows));
    if (key === 'QQQ') {
      setQqqCurrent(price);
      setQqqHigh((prev) => Math.max(prev || 0, price));
      setQqqSignalQuote((current) => {
        const marketStatus = String(tick?.marketStatus || current?.marketStatus || '').toLowerCase();
        const dailyPnlSession = getUsEquityRealtimeSession({
          ...current,
          marketStatus,
        }, tickAt);
        const explicitlyLive = dailyPnlSession === 'pre' || dailyPnlSession === 'regular';
        const explicitlyLocked = dailyPnlSession === 'post' || dailyPnlSession === 'closed';
        const high = Math.max(Number(current?.high) || 0, Number(current?.week52High) || 0, price);
        return {
          ...current,
          ...tick,
          symbol: 'QQQ',
          name: current?.name || 'QQQ',
          price,
          high,
          week52High: high,
          realtime: true,
          realtimeStatus,
          realtimeAt: tickAt,
          clientReceivedAt,
          dailyPnlSession,
          dailyPnlPrice: explicitlyLive ? price : (Number(current?.dailyPnlPrice) || 0),
          dailyPnlLocked: explicitlyLocked ? true : (explicitlyLive ? false : Boolean(current?.dailyPnlLocked)),
          dailyPnlSource: explicitlyLive ? 'realtime-tick' : (current?.dailyPnlSource || 'locked-regular-close'),
        };
      });
    }
  }, [stockQuoteBootstrapRows]);

  const mergeFreshIndexTicksIntoCards = useCallback((cards) => {
    const ref = indexRealtimeRef.current;
    if (!ref.lastTickAt || Date.now() - ref.lastTickAt > REALTIME_STALE_MS) return cards;
    let next = cards;
    const chartOptions = getIndexChartOptions();
    for (const tick of ref.lastTicks.values()) {
      next = applyIndexTickToMarketCards(next, tick, 'live', chartOptions);
    }
    return next;
  }, []);

  const mergeFreshStockTicksIntoQuoteRows = useCallback((rows) => {
    const ref = stockRealtimeRef.current;
    if (!ref.lastTickAt || Date.now() - ref.lastTickAt > REALTIME_STALE_MS) return rows;
    const freshTicks = [...ref.lastTicks.values()]
      .filter((tick) => isFreshStockRealtimeTick(tick, { maxAgeMs: REALTIME_STALE_MS }));
    if (freshTicks.length === 0) return rows;
    return mergeStockTicksIntoQuoteRows(rows, freshTicks, 'live', rows);
  }, []);

  const cacheStockLogo = useCallback((symbol, url) => {
    const key = normalizeSymbolKey(symbol);
    const normalizedUrl = normalizeExternalLogoUrl(url);
    if (!key || !normalizedUrl) return;
    setLogoCache((current) => {
      if (current[key]?.url === normalizedUrl) return current;
      const next = {
        ...current,
        [key]: {
          url: normalizedUrl,
          updatedAt: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(STOCK_LOGO_CACHE_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const applyFxRates = useCallback((rates) => {
    const usdCny = validRate(rates?.CNY);
    const hkdCny = validRate(rates?.HKD);
    if (usdCny) setUsdRate(usdCny);
    if (hkdCny) setHkdRate(hkdCny);
  }, []);

  const fetchDailyFxRates = useCallback(async ({ force = false } = {}) => {
    const todayKey = localDateKey();
    const cached = readCachedFxRates();

    if (cached?.rates) {
      applyFxRates(cached.rates);
      if (!force && cached.dateKey === todayKey) return cached;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return cached;

      const response = await fetch('/api/fx', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '汇率拉取失败');
      }

      const nextRates = {
        CNY: validRate(result?.rates?.CNY),
        HKD: validRate(result?.rates?.HKD),
      };
      if (!nextRates.CNY && !nextRates.HKD) {
        throw new Error('汇率接口没有返回有效数据');
      }

      const next = {
        dateKey: todayKey,
        fetchedAt: result.fetchedAt || new Date().toISOString(),
        source: result.source || 'EODHD',
        rates: nextRates,
      };
      try {
        localStorage.setItem(FX_RATES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      applyFxRates(nextRates);
      return next;
    } catch (e) {
      console.warn('[FX] 每日汇率拉取失败,保留缓存/默认值:', e.message);
      return cached;
    }
  }, [applyFxRates]);

  // 🗑 v10.7.9.41: 通用删除确认 Modal (替换 window.confirm)
  // 用法: showConfirm({ title, desc, info, confirmText, onConfirm })
  const [confirmModal, setConfirmModal] = useState(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const confirmSubmittingRef = useRef(false);
  const showConfirm = useCallback((opts) => {
    confirmSubmittingRef.current = false;
    setConfirmSubmitting(false);
    setConfirmModal(normalizeConfirmModalOptions(opts));
  }, []);
  const closeConfirmModal = useCallback(() => {
    if (confirmSubmittingRef.current) return;
    setConfirmModal(null);
  }, []);
  const submitConfirmModal = useCallback(async () => {
    if (confirmSubmittingRef.current) return;
    const callback = confirmModal?.onConfirm;
    if (!callback) {
      setConfirmModal(null);
      return;
    }
    confirmSubmittingRef.current = true;
    setConfirmSubmitting(true);
    try {
      await callback();
      setConfirmModal(null);
    } finally {
      confirmSubmittingRef.current = false;
      setConfirmSubmitting(false);
    }
  }, [confirmModal]);

  useEffect(() => {
    try { localStorage.setItem('bottomline_ws', 'false'); } catch {}
  }, []);

  // v10.7.9.41: 摊薄成本计算器 (独立模块, localStorage 存)
  // 数据结构: { [symbol]: [{id, date, type:'buy'|'sell', price, shares}, ...] }
  const [costBasisData, setCostBasisData] = useState(() => {
    try {
      const raw = localStorage.getItem(userScopedStorageKey('bottomline_cost_basis', user.id));
      return raw ? sanitizeCostBasisData(JSON.parse(raw)) : {};
    } catch { return {}; }
  });
  const [costBasisActiveSymbol, setCostBasisActiveSymbol] = useState(() => {
    try { return normalizeCostBasisSymbol(localStorage.getItem(userScopedStorageKey('bottomline_cost_basis_active', user.id))) || ''; } catch { return ''; }
  });
  const [showCostBasisAdd, setShowCostBasisAdd] = useState(false);  // 添加新股票 modal
  const [showCostBasisTrade, setShowCostBasisTrade] = useState(false);  // 添加交易 modal
  const [costBasisNewSymbol, setCostBasisNewSymbol] = useState('');
  const [costBasisNewTrade, setCostBasisNewTrade] = useState({
    type: 'buy',
    price: '',
    shares: '',
    date: new Date().toISOString().slice(0, 10),
  });
  const [costBasisSubmitting, setCostBasisSubmitting] = useState(false);
  const costBasisSubmittingRef = useRef(false);
  // 卖出交易展开/收起 state (id → bool)
  const [expandedTrades, setExpandedTrades] = useState({});

  // 持久化到 localStorage
  useEffect(() => {
    try { localStorage.setItem(userScopedStorageKey('bottomline_cost_basis', user.id), JSON.stringify(sanitizeCostBasisData(costBasisData))); } catch {}
  }, [costBasisData, user.id]);
  useEffect(() => {
    try { localStorage.setItem(userScopedStorageKey('bottomline_cost_basis_active', user.id), normalizeCostBasisSymbol(costBasisActiveSymbol)); } catch {}
  }, [costBasisActiveSymbol, user.id]);

  useEffect(() => {
    const sanitized = sanitizeCostBasisData(costBasisData);
    const symbols = Object.keys(sanitized);
    const active = normalizeCostBasisSymbol(costBasisActiveSymbol);
    if (active && sanitized[active]) return;
    const nextActive = symbols[0] || '';
    if (nextActive !== costBasisActiveSymbol) setCostBasisActiveSymbol(nextActive);
  }, [costBasisActiveSymbol, costBasisData]);

  // 核心算法: 移动加权平均 + 扣除已实现盈亏的"实际成本"
  const calcCostBasis = (trades) => {
    if (!trades || trades.length === 0) return { shares: 0, totalCost: 0, avgCost: 0, effectiveCost: 0, realizedPnl: 0 };
    const sorted = [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let shares = 0;
    let totalCost = 0;
    let realizedPnl = 0;
    for (const t of sorted) {
      const p = parseFloat(t.price) || 0;
      const s = parseFloat(t.shares) || 0;
      if (t.type === 'buy') {
        shares += s;
        totalCost += s * p;
      } else {
        if (shares <= 0) continue;  // 没持仓不能卖
        const avg = totalCost / shares;
        realizedPnl += s * (p - avg);
        totalCost -= s * avg;
        shares -= s;
        if (shares <= 0) {
          shares = 0;
          totalCost = 0;  // 清仓重置
        }
      }
    }
    const avgCost = shares > 0 ? totalCost / shares : 0;
    // 实际成本 = 摊薄成本 - 已实现盈亏均摊到剩余持仓
    // 比如赚了 $70,220, 剩 6000 股 → 每股降 $11.70
    const effectiveCost = shares > 0 ? avgCost - realizedPnl / shares : 0;
    return {
      shares,
      totalCost,
      avgCost,
      effectiveCost,
      realizedPnl,
    };
  };

  // 📜 更新日志展开状态 (默认折叠, 只显示最新 5 条)
  const [changelogExpanded, setChangelogExpanded] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [quoteDiagnosticLogs, setQuoteDiagnosticLogs] = useState(() => readQuoteDiagnosticLogs(user.id));
  const [btcRealtimeStatus, setBtcRealtimeStatus] = useState('idle');
  const [btcRealtimeLastTick, setBtcRealtimeLastTick] = useState(null);
  const [btcRealtimeError, setBtcRealtimeError] = useState(null);
  const [indexRealtimeStatus, setIndexRealtimeStatus] = useState('idle');
  const [indexRealtimeLastTick, setIndexRealtimeLastTick] = useState(null);
  const [indexRealtimeError, setIndexRealtimeError] = useState(null);
  const [warmStartedAt, setWarmStartedAt] = useState(0);
  const btcRealtimeRef = useRef({
    socket: null,
    reconnectTimer: null,
    staleTimer: null,
    retryDelayMs: 1000,
    lastTick: null,
    lastTickAt: 0,
    lastWebSocketTickAt: 0,
    liveAt: 0,
    lastConnectAttemptAt: 0,
    lastForceReconnectAt: 0,
    intentionalCloseSocket: null,
  });
  const stockRealtimeRef = useRef({
    socket: null,
    reconnectTimer: null,
    staleTimer: null,
    retryDelayMs: 1000,
    status: 'idle',
    error: null,
    lastTicks: new Map(),
    lastTickAt: 0,
    lastWebSocketTickAt: 0,
    lastWebSocketTickAtBySymbol: new Map(),
    snapshotFreshnessFloorAt: 0,
    lastSnapshotTickAt: 0,
    lastTickIso: null,
    liveAt: 0,
    lastConnectAttemptAt: 0,
    lastSocketOpenAt: 0,
    lastForceReconnectAt: 0,
    firstTickTimer: null,
    sessionTickSymbols: new Set(),
    intentionalCloseSocket: null,
  });
  const quoteRowsRef = useRef([]);
  const quoteBaselineRowsRef = useRef(null);
  const indexRealtimeRef = useRef({
    socket: null,
    reconnectTimer: null,
    staleTimer: null,
    retryDelayMs: 1000,
    lastTicks: new Map(),
    lastTickAt: 0,
    liveAt: 0,
    lastConnectAttemptAt: 0,
    lastForceReconnectAt: 0,
    intentionalCloseSocket: null,
  });
  // 云端数据加载状态
  const [cloudLoading, setCloudLoading] = useState(true);
  const [stockRealtimeUniverseResolved, setStockRealtimeUniverseResolved] = useState(false);
  const [cloudError, setCloudError] = useState(null);
  const [pullRefreshDistance, setPullRefreshDistance] = useState(0);
  const [pullRefreshStatus, setPullRefreshStatus] = useState('idle'); // idle | pulling | ready | refreshing | updating | done
  const pullRefreshDistanceRef = useRef(0);
  const pullRefreshResetTimerRef = useRef(null);
  const globalRefreshingRef = useRef(false);
  const runGlobalPullRefreshRef = useRef(null);
  const localizedStockTrades = useMemo(() => stockTrades.map(localizeStockNameRow), [stockTrades]);
  const localizedWatchlist = useMemo(() => watchlist.map(localizeStockNameRow), [watchlist]);
  const localizedQuoteCache = useMemo(() => quoteCache.map(localizeStockNameRow), [quoteCache]);
  const localizedStockQuoteBootstrapRows = useMemo(
    () => stockQuoteBootstrapRows.map(localizeStockNameRow),
    [stockQuoteBootstrapRows],
  );
  const toolQuoteRows = useMemo(() => (
    buildToolQuoteRows({ trades, costBasisData, swingWaves: swingWaveQuoteRows }).map(localizeStockNameRow)
  ), [trades, costBasisData, swingWaveQuoteRows]);
  const quoteUniverse = useMemo(
    () => buildLedgerQuoteUniverse(localizedStockTrades, localizedWatchlist, localizedQuoteCache, toolQuoteRows),
    [localizedStockTrades, localizedWatchlist, localizedQuoteCache, toolQuoteRows],
  );
  const quoteRows = quoteUniverse.allRows;
  const homeWatchlist = quoteUniverse.watchlistRows;
  const quoteBaselineRows = useMemo(() => buildQuoteBaselineRows({
    candidateRows: quoteRows,
    stockTrades: localizedStockTrades,
    watchlist: localizedWatchlist,
    activeSwingRows: swingWaveQuoteRows,
  }), [localizedStockTrades, localizedWatchlist, quoteRows, swingWaveQuoteRows]);
  const quoteBySymbol = useMemo(() => {
    const map = new Map();
    quoteRows.forEach((row) => {
      const symbol = normalizeSymbolKey(row?.symbol);
      if (symbol) map.set(symbol, row);
    });
    return map;
  }, [quoteRows]);
  const stockRealtimePriorityRows = useMemo(() => ([
    ...(!stockRealtimeUniverseResolved ? localizedStockQuoteBootstrapRows : []),
    ...quoteUniverse.ledgerRows,
    ...quoteUniverse.watchlistRows,
    ...quoteUniverse.toolRows,
    ...quoteUniverse.allRows,
  ]), [localizedStockQuoteBootstrapRows, quoteUniverse, stockRealtimeUniverseResolved]);
  const stockRealtimeSymbols = useMemo(() => selectStockRealtimeSymbols(stockRealtimePriorityRows), [stockRealtimePriorityRows]);
  // Equivalent cache and cloud symbol sets must not restart the socket merely
  // because their priority order differs during startup hydration.
  const stockRealtimeSymbolsKey = buildStockRealtimeSymbolsKey(stockRealtimeSymbols);
  const stockRealtimeReady = canStartStockRealtime({
    cloudLoading,
    symbols: stockRealtimeSymbols,
  });

  useEffect(() => {
    const cachedCount = initialQuoteBootstrapCountRef.current;
    startRealtimeStartupTraceSession('startup');
    realtimeStartupTrace.mark('first_render', {
      cached: cachedCount > 0,
      count: cachedCount,
      phase: 'render',
      source: cachedCount > 0 ? 'cache' : 'client',
    });
  }, [realtimeStartupTrace, startRealtimeStartupTraceSession]);

  useEffect(() => {
    quoteRowsRef.current = quoteRows;
  }, [quoteRows]);

  useEffect(() => {
    quoteBaselineRowsRef.current = quoteBaselineRows;
  }, [quoteBaselineRows]);

  useEffect(() => {
    quoteBootstrapLatestRowsRef.current = quoteCache;
    if (!quoteBootstrapPersistReadyRef.current) {
      quoteBootstrapPersistReadyRef.current = true;
      return undefined;
    }
    if (quoteBootstrapPersistTimerRef.current) return undefined;
    quoteBootstrapPersistTimerRef.current = window.setTimeout(() => {
      quoteBootstrapPersistTimerRef.current = null;
      writeStockQuoteBootstrapCache({
        userId: user.id,
        rows: quoteBootstrapLatestRowsRef.current,
      });
    }, 1000);
    return undefined;
  }, [quoteCache, user.id]);

  useEffect(() => () => {
    if (quoteBootstrapPersistTimerRef.current) {
      window.clearTimeout(quoteBootstrapPersistTimerRef.current);
      quoteBootstrapPersistTimerRef.current = null;
    }
    writeStockQuoteBootstrapCache({
      userId: user.id,
      rows: quoteBootstrapLatestRowsRef.current,
    });
  }, [user.id]);

  useEffect(() => {
    if (!stockRealtimeUniverseResolved) return;
    const allowedSymbols = new Set(stockRealtimeSymbols);
    const nextQuoteCache = quoteCache.filter((row) => allowedSymbols.has(normalizeSymbolKey(row?.symbol)));
    quoteBootstrapLatestRowsRef.current = nextQuoteCache;
    if (nextQuoteCache.length !== quoteCache.length) {
      setQuoteCache(nextQuoteCache);
    }
    if (allowedSymbols.size === 0) {
      if (quoteBootstrapPersistTimerRef.current) {
        window.clearTimeout(quoteBootstrapPersistTimerRef.current);
        quoteBootstrapPersistTimerRef.current = null;
      }
      clearStockQuoteBootstrapCache({ userId: user.id });
    }
  }, [quoteCache, stockRealtimeSymbolsKey, stockRealtimeUniverseResolved, user.id]);

  const buildSettingsPayload = useCallback((overrides = {}) => ({
    benchmarkSymbol,
    marketColorMode,
    fgi,
    fgiLabel,
    fgiPrev,
    fgiWeek,
    fgiMonth,
    fgiYear,
    fgiDataDate,
    vix,
    vixDataDate,
    batches,
    exitTargets,
    watchlistOrder: normalizeWatchlistOrder(watchlistOrder),
    ...overrides,
  }), [
    benchmarkSymbol,
    marketColorMode,
    fgi,
    fgiLabel,
    fgiPrev,
    fgiWeek,
    fgiMonth,
    fgiYear,
    fgiDataDate,
    vix,
    vixDataDate,
    batches,
    exitTargets,
    watchlistOrder,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(MARKET_COLOR_MODE_STORAGE_KEY, marketColorMode);
    } catch {}
  }, [marketColorMode]);

  useEffect(() => {
    if (!fetchError) return undefined;
    const timerId = setTimeout(() => setFetchError(null), 4200);
    return () => clearTimeout(timerId);
  }, [fetchError]);

  const recordQuoteDiagnosticLog = useCallback((entry) => {
    if (!entry) return;
    setQuoteDiagnosticLogs(current => {
      const currentLogs = Array.isArray(current) ? current : [];
      const latest = currentLogs[0];
      let next;
      if (latest?.fingerprint && latest.fingerprint === entry.fingerprint) {
        next = [
          {
            ...latest,
            lastAt: entry.at,
            count: (latest.count || 1) + 1,
            durationMs: entry.durationMs,
            status: entry.status,
            message: entry.message,
            providerErrors: entry.providerErrors,
          },
          ...currentLogs.slice(1),
        ];
      } else {
        next = [entry, ...currentLogs].slice(0, QUOTE_DIAGNOSTIC_LOG_LIMIT);
      }
      persistQuoteDiagnosticLogs(next, user.id);
      return next;
    });
  }, [user.id]);

  const clearQuoteDiagnosticLogs = useCallback(() => {
    persistQuoteDiagnosticLogs([], user.id);
    setQuoteDiagnosticLogs([]);
  }, [user.id]);

  const applyCloudUserData = useCallback((result, logLabel = '[云端加载]') => {
    const {
      trades: cloudTrades,
      stockTrades: cloudStockTrades,
      watchlist: cloudWatchlist,
      waveNotes: cloudNotes,
      settings,
      accounts: cloudAccounts,
      snapshots: cloudSnapshots,
      investmentPlan: cloudPlan,
      marginStatus: cloudMargin,
      availableCashStatus: cloudAvailableCash,
      disciplines: cloudDisciplines,
      reviewLogs: cloudLogs,
      yearlyActuals: cloudActuals,
      _failedTables,
    } = result || {};

    console.log(`${logLabel} cloudWatchlist:`, cloudWatchlist, '长度:', cloudWatchlist?.length);
    console.log(`${logLabel} accounts:`, cloudAccounts?.length, 'snapshots:', cloudSnapshots?.length);
    console.log(`${logLabel} 复盘 tab: plan`, cloudPlan, 'margin', cloudMargin, 'disciplines', cloudDisciplines?.length, 'logs', cloudLogs?.length);

    if (_failedTables && _failedTables.length > 0) {
      console.error(`${logLabel} ⚠️ 以下表拉取失败, 保留本地数据:`, _failedTables);
      setCloudError(`⚠️ ${_failedTables.length} 项数据未能加载: ${_failedTables.join(', ')}`);
    } else {
      setCloudError(null);
    }

    // 防护原则: null = 拉取失败 → 不动本地; []/{} = 真的空 → 可以覆盖。
    if (cloudTrades !== null && cloudTrades !== undefined) setTrades(cloudTrades);
    else console.warn(`${logLabel} ⚠️ trades 拉取失败, 保留本地 state`);

    if (cloudStockTrades !== null && cloudStockTrades !== undefined) setStockTrades(cloudStockTrades);
    else console.warn(`${logLabel} ⚠️ stockTrades 拉取失败, 保留本地主交易账本`);

    if (Array.isArray(cloudWatchlist)) {
      const cloudWatchlistOrder = normalizeWatchlistOrder(settings?.watchlistOrder);
      const orderedWatchlist = orderWatchlistRows(cloudWatchlist, cloudWatchlistOrder);
      console.log(`${logLabel} ✓ 设置 watchlist:`, orderedWatchlist.length, '只');
      setWatchlist(orderedWatchlist);
      setWatchlistOrder(normalizeWatchlistOrder(orderedWatchlist.map((item) => item?.symbol)));
    } else {
      console.warn(`${logLabel} ⚠️ watchlist 拉取失败, 保留本地默认`);
    }

    if (cloudNotes !== null && cloudNotes !== undefined) setWaveNotes(cloudNotes);
    else console.warn(`${logLabel} ⚠️ waveNotes 拉取失败, 保留本地`);

    if (cloudAccounts !== null && cloudAccounts !== undefined) setAccounts(cloudAccounts);
    else console.warn(`${logLabel} ⚠️ accounts 拉取失败, 保留本地`);

    if (cloudSnapshots !== null && cloudSnapshots !== undefined) setSnapshots(cloudSnapshots);
    else console.warn(`${logLabel} ⚠️ snapshots 拉取失败, 保留本地`);

    if (cloudPlan) setInvestmentPlan(cloudPlan);
    if (cloudMargin !== null && cloudMargin !== undefined) {
      setMarginStatus(cloudMargin);
      setMarginStatusReady(true);
    }
    if (cloudAvailableCash !== null && cloudAvailableCash !== undefined) {
      setAvailableCashStatus(cloudAvailableCash);
      setAvailableCashStatusReady(true);
    } else {
      // A previously observed missing row is not a durable zero balance. If a
      // fresh read fails and there is no explicit cached amount, fail the asset
      // cards closed until authority can be refreshed.
      setAvailableCashStatus(current => ({ ...current, writeReady: false }));
      setAvailableCashStatusReady(false);
      console.warn(`${logLabel} ⚠️ availableCashStatus 拉取失败, 暂停资产口径`);
    }

    if (cloudDisciplines !== null && cloudDisciplines !== undefined) setDisciplines(cloudDisciplines);
    else console.warn(`${logLabel} ⚠️ disciplines 拉取失败, 保留本地`);

    if (cloudLogs !== null && cloudLogs !== undefined) setReviewLogs(cloudLogs);
    else console.warn(`${logLabel} ⚠️ reviewLogs 拉取失败, 保留本地`);

    if (cloudActuals !== null && cloudActuals !== undefined) setYearlyActuals(cloudActuals);
    else console.warn(`${logLabel} ⚠️ yearlyActuals 拉取失败, 保留本地`);

    if (settings) {
      if (settings.benchmarkSymbol) setBenchmarkSymbol(settings.benchmarkSymbol);
      if (typeof settings.fgi === 'number') setFgi(settings.fgi);
      if (settings.fgiLabel) setFgiLabel(settings.fgiLabel);
      if (typeof settings.fgiPrev === 'number') setFgiPrev(settings.fgiPrev);
      if (typeof settings.fgiWeek === 'number') setFgiWeek(settings.fgiWeek);
      if (typeof settings.fgiMonth === 'number') setFgiMonth(settings.fgiMonth);
      if (typeof settings.fgiYear === 'number') setFgiYear(settings.fgiYear);
      if (settings.fgiDataDate) setFgiDataDate(settings.fgiDataDate);
      if (settings.vix) setVix(settings.vix);
      if (settings.vixDataDate) setVixDataDate(settings.vixDataDate);
      if (Array.isArray(settings.batches) && settings.batches.length > 0) setBatches(settings.batches);
      if (Array.isArray(settings.exitTargets) && settings.exitTargets.length > 0) setExitTargets(settings.exitTargets);
      if (settings.marketColorMode) setMarketColorMode(normalizeMarketColorMode(settings.marketColorMode));
    }
  }, []);

  // 启动时从 Supabase 拉取所有数据
  useEffect(() => {
    let mounted = true;
    const MAX_CLOUD_SYNC_GUARD_MS = 2600;  // 最多阻止自动保存 2.6s, 主界面不再被开屏阻塞

    // 强制解除保存保护, 避免云端长时间无响应时无法继续使用
    const timeoutId = setTimeout(() => {
      if (mounted) {
        console.warn('[云端加载] 超过 2.6s 仍未完成, 解除启动保护');
        setCloudLoading(false);
      }
    }, MAX_CLOUD_SYNC_GUARD_MS);

    const finishLoading = () => {
      if (!mounted) return;
      clearTimeout(timeoutId);
      setCloudLoading(false);
    };

    (async () => {
      try {
        setCloudLoading(true);
        console.log('[云端加载] 开始拉取...');
        const result = await db.fetchAllUserData();
        console.log('[云端加载] 原始返回:', result);
        if (!mounted) return;
        applyCloudUserData(result, '[云端加载]');
        stockRealtimeUniverseResolvedRef.current = true;
        setStockRealtimeUniverseResolved(true);
        quoteRefreshFromCloudResultRef.current?.(result);
      } catch (e) {
        console.error('[云端加载] 失败:', e);
        setCloudError(e.message);
      } finally {
        finishLoading();  // 0.8s 下限保护
      }
    })();
    return () => { mounted = false; clearTimeout(timeoutId); };
  }, [applyCloudUserData]);

  useEffect(() => {
    fetchDailyFxRates();
  }, [fetchDailyFxRates]);

  // 保存设置到云端(防抖,500ms 内多次改只保存最后一次)
  const settingsSaveTimerRef = useRef(null);
  useEffect(() => {
    if (cloudLoading) return; // 加载期间不保存
    clearTimeout(settingsSaveTimerRef.current);
    settingsSaveTimerRef.current = setTimeout(() => {
      db.upsertSettings(buildSettingsPayload()).catch(e => console.error('设置保存失败:', e));
    }, 500);
    return () => clearTimeout(settingsSaveTimerRef.current);
  }, [buildSettingsPayload, cloudLoading]);

  // 🚨 Watchlist 保存策略: 改为精确单条操作 (addStock/removeStock/updateStockPrice 里直接写)
  //     不再用"删光重插"的 replaceWatchlist, 避免竞态和重复问题
  //     所以这个防抖 useEffect 只用于"更新价格/成本/股数"时保存
  const watchlistSaveTimerRef = useRef(null);
  const watchlistStructureSig = useMemo(
    () => watchlist.map(s => `${s.symbol}|${s.name}|${s.high}|${s.cost}|${s.shares}`).join(';'),
    [watchlist]
  );
  useEffect(() => {
    if (cloudLoading) return;
    if (watchlist.length === 0) return; // 空列表不触发
    clearTimeout(watchlistSaveTimerRef.current);
    watchlistSaveTimerRef.current = setTimeout(async () => {
      // 对每只股票单独 upsert, 不走"删光重插"
      for (const item of watchlist) {
        try {
          await db.upsertWatchlistItem(item);
        } catch (e) {
          console.error(`[保存 ${item.symbol}] 失败:`, e);
        }
      }
    }, 500);
    return () => clearTimeout(watchlistSaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistStructureSig, cloudLoading]);

  // ☁️ v10.7.9.41: 摊薄成本云端同步 (Supabase cost_basis_trades 表)
  // 严格放在 cloudLoading 之后, 避免 React state hoisting 错乱
  // 启动时拉云端覆盖本地; 本地有数据但云端为空 → 自动迁移上云
  useEffect(() => {
    if (cloudLoading) return; // 等主云端加载完成后再跑
    let cancelled = false;
    (async () => {
      try {
        const cloudData = sanitizeCostBasisData(await db.fetchCostBasisTrades());
        if (cancelled) return;
        const cloudHasData = cloudData && Object.keys(cloudData).length > 0;
        // 用函数式 setState 拿当前 state, 避免依赖 costBasisData 引发无限循环
        setCostBasisData(currentLocal => {
          const localHasData = currentLocal && Object.keys(currentLocal).length > 0;

          if (cloudHasData) {
            // 云端有数据 → 用云端覆盖本地 (云端是真相)
            console.log('[CostBasis] ☁️ 从云端加载', Object.keys(cloudData).length, '只股票');
            return cloudData;
          } else if (localHasData) {
            // 云端空, 本地有 → 自动上传迁移 (异步, 不等)
            console.log('[CostBasis] 📤 本地数据自动迁移到云端...');
            (async () => {
              for (const [sym, trades] of Object.entries(sanitizeCostBasisData(currentLocal))) {
                for (const trade of trades) {
                  try {
                    await db.insertCostBasisTrade(sym, trade);
                  } catch (e) {
                    console.error('[CostBasis] 迁移失败', sym, trade.id, e.message);
                  }
                }
              }
              console.log('[CostBasis] ✓ 迁移完成');
            })();
            return currentLocal; // 不变
          }
          return currentLocal; // 都空, 不变
        });
      } catch (e) {
        console.error('[CostBasis] 云端加载失败:', e.message, '保留本地数据');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudLoading]);

  // ============ 计算逻辑 ============
  const drawdown = (qqqCurrent - qqqHigh) / qqqHigh;
  
  const getStatus = () => {
    if (drawdown >= -0.05) return { text: '🟢 等待中', color: 'bg-green-100 text-green-800', desc: '回撤<5%,空仓等待' };
    if (drawdown >= -0.10) return { text: '🟡 接近第1批', color: 'bg-yellow-100 text-yellow-800', desc: '回撤 5-10%,准备第1批' };
    if (drawdown >= -0.15) return { text: '🟠 第1批已触发', color: 'bg-orange-100 text-orange-800', desc: '可执行第1批建仓' };
    if (drawdown >= -0.20) return { text: '🔴 第2批已触发', color: 'bg-red-100 text-red-800', desc: '可执行第2批建仓' };
    return { text: '⚫ 第3批已触发', color: 'bg-gray-800 text-white', desc: '深度回撤,全仓抄底' };
  };
  const status = getStatus();

  // === 顶部市场状态卡用的"基准"计算(可切换关注列表中其他股票) ===
  // 在 watchlist 里找当前选中的基准股票
  const qqqBenchmarkStock = {
    ...(qqqSignalQuote || {}),
    symbol: 'QQQ',
    name: qqqSignalQuote?.name || 'QQQ',
    price: qqqCurrent,
    high: qqqHigh,
    week52High: qqqHigh,
  };
  const benchmarkStock = benchmarkSymbol === 'QQQ'
    ? qqqBenchmarkStock
    : quoteRows.find(s => s.symbol === benchmarkSymbol);
  const benchmarkDrawdown = benchmarkStock && benchmarkStock.high > 0
    ? (benchmarkStock.price - benchmarkStock.high) / benchmarkStock.high
    : 0;
  const getBenchmarkStatus = (dd) => {
    if (dd >= -0.05) return { text: '🟢 等待中', desc: '回撤<5%,空仓等待' };
    if (dd >= -0.10) return { text: '🟡 接近建仓', desc: '回撤 5-10%,准备出手' };
    if (dd >= -0.15) return { text: '🟠 第1档触发', desc: '回撤 10-15%' };
    if (dd >= -0.20) return { text: '🔴 第2档触发', desc: '回撤 15-20%' };
    return { text: '⚫ 第3档触发', desc: '深度回撤 ≥20%' };
  };
  const benchmarkStatus = getBenchmarkStatus(benchmarkDrawdown);

  // 可选作为基准的股票列表(关注列表 + QQQ,排除杠杆 ETF)
  const benchmarkOptions = [
    qqqBenchmarkStock,
    ...quoteRows.filter(s => !LEVERAGED_ETFS.includes(s.symbol) && s.symbol !== 'QQQ'),
  ];

  // ============ 预警等级系统 ============
  // 9 档回撤阈值,跌得越狠等级越高
  const ALERT_LEVELS = [
    { dd: -0.10, level: 1, label: '关注',     color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: '🟡', action: '进入观察区, 可小批试探 (5-10%)' },
    { dd: -0.12, level: 2, label: '准备',     color: 'bg-amber-100 text-amber-800 border-amber-300',  icon: '🟠', action: '核对第1批资金是否就位' },
    { dd: -0.15, level: 3, label: '第1批',    color: 'bg-orange-100 text-orange-900 border-orange-400', icon: '🟠', action: '按计划执行第1批 (25%)' },
    { dd: -0.18, level: 4, label: '推进',     color: 'bg-orange-200 text-orange-900 border-orange-500', icon: '🔶', action: '按计划推进至 40-50%' },
    { dd: -0.20, level: 5, label: '第2批',    color: 'bg-red-100 text-red-800 border-red-400',         icon: '🔴', action: '按计划执行第2批 (累计 60%)' },
    { dd: -0.25, level: 6, label: '第3批',    color: 'bg-red-200 text-red-900 border-red-500',         icon: '🔴', action: '可执行第3批, 留 10-20% 应急弹药' },
    { dd: -0.30, level: 7, label: '深跌',     color: 'bg-red-500 text-white border-red-700',           icon: '⛔', action: '历史性区间, 维持率安全则可继续进攻' },
    { dd: -0.40, level: 8, label: '极端区',   color: 'bg-red-700 text-white border-red-900',           icon: '🚨', action: '大级别机会, 先核维持率, 弹药分 2-3 次打' },
    { dd: -0.50, level: 9, label: '历史极值', color: 'bg-black text-yellow-300 border-yellow-500',     icon: '💎', action: '2008/2020 级深跌, 敢买但分批, 底部无法预知' },
  ];

  // 计算每只股票的预警等级
  // 🚀 useMemo: watchlist 变化才重算 (WebSocket 时, 价格变化频繁会触发)
  const watchlistAlerts = useMemo(() => quoteRows.map(s => {
    const dd = s.high > 0 ? (s.price - s.high) / s.high : 0;
    let alert = null;
    for (let i = ALERT_LEVELS.length - 1; i >= 0; i--) {
      if (dd <= ALERT_LEVELS[i].dd) {
        alert = ALERT_LEVELS[i];
        break;
      }
    }
    return { ...s, drawdown: dd, alert };
  }), [quoteRows]);

  // 触发预警的股票(按等级降序)
  const triggeredAlerts = useMemo(() => watchlistAlerts
    .filter(s => s.alert)
    .sort((a, b) => b.alert.level - a.alert.level), [watchlistAlerts]);

  // 🔔 自动检测新预警 (v10.7.9.41): 新股票 / 等级升级 → 自动展开
  useEffect(() => {
    if (triggeredAlerts.length === 0) return;
    // 检查当前每只预警股票 vs lastSeenAlerts
    let hasNewOrUpgraded = false;
    for (const s of triggeredAlerts) {
      const prevLevel = lastSeenAlerts[s.symbol] || 0;
      if (s.alert.level > prevLevel) {
        // 新股票 (prevLevel=0) 或 等级升级 (例如 L3 → L5)
        hasNewOrUpgraded = true;
        break;
      }
    }
    if (hasNewOrUpgraded && alertsMuted) {
      // 自动展开 (用户之前折叠过, 但有新情况)
      setAlertsMuted(false);
      try { localStorage.setItem(userScopedStorageKey('bottomline_alerts_muted', user.id), 'false'); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggeredAlerts]);

  // ============ VIX 恐慌指数等级 ============
  const getVixSignal = () => {
    if (vix >= 35) return { 
      level: 'extreme', label: '梭哈买入', 
      color: 'bg-gradient-to-r from-red-700 to-black text-yellow-300 border-yellow-500',
      icon: '💎', desc: '历史级恐慌,反向重仓机会',
      action: '所有现金满仓,可考虑融资'
    };
    if (vix >= 30) return { 
      level: 'panic', label: '重点买入', 
      color: 'bg-red-600 text-white border-red-800',
      icon: '🚨', desc: '市场极度恐慌',
      action: '主力建仓,不要犹豫'
    };
    if (vix >= 25) return { 
      level: 'fear', label: '开始买入', 
      color: 'bg-orange-500 text-white border-orange-700',
      icon: '⚠️', desc: '恐慌区,可分批进场',
      action: '执行第1批建仓'
    };
    if (vix >= 20) return { 
      level: 'caution', label: '准备弹药', 
      color: 'bg-yellow-400 text-yellow-900 border-yellow-600',
      icon: '🟡', desc: '波动上升,可能有机会',
      action: '现金待命,准备建仓'
    };
    return { 
      level: 'calm', label: '空仓等待', 
      color: 'bg-green-100 text-green-800 border-green-300',
      icon: '🟢', desc: '市场平静,无操作',
      action: '现金放 SGOV 拿利息'
    };
  };
  const vixSignal = getVixSignal();

  const investmentSummary = useMemo(() => deriveInvestmentSummary({
    stockTrades: localizedStockTrades,
    watchlist: quoteRows,
    cashUsd: availableCashStatusReady ? Number(availableCashStatus?.availableCashUsd) || 0 : 0,
    usdRate,
  }), [availableCashStatus?.availableCashUsd, availableCashStatusReady, localizedStockTrades, quoteRows, usdRate]);

  const saveMarginDebt = useCallback(async (nextDebtUsd) => {
    if (!marginStatusReady) throw new Error('融资余额仍在同步，请稍后重试');
    const numericDebtUsd = Number(nextDebtUsd);
    if (!Number.isFinite(numericDebtUsd) || numericDebtUsd < 0) {
      throw new Error('融资余额必须是不小于 0 的有效金额');
    }

    const nextStatus = {
      currentMargin: normalizeMarginDebtUsd(numericDebtUsd),
      marginLimit: 0,
    };
    const persistedStatus = await db.upsertMarginStatus(nextStatus);
    const committedStatus = persistedStatus || nextStatus;
    setMarginStatus(committedStatus);
    return committedStatus;
  }, [marginStatusReady]);

  const loadAvailableCashMovements = useCallback(async ({ limit = 100 } = {}) => (
    db.fetchAvailableCashMovements({ limit })
  ), []);

  const mutateAvailableCash = useCallback(async (mutation) => {
    if (!availableCashStatusReady || !availableCashStatus?.writeReady) {
      throw new Error('可用现金仍在同步，请稍后重试');
    }

    try {
      const result = await db.mutateAvailableCash({
        ...mutation,
        expectedUpdatedAt: availableCashStatus?.isSet
          ? availableCashStatus?.updatedAt || null
          : null,
      });
      setAvailableCashStatus(result.status);
      setAvailableCashStatusReady(true);
      // The status trigger marks the personal report dirty. Cash still enters
      // that read model only through its completed-close snapshot cutoff; a
      // movement must not trigger a live rebuild or touch competition.
      return result;
    } catch (error) {
      // A second tab may have committed first. Refresh the authoritative
      // balance after any rejected/unknown result, but keep the original error
      // so the editor never reports a failed operation as successful.
      try {
        const refreshedStatus = await db.fetchAvailableCashStatus();
        if (refreshedStatus) {
          setAvailableCashStatus(refreshedStatus);
          setAvailableCashStatusReady(true);
        }
      } catch {
        // Preserve the last confirmed state when even the reconciliation read
        // is unavailable.
      }
      throw error;
    }
  }, [
    availableCashStatus?.isSet,
    availableCashStatus?.updatedAt,
    availableCashStatus?.writeReady,
    availableCashStatusReady,
  ]);

  // === 持仓冷静室:把每只股票的交易切成"波段" ===
  // 规则:全部卖完算一个波段结束,下次买入开启新波段
  // 🚀 useMemo: 只依赖 trades + quoteBySymbol (实时现价), 其他 state 变化不重算
  const wavesByStock = useMemo(() => {
    const groups = {};
    trades.forEach(t => {
      const sym = t.symbol || 'TQQQ';
      if (!groups[sym]) groups[sym] = { symbol: sym, name: t.name || sym, trades: [] };
      groups[sym].trades.push(t);
    });

    return Object.values(groups).map(g => {
      // 按时间升序(最早的先来)
      const sorted = [...g.trades].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));

      // 切波段:累计买入 == 累计卖出 时,该波段结束
      const waves = [];
      let currentWave = null;
      let cumBuyShares = 0;
      let cumSellShares = 0;

      for (const t of sorted) {
        const isBuy = !t.side || t.side === 'buy';
        // 没在波段中?这笔买入开启新波段
        if (!currentWave) {
          if (!isBuy) continue; // 没仓位时的卖出忽略(数据异常)
          currentWave = {
            // 🔑 波段 id 基于"开始日期+股票代码", 稳定
            // 删除非首笔交易后, 波段 id 不变 → 展开状态/备注都保留
            id: `wave-${g.symbol}-${t.date || t.id}`,
            startDate: t.date,
            endDate: null,
            buys: [],
            sells: [],
            note: '',
          };
        }

        if (isBuy) {
          currentWave.buys.push(t);
          cumBuyShares += Number(t.shares);
        } else {
          currentWave.sells.push(t);
          cumSellShares += Number(t.shares);
          // 卖完了 → 波段结束
          if (cumSellShares >= cumBuyShares && cumBuyShares > 0) {
            currentWave.endDate = t.date;
            waves.push(currentWave);
            currentWave = null;
            cumBuyShares = 0;
            cumSellShares = 0;
          }
        }
      }

      // 还在持仓的当作"进行中"波段
      if (currentWave) {
        waves.push({ ...currentWave, isActive: true });
      }

      // 给每个波段算指标
      const stockInfo = quoteBySymbol.get(normalizeSymbolKey(g.symbol));
      const currentPrice = stockInfo?.price || 0;
      const computed = waves.map((w, idx) => {
        const totalBuyShares = w.buys.reduce((s, t) => s + Number(t.shares), 0);
        const totalBuyCost = w.buys.reduce((s, t) => s + Number(t.shares) * Number(t.price), 0);
        const avgBuyPrice = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0;
        const totalSellShares = w.sells.reduce((s, t) => s + Number(t.shares), 0);
        const totalSellRevenue = w.sells.reduce((s, t) => s + Number(t.shares) * Number(t.price), 0);
        const avgSellPrice = totalSellShares > 0 ? totalSellRevenue / totalSellShares : 0;
        const heldShares = totalBuyShares - totalSellShares;

        // 持有天数
        const startDate = new Date(w.startDate);
        const endDate = w.isActive ? new Date() : new Date(w.endDate);
        const heldDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));

        // 盈亏
        let gainPct, gainAmount;
        if (w.isActive) {
          // 进行中:已实现 + 浮动
          const realized = totalSellRevenue - totalSellShares * avgBuyPrice;
          const unrealized = heldShares > 0 && currentPrice > 0 ? (currentPrice - avgBuyPrice) * heldShares : 0;
          gainAmount = realized + unrealized;
          gainPct = avgBuyPrice > 0 ? gainAmount / totalBuyCost : 0;
        } else {
          // 已结束:卖出收入 - 总成本
          gainAmount = totalSellRevenue - totalBuyCost;
          gainPct = totalBuyCost > 0 ? gainAmount / totalBuyCost : 0;
        }

        return {
          ...w,
          index: idx + 1,
          totalBuyShares,
          totalBuyCost,
          avgBuyPrice,
          totalSellShares,
          totalSellRevenue,
          avgSellPrice,
          heldShares,
          heldDays,
          gainAmount,
          gainPct,
          currentPrice: w.isActive ? currentPrice : 0,
        };
      });

      // 历史规律(只算已结束的)
      const completed = computed.filter(w => !w.isActive);
      const avgHeldDays = completed.length > 0
        ? Math.round(completed.reduce((s, w) => s + w.heldDays, 0) / completed.length)
        : 0;
      const avgGainPct = completed.length > 0
        ? completed.reduce((s, w) => s + w.gainPct, 0) / completed.length
        : 0;
      const activeWave = computed.find(w => w.isActive);

      return {
        symbol: g.symbol,
        name: g.name,
        waves: computed.reverse(), // 倒序,最新的在上
        completedCount: completed.length,
        avgHeldDays,
        avgGainPct,
        activeWave,
      };
    }).filter(g => g.waves.length > 0);
  }, [trades, quoteBySymbol]);  // 🚀 只依赖 trades 和实时 quote map

  // 顶部"持仓冷静室"总览 (基于 wavesByStock, 自动 memo)
  const calmRoomActiveCount = useMemo(() => wavesByStock.filter(g => g.activeWave).length, [wavesByStock]);
  const calmRoomCompletedCount = useMemo(() => wavesByStock.reduce((s, g) => s + g.completedCount, 0), [wavesByStock]);
  const calmRoomActiveDays = useMemo(() => wavesByStock
    .filter(g => g.activeWave)
    .reduce((s, g) => s + g.activeWave.heldDays, 0), [wavesByStock]);
  const calmRoomAvgActiveDays = calmRoomActiveCount > 0 ? Math.round(calmRoomActiveDays / calmRoomActiveCount) : 0;

  // ============ 操作函数 ============
  const recalculateCompetitionAfterLedgerMutation = useCallback(async () => {
    const userId = String(user?.id || '').trim();
    if (!userId) return null;
    try {
      const result = await communityCompetitionApi.recalculateSelf({ supabase });
      if (!['recalculated', 'already_current'].includes(result?.state)) return result;
      const publication = {
        snapshotDate: result.snapshotDate,
        version: result.version,
        completedAt: result.completedAt,
      };
      const observedPublication = await recordCommunityCompetitionObservedPublication({
        userId,
        publication,
      });
      if (!observedPublication) return result;
      invalidateCommunityCompetitionRequests(userId);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        const event = typeof CustomEvent === 'function'
          ? new CustomEvent(COMMUNITY_COMPETITION_PUBLICATION_EVENT, {
            detail: { publication: observedPublication },
          })
          : new Event(COMMUNITY_COMPETITION_PUBLICATION_EVENT);
        window.dispatchEvent(event);
      }
      return result;
    } catch (error) {
      // The formal ledger is already authoritative at this point. Competition
      // refresh is derived state and must never roll back or hide that save.
      console.warn('收益比赛即时重算暂未完成:', error?.message || error);
      return null;
    }
  }, [user?.id]);

  const recalculatePnlReportAfterLedgerMutation = useCallback(async () => {
    if (!String(user?.id || '').trim()) return null;
    try {
      return await enqueuePnlReportRecalculationAfterLedgerMutation({ supabase });
    } catch (error) {
      // 正式交易已经保存成功；收益快照属于可重试的派生数据，失败不能回滚账本。
      console.warn('收益报表即时重算暂未完成:', error?.message || error);
      return null;
    } finally {
      // The report page remains read-only. After the mutation-triggered attempt,
      // refresh an already-open report from authoritative snapshots only; any
      // remaining dirty state is consumed by the scheduled close jobs.
      setPnlReportRefreshVersion((version) => version + 1);
    }
  }, [user?.id]);

  const addTrade = async (sideOverride = null) => {
    if (tradeSubmittingRef.current) return;
    const tradeDraft = sideOverride
      ? { ...newTrade, side: sideOverride }
      : newTrade;
    const showTradeNotice = (title, desc, info = null) => {
      showConfirm({
        title,
        desc,
        info,
        confirmText: t(language, 'trades.close', '关闭'),
        confirmStyle: 'primary',
        icon: '!',
        showCancel: false,
      });
    };
    if (!tradeDraft.symbol || !tradeDraft.price || !tradeDraft.shares) {
      showTradeNotice(
        t(language, 'trades.requiredTitle', '请填写完整信息'),
        t(language, 'trades.requiredDesc', '股票代码、价格和股数都是必填项。')
      );
      return;
    }
    const symbol = normalizeStrictSymbolKey(tradeDraft.symbol);
    if (!symbol) {
      showTradeNotice(
        t(language, 'trades.invalidSymbolTitle', '股票代码格式不正确'),
        t(language, 'trades.invalidSymbolDesc', '请输入正确的股票代码,不要包含空格或特殊字符。')
      );
      return;
    }
    const isTqqqFormalDraft = isTqqqFormalTradeEntry({
      symbol,
      scope: tradeEntryScope,
    });
    // TQQQ 预演使用 Number 语义，正式写入必须保持一致（包括 number input 接受的科学计数法）。
    // 其他股票与波段入口继续保留现有 parseInt/parseFloat 行为。
    const sharesNum = isTqqqFormalDraft ? Number(tradeDraft.shares) : parseInt(tradeDraft.shares);
    const priceNum = isTqqqFormalDraft ? Number(tradeDraft.price) : parseFloat(tradeDraft.price);
    const editingId = tradeDraft.id || tradeDraft.editingId;
    if (sharesNum <= 0 || priceNum <= 0) {
      showTradeNotice(
        t(language, 'trades.positiveTitle', '价格和股数需要大于 0'),
        t(language, 'trades.positiveDesc', '请检查输入后再提交。')
      );
      return;
    }
    // 名字优先级:用户填的 > 中英对照表 > 代码本身
    const stockName = displayStockName(symbol, tradeDraft.name);
    tradeSubmittingRef.current = true;
    setTradeSubmitting(true);

    // 波段记录入口必须写 legacy trades,不能污染主交易账本 stock_trades。
    if (tradeEntryScope === 'wave') {
      try {
        const activeWaveBefore = wavesByStock.find(group => group.symbol === symbol)?.activeWave;
        const waveTradeRecord = await db.insertTrade({
          symbol,
          name: stockName,
          side: tradeDraft.side || 'buy',
          date: tradeDraft.date,
          price: priceNum,
          shares: sharesNum,
        });
        setTrades(current => [...current, waveTradeRecord]);
        if (typeof tradeDraft.note === 'string') {
          const targetWaveId = activeWaveBefore?.id || `wave-${symbol}-${tradeDraft.date || waveTradeRecord.id}`;
          const noteValue = tradeDraft.note.trim();
          if (noteValue || activeWaveBefore?.id) {
            setWaveNotes(current => ({ ...current, [targetWaveId]: noteValue }));
            db.upsertWaveNote(targetWaveId, noteValue).catch(err => {
              console.error('波段备注保存失败:', err);
            });
          }
        }
      } catch (e) {
        showTradeNotice(
          t(language, 'trades.addWaveFailed', '添加波段记录失败'),
          e.message || t(language, 'trades.tryAgainLater', '请稍后重试。')
        );
        return;
      } finally {
        tradeSubmittingRef.current = false;
        setTradeSubmitting(false);
      }

      setNewTrade({
        symbol: tradeDraft.symbol,
        name: tradeDraft.name,
        side: 'buy',
        date: new Date().toISOString().split('T')[0],
        price: '',
        shares: '',
        note: '',
        batch: '第1批',
      });
      setLookupStatus(tradeDraft.symbol === 'TQQQ' ? null : 'found');
      setShowAddTrade(false);
      return;
    }

    // 正式 TQQQ 保存前再次使用当前主账本与交易页估值口径校验。
    // 这道执行层守卫只覆盖 TQQQ；波段入口已在上方返回，其他股票保持原流程。
    const tqqqValidation = deriveTqqqTradePreview({
      stockTrades,
      quoteRows,
      cashUsd: investmentSummary?.cashUsd,
      usdRate: investmentSummary?.usdRate || usdRate,
      currentSummary: investmentSummary,
      draft: {
        ...tradeDraft,
        symbol,
        side: tradeDraft.side === 'sell' ? 'sell' : 'buy',
        price: priceNum,
        shares: tradeDraft.shares,
      },
      scope: tradeEntryScope,
    });
    if (tqqqValidation.applies && tqqqValidation.hardBlocked) {
      if (tqqqValidation.blockReason === 'whole-shares-required') {
        showTradeNotice(
          t(language, 'trades.tqqq.wholeSharesTitle', 'TQQQ股数需要填写整数'),
          t(language, 'trades.tqqq.wholeSharesDesc', '正式交易当前按整数股保存,请删除小数后再提交。')
        );
      } else if (tqqqValidation.blockReason === 'oversell') {
        showTradeNotice(
          t(language, 'trades.tqqq.oversellTitle', '卖出股数超过可卖数量'),
          t(language, 'trades.tqqq.oversellDesc', 'TQQQ卖出会按正式交易账本完整预演,不能超过该交易日期可安全卖出的股数。'),
          t(language, 'trades.tqqq.availableShares', '可卖 {{shares}} 股', {
            shares: tqqqValidation.availableShares.toLocaleString('en-US', { maximumFractionDigits: 6 }),
          })
        );
      } else if (tqqqValidation.blockReason === 'ledger-oversell') {
        showTradeNotice(
          t(language, 'trades.tqqq.ledgerConflictTitle', '本次修改会造成TQQQ账本超卖'),
          t(language, 'trades.tqqq.ledgerConflictDesc', '修改这笔买入后,后续正式卖出将超过当时可卖股数。请保留足够股数或调整交易日期。')
        );
      }
      tradeSubmittingRef.current = false;
      setTradeSubmitting(false);
      return;
    }

    // 添加/更新主交易账本记录(走 stock_trades,等返回真正的 id)
    try {
      const tradePayload = {
        symbol,
        name: stockName,
        side: tradeDraft.side || 'buy',
        date: tradeDraft.date,
        price: priceNum,
        shares: sharesNum,
        fee: tradeDraft.fee || 0,
        currency: tradeDraft.currency || 'USD',
        note: tradeDraft.note || '',
      };
      const tradeRecord = editingId
        ? await db.updateStockTrade(editingId, tradePayload)
        : await db.insertStockTrade(tradePayload);
      setStockTrades(current => editingId
        ? current.map(t => String(t.id) === String(editingId) ? tradeRecord : t)
        : [...current, tradeRecord]);
      void recalculatePnlReportAfterLedgerMutation();
      void recalculateCompetitionAfterLedgerMutation();
    } catch (e) {
      showTradeNotice(
        editingId
          ? t(language, 'trades.updateTradeFailed', '更新交易失败')
          : t(language, 'trades.addTradeFailed', '添加交易失败'),
        e.message || t(language, 'trades.tryAgainLater', '请稍后重试。')
      );
      return;
    } finally {
      tradeSubmittingRef.current = false;
      setTradeSubmitting(false);
    }

    // 重置表单(保留 symbol/name,新增下一笔默认回到买入)
    setNewTrade({
      symbol: tradeDraft.symbol,          // 保留刚用的代码
      name: tradeDraft.name,              // 保留系统识别名称
      side: 'buy',
      date: new Date().toISOString().split('T')[0],
      price: '',                          // 价格清空,等待重新输入
      shares: '',                         // 股数清空
      batch: '第1批',
    });
    setLookupStatus(tradeDraft.symbol === 'TQQQ' ? null : 'found'); // 已知代码默认显示已找到
    setShowAddTrade(false);
  };

  const confirmCostBasisTradeSubmit = (typeOverride = costBasisNewTrade.type) => {
    if (costBasisSubmittingRef.current) return;
    const symbol = normalizeCostBasisSymbol(costBasisActiveSymbol);
    const tradeDraft = { ...costBasisNewTrade, type: typeOverride };
    const priceNum = parseFloat(tradeDraft.price);
    const sharesNum = parseFloat(tradeDraft.shares);
    if (!symbol) {
      showConfirm({
        title: t(language, 'trades.pickStockTitle', '请先选择股票'),
        desc: t(language, 'trades.pickStockDesc', '先在摊薄成本工具中新增或选择一只股票,再添加交易记录。'),
        confirmText: t(language, 'trades.close', '关闭'),
        confirmStyle: 'primary',
        icon: '!',
        showCancel: false,
      });
      return;
    }
    if (!priceNum || !sharesNum || priceNum <= 0 || sharesNum <= 0) {
      showConfirm({
        title: t(language, 'trades.correctPriceSharesTitle', '请填写正确的价格和股数'),
        desc: t(language, 'trades.correctPriceSharesDesc', '价格和股数都需要大于 0。'),
        confirmText: t(language, 'trades.close', '关闭'),
        confirmStyle: 'primary',
        icon: '!',
        showCancel: false,
      });
      return;
    }
    const type = tradeDraft.type === 'sell' ? 'sell' : 'buy';
    const typeLabel = type === 'sell' ? t(language, 'trades.sell', '卖出') : t(language, 'trades.buy', '买入');
    showConfirm({
      title: t(language, 'trades.confirmCostTradeTitle', '确认保存摊薄成本记录?'),
      desc: t(language, 'trades.confirmCostTradeDesc', '这笔记录只会进入摊薄成本独立小工具,不会进入正式持仓、当日订单或波段记录。'),
      info: `${symbol} · ${typeLabel} ${sharesNum.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${t(language, 'trades.shares', '股')} @ ${priceNum.toFixed(2)} · ${tradeDraft.date || '--'}`,
      confirmText: t(language, 'trades.confirmSave', '确认保存'),
      confirmStyle: 'primary',
      icon: '!',
      onConfirm: async () => {
        if (costBasisSubmittingRef.current) return;
        const tradeRecord = {
          id: 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          date: tradeDraft.date,
          type,
          price: priceNum,
          shares: sharesNum,
        };
        costBasisSubmittingRef.current = true;
        setCostBasisSubmitting(true);
        setCostBasisData(prev => ({
          ...prev,
          [symbol]: [...(prev[symbol] || []), tradeRecord],
        }));
        try {
          await db.insertCostBasisTrade(symbol, tradeRecord);
          setCostBasisNewTrade({ type: 'buy', price: '', shares: '', date: localDateKey() });
          setShowCostBasisTrade(false);
        } catch (e) {
          setCostBasisData(prev => ({
            ...prev,
            [symbol]: (prev[symbol] || []).filter(item => item.id !== tradeRecord.id),
          }));
          showConfirm({
            title: t(language, 'trades.saveCostTradeFailed', '保存摊薄成本交易失败'),
            desc: e.message || String(e),
            confirmText: t(language, 'trades.close', '关闭'),
            confirmStyle: 'primary',
            icon: '!',
            showCancel: false,
          });
        } finally {
          costBasisSubmittingRef.current = false;
          setCostBasisSubmitting(false);
        }
      },
    });
  };

  const deleteStockTradeRecord = async (id) => {
    try {
      await db.deleteStockTrade(id);
      setStockTrades(current => current.filter(t => String(t.id) !== String(id)));
      void recalculatePnlReportAfterLedgerMutation();
      void recalculateCompetitionAfterLedgerMutation();
    } catch (e) {
      alert('删除订单失败:' + e.message);
      throw e;
    }
  };

  const deleteTrade = async (id) => {
    try {
      await db.deleteTrade(id);
      setTrades(trades.filter(t => t.id !== id));
    } catch (e) {
      alert('删除失败:' + e.message);
    }
  };

  const requestDeleteLegacyTrade = (tradeId) => {
    const trade = trades.find(item => String(item.id) === String(tradeId));
    if (!trade) return;
    const isBuy = !trade.side || trade.side === 'buy';
    const amount = Number(trade.shares) * Number(trade.price);
    const tradeName = displayStockName(trade.symbol, trade.name, language);
    const typeLabel = isBuy
      ? t(language, 'trades.buyShort', '买')
      : t(language, 'trades.sellShort', '卖');
    showConfirm({
      title: t(language, 'trades.confirmDeleteThisTrade', '确定删除这笔交易?'),
      desc: t(language, 'trades.deleteCannotRecover', '删除后无法恢复'),
      info: `${typeLabel} · ${trade.symbol || 'TQQQ'}${tradeName ? ` ${tradeName}` : ''} · ${trade.date || '—'} · ${trade.shares}${t(language, 'trades.shares', '股')} @${formatWaveUsdPrice(trade.price)} · ${signedWaveCurrencyAmount(isBuy ? -amount : amount, 0)}`,
      confirmText: t(language, 'trades.delete', '删除'),
      confirmStyle: 'danger',
      icon: '🗑',
      onConfirm: async () => {
        await deleteTrade(trade.id);
      },
    });
  };

  const updateStockPrice = (symbol, field, value) => {
    const newList = watchlist.map(s => s.symbol === symbol ? { ...s, [field]: parseFloat(value) || 0 } : s);
    setWatchlist(newList);
    if (symbol === 'QQQ' && field === 'price') setQqqCurrent(parseFloat(value) || 0);
    // 防抖 useEffect 会自动保存到云端,不需要手动调 db
  };

  const reorderWatchlist = async (nextList) => {
    const normalizedList = Array.isArray(nextList)
      ? nextList.filter((item) => normalizeSymbolKey(item?.symbol))
      : [];
    const nextOrder = normalizeWatchlistOrder(normalizedList.map((item) => item?.symbol));
    const previousList = watchlist;
    const previousOrder = watchlistOrder;
    setWatchlist(normalizedList);
    setWatchlistOrder(nextOrder);
    try {
      await db.upsertSettings(buildSettingsPayload({ watchlistOrder: nextOrder }));
      return { success: true };
    } catch (e) {
      console.error('[自选排序] 云端失败:', e);
      setWatchlist(previousList);
      setWatchlistOrder(previousOrder);
      return { success: false, error: e.message || '自选排序保存失败' };
    }
  };

  const deleteWatchlistItem = async (symbolInput) => {
    const symbol = normalizeSymbolKey(symbolInput);
    if (!symbol) return { success: false, error: '股票代码无效' };
    const previousList = watchlist;
    const previousOrder = watchlistOrder;
    const previousQuoteCache = quoteCache;
    const nextList = watchlist.filter((item) => normalizeSymbolKey(item?.symbol) !== symbol);
    const nextOrder = normalizeWatchlistOrder(nextList.map((item) => item?.symbol));
    setWatchlist(nextList);
    setWatchlistOrder(nextOrder);
    const stillHeld = stockTrades.some((trade) => normalizeSymbolKey(trade?.symbol) === symbol);
    if (!stillHeld) {
      setQuoteCache((current) => current.filter((item) => normalizeSymbolKey(item?.symbol) !== symbol));
    }
    if (editingStock === symbol) setEditingStock(null);
    try {
      await db.removeWatchlistItem(symbol);
      await db.upsertSettings(buildSettingsPayload({ watchlistOrder: nextOrder }));
      return { success: true };
    } catch (e) {
      console.error('[删除股票] 云端失败:', e);
      setWatchlist(previousList);
      setWatchlistOrder(previousOrder);
      setQuoteCache(previousQuoteCache);
      return { success: false, error: e.message || `删除 ${symbol} 失败` };
    }
  };

  const saveWatchlistStockTarget = async (symbolInput, targetPriceUsdInput) => {
    const symbol = normalizeStrictSymbolKey(symbolInput);
    const targetPriceUsd = Number(targetPriceUsdInput);
    if (!symbol || !Number.isFinite(targetPriceUsd) || targetPriceUsd <= 0) {
      return { success: false, error: '目标价无效' };
    }
    try {
      await db.updateWatchlistTargetPrice(symbol, targetPriceUsd);
      setWatchlist((current) => current.map((item) => (
        normalizeSymbolKey(item?.symbol) === symbol
          ? { ...item, targetPriceUsd }
          : item
      )));
      return { success: true, targetPriceUsd };
    } catch (e) {
      console.error(`[自选目标价 ${symbol}] 云端失败:`, e);
      return { success: false, error: e.message || '目标价保存失败' };
    }
  };

  const addStock = async (stockDraft = null) => {
    const draft = stockDraft && typeof stockDraft === 'object'
      ? { ...newStock, ...stockDraft }
      : newStock;
    if (!draft.symbol) {
      return { success: false, error: '请填写股票代码' };
    }
    const symbol = normalizeStrictSymbolKey(draft.symbol);
    if (!symbol) {
      return { success: false, error: '股票代码格式不正确,不要包含空格或特殊字符' };
    }
    if (watchlist.find(s => s.symbol === symbol)) {
      return { success: false, error: `${symbol} 已在自选中` };
    }
    let fresh = null;
    try {
      const r = await fetchQuote(symbol, { fresh: true });
      const result = await r.json().catch(() => ({}));
      if (!r.ok || !result?.success) {
        return {
          success: false,
          error: t(language, 'home.stockValidateFailed', '股票代码校验失败,请稍后重试'),
        };
      }
      fresh = result?.data?.find(d => String(d?.symbol || '').toUpperCase() === symbol) || null;
      if (!fresh || fresh.error || !(Number(fresh.price) > 0) || fresh.priceSource !== 'EODHD-v2') {
        return {
          success: false,
          error: t(language, 'home.stockNotFound', '未找到这个美股代码,暂不能添加'),
        };
      }
    } catch (e) {
      console.warn(`[添加自选 ${symbol}] 行情预拉取失败:`, e.message);
      return {
        success: false,
        error: t(language, 'home.stockValidateFailed', '股票代码校验失败,请稍后重试'),
      };
    }
    const price = parseFloat(draft.price) || fresh?.price || 0;
    const high = parseFloat(draft.high) || fresh?.week52High || fresh?.high || price;
    const logoURL = normalizeExternalLogoUrl(draft.logoURL || draft.logoUrl || fresh?.logoURL || fresh?.logoUrl);
    const newItem = {
      symbol,
      name: displayStockName(symbol, draft.name || fresh?.name),
      price,
      high,
      cost: parseFloat(draft.cost) || 0,
      shares: parseInt(draft.shares) || 0,
      previousClose: fresh?.previousClose || 0,
      dailyBaselineClose: fresh?.dailyBaselineClose || fresh?.previousClose || 0,
      dailyBaselineDate: fresh?.dailyBaselineDate || '',
      dailyBaselineSource: fresh?.dailyBaselineSource || '',
      dailyPnlPrice: fresh?.dailyPnlPrice || 0,
      dailyPnlPriceDate: fresh?.dailyPnlPriceDate || '',
      dailyPnlBaselineClose: fresh?.dailyPnlBaselineClose || fresh?.dailyBaselineClose || fresh?.previousClose || 0,
      dailyPnlBaselineDate: fresh?.dailyPnlBaselineDate || fresh?.dailyBaselineDate || '',
      dailyPnlBaselineSource: fresh?.dailyPnlBaselineSource || fresh?.dailyBaselineSource || '',
      dailyPnlChange: fresh?.dailyPnlChange ?? null,
      dailyPnlChangePercent: fresh?.dailyPnlChangePercent ?? null,
      dailyPnlLocked: Boolean(fresh?.dailyPnlLocked),
      dailyPnlSession: fresh?.dailyPnlSession || '',
      dailyPnlSource: fresh?.dailyPnlSource || '',
      sessionPreviousClose: fresh?.sessionPreviousClose || 0,
      providerPreviousClose: fresh?.providerPreviousClose || 0,
      changePercent: fresh?.changePercent || 0,
      ytdChangePercent: fresh?.ytdChangePercent || 0,
      intraday: fresh?.intraday || [],
      ...(logoURL ? { logoURL } : {}),
    };
    // 🚨 立刻同步到云端 (不等防抖,精确单条写入)
    try {
      await db.upsertWatchlistItem(newItem);
    } catch (e) {
      console.error('[添加股票] 云端失败:', e);
      return { success: false, error: `添加 ${symbol} 失败: ${e.message}` };
    }
    const nextOrder = normalizeWatchlistOrder([
      ...watchlistOrder,
      ...watchlist.map((item) => item?.symbol),
      symbol,
    ]);
    setWatchlist(current => (
      current.some(item => String(item?.symbol || '').toUpperCase() === symbol)
        ? current
        : [...current, newItem]
    ));
    setWatchlistOrder(nextOrder);
    setQuoteCache(current => {
      const next = current.filter(item => item.symbol !== symbol);
      return [...next, newItem];
    });
    db.upsertSettings(buildSettingsPayload({ watchlistOrder: nextOrder }))
      .catch((e) => console.error('[添加股票] 自选排序保存失败:', e));
    if (logoURL) cacheStockLogo(symbol, logoURL);
    setNewStock({ symbol: '', name: '', price: '', high: '', cost: '0', shares: '0' });
    setShowAddStock(false);
    return { success: true, item: newItem };
  };

  const removeStock = (symbol) => {
    showConfirm({
      title: `删除 ${symbol}?`,
      desc: '此操作不可撤销, 该股票的关注信息将从列表中移除',
      info: symbol,
      confirmText: '删除',
      onConfirm: async () => {
        const result = await deleteWatchlistItem(symbol);
        if (!result?.success) alert(result?.error || `删除 ${symbol} 失败`);
      },
    });
  };

  const buildQuoteRowsFromCloudResult = useCallback((result) => {
    const cloudStockRows = Array.isArray(result?.stockTrades)
      ? result.stockTrades.map(localizeStockNameRow)
      : localizedStockTrades;
    const cloudWatchlistRows = Array.isArray(result?.watchlist)
      ? orderWatchlistRows(result.watchlist, normalizeWatchlistOrder(result?.settings?.watchlistOrder)).map(localizeStockNameRow)
      : localizedWatchlist;
    const cloudQuoteRows = buildLedgerQuoteUniverse(
      cloudStockRows,
      cloudWatchlistRows,
      localizedQuoteCache,
      toolQuoteRows,
    ).allRows;
    return buildQuoteBaselineRows({
      candidateRows: cloudQuoteRows,
      stockTrades: cloudStockRows,
      watchlist: cloudWatchlistRows,
      activeSwingRows: swingWaveQuoteRows,
    });
  }, [localizedQuoteCache, localizedStockTrades, localizedWatchlist, swingWaveQuoteRows, toolQuoteRows]);

  // 一键拉取实时行情(从 Vercel API)
  const fetchRealtimePrices = async (rowsOverride = null, options = {}) => {
    const requestOptions = (options && typeof options === 'object') ? options : {};
    const trigger = requestOptions.trigger || 'auto';
    const notifyOnError = requestOptions.notifyOnError === true;
    const startedAt = Date.now();
    const forceBaseline = requestOptions.forceBaseline === true;
    const baselineDate = new Date(startedAt);
    const baselineSession = getQuoteBaselineSession(baselineDate, getUsMarketSession(baselineDate));
    const closeSettlementKey = getQuoteCloseSettlementKey({ session: baselineSession, now: startedAt });
    const rowsForQuote = Array.isArray(rowsOverride)
      ? rowsOverride
      : (Array.isArray(quoteBaselineRowsRef.current) ? quoteBaselineRowsRef.current : quoteBaselineRows);
    const coreSymbols = ['QQQ', 'TQQQ'];
    const baselineUniverseKey = buildQuoteBaselineUniverseKey(rowsForQuote, coreSymbols);
    const universeExpanded = requestOptions.allowBaselineExpansion === true
      && isQuoteBaselineUniverseExpansion(
        quoteBaselineRefreshRef.current.lastAttemptUniverseKey,
        baselineUniverseKey,
        {
          previousRowCount: quoteBaselineRefreshRef.current.lastAttemptRowCount,
          nextRowCount: rowsForQuote.length,
        },
      );
    const queuePendingRefresh = () => {
      const currentPending = pendingQuoteRefreshRef.current;
      const currentPriority = currentPending?.options?.forceBaseline === true
        ? 3
        : (currentPending?.options?.allowBaselineExpansion === true ? 2 : 1);
      const nextPriority = forceBaseline ? 3 : (universeExpanded ? 2 : 1);
      if (currentPending && currentPriority > nextPriority) return false;
      pendingQuoteRefreshRef.current = {
        rowsOverride: Array.isArray(rowsOverride) ? rowsOverride : null,
        options: {
          ...requestOptions,
          queueIfBusy: false,
        },
      };
      return true;
    };
    let requestedSymbols = [];
    let responseStatus = 0;
    let responseResult = null;
    const shouldRunBaseline = shouldRunQuoteBaselineRefresh({
      session: baselineSession,
      now: startedAt,
      lastSuccessAt: quoteBaselineRefreshRef.current.lastSuccessAt,
      lastAttemptAt: quoteBaselineRefreshRef.current.lastAttemptAt,
      lastAttemptSession: quoteBaselineRefreshRef.current.lastAttemptSession,
      lastCloseSettlementKey: quoteBaselineRefreshRef.current.lastCloseSettlementKey,
      universeExpanded,
      force: forceBaseline,
    });
    if (!shouldRunBaseline) {
      if (shouldQueueQuoteBaselineExpansion({
        fetchInFlight: quoteFetchInFlightRef.current,
        queueIfBusy: requestOptions.queueIfBusy === true,
        universeExpanded,
      })) {
        queuePendingRefresh();
        return { ok: true, skipped: true, queued: true, reason: 'baseline-expansion-queued' };
      }
      return { ok: true, skipped: true, reason: 'baseline-not-due' };
    }
    if (quoteFetchInFlightRef.current) {
      if (requestOptions.queueIfBusy === true) {
        queuePendingRefresh();
      }
      return { ok: true, skipped: true };
    }
    quoteBaselineRefreshRef.current.lastAttemptAt = startedAt;
    quoteBaselineRefreshRef.current.lastAttemptSession = baselineSession;
    quoteBaselineRefreshRef.current.lastAttemptUniverseKey = baselineUniverseKey;
    quoteBaselineRefreshRef.current.lastAttemptRowCount = rowsForQuote.length;
    if (closeSettlementKey) {
      quoteBaselineRefreshRef.current.lastCloseSettlementKey = closeSettlementKey;
    }
    quoteFetchInFlightRef.current = true;
    setFetching(true);
    if (notifyOnError) setFetchError(null);
    try {
      // v10.7.9.41: 显式把 QQQ/TQQQ 加进请求 (走完整 stock 接口, 有真实 week52High)
      // 之前只请求 watchlist+VIX+FGI+INDICES, QQQ 数据藏在 INDICES 里但只有 dayHigh 没有 52周高
      // 导致 qqqHigh 永远停在写死的初始值 640.47, 猎手状态回撤算不准
      // Set 去重: 当前持仓、自选、活跃波段与核心标的若重复不会重复请求
      const symbolSet = new Set([...rowsForQuote.map(s => normalizeSymbolKey(s?.symbol)).filter(Boolean), ...coreSymbols]);
      requestedSymbols = [...symbolSet, 'VIX', 'FGI', 'INDICES'];
      const resultRows = [];
      for (const batch of buildQuoteSymbolBatches(requestedSymbols)) {
        const r = await fetchQuote(batch.join(','), { fresh: true });
        responseStatus = r.status;
        const batchResult = await r.json().catch(() => ({}));
        responseResult = batchResult;
        if (!r.ok) {
          throw new Error(batchResult.error || `行情接口返回 ${r.status}`);
        }
        if (!batchResult.success) {
          throw new Error(batchResult.error || '拉取失败');
        }
        if (Array.isArray(batchResult.data)) resultRows.push(...batchResult.data);
      }
      const result = { success: true, data: resultRows };
      responseStatus = 200;
      responseResult = result;

      const providerErrors = collectQuoteProviderErrors(resultRows);
      if (providerErrors.length > 0) {
        const diagnostic = buildQuoteDiagnosticEntry({
          trigger,
          notifyOnError,
          symbols: requestedSymbols,
          rowsCount: rowsForQuote.length,
          status: responseStatus,
          result,
          durationMs: Date.now() - startedAt,
        });
        if (shouldRecordQuoteDiagnosticEntry(diagnostic)) {
          recordQuoteDiagnosticLog(diagnostic);
        }
      }
      const resultBySymbol = new Map(
        resultRows.map((item) => [String(item?.symbol || '').toUpperCase(), item]),
      );
      const hasUsableBaselineQuote = [...symbolSet].some((symbol) => {
        const row = resultBySymbol.get(symbol);
        return !row?.error && Number(row?.price) > 0;
      });
      if (hasUsableBaselineQuote) {
        quoteBaselineRefreshRef.current.lastSuccessAt = Date.now();
      }

      // 更新股票价格
      // 行情全集写入独立 quoteCache;watchlist 只保存用户主动自选,不能被持仓股票污染。
      if (rowsForQuote.length === 0) {
        // 只更新指数/VIX/FGI, 不动股票列表
      } else {
        const updatedQuotes = rowsForQuote.map(s => {
          const fresh = resultBySymbol.get(String(s?.symbol || '').toUpperCase());
          if (fresh && fresh.price > 0) {
            // 52 周高的优先级:
            // - Yahoo (前复权) 或 EODHD-adjusted (我们自己算的复权) → 直接覆盖本地
            //   (跟主流软件一致, 解决拆股问题)
            // - Finnhub 或 fallback → 跟本地取 max
            let newHigh;
            if ((fresh.highSource === 'yahoo' || fresh.highSource === 'eodhd-adjusted') && fresh.week52High > 0) {
              // 权威数据,直接用,不跟本地比 max(避免拆股前的旧高价残留)
              newHigh = Math.max(fresh.week52High, fresh.price);
            } else {
              // Finnhub 或 fallback,保守起见跟本地取 max
              newHigh = Math.max(s.high || 0, fresh.week52High || 0, fresh.price);
            }
            return {
              ...s,
              price: fresh.price,
              high: newHigh,
              logoURL: normalizeExternalLogoUrl(fresh.logoURL || fresh.logoUrl) || s.logoURL,
              // 保存当天分时(用于心电图)
              intraday: fresh.intraday || s.intraday || [],
              // 保存昨收(用于当日涨跌色)
              previousClose: fresh.previousClose || s.previousClose || 0,
              dailyBaselineClose: fresh.dailyBaselineClose || fresh.previousClose || s.dailyBaselineClose || s.previousClose || 0,
              dailyBaselineDate: fresh.dailyBaselineDate || s.dailyBaselineDate || '',
              dailyBaselineSource: fresh.dailyBaselineSource || s.dailyBaselineSource || '',
              dailyPnlPrice: fresh.dailyPnlPrice || s.dailyPnlPrice || 0,
              dailyPnlPriceDate: fresh.dailyPnlPriceDate || s.dailyPnlPriceDate || '',
              dailyPnlBaselineClose: fresh.dailyPnlBaselineClose || fresh.dailyBaselineClose || fresh.previousClose || s.dailyPnlBaselineClose || s.dailyBaselineClose || s.previousClose || 0,
              dailyPnlBaselineDate: fresh.dailyPnlBaselineDate || fresh.dailyBaselineDate || s.dailyPnlBaselineDate || s.dailyBaselineDate || '',
              dailyPnlBaselineSource: fresh.dailyPnlBaselineSource || fresh.dailyBaselineSource || s.dailyPnlBaselineSource || s.dailyBaselineSource || '',
              dailyPnlChange: fresh.dailyPnlChange ?? s.dailyPnlChange ?? null,
              dailyPnlChangePercent: fresh.dailyPnlChangePercent ?? s.dailyPnlChangePercent ?? null,
              dailyPnlLocked: Boolean(fresh.dailyPnlLocked),
              dailyPnlSession: fresh.dailyPnlSession || s.dailyPnlSession || '',
              dailyPnlSource: fresh.dailyPnlSource || s.dailyPnlSource || '',
              sessionPreviousClose: fresh.sessionPreviousClose || s.sessionPreviousClose || 0,
              providerPreviousClose: fresh.providerPreviousClose || s.providerPreviousClose || 0,
              // 保存当日涨跌
              changePercent: fresh.changePercent || 0,
              // 保存年初至今涨跌
              ytdChangePercent: fresh.ytdChangePercent || 0,
            };
          }
          return s;
        });
        setQuoteCache((current) => {
          const mergedBaselineRows = mergeQuoteBaselineRows(current, updatedQuotes);
          return mergeFreshStockTicksIntoQuoteRows(
            mergeFreshStockRealtimeRows(mergedBaselineRows, current),
          );
        });
      }

      // 同步 QQQ 到核心信号参数
      const qqqData = resultBySymbol.get('QQQ');
      if (qqqData?.price > 0) {
        setQqqCurrent(qqqData.price);
        // v10.7.9.41: QQQ 52周高直接信任 API 的 week52High (本身就是滚动52周最高)
        // 之前 Math.max(prev, 当前价) 不读 API, 导致 high 被锁死在初始值 640.47, 回撤算不准
        // 不用 Math.max(prev) 粘滞: 避免某次脏数据把 high 永久顶死降不下来
        const qqqApiHigh = qqqData.week52High || qqqData.high || 0;
        const qqqResolvedHigh = Math.max(qqqApiHigh || 0, qqqData.price);
        setQqqSignalQuote({
          ...qqqData,
          symbol: 'QQQ',
          name: qqqData.name || 'QQQ',
          high: qqqResolvedHigh,
          week52High: qqqResolvedHigh,
        });
        if (qqqApiHigh > 0) {
          setQqqHigh(Math.max(qqqApiHigh, qqqData.price));
        } else {
          // API 没给 high 时才退回老逻辑 (至少不低于当前价)
          setQqqHigh(prev => Math.max(prev, qqqData.price));
        }
      }

      // 更新 VIX
      const vixData = resultBySymbol.get('VIX');
      if (vixData?.price > 0) {
        setVix(vixData.price);
        if (vixData.dataDate) setVixDataDate(vixData.dataDate);
      }

      // 更新 FGI
      const fgiData = resultBySymbol.get('FGI');
      if (fgiData && typeof fgiData.price === 'number' && !fgiData.error) {
        setFgi(fgiData.price);
        if (fgiData.label) setFgiLabel(fgiData.label);
        if (fgiData.previousClose !== null) setFgiPrev(fgiData.previousClose);
        if (fgiData.weekAgo !== null) setFgiWeek(fgiData.weekAgo);
        if (fgiData.monthAgo !== null) setFgiMonth(fgiData.monthAgo);
        if (fgiData.yearAgo !== null) setFgiYear(fgiData.yearAgo);
        if (fgiData.dataDate) setFgiDataDate(fgiData.dataDate);
      }

      // 更新三大指数
      const indicesData = resultBySymbol.get('INDICES');
      if (indicesData?.data && Array.isArray(indicesData.data)) {
        const chartOptions = getIndexChartOptions();
        setMarketIndices((current) => mergeFreshIndexTicksIntoCards(
          mergeIndexRestCardsIntoMarketCards(current, indicesData.data, 'fallback', chartOptions),
        ));
      }

      setLastFetched(new Date());
      return { ok: true };
    } catch (e) {
      const message = formatRealtimeFetchError(e);
      const diagnostic = buildQuoteDiagnosticEntry({
        trigger,
        notifyOnError,
        symbols: requestedSymbols,
        rowsCount: rowsForQuote.length,
        status: responseStatus,
        result: responseResult,
        error: e,
        durationMs: Date.now() - startedAt,
      });
      console.warn('[行情拉取] 失败:', e);
      console.warn('[行情诊断]', diagnostic);
      if (shouldRecordQuoteDiagnosticEntry(diagnostic)) {
        recordQuoteDiagnosticLog(diagnostic);
      } else {
        console.info('[行情诊断] 自动网络抖动已忽略,不写入设置页日志:', diagnostic);
      }
      if (notifyOnError) setFetchError(message);
      return { ok: false, error: message };
    } finally {
      quoteFetchInFlightRef.current = false;
      setFetching(false);
      const pending = pendingQuoteRefreshRef.current;
      if (pending) {
        pendingQuoteRefreshRef.current = null;
        setTimeout(() => {
          fetchRealtimePrices(pending.rowsOverride, pending.options);
        }, 0);
      }
    }
  };

  const requestQuickQuoteRefresh = (rowsOverride = null, options = {}) => {
    const requestOptions = (options && typeof options === 'object') ? options : {};
    const allowBaselineExpansion = requestOptions.allowBaselineExpansion === true;
    if (
      typeof window === 'undefined'
      || (document.hidden && !allowBaselineExpansion)
    ) return;
    const minIntervalMs = Number.isFinite(requestOptions.minIntervalMs)
      ? requestOptions.minIntervalMs
      : QUICK_QUOTE_REFRESH_MIN_INTERVAL_MS;
    const now = Date.now();
    const elapsed = now - quickQuoteRefreshRef.current.lastAt;
    const delayMs = requestOptions.force ? 0 : Math.max(0, minIntervalMs - elapsed);
    const dueAt = now + delayMs;
    const priority = requestOptions.forceBaseline === true
      ? 3
      : ((allowBaselineExpansion || requestOptions.force) ? 2 : 1);

    if (quickQuoteRefreshRef.current.timer) {
      const currentDueAt = quickQuoteRefreshRef.current.dueAt || 0;
      const currentPriority = quickQuoteRefreshRef.current.priority || 0;
      if (
        currentPriority > priority
        || (currentPriority === priority && currentDueAt > 0 && currentDueAt <= dueAt)
      ) {
        return;
      }
      clearTimeout(quickQuoteRefreshRef.current.timer);
      quickQuoteRefreshRef.current.timer = null;
    }

    quickQuoteRefreshRef.current.dueAt = dueAt;
    quickQuoteRefreshRef.current.priority = priority;
    quickQuoteRefreshRef.current.timer = setTimeout(() => {
      quickQuoteRefreshRef.current.timer = null;
      quickQuoteRefreshRef.current.dueAt = 0;
      quickQuoteRefreshRef.current.priority = 0;
      quickQuoteRefreshRef.current.lastAt = Date.now();
      fetchRealtimePrices(rowsOverride, {
        trigger: requestOptions.trigger || 'auto-visible',
        notifyOnError: requestOptions.notifyOnError === true,
        queueIfBusy: true,
        forceBaseline: requestOptions.forceBaseline === true,
        allowBaselineExpansion: requestOptions.allowBaselineExpansion === true,
      });
    }, delayMs);
  };

  const requestRealtimeResumeReconnect = useCallback((options = {}) => {
    if (typeof document === 'undefined' || document.hidden) return;
    const reconnectOptions = (options && typeof options === 'object') ? options : {};
    realtimeResumeReconnectHandlersRef.current.forEach((handler) => {
      try {
        handler(reconnectOptions);
      } catch (e) {
        console.warn('[Realtime] resume reconnect handler failed:', e?.message || e);
      }
    });
  }, []);

  const requestIosPwaAppShellUpdateCheck = () => {
    if (typeof window === 'undefined' || !isIosStandaloneWebApp()) return false;
    if (pwaAppShellReloadQueuedRef.current || pwaAppShellCheckInFlightRef.current) return false;
    const now = Date.now();
    if (now - pwaLastAppShellCheckAtRef.current < IOS_PWA_APP_SHELL_CHECK_MIN_INTERVAL_MS) return false;
    pwaLastAppShellCheckAtRef.current = now;
    pwaAppShellCheckInFlightRef.current = true;
    checkForAppShellUpdate()
      .then((hasNewAppShell) => {
        if (!hasNewAppShell) return;
        pwaAppShellReloadQueuedRef.current = true;
        setTimeout(reloadAppShellWithFreshHtml, 80);
      })
      .catch((e) => {
        console.warn('[iOS PWA] App Shell 更新检查失败:', e);
      })
      .finally(() => {
        pwaAppShellCheckInFlightRef.current = false;
      });
    return true;
  };

  const queueIosPwaResumeQuoteRefresh = (trigger = 'auto-ios-resume', delayMs = IOS_PWA_VISIBLE_RETRY_MS, options = {}) => {
    if (typeof window === 'undefined') return;
    pendingPwaResumeRefreshRef.current = buildPwaResumeRequest(trigger, options);
    if (pwaResumeRetryTimerRef.current) {
      clearTimeout(pwaResumeRetryTimerRef.current);
      pwaResumeRetryTimerRef.current = null;
    }
    pwaResumeRetryTimerRef.current = window.setTimeout(() => {
      pwaResumeRetryTimerRef.current = null;
      const pendingRequest = readPwaResumeRequest(pendingPwaResumeRefreshRef.current);
      if (
        document.hidden
        && pwaResumeRetryDeadlineRef.current > 0
        && Date.now() > pwaResumeRetryDeadlineRef.current
      ) {
        return;
      }
      if (pendingRequest) requestIosPwaResumeQuoteRefresh(pendingRequest.trigger, {
        resetFreshness: pendingRequest.resetFreshness,
      });
    }, Math.max(0, delayMs));
  };

  const requestIosPwaResumeQuoteRefresh = (trigger = 'auto-ios-resume', options = {}) => {
    if (typeof window === 'undefined') return;
    if (pwaAppShellReloadQueuedRef.current) return;
    requestIosPwaAppShellUpdateCheck();
    const nextTrigger = trigger || 'auto-ios-resume';
    const resetFreshness = options?.resetFreshness !== false;
    if (document.hidden) {
      if (!pwaResumeRetryDeadlineRef.current) {
        pwaResumeRetryDeadlineRef.current = Date.now() + IOS_PWA_VISIBLE_RETRY_MAX_MS;
      }
      if (Date.now() <= pwaResumeRetryDeadlineRef.current) {
        queueIosPwaResumeQuoteRefresh(nextTrigger, IOS_PWA_VISIBLE_RETRY_MS, { resetFreshness });
      }
      return;
    }
    pwaResumeRetryDeadlineRef.current = 0;
    if (cloudLoadingRef.current) {
      pendingPwaResumeRefreshRef.current = buildPwaResumeRequest(nextTrigger, { resetFreshness });
      return;
    }
    const now = Date.now();
    const elapsed = now - pwaLastResumeRefreshAtRef.current;
    if (elapsed < IOS_PWA_RESUME_REFRESH_THROTTLE_MS) {
      queueIosPwaResumeQuoteRefresh(nextTrigger, IOS_PWA_RESUME_REFRESH_THROTTLE_MS - elapsed, { resetFreshness });
      return;
    }
    pendingPwaResumeRefreshRef.current = null;
    pwaLastResumeRefreshAtRef.current = now;
    if (isIosStandaloneWebApp() && iosPwaRealtimeSnapshotBurstRef.current(nextTrigger, { resetFreshness })) {
      return;
    }
    requestQuickQuoteRefresh(null, {
      trigger: nextTrigger,
      minIntervalMs: 0,
      notifyOnError: false,
    });
    requestRealtimeResumeReconnect({ force: true, trigger: nextTrigger });
  };

  useEffect(() => {
    cloudLoadingRef.current = cloudLoading;
    if (cloudLoading) return;
    if (!pendingPwaResumeRefreshRef.current) return;
    const pendingRequest = readPwaResumeRequest(pendingPwaResumeRefreshRef.current);
    pendingPwaResumeRefreshRef.current = null;
    if (!pendingRequest) return;
    requestIosPwaResumeQuoteRefresh(
      pendingRequest.trigger === 'auto-ios-touch-resume' ? pendingRequest.trigger : 'auto-ios-resume-cloud',
      { resetFreshness: pendingRequest.resetFreshness },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudLoading]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    if (!isIosStandaloneWebApp()) return undefined;

    let isActive = true;
    const markForegroundHeartbeat = () => {
      foregroundHeartbeatAtRef.current = Date.now();
    };
    const requestResumeRefresh = (trigger, options = {}) => {
      if (!isActive) return;
      const shouldResetFreshness = options?.resetFreshness === true || Boolean(pwaHiddenAtRef.current);
      if (!document.hidden) {
        markForegroundHeartbeat();
        pwaHiddenAtRef.current = 0;
      } else if (!pwaHiddenAtRef.current) {
        pwaHiddenAtRef.current = Date.now();
      }
      requestIosPwaResumeQuoteRefresh(trigger, { resetFreshness: shouldResetFreshness });
    };

    markForegroundHeartbeat();
    const heartbeatTimer = window.setInterval(() => {
      if (document.hidden) return;
      markForegroundHeartbeat();
      const stockLastTickAt = stockRealtimeRef.current.lastWebSocketTickAt || 0;
      if (!stockLastTickAt || Date.now() - stockLastTickAt > REALTIME_STALE_MS) {
        requestRealtimeResumeReconnect({ force: true, trigger: 'auto-ios-visible-heartbeat' });
      }
    }, IOS_PWA_FOREGROUND_HEARTBEAT_MS);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pwaHiddenAtRef.current = Date.now();
        return;
      }
      requestResumeRefresh('auto-ios-resume', { resetFreshness: true });
    };
    const handlePageHide = () => {
      pwaHiddenAtRef.current = Date.now();
    };
    const handlePageShow = (event) => requestResumeRefresh('auto-ios-resume', { resetFreshness: event?.persisted === true });
    const handleFocus = () => requestResumeRefresh('auto-ios-resume', { resetFreshness: false });
    const handleOnline = () => requestResumeRefresh('auto-ios-online', { resetFreshness: true });
    const handleTouchResume = () => {
      const now = Date.now();
      if (now - pwaLastTouchResumeAtRef.current < IOS_PWA_TOUCH_RESUME_THROTTLE_MS) return;
      pwaLastTouchResumeAtRef.current = now;
      if (!document.hidden) {
        markForegroundHeartbeat();
        pwaHiddenAtRef.current = 0;
      } else if (!pwaHiddenAtRef.current) {
        pwaHiddenAtRef.current = now;
      }
      requestIosPwaResumeQuoteRefresh('auto-ios-touch-resume', { resetFreshness: false });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pointerdown', handleTouchResume, { passive: true });
    window.addEventListener('touchstart', handleTouchResume, { passive: true });

    return () => {
      isActive = false;
      window.clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pointerdown', handleTouchResume);
      window.removeEventListener('touchstart', handleTouchResume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  quoteRefreshFromCloudResultRef.current = (result) => {
    const cloudBaselineRows = buildQuoteRowsFromCloudResult(result);
    if (isIosStandaloneWebApp()) {
      const snapshotStarted = iosPwaRealtimeSnapshotBurstRef.current(
        'auto-ios-pwa-snapshot-cloud',
        { resetFreshness: true },
      );
      if (!snapshotStarted) {
        pendingPwaResumeRefreshRef.current = buildPwaResumeRequest(
          'auto-ios-pwa-snapshot-cloud',
          { resetFreshness: true },
        );
      }
    }
    // Realtime snapshots restore prices, but the full quote baseline also carries
    // the completed-close fields required by locked daily P&L. The expansion gate
    // makes this a single startup follow-up only when cloud holdings add missing symbols.
    requestQuickQuoteRefresh(cloudBaselineRows, {
      trigger: 'auto-start-cloud',
      minIntervalMs: 0,
      allowBaselineExpansion: true,
    });
  };

  useEffect(() => () => {
    if (quickQuoteRefreshRef.current.timer) {
      clearTimeout(quickQuoteRefreshRef.current.timer);
      quickQuoteRefreshRef.current.timer = null;
      quickQuoteRefreshRef.current.dueAt = 0;
      quickQuoteRefreshRef.current.priority = 0;
    }
    if (pwaResumeRetryTimerRef.current) {
      clearTimeout(pwaResumeRetryTimerRef.current);
      pwaResumeRetryTimerRef.current = null;
    }
    pwaResumeRetryDeadlineRef.current = 0;
    pendingQuoteRefreshRef.current = null;
    pendingPwaResumeRefreshRef.current = null;
    quoteRefreshFromCloudResultRef.current = null;
  }, []);

  const runGlobalPullRefresh = async () => {
    if (globalRefreshingRef.current) return;
    globalRefreshingRef.current = true;
    let appShellReloadQueued = false;
    if (pullRefreshResetTimerRef.current) {
      clearTimeout(pullRefreshResetTimerRef.current);
      pullRefreshResetTimerRef.current = null;
    }
    pullRefreshDistanceRef.current = PULL_REFRESH_THRESHOLD;
    setPullRefreshDistance(PULL_REFRESH_THRESHOLD);
    setPullRefreshStatus('refreshing');
    setFetchError(null);

    try {
      const hasNewAppShell = await checkForAppShellUpdate();
      if (hasNewAppShell) {
        appShellReloadQueued = true;
        pullRefreshDistanceRef.current = PULL_REFRESH_MAX_DISTANCE;
        setPullRefreshDistance(PULL_REFRESH_MAX_DISTANCE);
        setPullRefreshStatus('updating');
        setTimeout(reloadAppShellWithFreshHtml, 80);
        return;
      }

      const cloudResult = await db.fetchAllUserData();
      applyCloudUserData(cloudResult, '[全局刷新]');
      await fetchDailyFxRates({ force: true });
      await fetchRealtimePrices(buildQuoteRowsFromCloudResult(cloudResult), {
        trigger: 'manual-pull-refresh',
        notifyOnError: true,
        queueIfBusy: true,
        forceBaseline: true,
      });
      setPullRefreshStatus('done');
    } catch (e) {
      console.error('[全局刷新] 失败:', e);
      const message = e.message || '刷新失败';
      setCloudError(message);
      setFetchError(message);
      setPullRefreshStatus('idle');
    } finally {
      globalRefreshingRef.current = false;
      if (appShellReloadQueued) return;
      pullRefreshResetTimerRef.current = setTimeout(() => {
        pullRefreshDistanceRef.current = 0;
        setPullRefreshDistance(0);
        setPullRefreshStatus('idle');
      }, 520);
    }
  };

  runGlobalPullRefreshRef.current = runGlobalPullRefresh;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let startY = 0;
    let startX = 0;
    let startTarget = null;
    let touchStartedAtRootTop = false;
    let touchStartedInBlockedRegion = false;
    let tracking = false;

    const updateDistance = (distance) => {
      pullRefreshDistanceRef.current = distance;
      setPullRefreshDistance(distance);
      setPullRefreshStatus(distance >= PULL_REFRESH_THRESHOLD ? 'ready' : 'pulling');
    };

    const resetPull = () => {
      pullRefreshDistanceRef.current = 0;
      setPullRefreshDistance(0);
      setPullRefreshStatus('idle');
    };

    const getScrollTop = () => (
      window.scrollY
      || document.documentElement?.scrollTop
      || document.body?.scrollTop
      || 0
    );

    const isInternalScrollable = (node) => {
      if (!node || node === document.body || node === document.documentElement) return false;
      const style = window.getComputedStyle(node);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY || style.overflow || '');
      return canScrollY && node.scrollHeight > node.clientHeight + 1;
    };

    const isBlockedPullTarget = (target) => {
      if (!target?.closest) return false;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
      if (target.closest('[data-pull-refresh-block="true"]')) return true;

      let node = target instanceof Element ? target : target.parentElement;
      while (node && node !== document.body && node !== document.documentElement) {
        if (isInternalScrollable(node)) return true;
        node = node.parentElement;
      }
      return false;
    };

    const canStartPull = () => {
      if (globalRefreshingRef.current) return false;
      if (!touchStartedAtRootTop) return false;
      if (touchStartedInBlockedRegion) return false;
      if (getScrollTop() > PULL_REFRESH_ROOT_TOP_TOLERANCE) return false;
      if (document.body.style.position === 'fixed') return false;
      return true;
    };

    const handleTouchStart = (event) => {
      if (!event.touches?.length) return;
      const touch = event.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      startTarget = event.target;
      touchStartedAtRootTop = getScrollTop() <= PULL_REFRESH_ROOT_TOP_TOLERANCE;
      touchStartedInBlockedRegion = isBlockedPullTarget(startTarget);
      tracking = false;
    };

    const handleTouchMove = (event) => {
      if (!event.touches?.length) return;
      const touch = event.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = Math.abs(touch.clientX - startX);

      if (!tracking) {
        if (deltaY <= PULL_REFRESH_ACTIVATION_DISTANCE || deltaY < deltaX * 1.2 || !canStartPull()) return;
        tracking = true;
      }

      if (deltaY <= 0) {
        resetPull();
        return;
      }

      event.preventDefault();
      updateDistance(Math.min(PULL_REFRESH_MAX_DISTANCE, deltaY * 0.48));
    };

    const handleTouchEnd = () => {
      if (!tracking) return;
      const shouldRefresh = pullRefreshDistanceRef.current >= PULL_REFRESH_THRESHOLD;
      tracking = false;
      if (shouldRefresh) {
        runGlobalPullRefreshRef.current?.();
      } else {
        resetPull();
      }
    };

    const handleTouchCancel = () => {
      tracking = false;
      if (!globalRefreshingRef.current) resetPull();
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
      if (pullRefreshResetTimerRef.current) clearTimeout(pullRefreshResetTimerRef.current);
    };
  }, []);

  const fetchBtcRestFallback = useCallback(async () => {
    const ref = btcRealtimeRef.current;
    if (ref.lastTickAt && Date.now() - ref.lastTickAt < REALTIME_STALE_MS) return;
    const requestedAt = Date.now();
    try {
      const r = await fetchRealtimeSnapshot('/api/btc-realtime');
      const result = await r.json().catch(() => ({}));
      if (!r.ok || !result?.success) throw new Error(result?.error || 'BTC snapshot failed');
      const tick = result?.data?.tick;
      if (!tick?.price) return;
      if (ref.lastWebSocketTickAt >= requestedAt) return;
      applyBtcRealtimeTick(
        tick,
        resolveBtcSnapshotRealtimeStatus(result?.data),
        { transport: 'snapshot' },
      );
    } catch (e) {
      setBtcRealtimeError(e.message || 'BTC REST 兜底失败');
    }
  }, [applyBtcRealtimeTick, fetchRealtimeSnapshot]);

  useEffect(() => {
    if (cloudLoading || typeof window === 'undefined') return;
    let stopped = false;
    const ref = btcRealtimeRef.current;

    const clearReconnectTimer = () => {
      if (ref.reconnectTimer) {
        clearTimeout(ref.reconnectTimer);
        ref.reconnectTimer = null;
      }
    };

    const closeSocket = () => {
      if (ref.socket) {
        const closingSocket = ref.socket;
        ref.intentionalCloseSocket = closingSocket;
        try {
          closingSocket.close(1000, 'client reconnect');
        } catch {}
        ref.socket = null;
      }
    };

    const scheduleReconnect = (connect) => {
      if (stopped || document.hidden) return;
      clearReconnectTimer();
      const delay = ref.retryDelayMs;
      ref.retryDelayMs = Math.min(ref.retryDelayMs * 2, REALTIME_RECONNECT_MAX_MS);
      ref.reconnectTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (stopped || document.hidden) return;
      clearReconnectTimer();
      closeSocket();
      ref.lastConnectAttemptAt = Date.now();
      setBtcRealtimeStatus((status) => (status === 'live' ? status : 'connecting'));

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setBtcRealtimeStatus('disabled');
          setBtcRealtimeError('未登录或登录已过期');
          return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(
          `${protocol}//${window.location.host}/api/btc-realtime`,
          [BTC_REALTIME_PROTOCOL, `${REALTIME_TOKEN_PROTOCOL_PREFIX}${session.access_token}`],
        );
        ref.socket = socket;

        socket.addEventListener('open', () => {
          ref.retryDelayMs = 1000;
          setBtcRealtimeStatus('connecting');
          setBtcRealtimeError(null);
        });

        socket.addEventListener('message', (event) => {
          let payload = null;
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }
          if (payload?.type === 'btc_tick') {
            applyBtcRealtimeTick(payload, 'live', { transport: 'websocket' });
            return;
          }
          if (payload?.type === 'btc_status' && payload.status) {
            if (payload.status === 'live') ref.liveAt = Date.now();
            setBtcRealtimeStatus(payload.status);
            if (payload.error) setBtcRealtimeError(payload.error);
          }
        });

        socket.addEventListener('close', () => {
          if (ref.socket === socket) ref.socket = null;
          if (ref.intentionalCloseSocket === socket) {
            ref.intentionalCloseSocket = null;
            return;
          }
          if (stopped || document.hidden) return;
          setBtcRealtimeStatus((status) => (status === 'live' ? 'stale' : 'reconnecting'));
          scheduleReconnect(connect);
        });

        socket.addEventListener('error', () => {
          setBtcRealtimeError('BTC 实时连接中断,正在重连');
        });
      } catch (e) {
        setBtcRealtimeStatus('error');
        setBtcRealtimeError(e.message || 'BTC 实时连接失败');
        scheduleReconnect(connect);
      }
    };

    const pauseRealtime = () => {
      clearReconnectTimer();
      closeSocket();
      setBtcRealtimeStatus('paused');
    };

    const requestResumeReconnect = ({ force = false } = {}) => {
      if (document.hidden) return;
      const now = Date.now();
      const lastActivityAt = ref.lastTickAt || ref.liveAt;
      if (force) {
        if (ref.lastForceReconnectAt && now - ref.lastForceReconnectAt < REALTIME_FORCE_RECONNECT_THROTTLE_MS) return;
        if (ref.socket && lastActivityAt && now - lastActivityAt < BTC_RESUME_RECONNECT_GRACE_MS) return;
        ref.lastForceReconnectAt = now;
        connect();
        return;
      }
      if (ref.lastConnectAttemptAt && now - ref.lastConnectAttemptAt < REALTIME_RESUME_RECONNECT_THROTTLE_MS) return;
      if (ref.socket && lastActivityAt && now - lastActivityAt < REALTIME_RESUME_RECONNECT_STALE_MS) return;
      connect();
    };

    const handleRealtimeStale = () => {
      const lastActivityAt = ref.lastTickAt || ref.liveAt;
      if (!lastActivityAt) return;
      if (Date.now() - lastActivityAt > REALTIME_STALE_MS) {
        setBtcRealtimeStatus((status) => (status === 'live' ? 'stale' : status));
        requestResumeReconnect();
      }
    };

    const registeredResumeReconnect = (options = {}) => {
      requestResumeReconnect({ force: options?.force === true });
    };
    realtimeResumeReconnectHandlersRef.current.add(registeredResumeReconnect);

    ref.staleTimer = setInterval(handleRealtimeStale, 5000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseRealtime();
      } else {
        requestResumeReconnect({ force: isIosStandaloneWebApp() });
      }
    };
    const handlePageHide = () => pauseRealtime();
    const handleResumeReconnect = () => requestResumeReconnect({ force: isIosStandaloneWebApp() });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handleResumeReconnect);
    window.addEventListener('focus', handleResumeReconnect);
    window.addEventListener('online', handleResumeReconnect);
    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      if (ref.staleTimer) {
        clearInterval(ref.staleTimer);
        ref.staleTimer = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handleResumeReconnect);
      window.removeEventListener('focus', handleResumeReconnect);
      window.removeEventListener('online', handleResumeReconnect);
      realtimeResumeReconnectHandlersRef.current.delete(registeredResumeReconnect);
      closeSocket();
    };
  }, [cloudLoading, applyBtcRealtimeTick]);

  useEffect(() => {
    if (cloudLoading || typeof window === 'undefined') return;
    if (isIosStandaloneWebApp()) {
      const ref = indexRealtimeRef.current;
      if (ref.reconnectTimer) {
        clearTimeout(ref.reconnectTimer);
        ref.reconnectTimer = null;
      }
      if (ref.staleTimer) {
        clearInterval(ref.staleTimer);
        ref.staleTimer = null;
      }
      if (ref.socket) {
        try {
          ref.socket.close(1000, 'ios pwa snapshot mode');
        } catch {}
        ref.socket = null;
      }
      setIndexRealtimeStatus((status) => (status === 'live' ? status : 'polling'));
      setIndexRealtimeError(null);
      return undefined;
    }

    let stopped = false;
    const ref = indexRealtimeRef.current;

    const clearReconnectTimer = () => {
      if (ref.reconnectTimer) {
        clearTimeout(ref.reconnectTimer);
        ref.reconnectTimer = null;
      }
    };

    const closeSocket = () => {
      if (ref.socket) {
        const closingSocket = ref.socket;
        ref.intentionalCloseSocket = closingSocket;
        try {
          closingSocket.close(1000, 'client reconnect');
        } catch {}
        ref.socket = null;
      }
    };

    const scheduleReconnect = (connect) => {
      if (stopped || document.hidden) return;
      clearReconnectTimer();
      const delay = ref.retryDelayMs;
      ref.retryDelayMs = Math.min(ref.retryDelayMs * 2, REALTIME_RECONNECT_MAX_MS);
      ref.reconnectTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (stopped || document.hidden) return;
      clearReconnectTimer();
      closeSocket();
      ref.lastConnectAttemptAt = Date.now();
      setIndexRealtimeStatus((status) => (status === 'live' ? status : 'connecting'));

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setIndexRealtimeStatus('disabled');
          setIndexRealtimeError('未登录或登录已过期');
          return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(
          `${protocol}//${window.location.host}/api/indices-realtime`,
          [INDICES_REALTIME_PROTOCOL, `${REALTIME_TOKEN_PROTOCOL_PREFIX}${session.access_token}`],
        );
        ref.socket = socket;

        socket.addEventListener('open', () => {
          ref.retryDelayMs = 1000;
          setIndexRealtimeStatus('connecting');
          setIndexRealtimeError(null);
        });

        socket.addEventListener('message', (event) => {
          let payload = null;
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }
          if (payload?.type === 'index_tick') {
            applyIndexRealtimeTick(payload, 'live');
            return;
          }
          if (payload?.type === 'indices_status' && payload.status) {
            if (payload.status === 'live') ref.liveAt = Date.now();
            setIndexRealtimeStatus(payload.status);
            if (payload.error) setIndexRealtimeError(payload.error);
          }
        });

        socket.addEventListener('close', () => {
          if (ref.socket === socket) ref.socket = null;
          if (ref.intentionalCloseSocket === socket) {
            ref.intentionalCloseSocket = null;
            return;
          }
          if (stopped || document.hidden) return;
          setIndexRealtimeStatus((status) => (status === 'live' ? 'stale' : 'reconnecting'));
          scheduleReconnect(connect);
        });

        socket.addEventListener('error', () => {
          setIndexRealtimeError('指数实时连接中断,正在重连');
        });
      } catch (e) {
        setIndexRealtimeStatus('error');
        setIndexRealtimeError(e.message || '指数实时连接失败');
        scheduleReconnect(connect);
      }
    };

    const pauseRealtime = () => {
      clearReconnectTimer();
      closeSocket();
      setIndexRealtimeStatus('paused');
    };

    const requestResumeReconnect = ({ force = false } = {}) => {
      if (document.hidden) return;
      const now = Date.now();
      if (force) {
        if (ref.lastForceReconnectAt && now - ref.lastForceReconnectAt < REALTIME_FORCE_RECONNECT_THROTTLE_MS) return;
        ref.lastForceReconnectAt = now;
        connect();
        return;
      }
      if (ref.lastConnectAttemptAt && now - ref.lastConnectAttemptAt < REALTIME_RESUME_RECONNECT_THROTTLE_MS) return;
      const lastActivityAt = ref.lastTickAt || ref.liveAt;
      if (ref.socket && lastActivityAt && now - lastActivityAt < REALTIME_RESUME_RECONNECT_STALE_MS) return;
      connect();
    };

    const handleRealtimeStale = () => {
      const lastActivityAt = ref.lastTickAt || ref.liveAt;
      if (!lastActivityAt) return;
      if (Date.now() - lastActivityAt > REALTIME_STALE_MS) {
        setIndexRealtimeStatus((status) => (status === 'live' ? 'stale' : status));
        requestResumeReconnect();
      }
    };

    const registeredResumeReconnect = (options = {}) => {
      requestResumeReconnect({ force: options?.force === true });
    };
    realtimeResumeReconnectHandlersRef.current.add(registeredResumeReconnect);

    ref.staleTimer = setInterval(handleRealtimeStale, 5000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseRealtime();
      } else {
        requestResumeReconnect({ force: isIosStandaloneWebApp() });
      }
    };
    const handlePageHide = () => pauseRealtime();
    const handleResumeReconnect = () => requestResumeReconnect({ force: isIosStandaloneWebApp() });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handleResumeReconnect);
    window.addEventListener('focus', handleResumeReconnect);
    window.addEventListener('online', handleResumeReconnect);
    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      if (ref.staleTimer) {
        clearInterval(ref.staleTimer);
        ref.staleTimer = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handleResumeReconnect);
      window.removeEventListener('focus', handleResumeReconnect);
      window.removeEventListener('online', handleResumeReconnect);
      realtimeResumeReconnectHandlersRef.current.delete(registeredResumeReconnect);
      closeSocket();
    };
  }, [cloudLoading, applyIndexRealtimeTick]);

  useEffect(() => {
    if (!stockRealtimeReady || typeof window === 'undefined') return undefined;
    const symbolsSnapshot = stockRealtimeSymbols;
    if (symbolsSnapshot.length === 0) {
      stockRealtimeRef.current.status = 'idle';
      stockRealtimeRef.current.error = null;
      return undefined;
    }
    let stopped = false;
    const ref = stockRealtimeRef.current;
    ref.lastWebSocketTickAt = 0;
    ref.lastWebSocketTickAtBySymbol.clear();

    const clearReconnectTimer = () => {
      if (ref.reconnectTimer) {
        clearTimeout(ref.reconnectTimer);
        ref.reconnectTimer = null;
      }
    };

    const clearFirstTickTimer = () => {
      if (ref.firstTickTimer) {
        clearTimeout(ref.firstTickTimer);
        ref.firstTickTimer = null;
      }
    };

    const closeSocket = () => {
      clearFirstTickTimer();
      if (ref.socket) {
        const closingSocket = ref.socket;
        ref.intentionalCloseSocket = closingSocket;
        try {
          closingSocket.close(1000, 'client reconnect');
        } catch {}
        ref.socket = null;
      }
    };

    const scheduleReconnect = (connect) => {
      if (stopped || document.hidden) return;
      clearReconnectTimer();
      const delay = ref.retryDelayMs;
      ref.retryDelayMs = Math.min(ref.retryDelayMs * 2, REALTIME_RECONNECT_MAX_MS);
      ref.reconnectTimer = setTimeout(connect, delay);
    };

    const scheduleFirstTickWatchdog = (socket, openedAt) => {
      clearFirstTickTimer();
      ref.firstTickTimer = setTimeout(() => {
        ref.firstTickTimer = null;
        if (stopped || document.hidden || ref.socket !== socket) return;
        if (ref.lastWebSocketTickAt && ref.lastWebSocketTickAt >= openedAt) return;
        ref.status = 'waiting';
        ref.error = '股票实时首包等待中,保留连接并补拉快照';
        if (isIosStandaloneWebApp() && iosPwaRealtimeSnapshotBurstRef.current(
          'auto-ios-pwa-first-tick-timeout',
          { resetFreshness: false },
        )) {
          return;
        }
        requestQuickQuoteRefresh(quoteBaselineRowsRef.current, {
          trigger: 'auto-realtime-open',
          minIntervalMs: 0,
        });
      }, isIosStandaloneWebApp()
        ? IOS_PWA_STOCK_REALTIME_FIRST_TICK_TIMEOUT_MS
        : STOCK_REALTIME_FIRST_TICK_TIMEOUT_MS);
    };

    const connect = async () => {
      if (stopped || document.hidden) return;
      clearReconnectTimer();
      closeSocket();
      ref.lastConnectAttemptAt = Date.now();
      if (ref.status !== 'live') ref.status = 'connecting';
      if (!realtimeStartupMilestonesRef.current.socketConnectStarted) {
        realtimeStartupMilestonesRef.current.socketConnectStarted = true;
        realtimeStartupTrace.mark('socket_connect_start', {
          count: symbolsSnapshot.length,
          phase: 'client',
          stream: 'stock',
          transport: 'websocket',
        });
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (stopped || document.hidden) return;
        if (!session?.access_token) {
          ref.status = 'disabled';
          ref.error = '未登录或登录已过期';
          return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socketTraceGeneration = realtimeStartupMilestonesRef.current.generation;
        const socket = new WebSocket(
          `${protocol}//${window.location.host}/api/stocks-realtime?symbols=${encodeURIComponent(symbolsSnapshot.join(','))}`,
          [STOCKS_REALTIME_PROTOCOL, `${REALTIME_TOKEN_PROTOCOL_PREFIX}${session.access_token}`],
        );
        ref.socket = socket;

        socket.addEventListener('open', () => {
          if (stopped || ref.socket !== socket) return;
          const openedAt = Date.now();
          ref.lastSocketOpenAt = openedAt;
          ref.sessionTickSymbols = new Set();
          ref.lastWebSocketTickAtBySymbol.clear();
          ref.retryDelayMs = 1000;
          ref.status = 'connecting';
          ref.error = null;
          if (
            realtimeStartupMilestonesRef.current.generation === socketTraceGeneration
            && !realtimeStartupMilestonesRef.current.socketOpened
          ) {
            realtimeStartupMilestonesRef.current.socketOpened = true;
            realtimeStartupTrace.mark('socket_open', {
              count: symbolsSnapshot.length,
              phase: 'relay',
              stream: 'stock',
              transport: 'websocket',
            });
          }
          scheduleFirstTickWatchdog(socket, openedAt);
          requestQuickQuoteRefresh(quoteBaselineRowsRef.current, {
            trigger: 'auto-realtime-open',
            minIntervalMs: QUICK_QUOTE_REFRESH_MIN_INTERVAL_MS,
          });
        });

        socket.addEventListener('message', (event) => {
          if (stopped || ref.socket !== socket) return;
          let payload = null;
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }
          if (payload?.type === 'stock_tick') {
            const tickSymbol = normalizeSymbolKey(payload.symbol || payload.ticker || payload.displaySymbol);
            if (tickSymbol) ref.sessionTickSymbols.add(tickSymbol);
            clearFirstTickTimer();
            if (
              realtimeStartupMilestonesRef.current.generation === socketTraceGeneration
              && !realtimeStartupMilestonesRef.current.firstTick
            ) {
              realtimeStartupMilestonesRef.current.firstTick = true;
              realtimeStartupTrace.mark('first_tick', {
                count: ref.sessionTickSymbols.size,
                phase: 'provider',
                stream: 'stock',
                transport: 'websocket',
              });
            }
            applyStockRealtimeTick(payload, 'live', { transport: 'websocket' });
            if (
              realtimeStartupMilestonesRef.current.generation === socketTraceGeneration
              && !realtimeStartupMilestonesRef.current.pricesApplied
            ) {
              realtimeStartupMilestonesRef.current.pricesApplied = true;
              realtimeStartupTrace.mark('prices_applied', {
                count: ref.sessionTickSymbols.size,
                phase: 'render',
                stream: 'stock',
                transport: 'websocket',
              });
            }
            if (
              realtimeStartupMilestonesRef.current.generation === socketTraceGeneration
              && !realtimeStartupMilestonesRef.current.startupComplete
            ) {
              realtimeStartupMilestonesRef.current.startupComplete = true;
              realtimeStartupTrace.mark('startup_complete', {
                complete: true,
                phase: 'render',
                stream: 'stock',
                transport: 'websocket',
              });
            }
            return;
          }
          if (payload?.type === 'stocks_status' && payload.status) {
            if (payload.status === 'live') ref.liveAt = Date.now();
            ref.status = payload.status;
            if (payload.error) ref.error = payload.error;
          }
        });

        socket.addEventListener('close', () => {
          clearFirstTickTimer();
          if (ref.socket === socket) ref.socket = null;
          if (ref.intentionalCloseSocket === socket) {
            ref.intentionalCloseSocket = null;
            return;
          }
          if (stopped || document.hidden) return;
          ref.lastWebSocketTickAt = 0;
          ref.status = ref.status === 'live' ? 'stale' : 'reconnecting';
          scheduleReconnect(connect);
        });

        socket.addEventListener('error', () => {
          if (stopped || ref.socket !== socket) return;
          ref.lastWebSocketTickAt = 0;
          ref.error = '股票实时连接中断,正在重连';
        });
      } catch (e) {
        ref.status = 'error';
        ref.error = e.message || '股票实时连接失败';
        scheduleReconnect(connect);
      }
    };

    const pauseRealtime = () => {
      clearReconnectTimer();
      closeSocket();
      ref.lastWebSocketTickAt = 0;
      ref.status = 'paused';
    };

    const requestResumeReconnect = ({ force = false } = {}) => {
      if (document.hidden) return;
      const now = Date.now();
      if (force) {
        if (ref.lastForceReconnectAt && now - ref.lastForceReconnectAt < REALTIME_FORCE_RECONNECT_THROTTLE_MS) return;
        ref.lastForceReconnectAt = now;
        connect();
        return;
      }
      if (ref.lastConnectAttemptAt && now - ref.lastConnectAttemptAt < REALTIME_RESUME_RECONNECT_THROTTLE_MS) return;
      const lastActivityAt = ref.lastWebSocketTickAt || ref.liveAt;
      if (ref.socket && lastActivityAt && now - lastActivityAt < REALTIME_RESUME_RECONNECT_STALE_MS) return;
      connect();
    };

    const handleRealtimeStale = () => {
      const now = Date.now();
      const lastTickAt = ref.lastWebSocketTickAt || 0;
      if (!lastTickAt) {
        const openedAt = ref.lastSocketOpenAt || ref.lastConnectAttemptAt || 0;
        if (ref.socket && openedAt && now - openedAt > STOCK_REALTIME_NO_TICK_RECONNECT_MS) {
          ref.status = 'reconnecting';
          ref.error = '股票实时首包等待超时,正在重连';
          requestResumeReconnect({ force: true });
        }
        return;
      }
      if (now - lastTickAt > REALTIME_STALE_MS) {
        if (ref.status === 'live') ref.status = 'stale';
        requestResumeReconnect();
      }
    };

    const registeredResumeReconnect = (options = {}) => {
      requestResumeReconnect({ force: options?.force === true });
    };
    realtimeResumeReconnectHandlersRef.current.add(registeredResumeReconnect);

    ref.staleTimer = setInterval(handleRealtimeStale, 5000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseRealtime();
      } else {
        requestResumeReconnect({ force: isIosStandaloneWebApp() });
      }
    };
    const handlePageHide = () => pauseRealtime();
    const handleResumeReconnect = () => requestResumeReconnect({ force: isIosStandaloneWebApp() });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handleResumeReconnect);
    window.addEventListener('focus', handleResumeReconnect);
    window.addEventListener('online', handleResumeReconnect);
    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      clearFirstTickTimer();
      if (ref.staleTimer) {
        clearInterval(ref.staleTimer);
        ref.staleTimer = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handleResumeReconnect);
      window.removeEventListener('focus', handleResumeReconnect);
      window.removeEventListener('online', handleResumeReconnect);
      realtimeResumeReconnectHandlersRef.current.delete(registeredResumeReconnect);
      closeSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockRealtimeReady, stockRealtimeSymbolsKey, applyStockRealtimeTick, realtimeStartupTrace]);

  useEffect(() => {
    if (!stockRealtimeReady || typeof window === 'undefined') return undefined;
    if (!isIosStandaloneWebApp()) return undefined;

    let stopped = false;
    let pollTimer = null;
    const burstTimers = new Set();
    let inFlight = false;
    let trailingPoll = null;
    let trailingPollTimer = null;

    const parseSnapshotResponse = async (response, label) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `${label} snapshot failed`);
      }
      return result.data || {};
    };

    const clearBurstTimers = () => {
      burstTimers.forEach((timerId) => window.clearTimeout(timerId));
      burstTimers.clear();
    };

    const clearTrailingPollTimer = () => {
      if (!trailingPollTimer) return;
      window.clearTimeout(trailingPollTimer);
      trailingPollTimer = null;
    };

    const markSnapshotWarming = (options = {}) => {
      if (options?.traceTrigger) {
        startRealtimeStartupTraceSession(options.traceTrigger);
      }
      if (options?.resetFreshness !== false) {
        const freshnessFloorAt = Date.now();
        stockRealtimeRef.current.snapshotFreshnessFloorAt = freshnessFloorAt;
        setWarmStartedAt(freshnessFloorAt);
      }
      if (!cloudLoadingRef.current) {
        setIndexRealtimeStatus('warming');
      }
      if (shouldPollStockRealtimeSnapshot({
        lastWebSocketTickAt: stockRealtimeRef.current.lastWebSocketTickAt,
        lastWebSocketTickAtBySymbol: stockRealtimeRef.current.lastWebSocketTickAtBySymbol,
        symbols: stockRealtimeSymbols,
        staleMs: REALTIME_STALE_MS,
        freshnessFloorAt: stockRealtimeRef.current.snapshotFreshnessFloorAt,
      })) {
        stockRealtimeRef.current.status = 'warming';
      }
    };

    const keepPendingStatus = (setter) => {
      setter((status) => (status === 'live' || status === 'warming' ? status : 'polling'));
    };

    const runSnapshotPoll = async (trigger = 'auto-ios-pwa-snapshot', options = {}) => {
      const forceSnapshot = options?.force === true;
      const warmSnapshot = options?.warm === true;
      const resetFreshness = options?.resetFreshness !== false;
      if (stopped) return;
      if (inFlight) {
        trailingPoll = mergeStockSnapshotPollRequest(trailingPoll, {
          trigger,
          force: forceSnapshot,
          warm: warmSnapshot,
          resetFreshness,
        });
        return;
      }
      if (!forceSnapshot && document.hidden) return;
      if (warmSnapshot) markSnapshotWarming({ resetFreshness });
      inFlight = true;
      const snapshotSessionGeneration = realtimeStartupMilestonesRef.current.generation;
      const isCurrentSnapshotSession = () => (
        !stopped
        && realtimeStartupMilestonesRef.current.generation === snapshotSessionGeneration
      );
      const stockSymbolsSnapshot = stockRealtimeSymbols.join(',');
      try {
        const indicesRequest = cloudLoadingRef.current
          ? Promise.resolve()
          : fetchRealtimeSnapshot('/api/indices-realtime')
            .then((response) => parseSnapshotResponse(response, 'indices'))
            .then((snapshot) => {
              if (stopped) return;
              const ticks = Array.isArray(snapshot?.ticks) ? snapshot.ticks : [];
              ticks.forEach((tick) => applyIndexRealtimeTick(tick, 'live'));
              if (ticks.length === 0) {
                keepPendingStatus(setIndexRealtimeStatus);
              }
            })
            .catch(() => {
              keepPendingStatus(setIndexRealtimeStatus);
            });

        const shouldPollStocks = Boolean(stockSymbolsSnapshot) && shouldPollStockRealtimeSnapshot({
          lastWebSocketTickAt: stockRealtimeRef.current.lastWebSocketTickAt,
          lastWebSocketTickAtBySymbol: stockRealtimeRef.current.lastWebSocketTickAtBySymbol,
          symbols: stockRealtimeSymbols,
          staleMs: REALTIME_STALE_MS,
          freshnessFloorAt: stockRealtimeRef.current.snapshotFreshnessFloorAt,
        });
        const traceThisStockSnapshot = shouldPollStocks
          && !realtimeStartupMilestonesRef.current.snapshotStarted;
        if (traceThisStockSnapshot) {
          realtimeStartupMilestonesRef.current.snapshotStarted = true;
          realtimeStartupTrace.mark('snapshot_start', {
            count: stockRealtimeSymbols.length,
            phase: 'snapshot',
            stream: 'stock',
            transport: 'snapshot',
          });
        }
        const stockSnapshotRequestedAt = Date.now();
        const stocksRequest = shouldPollStocks
          ? fetchRealtimeSnapshot('/api/stocks-realtime', { symbols: stockSymbolsSnapshot })
            .then((response) => parseSnapshotResponse(response, 'stocks'))
            .then((snapshot) => {
              if (!isCurrentSnapshotSession()) return;
              const ticks = Array.isArray(snapshot?.ticks) ? snapshot.ticks : [];
              if (ticks.length > 0 && !realtimeStartupMilestonesRef.current.snapshotFirstTick) {
                realtimeStartupMilestonesRef.current.snapshotFirstTick = true;
                realtimeStartupTrace.mark('snapshot_first_tick', {
                  count: ticks.length,
                  phase: 'snapshot',
                  stream: 'stock',
                  transport: 'snapshot',
                });
              }
              ticks.forEach((tick) => {
                const symbol = normalizeSymbolKey(tick?.symbol || tick?.ticker || tick?.displaySymbol);
                const webSocketReceivedAt = symbol
                  ? stockRealtimeRef.current.lastWebSocketTickAtBySymbol.get(symbol)
                  : 0;
                if (!shouldApplyStockSnapshotTick({
                  snapshotRequestedAt: stockSnapshotRequestedAt,
                  webSocketReceivedAt,
                })) return;
                applyStockRealtimeTick(tick, 'live', { transport: 'snapshot' });
              });
              if (ticks.length > 0 && !realtimeStartupMilestonesRef.current.pricesApplied) {
                realtimeStartupMilestonesRef.current.pricesApplied = true;
                realtimeStartupTrace.mark('prices_applied', {
                  count: ticks.length,
                  phase: 'render',
                  stream: 'stock',
                  transport: 'snapshot',
                });
              }
              if (ticks.length > 0 && !realtimeStartupMilestonesRef.current.startupComplete) {
                realtimeStartupMilestonesRef.current.startupComplete = true;
                realtimeStartupTrace.mark('startup_complete', {
                  complete: true,
                  fallback: true,
                  phase: 'render',
                  stream: 'stock',
                  transport: 'snapshot',
                });
              }
              if (ticks.length === 0 && stockRealtimeRef.current.status !== 'warming') {
                stockRealtimeRef.current.status = 'polling';
              }
            })
            .catch(() => {
              if (!isCurrentSnapshotSession()) return;
              if (stockRealtimeRef.current.status !== 'warming') {
                stockRealtimeRef.current.status = 'polling';
              }
            })
          : Promise.resolve();

        await Promise.allSettled([indicesRequest, stocksRequest]);
        if (!isCurrentSnapshotSession()) return;
        if (traceThisStockSnapshot && !realtimeStartupMilestonesRef.current.snapshotDone) {
          realtimeStartupMilestonesRef.current.snapshotDone = true;
          realtimeStartupTrace.mark('snapshot_done', {
            count: stockRealtimeSymbols.length,
            phase: 'snapshot',
            stream: 'stock',
            success: realtimeStartupMilestonesRef.current.snapshotFirstTick,
            transport: 'snapshot',
          });
        }
        setLastFetched(new Date());
      } catch (e) {
        if (stopped) return;
        console.warn(`[iOS PWA snapshot] ${trigger} failed:`, e?.message || e);
      } finally {
        inFlight = false;
        if (!stopped && trailingPoll) {
          const nextPoll = trailingPoll;
          trailingPoll = null;
          clearTrailingPollTimer();
          trailingPollTimer = window.setTimeout(() => {
            trailingPollTimer = null;
            runSnapshotPoll(nextPoll.trigger, nextPoll);
          }, 0);
        }
      }
    };

    const startSnapshotBurst = (trigger = 'auto-ios-pwa-snapshot-burst', options = {}) => {
      if (stopped) return false;
      const resetFreshness = options?.resetFreshness !== false;
      const traceTrigger = resetFreshness && trigger.includes('online')
        ? 'online'
        : (resetFreshness && (trigger.includes('resume') || trigger.includes('focus')))
          ? 'resume'
          : null;
      clearBurstTimers();
      markSnapshotWarming({ resetFreshness, traceTrigger });
      IOS_PWA_REALTIME_SNAPSHOT_BURST_DELAYS_MS.forEach((delayMs, index) => {
        const timerId = window.setTimeout(() => {
          burstTimers.delete(timerId);
          runSnapshotPoll(`${trigger}-burst-${index + 1}`, {
            force: true,
            warm: index === 0,
            resetFreshness,
          });
        }, delayMs);
        burstTimers.add(timerId);
      });
      schedulePoll();
      return true;
    };

    const schedulePoll = () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = window.setTimeout(async () => {
        await runSnapshotPoll();
        if (!stopped) schedulePoll();
      }, getIosPwaRealtimeSnapshotInterval());
    };

    const resumePoll = (event) => {
      const eventType = event?.type;
      if (eventType === 'visibilitychange') {
        if (document.hidden) return;
        startSnapshotBurst('auto-ios-pwa-snapshot-resume', { resetFreshness: true });
        return;
      }
      if (eventType === 'focus') {
        startSnapshotBurst('auto-ios-pwa-snapshot-focus', { resetFreshness: false });
        return;
      }
      if (eventType === 'pageshow') {
        startSnapshotBurst('auto-ios-pwa-snapshot-resume', { resetFreshness: event?.persisted === true || Boolean(pwaHiddenAtRef.current) });
        return;
      }
      if (eventType === 'online') {
        startSnapshotBurst('auto-ios-pwa-snapshot-online', { resetFreshness: true });
        return;
      }
      startSnapshotBurst('auto-ios-pwa-snapshot-resume', { resetFreshness: true });
    };

    iosPwaRealtimeSnapshotBurstRef.current = startSnapshotBurst;
    startSnapshotBurst('auto-ios-pwa-snapshot-start');

    document.addEventListener('visibilitychange', resumePoll);
    window.addEventListener('pageshow', resumePoll);
    window.addEventListener('focus', resumePoll);
    window.addEventListener('online', resumePoll);

    return () => {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);
      clearBurstTimers();
      clearTrailingPollTimer();
      trailingPoll = null;
      if (iosPwaRealtimeSnapshotBurstRef.current === startSnapshotBurst) {
        iosPwaRealtimeSnapshotBurstRef.current = () => false;
      }
      document.removeEventListener('visibilitychange', resumePoll);
      window.removeEventListener('pageshow', resumePoll);
      window.removeEventListener('focus', resumePoll);
      window.removeEventListener('online', resumePoll);
    };
  }, [
    stockRealtimeReady,
    stockRealtimeSymbolsKey,
    fetchRealtimeSnapshot,
    applyBtcRealtimeTick,
    applyIndexRealtimeTick,
    applyStockRealtimeTick,
    realtimeStartupTrace,
    startRealtimeStartupTraceSession,
  ]);

  useEffect(() => {
    if (cloudLoading) return;
    const needsFallback = !btcMarketCard || ['idle', 'disabled', 'error', 'fallback', 'paused', 'reconnecting', 'stale'].includes(btcRealtimeStatus);
    if (!needsFallback) return;

    if (!document.hidden) fetchBtcRestFallback();
    const timerId = setInterval(() => {
      if (!document.hidden) fetchBtcRestFallback();
    }, REALTIME_STALE_MS);

    return () => clearInterval(timerId);
  }, [btcMarketCard, cloudLoading, btcRealtimeStatus, fetchBtcRestFallback]);

  // 自动 REST 只做低频完整基线；盘中价格继续由股票/指数 WebSocket 与 iOS 快照突发负责。
  // 🚨 关键: 不能在 cloudLoading=true 时拉, 否则 watchlist=[] 闭包会清空云端数据!
  // 浏览器直连 EODHD WebSocket 已移除;BTC 实时行情只连接已登录服务端 relay。
  useEffect(() => {
    if (cloudLoading) return;

    // 启动时立即拉 1 次 (拿初始数据 + 指数 + VIX/FGI)
    fetchRealtimePrices(null, { trigger: 'auto-start', notifyOnError: false });

    console.log('[REST] 启用已登录行情接口轮询');
    let timerId = null;
    let isActive = true;

    const scheduleNextFetch = () => {
      if (!isActive) return;
      if (timerId) clearTimeout(timerId);
      const now = Date.now();
      const sessionDate = new Date(now);
      const remainingMs = getQuoteBaselineRefreshDelay({
        session: getQuoteBaselineSession(sessionDate, getUsMarketSession(sessionDate)),
        now,
        lastSuccessAt: quoteBaselineRefreshRef.current.lastSuccessAt,
        lastAttemptAt: quoteBaselineRefreshRef.current.lastAttemptAt,
        lastAttemptSession: quoteBaselineRefreshRef.current.lastAttemptSession,
      });
      // At most one minute between policy checks lets session transitions run
      // their one baseline without bringing back high-frequency REST polling.
      const nextCheckMs = Math.max(1000, Math.min(remainingMs || 1000, 60 * 1000));
      timerId = setTimeout(runFetchAndReschedule, nextCheckMs);
    };

    const runFetchAndReschedule = () => {
      if (!isActive) return;
      fetchRealtimePrices(null, { trigger: 'auto-interval', notifyOnError: false });
      scheduleNextFetch();
    };

    scheduleNextFetch();

    const resumeWithQuickRefresh = (trigger) => {
      if (!isActive || document.hidden) return;
      requestQuickQuoteRefresh(null, {
        trigger,
        minIntervalMs: 1000,
      });
      scheduleNextFetch();
    };

    // 页面可见性: 隐藏时暂停；回来时仅在基线到期后补拉，同时重启计时。
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }
      } else {
        resumeWithQuickRefresh('auto-visible');
      }
    };
    const handleFocus = () => resumeWithQuickRefresh('auto-focus');
    const handlePageShow = () => resumeWithQuickRefresh('auto-pageshow');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      isActive = false;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudLoading]);

  // 当前激活的底部 tab
  const [activeTab, setActiveTab] = useState('home');
  const [activePage, setActivePage] = useState(null);
  const lastHomeTabTapAtRef = useRef(0);
  const homeScrollTopBeforeWatchlistRef = useRef(null);
  const homeScrollTopBeforeEarningsRef = useRef(null);
  const pendingHomeScrollTopRef = useRef(null);
  const [communityProfileFocusRequest, setCommunityProfileFocusRequest] = useState(0);
  const [pnlShareIdentityState, setPnlShareIdentityState] = useState({ status: 'idle', identity: null });
  const pnlShareIdentityRequestRef = useRef(0);
  const [stockDetailSymbol, setStockDetailSymbol] = useState('');
  const [watchlistStockDetailSymbol, setWatchlistStockDetailSymbol] = useState('');
  const [watchlistStockDetailFocusSection, setWatchlistStockDetailFocusSection] = useState('');
  const [earningsCalendarPageState, setEarningsCalendarPageState] = useState({ view: 'list', selectedDate: '' });
  const [earningsDetailEvent, setEarningsDetailEvent] = useState(null);
  const [earningsDetailReturnPage, setEarningsDetailReturnPage] = useState('earnings-calendar');
  const [language, setLanguageState] = useState(() => getStoredLanguage());
  const setLanguage = useCallback((nextLanguage) => {
    setLanguageState(saveStoredLanguage(nextLanguage));
  }, []);
  const handleBottomTabClick = useCallback((tabId) => {
    const tapAction = resolveBottomTabTap({
      tabId,
      activeTab,
      activePage,
      lastHomeTapAt: lastHomeTabTapAtRef.current,
    });
    lastHomeTabTapAtRef.current = tapAction.nextHomeTapAt;

    const returnsFromWatchlistDetailToHome = (
      tabId === 'home'
      && activeTab === 'home'
      && activePage === 'watchlist-stock-detail'
    );
    const returnsFromEarningsToHome = (
      tabId === 'home'
      && activeTab === 'home'
      && (activePage === 'earnings-calendar' || activePage === 'earnings-detail')
    );
    const returnsFromWatchlistEarningsToHome = (
      returnsFromEarningsToHome
      && activePage === 'earnings-detail'
      && earningsDetailReturnPage === 'watchlist-stock-detail'
    );
    pendingHomeScrollTopRef.current = returnsFromWatchlistDetailToHome
      ? homeScrollTopBeforeWatchlistRef.current
      : returnsFromWatchlistEarningsToHome
        ? homeScrollTopBeforeWatchlistRef.current
        : returnsFromEarningsToHome
        ? homeScrollTopBeforeEarningsRef.current
        : null;

    if (tapAction.shouldScrollHomeToTop) {
      homeScrollTopBeforeWatchlistRef.current = 0;
      pendingHomeScrollTopRef.current = null;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (tabId === 'home' && activeTab === 'home' && activePage === null) return;

    setShowMonthsDetail(false);
    setActiveTab(tabId);
    setActivePage(null);
    setStockDetailSymbol('');
    setWatchlistStockDetailSymbol('');
    setWatchlistStockDetailFocusSection('');
    setEarningsDetailEvent(null);
    setEarningsDetailReturnPage('earnings-calendar');
  }, [activePage, activeTab, earningsDetailReturnPage]);
  const [portfolioCurrencyMode, setPortfolioCurrencyModeState] = useState(() => readStoredPortfolioCurrency());
  const setPortfolioCurrencyMode = useCallback((nextCurrency) => {
    setPortfolioCurrencyModeState(normalizePortfolioCurrency(nextCurrency));
  }, []);
  const waveDisplayCurrency = normalizePortfolioCurrency(portfolioCurrencyMode);
  const waveDisplayRate = waveDisplayCurrency === 'CNY' ? (validRate(usdRate) || DEFAULT_USD_CNY_RATE) : 1;
  const signedWaveCurrencyAmount = useCallback((value, digits = 2) => formatWaveCurrencyAmount(value, {
    currency: waveDisplayCurrency,
    rate: waveDisplayRate,
    digits,
    signed: true,
  }), [waveDisplayCurrency, waveDisplayRate]);
  const openPnlReport = useCallback(() => {
    setActivePage('pnl-report');
  }, []);
  const closePnlReport = useCallback(() => {
    setActivePage(null);
  }, []);
  const openPnlShare = useCallback(() => {
    const requestId = pnlShareIdentityRequestRef.current + 1;
    pnlShareIdentityRequestRef.current = requestId;
    const userId = user?.id || '';
    setPnlShareIdentityState({ status: 'loading', identity: null });
    setActivePage('pnl-share');
    if (!userId) {
      setPnlShareIdentityState({ status: 'error', identity: null });
      return;
    }
    db.fetchPnlShareIdentity({ id: userId })
      .then((profile) => {
        if (pnlShareIdentityRequestRef.current !== requestId) return;
        const identity = createPnlShareIdentity(profile);
        setPnlShareIdentityState({
          status: identity ? 'ready' : 'missing',
          identity,
        });
      })
      .catch(() => {
        if (pnlShareIdentityRequestRef.current !== requestId) return;
        setPnlShareIdentityState({ status: 'error', identity: null });
      });
  }, [user?.id]);
  const closePnlShare = useCallback(() => {
    pnlShareIdentityRequestRef.current += 1;
    setPnlShareIdentityState({ status: 'idle', identity: null });
    setActivePage(null);
  }, []);
  const openHomeMarginRisk = useCallback(() => {
    setActivePage('home-margin-risk');
  }, []);
  const closeHomeMarginRisk = useCallback(() => {
    setActivePage(null);
  }, []);
  const openStockDetail = useCallback((symbol) => {
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();
    if (!normalizedSymbol) return;
    setStockDetailSymbol(normalizedSymbol);
    setActivePage('stock-detail');
  }, []);
  const closeStockDetail = useCallback(() => {
    setActivePage(null);
    setStockDetailSymbol('');
  }, []);
  const openWatchlistStockDetail = useCallback((symbol) => {
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();
    if (!normalizedSymbol) return;
    if (activeTab === 'home' && activePage === null) {
      homeScrollTopBeforeWatchlistRef.current = readRootScrollTop();
    }
    pendingHomeScrollTopRef.current = null;
    setWatchlistStockDetailFocusSection('');
    setWatchlistStockDetailSymbol(normalizedSymbol);
    setActivePage('watchlist-stock-detail');
  }, [activePage, activeTab]);
  const closeWatchlistStockDetail = useCallback(() => {
    pendingHomeScrollTopRef.current = homeScrollTopBeforeWatchlistRef.current;
    setWatchlistStockDetailFocusSection('');
    setActivePage(null);
    setWatchlistStockDetailSymbol('');
  }, []);
  const openWaveTracker = useCallback(() => {
    setActivePage('wave-tracker');
  }, []);
  const closeWaveTracker = useCallback(() => {
    setActivePage(null);
  }, []);
  const openCommunityCompetition = useCallback(() => {
    setActivePage('community-competition');
  }, []);
  const closeCommunityCompetition = useCallback(() => {
    setActivePage(null);
  }, []);
  const openEarningsCalendar = useCallback(({ view = 'list', selectedDate = '' } = {}) => {
    if (activeTab === 'home' && activePage === null) {
      homeScrollTopBeforeEarningsRef.current = readRootScrollTop();
    }
    pendingHomeScrollTopRef.current = null;
    setEarningsCalendarPageState({
      view: view === 'calendar' ? 'calendar' : 'list',
      selectedDate: String(selectedDate || '').slice(0, 10),
    });
    setEarningsDetailEvent(null);
    setEarningsDetailReturnPage('earnings-calendar');
    setActivePage('earnings-calendar');
  }, [activePage, activeTab]);
  const closeEarningsCalendar = useCallback(() => {
    pendingHomeScrollTopRef.current = homeScrollTopBeforeEarningsRef.current;
    setEarningsDetailEvent(null);
    setActivePage(null);
  }, []);
  const onEarningsCalendarStateChange = useCallback((nextState = {}) => {
    setEarningsCalendarPageState((current) => ({
      view: nextState.view === 'calendar' ? 'calendar' : 'list',
      selectedDate: String(nextState.selectedDate || current.selectedDate || '').slice(0, 10),
    }));
  }, []);
  const openEarningsDetail = useCallback((event, { returnPage = 'earnings-calendar' } = {}) => {
    if (!event?.symbol || !isEarningsPublished(event)) return;
    const nextReturnPage = returnPage === 'watchlist-stock-detail'
      ? 'watchlist-stock-detail'
      : returnPage === 'home'
        ? 'home'
        : 'earnings-calendar';
    if (nextReturnPage === 'home' && activeTab === 'home' && activePage === null) {
      homeScrollTopBeforeEarningsRef.current = readRootScrollTop();
      pendingHomeScrollTopRef.current = null;
    }
    setEarningsDetailReturnPage(nextReturnPage);
    if (nextReturnPage === 'watchlist-stock-detail') setWatchlistStockDetailFocusSection('');
    setEarningsDetailEvent(event);
    setActivePage('earnings-detail');
  }, [activePage, activeTab]);
  const closeEarningsDetail = useCallback(() => {
    if (earningsDetailReturnPage === 'watchlist-stock-detail' && watchlistStockDetailSymbol) {
      setWatchlistStockDetailFocusSection('earnings');
      setActivePage('watchlist-stock-detail');
      return;
    }
    if (earningsDetailReturnPage === 'home') {
      pendingHomeScrollTopRef.current = homeScrollTopBeforeEarningsRef.current;
      setEarningsDetailEvent(null);
      setActivePage(null);
      return;
    }
    setActivePage('earnings-calendar');
  }, [earningsDetailReturnPage, watchlistStockDetailSymbol]);
  const openCommunityProfileSettings = useCallback(() => {
    setActivePage(null);
    setActiveTab('settings');
    setCommunityProfileFocusRequest((current) => current + 1);
  }, []);
  const syncSwingWaveQuoteRows = useCallback((rows = []) => {
    const bySymbol = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const symbol = normalizeStrictSymbolKey(row?.symbol);
      if (!symbol) return;
      bySymbol.set(symbol, {
        ...row,
        symbol,
        name: displayStockName(symbol, row?.name),
      });
    });
    setSwingWaveQuoteRows(Array.from(bySymbol.values()));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PORTFOLIO_CURRENCY_STORAGE_KEY, portfolioCurrencyMode);
      localStorage.setItem(HOME_CURRENCY_STORAGE_KEY, portfolioCurrencyMode);
      localStorage.setItem(TRADE_CURRENCY_STORAGE_KEY, portfolioCurrencyMode);
    } catch {}
  }, [portfolioCurrencyMode]);

  // 页面切换默认回顶；从自选详情或财报系统返回首页时恢复进入前的位置。
  useLayoutEffect(() => {
    const scrollTarget = resolveNavigationScrollTarget({
      activeTab,
      activePage,
      pendingHomeScrollTop: pendingHomeScrollTopRef.current,
    });
    pendingHomeScrollTopRef.current = null;
    window.scrollTo(0, scrollTarget.top);
  }, [activeTab, activePage]);

  useEffect(() => {
    if (cloudLoading) return;
    if (activeTab !== 'home' && activeTab !== 'trades') return;
    requestQuickQuoteRefresh(null, {
      trigger: 'auto-tab',
      minIntervalMs: 1500,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, cloudLoading]);

  // 添加交易表单:输入股票代码后 500ms 自动查询(填充中文名+当前价)
  useEffect(() => {
    if (!showAddTrade) return;
    const rawSym = String(newTrade.symbol || '').trim();
    const sym = normalizeStrictSymbolKey(rawSym);
    if (rawSym.length < 1) {
      setLookupStatus(null);
      return;
    }
    if (!sym) {
      setLookupStatus(null);
      return;
    }

    // 1) 先从合并后的 quote cache 里看,有的话立刻填(不用网络)
    const fromWatchlist = quoteRows.find(s => s.symbol === sym);
    if (fromWatchlist) {
      setLookupStatus('found');
      setNewTrade(t => ({
        ...t,
        name: displayStockName(sym, t.name || fromWatchlist.name),
        price: t.price || (fromWatchlist.price ? fromWatchlist.price.toFixed(2) : ''),
      }));
      return;
    }

    // 2) 不在关注列表 → 500ms 防抖,从 API 拉
    setLookupStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const r = await fetchQuote(sym);
        const result = await r.json();
        const stockData = result?.data?.find(d => d.symbol === sym);
        if (stockData && stockData.price > 0) {
          setLookupStatus('found');
          setNewTrade(t => ({
            ...t,
            // 优先级:已有名 > 中英对照表 > 代码本身
            name: displayStockName(sym, t.name),
            price: t.price || stockData.price.toFixed(2),
          }));
        } else {
          setLookupStatus('notfound');
        }
      } catch (e) {
        setLookupStatus('notfound');
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTrade.symbol, showAddTrade]);

  const fmt = useCallback((n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }), []);
  const fmtPct = useCallback((n) => `${(n * 100).toFixed(1)}%`, []);


  const isPnlReportPage = activePage === 'pnl-report';
  const isPnlSharePage = activePage === 'pnl-share';
  const isHomeMarginRiskPage = activePage === 'home-margin-risk';
  const isStockDetailPage = activePage === 'stock-detail';
  const isWatchlistStockDetailPage = activePage === 'watchlist-stock-detail';
  const isWaveTrackerPage = activePage === 'wave-tracker';
  const isCommunityCompetitionPage = activePage === 'community-competition';
  const isEarningsCalendarPage = activePage === 'earnings-calendar';
  const isEarningsDetailPage = activePage === 'earnings-detail';
  const isStandalonePage = isPnlReportPage || isPnlSharePage || isHomeMarginRiskPage || isStockDetailPage || isWatchlistStockDetailPage || isWaveTrackerPage || isCommunityCompetitionPage || isEarningsCalendarPage || isEarningsDetailPage;
  const isFullBleedPage = isPnlSharePage || isCommunityCompetitionPage || isEarningsCalendarPage || isEarningsDetailPage;
  const hideBottomNavigation = isPnlReportPage || isPnlSharePage;
  const ActiveTab = TAB_COMPONENTS[activeTab] || HomeTab;
  const settingsTabCtx = useMemo(() => ({
    accountManager,
    changelogExpanded,
    communityProfileFocusRequest,
    db,
    language,
    marketColorMode,
    newPwd,
    onAddAccount,
    onLogout,
    pwdLoading,
    pwdMsg,
    setChangelogExpanded,
    setLanguage,
    setMarketColorMode,
    setNewPwd,
    setPwdLoading,
    setPwdMsg,
    setShowChangePassword,
    showChangePassword,
    showConfirm,
    supabase,
    user,
  }), [
    accountManager,
    changelogExpanded,
    communityProfileFocusRequest,
    language,
    marketColorMode,
    newPwd,
    onAddAccount,
    onLogout,
    pwdLoading,
    pwdMsg,
    setLanguage,
    showChangePassword,
    showConfirm,
    user,
  ]);
  const analysisTabCtx = useMemo(() => ({
    accounts,
    chartSelectedMonthIdx,
    db,
    fillMonth,
    fmt,
    hkdRate,
    language,
    newAccount,
    setAccounts,
    setChartSelectedMonthIdx,
    setFillMonth,
    setNewAccount,
    setShowAddAccount,
    setShowFillSnapshot,
    setShowMonthsDetail,
    setSnapshotDraft,
    setSnapshots,
    setSnapshotTab,
    showAddAccount,
    showConfirm,
    showFillSnapshot,
    showMonthsDetail,
    snapshotDraft,
    snapshots,
    snapshotTab,
    usdRate,
  }), [
    accounts,
    chartSelectedMonthIdx,
    fillMonth,
    fmt,
    hkdRate,
    language,
    newAccount,
    showAddAccount,
    showConfirm,
    showFillSnapshot,
    showMonthsDetail,
    snapshotDraft,
    snapshots,
    snapshotTab,
    usdRate,
  ]);
  const tabCtx = {
    accountDeleteConfirmId,
    accounts,
    addStock,
    addTrade,
    ALERT_LEVELS,
    AlertCircle,
    AlertTriangle,
    alertsMuted,
    batches,
    benchmarkDrawdown,
    benchmarkMenuOpen,
    benchmarkOptions,
    benchmarkStatus,
    benchmarkStock,
    benchmarkSymbol,
    btcRealtimeError,
    btcRealtimeLastTick,
    btcRealtimeStatus,
    indexRealtimeError,
    indexRealtimeLastTick,
    indexRealtimeStatus,
    calcCostBasis,
    Calendar,
    cacheStockLogo,
    calmRoomActiveCount,
    calmRoomAvgActiveDays,
    calmRoomCompletedCount,
    changelogExpanded,
    chartSelectedMonthIdx,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    costBasisActiveSymbol,
    costBasisData,
    db,
    deleteWatchlistItem,
    deleteStockTradeRecord,
    DisciplineModal,
    disciplines,
    displayFgi,
    displayStockName,
    Edit2,
    editingDisciplineId,
    editingLogId,
    editingNoteId,
    editingStock,
    editYearlyActualId,
    exitTargets,
    expandedDisciplines,
    expandedTrades,
    expandedWaves,
    fetchError,
    fetching,
    fetchRealtimePrices: () => fetchRealtimePrices(null, {
      trigger: 'manual-button',
      notifyOnError: true,
      queueIfBusy: true,
      forceBaseline: true,
    }),
    fetchPopularStockQuotes,
    fetchMarketMovers,
    fgi,
    fgiDataDate,
    fgiLabel,
    fgiMonth,
    fgiPrev,
    fgiWeek,
    fgiYear,
    fillMonth,
    filterLevel,
    fmt,
    fmtPct,
    hkdRate,
    homeWatchlist,
    btcMarketCard,
    marketIndices,
    investmentSummary,
    investmentPlan,
    availableCashStatus,
    availableCashStatusReady,
    lastFetched,
    lastSeenAlerts,
    lastSubmitRef,
    Loader2,
    logoCache,
    LogModal,
    LogOut,
    lookupStatus,
    marginStatus,
    marginStatusReady,
    marketColorMode,
    language,
    newAccount,
    newPwd,
    newStock,
    newTrade,
    onLogout,
    openHomeMarginRisk,
    openPnlReport,
    openPnlShare,
    pnlReportRefreshVersion,
    openStockDetail,
    openWatchlistStockDetail,
    openWaveTracker,
    openCommunityCompetition,
    openCommunityProfileSettings,
    openEarningsCalendar,
    openEarningsDetail,
    Pin,
    portfolioCurrencyMode,
    Plus,
    pwdLoading,
    pwdMsg,
    quoteDiagnosticLogs,
    qqqSignalQuote,
    quoteRows,
    RefreshCw,
    requestDeleteLegacyTrade,
    removeStock,
    reorderWatchlist,
    saveWatchlistStockTarget,
    loadAvailableCashMovements,
    mutateAvailableCash,
    saveMarginDebt,
    reviewLogs,
    clearQuoteDiagnosticLogs,
    closeHomeMarginRisk,
    closePnlReport,
    closeStockDetail,
    closeWatchlistStockDetail,
    closeWaveTracker,
    closeCommunityCompetition,
    closeEarningsCalendar,
    closeEarningsDetail,
    earningsCalendarPageState,
    earningsDetailEvent,
    onEarningsCalendarStateChange,
    setAccountDeleteConfirmId,
    setAccounts,
    setAlertsMuted,
    setBenchmarkMenuOpen,
    setBenchmarkSymbol,
    setChangelogExpanded,
    setChartSelectedMonthIdx,
    setCostBasisActiveSymbol,
    setCostBasisData,
    setCostBasisNewSymbol,
    setCostBasisNewTrade,
    setDisciplines,
    setEditingDisciplineId,
    setEditingLogId,
    setEditingNoteId,
    setEditingStock,
    setEditYearlyActualId,
    setExpandedDisciplines,
    setExpandedTrades,
    setExpandedWaves,
    setFillMonth,
    setFilterLevel,
    setHkdRate,
    setInvestmentPlan,
    setLastSeenAlerts,
    setLanguage,
    setLookupStatus,
    setMarginStatus,
    setMarketColorMode,
    setNewAccount,
    setNewPwd,
    setNewStock,
    setNewTrade,
    setPortfolioCurrencyMode,
    setPwdLoading,
    setPwdMsg,
    setReviewLogs,
    setShowAddAccount,
    setShowAddDiscipline,
    setShowAddLog,
    setShowAddStock,
    setShowAddTrade,
    setShowAllDisciplines,
    setShowAllLogs,
    setShowAllYears,
    setShowChangePassword,
    setShowCostBasisAdd,
    setShowCostBasisTrade,
    setTradeEntryScope,
    setShowEditMargin,
    setShowFillSnapshot,
    setShowMonthsDetail,
    setShowPlanSettings,
    setSnapshotDraft,
    setSnapshots,
    setSnapshotTab,
    setUsdRate,
    setVix,
    setVixDataDate,
    setWaveNotes,
    setYearlyActuals,
    showAddAccount,
    showAddDiscipline,
    showAddLog,
    showAddStock,
    showAddTrade,
    showAllDisciplines,
    showAllLogs,
    showAllYears,
    showChangePassword,
    showConfirm,
    showEditMargin,
    showFillSnapshot,
    showMonthsDetail,
    showPlanSettings,
    snapshotDraft,
    snapshots,
    snapshotTab,
    stockTrades,
    stockDetailSymbol,
    watchlistStockDetailFocusSection,
    watchlistStockDetailSymbol,
    stockFreshnessStartedAt: warmStartedAt,
    syncSwingWaveQuoteRows,
    supabase,
    Target,
    tradeEntryScope,
    tradeSubmitting,
    trades,
    Trash2,
    TrendingDown,
    TrendingUp,
    triggeredAlerts,
    updateStockPrice,
    usdRate,
    user,
    vix,
    vixDataDate,
    vixSignal,
    watchlist,
    watchlistAlerts,
    waveNotes,
    wavesByStock,
    WifiOff,
    X,
    YearlyActualModal,
    yearlyActuals,
  };
  const activeTabCtx = activeTab === 'settings'
    ? settingsTabCtx
    : activeTab === 'analysis'
      ? analysisTabCtx
      : tabCtx;
  const darkShell = isStandalonePage || activeTab === 'home' || activeTab === 'trades' || activeTab === 'analysis' || activeTab === 'review' || activeTab === 'settings';
  const showQuoteFetchError = Boolean(fetchError) && QUOTE_ERROR_VISIBLE_TABS.includes(activeTab);
  const costBasisModalLabelClass = 'mb-1.5 block text-[12px] font-normal text-white/[0.62]';
  const costBasisModalInputClass = 'block w-full max-w-full min-w-0 box-border rounded-xl border border-transparent bg-white/[0.06] px-3.5 py-2.5 text-[14px] font-normal text-white outline-none tabular-nums transition placeholder:text-white/[0.28] focus:bg-white/[0.085]';
  const costBasisModalSymbolInputClass = `${costBasisModalInputClass} px-3.5 py-3 uppercase`;
  const submitCostBasisSymbol = () => {
    const sym = normalizeStrictSymbolKey(costBasisNewSymbol);
    if (!sym) {
      showConfirm({
        title: t(language, 'trades.invalidSymbolTitle', '股票代码格式不正确'),
        desc: t(language, 'trades.invalidSymbolDesc', '请输入正确的股票代码,不要包含空格或特殊字符。'),
        confirmText: t(language, 'trades.close', '关闭'),
        confirmStyle: 'primary',
        icon: '!',
        showCancel: false,
      });
      return;
    }
    if (costBasisData[sym]) {
      showConfirm({
        title: t(language, 'trades.symbolExistsTitle', '{{symbol}} 已存在', { symbol: sym }),
        desc: t(language, 'trades.symbolExistsDesc', '这只股票已经在摊薄成本工具中,可以直接切换查看。'),
        confirmText: t(language, 'trades.close', '关闭'),
        confirmStyle: 'primary',
        icon: '!',
        showCancel: false,
      });
      return;
    }
    setCostBasisData(prev => ({ ...prev, [sym]: [] }));
    setCostBasisActiveSymbol(sym);
    setShowCostBasisAdd(false);
  };
  const pullRefreshLabel = pullRefreshStatus === 'updating'
    ? '发现新版本,正在更新'
    : pullRefreshStatus === 'refreshing'
    ? '刷新中'
    : pullRefreshStatus === 'done'
      ? '已刷新'
      : pullRefreshStatus === 'ready'
        ? '松开刷新'
        : '下拉刷新';

  return (
    <div
      className={`min-h-screen ${isFullBleedPage ? 'px-0' : 'px-4'} ${hideBottomNavigation ? 'pb-0' : 'pb-24'} ${darkShell ? 'bg-[#05070b]' : 'bg-slate-50'}`}
      style={{ paddingTop: isStandalonePage ? 0 : 'calc(1rem + env(safe-area-inset-top))' }}
    >
      {pullRefreshStatus !== 'idle' && (
        <div
          className="pointer-events-none fixed left-1/2 z-[140] flex items-center gap-1.5 rounded-full border border-white/10 bg-[#10151d]/95 px-3 py-1.5 text-[11px] font-normal text-white/80 shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-md transition-opacity duration-150"
          style={{
            top: 'calc(env(safe-area-inset-top) + 8px)',
            opacity: Math.min(1, 0.45 + pullRefreshDistance / PULL_REFRESH_MAX_DISTANCE),
            transform: `translate(-50%, ${Math.max(0, pullRefreshDistance - 44)}px)`,
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 text-[#f6b54b] ${pullRefreshStatus === 'refreshing' || pullRefreshStatus === 'updating' ? 'animate-spin' : ''}`} />
          <span>{pullRefreshLabel}</span>
        </div>
      )}
      {/* 🚀 火箭进度条动画 CSS */}
      <style>{`
        @keyframes rocketLaunch {
          0% { width: 0%; }
          100% { width: var(--target-width); }
        }
        .rocket-bar {
          position: relative;
          overflow: hidden;
          width: var(--target-width);
          animation: rocketLaunch 1.2s cubic-bezier(0.25, 0.85, 0.25, 1) forwards;
        }
        .rocket-particle {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #fbbf24;
          box-shadow: 0 0 6px #fbbf24, 0 0 10px rgba(251, 191, 36, 0.5);
          opacity: 0;
          right: 0;
        }
        @keyframes rocketP1 {
          0% { right: 0; opacity: 1; }
          100% { right: 60px; opacity: 0; }
        }
        @keyframes rocketP2 {
          0% { right: 0; opacity: 1; }
          100% { right: 90px; opacity: 0; }
        }
        @keyframes rocketP3 {
          0% { right: 0; opacity: 1; }
          100% { right: 40px; opacity: 0; }
        }
        .rocket-particle-1 { animation: rocketP1 0.9s ease-out 0.3s forwards; }
        .rocket-particle-2 { animation: rocketP2 0.9s ease-out 0.5s forwards; }
        .rocket-particle-3 { animation: rocketP3 0.9s ease-out 0.7s forwards; }

        /* ✨ 年度进度条微光扫过效果 (PE) */
        @keyframes progressShine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .progress-shine { position: relative; overflow: hidden; }
        .progress-shine::after {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 20px; height: 100%;
          background: linear-gradient(90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.5) 50%,
            transparent 100%);
          animation: progressShine 2s linear infinite;
        }
      `}</style>
      <div className="max-w-5xl mx-auto">
        {/* ⚠️ 云端加载失败警告横幅 */}
        {cloudError && (
          <div className="mb-3 px-3 py-2.5 rounded-xl flex items-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '1px solid #f59e0b',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
            }}
          >
            <span className="text-lg">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-black text-amber-900">
                数据未完全同步
              </div>
              <div className="text-[11px] text-amber-800 leading-tight mt-0.5">
                {cloudError}<br/>
                本地数据已保留, 可点击重试
              </div>
            </div>
            <button
              onClick={async () => {
                setCloudError(null);
                try {
                  const result = await db.fetchAllUserData();
                  applyCloudUserData(result, '[云端重试]');
                } catch (e) {
                  setCloudError(e.message || '重试失败');
                }
              }}
              className="px-3 py-1.5 rounded-lg text-[11px] font-black text-white active:scale-95 transition flex-shrink-0"
              style={{ background: '#f59e0b' }}
            >
              🔄 重试
            </button>
          </div>
        )}

        {/* ====== 首页 tab ====== */}
        <Suspense fallback={<TabFallback />}>
          {isPnlReportPage
            ? <PnlReportPage ctx={tabCtx} />
            : isPnlSharePage
              ? (
                <PnlSharePage
                  onClose={closePnlShare}
                  investmentSummary={investmentSummary}
                  language={language}
                  portfolioCurrencyMode={portfolioCurrencyMode}
                  usdRate={usdRate}
                  communityIdentity={pnlShareIdentityState.identity}
                  communityIdentityStatus={pnlShareIdentityState.status}
                />
              )
            : isHomeMarginRiskPage
              ? <HomeMarginRiskPage ctx={tabCtx} />
              : isStockDetailPage
                ? <StockDetailPage ctx={tabCtx} />
                : isWatchlistStockDetailPage
                  ? <WatchlistStockDetailPage ctx={tabCtx} />
                : isWaveTrackerPage
                  ? <WaveTrackerPage ctx={tabCtx} fetchSwingWaveRealtimeSnapshot={fetchSwingWaveRealtimeSnapshot} />
                : isCommunityCompetitionPage
                  ? <CommunityCompetitionPage ctx={tabCtx} />
                : isEarningsCalendarPage
                  ? <EarningsCalendarPage ctx={tabCtx} />
                : isEarningsDetailPage
                  ? <EarningsDetailPage ctx={tabCtx} />
              : <ActiveTab ctx={activeTabCtx} />}
        </Suspense>


        {/* ====== 交易 tab ====== */}


        {/* ====== 资产 tab ====== */}


        {/* ====== 复盘 tab ====== */}


        {/* ====== 设置 tab ====== */}


        <ConfirmModal
          modal={confirmModal}
          submitting={confirmSubmitting}
          onCancel={closeConfirmModal}
          onConfirm={submitConfirmModal}
        />

        {/* === 摊薄成本 - 新增股票弹窗 === */}
        {showCostBasisAdd && (
          <ActionModalCard
            title={t(language, 'trades.addAveragingStock', '新增摊薄股票')}
            closeLabel={t(language, 'trades.closeAddAveragingStock', '关闭新增摊薄股票')}
            onClose={() => setShowCostBasisAdd(false)}
            widthClassName="w-[calc(100vw-32px)] max-w-md"
            panelClassName="min-h-0"
            actions={[
              { key: 'cancel', label: t(language, 'trades.cancel', '取消'), onClick: () => setShowCostBasisAdd(false) },
              { key: 'confirm', label: t(language, 'trades.ok', '确定'), onClick: submitCostBasisSymbol },
            ]}
          >
            <label className="block min-w-0">
              <span className={costBasisModalLabelClass}>{t(language, 'trades.stockTicker', '股票代码')}</span>
              <input
                type="text"
                value={costBasisNewSymbol}
                onChange={e => setCostBasisNewSymbol(e.target.value.toUpperCase())}
                placeholder={t(language, 'trades.tickerPlaceholder', '股票代码 (如 NVDA)')}
                className={costBasisModalSymbolInputClass}
                style={{ fontFamily: 'ui-monospace, monospace' }}
              />
            </label>
            <p className="mt-3 text-[11px] leading-5 text-white/[0.38]">{t(language, 'trades.costBasisIsolatedHint', '创建后只进入独立摊薄工具,不写入正式交易账本。')}</p>
          </ActionModalCard>
        )}

        {/* === 摊薄成本 - 添加交易弹窗 === */}
        {showCostBasisTrade && (
          <ActionModalCard
            title={t(language, 'trades.addAveragingTrade', '添加摊薄交易')}
            closeLabel={t(language, 'trades.closeAddAveragingTrade', '关闭添加摊薄交易')}
            onClose={() => !costBasisSubmitting && setShowCostBasisTrade(false)}
            widthClassName="w-[calc(100vw-24px)] max-w-md"
            panelClassName="min-h-0"
            actions={[
              { key: 'buy', label: costBasisSubmitting ? t(language, 'trades.saving', '保存中...') : t(language, 'trades.buy', '买入'), disabled: costBasisSubmitting, onClick: () => confirmCostBasisTradeSubmit('buy') },
              { key: 'sell', label: costBasisSubmitting ? t(language, 'trades.saving', '保存中...') : t(language, 'trades.sell', '卖出'), disabled: costBasisSubmitting, onClick: () => confirmCostBasisTradeSubmit('sell') },
            ]}
          >
              <div className="min-w-0">
                <div className="mb-3 min-w-0 border-b border-white/10 pb-3">
                  <label className={costBasisModalLabelClass}>{t(language, 'trades.stockTicker', '股票代码')}</label>
                  <input
                    type="text"
                    value={costBasisActiveSymbol || ''}
                    readOnly
                    placeholder={t(language, 'trades.noStockSelected', '未选择股票')}
                    className={`${costBasisModalSymbolInputClass} pr-9`}
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                  />
                </div>

                <div className="mb-3 min-w-0 border-b border-white/10 pb-3">
                  <label className={costBasisModalLabelClass}>{t(language, 'trades.priceShares', '价格与股数')}</label>
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <label className={costBasisModalLabelClass}>{t(language, 'trades.priceUsd', '价格 ($)')}</label>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={costBasisNewTrade.price}
                        onChange={e => setCostBasisNewTrade(prev => ({ ...prev, price: e.target.value }))}
                      placeholder={t(language, 'trades.inputPrice', '输入价格')}
                      className={costBasisModalInputClass}
                      style={{ fontFamily: 'ui-monospace, monospace' }}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={costBasisModalLabelClass}>{t(language, 'trades.quantity', '股数')}</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={costBasisNewTrade.shares}
                        onChange={e => setCostBasisNewTrade(prev => ({ ...prev, shares: e.target.value }))}
                        placeholder={t(language, 'trades.inputShares', '输入股数')}
                        className={costBasisModalInputClass}
                        style={{ fontFamily: 'ui-monospace, monospace' }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-3 min-w-0 border-b border-white/10 pb-3">
                  <label className={costBasisModalLabelClass}>{t(language, 'trades.date', '日期')}</label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.48]" strokeWidth={1.8} />
                    <input
                      type="date"
                      value={costBasisNewTrade.date}
                      onChange={e => setCostBasisNewTrade(prev => ({ ...prev, date: e.target.value }))}
                      className={`${costBasisModalInputClass} appearance-none pl-9 pr-8 text-left font-normal`}
                      style={{ colorScheme: 'dark', WebkitAppearance: 'none' }}
                    />
                    <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.38]" strokeWidth={1.8} />
                  </div>
                </div>

              </div>
          </ActionModalCard>
        )}

        {/* 底部 5 tab 导航栏 */}
        {!hideBottomNavigation && (
        <div
          className={`fixed bottom-0 left-0 right-0 shadow-2xl z-50 ${darkShell ? 'bg-[#070a0f] border-t border-white/10' : 'bg-white border-t border-slate-200'}`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-5">
              {[
                { id: 'home',     label: t(language, 'nav.home', '首页'), icon: Home },
                { id: 'trades',   label: t(language, 'nav.trades', '交易'), icon: ListChecks },
                { id: 'analysis', label: t(language, 'nav.analysis', '资产'), icon: Wallet },
                { id: 'review',   label: t(language, 'nav.review', '目标'), icon: Target },
                { id: 'settings', label: t(language, 'nav.settings', '设置'), icon: Settings },
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleBottomTabClick(tab.id)}
                    className={`flex flex-col items-center justify-center py-2 active:scale-95 transition ${
                      darkShell
                        ? (isActive ? 'text-[#f6a524]' : 'text-white/40')
                        : (isActive ? 'text-blue-600' : 'text-slate-400')
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                    <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            {/* 拉取错误提示(浮在导航栏上方) */}
            {showQuoteFetchError && (
              <div className="absolute -top-10 left-2 right-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-1 shadow">
                <WifiOff className="w-3 h-3" /> {t(language, 'home.market.fetchFailed', '行情拉取失败')}:{fetchError}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}


export default MainApp;

// ============================================
// 📅 最后修改时间: 2026-06-10 (美东) / 06-11 (北京)
// 📝 本次更新: v10.7.9.46 - 首页"当前猎手状态" → "当前信号" 🏷
//
// 📝 v10.7.9.45 - 改名 Quote + 开屏调速 🎨
//
//   Bottomline → Quote 全套改名:
//   - 开屏动画: 金色 X 两笔画描出 + Quote (去掉 BOTTOMLINE)
//   - 头部 logo: B 方块 → X 方块, 文字 → Quote
//   - 关于卡 / index.html title / manifest PWA 名
//   - favicon.svg 重画: 黑底金色经典 X + 圆角方块
//   ⚠️ localStorage key (bottomline_*) 保持不变, 不动用户数据
//
// 📝 v10.7.9.43 - 预警文案理性化 (保留进攻性) 🧠
//
//   ALERT_LEVELS 9 档 + FGI 5 档全部重写:
//   - 原则: 指令式→提示式, 风控前置 (维持率检查), 分批钉进句子
//   - L6: "满仓100%" → "留 10-20% 应急弹药" (满仓后 L7-L9 没子弹, 原方案自相矛盾)
//   - L7: "满仓持有,继续加" → "维持率安全则可继续进攻"
//   - L8: "所有现金加杠杆" → "先核维持率, 弹药分 2-3 次打" (账户本身已 1.25-1.3x 杠杆)
//   - L9: "世纪机会" → "敢买但分批, 底部无法预知" (2008 从 -40% 又跌到 -55%)
//   - FGI: "梭哈买入" → "分批进攻" / "清仓离场" → "减仓为主, 留核心仓" (符合核心+卫星体系)
//   - 速查表自动同步 (直接 map ALERT_LEVELS, 一处改全生效)
//
// 📝 v10.7.9.42 - 资产走势 Modal 黑金化 + 环比金额 💰
//
//   1) Modal 改黑金质感 (白底 → #0f0f0f, 跟家庭总资产卡同调)
//   2) 每月新增环比金额: 之前只有 ↑8.1%, 现在 +233.2万 · ↑8.1%
//   3) 起始月 (最早月无对比) 显示"起始月", 持平显示"±0"
//
// 📝 v10.7.9.41 - 修复猎手状态 QQQ 回撤拉取不到 🎯
//
//   核心 bug: 首页"当前猎手状态"的 QQQ 回撤一直拉不到真实数据
//
//   根因 (两个叠加):
//   1) QQQ 没进 API 请求列表 (只请求 watchlist+VIX+FGI+INDICES)
//      → result.data 里找不到 d.symbol==='QQQ' → qqqCurrent/High 不更新
//      → 数据藏在 INDICES 子数组里, 但那个只有当日高没有 52周高
//   2) qqqHigh 用 Math.max(prev, 当前价), 从不读 API 的 week52High
//      → 永远停在写死的初始值 640.47
//
//   修复:
//   - 把 QQQ/TQQQ 显式加进主请求 (Set 去重), 走完整 stock 接口
//   - QQQ 52周高直接信任 API week52High, 跟 watchlist 同源
//   - 不用 Math.max(prev) 粘滞, 避免脏数据顶死
//
// ── 历史 ──
// 📝 v10.7.9.3 - 关注列表再扩宽 📐
//
//   3 项优化:
//
//   1) 删除右上角 ✕ 删除按钮
//      原因: 点卡片就能进编辑模式删除, 重复
//      节省: 16px 按钮 + 28px 右 padding = 44px 内容空间
//
//   2) 卡之间分割线: 双线 → 单线
//      之前: border-y (上+下) → 相邻卡 2 条
//      现在: border-b (只下) → 相邻卡 1 条
//      视觉更清爽
//
//   3) 删除股票统一入口
//      点卡片 → 编辑模式 → 底部"🗑 删除该股票"
//      window.confirm 二次确认 (防误删)
//      跟其他模块的"二次确认"体验一致
//
//   总计: 内容宽度 ~315px → ~329px (+14px)
//
// 📦 v10.7.9.1: 入侵式占满全屏
// 📦 v10.7.9.0: 关注列表对称两块
// ============================================
