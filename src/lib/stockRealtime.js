import { normalizeUserStockSymbol } from './symbols.js';

const MAX_STOCK_REALTIME_SYMBOLS = 50;
const STOCK_REALTIME_ROW_MAX_AGE_MS = 120_000;
const STOCK_REALTIME_EXTENDED_ROW_MAX_AGE_MS = 5 * 60_000;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStockRealtimeSymbol(value) {
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

export function buildStockRealtimeSymbolsKey(symbols = []) {
  return [...new Set(
    (symbols || []).map(normalizeStockRealtimeSymbol).filter(Boolean),
  )].sort().join(',');
}

export function canStartStockRealtime({
  cloudLoading = true,
  symbols = [],
} = {}) {
  if (!cloudLoading) return true;
  return (symbols || []).some((symbol) => Boolean(normalizeStockRealtimeSymbol(symbol)));
}

export function shouldPollStockRealtimeSnapshot({
  lastWebSocketTickAt = 0,
  lastWebSocketTickAtBySymbol = null,
  symbols = [],
  now = Date.now(),
  staleMs = 15_000,
  freshnessFloorAt = 0,
} = {}) {
  const checkedAt = asNumber(now) || Date.now();
  const maxAgeMs = Math.max(0, asNumber(staleMs) || 0);
  const freshnessFloor = Math.max(0, asNumber(freshnessFloorAt) || 0);
  const isStale = (value) => {
    const tickAt = asNumber(value);
    if (!tickAt || tickAt <= 0) return true;
    if (freshnessFloor > 0 && tickAt < freshnessFloor) return true;
    if (tickAt - checkedAt > 60_000) return true;
    return checkedAt - tickAt >= maxAgeMs;
  };
  const normalizedSymbols = [...new Set(
    (symbols || []).map(normalizeStockRealtimeSymbol).filter(Boolean),
  )];
  if (normalizedSymbols.length > 0 && lastWebSocketTickAtBySymbol) {
    const readTickAt = lastWebSocketTickAtBySymbol instanceof Map
      ? (symbol) => lastWebSocketTickAtBySymbol.get(symbol)
      : (symbol) => lastWebSocketTickAtBySymbol[symbol];
    return normalizedSymbols.some((symbol) => isStale(readTickAt(symbol)));
  }
  return isStale(lastWebSocketTickAt);
}

export function shouldApplyStockSnapshotTick({
  snapshotRequestedAt = 0,
  webSocketReceivedAt = 0,
} = {}) {
  const requestedAt = asNumber(snapshotRequestedAt);
  const receivedAt = asNumber(webSocketReceivedAt);
  if (!requestedAt || requestedAt <= 0 || !receivedAt || receivedAt <= 0) return true;
  return receivedAt < requestedAt;
}

export function mergeStockSnapshotPollRequest(current, incoming = {}) {
  const next = incoming && typeof incoming === 'object' ? incoming : {};
  const previous = current && typeof current === 'object' ? current : null;
  if (!previous) {
    return {
      trigger: next.trigger || 'auto-ios-pwa-snapshot-trailing',
      force: next.force === true,
      warm: next.warm === true,
      resetFreshness: next.resetFreshness !== false,
    };
  }
  return {
    trigger: next.trigger || previous.trigger || 'auto-ios-pwa-snapshot-trailing',
    force: previous.force === true || next.force === true,
    warm: previous.warm === true || next.warm === true,
    // The latest lifecycle event owns freshness semantics. A touch/focus request
    // must not inherit an earlier resume reset and hide already-rendered prices.
    resetFreshness: next.resetFreshness !== false,
  };
}

export function applyStockTickToQuoteRows(rows = [], tick, realtimeStatus = 'live', baseRows = [], { now = Date.now() } = {}) {
  const symbol = normalizeStockRealtimeSymbol(tick?.symbol || tick?.ticker || tick?.displaySymbol);
  const price = asNumber(tick?.price);
  if (!symbol || !price || price <= 0) return rows;
  const baseRow = findStockRealtimeRow(baseRows, symbol);

  let found = false;
  const nextRows = (rows || []).map((row) => {
    if (normalizeStockRealtimeSymbol(row?.symbol) !== symbol) return row;
    found = true;
    if (!shouldAcceptStockRealtimeTick(row, tick, { now })) return row;
    const baseline = mergeQuoteBaseline(row, baseRow);
    if (!hasRealtimeDailyBaseline(baseline, tick)) return row;
    return createStockQuoteRow(baseline, { ...tick, symbol }, realtimeStatus, now);
  });

  if (found) return nextRows;

  if (!baseRow) return nextRows;
  if (!shouldAcceptStockRealtimeTick(baseRow, tick, { now })) return nextRows;
  if (!hasRealtimeDailyBaseline(baseRow, tick)) return nextRows;
  return [...nextRows, createStockQuoteRow(baseRow, { ...tick, symbol }, realtimeStatus, now)];
}

export function mergeStockTicksIntoQuoteRows(rows = [], ticks = [], realtimeStatus = 'live', baseRows = [], options = {}) {
  let next = rows;
  for (const tick of ticks || []) {
    next = applyStockTickToQuoteRows(next, tick, realtimeStatus, baseRows, options);
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
    // Dated baselines and completed closes are not expiring live ticks. Keep
    // the newer facts even when REST returns late or the live price has aged.
    if (symbol) {
      next = next.map(candidate => normalizeStockRealtimeSymbol(candidate?.symbol) === symbol
        ? mergeDatedQuoteFacts(candidate, row) : candidate);
    }
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
    next = applyStockTickToQuoteRows(next, { ...row, timestamp: row.realtimeAt || row.timestamp }, row?.realtimeStatus || 'live', rows, { now });
  }
  // A session boundary still applies when no new tick is eligible. In
  // particular, the positive-value REST merge must not freeze a live price
  // as a close when the provider explicitly has no confirmed close yet.
  return next.map(row => restoreCompletedDailyPnl(row, now));
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

function mergeDatedQuoteFacts(row = {}, baseRow = null) {
  if (!baseRow) return row || {};
  // Quote prices and completed-close facts have separate lifetimes. Select the
  // dated baseline as a bundle so an old cache cannot resurrect yesterday's
  // previous-close denominator after a new REST baseline has arrived.
  const completedDailyPnl = latestCompletedDailyPnl(row, baseRow);
  const rowBaselineDate = row?.dailyBaselineDate || row?.dailyPnlBaselineDate || '';
  const baseBaselineDate = baseRow?.dailyBaselineDate || baseRow?.dailyPnlBaselineDate || '';
  if (baseBaselineDate && baseBaselineDate > rowBaselineDate) {
    row = { ...row };
    for (const key of [
      'previousClose', 'dailyBaselineClose', 'dailyBaselineDate', 'dailyBaselineSource',
      'dailyPnlBaselineClose', 'dailyPnlBaselineDate', 'dailyPnlBaselineSource',
      'sessionPreviousClose', 'providerPreviousClose',
    ]) row[key] = baseRow[key];
    // A newer denominator is durable; its cached live price is not. Keep the
    // chosen quote's price and lock state, then recalculate against that base.
    const baseline = asNumber(row.dailyPnlBaselineClose);
    const price = asNumber(row.dailyPnlPrice);
    row.dailyPnlChange = price > 0 && baseline > 0 ? price - baseline : null;
    row.dailyPnlChangePercent = row.dailyPnlChange === null ? null : row.dailyPnlChange / baseline * 100;
  }
  return completedDailyPnl ? { ...row, completedDailyPnl } : row;
}

function mergeQuoteBaseline(row = {}, baseRow = null) {
  if (!baseRow) return row || {};
  row = mergeDatedQuoteFacts(row, baseRow);
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
    dailyPnlLocked: typeof row?.dailyPnlLocked === 'boolean' ? row.dailyPnlLocked : Boolean(baseRow?.dailyPnlLocked),
    dailyPnlSession: row?.dailyPnlSession || baseRow?.dailyPnlSession || '',
    dailyPnlSource: row?.dailyPnlSource || baseRow?.dailyPnlSource || '',
    sessionPreviousClose: asNumber(row?.sessionPreviousClose) || asNumber(baseRow?.sessionPreviousClose) || 0,
    providerPreviousClose: asNumber(row?.providerPreviousClose) || asNumber(baseRow?.providerPreviousClose) || 0,
    change: asNumber(row?.change) ?? asNumber(baseRow?.change) ?? 0,
    changePercent: asNumber(row?.changePercent) ?? asNumber(baseRow?.changePercent) ?? 0,
    ytdChangePercent: asNumber(row?.ytdChangePercent) || asNumber(baseRow?.ytdChangePercent) || 0,
    intraday: Array.isArray(row?.intraday) && row.intraday.length > 0 ? row.intraday : (baseRow?.intraday || []),
    marketStatus: row?.marketStatus || baseRow?.marketStatus || null,
    completedDailyPnl: latestCompletedDailyPnl(row, baseRow),
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
  const session = getUsEquityRealtimeSession(row, now);
  return session === 'pre' || session === 'post';
}

function getRealtimeTimestampMs(tick = {}, fallback = Date.now()) {
  const timestamp = asNumber(tick?.timestamp);
  if (timestamp && timestamp > 0) {
    return timestamp < 1_000_000_000_000 ? Math.round(timestamp * 1000) : Math.round(timestamp);
  }
  const realtimeAt = asNumber(tick?.realtimeAt);
  if (realtimeAt && realtimeAt > 0) return Math.round(realtimeAt);
  const receivedAt = asNumber(tick?.receivedAt);
  if (receivedAt && receivedAt > 0) return Math.round(receivedAt);
  return fallback;
}

// Match the existing REST clock, not a provider message's historical trade
// session. A late trade or a switch between trade/quote streams is not a clock.
export function getUsEquityRealtimeSession(_row, now = Date.now()) {
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

function marketDateAt(now) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(now));
    const part = type => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch { return ''; }
}

export function shouldAcceptStockRealtimeTick(row = {}, tick = {}, { now = Date.now() } = {}) {
  if (!Number.isFinite(now) || now <= 0) return false;
  if (!(asNumber(tick?.price) > 0)) return false;
  const tickTime = getRealtimeTimestampMs(tick, now);
  const session = getUsEquityRealtimeSession(null, now);
  const maxAge = session === 'pre' || session === 'post'
    ? STOCK_REALTIME_EXTENDED_ROW_MAX_AGE_MS : STOCK_REALTIME_ROW_MAX_AGE_MS;
  if (now - tickTime > maxAge || tickTime - now > 60_000) return false;
  if (marketDateAt(tickTime) !== marketDateAt(now)) return false;
  // Do not bootstrap a newly opened session with a tick from the prior one.
  if (getUsEquityRealtimeSession(null, tickTime) !== session) return false;
  const previousTickTime = normalizeTimestampMs(row?.realtimeAt);
  return !previousTickTime || tickTime >= previousTickTime;
}

function completedDailyPnlFrom(row = {}) {
  const stored = row.completedDailyPnl;
  const source = String(row.dailyPnlSource || '');
  const official = ['locked-provider-regular-close', 'locked-eod-regular-close', 'locked-latest-eod-close', 'eodhd-adjusted-close', 'eodhd-close'].includes(source);
  const current = row.dailyPnlLocked && official ? {
    price: Number(row.dailyPnlPrice), date: row.dailyPnlPriceDate, source,
    baselineClose: Number(row.dailyPnlBaselineClose) || 0,
    baselineDate: row.dailyPnlBaselineDate || '', baselineSource: row.dailyPnlBaselineSource || '',
  } : null;
  return [current, stored].filter(item => item && Number.isFinite(item.price) && item.price > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '')).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function latestCompletedDailyPnl(...rows) {
  return rows.reverse().map(completedDailyPnlFrom).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function needsSameDayClose(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const weekday = parts.find(part => part.type === 'weekday')?.value;
  return weekday !== 'Sat' && weekday !== 'Sun' && Number(parts.find(part => part.type === 'hour')?.value) >= 16;
}

function completedCloseAt(row, now) {
  const completed = latestCompletedDailyPnl(row);
  const date = marketDateAt(now);
  return completed && completed.date <= date && (!needsSameDayClose(now) || completed.date === date) ? completed : null;
}

function restoreCompletedDailyPnl(row, now) {
  const session = getUsEquityRealtimeSession(null, now);
  if (session === 'pre' || session === 'regular') return row;
  const close = completedCloseAt(row, now);
  if (!close) return { ...row, dailyPnlPrice: 0, dailyPnlPriceDate: '',
    dailyPnlChange: null, dailyPnlChangePercent: null,
    dailyPnlSession: session, dailyPnlLocked: true, dailyPnlSource: 'unavailable' };
  const change = close.baselineClose > 0 ? close.price - close.baselineClose : null;
  return { ...row, dailyPnlPrice: close.price, dailyPnlPriceDate: close.date,
    dailyPnlBaselineClose: close.baselineClose, dailyPnlBaselineDate: close.baselineDate,
    dailyPnlBaselineSource: close.baselineSource, dailyPnlSource: close.source,
    dailyPnlSession: session, dailyPnlLocked: true, dailyPnlChange: change,
    dailyPnlChangePercent: change === null ? null : change / close.baselineClose * 100 };
}

function createStockQuoteRow(row, tick, realtimeStatus, now) {
  const symbol = normalizeStockRealtimeSymbol(tick?.symbol) || normalizeStockRealtimeSymbol(row?.symbol);
  const price = asNumber(tick?.price) || 0;
  const tickTime = getRealtimeTimestampMs(tick, now);
  const dailyPnlSession = getUsEquityRealtimeSession(null, now);
  const marketDate = marketDateAt(now);
  const shouldRealtimeUpdateDailyPnl = dailyPnlSession === 'pre' || dailyPnlSession === 'regular';
  const completedDailyPnl = latestCompletedDailyPnl(row);
  // The prior session's confirmed close becomes this session's denominator,
  // even when its fresh tick beats the first scheduled REST response.
  if (shouldRealtimeUpdateDailyPnl && completedDailyPnl?.date < marketDate
      && completedDailyPnl.date > (row.dailyBaselineDate || row.dailyPnlBaselineDate || '')) {
    row = { ...row, previousClose: completedDailyPnl.price, dailyBaselineClose: completedDailyPnl.price,
      dailyBaselineDate: completedDailyPnl.date, dailyBaselineSource: completedDailyPnl.source,
      dailyPnlBaselineClose: completedDailyPnl.price, dailyPnlBaselineDate: completedDailyPnl.date,
      dailyPnlBaselineSource: completedDailyPnl.source };
  }
  const previousIntraday = Array.isArray(row?.intraday) ? row.intraday : [];
  const intraday = [...previousIntraday, price].slice(-80);
  const tickDailyBaselineClose = asNumber(tick?.dailyBaselineClose);
  const tickPreviousClose = asNumber(tick?.previousClose);
  const tickChange = asNumber(tick?.change);
  const tickChangePercent = asNumber(tick?.changePercent);
  const rowDailyBaselineClose = asNumber(row?.dailyBaselineClose);
  const rowPreviousClose = asNumber(row?.previousClose);
  const hasLockedRowBaseline = rowDailyBaselineClose && rowDailyBaselineClose > 0;
  const extendedTick = dailyPnlSession === 'pre' || dailyPnlSession === 'post';
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
  const rowDailyPnlBaselineClose = asNumber(row?.dailyPnlBaselineClose);
  const lockedClose = completedCloseAt(row, now);
  const dailyPnlBaselineClose = shouldRealtimeUpdateDailyPnl
    ? (rowDailyPnlBaselineClose || previousClose || 0) : (lockedClose?.baselineClose || 0);
  const dailyPnlPrice = shouldRealtimeUpdateDailyPnl ? price : (lockedClose?.price || 0);
  const dailyPnlLocked = !shouldRealtimeUpdateDailyPnl;
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
    dailyPnlPriceDate: shouldRealtimeUpdateDailyPnl ? marketDate : (lockedClose?.date || ''),
    dailyPnlBaselineClose,
    dailyPnlBaselineDate: shouldRealtimeUpdateDailyPnl ? (row?.dailyPnlBaselineDate || row?.dailyBaselineDate || '') : (lockedClose?.baselineDate || ''),
    dailyPnlBaselineSource: shouldRealtimeUpdateDailyPnl ? (row?.dailyPnlBaselineSource || row?.dailyBaselineSource || '') : (lockedClose?.baselineSource || ''),
    dailyPnlChange,
    dailyPnlChangePercent,
    dailyPnlLocked,
    dailyPnlSession,
    dailyPnlSource: shouldRealtimeUpdateDailyPnl ? 'realtime-tick' : (lockedClose?.source || 'unavailable'),
    completedDailyPnl,
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
