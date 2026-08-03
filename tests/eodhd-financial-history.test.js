import assert from 'node:assert/strict';
import test from 'node:test';

import { handleEarningsGrowthRequest } from '../api/earnings-calendar.js';
import {
  buildEodhdFinancialHistory,
  clearEodhdFinancialHistoryCachesForTests,
  EODHD_FINANCIAL_HISTORY_FILTER,
  EODHD_FINANCIAL_HISTORY_SCHEMA_VERSION,
  EODHD_TSM_FX_BASIS,
  EODHD_TSM_FX_SYMBOL,
  fetchEodhdFinancialHistory,
} from '../server/earnings/eodhdFinancialHistory.js';

const ANNUAL_DATES = Array.from({ length: 29 }, (_, index) => (
  `${1997 + index}-12-31`
));
const QUARTER_SUFFIXES = ['03-31', '06-30', '09-30', '12-31'];
const QUARTER_DATES = Array.from({ length: 118 }, (_, index) => {
  const ordinal = (1997 * 4) + index;
  const year = Math.floor(ordinal / 4);
  return `${year}-${QUARTER_SUFFIXES[ordinal % 4]}`;
});

function incomeRows(dates, { revenueBase, netIncomeBase, latestFilingDate }) {
  return Object.fromEntries(dates.map((date, index) => [date, {
    date,
    filing_date: index === dates.length - 1 ? latestFilingDate : date,
    currency_symbol: 'TWD',
    totalRevenue: String(revenueBase + index * 100),
    netIncome: String(netIncomeBase + index * 20),
  }]));
}

function providerFixture() {
  return {
    'General::Code': 'TSM',
    'General::CurrencyCode': 'USD',
    'General::PrimaryTicker': '2330.TW',
    'Financials::Income_Statement::currency_symbol': 'TWD',
    'Financials::Income_Statement::yearly': incomeRows(ANNUAL_DATES, {
      revenueBase: 1_000,
      netIncomeBase: 200,
      latestFilingDate: '2026-04-16',
    }),
    'Financials::Income_Statement::quarterly': incomeRows(QUARTER_DATES, {
      revenueBase: 300,
      netIncomeBase: 60,
      latestFilingDate: '2026-07-16',
    }),
  };
}

function defaultFxRate(date) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const quarter = Math.floor((month - 1) / 3) + 1;
  return 28 + ((year - 2019) * 0.5) + (quarter * 0.125);
}

function fxFixture({
  from = '2019-01-01',
  to = '2026-06-30',
  rateForDate = defaultFxRate,
} = {}) {
  const rows = [];
  const endMs = Date.parse(`${to}T00:00:00.000Z`);
  for (
    let cursor = Date.parse(`${from}T00:00:00.000Z`);
    cursor <= endMs;
    cursor += 86_400_000
  ) {
    const date = new Date(cursor);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;
    const key = date.toISOString().slice(0, 10);
    rows.push({ date: key, close: String(rateForDate(key)) });
  }
  return rows;
}

function averageFxRate(rows, startDate, endDate) {
  const selected = rows.filter((row) => row.date >= startDate && row.date <= endDate);
  return selected.reduce((sum, row) => sum + Number(row.close), 0) / selected.length;
}

function providerResponse(url, {
  fundamentals = providerFixture(),
  fx = fxFixture(),
} = {}) {
  const parsed = new URL(url);
  if (parsed.pathname === '/api/v1.1/fundamentals/TSM.US') {
    return jsonResponse(fundamentals);
  }
  if (parsed.pathname === `/api/eod/${EODHD_TSM_FX_SYMBOL}`) {
    return jsonResponse(fx);
  }
  throw new Error(`unexpected provider URL: ${parsed.pathname}`);
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

test('builds strict TSM USD growth with independent period-average FX rates', () => {
  const fx = fxFixture();
  const result = buildEodhdFinancialHistory(providerFixture(), {
    symbol: 'TSM',
    asOfDate: '2026-08-03',
    fxData: fx,
  });

  assert.equal(result.schemaVersion, EODHD_FINANCIAL_HISTORY_SCHEMA_VERSION);
  assert.equal(result.status, 'complete');
  assert.equal(result.reason, null);
  assert.equal(result.symbol, 'TSM');
  assert.equal(result.currency, 'USD');
  assert.equal(result.originalCurrency, 'TWD');
  assert.equal(result.fxBasis, EODHD_TSM_FX_BASIS);
  assert.equal(result.source.provider, 'EODHD');
  assert.equal(result.source.listingCurrency, 'USD');
  assert.equal(result.source.asOfDate, '2026-07-16');
  assert.equal(result.source.fxSymbol, EODHD_TSM_FX_SYMBOL);
  assert.equal(result.source.fxFromDate, '2019-01-01');
  assert.equal(result.source.fxToDate, '2026-06-30');
  assert.deepEqual(result.annual.map((row) => row.fiscalYear), [
    'FY2020',
    'FY2021',
    'FY2022',
    'FY2023',
    'FY2024',
    'FY2025',
  ]);
  assert.deepEqual(result.quarterly.map((row) => `${row.fiscalYear}-${row.fiscalQuarter}`), [
    'FY2024-Q3',
    'FY2024-Q4',
    'FY2025-Q1',
    'FY2025-Q2',
    'FY2025-Q3',
    'FY2025-Q4',
    'FY2026-Q1',
    'FY2026-Q2',
  ]);
  const annualRate2025 = averageFxRate(fx, '2025-01-01', '2025-12-31');
  const annualRate2024 = averageFxRate(fx, '2024-01-01', '2024-12-31');
  const quarterRate2026Q2 = averageFxRate(fx, '2026-04-01', '2026-06-30');
  const quarterRate2026Q1 = averageFxRate(fx, '2026-01-01', '2026-03-31');
  assert.equal(result.annual.at(-1).revenue, Math.round(3_800 / annualRate2025));
  assert.equal(result.annual.at(-1).netIncome, Math.round(760 / annualRate2025));
  assert.equal(result.annual.at(-1).originalRevenue, 3_800);
  assert.equal(result.annual.at(-1).originalCurrency, 'TWD');
  assert.equal(result.annual.at(-1).netMarginPct, 20);
  assert.equal(
    result.annual.at(-1).revenueYoyPct,
    ((Math.round(3_800 / annualRate2025) / Math.round(3_700 / annualRate2024)) - 1) * 100,
  );
  assert.equal(
    result.quarterly.at(-1).revenueQoqPct,
    ((Math.round(12_000 / quarterRate2026Q2) / Math.round(11_900 / quarterRate2026Q1)) - 1) * 100,
  );
  assert.equal('eps' in result.annual.at(-1), false);
});

test('keeps the official TSM Q2 revenue scale when converting TWD to USD', () => {
  const fundamentals = providerFixture();
  fundamentals['Financials::Income_Statement::quarterly']['2026-06-30'] = {
    ...fundamentals['Financials::Income_Statement::quarterly']['2026-06-30'],
    totalRevenue: '1270381000000',
    netIncome: '706562000000',
  };
  const result = buildEodhdFinancialHistory(fundamentals, {
    symbol: 'TSM',
    asOfDate: '2026-08-03',
    fxData: fxFixture({ rateForDate: () => 31.6 }),
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.quarterly.at(-1).originalRevenue, 1_270_381_000_000);
  assert.equal(result.quarterly.at(-1).fxRate, 31.6);
  assert.equal(result.quarterly.at(-1).revenue, 40_201_930_380);
});

test('accepts the nested fundamentals shape and optional missing General identity fields', () => {
  const flat = providerFixture();
  const nested = {
    General: {},
    Financials: {
      Income_Statement: {
        currency_symbol: flat['Financials::Income_Statement::currency_symbol'],
        yearly: flat['Financials::Income_Statement::yearly'],
        quarterly: flat['Financials::Income_Statement::quarterly'],
      },
    },
  };
  const result = buildEodhdFinancialHistory(nested, {
    symbol: 'TSM.US',
    asOfDate: '2026-08-03',
    fxData: fxFixture(),
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.currency, 'USD');
  assert.equal(result.originalCurrency, 'TWD');
  assert.equal(result.source.listingCurrency, undefined);
});

test('fails closed on current conflicts while preserving verified partial or older history', () => {
  const cases = [];

  const wrongCode = structuredClone(providerFixture());
  wrongCode['General::Code'] = 'TSM2';
  cases.push([wrongCode, 'unavailable', 'eodhd-tsm-code-mismatch']);

  const wrongCurrency = structuredClone(providerFixture());
  wrongCurrency['Financials::Income_Statement::currency_symbol'] = 'USD';
  cases.push([wrongCurrency, 'unavailable', 'eodhd-tsm-reporting-currency-mismatch']);

  const wrongPrimaryTicker = structuredClone(providerFixture());
  wrongPrimaryTicker['General::PrimaryTicker'] = 'NVDA.US';
  cases.push([wrongPrimaryTicker, 'unavailable', 'eodhd-tsm-primary-ticker-mismatch']);

  const rowCurrencyMismatch = structuredClone(providerFixture());
  rowCurrencyMismatch['Financials::Income_Statement::quarterly']['2026-06-30'].currency_symbol = 'USD';
  cases.push([rowCurrencyMismatch, 'unavailable', 'eodhd-tsm-quarterly-currency-mismatch']);

  const duplicate = structuredClone(providerFixture());
  duplicate['Financials::Income_Statement::quarterly'].duplicate = {
    ...duplicate['Financials::Income_Statement::quarterly']['2026-06-30'],
  };
  cases.push([duplicate, 'unavailable', 'duplicate-eodhd-tsm-quarterly-period']);

  const gap = structuredClone(providerFixture());
  delete gap['Financials::Income_Statement::quarterly']['2025-06-30'];
  cases.push([gap, 'partial', 'incomplete-eodhd-tsm-history']);

  const future = structuredClone(providerFixture());
  future['Financials::Income_Statement::quarterly']['2026-09-30'] = {
    date: '2026-09-30',
    currency_symbol: 'TWD',
    totalRevenue: '1100',
    netIncome: '210',
  };
  cases.push([future, 'unavailable', 'future-eodhd-tsm-quarterly-row']);

  const invalidCurrentFiling = structuredClone(providerFixture());
  invalidCurrentFiling['Financials::Income_Statement::quarterly']['2026-06-30'].filing_date = '2026-06-29';
  cases.push([invalidCurrentFiling, 'unavailable', 'invalid-eodhd-tsm-quarterly-filing-date']);

  for (const [fixture, status, reason] of cases) {
    const result = buildEodhdFinancialHistory(fixture, {
      symbol: 'TSM',
      asOfDate: '2026-08-03',
      fxData: fxFixture(),
    });
    assert.equal(result.status, status, reason);
    assert.equal(result.reason, reason);
    if (status === 'unavailable') {
      assert.equal(result.annual.length, 0);
      assert.equal(result.quarterly.length, 0);
    } else {
      assert.equal(result.annual.length, 6);
      assert.equal(result.quarterly.length, 4);
    }
  }

  const ancientIncomplete = structuredClone(providerFixture());
  ancientIncomplete['Financials::Income_Statement::yearly']['2010-12-31'] = {
    date: '2010-12-31',
    currency_symbol: 'TWD',
    totalRevenue: null,
    netIncome: null,
  };
  const preserved = buildEodhdFinancialHistory(ancientIncomplete, {
    symbol: 'TSM',
    asOfDate: '2026-08-03',
    fxData: fxFixture(),
  });
  assert.equal(preserved.status, 'complete');
  assert.equal(preserved.annual.length, 6);
  assert.equal(preserved.quarterly.length, 8);
});

test('fails closed when historical FX is ambiguous, invalid, future, or incomplete', () => {
  const completeFx = fxFixture();
  const duplicateFx = [...completeFx, { ...completeFx[0] }];
  const futureFx = [...completeFx, { date: '2026-09-01', close: '31.6' }];
  const invalidCloseFx = structuredClone(completeFx);
  invalidCloseFx[10].close = '0';
  const sparseFx = completeFx.filter((_, index) => index % 3 === 0);
  const cases = [
    [null, 'invalid-eodhd-tsm-fx-history'],
    [duplicateFx, 'duplicate-eodhd-tsm-fx-date'],
    [futureFx, 'future-eodhd-tsm-fx-row'],
    [invalidCloseFx, 'invalid-eodhd-tsm-fx-close'],
    [sparseFx, 'incomplete-eodhd-tsm-fx-coverage'],
  ];

  for (const [fxData, reason] of cases) {
    const result = buildEodhdFinancialHistory(providerFixture(), {
      symbol: 'TSM',
      asOfDate: '2026-08-03',
      fxData,
    });
    assert.equal(result.status, 'unavailable', reason);
    assert.equal(result.reason, reason);
    assert.equal(result.currency, '');
    assert.equal(result.annual.length, 0);
    assert.equal(result.quarterly.length, 0);
  }
});

test('coalesces TSM provider reads and reuses the public six-hour cache without retaining tokens', async () => {
  clearEodhdFinancialHistoryCachesForTests();
  const requested = [];
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const fetchFn = async (url) => {
    requested.push(url);
    await pending;
    return providerResponse(url);
  };
  const options = {
    symbol: 'TSM.US',
    eodhdKey: 'first-secret-token',
    fetchFn,
    now: new Date('2026-08-03T12:00:00.000Z'),
    nowMs: Date.parse('2026-08-03T12:00:00.000Z'),
  };

  const first = fetchEodhdFinancialHistory(options);
  const second = fetchEodhdFinancialHistory(options);
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(requested.length, 2);
  assert.deepEqual(firstResult, secondResult);

  const fundamentalsUrl = new URL(requested[0]);
  assert.equal(fundamentalsUrl.pathname, '/api/v1.1/fundamentals/TSM.US');
  assert.equal(fundamentalsUrl.pathname.includes('.US.US'), false);
  assert.equal(fundamentalsUrl.searchParams.get('filter'), EODHD_FINANCIAL_HISTORY_FILTER);
  assert.equal(fundamentalsUrl.searchParams.get('api_token'), 'first-secret-token');
  assert.equal(fundamentalsUrl.searchParams.has('from'), false);
  const fxUrl = new URL(requested[1]);
  assert.equal(fxUrl.pathname, `/api/eod/${EODHD_TSM_FX_SYMBOL}`);
  assert.equal(fxUrl.searchParams.get('from'), '2019-01-01');
  assert.equal(fxUrl.searchParams.get('to'), '2026-06-30');
  assert.equal(fxUrl.searchParams.get('period'), 'd');
  assert.equal(fxUrl.searchParams.get('order'), 'a');
  assert.equal(fxUrl.searchParams.get('api_token'), 'first-secret-token');
  assert.equal(JSON.stringify(firstResult).includes('first-secret-token'), false);

  const cached = await fetchEodhdFinancialHistory({
    ...options,
    eodhdKey: 'second-secret-token',
    fetchFn: async () => {
      throw new Error('the cache should avoid another provider request');
    },
  });
  assert.equal(cached.status, 'complete');
  assert.equal(cached.currency, 'USD');
  assert.equal(JSON.stringify(cached).includes('second-secret-token'), false);
});

test('opens the in-instance UTC-day breaker on the first EODHD 402 without retry or fallback', async () => {
  clearEodhdFinancialHistoryCachesForTests();
  let fetchCount = 0;
  const fetchFn = async () => {
    fetchCount += 1;
    return jsonResponse({ error: 'quota exceeded' }, 402);
  };
  const options = {
    symbol: 'TSM',
    eodhdKey: 'quota-token',
    fetchFn,
    now: new Date('2026-08-03T12:00:00.000Z'),
    nowMs: Date.parse('2026-08-03T12:00:00.000Z'),
  };

  const first = await fetchEodhdFinancialHistory(options);
  const second = await fetchEodhdFinancialHistory(options);
  assert.equal(first.status, 'unavailable');
  assert.equal(first.reason, 'eodhd-daily-quota-exhausted');
  assert.deepEqual(second, first);
  assert.equal(fetchCount, 1);
});

test('FX quota failure never publishes a mixed TWD and USD history', async () => {
  clearEodhdFinancialHistoryCachesForTests();
  const requestedPaths = [];
  const options = {
    symbol: 'TSM',
    eodhdKey: 'quota-token',
    fetchFn: async (url) => {
      const path = new URL(url).pathname;
      requestedPaths.push(path);
      if (path === '/api/v1.1/fundamentals/TSM.US') {
        return jsonResponse(providerFixture());
      }
      return jsonResponse({ error: 'quota exceeded' }, 402);
    },
    now: new Date('2026-08-03T12:00:00.000Z'),
    nowMs: Date.parse('2026-08-03T12:00:00.000Z'),
  };

  const first = await fetchEodhdFinancialHistory(options);
  const second = await fetchEodhdFinancialHistory(options);
  assert.equal(first.status, 'unavailable');
  assert.equal(first.reason, 'eodhd-daily-quota-exhausted');
  assert.equal(first.currency, '');
  assert.deepEqual(second, first);
  assert.deepEqual(requestedPaths, [
    '/api/v1.1/fundamentals/TSM.US',
    `/api/eod/${EODHD_TSM_FX_SYMBOL}`,
  ]);
});

test('serves the last verified public history as stale when a post-TTL refresh receives 402', async () => {
  clearEodhdFinancialHistoryCachesForTests();
  const firstNowMs = Date.parse('2026-08-03T01:00:00.000Z');
  let fetchCount = 0;
  const first = await fetchEodhdFinancialHistory({
    symbol: 'TSM',
    eodhdKey: 'cache-token',
    fetchFn: async (url) => {
      fetchCount += 1;
      return providerResponse(url);
    },
    now: new Date(firstNowMs),
    nowMs: firstNowMs,
  });
  assert.equal(first.status, 'complete');

  const refreshNowMs = firstNowMs + 7 * 60 * 60 * 1000;
  const stale = await fetchEodhdFinancialHistory({
    symbol: 'TSM',
    eodhdKey: 'quota-token',
    fetchFn: async () => {
      fetchCount += 1;
      return jsonResponse({ error: 'quota exceeded' }, 402);
    },
    now: new Date(refreshNowMs),
    nowMs: refreshNowMs,
  });
  assert.equal(stale.status, 'complete');
  assert.equal(stale.stale, true);
  assert.equal(stale.staleReason, 'eodhd-daily-quota-exhausted');
  assert.equal(stale.currency, 'USD');
  assert.equal(fetchCount, 3);

  const breakerStale = await fetchEodhdFinancialHistory({
    symbol: 'TSM',
    eodhdKey: 'quota-token',
    fetchFn: async () => {
      throw new Error('breaker should prevent another provider request');
    },
    now: new Date(refreshNowMs + 1_000),
    nowMs: refreshNowMs + 1_000,
  });
  assert.equal(breakerStale.stale, true);
  assert.equal(fetchCount, 3);
});

test('earnings growth handler routes TSM to filtered EODHD history and keeps a private six-hour response', async () => {
  clearEodhdFinancialHistoryCachesForTests();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.EODHD_API_KEY;
  const providerUrls = [];
  globalThis.fetch = async (url) => {
    providerUrls.push(String(url));
    return providerResponse(url);
  };
  process.env.EODHD_API_KEY = 'handler-secret-token';
  try {
    const res = createResponse();
    await handleEarningsGrowthRequest({ query: { symbol: 'TSM' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.symbol, 'TSM');
    assert.equal(res.body.currency, 'USD');
    assert.equal(res.body.originalCurrency, 'TWD');
    assert.equal(res.body.fxBasis, EODHD_TSM_FX_BASIS);
    assert.equal(res.body.source.provider, 'EODHD');
    assert.equal(res.headers['Cache-Control'], 'private, max-age=21600, stale-while-revalidate=1800');
    assert.equal(providerUrls.length, 2);
    assert.equal(new URL(providerUrls[0]).searchParams.get('filter'), EODHD_FINANCIAL_HISTORY_FILTER);
    assert.equal(new URL(providerUrls[1]).pathname, `/api/eod/${EODHD_TSM_FX_SYMBOL}`);
    assert.equal(JSON.stringify(res.body).includes('handler-secret-token'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
    clearEodhdFinancialHistoryCachesForTests();
  }
});
