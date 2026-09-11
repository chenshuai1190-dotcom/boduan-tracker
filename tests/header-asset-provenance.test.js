import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEodhdStockQuoteFields } from '../server/quote/providers/eodhd.js';
import { normalizeStockTick } from '../server/realtime/stocks.js';
import { applyStockTickToQuoteRows } from '../src/lib/stockRealtime.js';
import { buildHeaderAssetSnapshot } from '../src/lib/headerAssetSnapshot.js';

const PRE = Date.parse('2026-09-11T08:07:00Z');
const CLOSED = Date.parse('2026-09-11T07:59:00Z');
const REGULAR = Date.parse('2026-09-11T13:30:05Z');
// The public EODHD response observed on September 11 retained September 10's
// provider timestamp while selecting ethPrice for the premarket quote.
const RAW_QUOTE = {
  lastTradePrice: '218.36', ethPrice: '218.55', previousClosePrice: '218.36',
  timestamp: 1789086540,
};
const OFFICIAL_BASELINE = {
  dailyBaselineClose: 218.36, dailyBaselineDate: '2026-09-10',
  dailyBaselineSource: 'eodhd-adjusted-close',
};

function providerClosed({ historyAvailable = true } = {}) {
  return { symbol: 'NVDA', source: 'EODHD', ...normalizeEodhdStockQuoteFields(RAW_QUOTE, {
    now: CLOSED,
    ...(historyAvailable ? {
      ...OFFICIAL_BASELINE,
      closedDailyPnlPrice: 218.36, closedDailyPnlDate: '2026-09-10',
      closedDailyPnlSource: 'eodhd-adjusted-close',
      closedDailyPnlBaselineClose: 217, closedDailyPnlBaselineDate: '2026-09-09',
      closedDailyPnlBaselineSource: 'eodhd-adjusted-close',
    } : {}),
  }) };
}

function providerRest(now = PRE) {
  return { symbol: 'NVDA', source: 'EODHD', ...normalizeEodhdStockQuoteFields(RAW_QUOTE, {
    now, ...OFFICIAL_BASELINE,
  }), headerReceivedAt: now };
}

function streamedQuote(now = PRE, { historyAvailable = true, price = 219 } = {}) {
  const rawTick = normalizeStockTick({ s: 'NVDA.US', p: price, t: now, ms: 'open' }, { receivedAt: now });
  return applyStockTickToQuoteRows([providerClosed({ historyAvailable })], rawTick, 'live', [], { now });
}

function header({ now = PRE, quoteRows = streamedQuote(now), baselineRows = [providerRest(now)] } = {}) {
  return buildHeaderAssetSnapshot({ userId: 'provenance-fixture', ready: true, now,
    stockTrades: [{ id: 1, symbol: 'NVDA', side: 'buy', shares: 10, price: 200, date: '2026-01-02' }],
    cashUsd: 25, marginDebtUsd: 100, usdRate: 7.1, quoteRows, baselineRows });
}

test('production premarket pipeline combines the current tick with the separately confirmed daily baseline', () => {
  const quoteRows = streamedQuote();
  const baselineRows = [providerRest()];
  assert.equal(quoteRows[0].dailyPnlSource, 'realtime-tick');
  assert.equal(quoteRows[0].dailyPnlBaselineDate, '2026-09-09', 'the production overnight row exposes the old P&L baseline');
  assert.equal(baselineRows[0].dailyPnlBaselineDate, '2026-09-10');
  assert.equal(baselineRows[0].dailyPnlPriceDate, '');
  assert.equal(baselineRows[0].timestamp, RAW_QUOTE.timestamp, 'provider time remains the actual prior-day timestamp');
  const before = JSON.stringify({ quoteRows, baselineRows });
  const snapshot = header({ quoteRows, baselineRows });
  assert.ok(snapshot, 'a genuine current tick and a valid dated official baseline form a complete header');
  assert.equal(snapshot.summary.positionsMarketValue, 2190);
  assert.equal(snapshot.summary.totalAssetsUsd, 2215);
  assert.ok(Math.abs(snapshot.summary.todayPnl - 6.4) < 1e-10);
  assert.equal(snapshot.quotes[0].price, 219, 'the delayed REST price must never replace the current tick');
  assert.equal(snapshot.quotes[0].dailyPnlBaselineClose, 218.36);
  assert.equal(snapshot.quotes[0].dailyPnlBaselineDate, '2026-09-10');
  assert.equal(snapshot.quotes[0].realtimeAt, PRE);
  assert.deepEqual(header({ quoteRows, baselineRows: [] }).summary, snapshot.summary,
    'the overnight row itself already contains a dated official daily baseline that can be promoted');
  assert.equal(JSON.stringify({ quoteRows, baselineRows }), before, 'header normalization must not mutate shared market rows');
});

test('a cold-start tick without dated history uses only the separate official REST baseline facts', () => {
  const quoteRows = streamedQuote(PRE, { historyAvailable: false });
  assert.equal(quoteRows[0].dailyBaselineDate, '');
  assert.equal(quoteRows[0].dailyPnlBaselineDate, '');
  assert.equal(header({ quoteRows, baselineRows: [] }), null);
  const snapshot = header({ quoteRows, baselineRows: [providerRest()] });
  assert.ok(snapshot);
  assert.equal(snapshot.quotes[0].dailyPnlBaselineDate, '2026-09-10');
  assert.equal(snapshot.quotes[0].dailyPnlBaselineSource, 'eodhd-adjusted-close');
  assert.equal(snapshot.quotes[0].price, 219);
  assert.equal(snapshot.quotes[0].realtimeAt, PRE);
  assert.ok(Math.abs(snapshot.summary.todayPnl - 6.4) < 1e-10);
});

test('a fresh REST response with an old provider price timestamp cannot replace a missing current tick', () => {
  assert.equal(header({ quoteRows: [] }), null);
  assert.equal(header({ quoteRows: [providerClosed()] }), null);
  assert.equal(header({ now: PRE + 5 * 60_000 + 1, quoteRows: streamedQuote(), baselineRows: [providerRest(PRE + 5 * 60_000 + 1)] }), null);
});

test('current ticks still require a valid matching official dated baseline', () => {
  const quoteRows = streamedQuote(PRE, { historyAvailable: false });
  assert.equal(quoteRows[0].dailyPnlBaselineDate, '');
  assert.equal(header({ quoteRows, baselineRows: [] }), null);
  for (const override of [
    { dailyPnlBaselineDate: '', dailyBaselineDate: '' },
    { dailyPnlBaselineDate: '2026-09-09', dailyBaselineDate: '2026-09-09' },
    { dailyPnlBaselineSource: 'eodhd-quote-previous-close', dailyBaselineSource: 'eodhd-quote-previous-close' },
    { source: 'watchlist' },
    { symbol: 'MSFT' },
    { error: true },
  ]) {
    assert.equal(header({ quoteRows, baselineRows: [{ ...providerRest(), ...override }] }), null, JSON.stringify(override));
  }
});

test('a delayed REST arrival cannot roll a newer live price back while repairing the baseline', () => {
  const now = PRE + 20_000;
  const quoteRows = streamedQuote(now, { price: 218 });
  const baselineRows = [{ ...providerRest(PRE), headerReceivedAt: now }];
  const snapshot = header({ now, quoteRows, baselineRows });
  assert.ok(snapshot);
  assert.equal(snapshot.summary.positionsMarketValue, 2180);
  assert.ok(snapshot.summary.todayPnl < 0, 'real price declines remain valid updates');
  assert.equal(snapshot.quotes[0].price, 218);
  assert.equal(snapshot.quotes[0].dailyPnlPrice, 218);
});

test('regular-session ticks can use official daily baseline facts without reviving prior-session prices', () => {
  const snapshot = header({ now: REGULAR });
  assert.ok(snapshot);
  assert.equal(snapshot.quotes[0].dailyPnlSession, 'regular');
  assert.equal(snapshot.quotes[0].price, 219);
  assert.equal(snapshot.quotes[0].dailyPnlBaselineDate, '2026-09-10');
  assert.equal(snapshot.summary.todayPnlLocked, false);
  const previousSessionTick = streamedQuote(REGULAR - 6000);
  assert.equal(header({ now: REGULAR, quoteRows: previousSessionTick }), null);
});
