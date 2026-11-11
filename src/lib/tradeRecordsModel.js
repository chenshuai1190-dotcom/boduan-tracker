import { normalizeStrictUserStockSymbol } from './symbols.js';
import { getStockTradeRecordKind } from './stockTradeRecordKind.js';

const DAY = 86400000;
const validDate = value => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const isValidTradeRecordDate = validDate;
const numeric = value => {
  if (typeof value !== 'number' && (typeof value !== 'string'
    || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function newYorkDate(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Calendar-date filters use the formal ledger's New York date, not browser time. */
export function getTradeRecordDateRange(period = 'all', { now = new Date() } = {}) {
  if (period === 'all' || period === 'custom') return { fromDate: null, toDate: null };
  const today = newYorkDate(now);
  if (!today) return { fromDate: null, toDate: null, error: 'invalid_clock' };
  if (period === 'today') return { fromDate: today, toDate: today };
  if (period === 'week') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { fromDate: shiftDate(today, -((weekday + 6) % 7)), toDate: today };
  }
  if (period === 'month') return { fromDate: `${today.slice(0, 7)}-01`,
    toDate: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10) };
  if (period === 'year') return { fromDate: `${today.slice(0, 4)}-01-01`, toDate: `${today.slice(0, 4)}-12-31` };
  if (period === 'lastMonth') {
    const lastDay = shiftDate(`${today.slice(0, 7)}-01`, -1);
    return { fromDate: `${lastDay.slice(0, 7)}-01`, toDate: lastDay };
  }
  return { fromDate: null, toDate: null, error: 'invalid_period' };
}

function normalizeTrade(trade, sourceIndex) {
  if (!trade || !validDate(trade.date) || !['buy', 'sell'].includes(trade.side)) return null;
  const symbol = normalizeStrictUserStockSymbol(trade.symbol);
  if (!symbol) return null;
  const price = numeric(trade.price), shares = numeric(trade.shares), feeValue = numeric(trade.fee);
  const fee = feeValue !== null && feeValue >= 0 ? feeValue : null;
  const currency = typeof trade.currency === 'string' ? trade.currency.trim().toUpperCase() : '';
  const product = price !== null && shares !== null && price > 0 && shares > 0 ? price * shares : null;
  const amount = product !== null && Number.isFinite(product) ? product : null;
  // Legacy mapped rows may default recordKind to "trade" while their persisted
  // note still carries the old holding marker. Preserve that compatibility.
  const isHistoricalHolding = trade.side === 'buy' && (trade.recordKind === 'historical_holding'
    || getStockTradeRecordKind(trade.note) === 'historical_holding');
  return { ...trade, symbol, name: typeof trade.name === 'string' ? trade.name.trim() : '',
    price: price !== null && price > 0 ? price : null, shares: shares !== null && shares > 0 ? shares : null,
    fee, currency, amount, amountUsd: currency === 'USD' ? amount : null,
    feeUsd: currency === 'USD' ? fee : null, isHistoricalHolding,
    recordKind: isHistoricalHolding ? 'historical_holding' : 'trade', sourceTrade: trade, sourceIndex };
}

function sumKnown(rows, key) {
  let total = 0;
  for (const row of rows) {
    if (row[key] === null || !Number.isFinite(row[key])) return null;
    total += row[key];
    if (!Number.isFinite(total)) return null;
  }
  return total === 0 ? 0 : total;
}

function summarize(rows) {
  const actual = rows.filter(row => !row.isHistoricalHolding);
  const buyAmountUsd = sumKnown(actual.filter(row => row.side === 'buy'), 'amountUsd');
  const sellAmountUsd = sumKnown(actual.filter(row => row.side === 'sell'), 'amountUsd');
  const feeUsd = sumKnown(actual, 'feeUsd');
  return { tradeCount: actual.length, holdingCount: rows.length - actual.length,
    buyAmountUsd, sellAmountUsd, feeUsd,
    amountsComplete: buyAmountUsd !== null && sellAmountUsd !== null, feesComplete: feeUsd !== null };
}

/** Read-only projection of stock_trades. Amounts are executions, never P&L or net cash flows. */
export function buildTradeRecordsView({ trades = [], filters = {}, now = new Date() } = {}) {
  const normalized = (Array.isArray(trades) ? trades : []).map(normalizeTrade).filter(Boolean);
  const options = new Map();
  for (const row of normalized) {
    const previous = options.get(row.symbol);
    options.set(row.symbol, { symbol: row.symbol, name: previous?.name && previous.name !== row.symbol
      ? previous.name : row.name || row.symbol,
      count: (previous?.count || 0) + 1 });
  }
  const stockOptions = [...options.values()].sort((a, b) => compare(a.symbol, b.symbol));
  const period = filters.period || 'all';
  const range = getTradeRecordDateRange(period, { now });
  let filterError = range.error || null;
  if (period === 'custom') {
    if (!validDate(filters.fromDate) || !validDate(filters.toDate) || filters.fromDate > filters.toDate) {
      filterError = 'invalid_date_range';
    } else {
      range.fromDate = filters.fromDate;
      range.toDate = filters.toDate;
    }
  }
  const selected = Array.isArray(filters.symbols) ? filters.symbols : [];
  const selectedSymbols = new Set(selected.map(normalizeStrictUserStockSymbol).filter(Boolean));
  if (filters.symbols != null && !Array.isArray(filters.symbols)
    || selected.some(symbol => !normalizeStrictUserStockSymbol(symbol))) filterError = 'invalid_symbols';
  const side = filters.side || 'all';
  const sort = filters.sort || 'newest';
  if (!['all', 'buy', 'sell'].includes(side)) filterError = 'invalid_side';
  if (!['newest', 'oldest'].includes(sort)) filterError = 'invalid_sort';
  const rows = filterError ? [] : normalized.filter(row => (!selectedSymbols.size || selectedSymbols.has(row.symbol))
    && (!range.fromDate || row.date >= range.fromDate) && (!range.toDate || row.date <= range.toDate)
    && (side === 'all' || row.side === side))
    .sort((a, b) => (sort === 'oldest' ? compare(a.date, b.date) : compare(b.date, a.date)) || a.sourceIndex - b.sourceIndex);
  const groups = [];
  for (const row of rows) {
    if (groups.at(-1)?.date !== row.date) groups.push({ date: row.date, rows: [] });
    groups.at(-1).rows.push(row);
  }
  return { rows, groups, summary: summarize(rows), stockOptions, filterError };
}
