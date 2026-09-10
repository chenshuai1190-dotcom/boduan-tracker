import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectRobinhoodBusinessComposition } from '../server/earnings/secRobinhoodBusinessComposition.js';
import { inspectGenericSecBusinessComposition } from '../server/earnings/secGenericBusinessComposition.js';

const html = readFileSync(new URL('./fixtures/sec-robinhood/hood-20260630-excerpt.htm', import.meta.url), 'utf8');
const filing = { cik: '0001783879', form: '10-Q', documentType: 'PRIMARY', accession: '0001783879-26-000114' };
const options = (patch = {}) => ({ symbol: 'HOOD', fiscalDate: '2026-06-30', html, filing, ...patch });
const inspect = (patch = {}) => inspectRobinhoodBusinessComposition(options(patch));
const attrs = source => Object.fromEntries([...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1].toLowerCase(), match[2]]));
const add = (source, fragment) => source.replace('</body>', `${fragment}\n</body>`);
const numeric = (source = html) => [...source.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)];
const select = (concept, context) => numeric().find(match => attrs(match[1]).name === concept && attrs(match[1]).contextref === context)?.[0];
const rootFact = select('us-gaap:Revenues', 'c-17');
const transaction = select('us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', 'c-13');
const netInterest = select('us-gaap:InterestIncomeExpenseNet', 'c-17');
const quarterContexts = year => new Set([...html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi)]
  .filter(match => match[2].includes(`${year}-04-01`) && match[2].includes(`${year}-06-30`)).map(match => attrs(match[1]).id));
const removeQuarter = year => html.replace(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi,
  (whole, attributes) => quarterContexts(year).has(attrs(attributes).contextref) ? '' : whole);

test('real SEC primary fixture shows the generic concept mismatch and reconciles three correct sources', () => {
  const generic = inspectGenericSecBusinessComposition(options()).result;
  assert.equal(generic.totalRevenue, 1308000000);
  assert.equal(generic.sections.revenueBreakdown.status, 'unavailable');
  const { result, reason } = inspect();
  assert.equal(reason, null);
  assert.equal(result.status, 'partial');
  assert.equal(result.currency, 'USD');
  assert.equal(result.totalRevenue, 1308000000);
  assert.equal(result.previousTotalRevenue, 989000000);
  assert.deepEqual(result.period, { start: '2026-04-01', end: '2026-06-30', fiscalYear: '2026', fiscalPeriod: 'Q2' });
  assert.deepEqual(result.sections.revenueBreakdown.items.map(item => [item.id, item.labelZh, item.revenue, item.previousRevenue]), [
    ['transaction-based-revenues', '交易收入', 776000000, 539000000],
    ['net-interest-revenues', '净利息收入', 389000000, 357000000],
    ['other-revenues', '其他收入', 143000000, 93000000],
  ]);
  assert.equal(result.sections.revenueBreakdown.items.reduce((sum, item) => sum + item.revenue, 0), result.totalRevenue);
  assert.equal(result.sourceMetadata.cik, filing.cik);
});

test('gross interest, net lending interest and transaction children are never double counted', () => {
  assert.match(html, /us-gaap:InterestIncomeOperating/);
  assert.match(html, /hood:OptionsMember/);
  assert.match(html, /hood:SecuritiesLendingNetMember/);
  const { result } = inspect();
  assert.equal(result.sections.revenueBreakdown.items.length, 3);
  assert.equal(result.sections.revenueBreakdown.items[1].revenue, 389000000);
  assert.equal(result.sections.reportSegments.status, 'unavailable');
  assert.deepEqual(result.sections.reportSegments.items, []);
  assert.equal(result.sections.geographies.status, 'unavailable');
  assert.ok(result.sections.revenueBreakdown.items.every(item => item.profit === null && item.previousProfit === null));
});

test('symbol, filing CIK, DEI CIK, DEI symbol, form and official period must all agree', () => {
  for (const patch of [
    { symbol: 'MSFT' }, { filing: { ...filing, cik: '789019' } },
    { html: html.replaceAll('0001783879', '0000789019') },
    { html: html.replace('>HOOD</ix:nonNumeric>', '>MSFT</ix:nonNumeric>') },
    { filing: { ...filing, documentType: 'EX-99.1' } },
    { filing: { ...filing, form: '8-K' } }, { fiscalDate: '2026-03-31' },
    { html: html.replace('>June 30, 2026</ix:nonNumeric>', '>March 31, 2026</ix:nonNumeric>') },
  ]) assert.equal(inspect(patch).result, null, JSON.stringify(Object.keys(patch)));
  assert.ok(inspect({ symbol: 'HOOD.US', filing: { ...filing, cik: '1783879' } }).result);
});

test('foreign issuer and additional-dimensional contexts cannot supply missing consolidated facts', () => {
  const changedEntity = html.replace(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi, (whole, attributeText) =>
    quarterContexts('2026').has(attrs(attributeText).id) ? whole.replace('0001783879', '0000789019') : whole);
  assert.equal(inspect({ html: changedEntity }).result, null);
  const changedAxis = html.replaceAll('dimension="srt:ProductOrServiceAxis">hood:TransactionBasedRevenuesMember',
    'dimension="hood:UnverifiedAxis">hood:TransactionBasedRevenuesMember');
  assert.equal(inspect({ html: changedAxis }).result, null);
});

test('USD identity, usable numeric transformation and finite exact integer scale are mandatory', () => {
  for (const changed of [
    html.replaceAll('iso4217:USD', 'iso4217:EUR'),
    add(html, rootFact.replace('unitRef="usd"', 'unitRef="usdPerShare"')),
    add(html, rootFact.replace('scale="6"', 'scale="99"')),
    add(html, rootFact.replace('format="ixt:num-dot-decimal"', 'format="ixt:num-comma-decimal"')),
    add(html, rootFact.replace('>1,308<', '>NaN<')),
  ]) assert.equal(inspect({ html: changed }).result, null);
});

test('identical official repeated facts deduplicate but conflicting duplicates and duplicate contexts fail closed', () => {
  assert.ok(inspect({ html: add(html, rootFact) }).result);
  for (const changed of [
    add(html, rootFact.replace('>1,308<', '>1,309<')),
    add(html, transaction.replace('>776<', '>777<')),
    add(html, netInterest.replace('>389<', '>390<')),
    add(html, html.match(/<xbrli:context id="c-17">[\s\S]*?<\/xbrli:context>/)[0]),
    add(html, '<xbrli:unit id="usd"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>'),
  ]) assert.equal(inspect({ html: changed }).result, null);
});

test('year-to-date values are not relabelled as the current quarter and annual FY cannot become Q4', () => {
  assert.match(removeQuarter('2026'), /2026-01-01/);
  assert.equal(inspect({ html: removeQuarter('2026') }).result, null);
  const annual = html.replaceAll('>10-Q</ix:nonNumeric>', '>10-K</ix:nonNumeric>').replace('>Q2</ix:nonNumeric>', '>FY</ix:nonNumeric>');
  assert.equal(inspect({ html: annual, filing: { ...filing, form: '10-K' } }).result, null);
  assert.equal(inspect({ html: html.replace('>Q2</ix:nonNumeric>', '>Q3</ix:nonNumeric>') }).result, null);
});

test('all top-level sources must reconcile exactly; no residual other bucket is fabricated', () => {
  const mismatch = html.replace(/(<ix:nonFraction\b[^>]*contextRef="c-13"[^>]*>)776(<\/ix:nonFraction>)/g, '$1777$2');
  assert.notEqual(mismatch, html);
  assert.equal(inspect({ html: mismatch }).reason, 'revenue-reconciliation-failed');
  const missing = html.replace(/<ix:nonFraction\b([^>]*)>[\s\S]*?<\/ix:nonFraction>/gi, (whole, attributes) =>
    attrs(attributes).contextref === 'c-20' ? '' : whole);
  assert.equal(inspect({ html: missing }).result, null);
});

test('missing, conflicting or nonreconciling prior quarter leaves current revenue available with null comparatives', () => {
  const priorRoot = numeric().find(match => attrs(match[1]).name === 'us-gaap:Revenues' && quarterContexts('2025').has(attrs(match[1]).contextref))[0];
  const priorMismatch = html.replace(/(<ix:nonFraction\b[^>]*>)989(<\/ix:nonFraction>)/g, '$1990$2');
  for (const changed of [removeQuarter('2025'), add(html, priorRoot.replace('>989<', '>990<')), priorMismatch]) {
    const { result } = inspect({ html: changed });
    assert.equal(result.totalRevenue, 1308000000);
    assert.equal(result.previousTotalRevenue, null);
    assert.ok(result.sections.revenueBreakdown.items.every(item => item.previousRevenue === null));
    assert.equal(result.sections.revenueBreakdown.metricStatus.previousRevenue.status, 'unavailable');
  }
});

test('fiscal selection is derived from DEI and exact contexts, not hardcoded to the sample year or revenue amount', () => {
  const shifted = html.replace(/202[56]/g, year => String(Number(year) + 1));
  const { result } = inspect({ html: shifted, fiscalDate: '2027-06-30' });
  assert.equal(result.period.fiscalYear, '2027');
  assert.equal(result.period.start, '2027-04-01');
  assert.equal(result.totalRevenue, 1308000000);
  const thousands = html.replaceAll('scale="6"', 'scale="3"');
  assert.equal(inspect({ html: thousands }).result.totalRevenue, 1308000);
});
