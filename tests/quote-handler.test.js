import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/quote.js';
import {
  QUOTE_API_POLICY_HEADER,
  QUOTE_API_POLICY_VERSION,
} from '../src/lib/quoteApiPolicy.js';

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
    headers: { [QUOTE_API_POLICY_HEADER.toLowerCase()]: QUOTE_API_POLICY_VERSION },
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

test('quote handler rejects an old client policy before auth or provider work', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error('must not fetch');
  };
  try {
    const res = createResponse();
    await handler(createRequest({
      headers: {
        authorization: 'Bearer stale-session',
        [QUOTE_API_POLICY_HEADER.toLowerCase()]: 'legacy-v404',
      },
    }), res);

    assert.equal(res.statusCode, 426);
    assert.match(res.body.error, /客户端版本已过期/);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
