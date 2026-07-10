export const QUOTE_API_BATCH_SIZE = 30;

export function buildQuoteSymbolBatches(symbols = [], batchSize = QUOTE_API_BATCH_SIZE) {
  const limit = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : QUOTE_API_BATCH_SIZE;
  const normalized = [];
  const seen = new Set();

  for (const value of Array.isArray(symbols) ? symbols : []) {
    const symbol = String(value || '').trim();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    normalized.push(symbol);
  }

  const batches = [];
  for (let index = 0; index < normalized.length; index += limit) {
    batches.push(normalized.slice(index, index + limit));
  }
  return batches;
}
