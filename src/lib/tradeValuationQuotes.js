import { normalizeUserStockSymbol } from './symbols.js';

const LIVE_DAILY_SOURCES = new Set(['realtime-pre', 'realtime-regular', 'realtime-tick']);
const CLOSE_SOURCES = new Set([
  'locked-provider-regular-close', 'locked-eod-regular-close', 'locked-latest-eod-close',
  'eodhd-adjusted-close', 'eodhd-close',
]);
const BASELINE_SOURCES = new Set([...CLOSE_SOURCES, 'eodhd-quote-previous-close']);
const REALTIME_SOURCES = new Set(['EODHD_WS', 'EODHD_WS_QUOTE']);

function positive(value) {
  if (!['number', 'string'].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function sourcedClose(value, source, date, allowedSources) {
  if (positive(value) === null || !allowedSources.has(source)) return false;
  // EODHD's quote previous-close branch can legitimately have no trading date.
  // Historical EOD closes always arrive with their explicit completed date.
  if (!date && ['eodhd-quote-previous-close', 'locked-provider-regular-close'].includes(source)) return true;
  return validDate(date);
}

function valuationPrice(row) {
  if (row.error || (row.currency && row.currency !== 'USD')) return null;
  if (!row.dailyPnlLocked) {
    const price = positive(row.price);
    // quoteUniverse can fill price with a transaction price while retaining a
    // source name. REST and accepted live ticks independently populate this
    // dedicated daily price, so matching both values excludes that fallback.
    return price !== null && price === positive(row.dailyPnlPrice) && LIVE_DAILY_SOURCES.has(row.dailyPnlSource)
      ? price : null;
  }

  // Match derivePositionsFromTrades: locked daily price first, then the first
  // positive last-completed baseline. If that exact candidate is unverified,
  // remain unknown rather than silently substituting a different valuation.
  const dailyPrice = positive(row.dailyPnlPrice);
  if (dailyPrice !== null) return sourcedClose(dailyPrice, row.dailyPnlSource, row.dailyPnlPriceDate, CLOSE_SOURCES)
    ? dailyPrice : null;
  const baselineCandidates = [
    [row.dailyPnlBaselineClose, row.dailyPnlBaselineSource, row.dailyPnlBaselineDate],
    [row.dailyBaselineClose, row.dailyBaselineSource, row.dailyBaselineDate],
  ];
  for (const [value, source, date] of baselineCandidates) {
    const price = positive(value);
    if (price !== null) return sourcedClose(price, source, date, BASELINE_SOURCES) ? price : null;
  }
  const previousClose = positive(row.previousClose);
  // previousClose itself may come from an old/manual watchlist row. Require
  // corroboration in the provider-only field; neither field is a trade input.
  const providerSource = row.priceSource === 'EODHD-v2' || REALTIME_SOURCES.has(row.source);
  return previousClose !== null && providerSource && previousClose === positive(row.providerPreviousClose)
    ? previousClose : null;
}

/**
 * Quotes for the read-only trade allocation preview, not a global quote cache.
 * null means the collection is unavailable; omitted symbols lack a verifiable
 * valuation. Returned rows expose only the already-resolved production price,
 * so subsequent ledger replay cannot fall back to another field or trade price.
 */
export function selectTradeValuationQuotes(quoteRows) {
  if (!Array.isArray(quoteRows)) return null;
  const bySymbol = new Map();
  for (const row of quoteRows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const symbol = normalizeUserStockSymbol(row.symbol);
    if (symbol) bySymbol.set(symbol, row);
  }
  const selected = [];
  for (const [symbol, row] of bySymbol) {
    const price = valuationPrice(row);
    if (price !== null) selected.push({ symbol, price, dailyPnlLocked: false });
  }
  return selected;
}
