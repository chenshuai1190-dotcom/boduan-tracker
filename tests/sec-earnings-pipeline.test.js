import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchSecEarningsFilingSource, clearSecOfficialCachesForTests } from '../server/earnings/secOfficialActuals.js';
import { fetchSecEarningsDetail, clearSecEarningsDetailCachesForTests } from '../server/earnings/secEarningsDetail.js';
import { mergeVerifiedDocumentSections } from '../server/earnings/secEarningsDocument.js';
import { earningsDetailCacheTtl, earningsDetailStateText } from '../src/lib/earningsDetailPolicy.js';
import { earningsDetailClientCacheKey, earningsDetailStructureRevenueTotal, normalizeEarningsDetailPayload, fetchEarningsDetail } from '../src/lib/earningsDetail.js';

const event = { symbol: 'GOOGL', fiscalDate: '2026-06-30', reportDate: '2026-07-30' };
const options = { ...event, now: new Date('2026-07-31T12:00:00Z'), requestIntervalMs: 0 };
const periodicAccession = '0001652044-26-000071';
const releaseAccession = '0001652044-26-000070';
const releasePath = `/Archives/edgar/data/1652044/${releaseAccession.replaceAll('-', '')}/release.htm`;
function response(body, status = 200) {
  return { ok: status === 200, status, headers: { get: () => null },
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
    json: async () => body };
}
function submissions({ periodic = true } = {}) {
  const rows = [
    ...(periodic ? [{ accession: periodicAccession, form: '10-Q', period: event.fiscalDate, file: 'periodic.htm', items: '' }] : []),
    { accession: releaseAccession, form: '8-K', period: event.reportDate, file: 'cover.htm', items: '2.02,9.01' },
  ];
  return { tickers: ['GOOGL'], filings: { recent: {
    accessionNumber: rows.map((row) => row.accession), form: rows.map((row) => row.form),
    reportDate: rows.map((row) => row.period), primaryDocument: rows.map((row) => row.file),
    items: rows.map((row) => row.items), filingDate: rows.map(() => event.reportDate),
  } } };
}
function sourceMock({ periodic = true, html = 'periodic', release = true } = {}) {
  const calls = [];
  return { calls, fetchFn: async (url) => {
    const parsed = new URL(url);
    assert.ok(['www.sec.gov', 'data.sec.gov'].includes(parsed.hostname));
    calls.push(parsed.pathname);
    if (parsed.pathname.startsWith('/submissions/')) return response(submissions({ periodic }));
    if (parsed.pathname.endsWith('/periodic.htm')) return response(html);
    if (parsed.pathname.endsWith('-index.html')) return response(release
      ? `<table><tr><td>EX-99.1</td><td><a href="${releasePath}">Earnings</a></td></tr></table>` : '<html>No exhibit</html>');
    if (parsed.pathname.endsWith('/release.htm')) return response('release');
    if (parsed.pathname.endsWith('/cover.htm')) return response('cover');
    throw new Error('Unexpected SEC request');
  } };
}
const accepted = { status: 'partial', sections: { revenueBreakdown: { status: 'complete', items: [{ revenue: 100 }] } } };

test('a validated periodic document stops before requesting the earnings release', async () => {
  const mock = sourceMock();
  const result = await fetchSecEarningsFilingSource({ ...options, ...mock, preferEarningsExhibit: true,
    evaluateDocument: () => ({ result: accepted, parser: 'test' }) });
  assert.equal(result.form, '10-Q');
  assert.equal(result.attempts.length, 1);
  assert.equal(mock.calls.length, 2);
});

test('unparsed periodic document can try one matching EX-99.1; values are never merged', async () => {
  const mock = sourceMock();
  const result = await fetchSecEarningsFilingSource({ ...options, ...mock, preferEarningsExhibit: true,
    evaluateDocument: (doc) => ({ result: doc.html === 'release' ? accepted : null, reason: doc.html === 'release' ? null : 'unsupported-form' }) });
  assert.equal(result.form, '8-K');
  assert.equal(result.documentType, 'EX-99.1');
  assert.equal(result.accession, releaseAccession);
  assert.equal(result.html, 'release');
  assert.equal(result.attempts.length, 2);
  assert.equal(mock.calls.length, 4);
  assert.ok(!mock.calls.some((path) => path.endsWith('/cover.htm')));
});

test('release-day discovery prioritizes an exhibit and falls back to cover only when absent', async () => {
  for (const release of [true, false]) {
    const mock = sourceMock({ periodic: false, release });
    const result = await fetchSecEarningsFilingSource({ ...options, ...mock, preferEarningsExhibit: true,
      evaluateDocument: () => ({ result: accepted }) });
    assert.equal(result.form, '8-K');
    assert.equal(result.documentType, release ? 'EX-99.1' : 'PRIMARY');
    assert.equal(mock.calls.length, 3);
  }
});

test('all unparsed candidates stay bounded and retain original filing provenance', async () => {
  const mock = sourceMock();
  const result = await fetchSecEarningsFilingSource({ ...options, ...mock, preferEarningsExhibit: true,
    evaluateDocument: () => ({ result: null, reason: 'unsupported-document-type' }) });
  assert.equal(result.accession, periodicAccession);
  assert.equal(result.attempts.length, 3);
  assert.equal(mock.calls.length, 5);
  assert.equal(result.evaluation.result, null);
});

test('an explicitly selected shareholder-letter exhibit is not overwritten by EX-99.1', async () => {
  const mock = sourceMock({ periodic: false });
  const fetchFn = async (url) => {
    if (new URL(url).pathname.endsWith('-index.html')) {
      mock.calls.push(new URL(url).pathname);
      return response(`<table><tr><td>EX-99.1</td><td><a href="${releasePath}">Announcement</a></td></tr>
        <tr><td>EX-99.2</td><td><a href="${releasePath.replace('release.htm', 'letter.htm')}">Letter</a></td></tr></table>`);
    }
    if (new URL(url).pathname.endsWith('/letter.htm')) {
      mock.calls.push(new URL(url).pathname);
      return response('letter');
    }
    return mock.fetchFn(url);
  };
  const result = await fetchSecEarningsFilingSource({ ...options, fetchFn,
    preferredDocumentTypes: ['EX-99.2', 'PRIMARY'], preferEarningsExhibit: true,
    evaluateDocument: (document) => ({ result: document.html === 'letter' ? accepted : null }) });
  assert.equal(result.documentType, 'EX-99.2');
  assert.equal(result.html, 'letter');
  assert.equal(mock.calls.length, 3);
  assert.ok(!mock.calls.includes(releasePath));
});

test('server singleflight coalesces matching authenticated-detail work', async () => {
  const originalFetch = globalThis.fetch;
  const html = await readFile(new URL('./fixtures/sec-earnings-detail/googl-10q-primary.html', import.meta.url), 'utf8');
  const mock = sourceMock({ html });
  globalThis.fetch = mock.fetchFn;
  clearSecOfficialCachesForTests();
  clearSecEarningsDetailCachesForTests();
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => fetchSecEarningsDetail(options)));
    assert.ok(results.every((result) => result.status === 'complete'));
    assert.equal(mock.calls.length, 2);
    assert.equal(results[0].source.documentType, 'PRIMARY');
    assert.equal(results[0].source.parser, 'sec-company-primary');
  } finally {
    globalThis.fetch = originalFetch;
    clearSecOfficialCachesForTests();
    clearSecEarningsDetailCachesForTests();
  }
});

test('only verified same-document missing sections can be filled; conflicts and current totals are never bypassed', () => {
  const dedicated = { currency: 'USD', period: { start: '2026-04-01', end: '2026-06-30' }, status: 'partial', sections: {
    reportSegments: { status: 'complete', items: [{ revenue: 60, previousRevenue: 50 }, { revenue: 40, previousRevenue: 30 }] },
    revenueBreakdown: { status: 'unavailable', reason: 'ambiguous-or-missing-xbrl-facts', items: [] },
    geographies: { status: 'unavailable', reason: 'quarterly-geography-not-disclosed', items: [] },
  } };
  const generic = { currency: 'USD', totalRevenue: 100, previousTotalRevenue: 70, period: { ...dedicated.period }, sections: {
    revenueBreakdown: { status: 'complete', items: [{ revenue: 100 }] },
    geographies: { status: 'complete', items: [{ revenue: 80, previousRevenue: 40 }, { revenue: 20, previousRevenue: 30 }] },
  } };
  const merged = mergeVerifiedDocumentSections(dedicated, generic);
  assert.equal(merged.sections.geographies.status, 'complete');
  assert.equal(merged.sections.geographies.items[0].revenue, 80);
  assert.ok(merged.sections.geographies.items.every((item) => item.previousRevenue === null));
  assert.equal(merged.sections.geographies.metricStatus.previousRevenue.reason, 'unverified-cross-parser-comparative-period');
  assert.strictEqual(merged.sections.reportSegments, dedicated.sections.reportSegments);
  assert.strictEqual(merged.sections.revenueBreakdown, dedicated.sections.revenueBreakdown);
  assert.equal(dedicated.sections.geographies.status, 'unavailable');
  for (const conflict of [{ totalRevenue: 101 }, { currency: 'EUR' }, { period: { ...dedicated.period, start: '2026-01-01' } }]) {
    assert.strictEqual(mergeVerifiedDocumentSections(dedicated, { ...generic, ...conflict }), dedicated);
  }
});

test('partial/unavailable/pending and releases retry in five minutes, complete periodic reports in six hours', () => {
  for (const status of ['pending', 'partial', 'unavailable']) assert.equal(earningsDetailCacheTtl({ status }), 300_000);
  for (const form of ['8-K', '8-K/A', '6-K']) assert.equal(earningsDetailCacheTtl({ status: 'complete', source: { form } }), 300_000);
  assert.equal(earningsDetailCacheTtl({ status: 'complete', source: { form: '10-Q' } }), 21_600_000);
  assert.notEqual(earningsDetailStateText('unavailable', 'missing-axis-facts'), earningsDetailStateText('unavailable', 'quarterly-geography-not-disclosed'));
});

test('a generic revenue-only breakdown uses the same filing total, not a different headline basis', () => {
  const detail = normalizeEarningsDetailPayload({ success: true, symbol: 'COST', status: 'partial', totalRevenue: 100,
    sections: { revenueBreakdown: { status: 'complete', items: [
      { id: 'a', label: 'A', revenue: 60, previousRevenue: null },
      { id: 'b', label: 'B', revenue: 40, previousRevenue: null },
    ], metricStatus: { revenue: { status: 'complete' }, previousRevenue: { status: 'unavailable', reason: 'missing-prior-quarter' } } } } });
  assert.equal(earningsDetailStructureRevenueTotal(detail, { revenueActualUsd: 200 }), 100);
  assert.equal(detail.sections.revenueBreakdown.items[0].previousRevenue, null);
  assert.equal(detail.sections.revenueBreakdown.metricStatus.previousRevenue.status, 'unavailable');
});

function clientHarness() {
  const originalStorage = globalThis.localStorage;
  const entries = new Map();
  globalThis.localStorage = { getItem: (key) => entries.get(key) || null, setItem: (key, value) => entries.set(key, value) };
  const supabase = { auth: { getSession: async () => ({ data: { session: { user: { id: 'test-user' }, access_token: 'test-token' } } }) } };
  const key = earningsDetailClientCacheKey({ ...event, userId: 'test-user' });
  const payload = { success: true, status: 'complete', symbol: event.symbol, source: { form: '10-Q' },
    period: { fiscalDate: event.fiscalDate, reportDate: event.reportDate },
    sections: { reportSegments: { status: 'complete', items: [{ id: 'one', label: 'One', revenue: 100, profit: null }] } } };
  const seed = (value = payload, age = 21_600_001) => entries.set(key, JSON.stringify({ savedAt: Date.now() - age, payload: value }));
  return { entries, key, payload, seed, request: { ...event, supabase }, cleanup: () => {
    if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  } };
}

test('auth, wrong-identity and malformed responses cannot be hidden behind stale success', async () => {
  const h = clientHarness();
  try {
    for (const result of [response({}, 401), response({}, 403), response({ ...h.payload, symbol: 'MSFT' }), response({ success: false })]) {
      h.seed();
      await assert.rejects(fetchEarningsDetail({ ...h.request, fetchImpl: async () => result }));
    }
  } finally { h.cleanup(); }
});

test('HTTP 200 SEC transient failure and transport outage retain verified data, explicitly stale, without overwriting cache', async () => {
  const h = clientHarness();
  try {
    h.seed();
    const saved = h.entries.get(h.key);
    for (const fetchImpl of [async () => response({ ...h.payload, status: 'pending', reason: 'sec-unavailable', sections: {} }), async () => { throw new Error('offline'); }]) {
      const retained = await fetchEarningsDetail({ ...h.request, fetchImpl });
      assert.equal(retained.stale, true);
      assert.equal(retained.sections.reportSegments.items[0].revenue, 100);
      assert.equal(retained.sections.reportSegments.items[0].profit, null);
      assert.equal(h.entries.get(h.key), saved);
    }
  } finally { h.cleanup(); }
});

test('partial client cache refreshes after five minutes, valid fresh cache and duplicate requests are reused', async () => {
  const h = clientHarness();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(h.payload); };
  try {
    h.seed({ ...h.payload, status: 'partial' }, 300_001);
    await Promise.all(Array.from({ length: 5 }, () => fetchEarningsDetail({ ...h.request, fetchImpl })));
    assert.equal(calls, 1);
    await fetchEarningsDetail({ ...h.request, fetchImpl });
    assert.equal(calls, 1);
    await fetchEarningsDetail({ ...h.request, fetchImpl, skipClientCache: true });
    assert.equal(calls, 2);
    h.seed({ ...h.payload, symbol: 'MSFT' }, 1);
    await fetchEarningsDetail({ ...h.request, fetchImpl });
    assert.equal(calls, 3);
  } finally { h.cleanup(); }
});
