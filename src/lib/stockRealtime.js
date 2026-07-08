import { normalizeUserStockSymbol } from './symbols.js';

export const MAX_STOCK_REALTIME_SYMBOLS = 50;
export const STOCK_REALTIME_ROW_MAX_AGE_MS = 120_000;
export const STOCK_REALTIME_EXTENDED_ROW_MAX_AGE_MS = 5 * 60_000;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeStockRealtimeSymbol(value) {
  return normalizeUserStockSymbol(value);
}

export function selectStockRealtimeSymbols(rows = [], limit = MAX_STOCK_REALTIME_SYMBOLS) {
  const symbols = [];
  const seen = new Set();
  for (const row of rows || []) {
    const symbol = normalizeStockRealtimeSymbol(row?.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
    if (symbols.length >= limit) break;
  }
  return symbols;
}

export function applyStockTickToQuoteRows(rows = [], tick, realtimeStatus = 'live', baseRows = []) {
  const symbol = normalizeStockRealtimeSymbol(tick?.symbol || tick?.ticker || tick?.displaySymbol);
  const price = asNumber(tick?.price);
  if (!symbol || !price || price <= 0) return rows;
  const baseRow = findStockRealtimeRow(baseRows, symbol);

  let found = false;
  const nextRows = (rows || []).map((row) => {
    if (normalizeStockRealtimeSymbol(row?.symbol) !== symbol) return row;
    found = true;
    const baseline = mergeQuoteBaseline(row, baseRow);
    if (!hasRealtimeDailyBaseline(baseline, tick)) return row;
    return createStockQuoteRow(baseline, { ...tick, symbol }, realtimeStatus);
  });

  if (found) return nextRows;

  if (!baseRow) return nextRows;
  if (!hasRealtimeDailyBaseline(baseRow, tick)) return nextRows;
  return [...nextRows, createStockQuoteRow(baseRow, { ...tick, symbol }, realtimeStatus)];
}

export function mergeStockTicksIntoQuoteRows(rows = [], ticks = [], realtimeStatus = 'live', baseRows = []) {
  let next = rows;
  for (const tick of ticks || []) {
    next = applyStockTickToQuoteRows(next, tick, realtimeStatus, baseRows);
  }
  return next;
}

export function mergeFreshStockRealtimeRows(rows = [], realtimeRows = [], {
  maxAgeMs = STOCK_REALTIME_ROW_MAX_AGE_MS,
  extendedMaxAgeMs = STOCK_REALTIME_EXTENDED_ROW_MAX_AGE_MS,
  now = Date.now(),
} = {}) {
  let next = rows || [];
  for (const row of realtimeRows || []) {
    const symbol = normalizeStockRealtimeSymbol(row?.symbol);
    const price = asNumber(row?.price);
    const realtimeAt = normalizeTimestampMs(row?.clientReceivedAt)
      || normalizeTimestampMs(row?.receivedAt)
      || normalizeTimestampMs(row?.realtimeAt);
    const freshWindowMs = isExtendedStockRealtimeRow(row, now) ? extendedMaxAgeMs : maxAgeMs;
    const isFreshRealtime = symbol
      && price
      && price > 0
      && row?.realtime
      && realtimeAt
      && now - realtimeAt <= freshWindowMs;
    if (!isFreshRealtime) continue;
    next = applyStockTickToQuoteRows(next, row, row?.realtimeStatus || 'live', rows);
  }
  return next;
}

export function isFreshStockRealtimeTick(tick = {}, {
  maxAgeMs = STOCK_REALTIME_ROW_MAX_AGE_MS,
  now = Date.now(),
} = {}) {
  const tickAt = normalizeTimestampMs(tick?.clientReceivedAt)
    || normalizeTimestampMs(tick?.receivedAt)
    || normalizeTimestampMs(tick?.realtimeAt)
    || normalizeTimestampMs(tick?.timestamp);
  return Boolean(tickAt && now - tickAt <= maxAgeMs && tickAt - now < 60_000);
}

function normalizeTimestampMs(value) {
  const n = asNumber(value);
  if (!n || n <= 0) return 0;
  return n < 1_000_000_000_000 ? Math.round(n * 1000) : Math.round(n);
}

function findStockRealtimeRow(rows = [], symbol) {
  return (rows || []).find((row) => normalizeStockRealtimeSymbol(row?.symbol) === symbol) || null;
}

function mergeQuoteBaseline(row = {}, baseRow = null) {
  if (!baseRow) return row || {};
  const rowDailyBaseline = asNumber(row?.dailyBaselineClose);
  const baseDailyBaseline = asNumber(baseRow?.dailyBaselineClose);
  const rowPreviousClose = asNumber(row?.previousClose);
  const basePreviousClose = asNumber(baseRow?.previousClose);
  const dailyBaselineClose = rowDailyBaseline || baseDailyBaseline || 0;
  const previousClose = dailyBaselineClose || rowPreviousClose || basePreviousClose || 0;
  const rowDailyPnlBaseline = asNumber(row?.dailyPnlBaselineClose);
  const baseDailyPnlBaseline = asNumber(baseRow?.dailyPnlBaselineClose);
  const rowDailyPnlPrice = asNumber(row?.dailyPnlPrice);
  const baseDailyPnlPrice = asNumber(baseRow?.dailyPnlPrice);
  return {
    ...baseRow,
    ...row,
    previousClose,
    dailyBaselineClose,
    dailyBaselineDate: row?.dailyBaselineDate || baseRow?.dailyBaselineDate || '',
    dailyBaselineSource: row?.dailyBaselineSource || baseRow?.dailyBaselineSource || '',
    dailyPnlPrice: rowDailyPnlPrice || baseDailyPnlPrice || 0,
    dailyPnlPriceDate: row?.dailyPnlPriceDate || baseRow?.dailyPnlPriceDate || '',
    dailyPnlBaselineClose: rowDailyPnlBaseline || baseDailyPnlBaseline || dailyBaselineClose || previousClose || 0,
    dailyPnlBaselineDate: row?.dailyPnlBaselineDate || baseRow?.dailyPnlBaselineDate || row?.dailyBaselineDate || baseRow?.dailyBaselineDate || '',
    dailyPnlBaselineSource: row?.dailyPnlBaselineSource || baseRow?.dailyPnlBaselineSource || row?.dailyBaselineSource || baseRow?.dailyBaselineSource || '',
    dailyPnlChange: asNumber(row?.dailyPnlChange) ?? asNumber(baseRow?.dailyPnlChange) ?? null,
    dailyPnlChangePercent: asNumber(row?.dailyPnlChangePercent) ?? asNumber(baseRow?.dailyPnlChangePercent) ?? null,
    dailyPnlLocked: Boolean(row?.dailyPnlLocked || baseRow?.dailyPnlLocked),
    dailyPnlSession: row?.dailyPnlSession || baseRow?.dailyPnlSession || '',
    dailyPnlSource: row?.dailyPnlSource || baseRow?.dailyPnlSource || '',
    sessionPreviousClose: asNumber(row?.sessionPreviousClose) || asNumber(baseRow?.sessionPreviousClose) || 0,
    providerPreviousClose: asNumber(row?.providerPreviousClose) || asNumber(baseRow?.providerPreviousClose) || 0,
    change: asNumber(row?.change) ?? asNumber(baseRow?.change) ?? 0,
    changePercent: asNumber(row?.changePercent) ?? asNumber(baseRow?.changePercent) ?? 0,
    ytdChangePercent: asNumber(row?.ytdChangePercent) || asNumber(baseRow?.ytdChangePercent) || 0,
    intraday: Array.isArray(row?.intraday) && row.intraday.length > 0 ? row.intraday : (baseRow?.intraday || []),
    marketStatus: row?.marketStatus || baseRow?.marketStatus || null,
  };
}

function hasRealtimeDailyBaseline(row = {}, tick = {}) {
  const tickDailyBaselineClose = asNumber(tick?.dailyBaselineClose);
  if (tickDailyBaselineClose && tickDailyBaselineClose > 0) return true;
  const tickPreviousClose = asNumber(tick?.previousClose);
  if (tickPreviousClose && tickPreviousClose > 0) return true;
  const rowDailyBaselineClose = asNumber(row?.dailyBaselineClose);
  if (rowDailyBaselineClose && rowDailyBaselineClose > 0) return true;
  const rowPreviousClose = asNumber(row?.previousClose);
  return Boolean(rowPreviousClose && rowPreviousClose > 0);
}

function isExtendedStockRealtimeRow(row, now) {
  const status = String(row?.marketStatus || '').trim().toLowerCase();
  if (status.includes('open') || status.includes('regular')) {
    return false;
  }
  if (
    status.includes('extended')
    || status.includes('pre')
    || status.includes('post')
  ) {
    return true;
  }
  return isUsExtendedTradingHours(now);
}

function isUsExtendedTradingHours(now) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now));
    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    const weekday = getPart('weekday');
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const hour = Number(getPart('hour'));
    const minute = Number(getPart('minute'));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
    const minutes = hour * 60 + minute;
    return (minutes >= 4 * 60 && minutes < 9 * 60 + 30)
      || (minutes >= 16 * 60 && minutes < 20 * 60);
  } catch {
    return false;
  }
}

function getRealtimeTimestampMs(tick = {}) {
  const timestamp = asNumber(tick?.timestamp);
  if (timestamp && timestamp > 0) {
    return timestamp < 1_000_000_000_000 ? Math.round(timestamp * 1000) : Math.round(timestamp);
  }
  const realtimeAt = asNumber(tick?.realtimeAt);
  if (realtimeAt && realtimeAt > 0) return Math.round(realtimeAt);
  const receivedAt = asNumber(tick?.receivedAt);
  if (receivedAt && receivedAt > 0) return Math.round(receivedAt);
  return Date.now();
}

function getUsEquityRealtimeSession(row, now) {
  const status = String(row?.marketStatus || '').trim().toLowerCase();
  if (status.includes('post')) return 'post';
  if (status.includes('pre')) return 'pre';
  if (status.includes('open') || status.includes('regular')) return 'regular';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now));
    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    const weekday = getPart('weekday');
    if (weekday === 'Sat' || weekday === 'Sun') return 'closed';
    const hour = Number(getPart('hour'));
    const minute = Number(getPart('minute'));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 'closed';
    const minutes = hour * 60 + minute;
    if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return 'pre';
    if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return 'regular';
    if (minutes >= 16 * 60 && minutes < 20 * 60) return 'post';
    return 'closed';
  } catch {
    return 'closed';
  }
}

function createStockQuoteRow(row, tick, realtimeStatus) {
  const symbol = normalizeStockRealtimeSymbol(tick?.symbol) || normalizeStockRealtimeSymbol(row?.symbol);
  const price = asNumber(tick?.price) || 0;
  const tickTime = getRealtimeTimestampMs(tick);
  const previousIntraday = Array.isArray(row?.intraday) ? row.intraday : [];
  const intraday = [...previousIntraday, price].slice(-80);
  const tickDailyBaselineClose = asNumber(tick?.dailyBaselineClose);
  const tickPreviousClose = asNumber(tick?.previousClose);
  const tickChange = asNumber(tick?.change);
  const tickChangePercent = asNumber(tick?.changePercent);
  const rowDailyBaselineClose = asNumber(row?.dailyBaselineClose);
  const rowPreviousClose = asNumber(row?.previousClose);
  const hasLockedRowBaseline = rowDailyBaselineClose && rowDailyBaselineClose > 0;
  const extendedTick = isExtendedStockRealtimeRow({
    ...row,
    marketStatus: tick?.marketStatus || row?.marketStatus,
  }, tickTime);
  const fallbackPreviousClose = extendedTick
    ? (rowPreviousClose && rowPreviousClose > 0 ? rowPreviousClose : tickPreviousClose)
    : (tickPreviousClose && tickPreviousClose > 0 ? tickPreviousClose : rowPreviousClose);
  const previousClose = hasLockedRowBaseline
    ? rowDailyBaselineClose
    : (tickDailyBaselineClose && tickDailyBaselineClose > 0
      ? tickDailyBaselineClose
      : (fallbackPreviousClose && fallbackPreviousClose > 0 ? fallbackPreviousClose : null));
  const change = previousClose && previousClose > 0
    ? price - previousClose
    : (tickChange ?? asNumber(row?.change) ?? 0);
  const changePercent = previousClose && previousClose > 0
    ? ((price - previousClose) / previousClose) * 100
    : (tickChangePercent ?? asNumber(row?.changePercent) ?? 0);
  const rowDailyPnlPrice = asNumber(row?.dailyPnlPrice);
  const rowDailyPnlBaselineClose = asNumber(row?.dailyPnlBaselineClose);
  const dailyPnlBaselineClose = rowDailyPnlBaselineClose || previousClose || 0;
  const dailyPnlSession = getUsEquityRealtimeSession({
    ...row,
    marketStatus: tick?.marketStatus || row?.marketStatus,
  }, tickTime);
  const shouldRealtimeUpdateDailyPnl = dailyPnlSession === 'pre' || dailyPnlSession === 'regular';
  const lockedDailyPnlPrice = rowDailyPnlPrice
    || asNumber(row?.providerPreviousClose)
    || asNumber(row?.sessionPreviousClose)
    || tickPreviousClose
    || 0;
  const dailyPnlPrice = shouldRealtimeUpdateDailyPnl ? price : lockedDailyPnlPrice;
  const dailyPnlLocked = !shouldRealtimeUpdateDailyPnl && Boolean(dailyPnlPrice);
  const hasDailyPnl = dailyPnlPrice && dailyPnlPrice > 0 && dailyPnlBaselineClose && dailyPnlBaselineClose > 0;
  const dailyPnlChange = hasDailyPnl ? dailyPnlPrice - dailyPnlBaselineClose : null;
  const dailyPnlChangePercent = hasDailyPnl ? (dailyPnlChange / dailyPnlBaselineClose) * 100 : null;
  const high = Math.max(
    asNumber(row?.high) || 0,
    asNumber(row?.week52High) || 0,
    price,
  );

  return {
    ...row,
    symbol,
    price,
    high,
    week52High: Math.max(asNumber(row?.week52High) || 0, high),
    intraday,
    previousClose: previousClose || row?.previousClose || 0,
    dailyBaselineClose: previousClose || row?.dailyBaselineClose || 0,
    dailyBaselineDate: row?.dailyBaselineDate || tick?.dailyBaselineDate || '',
    dailyBaselineSource: row?.dailyBaselineSource || tick?.dailyBaselineSource || '',
    dailyPnlPrice: dailyPnlPrice || 0,
    dailyPnlPriceDate: row?.dailyPnlPriceDate || tick?.dailyPnlPriceDate || '',
    dailyPnlBaselineClose,
    dailyPnlBaselineDate: row?.dailyPnlBaselineDate || row?.dailyBaselineDate || tick?.dailyPnlBaselineDate || '',
    dailyPnlBaselineSource: row?.dailyPnlBaselineSource || row?.dailyBaselineSource || tick?.dailyPnlBaselineSource || '',
    dailyPnlChange,
    dailyPnlChangePercent,
    dailyPnlLocked,
    dailyPnlSession,
    dailyPnlSource: shouldRealtimeUpdateDailyPnl ? 'realtime-tick' : (row?.dailyPnlSource || 'locked-regular-close'),
    sessionPreviousClose: asNumber(tick?.sessionPreviousClose) || asNumber(row?.sessionPreviousClose) || tickPreviousClose || 0,
    providerPreviousClose: asNumber(tick?.providerPreviousClose) || asNumber(row?.providerPreviousClose) || tickPreviousClose || 0,
    change,
    changePercent,
    source: tick?.source || 'EODHD_WS',
    priceType: tick?.priceType || row?.priceType || '',
    realtime: tick?.source === 'EODHD_WS' || tick?.source === 'EODHD_WS_QUOTE' || realtimeStatus === 'live',
    realtimeStatus,
    realtimeAt: tickTime,
    clientReceivedAt: normalizeTimestampMs(tick?.clientReceivedAt) || normalizeTimestampMs(tick?.receivedAt) || Date.now(),
    marketStatus: tick?.marketStatus || row?.marketStatus || null,
  };
}
