import { normalizeDcaHistoryData } from './dcaHistory.js';
import { isInvestmentDate, normalizeInvestmentSymbol } from './investmentComparisonModel.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

export const TRADE_REVIEW_HORIZONS = Object.freeze([5, 20, 60]);

// Verified exchange closures also used by the existing VIX calendar. Keep
// these observation-only facts local rather than changing quote lifecycle.
// NYSE: https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx
// NYSE: https://ir.theice.com/press/news-details/2018/New-York-Stock-Exchange-to-Honor-President-George-H-W-Bush/default.aspx
const VERIFIED_SPECIAL_CLOSURES = new Set(['2025-01-09', '2018-12-05']);

function isSession(date) {
  return isInvestmentDate(date)
    && ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())
    && !VERIFIED_SPECIAL_CLOSURES.has(date)
    && !isRegularNyseHoliday(date);
}

function subsequentSessions(date, count) {
  const cursor = new Date(`${date}T00:00:00Z`);
  const dates = [];
  while (dates.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const next = cursor.toISOString().slice(0, 10);
    if (isSession(next)) dates.push(next);
  }
  return dates;
}

function emptyWindow(days, status = 'unavailable') {
  return { days, status, observedDays: 0, endDate: null, returnPct: null,
    maxRisePct: null, maxFallPct: null, maxRiseDate: null, maxFallDate: null };
}

/**
 * Post-trade market observation, never execution P&L or a buy/sell score.
 * Both endpoints use the same EODHD adjusted-close series; execution price,
 * shares, side, fees and ETF leverage cannot change these price observations.
 * A missing expected session is not silently counted as the next trading day.
 */
export function buildTradeOutcomeReview({ trade, history, asOfDate, now = Date.now() } = {}) {
  const symbol = normalizeInvestmentSymbol(trade?.symbol);
  const tradeDate = trade?.date;
  const base = { symbol, tradeDate, status: 'unavailable', reason: 'invalid_trade',
    basis: 'trade_day_adjusted_close', baseAdjustedClose: null, asOfDate: null,
    stale: false, windows: TRADE_REVIEW_HORIZONS.map(days => emptyWindow(days)) };
  if (!symbol || !isInvestmentDate(tradeDate) || !['buy', 'sell'].includes(trade?.side)) return base;
  const data = normalizeDcaHistoryData(history, { symbol, now });
  if (!data) return { ...base, reason: 'invalid_history' };
  if (asOfDate !== undefined && (!isInvestmentDate(asOfDate) || asOfDate > data.expectedAsOfDate)) {
    return { ...base, reason: 'invalid_cutoff' };
  }
  const throughDate = asOfDate && asOfDate < data.asOfDate ? asOfDate : data.asOfDate;
  const scoped = { ...base, asOfDate: throughDate, stale: data.stale };
  if (tradeDate > throughDate) return { ...scoped, reason: 'awaiting_trade_close' };
  const baseline = data.rows.find(row => row.date === tradeDate);
  if (!isSession(tradeDate) || !baseline) return { ...scoped, reason: 'missing_trade_close' };
  const required = subsequentSessions(tradeDate, TRADE_REVIEW_HORIZONS.at(-1));
  const byDate = new Map(data.rows.filter(row => row.date <= throughDate).map(row => [row.date, row]));
  const windows = TRADE_REVIEW_HORIZONS.map(days => {
    const dates = required.slice(0, days);
    const elapsedDates = dates.filter(date => date <= throughDate);
    const missing = elapsedDates.some(date => !byDate.has(date));
    if (missing || elapsedDates.length < days) return {
      ...emptyWindow(days, missing ? 'missing_data' : 'pending'),
      observedDays: elapsedDates.filter(date => byDate.has(date)).length,
    };
    const moves = dates.map(date => ({ date, value: (byDate.get(date).close / baseline.close - 1) * 100 }));
    if (moves.some(move => !Number.isFinite(move.value))) return emptyWindow(days, 'missing_data');
    let high = { date: tradeDate, value: 0 }, low = high;
    for (const move of moves) {
      if (move.value > high.value) high = move;
      if (move.value < low.value) low = move;
    }
    return { days, status: 'available', observedDays: days, endDate: dates.at(-1),
      returnPct: moves.at(-1).value, maxRisePct: high.value, maxFallPct: low.value,
      maxRiseDate: high.date, maxFallDate: low.date };
  });
  return { ...scoped, status: 'ready', reason: null, baseAdjustedClose: baseline.close, windows };
}
