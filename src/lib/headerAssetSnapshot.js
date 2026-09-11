import { deriveInvestmentSummary, derivePositionsFromTrades } from './investmentSummary.js';
import { currentNewYorkDate, latestCompletedUsTradingDate } from './pnlReportSnapshots.js';
import { isRegularNyseHoliday, QUOTE_BASELINE_REFRESH_INTERVAL_MS } from './quoteRefreshPolicy.js';
import { getUsEquityRealtimeSession, shouldAcceptStockRealtimeTick } from './stockRealtime.js';
import { normalizeUserStockSymbol } from './symbols.js';

const SCHEMA_VERSION = 1;
const STORAGE_PREFIX = 'boduan.header-assets.v1:';
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const OFFICIAL_CLOSE_SOURCES = new Set([
  'locked-provider-regular-close', 'locked-eod-regular-close', 'locked-latest-eod-close',
  'eodhd-adjusted-close', 'eodhd-close',
]);
const RUNTIME_SOURCES = new Set(['EODHD_WS', 'EODHD_WS_QUOTE']);
const SUMMARY_FIELDS = [
  'cashUsd', 'positionsMarketValue', 'totalAssetsUsd', 'totalAssetsCny', 'usdRate',
  'todayPnl', 'todayPnlPct', 'hasTodayPnl', 'todayPnlLocked', 'todayPnlUnavailableCount',
  'realizedPnl', 'unrealizedPnl', 'holdingPnl', 'holdingReturnCostBasis', 'holdingPnlPct',
  'cumulativePnl', 'cumulativePnlPct', 'holdingStockCount', 'sellTradeCount', 'tradeCount',
  'totalBuyCost', 'remainingCost', 'returnCostBasis',
];
const QUOTE_FIELDS = [
  'symbol', 'price', 'source', 'timestamp', 'realtimeAt', 'headerReceivedAt',
  'dailyBaselineClose', 'dailyBaselineDate', 'dailyBaselineSource',
  'dailyPnlPrice', 'dailyPnlPriceDate', 'dailyPnlBaselineClose', 'dailyPnlBaselineDate',
  'dailyPnlBaselineSource', 'dailyPnlLocked', 'dailyPnlSession', 'dailyPnlSource',
];

function finite(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value));
}

function timestamp(value) {
  if (!finite(value) || Number(value) <= 0) return 0;
  return Number(value) < 1e12 ? Number(value) * 1000 : Number(value);
}

function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function tradingDate(date) {
  return validDate(date) && ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())
    && !isRegularNyseHoliday(date);
}

function priorTradingDate(date) {
  const cursor = new Date(`${date}T00:00:00Z`);
  do { cursor.setUTCDate(cursor.getUTCDate() - 1); } while (!tradingDate(cursor.toISOString().slice(0, 10)));
  return cursor.toISOString().slice(0, 10);
}

export function headerAssetSessionContext(now = Date.now()) {
  if (!finite(now) || Number(now) <= 0) return null;
  const date = currentNewYorkDate(Number(now));
  if (!validDate(date)) return null;
  const session = tradingDate(date) ? getUsEquityRealtimeSession(null, Number(now)) : 'closed';
  let closeDate = latestCompletedUsTradingDate(Number(now));
  if (!tradingDate(closeDate)) closeDate = priorTradingDate(closeDate);
  const live = session === 'pre' || session === 'regular';
  return { session, date, closeDate, live,
    baselineDate: live ? closeDate : priorTradingDate(closeDate),
    sessionKey: live ? `${session}:${date}` : `close:${closeDate}` };
}

export function headerAssetSessionKey(now = Date.now()) {
  return headerAssetSessionContext(now)?.sessionKey || '';
}

// Canonical object keys permit harmless serialization changes. Ledger ordering
// follows the existing formula, retaining input order for equal date/id keys.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

export function headerAssetBasisKey({ userId, stockTrades, cashUsd, marginDebtUsd, usdRate } = {}) {
  if (!userId || !Array.isArray(stockTrades) || !finite(cashUsd) || !finite(marginDebtUsd)
      || Number(marginDebtUsd) < 0 || !finite(usdRate) || Number(usdRate) <= 0) return '';
  try {
    const ledger = [...stockTrades].sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || ''))
      || (finite(a?.id) ? Number(a.id) : 0) - (finite(b?.id) ? Number(b.id) : 0));
    if (ledger.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return '';
    return JSON.stringify(canonical({ userId: String(userId), stockTrades: ledger,
      cashUsd: Number(cashUsd), marginDebtUsd: Number(marginDebtUsd), usdRate: Number(usdRate) }));
  } catch { return ''; }
}

function positive(value) { return finite(value) && Number(value) > 0; }

function validBaseline(row, context) {
  return positive(row.dailyPnlBaselineClose)
    && row.dailyPnlBaselineDate === context.baselineDate
    && OFFICIAL_CLOSE_SOURCES.has(row.dailyPnlBaselineSource);
}

function quoteTime(row) { return timestamp(row.realtimeAt) || timestamp(row.timestamp); }

function verifiedQuote(row, context, now, rest = false) {
  if (!row || row.error || !normalizeUserStockSymbol(row.symbol) || !validBaseline(row, context)) return null;
  const official = row.source === 'EODHD' || RUNTIME_SOURCES.has(row.source);
  if (!official || !positive(row.dailyPnlPrice)) return null;
  if (!context.live) {
    if (row.dailyPnlLocked !== true || row.dailyPnlPriceDate !== context.closeDate
        || !OFFICIAL_CLOSE_SOURCES.has(row.dailyPnlSource)
        || !['post', 'closed'].includes(row.dailyPnlSession)) return null;
  } else {
    if (row.dailyPnlLocked !== false || row.dailyPnlSession !== context.session
        || !positive(row.price) || Number(row.dailyPnlPrice) !== Number(row.price)) return null;
    const priceTime = quoteTime(row);
    if (!priceTime || priceTime > now + 60_000 || currentNewYorkDate(priceTime) !== context.date
        || getUsEquityRealtimeSession(null, priceTime) !== context.session) return null;
    if (rest) {
      const receivedAt = timestamp(row.headerReceivedAt);
      const maxAge = context.session === 'pre'
        ? QUOTE_BASELINE_REFRESH_INTERVAL_MS.premarket : QUOTE_BASELINE_REFRESH_INTERVAL_MS.regular;
      if (row.source !== 'EODHD' || row.dailyPnlSource !== `realtime-${context.session}`
          || !receivedAt || receivedAt > now + 60_000 || now - receivedAt > maxAge
          || now - priceTime > maxAge || currentNewYorkDate(receivedAt) !== context.date
          || getUsEquityRealtimeSession(null, receivedAt) !== context.session
          || (row.dailyPnlPriceDate && row.dailyPnlPriceDate !== context.date)) return null;
    } else if (!RUNTIME_SOURCES.has(row.source) || row.dailyPnlSource !== 'realtime-tick'
        || row.dailyPnlPriceDate !== context.date
        || !shouldAcceptStockRealtimeTick({}, { ...row, timestamp: priceTime }, { now })) return null;
  }
  const quote = Object.fromEntries(QUOTE_FIELDS.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
  return { ...quote, symbol: normalizeUserStockSymbol(row.symbol),
    price: Number(context.live ? row.price : row.dailyPnlPrice),
    dailyPnlPrice: Number(row.dailyPnlPrice), dailyPnlBaselineClose: Number(row.dailyPnlBaselineClose),
    dailyPnlSession: context.session };
}

function quoteCandidates(rows, context, now, rest) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const quote = verifiedQuote(row, context, now, rest);
    if (!quote) continue;
    const old = result.get(quote.symbol);
    if (!old || quoteTime(quote) >= quoteTime(old)) result.set(quote.symbol, quote);
  }
  return result;
}

export function buildHeaderAssetSnapshot({ userId, stockTrades, cashUsd, marginDebtUsd, usdRate,
  ready = false, quoteRows = [], baselineRows = [], now = Date.now() } = {}) {
  const basisKey = headerAssetBasisKey({ userId, stockTrades, cashUsd, marginDebtUsd, usdRate });
  const context = headerAssetSessionContext(now);
  if (ready !== true || !basisKey || !context) return null;
  const active = derivePositionsFromTrades(stockTrades).filter(position => position.heldShares > 0);
  const runtime = quoteCandidates(quoteRows, context, Number(now), false);
  const rest = quoteCandidates(baselineRows, context, Number(now), true);
  const quotes = [];
  for (const position of active) {
    const liveRow = runtime.get(position.symbol);
    const restRow = rest.get(position.symbol);
    const quote = liveRow && (!restRow || quoteTime(liveRow) >= quoteTime(restRow)) ? liveRow : restRow;
    if (!quote) return null;
    quotes.push(quote);
  }
  const derived = deriveInvestmentSummary({ stockTrades, watchlist: quotes, cashUsd, usdRate });
  const summary = Object.fromEntries(SUMMARY_FIELDS.map(key => [key, derived[key]]));
  if (Object.values(summary).some(value => typeof value === 'number' && !Number.isFinite(value))) return null;
  return { schema: 'header-asset-snapshot', version: SCHEMA_VERSION, userId: String(userId), basisKey,
    verifiedAt: Number(now), sessionKey: context.sessionKey, closeDate: context.live ? null : context.closeDate,
    summary, marginDebtUsd: Number(marginDebtUsd), quotes };
}

function availableStorage(storage) {
  try { return storage !== undefined ? storage : globalThis.localStorage || null; } catch { return null; }
}

function snapshotMatches(snapshot, basisKey, sessionKey) {
  return snapshot?.schema === 'header-asset-snapshot' && snapshot.version === SCHEMA_VERSION
    && snapshot.basisKey === basisKey && snapshot.sessionKey === sessionKey
    && snapshot.summary && Array.isArray(snapshot.quotes);
}

function evidenceTime(quote, closed) {
  return closed ? Math.max(timestamp(quote.headerReceivedAt), quoteTime(quote)) : quoteTime(quote);
}

// A complete header is an atomic display unit. A stale REST result must not
// replace a newer tick for even one holding; a lower price with a newer time is
// a valid market movement and is accepted normally.
export function selectHeaderAssetSnapshot({ candidate, previous, restored, basisKey, sessionKey, ready = false } = {}) {
  if (ready !== true || !basisKey || !sessionKey) return null;
  const retained = [previous, restored].find(snapshot => snapshotMatches(snapshot, basisKey, sessionKey)) || null;
  if (!snapshotMatches(candidate, basisKey, sessionKey)) return retained;
  if (!retained) return candidate;
  const oldQuotes = new Map(retained.quotes.map(quote => [quote.symbol, quote]));
  if (oldQuotes.size !== candidate.quotes.length) return retained;
  for (const quote of candidate.quotes) {
    const old = oldQuotes.get(quote.symbol);
    if (!old) return retained;
    const time = evidenceTime(quote, Boolean(candidate.closeDate));
    const oldTime = evidenceTime(old, Boolean(retained.closeDate));
    if (time < oldTime || (time === oldTime && (
      Number(quote.dailyPnlPrice) !== Number(old.dailyPnlPrice)
      || Number(quote.dailyPnlBaselineClose) !== Number(old.dailyPnlBaselineClose)
      || quote.dailyPnlPriceDate !== old.dailyPnlPriceDate
      || quote.dailyPnlBaselineDate !== old.dailyPnlBaselineDate
    ))) return retained;
  }
  return candidate;
}

export function writeHeaderAssetSnapshot({ snapshot, storage, now = Date.now() } = {}) {
  const context = headerAssetSessionContext(now);
  const verifiedContext = headerAssetSessionContext(snapshot?.verifiedAt);
  if (!context || context.live || !snapshot || snapshot.schema !== 'header-asset-snapshot'
      || snapshot.version !== SCHEMA_VERSION || !snapshot.userId || !snapshot.basisKey
      || snapshot.closeDate !== context.closeDate || snapshot.sessionKey !== context.sessionKey
      || !verifiedContext || verifiedContext.live || verifiedContext.sessionKey !== context.sessionKey
      || !finite(snapshot.verifiedAt) || snapshot.verifiedAt > Number(now) + 60_000
      || Number(now) - snapshot.verifiedAt > MAX_CACHE_AGE_MS || !Array.isArray(snapshot.quotes)
      || snapshot.quotes.some(row => !verifiedQuote(row, context, Number(now)))) return false;
  try {
    const target = availableStorage(storage);
    if (!target) return false;
    target.setItem(`${STORAGE_PREFIX}${snapshot.userId}`, JSON.stringify(snapshot));
    return true;
  } catch { return false; }
}

export function readHeaderAssetSnapshot({ userId, stockTrades, cashUsd, marginDebtUsd, usdRate,
  ready = false, storage, now = Date.now() } = {}) {
  const context = headerAssetSessionContext(now);
  const basisKey = headerAssetBasisKey({ userId, stockTrades, cashUsd, marginDebtUsd, usdRate });
  if (ready !== true || !context || context.live || !basisKey) return null;
  try {
    const stored = JSON.parse(availableStorage(storage)?.getItem(`${STORAGE_PREFIX}${userId}`) || 'null');
    const verifiedContext = headerAssetSessionContext(stored?.verifiedAt);
    if (!stored || stored.schema !== 'header-asset-snapshot' || stored.version !== SCHEMA_VERSION
        || stored.userId !== String(userId) || stored.basisKey !== basisKey
        || stored.sessionKey !== context.sessionKey || stored.closeDate !== context.closeDate
        || !verifiedContext || verifiedContext.live || verifiedContext.sessionKey !== context.sessionKey
        || !finite(stored.verifiedAt) || stored.verifiedAt > Number(now) + 60_000
        || Number(now) - stored.verifiedAt > MAX_CACHE_AGE_MS || !Array.isArray(stored.quotes)) return null;
    const recomputed = buildHeaderAssetSnapshot({ userId, stockTrades, cashUsd, marginDebtUsd, usdRate,
      ready, quoteRows: stored.quotes, now });
    if (!recomputed || stored.marginDebtUsd !== recomputed.marginDebtUsd
        || SUMMARY_FIELDS.some(key => stored.summary?.[key] !== recomputed.summary[key])) return null;
    return { ...recomputed, verifiedAt: stored.verifiedAt };
  } catch { return null; }
}
