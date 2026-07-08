import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/pnl-benchmark.js';

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

test('pnl benchmark handler returns sanitized EODHD daily rows', async () => {
  const env = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    eodhdKey: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => [
        { date: '2026-01-02', close: 500, adjusted_close: 501 },
        { date: '2026-07-08', close: 550, adjusted_close: 552 },
      ],
    };
  };
  const res = createResponse();

  try {
    await handler(createRequest(), res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.symbol, 'QQQ');
  assert.equal(res.body.rows.length, 2);
  assert.deepEqual(res.body.rows[0], { date: '2026-01-02', close: 501, adjustedClose: 501 });
  assert.match(requestedUrl, /\/api\/eod\/QQQ\.US/);
  assert.match(requestedUrl, /from=2026-01-01/);
  assert.match(requestedUrl, /to=2026-07-08/);
  assert.doesNotMatch(JSON.stringify(res.body), /test-eodhd-key/);
});
