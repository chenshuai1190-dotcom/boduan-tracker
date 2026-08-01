export const STOCK_FUNDAMENTALS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = 'boduan.stock-fundamentals.v1';
const MAX_MEMORY_ENTRIES = 50;
const memoryCache = new Map();
const inFlightRequests = new Map();

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function normalizedSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9._-]{1,15}$/.test(symbol) ? symbol : '';
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

export function normalizeStockFundamentals(value, expectedSymbol = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const symbol = normalizedSymbol(value.symbol || expectedSymbol);
  const expected = normalizedSymbol(expectedSymbol);
  if (!symbol || (expected && symbol !== expected)) return null;
  return {
    symbol,
    currency: String(value.currency || 'USD').trim().toUpperCase() || 'USD',
    source: String(value.source || ''),
    asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.asOfDate || '')) ? String(value.asOfDate) : '',
    fetchedAt: String(value.fetchedAt || ''),
    marketCapitalization: positiveNumber(value.marketCapitalization),
    peTtm: positiveNumber(value.peTtm),
    peForward: positiveNumber(value.peForward),
    revenueGrowthTtmPct: finiteNumber(value.revenueGrowthTtmPct),
    netMarginTtmPct: finiteNumber(value.netMarginTtmPct),
    freeCashFlowMarginTtmPct: finiteNumber(value.freeCashFlowMarginTtmPct),
  };
}

function readCachedFundamentals({ identity, symbol, storage, now }) {
  const currentTime = nowValue(now);
  const memoryEntry = memoryCache.get(identity);
  if (memoryEntry) {
    if (memoryEntry.expiresAt > currentTime) return memoryEntry.data;
    memoryCache.delete(identity);
  }

  if (!storage) return null;
  try {
    const stored = JSON.parse(storage.getItem(storageKey(identity)) || 'null');
    const data = normalizeStockFundamentals(stored?.data, symbol);
    if (stored?.version !== STORAGE_VERSION || !data || Number(stored.expiresAt) <= currentTime) {
      removeStored(storage, identity);
      return null;
    }
    const entry = { data, expiresAt: Number(stored.expiresAt) };
    setMemoryEntry(identity, entry);
    return data;
  } catch {
    removeStored(storage, identity);
    return null;
  }
}

function writeCachedFundamentals({ identity, data, storage, expiresAt }) {
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

export function getCachedStockFundamentals({
  userId,
  symbol,
  storage = defaultStorage(),
  now = Date.now,
} = {}) {
  const normalized = normalizedSymbol(symbol);
  const identity = identityKey(userId, normalized);
  if (!identity) return null;
  return readCachedFundamentals({ identity, symbol: normalized, storage, now });
}

export function loadStockFundamentals({
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

  const cached = readCachedFundamentals({ identity, symbol: normalized, storage, now });
  if (cached) return Promise.resolve(cached);
  if (inFlightRequests.has(identity)) return inFlightRequests.get(identity);
  if (!String(token || '').trim()) return Promise.reject(new Error('missing session token'));
  if (typeof fetchImpl !== 'function') return Promise.reject(new Error('fetch unavailable'));

  let requestPromise;
  requestPromise = (async () => {
    const response = await fetchImpl(`/api/quote?symbols=${encodeURIComponent(normalized)}&view=fundamentals`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success === false) {
      throw new Error(body?.error || 'fundamentals request failed');
    }
    const data = normalizeStockFundamentals(body?.data, normalized);
    if (!data) throw new Error('fundamentals response invalid');
    writeCachedFundamentals({
      identity,
      data,
      storage,
      expiresAt: nowValue(now) + STOCK_FUNDAMENTALS_CACHE_TTL_MS,
    });
    return data;
  })().finally(() => {
    if (inFlightRequests.get(identity) === requestPromise) inFlightRequests.delete(identity);
  });
  inFlightRequests.set(identity, requestPromise);
  return requestPromise;
}

export function resetStockFundamentalsMemoryCache() {
  memoryCache.clear();
  inFlightRequests.clear();
}
