import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBtcTick, sanitizeEodhdKey } from '../server/realtime/btc.js';
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
  applyBtcTickToMarketCards,
  createBtcPlaceholderMarketCard,
  isBtcMarketCard,
} from '../src/lib/btcRealtime.js';
import {
  applyIndexTickToMarketCards,
  createIndexPlaceholderMarketCards,
  mergeIndexCardsWithPlaceholders,
  mergeIndexRestCardsIntoMarketCards,
} from '../src/lib/indexRealtime.js';
import {
  applyStockTickToQuoteRows,
  isFreshStockRealtimeTick,
  mergeFreshStockRealtimeRows,
  mergeStockTicksIntoQuoteRows,
  selectStockRealtimeSymbols,
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
