import { latestCompletedUsTradingDate } from '../src/lib/pnlReportSnapshots.js';
import {
  buildCompetitionCashFlowSnapshot,
  CompetitionSnapshotValidationError,
  computeCompetitionLedgerHash,
} from './communityCompetitionSnapshotModel.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';

const PAGE_SIZE = 1000;
const USER_FILTER_CHUNK_SIZE = 100;
const EODHD_LOOKBACK_DAYS = 21;
const SOURCE_VERSION = 'community_competition_snapshot_v1';

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

async function fetchHistoricalCloses(symbols, targetDate) {
  if (symbols.length === 0) return { rowsBySymbol: {}, failedSymbols: [] };
  const eodhdKey = String(process.env.EODHD_API_KEY || '')
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) {
    const error = new Error('收益比赛快照未配置: 缺少 EODHD_API_KEY');
    error.status = 500;
    throw error;
  }
  const from = shiftDate(targetDate, -EODHD_LOOKBACK_DAYS);
  const settled = await Promise.allSettled(symbols.map(async (symbol) => {
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${encodeURIComponent(eodhdKey)}&from=${from}&to=${targetDate}&period=d&fmt=json`;
    const response = await fetchWithTimeout(url, {}, {
      provider: 'eodhd-community-competition-snapshot',
      timeoutMs: QUOTE_TIMEOUTS.eodhd,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${symbol} HTTP ${response.status}`);
    return [symbol, parseEodRows(body)];
  }));
  const entries = [];
  const failedSymbols = [];
  settled.forEach((result, index) => {
    const symbol = symbols[index];
    if (result.status === 'fulfilled') entries.push(result.value);
    else {
      entries.push([symbol, []]);
      failedSymbols.push(symbol);
    }
  });
  return { rowsBySymbol: Object.fromEntries(entries), failedSymbols };
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
} = {}) {
  const normalizedTargetDate = normalizeDate(targetDate);
  if (!normalizedTargetDate) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }
  const lockedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const members = await fetchActiveMembers();
  const eligibleMembers = members.filter((member) => (
    eligibleForSnapshot(member, normalizedTargetDate, lockedAt)
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
    skippedMembers: 0,
    failedMembers: 0,
    symbolsCount: 0,
    source: 'EODHD_EOD',
    generatedAt: lockedAt,
    skippedReasons: {},
    failedReasons: {},
  };

  const skip = (reason) => {
    const key = String(reason || 'snapshot_rejected').slice(0, 120);
    result.skippedMembers += 1;
    result.skippedReasons[key] = (result.skippedReasons[key] || 0) + 1;
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
          skip('missing_prior_ledger_hash');
          continue;
        }
        const currentPriorHash = computeCompetitionLedgerHash(userTrades, prior.snapshot_date);
        if (currentPriorHash !== prior.ledger_hash) {
          skip('prior_ledger_hash_mismatch');
          continue;
        }
        priorCumulativeReturnPct = Number(prior.cumulative_return_pct);
        if (!Number.isFinite(priorCumulativeReturnPct) || priorCumulativeReturnPct < -1) {
          skip('invalid_prior_cumulative_return');
          continue;
        }
      } else {
        const eligibleDate = normalizeDate(member.eligible_after_snapshot_date);
        const eligibleLedgerHash = String(member.eligible_ledger_hash || '');
        if (!eligibleDate || !/^[a-f0-9]{64}$/i.test(eligibleLedgerHash)) {
          skip('missing_eligible_ledger_hash');
          continue;
        }
        const currentEligibleLedgerHash = computeCompetitionLedgerHash(userTrades, eligibleDate);
        if (currentEligibleLedgerHash !== eligibleLedgerHash) {
          skip('eligible_ledger_hash_mismatch');
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
        skip(error.code || error.message);
      } else {
        result.failedMembers += 1;
        const reason = String(error?.message || 'unknown_error').slice(0, 120);
        result.failedReasons[reason] = (result.failedReasons[reason] || 0) + 1;
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

  for (const candidate of candidates) {
    const { member, userTrades, prior, priorCumulativeReturnPct } = candidate;
    try {
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
    } catch (error) {
      if (error instanceof CompetitionSnapshotValidationError) {
        skip(error.code || error.message);
      } else {
        result.failedMembers += 1;
        const reason = String(error?.message || 'unknown_error').slice(0, 120);
        result.failedReasons[reason] = (result.failedReasons[reason] || 0) + 1;
      }
    }
  }

  result.success = result.failedMembers === 0;
  return result;
}
