import { timingSafeEqual } from 'node:crypto';
import { fetchSecEarningsDetail } from './secEarningsDetail.js';
import { discoverSecWatchlistEvents } from './secWatchlistDiscovery.js';
import { selectSharedEarningsDetail } from './secEarningsSharedCache.js';
import { createSecEarningsCoverageRepository, normalizeCoverageEvent, coverageEventRow, secEarningsAutoCoverageEnabled } from './secEarningsCoverageRepository.js';
import { EARNINGS_DETAIL_PARSER_VERSION, earningsDetailCacheTtl } from '../../src/lib/earningsDetailPolicy.js';

export const SEC_COVERAGE_RUN_LIMITS = Object.freeze({ jobs: 36, claim: 12, concurrency: 3, budgetMs: 40_000, eventBudgetMs: 7000, requests: 100 });
const SECTION_KEYS = ['reportSegments', 'revenueBreakdown', 'geographies'];
const safeReason = (value) => /^[a-z][a-z0-9-]{0,119}$/.test(value || '') ? value : 'sec-coverage-unavailable';
const nyDate = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export function authorizeSecEarningsCoverage(req, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503 };
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(String(req.headers?.authorization || ''));
  return expected.length === actual.length && timingSafeEqual(expected, actual)
    ? { ok: true } : { ok: false, status: 401 };
}

export function coverageResultRow(detail, symbol, now = new Date()) {
  const source = detail?.source;
  const officialDate = detail?.period?.officialFiscalDate || detail?.period?.end;
  if (!['complete', 'partial'].includes(detail?.status) || detail.symbol !== symbol
    || detail.parserVersion !== EARNINGS_DETAIL_PARSER_VERSION
    || source?.provider !== 'SEC' || !/^\d{10}$/.test(source.cik || '')
    || !/^\d{10}-\d{2}-\d{6}$/.test(source.accession || '')
    || !/^(?:PRIMARY|EX-99\.\d{1,2})$/.test(source.documentType || '')
    || !/^\d{4}-\d{2}-\d{2}$/.test(officialDate || '')
    || officialDate !== detail.period.end
    || !SECTION_KEYS.some((key) => detail.sections?.[key]?.status === 'complete' && detail.sections[key].items?.length > 0)) return null;
  const checkTime = now.toISOString();
  if (!selectSharedEarningsDetail({ request: { symbol, ...detail.period }, now,
    parserVersion: EARNINGS_DETAIL_PARSER_VERSION, rows: [{ symbol, payload: detail,
      parser_version: EARNINGS_DETAIL_PARSER_VERSION, checked_at: checkTime,
      expires_at: new Date(now.getTime() + 60_000).toISOString() }] })) return null;
  // The only caller supplies the SEC parser result, never browser-uploaded data.
  const payload = structuredClone(detail);
  delete payload.cache;
  delete payload.stale;
  delete payload.fetchedAt;
  delete payload.checkedAt;
  return {
    official_fiscal_date: officialDate, accession: source.accession, document_type: source.documentType,
    cik: source.cik, payload, ttl_seconds: earningsDetailCacheTtl(detail) / 1000,
  };
}

export function combineCoverageEvents(symbol, requested, discovered, today) {
  const official = discovered.map((item) => ({ ...normalizeCoverageEvent(item), accession: item.accession }))
    .filter((item) => item.symbol === symbol && item.reportDate <= today);
  const days = (left, right) => Math.abs(Date.parse(left) - Date.parse(right)) / 86400000;
  const groups = new Map();
  for (const raw of requested) {
    const event = normalizeCoverageEvent(raw);
    if (!event || event.symbol !== symbol || event.reportDate > today) continue;
    const matches = official.filter((item) => event.officialFiscalDate
      ? item.officialFiscalDate === event.officialFiscalDate
      : days(item.fiscalDate, event.providerFiscalDate) <= 31 && days(item.reportDate, event.reportDate) <= 14);
    const match = matches.length === 1 ? matches[0] : null;
    const merged = match ? { ...event, fiscalDate: match.fiscalDate, officialFiscalDate: match.fiscalDate, accession: match.accession } : event;
    const key = merged.officialFiscalDate || merged.providerFiscalDate;
    if (!groups.has(key) || groups.get(key).reportDate < merged.reportDate) groups.set(key, merged);
  }
  for (const event of official) if (!groups.has(event.fiscalDate)) groups.set(event.fiscalDate, event);
  return [...groups.values()].sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate)).slice(0, 2);
}

export async function runSecEarningsAutoCoverage({
  repository = createSecEarningsCoverageRepository(), discover = discoverSecWatchlistEvents,
  fetchDetail = fetchSecEarningsDetail, now = new Date(), clock = Date.now,
  fetchFn = globalThis.fetch,
  maxJobs = SEC_COVERAGE_RUN_LIMITS.jobs, budgetMs = SEC_COVERAGE_RUN_LIMITS.budgetMs,
} = {}) {
  const started = clock();
  const deadline = started + Math.min(Math.max(1000, budgetMs), SEC_COVERAGE_RUN_LIMITS.budgetMs);
  const cap = Math.min(Math.max(1, maxJobs), SEC_COVERAGE_RUN_LIMITS.jobs);
  const report = { success: true, claimed: 0, processed: 0, reused: 0, stored: 0, unavailable: 0, failed: 0, staleWrites: 0, deferred: 0, secRequests: 0, bounded: false };
  const today = nyDate(now);
  let requestQueue = Promise.resolve();
  let lastRequestAt = 0;
  // One global start-rate gate per run, not three independent per-job gates.
  const secFetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !['www.sec.gov', 'data.sec.gov', 'sec.gov'].includes(url.hostname)
      || url.username || url.password || url.port) throw Object.assign(new Error('non-sec-request-blocked'), { code: 'non-sec-request-blocked' });
    const turn = requestQueue.then(async () => {
      const delay = Math.max(0, 250 - (Date.now() - lastRequestAt));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (options.signal?.aborted || clock() >= deadline - 4000 || report.secRequests >= SEC_COVERAGE_RUN_LIMITS.requests) {
        throw Object.assign(new Error('sec-request-budget'), { code: 'sec-request-budget' });
      }
      report.secRequests += 1;
      lastRequestAt = Date.now();
    });
    requestQueue = turn.catch(() => {});
    await turn;
    return fetchFn(url.href, { ...options, method: 'GET', redirect: 'error' });
  };
  async function processJob(job) {
    let status = 'unavailable';
    let reason = null;
    const results = [];
    const events = [];
    let discovery;
    try {
      if (clock() >= deadline - 8000) {
        // Do not spend another 4–8 seconds per unstarted job draining a batch.
        // Its 90-second lease expires safely; a later run can claim it again.
        report.deferred += 1;
        return;
      }
      const inputs = await repository.inputs(job.symbol, today);
      if (clock() >= deadline - 8000) throw Object.assign(new Error('worker-time-budget'), { code: 'worker-time-budget' });
      discovery = await discover({ symbol: job.symbol, now, fetchFn: secFetch, batchTimeoutMs: Math.min(7000, deadline - clock() - 4000) });
      const candidates = combineCoverageEvents(job.symbol, inputs.events, discovery.events || [], today);
      events.push(...candidates.map((event) => ({ ...coverageEventRow(event),
        ...(event.accession ? { expected_accession: event.accession } : {}),
        status: 'pending', reason: 'worker-time-budget' })));
      reason = safeReason(discovery.reason || 'official-filing-not-found');
      status = discovery.status === 'pending' ? 'pending' : 'unavailable';
      let usable = 0;
      let exhausted = false;
      let resolvedRelease = false;
      for (const event of candidates) {
        if (clock() >= deadline - 8000) { exhausted = true; break; }
        const shared = selectSharedEarningsDetail({ request: event, rows: inputs.results, now, parserVersion: EARNINGS_DETAIL_PARSER_VERSION });
        // A newly discovered accession must not be satisfied by an older one.
        const expected = event.accession;
        let detail = shared && (!expected || shared.source?.accession === expected) ? shared : null;
        if (detail) report.reused += 1;
        else detail = await fetchDetail({ ...event, now, fetchFn: secFetch, batchTimeoutMs: Math.min(7000, deadline - clock() - 4000) });
        const result = (!expected || detail?.source?.accession === expected) ? coverageResultRow(detail, job.symbol, now) : null;
        if (result && discovery.unresolvedRelease?.accession === detail.source?.accession) resolvedRelease = true;
        if (result) {
          usable += 1;
          if (!shared || detail !== shared) results.push(result);
          status = detail.status === 'complete' && status !== 'partial' ? 'complete' : 'partial';
          reason = detail.status === 'complete' ? null : safeReason(detail.reason);
        } else {
          reason = safeReason(detail?.reason || 'latest-filing-not-parsed');
          if (detail?.status === 'pending') status = 'pending';
        }
        const marker = events[candidates.indexOf(event)];
        Object.assign(marker, { status: result ? detail.status : (detail?.status === 'pending' ? 'pending' : 'unavailable'), reason: result ? null : reason });
      }
      if (!usable) {
        status = status === 'pending' || reason === 'worker-time-budget' ? 'pending' : 'unavailable';
        report.unavailable += 1;
      } else if (events.some((event) => !['complete', 'partial'].includes(event.status))) status = 'partial';
      if (discovery.hasUnresolvedRelease && !resolvedRelease) {
        status = usable ? 'partial' : 'pending';
        reason = 'needs-calendar-period';
      }
      if (exhausted || (discovery.status === 'pending'
        && !(discovery.reason === 'needs-calendar-period' && resolvedRelease))) {
        status = usable ? 'partial' : 'pending';
        reason = exhausted ? 'worker-time-budget' : safeReason(discovery.reason);
        if (exhausted) report.deferred += 1;
      }
      const outcome = await repository.complete(job, {
        status, reason, results, events,
        delaySeconds: status === 'complete' ? 21600 : status === 'unavailable' ? 86400 : 3600,
      });
      if (outcome?.outcome === 'stale') report.staleWrites += 1;
      else if (outcome?.outcome === 'completed') { report.processed += 1; report.stored += Number(outcome.stored) || 0; }
      else throw new Error('sec-coverage-store-invalid-response');
    } catch (error) {
      report.failed += 1;
      if (clock() >= deadline) { report.deferred += 1; return; }
      const delay = Math.min(21600, 900 * 2 ** Math.min(5, Math.max(0, Number(job.attempt_count || 1) - 1)));
      try {
        await repository.complete(job, { status: 'error', reason: safeReason(error.code || 'sec-coverage-request-failed'), delaySeconds: delay,
          results, events: events.map((event) => event.status === 'pending'
            ? { ...event, reason: safeReason(error.code || 'sec-coverage-request-failed') } : event) });
      } catch { /* The expiring lease permits recovery; never log credentials or raw bodies. */ }
    }
  }
  while (report.claimed < cap && clock() < deadline - 10_000) {
    const jobs = await repository.claim(Math.min(SEC_COVERAGE_RUN_LIMITS.claim, cap - report.claimed));
    if (!jobs.length) break;
    report.claimed += jobs.length;
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => {
      while (cursor < jobs.length) await processJob(jobs[cursor++]);
    }));
  }
  report.bounded = report.claimed >= cap || clock() >= deadline - 10_000;
  report.success = report.failed === 0;
  return report;
}

export async function handleSecEarningsCoverageSchedule(req, res, {
  env = process.env, run = runSecEarningsAutoCoverage,
} = {}) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ success: false, error: 'Method Not Allowed' }); }
  const auth = authorizeSecEarningsCoverage(req, env);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.status === 401 ? 'Unauthorized' : 'Coverage scheduler not configured' });
  if (!secEarningsAutoCoverageEnabled(env)) return res.status(200).json({ success: true, enabled: false });
  try {
    const result = await run();
    return res.status(result.success ? 200 : 503).json({ ...result, enabled: true });
  } catch {
    return res.status(503).json({ success: false, enabled: true, error: 'Coverage scheduler temporarily unavailable' });
  }
}
