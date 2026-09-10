import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchSecEarningsDetail } from '../server/earnings/secEarningsDetail.js';
import { normalizeEarningsDetailPayload, earningsDetailStructureRevenueTotal } from '../src/lib/earningsDetail.js';
import { EARNINGS_DETAIL_PARSER_VERSION } from '../src/lib/earningsDetailPolicy.js';
import { coverageResultRow } from '../server/earnings/secEarningsAutoCoverage.js';
import { selectSharedEarningsDetail } from '../server/earnings/secEarningsSharedCache.js';

const now = new Date('2026-09-10T08:00:00Z');
const companies = [
  { symbol: 'LLY', cik: '0000059478', accession: '0000059478-26-000081', form: '10-Q',
    fiscalDate: '2026-06-30', reportDate: '2026-08-05', end: '2026-06-30', start: '2026-04-01',
    year: '2026', quarter: 'Q2', documentType: 'PRIMARY', file: 'lly-20260630.htm',
    fixture: 'sec-lilly-business/lly-20260630.htm', counts: [0, 11, 5], total: 22_974_000_000 },
  { symbol: 'HOOD', cik: '0001783879', accession: '0001783879-26-000114', form: '10-Q',
    fiscalDate: '2026-06-30', reportDate: '2026-07-30', end: '2026-06-30', start: '2026-04-01',
    year: '2026', quarter: 'Q2', documentType: 'PRIMARY', file: 'hood-20260630.htm',
    fixture: 'sec-robinhood/hood-20260630-excerpt.htm', counts: [0, 3, 0], total: 1_308_000_000 },
  { symbol: 'AVGO', cik: '0001730168', accession: '0001730168-26-000076', form: '8-K',
    fiscalDate: '2026-07-31', reportDate: '2026-09-02', end: '2026-08-02', start: '2026-05-04',
    year: '2026', quarter: 'Q3', documentType: 'EX-99.1', file: 'avgo-08022026x8kxex99.htm',
    fixture: 'sec-release-business/avgo-fy2026-q3-ex99.1.html', counts: [2, 0, 0], total: 29_591_000_000 },
  { symbol: 'ARM', cik: '0001973239', accession: '0001973239-26-000113', form: '6-K',
    fiscalDate: '2026-06-30', reportDate: '2026-07-29', end: '2026-06-30', start: '2026-04-01',
    year: '2027', quarter: 'Q1', documentType: 'EX-99.2', file: 'exhibit992fye27q130-junx26.htm',
    fixture: 'sec-release-business/arm-fy2027-q1-ex99.2.html', counts: [0, 2, 0], total: 1_289_000_000 },
];
const sectionKeys = ['reportSegments', 'revenueBreakdown', 'geographies'];
const response = (body) => ({ ok: true, status: 200, headers: { get: () => null },
  text: async () => typeof body === 'string' ? body : JSON.stringify(body), json: async () => body });
function request(company) {
  return { symbol: company.symbol, fiscalDate: company.fiscalDate, reportDate: company.reportDate };
}
async function mockSource(company, transformRecent = (recent) => recent) {
  const html = await readFile(new URL(`./fixtures/${company.fixture}`, import.meta.url), 'utf8');
  const archive = `/Archives/edgar/data/${Number(company.cik)}/${company.accession.replaceAll('-', '')}`;
  const calls = [];
  const fetchFn = async (url) => {
    const parsed = new URL(url);
    assert.ok(['www.sec.gov', 'data.sec.gov'].includes(parsed.hostname));
    calls.push(parsed.pathname);
    if (parsed.pathname.endsWith('/company_tickers.json')) return response({ 0: { cik_str: Number(company.cik), ticker: company.symbol, title: company.symbol } });
    if (parsed.pathname.startsWith('/submissions/')) {
      const recent = {
      accessionNumber: [company.accession], form: [company.form], filingDate: [company.reportDate],
      acceptanceDateTime: [`${company.reportDate}T20:02:28Z`],
      reportDate: [company.documentType === 'PRIMARY' ? company.end : company.reportDate],
      primaryDocument: [company.documentType === 'PRIMARY' ? company.file : 'cover.htm'],
      primaryDocDescription: ['Quarterly earnings financial results'], items: [company.form === '8-K' ? '2.02,9.01' : ''],
      };
      // The real ARM index also has a same-day, quarter-end 6-K. It is not the
      // shareholder-letter accession and must not win solely on fiscalDate.
      if (company.symbol === 'ARM') {
        for (const [key, value] of Object.entries({ accessionNumber: '0001973239-26-000114', form: '6-K',
          filingDate: company.reportDate, acceptanceDateTime: `${company.reportDate}T20:03:00Z`,
          reportDate: company.end, primaryDocument: 'arm-20260630.htm', primaryDocDescription: '6-K', items: '' })) recent[key].unshift(value);
        recent.primaryDocDescription[1] = '6-K';
      }
      return response({ cik: company.cik, tickers: [company.symbol], filings: { recent: transformRecent(recent) } });
    }
    if (parsed.pathname.endsWith('-index.html')) return response(`<table>
      ${company.documentType === 'EX-99.2' ? `<tr><td>EX-99.1</td><td><a href="${archive}/announcement.htm">Announcement only</a></td></tr>` : ''}
      <tr><td>${company.documentType}</td><td><a href="${archive}/${company.file}">Quarterly financial results</a></td></tr></table>`);
    if (parsed.pathname === `${archive}/${company.file}`) return response(html);
    if (parsed.pathname === `${archive}/cover.htm`) return response('<html>Cover, no financial statements.</html>');
    assert.fail(`Unexpected SEC path ${parsed.pathname}`);
  };
  return { calls, fetchFn };
}
function cacheRow(company, stored, version = EARNINGS_DETAIL_PARSER_VERSION) {
  return { ...stored, symbol: company.symbol, parser_version: version,
    checked_at: now.toISOString(), expires_at: new Date(now.getTime() + 300_000).toISOString() };
}

for (const company of companies) {
  test(`${company.symbol}: real official document survives source selection, normalization and shared-cache validation`, async () => {
    const mock = await mockSource(company);
    const detail = await fetchSecEarningsDetail({ ...request(company), ...mock, now, requestIntervalMs: 0 });
    assert.equal(detail.status, 'partial', detail.reason);
    assert.equal(detail.totalRevenue, company.total);
    assert.equal(detail.parserVersion, EARNINGS_DETAIL_PARSER_VERSION);
    assert.deepEqual(sectionKeys.map((key) => detail.sections[key].items.length), company.counts);
    assert.equal(detail.period.start, company.start);
    assert.equal(detail.period.end, company.end);
    assert.equal(detail.period.providerFiscalDate, company.fiscalDate);
    assert.equal(detail.period.officialFiscalDate, company.end);
    assert.equal(detail.period.fiscalYear, company.year);
    assert.equal(detail.period.fiscalPeriod, company.quarter);
    assert.equal(detail.source.documentType, company.documentType);
    assert.equal(detail.source.accession, company.accession);
    assert.ok(detail.source.primaryDocumentUrl.endsWith(company.file));
    assert.ok(mock.calls.length <= (company.documentType === 'PRIMARY' ? 3 : 4));
    assert.ok(!mock.calls.some((path) => path.endsWith('/announcement.htm') || path.endsWith('/cover.htm')));
    const normalized = normalizeEarningsDetailPayload({ ...detail, success: true });
    assert.equal(earningsDetailStructureRevenueTotal(normalized, { revenueActualUsd: 999 }), company.total);
    for (const key of sectionKeys) {
      const section = normalized.sections[key];
      if (!company.counts[sectionKeys.indexOf(key)]) continue;
      assert.equal(section.status, 'complete');
      assert.equal(section.items.reduce((sum, item) => sum + item.revenue, 0), company.total);
      assert.equal(section.metricStatus.revenue.status, 'complete');
      assert.ok(detail.sections[key].items.every((item) => item.profit === null && item.previousProfit === null));
      if (key === 'reportSegments') assert.ok(section.items.every((item) => item.profit === null && item.previousProfit === null));
    }
    assert.equal(normalized.summaryActuals, null, 'do not override GAAP/non-GAAP EPS');
    const stored = coverageResultRow(detail, company.symbol, now);
    assert.ok(stored, 'real parsed result must meet the existing storage contract');
    assert.equal(stored.document_type, company.documentType);
    assert.equal(stored.official_fiscal_date, company.end);
    const hit = selectSharedEarningsDetail({ request: request(company), rows: [cacheRow(company, stored)], now,
      parserVersion: EARNINGS_DETAIL_PARSER_VERSION });
    assert.ok(hit);
    assert.equal(hit.totalRevenue, company.total);
    assert.deepEqual(hit.sections, detail.sections);
    assert.equal(selectSharedEarningsDetail({ request: request(company), rows: [cacheRow(company, stored, 'sec-structure-5')], now,
      parserVersion: EARNINGS_DETAIL_PARSER_VERSION }), null);
    const wrongSource = structuredClone(stored);
    wrongSource.payload.source.primaryDocumentUrl = wrongSource.payload.source.primaryDocumentUrl.replace(company.accession.replaceAll('-', ''), '000000000026000001');
    assert.equal(selectSharedEarningsDetail({ request: request(company), rows: [cacheRow(company, wrongSource)], now,
      parserVersion: EARNINGS_DETAIL_PARSER_VERSION }), null);
  });
}

test('AVGO provider month-end tolerance never overrides an explicitly supplied official date', async () => {
  const company = companies.find((item) => item.symbol === 'AVGO');
  for (const officialFiscalDate of ['2026-07-31', company.end]) {
    const mock = await mockSource(company);
    const detail = await fetchSecEarningsDetail({ ...request(company), officialFiscalDate, ...mock, now, requestIntervalMs: 0 });
    assert.equal(detail.status, officialFiscalDate === company.end ? 'partial' : 'unavailable');
    if (officialFiscalDate !== company.end) {
      assert.equal(detail.reason, 'official-period-mismatch');
      assert.equal(coverageResultRow(detail, company.symbol, now), null);
    }
  }
});

test('ARM ambiguous same-day releases do not select an arbitrary shareholder letter', async () => {
  const company = companies.find((item) => item.symbol === 'ARM');
  const mock = await mockSource(company, (recent) => {
    for (const [key, values] of Object.entries(recent)) values.push(key === 'accessionNumber' ? '0001973239-26-000115' : values[1]);
    return recent;
  });
  const detail = await fetchSecEarningsDetail({ ...request(company), ...mock, now, requestIntervalMs: 0 });
  assert.equal(detail.status, 'pending');
  assert.equal(detail.reason, 'official-filing-not-found');
  assert.equal(coverageResultRow(detail, company.symbol, now), null);
  assert.ok(mock.calls.every((path) => !path.startsWith('/Archives/')));
});

test('ARM announcement-date discovery is not proof of an unrelated fiscal quarter', async () => {
  const company = companies.find((item) => item.symbol === 'ARM');
  const mock = await mockSource(company);
  const detail = await fetchSecEarningsDetail({ ...request(company), fiscalDate: '2026-03-31', ...mock, now, requestIntervalMs: 0 });
  assert.equal(detail.status, 'unavailable');
  assert.equal(detail.reason, 'release-period-mismatch');
  assert.equal(coverageResultRow(detail, company.symbol, now), null);
  assert.ok(mock.calls.length <= 5);
});
