import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from '../server/quote/http.js';
import { dateKey, normalizeEarningsSession, normalizeEarningsSymbol, toEodhdUsSymbol } from '../src/lib/earningsCalendarModel.js';

const MAX_EARNINGS_SYMBOLS = 30;
const MAX_RANGE_DAYS = 90;

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Cache-Control', 'private, max-age=900, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = await requireQuoteAuth(req, res);
  if (!auth.ok) return;

  const parsed = parseEarningsRequest(req.query);
  if (parsed.error) return sendError(res, 400, parsed.error);

  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) return sendError(res, 500, '财报日历服务未配置: 缺少 EODHD_API_KEY');

  try {
    const events = await fetchEodhdEarningsCalendar({ ...parsed, eodhdKey });
    const trends = await fetchEodhdEarningsTrends({ symbols: parsed.symbols, eodhdKey });
    const merged = mergeEarningsTrendData(events, trends);

    return res.status(200).json({
      success: true,
      source: 'EODHD',
      from: parsed.from,
      to: parsed.to,
      fetchedAt: new Date().toISOString(),
      events: merged,
    });
  } catch (error) {
    return sendError(res, 502, `财报日历读取失败: ${sanitizeError(error)}`);
  }
}

export function parseEarningsRequest(query = {}) {
  const rawSymbols = Array.isArray(query.symbols) ? query.symbols[0] : query.symbols;
  if (!rawSymbols || typeof rawSymbols !== 'string') return { error: '需要传 symbols 参数' };
  if (rawSymbols.length > 1000) return { error: 'symbols 参数过长' };

  const symbols = [];
  const seen = new Set();
  for (const part of rawSymbols.split(',')) {
    const symbol = normalizeEarningsSymbol(part);
    if (!symbol) return { error: `股票代码不合法: ${String(part || '').trim()}` };
    if (!seen.has(symbol)) {
      seen.add(symbol);
      symbols.push(symbol);
    }
  }
  if (symbols.length === 0) return { error: '需要至少一个股票代码' };
  if (symbols.length > MAX_EARNINGS_SYMBOLS) return { error: `单次最多请求 ${MAX_EARNINGS_SYMBOLS} 个股票代码` };

  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = addUtcDays(today, -7);
  const defaultTo = addUtcDays(today, 45);
  const from = dateKey(query.from) || defaultFrom;
  const to = dateKey(query.to) || defaultTo;
  if (from > to) return { error: 'from 不能晚于 to' };
  if (daysBetween(from, to) > MAX_RANGE_DAYS) return { error: `查询区间不能超过 ${MAX_RANGE_DAYS} 天` };

  return { symbols, from, to };
}

export async function fetchEodhdEarningsCalendar({ symbols, from, to, eodhdKey }) {
  const eodhdSymbols = symbols.map(toEodhdUsSymbol).filter(Boolean);
  const url = new URL('https://eodhd.com/api/calendar/earnings');
  url.searchParams.set('api_token', eodhdKey);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('symbols', eodhdSymbols.join(','));
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);

  const response = await fetchWithTimeout(url.toString(), {}, { provider: 'eodhd:earnings-calendar', timeoutMs: QUOTE_TIMEOUTS.eodhd });
  if (!response.ok) throw new Error(`EODHD earnings calendar HTTP ${response.status}`);
  const body = await response.json();
  return normalizeCalendarPayload(body);
}

export async function fetchEodhdEarningsTrends({ symbols, eodhdKey }) {
  const eodhdSymbols = symbols.map(toEodhdUsSymbol).filter(Boolean);
  if (eodhdSymbols.length === 0) return [];
  const url = new URL('https://eodhd.com/api/calendar/trends');
  url.searchParams.set('api_token', eodhdKey);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('symbols', eodhdSymbols.join(','));

  const response = await fetchWithTimeout(url.toString(), {}, { provider: 'eodhd:earnings-trends', timeoutMs: QUOTE_TIMEOUTS.eodhd });
  if (!response.ok) return [];
  const body = await response.json();
  return normalizeTrendPayload(body);
}

export function mergeEarningsTrendData(events, trends) {
  const trendsBySymbol = new Map();
  trends.forEach((trend) => {
    const symbol = normalizeEarningsSymbol(trend.code || trend.symbol);
    if (!symbol) return;
    if (!trendsBySymbol.has(symbol)) trendsBySymbol.set(symbol, []);
    trendsBySymbol.get(symbol).push(trend);
  });

  return events.map((event) => {
    const symbol = normalizeEarningsSymbol(event.code || event.symbol);
    const candidates = trendsBySymbol.get(symbol) || [];
    const trend = findNearestTrend(event, candidates);
    return {
      ...event,
      symbol,
      code: event.code || `${symbol}.US`,
      reportDate: dateKey(event.report_date || event.reportDate || event.date),
      fiscalDate: dateKey(event.date || event.fiscalDate || event.report_date || event.reportDate),
      session: normalizeEarningsSession(event.before_after_market || event.beforeAfterMarket || event.time || event.session),
      epsEstimate: parseNumber(event.estimate ?? event.epsEstimate ?? trend?.earningsEstimateAvg),
      epsActual: parseNumber(event.actual ?? event.epsActual),
      epsDifference: parseNumber(event.difference ?? event.epsDifference),
      surprisePercent: parseNumber(event.percent ?? event.surprisePercent),
      revenueEstimate: parseNumber(event.revenueEstimate ?? trend?.revenueEstimateAvg),
      analystCount: parseNumber(event.analystCount ?? trend?.epsAnalystCount ?? trend?.earningsEstimateNumberOfAnalysts ?? trend?.revenueEstimateNumberOfAnalysts),
      currency: event.currency || event.Currency || trend?.currency || 'USD',
      source: 'eodhd-calendar',
    };
  }).filter((event) => event.symbol && event.reportDate);
}

function normalizeCalendarPayload(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.earnings)) return body.earnings;
  if (Array.isArray(body?.data)) return body.data;
  if (body && typeof body === 'object') {
    return Object.values(body).flatMap((value) => (Array.isArray(value) ? value : []));
  }
  return [];
}

function normalizeTrendPayload(body) {
  if (Array.isArray(body)) return flattenTrendRows(body);
  if (Array.isArray(body?.trends)) return flattenTrendRows(body.trends);
  if (Array.isArray(body?.data)) return flattenTrendRows(body.data);
  if (body && typeof body === 'object') {
    return flattenTrendRows(Object.values(body));
  }
  return [];
}

function flattenTrendRows(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (Array.isArray(item)) return flattenTrendRows(item);
    return item && typeof item === 'object' ? [item] : [];
  });
}

function findNearestTrend(event, candidates) {
  if (!candidates.length) return null;
  const eventDate = dateKey(event.report_date || event.reportDate || event.date);
  if (!eventDate) return candidates[0];
  return [...candidates].sort((a, b) => {
    const aDiff = Math.abs(daysBetween(eventDate, dateKey(a.report_date || a.reportDate || a.date || a.period)));
    const bDiff = Math.abs(daysBetween(eventDate, dateKey(b.report_date || b.reportDate || b.date || b.period)));
    return aDiff - bDiff;
  })[0];
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function addUtcDays(date, days) {
  const base = new Date(`${dateKey(date)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const start = Date.parse(`${dateKey(a)}T00:00:00Z`);
  const end = Date.parse(`${dateKey(b)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86400000);
}

function sanitizeError(error) {
  return String(error?.message || error || 'unknown error').replace(/api_token=[^&\s]+/g, 'api_token=***');
}
