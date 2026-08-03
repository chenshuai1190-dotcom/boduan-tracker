import { normalizeUserStockSymbol } from './symbols.js';

export const HOME_MA200_DEFAULT_ROWS = 5;
export const HOME_MA200_MAX_COMPLETED_DAYS = 20;

function normalizeSymbol(value) {
  return normalizeUserStockSymbol(value);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function completedDayCount(value) {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

function validDateKey(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function quoteMap(rows = []) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const symbol = normalizeSymbol(row?.symbol);
    if (symbol) map.set(symbol, row);
  });
  return map;
}

function watchlistRows(rows = []) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).flatMap((row, index) => {
    const symbol = normalizeSymbol(typeof row === 'string' ? row : row?.symbol);
    if (!symbol || seen.has(symbol)) return [];
    seen.add(symbol);
    return [{
      ...(row && typeof row === 'object' ? row : {}),
      symbol,
      watchlistIndex: index,
    }];
  });
}

function readyMonitor(value) {
  if (!value || value.status !== 'ready') return null;
  if (String(value.source || '').toUpperCase() !== 'EODHD') return null;
  if (value.priceBasis !== 'eodhd_adjusted_close') return null;

  const completedClose = positiveNumber(value.completedClose);
  const ma200 = positiveNumber(value.ma200);
  const belowCompletedDays = completedDayCount(value.belowCompletedDays);
  const asOfDate = validDateKey(value.asOfDate);
  if (completedClose === null || ma200 === null || belowCompletedDays === null || !asOfDate) return null;

  return {
    completedClose,
    ma200,
    belowCompletedDays,
    asOfDate,
  };
}

function displayName(watchlistRow, quoteRow) {
  return String(
    watchlistRow?.name
      || watchlistRow?.company
      || quoteRow?.name
      || quoteRow?.company
      || watchlistRow?.symbol
      || '',
  ).trim();
}

function compareRows(left, right) {
  if (left.belowCompletedDays !== right.belowCompletedDays) {
    return left.belowCompletedDays - right.belowCompletedDays;
  }
  if (left.distancePct !== right.distancePct) return left.distancePct - right.distancePct;
  return left.watchlistIndex - right.watchlistIndex;
}

export function selectHomeMa200SymbolsForBatch(batch = [], watchlist = []) {
  const allowed = new Set(watchlistRows(watchlist).map((row) => row.symbol));
  const seen = new Set();
  return (Array.isArray(batch) ? batch : []).flatMap((value) => {
    const symbol = normalizeSymbol(typeof value === 'string' ? value : value?.symbol);
    if (!symbol || !allowed.has(symbol) || seen.has(symbol)) return [];
    seen.add(symbol);
    return [symbol];
  });
}

export function buildHomeMa200BreakdownModel({ watchlist = [], quoteRows = [] } = {}) {
  const watchedRows = watchlistRows(watchlist);
  const quotes = quoteMap(quoteRows);
  const signals = [];
  let hasIncompleteData = false;
  let hasOutsideWindowBreakdown = false;
  let latestAsOfDate = '';

  watchedRows.forEach((watchedRow) => {
    const quote = quotes.get(watchedRow.symbol);
    const monitor = readyMonitor(quote?.ma200Monitor);
    if (!monitor) {
      hasIncompleteData = true;
      return;
    }

    if (monitor.asOfDate > latestAsOfDate) latestAsOfDate = monitor.asOfDate;
    if (
      monitor.completedClose < monitor.ma200
      && monitor.belowCompletedDays > HOME_MA200_MAX_COMPLETED_DAYS
    ) {
      hasOutsideWindowBreakdown = true;
    }

    const confirmed = (
      monitor.completedClose < monitor.ma200
      && monitor.belowCompletedDays >= 1
      && monitor.belowCompletedDays <= HOME_MA200_MAX_COMPLETED_DAYS
    );
    const currentPrice = positiveNumber(quote?.price);
    const intraday = (
      !confirmed
      && monitor.belowCompletedDays === 0
      && monitor.completedClose >= monitor.ma200
      && currentPrice !== null
      && currentPrice < monitor.ma200
    );
    if (!confirmed && !intraday) return;

    const displayPrice = confirmed ? monitor.completedClose : currentPrice;
    signals.push({
      symbol: watchedRow.symbol,
      company: displayName(watchedRow, quote),
      status: confirmed ? 'confirmed' : 'intraday',
      price: displayPrice,
      ma200: monitor.ma200,
      distancePct: ((displayPrice / monitor.ma200) - 1) * 100,
      belowCompletedDays: monitor.belowCompletedDays,
      asOfDate: monitor.asOfDate,
      watchlistIndex: watchedRow.watchlistIndex,
    });
  });

  const sortedSignals = signals.sort(compareRows);
  const confirmedCount = sortedSignals.filter((row) => row.status === 'confirmed').length;
  const intradayCount = sortedSignals.filter((row) => row.status === 'intraday').length;

  return {
    rows: sortedSignals,
    confirmedCount,
    intradayCount,
    hasIncompleteData,
    hasOutsideWindowBreakdown,
    latestAsOfDate,
    watchlistCount: watchedRows.length,
  };
}
