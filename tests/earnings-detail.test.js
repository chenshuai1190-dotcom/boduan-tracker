import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import handler from '../api/earnings-calendar.js';
import {
  SEC_EARNINGS_DETAIL_SCHEMA_VERSION,
  clearSecEarningsDetailCachesForTests,
  fetchSecEarningsDetail,
  parseEarningsDetailRequest,
  parseSecEarningsDetailPrimaryDocument,
} from '../server/earnings/secEarningsDetail.js';
import {
  fetchSecEarningsFilingSource,
  fetchSecTenQPrimaryDocument,
} from '../server/earnings/secOfficialActuals.js';

const fixtureRoot = new URL('./fixtures/sec-earnings-detail/', import.meta.url);

async function fixture(name, json = false) {
  const value = await readFile(new URL(name, fixtureRoot), 'utf8');
  return json ? JSON.parse(value) : value;
}

function filing({
  cik,
  accession,
  filingDate,
  primaryDocument,
  reportDate = '2026-06-30',
}) {
  const archiveCik = String(Number(cik));
  const flatAccession = accession.replace(/-/g, '');
  const archiveRoot = `https://www.sec.gov/Archives/edgar/data/${archiveCik}/${flatAccession}`;
  return {
    cik,
    accession,
    form: '10-Q',
    filingDate,
    acceptedAt: `${filingDate}T20:00:00.000Z`,
    reportDate,
    primaryDocument,
    filingUrl: `${archiveRoot}/${accession}-index.html`,
    primaryDocumentUrl: `${archiveRoot}/${primaryDocument}`,
  };
}

const GOOGL_FILING = filing({
  cik: '0001652044',
  accession: '0001652044-26-000071',
  filingDate: '2026-07-30',
  primaryDocument: 'goog-20260630.htm',
});

const TSLA_FILING = filing({
  cik: '0001318605',
  accession: '0001628280-26-049270',
  filingDate: '2026-07-27',
  primaryDocument: 'tsla-20260630.htm',
});

const NVDA_FILING = filing({
  cik: '0001045810',
  accession: '0001045810-26-000052',
  filingDate: '2026-05-20',
  primaryDocument: 'nvda-20260426.htm',
  reportDate: '2026-04-26',
});

const TSMC_Q1_2026_REPORT_URL = 'https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-04/5508a9df8981f587c73dbfaf9f577f142e22bbb1/1Q26ManagementReport.pdf';
const TSMC_Q2_2026_REPORT_URL = 'https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-07/6f49632674bd2d0fd48cb65aaf89ec6ab510b559/2Q26%20ManagementReport.pdf';

function assertParsedCore(result, status = 'complete') {
  assert.equal(result.currency, 'USD');
  assert.equal(result.status, status);
  assert.deepEqual(result.period, {
    start: '2026-04-01',
    end: '2026-06-30',
  });
  assert.deepEqual(Object.keys(result.sections).sort(), [
    'geographies',
    'reportSegments',
    'revenueBreakdown',
  ]);
}

function assertCompleteSection(section, items) {
  assert.equal(section.status, 'complete');
  assert.equal(section.reason ?? null, null);
  assert.deepEqual(section.items, items);
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function createRequest({ method = 'GET', query = {}, headers = {} } = {}) {
  return { method, query, headers };
}

function textResponse(body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-length'
          ? String(Buffer.byteLength(text))
          : null;
      },
    },
    async text() {
      return text;
    },
  };
}

test('GOOGL primary 10-Q parser returns three segments, six revenue categories, four geographies, and hedging reconciliation', async () => {
  const expected = (await fixture('expected.json', true)).GOOGL;
  const parsed = parseSecEarningsDetailPrimaryDocument({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    html: await fixture('googl-10q-primary.html'),
    filing: GOOGL_FILING,
  });

  assertParsedCore(parsed);
  assertCompleteSection(parsed.sections.reportSegments, expected.reportSegments);
  assert.deepEqual(parsed.sections.reportSegments.reconciliation, expected.reconciliation);
  assertCompleteSection(parsed.sections.revenueBreakdown, expected.revenueBreakdown);
  assertCompleteSection(parsed.sections.geographies, expected.geographies);

  assert.equal(parsed.sections.reportSegments.items.length, 3);
  assert.equal(parsed.sections.revenueBreakdown.items.length, 6);
  assert.equal(parsed.sections.geographies.items.length, 4);
  assert.equal(parsed.sections.reportSegments.items[0].profitMetric, 'operatingIncome');

  // The six-month distractor values in the fixture must never be selected.
  assert.notEqual(parsed.sections.reportSegments.items[0].revenue, 184_490_000_000);
  assert.notEqual(parsed.sections.reportSegments.items[1].revenue, 45_900_000_000);
});

test('GOOG aliases the same Alphabet filing without changing the section contract', async () => {
  const expected = (await fixture('expected.json', true)).GOOGL;
  const parsed = parseSecEarningsDetailPrimaryDocument({
    symbol: 'GOOG',
    fiscalDate: '2026-06-30',
    html: await fixture('googl-10q-primary.html'),
    filing: GOOGL_FILING,
  });

  assert.equal(parsed.status, 'complete');
  assert.deepEqual(parsed.sections.reportSegments.items, expected.reportSegments);
  assert.deepEqual(parsed.sections.revenueBreakdown.items, expected.revenueBreakdown);
  assert.deepEqual(parsed.sections.geographies.items, expected.geographies);
});

test('TSLA primary 10-Q parser returns two gross-profit segments, six revenue categories, and three geographies', async () => {
  const expected = (await fixture('expected.json', true)).TSLA;
  const parsed = parseSecEarningsDetailPrimaryDocument({
    symbol: 'TSLA',
    fiscalDate: '2026-06-30',
    html: await fixture('tsla-10q-primary.html'),
    filing: TSLA_FILING,
  });

  assertParsedCore(parsed);
  assertCompleteSection(parsed.sections.reportSegments, expected.reportSegments);
  assertCompleteSection(parsed.sections.revenueBreakdown, expected.revenueBreakdown);
  assertCompleteSection(parsed.sections.geographies, expected.geographies);

  assert.equal(parsed.sections.reportSegments.items.length, 2);
  assert.equal(parsed.sections.revenueBreakdown.items.length, 6);
  assert.equal(parsed.sections.geographies.items.length, 3);
  assert.ok(parsed.sections.reportSegments.items.every(item => item.profitMetric === 'grossProfit'));
  assert.equal(parsed.sections.reportSegments.reconciliation ?? null, null);

  // The six-month distractor table is deliberately much larger.
  assert.notEqual(parsed.sections.reportSegments.items[0].revenue, 47_000_000_000);
  assert.notEqual(parsed.sections.reportSegments.items[1].revenue, 5_900_000_000);
});

test('NVDA primary 10-Q parser uses the reported 13-week quarter and reconciles every disclosed section', async () => {
  const expected = (await fixture('expected.json', true)).NVDA;
  const parsed = parseSecEarningsDetailPrimaryDocument({
    symbol: 'NVDA',
    // The calendar provider reports month-end; the official filing ended four
    // days earlier. The parser must return the SEC period, not invent a month.
    fiscalDate: '2026-04-30',
    html: await fixture('nvda-10q-primary.html'),
    filing: NVDA_FILING,
  });

  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.currency, 'USD');
  assert.deepEqual(parsed.period, {
    start: '2026-01-26',
    end: '2026-04-26',
  });
  assertCompleteSection(parsed.sections.reportSegments, expected.reportSegments);
  assertCompleteSection(parsed.sections.revenueBreakdown, expected.revenueBreakdown);
  assertCompleteSection(parsed.sections.geographies, expected.geographies);
  assert.ok(parsed.sections.reportSegments.items.every(
    item => item.profitMetric === 'operatingIncome',
  ));
});

test('NVDA adapter fails only the non-reconciling section instead of publishing guessed detail', async () => {
  const html = (await fixture('nvda-10q-primary.html')).replace(
    '>37,377</ix:nonFraction>',
    '>37,378</ix:nonFraction>',
  );
  const parsed = parseSecEarningsDetailPrimaryDocument({
    symbol: 'NVDA',
    fiscalDate: '2026-04-30',
    html,
    filing: NVDA_FILING,
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

test('NVDA parser rejects a provider date outside the bounded filing tolerance', async () => {
  assert.equal(parseSecEarningsDetailPrimaryDocument({
    symbol: 'NVDA',
    fiscalDate: '2026-05-10',
    html: await fixture('nvda-10q-primary.html'),
    filing: NVDA_FILING,
  }), null);
});

test('primary parser fails closed on company or fiscal-period mismatch', async () => {
  const googleHtml = await fixture('googl-10q-primary.html');
  assert.equal(parseSecEarningsDetailPrimaryDocument({
    symbol: 'TSLA',
    fiscalDate: '2026-06-30',
    html: googleHtml,
    filing: TSLA_FILING,
  }), null);
  assert.equal(parseSecEarningsDetailPrimaryDocument({
    symbol: 'GOOGL',
    fiscalDate: '2026-09-30',
    html: googleHtml,
    filing: GOOGL_FILING,
  }), null);
});

test('primary parser fails closed when an XBRL context ID is duplicated', async () => {
  const googleHtml = await fixture('googl-10q-primary.html');
  const baseline = parseSecEarningsDetailPrimaryDocument({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    html: googleHtml,
    filing: GOOGL_FILING,
  });
  assert.equal(baseline.status, 'complete');

  const contextAnchor = '<xbrli:context id="Q2_2026_services">';
  const conflictingContext = [
    '<xbrli:context id="Q2_2026_services">',
    '<xbrli:period>',
    '<xbrli:startDate>1999-01-01</xbrli:startDate>',
    '<xbrli:endDate>1999-03-31</xbrli:endDate>',
    '</xbrli:period>',
    '</xbrli:context>',
  ].join('');
  assert.ok(googleHtml.includes(contextAnchor));
  const malformedHtml = googleHtml.replace(
    contextAnchor,
    `${conflictingContext}${contextAnchor}`,
  );

  assert.equal(parseSecEarningsDetailPrimaryDocument({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    html: malformedHtml,
    filing: GOOGL_FILING,
  }), null);
});

test('a missing strict-quarter table makes only that section unavailable', async () => {
  const html = (await fixture('googl-10q-primary.html')).replace(
    /(<xbrli:context id="Q2_2026_us">[\s\S]*?<xbrli:startDate>)2026-04-01/,
    '$12026-01-01',
  );
  const parsed = parseSecEarningsDetailPrimaryDocument({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    html,
    filing: GOOGL_FILING,
  });

  assert.equal(parsed.status, 'partial');
  assert.equal(parsed.sections.reportSegments.status, 'complete');
  assert.equal(parsed.sections.revenueBreakdown.status, 'complete');
  assert.deepEqual(parsed.sections.geographies, {
    status: 'unavailable',
    reason: 'ambiguous-or-missing-xbrl-facts',
    items: [],
  });
});

test('duplicate facts make the affected section unavailable instead of guessing', async () => {
  const original = await fixture('googl-10q-primary.html');
  const fact = original.match(/<ix:nonfraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextref="Q2_2026_services" scale="6">94,540<\/ix:nonfraction>/)?.[0];
  assert.ok(fact, 'representative segment fact must exist');
  const conflictingFact = fact.replace('94,540', '94,541');
  const html = original.replace(fact, `${fact}${conflictingFact}`);
  const parsed = parseSecEarningsDetailPrimaryDocument({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    html,
    filing: GOOGL_FILING,
  });

  assert.equal(parsed.status, 'partial');
  assert.deepEqual(parsed.sections.reportSegments, {
    status: 'unavailable',
    reason: 'ambiguous-or-missing-xbrl-facts',
    items: [],
  });
  assert.equal(parsed.sections.revenueBreakdown.status, 'complete');
  assert.equal(parsed.sections.geographies.status, 'complete');
});

test('future or not-yet-filed report returns pending without calling SEC', async () => {
  clearSecEarningsDetailCachesForTests();
  let fetchCount = 0;
  const result = await fetchSecEarningsDetail({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-30',
    now: new Date('2026-07-23T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async () => {
      fetchCount += 1;
      throw new Error('future reports must not call SEC');
    },
  });

  assert.equal(fetchCount, 0);
  assert.equal(result.schemaVersion, SEC_EARNINGS_DETAIL_SCHEMA_VERSION);
  assert.equal(result.symbol, 'GOOGL');
  assert.equal(result.currency, 'USD');
  assert.equal(result.status, 'pending');
  assert.deepEqual(Object.values(result.sections).map(section => section.status), [
    'pending',
    'pending',
    'pending',
  ]);
  assert.ok(Object.values(result.sections).every(section => section.items.length === 0));
});

test('SEC reader wraps parsed sections in the versioned public response envelope', async () => {
  clearSecEarningsDetailCachesForTests();
  const expected = await fixture('expected.json', true);
  const primaryHtml = await fixture('googl-10q-primary.html');
  const submissions = {
    tickers: ['GOOG', 'GOOGL'],
    filings: {
      recent: {
        accessionNumber: [GOOGL_FILING.accession],
        form: ['10-Q'],
        filingDate: ['2026-07-30'],
        reportDate: ['2026-06-30'],
        primaryDocument: ['goog-20260630.htm'],
        acceptanceDateTime: ['2026-07-30T20:00:00.000Z'],
      },
    },
  };
  const requested = [];
  const fetchFn = async (url) => {
    const parsed = new URL(url);
    requested.push(parsed.pathname);
    if (parsed.pathname === '/submissions/CIK0001652044.json') {
      return textResponse(submissions);
    }
    if (parsed.pathname.endsWith('/goog-20260630.htm')) {
      return textResponse(primaryHtml);
    }
    return textResponse('not found', 404);
  };
  const result = await fetchSecEarningsDetail({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
    now: new Date('2026-07-31T12:00:00.000Z'),
    fetchFn,
    requestIntervalMs: 0,
  });

  assert.equal(result.schemaVersion, expected.schemaVersion);
  assert.equal(result.status, 'complete');
  assert.equal(result.reason, null);
  assert.equal(result.symbol, 'GOOGL');
  assert.equal(result.currency, 'USD');
  assert.deepEqual(result.period, {
    start: '2026-04-01',
    end: '2026-06-30',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
  });
  assert.deepEqual(result.source, {
    provider: 'SEC',
    cik: '0001652044',
    accession: GOOGL_FILING.accession,
    form: '10-Q',
    filedAt: '2026-07-30T20:00:00.000Z',
    filingUrl: GOOGL_FILING.filingUrl,
    primaryDocumentUrl: GOOGL_FILING.primaryDocumentUrl,
  });
  assert.deepEqual(result.sections.reportSegments.items, expected.GOOGL.reportSegments);
  assert.deepEqual(result.sections.revenueBreakdown.items, expected.GOOGL.revenueBreakdown);
  assert.deepEqual(result.sections.geographies.items, expected.GOOGL.geographies);
  assert.deepEqual(requested, [
    '/submissions/CIK0001652044.json',
    new URL(GOOGL_FILING.primaryDocumentUrl).pathname,
  ]);
});

test('SEC filing source matches NVDA month-end provider data to the unique official 13-week filing', async () => {
  const primaryHtml = await fixture('nvda-10q-primary.html');
  const submissions = {
    tickers: ['NVDA'],
    filings: {
      recent: {
        accessionNumber: [NVDA_FILING.accession],
        form: ['10-Q'],
        filingDate: ['2026-05-20'],
        reportDate: ['2026-04-26'],
        primaryDocument: ['nvda-20260426.htm'],
        acceptanceDateTime: ['2026-05-20T20:01:00.000Z'],
      },
    },
  };
  const requested = [];
  const result = await fetchSecEarningsFilingSource({
    symbol: 'NVDA',
    fiscalDate: '2026-04-30',
    reportDate: '2026-05-20',
    now: new Date('2026-05-21T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async (url) => {
      const parsed = new URL(url);
      requested.push(parsed.pathname);
      if (parsed.pathname === '/files/company_tickers.json') {
        return textResponse({
          0: { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA Corporation' },
        });
      }
      if (parsed.pathname === '/submissions/CIK0001045810.json') {
        return textResponse(submissions);
      }
      if (parsed.pathname.endsWith('/nvda-20260426.htm')) {
        return textResponse(primaryHtml);
      }
      return textResponse('not found', 404);
    },
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.reason, null);
  assert.equal(result.secCik, '0001045810');
  assert.equal(result.accession, NVDA_FILING.accession);
  assert.equal(result.form, '10-Q');
  assert.equal(result.filedAt, '2026-05-20T20:01:00.000Z');
  assert.equal(result.filingUrl, NVDA_FILING.filingUrl);
  assert.equal(result.primaryDocumentUrl, NVDA_FILING.primaryDocumentUrl);
  assert.equal(result.html, primaryHtml);
  assert.deepEqual(requested, [
    '/files/company_tickers.json',
    '/submissions/CIK0001045810.json',
    new URL(NVDA_FILING.primaryDocumentUrl).pathname,
  ]);
});

test('NVDA detail service returns complete official sections and keeps the provider date as the request key', async () => {
  clearSecEarningsDetailCachesForTests();
  const expected = (await fixture('expected.json', true)).NVDA;
  const primaryHtml = await fixture('nvda-10q-primary.html');
  const submissions = {
    tickers: ['NVDA'],
    filings: {
      recent: {
        accessionNumber: [NVDA_FILING.accession],
        form: ['10-Q'],
        filingDate: ['2026-05-20'],
        reportDate: ['2026-04-26'],
        primaryDocument: ['nvda-20260426.htm'],
        acceptanceDateTime: ['2026-05-20T20:01:00.000Z'],
      },
    },
  };
  const result = await fetchSecEarningsDetail({
    symbol: 'NVDA',
    fiscalDate: '2026-04-30',
    reportDate: '2026-05-20',
    now: new Date('2026-05-21T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/files/company_tickers.json') {
        return textResponse({
          0: { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA Corporation' },
        });
      }
      return pathname === '/submissions/CIK0001045810.json'
        ? textResponse(submissions)
        : textResponse(primaryHtml);
    },
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.reason, null);
  assert.deepEqual(result.period, {
    start: '2026-01-26',
    end: '2026-04-26',
    fiscalDate: '2026-04-30',
    reportDate: '2026-05-20',
  });
  assert.equal(result.source?.cik, '0001045810');
  assert.equal(result.source?.accession, NVDA_FILING.accession);
  assert.equal(result.source?.form, '10-Q');
  assert.deepEqual(result.sections.reportSegments.items, expected.reportSegments);
  assert.deepEqual(result.sections.revenueBreakdown.items, expected.revenueBreakdown);
  assert.deepEqual(result.sections.geographies.items, expected.geographies);
});

test('SEC filing source fails closed when two periodic filings are equally near the provider fiscal date', async () => {
  const submissions = {
    tickers: ['NVDA'],
    filings: {
      recent: {
        accessionNumber: [
          '0001045810-26-000052',
          '0001045810-26-000053',
        ],
        form: ['10-Q', '10-Q'],
        filingDate: ['2026-05-20', '2026-05-21'],
        reportDate: ['2026-04-26', '2026-05-04'],
        primaryDocument: ['nvda-20260426.htm', 'nvda-20260504.htm'],
        acceptanceDateTime: [
          '2026-05-20T20:01:00.000Z',
          '2026-05-21T20:01:00.000Z',
        ],
      },
    },
  };
  const result = await fetchSecEarningsFilingSource({
    symbol: 'NVDA',
    fiscalDate: '2026-04-30',
    reportDate: '2026-05-20',
    now: new Date('2026-05-22T12:00:00.000Z'),
    includePrimaryDocument: false,
    requestIntervalMs: 0,
    fetchFn: async (url) => (
      new URL(url).pathname === '/files/company_tickers.json'
        ? textResponse({
            0: { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA Corporation' },
          })
        : textResponse(submissions)
    ),
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'official-filing-not-found');
  assert.equal(result.secCik, '0001045810');
  assert.equal(result.accession, undefined);
});

test('SEC filing source resolves dynamic class-share aliases and exposes source without a deep adapter', async () => {
  const tickerMap = {
    0: {
      cik_str: 1067983,
      ticker: 'BRK-B',
      title: 'Berkshire Hathaway Inc.',
    },
  };
  const submissions = {
    tickers: ['BRK-B'],
    filings: {
      recent: {
        accessionNumber: ['0001067983-26-000090'],
        form: ['10-K'],
        filingDate: ['2026-08-03'],
        reportDate: ['2026-06-29'],
        primaryDocument: ['brka-20260629.htm'],
        acceptanceDateTime: ['2026-08-03T12:00:00.000Z'],
      },
    },
  };
  const requested = [];
  const result = await fetchSecEarningsFilingSource({
    symbol: 'BRK.B',
    fiscalDate: '2026-06-30',
    reportDate: '2026-08-03',
    now: new Date('2026-08-04T12:00:00.000Z'),
    includePrimaryDocument: false,
    requestIntervalMs: 0,
    fetchFn: async (url) => {
      const parsed = new URL(url);
      requested.push(parsed.pathname);
      if (parsed.pathname === '/files/company_tickers.json') {
        return textResponse(tickerMap);
      }
      if (parsed.pathname === '/submissions/CIK0001067983.json') {
        return textResponse(submissions);
      }
      return textResponse('not found', 404);
    },
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.secCik, '0001067983');
  assert.equal(result.form, '10-K');
  assert.equal(result.accession, '0001067983-26-000090');
  assert.equal(result.primaryDocumentUrl, undefined);
  assert.equal(result.html, undefined);
  assert.deepEqual(requested, [
    '/files/company_tickers.json',
    '/submissions/CIK0001067983.json',
  ]);
});

test('SEC filing source recognizes exact-period 6-K and 20-F filings without enabling a deep parser', async () => {
  const cases = [
    {
      symbol: 'TSM',
      cik: '0001046179',
      form: '6-K',
      fiscalDate: '2026-06-30',
      reportDate: '2026-07-16',
    },
    {
      symbol: 'ASML',
      cik: '0000937966',
      form: '20-F',
      fiscalDate: '2025-12-31',
      reportDate: '2026-02-25',
    },
  ];

  for (const item of cases) {
    const accession = `${item.cik}-${item.reportDate.slice(2, 4)}-000001`;
    const tickerMap = {
      0: {
        cik_str: Number(item.cik),
        ticker: item.symbol,
        title: item.symbol,
      },
    };
    const submissions = {
      tickers: [item.symbol],
      filings: {
        recent: {
          accessionNumber: [accession],
          form: [item.form],
          filingDate: [item.reportDate],
          reportDate: [item.fiscalDate],
          primaryDocument: [`${item.symbol.toLowerCase()}-filing.htm`],
          acceptanceDateTime: [`${item.reportDate}T12:00:00.000Z`],
        },
      },
    };
    const result = await fetchSecEarningsFilingSource({
      symbol: item.symbol,
      fiscalDate: item.fiscalDate,
      reportDate: item.reportDate,
      now: new Date(`${item.reportDate}T20:00:00.000Z`),
      includePrimaryDocument: false,
      requestIntervalMs: 0,
      fetchFn: async (url) => {
        const pathname = new URL(url).pathname;
        if (pathname === '/files/company_tickers.json') return textResponse(tickerMap);
        if (pathname === `/submissions/CIK${item.cik}.json`) {
          return textResponse(submissions);
        }
        return textResponse('not found', 404);
      },
    });
    assert.equal(result.status, 'complete', item.symbol);
    assert.equal(result.form, item.form, item.symbol);
    assert.equal(result.secCik, item.cik, item.symbol);
    assert.ok(result.filingUrl.endsWith(`/${accession}-index.html`), item.symbol);
  }
});

test('SEC filing source selects the earnings 6-K when the same fiscal period also has a monthly revenue 6-K', async () => {
  const cik = '0001046179';
  const earningsAccession = '0001046179-26-000451';
  const monthlyRevenueAccession = '0001046179-26-000440';
  const submissions = {
    tickers: ['TSM'],
    filings: {
      recent: {
        accessionNumber: [
          earningsAccession,
          monthlyRevenueAccession,
        ],
        form: ['6-K', '6-K'],
        filingDate: ['2026-07-16', '2026-07-10'],
        reportDate: ['2026-06-30', '2026-06-30'],
        primaryDocument: [
          'tsm-20260716x6k.htm',
          'tsm-revenue20260710.htm',
        ],
        acceptanceDateTime: [
          '2026-07-16T12:00:00.000Z',
          '2026-07-10T12:00:00.000Z',
        ],
      },
    },
  };

  const result = await fetchSecEarningsFilingSource({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-16',
    now: new Date('2026-07-17T12:00:00.000Z'),
    includePrimaryDocument: false,
    requestIntervalMs: 0,
    fetchFn: async (url) => (
      new URL(url).pathname === `/submissions/CIK${cik}.json`
        ? textResponse(submissions)
        : textResponse('not found', 404)
    ),
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.form, '6-K');
  assert.equal(result.accession, earningsAccession);
  assert.ok(result.filingUrl.endsWith(`/${earningsAccession}-index.html`));
});

test('verified TSM management-report detail keeps available SEC filing provenance', async () => {
  clearSecEarningsDetailCachesForTests();
  const cik = '0001046179';
  const accession = '0001046179-26-000451';
  const submissions = {
    tickers: ['TSM'],
    filings: {
      recent: {
        accessionNumber: [accession],
        form: ['6-K'],
        filingDate: ['2026-07-16'],
        reportDate: ['2026-06-30'],
        primaryDocument: ['tsm-20260716x6k.htm'],
        acceptanceDateTime: ['2026-07-16T12:00:00.000Z'],
      },
    },
  };
  const requested = [];
  const result = await fetchSecEarningsDetail({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-16',
    now: new Date('2026-07-17T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async (url) => {
      requested.push(new URL(url).pathname);
      return textResponse(submissions);
    },
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.reason, null);
  assert.deepEqual(result.period, {
    start: '2026-04-01',
    end: '2026-06-30',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-16',
  });
  assert.equal(result.sections.reportSegments.items.length, 1);
  assert.equal(result.sections.revenueBreakdown.items.length, 6);
  assert.equal(result.sections.geographies.items.length, 5);
  assert.equal(result.supplemental.technologyBreakdown.items.length, 10);
  assert.deepEqual(result.source, {
    provider: 'TSMC',
    cik,
    accession,
    form: '6-K',
    filedAt: '2026-07-16T12:00:00.000Z',
    filingUrl: `https://www.sec.gov/Archives/edgar/data/1046179/000104617926000451/${accession}-index.html`,
    primaryDocumentUrl: TSMC_Q2_2026_REPORT_URL,
  });
  assert.deepEqual(requested, [`/submissions/CIK${cik}.json`]);
});

test('verified TSM Q1 detail returns its exact official structure and SEC provenance', async () => {
  clearSecEarningsDetailCachesForTests();
  const cik = '0001046179';
  const accession = '0001046179-26-000199';
  const submissions = {
    tickers: ['TSM'],
    filings: {
      recent: {
        accessionNumber: [accession],
        form: ['6-K'],
        filingDate: ['2026-04-16'],
        reportDate: ['2026-03-31'],
        primaryDocument: ['tsm-20260416x6k.htm'],
        acceptanceDateTime: ['2026-04-16T12:00:00.000Z'],
      },
    },
  };
  const requested = [];
  const result = await fetchSecEarningsDetail({
    symbol: 'TSM',
    fiscalDate: '2026-03-31',
    reportDate: '2026-04-15',
    now: new Date('2026-04-17T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async (url) => {
      requested.push(new URL(url).pathname);
      return textResponse(submissions);
    },
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.reason, null);
  assert.deepEqual(result.period, {
    start: '2026-01-01',
    end: '2026-03-31',
    fiscalDate: '2026-03-31',
    reportDate: '2026-04-15',
  });
  assert.equal(result.sections.reportSegments.items.length, 1);
  assert.equal(result.sections.revenueBreakdown.items.length, 6);
  assert.equal(result.sections.geographies.items.length, 5);
  assert.equal(result.supplemental.technologyBreakdown.items.length, 11);
  assert.equal(result.summaryActuals.revenueActualUsd, 35_901_000_000);
  assert.equal(result.summaryActuals.ebitActualUsd, 20_860_000_000);
  assert.equal(result.summaryActuals.epsActual, 3.49);
  assert.equal(result.summaryActuals.epsUnit, 'USD/ADR');
  assert.deepEqual(result.source, {
    provider: 'TSMC',
    cik,
    accession,
    form: '6-K',
    filedAt: '2026-04-16T12:00:00.000Z',
    filingUrl: `https://www.sec.gov/Archives/edgar/data/1046179/000104617926000199/${accession}-index.html`,
    primaryDocumentUrl: TSMC_Q1_2026_REPORT_URL,
  });
  assert.deepEqual(requested, [`/submissions/CIK${cik}.json`]);
});

test('verified TSM Q1 detail survives SEC timeout and stays hidden before publication', async () => {
  clearSecEarningsDetailCachesForTests();
  let fetchCount = 0;
  const available = await fetchSecEarningsDetail({
    symbol: 'TSM',
    fiscalDate: '2026-03-31',
    reportDate: '2026-04-15',
    now: new Date('2026-04-17T12:00:00.000Z'),
    requestIntervalMs: 0,
    batchTimeoutMs: 50,
    fetchFn: async () => {
      fetchCount += 1;
      throw new Error('simulated SEC timeout');
    },
  });
  assert.equal(fetchCount, 1);
  assert.equal(available.status, 'complete');
  assert.equal(available.supplemental.technologyBreakdown.items.length, 11);
  assert.equal(available.source.primaryDocumentUrl, TSMC_Q1_2026_REPORT_URL);

  clearSecEarningsDetailCachesForTests();
  fetchCount = 0;
  const hidden = await fetchSecEarningsDetail({
    symbol: 'TSM',
    fiscalDate: '2026-03-31',
    reportDate: '2026-04-15',
    now: new Date('2026-04-15T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async () => {
      fetchCount += 1;
      throw new Error('future reports must not call SEC');
    },
  });
  assert.equal(fetchCount, 0);
  assert.equal(hidden.status, 'pending');
  assert.equal(hidden.reason, 'not-published');
  assert.equal(hidden.source, null);
  assert.equal(hidden.summaryActuals, null);

  clearSecEarningsDetailCachesForTests();
  fetchCount = 0;
  const hiddenBeforeSecAcceptance = await fetchSecEarningsDetail({
    symbol: 'TSM',
    fiscalDate: '2026-03-31',
    reportDate: '2026-04-15',
    now: new Date('2026-04-16T12:00:17.000Z'),
    requestIntervalMs: 0,
    fetchFn: async () => {
      fetchCount += 1;
      throw new Error('official data must wait for the SEC acceptance timestamp');
    },
  });
  assert.equal(fetchCount, 0);
  assert.equal(hiddenBeforeSecAcceptance.status, 'pending');
  assert.equal(hiddenBeforeSecAcceptance.reason, 'not-published');
  assert.equal(hiddenBeforeSecAcceptance.source, null);
  assert.equal(hiddenBeforeSecAcceptance.summaryActuals, null);
});

test('verified TSM management-report detail is not blocked when SEC is unavailable', async () => {
  clearSecEarningsDetailCachesForTests();
  let fetchCount = 0;
  const result = await fetchSecEarningsDetail({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-16',
    now: new Date('2026-07-17T12:00:00.000Z'),
    requestIntervalMs: 0,
    batchTimeoutMs: 50,
    fetchFn: async () => {
      fetchCount += 1;
      throw new Error('simulated SEC timeout');
    },
  });

  assert.equal(fetchCount, 1);
  assert.equal(result.status, 'complete');
  assert.equal(result.reason, null);
  assert.equal(result.sections.reportSegments.items.length, 1);
  assert.equal(result.sections.revenueBreakdown.items.length, 6);
  assert.equal(result.sections.geographies.items.length, 5);
  assert.equal(result.supplemental.technologyBreakdown.items.length, 10);
  assert.deepEqual(result.source, {
    provider: 'TSMC',
    cik: '0001046179',
    accession: null,
    form: 'Management Report',
    filedAt: null,
    filingUrl: null,
    primaryDocumentUrl: TSMC_Q2_2026_REPORT_URL,
  });
});

test('verified TSM management-report detail remains hidden before its report date', async () => {
  clearSecEarningsDetailCachesForTests();
  let fetchCount = 0;
  const result = await fetchSecEarningsDetail({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-16',
    now: new Date('2026-07-15T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async () => {
      fetchCount += 1;
      throw new Error('future reports must not call SEC');
    },
  });

  assert.equal(fetchCount, 0);
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'not-published');
  assert.equal(result.source, null);
  assert.ok(Object.values(result.sections).every(section => (
    section.status === 'pending'
    && section.reason === 'not-published'
    && section.items.length === 0
  )));
});

test('verified TSM management-report detail rejects an incorrect early report date', async () => {
  clearSecEarningsDetailCachesForTests();
  let fetchCount = 0;
  const result = await fetchSecEarningsDetail({
    symbol: 'TSM',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-01',
    now: new Date('2026-07-02T12:00:00.000Z'),
    requestIntervalMs: 0,
    batchTimeoutMs: 50,
    fetchFn: async () => {
      fetchCount += 1;
      throw new Error('simulated SEC timeout');
    },
  });

  assert.equal(fetchCount, 1);
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'sec-unavailable');
  assert.deepEqual(result.source, {
    provider: 'SEC',
    cik: '0001046179',
    accession: null,
    form: null,
    filedAt: null,
    filingUrl: null,
    primaryDocumentUrl: null,
  });
  assert.ok(Object.values(result.sections).every(section => (
    section.status === 'pending'
    && section.reason === 'sec-unavailable'
    && section.items.length === 0
  )));
});

test('published report stays pending when SEC has no matching official filing', async () => {
  clearSecEarningsDetailCachesForTests();
  const submissions = {
    tickers: ['GOOG', 'GOOGL'],
    filings: {
      recent: {
        accessionNumber: ['0001652044-26-000040'],
        form: ['10-Q'],
        filingDate: ['2026-04-25'],
        reportDate: ['2026-03-31'],
        primaryDocument: ['goog-20260331.htm'],
        acceptanceDateTime: ['2026-04-25T20:00:00.000Z'],
      },
    },
  };
  const result = await fetchSecEarningsDetail({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
    now: new Date('2026-07-31T12:00:00.000Z'),
    fetchFn: async () => textResponse(submissions),
    requestIntervalMs: 0,
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'official-filing-not-found');
  assert.equal(result.source?.cik, '0001652044');
  assert.ok(Object.values(result.sections).every(section => (
    section.status === 'pending'
    && section.reason === 'official-filing-not-found'
    && section.items.length === 0
  )));
});

test('SEC fetch failure degrades to pending sections instead of throwing a 502', async () => {
  clearSecEarningsDetailCachesForTests();
  const result = await fetchSecEarningsDetail({
    symbol: 'TSLA',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
    now: new Date('2026-07-31T12:00:00.000Z'),
    fetchFn: async () => {
      throw new Error('simulated SEC timeout');
    },
    requestIntervalMs: 0,
    batchTimeoutMs: 50,
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'sec-unavailable');
  assert.equal(result.source?.cik, '0001318605');
  assert.ok(Object.values(result.sections).every(section => (
    section.status === 'pending'
    && section.reason === 'sec-unavailable'
    && section.items.length === 0
  )));
});

test('SEC primary reader aborts a chunked response as soon as its UTF-8 bytes exceed the limit', async () => {
  const submissions = {
    tickers: ['GOOG', 'GOOGL'],
    filings: {
      recent: {
        accessionNumber: [GOOGL_FILING.accession],
        form: ['10-Q'],
        filingDate: ['2026-07-20'],
        reportDate: ['2026-06-30'],
        primaryDocument: ['goog-20260630.htm'],
      },
    },
  };
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('你'.repeat(1_600_000)),
    encoder.encode(`${'你'.repeat(1_600_000)}x`),
    encoder.encode('must-not-be-read'),
  ];
  let fetchCount = 0;
  let readCount = 0;
  let readerCancelled = false;
  let readerReleased = false;
  let fallbackTextCalled = false;
  let requestSignal = null;

  const result = await fetchSecTenQPrimaryDocument({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-20',
    now: new Date('2026-07-31T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async (url, options) => {
      fetchCount += 1;
      if (new URL(url).pathname === '/submissions/CIK0001652044.json') {
        return textResponse(submissions);
      }
      requestSignal = options.signal;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: {
          getReader() {
            let index = 0;
            return {
              async read() {
                readCount += 1;
                const value = chunks[index];
                index += 1;
                return value
                  ? { done: false, value }
                  : { done: true, value: undefined };
              },
              async cancel() {
                readerCancelled = true;
              },
              releaseLock() {
                readerReleased = true;
              },
            };
          },
        },
        async text() {
          fallbackTextCalled = true;
          return chunks.map((chunk) => new TextDecoder().decode(chunk)).join('');
        },
      };
    },
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'sec-unavailable');
  assert.equal(fetchCount, 2);
  assert.equal(readCount, 2);
  assert.equal(readerCancelled, true);
  assert.equal(readerReleased, true);
  assert.equal(requestSignal?.aborted, true);
  assert.equal(fallbackTextCalled, false);
});

test('earnings detail request accepts calendar symbols and non-calendar fiscal quarter ends', () => {
  assert.deepEqual(parseEarningsDetailRequest({
    symbol: 'googl.us',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
  }), {
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
  });
  assert.deepEqual(parseEarningsDetailRequest({
    symbol: 'nvda.us',
    fiscalDate: '2026-07-26',
    reportDate: '2026-08-19',
  }), {
    symbol: 'NVDA',
    fiscalDate: '2026-07-26',
    reportDate: '2026-08-19',
  });
  assert.deepEqual(parseEarningsDetailRequest({
    symbol: 'brk.b.us',
    fiscalDate: '2026-06-28',
    reportDate: '2026-08-03',
  }), {
    symbol: 'BRK.B',
    fiscalDate: '2026-06-28',
    reportDate: '2026-08-03',
  });

  assert.match(parseEarningsDetailRequest({
    symbol: 'NV DA',
    fiscalDate: '2026-06-30',
  }).error, /股票代码|symbol/i);
  assert.match(parseEarningsDetailRequest({
    symbol: 'TSLA',
    fiscalDate: '2026-06',
  }).error, /日期|date/i);
});

test('stocks without a deep adapter still return verified SEC filing provenance', async () => {
  clearSecEarningsDetailCachesForTests();
  const accession = '0000320193-26-000080';
  const submissions = {
    tickers: ['AAPL'],
    filings: {
      recent: {
        accessionNumber: [accession],
        form: ['10-Q'],
        filingDate: ['2026-07-30'],
        reportDate: ['2026-06-27'],
        primaryDocument: ['aapl-20260627.htm'],
        acceptanceDateTime: ['2026-07-30T20:00:00.000Z'],
      },
    },
  };
  const requested = [];
  const result = await fetchSecEarningsDetail({
    symbol: 'AAPL',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-30',
    now: new Date('2026-07-31T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async (url) => {
      const pathname = new URL(url).pathname;
      requested.push(pathname);
      if (pathname === '/files/company_tickers.json') {
        return textResponse({
          0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
        });
      }
      if (pathname === '/submissions/CIK0000320193.json') {
        return textResponse(submissions);
      }
      return textResponse('not found', 404);
    },
  });

  assert.deepEqual(requested, [
    '/files/company_tickers.json',
    '/submissions/CIK0000320193.json',
  ]);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'official-detail-adapter-not-supported');
  assert.equal(result.symbol, 'AAPL');
  assert.deepEqual(result.source, {
    provider: 'SEC',
    cik: '0000320193',
    accession,
    form: '10-Q',
    filedAt: '2026-07-30T20:00:00.000Z',
    filingUrl: `https://www.sec.gov/Archives/edgar/data/320193/000032019326000080/${accession}-index.html`,
    primaryDocumentUrl: null,
  });
  assert.deepEqual(result.period, {
    start: '',
    end: '2026-06-30',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-30',
  });
  assert.deepEqual(Object.values(result.sections), Array.from({ length: 3 }, () => ({
    status: 'unavailable',
    reason: 'official-detail-adapter-not-supported',
    items: [],
  })));
});

test('an adapted symbol with a non-calendar fiscal date fails closed without fabricating a quarter', async () => {
  clearSecEarningsDetailCachesForTests();
  let fetchCount = 0;
  const primaryHtml = await fixture('googl-10q-primary.html');
  const submissions = {
    tickers: ['GOOG', 'GOOGL'],
    filings: {
      recent: {
        accessionNumber: [GOOGL_FILING.accession],
        form: ['10-Q'],
        filingDate: ['2026-07-22'],
        reportDate: ['2026-06-30'],
        primaryDocument: ['goog-20260630.htm'],
        acceptanceDateTime: ['2026-07-22T20:00:00.000Z'],
      },
    },
  };
  const result = await fetchSecEarningsDetail({
    symbol: 'GOOGL',
    fiscalDate: '2026-06-28',
    reportDate: '2026-07-22',
    now: new Date('2026-07-23T12:00:00.000Z'),
    requestIntervalMs: 0,
    fetchFn: async (url) => {
      fetchCount += 1;
      const pathname = new URL(url).pathname;
      if (pathname === '/submissions/CIK0001652044.json') {
        return textResponse(submissions);
      }
      if (pathname.endsWith('/goog-20260630.htm')) {
        return textResponse(primaryHtml);
      }
      return textResponse('not found', 404);
    },
  });

  assert.equal(fetchCount, 2);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'official-primary-document-unparsed');
  assert.equal(result.period.start, '');
  assert.equal(result.period.end, '2026-06-28');
  assert.equal(result.source?.accession, GOOGL_FILING.accession);
  assert.ok(Object.values(result.sections).every(section => (
    section.status === 'unavailable'
    && section.reason === 'official-primary-document-unparsed'
    && section.items.length === 0
  )));
});

test('earnings detail API preserves 401, 405, and 400 boundaries', async () => {
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  try {
    process.env.QUOTE_API_AUTH_REQUIRED = 'true';
    const unauthorized = createResponse();
    await handler(createRequest({
      query: { operation: 'detail', symbol: 'GOOGL', fiscalDate: '2026-06-30' },
    }), unauthorized);
    assert.equal(unauthorized.statusCode, 401);
    assert.match(unauthorized.body.error, /未授权/);
    assert.equal(unauthorized.headers['Cache-Control'], 'private, no-store');

    const unauthorizedFund = createResponse();
    await handler(createRequest({
      query: { operation: 'fund-composition', symbol: 'TQQQ' },
    }), unauthorizedFund);
    assert.equal(unauthorizedFund.statusCode, 401);
    assert.match(unauthorizedFund.body.error, /未授权/);

    const unauthorizedGrowth = createResponse();
    await handler(createRequest({
      query: { operation: 'growth', symbol: 'NVDA' },
    }), unauthorizedGrowth);
    assert.equal(unauthorizedGrowth.statusCode, 401);
    assert.match(unauthorizedGrowth.body.error, /未授权/);

    const methodNotAllowed = createResponse();
    await handler(createRequest({
      method: 'POST',
      query: { operation: 'detail', symbol: 'GOOGL', fiscalDate: '2026-06-30' },
    }), methodNotAllowed);
    assert.equal(methodNotAllowed.statusCode, 405);
    assert.equal(methodNotAllowed.headers.Allow, 'GET, OPTIONS');
    assert.equal(methodNotAllowed.headers['Cache-Control'], 'private, no-store');

    process.env.QUOTE_API_AUTH_REQUIRED = 'false';
    const invalid = createResponse();
    await handler(createRequest({
      query: { operation: 'detail', symbol: 'MSFT', fiscalDate: 'not-a-date' },
    }), invalid);
    assert.equal(invalid.statusCode, 400);
    assert.match(invalid.body.error, /日期|date|暂不支持|supported/i);
    assert.equal(invalid.headers['Cache-Control'], 'private, no-store');

    const unsupportedFund = createResponse();
    await handler(createRequest({
      query: { operation: 'fund-composition', symbol: 'AAPL' },
    }), unsupportedFund);
    assert.equal(unsupportedFund.statusCode, 400);
    assert.match(unsupportedFund.body.error, /官方基金构成/);

    const invalidGrowth = createResponse();
    await handler(createRequest({
      query: { operation: 'growth', symbol: ['NVDA', 'MSFT'] },
    }), invalidGrowth);
    assert.equal(invalidGrowth.statusCode, 400);
    assert.match(invalidGrowth.body.error, /symbol/);
  } finally {
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
  }
});

test('earnings detail branch does not require the calendar EODHD key', async () => {
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalEodhdKey = process.env.EODHD_API_KEY;
  try {
    process.env.QUOTE_API_AUTH_REQUIRED = 'false';
    delete process.env.EODHD_API_KEY;
    const res = createResponse();
    await handler(createRequest({
      query: {
        operation: 'detail',
        symbol: 'GOOGL',
        fiscalDate: '2099-06-30',
        reportDate: '2099-07-22',
      },
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.status, 'pending');
    assert.equal(res.headers['Cache-Control'], 'private, max-age=300');

    const unsupportedDeepDetail = createResponse();
    await handler(createRequest({
      query: {
        operation: 'detail',
        symbol: 'AAPL',
        fiscalDate: '2099-06-28',
        reportDate: '2099-07-22',
      },
    }), unsupportedDeepDetail);
    assert.equal(unsupportedDeepDetail.statusCode, 200);
    assert.equal(unsupportedDeepDetail.body.success, true);
    assert.equal(unsupportedDeepDetail.body.status, 'pending');
    assert.equal(
      unsupportedDeepDetail.body.reason,
      'not-published',
    );
    assert.equal(unsupportedDeepDetail.headers['Cache-Control'], 'private, max-age=300');
  } finally {
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalEodhdKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalEodhdKey;
  }
});
