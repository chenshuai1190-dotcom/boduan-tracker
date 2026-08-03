import assert from 'node:assert/strict';
import test from 'node:test';

import handler from '../api/quote.js';
import { deriveMa200Monitor } from '../server/quote/ma200Monitor.js';
import { getLatestCompletedEodCutoffDate } from '../server/quote/providers/eodhd.js';

function dateKeyFrom(startDate, offsetDays) {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function adjustedRows(values, { startDate = '2025-01-01' } = {}) {
  return values.map((adjustedClose, index) => ({
    date: dateKeyFrom(startDate, index),
    close: adjustedClose * 10,
    adjusted_close: adjustedClose,
    high: adjustedClose * 10 + 1,
    low: adjustedClose * 10 - 1,
  }));
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

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function delayedQuote(price) {
  return {
    lastTradePrice: String(price),
    previousClosePrice: String(price - 1),
    change: '1',
    changePercent: '1',
    high: String(price + 1),
    low: String(price - 2),
    open: String(price - 1),
    timestamp: '1750000000',
  };
}

test('quote cutoff advances only after the regular session has completed', () => {
  assert.equal(
    getLatestCompletedEodCutoffDate(Date.parse('2026-08-03T15:00:00Z')),
    '2026-08-02',
  );
  assert.equal(
    getLatestCompletedEodCutoffDate(Date.parse('2026-08-03T21:00:00Z')),
    '2026-08-03',
  );
  assert.equal(
    getLatestCompletedEodCutoffDate(Date.parse('2026-08-08T15:00:00Z')),
    '2026-08-07',
  );
});

test('MA200 monitor uses only completed EODHD adjusted closes and ignores later rows', () => {
  const values = [...Array(200).fill(100), 90];
  const rows = adjustedRows(values);
  rows.push({
    date: dateKeyFrom('2025-01-01', 201),
    close: 1,
    adjusted_close: 1,
  });
  const asOfDate = rows[200].date;

  const result = deriveMa200Monitor(rows, { asOfDate });

  assert.equal(result.status, 'ready');
  assert.equal(result.source, 'EODHD');
  assert.equal(result.priceBasis, 'eodhd_adjusted_close');
  assert.equal(result.asOfDate, asOfDate);
  assert.equal(result.completedClose, 90);
  assert.equal(result.ma200, 99.95);
  assert.ok(Math.abs(result.distancePct - ((90 / 99.95) - 1) * 100) < 1e-12);
  assert.equal(result.belowCompletedDays, 1);
});

test('MA200 monitor counts completed trading rows and does not cap a streak at 20', () => {
  const rows = adjustedRows([...Array(200).fill(100), ...Array(21).fill(90)]);

  const result = deriveMa200Monitor(rows, { asOfDate: rows.at(-1).date });

  assert.equal(result.status, 'ready');
  assert.equal(result.belowCompletedDays, 21);
});

test('MA200 monitor fails closed instead of falling back to raw close', () => {
  const rows = adjustedRows(Array(201).fill(100));
  rows[20] = {
    ...rows[20],
    close: 100,
    adjusted_close: null,
  };

  const result = deriveMa200Monitor(rows, { asOfDate: rows.at(-1).date });

  assert.equal(result.status, 'insufficient_data');
  assert.equal(result.priceBasis, 'eodhd_adjusted_close');
  assert.equal(result.completedClose, null);
  assert.equal(result.ma200, null);
  assert.equal(result.distancePct, null);
  assert.equal(result.belowCompletedDays, 0);
});

test('quote ma200Symbols is an explicit ordinary-stock subset and never uses a detail view', async () => {
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';

  try {
    for (const query of [
      { symbols: 'AAPL', ma200Symbols: 'MSFT' },
      { symbols: 'AAPL,VIX', ma200Symbols: 'VIX' },
      { symbols: 'AAPL', ma200Symbols: 'AAPL', view: 'stock-detail' },
      { ma200Symbols: 'AAPL', view: 'market-movers' },
    ]) {
      const res = createResponse();
      await handler({ method: 'GET', headers: {}, query }, res);
      assert.equal(res.statusCode, 400);
    }
  } finally {
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

test('ma200Symbols reuses each stock quote EOD request and only enriches the requested row', async () => {
  const originalFetch = globalThis.fetch;
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  const historyRows = adjustedRows([...Array(200).fill(100), 90]);

  const requestUrls = [];
  globalThis.fetch = async (url) => {
    requestUrls.push(String(url));
    const parsed = new URL(url);
    if (parsed.pathname.includes('/api/us-quote-delayed')) {
      const symbol = String(parsed.searchParams.get('s') || '').replace(/\.US$/, '');
      return jsonResponse({ data: { [`${symbol}.US`]: delayedQuote(symbol === 'AAPL' ? 190 : 290) } });
    }
    if (parsed.pathname.includes('/api/eod/')) return jsonResponse(historyRows);
    if (parsed.hostname === 'query1.finance.yahoo.com') {
      return jsonResponse({ chart: { result: [] } });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';

  const callQuote = async (ma200Symbols) => {
    requestUrls.length = 0;
    const res = createResponse();
    await handler({
      method: 'GET',
      headers: {},
      query: {
        symbols: 'AAPL,MSFT',
        ...(ma200Symbols ? { ma200Symbols } : {}),
      },
    }, res);
    assert.equal(res.statusCode, 200);
    return {
      body: res.body,
      urls: [...requestUrls],
    };
  };

  try {
    const baseline = await callQuote();
    const monitored = await callQuote('AAPL');
    const countCalls = (urls) => ({
      delayed: urls.filter((url) => url.includes('/api/us-quote-delayed')).length,
      eod: urls.filter((url) => url.includes('/api/eod/')).length,
      splits: urls.filter((url) => url.includes('/api/splits/')).length,
      yahoo: urls.filter((url) => url.includes('query1.finance.yahoo.com')).length,
    });

    assert.deepEqual(countCalls(baseline.urls), {
      delayed: 2,
      eod: 2,
      splits: 0,
      yahoo: 2,
    });
    assert.deepEqual(countCalls(monitored.urls), countCalls(baseline.urls));

    const aapl = monitored.body.data.find((row) => row.symbol === 'AAPL');
    const msft = monitored.body.data.find((row) => row.symbol === 'MSFT');
    assert.equal(aapl.ma200Monitor.status, 'ready');
    assert.equal(aapl.ma200Monitor.belowCompletedDays, 1);
    assert.equal(Object.hasOwn(msft, 'ma200Monitor'), false);
    assert.equal(Object.hasOwn(baseline.body.data[0], 'ma200Monitor'), false);
    assert.equal(Object.hasOwn(baseline.body.data[1], 'ma200Monitor'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});
