import { STOCK_RSI_RULES } from '../../src/lib/stockRsiConfig.js';
import { STOCK_RSI_RISK_VERSION, resolveStockRsiRiskRules } from '../../src/lib/stockRsiRiskConfig.js';
import { isStockRsiLifecycleSignal, validStockRsiDate } from '../../src/lib/stockRsiSignal.js';
import { deriveStockMaStructure, deriveStockMaTrend, STOCK_MA_TREND_CONFIG } from '../../src/lib/stockMaStructure.js';

const positiveNumber = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const parsePrice = value => typeof value === 'number' ? value
  : typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const compare = (value, threshold) => Math.abs(value - threshold) <= Number.EPSILON * 16
  ? 0 : value > threshold ? 1 : -1;
const emptyContributions = () => ({
  stateBase: 0, divergenceStrength: 0, ma30Adjustment: 0,
  trendAdjustment: 0, recoveryAdjustment: 0, timeDecay: 0,
});

function completedCloses(rows, cutoff) {
  if (!Array.isArray(rows)) return null;
  const result = new Map();
  for (const row of rows) {
    // An unfinished/future row cannot poison or influence a completed-day result.
    if (typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.date) && row.date.slice(0, 10) > cutoff) continue;
    if (!validStockRsiDate(row?.date)) return null;
    const close = parsePrice(row.adjusted_close);
    if (!positiveNumber(close) || (result.has(row.date) && result.get(row.date).close !== close)) return null;
    result.set(row.date, { date: row.date, close, rawClose: parsePrice(row.close) });
  }
  return [...result.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function deterioration(rows, high2Index, maHistory, rules) {
  const reasons = [];
  const comparisonIndex = rows.length - 1 - rules.DETERIORATION_LOOKBACK;
  let minimum = rows[high2Index].close;
  for (let i = high2Index + 1; i < rows.length; i += 1) {
    if (compare(rows[i].close, minimum) < 0) {
      if (i > comparisonIndex) reasons.push('recent_post_high2_closing_low');
      minimum = rows[i].close;
    }
  }
  // A recovered close today must not hide deterioration earlier in the window.
  // Read the existing MA calculations for each completed day; never rewrite them.
  for (let i = maHistory.length - rules.DETERIORATION_LOOKBACK; i < maHistory.length; i += 1) {
    const row = maHistory[i];
    const trend = deriveStockMaTrend(maHistory.slice(0, i + 1), { asOfDate: row.date });
    if (!positiveNumber(row.close) || !positiveNumber(row.ma30) || trend.status === 'unavailable') return null;
    if (row.close < row.ma30) reasons.push('recent_below_ma30');
    if (compare(trend.ma30Slope, -rules.DETERIORATION_MA30_SLOPE_THRESHOLD) <= 0) reasons.push('recent_falling_ma30');
    if (['bullish_weakening', 'bearish_strengthening', 'structural_weakening', 'weakening'].includes(trend.status)) {
      reasons.push('weakening_trend');
    }
  }
  return [...new Set(reasons)];
}

/** Read-only enrichment. Risk never rewrites lifecycle or the existing MA system. */
export function buildStockRsiRisk(signal, { eodRows, stockDetail, completedCutoffDate, config } = {}) {
  const event = signal?.divergenceEvent;
  const debug = {
    version: STOCK_RSI_RISK_VERSION,
    status: 'unavailable', reason: null,
    state: signal?.divergenceState ?? null, riskScore: null, riskLevel: null,
    rawRiskScore: null, activeFloorApplied: false,
    asOf: signal?.asOf ?? null,
    priceBasis: 'adjusted_close', maPriceBasis: 'split_adjusted_close',
    postHigh2LowBasis: 'completed_adjusted_close_including_high2_day',
    high1Price: event?.high1?.price ?? null, high1Rsi: event?.high1?.rsi ?? null, high1Date: event?.high1?.date ?? null,
    high2Price: event?.high2?.price ?? null, high2Rsi: event?.high2?.rsi ?? null, high2Date: event?.high2?.date ?? null,
    currentPrice: null, currentRsi: signal?.value ?? null,
    drawdownFromHigh2: null, maxDrawdownFromHigh2: null,
    postHigh2Low: null, priceRecoveryRatio: null, rsiRecoveryGap: null,
    priceRecoveryAdjustment: 0, rsiRecoveryAdjustment: 0,
    priceVsMA30: null, ma30Slope: null, ma30: null, maPrice: null,
    trendStructure: null, trendChange: null, confirmedAge: null,
    hasRecentDeterioration: null, timeDecayEligible: false, timeDecayBlockedReasons: [],
    riskContributions: emptyContributions(),
  };
  const result = (score, level, reason = null) => {
    debug.riskScore = score; debug.riskLevel = level; debug.reason = reason;
    debug.status = score === null ? 'unavailable' : 'ready';
    return { divergenceRiskScore: score, divergenceRiskLevel: level, divergenceDebug: debug };
  };
  if (!isStockRsiLifecycleSignal(signal) || signal.divergenceState === null) return result(null, null, 'unknown_lifecycle');
  if (!validStockRsiDate(completedCutoffDate) || signal.asOf > completedCutoffDate) return result(null, null, 'invalid_completed_cutoff');
  const rules = resolveStockRsiRiskRules(config);
  if (!rules) return result(null, null, 'invalid_risk_config');
  if (!['FORMING', 'CONFIRMED'].includes(signal.divergenceState)) {
    // Terminal and absent events carry no current divergence risk. Optional
    // price/MA context remains useful in audits, but cannot make them risky.
    const inactiveRows = completedCloses(eodRows, completedCutoffDate);
    if (inactiveRows?.at(-1)?.date === signal.asOf) {
      debug.currentPrice = inactiveRows.at(-1).close;
      const high2Index = event ? inactiveRows.findIndex(row => row.date === event.high2.date) : -1;
      if (high2Index >= 0) {
        debug.postHigh2Low = Math.min(...inactiveRows.slice(high2Index).map(row => row.close));
        debug.drawdownFromHigh2 = (debug.currentPrice - event.high2.price) / event.high2.price;
        debug.maxDrawdownFromHigh2 = Math.max(0, (event.high2.price - debug.postHigh2Low) / event.high2.price);
        debug.priceRecoveryRatio = event.high2.price > debug.postHigh2Low
          ? clamp((debug.currentPrice - debug.postHigh2Low) / (event.high2.price - debug.postHigh2Low), 0, 1) : null;
        debug.rsiRecoveryGap = event.high1.rsi - signal.value;
        const confirmedIndex = inactiveRows.findIndex(row => row.date === event.confirmedAt);
        debug.confirmedAge = confirmedIndex >= 0 ? inactiveRows.length - 1 - confirmedIndex : null;
      }
    }
    if (stockDetail?.priceBasis === 'split_adjusted_close' && stockDetail.asOfDate === signal.asOf && Array.isArray(stockDetail.history)) {
      const history = stockDetail.history.filter(row => typeof row?.date !== 'string' || row.date <= completedCutoffDate);
      const latest = history.at(-1);
      const structure = deriveStockMaStructure(latest, { asOfDate: signal.asOf });
      const trend = deriveStockMaTrend(history, { asOfDate: signal.asOf });
      if (structure.status !== 'unavailable') {
        debug.ma30 = latest.ma30; debug.maPrice = latest.close;
        debug.priceVsMA30 = (latest.close - latest.ma30) / latest.ma30;
        debug.trendStructure = structure.status;
      }
      if (trend.status !== 'unavailable') { debug.ma30Slope = trend.ma30Slope; debug.trendChange = trend.status; }
    }
    debug.rawRiskScore = 0;
    return result(0, 'NONE');
  }

  const rows = completedCloses(eodRows, completedCutoffDate);
  if (!rows?.length || rows.at(-1).date !== signal.asOf) return result(null, null, 'missing_or_mismatched_completed_prices');
  const high1Index = rows.findIndex(row => row.date === event.high1.date);
  const high2Index = rows.findIndex(row => row.date === event.high2.date);
  const confirmedIndex = event.confirmedAt ? rows.findIndex(row => row.date === event.confirmedAt) : -1;
  if (high1Index < 0 || high2Index <= high1Index || (event.confirmedAt && confirmedIndex < high2Index)) {
    return result(null, null, 'incomplete_event_history');
  }
  const currentPrice = rows.at(-1).close;
  const postHigh2Low = Math.min(...rows.slice(high2Index).map(row => row.close));
  const maxDrawdown = Math.max(0, (event.high2.price - postHigh2Low) / event.high2.price);
  debug.currentPrice = currentPrice;
  debug.postHigh2Low = postHigh2Low;
  debug.drawdownFromHigh2 = (currentPrice - event.high2.price) / event.high2.price;
  debug.maxDrawdownFromHigh2 = maxDrawdown;
  debug.priceRecoveryRatio = event.high2.price > postHigh2Low
    ? clamp((currentPrice - postHigh2Low) / (event.high2.price - postHigh2Low), 0, 1) : null;
  debug.rsiRecoveryGap = event.high1.rsi - signal.value;
  debug.confirmedAge = confirmedIndex >= 0 ? rows.length - 1 - confirmedIndex : null;
  if (Math.abs(maxDrawdown - event.maxDrawdownPct / 100) > 1e-9) return result(null, null, 'event_price_history_mismatch');
  if (signal.divergenceState === 'FORMING' && compare(maxDrawdown, STOCK_RSI_RULES.CONFIRMATION_DRAWDOWN) >= 0) {
    return result(null, null, 'lifecycle_requires_transition');
  }
  if (signal.divergenceState === 'CONFIRMED' && (compare(maxDrawdown, STOCK_RSI_RULES.REALIZED_DRAWDOWN) >= 0
    || signal.value <= STOCK_RSI_RULES.REALIZED_RSI_THRESHOLD || debug.confirmedAge >= STOCK_RSI_RULES.CONFIRMED_MAX_AGE)) {
    return result(null, null, 'lifecycle_requires_transition');
  }
  const invalidated = signal.divergenceState === 'CONFIRMED'
    ? compare(currentPrice / event.high2.price - 1, STOCK_RSI_RULES.INVALIDATION_PRICE_THRESHOLD) >= 0
      && signal.value >= event.high1.rsi - STOCK_RSI_RULES.RSI_RECOVERY_TOLERANCE
    : currentPrice > event.high2.price && signal.value >= event.high1.rsi;
  if (invalidated) return result(null, null, 'lifecycle_requires_transition');

  if (stockDetail?.priceBasis !== 'split_adjusted_close' || stockDetail.asOfDate !== signal.asOf
    || !Array.isArray(stockDetail.history)) return result(null, null, 'missing_or_mismatched_ma_context');
  const maHistory = stockDetail.history.filter(row => validStockRsiDate(row?.date) && row.date <= completedCutoffDate);
  if (maHistory.length !== stockDetail.history.filter(row => !(typeof row?.date === 'string' && row.date > completedCutoffDate)).length) {
    return result(null, null, 'invalid_ma_history');
  }
  const latestMa = maHistory.at(-1);
  const structure = deriveStockMaStructure(latestMa, { asOfDate: signal.asOf });
  const trend = deriveStockMaTrend(maHistory, { asOfDate: signal.asOf });
  if (structure.status === 'unavailable' || trend.status === 'unavailable') return result(null, null, 'incomplete_ma_history');
  // The latest split-adjusted close equals the same day's raw EOD close. Its
  // dividend-adjusted counterpart need not match, so never compare those bases.
  if (!positiveNumber(rows.at(-1).rawClose)
    || Math.abs(latestMa.close / rows.at(-1).rawClose - 1) > rules.MA_PRICE_MATCH_RELATIVE_TOLERANCE) {
    return result(null, null, 'ma_price_history_mismatch');
  }
  const comparisonCount = Math.max(STOCK_MA_TREND_CONFIG.lookback + 1,
    STOCK_MA_TREND_CONFIG.lookback + rules.DETERIORATION_LOOKBACK);
  const recentMa = maHistory.slice(-comparisonCount);
  const recentPrices = rows.slice(-comparisonCount);
  if (recentPrices.length !== comparisonCount || recentMa.length !== comparisonCount
    || recentMa.some((row, index) => row.date !== recentPrices[index].date)) {
    return result(null, null, 'ma_date_window_mismatch');
  }
  debug.ma30 = latestMa.ma30; debug.maPrice = latestMa.close;
  debug.priceVsMA30 = (latestMa.close - latestMa.ma30) / latestMa.ma30;
  debug.ma30Slope = trend.ma30Slope;
  debug.trendStructure = structure.status; debug.trendChange = trend.status;
  debug.timeDecayBlockedReasons = deterioration(rows, high2Index, maHistory, rules);
  if (debug.timeDecayBlockedReasons === null) return result(null, null, 'incomplete_ma_risk_window');
  debug.hasRecentDeterioration = debug.timeDecayBlockedReasons.length > 0;

  const contributions = debug.riskContributions;
  contributions.stateBase = signal.divergenceState === 'FORMING' ? rules.BASE_FORMING : rules.BASE_CONFIRMED;
  const rsiDifference = event.high1.rsi - event.high2.rsi;
  contributions.divergenceStrength = compare(rsiDifference, rules.RSI_DIFFERENCE_VERY_HIGH) >= 0 ? rules.RSI_STRENGTH_VERY_HIGH
    : compare(rsiDifference, rules.RSI_DIFFERENCE_HIGH) >= 0 ? rules.RSI_STRENGTH_HIGH
    : compare(rsiDifference, rules.RSI_DIFFERENCE_MEDIUM) >= 0 ? rules.RSI_STRENGTH_MEDIUM
      : compare(rsiDifference, STOCK_RSI_RULES.MIN_RSI_DIFFERENCE) >= 0 ? rules.RSI_STRENGTH_LOW : 0;
  if (compare(event.high2.price / event.high1.price - 1, rules.HIGHER_HIGH_BONUS_THRESHOLD) >= 0) contributions.divergenceStrength += rules.HIGHER_HIGH_BONUS;
  contributions.divergenceStrength = Math.min(contributions.divergenceStrength, rules.MAX_DIVERGENCE_STRENGTH);
  if (latestMa.close < latestMa.ma30) contributions.ma30Adjustment = Math.min(rules.MAX_MA30_ADJUSTMENT,
    rules.BELOW_MA30_PENALTY + (trend.ma30Slope < 0 ? rules.FALLING_MA30_PENALTY : 0));
  contributions.trendAdjustment = rules[`TREND_${trend.status.toUpperCase()}`];
  if (!Number.isFinite(contributions.trendAdjustment)) return result(null, null, 'unknown_ma_trend');
  const recovery = debug.priceRecoveryRatio;
  if (recovery !== null) debug.priceRecoveryAdjustment = compare(recovery, rules.PRICE_RECOVERY_FULL) >= 0 ? rules.PRICE_RECOVERY_FULL_ADJUSTMENT
    : compare(recovery, rules.PRICE_RECOVERY_HIGH) >= 0 ? rules.PRICE_RECOVERY_HIGH_ADJUSTMENT
    : compare(recovery, rules.PRICE_RECOVERY_MEDIUM) >= 0 ? rules.PRICE_RECOVERY_MEDIUM_ADJUSTMENT
      : compare(recovery, rules.PRICE_RECOVERY_LOW) >= 0 ? rules.PRICE_RECOVERY_LOW_ADJUSTMENT : 0;
  debug.rsiRecoveryAdjustment = compare(debug.rsiRecoveryGap, rules.RSI_RECOVERY_NEAR_TOLERANCE) <= 0 ? rules.RSI_RECOVERY_NEAR_ADJUSTMENT
    : compare(debug.rsiRecoveryGap, rules.RSI_RECOVERY_CLOSE_TOLERANCE) <= 0 ? rules.RSI_RECOVERY_CLOSE_ADJUSTMENT
      : compare(debug.rsiRecoveryGap, rules.RSI_RECOVERY_WIDE_TOLERANCE) <= 0 ? rules.RSI_RECOVERY_WIDE_ADJUSTMENT : 0;
  contributions.recoveryAdjustment = Math.max(rules.RECOVERY_ADJUSTMENT_MIN,
    debug.priceRecoveryAdjustment + debug.rsiRecoveryAdjustment);
  if (signal.divergenceState === 'CONFIRMED') {
    debug.timeDecayEligible = !debug.hasRecentDeterioration;
    if (debug.timeDecayEligible) contributions.timeDecay = debug.confirmedAge >= rules.TIME_DECAY_THIRD_AGE ? rules.TIME_DECAY_THIRD_ADJUSTMENT
      : debug.confirmedAge >= rules.TIME_DECAY_SECOND_AGE ? rules.TIME_DECAY_SECOND_ADJUSTMENT
        : debug.confirmedAge >= rules.TIME_DECAY_FIRST_AGE ? rules.TIME_DECAY_FIRST_ADJUSTMENT : 0;
  }
  debug.rawRiskScore = clamp(Object.values(contributions).reduce((sum, value) => sum + value, 0), rules.RISK_MIN, rules.RISK_MAX);
  const score = Math.max(debug.rawRiskScore, rules.RISK_LOW_MIN);
  debug.activeFloorApplied = score > debug.rawRiskScore;
  const level = score >= rules.RISK_HIGH_MIN ? 'HIGH' : score >= rules.RISK_MEDIUM_MIN ? 'MEDIUM' : 'LOW';
  return result(score, level);
}
