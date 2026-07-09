export const QUOTE_PROVIDER = Object.freeze({
  VIX: 'vix',
  FGI: 'fgi',
  TRANSLATE: 'translate',
  ANALYST: 'analyst',
  INDICES: 'indices',
  STOCK: 'stock',
});

export function providerForSymbol(symbol) {
  if (symbol === 'VIX') return QUOTE_PROVIDER.VIX;
  if (symbol === 'FGI') return QUOTE_PROVIDER.FGI;
  if (symbol === 'INDICES') return QUOTE_PROVIDER.INDICES;
  if (symbol.startsWith('TRANSLATE:')) return QUOTE_PROVIDER.TRANSLATE;
  if (symbol.startsWith('ANALYST:')) return QUOTE_PROVIDER.ANALYST;
  return QUOTE_PROVIDER.STOCK;
}
