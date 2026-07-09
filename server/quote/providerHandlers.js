import { QUOTE_PROVIDER, providerForSymbol } from './providers.js';
import { fetchFearGreedQuote } from './providers/cnn.js';
import { fetchAnalystQuote, fetchStockQuote } from './providers/eodhd.js';
import { fetchTranslationQuote } from './providers/google.js';
import { fetchIndicesQuote } from './providers/indices.js';
import { fetchVixQuote } from './providers/vix.js';

export async function fetchQuoteForSymbol(symbol, context) {
  const provider = providerForSymbol(symbol);

  if (provider === QUOTE_PROVIDER.VIX) return fetchVixQuote(symbol, context);
  if (provider === QUOTE_PROVIDER.FGI) return fetchFearGreedQuote(symbol, context);
  if (provider === QUOTE_PROVIDER.TRANSLATE) return fetchTranslationQuote(symbol, context);
  if (provider === QUOTE_PROVIDER.ANALYST) return fetchAnalystQuote(symbol, context);
  if (provider === QUOTE_PROVIDER.INDICES) return fetchIndicesQuote(symbol, context);

  return fetchStockQuote(symbol, context);
}
