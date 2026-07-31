const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const EODHD_DAILY_HISTORY_CACHE_TTL_MS = 8 * DAY_MS;
export const EODHD_INDEX_LIVE_CACHE_TTL_MS = 10 * MINUTE_MS;
export const EODHD_INDEX_COMPLETED_CACHE_TTL_MS = 8 * DAY_MS;

// The browser may split one legal realtime universe into multiple 30-symbol
// REST batches. Keep enough completed histories for the whole universe so a
// stable polling order cannot evict batch one while loading later batches.
const DAILY_HISTORY_CACHE_MAX_ENTRIES = 96;
const INDEX_INTRADAY_CACHE_MAX_ENTRIES = 96;
const US_REGULAR_CLOSE_MINUTES = 16 * 60;
const PUBLIC_DAILY_ROW_FIELDS = Object.freeze([
  'date',
  'open',
  'high',
  'low',
  'close',
  'adjusted_close',
  'volume',
]);

// This cache is deliberately limited to raw public EODHD market data. Route
// authentication results, user identity, holdings, trades, and account data
// must never be passed to it.
const dailyHistoryCache = new Map();
const dailyHistoryInflight = new Map();
const indexIntradayCache = new Map();
const indexIntradayInflight = new Map();

function nowMs(now) {
  const value = typeof now === 'function' ? now() : now;
  return Number.isFinite(Number(value)) ? Number(value) : Date.now();
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function shiftDateKey(dateKey, offsetDays) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isWeekdayDateKey(dateKey) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function observedFixedHoliday(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + (occurrence - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function easterSundayDateKey(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

const marketHolidayCache = new Map();

function marketHolidayDatesForHolidayYear(year) {
  if (marketHolidayCache.has(year)) return marketHolidayCache.get(year);
  const dates = new Set([
    observedFixedHoliday(year, 0, 1),
    nthWeekdayOfMonth(year, 0, 1, 3),
    nthWeekdayOfMonth(year, 1, 1, 3),
    shiftDateKey(easterSundayDateKey(year), -2),
    lastWeekdayOfMonth(year, 4, 1),
    observedFixedHoliday(year, 6, 4),
    nthWeekdayOfMonth(year, 8, 1, 1),
    nthWeekdayOfMonth(year, 10, 4, 4),
    observedFixedHoliday(year, 11, 25),
  ]);
  if (year >= 2022) dates.add(observedFixedHoliday(year, 5, 19));
  marketHolidayCache.set(year, dates);
  return dates;
}

export function isUsMarketTradingDate(dateKey) {
  if (!isDateKey(dateKey) || !isWeekdayDateKey(dateKey)) return false;
  const year = Number(String(dateKey).slice(0, 4));
  return !marketHolidayDatesForHolidayYear(year).has(dateKey)
    && !marketHolidayDatesForHolidayYear(year + 1).has(dateKey);
}

export function getUsEasternMarketClock(now = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now));
    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    const date = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
    const hour = Number(getPart('hour'));
    const minute = Number(getPart('minute'));
    if (!isDateKey(date) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return {
      date,
      weekday: getPart('weekday'),
      minutes: hour * 60 + minute,
    };
  } catch {
    return null;
  }
}

export function getLatestCompletedUsTradingDate(now = Date.now()) {
  const clock = getUsEasternMarketClock(now);
  if (!clock) return '';
  if (isUsMarketTradingDate(clock.date) && clock.minutes >= US_REGULAR_CLOSE_MINUTES) {
    return clock.date;
  }

  let candidate = shiftDateKey(clock.date, -1);
  while (candidate && !isUsMarketTradingDate(candidate)) candidate = shiftDateKey(candidate, -1);
  return candidate;
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
  if (!row || !isDateKey(row.date)) return false;
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
  if (!isDateKey(completedDate) || !isDateKey(fromDate)) {
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
        isDateKey(row.date) && row.date <= completedDate
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
}
