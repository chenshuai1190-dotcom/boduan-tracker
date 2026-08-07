import { requireQuoteAuth, setCorsHeaders } from '../server/quote/auth.js';
import { sendError } from '../server/quote/errors.js';
import { fetchWithTimeout, QUOTE_TIMEOUTS } from '../server/quote/http.js';
import {
  fetchSecOfficialActuals,
  isSecOfficialActualSupportedEvent,
  mergeSecOfficialActuals,
} from '../server/earnings/secOfficialActuals.js';
import {
  fetchSecEarningsDetail,
  parseEarningsDetailRequest,
} from '../server/earnings/secEarningsDetail.js';
import { fetchSecFinancialHistory } from '../server/earnings/secFinancialHistory.js';
import { fetchEodhdFinancialHistory } from '../server/earnings/eodhdFinancialHistory.js';
import {
  fetchOfficialFundComposition,
  isOfficialFundCompositionSupportedSymbol,
} from '../server/earnings/officialFundComposition.js';
import {
  classifyEarningsResult,
  dateKey,
  EARNINGS_PUBLISHED_RETENTION_DAYS,
  isEarningsPublished,
  MAX_EARNINGS_SYMBOLS,
  normalizeEarningsSession,
  normalizeEarningsSymbol,
  toEodhdUsSymbol,
} from '../src/lib/earningsCalendarModel.js';

const MAX_RANGE_DAYS = 90;
const OFFICIAL_ACTUAL_MIGRATION_DAYS = 30;
const EODHD_FISCAL_DATE_TOLERANCE_DAYS = 7;
const INCLUDE_PREVIOUS_PUBLISHED_PARAM = 'includePreviousPublished';
const PUBLISHED_FUNDAMENTALS_FILTER = [
  'General::Sector',
  'Financials::Income_Statement::quarterly',
  'Earnings::History',
].join(',');
const USD_FOREX_SYMBOL_BY_CURRENCY = {
  CNY: 'USDCNY.FOREX',
  EUR: 'USDEUR.FOREX',
  HKD: 'USDHKD.FOREX',
  JPY: 'USDJPY.FOREX',
  KRW: 'USDKRW.FOREX',
  TWD: 'USDTWD.FOREX',
};

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method Not Allowed');
  }

  const auth = await requireQuoteAuth(req, res);
  if (!auth.ok) return;

  if (singleQueryValue(req.query?.operation) === 'detail') {
    return handleEarningsDetailRequest(req, res);
  }
  if (singleQueryValue(req.query?.operation) === 'growth') {
    return handleEarningsGrowthRequest(req, res);
  }
  if (singleQueryValue(req.query?.operation) === 'fund-composition') {
    return handleFundCompositionRequest(req, res);
  }

  const parsed = parseEarningsRequest(req.query);
  if (parsed.error) return sendError(res, 400, parsed.error);

  const eodhdKey = (process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) return sendError(res, 500, '财报日历服务未配置: 缺少 EODHD_API_KEY');

  try {
    const [events, trends] = await Promise.all([
      fetchEodhdEarningsCalendar({ ...parsed, eodhdKey }),
      fetchEodhdEarningsTrends({ symbols: parsed.symbols, eodhdKey }),
    ]);
    const merged = mergeEarningsTrendData(events, trends);
    const enriched = await enrichPublishedEarningsData({
      events: merged,
      eodhdKey,
      includeOfficialMigration: parsed.forceOfficialRefresh,
    });
    const fxRates = await fetchEodhdUsdForexRates({
      currencies: enriched.flatMap((event) => [
        event.currency,
        event.revenueOriginalCurrency,
        event.revenueActualOriginalCurrency,
        event.revenuePreviousYearOriginalCurrency,
        event.ebitActualOriginalCurrency,
        event.ebitPreviousYearOriginalCurrency,
      ]),
      eodhdKey,
    });
    const normalized = mergeEarningsRevenueUsd(enriched, fxRates);

    res.setHeader('Cache-Control', 'private, max-age=900, stale-while-revalidate=1800');
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

export async function handleEarningsDetailRequest(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const parsed = parseEarningsDetailRequest(req.query);
  if (parsed.error) return sendError(res, 400, parsed.error);

  try {
    const detail = await fetchSecEarningsDetail(parsed);
    res.setHeader(
      'Cache-Control',
      detail.status === 'complete' || detail.status === 'partial'
        ? 'private, max-age=21600, stale-while-revalidate=1800'
        : 'private, max-age=300',
    );
    return res.status(200).json({
      success: true,
      ...detail,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return sendError(res, 502, '财报详情读取失败');
  }
}

export async function handleEarningsGrowthRequest(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const symbol = normalizeEarningsSymbol(singleQueryValue(req.query?.symbol));
  if (!symbol) return sendError(res, 400, '需要合法的 symbol 参数');

  try {
    let history;
    if (symbol === 'TSM') {
      const eodhdKey = (process.env.EODHD_API_KEY || '')
        .trim()
        .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
      if (!eodhdKey) return sendError(res, 500, '业绩趋势服务未配置: 缺少 EODHD_API_KEY');
      history = await fetchEodhdFinancialHistory({ symbol, eodhdKey });
    } else {
      history = await fetchSecFinancialHistory({ symbol });
    }
    res.setHeader(
      'Cache-Control',
      history.status === 'complete' || history.status === 'partial'
        ? 'private, max-age=21600, stale-while-revalidate=1800'
        : 'private, max-age=300',
    );
    return res.status(200).json({
      success: true,
      ...history,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return sendError(res, 502, '业绩趋势读取失败');
  }
}

export async function handleFundCompositionRequest(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const symbol = normalizeEarningsSymbol(singleQueryValue(req.query?.symbol));
  if (!symbol || !isOfficialFundCompositionSupportedSymbol(symbol)) {
    return sendError(res, 400, '该代码没有可用的官方基金构成');
  }
  try {
    const composition = await fetchOfficialFundComposition({ symbol });
    res.setHeader(
      'Cache-Control',
      composition.status === 'complete' || composition.status === 'partial'
        ? 'private, max-age=21600, stale-while-revalidate=1800'
        : 'private, max-age=300',
    );
    return res.status(200).json({
      success: true,
      ...composition,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return sendError(res, 502, '基金构成读取失败');
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

  const includePreviousPublished = parseBooleanQuery(query[INCLUDE_PREVIOUS_PUBLISHED_PARAM]);
  const forceOfficialRefresh = parseBooleanQuery(query.refresh);

  return { symbols, from, to, includePreviousPublished, forceOfficialRefresh };
}

export async function fetchEodhdEarningsCalendar({
  symbols,
  from,
  to,
  includePreviousPublished = false,
  eodhdKey,
  now = new Date(),
}) {
  const eodhdSymbols = symbols.map(toEodhdUsSymbol).filter(Boolean);
  const today = newYorkDateKey(now) || newYorkDateKey(new Date());
  const publishedHistoryFrom = addUtcDays(today, -MAX_RANGE_DAYS);
  // The requested current/future window is authoritative and must fail closed.
  // EODHD ignores from/to when symbols are present, so always use explicit dates.
  const currentWindowRequest = fetchEodhdEarningsCalendarRows({ from, to, eodhdKey });
  // Reuse the second existing Calendar request only for bounded latest-published
  // history. A history supplement failure must not hide the complete main range.
  const publishedHistoryRequest = includePreviousPublished
    ? fetchEodhdEarningsCalendarRows({ from: publishedHistoryFrom, to: today, eodhdKey })
      .catch(() => [])
    : Promise.resolve([]);
  const payloads = await Promise.all([currentWindowRequest, publishedHistoryRequest]);
  return selectEarningsCalendarRows({
    rows: payloads.flat(),
    symbols: eodhdSymbols,
    from,
    to,
    today,
    includePreviousPublished,
  });
}

async function fetchEodhdEarningsCalendarRows({ from, to, eodhdKey }) {
  const url = new URL('https://eodhd.com/api/calendar/earnings');
  url.searchParams.set('api_token', eodhdKey);
  url.searchParams.set('fmt', 'json');
  if (from) url.searchParams.set('from', from);
  if (to) url.searchParams.set('to', to);

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
      dateKey(row?.providerFiscalDate || row?.date || row?.fiscalDate),
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

export function selectEarningsCalendarRows({
  rows,
  symbols,
  from,
  to,
  today,
  includePreviousPublished = false,
} = {}) {
  const requested = new Set((symbols || []).map(toEodhdUsSymbol).filter(Boolean));
  const fromKey = dateKey(from);
  const toKey = dateKey(to);
  const todayKey = dateKey(today);
  const currentRows = [];
  const latestPublishedBySymbol = new Map();

  for (const event of dedupeCalendarRows(rows)) {
    const eodhdSymbol = toEodhdUsSymbol(event?.code || event?.symbol);
    const reportDate = dateKey(event?.report_date || event?.reportDate);
    if (!requested.has(eodhdSymbol) || !reportDate) continue;

    if (fromKey && toKey && reportDate >= fromKey && reportDate <= toKey) {
      currentRows.push(event);
    }

    if (
      !includePreviousPublished
      || !todayKey
      || reportDate > todayKey
      || !isCalendarRowPublished(event)
    ) {
      continue;
    }

    const fiscalDate = dateKey(event?.providerFiscalDate || event?.date || event?.fiscalDate);
    const previous = latestPublishedBySymbol.get(eodhdSymbol);
    if (
      !previous
      || reportDate > previous.reportDate
      || (reportDate === previous.reportDate && fiscalDate > previous.fiscalDate)
    ) {
      latestPublishedBySymbol.set(eodhdSymbol, { event, reportDate, fiscalDate });
    }
  }

  return dedupeCalendarRows([
    ...currentRows,
    ...Array.from(latestPublishedBySymbol.values(), ({ event }) => event),
  ]);
}

function isCalendarRowPublished(event) {
  return event?.earningsPublished === true
    || parseNumber(event?.actual) !== null
    || parseNumber(event?.epsActual) !== null
    || parseNumber(event?.revenueActualUsd) !== null
    || parseNumber(event?.revenueActual) !== null;
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
    const currentQuarterTrend = findExactCurrentQuarterEarningsTrend(event, candidates);
    const explicitProviderFiscalDate = dateKey(
      event.providerFiscalDate
      || event.calendarFiscalDate,
    );
    const providerFiscalDate = explicitProviderFiscalDate || dateKey(
      event.date
      || event.fiscalDate
      || event.report_date
      || event.reportDate,
    );
    const fiscalDate = dateKey(
      event.officialFiscalDate
      || (explicitProviderFiscalDate ? event.fiscalDate : null)
      || providerFiscalDate
      || event.report_date
      || event.reportDate,
    );
    const calendarEpsEstimate = parseNumber(event.estimate ?? event.epsEstimate);
    const trendEpsEstimate = parseNumber(currentQuarterTrend?.earningsEstimateAvg);
    const epsEstimate = trendEpsEstimate ?? calendarEpsEstimate;
    const epsActual = parseNumber(event.actual ?? event.epsActual);
    const epsDifference = calculateEpsDifference(epsActual, epsEstimate)
      ?? parseNumber(event.difference ?? event.epsDifference);
    const surprisePercent = calculateEpsSurprisePercent(epsActual, epsEstimate)
      ?? parseNumber(event.percent ?? event.surprisePercent);
    return {
      ...event,
      symbol,
      code: event.code || `${symbol}.US`,
      reportDate: dateKey(event.report_date || event.reportDate || event.date),
      fiscalDate,
      providerFiscalDate: providerFiscalDate || fiscalDate,
      officialFiscalDate: dateKey(event.officialFiscalDate)
        || (explicitProviderFiscalDate && fiscalDate !== providerFiscalDate ? fiscalDate : null),
      session: normalizeEarningsSession(event.before_after_market || event.beforeAfterMarket || event.time || event.session),
      epsEstimate,
      epsActual,
      epsDifference,
      surprisePercent,
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
    const ebitActualCurrency = normalizeCurrency(event.ebitActualOriginalCurrency || event.ebitActualCurrency || actualCurrency || currency) || actualCurrency || currency;
    const ebitActual = parseNumber(event.ebitActual);
    const ebitActualRate = readFxRate(fxRates, ebitActualCurrency);
    const ebitActualUsd = ebitActual !== null && ebitActualRate > 0
      ? (ebitActualCurrency === 'USD' ? ebitActual : ebitActual / ebitActualRate)
      : null;
    const previousEbitCurrency = normalizeCurrency(event.ebitPreviousYearOriginalCurrency || event.ebitPreviousYearCurrency || ebitActualCurrency || actualCurrency || currency) || ebitActualCurrency || actualCurrency || currency;
    const ebitPreviousYear = parseNumber(event.ebitPreviousYear);
    const previousEbitRate = readFxRate(fxRates, previousEbitCurrency);
    const ebitPreviousYearUsd = ebitPreviousYear !== null && previousEbitRate > 0
      ? (previousEbitCurrency === 'USD' ? ebitPreviousYear : ebitPreviousYear / previousEbitRate)
      : null;
    const revenueSurprisePercent = revenueEstimateUsd !== null && revenueEstimateUsd !== 0 && revenueActualUsd !== null
      ? ((revenueActualUsd - revenueEstimateUsd) / Math.abs(revenueEstimateUsd)) * 100
      : null;
    const revenueActualYoyPercent = percentageChange(revenueActualUsd, revenuePreviousYearUsd);
    const revenueEstimateYoyPercent = parseNumber(event.revenueEstimateYoyPercent) ?? percentageChange(revenueEstimateUsd, revenuePreviousYearUsd);
    const ebitActualYoyPercent = percentageChange(ebitActualUsd, ebitPreviousYearUsd);
    const epsPreviousYear = parseNumber(event.epsPreviousYear);
    const epsActualYoyPercent = percentageChange(event.epsActual, epsPreviousYear);
    const epsEstimateYoyPercent = percentageChange(event.epsEstimate, epsPreviousYear);
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
      ebitActual,
      ebitActualUsd,
      ebitActualCurrency: ebitActualUsd !== null ? 'USD' : null,
      ebitActualOriginalCurrency: ebitActual !== null ? ebitActualCurrency : null,
      ebitActualFxRate: ebitActual !== null ? ebitActualRate || null : null,
      ebitActualFxSource: ebitActual !== null ? (ebitActualCurrency === 'USD' ? 'identity' : readFxSource(fxRates, ebitActualCurrency)) : null,
      ebitPreviousYear,
      ebitPreviousYearUsd,
      ebitPreviousYearCurrency: ebitPreviousYearUsd !== null ? 'USD' : null,
      ebitPreviousYearOriginalCurrency: ebitPreviousYear !== null ? previousEbitCurrency : null,
      ebitPreviousYearFxRate: ebitPreviousYear !== null ? previousEbitRate || null : null,
      ebitActualYoyPercent,
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

export async function enrichPublishedEarningsData({
  events,
  eodhdKey,
  now = new Date(),
  includeOfficialMigration = false,
  fetchPublishedFundamentals = fetchEodhdPublishedFundamentals,
  fetchEodRows = fetchEodhdEodRowsForEarnings,
  fetchOfficialActuals = fetchSecOfficialActuals,
} = {}) {
  const inputEvents = events || [];
  const today = newYorkDateKey(now) || newYorkDateKey(new Date());
  const recentPublishedFrom = addUtcDays(today, -EARNINGS_PUBLISHED_RETENTION_DAYS);
  const officialMigrationFrom = addUtcDays(today, -OFFICIAL_ACTUAL_MIGRATION_DAYS);
  const eodhdPublished = inputEvents.filter((event) => parseNumber(event.epsActual) !== null);
  const secCandidates = inputEvents.filter((event) => {
    const reportDate = dateKey(event?.reportDate || event?.report_date);
    if (!reportDate || reportDate > today) return false;
    return reportDate >= recentPublishedFrom
      || (
        includeOfficialMigration
        && reportDate >= officialMigrationFrom
        && isSecOfficialActualSupportedEvent(
          event?.symbol || event?.code,
          event?.providerFiscalDate || event?.date || event?.fiscalDate,
        )
      );
  });
  const candidates = dedupeEarningsEvents([...eodhdPublished, ...secCandidates]);
  if (candidates.length === 0) return inputEvents;

  const candidateKeys = new Set(candidates.map(earningsActualKey));
  const symbols = Array.from(new Set(candidates.map((event) => event.symbol).filter(Boolean)));
  const [fundamentalsBySymbol, eodRowsBySymbol, officialActuals] = await Promise.all([
    fetchPublishedFundamentals({ symbols, eodhdKey }),
    fetchEodRows({ events: candidates, eodhdKey }),
    fetchOfficialActuals({ events: secCandidates, now }),
  ]);

  const eodhdEnriched = inputEvents.map((event) => {
    if (!candidateKeys.has(earningsActualKey(event))) return event;
    const fundamentals = fundamentalsBySymbol.get(event.symbol) || {};
    const incomeRows = fundamentals.incomeRows || [];
    const earningsHistoryRows = fundamentals.earningsHistoryRows || [];
    const incomeRow = findUniqueNearestFiscalRow(incomeRows, event.fiscalDate);
    const previousIncomeRow = findUniqueNearestFiscalRow(incomeRows, previousYearDate(event.fiscalDate));
    const financialServices = isFinancialServicesSector(fundamentals.sector);
    const reportedRevenue = resolveReportedRevenue(incomeRow, previousIncomeRow, fundamentals.sector);
    const reportedEbit = resolveReportedEbit(incomeRow, previousIncomeRow, fundamentals.sector);
    const reportedEps = resolvePublishedEps(event, earningsHistoryRows);
    const publishedFinancialsComplete = financialServices
      ? reportedEbit.actual !== null
      : reportedRevenue.actual !== null && reportedEbit.actual !== null;
    const eodRows = eodRowsBySymbol.get(event.symbol) || [];
    const reaction = calculateEarningsMarketReaction({
      rows: eodRows,
      reportDate: event.reportDate,
      session: event.session,
    });
    return {
      ...event,
      epsActual: reportedEps.actual,
      epsActualSource: reportedEps.source,
      epsProviderConflict: reportedEps.providerConflict,
      epsPreviousYear: reportedEps.previousYear,
      epsDifference: calculateEpsDifference(reportedEps.actual, event.epsEstimate),
      surprisePercent: calculateEpsSurprisePercent(reportedEps.actual, event.epsEstimate),
      publishedFinancialsComplete,
      revenueActual: reportedRevenue.actual,
      revenueActualSuppressed: financialServices,
      revenueActualOriginalCurrency: reportedRevenue.actual !== null
        ? normalizeCurrency(incomeRow?.currency_symbol || incomeRow?.currency || event.currency) || event.currency
        : null,
      revenueActualSource: reportedRevenue.actual !== null ? 'eodhd-fundamentals-income-statement' : null,
      revenuePreviousYear: reportedRevenue.previousYear,
      revenuePreviousYearOriginalCurrency: reportedRevenue.previousYear !== null
        ? normalizeCurrency(previousIncomeRow?.currency_symbol || previousIncomeRow?.currency || event.currency) || event.currency
        : null,
      revenuePreviousYearSource: reportedRevenue.previousYear !== null ? 'eodhd-fundamentals-income-statement' : null,
      ebitActual: reportedEbit.actual,
      ebitActualOriginalCurrency: reportedEbit.actual !== null
        ? normalizeCurrency(incomeRow?.currency_symbol || incomeRow?.currency || event.currency) || event.currency
        : null,
      ebitActualSource: reportedEbit.actual !== null ? 'eodhd-fundamentals-income-statement' : null,
      ebitActualBasis: reportedEbit.basis,
      ebitPreviousYear: reportedEbit.previousYear,
      ebitPreviousYearOriginalCurrency: reportedEbit.previousYear !== null
        ? normalizeCurrency(previousIncomeRow?.currency_symbol || previousIncomeRow?.currency || event.currency) || event.currency
        : null,
      ebitPreviousYearSource: reportedEbit.previousYear !== null ? 'eodhd-fundamentals-income-statement' : null,
      ebitPreviousYearBasis: reportedEbit.previousYear !== null ? reportedEbit.basis : null,
      marketReactionPercent: reaction?.percent ?? null,
      marketReactionBaseDate: reaction?.baseDate ?? null,
      marketReactionTargetDate: reaction?.targetDate ?? null,
      marketReactionSession: reaction?.session ?? event.session ?? null,
    };
  });

  return mergeSecOfficialActuals(eodhdEnriched, officialActuals).map((event) => {
    if (!candidateKeys.has(earningsActualKey(event))) return event;
    const epsDifference = calculateEpsDifference(event.epsActual, event.epsEstimate);
    const surprisePercent = calculateEpsSurprisePercent(event.epsActual, event.epsEstimate);
    return {
      ...event,
      actual: event.epsActual,
      epsDifference,
      difference: epsDifference,
      surprisePercent,
      percent: surprisePercent,
    };
  });
}

function dedupeEarningsEvents(events) {
  const output = new Map();
  for (const event of events || []) {
    const key = earningsActualKey(event);
    if (key && !output.has(key)) output.set(key, event);
  }
  return Array.from(output.values());
}

function earningsActualKey(event) {
  const symbol = normalizeEarningsSymbol(event?.symbol || event?.code);
  const fiscalDate = dateKey(event?.providerFiscalDate || event?.date || event?.fiscalDate);
  return symbol && fiscalDate ? `${symbol}|${fiscalDate}` : '';
}

function newYorkDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function resolveReportedRevenue(actualRow, previousRow, sector = '') {
  if (isFinancialServicesSector(sector)) {
    return { actual: null, previousYear: null, basis: null };
  }
  const actual = parseNumber(actualRow?.totalRevenue);
  if (actual === null) return { actual: null, previousYear: null, basis: null };
  return {
    actual,
    previousYear: parseNumber(previousRow?.totalRevenue),
    basis: 'totalRevenue',
  };
}

export function resolveReportedEbit(actualRow, previousRow, sector = '') {
  const basis = isFinancialServicesSector(sector) ? 'incomeBeforeTax' : 'operatingIncome';
  const actual = parseNumber(actualRow?.[basis]);
  if (actual === null) return { actual: null, previousYear: null, basis: null };
  return {
    actual,
    previousYear: parseNumber(previousRow?.[basis]),
    basis,
  };
}

export function resolvePublishedEps(event, earningsHistoryRows = []) {
  const fiscalDate = dateKey(event?.providerFiscalDate || event?.date || event?.fiscalDate);
  const currentRow = findUniqueNearestFiscalRow(earningsHistoryRows, fiscalDate);
  const previousRow = findUniqueNearestFiscalRow(earningsHistoryRows, previousYearDate(fiscalDate));
  const historyActual = parseNumber(currentRow?.epsActual);
  const calendarActual = parseNumber(event?.epsActual);
  const actual = calendarActual ?? historyActual;
  const historyPreviousYear = parseNumber(previousRow?.epsActual);
  const providerConflict = calendarActual !== null
    && historyActual !== null
    && Math.abs(calendarActual - historyActual) > 1e-9;
  return {
    actual,
    previousYear: parseNumber(event?.epsPreviousYear) ?? historyPreviousYear,
    source: calendarActual !== null
      ? (event?.epsActualSource || 'eodhd-calendar')
      : (historyActual !== null ? 'eodhd-fundamentals-earnings-history' : null),
    providerConflict,
  };
}

export function findUniqueNearestFiscalRow(
  rows,
  targetDate,
  toleranceDays = EODHD_FISCAL_DATE_TOLERANCE_DAYS,
) {
  const target = parseUtcDate(targetDate);
  if (!target) return null;
  const candidates = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const rowDate = parseUtcDate(row?.date);
      return rowDate
        ? { row, distance: Math.abs(Math.round((rowDate.getTime() - target.getTime()) / 86400000)) }
        : null;
    })
    .filter((candidate) => candidate && candidate.distance <= Math.max(0, Number(toleranceDays) || 0))
    .sort((left, right) => (
      left.distance - right.distance
      || String(right.row?.filing_date || right.row?.filingDate || '').localeCompare(
        String(left.row?.filing_date || left.row?.filingDate || ''),
      )
    ));
  if (candidates.length === 0) return null;
  const nearestDistance = candidates[0].distance;
  const nearestDates = new Set(
    candidates
      .filter((candidate) => candidate.distance === nearestDistance)
      .map((candidate) => dateKey(candidate.row?.date)),
  );
  return nearestDates.size === 1 ? candidates[0].row : null;
}

function isFinancialServicesSector(value) {
  return String(value || '').trim().toLowerCase() === 'financial services';
}

export async function fetchEodhdPublishedFundamentals({ symbols, eodhdKey }) {
  const entries = await Promise.all((symbols || []).map(async (symbol) => {
    const normalizedSymbol = normalizeEarningsSymbol(symbol);
    const eodhdSymbol = toEodhdUsSymbol(symbol);
    if (!eodhdSymbol) return [normalizedSymbol, { sector: '', incomeRows: [], earningsHistoryRows: [] }];
    try {
      const url = new URL(`https://eodhd.com/api/v1.1/fundamentals/${eodhdSymbol}`);
      url.searchParams.set('api_token', eodhdKey);
      url.searchParams.set('fmt', 'json');
      url.searchParams.set('filter', PUBLISHED_FUNDAMENTALS_FILTER);
      const response = await fetchWithTimeout(url.toString(), {}, { provider: `eodhd:published-fundamentals:${eodhdSymbol}`, timeoutMs: QUOTE_TIMEOUTS.eodhd });
      if (!response.ok) return [normalizedSymbol, { sector: '', incomeRows: [], earningsHistoryRows: [] }];
      const body = await response.json();
      return [normalizedSymbol, {
        sector: String(providerField(body, 'General::Sector') || '').trim(),
        incomeRows: normalizeObjectRows(providerField(body, 'Financials::Income_Statement::quarterly')),
        earningsHistoryRows: normalizeObjectRows(providerField(body, 'Earnings::History')),
      }];
    } catch {
      return [normalizedSymbol, { sector: '', incomeRows: [], earningsHistoryRows: [] }];
    }
  }));
  return new Map(entries);
}

function providerField(data, path) {
  if (!data || typeof data !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(data, path)) return data[path];
  return path.split('::').reduce((value, key) => value?.[key], data);
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
  const normalizedSession = normalizeEarningsSession(session);
  if (normalizedSession === 'unknown') return null;

  let base = null;
  let target = null;
  if (normalizedSession === 'post') {
    base = sorted.find((row) => dateKey(row.date) === targetDate) || lastRowBefore(sorted, targetDate);
    target = firstRowAfter(sorted, dateKey(base?.date || targetDate));
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
    session: normalizedSession,
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
  const eventDate = dateKey(
    event.providerFiscalDate
    || event.date
    || event.fiscalDate
    || event.report_date
    || event.reportDate,
  );
  if (!eventDate) return candidates[0];
  return [...candidates].sort((a, b) => {
    const aDiff = Math.abs(daysBetween(eventDate, dateKey(a.report_date || a.reportDate || a.date || a.period)));
    const bDiff = Math.abs(daysBetween(eventDate, dateKey(b.report_date || b.reportDate || b.date || b.period)));
    return aDiff - bDiff || trendPeriodRank(a.period) - trendPeriodRank(b.period);
  })[0];
}

function findExactCurrentQuarterEarningsTrend(event, candidates) {
  const fiscalDate = dateKey(event.providerFiscalDate || event.date || event.fiscalDate);
  if (!fiscalDate) return null;
  return candidates.find((candidate) => {
    const period = String(candidate?.period || '').trim().toLowerCase();
    if (period !== '0q' && period !== '0') return false;
    const candidateDate = dateKey(candidate.date || candidate.fiscalDate || candidate.report_date || candidate.reportDate);
    return candidateDate === fiscalDate && parseNumber(candidate.earningsEstimateAvg) !== null;
  }) || null;
}

function calculateEpsDifference(actual, estimate) {
  const actualValue = parseNumber(actual);
  const estimateValue = parseNumber(estimate);
  if (actualValue === null || estimateValue === null) return null;
  return actualValue - estimateValue;
}

function calculateEpsSurprisePercent(actual, estimate) {
  const actualValue = parseNumber(actual);
  const estimateValue = parseNumber(estimate);
  if (actualValue === null || estimateValue === null || estimateValue === 0) return null;
  return ((actualValue - estimateValue) / Math.abs(estimateValue)) * 100;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseUtcDate(value) {
  const key = dateKey(value);
  if (!key) return null;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseGrowthPercent(value) {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return Math.abs(parsed) <= 5 ? parsed * 100 : parsed;
}

function parseBooleanQuery(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return ['1', 'true', 'yes', 'y'].includes(String(raw || '').trim().toLowerCase());
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

function singleQueryValue(value) {
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || '').trim() : '';
  return typeof value === 'string' ? value.trim() : '';
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
  return parseNumber(row?.close ?? row?.adjusted_close);
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
