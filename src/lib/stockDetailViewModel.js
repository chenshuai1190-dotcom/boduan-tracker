import { latestCompletedUsTradingDate } from './pnlReportSnapshots.js';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nearlyEqual(actual, expected, minimumTolerance = 0.000001) {
  const tolerance = Math.max(minimumTolerance, Math.abs(expected) * 0.000001);
  return Math.abs(actual - expected) <= tolerance;
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

function inclusiveCalendarDays(startDate, endDate) {
  const start = dateFromKey(startDate);
  const end = dateFromKey(endDate);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? days : null;
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

function readTradeCreatedAt(trade) {
  return String(trade?.created_at || trade?.createdAt || '');
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
    .map((trade, orderIndex) => ({ trade, orderIndex }))
    .filter(({ trade }) => normalizeSymbol(trade?.symbol) === normalizedSymbol)
    .map(({ trade, orderIndex }) => ({
      ...trade,
      symbol: normalizedSymbol,
      side: trade?.side === 'sell' ? 'sell' : 'buy',
      date: readTradeDate(trade),
      createdAt: readTradeCreatedAt(trade),
      orderIndex,
      price: toNumber(trade?.price),
      shares: Math.abs(toNumber(trade?.shares)),
      fee: toNumber(trade?.fee),
    }))
    .filter((trade) => trade.date && trade.shares > 0 && trade.price > 0)
    .sort((a, b) => (
      a.date.localeCompare(b.date)
      || a.createdAt.localeCompare(b.createdAt)
      || a.orderIndex - b.orderIndex
      || String(a.id || '').localeCompare(String(b.id || ''))
    ));
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

function buildCurrentHoldingPeriod(symbolTrades, endDate, heldShares) {
  if (toNumber(heldShares) <= 0.000001) {
    return { holdingStartDate: null, holdingDays: null, startIndex: null };
  }
  let shares = 0;
  let holdingStartDate = null;
  let startIndex = null;
  symbolTrades.forEach((trade, index) => {
    if (trade.date > endDate) return;
    if (trade.side === 'sell') {
      shares = Math.max(0, shares - trade.shares);
      if (shares <= 0.000001) {
        shares = 0;
        holdingStartDate = null;
        startIndex = null;
      }
      return;
    }
    if (shares <= 0.000001) {
      holdingStartDate = trade.date;
      startIndex = index;
    }
    shares += trade.shares;
  });
  return {
    holdingStartDate,
    holdingDays: holdingStartDate ? inclusiveCalendarDays(holdingStartDate, endDate) : null,
    startIndex,
  };
}

function buildComparisonLedgerPoint(cycleTrades, snapshot) {
  const snapshotDate = dateKeyOrNull(snapshot?.snapshotDate);
  if (!snapshotDate) return null;

  let heldShares = 0;
  let remainingCostUsd = 0;
  let activeRealizedPnlUsd = 0;

  cycleTrades.forEach((trade) => {
    if (trade.date > snapshotDate) return;
    if (trade.side === 'sell') {
      if (heldShares <= 0.000001) return;
      const closedShares = Math.min(trade.shares, heldShares);
      const avgCostUsd = remainingCostUsd / heldShares;
      const closeCostUsd = closedShares * avgCostUsd;
      const closeProceedsUsd = closedShares * trade.price;
      remainingCostUsd = Math.max(0, remainingCostUsd - closeCostUsd);
      activeRealizedPnlUsd += closeProceedsUsd - closeCostUsd;
      heldShares = Math.max(0, heldShares - closedShares);
      if (heldShares <= 0.000001) {
        heldShares = 0;
        remainingCostUsd = 0;
        activeRealizedPnlUsd = 0;
      }
      return;
    }

    // Match the formal holdings and personal-snapshot accounting boundary: fees
    // remain excluded until those two existing production paths are unified.
    heldShares += trade.shares;
    remainingCostUsd += trade.shares * trade.price;
  });

  if (heldShares <= 0.000001) return null;
  const snapshotHeldShares = finiteNumberOrNull(snapshot?.heldShares);
  const integrityReason = snapshotHeldShares !== null && !nearlyEqual(heldShares, snapshotHeldShares)
    ? 'stock_trade_snapshot_mismatch'
    : null;
  const avgCostUsd = remainingCostUsd / heldShares;
  const effectiveRemainingCostUsd = remainingCostUsd - activeRealizedPnlUsd;
  const returnCostBasisUsd = effectiveRemainingCostUsd > 0
    ? effectiveRemainingCostUsd
    : null;
  const effectiveCostUsd = effectiveRemainingCostUsd / heldShares;

  return {
    date: snapshotDate,
    heldShares: snapshotHeldShares ?? heldShares,
    integrityReason,
    avgCostUsd,
    remainingCostUsd,
    activeRealizedPnlUsd,
    effectiveCostUsd,
    effectiveRemainingCostUsd,
    returnCostBasisUsd,
  };
}

function periodSnapshotPnl(row, baseline, range, startsInsideRange) {
  if (!row) return null;
  if (range === 'all' || startsInsideRange) return toNumber(row.cumulativePnlUsd);
  if (baseline && String(baseline.snapshotDate) < String(row.snapshotDate)) {
    return toNumber(row.cumulativePnlUsd) - toNumber(baseline.cumulativePnlUsd);
  }
  return null;
}

function periodReturnBasis(latest, baseline, range, startsInsideRange) {
  if (range === 'all' || startsInsideRange) {
    return Math.max(toNumber(latest?.totalBuyCostUsd), toNumber(latest?.remainingCostUsd), 1);
  }
  return Math.max(
    toNumber(baseline?.marketValueUsd),
    toNumber(baseline?.remainingCostUsd),
    toNumber(latest?.remainingCostUsd),
    1,
  );
}

function periodReturnPct(periodPnlUsd, basis) {
  if (periodPnlUsd == null || !(toNumber(basis) > 0)) return null;
  return periodPnlUsd / toNumber(basis);
}

function snapshotReturnPct(snapshot, pnlUsd, baseline, range, startsInsideRange) {
  if (pnlUsd == null) return null;
  return pnlUsd / periodReturnBasis(snapshot, baseline, range, startsInsideRange);
}

function buildTrendStats(points) {
  const valid = (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(Number(point?.pnlUsd)));
  if (valid.length === 0) {
    return {
      peakPnlUsd: null,
      maxGivebackUsd: null,
      maxDrawdownUsd: null,
      drawdownRate: null,
      givebackRate: null,
      maxDrawdownPct: null,
      peakDate: null,
      currentPnlUsd: null,
    };
  }

  let peakPoint = valid[0];
  let runningPeak = valid[0];
  let maxGivebackUsd = 0;
  let maxGivebackPeakPoint = valid[0];
  valid.forEach((point) => {
    if (toNumber(point.pnlUsd) > toNumber(peakPoint.pnlUsd)) peakPoint = point;
    if (toNumber(point.pnlUsd) > toNumber(runningPeak.pnlUsd)) runningPeak = point;
    const giveback = toNumber(point.pnlUsd) - toNumber(runningPeak.pnlUsd);
    if (giveback < maxGivebackUsd) {
      maxGivebackUsd = giveback;
      maxGivebackPeakPoint = runningPeak;
    }
  });
  const peakValue = toNumber(peakPoint.pnlUsd);
  const drawdownBase = toNumber(maxGivebackPeakPoint?.marketValueUsd);
  return {
    peakPnlUsd: peakValue,
    maxGivebackUsd,
    // Keep the old field as an alias for older callers; the UI labels it as giveback.
    maxDrawdownUsd: maxGivebackUsd,
    drawdownRate: drawdownBase > 0 ? maxGivebackUsd / drawdownBase : null,
    givebackRate: peakValue > 0 ? Math.abs(maxGivebackUsd) / peakValue : null,
    maxDrawdownPct: drawdownBase > 0 ? maxGivebackUsd / drawdownBase : null,
    peakDate: peakPoint.date,
    currentPnlUsd: toNumber(valid.at(-1)?.pnlUsd),
  };
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
  const periodBasisUsd = periodPnlUsd == null
    ? null
    : periodReturnBasis(periodLatest, baseline, range, startsInsideRange);
  const periodPnlPct = periodReturnPct(periodPnlUsd, periodBasisUsd);
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
      cumulativePnlUsd: toNumber(snapshot.cumulativePnlUsd),
      dailyPnlUsd: snapshot.dailyPnlUsd == null ? null : toNumber(snapshot.dailyPnlUsd),
      returnPct: snapshotReturnPct(snapshot, pnlUsd, baseline, range, startsInsideRange),
      marketValueUsd: toNumber(snapshot.marketValueUsd),
      closePriceUsd: toNumber(snapshot.currentPriceUsd),
      realizedPnlUsd: toNumber(snapshot.realizedPnlUsd),
      unrealizedPnlUsd: toNumber(snapshot.unrealizedPnlUsd),
    };
  }).filter((point) => point.pnlUsd != null);
  const trendDates = new Set(trend.map((point) => point.date));
  const visibleTradeEvents = tradeRecords
    .filter((record) => trend.length > 0)
    .map((record) => {
      const exactDate = trendDates.has(record.date)
        ? record.date
        : trend.find((point) => point.date >= record.date)?.date || trend.at(-1)?.date;
      return {
        ...record,
        markerDate: exactDate,
      };
    })
    .filter((record) => record.markerDate);
  const trendStats = buildTrendStats(trend);
  const holdingPeriod = buildCurrentHoldingPeriod(trades, endDate, latest?.heldShares);
  const cycleTrades = holdingPeriod.startIndex == null
    ? []
    : trades.slice(holdingPeriod.startIndex).filter((trade) => trade.date <= endDate);
  const comparisonLedgerPoints = holdingPeriod.holdingStartDate
    ? sortedSnapshots
      .filter((snapshot) => String(snapshot.snapshotDate) >= holdingPeriod.holdingStartDate && String(snapshot.snapshotDate) <= endDate)
      .map((snapshot) => buildComparisonLedgerPoint(cycleTrades, snapshot))
      .filter(Boolean)
    : [];
  const comparisonIntegrityReason = comparisonLedgerPoints.find((point) => point.integrityReason)?.integrityReason || null;
  const comparisonTrend = comparisonIntegrityReason ? [] : comparisonLedgerPoints;
  // Return comparison keeps one fixed start for the current holding cycle.
  // Page range filters must not rebase QQQ or discard earlier cash flows.
  const comparisonRequestedStartDate = holdingPeriod.holdingStartDate || null;
  const comparisonEndDate = comparisonIntegrityReason ? null : comparisonTrend.at(-1)?.date || null;

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
    periodBasisUsd,
    benchmarkBaselineDate: comparisonRequestedStartDate,
    benchmarkBaselineMode: 'on_or_after',
    benchmarkEndDate: comparisonEndDate,
    benchmarkQueryStartDate: comparisonRequestedStartDate,
    benchmarkQueryEndDate: comparisonEndDate,
    comparisonPositionStartDate: holdingPeriod.holdingStartDate,
    comparisonIntegrityReason,
    comparisonTrend,
    comparisonTrades: cycleTrades.map((trade) => ({
      id: trade.id,
      date: trade.date,
      side: trade.side,
      price: trade.price,
      shares: trade.shares,
      createdAt: trade.createdAt,
      orderIndex: trade.orderIndex,
    })),
    realizedPnlUsd: toNumber(latest?.realizedPnlUsd),
    unrealizedPnlUsd: toNumber(latest?.unrealizedPnlUsd),
    heldShares: toNumber(latest?.heldShares),
    holdingStartDate: holdingPeriod.holdingStartDate,
    holdingDays: holdingPeriod.holdingDays,
    avgCostUsd: toNumber(latest?.avgCostUsd),
    marketValueUsd: toNumber(latest?.marketValueUsd),
    currentPriceUsd: toNumber(latest?.currentPriceUsd),
    stats,
    trend,
    trendStats,
    tradeEvents: visibleTradeEvents,
    tradeRecords,
  };
}
