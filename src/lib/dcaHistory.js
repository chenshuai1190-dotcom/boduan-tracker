import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';
import { investmentComparisonError, isInvestmentDate, normalizeInvestmentSymbol, INVESTMENT_COMPARISON_STALE_REASONS } from './investmentComparisonModel.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

export const DCA_HISTORY_STALE_RETRY_MS = 5 * 60 * 1000;
export const DCA_HISTORY_FAILURE_RETRY_MS = 60 * 1000;
export const DCA_HISTORY_TIMEOUT_MS = 20 * 1000;
const MAX_HISTORY_ENTRIES = 16;
const MAX_FAILURE_ENTRIES = 64;
const MAX_IN_FLIGHT = 16;
const successCache = new Map();
const failures = new Map();
const inFlight = new Map();
const identityEpochs = new Map();
let generation = 0;

function tradingDate(value) {
  return isInvestmentDate(value)
    && ![0, 6].includes(new Date(`${value}T00:00:00Z`).getUTCDay())
    && !isRegularNyseHoliday(value);
}

// Wire close is exclusively EODHD adjusted_close. Never accept raw-close data,
// coerce missing values to zero, reorder a corrupt response, or invent sessions.
export function normalizeDcaHistoryData(value, { symbol = value?.symbol, expectedAsOfDate, now } = {}) {
  const selected = normalizeInvestmentSymbol(symbol);
  if (!selected || !value || value.version !== 1 || value.source !== 'EODHD_EOD'
    || value.symbol !== selected || value.currency !== 'USD' || value.priceBasis !== 'adjusted_close'
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 300
    || /[\u0000-\u001f\u007f]/.test(value.name) || !['ETF', 'Common Stock'].includes(value.type)
    || !tradingDate(value.expectedAsOfDate) || !tradingDate(value.asOfDate)
    || !tradingDate(value.availableFromDate) || value.availableFromDate < '2000-01-01'
    || value.availableFromDate > value.asOfDate || value.asOfDate > value.expectedAsOfDate
    || typeof value.stale !== 'boolean' || !INVESTMENT_COMPARISON_STALE_REASONS.includes(value.staleReason)
    || (value.stale && !value.staleReason) || (!value.stale && value.staleReason)
    || (!value.stale && value.asOfDate < value.expectedAsOfDate)
    || (value.staleReason === 'incomplete_close' && value.asOfDate === value.expectedAsOfDate)
    || typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt))
    || !Array.isArray(value.rows) || value.rows.length < 2 || value.rows.length > 15000) return null;
  if (expectedAsOfDate !== undefined && (!tradingDate(expectedAsOfDate) || value.expectedAsOfDate > expectedAsOfDate)) return null;
  if (now !== undefined && (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())
    || Date.parse(value.fetchedAt) > now + 300000
    || (expectedAsOfDate || value.expectedAsOfDate) > getInvestmentComparisonExpectedCloseDate(now))) return null;
  const rows = [];
  let previousDate = '';
  for (const row of value.rows) {
    if (!tradingDate(row?.date) || row.date < value.availableFromDate || row.date <= previousDate
      || row.date > value.asOfDate || typeof row.close !== 'number' || !Number.isFinite(row.close)
      || row.close <= 0) return null;
    previousDate = row.date;
    rows.push({ date: row.date, close: row.close });
  }
  if (rows[0].date !== value.availableFromDate || rows.at(-1).date !== value.asOfDate) return null;
  const expected = expectedAsOfDate || value.expectedAsOfDate;
  const stale = value.stale || value.asOfDate < expected;
  return {
    version: 1, source: 'EODHD_EOD', symbol: selected, name: value.name.trim(), type: value.type,
    currency: 'USD', priceBasis: 'adjusted_close', rows, availableFromDate: value.availableFromDate,
    asOfDate: value.asOfDate, expectedAsOfDate: expected, fetchedAt: value.fetchedAt,
    stale, staleReason: stale ? value.staleReason || 'incomplete_close' : '',
  };
}

function timestampOf(now) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) throw investmentComparisonError('INVALID_CLOCK', 'invalid DCA history clock');
  return timestamp;
}

function boundedSet(map, key, value, limit) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}

function identityOf(userId) {
  const identity = typeof userId === 'string' ? userId.trim() : '';
  if (!identity) throw investmentComparisonError('AUTH_REQUIRED', 'authenticated user required');
  return identity;
}

function clearIdentity(identity) {
  for (const map of [successCache, failures, inFlight]) {
    for (const [key, entry] of map) if (entry.identity === identity) map.delete(key);
  }
  // Preserve a tombstone while requests for the identity may still complete.
  // A full lifecycle reset clears these epochs and advances the generation.
  identityEpochs.set(identity, (identityEpochs.get(identity) || 0) + 1);
}

async function defaultGetSession() {
  const { supabase } = await import('./supabase.js');
  if (!supabase) throw investmentComparisonError('AUTH_REQUIRED', 'authenticated session required');
  return supabase.auth.getSession();
}

async function authenticatedSession(identity, getSession) {
  try {
    const result = await getSession();
    const session = result?.data?.session;
    if (result?.error || !session?.access_token || session.user?.id !== identity) throw new Error('identity mismatch');
    return session;
  } catch {
    clearIdentity(identity);
    throw investmentComparisonError('AUTH_REQUIRED', 'authenticated user does not match DCA history request');
  }
}

function aborted() {
  const cause = investmentComparisonError('REQUEST_ABORTED', 'DCA history caller aborted');
  cause.name = 'AbortError';
  return cause;
}

function assertRequestCurrent(identity, requestGeneration, epoch) {
  if (generation !== requestGeneration) throw investmentComparisonError('REQUEST_SUPERSEDED', 'DCA history cache was reset');
  if ((identityEpochs.get(identity) || 0) !== epoch) throw investmentComparisonError('AUTH_REQUIRED', 'DCA history identity was invalidated');
}

async function forCaller(promise, { signal, identity, getSession, requestGeneration, epoch }) {
  if (signal?.aborted) throw aborted();
  let onAbort;
  try {
    const result = signal ? await Promise.race([promise, new Promise((_, reject) => {
      onAbort = () => reject(aborted());
      signal.addEventListener('abort', onAbort, { once: true });
    })]) : await promise;
    await authenticatedSession(identity, getSession);
    assertRequestCurrent(identity, requestGeneration, epoch);
    if (signal?.aborted) throw aborted();
    return result;
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

async function requestJson({ symbol, token, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        let response;
        try {
          response = await fetchImpl(`/api/quote?view=dca-history&symbol=${encodeURIComponent(symbol)}`, {
            headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
          });
        } catch { throw investmentComparisonError('NETWORK_ERROR', 'historical data request unavailable'); }
        if ([401, 403].includes(response.status)) throw investmentComparisonError('AUTH_REQUIRED', 'DCA history authorization failed');
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const supportedCodes = ['INVALID_SYMBOL', 'UNSUPPORTED_INSTRUMENT', 'INSUFFICIENT_HISTORY', 'INVALID_DATA', 'NOT_CONFIGURED', 'PROVIDER_UNAVAILABLE', 'QUOTA_EXHAUSTED'];
          const code = supportedCodes.includes(body?.details?.code) ? body.details.code
            : response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'NETWORK_ERROR' : 'REQUEST_ERROR';
          throw investmentComparisonError(code, 'historical data request failed');
        }
        if (!body || body.success !== true) throw investmentComparisonError('INVALID_DATA', 'DCA history response invalid');
        return body.data;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(investmentComparisonError('NETWORK_ERROR', 'historical data request timed out'));
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

function latestSuccess(identity, symbol) {
  let found;
  for (const entry of successCache.values()) {
    if (entry.identity !== identity || entry.symbol !== symbol) continue;
    if (!found || entry.data.asOfDate > found.data.asOfDate
      || (entry.data.asOfDate === found.data.asOfDate && Date.parse(entry.data.fetchedAt) >= Date.parse(found.data.fetchedAt))) found = entry;
  }
  return found;
}

function retryable(cause) {
  return ['NETWORK_ERROR', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'QUOTA_EXHAUSTED'].includes(cause?.code);
}

function staleFallback(data, expectedAsOfDate, cause) {
  return { ...data, expectedAsOfDate, stale: true,
    staleReason: ['RATE_LIMITED', 'QUOTA_EXHAUSTED'].includes(cause?.code) ? 'quota_exhausted' : 'provider_unavailable', cacheState: 'stale' };
}

export async function loadDcaHistory({ userId, symbol = 'QQQ', force = false, signal, fetchImpl = globalThis.fetch, getSession = defaultGetSession, now = Date.now, timeoutMs = DCA_HISTORY_TIMEOUT_MS } = {}) {
  const identity = identityOf(userId);
  const selected = normalizeInvestmentSymbol(symbol);
  if (!selected) throw investmentComparisonError('INVALID_SYMBOL', 'one valid US symbol required');
  if (signal?.aborted) throw aborted();
  const initialGeneration = generation, initialEpoch = identityEpochs.get(identity) || 0;
  const session = await authenticatedSession(identity, getSession);
  assertRequestCurrent(identity, initialGeneration, initialEpoch);
  if (signal?.aborted) throw aborted();
  const timestamp = timestampOf(now);
  const expectedAsOfDate = getInvestmentComparisonExpectedCloseDate(timestamp);
  const key = JSON.stringify([identity, selected, expectedAsOfDate]);
  const requestGeneration = generation, epoch = identityEpochs.get(identity) || 0;
  const caller = { signal, identity, getSession, requestGeneration, epoch };
  if (inFlight.has(key)) return forCaller(inFlight.get(key).promise, caller);
  const failure = failures.get(key), cached = successCache.get(key);
  if (!force && failure?.retryAt > timestamp) {
    const previous = latestSuccess(identity, selected);
    if (retryable(failure.error) && previous) return forCaller(Promise.resolve(staleFallback(previous.data, expectedAsOfDate, failure.error)), caller);
    throw failure.error;
  }
  if (!force && !failure && cached && (!cached.data.stale || cached.retryAt > timestamp)) return forCaller(Promise.resolve(cached.data), caller);
  if (typeof fetchImpl !== 'function') throw investmentComparisonError('NETWORK_ERROR', 'fetch unavailable');
  if (inFlight.size >= MAX_IN_FLIGHT) throw investmentComparisonError('RATE_LIMITED', 'too many historical data requests');
  let promise;
  promise = (async () => {
    try {
      const value = await requestJson({ symbol: selected, token: session.access_token, fetchImpl, timeoutMs });
      await authenticatedSession(identity, getSession);
      assertRequestCurrent(identity, requestGeneration, epoch);
      const completedAt = timestampOf(now);
      const completedDate = getInvestmentComparisonExpectedCloseDate(completedAt);
      let data = normalizeDcaHistoryData(value, { symbol: selected, expectedAsOfDate: completedDate, now: completedAt });
      if (!data) throw investmentComparisonError('INVALID_DATA', 'complete adjusted-close USD history required');
      const previous = latestSuccess(identity, selected);
      if (previous && (previous.data.asOfDate > data.asOfDate
        || (previous.data.asOfDate === data.asOfDate && Date.parse(previous.data.fetchedAt) > Date.parse(data.fetchedAt)))) {
        // A delayed response cannot regress a newer cached close or correction.
        data = normalizeDcaHistoryData(previous.data, { symbol: selected, expectedAsOfDate: completedDate, now: completedAt });
        if (!data) throw investmentComparisonError('INVALID_DATA', 'cached history is outside the current clock');
      }
      data = { ...data, cacheState: data.stale ? 'stale' : 'fresh' };
      const cacheKey = JSON.stringify([identity, selected, completedDate]);
      boundedSet(successCache, cacheKey, { identity, symbol: selected, data, retryAt: completedAt + DCA_HISTORY_STALE_RETRY_MS }, MAX_HISTORY_ENTRIES);
      failures.delete(key);
      failures.delete(cacheKey);
      return data;
    } catch (cause) {
      if (cause.code === 'AUTH_REQUIRED') { clearIdentity(identity); throw cause; }
      if (cause.code === 'REQUEST_SUPERSEDED') throw cause;
      await authenticatedSession(identity, getSession);
      assertRequestCurrent(identity, requestGeneration, epoch);
      boundedSet(failures, key, { identity, error: cause, retryAt: timestampOf(now) + DCA_HISTORY_FAILURE_RETRY_MS }, MAX_FAILURE_ENTRIES);
      const previous = latestSuccess(identity, selected);
      if (retryable(cause) && previous) return staleFallback(previous.data, getInvestmentComparisonExpectedCloseDate(timestampOf(now)), cause);
      throw cause;
    }
  })().finally(() => { if (inFlight.get(key)?.promise === promise) inFlight.delete(key); });
  inFlight.set(key, { identity, promise });
  return forCaller(promise, caller);
}

export function resetDcaHistoryMemoryCache(userId) {
  if (userId !== undefined) { clearIdentity(identityOf(userId)); return; }
  generation += 1;
  for (const map of [successCache, failures, inFlight, identityEpochs]) map.clear();
}
