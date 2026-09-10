import test from 'node:test';
import assert from 'node:assert/strict';
import { INDEX_QUOTE_CARDS } from '../server/realtime/indexQuotes.js';
import {
  INDEX_CHART_SOURCE, INDEX_CHART_TTL_MS, INDEX_CHART_FAILURE_BACKOFF_MS,
  INDEX_CHART_RATE_LIMIT_BACKOFF_MS, INDEX_CHART_TIMEOUT_MS, INDEX_CHART_MAX_POINTS,
  normalizeIndexChartQuote, fetchIndexChartQuote, createIndexChartQuoteLoader,
} from '../server/realtime/indexChartQuotes.js';

const START = Date.parse('2026-09-10T13:30:00Z');
const END = Date.parse('2026-09-10T20:00:00Z');
const QUOTE_AT = START + 58 * 60_000;
const NOW = QUOTE_AT + 10_000;
const SYMBOLS = ['^GSPC', '^NDX', '^DJI'];
const card = INDEX_QUOTE_CARDS[0];

function payloadFor(requestedCard = card, { quoteAt = QUOTE_AT, price = 6500, start = START, end = END, points } = {}) {
  const symbol = SYMBOLS[INDEX_QUOTE_CARDS.findIndex(item => item.ticker === requestedCard.ticker)];
  const rows = points || Array.from({ length: 58 }, (_, index) => ({ timestamp: start + index * 60_000, price: 6450 + index / 2 }));
  return {
    chart: {
      error: null,
      result: [{
        meta: {
          symbol, instrumentType: 'INDEX', currency: 'USD', exchangeTimezoneName: 'America/New_York',
          regularMarketPrice: price, regularMarketTime: quoteAt / 1000, previousClose: 6450,
          regularMarketDayHigh: 6502, regularMarketDayLow: 6435,
          currentTradingPeriod: { regular: { start: start / 1000, end: end / 1000 } },
        },
        timestamp: rows.map(point => point.timestamp / 1000),
        indicators: { quote: [{ close: rows.map(point => point.price) }] },
      }],
    },
  };
}

function tickFor(requestedCard = card, options = {}, fetchedAt = NOW) {
  return normalizeIndexChartQuote(payloadFor(requestedCard, options), requestedCard, { fetchedAt });
}

function httpError(statusCode) {
  return Object.assign(new Error('untrusted provider error'), { statusCode });
}

test('Yahoo chart preserves the three canonical index identities and real quote/curve timestamps', () => {
  INDEX_QUOTE_CARDS.forEach((requestedCard, index) => {
    const tick = tickFor(requestedCard);
    assert.equal(tick.ticker, requestedCard.ticker);
    assert.equal(tick.symbol, requestedCard.ticker);
    assert.equal(tick.displaySymbol, requestedCard.displaySymbol);
    assert.equal(tick.source, INDEX_CHART_SOURCE);
    assert.equal(tick.realtime, false);
    assert.equal(tick.realtimeStatus, 'delayed');
    assert.equal(tick.price, 6500);
    assert.equal(tick.previousClose, 6450);
    assert.equal(tick.change, 50);
    assert.equal(tick.changePercent, (50 / 6450) * 100);
    assert.equal(tick.timestamp, QUOTE_AT);
    assert.equal(tick.quoteAt, new Date(QUOTE_AT).toISOString());
    assert.equal(tick.fetchedAt, new Date(NOW).toISOString());
    assert.equal(tick.receivedAt, NOW);
    assert.equal(tick.intradayDate, '2026-09-10');
    assert.equal(tick.sessionStart, START);
    assert.equal(tick.sessionEnd, END);
    assert.equal(tick.intradayPoints.length, 59);
    assert.deepEqual(tick.intradayPoints.at(-1), { timestamp: QUOTE_AT, price: 6500 });
    assert.equal('intraday' in tick, false);
    assert.equal(payloadFor(requestedCard).chart.result[0].meta.symbol, SYMBOLS[index]);
    assert.ok(Object.isFrozen(tick) && Object.isFrozen(tick.intradayPoints) && Object.isFrozen(tick.intradayPoints[0]));
  });
});

test('normalization rejects wrong instruments, currencies, timezones, provider errors and unknown tickers', () => {
  for (const [field, value] of [['symbol', 'SPY'], ['symbol', '^NDX'], ['instrumentType', 'ETF'], ['currency', 'CAD'], ['exchangeTimezoneName', 'UTC']]) {
    const payload = payloadFor();
    payload.chart.result[0].meta[field] = value;
    assert.equal(normalizeIndexChartQuote(payload, card, { fetchedAt: NOW }), null, field);
  }
  for (const payload of [null, {}, { chart: { error: { code: 'Not Found' }, result: [] } }, { chart: { result: [] } }, { chart: { result: [payloadFor().chart.result[0], payloadFor().chart.result[0]] } }]) {
    assert.equal(normalizeIndexChartQuote(payload, card, { fetchedAt: NOW }), null);
  }
  assert.equal(normalizeIndexChartQuote(payloadFor(), { ticker: 'SPY.US' }, { fetchedAt: NOW }), null);
});

test('invalid, nonpositive or future quotes are rejected; absent previous close remains unknown', () => {
  for (const [field, value] of [['regularMarketPrice', null], ['regularMarketPrice', 0], ['regularMarketPrice', -1], ['regularMarketPrice', Infinity], ['regularMarketPrice', true], ['regularMarketTime', 0], ['regularMarketTime', (NOW + 1) / 1000], ['regularMarketTime', 'bad']]) {
    const payload = payloadFor();
    payload.chart.result[0].meta[field] = value;
    assert.equal(normalizeIndexChartQuote(payload, card, { fetchedAt: NOW }), null, `${field}=${value}`);
  }
  const payload = payloadFor();
  delete payload.chart.result[0].meta.previousClose;
  const unknown = normalizeIndexChartQuote(payload, card, { fetchedAt: NOW });
  assert.equal(unknown.previousClose, null);
  assert.equal(unknown.change, null);
  assert.equal(unknown.changePercent, null);
  payload.chart.result[0].meta.chartPreviousClose = 6400;
  assert.equal(normalizeIndexChartQuote(payload, card, { fetchedAt: NOW }).previousClose, 6400);
});

test('history keeps only positive observed points of the quote session, sorted and deduplicated', () => {
  const points = [
    { timestamp: START + 120_000, price: 6402 }, { timestamp: START, price: 6400 },
    { timestamp: START + 60_000, price: 6401 }, { timestamp: START + 60_000, price: 6401.5 },
    { timestamp: START - 1, price: 999 }, { timestamp: START - 86_400_000, price: 998 },
    { timestamp: NOW + 60_000, price: 997 }, { timestamp: QUOTE_AT + 1000, price: 996 },
    { timestamp: START + 180_000, price: null }, { timestamp: START + 240_000, price: 0 },
    { timestamp: START + 300_000, price: -1 }, { timestamp: START + 360_000, price: NaN },
    { timestamp: QUOTE_AT, price: 1 },
  ];
  const tick = tickFor(card, { points });
  assert.deepEqual(tick.intradayPoints, [
    { timestamp: START, price: 6400 }, { timestamp: START + 60_000, price: 6401.5 },
    { timestamp: START + 120_000, price: 6402 }, { timestamp: QUOTE_AT, price: 6500 },
  ]);
});

test('regular close endpoint is included; a later actual last trade is not appended outside the session', () => {
  const points = [{ timestamp: START, price: 6400 }, { timestamp: END, price: 6500 }, { timestamp: END + 1000, price: 6501 }];
  const tick = tickFor(card, { quoteAt: END + 1000, price: 6501, points }, END + 5000);
  assert.equal(tick.timestamp, END + 1000);
  assert.equal(tick.price, 6501);
  assert.deepEqual(tick.intradayPoints, points.slice(0, 2));
  const endpoint = tickFor(card, { quoteAt: END, points }, END + 5000);
  assert.deepEqual(endpoint.intradayPoints.at(-1), { timestamp: END, price: 6500 });
});

test('completed sessions resolve through tradingPeriods instead of borrowing the next session', () => {
  for (const periods of [[[{ start: START / 1000, end: END / 1000 }]], { regular: [[{ start: START / 1000, end: END / 1000 }]] }]) {
    const payload = payloadFor();
    payload.chart.result[0].meta.currentTradingPeriod.regular = { start: (START + 86_400_000) / 1000, end: (END + 86_400_000) / 1000 };
    payload.chart.result[0].meta.tradingPeriods = periods;
    const tick = normalizeIndexChartQuote(payload, card, { fetchedAt: NOW });
    assert.equal(tick.sessionStart, START);
    assert.equal(tick.intradayPoints.length, 59);
  }
});

test('missing matching session retains a real quote without invented hours or an old-day curve', () => {
  const payload = payloadFor();
  payload.chart.result[0].meta.currentTradingPeriod.regular = { start: (START + 86_400_000) / 1000, end: (END + 86_400_000) / 1000 };
  const tick = normalizeIndexChartQuote(payload, card, { fetchedAt: NOW });
  assert.equal(tick.price, 6500);
  assert.equal(tick.intradayDate, '2026-09-10');
  assert.equal(tick.sessionStart, null);
  assert.equal(tick.sessionEnd, null);
  assert.deepEqual(tick.intradayPoints, []);
  const previousDayRows = [{ timestamp: START - 86_400_000, price: 1 }, { timestamp: END - 86_400_000, price: 2 }];
  assert.deepEqual(tickFor(card, { points: previousDayRows }).intradayPoints, [{ timestamp: QUOTE_AT, price: 6500 }]);
});

test('chart normalization follows actual ET/DST session timestamps and does not synthesize UTC hours', () => {
  const start = Date.parse('2026-12-10T14:30:00Z');
  const end = Date.parse('2026-12-10T21:00:00Z');
  const quoteAt = start + 120_000;
  const tick = tickFor(card, { start, end, quoteAt, points: [{ timestamp: start, price: 6449 }] }, quoteAt + 1000);
  assert.equal(tick.intradayDate, '2026-12-10');
  assert.equal(tick.sessionStart, start);
  assert.deepEqual(tick.intradayPoints[0], { timestamp: start, price: 6449 });
});

test('history is bounded to 400 real samples while preserving endpoints', () => {
  const points = Array.from({ length: 781 }, (_, index) => ({ timestamp: START + index * 30_000, price: 6400 + index }));
  const tick = tickFor(card, { quoteAt: END, points, price: 7180 }, END + 1000);
  assert.equal(tick.intradayPoints.length, INDEX_CHART_MAX_POINTS);
  assert.deepEqual(tick.intradayPoints[0], points[0]);
  assert.deepEqual(tick.intradayPoints.at(-1), points.at(-1));
  const real = new Map(points.map(point => [point.timestamp, point.price]));
  tick.intradayPoints.forEach((point, index) => {
    assert.equal(real.get(point.timestamp), point.price);
    if (index) assert.ok(point.timestamp > tick.intradayPoints[index - 1].timestamp);
  });
});

test('fetch uses only the three fixed public Yahoo chart routes with no EODHD key or alternate asset', async () => {
  const calls = [];
  for (const requestedCard of INDEX_QUOTE_CARDS) {
    await fetchIndexChartQuote({ ...requestedCard, symbol: 'SPY', displaySymbol: 'SPY' }, {
      now: () => NOW,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => payloadFor(requestedCard) };
      },
    });
  }
  calls.forEach(({ url, options }, index) => {
    assert.equal(url.origin, 'https://query1.finance.yahoo.com');
    assert.equal(url.pathname, `/v8/finance/chart/${encodeURIComponent(SYMBOLS[index])}`);
    assert.deepEqual([...url.searchParams], [['range', '1d'], ['interval', '1m'], ['includePrePost', 'false']]);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['User-Agent'], 'boduan-tracker/1.0 market-chart');
    assert.ok(options.signal instanceof AbortSignal);
  });
  await assert.rejects(fetchIndexChartQuote({ ticker: 'SPY.US' }, { fetchImpl: () => assert.fail('unsupported symbols must not fetch') }), { statusCode: 400 });
  assert.equal(INDEX_CHART_TIMEOUT_MS, 8000);
});

test('fetch reports bounded generic HTTP, network, malformed JSON and unverified payload failures', async () => {
  for (const status of [429, 401, 500]) {
    await assert.rejects(fetchIndexChartQuote(card, { fetchImpl: async () => ({ ok: false, status }) }), { statusCode: status, message: `Index chart HTTP ${status}` });
  }
  await assert.rejects(fetchIndexChartQuote(card, { fetchImpl: async () => { throw new Error('secret URL'); } }), { statusCode: 502, message: 'Index chart request failed' });
  await assert.rejects(fetchIndexChartQuote(card, { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('secret payload'); } }) }), { statusCode: 502, message: 'Invalid index chart response' });
  await assert.rejects(fetchIndexChartQuote(card, { fetchImpl: async () => ({ ok: true, json: async () => ({ chart: { error: { code: 'provider-error' } } }) }) }), { statusCode: 502, message: 'Unverified index chart response' });
});

test('eight-second request deadline also bounds a body that never completes and aborts the request', async () => {
  let signal;
  await assert.rejects(fetchIndexChartQuote(card, {
    timeoutMs: 5,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return { ok: true, json: () => new Promise(() => {}) };
    },
  }), { statusCode: 504 });
  assert.equal(signal.aborted, true);
});

test('loader shares one in-flight three-index batch and caches successful quotes for sixty seconds', async () => {
  let at = NOW;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const calls = [];
  const loader = createIndexChartQuoteLoader({ now: () => at, fetchQuote: async requestedCard => {
    calls.push(requestedCard.ticker);
    await barrier;
    return tickFor(requestedCard, {}, at);
  } });
  const first = loader();
  const second = loader();
  await Promise.resolve();
  assert.equal(calls.length, 3);
  release();
  const [one, two] = await Promise.all([first, second]);
  assert.deepEqual(one, two);
  assert.equal(one.ticks.length, 3);
  assert.equal(one.status, 'delayed');
  assert.equal(one.source, 'YAHOO_CHART');
  assert.equal(one.realtime, false);
  at += INDEX_CHART_TTL_MS - 1;
  await loader();
  assert.equal(calls.length, 3);
  at += 1;
  await loader();
  assert.equal(calls.length, 6);
});

test('partial initial failures stay missing and retry only the failed ticker after fifteen seconds', async () => {
  let at = NOW;
  let failed = true;
  const calls = [];
  const loader = createIndexChartQuoteLoader({ now: () => at, fetchQuote: async requestedCard => {
    calls.push(requestedCard.ticker);
    if (requestedCard === card && failed) throw httpError(503);
    return tickFor(requestedCard, {}, at);
  } });
  const partial = await loader();
  assert.equal(partial.status, 'stale');
  assert.equal(partial.ticks.length, 2);
  assert.deepEqual(partial.errors, [{ ticker: card.ticker, statusCode: 503, error: 'Index chart HTTP 503' }]);
  at += INDEX_CHART_FAILURE_BACKOFF_MS - 1;
  await loader();
  assert.equal(calls.length, 3);
  failed = false;
  at += 1;
  const recovered = await loader();
  assert.equal(calls.length, 4);
  assert.equal(calls.at(-1), card.ticker);
  assert.equal(recovered.ticks.length, 3);
  assert.deepEqual(recovered.errors, []);
});

test('ordinary refresh failure retains price/time/history as stale and valid same-time response clears failure', async () => {
  let at = NOW;
  let failed = false;
  const loader = createIndexChartQuoteLoader({ now: () => at, fetchQuote: async requestedCard => {
    if (failed) throw httpError(502);
    return tickFor(requestedCard, {}, at);
  } });
  const before = await loader();
  at += INDEX_CHART_TTL_MS;
  failed = true;
  const stale = await loader();
  assert.equal(stale.status, 'stale');
  stale.ticks.forEach((tick, index) => {
    assert.equal(tick.price, before.ticks[index].price);
    assert.equal(tick.timestamp, before.ticks[index].timestamp);
    assert.deepEqual(tick.intradayPoints, before.ticks[index].intradayPoints);
    assert.equal(tick.realtimeStatus, 'stale');
    assert.equal(tick.fetchError, 'Index chart HTTP 502');
  });
  failed = false;
  at += INDEX_CHART_FAILURE_BACKOFF_MS;
  const recovered = await loader();
  assert.equal(recovered.status, 'delayed');
  assert.deepEqual(recovered.errors, []);
  assert.equal('fetchError' in recovered.ticks[0], false);
  assert.equal(recovered.ticks[0].fetchedAt, new Date(at).toISOString());
  at += 31 * 60_000;
  assert.equal((await loader()).status, 'stale', 'successful retrieval does not turn an old quote live');
});

test('429 pauses every index for five minutes without clearing previously accepted quotes', async () => {
  let at = NOW;
  let limited = false;
  let calls = 0;
  const loader = createIndexChartQuoteLoader({ now: () => at, fetchQuote: async requestedCard => {
    calls += 1;
    if (limited && requestedCard === card) throw httpError(429);
    return tickFor(requestedCard, {}, at);
  } });
  await loader();
  at += INDEX_CHART_TTL_MS;
  limited = true;
  const stale = await loader();
  assert.equal(stale.ticks.length, 3);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.retryAfterAt, at + INDEX_CHART_RATE_LIMIT_BACKOFF_MS);
  assert.equal(calls, 6);
  at += INDEX_CHART_RATE_LIMIT_BACKOFF_MS - 1;
  await loader();
  assert.equal(calls, 6);
  limited = false;
  at += 1;
  const recovered = await loader();
  assert.equal(calls, 9);
  assert.equal(recovered.retryAfterAt, null);
  assert.deepEqual(recovered.errors, []);
});

test('empty initial failures are unavailable rather than zero-valued quote placeholders', async () => {
  const loader = createIndexChartQuoteLoader({ now: () => NOW, fetchQuote: async () => { throw httpError(502); } });
  const result = await loader();
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.ticks, []);
  assert.equal(result.errors.length, 3);
});

test('older, future and same-timestamp conflicting financial quotes cannot replace cache', async () => {
  for (const mutation of [
    tick => ({ ...tick, timestamp: tick.timestamp - 1 }),
    tick => ({ ...tick, timestamp: NOW + INDEX_CHART_TTL_MS + 1 }),
    tick => ({ ...tick, price: tick.price + 1 }),
    tick => ({ ...tick, previousClose: tick.previousClose + 1 }),
    tick => ({ ...tick, change: tick.change + 1 }),
    tick => ({ ...tick, changePercent: tick.changePercent + 1 }),
  ]) {
    let at = NOW;
    let corrupt = false;
    const loader = createIndexChartQuoteLoader({ now: () => at, fetchQuote: async requestedCard => {
      const tick = tickFor(requestedCard, {}, at);
      return corrupt ? mutation(tick) : tick;
    } });
    const before = await loader();
    at += INDEX_CHART_TTL_MS;
    corrupt = true;
    const after = await loader();
    assert.equal(after.status, 'stale');
    assert.equal(after.errors.length, 3);
    after.ticks.forEach((tick, index) => {
      assert.equal(tick.timestamp, before.ticks[index].timestamp);
      assert.equal(tick.price, before.ticks[index].price);
      assert.equal(tick.previousClose, before.ticks[index].previousClose);
      assert.deepEqual(tick.intradayPoints, before.ticks[index].intradayPoints);
    });
  }
});

test('same-time refresh can enrich but cannot erase or revise existing accepted history', async () => {
  let at = NOW;
  let points = [{ timestamp: START, price: 6400 }];
  const loader = createIndexChartQuoteLoader({ now: () => at, fetchQuote: async requestedCard => tickFor(requestedCard, { points }, at) });
  const first = await loader();
  assert.equal(first.ticks[0].intradayPoints.length, 2);
  points = [{ timestamp: START, price: 1 }, { timestamp: START + 60_000, price: 6401 }];
  at += INDEX_CHART_TTL_MS;
  const richer = await loader();
  assert.deepEqual(richer.ticks[0].intradayPoints, [
    { timestamp: START, price: 6400 }, { timestamp: START + 60_000, price: 6401 }, { timestamp: QUOTE_AT, price: 6500 },
  ]);
  points = [];
  at += INDEX_CHART_TTL_MS;
  assert.deepEqual((await loader()).ticks[0].intradayPoints, richer.ticks[0].intradayPoints);
});

test('same-time quote-only cache can receive verified session history on a later successful fetch', async () => {
  let at = NOW;
  let withSession = false;
  const loader = createIndexChartQuoteLoader({ now: () => at, fetchQuote: async requestedCard => {
    const payload = payloadFor(requestedCard);
    if (!withSession) delete payload.chart.result[0].meta.currentTradingPeriod;
    return normalizeIndexChartQuote(payload, requestedCard, { fetchedAt: at });
  } });
  assert.deepEqual((await loader()).ticks[0].intradayPoints, []);
  withSession = true;
  at += INDEX_CHART_TTL_MS;
  const enriched = await loader();
  assert.equal(enriched.ticks[0].timestamp, QUOTE_AT);
  assert.equal(enriched.ticks[0].intradayPoints.length, 59);
});

test('newer quote preserves omitted same-session history and accepts real revised minute bars', async () => {
  let at = NOW;
  let quoteAt = QUOTE_AT;
  let points = [{ timestamp: START, price: 6400 }, { timestamp: START + 60_000, price: 6401 }];
  const loader = createIndexChartQuoteLoader({ now: () => at, fetchQuote: async requestedCard => tickFor(requestedCard, { quoteAt, points }, at) });
  await loader();
  at += INDEX_CHART_TTL_MS;
  quoteAt += 60_000;
  points = [{ timestamp: START + 60_000, price: 6402 }];
  const newer = await loader();
  assert.deepEqual(newer.ticks[0].intradayPoints, [
    { timestamp: START, price: 6400 }, { timestamp: START + 60_000, price: 6402 },
    { timestamp: QUOTE_AT, price: 6500 }, { timestamp: quoteAt, price: 6500 },
  ]);
  at += INDEX_CHART_TTL_MS;
  quoteAt += 60_000;
  points = [];
  assert.equal((await loader()).ticks[0].intradayPoints.length, 5);
});

test('new ET session never inherits yesterday history even when today has only a real quote', async () => {
  let at = NOW;
  let options = {};
  const loader = createIndexChartQuoteLoader({ now: () => at, fetchQuote: async requestedCard => tickFor(requestedCard, options, at) });
  await loader();
  at += 86_400_000;
  options = { quoteAt: QUOTE_AT + 86_400_000, start: START + 86_400_000, end: END + 86_400_000, points: [{ timestamp: START, price: 1 }] };
  const today = await loader();
  assert.equal(today.ticks[0].intradayDate, '2026-09-11');
  assert.deepEqual(today.ticks[0].intradayPoints, [{ timestamp: options.quoteAt, price: 6500 }]);
});
