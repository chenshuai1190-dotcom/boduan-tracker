import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  canAttemptGenericSecBusinessComposition,
  inspectGenericSecBusinessComposition,
  parseGenericSecBusinessComposition,
} from '../server/earnings/secGenericBusinessComposition.js';

const fixtureRoot = new URL('./fixtures/sec-us-holding-business/', import.meta.url);
const REVENUE_CONCEPT = 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax';

async function costFixture() {
  return readFile(new URL('cost-2026q3.html', fixtureRoot), 'utf8');
}

function withUsdFacts(html) {
  const withUnit = /<xbrli:unit\b[^>]*id="USD"/.test(html)
    ? html
    : html.replace(
      '<body>',
      '<body><xbrli:unit id="USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>',
    );
  const withFacts = withUnit.replace(/<ix:nonFraction\b([^>]*)>/g, (match, attributes) => (
    /\bunitRef\s*=/.test(attributes) ? match : `<ix:nonFraction unitRef="USD"${attributes}>`
  ));
  // Reduced fixtures omit some XBRL scaffolding. This is explicitly synthetic
  // unit/context identity metadata based on the fixture's DEI, not a claim
  // that these generated tags were copied from an actual SEC document.
  const cik = withFacts.match(/name="dei:EntityCentralIndexKey">([^<]+)</)?.[1];
  return withFacts.replace(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/g, (match, attributes, body) => {
    if (!cik || /<xbrli:identifier\b/.test(body)) return match;
    const identifier = `<xbrli:identifier scheme="http://www.sec.gov/CIK">${cik}</xbrli:identifier>`;
    const identified = /<xbrli:entity>/.test(body)
      ? body.replace('<xbrli:entity>', `<xbrli:entity>${identifier}`)
      : `<xbrli:entity>${identifier}</xbrli:entity>${body}`;
    return `<xbrli:context${attributes}>${identified}</xbrli:context>`;
  });
}

function withUsdFactsAndFiscalFocus(html) {
  let source = withUsdFacts(html);
  if (!source.includes('name="dei:DocumentFiscalYearFocus"')) {
    source = source.replace('<body>', '<body><ix:nonNumeric name="dei:DocumentFiscalYearFocus">2026</ix:nonNumeric>');
  }
  if (!source.includes('name="dei:DocumentFiscalPeriodFocus"')) {
    source = source.replace('<body>', '<body><ix:nonNumeric name="dei:DocumentFiscalPeriodFocus">Q3</ix:nonNumeric>');
  }
  return source;
}

function withProfitOnlyReconciliation(html) {
  return html
    .replace(
      `name="us-gaap:OperatingIncomeLoss" contextRef="current" scale="6">2,815`,
      `name="us-gaap:OperatingIncomeLoss" contextRef="current" scale="6">2,715`,
    )
    .replace(
      `name="us-gaap:OperatingIncomeLoss" contextRef="previous" scale="6">2,530`,
      `name="us-gaap:OperatingIncomeLoss" contextRef="previous" scale="6">2,430`,
    )
    .replace(
      '</body>',
      `<xbrli:context id="current_corporate"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000909832</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="srt:ConsolidationItemsAxis">us-gaap:CorporateNonSegmentMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2026-02-16</xbrli:startDate><xbrli:endDate>2026-05-10</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="previous_corporate"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000909832</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="srt:ConsolidationItemsAxis">us-gaap:CorporateNonSegmentMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-02-17</xbrli:startDate><xbrli:endDate>2025-05-11</xbrli:endDate></xbrli:period></xbrli:context>
<ix:nonFraction unitRef="USD" name="us-gaap:OperatingIncomeLoss" contextRef="current_corporate" scale="6" sign="-">100</ix:nonFraction>
<ix:nonFraction unitRef="USD" name="us-gaap:OperatingIncomeLoss" contextRef="previous_corporate" scale="6" sign="-">100</ix:nonFraction>
</body>`,
    );
}

function withTypedMemberNoise(html) {
  return html.replace(
    '</body>',
    `<xbrli:context id="current_typed_noise"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000909832</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cost:UnitedStatesMember</xbrldi:explicitMember><xbrldi:typedMember dimension="test:CustomerAxis"><test:CustomerDomain>Noise</test:CustomerDomain></xbrldi:typedMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2026-02-16</xbrli:startDate><xbrli:endDate>2026-05-10</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="previous_typed_noise"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000909832</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cost:UnitedStatesMember</xbrldi:explicitMember><xbrldi:typedMember dimension="test:CustomerAxis"><test:CustomerDomain>Noise</test:CustomerDomain></xbrldi:typedMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-02-17</xbrli:startDate><xbrli:endDate>2025-05-11</xbrli:endDate></xbrli:period></xbrli:context>
<ix:nonFraction unitRef="USD" name="${REVENUE_CONCEPT}" contextRef="current_typed_noise" scale="6">1</ix:nonFraction>
<ix:nonFraction unitRef="USD" name="${REVENUE_CONCEPT}" contextRef="previous_typed_noise" scale="6">1</ix:nonFraction>
<ix:nonFraction unitRef="USD" name="us-gaap:OperatingIncomeLoss" contextRef="current_typed_noise" scale="6">1</ix:nonFraction>
<ix:nonFraction unitRef="USD" name="us-gaap:OperatingIncomeLoss" contextRef="previous_typed_noise" scale="6">1</ix:nonFraction>
</body>`,
  );
}

function parseCostAsUnknown(html, overrides = {}) {
  return parseGenericSecBusinessComposition({
    symbol: 'CLIENTCO',
    fiscalDate: '2026-05-10',
    html,
    filing: {
      cik: '909832',
      accession: '0000909832-26-000051',
      form: '10-Q',
      documentType: 'PRIMARY',
    },
    ...overrides,
  });
}

test('generic SEC fallback can be attempted for normalized customer stock symbols', () => {
  assert.equal(canAttemptGenericSecBusinessComposition('clientco'), true);
  assert.equal(canAttemptGenericSecBusinessComposition('BRK.B.US'), true);
  assert.equal(canAttemptGenericSecBusinessComposition(''), false);
  assert.equal(canAttemptGenericSecBusinessComposition('../bad'), false);
});

test('unknown symbol gets a reconciled business section from an exact USD 10-Q', async () => {
  const parsed = parseCostAsUnknown(
    withUsdFactsAndFiscalFocus(await costFixture()),
  );

  assert.equal(parsed.status, 'partial');
  assert.equal(parsed.currency, 'USD');
  assert.deepEqual(parsed.period, {
    start: '2026-02-16',
    end: '2026-05-10',
    fiscalYear: '2026',
    fiscalPeriod: 'Q3',
  });
  assert.deepEqual(parsed.sections.reportSegments.items.map((item) => [
    item.id,
    item.label,
    item.labelZh,
    item.revenue,
    item.previousRevenue,
  ]), [
    ['united-states', 'United States', '', 51_434_000_000, 46_318_000_000],
    ['canada', 'Canada', '', 9_410_000_000, 8_321_000_000],
    ['other-international', 'Other International', '', 9_683_000_000, 8_566_000_000],
  ]);
  assert.equal(
    parsed.sections.reportSegments.items.reduce((sum, item) => sum + item.revenue, 0),
    70_527_000_000,
  );
  assert.deepEqual(parsed.sections.revenueBreakdown, {
    status: 'unavailable',
    reason: 'ambiguous-revenue-hierarchy',
    items: [],
  });
  assert.deepEqual(parsed.sections.geographies, {
    status: 'unavailable',
    reason: 'missing-supported-axis-facts',
    items: [],
  });
  assert.deepEqual(parsed.sourceMetadata, {
    provider: 'SEC',
    adapterId: 'generic-sec-inline-xbrl-v2',
    evidence: 'official-primary-inline-xbrl',
    cik: '0000909832',
    accession: '0000909832-26-000051',
    form: '10-Q',
  });
});

test('verified segment revenue remains available when profit needs an undisclosed reconciliation', async () => {
  const examples = [
    {
      fixture: 'meta-2026q1.html',
      fiscalDate: '2026-03-31',
      cik: '1326801',
    },
    {
      fixture: 'amd-2026q2.html',
      fiscalDate: '2026-06-27',
      cik: '2488',
    },
  ];

  for (const example of examples) {
    const parsed = parseGenericSecBusinessComposition({
      symbol: 'ANOTHERCLIENT',
      fiscalDate: example.fiscalDate,
      html: withUsdFacts(
        await readFile(new URL(example.fixture, fixtureRoot), 'utf8'),
      ),
      filing: {
        cik: example.cik,
        form: '10-Q',
        documentType: 'PRIMARY',
      },
    });
    const section = parsed.sections.reportSegments;
    assert.equal(section.status, 'complete');
    assert.ok(section.items.length >= 2);
    assert.equal(section.items.reduce((sum, item) => sum + item.revenue, 0), parsed.totalRevenue);
    assert.ok(section.items.every((item) => item.profit === null && item.previousProfit === null));
    assert.equal(section.metricStatus.profit.reason, 'operating-income-not-disclosed');
  }
});

test('standard profit-only consolidation item exactly reconciles reportable segments', async () => {
  const parsed = parseCostAsUnknown(withProfitOnlyReconciliation(
    withUsdFactsAndFiscalFocus(await costFixture()),
  ));

  assert.equal(parsed.sections.reportSegments.status, 'complete');
  assert.equal(parsed.sections.reportSegments.items.length, 3);
  assert.deepEqual(parsed.sections.reportSegments.reconciliation, {
    id: 'corporate-non-segment',
    label: 'Corporate Non Segment',
    labelZh: '',
    revenue: 0,
    previousRevenue: 0,
    profitMetric: 'operatingIncome',
    profit: -100_000_000,
    previousProfit: -100_000_000,
  });
  assert.equal(
    parsed.sections.reportSegments.items.reduce((sum, item) => sum + item.profit, 0)
      + parsed.sections.reportSegments.reconciliation.profit,
    2_715_000_000,
  );
  assert.equal(
    parsed.sections.reportSegments.items.reduce(
      (sum, item) => sum + item.previousProfit,
      0,
    ) + parsed.sections.reportSegments.reconciliation.previousProfit,
    2_430_000_000,
  );
});

test('unsupported typed dimensions are skipped locally without poisoning standard axes', async () => {
  const parsed = parseCostAsUnknown(withTypedMemberNoise(
    withUsdFactsAndFiscalFocus(await costFixture()),
  ));

  assert.equal(parsed.sections.reportSegments.status, 'complete');
  assert.equal(parsed.sections.reportSegments.items.length, 3);
});

test('product subtotal hierarchy with two exact reconciliation solutions fails closed', async () => {
  const parsed = parseCostAsUnknown(
    withUsdFactsAndFiscalFocus(await costFixture()),
  );

  // Net sales + membership fees and the four merchandise categories +
  // membership fees are both exact in both years, so choosing a level would
  // be an unsupported guess.
  assert.equal(parsed.sections.revenueBreakdown.status, 'unavailable');
  assert.deepEqual(parsed.sections.revenueBreakdown.items, []);
});

test('CIK, document period, filing form, primary-document, and USD checks are exact', async () => {
  const compact = await costFixture();
  const html = withUsdFactsAndFiscalFocus(compact);

  assert.equal(parseCostAsUnknown(html, {
    filing: { cik: '909833', form: '10-Q', documentType: 'PRIMARY' },
  }), null);
  assert.equal(parseCostAsUnknown(html, { fiscalDate: '2026-05-11' }), null);
  assert.equal(parseCostAsUnknown(html, {
    filing: { cik: '909832', form: '8-K', documentType: 'PRIMARY' },
  }), null);
  assert.equal(parseCostAsUnknown(html, {
    filing: { cik: '909832', form: '10-Q', documentType: 'EX-99.1' },
  }), null);
  assert.equal(parseCostAsUnknown(html, {
    filing: { cik: '909832', form: '10-Q' },
  }), null);
  const withoutUsd = compact.replace(/<xbrli:unit\b[^>]*>[\s\S]*?<\/xbrli:unit>/g, '')
    .replace(/\sunitRef="[^"]+"/g, '');
  assert.equal(parseCostAsUnknown(withoutUsd), null);
});

test('a conflicting preferred revenue concept cannot be bypassed by another concept', async () => {
  const base = withUsdFactsAndFiscalFocus(await costFixture());
  const revenueFacts = Array.from(base.matchAll(
    /<ix:nonFraction\b(?=[^>]*name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax")[\s\S]*?<\/ix:nonFraction>/g,
  )).map((match) => match[0]);
  const alternativeConceptFacts = revenueFacts
    .map((fact) => fact.replaceAll(REVENUE_CONCEPT, 'us-gaap:Revenues'))
    .join('\n');
  const html = base.replace(
    '</body>',
    `${alternativeConceptFacts}
<ix:nonFraction unitRef="USD" name="${REVENUE_CONCEPT}" contextRef="current" scale="6">70,528</ix:nonFraction>
</body>`,
  );

  assert.equal(parseCostAsUnknown(html), null);
});

test('conflicting dimensional revenue facts make only that section unavailable', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    '</body>',
    `<ix:nonFraction unitRef="USD" name="${REVENUE_CONCEPT}" contextRef="current_us" scale="6">51,435</ix:nonFraction>
</body>`,
  );
  const parsed = parseCostAsUnknown(html);

  assert.ok(parsed);
  assert.equal(parsed.status, 'unavailable');
  assert.deepEqual(parsed.sections.reportSegments, {
    status: 'unavailable',
    reason: 'conflicting-dimensional-revenue',
    items: [],
  });
});

test('changed prior dimension maps do not invent comparisons or hide verified current revenue', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    '<xbrldi:explicitMember dimension="srt:ConsolidationItemsAxis">us-gaap:OperatingSegmentsMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cost:UnitedStatesMember</xbrldi:explicitMember>',
    '<xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cost:UnitedStatesMember</xbrldi:explicitMember>',
  );
  const parsed = parseCostAsUnknown(html);

  assert.ok(parsed);
  assert.equal(parsed.sections.reportSegments.status, 'complete');
  assert.ok(parsed.sections.reportSegments.items.every((item) => item.previousRevenue === null));
  assert.ok(parsed.sections.reportSegments.items.every((item) => item.previousProfit === null));
});

test('conflicting DEI identity and consolidated facts fail the document', async () => {
  const base = withUsdFactsAndFiscalFocus(await costFixture());
  const duplicatedIdentity = base.replace(
    '</body>',
    '<ix:nonNumeric name="dei:EntityCentralIndexKey">0000909833</ix:nonNumeric></body>',
  );
  const duplicatedTotal = base.replace(
    '</body>',
    `<ix:nonFraction unitRef="USD" name="${REVENUE_CONCEPT}" contextRef="current" scale="6">70,528</ix:nonFraction></body>`,
  );

  assert.equal(parseCostAsUnknown(duplicatedIdentity), null);
  assert.equal(parseCostAsUnknown(duplicatedTotal), null);
});

test('missing operating income never suppresses uniquely reconciled revenue or becomes zero', async () => {
  const base = withUsdFactsAndFiscalFocus(await costFixture());
  const html = base.replace(
    /<ix:nonFraction\b(?=[^>]*name="us-gaap:OperatingIncomeLoss")[\s\S]*?<\/ix:nonFraction>/g,
    '',
  );
  const parsed = parseCostAsUnknown(html);
  const section = parsed.sections.reportSegments;
  assert.equal(section.status, 'complete');
  assert.equal(parsed.totalRevenue, 70_527_000_000);
  assert.equal(parsed.previousTotalRevenue, 63_205_000_000);
  assert.deepEqual(section.metricStatus.profit, {
    status: 'unavailable', reason: 'operating-income-not-disclosed',
  });
  assert.ok(section.items.every((item) => item.profit === null && item.previousProfit === null));
  assert.ok(section.items.every((item) => item.revenue > 0 && item.previousRevenue > 0));
  assert.equal(section.reconciliation, undefined);
});

test('missing prior quarter permits current-only revenue and never copies current into prior', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    /<ix:nonFraction\b(?=[^>]*contextRef="previous[^"]*")[\s\S]*?<\/ix:nonFraction>/g,
    '',
  );
  const parsed = parseCostAsUnknown(html);
  const section = parsed.sections.reportSegments;
  assert.equal(section.status, 'complete');
  assert.equal(parsed.previousTotalRevenue, null);
  assert.equal(section.items.reduce((sum, item) => sum + item.revenue, 0), parsed.totalRevenue);
  assert.ok(section.items.every((item) => item.previousRevenue === null && item.previousProfit === null));
  assert.ok(section.items.every((item) => item.profit > 0));
  assert.equal(section.metricStatus.previousRevenue.status, 'unavailable');
  assert.equal(parsed.sections.revenueBreakdown.reason, 'ambiguous-revenue-hierarchy');
});

test('an operating-income total mismatch blanks profit only, including the reconciliation row', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    'name="us-gaap:OperatingIncomeLoss" contextRef="current" scale="6">2,815',
    'name="us-gaap:OperatingIncomeLoss" contextRef="current" scale="6">2,715',
  );
  const section = parseCostAsUnknown(html).sections.reportSegments;
  assert.equal(section.status, 'complete');
  assert.equal(section.metricStatus.profit.reason, 'operating-income-reconciliation-failed');
  assert.ok(section.items.every((item) => item.profit === null));
  assert.ok(section.items.every((item) => item.previousProfit !== null));
  assert.equal(section.reconciliation, undefined);
});

test('one missing prior member disables the entire comparison, not the current structure', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    /<ix:nonFraction\b(?=[^>]*contextRef="previous_us")[\s\S]*?<\/ix:nonFraction>/g,
    '',
  );
  const section = parseCostAsUnknown(html).sections.reportSegments;
  assert.equal(section.status, 'complete');
  assert.equal(section.items.length, 3);
  assert.ok(section.items.every((item) => item.previousRevenue === null && item.previousProfit === null));
});

test('prior revenue non-reconciliation keeps verified current data but suppresses all prior values', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    'name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="previous_us" scale="6">46,318',
    'name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="previous_us" scale="6">46,317',
  );
  const section = parseCostAsUnknown(html).sections.reportSegments;
  assert.equal(section.status, 'complete');
  assert.ok(section.items.every((item) => item.previousRevenue === null));
  assert.equal(section.metricStatus.previousRevenue.reason, 'prior-revenue-unavailable-or-not-comparable');
});

test('conflicting prior facts still fail closed rather than being treated as absent', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    '</body>',
    `<ix:nonFraction unitRef="USD" name="${REVENUE_CONCEPT}" contextRef="previous_us" scale="6">46,317</ix:nonFraction></body>`,
  );
  const section = parseCostAsUnknown(html).sections.reportSegments;
  assert.equal(section.status, 'unavailable');
  assert.equal(section.reason, 'conflicting-dimensional-revenue');
  assert.deepEqual(section.items, []);
});

test('a wrong current segment total cannot be rescued by valid profit or prior revenue', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    'name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="current_us" scale="6">51,434',
    'name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="current_us" scale="6">51,435',
  );
  const section = parseCostAsUnknown(html).sections.reportSegments;
  assert.equal(section.status, 'unavailable');
  assert.equal(section.reason, 'revenue-reconciliation-failed');
});

test('only explicit DEI Q4 with directly disclosed quarter facts is accepted from 10-K', async () => {
  const quarterly = withUsdFactsAndFiscalFocus(await costFixture())
    .replace('name="dei:DocumentType">10-Q', 'name="dei:DocumentType">10-K')
    .replace('name="dei:DocumentFiscalPeriodFocus">Q3', 'name="dei:DocumentFiscalPeriodFocus">Q4')
    .replace('May 10, 2026', 'December 31, 2026')
    .replaceAll('2026-02-16', '2026-10-01')
    .replaceAll('2026-05-10', '2026-12-31')
    .replaceAll('2025-02-17', '2025-10-01')
    .replaceAll('2025-05-11', '2025-12-31');
  const options = {
    symbol: 'CLIENTCO', fiscalDate: '2026-12-31', html: quarterly,
    filing: { cik: '909832', form: '10-K', documentType: 'PRIMARY' },
  };
  const parsed = parseGenericSecBusinessComposition(options);
  assert.equal(parsed.sections.reportSegments.status, 'complete');
  assert.equal(parsed.period.start, '2026-10-01');
  assert.equal(parsed.period.end, '2026-12-31');
  assert.equal(parsed.period.fiscalPeriod, 'Q4');
  assert.equal(parsed.sourceMetadata.form, '10-K');

  const annualFocus = inspectGenericSecBusinessComposition({
    ...options, html: quarterly.replace('name="dei:DocumentFiscalPeriodFocus">Q4', 'name="dei:DocumentFiscalPeriodFocus">FY'),
  });
  assert.equal(annualFocus.result, null);
  assert.equal(annualFocus.reason, 'annual-filing-without-explicit-quarter');
  const annualFacts = inspectGenericSecBusinessComposition({
    ...options, html: quarterly.replaceAll('2026-10-01', '2026-01-01').replaceAll('2025-10-01', '2025-01-01'),
  });
  assert.equal(annualFacts.result, null);
  assert.equal(annualFacts.reason, 'missing-exact-usd-quarter-revenue');
});

test('document-level diagnostics distinguish unsupported filings, currency, period and ambiguity', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture());
  const base = {
    symbol: 'CLIENTCO', fiscalDate: '2026-05-10', html,
    filing: { cik: '909832', form: '10-Q', documentType: 'PRIMARY' },
  };
  assert.deepEqual(inspectGenericSecBusinessComposition({ ...base, filing: { ...base.filing, form: '6-K' } }), {
    result: null, reason: 'unsupported-filing-form',
  });
  assert.deepEqual(inspectGenericSecBusinessComposition({ ...base, filing: { ...base.filing, documentType: 'EX-99.1' } }), {
    result: null, reason: 'unsupported-document-type',
  });
  assert.deepEqual(inspectGenericSecBusinessComposition({ ...base, fiscalDate: '2026-05-11' }), {
    result: null, reason: 'document-identity-or-period-mismatch',
  });
  assert.deepEqual(inspectGenericSecBusinessComposition({ ...base, html: html.replaceAll('iso4217:USD', 'iso4217:EUR') }), {
    result: null, reason: 'missing-exact-usd-quarter-revenue',
  });
  const duplicateTotal = html.replace('</body>', `<ix:nonFraction unitRef="USD" name="${REVENUE_CONCEPT}" contextRef="current" scale="6">70,528</ix:nonFraction></body>`);
  assert.equal(inspectGenericSecBusinessComposition({ ...base, html: duplicateTotal }).reason, 'conflicting-current-quarter-revenue');
});

test('company custom axes remain unsupported without verified taxonomy relationships', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replaceAll(
    'us-gaap:StatementBusinessSegmentsAxis', 'cost:CompanyOperatingSegmentsAxis',
  );
  const section = parseCostAsUnknown(html).sections.reportSegments;
  assert.equal(section.status, 'unavailable');
  assert.equal(section.reason, 'missing-supported-axis-facts');
});

test('every participating context requires exactly one matching SEC entity identifier', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture());
  const identifier = '<xbrli:identifier scheme="http://www.sec.gov/CIK">0000909832</xbrli:identifier>';
  const invalidContexts = [
    html.replaceAll(identifier, '<xbrli:identifier scheme="http://www.sec.gov/CIK">0000123456</xbrli:identifier>'),
    html.replaceAll(identifier, ''),
    html.replaceAll(identifier, identifier + identifier),
    html.replaceAll(identifier, identifier.replace('http://www.sec.gov/CIK', 'https://example.org/company')),
    html.replaceAll(identifier, '').replaceAll('<xbrli:context ', identifier + '<xbrli:context '),
  ];
  for (const source of invalidContexts) {
    assert.ok(source.includes('name="dei:EntityCentralIndexKey">0000909832<'));
    assert.equal(parseCostAsUnknown(source), null);
  }
});

test('wrong-company component contexts cannot complete this issuer revenue structure', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    /(<xbrli:context id="current_us">[\s\S]*?<xbrli:identifier[^>]*>)0000909832/,
    '$10000123456',
  );
  const parsed = parseCostAsUnknown(html);
  assert.ok(parsed);
  assert.equal(parsed.sections.reportSegments.status, 'unavailable');
  assert.deepEqual(parsed.sections.reportSegments.items, []);
});

test('unrelated entity facts are ignored without poisoning validated issuer contexts', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture());
  const source = html.replace('</body>', `<xbrli:context id="foreign_company"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000123456</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cost:UnitedStatesMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2026-02-16</xbrli:startDate><xbrli:endDate>2026-05-10</xbrli:endDate></xbrli:period></xbrli:context><ix:nonFraction unitRef="USD" name="${REVENUE_CONCEPT}" contextRef="foreign_company" scale="6">51,435</ix:nonFraction></body>`);
  const parsed = parseCostAsUnknown(source);
  assert.equal(parsed.sections.reportSegments.status, 'complete');
  assert.equal(parsed.sections.reportSegments.items[0].revenue, 51_434_000_000);
});

test('skipped wrong-entity or typed contexts still reserve their id against duplicates', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture());
  const current = html.match(/<xbrli:context id="current">[\s\S]*?<\/xbrli:context>/)?.[0];
  assert.ok(current);
  for (const invalidContext of [
    current.replace('0000909832</xbrli:identifier>', '0000123456</xbrli:identifier>'),
    current.replace('</xbrli:entity>', '<xbrli:segment><xbrldi:typedMember dimension="test:CustomerAxis"><test:CustomerDomain>X</test:CustomerDomain></xbrldi:typedMember></xbrli:segment></xbrli:entity>'),
  ]) {
    const inspected = inspectGenericSecBusinessComposition({
      symbol: 'CLIENTCO', fiscalDate: '2026-05-10', html: html.replace('<body>', `<body>${invalidContext}`),
      filing: { cik: '909832', form: '10-Q', documentType: 'PRIMARY' },
    });
    assert.deepEqual(inspected, { result: null, reason: 'malformed-inline-xbrl' });
  }
});
