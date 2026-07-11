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

async function requestCommunityCompetition(supabase, path, options = {}) {
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
  if (!COMMUNITY_COMPETITION_STATES.has(body?.state)) {
    throw new Error('INVALID_COMPETITION_STATE');
  }
  return body;
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
});
