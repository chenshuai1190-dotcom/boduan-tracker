import { fetchSecTenQPrimaryDocument } from './secOfficialActuals.js';
import { parseSecEarningsDetailPrimaryDocument } from './secEarningsDetailParsers.js';

export { parseSecEarningsDetailPrimaryDocument } from './secEarningsDetailParsers.js';

export const SEC_EARNINGS_DETAIL_SCHEMA_VERSION = 1;
export const SEC_EARNINGS_DETAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const SUPPORTED_SYMBOLS = new Set(['GOOG', 'GOOGL', 'TSLA']);
const MAX_REPORT_DELAY_DAYS = 180;
const PENDING_CACHE_TTL_MS = 5 * 60 * 1000;
const RESULT_CACHE_MAX_ENTRIES = 32;
const resultCache = new Map();

export function parseEarningsDetailRequest(query = {}) {
  const rawSymbol = singleQueryValue(query.symbol);
  if (!rawSymbol) return { error: '需要传 symbol 参数' };

  const symbol = normalizeSymbol(rawSymbol);
  if (!/^[A-Z]{1,5}$/.test(symbol)) {
    return { error: `股票代码不合法: ${String(rawSymbol).trim()}` };
  }
  if (!SUPPORTED_SYMBOLS.has(symbol)) {
    return { error: `暂不支持该财报详情: ${String(rawSymbol).trim()}` };
  }

  const rawFiscalDate = singleQueryValue(query.fiscalDate);
  const rawReportDate = singleQueryValue(query.reportDate);
  if (!rawFiscalDate) return { error: '需要传 fiscalDate 参数' };
  if (!rawReportDate) return { error: '需要传 reportDate 参数' };

  const fiscalDate = validDateKey(rawFiscalDate);
  if (!fiscalDate || !isQuarterEnd(fiscalDate)) {
    return { error: 'fiscalDate 必须是有效财季结束日期' };
  }
  const reportDate = validDateKey(rawReportDate);
  if (!reportDate) return { error: 'reportDate 必须是有效日期' };

  const reportDelayDays = daysBetween(fiscalDate, reportDate);
  if (reportDelayDays < 0 || reportDelayDays > MAX_REPORT_DELAY_DAYS) {
    return { error: 'reportDate 与 fiscalDate 不匹配' };
  }
  return { symbol, fiscalDate, reportDate };
}

export async function fetchSecEarningsDetail({
  symbol,
  fiscalDate,
  reportDate,
  fetchFn = globalThis.fetch,
  userAgent,
  now = new Date(),
  requestIntervalMs,
  batchTimeoutMs,
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedFiscalDate = dateKey(fiscalDate);
  const normalizedReportDate = dateKey(reportDate);
  const nowDate = normalizeDate(now) || new Date();
  const cacheEnabled = fetchFn === globalThis.fetch;
  const cacheKey = `${normalizedSymbol}|${normalizedFiscalDate}|${normalizedReportDate}`;
  const cached = readCache(cacheKey, nowDate.getTime(), cacheEnabled);
  if (cached) return cached;

  const period = {
    ...exactQuarterPeriod(normalizedFiscalDate),
    fiscalDate: normalizedFiscalDate,
    reportDate: normalizedReportDate,
  };
  const primary = await fetchSecTenQPrimaryDocument({
    symbol: normalizedSymbol,
    fiscalDate: normalizedFiscalDate,
    reportDate: normalizedReportDate,
    fetchFn,
    userAgent,
    now: nowDate,
    requestIntervalMs,
    batchTimeoutMs,
  });

  if (primary.status !== 'complete') {
    const pending = responseBase({
      status: primary.status === 'unsupported' ? 'unavailable' : 'pending',
      reason: primary.reason || 'sec-unavailable',
      symbol: normalizedSymbol,
      period,
      source: sourceFromPrimary(primary),
      sections: pendingSections(
        primary.status === 'unsupported' ? 'unavailable' : 'pending',
        primary.reason || 'sec-unavailable',
      ),
    });
    writeCache(cacheKey, pending, PENDING_CACHE_TTL_MS, nowDate.getTime(), cacheEnabled);
    return pending;
  }

  const parsed = parseSecEarningsDetailPrimaryDocument({
    symbol: normalizedSymbol,
    fiscalDate: normalizedFiscalDate,
    html: primary.html,
    filing: {
      cik: primary.secCik,
      accession: primary.accession,
      form: primary.form,
    },
  });
  const source = sourceFromPrimary(primary);
  if (!parsed) {
    const unavailable = responseBase({
      status: 'unavailable',
      reason: 'official-primary-document-unparsed',
      symbol: normalizedSymbol,
      period,
      source,
      sections: pendingSections('unavailable', 'official-primary-document-unparsed'),
    });
    writeCache(
      cacheKey,
      unavailable,
      SEC_EARNINGS_DETAIL_CACHE_TTL_MS,
      nowDate.getTime(),
      cacheEnabled,
    );
    return unavailable;
  }

  const result = responseBase({
    status: parsed.status,
    reason: parsed.status === 'complete' ? null : 'one-or-more-sections-unavailable',
    symbol: normalizedSymbol,
    period: {
      ...period,
      start: parsed.period.start,
      end: parsed.period.end,
    },
    source,
    sections: parsed.sections,
  });
  writeCache(
    cacheKey,
    result,
    SEC_EARNINGS_DETAIL_CACHE_TTL_MS,
    nowDate.getTime(),
    cacheEnabled,
  );
  return result;
}

export function clearSecEarningsDetailCachesForTests() {
  resultCache.clear();
}

function responseBase({
  status,
  reason,
  symbol,
  period,
  source,
  sections,
}) {
  return {
    schemaVersion: SEC_EARNINGS_DETAIL_SCHEMA_VERSION,
    status,
    reason,
    symbol,
    currency: 'USD',
    period,
    source,
    sections,
  };
}

function sourceFromPrimary(primary) {
  if (!primary?.secCik) return null;
  return {
    provider: 'SEC',
    cik: primary.secCik,
    accession: primary.accession || null,
    form: primary.form || null,
    filedAt: primary.filedAt || null,
    filingUrl: primary.filingUrl || null,
    primaryDocumentUrl: primary.primaryDocumentUrl || null,
  };
}

function pendingSections(status, reason) {
  return {
    reportSegments: emptySection(status, reason),
    revenueBreakdown: emptySection(status, reason),
    geographies: emptySection(status, reason),
  };
}

function emptySection(status, reason) {
  return {
    status,
    reason,
    items: [],
  };
}

function readCache(key, nowMs, enabled) {
  if (!enabled) return null;
  const entry = resultCache.get(key);
  if (!entry || entry.expiresAt <= nowMs) {
    if (entry) resultCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value, ttlMs, nowMs, enabled) {
  if (!enabled) return;
  if (!resultCache.has(key)) {
    while (resultCache.size >= RESULT_CACHE_MAX_ENTRIES) {
      const oldest = resultCache.keys().next().value;
      if (oldest === undefined) break;
      resultCache.delete(oldest);
    }
  }
  resultCache.set(key, {
    value,
    expiresAt: nowMs + ttlMs,
  });
}

function exactQuarterPeriod(fiscalDate) {
  const date = parseDate(fiscalDate);
  if (!date) return { start: '', end: fiscalDate };
  const quarterEndMonth = Math.floor(date.getUTCMonth() / 3) * 3 + 2;
  const start = new Date(Date.UTC(date.getUTCFullYear(), quarterEndMonth - 2, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: fiscalDate,
  };
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDate(value) {
  const key = dateKey(value);
  if (!key) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function singleQueryValue(value) {
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || '').trim() : '';
  return typeof value === 'string' ? value.trim() : '';
}

function validDateKey(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!match) return '';
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : '';
}

function isQuarterEnd(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const expected = new Date(Date.UTC(
    date.getUTCFullYear(),
    Math.floor(date.getUTCMonth() / 3) * 3 + 3,
    0,
  ));
  return date.getTime() === expected.getTime();
}

function dateKey(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})$/);
  return match?.[1] || '';
}

function daysBetween(from, to) {
  return Math.round((
    new Date(`${to}T00:00:00.000Z`).getTime()
    - new Date(`${from}T00:00:00.000Z`).getTime()
  ) / 86400000);
}
