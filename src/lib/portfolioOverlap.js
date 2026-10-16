// Public instrument metadata only. Portfolio amounts never leave the component.
import { normalizePortfolioOverlapMetadata } from './portfolioOverlapModel.js';

const CACHE_MS = 15 * 60 * 1000;
const FAILURE_MS = 60 * 1000;
const MAX_ENTRIES = 32;
const cache = new Map();
const failures = new Map();
const flights = new Map();
const epochs = new Map();
const fundSnapshots = new Map();
const snapshotStorages = new Set();
const SNAPSHOT_PREFIX = 'quote:portfolio-overlap:fund-holdings:v1:';
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
let generation = 0;

function failure(code) { return Object.assign(new Error(code), { code }); }
function put(map, key, value) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
}
function defaultStorage() { try { return globalThis.localStorage || null; } catch { return null; } }
function snapshotKey(identity) { return `${SNAPSHOT_PREFIX}${encodeURIComponent(identity)}`; }
function forgetSnapshots(identity, storage) {
  fundSnapshots.delete(identity);
  for (const target of new Set([storage, ...snapshotStorages])) {
    try { target?.removeItem(snapshotKey(identity)); } catch { /* Storage is optional. */ }
  }
}
function validFundSnapshot(raw, symbol, timestamp) {
  if (!Array.isArray(raw?.holdings) || raw.holdings.length > 2000) return null;
  const row = normalizePortfolioOverlapMetadata(raw, symbol);
  if (row.kind !== 'plain_etf' || !['available', 'partial'].includes(row.holdingsStatus)
    || !(row.coveragePct > 0)
    || row.asOfDate > new Date(timestamp).toISOString().slice(0, 10)
    || Date.parse(row.fetchedAt) > timestamp + 300000) return null;
  // Only the model's public, allowlisted metadata survives normalization.
  // Never persist an authenticated/signed URL as a disclosure source.
  if ([...new URL(row.source.url).searchParams.keys()].some(key => /token|api.?key|authorization|secret|signature/i.test(key))) return null;
  return { ...row, reason: row.stale ? 'cached_fund_holdings' : null };
}
function newerSnapshot(candidate, previous) {
  return !previous || candidate.asOfDate > previous.asOfDate
    || (candidate.asOfDate === previous.asOfDate && Date.parse(candidate.fetchedAt) >= Date.parse(previous.fetchedAt));
}
function readFundSnapshots(identity, storage, timestamp) {
  if (storage) snapshotStorages.add(storage);
  const rows = new Map();
  const add = raw => {
    let symbol;
    try { [symbol] = normalizePortfolioOverlapSymbols([raw?.symbol]); } catch { return; }
    const row = validFundSnapshot(raw, symbol, timestamp);
    if (row && newerSnapshot(row, rows.get(symbol))) rows.set(symbol, row);
  };
  try {
    const serialized = storage?.getItem(snapshotKey(identity));
    if (typeof serialized === 'string' && serialized.length <= MAX_SNAPSHOT_BYTES) {
      const value = JSON.parse(serialized);
      if (value?.version === 1 && Array.isArray(value.instruments) && value.instruments.length <= 40) value.instruments.forEach(add);
    }
  } catch { /* Corrupt or unavailable storage must not block fresh data. */ }
  for (const row of fundSnapshots.get(identity)?.values() || []) add(row);
  put(fundSnapshots, identity, rows);
  return rows;
}
function saveFundSnapshots(identity, rows, storage) {
  for (const [symbol, previous] of fundSnapshots.get(identity) || []) {
    if (!rows.has(symbol) || newerSnapshot(previous, rows.get(symbol))) rows.set(symbol, previous);
  }
  while (rows.size > 40) rows.delete(rows.keys().next().value);
  put(fundSnapshots, identity, rows);
  try {
    const serialized = JSON.stringify({ version: 1, instruments: [...rows.values()] });
    if (serialized.length <= MAX_SNAPSHOT_BYTES) storage?.setItem(snapshotKey(identity), serialized);
  } catch { /* In-memory fallback remains available when storage is full. */ }
}
function fallbackFund(row) { return { ...row, stale: true, reason: 'cached_fund_holdings' }; }
function unavailableInstrument(symbol, timestamp) {
  return { symbol, name: symbol, kind: 'unknown', holdingsStatus: 'unavailable', source: null,
    asOfDate: null, fetchedAt: new Date(timestamp).toISOString(), stale: true,
    reason: 'metadata_unavailable', coveragePct: null, holdings: [] };
}
function mergeFundSnapshots(data, rows, timestamp) {
  return { ...data, instruments: data.instruments.map(raw => {
    const candidate = validFundSnapshot(raw, raw.symbol, timestamp);
    const previous = rows.get(raw.symbol);
    if (candidate && newerSnapshot(candidate, previous)) {
      rows.delete(raw.symbol);
      rows.set(raw.symbol, candidate);
      return candidate;
    }
    const normalized = normalizePortfolioOverlapMetadata(raw, raw.symbol);
    if (previous && (candidate || normalized.holdingsStatus === 'unavailable')) return fallbackFund(previous);
    return normalized.reason === 'invalid_metadata' ? unavailableInstrument(raw.symbol, timestamp) : raw;
  }) };
}
function invalidate(identity, storage) {
  for (const map of [cache, failures, flights]) {
    for (const [key, entry] of map) if (entry.identity === identity) map.delete(key);
  }
  forgetSnapshots(identity, storage);
  put(epochs, identity, (epochs.get(identity) || 0) + 1);
}
function abortError() { return Object.assign(failure('REQUEST_ABORTED'), { name: 'AbortError' }); }

export function normalizePortfolioOverlapSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length > 200) throw failure('INVALID_SYMBOLS');
  const selected = [];
  for (const value of symbols) {
    if (typeof value !== 'string') throw failure('INVALID_SYMBOLS');
    const symbol = value.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/.test(symbol) || symbol.length > 15
      || /\.(?:US|INDX|FOREX|CC|LSE|HK|TO)$/.test(symbol)) throw failure('INVALID_SYMBOLS');
    selected.push(symbol);
  }
  const unique = [...new Set(selected)].sort();
  if (unique.length > 40) throw failure('INVALID_SYMBOLS');
  return unique;
}

async function defaultGetSession() {
  const { supabase } = await import('./supabase.js');
  if (!supabase) throw failure('AUTH_REQUIRED');
  return supabase.auth.getSession();
}
async function authenticate(identity, getSession, storage) {
  try {
    const result = await getSession();
    const session = result?.data?.session;
    if (result?.error || session?.user?.id !== identity || !session?.access_token) throw failure('AUTH_REQUIRED');
    return session;
  } catch {
    invalidate(identity, storage);
    throw failure('AUTH_REQUIRED');
  }
}
function current(identity, epoch, requestGeneration) {
  if (requestGeneration !== generation) throw failure('REQUEST_SUPERSEDED');
  if ((epochs.get(identity) || 0) !== epoch) throw failure('AUTH_REQUIRED');
}
function validate(value, selected, timestamp) {
  if (value?.version !== 1 || typeof value.fetchedAt !== 'string'
    || !Number.isFinite(Date.parse(value.fetchedAt)) || Date.parse(value.fetchedAt) > timestamp + 300000
    || !Array.isArray(value.instruments) || value.instruments.length !== selected.length) throw failure('INVALID_DATA');
  const seen = new Set();
  for (const row of value.instruments) {
    if (!row || !selected.includes(row.symbol) || seen.has(row.symbol)
      || !['stock', 'plain_etf', 'leveraged_etf', 'unknown'].includes(row.kind)
      || !['available', 'partial', 'unavailable', 'not_applicable'].includes(row.holdingsStatus)
      || !Array.isArray(row.holdings) || row.holdings.length > 2000) throw failure('INVALID_DATA');
    seen.add(row.symbol);
  }
  // The model separately verifies dated sources, equity rows and weight totals.
  return { version: 1, fetchedAt: value.fetchedAt, instruments: value.instruments };
}
async function forCaller(promise, { signal, identity, getSession, storage }) {
  if (signal?.aborted) throw abortError();
  let onAbort;
  try {
    const data = signal ? await Promise.race([promise, new Promise((_, reject) => {
      onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
    })]) : await promise;
    await authenticate(identity, getSession, storage);
    if (signal?.aborted) throw abortError();
    return structuredClone(data);
  } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
}
async function request({ pair, token, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        let response;
        try {
          response = await fetchImpl(`/api/quote?view=portfolio-overlap&symbols=${encodeURIComponent(pair)}`, {
            headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
          });
        } catch { throw failure('NETWORK_ERROR'); }
        if ([401, 403].includes(response.status)) throw failure('AUTH_REQUIRED');
        if (!response.ok) throw failure(response.status === 429 ? 'RATE_LIMITED' : 'NETWORK_ERROR');
        const body = await response.json().catch(() => null);
        if (body?.success !== true) throw failure('INVALID_DATA');
        return body.data;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(failure('NETWORK_ERROR')); }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function loadPortfolioOverlap({ userId, symbols = [], force = false, signal,
  fetchImpl = globalThis.fetch, getSession = defaultGetSession, now = Date.now, timeoutMs = 20000,
  storage = defaultStorage() } = {}) {
  const identity = typeof userId === 'string' ? userId.trim() : '';
  if (!identity) throw failure('AUTH_REQUIRED');
  const selected = normalizePortfolioOverlapSymbols(symbols);
  if (signal?.aborted) throw abortError();
  const epoch = epochs.get(identity) || 0, requestGeneration = generation;
  const session = await authenticate(identity, getSession, storage);
  current(identity, epoch, requestGeneration);
  if (signal?.aborted) throw abortError();
  const timestamp = Number(typeof now === 'function' ? now() : now);
  if (!Number.isFinite(timestamp)) throw failure('INVALID_CLOCK');
  const key = JSON.stringify([identity, selected]);
  const caller = { signal, identity, getSession, storage };
  if (flights.has(key)) return forCaller(flights.get(key).promise, caller);
  if (!force && cache.get(key)?.expiresAt > timestamp) return forCaller(Promise.resolve(cache.get(key).data), caller);
  if (!force && failures.get(key)?.retryAt > timestamp) throw failures.get(key).error;
  if (!selected.length) return forCaller(Promise.resolve({ version: 1, fetchedAt: new Date(timestamp).toISOString(), instruments: [] }), caller);
  if (flights.size >= MAX_ENTRIES) throw failure('RATE_LIMITED');
  const previousResponse = cache.get(key)?.data;
  let promise;
  promise = (async () => {
    try {
      const value = await request({ pair: selected.join(','), token: session.access_token, fetchImpl, timeoutMs });
      await authenticate(identity, getSession, storage);
      current(identity, epoch, requestGeneration);
      const snapshots = readFundSnapshots(identity, storage, timestamp);
      const data = mergeFundSnapshots(validate(value, selected, timestamp), snapshots, timestamp);
      saveFundSnapshots(identity, snapshots, storage);
      const retrySoon = data.instruments.some(row => row.stale || row.holdingsStatus === 'unavailable');
      put(cache, key, { identity, data, expiresAt: timestamp + (retrySoon ? FAILURE_MS : CACHE_MS) });
      failures.delete(key);
      return data;
    } catch (error) {
      if (error.code === 'AUTH_REQUIRED') { invalidate(identity, storage); throw error; }
      await authenticate(identity, getSession, storage);
      current(identity, epoch, requestGeneration);
      const snapshots = readFundSnapshots(identity, storage, timestamp);
      if (selected.some(symbol => snapshots.has(symbol))) {
        const data = { version: 1, fetchedAt: new Date(timestamp).toISOString(), instruments: selected.map(symbol => {
          if (snapshots.has(symbol)) return fallbackFund(snapshots.get(symbol));
          const previous = normalizePortfolioOverlapMetadata(previousResponse?.instruments.find(row => row.symbol === symbol), symbol);
          return ['stock', 'leveraged_etf'].includes(previous.kind) ? { ...previous, stale: true } : unavailableInstrument(symbol, timestamp);
        }) };
        put(cache, key, { identity, data, expiresAt: timestamp + FAILURE_MS });
        failures.delete(key);
        return data;
      }
      put(failures, key, { identity, error, retryAt: timestamp + FAILURE_MS });
      throw error;
    }
  })().finally(() => { if (flights.get(key)?.promise === promise) flights.delete(key); });
  flights.set(key, { identity, promise });
  return forCaller(promise, caller);
}

export function clearPortfolioOverlapCache({ storage = defaultStorage() } = {}) {
  generation += 1;
  for (const target of new Set([storage, ...snapshotStorages])) {
    try {
      const keys = Array.from({ length: target?.length || 0 }, (_, index) => target.key(index));
      for (const key of keys) if (key?.startsWith(SNAPSHOT_PREFIX)) target.removeItem(key);
    } catch { /* Clearing memory and request generation still prevents reuse. */ }
  }
  snapshotStorages.clear();
  for (const map of [cache, failures, flights, epochs, fundSnapshots]) map.clear();
}
