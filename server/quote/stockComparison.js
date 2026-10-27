import { providerFetch, QUOTE_TIMEOUTS } from './http.js';
import { getCompletedMarketCloseDate } from './completedSession.js';
import { normalizeDcaHistorySymbol, searchInvestmentSymbols } from './investmentComparison.js';
import { isRegularNyseHoliday } from '../../src/lib/quoteRefreshPolicy.js';

const FIRST_DATE = '2000-01-01';
const CACHE_TTL = 6 * 60 * 60 * 1000;
const INCOMPLETE_TTL = 5 * 60 * 1000;
const RETRY_TTL = 60 * 1000;
const CACHE_LIMIT = 48;
const MAX_PENDING = 16;
const historyCache = new Map();
const failures = new Map();
const inFlight = new Map();
const loadQueue = [];
let activeLoads = 0;

const MESSAGES = Object.freeze({
  INVALID_PARAMETERS: '走势对比参数无效',
  INVALID_SYMBOLS: '请选择两至四个不同的有效美股或 ETF 代码',
  INVALID_DATES: '请选择 2000 年起至最近收盘日之间的有效日期',
  UNSUPPORTED_INSTRUMENT: '仅支持已验证的美元计价美股普通股或 ETF',
  INVALID_DATA: '行情数据不完整或存在冲突，请稍后重试',
  NO_DATA: '所选区间暂无可用行情，请调整日期或标的',
  NOT_CONFIGURED: '走势对比行情服务未配置',
  QUOTA_EXHAUSTED: '行情服务额度暂不可用，请稍后重试',
  PROVIDER_UNAVAILABLE: '走势对比数据暂不可用，请稍后重试',
});

export class StockComparisonError extends Error {
  constructor(code = 'PROVIDER_UNAVAILABLE') {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'PROVIDER_UNAVAILABLE';
    super(MESSAGES[safeCode]);
    this.name = 'StockComparisonError';
    this.code = safeCode;
    this.status = ['INVALID_PARAMETERS', 'INVALID_SYMBOLS', 'INVALID_DATES', 'UNSUPPORTED_INSTRUMENT'].includes(safeCode)
      ? 400 : safeCode === 'NOT_CONFIGURED' ? 500 : safeCode === 'QUOTA_EXHAUSTED' ? 503 : 502;
  }
}

const error = (code) => new StockComparisonError(code);
const normalizedError = (cause) => cause instanceof StockComparisonError ? cause : error(cause?.code);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTradingDate(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isRegularNyseHoliday(date);
}

function lastRequestedSession(to) {
  const date = new Date(`${to}T00:00:00Z`);
  while (!validTradingDate(date.toISOString().slice(0, 10))) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function positiveNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') throw error('INVALID_DATA');
  if (typeof value === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw error('INVALID_DATA');
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw error('INVALID_DATA');
  return number;
}

export function normalizeStockComparisonSymbols(value) {
  const items = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(items) || items.length < 2 || items.length > 4) throw error('INVALID_SYMBOLS');
  let symbols;
  try { symbols = items.map(normalizeDcaHistorySymbol); } catch { throw error('INVALID_SYMBOLS'); }
  if (new Set(symbols).size !== symbols.length) throw error('INVALID_SYMBOLS');
  return symbols;
}

export function normalizeStockComparisonDates(from, to, expectedAsOfDate) {
  if (!validDate(from) || !validDate(to) || !validDate(expectedAsOfDate)
    || from < FIRST_DATE || from > to || to > expectedAsOfDate) throw error('INVALID_DATES');
  return { from, to };
}

function boundedSet(map, key, value) {
  map.delete(key);
  map.set(key, value);
  while (map.size > CACHE_LIMIT) map.delete(map.keys().next().value);
}

/** EODHD /eod close is raw; adjusted_close also includes dividends and is not used here.
 * https://eodhd.com/financial-apis/api-for-historical-data-and-volumes
 * Splits after each price date are applied exactly once, through one shared basis date.
 */
export function buildStockComparisonRows(prices, splits, { from, to, splitBasisDate } = {}) {
  normalizeStockComparisonDates(from, to, splitBasisDate);
  if (!Array.isArray(prices) || prices.length > 15000 || !Array.isArray(splits) || splits.length > 1000) throw error('INVALID_DATA');
  const splitByDate = new Map();
  for (const action of splits) {
    if (!action || typeof action !== 'object' || Array.isArray(action)
      || !validDate(action.date) || action.date < from || action.date > splitBasisDate
      || typeof action.split !== 'string') throw error('INVALID_DATA');
    const match = action.split.trim().match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (!match) throw error('INVALID_DATA');
    const ratio = positiveNumber(positiveNumber(match[1]) / positiveNumber(match[2]));
    if (splitByDate.has(action.date) && splitByDate.get(action.date) !== ratio) throw error('INVALID_DATA');
    splitByDate.set(action.date, ratio);
  }
  const byDate = new Map();
  for (const row of prices) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !validDate(row.date)
      || row.date < from || row.date > to || !validTradingDate(row.date)) throw error('INVALID_DATA');
    const rawClose = positiveNumber(row.close);
    let splitFactor = 1;
    for (const [date, ratio] of splitByDate) if (date > row.date) splitFactor = positiveNumber(splitFactor * ratio);
    const close = positiveNumber(rawClose / splitFactor);
    if (byDate.has(row.date) && byDate.get(row.date).close !== close) throw error('INVALID_DATA');
    byDate.set(row.date, { date: row.date, close });
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) throw error('NO_DATA');
  return rows;
}

async function providerJson(path, parameters, config) {
  const url = new URL(`https://eodhd.com/api/${path}`);
  url.search = new URLSearchParams({ ...parameters, api_token: config.eodhdKey, fmt: 'json' }).toString();
  try {
    const result = await providerFetch(url.toString(), {}, {
      provider: 'eodhd:stock-comparison', timeoutMs: QUOTE_TIMEOUTS.eodhd,
      fetchImpl: async (input, options) => {
        const response = await config.fetchImpl(input, options);
        if (response.status === 402 || response.status === 429) throw error('QUOTA_EXHAUSTED');
        if (!response.ok) throw error('PROVIDER_UNAVAILABLE');
        try { return await response.json(); } catch { throw error('INVALID_DATA'); }
      },
    });
    return result;
  } catch (cause) { throw normalizedError(cause); }
}

// One process-wide limit bounds provider work even for simultaneous comparisons.
async function withHistorySlot(task) {
  if (activeLoads >= 2) {
    if (loadQueue.length >= MAX_PENDING) throw error('PROVIDER_UNAVAILABLE');
    await new Promise((resolve) => loadQueue.push(resolve));
  } else activeLoads += 1;
  try { return await task(); } finally {
    const next = loadQueue.shift();
    if (next) next(); else activeLoads -= 1;
  }
}

async function verifyInstrument(symbol, config) {
  try {
    const search = await searchInvestmentSymbols(symbol, config);
    const matches = search.results.filter((entry) => entry.symbol === symbol);
    if (matches.length !== 1) throw error('UNSUPPORTED_INSTRUMENT');
    return matches[0];
  } catch (cause) { throw normalizedError(cause); }
}

async function loadHistory(instrument, range, config) {
  const key = `${instrument.symbol}:${range.from}:${range.to}:${config.expectedAsOfDate}`;
  const cached = historyCache.get(key);
  if (cached?.expiresAt > config.now) return cached.data;
  if (failures.get(key)?.retryAt > config.now) throw failures.get(key).error;
  if (inFlight.has(key)) return inFlight.get(key);
  if (inFlight.size >= MAX_PENDING) throw error('PROVIDER_UNAVAILABLE');
  const pending = withHistorySlot(async () => {
    try {
      // Both independent payloads share a symbol slot. Settle both before releasing
      // it, so a failed half cannot leave unbounded provider work in the background.
      const loaded = await Promise.allSettled([
        providerJson(`eod/${encodeURIComponent(instrument.symbol)}.US`, {
          from: range.from, to: range.to, period: 'd', order: 'a',
        }, config),
        providerJson(`splits/${encodeURIComponent(instrument.symbol)}.US`, {
          from: range.from, to: config.expectedAsOfDate,
        }, config),
      ]);
      const failure = loaded.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
      const [prices, splits] = loaded.map((result) => result.value);
      const rows = buildStockComparisonRows(prices, splits, { ...range, splitBasisDate: config.expectedAsOfDate });
      const data = {
        symbol: instrument.symbol, name: instrument.name, type: instrument.type,
        currency: 'USD', priceBasis: 'split_adjusted_close', rows,
        fetchedAt: new Date(config.now).toISOString(),
      };
      const ttl = rows.at(-1).date < lastRequestedSession(range.to) ? INCOMPLETE_TTL : CACHE_TTL;
      boundedSet(historyCache, key, { data, expiresAt: config.now + ttl });
      failures.delete(key);
      return data;
    } catch (cause) {
      const failure = normalizedError(cause);
      boundedSet(failures, key, { error: failure, retryAt: config.now + RETRY_TTL });
      throw failure;
    }
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

async function mapTwo(items, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all([0, 1].map(async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

export async function fetchStockComparison(symbols, options = {}) {
  const selected = normalizeStockComparisonSymbols(symbols);
  const nowInput = typeof options.now === 'function' ? options.now() : options.now ?? Date.now();
  const now = nowInput instanceof Date ? nowInput.getTime() : Number(nowInput);
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw error('INVALID_DATA');
  const expectedAsOfDate = getCompletedMarketCloseDate(now);
  const range = normalizeStockComparisonDates(options.from, options.to, expectedAsOfDate);
  const eodhdKey = typeof options.eodhdKey === 'string' ? options.eodhdKey.trim() : '';
  if (!eodhdKey) throw error('NOT_CONFIGURED');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw error('PROVIDER_UNAVAILABLE');
  const config = { eodhdKey, fetchImpl, now, expectedAsOfDate };
  // Resolve every identity before requesting any price history.
  const instruments = await mapTwo(selected, (symbol) => verifyInstrument(symbol, config));
  const histories = await mapTwo(instruments, (instrument) => loadHistory(instrument, range, config));
  return {
    version: 1, source: 'EODHD_EOD_SPLITS', priceBasis: 'split_adjusted_close', currency: 'USD',
    symbols: selected, requestedStartDate: range.from, requestedEndDate: range.to,
    expectedAsOfDate, asOfDate: histories.map((entry) => entry.rows.at(-1).date).sort()[0],
    splitBasisDate: expectedAsOfDate,
    fetchedAt: histories.map((entry) => entry.fetchedAt).sort()[0],
    series: Object.fromEntries(histories.map(({ fetchedAt, ...entry }) => [entry.symbol, entry])),
  };
}

export function resetStockComparisonCacheForTests() {
  historyCache.clear();
  failures.clear();
  inFlight.clear();
}
