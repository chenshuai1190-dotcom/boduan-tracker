import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  canAttemptGenericSecBusinessComposition,
  parseGenericSecBusinessComposition,
} from '../server/earnings/secGenericBusinessComposition.js';

const fixtureRoot = new URL('./fixtures/sec-us-holding-business/', import.meta.url);
const REVENUE_CONCEPT = 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax';

async function costFixture() {
  return readFile(new URL('cost-2026q3.html', fixtureRoot), 'utf8');
}

function withUsdFacts(html) {
  return html
    .replace(
      '<body>',
      '<body><xbrli:unit id="USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>',
    )
    .replaceAll('<ix:nonFraction ', '<ix:nonFraction unitRef="USD" ');
}

function withUsdFactsAndFiscalFocus(html) {
  return withUsdFacts(html).replace(
    '</xbrli:unit>',
    `</xbrli:unit>
<ix:nonNumeric name="dei:DocumentFiscalYearFocus">2026</ix:nonNumeric>
<ix:nonNumeric name="dei:DocumentFiscalPeriodFocus">Q3</ix:nonNumeric>`,
  );
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
      `<xbrli:context id="current_corporate"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="srt:ConsolidationItemsAxis">us-gaap:CorporateNonSegmentMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2026-02-16</xbrli:startDate><xbrli:endDate>2026-05-10</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="previous_corporate"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="srt:ConsolidationItemsAxis">us-gaap:CorporateNonSegmentMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-02-17</xbrli:startDate><xbrli:endDate>2025-05-11</xbrli:endDate></xbrli:period></xbrli:context>
<ix:nonFraction unitRef="USD" name="us-gaap:OperatingIncomeLoss" contextRef="current_corporate" scale="6" sign="-">100</ix:nonFraction>
<ix:nonFraction unitRef="USD" name="us-gaap:OperatingIncomeLoss" contextRef="previous_corporate" scale="6" sign="-">100</ix:nonFraction>
</body>`,
    );
}

function withTypedMemberNoise(html) {
  return html.replace(
    '</body>',
    `<xbrli:context id="current_typed_noise"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cost:UnitedStatesMember</xbrldi:explicitMember><xbrldi:typedMember dimension="test:CustomerAxis"><test:CustomerDomain>Noise</test:CustomerDomain></xbrldi:typedMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2026-02-16</xbrli:startDate><xbrli:endDate>2026-05-10</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="previous_typed_noise"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cost:UnitedStatesMember</xbrldi:explicitMember><xbrldi:typedMember dimension="test:CustomerAxis"><test:CustomerDomain>Noise</test:CustomerDomain></xbrldi:typedMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-02-17</xbrli:startDate><xbrli:endDate>2025-05-11</xbrli:endDate></xbrli:period></xbrli:context>
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
    reason: 'ambiguous-or-missing-xbrl-facts',
    items: [],
  });
  assert.deepEqual(parsed.sections.geographies, {
    status: 'unavailable',
    reason: 'ambiguous-or-missing-xbrl-facts',
    items: [],
  });
  assert.deepEqual(parsed.sourceMetadata, {
    provider: 'SEC',
    adapterId: 'generic-sec-inline-xbrl-v1',
    evidence: 'official-primary-inline-xbrl',
    cik: '0000909832',
    accession: '0000909832-26-000051',
    form: '10-Q',
  });
});

test('generic segments fail closed when consolidated profit needs an undisclosed reconciliation', async () => {
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
    assert.equal(parsed.sections.reportSegments.status, 'unavailable');
    assert.deepEqual(parsed.sections.reportSegments.items, []);
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
  assert.equal(parseCostAsUnknown(compact), null);
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
    reason: 'ambiguous-or-missing-xbrl-facts',
    items: [],
  });
});

test('current and prior facts must match the entire dimension map', async () => {
  const html = withUsdFactsAndFiscalFocus(await costFixture()).replace(
    '<xbrldi:explicitMember dimension="srt:ConsolidationItemsAxis">us-gaap:OperatingSegmentsMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cost:UnitedStatesMember</xbrldi:explicitMember>',
    '<xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cost:UnitedStatesMember</xbrldi:explicitMember>',
  );
  const parsed = parseCostAsUnknown(html);

  assert.ok(parsed);
  assert.equal(parsed.sections.reportSegments.status, 'unavailable');
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
