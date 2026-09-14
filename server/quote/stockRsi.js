const PERIOD = 6;
const WARMUP_CLOSES = 60;
const PIVOT_SIDE = 2;
const MIN_PIVOT_DISTANCE = 5;
const MAX_PIVOT_DISTANCE = 60;
const ACTIVE_BARS = 10;
// Covers the earliest still-active second pivot and its entire prior-pivot search.
const COMPLETE_DIVERGENCE_CLOSES = WARMUP_CLOSES + MAX_PIVOT_DISTANCE + PIVOT_SIDE + ACTIVE_BARS;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function adjustedClose(value) {
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCompletedRows(rows, cutoff) {
  if (!Array.isArray(rows) || !validDate(cutoff)) return null;
  const dates = new Map();
  const completed = [];
  let direction = 0;
  for (const row of rows) {
    if (!validDate(row?.date)) return null;
    // An in-progress daily row must not affect either the value or its validation.
    if (row.date > cutoff) continue;
    const close = adjustedClose(row.adjusted_close);
    if (close === null) return null;
    if (dates.has(row.date)) {
      if (dates.get(row.date) !== close) return null;
      continue;
    }
    if (completed.length) {
      const step = row.date > completed[completed.length - 1].date ? 1 : -1;
      if (direction && direction !== step) return null;
      direction = step;
    }
    dates.set(row.date, close);
    completed.push({ date: row.date, close });
  }
  // Both EODHD order options are supported without an O(n log n) sort.
  return direction < 0 ? completed.reverse() : completed;
}

function rsiValue(gain, loss) {
  if (gain === 0 && loss === 0) return 50;
  if (loss === 0) return 100;
  if (gain === 0) return 0;
  return 100 - 100 / (1 + gain / loss);
}

function wilderSeries(rows) {
  const values = Array(rows.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const change = rows[i].close - rows[i - 1].close;
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);
    if (i <= PERIOD) {
      gain += up / PERIOD;
      loss += down / PERIOD;
    } else {
      gain = gain * ((PERIOD - 1) / PERIOD) + up / PERIOD;
      loss = loss * ((PERIOD - 1) / PERIOD) + down / PERIOD;
    }
    if (i >= PERIOD) values[i] = rsiValue(gain, loss);
  }
  return values;
}

function confirmedPivot(rows, index) {
  if (index < WARMUP_CLOSES - 1) return false;
  for (let offset = 1; offset <= PIVOT_SIDE; offset += 1) {
    // Flat/equal highs are deliberately not treated as distinct confirmed peaks.
    if (rows[index].close <= rows[index - offset].close || rows[index].close <= rows[index + offset].close) return false;
  }
  return true;
}

function activeDivergence(rows, values) {
  const pivots = [];
  let active = null;
  for (let current = WARMUP_CLOSES - 1; current < rows.length; current += 1) {
    // Confirmation is causal: the two right-hand bars must already be completed.
    if (active && (current - active.confirmedAt > ACTIVE_BARS || rows[current].close > active.price)) active = null;
    const pivot = current - PIVOT_SIDE;
    if (!confirmedPivot(rows, pivot)) continue;
    // The search is capped at a fixed 60 bars, so this remains linear in history size.
    while (pivots.length && pivot - pivots[0] > MAX_PIVOT_DISTANCE) pivots.shift();
    let previous = null;
    for (let i = pivots.length - 1; i >= 0; i -= 1) {
      if (pivot - pivots[i] >= MIN_PIVOT_DISTANCE) {
        previous = pivots[i];
        break;
      }
    }
    // Use the nearest eligible confirmed high, rather than cherry-picking a pair.
    // RSI overbought/oversold zones are independent presentation rules.
    if (previous !== null && rows[pivot].close > rows[previous].close && values[pivot] < values[previous]) {
      active = { confirmedAt: current, price: rows[pivot].close };
    }
    pivots.push(pivot);
  }
  return active;
}

/**
 * Daily RSI(6), using only completed split-and-dividend-adjusted closes.
 * Divergence uses close-based 2-left/2-right pivots, spaced 5–60 trading bars.
 * A signal starts on the confirmation date, expires after 10 subsequent bars,
 * and is invalidated by a later close above its second high. Its life does not
 * depend on the current RSI crossing 80. No quotes, accounts or network state
 * participate in this calculation.
 */
export function buildStockRsi(eodRows, { completedCutoffDate } = {}) {
  const result = {
    period: PERIOD,
    value: null,
    asOf: null,
    priceBasis: 'adjusted_close',
    bearishDivergence: 'insufficient_data',
    divergenceDate: null,
  };
  const rows = normalizeCompletedRows(eodRows, completedCutoffDate);
  if (!rows?.length) return result;
  result.asOf = rows[rows.length - 1].date;
  if (rows.length < WARMUP_CLOSES) return result;
  const values = wilderSeries(rows);
  result.value = values[values.length - 1];
  const divergence = activeDivergence(rows, values);
  if (divergence) {
    result.bearishDivergence = 'confirmed';
    result.divergenceDate = rows[divergence.confirmedAt].date;
  } else if (rows.length >= COMPLETE_DIVERGENCE_CLOSES) {
    result.bearishDivergence = 'none';
  }
  return result;
}
