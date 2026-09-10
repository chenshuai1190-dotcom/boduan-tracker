import { fetchSecEarningsDetail, parseEarningsDetailRequest } from './secEarningsDetail.js';

export const COVERAGE_LIMITS = Object.freeze({
  events: 20,
  inputBytes: 256 * 1024,
  secRequests: 100,
  secRequestsPerEvent: 6,
  eventTimeoutMs: 12_000,
  requestIntervalMs: 250,
});

const SECTION_NAMES = ['reportSegments', 'revenueBreakdown', 'geographies'];
const STATUSES = new Set(['complete', 'partial', 'pending', 'unavailable']);
const SEC_HOSTS = new Set(['sec.gov', 'www.sec.gov', 'data.sec.gov']);

export function validateCoverageEvents(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > COVERAGE_LIMITS.events) {
    throw new Error('event-list-must-contain-1-to-20-events');
  }
  const seen = new Set();
  return input.map((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error(`invalid-event-at-index-${index}`);
    }
    const query = {};
    for (const key of ['symbol', 'fiscalDate', 'reportDate', 'providerFiscalDate', 'officialFiscalDate']) {
      const value = event[key];
      if (value === undefined && ['providerFiscalDate', 'officialFiscalDate'].includes(key)) continue;
      if (typeof value !== 'string' || !value.trim() || value.length > 32) {
        throw new Error(`invalid-${key}-at-index-${index}`);
      }
      query[key] = value.trim();
    }
    const parsed = parseEarningsDetailRequest(query);
    if (parsed.error) throw new Error(`invalid-event-dates-or-symbol-at-index-${index}`);
    const key = [parsed.symbol, parsed.providerFiscalDate, parsed.officialFiscalDate, parsed.reportDate].join('|');
    if (seen.has(key)) throw new Error(`duplicate-event-at-index-${index}`);
    seen.add(key);
    return parsed;
  });
}

function safeCode(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value)
    ? value
    : null;
}

function emptySections(status, reason) {
  return Object.fromEntries(SECTION_NAMES.map((name) => [name, { status, count: 0, reason }]));
}

function emptyRow(event, status, reason) {
  return {
    ...event,
    status,
    reason,
    failureReason: null,
    source: { provider: null, form: null, documentType: null, parser: null },
    sections: emptySections(status, reason),
    secRequests: 0,
  };
}

export function summarizeCoverageDetail(event, detail) {
  const source = {
    provider: safeCode(detail?.source?.provider),
    form: safeCode(detail?.source?.form),
    documentType: safeCode(detail?.source?.documentType),
    parser: safeCode(detail?.source?.parser?.id || detail?.source?.parser
      || detail?.parser?.id || detail?.parser),
  };
  if (source.provider && source.provider !== 'SEC') {
    return { ...emptyRow(event, 'unavailable', 'non-sec-source-excluded'), source };
  }
  if (!STATUSES.has(detail?.status)
    || (['complete', 'partial'].includes(detail?.status) && source.provider !== 'SEC')) {
    return emptyRow(event, 'unavailable', 'invalid-sec-detail-response');
  }
  return {
    ...emptyRow(event, detail.status, safeCode(detail.reason)),
    failureReason: safeCode(detail.failureReason),
    source,
    sections: Object.fromEntries(SECTION_NAMES.map((name) => {
      const section = detail.sections?.[name];
      if (!STATUSES.has(section?.status) || !Array.isArray(section?.items)) {
        return [name, { status: 'unavailable', count: 0, reason: 'section-missing-or-invalid' }];
      }
      return [name, {
        status: section.status,
        count: section.items.length,
        reason: safeCode(section.reason),
      }];
    })),
  };
}

function coverageError(code) {
  const error = new Error(code);
  error.coverageCode = code;
  return error;
}

export async function runEarningsDetailCoverage({
  events,
  live = false,
  userAgent = '',
  fetchDetail = fetchSecEarningsDetail,
  fetchFn = globalThis.fetch,
  now = new Date(),
} = {}) {
  const normalizedEvents = validateCoverageEvents(events);
  const checkedAt = new Date(now).toISOString();
  if (live && (typeof userAgent !== 'string' || !userAgent.trim()
    || userAgent.length > 240 || /[\r\n]/.test(userAgent))) {
    throw new Error('live-requires-valid-SEC_USER_AGENT');
  }
  const rows = [];
  let totalRequests = 0;
  let attemptedEvents = 0;

  for (const event of normalizedEvents) {
    if (!live) {
      rows.push(emptyRow(event, 'planned', 'not-requested'));
      continue;
    }
    if (totalRequests >= COVERAGE_LIMITS.secRequests) {
      rows.push(emptyRow(event, 'unavailable', 'sec-total-request-limit'));
      continue;
    }
    let eventRequests = 0;
    let guardFailure = null;
    const boundedSecFetch = async (input, options = {}) => {
      let url;
      try { url = new URL(input); } catch { /* The guard reports a fixed code below. */ }
      if (!url || url.protocol !== 'https:' || !SEC_HOSTS.has(url.hostname)
        || url.username || url.password || (url.port && url.port !== '443')) {
        guardFailure = 'non-sec-request-blocked';
        throw coverageError(guardFailure);
      }
      if (totalRequests >= COVERAGE_LIMITS.secRequests
        || eventRequests >= COVERAGE_LIMITS.secRequestsPerEvent) {
        guardFailure = totalRequests >= COVERAGE_LIMITS.secRequests
          ? 'sec-total-request-limit' : 'sec-event-request-limit';
        throw coverageError(guardFailure);
      }
      totalRequests += 1;
      eventRequests += 1;
      return fetchFn(url.href, {
        method: 'GET',
        redirect: 'error',
        headers: { Accept: 'application/json,text/html;q=0.9,*/*;q=0.1', 'User-Agent': userAgent.trim() },
        signal: options.signal,
      });
    };
    attemptedEvents += 1;
    let row;
    try {
      const detail = await fetchDetail({
        ...event,
        now: new Date(checkedAt),
        userAgent: userAgent.trim(),
        fetchFn: boundedSecFetch,
        requestIntervalMs: COVERAGE_LIMITS.requestIntervalMs,
        batchTimeoutMs: COVERAGE_LIMITS.eventTimeoutMs,
      });
      row = summarizeCoverageDetail(event, detail);
    } catch (error) {
      // Never serialize exception messages, stacks, request headers, or file paths.
      row = emptyRow(event, 'unavailable', safeCode(error?.coverageCode) || 'detail-call-failed');
    }
    if (guardFailure) {
      row = { ...emptyRow(event, 'unavailable', guardFailure), source: row.source, failureReason: guardFailure };
    }
    rows.push({ ...row, secRequests: eventRequests });
  }

  const coveredEvents = rows.filter((row) => ['complete', 'partial'].includes(row.status)
    && Object.values(row.sections).some((section) => section.count > 0)).length;
  return {
    mode: live ? 'live' : 'plan',
    provider: 'SEC',
    checkedAt,
    limits: COVERAGE_LIMITS,
    eventCount: rows.length,
    attemptedEvents,
    secRequests: totalRequests,
    coverage: live ? { coveredEvents, totalEvents: rows.length } : null,
    rows,
  };
}
