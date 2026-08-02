import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

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
    comparisonScope: 'current_holding_only',
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

function buildSurvivingBuyLots(trades) {
  const lots = [];
  let heldShares = 0;

  trades.forEach((trade) => {
    if (trade.side === 'buy') {
      lots.push({
        date: trade.date,
        price: trade.price,
        shares: trade.shares,
        createdAt: trade.createdAt,
        orderIndex: trade.orderIndex,
        id: trade.id,
      });
      heldShares += trade.shares;
      return;
    }

    if (!(heldShares > EPSILON)) return;
    const soldShares = Math.min(trade.shares, heldShares);
    const survivingRatio = Math.max(0, (heldShares - soldShares) / heldShares);
    lots.forEach((lot) => {
      lot.shares *= survivingRatio;
    });
    heldShares = Math.max(0, heldShares - soldShares);
    if (heldShares <= EPSILON) {
      heldShares = 0;
      lots.length = 0;
    }
  });

  return {
    heldShares: normalizeZero(heldShares),
    lots: lots.filter((lot) => lot.shares > EPSILON),
  };
}

function ledgerMetrics(ledger, marketValueUsd) {
  const pnlUsd = normalizeZero(
    ledger.realizedPnlUsd + marketValueUsd - ledger.remainingCostUsd,
  );
  // This ledger contains only the buy lots that survive in the current holding.
  // Sold portions (and their realized P&L) are removed before the fixed-start
  // history is rebuilt, so the basis is exactly the capital still represented.
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

function isNonTradingCalendarDate(dateKey) {
  const parsed = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return [0, 6].includes(parsed.getUTCDay()) || isRegularNyseHoliday(dateKey);
}

function tradeSnapshotsMatch(initialShares, trades, points) {
  let heldShares = initialShares;
  let tradeIndex = 0;
  for (const point of points) {
    while (tradeIndex < trades.length && trades[tradeIndex].date <= point.date) {
      const trade = trades[tradeIndex];
      heldShares = trade.side === 'buy'
        ? heldShares + trade.shares
        : Math.max(0, heldShares - Math.min(heldShares, trade.shares));
      tradeIndex += 1;
    }
    if (!sharesMatch(heldShares, point.heldShares)) return false;
  }
  return true;
}

/**
 * Build a current-holding-only comparison against QQQ.
 *
 * The first exact unadjusted stock/QQQ close on or after the requested date
 * becomes d0. Personal snapshots contribute only dates and held-share
 * integrity; all market values come from provider rawClose rows.
 * Formal trades first determine which proportional buy-lot shares still exist
 * at the snapshot. Sold portions and their matched QQQ shares are removed from
 * the whole history. Both rebuilt ledgers start with the surviving d0 market
 * value, and each later surviving buy invests the same dollars in QQQ. Prices
 * are never filled, interpolated, or substituted.
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

  const trades = normalizeTrades(stockDetail.comparisonTrades)
    .filter((trade) => trade.date >= positionStartDate && trade.date <= snapshotDate);
  const integrityPoints = stockTrend.filter((point) => (
    point.date >= baselineStock.date && point.date <= snapshotDate
  ));
  const integrityTrades = trades.filter((trade) => trade.date > baselineStock.date);
  if (!tradeSnapshotsMatch(baselineStock.heldShares, integrityTrades, integrityPoints)) {
    return unavailable('stock_trade_snapshot_mismatch', {
      ...detail,
      baselineDate: baselineStock.date,
    });
  }
  const survivingPosition = buildSurvivingBuyLots(trades);
  if (!sharesMatch(survivingPosition.heldShares, snapshotStock.heldShares)) {
    return unavailable('stock_trade_snapshot_mismatch', {
      ...detail,
      baselineDate: baselineStock.date,
    });
  }
  if (!(survivingPosition.heldShares > EPSILON)) {
    return unavailable('missing_positive_current_position', {
      ...detail,
      baselineDate: baselineStock.date,
    });
  }

  const initialSurvivingShares = survivingPosition.lots
    .filter((lot) => lot.date <= baselineStock.date)
    .reduce((sum, lot) => sum + lot.shares, 0);
  if (!(initialSurvivingShares > EPSILON)) {
    return unavailable('missing_positive_baseline_position', {
      ...detail,
      baselineDate: baselineStock.date,
    });
  }

  const stockBaselineRawClose = stockRawByDate.get(baselineStock.date);
  const benchmarkBaselineRawClose = benchmarkByDate.get(baselineStock.date);
  const initialPrincipalUsd = initialSurvivingShares * stockBaselineRawClose;
  const stockLedger = createLedger(initialSurvivingShares, initialPrincipalUsd);
  const benchmarkLedger = createLedger(
    initialPrincipalUsd / benchmarkBaselineRawClose,
    initialPrincipalUsd,
  );
  const commonRawCloseDates = stockRows
    .filter((row) => (
      row.rawClose !== null
      && row.date > baselineStock.date
      && row.date <= snapshotDate
      && benchmarkByDate.has(row.date)
    ))
    .map((row) => row.date);
  const laterSurvivingBuys = [];
  for (const lot of survivingPosition.lots.filter((item) => item.date > baselineStock.date)) {
    if (!isNonTradingCalendarDate(lot.date)) {
      if (!stockRawByDate.has(lot.date)) {
        return unavailable('missing_exact_stock_trade_close', {
          ...detail,
          baselineDate: baselineStock.date,
          initialPrincipalUsd,
        });
      }
      if (!benchmarkByDate.has(lot.date)) {
        return unavailable('missing_exact_benchmark_trade_close', {
          ...detail,
          baselineDate: baselineStock.date,
          initialPrincipalUsd,
        });
      }
      laterSurvivingBuys.push({ ...lot, effectiveDate: lot.date });
      continue;
    }

    const effectiveDate = commonRawCloseDates.find((date) => date > lot.date) || null;
    if (!effectiveDate) {
      return unavailable('missing_common_trade_close_on_or_after', {
        ...detail,
        baselineDate: baselineStock.date,
        initialPrincipalUsd,
      });
    }
    laterSurvivingBuys.push({ ...lot, effectiveDate });
  }

  const commonPoints = stockTrend.filter((point) => (
    point.date >= baselineStock.date
    && point.date <= snapshotDate
    && stockRawByDate.has(point.date)
    && benchmarkByDate.has(point.date)
  ));
  const trend = [];
  let buyIndex = 0;
  for (const point of commonPoints) {
    while (buyIndex < laterSurvivingBuys.length && laterSurvivingBuys[buyIndex].effectiveDate <= point.date) {
      const buy = laterSurvivingBuys[buyIndex];
      const amountUsd = buy.shares * buy.price;
      const benchmarkTradeClose = benchmarkByDate.get(buy.effectiveDate);
      applyBuy(stockLedger, buy.shares, amountUsd);
      applyBuy(benchmarkLedger, amountUsd / benchmarkTradeClose, amountUsd);
      buyIndex += 1;
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
    comparisonScope: 'current_holding_only',
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
