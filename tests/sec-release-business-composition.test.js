import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectReleaseBusinessComposition } from '../server/earnings/secReleaseBusinessComposition.js';
import { normalizeEarningsDetailPayload } from '../src/lib/earningsDetail.js';

const directory = new URL('./fixtures/sec-release-business/', import.meta.url);
const examples = {
  AVGO: {
    symbol: 'AVGO', fiscalDate: '2026-07-31',
    filing: { cik: '0001730168', accession: '0001730168-26-000076', form: '8-K', documentType: 'EX-99.1' },
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1730168/000173016826000076/avgo-08022026x8kxex99.htm',
    html: fs.readFileSync(new URL('avgo-fy2026-q3-ex99.1.html', directory), 'utf8'),
  },
  ARM: {
    symbol: 'ARM', fiscalDate: '2026-06-30',
    filing: { cik: '0001973239', accession: '0001973239-26-000113', form: '6-K', documentType: 'EX-99.2' },
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1973239/000197323926000113/exhibit992fye27q130-junx26.htm',
    html: fs.readFileSync(new URL('arm-fy2027-q1-ex99.2.html', directory), 'utf8'),
  },
};
const run = (symbol, overrides = {}) => inspectReleaseBusinessComposition({ ...examples[symbol], ...overrides });
function alterTable(symbol, predicate, transform) {
  let matched = 0;
  const html = examples[symbol].html.replace(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi, (table) => {
    if (!predicate(table)) return table;
    matched += 1;
    return transform(table);
  });
  assert.equal(matched, 1, 'test mutation must target exactly one real table');
  return html;
}
const avgoSegments = (table) => table.includes('Net revenue by segment');
const armOverview = (table) => table.includes('License and other revenue');
function replaceDate(html, from, to) {
  const pattern = new RegExp(from.replace(', ', ',(?:\\s|<br\\s*\\/?>)+'), 'g');
  assert.ok(pattern.test(html), `date mutation did not find ${from}`);
  return html.replace(pattern, to);
}

test('real AVGO Q3 release preserves official 13-week dates and two reconciled report segments', () => {
  const { result, reason } = run('AVGO');
  assert.equal(reason, null);
  assert.equal(result.status, 'partial');
  assert.equal(result.totalRevenue, 29_591_000_000);
  assert.equal(result.previousTotalRevenue, 15_952_000_000);
  assert.deepEqual(result.period, { start: '2026-05-04', end: '2026-08-02', fiscalYear: '2026', fiscalPeriod: 'Q3' });
  assert.deepEqual(result.sections.reportSegments.items.map((item) => [item.id, item.revenue, item.previousRevenue]), [
    ['semiconductor-solutions', 20_839_000_000, 9_166_000_000],
    ['infrastructure-software', 8_752_000_000, 6_786_000_000],
  ]);
  assert.equal(result.sections.revenueBreakdown.status, 'unavailable');
  assert.equal(result.sections.geographies.status, 'unavailable');
  assert.equal(run('AVGO', { fiscalDate: '2026-08-02' }).result.period.end, '2026-08-02');
});

test('real ARM Q1 shareholder letter parses the two revenue streams, not invented operating segments', () => {
  const { result, reason } = run('ARM');
  assert.equal(reason, null);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.period, { start: '2026-04-01', end: '2026-06-30', fiscalYear: '2027', fiscalPeriod: 'Q1' });
  assert.equal(result.totalRevenue, 1_289_000_000);
  assert.equal(result.previousTotalRevenue, 1_053_000_000);
  assert.deepEqual(result.sections.revenueBreakdown.items.map((item) => [item.id, item.revenue, item.previousRevenue]), [
    ['royalty', 715_000_000, 585_000_000],
    ['license-and-other', 574_000_000, 468_000_000],
  ]);
  assert.equal(result.sections.reportSegments.status, 'unavailable');
  assert.equal(result.sections.geographies.status, 'unavailable');
  assert.equal(result.sourceMetadata.documentType, 'EX-99.2');
});

test('verified release output never supplies EPS summary overrides or invented segment profits', () => {
  for (const symbol of Object.keys(examples)) {
    const { result } = run(symbol);
    assert.equal(result.currency, 'USD');
    assert.equal(result.sourceMetadata.evidence, 'official-release-quarter-tables-reconciled');
    assert.equal(result.sourceMetadata.reportingCurrencyBasis, 'verified-issuer-usd-profile');
    assert.equal(result.summaryActuals, undefined);
    for (const section of Object.values(result.sections)) for (const item of section.items) {
      assert.equal(item.profit, null);
      assert.equal(item.previousProfit, null);
    }
  }
});

test('release metric availability survives the production client normalizer without becoming pending', () => {
  for (const symbol of Object.keys(examples)) {
    const { result } = run(symbol);
    const normalized = normalizeEarningsDetailPayload({ success: true, symbol, ...result });
    const sectionKey = symbol === 'AVGO' ? 'reportSegments' : 'revenueBreakdown';
    const section = normalized.sections[sectionKey];
    assert.equal(section.status, 'complete');
    assert.equal(section.metricStatus.revenue.status, 'complete');
    assert.equal(section.metricStatus.previousRevenue.status, 'complete');
    assert.equal(section.metricStatus.profit.status, 'unavailable');
    assert.equal(section.metricStatus.profit.reason, 'quarterly-segment-profit-not-disclosed');
    assert.equal(section.metricStatus.previousProfit.status, 'unavailable');
    assert.equal(normalized.summaryActuals, null);
  }
});

test('issuer profile does not substitute for document, CIK, source URL or filing identity', () => {
  for (const symbol of Object.keys(examples)) {
    const example = examples[symbol];
    for (const overrides of [
      { symbol: 'AAPL' },
      { filing: { ...example.filing, cik: '0000000001' } },
      { filing: { ...example.filing, accession: 'malformed' } },
      { filing: { ...example.filing, form: '10-K' } },
      { filing: { ...example.filing, documentType: symbol === 'ARM' ? 'EX-99.1' : 'EX-99.2' } },
      { sourceUrl: example.sourceUrl.replace('/data/', '/other/') },
      { sourceUrl: example.sourceUrl.replace('www.sec.gov', 'www.sec.gov.evil.test') },
      { sourceUrl: example.sourceUrl.replace('https://', 'https://user:secret@') },
      { sourceUrl: example.sourceUrl + '?redirect=other' },
      { sourceUrl: undefined },
      { html: examples[symbol === 'AVGO' ? 'ARM' : 'AVGO'].html },
      { html: example.html.replace(symbol === 'AVGO' ? /Broadcom Inc\./gi : /Arm Holdings plc/gi, 'Other Corporation') },
    ]) assert.equal(run(symbol, overrides).result, null, `${symbol}: ${JSON.stringify(Object.keys(overrides))}`);
  }
});

test('provider month-end can be nearby but an unrelated or invalid quarter is rejected', () => {
  for (const symbol of Object.keys(examples)) {
    for (const fiscalDate of ['', '2026-02-30', '2026-01-31', '2026-12-31']) {
      assert.equal(run(symbol, { fiscalDate }).reason, 'release-period-mismatch');
    }
  }
});

test('unit changes, missing dollar marker and explicit non-USD currencies fail closed', () => {
  for (const symbol of Object.keys(examples)) {
    const target = symbol === 'AVGO' ? avgoSegments : armOverview;
    for (const currency of ['GBP', 'EUR', 'CNY', 'HKD', 'CAD', 'AUD', 'NZD', 'SGD', 'TWD', 'JPY', 'CHF', 'INR']) {
      const html = alterTable(symbol, target, (table) => table.replace(/in millions/i, `in millions ${currency}`));
      assert.equal(run(symbol, { html }).reason, 'release-unit-mismatch', `${symbol}/${currency}`);
    }
    assert.equal(run(symbol, { html: alterTable(symbol, target, (table) => table.replace(/in millions/gi, 'in thousands')) }).reason, 'release-unit-mismatch');
    assert.equal(run(symbol, { html: alterTable(symbol, target, (table) => table.replaceAll('$', '')) }).reason, 'release-unit-mismatch');
  }
});

test('AVGO rejects mislabeled annual/cumulative tables and swapped quarter/year headings', () => {
  for (const transform of [
    (table) => table.replace(/Q3 26/g, 'FY 26'),
    (table) => table.replace(/Q3 26/g, 'Q2 26'),
    (table) => table.replace(/Q3 26/g, 'Nine Months Q3 26'),
  ]) assert.equal(run('AVGO', { html: alterTable('AVGO', avgoSegments, transform) }).result, null);
  assert.equal(run('AVGO', { html: examples.AVGO.html.replace(/Fiscal Quarter Ended/g, 'Fiscal Year Ended') }).result, null);
  assert.equal(run('AVGO', { html: examples.AVGO.html.replace('Third Quarter Fiscal Year 2026 Financial Results', 'Full Year Fiscal Year 2026 Financial Results') }).result, null);
  const wrongYear = examples.AVGO.html.replace(/fiscal year 2026/gi, 'fiscal year 2027')
    .replace(/Q3 26/g, 'Q3 27').replace(/Q3 25/g, 'Q3 26');
  assert.equal(run('AVGO', { html: wrongYear }).reason, 'release-period-mismatch');
});

test('ARM requires explicit three-month dates and matching FYE quarter headings', () => {
  for (const html of [
    examples.ARM.html.replace(/three months ended/gi, 'Nine Months Ended'),
    examples.ARM.html.replace(/three months ended/gi, 'Year Ended'),
    examples.ARM.html.replace(/Q1 FYE27/g, 'Q2 FYE27'),
    examples.ARM.html.replace(/June 30/g, 'June 29'),
  ]) assert.equal(run('ARM', { html }).result, null);
});

test('AVGO derives its start from a contiguous prior quarter, never a calendar-month guess', () => {
  for (const previousQuarter of ['May 4, 2026', 'May 2, 2026', 'February 1, 2026', 'August 3, 2026']) {
    assert.equal(run('AVGO', { html: replaceDate(examples.AVGO.html, 'May 3, 2026', previousQuarter) }).result, null);
  }
  const changedPriorYear = run('AVGO', { html: replaceDate(examples.AVGO.html, 'August 3, 2025', 'August 4, 2025') }).result;
  assert.ok(changedPriorYear);
  assert.equal(changedPriorYear.previousTotalRevenue, null);
});

test('current revenue must reconcile and match the independent GAAP statement total', () => {
  for (const symbol of Object.keys(examples)) {
    const target = symbol === 'AVGO' ? avgoSegments : armOverview;
    const values = symbol === 'AVGO' ? ['20,839', '29,591'] : ['715', '1,289'];
    for (const value of values) {
      const html = alterTable(symbol, target, (table) => table.replace(value, '999,999'));
      assert.equal(run(symbol, { html }).result, null, `${symbol}/${value}`);
    }
  }
});

test('missing, conflicting or unbalanced prior facts disable comparatives without hiding verified current revenue', () => {
  for (const symbol of Object.keys(examples)) {
    const target = symbol === 'AVGO' ? avgoSegments : armOverview;
    const values = symbol === 'AVGO' ? ['9,166', '15,952'] : ['585', '1,053'];
    const key = symbol === 'AVGO' ? 'reportSegments' : 'revenueBreakdown';
    for (const value of values) for (const replacement of ['—', '', '(715)', '999,999']) {
      const html = alterTable(symbol, target, (table) => table.replace(value, replacement));
      const { result, reason } = run(symbol, { html });
      assert.equal(reason, null, `${symbol}/${value}/${replacement}`);
      assert.ok(result);
      assert.equal(result.totalRevenue, symbol === 'AVGO' ? 29_591_000_000 : 1_289_000_000);
      assert.equal(result.previousTotalRevenue, null);
      assert.ok(result.sections[key].items.every((item) => item.previousRevenue === null));
      const normalized = normalizeEarningsDetailPayload({ success: true, symbol, ...result });
      assert.equal(normalized.sections[key].metricStatus.revenue.status, 'complete');
      assert.equal(normalized.sections[key].metricStatus.previousRevenue.status, 'unavailable');
      assert.ok(normalized.sections[key].items.every((item) => item.previousRevenue === null));
    }
  }
});

test('unverified prior-year headings do not invalidate the independently matched current quarter', () => {
  for (const [symbol, source, replacement] of [['AVGO', 'Q3 25', 'Q3 24'], ['ARM', 'Q1 FYE26', 'Q1 FYE25']]) {
    const { result } = run(symbol, { html: examples[symbol].html.replaceAll(source, replacement) });
    assert.ok(result);
    assert.equal(result.previousTotalRevenue, null);
    const section = result.sections[symbol === 'AVGO' ? 'reportSegments' : 'revenueBreakdown'];
    assert.equal(section.status, 'complete');
    assert.equal(section.metricStatus.previousRevenue.status, 'unavailable');
  }
});

test('duplicate tables or duplicate financial rows are ambiguous even if values are identical', () => {
  for (const symbol of Object.keys(examples)) {
    const target = symbol === 'AVGO' ? avgoSegments : armOverview;
    assert.equal(run(symbol, { html: alterTable(symbol, target, (table) => table + table) }).reason, 'release-table-ambiguous');
    const rowLabel = symbol === 'AVGO' ? 'Semiconductor solutions' : 'Royalty revenue';
    const html = alterTable(symbol, target, (table) => table.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (row) => row.includes(rowLabel) ? row + row : row));
    assert.equal(run(symbol, { html }).reason, 'release-row-missing-or-ambiguous');
  }
});

test('GAAP/non-GAAP header swaps cannot silently select the alternative basis', () => {
  for (const symbol of Object.keys(examples)) {
    const target = symbol === 'AVGO' ? (table) => table.includes('Earnings per common share - diluted') : armOverview;
    const html = alterTable(symbol, target, (table) => table.replace(/>GAAP</g, '>Non-GAAP<'));
    assert.equal(run(symbol, { html }).reason, 'release-quarter-columns-invalid');
  }
});

test('malformed dimensions, negative amounts, missing values and huge values never become zero', () => {
  for (const symbol of Object.keys(examples)) {
    const target = symbol === 'AVGO' ? avgoSegments : armOverview;
    const value = symbol === 'AVGO' ? '20,839' : '715';
    for (const replacement of ['(715)', '—', '', '999999999999999999999999999999']) {
      assert.equal(run(symbol, { html: alterTable(symbol, target, (table) => table.replace(value, replacement)) }).result, null);
    }
    assert.equal(run(symbol, { html: alterTable(symbol, target, (table) => table.replace('colspan="3"', 'colspan="999999"')) }).reason, 'release-table-invalid');
  }
});

test('synthetic neighboring AVGO quarter verifies dynamic period logic without pinned 2026-Q3 values', () => {
  // A mutation of the real fixture, not a claim about a second real report.
  let html = replaceDate(examples.AVGO.html, 'August 2, 2026', '__CURRENT__');
  html = replaceDate(html, 'May 3, 2026', 'February 1, 2026');
  html = replaceDate(html, 'August 3, 2025', 'May 4, 2025')
    .replaceAll('__CURRENT__', 'May 3, 2026')
    .replace(/Third/g, 'Second').replace(/third/g, 'second').replace(/Q3 /g, 'Q2 ');
  const { result } = run('AVGO', { html, fiscalDate: '2026-04-30' });
  assert.ok(result);
  assert.deepEqual(result.period, { start: '2026-02-02', end: '2026-05-03', fiscalYear: '2026', fiscalPeriod: 'Q2' });
});

test('synthetic later ARM quarter verifies dynamic fiscal-year labeling and exact calendar-quarter dates', () => {
  const html = examples.ARM.html.replaceAll('June 30', 'September 30').replaceAll('Q1 FYE', 'Q2 FYE');
  const { result } = run('ARM', { html, fiscalDate: '2026-09-30' });
  assert.ok(result);
  assert.deepEqual(result.period, { start: '2026-07-01', end: '2026-09-30', fiscalYear: '2027', fiscalPeriod: 'Q2' });
});
