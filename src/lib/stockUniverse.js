function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTradeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

export function buildLedgerQuoteUniverse(stockTrades = [], watchlist = [], quoteCache = []) {
  const bySymbol = new Map();
  const ledgerSymbols = new Set();
  const watchlistSymbols = new Set();

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
      changePercent: toFiniteNumber(item?.changePercent),
      ytdChangePercent: toFiniteNumber(item?.ytdChangePercent),
    });
  });

  (quoteCache || []).forEach((item) => {
    const symbol = normalizeTradeSymbol(item?.symbol);
    if (!symbol || (!watchlistSymbols.has(symbol) && !ledgerSymbols.has(symbol))) return;
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
      changePercent: toFiniteNumber(item?.changePercent),
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
      changePercent: toFiniteNumber(existing.changePercent),
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
    ledgerSymbols,
    watchlistSymbols,
  };
}
