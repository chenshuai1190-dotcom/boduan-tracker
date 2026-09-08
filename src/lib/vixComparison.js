import { latestCompletedUsTradingDate } from './pnlReportSnapshots.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

export const VIX_COMPARISON_STALE_RETRY_MS = 5 * 60 * 1000;
export const VIX_COMPARISON_FAILURE_RETRY_MS = 60 * 1000;
export const VIX_COMPARISON_TIMEOUT_MS = 20 * 1000;

const MAX_CACHE_USERS = 8;
const successCache = new Map();
const failedRequests = new Map();
const inFlightRequests = new Map();
const SERIES_CONTRACT = Object.freeze({
  VIX: { priceBasis: 'close', unit: 'points' },
  SPY: { priceBasis: 'adjusted_close', unit: 'USD' },
  QQQ: { priceBasis: 'adjusted_close', unit: 'USD' },
});

function currentTime(now) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
    throw new Error('invalid comparison clock');
  }
  return timestamp;
}

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getVixComparisonExpectedCloseDate(now = Date.now()) {
  let cursor = latestCompletedUsTradingDate(new Date(currentTime(now)));
  while (true) {
    const date = new Date(`${cursor}T00:00:00Z`);
    if (![0, 6].includes(date.getUTCDay()) && !isRegularNyseHoliday(cursor)) return cursor;
    date.setUTCDate(date.getUTCDate() - 1);
    cursor = date.toISOString().slice(0, 10);
  }
}

function comparisonError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function setBounded(map, key, value) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_CACHE_USERS) map.delete(map.keys().next().value);
}

// The wire contract is deliberately strict: never chart malformed, future,
// differently dated, or partially populated series as a valid comparison.
export function normalizeVixComparison(value, { now = Date.now } = {}) {
  const timestamp = currentTime(now);
  const expectedCloseDate = getVixComparisonExpectedCloseDate(timestamp);
  if (!value || value.version !== 1 || value.source !== 'EODHD_EOD'
    || !validDateKey(value.expectedAsOfDate) || value.expectedAsOfDate > expectedCloseDate
    || !validDateKey(value.asOfDate) || value.asOfDate > value.expectedAsOfDate
    || !validDateKey(value.availableFromDate)
    || !Number.isInteger(value.pointCount) || value.pointCount < 2
    || typeof value.stale !== 'boolean'
    || !['', 'incomplete_close', 'provider_unavailable'].includes(value.staleReason)
    || typeof value.fetchedAt !== 'string'
    || !Number.isFinite(Date.parse(value.fetchedAt))
    || Date.parse(value.fetchedAt) > timestamp + 5 * 60 * 1000) return null;

  const series = {};
  let commonDates;
  for (const [symbol, contract] of Object.entries(SERIES_CONTRACT)) {
    const input = value.series?.[symbol];
    if (!input || input.symbol !== symbol || input.priceBasis !== contract.priceBasis
      || input.unit !== contract.unit || !Array.isArray(input.rows)
      || input.rows.length !== value.pointCount) return null;
    const rows = [];
    let previousDate = '';
    for (const [index, row] of input.rows.entries()) {
      if (!validDateKey(row?.date) || row.date <= previousDate || row.date > value.asOfDate
        || typeof row.close !== 'number' || !Number.isFinite(row.close) || row.close <= 0
        || (commonDates && commonDates[index] !== row.date)) return null;
      rows.push({ date: row.date, close: row.close });
      previousDate = row.date;
    }
    if (rows[0].date !== value.availableFromDate || rows.at(-1).date !== value.asOfDate) return null;
    commonDates ||= rows.map((row) => row.date);
    series[symbol] = { symbol, ...contract, rows };
  }

  const stale = value.stale || value.asOfDate < expectedCloseDate;
  return {
    version: 1,
    source: 'EODHD_EOD',
    fetchedAt: value.fetchedAt,
    expectedAsOfDate: expectedCloseDate,
    asOfDate: value.asOfDate,
    availableFromDate: value.availableFromDate,
    pointCount: value.pointCount,
    stale,
    staleReason: stale ? String(value.staleReason || 'incomplete_close') : '',
    series,
  };
}

async function defaultGetSession() {
  // Keep the pure contract/cache helpers importable by Node tests without
  // evaluating Vite-only configuration or initializing an auth client.
  const { supabase } = await import('./supabase.js');
  if (!supabase) throw comparisonError('AUTH_REQUIRED', 'authenticated session required');
  return supabase.auth.getSession();
}

async function authenticatedSession(userId, getSession) {
  let result;
  try {
    result = await getSession();
  } catch {
    throw comparisonError('AUTH_REQUIRED', 'authenticated session unavailable');
  }
  const session = result?.data?.session;
  if (result?.error || !session?.access_token || session.user?.id !== userId) {
    throw comparisonError('AUTH_REQUIRED', 'authenticated user does not match comparison request');
  }
  return session;
}

async function requestComparison({ fetchImpl, token, timeoutMs }) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        let response;
        try {
          response = await fetchImpl('/api/quote?view=vix-comparison', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
            signal: controller.signal,
          });
        } catch {
          throw comparisonError('NETWORK_ERROR', 'comparison request unavailable');
        }
        if (response.status === 401 || response.status === 403) {
          throw comparisonError('AUTH_REQUIRED', 'comparison authorization failed');
        }
        if (!response.ok) {
          throw comparisonError(response.status >= 500 || response.status === 429 ? 'NETWORK_ERROR' : 'REQUEST_ERROR', 'comparison request failed');
        }
        const body = await response.json().catch(() => null);
        if (!body || body.success !== true) throw comparisonError('INVALID_DATA', 'comparison response invalid');
        return body.data;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(comparisonError('NETWORK_ERROR', 'comparison request timed out'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function staleFallback(data, expectedAsOfDate) {
  return { ...data, expectedAsOfDate, stale: true, staleReason: 'provider_unavailable' };
}

export async function loadVixComparison({
  userId,
  force = false,
  fetchImpl = globalThis.fetch,
  getSession = defaultGetSession,
  now = Date.now,
  timeoutMs = VIX_COMPARISON_TIMEOUT_MS,
} = {}) {
  const identity = typeof userId === 'string' ? userId.trim() : '';
  if (!identity) throw comparisonError('AUTH_REQUIRED', 'authenticated user required');

  // Validate identity even for an otherwise valid cache hit. A token belonging
  // to a newly switched account must never populate or unlock the old key.
  let session;
  try {
    session = await authenticatedSession(identity, getSession);
  } catch (error) {
    successCache.delete(identity);
    failedRequests.delete(identity);
    throw error;
  }
  const timestamp = currentTime(now);
  const expectedCloseDate = getVixComparisonExpectedCloseDate(timestamp);
  const requestKey = `${identity}:${expectedCloseDate}`;
  if (inFlightRequests.has(requestKey)) return inFlightRequests.get(requestKey);

  const cached = successCache.get(identity);
  const failure = failedRequests.get(identity);
  if (!force && failure?.expectedCloseDate === expectedCloseDate && failure.retryAt > timestamp) {
    if (cached) return staleFallback(cached.data, expectedCloseDate);
    throw failure.error;
  }
  if (!force && failure?.expectedCloseDate !== expectedCloseDate && cached?.expectedCloseDate === expectedCloseDate
    && (!cached.data.stale || cached.retryAt > timestamp)) return cached.data;
  if (typeof fetchImpl !== 'function') throw comparisonError('NETWORK_ERROR', 'fetch unavailable');

  let requestPromise;
  requestPromise = (async () => {
    try {
      const value = await requestComparison({ fetchImpl, token: session.access_token, timeoutMs });
      await authenticatedSession(identity, getSession);
      let data = normalizeVixComparison(value, { now });
      if (!data) throw comparisonError('INVALID_DATA', 'comparison response invalid');
      const previousSuccess = successCache.get(identity);
      if (previousSuccess && previousSuccess.data.asOfDate > data.asOfDate) {
        data = {
          ...previousSuccess.data,
          expectedAsOfDate: data.expectedAsOfDate,
          stale: true,
          staleReason: data.staleReason || 'incomplete_close',
        };
      }
      setBounded(successCache, identity, {
        data,
        expectedCloseDate: data.expectedAsOfDate,
        retryAt: currentTime(now) + VIX_COMPARISON_STALE_RETRY_MS,
      });
      failedRequests.delete(identity);
      return data;
    } catch (error) {
      if (error.code === 'AUTH_REQUIRED') {
        successCache.delete(identity);
        failedRequests.delete(identity);
        throw error;
      }
      if (error.code !== 'NETWORK_ERROR') throw error;
      // The account can also change while the network request is failing.
      try {
        await authenticatedSession(identity, getSession);
      } catch (authError) {
        successCache.delete(identity);
        failedRequests.delete(identity);
        throw authError;
      }
      setBounded(failedRequests, identity, {
        expectedCloseDate,
        retryAt: currentTime(now) + VIX_COMPARISON_FAILURE_RETRY_MS,
        error,
      });
      const lastSuccess = successCache.get(identity);
      if (lastSuccess) return staleFallback(lastSuccess.data, expectedCloseDate);
      throw error;
    }
  })().finally(() => {
    if (inFlightRequests.get(requestKey) === requestPromise) inFlightRequests.delete(requestKey);
  });
  inFlightRequests.set(requestKey, requestPromise);
  return requestPromise;
}

export function resetVixComparisonMemoryCache() {
  successCache.clear();
  failedRequests.clear();
  inFlightRequests.clear();
}
