import { normalizeUserStockSymbol } from './symbols.js';

const RANGE_MONTHS = Object.freeze({
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
  '5y': 60,
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function utcDateKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10) === `${match[1]}-${match[2]}-${match[3]}`
    ? `${match[1]}-${match[2]}-${match[3]}`
    : '';
}

function subtractUtcMonthsClamped(date, months) {
  const target = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() - months,
    1,
  ));
  const lastDay = new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

export function normalizeStockDetailHistory(rows = []) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = utcDateKey(row?.date);
    const close = positiveNumber(row?.close);
    if (!date || close === null) continue;
    byDate.set(date, {
      date,
      close,
      ma200: positiveNumber(row?.ma200),
    });
  }
  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export function normalizeStockDetailWeeklyHistory(rows = []) {
  const byDate = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = utcDateKey(row?.date);
    const weekEndDate = utcDateKey(row?.weekEndDate);
    const close = positiveNumber(row?.close);
    const ma200 = positiveNumber(row?.ma200);
    if (!date || close === null) continue;
    byDate.set(date, {
      date,
      weekEndDate: weekEndDate || date,
      close,
      ma200,
      completed: row?.completed === true,
    });
  }
  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export function filterStockDetailHistory(rows = [], range = '1m') {
  const history = normalizeStockDetailHistory(rows);
  if (history.length === 0) return [];
  const months = RANGE_MONTHS[range] || RANGE_MONTHS['1m'];
  const asOfDate = subtractUtcMonthsClamped(
    new Date(`${history.at(-1).date}T00:00:00Z`),
    months,
  );
  const from = asOfDate.toISOString().slice(0, 10);
  const filtered = history.filter((row) => row.date >= from);
  if (filtered.length >= 2) return filtered;
  return history.slice(-Math.min(2, history.length));
}

export function filterStockDetailWeeklyHistory(rows = [], range = '5y') {
  const history = normalizeStockDetailWeeklyHistory(rows);
  if (history.length === 0) return [];
  const months = RANGE_MONTHS[range] || RANGE_MONTHS['5y'];
  const asOfDate = subtractUtcMonthsClamped(
    new Date(`${history.at(-1).date}T00:00:00Z`),
    months,
  );
  const from = asOfDate.toISOString().slice(0, 10);
  return history.filter((row) => row.date >= from);
}

export function findStockDetailWeeklyMaOnOrBefore(rows = [], date) {
  const targetDate = utcDateKey(date);
  if (!targetDate) return null;
  const history = normalizeStockDetailWeeklyHistory(rows);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const row = history[index];
    if (row.date <= targetDate && row.completed && row.ma200 !== null) return row;
  }
  return null;
}

export function resolveStockDetailClose(history = []) {
  const rows = normalizeStockDetailHistory(history);
  const latest = rows.at(-1) || null;
  const previous = rows.length > 1 ? rows.at(-2) : null;
  const change = latest && previous ? latest.close - previous.close : null;
  const changePercent = change !== null && previous.close > 0 ? (change / previous.close) * 100 : null;
  return {
    asOfDate: latest?.date || '',
    closeUsd: latest?.close ?? null,
    previousCloseUsd: previous?.close ?? null,
    changeUsd: change,
    changePercent,
  };
}

export function displayCurrencyRate(currencyMode, usdRate) {
  if (String(currencyMode || '').toUpperCase() !== 'CNY') return 1;
  return positiveNumber(usdRate) || 7.2;
}

export function usdToDisplayCurrency(value, currencyMode, usdRate) {
  const number = finiteNumber(value);
  if (number === null) return null;
  return number * displayCurrencyRate(currencyMode, usdRate);
}

export function targetSpacePercent(targetPriceUsd, currentPriceUsd) {
  const target = positiveNumber(targetPriceUsd);
  const current = positiveNumber(currentPriceUsd);
  if (target === null || current === null) return null;
  return ((target / current) - 1) * 100;
}

export function targetProgressPercent(targetPriceUsd, currentPriceUsd, averageCostUsd) {
  const target = positiveNumber(targetPriceUsd);
  const current = positiveNumber(currentPriceUsd);
  const cost = positiveNumber(averageCostUsd);
  if (target === null || current === null || cost === null || target <= cost) return null;
  return ((current - cost) / (target - cost)) * 100;
}

export function targetProgressPositionPercent(progressPercent) {
  const progress = finiteNumber(progressPercent);
  if (progress === null) return 0;
  return Math.max(0, Math.min(100, progress));
}

export function findWatchlistStockDetailRows({
  symbol,
  watchlist = [],
  homeWatchlist = [],
  quoteRows = [],
  positions = [],
  stockTrades = [],
} = {}) {
  const normalizedSymbol = normalizeUserStockSymbol(symbol);
  const matches = (row) => normalizeUserStockSymbol(row?.symbol) === normalizedSymbol;
  const watchlistRow = (Array.isArray(watchlist) ? watchlist : []).find(matches)
    || (Array.isArray(homeWatchlist) ? homeWatchlist : []).find(matches)
    || null;
  const quoteRow = (Array.isArray(quoteRows) ? quoteRows : []).find(matches)
    || (Array.isArray(homeWatchlist) ? homeWatchlist : []).find(matches)
    || watchlistRow;
  const position = (Array.isArray(positions) ? positions : []).find(matches) || null;
  const trades = (Array.isArray(stockTrades) ? stockTrades : [])
    .filter(matches)
    .sort((left, right) => String(right?.date || '').localeCompare(String(left?.date || ''))
      || Number(right?.id || 0) - Number(left?.id || 0));
  return { symbol: normalizedSymbol, watchlistRow, quoteRow, position, trades };
}

export function deriveCloseBasedPosition(position, closeUsd, totalAssetsUsd) {
  const shares = positiveNumber(position?.heldShares) || 0;
  const close = positiveNumber(closeUsd);
  const averageCostUsd = positiveNumber(position?.avgCost);
  if (!position || shares <= 0) {
    return {
      held: false,
      shares: 0,
      averageCostUsd,
      marketValueUsd: null,
      pnlUsd: null,
      pnlPercent: null,
      allocationPercent: null,
    };
  }
  const marketValueUsd = close === null ? null : shares * close;
  const remainingCost = positiveNumber(position?.remainingCost)
    || (averageCostUsd === null ? null : shares * averageCostUsd);
  const pnlUsd = marketValueUsd === null || remainingCost === null ? null : marketValueUsd - remainingCost;
  const pnlPercent = pnlUsd === null || !(remainingCost > 0) ? null : (pnlUsd / remainingCost) * 100;
  const assets = positiveNumber(totalAssetsUsd);
  const allocationPercent = marketValueUsd === null || assets === null ? null : (marketValueUsd / assets) * 100;
  return {
    held: true,
    shares,
    averageCostUsd,
    marketValueUsd,
    pnlUsd,
    pnlPercent,
    allocationPercent,
  };
}
