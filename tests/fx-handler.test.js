import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/fx.js';

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
    query: {},
    ...overrides,
  };
}

test('fx handler rejects unauthenticated requests by default', async () => {
  delete process.env.QUOTE_API_AUTH_REQUIRED;
  const res = createResponse();

  await handler(createRequest(), res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /未授权/);
});

test('fx handler rejects unsupported methods before provider work', async () => {
  const res = createResponse();

  await handler(createRequest({ method: 'POST' }), res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, OPTIONS');
});

test('fx handler requires EODHD_API_KEY after auth is disabled in tests', async () => {
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  delete process.env.EODHD_API_KEY;
  const res = createResponse();

  await handler(createRequest(), res);

  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /EODHD_API_KEY/);
  delete process.env.QUOTE_API_AUTH_REQUIRED;
});
