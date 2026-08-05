import { fetchSecEarningsFilingSource } from './secOfficialActuals.js';
import {
  hasSecEarningsDetailAdapter,
  parseSecEarningsDetailPrimaryDocument,
} from './secEarningsDetailParsers.js';
import {
  hasSecUsHoldingBusinessAdapter,
  parseSecUsHoldingBusinessDocument,
} from './secUsHoldingBusinessAdapters.js';
import {
  hasForeignIssuerBusinessCompositionAdapter,
  knownForeignIssuerBusinessComposition,
  parseForeignIssuerBusinessComposition,
} from './foreignIssuerBusinessComposition.js';

export { parseSecEarningsDetailPrimaryDocument } from './secEarningsDetailParsers.js';

export const SEC_EARNINGS_DETAIL_SCHEMA_VERSION = 3;
export const SEC_EARNINGS_DETAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const SEC_EARNINGS_DETAIL_TRANSIENT_CACHE_TTL_MS = 5 * 60 * 1000;
export const SEC_EARNINGS_DETAIL_UNPARSED_CACHE_TTL_MS = 5 * 60 * 1000;

const EARNINGS_SYMBOL_RE = /^[A-Z0-9.-]{1,15}$/;
const MAX_REPORT_DELAY_DAYS = 180;
const RESULT_CACHE_MAX_ENTRIES = 32;
const VERIFIED_MSFT_Q4_FISCAL_DATE = '2026-06-30';
const VERIFIED_MSFT_Q4_REPORT_DATE = '2026-07-29';
const resultCache = new Map();

export function parseEarningsDetailRequest(query = {}) {
  const rawSymbol = singleQueryValue(query.symbol);
  if (!rawSymbol) return { error: '需要传 symbol 参数' };

  const symbol = normalizeSymbol(rawSymbol);
  if (!EARNINGS_SYMBOL_RE.test(symbol)) {
    return { error: `股票代码不合法: ${String(rawSymbol).trim()}` };
  }

  const rawFiscalDate = singleQueryValue(query.fiscalDate);
  const rawReportDate = singleQueryValue(query.reportDate);
  if (!rawFiscalDate) return { error: '需要传 fiscalDate 参数' };
  if (!rawReportDate) return { error: '需要传 reportDate 参数' };

  const fiscalDate = validDateKey(rawFiscalDate);
  if (!fiscalDate) {
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

  const standardAdapterSupported = hasSecEarningsDetailAdapter(normalizedSymbol);
  const usHoldingAdapterSupported = hasSecUsHoldingBusinessAdapter(normalizedSymbol);
  const foreignAdapterSupported = hasForeignIssuerBusinessCompositionAdapter(normalizedSymbol);
  const detailAdapterSupported = standardAdapterSupported
    || usHoldingAdapterSupported
    || foreignAdapterSupported;
  const knownForeignComposition = knownForeignIssuerBusinessComposition({
    symbol: normalizedSymbol,
    fiscalDate: normalizedFiscalDate,
    reportDate: normalizedReportDate,
  });
  const period = {
    start: '',
    end: normalizedFiscalDate,
    fiscalDate: normalizedFiscalDate,
    reportDate: normalizedReportDate,
  };
  const knownPublishedAt = normalizeDate(knownForeignComposition?.publishedAt);
  if (knownPublishedAt && nowDate.getTime() < knownPublishedAt.getTime()) {
    const pending = responseBase({
      status: 'pending',
      reason: 'not-published',
      symbol: normalizedSymbol,
      period,
      source: null,
      sections: pendingSections('pending', 'not-published'),
    });
    writeCache(
      cacheKey,
      pending,
      SEC_EARNINGS_DETAIL_TRANSIENT_CACHE_TTL_MS,
      nowDate.getTime(),
      cacheEnabled,
    );
    return pending;
  }

  const verifiedMicrosoftQ4 = normalizedSymbol === 'MSFT'
    && normalizedFiscalDate === VERIFIED_MSFT_Q4_FISCAL_DATE
    && normalizedReportDate === VERIFIED_MSFT_Q4_REPORT_DATE;
  const mismatchedMicrosoftQ4 = normalizedSymbol === 'MSFT'
    && !verifiedMicrosoftQ4
    && (
      normalizedFiscalDate === VERIFIED_MSFT_Q4_FISCAL_DATE
      || normalizedReportDate === VERIFIED_MSFT_Q4_REPORT_DATE
    );
  if (mismatchedMicrosoftQ4) {
    const unavailable = responseBase({
      status: 'unavailable',
      reason: 'official-event-date-mismatch',
      symbol: normalizedSymbol,
      period,
      source: null,
      sections: pendingSections('unavailable', 'official-event-date-mismatch'),
    });
    warnSecEarningsDetailFailure(unavailable, cacheEnabled);
    writeCache(
      cacheKey,
      unavailable,
      SEC_EARNINGS_DETAIL_CACHE_TTL_MS,
      nowDate.getTime(),
      cacheEnabled,
    );
    return unavailable;
  }

  const primary = await fetchSecEarningsFilingSource({
    symbol: normalizedSymbol,
    fiscalDate: normalizedFiscalDate,
    reportDate: knownForeignComposition?.officialReportDate || normalizedReportDate,
    includePrimaryDocument: detailAdapterSupported && !knownForeignComposition,
    preferredFilingTypes: verifiedMicrosoftQ4 ? ['8-K'] : [],
    preferredDocumentTypes: verifiedMicrosoftQ4
      ? ['EX-99.1']
      : normalizedSymbol === 'IBKR'
        ? ['EX-99.1', 'PRIMARY']
        : ['PRIMARY'],
    fetchFn,
    userAgent,
    now: nowDate,
    requestIntervalMs,
    batchTimeoutMs,
  });

  if (knownForeignComposition
    && primary.reason !== 'not-published'
    && primary.reason !== 'invalid-sec-filing-request') {
    const result = responseBase({
      status: knownForeignComposition.status,
      reason: knownForeignComposition.status === 'complete'
        ? null
        : 'one-or-more-sections-unavailable',
      symbol: normalizedSymbol,
      period: {
        ...period,
        start: knownForeignComposition.period.start,
        end: knownForeignComposition.period.end,
      },
      source: sourceFromParsed(primary, knownForeignComposition),
      sections: knownForeignComposition.sections,
      currency: knownForeignComposition.currency,
      supplemental: knownForeignComposition.supplemental,
      summaryActuals: knownForeignComposition.summaryActuals,
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

  if (primary.status !== 'complete') {
    const pending = responseBase({
      status: primary.status === 'unsupported' ? 'unavailable' : 'pending',
      reason: primary.reason || 'sec-unavailable',
      failureReason: primary.failureReason || null,
      symbol: normalizedSymbol,
      period,
      source: sourceFromPrimary(primary),
      sections: pendingSections(
        primary.status === 'unsupported' ? 'unavailable' : 'pending',
        primary.reason || 'sec-unavailable',
      ),
    });
    if (pending.reason !== 'not-published') {
      warnSecEarningsDetailFailure(pending, cacheEnabled);
    }
    writeCache(
      cacheKey,
      pending,
      SEC_EARNINGS_DETAIL_TRANSIENT_CACHE_TTL_MS,
      nowDate.getTime(),
      cacheEnabled,
    );
    return pending;
  }

  if (!detailAdapterSupported) {
    const reason = 'official-detail-adapter-not-supported';
    const unavailable = responseBase({
      status: 'unavailable',
      reason,
      symbol: normalizedSymbol,
      period,
      source: sourceFromPrimary(primary),
      sections: pendingSections('unavailable', reason),
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

  const filing = {
    cik: primary.secCik,
    accession: primary.accession,
    form: primary.form,
    documentType: primary.documentType,
  };
  const parsed = standardAdapterSupported
    ? parseSecEarningsDetailPrimaryDocument({
        symbol: normalizedSymbol,
        fiscalDate: normalizedFiscalDate,
        html: primary.html,
        filing,
      })
    : usHoldingAdapterSupported
      ? parseSecUsHoldingBusinessDocument({
          symbol: normalizedSymbol,
          fiscalDate: normalizedFiscalDate,
          html: primary.html,
          filing,
        })
      : parseForeignIssuerBusinessComposition({
          symbol: normalizedSymbol,
          fiscalDate: normalizedFiscalDate,
          html: primary.html,
          sourceUrl: primary.primaryDocumentUrl,
        });
  const source = sourceFromParsed(primary, parsed);
  if (!parsed) {
    const unavailable = responseBase({
      status: 'unavailable',
      reason: 'official-primary-document-unparsed',
      symbol: normalizedSymbol,
      period,
      source,
      sections: pendingSections('unavailable', 'official-primary-document-unparsed'),
    });
    warnSecEarningsDetailFailure(unavailable, cacheEnabled);
    writeCache(
      cacheKey,
      unavailable,
      SEC_EARNINGS_DETAIL_UNPARSED_CACHE_TTL_MS,
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
    currency: parsed.currency,
    supplemental: parsed.supplemental,
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

export function secEarningsDetailFailureLogFields(detail) {
  const sourceForm = String(detail?.source?.form || '').trim().toUpperCase();
  return {
    symbol: normalizeSymbol(detail?.symbol),
    fiscalDate: dateKey(detail?.period?.fiscalDate),
    reportDate: dateKey(detail?.period?.reportDate),
    status: safeLogReason(detail?.status, 24),
    reason: safeLogReason(detail?.reason, 80),
    failureReason: safeLogReason(detail?.failureReason, 80),
    sourceForm: /^[0-9A-Z-]+(?:\/A)?$/.test(sourceForm) ? sourceForm : null,
  };
}

function warnSecEarningsDetailFailure(detail, enabled) {
  if (!enabled) return;
  console.warn(
    '[earnings-detail] official detail unavailable',
    secEarningsDetailFailureLogFields(detail),
  );
}

function safeLogReason(value, maxLength) {
  const normalized = String(value || '').trim().toLowerCase().slice(0, maxLength);
  return /^[a-z0-9][a-z0-9-]*$/.test(normalized) ? normalized : null;
}

function responseBase({
  status,
  reason,
  failureReason = null,
  symbol,
  period,
  source,
  sections,
  currency = 'USD',
  supplemental = {},
  summaryActuals = null,
}) {
  return {
    schemaVersion: SEC_EARNINGS_DETAIL_SCHEMA_VERSION,
    status,
    reason,
    failureReason,
    symbol,
    currency,
    period,
    source,
    sections,
    supplemental,
    summaryActuals,
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

function sourceFromParsed(primary, parsed) {
  const source = sourceFromPrimary(primary);
  const parsedProvider = String(parsed?.source?.provider || '').trim();
  const parsedUrl = String(parsed?.source?.url || '').trim();
  if (!parsedProvider || !/^https:\/\//i.test(parsedUrl)) return source;
  return {
    provider: parsedProvider,
    cik: source?.cik || String(parsed?.source?.cik || '').trim() || null,
    accession: source?.accession || null,
    form: source?.form || String(parsed?.source?.form || '').trim() || null,
    filedAt: source?.filedAt || null,
    filingUrl: source?.filingUrl || null,
    primaryDocumentUrl: parsedUrl,
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

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
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
