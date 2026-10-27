import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/quote.js';
import { resetStockComparisonCacheForTests } from '../server/quote/stockComparison.js';
import { resetInvestmentComparisonCacheForTests } from '../server/quote/investmentComparison.js';

const response = () => ({
  headers: {}, statusCode: 200,
  setHeader(key, value) { this.headers[key] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }, end() { return this; },
});

test('stock comparison API requires auth in legacy public mode and rejects ambiguous parameters before provider work', async () => {
  const keys = ['QUOTE_API_AUTH_REQUIRED', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'EODHD_API_KEY'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch; const oldNow = Date.now;
  resetStockComparisonCacheForTests(); resetInvestmentComparisonCacheForTests();
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  process.env.SUPABASE_URL = 'https://stock-comparison-auth.test';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.EODHD_API_KEY = 'private-eodhd-key';
  Date.now = () => Date.parse('2026-10-27T10:00:00Z');
  let authCalls = 0; const sourceCalls = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'stock-comparison-auth.test') {
      authCalls++;
      return { ok: options.headers.Authorization === 'Bearer valid-token', json: async () => ({ id: 'comparison-user' }) };
    }
    sourceCalls.push(url);
    const symbol = url.pathname.split('/').at(-1).replace(/\.US$/, '');
    const payload = url.pathname.startsWith('/api/search/')
      ? [{ Code: symbol, Name: `${symbol} Fund`, Type: 'ETF', Currency: 'USD', Country: 'USA', Exchange: 'US' }]
      : url.pathname.startsWith('/api/eod/')
        ? [{ date: '2026-10-19', close: 100, adjusted_close: 30 }, { date: '2026-10-23', close: 110, adjusted_close: 32 }]
        : [];
    return { ok: true, status: 200, json: async () => payload };
  };
  const base = { view: 'stock-comparison', symbols: 'QQQ,TQQQ', from: '2026-10-19', to: '2026-10-23' };
  const call = async (query, authorization, method = 'GET') => {
    const res = response();
    await handler({ method, query, headers: authorization ? { authorization } : {} }, res);
    assert.match(res.headers['Cache-Control'], /private, no-store/);
    return res;
  };
  try {
    assert.equal((await call(base)).statusCode, 401);
    assert.equal(authCalls, 0);
    assert.equal(sourceCalls.length, 0);
    assert.equal((await call(base, 'Bearer invalid')).statusCode, 401);
    assert.equal(sourceCalls.length, 0);
    for (const query of [
      { ...base, view: ['stock-comparison'] },
      { ...base, view: ['stock-detail', 'stock-comparison'] },
      { ...base, symbols: ['QQQ', 'TQQQ'] },
      { ...base, from: ['2026-10-19'] },
      { ...base, to: ['2026-10-23'] },
      { ...base, unexpected: 'x' },
      { ...base, symbol: 'QQQ' },
      { ...base, symbols: 'QQQ' },
      { ...base, symbols: 'QQQ,QQQ' },
      { ...base, symbols: 'QQQ,^IXIC' },
      { ...base, from: '2026-02-30' },
      { ...base, from: '1999-12-31' },
      { ...base, to: '2026-10-27' },
      { ...base, from: undefined },
    ]) assert.equal((await call(query, 'Bearer valid-token')).statusCode, 400, JSON.stringify(query));
    assert.equal(sourceCalls.length, 0, 'bad parameters do not consume quote quota');
    assert.equal((await call(base, 'Bearer valid-token', 'POST')).statusCode, 405);
    const result = await call(base, 'Bearer valid-token');
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.source, 'EODHD_EOD_SPLITS');
    assert.equal(result.body.data.priceBasis, 'split_adjusted_close');
    assert.equal(result.body.data.splitBasisDate, '2026-10-26');
    assert.equal(result.body.data.asOfDate, '2026-10-23');
    assert.deepEqual(result.body.data.symbols, ['QQQ', 'TQQQ']);
    assert.equal(result.body.data.series.TQQQ.rows[0].close, 100);
    assert.doesNotMatch(JSON.stringify(result.body), /private-eodhd-key|api_token|valid-token/);
  } finally {
    globalThis.fetch = oldFetch; Date.now = oldNow;
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    resetStockComparisonCacheForTests(); resetInvestmentComparisonCacheForTests();
  }
});
