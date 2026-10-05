import { loadStockRsiReference, normalizeStockRsiQuote } from './stockRsiReference.js';

// Preserve the original TQQQ contract while sharing authentication and freshness
// checks with ordinary-stock references.
export { stockRsiLocalDateKey as tqqqRsiLocalDateKey,
  stockRsiTradeDateReason as tqqqRsiTradeDateReason } from './stockRsiReference.js';

export function normalizeTqqqRsiQuote(quote, options = {}) {
  return normalizeStockRsiQuote(quote, { ...options, symbol: 'TQQQ' });
}

export function loadTqqqRsiReference(options = {}) {
  return loadStockRsiReference({ ...options, symbol: 'TQQQ' });
}
