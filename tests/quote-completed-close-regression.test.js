import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchStockQuote, normalizeEodhdStockQuoteFields } from '../server/quote/providers/eodhd.js';
import { mergeDailyPnlBaselineFields, mergeQuoteBaselineRows } from '../src/lib/quoteRefreshPolicy.js';
import { applyStockTickToQuoteRows, mergeFreshStockRealtimeRows } from '../src/lib/stockRealtime.js';
import { resolveHomeMarketDisplayMetrics, resolveHoldingDisplayPrice } from '../src/lib/homeMarketDisplay.js';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';

// Incident values recorded on 2026-10-13 Shanghai: the delayed quote's
// previousClosePrice still described Friday, while Monday's EOD already existed.
const EOD_DATE = '2026-10-12';
const BASELINE_DATE = '2026-10-09';
const CLOSE = 226.32;
const BASELINE = 229.28;
const CHANGE = CLOSE - BASELINE;
const PERCENT = CHANGE / BASELINE * 100;
const POST = Date.parse('2026-10-12T21:45:00Z'); // Monday 17:45 New York.
const AFTER_POST = Date.parse('2026-10-13T01:45:00Z'); // Monday 21:45 New York.
const AFTER_MIDNIGHT = Date.parse('2026-10-13T04:01:00Z'); // Tuesday 00:01 New York.
const RAW_QUOTE = { lastTradePrice: 226.19, ethPrice: 226.18, previousClosePrice: BASELINE };

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-10, message || `${actual} should equal ${expected}`);
}

function options(now, overrides = {}) {
  return {
    now,
    dailyBaselineClose: BASELINE,
    dailyBaselineDate: BASELINE_DATE,
    dailyBaselineSource: 'eodhd-adjusted-close',
    regularClosePrice: CLOSE,
    regularCloseDate: EOD_DATE,
    regularCloseSource: 'eodhd-adjusted-close',
    closedDailyPnlPrice: CLOSE,
    closedDailyPnlDate: EOD_DATE,
    closedDailyPnlSource: 'eodhd-adjusted-close',
    closedDailyPnlBaselineClose: BASELINE,
    closedDailyPnlBaselineDate: BASELINE_DATE,
    closedDailyPnlBaselineSource: 'eodhd-adjusted-close',
    ...overrides,
  };
}

function assertCompleted(quote) {
  assert.equal(quote.dailyPnlPrice, CLOSE);
  assert.equal(quote.dailyPnlPriceDate, EOD_DATE);
  assert.equal(quote.dailyPnlBaselineClose, BASELINE);
  assert.equal(quote.dailyPnlBaselineDate, BASELINE_DATE);
  assert.equal(quote.dailyPnlLocked, true);
  assert.equal(quote.dailyPnlSource, 'eodhd-adjusted-close');
  near(quote.dailyPnlChange, CHANGE);
  near(quote.dailyPnlChangePercent, PERCENT);
  assert.equal(quote.dailyPnlChangePercent.toFixed(3), '-1.291');
}

function assertUnavailable(quote) {
  assert.equal(quote.dailyPnlPrice, 0);
  assert.equal(quote.dailyPnlPriceDate, '');
  assert.equal(quote.dailyPnlLocked, true);
  assert.equal(quote.dailyPnlSource, 'unavailable');
  assert.equal(quote.dailyPnlChange, null);
  assert.equal(quote.dailyPnlChangePercent, null);
  assert.equal(resolveHomeMarketDisplayMetrics(quote).price, null, 'an unavailable completed close cannot expose raw after-hours price');
}

for (const [label, now, rawPrice] of [['postmarket', POST, RAW_QUOTE.ethPrice], ['after 20:00', AFTER_POST, RAW_QUOTE.lastTradePrice]]) {
  test(`${label}: dated Monday EOD beats the provider's undated Friday previous close`, () => {
    const quote = normalizeEodhdStockQuoteFields(RAW_QUOTE, options(now));
    assertCompleted(quote);
    assert.equal(quote.price, rawPrice, 'do not rewrite the separate live/raw quote price');
    assert.equal(quote.providerPreviousClose, BASELINE);
  });

  test(`${label}: missing, wrong-date and future EOD cannot become today's confirmed close`, () => {
    for (const regularCloseDate of ['', BASELINE_DATE, '2026-10-13', '2026-10-14', '2026-02-30', '2026-10-12T00:00:00Z']) {
      assertUnavailable(normalizeEodhdStockQuoteFields(RAW_QUOTE, options(now, { regularCloseDate })));
    }
    for (const regularClosePrice of [undefined, null, 0, -1, NaN, Infinity]) {
      assertUnavailable(normalizeEodhdStockQuoteFields(RAW_QUOTE, options(now, { regularClosePrice })));
    }
  });
}

test('the confirmed close and its P&L remain identical across New York midnight', () => {
  const before = normalizeEodhdStockQuoteFields(RAW_QUOTE, options(Date.parse('2026-10-13T03:59:00Z')));
  const after = normalizeEodhdStockQuoteFields(RAW_QUOTE, options(AFTER_MIDNIGHT, {
    regularClosePrice: null,
    regularCloseDate: '',
    // Tuesday's ordinary previous-close reference has advanced to Monday,
    // while Monday's completed daily P&L still needs Friday's denominator.
    dailyBaselineClose: CLOSE,
    dailyBaselineDate: EOD_DATE,
  }));
  assertCompleted(before);
  assertCompleted(after);
  assert.equal(after.previousClose, CLOSE);
});

test('overnight closed sessions reject undated, malformed and not-yet-completed closes', () => {
  for (const closedDailyPnlDate of ['', '2026-02-30', '2026-10-12T00:00:00Z', '2026-10-13', '2026-10-14']) {
    assertUnavailable(normalizeEodhdStockQuoteFields(RAW_QUOTE, options(AFTER_MIDNIGHT, { closedDailyPnlDate })));
  }
  for (const closedDailyPnlPrice of [undefined, null, 0, -1, NaN, Infinity]) {
    assertUnavailable(normalizeEodhdStockQuoteFields(RAW_QUOTE, options(AFTER_MIDNIGHT, { closedDailyPnlPrice })));
  }
});

test('a genuinely unchanged dated EOD close preserves zero daily return', () => {
  for (const now of [POST, AFTER_POST, AFTER_MIDNIGHT]) {
    const quote = normalizeEodhdStockQuoteFields(RAW_QUOTE, options(now, {
      regularClosePrice: BASELINE,
      closedDailyPnlPrice: BASELINE,
    }));
    assert.equal(quote.dailyPnlLocked, true);
    assert.equal(quote.dailyPnlPrice, BASELINE);
    assert.equal(quote.dailyPnlPriceDate, EOD_DATE);
    assert.equal(quote.dailyPnlChange, 0);
    assert.equal(quote.dailyPnlChangePercent, 0);
  }
});

test('a confirmed close without an earlier dated baseline retains its price but cannot claim daily P&L', () => {
  for (const now of [POST, AFTER_POST, AFTER_MIDNIGHT]) {
    const overnight = now === AFTER_MIDNIGHT;
    const priceField = overnight ? 'closedDailyPnlBaselineClose' : 'dailyBaselineClose';
    const dateField = overnight ? 'closedDailyPnlBaselineDate' : 'dailyBaselineDate';
    for (const invalidBaseline of [
      { [priceField]: null },
      { [priceField]: 0 },
      { [dateField]: '' },
      { [dateField]: EOD_DATE },
      { [dateField]: '2026-10-13' },
      { [dateField]: '2026-02-30' },
    ]) {
      const quote = normalizeEodhdStockQuoteFields(RAW_QUOTE, options(now, invalidBaseline));
      assert.equal(quote.dailyPnlPrice, CLOSE);
      assert.equal(quote.dailyPnlPriceDate, EOD_DATE);
      assert.equal(quote.dailyPnlLocked, true);
      assert.equal(quote.dailyPnlBaselineClose, 0);
      assert.equal(quote.dailyPnlBaselineDate, '');
      assert.equal(quote.dailyPnlChange, null);
      assert.equal(quote.dailyPnlChangePercent, null);
    }
  }
});

test('premarket and regular sessions retain their existing raw-price selection and live daily P&L', () => {
  for (const [now, session, expected] of [
    [Date.parse('2026-10-12T12:30:00Z'), 'pre', RAW_QUOTE.ethPrice],
    [Date.parse('2026-10-12T15:30:00Z'), 'regular', RAW_QUOTE.lastTradePrice],
  ]) {
    const quote = normalizeEodhdStockQuoteFields(RAW_QUOTE, options(now));
    assert.equal(quote.quoteSession, session);
    assert.equal(quote.price, expected);
    assert.equal(quote.dailyPnlPrice, expected);
    assert.equal(quote.dailyPnlLocked, false);
    assert.equal(quote.dailyPnlSource, `realtime-${session}`);
    near(quote.dailyPnlChangePercent, (expected - BASELINE) / BASELINE * 100);
  }
});

const HISTORY = [
  { date: '2025-12-31', close: 200, adjusted_close: 200, high: 201, low: 199 },
  { date: BASELINE_DATE, close: BASELINE, adjusted_close: BASELINE, high: 230, low: 228 },
  { date: EOD_DATE, close: CLOSE, adjusted_close: CLOSE, high: 229, low: 225 },
];

async function withProvider(now, rows, verify, rawQuote = RAW_QUOTE, symbol = 'NVDA') {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const calls = [];
  const response = body => ({ ok: true, status: 200, json: async () => body });
  Date.now = () => now;
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    calls.push(parsed.pathname);
    if (parsed.pathname === '/api/us-quote-delayed') return response({ data: { [`${symbol}.US`]: rawQuote } });
    if (parsed.pathname === `/api/eod/${symbol}.US`) return response(rows);
    if (parsed.hostname === 'query1.finance.yahoo.com') return response({ chart: { result: [] } });
    throw new Error('Unexpected provider request in completed-close regression');
  };
  try {
    const quote = await fetchStockQuote(symbol, { eodhdKey: 'mock-only' });
    assert.equal(quote.error, undefined);
    await verify(quote);
    assert.equal(calls.length, 3, 'reuse the original quote, history and intraday requests');
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
}

test('fetchStockQuote passes exact-date EOD through normalization on both sides of midnight without additional requests', async () => {
  for (const now of [POST, AFTER_POST, AFTER_MIDNIGHT]) {
    await withProvider(now, HISTORY, assertCompleted);
  }
});

test('Thanksgiving keeps the prior official close and its one-session P&L throughout the holiday', async () => {
  const history = [
    { date: '2026-11-24', adjusted_close: 279.05 },
    { date: '2026-11-25', adjusted_close: 273.10 },
    // A provider row on a closed date is never an official close.
    { date: '2026-11-26', adjusted_close: 274.99 },
  ];
  for (const time of ['05:41', '11:00', '18:00', '21:59']) {
    const now = Date.parse(`2026-11-26T${time}:00-05:00`);
    await withProvider(now, history, quote => {
      assert.equal(quote.dailyPnlSession, 'closed');
      assert.equal(quote.dailyPnlPriceDate, '2026-11-25');
      assert.equal(quote.dailyPnlBaselineDate, '2026-11-24');
      near(quote.dailyPnlChange, 273.10 - 279.05);
      const symbol = 'GOOGL';
      const cached = { ...quote, symbol };
      const tick = { symbol, price: 274.99, realtimeAt: now, clientReceivedAt: now, realtime: true };
      const refreshed = mergeFreshStockRealtimeRows([cached], [tick], { now });
      const summary = deriveInvestmentSummary({
        stockTrades: [{ symbol, side: 'buy', date: '2026-11-23', price: 280, shares: 10 }],
        watchlist: refreshed,
      });
      assert.equal(summary.todayPnlLocked, true);
      near(summary.todayPnl, 10 * (273.10 - 279.05));
      assert.equal(summary.positions[0].valuationPrice, 273.10);
    });
  }

  const now = Date.parse('2026-11-26T10:41:00Z');
  await withProvider(now, history.filter(row => row.date !== '2026-11-25'), assertUnavailable);
  await withProvider(now, [ { date:'2026-11-23', adjusted_close: 270 }, history[1] ], quote => {
    assert.equal(quote.dailyPnlPrice, 273.10);
    assert.equal(quote.dailyPnlBaselineClose, 0);
    assert.equal(quote.dailyPnlChange, null);
  });
});

test('Friday after Thanksgiving unlocks during premarket and locks to its own dated EOD from 13:00 ET', async () => {
  const wed = { date: '2026-11-25', adjusted_close: 273.10 };
  const fri = { date: '2026-11-27', adjusted_close: 275 };
  for (const [time, session] of [['04:00', 'pre'], ['12:59', 'regular'], ['13:00', 'post'], ['16:59', 'post'], ['17:00', 'closed']]) {
    const now = Date.parse(`2026-11-27T${time}:00-05:00`);
    await withProvider(now, [wed, { date: '2026-11-26', adjusted_close: 274.99 }, fri], quote => {
      assert.equal(quote.dailyPnlSession, session);
      const locked = ['post', 'closed'].includes(session);
      assert.equal(quote.dailyPnlLocked, locked);
      if (locked) {
        assert.equal(quote.dailyPnlPriceDate, fri.date);
        assert.equal(quote.dailyPnlBaselineDate, wed.date);
        near(quote.dailyPnlChange, fri.adjusted_close - wed.adjusted_close);
      }
    });
  }
  await withProvider(Date.parse('2026-11-27T13:00:00-05:00'), [wed], assertUnavailable);
});

test('the first post-holiday REST or websocket trade must belong to the new session to unlock dated quotes', async () => {
  const symbol = 'GOOGL';
  const wed = { date: '2026-11-25', adjusted_close: 273.10 };
  const tue = { date: '2026-11-24', adjusted_close: 279.05 };
  const lastTime = 1795654796868; // Wednesday 19:59:56 ET
  const raw = { lastTradePrice: 274.99, ethPrice: 274.99, lastTradeTime: lastTime, ethTime: lastTime };
  for (const time of ['04:00', '09:30']) {
    const now = Date.parse(`2026-11-27T${time}:01-05:00`);
    const stockTrades = [{ symbol, side: 'buy', date: tue.date, price: 280, shares: 10 }];
    await withProvider(now, [tue, wed], waiting => {
      const staleTick = { symbol, price: 274.99, realtimeAt: lastTime, clientReceivedAt: now, realtime: true };
      const restored = mergeFreshStockRealtimeRows([waiting], [staleTick], { now });
      assert.equal(restored[0].dailyPnlPriceDate, wed.date);
      assert.equal(restored[0].dailyPnlBaselineDate, tue.date);
      const locked = deriveInvestmentSummary({ stockTrades, watchlist: restored });
      assert.equal(locked.todayPnlLocked, true);
      near(locked.todayPnl, 10 * (wed.adjusted_close - tue.adjusted_close));
      const rows = applyStockTickToQuoteRows(restored, { symbol, price: 275, timestamp: now }, 'live', [], { now });
      assert.equal(rows[0].dailyPnlBaselineDate, wed.date);
      const unlocked = deriveInvestmentSummary({ stockTrades, watchlist: rows });
      assert.equal(unlocked.todayPnlLocked, false);
      near(unlocked.todayPnl, 10 * (275 - wed.adjusted_close));
    }, raw, symbol);
    for (const current of [{ ethPrice: 275, ethTime: now }, { lastTradePrice: 275, lastTradeTime: Math.floor(now / 1000) }]) {
      await withProvider(now, [tue, wed], quote => {
        assert.equal(quote.dailyPnlLocked, false);
        assert.equal(quote.dailyPnlPrice, 275);
        assert.equal(quote.dailyPnlBaselineDate, wed.date);
        near(quote.dailyPnlChange, 275 - wed.adjusted_close);
      }, { ...raw, ...current }, symbol);
    }
  }
});

test('fetchStockQuote never promotes undated previousClosePrice when the current session EOD has not arrived', async () => {
  for (const now of [POST, AFTER_POST]) {
    await withProvider(now, HISTORY.filter(row => row.date !== EOD_DATE), assertUnavailable);
  }
});

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const start = appSource.indexOf('const updatedQuotes = rowsForQuote.map(s => {');
const end = appSource.indexOf('setQuoteCache((current) => {', start);
assert.ok(start >= 0 && end > start);
const projectRestRows = new Function('rowsForQuote', 'resultBySymbol', 'normalizeExternalLogoUrl', 'mergeDailyPnlBaselineFields',
  `${appSource.slice(start, end)}\nreturn updatedQuotes;`);

test('the actual App cache projection replaces a wrongly dated provider close and updates Home and Trades together', async () => {
  await withProvider(AFTER_POST, HISTORY, fresh => {
    for (const realtime of [false, true]) {
      const wrong = {
        ...fresh,
        realtime,
        realtimeAt: AFTER_POST,
        clientReceivedAt: AFTER_POST,
        source: realtime ? 'EODHD_WS' : 'EODHD',
        dailyPnlPrice: BASELINE,
        dailyPnlChange: 0,
        dailyPnlChangePercent: 0,
        dailyPnlSource: 'locked-provider-regular-close',
        completedDailyPnl: {
          price: BASELINE, date: EOD_DATE, source: 'locked-provider-regular-close',
          baselineClose: BASELINE, baselineDate: BASELINE_DATE, baselineSource: 'eodhd-adjusted-close',
        },
      };
      const refreshed = projectRestRows([wrong], new Map([['NVDA', fresh]]), value => value, mergeDailyPnlBaselineFields);
      const [merged] = mergeFreshStockRealtimeRows(mergeQuoteBaselineRows([wrong], refreshed), [wrong], { now: AFTER_POST });
      assertCompleted(merged);
      const home = resolveHomeMarketDisplayMetrics(merged);
      assert.equal(home.price, CLOSE);
      near(home.changePercent, PERCENT);
      const summary = deriveInvestmentSummary({
        stockTrades: [{ id: 1, symbol: 'NVDA', side: 'buy', date: '2026-09-01', shares: 10, price: 200 }],
        watchlist: [merged],
      });
      assert.equal(resolveHoldingDisplayPrice(summary.activePositions[0]), CLOSE);
      near(summary.todayPnl, CHANGE * 10);
      near(summary.activePositions[0].marketValue, CLOSE * 10);
    }
  });
});

test('an incomplete REST refresh retains only a dated EOD cache, never a provider previous close mislabeled as today', async () => {
  await withProvider(AFTER_POST, HISTORY.filter(row => row.date !== EOD_DATE), fresh => {
    for (const trusted of [false, true]) {
      const source = trusted ? 'eodhd-adjusted-close' : 'locked-provider-regular-close';
      const price = trusted ? CLOSE : BASELINE;
      const current = {
        ...fresh,
        dailyPnlPrice: price,
        dailyPnlPriceDate: EOD_DATE,
        dailyPnlBaselineClose: BASELINE,
        dailyPnlBaselineDate: BASELINE_DATE,
        dailyPnlBaselineSource: 'eodhd-adjusted-close',
        dailyPnlLocked: true,
        dailyPnlSource: source,
        dailyPnlChange: price - BASELINE,
        dailyPnlChangePercent: (price - BASELINE) / BASELINE * 100,
        completedDailyPnl: {
          price, date: EOD_DATE, source,
          baselineClose: BASELINE, baselineDate: BASELINE_DATE, baselineSource: 'eodhd-adjusted-close',
        },
      };
      const refreshed = projectRestRows([current], new Map([['NVDA', fresh]]), value => value, mergeDailyPnlBaselineFields);
      const [merged] = mergeFreshStockRealtimeRows(mergeQuoteBaselineRows([current], refreshed), [current], { now: AFTER_POST });
      if (trusted) {
        assertCompleted(merged);
        assert.equal(resolveHomeMarketDisplayMetrics(merged).price, CLOSE);
      } else {
        assertUnavailable(merged);
      }
    }
  });
});

test('singleton current EOD retains the confirmed close through App, Home and Trades without inventing a previous-day baseline', async () => {
  for (const now of [POST, AFTER_POST, AFTER_MIDNIGHT]) {
    await withProvider(now, HISTORY.filter(row => row.date === EOD_DATE), fresh => {
      const current = {
        symbol: 'NVDA',
        price: RAW_QUOTE.lastTradePrice,
        previousClose: BASELINE,
        dailyBaselineClose: BASELINE,
        dailyBaselineDate: BASELINE_DATE,
        dailyPnlBaselineClose: BASELINE,
        dailyPnlBaselineDate: BASELINE_DATE,
        dailyPnlChange: 0,
        dailyPnlChangePercent: 0,
      };
      const refreshed = projectRestRows([current], new Map([['NVDA', fresh]]), value => value, mergeDailyPnlBaselineFields);
      const [merged] = mergeFreshStockRealtimeRows(mergeQuoteBaselineRows([current], refreshed), [current], { now });
      for (const quote of [fresh, merged]) {
        assert.equal(quote.dailyPnlLocked, true);
        assert.equal(quote.dailyPnlPrice, CLOSE);
        assert.equal(quote.dailyPnlPriceDate, EOD_DATE);
        assert.equal(quote.dailyPnlSource, 'eodhd-adjusted-close');
        assert.equal(quote.dailyPnlBaselineClose, 0);
        assert.equal(quote.dailyPnlBaselineDate, '');
        assert.equal(quote.dailyPnlChange, null);
        assert.equal(quote.dailyPnlChangePercent, null);
        const home = resolveHomeMarketDisplayMetrics(quote);
        assert.equal(home.price, CLOSE);
        assert.equal(home.changePercent, null);
        const summary = deriveInvestmentSummary({
          stockTrades: [{ id: 1, symbol: 'NVDA', side: 'buy', date: '2026-09-01', shares: 10, price: 200 }],
          watchlist: [quote],
        });
        assert.equal(resolveHoldingDisplayPrice(summary.activePositions[0]), CLOSE);
        near(summary.activePositions[0].marketValue, CLOSE * 10);
        assert.equal(summary.hasTodayPnl, false);
        assert.equal(summary.todayPnl, null);
        assert.equal(summary.activePositions[0].todayPnl, null);
      }
    });
  }
});
