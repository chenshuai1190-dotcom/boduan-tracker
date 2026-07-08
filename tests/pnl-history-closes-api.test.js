import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/pnl-history-closes.js';

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
    query: { symbols: 'NVDA,MSFT', to: '2026-07-08', days: '3' },
    ...overrides,
  };
}

function restoreEnv(snapshot) {
  if (snapshot.authRequired === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
  else process.env.QUOTE_API_AUTH_REQUIRED = snapshot.authRequired;
  if (snapshot.eodhdKey === undefined) delete process.env.EODHD_API_KEY;
  else process.env.EODHD_API_KEY = snapshot.eodhdKey;
}

test('pnl history closes handler rejects unauthenticated requests by default', async () => {
  delete process.env.QUOTE_API_AUTH_REQUIRED;
  const res = createResponse();

  await handler(createRequest(), res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /未授权/);
});

test('pnl history closes handler returns sanitized multi-symbol EODHD daily rows', async () => {
  const env = {
    authRequired: process.env.QUOTE_API_AUTH_REQUIRED,
    eodhdKey: process.env.EODHD_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.EODHD_API_KEY = 'test-eodhd-key';
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => [
        { date: '2026-07-02', close: 100, adjusted_close: 101 },
        { date: '2026-07-06', close: 102, adjusted_close: 103 },
        { date: '2026-07-07', close: 104, adjusted_close: 105 },
        { date: '2026-07-08', close: 106, adjusted_close: 107 },
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
  assert.equal(res.body.days, 3);
  assert.deepEqual(Object.keys(res.body.rowsBySymbol).sort(), ['MSFT', 'NVDA']);
  assert.deepEqual(res.body.rowsBySymbol.NVDA.map((row) => row.date), ['2026-07-06', '2026-07-07', '2026-07-08']);
  assert.equal(res.body.rowsBySymbol.NVDA[0].close, 103);
  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0], /\/api\/eod\/NVDA\.US/);
  assert.match(requestedUrls[1], /\/api\/eod\/MSFT\.US/);
  assert.doesNotMatch(JSON.stringify(res.body), /test-eodhd-key/);
});
