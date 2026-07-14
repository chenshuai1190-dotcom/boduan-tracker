import {
  buildPnlReportHistoricalSnapshots,
  currentNewYorkDate,
  isNewYorkSnapshotWindowOpen,
  latestCompletedUsTradingDate,
  resolveScheduledUsSnapshotDate,
} from '../src/lib/pnlReportSnapshots.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';

const STOCK_TRADES_PAGE_SIZE = 1000;
const EODHD_LOOKBACK_DAYS = 21;
const PNL_CATCH_UP_WINDOW_DAYS = 31;
const EODHD_MAX_ATTEMPTS = 3;
const EODHD_RETRY_DELAYS_MS = [250, 750];
const SHARE_EPSILON = 1e-8;

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateParam(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) return null;
  return raw;
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function normalizeEodhdSymbol(symbol) {
  return normalizeSymbol(symbol).replace(/\.US$/, '');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getHeader(req, name) {
  const lowerName = String(name || '').toLowerCase();
  const headers = req?.headers || {};
  if (typeof headers.get === 'function') return headers.get(lowerName) || headers.get(name) || '';
  return headers[lowerName] || headers[name] || '';
}

function getSupabaseAdminConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('收益报表自动快照服务未配置: 缺少 Supabase URL 或 service role key');
    error.status = 500;
    throw error;
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
  };
}

function adminJsonHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function supabaseAdminFetch(path, options = {}) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig();
  const url = new URL(path, `${supabaseUrl}/`);
  let response;
  try {
    response = await fetchWithTimeout(url, {
      ...options,
      headers: adminJsonHeaders(serviceRoleKey, options.headers || {}),
    }, {
      provider: 'supabase-pnl-daily-snapshot',
      timeoutMs: QUOTE_TIMEOUTS.default,
    });
  } catch (cause) {
    const error = new Error('Supabase REST request failed');
    error.status = null;
    error.retryable = true;
    error.reason = cause?.name === 'ProviderTimeoutError'
      ? 'supabase_timeout'
      : 'supabase_network_error';
    throw error;
  }
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const message = body?.message || body?.error_description || body?.error || `Supabase REST ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.retryable = isRetryableHttpStatus(Number(response.status) || 0);
    error.reason = `supabase_http_${Number(response.status) || 0}`;
    error.body = body;
    throw error;
  }
  return body;
}

function mapStockTradeRow(row) {
  const symbol = normalizeSymbol(row?.symbol);
  return {
    id: row?.id,
    userId: row?.user_id,
    user_id: row?.user_id,
    symbol,
    name: row?.name || symbol,
    side: row?.side === 'sell' ? 'sell' : 'buy',
    trade_date: String(row?.trade_date || row?.date || '').slice(0, 10),
    date: String(row?.trade_date || row?.date || '').slice(0, 10),
    price: toNumber(row?.price),
    shares: toNumber(row?.shares),
    fee: toNumber(row?.fee),
    currency: row?.currency || 'USD',
    note: row?.note || '',
    created_at: row?.created_at || '',
  };
}

function isValidTrade(trade) {
  return Boolean(
    trade?.user_id
    && trade?.symbol
    && trade?.trade_date
    && trade.price > 0
    && trade.shares > 0
  );
}

async function fetchAllStockTrades() {
  const select = [
    'id',
    'user_id',
    'symbol',
    'name',
    'side',
    'trade_date',
    'price',
    'shares',
    'fee',
    'currency',
    'note',
    'created_at',
  ].join(',');
  const rows = [];
  let offset = 0;
  while (true) {
    const url = new URL('/rest/v1/stock_trades', 'https://placeholder.local');
    url.searchParams.set('select', select);
    url.searchParams.set('order', 'user_id.asc,trade_date.asc,created_at.asc');
    const page = await supabaseAdminFetch(`${url.pathname}${url.search}`, {
      headers: {
        Range: `${offset}-${offset + STOCK_TRADES_PAGE_SIZE - 1}`,
      },
    });
    const pageRows = Array.isArray(page) ? page : [];
    rows.push(...pageRows);
    if (pageRows.length < STOCK_TRADES_PAGE_SIZE) break;
    offset += STOCK_TRADES_PAGE_SIZE;
  }
  return rows.map(mapStockTradeRow).filter(isValidTrade);
}

function groupTradesByUser(stockTrades) {
  const grouped = new Map();
  stockTrades.forEach((trade) => {
    if (!grouped.has(trade.user_id)) grouped.set(trade.user_id, []);
    grouped.get(trade.user_id).push(trade);
  });
  return grouped;
}

function requiredCloseSymbolsForUser(userTrades, targetDate) {
  const sharesBySymbol = new Map();
  [...userTrades].sort((a, b) => (
    String(a?.trade_date || '').localeCompare(String(b?.trade_date || ''))
    || String(a?.created_at || '').localeCompare(String(b?.created_at || ''))
    || String(a?.id || '').localeCompare(String(b?.id || ''))
  )).forEach((trade) => {
    if (!trade?.symbol || trade.trade_date > targetDate) return;
    const currentShares = sharesBySymbol.get(trade.symbol) || 0;
    if (trade.side === 'sell') {
      const closedShares = Math.min(trade.shares, Math.max(0, currentShares));
      sharesBySymbol.set(trade.symbol, Math.max(0, currentShares - closedShares));
      return;
    }
    sharesBySymbol.set(trade.symbol, currentShares + trade.shares);
  });
  return new Set(
    [...sharesBySymbol.entries()]
      .filter(([, shares]) => shares > SHARE_EPSILON)
      .map(([symbol]) => symbol)
  );
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function providerFailure(message, {
  retryable,
  status = null,
  reason = 'provider_error',
} = {}) {
  const error = new Error(message);
  error.retryable = Boolean(retryable);
  error.status = status;
  error.reason = reason;
  return error;
}

function isRetryableHttpStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function getEodhdKey() {
  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) {
    const error = new Error('API key 未配置,请在 Vercel 环境变量里设置 EODHD_API_KEY');
    error.status = 500;
    throw error;
  }
  return eodhdKey;
}

function parseEodRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const date = String(row?.date || '').slice(0, 10);
      const adjustedClose = Number(row?.adjusted_close);
      const rawClose = Number(row?.close);
      const close = Number.isFinite(adjustedClose) && adjustedClose > 0 ? adjustedClose : rawClose;
      if (!date || !Number.isFinite(close) || close <= 0) return null;
      return {
        date,
        close,
        adjustedClose: Number.isFinite(adjustedClose) && adjustedClose > 0 ? adjustedClose : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchSymbolCloseRows(symbol, {
  eodhdKey,
  from,
  to,
  requiredDates = [],
}) {
  const eodSymbol = normalizeEodhdSymbol(symbol);
  const url = `https://eodhd.com/api/eod/${encodeURIComponent(eodSymbol)}.US?api_token=${encodeURIComponent(eodhdKey)}&from=${from}&to=${to}&period=d&fmt=json`;
  let lastError = null;
  let attempts = 0;

  while (attempts < EODHD_MAX_ATTEMPTS) {
    attempts += 1;
    try {
      const response = await fetchWithTimeout(url, {}, {
        provider: 'eodhd-pnl-daily-snapshot',
        timeoutMs: QUOTE_TIMEOUTS.eodhd,
      });
      if (!response.ok) {
        const status = Number(response.status) || 0;
        throw providerFailure(`${symbol} HTTP ${status}`, {
          retryable: isRetryableHttpStatus(status),
          status,
          reason: `http_${status}`,
        });
      }
      const payload = await response.json().catch(() => null);
      const rows = parseEodRows(payload);
      const normalizedRequiredDates = [...new Set(
        (Array.isArray(requiredDates) ? requiredDates : [])
          .map(normalizeDateParam)
          .filter(Boolean)
      )];
      const availableDates = new Set(rows.map((row) => row.date));
      const missingDates = normalizedRequiredDates.filter((date) => !availableDates.has(date));
      if (rows.length === 0 || missingDates.length > 0) {
        const error = providerFailure(
          missingDates.length > 0
            ? `${symbol} missing completed close`
            : `${symbol} has no completed close`,
          {
            retryable: true,
            reason: missingDates.length > 0 ? 'missing_target_close' : 'missing_close_rows',
          }
        );
        error.rows = rows;
        throw error;
      }
      return [symbol, rows];
    } catch (error) {
      const normalizedError = typeof error?.retryable === 'boolean'
        ? error
        : providerFailure(`${symbol} provider request failed`, {
          retryable: true,
          reason: error?.name === 'ProviderTimeoutError' ? 'timeout' : 'network_error',
        });
      normalizedError.attempts = attempts;
      lastError = normalizedError;
      if (!normalizedError.retryable || attempts >= EODHD_MAX_ATTEMPTS) break;
      await wait(EODHD_RETRY_DELAYS_MS[attempts - 1] || 0);
    }
  }

  throw lastError || providerFailure(`${symbol} provider request failed`, {
    retryable: true,
    reason: 'provider_error',
  });
}

async function fetchHistoricalClosesBySymbol(symbols, {
  targetDate,
  fromDate = null,
  requiredDatesBySymbol = null,
}) {
  const eodhdKey = getEodhdKey();

  const to = targetDate;
  const from = normalizeDateParam(fromDate) || shiftDate(targetDate, -EODHD_LOOKBACK_DAYS);
  if (!from) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }
  const settled = await Promise.allSettled(
    symbols.map((symbol) => fetchSymbolCloseRows(symbol, {
      eodhdKey,
      from,
      to,
      requiredDates: requiredDatesBySymbol instanceof Map
        ? [...(requiredDatesBySymbol.get(symbol) || [])]
        : [targetDate],
    }))
  );
  const historicalClosesBySymbol = {};
  const failedSymbols = [];
  settled.forEach((entry, index) => {
    const symbol = symbols[index];
    if (entry.status === 'fulfilled') {
      const [resolvedSymbol, rows] = entry.value;
      historicalClosesBySymbol[resolvedSymbol] = rows;
      return;
    }
    if (Array.isArray(entry.reason?.rows) && entry.reason.rows.length > 0) {
      historicalClosesBySymbol[symbol] = entry.reason.rows;
    }
    failedSymbols.push({
      symbol,
      retryable: Boolean(entry.reason?.retryable),
      status: Number(entry.reason?.status) || null,
      reason: String(entry.reason?.reason || 'provider_error').slice(0, 80),
      attempts: Number(entry.reason?.attempts) || 1,
    });
  });
  return { historicalClosesBySymbol, failedSymbols };
}

async function fetchUsTradingDatesThroughTarget(targetDate) {
  const from = shiftDate(targetDate, -PNL_CATCH_UP_WINDOW_DAYS);
  if (!from) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }
  const [, rows] = await fetchSymbolCloseRows('SPY', {
    eodhdKey: getEodhdKey(),
    from,
    to: targetDate,
    // Do not let a stale HTTP 200 payload silently move the run backwards.
    // A US holiday can temporarily return 503 here; the following real
    // trading date will include the missed gap in this catch-up window.
    requiredDates: [targetDate],
  });
  return rows
    .map((row) => row.date)
    .filter((date) => date >= from && date <= targetDate)
    .sort();
}

function buildTradingCalendarFailureResult(error, {
  targetDate,
  catchUp,
  lockedAt,
  symbolsCount = 0,
}) {
  return {
    success: false,
    complete: false,
    retryable: Boolean(error?.retryable),
    targetDate,
    catchUp: Boolean(catchUp),
    attemptedUsers: 0,
    writtenUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    plannedSnapshots: 0,
    attemptedSnapshots: 0,
    writtenSnapshots: 0,
    skippedSnapshots: 0,
    failedSnapshots: 0,
    deferredSnapshots: 0,
    symbolsCount,
    failedSymbolsCount: 1,
    failedSymbols: [{
      symbol: 'SPY',
      retryable: Boolean(error?.retryable),
      status: Number(error?.status) || null,
      reason: String(error?.reason || 'calendar_provider_error').slice(0, 80),
      attempts: Number(error?.attempts) || 1,
    }],
    optionalFailedSymbolsCount: 0,
    source: 'EODHD_EOD',
    generatedAt: lockedAt,
  };
}

async function fetchLatestSnapshotDatesByUser(userIds, targetDate) {
  const entries = await Promise.all(userIds.map(async (userId) => {
    const url = new URL('/rest/v1/pnl_report_snapshots', 'https://placeholder.local');
    url.searchParams.set('select', 'snapshot_date');
    url.searchParams.set('user_id', `eq.${userId}`);
    url.searchParams.set('snapshot_date', `lte.${targetDate}`);
    url.searchParams.set('order', 'snapshot_date.desc');
    url.searchParams.set('limit', '1');
    const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`);
    return [userId, normalizeDateParam(Array.isArray(rows) ? rows[0]?.snapshot_date : null)];
  }));
  return new Map(entries);
}

function buildPendingSnapshotDatesByUser(groupedByUser, tradingDates, latestDatesByUser) {
  const targetDate = tradingDates.at(-1) || null;
  const pendingByUser = new Map();
  for (const userId of groupedByUser.keys()) {
    const latestDate = latestDatesByUser.get(userId) || null;
    const pendingDates = latestDate
      ? tradingDates.filter((date) => date > latestDate)
      : (targetDate ? [targetDate] : []);
    pendingByUser.set(userId, pendingDates);
  }
  return pendingByUser;
}

function requiredCloseDatesBySymbol(groupedByUser, pendingDatesByUser) {
  const requiredBySymbol = new Map();
  for (const [userId, pendingDates] of pendingDatesByUser.entries()) {
    const userTrades = groupedByUser.get(userId) || [];
    pendingDates.forEach((date) => {
      requiredCloseSymbolsForUser(userTrades, date).forEach((symbol) => {
        if (!requiredBySymbol.has(symbol)) requiredBySymbol.set(symbol, new Set());
        requiredBySymbol.get(symbol).add(date);
      });
    });
  }
  return requiredBySymbol;
}

function toPortfolioSnapshotRow(snapshot, userId) {
  return {
    user_id: userId,
    snapshot_date: snapshot.snapshotDate,
    currency: snapshot.currency || 'USD',
    cash_usd: snapshot.cashUsd || 0,
    market_value_usd: snapshot.marketValueUsd || 0,
    total_assets_usd: snapshot.totalAssetsUsd || 0,
    realized_pnl_usd: snapshot.realizedPnlUsd || 0,
    unrealized_pnl_usd: snapshot.unrealizedPnlUsd || 0,
    cumulative_pnl_usd: snapshot.cumulativePnlUsd || 0,
    cumulative_pnl_pct: snapshot.cumulativePnlPct || 0,
    daily_pnl_usd: snapshot.dailyPnlUsd == null ? null : snapshot.dailyPnlUsd,
    daily_pnl_pct: snapshot.dailyPnlPct == null ? null : snapshot.dailyPnlPct,
    total_buy_cost_usd: snapshot.totalBuyCostUsd || 0,
    sell_proceeds_usd: snapshot.sellProceedsUsd || 0,
    trade_count: snapshot.tradeCount || 0,
    holding_count: snapshot.holdingCount || 0,
    source_version: snapshot.sourceVersion || 'pnl_snapshot_v1',
    locked_at: snapshot.lockedAt || null,
    updated_at: new Date().toISOString(),
  };
}

function toSymbolSnapshotRow(snapshot, userId, snapshotDate) {
  return {
    user_id: userId,
    snapshot_date: snapshot.snapshotDate || snapshotDate,
    symbol: normalizeSymbol(snapshot.symbol),
    name: snapshot.name || snapshot.symbol || '',
    currency: snapshot.currency || 'USD',
    held_shares: snapshot.heldShares || 0,
    avg_cost_usd: snapshot.avgCostUsd || 0,
    remaining_cost_usd: snapshot.remainingCostUsd || 0,
    current_price_usd: snapshot.currentPriceUsd || 0,
    previous_close_usd: snapshot.previousCloseUsd || 0,
    market_value_usd: snapshot.marketValueUsd || 0,
    realized_pnl_usd: snapshot.realizedPnlUsd || 0,
    unrealized_pnl_usd: snapshot.unrealizedPnlUsd || 0,
    cumulative_pnl_usd: snapshot.cumulativePnlUsd || 0,
    daily_pnl_usd: snapshot.dailyPnlUsd == null ? null : snapshot.dailyPnlUsd,
    daily_pnl_pct: snapshot.dailyPnlPct == null ? null : snapshot.dailyPnlPct,
    total_buy_cost_usd: snapshot.totalBuyCostUsd || 0,
    sell_proceeds_usd: snapshot.sellProceedsUsd || 0,
    sold_cost_usd: snapshot.soldCostUsd || 0,
    total_buy_shares: snapshot.totalBuyShares || 0,
    total_sell_shares: snapshot.totalSellShares || 0,
    is_open: Boolean(snapshot.isOpen),
    source_version: snapshot.sourceVersion || 'pnl_snapshot_v1',
    updated_at: new Date().toISOString(),
  };
}

async function upsertUserSnapshots(userId, built) {
  const snapshotDate = built?.portfolioSnapshot?.snapshotDate;
  if (!userId || !snapshotDate || !built?.portfolioSnapshot) {
    throw new Error('缺少收益报表快照数据');
  }

  // pnl_report_snapshots is the completion marker read by scheduled catch-up.
  // Remove it before any symbol mutation so a partial rerun remains visible
  // and repairable. The marker is recreated only after all symbols succeed.
  const markerDeleteUrl = new URL('/rest/v1/pnl_report_snapshots', 'https://placeholder.local');
  markerDeleteUrl.searchParams.set('user_id', `eq.${userId}`);
  markerDeleteUrl.searchParams.set('snapshot_date', `eq.${snapshotDate}`);
  await supabaseAdminFetch(`${markerDeleteUrl.pathname}${markerDeleteUrl.search}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  const deleteUrl = new URL('/rest/v1/pnl_report_symbol_snapshots', 'https://placeholder.local');
  deleteUrl.searchParams.set('user_id', `eq.${userId}`);
  deleteUrl.searchParams.set('snapshot_date', `eq.${snapshotDate}`);
  await supabaseAdminFetch(`${deleteUrl.pathname}${deleteUrl.search}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  const symbolRows = (Array.isArray(built.symbolSnapshots) ? built.symbolSnapshots : [])
    .map((snapshot) => toSymbolSnapshotRow(snapshot, userId, snapshotDate))
    .filter((row) => row.symbol && row.snapshot_date);
  if (symbolRows.length > 0) {
    const symbolUrl = new URL('/rest/v1/pnl_report_symbol_snapshots', 'https://placeholder.local');
    symbolUrl.searchParams.set('on_conflict', 'user_id,snapshot_date,symbol');
    await supabaseAdminFetch(`${symbolUrl.pathname}${symbolUrl.search}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(symbolRows),
    });
  }

  // The portfolio row is the completion marker read by scheduled catch-up.
  // Write it last so a partial symbol write cannot make the next run skip this date.
  const portfolioUrl = new URL('/rest/v1/pnl_report_snapshots', 'https://placeholder.local');
  portfolioUrl.searchParams.set('on_conflict', 'user_id,snapshot_date');
  await supabaseAdminFetch(`${portfolioUrl.pathname}${portfolioUrl.search}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([toPortfolioSnapshotRow(built.portfolioSnapshot, userId)]),
  });
}

export function authorizePnlReportDailySnapshot(req) {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    return {
      ok: false,
      status: 500,
      error: '收益报表自动快照未配置: 缺少 CRON_SECRET',
    };
  }
  const authHeader = String(getHeader(req, 'authorization') || '').trim();
  if (authHeader !== `Bearer ${cronSecret}`) {
    return {
      ok: false,
      status: 401,
      error: '未授权: Cron secret 不匹配',
    };
  }
  return { ok: true };
}

export function resolveDailySnapshotTargetDate(req, now = new Date()) {
  const explicitDate = hasExplicitDailySnapshotTargetDate(req);
  const rawDate = firstQueryValue(req?.query?.date);
  const requestedDate = normalizeDateParam(rawDate);
  if (explicitDate && !requestedDate) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }
  if (explicitDate) {
    const today = currentNewYorkDate(now);
    if (requestedDate > today) {
      const error = new Error('目标日期不能晚于美东当前日期');
      error.status = 400;
      throw error;
    }
    if (requestedDate === today && !isNewYorkSnapshotWindowOpen(now)) {
      const error = new Error('当天快照须在美东 17:00 后生成');
      error.status = 400;
      throw error;
    }
    return requestedDate;
  }
  return resolveScheduledUsSnapshotDate(now);
}

export function hasExplicitDailySnapshotTargetDate(req) {
  return Boolean(req?.query && Object.prototype.hasOwnProperty.call(req.query, 'date'));
}

export async function runPnlReportDailySnapshot({
  targetDate = latestCompletedUsTradingDate(new Date()),
  now = new Date(),
  catchUp = false,
} = {}) {
  const requestedTargetDate = normalizeDateParam(targetDate);
  if (!requestedTargetDate) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }

  const lockedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  // Explicit repair requests do not use the scheduled catch-up calendar path.
  // Confirm the exact US market close first so a weekend/holiday can never
  // create a zero-value snapshot, including for users whose positions are empty.
  // This must stay before every Supabase read and write.
  if (!catchUp) {
    try {
      await fetchUsTradingDatesThroughTarget(requestedTargetDate);
    } catch (error) {
      return buildTradingCalendarFailureResult(error, {
        targetDate: requestedTargetDate,
        catchUp: false,
        lockedAt,
      });
    }
  }

  const stockTrades = await fetchAllStockTrades();
  const groupedByUser = groupTradesByUser(stockTrades);
  const symbols = [...new Set(stockTrades.map((trade) => trade.symbol).filter(Boolean))].sort();
  if (groupedByUser.size === 0) {
    return {
      success: true,
      complete: true,
      retryable: false,
      targetDate: requestedTargetDate,
      catchUp: Boolean(catchUp),
      attemptedUsers: 0,
      writtenUsers: 0,
      skippedUsers: 0,
      failedUsers: 0,
      plannedSnapshots: 0,
      attemptedSnapshots: 0,
      writtenSnapshots: 0,
      skippedSnapshots: 0,
      failedSnapshots: 0,
      deferredSnapshots: 0,
      symbolsCount: 0,
      failedSymbolsCount: 0,
      failedSymbols: [],
      optionalFailedSymbolsCount: 0,
      source: 'EODHD_EOD',
      generatedAt: lockedAt,
    };
  }

  let tradingDates = [requestedTargetDate];
  let pendingDatesByUser = new Map(
    [...groupedByUser.keys()].map((userId) => [userId, [requestedTargetDate]])
  );
  if (catchUp) {
    try {
      tradingDates = await fetchUsTradingDatesThroughTarget(requestedTargetDate);
    } catch (error) {
      return buildTradingCalendarFailureResult(error, {
        targetDate: requestedTargetDate,
        catchUp: true,
        lockedAt,
        symbolsCount: symbols.length,
      });
    }
    if (tradingDates.length === 0) {
      return {
        success: false,
        complete: false,
        retryable: true,
        targetDate: requestedTargetDate,
        catchUp: true,
        attemptedUsers: 0,
        writtenUsers: 0,
        skippedUsers: 0,
        failedUsers: 0,
        plannedSnapshots: 0,
        attemptedSnapshots: 0,
        writtenSnapshots: 0,
        skippedSnapshots: 0,
        failedSnapshots: 0,
        deferredSnapshots: 0,
        symbolsCount: symbols.length,
        failedSymbolsCount: 1,
        failedSymbols: [{
          symbol: 'SPY',
          retryable: true,
          status: null,
          reason: 'missing_trading_calendar',
          attempts: EODHD_MAX_ATTEMPTS,
        }],
        optionalFailedSymbolsCount: 0,
        source: 'EODHD_EOD',
        generatedAt: lockedAt,
      };
    }
    const effectiveTargetDate = tradingDates.at(-1);
    const latestDatesByUser = await fetchLatestSnapshotDatesByUser(
      [...groupedByUser.keys()],
      effectiveTargetDate
    );
    pendingDatesByUser = buildPendingSnapshotDatesByUser(
      groupedByUser,
      tradingDates,
      latestDatesByUser
    );
  }

  const effectiveTargetDate = tradingDates.at(-1) || requestedTargetDate;
  const plannedDates = [...new Set(
    [...pendingDatesByUser.values()].flatMap((dates) => dates)
  )].sort();
  const plannedSnapshots = [...pendingDatesByUser.values()]
    .reduce((sum, dates) => sum + dates.length, 0);
  const attemptedUserCount = [...pendingDatesByUser.values()]
    .filter((dates) => dates.length > 0).length;
  if (plannedSnapshots === 0) {
    return {
      success: true,
      complete: true,
      retryable: false,
      targetDate: effectiveTargetDate,
      catchUp: Boolean(catchUp),
      attemptedUsers: 0,
      writtenUsers: 0,
      skippedUsers: 0,
      failedUsers: 0,
      plannedSnapshots: 0,
      attemptedSnapshots: 0,
      writtenSnapshots: 0,
      skippedSnapshots: 0,
      failedSnapshots: 0,
      deferredSnapshots: 0,
      tradingDatesCount: tradingDates.length,
      symbolsCount: symbols.length,
      failedSymbolsCount: 0,
      failedSymbols: [],
      optionalFailedSymbolsCount: 0,
      source: 'EODHD_EOD',
      generatedAt: lockedAt,
    };
  }

  const requiredDatesBySymbol = requiredCloseDatesBySymbol(groupedByUser, pendingDatesByUser);
  const requiredSymbols = new Set(requiredDatesBySymbol.keys());
  const earliestPlannedDate = plannedDates[0] || effectiveTargetDate;
  const { historicalClosesBySymbol, failedSymbols: providerFailedSymbols } = symbols.length > 0
    ? await fetchHistoricalClosesBySymbol(symbols, {
      targetDate: effectiveTargetDate,
      fromDate: shiftDate(earliestPlannedDate, -EODHD_LOOKBACK_DAYS),
      requiredDatesBySymbol,
    })
    : { historicalClosesBySymbol: {}, failedSymbols: [] };
  const failedSymbols = providerFailedSymbols.filter((entry) => requiredSymbols.has(entry.symbol));
  const optionalFailedSymbols = providerFailedSymbols.filter((entry) => !requiredSymbols.has(entry.symbol));
  const result = {
    success: true,
    complete: true,
    retryable: false,
    targetDate: effectiveTargetDate,
    catchUp: Boolean(catchUp),
    attemptedUsers: attemptedUserCount,
    writtenUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    plannedSnapshots,
    attemptedSnapshots: 0,
    writtenSnapshots: 0,
    skippedSnapshots: 0,
    failedSnapshots: 0,
    deferredSnapshots: 0,
    tradingDatesCount: tradingDates.length,
    symbolsCount: symbols.length,
    failedSymbolsCount: failedSymbols.length,
    failedSymbols,
    optionalFailedSymbolsCount: optionalFailedSymbols.length,
    source: 'EODHD_EOD',
    generatedAt: lockedAt,
    skippedReasons: {},
    failedReasons: {},
  };

  const blockedUsers = new Set();
  const writtenUsers = new Set();
  const skippedUsers = new Set();
  const failedUsers = new Set();
  let retryableSnapshotFailures = 0;
  let permanentSnapshotFailures = 0;
  for (const snapshotDate of plannedDates) {
    for (const [userId, userTrades] of groupedByUser.entries()) {
      const pendingDates = pendingDatesByUser.get(userId) || [];
      if (!pendingDates.includes(snapshotDate)) continue;
      if (blockedUsers.has(userId)) {
        result.deferredSnapshots += 1;
        continue;
      }
      result.attemptedSnapshots += 1;
      try {
        const builtHistory = buildPnlReportHistoricalSnapshots({
          stockTrades: userTrades,
          historicalClosesBySymbol,
          snapshotDates: [snapshotDate],
          toDate: snapshotDate,
          maxSnapshots: 1,
          lockedAt,
          backfillMode: 'ledger',
        });
        const built = builtHistory.snapshots[0];
        if (!built) {
          result.skippedSnapshots += 1;
          skippedUsers.add(userId);
          blockedUsers.add(userId);
          const reason = builtHistory.skippedDates[0]?.reason || 'no_snapshot';
          result.skippedReasons[reason] = (result.skippedReasons[reason] || 0) + 1;
          continue;
        }
        await upsertUserSnapshots(userId, built);
        result.writtenSnapshots += 1;
        writtenUsers.add(userId);
      } catch (error) {
        result.failedSnapshots += 1;
        failedUsers.add(userId);
        blockedUsers.add(userId);
        const status = Number(error?.status) || 0;
        const isRetryable = Boolean(error?.retryable);
        if (isRetryable) retryableSnapshotFailures += 1;
        else permanentSnapshotFailures += 1;
        const reason = status > 0
          ? `snapshot_write_http_${status}`
          : (isRetryable ? 'snapshot_write_transient_error' : 'snapshot_write_error');
        result.failedReasons[reason] = (result.failedReasons[reason] || 0) + 1;
      }
    }
  }

  result.writtenUsers = writtenUsers.size;
  result.skippedUsers = skippedUsers.size;
  result.failedUsers = failedUsers.size;
  result.complete = result.failedSymbolsCount === 0
    && result.failedSnapshots === 0
    && result.skippedSnapshots === 0
    && result.deferredSnapshots === 0
    && result.writtenSnapshots === result.plannedSnapshots;
  const hasRetryableFailure = failedSymbols.some((entry) => entry.retryable)
    || retryableSnapshotFailures > 0
    || (result.failedSymbolsCount === 0 && (result.skippedReasons.missing_close || 0) > 0);
  const hasPermanentFailure = failedSymbols.some((entry) => !entry.retryable)
    || permanentSnapshotFailures > 0
    || Object.entries(result.skippedReasons)
      .some(([reason, count]) => reason !== 'missing_close' && count > 0);
  result.retryable = hasRetryableFailure && !hasPermanentFailure;
  result.success = result.complete;
  return result;
}
