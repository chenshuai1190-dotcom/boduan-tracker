import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyIndexTickToMarketCards,
  createIndexPlaceholderMarketCards,
  formatIndexQuoteTime,
  mergeIndexCardsWithPlaceholders,
  mergeIndexRestCardsIntoMarketCards,
  resolveIndexQuoteStatus,
} from '../src/lib/indexRealtime.js';

const NOW = Date.parse('2026-09-10T13:38:00Z');
const quote = (overrides = {}) => ({
  symbol: 'GSPC.INDX', price: 6500.25, change: 25.5, changePercent: .39,
  previousClose: 6474.75, timestamp: NOW - 15 * 60 * 1000,
  source: 'EODHD_REST', realtime: false, fetchedAt: new Date(NOW).toISOString(),
  ...overrides,
});
const merge = (cards, ticks, options = {}) => mergeIndexRestCardsIntoMarketCards(cards, ticks, 'live', { now: NOW, ...options });

test('index identities remain the three .INDX contracts; ETFs never match', () => {
  const cards = createIndexPlaceholderMarketCards();
  assert.deepEqual(cards.map(card => card.symbol), ['GSPC.INDX', 'NDX.INDX', 'DJI.INDX']);
  assert.deepEqual(cards.map(card => resolveIndexQuoteStatus(card, { now: NOW })), ['unavailable', 'unavailable', 'unavailable']);
  assert.strictEqual(applyIndexTickToMarketCards(cards, quote({ symbol: 'SPY' })), cards);
});

test('REST arrival does not become provider time or LIVE status', () => {
  const tick = quote();
  const card = merge([], [tick])[0];
  assert.equal(card.realtime, false);
  assert.equal(card.realtimeStatus, 'delayed');
  assert.equal(card.timestamp, tick.timestamp);
  assert.equal(card.quoteTimestamp, tick.timestamp);
  assert.equal(card.quoteAt, '2026-09-10T13:23:00.000Z');
  assert.equal(card.fetchedAt, tick.fetchedAt);
  assert.equal(resolveIndexQuoteStatus(card, { now: NOW }), 'delayed');
  assert.equal(tick.quoteAt, undefined);
});

test('old and equal-time snapshots cannot roll back a newer quote or append samples', () => {
  const accepted = merge([], [quote({ timestamp: NOW, price: 6600 })]);
  for (const timestamp of [NOW - 60_000, NOW]) {
    const old = quote({ timestamp, price: 6300, changePercent: -8, fetchedAt: new Date(NOW + 30_000).toISOString() });
    const rest = merge(accepted, [old]);
    assert.equal(rest[0].price, 6600);
    assert.equal(rest[0].quoteTimestamp, NOW);
    assert.deepEqual(rest[0].intraday, accepted[0].intraday);
    const applied = applyIndexTickToMarketCards(accepted, old, 'live', { now: NOW });
    assert.equal(applied[0].price, 6600);
    assert.equal(applied[0].quoteTimestamp, NOW);
    assert.deepEqual(applied[0].intraday, accepted[0].intraday);
    if (timestamp < NOW) assert.strictEqual(applied, accepted);
  }
});

test('freshness ordering is independent for each index', () => {
  const cards = merge([], [quote({ timestamp: NOW }), quote({ symbol: 'NDX.INDX', price: 24000, timestamp: NOW - 300_000 })]);
  const next = merge(cards, [quote({ price: 6200, timestamp: NOW - 1000 }), quote({ symbol: 'NDX.INDX', price: 24500, timestamp: NOW - 60_000 })]);
  assert.equal(next[0].price, 6500.25);
  assert.equal(next[1].price, 24500);
});

test('unknown quote time stays stale and cannot override a known-time quote', () => {
  const unknown = quote({ timestamp: null, receivedAt: NOW, realtimeAt: NOW });
  const unknownCard = merge([], [unknown])[0];
  assert.equal(unknownCard.quoteTimestamp, null);
  assert.equal(unknownCard.quoteAt, null);
  assert.equal(unknownCard.realtimeAt, null);
  assert.equal(unknownCard.realtimeStatus, 'stale');
  assert.deepEqual(unknownCard.intraday, []);
  const known = merge([], [quote()]);
  assert.equal(merge(known, [{ ...unknown, price: 7000 }])[0].price, known[0].price);
  assert.equal(resolveIndexQuoteStatus({ price: 6500, fetchedAt: NOW, realtimeAt: NOW }, { now: NOW }), 'stale');
});

test('invalid, empty, failed and missing-symbol responses retain valid quotes', () => {
  const cards = merge([], [quote()]);
  for (const price of [0, -1, '', null, undefined, NaN, Infinity]) {
    assert.equal(merge(cards, [quote({ price, timestamp: NOW })])[0].price, cards[0].price);
  }
  for (const error of [{ error: 'Unavailable' }, { success: false }]) {
    assert.equal(merge(cards, [quote({ price: 7000, timestamp: NOW, ...error })])[0].price, cards[0].price);
  }
  assert.equal(merge(cards, [])[0].price, cards[0].price);
  assert.equal(merge(cards, [{ symbol: 'NDX.INDX', price: 24500, timestamp: NOW }])[0].price, cards[0].price);
});

test('provider quoteAt and quoteTimestamp aliases retain their original instant', () => {
  for (const alias of [{ quoteTimestamp: NOW }, { quoteAt: '2026-09-10T09:38:00-04:00' }]) {
    const card = merge([], [quote({ timestamp: null, ...alias })])[0];
    assert.equal(card.quoteTimestamp, NOW);
    assert.equal(card.quoteAt, '2026-09-10T13:38:00.000Z');
  }
});

test('status ages by provider time, with strict REST and WS boundaries', () => {
  const status = (age, source = 'EODHD_REST') => resolveIndexQuoteStatus(quote({ timestamp: NOW - age, source, realtime: true }), { now: NOW });
  assert.equal(status(0), 'delayed');
  assert.equal(status(30 * 60 * 1000), 'delayed');
  assert.equal(status(30 * 60 * 1000 + 1), 'stale');
  assert.equal(status(15_000, 'EODHD_WS'), 'live');
  assert.equal(status(15_001, 'EODHD_WS'), 'delayed');
  assert.equal(status(-1, 'EODHD_WS'), 'stale');
  assert.equal(resolveIndexQuoteStatus(quote({ price: null }), { now: NOW }), 'unavailable');
});

test('index quote labels show provider time in ET, including DST and winter', () => {
  assert.equal(formatIndexQuoteTime(quote({ timestamp: NOW }), 'zh'), '09-10 09:38 ET');
  assert.equal(formatIndexQuoteTime(quote({ timestamp: NOW }), 'en'), '09/10 09:38 ET');
  assert.equal(formatIndexQuoteTime(quote({ timestamp: Date.parse('2026-01-12T14:38:00Z') }), 'en'), '01/12 09:38 ET');
  assert.equal(formatIndexQuoteTime({ fetchedAt: NOW }), '');
});

test('a first quote is one real sample; no previous-close or duplicated seed is invented', () => {
  const first = merge([], [quote({ timestamp: NOW })]);
  assert.deepEqual(first[0].intraday, [6500.25]);
  const second = merge(first, [quote({ timestamp: NOW + 60_000, price: 6501.5 })], { now: NOW + 60_000 });
  assert.deepEqual(second[0].intraday, [6500.25, 6501.5]);
  assert.equal(second[0].intradayMode, 'quote-sampled');
});

test('outside regular sampling, prices update without synthesizing chart points', () => {
  const cards = merge([], [quote({ timestamp: NOW })], { appendIntraday: false });
  assert.deepEqual(cards[0].intraday, []);
  assert.equal(cards[0].intradayMode, 'empty');
  const updated = merge(cards, [quote({ timestamp: NOW + 60_000, price: 6600 })], { appendIntraday: false, now: NOW + 60_000 });
  assert.equal(updated[0].price, 6600);
  assert.deepEqual(updated[0].intraday, []);
});

test('actual history remains intact while same-session sampling is disabled', () => {
  const cards = merge([], [quote({ timestamp: NOW, intraday: [6400, 6450, 6500.25] })]);
  const next = merge(cards, [quote({ timestamp: NOW + 60_000, price: 6502 })], { appendIntraday: false, now: NOW + 60_000 });
  assert.deepEqual(next[0].intraday, [6400, 6450, 6500.25]);
  assert.equal(next[0].intradayMode, 'session-history');
});

test('provider day or market-session transitions do not connect unrelated chart samples', () => {
  const cards = merge([], [quote({ timestamp: NOW })]);
  const nextDayTimestamp = NOW + 24 * 60 * 60 * 1000;
  const nextDay = merge(cards, [quote({ timestamp: nextDayTimestamp, price: 6700 })], { now: nextDayTimestamp });
  assert.deepEqual(nextDay[0].intraday, [6700]);
  const postmarketTimestamp = Date.parse('2026-09-10T20:01:00Z');
  const postmarket = merge(cards, [quote({ timestamp: postmarketTimestamp, price: 6701 })], { appendIntraday: false, now: postmarketTimestamp });
  assert.deepEqual(postmarket[0].intraday, []);
  assert.equal(postmarket[0].intradaySessionKey, '2026-09-10:postmarket');
});

test('legacy synthesized curves are removed instead of relabeled as real history', () => {
  const legacy = [{ ...quote(), intradayMode: 'static-locked', intraday: [6400, 6511, 6422, 6500] }];
  assert.deepEqual(mergeIndexCardsWithPlaceholders(legacy)[0].intraday, []);
  assert.deepEqual(merge(legacy, [quote({ timestamp: NOW })])[0].intraday, [6500.25]);
});

test('timestamped observations are capped at 80 without repeated response points', () => {
  let cards = [];
  for (let i = 0; i < 90; i += 1) cards = merge(cards, [quote({ timestamp: NOW + i * 1000, price: 6500 + i })], { now: NOW + i * 1000 });
  assert.equal(cards[0].intraday.length, 80);
  assert.equal(cards[0].intraday[0], 6510);
  assert.equal(cards[0].intraday.at(-1), 6589);
  assert.deepEqual(merge(cards, [quote({ timestamp: NOW + 89_000, price: 1 })], { now: NOW + 89_000 })[0].intraday, cards[0].intraday);
});

test('future provider times cannot poison ordering or block the next valid update', () => {
  const cards = merge([], [quote({ timestamp: NOW - 60_000 })]);
  const future = quote({ timestamp: NOW + 1, price: 9999 });
  assert.strictEqual(applyIndexTickToMarketCards(cards, future, 'live', { now: NOW }), cards);
  const ignored = merge(cards, [future]);
  assert.equal(ignored[0].quoteTimestamp, NOW - 60_000);
  assert.equal(ignored[0].price, 6500.25);
  const recovered = merge(ignored, [quote({ timestamp: NOW, price: 6501 })]);
  assert.equal(recovered[0].price, 6501);
  assert.equal(recovered[0].quoteTimestamp, NOW);
});

test('new quotes never borrow missing daily metrics from a previous observation', () => {
  const cards = merge([], [quote({ timestamp: NOW - 60_000 })]);
  for (const timestamp of [NOW, NOW + 24 * 60 * 60 * 1000]) {
    const next = merge(cards, [{ symbol: 'GSPC.INDX', timestamp, price: 6510, source: 'EODHD_REST' }], { now: timestamp });
    assert.equal(next[0].price, 6510);
    assert.equal(next[0].change, null);
    assert.equal(next[0].changePercent, null);
    assert.equal(next[0].previousClose, null);
  }
});

test('successful equal-time responses clear fetch errors without rewriting quote data', () => {
  const cards = merge([], [quote({ timestamp: NOW })]);
  const failed = cards.map((card, index) => index === 0 ? { ...card, fetchError: true } : card);
  assert.equal(resolveIndexQuoteStatus(failed[0], { now: NOW }), 'stale');
  const repeated = quote({ timestamp: NOW, price: 9999, change: 999, changePercent: 999, previousClose: 1 });
  const now = NOW + 60_000;
  const recovered = merge(failed, [repeated], { now });
  assert.equal(recovered[0].fetchError, false);
  assert.equal(recovered[0].realtimeStatus, 'delayed');
  assert.equal(recovered[0].price, cards[0].price);
  assert.equal(recovered[0].change, cards[0].change);
  assert.equal(recovered[0].changePercent, cards[0].changePercent);
  assert.equal(recovered[0].previousClose, cards[0].previousClose);
  assert.equal(recovered[0].quoteTimestamp, NOW);
  assert.deepEqual(recovered[0].intraday, cards[0].intraday);
  const oldButRecovered = merge(failed, [repeated], { now: NOW + 31 * 60_000 });
  assert.equal(oldButRecovered[0].fetchError, false);
  assert.equal(oldButRecovered[0].realtimeStatus, 'stale');
});

test('cached failed responses remain stale for both equal and newer provider times', () => {
  const cards = merge([], [quote({ timestamp: NOW - 60_000 })]);
  for (const timestamp of [NOW - 60_000, NOW]) {
    const failedTick = quote({ timestamp, price: 6505, fetchError: true });
    const next = merge(cards, [failedTick]);
    assert.equal(next[0].fetchError, true);
    assert.equal(next[0].realtimeStatus, 'stale');
    assert.equal(next[0].realtime, false);
    assert.equal(resolveIndexQuoteStatus(next[0], { now: NOW }), 'stale');
    assert.equal(next[0].quoteTimestamp, timestamp);
    assert.equal(next[0].price, timestamp === NOW ? 6505 : cards[0].price);
    const recovered = merge(next, [{ ...failedTick, fetchError: false }]);
    assert.equal(recovered[0].fetchError, false);
    assert.equal(recovered[0].realtimeStatus, 'delayed');
    assert.equal(recovered[0].price, next[0].price);
    assert.deepEqual(recovered[0].intraday, next[0].intraday);
  }
});

test('empty, partial, invalid, failed and older full snapshots mark retained quotes stale', () => {
  const cards = merge([], [quote({ timestamp: NOW })]);
  const snapshots = [
    [],
    [quote({ symbol: 'NDX.INDX', price: 24500 })],
    [quote({ price: 0, timestamp: NOW })],
    [quote({ timestamp: NOW, error: 'provider unavailable' })],
    [quote({ timestamp: NOW, success: false })],
    [quote({ timestamp: NOW - 1000, price: 6400 })],
    [quote({ timestamp: null, price: 6400 })],
  ];
  for (const snapshot of snapshots) {
    const next = merge(cards, snapshot);
    assert.equal(next[0].fetchError, true);
    assert.equal(next[0].realtimeStatus, 'stale');
    assert.equal(next[0].realtime, false);
    assert.equal(next[0].price, cards[0].price);
    assert.equal(next[0].quoteTimestamp, cards[0].quoteTimestamp);
    assert.equal(next[0].quoteAt, cards[0].quoteAt);
    assert.deepEqual(next[0].intraday, cards[0].intraday);
    assert.equal(resolveIndexQuoteStatus(next[2], { now: NOW }), 'unavailable');

    const recovered = merge(next, [quote({ timestamp: NOW })]);
    assert.equal(recovered[0].fetchError, false);
    assert.equal(recovered[0].realtimeStatus, 'delayed');
    assert.equal(recovered[0].price, cards[0].price);
    assert.equal(recovered[0].quoteTimestamp, cards[0].quoteTimestamp);
    assert.deepEqual(recovered[0].intraday, cards[0].intraday);
  }
});

test('partial full snapshots mark only omitted indices stale and recover independently', () => {
  const ticks = [quote({ timestamp: NOW }), quote({ symbol: 'NDX.INDX', price: 24500, timestamp: NOW })];
  const cards = merge([], ticks);
  const partial = merge(cards, [ticks[0]]);
  assert.equal(partial[0].fetchError, false);
  assert.equal(partial[0].realtimeStatus, 'delayed');
  assert.equal(partial[1].fetchError, true);
  assert.equal(partial[1].realtimeStatus, 'stale');
  assert.equal(partial[1].price, cards[1].price);
  assert.equal(partial[2].realtimeStatus, 'unavailable');
  const recovered = merge(partial, ticks);
  assert.equal(recovered[0].fetchError, false);
  assert.equal(recovered[1].fetchError, false);
  assert.equal(recovered[1].realtimeStatus, 'delayed');
});
