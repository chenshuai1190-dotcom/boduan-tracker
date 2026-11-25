import { PNL_REPORT_MUTATION_QUIET_MS } from './pnlReportRebuildPolicy.js';

const PNL_REPORT_RECALCULATION_ENDPOINT = '/api/pnl-report-daily-snapshot?operation=recalculate-self';

export const PNL_REPORT_RECALCULATION_TIMEOUT_MS = 55_000;

const ACCEPTED_STATES = new Set([
  'recalculated',
  'cleared',
  'already_current',
  'waiting_for_close',
  'waiting_for_edits',
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
  const state = body.state === 'waiting_for_close' && body.waitReason === 'recent_edits'
    ? 'waiting_for_edits' : body.state;
  return {
    success: true,
    state,
    ...(state === 'waiting_for_edits' ? { retryAfterMs: Number(body.retryAfterMs) } : {}),
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

export async function requestPnlReportRecalculation({
  supabase,
  expectedUserId,
  fetchImpl = globalThis.fetch,
  timeoutMs = PNL_REPORT_RECALCULATION_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const { token, userId } = await authenticatedSession(supabase);
  if (expectedUserId != null && userId !== expectedUserId) throw createAbortError('AUTH_USER_CHANGED');
  const existing = requestsByUser.get(userId);
  if (existing) return existing;

  const request = performRequest({ fetchImpl, token, timeoutMs }).finally(() => {
    if (requestsByUser.get(userId) === request) requestsByUser.delete(userId);
  });
  requestsByUser.set(userId, request);
  return request;
}

// Mutations already persist the earliest dirty date in the database. This
// timer only brings the next eligible rebuild forward while the app is open.
export function createPnlReportMutationScheduler({
  userId, supabase, onSettled, request = requestPnlReportRecalculation,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let timer = null;
  let generation = 0;
  let disposed = false;
  async function run(expectedGeneration) {
    if (disposed || expectedGeneration !== generation) return;
    timer = null;
    let result;
    try {
      result = await request({ supabase, expectedUserId: userId });
    } catch (error) {
      if (!disposed && expectedGeneration === generation) onSettled?.(null, error);
      return;
    }
    if (disposed || expectedGeneration !== generation) return;
    if (result.state === 'waiting_for_edits') {
      // Another device may have changed the ledger after our last local edit.
      const delay = Number.isFinite(result.retryAfterMs) && result.retryAfterMs > 0
        ? Math.min(PNL_REPORT_MUTATION_QUIET_MS, Math.max(1000, result.retryAfterMs))
        : PNL_REPORT_MUTATION_QUIET_MS;
      timer = setTimer(() => run(expectedGeneration), delay);
      return;
    }
    onSettled?.(result);
  }

  return {
    schedule({ cashSettlement = false } = {}) {
      if (disposed || !userId) return false;
      const startsBurst = timer === null;
      // An explicit cash reconciliation can run now unless a trade is settling.
      if (cashSettlement && !startsBurst) return false;
      if (!startsBurst) clearTimer(timer);
      const expectedGeneration = ++generation;
      timer = setTimer(() => run(expectedGeneration), cashSettlement ? 0 : PNL_REPORT_MUTATION_QUIET_MS);
      return startsBurst;
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
