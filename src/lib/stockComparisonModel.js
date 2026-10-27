const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeRows(value) {
  const rows = Array.isArray(value) ? value : value?.rows;
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (validDate(row?.date) && validPrice(row?.close)) result.set(row.date, row.close);
  }
  return result;
}

function normalizeRsiRows(value) {
  const rows = Array.isArray(value) ? value : value?.rows;
  const hasRsiBasis = value?.rsiPeriod === 6 && value?.rsiPriceBasis === 'adjusted_close';
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!validDate(row?.date) || !validPrice(row?.close)) continue;
    const validRsi = hasRsiBasis && typeof row.rsi6 === 'number' && Number.isFinite(row.rsi6) && row.rsi6 >= 0 && row.rsi6 <= 100;
    result.set(row.date, validRsi ? row.rsi6 : null);
  }
  return result;
}

/**
 * Compare already split-adjusted prices using a shared, observed baseline.
 * This layer neither adjusts splits/dividends nor applies ETF leverage.
 * Missing interior observations stay null; they are never carried forward.
 * RSI is independently supplied on its declared basis and exact observed date;
 * this model never recalculates it from truncated chart history.
 */
export function buildStockComparison({ series = {}, symbols = [], startDate, endDate } = {}) {
  const result = {
    rows: [],
    startDate: null,
    endDate: null,
    requestedStartDate: startDate ?? null,
    requestedEndDate: endDate ?? null,
    rangeAdjusted: false,
    stats: {},
  };
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return { ...result, error: 'invalid_range' };
  }
  if (!Array.isArray(symbols) || symbols.length < 2 || symbols.length > 4
    || new Set(symbols).size !== symbols.length
    || symbols.some((symbol) => typeof symbol !== 'string' || !symbol.trim())) {
    return { ...result, error: 'invalid_symbols' };
  }

  const pricesBySymbol = Object.fromEntries(symbols.map((symbol) => [symbol, normalizeRows(series[symbol])]));
  const rsiBySymbol = Object.fromEntries(symbols.map((symbol) => [symbol, normalizeRsiRows(series[symbol])]));
  const commonDates = [...pricesBySymbol[symbols[0]].keys()]
    .filter((date) => date >= startDate && date <= endDate
      && symbols.every((symbol) => pricesBySymbol[symbol].has(date)))
    .sort();
  if (!commonDates.length) return { ...result, error: 'no_common_dates' };

  const actualStart = commonDates[0];
  const actualEnd = commonDates.at(-1);
  const dates = [...new Set(symbols.flatMap((symbol) => [...pricesBySymbol[symbol].keys()]))]
    .filter((date) => date >= actualStart && date <= actualEnd)
    .sort();
  const rows = dates.map((date) => {
    const prices = {};
    const returns = {};
    const rsi6 = {};
    for (const symbol of symbols) {
      const price = pricesBySymbol[symbol].get(date) ?? null;
      prices[symbol] = price;
      returns[symbol] = price === null ? null : (price / pricesBySymbol[symbol].get(actualStart) - 1) * 100;
      rsi6[symbol] = price === null ? null : rsiBySymbol[symbol].get(date) ?? null;
    }
    return { date, prices, returns, rsi6 };
  });

  const stats = {};
  for (const symbol of symbols) {
    const startPrice = pricesBySymbol[symbol].get(actualStart);
    const endPrice = pricesBySymbol[symbol].get(actualEnd);
    let peak = startPrice;
    let maxDrawdownPct = 0;
    let high = { date: actualStart, price: startPrice };
    let low = { date: actualStart, price: startPrice };
    for (const row of rows) {
      const price = row.prices[symbol];
      if (price === null) continue;
      peak = Math.max(peak, price);
      maxDrawdownPct = Math.min(maxDrawdownPct, (price / peak - 1) * 100);
      if (price > high.price) high = { date: row.date, price };
      if (price < low.price) low = { date: row.date, price };
    }
    stats[symbol] = {
      startPrice,
      endPrice,
      returnPct: (endPrice / startPrice - 1) * 100,
      maxDrawdownPct,
      high,
      low,
    };
  }
  return {
    ...result,
    rows,
    startDate: actualStart,
    endDate: actualEnd,
    rangeAdjusted: actualStart !== startDate || actualEnd !== endDate,
    stats,
  };
}

/** Calendar ranges use UTC dates and clamp month-end, independent of local DST. */
export function comparisonRangeStart(range, endDate) {
  if (!validDate(endDate)) return null;
  const date = new Date(`${endDate}T00:00:00Z`);
  if (range === 'ytd') return `${date.getUTCFullYear()}-01-01`;
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[range];
  if (!months) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, daysInMonth));
  return date.toISOString().slice(0, 10);
}
