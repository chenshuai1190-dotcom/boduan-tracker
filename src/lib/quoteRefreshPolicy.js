import { derivePositionsFromTrades } from './investmentSummary.js';
import { normalizeUserStockSymbol } from './symbols.js';

export const QUOTE_BASELINE_REFRESH_INTERVAL_MS = Object.freeze({
  regular: 15 * 60 * 1000,
  premarket: 30 * 60 * 1000,
  postmarket: 30 * 60 * 1000,
  closed: 60 * 60 * 1000,
});

const regularNyseHolidayCache = new Map();
const POSITIVE_QUOTE_FIELDS = Object.freeze([
  'price',
  'high',
  'week52High',
  'previousClose',
  'dailyBaselineClose',
  'dailyPnlPrice',
  'dailyPnlBaselineClose',
  'sessionPreviousClose',
  'providerPreviousClose',
]);

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function observedFixedHoliday(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return utcDateKey(date);
}

function newYearsHoliday(year) {
  const date = new Date(Date.UTC(year, 0, 1));
  // Unlike other NYSE fixed holidays, a Saturday New Year's Day does not
  // close the preceding Friday.
  if (date.getUTCDay() === 0) date.setUTCDate(2);
  return utcDateKey(date);
}

function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + ((occurrence - 1) * 7));
  return utcDateKey(date);
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return utcDateKey(date);
}

function easterSundayUtc(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = ((19 * a) + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + (2 * e) + (2 * i) - h - k) % 7;
  const m = Math.floor((a + (11 * h) + (22 * l)) / 451);
  const month = Math.floor((h + l - (7 * m) + 114) / 31);
  const day = ((h + l - (7 * m) + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function regularNyseHolidaysForYear(year) {
  if (regularNyseHolidayCache.has(year)) return regularNyseHolidayCache.get(year);
  const holidays = new Set([
    newYearsHoliday(year),
    nthWeekdayOfMonth(year, 0, 1, 3),
    nthWeekdayOfMonth(year, 1, 1, 3),
    lastWeekdayOfMonth(year, 4, 1),
    observedFixedHoliday(year, 6, 4),
    nthWeekdayOfMonth(year, 8, 1, 1),
    nthWeekdayOfMonth(year, 10, 4, 4),
    observedFixedHoliday(year, 11, 25),
  ]);
  if (year >= 2022) holidays.add(observedFixedHoliday(year, 5, 19));
  const goodFriday = easterSundayUtc(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  holidays.add(utcDateKey(goodFriday));
  regularNyseHolidayCache.set(year, holidays);
  return holidays;
}

function newYorkClock(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const read = (type) => parts.find((part) => part.type === type)?.value || '';
    const dateKey = `${read('year')}-${read('month')}-${read('day')}`;
    const hour = Number(read('hour'));
    const minute = Number(read('minute'));
    return {
      dateKey: /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : '',
      minuteOfDay: Number.isFinite(hour) && Number.isFinite(minute) ? (hour * 60) + minute : -1,
    };
  } catch {
    return { dateKey: '', minuteOfDay: -1 };
  }
}

export function isRegularNyseHoliday(dateKey) {
  const normalized = String(dateKey || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const year = Number(normalized.slice(0, 4));
  return [year - 1, year, year + 1]
    .some((holidayYear) => regularNyseHolidaysForYear(holidayYear).has(normalized));
}

export function getQuoteBaselineSession(date = new Date(), session = 'closed') {
  const normalizedSession = QUOTE_BASELINE_REFRESH_INTERVAL_MS[session] ? session : 'closed';
  const { dateKey } = newYorkClock(date);
  return dateKey && isRegularNyseHoliday(dateKey) ? 'closed' : normalizedSession;
}

export function getQuoteCloseSettlementKey({
  session = 'closed',
  now = Date.now(),
} = {}) {
  if (session !== 'postmarket') return '';
  const currentTime = finiteTimestamp(now) || Date.now();
  const { dateKey, minuteOfDay } = newYorkClock(new Date(currentTime));
  return dateKey && minuteOfDay >= (16 * 60) + 5 && minuteOfDay < 20 * 60
    ? dateKey
    : '';
}

function finiteTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function normalizedSymbol(value) {
  return normalizeUserStockSymbol(value);
}

export function getQuoteBaselineRefreshInterval(session = 'closed') {
  return QUOTE_BASELINE_REFRESH_INTERVAL_MS[session]
    || QUOTE_BASELINE_REFRESH_INTERVAL_MS.closed;
}

export function getQuoteBaselineRefreshDelay({
  session = 'closed',
  now = Date.now(),
  lastSuccessAt = 0,
  lastAttemptAt = 0,
  lastAttemptSession = '',
} = {}) {
  const currentTime = finiteTimestamp(now) || Date.now();
  const cadenceAnchor = Math.max(
    finiteTimestamp(lastSuccessAt),
    finiteTimestamp(lastAttemptAt),
  );
  if (!cadenceAnchor) return 0;
  if (lastAttemptSession && lastAttemptSession !== session) return 0;

  const elapsed = Math.max(0, currentTime - cadenceAnchor);
  return Math.max(0, getQuoteBaselineRefreshInterval(session) - elapsed);
}

export function shouldRunQuoteBaselineRefresh({
  session = 'closed',
  now = Date.now(),
  lastSuccessAt = 0,
  lastAttemptAt = 0,
  lastAttemptSession = '',
  lastCloseSettlementKey = '',
  universeExpanded = false,
  force = false,
} = {}) {
  if (force) return true;
  const lastAttempt = finiteTimestamp(lastAttemptAt);
  const latestAttemptSucceeded = lastAttempt > 0
    && finiteTimestamp(lastSuccessAt) >= lastAttempt;
  if (universeExpanded && latestAttemptSucceeded) return true;

  // The first postmarket transition request can arrive before EODHD rolls its
  // completed close. Permit one additional 16:05 ET confirmation, then use the
  // normal 30-minute cooldown even when that confirmation fails.
  const closeSettlementKey = getQuoteCloseSettlementKey({ session, now });
  if (
    closeSettlementKey
    && closeSettlementKey !== lastCloseSettlementKey
    && latestAttemptSucceeded
  ) return true;

  // A failed provider request must not turn focus/pageshow events into a retry loop.
  // Successful refreshes remain the normal cadence anchor; the latest attempt is
  // only a protective cooldown while upstream is unhealthy.
  return getQuoteBaselineRefreshDelay({
    session,
    now,
    lastSuccessAt,
    lastAttemptAt,
    lastAttemptSession,
  }) === 0;
}

export function selectQuoteBaselineSymbols({
  stockTrades = [],
  watchlist = [],
  activeSwingRows = [],
} = {}) {
  const symbols = new Set();
  const ledgerTrades = Array.isArray(stockTrades) ? stockTrades : [];

  derivePositionsFromTrades(ledgerTrades)
    .filter((position) => Number(position?.heldShares) > 0)
    .forEach((position) => {
      const symbol = normalizedSymbol(position?.symbol);
      if (symbol) symbols.add(symbol);
    });

  (Array.isArray(watchlist) ? watchlist : []).forEach((row) => {
    const symbol = normalizedSymbol(row?.symbol);
    if (symbol) symbols.add(symbol);
  });

  (Array.isArray(activeSwingRows) ? activeSwingRows : []).forEach((row) => {
    // App receives quote rows already filtered to active waves. If a status is
    // present, enforce it here so completed history can never expand REST usage.
    if (row?.status && row.status !== 'active') return;
    const symbol = normalizedSymbol(row?.symbol);
    if (symbol) symbols.add(symbol);
  });

  return Array.from(symbols);
}

export function buildQuoteBaselineRows({
  candidateRows = [],
  stockTrades = [],
  watchlist = [],
  activeSwingRows = [],
} = {}) {
  const allowedSymbols = new Set(selectQuoteBaselineSymbols({
    stockTrades,
    watchlist,
    activeSwingRows,
  }));
  const bySymbol = new Map();

  (Array.isArray(candidateRows) ? candidateRows : []).forEach((row) => {
    const symbol = normalizedSymbol(row?.symbol);
    if (!symbol || !allowedSymbols.has(symbol)) return;
    bySymbol.set(symbol, {
      ...row,
      symbol,
      name: row?.name || symbol,
    });
  });

  [
    ...(Array.isArray(watchlist) ? watchlist : []),
    ...(Array.isArray(activeSwingRows) ? activeSwingRows : []),
  ].forEach((row) => {
    const symbol = normalizedSymbol(row?.symbol);
    if (!symbol || !allowedSymbols.has(symbol) || bySymbol.has(symbol)) return;
    bySymbol.set(symbol, {
      ...row,
      symbol,
      name: row?.name || symbol,
    });
  });

  // Current holdings always exist in the ledger, but keep a minimal fallback so
  // a partially loaded cache cannot silently omit a symbol from the baseline.
  (Array.isArray(stockTrades) ? stockTrades : []).forEach((trade) => {
    const symbol = normalizedSymbol(trade?.symbol);
    if (!symbol || !allowedSymbols.has(symbol) || bySymbol.has(symbol)) return;
    bySymbol.set(symbol, {
      symbol,
      name: trade?.name || symbol,
      price: Number(trade?.price) || 0,
      high: Number(trade?.price) || 0,
    });
  });

  return Array.from(bySymbol.values());
}

export function buildQuoteBaselineUniverseKey(rows = [], coreSymbols = []) {
  return Array.from(new Set([
    ...(Array.isArray(rows) ? rows : []).map((row) => normalizedSymbol(row?.symbol)),
    ...(Array.isArray(coreSymbols) ? coreSymbols : []).map(normalizedSymbol),
  ].filter(Boolean))).sort().join(',');
}

export function isQuoteBaselineUniverseExpansion(previousKey = '', nextKey = '') {
  const previous = new Set(String(previousKey || '').split(',').filter(Boolean));
  const next = new Set(String(nextKey || '').split(',').filter(Boolean));
  if (previous.size === 0 || next.size === 0) return false;
  return Array.from(next).some((symbol) => !previous.has(symbol));
}

export function shouldQueueQuoteBaselineExpansion({
  fetchInFlight = false,
  queueIfBusy = false,
  universeExpanded = false,
} = {}) {
  return Boolean(fetchInFlight && queueIfBusy && universeExpanded);
}

export function mergeQuoteBaselineRows(currentRows = [], refreshedRows = []) {
  const bySymbol = new Map();

  (Array.isArray(currentRows) ? currentRows : []).forEach((row) => {
    const symbol = normalizedSymbol(row?.symbol);
    if (!symbol) return;
    bySymbol.set(symbol, { ...row, symbol });
  });

  (Array.isArray(refreshedRows) ? refreshedRows : []).forEach((row) => {
    const symbol = normalizedSymbol(row?.symbol);
    if (!symbol) return;
    const existing = bySymbol.get(symbol) || {};
    const next = {
      ...existing,
      ...row,
      symbol,
    };
    POSITIVE_QUOTE_FIELDS.forEach((field) => {
      if (Number(existing?.[field]) > 0 && !(Number(row?.[field]) > 0)) {
        next[field] = existing[field];
      }
    });
    bySymbol.set(symbol, next);
  });

  return Array.from(bySymbol.values());
}
