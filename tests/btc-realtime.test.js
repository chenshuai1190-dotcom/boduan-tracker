import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeBtcRestQuote,
  normalizeBtcTick,
  parseEodhdProviderStatus,
  sanitizeEodhdKey,
} from '../server/realtime/btc.js';
import {
  BTC_REST_FALLBACK_TTL_MS,
  BTC_WS_SNAPSHOT_MAX_AGE_MS,
  buildBtcRealtimeSnapshot,
  createBtcRestFallbackLoader,
  fetchBtcRestTick,
  isEligibleBtcWsSnapshotTick,
  resolveBtcClientStatus,
} from '../server/realtime/btcRelay.js';
import {
  BTC_REALTIME_PROTOCOL,
  INDICES_REALTIME_PROTOCOL,
  STOCKS_REALTIME_PROTOCOL,
  extractRealtimeAccessToken,
  parseWebSocketProtocols,
  selectRealtimeProtocol,
} from '../server/realtime/auth.js';
import { INDEX_REALTIME_SYMBOLS, normalizeIndexTick } from '../server/realtime/indices.js';
import { normalizeStockTick, parseStockRealtimeSymbolsParam } from '../server/realtime/stocks.js';
import {
  applyBtcTickToMarketCard,
  applyBtcTickToMarketCards,
  createBtcPlaceholderMarketCard,
  isBtcMarketCard,
  resolveBtcSnapshotRealtimeStatus,
} from '../src/lib/btcRealtime.js';
import {
  applyIndexTickToMarketCards,
  createIndexPlaceholderMarketCards,
  mergeIndexCardsWithPlaceholders,
  mergeIndexRestCardsIntoMarketCards,
  shouldAppendIndexIntraday,
} from '../src/lib/indexRealtime.js';
import {
  applyStockTickToQuoteRows,
  buildStockRealtimeSymbolsKey,
  canStartStockRealtime,
  isFreshStockRealtimeTick,
  mergeFreshStockRealtimeRows,
  mergeStockSnapshotPollRequest,
  mergeStockTicksIntoQuoteRows,
  selectStockRealtimeSymbols,
  shouldApplyStockSnapshotTick,
  shouldPollStockRealtimeSnapshot,
} from '../src/lib/stockRealtime.js';

test('normalizeBtcTick accepts EODHD crypto WebSocket fields', () => {
  const tick = normalizeBtcTick({
    s: 'BTC-USD',
    p: 62554.42,
    q: 0.145,
    dc: 0.02,
    dd: 12.52,
    t: 1783000000123,
  }, { receivedAt: 1783000000999 });

  assert.equal(tick.type, 'btc_tick');
  assert.equal(tick.symbol, 'BTC-USD');
  assert.equal(tick.ticker, 'BTC-USD.CC');
  assert.equal(tick.displaySymbol, 'BTCUSD');
  assert.equal(tick.price, 62554.42);
  assert.equal(tick.quantity, 0.145);
  assert.equal(tick.changePercent, 0.02);
  assert.equal(tick.change, 12.52);
  assert.equal(tick.timestamp, 1783000000123);
  assert.equal(tick.source, 'EODHD_WS');
});

test('normalizeBtcTick ignores non-BTC and invalid messages', () => {
  assert.equal(normalizeBtcTick({ s: 'ETH-USD', p: 2874.12 }), null);
  assert.equal(normalizeBtcTick({ s: 'BTC-USD', p: 0 }), null);
  assert.equal(normalizeBtcTick('not-json'), null);
});

test('sanitizeEodhdKey removes invisible whitespace', () => {
  assert.equal(sanitizeEodhdKey('  abc\u200B123\n'), 'abc123');
});

test('BTC provider status parser identifies upstream HTTP-style failures', () => {
  assert.deepEqual(parseEodhdProviderStatus(JSON.stringify({
    status_code: 500,
    message: 'Internal error. Try again later',
  })), {
    statusCode: 500,
    message: 'Internal error. Try again later',
    isError: true,
  });
  assert.deepEqual(parseEodhdProviderStatus({ status_code: 200, message: 'Authorized' }), {
    statusCode: 200,
    message: 'Authorized',
    isError: false,
  });
  assert.equal(parseEodhdProviderStatus({ s: 'BTC-USD', p: 62554.42 }), null);
});

test('normalizeBtcRestQuote creates a fallback tick and seeds a two-point curve', () => {
  const tick = normalizeBtcRestQuote({
    code: 'BTC-USD.CC',
    timestamp: 1784901840,
    close: 63973.94140625,
    previousClose: 65044.814209441,
    change: -1070.8728,
    change_p: -1.6464,
    volume: 25671000064,
  }, { receivedAt: 1784901840999 });

  assert.equal(tick.type, 'btc_tick');
  assert.equal(tick.symbol, 'BTC-USD');
  assert.equal(tick.ticker, 'BTC-USD.CC');
  assert.equal(tick.displaySymbol, 'BTCUSD');
  assert.equal(tick.price, 63973.94140625);
  assert.equal(tick.previousClose, 65044.814209441);
  assert.equal(tick.change, -1070.8728);
  assert.equal(tick.changePercent, -1.6464);
  assert.deepEqual(tick.intraday, [65044.814209441, 63973.94140625]);
  assert.equal(tick.timestamp, 1784901840000);
  assert.equal(tick.receivedAt, 1784901840999);
  assert.equal(tick.source, 'EODHD_REST');
});

test('fetchBtcRestTick keeps the key server-side and normalizes the provider response', async () => {
  let requestedUrl = '';
  const tick = await fetchBtcRestTick({
    eodhdKey: ' demo\u200B ',
    receivedAt: 1784901840999,
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      assert.equal(options.cache, 'no-store');
      assert.equal(options.headers.Accept, 'application/json');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 'BTC-USD.CC',
          timestamp: 1784901840,
          close: 63973.94140625,
          previousClose: 65044.814209441,
          change: -1070.8728,
          change_p: -1.6464,
        }),
      };
    },
  });

  const parsedUrl = new URL(requestedUrl);
  assert.equal(parsedUrl.pathname, '/api/real-time/BTC-USD.CC');
  assert.equal(parsedUrl.searchParams.get('api_token'), 'demo');
  assert.equal(parsedUrl.searchParams.get('fmt'), 'json');
  assert.equal(tick.source, 'EODHD_REST');
  assert.equal(JSON.stringify(tick).includes('demo'), false);

  await assert.rejects(
    fetchBtcRestTick({
      eodhdKey: 'private-key',
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    (error) => {
      assert.equal(error.message, 'EODHD BTC REST 请求失败: HTTP 503');
      assert.equal(error.message.includes('private-key'), false);
      return true;
    },
  );
});

test('BTC REST fallback loader deduplicates concurrent requests and caches for a short TTL', async () => {
  let now = 100_000;
  let calls = 0;
  let resolveFetch;
  const firstTick = { price: 63973.94, source: 'EODHD_REST' };
  const secondTick = { price: 64010.12, source: 'EODHD_REST' };
  const loader = createBtcRestFallbackLoader({
    now: () => now,
    fetchTick: async () => {
      calls += 1;
      if (calls === 1) {
        return new Promise((resolve) => {
          resolveFetch = () => resolve(firstTick);
        });
      }
      return secondTick;
    },
  });

  const pendingA = loader({ eodhdKey: 'server-only' });
  const pendingB = loader({ eodhdKey: 'server-only' });
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveFetch();
  assert.equal(await pendingA, firstTick);
  assert.equal(await pendingB, firstTick);

  now += BTC_REST_FALLBACK_TTL_MS - 1;
  assert.equal(await loader({ eodhdKey: 'server-only' }), firstTick);
  assert.equal(calls, 1);

  now += 2;
  assert.equal(await loader({ eodhdKey: 'server-only' }), secondTick);
  assert.equal(calls, 2);
});

test('BTC REST fallback loader does not cache or retain a failed request', async () => {
  let calls = 0;
  const recoveredTick = { price: 64123.45, source: 'EODHD_REST' };
  const loader = createBtcRestFallbackLoader({
    fetchTick: async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary provider failure');
      return recoveredTick;
    },
  });

  const failedA = loader({ eodhdKey: 'server-only' });
  const failedB = loader({ eodhdKey: 'server-only' });
  await assert.rejects(failedA, /temporary provider failure/);
  await assert.rejects(failedB, /temporary provider failure/);
  assert.equal(calls, 1);

  assert.equal(await loader({ eodhdKey: 'server-only' }), recoveredTick);
  assert.equal(await loader({ eodhdKey: 'server-only' }), recoveredTick);
  assert.equal(calls, 2);
});

test('BTC snapshot only lets a fresh tick on a live upstream outrank REST fallback', () => {
  const now = 1784901840999;
  const staleWsTick = {
    price: 64200,
    receivedAt: now - 20_000,
    source: 'EODHD_WS',
  };
  const freshWsTick = {
    price: 64210,
    receivedAt: now - 5_000,
    source: 'EODHD_WS',
  };
  const restTick = {
    price: 63973.94,
    previousClose: 65044.81,
    intraday: [65044.81, 63973.94],
    source: 'EODHD_REST',
  };

  assert.equal(BTC_WS_SNAPSHOT_MAX_AGE_MS, 15_000);
  assert.equal(isEligibleBtcWsSnapshotTick(staleWsTick, {
    upstreamStatus: 'live',
    now,
  }), false);
  assert.equal(isEligibleBtcWsSnapshotTick(freshWsTick, {
    upstreamStatus: 'reconnecting',
    now,
  }), false);
  assert.equal(isEligibleBtcWsSnapshotTick(freshWsTick, {
    upstreamStatus: 'live',
    now,
  }), true);

  const staleSnapshot = buildBtcRealtimeSnapshot({
    wsTick: staleWsTick,
    restTick,
    upstreamStatus: 'live',
    receivedAt: now,
  });
  assert.equal(staleSnapshot.status, 'fallback');
  assert.equal(staleSnapshot.source, 'EODHD_REST');
  assert.equal(staleSnapshot.tick, restTick);

  const disconnectedSnapshot = buildBtcRealtimeSnapshot({
    wsTick: freshWsTick,
    restTick,
    upstreamStatus: 'reconnecting',
    receivedAt: now,
  });
  assert.equal(disconnectedSnapshot.status, 'fallback');
  assert.equal(disconnectedSnapshot.source, 'EODHD_REST');
  assert.equal(disconnectedSnapshot.tick, restTick);

  const liveSnapshot = buildBtcRealtimeSnapshot({
    wsTick: freshWsTick,
    restTick,
    upstreamStatus: 'live',
    receivedAt: now,
  });
  assert.equal(liveSnapshot.status, 'live');
  assert.equal(liveSnapshot.source, 'EODHD_WS');
  assert.equal(liveSnapshot.tick, freshWsTick);
});

test('BTC client status never reports live when the latest WebSocket tick is stale', () => {
  const now = 1784901840999;
  const freshTick = { receivedAt: now - 5_000 };
  const staleTick = { receivedAt: now - 20_000 };

  assert.equal(resolveBtcClientStatus({
    upstreamStatus: 'live',
    lastTick: freshTick,
    now,
  }), 'live');
  assert.equal(resolveBtcClientStatus({
    upstreamStatus: 'live',
    lastTick: staleTick,
    now,
  }), 'stale');
  assert.equal(resolveBtcClientStatus({
    upstreamStatus: 'live',
    lastTick: null,
    now,
  }), 'stale');
  assert.equal(resolveBtcClientStatus({
    upstreamStatus: 'reconnecting',
    lastTick: freshTick,
    now,
  }), 'reconnecting');
});

test('realtime auth extracts Supabase token from WebSocket protocol', () => {
  const req = {
    headers: {
      'sec-websocket-protocol': `${BTC_REALTIME_PROTOCOL}, supabase.test.jwt.token`,
    },
  };

  assert.deepEqual(parseWebSocketProtocols(req.headers['sec-websocket-protocol']), [
    BTC_REALTIME_PROTOCOL,
    'supabase.test.jwt.token',
  ]);
  assert.equal(extractRealtimeAccessToken(req), 'test.jwt.token');
  assert.equal(selectRealtimeProtocol(new Set([BTC_REALTIME_PROTOCOL, 'supabase.test.jwt.token'])), BTC_REALTIME_PROTOCOL);
  assert.equal(selectRealtimeProtocol(new Set([INDICES_REALTIME_PROTOCOL, 'supabase.test.jwt.token'])), INDICES_REALTIME_PROTOCOL);
  assert.equal(selectRealtimeProtocol(new Set([STOCKS_REALTIME_PROTOCOL, 'supabase.test.jwt.token'])), STOCKS_REALTIME_PROTOCOL);
});

test('realtime auth accepts Authorization header for non-browser clients', () => {
  const req = {
    headers: {
      authorization: 'Bearer terminal-token',
      'sec-websocket-protocol': `${BTC_REALTIME_PROTOCOL}, supabase.browser-token`,
    },
  };

  assert.equal(extractRealtimeAccessToken(req), 'terminal-token');
});

test('BTC realtime tick does not create a standalone first-paint card', () => {
  const tick = {
    price: 62521.14,
    change: 940,
    changePercent: 1.53,
    timestamp: 1783000000123,
    receivedAt: 1783000000456,
    source: 'EODHD_WS',
  };

  assert.deepEqual(applyBtcTickToMarketCards([], tick, 'live'), []);

  const cards = [
    { ticker: 'GSPC.INDX', displaySymbol: '.SPX', price: 7483.24 },
    { ticker: 'NDX.INDX', displaySymbol: '.NDX', price: 29329.21 },
    { ticker: 'DJI.INDX', displaySymbol: '.DJI', price: 52900.07 },
    { ticker: 'BTC-USD.CC', displaySymbol: 'BTCUSD', price: 62000, intraday: [61800, 62000] },
  ];
  const updated = applyBtcTickToMarketCards(cards, tick, 'live');

  assert.equal(updated.length, 4);
  assert.equal(updated[0], cards[0]);
  assert.equal(updated[3].ticker, 'BTC-USD.CC');
  assert.equal(updated[3].price, 62521.14);
  assert.equal(updated[3].realtimeStatus, 'live');
  assert.equal(updated[3].realtimeAt, 1783000000123);
  assert.equal(updated[3].realtimeReceivedAt, 1783000000456);
  assert.deepEqual(updated[3].intraday, [61800, 62000, 62521.14]);
});

test('BTC placeholder keeps the fourth home market card reserved before first tick', () => {
  const placeholder = createBtcPlaceholderMarketCard('connecting');

  assert.equal(isBtcMarketCard(placeholder), true);
  assert.equal(placeholder.ticker, 'BTC-USD.CC');
  assert.equal(placeholder.displaySymbol, 'BTCUSD');
  assert.equal(placeholder.price, null);
  assert.equal(placeholder.changePercent, null);
  assert.deepEqual(placeholder.intraday, []);
  assert.equal(placeholder.realtimeStatus, 'connecting');
});

test('BTC first REST fallback seeds the sparkline from snapshot intraday data', () => {
  const card = applyBtcTickToMarketCard(null, {
    price: 62000,
    previousClose: 61000,
    intraday: [null, 0, 61000, '61500', 62000],
    source: 'EODHD_REST',
    timestamp: 1783000000123,
  }, 'fallback');

  assert.equal(card.price, 62000);
  assert.equal(card.realtime, false);
  assert.equal(card.realtimeStatus, 'fallback');
  assert.deepEqual(card.intraday, [61000, 61500, 62000]);
});

test('BTC first REST fallback uses previous close when intraday history is unavailable', () => {
  const card = applyBtcTickToMarketCard(null, {
    price: 62000,
    previousClose: 61000,
    source: 'EODHD_REST',
  }, 'fallback');

  assert.deepEqual(card.intraday, [61000, 62000]);
});

test('BTC WebSocket tick immediately replaces fallback status and extends the curve', () => {
  const fallbackCard = applyBtcTickToMarketCard(null, {
    price: 62000,
    previousClose: 61000,
    source: 'EODHD_REST',
  }, 'fallback');
  const liveCard = applyBtcTickToMarketCard(fallbackCard, {
    price: 62100,
    source: 'EODHD_WS',
    timestamp: 1783000000123,
  }, 'live');

  assert.equal(liveCard.price, 62100);
  assert.equal(liveCard.realtime, true);
  assert.equal(liveCard.realtimeStatus, 'live');
  assert.deepEqual(liveCard.intraday, [61000, 62000, 62100]);
});

test('BTC snapshot status follows both server status and data source', () => {
  assert.equal(resolveBtcSnapshotRealtimeStatus({
    status: 'live',
    source: 'EODHD_WS',
    tick: { source: 'EODHD_WS' },
  }), 'live');
  assert.equal(resolveBtcSnapshotRealtimeStatus({
    status: 'live',
    source: 'EODHD_WS',
    tick: { source: 'EODHD_REST' },
  }), 'fallback');
  assert.equal(resolveBtcSnapshotRealtimeStatus({
    status: 'live',
    source: 'EODHD_REST',
    tick: { source: 'EODHD_WS' },
  }), 'fallback');
  assert.equal(resolveBtcSnapshotRealtimeStatus({
    status: 'fallback',
    source: 'EODHD_WS',
    tick: { source: 'EODHD_WS' },
  }), 'fallback');
  assert.equal(resolveBtcSnapshotRealtimeStatus({
    status: 'reconnecting',
    source: 'EODHD_WS',
    tick: { source: 'EODHD_WS' },
  }), 'fallback');
});

test('index placeholders keep the first three home market cards reserved before REST data', () => {
  const placeholders = createIndexPlaceholderMarketCards('connecting');

  assert.equal(placeholders.length, 3);
  assert.deepEqual(placeholders.map((card) => card.displaySymbol), ['.SPX', '.NDX', '.DJI']);
  assert.deepEqual(placeholders.map((card) => card.price), [null, null, null]);
  assert.deepEqual(placeholders.map((card) => card.intraday), [[], [], []]);

  const merged = mergeIndexCardsWithPlaceholders([
    { ticker: 'DJI.INDX', displaySymbol: '.DJI', price: 53000, intraday: [52900, 53000] },
  ], 'connecting');

  assert.equal(merged.length, 3);
  assert.equal(merged[0].displaySymbol, '.SPX');
  assert.equal(merged[0].price, null);
  assert.equal(merged[2].displaySymbol, '.DJI');
  assert.equal(merged[2].price, 53000);
});

test('EODHD REST index cards seed and extend local sparkline samples without Yahoo chart data', () => {
  const restCards = [
    { ticker: 'GSPC.INDX', displaySymbol: '.SPX', price: 7488, previousClose: 7537.43, change: -49.43, changePercent: -0.66, intraday: [], source: 'EODHD' },
    { ticker: 'NDX.INDX', displaySymbol: '.NDX', price: 29033, previousClose: 29697.87, change: -664.87, changePercent: -2.24, intraday: [], source: 'EODHD' },
    { ticker: 'DJI.INDX', displaySymbol: '.DJI', price: 52955, previousClose: 53055.91, change: -100.91, changePercent: -0.19, intraday: [], source: 'EODHD' },
  ];

  const seeded = mergeIndexRestCardsIntoMarketCards([], restCards, 'fallback');
  assert.equal(seeded.length, 3);
  assert.deepEqual(seeded[0].intraday, [7537.43, 7488]);
  assert.equal(seeded[0].source, 'EODHD');
  assert.equal(seeded[0].realtime, false);

  const next = mergeIndexRestCardsIntoMarketCards(seeded, [
    { ticker: 'GSPC.INDX', displaySymbol: '.SPX', price: 7486, previousClose: 7537.43, change: -51.43, changePercent: -0.68, intraday: [], source: 'EODHD' },
  ], 'fallback');
  assert.deepEqual(next[0].intraday, [7537.43, 7488, 7486]);
  assert.deepEqual(next.map((card) => card.displaySymbol), ['.SPX', '.NDX', '.DJI']);
});

test('EODHD REST index cards use full intraday history and lock static curves outside regular session', () => {
  assert.equal(shouldAppendIndexIntraday('regular'), true);
  assert.equal(shouldAppendIndexIntraday('postmarket'), false);
  assert.equal(shouldAppendIndexIntraday('premarket'), false);
  assert.equal(shouldAppendIndexIntraday('closed'), false);

  const withHistory = mergeIndexRestCardsIntoMarketCards([], [
    { ticker: 'GSPC.INDX', displaySymbol: '.SPX', price: 7503, previousClose: 7537, changePercent: -0.45, intraday: [7537, 7528, 7518, 7503], source: 'EODHD' },
  ], 'fallback', { appendIntraday: false });
  assert.deepEqual(withHistory[0].intraday, [7537, 7528, 7518, 7503]);
  assert.equal(withHistory[0].intradayMode, 'session-history');

  const staticFallback = mergeIndexRestCardsIntoMarketCards([], [
    { ticker: 'GSPC.INDX', displaySymbol: '.SPX', price: 7503, previousClose: 7537, dayHigh: 7540, dayLow: 7498, changePercent: -0.45, intraday: [], source: 'EODHD' },
  ], 'fallback', { appendIntraday: false });
  assert.equal(staticFallback[0].intraday.length, 14);
  assert.equal(staticFallback[0].intraday[0], 7537);
  assert.equal(staticFallback[0].intraday.at(-1), 7503);
  assert.equal(staticFallback[0].intradayMode, 'static-locked');

  const preservedHistory = mergeIndexRestCardsIntoMarketCards(withHistory, [
    { ticker: 'GSPC.INDX', displaySymbol: '.SPX', price: 7498, previousClose: 7537, changePercent: -0.52, intraday: [], source: 'EODHD' },
  ], 'fallback', { appendIntraday: false });
  assert.equal(preservedHistory[0].price, 7498);
  assert.deepEqual(preservedHistory[0].intraday, [7537, 7528, 7518, 7503]);
  assert.equal(preservedHistory[0].intradayMode, 'session-history');
});

test('normalizeIndexTick accepts EODHD index WebSocket fields', () => {
  assert.equal(INDEX_REALTIME_SYMBOLS, 'GSPC.INDX,NDX.INDX,DJI.INDX');

  const tick = normalizeIndexTick({
    s: 'GSPC.INDX',
    p: 7489.12,
    dc: 0.35,
    dd: 26.08,
    ms: 'open',
    t: 1783000000123,
  }, { receivedAt: 1783000000999 });

  assert.equal(tick.type, 'index_tick');
  assert.equal(tick.symbol, 'GSPC.INDX');
  assert.equal(tick.ticker, 'GSPC.INDX');
  assert.equal(tick.displaySymbol, '.SPX');
  assert.equal(tick.name, '标普500');
  assert.equal(tick.price, 7489.12);
  assert.equal(tick.changePercent, 0.35);
  assert.equal(tick.change, 26.08);
  assert.equal(tick.marketStatus, 'open');
  assert.equal(tick.timestamp, 1783000000123);
  assert.equal(tick.source, 'EODHD_WS');
});

test('index realtime tick updates only its matching market card', () => {
  const cards = [
    { ticker: 'GSPC.INDX', displaySymbol: '.SPX', price: 7483.24, intraday: [7470, 7483.24] },
    { ticker: 'NDX.INDX', displaySymbol: '.NDX', price: 29329.21 },
    { ticker: 'DJI.INDX', displaySymbol: '.DJI', price: 52900.07 },
    { ticker: 'BTC-USD.CC', displaySymbol: 'BTCUSD', price: 62000 },
  ];
  const tick = {
    type: 'index_tick',
    symbol: 'GSPC.INDX',
    ticker: 'GSPC.INDX',
    displaySymbol: '.SPX',
    price: 7489.12,
    change: 26.08,
    changePercent: 0.35,
    timestamp: 1783000000123,
    source: 'EODHD_WS',
  };
  const updated = applyIndexTickToMarketCards(cards, tick, 'live');

  assert.equal(updated.length, 4);
  assert.equal(updated[0].price, 7489.12);
  assert.equal(updated[0].realtimeStatus, 'live');
  assert.deepEqual(updated[0].intraday, [7470, 7483.24, 7489.12]);
  assert.equal(updated[1].displaySymbol, '.NDX');
  assert.equal(updated[1].price, cards[1].price);
  assert.deepEqual(updated[1].intraday, []);
  assert.equal(updated[3], cards[3]);
});

test('index realtime tick updates price but does not extend sparkline outside regular session', () => {
  const cards = [
    { ticker: 'GSPC.INDX', displaySymbol: '.SPX', price: 7483.24, intraday: [7537, 7524, 7483.24], intradayMode: 'session-history' },
    { ticker: 'NDX.INDX', displaySymbol: '.NDX', price: 29329.21 },
    { ticker: 'DJI.INDX', displaySymbol: '.DJI', price: 52900.07 },
  ];
  const tick = {
    type: 'index_tick',
    symbol: 'GSPC.INDX',
    ticker: 'GSPC.INDX',
    displaySymbol: '.SPX',
    price: 7491.5,
    change: -45.93,
    changePercent: -0.61,
    timestamp: 1783000000123,
    source: 'EODHD_WS',
  };
  const updated = applyIndexTickToMarketCards(cards, tick, 'live', { appendIntraday: false });

  assert.equal(updated[0].price, 7491.5);
  assert.deepEqual(updated[0].intraday, [7537, 7524, 7483.24]);
  assert.equal(updated[0].intradayMode, 'session-history');
});

test('index realtime tick draws the index sparkline from an empty EODHD card', () => {
  const cards = [
    { ticker: 'GSPC.INDX', displaySymbol: '.SPX', price: 5435.21, intraday: [], source: 'EODHD' },
    { ticker: 'NDX.INDX', displaySymbol: '.NDX', price: 19144.23, intraday: [], source: 'EODHD' },
    { ticker: 'DJI.INDX', displaySymbol: '.DJI', price: 39647.1, intraday: [], source: 'EODHD' },
  ];
  const firstTick = {
    type: 'index_tick',
    symbol: 'NDX.INDX',
    ticker: 'NDX.INDX',
    displaySymbol: '.NDX',
    price: 19152.48,
    change: 13.99,
    changePercent: 0.07,
    timestamp: 1783000000123,
    source: 'EODHD_WS',
  };

  const updated = applyIndexTickToMarketCards(cards, firstTick, 'live');

  assert.deepEqual(updated[1].intraday, [19152.48]);
  assert.equal(updated[1].source, 'EODHD_WS');
  assert.equal(updated[0].displaySymbol, '.SPX');
  assert.equal(updated[0].price, cards[0].price);
  assert.deepEqual(updated[0].intraday, []);
  assert.equal(updated[2].displaySymbol, '.DJI');
  assert.equal(updated[2].price, cards[2].price);
  assert.deepEqual(updated[2].intraday, []);
});

test('stock realtime symbols are sanitized and capped for user quote streams', () => {
  const parsed = parseStockRealtimeSymbolsParam('nvda,NVDA,msft,tqqq');
  assert.deepEqual(parsed.symbols, ['NVDA', 'MSFT', 'TQQQ']);
  assert.equal(parseStockRealtimeSymbolsParam('NVDA,<script>').error, '股票代码不合法: <script>');

  const rows = Array.from({ length: 55 }, (_, index) => ({ symbol: `T${index}` }));
  assert.equal(selectStockRealtimeSymbols(rows).length, 50);
  assert.deepEqual(selectStockRealtimeSymbols([{ symbol: 'nvda.us' }, { symbol: 'NVDA' }, { symbol: 'MSFT' }]), ['NVDA', 'MSFT']);
  assert.equal(buildStockRealtimeSymbolsKey(['MSFT', 'nvda.us', 'NVDA']), 'MSFT,NVDA');
  assert.equal(buildStockRealtimeSymbolsKey(['NVDA', 'MSFT']), 'MSFT,NVDA');
});

test('stock realtime may start during cloud loading only when a cached symbol universe exists', () => {
  assert.equal(canStartStockRealtime({
    cloudLoading: true,
    symbols: [],
  }), false, 'an empty cold start must retain the existing cloud-loading gate');
  assert.equal(canStartStockRealtime({
    cloudLoading: true,
    symbols: ['NVDA', 'MSFT'],
  }), true, 'a validated cached symbol universe may start stock realtime early');
  assert.equal(canStartStockRealtime({
    cloudLoading: true,
    symbols: ['invalid symbol'],
  }), false, 'invalid cached symbols must not bypass cloud loading');
  assert.equal(canStartStockRealtime({
    cloudLoading: false,
    symbols: [],
  }), true, 'after cloud loading, the existing empty-universe behavior remains available');
});

test('stock snapshot polling yields to a fresh browser WebSocket tick and resumes when stale', () => {
  const now = 1783000000000;
  assert.equal(shouldPollStockRealtimeSnapshot({ now, lastWebSocketTickAt: 0 }), true);
  assert.equal(shouldPollStockRealtimeSnapshot({
    now,
    lastWebSocketTickAt: now - 14_999,
    staleMs: 15_000,
  }), false);
  assert.equal(shouldPollStockRealtimeSnapshot({
    now,
    lastWebSocketTickAt: now - 15_000,
    staleMs: 15_000,
  }), true);
  assert.equal(shouldPollStockRealtimeSnapshot({
    now,
    lastWebSocketTickAt: now - 100,
    lastWebSocketTickAtBySymbol: new Map([
      ['NVDA', now - 100],
      ['MSFT', now - 100],
    ]),
    symbols: ['NVDA', 'MSFT', 'META'],
    staleMs: 15_000,
  }), true, 'one active symbol must not hide another requested symbol that is still missing');
  assert.equal(shouldPollStockRealtimeSnapshot({
    now,
    lastWebSocketTickAtBySymbol: new Map([
      ['NVDA', now - 100],
      ['MSFT', now - 200],
      ['META', now - 300],
    ]),
    symbols: ['NVDA', 'MSFT', 'META'],
    staleMs: 15_000,
  }), false);
});

test('stock snapshot polling honors the current resume freshness floor per symbol', () => {
  const now = 1783000000000;
  const freshnessFloorAt = now - 1000;

  assert.equal(shouldPollStockRealtimeSnapshot({
    now,
    freshnessFloorAt,
    lastWebSocketTickAtBySymbol: new Map([['NVDA', freshnessFloorAt - 1]]),
    symbols: ['NVDA'],
    staleMs: 15_000,
  }), true, 'a WebSocket tick from before this resume must allow the snapshot fallback');
  assert.equal(shouldPollStockRealtimeSnapshot({
    now,
    freshnessFloorAt,
    lastWebSocketTickAtBySymbol: new Map([['NVDA', freshnessFloorAt + 1]]),
    symbols: ['NVDA'],
    staleMs: 15_000,
  }), false, 'a fresh WebSocket tick from this resume should suppress the snapshot fallback');
  assert.equal(shouldPollStockRealtimeSnapshot({
    now,
    freshnessFloorAt,
    lastWebSocketTickAtBySymbol: new Map([['NVDA', freshnessFloorAt]]),
    symbols: ['NVDA'],
    staleMs: 15_000,
  }), false, 'a WebSocket tick exactly on the freshness floor belongs to this resume');
  assert.equal(shouldPollStockRealtimeSnapshot({
    now,
    freshnessFloorAt,
    lastWebSocketTickAtBySymbol: new Map([
      ['NVDA', freshnessFloorAt + 10],
      ['MSFT', freshnessFloorAt - 10],
    ]),
    symbols: ['NVDA', 'MSFT'],
    staleMs: 15_000,
  }), true, 'one pre-resume symbol must keep the snapshot fallback active');
  assert.equal(shouldPollStockRealtimeSnapshot({
    now,
    freshnessFloorAt,
    lastWebSocketTickAtBySymbol: new Map([
      ['NVDA', freshnessFloorAt],
      ['MSFT', freshnessFloorAt + 10],
    ]),
    symbols: ['NVDA', 'MSFT'],
    staleMs: 15_000,
  }), false, 'all requested symbols at or after the floor may yield to WebSocket');
});

test('a late stock snapshot cannot overwrite a newer browser WebSocket tick for the same symbol', () => {
  const snapshotRequestedAt = 1783000000000;
  assert.equal(shouldApplyStockSnapshotTick({
    snapshotRequestedAt,
    webSocketReceivedAt: snapshotRequestedAt - 1,
  }), true);
  assert.equal(shouldApplyStockSnapshotTick({
    snapshotRequestedAt,
    webSocketReceivedAt: snapshotRequestedAt,
  }), false);
  assert.equal(shouldApplyStockSnapshotTick({
    snapshotRequestedAt,
    webSocketReceivedAt: snapshotRequestedAt + 1,
  }), false);
});

test('overlapping iOS stock snapshot requests coalesce into one immediate trailing poll', () => {
  const queued = mergeStockSnapshotPollRequest(null, {
    trigger: 'startup-burst',
    force: false,
    warm: false,
    resetFreshness: false,
  });
  const merged = mergeStockSnapshotPollRequest(queued, {
    trigger: 'pageshow-burst',
    force: true,
    warm: true,
    resetFreshness: true,
  });

  assert.deepEqual(merged, {
    trigger: 'pageshow-burst',
    force: true,
    warm: true,
    resetFreshness: true,
  });

  const touched = mergeStockSnapshotPollRequest(merged, {
    trigger: 'touch-burst',
    force: true,
    warm: true,
    resetFreshness: false,
  });

  assert.deepEqual(touched, {
    trigger: 'touch-burst',
    force: true,
    warm: true,
    resetFreshness: false,
  });

  const touchedAgain = mergeStockSnapshotPollRequest(touched, {
    trigger: 'focus-burst',
    force: false,
    warm: false,
    resetFreshness: false,
  });

  assert.deepEqual(touchedAgain, {
    trigger: 'focus-burst',
    force: true,
    warm: true,
    resetFreshness: false,
  });
});

test('normalizeStockTick accepts EODHD US stock WebSocket fields', () => {
  const tick = normalizeStockTick({
    s: 'NVDA.US',
    p: 188.42,
    dc: 1.25,
    dd: 2.32,
    ms: 'open',
    t: 1783000000123,
  }, {
    symbols: new Set(['NVDA']),
    receivedAt: 1783000000999,
  });

  assert.equal(tick.type, 'stock_tick');
  assert.equal(tick.symbol, 'NVDA');
  assert.equal(tick.price, 188.42);
  assert.equal(tick.changePercent, 1.25);
  assert.equal(tick.change, 2.32);
  assert.equal(tick.previousClose, null);
  assert.equal(tick.marketStatus, 'open');
  assert.equal(tick.timestamp, 1783000000123);
  assert.equal(tick.source, 'EODHD_WS');
  assert.equal(tick.priceType, 'trade');
});

test('normalizeStockTick accepts EODHD US quote WebSocket bid ask midpoint', () => {
  const tick = normalizeStockTick({
    s: 'NVDA.US',
    bp: 194.0158,
    ap: 194.0837,
    t: 1783000000123,
  }, {
    symbols: new Set(['NVDA']),
    receivedAt: 1783000000999,
    source: 'EODHD_WS_QUOTE',
    priceType: 'quote-midpoint',
    defaultMarketStatus: 'quote',
  });

  assert.equal(tick.type, 'stock_tick');
  assert.equal(tick.symbol, 'NVDA');
  assert.equal(Number(tick.price.toFixed(4)), 194.0498);
  assert.equal(tick.bid, 194.0158);
  assert.equal(tick.ask, 194.0837);
  assert.equal(tick.priceType, 'quote-midpoint');
  assert.equal(tick.marketStatus, 'quote');
  assert.equal(tick.timestamp, 1783000000123);
  assert.equal(tick.source, 'EODHD_WS_QUOTE');
});

test('stock realtime tick updates quote cache and can insert a held-only row', () => {
  const baseRows = [
    { symbol: 'NVDA', name: '英伟达', price: 180, previousClose: 176, intraday: [178, 180], high: 185 },
    { symbol: 'MSFT', name: '微软', price: 512 },
  ];
  const tick = {
    type: 'stock_tick',
    symbol: 'NVDA',
    price: 188.42,
    change: 2.32,
    changePercent: 1.25,
    previousClose: 186.1,
    marketStatus: 'open',
    timestamp: 1783000000123,
    source: 'EODHD_WS',
  };
  const updated = applyStockTickToQuoteRows([], tick, 'live', baseRows);

  assert.equal(updated.length, 1);
  assert.equal(updated[0].symbol, 'NVDA');
  assert.equal(updated[0].price, 188.42);
  assert.equal(updated[0].previousClose, 186.1);
  assert.equal(Number(updated[0].changePercent.toFixed(4)), 1.2466);
  assert.equal(updated[0].dailyPnlPrice, 188.42);
  assert.equal(updated[0].dailyPnlBaselineClose, 186.1);
  assert.equal(updated[0].dailyPnlLocked, false);
  assert.equal(updated[0].realtimeStatus, 'live');
  assert.equal(updated[0].marketStatus, 'open');
  assert.deepEqual(updated[0].intraday, [178, 180, 188.42]);

  const next = applyStockTickToQuoteRows(updated, { ...tick, price: 189 }, 'live', baseRows);
  assert.equal(next.length, 1);
  assert.equal(next[0].price, 189);
});

test('stock realtime tick keeps previous close from base quote rows when tick only has price', () => {
  const currentRows = [
    { symbol: 'MSFT', name: '微软', price: 390.5, previousClose: 0, intraday: [390.5], high: 391 },
  ];
  const baseRows = [
    { symbol: 'MSFT', name: '微软', price: 390.5, previousClose: 390.507, changePercent: 0, high: 391 },
  ];
  const updated = applyStockTickToQuoteRows(currentRows, {
    type: 'stock_tick',
    symbol: 'MSFT',
    price: 390.83,
    timestamp: 1783000000123,
    source: 'EODHD_WS',
  }, 'live', baseRows);

  assert.equal(updated[0].price, 390.83);
  assert.equal(updated[0].previousClose, 390.507);
  assert.equal(Number(updated[0].change.toFixed(3)), 0.323);
  assert.equal(Number(updated[0].changePercent.toFixed(4)), 0.0827);
});

test('stock quote websocket midpoint can update premarket quote rows with baseline preserved', () => {
  const baseRows = [
    { symbol: 'NVDA', name: '英伟达', price: 195.41, previousClose: 195.55, high: 197.55 },
  ];
  const updated = applyStockTickToQuoteRows([], {
    type: 'stock_tick',
    symbol: 'NVDA',
    price: 194.04975,
    bid: 194.0158,
    ask: 194.0837,
    priceType: 'quote-midpoint',
    marketStatus: 'premarket',
    timestamp: Date.UTC(2026, 6, 7, 8, 10, 55),
    source: 'EODHD_WS_QUOTE',
  }, 'live', baseRows);

  assert.equal(updated[0].price, 194.04975);
  assert.equal(updated[0].previousClose, 195.55);
  assert.equal(updated[0].priceType, 'quote-midpoint');
  assert.equal(updated[0].realtime, true);
  assert.equal(updated[0].source, 'EODHD_WS_QUOTE');
  assert.equal(updated[0].dailyPnlLocked, false);
  assert.equal(updated[0].dailyPnlSession, 'pre');
  assert.equal(Number(updated[0].change.toFixed(4)), -1.5003);
  assert.equal(Number(updated[0].changePercent.toFixed(4)), -0.7672);
});

test('stock realtime tick waits for previous close before replacing daily pnl state', () => {
  const currentRows = [
    { symbol: 'MSFT', name: '微软', price: 385.73, previousClose: 0, changePercent: -1.22, high: 391 },
  ];
  const baseRows = [
    { symbol: 'MSFT', name: '微软', price: 385.73, previousClose: 0, changePercent: -1.22, high: 391 },
  ];
  const tick = {
    type: 'stock_tick',
    symbol: 'MSFT',
    price: 384.169,
    changePercent: -1.62,
    timestamp: 1783000000123,
    source: 'EODHD_WS',
  };
  const unchanged = applyStockTickToQuoteRows(currentRows, tick, 'live', baseRows);

  assert.equal(unchanged[0], currentRows[0]);
  assert.equal(unchanged[0].price, 385.73);
  assert.equal(unchanged[0].previousClose, 0);

  const refreshedRows = [
    { symbol: 'MSFT', name: '微软', price: 384.169, previousClose: 390.49, changePercent: -1.62, high: 391 },
  ];
  const merged = mergeStockTicksIntoQuoteRows(refreshedRows, [tick], 'live', refreshedRows);

  assert.equal(merged[0].price, 384.169);
  assert.equal(merged[0].previousClose, 390.49);
  assert.equal(Number(merged[0].change.toFixed(3)), -6.321);
  assert.equal(Number(merged[0].changePercent.toFixed(4)), -1.6187);
  assert.equal(merged[0].realtimeStatus, 'live');
});

test('stock realtime tick recomputes stale percent from base previous close', () => {
  const baseRows = [
    { symbol: 'NOK', name: 'NOK', price: 12.7, previousClose: 12.07, change: 0.63, changePercent: 4.96, high: 12.75 },
  ];
  const updated = applyStockTickToQuoteRows([], {
    type: 'stock_tick',
    symbol: 'NOK',
    price: 12.7,
    change: 0.63,
    changePercent: 4.96,
    timestamp: 1783000000123,
    source: 'EODHD_WS',
  }, 'live', baseRows);

  assert.equal(updated[0].price, 12.7);
  assert.equal(updated[0].previousClose, 12.07);
  assert.equal(Number(updated[0].change.toFixed(2)), 0.63);
  assert.equal(Number(updated[0].changePercent.toFixed(4)), 5.2196);
});

test('REST refresh preserves fresh realtime stock prices while keeping REST previous close', () => {
  const now = 1783000005000;
  const refreshedRows = [
    { symbol: 'MSFT', name: '微软', price: 390.507, previousClose: 390.507, changePercent: 0, high: 391 },
  ];
  const quoteCache = [
    {
      symbol: 'MSFT',
      name: '微软',
      price: 390.83,
      previousClose: 0,
      change: 0,
      changePercent: 0,
      realtime: true,
      realtimeStatus: 'live',
      realtimeAt: now - 20_000,
      source: 'EODHD_WS',
    },
  ];
  const merged = mergeFreshStockRealtimeRows(refreshedRows, quoteCache, { now, maxAgeMs: 120_000 });

  assert.equal(merged[0].price, 390.83);
  assert.equal(merged[0].previousClose, 390.507);
  assert.equal(Number(merged[0].change.toFixed(3)), 0.323);
  assert.equal(Number(merged[0].changePercent.toFixed(4)), 0.0827);
  assert.equal(merged[0].realtimeStatus, 'live');
});

test('extended-hours stock realtime price is not overwritten by delayed REST rows after sparse ticks', () => {
  const now = Date.UTC(2026, 6, 6, 8, 35, 0); // 04:35 New York, premarket
  const refreshedRows = [
    { symbol: 'NOK', name: 'NOK', price: 12.07, previousClose: 12.91, changePercent: -6.51, high: 12.91 },
  ];
  const quoteCache = [
    {
      symbol: 'NOK',
      name: 'NOK',
      price: 12.454,
      previousClose: 12.91,
      change: -0.456,
      changePercent: -3.532,
      realtime: true,
      realtimeStatus: 'live',
      realtimeAt: now - 4 * 60_000,
      marketStatus: 'extended hours',
      source: 'EODHD_WS',
    },
  ];
  const merged = mergeFreshStockRealtimeRows(refreshedRows, quoteCache, { now, maxAgeMs: 120_000 });

  assert.equal(merged[0].price, 12.454);
  assert.equal(merged[0].previousClose, 12.91);
  assert.equal(Number(merged[0].changePercent.toFixed(3)), -3.532);
  assert.equal(merged[0].marketStatus, 'extended hours');
  assert.equal(merged[0].realtimeStatus, 'live');
});

test('old extended-hours stock realtime cache does not override fresh REST rows', () => {
  const now = Date.UTC(2026, 6, 6, 8, 35, 0); // 04:35 New York, premarket
  const refreshedRows = [
    { symbol: 'TSM', name: '台积电', price: 452.47, previousClose: 451.79, changePercent: 0.15, high: 452.5 },
  ];
  const quoteCache = [
    {
      symbol: 'TSM',
      name: '台积电',
      price: 443.55,
      previousClose: 451.79,
      realtime: true,
      realtimeStatus: 'live',
      clientReceivedAt: now - 6 * 60_000,
      realtimeAt: now - 6 * 60_000,
      marketStatus: 'extended-hours',
      source: 'EODHD_WS',
    },
  ];
  const merged = mergeFreshStockRealtimeRows(refreshedRows, quoteCache, { now });

  assert.equal(merged[0].price, 452.47);
  assert.equal(merged[0].realtime, undefined);
});

test('stock realtime tick freshness is tracked per received tick', () => {
  const now = 1783000005000;
  assert.equal(isFreshStockRealtimeTick({ symbol: 'NVDA', clientReceivedAt: now - 5000 }, { now, maxAgeMs: 15_000 }), true);
  assert.equal(isFreshStockRealtimeTick({ symbol: 'TSM', clientReceivedAt: now - 20_000 }, { now, maxAgeMs: 15_000 }), false);
});

test('extended-hours stock realtime tick preserves locked broker-style daily baseline', () => {
  const currentRows = [
    {
      symbol: 'NVDA',
      name: '英伟达',
      price: 195.55,
      previousClose: 194.8,
      dailyBaselineClose: 194.8,
      dailyBaselineDate: '2026-07-02',
      dailyPnlPrice: 195.55,
      dailyPnlBaselineClose: 194.8,
      dailyPnlPriceDate: '2026-07-06',
      dailyPnlBaselineDate: '2026-07-02',
      dailyPnlLocked: true,
      changePercent: 0.38,
      high: 197.55,
    },
  ];
  const tick = {
    type: 'stock_tick',
    symbol: 'NVDA',
    price: 195.274,
    previousClose: 195.55,
    changePercent: -0.14,
    marketStatus: 'postmarket',
    timestamp: Date.UTC(2026, 6, 6, 23, 39, 0),
    source: 'EODHD_WS',
  };
  const updated = applyStockTickToQuoteRows(currentRows, tick, 'live');

  assert.equal(updated[0].price, 195.274);
  assert.equal(updated[0].previousClose, 194.8);
  assert.equal(updated[0].dailyBaselineClose, 194.8);
  assert.equal(updated[0].dailyPnlPrice, 195.55);
  assert.equal(updated[0].dailyPnlBaselineClose, 194.8);
  assert.equal(updated[0].dailyPnlLocked, true);
  assert.equal(updated[0].dailyPnlSession, 'post');
  assert.equal(Number(updated[0].dailyPnlChange.toFixed(3)), 0.75);
  assert.equal(Number(updated[0].dailyPnlChangePercent.toFixed(4)), 0.3850);
  assert.equal(updated[0].sessionPreviousClose, 195.55);
  assert.equal(Number(updated[0].change.toFixed(3)), 0.474);
  assert.equal(Number(updated[0].changePercent.toFixed(4)), 0.2433);
});
