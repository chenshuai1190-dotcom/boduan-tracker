import test from 'node:test';
import assert from 'node:assert/strict';
import { createMacroDataService, MACRO_CACHE_MS, MACRO_FAILURE_CACHE_MS } from '../server/macro/MacroDataService.js';
import handler from '../api/quote.js';

const series = { us10y: { history: [{ date: '2026-09-17', value: 4.94 }], source: 'EODHD' } };
test('MacroDataService shares inflight work, caches bounded public observations, then refreshes', async () => {
  let current = new Date('2026-09-18T13:00:00Z');
  let calls = 0;
  const service = createMacroDataService({ clock: () => current,
    eodhdProvider: async () => { calls++; return { series, events: [], calendarStatus: 'available' }; },
    publicProvider: async () => ({ series: {} }),
  });
  const [a, b] = await Promise.all([service(), service()]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.equal(a.metrics.us10y.value, 4.94);
  assert.equal(a.growth.score, null);
  await service(); assert.equal(calls, 1);
  current = new Date(current.getTime() + MACRO_CACHE_MS + 1);
  await service(); assert.equal(calls, 2);
});
test('upstream outage preserves other providers, missing is never zero or mock and total failure backs off', async () => {
  let current = new Date('2026-09-18T13:00:00Z');
  let calls = 0;
  const partial = createMacroDataService({ clock: () => current,
    eodhdProvider: async () => { throw Error('private-url-must-not-escape'); },
    publicProvider: async () => ({ series: { vix: { source: 'CBOE', history: [{ date: '2026-09-17', value: 15.44 }] } } }),
  });
  const snapshot = await partial();
  assert.equal(snapshot.metrics.vix.value, 15.44);
  assert.equal(snapshot.metrics.us10y.value, null);
  assert.equal(snapshot.calendarStatus, 'unavailable');
  assert.doesNotMatch(JSON.stringify(snapshot), /private-url|模拟|62/);
  const empty = createMacroDataService({ clock: () => current,
    eodhdProvider: async () => { calls++; throw Error('unavailable'); },
    publicProvider: async () => { throw Error('unavailable'); },
  });
  assert.equal((await empty()).availability.available, 0);
  await empty(); assert.equal(calls, 1);
  current = new Date(current.getTime() + MACRO_FAILURE_CACHE_MS + 1);
  await empty(); assert.equal(calls, 2);
});

const response = () => ({ headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } });
test('macro view requires authentication even with legacy bypass off; rejects arbitrary queries and sanitizes failures', async () => {
  const keys = ['QUOTE_API_AUTH_REQUIRED', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'EODHD_API_KEY'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  Object.assign(process.env, { QUOTE_API_AUTH_REQUIRED: 'false', SUPABASE_URL: 'https://macro-auth.test', SUPABASE_ANON_KEY: 'test-anon', EODHD_API_KEY: 'test-secret' });
  let sourceCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (new URL(url).hostname === 'macro-auth.test') return { ok: options.headers.Authorization === 'Bearer valid-test-token', json: async () => ({ id: 'macro-test' }) };
    sourceCalls++;
    return { ok: false, status: 503, text: async () => 'secret upstream failure' };
  };
  const call = async (query, authorization) => {
    const res = response();
    await handler({ method: 'GET', query, headers: authorization ? { authorization } : {} }, res);
    assert.match(res.headers['Cache-Control'], /private, no-store/);
    return res;
  };
  try {
    assert.equal((await call({ view: 'macro' })).statusCode, 401);
    assert.equal(sourceCalls, 0);
    assert.equal((await call({ view: 'macro' }, 'Bearer invalid')).statusCode, 401);
    for (const query of [{ view: ['macro'] }, { view: ['quote', 'macro'] }, { view: 'macro', url: 'https://evil.test' }, { view: 'macro', symbol: 'META' }]) {
      assert.equal((await call(query, 'Bearer valid-test-token')).statusCode, 400);
    }
    assert.equal(sourceCalls, 0);
    const res = await call({ view: 'macro' }, 'Bearer valid-test-token');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.availability.available, 0);
    assert.equal(res.body.data.simulated, false);
    assert.equal(res.body.data.growth.score, null);
    assert.doesNotMatch(JSON.stringify(res.body), /test-secret|secret upstream/);
    assert.ok(sourceCalls > 0);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
  }
});
