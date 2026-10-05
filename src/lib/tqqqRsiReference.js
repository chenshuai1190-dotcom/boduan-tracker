import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';
import { hasStockRsiValue, validStockRsiDate } from './stockRsiSignal.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

const failure = code => Object.assign(new Error(code), { code });
const unavailable = reason => ({ status: 'unavailable', observation: null, reason });
const validRsi = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

// Match the formal date input's localDateKey, rather than implicitly converting
// the user's date-only entry to a New York or UTC timestamp.
export function tqqqRsiLocalDateKey(now = Date.now()) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function tqqqRsiTradeDateReason(tradeDate, now = Date.now()) {
  if (!validStockRsiDate(tradeDate) || !tqqqRsiLocalDateKey(now)) return 'invalid-date';
  const today = tqqqRsiLocalDateKey(now);
  if (tradeDate > today) return 'invalid-date';
  if (tradeDate < today || tradeDate <= getInvestmentComparisonExpectedCloseDate(now)) return 'historical-unavailable';
  return '';
}

function previousRegularSession(asOf) {
  const cursor = new Date(`${asOf}T00:00:00Z`);
  do {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } while ([0, 6].includes(cursor.getUTCDay()) || isRegularNyseHoliday(cursor.toISOString().slice(0, 10)));
  return cursor.toISOString().slice(0, 10);
}

export function normalizeTqqqRsiQuote(quote, { tradeDate, now = Date.now() } = {}) {
  const dateReason = tqqqRsiTradeDateReason(tradeDate, now);
  if (dateReason) return unavailable(dateReason);
  const signal = quote?.stockRsi;
  if (quote?.symbol !== 'TQQQ' || quote.error || !hasStockRsiValue(signal)) return unavailable('data-unavailable');
  // A valid recent quote price is not evidence that its RSI close is current.
  // Completed EOD values remain valid throughout the same completed session.
  if (signal.asOf !== getInvestmentComparisonExpectedCloseDate(now) || quote.stale === true) return unavailable('stale-data');
  if (signal.asOf >= tradeDate) return unavailable('historical-unavailable');
  const hasPrevious = validRsi(signal.previousValue)
    && validStockRsiDate(signal.previousAsOf)
    && signal.previousAsOf === previousRegularSession(signal.asOf);
  return {
    status: 'ready', reason: '',
    observation: {
      value: signal.value, asOf: signal.asOf,
      previousValue: hasPrevious ? signal.previousValue : null,
      previousAsOf: hasPrevious ? signal.previousAsOf : null,
    },
  };
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
export async function loadTqqqRsiReference({ userId, getSession, quote, tradeDate, signal,
  fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 20000 } = {}) {
  const readNow = () => typeof now === 'function' ? now() : now;
  const dateReason = tqqqRsiTradeDateReason(tradeDate, readNow());
  if (dateReason) return unavailable(dateReason);
  const session = await sessionFor(userId, getSession, signal);
  const existingQuote = typeof quote === 'function' ? quote() : quote;
  const reused = normalizeTqqqRsiQuote(existingQuote, { tradeDate, now: readNow() });
  if (reused.status === 'ready') return { ...reused, quote: existingQuote };

  const controller = new AbortController();
  let timer;
  let rejectCancellation;
  const cancel = () => { controller.abort(); rejectCancellation?.(failure('REQUEST_ABORTED')); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const pending = (async () => {
      if (signal?.aborted) throw failure('REQUEST_ABORTED');
      const response = await fetchImpl('/api/quote?symbols=TQQQ', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store', signal: controller.signal,
      });
      if ([401, 403].includes(response.status)) throw failure('AUTH_REQUIRED');
      const body = await response.json().catch(() => null);
      if (!response.ok) throw failure('NETWORK_ERROR');
      const currentSession = await sessionFor(userId, getSession, signal);
      if (currentSession.access_token !== session.access_token) throw failure('AUTH_REQUIRED');
      if (body?.success !== true || !Array.isArray(body.data)) return unavailable('data-unavailable');
      const row = body.data.find(item => item?.symbol === 'TQQQ');
      return { ...normalizeTqqqRsiQuote(row, { tradeDate, now: readNow() }), quote: row || null };
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
