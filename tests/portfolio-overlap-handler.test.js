import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/quote.js';
import { resetPortfolioOverlapCacheForTests } from '../server/quote/portfolioOverlap.js';

function res() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, end() {} };
}
const request = (query = { view: 'portfolio-overlap', symbols: 'TQQQ' }, authorized = false) => ({
  method: 'GET', headers: authorized ? { authorization: 'Bearer test-session' } : {}, query,
});
async function withAuth(fn) {
  const names = ['QUOTE_API_AUTH_REQUIRED', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const oldFetch = globalThis.fetch;
  const calls = [];
  process.env.QUOTE_API_AUTH_REQUIRED = 'true';
  process.env.SUPABASE_URL = 'https://auth.test.invalid';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    assert.equal(url, 'https://auth.test.invalid/auth/v1/user', 'this smoke must never query financial data');
    assert.equal(options.headers.Authorization, 'Bearer test-session');
    return { ok: true, json: async () => ({ id: 'test-user' }) };
  };
  resetPortfolioOverlapCacheForTests();
  try { await fn(calls); }
  finally {
    globalThis.fetch = oldFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    resetPortfolioOverlapCacheForTests();
  }
}

test('overlap endpoint returns 401 before any metadata or authentication network request', async () => {
  await withAuth(async calls => {
    const response = res();
    await handler(request(), response);
    assert.equal(response.statusCode, 401);
    assert.equal(calls.length, 0);
    assert.match(response.headers['Cache-Control'], /private, no-store/);
  });
});

test('authenticated overlap endpoint returns the standalone contract without provider amounts', async () => {
  await withAuth(async calls => {
    const response = res();
    await handler(request(undefined, true), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.version, 1);
    assert.equal(response.body.data.instruments[0].symbol, 'TQQQ');
    assert.equal(response.body.data.instruments[0].kind, 'leveraged_etf');
    assert.deepEqual(response.body.data.instruments[0].holdings, []);
    assert.equal(calls.length, 1);
    assert.doesNotMatch(JSON.stringify(response.body), /test-user|test-session|amount|heldShares/);
  });
});

test('authenticated overlap endpoint rejects ambiguous or missing symbols without provider work', async () => {
  await withAuth(async calls => {
    for (const query of [
      { view: ['portfolio-overlap', 'stock-detail'], symbols: 'QQQ' },
      { view: 'portfolio-overlap', symbols: ['QQQ', 'SPY'] },
      { view: 'portfolio-overlap' },
      { view: 'portfolio-overlap', symbols: 'QQQ&token=leak' },
    ]) {
      const response = res();
      await handler(request(query, true), response);
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.details.code, 'INVALID_SYMBOLS');
    }
    assert.equal(calls.length, 4, 'only authentication requests are allowed');
  });
});
