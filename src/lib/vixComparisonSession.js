import { latestCompletedUsTradingDate } from './pnlReportSnapshots.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

export function isVixComparisonSession(dateKey) {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isRegularNyseHoliday(dateKey);
}

// A conservative page-specific availability boundary, not a Cboe publication SLA.
// Even on shortened sessions we wait until 16:30 ET before expecting that close.
export function getVixComparisonExpectedCloseDate(now = Date.now()) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
    throw new Error('VIX comparison time is invalid');
  }
  let dateKey = latestCompletedUsTradingDate(new Date(timestamp - 30 * 60 * 1000));
  while (!isVixComparisonSession(dateKey)) {
    const previous = new Date(`${dateKey}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    dateKey = previous.toISOString().slice(0, 10);
  }
  return dateKey;
}
