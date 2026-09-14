import { fetchSecWatchlistSubmissionsSource, fetchSecEarningsFilingSource, fetchSecCompanyFactsSource, DEFAULT_SEC_USER_AGENT } from '../earnings/secOfficialActuals.js';
import { htmlToText, extractSecExhibitUrl } from '../earnings/secOfficialParsers.js';
import { VALUATION_CIKS, parseValuationQuarters, parseValuationReportIdentity, parseValuationGuidance, valuationDate, valuationReleaseMatchesQuarter } from './stockDecisionValuationParsers.js';

const accession = value => typeof value === 'string' && /^\d{10}-\d{2}-\d{6}$/.test(value);
const normalizedSymbol = value => typeof value === 'string' ? value.trim().toUpperCase().replace(/\.US$/, '') : '';
const MSFT_MAX_BYTES = 3000000;
let readTail = Promise.resolve();
let nextReadAt = 0;
const corporateReviews = new WeakMap();

async function readSlot() {
  const slot = readTail.then(async () => {
    const delay = Math.max(0, nextReadAt - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    nextReadAt = Date.now() + 250;
  });
  readTail = slot.catch(() => {});
  await slot;
}

/** Public-source reads are deduplicated only within this discovery run. The
 * wrapper intentionally bypasses the shared six-hour companyfacts cache. */
function freshReads(fetchFn, signal) {
  const reads = new Map();
  let limited = false;
  let submissions = null;
  const fetchFresh = async (input, options = {}) => {
    if (signal?.aborted) throw new Error('request_aborted');
    const url = new URL(input);
    const allowed = (url.hostname === 'www.sec.gov' || url.hostname === 'data.sec.gov')
      || (url.hostname === 'www.microsoft.com' && /^\/en-us\/investor\/events\/fy-\d{4}\/earnings-fy-\d{4}-q[1-4]$/.test(url.pathname));
    if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw new Error('invalid_source');
    if (!reads.has(url.href)) {
      if (reads.size >= 13) throw new Error('source_budget_exceeded');
      const signals = [signal, options.signal].filter(Boolean);
      reads.set(url.href, Promise.resolve().then(async () => {
        await readSlot();
        if (signal?.aborted) throw new Error('request_aborted');
        return fetchFn(url.href, {
        ...options, signal: signals.length ? AbortSignal.any(signals) : undefined,
        redirect: 'error', cache: 'no-store',
      }); }).then(async response => {
        if (response.status === 429) limited = true;
        if (response.ok && url.pathname.startsWith('/submissions/')) submissions = await response.clone().json();
        return response;
      }));
    }
    const response = await reads.get(url.href);
    if (signal?.aborted) throw new Error('request_aborted');
    return response.clone();
  };
  return { fetchFresh, rateLimited: () => limited, submissions: () => submissions };
}

async function boundedText(fetchFresh, url, signal) {
  try {
    const response = await fetchFresh(url, { headers: { 'User-Agent': process.env.SEC_USER_AGENT || DEFAULT_SEC_USER_AGENT }, signal: AbortSignal.any([signal, AbortSignal.timeout(5500)].filter(Boolean)) });
    if (!response.ok || Number(response.headers.get('content-length')) > MSFT_MAX_BYTES) return null;
    const text = await response.text();
    return Buffer.byteLength(text, 'utf8') <= MSFT_MAX_BYTES ? text : null;
  } catch { return null; }
}

async function checkPostReportShares({ filings, release, submissions, cik, symbol, guidance, fetchFn, fetchFresh, signal }) {
  const later = filings.filter(f => f.form === '8-K' && Date.parse(f.acceptedAt) > Date.parse(release.acceptedAt)
    && /(?:^|,)\s*(?:3\.03|5\.03|5\.07|7\.01|8\.01)(?:,|$)/.test(f.items));
  let cache = corporateReviews.get(fetchFn);
  if (!cache) { cache = new Map(); corporateReviews.set(fetchFn, cache); }
  const evidence = [];
  let reviewed = 0; let outstanding = false;
  for (const filing of later) {
    const key = `${cik}/${filing.accession}`;
    const cached = cache.get(key);
    if (cached) {
      if (cached.status === 'pending') return cached;
      evidence.push(cached.evidence);
      continue;
    }
    if (reviewed >= 2) { outstanding = true; continue; }
    reviewed += 1;
    const index = submissions?.filings?.recent?.accessionNumber?.indexOf(filing.accession);
    const filename = index >= 0 ? submissions.filings.recent.primaryDocument?.[index] : null;
    if (typeof filename !== 'string' || !/^[a-z0-9_-][a-z0-9._-]*\.html?$/i.test(filename)) return { status: 'pending', reason: 'corporate_action_review_pending' };
    const prefix = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${filing.accession.replaceAll('-', '')}/`;
    const url = prefix + filename;
    const html = await boundedText(fetchFresh, url, signal);
    if (!html) return { status: 'pending', reason: 'corporate_action_review_pending' };
    let text = htmlToText(html);
    if (!({ MSFT: /Microsoft Corporation/i, NVDA: /NVIDIA Corporation/i, META: /Meta Platforms/i }[symbol]).test(text)) return { status: 'pending', reason: 'issuer_mismatch' };
    if (/Exhibit\s+99\.1/i.test(text)) {
      const indexUrl = `${prefix}${filing.accession}-index.html`;
      const indexHtml = await boundedText(fetchFresh, indexUrl, signal);
      const exhibit = indexHtml && extractSecExhibitUrl(indexHtml, indexUrl, 'EX-99.1');
      if (!exhibit || !exhibit.startsWith(prefix)) return { status: 'pending', reason: 'corporate_action_review_pending' };
      const attachment = await boundedText(fetchFresh, exhibit, signal);
      if (!attachment) return { status: 'pending', reason: 'corporate_action_review_pending' };
      text += ` ${htmlToText(attachment)}`;
    }
    if (/\b(?:stock|share)[ -]+(?:split|consolidation)\b|\breverse[ -]+split\b/i.test(text)) {
      const result = { status: 'pending', reason: 'split_review_pending' };
      cache.set(key, result);
      while (cache.size > 64) cache.delete(cache.keys().next().value);
      return result;
    }
    let guidanceUnchanged = null;
    if (/\b(?:adjusted|updated|revised)\s+(?:outlook|guidance)\b/i.test(text)) {
      // A segment-only recast can retain verified company totals. Other revised
      // outlooks need a parser update rather than silently reusing old guidance.
      const period = new RegExp(`FY${String(guidance.period.fiscalYear).slice(-2)}\\s+Q${guidance.period.fiscalQuarter}\\s+Adjusted Outlook`, 'i');
      const unchanged = symbol === 'MSFT' && period.test(text) && /mechanical adjustments only/i.test(text)
        && ['Total Company', 'Cost of revenue', 'Operating expenses', 'Other income and expense', 'Operating margin', 'Effective tax rate']
          .every(label => new RegExp(`${label}\\s+No change to outlook`, 'i').test(text));
      if (!unchanged) return { status: 'pending', reason: 'guidance_update_pending' };
      guidanceUnchanged = true;
    }
    const verified = { accession: filing.accession, publishedAt: filing.acceptedAt, sourceUrl: url, ...(guidanceUnchanged ? { guidanceUnchanged } : {}) };
    cache.set(key, { status: 'checked', evidence: verified });
    while (cache.size > 64) cache.delete(cache.keys().next().value);
    evidence.push(verified);
  }
  if (outstanding) return { status: 'pending', reason: 'corporate_action_review_pending' };
  return { status: 'checked', reason: null, filings: evidence };
}

function disclosedFilings(filings, now) {
  const current = now.getTime();
  return (filings || []).filter(filing => accession(filing.accession) && valuationDate(filing.filingDate)
    && valuationDate(filing.reportDate) && typeof filing.acceptedAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T/.test(filing.acceptedAt) && Number.isFinite(Date.parse(filing.acceptedAt))
    && Date.parse(filing.acceptedAt) <= current
    && Date.parse(filing.reportDate) <= current);
}

export async function fetchStockDecisionValuationSource({ symbol, now = new Date(), fetchFn = globalThis.fetch, signal } = {}) {
  const selected = normalizedSymbol(symbol);
  const cik = VALUATION_CIKS[selected] || null;
  const date = new Date(now);
  const base = { status: 'pending', reason: null, symbol: selected, cik, currency: 'USD', report: null, quarters: [], latestDilutedShares: null, guidance: null };
  if (!cik) return { ...base, status: 'unsupported', reason: 'unsupported_symbol' };
  if (!Number.isFinite(date.getTime()) || typeof fetchFn !== 'function') return { ...base, reason: 'invalid_request' };
  const { fetchFresh, rateLimited, submissions } = freshReads(fetchFn, signal);
  const failed = reason => ({ ...base, reason: signal?.aborted ? 'request_aborted' : rateLimited() ? 'sec_rate_limited' : reason });
  // Explicit 250ms interval also applies when this wrapper disables shared caches.
  const options = { symbol: selected, now: date, fetchFn: fetchFresh, requestIntervalMs: 250, batchTimeoutMs: 9000 };
  try {
    const discovery = await fetchSecWatchlistSubmissionsSource(options);
    if (signal?.aborted) return failed('request_aborted');
    if (discovery.status !== 'ready') return failed('discovery_unavailable');
    if (discovery.secCik !== cik) return failed('issuer_mismatch');
    const filings = disclosedFilings(discovery.filings, date);
    const release = filings.filter(f => f.form === '8-K' && /(?:^|,)\s*2\.02(?:,|$)/.test(f.items))
      .sort((a, b) => Date.parse(b.acceptedAt) - Date.parse(a.acceptedAt))[0];
    if (!release) return failed('report_unavailable');
    base.latestRelease = { accession: release.accession, publishedAt: new Date(release.acceptedAt).toISOString(),
      sourceUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${release.accession.replaceAll('-', '')}/${release.accession}-index.html` };
    const periodic = filings.filter(f => ['10-Q', '10-K'].includes(f.form))
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || Date.parse(b.acceptedAt) - Date.parse(a.acceptedAt))[0];
    if (!periodic) return failed('report_facts_pending');
    const document = await fetchSecEarningsFilingSource({ ...options, fiscalDate: periodic.reportDate,
      reportDate: release.filingDate, preferredFilingTypes: ['8-K'], preferredDocumentTypes: ['EX-99.1'], preferEarningsExhibit: true });
    if (signal?.aborted) return failed('request_aborted');
    const identity = parseValuationReportIdentity(document, { symbol: selected, cik, expectedAccession: release.accession, now: date });
    if (!identity) return failed(document.status === 'complete' ? 'report_identity_mismatch' : 'report_unavailable');
    base.report = identity;
    if (identity.periodEnd !== periodic.reportDate || Date.parse(periodic.acceptedAt) < Date.parse(release.acceptedAt) - 14 * 86400000) return failed('report_facts_pending');
    const official = await fetchSecCompanyFactsSource(options);
    if (signal?.aborted) return failed('request_aborted');
    if (official.status !== 'complete') return failed('report_facts_pending');
    if (official.cik !== cik) return failed('issuer_mismatch');
    const history = parseValuationQuarters(official.companyFacts, { symbol: selected, now: date, filings: discovery.filings });
    if (history.status !== 'ready') return failed(history.reason);
    const latest = history.quarters.at(-1);
    if (latest.end !== identity.periodEnd || latest.accession !== periodic.accession) return failed('report_facts_pending');
    if (!valuationReleaseMatchesQuarter(document.html, selected, latest)) return failed('report_identity_mismatch');
    const report = { ...identity, periodStart: latest.start, fiscalYear: latest.fiscalYear, fiscalQuarter: latest.fiscalQuarter };
    base.report = report;
    let transcriptHtml = null; let transcriptUrl = null;
    if (selected === 'MSFT') {
      // A date-only IR transcript cannot establish that it existed intraday.
      if (date.toISOString().slice(0, 10) <= identity.publishedAt.slice(0, 10)) return failed('guidance_publication_unconfirmed');
      transcriptUrl = `https://www.microsoft.com/en-us/investor/events/fy-${report.fiscalYear}/earnings-fy-${report.fiscalYear}-q${report.fiscalQuarter}`;
      const response = await fetchFresh(transcriptUrl, { signal: AbortSignal.timeout(7000) });
      if (!response.ok || Number(response.headers.get('content-length')) > MSFT_MAX_BYTES) return failed('guidance_pending');
      transcriptHtml = await response.text();
      if (Buffer.byteLength(transcriptHtml, 'utf8') > MSFT_MAX_BYTES || signal?.aborted) return failed('guidance_pending');
    }
    const guidance = parseValuationGuidance({ symbol: selected, html: document.html, sourceUrl: identity.sourceUrl, report, annuals: history.annuals, transcriptHtml, transcriptUrl });
    if (!guidance) return failed('guidance_pending');
    const corporateActionCheck = await checkPostReportShares({ filings, release, submissions: submissions(), cik, symbol: selected, guidance, fetchFn, fetchFresh, signal });
    if (corporateActionCheck.status !== 'checked') return failed(corporateActionCheck.reason);
    if (signal?.aborted) return failed('request_aborted');
    return { ...base, status: 'ready', reason: null, report, quarters: history.quarters, annuals: history.annuals, latestDilutedShares: history.latestDilutedShares,
      guidance, corporateActionCheck, sources: [
        { title: `${selected} latest official earnings release`, url: identity.sourceUrl },
        { title: `${selected} SEC GAAP company facts`, url: official.source.companyFactsUrl },
        ...(transcriptUrl ? [{ title: 'Microsoft official earnings call and outlook', url: transcriptUrl }] : []),
        ...corporateActionCheck.filings.map(filing => ({ title: `${selected} subsequent official disclosure`, url: filing.sourceUrl })),
      ] };
  } catch { return failed('source_unavailable'); }
}
