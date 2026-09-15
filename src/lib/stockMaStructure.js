function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : '';
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

// Initial strategy parameter, not a market standard: 0.1% of the latest close
// is the tolerance for five-session gap stability and near-zero MA changes.
export const STOCK_MA_STABILITY_PRICE_RATIO = 0.001;

// The caller supplies the latest completed trading date and one daily row whose
// close and moving averages share the split-adjusted-close basis.
export function deriveStockMaStructure(row, { asOfDate } = {}) {
  const date = validDateKey(asOfDate);
  const result = (status) => ({ status, asOfDate: date });
  if (!date || validDateKey(row?.date) !== date) return result('unavailable');

  const { close, ma30, ma60, ma200 } = row;
  if (![close, ma30, ma60, ma200].every(positiveNumber)) {
    return result('unavailable');
  }

  if (close > ma30 && ma30 > ma60 && ma60 > ma200) return result('bullish');
  if (close < ma30 && ma30 < ma60 && ma60 < ma200) return result('bearish');
  if (close > ma200) return result('long_term_up');
  if (close < ma200) return result('long_term_down');
  return result('at_ma200');
}

// History must contain consecutive provider trading records, oldest first.
// No sorting, deduplication or missing-row replacement is performed here.
// Slopes are five-session changes in price units: MA(t) - MA(t-5).
export function deriveStockMaTrend(history, { asOfDate } = {}) {
  const date = validDateKey(asOfDate);
  const unavailable = {
    status: 'unavailable',
    asOfDate: date,
    comparisonDate: '',
    ma30Slope: null,
    ma60Slope: null,
    gapToday: null,
    gapYesterday: null,
    gap5dAgo: null,
    gapChange: null,
    stabilityThreshold: null,
  };
  if (!date || !Array.isArray(history) || history.length < 6) return unavailable;

  let previousDate = '';
  for (const row of history) {
    const rowDate = validDateKey(row?.date);
    if (!rowDate || rowDate <= previousDate) return unavailable;
    previousDate = rowDate;
  }
  if (previousDate !== date) return unavailable;

  const window = history.slice(-6);
  if (window.some((row) => !positiveNumber(row.ma30) || !positiveNumber(row.ma60))) return unavailable;
  const today = window.at(-1);
  if (!positiveNumber(today.close) || !positiveNumber(today.ma200)) return unavailable;
  const yesterday = window.at(-2);
  const first = window[0];
  const ma30Slope = today.ma30 - first.ma30;
  const ma60Slope = today.ma60 - first.ma60;
  const gapToday = today.ma30 - today.ma60;
  const gapYesterday = yesterday.ma30 - yesterday.ma60;
  const gap5dAgo = first.ma30 - first.ma60;
  const gapChange = gapToday - gap5dAgo;
  const stabilityThreshold = today.close * STOCK_MA_STABILITY_PRICE_RATIO;
  if (![ma30Slope, ma60Slope, gapToday, gapYesterday, gap5dAgo, gapChange, stabilityThreshold].every(Number.isFinite)) {
    return unavailable;
  }

  const direction = (change) => Math.abs(change) <= stabilityThreshold ? 0 : Math.sign(change);
  let status = 'direction_unclear';
  if (gapYesterday <= 0 && gapToday > 0) status = 'strengthening';
  else if (gapYesterday >= 0 && gapToday < 0) status = 'weakening';
  else if (Math.abs(gapChange) <= stabilityThreshold && direction(ma30Slope) === direction(ma60Slope)) {
    status = 'stable';
  } else if (ma30Slope > 0 && gapChange > 0) {
    status = gapToday < 0 && today.close > today.ma200 ? 'repairing' : 'improving';
  } else if (ma30Slope < 0 && gapChange < 0) status = 'deteriorating';

  return {
    status,
    asOfDate: date,
    comparisonDate: first.date,
    ma30Slope,
    ma60Slope,
    gapToday,
    gapYesterday,
    gap5dAgo,
    gapChange,
    stabilityThreshold,
  };
}
