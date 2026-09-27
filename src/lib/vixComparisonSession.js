import { latestCompletedUsTradingDate } from './pnlReportSnapshots.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

// Official exchange closures are calendar facts, never inferred from missing
// provider rows. Keep these VIX-specific additions out of other market tools.
const SPECIAL_CLOSURES = Object.freeze({
  // https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx
  '2025-01-09': 'national_day_of_mourning_jimmy_carter',
  // https://ir.theice.com/press/news-details/2018/New-York-Stock-Exchange-to-Honor-President-George-H-W-Bush/default.aspx
  '2018-12-05': 'national_day_of_mourning_george_h_w_bush',
});

function validDateKey(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getVixSessionStatus(dateKey) {
  if (!validDateKey(dateKey)) return { kind: 'invalid_date', reason: 'invalid_date' };
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return { kind: 'weekend', reason: 'weekend' };
  if (SPECIAL_CLOSURES[dateKey]) return { kind: 'official_closure', reason: SPECIAL_CLOSURES[dateKey] };
  if (isRegularNyseHoliday(dateKey)) return { kind: 'official_closure', reason: 'regular_exchange_holiday' };
  return { kind: 'session', reason: '' };
}

export function isVixComparisonSession(dateKey) {
  return getVixSessionStatus(dateKey).kind === 'session';
}

// The input must be an exact YYYY-MM-DD key; invalid or out-of-range dates do
// not become a different day through Date's coercion/normalization.
export function nextVixComparisonSession(dateKey) {
  if (!validDateKey(dateKey)) return null;
  const cursor = new Date(`${dateKey}T00:00:00Z`);
  while (true) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const nextDate = cursor.toISOString().slice(0, 10);
    const status = getVixSessionStatus(nextDate);
    if (status.kind === 'invalid_date') return null;
    if (status.kind === 'session') return nextDate;
  }
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
  if (!validDateKey(dateKey)) throw new Error('VIX comparison time is invalid');
  while (!isVixComparisonSession(dateKey)) {
    const previous = new Date(`${dateKey}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    dateKey = previous.toISOString().slice(0, 10);
  }
  return dateKey;
}
