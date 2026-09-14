import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/quote.js';

const response = () => ({ headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } });

test('valuation endpoint always requires auth, rejects ambiguous parameters and awaits independent SEC valuation', async () => {
  const keys = ['QUOTE_API_AUTH_REQUIRED', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'EODHD_API_KEY'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.SUPABASE_URL = 'https://valuation-auth.test';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  delete process.env.EODHD_API_KEY;
  let authCalls = 0;
  let sourceCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (new URL(url).hostname.endsWith('sec.gov')) {
      sourceCalls++;
      return { ok: false, status: 503, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '' };
    }
    assert.equal(url, 'https://valuation-auth.test/auth/v1/user');
    authCalls++;
    return { ok: options.headers.Authorization === 'Bearer valid-test-token', json: async () => ({ id: 'valuation-test-user' }) };
  };
  const call = async (query, authorization) => {
    const res = response();
    await handler({ method: 'GET', query, headers: authorization ? { authorization } : {} }, res);
    assert.match(res.headers['Cache-Control'], /private, no-store/);
    return res;
  };
  try {
    assert.equal((await call({ view: 'stock-valuation', symbol: 'MSFT' })).statusCode, 401);
    assert.equal(authCalls, 0);
    assert.equal(sourceCalls, 0);
    assert.equal((await call({ view: 'stock-valuation', symbol: 'MSFT' }, 'Bearer invalid')).statusCode, 401);
    for (const query of [
      { view: ['stock-valuation'], symbol: 'MSFT' },
      { view: ['valuation', 'stock-valuation'], symbol: 'MSFT' },
      { view: 'stock-valuation', symbol: ['MSFT'] },
      { view: 'stock-valuation', symbol: 'MSFT', price: 100 },
      { view: 'stock-valuation' },
    ]) assert.equal((await call(query, 'Bearer valid-test-token')).statusCode, 400);
    const res = await call({ view: 'stock-valuation', symbol: 'MSFT' }, 'Bearer valid-test-token');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.symbol, 'MSFT');
    assert.equal(res.body.data.currency, 'USD');
    assert.equal(res.body.data.schemaVersion, 2, 'an awaited serializable envelope, not an unresolved Promise');
    assert.equal(res.body.data.status, 'pending', 'upstream failure only withholds valuation');
    assert.deepEqual(res.body.data.scenarios, []);
    assert.ok(sourceCalls > 0, 'valuation actually checks the official financial source');
    assert.equal((await call({ view: 'stock-valuation', symbol: 'QQQ' }, 'Bearer valid-test-token')).body.data.status, 'unsupported');
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
  }
});
