import { latestCompletedUsTradingDate } from '../src/lib/pnlReportSnapshots.js';
import {
  buildCompetitionCashFlowSnapshot,
  CompetitionSnapshotValidationError,
  computeCompetitionLedgerHash,
  deriveCompetitionHoldingSymbols,
} from './communityCompetitionSnapshotModel.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';

const PAGE_SIZE = 1000;
const USER_FILTER_CHUNK_SIZE = 100;
const EODHD_LOOKBACK_DAYS = 21;
const EODHD_MAX_ATTEMPTS = 3;
const EODHD_RETRY_DELAYS_MS = [500, 1500];
const SCHEDULED_CATCH_UP_MAX_TRADING_DATES = 5;
const SCHEDULED_CATCH_UP_MAX_MEMBER_DAYS = 250;
const MARKET_CALENDAR_SYMBOL = 'SPY';
const SOURCE_VERSION = 'community_competition_snapshot_v1';
const RETRYABLE_INCOMPLETE_CODES = new Set([
  'missing_close',
  'snapshot_gap',
  'trade_between_snapshots',
]);

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDate(value) {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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
    const error = new Error('收益比赛快照服务未配置: 缺少 Supabase URL 或 service role key');
    error.status = 500;
    throw error;
  }
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), serviceRoleKey };
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
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }, {
    provider: 'supabase-community-competition-snapshot',
    timeoutMs: QUOTE_TIMEOUTS.default,
  });
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const error = new Error(
      body?.message || body?.error_description || body?.error || `Supabase REST ${response.status}`
    );
    error.status = response.status;
    throw error;
  }
  return body;
}

async function fetchPaged(path, { mapRow = (row) => row } = {}) {
  const rows = [];
  let offset = 0;
  while (true) {
    const page = await supabaseAdminFetch(path, {
      headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    const pageRows = Array.isArray(page) ? page : [];
    rows.push(...pageRows.map(mapRow));
    if (pageRows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

function mapTrade(row) {
  const symbol = normalizeSymbol(row?.symbol);
  return {
    id: row?.id,
    user_id: String(row?.user_id || ''),
    symbol,
    name: row?.name || symbol,
    side: row?.side === 'sell' ? 'sell' : 'buy',
    trade_date: String(row?.trade_date || '').slice(0, 10),
    price: toNumber(row?.price),
    shares: toNumber(row?.shares),
    fee: toNumber(row?.fee),
    currency: row?.currency || 'USD',
    note: row?.note || '',
    created_at: row?.created_at || '',
  };
}

async function fetchActiveMembers() {
  const url = new URL('/rest/v1/community_competition_members', 'https://placeholder.local');
  url.searchParams.set('select', [
    'user_id',
    'status',
    'joined_at',
    'eligible_after_snapshot_date',
    'eligible_ledger_hash',
    'ranking_start_snapshot_date',
    'ranking_baseline_return_pct',
  ].join(','));
  url.searchParams.set('status', 'eq.active');
  url.searchParams.set('order', 'joined_at.asc');
  return fetchPaged(`${url.pathname}${url.search}`);
}

async function fetchStockTradesForUsers(userIds) {
  if (userIds.size === 0) return [];
  const ids = [...userIds];
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += USER_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + USER_FILTER_CHUNK_SIZE);
    const url = new URL('/rest/v1/stock_trades', 'https://placeholder.local');
    url.searchParams.set('select', [
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
    ].join(','));
    url.searchParams.set('user_id', `in.(${chunk.join(',')})`);
    url.searchParams.set('order', 'user_id.asc,trade_date.asc,created_at.asc');
    rows.push(...await fetchPaged(`${url.pathname}${url.search}`, { mapRow: mapTrade }));
  }
  return rows.filter((trade) => (
    userIds.has(trade.user_id)
    && trade.symbol
    && trade.trade_date
    && trade.price > 0
    && trade.shares > 0
  ));
}

async function fetchPriorCompetitionSnapshots(userIds, targetDate) {
  if (userIds.size === 0) return new Map();
  const ids = [...userIds];
  const latestByUser = new Map();
  for (let offset = 0; offset < ids.length; offset += USER_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + USER_FILTER_CHUNK_SIZE);
    const url = new URL('/rest/v1/community_competition_snapshots', 'https://placeholder.local');
    url.searchParams.set('select', [
      'user_id',
      'snapshot_date',
      'cumulative_return_pct',
      'locked_at',
      'ledger_hash',
    ].join(','));
    url.searchParams.set('user_id', `in.(${chunk.join(',')})`);
    url.searchParams.set('snapshot_date', `lt.${targetDate}`);
    url.searchParams.set('locked_at', 'not.is.null');
    url.searchParams.set('order', 'user_id.asc,snapshot_date.desc');
    const rows = await fetchPaged(`${url.pathname}${url.search}`);
    rows.forEach((row) => {
      const userId = String(row?.user_id || '');
      const snapshotDate = normalizeDate(row?.snapshot_date);
      const current = latestByUser.get(userId);
      if (userId && snapshotDate && (!current || snapshotDate > current.snapshot_date)) {
        latestByUser.set(userId, { ...row, snapshot_date: snapshotDate });
      }
    });
  }
  return latestByUser;
}

async function fetchEarliestCompetitionSnapshots(userIds, throughDate) {
  if (userIds.size === 0) return new Map();
  const ids = [...userIds];
  const earliestByUser = new Map();
  for (let offset = 0; offset < ids.length; offset += USER_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + USER_FILTER_CHUNK_SIZE);
    const url = new URL('/rest/v1/community_competition_snapshots', 'https://placeholder.local');
    url.searchParams.set('select', [
      'user_id',
      'snapshot_date',
      'locked_at',
      'ledger_hash',
    ].join(','));
    url.searchParams.set('user_id', `in.(${chunk.join(',')})`);
    url.searchParams.set('snapshot_date', `lte.${throughDate}`);
    url.searchParams.set('locked_at', 'not.is.null');
    url.searchParams.set('order', 'user_id.asc,snapshot_date.asc');
    const rows = await fetchPaged(`${url.pathname}${url.search}`);
    rows.forEach((row) => {
      const userId = String(row?.user_id || '');
      const snapshotDate = normalizeDate(row?.snapshot_date);
      const current = earliestByUser.get(userId);
      if (userId && snapshotDate && (!current || snapshotDate < current.snapshot_date)) {
        earliestByUser.set(userId, { ...row, snapshot_date: snapshotDate });
      }
    });
  }
  return earliestByUser;
}

function parseEodRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const date = String(row?.date || '').slice(0, 10);
      const adjustedClose = Number(row?.adjusted_close);
      const rawClose = Number(row?.close);
      const close = Number.isFinite(adjustedClose) && adjustedClose > 0 ? adjustedClose : rawClose;
      const high = Number(row?.high);
      const low = Number(row?.low);
      return date && Number.isFinite(close) && close > 0 ? {
        date,
        close,
        adjustedClose: Number.isFinite(adjustedClose) && adjustedClose > 0 ? adjustedClose : null,
        high: Number.isFinite(high) && high > 0 ? high : null,
        low: Number.isFinite(low) && low > 0 ? low : null,
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function isRetryableEodhdStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchEodRowsWithRetry(symbol, {
  from,
  targetDate,
  requireTargetClose = true,
} = {}) {
  const eodhdKey = String(process.env.EODHD_API_KEY || '')
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) {
    const error = new Error('收益比赛快照未配置: 缺少 EODHD_API_KEY');
    error.status = 500;
    error.retryable = false;
    throw error;
  }
  let lastError = null;
  for (let attempt = 1; attempt <= EODHD_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await wait(EODHD_RETRY_DELAYS_MS[attempt - 2] || 0);
    try {
      const url = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${encodeURIComponent(eodhdKey)}&from=${from}&to=${targetDate}&period=d&fmt=json`;
      const response = await fetchWithTimeout(url, {}, {
        provider: 'eodhd-community-competition-snapshot',
        timeoutMs: QUOTE_TIMEOUTS.eodhd,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(`${symbol} HTTP ${response.status}`);
        error.retryable = isRetryableEodhdStatus(response.status);
        error.status = response.status;
        throw error;
      }
      const rows = parseEodRows(body);
      if (rows.length === 0 || (requireTargetClose && !rows.some((row) => row.date === targetDate))) {
        const error = new Error(`${symbol} missing target close`);
        error.retryable = true;
        error.code = 'missing_target_close';
        error.rows = rows;
        throw error;
      }
      return rows;
    } catch (error) {
      lastError = error;
      const retryable = error?.retryable !== false
        && (error?.retryable === true || error?.status == null || isRetryableEodhdStatus(error.status));
      if (!retryable || attempt === EODHD_MAX_ATTEMPTS) break;
    }
  }
  throw lastError || new Error(`${symbol} EODHD unavailable`);
}

async function fetchHistoricalCloses(symbols, targetDate) {
  if (symbols.length === 0) {
    return { rowsBySymbol: {}, failedSymbols: [], failedSymbolDetails: [] };
  }
  const from = shiftDate(targetDate, -EODHD_LOOKBACK_DAYS);
  const settled = await Promise.allSettled(symbols.map(async (symbol) => {
    const rows = await fetchEodRowsWithRetry(symbol, { from, targetDate });
    return [symbol, rows];
  }));
  const entries = [];
  const failedSymbols = [];
  const failedSymbolDetails = [];
  settled.forEach((result, index) => {
    const symbol = symbols[index];
    if (result.status === 'fulfilled') entries.push(result.value);
    else {
      entries.push([symbol, []]);
      failedSymbols.push(symbol);
      failedSymbolDetails.push({
        symbol,
        retryable: result.reason?.retryable !== false,
        code: String(result.reason?.code || 'provider_failure').slice(0, 80),
      });
    }
  });
  return { rowsBySymbol: Object.fromEntries(entries), failedSymbols, failedSymbolDetails };
}

function requiredSymbolsForSnapshot(trades, targetDate) {
  const startPositions = new Map();
  const endPositions = new Map();
  const targetSymbols = new Set();
  const eligibleTrades = (Array.isArray(trades) ? trades : [])
    .filter((trade) => trade?.trade_date && trade.trade_date <= targetDate)
    .sort((a, b) => (
      a.trade_date.localeCompare(b.trade_date)
      || String(a.created_at || '').localeCompare(String(b.created_at || ''))
      || String(a.id || '').localeCompare(String(b.id || ''))
    ));
  eligibleTrades.forEach((trade) => {
    const symbol = normalizeSymbol(trade.symbol);
    if (!symbol) return;
    const delta = trade.side === 'sell' ? -trade.shares : trade.shares;
    if (trade.trade_date < targetDate) {
      startPositions.set(symbol, (startPositions.get(symbol) || 0) + delta);
      endPositions.set(symbol, (endPositions.get(symbol) || 0) + delta);
      return;
    }
    targetSymbols.add(symbol);
    endPositions.set(symbol, (endPositions.get(symbol) || 0) + delta);
  });
  const required = new Set(targetSymbols);
  startPositions.forEach((shares, symbol) => {
    if (shares > 0) required.add(symbol);
  });
  endPositions.forEach((shares, symbol) => {
    if (shares > 0) required.add(symbol);
  });
  return required;
}

async function insertLockedCompetitionSnapshot(row) {
  const url = new URL('/rest/v1/community_competition_snapshots', 'https://placeholder.local');
  url.searchParams.set('on_conflict', 'user_id,snapshot_date');
  const insertedRows = await supabaseAdminFetch(`${url.pathname}${url.search}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify([row]),
  });
  const inserted = Array.isArray(insertedRows) ? insertedRows[0] || null : insertedRows;
  if (inserted) return { row: inserted, inserted: true };

  const existingUrl = new URL('/rest/v1/community_competition_snapshots', 'https://placeholder.local');
  existingUrl.searchParams.set('select', [
    'user_id',
    'snapshot_date',
    'daily_return_pct',
    'cumulative_return_pct',
    'locked_at',
    'source_version',
    'ledger_hash',
  ].join(','));
  existingUrl.searchParams.set('user_id', `eq.${row.user_id}`);
  existingUrl.searchParams.set('snapshot_date', `eq.${row.snapshot_date}`);
  existingUrl.searchParams.set('limit', '1');
  const existingRows = await supabaseAdminFetch(`${existingUrl.pathname}${existingUrl.search}`);
  const existing = Array.isArray(existingRows) ? existingRows[0] || null : null;
  if (!existing) throw new Error('权威收益比赛快照冲突后无法读取');
  return { row: existing, inserted: false };
}

async function initializeMemberRanking(member, snapshotDate, baselineReturnPct, updatedAt) {
  if (member?.ranking_start_snapshot_date || !Number.isFinite(baselineReturnPct)) return false;
  const url = new URL('/rest/v1/community_competition_members', 'https://placeholder.local');
  url.searchParams.set('user_id', `eq.${member.user_id}`);
  url.searchParams.set('status', 'eq.active');
  url.searchParams.set('ranking_start_snapshot_date', 'is.null');
  await supabaseAdminFetch(`${url.pathname}${url.search}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      ranking_start_snapshot_date: snapshotDate,
      ranking_baseline_return_pct: baselineReturnPct,
      updated_at: updatedAt,
    }),
  });
  return true;
}

function eligibleForSnapshot(member, targetDate, lockedAt) {
  const eligibleAfter = normalizeDate(member?.eligible_after_snapshot_date);
  const joinedAt = Date.parse(member?.joined_at || '');
  const lockTime = Date.parse(lockedAt);
  return Boolean(
    member?.user_id
    && eligibleAfter
    && targetDate > eligibleAfter
    && Number.isFinite(joinedAt)
    && Number.isFinite(lockTime)
    && lockTime > joinedAt
  );
}

export function authorizeCommunityCompetitionDailySnapshot(req) {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    return { ok: false, status: 500, error: '收益比赛自动快照未配置: 缺少 CRON_SECRET' };
  }
  if (String(getHeader(req, 'authorization') || '').trim() !== `Bearer ${cronSecret}`) {
    return { ok: false, status: 401, error: '未授权: Cron secret 不匹配' };
  }
  return { ok: true };
}

export function resolveCommunityCompetitionSnapshotDate(req, now = new Date()) {
  return normalizeDate(firstQueryValue(req?.query?.date)) || latestCompletedUsTradingDate(now);
}

export async function runCommunityCompetitionDailySnapshot({
  targetDate = latestCompletedUsTradingDate(new Date()),
  now = new Date(),
  memberUserIds = null,
} = {}) {
  const normalizedTargetDate = normalizeDate(targetDate);
  if (!normalizedTargetDate) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }
  const lockedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const members = await fetchActiveMembers();
  const selectedUserIds = memberUserIds == null
    ? null
    : new Set([...memberUserIds].map((userId) => String(userId)));
  const eligibleMembers = members.filter((member) => (
    eligibleForSnapshot(member, normalizedTargetDate, lockedAt)
    && (!selectedUserIds || selectedUserIds.has(String(member.user_id)))
  ));
  const eligibleUserIds = new Set(eligibleMembers.map((member) => String(member.user_id)));
  const trades = await fetchStockTradesForUsers(eligibleUserIds);
  const tradesByUser = new Map(eligibleMembers.map((member) => [String(member.user_id), []]));
  trades.forEach((trade) => tradesByUser.get(trade.user_id)?.push(trade));
  const priorSnapshotsByUser = await fetchPriorCompetitionSnapshots(
    eligibleUserIds,
    normalizedTargetDate
  );
  const result = {
    success: true,
    targetDate: normalizedTargetDate,
    activeMembers: members.length,
    eligibleMembers: eligibleMembers.length,
    writtenSnapshots: 0,
    existingSnapshots: 0,
    initializedMembers: 0,
    deferredMembers: 0,
    skippedMembers: 0,
    authoritativeRejectedMembers: 0,
    retryableIncompleteMembers: 0,
    retryableIncomplete: false,
    failedMembers: 0,
    symbolsCount: 0,
    source: 'EODHD_EOD',
    generatedAt: lockedAt,
    deferredReasons: {},
    skippedReasons: {},
    authoritativeRejectionReasons: {},
    retryableIncompleteReasons: {},
    failedReasons: {},
  };
  const completedUserIds = new Set();
  const blockedUserIds = new Set();
  Object.defineProperties(result, {
    _completedUserIds: { value: completedUserIds, enumerable: false },
    _blockedUserIds: { value: blockedUserIds, enumerable: false },
  });

  const skip = (reason, userId) => {
    const key = String(reason || 'snapshot_rejected').slice(0, 120);
    result.skippedMembers += 1;
    result.skippedReasons[key] = (result.skippedReasons[key] || 0) + 1;
    if (userId) blockedUserIds.add(String(userId));
    if (RETRYABLE_INCOMPLETE_CODES.has(key)) {
      result.retryableIncomplete = true;
      result.retryableIncompleteMembers += 1;
      result.retryableIncompleteReasons[key] = (result.retryableIncompleteReasons[key] || 0) + 1;
    } else {
      result.authoritativeRejectedMembers += 1;
      result.authoritativeRejectionReasons[key] = (
        result.authoritativeRejectionReasons[key] || 0
      ) + 1;
    }
  };
  const defer = (reason) => {
    const key = String(reason || 'not_started').slice(0, 120);
    result.deferredMembers += 1;
    result.deferredReasons[key] = (result.deferredReasons[key] || 0) + 1;
  };
  const fail = (error, userId) => {
    if (userId) blockedUserIds.add(String(userId));
    result.failedMembers += 1;
    const reason = String(error?.message || 'unknown_error').slice(0, 120);
    result.failedReasons[reason] = (result.failedReasons[reason] || 0) + 1;
  };
  const candidates = [];
  for (const member of eligibleMembers) {
    const userId = String(member.user_id);
    const userTrades = tradesByUser.get(userId) || [];
    const prior = priorSnapshotsByUser.get(userId) || null;
    try {
      let priorCumulativeReturnPct = 0;
      if (prior) {
        if (!/^[a-f0-9]{64}$/i.test(String(prior.ledger_hash || ''))) {
          skip('missing_prior_ledger_hash', userId);
          continue;
        }
        const currentPriorHash = computeCompetitionLedgerHash(userTrades, prior.snapshot_date);
        if (currentPriorHash !== prior.ledger_hash) {
          skip('prior_ledger_hash_mismatch', userId);
          continue;
        }
        priorCumulativeReturnPct = Number(prior.cumulative_return_pct);
        if (!Number.isFinite(priorCumulativeReturnPct) || priorCumulativeReturnPct < -1) {
          skip('invalid_prior_cumulative_return', userId);
          continue;
        }
      } else {
        const eligibleDate = normalizeDate(member.eligible_after_snapshot_date);
        const eligibleLedgerHash = String(member.eligible_ledger_hash || '');
        if (!eligibleDate || !/^[a-f0-9]{64}$/i.test(eligibleLedgerHash)) {
          skip('missing_eligible_ledger_hash', userId);
          continue;
        }
        const currentEligibleLedgerHash = computeCompetitionLedgerHash(userTrades, eligibleDate);
        if (currentEligibleLedgerHash !== eligibleLedgerHash) {
          skip('eligible_ledger_hash_mismatch', userId);
          continue;
        }
        if (userTrades.some((trade) => (
          trade.trade_date > eligibleDate
          && trade.trade_date < normalizedTargetDate
        ))) {
          skip('trade_before_first_snapshot', userId);
          continue;
        }
      }
      candidates.push({
        member,
        userTrades,
        prior,
        priorCumulativeReturnPct,
        requiredSymbols: requiredSymbolsForSnapshot(userTrades, normalizedTargetDate),
      });
    } catch (error) {
      if (error instanceof CompetitionSnapshotValidationError) {
        skip(error.code || error.message, userId);
      } else {
        fail(error, userId);
      }
    }
  }

  const symbols = [...new Set(candidates.flatMap((candidate) => (
    [...candidate.requiredSymbols]
  )))].sort();
  result.symbolsCount = symbols.length;
  const historicalResult = await fetchHistoricalCloses(symbols, normalizedTargetDate);
  const historicalClosesBySymbol = historicalResult.rowsBySymbol;
  result.failedSymbolsCount = historicalResult.failedSymbols.length;
  const failedSymbolDetails = new Map(historicalResult.failedSymbolDetails.map((detail) => (
    [detail.symbol, detail]
  )));

  for (const candidate of candidates) {
    const { member, userTrades, prior, priorCumulativeReturnPct } = candidate;
    try {
      const providerFailures = [...candidate.requiredSymbols]
        .map((symbol) => failedSymbolDetails.get(symbol))
        .filter(Boolean);
      if (providerFailures.some((failure) => failure.retryable === false)) {
        fail(new Error('provider_nonretryable_failure'), member.user_id);
        continue;
      }
      if (providerFailures.length > 0) {
        skip('missing_close', member.user_id);
        continue;
      }
      const built = buildCompetitionCashFlowSnapshot({
        stockTrades: userTrades,
        historicalClosesBySymbol,
        targetDate: normalizedTargetDate,
        priorSnapshotDate: prior?.snapshot_date || null,
        priorCumulativeReturnPct,
      });
      const authoritative = await insertLockedCompetitionSnapshot({
        user_id: member.user_id,
        snapshot_date: normalizedTargetDate,
        daily_return_pct: built.dailyReturnPct,
        cumulative_return_pct: built.cumulativeReturnPct,
        locked_at: lockedAt,
        source_version: SOURCE_VERSION,
        ledger_hash: built.ledgerHash,
        updated_at: lockedAt,
      });
      const authoritativeDailyReturnPct = authoritative.row?.daily_return_pct == null
        ? null
        : Number(authoritative.row.daily_return_pct);
      const authoritativeCumulativeReturnPct = Number(authoritative.row?.cumulative_return_pct);
      const authoritativeLedgerHash = String(authoritative.row?.ledger_hash || '');
      if (
        !Number.isFinite(authoritativeDailyReturnPct)
        || !Number.isFinite(authoritativeCumulativeReturnPct)
        || authoritativeLedgerHash !== built.ledgerHash
      ) {
        throw new CompetitionSnapshotValidationError(
          'locked_snapshot_mismatch',
          '已锁定收益比赛快照与当前账本不一致'
        );
      }
      if (authoritative.inserted) result.writtenSnapshots += 1;
      else result.existingSnapshots += 1;
      if (await initializeMemberRanking(
        member,
        normalizedTargetDate,
        priorCumulativeReturnPct,
        lockedAt
      )) {
        result.initializedMembers += 1;
      }
      completedUserIds.add(String(member.user_id));
    } catch (error) {
      if (error instanceof CompetitionSnapshotValidationError) {
        if (!prior && error.code === 'zero_denominator') defer('not_started');
        else skip(error.code || error.message, member.user_id);
      } else {
        fail(error, member.user_id);
      }
    }
  }

  result.success = result.failedMembers === 0 && !result.retryableIncomplete;
  return result;
}

function addReasonCounts(target, source) {
  Object.entries(source || {}).forEach(([reason, count]) => {
    target[reason] = (target[reason] || 0) + Number(count || 0);
  });
}

export async function runCommunityCompetitionScheduledCatchUp({
  targetDate = latestCompletedUsTradingDate(new Date()),
  now = new Date(),
} = {}) {
  const normalizedTargetDate = normalizeDate(targetDate);
  if (!normalizedTargetDate) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }
  const lockedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const members = await fetchActiveMembers();
  const targetEligibleMembers = members.filter((member) => (
    eligibleForSnapshot(member, normalizedTargetDate, lockedAt)
  ));
  const userIds = new Set(targetEligibleMembers.map((member) => String(member.user_id)));
  const latestSnapshots = await fetchPriorCompetitionSnapshots(
    userIds,
    shiftDate(normalizedTargetDate, 1)
  );
  const anchors = new Map();
  targetEligibleMembers.forEach((member) => {
    const userId = String(member.user_id);
    const priorDate = normalizeDate(latestSnapshots.get(userId)?.snapshot_date);
    const eligibleAfter = normalizeDate(member.eligible_after_snapshot_date);
    if (priorDate || eligibleAfter) anchors.set(userId, priorDate || eligibleAfter);
  });
  const result = {
    success: true,
    mode: 'scheduled_catch_up',
    targetDate: normalizedTargetDate,
    catchUpFromDate: null,
    processedDates: [],
    activeMembers: members.length,
    eligibleMembers: targetEligibleMembers.length,
    attemptedMemberDays: 0,
    batchLimited: false,
    batchPendingMembers: 0,
    batchWindowEndDate: null,
    nextBatchFromDate: null,
    writtenSnapshots: 0,
    existingSnapshots: 0,
    initializedMembers: 0,
    deferredMembers: 0,
    skippedMembers: 0,
    authoritativeRejectedMembers: 0,
    retryableIncompleteMembers: 0,
    retryableIncomplete: false,
    failedMembers: 0,
    symbolsCount: 0,
    failedSymbolsCount: 0,
    source: 'EODHD_EOD',
    generatedAt: lockedAt,
    deferredReasons: {},
    skippedReasons: {},
    authoritativeRejectionReasons: {},
    retryableIncompleteReasons: {},
    failedReasons: {},
    runs: [],
  };
  const markIncomplete = (reason, count = 1) => {
    const key = String(reason || 'scheduled_catch_up_incomplete').slice(0, 120);
    result.retryableIncomplete = true;
    result.retryableIncompleteReasons[key] = (
      result.retryableIncompleteReasons[key] || 0
    ) + count;
  };
  const initialSearchBlockedUserIds = new Set();
  const initialSearchDeferredUserIds = new Set();
  const rejectInitialSearch = (reason, userId) => {
    const key = String(reason || 'initial_search_rejected').slice(0, 120);
    initialSearchBlockedUserIds.add(String(userId));
    result.skippedMembers += 1;
    result.authoritativeRejectedMembers += 1;
    result.skippedReasons[key] = (result.skippedReasons[key] || 0) + 1;
    result.authoritativeRejectionReasons[key] = (
      result.authoritativeRejectionReasons[key] || 0
    ) + 1;
  };
  const initialSearchMembers = targetEligibleMembers.filter((member) => (
    !latestSnapshots.has(String(member.user_id))
  ));
  if (initialSearchMembers.length > 0) {
    const initialSearchUserIds = new Set(
      initialSearchMembers.map((member) => String(member.user_id))
    );
    let tradesByUser = new Map();
    try {
      const initialSearchTrades = await fetchStockTradesForUsers(initialSearchUserIds);
      tradesByUser = new Map([...initialSearchUserIds].map((userId) => [userId, []]));
      initialSearchTrades.forEach((trade) => tradesByUser.get(trade.user_id)?.push(trade));
    } catch {
      initialSearchMembers.forEach((member) => {
        initialSearchBlockedUserIds.add(String(member.user_id));
      });
      result.failedMembers += initialSearchMembers.length;
      result.failedReasons.initial_search_trade_read_failed = initialSearchMembers.length;
    }
    for (const member of initialSearchMembers) {
      const userId = String(member.user_id);
      if (initialSearchBlockedUserIds.has(userId)) continue;
      const eligibleDate = normalizeDate(member.eligible_after_snapshot_date);
      const eligibleLedgerHash = String(member.eligible_ledger_hash || '');
      const userTrades = tradesByUser.get(userId) || [];
      if (!eligibleDate || !/^[a-f0-9]{64}$/i.test(eligibleLedgerHash)) {
        rejectInitialSearch('missing_eligible_ledger_hash', userId);
        continue;
      }
      try {
        if (computeCompetitionLedgerHash(userTrades, eligibleDate) !== eligibleLedgerHash) {
          rejectInitialSearch('eligible_ledger_hash_mismatch', userId);
          continue;
        }
        if (deriveCompetitionHoldingSymbols(userTrades, eligibleDate).length > 0) continue;
        const firstLaterTradeDate = userTrades
          .map((trade) => normalizeDate(trade.trade_date))
          .filter((tradeDate) => (
            tradeDate && tradeDate > eligibleDate && tradeDate <= normalizedTargetDate
          ))
          .sort()[0];
        if (!firstLaterTradeDate) {
          initialSearchDeferredUserIds.add(userId);
          result.deferredMembers += 1;
          result.deferredReasons.not_started = (
            result.deferredReasons.not_started || 0
          ) + 1;
          continue;
        }
        const acceleratedAnchor = shiftDate(firstLaterTradeDate, -1);
        if (acceleratedAnchor && acceleratedAnchor > eligibleDate) {
          anchors.set(userId, acceleratedAnchor);
        }
      } catch (error) {
        if (error instanceof CompetitionSnapshotValidationError) {
          rejectInitialSearch(error.code || error.message, userId);
        } else {
          initialSearchBlockedUserIds.add(userId);
          result.failedMembers += 1;
          result.failedReasons.initial_search_validation_failed = (
            result.failedReasons.initial_search_validation_failed || 0
          ) + 1;
        }
      }
    }
  }
  const rankingRecoveryBlockedUserIds = new Set();
  const rejectRankingRecovery = (reason, userId) => {
    const key = String(reason || 'ranking_recovery_rejected').slice(0, 120);
    rankingRecoveryBlockedUserIds.add(String(userId));
    result.skippedMembers += 1;
    result.authoritativeRejectedMembers += 1;
    result.skippedReasons[key] = (result.skippedReasons[key] || 0) + 1;
    result.authoritativeRejectionReasons[key] = (
      result.authoritativeRejectionReasons[key] || 0
    ) + 1;
  };
  const rankingRecoveryMembers = targetEligibleMembers.filter((member) => (
    !member.ranking_start_snapshot_date
    && latestSnapshots.has(String(member.user_id))
  ));
  if (rankingRecoveryMembers.length > 0) {
    const recoveryUserIds = new Set(rankingRecoveryMembers.map((member) => String(member.user_id)));
    let earliestSnapshots = new Map();
    let recoveryTradesByUser = new Map();
    try {
      const [fetchedEarliestSnapshots, recoveryTrades] = await Promise.all([
        fetchEarliestCompetitionSnapshots(recoveryUserIds, normalizedTargetDate),
        fetchStockTradesForUsers(recoveryUserIds),
      ]);
      earliestSnapshots = fetchedEarliestSnapshots;
      recoveryTradesByUser = new Map(
        [...recoveryUserIds].map((userId) => [userId, []])
      );
      recoveryTrades.forEach((trade) => recoveryTradesByUser.get(trade.user_id)?.push(trade));
    } catch {
      rankingRecoveryMembers.forEach((member) => {
        rankingRecoveryBlockedUserIds.add(String(member.user_id));
      });
      result.failedMembers += rankingRecoveryMembers.length;
      result.failedReasons.ranking_initialization_recovery_failed = rankingRecoveryMembers.length;
    }
    for (const member of rankingRecoveryMembers) {
      const userId = String(member.user_id);
      if (rankingRecoveryBlockedUserIds.has(userId)) continue;
      const earliest = earliestSnapshots.get(userId);
      if (!earliest) {
        rankingRecoveryBlockedUserIds.add(userId);
        result.failedMembers += 1;
        result.failedReasons.ranking_initialization_snapshot_missing = (
          result.failedReasons.ranking_initialization_snapshot_missing || 0
        ) + 1;
        continue;
      }
      const latest = latestSnapshots.get(userId);
      const userTrades = recoveryTradesByUser.get(userId) || [];
      const recoverySnapshots = [earliest, latest].filter(Boolean);
      if (recoverySnapshots.some((snapshot) => (
        !/^[a-f0-9]{64}$/i.test(String(snapshot.ledger_hash || ''))
      ))) {
        rejectRankingRecovery('ranking_recovery_missing_ledger_hash', userId);
        continue;
      }
      if (recoverySnapshots.some((snapshot) => (
        computeCompetitionLedgerHash(userTrades, snapshot.snapshot_date)
        !== snapshot.ledger_hash
      ))) {
        rejectRankingRecovery('ranking_recovery_ledger_hash_mismatch', userId);
        continue;
      }
      try {
        if (await initializeMemberRanking(
          member,
          earliest.snapshot_date,
          0,
          lockedAt
        )) {
          result.initializedMembers += 1;
          member.ranking_start_snapshot_date = earliest.snapshot_date;
          member.ranking_baseline_return_pct = 0;
        }
      } catch {
        rankingRecoveryBlockedUserIds.add(userId);
        result.failedMembers += 1;
        result.failedReasons.ranking_initialization_recovery_failed = (
          result.failedReasons.ranking_initialization_recovery_failed || 0
        ) + 1;
      }
    }
  }

  const pendingEntries = [...anchors.entries()].filter(([, date]) => date < normalizedTargetDate);
  if (pendingEntries.length === 0) {
    result.success = result.failedMembers === 0;
    return result;
  }

  const processableEntries = pendingEntries.filter(([userId]) => (
    !initialSearchBlockedUserIds.has(userId)
    && !initialSearchDeferredUserIds.has(userId)
    && !rankingRecoveryBlockedUserIds.has(userId)
  ));
  if (processableEntries.length === 0) {
    result.success = result.failedMembers === 0 && !result.retryableIncomplete;
    return result;
  }
  const earliestAnchor = processableEntries.map(([, anchor]) => anchor).sort()[0];
  result.catchUpFromDate = earliestAnchor;
  const marketThroughDate = normalizedTargetDate;
  result.batchWindowEndDate = marketThroughDate;

  let marketRows = [];
  let marketTargetMissing = false;
  try {
    marketRows = await fetchEodRowsWithRetry(MARKET_CALENDAR_SYMBOL, {
      from: earliestAnchor,
      targetDate: marketThroughDate,
      requireTargetClose: true,
    });
  } catch (error) {
    if (error?.code === 'missing_target_close' && Array.isArray(error.rows)) {
      marketRows = error.rows;
      marketTargetMissing = true;
    } else {
      const reason = error?.retryable === false
        ? 'market_calendar_nonretryable_failure'
        : 'market_calendar_unavailable';
      if (error?.retryable !== false) markIncomplete(reason);
      result.failedMembers += processableEntries.length;
      result.failedReasons[reason] = 1;
      result.success = false;
      return result;
    }
  }

  const tradingDates = [...new Set(marketRows
    .map((row) => normalizeDate(row?.date))
    .filter((date) => date && date > earliestAnchor && date <= marketThroughDate))]
    .sort();
  const blockedUserIds = new Set([
    ...initialSearchBlockedUserIds,
    ...initialSearchDeferredUserIds,
    ...rankingRecoveryBlockedUserIds,
  ]);
  let stoppedByProcessingBudget = false;
  for (const date of tradingDates) {
    const candidateUserIds = new Set([...anchors.entries()]
      .filter(([userId, anchor]) => !blockedUserIds.has(userId) && anchor < date)
      .map(([userId]) => userId));
    if (candidateUserIds.size === 0) continue;
    const wouldExceedMemberDayBudget = (
      result.attemptedMemberDays > 0
      && result.attemptedMemberDays + candidateUserIds.size
        > SCHEDULED_CATCH_UP_MAX_MEMBER_DAYS
    );
    if (
      result.processedDates.length >= SCHEDULED_CATCH_UP_MAX_TRADING_DATES
      || wouldExceedMemberDayBudget
    ) {
      stoppedByProcessingBudget = true;
      break;
    }
    const daily = await runCommunityCompetitionDailySnapshot({
      targetDate: date,
      now,
      memberUserIds: candidateUserIds,
    });
    result.processedDates.push(date);
    result.attemptedMemberDays += daily.eligibleMembers;
    result.writtenSnapshots += daily.writtenSnapshots;
    result.existingSnapshots += daily.existingSnapshots;
    result.initializedMembers += daily.initializedMembers;
    result.deferredMembers += daily.deferredMembers;
    result.skippedMembers += daily.skippedMembers;
    result.authoritativeRejectedMembers += daily.authoritativeRejectedMembers;
    result.retryableIncompleteMembers += daily.retryableIncompleteMembers;
    result.failedMembers += daily.failedMembers;
    result.symbolsCount += daily.symbolsCount;
    result.failedSymbolsCount += daily.failedSymbolsCount || 0;
    addReasonCounts(result.deferredReasons, daily.deferredReasons);
    addReasonCounts(result.skippedReasons, daily.skippedReasons);
    addReasonCounts(result.authoritativeRejectionReasons, daily.authoritativeRejectionReasons);
    addReasonCounts(result.retryableIncompleteReasons, daily.retryableIncompleteReasons);
    addReasonCounts(result.failedReasons, daily.failedReasons);
    result.retryableIncomplete = result.retryableIncomplete || daily.retryableIncomplete;
    result.runs.push({
      targetDate: date,
      success: daily.success,
      eligibleMembers: daily.eligibleMembers,
      writtenSnapshots: daily.writtenSnapshots,
      existingSnapshots: daily.existingSnapshots,
      deferredMembers: daily.deferredMembers,
      authoritativeRejectedMembers: daily.authoritativeRejectedMembers,
      retryableIncompleteMembers: daily.retryableIncompleteMembers,
      failedMembers: daily.failedMembers,
    });
    daily._completedUserIds.forEach((userId) => anchors.set(userId, date));
    daily._blockedUserIds.forEach((userId) => blockedUserIds.add(userId));
  }
  if (marketTargetMissing) markIncomplete('market_calendar_target_missing');
  if (stoppedByProcessingBudget) {
    const remainingEntries = [...anchors.entries()].filter(([userId, anchor]) => (
      !blockedUserIds.has(userId) && anchor < normalizedTargetDate
    ));
    if (remainingEntries.length > 0) {
      result.batchLimited = true;
      result.batchPendingMembers = remainingEntries.length;
      result.nextBatchFromDate = remainingEntries.map(([, anchor]) => anchor).sort()[0];
    }
  }
  result.success = result.failedMembers === 0 && !result.retryableIncomplete;
  return result;
}
