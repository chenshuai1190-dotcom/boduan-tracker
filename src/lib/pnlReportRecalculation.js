const PNL_REPORT_RECALCULATION_ENDPOINT = '/api/pnl-report-daily-snapshot?operation=recalculate-self';

export const PNL_REPORT_RECALCULATION_TIMEOUT_MS = 55_000;

const ACCEPTED_STATES = new Set([
  'recalculated',
  'cleared',
  'already_current',
  'waiting_for_close',
]);

const requestsByUser = new Map();

function createAbortError(code) {
  const error = new Error(code);
  error.name = 'AbortError';
  error.code = code;
  return error;
}

async function authenticatedSession(supabase) {
  const { data, error } = await supabase?.auth?.getSession?.();
  if (error) throw error;
  const token = String(data?.session?.access_token || '').trim();
  const userId = String(data?.session?.user?.id || '').trim();
  if (!token || !userId) {
    const authError = new Error('AUTH_REQUIRED');
    authError.code = 'AUTH_REQUIRED';
    throw authError;
  }
  return { token, userId };
}

function readApiError(body, fallback) {
  if (typeof body?.error === 'string' && body.error.trim()) return body.error;
  if (typeof body?.message === 'string' && body.message.trim()) return body.message;
  return fallback;
}

function normalizeResult(body) {
  if (!body || body.success !== true || !ACCEPTED_STATES.has(body.state)) {
    throw new Error('INVALID_PNL_RECALCULATION_STATE');
  }
  return {
    success: true,
    state: body.state,
    fromDate: typeof body.fromDate === 'string' ? body.fromDate : null,
    throughDate: typeof body.throughDate === 'string' ? body.throughDate : null,
    ledgerRevision: Number.isSafeInteger(Number(body.ledgerRevision))
      ? Number(body.ledgerRevision)
      : 0,
    generation: Number.isSafeInteger(Number(body.generation))
      ? Number(body.generation)
      : 0,
    replacedPortfolio: Number.isSafeInteger(Number(body.replacedPortfolio))
      ? Number(body.replacedPortfolio)
      : 0,
    replacedSymbols: Number.isSafeInteger(Number(body.replacedSymbols))
      ? Number(body.replacedSymbols)
      : 0,
  };
}

async function performRequest({
  fetchImpl,
  token,
  timeoutMs,
}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timeoutId = null;
  let timedOut = false;
  const request = (async () => {
    const response = await fetchImpl(PNL_REPORT_RECALCULATION_ENDPOINT, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success === false) {
      const error = new Error(readApiError(body, `HTTP_${response.status}`));
      error.status = response.status;
      error.code = body?.code || '';
      error.state = body?.state || '';
      throw error;
    }
    return normalizeResult(body);
  })();

  const pending = [request];
  if (timeoutMs > 0) {
    pending.push(new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller?.abort();
        reject(createAbortError('PNL_RECALCULATION_TIMEOUT'));
      }, timeoutMs);
    }));
  }

  try {
    return await Promise.race(pending);
  } catch (error) {
    if (timedOut) throw createAbortError('PNL_RECALCULATION_TIMEOUT');
    throw error;
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}

async function startRequestLoop(entry, {
  fetchImpl,
  initialToken,
  supabase,
  timeoutMs,
  userId,
}) {
  let result = null;
  let lastError = null;
  let token = initialToken;
  let requestIndex = 0;
  do {
    entry.rerunRequested = false;
    try {
      if (requestIndex > 0) {
        const refreshedSession = await authenticatedSession(supabase);
        if (refreshedSession.userId !== userId) {
          const authError = new Error('AUTH_USER_CHANGED');
          authError.code = 'AUTH_USER_CHANGED';
          throw authError;
        }
        token = refreshedSession.token;
      }
      result = await performRequest({ fetchImpl, token, timeoutMs });
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    requestIndex += 1;
  } while (entry.rerunRequested);
  if (lastError) throw lastError;
  return result;
}

export async function requestPnlReportRecalculation({
  supabase,
  fetchImpl = globalThis.fetch,
  timeoutMs = PNL_REPORT_RECALCULATION_TIMEOUT_MS,
  enqueueAfterCurrent = false,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const { token, userId } = await authenticatedSession(supabase);
  const existing = requestsByUser.get(userId);
  if (existing) {
    if (enqueueAfterCurrent) existing.rerunRequested = true;
    return existing.promise;
  }

  const entry = { promise: null, rerunRequested: false };
  entry.promise = startRequestLoop(entry, {
    fetchImpl,
    initialToken: token,
    supabase,
    timeoutMs: Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? Number(timeoutMs)
      : 0,
    userId,
  }).finally(() => {
    if (requestsByUser.get(userId) === entry) requestsByUser.delete(userId);
  });
  requestsByUser.set(userId, entry);
  return entry.promise;
}

export function enqueuePnlReportRecalculationAfterLedgerMutation(options = {}) {
  return requestPnlReportRecalculation({
    ...options,
    enqueueAfterCurrent: true,
  });
}

export function resetPnlReportRecalculationRequests() {
  requestsByUser.clear();
}
