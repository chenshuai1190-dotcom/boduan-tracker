import {
  currentNewYorkDate,
  isNewYorkSnapshotWindowOpen,
  latestCompletedUsTradingDate,
  resolveScheduledUsSnapshotDate,
} from '../src/lib/pnlReportSnapshots.js';
import {
  buildCompetitionCashFlowSnapshot,
  CompetitionSnapshotValidationError,
  computeCompetitionLedgerHash,
  deriveCompetitionHoldingSymbols,
} from './communityCompetitionSnapshotModel.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';
import { recalculateDirtyCommunityCompetitionMembers } from './communityCompetitionRecalculation.js';
import { fetchCommunityCompetitionEodhdHistory } from './communityCompetitionEodhd.js';

const PAGE_SIZE = 1000;
const USER_FILTER_CHUNK_SIZE = 100;
const EODHD_LOOKBACK_DAYS = 21;
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

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function normalizeDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
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

function normalizeLedgerRevision(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function normalizeLedgerState(row) {
  const userId = String(row?.user_id || '');
  const revision = normalizeLedgerRevision(row?.revision);
  const rawLastMutatedAt = row?.last_mutated_at;
  const lastMutatedAt = rawLastMutatedAt == null || rawLastMutatedAt === ''
    ? null
    : String(rawLastMutatedAt);
  const lastMutatedTime = lastMutatedAt == null ? null : Date.parse(lastMutatedAt);
  if (
    !userId
    || revision == null
    || (lastMutatedAt != null && !Number.isFinite(lastMutatedTime))
    || (revision > 0 && lastMutatedAt == null)
  ) {
    return null;
  }
  return { userId, revision, lastMutatedAt, lastMutatedTime };
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
  let response;
  try {
    response = await fetchWithTimeout(url, {
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
  } catch (error) {
    if (typeof error?.retryable !== 'boolean') error.retryable = true;
    if (!error.code) error.code = 'snapshot_storage_temporarily_unavailable';
    throw error;
  }
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const error = new Error(
      body?.message || body?.error_description || body?.error || `Supabase REST ${response.status}`
    );
    error.status = response.status;
    error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    error.code = error.retryable
      ? 'snapshot_storage_temporarily_unavailable'
      : 'snapshot_storage_failure';
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
    side: row?.side === 'sell' ? 'sell' : row?.side === 'buy' ? 'buy' : '',
    trade_date: String(row?.trade_date || '').slice(0, 10),
    price: toNumber(row?.price),
    shares: toNumber(row?.shares),
    fee: toNumber(row?.fee),
    currency: row?.currency == null ? 'USD' : String(row.currency),
    note: row?.note || '',
    created_at: row?.created_at || '',
    updated_at: row?.updated_at || '',
  };
}

async function fetchActiveMembers() {
  const url = new URL('/rest/v1/community_competition_members', 'https://placeholder.local');
  url.searchParams.set('select', [
    'user_id',
    'status',
    'joined_at',
    'updated_at',
    'eligible_after_snapshot_date',
    'eligible_ledger_hash',
    'eligible_ledger_revision',
    'ranking_start_snapshot_date',
    'ranking_baseline_return_pct',
  ].join(','));
  url.searchParams.set('status', 'eq.active');
  url.searchParams.set('order', 'joined_at.asc');
  return fetchPaged(`${url.pathname}${url.search}`);
}

async function fetchLedgerStatesForUsers(userIds) {
  if (userIds.size === 0) return new Map();
  const ids = [...userIds];
  const states = new Map();
  for (let offset = 0; offset < ids.length; offset += USER_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + USER_FILTER_CHUNK_SIZE);
    const url = new URL('/rest/v1/stock_trade_ledger_revisions', 'https://placeholder.local');
    url.searchParams.set('select', 'user_id,revision,last_mutated_at');
    url.searchParams.set('user_id', `in.(${chunk.join(',')})`);
    url.searchParams.set('order', 'user_id.asc');
    const rows = await fetchPaged(`${url.pathname}${url.search}`);
    rows.forEach((row) => {
      const state = normalizeLedgerState(row);
      if (state) states.set(state.userId, state);
    });
  }
  return states;
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
      'updated_at',
    ].join(','));
    url.searchParams.set('user_id', `in.(${chunk.join(',')})`);
    url.searchParams.set('order', 'user_id.asc,trade_date.asc,created_at.asc');
    rows.push(...await fetchPaged(`${url.pathname}${url.search}`, { mapRow: mapTrade }));
  }
  // Never hide malformed formal-ledger rows from the strict competition model.
  // A bad row must reject that member instead of being omitted from the hash.
  return rows.filter((trade) => userIds.has(trade.user_id));
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
      'ledger_revision',
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

async function fetchEodRowsWithRetry(symbol, {
  from,
  targetDate,
  requireTargetClose = true,
} = {}) {
  return fetchCommunityCompetitionEodhdHistory({
    symbol,
    fromDate: from,
    throughDate: targetDate,
    requiredThroughDate: requireTargetClose ? targetDate : from,
  });
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

function requiredSymbolsForSnapshot(trades, targetDate, priorSnapshotDate = null) {
  const priorDate = normalizeDate(priorSnapshotDate);
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
    if (priorDate ? trade.trade_date <= priorDate : trade.trade_date < targetDate) {
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

async function writeUnpublishedCompetitionSnapshot({
  member,
  row,
  initializeRankingBaselineReturnPct,
}) {
  const body = await supabaseAdminFetch(
    '/rest/v1/rpc/upsert_unpublished_community_competition_member_snapshot',
    {
      method: 'POST',
      body: JSON.stringify({
        p_user_id: row.user_id,
        p_target_snapshot_date: row.snapshot_date,
        p_expected_ledger_revision: row.ledger_revision,
        p_expected_eligible_after_snapshot_date: member.eligible_after_snapshot_date,
        p_expected_eligible_ledger_hash: member.eligible_ledger_hash || null,
        p_expected_eligible_ledger_revision: member.eligible_ledger_revision,
        p_expected_ranking_start_snapshot_date:
          member.ranking_start_snapshot_date || null,
        p_expected_ranking_baseline_return_pct:
          member.ranking_baseline_return_pct == null
            ? null
            : Number(member.ranking_baseline_return_pct),
        p_initialize_ranking_baseline_return_pct:
          member.ranking_start_snapshot_date
            ? null
            : initializeRankingBaselineReturnPct,
        p_daily_return_pct: row.daily_return_pct,
        p_cumulative_return_pct: row.cumulative_return_pct,
        p_locked_at: row.locked_at,
        p_ledger_hash: row.ledger_hash,
        p_source_version: row.source_version,
      }),
    },
  );
  const result = Array.isArray(body) ? body[0] : body;
  const outcome = String(result?.outcome || result?.result || 'invalid_response');
  if (['stale_ledger', 'stale_member', 'historical_dirty'].includes(outcome)) {
    const error = new Error(`收益比赛未发布快照并发冲突: ${outcome}`);
    error.code = outcome;
    error.status = 409;
    error.retryable = true;
    throw error;
  }
  if (![
    'inserted',
    'replaced_unpublished',
    'already_current',
    'published',
  ].includes(outcome)) {
    const error = new Error(`收益比赛未发布快照写入失败: ${outcome}`);
    error.code = outcome;
    error.status = 503;
    error.retryable = true;
    throw error;
  }

  const existingUrl = new URL('/rest/v1/community_competition_snapshots', 'https://placeholder.local');
  existingUrl.searchParams.set('select', [
    'user_id',
    'snapshot_date',
    'daily_return_pct',
    'cumulative_return_pct',
    'locked_at',
    'source_version',
    'ledger_hash',
    'ledger_revision',
  ].join(','));
  existingUrl.searchParams.set('user_id', `eq.${row.user_id}`);
  existingUrl.searchParams.set('snapshot_date', `eq.${row.snapshot_date}`);
  existingUrl.searchParams.set('limit', '1');
  const existingRows = await supabaseAdminFetch(`${existingUrl.pathname}${existingUrl.search}`);
  const existing = Array.isArray(existingRows) ? existingRows[0] || null : null;
  if (!existing) throw new Error('权威收益比赛快照冲突后无法读取');
  return {
    row: existing,
    inserted: outcome === 'inserted' || outcome === 'replaced_unpublished',
    outcome,
    rankingInitialized: Boolean(result?.rankingInitialized),
  };
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
  const hasDateParam = hasOwn(req?.query, 'date');
  if (!hasDateParam) return resolveScheduledUsSnapshotDate(now);

  const requestedDate = normalizeDate(firstQueryValue(req?.query?.date));
  if (!requestedDate) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }
  const today = currentNewYorkDate(now);
  if (requestedDate > today) {
    const error = new Error('目标日期不能晚于纽约当前日期');
    error.status = 400;
    throw error;
  }
  if (requestedDate === today && !isNewYorkSnapshotWindowOpen(now)) {
    const error = new Error('纽约时间 17:00 后才能生成当日收益比赛快照');
    error.status = 400;
    throw error;
  }
  return requestedDate;
}

export function hasExplicitCommunityCompetitionSnapshotDate(req) {
  return hasOwn(req?.query, 'date');
}

export async function runCommunityCompetitionDailySnapshot({
  targetDate = latestCompletedUsTradingDate(new Date()),
  now = new Date(),
  memberUserIds = null,
  requireTargetCloseConfirmation = false,
} = {}) {
  const normalizedTargetDate = normalizeDate(targetDate);
  if (!normalizedTargetDate) {
    const error = new Error('目标日期不合法');
    error.status = 400;
    throw error;
  }
  const lockedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  if (requireTargetCloseConfirmation) {
    try {
      await fetchEodRowsWithRetry(MARKET_CALENDAR_SYMBOL, {
        from: shiftDate(normalizedTargetDate, -7),
        targetDate: normalizedTargetDate,
        requireTargetClose: true,
      });
    } catch (error) {
      const nonRetryable = error?.retryable === false;
      const reason = error?.code === 'missing_target_close'
        ? 'explicit_target_close_missing'
        : nonRetryable
          ? 'explicit_target_close_nonretryable_failure'
          : 'explicit_target_close_unavailable';
      return {
        success: false,
        targetDate: normalizedTargetDate,
        activeMembers: 0,
        eligibleMembers: 0,
        writtenSnapshots: 0,
        existingSnapshots: 0,
        initializedMembers: 0,
        rebaselinedMembers: 0,
        deferredMembers: 0,
        skippedMembers: 0,
        authoritativeRejectedMembers: 0,
        retryableIncompleteMembers: 0,
        retryableIncomplete: !nonRetryable,
        failedMembers: nonRetryable ? 1 : 0,
        symbolsCount: 0,
        failedSymbolsCount: 1,
        source: 'EODHD_EOD',
        generatedAt: lockedAt,
        deferredReasons: {},
        skippedReasons: {},
        authoritativeRejectionReasons: {},
        retryableIncompleteReasons: nonRetryable ? {} : { [reason]: 1 },
        failedReasons: nonRetryable ? { [reason]: 1 } : {},
      };
    }
  }
  const members = await fetchActiveMembers();
  const selectedUserIds = memberUserIds == null
    ? null
    : new Set([...memberUserIds].map((userId) => String(userId)));
  const eligibleMembers = members.filter((member) => (
    eligibleForSnapshot(member, normalizedTargetDate, lockedAt)
    && (!selectedUserIds || selectedUserIds.has(String(member.user_id)))
  ));
  const eligibleUserIds = new Set(eligibleMembers.map((member) => String(member.user_id)));
  // Read the authoritative revision before the ledger. The snapshot INSERT trigger
  // compares this revision again while holding the database ledger-state lock.
  const ledgerStatesByUser = await fetchLedgerStatesForUsers(eligibleUserIds);
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
    rebaselinedMembers: 0,
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
  const defer = (reason, userId = null) => {
    const key = String(reason || 'not_started').slice(0, 120);
    result.deferredMembers += 1;
    result.deferredReasons[key] = (result.deferredReasons[key] || 0) + 1;
    if (userId) blockedUserIds.add(String(userId));
  };
  const fail = (error, userId) => {
    if (userId) blockedUserIds.add(String(userId));
    if (error?.retryable === true) {
      const reason = 'snapshot_storage_temporarily_unavailable';
      result.retryableIncomplete = true;
      result.retryableIncompleteMembers += 1;
      result.retryableIncompleteReasons[reason] = (
        result.retryableIncompleteReasons[reason] || 0
      ) + 1;
      return;
    }
    result.failedMembers += 1;
    const reason = String(error?.code || error?.message || 'unknown_error').slice(0, 120);
    result.failedReasons[reason] = (result.failedReasons[reason] || 0) + 1;
  };
  const candidates = [];
  for (const member of eligibleMembers) {
    const userId = String(member.user_id);
    const userTrades = tradesByUser.get(userId) || [];
    const prior = priorSnapshotsByUser.get(userId) || null;
    try {
      const ledgerState = ledgerStatesByUser.get(userId) || null;
      const eligibleLedgerRevision = normalizeLedgerRevision(member.eligible_ledger_revision);
      if (!ledgerState) {
        skip('missing_ledger_state', userId);
        continue;
      }
      if (eligibleLedgerRevision == null) {
        skip('missing_eligible_ledger_revision', userId);
        continue;
      }
      if (ledgerState.revision < eligibleLedgerRevision) {
        skip('ledger_revision_regression', userId);
        continue;
      }
      let priorCumulativeReturnPct = 0;
      if (prior) {
        const priorLedgerRevision = normalizeLedgerRevision(prior.ledger_revision);
        if (priorLedgerRevision == null) {
          skip('missing_prior_ledger_revision', userId);
          continue;
        }
        if (priorLedgerRevision > ledgerState.revision) {
          skip('ledger_revision_regression', userId);
          continue;
        }
      }
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
      }
      // Joining does not manufacture a 0% ranking entry before the first
      // effective formal trade. Once a member has a locked snapshot, an
      // intentionally emptied ledger may still carry forward at 0%.
      if (
        !prior
        && !userTrades.some((trade) => trade.trade_date <= normalizedTargetDate)
      ) {
        defer('not_started', userId);
        continue;
      }
      candidates.push({
        member,
        ledgerState,
        userTrades,
        prior,
        priorCumulativeReturnPct,
        requiredSymbols: requiredSymbolsForSnapshot(
          userTrades,
          normalizedTargetDate,
          prior?.snapshot_date || member.eligible_after_snapshot_date,
        ),
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
    const { member, ledgerState, userTrades, prior, priorCumulativeReturnPct } = candidate;
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
        priorSnapshotDate: prior?.snapshot_date
          || normalizeDate(member.eligible_after_snapshot_date),
        priorCumulativeReturnPct,
        historicalCorrectionMode: true,
        initialRankingStartMode: !prior,
        allowInitialEmpty: Boolean(prior),
        allowTradesBetweenSnapshots: true,
      });
      const authoritative = await writeUnpublishedCompetitionSnapshot({
        member,
        initializeRankingBaselineReturnPct: priorCumulativeReturnPct,
        row: {
          user_id: member.user_id,
          snapshot_date: normalizedTargetDate,
          daily_return_pct: built.dailyReturnPct,
          cumulative_return_pct: built.cumulativeReturnPct,
          locked_at: lockedAt,
          source_version: SOURCE_VERSION,
          ledger_hash: built.ledgerHash,
          ledger_revision: ledgerState.revision,
          updated_at: lockedAt,
        },
      });
      const authoritativeDailyReturnPct = authoritative.row?.daily_return_pct == null
        ? null
        : Number(authoritative.row.daily_return_pct);
      const authoritativeCumulativeReturnPct = Number(authoritative.row?.cumulative_return_pct);
      const authoritativeLedgerHash = String(authoritative.row?.ledger_hash || '');
      const authoritativeLedgerRevision = normalizeLedgerRevision(
        authoritative.row?.ledger_revision
      );
      if (
        !Number.isFinite(authoritativeDailyReturnPct)
        || !Number.isFinite(authoritativeCumulativeReturnPct)
        || authoritativeLedgerHash !== built.ledgerHash
        || authoritativeLedgerRevision == null
        || (authoritative.inserted && authoritativeLedgerRevision !== ledgerState.revision)
      ) {
        throw new CompetitionSnapshotValidationError(
          'locked_snapshot_mismatch',
          '已锁定收益比赛快照与当前账本不一致'
        );
      }
      if (authoritative.inserted) result.writtenSnapshots += 1;
      else result.existingSnapshots += 1;
      if (authoritative.rankingInitialized) {
        result.initializedMembers += 1;
        member.ranking_start_snapshot_date = normalizedTargetDate;
        member.ranking_baseline_return_pct = priorCumulativeReturnPct;
      }
      completedUserIds.add(String(member.user_id));
    } catch (error) {
      if (error instanceof CompetitionSnapshotValidationError) {
        if (!prior && error.code === 'zero_denominator') defer('not_started', member.user_id);
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
  // Formal trades are intentionally mutable. Repair every dirty member against
  // the latest already-published close before advancing the global close date.
  // A failed repair writes nothing and the existing snapshot validation below
  // keeps the newer marker from being published with a mixed ledger cohort.
  try {
    await recalculateDirtyCommunityCompetitionMembers({ now });
  } catch {
    // The normal snapshot validation remains fail-closed for any member whose
    // dirty repair could not be loaded. Existing publication stays intact.
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
    rebaselinedMembers: 0,
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
  const recordOperationalFailure = (error, reason, count = 1) => {
    if (error?.retryable === true) {
      markIncomplete(reason, count);
      result.retryableIncompleteMembers += count;
      return;
    }
    result.failedMembers += count;
    result.failedReasons[reason] = (result.failedReasons[reason] || 0) + count;
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
    let ledgerStatesByUser = new Map();
    try {
      // Keep the read order aligned with the database lock/CAS contract.
      ledgerStatesByUser = await fetchLedgerStatesForUsers(initialSearchUserIds);
      const initialSearchTrades = await fetchStockTradesForUsers(initialSearchUserIds);
      tradesByUser = new Map([...initialSearchUserIds].map((userId) => [userId, []]));
      initialSearchTrades.forEach((trade) => tradesByUser.get(trade.user_id)?.push(trade));
    } catch (error) {
      initialSearchMembers.forEach((member) => {
        initialSearchBlockedUserIds.add(String(member.user_id));
      });
      recordOperationalFailure(
        error,
        'initial_search_trade_read_failed',
        initialSearchMembers.length,
      );
    }
    for (const member of initialSearchMembers) {
      const userId = String(member.user_id);
      if (initialSearchBlockedUserIds.has(userId)) continue;
      const eligibleDate = normalizeDate(member.eligible_after_snapshot_date);
      const eligibleLedgerHash = String(member.eligible_ledger_hash || '');
      const eligibleLedgerRevision = normalizeLedgerRevision(member.eligible_ledger_revision);
      const ledgerState = ledgerStatesByUser.get(userId) || null;
      const userTrades = tradesByUser.get(userId) || [];
      if (!eligibleDate || !/^[a-f0-9]{64}$/i.test(eligibleLedgerHash)) {
        rejectInitialSearch('missing_eligible_ledger_hash', userId);
        continue;
      }
      if (!ledgerState) {
        rejectInitialSearch('missing_ledger_state', userId);
        continue;
      }
      if (eligibleLedgerRevision == null) {
        rejectInitialSearch('missing_eligible_ledger_revision', userId);
        continue;
      }
      if (ledgerState.revision < eligibleLedgerRevision) {
        rejectInitialSearch('ledger_revision_regression', userId);
        continue;
      }
      try {
        const currentEligibleLedgerHash = computeCompetitionLedgerHash(userTrades, eligibleDate);
        if (currentEligibleLedgerHash !== eligibleLedgerHash) {
          // The dirty-rebuild CAS must refresh this baseline before the normal
          // cron advances publication. Never silently move the user's range.
          rejectInitialSearch('eligible_ledger_hash_mismatch', userId);
          continue;
        }
        if (deriveCompetitionHoldingSymbols(userTrades, eligibleDate).length === 0) {
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
          // Skip empty market days before the first formal trade. A calendar
          // day anchor also maps weekend trades to the next actual SPY close.
          const acceleratedAnchor = shiftDate(firstLaterTradeDate, -1);
          if (acceleratedAnchor && acceleratedAnchor > eligibleDate) {
            anchors.set(userId, acceleratedAnchor);
          }
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
  const rankingRecoveryMembers = targetEligibleMembers.filter((member) => (
    !member.ranking_start_snapshot_date
    && latestSnapshots.has(String(member.user_id))
  ));
  const rankingRecoveryBlockedUserIds = new Set(
    rankingRecoveryMembers.map((member) => String(member.user_id)),
  );
  if (rankingRecoveryBlockedUserIds.size > 0) {
    // Existing snapshots plus a null ranking pair require the authenticated
    // dirty full-rebuild RPC. Never recreate the old split PATCH race here.
    markIncomplete('ranking_rebuild_pending', rankingRecoveryBlockedUserIds.size);
    result.retryableIncompleteMembers += rankingRecoveryBlockedUserIds.size;
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
    result.rebaselinedMembers += daily.rebaselinedMembers || 0;
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
      rebaselinedMembers: daily.rebaselinedMembers || 0,
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
