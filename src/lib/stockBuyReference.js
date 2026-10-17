import { validStockRsiDate } from './stockRsiSignal.js';

export const STOCK_BUY_REFERENCE_VERSION = 'stock-buy-reference-v1';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const validRsi = value => finite(value) && value >= 0 && value <= 100;
const LOOKBACK = 5;
const SIGNAL_DAYS = 5;
const slopeEligible = value => value >= -0.1 || Math.abs(value + 0.1) <= 1e-12;

function emptyResult(asOfDate, reason) {
  return {
    version: STOCK_BUY_REFERENCE_VERSION,
    state: 'unavailable',
    reason,
    asOfDate: validStockRsiDate(asOfDate) ? asOfDate : null,
    rsi: null,
    previousRsi: null,
    close: null,
    confirmationPrice: null,
    distanceMa200Pct: null,
    ma60SlopePct: null,
    trendEligible: null,
    conditions: { trend: null, rsiRecovered: null, priceConfirmed: null },
    event: null,
  };
}

// Ignore future records before checking order: none of their prices or RSI
// readings may participate in an evaluation of a completed historical date.
function completedRows(input, asOfDate) {
  const rows = [];
  let previousDate = '';
  for (const row of input) {
    if (!validStockRsiDate(row?.date)) return null;
    if (row.date > asOfDate) continue;
    if (row.date <= previousDate) return null;
    rows.push(row);
    previousDate = row.date;
  }
  return rows;
}

function metricsAt(rows, rsiByDate, rsiIndexByDate, index) {
  if (index < LOOKBACK) return null;
  const window = rows.slice(index - LOOKBACK, index + 1);
  // Do not bridge a missing observation or skip an invalid provider row to
  // manufacture a six-session window. Early MA/RSI warmup nulls are normal.
  if (window.some(row => !positive(row.close) || !positive(row.ma60)
    || !validRsi(rsiByDate.get(row.date)))) return null;
  if (window.some((row, offset) => offset > 0
    && rsiIndexByDate.get(row.date) !== rsiIndexByDate.get(window[offset - 1].date) + 1)) return null;
  const row = rows[index];
  if (!positive(row.ma200)) return null;
  const ma60SlopePct = (row.ma60 / window[0].ma60 - 1) * 100;
  const distanceMa200Pct = (row.close / row.ma200 - 1) * 100;
  if (![ma60SlopePct, distanceMa200Pct].every(Number.isFinite)) return null;
  const confirmationPrice = Math.max(...rows.slice(index - 3, index).map(item => item.close));
  return {
    close: row.close,
    rsi: rsiByDate.get(row.date),
    previousRsi: rsiByDate.get(rows[index - 1].date),
    confirmationPrice,
    distanceMa200Pct,
    ma60SlopePct,
    trendEligible: row.close > row.ma200 && slopeEligible(ma60SlopePct),
  };
}

/**
 * Read-only reference from existing split-adjusted closes and the server's
 * existing Wilder RSI observations. This function never calculates RSI,
 * estimates missing prices, infers exchange holidays, or modifies its inputs.
 *
 * A watch can trigger on sessions 1–5 after its latest oversold observation.
 * A triggered reference lasts five sessions INCLUDING its trigger (ages 0–4).
 * The current chase/divergence gate is not a historical backtest of that gate.
 */
export function buildStockBuyReference({ history, rsiObservations, asOfDate, chaseBuyBlocked } = {}) {
  const unavailable = reason => emptyResult(asOfDate, reason);
  if (!validStockRsiDate(asOfDate)) return unavailable('invalid_as_of_date');
  if (!Array.isArray(history) || !history.length) return unavailable('missing_history');
  if (!Array.isArray(rsiObservations) || !rsiObservations.length) return unavailable('missing_rsi_observations');
  const rows = completedRows(history, asOfDate);
  if (!rows) return unavailable('invalid_history_dates');
  const observations = completedRows(rsiObservations, asOfDate);
  if (!observations) return unavailable('invalid_rsi_dates');
  if (rows.at(-1)?.date !== asOfDate || observations.at(-1)?.date !== asOfDate) return unavailable('date_mismatch');
  const rsiByDate = new Map(observations.map(row => [row.date, row.value]));
  const rsiIndexByDate = new Map(observations.map((row, index) => [row.date, index]));
  const latest = rows.at(-1);
  if (!positive(latest.close)) return unavailable('missing_current_price');
  if (!validRsi(rsiByDate.get(asOfDate))) return unavailable('missing_rsi_data');
  const current = metricsAt(rows, rsiByDate, rsiIndexByDate, rows.length - 1);
  if (!current) return unavailable('insufficient_indicator_history');

  let setup = null;
  let state = 'idle';
  let reason = 'no_recent_pullback';
  for (let index = 0; index < rows.length; index += 1) {
    const metrics = metricsAt(rows, rsiByDate, rsiIndexByDate, index);
    if (!metrics) {
      setup = null;
      state = 'idle';
      reason = 'no_recent_pullback';
      continue;
    }
    const date = rows[index].date;
    if (state === 'triggered') {
      if (index - setup.triggerIndex >= SIGNAL_DAYS) {
        state = 'expired';
        reason = 'signal_expired';
      }
      // Invalidation wins on the day it happens; an oversold reading on that
      // same close must not hide the failure by immediately replacing it.
      if (state === 'triggered' && metrics.close < setup.lowPrice) {
        setup.invalidatedAt = date;
        state = 'invalidated';
        reason = 'below_pullback_low';
        continue;
      }
    } else if (state === 'watch' && index - setup.oversoldIndex > LOOKBACK) {
      state = 'expired';
      reason = 'observation_expired';
    }

    if (metrics.trendEligible && metrics.rsi <= 30) {
      if (state === 'watch') {
        setup.oversoldIndex = index;
        setup.lowPrice = Math.min(setup.lowPrice, metrics.close);
      } else {
        setup = {
          startedAt: date,
          oversoldIndex: index,
          triggerIndex: null,
          triggeredAt: null,
          lowPrice: metrics.close,
          invalidatedAt: null,
          confirmationPrice: null,
        };
      }
      state = 'watch';
      reason = 'oversold_observation';
      continue;
    }

    if (state === 'watch') {
      setup.lowPrice = Math.min(setup.lowPrice, metrics.close);
      reason = metrics.rsi > 30 ? 'awaiting_price_confirmation' : 'oversold_observation';
      if (metrics.trendEligible && metrics.rsi > 30 && metrics.close > metrics.confirmationPrice) {
        setup.triggeredAt = date;
        setup.triggerIndex = index;
        setup.confirmationPrice = metrics.confirmationPrice;
        state = 'triggered';
        reason = 'recovery_confirmed';
      }
    }
  }

  const ageTradingDays = setup
    ? rows.length - 1 - (setup.triggerIndex ?? setup.oversoldIndex) : null;
  const active = ['watch', 'triggered'].includes(state);
  const event = setup ? {
    startedAt: setup.startedAt,
    triggeredAt: setup.triggeredAt,
    lowPrice: setup.lowPrice,
    invalidatedAt: setup.invalidatedAt,
    ageTradingDays,
    remainingTradingDays: active
      ? Math.max(0, setup.triggerIndex === null
        ? LOOKBACK + (ageTradingDays > 0 ? 1 : 0) - ageTradingDays
        : SIGNAL_DAYS - ageTradingDays) : 0,
  } : null;
  const confirmationPrice = setup?.confirmationPrice ?? current.confirmationPrice;
  if (typeof chaseBuyBlocked !== 'boolean') {
    state = 'unavailable';
    reason = 'missing_divergence_data';
  } else if (state !== 'invalidated' && chaseBuyBlocked) {
    state = 'paused';
    reason = 'chase_buy_blocked';
  } else if (state !== 'invalidated' && !current.trendEligible) {
    state = 'paused';
    reason = 'trend_not_eligible';
  }
  return {
    version: STOCK_BUY_REFERENCE_VERSION,
    state,
    reason,
    asOfDate,
    ...current,
    confirmationPrice,
    conditions: {
      trend: current.trendEligible,
      rsiRecovered: setup !== null && current.rsi > 30,
      priceConfirmed: current.close > confirmationPrice,
    },
    event,
  };
}
