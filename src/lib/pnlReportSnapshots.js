export const PNL_REPORT_SNAPSHOT_VERSION = 'pnl_snapshot_v1';

const EPSILON = 0.0000001;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

export function normalizeReportDate(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function readTradeDate(trade) {
  return String(trade?.trade_date || trade?.tradeDate || trade?.date || '').slice(0, 10);
}

function isTradeOnOrBefore(trade, snapshotDate) {
  const date = readTradeDate(trade);
  return Boolean(date && date <= snapshotDate);
}

function sortTradesAsc(a, b) {
  const dateCompare = readTradeDate(a).localeCompare(readTradeDate(b));
  if (dateCompare !== 0) return dateCompare;
  const createdCompare = String(a?.created_at || a?.createdAt || '').localeCompare(String(b?.created_at || b?.createdAt || ''));
  if (createdCompare !== 0) return createdCompare;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function buildQuoteMap(quoteRows = []) {
  const map = new Map();
  quoteRows.forEach((quote) => {
    const symbol = normalizeSymbol(quote?.symbol);
    if (symbol) map.set(symbol, quote);
  });
  return map;
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

function inferDailyPnlPrice(quote, currentPrice) {
  if (hasOwn(quote, 'dailyPnlPrice')) {
    const dailyPnlPrice = toNumber(quote?.dailyPnlPrice);
    return dailyPnlPrice > 0 ? dailyPnlPrice : 0;
  }
  return currentPrice;
}

function roundTiny(value) {
  return Math.abs(value) <= EPSILON ? 0 : value;
}

function groupTrades(stockTrades, quoteMap, snapshotDate) {
  const groups = new Map();
  stockTrades
    .filter((trade) => isTradeOnOrBefore(trade, snapshotDate))
    .forEach((trade) => {
      const symbol = normalizeSymbol(trade?.symbol);
      if (!symbol) return;
      if (!groups.has(symbol)) {
        const quote = quoteMap.get(symbol);
        groups.set(symbol, {
          symbol,
          name: trade?.name || quote?.name || symbol,
          trades: [],
        });
      }
      const group = groups.get(symbol);
      if (trade?.name && (!group.name || group.name === symbol)) group.name = trade.name;
      group.trades.push(trade);
    });
  return groups;
}

function buildSymbolSnapshot(group, quote, snapshotDate) {
  let heldShares = 0;
  let remainingCostUsd = 0;
  let realizedPnlUsd = 0;
  let totalBuyCostUsd = 0;
  let sellProceedsUsd = 0;
  let soldCostUsd = 0;
  let totalBuyShares = 0;
  let totalSellShares = 0;

  [...group.trades].sort(sortTradesAsc).forEach((trade) => {
    const shares = toNumber(trade?.shares);
    const price = toNumber(trade?.price);
    if (shares <= 0 || price <= 0) return;

    if (trade?.side === 'sell') {
      if (heldShares <= EPSILON) return;
      const closedShares = Math.min(shares, heldShares);
      const avgCost = heldShares > EPSILON ? remainingCostUsd / heldShares : 0;
      const closeCost = closedShares * avgCost;
      const closeProceeds = closedShares * price;
      totalSellShares += closedShares;
      sellProceedsUsd += closeProceeds;
      soldCostUsd += closeCost;
      realizedPnlUsd += closeProceeds - closeCost;
      remainingCostUsd -= closeCost;
      heldShares -= closedShares;
      if (heldShares <= EPSILON) {
        heldShares = 0;
        remainingCostUsd = 0;
      }
      return;
    }

    heldShares += shares;
    remainingCostUsd += shares * price;
    totalBuyShares += shares;
    totalBuyCostUsd += shares * price;
  });

  const currentPriceUsd = toNumber(quote?.price);
  const previousCloseUsd = inferPreviousClose(quote, currentPriceUsd);
  const dailyPnlPriceUsd = inferDailyPnlPrice(quote, currentPriceUsd);
  const isOpen = heldShares > EPSILON;
  const avgCostUsd = isOpen ? remainingCostUsd / heldShares : 0;
  const marketValueUsd = isOpen ? heldShares * currentPriceUsd : 0;
  const unrealizedPnlUsd = isOpen ? marketValueUsd - remainingCostUsd : 0;
  const cumulativePnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const canComputeDailyPnl = isOpen && previousCloseUsd > 0 && dailyPnlPriceUsd > 0;
  const dailyPnlUsd = canComputeDailyPnl ? heldShares * (dailyPnlPriceUsd - previousCloseUsd) : null;
  const previousMarketValueUsd = canComputeDailyPnl ? heldShares * previousCloseUsd : 0;

  return {
    snapshotDate,
    symbol: group.symbol,
    name: group.name || quote?.name || group.symbol,
    currency: 'USD',
    heldShares: roundTiny(heldShares),
    avgCostUsd,
    remainingCostUsd: roundTiny(remainingCostUsd),
    currentPriceUsd,
    previousCloseUsd,
    marketValueUsd,
    previousMarketValueUsd,
    realizedPnlUsd: roundTiny(realizedPnlUsd),
    unrealizedPnlUsd: roundTiny(unrealizedPnlUsd),
    cumulativePnlUsd: roundTiny(cumulativePnlUsd),
    dailyPnlUsd: dailyPnlUsd == null ? null : roundTiny(dailyPnlUsd),
    dailyPnlPct: canComputeDailyPnl ? (dailyPnlPriceUsd - previousCloseUsd) / previousCloseUsd : null,
    totalBuyCostUsd: roundTiny(totalBuyCostUsd),
    sellProceedsUsd: roundTiny(sellProceedsUsd),
    soldCostUsd: roundTiny(soldCostUsd),
    totalBuyShares: roundTiny(totalBuyShares),
    totalSellShares: roundTiny(totalSellShares),
    tradeCount: group.trades.length,
    isOpen,
    sourceVersion: PNL_REPORT_SNAPSHOT_VERSION,
  };
}

export function buildPnlReportSnapshots({
  stockTrades = [],
  quoteRows = [],
  snapshotDate = new Date(),
  cashUsd = 0,
  lockedAt = null,
} = {}) {
  const date = normalizeReportDate(snapshotDate);
  const quoteMap = buildQuoteMap(quoteRows);
  const groups = groupTrades(Array.isArray(stockTrades) ? stockTrades : [], quoteMap, date);
  const symbolSnapshots = Array.from(groups.values())
    .map((group) => buildSymbolSnapshot(group, quoteMap.get(group.symbol), date))
    .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || b.marketValueUsd - a.marketValueUsd || a.symbol.localeCompare(b.symbol));

  const openSnapshots = symbolSnapshots.filter((snapshot) => snapshot.isOpen);
  const marketValueUsd = openSnapshots.reduce((sum, snapshot) => sum + snapshot.marketValueUsd, 0);
  const realizedPnlUsd = symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.realizedPnlUsd, 0);
  const unrealizedPnlUsd = openSnapshots.reduce((sum, snapshot) => sum + snapshot.unrealizedPnlUsd, 0);
  const cumulativePnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const totalBuyCostUsd = symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.totalBuyCostUsd, 0);
  const sellProceedsUsd = symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.sellProceedsUsd, 0);
  const previousMarketValueUsd = openSnapshots.reduce((sum, snapshot) => sum + snapshot.previousMarketValueUsd, 0);
  const dailyPnlUnavailableCount = openSnapshots.reduce((sum, snapshot) => sum + (snapshot.dailyPnlUsd == null ? 1 : 0), 0);
  const dailyPnlUsd = dailyPnlUnavailableCount === 0
    ? openSnapshots.reduce((sum, snapshot) => sum + toNumber(snapshot.dailyPnlUsd), 0)
    : null;
  const returnCostBasisUsd = marketValueUsd - cumulativePnlUsd;
  const positiveCostBasisUsd = returnCostBasisUsd > EPSILON
    ? returnCostBasisUsd
    : openSnapshots.reduce((sum, snapshot) => sum + snapshot.remainingCostUsd, 0);

  return {
    portfolioSnapshot: {
      snapshotDate: date,
      currency: 'USD',
      cashUsd: toNumber(cashUsd),
      marketValueUsd,
      totalAssetsUsd: marketValueUsd + toNumber(cashUsd),
      realizedPnlUsd: roundTiny(realizedPnlUsd),
      unrealizedPnlUsd: roundTiny(unrealizedPnlUsd),
      cumulativePnlUsd: roundTiny(cumulativePnlUsd),
      cumulativePnlPct: positiveCostBasisUsd > EPSILON ? cumulativePnlUsd / positiveCostBasisUsd : 0,
      dailyPnlUsd: dailyPnlUsd == null ? null : roundTiny(dailyPnlUsd),
      dailyPnlPct: dailyPnlUsd != null && previousMarketValueUsd > EPSILON ? dailyPnlUsd / previousMarketValueUsd : null,
      totalBuyCostUsd: roundTiny(totalBuyCostUsd),
      sellProceedsUsd: roundTiny(sellProceedsUsd),
      tradeCount: symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.tradeCount, 0),
      holdingCount: openSnapshots.length,
      sourceVersion: PNL_REPORT_SNAPSHOT_VERSION,
      lockedAt,
    },
    symbolSnapshots,
  };
}
