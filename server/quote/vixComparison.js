import { latestCompletedUsTradingDate } from '../../src/lib/pnlReportSnapshots.js';
import { isRegularNyseHoliday } from '../../src/lib/quoteRefreshPolicy.js';
import { providerFetch, QUOTE_TIMEOUTS } from './http.js';

const HISTORY_YEARS = 5;
const STALE_RETRY_MS = 5 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;
const MAX_CACHED_VERSIONS = 4;
const SERIES = Object.freeze({
  VIX: { providerSymbol: 'VIX.INDX', priceBasis: 'close', unit: 'points' },
  SPY: { providerSymbol: 'SPY.US', priceBasis: 'adjusted_close', unit: 'USD' },
  QQQ: { providerSymbol: 'QQQ.US', priceBasis: 'adjusted_close', unit: 'USD' },
});

const completedVersionCache = new Map();
const inFlightRequests = new Map();
const failedVersions = new Map();

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : '';
}

function timeValue(now) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
    throw new Error('VIX comparison time is invalid');
  }
  return timestamp;
}

function positiveNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function regularSessionDate(dateKey) {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isRegularNyseHoliday(dateKey);
}

function historyFromDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - HISTORY_YEARS);
  return date.toISOString().slice(0, 10);
}

export function getVixComparisonExpectedCloseDate(now = Date.now()) {
  let dateKey = latestCompletedUsTradingDate(new Date(timeValue(now)));
  while (!regularSessionDate(dateKey)) {
    const previous = new Date(`${dateKey}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    dateKey = previous.toISOString().slice(0, 10);
  }
  return dateKey;
}

function normalizeRows(rows, { priceBasis, fromDate, throughDate }) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = validDateKey(row?.date);
    const close = positiveNumber(row?.[priceBasis]);
    if (!date || close === null || date < fromDate || date > throughDate || !regularSessionDate(date)) {
      continue;
    }
    byDate.set(date, { date, close });
  }
  return byDate;
}

export function buildVixComparisonData(rawRowsBySymbol, {
  expectedAsOfDate,
  now = Date.now(),
} = {}) {
  const timestamp = timeValue(now);
  const expectedDate = validDateKey(expectedAsOfDate);
  const completedDate = getVixComparisonExpectedCloseDate(timestamp);
  if (!expectedDate || expectedDate > completedDate || !regularSessionDate(expectedDate)) {
    throw new Error('VIX comparison completed date is invalid');
  }
  const fromDate = historyFromDate(expectedDate);
  const normalized = Object.fromEntries(Object.entries(SERIES).map(([symbol, config]) => [
    symbol,
    normalizeRows(rawRowsBySymbol?.[symbol], {
      priceBasis: config.priceBasis,
      fromDate,
      throughDate: expectedDate,
    }),
  ]));
  const dates = [...normalized.VIX.keys()]
    .filter((date) => normalized.SPY.has(date) && normalized.QQQ.has(date))
    .sort();
  if (dates.length < 2) throw new Error('VIX comparison has insufficient common daily closes');
  const asOfDate = dates.at(-1);
  return {
    version: 1,
    source: 'EODHD_EOD',
    fetchedAt: new Date(timestamp).toISOString(),
    expectedAsOfDate: expectedDate,
    asOfDate,
    availableFromDate: dates[0],
    pointCount: dates.length,
    stale: asOfDate !== expectedDate,
    staleReason: asOfDate !== expectedDate ? 'incomplete_close' : '',
    series: Object.fromEntries(Object.entries(SERIES).map(([symbol, config]) => [symbol, {
      symbol,
      priceBasis: config.priceBasis,
      unit: config.unit,
      rows: dates.map((date) => normalized[symbol].get(date)),
    }])),
  };
}

function trimVersions(map) {
  const keys = [...map.keys()].sort();
  while (keys.length > MAX_CACHED_VERSIONS) map.delete(keys.shift());
}

function latestUsableCachedData(expectedDate) {
  return [...completedVersionCache.values()]
    .map((entry) => entry.data)
    .filter((data) => data.asOfDate <= expectedDate)
    .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0] || null;
}

function staleData(data, expectedDate, reason) {
  return { ...data, expectedAsOfDate: expectedDate, stale: true, staleReason: reason };
}

async function fetchSeriesRows(symbol, { eodhdKey, fetchImpl, fromDate, throughDate }) {
  const config = SERIES[symbol];
  const url = new URL(`https://eodhd.com/api/eod/${config.providerSymbol}`);
  url.search = new URLSearchParams({
    api_token: eodhdKey,
    from: fromDate,
    to: throughDate,
    period: 'd',
    fmt: 'json',
  }).toString();
  const response = await providerFetch(url.toString(), {}, {
    provider: 'eodhd:vix-comparison',
    timeoutMs: QUOTE_TIMEOUTS.eodhd,
    fetchImpl,
  });
  if (!response.ok) throw new Error('VIX comparison provider unavailable');
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('VIX comparison provider response invalid');
  return [symbol, payload];
}

export function fetchVixComparison({
  eodhdKey,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  const timestamp = timeValue(now);
  const expectedDate = getVixComparisonExpectedCloseDate(timestamp);
  if (!String(eodhdKey || '').trim()) return Promise.reject(new Error('EODHD API key is required'));
  if (typeof fetchImpl !== 'function') return Promise.reject(new Error('fetch is unavailable'));

  const cached = completedVersionCache.get(expectedDate);
  if (cached && (!cached.data.stale || cached.retryAt > timestamp)) {
    return Promise.resolve(cached.data);
  }
  if ((failedVersions.get(expectedDate) || 0) > timestamp) {
    const fallback = latestUsableCachedData(expectedDate);
    return fallback
      ? Promise.resolve(staleData(fallback, expectedDate, 'provider_unavailable'))
      : Promise.reject(new Error('VIX comparison retry deferred'));
  }
  if (inFlightRequests.has(expectedDate)) return inFlightRequests.get(expectedDate);

  const request = (async () => {
    try {
      const entries = await Promise.all(Object.keys(SERIES).map((symbol) => fetchSeriesRows(symbol, {
        eodhdKey: String(eodhdKey).trim(),
        fetchImpl,
        fromDate: historyFromDate(expectedDate),
        throughDate: expectedDate,
      })));
      let data = buildVixComparisonData(Object.fromEntries(entries), {
        expectedAsOfDate: expectedDate,
        now: timestamp,
      });
      const fallback = latestUsableCachedData(expectedDate);
      if (fallback && fallback.asOfDate > data.asOfDate) {
        data = staleData(fallback, expectedDate, 'incomplete_close');
      }
      completedVersionCache.set(expectedDate, { data, retryAt: timestamp + STALE_RETRY_MS });
      trimVersions(completedVersionCache);
      failedVersions.delete(expectedDate);
      return data;
    } catch {
      failedVersions.set(expectedDate, timestamp + FAILURE_RETRY_MS);
      trimVersions(failedVersions);
      const fallback = latestUsableCachedData(expectedDate);
      if (fallback) return staleData(fallback, expectedDate, 'provider_unavailable');
      throw new Error('VIX comparison history unavailable');
    } finally {
      inFlightRequests.delete(expectedDate);
    }
  })();
  inFlightRequests.set(expectedDate, request);
  return request;
}

export function resetVixComparisonCacheForTests() {
  completedVersionCache.clear();
  inFlightRequests.clear();
  failedVersions.clear();
}
