import { fetchWithTimeout, QUOTE_TIMEOUTS } from './quote/http.js';

const CACHE_TTL_MS = 8 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 96;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];
const FETCH_CONCURRENCY = 6;

const completedHistoryCache = new Map();
const completedHistoryInflight = new Map();
let quotaBlockedUntilMs = 0;

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function normalizeSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase().replace(/\.US$/, '');
  if (!/^[A-Z0-9.^_-]{1,40}$/.test(symbol)) {
    throw new TypeError('收益比赛 EODHD 股票代码不合法');
  }
  return symbol;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nextUtcMidnight(nowMs) {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function quotaError() {
  const error = new Error('收益比赛 EODHD REST 当日额度已用完');
  error.code = 'EODHD_DAILY_QUOTA_EXHAUSTED';
  error.status = 402;
  error.retryable = true;
  error.blockedUntil = new Date(quotaBlockedUntilMs).toISOString();
  return error;
}

function assertQuotaAvailable(nowMs = Date.now()) {
  if (quotaBlockedUntilMs > nowMs) throw quotaError();
  quotaBlockedUntilMs = 0;
}

function parseRows(payload, throughDate) {
  return (Array.isArray(payload) ? payload : [])
    .map((row) => {
      const date = String(row?.date || '').slice(0, 10);
      const rawClose = Number(row?.close);
      const adjustedClose = Number(row?.adjusted_close ?? row?.adjustedClose);
      if (
        !isDateKey(date)
        || date > throughDate
        || !(
          (Number.isFinite(adjustedClose) && adjustedClose > 0)
          || (Number.isFinite(rawClose) && rawClose > 0)
        )
      ) return null;
      return {
        date,
        close: rawClose,
        adjusted_close: Number.isFinite(adjustedClose) && adjustedClose > 0
          ? adjustedClose
          : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function cacheKey(symbol, throughDate) {
  return `${symbol}:${throughDate}`;
}

function trimCache() {
  const now = Date.now();
  for (const [key, entry] of completedHistoryCache) {
    if (!(entry?.expiresAt > now)) completedHistoryCache.delete(key);
  }
  while (completedHistoryCache.size > CACHE_MAX_ENTRIES) {
    const oldest = completedHistoryCache.keys().next().value;
    if (oldest == null) break;
    completedHistoryCache.delete(oldest);
  }
}

function sliceFrom(rows, fromDate) {
  return rows.filter((row) => row.date >= fromDate);
}

function hasRequiredClose(rows, requiredThroughDate) {
  return rows.some((row) => row.date === requiredThroughDate);
}

function missingTargetCloseError(symbol, requiredThroughDate, rows) {
  const error = new Error(`${symbol} missing completed close ${requiredThroughDate}`);
  error.code = 'missing_target_close';
  error.status = 503;
  error.retryable = true;
  error.rows = rows;
  return error;
}

function mergeRows(existingRows, incomingRows) {
  const byDate = new Map();
  existingRows.forEach((row) => byDate.set(row.date, row));
  incomingRows.forEach((row) => byDate.set(row.date, row));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function readCachedHistory(key, fromDate, requiredThroughDate) {
  trimCache();
  const cached = completedHistoryCache.get(key);
  if (
    !cached
    || cached.fromDate > fromDate
    || !hasRequiredClose(cached.rows, requiredThroughDate)
  ) return null;
  completedHistoryCache.delete(key);
  completedHistoryCache.set(key, cached);
  return sliceFrom(cached.rows, fromDate);
}

function writeCachedHistory(key, fromDate, rows) {
  const existing = completedHistoryCache.get(key);
  completedHistoryCache.delete(key);
  completedHistoryCache.set(key, {
    fromDate: existing && existing.fromDate < fromDate ? existing.fromDate : fromDate,
    rows: existing ? mergeRows(existing.rows, rows) : rows,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  trimCache();
}

async function loadFromEodhd({ symbol, fromDate, throughDate }) {
  const apiKey = String(process.env.EODHD_API_KEY || '')
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!apiKey) {
    const error = new Error('收益比赛快照未配置: 缺少 EODHD_API_KEY');
    error.status = 500;
    error.retryable = false;
    throw error;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await wait(RETRY_DELAYS_MS[attempt - 2] || 0);
    try {
      assertQuotaAvailable();
      const url = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}.US?api_token=${encodeURIComponent(apiKey)}&from=${fromDate}&to=${throughDate}&period=d&fmt=json`;
      const response = await fetchWithTimeout(url, {}, {
        provider: 'eodhd-community-competition-recalculation',
        timeoutMs: QUOTE_TIMEOUTS.eodhd,
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 402) {
        quotaBlockedUntilMs = Math.max(quotaBlockedUntilMs, nextUtcMidnight(Date.now()));
        throw quotaError();
      }
      if (!response.ok) {
        const error = new Error(`${symbol} HTTP ${response.status}`);
        error.status = response.status;
        error.retryable = isRetryableStatus(response.status);
        throw error;
      }
      return parseRows(payload, throughDate);
    } catch (error) {
      lastError = error;
      if (error?.status === 402 || error?.code === 'EODHD_DAILY_QUOTA_EXHAUSTED') break;
      const retryable = error?.retryable !== false
        && (error?.retryable === true || error?.status == null || isRetryableStatus(error.status));
      if (!retryable || attempt === MAX_ATTEMPTS) break;
    }
  }
  throw lastError || new Error(`${symbol} EODHD unavailable`);
}

function createHistoryFlight({ key, symbol, fromDate, throughDate }) {
  const flight = {
    earliestRequestedFromDate: fromDate,
    initialFromDate: fromDate,
    promise: null,
  };
  flight.promise = (async () => {
    let loadedFromDate = flight.initialFromDate;
    let rows = await loadFromEodhd({
      symbol,
      fromDate: loadedFromDate,
      throughDate,
    });

    // Requests that arrive while the first provider read is pending only widen
    // this flight once. This keeps a short-first burst to at most two reads,
    // instead of launching one read per user's ledger start date.
    const wideningFromDate = flight.earliestRequestedFromDate;
    if (wideningFromDate < loadedFromDate) {
      loadedFromDate = wideningFromDate;
      rows = await loadFromEodhd({
        symbol,
        fromDate: loadedFromDate,
        throughDate,
      });
    }
    return { fromDate: loadedFromDate, rows };
  })().finally(() => {
    if (completedHistoryInflight.get(key) === flight) {
      completedHistoryInflight.delete(key);
    }
  });
  completedHistoryInflight.set(key, flight);
  return flight;
}

async function loadCoalescedHistory({ key, symbol, fromDate, throughDate }) {
  while (true) {
    const flight = completedHistoryInflight.get(key) || createHistoryFlight({
      key,
      symbol,
      fromDate,
      throughDate,
    });
    if (fromDate < flight.earliestRequestedFromDate) {
      flight.earliestRequestedFromDate = fromDate;
    }
    const loaded = await flight.promise;
    if (loaded.fromDate <= fromDate) return loaded;
    // An even earlier request can arrive after the one widening range was
    // captured. It waits for the active flight, then starts the next serial
    // flight instead of creating overlapping EODHD requests.
  }
}

export async function fetchCommunityCompetitionEodhdHistory({
  symbol,
  fromDate,
  throughDate,
  requiredThroughDate = throughDate,
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (
    !isDateKey(fromDate)
    || !isDateKey(throughDate)
    || fromDate > throughDate
    || !isDateKey(requiredThroughDate)
    || fromDate > requiredThroughDate
    || requiredThroughDate > throughDate
  ) {
    throw new TypeError('收益比赛 EODHD 日期区间不合法');
  }
  const key = cacheKey(normalizedSymbol, throughDate);
  let lastRows = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const cachedRows = readCachedHistory(key, fromDate, requiredThroughDate);
    if (cachedRows) return cachedRows;
    if (attempt > 1) await wait(RETRY_DELAYS_MS[attempt - 2] || 0);

    const loaded = await loadCoalescedHistory({
      key,
      symbol: normalizedSymbol,
      fromDate,
      throughDate,
    });
    lastRows = loaded.rows;
    if (hasRequiredClose(lastRows, requiredThroughDate)) {
      writeCachedHistory(key, loaded.fromDate, lastRows);
      return sliceFrom(lastRows, fromDate);
    }
  }
  throw missingTargetCloseError(normalizedSymbol, requiredThroughDate, lastRows);
}

export async function fetchCommunityCompetitionEodhdHistories({
  symbols = [],
  fromDate,
  throughDate,
  requiredThroughDates = {},
} = {}) {
  const normalizedSymbols = [...new Set((Array.isArray(symbols) ? symbols : [])
    .map(normalizeSymbol))].sort();
  const result = {};
  for (let offset = 0; offset < normalizedSymbols.length; offset += FETCH_CONCURRENCY) {
    const chunk = normalizedSymbols.slice(offset, offset + FETCH_CONCURRENCY);
    const entries = await Promise.all(chunk.map(async (symbol) => [
      symbol,
      await fetchCommunityCompetitionEodhdHistory({
        symbol,
        fromDate,
        throughDate,
        requiredThroughDate: requiredThroughDates?.[symbol] || throughDate,
      }),
    ]));
    entries.forEach(([symbol, rows]) => { result[symbol] = rows; });
  }
  return result;
}

export function resetCommunityCompetitionEodhdStateForTests() {
  completedHistoryCache.clear();
  completedHistoryInflight.clear();
  quotaBlockedUntilMs = 0;
}
