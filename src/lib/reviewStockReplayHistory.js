import { investmentComparisonError, normalizeInvestmentSymbol } from './investmentComparisonModel.js';
import { loadStockComparison } from './stockComparison.js';

export const REVIEW_STOCK_REPLAY_MAX_IN_FLIGHT = 2;

function requestAborted() {
  const error = investmentComparisonError('REQUEST_ABORTED', 'Stock replay request cancelled.');
  error.name = 'AbortError';
  return error;
}

function requestKey({ userId, symbols = ['QQQ', 'TQQQ'], startDate, endDate }) {
  return JSON.stringify([
    typeof userId === 'string' ? userId.trim() : '',
    Array.isArray(symbols) ? symbols.map(normalizeInvestmentSymbol) : symbols,
    startDate,
    endDate,
  ]);
}

/** A replay-only pool. Authentication, validation and success-cache lifetime
 * remain owned by loadStockComparison; this layer retains only pending work. */
export function createReviewStockReplayHistoryLoader({ loadHistory = loadStockComparison } = {}) {
  const pending = new Map(), queue = [];
  let active = 0;

  function forget(entry) {
    if (pending.get(entry.key) === entry) pending.delete(entry.key);
  }

  function finish(entry, succeeded, result) {
    active -= 1;
    entry.state = 'settled';
    forget(entry);
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
        return loadHistory({ ...entry.options, signal: entry.controller.signal });
      }).then(data => finish(entry, true, data), error => finish(entry, false, error));
    }
  }

  return function loadReviewStockReplayHistory(args = {}) {
    if (args.signal?.aborted) return Promise.reject(requestAborted());
    const key = requestKey(args);
    let entry = pending.get(key);
    if (!entry) {
      entry = { key, options: { ...args, ...(Array.isArray(args.symbols) ? { symbols: [...args.symbols] } : {}) },
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
  };
}

export const loadReviewStockReplayHistory = createReviewStockReplayHistoryLoader();
