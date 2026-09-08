import { providerFetch, QUOTE_TIMEOUTS } from './http.js';
import { getVixComparisonExpectedCloseDate } from './vixComparison.js';
import { isRegularNyseHoliday } from '../../src/lib/quoteRefreshPolicy.js';

const HISTORY_FROM = '2000-01-01';
const STALE_RETRY_MS = 5 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;
const SEARCH_TTL_MS = 6 * 60 * 60 * 1000;
const IDENTITY_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_LIMIT = 50;
const MAX_HISTORY_ENTRIES = 24;
const MAX_SEARCH_ENTRIES = 64;
const MAX_IDENTITY_ENTRIES = 128;
const MAX_IN_FLIGHT = 8;
const US_EXCHANGES = new Set(['US', 'NYSE', 'NASDAQ', 'NYSE ARCA', 'NYSEARCA', 'NYSE MKT', 'AMEX', 'BATS']);
const SUPPORTED_TYPES = new Set(['Common Stock', 'ETF']);
const RESERVED_SYMBOLS = new Set(['VIX', 'FGI', 'INDICES']);
const EXCHANGE_SUFFIX = /\.(?:US|INDX|FOREX|CC|LSE|TO|PA|HK|SHG|SHE|F|XETRA)$/;
const historyCache = new Map();
const historyInFlight = new Map();
const historyFailures = new Map();
const searchCache = new Map();
const searchInFlight = new Map();
const searchFailures = new Map();
const identityCache = new Map();
let quotaCircuitUntil = 0;

const ERROR_MESSAGES = Object.freeze({
  INVALID_SYMBOLS: '请选择两个不同的有效美股或 ETF 代码',
  INVALID_QUERY: '请输入有效的股票代码或名称',
  UNSUPPORTED_INSTRUMENT: '仅支持已验证的美元计价美股普通股或 ETF',
  INVALID_DATA: '历史数据不完整或存在冲突，暂时无法比较',
  PROVIDER_UNAVAILABLE: '投资对比数据暂不可用，请稍后重试',
  QUOTA_EXHAUSTED: '行情服务今日额度暂不可用，请稍后重试',
  NOT_CONFIGURED: '投资对比行情服务未配置',
});

export class InvestmentComparisonError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.PROVIDER_UNAVAILABLE);
    this.name = 'InvestmentComparisonError';
    this.code = ERROR_MESSAGES[code] ? code : 'PROVIDER_UNAVAILABLE';
    this.status = ['INVALID_SYMBOLS', 'INVALID_QUERY', 'UNSUPPORTED_INSTRUMENT'].includes(this.code)
      ? 400 : this.code === 'NOT_CONFIGURED' ? 500 : this.code === 'QUOTA_EXHAUSTED' ? 503 : 502;
  }
}

function error(code) { return new InvestmentComparisonError(code); }

function clock(now) {
  const value = typeof now === 'function' ? now() : now;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) throw error('INVALID_DATA');
  return timestamp;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function supportedSymbol(value) {
  if (typeof value !== 'string') return '';
  const symbol = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)
    && !/[.-]$|[.-]{2}/.test(symbol) && !EXCHANGE_SUFFIX.test(symbol)
    && !RESERVED_SYMBOLS.has(symbol) ? symbol : '';
}

export function normalizeInvestmentComparisonSymbols(value) {
  const values = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(values) || values.length !== 2) throw error('INVALID_SYMBOLS');
  const symbols = values.map(supportedSymbol);
  if (symbols.some((symbol) => !symbol) || symbols[0] === symbols[1]) throw error('INVALID_SYMBOLS');
  return symbols;
}

export function normalizeInvestmentSearchQuery(value) {
  if (typeof value !== 'string') throw error('INVALID_QUERY');
  const query = value.trim().replace(/\s+/g, ' ');
  if (query.length < 1 || query.length > 60 || !/^[\p{L}\p{N} .&'’-]+$/u.test(query)
    || !/[\p{L}\p{N}]/u.test(query)) throw error('INVALID_QUERY');
  return query;
}

function boundedSet(map, key, value, limit) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}

function providerInstrument(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const symbol = supportedSymbol(row.Code);
  const name = typeof row.Name === 'string' ? row.Name.trim() : '';
  const exchange = typeof row.Exchange === 'string' ? row.Exchange.trim().toUpperCase() : '';
  if (!symbol || !name || name.length > 180 || /[\u0000-\u001f\u007f]/.test(name)
    || row.Currency !== 'USD' || !SUPPORTED_TYPES.has(row.Type)
    || !US_EXCHANGES.has(exchange) || !['USA', 'US', 'United States'].includes(row.Country)) return null;
  return { symbol, name, currency: 'USD', type: row.Type, exchange: 'US' };
}

export function buildInvestmentSearchResults(payload) {
  if (!Array.isArray(payload) || payload.length > 500) throw error('INVALID_DATA');
  const bySymbol = new Map();
  for (const row of payload) {
    const instrument = providerInstrument(row);
    if (!instrument) continue;
    const previous = bySymbol.get(instrument.symbol);
    if (previous && (previous.name !== instrument.name || previous.type !== instrument.type)) throw error('INVALID_DATA');
    bySymbol.set(instrument.symbol, instrument);
  }
  return [...bySymbol.values()];
}

function validInstrument(value) {
  return value && supportedSymbol(value.symbol) === value.symbol
    && typeof value.name === 'string' && value.name.trim() && value.name.length <= 180
    && value.currency === 'USD' && SUPPORTED_TYPES.has(value.type) && value.exchange === 'US';
}

function normalizedError(cause) {
  return cause instanceof InvestmentComparisonError ? cause : error('PROVIDER_UNAVAILABLE');
}

function canUseStale(cause) {
  return ['PROVIDER_UNAVAILABLE', 'QUOTA_EXHAUSTED'].includes(cause?.code);
}

function staleReason(cause) {
  return cause?.code === 'QUOTA_EXHAUSTED' ? 'quota_exhausted' : 'provider_unavailable';
}

async function providerJson(path, parameters, { eodhdKey, fetchImpl, now }) {
  if (quotaCircuitUntil > now) throw error('QUOTA_EXHAUSTED');
  const url = new URL(`https://eodhd.com/api/${path}`);
  url.search = new URLSearchParams({ ...parameters, api_token: eodhdKey, fmt: 'json' }).toString();
  // Keep JSON body consumption inside the shared provider timeout as well.
  const response = await providerFetch(url.toString(), {}, {
    provider: 'eodhd:investment-comparison',
    timeoutMs: QUOTE_TIMEOUTS.eodhd,
    fetchImpl: async (input, options) => {
      const result = await fetchImpl(input, options);
      if (result.status === 402) {
        const midnight = new Date(now);
        midnight.setUTCHours(24, 0, 0, 0);
        quotaCircuitUntil = Math.max(quotaCircuitUntil, midnight.getTime());
      }
      let payload = null;
      if (result.ok) {
        try { payload = await result.json(); } catch { throw error('INVALID_DATA'); }
      }
      return { ok: result.ok, status: result.status, payload };
    },
  }).catch((cause) => { throw normalizedError(cause); });
  if (response.status === 402) throw error('QUOTA_EXHAUSTED');
  if (!response.ok) throw error('PROVIDER_UNAVAILABLE');
  return response.payload;
}

function providerOptions({ eodhdKey, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (typeof eodhdKey !== 'string' || !eodhdKey.trim()) throw error('NOT_CONFIGURED');
  if (typeof fetchImpl !== 'function') throw error('PROVIDER_UNAVAILABLE');
  return { eodhdKey: eodhdKey.trim(), fetchImpl, now: clock(now) };
}

export async function searchInvestmentSymbols(query, options = {}) {
  const normalizedQuery = normalizeInvestmentSearchQuery(query);
  const config = providerOptions(options);
  const key = normalizedQuery.toUpperCase();
  const cached = searchCache.get(key);
  if (cached?.expiresAt > config.now) return { ...cached.data, query: normalizedQuery };
  const failure = searchFailures.get(key);
  if (failure?.retryAt > config.now) throw failure.error;
  if (searchInFlight.has(key)) return searchInFlight.get(key).then((data) => ({ ...data, query: normalizedQuery }));
  if (searchInFlight.size >= MAX_IN_FLIGHT) throw error('PROVIDER_UNAVAILABLE');
  const promise = (async () => {
    try {
      // EODHD search docs: /api/search/{query}, exchange=US, type=all.
      const payload = await providerJson(`search/${encodeURIComponent(normalizedQuery)}`, {
        exchange: 'US', type: 'all', limit: String(SEARCH_LIMIT),
      }, config);
      const results = buildInvestmentSearchResults(payload);
      const data = { version: 1, source: 'EODHD_SEARCH', query: normalizedQuery, fetchedAt: new Date(config.now).toISOString(), results };
      boundedSet(searchCache, key, { data, expiresAt: config.now + SEARCH_TTL_MS }, MAX_SEARCH_ENTRIES);
      for (const instrument of results) {
        boundedSet(identityCache, instrument.symbol, { instrument, expiresAt: config.now + IDENTITY_TTL_MS }, MAX_IDENTITY_ENTRIES);
      }
      searchFailures.delete(key);
      return data;
    } catch (cause) {
      const failure = normalizedError(cause);
      boundedSet(searchFailures, key, { error: failure, retryAt: failure.code === 'QUOTA_EXHAUSTED' ? quotaCircuitUntil : config.now + FAILURE_RETRY_MS }, MAX_SEARCH_ENTRIES);
      throw failure;
    } finally {
      searchInFlight.delete(key);
    }
  })();
  searchInFlight.set(key, promise);
  return promise;
}

async function verifyInstrument(symbol, config) {
  const cached = identityCache.get(symbol);
  if (cached?.expiresAt > config.now) return cached.instrument;
  const search = await searchInvestmentSymbols(symbol, config);
  const exact = search.results.filter((instrument) => instrument.symbol === symbol);
  if (exact.length !== 1) throw error('UNSUPPORTED_INSTRUMENT');
  return exact[0];
}

export function buildInvestmentHistoryRows(payload, { throughDate } = {}) {
  if (!validDate(throughDate) || !Array.isArray(payload) || payload.length > 15000) throw error('INVALID_DATA');
  const byDate = new Map();
  for (const row of payload) {
    const date = validDate(row?.date);
    if (!date) throw error('INVALID_DATA');
    if (date < HISTORY_FROM || date > throughDate) continue;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6 || isRegularNyseHoliday(date)) throw error('INVALID_DATA');
    const input = row.adjusted_close;
    if (typeof input !== 'number' && typeof input !== 'string') throw error('INVALID_DATA');
    if (typeof input === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input.trim())) throw error('INVALID_DATA');
    const close = Number(input);
    if (!Number.isFinite(close) || close <= 0) throw error('INVALID_DATA');
    if (byDate.has(date) && byDate.get(date).close !== close) throw error('INVALID_DATA');
    byDate.set(date, { date, close });
  }
  const rows = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  if (rows.length < 2) throw error('INVALID_DATA');
  return rows;
}

function latestCachedHistory(symbol, expectedDate) {
  return [...historyCache.values()].map((entry) => entry.data)
    .filter((entry) => entry.symbol === symbol && entry.asOfDate <= expectedDate)
    .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0] || null;
}

function staleHistory(data, expectedDate, cause) {
  return { ...data, expectedAsOfDate: expectedDate, stale: true, staleReason: staleReason(cause) };
}

async function loadInstrumentHistory(instrument, expectedDate, config) {
  const key = `${instrument.symbol}:${expectedDate}`;
  const cached = historyCache.get(key);
  if (cached && (!cached.data.stale || cached.retryAt > config.now)) return cached.data;
  const failure = historyFailures.get(key);
  if (failure?.retryAt > config.now) {
    const fallback = latestCachedHistory(instrument.symbol, expectedDate);
    if (fallback && canUseStale(failure.error)) return staleHistory(fallback, expectedDate, failure.error);
    throw failure.error;
  }
  if (historyInFlight.has(key)) return historyInFlight.get(key);
  if (historyInFlight.size >= MAX_IN_FLIGHT) throw error('PROVIDER_UNAVAILABLE');
  const promise = (async () => {
    try {
      const payload = await providerJson(`eod/${encodeURIComponent(instrument.symbol)}.US`, {
        from: HISTORY_FROM, to: expectedDate, period: 'd', order: 'a',
      }, config);
      const rows = buildInvestmentHistoryRows(payload, { throughDate: expectedDate });
      const asOfDate = rows.at(-1).date;
      const data = {
        ...instrument, rows, asOfDate, expectedAsOfDate: expectedDate,
        fetchedAt: new Date(config.now).toISOString(),
        stale: asOfDate !== expectedDate, staleReason: asOfDate !== expectedDate ? 'incomplete_close' : '',
      };
      const previous = latestCachedHistory(instrument.symbol, expectedDate);
      if (previous && previous.asOfDate > asOfDate) throw error('INVALID_DATA');
      boundedSet(historyCache, key, { data, retryAt: config.now + STALE_RETRY_MS }, MAX_HISTORY_ENTRIES);
      historyFailures.delete(key);
      return data;
    } catch (cause) {
      const failure = normalizedError(cause);
      boundedSet(historyFailures, key, { error: failure, retryAt: failure.code === 'QUOTA_EXHAUSTED' ? quotaCircuitUntil : config.now + FAILURE_RETRY_MS }, MAX_HISTORY_ENTRIES);
      const fallback = latestCachedHistory(instrument.symbol, expectedDate);
      if (fallback && canUseStale(failure)) return staleHistory(fallback, expectedDate, failure);
      throw failure;
    } finally {
      historyInFlight.delete(key);
    }
  })();
  historyInFlight.set(key, promise);
  return promise;
}

export function buildInvestmentComparisonData(histories, { symbols, expectedAsOfDate, now = Date.now() } = {}) {
  const pair = normalizeInvestmentComparisonSymbols(symbols);
  const timestamp = clock(now);
  if (!validDate(expectedAsOfDate) || expectedAsOfDate > getVixComparisonExpectedCloseDate(timestamp)) throw error('INVALID_DATA');
  const expectedWeekday = new Date(`${expectedAsOfDate}T00:00:00Z`).getUTCDay();
  if ([0, 6].includes(expectedWeekday) || isRegularNyseHoliday(expectedAsOfDate)) throw error('INVALID_DATA');
  const entries = pair.map((symbol) => histories?.[symbol]);
  if (entries.some((entry, index) => !validInstrument(entry) || entry.symbol !== pair[index])) throw error('INVALID_DATA');
  // Validate even injected builders: no caller may slip unvalidated rows into a result.
  const rowsBySymbol = Object.fromEntries(entries.map((entry) => [entry.symbol, buildInvestmentHistoryRows(
    (entry.rows || []).map((row) => ({ date: row.date, adjusted_close: row.close })), { throughDate: expectedAsOfDate },
  )]));
  const availableFromDate = pair.map((symbol) => rowsBySymbol[symbol][0].date).sort().at(-1);
  const asOfDate = pair.map((symbol) => rowsBySymbol[symbol].at(-1).date).sort()[0];
  const commonRows = pair.map((symbol) => rowsBySymbol[symbol].filter((row) => row.date >= availableFromDate && row.date <= asOfDate));
  if (commonRows[0].length < 2 || commonRows[0].length !== commonRows[1].length
    || commonRows[0].some((row, index) => row.date !== commonRows[1][index].date)) throw error('INVALID_DATA');
  const reason = entries.some((entry) => entry.staleReason === 'quota_exhausted') ? 'quota_exhausted'
    : entries.some((entry) => entry.staleReason === 'provider_unavailable') ? 'provider_unavailable'
      : asOfDate !== expectedAsOfDate ? 'incomplete_close' : '';
  const fetchedTimes = entries.map((entry) => Date.parse(entry.fetchedAt));
  if (fetchedTimes.some((value) => !Number.isFinite(value) || value > timestamp + 300_000)) throw error('INVALID_DATA');
  return {
    version: 1, source: 'EODHD_EOD', priceBasis: 'adjusted_close', currency: 'USD',
    expectedAsOfDate, asOfDate, availableFromDate,
    fetchedAt: new Date(Math.min(...fetchedTimes)).toISOString(),
    stale: Boolean(reason), staleReason: reason, symbols: pair,
    series: Object.fromEntries(entries.map((entry) => [entry.symbol, {
      symbol: entry.symbol, name: entry.name, currency: 'USD', type: entry.type, priceBasis: 'adjusted_close',
      rows: rowsBySymbol[entry.symbol].filter((row) => row.date <= asOfDate),
    }])),
  };
}

export async function fetchInvestmentComparison(symbols, options = {}) {
  const pair = normalizeInvestmentComparisonSymbols(symbols);
  const config = providerOptions(options);
  const expectedDate = getVixComparisonExpectedCloseDate(config.now);
  // Both identities must pass before even the first historical-price request.
  const instruments = await Promise.all(pair.map((symbol) => verifyInstrument(symbol, config)));
  const entries = await Promise.all(instruments.map((instrument) => loadInstrumentHistory(instrument, expectedDate, config)));
  return buildInvestmentComparisonData(Object.fromEntries(entries.map((entry) => [entry.symbol, entry])), {
    symbols: pair, expectedAsOfDate: expectedDate, now: config.now,
  });
}

export function resetInvestmentComparisonCacheForTests() {
  for (const map of [historyCache, historyInFlight, historyFailures, searchCache, searchInFlight, searchFailures, identityCache]) map.clear();
  quotaCircuitUntil = 0;
}
