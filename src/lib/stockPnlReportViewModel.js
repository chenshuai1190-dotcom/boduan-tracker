import { latestCompletedUsTradingDate } from './pnlReportSnapshots.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

const EPSILON = 0.0000001;

function dateKey(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? null : text;
}

function finite(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function asDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function shiftDays(value, days) {
  const date = asDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftMonths(value, months) {
  const date = asDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function isRegularTradingDay(value) {
  const day = asDate(value).getUTCDay();
  return day !== 0 && day !== 6 && !isRegularNyseHoliday(value);
}

function previousRegularTradingDay(value) {
  let date = shiftDays(value, -1);
  while (!isRegularTradingDay(date)) date = shiftDays(date, -1);
  return date;
}

function lastRegularTradingDayOfMonth(month) {
  const [year, number] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  let date = end;
  while (!isRegularTradingDay(date)) date = shiftDays(date, -1);
  return date;
}

function displayDate(value) {
  return value ? value.replaceAll('-', '/') : '--';
}

function monthLabel(value) {
  return value ? value.slice(0, 7).replace('-', '/') : '--';
}

function normalizeTrades(stockTrades, symbol) {
  return (Array.isArray(stockTrades) ? stockTrades : [])
    .filter((trade) => String(trade?.symbol || '').trim().toUpperCase() === symbol)
    .map((trade) => ({
      date: dateKey(trade?.trade_date ?? trade?.tradeDate ?? trade?.date),
      side: trade?.side,
      shares: positive(trade?.shares),
      price: positive(trade?.price),
    }))
    .filter((trade) => trade.date && ['buy', 'sell'].includes(trade.side) && trade.shares !== null && trade.price !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeSnapshots(symbolSnapshots, symbol, completedDate) {
  const byDate = new Map();
  (Array.isArray(symbolSnapshots) ? symbolSnapshots : []).forEach((row) => {
    if (String(row?.symbol || '').trim().toUpperCase() !== symbol) return;
    const date = dateKey(row?.snapshotDate ?? row?.snapshot_date);
    if (!date || date > completedDate) return;
    const lockedAt = row?.lockedAt ?? row?.locked_at;
    if (lockedAt && date > latestCompletedUsTradingDate(lockedAt)) return;
    const cumulativePnlUsd = finite(row?.cumulativePnlUsd ?? row?.cumulative_pnl_usd);
    if (cumulativePnlUsd === null) return;
    byDate.set(date, {
      date,
      cumulativePnlUsd,
      realizedPnlUsd: finite(row?.realizedPnlUsd ?? row?.realized_pnl_usd),
      unrealizedPnlUsd: finite(row?.unrealizedPnlUsd ?? row?.unrealized_pnl_usd),
      marketValueUsd: finite(row?.marketValueUsd ?? row?.market_value_usd),
      currentPriceUsd: positive(row?.currentPriceUsd ?? row?.current_price_usd),
    });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeBenchmarkRows(benchmarkRows) {
  const byDate = new Map();
  (Array.isArray(benchmarkRows) ? benchmarkRows : []).forEach((row) => {
    const date = dateKey(row?.date ?? row?.snapshotDate);
    // Both comparison lines must use the same adjusted-price convention on
    // every plotted date. Raw close fallback can invent split/dividend jumps.
    const close = positive(row?.adjustedClose ?? row?.adjusted_close);
    if (date && close !== null) byDate.set(date, close);
  });
  return byDate;
}

function normalizeCustomRange(customRange) {
  const from = dateKey(customRange?.startDate ?? customRange?.from);
  const to = dateKey(customRange?.endDate ?? customRange?.to);
  if (!from || !to) return null;
  return from <= to ? { startDate: from, endDate: to } : { startDate: to, endDate: from };
}

function rangeBounds(range, latestDate, firstTradeDate, customRange) {
  if (range === 'custom') return normalizeCustomRange(customRange);
  const startDate = {
    all: firstTradeDate,
    month: `${latestDate.slice(0, 7)}-01`,
    '1m': shiftMonths(latestDate, -1),
    '6m': shiftMonths(latestDate, -6),
    ytd: `${latestDate.slice(0, 4)}-01-01`,
    '1y': shiftDays(latestDate, -365),
  }[range];
  return startDate ? { startDate, endDate: latestDate } : null;
}

function sumBuyCost(trades, startDate, endDate) {
  return trades.reduce((sum, trade) => (
    trade.side === 'buy' && trade.date >= startDate && trade.date <= endDate
      ? sum + trade.shares * trade.price
      : sum
  ), 0);
}

function priorSnapshot(snapshots, startDate) {
  return snapshots.filter((row) => row.date < startDate).at(-1) || null;
}

function periodBaseline(snapshots, firstTradeDate, startDate) {
  if (firstTradeDate && firstTradeDate >= startDate) {
    return { date: null, cumulativePnlUsd: 0, realizedPnlUsd: 0, unrealizedPnlUsd: 0, marketValueUsd: 0 };
  }
  const prior = priorSnapshot(snapshots, startDate);
  return prior?.date === previousRegularTradingDay(startDate) ? prior : null;
}

function periodValues(end, baseline, trades, startDate) {
  if (!end || !baseline) return { amount: null, rate: null, realized: null, unrealized: null, basis: null };
  const amount = end.cumulativePnlUsd - baseline.cumulativePnlUsd;
  const openingValue = baseline.marketValueUsd;
  const basis = openingValue === null ? null : openingValue + sumBuyCost(trades, startDate, end.date);
  const realized = end.realizedPnlUsd === null || baseline.realizedPnlUsd === null
    ? null : end.realizedPnlUsd - baseline.realizedPnlUsd;
  const unrealized = end.unrealizedPnlUsd === null || baseline.unrealizedPnlUsd === null
    ? null : end.unrealizedPnlUsd - baseline.unrealizedPnlUsd;
  return { amount, rate: basis !== null && basis > EPSILON ? amount / basis : null, realized, unrealized, basis };
}

function dailyValues(current, previous, firstTradeDate, trades) {
  const isOpeningDay = !previous && firstTradeDate === current.date;
  const baseline = previous?.date === previousRegularTradingDay(current.date)
    ? previous
    : isOpeningDay
      ? { cumulativePnlUsd: 0, marketValueUsd: 0 }
      : null;
  if (!baseline) return { amount: null, rate: null };
  const amount = current.cumulativePnlUsd - baseline.cumulativePnlUsd;
  const basis = baseline.marketValueUsd === null
    ? null : baseline.marketValueUsd + sumBuyCost(trades, current.date, current.date);
  return { amount, rate: basis !== null && basis > EPSILON ? amount / basis : null };
}

function monthValues(month, snapshots, firstTradeDate, trades, latestDate) {
  const monthStart = `${month}-01`;
  const rows = snapshots.filter((row) => row.date.startsWith(month));
  const end = rows.at(-1) || null;
  if (!end) return { amount: null, rate: null };
  if (month < latestDate.slice(0, 7) && end.date !== lastRegularTradingDayOfMonth(month)) {
    return { amount: null, rate: null };
  }
  const baseline = periodBaseline(snapshots, firstTradeDate, monthStart);
  return periodValues(end, baseline, trades, monthStart);
}

/**
 * A read-only report of one symbol's complete formal-trade history.
 * Personal P&L amounts come only from completed-close symbol snapshots. The
 * return denominator is opening position market value plus buy cash deployed
 * during the period. The selected ETF is a price-only comparison, not a simulated
 * personal portfolio, so the personal benchmark fields stay unavailable.
 */
export function buildStockPnlReportViewModel({
  symbol,
  stockTrades = [],
  symbolSnapshots = [],
  stockPriceRows = [],
  benchmarkRows = [],
  range = 'ytd',
  customRange = null,
  calendarDate = null,
  now = new Date(),
} = {}) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const completedDate = latestCompletedUsTradingDate(now);
  const trades = normalizeTrades(stockTrades, normalizedSymbol);
  const snapshots = normalizeSnapshots(symbolSnapshots, normalizedSymbol, completedDate);
  const latest = snapshots.at(-1) || null;
  const firstTradeDate = trades[0]?.date || null;
  const bounds = latest && firstTradeDate ? rangeBounds(range, latest.date, firstTradeDate, customRange) : null;
  const startDate = bounds?.startDate || null;
  const requestedEndDate = bounds?.endDate || null;
  // A selected calendar end can be a weekend or holiday. Use the last real
  // completed-close snapshot on or before it and expose that actual as-of day.
  const end = startDate && requestedEndDate
    ? snapshots.filter((row) => row.date >= startDate && row.date <= requestedEndDate).at(-1) || null
    : null;
  const endDate = end?.date || null;
  const baseline = startDate ? periodBaseline(snapshots, firstTradeDate, startDate) : null;
  const period = startDate && end ? periodValues(end, baseline, trades, startDate) : null;
  const benchmarkByDate = normalizeBenchmarkRows(benchmarkRows);
  // The two market lines use the same EOD provider and adjustment convention.
  // Symbol snapshot prices cannot substitute for sold-out stocks or missing EOD.
  const stockPriceByDate = normalizeBenchmarkRows(stockPriceRows);
  const selectedDate = dateKey(calendarDate) || latest?.date || completedDate;
  const selectedMonth = monthLabel(selectedDate);
  const selectedYear = selectedDate.slice(0, 4);
  const availableCalendarMonths = [...new Set(snapshots.map((row) => monthLabel(row.date)))];
  const availableCalendarYears = [...new Set(availableCalendarMonths.map((month) => month.slice(0, 4)))];
  const dailyByDate = new Map(snapshots.map((row, index) => [
    row.date, dailyValues(row, snapshots[index - 1] || null, firstTradeDate, trades),
  ]));
  const calendar = snapshots
    .filter((row) => row.date.slice(0, 7) === selectedDate.slice(0, 7))
    .map((row) => ({
      day: Number(row.date.slice(8, 10)),
      valueUsd: dailyByDate.get(row.date)?.amount ?? null,
      rate: dailyByDate.get(row.date)?.rate ?? null,
    }));
  const yearCalendar = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${selectedYear}-${String(month).padStart(2, '0')}`;
    const values = monthValues(key, snapshots, firstTradeDate, trades, latest?.date || completedDate);
    return { month, valueUsd: values.amount, rate: values.rate };
  });

  const bounded = startDate && endDate
    ? snapshots.filter((row) => row.date >= startDate && row.date <= endDate)
    : [];
  const commonPriceDates = startDate && endDate
    ? [...stockPriceByDate.keys()]
      .filter((date) => date >= startDate && date <= endDate && benchmarkByDate.has(date))
      .sort()
    : [];
  const commonPriceStartDate = commonPriceDates[0] || null;
  const stockPriceBaseline = commonPriceStartDate ? stockPriceByDate.get(commonPriceStartDate) : null;
  const benchmarkPriceBaseline = commonPriceStartDate ? benchmarkByDate.get(commonPriceStartDate) : null;
  const priceTrend = commonPriceDates.map((date) => ({
    date,
    pricePct: stockPriceByDate.get(date) / stockPriceBaseline - 1,
    priceBenchmarkPct: benchmarkByDate.get(date) / benchmarkPriceBaseline - 1,
  }));
  const priceByDate = new Map(priceTrend.map((point) => [point.date, point]));
  const trend = bounded.map((row) => {
    const values = periodValues(row, baseline, trades, startDate);
    const daily = dailyByDate.get(row.date);
    const pricePoint = priceByDate.get(row.date);
    const previousBenchmarkDate = previousRegularTradingDay(row.date);
    const benchmarkDailyPct = benchmarkByDate.has(row.date) && benchmarkByDate.has(previousBenchmarkDate)
      ? benchmarkByDate.get(row.date) / benchmarkByDate.get(previousBenchmarkDate) - 1 : null;
    return {
      date: row.date,
      label: row.date.slice(0, 7).replace('-', '/'),
      pnlUsd: values.amount,
      pnlPct: values.rate,
      dailyPnlUsd: daily?.amount ?? null,
      dailyPnlPct: daily?.rate ?? null,
      benchmarkPct: null,
      benchmarkDailyPct,
      pricePct: pricePoint?.pricePct ?? null,
      priceBenchmarkPct: pricePoint?.priceBenchmarkPct ?? null,
    };
  });
  const lastPricePoint = priceTrend.at(-1);
  return {
    symbol: normalizedSymbol,
    hasData: period?.amount !== null && period?.amount !== undefined,
    startDate: displayDate(startDate),
    endDate: displayDate(endDate),
    rangeStartDate: startDate,
    rangeEndDate: endDate,
    requestedEndDate,
    snapshotDate: endDate,
    latestAvailableSnapshotDate: latest?.date || null,
    totalPnlUsd: period?.amount ?? null,
    totalPnlPct: period?.rate ?? null,
    periodBasisUsd: period?.basis ?? null,
    realizedPnlUsd: period?.realized ?? null,
    unrealizedPnlUsd: period?.unrealized ?? null,
    benchmarkPct: null,
    outperformPct: null,
    priceBenchmarkReturnPct: lastPricePoint?.priceBenchmarkPct ?? null,
    priceComparisonStartDate: commonPriceStartDate,
    priceComparisonEndDate: lastPricePoint?.date || null,
    priceTrend,
    trend,
    calendar,
    yearCalendar,
    selectedMonth,
    selectedYear,
    availableCalendarMonths,
    availableCalendarYears,
  };
}
