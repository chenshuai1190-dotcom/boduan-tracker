// Public instrument metadata only. Portfolio amounts never leave the component.
const CACHE_MS = 15 * 60 * 1000;
const FAILURE_MS = 60 * 1000;
const MAX_ENTRIES = 32;
const cache = new Map();
const failures = new Map();
const flights = new Map();
const epochs = new Map();
let generation = 0;

function failure(code) { return Object.assign(new Error(code), { code }); }
function put(map, key, value) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
}
function invalidate(identity) {
  for (const map of [cache, failures, flights]) {
    for (const [key, entry] of map) if (entry.identity === identity) map.delete(key);
  }
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
async function authenticate(identity, getSession) {
  try {
    const result = await getSession();
    const session = result?.data?.session;
    if (result?.error || session?.user?.id !== identity || !session?.access_token) throw failure('AUTH_REQUIRED');
    return session;
  } catch {
    invalidate(identity);
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
async function forCaller(promise, { signal, identity, getSession }) {
  if (signal?.aborted) throw abortError();
  let onAbort;
  try {
    const data = signal ? await Promise.race([promise, new Promise((_, reject) => {
      onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
    })]) : await promise;
    await authenticate(identity, getSession);
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
  fetchImpl = globalThis.fetch, getSession = defaultGetSession, now = Date.now, timeoutMs = 20000 } = {}) {
  const identity = typeof userId === 'string' ? userId.trim() : '';
  if (!identity) throw failure('AUTH_REQUIRED');
  const selected = normalizePortfolioOverlapSymbols(symbols);
  if (signal?.aborted) throw abortError();
  const session = await authenticate(identity, getSession);
  if (signal?.aborted) throw abortError();
  const timestamp = Number(typeof now === 'function' ? now() : now);
  if (!Number.isFinite(timestamp)) throw failure('INVALID_CLOCK');
  const key = JSON.stringify([identity, selected]);
  const caller = { signal, identity, getSession };
  if (flights.has(key)) return forCaller(flights.get(key).promise, caller);
  if (!force && cache.get(key)?.expiresAt > timestamp) return forCaller(Promise.resolve(cache.get(key).data), caller);
  if (!force && failures.get(key)?.retryAt > timestamp) throw failures.get(key).error;
  if (!selected.length) return forCaller(Promise.resolve({ version: 1, fetchedAt: new Date(timestamp).toISOString(), instruments: [] }), caller);
  if (flights.size >= MAX_ENTRIES) throw failure('RATE_LIMITED');
  const epoch = epochs.get(identity) || 0, requestGeneration = generation;
  let promise;
  promise = (async () => {
    try {
      const value = await request({ pair: selected.join(','), token: session.access_token, fetchImpl, timeoutMs });
      await authenticate(identity, getSession);
      current(identity, epoch, requestGeneration);
      const data = validate(value, selected, timestamp);
      const retrySoon = data.instruments.some(row => row.stale || row.holdingsStatus === 'unavailable');
      put(cache, key, { identity, data, expiresAt: timestamp + (retrySoon ? FAILURE_MS : CACHE_MS) });
      failures.delete(key);
      return data;
    } catch (error) {
      if (error.code === 'AUTH_REQUIRED') { invalidate(identity); throw error; }
      await authenticate(identity, getSession);
      current(identity, epoch, requestGeneration);
      put(failures, key, { identity, error, retryAt: timestamp + FAILURE_MS });
      throw error;
    }
  })().finally(() => { if (flights.get(key)?.promise === promise) flights.delete(key); });
  flights.set(key, { identity, promise });
  return forCaller(promise, caller);
}

export function clearPortfolioOverlapCache() {
  generation += 1;
  for (const map of [cache, failures, flights, epochs]) map.clear();
}
