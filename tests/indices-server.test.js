import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import {
  INDEX_QUOTE_CARDS, INDEX_QUOTE_TTL_MS, INDEX_QUOTE_FAILURE_BACKOFF_MS,
  INDEX_QUOTE_STALE_AFTER_MS, createIndexQuoteLoader, fetchIndexRestQuote,
  indexQuoteStatus, normalizeIndexRestQuote,
} from '../server/realtime/indexQuotes.js';
import { createIndicesRealtimeRelay, getIndicesRealtimeSnapshot } from '../server/realtime/indicesRelay.js';
import { fetchIndicesQuote } from '../server/quote/providers/indices.js';

const NOW = Date.parse('2026-09-10T13:38:00Z');
const quote = (card, at = NOW, extra = {}) => normalizeIndexRestQuote({
  code: card.ticker, timestamp: at / 1000, close: 5435.21, previousClose: 5439.56,
  change: -4.35, change_p: -.08, ...extra,
}, card, { fetchedAt: Math.max(NOW, at) });
const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const failure = statusCode => Object.assign(new Error('untrusted provider URL private-key'), { statusCode });

test('index REST quotes preserve actual quote time independently of fetching and never claim live', () => {
  assert.deepEqual(INDEX_QUOTE_CARDS.map(card => card.ticker), ['GSPC.INDX', 'NDX.INDX', 'DJI.INDX']);
  const card = INDEX_QUOTE_CARDS[0];
  const tick = quote(card, NOW - 15 * 60_000);
  assert.equal(tick.type, 'index_tick');
  assert.equal(tick.timestamp, NOW - 15 * 60_000);
  assert.equal(tick.quoteAt, '2026-09-10T13:23:00.000Z');
  assert.equal(tick.receivedAt, NOW);
  assert.equal(tick.fetchedAt, '2026-09-10T13:38:00.000Z');
  assert.equal(tick.source, 'EODHD_REST');
  assert.equal(tick.realtime, false);
  assert.equal(tick.realtimeStatus, 'delayed');
  assert.equal(Object.hasOwn(tick, 'intraday'), false, 'the quote loader does not invent or fetch a chart');
  assert.equal(INDEX_QUOTE_STALE_AFTER_MS, 30 * 60_000);
  assert.equal(indexQuoteStatus(tick, NOW + 16 * 60_000), 'stale');
  assert.equal(indexQuoteStatus({ timestamp: NOW + 5 * 60_000 }, NOW), 'stale');
  assert.equal(indexQuoteStatus({ timestamp: NOW + 1 }, NOW), 'stale');
  assert.equal(normalizeIndexRestQuote({ close: 999, timestamp: NOW + 1 }, card, { fetchedAt: NOW }), null);
  for (const timestamp of [undefined, null, '', 'not-a-date', 0]) {
    const unknown = normalizeIndexRestQuote({ close: 5435, timestamp }, card, { fetchedAt: NOW });
    assert.equal(unknown.timestamp, null);
    assert.equal(unknown.quoteAt, null);
    assert.equal(unknown.realtimeStatus, 'stale');
    assert.equal(unknown.change, null);
    assert.equal(unknown.changePercent, null);
  }
  assert.equal(normalizeIndexRestQuote({ close: 1, timestamp: NOW }, card, { fetchedAt: NOW }).timestamp, NOW);
  assert.equal(normalizeIndexRestQuote({ close: 1, timestamp: new Date(NOW).toISOString() }, card, { fetchedAt: NOW }).timestamp, NOW);
  assert.equal(normalizeIndexRestQuote({ close: 0 }, card), null);
  assert.equal(normalizeIndexRestQuote({ close: 1, code: 'SPY.US' }, card), null);
});

test('index REST fetch uses only the original EODHD indices, bounds headers/body time, and sanitizes failures', async () => {
  const card = INDEX_QUOTE_CARDS[0];
  const tick = await fetchIndexRestQuote(card, {
    eodhdKey: ' private\u200B-key ', now: () => NOW,
    fetchImpl: async (url, options) => {
      assert.equal(url.origin, 'https://eodhd.com');
      assert.equal(url.pathname, '/api/real-time/GSPC.INDX');
      assert.equal(url.searchParams.get('api_token'), 'private-key');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.headers.Accept, 'application/json');
      return jsonResponse({ code: card.ticker, timestamp: NOW / 1000, close: 5435.21 });
    },
  });
  assert.equal(tick.timestamp, NOW);
  assert.doesNotMatch(JSON.stringify(tick), /private-key/);
  for (const fetchImpl of [
    async () => jsonResponse({}, 402),
    async () => jsonResponse({ status_code: 402, message: 'private-key' }),
  ]) {
    await assert.rejects(fetchIndexRestQuote(card, { eodhdKey: 'private-key', fetchImpl }), error => (
      error.statusCode === 402 && !error.message.includes('private-key')
    ));
  }
  await assert.rejects(fetchIndexRestQuote(card, {
    eodhdKey: 'private-key', timeoutMs: 5,
    fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }),
  }), error => error.statusCode === 504 && !error.message.includes('private-key'));
});

test('index quote loader singleflights three symbols and uses a full sixty-second success TTL', async () => {
  let now = NOW;
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const load = createIndexQuoteLoader({ now: () => now, fetchQuote: async card => {
    calls += 1;
    await gate;
    return quote(card, now);
  } });
  const pendingA = load({ eodhdKey: 'key' });
  const pendingB = load({ eodhdKey: 'key' });
  await Promise.resolve();
  assert.equal(calls, 3);
  release();
  assert.deepEqual(await pendingA, await pendingB);
  now += INDEX_QUOTE_TTL_MS - 1;
  assert.equal((await load({ eodhdKey: 'key' })).ticks.length, 3);
  assert.equal(calls, 3);
  now += 1;
  await load({ eodhdKey: 'key' });
  assert.equal(calls, 6);
});

test('partial index failures retain old prices, back off only failed symbols, and recover without quote-time regression', async () => {
  let now = NOW;
  let mode = 'ok';
  const calls = [];
  const load = createIndexQuoteLoader({ now: () => now, fetchQuote: async card => {
    calls.push(card.ticker);
    if (mode === 'fail' && card === INDEX_QUOTE_CARDS[0]) throw failure(503);
    if (mode === 'older') return quote(card, NOW - 60_000, { close: 999 });
    if (mode === 'missing') return quote(card, NOW, { timestamp: undefined, close: 888 });
    return normalizeIndexRestQuote({ code: card.ticker, close: mode === 'ok' ? 5435.21 : 999, timestamp: NOW / 1000 }, card, { fetchedAt: now });
  } });
  await load({ eodhdKey: 'key' });
  now += INDEX_QUOTE_TTL_MS;
  mode = 'fail';
  const failed = await load({ eodhdKey: 'key' });
  assert.equal(failed.ticks[0].price, 5435.21);
  assert.equal(failed.ticks[0].timestamp, NOW);
  assert.equal(failed.ticks[0].realtimeStatus, 'stale', 'failed refreshes cannot imply the retained quote was successfully refreshed');
  assert.equal(failed.status, 'stale');
  assert.match(failed.ticks[0].fetchError, /503/);
  assert.doesNotMatch(JSON.stringify(failed), /private-key/);
  now += INDEX_QUOTE_FAILURE_BACKOFF_MS - 1;
  await load({ eodhdKey: 'key' });
  assert.equal(calls.length, 6);
  now += 1;
  mode = 'ok';
  const recovered = await load({ eodhdKey: 'key' });
  assert.equal(calls.length, 7, 'healthy indices must retain their sixty-second cache during another index retry');
  assert.equal(recovered.errors.length, 0);
  assert.equal(Object.hasOwn(recovered.ticks[0], 'fetchError'), false, 'same-time valid data clears transient fetch failure');
  assert.equal(recovered.ticks[0].receivedAt, now);
  assert.equal(recovered.ticks[0].timestamp, NOW);
  assert.equal(recovered.ticks[0].price, 5435.21, 'same-time data cannot overwrite the original price');
  for (const nextMode of ['older', 'missing']) {
    mode = nextMode;
    now += INDEX_QUOTE_TTL_MS;
    const snapshot = await load({ eodhdKey: 'key' });
    assert.ok(snapshot.ticks.every(tick => tick.timestamp === NOW && tick.price === 5435.21));
  }
  now += INDEX_QUOTE_STALE_AFTER_MS;
  const stale = await load({ eodhdKey: 'key' });
  assert.equal(stale.status, 'stale');
  assert.ok(stale.ticks.every(tick => tick.realtimeStatus === 'stale'));
});

test('future timestamps cannot poison the cache and same-time changed prices never overwrite accepted values', async () => {
  let now = NOW;
  let phase = 'future';
  const load = createIndexQuoteLoader({ now: () => now, fetchQuote: (card, options) => fetchIndexRestQuote(card, {
    ...options,
    fetchImpl: async () => jsonResponse({
      code: card.ticker,
      close: phase === 'repeated' ? 999 : 5435.21,
      timestamp: phase === 'future' ? (now + 1) / 1000 : (NOW + INDEX_QUOTE_FAILURE_BACKOFF_MS) / 1000,
    }),
  }) });
  const rejected = await load({ eodhdKey: 'key' });
  assert.equal(rejected.status, 'unavailable');
  assert.deepEqual(rejected.ticks, []);
  phase = 'normal';
  now += INDEX_QUOTE_FAILURE_BACKOFF_MS;
  const accepted = await load({ eodhdKey: 'key' });
  assert.equal(accepted.status, 'delayed');
  assert.equal(accepted.ticks[0].timestamp, now);
  phase = 'repeated';
  now += INDEX_QUOTE_TTL_MS;
  const repeated = await load({ eodhdKey: 'key' });
  assert.equal(repeated.ticks[0].price, 5435.21);
  assert.equal(repeated.ticks[0].timestamp, accepted.ticks[0].timestamp);
  assert.equal(repeated.ticks[0].receivedAt, now);
  assert.equal(repeated.errors.length, 0);
});

test('partial snapshots remain stale when any index is missing', async () => {
  const load = createIndexQuoteLoader({ now: () => NOW, fetchQuote: async card => {
    if (card !== INDEX_QUOTE_CARDS[0]) throw failure(503);
    return quote(card);
  } });
  const snapshot = await load({ eodhdKey: 'key' });
  assert.equal(snapshot.ticks.length, 1);
  assert.equal(snapshot.status, 'stale');
  assert.equal(snapshot.errors.length, 2);
  assert.equal(snapshot.ticks[0].realtimeStatus, 'delayed');
});

test('HTTP 402 blocks every index quote until the next UTC day while retaining prior quotes', async () => {
  let now = NOW;
  let blocked = false;
  let calls = 0;
  const load = createIndexQuoteLoader({ now: () => now, fetchQuote: async card => {
    calls += 1;
    if (blocked) throw failure(402);
    return quote(card, now);
  } });
  await load({ eodhdKey: 'key' });
  now += INDEX_QUOTE_TTL_MS;
  blocked = true;
  const failed = await load({ eodhdKey: 'key' });
  const nextDay = Date.parse('2026-09-11T00:00:00Z');
  assert.equal(failed.quotaBlockedUntil, nextDay);
  assert.equal(failed.ticks.length, 3);
  assert.equal(calls, 6);
  now = nextDay - 1;
  assert.equal((await load({ eodhdKey: 'key' })).status, 'stale');
  assert.equal(calls, 6);
  now = nextDay;
  blocked = false;
  const restored = await load({ eodhdKey: 'key' });
  assert.equal(calls, 9);
  assert.equal(restored.quotaBlockedUntil, null);
  assert.equal(restored.errors.length, 0);
  assert.equal(restored.status, 'delayed');
});

test('empty failures remain unavailable without zero ticks or fabricated fresh timestamps', async () => {
  let calls = 0;
  const load = createIndexQuoteLoader({ now: () => NOW, fetchQuote: async () => { calls += 1; throw failure(503); } });
  const empty = await load({ eodhdKey: 'key' });
  assert.deepEqual(empty.ticks, []);
  assert.equal(empty.status, 'unavailable');
  await load({ eodhdKey: 'key' });
  assert.equal(calls, 3);
  const noKey = await load();
  assert.equal(noKey.status, 'unavailable');
  assert.deepEqual(noKey.ticks, []);
  assert.equal(calls, 3);
});

test('the existing snapshot and ordinary INDICES provider share one quote cache without history in snapshots', async () => {
  let calls = 0;
  const fetchImpl = async url => {
    calls += 1;
    assert.match(url.pathname, /^\/api\/real-time\/(GSPC|NDX|DJI)\.INDX$/);
    return jsonResponse({ code: url.pathname.split('/').at(-1), close: 5000, timestamp: Date.now() / 1000 });
  };
  const options = { eodhdKey: 'shared-integration-key', fetchImpl };
  const [snapshot, baseline] = await Promise.all([
    getIndicesRealtimeSnapshot(options), fetchIndicesQuote('INDICES', { ...options, includeIntraday: false }),
  ]);
  assert.equal(calls, 3);
  assert.equal(snapshot.type, 'indices_snapshot');
  assert.equal(snapshot.source, 'EODHD_REST');
  assert.equal(snapshot.realtime, false);
  assert.equal(snapshot.ticks.length, 3);
  assert.equal(snapshot.status, 'delayed');
  assert.deepEqual(baseline.data.map(({ intraday, ...tick }) => tick), snapshot.ticks);
  assert.ok(baseline.data.every(tick => tick.intraday.length === 0));
  await getIndicesRealtimeSnapshot(options);
  assert.equal(calls, 3);
});

test('legacy index WS clients receive bounded REST ticks and no provider WS connection or live status', async () => {
  const timers = new Map();
  let timerId = 0;
  let loads = 0;
  const relay = createIndicesRealtimeRelay({
    loadQuotes: async () => { loads += 1; return { ticks: INDEX_QUOTE_CARDS.map(card => quote(card)), status: 'delayed', source: 'EODHD_REST', realtime: false, receivedAt: NOW }; },
    setIntervalImpl: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearIntervalImpl: id => { timers.delete(id); },
  });
  const socket = new EventEmitter();
  const messages = [];
  Object.assign(socket, { readyState: 1, send: value => messages.push(JSON.parse(value)), ping() {}, terminate() {} });
  const detach = relay.attachClient(socket, { eodhdKey: 'key' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loads, 1);
  assert.equal(messages.filter(message => message.type === 'index_tick').length, 3);
  assert.ok(messages.every(message => message.source === 'EODHD_REST' && message.realtime === false && message.status !== 'live'));
  const poll = [...timers.values()].find(timer => timer.delay === 60_000);
  assert.ok(poll);
  await poll.callback();
  assert.equal(loads, 2);
  detach();
  assert.equal(timers.size, 0);
  const source = readFileSync(new URL('../server/realtime/indicesRelay.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /wss:\/\/|new WebSocket|status:\s*['"]live['"]/);
});
