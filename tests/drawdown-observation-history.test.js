import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAWDOWN_OBSERVATION_CONCURRENCY, loadDrawdownObservation } from '../src/lib/drawdownObservationHistory.js';
import { loadDcaHistory, resetDcaHistoryMemoryCache } from '../src/lib/dcaHistory.js';

const NOW = Date.parse('2026-09-09T12:00:00Z');
function history(symbol, overrides = {}) {
  return {
    version: 1, source: 'EODHD_EOD', symbol, name: `${symbol} test`, type: 'ETF',
    currency: 'USD', priceBasis: 'adjusted_close', availableFromDate: '2026-09-03',
    asOfDate: '2026-09-08', expectedAsOfDate: '2026-09-08', fetchedAt: new Date(NOW).toISOString(),
    stale: false, staleReason: '', rows: [{ date: '2026-09-03', close: 100 }, { date: '2026-09-04', close: 120 }, { date: '2026-09-08', close: 90 }],
    ...overrides,
  };
}
const instruments = (...symbols) => symbols.map((symbol) => ({ symbol, name: symbol, inWatchlist: true, inHoldings: symbol === 'NVDA' }));
const options = (overrides = {}) => ({ userId: 'user-a', instruments: instruments('SPY', 'QQQ', 'NVDA', 'MSFT', 'AVGO'), now: () => NOW,
  loadHistory: async ({ symbol }) => history(symbol), ...overrides });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('batch reuses one authenticated adjusted-close history request per unique symbol and preserves scope metadata', async () => {
  const calls = [], progress = [];
  const result = await loadDrawdownObservation(options({
    instruments: instruments('SPY', 'QQQ', 'NVDA', 'NVDA'), force: true,
    onProgress: (value) => progress.push(value),
    loadHistory: async (args) => { calls.push(args); return history(args.symbol, { type: args.symbol === 'NVDA' ? 'Common Stock' : 'ETF' }); },
  }));
  assert.deepEqual(calls.map((call) => call.symbol), ['SPY', 'QQQ', 'NVDA']);
  assert.ok(calls.every((call) => call.userId === 'user-a' && call.force === true && call.signal instanceof AbortSignal));
  assert.equal(result.completed, 3);
  assert.equal(result.total, 3);
  assert.deepEqual(progress.map((entry) => entry.completed), [1, 2, 3]);
  assert.equal(progress[0].instruments.filter((row) => row.status === 'loading').length, 2);
  assert.ok(result.instruments.every((row) => row.status === 'ready' && row.source === 'EODHD_EOD' && row.priceBasis === 'adjusted_close'));
  assert.equal(result.instruments[2].kind, 'stock');
  assert.equal(result.instruments[2].inHoldings, true);
  assert.deepEqual(result.instruments[2].points, history('NVDA').rows);
});

test('batch limits concurrency to three, emits settled snapshots, and does not invent missing prices after partial failure', async () => {
  const pending = new Map(), progress = [];
  let active = 0, maximum = 0;
  const promise = loadDrawdownObservation(options({ onProgress: (value) => progress.push(value), loadHistory: ({ symbol }) => {
    active += 1; maximum = Math.max(maximum, active);
    return new Promise((resolve, reject) => pending.set(symbol, { resolve, reject })).finally(() => { active -= 1; });
  } }));
  await settle();
  assert.equal(DRAWDOWN_OBSERVATION_CONCURRENCY, 3);
  assert.deepEqual([...pending.keys()], ['SPY', 'QQQ', 'NVDA']);
  pending.get('QQQ').reject(Object.assign(new Error('private provider failure'), { code: 'PROVIDER_UNAVAILABLE' }));
  await settle();
  assert.equal(pending.size, 4);
  assert.equal(progress[0].instruments[1].status, 'error');
  assert.deepEqual(progress[0].instruments[1].points, []);
  assert.deepEqual(progress[0].instruments[1].error, { code: 'PROVIDER_UNAVAILABLE' });
  assert.equal(progress[0].instruments[1].asOfDate, null);
  pending.get('SPY').resolve(history('SPY'));
  pending.get('NVDA').resolve(history('NVDA'));
  await settle();
  pending.get('MSFT').resolve(history('MSFT'));
  pending.get('AVGO').resolve(history('AVGO'));
  const result = await promise;
  assert.equal(maximum, 3);
  assert.equal(result.completed, 5);
  assert.equal(result.instruments.filter((row) => row.status === 'ready').length, 4);
  assert.equal(progress[0].completed, 1);
  assert.equal(progress[0].instruments[0].status, 'loading');
});

test('old captured history is stale against current expected close, and provider stale reasons survive', async () => {
  const result = await loadDrawdownObservation(options({ instruments: instruments('SPY', 'QQQ'), loadHistory: async ({ symbol }) => {
    if (symbol === 'QQQ') return history(symbol, { stale: true, staleReason: 'provider_unavailable' });
    return history(symbol, {
      asOfDate: '2026-09-04', expectedAsOfDate: '2026-09-04', fetchedAt: '2026-09-08T12:00:00Z',
      rows: [{ date: '2026-09-03', close: 100 }, { date: '2026-09-04', close: 120 }],
    });
  } }));
  assert.equal(result.instruments[0].asOfDate, '2026-09-04');
  assert.equal(result.instruments[0].expectedAsOfDate, '2026-09-08');
  assert.equal(result.instruments[0].stale, true);
  assert.equal(result.instruments[0].staleReason, 'incomplete_close');
  assert.equal(result.instruments[1].stale, true);
  assert.equal(result.instruments[1].staleReason, 'provider_unavailable');
});

test('synthetic, raw-close, invalid and mismatched data fail closed at the injected source boundary', async () => {
  for (const modify of [
    (row) => { row.source = 'SYNTHETIC'; }, (row) => { row.priceBasis = 'close'; },
    (row) => { row.currency = 'CNY'; }, (row) => { row.symbol = 'NVDA'; },
    (row) => { row.rows[0].close = null; }, (row) => { row.rows[0].close = 0; },
    (row) => { row.rows.reverse(); }, (row) => { row.rows.push(row.rows.at(-1)); },
    (row) => { row.fetchedAt = new Date(NOW + 300001).toISOString(); },
  ]) {
    const result = await loadDrawdownObservation(options({ instruments: instruments('SPY'), loadHistory: async () => {
      const value = history('SPY'); modify(value); return value;
    } }));
    assert.equal(result.instruments[0].status, 'error');
    assert.deepEqual(result.instruments[0].error, { code: 'INVALID_DATA' });
    assert.deepEqual(result.instruments[0].points, []);
  }
});

test('abort rejects promptly, schedules no more symbols, and suppresses ignored-signal late progress', async () => {
  const pending = new Map(), progress = [], controller = new AbortController();
  const promise = loadDrawdownObservation(options({ signal: controller.signal, onProgress: (value) => progress.push(value),
    loadHistory: ({ symbol, signal }) => new Promise((resolve) => pending.set(symbol, { resolve, signal })),
  }));
  await settle();
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError', code: 'REQUEST_ABORTED' });
  assert.equal(pending.size, 3);
  assert.ok([...pending.values()].every((entry) => entry.signal.aborted));
  for (const [symbol, { resolve }] of pending) resolve(history(symbol));
  await settle();
  assert.deepEqual(progress, []);
  assert.equal(pending.size, 3);
});

test('authentication and supersession failures cancel the whole batch and cannot publish late results', async () => {
  for (const code of ['AUTH_REQUIRED', 'REQUEST_SUPERSEDED']) {
    const pending = new Map(), progress = [];
    const promise = loadDrawdownObservation(options({ onProgress: (value) => progress.push(value), loadHistory: ({ symbol, signal }) => new Promise((resolve, reject) => pending.set(symbol, { resolve, reject, signal })) }));
    await settle();
    pending.get('QQQ').reject(Object.assign(new Error('changed identity'), { code }));
    await assert.rejects(promise, { code });
    for (const [symbol, { resolve, signal }] of pending) { assert.equal(signal.aborted, true); resolve(history(symbol)); }
    await settle();
    assert.equal(pending.size, 3);
    assert.deepEqual(progress, []);
  }
});

test('invalid identity, invalid symbols and pre-aborted callers never invoke a history source', async () => {
  let calls = 0;
  const loadHistory = async ({ symbol }) => { calls += 1; return history(symbol); };
  await assert.rejects(loadDrawdownObservation(options({ userId: '', loadHistory })), { code: 'AUTH_REQUIRED' });
  await assert.rejects(loadDrawdownObservation(options({ instruments: instruments('SPY', '../QQQ'), loadHistory })), { code: 'INVALID_SYMBOL' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadDrawdownObservation(options({ signal: controller.signal, loadHistory })), { code: 'REQUEST_ABORTED' });
  assert.equal(calls, 0);
  assert.deepEqual(await loadDrawdownObservation(options({ instruments: [], loadHistory })), { instruments: [], completed: 0, total: 0 });
});

test('real shared DCA loader caches repeated page entry but still validates identity before cached results', async () => {
  resetDcaHistoryMemoryCache();
  let identity = 'user-a';
  const calls = [];
  const loadHistory = (args) => loadDcaHistory({
    ...args, now: () => NOW,
    getSession: async () => ({ data: { session: { user: { id: identity }, access_token: 'unit-test-token' } } }),
    fetchImpl: async (url, request) => {
      calls.push({ url, request });
      const symbol = new URL(url, 'https://test.invalid').searchParams.get('symbol');
      return { ok: true, status: 200, json: async () => ({ success: true, data: history(symbol) }) };
    },
  });
  try {
    const args = options({ instruments: instruments('SPY', 'QQQ'), loadHistory });
    await loadDrawdownObservation(args);
    await loadDrawdownObservation(args);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(({ url }) => url), ['/api/quote?view=dca-history&symbol=SPY', '/api/quote?view=dca-history&symbol=QQQ']);
    assert.ok(calls.every(({ request }) => request.cache === 'no-store' && request.headers.Authorization === 'Bearer unit-test-token'));
    identity = 'user-b';
    await assert.rejects(loadDrawdownObservation(args), { code: 'AUTH_REQUIRED' });
    assert.equal(calls.length, 2);
  } finally {
    resetDcaHistoryMemoryCache();
  }
});
