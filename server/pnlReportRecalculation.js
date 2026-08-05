import { createHash } from 'node:crypto';

import {
  buildPnlReportHistoricalSnapshots,
  latestCompletedUsTradingDate,
} from '../src/lib/pnlReportSnapshots.js';
import {
  fetchCommunityCompetitionEodhdHistories,
  fetchCommunityCompetitionEodhdHistory,
} from './communityCompetitionEodhd.js';
import {
  fetchAvailableCashStatusUserIds,
  isValidTrade,
  mapStockTradeRow,
  normalizeDateParam,
  requiredCloseSymbolsForUser,
  resolveAvailableCashSnapshotTargets,
  resolveMarginDebtSnapshotTargets,
  shiftDate,
  supabaseAdminFetch,
  toPortfolioSnapshotRow,
  toSymbolSnapshotRow,
} from './pnlReportDailySnapshot.js';

const PAGE_SIZE = 1000;
const MAX_CAS_ATTEMPTS = 2;
const PORTFOLIO_STAGE_BATCH_SIZE = 250;
const SYMBOL_STAGE_BATCH_SIZE = 5000;
const CLOSE_LOOKBACK_DAYS = 45;
const DIRTY_USER_BATCH_LIMIT = 10;
const DIRTY_USER_CONCURRENCY = 2;
const EXPIRED_JOB_CLEANUP_LIMIT = 1000;
const FINALIZE_TIMEOUT_MS = 45_000;
const ACCEPTED_COMMIT_OUTCOMES = new Set([
  'recalculated',
  'cleared',
  'already_current',
]);
const ACCEPTED_BEGIN_OUTCOMES = new Set([
  'ready',
  'already_current',
]);
const ACCEPTED_STAGE_OUTCOMES = new Set([
  'staged',
  'already_current',
]);
const STALE_OUTCOMES = new Set([
  'stale',
  'stale_ledger',
  'stale_generation',
  'stale_dirty',
]);
const recalculationFlights = new Map();
const regularNyseHolidayCache = new Map();

export class PnlReportRecalculationError extends Error {
  constructor(message, {
    code = 'PNL_RECALCULATION_FAILED',
    status = 500,
    retryable = false,
  } = {}) {
    super(message);
    this.name = 'PnlReportRecalculationError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function normalizeCounter(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function observedFixedHoliday(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return utcDateKey(date);
}

function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + ((occurrence - 1) * 7));
  return utcDateKey(date);
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return utcDateKey(date);
}

function easterSundayUtc(year) {
  // Gregorian computus; NYSE Good Friday is two days before this date.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = ((19 * a) + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + (2 * e) + (2 * i) - h - k) % 7;
  const m = Math.floor((a + (11 * h) + (22 * l)) / 451);
  const month = Math.floor((h + l - (7 * m) + 114) / 31);
  const day = ((h + l - (7 * m) + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function regularNyseHolidaysForYear(year) {
  if (regularNyseHolidayCache.has(year)) return regularNyseHolidayCache.get(year);
  const holidays = new Set([
    observedFixedHoliday(year, 0, 1),
    nthWeekdayOfMonth(year, 0, 1, 3),
    nthWeekdayOfMonth(year, 1, 1, 3),
    lastWeekdayOfMonth(year, 4, 1),
    observedFixedHoliday(year, 6, 4),
    nthWeekdayOfMonth(year, 8, 1, 1),
    nthWeekdayOfMonth(year, 10, 4, 4),
    observedFixedHoliday(year, 11, 25),
  ]);
  if (year >= 2022) holidays.add(observedFixedHoliday(year, 5, 19));
  const goodFriday = easterSundayUtc(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  holidays.add(utcDateKey(goodFriday));
  regularNyseHolidayCache.set(year, holidays);
  return holidays;
}

export function isRegularNyseHoliday(dateKey) {
  const normalized = normalizeDateParam(dateKey);
  if (!normalized) return false;
  const year = Number(normalized.slice(0, 4));
  return [year - 1, year, year + 1]
    .some((holidayYear) => regularNyseHolidaysForYear(holidayYear).has(normalized));
}

function previousRegularNyseSessionDate(dateKey) {
  let cursor = shiftDate(dateKey, -1);
  for (let index = 0; index < 10 && cursor; index += 1) {
    const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !isRegularNyseHoliday(cursor)) return cursor;
    cursor = shiftDate(cursor, -1);
  }
  return null;
}

function normalizedRpcOutcome(body) {
  if (Array.isArray(body)) return normalizedRpcOutcome(body[0] || null);
  if (typeof body === 'string') return { outcome: body };
  if (!body || typeof body !== 'object') return { outcome: 'invalid_response' };
  return {
    ...body,
    outcome: String(body.outcome || body.result || 'invalid_response'),
  };
}

function staleError(outcome = 'stale') {
  return new PnlReportRecalculationError('个人收益账本在重算期间发生变化', {
    code: STALE_OUTCOMES.has(outcome) ? outcome : 'stale',
    status: 409,
    retryable: true,
  });
}

function ledgerError(message) {
  return new PnlReportRecalculationError(message, {
    code: 'PNL_LEDGER_INVALID',
    status: 409,
    retryable: false,
  });
}

async function fetchDirtyState(userId) {
  const url = new URL('/rest/v1/pnl_report_rebuild_state', 'https://placeholder.local');
  url.searchParams.set('select', 'user_id,dirty_from_date,ledger_revision,generation');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchDirtyUserIds(limit) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || DIRTY_USER_BATCH_LIMIT));
  const url = new URL('/rest/v1/pnl_report_rebuild_state', 'https://placeholder.local');
  url.searchParams.set('select', 'user_id,dirty_from_date,ledger_revision,generation');
  url.searchParams.set('dirty_from_date', 'not.is.null');
  url.searchParams.set('order', 'updated_at.asc,user_id.asc');
  url.searchParams.set('limit', String(safeLimit + 1));
  const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`);
  const candidates = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      userId: String(row?.user_id || '').trim(),
      dirtyFromDate: normalizeDateParam(row?.dirty_from_date),
      ledgerRevision: normalizeCounter(row?.ledger_revision),
      generation: normalizeCounter(row?.generation),
    }))
    .filter((candidate) => (
      candidate.userId
      && candidate.dirtyFromDate
      && candidate.ledgerRevision != null
      && candidate.generation != null
      && candidate.generation > 0
    ));
  return {
    candidates: candidates.slice(0, safeLimit),
    batchLimited: candidates.length > safeLimit,
  };
}

async function rotateDirtyRebuildAttempt(candidate) {
  const body = await supabaseAdminFetch('/rest/v1/rpc/rotate_pnl_report_rebuild_attempt', {
    method: 'POST',
    body: JSON.stringify({
      p_user_id: candidate.userId,
      p_expected_ledger_revision: candidate.ledgerRevision,
      p_expected_generation: candidate.generation,
      p_expected_dirty_from_date: candidate.dirtyFromDate,
    }),
  });
  const outcome = normalizedRpcOutcome(body);
  if (!['rotated', 'already_current', 'stale'].includes(outcome.outcome)) {
    throw new PnlReportRecalculationError('个人收益待重算队列轮转返回无效状态', {
      code: 'INVALID_REBUILD_ROTATION_STATE',
      status: 503,
      retryable: true,
    });
  }
  return outcome;
}

async function cleanupExpiredRebuildJobs() {
  const body = await supabaseAdminFetch('/rest/v1/rpc/cleanup_pnl_report_rebuild_jobs', {
    method: 'POST',
    body: JSON.stringify({ p_limit: EXPIRED_JOB_CLEANUP_LIMIT }),
  });
  const outcome = normalizedRpcOutcome(body);
  if (outcome.outcome !== 'cleaned') {
    throw new PnlReportRecalculationError('个人收益过期暂存清理返回无效状态', {
      code: 'INVALID_REBUILD_CLEANUP_STATE',
      status: 503,
      retryable: true,
    });
  }
  return Math.max(0, Number(outcome.deletedJobs ?? outcome.deleted_jobs) || 0);
}

async function fetchLedgerRevision(userId) {
  const url = new URL('/rest/v1/stock_trade_ledger_revisions', 'https://placeholder.local');
  url.searchParams.set('select', 'user_id,revision');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  const revision = normalizeCounter(row?.revision);
  return row && revision != null ? revision : null;
}

function validateRawTrade(row, userId) {
  const normalizedDate = normalizeDateParam(row?.trade_date);
  const rawSymbol = String(row?.symbol || '').trim();
  const price = Number(row?.price);
  const shares = Number(row?.shares);
  const fee = Number(row?.fee ?? 0);
  if (
    String(row?.user_id || '') !== userId
    || !String(row?.id || '')
    || rawSymbol !== rawSymbol.toUpperCase()
    || !/^[A-Z0-9._-]{1,15}$/.test(rawSymbol)
    || !['buy', 'sell'].includes(row?.side)
    || !normalizedDate
    || !Number.isFinite(price)
    || price <= 0
    || !Number.isFinite(shares)
    || shares <= 0
    || !Number.isFinite(fee)
    || fee < 0
    || String(row?.currency || 'USD').trim().toUpperCase() !== 'USD'
  ) {
    throw ledgerError('个人收益正式交易账本存在不合法记录');
  }
}

async function fetchUserTrades(userId) {
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
    'updated_at',
  ].join(',');
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL('/rest/v1/stock_trades', 'https://placeholder.local');
    url.searchParams.set('select', select);
    url.searchParams.set('user_id', `eq.${userId}`);
    url.searchParams.set('order', 'trade_date.asc,created_at.asc,id.asc');
    const page = await supabaseAdminFetch(`${url.pathname}${url.search}`, {
      headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    const pageRows = Array.isArray(page) ? page : [];
    pageRows.forEach((row) => validateRawTrade(row, userId));
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }
  const trades = rows.map(mapStockTradeRow);
  if (trades.some((trade) => !isValidTrade(trade))) {
    throw ledgerError('个人收益正式交易账本无法解析');
  }
  return trades;
}

function candidateCompletedClose(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw new PnlReportRecalculationError('个人收益重算时间不合法', {
      code: 'INVALID_RECALCULATION_TIME',
      status: 400,
      retryable: false,
    });
  }
  // Weekends are moved to Friday here. A normal weekday remains an exact
  // completed-close candidate and must never fall back to an older EODHD row.
  return latestCompletedUsTradingDate(date);
}

async function fetchTradingCalendar({ dirtyFromDate, now }) {
  const candidateDate = candidateCompletedClose(now);
  const targetDate = isRegularNyseHoliday(candidateDate)
    ? previousRegularNyseSessionDate(candidateDate)
    : candidateDate;
  if (!targetDate || dirtyFromDate > targetDate) {
    return { tradingDates: [], throughDate: null, waitingForClose: true };
  }
  let spyRows;
  try {
    spyRows = await fetchCommunityCompetitionEodhdHistory({
      symbol: 'SPY',
      fromDate: dirtyFromDate,
      throughDate: targetDate,
      requiredThroughDate: targetDate,
    });
  } catch (error) {
    if (error?.code === 'missing_target_close') {
      return { tradingDates: [], throughDate: null, waitingForClose: true };
    }
    throw error;
  }
  const tradingDates = [...new Set((Array.isArray(spyRows) ? spyRows : [])
    .map((row) => normalizeDateParam(row?.date))
    .filter((date) => date && date >= dirtyFromDate && date <= targetDate))]
    .sort();
  if (tradingDates.length === 0) {
    return { tradingDates: [], throughDate: null, waitingForClose: true };
  }
  if (tradingDates.at(-1) !== targetDate) {
    return { tradingDates: [], throughDate: null, waitingForClose: true };
  }
  return {
    tradingDates,
    throughDate: tradingDates.at(-1),
    waitingForClose: false,
  };
}

function requiredCloseDatesBySymbol(trades, tradingDates) {
  const required = new Map();
  tradingDates.forEach((snapshotDate) => {
    requiredCloseSymbolsForUser(trades, snapshotDate).forEach((symbol) => {
      if (!required.has(symbol)) required.set(symbol, new Set());
      required.get(symbol).add(snapshotDate);
    });
  });
  return required;
}

function assertRequiredCloses(histories, requiredDates) {
  for (const [symbol, dates] of requiredDates.entries()) {
    const available = new Set((histories?.[symbol] || [])
      .map((row) => normalizeDateParam(row?.date))
      .filter(Boolean));
    const missing = [...dates].filter((date) => !available.has(date));
    if (missing.length > 0) {
      throw new PnlReportRecalculationError(
        `EODHD ${symbol} 缺少已完成收盘`,
        {
          code: 'missing_target_close',
          status: 503,
          retryable: true,
        }
      );
    }
  }
}

async function buildReplacementPlan({
  userId,
  dirtyFromDate,
  ledgerRevision,
  generation,
  trades,
  now,
}) {
  if (trades.length === 0) {
    const availableCashUserIds = await fetchAvailableCashStatusUserIds(userId);
    if (!availableCashUserIds.has(userId)) {
      return {
        userId,
        dirtyFromDate,
        ledgerRevision,
        generation,
        throughDate: null,
        portfolioRows: [],
        symbolRows: [],
        clearAll: true,
      };
    }
  }

  const calendar = await fetchTradingCalendar({ dirtyFromDate, now });
  if (calendar.waitingForClose) {
    return {
      userId,
      dirtyFromDate,
      ledgerRevision,
      generation,
      throughDate: null,
      portfolioRows: [],
      symbolRows: [],
      clearAll: false,
      waitingForClose: true,
    };
  }

  const throughDate = calendar.throughDate;
  const scopedTrades = trades.filter((trade) => trade.trade_date <= throughDate);
  const requiredDates = requiredCloseDatesBySymbol(scopedTrades, calendar.tradingDates);
  const requiredSymbols = [...requiredDates.keys()].sort();
  const requiredThroughDates = Object.fromEntries(
    [...requiredDates.entries()].map(([symbol, dates]) => [symbol, [...dates].sort().at(-1)])
  );
  const historyFromDate = shiftDate(dirtyFromDate, -CLOSE_LOOKBACK_DAYS);
  if (!historyFromDate) throw ledgerError('个人收益重算起始日期不合法');
  const historicalClosesBySymbol = requiredSymbols.length > 0
    ? await fetchCommunityCompetitionEodhdHistories({
        symbols: requiredSymbols,
        fromDate: historyFromDate,
        throughDate,
        requiredThroughDates,
      })
    : {};
  assertRequiredCloses(historicalClosesBySymbol, requiredDates);

  const snapshotTargets = new Map([[userId, calendar.tradingDates]]);
  const [marginByUser, cashByUser] = await Promise.all([
    resolveMarginDebtSnapshotTargets(snapshotTargets),
    resolveAvailableCashSnapshotTargets(snapshotTargets),
  ]);
  const lockedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const built = buildPnlReportHistoricalSnapshots({
    stockTrades: scopedTrades,
    historicalClosesBySymbol,
    snapshotDates: calendar.tradingDates,
    toDate: throughDate,
    maxSnapshots: calendar.tradingDates.length,
    cashByDate: cashByUser.get(userId),
    marginDebtByDate: marginByUser.get(userId),
    lockedAt,
    backfillMode: 'ledger',
  });
  const actualDates = built.snapshots
    .map((entry) => entry?.portfolioSnapshot?.snapshotDate)
    .filter(Boolean);
  if (
    built.skippedDates.length > 0
    || actualDates.length !== calendar.tradingDates.length
    || actualDates.some((date, index) => date !== calendar.tradingDates[index])
  ) {
    throw new PnlReportRecalculationError('EODHD 已完成收盘数据不完整', {
      code: 'missing_target_close',
      status: 503,
      retryable: true,
    });
  }

  return {
    userId,
    dirtyFromDate,
    ledgerRevision,
    generation,
    throughDate,
    portfolioRows: built.snapshots.map((entry) => (
      toPortfolioSnapshotRow(entry.portfolioSnapshot, userId)
    )),
    symbolRows: built.snapshots.flatMap((entry) => (
      entry.symbolSnapshots.map((snapshot) => (
        toSymbolSnapshotRow(snapshot, userId, entry.portfolioSnapshot.snapshotDate)
      ))
    )),
    clearAll: false,
  };
}

function payloadHashForPlan(plan) {
  return createHash('sha256').update(JSON.stringify({
    userId: plan.userId,
    dirtyFromDate: plan.dirtyFromDate,
    ledgerRevision: plan.ledgerRevision,
    generation: plan.generation,
    throughDate: plan.throughDate,
    clearAll: plan.clearAll,
    portfolioRows: plan.portfolioRows,
    symbolRows: plan.symbolRows,
  })).digest('hex');
}

function operationKeyForPlan(plan, payloadHash) {
  return [
    'pnl-ledger-rebuild',
    plan.userId,
    plan.ledgerRevision,
    plan.generation,
    plan.clearAll ? 'clear' : plan.throughDate,
    payloadHash,
  ].join(':');
}

async function beginStaging(plan, operationKey, payloadHash) {
  const body = await supabaseAdminFetch('/rest/v1/rpc/begin_pnl_report_dirty_range', {
    method: 'POST',
    body: JSON.stringify({
      p_user_id: plan.userId,
      p_operation_key: operationKey,
      p_payload_hash: payloadHash,
      p_expected_ledger_revision: plan.ledgerRevision,
      p_expected_generation: plan.generation,
      p_expected_dirty_from_date: plan.dirtyFromDate,
      p_through_date: plan.throughDate,
      p_expected_portfolio_count: plan.portfolioRows.length,
      p_expected_symbol_count: plan.symbolRows.length,
      p_clear_all: plan.clearAll,
    }),
  });
  const outcome = normalizedRpcOutcome(body);
  if (STALE_OUTCOMES.has(outcome.outcome)) throw staleError(outcome.outcome);
  if (!ACCEPTED_BEGIN_OUTCOMES.has(outcome.outcome)) {
    throw new PnlReportRecalculationError('个人收益暂存初始化返回无效状态', {
      code: 'INVALID_REBUILD_BEGIN_STATE',
      status: 503,
      retryable: true,
    });
  }
  return outcome;
}

async function stageRows(plan, operationKey, payloadHash) {
  const batchCount = Math.max(
    Math.ceil(plan.portfolioRows.length / PORTFOLIO_STAGE_BATCH_SIZE),
    Math.ceil(plan.symbolRows.length / SYMBOL_STAGE_BATCH_SIZE)
  );
  for (let index = 0; index < batchCount; index += 1) {
    const portfolioRows = plan.portfolioRows.slice(
      index * PORTFOLIO_STAGE_BATCH_SIZE,
      (index + 1) * PORTFOLIO_STAGE_BATCH_SIZE
    );
    const symbolRows = plan.symbolRows.slice(
      index * SYMBOL_STAGE_BATCH_SIZE,
      (index + 1) * SYMBOL_STAGE_BATCH_SIZE
    );
    const body = await supabaseAdminFetch('/rest/v1/rpc/stage_pnl_report_dirty_range', {
      method: 'POST',
      body: JSON.stringify({
        p_user_id: plan.userId,
        p_operation_key: operationKey,
        p_payload_hash: payloadHash,
        p_expected_ledger_revision: plan.ledgerRevision,
        p_expected_generation: plan.generation,
        p_portfolio_rows: portfolioRows,
        p_symbol_rows: symbolRows,
      }),
    });
    const outcome = normalizedRpcOutcome(body);
    if (STALE_OUTCOMES.has(outcome.outcome)) throw staleError(outcome.outcome);
    if (!ACCEPTED_STAGE_OUTCOMES.has(outcome.outcome)) {
      throw new PnlReportRecalculationError('个人收益暂存写入返回无效状态', {
        code: 'INVALID_REBUILD_STAGE_STATE',
        status: 503,
        retryable: true,
      });
    }
    if (ACCEPTED_COMMIT_OUTCOMES.has(outcome.outcome)) return outcome;
  }
  return null;
}

async function finalizeStaging(plan, operationKey, payloadHash) {
  const body = await supabaseAdminFetch(
    '/rest/v1/rpc/replace_pnl_report_dirty_range',
    {
      method: 'POST',
      body: JSON.stringify({
        p_user_id: plan.userId,
        p_operation_key: operationKey,
        p_payload_hash: payloadHash,
        p_expected_ledger_revision: plan.ledgerRevision,
        p_expected_generation: plan.generation,
        p_expected_dirty_from_date: plan.dirtyFromDate,
        p_through_date: plan.throughDate,
        p_portfolio_rows: [],
        p_symbol_rows: [],
        p_clear_all: plan.clearAll,
      }),
    },
    { timeoutMs: FINALIZE_TIMEOUT_MS }
  );
  const outcome = normalizedRpcOutcome(body);
  if (STALE_OUTCOMES.has(outcome.outcome)) throw staleError(outcome.outcome);
  if (!ACCEPTED_COMMIT_OUTCOMES.has(outcome.outcome)) {
    throw new PnlReportRecalculationError('个人收益原子发布返回无效状态', {
      code: 'INVALID_REBUILD_COMMIT_STATE',
      status: 503,
      retryable: true,
    });
  }
  return outcome;
}

async function commitReplacementPlan(plan) {
  const payloadHash = payloadHashForPlan(plan);
  const operationKey = operationKeyForPlan(plan, payloadHash);
  const begun = await beginStaging(plan, operationKey, payloadHash);
  if (ACCEPTED_COMMIT_OUTCOMES.has(begun.outcome)) return begun;
  const staged = await stageRows(plan, operationKey, payloadHash);
  if (staged && ACCEPTED_COMMIT_OUTCOMES.has(staged.outcome)) return staged;
  return finalizeStaging(plan, operationKey, payloadHash);
}

async function recalculateAttempt({ userId, now }) {
  const dirty = await fetchDirtyState(userId);
  if (!dirty?.dirty_from_date) {
    return {
      success: true,
      state: 'already_current',
      fromDate: null,
      throughDate: null,
      ledgerRevision: normalizeCounter(dirty?.ledger_revision) ?? 0,
      generation: normalizeCounter(dirty?.generation) ?? 0,
      replacedPortfolio: 0,
      replacedSymbols: 0,
    };
  }
  const dirtyFromDate = normalizeDateParam(dirty.dirty_from_date);
  const dirtyRevision = normalizeCounter(dirty.ledger_revision);
  const generation = normalizeCounter(dirty.generation);
  if (!dirtyFromDate || dirtyRevision == null || generation == null) {
    throw ledgerError('个人收益重算状态不完整');
  }

  // The revision read must precede the trade read. If a mutation commits after
  // this point, the final database CAS rejects the prepared generation.
  const ledgerRevision = await fetchLedgerRevision(userId);
  if (ledgerRevision == null) throw ledgerError('个人收益正式交易 revision 不可用');
  if (ledgerRevision !== dirtyRevision) throw staleError('stale_ledger');
  const trades = await fetchUserTrades(userId);
  const plan = await buildReplacementPlan({
    userId,
    dirtyFromDate,
    ledgerRevision,
    generation,
    trades,
    now,
  });
  if (plan.waitingForClose) {
    return {
      success: true,
      state: 'waiting_for_close',
      fromDate: dirtyFromDate,
      throughDate: null,
      ledgerRevision,
      generation,
      replacedPortfolio: 0,
      replacedSymbols: 0,
    };
  }

  const committed = await commitReplacementPlan(plan);
  return {
    success: true,
    state: committed.outcome,
    fromDate: committed.fromDate || committed.from_date || dirtyFromDate,
    throughDate: committed.throughDate || committed.through_date || plan.throughDate,
    ledgerRevision: normalizeCounter(
      committed.ledgerRevision ?? committed.ledger_revision
    ) ?? ledgerRevision,
    generation: normalizeCounter(committed.generation) ?? generation,
    replacedPortfolio: Number(
      committed.replacedPortfolio ?? committed.replaced_portfolio ?? plan.portfolioRows.length
    ) || 0,
    replacedSymbols: Number(
      committed.replacedSymbols ?? committed.replaced_symbols ?? plan.symbolRows.length
    ) || 0,
  };
}

async function runWithCasRetry({ userId, now }) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt += 1) {
    try {
      return await recalculateAttempt({ userId, now });
    } catch (error) {
      lastError = error;
      if (!STALE_OUTCOMES.has(String(error?.code || '')) || attempt === MAX_CAS_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
}

export async function recalculatePnlReportUser({ userId, now = new Date() } = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new PnlReportRecalculationError('缺少个人收益用户', {
      code: 'MISSING_USER',
      status: 400,
      retryable: false,
    });
  }
  const existing = recalculationFlights.get(normalizedUserId);
  if (existing) return existing;
  const flight = runWithCasRetry({ userId: normalizedUserId, now })
    .finally(() => {
      if (recalculationFlights.get(normalizedUserId) === flight) {
        recalculationFlights.delete(normalizedUserId);
      }
    });
  recalculationFlights.set(normalizedUserId, flight);
  return flight;
}

export async function recalculateDirtyPnlReportUsers({
  now = new Date(),
  limit = DIRTY_USER_BATCH_LIMIT,
  concurrency = DIRTY_USER_CONCURRENCY,
} = {}) {
  let cleanup = { success: true, deletedJobs: 0 };
  try {
    cleanup = {
      success: true,
      deletedJobs: await cleanupExpiredRebuildJobs(),
    };
  } catch (error) {
    // Staging garbage collection is storage hygiene, not a precondition for
    // rebuilding authoritative financial rows. Never block dirty users on it.
    cleanup = {
      success: false,
      deletedJobs: 0,
      retryable: isPnlReportRecalculationRetryable(error),
      reason: 'expired_job_cleanup_failed',
    };
  }
  const { candidates, batchLimited } = await fetchDirtyUserIds(limit);
  const summary = {
    cleanup,
    attempted: candidates.length,
    recalculated: 0,
    cleared: 0,
    alreadyCurrent: 0,
    waitingForClose: 0,
    failed: 0,
    retryableFailures: 0,
    permanentFailures: 0,
    rotationFailures: 0,
    batchLimited,
  };
  let cursor = 0;
  const workerCount = Math.max(
    1,
    Math.min(candidates.length || 1, Number(concurrency) || DIRTY_USER_CONCURRENCY)
  );
  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor;
      cursor += 1;
      const candidate = candidates[index];
      let rotateAfterAttempt = false;
      try {
        const result = await recalculatePnlReportUser({ userId: candidate.userId, now });
        if (result.state === 'recalculated') summary.recalculated += 1;
        else if (result.state === 'cleared') summary.cleared += 1;
        else if (result.state === 'already_current') summary.alreadyCurrent += 1;
        else {
          summary.waitingForClose += 1;
          rotateAfterAttempt = true;
        }
      } catch (error) {
        rotateAfterAttempt = true;
        summary.failed += 1;
        if (isPnlReportRecalculationRetryable(error)) summary.retryableFailures += 1;
        else summary.permanentFailures += 1;
      } finally {
        if (rotateAfterAttempt) {
          try {
            await rotateDirtyRebuildAttempt(candidate);
          } catch {
            summary.rotationFailures += 1;
          }
        }
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return {
    ...summary,
    complete: summary.failed === 0
      && summary.waitingForClose === 0
      && !summary.batchLimited,
    retryable: summary.permanentFailures === 0
      && (summary.retryableFailures > 0
        || summary.waitingForClose > 0
        || summary.batchLimited),
  };
}

export function isPnlReportRecalculationRetryable(error) {
  if (typeof error?.retryable === 'boolean') return error.retryable;
  const status = Number(error?.status) || 0;
  return status === 0
    || status === 402
    || status === 408
    || status === 409
    || status === 429
    || status >= 500;
}

export function resetPnlReportRecalculationStateForTests() {
  recalculationFlights.clear();
}
