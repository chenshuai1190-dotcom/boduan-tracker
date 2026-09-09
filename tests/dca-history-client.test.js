import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDcaHistory, normalizeDcaHistoryData, resetDcaHistoryMemoryCache, DCA_HISTORY_FAILURE_RETRY_MS, DCA_HISTORY_STALE_RETRY_MS } from '../src/lib/dcaHistory.js';

const NOW = Date.parse('2026-09-08T12:00:00Z');
function fixture(symbol = 'QQQ', overrides = {}) {
  return { version: 1, source: 'EODHD_EOD', symbol, name: `${symbol} test`, type: 'ETF', currency: 'USD', priceBasis: 'adjusted_close',
    expectedAsOfDate: '2026-09-04', asOfDate: '2026-09-04', availableFromDate: '2026-09-03', fetchedAt: new Date(NOW).toISOString(),
    stale: false, staleReason: '', rows: [{ date: '2026-09-03', close: 100 }, { date: '2026-09-04', close: 110 }], ...overrides };
}
const auth = (id = 'user-a') => async () => ({ data: { session: { user: { id }, access_token: `test-token-${id}` } } });
const response = (data = fixture(), status = 200, code) => ({ ok: status === 200, status, json: async () => ({ success: status === 200, data, ...(code ? { details: { code } } : {}) }) });
const args = (overrides = {}) => ({ userId: 'user-a', getSession: auth(), fetchImpl: async () => response(), now: () => NOW, ...overrides });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test.beforeEach(() => resetDcaHistoryMemoryCache());

test('normalizer admits only ordered single-symbol USD adjusted-close history and labels newly stale closes', () => {
  assert.deepEqual(normalizeDcaHistoryData(fixture(), { symbol: ' qqq ', now: NOW }), fixture());
  const stale = normalizeDcaHistoryData(fixture(), { expectedAsOfDate: '2026-09-08' });
  assert.equal(stale.stale, true);
  assert.equal(stale.staleReason, 'incomplete_close');
  for (const mutate of [
    v => { v.version = 2; }, v => { v.source = 'SIMULATED'; }, v => { v.currency = 'CNY'; }, v => { v.priceBasis = 'close'; },
    v => { v.symbol = 'QQQ.US'; }, v => { v.type = 'Index'; }, v => { v.name = ''; }, v => { v.name = 'bad\u0001name'; },
    v => { v.rows.reverse(); }, v => { v.rows.push(v.rows.at(-1)); }, v => { v.rows[0].date = '2026-02-30'; },
    v => { v.rows[0].date = '2026-08-30'; }, v => { v.rows[0].date = '2026-09-07'; }, v => { v.rows[1].date = '2026-09-08'; },
    v => { v.availableFromDate = '2026-09-02'; }, v => { v.asOfDate = '2026-09-08'; },
    v => { v.expectedAsOfDate = '2026-09-08'; }, v => { v.expectedAsOfDate = '2026-09-05'; },
    v => { v.stale = true; }, v => { v.staleReason = 'incomplete_close'; },
    v => { v.stale = true; v.staleReason = 'incomplete_close'; },
    v => { v.stale = true; v.staleReason = 'unknown'; }, v => { v.stale = 0; },
    v => { v.fetchedAt = 'invalid'; }, v => { v.fetchedAt = new Date(NOW + 300001).toISOString(); },
    v => { v.rows = [v.rows[0]]; }, v => { v.rows = null; },
  ]) {
    const value = fixture(); mutate(value);
    assert.equal(normalizeDcaHistoryData(value, { symbol: 'QQQ', now: NOW }), null, JSON.stringify(value));
  }
  for (const close of [undefined, null, 0, -1, NaN, Infinity, '', '100', false, {}]) {
    const value = fixture(); value.rows[0].close = close;
    assert.equal(normalizeDcaHistoryData(value, { now: NOW }), null);
  }
  assert.equal(normalizeDcaHistoryData(fixture(), { symbol: 'TQQQ' }), null);
  assert.equal(normalizeDcaHistoryData(fixture(), { expectedAsOfDate: '2026-09-03' }), null);
});

test('future expected dates and future rows are rejected even if the wire stale flags agree', () => {
  const value = fixture('QQQ', { expectedAsOfDate: '2026-09-08', asOfDate: '2026-09-08', rows: [{ date: '2026-09-04', close: 100 }, { date: '2026-09-08', close: 105 }], availableFromDate: '2026-09-04' });
  assert.equal(normalizeDcaHistoryData(value, { now: NOW }), null);
  assert.equal(normalizeDcaHistoryData(fixture(), { now: NaN }), null);
  assert.equal(normalizeDcaHistoryData(fixture(), { now: 1e20 }), null);
  assert.equal(normalizeDcaHistoryData(fixture(), { now: NOW, expectedAsOfDate: '2026-09-08' }), null);
});

test('authenticated symbol cache performs one history request per completed close and no benchmark request', async () => {
  let calls = 0, now = NOW;
  const options = args({ now: () => now, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, '/api/quote?view=dca-history&symbol=QQQ');
    assert.equal(options.headers.Authorization, 'Bearer test-token-user-a');
    assert.equal(options.cache, 'no-store');
    return response();
  } });
  const first = await loadDcaHistory(options);
  now += 5 * 60 * 60 * 1000;
  assert.strictEqual(await loadDcaHistory({ ...options, symbol: ' qqq ' }), first);
  assert.equal(calls, 1);
  now = Date.parse('2026-09-08T20:00:00Z');
  const stale = await loadDcaHistory(options);
  assert.equal(stale.stale, true);
  assert.equal(stale.expectedAsOfDate, '2026-09-08');
  await loadDcaHistory(options);
  assert.equal(calls, 2);
  now += DCA_HISTORY_STALE_RETRY_MS;
  await loadDcaHistory(options);
  assert.equal(calls, 3);
});

test('identity validation precedes cache hits, isolates users and never fetches malformed symbols', async () => {
  let calls = 0;
  const fetchImpl = async (url) => { calls += 1; return response(fixture(new URL(url, 'https://test.invalid').searchParams.get('symbol'))); };
  await loadDcaHistory(args({ fetchImpl }));
  await loadDcaHistory(args({ fetchImpl, symbol: 'SPY' }));
  await loadDcaHistory(args({ fetchImpl, userId: 'user-b', getSession: auth('user-b') }));
  assert.equal(calls, 3);
  await assert.rejects(loadDcaHistory(args({ fetchImpl, getSession: auth('user-b') })), { code: 'AUTH_REQUIRED' });
  await assert.rejects(loadDcaHistory(args({ fetchImpl, userId: '' })), { code: 'AUTH_REQUIRED' });
  for (const symbol of ['', 'QQQ,SPY', ['QQQ'], 'QQQ.US', 'VIX', 'A..B', '../QQQ', 'AAPL.LSE']) {
    await assert.rejects(loadDcaHistory(args({ fetchImpl, symbol })), { code: 'INVALID_SYMBOL' });
  }
  assert.equal(calls, 3);
});

test('single-flight includes force refreshes and one cancelled subscriber cannot cancel another', async () => {
  let resolveFetch, calls = 0;
  const options = args({ fetchImpl: () => { calls += 1; return new Promise((resolve) => { resolveFetch = resolve; }); } });
  const controller = new AbortController();
  const first = loadDcaHistory({ ...options, signal: controller.signal });
  const second = loadDcaHistory({ ...options, force: true });
  await settle(); assert.equal(calls, 1);
  controller.abort(); await assert.rejects(first, { code: 'REQUEST_ABORTED' });
  resolveFetch(response()); assert.equal((await second).asOfDate, '2026-09-04');
});

test('warm network failure retains exact last prices explicitly stale and respects cooldown', async () => {
  let calls = 0, now = NOW;
  const options = args({ now: () => now, fetchImpl: async () => { calls += 1; if (calls > 1) throw new Error('offline'); return response(); } });
  const first = await loadDcaHistory(options);
  const stale = await loadDcaHistory({ ...options, force: true });
  assert.equal(stale.staleReason, 'provider_unavailable');
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, first.fetchedAt);
  assert.deepEqual(stale.rows, first.rows);
  await loadDcaHistory(options); assert.equal(calls, 2);
  now += DCA_HISTORY_FAILURE_RETRY_MS;
  await loadDcaHistory(options); assert.equal(calls, 3);
});

test('cold failures back off, force can retry, and corrupt data never uses a stale fallback', async () => {
  let calls = 0;
  const options = args({ fetchImpl: async () => { calls += 1; return calls === 1 ? response(null, 502) : response(); } });
  await assert.rejects(loadDcaHistory(options), { code: 'NETWORK_ERROR' });
  await assert.rejects(loadDcaHistory(options), { code: 'NETWORK_ERROR' });
  assert.equal(calls, 1);
  assert.equal((await loadDcaHistory({ ...options, force: true })).stale, false);
  const invalid = fixture(); invalid.rows[0].close = null;
  await assert.rejects(loadDcaHistory(args({ force: true, fetchImpl: async () => response(invalid) })), { code: 'INVALID_DATA' });
  await assert.rejects(loadDcaHistory(args()), { code: 'INVALID_DATA' });
});

test('authorization failures clear cached amounts and never become stale results', async () => {
  for (const status of [401, 403]) {
    resetDcaHistoryMemoryCache();
    await loadDcaHistory(args());
    await assert.rejects(loadDcaHistory(args({ force: true, fetchImpl: async () => response(null, status) })), { code: 'AUTH_REQUIRED' });
    await assert.rejects(loadDcaHistory(args({ fetchImpl: async () => response(null, 502) })), { code: 'NETWORK_ERROR' });
  }
});

test('account changes during success and failure cannot expose the previous user result', async () => {
  for (const mode of ['success', 'failure', 'invalid']) {
    resetDcaHistoryMemoryCache();
    await loadDcaHistory(args());
    let active = 'user-a';
    await assert.rejects(loadDcaHistory(args({ force: true, getSession: () => auth(active)(), fetchImpl: async () => {
      active = 'user-b';
      if (mode === 'failure') throw new Error('offline');
      return mode === 'invalid' ? response({}) : response();
    } })), { code: 'AUTH_REQUIRED' });
  }
});

test('global and per-identity resets supersede outstanding responses without clearing a different identity', async () => {
  for (const identity of [undefined, 'user-a']) {
    resetDcaHistoryMemoryCache();
    let resolveFetch;
    const pending = loadDcaHistory(args({ fetchImpl: () => new Promise((resolve) => { resolveFetch = resolve; }) }));
    await settle();
    resetDcaHistoryMemoryCache(identity);
    resolveFetch(response());
    await assert.rejects(pending, { code: identity ? 'AUTH_REQUIRED' : 'REQUEST_SUPERSEDED' });
  }
  resetDcaHistoryMemoryCache();
  const second = args({ userId: 'user-b', getSession: auth('user-b') });
  const cached = await loadDcaHistory(second);
  resetDcaHistoryMemoryCache('user-a');
  assert.strictEqual(await loadDcaHistory({ ...second, fetchImpl: async () => { throw new Error('must not refetch'); } }), cached);
});

test('reset during preflight or warm-cache auth recheck supersedes the caller', async () => {
  let calls = 0;
  await assert.rejects(loadDcaHistory(args({ getSession: async () => {
    resetDcaHistoryMemoryCache(); return auth()();
  }, fetchImpl: async () => { calls += 1; return response(); } })), { code: 'REQUEST_SUPERSEDED' });
  assert.equal(calls, 0);
  await assert.rejects(loadDcaHistory(args({ getSession: async () => {
    resetDcaHistoryMemoryCache('user-a'); return auth()();
  }, fetchImpl: async () => { calls += 1; return response(); } })), { code: 'AUTH_REQUIRED' });
  assert.equal(calls, 0);
  const controller = new AbortController();
  await assert.rejects(loadDcaHistory(args({ signal: controller.signal, getSession: async () => {
    controller.abort(); return auth()();
  }, fetchImpl: async () => { calls += 1; return response(); } })), { code: 'REQUEST_ABORTED' });
  assert.equal(calls, 0);
  await loadDcaHistory(args());
  let authCalls = 0;
  await assert.rejects(loadDcaHistory(args({ getSession: async () => {
    authCalls += 1;
    if (authCalls === 2) resetDcaHistoryMemoryCache();
    return auth()();
  } })), { code: 'REQUEST_SUPERSEDED' });
});

test('older closes or corrections cannot replace newer cached history', async () => {
  const first = await loadDcaHistory(args());
  const older = fixture('QQQ', { availableFromDate: '2026-09-02', asOfDate: '2026-09-03', stale: true, staleReason: 'incomplete_close', rows: [{ date: '2026-09-02', close: 80 }, { date: '2026-09-03', close: 90 }] });
  const sameDateOlder = fixture('QQQ', { fetchedAt: new Date(NOW - 1000).toISOString(), rows: [{ date: '2026-09-03', close: 1 }, { date: '2026-09-04', close: 2 }] });
  for (const data of [older, sameDateOlder]) {
    const result = await loadDcaHistory(args({ force: true, fetchImpl: async () => response(data) }));
    assert.equal(result.asOfDate, first.asOfDate);
    assert.deepEqual(result.rows, first.rows);
  }
});

test('an older in-flight request finishing after a new close cannot overwrite the new close', async () => {
  let now = NOW, resolveOlder;
  const options = args({ now: () => now });
  const older = loadDcaHistory({ ...options, fetchImpl: () => new Promise(resolve => { resolveOlder = resolve; }) });
  await settle();
  now = Date.parse('2026-09-08T21:00:00Z');
  const newerData = fixture('QQQ', { expectedAsOfDate: '2026-09-08', asOfDate: '2026-09-08', fetchedAt: new Date(now).toISOString(),
    rows: [...fixture().rows, { date: '2026-09-08', close: 125 }] });
  const newer = await loadDcaHistory({ ...options, fetchImpl: async () => response(newerData) });
  resolveOlder(response());
  assert.deepEqual((await older).rows, newer.rows);
  assert.deepEqual((await loadDcaHistory({ ...options, fetchImpl: async () => { throw new Error('no refetch'); } })).rows, newer.rows);
});

test('timeouts include body consumption and abort underlying work', async () => {
  for (const hangBody of [false, true]) {
    resetDcaHistoryMemoryCache(); let signal;
    await assert.rejects(loadDcaHistory(args({ timeoutMs: 5, fetchImpl: (_url, options) => {
      signal = options.signal;
      return hangBody ? Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) }) : new Promise(() => {});
    } })), { code: 'NETWORK_ERROR' });
    assert.equal(signal.aborted, true);
  }
});

test('machine errors preserve unsupported, quota and invalid-data distinctions', async () => {
  for (const [code, status] of [['INVALID_SYMBOL', 400], ['UNSUPPORTED_INSTRUMENT', 400], ['INVALID_DATA', 502], ['QUOTA_EXHAUSTED', 503]]) {
    resetDcaHistoryMemoryCache();
    await assert.rejects(loadDcaHistory(args({ fetchImpl: async () => response(null, status, code) })), { code });
  }
  resetDcaHistoryMemoryCache(); await loadDcaHistory(args());
  const stale = await loadDcaHistory(args({ force: true, fetchImpl: async () => response(null, 503, 'QUOTA_EXHAUSTED') }));
  assert.equal(stale.staleReason, 'quota_exhausted');
});

test('history cache is bounded and repeated plan changes do not affect the symbol request key', async () => {
  let calls = 0;
  const fetchImpl = async (url) => { calls += 1; return response(fixture(new URL(url, 'https://test.invalid').searchParams.get('symbol'))); };
  for (let index = 0; index < 17; index += 1) await loadDcaHistory(args({ symbol: `TEST${index}`, fetchImpl }));
  await loadDcaHistory(args({ symbol: 'TEST0', fetchImpl }));
  assert.equal(calls, 18);
  await loadDcaHistory(args({ symbol: 'TEST0', fetchImpl, startYear: 2010, amount: 100, frequency: 'monthly' }));
  assert.equal(calls, 18);
});
