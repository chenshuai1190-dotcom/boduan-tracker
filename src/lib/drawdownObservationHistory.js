import { loadDcaHistory, normalizeDcaHistoryData } from './dcaHistory.js';
import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';
import { investmentComparisonError, normalizeInvestmentSymbol } from './investmentComparisonModel.js';

export const DRAWDOWN_OBSERVATION_CONCURRENCY = 3;

function aborted() {
  const cause = investmentComparisonError('REQUEST_ABORTED', 'drawdown observation caller aborted');
  cause.name = 'AbortError';
  return cause;
}

function pendingInstrument(instrument) {
  return {
    ...instrument, points: [], source: null, priceBasis: null, currency: 'USD',
    asOfDate: null, expectedAsOfDate: null, availableFromDate: null, fetchedAt: null,
    stale: false, staleReason: '', status: 'loading', error: null,
  };
}

function clockTimestamp(now) {
  const timestamp = typeof now === 'function' ? now() : now;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
    throw investmentComparisonError('INVALID_CLOCK', 'invalid drawdown observation clock');
  }
  return timestamp;
}

/**
 * One read-only batch, with no polling or private cache of its own. The existing
 * authenticated DCA history loader owns identity checks, shared adjusted-close
 * cache, stale fallback and provider requests. Scope/filter/chart interactions
 * operate on the returned rows; callers reload only on entry or explicit retry.
 * Ordinary per-symbol failures preserve the other instruments. Identity changes
 * and caller cancellation terminate the whole batch and suppress late progress.
 */
export async function loadDrawdownObservation({
  userId, instruments = [], signal, force = false, onProgress,
  loadHistory = loadDcaHistory, now = Date.now,
} = {}) {
  if (typeof userId !== 'string' || !userId.trim()) throw investmentComparisonError('AUTH_REQUIRED', 'authenticated user required');
  if (!Array.isArray(instruments)) throw investmentComparisonError('INVALID_SYMBOL', 'instrument list required');
  if (typeof loadHistory !== 'function') throw investmentComparisonError('REQUEST_ERROR', 'history loader required');
  if (signal?.aborted) throw aborted();
  const descriptors = [], seen = new Set();
  for (const instrument of instruments) {
    const symbol = normalizeInvestmentSymbol(instrument?.symbol);
    if (!symbol) throw investmentComparisonError('INVALID_SYMBOL', 'valid US instruments required');
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    descriptors.push({ ...instrument, symbol });
  }
  const rows = descriptors.map(pendingInstrument);
  let completed = 0, nextIndex = 0, fatalCause = null, rejectInterruption;
  const snapshot = () => ({ instruments: rows.slice(), completed, total: rows.length });
  if (rows.length === 0) return snapshot();
  const controller = new AbortController();
  const interrupted = new Promise((_, reject) => { rejectInterruption = reject; });
  const stop = (cause) => {
    if (fatalCause) return;
    fatalCause = cause;
    controller.abort();
    rejectInterruption(cause);
  };
  const onAbort = () => stop(aborted());
  signal?.addEventListener('abort', onAbort, { once: true });
  const worker = async () => {
    while (!fatalCause && !signal?.aborted) {
      const index = nextIndex++;
      if (index >= descriptors.length) return;
      const descriptor = descriptors[index];
      try {
        const value = await loadHistory({ userId: userId.trim(), symbol: descriptor.symbol, force: force === true, signal: controller.signal });
        if (fatalCause || signal?.aborted) return;
        const timestamp = clockTimestamp(now);
        const data = normalizeDcaHistoryData(value, {
          symbol: descriptor.symbol, now: timestamp,
          expectedAsOfDate: getInvestmentComparisonExpectedCloseDate(timestamp),
        });
        if (!data) throw investmentComparisonError('INVALID_DATA', 'complete adjusted-close USD history required');
        const { rows: points, ...metadata } = data;
        rows[index] = {
          ...descriptor, ...metadata, points, kind: data.type === 'ETF' ? 'etf' : 'stock',
          status: 'ready', error: null,
        };
      } catch (cause) {
        if (fatalCause || signal?.aborted) return;
        if (cause?.name === 'AbortError' || ['AUTH_REQUIRED', 'REQUEST_SUPERSEDED', 'REQUEST_ABORTED', 'INVALID_CLOCK'].includes(cause?.code)) {
          stop(cause);
          return;
        }
        const code = typeof cause?.code === 'string' && /^[A-Z_]{1,50}$/.test(cause.code) ? cause.code : 'REQUEST_ERROR';
        rows[index] = { ...pendingInstrument(descriptor), status: 'error', error: { code } };
      }
      if (fatalCause || signal?.aborted) return;
      completed += 1;
      if (typeof onProgress === 'function') onProgress(snapshot());
    }
  };
  try {
    if (signal?.aborted) stop(aborted());
    const workers = Promise.all(Array.from({ length: Math.min(DRAWDOWN_OBSERVATION_CONCURRENCY, rows.length) }, worker))
      .catch((cause) => { stop(cause); throw cause; });
    await Promise.race([workers, interrupted]);
    if (fatalCause) throw fatalCause;
    if (signal?.aborted) throw aborted();
    return snapshot();
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
