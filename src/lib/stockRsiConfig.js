export const STOCK_RSI_DIVERGENCE_VERSION = 'rsi6-lifecycle-v3';
export const DIVERGENCE_STATES = Object.freeze(['NONE', 'FORMING', 'CONFIRMED', 'REALIZED', 'INVALIDATED']);

// Trend-page observations are independent of the legacy drawdown lifecycle
// consumed by stock-decision and its risk score.
export const STOCK_TREND_RSI_VERSION = 'rsi6-trend-v1';
export const STOCK_TREND_RSI_RULES = Object.freeze({
  RSI_OVERBOUGHT: 70,
  RSI_STRONGLY_OVERBOUGHT: 80,
  MIN_PRICE_BREAKOUT_PCT: 0.5,
  MIN_RSI_DIVERGENCE_DELTA: 3,
  REFERENCE_PIVOT_WINDOW: 2,
  MIN_REFERENCE_RSI: 70,
});

// Initial strategy parameters. These describe completed daily observations,
// not intraday signals or guarantees about subsequent price movement.
export const STOCK_RSI_RULES = Object.freeze({
  RSI_PERIOD: 6,
  RSI_WARMUP_CLOSES: 60,
  RSI_OVERBOUGHT: 80,
  RSI_OVERSOLD: 20,
  PIVOT_WINDOW: 3,
  MIN_PIVOT_DISTANCE: 5,
  MAX_PIVOT_DISTANCE: 60,
  PRICE_HIGHER_HIGH_THRESHOLD: 0.005,
  MIN_RSI_DIFFERENCE: 5,
  DIVERGENCE_MIN_RSI: 70,
  CONFIRMATION_DRAWDOWN: 0.03,
  REALIZED_DRAWDOWN: 0.08,
  REALIZED_RSI_THRESHOLD: 40,
  REALIZED_DISPLAY_WINDOW: 5,
  INVALIDATED_DISPLAY_WINDOW: 3,
  INVALIDATION_PRICE_THRESHOLD: 0.005,
  RSI_RECOVERY_TOLERANCE: 2,
  CONFIRMED_MAX_AGE: 20,
});

export function resolveStockRsiRules(overrides) {
  if (overrides !== undefined && (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))) return null;
  if (overrides && Object.keys(overrides).some((key) => !Object.hasOwn(STOCK_RSI_RULES, key))) return null;
  const rules = { ...STOCK_RSI_RULES, ...overrides };
  if (rules.RSI_PERIOD !== 6 || rules.RSI_WARMUP_CLOSES !== 60) return null;
  for (const key of ['PIVOT_WINDOW', 'MIN_PIVOT_DISTANCE', 'MAX_PIVOT_DISTANCE', 'REALIZED_DISPLAY_WINDOW', 'INVALIDATED_DISPLAY_WINDOW', 'CONFIRMED_MAX_AGE']) {
    if (!Number.isSafeInteger(rules[key]) || rules[key] <= 0) return null;
  }
  if (rules.MIN_PIVOT_DISTANCE > rules.MAX_PIVOT_DISTANCE) return null;
  for (const key of ['RSI_OVERBOUGHT', 'RSI_OVERSOLD', 'MIN_RSI_DIFFERENCE', 'DIVERGENCE_MIN_RSI', 'REALIZED_RSI_THRESHOLD', 'RSI_RECOVERY_TOLERANCE']) {
    if (!Number.isFinite(rules[key]) || rules[key] < 0 || rules[key] > 100) return null;
  }
  if (rules.RSI_OVERSOLD >= rules.RSI_OVERBOUGHT) return null;
  for (const key of ['PRICE_HIGHER_HIGH_THRESHOLD', 'CONFIRMATION_DRAWDOWN', 'REALIZED_DRAWDOWN', 'INVALIDATION_PRICE_THRESHOLD']) {
    if (!Number.isFinite(rules[key]) || rules[key] <= 0 || rules[key] >= 1) return null;
  }
  if (rules.CONFIRMATION_DRAWDOWN > rules.REALIZED_DRAWDOWN) return null;
  return rules;
}
