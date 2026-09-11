import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';
import {
  buildHeaderAssetSnapshot, headerAssetBasisKey, headerAssetSessionContext, headerAssetSessionKey,
  readHeaderAssetSnapshot, selectHeaderAssetSnapshot, writeHeaderAssetSnapshot,
} from '../src/lib/headerAssetSnapshot.js';

const PRE = Date.parse('2026-09-11T12:00:00Z');
const REGULAR = Date.parse('2026-09-11T15:00:00Z');
const POST = Date.parse('2026-09-10T21:00:00Z');
const CLOSED = Date.parse('2026-09-11T04:54:00Z');
const trades = [
  { id: 1, date: '2026-08-01', symbol: 'NVDA', side: 'buy', shares: 10, price: 100 },
  { id: 2, date: '2026-08-02', symbol: 'NVDA', side: 'sell', shares: 2, price: 110 },
  { id: 3, date: '2026-08-01', symbol: 'MSFT', side: 'buy', shares: 3, price: 400 },
];

function inputs(now = CLOSED, overrides = {}) {
  return { userId: 'user-one', stockTrades: trades, cashUsd: 50, marginDebtUsd: 200,
    usdRate: 7.1, ready: true, now, ...overrides };
}

function closeQuote(symbol = 'NVDA', overrides = {}) {
  const price = symbol === 'NVDA' ? 120 : 420;
  const baseline = symbol === 'NVDA' ? 110 : 410;
  return { symbol, source: 'EODHD', price, dailyPnlPrice: price, dailyPnlPriceDate: '2026-09-10',
    dailyPnlSource: 'eodhd-adjusted-close', dailyPnlLocked: true, dailyPnlSession: 'closed',
    dailyPnlBaselineClose: baseline, dailyPnlBaselineDate: '2026-09-09',
    dailyPnlBaselineSource: 'eodhd-adjusted-close', timestamp: POST / 1000,
    headerReceivedAt: CLOSED - 1000, ...overrides };
}

function liveQuote(symbol = 'NVDA', now = REGULAR, overrides = {}) {
  const session = headerAssetSessionContext(now).session;
  return { ...closeQuote(symbol), dailyPnlPriceDate: '', dailyPnlLocked: false,
    dailyPnlSession: session, dailyPnlSource: `realtime-${session}`,
    dailyPnlBaselineDate: '2026-09-10', timestamp: (now - 30_000) / 1000,
    headerReceivedAt: now - 1000, ...overrides };
}

function tick(symbol = 'NVDA', now = REGULAR, overrides = {}) {
  return liveQuote(symbol, now, { source: 'EODHD_WS', dailyPnlSource: 'realtime-tick',
    dailyPnlPriceDate: '2026-09-11', realtimeAt: now - 1000, ...overrides });
}

function complete(now = CLOSED, overrides = {}) {
  const live = headerAssetSessionContext(now).live;
  const rows = ['NVDA', 'MSFT'].map(symbol => live ? liveQuote(symbol, now) : closeQuote(symbol));
  return buildHeaderAssetSnapshot(inputs(now, { baselineRows: rows, ...overrides }));
}

function storageFixture() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

function mutateStored(storage, change) {
  const key = [...storage.data.keys()][0];
  const value = JSON.parse(storage.data.get(key));
  change(value);
  storage.setItem(key, JSON.stringify(value));
}

function selection(candidate, previous, overrides = {}) {
  const valid = candidate || previous;
  return selectHeaderAssetSnapshot({ candidate, previous, basisKey: valid?.basisKey,
    sessionKey: valid?.sessionKey, ready: true, ...overrides });
}

test('ledger prices, watchlist saves and strategy reference quotes cannot bootstrap a header', () => {
  assert.equal(buildHeaderAssetSnapshot(inputs()), null);
  for (const source of [undefined, 'watchlist', 'tool-reference', 'Yahoo', 'EODHD_REST']) {
    const quoteRows = ['NVDA', 'MSFT'].map(symbol => closeQuote(symbol, { source }));
    assert.equal(buildHeaderAssetSnapshot(inputs(CLOSED, { quoteRows })), null);
  }
  assert.equal(complete(CLOSED, { ready: false }), null);
  assert.equal(complete(CLOSED, { ready: 'true' }), null);
});

test('a partial official batch waits for every actual open holding', () => {
  assert.equal(complete(CLOSED, { baselineRows: [closeQuote()] }), null);
  const closedSymbol = { id: 4, symbol: 'AAPL', date: '2026-08-05', side: 'sell', shares: 5, price: 200 };
  assert.ok(complete(CLOSED, { stockTrades: [...trades, closedSymbol] }));
});

for (const [session, now] of [['pre', PRE], ['regular', REGULAR], ['post', POST], ['closed', CLOSED]]) {
  test(`${session}: verified header reuses all original financial formula scalars`, () => {
    const snapshot = complete(now);
    assert.ok(snapshot);
    const expected = deriveInvestmentSummary({ stockTrades: trades, cashUsd: 50, usdRate: 7.1,
      watchlist: snapshot.quotes });
    for (const [key, value] of Object.entries(snapshot.summary)) assert.equal(value, expected[key], key);
    assert.equal(snapshot.summary.positionsMarketValue, 2220);
    assert.equal(snapshot.summary.totalAssetsUsd, 2270);
    assert.equal(snapshot.summary.cumulativePnl, 240);
    assert.equal(snapshot.summary.todayPnl, 110);
    assert.equal(snapshot.marginDebtUsd, 200);
    assert.equal(snapshot.summary.todayPnlLocked, session === 'post' || session === 'closed');
    assert.equal('positions' in snapshot.summary, false);
    assert.equal('trades' in snapshot.summary, false);
  });
}

test('postmarket ticks cannot move the completed-close portfolio valuation', () => {
  const quoteRows = ['NVDA', 'MSFT'].map(symbol => closeQuote(symbol, { source: 'EODHD_WS',
    price: 9999, realtimeAt: POST - 1000, dailyPnlSession: 'post' }));
  const snapshot = complete(POST, { baselineRows: [], quoteRows });
  assert.equal(snapshot.summary.positionsMarketValue, 2220);
  assert.equal(snapshot.summary.todayPnlLocked, true);
  assert.equal(snapshot.quotes[0].price, snapshot.quotes[0].dailyPnlPrice);
});

test('premarket unlocks only on the new session prices and previous completed-close baseline', () => {
  assert.equal(complete(PRE, { baselineRows: [closeQuote(), closeQuote('MSFT')] }), null);
  const quoteRows = [tick('NVDA', PRE, { price: 115, dailyPnlPrice: 115 }), tick('MSFT', PRE)];
  const snapshot = complete(PRE, { baselineRows: [], quoteRows });
  assert.equal(snapshot.summary.todayPnlLocked, false);
  assert.equal(snapshot.summary.positionsMarketValue, 2180);
});

test('REST may omit live price date when its provider time and official dated baseline are valid', () => {
  assert.ok(complete(PRE));
  assert.ok(complete(REGULAR));
  assert.equal(complete(REGULAR, { baselineRows: [liveQuote('NVDA', REGULAR, {
    dailyPnlBaselineSource: 'eodhd-quote-previous-close', dailyPnlBaselineDate: '',
  }), liveQuote('MSFT')] }), null);
});

test('newer real ticks win over REST even when their price falls; newer REST wins over older ticks', () => {
  const lowered = tick('NVDA', REGULAR, { price: 100, dailyPnlPrice: 100 });
  assert.equal(complete(REGULAR, { quoteRows: [lowered] }).summary.positionsMarketValue, 2060);
  const oldTick = { ...lowered, realtimeAt: REGULAR - 60_000 };
  assert.equal(complete(REGULAR, { quoteRows: [oldTick] }).summary.positionsMarketValue, 2220);
});

test('live tick validation rejects stale, future, foreign source, wrong date and wrong session prices', () => {
  const invalid = [
    { realtimeAt: REGULAR - 121_000 }, { realtimeAt: REGULAR + 61_000 },
    { realtimeAt: PRE }, { realtimeAt: REGULAR - 86400_000 },
    { source: 'Yahoo' }, { dailyPnlSource: 'realtime-regular' },
    { dailyPnlSession: 'pre' }, { dailyPnlPriceDate: '2026-09-10' },
    { dailyPnlPrice: 121 }, { dailyPnlLocked: true },
  ];
  for (const override of invalid) {
    const quoteRows = [tick('NVDA', REGULAR, override), tick('MSFT')];
    assert.equal(complete(REGULAR, { baselineRows: [], quoteRows }), null, JSON.stringify(override));
  }
});

test('REST validation rejects old provider data, prior-session fetches and mixed price fields', () => {
  const invalid = [
    { timestamp: (REGULAR - 86400_000) / 1000 }, { timestamp: PRE / 1000 },
    { timestamp: (REGULAR - 901_000) / 1000 }, { timestamp: (REGULAR + 61_000) / 1000 },
    { headerReceivedAt: REGULAR - 901_000 }, { headerReceivedAt: PRE },
    { headerReceivedAt: null }, { dailyPnlPrice: 110 }, { dailyPnlPriceDate: '2026-09-10' },
    { dailyPnlSource: 'realtime-pre' }, { source: 'EODHD_WS' },
  ];
  for (const override of invalid) {
    assert.equal(complete(REGULAR, { baselineRows: [liveQuote('NVDA', REGULAR, override), liveQuote('MSFT')] }),
      null, JSON.stringify(override));
  }
});

test('closed valuation requires the expected close and complete official previous-day facts', () => {
  const invalid = [
    { dailyPnlPriceDate: '2026-09-09' }, { dailyPnlPriceDate: '2026-09-11' },
    { dailyPnlPriceDate: '2026-02-30' }, { dailyPnlBaselineDate: '2026-09-08' },
    { dailyPnlBaselineDate: '' }, { dailyPnlBaselineSource: '' },
    { dailyPnlSource: 'realtime-tick' }, { dailyPnlLocked: false },
    { dailyPnlPrice: 0 }, { dailyPnlBaselineClose: null }, { dailyPnlSession: 'regular' },
  ];
  for (const override of invalid) assert.equal(complete(CLOSED, {
    baselineRows: [closeQuote('NVDA', override), closeQuote('MSFT')],
  }), null, JSON.stringify(override));
});

test('missing, invalid and boolean numeric inputs never become zero or a fallback rate', () => {
  for (const key of ['cashUsd', 'marginDebtUsd', 'usdRate']) {
    for (const value of [undefined, null, '', ' ', true, false, NaN, Infinity, [], {}]) {
      assert.equal(complete(CLOSED, { [key]: value }), null, `${key}: ${String(value)}`);
    }
  }
  assert.equal(complete(CLOSED, { usdRate: 0 }), null);
  assert.equal(complete(CLOSED, { marginDebtUsd: -1 }), null);
  assert.ok(complete(CLOSED, { cashUsd: 0, marginDebtUsd: 0, usdRate: '7.1' }));
});

test('zero open holdings can show cash and realized profit without inventing quotes', () => {
  const stockTrades = [
    { id: 1, symbol: 'NVDA', date: '2026-08-01', side: 'buy', shares: 10, price: 100 },
    { id: 2, symbol: 'NVDA', date: '2026-08-02', side: 'sell', shares: 10, price: 120 },
  ];
  const snapshot = complete(REGULAR, { stockTrades, baselineRows: [] });
  assert.equal(snapshot.summary.positionsMarketValue, 0);
  assert.equal(snapshot.summary.totalAssetsUsd, 50);
  assert.equal(snapshot.summary.cumulativePnl, 200);
  assert.equal(snapshot.summary.todayPnl, 0);
  assert.deepEqual(snapshot.quotes, []);
  assert.equal(complete(REGULAR, { stockTrades, ready: false, baselineRows: [] }), null);
  assert.equal(complete(REGULAR, { stockTrades: [], baselineRows: [] }).summary.totalAssetsUsd, 50);
});

test('exact fingerprint includes full ledger and preserves financially significant tied trade ordering', () => {
  const original = inputs();
  const keyed = headerAssetBasisKey(original);
  const reorderedKeys = trades.map(row => Object.fromEntries(Object.entries(row).reverse()));
  assert.equal(headerAssetBasisKey({ ...original, stockTrades: reorderedKeys }), keyed);
  assert.equal(headerAssetBasisKey({ ...original, stockTrades: [...trades].reverse() }), keyed);
  assert.notEqual(headerAssetBasisKey({ ...original, stockTrades: trades.map((row, index) => index ? row : { ...row, note: 'ledger revision' }) }), keyed);
  const buy = { id: 'same', date: '2026-08-01', symbol: 'NVDA', side: 'buy', shares: 1, price: 100 };
  const sell = { ...buy, side: 'sell', price: 120 };
  assert.notEqual(headerAssetBasisKey({ ...original, stockTrades: [buy, sell] }),
    headerAssetBasisKey({ ...original, stockTrades: [sell, buy] }));
});

test('a closed header cache round trip recomputes original formulas and does not write business records', () => {
  const storage = storageFixture();
  const original = JSON.stringify(trades);
  const snapshot = complete();
  assert.equal(writeHeaderAssetSnapshot({ snapshot, storage, now: CLOSED }), true);
  const restored = readHeaderAssetSnapshot(inputs(CLOSED + 1000, { storage }));
  assert.deepEqual(restored.summary, snapshot.summary);
  assert.equal(restored.verifiedAt, CLOSED);
  assert.equal(JSON.stringify(trades), original);
  assert.equal(storage.data.size, 1);
  assert.ok([...storage.data.keys()].every(key => key.startsWith('boduan.header-assets.')));
});

test('cache requires the same user, every ledger field, cash, debt, rate and ready state', () => {
  const storage = storageFixture();
  writeHeaderAssetSnapshot({ snapshot: complete(), storage, now: CLOSED });
  const invalid = [{ userId: 'another-user' }, { stockTrades: trades.slice(0, 2) },
    { stockTrades: trades.map(row => ({ ...row, externalRevision: 'updated' })) },
    { cashUsd: 51 }, { marginDebtUsd: 201 }, { usdRate: 7.2 }, { ready: false }];
  for (const override of invalid) assert.equal(readHeaderAssetSnapshot(inputs(CLOSED, { storage, ...override })), null);
});

test('cache rejects changed summary values and broken quote provenance instead of trusting cached totals', () => {
  const invalid = [
    stored => { stored.summary.totalAssetsUsd += 1; },
    stored => { delete stored.summary.holdingPnl; },
    stored => { stored.quotes[0].dailyPnlPrice += 1; },
    stored => { stored.quotes.pop(); },
    stored => { delete stored.quotes[0].dailyPnlBaselineSource; },
    stored => { stored.quotes[0].source = 'Yahoo'; },
    stored => { stored.version += 1; },
    stored => { stored.verifiedAt = PRE; },
    stored => { stored.closeDate = '2026-09-09'; },
    stored => { stored.marginDebtUsd = 0; },
  ];
  for (const change of invalid) {
    const storage = storageFixture();
    writeHeaderAssetSnapshot({ snapshot: complete(), storage, now: CLOSED });
    mutateStored(storage, change);
    assert.equal(readHeaderAssetSnapshot(inputs(CLOSED, { storage })), null);
  }
});

test('live values are not persisted and a closed cache cannot bootstrap a later live or close session', () => {
  const storage = storageFixture();
  assert.equal(writeHeaderAssetSnapshot({ snapshot: complete(REGULAR), storage, now: REGULAR }), false);
  writeHeaderAssetSnapshot({ snapshot: complete(), storage, now: CLOSED });
  for (const now of [PRE, REGULAR, Date.parse('2026-09-11T21:00:00Z'), CLOSED + 8 * 86400_000]) {
    assert.equal(readHeaderAssetSnapshot(inputs(now, { storage })), null);
  }
});

test('unavailable, denied or deliberately disabled storage does not affect header computation', () => {
  const denied = { getItem() { throw Error('disabled'); }, setItem() { throw Error('disabled'); } };
  for (const storage of [null, denied]) {
    assert.equal(writeHeaderAssetSnapshot({ snapshot: complete(), storage, now: CLOSED }), false);
    assert.equal(readHeaderAssetSnapshot(inputs(CLOSED, { storage })), null);
  }
  assert.ok(complete());
});

test('weekends and NYSE holidays share the correct completed close, never a fabricated weekday close', () => {
  const examples = [
    ['2026-09-12T15:00:00Z', '2026-09-11'],
    ['2026-09-13T15:00:00Z', '2026-09-11'],
    ['2026-09-07T15:00:00Z', '2026-09-04'],
    ['2026-09-08T06:00:00Z', '2026-09-04'],
  ];
  for (const [time, closeDate] of examples) {
    const context = headerAssetSessionContext(Date.parse(time));
    assert.equal(context.live, false);
    assert.equal(context.closeDate, closeDate);
    assert.equal(headerAssetSessionKey(Date.parse(time)), `close:${closeDate}`);
  }
  const holiday = Date.parse('2026-09-07T15:00:00Z');
  const baselineRows = ['NVDA', 'MSFT'].map(symbol => closeQuote(symbol, {
    dailyPnlPriceDate: '2026-09-04', dailyPnlBaselineDate: '2026-09-03', headerReceivedAt: holiday - 1000,
  }));
  assert.ok(complete(holiday, { baselineRows }));
});

test('session boundaries follow New York DST rather than a fixed UTC offset', () => {
  for (const time of ['2026-03-06T14:30:00Z', '2026-03-09T13:30:00Z', '2026-11-02T14:30:00Z']) {
    assert.equal(headerAssetSessionContext(Date.parse(time)).session, 'regular');
    assert.equal(headerAssetSessionContext(Date.parse(time) - 1000).session, 'pre');
  }
  assert.equal(headerAssetSessionContext(Date.parse('2026-03-08T13:30:00Z')).session, 'closed');
});

test('selection keeps a complete header through partial refreshes and rejects a single regressed holding', () => {
  const previous = complete(REGULAR, { quoteRows: [tick('NVDA'), tick('MSFT')] });
  assert.equal(selection(null, previous), previous);
  const olderRest = complete(REGULAR);
  assert.equal(selection(olderRest, previous), previous);
  const mixed = complete(REGULAR, { quoteRows: [tick('NVDA', REGULAR, { realtimeAt: REGULAR })] });
  assert.equal(selection(mixed, previous), previous);
});

test('selection accepts newer price declines but keeps the first quote when equal timestamps conflict', () => {
  const previous = complete(REGULAR, { quoteRows: [tick('NVDA'), tick('MSFT')] });
  const lower = complete(REGULAR, { quoteRows: [tick('NVDA', REGULAR, {
    price: 90, dailyPnlPrice: 90, realtimeAt: REGULAR,
  }), tick('MSFT')] });
  assert.equal(selection(lower, previous), lower);
  const conflict = complete(REGULAR, { quoteRows: [tick('NVDA', REGULAR, { price: 130, dailyPnlPrice: 130 }), tick('MSFT')] });
  assert.equal(selection(conflict, previous), previous);
});

test('selection permits a later official close correction without using an after-hours trade price', () => {
  const previous = complete();
  const candidate = complete(CLOSED + 1000, { baselineRows: [closeQuote('NVDA', {
    price: 9999, dailyPnlPrice: 121, headerReceivedAt: CLOSED + 1000,
  }), closeQuote('MSFT', { headerReceivedAt: CLOSED + 1000 })] });
  assert.equal(selection(candidate, previous), candidate);
  assert.equal(candidate.summary.positionsMarketValue, 2228);
});

test('selection immediately invalidates different account, ledger or session and respects readiness', () => {
  const previous = complete();
  assert.equal(selection(null, previous, { basisKey: 'different' }), null);
  assert.equal(selection(null, previous, { sessionKey: headerAssetSessionKey(PRE) }), null);
  assert.equal(selection(previous, previous, { ready: false }), null);
  assert.equal(selection(null, null, { restored: previous, basisKey: previous.basisKey, sessionKey: previous.sessionKey }), previous);
});
