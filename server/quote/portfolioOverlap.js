import { searchInvestmentSymbols } from './investmentComparison.js';
import { providerFetch, QUOTE_TIMEOUTS } from './http.js';
import { getVixComparisonExpectedCloseDate } from './vixComparison.js';
import { parseSsgaHoldingsWorkbook } from './ssgaHoldingsWorkbook.js';

export const PORTFOLIO_OVERLAP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const PORTFOLIO_OVERLAP_FAILURE_TTL_MS = 60 * 1000;
// Leaves room for quote-route auth (up to 6 seconds) and response transfer
// inside the client's 20-second request budget.
export const PORTFOLIO_OVERLAP_BATCH_TIMEOUT_MS = 12 * 1000;
export const QQQ_HOLDINGS_URL = 'https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&interval=monthly&productType=ETF';
export const SPY_HOLDINGS_URL = 'https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx';
const SEARCH_SOURCE = Object.freeze({ provider: 'EODHD_SEARCH', url: 'https://eodhd.com/financial-apis/search-api-for-stocks-etfs-mutual-funds', basis: 'instrument_identity' });
const DEFINITIONS = Object.freeze({
  QQQ: { name: 'Invesco QQQ ETF', provider: 'Invesco', url: QQQ_HOLDINGS_URL, page: 'https://www.invesco.com/qqq-etf/en/about.html', kind: 'plain_etf', leverageTarget: 1 },
  SPY: { name: 'State Street SPDR S&P 500 ETF Trust', provider: 'State Street', url: SPY_HOLDINGS_URL, page: 'https://www.ssga.com/us/en/individual/etfs/state-street-spdr-sp-500-etf-trust-spy', kind: 'plain_etf', leverageTarget: 1 },
  TQQQ: { name: 'ProShares UltraPro QQQ', provider: 'ProShares', page: 'https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq', kind: 'leveraged_etf', leverageTarget: 3 },
});
const cache = new Map();
const inFlight = new Map();
const waiting = [];
let active = 0;

export class PortfolioOverlapError extends Error {
  constructor(code = 'PROVIDER_UNAVAILABLE') {
    super(code === 'INVALID_SYMBOLS' ? '请提供最多 40 个有效证券代码' : '持仓组成资料暂不可用');
    this.name = 'PortfolioOverlapError';
    this.code = code;
    this.status = code === 'INVALID_SYMBOLS' ? 400 : 502;
  }
}

function clock(now) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) throw new PortfolioOverlapError('INVALID_DATA');
  return timestamp;
}

function symbolValue(value) {
  if (typeof value !== 'string') return '';
  const symbol = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/.test(symbol) && symbol.length <= 15
    && !/\.(?:US|INDX|FOREX|CC|LSE|HK|TO)$/.test(symbol) ? symbol : '';
}

export function normalizePortfolioOverlapSymbols(value) {
  const items = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(items) || !items.length || items.length > 40) throw new PortfolioOverlapError('INVALID_SYMBOLS');
  const symbols = items.map(symbolValue);
  if (symbols.some(symbol => !symbol)) throw new PortfolioOverlapError('INVALID_SYMBOLS');
  return [...new Set(symbols)].sort();
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function number(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string'
    && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  return name && name.length <= 200 && !/[\u0000-\u001f\u007f]/.test(name) ? name : '';
}

function base(symbol, now, reason = null) {
  const definition = DEFINITIONS[symbol];
  return {
    symbol,
    name: definition?.name || symbol,
    kind: definition?.kind || 'unknown',
    classificationSource: definition ? { provider: definition.provider, url: definition.page, basis: 'instrument_identity' } : SEARCH_SOURCE,
    leverageTarget: definition?.leverageTarget ?? null,
    holdingsStatus: 'unavailable',
    reason,
    asOfDate: null,
    fetchedAt: new Date(now).toISOString(),
    source: definition ? { provider: definition.provider, url: definition.url || definition.page, basis: definition.kind === 'plain_etf' ? 'fund_holdings' : 'instrument_identity' } : SEARCH_SOURCE,
    stale: false,
    reportedHoldingCount: null,
    parsedHoldingCount: 0,
    coveragePct: 0,
    unresolvedWeightPct: 100,
    holdings: [],
  };
}

function finalizeHoldings(symbol, rows, { asOfDate, reportedHoldingCount, now, totalWeight }) {
  if (!dateValue(asOfDate) || asOfDate > getVixComparisonExpectedCloseDate(now)
    || rows.length < 50 || rows.length > 1000 || !Number.isFinite(totalWeight)
    || totalWeight < 95 || totalWeight > 100.5) throw new PortfolioOverlapError('INVALID_DATA');
  const seen = new Set();
  for (const row of rows) {
    if (!symbolValue(row.symbol) || !cleanName(row.name) || row.exchange !== 'US'
      || !['stock', 'adr'].includes(row.securityType) || !Number.isFinite(row.weightPct)
      || row.weightPct <= 0 || seen.has(row.symbol)) throw new PortfolioOverlapError('INVALID_DATA');
    seen.add(row.symbol);
  }
  const coveragePct = rows.reduce((sum, row) => sum + row.weightPct, 0);
  if (coveragePct > 100.000001) throw new PortfolioOverlapError('INVALID_DATA');
  const stale = now - Date.parse(`${asOfDate}T00:00:00Z`) > 7 * 86400000;
  const uncovered = Math.max(0, 100 - coveragePct);
  return {
    ...base(symbol, now),
    holdingsStatus: uncovered > 0.000001 ? 'partial' : 'available',
    reason: stale ? 'stale_holdings' : uncovered > 0.000001 ? 'non_equity_or_unresolved_holdings' : null,
    asOfDate,
    stale,
    reportedHoldingCount,
    parsedHoldingCount: rows.length,
    coveragePct,
    unresolvedWeightPct: uncovered,
    holdings: rows.sort((left, right) => right.weightPct - left.weightPct || left.symbol.localeCompare(right.symbol)),
  };
}

export function parseQqqPortfolioHoldings(payload, { now = Date.now() } = {}) {
  const timestamp = clock(now);
  if (!payload || payload.cusip !== 'QQQ' || !Array.isArray(payload.holdings)
    || !Number.isInteger(payload.totalNumberOfHoldings) || payload.holdings.length !== payload.totalNumberOfHoldings
    || payload.holdings.length < 90 || payload.holdings.length > 150) throw new PortfolioOverlapError('INVALID_DATA');
  const holdings = [];
  let totalWeight = 0;
  for (const row of payload.holdings) {
    const weight = number(row?.percentageOfTotalNetAssets);
    if (weight !== null) totalWeight += weight;
    const securityType = row?.securityTypeCode === 'COM' ? 'stock'
      : ['ADR', 'DRNY'].includes(row?.securityTypeCode) ? 'adr' : null;
    if (!securityType) continue;
    const symbol = symbolValue(row?.ticker);
    const name = cleanName(row?.issuerName);
    if (!symbol || !name || weight === null || weight < 0 || row.currency !== 'USD') throw new PortfolioOverlapError('INVALID_DATA');
    if (weight > 0) holdings.push({ symbol, name, exchange: 'US', weightPct: weight, securityType });
  }
  return finalizeHoldings('QQQ', holdings, {
    asOfDate: payload.effectiveBusinessDate,
    reportedHoldingCount: payload.totalNumberOfHoldings,
    now: timestamp,
    totalWeight,
  });
}

export function parseSpyPortfolioHoldings(workbook, { now = Date.now() } = {}) {
  const timestamp = clock(now);
  const parsed = parseSsgaHoldingsWorkbook(workbook);
  const holdings = [];
  for (const row of parsed.holdings) {
    const symbol = symbolValue(row.symbol);
    // Official SPY equity holdings table also contains cash and an unlisted
    // contingent-value right. They stay unresolved, never guessed as stocks.
    if (!symbol || /^(?:US DOLLAR|CONTRA\b)|\b(?:FUTURE|SWAP)\b/i.test(row.name)) continue;
    if (!cleanName(row.name) || row.currency !== 'USD' || row.weightPct < 0) throw new PortfolioOverlapError('INVALID_DATA');
    if (row.weightPct > 0) holdings.push({ symbol, name: cleanName(row.name), exchange: 'US', weightPct: row.weightPct, securityType: 'stock' });
  }
  return finalizeHoldings('SPY', holdings, {
    asOfDate: parsed.asOfDate,
    reportedHoldingCount: parsed.holdings.length,
    now: timestamp,
    totalWeight: parsed.holdings.reduce((sum, row) => sum + row.weightPct, 0),
  });
}

async function officialData(symbol, config) {
  const response = await providerFetch(DEFINITIONS[symbol].url, {}, {
    provider: `official:portfolio-overlap:${symbol}`,
    timeoutMs: QUOTE_TIMEOUTS.eodhd,
    fetchImpl: async (url, options) => {
      const result = await config.fetchImpl(url, options);
      if (!result.ok) throw new PortfolioOverlapError('PROVIDER_UNAVAILABLE');
      const declared = Number(result.headers?.get?.('content-length'));
      if (Number.isFinite(declared) && declared > 2_000_000) throw new PortfolioOverlapError('INVALID_DATA');
      // Consume a bounded body within the provider timeout. Response.body is
      // available in production; arrayBuffer supports small test responses.
      let bytes;
      if (result.body?.getReader) {
        const reader = result.body.getReader();
        const chunks = [];
        let size = 0;
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 2_000_000) { await reader.cancel(); throw new PortfolioOverlapError('INVALID_DATA'); }
          chunks.push(Buffer.from(next.value));
        }
        bytes = Buffer.concat(chunks);
      } else bytes = Buffer.from(await result.arrayBuffer());
      if (bytes.length > 2_000_000) throw new PortfolioOverlapError('INVALID_DATA');
      return bytes;
    },
  });
  try {
    return symbol === 'QQQ'
      ? parseQqqPortfolioHoldings(JSON.parse(response.toString('utf8')), config)
      : parseSpyPortfolioHoldings(response, config);
  } catch {
    throw new PortfolioOverlapError('INVALID_DATA');
  }
}

async function acquire() {
  if (active < 3) { active += 1; return; }
  if (waiting.length >= 120) throw new PortfolioOverlapError('PROVIDER_UNAVAILABLE');
  await new Promise(resolve => waiting.push(resolve));
}
function release() { if (waiting.length) waiting.shift()(); else active -= 1; }
function remember(symbol, data, now, failed) {
  cache.delete(symbol);
  cache.set(symbol, { data, expiresAt: now + (failed ? PORTFOLIO_OVERLAP_FAILURE_TTL_MS : PORTFOLIO_OVERLAP_CACHE_TTL_MS) });
  while (cache.size > 128) cache.delete(cache.keys().next().value);
}

async function loadSymbol(symbol, config) {
  const cached = cache.get(symbol);
  if (cached?.expiresAt > config.now) {
    const date = cached.data.asOfDate;
    return date && config.now - Date.parse(`${date}T00:00:00Z`) > 7 * 86400000
      ? { ...cached.data, stale: true, reason: 'stale_holdings' } : cached.data;
  }
  if (inFlight.has(symbol)) return inFlight.get(symbol);
  const request = (async () => {
    let acquired = false;
    try {
      await acquire();
      acquired = true;
      // Queued work belongs to its original batch. Once that batch has timed
      // out, releasing a slot must not launch another upstream request.
      if (performance.now() >= config.deadline) throw new PortfolioOverlapError('PROVIDER_TIMEOUT');
      let data;
      if (symbol === 'TQQQ') data = { ...base(symbol, config.now, 'leveraged_fund_not_expanded'), holdingsStatus: 'not_applicable' };
      else if (['QQQ', 'SPY'].includes(symbol)) data = await officialData(symbol, config);
      else {
        const result = await searchInvestmentSymbols(symbol, config);
        const exact = result.results.filter(item => item.symbol === symbol);
        if (exact.length !== 1) data = base(symbol, config.now, 'unverified_instrument');
        else if (exact[0].type !== 'Common Stock') data = { ...base(symbol, config.now, 'unsupported_fund_structure'), name: exact[0].name };
        else data = {
          ...base(symbol, config.now), name: exact[0].name, kind: 'stock', leverageTarget: 1,
          holdingsStatus: 'not_applicable', coveragePct: 100, unresolvedWeightPct: 0,
        };
      }
      // A provider returning older holdings cannot replace newer evidence.
      if (cached?.data.asOfDate && data.asOfDate && cached.data.asOfDate > data.asOfDate) {
        data = { ...cached.data, stale: true, reason: 'older_holdings_response' };
      }
      remember(symbol, data, config.now, data.holdingsStatus === 'unavailable');
      return data;
    } catch (cause) {
      const reason = ['QUOTA_EXHAUSTED', 'NOT_CONFIGURED', 'PROVIDER_TIMEOUT'].includes(cause?.code)
        ? cause.code.toLowerCase() : cause?.code === 'INVALID_DATA' ? 'invalid_holdings_data' : 'provider_unavailable';
      // No cross-account portfolio state exists here: only public metadata.
      // Only transient upstream failures may serve previously parsed holdings.
      const data = cached?.data.asOfDate && reason !== 'invalid_holdings_data'
        ? { ...cached.data, stale: true, reason }
        : base(symbol, config.now, reason);
      remember(symbol, data, config.now, true);
      return data;
    } finally {
      if (acquired) release();
      inFlight.delete(symbol);
    }
  })();
  inFlight.set(symbol, request);
  return request;
}

export async function fetchPortfolioOverlap(symbols, {
  eodhdKey,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  batchTimeoutMs = PORTFOLIO_OVERLAP_BATCH_TIMEOUT_MS,
} = {}) {
  const normalized = normalizePortfolioOverlapSymbols(symbols);
  const timestamp = clock(now);
  if (!Number.isFinite(batchTimeoutMs) || batchTimeoutMs <= 0) throw new PortfolioOverlapError('INVALID_DATA');
  const timeout = Math.min(batchTimeoutMs, PORTFOLIO_OVERLAP_BATCH_TIMEOUT_MS);
  const config = { eodhdKey, fetchImpl, now: timestamp, deadline: performance.now() + timeout };
  const completed = new Map();
  const allResults = Promise.all(normalized.map(async symbol => {
    const data = await loadSymbol(symbol, config);
    completed.set(symbol, data);
  }));
  let timer;
  try {
    await Promise.race([
      allResults,
      new Promise(resolve => { timer = setTimeout(resolve, timeout); }),
    ]);
    // The active (at most three) jobs may finish and warm the public metadata
    // cache. Their results never mutate this already-returned batch object.
    const instruments = normalized.map(symbol => completed.get(symbol) || base(symbol, timestamp, 'provider_timeout'));
    return { version: 1, fetchedAt: new Date(timestamp).toISOString(), instruments };
  } finally {
    clearTimeout(timer);
  }
}

export function resetPortfolioOverlapCacheForTests() {
  cache.clear();
  inFlight.clear();
}
