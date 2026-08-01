import { randomUUID } from 'node:crypto';

import {
  buildCompetitionRecalculatedSnapshotSeries,
  CompetitionSnapshotValidationError,
  computeCompetitionLedgerHash,
  deriveCompetitionLedgerSymbols,
  deriveCompetitionRequiredCloseDates,
} from './communityCompetitionSnapshotModel.js';
import {
  fetchCommunityCompetitionEodhdHistories,
  fetchCommunityCompetitionEodhdHistory,
} from './communityCompetitionEodhd.js';
import { getLatestCommunityCompetitionSnapshotMarker } from './snapshotPublicationMarker.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';

const PAGE_SIZE = 1000;
const MAX_CAS_ATTEMPTS = 2;
const REBUILD_BATCH_LIMIT = 25;
const SOURCE_VERSION = 'community_competition_snapshot_v1';
const CAS_RETRY_OUTCOMES = new Set([
  'stale_ledger',
  'stale_member',
  'stale_publication',
]);

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeLedgerRevision(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getSupabaseAdminConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('收益比赛重算未配置: 缺少 Supabase URL 或 service role key');
    error.status = 500;
    error.retryable = false;
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

async function adminFetch(path, options = {}) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig();
  let response;
  try {
    response = await fetchWithTimeout(new URL(path, `${supabaseUrl}/`), {
      ...options,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }, {
      provider: 'supabase-community-competition-recalculation',
      timeoutMs: QUOTE_TIMEOUTS.default,
    });
  } catch (error) {
    if (typeof error?.retryable !== 'boolean') error.retryable = true;
    throw error;
  }
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const error = new Error(
      body?.message || body?.error_description || body?.error || `Supabase REST ${response.status}`
    );
    error.status = response.status;
    error.code = body?.code || '';
    error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw error;
  }
  return body;
}

async function fetchPaged(path) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const body = await adminFetch(path, {
      headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    const page = Array.isArray(body) ? body : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchMember(userId) {
  const url = new URL('/rest/v1/community_competition_members', 'https://placeholder.local');
  url.searchParams.set('select', [
    'user_id',
    'status',
    'joined_at',
    'eligible_after_snapshot_date',
    'eligible_ledger_hash',
    'eligible_ledger_revision',
    'ranking_start_snapshot_date',
    'ranking_baseline_return_pct',
  ].join(','));
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const rows = await adminFetch(`${url.pathname}${url.search}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchDirtyState(userId) {
  const url = new URL('/rest/v1/community_competition_rebuild_state', 'https://placeholder.local');
  url.searchParams.set('select', 'user_id,dirty_from_date,ledger_revision');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const rows = await adminFetch(`${url.pathname}${url.search}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchDirtyUserIds(limit = REBUILD_BATCH_LIMIT) {
  const url = new URL('/rest/v1/community_competition_rebuild_state', 'https://placeholder.local');
  url.searchParams.set('select', 'user_id');
  url.searchParams.set('dirty_from_date', 'not.is.null');
  url.searchParams.set('order', 'updated_at.asc');
  url.searchParams.set('limit', String(Math.max(1, Number(limit) || REBUILD_BATCH_LIMIT)));
  const rows = await adminFetch(`${url.pathname}${url.search}`);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.user_id || ''))
    .filter(Boolean);
}

async function fetchLedgerState(userId) {
  const url = new URL('/rest/v1/stock_trade_ledger_revisions', 'https://placeholder.local');
  url.searchParams.set('select', 'user_id,revision,last_mutated_at');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const rows = await adminFetch(`${url.pathname}${url.search}`);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  const revision = normalizeLedgerRevision(row?.revision);
  if (!row || revision == null) return null;
  return { revision, lastMutatedAt: row.last_mutated_at || null };
}

async function fetchTrades(userId, throughDate) {
  const url = new URL('/rest/v1/stock_trades', 'https://placeholder.local');
  url.searchParams.set('select', [
    'id',
    'user_id',
    'symbol',
    'side',
    'trade_date',
    'price',
    'shares',
    'fee',
    'currency',
    'created_at',
    'updated_at',
  ].join(','));
  url.searchParams.set('user_id', `eq.${userId}`);
  if (throughDate) url.searchParams.set('trade_date', `lte.${throughDate}`);
  url.searchParams.set('order', 'trade_date.asc,created_at.asc,id.asc');
  return fetchPaged(`${url.pathname}${url.search}`);
}

async function fetchSnapshots(userId, throughDate) {
  const url = new URL('/rest/v1/community_competition_snapshots', 'https://placeholder.local');
  url.searchParams.set('select', [
    'user_id',
    'snapshot_date',
    'daily_return_pct',
    'cumulative_return_pct',
    'locked_at',
    'ledger_hash',
    'ledger_revision',
  ].join(','));
  url.searchParams.set('user_id', `eq.${userId}`);
  if (throughDate) url.searchParams.set('snapshot_date', `lte.${throughDate}`);
  url.searchParams.set('locked_at', 'not.is.null');
  url.searchParams.set('order', 'snapshot_date.asc');
  return fetchPaged(`${url.pathname}${url.search}`);
}

async function fetchRankingRecoveryAudits(table, userId, throughDate) {
  const url = new URL(`/rest/v1/${table}`, 'https://placeholder.local');
  url.searchParams.set('select', [
    'old_eligible_after_snapshot_date',
    'old_ranking_start_snapshot_date',
    'old_ranking_baseline_return_pct',
    'created_at',
  ].join(','));
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('old_ranking_start_snapshot_date', 'not.is.null');
  if (throughDate) url.searchParams.set('old_ranking_start_snapshot_date', `lte.${throughDate}`);
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '100');
  const rows = await adminFetch(`${url.pathname}${url.search}`);
  return Array.isArray(rows) ? rows : [];
}

function findApplicableRankingRecoveryAudit(rows, {
  expectedEligibilityDate,
  throughDate,
  recoverySource,
} = {}) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, recoverySource }))
    .find((row) => {
      const eligibleDate = normalizeDate(row.old_eligible_after_snapshot_date);
      const startDate = normalizeDate(row.old_ranking_start_snapshot_date);
      const baseline = Number(row.old_ranking_baseline_return_pct);
      return eligibleDate
        && startDate
        && Number.isFinite(baseline)
        && eligibleDate < startDate
        && eligibleDate <= expectedEligibilityDate
        && startDate <= throughDate;
    }) || null;
}

async function fetchRankingRecoveryAudit(userId, throughDate, expectedEligibilityDate) {
  // Epoch resets are the newest generation of the old forward-rebaseline
  // mechanism. Prefer their original range, then fall back to the older audit.
  const epochResets = await fetchRankingRecoveryAudits(
    'community_competition_epoch_resets',
    userId,
    throughDate,
  );
  const epochReset = findApplicableRankingRecoveryAudit(epochResets, {
    expectedEligibilityDate,
    throughDate,
    recoverySource: 'epoch_reset',
  });
  if (epochReset) return epochReset;
  const rebaselines = await fetchRankingRecoveryAudits(
    'community_competition_rebaseline_audit',
    userId,
    throughDate,
  );
  return findApplicableRankingRecoveryAudit(rebaselines, {
    expectedEligibilityDate,
    throughDate,
    recoverySource: 'rebaseline_audit',
  });
}

function publicationFields(publication) {
  return {
    snapshotDate: publication?.snapshotDate || null,
    version: publication?.version || null,
    completedAt: publication?.completedAt || null,
  };
}

function normalizeRpcOutcome(body) {
  if (typeof body === 'string') return { outcome: body };
  if (Array.isArray(body)) return normalizeRpcOutcome(body[0] || null);
  if (!body || typeof body !== 'object') return { outcome: 'invalid_response' };
  return {
    ...body,
    outcome: String(body.outcome || body.result || 'invalid_response'),
  };
}

async function replaceSnapshotsAtomic({
  userId,
  member,
  dirtyFromDate,
  ledgerRevision,
  marker,
  newMarkerVersion,
  newEligibleAfterSnapshotDate,
  newEligibleLedgerHash,
  newRankingStartSnapshotDate,
  newRankingBaselineReturnPct,
  snapshots,
}) {
  const operationKey = [
    'competition-ledger-rebuild',
    userId,
    ledgerRevision,
    marker?.snapshotDate || member.eligible_after_snapshot_date,
  ].join(':');
  const body = await adminFetch(
    '/rest/v1/rpc/replace_community_competition_member_snapshots',
    {
      method: 'POST',
      body: JSON.stringify({
        p_user_id: userId,
        p_operation_key: operationKey,
        p_expected_ledger_revision: ledgerRevision,
        p_expected_dirty_from_date: dirtyFromDate,
        p_expected_eligible_after_snapshot_date: member.eligible_after_snapshot_date,
        p_expected_eligible_ledger_hash: member.eligible_ledger_hash || null,
        p_expected_eligible_ledger_revision: member.eligible_ledger_revision,
        p_expected_ranking_start_snapshot_date:
          member.ranking_start_snapshot_date || null,
        p_expected_ranking_baseline_return_pct:
          member.ranking_baseline_return_pct == null
            ? null
            : Number(member.ranking_baseline_return_pct),
        p_expected_marker_snapshot_date: marker?.snapshotDate || null,
        p_expected_marker_version: marker?.version || null,
        p_new_marker_version: newMarkerVersion || null,
        p_new_eligible_after_snapshot_date: newEligibleAfterSnapshotDate,
        p_new_eligible_ledger_hash: newEligibleLedgerHash,
        p_new_ranking_start_snapshot_date: newRankingStartSnapshotDate,
        p_new_ranking_baseline_return_pct: newRankingBaselineReturnPct,
        p_snapshots: snapshots,
      }),
    }
  );
  return normalizeRpcOutcome(body);
}

function mapSnapshotRows(series, { ledgerRevision, lockedAt }) {
  return series.map((snapshot) => ({
    snapshot_date: snapshot.snapshotDate,
    daily_return_pct: snapshot.dailyReturnPct,
    cumulative_return_pct: snapshot.cumulativeReturnPct,
    locked_at: lockedAt,
    ledger_hash: snapshot.ledgerHash,
    ledger_revision: ledgerRevision,
    source_version: SOURCE_VERSION,
  }));
}

function configuredRankingState(member) {
  const configuredStart = normalizeDate(member?.ranking_start_snapshot_date);
  const configuredBaseline = member?.ranking_baseline_return_pct == null
    ? null
    : Number(member.ranking_baseline_return_pct);
  if (configuredStart && configuredBaseline != null && Number.isFinite(configuredBaseline)) {
    return {
      eligibleAfterSnapshotDate: normalizeDate(member?.eligible_after_snapshot_date),
      startDate: configuredStart,
      baselineReturnPct: configuredBaseline,
      recoverySource: 'member',
    };
  }
  return null;
}

function auditedRankingState(audit) {
  const eligibleAfterSnapshotDate = normalizeDate(audit?.old_eligible_after_snapshot_date);
  const startDate = normalizeDate(audit?.old_ranking_start_snapshot_date);
  const baselineReturnPct = Number(audit?.old_ranking_baseline_return_pct);
  if (!eligibleAfterSnapshotDate || !startDate || !Number.isFinite(baselineReturnPct)) return null;
  return {
    eligibleAfterSnapshotDate,
    startDate,
    baselineReturnPct,
    recoverySource: audit.recoverySource,
  };
}

function earliestSnapshotDate(snapshots) {
  const earliest = (Array.isArray(snapshots) ? snapshots : [])
    .map((row) => normalizeDate(row?.snapshot_date))
    .filter(Boolean)
    .sort()
    .at(0) || null;
  return earliest;
}

function nullPublicationResult(state) {
  return {
    success: true,
    state,
    snapshotDate: null,
    version: null,
    completedAt: null,
  };
}

async function recalculateAttempt({ userId, now }) {
  const [member, dirtyState, marker] = await Promise.all([
    fetchMember(userId),
    fetchDirtyState(userId),
    getLatestCommunityCompetitionSnapshotMarker({ now }),
  ]);
  if (!member || member.status !== 'active') {
    return nullPublicationResult('not_joined');
  }

  const asOfDate = normalizeDate(marker?.snapshotDate);
  if (!dirtyState?.dirty_from_date) {
    if (!member.ranking_start_snapshot_date || !asOfDate || !marker?.version || !marker?.completedAt) {
      return nullPublicationResult('waiting_snapshot');
    }
    return {
      success: true,
      state: 'already_current',
      ...publicationFields(marker),
    };
  }

  if (!asOfDate || !marker?.version || !marker?.completedAt) {
    return nullPublicationResult('waiting_snapshot');
  }

  const expectedEligibilityDate = normalizeDate(member.eligible_after_snapshot_date);
  if (!expectedEligibilityDate) {
    const error = new Error('收益比赛加入基准日不合法');
    error.status = 500;
    error.retryable = false;
    throw error;
  }

  const configuredRanking = configuredRankingState(member);
  const snapshots = await fetchSnapshots(userId, asOfDate);
  let ranking = configuredRanking;
  if (!ranking) {
    const audit = await fetchRankingRecoveryAudit(
      userId,
      asOfDate,
      expectedEligibilityDate,
    );
    ranking = auditedRankingState(audit);
  }

  const fallbackStartDate = !ranking ? earliestSnapshotDate(snapshots) : null;
  const rankingStartDate = ranking?.startDate || fallbackStartDate;
  const ledgerState = await fetchLedgerState(userId);
  if (!ledgerState) {
    const error = new Error('收益比赛账本 revision 暂不可用');
    error.status = 503;
    error.retryable = true;
    throw error;
  }
  const trades = await fetchTrades(userId, asOfDate);

  if (!rankingStartDate) {
    const waitingCommitted = await replaceSnapshotsAtomic({
      userId,
      member,
      dirtyFromDate: normalizeDate(dirtyState?.dirty_from_date),
      ledgerRevision: ledgerState.revision,
      marker,
      newMarkerVersion: null,
      newEligibleAfterSnapshotDate: expectedEligibilityDate,
      newEligibleLedgerHash: computeCompetitionLedgerHash(trades, expectedEligibilityDate),
      newRankingStartSnapshotDate: null,
      newRankingBaselineReturnPct: null,
      snapshots: [],
    });
    if (CAS_RETRY_OUTCOMES.has(waitingCommitted.outcome)) {
      const error = new Error(waitingCommitted.outcome);
      error.code = waitingCommitted.outcome;
      error.status = 409;
      error.retryable = true;
      throw error;
    }
    if (waitingCommitted.outcome === 'not_joined') {
      return nullPublicationResult('not_joined');
    }
    if (!['waiting_snapshot', 'already_current'].includes(waitingCommitted.outcome)) {
      const error = new Error(`收益比赛等待态账本提交失败: ${waitingCommitted.outcome}`);
      error.code = waitingCommitted.outcome;
      error.status = 503;
      error.retryable = true;
      throw error;
    }
    return nullPublicationResult('waiting_snapshot');
  }
  if (rankingStartDate > asOfDate) return nullPublicationResult('waiting_snapshot');

  const fromDate = [
    shiftDate(rankingStartDate, -14),
    ranking?.eligibleAfterSnapshotDate,
  ].filter(Boolean).sort()[0];
  const spyRows = await fetchCommunityCompetitionEodhdHistory({
    symbol: 'SPY',
    fromDate,
    throughDate: asOfDate,
  });
  const allSpyTradingDates = [...new Set(spyRows
    .map((row) => normalizeDate(row.date))
    .filter(Boolean))]
    .sort();
  if (!ranking) {
    const previousSpyDate = allSpyTradingDates.filter((date) => date < fallbackStartDate).at(-1);
    if (!previousSpyDate) {
      const error = new CompetitionSnapshotValidationError(
        'missing_close',
        '缺少最早比赛快照之前的 SPY 已完成收盘',
      );
      error.retryable = true;
      throw error;
    }
    ranking = {
      eligibleAfterSnapshotDate: previousSpyDate,
      startDate: fallbackStartDate,
      baselineReturnPct: 0,
      recoverySource: 'existing_snapshot',
    };
  }

  const newEligibleLedgerHash = computeCompetitionLedgerHash(
    trades,
    ranking.eligibleAfterSnapshotDate,
  );
  const tradingDates = allSpyTradingDates
    .filter((date) => date >= ranking.startDate && date <= asOfDate);
  const symbols = deriveCompetitionLedgerSymbols(
    trades,
    asOfDate,
    ranking.eligibleAfterSnapshotDate,
  );
  const nonSpySymbols = symbols.filter((symbol) => symbol !== 'SPY');
  const requiredThroughDates = deriveCompetitionRequiredCloseDates({
    stockTrades: trades,
    eligibilityDate: ranking.eligibleAfterSnapshotDate,
    throughDate: asOfDate,
    tradingDates,
  });
  const closesBySymbol = nonSpySymbols.length > 0
    ? await fetchCommunityCompetitionEodhdHistories({
        symbols: nonSpySymbols,
        fromDate,
        throughDate: asOfDate,
        requiredThroughDates,
      })
    : {};
  if (symbols.includes('SPY')) closesBySymbol.SPY = spyRows;
  const series = buildCompetitionRecalculatedSnapshotSeries({
    stockTrades: trades,
    historicalClosesBySymbol: closesBySymbol,
    tradingDates,
    initialPriorSnapshotDate: ranking.eligibleAfterSnapshotDate,
    rankingStartSnapshotDate: ranking.startDate,
    rankingBaselineReturnPct: ranking.baselineReturnPct,
  });
  const replacementRows = mapSnapshotRows(series, {
    ledgerRevision: ledgerState.revision,
    lockedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
  });

  const newMarkerVersion = randomUUID().replace(/-/g, '');
  const committed = await replaceSnapshotsAtomic({
    userId,
    member,
    dirtyFromDate: normalizeDate(dirtyState?.dirty_from_date),
    ledgerRevision: ledgerState.revision,
    marker,
    newMarkerVersion,
    newEligibleAfterSnapshotDate: ranking.eligibleAfterSnapshotDate,
    newEligibleLedgerHash,
    newRankingStartSnapshotDate: ranking?.startDate || null,
    newRankingBaselineReturnPct: ranking?.baselineReturnPct ?? null,
    snapshots: replacementRows,
  });
  if (CAS_RETRY_OUTCOMES.has(committed.outcome)) {
    const error = new Error(committed.outcome);
    error.code = committed.outcome;
    error.status = 409;
    error.retryable = true;
    throw error;
  }
  if (!['recalculated', 'already_current', 'not_joined', 'waiting_snapshot'].includes(committed.outcome)) {
    const error = new Error(`收益比赛重算提交失败: ${committed.outcome}`);
    error.code = committed.outcome;
    error.status = 503;
    error.retryable = true;
    throw error;
  }

  if (committed.outcome === 'not_joined') {
    return nullPublicationResult('not_joined');
  }
  if (committed.outcome === 'waiting_snapshot' || !replacementRows.length) {
    return nullPublicationResult('waiting_snapshot');
  }
  return {
    success: true,
    state: committed.outcome,
    snapshotDate: committed.snapshotDate || marker?.snapshotDate || null,
    version: committed.version || (
      committed.outcome === 'already_current' ? marker?.version : newMarkerVersion
    ),
    completedAt: committed.completedAt || (
      committed.outcome === 'already_current'
        ? marker?.completedAt
        : (now instanceof Date ? now : new Date(now)).toISOString()
    ),
  };
}

export async function recalculateCommunityCompetitionMember({
  userId,
  now = new Date(),
} = {}) {
  if (!userId) {
    const error = new Error('缺少收益比赛用户');
    error.status = 400;
    error.retryable = false;
    throw error;
  }
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt += 1) {
    try {
      return await recalculateAttempt({ userId: String(userId), now });
    } catch (error) {
      lastError = error;
      if (!CAS_RETRY_OUTCOMES.has(String(error?.code || '')) || attempt === MAX_CAS_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
}

export async function recalculateDirtyCommunityCompetitionMembers({
  now = new Date(),
  limit = REBUILD_BATCH_LIMIT,
} = {}) {
  const userIds = await fetchDirtyUserIds(limit);
  const summary = {
    attempted: userIds.length,
    recalculated: 0,
    alreadyCurrent: 0,
    waiting: 0,
    failed: 0,
  };
  for (const userId of userIds) {
    try {
      const result = await recalculateCommunityCompetitionMember({ userId, now });
      if (result.state === 'recalculated') summary.recalculated += 1;
      else if (result.state === 'already_current') summary.alreadyCurrent += 1;
      else summary.waiting += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

export function isCompetitionRecalculationRetryable(error) {
  if (typeof error?.retryable === 'boolean') return error.retryable;
  if (error instanceof CompetitionSnapshotValidationError) return false;
  const status = Number(error?.status) || 0;
  return status === 0 || status === 408 || status === 409 || status === 429 || status >= 500;
}
