import { stockRsiTradeDateReason } from './stockRsiReference.js';
import { getVixComparisonExpectedCloseDate } from './vixComparisonSession.js';

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const unavailable = () => ({
  vixRatioReady: false,
  vixRatioValue: null,
  vixRatioDataDate: '',
  vixRatioBuySignal: false,
});

// The input is the authenticated, normalized comparison response. A current
// trade reference requires a completed same-session pair, never a live VIX or
// an older close reused for a historical trade's date-only entry.
export function deriveTradeVixRatioReference({ data, tradeDate, now = Date.now() } = {}) {
  if (stockRsiTradeDateReason(tradeDate, now)) return unavailable();
  const expectedDate = getVixComparisonExpectedCloseDate(now);
  const term = data?.termStructure;
  const latest = Array.isArray(term?.rows) ? term.rows.at(-1) : null;
  if (term?.source !== 'CBOE' || term.stale !== false
    || term.asOfDate !== expectedDate || term.expectedAsOfDate !== expectedDate
    || latest?.date !== expectedDate
    || !['vix', 'vix3m', 'ratio'].every(key => positive(latest[key]))) return unavailable();

  const ratio = latest.vix / latest.vix3m;
  if (!positive(ratio) || Math.abs(latest.ratio - ratio) > 1e-8) return unavailable();
  return {
    vixRatioReady: true,
    vixRatioValue: ratio,
    vixRatioDataDate: latest.date,
    vixRatioBuySignal: ratio > 1,
  };
}
