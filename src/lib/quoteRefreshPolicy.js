import { derivePositionsFromTrades } from './investmentSummary.js';
import { normalizeUserStockSymbol } from './symbols.js';

export const QUOTE_BASELINE_REFRESH_INTERVAL_MS = Object.freeze({
  regular: 15 * 60 * 1000,
  premarket: 30 * 60 * 1000,
  postmarket: 30 * 60 * 1000,
  closed: 60 * 60 * 1000,
});

function finiteTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function normalizedSymbol(value) {
  return normalizeUserStockSymbol(value);
}

export function getQuoteBaselineRefreshInterval(session = 'closed') {
  return QUOTE_BASELINE_REFRESH_INTERVAL_MS[session]
    || QUOTE_BASELINE_REFRESH_INTERVAL_MS.closed;
}

export function getQuoteBaselineRefreshDelay({
  session = 'closed',
  now = Date.now(),
  lastSuccessAt = 0,
  lastAttemptAt = 0,
} = {}) {
  const currentTime = finiteTimestamp(now) || Date.now();
  const cadenceAnchor = Math.max(
    finiteTimestamp(lastSuccessAt),
    finiteTimestamp(lastAttemptAt),
  );
  if (!cadenceAnchor) return 0;

  const elapsed = Math.max(0, currentTime - cadenceAnchor);
  return Math.max(0, getQuoteBaselineRefreshInterval(session) - elapsed);
}

export function shouldRunQuoteBaselineRefresh({
  session = 'closed',
  now = Date.now(),
  lastSuccessAt = 0,
  lastAttemptAt = 0,
  force = false,
} = {}) {
  if (force) return true;

  // A failed provider request must not turn focus/pageshow events into a retry loop.
  // Successful refreshes remain the normal cadence anchor; the latest attempt is
  // only a protective cooldown while upstream is unhealthy.
  return getQuoteBaselineRefreshDelay({
    session,
    now,
    lastSuccessAt,
    lastAttemptAt,
  }) === 0;
}

export function selectQuoteBaselineSymbols({
  stockTrades = [],
  watchlist = [],
  activeSwingRows = [],
} = {}) {
  const symbols = new Set();
  const ledgerTrades = Array.isArray(stockTrades) ? stockTrades : [];

  derivePositionsFromTrades(ledgerTrades)
    .filter((position) => Number(position?.heldShares) > 0)
    .forEach((position) => {
      const symbol = normalizedSymbol(position?.symbol);
      if (symbol) symbols.add(symbol);
    });

  (Array.isArray(watchlist) ? watchlist : []).forEach((row) => {
    const symbol = normalizedSymbol(row?.symbol);
    if (symbol) symbols.add(symbol);
  });

  (Array.isArray(activeSwingRows) ? activeSwingRows : []).forEach((row) => {
    // App receives quote rows already filtered to active waves. If a status is
    // present, enforce it here so completed history can never expand REST usage.
    if (row?.status && row.status !== 'active') return;
    const symbol = normalizedSymbol(row?.symbol);
    if (symbol) symbols.add(symbol);
  });

  return Array.from(symbols);
}

export function buildQuoteBaselineRows({
  candidateRows = [],
  stockTrades = [],
  watchlist = [],
  activeSwingRows = [],
} = {}) {
  const allowedSymbols = new Set(selectQuoteBaselineSymbols({
    stockTrades,
    watchlist,
    activeSwingRows,
  }));
  const bySymbol = new Map();

  (Array.isArray(candidateRows) ? candidateRows : []).forEach((row) => {
    const symbol = normalizedSymbol(row?.symbol);
    if (!symbol || !allowedSymbols.has(symbol)) return;
    bySymbol.set(symbol, {
      ...row,
      symbol,
      name: row?.name || symbol,
    });
  });

  [
    ...(Array.isArray(watchlist) ? watchlist : []),
    ...(Array.isArray(activeSwingRows) ? activeSwingRows : []),
  ].forEach((row) => {
    const symbol = normalizedSymbol(row?.symbol);
    if (!symbol || !allowedSymbols.has(symbol) || bySymbol.has(symbol)) return;
    bySymbol.set(symbol, {
      ...row,
      symbol,
      name: row?.name || symbol,
    });
  });

  // Current holdings always exist in the ledger, but keep a minimal fallback so
  // a partially loaded cache cannot silently omit a symbol from the baseline.
  (Array.isArray(stockTrades) ? stockTrades : []).forEach((trade) => {
    const symbol = normalizedSymbol(trade?.symbol);
    if (!symbol || !allowedSymbols.has(symbol) || bySymbol.has(symbol)) return;
    bySymbol.set(symbol, {
      symbol,
      name: trade?.name || symbol,
      price: Number(trade?.price) || 0,
      high: Number(trade?.price) || 0,
    });
  });

  return Array.from(bySymbol.values());
}
