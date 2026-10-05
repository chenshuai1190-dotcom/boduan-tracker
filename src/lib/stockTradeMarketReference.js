import { resolveHomeSignalBenchmarkPrice } from './homeSignalBenchmark.js';
import { normalizeStrictUserStockSymbol } from './symbols.js';

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

// Display-only observations. Never substitute the entered execution price or
// another instrument's high when the selected stock's quote is unavailable.
export function deriveStockTradeMarketReference({ symbol, quote, vix, vixDataDate } = {}) {
  const stockSymbol = normalizeStrictUserStockSymbol(symbol);
  const validQuote = stockSymbol && quote?.symbol === stockSymbol && !quote.error && quote.stale !== true;
  const price = validQuote ? positive(resolveHomeSignalBenchmarkPrice(quote)) : null;
  const high = validQuote ? positive(quote.week52High) : null;
  const stockReady = price !== null && high !== null;
  const vixValue = positive(vix);
  const vixReady = vixValue !== null && /^\d{4}-\d{2}-\d{2}$/.test(vixDataDate || '');
  return {
    vixReady, vixValue: vixReady ? vixValue : null,
    vixDataDate: vixReady ? vixDataDate : '',
    stockReady, stockDistanceFromHigh: stockReady ? price / high - 1 : null,
  };
}
