import { latestCompletedUsTradingDate } from '../../src/lib/pnlReportSnapshots.js';
import { isRegularNyseHoliday } from '../../src/lib/quoteRefreshPolicy.js';

// Preserve the existing 16:00 ET boundary for ordinary market-history tools.
// VIX's conservative publication window is page-specific and must not alter it.
export function getCompletedMarketCloseDate(now = Date.now()) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) {
    throw new Error('VIX comparison time is invalid');
  }
  let dateKey = latestCompletedUsTradingDate(new Date(timestamp));
  while (true) {
    const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !isRegularNyseHoliday(dateKey)) return dateKey;
    const previous = new Date(`${dateKey}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    dateKey = previous.toISOString().slice(0, 10);
  }
}
