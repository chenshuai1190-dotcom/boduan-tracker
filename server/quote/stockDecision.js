import { searchInvestmentSymbols, normalizeDcaHistorySymbol } from './investmentComparison.js';
import { getVixComparisonExpectedCloseDate } from './vixComparison.js';
import { isRegularNyseHoliday } from '../../src/lib/quoteRefreshPolicy.js';
import { buildStockDecisionModel } from './stockDecisionModel.js';

export const STOCK_DECISION_TTL_MS = 6 * 60 * 60 * 1000;
export const STOCK_DECISION_FAILURE_MS = 60 * 1000;
export const STOCK_DECISION_RATE_LIMIT_MS = 5 * 60 * 1000;
const PARTIAL_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 48;
const MAX_IN_FLIGHT = 3;
const HISTORY_DAYS = 450;
const MESSAGES = Object.freeze({
  INVALID_PARAMETERS: '请输入一个有效的美股代码',
  UNSUPPORTED_INSTRUMENT: '仅支持已验证的美元美股普通股或 ETF',
  INVALID_DATA: '股票日线数据不完整或存在冲突',
  INSUFFICIENT_DATA: '完成日线不足，暂时无法判断',
  NOT_CONFIGURED: '股票决策数据服务未配置',
  RATE_LIMITED: '行情服务暂时限流，请稍后重试',
  PROVIDER_UNAVAILABLE: '股票决策数据暂不可用，请稍后重试',
});

export class StockDecisionError extends Error {
  constructor(code = 'PROVIDER_UNAVAILABLE') {
    super(MESSAGES[code] || MESSAGES.PROVIDER_UNAVAILABLE);
    this.name = 'StockDecisionError';
    this.code = MESSAGES[code] ? code : 'PROVIDER_UNAVAILABLE';
    this.status = ['INVALID_PARAMETERS', 'UNSUPPORTED_INSTRUMENT'].includes(this.code) ? 400
      : this.code === 'NOT_CONFIGURED' ? 500 : this.code === 'RATE_LIMITED' ? 503 : 502;
  }
}

const failure = (code) => new StockDecisionError(code);
const DAY_MS = 86_400_000;
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function shiftDate(date, days) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10); }
function sessionDate(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6 && !isRegularNyseHoliday(date);
}
function numeric(value, allowZero = false) {
  if ((typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) throw failure('INVALID_DATA');
  const result = Number(value);
  if (!Number.isFinite(result) || (allowZero ? result < 0 : result <= 0)) throw failure('INVALID_DATA');
  return result;
}
function boundedSet(map, key, value) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
}

export function buildStockDecisionRows(payload, { symbol, fromDate, throughDate } = {}) {
  if (!symbol || !validDate(fromDate) || !validDate(throughDate) || !Array.isArray(payload) || payload.length > 1000) throw failure('INVALID_DATA');
  const rows = new Map();
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !validDate(raw.date)) throw failure('INVALID_DATA');
    if (raw.date < fromDate || raw.date > throughDate) continue;
    if (!sessionDate(raw.date) || rows.has(raw.date)) throw failure('INVALID_DATA');
    for (const field of ['symbol', 'code']) {
      if (raw[field] !== undefined && raw[field] !== symbol && raw[field] !== `${symbol}.US`) throw failure('INVALID_DATA');
    }
    for (const field of ['currency', 'Currency']) {
      if (raw[field] !== undefined && raw[field] !== 'USD') throw failure('INVALID_DATA');
    }
    const open = numeric(raw.open);
    const high = numeric(raw.high);
    const low = numeric(raw.low);
    const close = numeric(raw.close);
    const adjusted = numeric(raw.adjusted_close);
    const volume = numeric(raw.volume, true);
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) throw failure('INVALID_DATA');
    const factor = adjusted / close;
    if (!Number.isFinite(factor) || factor <= 0) throw failure('INVALID_DATA');
    // EODHD raw OHLC need a common split/dividend price basis. Provider volume
    // is already split adjusted: applying this factor would corrupt dividend days.
    const row = { date: raw.date, open: open * factor, high: high * factor, low: low * factor, close: adjusted, volume };
    if (['open', 'high', 'low'].some((key) => !Number.isFinite(row[key]) || row[key] <= 0)) throw failure('INVALID_DATA');
    rows.set(raw.date, row);
  }
  const sorted = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 140) throw failure('INSUFFICIENT_DATA');
  // Indicator windows count exchange sessions, not a silently compressed series.
  for (let date = sorted[0].date; date <= sorted.at(-1).date; date = shiftDate(date, 1)) {
    if (sessionDate(date) && !rows.has(date)) throw failure('INVALID_DATA');
  }
  return sorted;
}

export function createStockDecisionService({ fetchImpl: defaultFetch, now: defaultNow = Date.now, requestTimeoutMs = 8000, totalTimeoutMs = 18000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  const failures = new Map();
  let circuitUntil = 0;

  function latest(symbol, expectedDate) {
    return [...cache.values()].filter((entry) => entry.data.symbol === symbol && entry.data.asOf <= expectedDate)
      .sort((a, b) => b.data.asOf.localeCompare(a.data.asOf) || b.timestamp - a.timestamp)[0];
  }
  function staleData(entry, expectedAsOfDate) {
    return { ...entry.data, expectedAsOfDate, stale: true };
  }

  return async function service(input, { eodhdKey, fetchImpl = defaultFetch || globalThis.fetch, now = defaultNow } = {}) {
    let symbol;
    try { symbol = normalizeDcaHistorySymbol(input); } catch { throw failure('INVALID_PARAMETERS'); }
    if (typeof eodhdKey !== 'string' || !eodhdKey.trim()) throw failure('NOT_CONFIGURED');
    if (typeof fetchImpl !== 'function') throw failure();
    const timestamp = Number(typeof now === 'function' ? now() : now);
    if (!Number.isFinite(timestamp)) throw failure('INVALID_PARAMETERS');
    const expectedAsOfDate = getVixComparisonExpectedCloseDate(timestamp);
    const key = `${symbol}:${expectedAsOfDate}`;
    const existing = cache.get(key);
    if (existing?.expiresAt > timestamp) return existing.data;
    const saved = latest(symbol, expectedAsOfDate);
    const blocked = failures.get(key);
    if (circuitUntil > timestamp || blocked?.retryAt > timestamp) {
      if (saved) return staleData(saved, expectedAsOfDate);
      throw circuitUntil > timestamp ? failure('RATE_LIMITED') : blocked.error;
    }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= MAX_IN_FLIGHT) {
      if (saved) return staleData(saved, expectedAsOfDate);
      throw failure();
    }
    const operation = (async () => {
      const started = Date.now();
      const totalController = new AbortController();
      let timeout;
      let rateLimited = false;
      const timedFetch = async (url, options = {}) => {
        if (totalController.signal.aborted || circuitUntil > timestamp) throw failure(rateLimited ? 'RATE_LIMITED' : undefined);
        const controller = new AbortController();
        let rejectAbort;
        const aborted = new Promise((_, reject) => { rejectAbort = reject; });
        const abort = () => { controller.abort(); rejectAbort(failure()); };
        totalController.signal.addEventListener('abort', abort, { once: true });
        options.signal?.addEventListener('abort', abort, { once: true });
        let timer;
        try {
          return await Promise.race([
            aborted,
            (async () => {
              const result = await fetchImpl(url, { ...options, cache: 'no-store', signal: controller.signal });
              if (result.status === 429 || result.status === 402) {
                rateLimited = true;
                circuitUntil = Math.max(circuitUntil, timestamp + STOCK_DECISION_RATE_LIMIT_MS);
                throw failure('RATE_LIMITED');
              }
              if (!result.ok) throw failure();
              let payload;
              try { payload = await result.json(); } catch { throw failure('INVALID_DATA'); }
              return { ok: true, status: result.status || 200, json: async () => payload };
            })(),
            new Promise((_, reject) => {
              timer = setTimeout(() => { controller.abort(); reject(failure()); }, Math.max(1, Math.min(requestTimeoutMs, totalTimeoutMs - (Date.now() - started))));
            }),
          ]);
        } finally {
          clearTimeout(timer);
          totalController.signal.removeEventListener('abort', abort);
          options.signal?.removeEventListener('abort', abort);
        }
      };
      const json = async (path, params) => {
        const url = new URL(`https://eodhd.com/api/${path}`);
        url.search = new URLSearchParams({ ...params, api_token: eodhdKey.trim(), fmt: 'json' }).toString();
        return (await timedFetch(url.toString())).json();
      };
      try {
        const data = await Promise.race([
          (async () => {
            const identity = await searchInvestmentSymbols(symbol, { eodhdKey, fetchImpl: timedFetch, now: timestamp });
            const matches = identity.results.filter((row) => row.symbol === symbol && row.currency === 'USD' && row.exchange === 'US' && ['Common Stock', 'ETF'].includes(row.type));
            if (matches.length !== 1) throw failure('UNSUPPORTED_INSTRUMENT');
            const instrument = matches[0];
            const fromDate = shiftDate(expectedAsOfDate, -HISTORY_DAYS);
            const payload = await json(`eod/${encodeURIComponent(symbol)}.US`, { from: fromDate, to: expectedAsOfDate, period: 'd', order: 'a' });
            const rows = buildStockDecisionRows(payload, { symbol, fromDate, throughDate: expectedAsOfDate });
            const asOf = rows.at(-1).date;
            if (saved && saved.data.asOf > asOf) throw failure('INVALID_DATA');
            const valuationClose = { price: numeric(payload.find(row => row.date === asOf)?.close), date: asOf, basis: 'unadjusted_close' };
            const data = { schemaVersion: 1, symbol, name: instrument.name, currency: 'USD', source: 'EODHD', priceBasis: 'adjusted_ohlc', asOf, expectedAsOfDate,
              fetchedAt: new Date(timestamp).toISOString(), stale: asOf !== expectedAsOfDate,
              valuationClose,
              model: buildStockDecisionModel({ rows, asOf }) };
            if (totalController.signal.aborted) throw failure();
            boundedSet(cache, key, { data, timestamp,
              expiresAt: timestamp + (data.stale ? PARTIAL_TTL_MS : STOCK_DECISION_TTL_MS) });
            return data;
          })(),
          new Promise((_, reject) => { timeout = setTimeout(() => { totalController.abort(); reject(failure()); }, totalTimeoutMs); }),
        ]);
        failures.delete(key);
        return data;
      } catch (cause) {
        const problem = rateLimited ? failure('RATE_LIMITED') : cause instanceof StockDecisionError ? cause : failure();
        boundedSet(failures, key, { error: problem, retryAt: timestamp + (problem.code === 'RATE_LIMITED' ? STOCK_DECISION_RATE_LIMIT_MS : STOCK_DECISION_FAILURE_MS) });
        if (saved) return staleData(saved, expectedAsOfDate);
        throw problem;
      } finally {
        clearTimeout(timeout);
        totalController.abort();
        pending.delete(key);
      }
    })();
    pending.set(key, operation);
    return operation;
  };
}

export const fetchStockDecision = createStockDecisionService();
