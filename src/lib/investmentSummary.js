function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inferPreviousClose(quote, currentPrice) {
  const dailyPnlBaselineClose = toNumber(quote?.dailyPnlBaselineClose);
  if (dailyPnlBaselineClose > 0) return dailyPnlBaselineClose;
  const dailyBaselineClose = toNumber(quote?.dailyBaselineClose);
  if (dailyBaselineClose > 0) return dailyBaselineClose;
  const explicitPreviousClose = toNumber(quote?.previousClose);
  if (explicitPreviousClose > 0) return explicitPreviousClose;
  const change = toNumber(quote?.change);
  if (change !== 0 && currentPrice - change > 0) return currentPrice - change;
  const changePercent = toNumber(quote?.changePercent);
  if (changePercent !== 0 && changePercent > -100) return currentPrice / (1 + changePercent / 100);
  return 0;
}

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function inferDailyPnlPrice(quote, currentPrice) {
  if (hasOwn(quote, 'dailyPnlPrice')) {
    const dailyPnlPrice = toNumber(quote?.dailyPnlPrice);
    return dailyPnlPrice > 0 ? dailyPnlPrice : 0;
  }
  return currentPrice;
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
    let totalBuyShares = 0;
    let totalSellShares = 0;
    let sellProceeds = 0;
    let soldCost = 0;
    let realizedPnl = 0;
    let activeRealizedPnl = 0;
    let ignoredSellShares = 0;
    let buyTradeCount = 0;
    let sellTradeCount = 0;

    sortedTrades.forEach((trade) => {
      const shares = toNumber(trade.shares);
      const price = toNumber(trade.price);
      if (shares <= 0 || price <= 0) return;

      if (trade.side === 'sell') {
        sellTradeCount += 1;
        if (heldShares <= 0) {
          ignoredSellShares += shares;
          return;
        }
        const closedShares = Math.min(shares, heldShares);
        const ignoredShares = shares - closedShares;
        const avgCost = heldShares > 0 ? remainingCost / heldShares : 0;
        const closeCost = closedShares * avgCost;
        const closeProceeds = closedShares * price;
        totalSellShares += closedShares;
        ignoredSellShares += ignoredShares;
        sellProceeds += closeProceeds;
        soldCost += closeCost;
        const realizedDelta = closeProceeds - closeCost;
        realizedPnl += realizedDelta;
        activeRealizedPnl += realizedDelta;
        remainingCost -= closeCost;
        heldShares -= closedShares;
        if (heldShares <= 0.0000001) {
          heldShares = 0;
          remainingCost = 0;
          activeRealizedPnl = 0;
        }
        return;
      }

      buyTradeCount += 1;
      heldShares += shares;
      remainingCost += shares * price;
      totalBuyShares += shares;
      totalBuyCost += shares * price;
    });

    const currentPrice = toNumber(quote?.price);
    const high = toNumber(quote?.high || quote?.week52High);
    const previousClose = inferPreviousClose(quote, currentPrice);
    const dailyPnlPrice = inferDailyPnlPrice(quote, currentPrice);
    const hasTodayPnl = heldShares > 0 && dailyPnlPrice > 0 && previousClose > 0;
    const changePercent = toNumber(quote?.changePercent);
    const dailyPnlChangePercent = hasTodayPnl ? ((dailyPnlPrice - previousClose) / previousClose) * 100 : null;
    const ytdChangePercent = toNumber(quote?.ytdChangePercent);
    const avgCost = heldShares > 0 ? remainingCost / heldShares : 0;
    const effectiveCost = heldShares > 0 ? avgCost - activeRealizedPnl / heldShares : 0;
    const effectiveRemainingCost = heldShares > 0 ? effectiveCost * heldShares : 0;
    const marketValue = heldShares * currentPrice;
    const unrealizedPnl = heldShares > 0 ? marketValue - remainingCost : 0;
    const holdingPnl = activeRealizedPnl + unrealizedPnl;
    const totalPnl = realizedPnl + unrealizedPnl;
    const rawReturnCostBasis = heldShares > 0 ? marketValue - totalPnl : 0;
    const returnCostBasis = rawReturnCostBasis > 0 ? rawReturnCostBasis : (heldShares > 0 ? remainingCost : 0);
    const rawHoldingReturnCostBasis = heldShares > 0 ? marketValue - holdingPnl : 0;
    const holdingReturnCostBasis = rawHoldingReturnCostBasis > 0 ? rawHoldingReturnCostBasis : (heldShares > 0 ? remainingCost : 0);
    const todayPnl = hasTodayPnl ? heldShares * (dailyPnlPrice - previousClose) : null;
    const previousMarketValue = hasTodayPnl ? heldShares * previousClose : 0;

    return {
      symbol: group.symbol,
      name: group.name || quote?.name || group.symbol,
      trades: group.trades,
      sortedTrades: [...group.trades].sort((a, b) => sortTradesAsc(b, a)),
      buyTradeCount,
      sellTradeCount,
      heldShares,
      totalBuyShares,
      totalSellShares,
      ignoredSellShares,
      avgCost,
      effectiveCost,
      remainingCost,
      effectiveRemainingCost,
      returnCostBasis,
      totalBuyCost,
      sellProceeds,
      soldCost,
      activeRealizedPnl,
      currentPrice,
      high,
      previousClose,
      dailyBaselineClose: previousClose,
      dailyBaselineDate: quote?.dailyBaselineDate || '',
      dailyPnlPrice,
      dailyPnlBaselineClose: previousClose,
      dailyPnlPriceDate: quote?.dailyPnlPriceDate || '',
      dailyPnlBaselineDate: quote?.dailyPnlBaselineDate || quote?.dailyBaselineDate || '',
      dailyPnlSource: quote?.dailyPnlSource || '',
      dailyPnlSession: quote?.dailyPnlSession || '',
      dailyPnlLocked: Boolean(quote?.dailyPnlLocked),
      hasTodayPnl,
      changePercent,
      dailyPnlChangePercent,
      ytdChangePercent,
      marketValue,
      realizedPnl,
      unrealizedPnl,
      holdingPnl,
      totalPnl,
      todayPnl,
      todayPnlPct: hasTodayPnl ? (dailyPnlPrice - previousClose) / previousClose : null,
      previousMarketValue,
      totalPnlPct: returnCostBasis > 0 ? totalPnl / returnCostBasis : 0,
      holdingPnlPct: holdingReturnCostBasis > 0 ? holdingPnl / holdingReturnCostBasis : 0,
      unrealizedPct: remainingCost > 0 ? unrealizedPnl / remainingCost : 0,
    };
  }).sort((a, b) => b.marketValue - a.marketValue || a.symbol.localeCompare(b.symbol));
}

export function deriveInvestmentSummary({
  trades = [],
  stockTrades = null,
  watchlist = [],
  cashUsd = 0,
  usdRate = 7.2,
} = {}) {
  const ledgerTrades = Array.isArray(stockTrades) ? stockTrades : trades;
  const positions = derivePositionsFromTrades(ledgerTrades, watchlist);
  const activePositions = positions.filter((position) => position.heldShares > 0);
  const positionsMarketValue = activePositions.reduce((sum, position) => sum + position.marketValue, 0);
  const realizedPnl = positions.reduce((sum, position) => sum + position.realizedPnl, 0);
  const unrealizedPnl = activePositions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const holdingPnl = activePositions.reduce((sum, position) => sum + position.holdingPnl, 0);
  const cumulativePnl = realizedPnl + unrealizedPnl;
  const totalBuyCost = positions.reduce((sum, position) => sum + position.totalBuyCost, 0);
  const remainingCost = activePositions.reduce((sum, position) => sum + position.remainingCost, 0);
  const rawReturnCostBasis = positionsMarketValue - cumulativePnl;
  const returnCostBasis = rawReturnCostBasis > 0 ? rawReturnCostBasis : remainingCost;
  const todayPnlUnavailableCount = activePositions.reduce((sum, position) => sum + (position.hasTodayPnl ? 0 : 1), 0);
  const hasTodayPnl = activePositions.length === 0 || todayPnlUnavailableCount === 0;
  const todayPnl = hasTodayPnl
    ? activePositions.reduce((sum, position) => sum + toNumber(position.todayPnl), 0)
    : null;
  const previousMarketValue = activePositions.reduce((sum, position) => sum + position.previousMarketValue, 0);
  const todayPnlLocked = activePositions.length > 0 && activePositions.some((position) => position.dailyPnlLocked);
  const sellTradeCount = ledgerTrades.reduce((sum, trade) => sum + (trade.side === 'sell' ? 1 : 0), 0);
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
    todayPnlPct: hasTodayPnl && previousMarketValue > 0 ? todayPnl / previousMarketValue : null,
    hasTodayPnl,
    todayPnlLocked,
    todayPnlUnavailableCount,
    realizedPnl,
    unrealizedPnl,
    holdingPnl,
    cumulativePnl,
    cumulativePnlPct: returnCostBasis > 0 ? cumulativePnl / returnCostBasis : 0,
    holdingStockCount: activePositions.length,
    sellTradeCount,
    tradeCount: ledgerTrades.length,
    totalBuyCost,
    remainingCost,
    returnCostBasis,
    usdRate: rate,
  };
}
