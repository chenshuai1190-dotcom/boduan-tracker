import { STOCK_MA_TREND_CONFIG } from './stockMaTrendConfig.js';

export { STOCK_MA_TREND_CONFIG };

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

function trendConfig(overrides) {
  if (overrides !== undefined && (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))) return null;
  if (overrides && Object.keys(overrides).some((key) => !Object.hasOwn(STOCK_MA_TREND_CONFIG, key))) return null;
  const config = { ...STOCK_MA_TREND_CONFIG, ...overrides };
  if (!['lookback', 'crossLookback', 'contractionLookback', 'contractionMinDays'].every((key) => Number.isSafeInteger(config[key]) && config[key] > 0)) return null;
  if (config.contractionMinDays >= config.contractionLookback) return null;
  if (!['crossThreshold', 'slopeThreshold', 'gapChangeThreshold', 'dailyGapChangeMin'].every((key) => positiveNumber(config[key]))) return null;
  return config;
}

// Absorb only floating-point subtraction noise at a threshold, so multiplying
// every price by the same factor cannot turn a mathematical equality into a cross.
function compareRatio(value, threshold) {
  const tolerance = Math.min(Number.EPSILON * 8, Math.abs(threshold) * 1e-8);
  return Math.abs(value - threshold) <= tolerance ? 0 : value > threshold ? 1 : -1;
}

function gapRatio(row) {
  return positiveNumber(row?.ma30) && positiveNumber(row?.ma60)
    ? (row.ma30 - row.ma60) / row.ma60
    : null;
}

function contractionEvidence(history, config) {
  const rows = history.slice(-config.contractionLookback);
  if (rows.length < config.contractionLookback
    || rows.some((row) => !validDateKey(row?.date) || !Number.isFinite(gapRatio(row)))) {
    return { contractingDays: null, contractionPersistent: null };
  }
  let contractingDays = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const decrease = gapRatio(rows[index - 1]) - gapRatio(rows[index]);
    if (compareRatio(decrease, config.dailyGapChangeMin) >= 0) contractingDays += 1;
  }
  return { contractingDays, contractionPersistent: contractingDays >= config.contractionMinDays };
}

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
// Invalid historical records reset cross tracking; they are never skipped to
// fill the current comparison window. Dates alone cannot identify market holidays.
export function deriveStockMaTrend(history, { asOfDate, config: overrides } = {}) {
  const date = validDateKey(asOfDate);
  const config = trendConfig(overrides);
  const unavailable = {
    status: 'unavailable',
    asOfDate: date,
    comparisonDate: '',
    ma30Slope: null,
    ma60Slope: null,
    gapToday: null,
    gapYesterday: null,
    gapAtComparison: null,
    gapChange: null,
    contractingDays: null,
    contractionPersistent: null,
    crossDate: '',
    crossAge: null,
    crossDirection: null,
  };
  if (!date || !config || !Array.isArray(history) || history.length < config.lookback + 1) return unavailable;

  const today = history.at(-1);
  const structure = deriveStockMaStructure(today, { asOfDate: date });
  if (structure.status === 'unavailable') return unavailable;
  const window = history.slice(-config.lookback - 1);
  if (window.some((row) => !validDateKey(row?.date) || !Number.isFinite(gapRatio(row)))) return unavailable;

  let confirmedSide = null;
  let latestCross = null;
  let previousDate = '';
  for (let index = 0; index < history.length; index += 1) {
    const row = history[index];
    const rowDate = validDateKey(row?.date);
    if (rowDate && rowDate <= previousDate) return unavailable;
    if (rowDate) previousDate = rowDate;
    const gap = gapRatio(row);
    if (!rowDate || !Number.isFinite(gap)) {
      confirmedSide = null;
      latestCross = null;
      continue;
    }
    if (confirmedSide === null) {
      // The first observation establishes a baseline, even inside the band.
      // It cannot by itself prove a cross. After initialization, only a
      // confirmed threshold on the other side can change this baseline.
      confirmedSide = Math.sign(gap);
      continue;
    }
    const side = compareRatio(gap, config.crossThreshold) >= 0 ? 1
      : compareRatio(gap, -config.crossThreshold) <= 0 ? -1 : 0;
    if (side !== 0 && side !== confirmedSide) {
      latestCross = { date: rowDate, index, direction: side === 1 ? 'up' : 'down' };
      confirmedSide = side;
    }
  }
  if (previousDate !== date) return unavailable;

  const yesterday = window.at(-2);
  const first = window[0];
  const ma30Slope = (today.ma30 - first.ma30) / first.ma30;
  const ma60Slope = (today.ma60 - first.ma60) / first.ma60;
  const gapToday = gapRatio(today);
  const gapYesterday = gapRatio(yesterday);
  const gapAtComparison = gapRatio(first);
  const gapChange = gapToday - gapAtComparison;
  if (![ma30Slope, ma60Slope, gapToday, gapYesterday, gapAtComparison, gapChange].every(Number.isFinite)) {
    return unavailable;
  }

  const crossAge = latestCross ? history.length - 1 - latestCross.index : null;
  const recentCross = latestCross && crossAge < config.crossLookback;
  const ma30Up = compareRatio(ma30Slope, config.slopeThreshold) > 0;
  const ma30Down = compareRatio(ma30Slope, -config.slopeThreshold) < 0;
  const gapUp = compareRatio(gapChange, config.gapChangeThreshold) > 0;
  const gapDown = compareRatio(gapChange, -config.gapChangeThreshold) < 0;
  const contraction = contractionEvidence(history, config);
  let status = 'stable';
  if (recentCross && latestCross.direction === 'up' && compareRatio(gapToday, config.crossThreshold) >= 0) {
    status = 'strengthening';
  } else if (recentCross && latestCross.direction === 'down' && compareRatio(gapToday, -config.crossThreshold) <= 0) {
    status = 'weakening';
  } else if (structure.status === 'bullish') {
    if (ma30Up && compareRatio(ma60Slope, -config.slopeThreshold) >= 0 && gapUp) status = 'bullish_strengthening';
    else if (ma30Down || (gapDown && contraction.contractionPersistent)) status = 'bullish_weakening';
    else if (gapDown && contraction.contractionPersistent === null) return unavailable;
  } else if (structure.status === 'bearish') {
    if (ma30Down && compareRatio(ma60Slope, config.slopeThreshold) <= 0 && gapDown) status = 'bearish_strengthening';
    else if (ma30Up || gapUp) status = 'bearish_weakening';
  } else if (ma30Up && gapUp) status = 'improving';
  else if (structure.status === 'long_term_up' ? ma30Down || gapDown : ma30Down && gapDown) {
    status = 'structural_weakening';
  }

  return {
    status,
    asOfDate: date,
    comparisonDate: first.date,
    ma30Slope,
    ma60Slope,
    gapToday,
    gapYesterday,
    gapAtComparison,
    gapChange,
    ...contraction,
    crossDate: latestCross?.date || '',
    crossAge,
    crossDirection: latestCross?.direction || null,
  };
}
