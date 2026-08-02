const BENCHMARK_SYMBOL = 'QQQ';
const EXACT_BASELINE_MODE = 'exact';
const ON_OR_AFTER_BASELINE_MODE = 'on_or_after';
const EPSILON = 0.0000001;

function dateKeyOrNull(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumberOrNull(value) {
  const parsed = finiteNumberOrNull(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonNegativeNumberOrNull(value) {
  const parsed = finiteNumberOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function normalizeZero(value) {
  if (!Number.isFinite(value)) return value;
  return Math.abs(value) <= 1e-10 || Object.is(value, -0) ? 0 : value;
}

function unavailable(reason, detail = {}) {
  return {
    available: false,
    reason,
    benchmarkSymbol: BENCHMARK_SYMBOL,
    baselineMode: detail.baselineMode || null,
    positionStartDate: detail.positionStartDate || null,
    requestedBaselineDate: detail.requestedBaselineDate || null,
    baselineDate: detail.baselineDate || null,
    snapshotDate: detail.snapshotDate || null,
    initialPrincipalUsd: detail.initialPrincipalUsd ?? null,
    periodBasisUsd: null,
    stockPnlUsd: null,
    stockPnlPct: null,
    stockBaselineRawClose: null,
    stockSnapshotRawClose: null,
    benchmarkBaselineRawClose: null,
    benchmarkSnapshotRawClose: null,
    benchmarkBasisUsd: null,
    benchmarkPnlUsd: null,
    benchmarkPnlPct: null,
    excessPnlUsd: null,
    excessPnlPct: null,
    trend: [],
    trendReason: null,
  };
}

function normalizeRawCloseRows(rows) {
  const byDate = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const date = dateKeyOrNull(row?.date);
    // Comparison prices are deliberately unadjusted on both sides. Never fall
    // back to adjustedClose/close because that would silently mix return bases.
    const rawClose = positiveNumberOrNull(row?.rawClose ?? row?.raw_close);
    if (!date) return;
    byDate.set(date, { date, rawClose });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeStockTrend(trend) {
  const byDate = new Map();
  (Array.isArray(trend) ? trend : []).forEach((point) => {
    const date = dateKeyOrNull(point?.date);
    const heldShares = nonNegativeNumberOrNull(point?.heldShares);
    if (!date || heldShares === null) return;
    byDate.set(date, {
      date,
      heldShares,
    });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeTrades(trades) {
  return (Array.isArray(trades) ? trades : [])
    .map((trade, sourceIndex) => {
      const date = dateKeyOrNull(trade?.date ?? trade?.trade_date ?? trade?.tradeDate);
      const side = trade?.side === 'sell' ? 'sell' : trade?.side === 'buy' ? 'buy' : null;
      const price = positiveNumberOrNull(trade?.price);
      const shares = positiveNumberOrNull(trade?.shares);
      if (!date || !side || price === null || shares === null) return null;
      return {
        date,
        side,
        price,
        shares,
        createdAt: String(trade?.createdAt ?? trade?.created_at ?? ''),
        orderIndex: finiteNumberOrNull(trade?.orderIndex) ?? sourceIndex,
        id: String(trade?.id ?? ''),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      a.date.localeCompare(b.date)
      || a.createdAt.localeCompare(b.createdAt)
      || a.orderIndex - b.orderIndex
      || a.id.localeCompare(b.id)
    ));
}

function createLedger(shares, principalUsd) {
  return {
    shares,
    remainingCostUsd: principalUsd,
    realizedPnlUsd: 0,
    contributedCapitalUsd: principalUsd,
  };
}

function applyBuy(ledger, shares, amountUsd) {
  ledger.shares += shares;
  ledger.remainingCostUsd += amountUsd;
  ledger.contributedCapitalUsd += amountUsd;
}

function applySell(ledger, requestedShares, price) {
  if (!(ledger.shares > EPSILON)) return { soldShares: 0, soldRatio: 0 };
  const preSaleShares = ledger.shares;
  const soldShares = Math.min(requestedShares, preSaleShares);
  const soldRatio = soldShares / preSaleShares;
  const avgCost = ledger.remainingCostUsd / preSaleShares;
  const soldCost = avgCost * soldShares;
  ledger.realizedPnlUsd += soldShares * price - soldCost;
  ledger.remainingCostUsd = Math.max(0, ledger.remainingCostUsd - soldCost);
  ledger.shares = Math.max(0, preSaleShares - soldShares);
  if (ledger.shares <= EPSILON) {
    ledger.shares = 0;
    ledger.remainingCostUsd = 0;
  }
  return { soldShares, soldRatio };
}

function applyMatchedTrade(stockLedger, benchmarkLedger, trade, benchmarkRawClose) {
  if (trade.side === 'buy') {
    const amountUsd = trade.shares * trade.price;
    applyBuy(stockLedger, trade.shares, amountUsd);
    applyBuy(benchmarkLedger, amountUsd / benchmarkRawClose, amountUsd);
    return;
  }

  const { soldRatio } = applySell(stockLedger, trade.shares, trade.price);
  if (!(soldRatio > 0) || !(benchmarkLedger.shares > EPSILON)) return;
  applySell(benchmarkLedger, benchmarkLedger.shares * soldRatio, benchmarkRawClose);
}

function ledgerMetrics(ledger, marketValueUsd) {
  const pnlUsd = normalizeZero(
    ledger.realizedPnlUsd + marketValueUsd - ledger.remainingCostUsd,
  );
  // The comparison always replays the complete ledger from one fixed start.
  // Later buys increase the shared contribution basis; sells realize P&L but
  // never shrink that basis. This keeps return rates continuous across trims.
  const basisUsd = normalizeZero(ledger.contributedCapitalUsd);
  const effectiveCostBasisUsd = normalizeZero(
    ledger.remainingCostUsd - ledger.realizedPnlUsd,
  );
  return {
    pnlUsd,
    pnlPct: basisUsd > EPSILON ? normalizeZero(pnlUsd / basisUsd) : null,
    basisUsd,
    avgCostUsd: ledger.shares > EPSILON ? ledger.remainingCostUsd / ledger.shares : null,
    effectiveCostUsd: ledger.shares > EPSILON ? effectiveCostBasisUsd / ledger.shares : null,
    realizedPnlUsd: normalizeZero(ledger.realizedPnlUsd),
    remainingCostUsd: normalizeZero(ledger.remainingCostUsd),
    heldShares: normalizeZero(ledger.shares),
    marketValueUsd: normalizeZero(marketValueUsd),
  };
}

function sharesMatch(actual, expected) {
  const tolerance = Math.max(0.000001, Math.abs(expected) * 0.000001);
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Build a cash-flow-matched comparison against QQQ.
 *
 * The first exact unadjusted stock/QQQ close on or after the requested date
 * becomes d0. Personal snapshots contribute only dates and held-share
 * integrity; all market values come from provider rawClose rows.
 * Both ledgers are initialized with the stock's d0 market value, so both lines
 * start at zero. Later stock buys invest the same dollars in QQQ; later sells
 * liquidate the same pre-sale holding ratio from QQQ. Prices are never filled,
 * interpolated, or substituted.
 */
export function buildStockReturnComparison(stockDetail, qqqRows, stockRawRows) {
  if (!stockDetail || typeof stockDetail !== 'object') {
    return unavailable('missing_stock_detail');
  }

  const requestedBaselineDate = dateKeyOrNull(stockDetail.benchmarkBaselineDate);
  const snapshotDate = dateKeyOrNull(stockDetail.benchmarkEndDate || stockDetail.snapshotDate);
  const positionStartDate = dateKeyOrNull(stockDetail.comparisonPositionStartDate);
  const baselineMode = stockDetail.benchmarkBaselineMode || ON_OR_AFTER_BASELINE_MODE;
  const detail = {
    baselineMode,
    positionStartDate,
    requestedBaselineDate,
    snapshotDate,
  };

  if (stockDetail.comparisonIntegrityReason) {
    return unavailable(String(stockDetail.comparisonIntegrityReason), detail);
  }
  if (!positionStartDate) return unavailable('missing_position_start_date', detail);
  if (!requestedBaselineDate) return unavailable('missing_benchmark_baseline_date', detail);
  if (!snapshotDate) return unavailable('missing_snapshot_date', detail);
  if (![EXACT_BASELINE_MODE, ON_OR_AFTER_BASELINE_MODE].includes(baselineMode)) {
    return unavailable('invalid_benchmark_baseline_mode', detail);
  }
  if (requestedBaselineDate > snapshotDate || positionStartDate > snapshotDate) {
    return unavailable('invalid_benchmark_range', detail);
  }
  const effectiveRequestedDate = [requestedBaselineDate, positionStartDate].sort().at(-1);

  const stockTrend = normalizeStockTrend(stockDetail.comparisonTrend);
  if (stockTrend.length === 0) return unavailable('missing_stock_comparison_trend', detail);

  const stockRows = normalizeRawCloseRows(stockRawRows);
  if (stockRows.length === 0 || stockRows.every((row) => row.rawClose === null)) {
    return unavailable('missing_stock_raw_closes', detail);
  }
  const stockRawByDate = new Map(stockRows
    .filter((row) => row.rawClose !== null)
    .map((row) => [row.date, row.rawClose]));

  const benchmarkRows = normalizeRawCloseRows(qqqRows);
  if (benchmarkRows.length === 0 || benchmarkRows.every((row) => row.rawClose === null)) {
    return unavailable('missing_benchmark_raw_closes', detail);
  }
  const benchmarkByDate = new Map(benchmarkRows
    .filter((row) => row.rawClose !== null)
    .map((row) => [row.date, row.rawClose]));

  const snapshotStock = stockTrend.find((point) => point.date === snapshotDate) || null;
  if (!snapshotStock) return unavailable('missing_exact_stock_snapshot', detail);
  const stockSnapshotRawClose = stockRawByDate.get(snapshotDate) ?? null;
  if (stockSnapshotRawClose === null) {
    return unavailable('missing_exact_stock_raw_snapshot', detail);
  }
  const benchmarkSnapshotRawClose = benchmarkByDate.get(snapshotDate) ?? null;
  if (benchmarkSnapshotRawClose === null) {
    return unavailable('missing_exact_benchmark_snapshot', detail);
  }

  const baselineStock = stockTrend.find((point) => (
    (baselineMode === EXACT_BASELINE_MODE
      ? point.date === effectiveRequestedDate
      : point.date >= effectiveRequestedDate)
    && point.date <= snapshotDate
    && stockRawByDate.has(point.date)
    && benchmarkByDate.has(point.date)
  )) || null;
  if (!baselineStock) {
    return unavailable(
      baselineMode === EXACT_BASELINE_MODE
        ? 'missing_exact_common_baseline'
        : 'missing_common_baseline_on_or_after',
      detail,
    );
  }
  if (!(baselineStock.heldShares > EPSILON)) {
    return unavailable('missing_positive_baseline_position', {
      ...detail,
      baselineDate: baselineStock.date,
    });
  }

  const stockBaselineRawClose = stockRawByDate.get(baselineStock.date);
  const benchmarkBaselineRawClose = benchmarkByDate.get(baselineStock.date);
  const initialPrincipalUsd = baselineStock.heldShares * stockBaselineRawClose;
  const stockLedger = createLedger(baselineStock.heldShares, initialPrincipalUsd);
  const benchmarkLedger = createLedger(
    initialPrincipalUsd / benchmarkBaselineRawClose,
    initialPrincipalUsd,
  );
  const trades = normalizeTrades(stockDetail.comparisonTrades)
    .filter((trade) => trade.date > baselineStock.date && trade.date <= snapshotDate);

  const missingTradeClose = trades.find((trade) => !benchmarkByDate.has(trade.date));
  if (missingTradeClose) {
    return unavailable('missing_exact_benchmark_trade_close', {
      ...detail,
      baselineDate: baselineStock.date,
      initialPrincipalUsd,
    });
  }

  const commonPoints = stockTrend.filter((point) => (
    point.date >= baselineStock.date
    && point.date <= snapshotDate
    && stockRawByDate.has(point.date)
    && benchmarkByDate.has(point.date)
  ));
  const trend = [];
  let tradeIndex = 0;
  for (const point of commonPoints) {
    while (tradeIndex < trades.length && trades[tradeIndex].date <= point.date) {
      const trade = trades[tradeIndex];
      applyMatchedTrade(stockLedger, benchmarkLedger, trade, benchmarkByDate.get(trade.date));
      tradeIndex += 1;
    }

    if (!sharesMatch(stockLedger.shares, point.heldShares)) {
      return unavailable('stock_trade_snapshot_mismatch', {
        ...detail,
        baselineDate: baselineStock.date,
        initialPrincipalUsd,
      });
    }

    const stockRawClose = stockRawByDate.get(point.date);
    const stockMarketValueUsd = stockLedger.shares * stockRawClose;
    const benchmarkRawClose = benchmarkByDate.get(point.date);
    const benchmarkMarketValueUsd = benchmarkLedger.shares * benchmarkRawClose;
    const stock = ledgerMetrics(stockLedger, stockMarketValueUsd);
    const benchmark = ledgerMetrics(benchmarkLedger, benchmarkMarketValueUsd);
    trend.push({
      date: point.date,
      stockPnlUsd: stock.pnlUsd,
      stockPnlPct: stock.pnlPct,
      stockBasisUsd: stock.basisUsd,
      stockAvgCostUsd: stock.avgCostUsd,
      stockEffectiveCostUsd: stock.effectiveCostUsd,
      stockRealizedPnlUsd: stock.realizedPnlUsd,
      stockHeldShares: stock.heldShares,
      stockMarketValueUsd: stock.marketValueUsd,
      stockRawClose,
      benchmarkRawClose,
      benchmarkPnlUsd: benchmark.pnlUsd,
      benchmarkPnlPct: benchmark.pnlPct,
      benchmarkBasisUsd: benchmark.basisUsd,
      benchmarkAvgCostUsd: benchmark.avgCostUsd,
      benchmarkEffectiveCostUsd: benchmark.effectiveCostUsd,
      benchmarkRealizedPnlUsd: benchmark.realizedPnlUsd,
      benchmarkHeldShares: benchmark.heldShares,
      benchmarkMarketValueUsd: benchmark.marketValueUsd,
      excessPnlUsd: normalizeZero(stock.pnlUsd - benchmark.pnlUsd),
      excessPnlPct: stock.pnlPct !== null && benchmark.pnlPct !== null
        ? normalizeZero(stock.pnlPct - benchmark.pnlPct)
        : null,
    });
  }

  const latest = trend.at(-1);
  if (!latest || latest.date !== snapshotDate) {
    return unavailable('missing_exact_common_snapshot', {
      ...detail,
      baselineDate: baselineStock.date,
      initialPrincipalUsd,
    });
  }

  return {
    available: true,
    reason: null,
    benchmarkSymbol: BENCHMARK_SYMBOL,
    baselineMode,
    positionStartDate,
    requestedBaselineDate,
    baselineDate: baselineStock.date,
    snapshotDate,
    initialPrincipalUsd,
    periodBasisUsd: latest.stockBasisUsd,
    stockPnlUsd: latest.stockPnlUsd,
    stockPnlPct: latest.stockPnlPct,
    stockBaselineRawClose,
    stockSnapshotRawClose,
    benchmarkBaselineRawClose,
    benchmarkSnapshotRawClose,
    benchmarkBasisUsd: latest.benchmarkBasisUsd,
    benchmarkPnlUsd: latest.benchmarkPnlUsd,
    benchmarkPnlPct: latest.benchmarkPnlPct,
    excessPnlUsd: latest.excessPnlUsd,
    excessPnlPct: latest.excessPnlPct,
    trend,
    trendReason: null,
  };
}

export const STOCK_RETURN_COMPARISON_CONFIG = Object.freeze({
  benchmarkSymbol: BENCHMARK_SYMBOL,
  baselineModes: Object.freeze({
    exact: EXACT_BASELINE_MODE,
    onOrAfter: ON_OR_AFTER_BASELINE_MODE,
  }),
});
