import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSharedEarningsDetail } from '../server/earnings/secEarningsSharedCache.js';

const VERSION = 'sec-structure-5';
const NOW = new Date('2026-09-09T01:00:00Z');
const REQUEST = { symbol: 'GOOGL', fiscalDate: '2026-06-30', reportDate: '2026-07-29' };

function row({ accession = '0001652044-26-000071', filedAt = '2026-07-30T20:00:00Z' } = {}) {
  const archive = `https://www.sec.gov/Archives/edgar/data/1652044/${accession.replaceAll('-', '')}`;
  return {
    symbol: 'GOOGL', cik: '0001652044', accession,
    parser_version: VERSION,
    checked_at: '2026-09-09T00:00:00Z', expires_at: '2026-09-09T06:00:00Z',
    payload: {
      schemaVersion: 4, parserVersion: VERSION, symbol: 'GOOGL', currency: 'USD', status: 'partial',
      fetchedAt: '2026-07-30T20:01:00Z',
      period: {
        start: '2026-04-01', end: '2026-06-30', fiscalDate: '2026-06-30',
        officialFiscalDate: '2026-06-30', providerFiscalDate: '2026-06-30',
        fiscalYear: '2026', fiscalPeriod: 'Q2', reportDate: '2026-07-28',
      },
      source: {
        provider: 'SEC', cik: '0001652044', accession, form: '10-Q', documentType: 'PRIMARY',
        parser: 'sec-company-primary', filedAt,
        filingUrl: `${archive}/${accession}-index.html`, primaryDocumentUrl: `${archive}/goog-20260630.htm`,
      },
      sections: {
        reportSegments: {
          status: 'complete', items: [
            { id: 'A', label: 'A', revenue: 60, previousRevenue: null, profit: 5, previousProfit: null },
            { id: 'B', label: 'B', revenue: 40, profit: null },
          ],
        },
        revenueBreakdown: { status: 'unavailable', reason: 'missing-axis-facts', items: [] },
        geographies: { status: 'unavailable', reason: 'quarterly-geography-not-disclosed', items: [] },
      },
    },
  };
}

function select(rows, options = {}) {
  return selectSharedEarningsDetail({ request: REQUEST, rows, now: NOW, parserVersion: VERSION, ...options });
}

test('shared hit clones the whole verified payload and retains database verification time', () => {
  const original = row();
  const before = structuredClone(original);
  const hit = select([original]);
  assert.ok(hit);
  assert.equal(hit.fetchedAt, '2026-09-09T00:00:00.000Z');
  assert.equal(hit.checkedAt, hit.fetchedAt);
  assert.equal(hit.period.reportDate, REQUEST.reportDate);
  assert.equal(hit.period.end, '2026-06-30');
  assert.equal(hit.cache.verifiedReportDate, '2026-07-28');
  assert.equal(hit.cache.status, 'fresh');
  assert.equal(hit.stale, false);
  assert.deepEqual(hit.source, original.payload.source);
  hit.sections.reportSegments.items[0].revenue = 999;
  assert.deepEqual(original, before);
});

test('symbols only normalize casing and provider suffix, never share classes or company aliases', () => {
  assert.ok(select([row()], { request: { ...REQUEST, symbol: 'googl.US' } }));
  assert.equal(select([row()], { request: { ...REQUEST, symbol: 'GOOG' } }), null);
  const different = row();
  different.payload.symbol = 'GOOG';
  assert.equal(select([different]), null);
  const classA = row();
  classA.symbol = classA.payload.symbol = 'BRK.A';
  assert.equal(select([classA], { request: { ...REQUEST, symbol: 'BRK.B' } }), null);
});

test('both persisted and payload parser versions must match the requested version', () => {
  for (const change of [
    (value) => { value.parser_version = 'old'; },
    (value) => { value.payload.parserVersion = 'old'; },
    (value) => { delete value.parser_version; },
    (value) => { delete value.payload.parserVersion; },
  ]) {
    const invalid = row(); change(invalid);
    assert.equal(select([invalid]), null);
  }
  assert.equal(select([row()], { parserVersion: undefined }), null);
});

test('explicit official fiscal date wins; provider-only ambiguity between official periods misses', () => {
  const otherPeriod = row({ accession: '0001652044-26-000072' });
  Object.assign(otherPeriod.payload.period, { end: '2026-06-27', fiscalDate: '2026-06-27', officialFiscalDate: '2026-06-27' });
  assert.equal(select([row(), otherPeriod]), null);
  const exact = select([row(), otherPeriod], { request: { ...REQUEST, officialFiscalDate: '2026-06-30' } });
  assert.equal(exact.period.officialFiscalDate, '2026-06-30');
  assert.equal(select([otherPeriod], { request: { ...REQUEST, officialFiscalDate: '2026-06-30' } }), null);
  const nextQuarter = row();
  Object.assign(nextQuarter.payload.period, { start: '2026-07-01', end: '2026-09-30', fiscalDate: '2026-09-30', officialFiscalDate: '2026-09-30' });
  assert.equal(select([nextQuarter]), null);
});

test('provider tolerance is bounded to 31 days and filing window is exactly minus 2 through plus 14 days', () => {
  const shifted = row({ filedAt: '2026-05-20T20:00:00Z' });
  Object.assign(shifted.payload.period, {
    start: '2026-02-01', end: '2026-04-30', fiscalDate: '2026-04-30',
    officialFiscalDate: '2026-04-30', reportDate: '2026-05-20', fiscalPeriod: 'Q1',
  });
  const request = { symbol: 'GOOGL', fiscalDate: '2026-05-31', reportDate: '2026-05-20' };
  const hit = select([shifted], { request });
  assert.ok(hit);
  assert.equal(hit.period.fiscalDate, '2026-04-30');
  assert.equal(hit.period.providerFiscalDate, '2026-05-31');
  assert.equal(select([shifted], { request: { ...request, fiscalDate: '2026-06-01' } }), null);
  for (const [filedAt, expected] of [
    ['2026-07-27T20:00:00Z', true], ['2026-08-12T20:00:00Z', true],
    ['2026-07-26T20:00:00Z', false], ['2026-08-13T20:00:00Z', false],
  ]) assert.equal(Boolean(select([row({ filedAt })])), expected);
});

test('latest public accession is chosen whole; newer failed filing blocks an older complete result', () => {
  const old = row();
  const latest = row({ accession: '0001652044-26-000072', filedAt: '2026-08-01T20:00:00Z' });
  latest.payload.sections.reportSegments.items[0].revenue = 61;
  latest.payload.sections.geographies = { status: 'complete', items: [{ id: 'USA', label: 'USA', revenue: 101 }] };
  assert.deepEqual(select([old, latest]).sections, latest.payload.sections);
  latest.payload.status = 'unavailable';
  latest.payload.sections = {};
  assert.equal(select([old, latest]), null);
  assert.equal(select([old, latest], { allowStale: true }), null);
});

test('equal-time accession conflicts and unknown intraday filing order fail closed', () => {
  assert.equal(select([row(), row({ accession: '0001652044-26-000072' })]), null);
  assert.equal(select([
    row({ filedAt: '2026-07-30' }),
    row({ accession: '0001652044-26-000072', filedAt: '2026-07-30T21:00:00Z' }),
  ]), null);
  const later = row({ accession: '0001652044-26-000072', filedAt: '2026-07-30T21:00:00Z' });
  assert.equal(select([row(), later]).source.accession, later.accession);
});

test('same filing uses newest verification but conflicting tied payloads are not arbitrarily picked', () => {
  const original = row();
  const changed = row();
  changed.payload.sections.reportSegments.items[0].revenue = 61;
  assert.equal(select([original, changed]), null);
  changed.checked_at = '2026-09-09T00:30:00Z';
  assert.equal(select([original, changed]).sections.reportSegments.items[0].revenue, 61);
  const reordered = row();
  reordered.payload.source = Object.fromEntries(Object.entries(reordered.payload.source).reverse());
  assert.ok(select([original, reordered]));
});

test('SEC source identity, accession and document archive path must agree', () => {
  for (const change of [
    (value) => { value.payload.source.provider = 'TSMC'; },
    (value) => { value.payload.source.primaryDocumentUrl = 'https://example.com/report.htm'; },
    (value) => { value.payload.source.primaryDocumentUrl += '?api_token=secret'; },
    (value) => { value.payload.source.primaryDocumentUrl = value.payload.source.primaryDocumentUrl.replace('/1652044/', '/1234/'); },
    (value) => { value.payload.source.cik = '1234'; },
    (value) => { value.payload.source.accession = 'invalid'; },
    (value) => { value.cik = '1234'; },
    (value) => { delete value.payload.source.primaryDocumentUrl; },
  ]) {
    const invalid = row(); change(invalid);
    assert.equal(select([invalid]), null);
  }
});

test('future, malformed and inconsistent verification times miss, using New York event dates', () => {
  for (const change of [
    (value) => { value.checked_at = '2026-09-09T02:00:00Z'; },
    (value) => { value.checked_at = '2026-09-09'; },
    (value) => { value.checked_at = '2026-02-30T00:00:00Z'; },
    (value) => { value.expires_at = value.checked_at; },
    (value) => { value.payload.source.filedAt = '2026-09-09T03:00:00Z'; },
    (value) => { value.payload.period.reportDate = '2026-09-09'; },
  ]) {
    const invalid = row(); change(invalid);
    assert.equal(select([invalid]), null);
  }
  assert.equal(select([row()], { request: { ...REQUEST, reportDate: '2026-09-09' } }), null);
  assert.equal(select([row()], { now: new Date('invalid') }), null);
});

test('stale allowance is explicit and cannot make expired or failed data fresh', () => {
  const expired = row();
  expired.expires_at = NOW.toISOString();
  assert.equal(select([expired]), null);
  const retained = select([expired], { allowStale: true });
  assert.equal(retained.cache.status, 'stale');
  assert.equal(retained.stale, true);
  assert.equal(retained.checkedAt, '2026-09-09T00:00:00.000Z');
  expired.payload.status = 'pending';
  assert.equal(select([expired], { allowStale: true }), null);
});

test('annual and cumulative facts never become quarterly cache hits', () => {
  for (const change of [
    (value) => { value.payload.period.start = '2026-01-01'; },
    (value) => { value.payload.period.fiscalPeriod = 'FY'; },
    (value) => { value.payload.source.form = '10-K'; },
    (value) => { value.payload.source.fiscalPeriod = 'Q1'; },
  ]) {
    const invalid = row(); change(invalid);
    assert.equal(select([invalid]), null);
  }
  const explicitQ4 = row();
  explicitQ4.payload.source.form = '10-K';
  explicitQ4.payload.period.fiscalPeriod = 'Q4';
  assert.ok(select([explicitQ4]));
  const dedicated = row();
  delete dedicated.payload.period.fiscalPeriod;
  assert.ok(select([dedicated]));
});

test('missing metrics remain missing and never turn into zero', () => {
  const hit = select([row()]);
  assert.equal(hit.sections.reportSegments.items[0].previousRevenue, null);
  assert.equal(Object.hasOwn(hit.sections.reportSegments.items[1], 'previousRevenue'), false);
  assert.equal(hit.sections.reportSegments.items[1].profit, null);
  const empty = row();
  empty.payload.sections.reportSegments.items = [{ id: 'A', label: 'A', revenue: null }];
  assert.equal(select([empty]), null);
  empty.payload.sections.reportSegments.items[0].revenue = 0;
  assert.ok(select([empty]));
});
