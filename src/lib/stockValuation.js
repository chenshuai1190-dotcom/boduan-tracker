export const STOCK_VALUATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = 'boduan.stock-valuation.v1';
const MAX_MEMORY_ENTRIES = 50;
const memoryCache = new Map();
const inFlightRequests = new Map();

function finiteNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(typeof value === 'string' ? value.trim() : value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function percentileNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 && number <= 100 ? number : null;
}

function positiveInteger(value) {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number > 0 ? number : null;
}

function normalizedSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9._-]{1,15}$/.test(symbol) ? symbol : '';
}

function normalizedCurrency(value) {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
}

function normalizedSource(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

function normalizedTimestamp(value) {
  const timestamp = String(value || '').trim();
  if (!timestamp) return '';
  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function nowValue(now) {
  const value = typeof now === 'function' ? now() : now;
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function identityKey(userId, symbol) {
  const normalizedUserId = String(userId || '').trim();
  const normalized = normalizedSymbol(symbol);
  if (!normalizedUserId || !normalized) return '';
  return `${normalizedUserId}:${normalized}`;
}

function storageKey(identity) {
  return `${STORAGE_PREFIX}:${identity}`;
}

function removeStored(storage, identity) {
  try {
    storage?.removeItem(storageKey(identity));
  } catch {
    // localStorage is an optional acceleration layer.
  }
}

function setMemoryEntry(identity, entry) {
  if (memoryCache.has(identity)) memoryCache.delete(identity);
  memoryCache.set(identity, entry);
  while (memoryCache.size > MAX_MEMORY_ENTRIES) {
    memoryCache.delete(memoryCache.keys().next().value);
  }
}

function normalizeSeries(value) {
  if (!Array.isArray(value)) return [];
  const pointsByDate = new Map();
  value.forEach((point) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) return;
    const date = normalizedDate(point.date);
    const peTtm = positiveNumber(point.peTtm);
    if (!date || peTtm === null) return;
    pointsByDate.set(date, { date, peTtm });
  });
  return Array.from(pointsByDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export function normalizeStockValuation(value, expectedSymbol = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const symbol = normalizedSymbol(value.symbol || expectedSymbol);
  const expected = normalizedSymbol(expectedSymbol);
  if (!symbol || (expected && symbol !== expected)) return null;

  const current = value.current && typeof value.current === 'object' && !Array.isArray(value.current)
    ? value.current
    : {};
  const summary = value.summary && typeof value.summary === 'object' && !Array.isArray(value.summary)
    ? value.summary
    : {};

  return {
    symbol,
    currency: normalizedCurrency(value.currency),
    source: normalizedSource(value.source),
    asOfDate: normalizedDate(value.asOfDate),
    windowStartDate: normalizedDate(value.windowStartDate),
    fetchedAt: normalizedTimestamp(value.fetchedAt),
    seriesFrequency: value.seriesFrequency === 'monthly-last-trading-day'
      ? value.seriesFrequency
      : '',
    statisticsFrequency: value.statisticsFrequency === 'daily'
      ? value.statisticsFrequency
      : '',
    current: {
      peTtm: positiveNumber(current.peTtm),
      peForward: positiveNumber(current.peForward),
    },
    percentile5y: percentileNumber(value.percentile5y),
    summary: {
      min: positiveNumber(summary.min),
      p25: positiveNumber(summary.p25),
      median: positiveNumber(summary.median),
      average: positiveNumber(summary.average),
      p75: positiveNumber(summary.p75),
      max: positiveNumber(summary.max),
      observationCount: positiveInteger(summary.observationCount),
    },
    series: normalizeSeries(value.series),
  };
}

function readCachedValuation({ identity, symbol, storage, now }) {
  const currentTime = nowValue(now);
  const memoryEntry = memoryCache.get(identity);
  if (memoryEntry) {
    if (memoryEntry.expiresAt > currentTime) return memoryEntry.data;
    memoryCache.delete(identity);
  }

  if (!storage) return null;
  try {
    const stored = JSON.parse(storage.getItem(storageKey(identity)) || 'null');
    const data = normalizeStockValuation(stored?.data, symbol);
    const expiresAt = finiteNumber(stored?.expiresAt);
    if (stored?.version !== STORAGE_VERSION || !data || expiresAt === null || expiresAt <= currentTime) {
      removeStored(storage, identity);
      return null;
    }
    const entry = { data, expiresAt };
    setMemoryEntry(identity, entry);
    return data;
  } catch {
    removeStored(storage, identity);
    return null;
  }
}

function writeCachedValuation({ identity, data, storage, expiresAt }) {
  const entry = { data, expiresAt };
  setMemoryEntry(identity, entry);
  try {
    storage?.setItem(storageKey(identity), JSON.stringify({
      version: STORAGE_VERSION,
      expiresAt,
      data,
    }));
  } catch {
    // Memory caching remains available when persistent storage is unavailable.
  }
}

export function getCachedStockValuation({
  userId,
  symbol,
  storage = defaultStorage(),
  now = Date.now,
} = {}) {
  const normalized = normalizedSymbol(symbol);
  const identity = identityKey(userId, normalized);
  if (!identity) return null;
  return readCachedValuation({ identity, symbol: normalized, storage, now });
}

export function loadStockValuation({
  userId,
  symbol,
  token,
  fetchImpl = globalThis.fetch,
  storage = defaultStorage(),
  now = Date.now,
} = {}) {
  const normalized = normalizedSymbol(symbol);
  const identity = identityKey(userId, normalized);
  if (!identity) return Promise.reject(new Error('missing authenticated user or symbol'));

  const cached = readCachedValuation({ identity, symbol: normalized, storage, now });
  if (cached) return Promise.resolve(cached);
  if (inFlightRequests.has(identity)) return inFlightRequests.get(identity);
  if (!String(token || '').trim()) return Promise.reject(new Error('missing session token'));
  if (typeof fetchImpl !== 'function') return Promise.reject(new Error('fetch unavailable'));

  let requestPromise;
  requestPromise = (async () => {
    const response = await fetchImpl(`/api/quote?symbols=${encodeURIComponent(normalized)}&view=valuation`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success === false) {
      throw new Error(body?.error || 'valuation request failed');
    }
    const data = normalizeStockValuation(body?.data, normalized);
    if (!data) throw new Error('valuation response invalid');
    writeCachedValuation({
      identity,
      data,
      storage,
      expiresAt: nowValue(now) + STOCK_VALUATION_CACHE_TTL_MS,
    });
    return data;
  })().finally(() => {
    if (inFlightRequests.get(identity) === requestPromise) inFlightRequests.delete(identity);
  });
  inFlightRequests.set(identity, requestPromise);
  return requestPromise;
}

export function resetStockValuationMemoryCache() {
  memoryCache.clear();
  inFlightRequests.clear();
}
