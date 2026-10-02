import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectMicronBusinessComposition } from '../server/earnings/secMicronBusinessComposition.js';

const directory = new URL('./fixtures/sec-micron-business/', import.meta.url);
const examples = Object.fromEntries([[4, '000018', '2026-08-31'], [3, '000013', '2026-05-31']].map(([quarter, sequence, fiscalDate]) => [quarter, {
  symbol: 'MU', fiscalDate,
  filing: { cik: '0000723125', accession: `0000723125-26-${sequence}`, form: '8-K', documentType: 'EX-99.1' },
  sourceUrl: `https://www.sec.gov/Archives/edgar/data/723125/000072312526${sequence}/a2026q${quarter}ex991-pressrelease.htm`,
  html: fs.readFileSync(new URL(`mu-fy2026-q${quarter}-ex99.1.html`, directory), 'utf8'),
}]));
const run = (quarter = 4, overrides = {}) => inspectMicronBusinessComposition({ ...examples[quarter], ...overrides });
const businessTable = table => table.includes('Quarterly Business Unit Financial Results');
const summaryTable = table => table.includes('Quarterly Financial Results');
const operationsTable = table => table.includes('Cost of goods sold') && table.includes('Earnings per share');
function alterTable(predicate, transform, quarter = 4) {
  let matched = 0;
  const html = examples[quarter].html.replace(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi, table => {
    if (!predicate(table)) return table;
    matched += 1;
    return transform(table);
  });
  assert.equal(matched, 1, 'mutation must target exactly one official table');
  return html;
}
function replaceOnce(source, from, to) {
  assert.ok(source.includes(from), `mutation did not find ${from}`);
  return source.replace(from, to);
}
function alterFirstRevenueRow(table, transform) {
  let changed = false;
  const result = table.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, row => {
    if (changed || !/>Revenue\s*</.test(row)) return row;
    changed = true;
    return transform(row);
  });
  assert.ok(changed);
  return result;
}
function replaceDate(html, from, to) {
  const expression = new RegExp(from.replace(', ', ',(?:\\s|<br\\s*\\/?>)+'), 'g');
  assert.ok(expression.test(html));
  return html.replace(expression, to);
}

test('real FY2026 Q4 reads four disclosed units and the official 14-week quarter, preserving differences', () => {
  const { result, reason } = run();
  assert.equal(reason, null);
  assert.deepEqual(result.period, { start: '2026-05-29', end: '2026-09-03', fiscalYear: '2026', fiscalPeriod: 'Q4' });
  assert.equal(result.totalRevenue, 54_229_000_000);
  assert.equal(result.previousTotalRevenue, 11_315_000_000);
  const section = result.sections.reportSegments;
  assert.equal(section.status, 'partial');
  assert.equal(section.reason, 'reported-segment-total-mismatch');
  assert.deepEqual(section.items.map(item => [item.id, item.revenue, item.previousRevenue]), [
    ['cloud-memory', 16_283_000_000, 4_543_000_000],
    ['core-data-center', 18_002_000_000, 1_577_000_000],
    ['mobile-and-client', 13_114_000_000, 3_760_000_000],
    ['automotive-and-embedded', 6_824_000_000, 1_434_000_000],
  ]);
  assert.deepEqual(section.revenueReconciliation, { status: 'mismatch', totalRevenue: 54_229_000_000,
    reportedRevenueTotal: 54_223_000_000, difference: 6_000_000, previousTotalRevenue: 11_315_000_000,
    previousReportedRevenueTotal: 11_314_000_000, previousDifference: 1_000_000, currency: 'USD' });
  assert.equal(section.metricStatus.revenue.status, 'complete');
  assert.equal(section.metricStatus.previousRevenue.status, 'complete');
  assert.equal(run(4, { fiscalDate: '2026-09-03' }).result.period.end, '2026-09-03');
});

test('real earlier Q3 resolves different columns, dates and amounts without a Q4-specific fallback', () => {
  const { result, reason } = run(3);
  assert.equal(reason, null);
  assert.deepEqual(result.period, { start: '2026-02-27', end: '2026-05-28', fiscalYear: '2026', fiscalPeriod: 'Q3' });
  assert.equal(result.totalRevenue, 41_456_000_000);
  assert.equal(result.previousTotalRevenue, 9_301_000_000);
  assert.deepEqual(result.sections.reportSegments.items.map(item => [item.revenue, item.previousRevenue]), [
    [13_769_000_000, 3_386_000_000], [11_524_000_000, 1_530_000_000],
    [11_521_000_000, 3_255_000_000], [4_634_000_000, 1_127_000_000],
  ]);
  assert.equal(result.sections.reportSegments.revenueReconciliation.difference, 8_000_000);
  assert.equal(result.sections.reportSegments.revenueReconciliation.previousDifference, 3_000_000);
});

test('only disclosed revenues are emitted; percentages never become profit, products or geographies', () => {
  for (const quarter of [3, 4]) {
    const { result } = run(quarter);
    assert.equal(result.sourceMetadata.adapterId, 'sec-release-mu-v1');
    assert.equal(result.sourceMetadata.evidence, 'official-release-quarter-tables');
    assert.equal(result.sourceMetadata.officialFiscalDate, result.period.end);
    assert.equal(result.sections.reportSegments.items.length, 4);
    assert.ok(result.sections.reportSegments.items.every(item => item.profit === null && item.previousProfit === null));
    assert.equal(result.sections.reportSegments.metricStatus.profit.status, 'unavailable');
    assert.equal(result.sections.reportSegments.metricStatus.previousProfit.status, 'unavailable');
    assert.deepEqual(result.sections.revenueBreakdown.items, []);
    assert.deepEqual(result.sections.geographies.items, []);
    assert.equal(result.summaryActuals, undefined);
  }
  const altered = alterTable(businessTable, table => table.replaceAll('>83<', '>999999<').replaceAll('Operating margin', 'Undisclosed operating margin'));
  assert.deepEqual(run(4, { html: altered }).result.sections.reportSegments.items, run().result.sections.reportSegments.items);
});

test('identity, source origin/path, accession, form, exhibit and announcement must all agree', () => {
  const example = examples[4];
  for (const patch of [
    { symbol: 'NVDA' }, { filing: { ...example.filing, cik: '0000000001' } },
    { filing: { ...example.filing, accession: '0000723125-26-000099' } },
    { filing: { ...example.filing, accession: 'invalid' } },
    { filing: { ...example.filing, form: '10-K' } }, { filing: { ...example.filing, documentType: 'PRIMARY' } },
    { sourceUrl: example.sourceUrl.replace('www.sec.gov', 'sec.gov.invalid') },
    { sourceUrl: example.sourceUrl.replace('/723125/', '/1045810/') },
    { sourceUrl: example.sourceUrl.replace('https:', 'http:') },
    { sourceUrl: `${example.sourceUrl}?x=1` }, { sourceUrl: `${example.sourceUrl}#x` }, { sourceUrl: undefined },
    { html: example.html.replaceAll('Micron Technology, Inc.', 'Other Corporation') },
    { html: example.html.replaceAll('Nasdaq&#58; MU', 'Nasdaq&#58; OTHER') },
    { html: example.html.replaceAll('Exhibit 99.1', 'Exhibit 99.2') },
    { html: '' },
  ]) {
    if (patch.html) assert.notEqual(patch.html, example.html, 'identity mutation must change the fixture');
    assert.equal(run(4, patch).result, null, JSON.stringify(Object.keys(patch)));
  }
  assert.ok(run(4, { symbol: 'MU.US', filing: { ...example.filing, cik: '723125' } }).result);
});

test('each independently identified money table rejects unknown scale or currency', () => {
  for (const target of [businessTable, summaryTable, operationsTable]) {
    for (const currency of ['EUR', 'GBP', 'CNY', 'CAD', 'JPY', 'HKD']) {
      const html = alterTable(target, table => table.replace('<tr>', `<tr><td>in millions ${currency}</td></tr><tr>`));
      assert.equal(run(4, { html }).reason, 'micron-unit-mismatch', currency);
    }
    for (const unit of ['thousands', 'billions']) {
      const html = alterTable(target, table => table.replace('<tr>', `<tr><td>in ${unit}</td></tr><tr>`));
      assert.equal(run(4, { html }).reason, 'micron-unit-mismatch');
    }
    assert.equal(run(4, { html: alterTable(target, table => table.replaceAll('$', '')) }).reason, 'micron-unit-mismatch');
  }
  assert.equal(run(4, { html: examples[4].html.replaceAll('in millions', 'amounts unspecified').replaceAll('In millions', 'Amounts unspecified') }).reason, 'micron-unit-mismatch');
  assert.equal(run(4, { html: alterTable(businessTable, table => `<p>In thousands</p>${table}`) }).reason, 'micron-unit-mismatch');
  for (const caption of ['in dollars', 'in U.S. dollars', 'in USD', 'in millions of Canadian dollars', 'in millions of Australian dollars', 'in millions of Swiss francs']) {
    assert.equal(run(4, { html: alterTable(businessTable, table => table.replace('<tr>', `<tr><td>${caption}</td></tr><tr>`)) }).reason, 'micron-unit-mismatch', caption);
  }
});

test('annual or cumulative rows and columns cannot stand in for a fiscal quarter', () => {
  for (const html of [
    examples[4].html.replace('fourth quarter and full year of fiscal', 'full year of fiscal'),
    alterTable(businessTable, table => table.replace('Quarterly Business Unit Financial Results', 'Annual Business Unit Financial Results')),
    alterTable(summaryTable, table => table.replace('Quarterly Financial Results', 'Annual Financial Results')),
    alterTable(businessTable, table => table.replaceAll('FQ4-26', 'FY-26')),
    alterTable(businessTable, table => table.replaceAll('FQ4-26', 'Nine Months FQ4-26')),
    alterTable(operationsTable, table => table.replaceAll('4th Qtr.', 'Year Ended')),
    alterTable(operationsTable, table => table.replaceAll('4th Qtr.', 'Nine Months Ended')),
  ]) assert.equal(run(4, { html }).result, null);
  for (const caption of ['Twelve months ended', 'Year-to-date', 'Six months ended', 'Annual results', 'Full year', 'FY-26']) {
    assert.equal(run(4, { html: alterTable(businessTable, table => table.replace('<tr>', `<tr><td>${caption}</td></tr><tr>`)) }).reason, 'micron-quarter-columns-invalid', caption);
  }
});

test('current and previous-quarter headers cannot be swapped or duplicated', () => {
  for (const target of [businessTable, summaryTable]) for (const transform of [
    table => table.replaceAll('FQ4-26', 'TEMP').replaceAll('FQ3-26', 'FQ4-26').replaceAll('TEMP', 'FQ3-26'),
    table => table.replaceAll('FQ4-26', 'TEMP').replaceAll('FQ4-25', 'FQ4-26').replaceAll('TEMP', 'FQ4-25'),
    table => table.replaceAll('FQ3-26', 'FQ4-26'),
  ]) assert.equal(run(4, { html: alterTable(target, transform) }).reason, 'micron-quarter-columns-invalid');
  assert.equal(run(4, { html: alterTable(operationsTable, table => table.replaceAll('4th Qtr.', '3rd Qtr.')) }).reason, 'micron-quarter-columns-invalid');
});

test('invalid dates, unrelated periods and noncontiguous quarter dates fail closed', () => {
  for (const fiscalDate of ['', '2026-02-30', '2026-05-31', '2026-12-31', '2025-08-31']) {
    assert.equal(run(4, { fiscalDate }).reason, 'micron-period-mismatch');
  }
  for (const changedEnd of ['September 2, 2026', 'September 31, 2026', 'September 3, 2027']) {
    assert.equal(run(4, { html: replaceDate(examples[4].html, 'September 3, 2026', changedEnd) }).result, null);
  }
  for (const prior of ['May 29, 2026', 'February 26, 2026', 'June 11, 2026']) {
    assert.equal(run(4, { html: replaceDate(examples[4].html, 'May 28, 2026', prior) }).result, null);
  }
  assert.equal(run(4, { html: alterTable(operationsTable, table => replaceDate(table, 'September 3, 2026', 'August 27, 2026')) }).result, null);
});

test('duplicate tables and duplicate/missing financial rows are ambiguous, including equal duplicates', () => {
  for (const target of [businessTable, summaryTable, operationsTable]) {
    assert.equal(run(4, { html: alterTable(target, table => table + table) }).reason, 'micron-table-ambiguous');
    assert.equal(run(4, { html: alterTable(target, table => table + table.replace('16,283', '16,999')) }).reason, 'micron-table-ambiguous');
  }
  for (const transform of [row => row + row, () => '']) {
    assert.equal(run(4, { html: alterTable(businessTable, table => alterFirstRevenueRow(table, transform)) }).result, null);
  }
  assert.equal(run(4, { html: alterTable(businessTable, table => table.replaceAll('Cloud Memory Business Unit', 'Unknown Business Unit')) }).result, null);
  assert.equal(run(4, { html: alterTable(businessTable, table => table.replaceAll('Core Data Center Business Unit', 'Cloud Memory Business Unit')) }).result, null);
});

test('percentages, missing values, negative values and extra numbers never become current revenue', () => {
  for (const value of ['16,283%', '—', '', '(16,283)', '-16,283', 'NaN', '16,283 83%', '99,999,999,999,999']) {
    assert.equal(run(4, { html: alterTable(businessTable, table => replaceOnce(table, '>16,283', `>${value}`)) }).result, null, value);
  }
  assert.equal(run(4, { html: alterTable(businessTable, table => alterFirstRevenueRow(table, row => row.replace('Revenue', 'Gross margin'))) }).result, null);
});

test('current consolidated revenues must agree across the GAAP summary and statement', () => {
  for (const target of [summaryTable, operationsTable]) {
    assert.equal(run(4, { html: alterTable(target, table => replaceOnce(table, '54,229', '54,230')) }).reason, 'micron-current-total-mismatch');
  }
});

test('confirmed segment differences retain amounts, even over-total, and never invent an Other item', () => {
  for (const value of ['16,284', '54,229']) {
    const { result } = run(4, { html: alterTable(businessTable, table => replaceOnce(table, '16,283', value)) });
    const section = result.sections.reportSegments;
    assert.equal(section.items.length, 4);
    assert.equal(section.items[0].revenue, Number(value.replace(',', '')) * 1_000_000);
    assert.equal(section.revenueReconciliation.difference, result.totalRevenue - section.items.reduce((sum, item) => sum + item.revenue, 0));
    assert.equal(section.status, 'partial');
  }
  const html = alterTable(businessTable, table => table.replace('16,283', '16,289').replace('4,543', '4,544'));
  const section = run(4, { html }).result.sections.reportSegments;
  assert.equal(section.status, 'complete');
  assert.equal(section.revenueReconciliation.status, 'matched');
  assert.equal(section.revenueReconciliation.difference, 0);
  assert.equal(section.revenueReconciliation.previousDifference, 0);
});

test('unconfirmed historical values or dates remove all comparatives while keeping verified current values', () => {
  for (const html of [
    alterTable(businessTable, table => table.replace('4,543', '—')),
    alterTable(businessTable, table => table.replace('4,543', '4,543%')),
    alterTable(summaryTable, table => table.replace('11,315', '11,316')),
    alterTable(operationsTable, table => table.replace('11,315', '11,316')),
    alterTable(businessTable, table => table.replaceAll('FQ4-25', 'FQ4-24')),
    alterTable(summaryTable, table => table.replaceAll('FQ4-25', 'FQ4-24')),
    replaceDate(examples[4].html, 'August 28, 2025', 'August 27, 2025'),
  ]) {
    const { result, reason } = run(4, { html });
    assert.equal(reason, null);
    assert.equal(result.totalRevenue, 54_229_000_000);
    assert.equal(result.previousTotalRevenue, null);
    const section = result.sections.reportSegments;
    assert.ok(section.items.every(item => item.previousRevenue === null));
    assert.equal(section.metricStatus.previousRevenue.status, 'unavailable');
    assert.equal(section.revenueReconciliation.previousTotalRevenue, null);
    assert.equal(section.revenueReconciliation.previousReportedRevenueTotal, null);
    assert.equal(section.revenueReconciliation.previousDifference, null);
  }
});

test('confirmed historical segment mismatch remains visible rather than erasing comparatives', () => {
  const { result } = run(4, { html: alterTable(businessTable, table => table.replace('4,543', '4,545')) });
  assert.equal(result.previousTotalRevenue, 11_315_000_000);
  assert.equal(result.sections.reportSegments.items[0].previousRevenue, 4_545_000_000);
  assert.equal(result.sections.reportSegments.revenueReconciliation.previousDifference, -1_000_000);
});

test('comments and scripts cannot contribute extra business tables or override official values', () => {
  const table = [...examples[4].html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)].find(match => businessTable(match[0]))[0];
  const injected = examples[4].html.replace('</body>', `<!--${table}--><script>${table}</script></body>`);
  assert.deepEqual(run(4, { html: injected }).result, run().result);
});
