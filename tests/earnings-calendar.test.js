import test from 'node:test';
import assert from 'node:assert/strict';

import handler, { parseEarningsRequest } from '../api/earnings-calendar.js';
import {
  buildCalendarMonth,
  buildEarningsSymbols,
  classifyEarningsResult,
  groupEarningsByDate,
  isEarningsVisible,
  normalizeEarningsEvents,
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

test('earnings calendar request validates symbols and date range', () => {
  assert.deepEqual(parseEarningsRequest({ symbols: 'nvda, msft.us', from: '2026-07-01', to: '2026-07-31' }), {
    symbols: ['NVDA', 'MSFT'],
    from: '2026-07-01',
    to: '2026-07-31',
  });

  assert.match(parseEarningsRequest({ symbols: 'NV DA' }).error, /股票代码不合法/);
  assert.match(parseEarningsRequest({ symbols: 'NVDA', from: '2026-09-01', to: '2026-07-01' }).error, /from 不能晚于 to/);
  assert.match(parseEarningsRequest({ symbols: 'NVDA', from: '2026-01-01', to: '2026-05-01' }).error, /查询区间不能超过/);
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
  assert.equal(classifyEarningsResult({ surprisePercent: 4.5, revenueSurprisePercent: -1.8 }), 'mixed');
  assert.equal(isEarningsVisible(published, '2026-07-10'), true);
  assert.equal(isEarningsVisible(published, '2026-07-11'), false);
  assert.equal(isEarningsVisible(unpublished, '2026-07-08'), true);
  assert.equal(isEarningsVisible(unpublished, '2026-07-09'), false);
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
      assert.equal(parsed.searchParams.get('filter'), 'Financials::Income_Statement::quarterly');
      return jsonResponse({
        '2026-04-30': {
          date: '2026-04-30',
          filing_date: '2026-05-20',
          currency_symbol: 'USD',
          totalRevenue: '81615000000.00',
        },
        '2025-04-30': {
          date: '2025-04-30',
          filing_date: '2025-05-21',
          currency_symbol: 'USD',
          totalRevenue: '44062000000.00',
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
    assert.equal(event.publishedUntil, '2026-05-22');
    assert.equal(event.earningsResult, 'beat');
    assert.equal(event.epsActual, 1.87);
    assert.equal(event.revenueEstimate, 79115709670);
    assert.equal(event.revenueActual, 81615000000);
    assert.equal(event.revenueActualUsd, 81615000000);
    assert.equal(event.revenuePreviousYearUsd, 44062000000);
    assert.equal(Math.round(event.revenueSurprisePercent * 10) / 10, 3.2);
    assert.equal(Math.round(event.revenueActualYoyPercent * 100) / 100, 85.23);
    assert.equal(Math.round(event.revenueEstimateYoyPercent * 100) / 100, 79.56);
    assert.equal(Math.round(event.epsActualYoyPercent * 100) / 100, 130.86);
    assert.equal(Math.round(event.epsEstimateYoyPercent * 100) / 100, 118.98);
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
