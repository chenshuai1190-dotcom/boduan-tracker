import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  convertForeignBusinessCompositionCurrency,
  discoverForeignIssuerBusinessCompositionDocument,
  foreignIssuerBusinessCompositionDiscoveryUrl,
  foreignIssuerFilingCandidateMatches,
  hasForeignIssuerBusinessCompositionAdapter,
  knownForeignIssuerBusinessComposition,
  parseForeignIssuerBusinessComposition,
} from '../server/earnings/foreignIssuerBusinessComposition.js';

const fixtureRoot = new URL('./fixtures/foreign-issuer-business/', import.meta.url);

async function fixture(name) {
  return readFile(new URL(name, fixtureRoot), 'utf8');
}

test('foreign issuer adapter scope is explicit and does not claim unknown companies', () => {
  assert.equal(hasForeignIssuerBusinessCompositionAdapter('NOK'), true);
  assert.equal(hasForeignIssuerBusinessCompositionAdapter('tsm.us'), true);
  assert.equal(hasForeignIssuerBusinessCompositionAdapter('ASML'), false);
});

test('NOK earnings 6-K matches by publication date even when SEC reportDate is not fiscalDate', () => {
  assert.equal(foreignIssuerFilingCandidateMatches({
    symbol: 'NOK',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-23',
    filing: {
      cik: '924613',
      form: '6-K',
      filingDate: '2026-07-23',
      reportDate: '2026-07-23',
    },
  }), true);
  assert.equal(foreignIssuerFilingCandidateMatches({
    symbol: 'NOK',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-23',
    filing: {
      cik: '924613',
      form: '6-K',
      filingDate: '2026-07-10',
      reportDate: '2026-07-10',
    },
  }), false);
});

test('TSM keeps exact fiscal-period matching so a monthly revenue 6-K is not selected', () => {
  assert.equal(foreignIssuerFilingCandidateMatches({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-16',
    filing: {
      cik: '1046179',
      form: '6-K',
      filingDate: '2026-07-16',
      reportDate: '2026-06-30',
    },
  }), true);
  assert.equal(foreignIssuerFilingCandidateMatches({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-16',
    filing: {
      cik: '1046179',
      form: '6-K',
      filingDate: '2026-07-13',
      reportDate: '2026-07-13',
    },
  }), false);
});

test('NOK official report parser returns reportable segments, business units, regions, and customer mix', async () => {
  const parsed = parseForeignIssuerBusinessComposition({
    symbol: 'NOK',
    fiscalDate: '2026-06-30',
    sourceText: await fixture('nok-q2-2026.txt'),
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/924613/example/nok-6k.htm',
  });

  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.currency, 'EUR');
  assert.deepEqual(parsed.period, {
    start: '2026-04-01',
    end: '2026-06-30',
  });
  assert.equal(parsed.source.provider, 'SEC');
  assert.equal(parsed.source.form, '6-K');
  assert.equal(parsed.sections.reportSegments.items.length, 3);
  assert.equal(parsed.sections.revenueBreakdown.items.length, 7);
  assert.equal(parsed.sections.geographies.items.length, 3);
  assert.equal(parsed.supplemental.customerTypes.items.length, 4);

  assert.deepEqual(parsed.sections.reportSegments.items[0], {
    id: 'network-infrastructure',
    label: 'Network Infrastructure',
    labelZh: '网络基础设施',
    revenue: 2_037_000_000,
    previousRevenue: 1_825_000_000,
    profitMetric: 'operatingIncome',
    profit: 166_000_000,
    previousProfit: 117_000_000,
  });
  assert.equal(parsed.sections.reportSegments.items[2].previousProfit, -11_000_000);
  assert.equal(parsed.sections.reportSegments.reconciliation.revenue, 4_000_000);
  assert.equal(parsed.sections.reportSegments.reconciliation.previousRevenue, -2_000_000);
  assert.equal(parsed.sections.revenueBreakdown.items[3].revenue, 507_000_000);
  assert.equal(parsed.sections.geographies.items[0].revenue, 1_778_000_000);
  assert.equal(parsed.supplemental.customerTypes.items[1].previousRevenue, 220_000_000);
});

test('NOK parser fails closed for a mismatched fiscal quarter', async () => {
  assert.equal(parseForeignIssuerBusinessComposition({
    symbol: 'NOK',
    fiscalDate: '2026-03-31',
    sourceText: await fixture('nok-q2-2026.txt'),
  }), null);
});

test('NOK composition can be converted to USD without mutating labels or percentages', async () => {
  const parsed = parseForeignIssuerBusinessComposition({
    symbol: 'NOK',
    fiscalDate: '2026-06-30',
    sourceText: await fixture('nok-q2-2026.txt'),
  });
  const converted = convertForeignBusinessCompositionCurrency(parsed, { rate: 1.14 });
  assert.equal(converted.currency, 'USD');
  assert.equal(converted.sections.reportSegments.items[0].revenue, 2_322_180_000);
  assert.equal(converted.sections.reportSegments.items[0].labelZh, '网络基础设施');
  assert.equal(parsed.currency, 'EUR');
  assert.equal(convertForeignBusinessCompositionCurrency(parsed, { rate: 0 }), null);
});

test('TSM official quarterly page discovery only returns its Management Report PDF', async () => {
  const pageUrl = foreignIssuerBusinessCompositionDiscoveryUrl({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
  });
  assert.equal(pageUrl, 'https://investor.tsmc.com/english/quarterly-results/2026/q2');
  assert.equal(discoverForeignIssuerBusinessCompositionDocument({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    html: await fixture('tsm-q2-2026-results-page.html'),
    baseUrl: pageUrl,
  }), 'https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-07/example/2Q26%20ManagementReport.pdf');
});

test('TSM Management Report parser returns platform, geography, and technology composition', async () => {
  const parsed = parseForeignIssuerBusinessComposition({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    sourceText: await fixture('tsm-q2-2026-management-report.txt'),
    sourceUrl: 'https://investor.tsmc.com/english/reports/2Q26%20ManagementReport.pdf',
  });

  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.currency, 'USD');
  assert.deepEqual(parsed.period, {
    start: '2026-04-01',
    end: '2026-06-30',
  });
  assert.equal(parsed.sections.reportSegments.items.length, 1);
  assert.equal(parsed.sections.revenueBreakdown.items.length, 6);
  assert.equal(parsed.sections.geographies.items.length, 5);
  assert.equal(parsed.supplemental.technologyBreakdown.items.length, 10);

  const foundry = parsed.sections.reportSegments.items[0];
  assert.equal(foundry.revenue, 40_200_000_000);
  assert.equal(foundry.previousRevenue, 30_070_000_000);
  assert.equal(foundry.profit, 24_240_600_000);
  assert.equal(foundry.previousProfit, 14_914_720_000);

  const hpc = parsed.sections.revenueBreakdown.items[0];
  assert.equal(hpc.revenue, 26_532_000_000);
  assert.equal(hpc.previousRevenue, 18_042_000_000);
  assert.equal(hpc.sharePercent, 66);
  assert.equal(hpc.previousSharePercent, 60);

  const twoNanometer = parsed.supplemental.technologyBreakdown.items[0];
  assert.equal(twoNanometer.revenue, 1_206_000_000);
  assert.equal(twoNanometer.previousRevenue, 0);
  assert.equal(parsed.sections.geographies.items[0].revenue, 31_356_000_000);
});

test('TSM parser rejects incomplete official text instead of inventing missing composition', async () => {
  const source = await fixture('tsm-q2-2026-management-report.txt');
  assert.equal(parseForeignIssuerBusinessComposition({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    sourceText: source.replace('North America 78% 76% 75%', ''),
  }), null);
  assert.equal(parseForeignIssuerBusinessComposition({
    symbol: 'TSM',
    fiscalDate: '2026-03-31',
    sourceText: source,
  }), null);
});

test('current TSM quarter uses the verified official management-report snapshot only for its exact period', () => {
  const parsed = knownForeignIssuerBusinessComposition({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
  });
  assert.equal(parsed?.status, 'complete');
  assert.equal(parsed?.sections.revenueBreakdown.items.length, 6);
  assert.equal(parsed?.sections.geographies.items.length, 5);
  assert.equal(parsed?.supplemental.technologyBreakdown.items.length, 10);
  assert.equal(knownForeignIssuerBusinessComposition({
    symbol: 'TSM',
    fiscalDate: '2026-03-31',
  }), null);
  assert.equal(knownForeignIssuerBusinessComposition({
    symbol: 'NOK',
    fiscalDate: '2026-06-30',
  }), null);
});
