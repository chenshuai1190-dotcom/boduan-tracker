import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  clearSecOfficialCachesForTests,
  fetchSecOfficialActuals,
  mergeSecOfficialActuals,
} from '../server/earnings/secOfficialActuals.js';
import {
  extractExhibit991Url,
  parseSecCompanyFactsActuals,
  parseSecExhibitActuals,
} from '../server/earnings/secOfficialParsers.js';
import { normalizeEarningsEvents } from '../src/lib/earningsCalendarModel.js';

const fixtureRoot = new URL('./fixtures/sec-earnings/', import.meta.url);

async function fixture(name, json = false) {
  const value = await readFile(new URL(name, fixtureRoot), 'utf8');
  return json ? JSON.parse(value) : value;
}

function textResponse(body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-length' ? String(Buffer.byteLength(text)) : null;
      },
    },
    async text() {
      return text;
    },
  };
}

test('SEC exhibit parsers select official GAAP quarter values and reject distractors', async () => {
  const expected = await fixture('expected.json', true);
  const cases = [
    ['TSLA', 'tsla-exhibit-99.1.html'],
    ['GOOGL', 'googl-exhibit-99.1.html'],
    ['IBKR', 'ibkr-exhibit-99.1.html'],
  ];

  for (const [symbol, filename] of cases) {
    const parsed = parseSecExhibitActuals({
      symbol,
      fiscalDate: expected.fiscalDate,
      html: await fixture(filename),
    });
    const values = expected.events[symbol];
    assert.ok(parsed, `${symbol} should parse`);
    assert.equal(parsed.revenueActual, values.revenueActual ?? values.netRevenueActual);
    assert.equal(parsed.revenuePreviousYear, values.revenuePreviousYear ?? values.netRevenuePreviousYear);
    assert.equal(parsed.ebitActual, values.operatingIncomeActual ?? values.incomeBeforeTaxActual);
    assert.equal(parsed.ebitPreviousYear, values.operatingIncomePreviousYear ?? values.incomeBeforeTaxPreviousYear);
    assert.equal(parsed.epsActual, values.epsActual);
    assert.equal(parsed.epsPreviousYear, values.epsPreviousYear);
  }

  const google = parseSecExhibitActuals({
    symbol: 'GOOGL',
    fiscalDate: expected.fiscalDate,
    html: await fixture('googl-exhibit-99.1.html'),
  });
  assert.notEqual(google.ebitActual, expected.events.GOOGL.incomeBeforeTaxActual);

  const interactiveBrokers = parseSecExhibitActuals({
    symbol: 'IBKR',
    fiscalDate: expected.fiscalDate,
    html: await fixture('ibkr-exhibit-99.1.html'),
  });
  assert.notEqual(interactiveBrokers.revenueActual, expected.events.IBKR.adjustedNetRevenueActual);
  assert.notEqual(interactiveBrokers.ebitActual, expected.events.IBKR.adjustedIncomeBeforeTaxActual);
});

test('Tesla parser reads the real SEC image-alt shape without selecting non-GAAP EPS', () => {
  const html = `
    <html><body><p>Tesla Q2 2026 Update</p>
      <img alt='FINANCIAL SUMMARY (Unaudited) ($ in millions, except percentages and per share data)
      Q2-2025 Q3-2025 Q4-2025 Q1-2026 Q2-2026
      Total automotive revenues 16,661 21,205 17,693 16,234 20,516
      Total revenues 22,496 28,095 24,901 22,387 28,236
      Income from operations 923 1,624 1,409 941 398
      EPS attributable to common stockholders, diluted (GAAP) 0.33 0.39 0.24 0.13 0.32
      EPS attributable to common stockholders, diluted (non-GAAP) 0.40 0.50 0.50 0.41 0.33'>
    </body></html>
  `;
  const parsed = parseSecExhibitActuals({
    symbol: 'TSLA',
    fiscalDate: '2026-06-30',
    html,
  });

  assert.equal(parsed?.revenueActual, 28_236_000_000);
  assert.equal(parsed?.ebitActual, 398_000_000);
  assert.equal(parsed?.epsActual, 0.32);
  assert.notEqual(parsed?.epsActual, 0.33);
});

test('SEC filing index selects the declared EX-99.1 archive document', async () => {
  const filingUrl = 'https://www.sec.gov/Archives/edgar/data/1318605/000162828026049213/0001628280-26-049213-index.html';
  assert.equal(
    extractExhibit991Url(await fixture('tsla-filing-index.html'), filingUrl),
    'https://www.sec.gov/Archives/edgar/data/1318605/000162828026049213/exhibit991.htm',
  );
  assert.equal(
    extractExhibit991Url('<a href="https://attacker.example/exhibit991.htm">EX-99.1</a>', filingUrl),
    null,
  );
});

test('SEC XBRL parser selects a 90-day exact quarter and refuses same-end-date YTD facts', () => {
  const accession = '0000000000-26-000001';
  const current = (value, unit = 'USD') => ({
    start: '2026-04-01',
    end: '2026-06-30',
    val: value,
    accn: accession,
    form: '10-Q',
    filed: '2026-07-30',
    unit,
  });
  const previous = (value, unit = 'USD') => ({
    start: '2025-04-01',
    end: '2025-06-30',
    val: value,
    accn: accession,
    form: '10-Q',
    filed: '2026-07-30',
    unit,
  });
  const ytd = (value, unit = 'USD') => ({
    start: '2026-01-01',
    end: '2026-06-30',
    val: value,
    accn: accession,
    form: '10-Q',
    filed: '2026-07-30',
    unit,
  });
  const concept = (unit, values) => ({ units: { [unit]: values } });
  const companyFacts = {
    facts: {
      'us-gaap': {
        Revenues: concept('USD', [ytd(999_000_000), current(119_796_000_000), previous(96_428_000_000)]),
        RevenuesNetOfInterestExpense: concept('USD', [
          current(1_896_000_000),
          previous(1_480_000_000),
        ]),
        OperatingIncomeLoss: concept('USD', [ytd(888_000_000), current(40_770_000_000), previous(31_271_000_000)]),
        IncomeLossFromContinuingOperationsBeforeIncomeTaxes: concept('USD', [
          current(138_753_000_000),
          previous(33_933_000_000),
        ]),
        EarningsPerShareDiluted: concept('USD/shares', [
          ytd(14.24, 'USD/shares'),
          current(9.11, 'USD/shares'),
          previous(2.31, 'USD/shares'),
        ]),
      },
    },
  };

  const alphabet = parseSecCompanyFactsActuals({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    companyFacts,
    accession,
    filedAt: '2026-07-30',
  });
  assert.equal(alphabet?.revenueActual, 119_796_000_000);
  assert.equal(alphabet?.ebitActual, 40_770_000_000);
  assert.equal(alphabet?.epsActual, 9.11);

  const interactiveBrokers = parseSecCompanyFactsActuals({
    symbol: 'IBKR',
    fiscalDate: '2026-06-30',
    companyFacts,
    accession,
    filedAt: '2026-07-30',
  });
  assert.equal(interactiveBrokers?.revenueActual, 1_896_000_000);
  assert.equal(interactiveBrokers?.revenueActualBasis, 'RevenuesNetOfInterestExpense');
  assert.equal(interactiveBrokers?.ebitActual, 138_753_000_000);

  const ytdOnly = structuredClone(companyFacts);
  ytdOnly.facts['us-gaap'].Revenues.units.USD = [ytd(999_000_000)];
  delete ytdOnly.facts['us-gaap'].RevenuesNetOfInterestExpense;
  assert.equal(parseSecCompanyFactsActuals({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    companyFacts: ytdOnly,
    accession,
    filedAt: '2026-07-30',
  }), null);

  const pretaxOnlyOrdinary = structuredClone(companyFacts);
  delete pretaxOnlyOrdinary.facts['us-gaap'].OperatingIncomeLoss;
  assert.equal(parseSecCompanyFactsActuals({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    companyFacts: pretaxOnlyOrdinary,
    accession,
    filedAt: '2026-07-30',
  }), null);
});

test('SEC official reader discovers current 8-K exhibits and overrides only actual fields', async () => {
  clearSecOfficialCachesForTests();
  const filenamesByPath = new Map([
    ['/files/company_tickers.json', 'company-tickers.json'],
    ['/submissions/CIK0001318605.json', 'tsla-submissions.json'],
    ['/submissions/CIK0001652044.json', 'googl-submissions.json'],
    ['/submissions/CIK0001381197.json', 'ibkr-submissions.json'],
    ['/Archives/edgar/data/1318605/000162828026049213/0001628280-26-049213-index.html', 'tsla-filing-index.html'],
    ['/Archives/edgar/data/1652044/000165204426000066/0001652044-26-000066-index.html', 'googl-filing-index.html'],
    ['/Archives/edgar/data/1381197/000138119726000118/0001381197-26-000118-index.html', 'ibkr-filing-index.html'],
    ['/Archives/edgar/data/1318605/000162828026049213/exhibit991.htm', 'tsla-exhibit-99.1.html'],
    ['/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm', 'googl-exhibit-99.1.html'],
    ['/Archives/edgar/data/1381197/000138119726000118/ibkr-ex99_1.htm', 'ibkr-exhibit-99.1.html'],
  ]);
  const requested = [];
  const fetchFn = async (url) => {
    const parsed = new URL(url);
    requested.push(parsed.pathname);
    const filename = filenamesByPath.get(parsed.pathname);
    return filename ? textResponse(await fixture(filename)) : textResponse('not found', 404);
  };
  const events = [
    ...Array.from({ length: 10 }, (_, index) => ({
      symbol: `UNSUPPORTED${index}`,
      reportDate: '2026-07-22',
      fiscalDate: '2026-06-30',
      epsActual: index,
    })),
    { symbol: 'TSLA', reportDate: '2026-07-22', fiscalDate: '2026-06-30' },
    { symbol: 'GOOGL', reportDate: '2026-07-22', fiscalDate: '2026-06-30' },
    { symbol: 'IBKR', reportDate: '2026-07-21', fiscalDate: '2026-06-30' },
  ];
  const official = await fetchSecOfficialActuals({
    events,
    fetchFn,
    userAgent: 'BoduanTracker test@example.com',
    now: '2026-07-23T12:00:00Z',
    requestIntervalMs: 0,
  });

  assert.equal(official.get('TSLA|2026-06-30')?.epsActual, 0.32);
  assert.equal(official.get('GOOGL|2026-06-30')?.ebitActual, 40_770_000_000);
  assert.equal(official.get('IBKR|2026-06-30')?.revenueActual, 1_896_000_000);
  assert.equal(official.get('UNSUPPORTED9|2026-06-30')?.officialActualStatus, 'unsupported');
  assert.ok(requested.some((path) => path.endsWith('exhibit991.htm')));

  const [merged] = mergeSecOfficialActuals([{
    symbol: 'TSLA',
    reportDate: '2026-07-22',
    fiscalDate: '2026-06-30',
    epsEstimate: 0.31,
    epsActual: 0.27,
    actual: 7.1,
    epsDifference: -0.04,
    difference: 6.8,
    surprisePercent: -12.9,
    percent: 97.2,
    revenueActual: 1,
    ebitActual: 1_329_000_000,
    marketReactionPercent: -4.74,
  }], official);
  assert.equal(merged.epsActual, 0.32);
  assert.equal(merged.actual, 0.32);
  assert.equal(merged.epsEstimate, 0.31);
  assert.ok(Math.abs(merged.epsDifference - 0.01) < 1e-12);
  assert.ok(Math.abs(merged.difference - 0.01) < 1e-12);
  assert.ok(Math.abs(merged.surprisePercent - 3.225806451612906) < 1e-12);
  assert.ok(Math.abs(merged.percent - 3.225806451612906) < 1e-12);
  assert.equal(merged.revenueActual, 28_236_000_000);
  assert.equal(merged.ebitActual, 398_000_000);
  assert.equal(merged.marketReactionPercent, -4.74);
  assert.equal(merged.officialActualSource, 'sec-exhibit');
  assert.equal(merged.officialActualStatus, 'complete');
});

test('SEC failure is isolated and pending official values fail closed without breaking the event', async () => {
  clearSecOfficialCachesForTests();
  const events = [{
    symbol: 'TSLA',
    reportDate: '2026-07-22',
    fiscalDate: '2026-06-30',
    epsEstimate: 0.31,
    epsActual: 0.27,
    actual: 7.1,
    epsDifference: 0.01,
    difference: 6.8,
    surprisePercent: 3.2,
    percent: 97.2,
    revenueActual: 28_236_000_000,
    actualRevenue: 99_000_000_000,
    ebitActual: 398_000_000,
  }];
  const official = await fetchSecOfficialActuals({
    events,
    fetchFn: async () => textResponse('unavailable', 503),
    userAgent: 'BoduanTracker test@example.com',
    now: '2026-07-23T12:00:00Z',
    requestIntervalMs: 0,
  });
  const [merged] = mergeSecOfficialActuals(events, official);

  assert.equal(merged.officialActualStatus, 'pending');
  assert.equal(merged.epsEstimate, 0.31);
  assert.equal(merged.epsActual, null);
  assert.equal(merged.actual, null);
  assert.equal(merged.difference, null);
  assert.equal(merged.percent, null);
  assert.equal(merged.revenueActual, null);
  assert.equal(merged.actualRevenue, null);
  assert.equal(merged.ebitActual, null);
  assert.equal(merged.publishedFinancialsComplete, false);

  const [normalized] = normalizeEarningsEvents([merged]);
  assert.equal(normalized.epsActual, null);
  assert.equal(normalized.epsDifference, null);
  assert.equal(normalized.surprisePercent, null);
  assert.equal(normalized.revenueActual, null);
  assert.equal(normalized.earningsPublished, false);
});

test('unsupported companies keep provider actuals without making SEC requests', async () => {
  let requests = 0;
  const event = {
    symbol: 'NVDA',
    reportDate: '2026-07-22',
    fiscalDate: '2026-06-30',
    epsActual: 1.23,
    revenueActual: 50_000_000_000,
  };
  const official = await fetchSecOfficialActuals({
    events: [event],
    fetchFn: async () => {
      requests += 1;
      throw new Error('must not request SEC without an official adapter');
    },
    now: '2026-07-23T12:00:00Z',
  });
  const [merged] = mergeSecOfficialActuals([event], official);

  assert.equal(requests, 0);
  assert.equal(official.get('NVDA|2026-06-30')?.officialActualStatus, 'unsupported');
  assert.equal(merged.epsActual, 1.23);
  assert.equal(merged.revenueActual, 50_000_000_000);
});

test('SEC batch deadline includes a stalled response body', async () => {
  const startedAt = Date.now();
  const official = await fetchSecOfficialActuals({
    events: [{
      symbol: 'TSLA',
      reportDate: '2026-07-22',
      fiscalDate: '2026-06-30',
    }],
    fetchFn: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => new Promise(() => {}),
    }),
    userAgent: 'BoduanTracker test@example.com',
    now: '2026-07-23T12:00:00Z',
    requestIntervalMs: 0,
    batchTimeoutMs: 30,
  });

  assert.ok(Date.now() - startedAt < 500);
  assert.equal(official.get('TSLA|2026-06-30')?.officialActualStatus, 'pending');
});

test('SEC batch deadline also bounds concurrent waits in the global rate-limit queue', async () => {
  clearSecOfficialCachesForTests();
  const startedAt = Date.now();
  const batches = await Promise.all(Array.from({ length: 4 }, () => fetchSecOfficialActuals({
    events: [{
      symbol: 'TSLA',
      reportDate: '2026-07-22',
      fiscalDate: '2026-06-30',
    }],
    fetchFn: async () => textResponse('unavailable', 503),
    userAgent: 'BoduanTracker test@example.com',
    now: '2026-07-23T12:00:00Z',
    requestIntervalMs: 100,
    batchTimeoutMs: 20,
  })));

  assert.ok(Date.now() - startedAt < 100);
  for (const official of batches) {
    assert.equal(official.get('TSLA|2026-06-30')?.officialActualStatus, 'pending');
  }
});
