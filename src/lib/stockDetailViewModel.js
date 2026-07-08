import { latestCompletedUsTradingDate } from './pnlReportSnapshots.js';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function dateKeyOrNull(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dateFromKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addDays(dateKey, days) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateKey, months) {
  const date = dateFromKey(dateKey);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function startOfYear(dateKey) {
  return `${String(dateKey).slice(0, 4)}-01-01`;
}

function readTradeDate(trade) {
  return String(trade?.trade_date || trade?.tradeDate || trade?.date || '').slice(0, 10);
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function displayDate(dateKey) {
  return String(dateKey || '').replaceAll('-', '/');
}

function monthLabel(dateKey) {
  const [, month, day] = String(dateKey || '').split('-');
  return month && day ? `${month}/${day}` : '--';
}

function getRangeStartDate(range, endDate, fallbackStart) {
  if (range === 'all') return fallbackStart || endDate;
  const start = {
    '1m': addMonths(endDate, -1),
    '6m': addMonths(endDate, -6),
    ytd: startOfYear(endDate),
    '1y': addDays(endDate, -365),
  }[range];
  return start || fallbackStart || endDate;
}

function firstDate(values) {
  return values
    .filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort()[0] || null;
}

function isCompletedCloseSnapshot(snapshot, now = new Date()) {
  const snapshotDate = dateKeyOrNull(snapshot?.snapshotDate);
  if (!snapshotDate) return false;
  return snapshotDate <= latestCompletedUsTradingDate(now);
}

function filterSymbolTrades(stockTrades, symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  return (Array.isArray(stockTrades) ? stockTrades : [])
    .filter((trade) => normalizeSymbol(trade?.symbol) === normalizedSymbol)
    .map((trade) => ({
      ...trade,
      symbol: normalizedSymbol,
      side: trade?.side === 'sell' ? 'sell' : 'buy',
      date: readTradeDate(trade),
      price: toNumber(trade?.price),
      shares: Math.abs(toNumber(trade?.shares)),
      fee: toNumber(trade?.fee),
    }))
    .filter((trade) => trade.date && trade.shares > 0 && trade.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id || '').localeCompare(String(b.id || '')));
}

function annotateTradeRecords(symbolTrades) {
  let heldShares = 0;
  let remainingCost = 0;
  return symbolTrades.map((trade) => {
    const amountUsd = trade.price * trade.shares;
    let realizedPnlUsd = null;
    if (trade.side === 'sell') {
      const avgCost = heldShares > 0 ? remainingCost / heldShares : 0;
      realizedPnlUsd = avgCost > 0 ? amountUsd - avgCost * trade.shares - trade.fee : null;
      const soldShares = Math.min(heldShares, trade.shares);
      remainingCost = Math.max(0, remainingCost - avgCost * soldShares);
      heldShares = Math.max(0, heldShares - soldShares);
      if (heldShares <= 0.000001) {
        heldShares = 0;
        remainingCost = 0;
      }
    } else {
      remainingCost += amountUsd + trade.fee;
      heldShares += trade.shares;
    }
    return {
      id: trade.id,
      symbol: trade.symbol,
      name: trade.name || trade.symbol,
      side: trade.side,
      date: trade.date,
      shares: trade.shares,
      price: trade.price,
      amountUsd,
      realizedPnlUsd,
    };
  });
}

function buildTradeStats(records, startDate, endDate, range) {
  return records.reduce((stats, record) => {
    if (record.date > endDate) return stats;
    if (range !== 'all' && record.date < startDate) return stats;
    if (record.side === 'sell') {
      stats.sellAmountUsd += record.amountUsd;
      stats.sellCount += 1;
    } else {
      stats.buyAmountUsd += record.amountUsd;
      stats.buyCount += 1;
    }
    return stats;
  }, {
    buyAmountUsd: 0,
    sellAmountUsd: 0,
    buyCount: 0,
    sellCount: 0,
  });
}

function periodSnapshotPnl(row, baseline, range, startsInsideRange) {
  if (!row) return null;
  if (range === 'all' || startsInsideRange) return toNumber(row.cumulativePnlUsd);
  if (baseline && String(baseline.snapshotDate) < String(row.snapshotDate)) {
    return toNumber(row.cumulativePnlUsd) - toNumber(baseline.cumulativePnlUsd);
  }
  return null;
}

function periodReturnPct(periodPnlUsd, latest, baseline, range, startsInsideRange) {
  if (periodPnlUsd == null) return null;
  if (range === 'all' || startsInsideRange) {
    const basis = Math.max(toNumber(latest?.totalBuyCostUsd), toNumber(latest?.remainingCostUsd), 1);
    return periodPnlUsd / basis;
  }
  const basis = Math.max(toNumber(baseline?.marketValueUsd), toNumber(baseline?.remainingCostUsd), toNumber(latest?.remainingCostUsd), 1);
  return periodPnlUsd / basis;
}

export function buildStockDetailViewModel({
  symbol,
  stockTrades = [],
  symbolSnapshots = [],
  range = 'all',
  now = new Date(),
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const trades = filterSymbolTrades(stockTrades, normalizedSymbol);
  const records = annotateTradeRecords(trades);
  const firstTradeDate = trades[0]?.date || null;
  const sortedSnapshots = (Array.isArray(symbolSnapshots) ? symbolSnapshots : [])
    .filter((snapshot) => normalizeSymbol(snapshot?.symbol) === normalizedSymbol)
    .filter((snapshot) => snapshot?.snapshotDate)
    .filter((snapshot) => isCompletedCloseSnapshot(snapshot, now))
    .sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)));
  const latest = sortedSnapshots.at(-1) || null;
  const fallbackEndDate = latest?.snapshotDate || normalizeDate(now);
  const fallbackStartDate = firstDate([sortedSnapshots[0]?.snapshotDate, firstTradeDate]) || fallbackEndDate;
  const startDate = getRangeStartDate(range, fallbackEndDate, fallbackStartDate);
  const endDate = fallbackEndDate;
  const boundedSnapshots = sortedSnapshots.filter((snapshot) => {
    const date = String(snapshot.snapshotDate);
    return date >= startDate && date <= endDate;
  });
  const periodLatest = boundedSnapshots.at(-1) || (range === 'all' ? latest : null);
  const baseline = range === 'all'
    ? null
    : sortedSnapshots.filter((snapshot) => String(snapshot.snapshotDate) < startDate).at(-1) || null;
  const startsInsideRange = Boolean(firstTradeDate && firstTradeDate >= startDate);
  const periodPnlUsd = periodSnapshotPnl(periodLatest, baseline, range, startsInsideRange);
  const periodPnlPct = periodReturnPct(periodPnlUsd, periodLatest, baseline, range, startsInsideRange);
  const stats = buildTradeStats(records, startDate, endDate, range);
  const tradeRecords = records
    .filter((record) => record.date <= endDate && (range === 'all' || record.date >= startDate))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id || '').localeCompare(String(a.id || '')));
  const trend = boundedSnapshots.map((snapshot) => {
    const pnlUsd = periodSnapshotPnl(snapshot, baseline, range, startsInsideRange);
    return {
      date: snapshot.snapshotDate,
      label: monthLabel(snapshot.snapshotDate),
      pnlUsd,
    };
  }).filter((point) => point.pnlUsd != null);

  const latestName = latest?.name || trades.find((trade) => trade.name)?.name || normalizedSymbol;
  return {
    symbol: normalizedSymbol,
    name: latestName,
    hasData: Boolean(latest),
    snapshotDate: periodLatest?.snapshotDate || latest?.snapshotDate || null,
    axisStartDate: range === 'all' ? fallbackStartDate : startDate,
    axisEndDate: endDate,
    startDate: displayDate(range === 'all' ? fallbackStartDate : startDate),
    endDate: displayDate(endDate),
    periodPnlUsd,
    periodPnlPct,
    realizedPnlUsd: toNumber(latest?.realizedPnlUsd),
    unrealizedPnlUsd: toNumber(latest?.unrealizedPnlUsd),
    heldShares: toNumber(latest?.heldShares),
    avgCostUsd: toNumber(latest?.avgCostUsd),
    marketValueUsd: toNumber(latest?.marketValueUsd),
    currentPriceUsd: toNumber(latest?.currentPriceUsd),
    stats,
    trend,
    tradeRecords,
  };
}
