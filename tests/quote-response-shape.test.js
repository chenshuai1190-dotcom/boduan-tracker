import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/quote.js';
import {
  findDailyBaselineCloseFromEodRows,
  normalizeEodhdStockQuoteFields,
} from '../server/quote/providers/eodhd.js';
import {
  getLatestCompletedUsTradingDate,
  isUsMarketTradingDate,
} from '../server/quote/eodhdCache.js';
import {
  QUOTE_API_POLICY_HEADER,
  QUOTE_API_POLICY_VERSION,
} from '../src/lib/quoteApiPolicy.js';

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
    headers: { [QUOTE_API_POLICY_HEADER.toLowerCase()]: QUOTE_API_POLICY_VERSION },
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

function previousTradingDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while (!isUsMarketTradingDate(date.toISOString().slice(0, 10)));
  return date.toISOString().slice(0, 10);
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

  const intradayMatch = path.match(/\/api\/intraday\/([^/]+)/);
  if (intradayMatch) {
    const intradayQuotes = {
      'GSPC.INDX': [5440, 5438.25, 5436.8, 5435.21],
      'NDX.INDX': [19138.49, 19150.12, 19146.3, 19144.23],
      'DJI.INDX': [39706.66, 39682.4, 39655.2, 39647.1],
    };
    const closes = intradayQuotes[decodeURIComponent(intradayMatch[1])];
    if (closes) {
      return jsonResponse([
        { datetime: '2026-07-06 15:55:00', close: closes[0] - 80 },
        ...closes.map((close, index) => ({
          datetime: `2026-07-07 09:${String(30 + index * 5).padStart(2, '0')}:00`,
          close,
        })),
        { datetime: '2026-07-06 16:00:00', close: closes.at(-1) - 80 },
      ]);
    }
  }

  const realtimeMatch = path.match(/\/api\/real-time\/([^/]+)/);
  if (realtimeMatch) {
    const realtimeQuotes = {
      'GSPC.INDX': { price: 5435.21, previousClose: 5439.56, high: 5450, low: 5400 },
      'NDX.INDX': { price: 19144.23, previousClose: 19138.49, high: 19200, low: 19000 },
      'DJI.INDX': { price: 39647.1, previousClose: 39706.66, high: 39800, low: 39500 },
    };
    const quote = realtimeQuotes[decodeURIComponent(realtimeMatch[1])];
    if (quote) {
      return jsonResponse({
        close: quote.price,
        previousClose: quote.previousClose,
        change: quote.price - quote.previousClose,
        change_p: ((quote.price - quote.previousClose) / quote.previousClose) * 100,
        high: quote.high,
        low: quote.low,
        open: quote.previousClose,
        timestamp: 1783000000,
      });
    }
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

  if (parsed.hostname === 'query1.finance.yahoo.com' && path.includes('/v8/finance/chart/')) {
    const chartQuotes = {
      '^GSPC': { price: 7521.87, previousClose: 7537.43, intraday: [7530.12, 7524.44, 7521.87] },
      '^NDX': { price: 29275.38, previousClose: 29697.87, intraday: [29420.5, 29340.12, 29275.38] },
      '^DJI': { price: 53167.79, previousClose: 53055.91, intraday: [53120.25, 53180.33, 53167.79] },
    };
    const quote = chartQuotes[decodeURIComponent(path.split('/').pop())];
    if (quote) {
      return jsonResponse({
        chart: {
          result: [{
            meta: {
              regularMarketPrice: quote.price,
              previousClose: quote.previousClose,
              regularMarketTime: 1783520000,
            },
            indicators: {
              quote: [{ close: quote.intraday }],
            },
          }],
        },
      });
    }
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
    if (requested.includes('NOPREV.US')) {
      return jsonResponse({
        data: {
          'NOPREV.US': liveQuoteWithoutPreviousClose({ price: 155, high: 156, low: 149 }),
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
    if (path.includes('/NOEOD.US')) return jsonResponse([]);
    const completedDate = getLatestCompletedUsTradingDate(Date.now());
    const baselineDate = previousTradingDate(completedDate);
    const currentYear = completedDate.slice(0, 4);
    return jsonResponse([
      { date: `${currentYear}-01-02`, high: 102, low: 98, close: 100, adjusted_close: 100 },
      { date: baselineDate, high: 151, low: 140, close: 150, adjusted_close: 150 },
      { date: completedDate, high: 156, low: 148, close: 155, adjusted_close: 155 },
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
            chartPreviousClose: 100,
            previousClose: 100,
            marketState: 'REGULAR',
            regularMarketTime: 1783000000,
            regularMarketPrice: 999,
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

function liveQuoteWithoutPreviousClose({ price, high, low }) {
  return {
    ethPrice: null,
    lastTradePrice: String(price),
    previousClosePrice: '',
    high: String(high),
    low: String(low),
    open: '',
    timestamp: 1783000000,
    change: '',
    changePercent: '',
  };
}

test('authenticated quote responses disable browser caching before auth failure', async () => {
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  process.env.QUOTE_API_AUTH_REQUIRED = 'true';

  try {
    const res = createResponse();
    await handler(createRequest('VIX'), res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0, must-revalidate');
    assert.equal(res.headers.Pragma, 'no-cache');
    assert.equal(res.headers.Expires, '0');
  } finally {
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
  }
});

test('EODHD stock normalizer recomputes regular-session change from lastTradePrice and previous close', () => {
  const quote = normalizeEodhdStockQuoteFields({
    lastTradePrice: 384.05,
    ethPrice: 386.06,
    previousClosePrice: 390.49,
    high: 391,
    low: 382,
    open: 388,
    timestamp: 1783360500,
    change: -6.44,
    changePercent: -1.68,
  }, { now: Date.UTC(2026, 6, 6, 14, 10, 0) });

  assert.equal(quote.quoteSession, 'regular');
  assert.equal(quote.priceMode, 'regular');
  assert.equal(quote.price, 384.05);
  assert.equal(Number(quote.change.toFixed(2)), -6.44);
  assert.equal(Number(quote.changePercent.toFixed(4)), -1.6492);
  assert.equal(quote.changeSource, 'computed-regular');
});

test('EODHD stock normalizer ignores stale regular-session changePercent when previous close is valid', () => {
  const quote = normalizeEodhdStockQuoteFields({
    lastTradePrice: 12.7,
    ethPrice: 12.44,
    previousClosePrice: 12.07,
    high: 12.75,
    low: 12.15,
    open: 12.2,
    timestamp: 1783361520,
    change: 0.63,
    changePercent: 4.96,
  }, { now: Date.UTC(2026, 6, 6, 14, 25, 0) });

  assert.equal(quote.quoteSession, 'regular');
  assert.equal(quote.priceMode, 'regular');
  assert.equal(quote.price, 12.7);
  assert.equal(Number(quote.change.toFixed(2)), 0.63);
  assert.equal(Number(quote.changePercent.toFixed(4)), 5.2196);
  assert.equal(quote.changeSource, 'computed-regular');
});

test('EODHD stock normalizer recomputes premarket display change from ethPrice', () => {
  const quote = normalizeEodhdStockQuoteFields({
    lastTradePrice: 384.05,
    ethPrice: 386.06,
    previousClosePrice: 390.49,
    high: 391,
    low: 382,
    open: 388,
    timestamp: 1783360500,
    change: -6.44,
    changePercent: -1.68,
  }, { now: Date.UTC(2026, 6, 6, 12, 0, 0) });

  assert.equal(quote.quoteSession, 'pre');
  assert.equal(quote.priceMode, 'pre');
  assert.equal(quote.price, 386.06);
  assert.equal(Number(quote.change.toFixed(2)), -4.43);
  assert.equal(Number(quote.changePercent.toFixed(4)), -1.1345);
  assert.equal(quote.changeSource, 'computed-extended');
  assert.equal(quote.dailyPnlPrice, 386.06);
  assert.equal(quote.dailyPnlLocked, false);
  assert.equal(quote.dailyPnlSource, 'realtime-pre');
});

test('EODHD stock normalizer locks daily pnl to regular close during postmarket', () => {
  const dailyBaseline = findDailyBaselineCloseFromEodRows([
    { date: '2026-07-02', close: 194.8, adjusted_close: 194.8 },
    { date: '2026-07-06', close: 195.55, adjusted_close: 195.55 },
  ], '2026-07-06');
  const quote = normalizeEodhdStockQuoteFields({
    lastTradePrice: 195.55,
    ethPrice: 195.274,
    previousClosePrice: 195.55,
    high: 197.55,
    low: 194,
    open: 194.48,
    timestamp: 1783366740,
    change: 0,
    changePercent: 0,
  }, {
    now: Date.UTC(2026, 6, 6, 23, 39, 0),
    dailyBaselineClose: dailyBaseline.close,
    dailyBaselineDate: dailyBaseline.date,
    dailyBaselineSource: dailyBaseline.source,
  });

  assert.equal(quote.quoteSession, 'post');
  assert.equal(quote.priceMode, 'post');
  assert.equal(quote.price, 195.274);
  assert.equal(quote.sessionPreviousClose, 195.55);
  assert.equal(quote.previousClose, 194.8);
  assert.equal(quote.dailyBaselineClose, 194.8);
  assert.equal(quote.dailyBaselineDate, '2026-07-02');
  assert.equal(quote.dailyPnlPrice, 195.55);
  assert.equal(quote.dailyPnlBaselineClose, 194.8);
  assert.equal(quote.dailyPnlLocked, true);
  assert.equal(quote.dailyPnlSession, 'post');
  assert.equal(quote.dailyPnlSource, 'locked-provider-regular-close');
  assert.equal(Number(quote.dailyPnlChange.toFixed(3)), 0.75);
  assert.equal(Number(quote.dailyPnlChangePercent.toFixed(4)), 0.3850);
  assert.equal(Number(quote.change.toFixed(3)), 0.474);
  assert.equal(Number(quote.changePercent.toFixed(4)), 0.2433);
  assert.equal(quote.changeSource, 'computed-extended');
});

test('EODHD stock normalizer uses latest completed regular close for closed-session daily pnl', () => {
  const quote = normalizeEodhdStockQuoteFields({
    lastTradePrice: 195.41,
    ethPrice: 193.7,
    previousClosePrice: 195.55,
    high: 197.55,
    low: 194,
    open: 194.48,
    timestamp: 1783366740,
    change: 0,
    changePercent: 0,
  }, {
    now: Date.UTC(2026, 6, 7, 5, 39, 0),
    dailyBaselineClose: 195.55,
    dailyBaselineDate: '2026-07-06',
    dailyBaselineSource: 'eodhd-adjusted-close',
    closedDailyPnlPrice: 195.55,
    closedDailyPnlDate: '2026-07-06',
    closedDailyPnlSource: 'locked-latest-eod-close',
    closedDailyPnlBaselineClose: 194.8,
    closedDailyPnlBaselineDate: '2026-07-02',
    closedDailyPnlBaselineSource: 'eodhd-adjusted-close',
  });

  assert.equal(quote.quoteSession, 'closed');
  assert.equal(quote.priceMode, 'regular');
  assert.equal(quote.price, 195.41);
  assert.equal(quote.previousClose, 195.55);
  assert.equal(quote.dailyPnlPrice, 195.55);
  assert.equal(quote.dailyPnlBaselineClose, 194.8);
  assert.equal(quote.dailyPnlLocked, true);
  assert.equal(quote.dailyPnlSession, 'closed');
  assert.equal(quote.dailyPnlSource, 'locked-latest-eod-close');
  assert.equal(Number(quote.change.toFixed(3)), -0.14);
  assert.equal(Number(quote.changePercent.toFixed(4)), -0.0716);
  assert.equal(Number(quote.dailyPnlChange.toFixed(3)), 0.75);
  assert.equal(Number(quote.dailyPnlChangePercent.toFixed(4)), 0.3850);
});

test('EODHD stock normalizer recomputes stale zero change when selected price moved', () => {
  const quote = normalizeEodhdStockQuoteFields({
    lastTradePrice: 100,
    ethPrice: 101.5,
    previousClosePrice: 95,
    high: 101,
    low: 94,
    open: 96,
    timestamp: 1783360500,
    change: 0,
    changePercent: 0,
  }, { now: Date.UTC(2026, 6, 6, 15, 0, 0) });

  assert.equal(quote.quoteSession, 'regular');
  assert.equal(quote.priceMode, 'regular');
  assert.equal(quote.price, 100);
  assert.equal(quote.change, 5);
  assert.equal(Number(quote.changePercent.toFixed(4)), 5.2632);
  assert.equal(quote.changeSource, 'computed-regular');
});

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
  assert.equal(quote.source, 'EODHD');
  assert.equal(Array.isArray(quote.data), true);
  assert.equal(quote.data.length, 3);
  assert.deepEqual(Object.keys(quote.data[0]).sort(), [
    'change',
    'changePercent',
    'cn',
    'dayHigh',
    'dayLow',
    'displaySymbol',
    'intraday',
    'name',
    'previousClose',
    'price',
    'source',
    'ticker',
  ]);
  assert.deepEqual(quote.data.map((item) => item.ticker), ['GSPC.INDX', 'NDX.INDX', 'DJI.INDX']);
  assert.equal(quote.data.some((item) => item.ticker === 'BTC-USD.CC'), false);
  assert.equal(quote.data[0].price, 5435.21);
  assert.deepEqual(quote.data[0].intraday, [5440, 5438.25, 5436.8, 5435.21]);
  assert.equal(quote.data[0].source, 'EODHD');
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
  assert.equal(typeof quote.ytdChangePercent, 'number');
  assert.equal(typeof quote.yearStartPrice, 'number');
  assert.equal(quote.yearStartPrice, 100);
  assert.ok(Math.abs(quote.ytdChangePercent - 55) < 0.000001);
  assert.equal(quote.previousClose, 150);
  assert.equal(quote.dailyBaselineClose, 150);
  assert.ok(Math.abs(quote.changePercent - ((155 - 150) / 150) * 100) < 0.000001);
  assert.equal(Array.isArray(quote.intraday), true);
  assert.equal(Array.isArray(quote.intradayPoints), true);
  assert.equal(quote.intradayPoints[0].session, 'regular');
});

test('stock quote core fields do not fall back to Yahoo chart data', async () => {
  const quote = await callQuote('NOEOD');

  assert.equal(quote.symbol, 'NOEOD');
  assert.equal(quote.error, 'EODHD 已完成收盘历史不完整');
  assert.equal(quote.source, undefined);
  assert.equal(quote.priceSource, undefined);
});

test('stock quote missing EODHD quote previous close does not use Yahoo chart previous close', async () => {
  const quote = await callQuote('NOPREV');

  assert.equal(quote.symbol, 'NOPREV');
  assert.equal(quote.source, 'EODHD');
  assert.equal(quote.priceSource, 'EODHD-v2');
  assert.equal(quote.price, 155);
  assert.equal(quote.previousClose, 150);
  assert.equal(quote.dailyBaselineClose, 150);
  assert.equal(quote.change, 5);
  assert.ok(Math.abs(quote.changePercent - ((155 - 150) / 150) * 100) < 0.000001);
  assert.deepEqual(quote.intraday, [151, 153, 155]);
});
