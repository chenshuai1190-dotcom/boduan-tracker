import { fetchWithTimeout, QUOTE_TIMEOUTS } from '../quote/http.js';

export const EODHD_FINANCIAL_HISTORY_SCHEMA_VERSION = 3;
export const EODHD_FINANCIAL_HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const EODHD_FINANCIAL_HISTORY_STALE_TTL_MS = 24 * 60 * 60 * 1000;
export const EODHD_TSM_FX_SYMBOL = 'USDTWD.FOREX';
export const EODHD_TSM_FX_BASIS = 'period-average';
export const EODHD_FINANCIAL_HISTORY_FILTER = [
  'General::Code',
  'General::CurrencyCode',
  'General::PrimaryTicker',
  'Financials::Income_Statement::currency_symbol',
  'Financials::Income_Statement::yearly',
  'Financials::Income_Statement::quarterly',
].join(',');

const SUPPORTED_SYMBOL = 'TSM';
const PROVIDER_SYMBOL = 'TSM.US';
const VERIFIED_PRIMARY_TICKERS = new Set(['TSM.US', '2330.TW']);
const REPORTING_CURRENCY = 'TWD';
const DISPLAY_CURRENCY = 'USD';
const ANNUAL_LIMIT = 6;
const QUARTERLY_LIMIT = 8;
const MIN_USEFUL_PERIODS = 2;
const FX_BOUNDARY_TOLERANCE_DAYS = 7;
const FX_MAX_GAP_DAYS = 7;
const FX_MIN_WEEKDAY_COVERAGE = 0.8;
const CACHE_MAX_ENTRIES = 16;
const historyCache = new Map();
const historyInflight = new Map();
let quotaBlockedUntilMs = 0;

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function validDateKey(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!match) return '';
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : '';
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateAtUtcMidnight(value) {
  const key = validDateKey(value);
  return key ? new Date(`${key}T00:00:00.000Z`) : null;
}

function calendarDaysBetween(start, end) {
  const startDate = dateAtUtcMidnight(start);
  const endDate = dateAtUtcMidnight(end);
  if (!startDate || !endDate) return Number.POSITIVE_INFINITY;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

function weekdayCount(start, end) {
  const startDate = dateAtUtcMidnight(start);
  const endDate = dateAtUtcMidnight(end);
  if (!startDate || !endDate || startDate > endDate) return 0;
  let count = 0;
  for (let cursor = startDate.getTime(); cursor <= endDate.getTime(); cursor += 86_400_000) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function normalizeCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : '';
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function providerField(data, path) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  if (Object.prototype.hasOwnProperty.call(data, path)) return data[path];
  return path.split('::').reduce((value, key) => value?.[key], data);
}

function emptyResponse(reason, { listingCurrency = '' } = {}) {
  return {
    schemaVersion: EODHD_FINANCIAL_HISTORY_SCHEMA_VERSION,
    status: 'unavailable',
    reason: reason || 'eodhd-tsm-history-unavailable',
    symbol: SUPPORTED_SYMBOL,
    currency: '',
    originalCurrency: REPORTING_CURRENCY,
    fxBasis: EODHD_TSM_FX_BASIS,
    source: {
      provider: 'EODHD',
      label: 'EODHD Fundamentals',
      asOfDate: '',
      url: 'https://eodhd.com/api/fundamentals/TSM.US',
      ...(listingCurrency ? { listingCurrency } : {}),
    },
    annual: [],
    quarterly: [],
  };
}

function fiscalQuarterForDate(date) {
  const suffix = date.slice(4);
  if (suffix === '-03-31') return 1;
  if (suffix === '-06-30') return 2;
  if (suffix === '-09-30') return 3;
  if (suffix === '-12-31') return 4;
  return null;
}

function periodStartDate(endDate, mode, fiscalQuarter) {
  const year = endDate.slice(0, 4);
  if (mode === 'annual' || fiscalQuarter === 1) return `${year}-01-01`;
  if (fiscalQuarter === 2) return `${year}-04-01`;
  if (fiscalQuarter === 3) return `${year}-07-01`;
  if (fiscalQuarter === 4) return `${year}-10-01`;
  return '';
}

function normalizeProviderRows(block, mode, { asOfDate } = {}) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return {
      rows: [],
      issues: [{ date: '', reason: `invalid-eodhd-tsm-${mode}-history` }],
    };
  }

  const rows = [];
  const issues = [];
  const seenDates = new Set();
  for (const [rawKey, raw] of Object.entries(block)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.push({
        date: validDateKey(rawKey),
        reason: `invalid-eodhd-tsm-${mode}-row`,
      });
      continue;
    }
    const keyDate = validDateKey(rawKey);
    const rowDate = validDateKey(raw.date);
    if (!rowDate || (keyDate && keyDate !== rowDate)) {
      issues.push({
        date: rowDate || keyDate,
        reason: `invalid-eodhd-tsm-${mode}-date`,
      });
      continue;
    }
    if (rowDate > asOfDate) {
      issues.push({
        date: rowDate,
        reason: `future-eodhd-tsm-${mode}-row`,
        fatal: true,
      });
      continue;
    }
    if (seenDates.has(rowDate)) {
      issues.push({
        date: rowDate,
        reason: `duplicate-eodhd-tsm-${mode}-period`,
      });
      continue;
    }
    seenDates.add(rowDate);

    const fiscalYear = Number(rowDate.slice(0, 4));
    const fiscalQuarter = mode === 'quarterly' ? fiscalQuarterForDate(rowDate) : null;
    if (
      !Number.isInteger(fiscalYear)
      || fiscalYear < 1900
      || fiscalYear > 9999
      || (mode === 'annual' && !rowDate.endsWith('-12-31'))
      || (mode === 'quarterly' && fiscalQuarter === null)
    ) {
      issues.push({ date: rowDate, reason: `invalid-eodhd-tsm-${mode}-period` });
      continue;
    }

    const rowCurrency = normalizeCurrency(raw.currency_symbol || raw.currency);
    if (rowCurrency && rowCurrency !== REPORTING_CURRENCY) {
      issues.push({ date: rowDate, reason: `eodhd-tsm-${mode}-currency-mismatch` });
      continue;
    }
    const revenue = finiteNumber(raw.totalRevenue);
    const netIncome = finiteNumber(raw.netIncome);
    if (!(revenue > 0) || netIncome === null) {
      issues.push({ date: rowDate, reason: `invalid-eodhd-tsm-${mode}-amounts` });
      continue;
    }
    const filedDate = validDateKey(raw.filing_date || raw.filingDate);
    if (!filedDate || filedDate < rowDate || filedDate > asOfDate) {
      issues.push({ date: rowDate, reason: `invalid-eodhd-tsm-${mode}-filing-date` });
      continue;
    }

    rows.push({
      fiscalYear: `FY${fiscalYear}`,
      fiscalQuarter: mode === 'annual' ? 'FY' : `Q${fiscalQuarter}`,
      startDate: periodStartDate(rowDate, mode, fiscalQuarter),
      endDate: rowDate,
      filedDate,
      revenue,
      netIncome,
      netMarginPct: percentRatio(netIncome, revenue),
      revenueYoyPct: null,
      netIncomeYoyPct: null,
      netMarginChangePpt: null,
      revenueQoqPct: null,
    });
  }

  rows.sort((left, right) => left.endDate.localeCompare(right.endDate));
  return { rows, issues };
}

function fiscalYearNumber(row) {
  const match = String(row?.fiscalYear || '').match(/^FY(\d{4})$/);
  return match ? Number(match[1]) : 0;
}

function fiscalQuarterNumber(row) {
  const match = String(row?.fiscalQuarter || '').match(/^Q([1-4])$/);
  return match ? Number(match[1]) : 0;
}

function quarterOrdinal(row) {
  return fiscalYearNumber(row) * 4 + fiscalQuarterNumber(row) - 1;
}

function latestConsecutiveWindow(rows, mode, limit) {
  const sorted = [...rows].sort((left, right) => left.endDate.localeCompare(right.endDate));
  if (sorted.length === 0) return [];
  const window = [sorted.at(-1)];
  for (let index = sorted.length - 2; index >= 0 && window.length < limit; index -= 1) {
    const current = window[0];
    const candidate = sorted[index];
    const consecutive = mode === 'annual'
      ? fiscalYearNumber(candidate) === fiscalYearNumber(current) - 1
      : quarterOrdinal(candidate) === quarterOrdinal(current) - 1;
    if (!consecutive) break;
    window.unshift(candidate);
  }
  return window;
}

function currentIssueReason(issues, selectedRows) {
  const fatal = issues.find((issue) => issue.fatal);
  if (fatal) return fatal.reason;
  const firstSelectedDate = selectedRows[0]?.endDate || '';
  if (!firstSelectedDate) return '';
  return issues.find((issue) => issue.date && issue.date >= firstSelectedDate)?.reason || '';
}

function percentRatio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? (numerator / denominator) * 100
    : null;
}

function positivePercentChange(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) && previous > 0
    ? ((current / previous) - 1) * 100
    : null;
}

function addMetrics(annualRows, quarterlyRows) {
  const annualByYear = new Map(annualRows.map((row) => [fiscalYearNumber(row), row]));
  const annual = annualRows.map((row) => {
    const previous = annualByYear.get(fiscalYearNumber(row) - 1);
    return {
      ...row,
      revenueYoyPct: positivePercentChange(row.revenue, previous?.revenue),
      netIncomeYoyPct: positivePercentChange(row.netIncome, previous?.netIncome),
      netMarginChangePpt: Number.isFinite(previous?.netMarginPct)
        ? row.netMarginPct - previous.netMarginPct
        : null,
    };
  });

  const quarterlyByOrdinal = new Map(quarterlyRows.map((row) => [quarterOrdinal(row), row]));
  const quarterly = quarterlyRows.map((row) => {
    const ordinal = quarterOrdinal(row);
    const previousYear = quarterlyByOrdinal.get(ordinal - 4);
    const previousQuarter = quarterlyByOrdinal.get(ordinal - 1);
    return {
      ...row,
      revenueYoyPct: positivePercentChange(row.revenue, previousYear?.revenue),
      netIncomeYoyPct: positivePercentChange(row.netIncome, previousYear?.netIncome),
      netMarginChangePpt: Number.isFinite(previousYear?.netMarginPct)
        ? row.netMarginPct - previousYear.netMarginPct
        : null,
      revenueQoqPct: positivePercentChange(row.revenue, previousQuarter?.revenue),
    };
  });
  return { annual, quarterly };
}

function supportRowsForWindow(rows, window, mode) {
  if (!window.length) return [];
  if (mode === 'annual') {
    const firstYear = fiscalYearNumber(window[0]) - 1;
    const lastYear = fiscalYearNumber(window.at(-1));
    return rows.filter((row) => {
      const year = fiscalYearNumber(row);
      return year >= firstYear && year <= lastYear;
    });
  }
  const firstOrdinal = quarterOrdinal(window[0]) - 4;
  const lastOrdinal = quarterOrdinal(window.at(-1));
  return rows.filter((row) => {
    const ordinal = quarterOrdinal(row);
    return ordinal >= firstOrdinal && ordinal <= lastOrdinal;
  });
}

function prepareEodhdFinancialHistory(data, {
  symbol = SUPPORTED_SYMBOL,
  asOfDate = new Date().toISOString().slice(0, 10),
} = {}) {
  if (normalizeSymbol(symbol) !== SUPPORTED_SYMBOL || !validDateKey(asOfDate)) {
    return { failure: emptyResponse('invalid-eodhd-tsm-history-request') };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { failure: emptyResponse('invalid-eodhd-tsm-fundamentals') };
  }

  const providerCode = String(providerField(data, 'General::Code') || '').trim().toUpperCase();
  const primaryTicker = String(providerField(data, 'General::PrimaryTicker') || '').trim().toUpperCase();
  const listingCurrency = normalizeCurrency(providerField(data, 'General::CurrencyCode'));
  if (providerCode && providerCode !== SUPPORTED_SYMBOL) {
    return { failure: emptyResponse('eodhd-tsm-code-mismatch', { listingCurrency }) };
  }
  if (primaryTicker && !VERIFIED_PRIMARY_TICKERS.has(primaryTicker)) {
    return { failure: emptyResponse('eodhd-tsm-primary-ticker-mismatch', { listingCurrency }) };
  }
  if (listingCurrency && !['USD', REPORTING_CURRENCY].includes(listingCurrency)) {
    return { failure: emptyResponse('eodhd-tsm-listing-currency-mismatch', { listingCurrency }) };
  }

  const reportingCurrency = normalizeCurrency(
    providerField(data, 'Financials::Income_Statement::currency_symbol'),
  );
  if (reportingCurrency !== REPORTING_CURRENCY) {
    return { failure: emptyResponse('eodhd-tsm-reporting-currency-mismatch', { listingCurrency }) };
  }

  const annualResult = normalizeProviderRows(
    providerField(data, 'Financials::Income_Statement::yearly'),
    'annual',
    { asOfDate },
  );
  const quarterlyResult = normalizeProviderRows(
    providerField(data, 'Financials::Income_Statement::quarterly'),
    'quarterly',
    { asOfDate },
  );
  const annualWindow = latestConsecutiveWindow(annualResult.rows, 'annual', ANNUAL_LIMIT);
  const quarterlyWindow = latestConsecutiveWindow(
    quarterlyResult.rows,
    'quarterly',
    QUARTERLY_LIMIT,
  );
  const issueReason = currentIssueReason(annualResult.issues, annualWindow)
    || currentIssueReason(quarterlyResult.issues, quarterlyWindow);
  if (issueReason) {
    return { failure: emptyResponse(issueReason, { listingCurrency }) };
  }

  const annualOutput = annualWindow.length >= MIN_USEFUL_PERIODS ? annualWindow : [];
  const quarterlyOutput = quarterlyWindow.length >= MIN_USEFUL_PERIODS ? quarterlyWindow : [];
  if (annualOutput.length === 0 && quarterlyOutput.length === 0) {
    return { failure: emptyResponse('incomplete-eodhd-tsm-history', { listingCurrency }) };
  }

  const annualSupport = supportRowsForWindow(annualResult.rows, annualOutput, 'annual');
  const quarterlySupport = supportRowsForWindow(
    quarterlyResult.rows,
    quarterlyOutput,
    'quarterly',
  );
  const supportRows = [...annualSupport, ...quarterlySupport];
  const fxFromDate = supportRows.map((row) => row.startDate).filter(Boolean).sort()[0] || '';
  const fxToDate = supportRows.map((row) => row.endDate).filter(Boolean).sort().at(-1) || '';
  if (!fxFromDate || !fxToDate) {
    return { failure: emptyResponse('incomplete-eodhd-tsm-history', { listingCurrency }) };
  }

  const complete = annualOutput.length === ANNUAL_LIMIT
    && quarterlyOutput.length === QUARTERLY_LIMIT;
  const latestFilingDate = [...annualOutput, ...quarterlyOutput]
    .map((row) => row.filedDate)
    .filter(Boolean)
    .sort()
    .at(-1) || '';
  return {
    failure: null,
    status: complete ? 'complete' : 'partial',
    reason: complete ? null : 'incomplete-eodhd-tsm-history',
    listingCurrency,
    latestFilingDate,
    annualOutputDates: new Set(annualOutput.map((row) => row.endDate)),
    quarterlyOutputDates: new Set(quarterlyOutput.map((row) => row.endDate)),
    annualSupport,
    quarterlySupport,
    fxFromDate,
    fxToDate,
  };
}

function normalizeFxRows(data, { fromDate, toDate, asOfDate }) {
  if (!Array.isArray(data)) {
    return { rows: [], reason: 'invalid-eodhd-tsm-fx-history' };
  }
  const rows = [];
  const seenDates = new Set();
  for (const raw of data) {
    const date = validDateKey(raw?.date);
    if (!date) return { rows: [], reason: 'invalid-eodhd-tsm-fx-date' };
    if (date > asOfDate) return { rows: [], reason: 'future-eodhd-tsm-fx-row' };
    if (date < fromDate || date > toDate) {
      return { rows: [], reason: 'out-of-range-eodhd-tsm-fx-row' };
    }
    if (seenDates.has(date)) {
      return { rows: [], reason: 'duplicate-eodhd-tsm-fx-date' };
    }
    seenDates.add(date);
    const close = finiteNumber(raw?.close);
    if (!(close > 0)) return { rows: [], reason: 'invalid-eodhd-tsm-fx-close' };
    rows.push({ date, close });
  }
  rows.sort((left, right) => left.date.localeCompare(right.date));
  return rows.length
    ? { rows, reason: '' }
    : { rows: [], reason: 'empty-eodhd-tsm-fx-history' };
}

function periodAverageFxRate(fxRows, period) {
  const rows = fxRows.filter((row) => (
    row.date >= period.startDate && row.date <= period.endDate
  ));
  if (!rows.length) return null;
  if (calendarDaysBetween(period.startDate, rows[0].date) > FX_BOUNDARY_TOLERANCE_DAYS) {
    return null;
  }
  if (calendarDaysBetween(rows.at(-1).date, period.endDate) > FX_BOUNDARY_TOLERANCE_DAYS) {
    return null;
  }
  for (let index = 1; index < rows.length; index += 1) {
    if (calendarDaysBetween(rows[index - 1].date, rows[index].date) > FX_MAX_GAP_DAYS) {
      return null;
    }
  }
  const expectedWeekdays = weekdayCount(period.startDate, period.endDate);
  if (rows.length < Math.ceil(expectedWeekdays * FX_MIN_WEEKDAY_COVERAGE)) return null;
  const total = rows.reduce((sum, row) => sum + row.close, 0);
  const average = total / rows.length;
  return Number.isFinite(average) && average > 0 ? average : null;
}

function convertRowsToUsd(rows, fxRows) {
  const converted = [];
  for (const row of rows) {
    const fxRate = periodAverageFxRate(fxRows, row);
    if (!(fxRate > 0)) return null;
    converted.push({
      ...row,
      originalRevenue: row.revenue,
      originalNetIncome: row.netIncome,
      originalCurrency: REPORTING_CURRENCY,
      fxRate: Math.round(fxRate * 1_000_000) / 1_000_000,
      fxBasis: EODHD_TSM_FX_BASIS,
      revenue: Math.round(row.revenue / fxRate),
      netIncome: Math.round(row.netIncome / fxRate),
    });
  }
  return converted;
}

function finalizeEodhdFinancialHistory(prepared, fxData, { asOfDate }) {
  const fxResult = normalizeFxRows(fxData, {
    fromDate: prepared.fxFromDate,
    toDate: prepared.fxToDate,
    asOfDate,
  });
  if (fxResult.reason) {
    return emptyResponse(fxResult.reason, { listingCurrency: prepared.listingCurrency });
  }
  const annualSupport = convertRowsToUsd(prepared.annualSupport, fxResult.rows);
  const quarterlySupport = convertRowsToUsd(prepared.quarterlySupport, fxResult.rows);
  if (!annualSupport || !quarterlySupport) {
    return emptyResponse('incomplete-eodhd-tsm-fx-coverage', {
      listingCurrency: prepared.listingCurrency,
    });
  }
  const metrics = addMetrics(annualSupport, quarterlySupport);
  const annual = metrics.annual.filter((row) => prepared.annualOutputDates.has(row.endDate));
  const quarterly = metrics.quarterly.filter((row) => (
    prepared.quarterlyOutputDates.has(row.endDate)
  ));
  const fxAsOfDate = fxResult.rows.at(-1)?.date || '';
  return {
    schemaVersion: EODHD_FINANCIAL_HISTORY_SCHEMA_VERSION,
    status: prepared.status,
    reason: prepared.reason,
    symbol: SUPPORTED_SYMBOL,
    currency: DISPLAY_CURRENCY,
    originalCurrency: REPORTING_CURRENCY,
    fxBasis: EODHD_TSM_FX_BASIS,
    source: {
      provider: 'EODHD',
      label: 'EODHD Fundamentals + period-average FX',
      asOfDate: prepared.latestFilingDate,
      url: 'https://eodhd.com/api/fundamentals/TSM.US',
      fxSymbol: EODHD_TSM_FX_SYMBOL,
      fxBasis: EODHD_TSM_FX_BASIS,
      fxFromDate: prepared.fxFromDate,
      fxToDate: prepared.fxToDate,
      fxAsOfDate,
      ...(prepared.listingCurrency ? { listingCurrency: prepared.listingCurrency } : {}),
    },
    annual,
    quarterly,
  };
}

export function buildEodhdFinancialHistory(data, {
  symbol = SUPPORTED_SYMBOL,
  asOfDate = new Date().toISOString().slice(0, 10),
  fxData,
} = {}) {
  const prepared = prepareEodhdFinancialHistory(data, { symbol, asOfDate });
  if (prepared.failure) return prepared.failure;
  return finalizeEodhdFinancialHistory(prepared, fxData, { asOfDate });
}

function nextUtcMidnight(nowMs) {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function trimCache(nowMs = Date.now()) {
  for (const [key, entry] of historyCache) {
    if (!(entry?.staleUntil > nowMs)) historyCache.delete(key);
  }
  while (historyCache.size > CACHE_MAX_ENTRIES) {
    const oldest = historyCache.keys().next().value;
    if (oldest == null) break;
    historyCache.delete(oldest);
  }
}

function readCache(key, nowMs, { allowStale = false } = {}) {
  trimCache(nowMs);
  const entry = historyCache.get(key);
  if (!entry || (!allowStale && !(entry.expiresAt > nowMs))) return null;
  historyCache.delete(key);
  historyCache.set(key, entry);
  return structuredClone(entry.value);
}

function writeCache(key, value, nowMs) {
  historyCache.delete(key);
  historyCache.set(key, {
    value: structuredClone(value),
    expiresAt: nowMs + EODHD_FINANCIAL_HISTORY_CACHE_TTL_MS,
    staleUntil: nowMs + EODHD_FINANCIAL_HISTORY_STALE_TTL_MS,
  });
  trimCache(nowMs);
}

function quotaUnavailable() {
  return emptyResponse('eodhd-daily-quota-exhausted');
}

function staleResponse(value, failure) {
  return {
    ...structuredClone(value),
    stale: true,
    staleReason: failure?.reason || 'eodhd-tsm-history-refresh-failed',
  };
}

async function loadEodhdFinancialHistory({ eodhdKey, fetchFn, now, nowMs }) {
  if (quotaBlockedUntilMs > nowMs) return quotaUnavailable();
  quotaBlockedUntilMs = 0;

  const fundamentalsUrl = new URL(
    `https://eodhd.com/api/v1.1/fundamentals/${PROVIDER_SYMBOL}`,
  );
  fundamentalsUrl.searchParams.set('api_token', eodhdKey);
  fundamentalsUrl.searchParams.set('fmt', 'json');
  fundamentalsUrl.searchParams.set('filter', EODHD_FINANCIAL_HISTORY_FILTER);
  const fundamentalsResponse = await fetchWithTimeout(fundamentalsUrl.toString(), {}, {
    provider: 'eodhd:tsm-financial-history',
    timeoutMs: QUOTE_TIMEOUTS.eodhd,
    fetchImpl: fetchFn,
  });
  if (fundamentalsResponse.status === 402) {
    quotaBlockedUntilMs = Math.max(quotaBlockedUntilMs, nextUtcMidnight(nowMs));
    return quotaUnavailable();
  }
  if (!fundamentalsResponse.ok) {
    return emptyResponse(`eodhd-tsm-history-http-${fundamentalsResponse.status}`);
  }
  const fundamentals = await fundamentalsResponse.json().catch(() => null);
  const asOfDate = now.toISOString().slice(0, 10);
  const prepared = prepareEodhdFinancialHistory(fundamentals, {
    symbol: SUPPORTED_SYMBOL,
    asOfDate,
  });
  if (prepared.failure) return prepared.failure;

  const fxUrl = new URL(`https://eodhd.com/api/eod/${EODHD_TSM_FX_SYMBOL}`);
  fxUrl.searchParams.set('api_token', eodhdKey);
  fxUrl.searchParams.set('fmt', 'json');
  fxUrl.searchParams.set('period', 'd');
  fxUrl.searchParams.set('order', 'a');
  fxUrl.searchParams.set('from', prepared.fxFromDate);
  fxUrl.searchParams.set('to', prepared.fxToDate);
  const fxResponse = await fetchWithTimeout(fxUrl.toString(), {}, {
    provider: 'eodhd:tsm-period-average-fx',
    timeoutMs: QUOTE_TIMEOUTS.eodhd,
    fetchImpl: fetchFn,
  });
  if (fxResponse.status === 402) {
    quotaBlockedUntilMs = Math.max(quotaBlockedUntilMs, nextUtcMidnight(nowMs));
    return quotaUnavailable();
  }
  if (!fxResponse.ok) {
    return emptyResponse(`eodhd-tsm-fx-http-${fxResponse.status}`, {
      listingCurrency: prepared.listingCurrency,
    });
  }
  const fxData = await fxResponse.json().catch(() => null);
  return finalizeEodhdFinancialHistory(prepared, fxData, { asOfDate });
}

export async function fetchEodhdFinancialHistory({
  symbol,
  eodhdKey,
  fetchFn = globalThis.fetch,
  now = new Date(),
  nowMs = Date.now(),
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedNow = normalizeDate(now);
  const key = String(eodhdKey || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (normalizedSymbol !== SUPPORTED_SYMBOL || !normalizedNow) {
    return emptyResponse('invalid-eodhd-tsm-history-request');
  }
  if (!key) return emptyResponse('missing-eodhd-api-key');

  const cacheKey = `${SUPPORTED_SYMBOL}:${DISPLAY_CURRENCY}:${EODHD_TSM_FX_BASIS}:v1`;
  const cached = readCache(cacheKey, nowMs);
  if (cached) return cached;
  const existingFlight = historyInflight.get(cacheKey);
  if (existingFlight) return structuredClone(await existingFlight);

  const flight = (async () => {
    let result;
    try {
      result = await loadEodhdFinancialHistory({
        eodhdKey: key,
        fetchFn,
        now: normalizedNow,
        nowMs,
      });
    } catch {
      result = emptyResponse('eodhd-tsm-history-refresh-failed');
    }
    if (result.status === 'complete' || result.status === 'partial') {
      writeCache(cacheKey, result, nowMs);
      return result;
    }
    const stale = readCache(cacheKey, nowMs, { allowStale: true });
    return stale ? staleResponse(stale, result) : result;
  })().finally(() => {
    if (historyInflight.get(cacheKey) === flight) historyInflight.delete(cacheKey);
  });
  historyInflight.set(cacheKey, flight);
  return structuredClone(await flight);
}

export function clearEodhdFinancialHistoryCachesForTests() {
  historyCache.clear();
  historyInflight.clear();
  quotaBlockedUntilMs = 0;
}
