// Initial strategy parameters, not market standards. Thresholds are ratios;
// lookbacks count completed provider trading records, not calendar days.
export const STOCK_MA_TREND_CONFIG = Object.freeze({
  lookback: 5,
  crossLookback: 5,
  crossThreshold: 0.001,
  slopeThreshold: 0.001,
  gapChangeThreshold: 0.001,
  // Five records contain four adjacent changes. This filter applies only to
  // the gap-contraction path of a complete bullish structure weakening.
  contractionLookback: 5,
  contractionMinDays: 3,
  dailyGapChangeMin: 0.0002,
});
