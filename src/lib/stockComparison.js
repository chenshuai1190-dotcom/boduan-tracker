import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';
import { investmentComparisonError, isInvestmentDate, normalizeInvestmentSymbol } from './investmentComparisonModel.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

export const STOCK_COMPARISON_CACHE_MS = 5 * 60 * 1000;
// Four cold instruments may need two 10-second identity waves and two
// 10-second history waves, plus authentication, below the 90-second API limit.
export const STOCK_COMPARISON_TIMEOUT_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 16;
const MAX_ROWS = 25000;
const successCache = new Map();
const identityEpochs = new Map();
const latestRequests = new Map();
let generation = 0;
let requestSequence = 0;

function timestampOf(now) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
    throw investmentComparisonError('INVALID_CLOCK', 'Unable to determine the completed market session.');
  }
  return timestamp;
}

function requestAborted() {
  const error = investmentComparisonError('REQUEST_ABORTED', 'Stock comparison request cancelled.');
  error.name = 'AbortError';
  return error;
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw requestAborted();
}

function clearIdentity(identity) {
  for (const [key, entry] of successCache) if (entry.identity === identity) successCache.delete(key);
  identityEpochs.set(identity, (identityEpochs.get(identity) || 0) + 1);
}

async function defaultGetSession() {
  const { supabase } = await import('./supabase.js');
  if (!supabase) throw investmentComparisonError('AUTH_REQUIRED', 'Please sign in to load stock history.');
  return supabase.auth.getSession();
}

async function authenticatedSession(identity, getSession) {
  try {
    const result = await getSession();
    const session = result?.data?.session;
    if (result?.error || typeof session?.access_token !== 'string' || !session.access_token.trim() || session.user?.id !== identity) throw new Error('identity mismatch');
    return session;
  } catch {
    clearIdentity(identity);
    throw investmentComparisonError('AUTH_REQUIRED', 'Please sign in with the current account to load stock history.');
  }
}

function assertRequestCurrent(identity, requestGeneration, epoch, signal) {
  assertNotAborted(signal);
  if (generation !== requestGeneration) throw investmentComparisonError('REQUEST_SUPERSEDED', 'Stock comparison data was reset.');
  if ((identityEpochs.get(identity) || 0) !== epoch) throw investmentComparisonError('AUTH_REQUIRED', 'The active account changed. Please reload stock history.');
}

function normalizedSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length < 2 || symbols.length > 4) throw investmentComparisonError('INVALID_SYMBOLS', 'Choose two to four different US stocks or ETFs.');
  const selected = symbols.map(normalizeInvestmentSymbol);
  if (selected.some(symbol => !symbol) || new Set(selected).size !== selected.length) throw investmentComparisonError('INVALID_SYMBOLS', 'Choose two to four different US stocks or ETFs.');
  return selected;
}

function tradingDate(date) {
  return isInvestmentDate(date) && ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !isRegularNyseHoliday(date);
}

// Prices use split-adjusted close; historical RSI has its own explicit
// adjusted-close basis. Never infer either basis, coerce numeric strings, fill
// missing sessions or borrow a latest RSI for a historical date.
export function normalizeStockComparisonData(value, { symbols, startDate, endDate, expectedAsOfDate, now }) {
  if (!value || value.version !== 1 || value.source !== 'EODHD_EOD_SPLITS'
    || value.priceBasis !== 'split_adjusted_close' || value.currency !== 'USD'
    || value.requestedStartDate !== startDate || value.requestedEndDate !== endDate
    || value.expectedAsOfDate !== expectedAsOfDate || value.splitBasisDate !== expectedAsOfDate
    || !tradingDate(value.asOfDate) || value.asOfDate < startDate || value.asOfDate > endDate
    || !Array.isArray(value.symbols) || value.symbols.length !== symbols.length
    || new Set(value.symbols).size !== symbols.length || !symbols.every(symbol => value.symbols.includes(symbol))
    || !value.series || typeof value.series !== 'object' || Array.isArray(value.series)
    || Object.keys(value.series).length !== symbols.length || !symbols.every(symbol => Object.hasOwn(value.series, symbol))
    || typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt))
    || Date.parse(value.fetchedAt) > now + 300000) return null;
  const series = {};
  for (const symbol of symbols) {
    const input = value.series[symbol];
    if (!input || input.symbol !== symbol || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 300
      || !['ETF', 'Common Stock'].includes(input.type) || !Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > MAX_ROWS
      || (input.priceBasis !== undefined && input.priceBasis !== 'split_adjusted_close')
      || (input.currency !== undefined && input.currency !== 'USD')) return null;
    const hasRsiBasis = input.rsiPeriod === 6 && input.rsiPriceBasis === 'adjusted_close';
    const invalidRsiBasis = (input.rsiPeriod != null && input.rsiPeriod !== 6)
      || (input.rsiPriceBasis != null && input.rsiPriceBasis !== 'adjusted_close');
    let previousDate = '';
    const rows = [];
    for (const row of input.rows) {
      if (!tradingDate(row?.date) || row.date <= previousDate || row.date < startDate || row.date > endDate
        || typeof row.close !== 'number' || !Number.isFinite(row.close) || row.close <= 0) return null;
      if (row.rsi6 != null && (typeof row.rsi6 !== 'number' || !Number.isFinite(row.rsi6) || row.rsi6 < 0 || row.rsi6 > 100 || invalidRsiBasis)) return null;
      const rsi6 = hasRsiBasis && row.rsi6 != null ? row.rsi6 : null;
      rows.push(Object.freeze({ date: row.date, close: row.close, rsi6 }));
      previousDate = row.date;
    }
    series[symbol] = Object.freeze({ symbol, name: input.name.trim(), type: input.type,
      ...(hasRsiBasis ? { rsiPeriod: 6, rsiPriceBasis: 'adjusted_close' } : {}), rows: Object.freeze(rows) });
  }
  // Series may have genuine gaps or differing last observations. The page
  // model chooses observed shared dates instead of inventing a matching close.
  if (symbols.map(symbol => series[symbol].rows.at(-1).date).sort()[0] !== value.asOfDate) return null;
  return Object.freeze({ version: 1, source: 'EODHD_EOD_SPLITS', priceBasis: 'split_adjusted_close', currency: 'USD',
    symbols: Object.freeze([...symbols]), requestedStartDate: startDate, requestedEndDate: endDate,
    expectedAsOfDate, asOfDate: value.asOfDate, splitBasisDate: expectedAsOfDate,
    fetchedAt: value.fetchedAt, series: Object.freeze(series) });
}

async function requestJson({ url, token, fetchImpl, timeoutMs, signal }) {
  const controller = new AbortController();
  let timer, onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => { controller.abort(); reject(requestAborted()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    timer = setTimeout(() => {
      controller.abort();
      reject(investmentComparisonError('NETWORK_ERROR', 'Stock history request timed out. Please retry.'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([stopped, (async () => {
      let response;
      try { response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal }); }
      catch { throw investmentComparisonError('NETWORK_ERROR', 'Stock history is temporarily unavailable. Please retry.'); }
      if ([401, 403].includes(response?.status)) throw investmentComparisonError('AUTH_REQUIRED', 'Please sign in again to load stock history.');
      let body;
      try { body = await response.json(); } catch { body = null; }
      if (!response?.ok) {
        const known = ['INVALID_PARAMETERS', 'INVALID_SYMBOLS', 'INVALID_DATES', 'INVALID_RANGE', 'INVALID_QUERY', 'UNSUPPORTED_INSTRUMENT', 'INSUFFICIENT_HISTORY', 'NO_DATA', 'INVALID_DATA', 'NOT_CONFIGURED', 'PROVIDER_UNAVAILABLE', 'QUOTA_EXHAUSTED'];
        const code = known.includes(body?.details?.code) ? body.details.code
          : response?.status === 429 ? 'RATE_LIMITED' : response?.status >= 500 ? 'NETWORK_ERROR' : 'REQUEST_ERROR';
        throw investmentComparisonError(code, 'Stock history could not be loaded. Please retry or adjust the selection.');
      }
      if (!body || body.success !== true) throw investmentComparisonError('INVALID_DATA', 'Stock history response is incomplete. Please retry.');
      return body.data;
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function loadStockComparison({ userId, symbols = ['QQQ', 'TQQQ'], startDate, endDate, force = false, signal,
  getSession = defaultGetSession, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = STOCK_COMPARISON_TIMEOUT_MS } = {}) {
  const identity = typeof userId === 'string' ? userId.trim() : '';
  if (!identity) throw investmentComparisonError('AUTH_REQUIRED', 'Please sign in to load stock history.');
  const selected = normalizedSymbols(symbols);
  assertNotAborted(signal);
  const session = await authenticatedSession(identity, getSession);
  assertNotAborted(signal);
  const timestamp = timestampOf(now);
  const expectedAsOfDate = getInvestmentComparisonExpectedCloseDate(timestamp);
  if (!isInvestmentDate(startDate) || !isInvestmentDate(endDate) || startDate < '2000-01-01' || startDate > endDate || endDate > expectedAsOfDate) {
    throw investmentComparisonError('INVALID_RANGE', 'Choose dates within completed market history, starting in 2000 or later.');
  }
  const key = JSON.stringify([identity, selected, startDate, endDate, expectedAsOfDate]);
  const requestGeneration = generation, epoch = identityEpochs.get(identity) || 0;
  const cached = successCache.get(key);
  if (!force && cached?.expiresAt > timestamp) {
    await authenticatedSession(identity, getSession);
    assertRequestCurrent(identity, requestGeneration, epoch, signal);
    if (getInvestmentComparisonExpectedCloseDate(timestampOf(now)) !== expectedAsOfDate) throw investmentComparisonError('REQUEST_SUPERSEDED', 'A new market session is available. Please reload stock history.');
    return cached.data;
  }
  if (typeof fetchImpl !== 'function') throw investmentComparisonError('NETWORK_ERROR', 'Stock history is temporarily unavailable.');
  const requestId = ++requestSequence;
  latestRequests.set(key, requestId);
  try {
    const query = new URLSearchParams({ view: 'stock-comparison', symbols: selected.join(','), from: startDate, to: endDate });
    const value = await requestJson({ url: `/api/quote?${query}`, token: session.access_token, fetchImpl,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : STOCK_COMPARISON_TIMEOUT_MS, signal });
    await authenticatedSession(identity, getSession);
    assertRequestCurrent(identity, requestGeneration, epoch, signal);
    const completedAt = timestampOf(now);
    const currentExpectedDate = getInvestmentComparisonExpectedCloseDate(completedAt);
    const data = normalizeStockComparisonData(value, { symbols: selected, startDate, endDate, expectedAsOfDate: currentExpectedDate, now: completedAt });
    if (!data) throw investmentComparisonError('INVALID_DATA', 'Complete split-adjusted history for the requested dates is required.');
    if (currentExpectedDate !== expectedAsOfDate) throw investmentComparisonError('REQUEST_SUPERSEDED', 'A new market session is available. Please reload stock history.');
    if (latestRequests.get(key) === requestId) {
      successCache.delete(key);
      successCache.set(key, { identity, data, expiresAt: completedAt + STOCK_COMPARISON_CACHE_MS });
      while (successCache.size > MAX_CACHE_ENTRIES) successCache.delete(successCache.keys().next().value);
    }
    return data;
  } catch (error) {
    if (error?.code === 'AUTH_REQUIRED') clearIdentity(identity);
    assertNotAborted(signal);
    if (!['REQUEST_SUPERSEDED', 'AUTH_REQUIRED'].includes(error?.code)) await authenticatedSession(identity, getSession);
    assertRequestCurrent(identity, requestGeneration, epoch, signal);
    if (latestRequests.get(key) === requestId) successCache.delete(key);
    throw error;
  } finally {
    if (latestRequests.get(key) === requestId) latestRequests.delete(key);
  }
}

export function resetStockComparisonCache() {
  generation += 1;
  successCache.clear();
  identityEpochs.clear();
  latestRequests.clear();
}
