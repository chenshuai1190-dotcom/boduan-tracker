import test from 'node:test';
import assert from 'node:assert/strict';

import handler, { resetPnlBenchmarkPublicCacheForTests } from '../api/pnl-benchmark.js';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
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
      this.ended = true;
      return this;
    },
  };
}

function createRequest(overrides = {}) {
  return {
    method: 'GET',
    headers: {},
    query: { symbol: 'QQQ', from: '2026-01-01', to: '2026-07-08' },
    ...overrides,
  };
}

function restoreEnv(snapshot) {
  if (snapshot.authRequired === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
  else process.env.QUOTE_API_AUTH_REQUIRED = snapshot.authRequired;
  if (snapshot.eodhdKey === undefined) delete process.env.EODHD_API_KEY;
  else process.env.EODHD_API_KEY = snapshot.eodhdKey;
}

test('pnl benchmark handler rejects unauthenticated requests by default', async () => {
  delete process.env.QUOTE_API_AUTH_REQUIRED;
  const res = createResponse();

  await handler(createRequest(), res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /未授权/);
});

test('pnl benchmark handler validates date range after auth is disabled', async () => {
  const env = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    eodhdKey: process.env.EODHD_API_KEY,
  };
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  const res = createResponse();

  try {
    await handler(createRequest({ query: { symbol: 'QQQ', from: '2026-07-08', to: '2026-01-01' } }), res);
  } finally {
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /from/);
});

function yahooTimestamp(dateKey) {
  return Math.floor(new Date(`${dateKey}T20:00:00Z`).getTime() / 1000);
}

function yahooChart(rows) {
  return {
    chart: {
      result: [{
        meta: { exchangeTimezoneName: 'America/New_York' },
        timestamp: rows.map((row) => yahooTimestamp(row.date)),
        indicators: {
          quote: [{ close: rows.map((row) => row.close) }],
          adjclose: [{ adjclose: rows.map((row) => row.adjustedClose) }],
        },
      }],
      error: null,
    },
  };
}

test('pnl benchmark handler returns sanitized completed Yahoo rows for any valid single U.S. symbol', async () => {
  const env = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    eodhdKey: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  resetPnlBenchmarkPublicCacheForTests();
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => yahooChart([
        { date: '2026-01-02', close: 500, adjustedClose: 501 },
        { date: '2026-02-02', close: 510, adjustedClose: 0 },
        { date: '2026-03-02', close: 'invalid', adjustedClose: 515 },
        { date: '2026-04-02', close: -1, adjustedClose: null },
        { date: '2026-07-08', close: 550, adjustedClose: 552 },
      ]),
    };
  };
  const res = createResponse();

  try {
    await handler(createRequest({
      query: { symbol: 'NVDA', from: '2026-01-01', to: '2026-07-08' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.symbol, 'NVDA');
  assert.equal(res.body.rows.length, 4);
  assert.deepEqual(res.body.rows[0], {
    date: '2026-01-02',
    close: 501,
    rawClose: 500,
    adjustedClose: 501,
  });
  assert.deepEqual(res.body.rows[1], {
    date: '2026-02-02',
    close: 510,
    rawClose: 510,
    adjustedClose: null,
  });
  assert.deepEqual(res.body.rows[2], {
    date: '2026-03-02',
    close: 515,
    rawClose: null,
    adjustedClose: 515,
  });
  assert.equal(res.body.source, 'YAHOO_CHART_COMPLETED_DAILY');
  assert.match(requestedUrl, /query1\.finance\.yahoo\.com\/v8\/finance\/chart\/NVDA/);
  assert.match(requestedUrl, /interval=1d/);
  assert.match(requestedUrl, /range=5y/);
  assert.match(requestedUrl, /includeAdjustedClose=true/);
  assert.doesNotMatch(requestedUrl, /api_token|test-eodhd-key/);
  assert.doesNotMatch(JSON.stringify(res.body), /test-eodhd-key/);
});

test('pnl benchmark handler fails closed when Yahoo omits the requested completed close', async () => {
  const env = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    eodhdKey: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  resetPnlBenchmarkPublicCacheForTests();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => yahooChart([
      { date: '2026-07-07', close: 500, adjustedClose: 501 },
    ]),
  });
  const res = createResponse();

  try {
    await handler(createRequest({
      query: { symbol: 'QQQ', from: '2026-07-01', to: '2026-07-08' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /latest completed close missing/);
  assert.equal(res.body.rows, undefined);
});

test('pnl benchmark public cache merges identical inflight requests without caching auth state', async () => {
  const env = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    eodhdKey: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  resetPnlBenchmarkPublicCacheForTests();
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      ok: true,
      status: 200,
      json: async () => yahooChart([
        { date: '2026-07-08', close: 550, adjustedClose: 552 },
      ]),
    };
  };
  const first = createResponse();
  const second = createResponse();

  try {
    await Promise.all([
      handler(createRequest(), first),
      handler(createRequest(), second),
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(fetchCount, 1);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.deepEqual(first.body.rows, second.body.rows);
  assert.doesNotMatch(JSON.stringify(first.body), /test-eodhd-key|authorization/i);
});

test('pnl benchmark cache shares one public five-year load across report ranges', async () => {
  const env = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    eodhdKey: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  resetPnlBenchmarkPublicCacheForTests();
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => yahooChart([
        { date: '2026-01-02', close: 500, adjustedClose: 501 },
        { date: '2026-07-08', close: 550, adjustedClose: 552 },
      ]),
    };
  };
  const fullRange = createResponse();
  const shortRange = createResponse();

  try {
    await handler(createRequest(), fullRange);
    await handler(createRequest({
      query: { symbol: 'QQQ', from: '2026-07-01', to: '2026-07-08' },
    }), shortRange);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(fetchCount, 1);
  assert.deepEqual(fullRange.body.rows.map((row) => row.date), ['2026-01-02', '2026-07-08']);
  assert.deepEqual(shortRange.body.rows.map((row) => row.date), ['2026-07-08']);
});

test('pnl benchmark retries once on the alternate Yahoo chart host without returning partial data', async () => {
  const env = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    eodhdKey: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  resetPnlBenchmarkPublicCacheForTests();
  const requestedHosts = [];
  globalThis.fetch = async (url) => {
    const host = new URL(String(url)).hostname;
    requestedHosts.push(host);
    if (host === 'query1.finance.yahoo.com') {
      return { ok: false, status: 429, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => yahooChart([
        { date: '2026-07-08', close: 550, adjustedClose: 552 },
      ]),
    };
  };
  const res = createResponse();

  try {
    await handler(createRequest({
      query: { symbol: 'QQQ', from: '2026-07-01', to: '2026-07-08' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.deepEqual(requestedHosts, ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);
  assert.deepEqual(res.body.rows.map((row) => row.date), ['2026-07-08']);
});

test('pnl benchmark projects a historical weekend end date to the prior completed session', async () => {
  const env = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    eodhdKey: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  resetPnlBenchmarkPublicCacheForTests();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => yahooChart([
      { date: '2026-07-10', close: 550, adjustedClose: 552 },
    ]),
  });
  const res = createResponse();

  try {
    await handler(createRequest({
      query: { symbol: 'QQQ', from: '2026-07-01', to: '2026-07-11' },
    }), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.to, '2026-07-10');
  assert.deepEqual(res.body.rows.map((row) => row.date), ['2026-07-10']);
});
