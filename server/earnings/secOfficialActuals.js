import {
  extractExhibit991Url,
  isSecExhibitActualSupportedEvent,
  parseSecCompanyFactsActuals,
  parseSecExhibitActuals,
} from './secOfficialParsers.js';

export const OFFICIAL_ACTUAL_SCHEMA_VERSION = 2;
export const DEFAULT_SEC_USER_AGENT = 'BoduanTracker/1.0 chenshuai1190@gmail.com';

const SEC_REQUEST_TIMEOUT_MS = 5500;
const SEC_BATCH_TIMEOUT_MS = 7000;
const SEC_REQUEST_INTERVAL_MS = 220;
const SEC_MAX_CONCURRENCY = 3;
const SEC_MAX_EVENTS_PER_REQUEST = 8;
const SEC_MAX_INDEX_BYTES = 2_000_000;
const SEC_MAX_EXHIBIT_BYTES = 3_000_000;
const SEC_MAX_PRIMARY_DOCUMENT_BYTES = 6_000_000;
const SEC_MAX_COMPANY_FACTS_BYTES = 25_000_000;
const RESPONSE_CACHE_MAX_ENTRIES = 64;
const RESULT_CACHE_MAX_ENTRIES = 32;

const TICKER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SUBMISSIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const COMPANY_FACTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FILING_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_CACHE_TTL_MS = 5 * 60 * 1000;
const SEC_FISCAL_DATE_TOLERANCE_DAYS = 7;

const KNOWN_CIK_BY_SYMBOL = new Map([
  ['TSLA', '0001318605'],
  ['TSM', '0001046179'],
  ['GOOG', '0001652044'],
  ['GOOGL', '0001652044'],
  ['IBKR', '0001381197'],
]);

export function isSecOfficialActualSupportedSymbol(symbol) {
  return KNOWN_CIK_BY_SYMBOL.has(normalizeSymbol(symbol));
}

export function isSecOfficialActualSupportedEvent(symbol, fiscalDate) {
  const normalizedSymbol = normalizeSymbol(symbol);
  return KNOWN_CIK_BY_SYMBOL.has(normalizedSymbol)
    && isSecExhibitActualSupportedEvent({ symbol: normalizedSymbol, fiscalDate });
}

const responseCache = new Map();
const resultCache = new Map();
let requestScheduleTail = Promise.resolve();
let nextSecRequestAt = 0;

export async function fetchSecOfficialActuals({
  events,
  fetchFn = globalThis.fetch,
  userAgent = process.env.SEC_USER_AGENT || DEFAULT_SEC_USER_AGENT,
  now = new Date(),
  requestIntervalMs,
  batchTimeoutMs = SEC_BATCH_TIMEOUT_MS,
} = {}) {
  const output = new Map();
  const normalizedNow = normalizeDate(now) || new Date();
  const today = newYorkDateKey(normalizedNow);
  const unique = dedupeEvents(events);

  for (const event of unique) {
    if (event.reportDate && event.reportDate > today) {
      output.set(event.key, statusResult(event, 'pending', 'not-published'));
    }
  }

  const publishedCandidates = unique
    .filter((event) => !event.reportDate || event.reportDate <= today);
  if (publishedCandidates.length === 0) return output;

  const supportedCandidates = [];
  for (const event of publishedCandidates) {
    if (isSecOfficialActualSupportedEvent(event.symbol, event.fiscalDate)) {
      if (supportedCandidates.length < SEC_MAX_EVENTS_PER_REQUEST) supportedCandidates.push(event);
    } else {
      output.set(event.key, statusResult(event, 'unsupported', 'official-adapter-not-supported'));
    }
  }
  if (supportedCandidates.length === 0) return output;

  const context = {
    fetchFn,
    userAgent: sanitizeUserAgent(userAgent),
    requestIntervalMs: resolveRequestInterval(fetchFn, requestIntervalMs),
    cacheEnabled: fetchFn === globalThis.fetch,
    nowMs: normalizedNow.getTime(),
    deadlineAt: Date.now() + (
      Number.isFinite(batchTimeoutMs) && batchTimeoutMs > 0
        ? batchTimeoutMs
        : SEC_BATCH_TIMEOUT_MS
    ),
  };

  let cikBySymbol;
  try {
    cikBySymbol = await fetchTickerCikMap(context);
  } catch {
    cikBySymbol = new Map(KNOWN_CIK_BY_SYMBOL);
  }

  const tasks = supportedCandidates.map((event) => async () => {
    const cik = cikBySymbol.get(event.symbol) || KNOWN_CIK_BY_SYMBOL.get(event.symbol);
    if (!cik) return [event.key, statusResult(event, 'unsupported', 'sec-cik-not-found')];
    try {
      const result = await fetchOfficialEvent({ event, cik, context, today });
      return [event.key, result];
    } catch {
      return [event.key, statusResult(event, 'pending', 'sec-unavailable', { secCik: cik })];
    }
  });

  const entries = await mapLimit(tasks, SEC_MAX_CONCURRENCY);
  for (const [key, result] of entries) output.set(key, result);
  return output;
}

export async function fetchSecEarningsFilingSource({
  symbol,
  fiscalDate,
  reportDate,
  includePrimaryDocument = true,
  fetchFn = globalThis.fetch,
  userAgent = process.env.SEC_USER_AGENT || DEFAULT_SEC_USER_AGENT,
  now = new Date(),
  requestIntervalMs,
  batchTimeoutMs = SEC_BATCH_TIMEOUT_MS,
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedFiscalDate = dateKey(fiscalDate);
  const normalizedReportDate = dateKey(reportDate);
  const normalizedNow = normalizeDate(now) || new Date();
  const today = newYorkDateKey(normalizedNow);
  const base = {
    status: 'pending',
    reason: null,
    symbol: normalizedSymbol,
    fiscalDate: normalizedFiscalDate,
    reportDate: normalizedReportDate,
  };

  if (!/^[A-Z0-9.-]{1,15}$/.test(normalizedSymbol)
    || !normalizedFiscalDate
    || !normalizedReportDate) {
    return { ...base, status: 'unsupported', reason: 'invalid-sec-filing-request' };
  }
  if (normalizedReportDate > today) {
    return { ...base, reason: 'not-published' };
  }

  const context = {
    fetchFn,
    userAgent: sanitizeUserAgent(userAgent),
    requestIntervalMs: resolveRequestInterval(fetchFn, requestIntervalMs),
    cacheEnabled: fetchFn === globalThis.fetch,
    nowMs: normalizedNow.getTime(),
    deadlineAt: Date.now() + (
      Number.isFinite(batchTimeoutMs) && batchTimeoutMs > 0
        ? batchTimeoutMs
        : SEC_BATCH_TIMEOUT_MS
    ),
  };

  let cik = KNOWN_CIK_BY_SYMBOL.get(normalizedSymbol) || '';
  try {
    if (!cik) {
      const cikBySymbol = await fetchTickerCikMap(context);
      cik = cikBySymbol.get(normalizedSymbol) || '';
    }
    if (!cik) {
      return {
        ...base,
        status: 'unsupported',
        reason: 'sec-cik-not-found',
      };
    }

    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const submissions = await fetchJsonCached(submissionsUrl, {
      ...context,
      ttlMs: SUBMISSIONS_CACHE_TTL_MS,
      maxBytes: SEC_MAX_COMPANY_FACTS_BYTES,
    });
    if (!submissionsMatchesSymbol(submissions, normalizedSymbol)) {
      return {
        ...base,
        status: 'unsupported',
        reason: 'sec-ticker-mismatch',
        secCik: cik,
      };
    }

    const filing = selectEarningsDetailFiling(
      normalizeRecentFilings(submissions),
      normalizedFiscalDate,
      normalizedReportDate,
      today,
    );
    if (!filing) {
      return {
        ...base,
        reason: 'official-filing-not-found',
        secCik: cik,
      };
    }

    const source = {
      ...base,
      status: 'complete',
      reason: null,
      secCik: cik,
      accession: filing.accession,
      form: filing.form,
      filedAt: filing.acceptedAt || filing.filingDate,
      filingUrl: buildFilingIndexUrl(cik, filing.accession),
    };
    if (!includePrimaryDocument) return source;

    const primaryDocumentUrl = buildPrimaryDocumentUrl(cik, filing);
    if (!primaryDocumentUrl) {
      return {
        ...source,
        status: 'pending',
        reason: 'official-primary-document-missing',
      };
    }
    const html = await fetchTextCached(primaryDocumentUrl, {
      ...context,
      ttlMs: FILING_CACHE_TTL_MS,
      maxBytes: SEC_MAX_PRIMARY_DOCUMENT_BYTES,
    });
    return {
      ...source,
      primaryDocumentUrl,
      html,
    };
  } catch {
    return {
      ...base,
      reason: 'sec-unavailable',
      secCik: cik,
    };
  }
}

// Kept as a compatibility alias for the existing detail service and tests.
// The reader now resolves the exact official earnings filing rather than being
// restricted to a hard-coded 10-Q company list.
export async function fetchSecTenQPrimaryDocument(options = {}) {
  return fetchSecEarningsFilingSource(options);
}

export function mergeSecOfficialActuals(events, officialActuals) {
  const results = officialActuals instanceof Map
    ? officialActuals
    : new Map((officialActuals || []).map((entry) => [entry?.key, entry]));

  return (events || []).map((event) => {
    const key = eventKey(event);
    const official = results.get(key);
    if (!official) return event;

    const provenance = {
      officialActualSchemaVersion: official.officialActualSchemaVersion,
      officialActualStatus: official.officialActualStatus,
      officialActualReason: official.officialActualReason || null,
      officialActualSource: official.officialActualSource || official.actualSource || null,
      actualBasis: official.actualBasis || null,
      secCik: official.secCik || null,
      secAccession: official.accession || official.secAccession || null,
      secForm: official.form || official.secForm || null,
      secFiledAt: official.filedAt || official.secFiledAt || null,
      secFilingUrl: official.filingUrl || official.secFilingUrl || null,
      secExhibitUrl: official.exhibitUrl || official.secExhibitUrl || null,
    };
    if (official.officialActualStatus === 'unsupported' || official.officialActualStatus === 'complete') {
      // Handled below.
    } else if (official.secCik) {
      return {
        ...event,
        ...provenance,
        epsActual: null,
        actual: null,
        epsPreviousYear: null,
        epsCurrency: null,
        epsUnit: null,
        epsActualSource: null,
        epsPreviousYearSource: null,
        epsActualBasis: null,
        epsPreviousYearBasis: null,
        epsDifference: null,
        difference: null,
        surprisePercent: null,
        percent: null,
        epsActualYoyPercent: null,
        revenueActual: null,
        actualRevenue: null,
        revenueActualUsd: null,
        revenuePreviousYear: null,
        revenuePreviousYearUsd: null,
        revenueActualSource: null,
        revenuePreviousYearSource: null,
        revenueActualBasis: null,
        revenuePreviousYearBasis: null,
        revenueActualYoyPercent: null,
        ebitActual: null,
        ebitActualUsd: null,
        ebitPreviousYear: null,
        ebitPreviousYearUsd: null,
        ebitActualSource: null,
        ebitPreviousYearSource: null,
        ebitActualBasis: null,
        ebitPreviousYearBasis: null,
        ebitActualYoyPercent: null,
        earningsPublished: false,
        earningsResult: null,
        publishedUntil: null,
        publishedFinancialsComplete: false,
      };
    }
    if (official.officialActualStatus !== 'complete') {
      return { ...event, ...provenance };
    }

    const source = official.officialActualSource || official.actualSource;
    const epsEstimate = parseNumeric(event.epsEstimate ?? event.estimate);
    const epsDifference = epsEstimate === null
      ? null
      : official.epsActual - epsEstimate;
    const surprisePercent = epsEstimate === null || epsEstimate === 0
      ? null
      : (epsDifference / Math.abs(epsEstimate)) * 100;
    return {
      ...event,
      ...provenance,
      epsActual: official.epsActual,
      actual: official.epsActual,
      epsPreviousYear: official.epsPreviousYear,
      epsCurrency: official.epsCurrency ?? event.epsCurrency ?? null,
      epsUnit: official.epsUnit ?? event.epsUnit ?? null,
      epsDifference,
      difference: epsDifference,
      surprisePercent,
      percent: surprisePercent,
      epsActualSource: source,
      epsPreviousYearSource: source,
      epsActualBasis: official.epsActualBasis || 'EarningsPerShareDiluted',
      epsPreviousYearBasis: official.epsActualBasis || 'EarningsPerShareDiluted',
      revenueActual: official.revenueActual,
      revenuePreviousYear: official.revenuePreviousYear,
      revenueActualSuppressed: false,
      revenueActualOriginalCurrency: 'USD',
      revenuePreviousYearOriginalCurrency: 'USD',
      revenueActualSource: source,
      revenuePreviousYearSource: source,
      revenueActualBasis: official.revenueActualBasis || null,
      revenuePreviousYearBasis: official.revenueActualBasis || null,
      ebitActual: official.ebitActual,
      ebitPreviousYear: official.ebitPreviousYear,
      ebitActualOriginalCurrency: 'USD',
      ebitPreviousYearOriginalCurrency: 'USD',
      ebitActualSource: source,
      ebitPreviousYearSource: source,
      ebitActualBasis: official.ebitActualBasis,
      ebitPreviousYearBasis: official.ebitActualBasis,
      publishedFinancialsComplete: true,
    };
  });
}

export function clearSecOfficialCachesForTests() {
  responseCache.clear();
  resultCache.clear();
  requestScheduleTail = Promise.resolve();
  nextSecRequestAt = 0;
}

async function fetchOfficialEvent({ event, cik, context, today }) {
  const cacheKey = `${cik}|${event.fiscalDate}|${event.reportDate || ''}`;
  const cached = readCache(resultCache, cacheKey, context.nowMs, context.cacheEnabled);
  if (cached) return cached;

  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const submissions = await fetchJsonCached(submissionsUrl, {
    ...context,
    ttlMs: SUBMISSIONS_CACHE_TTL_MS,
    maxBytes: SEC_MAX_COMPANY_FACTS_BYTES,
  });
  if (!submissionsMatchesSymbol(submissions, event.symbol)) {
    const unsupported = statusResult(event, 'unsupported', 'sec-ticker-mismatch', { secCik: cik });
    writeCache(resultCache, cacheKey, unsupported, MISS_CACHE_TTL_MS, context);
    return unsupported;
  }
  const filings = normalizeRecentFilings(submissions);
  const tenQ = selectTenQFiling(filings, event.fiscalDate, today);
  const earningsFiling = event.symbol === 'TSM'
    ? selectEarnings6KFiling(filings, event.reportDate, event.fiscalDate, today)
    : selectEarnings8KFiling(filings, event.reportDate, today);

  if (tenQ) {
    try {
      const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
      const companyFacts = await fetchJsonCached(factsUrl, {
        ...context,
        ttlMs: COMPANY_FACTS_CACHE_TTL_MS,
        maxBytes: SEC_MAX_COMPANY_FACTS_BYTES,
      });
      const parsed = parseSecCompanyFactsActuals({
        symbol: event.symbol,
        fiscalDate: event.fiscalDate,
        companyFacts,
        accession: tenQ.accession,
        filedAt: tenQ.filingDate,
      });
      if (parsed) {
        const result = completeResult({
          event,
          cik,
          filing: tenQ,
          parsed,
          source: 'sec-xbrl',
        });
        writeCache(resultCache, cacheKey, result, RESULT_CACHE_TTL_MS, context);
        return result;
      }
    } catch {
      // A same-quarter earnings exhibit remains a valid independent fallback.
    }
  }

  if (earningsFiling) {
    const filingUrl = buildFilingIndexUrl(cik, earningsFiling.accession);
    try {
      const indexHtml = await fetchTextCached(filingUrl, {
        ...context,
        ttlMs: FILING_CACHE_TTL_MS,
        maxBytes: SEC_MAX_INDEX_BYTES,
      });
      const exhibitUrl = extractExhibit991Url(indexHtml, filingUrl);
      if (exhibitUrl) {
        const exhibitHtml = await fetchTextCached(exhibitUrl, {
          ...context,
          ttlMs: FILING_CACHE_TTL_MS,
          maxBytes: SEC_MAX_EXHIBIT_BYTES,
        });
        const parsed = parseSecExhibitActuals({
          symbol: event.symbol,
          fiscalDate: event.fiscalDate,
          html: exhibitHtml,
        });
        if (parsed) {
          const result = completeResult({
            event,
            cik,
            filing: earningsFiling,
            filingUrl,
            exhibitUrl,
            parsed,
            source: 'sec-exhibit',
          });
          writeCache(resultCache, cacheKey, result, RESULT_CACHE_TTL_MS, context);
          return result;
        }
      }
    } catch {
      // A malformed, oversized, timed-out, or unsupported exhibit never overrides provider data.
    }
    const pending = statusResult(event, 'pending', 'official-filing-unparsed', {
      secCik: cik,
      accession: earningsFiling.accession,
      form: earningsFiling.form,
      filedAt: earningsFiling.acceptedAt || earningsFiling.filingDate,
      filingUrl,
    });
    writeCache(resultCache, cacheKey, pending, MISS_CACHE_TTL_MS, context);
    return pending;
  }

  const pending = statusResult(event, 'pending', 'official-filing-not-found', {
    secCik: cik,
  });
  writeCache(resultCache, cacheKey, pending, MISS_CACHE_TTL_MS, context);
  return pending;
}

async function fetchTickerCikMap(context) {
  const url = 'https://www.sec.gov/files/company_tickers.json';
  const payload = await fetchJsonCached(url, {
    ...context,
    ttlMs: TICKER_CACHE_TTL_MS,
    maxBytes: SEC_MAX_COMPANY_FACTS_BYTES,
  });
  const result = new Map(KNOWN_CIK_BY_SYMBOL);
  for (const entry of Object.values(payload || {})) {
    const symbol = normalizeSymbol(entry?.ticker);
    const cik = padCik(entry?.cik_str);
    if (!symbol || !cik) continue;
    for (const alias of tickerAliases(symbol)) result.set(alias, cik);
  }
  return result;
}

async function fetchJsonCached(url, options) {
  const text = await fetchTextCached(url, options);
  return JSON.parse(text);
}

async function fetchTextCached(url, {
  fetchFn,
  userAgent,
  requestIntervalMs,
  cacheEnabled,
  nowMs,
  ttlMs,
  maxBytes,
  deadlineAt,
}) {
  const cached = readCache(responseCache, url, nowMs, cacheEnabled);
  if (cached !== null) return cached;

  if (Date.now() >= deadlineAt) throw new Error('SEC batch deadline exceeded');
  await waitForRequestSlot(requestIntervalMs, deadlineAt);
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error('SEC batch deadline exceeded');
  const controller = new AbortController();
  let timeoutId;
  const requestTimeoutMs = Math.min(SEC_REQUEST_TIMEOUT_MS, remainingMs);
  const text = await Promise.race([
    (async () => {
      const response = await fetchFn(url, {
        headers: {
          Accept: 'application/json,text/html;q=0.9,*/*;q=0.1',
          'User-Agent': userAgent,
        },
        signal: controller.signal,
      });
      if (!response?.ok) throw new Error(`SEC HTTP ${response?.status || 0}`);
      const contentLength = Number(response.headers?.get?.('content-length') || 0);
      if (contentLength > maxBytes) {
        controller.abort();
        throw new Error('SEC response too large');
      }
      return readResponseTextWithLimit(response, {
        maxBytes,
        controller,
      });
    })(),
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('SEC request deadline exceeded'));
      }, requestTimeoutMs);
    }),
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
  writeCache(responseCache, url, text, ttlMs, { cacheEnabled, nowMs });
  return text;
}

async function readResponseTextWithLimit(response, { maxBytes, controller }) {
  const reader = response?.body?.getReader?.();
  if (!reader) {
    const responseText = await response.text();
    if (Buffer.byteLength(responseText, 'utf8') > maxBytes) {
      controller.abort();
      throw new Error('SEC response too large');
    }
    return responseText;
  }

  const decoder = new TextDecoder();
  const decodedChunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        controller.abort();
        try {
          await reader.cancel?.();
        } catch {
          // The original size-limit error remains the public failure reason.
        }
        throw new Error('SEC response too large');
      }
      decodedChunks.push(decoder.decode(chunk, { stream: true }));
    }
    decodedChunks.push(decoder.decode());
    return decodedChunks.join('');
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      // A reader cleanup failure must not replace the request failure or parsed response.
    }
  }
}

function normalizeRecentFilings(submissions) {
  const recent = submissions?.filings?.recent || {};
  const length = Math.max(
    recent.accessionNumber?.length || 0,
    recent.form?.length || 0,
    recent.filingDate?.length || 0,
  );
  const filings = [];
  for (let index = 0; index < length; index += 1) {
    const accession = normalizeAccession(recent.accessionNumber?.[index]);
    const form = String(recent.form?.[index] || '').trim().toUpperCase();
    const filingDate = dateKey(recent.filingDate?.[index]);
    if (!accession || !form || !filingDate) continue;
    filings.push({
      accession,
      form,
      filingDate,
      reportDate: dateKey(recent.reportDate?.[index]),
      items: String(recent.items?.[index] || ''),
      primaryDocument: String(recent.primaryDocument?.[index] || ''),
      acceptedAt: normalizeAcceptedAt(recent.acceptanceDateTime?.[index]),
    });
  }
  return filings;
}

function selectEarningsDetailFiling(filings, fiscalDate, reportDate, today) {
  const periodic = selectUniqueNearestFiscalFiling(filings, fiscalDate, today);
  if (periodic) return periodic;
  const foreignEarnings = selectEarnings6KFiling(
    filings,
    reportDate,
    fiscalDate,
    today,
  );
  if (foreignEarnings) return foreignEarnings;
  return selectEarnings8KFiling(filings, reportDate, today);
}

function selectUniqueNearestFiscalFiling(filings, fiscalDate, today) {
  const target = parseDate(fiscalDate);
  if (!target) return null;
  const formPriority = new Map([
    ['10-Q', 0],
    ['10-K', 1],
    ['20-F', 2],
  ]);
  const candidates = (filings || [])
    .filter((filing) => formPriority.has(filing.form))
    .filter((filing) => filing.filingDate <= today)
    .map((filing) => ({
      filing,
      distance: Math.abs(dayDifference(target, parseDate(filing.reportDate))),
      formPriority: formPriority.get(filing.form),
    }))
    .filter(({ distance }) => distance <= SEC_FISCAL_DATE_TOLERANCE_DAYS)
    .sort((a, b) => (
      a.distance - b.distance
      || a.formPriority - b.formPriority
      || b.filing.filingDate.localeCompare(a.filing.filingDate)
    ));
  if (candidates.length === 0) return null;
  const best = candidates[0];
  const equallyRanked = candidates.filter((candidate) => (
    candidate.distance === best.distance
    && candidate.formPriority === best.formPriority
  ));
  return equallyRanked.length === 1 ? best.filing : null;
}

function selectTenQFiling(filings, fiscalDate, today) {
  return (filings || [])
    .filter((filing) => /^10-Q(?:\/A)?$/.test(filing.form))
    .filter((filing) => filing.reportDate === fiscalDate && filing.filingDate <= today)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))[0] || null;
}

function selectOriginalTenQFiling(filings, fiscalDate, today) {
  return (filings || [])
    .filter((filing) => filing.form === '10-Q')
    .filter((filing) => filing.reportDate === fiscalDate && filing.filingDate <= today)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))[0] || null;
}

function selectEarnings8KFiling(filings, reportDate, today) {
  const target = parseDate(reportDate);
  if (!target) return null;
  return (filings || [])
    .filter((filing) => /^8-K(?:\/A)?$/.test(filing.form))
    .filter((filing) => /(?:^|,)\s*2\.02(?:,|$)/.test(filing.items))
    .filter((filing) => filing.filingDate <= today)
    .map((filing) => ({
      filing,
      distance: dayDifference(target, parseDate(filing.filingDate)),
    }))
    .filter(({ distance }) => distance >= -2 && distance <= 14)
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance) || b.filing.filingDate.localeCompare(a.filing.filingDate))[0]?.filing || null;
}

function selectEarnings6KFiling(filings, reportDate, fiscalDate, today) {
  const target = parseDate(reportDate);
  if (!target || !fiscalDate) return null;
  return (filings || [])
    .filter((filing) => /^6-K(?:\/A)?$/.test(filing.form))
    .filter((filing) => filing.reportDate === fiscalDate)
    .filter((filing) => filing.filingDate <= today)
    .map((filing) => ({
      filing,
      distance: dayDifference(target, parseDate(filing.filingDate)),
    }))
    .filter(({ distance }) => distance >= -2 && distance <= 14)
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance) || b.filing.filingDate.localeCompare(a.filing.filingDate))[0]?.filing || null;
}

function completeResult({
  event,
  cik,
  filing,
  filingUrl = buildFilingIndexUrl(cik, filing.accession),
  exhibitUrl = null,
  parsed,
  source,
}) {
  return {
    key: event.key,
    symbol: event.symbol,
    fiscalDate: event.fiscalDate,
    reportDate: event.reportDate || null,
    officialActualSchemaVersion: OFFICIAL_ACTUAL_SCHEMA_VERSION,
    officialActualStatus: 'complete',
    officialActualReason: null,
    actualSource: source,
    officialActualSource: source,
    actualBasis: 'gaap',
    secCik: cik,
    accession: filing.accession,
    form: filing.form,
    filedAt: filing.acceptedAt || filing.filingDate,
    filingUrl,
    exhibitUrl,
    ...parsed,
  };
}

function statusResult(event, status, reason, extra = {}) {
  return {
    key: event.key,
    symbol: event.symbol,
    fiscalDate: event.fiscalDate,
    reportDate: event.reportDate || null,
    officialActualSchemaVersion: OFFICIAL_ACTUAL_SCHEMA_VERSION,
    officialActualStatus: status,
    officialActualReason: reason,
    actualSource: null,
    officialActualSource: null,
    actualBasis: null,
    ...extra,
  };
}

function submissionsMatchesSymbol(submissions, symbol) {
  const tickers = Array.isArray(submissions?.tickers)
    ? submissions.tickers.map(normalizeSymbol).filter(Boolean)
    : [];
  const requestedAliases = new Set(tickerAliases(symbol));
  return tickers.length > 0 && tickers.some((ticker) => (
    tickerAliases(ticker).some((alias) => requestedAliases.has(alias))
  ));
}

function dedupeEvents(events) {
  const unique = new Map();
  for (const event of events || []) {
    const symbol = normalizeSymbol(event?.symbol || event?.code);
    const fiscalDate = dateKey(event?.fiscalDate || event?.date);
    const reportDate = dateKey(event?.reportDate || event?.report_date);
    if (!symbol || !fiscalDate) continue;
    const key = `${symbol}|${fiscalDate}`;
    if (!unique.has(key)) unique.set(key, { key, symbol, fiscalDate, reportDate });
  }
  return Array.from(unique.values());
}

function eventKey(event) {
  const symbol = normalizeSymbol(event?.symbol || event?.code);
  const fiscalDate = dateKey(event?.fiscalDate || event?.date);
  return `${symbol}|${fiscalDate}`;
}

function buildFilingIndexUrl(cik, accession) {
  const archiveCik = String(Number(cik));
  const flatAccession = accession.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${archiveCik}/${flatAccession}/${accession}-index.html`;
}

function buildPrimaryDocumentUrl(cik, filing) {
  const primaryDocument = String(filing?.primaryDocument || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]*\.html?$/i.test(primaryDocument)) return null;
  const archiveCik = String(Number(cik));
  const flatAccession = String(filing?.accession || '').replace(/-/g, '');
  if (!archiveCik || !/^\d{18}$/.test(flatAccession)) return null;
  return `https://www.sec.gov/Archives/edgar/data/${archiveCik}/${flatAccession}/${primaryDocument}`;
}

function readCache(cache, key, nowMs, enabled) {
  if (!enabled) return null;
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= nowMs) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(cache, key, value, ttlMs, context) {
  if (!context.cacheEnabled) return;
  const maxEntries = cache === responseCache
    ? RESPONSE_CACHE_MAX_ENTRIES
    : RESULT_CACHE_MAX_ENTRIES;
  if (!cache.has(key)) {
    while (cache.size >= maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  }
  cache.set(key, {
    value,
    expiresAt: context.nowMs + ttlMs,
  });
}

async function waitForRequestSlot(intervalMs, deadlineAt) {
  if (!(intervalMs > 0)) return;
  const reservation = requestScheduleTail.then(() => {
    const now = Date.now();
    const slotAt = Math.max(now, nextSecRequestAt);
    if (slotAt >= deadlineAt) throw new Error('SEC batch deadline exceeded');
    nextSecRequestAt = slotAt + intervalMs;
    return slotAt;
  });
  requestScheduleTail = reservation.then(() => undefined, () => undefined);
  const slotAt = await reservation;
  const waitMs = Math.max(0, slotAt - Date.now());
  if (Date.now() + waitMs >= deadlineAt) throw new Error('SEC batch deadline exceeded');
  if (waitMs > 0) await delay(waitMs);
}

async function mapLimit(tasks, limit) {
  const results = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

function resolveRequestInterval(fetchFn, value) {
  if (Number.isFinite(value) && value >= 0) return value;
  return fetchFn === globalThis.fetch ? SEC_REQUEST_INTERVAL_MS : 0;
}

function sanitizeUserAgent(value) {
  const normalized = String(value || '').replace(/[\r\n]/g, ' ').trim().slice(0, 240);
  return normalized || DEFAULT_SEC_USER_AGENT;
}

function padCik(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits || digits.length > 10) return '';
  return digits.padStart(10, '0');
}

function normalizeAccession(value) {
  const match = String(value || '').trim().match(/^(\d{10}-\d{2}-\d{6})$/);
  return match?.[1] || '';
}

function normalizeAcceptedAt(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/\.US$/, '');
}

function tickerAliases(value) {
  const symbol = normalizeSymbol(value);
  if (!symbol || !/^[A-Z0-9.-]{1,15}$/.test(symbol)) return [];
  const aliases = new Set([symbol]);
  if (symbol.includes('.')) aliases.add(symbol.replace(/\./g, '-'));
  if (symbol.includes('-')) aliases.add(symbol.replace(/-/g, '.'));
  return Array.from(aliases);
}

function dateKey(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  const key = dateKey(value);
  if (!key) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function newYorkDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayDifference(from, to) {
  if (!from || !to) return Number.POSITIVE_INFINITY;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
