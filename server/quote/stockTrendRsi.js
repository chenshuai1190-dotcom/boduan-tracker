import { STOCK_RSI_RULES, STOCK_TREND_RSI_RULES as R, STOCK_TREND_RSI_VERSION } from '../../src/lib/stockRsiConfig.js';
import { compareStockTrendPeaks, stockTrendRsiState } from '../../src/lib/stockTrendRsiSignal.js';
import { compareNumbers, confirmedPivot } from './stockRsiPivot.js';

export function emptyStockTrendMomentum() {
  return {
    version: STOCK_TREND_RSI_VERSION, asOf: null, rsiState: null, divergenceState: null,
    currentPrice: null, currentRSI6: null, previousPeak: null,
    priceBreakoutPct: null, rsiDivergenceDelta: null, priceHigherHigh: null, rsiLowerHigh: null,
    divergenceDate: null, confirmation: null, chaseBuyBlocked: null,
  };
}

// A reference is a completed close swing AND a local momentum peak. This
// captures a prior closing-price/RSI wave even if later intraday wicks are higher.
// It is not a rolling maximum and cannot move forward along a monotonic rally.
function confirmedReference(rows, values, index, rules) {
  const window = R.REFERENCE_PIVOT_WINDOW;
  if (index < rules.RSI_WARMUP_CLOSES - 1 || index < window
    || index + window >= rows.length || values[index] < R.MIN_REFERENCE_RSI) return false;
  for (let offset = 1; offset <= window; offset += 1) {
    for (const other of [index - offset, index + offset]) {
      if (compareNumbers(rows[index].close, rows[other].close) <= 0
        || compareNumbers(values[index], values[other]) < 0) return false;
    }
  }
  return true;
}

function selectReference(references, index, rules) {
  // Choose by recency/validity FIRST. Never fall back to an older, higher RSI
  // just because the most recent valid swing does not produce divergence.
  return references.findLast(reference => reference.confirmedIndex <= index
    && index - reference.index >= rules.MIN_PIVOT_DISTANCE
    && index - reference.index <= rules.MAX_PIVOT_DISTANCE) ?? null;
}

function ended(event, rows, values, index, rules) {
  const { previousPeak, peak } = event;
  return (compareNumbers(rows[index].close, peak.price) > 0 && compareNumbers(values[index], previousPeak.rsi6) >= 0)
    || compareNumbers(rows[index].close, peak.price * (1 - rules.REALIZED_DRAWDOWN)) <= 0
    || compareNumbers(values[index], rules.REALIZED_RSI_THRESHOLD) <= 0;
}

/** Consumes the SAME normalized rows and Wilder series used by buildStockRsi. */
export function buildStockTrendMomentum(rows, values, { rules = STOCK_RSI_RULES, divergenceAvailable = true } = {}) {
  const result = emptyStockTrendMomentum();
  const latest = rows.length - 1;
  if (latest < rules.RSI_WARMUP_CLOSES - 1) return result;
  Object.assign(result, { asOf: rows[latest].date, currentPrice: rows[latest].close,
    currentRSI6: values[latest], rsiState: stockTrendRsiState(values[latest]) });
  if (!divergenceAvailable) return result;
  const references = [];
  let confirmed = null;
  let confirmationIndex = null;
  const point = (index, confirmedIndex) => ({ date: rows[index].date, price: rows[index].close,
    rsi6: values[index], confirmedAt: rows[confirmedIndex].date });
  for (let current = rules.RSI_WARMUP_CLOSES - 1; current <= latest; current += 1) {
    if (confirmed && (current - confirmationIndex >= rules.CONFIRMED_MAX_AGE
      || ended(confirmed, rows, values, current, rules))) confirmed = null;

    // Retain the existing high-pivot detector and its three completed right
    // bars. The recorded event compares the closing prices/RSI of those dates.
    const pivot = current - rules.PIVOT_WINDOW;
    if (confirmedPivot(rows, pivot, rules)) {
      const previous = selectReference(references, pivot, rules);
      if (previous && rows[pivot].close > previous.peak.price && values[pivot] < previous.peak.rsi6) {
        const candidate = { previousPeak: previous.peak, peak: point(pivot, current) };
        // Do not resurrect an event already resolved while waiting for its
        // right bars. A pair is considered only once, on its observation date.
        let resolved = false;
        for (let index = pivot; index <= current; index += 1) {
          if (ended(candidate, rows, values, index, rules)) resolved = true;
        }
        if (!resolved && (!confirmed || candidate.peak.price > confirmed.peak.price)) {
          confirmed = candidate;
          confirmationIndex = current;
        }
      }
    }
    const referenceIndex = current - R.REFERENCE_PIVOT_WINDOW;
    if (confirmedReference(rows, values, referenceIndex, rules)) {
      references.push({ index: referenceIndex, confirmedIndex: current, peak: point(referenceIndex, current) });
    }
  }
  const reference = confirmed?.previousPeak ?? selectReference(references, latest, rules)?.peak ?? null;
  result.previousPeak = reference;
  if (reference) Object.assign(result, compareStockTrendPeaks(reference, result.currentPrice, result.currentRSI6));
  else if (rows.length >= rules.RSI_WARMUP_CLOSES + rules.MAX_PIVOT_DISTANCE + R.REFERENCE_PIVOT_WINDOW) {
    result.divergenceState = 'NONE';
  }
  if (confirmed) {
    result.divergenceState = 'CONFIRMED';
    result.confirmation = confirmed;
    result.divergenceDate = confirmed.peak.confirmedAt;
  } else if (['WATCH', 'POTENTIAL'].includes(result.divergenceState)) result.divergenceDate = result.asOf;
  result.chaseBuyBlocked = result.divergenceState === null ? null : result.currentRSI6 >= R.RSI_STRONGLY_OVERBOUGHT
    && ['POTENTIAL', 'CONFIRMED'].includes(result.divergenceState);
  return result;
}
