import { isInvestmentDate, normalizeInvestmentSymbol } from './investmentComparisonModel.js';
import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';

const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null;
const sessionDate = date => isInvestmentDate(date) && ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !isRegularNyseHoliday(date);
function missingSessionBetween(previous, current) {
  for (let date = shiftReplayDate(previous, 1); date && date < current; date = shiftReplayDate(date, 1)) if (sessionDate(date)) return true;
  return false;
}
export function shiftReplayDate(date, days) {
  if (!isInvestmentDate(date)) return null;
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Caller supplies the current user's formal stock_trades, never wave records.
 * Mapped ledger rows omit owner IDs; any explicit owner must still match. */
export function collectReviewReplayTrades({ stockTrades = [], symbol, userId } = {}) {
  const ticker = normalizeInvestmentSymbol(symbol);
  if (!ticker || typeof userId !== 'string' || !userId.trim()) return [];
  return (Array.isArray(stockTrades) ? stockTrades : []).flatMap((record, order) => {
    if (!record || normalizeInvestmentSymbol(record.symbol) !== ticker
      || record.user_id != null && record.user_id !== userId
      || record.userId != null && record.userId !== userId
      || record.scope != null && !['stock', 'stock_trades'].includes(record.scope)
      || record.currency != null && record.currency !== 'USD') return [];
    const date = record.date ?? record.trade_date, price = numeric(record.price), shares = numeric(record.shares);
    if (!isInvestmentDate(date) || !['buy', 'sell'].includes(record.side) || price === null || price <= 0 || shares === null || shares <= 0) return [];
    return [{ key: `${record.id || 'trade'}:${order}`, id: record.id || null, date, side: record.side, price, shares, order }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
}

export function reviewReplayRequestRange(trades, endDate) {
  if (!isInvestmentDate(endDate)) return null;
  const dates = (trades || []).map(row => row.date).filter(date => isInvestmentDate(date) && date <= endDate).sort();
  const first = dates[0] || endDate, last = dates.at(-1) || endDate;
  return { startDate: [shiftReplayDate(first, -95), '2000-01-01'].sort().at(-1), endDate: [shiftReplayDate(last, 95), endDate].sort()[0] };
}

/** No nearest-date substitution, price interpolation or execution-price adjustment. */
export function buildReviewStockReplay({ stockTrades = [], symbol, userId, history, endDate, allowSynthetic = false } = {}) {
  const ticker = normalizeInvestmentSymbol(symbol);
  const trades = collectReviewReplayTrades({ stockTrades, symbol: ticker, userId });
  const synthetic = history?.synthetic === true;
  const input = history?.series?.[ticker]?.rows;
  const validIdentity = ticker && history?.priceBasis === 'split_adjusted_close'
    && (synthetic ? allowSynthetic : history?.source === 'EODHD_EOD_SPLITS')
    && isInvestmentDate(endDate) && Array.isArray(input) && input.length > 0;
  const validRows = validIdentity && input.every((row, index) => sessionDate(row?.date) && row.date <= endDate
    && (!index || row.date > input[index - 1].date) && typeof row.close === 'number' && Number.isFinite(row.close) && row.close > 0);
  const rows = validRows ? input.map((row, index) => ({ date: row.date, close: row.close, gapBefore: index > 0 && missingSessionBetween(input[index - 1].date, row.date) })) : [];
  const indexByDate = new Map(rows.map((row, index) => [row.date, index]));
  const sameDayCounts = new Map();
  trades.forEach(trade => sameDayCounts.set(trade.date, (sameDayCounts.get(trade.date) || 0) + 1));
  const seen = new Map();
  return {
    symbol: ticker, rows, validHistory: Boolean(validRows), synthetic: Boolean(validRows && synthetic),
    splitBasisDate: isInvestmentDate(history?.splitBasisDate) ? history.splitBasisDate : null,
    trades: trades.map(trade => {
      const rowIndex = indexByDate.get(trade.date) ?? -1;
      seen.set(trade.date, (seen.get(trade.date) || 0) + 1);
      return { ...trade, rowIndex, close: rowIndex < 0 ? null : rows[rowIndex].close,
        markerDate: rowIndex < 0 ? null : trade.date, sameDayCount: sameDayCounts.get(trade.date), sameDayOrder: seen.get(trade.date) };
    }),
  };
}

export function reviewReplayVisibleRows(rows, tradeDate, range = 'stage') {
  if (!Array.isArray(rows) || !rows.length) return [];
  const center = isInvestmentDate(tradeDate) ? tradeDate : rows.at(-1).date;
  const [before, after] = range === '3m' ? [45, 45] : range === '1m' ? [15, 15] : [14, 28];
  const start = shiftReplayDate(center, -before), end = shiftReplayDate(center, after);
  return rows.filter(row => row.date >= start && row.date <= end);
}
