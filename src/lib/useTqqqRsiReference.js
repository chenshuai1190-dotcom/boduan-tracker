import { useStockRsiReference } from './useStockRsiReference.js';

export function useTqqqRsiReference(options = {}) {
  return useStockRsiReference({ ...options, symbol: 'TQQQ' });
}
