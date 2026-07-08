import {
  buildPnlReportHistoricalSnapshots,
  latestCompletedUsTradingDate,
} from '../src/lib/pnlReportSnapshots.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';

const STOCK_TRADES_PAGE_SIZE = 1000;
const EODHD_LOOKBACK_DAYS = 21;

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateParam(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
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
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: adminJsonHeaders(serviceRoleKey, options.headers || {}),
  }, {
    provider: 'supabase-pnl-daily-snapshot',
    timeoutMs: QUOTE_TIMEOUTS.default,
  });
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const message = body?.message || body?.error_description || body?.error || `Supabase REST ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
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

async function fetchSymbolCloseRows(symbol, { eodhdKey, from, to }) {
  const eodSymbol = normalizeEodhdSymbol(symbol);
  const url = `https://eodhd.com/api/eod/${encodeURIComponent(eodSymbol)}.US?api_token=${encodeURIComponent(eodhdKey)}&from=${from}&to=${to}&period=d&fmt=json`;
  const response = await fetchWithTimeout(url, {}, {
    provider: 'eodhd-pnl-daily-snapshot',
    timeoutMs: QUOTE_TIMEOUTS.eodhd,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${symbol} HTTP ${response.status}`);
  }
  return [symbol, parseEodRows(payload)];
}

async function fetchHistoricalClosesBySymbol(symbols, { targetDate }) {
  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) {
    const error = new Error('API key 未配置,请在 Vercel 环境变量里设置 EODHD_API_KEY');
    error.status = 500;
    throw error;
  }

  const to = targetDate;
  const from = shiftDate(targetDate, -EODHD_LOOKBACK_DAYS);
  if (!from) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }
  const entries = await Promise.all(
    symbols.map((symbol) => fetchSymbolCloseRows(symbol, { eodhdKey, from, to }))
  );
  return Object.fromEntries(entries);
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

  const portfolioUrl = new URL('/rest/v1/pnl_report_snapshots', 'https://placeholder.local');
  portfolioUrl.searchParams.set('on_conflict', 'user_id,snapshot_date');
  await supabaseAdminFetch(`${portfolioUrl.pathname}${portfolioUrl.search}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([toPortfolioSnapshotRow(built.portfolioSnapshot, userId)]),
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
  if (symbolRows.length === 0) return;

  const symbolUrl = new URL('/rest/v1/pnl_report_symbol_snapshots', 'https://placeholder.local');
  symbolUrl.searchParams.set('on_conflict', 'user_id,snapshot_date,symbol');
  await supabaseAdminFetch(`${symbolUrl.pathname}${symbolUrl.search}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(symbolRows),
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
  const requestedDate = normalizeDateParam(firstQueryValue(req?.query?.date));
  return requestedDate || latestCompletedUsTradingDate(now);
}

export async function runPnlReportDailySnapshot({
  targetDate = latestCompletedUsTradingDate(new Date()),
  now = new Date(),
} = {}) {
  const normalizedTargetDate = normalizeDateParam(targetDate);
  if (!normalizedTargetDate) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }

  const lockedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const stockTrades = await fetchAllStockTrades();
  const groupedByUser = groupTradesByUser(stockTrades);
  const symbols = [...new Set(stockTrades.map((trade) => trade.symbol).filter(Boolean))].sort();
  if (symbols.length === 0 || groupedByUser.size === 0) {
    return {
      success: true,
      targetDate: normalizedTargetDate,
      attemptedUsers: 0,
      writtenUsers: 0,
      skippedUsers: 0,
      failedUsers: 0,
      symbolsCount: 0,
      source: 'EODHD_EOD',
      generatedAt: lockedAt,
    };
  }

  const historicalClosesBySymbol = await fetchHistoricalClosesBySymbol(symbols, {
    targetDate: normalizedTargetDate,
  });
  const result = {
    success: true,
    targetDate: normalizedTargetDate,
    attemptedUsers: groupedByUser.size,
    writtenUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    symbolsCount: symbols.length,
    source: 'EODHD_EOD',
    generatedAt: lockedAt,
    skippedReasons: {},
    failedReasons: {},
  };

  for (const [userId, userTrades] of groupedByUser.entries()) {
    try {
      const builtHistory = buildPnlReportHistoricalSnapshots({
        stockTrades: userTrades,
        historicalClosesBySymbol,
        snapshotDates: [normalizedTargetDate],
        toDate: normalizedTargetDate,
        maxSnapshots: 1,
        lockedAt,
        backfillMode: 'ledger',
      });
      const built = builtHistory.snapshots[0];
      if (!built) {
        result.skippedUsers += 1;
        const reason = builtHistory.skippedDates[0]?.reason || 'no_snapshot';
        result.skippedReasons[reason] = (result.skippedReasons[reason] || 0) + 1;
        continue;
      }
      await upsertUserSnapshots(userId, built);
      result.writtenUsers += 1;
    } catch (error) {
      result.failedUsers += 1;
      const reason = String(error?.message || 'unknown_error').slice(0, 120);
      result.failedReasons[reason] = (result.failedReasons[reason] || 0) + 1;
    }
  }

  result.success = result.failedUsers === 0;
  return result;
}
