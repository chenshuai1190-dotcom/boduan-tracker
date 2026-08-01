import assert from 'node:assert/strict';
import test from 'node:test';

import handler from '../api/quote.js';
import {
  QUOTE_API_POLICY_HEADER,
  QUOTE_API_POLICY_VERSION,
} from '../src/lib/quoteApiPolicy.js';
import {
  buildStockValuation,
  fetchStockValuation,
} from '../server/quote/valuation.js';

function quarter(date, filingDate, {
  netIncome = 100,
} = {}) {
  return {
    date,
    ...(filingDate ? { filing_date: filingDate } : {}),
    netIncome,
  };
}

function fundamentalsPayload(quarters, {
  trailingPe,
  forwardPe,
  outstandingShares = quarters.map((row) => ({
    dateFormatted: row.date,
    shares: 100,
  })),
} = {}) {
  return {
    ...(trailingPe === undefined ? {} : { 'Valuation::TrailingPE': trailingPe }),
    ...(forwardPe === undefined ? {} : { 'Valuation::ForwardPE': forwardPe }),
    'Financials::Income_Statement::quarterly': Object.fromEntries(
      quarters.map((row) => [row.date, row]),
    ),
    'outstandingShares::quarterly': Object.fromEntries(
      outstandingShares.map((row) => [row.dateFormatted, row]),
    ),
  };
}

function baseQuarterRows() {
  return [
    quarter('2020-03-31', '2020-05-01'),
    quarter('2020-06-30', '2020-08-01'),
    quarter('2020-09-30', '2020-11-01'),
    quarter('2020-12-31', '2021-02-01'),
    quarter('2021-03-31', '2021-05-01', { netIncome: 200 }),
    quarter('2021-06-30', '2021-07-31', { netIncome: 10_000 }),
  ];
}

function sparsePriceRows() {
  return [
    { date: '2021-01-29', adjusted_close: 40 },
    { date: '2021-02-01', adjusted_close: 400 },
    { date: '2021-02-02', adjusted_close: 40 },
    { date: '2021-02-26', adjusted_close: 44 },
    { date: '2021-03-01', adjusted_close: 48 },
    { date: '2021-03-31', adjusted_close: 52 },
    { date: '2021-04-30', adjusted_close: 56 },
    { date: '2021-05-03', adjusted_close: 50 },
    { date: '2021-05-28', adjusted_close: 55 },
    { date: '2021-06-01', adjusted_close: 60 },
    { date: '2021-06-30', adjusted_close: 65 },
  ];
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
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

function createRequest(symbols = 'NVDA', {
  authorization = 'Bearer test-session',
  view = 'valuation',
} = {}) {
  return {
    method: 'GET',
    headers: {
      [QUOTE_API_POLICY_HEADER.toLowerCase()]: QUOTE_API_POLICY_VERSION,
      ...(authorization ? { authorization } : {}),
    },
    query: { symbols, view },
  };
}

function assertClose(actual, expected, epsilon = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test('builds a leak-free five-year valuation contract and samples only month-end chart points', () => {
  const result = buildStockValuation(
    fundamentalsPayload(baseQuarterRows()),
    sparsePriceRows(),
    {
      symbol: 'nvda',
      peForward: 20,
      now: Date.parse('2021-06-30T21:00:00.000Z'),
    },
  );

  assert.equal(result.symbol, 'NVDA');
  assert.equal(result.currency, 'USD');
  assert.equal(result.source, 'EODHD_VALUATION');
  assert.equal(result.windowStartDate, '2016-06-30');
  assert.equal(result.asOfDate, '2021-06-30');
  assert.equal(result.fetchedAt, '2021-06-30T21:00:00.000Z');
  assert.equal(result.seriesFrequency, 'monthly-last-trading-day');
  assert.equal(result.statisticsFrequency, 'daily');
  assert.deepEqual(result.current, { peTtm: 13, peForward: 20 });

  assert.equal(result.summary.observationCount, 9);
  assert.equal(result.summary.min, 10);
  assert.equal(result.summary.p25, 11);
  assert.equal(result.summary.median, 12);
  assertClose(result.summary.average, 106 / 9);
  assert.equal(result.summary.p75, 13);
  assert.equal(result.summary.max, 14);
  assertClose(result.percentile5y, (8 / 9) * 100);
  assert.deepEqual(result.series, [
    { date: '2021-02-26', peTtm: 11 },
    { date: '2021-03-31', peTtm: 13 },
    { date: '2021-04-30', peTtm: 14 },
    { date: '2021-05-28', peTtm: 11 },
    { date: '2021-06-30', peTtm: 13 },
  ]);

  assert.equal(
    result.series.some((point) => point.date === '2021-02-01'),
    false,
    'the filing date itself must not receive after-hours filing data',
  );
  assert.equal(
    result.series.at(-1).peTtm,
    13,
    'a future filing must not change an earlier price date',
  );
});

test('a negative quarter remains valid when total TTM profit is still positive', () => {
  const rows = baseQuarterRows();
  rows[4] = quarter('2021-03-31', '2021-05-01', {
    netIncome: -200,
  });
  const result = buildStockValuation(
    fundamentalsPayload(rows),
    [
      { date: '2021-02-02', adjusted_close: 40 },
      { date: '2021-04-30', adjusted_close: 56 },
      { date: '2021-05-03', adjusted_close: 50 },
      { date: '2021-06-30', adjusted_close: 65 },
    ],
    {
      symbol: 'NVDA',
      peForward: 17,
      now: Date.parse('2021-06-30T21:00:00.000Z'),
    },
  );

  assert.deepEqual(result.current, { peTtm: 65, peForward: 17 });
  assert.equal(result.percentile5y, 100);
  assert.equal(result.summary.observationCount, 4);
  assert.deepEqual(result.series, [
    { date: '2021-02-02', peTtm: 10 },
    { date: '2021-04-30', peTtm: 14 },
    { date: '2021-05-03', peTtm: 50 },
    { date: '2021-06-30', peTtm: 65 },
  ]);
  assert.equal(result.asOfDate, '2021-06-30');
});

test('nonpositive TTM profit and invalid quarterly profit both fail closed', () => {
  for (const invalidProfit of [-400, null, true]) {
    const rows = baseQuarterRows();
    rows[4] = quarter('2021-03-31', '2021-05-01', {
      netIncome: invalidProfit,
    });
    const result = buildStockValuation(
      fundamentalsPayload(rows),
      [
        { date: '2021-02-02', adjusted_close: 40 },
        { date: '2021-04-30', adjusted_close: 56 },
        { date: '2021-05-03', adjusted_close: 50 },
        { date: '2021-06-30', adjusted_close: 65 },
      ],
      {
        symbol: 'NVDA',
        peForward: 17,
        now: Date.parse('2021-06-30T21:00:00.000Z'),
      },
    );

    assert.deepEqual(result.current, { peTtm: null, peForward: 17 });
    assert.equal(result.percentile5y, null);
    assert.equal(result.summary.observationCount, 2);
    assert.deepEqual(result.series, [
      { date: '2021-02-02', peTtm: 10 },
      { date: '2021-04-30', peTtm: 14 },
    ]);
  }
});

test('a missing filing date disables only affected windows and later complete quarters recover', () => {
  const rows = baseQuarterRows();
  rows[2] = quarter('2020-09-30', '', { netIncome: 100 });
  rows[5] = quarter('2021-06-30', '2021-07-31');
  rows.push(quarter('2021-09-30', '2021-11-01'));
  const result = buildStockValuation(
    fundamentalsPayload(rows),
    [
      { date: '2021-02-02', adjusted_close: 40 },
      { date: '2021-06-30', adjusted_close: 65 },
      { date: '2021-11-02', adjusted_close: 40 },
      { date: '2021-11-30', adjusted_close: 50 },
      { date: '2021-12-01', adjusted_close: 55 },
    ],
    {
      symbol: 'NVDA',
      peForward: 18,
      now: Date.parse('2021-12-01T21:00:00.000Z'),
    },
  );

  assert.deepEqual(result.current, { peTtm: 11, peForward: 18 });
  assert.equal(result.percentile5y, 100);
  assert.equal(result.summary.observationCount, 3);
  assert.deepEqual(result.series, [
    { date: '2021-11-30', peTtm: 10 },
    { date: '2021-12-01', peTtm: 11 },
  ]);
});

test('summary uses discrete floor-index quantiles and percentile rank is inclusive', () => {
  const result = buildStockValuation(
    fundamentalsPayload(baseQuarterRows()),
    [
      { date: '2021-02-02', adjusted_close: 40 },
      { date: '2021-02-03', adjusted_close: 120 },
      { date: '2021-02-04', adjusted_close: 160 },
      { date: '2021-02-05', adjusted_close: 80 },
    ],
    {
      symbol: 'NVDA',
      now: Date.parse('2021-02-10T00:00:00.000Z'),
    },
  );

  assert.deepEqual(result.summary, {
    min: 10,
    p25: 20,
    median: 30,
    average: 25,
    p75: 40,
    max: 40,
    observationCount: 4,
  });
  assert.equal(result.percentile5y, 50);
  assert.equal(result.current.peTtm, 20);
});

test('accepts the live EODHD income and outstanding-shares response shape', () => {
  const fundamentals = {
    Valuation: {
      ForwardPE: '22',
    },
    Financials: {
      Income_Statement: {
        quarterly: {
          q1: quarter('2025-04-30', '2025-05-20'),
          q2: quarter('2025-07-31', '2025-08-20'),
          q3: quarter('2025-10-31', '2025-11-20'),
          q4: quarter('2026-01-31', '2026-02-20'),
        },
      },
    },
    outstandingShares: {
      quarterly: {
        shares: {
          dateFormatted: '2026-01-31',
          shares: '100',
        },
      },
    },
  };

  const result = buildStockValuation(
    fundamentals,
    [{ date: '2026-02-23', adjusted_close: 40 }],
    {
      symbol: 'NVDA',
      now: Date.parse('2026-03-01T00:00:00.000Z'),
    },
  );

  assert.deepEqual(result.current, { peTtm: 10, peForward: 22 });
  assert.equal(result.percentile5y, 100);
  assert.deepEqual(result.summary, {
    min: 10,
    p25: 10,
    median: 10,
    average: 10,
    p75: 10,
    max: 10,
    observationCount: 1,
  });
  assert.deepEqual(result.series, [{ date: '2026-02-23', peTtm: 10 }]);
  assert.equal(result.asOfDate, '2026-02-23');
});

test('missing outstanding shares fails closed instead of guessing EPS', () => {
  const result = buildStockValuation(
    fundamentalsPayload(baseQuarterRows(), {
      forwardPe: 18,
      outstandingShares: [],
    }),
    [{ date: '2021-02-02', adjusted_close: 40 }],
    {
      symbol: 'NVDA',
      now: Date.parse('2021-02-10T00:00:00.000Z'),
    },
  );

  assert.deepEqual(result.current, { peTtm: null, peForward: 18 });
  assert.equal(result.percentile5y, null);
  assert.equal(result.summary.observationCount, 0);
  assert.deepEqual(result.series, []);
});

test('fetcher requests only EODHD fundamentals and five-year EOD data through injected fetch', async () => {
  const providerUrls = [];
  const secret = 'private-valuation-test-key';
  const quarters = [
    quarter('2025-04-30', '2025-05-20'),
    quarter('2025-07-31', '2025-08-20'),
    quarter('2025-10-31', '2025-11-20'),
    quarter('2026-01-31', '2026-02-20'),
    quarter('2026-04-30', '2026-05-20'),
  ];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    providerUrls.push(parsed);
    if (parsed.pathname === '/api/v1.1/fundamentals/NVDA.US') {
      return jsonResponse(fundamentalsPayload(quarters, {
        trailingPe: 31.25,
        forwardPe: 23.5,
      }));
    }
    if (parsed.pathname === '/api/eod/NVDA.US') {
      return jsonResponse([{ date: '2026-07-23', adjusted_close: 100 }]);
    }
    throw new Error(`unexpected provider path: ${parsed.pathname}`);
  };

  const result = await fetchStockValuation('nvda', {
    eodhdKey: secret,
    peForward: 22,
    fetchImpl,
    now: Date.parse('2026-07-24T00:00:00.000Z'),
  });

  assert.equal(providerUrls.length, 2);
  const fundamentalsUrl = providerUrls.find((url) => url.pathname.includes('/fundamentals/'));
  const eodUrl = providerUrls.find((url) => url.pathname.includes('/eod/'));
  assert.ok(fundamentalsUrl);
  assert.ok(eodUrl);
  assert.equal(fundamentalsUrl.searchParams.get('api_token'), secret);
  assert.equal(fundamentalsUrl.searchParams.get('fmt'), 'json');
  assert.ok(fundamentalsUrl.searchParams.get('from') < '2021-07-24');
  assert.equal(fundamentalsUrl.searchParams.get('filter'), [
    'Valuation::ForwardPE',
    'Financials::Income_Statement::quarterly',
    'outstandingShares::quarterly',
  ].join(','));
  assert.equal(eodUrl.searchParams.get('api_token'), secret);
  assert.equal(eodUrl.searchParams.get('period'), 'd');
  assert.equal(eodUrl.searchParams.get('from'), '2021-07-24');
  assert.equal(eodUrl.searchParams.get('to'), '2026-07-24');

  assert.deepEqual(result.current, { peTtm: 25, peForward: 22 });
  assert.equal(result.summary.observationCount, 1);
  assert.deepEqual(result.series, [{ date: '2026-07-23', peTtm: 25 }]);
  assert.equal(result.percentile5y, 100);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('valuation view stays authenticated, private, single-stock, and does not expose provider credentials', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    key: process.env.EODHD_API_KEY,
    url: process.env.SUPABASE_URL,
    anon: process.env.SUPABASE_ANON_KEY,
  };
  const providerUrls = [];
  const quarters = [
    quarter('2025-04-30', '2025-05-20'),
    quarter('2025-07-31', '2025-08-20'),
    quarter('2025-10-31', '2025-11-20'),
    quarter('2026-01-31', '2026-02-20'),
    quarter('2026-04-30', '2026-05-20'),
  ];
  process.env.QUOTE_API_AUTH_REQUIRED = 'true';
  process.env.EODHD_API_KEY = 'private-route-test-key';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/auth/v1/user') return jsonResponse({ id: 'user-a' });
    providerUrls.push(parsed);
    if (parsed.pathname === '/api/v1.1/fundamentals/NVDA.US') {
      return jsonResponse(fundamentalsPayload(quarters, { forwardPe: 23.5 }));
    }
    if (parsed.pathname === '/api/eod/NVDA.US') {
      return jsonResponse([{ date: '2026-07-23', adjusted_close: 100 }]);
    }
    throw new Error(`unexpected provider path: ${parsed.pathname}`);
  };

  try {
    const response = createResponse();
    await handler(createRequest(), response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.symbol, 'NVDA');
    assert.equal(response.body.data.current.peTtm, 25);
    assert.equal(response.body.data.current.peForward, 23.5);
    assert.match(response.headers['Cache-Control'], /private, no-store/);
    assert.equal(providerUrls.length, 2);
    assert.equal(JSON.stringify(response.body).includes('private-route-test-key'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv.authRequired === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalEnv.authRequired;
    if (originalEnv.key === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalEnv.key;
    if (originalEnv.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnv.url;
    if (originalEnv.anon === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = originalEnv.anon;
  }
});

test('valuation view rejects unauthenticated, multiple-symbol, and non-stock requests before provider work', async () => {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return jsonResponse({});
  };

  try {
    process.env.QUOTE_API_AUTH_REQUIRED = 'true';
    const unauthorized = createResponse();
    await handler(createRequest('NVDA', { authorization: '' }), unauthorized);
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(fetchCount, 0);

    process.env.QUOTE_API_AUTH_REQUIRED = 'false';
    process.env.EODHD_API_KEY = 'route-validation-key';
    const multiple = createResponse();
    await handler(createRequest('NVDA,MSFT', { authorization: '' }), multiple);
    assert.equal(multiple.statusCode, 400);
    const special = createResponse();
    await handler(createRequest('VIX', { authorization: '' }), special);
    assert.equal(special.statusCode, 400);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

test('provider and input failures never expose the EODHD key', async () => {
  let fetchCount = 0;
  await assert.rejects(
    fetchStockValuation('NVDA', {
      eodhdKey: 'do-not-leak-this-key',
      fetchImpl: async (url) => {
        fetchCount += 1;
        const parsed = new URL(url);
        return parsed.pathname.includes('/fundamentals/')
          ? jsonResponse({}, 403)
          : jsonResponse([]);
      },
      now: Date.parse('2026-07-24T00:00:00.000Z'),
    }),
    (error) => {
      assert.match(error.message, /返回 403/);
      assert.doesNotMatch(error.message, /do-not-leak-this-key/);
      return true;
    },
  );
  assert.equal(fetchCount, 2);

  await assert.rejects(
    fetchStockValuation('NVDA', {
      eodhdKey: 'network-error-secret',
      fetchImpl: async (url) => {
        throw new Error(`network failed for ${url}`);
      },
      now: Date.parse('2026-07-24T00:00:00.000Z'),
    }),
    (error) => {
      assert.equal(error.message, 'EODHD Valuation provider 请求失败');
      assert.doesNotMatch(error.message, /network-error-secret/);
      return true;
    },
  );

  let invalidFetchCount = 0;
  await assert.rejects(
    fetchStockValuation('NVDA;DROP', {
      eodhdKey: 'secret',
      fetchImpl: async () => {
        invalidFetchCount += 1;
        return jsonResponse({});
      },
    }),
    /股票代码不合法/,
  );
  await assert.rejects(
    fetchStockValuation('NVDA', {
      eodhdKey: '',
      fetchImpl: async () => {
        invalidFetchCount += 1;
        return jsonResponse({});
      },
    }),
    /API key 未配置/,
  );
  assert.equal(invalidFetchCount, 0);
});
