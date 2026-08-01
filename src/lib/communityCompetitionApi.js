const COMMUNITY_COMPETITION_ENDPOINT = '/api/community-competition';
export const COMMUNITY_COMPETITION_REQUEST_TIMEOUT_MS = 15_000;

let readRequestNonce = 0;

export const COMMUNITY_COMPETITION_STATES = new Set([
  'profile_required',
  'join_required',
  'waiting_snapshot',
  'ready',
]);

export const COMMUNITY_COMPETITION_RECALCULATE_STATES = new Set([
  'recalculated',
  'already_current',
  'not_joined',
  'waiting_snapshot',
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

function appendReadRequestNonce(path) {
  readRequestNonce = (readRequestNonce + 1) % Number.MAX_SAFE_INTEGER;
  const separator = String(path).includes('?') ? '&' : '?';
  return `${path}${separator}__competition_read=${Date.now().toString(36)}-${readRequestNonce.toString(36)}`;
}

function createCompetitionAbortError(code) {
  const error = new Error(code);
  error.name = 'AbortError';
  error.code = code;
  return error;
}

async function requestCommunityCompetition(supabase, path, options = {}, validateBody = null) {
  const {
    signal: externalSignal,
    timeoutMs: requestedTimeoutMs,
    ...fetchOptions
  } = options;
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const isRead = method === 'GET';
  const timeoutMs = Number.isFinite(Number(requestedTimeoutMs)) && Number(requestedTimeoutMs) > 0
    ? Number(requestedTimeoutMs)
    : 0;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const requestSignal = controller?.signal || externalSignal;
  let timeoutId = null;
  let removeExternalAbortListener = () => {};
  let timedOut = false;

  const operation = (async () => {
    const token = await getAccessToken(supabase);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {}),
      ...(isRead ? {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      } : {}),
    };
    const response = await fetch(isRead ? appendReadRequestNonce(path) : path, {
      ...fetchOptions,
      ...(isRead ? { cache: 'no-store' } : {}),
      headers,
      ...(requestSignal ? { signal: requestSignal } : {}),
    });
    const body = await response.json().catch(() => null);
    return { response, body };
  })();

  const pending = [operation];
  if (timeoutMs > 0) {
    pending.push(new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        reject(createCompetitionAbortError('COMPETITION_REQUEST_TIMEOUT'));
        controller?.abort();
      }, timeoutMs);
    }));
  }
  if (externalSignal) {
    pending.push(new Promise((_, reject) => {
      const abort = () => {
        controller?.abort();
        reject(createCompetitionAbortError('COMPETITION_REQUEST_ABORTED'));
      };
      if (externalSignal.aborted) {
        abort();
        return;
      }
      externalSignal.addEventListener('abort', abort, { once: true });
      removeExternalAbortListener = () => externalSignal.removeEventListener('abort', abort);
    }));
  }

  let response;
  let body;
  try {
    ({ response, body } = await Promise.race(pending));
  } catch (error) {
    if (timedOut) throw createCompetitionAbortError('COMPETITION_REQUEST_TIMEOUT');
    throw error;
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
    removeExternalAbortListener();
  }
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

export function fetchCommunityCompetitionSnapshotStatus({
  supabase,
  signal,
  timeoutMs = COMMUNITY_COMPETITION_REQUEST_TIMEOUT_MS,
} = {}) {
  const params = new URLSearchParams({ operation: 'snapshot-status' });
  return requestCommunityCompetition(
    supabase,
    `${COMMUNITY_COMPETITION_ENDPOINT}?${params.toString()}`,
    { method: 'GET', signal, timeoutMs },
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

export function fetchCommunityCompetition({
  supabase,
  period = 'day',
  signal,
  timeoutMs = COMMUNITY_COMPETITION_REQUEST_TIMEOUT_MS,
} = {}) {
  const params = new URLSearchParams({ period });
  return requestCommunityCompetition(supabase, `${COMMUNITY_COMPETITION_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    signal,
    timeoutMs,
  });
}

export function joinCommunityCompetition({ supabase, signal } = {}) {
  return requestCommunityCompetition(supabase, COMMUNITY_COMPETITION_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({}),
    signal,
  });
}

export function recalculateSelfCommunityCompetition({
  supabase,
  signal,
  timeoutMs = COMMUNITY_COMPETITION_REQUEST_TIMEOUT_MS,
} = {}) {
  const params = new URLSearchParams({ operation: 'recalculate-self' });
  return requestCommunityCompetition(
    supabase,
    `${COMMUNITY_COMPETITION_ENDPOINT}?${params.toString()}`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      signal,
      timeoutMs,
    },
    (body) => {
      if (!body?.success || !COMMUNITY_COMPETITION_RECALCULATE_STATES.has(body?.state)) return false;
      const allowedFields = new Set([
        'success', 'state', 'snapshotDate', 'version', 'completedAt',
      ]);
      if (!Object.keys(body || {}).every((key) => allowedFields.has(key))) return false;
      const markerEmpty = body.snapshotDate == null && body.version == null && body.completedAt == null;
      const markerComplete = isDateKey(body.snapshotDate)
        && isOpaqueVersion(body.version)
        && isTimestamp(body.completedAt);
      return ['recalculated', 'already_current'].includes(body.state)
        ? markerComplete
        : markerEmpty;
    },
  );
}

export const communityCompetitionApi = Object.freeze({
  fetch: fetchCommunityCompetition,
  join: joinCommunityCompetition,
  recalculateSelf: recalculateSelfCommunityCompetition,
  snapshotStatus: fetchCommunityCompetitionSnapshotStatus,
});
