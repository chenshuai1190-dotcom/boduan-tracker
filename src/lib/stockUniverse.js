function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const PRICE_EPSILON = 0.000001;

function resolvedPrice(item = {}, existing = {}) {
  return toFiniteNumber(item?.price) || toFiniteNumber(existing?.price);
}

function resolvedPreviousClose(item = {}, existing = {}) {
  return toFiniteNumber(item?.previousClose) || toFiniteNumber(existing?.previousClose);
}

function resolveChange(item = {}, existing = {}) {
  const itemChange = Number(item?.change);
  if (Number.isFinite(itemChange) && itemChange !== 0) return itemChange;
  const price = resolvedPrice(item, existing);
  const previousClose = resolvedPreviousClose(item, existing);
  if (price > 0 && previousClose > 0) return price - previousClose;
  return toFiniteNumber(existing?.change);
}

function resolveChangePercent(item = {}, existing = {}) {
  const itemChangePercent = Number(item?.changePercent);
  if (Number.isFinite(itemChangePercent) && itemChangePercent !== 0) return itemChangePercent;
  const price = resolvedPrice(item, existing);
  const previousClose = resolvedPreviousClose(item, existing);
  if (price > 0 && previousClose > 0) {
    const change = price - previousClose;
    return Math.abs(change) > PRICE_EPSILON ? (change / previousClose) * 100 : 0;
  }
  return toFiniteNumber(existing?.changePercent);
}

function normalizeTradeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

export function buildLedgerQuoteUniverse(stockTrades = [], watchlist = [], quoteCache = [], toolQuoteRows = []) {
  const bySymbol = new Map();
  const ledgerSymbols = new Set();
  const watchlistSymbols = new Set();
  const toolSymbols = new Set();

  (stockTrades || []).forEach((trade) => {
    const symbol = normalizeTradeSymbol(trade?.symbol);
    if (symbol) ledgerSymbols.add(symbol);
  });

  (watchlist || []).forEach((item) => {
    const symbol = normalizeTradeSymbol(item?.symbol);
    if (!symbol) return;
    watchlistSymbols.add(symbol);
    bySymbol.set(symbol, {
      ...item,
      symbol,
      name: item?.name || symbol,
      price: toFiniteNumber(item?.price),
      high: toFiniteNumber(item?.high),
      cost: toFiniteNumber(item?.cost),
      shares: toFiniteNumber(item?.shares),
      previousClose: toFiniteNumber(item?.previousClose),
      change: resolveChange(item),
      changePercent: resolveChangePercent(item),
      ytdChangePercent: toFiniteNumber(item?.ytdChangePercent),
    });
  });

  (toolQuoteRows || []).forEach((item) => {
    const symbol = normalizeTradeSymbol(item?.symbol);
    if (!symbol) return;
    toolSymbols.add(symbol);
    const existing = bySymbol.get(symbol) || {};
    bySymbol.set(symbol, {
      ...existing,
      ...item,
      symbol,
      name: existing.name || item?.name || symbol,
      price: toFiniteNumber(item?.price) || toFiniteNumber(existing.price),
      high: toFiniteNumber(item?.high) || toFiniteNumber(existing.high),
      cost: toFiniteNumber(existing.cost),
      shares: toFiniteNumber(existing.shares),
      previousClose: toFiniteNumber(item?.previousClose) || toFiniteNumber(existing.previousClose),
      change: resolveChange(item, existing),
      changePercent: resolveChangePercent(item, existing),
      ytdChangePercent: toFiniteNumber(item?.ytdChangePercent) || toFiniteNumber(existing.ytdChangePercent),
      intraday: item?.intraday || existing.intraday || [],
    });
  });

  (quoteCache || []).forEach((item) => {
    const symbol = normalizeTradeSymbol(item?.symbol);
    if (!symbol || (!watchlistSymbols.has(symbol) && !ledgerSymbols.has(symbol) && !toolSymbols.has(symbol))) return;
    const existing = bySymbol.get(symbol) || {};
    bySymbol.set(symbol, {
      ...existing,
      ...item,
      symbol,
      name: existing.name || item?.name || symbol,
      price: toFiniteNumber(item?.price) || toFiniteNumber(existing.price),
      high: toFiniteNumber(item?.high) || toFiniteNumber(existing.high),
      cost: toFiniteNumber(existing.cost),
      shares: toFiniteNumber(existing.shares),
      previousClose: toFiniteNumber(item?.previousClose) || toFiniteNumber(existing.previousClose),
      change: resolveChange(item, existing),
      changePercent: resolveChangePercent(item, existing),
      ytdChangePercent: toFiniteNumber(item?.ytdChangePercent) || toFiniteNumber(existing.ytdChangePercent),
      intraday: item?.intraday || existing.intraday || [],
    });
  });

  (stockTrades || []).forEach((trade) => {
    const symbol = normalizeTradeSymbol(trade?.symbol);
    if (!symbol) return;

    const existing = bySymbol.get(symbol) || {};
    const tradePrice = toFiniteNumber(trade?.price);
    const existingPrice = toFiniteNumber(existing.price);
    const existingHigh = toFiniteNumber(existing.high);
    const price = existingPrice > 0 ? existingPrice : tradePrice;
    const high = existingHigh > 0 ? Math.max(existingHigh, tradePrice, price) : Math.max(tradePrice, price);

    bySymbol.set(symbol, {
      ...existing,
      symbol,
      name: existing.name || trade?.name || symbol,
      price,
      high,
      cost: toFiniteNumber(existing.cost),
      shares: toFiniteNumber(existing.shares),
      previousClose: toFiniteNumber(existing.previousClose),
      change: resolveChange(existing),
      changePercent: resolveChangePercent(existing),
      ytdChangePercent: toFiniteNumber(existing.ytdChangePercent),
      intraday: existing.intraday || [],
    });
  });

  const allRows = Array.from(bySymbol.values());
  const ledgerRows = allRows.filter((item) => ledgerSymbols.has(item.symbol));

  return {
    allRows,
    watchlistRows: allRows.filter((item) => watchlistSymbols.has(item.symbol)),
    ledgerRows,
    toolRows: allRows.filter((item) => toolSymbols.has(item.symbol)),
    ledgerSymbols,
    watchlistSymbols,
    toolSymbols,
  };
}
