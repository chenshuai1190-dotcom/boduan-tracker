export const MAX_STOCK_REALTIME_SYMBOLS = 50;
const STOCK_REALTIME_SYMBOL_RE = /^[A-Z0-9._-]{1,15}$/;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeStockRealtimeSymbol(value) {
  const upper = String(value || '').trim().toUpperCase();
  const withoutUsSuffix = upper.endsWith('.US') ? upper.slice(0, -3) : upper;
  return STOCK_REALTIME_SYMBOL_RE.test(withoutUsSuffix) ? withoutUsSuffix : '';
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
    return createStockQuoteRow(mergeQuoteBaseline(row, baseRow), { ...tick, symbol }, realtimeStatus);
  });

  if (found) return nextRows;

  if (!baseRow) return nextRows;
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
  maxAgeMs = 120_000,
  extendedMaxAgeMs = 30 * 60_000,
  now = Date.now(),
} = {}) {
  let next = rows || [];
  for (const row of realtimeRows || []) {
    const symbol = normalizeStockRealtimeSymbol(row?.symbol);
    const price = asNumber(row?.price);
    const realtimeAt = asNumber(row?.realtimeAt);
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

function findStockRealtimeRow(rows = [], symbol) {
  return (rows || []).find((row) => normalizeStockRealtimeSymbol(row?.symbol) === symbol) || null;
}

function mergeQuoteBaseline(row = {}, baseRow = null) {
  if (!baseRow) return row || {};
  return {
    ...baseRow,
    ...row,
    previousClose: asNumber(row?.previousClose) || asNumber(baseRow?.previousClose) || 0,
    change: asNumber(row?.change) ?? asNumber(baseRow?.change) ?? 0,
    changePercent: asNumber(row?.changePercent) ?? asNumber(baseRow?.changePercent) ?? 0,
    ytdChangePercent: asNumber(row?.ytdChangePercent) || asNumber(baseRow?.ytdChangePercent) || 0,
    intraday: Array.isArray(row?.intraday) && row.intraday.length > 0 ? row.intraday : (baseRow?.intraday || []),
    marketStatus: row?.marketStatus || baseRow?.marketStatus || null,
  };
}

function isExtendedStockRealtimeRow(row, now) {
  const status = String(row?.marketStatus || '').trim().toLowerCase();
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

function createStockQuoteRow(row, tick, realtimeStatus) {
  const symbol = normalizeStockRealtimeSymbol(tick?.symbol) || normalizeStockRealtimeSymbol(row?.symbol);
  const price = asNumber(tick?.price) || 0;
  const previousIntraday = Array.isArray(row?.intraday) ? row.intraday : [];
  const intraday = [...previousIntraday, price].slice(-80);
  const tickPreviousClose = asNumber(tick?.previousClose);
  const tickChange = asNumber(tick?.change);
  const tickChangePercent = asNumber(tick?.changePercent);
  const rowPreviousClose = asNumber(row?.previousClose);
  const previousClose = tickPreviousClose && tickPreviousClose > 0
    ? tickPreviousClose
    : (rowPreviousClose && rowPreviousClose > 0 ? rowPreviousClose : null);
  const change = previousClose && previousClose > 0
    ? price - previousClose
    : (tickChange ?? asNumber(row?.change) ?? 0);
  const changePercent = previousClose && previousClose > 0
    ? ((price - previousClose) / previousClose) * 100
    : (tickChangePercent ?? asNumber(row?.changePercent) ?? 0);
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
    change,
    changePercent,
    source: tick?.source || 'EODHD_WS',
    realtime: tick?.source === 'EODHD_WS' || realtimeStatus === 'live',
    realtimeStatus,
    realtimeAt: tick?.timestamp || tick?.receivedAt || Date.now(),
    marketStatus: tick?.marketStatus || row?.marketStatus || null,
  };
}
