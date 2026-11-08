import { investmentComparisonError, normalizeInvestmentSymbol } from './investmentComparisonModel.js';
import { loadStockComparison } from './stockComparison.js';
import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';
import { createReviewSessionGuard } from './reviewSessionGuard.js';

export const REVIEW_STOCK_REPLAY_MAX_IN_FLIGHT = 2;
export const REVIEW_STOCK_REPLAY_CACHE_MS = 6 * 60 * 60 * 1000;
export const REVIEW_STOCK_REPLAY_INCOMPLETE_CACHE_MS = 5 * 60 * 1000;
export const REVIEW_STOCK_REPLAY_DISPLAY_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 16;
async function defaultGetSessionGuard(onIdentityChange) {
  const { supabase } = await import('./supabase.js');
  let owner;
  supabase?.auth?.onAuthStateChange?.((event, session) => {
    const next = session?.user?.id || null;
    if (event === 'SIGNED_OUT' || owner !== undefined && owner !== next) onIdentityChange();
    owner = next;
  });
  return createReviewSessionGuard(supabase);
}

function requestTime(args) {
  const value = typeof args.now === 'function' ? args.now() : args.now ?? Date.now();
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) throw investmentComparisonError('INVALID_CLOCK', 'Unable to determine the completed market session.');
  return timestamp;
}

function requestAborted() {
  const error = investmentComparisonError('REQUEST_ABORTED', 'Stock replay request cancelled.');
  error.name = 'AbortError';
  return error;
}

function requestKey({ userId, symbols = ['QQQ', 'TQQQ'], startDate, endDate }, expectedClose) {
  return JSON.stringify([
    typeof userId === 'string' ? userId.trim() : '',
    Array.isArray(symbols) ? symbols.map(normalizeInvestmentSymbol) : symbols,
    startDate,
    endDate,
    expectedClose,
  ]);
}

/** Replay-only memory cache of validated prices, never trades or post content.
 * The ordinary comparison loader and all timeline requests keep their policies.
 * Session tickets invalidate synchronous display on sign-out/account changes. */
export function createReviewStockReplayHistoryLoader({ loadHistory = loadStockComparison, getSessionGuard = defaultGetSessionGuard } = {}) {
  const pending = new Map(), queue = [], success = new Map();
  const deliveries = new WeakMap(), listeners = new Set(), failedEpochs = new Map();
  let active = 0, generation = 0, guardPromise;

  function invalidate() {
    generation += 1;
    success.clear();
    failedEpochs.clear();
    for (const entry of pending.values()) entry.controller.abort();
    pending.clear();
    for (const listener of listeners) listener();
  }

  function validEntry(cached, timestamp) {
    if (!cached || cached.generation !== generation || cached.failedEpoch !== (failedEpochs.get(cached.key) || 0)) return false;
    try {
      cached.guard.assertCurrent(cached.ticket);
      return timestamp >= cached.createdAt && timestamp < cached.displayUntil;
    } catch { return false; }
  }

  function cachedEntry(key, timestamp) {
    const cached = success.get(key);
    if (!cached) return null;
    if (validEntry(cached, timestamp)) return cached;
    success.delete(key); return null;
  }

  async function read(entry) {
    const { options, expectedClose, key } = entry;
    const guard = await (guardPromise ||= Promise.resolve().then(() => getSessionGuard(invalidate)));
    const ticket = await guard.begin(options.userId?.trim());
    if (entry.generation !== generation || entry.controller.signal.aborted) throw requestAborted();
    const cached = cachedEntry(key, requestTime(options));
    const reused = !options.force && cached?.freshUntil > requestTime(options);
    let data;
    if (reused) data = cached.data;
    else data = await loadHistory({ ...options, signal: entry.controller.signal });
    await guard.verify(ticket);
    if (entry.generation !== generation || entry.controller.signal.aborted) throw requestAborted();
    const completedAt = requestTime(options);
    if (getInvestmentComparisonExpectedCloseDate(completedAt) !== expectedClose) {
      throw investmentComparisonError('REQUEST_SUPERSEDED', 'A new market session is available. Please reload stock history.');
    }
    // Only a real refreshed result renews freshness; browsing cannot slide TTL.
    if (!reused) {
      const complete = Array.isArray(data?.symbols) && data.symbols.length > 0
        && data.symbols.every(symbol => data.series?.[symbol]?.rows?.at(-1)?.date === options.endDate);
      success.delete(key);
      const saved = { key, data, guard, ticket, generation, failedEpoch: failedEpochs.get(key) || 0, createdAt: completedAt,
        freshUntil: completedAt + (complete ? REVIEW_STOCK_REPLAY_CACHE_MS : REVIEW_STOCK_REPLAY_INCOMPLETE_CACHE_MS),
        displayUntil: completedAt + REVIEW_STOCK_REPLAY_DISPLAY_MS };
      success.set(key, saved);
      if (data && typeof data === 'object') deliveries.set(data, saved);
      while (success.size > MAX_CACHE_ENTRIES) success.delete(success.keys().next().value);
    }
    return data;
  }

  function forget(entry) {
    if (pending.get(entry.key) === entry) pending.delete(entry.key);
  }

  function finish(entry, succeeded, result) {
    active -= 1;
    entry.state = 'settled';
    forget(entry);
    // Network/provider interruptions may leave a verified historical chart on
    // screen; revoked identity, malformed data and obsolete work fail closed.
    if (!succeeded && !entry.controller.signal.aborted && entry.generation === generation && !['NETWORK_ERROR', 'PROVIDER_UNAVAILABLE', 'QUOTA_EXHAUSTED', 'RATE_LIMITED', 'REQUEST_ABORTED'].includes(result?.code)) {
      failedEpochs.set(entry.key, (failedEpochs.get(entry.key) || 0) + 1);
      success.delete(entry.key);
    }
    for (const consumer of entry.consumers) {
      consumer.signal?.removeEventListener('abort', consumer.onAbort);
      if (succeeded) consumer.resolve(result);
      else consumer.reject(result);
    }
    entry.consumers.clear();
    drain();
  }

  function drain() {
    while (active < REVIEW_STOCK_REPLAY_MAX_IN_FLIGHT && queue.length) {
      const entry = queue.shift();
      entry.state = 'running';
      active += 1;
      Promise.resolve().then(() => {
        if (entry.controller.signal.aborted) throw requestAborted();
        return read(entry);
      }).then(data => finish(entry, true, data), error => finish(entry, false, error));
    }
  }

  function loadReviewStockReplayHistory(args = {}) {
    if (args.signal?.aborted) return Promise.reject(requestAborted());
    let expectedClose;
    try { expectedClose = getInvestmentComparisonExpectedCloseDate(requestTime(args)); }
    catch (error) { return Promise.reject(error); }
    const key = requestKey(args, expectedClose);
    let entry = pending.get(key);
    if (!entry) {
      entry = { key, expectedClose, generation, options: { ...args, ...(Array.isArray(args.symbols) ? { symbols: [...args.symbols] } : {}) },
        controller: new AbortController(), consumers: new Set(), state: 'queued' };
      pending.set(key, entry);
      queue.push(entry);
    } else if (entry.state === 'queued' && args.force) {
      entry.options.force = true;
    }

    const promise = new Promise((resolve, reject) => {
      const consumer = { resolve, reject, signal: args.signal, onAbort: null };
      consumer.onAbort = () => {
        if (!entry.consumers.delete(consumer)) return;
        consumer.signal?.removeEventListener('abort', consumer.onAbort);
        reject(requestAborted());
        if (entry.consumers.size) return;
        forget(entry);
        if (entry.state === 'queued') queue.splice(queue.indexOf(entry), 1);
        // Keep the slot until the aborted loader settles, so a slow cancellation
        // cannot make the number of active underlying requests exceed the bound.
        entry.controller.abort();
      };
      entry.consumers.add(consumer);
      consumer.signal?.addEventListener('abort', consumer.onAbort, { once: true });
    });
    drain();
    return promise;
  }
  loadReviewStockReplayHistory.peek = (args = {}) => {
    try {
      const timestamp = requestTime(args), expectedClose = getInvestmentComparisonExpectedCloseDate(timestamp);
      const cached = cachedEntry(requestKey(args, expectedClose), timestamp);
      // Legacy getUser-only clients cannot synchronously prove identity.
      return cached?.ticket.state ? cached.data : null;
    } catch { return null; }
  };
  loadReviewStockReplayHistory.isCurrent = (args, data) => {
    try {
      const timestamp = requestTime(args), cached = deliveries.get(data);
      return Boolean(cached?.ticket.state && cached.key === requestKey(args, getInvestmentComparisonExpectedCloseDate(timestamp)) && validEntry(cached, timestamp));
    } catch { return false; }
  };
  loadReviewStockReplayHistory.subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  return loadReviewStockReplayHistory;
}

export const loadReviewStockReplayHistory = createReviewStockReplayHistoryLoader();
