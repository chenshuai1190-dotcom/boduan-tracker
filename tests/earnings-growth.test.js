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

async function fixture() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

function clone(value) {
  return structuredClone(value);
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
