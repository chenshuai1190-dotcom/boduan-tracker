import { randomUUID } from 'node:crypto';

import { latestCompletedUsTradingDate } from '../src/lib/pnlReportSnapshots.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';

export const COMPETITION_SNAPSHOT_CHANNEL = 'competition';

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
