import { STOCK_RSI_RULES, STOCK_RSI_DIVERGENCE_VERSION, resolveStockRsiRules } from '../../src/lib/stockRsiConfig.js';

const PERIOD = STOCK_RSI_RULES.RSI_PERIOD;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function adjustedClose(value) {
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function compareNumbers(left, right) {
  const tolerance = Number.EPSILON * 8 * Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= tolerance ? 0 : left > right ? 1 : -1;
}

function normalizedHigh(row, close) {
  if (row.high === undefined || row.high === null) return { kind: 'missing', price: null };
  const rawClose = adjustedClose(row.close);
  const high = adjustedClose(row.high);
  if (rawClose === null || high === null || compareNumbers(high, rawClose) < 0) return { kind: 'invalid', price: null };
  const price = high * (close / rawClose);
  return Number.isFinite(price) && compareNumbers(price, close) >= 0
    ? { kind: 'available', price: Math.max(price, close) }
    : { kind: 'invalid', price: null };
}

function normalizeCompletedRows(rows, cutoff) {
  if (!Array.isArray(rows) || !validDate(cutoff)) return null;
  // Filter a future date before validating its unfinished fields. Unrecognizable
  // dates remain in the validation set instead of silently disappearing.
  const completedRows = rows.filter((row) => !(
    typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.date)
    && row.date.slice(0, 10) > cutoff
  ));
  const dates = new Map();
  const completed = [];
  let direction = 0;
  for (const row of completedRows) {
    if (!validDate(row?.date)) return null;
    const close = adjustedClose(row.adjusted_close);
    if (close === null) return null;
    const high = normalizedHigh(row, close);
    if (dates.has(row.date)) {
      const earlier = dates.get(row.date);
      if (earlier.close !== close) return null;
      if (earlier.high.kind !== high.kind || earlier.high.price !== high.price) earlier.high = { kind: 'invalid', price: null };
      continue;
    }
    if (completed.length) {
      const step = row.date > completed[completed.length - 1].date ? 1 : -1;
      if (direction && direction !== step) return null;
      direction = step;
    }
    const point = { date: row.date, close, high };
    dates.set(row.date, point);
    completed.push(point);
  }
  // Both EODHD order options remain supported without sorting scrambled data.
  const ordered = direction < 0 ? completed.reverse() : completed;
  const divergenceAvailable = ordered.every((row) => row.high.kind !== 'invalid');
  const useHigh = ordered.every((row) => row.high.kind === 'available');
  return {
    rows: ordered.map((row) => ({ date: row.date, close: row.close, high: useHigh ? row.high.price : row.close })),
    divergenceAvailable,
  };
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

function confirmedPivot(rows, index, rules) {
  if (index < rules.RSI_WARMUP_CLOSES - 1 || index < rules.PIVOT_WINDOW) return false;
  for (let offset = 1; offset <= rules.PIVOT_WINDOW; offset += 1) {
    // Equal/plateau highs are not distinct confirmed swing highs.
    if (compareNumbers(rows[index].high, rows[index - offset].high) <= 0
      || compareNumbers(rows[index].high, rows[index + offset].high) <= 0) return false;
  }
  return true;
}

function dailyMa30(rows) {
  let average = 0;
  return rows.map((row, index) => {
    average += row.close / 30;
    if (index >= 30) average -= rows[index - 30].close / 30;
    return index >= 29 && Number.isFinite(average) ? average : null;
  });
}

function advanceEvent(active, rows, values, ma30, index, rules) {
  const event = active.event;
  const close = rows[index].close;
  const rsi = values[index];
  const observableIndex = Math.max(index, active.formedIndex);
  const observableDate = rows[observableIndex].date;
  active.minClose = Math.min(active.minClose, close);
  event.maxDrawdownPct = Math.max(event.maxDrawdownPct, (event.high2.price - close) / event.high2.price * 100, 0);

  if (active.state === 'FORMING') {
    if (compareNumbers(close, event.high2.price) > 0 && compareNumbers(rsi, event.high1.rsi) >= 0) {
      active.state = 'INVALIDATED';
      active.enteredIndex = observableIndex;
      event.invalidatedAt = observableDate;
      return;
    }
    if (compareNumbers(close, event.high2.price * (1 - rules.CONFIRMATION_DRAWDOWN)) <= 0) {
      active.state = 'CONFIRMED';
      active.enteredIndex = observableIndex;
      event.confirmedAt = observableDate;
      active.strength = 'BASIC';
      event.maxDrawdownPct = Math.max(event.maxDrawdownPct, rules.CONFIRMATION_DRAWDOWN * 100);
    }
  }
  if (active.state === 'CONFIRMED') {
    if (compareNumbers(close, event.high2.price * (1 - rules.CONFIRMATION_DRAWDOWN)) <= 0
      && ma30[index] !== null && compareNumbers(close, ma30[index]) < 0) active.strength = 'STRONG';
    const realizedByDrawdown = compareNumbers(active.minClose, event.high2.price * (1 - rules.REALIZED_DRAWDOWN)) <= 0;
    if (realizedByDrawdown || compareNumbers(rsi, rules.REALIZED_RSI_THRESHOLD) <= 0) {
      if (realizedByDrawdown) event.maxDrawdownPct = Math.max(event.maxDrawdownPct, rules.REALIZED_DRAWDOWN * 100);
      active.state = 'REALIZED';
      active.enteredIndex = observableIndex;
      event.realizedAt = observableDate;
    }
  }
}

function divergenceLifecycle(rows, values, rules) {
  const pivots = [];
  const ma30 = dailyMa30(rows);
  let active = null;
  let observedEvent = false;
  for (let current = rules.RSI_WARMUP_CLOSES - 1; current < rows.length; current += 1) {
    if (active) {
      const lifetime = active.state === 'REALIZED' ? rules.REALIZED_DISPLAY_WINDOW
        : active.state === 'INVALIDATED' ? rules.INVALIDATED_DISPLAY_WINDOW : null;
      if (lifetime !== null && current - active.enteredIndex >= lifetime) active = null;
    }
    // Today's completed facts belong to the existing event before a newly
    // observable pair is considered. A candidate must not hide today's risk.
    if (active) advanceEvent(active, rows, values, ma30, current, rules);

    // A pivot is considered once, only when all right-hand bars have closed.
    // That makes each pair single-use, including after its terminal display expires.
    const pivot = current - rules.PIVOT_WINDOW;
    if (confirmedPivot(rows, pivot, rules)) {
      while (pivots.length && pivot - pivots[0] > rules.MAX_PIVOT_DISTANCE) pivots.shift();
      let previous = null;
      for (let i = pivots.length - 1; i >= 0; i -= 1) {
        const candidate = pivots[i];
        if (pivot - candidate < rules.MIN_PIVOT_DISTANCE) continue;
        if (compareNumbers(rows[pivot].high, rows[candidate].high * (1 + rules.PRICE_HIGHER_HIGH_THRESHOLD)) >= 0
          && compareNumbers(values[candidate], rules.DIVERGENCE_MIN_RSI) >= 0
          && compareNumbers(values[candidate], values[pivot] + rules.MIN_RSI_DIFFERENCE) >= 0) {
          previous = candidate;
          break;
        }
      }
      if (previous !== null) {
        observedEvent = true;
        const candidate = {
          state: 'FORMING',
          strength: null,
          formedIndex: current,
          enteredIndex: current,
          minClose: rows[pivot].close,
          event: {
            high1: { date: rows[previous].date, price: rows[previous].high, rsi: values[previous] },
            high2: { date: rows[pivot].date, price: rows[pivot].high, rsi: values[pivot] },
            formedAt: rows[current].date,
            confirmedAt: null,
            realizedAt: null,
            invalidatedAt: null,
            maxDrawdownPct: Math.max(0, (rows[pivot].high - rows[pivot].close) / rows[pivot].high * 100),
          },
        };
        // The high's own completed close can already confirm or realize a
        // long-upper-shadow reversal. All transitions remain observable today;
        // none is backdated to the as-yet unconfirmed pivot.
        for (let index = pivot; index <= current; index += 1) {
          advanceEvent(candidate, rows, values, ma30, index, rules);
        }
        const activeRisk = active && (active.state === 'FORMING' || active.state === 'CONFIRMED');
        const higherHigh = !activeRisk || compareNumbers(candidate.event.high2.price, active.event.high2.price) > 0;
        const downgradesConfirmation = active?.state === 'CONFIRMED' && candidate.state === 'FORMING';
        if (higherHigh && !downgradesConfirmation) active = candidate;
      }
      pivots.push(pivot);
    }
  }
  return { active, observedEvent };
}

/**
 * Completed daily Wilder RSI(6) is unchanged. The lifecycle compares adjusted
 * swing highs with close-based RSI, then follows completed close drawdowns.
 * Its local MA30 shares the same adjusted-close basis; no quote/account/ledger
 * state or existing moving-average module participates in this calculation.
 */
export function buildStockRsi(eodRows, { completedCutoffDate, config } = {}) {
  const result = {
    period: PERIOD,
    value: null,
    asOf: null,
    priceBasis: 'adjusted_close',
    divergenceVersion: STOCK_RSI_DIVERGENCE_VERSION,
    divergenceState: null,
    divergenceDate: null,
    divergenceConfirmationStrength: null,
    divergenceEvent: null,
  };
  const rules = resolveStockRsiRules(config);
  if (!rules) return result;
  const normalized = normalizeCompletedRows(eodRows, completedCutoffDate);
  const rows = normalized?.rows;
  if (!rows?.length) return result;
  result.asOf = rows[rows.length - 1].date;
  if (rows.length < rules.RSI_WARMUP_CLOSES) return result;
  const values = wilderSeries(rows);
  result.value = values[values.length - 1];
  if (!normalized.divergenceAvailable) return result;
  const { active, observedEvent } = divergenceLifecycle(rows, values, rules);
  if (active) {
    result.divergenceState = active.state;
    result.divergenceDate = rows[active.enteredIndex].date;
    result.divergenceConfirmationStrength = active.strength;
    result.divergenceEvent = active.event;
  } else {
    // A conservative complete search window for reporting an absence, rather
    // than treating the RSI warmup alone as evidence of no divergence.
    const completeCloses = rules.RSI_WARMUP_CLOSES + rules.MAX_PIVOT_DISTANCE
      + rules.PIVOT_WINDOW + Math.max(rules.REALIZED_DISPLAY_WINDOW, rules.INVALIDATED_DISPLAY_WINDOW);
    if (observedEvent || rows.length >= completeCloses) result.divergenceState = 'NONE';
  }
  return result;
}
