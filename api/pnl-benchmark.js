import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from '../server/quote/http.js';
import {
  getLatestCompletedUsTradingDate,
  getPreviousUsTradingDate,
  isUsMarketTradingDate,
} from '../src/lib/usMarketCalendar.js';

const PUBLIC_ROWS_CACHE_TTL_MS = 15 * 60 * 1000;
const PUBLIC_ROWS_CACHE_MAX_ENTRIES = 32;
const publicRowsCache = new Map();

export function resetPnlBenchmarkPublicCacheForTests() {
  publicRowsCache.clear();
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeBenchmarkSymbol(value) {
  const raw = String(value || 'QQQ').trim().toUpperCase().replace(/\.US$/, '');
  if (!/^[A-Z0-9.-]{1,16}$/.test(raw)) return null;
  return raw;
}

function normalizeDateParam(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function sanitizeClose(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dateKeyFromTimestamp(timestamp, timeZone) {
  const epochSeconds = Number(timestamp);
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(epochSeconds * 1000));
    const part = (type) => parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return '';
  }
}

function parseYahooDailyRows(payload, { from, to }) {
  const result = payload?.chart?.result?.[0];
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quoteCloses = result?.indicators?.quote?.[0]?.close || [];
  const adjustedCloses = result?.indicators?.adjclose?.[0]?.adjclose || [];
  const timeZone = String(result?.meta?.exchangeTimezoneName || 'America/New_York');
  const rowsByDate = new Map();

  timestamps.forEach((timestamp, index) => {
    const date = dateKeyFromTimestamp(timestamp, timeZone);
    if (!date || date < from || date > to) return;
    const rawClose = sanitizeClose(quoteCloses[index]);
    const adjustedClose = sanitizeClose(adjustedCloses[index]);
    const close = adjustedClose ?? rawClose;
    if (close === null) return;
    rowsByDate.set(date, { date, close, rawClose, adjustedClose });
  });

  return Array.from(rowsByDate.values())
    .sort((left, right) => left.date.localeCompare(right.date));
}

function touchPublicCache(key, value) {
  publicRowsCache.delete(key);
  publicRowsCache.set(key, value);
  while (publicRowsCache.size > PUBLIC_ROWS_CACHE_MAX_ENTRIES) {
    publicRowsCache.delete(publicRowsCache.keys().next().value);
  }
}

async function fetchYahooDailyRows({ symbol, from, to }) {
  // The provider request is deliberately independent from the selected report
  // range. Different tabs can therefore reuse one public five-year payload and
  // filter it locally instead of issuing another upstream request.
  const cacheKey = `${symbol}:${to}:5y`;
  const cached = publicRowsCache.get(cacheKey);
  if (cached?.rows && cached.expiresAt > Date.now()) {
    touchPublicCache(cacheKey, cached);
    return cached.rows.filter((row) => row.date >= from);
  }
  if (cached?.promise) {
    const rows = await cached.promise;
    return rows.filter((row) => row.date >= from);
  }

  const promise = (async () => {
    let lastError = null;
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      const url = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
      url.searchParams.set('interval', '1d');
      url.searchParams.set('range', '5y');
      url.searchParams.set('events', 'div,splits');
      url.searchParams.set('includeAdjustedClose', 'true');
      try {
        const response = await fetchWithTimeout(url.toString(), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            Accept: 'application/json',
          },
        }, {
          provider: `yahoo:pnl-benchmark:${host}`,
          timeoutMs: QUOTE_TIMEOUTS.yahoo,
        });
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        const payload = await response.json().catch(() => null);
        const rows = parseYahooDailyRows(payload, { from: '0000-01-01', to });
        if (rows.length === 0 || rows.at(-1)?.date !== to) {
          lastError = new Error('latest completed close missing');
          continue;
        }
        touchPublicCache(cacheKey, {
          rows,
          expiresAt: Date.now() + PUBLIC_ROWS_CACHE_TTL_MS,
        });
        return rows;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Yahoo completed daily rows unavailable');
  })().catch((error) => {
    if (publicRowsCache.get(cacheKey)?.promise === promise) publicRowsCache.delete(cacheKey);
    throw error;
  });

  touchPublicCache(cacheKey, { promise, expiresAt: 0 });
  const rows = await promise;
  return rows.filter((row) => row.date >= from);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = await requireQuoteAuth(req, res);
  if (!auth.ok) return;

  const symbol = normalizeBenchmarkSymbol(firstQueryValue(req.query?.symbol));
  if (!symbol) return sendError(res, 400, '基准代码不合法');

  const from = normalizeDateParam(firstQueryValue(req.query?.from));
  const to = normalizeDateParam(firstQueryValue(req.query?.to));
  if (!from || !to) return sendError(res, 400, '缺少合法的 from/to 日期');
  if (from > to) return sendError(res, 400, 'from 日期不能晚于 to 日期');
  const latestCompletedDate = getLatestCompletedUsTradingDate(Date.now());
  const requestedCompletedDate = isUsMarketTradingDate(to) ? to : getPreviousUsTradingDate(to);
  const completedTo = latestCompletedDate && latestCompletedDate < requestedCompletedDate
    ? latestCompletedDate
    : requestedCompletedDate;
  if (!completedTo || from > completedTo) {
    return sendError(res, 502, '基准区间尚无已完成收盘价');
  }

  try {
    const rows = await fetchYahooDailyRows({ symbol, from, to: completedTo });
    return res.status(200).json({
      success: true,
      symbol,
      from,
      to: completedTo,
      rows,
      source: 'YAHOO_CHART_COMPLETED_DAILY',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendError(res, 502, `基准行情请求失败: ${error.message}`);
  }
}
