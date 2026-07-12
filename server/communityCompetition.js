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

const PAGE_SIZE = 1000;
const BENCHMARK_LOOKBACK_DAYS = 14;

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
    'ranking_start_snapshot_date',
    'ranking_baseline_return_pct',
  ].join(','));
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`);
  return Array.isArray(rows) ? rows[0] || null : null;
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

async function fetchLatestSnapshotDate(now = new Date()) {
  const url = new URL('/rest/v1/community_competition_snapshots', 'https://placeholder.local');
  url.searchParams.set('select', 'snapshot_date');
  url.searchParams.set('snapshot_date', `lte.${latestCompletedUsTradingDate(now)}`);
  url.searchParams.set('locked_at', 'not.is.null');
  url.searchParams.set('order', 'snapshot_date.desc');
  url.searchParams.set('limit', '1');
  const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`);
  return String(Array.isArray(rows) ? rows[0]?.snapshot_date || '' : '').slice(0, 10) || null;
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
  if (!key) return [];
  const url = `https://eodhd.com/api/eod/QQQ.US?api_token=${encodeURIComponent(key)}&from=${from}&to=${to}&period=d&fmt=json`;
  try {
    const response = await fetchWithTimeout(url, {}, {
      provider: 'eodhd-community-competition-benchmark',
      timeoutMs: QUOTE_TIMEOUTS.eodhd,
    });
    if (!response.ok) return [];
    const body = await response.json().catch(() => null);
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
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

  const waiting = {
    success: true,
    state: 'waiting_snapshot',
    period: normalizedPeriod,
    joinedAt: membership.joined_at || null,
    rankingStartSnapshotDate: membership.ranking_start_snapshot_date || null,
  };
  if (!membership.ranking_start_snapshot_date) return waiting;

  const asOfDate = await fetchLatestSnapshotDate(now);
  if (!asOfDate || String(membership.ranking_start_snapshot_date) > asOfDate) return waiting;
  const periodStartDate = competitionPeriodStartDate(normalizedPeriod, asOfDate);
  const fetchFromDate = shiftDate(periodStartDate, -BENCHMARK_LOOKBACK_DAYS);
  const data = await fetchLeaderboardData({ fromDate: fetchFromDate, asOfDate });
  const preliminary = buildCompetitionLeaderboard({
    ...data,
    period: normalizedPeriod,
    asOfDate,
    benchmarkRows: [],
    selfUserId: userId,
  });
  if (!preliminary.self) return waiting;

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

  return {
    success: true,
    state: 'ready',
    period: normalizedPeriod,
    asOfDate,
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
    return {
      success: true,
      state: 'waiting_snapshot',
      joinedAt: current.joined_at || null,
      eligibleAfterSnapshotDate: current.eligible_after_snapshot_date || null,
    };
  }

  const joinedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const eligibleAfterSnapshotDate = latestCompletedUsTradingDate(now);
  const eligibleLedger = await fetchEligibleLedgerTrades(userId, eligibleAfterSnapshotDate);
  let eligibleLedgerHash;
  try {
    eligibleLedgerHash = computeCompetitionLedgerHash(eligibleLedger, eligibleAfterSnapshotDate);
  } catch (error) {
    if (error instanceof CompetitionSnapshotValidationError) {
      error.status = 409;
      error.state = 'ledger_invalid';
    }
    throw error;
  }
  const url = new URL('/rest/v1/community_competition_members', 'https://placeholder.local');
  url.searchParams.set('on_conflict', 'user_id');
  const rows = await supabaseAdminFetch(`${url.pathname}${url.search}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: userId,
      status: 'active',
      joined_at: joinedAt,
      eligible_after_snapshot_date: eligibleAfterSnapshotDate,
      eligible_ledger_hash: eligibleLedgerHash,
      ranking_start_snapshot_date: null,
      ranking_baseline_return_pct: null,
      updated_at: joinedAt,
    }),
  });
  const joined = Array.isArray(rows) ? rows[0] || null : rows;
  return {
    success: true,
    state: 'waiting_snapshot',
    joinedAt: joined?.joined_at || joinedAt,
    eligibleAfterSnapshotDate: joined?.eligible_after_snapshot_date || eligibleAfterSnapshotDate,
  };
}
