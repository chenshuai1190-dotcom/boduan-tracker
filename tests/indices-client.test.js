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

const SESSION_START = Date.parse('2026-09-10T13:30:00Z');
const SESSION_END = Date.parse('2026-09-10T20:00:00Z');
const chartPoint = (minute, price) => ({ timestamp: SESSION_START + minute * 60_000, price });
const chartQuote = (overrides = {}) => quote({
  source: 'YAHOO_CHART', timestamp: NOW, intradayDate: '2026-09-10',
  sessionStart: SESSION_START, sessionEnd: SESSION_END,
  intradayPoints: [chartPoint(0, 6480), chartPoint(4, 6490), chartPoint(8, 6500.25)],
  ...overrides,
});

test('Yahoo index cards retain timestamped history and render only its real prices', () => {
  const symbols = ['GSPC.INDX', 'NDX.INDX', 'DJI.INDX'];
  const ticks = symbols.map((symbol) => chartQuote({ symbol }));
  const before = structuredClone(ticks);
  const cards = merge([], ticks, { appendIntraday: false });
  assert.deepEqual(cards.map((card) => card.symbol), symbols);
  for (const card of cards) {
    assert.equal(card.source, 'YAHOO_CHART');
    assert.equal(card.intradaySource, 'YAHOO_CHART');
    assert.equal(card.intradayDate, '2026-09-10');
    assert.equal(card.intradaySessionKey, '2026-09-10:regular');
    assert.equal(card.sessionStart, SESSION_START);
    assert.equal(card.sessionEnd, SESSION_END);
    assert.equal(card.quoteTimestamp, NOW);
    assert.equal(card.realtime, false);
    assert.equal(card.intradayMode, 'session-history');
    assert.deepEqual(card.intraday, [6480, 6490, 6500.25]);
    assert.deepEqual(card.intradayPoints, ticks[0].intradayPoints);
  }
  assert.deepEqual(ticks, before, 'normalization does not modify the response');
});

test('Yahoo history filters invalid, off-session and post-quote points then orders and deduplicates', () => {
  const card = merge([], [chartQuote({ intradayPoints: [
    chartPoint(8, 6500.25), chartPoint(4, 6490), chartPoint(0, 6480),
    chartPoint(4, 9999), chartPoint(-1, 1), chartPoint(9, 2),
    { timestamp: SESSION_START - 24 * 60 * 60_000, price: 3 },
    { timestamp: SESSION_END + 1, price: 4 },
    chartPoint(1, null), chartPoint(2, 0), chartPoint(3, -1),
    chartPoint(5, Infinity), chartPoint(6, ''), { timestamp: null, price: 8 },
  ] })])[0];
  assert.deepEqual(card.intradayPoints, chartQuote().intradayPoints);
  assert.deepEqual(card.intraday, [6480, 6490, 6500.25]);
});

test('Yahoo curves require matching quote date and complete valid session metadata', () => {
  const invalidMetadata = [
    { intradayDate: '2026-09-09' }, { intradayDate: null },
    { intradayDate: 'invalid' }, { sessionStart: null }, { sessionEnd: null },
    { sessionStart: SESSION_END, sessionEnd: SESSION_START },
    { sessionStart: SESSION_START - 24 * 60 * 60_000 },
    { sessionEnd: SESSION_END + 24 * 60 * 60_000 },
    { timestamp: SESSION_START - 1 }, { timestamp: null },
    { intradayMode: 'static-locked' },
  ];
  for (const overrides of invalidMetadata) {
    const card = merge([], [chartQuote({ intraday: [1, 2, 3], ...overrides })])[0];
    assert.equal(card.price, 6500.25);
    assert.deepEqual(card.intraday, [], JSON.stringify(overrides));
    assert.deepEqual(card.intradayPoints, [], JSON.stringify(overrides));
  }
});

test('equal-time Yahoo responses can first fill and enrich history without rewriting accepted prices', () => {
  const empty = merge([], [chartQuote({ intradayPoints: [] })]);
  assert.deepEqual(empty[0].intraday, []);
  const filled = merge(empty, [chartQuote()]);
  assert.equal(filled[0].price, 6500.25);
  assert.equal(filled[0].change, empty[0].change);
  assert.equal(filled[0].previousClose, empty[0].previousClose);
  assert.deepEqual(filled[0].intraday, [6480, 6490, 6500.25]);
  const enriched = merge(filled, [chartQuote({ intradayPoints: [chartPoint(2, 6485), chartPoint(4, 9999)] })]);
  assert.deepEqual(enriched[0].intraday, [6480, 6485, 6490, 6500.25]);
  assert.equal(enriched[0].quoteTimestamp, NOW);
  const repeated = merge(enriched, [chartQuote({ intradayPoints: [chartPoint(8, 1)] })]);
  assert.deepEqual(repeated[0].intradayPoints, enriched[0].intradayPoints);
  assert.deepEqual(repeated[0].intraday, enriched[0].intraday);
  assert.equal(repeated[0].price, enriched[0].price);
});

test('a conflicting same-source same-time Yahoo quote cannot fill or replace its chart', () => {
  for (const intradayPoints of [[], chartQuote().intradayPoints]) {
    const cards = merge([], [chartQuote({ intradayPoints, dayHigh: 6510, dayLow: 6470 })]);
    for (const overrides of [
      { price: 9999 }, { change: 999 }, { changePercent: 50 },
      { previousClose: 1 }, { dayHigh: 9999 }, { dayLow: 1 },
    ]) {
      const next = merge(cards, [chartQuote({ ...overrides, intradayPoints: [chartPoint(0, 1), chartPoint(8, 9999)] })]);
      assert.equal(next[0].price, cards[0].price);
      assert.equal(next[0].quoteTimestamp, NOW);
      assert.equal(next[0].fetchError, true);
      assert.equal(next[0].realtimeStatus, 'stale');
      assert.deepEqual(next[0].intraday, cards[0].intraday);
      assert.deepEqual(next[0].intradayPoints, cards[0].intradayPoints);
      const recovered = merge(next, [chartQuote()]);
      assert.equal(recovered[0].fetchError, false);
      assert.deepEqual(recovered[0].intraday, [6480, 6490, 6500.25]);
    }
  }
});

test('same-time malformed or differently scoped history cannot replace an accepted Yahoo session', () => {
  const cards = merge([], [chartQuote()]);
  for (const overrides of [
    { intradayPoints: [] }, { intradayDate: '2026-09-09' },
    { sessionStart: SESSION_START + 60_000 }, { sessionEnd: SESSION_END - 60_000 },
    { intradayMode: 'static-locked' },
  ]) {
    const next = merge(cards, [chartQuote({ intradayPoints: [chartPoint(4, 1)], ...overrides })]);
    assert.deepEqual(next[0].intradayPoints, cards[0].intradayPoints);
    assert.equal(next[0].sessionStart, SESSION_START);
    assert.equal(next[0].sessionEnd, SESSION_END);
  }
});

test('equal-time provider migration replaces the complete quote and curve without mixing EODHD data', () => {
  const legacy = merge([], [quote({ timestamp: NOW, price: 6000, intraday: [5900, 6000] })]);
  const yahoo = chartQuote({ price: 6501, change: 12, changePercent: .18, previousClose: 6489 });
  const migrated = merge(legacy, [yahoo]);
  for (const field of ['price', 'change', 'changePercent', 'previousClose', 'source']) {
    assert.equal(migrated[0][field], yahoo[field]);
  }
  assert.equal(migrated[0].quoteTimestamp, NOW);
  assert.deepEqual(migrated[0].intraday, [6480, 6490, 6500.25]);
  assert.deepEqual(migrated[0].intradayPoints, yahoo.intradayPoints);
  const older = merge(legacy, [chartQuote({ timestamp: NOW - 1000 })]);
  assert.equal(older[0].source, 'EODHD_REST');
  assert.equal(older[0].price, 6000);
  assert.deepEqual(older[0].intraday, [5900, 6000]);
});

test('source transitions never carry curves across providers, even with missing Yahoo history', () => {
  const legacy = merge([], [quote({ timestamp: NOW - 60_000, intraday: [6400, 6450] })]);
  const yahoo = merge(legacy, [chartQuote({ intradayPoints: [], intraday: [1, 2, 3] })]);
  assert.equal(yahoo[0].source, 'YAHOO_CHART');
  assert.deepEqual(yahoo[0].intraday, []);
  const withHistory = merge(yahoo, [chartQuote()]);
  const rest = merge(withHistory, [quote({ timestamp: NOW + 60_000, price: 6600 })], { now: NOW + 60_000 });
  assert.deepEqual(rest[0].intraday, [6600]);
  assert.deepEqual(rest[0].intradayPoints, []);
  assert.equal(rest[0].intradayDate, null);
  assert.equal(rest[0].source, 'EODHD_REST');
});

test('newer same-session Yahoo history retains earlier bars and may finalize an existing bar', () => {
  const cards = merge([], [chartQuote()]);
  const timestamp = NOW + 60_000;
  const updated = merge(cards, [chartQuote({ timestamp, price: 6510,
    intradayPoints: [chartPoint(8, 6501), chartPoint(9, 6510)],
  })], { now: timestamp });
  assert.deepEqual(updated[0].intraday, [6480, 6490, 6501, 6510]);
  const withoutHistory = merge(updated, [chartQuote({ timestamp: timestamp + 1000, price: 6511,
    intradayDate: null, sessionStart: null, sessionEnd: null, intradayPoints: [],
  })], { now: timestamp + 1000 });
  assert.equal(withoutHistory[0].price, 6511);
  assert.deepEqual(withoutHistory[0].intradayPoints, updated[0].intradayPoints);
  assert.deepEqual(withoutHistory[0].intraday, updated[0].intraday);
});

test('new trading days cannot inherit yesterday Yahoo bars or numeric-only fallback curves', () => {
  const cards = merge([], [chartQuote()]);
  const day = 24 * 60 * 60_000;
  const timestamp = NOW + day;
  const noHistory = merge(cards, [chartQuote({ timestamp, intradayPoints: [], intraday: [1, 2] })], { now: timestamp });
  assert.equal(noHistory[0].price, 6500.25);
  assert.deepEqual(noHistory[0].intraday, []);
  assert.deepEqual(noHistory[0].intradayPoints, []);
  const nextPoints = [{ timestamp: SESSION_START + day, price: 6600 }, { timestamp, price: 6605 }];
  const nextDay = merge(cards, [chartQuote({ timestamp, intradayDate: '2026-09-11',
    sessionStart: SESSION_START + day, sessionEnd: SESSION_END + day,
    intradayPoints: [...chartQuote().intradayPoints, ...nextPoints],
  })], { now: timestamp });
  assert.deepEqual(nextDay[0].intraday, [6600, 6605]);
  assert.deepEqual(nextDay[0].intradayPoints, nextPoints);
  assert.equal(nextDay[0].intradaySessionKey, '2026-09-11:regular');
});

test('16:00 endpoint stays on the regular Yahoo chart but a later closing quote is not appended', () => {
  const timestamp = SESSION_END + 1000;
  const lastMinute = { timestamp: SESSION_END - 60_000, price: 6600 };
  const closePoint = { timestamp: SESSION_END, price: 6610 };
  const cards = merge([], [chartQuote({ timestamp, price: 6611, intradayPoints: [chartPoint(0, 6480), lastMinute] })], { now: timestamp });
  const complete = merge(cards, [chartQuote({ timestamp, price: 6611,
    intradayPoints: [closePoint, { timestamp, price: 6611 }],
  })], { now: timestamp });
  assert.equal(complete[0].price, 6611);
  assert.equal(complete[0].intradaySessionKey, '2026-09-10:regular');
  assert.deepEqual(complete[0].intraday, [6480, 6600, 6610]);
  assert.deepEqual(complete[0].intradayPoints.at(-1), closePoint);
});

test('a full Yahoo session samples 80 evenly spaced actual bars including first and last', () => {
  const points = Array.from({ length: 391 }, (_, minute) => chartPoint(minute, 6400 + minute));
  const timestamp = SESSION_END;
  const card = merge([], [chartQuote({ timestamp, intradayPoints: points })], { now: timestamp })[0];
  assert.equal(card.intraday.length, 80);
  assert.equal(card.intraday[0], 6400);
  assert.equal(card.intraday.at(-1), 6790);
  assert.deepEqual(card.intraday, Array.from({ length: 80 }, (_, index) => 6400 + Math.round(index * 390 / 79)));
  assert.deepEqual(card.intradayPoints, points);
  const reducedResponse = merge([card], [chartQuote({ timestamp, intradayPoints: points.slice(-2) })], { now: timestamp });
  assert.deepEqual(reducedResponse[0].intraday, card.intraday);
  assert.equal(reducedResponse[0].intradayPoints.length, 391);
});

test('failed, missing and old Yahoo responses preserve known quote and history then recover', () => {
  const cards = merge([], [chartQuote()]);
  for (const snapshot of [
    [], [chartQuote({ symbol: 'NDX.INDX' })], [chartQuote({ price: null })],
    [chartQuote({ error: 'unavailable' })], [chartQuote({ timestamp: NOW - 1000 })],
    [chartQuote({ timestamp: NOW + 1 })],
    [chartQuote({ fetchError: true, intradayPoints: [chartPoint(8, 1)] })],
  ]) {
    const failed = merge(cards, snapshot);
    assert.equal(failed[0].fetchError, true);
    assert.equal(failed[0].price, cards[0].price);
    assert.equal(failed[0].quoteTimestamp, NOW);
    assert.deepEqual(failed[0].intradayPoints, cards[0].intradayPoints);
    assert.deepEqual(failed[0].intraday, cards[0].intraday);
    const recovered = merge(failed, [chartQuote({ intradayPoints: [chartPoint(2, 6485)] })]);
    assert.equal(recovered[0].fetchError, false);
    assert.deepEqual(recovered[0].intraday, [6480, 6485, 6490, 6500.25]);
  }
});

test('Yahoo session validation follows ET dates through winter without a fixed UTC offset', () => {
  const start = Date.parse('2026-01-12T14:30:00Z');
  const end = Date.parse('2026-01-12T21:00:00Z');
  const timestamp = start + 60_000;
  const points = [{ timestamp: start, price: 6000 }, { timestamp, price: 6001 }];
  const card = merge([], [chartQuote({ timestamp, intradayDate: '2026-01-12',
    sessionStart: start, sessionEnd: end, intradayPoints: points,
  })], { now: timestamp })[0];
  assert.equal(card.intradaySessionKey, '2026-01-12:regular');
  assert.deepEqual(card.intraday, [6000, 6001]);
});
