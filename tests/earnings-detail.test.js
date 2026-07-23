import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import handler, { parseEarningsDetailRequest } from '../api/earnings-detail.js';
import {
  SEC_EARNINGS_DETAIL_SCHEMA_VERSION,
  clearSecEarningsDetailCachesForTests,
  fetchSecEarningsDetail,
  parseSecEarningsDetailPrimaryDocument,
} from '../server/earnings/secEarningsDetail.js';
import { fetchSecTenQPrimaryDocument } from '../server/earnings/secOfficialActuals.js';

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
    reportDate: '2026-06-30',
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

test('published report stays pending when SEC has no exact-quarter 10-Q', async () => {
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
  assert.equal(result.reason, 'official-10q-not-filed');
  assert.equal(result.source?.cik, '0001652044');
  assert.ok(Object.values(result.sections).every(section => (
    section.status === 'pending'
    && section.reason === 'official-10q-not-filed'
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
    encoder.encode('你'.repeat(1_000_000)),
    encoder.encode(`${'你'.repeat(1_000_000)}x`),
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

test('earnings detail request accepts one supported US symbol and strict dates', () => {
  assert.deepEqual(parseEarningsDetailRequest({
    symbol: 'googl.us',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
  }), {
    symbol: 'GOOGL',
    fiscalDate: '2026-06-30',
    reportDate: '2026-07-22',
  });

  assert.match(parseEarningsDetailRequest({
    symbol: 'NV DA',
    fiscalDate: '2026-06-30',
  }).error, /股票代码|symbol/i);
  assert.match(parseEarningsDetailRequest({
    symbol: 'MSFT',
    fiscalDate: '2026-06-30',
  }).error, /暂不支持|supported/i);
  assert.match(parseEarningsDetailRequest({
    symbol: 'TSLA',
    fiscalDate: '2026-06',
  }).error, /日期|date/i);
});

test('earnings detail API preserves 401, 405, and 400 boundaries', async () => {
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  try {
    process.env.QUOTE_API_AUTH_REQUIRED = 'true';
    const unauthorized = createResponse();
    await handler(createRequest({
      query: { symbol: 'GOOGL', fiscalDate: '2026-06-30' },
    }), unauthorized);
    assert.equal(unauthorized.statusCode, 401);
    assert.match(unauthorized.body.error, /未授权/);

    const methodNotAllowed = createResponse();
    await handler(createRequest({
      method: 'POST',
      query: { symbol: 'GOOGL', fiscalDate: '2026-06-30' },
    }), methodNotAllowed);
    assert.equal(methodNotAllowed.statusCode, 405);
    assert.equal(methodNotAllowed.headers.Allow, 'GET, OPTIONS');

    process.env.QUOTE_API_AUTH_REQUIRED = 'false';
    const invalid = createResponse();
    await handler(createRequest({
      query: { symbol: 'MSFT', fiscalDate: 'not-a-date' },
    }), invalid);
    assert.equal(invalid.statusCode, 400);
    assert.match(invalid.body.error, /日期|date|暂不支持|supported/i);
  } finally {
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
  }
});
