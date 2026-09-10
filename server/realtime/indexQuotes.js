import { sanitizeEodhdKey } from './btc.js';

export const INDEX_QUOTE_CARDS = Object.freeze([
  Object.freeze({ ticker: 'GSPC.INDX', displaySymbol: '.SPX', name: '标普500', cn: '标普500' }),
  Object.freeze({ ticker: 'NDX.INDX', displaySymbol: '.NDX', name: '纳斯达克100', cn: '纳斯达克100' }),
  Object.freeze({ ticker: 'DJI.INDX', displaySymbol: '.DJI', name: '道琼斯', cn: '道琼斯' }),
]);
export const INDEX_QUOTE_TTL_MS = 60_000;
export const INDEX_QUOTE_FAILURE_BACKOFF_MS = 15_000;
export const INDEX_QUOTE_TIMEOUT_MS = 8_000;
export const INDEX_QUOTE_STALE_AFTER_MS = 30 * 60_000;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function indexQuoteTimestamp(value) {
  const numeric = numberOrNull(value);
  const timestamp = numeric !== null
    ? (numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : (typeof value === 'string' ? Date.parse(value) : NaN);
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= 8.64e15
    ? Math.round(timestamp)
    : null;
}

export function indexQuoteStatus(tick, now = Date.now()) {
  const timestamp = indexQuoteTimestamp(tick?.timestamp);
  return timestamp && timestamp <= now && now - timestamp <= INDEX_QUOTE_STALE_AFTER_MS
    ? 'delayed'
    : 'stale';
}

export function normalizeIndexRestQuote(rawQuote, card, { fetchedAt = Date.now() } = {}) {
  const raw = Array.isArray(rawQuote) ? rawQuote[0] : rawQuote;
  if (!raw || typeof raw !== 'object' || !INDEX_QUOTE_CARDS.some(item => item.ticker === card?.ticker)) return null;
  const suppliedTicker = String(raw.code || raw.ticker || '').trim().toUpperCase();
  if (suppliedTicker && suppliedTicker !== card.ticker) return null;
  const price = numberOrNull(raw.close ?? raw.price ?? raw.lastTradePrice ?? raw.last);
  if (price === null || price <= 0) return null;
  const previousClose = numberOrNull(raw.previousClose ?? raw.previousClosePrice ?? raw.prev_close);
  const change = numberOrNull(raw.change) ?? (previousClose > 0 ? price - previousClose : null);
  const changePercent = numberOrNull(raw.change_p ?? raw.changePercent)
    ?? (previousClose > 0 && change !== null ? (change / previousClose) * 100 : null);
  const timestamp = indexQuoteTimestamp(raw.timestamp ?? raw.t);
  if (timestamp !== null && timestamp > fetchedAt) return null;
  const tick = {
    type: 'index_tick',
    symbol: card.ticker,
    ...card,
    price,
    previousClose: previousClose > 0 ? previousClose : null,
    change,
    changePercent,
    dayHigh: numberOrNull(raw.high) ?? price,
    dayLow: numberOrNull(raw.low) ?? price,
    timestamp,
    quoteAt: timestamp ? new Date(timestamp).toISOString() : null,
    receivedAt: fetchedAt,
    fetchedAt: new Date(fetchedAt).toISOString(),
    source: 'EODHD_REST',
    realtime: false,
  };
  return Object.freeze({ ...tick, realtimeStatus: indexQuoteStatus(tick, fetchedAt) });
}

function quoteError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function fetchIndexRestQuote(card, {
  eodhdKey,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = INDEX_QUOTE_TIMEOUT_MS,
} = {}) {
  const key = sanitizeEodhdKey(eodhdKey);
  if (!key) throw quoteError(500, 'EODHD_API_KEY 未配置');
  const url = new URL(`https://eodhd.com/api/real-time/${card.ticker}`);
  url.searchParams.set('api_token', key);
  url.searchParams.set('fmt', 'json');
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(quoteError(504, 'EODHD 指数报价请求超时'));
    }, timeoutMs);
  });
  try {
    // Keep body reads inside the deadline; do not expose provider URLs/errors containing the key.
    const request = async () => {
      let response;
      try {
        response = await fetchImpl(url, {
          cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal,
        });
      } catch {
        throw quoteError(502, 'EODHD 指数报价请求失败');
      }
      if (!response?.ok) {
        const status = Number(response?.status) || 502;
        throw quoteError(status, `EODHD 指数报价 HTTP ${status}`);
      }
      let payload;
      try { payload = await response.json(); } catch {
        throw quoteError(502, 'EODHD 指数报价格式无效');
      }
      const providerStatus = numberOrNull(payload?.status_code ?? payload?.statusCode);
      if (providerStatus >= 400) throw quoteError(providerStatus, `EODHD 指数报价 HTTP ${providerStatus}`);
      const tick = normalizeIndexRestQuote(payload, card, { fetchedAt: now() });
      if (!tick) throw quoteError(502, 'EODHD 指数报价无有效数据');
      return tick;
    };
    return await Promise.race([request(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function nextUtcDay(now) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

/** One bounded cache shared by baseline quotes, HTTP snapshots, and legacy WS consumers. */
export function createIndexQuoteLoader({
  fetchQuote = fetchIndexRestQuote,
  now = () => Date.now(),
  ttlMs = INDEX_QUOTE_TTL_MS,
  failureBackoffMs = INDEX_QUOTE_FAILURE_BACKOFF_MS,
} = {}) {
  let current = null;

  const snapshot = (state) => {
    const at = now();
    const ticks = INDEX_QUOTE_CARDS.flatMap(card => {
      const cached = state.ticks.get(card.ticker);
      if (!cached) return [];
      const failure = state.errors.get(card.ticker);
      return [Object.freeze({
        ...cached,
        realtimeStatus: failure ? 'stale' : indexQuoteStatus(cached, at),
        ...(failure ? { fetchError: failure.error } : {}),
      })];
    });
    return {
      ticks,
      status: ticks.length === 0 ? 'unavailable' : (
        ticks.length < INDEX_QUOTE_CARDS.length || state.errors.size > 0 || ticks.some(tick => tick.realtimeStatus === 'stale')
          ? 'stale' : 'delayed'
      ),
      source: 'EODHD_REST',
      realtime: false,
      errors: [...state.errors.values()],
      quotaBlockedUntil: state.quotaBlockedUntil || null,
      receivedAt: at,
    };
  };

  return async function loadIndexQuotes({ eodhdKey, fetchImpl } = {}) {
    const key = sanitizeEodhdKey(eodhdKey);
    if (!current || current.key !== key) {
      current = { key, ticks: new Map(), errors: new Map(), nextAttemptAt: new Map(), quotaBlockedUntil: 0, inFlight: null };
    }
    const state = current;
    if (state.inFlight) return state.inFlight;
    const startedAt = now();
    if (startedAt < state.quotaBlockedUntil) return snapshot(state);
    state.quotaBlockedUntil = 0;
    const dueCards = INDEX_QUOTE_CARDS.filter(card => startedAt >= (state.nextAttemptAt.get(card.ticker) || 0));
    if (dueCards.length === 0) return snapshot(state);
    if (!key) {
      state.errors = new Map(INDEX_QUOTE_CARDS.map(card => [card.ticker, { ticker: card.ticker, statusCode: 500, error: 'EODHD_API_KEY 未配置' }]));
      for (const card of dueCards) state.nextAttemptAt.set(card.ticker, startedAt + failureBackoffMs);
      return snapshot(state);
    }

    const pending = Promise.allSettled(dueCards.map(card => (
      Promise.resolve().then(() => fetchQuote(card, { eodhdKey: key, fetchImpl, now }))
    ))).then(results => {
      results.forEach((result, index) => {
        const card = dueCards[index];
        if (result.status === 'rejected') {
          const statusCode = Number(result.reason?.statusCode) || 502;
          state.errors.set(card.ticker, { ticker: card.ticker, statusCode, error: `EODHD 指数报价 HTTP ${statusCode}` });
          if (statusCode === 402) state.quotaBlockedUntil = nextUtcDay(now());
          state.nextAttemptAt.set(card.ticker, statusCode === 402 ? state.quotaBlockedUntil : now() + failureBackoffMs);
          return;
        }
        const incoming = result.value;
        const previous = state.ticks.get(card.ticker);
        // Never let missing, future, or older quote times poison the last known index price.
        if (previous?.timestamp && (!incoming?.timestamp || incoming.timestamp < previous.timestamp)) {
          state.errors.set(card.ticker, { ticker: card.ticker, statusCode: 502, error: 'EODHD 指数报价时间缺失或倒退' });
          state.nextAttemptAt.set(card.ticker, now() + failureBackoffMs);
          return;
        }
        if (previous?.timestamp && incoming.timestamp === previous.timestamp) {
          // A repeated quote confirms the fetch succeeded, but is not a new price observation.
          state.ticks.set(card.ticker, Object.freeze({ ...previous, receivedAt: incoming.receivedAt, fetchedAt: incoming.fetchedAt }));
        } else {
          state.ticks.set(card.ticker, incoming);
        }
        state.errors.delete(card.ticker);
        state.nextAttemptAt.set(card.ticker, now() + ttlMs);
      });
      return snapshot(state);
    }).finally(() => {
      if (state.inFlight === pending) state.inFlight = null;
    });
    state.inFlight = pending;
    return pending;
  };
}

export const loadIndexQuotes = createIndexQuoteLoader();
