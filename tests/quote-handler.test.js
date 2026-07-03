import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/quote.js';

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
    query: { symbols: 'VIX' },
    ...overrides,
  };
}

test('quote handler rejects unauthenticated requests by default', async () => {
  delete process.env.QUOTE_API_AUTH_REQUIRED;
  const res = createResponse();

  await handler(createRequest(), res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /未授权/);
});

test('quote handler validates symbols before reading provider keys', async () => {
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  delete process.env.EODHD_API_KEY;
  const res = createResponse();

  await handler(createRequest({ query: { symbols: 'QQQ, DROP TABLE' } }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /股票代码不合法/);
  delete process.env.QUOTE_API_AUTH_REQUIRED;
});

test('quote handler rejects unsupported methods before auth/provider work', async () => {
  const res = createResponse();

  await handler(createRequest({ method: 'POST' }), res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, OPTIONS');
});
