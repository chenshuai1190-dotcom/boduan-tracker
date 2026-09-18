import { STOCK_TREND_RSI_RULES as R, STOCK_TREND_RSI_VERSION } from './stockRsiConfig.js';
import { hasStockRsiValue, validStockRsiDate } from './stockRsiSignal.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const validRsi = value => finite(value) && value >= 0 && value <= 100;
const closeEnough = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
const atLeast = (a, b) => a >= b || Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b));

export function stockTrendRsiState(value) {
  if (!validRsi(value)) return null;
  return value >= R.RSI_STRONGLY_OVERBOUGHT ? 'STRONGLY_OVERBOUGHT'
    : value >= R.RSI_OVERBOUGHT ? 'OVERBOUGHT' : 'NORMAL';
}

// Pure comparison of already-computed RSI readings. No rounding or second RSI
// calculation is allowed at this boundary.
export function compareStockTrendPeaks(previousPeak, currentPrice, currentRSI6) {
  if (!previousPeak || !finite(previousPeak.price) || previousPeak.price <= 0
    || !validRsi(previousPeak.rsi6) || !finite(currentPrice) || currentPrice <= 0 || !validRsi(currentRSI6)) return null;
  const priceBreakoutPct = (currentPrice / previousPeak.price - 1) * 100;
  const rsiDivergenceDelta = previousPeak.rsi6 - currentRSI6;
  const priceHigherHigh = currentPrice > previousPeak.price;
  const rsiLowerHigh = currentRSI6 < previousPeak.rsi6;
  const priceThreshold = previousPeak.price * (1 + R.MIN_PRICE_BREAKOUT_PCT / 100);
  const rsiThreshold = currentRSI6 + R.MIN_RSI_DIVERGENCE_DELTA;
  const meetsPrice = atLeast(currentPrice, priceThreshold);
  const meetsRsi = atLeast(previousPeak.rsi6, rsiThreshold);
  const divergenceState = !priceHigherHigh || !rsiLowerHigh ? 'NONE'
    : meetsPrice && meetsRsi ? 'POTENTIAL' : 'WATCH';
  return { priceBreakoutPct, rsiDivergenceDelta, priceHigherHigh, rsiLowerHigh, divergenceState };
}

/** Validate the trend contract independently of the older drawdown lifecycle. */
export function hasStockTrendRsiSignal(signal) {
  const trend = signal?.trendMomentum;
  if (!hasStockRsiValue(signal) || trend?.version !== STOCK_TREND_RSI_VERSION
    || trend.asOf !== signal.asOf || trend.currentRSI6 !== signal.value
    || trend.rsiState !== stockTrendRsiState(signal.value)
    || !finite(trend.currentPrice) || trend.currentPrice <= 0
    || ![null, 'NONE', 'WATCH', 'POTENTIAL', 'CONFIRMED'].includes(trend.divergenceState)) return false;
  const validPeak = peak => peak && validStockRsiDate(peak.date) && validStockRsiDate(peak.confirmedAt)
    && peak.date < peak.confirmedAt && peak.confirmedAt <= trend.asOf
    && finite(peak.price) && peak.price > 0 && validRsi(peak.rsi6);
  const peak = trend.previousPeak;
  if (peak !== null) {
    if (!validPeak(peak) || peak.date >= trend.asOf) return false;
    const compared = compareStockTrendPeaks(peak, trend.currentPrice, trend.currentRSI6);
    if (!closeEnough(trend.priceBreakoutPct, compared.priceBreakoutPct)
      || !closeEnough(trend.rsiDivergenceDelta, compared.rsiDivergenceDelta)
      || trend.priceHigherHigh !== compared.priceHigherHigh || trend.rsiLowerHigh !== compared.rsiLowerHigh
      || (trend.divergenceState !== 'CONFIRMED' && trend.divergenceState !== compared.divergenceState)) return false;
  } else if (!['NONE', null].includes(trend.divergenceState)
    || [trend.priceBreakoutPct, trend.rsiDivergenceDelta, trend.priceHigherHigh, trend.rsiLowerHigh].some(value => value !== null)) return false;
  if (trend.divergenceState === 'CONFIRMED') {
    const event = trend.confirmation;
    if (!peak || !validPeak(event?.peak) || !validPeak(event?.previousPeak)
      || ['date', 'price', 'rsi6', 'confirmedAt'].some(key => event.previousPeak[key] !== peak[key])
      || event.previousPeak.confirmedAt > event.peak.date || event.previousPeak.date >= event.peak.date
      || event.peak.price <= peak.price || event.peak.rsi6 >= peak.rsi6
      || trend.divergenceDate !== event.peak.confirmedAt) return false;
  } else if (trend.confirmation !== null
    || trend.divergenceDate !== (['WATCH', 'POTENTIAL'].includes(trend.divergenceState) ? trend.asOf : null)) return false;
  const blocked = trend.divergenceState === null ? null : signal.value >= R.RSI_STRONGLY_OVERBOUGHT
    && ['POTENTIAL', 'CONFIRMED'].includes(trend.divergenceState);
  return trend.chaseBuyBlocked === blocked;
}
