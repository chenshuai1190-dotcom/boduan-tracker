import { isUsMarketDateKey } from '../../src/lib/usMarketCalendar.js';

export {
  getLatestCompletedUsTradingDate,
  getUsEasternMarketClock,
  isUsMarketTradingDate,
} from '../../src/lib/usMarketCalendar.js';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const EODHD_DAILY_HISTORY_CACHE_TTL_MS = 8 * DAY_MS;
export const EODHD_INDEX_LIVE_CACHE_TTL_MS = 10 * MINUTE_MS;
export const EODHD_INDEX_COMPLETED_CACHE_TTL_MS = 8 * DAY_MS;
export const EODHD_DELAYED_QUOTE_REGULAR_BUCKET_MS = 15 * MINUTE_MS;
export const EODHD_DELAYED_QUOTE_EXTENDED_BUCKET_MS = 30 * MINUTE_MS;

// The browser may split one legal realtime universe into multiple 30-symbol
// REST batches. Keep enough completed histories for the whole universe so a
// stable polling order cannot evict batch one while loading later batches.
const DAILY_HISTORY_CACHE_MAX_ENTRIES = 96;
const INDEX_INTRADAY_CACHE_MAX_ENTRIES = 96;
const DELAYED_QUOTE_CACHE_MAX_ENTRIES = 96;
const PUBLIC_DAILY_ROW_FIELDS = Object.freeze([
  'date',
  'open',
  'high',
  'low',
  'close',
  'adjusted_close',
  'volume',
]);
const PUBLIC_DELAYED_QUOTE_FIELDS = Object.freeze([
  'lastTradePrice',
  'ethPrice',
  'previousClosePrice',
  'change',
  'changePercent',
  'high',
  'low',
  'open',
  'timestamp',
]);

// This cache is deliberately limited to raw public EODHD market data. Route
// authentication results, user identity, holdings, trades, and account data
// must never be passed to it.
const dailyHistoryCache = new Map();
const dailyHistoryInflight = new Map();
const indexIntradayCache = new Map();
const indexIntradayInflight = new Map();
const delayedQuoteCache = new Map();
const delayedQuoteInflight = new Map();

function nowMs(now) {
  const value = typeof now === 'function' ? now() : now;
  return Number.isFinite(Number(value)) ? Number(value) : Date.now();
}

function normalizeProviderSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.^_-]{1,40}$/.test(symbol)) {
    throw new TypeError('EODHD cache requires a public provider symbol');
  }
  return symbol;
}

function normalizeFreshnessKey(value) {
  const key = String(value || '').trim();
  if (!key || !/^[A-Za-z0-9:._-]{1,80}$/.test(key)) {
    throw new TypeError('EODHD cache requires a bounded public freshness key');
  }
  return key;
}

function touch(map, key, value) {
  map.delete(key);
  map.set(key, value);
}

function pruneExpired(map, currentTime) {
  for (const [key, entry] of map) {
    if (!(entry?.expiresAt > currentTime)) map.delete(key);
  }
}

function trimOldest(map, maxEntries) {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function hasUsableDailyRow(row) {
  if (!row || !isUsMarketDateKey(row.date)) return false;
  const close = Number(row.close);
  const adjustedClose = Number(row.adjusted_close);
  return (Number.isFinite(close) && close > 0)
    || (Number.isFinite(adjustedClose) && adjustedClose > 0);
}

function hasUsableDailyRows(rows) {
  return Array.isArray(rows) && rows.some(hasUsableDailyRow);
}

function latestDailyDate(rows) {
  return rows.reduce((latest, row) => (
    hasUsableDailyRow(row) && row.date > latest ? row.date : latest
  ), '');
}

function normalizePublicDailyRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .map((row) => {
      const normalized = {};
      for (const field of PUBLIC_DAILY_ROW_FIELDS) {
        const value = row[field];
        if (value === null || typeof value === 'string' || typeof value === 'number') {
          normalized[field] = value;
        }
      }
      return normalized;
    });
}

function sliceDailyRows(rows, fromDate) {
  return rows.filter((row) => !row?.date || String(row.date) >= fromDate);
}

function normalizePublicDelayedQuote(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const quote = {};
  for (const field of PUBLIC_DELAYED_QUOTE_FIELDS) {
    const fieldValue = value[field];
    if (fieldValue === null || typeof fieldValue === 'string' || typeof fieldValue === 'number') {
      quote[field] = fieldValue;
    }
  }
  const hasPrice = [quote.lastTradePrice, quote.ethPrice]
    .some((fieldValue) => Number.isFinite(Number(fieldValue)) && Number(fieldValue) > 0);
  return hasPrice ? quote : null;
}

/** Caches only provider-public delayed quote fields by symbol and session bucket. */
export function loadEodhdDelayedQuote({
  symbol,
  sessionKey,
  load,
  now = Date.now,
  ttlMs = EODHD_DELAYED_QUOTE_REGULAR_BUCKET_MS,
}) {
  const normalizedSymbol = normalizeProviderSymbol(symbol);
  const normalizedSessionKey = normalizeFreshnessKey(sessionKey);
  if (typeof load !== 'function') throw new TypeError('EODHD delayed quote cache requires a loader');

  const currentTime = nowMs(now);
  const key = `delayed:${normalizedSymbol}:${normalizedSessionKey}`;
  pruneExpired(delayedQuoteCache, currentTime);
  const cached = delayedQuoteCache.get(key);
  if (cached) {
    touch(delayedQuoteCache, key, cached);
    return Promise.resolve({ ...cached.quote });
  }
  if (delayedQuoteInflight.has(key)) {
    return delayedQuoteInflight.get(key).then((quote) => ({ ...quote }));
  }

  const pending = Promise.resolve()
    .then(load)
    .then((value) => {
      const quote = normalizePublicDelayedQuote(value);
      if (!quote) throw new Error('EODHD delayed quote returned no usable price');
      touch(delayedQuoteCache, key, {
        quote,
        expiresAt: currentTime + Math.max(1, Number(ttlMs) || 1),
      });
      trimOldest(delayedQuoteCache, DELAYED_QUOTE_CACHE_MAX_ENTRIES);
      return quote;
    })
    .finally(() => {
      if (delayedQuoteInflight.get(key) === pending) delayedQuoteInflight.delete(key);
    });
  delayedQuoteInflight.set(key, pending);
  return pending.then((quote) => ({ ...quote }));
}

function getCoveringInflight(baseKey, fromDate) {
  const pendingByFrom = dailyHistoryInflight.get(baseKey);
  if (!pendingByFrom) return null;
  for (const [pendingFromDate, pending] of pendingByFrom) {
    if (pendingFromDate <= fromDate) return pending;
  }
  return null;
}

/**
 * Reuses successful EOD daily rows by provider symbol and latest completed
 * market close. A broader cached range may satisfy a narrower request, while a
 * later request for older history upgrades the entry instead of returning a
 * truncated payload.
 */
export function loadEodhdDailyHistory({
  symbol,
  completedDate,
  fromDate,
  load,
  now = Date.now,
  ttlMs = EODHD_DAILY_HISTORY_CACHE_TTL_MS,
}) {
  const normalizedSymbol = normalizeProviderSymbol(symbol);
  if (!isUsMarketDateKey(completedDate) || !isUsMarketDateKey(fromDate)) {
    throw new TypeError('EODHD daily history cache requires ISO market dates');
  }
  if (typeof load !== 'function') throw new TypeError('EODHD daily history cache requires a loader');

  const currentTime = nowMs(now);
  const baseKey = `daily:${normalizedSymbol}:${completedDate}`;
  pruneExpired(dailyHistoryCache, currentTime);

  const cached = dailyHistoryCache.get(baseKey);
  if (cached && cached.fromDate <= fromDate) {
    touch(dailyHistoryCache, baseKey, cached);
    return Promise.resolve(sliceDailyRows(cached.rows, fromDate));
  }

  const coveringInflight = getCoveringInflight(baseKey, fromDate);
  if (coveringInflight) {
    return coveringInflight.then((rows) => sliceDailyRows(rows, fromDate));
  }

  const pendingByFrom = dailyHistoryInflight.get(baseKey) || new Map();
  const pending = Promise.resolve()
    .then(load)
    .then((rows) => {
      const publicRows = normalizePublicDailyRows(rows).filter((row) => (
        isUsMarketDateKey(row.date) && row.date <= completedDate
      ));
      if (!hasUsableDailyRows(publicRows)) {
        throw new Error('EODHD daily history returned no usable rows');
      }

      const existing = dailyHistoryCache.get(baseKey);
      // Providers may publish the final daily bar a little after the official
      // close. Return the latest usable rows immediately, but never freeze a
      // previous-day payload under today's completed-close cache key.
      const isCompletedPayload = latestDailyDate(publicRows) === completedDate;
      if (isCompletedPayload && (!existing || fromDate < existing.fromDate)) {
        touch(dailyHistoryCache, baseKey, {
          fromDate,
          rows: publicRows,
          expiresAt: currentTime + Math.max(1, Number(ttlMs) || 1),
        });
        trimOldest(dailyHistoryCache, DAILY_HISTORY_CACHE_MAX_ENTRIES);
      }
      return publicRows;
    })
    .finally(() => {
      const currentPending = dailyHistoryInflight.get(baseKey);
      currentPending?.delete(fromDate);
      if (currentPending?.size === 0) dailyHistoryInflight.delete(baseKey);
    });

  pendingByFrom.set(fromDate, pending);
  dailyHistoryInflight.set(baseKey, pendingByFrom);
  return pending.then((rows) => sliceDailyRows(rows, fromDate));
}

function hasUsableIntradayValues(values) {
  return Array.isArray(values)
    && values.length >= 2
    && values.every((value) => Number.isFinite(Number(value)) && Number(value) > 0);
}

/**
 * Reuses only parsed public index intraday values. Session keys are supplied by
 * the index provider, so live five-minute buckets remain fresh while completed
 * sessions can be held until the next trading session.
 */
export function loadEodhdIndexIntraday({
  ticker,
  sessionKey,
  load,
  now = Date.now,
  ttlMs = EODHD_INDEX_LIVE_CACHE_TTL_MS,
  shouldCache = () => true,
}) {
  const normalizedTicker = normalizeProviderSymbol(ticker);
  const normalizedSessionKey = normalizeFreshnessKey(sessionKey);
  if (typeof load !== 'function') throw new TypeError('EODHD index intraday cache requires a loader');

  const currentTime = nowMs(now);
  const key = `intraday:${normalizedTicker}:${normalizedSessionKey}`;
  pruneExpired(indexIntradayCache, currentTime);

  const cached = indexIntradayCache.get(key);
  if (cached) {
    touch(indexIntradayCache, key, cached);
    return Promise.resolve(cached.values);
  }
  if (indexIntradayInflight.has(key)) return indexIntradayInflight.get(key);

  const pending = Promise.resolve()
    .then(load)
    .then((values) => {
      if (!hasUsableIntradayValues(values)) {
        throw new Error('EODHD index intraday returned no usable values');
      }
      // A just-closed provider response can still contain only the previous
      // session. Let callers display it, but do not bind it to a newer session
      // key until the expected session is actually present.
      if (shouldCache(values) !== false) {
        touch(indexIntradayCache, key, {
          values,
          expiresAt: currentTime + Math.max(1, Number(ttlMs) || 1),
        });
        trimOldest(indexIntradayCache, INDEX_INTRADAY_CACHE_MAX_ENTRIES);
      }
      return values;
    })
    .finally(() => {
      if (indexIntradayInflight.get(key) === pending) indexIntradayInflight.delete(key);
    });

  indexIntradayInflight.set(key, pending);
  return pending;
}

export function resetEodhdRestCaches() {
  dailyHistoryCache.clear();
  dailyHistoryInflight.clear();
  indexIntradayCache.clear();
  indexIntradayInflight.clear();
  delayedQuoteCache.clear();
  delayedQuoteInflight.clear();
}
