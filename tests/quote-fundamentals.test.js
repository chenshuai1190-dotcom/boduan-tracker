import assert from 'node:assert/strict';
import test from 'node:test';

import handler from '../api/quote.js';
import { buildStockFundamentals } from '../server/quote/fundamentals.js';

const QUARTER_DATES = [
  '2026-04-30',
  '2026-01-31',
  '2025-10-31',
  '2025-07-31',
  '2025-04-30',
  '2025-01-31',
  '2024-10-31',
  '2024-07-31',
];

function providerFixture() {
  return {
    'Highlights::MarketCapitalization': 4_912_000_000_000,
    'Highlights::PERatio': 32,
    'Valuation::TrailingPE': 31.0582,
    'Valuation::ForwardPE': 23.1481,
    'Financials::Income_Statement::quarterly': Object.fromEntries(
      QUARTER_DATES.map((date, index) => [date, {
        date,
        totalRevenue: String(index < 4 ? 170 : 100),
        netIncome: String(index < 4 ? 107.1 : 20),
      }]),
    ),
    'Financials::Cash_Flow::quarterly': Object.fromEntries(
      QUARTER_DATES.map((date, index) => [date, {
        date,
        freeCashFlow: String(index < 4 ? 79.9 : 10),
      }]),
    ),
  };
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

function createRequest(symbols = 'NVDA', { authorization = 'Bearer test-session', view = 'fundamentals' } = {}) {
  return {
    method: 'GET',
    headers: authorization ? { authorization } : {},
    query: { symbols, view },
  };
}

test('fundamentals parser calculates the six approved metrics from complete consecutive quarters', () => {
  const result = buildStockFundamentals(providerFixture(), {
    symbol: 'NVDA',
    now: Date.parse('2026-07-20T00:00:00Z'),
  });

  assert.equal(result.symbol, 'NVDA');
  assert.equal(result.currency, 'USD');
  assert.equal(result.asOfDate, '2026-04-30');
  assert.equal(result.marketCapitalization, 4_912_000_000_000);
  assert.equal(result.peTtm, 31.0582);
  assert.equal(result.peForward, 23.1481);
  assert.ok(Math.abs(result.revenueGrowthTtmPct - 70) < 1e-12);
  assert.ok(Math.abs(result.netMarginTtmPct - 63) < 1e-12);
  assert.ok(Math.abs(result.freeCashFlowMarginTtmPct - 47) < 1e-12);
});

test('each incomplete quarterly calculation fails closed without clearing independent metrics', () => {
  const fixture = providerFixture();
  delete fixture['Financials::Income_Statement::quarterly']['2024-10-31'];
  fixture['Financials::Income_Statement::quarterly']['2026-01-31'].netIncome = null;
  delete fixture['Financials::Cash_Flow::quarterly']['2025-10-31'];

  const result = buildStockFundamentals(fixture, { symbol: 'NVDA' });
  assert.equal(result.marketCapitalization, 4_912_000_000_000);
  assert.equal(result.peTtm, 31.0582);
  assert.equal(result.peForward, 23.1481);
  assert.equal(result.revenueGrowthTtmPct, null, 'a missing quarter must not be skipped');
  assert.equal(result.netMarginTtmPct, null, 'missing net income must not be treated as zero');
  assert.equal(result.freeCashFlowMarginTtmPct, null, 'cash flow must align to every latest revenue quarter');
});

test('negative net income and free cash flow remain real signed margins', () => {
  const fixture = providerFixture();
  for (const date of QUARTER_DATES.slice(0, 4)) {
    fixture['Financials::Income_Statement::quarterly'][date].netIncome = '-17';
    fixture['Financials::Cash_Flow::quarterly'][date].freeCashFlow = '-8.5';
  }
  const result = buildStockFundamentals(fixture, { symbol: 'NVDA' });
  assert.equal(result.netMarginTtmPct, -10);
  assert.equal(result.freeCashFlowMarginTtmPct, -5);
});

test('fundamentals view stays authenticated, requests only the filtered v1.1 data, and keeps no-store', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    key: process.env.EODHD_API_KEY,
    url: process.env.SUPABASE_URL,
    anon: process.env.SUPABASE_ANON_KEY,
  };
  const providerUrls = [];
  process.env.QUOTE_API_AUTH_REQUIRED = 'true';
  process.env.EODHD_API_KEY = 'private-test-key';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/auth/v1/user')) return jsonResponse({ id: 'user-a' });
    providerUrls.push(requestUrl);
    return jsonResponse(providerFixture());
  };

  try {
    const response = createResponse();
    await handler(createRequest(), response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.symbol, 'NVDA');
    assert.match(response.headers['Cache-Control'], /private, no-store/);
    assert.equal(providerUrls.length, 1);
    const providerUrl = new URL(providerUrls[0]);
    assert.equal(providerUrl.pathname, '/api/v1.1/fundamentals/NVDA.US');
    assert.equal(providerUrl.searchParams.get('api_token'), 'private-test-key');
    assert.match(providerUrl.searchParams.get('from'), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(providerUrl.searchParams.get('filter'), [
      'Highlights::MarketCapitalization',
      'Highlights::PERatio',
      'Valuation::TrailingPE',
      'Valuation::ForwardPE',
      'Financials::Income_Statement::quarterly',
      'Financials::Cash_Flow::quarterly',
    ].join(','));
    assert.equal(JSON.stringify(response.body).includes('private-test-key'), false);
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

test('fundamentals view returns 401 before any provider request', async () => {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  let fetchCount = 0;
  process.env.QUOTE_API_AUTH_REQUIRED = 'true';
  globalThis.fetch = async () => {
    fetchCount += 1;
    return jsonResponse({});
  };
  try {
    const response = createResponse();
    await handler(createRequest('NVDA', { authorization: '' }), response);
    assert.equal(response.statusCode, 401);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
  }
});

test('fundamentals view rejects multiple symbols and non-stock providers', async () => {
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-key';
  try {
    const multiple = createResponse();
    await handler(createRequest('NVDA,MSFT', { authorization: '' }), multiple);
    assert.equal(multiple.statusCode, 400);

    const special = createResponse();
    await handler(createRequest('VIX', { authorization: '' }), special);
    assert.equal(special.statusCode, 400);
  } finally {
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});
