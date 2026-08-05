import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  hasSecUsHoldingBusinessAdapter,
  parseSecUsHoldingBusinessDocument,
} from '../server/earnings/secUsHoldingBusinessAdapters.js';

const fixtureRoot = new URL('./fixtures/sec-us-holding-business/', import.meta.url);

async function fixture(name) {
  return readFile(new URL(name, fixtureRoot), 'utf8');
}

function revenueTotal(items, field = 'revenue') {
  return items.reduce((sum, item) => sum + item[field], 0);
}

test('adapter registry covers the current US ordinary-company holdings and IBKR', () => {
  assert.equal(hasSecUsHoldingBusinessAdapter('AMD'), true);
  assert.equal(hasSecUsHoldingBusinessAdapter('META'), true);
  assert.equal(hasSecUsHoldingBusinessAdapter('msft.us'), true);
  assert.equal(hasSecUsHoldingBusinessAdapter('IBKR'), true);
  assert.equal(hasSecUsHoldingBusinessAdapter('NOK'), false);
  assert.equal(hasSecUsHoldingBusinessAdapter('TQQQ'), false);
});

test('AMD official Q2 10-Q returns reconciled segments and disjoint product revenue', async () => {
  const parsed = parseSecUsHoldingBusinessDocument({
    symbol: 'AMD',
    // The calendar provider uses the calendar-quarter date while AMD's official
    // 10-Q is based on its Saturday fiscal-quarter end.
    fiscalDate: '2026-06-30',
    html: await fixture('amd-2026q2.html'),
    filing: {
      cik: '2488',
      accession: '0000002488-26-000123',
      form: '10-Q',
    },
  });

  assert.equal(parsed.status, 'partial');
  assert.deepEqual(parsed.period, {
    start: '2026-03-29',
    end: '2026-06-27',
  });
  assert.equal(parsed.sections.reportSegments.status, 'complete');
  assert.deepEqual(parsed.sections.reportSegments.items.map((item) => [
    item.id,
    item.revenue,
    item.previousRevenue,
    item.profit,
    item.previousProfit,
  ]), [
    ['data-center', 6_718_000_000, 3_240_000_000, 2_103_000_000, -155_000_000],
    ['client-and-gaming', 3_841_000_000, 3_621_000_000, 582_000_000, 767_000_000],
    ['embedded', 977_000_000, 824_000_000, 386_000_000, 275_000_000],
  ]);
  assert.deepEqual(parsed.sections.revenueBreakdown.items.map((item) => [
    item.id,
    item.revenue,
    item.previousRevenue,
    item.parentId,
  ]), [
    ['data-center', 6_718_000_000, 3_240_000_000, 'data-center'],
    ['client', 3_062_000_000, 2_499_000_000, 'client-and-gaming'],
    ['gaming', 779_000_000, 1_122_000_000, 'client-and-gaming'],
    ['embedded', 977_000_000, 824_000_000, 'embedded'],
  ]);
  assert.equal(revenueTotal(parsed.sections.reportSegments.items), 11_536_000_000);
  assert.equal(revenueTotal(parsed.sections.revenueBreakdown.items), 11_536_000_000);
  assert.deepEqual(parsed.sections.geographies, {
    status: 'unavailable',
    reason: 'quarterly-geography-not-disclosed',
    items: [],
  });
  assert.deepEqual(parsed.sourceMetadata, {
    provider: 'SEC',
    adapterId: 'advanced-micro-devices-inline-xbrl',
    evidence: 'official-primary-inline-xbrl',
    cik: '0000002488',
    accession: '0000002488-26-000123',
    form: '10-Q',
  });
});

test('META official 10-Q returns reconciled segments, revenue mix, and geographies', async () => {
  const parsed = parseSecUsHoldingBusinessDocument({
    symbol: 'META',
    fiscalDate: '2026-03-31',
    html: await fixture('meta-2026q1.html'),
    filing: {
      cik: '0001326801',
      accession: '0001628280-26-028526',
      form: '10-Q',
    },
  });

  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.currency, 'USD');
  assert.deepEqual(parsed.period, {
    start: '2026-01-01',
    end: '2026-03-31',
  });
  assert.deepEqual(
    Object.fromEntries(Object.entries(parsed.sections).map(([key, section]) => [
      key,
      [section.status, section.items.length],
    ])),
    {
      reportSegments: ['complete', 2],
      revenueBreakdown: ['complete', 3],
      geographies: ['complete', 4],
    },
  );
  assert.equal(revenueTotal(parsed.sections.reportSegments.items), 56_311_000_000);
  assert.equal(revenueTotal(parsed.sections.reportSegments.items, 'previousRevenue'), 42_314_000_000);
  assert.equal(revenueTotal(parsed.sections.revenueBreakdown.items), 56_311_000_000);
  assert.equal(revenueTotal(parsed.sections.geographies.items), 56_311_000_000);
  assert.deepEqual(parsed.sections.reportSegments.items[1], {
    id: 'reality-labs',
    label: 'Reality Labs',
    labelZh: '现实实验室',
    revenue: 402_000_000,
    previousRevenue: 412_000_000,
    profitMetric: 'operatingIncome',
    profit: -4_028_000_000,
    previousProfit: -4_210_000_000,
  });
  assert.deepEqual(parsed.sourceMetadata, {
    provider: 'SEC',
    adapterId: 'meta-inline-xbrl',
    evidence: 'official-primary-inline-xbrl',
    cik: '0001326801',
    accession: '0001628280-26-028526',
    form: '10-Q',
  });
});

test('META fails only the non-reconciling business-mix section', async () => {
  const html = (await fixture('meta-2026q1.html')).replace(
    'contextRef="current_ads" scale="6">55,024',
    'contextRef="current_ads" scale="6">55,025',
  );
  const parsed = parseSecUsHoldingBusinessDocument({
    symbol: 'META',
    fiscalDate: '2026-03-31',
    html,
    filing: { cik: '1326801', form: '10-Q' },
  });

  assert.equal(parsed.status, 'partial');
  assert.equal(parsed.sections.reportSegments.status, 'complete');
  assert.deepEqual(parsed.sections.revenueBreakdown, {
    status: 'unavailable',
    reason: 'ambiguous-or-missing-xbrl-facts',
    items: [],
  });
  assert.equal(parsed.sections.geographies.status, 'complete');
});

test('MSFT official 10-Q returns three reportable segments and ten disjoint revenue lines', () => {
  const parsed = parseSecUsHoldingBusinessDocument({
    symbol: 'MSFT',
    fiscalDate: '2026-03-31',
    html: microsoftFixture(),
    filing: {
      cik: '789019',
      accession: '0001193125-26-191507',
      form: '10-Q',
    },
  });

  assert.equal(parsed.status, 'partial');
  assert.deepEqual(parsed.period, {
    start: '2026-01-01',
    end: '2026-03-31',
  });
  assert.equal(parsed.sections.reportSegments.status, 'complete');
  assert.equal(parsed.sections.reportSegments.items.length, 3);
  assert.equal(parsed.sections.revenueBreakdown.status, 'complete');
  assert.equal(parsed.sections.revenueBreakdown.items.length, 10);
  assert.deepEqual(parsed.sections.geographies, {
    status: 'unavailable',
    reason: 'quarterly-geography-not-disclosed',
    items: [],
  });
  assert.equal(revenueTotal(parsed.sections.reportSegments.items), 82_886_000_000);
  assert.equal(revenueTotal(parsed.sections.reportSegments.items, 'previousRevenue'), 70_066_000_000);
  assert.equal(revenueTotal(parsed.sections.revenueBreakdown.items), 82_886_000_000);
  assert.equal(revenueTotal(parsed.sections.revenueBreakdown.items, 'previousRevenue'), 70_066_000_000);
  assert.deepEqual(parsed.sections.revenueBreakdown.items[0], {
    id: 'server-cloud',
    label: 'Server products and cloud services',
    labelZh: '服务器产品和云服务',
    revenue: 32_592_000_000,
    previousRevenue: 24_761_000_000,
    parentId: 'intelligent-cloud',
  });
  assert.equal(parsed.sourceMetadata.adapterId, 'microsoft-inline-xbrl');
  assert.equal(parsed.sourceMetadata.accession, '0001193125-26-191507');
});

test('MSFT official Q4 8-K exhibit returns quarterly segments without annual product data', async () => {
  const parsed = parseSecUsHoldingBusinessDocument({
    symbol: 'MSFT',
    fiscalDate: '2026-06-30',
    html: await fixture('msft-2026q4-exhibit.html'),
    filing: {
      cik: '0000789019',
      accession: '0001193125-26-323632',
      form: '8-K',
    },
  });

  assert.equal(parsed.status, 'partial');
  assert.deepEqual(parsed.period, {
    start: '2026-04-01',
    end: '2026-06-30',
  });
  assert.deepEqual(parsed.sections.reportSegments.items.map((item) => [
    item.id,
    item.revenue,
    item.previousRevenue,
    item.profit,
    item.previousProfit,
  ]), [
    ['productivity-business-processes', 37_847_000_000, 33_112_000_000, 21_900_000_000, 18_993_000_000],
    ['intelligent-cloud', 39_306_000_000, 29_878_000_000, 15_955_000_000, 12_140_000_000],
    ['more-personal-computing', 12_854_000_000, 13_451_000_000, 2_748_000_000, 3_190_000_000],
  ]);
  assert.deepEqual(parsed.sections.revenueBreakdown, {
    status: 'unavailable',
    reason: 'quarterly-product-revenue-not-disclosed',
    items: [],
  });
  assert.deepEqual(parsed.sections.geographies, {
    status: 'unavailable',
    reason: 'quarterly-geography-not-disclosed',
    items: [],
  });
  assert.deepEqual(parsed.sourceMetadata, {
    provider: 'SEC',
    adapterId: 'microsoft-earnings-release',
    evidence: 'official-8-k-exhibit-99.1',
    cik: '0000789019',
    accession: '0001193125-26-323632',
    form: '8-K',
  });
});

test('MSFT Q4 exhibit fails closed when segment totals do not reconcile', async () => {
  const html = (await fixture('msft-2026q4-exhibit.html')).replace(
    'Revenue $90,007 $76,441',
    'Revenue $90,008 $76,441',
  );
  assert.equal(parseSecUsHoldingBusinessDocument({
    symbol: 'MSFT',
    fiscalDate: '2026-06-30',
    html,
    filing: { cik: '0000789019', form: '8-K' },
  }), null);
});

test('IBKR official 8-K exhibit returns a reconciled revenue mix without inventing extra segments', async () => {
  const parsed = parseSecUsHoldingBusinessDocument({
    symbol: 'IBKR',
    fiscalDate: '2026-06-30',
    html: await fixture('ibkr-2026q2-exhibit.html'),
    filing: {
      cik: '0001381197',
      accession: '0001381197-26-000118',
      form: '8-K',
    },
  });

  assert.equal(parsed.status, 'partial');
  assert.deepEqual(parsed.period, {
    start: '2026-04-01',
    end: '2026-06-30',
  });
  assert.deepEqual(parsed.sections.reportSegments, {
    status: 'unavailable',
    reason: 'single-reportable-segment',
    items: [],
  });
  assert.equal(parsed.sections.revenueBreakdown.status, 'complete');
  assert.deepEqual(parsed.sections.revenueBreakdown.items.map((item) => [
    item.id,
    item.revenue,
    item.previousRevenue,
  ]), [
    ['commissions', 673_000_000, 516_000_000],
    ['net-interest-income', 1_057_000_000, 860_000_000],
    ['other-fees-services', 87_000_000, 62_000_000],
    ['other-income', 79_000_000, 42_000_000],
  ]);
  assert.equal(revenueTotal(parsed.sections.revenueBreakdown.items), 1_896_000_000);
  assert.equal(revenueTotal(parsed.sections.revenueBreakdown.items, 'previousRevenue'), 1_480_000_000);
  assert.deepEqual(parsed.sourceMetadata, {
    provider: 'SEC',
    adapterId: 'interactive-brokers-earnings-release',
    evidence: 'official-8-k-exhibit-99.1',
    cik: '0001381197',
    accession: '0001381197-26-000118',
    form: '8-K',
  });
});

test('IBKR official 10-Q uses the same reconciled business-mix contract', () => {
  const parsed = parseSecUsHoldingBusinessDocument({
    symbol: 'IBKR',
    fiscalDate: '2026-03-31',
    html: interactiveBrokersTenQFixture(),
    filing: {
      cik: '0001381197',
      accession: '0001381197-26-000093',
      form: '10-Q',
    },
  });

  assert.equal(parsed.status, 'partial');
  assert.deepEqual(parsed.period, {
    start: '2026-01-01',
    end: '2026-03-31',
  });
  assert.equal(parsed.sections.revenueBreakdown.status, 'complete');
  assert.deepEqual(parsed.sections.revenueBreakdown.items.map((item) => [
    item.id,
    item.revenue,
    item.previousRevenue,
  ]), [
    ['commissions', 613_000_000, 514_000_000],
    ['net-interest-income', 904_000_000, 770_000_000],
    ['other-fees-services', 86_000_000, 78_000_000],
    ['other-income', 66_000_000, 65_000_000],
  ]);
  assert.equal(revenueTotal(parsed.sections.revenueBreakdown.items), 1_669_000_000);
  assert.equal(revenueTotal(parsed.sections.revenueBreakdown.items, 'previousRevenue'), 1_427_000_000);
  assert.equal(parsed.sourceMetadata.adapterId, 'interactive-brokers-inline-xbrl');
  assert.equal(parsed.sourceMetadata.evidence, 'official-primary-inline-xbrl');
});

test('all adapters fail closed on mismatched company or fiscal-period identity', async () => {
  const metaHtml = await fixture('meta-2026q1.html');
  assert.equal(parseSecUsHoldingBusinessDocument({
    symbol: 'META',
    fiscalDate: '2026-03-31',
    html: metaHtml,
    filing: { cik: '0000789019', form: '10-Q' },
  }), null);
  assert.equal(parseSecUsHoldingBusinessDocument({
    symbol: 'META',
    fiscalDate: '2026-06-30',
    html: metaHtml,
    filing: { cik: '0001326801', form: '10-Q' },
  }), null);
  assert.equal(parseSecUsHoldingBusinessDocument({
    symbol: 'IBKR',
    fiscalDate: '2026-03-31',
    html: await fixture('ibkr-2026q2-exhibit.html'),
    filing: { cik: '0001381197', form: '8-K' },
  }), null);
  const amdHtml = await fixture('amd-2026q2.html');
  assert.equal(parseSecUsHoldingBusinessDocument({
    symbol: 'AMD',
    fiscalDate: '2026-07-05',
    html: amdHtml,
    filing: { cik: '0000002488', form: '10-Q' },
  }), null);
  assert.equal(parseSecUsHoldingBusinessDocument({
    symbol: 'AMD',
    fiscalDate: '2026-06-30',
    html: amdHtml,
    filing: { cik: '0000789019', form: '10-Q' },
  }), null);
});

function microsoftFixture() {
  const current = { start: '2026-01-01', end: '2026-03-31' };
  const previous = { start: '2025-01-01', end: '2025-03-31' };
  const segments = [
    ['productivity', 'msft:ProductivityAndBusinessProcessesMember', 35_013, 29_944, 20_973, 17_379],
    ['cloud', 'msft:IntelligentCloudMember', 34_681, 26_751, 13_753, 11_095],
    ['personal', 'msft:MorePersonalComputingMember', 13_192, 13_371, 3_672, 3_526],
  ];
  const products = [
    ['server-cloud', 'msft:ServerProductsAndCloudServicesMember', 32_592, 24_761],
    ['m365-commercial', 'msft:MicrosoftThreeSixFiveCommercialProductsAndCloudServicesMember', 25_593, 21_883],
    ['gaming', 'msft:GamingMember', 5_341, 5_721],
    ['linkedin', 'msft:LinkedInCorporationMember', 4_832, 4_311],
    ['windows-devices', 'msft:WindowsAndDevicesMember', 4_041, 4_144],
    ['search', 'msft:SearchAdvertisingMember', 3_808, 3_504],
    ['m365-consumer', 'msft:MicrosoftThreeSixFiveConsumerProductsAndCloudServicesMember', 2_297, 1_821],
    ['dynamics', 'msft:DynamicsProductsAndCloudServicesMember', 2_292, 1_929],
    ['enterprise-services', 'msft:EnterpriseAndPartnerServicesMember', 2_087, 1_946],
    ['other', 'msft:OtherProductsAndServicesMember', 3, 46],
  ];
  const contexts = [
    xbrlContext('current', current),
    xbrlContext('previous', previous),
  ];
  const facts = [
    xbrlFact('us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', 'current', 82_886),
    xbrlFact('us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', 'previous', 70_066),
  ];

  for (const [id, member, revenue, previousRevenue, profit, previousProfit] of segments) {
    const currentId = `current_${id}`;
    const previousId = `previous_${id}`;
    const members = { 'us-gaap:StatementBusinessSegmentsAxis': member };
    contexts.push(xbrlContext(currentId, current, members));
    contexts.push(xbrlContext(previousId, previous, members));
    facts.push(
      xbrlFact('us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', currentId, revenue),
      xbrlFact('us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', previousId, previousRevenue),
      xbrlFact('us-gaap:OperatingIncomeLoss', currentId, profit),
      xbrlFact('us-gaap:OperatingIncomeLoss', previousId, previousProfit),
    );
  }
  for (const [id, member, revenue, previousRevenue] of products) {
    const currentId = `current_${id}`;
    const previousId = `previous_${id}`;
    const members = { 'srt:ProductOrServiceAxis': member };
    contexts.push(xbrlContext(currentId, current, members));
    contexts.push(xbrlContext(previousId, previous, members));
    facts.push(
      xbrlFact('us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', currentId, revenue),
      xbrlFact('us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', previousId, previousRevenue),
    );
  }

  return [
    '<!doctype html><html><body>',
    '<ix:nonNumeric name="dei:DocumentType">10- Q</ix:nonNumeric>',
    '<ix:nonNumeric name="dei:DocumentPeriodEndDate">March 31, 2026</ix:nonNumeric>',
    '<ix:nonNumeric name="dei:EntityCentralIndexKey">0000789019</ix:nonNumeric>',
    ...contexts,
    ...facts,
    '</body></html>',
  ].join('');
}

function interactiveBrokersTenQFixture() {
  const current = { start: '2026-01-01', end: '2026-03-31' };
  const previous = { start: '2025-01-01', end: '2025-03-31' };
  const rows = [
    ['us-gaap:BrokerageCommissionsRevenue', 613, 514],
    ['us-gaap:InterestIncomeExpenseNet', 904, 770],
    ['ibkr:OtherFeesAndServices', 86, 78],
    ['ibkr:OtherIncomeLoss', 66, 65],
    ['us-gaap:RevenuesNetOfInterestExpense', 1_669, 1_427],
  ];
  return [
    '<!doctype html><html><body>',
    '<ix:nonNumeric name="dei:DocumentType">10-Q</ix:nonNumeric>',
    '<ix:nonNumeric name="dei:DocumentPeriodEndDate">March 31, 2026</ix:nonNumeric>',
    '<ix:nonNumeric name="dei:EntityCentralIndexKey">0001381197</ix:nonNumeric>',
    xbrlContext('current', current),
    xbrlContext('previous', previous),
    ...rows.flatMap(([concept, currentValue, previousValue]) => [
      xbrlFact(concept, 'current', currentValue),
      xbrlFact(concept, 'previous', previousValue),
    ]),
    '</body></html>',
  ].join('');
}

function xbrlContext(id, period, members = {}) {
  const memberMarkup = Object.entries(members)
    .map(([dimension, member]) => (
      `<xbrldi:explicitMember dimension="${dimension}">${member}</xbrldi:explicitMember>`
    ))
    .join('');
  return [
    `<xbrli:context id="${id}">`,
    memberMarkup
      ? `<xbrli:entity><xbrli:segment>${memberMarkup}</xbrli:segment></xbrli:entity>`
      : '',
    '<xbrli:period>',
    `<xbrli:startDate>${period.start}</xbrli:startDate>`,
    `<xbrli:endDate>${period.end}</xbrli:endDate>`,
    '</xbrli:period>',
    '</xbrli:context>',
  ].join('');
}

function xbrlFact(concept, contextRef, valueInMillions) {
  return `<ix:nonFraction name="${concept}" contextRef="${contextRef}" scale="6">${valueInMillions.toLocaleString('en-US')}</ix:nonFraction>`;
}
