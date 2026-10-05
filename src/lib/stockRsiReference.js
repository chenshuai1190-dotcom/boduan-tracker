import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';
import { hasStockRsiValue, validStockRsiDate } from './stockRsiSignal.js';
import { normalizeStrictUserStockSymbol } from './symbols.js';
import { normalizeRsiReferenceObservation } from './rsiReferenceObservation.js';
import { deriveStockTradeMarketReference } from './stockTradeMarketReference.js';

const failure = code => Object.assign(new Error(code), { code });
const unavailable = reason => ({ status: 'unavailable', observation: null, reason });

// Match the formal date input's localDateKey, rather than implicitly converting
// the user's date-only entry to a New York or UTC timestamp.
export function stockRsiLocalDateKey(now = Date.now()) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function stockRsiTradeDateReason(tradeDate, now = Date.now()) {
  if (!validStockRsiDate(tradeDate) || !stockRsiLocalDateKey(now)) return 'invalid-date';
  const today = stockRsiLocalDateKey(now);
  if (tradeDate > today) return 'invalid-date';
  if (tradeDate < today || tradeDate <= getInvestmentComparisonExpectedCloseDate(now)) return 'historical-unavailable';
  return '';
}

export function normalizeStockRsiQuote(quote, { symbol, tradeDate, now = Date.now() } = {}) {
  const selectedSymbol = normalizeStrictUserStockSymbol(symbol);
  const dateReason = stockRsiTradeDateReason(tradeDate, now);
  if (dateReason) return unavailable(dateReason);
  const signal = quote?.stockRsi;
  if (!selectedSymbol || quote?.symbol !== selectedSymbol || quote.error || !hasStockRsiValue(signal)) return unavailable('data-unavailable');
  // A valid recent quote price is not evidence that its RSI close is current.
  // Completed EOD values remain valid throughout the same completed session.
  if (signal.asOf !== getInvestmentComparisonExpectedCloseDate(now) || quote.stale === true) return unavailable('stale-data');
  if (signal.asOf >= tradeDate) return unavailable('historical-unavailable');
  const { value, asOf, previousValue, previousAsOf } = normalizeRsiReferenceObservation(signal);
  return { status: 'ready', reason: '', observation: { value, asOf, previousValue, previousAsOf } };
}

// RSI completeness alone does not establish that the same cached row contains
// the provider's 52-week high and the session-appropriate reference price.
export function canReuseStockRsiReference(quote, { requireMarketReference = false, ...options } = {}) {
  return normalizeStockRsiQuote(quote, options).status === 'ready'
    && (!requireMarketReference || deriveStockTradeMarketReference({ symbol: options.symbol, quote }).stockReady);
}

async function sessionFor(userId, getSession, signal) {
  if (signal?.aborted) throw failure('REQUEST_ABORTED');
  if (!userId || typeof getSession !== 'function') throw failure('AUTH_REQUIRED');
  let result;
  try { result = await getSession(); } catch { throw failure('AUTH_REQUIRED'); }
  if (signal?.aborted) throw failure('REQUEST_ABORTED');
  const session = result?.data?.session;
  if (result?.error || session?.user?.id !== userId
    || typeof session?.access_token !== 'string' || !session.access_token.trim()) throw failure('AUTH_REQUIRED');
  return session;
}

// One modal-scoped request, using the existing authenticated ordinary-quote
// endpoint. No global cache, watchlist mutation, retry loop, or polling.
export async function loadStockRsiReference({ symbol, userId, getSession, quote, tradeDate, signal,
  requireMarketReference = false, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 20000 } = {}) {
  const selectedSymbol = normalizeStrictUserStockSymbol(symbol);
  if (!selectedSymbol) return unavailable('data-unavailable');
  const readNow = () => typeof now === 'function' ? now() : now;
  const dateReason = stockRsiTradeDateReason(tradeDate, readNow());
  if (dateReason) return unavailable(dateReason);
  const session = await sessionFor(userId, getSession, signal);
  const existingQuote = typeof quote === 'function' ? quote() : quote;
  const reused = normalizeStockRsiQuote(existingQuote, { symbol: selectedSymbol, tradeDate, now: readNow() });
  if (canReuseStockRsiReference(existingQuote, { symbol: selectedSymbol, tradeDate, now: readNow(), requireMarketReference })) {
    return { ...reused, quote: existingQuote };
  }

  const controller = new AbortController();
  let timer;
  let rejectCancellation;
  const cancel = () => { controller.abort(); rejectCancellation?.(failure('REQUEST_ABORTED')); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const pending = (async () => {
      if (signal?.aborted) throw failure('REQUEST_ABORTED');
      const response = await fetchImpl(`/api/quote?symbols=${encodeURIComponent(selectedSymbol)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store', signal: controller.signal,
      });
      if ([401, 403].includes(response.status)) throw failure('AUTH_REQUIRED');
      const body = await response.json().catch(() => null);
      if (!response.ok) throw failure('NETWORK_ERROR');
      const currentSession = await sessionFor(userId, getSession, signal);
      if (currentSession.access_token !== session.access_token) throw failure('AUTH_REQUIRED');
      if (body?.success !== true || !Array.isArray(body.data)) return unavailable('data-unavailable');
      const row = body.data.find(item => item?.symbol === selectedSymbol);
      return { ...normalizeStockRsiQuote(row, { symbol: selectedSymbol, tradeDate, now: readNow() }), quote: row || null };
    })();
    return await Promise.race([
      pending,
      new Promise((_, reject) => {
        rejectCancellation = reject;
        timer = setTimeout(() => { controller.abort(); reject(failure('NETWORK_ERROR')); }, timeoutMs);
        if (signal?.aborted) cancel();
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
