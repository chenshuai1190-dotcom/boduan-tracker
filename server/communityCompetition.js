import { latestCompletedUsTradingDate } from '../src/lib/pnlReportSnapshots.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';
import {
  CompetitionSnapshotValidationError,
  computeCompetitionLedgerHash,
  deriveVerifiedCompetitionHoldingSymbols,
} from './communityCompetitionSnapshotModel.js';
import {
  buildCompetitionLeaderboard,
  competitionPeriodStartDate,
  normalizeCompetitionPeriod,
} from './communityCompetitionModel.js';
import {
  COMPETITION_SNAPSHOT_CHANNEL,
  getLatestCommunityCompetitionSnapshotMarker,
} from './snapshotPublicationMarker.js';

const PAGE_SIZE = 1000;
const BENCHMARK_LOOKBACK_DAYS = 14;
const JOIN_LEDGER_CAS_ATTEMPTS = 2;

function normalizeLedgerRevision(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getSupabaseAdminConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('收益比赛服务未配置: 缺少 Supabase URL 或 service role key');
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
  const response = await fetchWithTimeout(new URL(path, `${supabaseUrl}/`), {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }, {
    provider: 'supabase-community-competition',
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

async function fetchPaged(path) {
  const rows = [];
  let offset = 0;
  while (true) {
    const page = await supabaseAdminFetch(path, {
      headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    const pageRows = Array.isArray(page) ? page : [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function fetchCommunityProfile(userId) {
  const url = new URL('/rest/v1/community_profiles', 'https://placeholder.local');
  url.searchParams.set('select', 'user_id,nickname,avatar_key,profile_completed_at');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function isCompletedProfile(profile) {
  return Boolean(
    profile?.profile_completed_at
    && String(profile?.nickname || '').trim()
    && String(profile?.avatar_key || '').trim()
  );
}

async function fetchMembership(userId) {
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
  const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchLedgerState(userId) {
  const url = new URL('/rest/v1/stock_trade_ledger_revisions', 'https://placeholder.local');
  url.searchParams.set('select', 'user_id,revision,last_mutated_at');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  const revision = normalizeLedgerRevision(row?.revision);
  const lastMutatedAt = row?.last_mutated_at == null ? null : String(row.last_mutated_at);
  if (
    !row
    || String(row.user_id || '') !== String(userId)
    || revision == null
    || (revision > 0 && (!lastMutatedAt || !Number.isFinite(Date.parse(lastMutatedAt))))
  ) {
    return null;
  }
  return { revision, lastMutatedAt };
}

async function joinMembershipAtomic({
  userId,
  expectedLedgerRevision,
  eligibleAfterSnapshotDate,
  eligibleLedgerHash,
}) {
  const body = await supabaseAdminFetch('/rest/v1/rpc/join_community_competition_member', {
    method: 'POST',
    body: JSON.stringify({
      p_user_id: userId,
      p_expected_ledger_revision: expectedLedgerRevision,
      p_eligible_after_snapshot_date: eligibleAfterSnapshotDate,
      p_eligible_ledger_hash: eligibleLedgerHash,
    }),
  });
  if (typeof body === 'string') return body;
  return String(body?.outcome || body?.result || 'invalid_response');
}

async function fetchEligibleLedgerTrades(userId, throughDate) {
  const url = new URL('/rest/v1/stock_trades', 'https://placeholder.local');
  url.searchParams.set('select', [
    'id',
    'symbol',
    'side',
    'trade_date',
    'price',
    'shares',
    'fee',
    'currency',
    'created_at',
  ].join(','));
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('trade_date', `lte.${throughDate}`);
  url.searchParams.set('order', 'trade_date.asc,created_at.asc,id.asc');
  return fetchPaged(`${url.pathname}${url.search}`);
}

async function fetchLeaderboardData({ fromDate, asOfDate }) {
  const memberUrl = new URL('/rest/v1/community_competition_members', 'https://placeholder.local');
  memberUrl.searchParams.set('select', [
    'user_id',
    'status',
    'ranking_start_snapshot_date',
    'ranking_baseline_return_pct',
  ].join(','));
  memberUrl.searchParams.set('status', 'eq.active');

  const profileUrl = new URL('/rest/v1/community_profiles', 'https://placeholder.local');
  profileUrl.searchParams.set('select', 'user_id,nickname,avatar_key,profile_completed_at');
  profileUrl.searchParams.set('profile_completed_at', 'not.is.null');

  const snapshotUrl = new URL('/rest/v1/community_competition_snapshots', 'https://placeholder.local');
  snapshotUrl.searchParams.set('select', [
    'user_id',
    'snapshot_date',
    'daily_return_pct',
    'cumulative_return_pct',
    'locked_at',
    'ledger_hash',
  ].join(','));
  snapshotUrl.searchParams.set('snapshot_date', `gte.${fromDate}`);
  snapshotUrl.searchParams.append('snapshot_date', `lte.${asOfDate}`);
  snapshotUrl.searchParams.set('locked_at', 'not.is.null');
  snapshotUrl.searchParams.set('order', 'snapshot_date.asc');

  const [members, profiles, snapshots] = await Promise.all([
    fetchPaged(`${memberUrl.pathname}${memberUrl.search}`),
    fetchPaged(`${profileUrl.pathname}${profileUrl.search}`),
    fetchPaged(`${snapshotUrl.pathname}${snapshotUrl.search}`),
  ]);
  return { members, profiles, snapshots };
}

async function fetchVerifiedHoldingSymbols({ members = [], profiles = [], snapshots = [], asOfDate }) {
  const completedProfileIds = new Set(
    profiles
      .filter((profile) => isCompletedProfile(profile))
      .map((profile) => String(profile.user_id || ''))
      .filter(Boolean),
  );
  const snapshotByUser = new Map();
  snapshots.forEach((snapshot) => {
    if (
      String(snapshot?.snapshot_date || '').slice(0, 10) === asOfDate
      && snapshot?.locked_at
      && /^[a-f0-9]{64}$/i.test(String(snapshot?.ledger_hash || ''))
    ) {
      snapshotByUser.set(String(snapshot.user_id || ''), snapshot);
    }
  });
  const userIds = members
    .filter((member) => member?.status === 'active')
    .map((member) => String(member.user_id || ''))
    .filter((userId) => userId && completedProfileIds.has(userId) && snapshotByUser.has(userId));

  const entries = await Promise.all(userIds.map(async (userId) => {
    try {
      const trades = await fetchEligibleLedgerTrades(userId, asOfDate);
      const snapshot = snapshotByUser.get(userId);
      return [userId, deriveVerifiedCompetitionHoldingSymbols({
        stockTrades: trades,
        throughDate: asOfDate,
        expectedLedgerHash: snapshot.ledger_hash,
      })];
    } catch {
      return [userId, null];
    }
  }));
  return new Map(entries);
}

async function fetchBenchmarkRows({ from, to }) {
  const key = String(process.env.EODHD_API_KEY || '')
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!key) {
    const error = new Error('收益比赛基准行情未配置');
    error.status = 500;
    error.retryable = false;
    throw error;
  }
  const url = `https://eodhd.com/api/eod/QQQ.US?api_token=${encodeURIComponent(key)}&from=${from}&to=${to}&period=d&fmt=json`;
  try {
    const response = await fetchWithTimeout(url, {}, {
      provider: 'eodhd-community-competition-benchmark',
      timeoutMs: QUOTE_TIMEOUTS.eodhd,
    });
    if (!response.ok) {
      const error = new Error('收益比赛基准行情暂不可用');
      error.status = response.status;
      error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw error;
    }
    const body = await response.json().catch(() => null);
    if (!Array.isArray(body)) {
      const error = new Error('收益比赛基准行情回包不完整');
      error.status = 503;
      error.retryable = true;
      throw error;
    }
    return body;
  } catch (error) {
    if (typeof error?.retryable !== 'boolean') error.retryable = true;
    throw error;
  }
}

export async function getCommunityCompetitionState({ userId, period = 'day', now = new Date() } = {}) {
  const normalizedPeriod = normalizeCompetitionPeriod(period);
  if (!normalizedPeriod) {
    const error = new Error('榜单周期不合法');
    error.status = 400;
    throw error;
  }
  const profile = await fetchCommunityProfile(userId);
  if (!isCompletedProfile(profile)) {
    return { success: true, state: 'profile_required', period: normalizedPeriod };
  }

  const membership = await fetchMembership(userId);
  if (!membership || membership.status !== 'active') {
    return { success: true, state: 'join_required', period: normalizedPeriod };
  }

  const publication = await getLatestCommunityCompetitionSnapshotMarker({ now });
  const waiting = {
    success: true,
    state: 'waiting_snapshot',
    period: normalizedPeriod,
    joinedAt: membership.joined_at || null,
    eligibleAfterSnapshotDate: membership.eligible_after_snapshot_date || null,
    rankingStartSnapshotDate: membership.ranking_start_snapshot_date || null,
    publishedSnapshotDate: publication?.snapshotDate || null,
    snapshotVersion: publication?.version || null,
    publicationCompletedAt: publication?.completedAt || null,
    // Backward-compatible cache field. This is the publication marker time,
    // not the trading date represented by the leaderboard.
    snapshotUpdatedAt: publication?.completedAt || null,
  };
  if (!membership.ranking_start_snapshot_date) return waiting;

  // A member row is not a publication signal: the batch may still be writing
  // other users. Only the durable server completion marker can expose a date.
  const asOfDate = publication?.snapshotDate || null;
  if (!asOfDate || String(membership.ranking_start_snapshot_date) > asOfDate) return waiting;
  const periodStartDate = competitionPeriodStartDate(normalizedPeriod, asOfDate);
  const fetchFromDate = shiftDate(periodStartDate, -BENCHMARK_LOOKBACK_DAYS);
  const data = await fetchLeaderboardData({ fromDate: fetchFromDate, asOfDate });
  const hasCurrentSelfSnapshot = data.snapshots.some((snapshot) => (
    String(snapshot?.user_id || '') === String(userId)
    && String(snapshot?.snapshot_date || '').slice(0, 10) === asOfDate
    && snapshot?.locked_at
  ));
  if (!hasCurrentSelfSnapshot) return waiting;

  const [benchmarkRows, holdingSymbolsByUser] = await Promise.all([
    fetchBenchmarkRows({ from: fetchFromDate, to: asOfDate }),
    fetchVerifiedHoldingSymbols({ ...data, asOfDate }),
  ]);
  const leaderboard = buildCompetitionLeaderboard({
    ...data,
    period: normalizedPeriod,
    asOfDate,
    benchmarkRows,
    holdingSymbolsByUser,
    selfUserId: userId,
  });
  if (!leaderboard.selfCalculationAvailable) return waiting;
  if (!leaderboard.benchmarkComplete || !leaderboard.self) {
    const error = new Error('收益比赛基准收盘数据尚未完整');
    error.status = 503;
    error.retryable = true;
    throw error;
  }

  return {
    success: true,
    state: 'ready',
    period: normalizedPeriod,
    asOfDate,
    snapshotVersion: publication.version,
    publicationCompletedAt: publication.completedAt,
    // Backward-compatible cache field. Consumers must use asOfDate when
    // describing the leaderboard's market-data date.
    snapshotUpdatedAt: publication.completedAt,
    calculationStartDate: leaderboard.selfCalculationStartDate,
    benchmarkReturnPct: leaderboard.selfBenchmarkReturnPct,
    stats: leaderboard.stats,
    leaders: leaderboard.leaders,
    self: leaderboard.self,
    trend: {
      self: leaderboard.selfTrend,
      benchmark: leaderboard.selfBenchmarkTrend,
    },
  };
}

export async function getCommunityCompetitionSnapshotStatus({ now = new Date() } = {}) {
  const publication = await getLatestCommunityCompetitionSnapshotMarker({ now });
  return {
    success: true,
    state: 'snapshot_status',
    channel: COMPETITION_SNAPSHOT_CHANNEL,
    snapshotDate: publication?.snapshotDate || null,
    version: publication?.version || null,
    completedAt: publication?.completedAt || null,
  };
}

export async function joinCommunityCompetition({ userId, now = new Date() } = {}) {
  const profile = await fetchCommunityProfile(userId);
  if (!isCompletedProfile(profile)) {
    const error = new Error('请先完成社区昵称和头像设置');
    error.status = 409;
    error.state = 'profile_required';
    throw error;
  }

  const current = await fetchMembership(userId);
  if (current?.status === 'active') {
    const eligibleLedgerRevision = normalizeLedgerRevision(current.eligible_ledger_revision);
    const ledgerState = await fetchLedgerState(userId);
    if (
      eligibleLedgerRevision == null
      || !ledgerState
      || ledgerState.revision < eligibleLedgerRevision
    ) {
      const error = new Error('收益比赛账本状态暂不可用，请稍后重试');
      error.status = 503;
      error.state = 'ledger_state_unavailable';
      throw error;
    }
    return {
      success: true,
      state: 'waiting_snapshot',
      joinedAt: current.joined_at || null,
      eligibleAfterSnapshotDate: current.eligible_after_snapshot_date || null,
    };
  }

  const eligibleAfterSnapshotDate = latestCompletedUsTradingDate(now);
  for (let attempt = 1; attempt <= JOIN_LEDGER_CAS_ATTEMPTS; attempt += 1) {
    // Read the authoritative revision first, then the formal ledger. The RPC
    // locks the same revision row and rejects any mutation that occurred between
    // these reads and the member upsert.
    const ledgerState = await fetchLedgerState(userId);
    const eligibleLedger = await fetchEligibleLedgerTrades(userId, eligibleAfterSnapshotDate);
    // A brand-new no-trade user legitimately has no revision row yet. The join
    // RPC creates revision 0 under lock. Any concurrent INSERT creates/increments
    // the row first and makes the expected-zero CAS return stale_ledger.
    if (!ledgerState && eligibleLedger.length > 0) {
      const error = new Error('收益比赛账本状态暂不可用，请稍后重试');
      error.status = 503;
      error.state = 'ledger_state_unavailable';
      throw error;
    }
    const expectedLedgerRevision = ledgerState?.revision ?? 0;
    let eligibleLedgerHash;
    try {
      eligibleLedgerHash = computeCompetitionLedgerHash(
        eligibleLedger,
        eligibleAfterSnapshotDate
      );
    } catch (error) {
      if (error instanceof CompetitionSnapshotValidationError) {
        error.status = 409;
        error.state = 'ledger_invalid';
      }
      throw error;
    }
    const outcome = await joinMembershipAtomic({
      userId,
      expectedLedgerRevision,
      eligibleAfterSnapshotDate,
      eligibleLedgerHash,
    });
    if (outcome === 'stale_ledger' && attempt < JOIN_LEDGER_CAS_ATTEMPTS) continue;
    if (outcome === 'joined' || outcome === 'already_active') {
      const joined = await fetchMembership(userId);
      if (!joined || joined.status !== 'active') {
        const error = new Error('收益比赛加入状态确认失败，请稍后重试');
        error.status = 503;
        error.state = 'join_state_unavailable';
        throw error;
      }
      return {
        success: true,
        state: 'waiting_snapshot',
        joinedAt: joined.joined_at || null,
        eligibleAfterSnapshotDate: joined.eligible_after_snapshot_date
          || eligibleAfterSnapshotDate,
      };
    }
    if (outcome === 'stale_ledger') {
      const error = new Error('交易记录刚刚发生变化，请重试加入收益比赛');
      error.status = 409;
      error.state = 'ledger_changed';
      throw error;
    }
    const error = new Error('收益比赛账本状态无效，暂时无法加入');
    error.status = outcome === 'invalid_ledger_state' ? 409 : 503;
    error.state = outcome === 'invalid_ledger_state'
      ? 'ledger_invalid'
      : 'join_state_unavailable';
    throw error;
  }

  const error = new Error('交易记录刚刚发生变化，请重试加入收益比赛');
  error.status = 409;
  error.state = 'ledger_changed';
  throw error;
}
