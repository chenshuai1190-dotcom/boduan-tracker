import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canAttemptLillyBusinessComposition, inspectLillyBusinessComposition } from '../server/earnings/secLillyBusinessComposition.js';
import { inspectGenericSecBusinessComposition } from '../server/earnings/secGenericBusinessComposition.js';

const html = await readFile(new URL('./fixtures/sec-lilly-business/lly-20260630.htm', import.meta.url), 'utf8');
const filing = { cik: '0000059478', form: '10-Q', documentType: 'PRIMARY', accession: '0000059478-26-000081' };
const parse = (source = html, overrides = {}) => inspectLillyBusinessComposition({ symbol: 'LLY', fiscalDate: '2026-06-30', html: source, filing, ...overrides });
const total = (items, key = 'revenue') => items.reduce((sum, item) => sum + item[key], 0);
const productTable = (source) => [...source.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
  .find(([table]) => table.includes('Cardiometabolic Health:') && table.includes('Three Months Ended'))?.[0];
const changeTable = (source, change) => source.replace(productTable(source), change(productTable(source)));
const changeFact = (source, context, change) => source.replace(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi,
  (whole, attrs, value) => attrs.includes(`contextRef="${context}"`) && attrs.includes('name="us-gaap:Revenues"') ? change(whole, attrs, value) : whole);
const changeContext = (source, id, change) => source.replace(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi,
  (whole, attrs, body) => attrs.includes(`id="${id}"`) ? `<xbrli:context${attrs}>${change(body)}</xbrli:context>` : whole);

test('LLY registry is narrow and accepts the normal US ticker alias', () => {
  assert.equal(canAttemptLillyBusinessComposition(' lly.us '), true);
  for (const symbol of ['LLY2', 'LLY.DE', 'NVO', '', undefined]) assert.equal(canAttemptLillyBusinessComposition(symbol), false);
});

test('unaltered official Q2 filing yields eleven disjoint product leaves and five geographies', () => {
  const { result, reason } = parse();
  assert.equal(reason, null);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.period, { start: '2026-04-01', end: '2026-06-30', fiscalYear: '2026', fiscalPeriod: 'Q2' });
  assert.equal(result.totalRevenue, 22_974_000_000);
  assert.equal(result.previousTotalRevenue, 15_558_000_000);
  assert.deepEqual(result.sections.reportSegments, { status: 'unavailable', reason: 'single-reportable-segment', items: [] });
  const products = result.sections.revenueBreakdown;
  const geographies = result.sections.geographies;
  assert.equal(products.status, 'complete');
  assert.equal(geographies.status, 'complete');
  assert.deepEqual(products.items.map((item) => item.label), ['Mounjaro', 'Zepbound', 'Jardiance', 'Trulicity', 'Other cardiometabolic health', 'Verzenio', 'Other oncology', 'Taltz', 'Other immunology', 'Neuroscience', 'Other']);
  assert.deepEqual(products.items.map((item) => item.revenue / 1_000_000), [9943, 4928, 1232, 1219, 1031, 1474, 1096, 856, 561, 429, 205]);
  assert.deepEqual(geographies.items.map((item) => [item.label, item.revenue / 1_000_000]), [['U.S.', 14413], ['Europe', 4115], ['China', 941], ['Japan', 628], ['Rest of world', 2877]]);
  assert.equal(total(products.items), result.totalRevenue);
  assert.equal(total(geographies.items), result.totalRevenue);
  assert.ok(!products.reconciliation && !geographies.reconciliation);
  assert.equal(result.sourceMetadata.adapterId, 'lilly-revenue-disclosure-v1');
});

test('official rounded prior disclosures remain null rather than inventing balancing adjustments', () => {
  const { result } = parse();
  for (const section of [result.sections.revenueBreakdown, result.sections.geographies]) {
    assert.ok(section.items.every((item) => item.previousRevenue === null && item.profit === null && item.previousProfit === null));
    assert.deepEqual(section.metricStatus.previousRevenue, { status: 'unavailable', reason: 'prior-revenue-unavailable-or-not-comparable' });
  }
});

test('regression reproduces generic ambiguity and does not change generic parsing semantics', () => {
  const generic = inspectGenericSecBusinessComposition({ symbol: 'LLY', fiscalDate: '2026-06-30', html, filing }).result;
  assert.equal(generic.sections.revenueBreakdown.reason, 'ambiguous-revenue-hierarchy');
  assert.equal(generic.sections.geographies.reason, 'ambiguous-revenue-hierarchy');
  assert.equal(generic.sections.reportSegments.reason, 'unsupported-component-count');
});

test('filing symbol, CIK, document type, form, accession and official fiscal date cannot be crossed', () => {
  for (const overrides of [
    { symbol: 'NVO' }, { filing: { ...filing, cik: '320193' } },
    { filing: { ...filing, documentType: 'EX-99.1' } }, { filing: { ...filing, form: '10-K' } },
    { filing: { ...filing, form: '8-K' } }, { filing: { ...filing, accession: 'invalid' } },
    { fiscalDate: '2026-03-31' }, { fiscalDate: '2026-06-29' },
  ]) assert.equal(parse(html, overrides).result, null, JSON.stringify(overrides));
});

test('DEI identity, fiscal year and focus remain mandatory and never borrow cumulative periods', () => {
  for (const [name, value] of [
    ['dei:EntityCentralIndexKey', '0000320193'], ['dei:DocumentType', '10-K'],
    ['dei:DocumentFiscalYearFocus', '2025'], ['dei:DocumentFiscalPeriodFocus', 'Q1'],
  ]) {
    const changed = html.replace(new RegExp(`(<ix:nonNumeric\\b[^>]*name="${name}"[^>]*>)[\\s\\S]*?(<\\/ix:nonNumeric>)`, 'i'), `$1${value}$2`);
    assert.notEqual(changed, html);
    assert.equal(parse(changed).result, null, name);
  }
  assert.equal(parse(html.replaceAll('2026-04-01', '2026-01-01')).result, null);
});

test('duplicate context or unit IDs reject the document rather than selecting the convenient copy', () => {
  for (const raw of [html.match(/<xbrli:context\b[^>]*>[\s\S]*?<\/xbrli:context>/i)[0], html.match(/<xbrli:unit\b[^>]*>[\s\S]*?<\/xbrli:unit>/i)[0]]) {
    assert.equal(parse(html.replace('</body>', `${raw}</body>`)).result, null);
  }
});

test('every participating context requires the Lilly entity CIK and a valid identifier scheme', () => {
  for (const mutate of [
    (body) => body.replace('0000059478', '0000320193'),
    (body) => body.replace(/<xbrli:identifier\b[^>]*>[\s\S]*?<\/xbrli:identifier>/, ''),
    (body) => body.replace('http://www.sec.gov/CIK', 'http://example.invalid/CIK'),
  ]) {
    const { result } = parse(changeContext(html, 'c-33', mutate));
    assert.equal(result.sections.revenueBreakdown.status, 'unavailable');
    assert.equal(result.sections.geographies.status, 'complete');
  }
});

test('wrong-currency or nil product facts cannot be silently dropped while keeping their table', () => {
  for (const source of [
    changeFact(html, 'c-33', (whole) => whole.replace('unitRef="usd"', 'unitRef="eur"')),
    changeFact(html, 'c-33', (whole) => whole.replace('<ix:nonFraction ', '<ix:nonFraction xsi:nil="true" ')),
  ]) assert.equal(parse(source).result.sections.revenueBreakdown.status, 'unavailable');
  assert.equal(parse(html.replace('iso4217:USD', 'iso4217:EUR')).result, null);
});

test('non-dot numeric transforms, continued numbers and malformed numeric attributes fail closed', () => {
  for (const mutate of [
    (whole) => whole.replace('ixt:num-dot-decimal', 'ixt:num-comma-decimal'),
    (whole) => whole.replace('ixt:num-dot-decimal', 'unknown:number'),
    (whole) => whole.replace(' format="ixt:num-dot-decimal"', ''),
    (whole) => whole.replace('<ix:nonFraction ', '<ix:nonFraction continuedAt="other-number" '),
    (whole) => whole.replace('<ix:nonFraction ', '<ix:nonFraction sign="+" '),
    (whole) => whole.replace('<ix:nonFraction ', '<ix:nonFraction sign="invalid" '),
    (whole) => whole.replace('<ix:nonFraction ', '<ix:nonFraction xsi:nil="invalid" '),
    (whole) => whole.replace('scale="6"', 'scale=""'),
    (whole) => whole.replace('scale="6"', 'scale="6.0"'),
    (whole) => whole.replace('9,943', '99,43'),
  ]) {
    const source = changeFact(html, 'c-33', mutate);
    assert.notEqual(source, html);
    assert.equal(parse(source).result.sections.revenueBreakdown.status, 'unavailable');
  }
});

test('a divided USD unit is not accepted as plain revenue currency', () => {
  const source = html.replace(/(<xbrli:unit\b[^>]*id="usd"[^>]*>)([\s\S]*?)(<\/xbrli:unit>)/,
    '$1<xbrli:divide><xbrli:unitNumerator>$2</xbrli:unitNumerator><xbrli:unitDenominator></xbrli:unitDenominator></xbrli:divide>$3');
  assert.notEqual(source, html);
  const { result } = parse(source);
  assert.ok(!result || (result.sections.revenueBreakdown.status === 'unavailable' && result.sections.geographies.status === 'unavailable'));
});

test('DEI facts must reference a same-issuer undimensioned context at the official period end', () => {
  for (const mutate of [
    (attrs) => attrs.replace('contextRef="c-1"', 'contextRef="c-33"'),
    (attrs) => attrs.replace('contextRef="c-1"', 'contextRef="missing"'),
    (attrs) => attrs.replace(' contextRef="c-1"', ''),
  ]) {
    const source = html.replace(/<ix:nonNumeric\b([^>]*name="dei:DocumentFiscalYearFocus"[^>]*)>/,
      (whole, attrs) => `<ix:nonNumeric${mutate(attrs)}>`);
    assert.notEqual(source, html);
    assert.equal(parse(source).result, null);
  }
  assert.equal(parse(changeContext(html, 'c-1', (body) => body.replace('0000059478', '0000320193'))).result, null);
});

test('visible quarter headers must agree with the context period and DEI year', () => {
  for (const mutate of [
    (table) => table.replaceAll('June 30', 'March 31'),
    (table) => table.replaceAll('2026', '2027'),
  ]) {
    const source = changeTable(html, mutate);
    assert.notEqual(source, html);
    assert.equal(parse(source).result.sections.revenueBreakdown.status, 'unavailable');
  }
});

test('a conflicting duplicate revenue fact outside the chosen disclosure still invalidates the member', () => {
  const original = [...html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)]
    .find(([, attrs]) => attrs.includes('contextRef="c-33"') && attrs.includes('name="us-gaap:Revenues"'))[0];
  const source = html.replace('</body>', `${original.replace('9,943', '9,944')}</body>`);
  assert.equal(parse(source).result.sections.revenueBreakdown.reason, 'lilly-conflicting-or-invalid-revenue-fact');
});

test('duplicate product tables or rows are rejected without a first-match or numeric-subset fallback', () => {
  const twice = changeTable(html, (table) => table + table);
  assert.equal(parse(twice).result.sections.revenueBreakdown.reason, 'lilly-ambiguous-or-missing-disclosure-table');
  const duplicateRow = changeTable(html, (table) => {
    const row = [...table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].find(([value]) => value.includes('contextRef="c-33"'))[0];
    return table.replace(row, row + row);
  });
  assert.equal(parse(duplicateRow).result.sections.revenueBreakdown.status, 'unavailable');
});

test('explicit subtotal hierarchy must close and reconcile; subtotal is never counted as another leaf', () => {
  for (const source of [
    changeTable(html, (table) => table.replace('Total cardiometabolic health', 'Total oncology')),
    changeTable(html, (table) => table.replace('Total cardiometabolic health', 'Cardiometabolic health')),
    changeFact(html, 'c-63', (whole) => whole.replace('18,353', '18,354')),
  ]) assert.equal(parse(source).result.sections.revenueBreakdown.status, 'unavailable');
});

test('worldwide product facts with an extra dimension cannot become an aggregate row', () => {
  const source = changeContext(html, 'c-33', (body) => body.replace('</xbrli:segment>', '<xbrldi:explicitMember dimension="test:ChannelAxis">test:OnlineMember</xbrldi:explicitMember></xbrli:segment>'));
  assert.equal(parse(source).result.sections.revenueBreakdown.status, 'unavailable');
});

test('missing quarterly table or root total cannot fall back to the six-month or MD&A table', () => {
  assert.equal(parse(changeTable(html, () => '')).result.sections.revenueBreakdown.status, 'unavailable');
  const missingTotal = changeTable(html, (table) => table.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (row) => row.includes('contextRef="c-12"') ? '' : row));
  assert.equal(parse(missingTotal).result.sections.revenueBreakdown.status, 'unavailable');
});

test('missing, repeated or cyclic continuation identity is rejected, including nested continuations', () => {
  for (const source of [
    html.replace('continuedAt="f-246-4"', 'continuedAt="missing-block"'),
    html.replace('id="f-246-4"', 'id="f-246-3"'),
    html.replace('continuedAt="f-246-4"', 'continuedAt="f-246-1"'),
  ]) assert.equal(parse(source).result, null);
});

// Purely synthetic 2025 Q1 contract. Invented product labels/values are not
// real Lilly history. It proves there is no hard-coded 2026 quarter/amount.
function syntheticQuarter({ prior = true } = {}) {
  let contexts = '';
  const axisProduct = 'srt:ProductOrServiceAxis';
  const axisGeo = 'srt:StatementGeographicalAxis';
  function fact(member, axis, value, previous = false) {
    const id = `c${contexts.length}`;
    const year = previous ? 2024 : 2025;
    contexts += `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000059478</xbrli:identifier>${axis ? `<xbrli:segment><xbrldi:explicitMember dimension="${axis}">${member}</xbrldi:explicitMember></xbrli:segment>` : ''}</xbrli:entity><xbrli:period><xbrli:startDate>${year}-01-01</xbrli:startDate><xbrli:endDate>${year}-03-31</xbrli:endDate></xbrli:period></xbrli:context>`;
    return `<ix:nonFraction name="us-gaap:Revenues" contextRef="${id}" unitRef="usd" scale="6">${value}</ix:nonFraction>`;
  }
  function row(label, member, axis, current, previous) {
    return `<tr><td>${label}</td><td>${fact(member, axis, current)}</td><td>${prior ? fact(member, axis, previous, true) : ''}</td></tr>`;
  }
  const products = `<table><tr><td>Three Months Ended March 31, 2025 2024 U.S. Outside U.S. Total</td></tr><tr><td>Example therapy:</td></tr>${row('Example Alpha', 'lly:ExampleAlphaMember', axisProduct, 30, 20)}${row('Example Beta', 'lly:ExampleBetaMember', axisProduct, 20, 10)}${row('Total example therapy', 'lly:ExampleTherapyMember', axisProduct, 50, 30)}${row('Other', 'us-gaap:ProductAndServiceOtherMember', axisProduct, 50, 40)}${row('Revenue', null, null, 100, 70)}</table>`;
  const geography = `<table><tr><td>Three Months Ended March 31, 2025 2024</td></tr>${row('U.S.', 'country:US', axisGeo, 60, 50)}${row('Europe', 'srt:EuropeMember', axisGeo, 40, 20)}${row('Revenue', null, null, 100, 70)}</table>`;
  const segment = fact('lly:ReportableSegmentMember', 'us-gaap:StatementBusinessSegmentsAxis', 100);
  const rootId = [...contexts.matchAll(/<xbrli:context id="([^"]+)">([\s\S]*?)<\/xbrli:context>/g)]
    .find(([, , body]) => !body.includes('explicitMember') && body.includes('2025-03-31'))[1];
  const identity = [['EntityCentralIndexKey', '0000059478'], ['DocumentType', '10-Q'],
    ['DocumentPeriodEndDate', '2025-03-31'], ['DocumentFiscalYearFocus', '2025'], ['DocumentFiscalPeriodFocus', 'Q1']]
    .map(([name, value]) => `<ix:nonNumeric name="dei:${name}" contextRef="${rootId}">${value}</ix:nonNumeric>`).join('');
  return `<html><body><xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>${contexts}${identity}<ix:nonNumeric name="us-gaap:RevenueFromContractWithCustomerTextBlock" contextRef="${rootId}" continuedAt="revenue-note">Revenue</ix:nonNumeric><ix:continuation id="revenue-note">Disaggregation of Revenue by product${products}Revenue by geographical area${geography}</ix:continuation>We operate as a single reportable segment.${segment}</body></html>`;
}

test('another synthetic year/quarter and new labels use document values with exact prior comparisons', () => {
  const { result, reason } = parse(syntheticQuarter(), { fiscalDate: '2025-03-31', filing: { ...filing, accession: '0000059478-25-000001' } });
  assert.equal(reason, null);
  assert.equal(result.period.fiscalPeriod, 'Q1');
  assert.equal(result.totalRevenue, 100_000_000);
  assert.deepEqual(result.sections.revenueBreakdown.items.map((item) => [item.label, item.revenue, item.previousRevenue]), [['Example Alpha', 30_000_000, 20_000_000], ['Example Beta', 20_000_000, 10_000_000], ['Other', 50_000_000, 40_000_000]]);
  assert.equal(total(result.sections.geographies.items, 'previousRevenue'), 70_000_000);
});

test('missing prior year remains null while a verified current quarter remains usable', () => {
  const { result } = parse(syntheticQuarter({ prior: false }), { fiscalDate: '2025-03-31' });
  assert.equal(result.sections.revenueBreakdown.status, 'complete');
  assert.equal(result.sections.geographies.status, 'complete');
  assert.ok(result.sections.revenueBreakdown.items.every((item) => item.previousRevenue === null));
});
