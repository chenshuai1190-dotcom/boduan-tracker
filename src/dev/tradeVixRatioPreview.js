import { getVixComparisonExpectedCloseDate } from '../lib/vixComparison.js';

// Explicit DEV samples, never a fallback for a failed authenticated request.
export function createTradeVixRatioPreview(scenario = 'triggered', now = Date.now()) {
  const ratio = ({ triggered: 1.103, equal: 1, below: 0.979 })[scenario];
  const date = getVixComparisonExpectedCloseDate(now);
  return { now, data: Number.isFinite(ratio) ? {
    termStructure: { source: 'CBOE', stale: false, expectedAsOfDate: date, asOfDate: date,
      rows: [{ date, vix: ratio * 25, vix3m: 25, ratio }] },
  } : null };
}
