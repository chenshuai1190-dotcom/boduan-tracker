import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/quote.js';

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

function createRequest(symbols) {
  return {
    method: 'GET',
    headers: {},
    query: { symbols },
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

async function callQuote(symbols) {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  globalThis.fetch = mockProviderFetch;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';

  try {
    const res = createResponse();
    await handler(createRequest(symbols), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.fetchedAt, 'string');
    return res.body.data[0];
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
}

async function mockProviderFetch(url) {
  const parsed = new URL(url);
  const path = parsed.pathname;

  if (path.includes('/api/real-time/VIX.INDX')) {
    return jsonResponse({
      close: 16.2,
      previousClose: 15.8,
      change: 0.4,
      change_p: 2.53,
      high: 17,
      low: 15.5,
      open: 15.7,
      timestamp: 1783000000,
    });
  }

  if (parsed.hostname === 'production.dataviz.cnn.io') {
    const now = Date.now();
    return jsonResponse({
      fear_and_greed: {
        score: 42.4,
        rating: 'Neutral',
        timestamp: '2026-07-03T12:00:00Z',
      },
      fear_and_greed_historical: {
        data: [
          { x: now - 1 * 24 * 60 * 60 * 1000, y: 40 },
          { x: now - 7 * 24 * 60 * 60 * 1000, y: 38 },
          { x: now - 30 * 24 * 60 * 60 * 1000, y: 45 },
          { x: now - 365 * 24 * 60 * 60 * 1000, y: 55 },
        ],
      },
    });
  }

  if (parsed.hostname === 'api.nasdaq.com') {
    const today = new Date().toISOString().slice(0, 10);
    const date = parsed.searchParams.get('date');
    return jsonResponse({
      data: {
        rows: date === today ? [{
          symbol: 'NVDA',
          name: 'NVIDIA Corporation',
          time: 'after-hours',
          epsForecast: '1.20',
          eps: null,
          marketCap: '$4T',
          fiscalQuarterEnding: 'Jul/2026',
          noOfEsts: '35',
          lastYearEPS: '0.80',
          lastYearRptDt: '2025-07-03',
        }] : [],
      },
    });
  }

  if (path.includes('/api/economic-events')) {
    return jsonResponse([
      {
        event: 'Fed Interest Rate Decision',
        date: '2026-07-15 18:00:00',
        country: 'US',
        actual: null,
        estimate: '4.50%',
        previous: '4.50%',
        change: null,
        change_percentage: null,
      },
    ]);
  }

  if (path.includes('/api/us-quote-delayed')) {
    const requested = parsed.searchParams.get('s') || '';
    if (requested.includes('SPY.US') && requested.includes('QQQ.US')) {
      return jsonResponse({
        data: {
          'SPY.US': liveQuote({ price: 620, previousClose: 615, high: 621, low: 612 }),
          'QQQ.US': liveQuote({ price: 540, previousClose: 535, high: 542, low: 530 }),
        },
      });
    }
    return jsonResponse({
      data: {
        'NVDA.US': liveQuote({ price: 155, previousClose: 150, high: 156, low: 149 }),
      },
    });
  }

  if (path.includes('/api/eod/')) {
    return jsonResponse([
      { date: '2026-06-30', high: 150, low: 140, close: 145, adjusted_close: 145 },
      { date: '2026-07-01', high: 156, low: 148, close: 155, adjusted_close: 155 },
    ]);
  }

  if (path.includes('/api/fundamentals/')) {
    return jsonResponse({
      General: {
        Name: 'NVIDIA Corporation',
        Sector: 'Technology',
        Industry: 'Semiconductors',
        Description: 'Mock company description',
        LogoURL: '/img/logos/US/NVDA.png',
        FullTimeEmployees: 30000,
        CurrencyCode: 'USD',
        CurrencySymbol: '$',
        CurrencyName: 'US Dollar',
        CountryName: 'USA',
        CountryISO: 'US',
        HomeCategory: 'Domestic',
        AddressData: { Country: 'USA' },
      },
      Highlights: {
        MarketCapitalization: 4000000000000,
        EBITDA: 100000000000,
        PERatio: 40,
        EarningsShare: 3.2,
        RevenueTTM: 120000000000,
        WallStreetTargetPrice: 180,
        MostRecentQuarter: '2026-04-30',
      },
      AnalystRatings: {
        Rating: 4.7,
        TargetPrice: 182,
        StrongBuy: 25,
        Buy: 8,
        Hold: 2,
        Sell: 0,
        StrongSell: 0,
      },
      SharesStats: {
        PercentInsiders: 4.5,
        PercentInstitutions: 65.2,
      },
      Earnings: {
        History: {
          latest: {
            reportDate: '2026-05-20',
            date: '2026-04-30',
            epsActual: 1.1,
            epsEstimate: 1.0,
            epsDifference: 0.1,
            surprisePercent: 10,
          },
          upcoming: {
            reportDate: '2026-08-20',
            date: '2026-07-31',
            epsEstimate: 1.2,
          },
        },
        Trend: {
          last: { period: '-1q', date: '2026-05-01', revenueEstimateAvg: 42000000000 },
          current: { period: '0q', date: '2026-08-01', revenueEstimateAvg: 45000000000 },
        },
        Annual: {
          y2025: { date: '2025-12-31', epsActual: 4.4 },
        },
      },
      Financials: {
        Income_Statement: {
          quarterly: {
            q1: {
              date: '2026-04-30',
              totalRevenue: 44000000000,
              costOfRevenue: 12000000000,
              grossProfit: 32000000000,
              researchDevelopment: 4000000000,
              sellingGeneralAdministrative: 2500000000,
              operatingIncome: 25500000000,
              netIncome: 23000000000,
            },
          },
          yearly: {
            y2025: { date: '2025-12-31', totalRevenue: 130000000000, netIncome: 70000000000 },
          },
        },
      },
    });
  }

  if (path.includes('/api/insider-transactions')) {
    return jsonResponse([]);
  }

  if (path.includes('/api/news')) {
    return jsonResponse([{
      date: '2026-07-03',
      title: 'NVIDIA mock news',
      link: 'https://example.com/news',
      source: 'Example',
      sentiment: { polarity: 0.2, pos: 0.5, neg: 0.1, neu: 0.4 },
    }]);
  }

  if (parsed.hostname.includes('finance.yahoo.com')) {
    return jsonResponse({
      chart: {
        result: [{
          meta: {
            chartPreviousClose: 150,
            previousClose: 150,
            marketState: 'REGULAR',
            regularMarketTime: 1783000000,
            regularMarketPrice: 155,
            currentTradingPeriod: {
              regular: { start: 1782970200, end: 1782993600 },
            },
          },
          timestamp: [1782970200, 1782970500, 1782970800],
          indicators: {
            quote: [{ close: [151, 153, 155] }],
          },
        }],
      },
    });
  }

  throw new Error(`Unexpected provider URL: ${url}`);
}

function liveQuote({ price, previousClose, high, low }) {
  return {
    ethPrice: null,
    lastTradePrice: String(price),
    previousClosePrice: String(previousClose),
    high: String(high),
    low: String(low),
    open: String(previousClose + 1),
    timestamp: 1783000000,
    change: String(price - previousClose),
    changePercent: String(((price - previousClose) / previousClose) * 100),
  };
}

test('VIX quote response shape is stable', async () => {
  const quote = await callQuote('VIX');

  assert.equal(quote.symbol, 'VIX');
  assert.equal(quote.source, 'EODHD');
  assert.equal(typeof quote.price, 'number');
  assert.equal(typeof quote.changePercent, 'number');
  assert.equal(typeof quote.previousClose, 'number');
  assert.equal(typeof quote.dataDate, 'string');
});

test('FGI quote response shape is stable', async () => {
  const quote = await callQuote('FGI');

  assert.equal(quote.symbol, 'FGI');
  assert.equal(quote.source, 'CNN');
  assert.equal(quote.label, 'Neutral');
  assert.equal(typeof quote.price, 'number');
  assert.equal(typeof quote.weekAgo, 'number');
  assert.equal(typeof quote.dataDate, 'string');
});

test('INDICES quote response shape is stable', async () => {
  const quote = await callQuote('INDICES');

  assert.equal(quote.symbol, 'INDICES');
  assert.equal(quote.source, 'EODHD-v2');
  assert.equal(Array.isArray(quote.data), true);
  assert.equal(quote.data.length, 2);
  assert.deepEqual(Object.keys(quote.data[0]).sort(), [
    'change',
    'changePercent',
    'cn',
    'dayHigh',
    'dayLow',
    'intraday',
    'name',
    'previousClose',
    'price',
    'source',
    'ticker',
  ]);
});

test('CALENDAR quote response shape is stable', async () => {
  const quote = await callQuote('CALENDAR:NVDA');

  assert.equal(quote.symbol, 'CALENDAR:NVDA');
  assert.equal(quote.source, 'NASDAQ + FOMC');
  assert.equal(Array.isArray(quote.events), true);
  assert.equal(quote.events.some(event => event.type === 'earnings' && event.symbol === 'NVDA'), true);
  assert.equal(quote.events.some(event => event.type === 'fomc'), true);
  assert.equal(typeof quote.fetchedAt, 'string');
});

test('ANALYST quote response shape is stable', async () => {
  const quote = await callQuote('ANALYST:NVDA');

  assert.equal(quote.symbol, 'ANALYST:NVDA');
  assert.equal(quote.source, 'EODHD-Fundamentals');
  assert.equal(quote.targets.rating, 'STRONG BUY');
  assert.equal(quote.targets.average, 182);
  assert.equal(quote.general.name, 'NVIDIA Corporation');
  assert.equal(Array.isArray(quote.annualSeries), true);
  assert.equal(Array.isArray(quote.priceHistory), true);
  assert.equal(quote.quarterlyStructure.totalRevenue, 44000000000);
  assert.equal(quote.newsSentiment.total, 1);
});

test('stock quote response shape is stable', async () => {
  const quote = await callQuote('NVDA');

  assert.equal(quote.symbol, 'NVDA');
  assert.equal(quote.source, 'EODHD');
  assert.equal(quote.priceSource, 'EODHD-v2');
  assert.equal(typeof quote.price, 'number');
  assert.equal(typeof quote.week52High, 'number');
  assert.equal(Array.isArray(quote.intraday), true);
  assert.equal(Array.isArray(quote.intradayPoints), true);
  assert.equal(quote.intradayPoints[0].session, 'regular');
});
