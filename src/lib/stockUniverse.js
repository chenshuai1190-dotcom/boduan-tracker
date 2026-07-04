function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTradeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

export function buildLedgerQuoteUniverse(stockTrades = [], watchlist = []) {
  const bySymbol = new Map();
  const ledgerSymbols = new Set();

  (watchlist || []).forEach((item) => {
    const symbol = normalizeTradeSymbol(item?.symbol);
    if (!symbol) return;
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
    });
  });

  (stockTrades || []).forEach((trade) => {
    const symbol = normalizeTradeSymbol(trade?.symbol);
    if (!symbol) return;
    ledgerSymbols.add(symbol);

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
      intraday: existing.intraday || [],
    });
  });

  const allRows = Array.from(bySymbol.values());
  const ledgerRows = allRows.filter((item) => ledgerSymbols.has(item.symbol));

  return {
    allRows,
    ledgerRows: ledgerRows.length > 0 ? ledgerRows : allRows,
    ledgerSymbols,
  };
}
