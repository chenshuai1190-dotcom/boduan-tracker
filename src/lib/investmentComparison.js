import { latestCompletedUsTradingDate } from './pnlReportSnapshots.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';
import { investmentComparisonError, normalizeInvestmentComparisonData, normalizeInvestmentSymbol, normalizeInvestmentSymbols } from './investmentComparisonModel.js';

export const INVESTMENT_COMPARISON_STALE_RETRY_MS = 5 * 60 * 1000;
export const INVESTMENT_COMPARISON_FAILURE_RETRY_MS = 60 * 1000;
export const INVESTMENT_COMPARISON_TIMEOUT_MS = 20 * 1000;
export const INVESTMENT_SEARCH_CACHE_MS = 5 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 16;
const MAX_SMALL_ENTRIES = 64;
const MAX_IN_FLIGHT = 16;
const successCache = new Map();
const searchCache = new Map();
const failures = new Map();
const inFlight = new Map();
const identityEpochs = new Map();
let generation = 0;

function timestampOf(now) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) throw investmentComparisonError('INVALID_CLOCK', 'invalid comparison clock');
  return timestamp;
}

export function getInvestmentComparisonExpectedCloseDate(now = Date.now()) {
  let cursor = latestCompletedUsTradingDate(new Date(timestampOf(now)));
  while (true) {
    const date = new Date(`${cursor}T00:00:00Z`);
    if (![0, 6].includes(date.getUTCDay()) && !isRegularNyseHoliday(cursor)) return cursor;
    date.setUTCDate(date.getUTCDate() - 1);
    cursor = date.toISOString().slice(0, 10);
  }
}

function boundedSet(map, key, value, limit = MAX_SMALL_ENTRIES) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}

function clearIdentity(identity) {
  for (const map of [successCache, searchCache, failures, inFlight]) {
    for (const [key, entry] of map) if (entry.identity === identity) map.delete(key);
  }
  boundedSet(identityEpochs, identity, (identityEpochs.get(identity) || 0) + 1);
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
    throw investmentComparisonError('AUTH_REQUIRED', 'authenticated user does not match comparison request');
  }
}

function aborted() {
  const error = investmentComparisonError('REQUEST_ABORTED', 'comparison caller aborted');
  error.name = 'AbortError';
  return error;
}

async function forCaller(promise, { signal, identity, getSession }) {
  if (signal?.aborted) throw aborted();
  let onAbort;
  try {
    const result = signal ? await Promise.race([promise, new Promise((_, reject) => {
      onAbort = () => reject(aborted());
      signal.addEventListener('abort', onAbort, { once: true });
    })]) : await promise;
    // Every single-flight subscriber revalidates its own current auth context.
    await authenticatedSession(identity, getSession);
    if (signal?.aborted) throw aborted();
    return result;
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

async function requestJson({ url, token, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        let response;
        try {
          response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
        } catch { throw investmentComparisonError('NETWORK_ERROR', 'historical data request unavailable'); }
        if ([401, 403].includes(response.status)) throw investmentComparisonError('AUTH_REQUIRED', 'comparison authorization failed');
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const supportedCodes = ['INVALID_SYMBOLS', 'INVALID_QUERY', 'UNSUPPORTED_INSTRUMENT', 'INSUFFICIENT_HISTORY', 'INVALID_DATA', 'NOT_CONFIGURED', 'PROVIDER_UNAVAILABLE', 'QUOTA_EXHAUSTED'];
          const code = supportedCodes.includes(body?.details?.code) ? body.details.code
            : response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'NETWORK_ERROR' : 'REQUEST_ERROR';
          throw investmentComparisonError(code, 'historical data request failed');
        }
        if (!body || body.success !== true) throw investmentComparisonError('INVALID_DATA', 'comparison response invalid');
        return body.data;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(investmentComparisonError('NETWORK_ERROR', 'historical data request timed out')); }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

function latestSuccess(identity, pair) {
  let found;
  for (const entry of successCache.values()) {
    if (entry.identity === identity && entry.pair === pair && (!found || entry.data.asOfDate >= found.data.asOfDate)) found = entry;
  }
  return found;
}

function staleFallback(data, expectedAsOfDate, error) {
  return { ...data, expectedAsOfDate, stale: true, staleReason: ['RATE_LIMITED', 'QUOTA_EXHAUSTED'].includes(error?.code) ? 'quota_exhausted' : 'provider_unavailable', cacheState: 'stale' };
}

function retryable(error) { return ['NETWORK_ERROR', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'QUOTA_EXHAUSTED'].includes(error?.code); }

function identityOf(userId) {
  const identity = typeof userId === 'string' ? userId.trim() : '';
  if (!identity) throw investmentComparisonError('AUTH_REQUIRED', 'authenticated user required');
  return identity;
}

function assertRequestCurrent(identity, requestGeneration, epoch) {
  if (generation !== requestGeneration) throw investmentComparisonError('REQUEST_SUPERSEDED', 'comparison cache was reset');
  if ((identityEpochs.get(identity) || 0) !== epoch) throw investmentComparisonError('AUTH_REQUIRED', 'comparison identity was invalidated');
}

export async function loadInvestmentComparison({ userId, symbols = ['QQQ', 'TQQQ'], force = false, signal, fetchImpl = globalThis.fetch, getSession = defaultGetSession, now = Date.now, timeoutMs = INVESTMENT_COMPARISON_TIMEOUT_MS } = {}) {
  const identity = identityOf(userId);
  const selected = normalizeInvestmentSymbols(symbols).sort();
  if (signal?.aborted) throw aborted();
  const session = await authenticatedSession(identity, getSession);
  const timestamp = timestampOf(now);
  const expectedAsOfDate = getInvestmentComparisonExpectedCloseDate(timestamp);
  const pair = selected.join(',');
  const key = JSON.stringify(['history', identity, pair, expectedAsOfDate]);
  const caller = { signal, identity, getSession };
  if (inFlight.has(key)) return forCaller(inFlight.get(key).promise, caller);
  const failure = failures.get(key);
  const cached = successCache.get(key);
  if (!force && failure?.retryAt > timestamp) {
    const last = latestSuccess(identity, pair);
    if (retryable(failure.error) && last) return forCaller(Promise.resolve(staleFallback(last.data, expectedAsOfDate, failure.error)), caller);
    throw failure.error;
  }
  if (!force && !failure && cached && (!cached.data.stale || cached.retryAt > timestamp)) return forCaller(Promise.resolve(cached.data), caller);
  if (typeof fetchImpl !== 'function') throw investmentComparisonError('NETWORK_ERROR', 'fetch unavailable');
  if (inFlight.size >= MAX_IN_FLIGHT) throw investmentComparisonError('RATE_LIMITED', 'too many historical data requests');
  const requestGeneration = generation, epoch = identityEpochs.get(identity) || 0;
  let promise;
  promise = (async () => {
    try {
      const value = await requestJson({ url: `/api/quote?view=investment-comparison&symbols=${encodeURIComponent(pair)}`, token: session.access_token, fetchImpl, timeoutMs });
      await authenticatedSession(identity, getSession);
      assertRequestCurrent(identity, requestGeneration, epoch);
      const completedDate = getInvestmentComparisonExpectedCloseDate(timestampOf(now));
      let data = normalizeInvestmentComparisonData(value, { symbols: selected, expectedAsOfDate: completedDate, now: timestampOf(now) });
      if (!data) throw investmentComparisonError('INVALID_DATA', 'complete adjusted-close comparison history required');
      const previous = latestSuccess(identity, pair);
      if (previous && previous.data.asOfDate > data.asOfDate) data = { ...previous.data, expectedAsOfDate: completedDate, stale: true, staleReason: data.staleReason || 'incomplete_close' };
      data = { ...data, cacheState: data.stale ? 'stale' : 'fresh' };
      const cacheKey = JSON.stringify(['history', identity, pair, completedDate]);
      boundedSet(successCache, cacheKey, { identity, pair, data, retryAt: timestampOf(now) + INVESTMENT_COMPARISON_STALE_RETRY_MS }, MAX_HISTORY_ENTRIES);
      failures.delete(key);
      failures.delete(cacheKey);
      return data;
    } catch (error) {
      if (error.code === 'AUTH_REQUIRED') { clearIdentity(identity); throw error; }
      if (error.code === 'REQUEST_SUPERSEDED') throw error;
      await authenticatedSession(identity, getSession);
      assertRequestCurrent(identity, requestGeneration, epoch);
      boundedSet(failures, key, { identity, error, retryAt: timestampOf(now) + INVESTMENT_COMPARISON_FAILURE_RETRY_MS });
      const previous = latestSuccess(identity, pair);
      if (retryable(error) && previous) return staleFallback(previous.data, getInvestmentComparisonExpectedCloseDate(timestampOf(now)), error);
      throw error;
    }
  })().finally(() => { if (inFlight.get(key)?.promise === promise) inFlight.delete(key); });
  inFlight.set(key, { identity, promise });
  return forCaller(promise, caller);
}

export function normalizeInvestmentSearchData(value, { query, now = Date.now() } = {}) {
  if (!value || value.version !== 1 || value.source !== 'EODHD_SEARCH' || typeof value.query !== 'string'
    || value.query.trim().replace(/\s+/g, ' ').toLowerCase() !== query?.trim().replace(/\s+/g, ' ').toLowerCase()
    || typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt))
    || Date.parse(value.fetchedAt) > now + 300000 || !Array.isArray(value.results) || value.results.length > 50) return null;
  const results = [], seen = new Set();
  for (const row of value.results) {
    if (!row || normalizeInvestmentSymbol(row.symbol) !== row.symbol || seen.has(row.symbol)
      || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 300
      || row.currency !== 'USD' || row.exchange !== 'US' || !['ETF', 'Common Stock'].includes(row.type)) return null;
    seen.add(row.symbol);
    results.push({ symbol: row.symbol, name: row.name.trim(), currency: 'USD', type: row.type, exchange: 'US' });
  }
  return { version: 1, source: 'EODHD_SEARCH', query: value.query, fetchedAt: value.fetchedAt, results };
}

export async function searchInvestmentSymbols({ userId, query, force = false, signal, fetchImpl = globalThis.fetch, getSession = defaultGetSession, now = Date.now, timeoutMs = INVESTMENT_COMPARISON_TIMEOUT_MS } = {}) {
  const identity = identityOf(userId);
  const normalizedQuery = typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
  if (!normalizedQuery || normalizedQuery.length > 60 || !/^[\p{L}\p{N} .&'’-]+$/u.test(normalizedQuery)
    || !/[\p{L}\p{N}]/u.test(normalizedQuery)) throw investmentComparisonError('INVALID_QUERY', 'search query must contain 1 to 60 valid characters');
  if (signal?.aborted) throw aborted();
  const session = await authenticatedSession(identity, getSession);
  const timestamp = timestampOf(now);
  const key = JSON.stringify(['search', identity, normalizedQuery.toLowerCase()]);
  const caller = { signal, identity, getSession };
  if (inFlight.has(key)) return forCaller(inFlight.get(key).promise, caller);
  const failure = failures.get(key), cached = searchCache.get(key);
  if (!force && failure?.retryAt > timestamp) throw failure.error;
  if (!force && !failure && cached?.expiresAt > timestamp) return forCaller(Promise.resolve(cached.data), caller);
  if (typeof fetchImpl !== 'function') throw investmentComparisonError('NETWORK_ERROR', 'fetch unavailable');
  if (inFlight.size >= MAX_IN_FLIGHT) throw investmentComparisonError('RATE_LIMITED', 'too many historical data requests');
  const requestGeneration = generation, epoch = identityEpochs.get(identity) || 0;
  let promise;
  promise = (async () => {
    try {
      const value = await requestJson({ url: `/api/quote?view=investment-search&q=${encodeURIComponent(normalizedQuery)}`, token: session.access_token, fetchImpl, timeoutMs });
      await authenticatedSession(identity, getSession);
      assertRequestCurrent(identity, requestGeneration, epoch);
      const data = normalizeInvestmentSearchData(value, { query: normalizedQuery, now: timestampOf(now) });
      if (!data) throw investmentComparisonError('INVALID_DATA', 'search result identity or currency invalid');
      boundedSet(searchCache, key, { identity, data, expiresAt: timestampOf(now) + INVESTMENT_SEARCH_CACHE_MS });
      failures.delete(key);
      return data;
    } catch (error) {
      if (error.code === 'AUTH_REQUIRED') { clearIdentity(identity); throw error; }
      if (error.code === 'REQUEST_SUPERSEDED') throw error;
      await authenticatedSession(identity, getSession);
      assertRequestCurrent(identity, requestGeneration, epoch);
      boundedSet(failures, key, { identity, error, retryAt: timestampOf(now) + INVESTMENT_COMPARISON_FAILURE_RETRY_MS });
      throw error;
    }
  })().finally(() => { if (inFlight.get(key)?.promise === promise) inFlight.delete(key); });
  inFlight.set(key, { identity, promise });
  return forCaller(promise, caller);
}

export function resetInvestmentComparisonMemoryCache() {
  generation += 1;
  for (const map of [successCache, searchCache, failures, inFlight, identityEpochs]) map.clear();
}

export { normalizeInvestmentComparisonData };
