import test from 'node:test';
import assert from 'node:assert/strict';

import handler, { parseEarningsRequest } from '../api/earnings-calendar.js';
import {
  buildCalendarMonth,
  buildEarningsSymbols,
  groupEarningsByDate,
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
  ], {
    positions: [{ symbol: 'NVDA' }],
    watchlist: [{ symbol: 'META' }],
  });
  const grouped = groupEarningsByDate(events);
  assert.equal(grouped.get('2026-07-08')[0].impact, 'high');
  assert.equal(grouped.get('2026-07-10')[0].session, 'post');
  assert.equal(buildCalendarMonth('2026-07-01', events).length, 42);
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
      assert.equal(parsed.searchParams.get('symbols'), 'NVDA.US,MSFT.US');
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
              period: '0q',
              revenueEstimateAvg: '284500000000',
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
