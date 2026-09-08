import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadPortfolioOverlap, normalizePortfolioOverlapSymbols, clearPortfolioOverlapCache } from '../src/lib/portfolioOverlap.js';

const timestamp = Date.parse('2026-09-08T08:00:00Z');
const session = identity => async () => ({ data: { session: { user: { id: identity }, access_token: `private-${identity}` } } });
const payload = symbols => ({ version: 1, fetchedAt: new Date(timestamp).toISOString(), instruments: symbols.map(symbol => ({ symbol, kind: 'unknown', holdingsStatus: 'unavailable', holdings: [] })) });
const response = data => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const options = (extra = {}) => ({ userId: 'alice', symbols: ['QQQ', 'SPY'], now: () => timestamp, getSession: session('alice'), ...extra });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(clearPortfolioOverlapCache);

test('only canonical security codes are sent; no portfolio amounts, user ID or token in URL', async () => {
  let request;
  const fetchImpl = async (url, init) => { request = { url, init }; return response(payload(['QQQ', 'SPY'])); };
  await loadPortfolioOverlap(options({ symbols: ['spy', 'QQQ', ' SPY '], amount: 999, holdings: [{ shares: 12 }], fetchImpl }));
  assert.equal(request.url, '/api/quote?view=portfolio-overlap&symbols=QQQ%2CSPY');
  assert.equal(request.init.headers.Authorization, 'Bearer private-alice');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.body, undefined);
  assert.doesNotMatch(request.url, /alice|999|shares|private/);
});

test('symbol validation is bounded and rejects paths or query injection', () => {
  assert.deepEqual(normalizePortfolioOverlapSymbols(['qqq', 'SPY', 'QQQ']), ['QQQ', 'SPY']);
  for (const symbols of [[''], ['A&token=x'], ['../QQQ'], ['A..B'], ['QQQ.US'], ['9988.HK'], [null], Array.from({ length: 41 }, (_, i) => `A${i}`)]) {
    assert.throws(() => normalizePortfolioOverlapSymbols(symbols), { code: 'INVALID_SYMBOLS' });
  }
});

test('price-only rerenders, reordered symbols and repeated callers reuse metadata without polling', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(payload(['QQQ', 'SPY'])); };
  const first = await loadPortfolioOverlap(options({ fetchImpl }));
  first.instruments[0].symbol = 'MUTATED';
  const cached = await loadPortfolioOverlap(options({ symbols: ['SPY', 'QQQ'], fetchImpl }));
  assert.equal(calls, 1);
  assert.equal(cached.instruments[0].symbol, 'QQQ', 'cache cannot be mutated by a caller');
  await loadPortfolioOverlap(options({ force: true, fetchImpl }));
  assert.equal(calls, 2);
});

test('cached and empty responses still require the matching authenticated user', async () => {
  const fetchImpl = async () => response(payload(['QQQ', 'SPY']));
  await loadPortfolioOverlap(options({ fetchImpl }));
  await assert.rejects(loadPortfolioOverlap(options({ fetchImpl, getSession: session('bob') })), { code: 'AUTH_REQUIRED' });
  await assert.rejects(loadPortfolioOverlap(options({ symbols: [], getSession: session('bob') })), { code: 'AUTH_REQUIRED' });
  const empty = await loadPortfolioOverlap(options({ symbols: [], fetchImpl: () => { throw new Error('must not fetch'); } }));
  assert.deepEqual(empty.instruments, []);
});

test('metadata cache keys and concurrent work remain isolated by user', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(payload(['QQQ', 'SPY'])); };
  await loadPortfolioOverlap(options({ fetchImpl }));
  await loadPortfolioOverlap(options({ userId: 'bob', getSession: session('bob'), fetchImpl }));
  assert.equal(calls, 2);
});

test('single flight subscribers can abort independently', async () => {
  const started = deferred(), pending = deferred();
  let calls = 0;
  const fetchImpl = () => { calls += 1; started.resolve(); return pending.promise; };
  const controller = new AbortController();
  const first = loadPortfolioOverlap(options({ fetchImpl, signal: controller.signal }));
  await started.promise;
  const second = loadPortfolioOverlap(options({ fetchImpl }));
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  pending.resolve(response(payload(['QQQ', 'SPY'])));
  assert.equal((await second).instruments.length, 2);
  assert.equal(calls, 1);
});

test('aborting during session lookup never starts an orphan network request', async () => {
  const auth = deferred();
  const controller = new AbortController();
  let calls = 0;
  const request = loadPortfolioOverlap(options({ signal: controller.signal, getSession: () => auth.promise,
    fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); },
  }));
  controller.abort();
  auth.resolve(await session('alice')());
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('account change while fetching rejects late data and cannot repopulate old cache', async () => {
  const started = deferred(), pending = deferred();
  let identity = 'alice';
  const getSession = () => session(identity)();
  const request = loadPortfolioOverlap(options({ getSession, fetchImpl: () => { started.resolve(); return pending.promise; } }));
  await started.promise;
  identity = 'bob';
  pending.resolve(response(payload(['QQQ', 'SPY'])));
  await assert.rejects(request, { code: 'AUTH_REQUIRED' });
  identity = 'alice';
  let calls = 0;
  await loadPortfolioOverlap(options({ getSession, fetchImpl: async () => { calls += 1; return response(payload(['QQQ', 'SPY'])); } }));
  assert.equal(calls, 1);
});

test('malformed, incomplete, duplicate and future-dated responses fail closed', async () => {
  for (const data of [payload(['QQQ']), payload(['QQQ', 'QQQ']), payload(['QQQ', 'NVDA']), { ...payload(['QQQ', 'SPY']), fetchedAt: '2030-01-01T00:00:00Z' }, { ...payload(['QQQ', 'SPY']), version: 2 }]) {
    clearPortfolioOverlapCache();
    await assert.rejects(loadPortfolioOverlap(options({ fetchImpl: async () => response(data) })), { code: 'INVALID_DATA' });
  }
});

test('provider failures have a bounded retry interval and explicit refresh can retry', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: false, status: 429 }; };
  await assert.rejects(loadPortfolioOverlap(options({ fetchImpl })), { code: 'RATE_LIMITED' });
  await assert.rejects(loadPortfolioOverlap(options({ fetchImpl })), { code: 'RATE_LIMITED' });
  assert.equal(calls, 1);
  await assert.rejects(loadPortfolioOverlap(options({ fetchImpl, force: true })), { code: 'RATE_LIMITED' });
  assert.equal(calls, 2);
});

test('individual unavailable metadata retries after one minute instead of fifteen', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(payload(['QQQ', 'SPY'])); };
  await loadPortfolioOverlap(options({ fetchImpl }));
  await loadPortfolioOverlap(options({ fetchImpl, now: () => timestamp + 30000 }));
  assert.equal(calls, 1);
  await loadPortfolioOverlap(options({ fetchImpl, now: () => timestamp + 61000 }));
  assert.equal(calls, 2);
});

test('underlying timeout and cache reset cannot later publish a stale request', async () => {
  await assert.rejects(loadPortfolioOverlap(options({ fetchImpl: () => new Promise(() => {}), timeoutMs: 5 })), { code: 'NETWORK_ERROR' });
  clearPortfolioOverlapCache();
  const started = deferred(), pending = deferred();
  const request = loadPortfolioOverlap(options({ fetchImpl: () => { started.resolve(); return pending.promise; } }));
  await started.promise;
  clearPortfolioOverlapCache();
  pending.resolve(response(payload(['QQQ', 'SPY'])));
  await assert.rejects(request, { code: 'REQUEST_SUPERSEDED' });
});
