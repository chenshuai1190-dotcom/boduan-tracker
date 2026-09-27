import { getVixComparisonExpectedCloseDate as expectedCloseDate, isVixComparisonSession } from './vixComparisonSession.js';

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

export function getVixComparisonExpectedCloseDate(now = Date.now()) {
  return expectedCloseDate(currentTime(now));
}

function normalizeTermStructure(input, { expectedDate, wireExpectedDate, timestamp, vixRows }) {
  if (!input || input.source !== 'CBOE' || input.expectedAsOfDate !== wireExpectedDate
    || !Array.isArray(input.rows) || input.rows.length > 2000
    || typeof input.stale !== 'boolean'
    || !['', 'incomplete_close', 'provider_unavailable'].includes(input.staleReason)
    || typeof input.fetchedAt !== 'string' || !Number.isFinite(Date.parse(input.fetchedAt))
    || Date.parse(input.fetchedAt) > timestamp + 5 * 60 * 1000) return null;
  const vixByDate = new Map(vixRows.map(row => [row.date, row.close]));
  const rows = [];
  let previousDate = '';
  for (const row of input.rows) {
    if (!isVixComparisonSession(row?.date) || row.date <= previousDate || row.date > wireExpectedDate
      || !['vix', 'vix3m', 'ratio'].every(key => typeof row[key] === 'number' && Number.isFinite(row[key]) && row[key] > 0)
      || Math.abs(row.ratio - row.vix / row.vix3m) > 1e-8
      || (vixByDate.has(row.date) && Math.abs(vixByDate.get(row.date) - row.vix) > 1e-8)) return null;
    rows.push({ date: row.date, vix: row.vix, vix3m: row.vix3m, ratio: row.ratio });
    previousDate = row.date;
  }
  if (input.asOfDate !== (rows.at(-1)?.date || null) || (!rows.length && !input.stale)) return null;
  const stale = input.stale || input.asOfDate !== expectedDate;
  return {
    source: 'CBOE',
    asOfDate: input.asOfDate,
    expectedAsOfDate: expectedDate,
    fetchedAt: input.fetchedAt,
    stale,
    staleReason: stale ? input.staleReason || 'incomplete_close' : '',
    rows,
  };
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
  if (!value || value.version !== 2 || value.source !== 'CBOE_EODHD_EOD'
    || !isVixComparisonSession(value.expectedAsOfDate) || value.expectedAsOfDate > expectedCloseDate
    || !isVixComparisonSession(value.asOfDate) || value.asOfDate > value.expectedAsOfDate
    || !isVixComparisonSession(value.availableFromDate)
    || !Number.isInteger(value.pointCount) || value.pointCount < 2 || value.pointCount > 2000
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
      if (!isVixComparisonSession(row?.date) || row.date <= previousDate || row.date > value.asOfDate
        || typeof row.close !== 'number' || !Number.isFinite(row.close) || row.close <= 0
        || (commonDates && commonDates[index] !== row.date)) return null;
      rows.push({ date: row.date, close: row.close });
      previousDate = row.date;
    }
    if (rows[0].date !== value.availableFromDate || rows.at(-1).date !== value.asOfDate) return null;
    commonDates ||= rows.map((row) => row.date);
    series[symbol] = { symbol, ...contract, rows };
  }

  const termStructure = normalizeTermStructure(value.termStructure, {
    expectedDate: expectedCloseDate, wireExpectedDate: value.expectedAsOfDate, timestamp, vixRows: series.VIX.rows,
  });
  if (!termStructure) return null;

  const stale = value.stale || value.asOfDate < expectedCloseDate;
  return {
    version: 2,
    source: 'CBOE_EODHD_EOD',
    fetchedAt: value.fetchedAt,
    expectedAsOfDate: expectedCloseDate,
    asOfDate: value.asOfDate,
    availableFromDate: value.availableFromDate,
    pointCount: value.pointCount,
    stale,
    staleReason: stale ? String(value.staleReason || 'incomplete_close') : '',
    series,
    termStructure,
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
  return {
    ...data, expectedAsOfDate, stale: true, staleReason: 'provider_unavailable',
    termStructure: { ...data.termStructure, expectedAsOfDate, stale: true, staleReason: 'provider_unavailable' },
  };
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
    && ((!cached.data.stale && !cached.data.termStructure.stale) || cached.retryAt > timestamp)) return cached.data;
  if (typeof fetchImpl !== 'function') throw comparisonError('NETWORK_ERROR', 'fetch unavailable');

  let requestPromise;
  requestPromise = (async () => {
    try {
      const value = await requestComparison({ fetchImpl, token: session.access_token, timeoutMs });
      await authenticatedSession(identity, getSession);
      let data = normalizeVixComparison(value, { now });
      if (!data) throw comparisonError('INVALID_DATA', 'comparison response invalid');
      const previousSuccess = successCache.get(identity);
      let mergedCachedData = false;
      if (previousSuccess && previousSuccess.data.asOfDate > data.asOfDate) {
        data = {
          ...previousSuccess.data,
          expectedAsOfDate: data.expectedAsOfDate,
          stale: true,
          staleReason: data.staleReason || 'incomplete_close',
          // Prices and term closes advance independently. Keep this response's
          // term observations while selecting the newer price history.
          termStructure: data.termStructure,
        };
        mergedCachedData = true;
      }
      if (previousSuccess?.data.termStructure.asOfDate
        && previousSuccess.data.termStructure.asOfDate > (data.termStructure.asOfDate || '')) {
        data = {
          ...data,
          termStructure: {
            ...previousSuccess.data.termStructure, expectedAsOfDate: data.expectedAsOfDate,
            stale: true, staleReason: data.termStructure.staleReason || 'incomplete_close',
          },
        };
        mergedCachedData = true;
      }
      if (mergedCachedData) {
        // Both envelopes were valid separately; mixing their independently
        // selected sources still requires agreement on every shared VIX close.
        const termStructure = normalizeTermStructure(data.termStructure, {
          expectedDate: data.expectedAsOfDate, wireExpectedDate: data.expectedAsOfDate,
          timestamp: currentTime(now), vixRows: data.series.VIX.rows,
        });
        if (!termStructure) throw comparisonError('INVALID_DATA', 'comparison sources disagree');
        data = { ...data, termStructure };
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
