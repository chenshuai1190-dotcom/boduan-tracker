import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from '../server/quote/http.js';
import {
  classifyEarningsResult,
  dateKey,
  EARNINGS_PUBLISHED_RETENTION_DAYS,
  isEarningsPublished,
  normalizeEarningsSession,
  normalizeEarningsSymbol,
  toEodhdUsSymbol,
} from '../src/lib/earningsCalendarModel.js';

const MAX_EARNINGS_SYMBOLS = 30;
const MAX_RANGE_DAYS = 90;
const USD_FOREX_SYMBOL_BY_CURRENCY = {
  CNY: 'USDCNY.FOREX',
  HKD: 'USDHKD.FOREX',
  JPY: 'USDJPY.FOREX',
  KRW: 'USDKRW.FOREX',
  TWD: 'USDTWD.FOREX',
};

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
    const enriched = await enrichPublishedEarningsData({ events: merged, eodhdKey });
    const fxRates = await fetchEodhdUsdForexRates({
      currencies: enriched.flatMap((event) => [
        event.currency,
        event.revenueOriginalCurrency,
        event.revenueActualOriginalCurrency,
        event.revenuePreviousYearOriginalCurrency,
      ]),
      eodhdKey,
    });
    const normalized = mergeEarningsRevenueUsd(enriched, fxRates);

    return res.status(200).json({
      success: true,
      source: 'EODHD',
      from: parsed.from,
      to: parsed.to,
      fetchedAt: new Date().toISOString(),
      events: normalized,
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
  const requested = new Set(eodhdSymbols);
  const today = new Date().toISOString().slice(0, 10);
  const recentTo = minDate(to, addUtcDays(today, EARNINGS_PUBLISHED_RETENTION_DAYS));
  const requests = [];

  if (from <= recentTo) {
    requests.push(fetchEodhdEarningsCalendarRows({ from, to: recentTo, eodhdKey }));
  }
  if (eodhdSymbols.length > 0) {
    requests.push(fetchEodhdEarningsCalendarRows({ symbols: eodhdSymbols, from, to, eodhdKey }));
  }

  const payloads = await Promise.all(requests);
  return dedupeCalendarRows(payloads.flat()).filter((event) => {
    const eodhdSymbol = toEodhdUsSymbol(event.code || event.symbol);
    const reportDate = dateKey(event.report_date || event.reportDate || event.date);
    return requested.has(eodhdSymbol) && reportDate >= from && reportDate <= to;
  });
}

async function fetchEodhdEarningsCalendarRows({ symbols, from, to, eodhdKey }) {
  const url = new URL('https://eodhd.com/api/calendar/earnings');
  url.searchParams.set('api_token', eodhdKey);
  url.searchParams.set('fmt', 'json');
  if (Array.isArray(symbols) && symbols.length) url.searchParams.set('symbols', symbols.join(','));
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);

  const response = await fetchWithTimeout(url.toString(), {}, { provider: 'eodhd:earnings-calendar', timeoutMs: QUOTE_TIMEOUTS.eodhd });
  if (!response.ok) throw new Error(`EODHD earnings calendar HTTP ${response.status}`);
  const body = await response.json();
  return normalizeCalendarPayload(body);
}

function dedupeCalendarRows(rows) {
  const merged = new Map();
  (rows || []).forEach((row) => {
    const key = [
      toEodhdUsSymbol(row?.code || row?.symbol),
      dateKey(row?.report_date || row?.reportDate || row?.date),
      dateKey(row?.date || row?.fiscalDate),
    ].join('|');
    if (!key.startsWith('|') && !merged.has(key)) {
      merged.set(key, row);
      return;
    }
    const previous = merged.get(key);
    if (parseNumber(previous?.actual ?? previous?.epsActual) === null && parseNumber(row?.actual ?? row?.epsActual) !== null) {
      merged.set(key, row);
    }
  });
  return Array.from(merged.values());
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

export async function fetchEodhdUsdForexRates({ currencies, eodhdKey }) {
  const uniqueCurrencies = Array.from(new Set((currencies || []).map(normalizeCurrency).filter((currency) => currency && currency !== 'USD')));
  const rates = new Map([['USD', { localPerUsd: 1, source: 'identity' }]]);
  await Promise.all(uniqueCurrencies.map(async (currency) => {
    const symbol = USD_FOREX_SYMBOL_BY_CURRENCY[currency];
    if (!symbol) return;
    try {
      const url = new URL(`https://eodhd.com/api/real-time/${symbol}`);
      url.searchParams.set('api_token', eodhdKey);
      url.searchParams.set('fmt', 'json');
      const response = await fetchWithTimeout(url.toString(), {}, { provider: `eodhd:forex:${symbol}`, timeoutMs: QUOTE_TIMEOUTS.eodhd });
      if (!response.ok) return;
      const body = await response.json();
      const localPerUsd = parseNumber(body.close ?? body.price ?? body.last ?? body.previousClose);
      if (localPerUsd > 0) rates.set(currency, { localPerUsd, source: symbol });
    } catch {
      // Do not fail the calendar when a non-core FX quote is temporarily unavailable.
    }
  }));
  return rates;
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
      epsPreviousYear: parseNumber(event.epsPreviousYear ?? trend?.earningsEstimateYearAgoEps),
      epsEstimateYoyPercent: parseGrowthPercent(event.epsEstimateYoyPercent ?? trend?.earningsEstimateGrowth),
      revenueEstimate: parseNumber(event.revenueEstimate ?? trend?.revenueEstimateAvg),
      revenueEstimateYoyPercent: parseGrowthPercent(event.revenueEstimateYoyPercent ?? trend?.revenueEstimateGrowth),
      analystCount: parseNumber(event.analystCount ?? trend?.epsAnalystCount ?? trend?.earningsEstimateNumberOfAnalysts ?? trend?.revenueEstimateNumberOfAnalysts),
      currency: normalizeCurrency(event.currency || event.Currency || trend?.currency || 'USD') || 'USD',
      source: 'eodhd-calendar',
    };
  }).filter((event) => event.symbol && event.reportDate);
}

export function mergeEarningsRevenueUsd(events, fxRates = new Map()) {
  return (events || []).map((event) => {
    const currency = normalizeCurrency(event.currency) || 'USD';
    const revenueEstimate = parseNumber(event.revenueEstimate);
    const rate = readFxRate(fxRates, currency);
    const revenueEstimateUsd = revenueEstimate !== null && rate > 0
      ? (currency === 'USD' ? revenueEstimate : revenueEstimate / rate)
      : null;
    const actualCurrency = normalizeCurrency(event.revenueActualOriginalCurrency || event.revenueActualCurrency || currency) || currency;
    const revenueActual = parseNumber(event.revenueActual);
    const actualRate = readFxRate(fxRates, actualCurrency);
    const revenueActualUsd = revenueActual !== null && actualRate > 0
      ? (actualCurrency === 'USD' ? revenueActual : revenueActual / actualRate)
      : null;
    const previousRevenueCurrency = normalizeCurrency(event.revenuePreviousYearOriginalCurrency || event.revenuePreviousYearCurrency || actualCurrency || currency) || actualCurrency || currency;
    const revenuePreviousYear = parseNumber(event.revenuePreviousYear);
    const previousRevenueRate = readFxRate(fxRates, previousRevenueCurrency);
    const revenuePreviousYearUsd = revenuePreviousYear !== null && previousRevenueRate > 0
      ? (previousRevenueCurrency === 'USD' ? revenuePreviousYear : revenuePreviousYear / previousRevenueRate)
      : null;
    const revenueSurprisePercent = revenueEstimateUsd !== null && revenueEstimateUsd !== 0 && revenueActualUsd !== null
      ? ((revenueActualUsd - revenueEstimateUsd) / Math.abs(revenueEstimateUsd)) * 100
      : null;
    const revenueActualYoyPercent = percentageChange(revenueActualUsd, revenuePreviousYearUsd);
    const revenueEstimateYoyPercent = parseNumber(event.revenueEstimateYoyPercent) ?? percentageChange(revenueEstimateUsd, revenuePreviousYearUsd);
    const epsPreviousYear = parseNumber(event.epsPreviousYear);
    const epsActualYoyPercent = percentageChange(event.epsActual, epsPreviousYear);
    const epsEstimateYoyPercent = parseNumber(event.epsEstimateYoyPercent) ?? percentageChange(event.epsEstimate, epsPreviousYear);
    const output = {
      ...event,
      currency,
      revenueEstimate,
      revenueEstimateUsd,
      revenueEstimateCurrency: 'USD',
      revenueOriginalCurrency: currency,
      revenueFxRate: rate || null,
      revenueFxSource: currency === 'USD' ? 'identity' : readFxSource(fxRates, currency),
      revenueActual,
      revenueActualUsd,
      revenueActualCurrency: revenueActualUsd !== null ? 'USD' : null,
      revenueActualOriginalCurrency: revenueActual !== null ? actualCurrency : null,
      revenueActualFxRate: revenueActual !== null ? actualRate || null : null,
      revenueActualFxSource: revenueActual !== null ? (actualCurrency === 'USD' ? 'identity' : readFxSource(fxRates, actualCurrency)) : null,
      revenuePreviousYear,
      revenuePreviousYearUsd,
      revenuePreviousYearCurrency: revenuePreviousYearUsd !== null ? 'USD' : null,
      revenuePreviousYearOriginalCurrency: revenuePreviousYear !== null ? previousRevenueCurrency : null,
      revenuePreviousYearFxRate: revenuePreviousYear !== null ? previousRevenueRate || null : null,
      revenueSurprisePercent,
      revenueActualYoyPercent,
      revenueEstimateYoyPercent,
      epsPreviousYear,
      epsActualYoyPercent,
      epsEstimateYoyPercent,
    };
    const earningsPublished = isEarningsPublished(output);
    return {
      ...output,
      earningsPublished,
      publishedUntil: earningsPublished ? addUtcDays(output.reportDate, 2) : null,
      earningsResult: earningsPublished ? classifyEarningsResult(output) : null,
    };
  });
}

export async function enrichPublishedEarningsData({ events, eodhdKey }) {
  const published = (events || []).filter((event) => parseNumber(event.epsActual) !== null);
  if (published.length === 0) return events || [];

  const symbols = Array.from(new Set(published.map((event) => event.symbol).filter(Boolean)));
  const [incomeRowsBySymbol, eodRowsBySymbol] = await Promise.all([
    fetchEodhdQuarterlyIncomeStatements({ symbols, eodhdKey }),
    fetchEodhdEodRowsForEarnings({ events: published, eodhdKey }),
  ]);

  return (events || []).map((event) => {
    if (parseNumber(event.epsActual) === null) return event;
    const incomeRows = incomeRowsBySymbol.get(event.symbol) || [];
    const incomeRow = incomeRows.find((row) => dateKey(row.date) === event.fiscalDate) || null;
    const previousIncomeRow = incomeRows.find((row) => dateKey(row.date) === previousYearDate(event.fiscalDate)) || null;
    const eodRows = eodRowsBySymbol.get(event.symbol) || [];
    const reaction = calculateEarningsMarketReaction({
      rows: eodRows,
      reportDate: event.reportDate,
      session: event.session,
    });
    return {
      ...event,
      revenueActual: parseNumber(incomeRow?.totalRevenue),
      revenueActualOriginalCurrency: normalizeCurrency(incomeRow?.currency_symbol || incomeRow?.currency || event.currency) || event.currency,
      revenueActualSource: incomeRow ? 'eodhd-fundamentals-income-statement' : null,
      revenuePreviousYear: parseNumber(previousIncomeRow?.totalRevenue),
      revenuePreviousYearOriginalCurrency: normalizeCurrency(previousIncomeRow?.currency_symbol || previousIncomeRow?.currency || event.currency) || event.currency,
      revenuePreviousYearSource: previousIncomeRow ? 'eodhd-fundamentals-income-statement' : null,
      marketReactionPercent: reaction?.percent ?? null,
      marketReactionBaseDate: reaction?.baseDate ?? null,
      marketReactionTargetDate: reaction?.targetDate ?? null,
      marketReactionSession: reaction?.session ?? event.session ?? null,
    };
  });
}

export async function fetchEodhdQuarterlyIncomeStatements({ symbols, eodhdKey }) {
  const entries = await Promise.all((symbols || []).map(async (symbol) => {
    const eodhdSymbol = toEodhdUsSymbol(symbol);
    if (!eodhdSymbol) return [symbol, []];
    try {
      const url = new URL(`https://eodhd.com/api/v1.1/fundamentals/${eodhdSymbol}`);
      url.searchParams.set('api_token', eodhdKey);
      url.searchParams.set('fmt', 'json');
      url.searchParams.set('filter', 'Financials::Income_Statement::quarterly');
      const response = await fetchWithTimeout(url.toString(), {}, { provider: `eodhd:fundamentals-income:${eodhdSymbol}`, timeoutMs: QUOTE_TIMEOUTS.eodhd });
      if (!response.ok) return [normalizeEarningsSymbol(symbol), []];
      const body = await response.json();
      return [normalizeEarningsSymbol(symbol), normalizeObjectRows(body)];
    } catch {
      return [normalizeEarningsSymbol(symbol), []];
    }
  }));
  return new Map(entries);
}

export async function fetchEodhdEodRowsForEarnings({ events, eodhdKey }) {
  const ranges = new Map();
  (events || []).forEach((event) => {
    const symbol = normalizeEarningsSymbol(event.symbol);
    const reportDate = dateKey(event.reportDate);
    if (!symbol || !reportDate) return;
    const from = addUtcDays(reportDate, -5);
    const to = addUtcDays(reportDate, 5);
    const current = ranges.get(symbol);
    ranges.set(symbol, {
      from: current ? minDate(current.from, from) : from,
      to: current ? maxDate(current.to, to) : to,
    });
  });

  const entries = await Promise.all(Array.from(ranges.entries()).map(async ([symbol, range]) => {
    const eodhdSymbol = toEodhdUsSymbol(symbol);
    try {
      const url = new URL(`https://eodhd.com/api/eod/${eodhdSymbol}`);
      url.searchParams.set('api_token', eodhdKey);
      url.searchParams.set('fmt', 'json');
      url.searchParams.set('period', 'd');
      url.searchParams.set('from', range.from);
      url.searchParams.set('to', range.to);
      const response = await fetchWithTimeout(url.toString(), {}, { provider: `eodhd:eod-earnings:${eodhdSymbol}`, timeoutMs: QUOTE_TIMEOUTS.eodhd });
      if (!response.ok) return [symbol, []];
      const body = await response.json();
      return [symbol, Array.isArray(body) ? body : []];
    } catch {
      return [symbol, []];
    }
  }));
  return new Map(entries);
}

export function calculateEarningsMarketReaction({ rows, reportDate, session }) {
  const sorted = (Array.isArray(rows) ? rows : [])
    .filter((row) => dateKey(row.date))
    .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
  const targetDate = dateKey(reportDate);
  if (!sorted.length || !targetDate) return null;

  let base = null;
  let target = null;
  if (session === 'post') {
    base = sorted.find((row) => dateKey(row.date) === targetDate) || lastRowBefore(sorted, targetDate);
    target = firstRowAfter(sorted, dateKey(base?.date || targetDate));
  } else if (session === 'pre') {
    target = firstRowOnOrAfter(sorted, targetDate);
    base = lastRowBefore(sorted, dateKey(target?.date || targetDate));
  } else {
    target = firstRowOnOrAfter(sorted, targetDate);
    base = lastRowBefore(sorted, dateKey(target?.date || targetDate));
  }

  const baseClose = closePrice(base);
  const targetClose = closePrice(target);
  if (!(baseClose > 0) || !(targetClose > 0)) return null;
  return {
    baseDate: dateKey(base.date),
    targetDate: dateKey(target.date),
    percent: ((targetClose - baseClose) / baseClose) * 100,
    session,
  };
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

function normalizeObjectRows(body) {
  if (Array.isArray(body)) return body.filter((row) => row && typeof row === 'object');
  if (body && typeof body === 'object') return Object.values(body).filter((row) => row && typeof row === 'object');
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
  const eventDate = dateKey(event.date || event.fiscalDate || event.report_date || event.reportDate);
  if (!eventDate) return candidates[0];
  return [...candidates].sort((a, b) => {
    const aDiff = Math.abs(daysBetween(eventDate, dateKey(a.report_date || a.reportDate || a.date || a.period)));
    const bDiff = Math.abs(daysBetween(eventDate, dateKey(b.report_date || b.reportDate || b.date || b.period)));
    return aDiff - bDiff || trendPeriodRank(a.period) - trendPeriodRank(b.period);
  })[0];
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGrowthPercent(value) {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return Math.abs(parsed) <= 5 ? parsed * 100 : parsed;
}

function percentageChange(current, previous) {
  const currentValue = parseNumber(current);
  const previousValue = parseNumber(previous);
  if (currentValue === null || !(previousValue > 0)) return null;
  return ((currentValue - previousValue) / previousValue) * 100;
}

function previousYearDate(value) {
  const key = dateKey(value);
  if (!key) return '';
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

function trendPeriodRank(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '0q' || raw === '0') return 0;
  if (!raw) return 1;
  if (raw === '+1q' || raw === '1q') return 2;
  if (raw === '-1q') return 3;
  return 4;
}

function normalizeCurrency(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function readFxRate(fxRates, currency) {
  if (currency === 'USD') return 1;
  const item = fxRates instanceof Map ? fxRates.get(currency) : fxRates?.[currency];
  if (typeof item === 'number') return item;
  const rate = parseNumber(item?.localPerUsd ?? item?.rate);
  return rate > 0 ? rate : null;
}

function readFxSource(fxRates, currency) {
  const item = fxRates instanceof Map ? fxRates.get(currency) : fxRates?.[currency];
  return item?.source || null;
}

function addUtcDays(date, days) {
  const base = new Date(`${dateKey(date)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function minDate(a, b) {
  const left = dateKey(a);
  const right = dateKey(b);
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function maxDate(a, b) {
  const left = dateKey(a);
  const right = dateKey(b);
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function firstRowOnOrAfter(rows, targetDate) {
  return rows.find((row) => dateKey(row.date) >= targetDate) || null;
}

function firstRowAfter(rows, targetDate) {
  return rows.find((row) => dateKey(row.date) > targetDate) || null;
}

function lastRowBefore(rows, targetDate) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (dateKey(rows[index].date) < targetDate) return rows[index];
  }
  return null;
}

function closePrice(row) {
  return parseNumber(row?.adjusted_close ?? row?.close);
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
