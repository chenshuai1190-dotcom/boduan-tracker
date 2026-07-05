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

  let found = false;
  const nextRows = (rows || []).map((row) => {
    if (normalizeStockRealtimeSymbol(row?.symbol) !== symbol) return row;
    found = true;
    return createStockQuoteRow(row, { ...tick, symbol }, realtimeStatus);
  });

  if (found) return nextRows;

  const baseRow = (baseRows || []).find((row) => normalizeStockRealtimeSymbol(row?.symbol) === symbol);
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

function createStockQuoteRow(row, tick, realtimeStatus) {
  const symbol = normalizeStockRealtimeSymbol(tick?.symbol) || normalizeStockRealtimeSymbol(row?.symbol);
  const price = asNumber(tick?.price) || 0;
  const previousIntraday = Array.isArray(row?.intraday) ? row.intraday : [];
  const intraday = [...previousIntraday, price].slice(-80);
  const tickPreviousClose = asNumber(tick?.previousClose);
  const tickChange = asNumber(tick?.change);
  const tickChangePercent = asNumber(tick?.changePercent);
  const previousClose = tickPreviousClose && tickPreviousClose > 0
    ? tickPreviousClose
    : (tickChange !== null && price - tickChange > 0 ? price - tickChange : asNumber(row?.previousClose));
  const change = tickChange !== null
    ? tickChange
    : (previousClose && previousClose > 0 ? price - previousClose : (asNumber(row?.change) ?? 0));
  const changePercent = tickChangePercent !== null
    ? tickChangePercent
    : (previousClose && previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : (asNumber(row?.changePercent) ?? 0));
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
  };
}
