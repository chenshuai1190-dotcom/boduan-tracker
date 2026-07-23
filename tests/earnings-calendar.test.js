import test from 'node:test';
import assert from 'node:assert/strict';

import handler, {
  calculateEarningsMarketReaction,
  enrichPublishedEarningsData,
  mergeEarningsRevenueUsd,
  mergeEarningsTrendData,
  parseEarningsRequest,
  previousCalendarQuarterRange,
  resolvePublishedEps,
  resolveReportedEbit,
  resolveReportedRevenue,
} from '../api/earnings-calendar.js';
import {
  buildCalendarMonth,
  buildEarningsSymbols,
  classifyEarningsResult,
  groupEarningsByDate,
  isEarningsVisible,
  normalizeEarningsEvents,
  shouldPromoteEarningsCalendar,
} from '../src/lib/earningsCalendarModel.js';

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

function createRequest(query) {
  return {
    method: 'GET',
    headers: {},
    query,
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

test('earnings calendar request validates symbols and date range', () => {
  assert.deepEqual(parseEarningsRequest({ symbols: 'nvda, msft.us', from: '2026-07-01', to: '2026-07-31' }), {
    symbols: ['NVDA', 'MSFT'],
    from: '2026-07-01',
    to: '2026-07-31',
    includePreviousPublished: false,
  });
  assert.equal(parseEarningsRequest({ symbols: 'NVDA', includePreviousPublished: '1' }).includePreviousPublished, true);
  assert.deepEqual(previousCalendarQuarterRange('2026-07-09'), { from: '2026-04-01', to: '2026-06-30' });
  assert.deepEqual(previousCalendarQuarterRange('2026-01-15'), { from: '2025-10-01', to: '2025-12-31' });

  assert.match(parseEarningsRequest({ symbols: 'NV DA' }).error, /股票代码不合法/);
  assert.match(parseEarningsRequest({ symbols: 'NVDA', from: '2026-09-01', to: '2026-07-01' }).error, /from 不能晚于 to/);
  assert.match(parseEarningsRequest({ symbols: 'NVDA', from: '2026-01-01', to: '2026-05-01' }).error, /查询区间不能超过/);
});

test('earnings calendar API rejects unauthenticated requests before provider access', async () => {
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  process.env.QUOTE_API_AUTH_REQUIRED = 'true';
  try {
    const res = createResponse();
    await handler(createRequest({ symbols: 'NFLX', from: '2026-07-16', to: '2026-07-18' }), res);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /未授权/);
  } finally {
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
  }
});

test('earnings market reaction uses ordinary close and refuses to guess an unknown report session', () => {
  const rows = [
    { date: '2026-07-14', close: 100, adjusted_close: 50 },
    { date: '2026-07-15', close: 105, adjusted_close: 60 },
    { date: '2026-07-16', close: 110, adjusted_close: 70 },
  ];

  assert.deepEqual(calculateEarningsMarketReaction({
    rows,
    reportDate: '2026-07-15',
    session: 'pre',
  }), {
    baseDate: '2026-07-14',
    targetDate: '2026-07-15',
    percent: 5,
    session: 'pre',
  });
  assert.equal(calculateEarningsMarketReaction({
    rows,
    reportDate: '2026-07-15',
    session: 'unknown',
  }), null);
});

test('earnings result derives a real EPS or USD revenue surprise when the provider omits its percent', () => {
  assert.equal(classifyEarningsResult({ epsActual: 7.58, epsEstimate: 7.98 }), 'miss');
  assert.equal(classifyEarningsResult({ revenueActualUsd: 107.9, revenueEstimateUsd: 104.2 }), 'beat');
  assert.equal(classifyEarningsResult({ epsActual: 7.58, epsEstimate: null }), null);
});

test('published ASML uses the exact 0q Trends EPS consensus and recomputes its surprise', () => {
  const [event] = mergeEarningsTrendData([
    {
      code: 'ASML.US',
      report_date: '2026-07-15',
      date: '2026-06-30',
      currency: 'EUR',
      actual: '7.58',
      estimate: '7.98',
      difference: '-0.40',
      percent: '-5.0125',
    },
  ], [
    {
      code: 'ASML.US',
      date: '2026-06-30',
      period: '+1q',
      earningsEstimateAvg: '8.42',
    },
    {
      code: 'ASML.US',
      date: '2026-06-30',
      period: '0q',
      earningsEstimateAvg: '6.8954',
    },
  ]);

  assert.equal(event.epsActual, 7.58);
  assert.equal(event.epsEstimate, 6.8954);
  assert.ok(Math.abs(event.epsDifference - 0.6846) < 1e-12);
  assert.ok(Math.abs(event.surprisePercent - 9.928358035791971) < 1e-12);
});

test('earnings model builds deduped symbols and grouped calendar days', () => {
  const symbols = buildEarningsSymbols({
    positions: [{ symbol: ' nvda ' }, { symbol: 'MSFT.US' }],
    watchlist: [{ symbol: 'NVDA' }, { symbol: 'META' }],
  });
  assert.deepEqual(symbols, ['NVDA', 'MSFT', 'META']);

  const events = normalizeEarningsEvents([
    { code: 'NVDA.US', report_date: '2026-07-08', before_after_market: 'before-market' },
    { code: 'META.US', report_date: '2026-07-10', before_after_market: 'after-hours' },
    { code: 'TSM.US', report_date: '2026-07-11', before_after_market: 'before-market', impact: 'high' },
  ], {
    positions: [{ symbol: 'NVDA' }],
    watchlist: [{ symbol: 'META' }],
  });
  const grouped = groupEarningsByDate(events);
  assert.equal(grouped.get('2026-07-08')[0].impact, 'high');
  assert.equal(grouped.get('2026-07-10')[0].session, 'post');
  assert.equal(grouped.get('2026-07-11')[0].impact, 'high');
  assert.equal(buildCalendarMonth('2026-07-01', events).length, 42);
});

test('earnings model prefers enriched EPS fields over stale provider aliases', () => {
  const [event] = normalizeEarningsEvents([{
    code: 'GOOGL.US',
    report_date: '2026-07-22',
    date: '2026-06-30',
    actual: 2.31,
    epsActual: 9.11,
    epsActualSource: 'eodhd-fundamentals-earnings-history',
    estimate: 2.9,
    epsEstimate: 2.87,
    difference: -0.59,
    epsDifference: 6.24,
    percent: -20.34,
    surprisePercent: 217.42,
  }]);

  assert.equal(event.epsActual, 9.11);
  assert.equal(event.epsEstimate, 2.87);
  assert.equal(event.epsDifference, 6.24);
  assert.equal(event.surprisePercent, 217.42);
  assert.equal(event.epsActualSource, 'eodhd-fundamentals-earnings-history');
});

test('earnings model keeps SEC provenance and metric bases through normalization', () => {
  const [event] = normalizeEarningsEvents([{
    code: 'TSLA.US',
    report_date: '2026-07-22',
    date: '2026-06-30',
    epsActual: 0.32,
    epsPreviousYear: 0.33,
    epsActualSource: 'sec-exhibit',
    epsActualBasis: 'EarningsPerShareDiluted',
    revenueActual: 28_236_000_000,
    revenueActualSource: 'sec-exhibit',
    revenueActualBasis: 'TotalRevenues',
    ebitActual: 398_000_000,
    ebitActualSource: 'sec-exhibit',
    ebitActualBasis: 'OperatingIncomeLoss',
    officialActualSchemaVersion: 1,
    officialActualStatus: 'complete',
    officialActualSource: 'sec-exhibit',
    secCik: '0001318605',
    secAccession: '0001628280-26-049213',
    secForm: '8-K',
    secFiledAt: '2026-07-22T20:35:52.000Z',
    secFilingUrl: 'https://www.sec.gov/example',
  }]);

  assert.equal(event.officialActualSchemaVersion, 1);
  assert.equal(event.officialActualStatus, 'complete');
  assert.equal(event.epsActualBasis, 'EarningsPerShareDiluted');
  assert.equal(event.revenueActualSource, 'sec-exhibit');
  assert.equal(event.revenueActualBasis, 'TotalRevenues');
  assert.equal(event.secAccession, '0001628280-26-049213');
  assert.equal(event.secFilingUrl, 'https://www.sec.gov/example');
});

test('published earnings enrichment overlays SEC actuals without changing EODHD estimates', async () => {
  const [event] = await enrichPublishedEarningsData({
    events: [{
      symbol: 'TSLA',
      code: 'TSLA.US',
      reportDate: '2026-07-22',
      fiscalDate: '2026-06-30',
      session: 'post',
      currency: 'USD',
      epsActual: null,
      actual: 0.27,
      difference: -0.04,
      percent: -12.9,
      epsEstimate: 0.31,
      revenueEstimate: 26_400_000_000,
    }],
    eodhdKey: 'test-key',
    now: new Date('2026-07-23T12:00:00.000Z'),
    fetchPublishedFundamentals: async () => new Map([['TSLA', {
      sector: 'Consumer Cyclical',
      incomeRows: [],
      earningsHistoryRows: [],
    }]]),
    fetchEodRows: async () => new Map([['TSLA', []]]),
    fetchOfficialActuals: async () => new Map([['TSLA|2026-06-30', {
      key: 'TSLA|2026-06-30',
      officialActualSchemaVersion: 1,
      officialActualStatus: 'complete',
      officialActualSource: 'sec-exhibit',
      actualBasis: 'gaap',
      secCik: '0001318605',
      accession: '0001628280-26-049213',
      form: '8-K',
      filedAt: '2026-07-22T20:35:52.000Z',
      filingUrl: 'https://www.sec.gov/example-index',
      exhibitUrl: 'https://www.sec.gov/example-exhibit',
      epsActual: 0.32,
      epsPreviousYear: 0.33,
      epsActualBasis: 'EarningsPerShareDiluted',
      revenueActual: 28_236_000_000,
      revenuePreviousYear: 22_496_000_000,
      revenueActualBasis: 'totalRevenue',
      ebitActual: 398_000_000,
      ebitPreviousYear: 923_000_000,
      ebitActualBasis: 'operatingIncome',
    }]]),
  });

  assert.equal(event.epsEstimate, 0.31);
  assert.equal(event.revenueEstimate, 26_400_000_000);
  assert.equal(event.epsActual, 0.32);
  assert.equal(event.actual, 0.32);
  assert.equal(event.epsPreviousYear, 0.33);
  assert.ok(Math.abs(event.epsDifference - 0.01) < 1e-12);
  assert.ok(Math.abs(event.difference - 0.01) < 1e-12);
  assert.ok(Math.abs(event.surprisePercent - 3.225806451612906) < 1e-12);
  assert.ok(Math.abs(event.percent - 3.225806451612906) < 1e-12);
  assert.equal(event.revenueActual, 28_236_000_000);
  assert.equal(event.ebitActual, 398_000_000);
  assert.equal(event.officialActualStatus, 'complete');
  assert.equal(event.officialActualSource, 'sec-exhibit');
  assert.equal(event.publishedFinancialsComplete, true);
});

test('official enrichment uses the New York retention date across the UTC evening boundary', async () => {
  let officialCandidates = [];
  await enrichPublishedEarningsData({
    events: [{
      symbol: 'TSLA',
      code: 'TSLA.US',
      reportDate: '2026-07-20',
      fiscalDate: '2026-06-30',
      session: 'post',
      currency: 'USD',
      epsActual: null,
      epsEstimate: 0.31,
    }],
    eodhdKey: 'test-key',
    now: new Date('2026-07-23T02:00:00.000Z'),
    fetchPublishedFundamentals: async () => new Map([['TSLA', {
      sector: 'Consumer Cyclical',
      incomeRows: [],
      earningsHistoryRows: [],
    }]]),
    fetchEodRows: async () => new Map([['TSLA', []]]),
    fetchOfficialActuals: async ({ events }) => {
      officialCandidates = events;
      return new Map();
    },
  });

  assert.equal(officialCandidates.length, 1);
  assert.equal(officialCandidates[0].reportDate, '2026-07-20');
});

test('earnings model keeps published reports visible for two days with result status', () => {
  const events = normalizeEarningsEvents([
    {
      code: 'NVDA.US',
      report_date: '2026-07-08',
      date: '2026-06-30',
      before_after_market: 'BeforeMarket',
      actual: 0.72,
      estimate: 0.68,
      percent: 5.9,
      revenueEstimateUsd: 284500000000,
      revenueActualUsd: 290100000000,
      revenueSurprisePercent: 2,
      ebitActual: 75_000_000_000,
      ebitActualUsd: 75_000_000_000,
      ebitActualOriginalCurrency: 'USD',
      ebitActualBasis: 'ebit',
      ebitPreviousYear: 60_000_000_000,
      ebitPreviousYearUsd: 60_000_000_000,
      ebitPreviousYearBasis: 'ebit',
      ebitActualYoyPercent: 25,
    },
    {
      code: 'TSM.US',
      report_date: '2026-07-08',
      before_after_market: 'BeforeMarket',
      estimate: 1.45,
    },
  ]);

  const [published, unpublished] = events;
  assert.equal(published.earningsPublished, true);
  assert.equal(published.publishedUntil, '2026-07-10');
  assert.equal(published.earningsResult, 'beat');
  assert.equal(published.ebitActualUsd, 75_000_000_000);
  assert.equal(published.ebitPreviousYearUsd, 60_000_000_000);
  assert.equal(published.ebitActualYoyPercent, 25);
  assert.equal(published.ebitActualBasis, 'ebit');
  assert.equal(published.ebitPreviousYearBasis, 'ebit');
  assert.equal(classifyEarningsResult({ surprisePercent: 4.5, revenueSurprisePercent: -1.8 }), 'mixed');
  assert.equal(isEarningsVisible(published, '2026-07-10'), true);
  assert.equal(isEarningsVisible(published, '2026-07-11'), false);
  assert.equal(isEarningsVisible(unpublished, '2026-07-08'), true);
  assert.equal(isEarningsVisible(unpublished, '2026-07-09'), false);
});

test('earnings financial merge converts EBIT to USD without inventing a forecast', () => {
  const [event, negativeBaseline] = mergeEarningsRevenueUsd([
    {
      symbol: 'ASML',
      reportDate: '2026-07-15',
      currency: 'EUR',
      epsActual: 7.59,
      ebitActual: 4_000_000_000,
      ebitActualOriginalCurrency: 'EUR',
      ebitPreviousYear: 2_000_000_000,
      ebitPreviousYearOriginalCurrency: 'EUR',
    },
    {
      symbol: 'LOSS',
      reportDate: '2026-07-15',
      currency: 'USD',
      epsActual: -1,
      ebitActual: 2_000_000,
      ebitActualOriginalCurrency: 'USD',
      ebitPreviousYear: -1_000_000,
      ebitPreviousYearOriginalCurrency: 'USD',
    },
  ], new Map([
    ['EUR', { localPerUsd: 0.8, source: 'USDEUR.FOREX' }],
  ]));

  assert.equal(event.ebitActualUsd, 5_000_000_000);
  assert.equal(event.ebitPreviousYearUsd, 2_500_000_000);
  assert.equal(event.ebitActualCurrency, 'USD');
  assert.equal(event.ebitActualOriginalCurrency, 'EUR');
  assert.equal(event.ebitActualFxRate, 0.8);
  assert.equal(event.ebitActualFxSource, 'USDEUR.FOREX');
  assert.equal(event.ebitActualYoyPercent, 100);
  assert.equal(event.ebitEstimate, undefined);
  assert.equal(negativeBaseline.ebitActualYoyPercent, null);
});

test('reported operating result uses the sector-safe basis and never falls back to generic EBIT', () => {
  assert.deepEqual(resolveReportedEbit({
    ebit: '139010000000.00',
    operatingIncome: '40770000000.00',
    incomeBeforeTax: '138753000000.00',
  }, {
    ebit: '34200000000.00',
    operatingIncome: '31271000000.00',
    incomeBeforeTax: '33933000000.00',
  }, 'Technology'), {
    actual: 40770000000,
    previousYear: 31271000000,
    basis: 'operatingIncome',
  });

  assert.deepEqual(resolveReportedEbit({
    ebit: '2550000000.00',
    operatingIncome: '2511000000.00',
    incomeBeforeTax: '1456000000.00',
  }, {
    ebit: '2134000000.00',
    operatingIncome: '2100000000.00',
    incomeBeforeTax: '1104000000.00',
  }, 'Financial Services'), {
    actual: 1456000000,
    previousYear: 1104000000,
    basis: 'incomeBeforeTax',
  });

  assert.deepEqual(resolveReportedEbit({
    ebit: '25000000000.00',
  }, {
    ebit: '10000000000.00',
  }), {
    actual: null,
    previousYear: null,
    basis: null,
  });
});

test('reported revenue keeps ordinary-company totals but hides unverified financial gross revenue', () => {
  assert.deepEqual(resolveReportedRevenue({
    totalRevenue: '119796000000.00',
  }, {
    totalRevenue: '96428000000.00',
  }, 'Technology'), {
    actual: 119796000000,
    previousYear: 96428000000,
    basis: 'totalRevenue',
  });

  assert.deepEqual(resolveReportedRevenue({
    totalRevenue: '2951000000.00',
  }, {
    totalRevenue: '2467400000.00',
  }, 'Financial Services'), {
    actual: null,
    previousYear: null,
    basis: null,
  });
});

test('Tesla Q2 fixture keeps official revenue and operating-profit bases distinct from pretax income', () => {
  const current = {
    totalRevenue: '28236000000.00',
    operatingIncome: '398000000.00',
    incomeBeforeTax: '1329000000.00',
    ebit: '1410000000.00',
  };
  const previous = {
    totalRevenue: '22496000000.00',
    operatingIncome: '923000000.00',
    incomeBeforeTax: '1549000000.00',
    ebit: '1635000000.00',
  };
  const revenue = resolveReportedRevenue(current, previous, 'Consumer Cyclical');
  const operatingProfit = resolveReportedEbit(current, previous, 'Consumer Cyclical');
  const [event] = mergeEarningsRevenueUsd([{
    symbol: 'TSLA',
    reportDate: '2026-07-22',
    fiscalDate: '2026-06-30',
    currency: 'USD',
    epsActual: 0.32,
    epsPreviousYear: 0.33,
    revenueActual: revenue.actual,
    revenuePreviousYear: revenue.previousYear,
    ebitActual: operatingProfit.actual,
    ebitPreviousYear: operatingProfit.previousYear,
  }]);

  assert.equal(revenue.actual, 28_236_000_000);
  assert.equal(revenue.previousYear, 22_496_000_000);
  assert.equal(operatingProfit.actual, 398_000_000);
  assert.equal(operatingProfit.previousYear, 923_000_000);
  assert.equal(operatingProfit.basis, 'operatingIncome');
  assert.notEqual(operatingProfit.actual, 1_329_000_000);
  assert.ok(Math.abs(event.revenueActualYoyPercent - 25.515647226173545) < 1e-10);
  assert.ok(Math.abs(event.ebitActualYoyPercent - (-56.879739978331526)) < 1e-10);
  assert.ok(Math.abs(event.epsActualYoyPercent - (-3.030303030303033)) < 1e-10);
});

test('published EPS history overrides a stale calendar actual for the exact fiscal quarter', () => {
  assert.deepEqual(resolvePublishedEps({
    fiscalDate: '2026-06-30',
    epsActual: 2.31,
    epsPreviousYear: 2.31,
  }, [
    { date: '2026-06-30', epsActual: 9.11 },
    { date: '2025-06-30', epsActual: 2.31 },
  ]), {
    actual: 9.11,
    previousYear: 2.31,
    source: 'eodhd-fundamentals-earnings-history',
  });
});

test('earnings calendar promotes only for five upcoming followed companies including a holding', () => {
  const watchlist = ['AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL'].map((symbol) => ({ symbol }));
  const positions = [{ symbol: 'NVDA' }];
  const upcoming = [
    ['NVDA', '2026-07-10'],
    ['AAPL', '2026-07-12'],
    ['MSFT', '2026-07-15'],
    ['META', '2026-07-20'],
    ['AMZN', '2026-07-25'],
  ].map(([symbol, reportDate]) => ({ symbol, reportDate }));

  assert.equal(shouldPromoteEarningsCalendar({ events: upcoming, watchlist, positions, today: '2026-07-10' }), true);
  assert.equal(shouldPromoteEarningsCalendar({ events: upcoming.slice(0, 4), watchlist, positions, today: '2026-07-10' }), false);
  assert.equal(shouldPromoteEarningsCalendar({
    events: upcoming.map((event) => (event.symbol === 'NVDA' ? { symbol: 'GOOGL', reportDate: event.reportDate } : event)),
    watchlist,
    positions,
    today: '2026-07-10',
  }), false);
});

test('earnings calendar promotion dedupes companies and keeps the 15-day boundary', () => {
  const watchlist = ['AAPL', 'MSFT', 'META', 'AMZN'].map((symbol) => ({ symbol }));
  const positions = [{ symbol: 'NVDA' }];
  const events = [
    { symbol: 'NVDA', reportDate: '2026-07-10' },
    { symbol: 'AAPL', reportDate: '2026-07-11' },
    { symbol: 'AAPL', reportDate: '2026-07-12' },
    { symbol: 'MSFT', reportDate: '2026-07-15' },
    { symbol: 'META', reportDate: '2026-07-20' },
    { symbol: 'AMZN', reportDate: '2026-07-25' },
  ];

  assert.equal(shouldPromoteEarningsCalendar({ events, watchlist, positions, today: '2026-07-10' }), true);
  assert.equal(shouldPromoteEarningsCalendar({
    events: events.map((event) => (event.symbol === 'AMZN' ? { ...event, reportDate: '2026-07-26' } : event)),
    watchlist,
    positions,
    today: '2026-07-10',
  }), false);
  assert.equal(shouldPromoteEarningsCalendar({
    events: events.map((event) => (event.symbol === 'NVDA' ? { ...event, earningsPublished: true } : event)),
    watchlist,
    positions,
    today: '2026-07-10',
  }), false);
});

test('earnings calendar API reads EODHD calendar and trends through a dedicated endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    const parsed = new URL(url);
    if (parsed.pathname === '/api/calendar/earnings') {
      const calendarSymbols = parsed.searchParams.get('symbols');
      if (calendarSymbols) assert.equal(calendarSymbols, 'NVDA.US,MSFT.US');
      assert.ok(parsed.searchParams.get('from'));
      assert.ok(parsed.searchParams.get('to'));
      assert.equal(parsed.searchParams.get('api_token'), 'test-eodhd-key');
      return jsonResponse({
        earnings: [
          {
            code: 'NVDA.US',
            name: 'NVIDIA Corporation',
            report_date: '2026-07-08',
            before_after_market: 'before-market',
            estimate: '0.68',
          },
          {
            code: 'MSFT.US',
            name: 'Microsoft',
            report_date: '2026-07-09',
            before_after_market: 'after-hours',
            estimate: '2.93',
          },
        ],
      });
    }
    if (parsed.pathname === '/api/calendar/trends') {
      return jsonResponse({
        trends: [
          [
            {
              code: 'NVDA.US',
              date: '2026-07-08',
              period: '+1q',
              revenueEstimateAvg: '260000000000',
              revenueEstimateGrowth: '0.63',
              earningsEstimateNumberOfAnalysts: '42',
              revenueEstimateNumberOfAnalysts: '41',
            },
            {
              code: 'NVDA.US',
              date: '2026-07-08',
              period: '0q',
              revenueEstimateAvg: '284500000000',
              revenueEstimateGrowth: '0.79',
              earningsEstimateNumberOfAnalysts: '42',
              revenueEstimateNumberOfAnalysts: '41',
            },
          ],
          [
            {
              code: 'MSFT.US',
              date: '2026-07-09',
              period: '0q',
              revenueEstimateAvg: '64500000000',
              earningsEstimateNumberOfAnalysts: '36',
              revenueEstimateNumberOfAnalysts: '35',
            },
          ],
        ],
      });
    }
    throw new Error(`unexpected url ${url}`);
  };
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';

  try {
    const res = createResponse();
    await handler(createRequest({ symbols: 'nvda,msft', from: '2026-07-01', to: '2026-07-31' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.source, 'EODHD');
    assert.equal(res.body.events.length, 2);
    assert.deepEqual(res.body.events.map((event) => event.symbol), ['NVDA', 'MSFT']);
    assert.equal(res.body.events[0].session, 'pre');
    assert.equal(res.body.events[0].revenueEstimate, 284500000000);
    assert.equal(res.body.events[0].revenueEstimateYoyPercent, 79);
    assert.equal(res.body.events[0].revenueEstimateUsd, 284500000000);
    assert.equal(res.body.events[0].revenueEstimateCurrency, 'USD');
    assert.equal(res.body.events[0].analystCount, 42);
    assert.ok(requestedUrls.every((url) => !url.includes('api.nasdaq.com')));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

test('earnings calendar API starts trends request without waiting for calendar response', async () => {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  const calendarResponse = deferred();
  const requestedPaths = [];
  let calendarResolved = false;
  let trendsStartedBeforeCalendarResolved = false;

  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requestedPaths.push(parsed.pathname);
    if (parsed.pathname === '/api/calendar/earnings') {
      return calendarResponse.promise;
    }
    if (parsed.pathname === '/api/calendar/trends') {
      trendsStartedBeforeCalendarResolved = !calendarResolved;
      return jsonResponse({
        trends: [
          {
            code: 'NVDA.US',
            date: '2026-07-08',
            period: '0q',
            revenueEstimateAvg: '284500000000',
          },
        ],
      });
    }
    throw new Error(`unexpected url ${url}`);
  };
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';

  try {
    const res = createResponse();
    const handlerPromise = handler(createRequest({ symbols: 'NVDA', from: '2026-07-01', to: '2026-07-31' }), res);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const requestedBeforeCalendarResolved = [...requestedPaths];

    calendarResolved = true;
    calendarResponse.resolve(jsonResponse({
      earnings: [
        {
          code: 'NVDA.US',
          report_date: '2026-07-08',
          before_after_market: 'before-market',
          estimate: '0.68',
        },
      ],
    }));
    await handlerPromise;

    assert.ok(requestedBeforeCalendarResolved.includes('/api/calendar/earnings'), 'calendar request should start');
    assert.ok(requestedBeforeCalendarResolved.includes('/api/calendar/trends'), 'trends request should start before calendar resolves');
    assert.equal(trendsStartedBeforeCalendarResolved, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.events.length, 1);
  } finally {
    calendarResolved = true;
    calendarResponse.resolve(jsonResponse({ earnings: [] }));
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

test('earnings calendar API enriches published events with actual revenue and market reaction', async () => {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    const parsed = new URL(url);
    if (parsed.pathname === '/api/calendar/earnings') {
      return jsonResponse({
        earnings: [
          {
            code: 'NVDA.US',
            report_date: '2026-05-20',
            date: '2026-04-30',
            before_after_market: 'AfterMarket',
            currency: 'USD',
            actual: 1.87,
            estimate: 1.77,
            difference: 0.1,
            percent: 5.6497,
          },
        ],
      });
    }
    if (parsed.pathname === '/api/calendar/trends') {
      return jsonResponse({
        trends: [
          [
            {
              code: 'NVDA.US',
              date: '2026-04-30',
              period: '+1q',
              revenueEstimateAvg: '72026891500',
              revenueEstimateGrowth: '0.6347',
              earningsEstimateAvg: '1.6815',
              earningsEstimateGrowth: '1.0759',
              earningsEstimateYearAgoEps: '0.81',
              earningsEstimateNumberOfAnalysts: '42',
            },
            {
              code: 'NVDA.US',
              date: '2026-04-30',
              period: '0q',
              revenueEstimateAvg: '79115709670',
              revenueEstimateGrowth: '0.7956',
              earningsEstimateAvg: '1.7738',
              earningsEstimateGrowth: '1.1898',
              earningsEstimateYearAgoEps: '0.81',
              earningsEstimateNumberOfAnalysts: '42',
            },
          ],
        ],
      });
    }
    if (parsed.pathname === '/api/v1.1/fundamentals/NVDA.US') {
      assert.equal(
        parsed.searchParams.get('filter'),
        'General::Sector,Financials::Income_Statement::quarterly,Earnings::History',
      );
      return jsonResponse({
        'General::Sector': 'Technology',
        'Financials::Income_Statement::quarterly': {
          '2026-04-30': {
            date: '2026-04-30',
            filing_date: '2026-05-20',
            currency_symbol: 'USD',
            totalRevenue: '81615000000.00',
            ebit: '25000000000.00',
            operatingIncome: '26000000000.00',
            ebitda: '30000000000.00',
          },
          '2025-04-30': {
            date: '2025-04-30',
            filing_date: '2025-05-21',
            currency_symbol: 'USD',
            totalRevenue: '44062000000.00',
            ebit: '10000000000.00',
            operatingIncome: '11000000000.00',
            ebitda: '14000000000.00',
          },
        },
        'Earnings::History': {
          '2026-04-30': {
            date: '2026-04-30',
            reportDate: '2026-05-20',
            epsActual: '1.90',
          },
          '2025-04-30': {
            date: '2025-04-30',
            reportDate: '2025-05-21',
            epsActual: '0.81',
          },
        },
      });
    }
    if (parsed.pathname === '/api/eod/NVDA.US') {
      return jsonResponse([
        { date: '2026-05-20', close: 100, adjusted_close: 100 },
        { date: '2026-05-21', close: 105, adjusted_close: 105 },
      ]);
    }
    throw new Error(`unexpected url ${url}`);
  };
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';

  try {
    const res = createResponse();
    await handler(createRequest({ symbols: 'nvda', from: '2026-05-20', to: '2026-05-22' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.events.length, 1);
    const event = res.body.events[0];
    assert.equal(event.earningsPublished, true);
    assert.equal(event.publishedFinancialsComplete, true);
    assert.equal(event.publishedUntil, '2026-05-22');
    assert.equal(event.earningsResult, 'beat');
    assert.equal(event.epsActual, 1.9);
    assert.equal(event.epsActualSource, 'eodhd-fundamentals-earnings-history');
    assert.equal(event.revenueEstimate, 79115709670);
    assert.equal(event.revenueActual, 81615000000);
    assert.equal(event.revenueActualUsd, 81615000000);
    assert.equal(event.revenuePreviousYearUsd, 44062000000);
    assert.equal(Math.round(event.revenueSurprisePercent * 10) / 10, 3.2);
    assert.equal(Math.round(event.revenueActualYoyPercent * 100) / 100, 85.23);
    assert.equal(Math.round(event.revenueEstimateYoyPercent * 100) / 100, 79.56);
    assert.equal(event.ebitActual, 26000000000);
    assert.equal(event.ebitActualUsd, 26000000000);
    assert.equal(event.ebitActualCurrency, 'USD');
    assert.equal(event.ebitActualSource, 'eodhd-fundamentals-income-statement');
    assert.equal(event.ebitActualBasis, 'operatingIncome');
    assert.equal(event.ebitPreviousYear, 11000000000);
    assert.equal(event.ebitPreviousYearUsd, 11000000000);
    assert.equal(event.ebitPreviousYearSource, 'eodhd-fundamentals-income-statement');
    assert.equal(event.ebitPreviousYearBasis, 'operatingIncome');
    assert.ok(Math.abs(event.ebitActualYoyPercent - 136.36363636363635) < 1e-10);
    assert.equal(event.ebitEstimate, undefined);
    assert.equal(Math.round(event.epsActualYoyPercent * 100) / 100, 134.57);
    assert.equal(event.epsEstimate, 1.7738);
    assert.equal(Math.round(event.epsEstimateYoyPercent * 100) / 100, 118.99);
    assert.equal(event.marketReactionPercent, 5);
    assert.equal(event.marketReactionBaseDate, '2026-05-20');
    assert.equal(event.marketReactionTargetDate, '2026-05-21');
    assert.ok(requestedUrls.some((url) => url.includes('/api/v1.1/fundamentals/NVDA.US')));
    assert.ok(requestedUrls.some((url) => url.includes('/api/eod/NVDA.US')));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

test('earnings calendar API converts non-USD revenue estimates to USD', async () => {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    const parsed = new URL(url);
    if (parsed.pathname === '/api/calendar/earnings') {
      return jsonResponse({
        earnings: [
          {
            code: 'TSM.US',
            report_date: '2026-07-16',
            date: '2026-06-30',
            before_after_market: 'BeforeMarket',
            currency: 'TWD',
            estimate: '3.77',
          },
        ],
      });
    }
    if (parsed.pathname === '/api/calendar/trends') {
      return jsonResponse({
        trends: [
          [
            {
              code: 'TSM.US',
              date: '2026-06-30',
              period: '0q',
              revenueEstimateAvg: '32000000000',
              earningsEstimateNumberOfAnalysts: '6',
            },
          ],
        ],
      });
    }
    if (parsed.pathname === '/api/real-time/USDTWD.FOREX') {
      return jsonResponse({ code: 'USDTWD.FOREX', close: 32 });
    }
    throw new Error(`unexpected url ${url}`);
  };
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';

  try {
    const res = createResponse();
    await handler(createRequest({ symbols: 'tsm', from: '2026-07-01', to: '2026-09-29' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.events.length, 1);
    assert.equal(res.body.events[0].symbol, 'TSM');
    assert.equal(res.body.events[0].currency, 'TWD');
    assert.equal(res.body.events[0].revenueEstimate, 32000000000);
    assert.equal(res.body.events[0].revenueEstimateUsd, 1000000000);
    assert.equal(res.body.events[0].revenueEstimateCurrency, 'USD');
    assert.equal(res.body.events[0].revenueFxRate, 32);
    assert.equal(res.body.events[0].revenueFxSource, 'USDTWD.FOREX');
    assert.ok(requestedUrls.some((url) => url.includes('/api/real-time/USDTWD.FOREX')));
    assert.ok(requestedUrls.every((url) => !url.includes('api.nasdaq.com')));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

test('earnings calendar API converts EUR revenue and derives EPS estimate growth from displayed values', async () => {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    const parsed = new URL(url);
    if (parsed.pathname === '/api/calendar/earnings') {
      return jsonResponse({
        earnings: [
          {
            code: 'ASML.US',
            report_date: '2026-07-15',
            date: '2026-06-30',
            before_after_market: 'BeforeMarket',
            currency: 'EUR',
            estimate: '7.98',
          },
          {
            code: 'MSFT.US',
            report_date: '2026-07-16',
            date: '2026-06-30',
            before_after_market: 'AfterMarket',
            currency: 'USD',
            estimate: '2.93',
          },
        ],
      });
    }
    if (parsed.pathname === '/api/calendar/trends') {
      return jsonResponse({
        trends: [
          [
            {
              code: 'ASML.US',
              date: '2026-06-30',
              period: '0q',
              earningsEstimateAvg: '6.8775',
              earningsEstimateGrowth: '0.1657',
              earningsEstimateYearAgoEps: '5.90',
              revenueEstimateAvg: '8867000000',
              currency: 'EUR',
            },
          ],
          [
            {
              code: 'MSFT.US',
              date: '2026-06-30',
              period: '0q',
              earningsEstimateGrowth: '0.12',
            },
          ],
        ],
      });
    }
    if (parsed.pathname === '/api/real-time/USDEUR.FOREX') {
      return jsonResponse({ code: 'USDEUR.FOREX', close: 0.86 });
    }
    throw new Error(`unexpected url ${url}`);
  };
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';

  try {
    const res = createResponse();
    await handler(createRequest({ symbols: 'asml,msft', from: '2026-07-01', to: '2026-09-29' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.events.length, 2);
    const asml = res.body.events.find((event) => event.symbol === 'ASML');
    const msft = res.body.events.find((event) => event.symbol === 'MSFT');
    assert.equal(asml.currency, 'EUR');
    assert.equal(asml.revenueEstimate, 8867000000);
    assert.equal(Math.round(asml.revenueEstimateUsd), 10310465116);
    assert.equal(asml.revenueFxRate, 0.86);
    assert.equal(asml.revenueFxSource, 'USDEUR.FOREX');
    assert.equal(asml.epsEstimate, 6.8775);
    assert.equal(asml.epsPreviousYear, 5.9);
    assert.equal(Math.round(asml.epsEstimateYoyPercent * 100) / 100, 16.57);
    assert.equal(msft.epsEstimate, 2.93);
    assert.equal(msft.epsEstimateYoyPercent, null);
    assert.ok(requestedUrls.some((url) => url.includes('/api/real-time/USDEUR.FOREX')));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});
