function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSymbol(symbol) {
  return String(symbol || 'TQQQ').trim().toUpperCase();
}

function sortTradesAsc(a, b) {
  return String(a.date || '').localeCompare(String(b.date || '')) || toNumber(a.id) - toNumber(b.id);
}

function buildQuoteMap(watchlist = []) {
  const map = new Map();
  watchlist.forEach((item) => {
    const symbol = normalizeSymbol(item.symbol);
    map.set(symbol, item);
  });
  return map;
}

export function derivePositionsFromTrades(trades = [], watchlist = []) {
  const quoteMap = buildQuoteMap(watchlist);
  const groups = new Map();

  trades.forEach((trade) => {
    const symbol = normalizeSymbol(trade.symbol);
    if (!groups.has(symbol)) {
      const quote = quoteMap.get(symbol);
      groups.set(symbol, {
        symbol,
        name: trade.name || quote?.name || symbol,
        trades: [],
      });
    }
    const group = groups.get(symbol);
    if (trade.name && (!group.name || group.name === symbol)) group.name = trade.name;
    group.trades.push(trade);
  });

  return Array.from(groups.values()).map((group) => {
    const sortedTrades = [...group.trades].sort(sortTradesAsc);
    const quote = quoteMap.get(group.symbol);
    let heldShares = 0;
    let remainingCost = 0;
    let totalBuyCost = 0;
    let realizedPnl = 0;
    let buyTradeCount = 0;
    let sellTradeCount = 0;

    sortedTrades.forEach((trade) => {
      const shares = toNumber(trade.shares);
      const price = toNumber(trade.price);
      if (shares <= 0 || price <= 0) return;

      if (trade.side === 'sell') {
        sellTradeCount += 1;
        if (heldShares <= 0) return;
        const closedShares = Math.min(shares, heldShares);
        const avgCost = heldShares > 0 ? remainingCost / heldShares : 0;
        realizedPnl += closedShares * (price - avgCost);
        remainingCost -= closedShares * avgCost;
        heldShares -= closedShares;
        if (heldShares <= 0.0000001) {
          heldShares = 0;
          remainingCost = 0;
        }
        return;
      }

      buyTradeCount += 1;
      heldShares += shares;
      remainingCost += shares * price;
      totalBuyCost += shares * price;
    });

    const currentPrice = toNumber(quote?.price);
    const previousClose = toNumber(quote?.previousClose);
    const changePercent = toNumber(quote?.changePercent);
    const avgCost = heldShares > 0 ? remainingCost / heldShares : 0;
    const marketValue = heldShares * currentPrice;
    const unrealizedPnl = heldShares > 0 ? marketValue - remainingCost : 0;
    const totalPnl = realizedPnl + unrealizedPnl;
    const todayPnl = heldShares > 0 && previousClose > 0 ? heldShares * (currentPrice - previousClose) : 0;
    const previousMarketValue = heldShares > 0 && previousClose > 0 ? heldShares * previousClose : 0;

    return {
      symbol: group.symbol,
      name: group.name || quote?.name || group.symbol,
      trades: group.trades,
      sortedTrades: [...group.trades].sort((a, b) => sortTradesAsc(b, a)),
      buyTradeCount,
      sellTradeCount,
      heldShares,
      avgCost,
      remainingCost,
      totalBuyCost,
      currentPrice,
      previousClose,
      changePercent,
      marketValue,
      realizedPnl,
      unrealizedPnl,
      totalPnl,
      todayPnl,
      previousMarketValue,
      totalPnlPct: totalBuyCost > 0 ? totalPnl / totalBuyCost : 0,
      unrealizedPct: remainingCost > 0 ? unrealizedPnl / remainingCost : 0,
    };
  }).sort((a, b) => b.marketValue - a.marketValue || a.symbol.localeCompare(b.symbol));
}

export function deriveInvestmentSummary({
  trades = [],
  watchlist = [],
  cashUsd = 0,
  usdRate = 7.2,
} = {}) {
  const positions = derivePositionsFromTrades(trades, watchlist);
  const activePositions = positions.filter((position) => position.heldShares > 0);
  const positionsMarketValue = activePositions.reduce((sum, position) => sum + position.marketValue, 0);
  const realizedPnl = positions.reduce((sum, position) => sum + position.realizedPnl, 0);
  const unrealizedPnl = activePositions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const cumulativePnl = realizedPnl + unrealizedPnl;
  const totalBuyCost = positions.reduce((sum, position) => sum + position.totalBuyCost, 0);
  const todayPnl = activePositions.reduce((sum, position) => sum + position.todayPnl, 0);
  const previousMarketValue = activePositions.reduce((sum, position) => sum + position.previousMarketValue, 0);
  const sellTradeCount = trades.reduce((sum, trade) => sum + (trade.side === 'sell' ? 1 : 0), 0);
  const totalAssetsUsd = positionsMarketValue + toNumber(cashUsd);
  const rate = toNumber(usdRate) || 7.2;

  return {
    cashUsd: toNumber(cashUsd),
    positions,
    activePositions,
    positionsMarketValue,
    totalAssetsUsd,
    totalAssetsCny: totalAssetsUsd * rate,
    todayPnl,
    todayPnlPct: previousMarketValue > 0 ? todayPnl / previousMarketValue : 0,
    realizedPnl,
    unrealizedPnl,
    cumulativePnl,
    cumulativePnlPct: totalBuyCost > 0 ? cumulativePnl / totalBuyCost : 0,
    holdingStockCount: activePositions.length,
    sellTradeCount,
    tradeCount: trades.length,
    totalBuyCost,
    usdRate: rate,
  };
}
