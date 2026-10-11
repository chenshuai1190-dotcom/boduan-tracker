import { getInvestmentComparisonExpectedCloseDate } from '../lib/investmentComparison.js';
import { isRegularNyseHoliday } from '../lib/quoteRefreshPolicy.js';

// Local design-only observations. The production component defaults to the
// authenticated history loader; callers must guard this source with DEV.
export async function loadTradeOutcomeReviewPreview({ symbol = 'NVDA', signal } = {}) {
  if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  const asOfDate = getInvestmentComparisonExpectedCloseDate();
  const rows = [];
  const cursor = new Date('2024-01-02T00:00:00Z');
  const seed = [...symbol].reduce((total, char) => total + char.charCodeAt(0), 0);
  while (cursor.toISOString().slice(0, 10) <= asOfDate) {
    const date = cursor.toISOString().slice(0, 10);
    if (![0, 6].includes(cursor.getUTCDay()) && !isRegularNyseHoliday(date) && date !== '2025-01-09') {
      const index = rows.length;
      rows.push({ date, close: 75 + seed / 6 + index * 0.13 + 14 * Math.sin(index / 11) + 9 * Math.cos(index / 29) });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { version: 1, source: 'EODHD_EOD', symbol, name: `${symbol} local preview`, type: 'Common Stock',
    currency: 'USD', priceBasis: 'adjusted_close', expectedAsOfDate: asOfDate, asOfDate,
    availableFromDate: rows[0].date, fetchedAt: new Date().toISOString(), stale: false, staleReason: '', rows };
}
