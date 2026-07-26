import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildSecFinancialHistory,
  fetchSecFinancialHistory,
  SEC_FINANCIAL_HISTORY_SCHEMA_VERSION,
} from '../server/earnings/secFinancialHistory.js';
import {
  clearSecOfficialCachesForTests,
  fetchSecCompanyFactsSource,
} from '../server/earnings/secOfficialActuals.js';

const fixtureUrl = new URL(
  './fixtures/sec-financial-history/acme-companyfacts.json',
  import.meta.url,
);
const ALPHABET_CIK = '0001652044';

async function fixture() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

function rewriteAccessionIssuer(input, fromCik, toCik) {
  for (const concept of Object.values(input.facts?.['us-gaap'] || {})) {
    for (const entries of Object.values(concept?.units || {})) {
      for (const entry of entries) {
        entry.accn = String(entry.accn || '')
          .replace(new RegExp(`^${fromCik}-`), `${toCik}-`);
      }
    }
  }
}

async function googleRevenueConceptMigrationFixture() {
  const input = clone(await fixture());
  input.cik = ALPHABET_CIK;
  input.entityName = 'Google-style Revenue Concept Migration Corp';
  const usGaap = input.facts['us-gaap'];
  const oldRevenue = usGaap
    .RevenueFromContractWithCustomerExcludingAssessedTax
    .units
    .USD;
  const netIncome = usGaap.NetIncomeLoss.units.USD;
  const originalRevenue = clone(oldRevenue);

  oldRevenue.push({
    start: '2019-01-01',
    end: '2019-12-31',
    val: 850,
    accn: '0000000001-20-000001',
    fy: 2019,
    fp: 'FY',
    form: '10-K',
    filed: '2020-02-20',
  });
  netIncome.push({
    start: '2019-01-01',
    end: '2019-12-31',
    val: 80,
    accn: '0000000001-20-000001',
    fy: 2019,
    fp: 'FY',
    form: '10-K',
    filed: '2020-02-20',
  });

  const oldQuarterFacts = [
    {
      start: '2023-04-01',
      end: '2023-06-30',
      revenue: 400,
      netIncome: 45,
      accn: '0000000001-23-000102',
      fp: 'Q2',
      filed: '2023-08-01',
    },
    {
      start: '2023-07-01',
      end: '2023-09-30',
      revenue: 450,
      netIncome: 55,
      accn: '0000000001-23-000103',
      fp: 'Q3',
      filed: '2023-11-01',
    },
    {
      start: '2023-01-01',
      end: '2023-09-30',
      revenue: 1200,
      netIncome: 150,
      accn: '0000000001-23-000103',
      fp: 'Q3',
      filed: '2023-11-01',
    },
  ];
  for (const fact of oldQuarterFacts) {
    const base = {
      start: fact.start,
      end: fact.end,
      accn: fact.accn,
      fy: 2023,
      fp: fact.fp,
      form: '10-Q',
      filed: fact.filed,
    };
    oldRevenue.push({ ...base, val: fact.revenue });
    netIncome.push({ ...base, val: fact.netIncome });
  }

  const originalFact = (start, end) => clone(originalRevenue.find((entry) => (
    entry.start === start && entry.end === end
  )));
  const laterComparison = (fact, currentFact, frame) => ({
    ...fact,
    accn: currentFact.accn,
    fy: currentFact.fy,
    fp: currentFact.fp,
    form: currentFact.form,
    filed: currentFact.filed,
    frame,
  });
  const annual2025 = originalFact('2025-01-01', '2025-12-31');
  const q2_2025 = originalFact('2025-04-01', '2025-06-30');
  const q3_2025 = originalFact('2025-07-01', '2025-09-30');
  const nineMonths2025 = originalFact('2025-01-01', '2025-09-30');
  const currentQ1_2026 = {
    start: '2026-01-01',
    end: '2026-03-31',
    val: 820,
    accn: '0000000001-26-000101',
    fy: 2026,
    fp: 'Q1',
    form: '10-Q',
    filed: '2026-04-25',
    frame: 'CY2026Q1',
  };
  const currentQ2_2026 = {
    start: '2026-04-01',
    end: '2026-06-30',
    val: 880,
    accn: '0000000001-26-000102',
    fy: 2026,
    fp: 'Q2',
    form: '10-Q',
    filed: '2026-07-25',
    frame: 'CY2026Q2',
  };

  usGaap.Revenues = {
    label: 'Revenues',
    description: 'Revenue concept adopted after an official taxonomy transition.',
    units: {
      USD: [
        laterComparison(
          originalFact('2024-01-01', '2024-12-31'),
          annual2025,
          'CY2024',
        ),
        annual2025,
        laterComparison(
          originalFact('2024-04-01', '2024-06-30'),
          q2_2025,
          'CY2024Q2',
        ),
        q2_2025,
        laterComparison(
          originalFact('2024-07-01', '2024-09-30'),
          q3_2025,
          'CY2024Q3',
        ),
        q3_2025,
        nineMonths2025,
        laterComparison(
          originalFact('2025-01-01', '2025-03-31'),
          currentQ1_2026,
          'CY2025Q1',
        ),
        currentQ1_2026,
        laterComparison(q2_2025, currentQ2_2026, 'CY2025Q2'),
        currentQ2_2026,
      ],
    },
  };

  netIncome.push(
    laterComparison({
      ...originalFact('2024-01-01', '2024-12-31'),
      val: 336,
    }, annual2025, 'CY2024'),
    laterComparison({
      ...originalFact('2024-04-01', '2024-06-30'),
      val: 72,
    }, q2_2025, 'CY2024Q2'),
    laterComparison({
      ...originalFact('2024-07-01', '2024-09-30'),
      val: 99,
    }, q3_2025, 'CY2024Q3'),
    {
      start: '2025-01-01',
      end: '2025-03-31',
      val: 98,
      accn: '0000000001-26-000101',
      fy: 2026,
      fp: 'Q1',
      form: '10-Q',
      filed: '2026-04-25',
      frame: 'CY2025Q1',
    },
    {
      start: '2026-01-01',
      end: '2026-03-31',
      val: 140,
      accn: '0000000001-26-000101',
      fy: 2026,
      fp: 'Q1',
      form: '10-Q',
      filed: '2026-04-25',
      frame: 'CY2026Q1',
    },
    {
      start: '2025-04-01',
      end: '2025-06-30',
      val: 108,
      accn: '0000000001-26-000102',
      fy: 2026,
      fp: 'Q2',
      form: '10-Q',
      filed: '2026-07-25',
      frame: 'CY2025Q2',
    },
    {
      start: '2026-04-01',
      end: '2026-06-30',
      val: 155,
      accn: '0000000001-26-000102',
      fy: 2026,
      fp: 'Q2',
      form: '10-Q',
      filed: '2026-07-25',
      frame: 'CY2026Q2',
    },
  );

  usGaap.RevenueFromContractWithCustomerExcludingAssessedTax.units.USD = (
    oldRevenue.filter((entry) => (
      !entry.start.startsWith('2025-')
      || entry.end === '2025-03-31'
    ))
  );
  rewriteAccessionIssuer(input, '0000000001', ALPHABET_CIK);
  return input;
}

function closeTo(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function textResponse(body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(text)),
    },
  });
}

test('builds six complete annual periods and eight complete quarters from paired SEC facts', async () => {
  const result = buildSecFinancialHistory(await fixture(), {
    symbol: 'ACME',
    cik: '0000000001',
    asOfDate: '2026-07-26',
  });

  assert.equal(result.schemaVersion, SEC_FINANCIAL_HISTORY_SCHEMA_VERSION);
  assert.equal(result.status, 'complete');
  assert.equal(result.reason, null);
  assert.equal(result.symbol, 'ACME');
  assert.equal(result.currency, 'USD');
  assert.deepEqual(result.source, {
    provider: 'SEC',
    cik: '0000000001',
    entityName: 'Acme Official History Corp',
    revenueConcept: 'RevenueFromContractWithCustomerExcludingAssessedTax',
    netIncomeConcept: 'NetIncomeLoss',
  });
  assert.deepEqual(
    result.annual.map((row) => row.fiscalYear),
    ['FY2020', 'FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'],
  );
  assert.ok(result.annual.every((row) => row.fiscalQuarter === 'FY'));
  assert.ok(result.annual.every((row) => row.derived === false));
  assert.deepEqual(
    result.quarterly.map((row) => `${row.fiscalYear}-${row.fiscalQuarter}`),
    [
      'FY2024-Q1',
      'FY2024-Q2',
      'FY2024-Q3',
      'FY2024-Q4',
      'FY2025-Q1',
      'FY2025-Q2',
      'FY2025-Q3',
      'FY2025-Q4',
    ],
  );

  const annual2025 = result.annual.at(-1);
  assert.equal(annual2025.revenue, 3000);
  assert.equal(annual2025.netIncome, 450);
  closeTo(annual2025.netMarginPct, 15);
  closeTo(annual2025.revenueYoyPct, 25);
  closeTo(annual2025.netIncomeYoyPct, (450 / 336 - 1) * 100);
  closeTo(annual2025.netMarginChangePpt, 1);
  assert.equal(annual2025.revenueQoqPct, null);

  const q4_2024 = result.quarterly[3];
  assert.equal(q4_2024.startDate, '2024-10-01');
  assert.equal(q4_2024.endDate, '2024-12-31');
  assert.equal(q4_2024.filedDate, '2025-02-20');
  assert.equal(q4_2024.form, '10-K');
  assert.equal(q4_2024.accession, '0000000001-25-000001');
  assert.equal(q4_2024.revenue, 690);
  assert.equal(q4_2024.netIncome, 105);
  assert.equal(q4_2024.derived, true);
  assert.deepEqual(q4_2024.derivedFrom, {
    annualAccession: '0000000001-25-000001',
    nineMonthAccession: '0000000001-24-000103',
  });
  closeTo(q4_2024.revenueQoqPct, (690 / 650 - 1) * 100);

  const q1_2025 = result.quarterly[4];
  closeTo(q1_2025.revenueYoyPct, 40);
  closeTo(q1_2025.netIncomeYoyPct, (98 / 60 - 1) * 100);
  closeTo(q1_2025.netMarginChangePpt, 2);
  closeTo(q1_2025.revenueQoqPct, (700 / 690 - 1) * 100);
});

test('drops a quarter when revenue and net income do not share an accession', async () => {
  const input = clone(await fixture());
  const entries = input.facts['us-gaap'].NetIncomeLoss.units.USD;
  const q2 = entries.find((entry) => (
    entry.start === '2025-04-01' && entry.end === '2025-06-30'
  ));
  q2.accn = '0000000001-25-999999';

  const result = buildSecFinancialHistory(input, {
    symbol: 'ACME',
    cik: '0000000001',
    asOfDate: '2026-07-26',
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.reason, 'incomplete-official-history');
  assert.equal(result.quarterly.length, 7);
  assert.equal(
    result.quarterly.some((row) => row.endDate === '2025-06-30'),
    false,
  );
  const q3 = result.quarterly.find((row) => row.endDate === '2025-09-30');
  assert.equal(q3.revenueQoqPct, null);
});

test('derives Q4 only when annual and nine-month facts are strictly paired', async () => {
  const input = clone(await fixture());
  const entries = input.facts['us-gaap'].NetIncomeLoss.units.USD;
  const nineMonths = entries.find((entry) => (
    entry.start === '2025-01-01' && entry.end === '2025-09-30'
  ));
  nineMonths.start = '2025-01-02';

  const result = buildSecFinancialHistory(input, {
    symbol: 'ACME',
    cik: '0000000001',
    asOfDate: '2026-07-26',
  });

  assert.equal(result.status, 'partial');
  assert.equal(
    result.quarterly.some((row) => (
      row.fiscalYear === 'FY2025' && row.fiscalQuarter === 'Q4'
    )),
    false,
  );
});

test('uses the fiscal period end year when a later filing carries comparative FY metadata', async () => {
  const input = clone(await fixture());
  for (const concept of [
    input.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax,
    input.facts['us-gaap'].NetIncomeLoss,
  ]) {
    const annual2024 = concept.units.USD.find((entry) => (
      entry.start === '2024-01-01'
      && entry.end === '2024-12-31'
      && entry.form === '10-K'
    ));
    annual2024.fy = 2025;
  }

  const result = buildSecFinancialHistory(input, {
    symbol: 'ACME',
    cik: '0000000001',
    asOfDate: '2026-07-26',
  });

  assert.equal(result.annual.at(-2).fiscalYear, 'FY2024');
  assert.equal(
    result.quarterly.find((row) => row.endDate === '2024-12-31')?.fiscalYear,
    'FY2024',
  );
});

test('a lone MSFT-style later comparison fact cannot become the current fiscal quarter', async () => {
  const input = clone(await fixture());
  const comparisonIdentity = {
    start: '2024-10-01',
    end: '2024-12-31',
    accn: '0000000001-26-000202',
    fy: 2026,
    fp: 'Q2',
    form: '10-Q',
    filed: '2026-01-28',
    frame: 'CY2024Q4',
  };
  input.facts['us-gaap'].Revenues = {
    label: 'Revenues',
    units: {
      USD: [{ ...comparisonIdentity, val: 620 }],
    },
  };
  input.facts['us-gaap'].NetIncomeLoss.units.USD.push({
    ...comparisonIdentity,
    val: 102,
  });

  const result = buildSecFinancialHistory(input, {
    symbol: 'MSFT-LIKE',
    cik: '0000000001',
    asOfDate: '2026-07-26',
  });

  assert.equal(result.status, 'complete');
  assert.equal(
    result.source.revenueConcept,
    'RevenueFromContractWithCustomerExcludingAssessedTax',
  );
  assert.equal(
    result.quarterly.some((row) => (
      row.fiscalYear === 'FY2026' && row.fiscalQuarter === 'Q2'
    )),
    false,
  );
  assert.equal(
    result.quarterly.some((row) => row.accession === comparisonIdentity.accn),
    false,
  );
});

test('treats a missing SEC fact value as absent instead of numeric zero', async () => {
  const input = clone(await fixture());
  const entries = input.facts['us-gaap'].NetIncomeLoss.units.USD;
  const q2 = entries.find((entry) => (
    entry.start === '2025-04-01' && entry.end === '2025-06-30'
  ));
  q2.val = null;

  const result = buildSecFinancialHistory(input, {
    symbol: 'ACME',
    cik: '0000000001',
    asOfDate: '2026-07-26',
  });

  assert.equal(result.status, 'partial');
  assert.equal(
    result.quarterly.some((row) => row.endDate === '2025-06-30'),
    false,
  );
});

test('does not mark a non-consecutive six-year window complete', async () => {
  const input = clone(await fixture());
  for (const concept of [
    input.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax,
    input.facts['us-gaap'].NetIncomeLoss,
  ]) {
    concept.units.USD.push({
      start: '2019-01-01',
      end: '2019-12-31',
      val: concept.label === 'Revenue' ? 900 : 90,
      accn: '0000000001-20-000001',
      fy: 2019,
      fp: 'FY',
      form: '10-K',
      filed: '2020-02-20',
    });
    concept.units.USD = concept.units.USD.filter((entry) => !(
      entry.start === '2023-01-01'
      && entry.end === '2023-12-31'
      && entry.form === '10-K'
    ));
  }

  const result = buildSecFinancialHistory(input, {
    symbol: 'ACME',
    cik: '0000000001',
    asOfDate: '2026-07-26',
  });

  assert.equal(result.annual.length, 6);
  assert.equal(result.status, 'partial');
  assert.equal(result.reason, 'incomplete-official-history');
});

test('stitches only the Alphabet allowlisted migration when overlap comes from later comparative facts', async () => {
  const input = await googleRevenueConceptMigrationFixture();
  for (const symbol of ['GOOG', 'GOOGL']) {
    const result = buildSecFinancialHistory(input, {
      symbol,
      cik: ALPHABET_CIK,
      asOfDate: '2026-07-26',
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.reason, null);
    assert.equal(result.source.cik, ALPHABET_CIK);
    assert.equal(result.source.revenueConcept, 'Revenues');
    assert.deepEqual(result.source.revenueConcepts, [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
    ]);
    assert.deepEqual(
      result.annual.map((row) => row.fiscalYear),
      ['FY2020', 'FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'],
    );
    assert.deepEqual(
      result.quarterly.map((row) => `${row.fiscalYear}-${row.fiscalQuarter}`),
      [
        'FY2024-Q3',
        'FY2024-Q4',
        'FY2025-Q1',
        'FY2025-Q2',
        'FY2025-Q3',
        'FY2025-Q4',
        'FY2026-Q1',
        'FY2026-Q2',
      ],
    );
    assert.equal(result.annual.at(-1).endDate, '2025-12-31');
    assert.equal(result.quarterly.at(-2).endDate, '2026-03-31');
    assert.equal(result.quarterly.at(-1).endDate, '2026-06-30');
  }
});

test('does not infer a revenue migration from temporary matching values outside the CIK allowlist', async () => {
  const input = await googleRevenueConceptMigrationFixture();
  input.cik = '0000000001';
  input.entityName = 'Unverified Cross-concept Corp';
  rewriteAccessionIssuer(input, ALPHABET_CIK, '0000000001');

  const result = buildSecFinancialHistory(input, {
    symbol: 'OTHER',
    cik: '0000000001',
    asOfDate: '2026-07-26',
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.source.revenueConcept, 'Revenues');
  assert.equal('revenueConcepts' in result.source, false);
  assert.equal(result.annual.at(-1).endDate, '2025-12-31');
  assert.equal(result.quarterly.at(-1).endDate, '2026-06-30');
  assert.ok(result.annual.length < 6 || result.quarterly.length < 8);
});

test('never uses RevenuesNetOfInterestExpense in an unapproved Alphabet migration', async () => {
  const input = await googleRevenueConceptMigrationFixture();
  const usGaap = input.facts['us-gaap'];
  usGaap.RevenuesNetOfInterestExpense = usGaap.Revenues;
  delete usGaap.Revenues;

  const result = buildSecFinancialHistory(input, {
    symbol: 'GOOGL',
    cik: ALPHABET_CIK,
    asOfDate: '2026-07-26',
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.source.revenueConcept, 'RevenuesNetOfInterestExpense');
  assert.equal('revenueConcepts' in result.source, false);
  assert.ok(result.annual.length < 6 || result.quarterly.length < 8);
});

test('keeps a lone later-filed comparison fact as migration evidence but excludes it from output freshness', async () => {
  const input = await googleRevenueConceptMigrationFixture();
  const revenues = input.facts['us-gaap'].Revenues.units.USD;
  input.facts['us-gaap'].Revenues.units.USD = revenues.filter((entry) => (
    !entry.start.startsWith('2026-')
  ));

  const result = buildSecFinancialHistory(input, {
    symbol: 'GOOGL',
    cik: ALPHABET_CIK,
    asOfDate: '2026-07-26',
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.source.revenueConcepts, [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'Revenues',
  ]);
  assert.equal(
    result.quarterly.some((row) => row.fiscalYear === 'FY2026'),
    false,
  );
  const q1 = result.quarterly.find((row) => (
    row.fiscalYear === 'FY2025' && row.fiscalQuarter === 'Q1'
  ));
  assert.equal(q1?.endDate, '2025-03-31');
  assert.notEqual(q1?.accession, `${ALPHABET_CIK}-26-000101`);
  assert.equal(result.quarterly.at(-1).endDate, '2025-12-31');
});

test('a conflicting revenue concept overlap fails closed and still refuses the stale complete model', async () => {
  const input = await googleRevenueConceptMigrationFixture();
  const conflicting = input.facts['us-gaap'].Revenues.units.USD.find((entry) => (
    entry.start === '2024-04-01'
    && entry.end === '2024-06-30'
  ));
  conflicting.val += 1;

  const result = buildSecFinancialHistory(input, {
    symbol: 'GOOGL',
    cik: ALPHABET_CIK,
    asOfDate: '2026-07-26',
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.reason, 'incomplete-official-history');
  assert.equal(result.source.revenueConcept, 'Revenues');
  assert.equal('revenueConcepts' in result.source, false);
  assert.equal(result.annual.at(-1).endDate, '2025-12-31');
  assert.equal(result.quarterly.at(-1).endDate, '2026-06-30');
});

test('company facts source validates the symbol before any SEC request', async () => {
  let fetchCount = 0;
  const result = await fetchSecCompanyFactsSource({
    symbol: 'BAD SYMBOL',
    fetchFn: async () => {
      fetchCount += 1;
      throw new Error('must not fetch');
    },
  });

  assert.equal(fetchCount, 0);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reason, 'invalid-sec-company-facts-request');
});

test('fetches official ticker, submissions and company facts through the shared SEC reader', async () => {
  clearSecOfficialCachesForTests();
  const companyFacts = await fixture();
  const requested = [];
  const fetchFn = async (url) => {
    const parsed = new URL(url);
    requested.push(parsed.pathname);
    if (parsed.pathname === '/files/company_tickers.json') {
      return textResponse({
        0: { cik_str: 1, ticker: 'ACME', title: 'Acme Official History Corp' },
      });
    }
    if (parsed.pathname === '/submissions/CIK0000000001.json') {
      return textResponse({
        cik: '0000000001',
        tickers: ['ACME'],
        name: 'Acme Official History Corp',
      });
    }
    if (parsed.pathname === '/api/xbrl/companyfacts/CIK0000000001.json') {
      return textResponse(companyFacts);
    }
    return textResponse({ error: 'not found' }, 404);
  };

  const result = await fetchSecFinancialHistory({
    symbol: 'ACME',
    fetchFn,
    now: new Date('2026-07-26T12:00:00.000Z'),
    requestIntervalMs: 0,
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.annual.length, 6);
  assert.equal(result.quarterly.length, 8);
  assert.deepEqual(requested, [
    '/files/company_tickers.json',
    '/submissions/CIK0000000001.json',
    '/api/xbrl/companyfacts/CIK0000000001.json',
  ]);
});
