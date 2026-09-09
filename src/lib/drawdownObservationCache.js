import { normalizeDcaHistoryData, DCA_HISTORY_FAILURE_RETRY_MS, DCA_HISTORY_STALE_RETRY_MS } from './dcaHistory.js';
import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';
import { normalizeInvestmentSymbol } from './investmentComparisonModel.js';

export const DRAWDOWN_CACHE_PREFIX = 'boduan.drawdown-history.v1:';
export const DRAWDOWN_CACHE_MAX_SYMBOLS = 64;
export const DRAWDOWN_CACHE_MAX_BYTES = 2 * 1024 * 1024;
export const DRAWDOWN_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_IDENTITIES = 4;
const identities = new Map();
const epochs = new Map();
const viewStates = new Map();
const invalidatedIdentities = new Set();
let generation = 0;

function identityOf(value) {
  return typeof value === 'string' && value.trim() && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}

function timestampOf(now = Date.now) {
  try {
    const value = typeof now === 'function' ? now() : now;
    return typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) ? value : null;
  } catch { return null; }
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

function storageKey(identity) { return `${DRAWDOWN_CACHE_PREFIX}${encodeURIComponent(identity)}`; }
function validTime(value, now) { return Number.isFinite(value) && value >= 0 && value <= now + 300000; }
function publicError(error) {
  const code = typeof error === 'string' ? error : error?.code;
  return typeof code === 'string' && /^[A-Z_]{1,50}$/.test(code) ? { code } : { code: 'REQUEST_ERROR' };
}

function pending(descriptor) {
  return { ...descriptor, points: [], source: null, priceBasis: null, currency: 'USD',
    asOfDate: null, expectedAsOfDate: null, availableFromDate: null, fetchedAt: null,
    stale: false, staleReason: '', status: 'loading', error: null };
}

function enforceCapacity(entries) {
  while (entries.size > DRAWDOWN_CACHE_MAX_SYMBOLS) entries.delete(entries.keys().next().value);
}

function touchEntry(entries, symbol, entry) {
  entries.delete(symbol);
  entries.set(symbol, entry);
  enforceCapacity(entries);
}

function wireHistory(instrument) {
  return {
    version: instrument?.version, source: instrument?.source, symbol: instrument?.symbol,
    name: instrument?.name, type: instrument?.type, currency: instrument?.currency,
    priceBasis: instrument?.priceBasis, availableFromDate: instrument?.availableFromDate,
    asOfDate: instrument?.asOfDate, expectedAsOfDate: instrument?.expectedAsOfDate,
    fetchedAt: instrument?.fetchedAt, stale: instrument?.stale, staleReason: instrument?.staleReason,
    rows: instrument?.points,
  };
}

function compactHistory(data) {
  const cutoff = new Date(Date.parse(`${data.asOfDate}T00:00:00Z`) - 400 * DAY_MS).toISOString().slice(0, 10);
  const rows = data.rows.filter(row => row.date >= cutoff).slice(-320);
  // The wire validator requires two genuine observations. An extremely sparse
  // series cannot be made persistable by inventing a second session.
  if (rows.length < 2) return null;
  return { ...data, rows, availableFromDate: rows[0].date };
}

function stillUsable(entry, timestamp) {
  return entry && validTime(entry.storedAt, timestamp)
    && timestamp - entry.storedAt <= DRAWDOWN_CACHE_MAX_AGE_MS
    && (!entry.data || (Date.parse(entry.data.fetchedAt) <= timestamp + 300000
      && timestamp - Date.parse(entry.data.fetchedAt) <= DRAWDOWN_CACHE_MAX_AGE_MS));
}

function hydrate(identity, storage, timestamp) {
  const entries = new Map();
  if (!storage) return entries;
  try {
    const raw = storage.getItem(storageKey(identity));
    // A conservative UTF-16 bound also prevents parsing unexpectedly large data.
    if (typeof raw !== 'string' || raw.length * 2 > DRAWDOWN_CACHE_MAX_BYTES) return entries;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || value.userId !== identity || !validTime(value.updatedAt, timestamp)
      || !Array.isArray(value.entries) || value.entries.length > DRAWDOWN_CACHE_MAX_SYMBOLS) return entries;
    const expectedAsOfDate = getInvestmentComparisonExpectedCloseDate(timestamp);
    for (const item of value.entries) {
      const symbol = normalizeInvestmentSymbol(item?.history?.symbol);
      if (!symbol || entries.has(symbol) || !validTime(item.storedAt, timestamp)
        || !validTime(item.lastAccessedAt, timestamp) || !Array.isArray(item.history.rows)
        || item.history.rows.length > 320) continue;
      const data = normalizeDcaHistoryData(item.history, { symbol, expectedAsOfDate, now: timestamp });
      if (!data) continue;
      const entry = { data, storedAt: item.storedAt, lastAccessedAt: item.lastAccessedAt,
        retryAt: validTime(item.lastAttemptAt, timestamp) && Number.isFinite(item.retryAt)
          && item.retryAt >= item.lastAttemptAt && item.retryAt <= item.lastAttemptAt + DCA_HISTORY_STALE_RETRY_MS ? item.retryAt : 0,
        lastAttemptAt: validTime(item.lastAttemptAt, timestamp) ? item.lastAttemptAt : 0,
        attemptExpectedAsOfDate: item.attemptExpectedAsOfDate === data.expectedAsOfDate ? item.attemptExpectedAsOfDate : '',
        error: item.error ? publicError(item.error) : null,
      };
      if (stillUsable(entry, timestamp)) entries.set(symbol, entry);
    }
    return new Map([...entries].sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt));
  } catch { return entries; }
}

function stateFor(identity, storage, timestamp) {
  let state = identities.get(identity);
  if (!state || state.storage !== storage) state = { storage, entries: invalidatedIdentities.has(identity) ? new Map() : hydrate(identity, storage, timestamp) };
  identities.delete(identity);
  identities.set(identity, state);
  while (identities.size > MAX_MEMORY_IDENTITIES) identities.delete(identities.keys().next().value);
  return state;
}

function persist(identity, state, timestamp) {
  if (!state.storage) return true;
  try {
    const entries = [...state.entries.values()].filter(entry => entry.data && stillUsable(entry, timestamp)).map(entry => ({
      history: entry.data, storedAt: entry.storedAt, lastAccessedAt: entry.lastAccessedAt,
      retryAt: entry.retryAt, lastAttemptAt: entry.lastAttemptAt,
      attemptExpectedAsOfDate: entry.attemptExpectedAsOfDate, error: entry.error,
    }));
    let value;
    do {
      value = JSON.stringify({ version: 1, userId: identity, updatedAt: timestamp, entries });
      if (value.length * 2 <= DRAWDOWN_CACHE_MAX_BYTES) break;
      const removed = entries.shift();
      if (removed) state.entries.delete(removed.history.symbol);
    } while (entries.length);
    state.storage.setItem(storageKey(identity), value);
    return true;
  } catch { return false; /* Quota, private mode and disabled storage never hide memory data. */ }
}

function ticketCurrent(identity, ticket) {
  return !ticket || (ticket.identity === identity && ticket.generation === generation && ticket.epoch === (epochs.get(identity) || 0));
}

/** Capture before starting asynchronous work. Clear/reset invalidates old tickets. */
export function beginDrawdownCacheRequest(userId) {
  const identity = identityOf(userId);
  return Object.freeze({ identity, generation, epoch: epochs.get(identity) || 0 });
}

/** Membership and descriptor fields always come from the current caller, never disk. */
export function getDrawdownSnapshot({ userId, instruments = [], now = Date.now, storage } = {}) {
  const descriptors = Array.isArray(instruments) ? instruments : [];
  const identity = identityOf(userId), timestamp = timestampOf(now);
  const state = identity && timestamp !== null ? stateFor(identity, resolveStorage(storage), timestamp) : null;
  const expected = timestamp !== null ? getInvestmentComparisonExpectedCloseDate(timestamp) : null;
  const rows = descriptors.map(descriptor => {
    const symbol = normalizeInvestmentSymbol(descriptor?.symbol);
    const entry = state?.entries.get(symbol);
    if (!entry || !stillUsable(entry, timestamp)) {
      if (entry) state.entries.delete(symbol);
      return pending(descriptor);
    }
    entry.lastAccessedAt = timestamp;
    touchEntry(state.entries, symbol, entry);
    const retryAt = entry.attemptExpectedAsOfDate === expected ? entry.retryAt : 0;
    if (!entry.data) return { ...pending(descriptor), status: 'error', error: entry.error, retryAt, expectedAsOfDate: expected };
    if (entry.data.expectedAsOfDate > expected || entry.data.asOfDate > expected) return pending(descriptor);
    // Existing history was validated once on hydration/store. Updating the close
    // cutoff only changes freshness metadata, not hundreds of historical rows.
    const stale = entry.data.stale || entry.data.asOfDate < expected;
    const { rows: points, ...metadata } = entry.data;
    return { ...metadata, ...descriptor, symbol, points: points.map(point => ({ ...point })),
      kind: entry.data.type === 'ETF' ? 'etf' : 'stock', expectedAsOfDate: expected,
      stale, staleReason: stale ? entry.data.staleReason || 'incomplete_close' : '',
      status: 'ready', error: entry.error, retryAt, cacheState: 'local' };
  });
  return { instruments: rows, completed: rows.filter(row => row.status !== 'loading').length, total: rows.length };
}

export function shouldRefreshDrawdown(row, now = Date.now) {
  const timestamp = timestampOf(now);
  if (timestamp === null) return false;
  const expected = getInvestmentComparisonExpectedCloseDate(timestamp);
  if (row?.expectedAsOfDate === expected && Number.isFinite(row.retryAt) && row.retryAt > timestamp) return false;
  return row?.status !== 'ready' || row?.source !== 'EODHD_EOD' || row?.priceBasis !== 'adjusted_close'
    || row?.asOfDate !== expected || row?.stale === true;
}

export function storeDrawdownHistory({ userId, instrument, now = Date.now, storage, ticket } = {}) {
  const identity = identityOf(userId), timestamp = timestampOf(now);
  if (!identity || timestamp === null || !ticketCurrent(identity, ticket) || instrument?.status !== 'ready') return false;
  const expectedAsOfDate = getInvestmentComparisonExpectedCloseDate(timestamp);
  const validated = normalizeDcaHistoryData(wireHistory(instrument), { symbol: instrument.symbol, expectedAsOfDate, now: timestamp });
  const data = validated && compactHistory(validated);
  if (!data || timestamp - Date.parse(data.fetchedAt) > DRAWDOWN_CACHE_MAX_AGE_MS) return false;
  const state = stateFor(identity, resolveStorage(storage), timestamp), previous = state.entries.get(data.symbol);
  if (previous?.data && (previous.data.asOfDate > data.asOfDate
    || (previous.data.asOfDate === data.asOfDate && Date.parse(previous.data.fetchedAt) > Date.parse(data.fetchedAt)))) return false;
  touchEntry(state.entries, data.symbol, { data, storedAt: timestamp, lastAccessedAt: timestamp,
    lastAttemptAt: timestamp, attemptExpectedAsOfDate: expectedAsOfDate,
    retryAt: data.stale ? timestamp + DCA_HISTORY_STALE_RETRY_MS : 0, error: null });
  if (persist(identity, state, timestamp)) invalidatedIdentities.delete(identity);
  return true;
}

export function recordDrawdownFailure({ userId, symbol, error, now = Date.now, storage, ticket } = {}) {
  const identity = identityOf(userId), selected = normalizeInvestmentSymbol(symbol), timestamp = timestampOf(now);
  if (!identity || !selected || timestamp === null || !ticketCurrent(identity, ticket)) return false;
  const safeError = publicError(error);
  // An authorization failure is not ordinary stale market data. The orchestrator
  // must clear the identity and discard progress instead of recording fallback.
  if (['AUTH_REQUIRED', 'REQUEST_SUPERSEDED', 'REQUEST_ABORTED', 'INVALID_CLOCK'].includes(safeError.code)) return false;
  const state = stateFor(identity, resolveStorage(storage), timestamp);
  const previous = state.entries.get(selected), expectedAsOfDate = getInvestmentComparisonExpectedCloseDate(timestamp);
  const data = stillUsable(previous, timestamp) ? previous.data : null;
  touchEntry(state.entries, selected, { data: data ? { ...data, expectedAsOfDate, stale: true,
    staleReason: ['QUOTA_EXHAUSTED', 'RATE_LIMITED'].includes(safeError.code) ? 'quota_exhausted' : 'provider_unavailable' } : null,
  storedAt: data ? previous.storedAt : timestamp, lastAccessedAt: timestamp,
  lastAttemptAt: timestamp, attemptExpectedAsOfDate: expectedAsOfDate,
  retryAt: timestamp + DCA_HISTORY_FAILURE_RETRY_MS, error: safeError });
  persist(identity, state, timestamp);
  return true;
}

export function clearDrawdownObservationCache(userId, { storage } = {}) {
  const identity = identityOf(userId);
  if (!identity) return;
  const targetStorage = storage !== undefined ? storage : identities.get(identity)?.storage ?? resolveStorage();
  epochs.set(identity, (epochs.get(identity) || 0) + 1);
  // A storage deletion can fail in private mode. Keep a process-local tombstone
  // so the next render cannot rehydrate a just-invalidated identity's disk data.
  invalidatedIdentities.add(identity);
  identities.delete(identity);
  viewStates.delete(identity);
  try { targetStorage?.removeItem(storageKey(identity)); } catch { /* Best effort; no data is shown after identity clear. */ }
}

/** Drops process state, retaining disk histories for a cold-start hydration. */
export function resetDrawdownObservationMemoryCache() {
  generation += 1;
  identities.clear();
  epochs.clear();
  viewStates.clear();
  invalidatedIdentities.clear();
}

export function getDrawdownViewState(userId) {
  return { scope: 'watchlist', minDepth: 0, order: 'deepest', scrollTop: 0, ...viewStates.get(identityOf(userId)) };
}

export function setDrawdownViewState(userId, value) {
  const identity = identityOf(userId);
  if (!identity) return;
  if (value === null) { viewStates.delete(identity); return; }
  if (!value || typeof value !== 'object') return;
  const next = getDrawdownViewState(identity);
  if (['watchlist', 'holdings'].includes(value.scope)) next.scope = value.scope;
  if ([0, 10, 20].includes(value.minDepth)) next.minDepth = value.minDepth;
  if (['deepest', 'shallowest'].includes(value.order)) next.order = value.order;
  if (typeof value.scrollTop === 'number' && Number.isFinite(value.scrollTop) && value.scrollTop >= 0) next.scrollTop = Math.min(value.scrollTop, 1000000);
  viewStates.delete(identity);
  viewStates.set(identity, next);
  while (viewStates.size > MAX_MEMORY_IDENTITIES) viewStates.delete(viewStates.keys().next().value);
}
