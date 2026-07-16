const COMMUNITY_COMPETITION_ENDPOINT = '/api/community-competition';

export const COMMUNITY_COMPETITION_STATES = new Set([
  'profile_required',
  'join_required',
  'waiting_snapshot',
  'ready',
]);

async function getAccessToken(supabase) {
  const { data, error } = await supabase?.auth?.getSession?.();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) {
    const authError = new Error('AUTH_REQUIRED');
    authError.code = 'AUTH_REQUIRED';
    throw authError;
  }
  return token;
}

function readApiError(body, fallback) {
  if (typeof body?.error === 'string' && body.error.trim()) return body.error;
  if (typeof body?.message === 'string' && body.message.trim()) return body.message;
  return fallback;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isOpaqueVersion(value) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(String(value || ''));
}

async function requestCommunityCompetition(supabase, path, options = {}, validateBody = null) {
  const token = await getAccessToken(supabase);
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    const error = new Error(readApiError(body, `HTTP_${response.status}`));
    error.status = response.status;
    error.code = body?.code || '';
    error.state = body?.state || '';
    throw error;
  }
  if (typeof validateBody === 'function' ? !validateBody(body) : !COMMUNITY_COMPETITION_STATES.has(body?.state)) {
    throw new Error('INVALID_COMPETITION_STATE');
  }
  return body;
}

export function fetchCommunityCompetitionSnapshotStatus({ supabase, signal } = {}) {
  const params = new URLSearchParams({ operation: 'snapshot-status' });
  return requestCommunityCompetition(
    supabase,
    `${COMMUNITY_COMPETITION_ENDPOINT}?${params.toString()}`,
    { method: 'GET', signal },
    (body) => {
      if (body?.state !== 'snapshot_status' || body?.channel !== 'competition') return false;
      const allowedFields = new Set([
        'success', 'state', 'channel', 'snapshotDate', 'version', 'completedAt',
      ]);
      if (!Object.keys(body || {}).every((key) => allowedFields.has(key))) return false;
      const empty = body.snapshotDate == null && body.version == null && body.completedAt == null;
      return empty || (
        isDateKey(body.snapshotDate)
        && isOpaqueVersion(body.version)
        && isTimestamp(body.completedAt)
      );
    },
  );
}

export function fetchCommunityCompetition({ supabase, period = 'day', signal } = {}) {
  const params = new URLSearchParams({ period });
  return requestCommunityCompetition(supabase, `${COMMUNITY_COMPETITION_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    signal,
  });
}

export function joinCommunityCompetition({ supabase, signal } = {}) {
  return requestCommunityCompetition(supabase, COMMUNITY_COMPETITION_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({}),
    signal,
  });
}

export const communityCompetitionApi = Object.freeze({
  fetch: fetchCommunityCompetition,
  join: joinCommunityCompetition,
  snapshotStatus: fetchCommunityCompetitionSnapshotStatus,
});
