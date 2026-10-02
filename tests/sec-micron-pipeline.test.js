import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchSecEarningsDetail } from '../server/earnings/secEarningsDetail.js';
import { fetchSecEarningsFilingSource } from '../server/earnings/secOfficialActuals.js';
import { coverageResultRow } from '../server/earnings/secEarningsAutoCoverage.js';
import { selectSharedEarningsDetail } from '../server/earnings/secEarningsSharedCache.js';
import { normalizeEarningsDetailPayload, earningsDetailStructureRevenueTotal } from '../src/lib/earningsDetail.js';
import { EARNINGS_DETAIL_PARSER_VERSION, earningsDetailCacheTtl } from '../src/lib/earningsDetailPolicy.js';

const now = new Date('2026-10-02T04:00:00Z');
const request = { symbol: 'MU', fiscalDate: '2026-08-31', providerFiscalDate: '2026-08-31', reportDate: '2026-09-30' };
const accession = '0000723125-26-000018';
const archive = `/Archives/edgar/data/723125/${accession.replaceAll('-', '')}`;
const exhibit = `${archive}/a2026q4ex991-pressrelease.htm`;
const response = (body) => ({ ok: true, status: 200, headers: { get: () => null },
  text: async () => typeof body === 'string' ? body : JSON.stringify(body) });

async function sourceMock({ unparsed = false, periodic = false } = {}) {
  const html = unparsed ? '<html>Micron Technology earnings release without verified financial tables.</html>'
    : await readFile(new URL('./fixtures/sec-micron-business/mu-fy2026-q4-ex99.1.html', import.meta.url), 'utf8');
  const calls = [];
  const rows = [
    ...(periodic ? [{ accession: '0000723125-26-000019', form: '10-K', reportDate: '2026-09-03', file: 'annual.htm', items: '' }] : []),
    { accession, form: '8-K', reportDate: request.reportDate, file: 'cover.htm', items: '2.02,9.01' },
  ];
  const fetchFn = async (url) => {
    const parsed = new URL(url);
    assert.ok(['www.sec.gov', 'data.sec.gov'].includes(parsed.hostname));
    calls.push(parsed.pathname);
    if (parsed.pathname === '/files/company_tickers.json') return response({ 0: { cik_str: 723125, ticker: 'MU', title: 'Micron Technology, Inc.' } });
    if (parsed.pathname === '/submissions/CIK0000723125.json') return response({ cik: '0000723125', tickers: ['MU'], filings: { recent: {
      accessionNumber: rows.map((row) => row.accession), form: rows.map((row) => row.form),
      reportDate: rows.map((row) => row.reportDate), primaryDocument: rows.map((row) => row.file),
      items: rows.map((row) => row.items), filingDate: rows.map(() => request.reportDate),
      acceptanceDateTime: rows.map(() => `${request.reportDate}T20:02:22Z`),
    } } });
    if (parsed.pathname === `${archive}/${accession}-index.html`) return response(`<table><tr><td>EX-99.1</td><td><a href="${exhibit}">Quarterly earnings release</a></td></tr></table>`);
    if (parsed.pathname === exhibit) return response(html);
    if (parsed.pathname.endsWith('/cover.htm')) return response('<html>8-K cover.</html>');
    if (periodic && parsed.pathname.endsWith('/annual.htm')) return response('<html>Annual results, without a standalone quarterly breakdown.</html>');
    assert.fail(`Unexpected SEC request: ${parsed.pathname}`);
  };
  return { fetchFn, calls };
}

test('MU official exhibit flows through source selection, verified period, client normalization and shared cache', async () => {
  const mock = await sourceMock();
  const detail = await fetchSecEarningsDetail({ ...request, ...mock, now, requestIntervalMs: 0 });
  assert.equal(detail.status, 'partial', detail.reason);
  assert.equal(detail.source.parser, 'sec-release-mu-v1');
  assert.equal(detail.source.form, '8-K');
  assert.equal(detail.source.documentType, 'EX-99.1');
  assert.equal(new URL(detail.source.primaryDocumentUrl).pathname, exhibit);
  assert.equal(detail.source.accession, accession);
  assert.equal(detail.period.start, '2026-05-29');
  assert.equal(detail.period.end, '2026-09-03');
  assert.equal(detail.period.officialFiscalDate, '2026-09-03');
  assert.equal(detail.period.providerFiscalDate, '2026-08-31');
  assert.equal(detail.period.fiscalYear, '2026');
  assert.equal(detail.period.fiscalPeriod, 'Q4');
  assert.equal(detail.totalRevenue, 54_229_000_000);
  const report = detail.sections.reportSegments;
  assert.equal(report.status, 'partial');
  assert.equal(report.reason, 'reported-segment-total-mismatch');
  assert.equal(report.items.length, 4, 'do not invent a balancing segment');
  assert.deepEqual(report.items.map((item) => item.revenue), [16_283, 18_002, 13_114, 6_824].map((n) => n * 1e6));
  assert.deepEqual(report.items.map((item) => item.previousRevenue), [4_543, 1_577, 3_760, 1_434].map((n) => n * 1e6));
  assert.ok(report.items.every((item) => item.profit === null && item.previousProfit === null));
  assert.deepEqual(report.revenueReconciliation, {
    status: 'mismatch', currency: 'USD', totalRevenue: 54_229_000_000,
    reportedRevenueTotal: 54_223_000_000, difference: 6_000_000,
    previousTotalRevenue: 11_315_000_000, previousReportedRevenueTotal: 11_314_000_000, previousDifference: 1_000_000,
  });
  const normalized = normalizeEarningsDetailPayload({ ...detail, success: true });
  assert.deepEqual(normalized.sections.reportSegments.revenueReconciliation, report.revenueReconciliation);
  assert.equal(earningsDetailStructureRevenueTotal(normalized, { revenueActualUsd: 999 }), detail.totalRevenue);
  assert.equal(normalized.summaryActuals, null, 'business composition does not overwrite GAAP/non-GAAP headline actuals');
  assert.equal(detail.parserVersion, EARNINGS_DETAIL_PARSER_VERSION);
  assert.equal(earningsDetailCacheTtl(detail), 300_000);
  assert.ok(mock.calls.length <= 4);
  assert.ok(!mock.calls.some((path) => path.endsWith('/cover.htm')));

  const stored = coverageResultRow(detail, 'MU', now);
  assert.equal(stored, null, 'a discrepancy-only result must not be promoted to a fully reconciled shared coverage result');
  // The reader supports verified partial payloads, but the existing writer
  // intentionally requires at least one complete section. Keep that boundary.
  const row = { symbol: 'MU', payload: detail, parser_version: EARNINGS_DETAIL_PARSER_VERSION,
    checked_at: now.toISOString(), expires_at: new Date(now.getTime() + 300_000).toISOString() };
  const select = (rows) => selectSharedEarningsDetail({ request, rows, now, parserVersion: EARNINGS_DETAIL_PARSER_VERSION });
  assert.deepEqual(select([row]).sections, detail.sections);
  const obsolete = structuredClone(row);
  obsolete.parser_version = obsolete.payload.parserVersion = 'sec-structure-6';
  assert.equal(select([obsolete]), null, 'the old unavailable-result parser version must not be reused');
});

test('MU month-end provider tolerance does not override an explicitly supplied official period', async () => {
  for (const officialFiscalDate of ['2026-08-31', '2026-09-03']) {
    const mock = await sourceMock();
    const detail = await fetchSecEarningsDetail({ ...request, officialFiscalDate, ...mock, now, requestIntervalMs: 0 });
    assert.equal(detail.status, officialFiscalDate === '2026-09-03' ? 'partial' : 'unavailable');
    if (officialFiscalDate !== '2026-09-03') {
      assert.equal(detail.reason, 'official-period-mismatch');
      assert.equal(detail.sections.reportSegments.items.length, 0);
      assert.equal(coverageResultRow(detail, 'MU', now), null);
    }
  }
});

test('MU unparsed release never promotes the provider month-end to an official fiscal date', async () => {
  const mock = await sourceMock({ unparsed: true });
  const source = await fetchSecEarningsFilingSource({ ...request, ...mock, now, requestIntervalMs: 0, preferEarningsExhibit: true });
  assert.equal(source.officialFiscalDate, null);
  assert.equal(source.fiscalDate, request.fiscalDate);
  const detail = await fetchSecEarningsDetail({ ...request, ...mock, now, requestIntervalMs: 0 });
  assert.equal(detail.status, 'unavailable');
  assert.equal(detail.period.officialFiscalDate, null);
  assert.equal(detail.period.providerFiscalDate, request.providerFiscalDate);
  assert.ok(Object.values(detail.sections).every((section) => section.items.length === 0));
});

test('MU keeps bounded periodic-to-release fallback and does not blend annual data', async () => {
  const mock = await sourceMock({ periodic: true });
  const detail = await fetchSecEarningsDetail({ ...request, ...mock, now, requestIntervalMs: 0 });
  assert.equal(detail.status, 'partial', detail.reason);
  assert.equal(detail.source.accession, accession);
  assert.equal(detail.totalRevenue, 54_229_000_000);
  assert.ok(mock.calls.some((path) => path.endsWith('/annual.htm')));
  assert.ok(mock.calls.length <= 5);
});
