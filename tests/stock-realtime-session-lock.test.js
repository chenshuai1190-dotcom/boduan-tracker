import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeStockTick } from '../server/realtime/stocks.js';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';
import { mergeQuoteBaselineRows } from '../src/lib/quoteRefreshPolicy.js';
import {
  applyStockTickToQuoteRows,
  getUsEquityRealtimeSession,
  mergeFreshStockRealtimeRows,
  shouldAcceptStockRealtimeTick,
} from '../src/lib/stockRealtime.js';

const PRE = Date.parse('2026-09-10T08:26:00Z'); // 04:26 New York, 16:26 Shanghai.
const POST = Date.parse('2026-09-09T20:10:00Z');

function baseline(overrides = {}) {
  return {
    symbol: 'NVDA', name: 'NVIDIA', price: 200, previousClose: 200,
    dailyBaselineClose: 200, dailyBaselineDate: '2026-09-09',
    dailyBaselineSource: 'eodhd-adjusted-close',
    dailyPnlPrice: 200, dailyPnlPriceDate: '2026-09-10',
    dailyPnlBaselineClose: 200, dailyPnlBaselineDate: '2026-09-09',
    dailyPnlBaselineSource: 'eodhd-adjusted-close',
    dailyPnlLocked: false, dailyPnlSession: 'pre', dailyPnlSource: 'realtime-pre',
    ...overrides,
  };
}

function completedRow(overrides = {}) {
  return baseline({
    price: 201, previousClose: 190,
    dailyBaselineClose: 190, dailyBaselineDate: '2026-09-08',
    dailyPnlPrice: 200, dailyPnlPriceDate: '2026-09-09',
    dailyPnlBaselineClose: 190, dailyPnlBaselineDate: '2026-09-08',
    dailyPnlLocked: true, dailyPnlSession: 'post',
    dailyPnlSource: 'locked-provider-regular-close',
    ...overrides,
  });
}

function tradeFrame(price, timestamp, { receivedAt = timestamp, marketStatus = 'open', symbol = 'NVDA' } = {}) {
  return normalizeStockTick({ s: `${symbol}.US`, p: price, t: timestamp, ms: marketStatus }, { receivedAt });
}

function quoteFrame(price, timestamp, { receivedAt = timestamp, marketStatus = 'quote' } = {}) {
  return normalizeStockTick({ s: 'NVDA.US', bp: price - 0.05, ap: price + 0.05, t: timestamp, ms: marketStatus }, {
    receivedAt, source: 'EODHD_WS_QUOTE', priceType: 'quote-midpoint', defaultMarketStatus: 'quote',
  });
}

function summary(rows) {
  return deriveInvestmentSummary({
    stockTrades: rows.map((row, id) => ({ id, symbol: row.symbol, side: 'buy', shares: 10, price: 100, date: '2026-01-02' })),
    watchlist: rows,
    cashUsd: 0,
  });
}

function apply(rows, tick, now, baseRows = []) {
  return applyStockTickToQuoteRows(rows, tick, 'live', baseRows, { now });
}

test('premarket observed clock defeats a stale postmarket label on a fresh raw trade frame', () => {
  const initial = baseline();
  const result = apply([initial], tradeFrame(202, PRE, { marketStatus: 'postmarket' }), PRE);
  assert.equal(result[0].dailyPnlSession, 'pre');
  assert.equal(result[0].dailyPnlLocked, false);
  assert.equal(result[0].dailyPnlPrice, 202);
  const account = summary(result);
  assert.equal(account.todayPnl, 20);
  assert.equal(account.todayPnlLocked, false);
  assert.equal(account.positions[0].valuationPrice, 202);
  assert.equal(account.positionsMarketValue, 2020);
});

test('a delayed prior-day trade cannot reset premarket valuation or lock state', () => {
  const current = apply([baseline()], quoteFrame(202, PRE), PRE);
  const late = tradeFrame(199, Date.parse('2026-09-09T23:59:00Z'), { receivedAt: PRE + 1000, marketStatus: 'postmarket' });
  assert.equal(shouldAcceptStockRealtimeTick(current[0], late, { now: PRE + 1000 }), false);
  const after = apply(current, late, PRE + 1000);
  assert.equal(after[0], current[0]);
  assert.deepEqual(summary(after), summary(current));
});

test('same-session out-of-order frames do not reverse accepted prices, while equal timestamps remain usable', () => {
  const current = apply([baseline()], tradeFrame(203, PRE), PRE);
  const late = tradeFrame(201, PRE - 1000, { receivedAt: PRE + 1000 });
  assert.equal(shouldAcceptStockRealtimeTick(current[0], late, { now: PRE + 1000 }), false);
  assert.equal(apply(current, late, PRE + 1000)[0], current[0]);
  const sameTimestamp = apply(current, tradeFrame(204, PRE, { receivedAt: PRE + 2000 }), PRE + 2000);
  assert.equal(sameTimestamp[0].price, 204);
  assert.equal(summary(sameTimestamp).todayPnl, 40);
});

test('fresh trade and sparse quote fallback can each advance price without changing current session', () => {
  const midpoint = apply([baseline()], quoteFrame(201, PRE), PRE);
  const traded = apply(midpoint, tradeFrame(202, PRE + 1000, { marketStatus: 'postmarket' }), PRE + 1000);
  assert.equal(traded[0].priceType, 'trade');
  assert.equal(traded[0].price, 202);
  const fallback = apply(traded, quoteFrame(203, PRE + 90_000), PRE + 90_000);
  assert.equal(fallback[0].priceType, 'quote-midpoint');
  assert.equal(fallback[0].price, 203);
  assert.equal(fallback[0].dailyPnlLocked, false);
  assert.equal(summary(fallback).positionsMarketValue, 2030);
  assert.equal(summary(fallback).todayPnl, 30);
});

test('current session rejects a just-ended prior session frame and implausible future times', () => {
  const open = Date.parse('2026-09-10T13:30:00Z');
  assert.equal(shouldAcceptStockRealtimeTick({}, tradeFrame(201, open - 1000), { now: open }), false);
  assert.equal(shouldAcceptStockRealtimeTick({}, tradeFrame(201, PRE + 60_001), { now: PRE }), false);
  assert.equal(shouldAcceptStockRealtimeTick({}, tradeFrame(201, PRE - 300_001), { now: PRE }), false);
  assert.equal(shouldAcceptStockRealtimeTick({}, tradeFrame(201, PRE - 4 * 60_000), { now: PRE }), true);
});

test('new dated REST baseline replaces the prior-day cache baseline as one bundle', () => {
  const old = completedRow();
  const fresh = baseline();
  const result = apply([old], tradeFrame(202, PRE), PRE, [fresh]);
  assert.equal(result[0].previousClose, 200);
  assert.equal(result[0].dailyBaselineDate, '2026-09-09');
  assert.equal(result[0].dailyPnlBaselineClose, 200);
  assert.equal(result[0].dailyPnlBaselineDate, '2026-09-09');
  assert.equal(result[0].dailyPnlPriceDate, '2026-09-10');
  assert.equal(result[0].dailyPnlLocked, false);
  assert.equal(summary(result).todayPnl, 20);
  assert.equal(summary(result).todayPnlPct, 0.01);
});

test('delayed old REST baseline cannot reintroduce the earlier denominator into current premarket rows', () => {
  const current = apply([baseline()], quoteFrame(201, PRE), PRE);
  const result = apply(current, tradeFrame(202, PRE + 1000), PRE + 1000, [completedRow()]);
  assert.equal(result[0].dailyPnlBaselineClose, 200);
  assert.equal(result[0].dailyPnlBaselineDate, '2026-09-09');
  assert.equal(result[0].dailyPnlLocked, false);
  assert.equal(summary(result).todayPnl, 20);
});

test('REST refresh composition preserves a newer cached dated baseline without a completed-close object', () => {
  const current = apply([baseline()], quoteFrame(202, PRE), PRE);
  assert.equal(current[0].completedDailyPnl, null, 'a normal current premarket REST row need not carry a completed-close object');
  const delayedRest = baseline({
    price: 199, previousClose: 190,
    dailyBaselineClose: 190, dailyBaselineDate: '2026-09-08',
    dailyPnlPrice: 199, dailyPnlPriceDate: '2026-09-09',
    dailyPnlBaselineClose: 190, dailyPnlBaselineDate: '2026-09-08',
  });
  const mergedBaseline = mergeQuoteBaselineRows(current, [delayedRest]);
  const result = mergeFreshStockRealtimeRows(mergedBaseline, current, { now: PRE + 1000 });
  assert.equal(result[0].dailyBaselineClose, 200);
  assert.equal(result[0].dailyBaselineDate, '2026-09-09');
  assert.equal(result[0].dailyPnlBaselineClose, 200);
  assert.equal(result[0].dailyPnlBaselineDate, '2026-09-09');
  assert.equal(result[0].dailyPnlPrice, 202);
  const account = summary(result);
  assert.equal(account.positions[0].valuationPrice, 202);
  assert.equal(account.todayPnl, 20);
  assert.equal(account.todayPnlPct, 0.01);
  const aged = mergeFreshStockRealtimeRows(mergedBaseline, current, { now: PRE + 6 * 60_000 });
  assert.equal(aged[0].dailyPnlBaselineClose, 200, 'the dated denominator survives live-cache expiry');
  assert.equal(aged[0].price, 199);
  assert.equal(aged[0].dailyPnlPrice, 199, 'expired cached live P&L cannot disagree with the selected REST price');
  assert.equal(aged[0].dailyPnlChange, -1);
  assert.equal(summary(aged).positionsMarketValue, 1990);
  assert.equal(summary(aged).todayPnl, -10);
});

test('next-day premarket promotes the confirmed completed close even before the new REST baseline arrives', () => {
  const result = apply([completedRow()], quoteFrame(202, PRE), PRE);
  assert.equal(result[0].dailyBaselineClose, 200);
  assert.equal(result[0].dailyBaselineDate, '2026-09-09');
  assert.equal(result[0].dailyPnlBaselineClose, 200);
  assert.equal(result[0].dailyPnlBaselineDate, '2026-09-09');
  assert.equal(result[0].completedDailyPnl.price, 200);
  assert.equal(result[0].completedDailyPnl.date, '2026-09-09');
  assert.equal(result[0].dailyPnlSource, 'realtime-tick');
  assert.equal(summary(result).todayPnl, 20);
  assert.equal(summary(result).todayPnlPct, 0.01);
});

test('postmarket ticks update raw quote while account valuation and P&L use the confirmed close', () => {
  const result = apply([completedRow()], tradeFrame(205, POST, { marketStatus: 'open' }), POST);
  assert.equal(result[0].price, 205);
  assert.equal(result[0].dailyPnlPrice, 200);
  assert.equal(result[0].dailyPnlPriceDate, '2026-09-09');
  assert.equal(result[0].dailyPnlLocked, true);
  assert.equal(result[0].completedDailyPnl.price, 200);
  const account = summary(result);
  assert.equal(account.positions[0].currentPrice, 205);
  assert.equal(account.positions[0].valuationPrice, 200);
  assert.equal(account.positionsMarketValue, 2000);
  assert.equal(account.todayPnl, 100);
  assert.equal(account.todayPnlLocked, true);
});

test('a late regular-session frame cannot overwrite a confirmed close after the market transitions', () => {
  const afterClose = Date.parse('2026-09-09T20:00:30Z');
  const lateRegular = tradeFrame(205, Date.parse('2026-09-09T19:59:59Z'), { receivedAt: afterClose });
  const original = completedRow();
  const result = apply([original], lateRegular, afterClose);
  assert.equal(result[0], original);
  assert.equal(summary(result).positions[0].valuationPrice, 200);
  assert.equal(summary(result).todayPnl, 100);
});

test('a last live quote is not promoted into an official close when postmarket starts', () => {
  const live = baseline({
    price: 205, previousClose: 190, dailyBaselineClose: 190, dailyBaselineDate: '2026-09-08',
    dailyPnlPrice: 205, dailyPnlPriceDate: '2026-09-09',
    dailyPnlBaselineClose: 190, dailyPnlBaselineDate: '2026-09-08',
    dailyPnlSession: 'regular', dailyPnlSource: 'realtime-tick',
  });
  const result = apply([live], tradeFrame(206, POST), POST);
  assert.equal(result[0].price, 206);
  assert.equal(result[0].dailyPnlPrice, 0);
  assert.equal(result[0].dailyPnlSource, 'unavailable');
  assert.equal(result[0].completedDailyPnl, null);
  const account = summary(result);
  assert.equal(account.hasTodayPnl, false);
  assert.equal(account.todayPnl, null);
  assert.equal(account.todayPnlLocked, false);
  assert.equal(account.positions[0].valuationPrice, 190, 'existing valuation fallback remains the last completed baseline, not the live trade');
});

test('REST refresh composition cannot lock an aged last live price when no official close or new tick arrives', () => {
  const regular = Date.parse('2026-09-09T19:59:00Z');
  const regularBaseline = baseline({
    price: 200, previousClose: 190,
    dailyBaselineClose: 190, dailyBaselineDate: '2026-09-08',
    dailyPnlPrice: 200, dailyPnlPriceDate: '2026-09-09',
    dailyPnlBaselineClose: 190, dailyPnlBaselineDate: '2026-09-08',
    dailyPnlSession: 'regular', dailyPnlSource: 'realtime-regular',
  });
  const current = apply([regularBaseline], tradeFrame(205, regular), regular);
  assert.equal(current[0].completedDailyPnl, null);
  const incompletePostRest = {
    ...regularBaseline, price: 206,
    dailyPnlPrice: 0, dailyPnlPriceDate: '', dailyPnlLocked: true,
    dailyPnlSession: 'post', dailyPnlSource: 'unavailable',
  };
  const mergedBaseline = mergeQuoteBaselineRows(current, [incompletePostRest]);
  const result = mergeFreshStockRealtimeRows(mergedBaseline, current, { now: POST });
  assert.equal(result[0].completedDailyPnl, null);
  assert.equal(result[0].dailyPnlPrice, 0);
  assert.equal(result[0].dailyPnlPriceDate, '');
  assert.equal(result[0].dailyPnlSource, 'unavailable');
  const account = summary(result);
  assert.equal(account.positions[0].valuationPrice, 190, 'retain the last completed baseline; never call a last live quote the official close');
  assert.equal(account.hasTodayPnl, false);
  assert.equal(account.todayPnl, null);
  assert.equal(account.todayPnlLocked, false);
});

test('missing official price date or untrusted live source cannot fabricate a completed close', () => {
  for (const original of [
    completedRow({ dailyPnlPriceDate: '' }),
    completedRow({ dailyPnlSource: 'realtime-tick' }),
    completedRow({ dailyPnlSource: 'locked-regular-close' }),
  ]) {
    const result = apply([original], quoteFrame(205, POST), POST);
    assert.equal(result[0].completedDailyPnl, null);
    assert.equal(result[0].dailyPnlPrice, 0);
    assert.equal(summary(result).hasTodayPnl, false);
    assert.equal(summary(result).todayPnl, null);
  }
});

test('latest same-day REST close can be retained independently from the last live valuation price', () => {
  const live = baseline({
    price: 205, previousClose: 190, dailyBaselineClose: 190, dailyBaselineDate: '2026-09-08',
    dailyPnlPrice: 205, dailyPnlPriceDate: '2026-09-09',
    dailyPnlBaselineClose: 190, dailyPnlBaselineDate: '2026-09-08',
    dailyPnlSession: 'regular', dailyPnlSource: 'realtime-tick',
  });
  const result = apply([live], quoteFrame(206, POST), POST, [completedRow()]);
  assert.equal(result[0].completedDailyPnl.price, 200);
  assert.equal(result[0].dailyPnlPrice, 200);
  assert.equal(summary(result).positions[0].valuationPrice, 200);
  assert.equal(summary(result).todayPnl, 100);
});

test('a cached confirmed close survives an incomplete same-session REST refresh', () => {
  const current = apply([completedRow()], quoteFrame(205, POST), POST);
  const incomplete = completedRow({
    dailyPnlPrice: 0, dailyPnlPriceDate: '', dailyPnlSource: 'unavailable',
  });
  for (const elapsed of [1000, 6 * 60_000]) {
    const result = mergeFreshStockRealtimeRows([incomplete], current, { now: POST + elapsed });
    assert.equal(result[0].completedDailyPnl?.price, 200);
    assert.equal(result[0].dailyPnlPrice, 200);
    assert.equal(summary(result).positions[0].valuationPrice, 200);
    assert.equal(summary(result).todayPnl, 100, 'official close does not expire with the live-tick cache');
  }
});

test('stored confirmed close survives the next premarket live field update', () => {
  const nextDay = apply([completedRow()], quoteFrame(202, PRE), PRE);
  const again = apply(nextDay, tradeFrame(203, PRE + 1000), PRE + 1000);
  assert.equal(again[0].completedDailyPnl.price, 200);
  assert.equal(again[0].completedDailyPnl.date, '2026-09-09');
  assert.equal(again[0].dailyPnlPrice, 203);
  assert.equal(again[0].dailyPnlBaselineClose, 200);
  assert.equal(summary(again).todayPnl, 30);
});

test('prior-day confirmed close is not reused as the new day official close after the next market close', () => {
  const nextDay = apply([completedRow()], quoteFrame(202, PRE), PRE);
  const nextPost = Date.parse('2026-09-10T20:10:00Z');
  const result = apply(nextDay, tradeFrame(205, nextPost), nextPost);
  assert.equal(result[0].completedDailyPnl.price, 200);
  assert.equal(result[0].dailyPnlPrice, 0);
  assert.equal(result[0].dailyPnlSource, 'unavailable');
  assert.equal(summary(result).todayPnl, null);
  assert.equal(summary(result).todayPnlLocked, false);
});

test('fresh premarket cache overlays keep supplied observation time and the newer REST denominator', () => {
  const cached = {
    ...baseline(), price: 202, realtime: true, realtimeStatus: 'live',
    realtimeAt: PRE - 4 * 60_000, clientReceivedAt: PRE - 4 * 60_000,
    timestamp: Date.parse('2026-09-09T23:59:00Z'),
    source: 'EODHD_WS_QUOTE', priceType: 'quote-midpoint', marketStatus: 'postmarket',
  };
  const result = mergeFreshStockRealtimeRows([baseline()], [cached], { now: PRE });
  assert.equal(result[0].price, 202);
  assert.equal(result[0].dailyPnlSession, 'pre');
  assert.equal(result[0].dailyPnlLocked, false);
  assert.equal(summary(result).todayPnl, 20);
});

test('fresh arrival time does not make a prior-day cache price eligible for a new session', () => {
  const original = baseline();
  const cached = {
    ...completedRow(), realtime: true, realtimeStatus: 'live', price: 199,
    realtimeAt: Date.parse('2026-09-09T23:59:00Z'), clientReceivedAt: PRE,
  };
  const result = mergeFreshStockRealtimeRows([original], [cached], { now: PRE });
  const { completedDailyPnl, ...preserved } = result[0];
  assert.deepEqual(preserved, original, 'an old tick cannot change the current quote or its session');
  assert.equal(completedDailyPnl.price, 200, 'independent confirmed close facts can still be retained');
  assert.equal(summary(result).positions[0].valuationPrice, 200);
  assert.equal(summary(result).todayPnlLocked, false);
});

test('no previous-close baseline means a raw tick cannot create a false zero P&L', () => {
  const original = { symbol: 'NVDA', price: 200, previousClose: 0, dailyPnlPrice: 0 };
  const result = apply([original], tradeFrame(202, PRE), PRE);
  assert.equal(result[0], original);
  assert.equal(summary(result).todayPnl, null);
  assert.equal(summary(result).hasTodayPnl, false);
});

test('session clock follows New York DST and weekends rather than message marketStatus', () => {
  const sessions = [
    ['2026-03-06T08:59:00Z', 'closed'], // EST: 03:59.
    ['2026-03-06T09:00:00Z', 'pre'],
    ['2026-03-09T08:00:00Z', 'pre'], // EDT: 04:00 after spring DST.
    ['2026-03-09T13:30:00Z', 'regular'],
    ['2026-03-09T20:00:00Z', 'post'],
    ['2026-10-30T08:00:00Z', 'pre'],
    ['2026-11-02T08:59:00Z', 'closed'], // EST after autumn DST.
    ['2026-11-02T09:00:00Z', 'pre'],
    ['2026-09-12T14:00:00Z', 'closed'],
    ['2026-09-13T14:00:00Z', 'closed'],
  ];
  for (const [date, expected] of sessions) {
    assert.equal(getUsEquityRealtimeSession({ marketStatus: 'open' }, Date.parse(date)), expected, date);
  }
});

test('App rejects obsolete stock ticks before writing replay or freshness refs and QQQ uses the same merge helper', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('const applyStockRealtimeTick = useCallback(');
  const end = source.indexOf('const mergeFreshStockTicksIntoQuoteRows = useCallback(', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  const acceptance = block.indexOf('if (!shouldAcceptStockRealtimeTick(');
  const replayWrite = block.indexOf('ref.lastTicks.set(');
  assert.ok(acceptance >= 0 && acceptance < replayWrite);
  assert.ok(block.slice(acceptance, replayWrite).includes('return;'));
  assert.ok(acceptance < block.indexOf('ref.lastWebSocketTickAt ='));
  assert.ok(block.includes('applyStockTickToQuoteRows(current, enrichedTick, realtimeStatus, realtimeBaseRows, { now: clientReceivedAt })'));
  const qqq = block.slice(block.indexOf("if (key === 'QQQ')"));
  assert.ok(qqq.includes('applyStockTickToQuoteRows([base], enrichedTick, realtimeStatus, realtimeBaseRows, { now: clientReceivedAt })'));
  assert.equal(qqq.includes('getUsEquityRealtimeSession'), false);
  assert.equal(qqq.includes('dailyPnlLocked:'), false);
});
