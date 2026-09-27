import { getVixComparisonExpectedCloseDate, isVixComparisonSession } from '../../src/lib/vixComparisonSession.js';
import { fetchCboeHistory, fetchVixHistoryText, positiveVixNumber, validVixDateKey } from './vixTermStructure.js';

export { getVixComparisonExpectedCloseDate } from '../../src/lib/vixComparisonSession.js';

const HISTORY_YEARS = 5;
const STALE_RETRY_MS = 5 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;
const MAX_CACHED_VERSIONS = 4;
const SERIES = Object.freeze({
  VIX: { priceBasis: 'close', unit: 'points' },
  SPY: { providerSymbol: 'SPY.US', priceBasis: 'adjusted_close', unit: 'USD' },
  QQQ: { providerSymbol: 'QQQ.US', priceBasis: 'adjusted_close', unit: 'USD' },
});
const SYMBOLS = ['VIX', 'VIX3M', 'SPY', 'QQQ'];
const completedVersionCache = new Map();
const rawVersionCache = new Map();
const inFlightRequests = new Map();
const failedVersions = new Map();

function timeValue(now) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
    throw new Error('VIX comparison time is invalid');
  }
  return timestamp;
}

function historyFromDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - HISTORY_YEARS);
  return date.toISOString().slice(0, 10);
}

function normalizeRows(rows, { priceBasis, fromDate, throughDate }) {
  const byDate = new Map();
  const rejected = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = validVixDateKey(row?.date);
    if (!date || date < fromDate || date > throughDate || !isVixComparisonSession(date) || rejected.has(date)) continue;
    const close = positiveVixNumber(row?.[priceBasis]);
    if (close === null || (byDate.has(date) && byDate.get(date).close !== close)) {
      rejected.add(date); byDate.delete(date); continue;
    }
    byDate.set(date, { date, close });
  }
  return byDate;
}

function normalizedSymbol(rawRows, symbol, expectedDate) {
  return normalizeRows(rawRows, {
    priceBasis: SERIES[symbol]?.priceBasis || 'close',
    fromDate: historyFromDate(expectedDate),
    throughDate: expectedDate,
  });
}

function buildTermStructure(rawRowsBySymbol, expectedDate, timestamp, unavailable = false) {
  const vix = normalizedSymbol(rawRowsBySymbol?.VIX, 'VIX', expectedDate);
  const vix3m = normalizedSymbol(rawRowsBySymbol?.VIX3M, 'VIX3M', expectedDate);
  const rows = [...vix.keys()].filter((date) => vix3m.has(date)).sort().map((date) => ({
    date, vix: vix.get(date).close, vix3m: vix3m.get(date).close,
    ratio: vix.get(date).close / vix3m.get(date).close,
  })).filter((row) => Number.isFinite(row.ratio) && row.ratio > 0);
  const asOfDate = rows.at(-1)?.date || null;
  return {
    source: 'CBOE', asOfDate, expectedAsOfDate: expectedDate,
    fetchedAt: new Date(timestamp).toISOString(),
    stale: unavailable || asOfDate !== expectedDate,
    staleReason: unavailable ? 'provider_unavailable' : asOfDate !== expectedDate ? 'incomplete_close' : '',
    rows,
  };
}

export function buildVixComparisonData(rawRowsBySymbol, {
  expectedAsOfDate, now = Date.now(), termUnavailable = false,
} = {}) {
  const timestamp = timeValue(now);
  const expectedDate = validVixDateKey(expectedAsOfDate);
  if (!expectedDate || expectedDate > getVixComparisonExpectedCloseDate(timestamp) || !isVixComparisonSession(expectedDate)) {
    throw new Error('VIX comparison completed date is invalid');
  }
  const normalized = Object.fromEntries(Object.keys(SERIES).map((symbol) => [symbol,
    normalizedSymbol(rawRowsBySymbol?.[symbol], symbol, expectedDate),
  ]));
  const dates = [...normalized.VIX.keys()]
    .filter((date) => normalized.SPY.has(date) && normalized.QQQ.has(date)).sort();
  if (dates.length < 2) throw new Error('VIX comparison has insufficient common daily closes');
  const asOfDate = dates.at(-1);
  return {
    version: 2, source: 'CBOE_EODHD_EOD',
    fetchedAt: new Date(timestamp).toISOString(), expectedAsOfDate: expectedDate, asOfDate,
    availableFromDate: dates[0], pointCount: dates.length,
    stale: asOfDate !== expectedDate, staleReason: asOfDate !== expectedDate ? 'incomplete_close' : '',
    series: Object.fromEntries(Object.entries(SERIES).map(([symbol, config]) => [symbol, {
      symbol, priceBasis: config.priceBasis, unit: config.unit,
      rows: dates.map((date) => normalized[symbol].get(date)),
    }])),
    termStructure: buildTermStructure(rawRowsBySymbol, expectedDate, timestamp, termUnavailable),
  };
}

function trimVersions(map) {
  const keys = [...map.keys()].sort();
  while (keys.length > MAX_CACHED_VERSIONS) map.delete(keys.shift());
}

function usableCachedData(expectedDate) {
  return [...completedVersionCache.values()].map((entry) => entry.data)
    .filter((data) => data.version === 2 && data.source === 'CBOE_EODHD_EOD' && data.asOfDate <= expectedDate);
}

function latestUsableCachedData(expectedDate) {
  return usableCachedData(expectedDate).sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0] || null;
}

function latestUsableTerm(expectedDate) {
  return usableCachedData(expectedDate).map((data) => data.termStructure)
    .filter((term) => term?.source === 'CBOE' && term.asOfDate && term.asOfDate <= expectedDate)
    .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0] || null;
}

function staleTerm(term, expectedDate, reason) {
  return { ...term, expectedAsOfDate: expectedDate, stale: true, staleReason: reason };
}

function preserveTermHistory(term, expectedDate) {
  const fallback = latestUsableTerm(expectedDate);
  if (fallback && (!term.asOfDate || fallback.asOfDate > term.asOfDate)) {
    return staleTerm(fallback, expectedDate, term.staleReason || 'incomplete_close');
  }
  if (fallback && term.staleReason === 'provider_unavailable' && fallback.asOfDate === term.asOfDate) {
    return staleTerm(fallback, expectedDate, 'provider_unavailable');
  }
  return term;
}

function fallbackData(data, expectedDate, reason) {
  return { ...data, expectedAsOfDate: expectedDate, stale: true, staleReason: reason,
    termStructure: staleTerm(data.termStructure, expectedDate, reason) };
}

async function fetchSeriesRows(symbol, { eodhdKey, fetchImpl, fromDate, throughDate }) {
  if (symbol === 'VIX' || symbol === 'VIX3M') return fetchCboeHistory(symbol, { fetchImpl });
  const url = new URL(`https://eodhd.com/api/eod/${SERIES[symbol].providerSymbol}`);
  url.search = new URLSearchParams({ api_token: eodhdKey, from: fromDate, to: throughDate, period: 'd', fmt: 'json' }).toString();
  const text = await fetchVixHistoryText(url.toString(), { fetchImpl, provider: 'eodhd:vix-comparison', maxBytes: 4 * 1024 * 1024 });
  const payload = JSON.parse(text);
  if (!Array.isArray(payload)) throw new Error('VIX comparison provider response invalid');
  return payload;
}

export function fetchVixComparison({ eodhdKey, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const timestamp = timeValue(now);
  const expectedDate = getVixComparisonExpectedCloseDate(timestamp);
  if (!String(eodhdKey || '').trim()) return Promise.reject(new Error('EODHD API key is required'));
  if (typeof fetchImpl !== 'function') return Promise.reject(new Error('fetch is unavailable'));
  const cached = completedVersionCache.get(expectedDate);
  if (cached && ((!cached.data.stale && !cached.data.termStructure.stale) || cached.retryAt > timestamp)) {
    return Promise.resolve(cached.data);
  }
  if ((failedVersions.get(expectedDate) || 0) > timestamp) {
    const fallback = latestUsableCachedData(expectedDate);
    return fallback ? Promise.resolve(fallbackData(fallback, expectedDate, 'provider_unavailable'))
      : Promise.reject(new Error('VIX comparison retry deferred'));
  }
  if (inFlightRequests.has(expectedDate)) return inFlightRequests.get(expectedDate);

  const request = (async () => {
    try {
      const retained = rawVersionCache.get(expectedDate) || {};
      // Reuse each complete daily series, including ETFs when only VIX3M is late.
      const needed = SYMBOLS.filter((symbol) => !retained[symbol]?.complete);
      const results = await Promise.allSettled(needed.map((symbol) => fetchSeriesRows(symbol, {
        eodhdKey: String(eodhdKey).trim(), fetchImpl, fromDate: historyFromDate(expectedDate), throughDate: expectedDate,
      })));
      const failures = new Set();
      for (let index = 0; index < needed.length; index += 1) {
        const symbol = needed[index];
        const result = results[index];
        if (result.status === 'rejected') { failures.add(symbol); continue; }
        const rows = normalizedSymbol(result.value, symbol, expectedDate);
        const asOfDate = [...rows.keys()].sort().at(-1) || '';
        // A lagging provider must not replace a newer retained source series.
        if (!retained[symbol] || asOfDate >= retained[symbol].asOfDate) {
          retained[symbol] = { rows: result.value, asOfDate, complete: asOfDate === expectedDate };
        }
      }
      rawVersionCache.set(expectedDate, retained);
      trimVersions(rawVersionCache);
      const raw = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, retained[symbol]?.rows || []]));
      const term = cached && !needed.includes('VIX') && !needed.includes('VIX3M')
        ? cached.data.termStructure
        : preserveTermHistory(buildTermStructure(raw, expectedDate, timestamp,
          failures.has('VIX') || failures.has('VIX3M')), expectedDate);
      const baseFailed = ['VIX', 'SPY', 'QQQ'].some((symbol) => failures.has(symbol));
      let data;
      try {
        data = buildVixComparisonData(raw, { expectedAsOfDate: expectedDate, now: timestamp });
      } catch {
        const fallback = latestUsableCachedData(expectedDate);
        if (!fallback) throw new Error('VIX comparison history unavailable');
        data = fallbackData(fallback, expectedDate, baseFailed ? 'provider_unavailable' : 'incomplete_close');
      }
      const fallback = latestUsableCachedData(expectedDate);
      if (fallback && fallback.asOfDate > data.asOfDate) {
        data = fallbackData(fallback, expectedDate, baseFailed ? 'provider_unavailable' : 'incomplete_close');
      } else if (baseFailed) {
        data = { ...data, stale: true, staleReason: 'provider_unavailable' };
      }
      // Retrying only the term structure must preserve the price observation time.
      if (cached && data.asOfDate === cached.data.asOfDate && (!cached.data.stale || baseFailed)) {
        data = baseFailed ? fallbackData(cached.data, expectedDate, 'provider_unavailable') : { ...cached.data };
      }
      data = { ...data, termStructure: term };
      completedVersionCache.set(expectedDate, { data, retryAt: timestamp + (baseFailed ? FAILURE_RETRY_MS : STALE_RETRY_MS) });
      trimVersions(completedVersionCache);
      failedVersions.delete(expectedDate);
      return data;
    } catch {
      failedVersions.set(expectedDate, timestamp + FAILURE_RETRY_MS);
      trimVersions(failedVersions);
      const fallback = latestUsableCachedData(expectedDate);
      if (fallback) return fallbackData(fallback, expectedDate, 'provider_unavailable');
      throw new Error('VIX comparison history unavailable');
    } finally {
      inFlightRequests.delete(expectedDate);
    }
  })();
  inFlightRequests.set(expectedDate, request);
  return request;
}

export function resetVixComparisonCacheForTests() {
  completedVersionCache.clear(); rawVersionCache.clear(); inFlightRequests.clear(); failedVersions.clear();
}
