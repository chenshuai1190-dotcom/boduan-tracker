import { randomUUID } from 'node:crypto';

import { latestCompletedUsTradingDate } from '../src/lib/pnlReportSnapshots.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';

export const COMPETITION_SNAPSHOT_CHANNEL = 'competition';
const SNAPSHOT_SOURCE_VERSION = 'community_competition_snapshot_v1';
const REST_PAGE_SIZE = 1000;

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeTimestamp(value) {
  const raw = String(value || '').trim();
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return null;
  const utc = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:Z|[+-]00:00)$/i);
  if (utc) return `${utc[1]}.${utc[2] || '000'}Z`;
  return new Date(time).toISOString();
}

function normalizeVersion(value) {
  const version = String(value || '').trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(version) ? version : null;
}

function getSupabaseAdminConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('快照发布标记未配置: 缺少 Supabase URL 或 service role key');
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

async function markerAdminFetch(path, options = {}) {
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
      provider: 'supabase-snapshot-publication-marker',
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
    error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw error;
  }
  return body;
}

async function fetchAllRows(path) {
  const rows = [];
  for (let offset = 0; ; offset += REST_PAGE_SIZE) {
    const body = await markerAdminFetch(path, {
      headers: { Range: `${offset}-${offset + REST_PAGE_SIZE - 1}` },
    });
    const page = Array.isArray(body) ? body : [];
    rows.push(...page);
    if (page.length < REST_PAGE_SIZE) return rows;
  }
}

function finiteReturn(value) {
  if (value == null || String(value).trim() === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= -1;
}

function completeProfile(row) {
  return Boolean(
    row?.user_id
    && Number.isFinite(Date.parse(String(row?.profile_completed_at || '')))
    && String(row?.nickname || '').trim()
    && String(row?.avatar_key || '').trim()
  );
}

function expectedMember(row, completedProfileIds, snapshotDate) {
  const userId = String(row?.user_id || '');
  const eligibleAfter = normalizeDate(row?.eligible_after_snapshot_date);
  const rankingStart = normalizeDate(row?.ranking_start_snapshot_date);
  return Boolean(
    userId
    && completedProfileIds.has(userId)
    && eligibleAfter
    && eligibleAfter < snapshotDate
    && rankingStart
    && rankingStart <= snapshotDate
    && finiteReturn(row?.ranking_baseline_return_pct)
  );
}

function rankedBySnapshotDate(row, snapshotDate) {
  const eligibleAfter = normalizeDate(row?.eligible_after_snapshot_date);
  const rankingStart = normalizeDate(row?.ranking_start_snapshot_date);
  return Boolean(
    row?.user_id
    && eligibleAfter
    && eligibleAfter < snapshotDate
    && rankingStart
    && rankingStart <= snapshotDate
    && finiteReturn(row?.ranking_baseline_return_pct)
  );
}

function completeSnapshot(row, snapshotDate, checkedAtTime) {
  const lockedAtTime = Date.parse(String(row?.locked_at || ''));
  return Boolean(
    row?.user_id
    && normalizeDate(row?.snapshot_date) === snapshotDate
    && finiteReturn(row?.daily_return_pct)
    && finiteReturn(row?.cumulative_return_pct)
    && Number.isFinite(lockedAtTime)
    && lockedAtTime <= checkedAtTime
    && String(row?.source_version || '') === SNAPSHOT_SOURCE_VERSION
    && /^[a-f0-9]{64}$/.test(String(row?.ledger_hash || ''))
    && /^\d+$/.test(String(row?.ledger_revision ?? ''))
  );
}

function incompleteBatchError({ expectedMembers, completeSnapshots }) {
  const error = new Error('收益比赛目标日快照批次不完整');
  error.status = 503;
  error.retryable = true;
  error.code = 'competition_snapshot_batch_incomplete';
  // Counts are operationally useful and contain no member identity or ledger data.
  error.expectedMembers = expectedMembers;
  error.completeSnapshots = completeSnapshots;
  return error;
}

export async function verifyCommunityCompetitionSnapshotBatch({
  snapshotDate,
  checkedAt = new Date(),
} = {}) {
  const safeSnapshotDate = normalizeDate(snapshotDate);
  const checkedAtTime = checkedAt instanceof Date
    ? checkedAt.getTime()
    : Date.parse(String(checkedAt || ''));
  if (!safeSnapshotDate || !Number.isFinite(checkedAtTime)) {
    const error = new Error('快照发布完整性核对参数不合法');
    error.status = 400;
    throw error;
  }

  const memberUrl = new URL('/rest/v1/community_competition_members', 'https://placeholder.local');
  memberUrl.searchParams.set('select', [
    'user_id',
    'eligible_after_snapshot_date',
    'ranking_start_snapshot_date',
    'ranking_baseline_return_pct',
  ].join(','));
  memberUrl.searchParams.set('status', 'eq.active');
  memberUrl.searchParams.set('ranking_start_snapshot_date', `lte.${safeSnapshotDate}`);
  memberUrl.searchParams.set('order', 'user_id.asc');

  const profileUrl = new URL('/rest/v1/community_profiles', 'https://placeholder.local');
  profileUrl.searchParams.set('select', 'user_id,profile_completed_at,nickname,avatar_key');
  profileUrl.searchParams.set('profile_completed_at', 'not.is.null');
  profileUrl.searchParams.set('order', 'user_id.asc');

  const snapshotUrl = new URL('/rest/v1/community_competition_snapshots', 'https://placeholder.local');
  snapshotUrl.searchParams.set('select', [
    'user_id',
    'snapshot_date',
    'daily_return_pct',
    'cumulative_return_pct',
    'locked_at',
    'source_version',
    'ledger_hash',
    'ledger_revision',
  ].join(','));
  snapshotUrl.searchParams.set('snapshot_date', `eq.${safeSnapshotDate}`);
  snapshotUrl.searchParams.set('order', 'user_id.asc');

  const members = await fetchAllRows(`${memberUrl.pathname}${memberUrl.search}`);
  const rankedMembers = members.filter((row) => rankedBySnapshotDate(row, safeSnapshotDate));
  if (rankedMembers.length === 0) {
    return {
      complete: true,
      snapshotDate: safeSnapshotDate,
      expectedMembers: 0,
      completeSnapshots: 0,
    };
  }
  const profiles = await fetchAllRows(`${profileUrl.pathname}${profileUrl.search}`);
  const completedProfileIds = new Set(
    profiles.filter(completeProfile).map((row) => String(row.user_id))
  );
  const expectedUserIds = new Set(rankedMembers.filter((row) => (
    expectedMember(row, completedProfileIds, safeSnapshotDate)
  )).map((row) => String(row.user_id)));
  if (expectedUserIds.size === 0) {
    return {
      complete: true,
      snapshotDate: safeSnapshotDate,
      expectedMembers: 0,
      completeSnapshots: 0,
    };
  }
  const snapshots = await fetchAllRows(`${snapshotUrl.pathname}${snapshotUrl.search}`);
  const completeUserIds = new Set(snapshots.filter((row) => (
    expectedUserIds.has(String(row?.user_id || ''))
    && completeSnapshot(row, safeSnapshotDate, checkedAtTime)
  )).map((row) => String(row.user_id)));

  if (completeUserIds.size !== expectedUserIds.size) {
    throw incompleteBatchError({
      expectedMembers: expectedUserIds.size,
      completeSnapshots: completeUserIds.size,
    });
  }
  return {
    complete: true,
    snapshotDate: safeSnapshotDate,
    expectedMembers: expectedUserIds.size,
    completeSnapshots: completeUserIds.size,
  };
}

function normalizeMarker(row) {
  const channel = String(row?.channel || '').trim();
  const snapshotDate = normalizeDate(row?.snapshot_date);
  const version = normalizeVersion(row?.version);
  const completedAt = normalizeTimestamp(row?.completed_at);
  if (channel !== COMPETITION_SNAPSHOT_CHANNEL || !snapshotDate || !version || !completedAt) {
    return null;
  }
  return { channel, snapshotDate, version, completedAt };
}

async function fetchMarker({ snapshotDate = null, throughDate = null } = {}) {
  const url = new URL('/rest/v1/snapshot_publication_markers', 'https://placeholder.local');
  url.searchParams.set('select', 'channel,snapshot_date,version,completed_at');
  url.searchParams.set('channel', `eq.${COMPETITION_SNAPSHOT_CHANNEL}`);
  if (snapshotDate) url.searchParams.set('snapshot_date', `eq.${snapshotDate}`);
  else if (throughDate) url.searchParams.set('snapshot_date', `lte.${throughDate}`);
  url.searchParams.set('order', 'snapshot_date.desc');
  url.searchParams.set('limit', '1');
  const rows = await markerAdminFetch(`${url.pathname}${url.search}`);
  return normalizeMarker(Array.isArray(rows) ? rows[0] : null);
}

export async function getLatestCommunityCompetitionSnapshotMarker({
  now = new Date(),
  throughDate = latestCompletedUsTradingDate(now instanceof Date ? now : new Date(now)),
} = {}) {
  const safeThroughDate = normalizeDate(throughDate);
  if (!safeThroughDate) {
    const error = new Error('快照发布标记查询日期不合法');
    error.status = 400;
    throw error;
  }
  return fetchMarker({ throughDate: safeThroughDate });
}

export async function publishCommunityCompetitionSnapshotMarker({
  snapshotDate,
  completedAt = new Date().toISOString(),
  republish = false,
} = {}) {
  const safeSnapshotDate = normalizeDate(snapshotDate);
  const safeCompletedAt = normalizeTimestamp(completedAt);
  if (!safeSnapshotDate || !safeCompletedAt) {
    const error = new Error('快照发布标记参数不合法');
    error.status = 400;
    throw error;
  }

  const existing = await fetchMarker({ snapshotDate: safeSnapshotDate });
  // Even a same-date no-op must prove the durable row still represents a
  // complete exact cohort. This prevents a marker created by an older runtime
  // or a concurrent partial run from bypassing the publication gate forever.
  await verifyCommunityCompetitionSnapshotBatch({ snapshotDate: safeSnapshotDate });
  if (existing && !republish) {
    return { ...existing, published: false };
  }

  const row = {
    channel: COMPETITION_SNAPSHOT_CHANNEL,
    snapshot_date: safeSnapshotDate,
    version: randomUUID().replace(/-/g, ''),
    completed_at: safeCompletedAt,
  };
  const url = new URL('/rest/v1/snapshot_publication_markers', 'https://placeholder.local');
  url.searchParams.set('on_conflict', 'channel,snapshot_date');
  const body = await markerAdminFetch(`${url.pathname}${url.search}`, {
    method: 'POST',
    headers: {
      Prefer: republish
        ? 'resolution=merge-duplicates,return=representation'
        : 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  const published = normalizeMarker(Array.isArray(body) ? body[0] : body);
  if (published) return { ...published, published: true };

  // A concurrent successful invocation may have won an ignore-duplicates race.
  // Read the durable row back instead of rotating the opaque version again.
  const durable = await fetchMarker({ snapshotDate: safeSnapshotDate });
  if (!durable) {
    const error = new Error('快照发布标记写入后不可读');
    error.status = 503;
    error.retryable = true;
    throw error;
  }
  return { ...durable, published: false };
}
