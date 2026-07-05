import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBtcTick, sanitizeEodhdKey } from '../server/realtime/btc.js';
import {
  BTC_REALTIME_PROTOCOL,
  INDICES_REALTIME_PROTOCOL,
  extractRealtimeAccessToken,
  parseWebSocketProtocols,
  selectRealtimeProtocol,
} from '../server/realtime/auth.js';
import { INDEX_REALTIME_SYMBOLS, normalizeIndexTick } from '../server/realtime/indices.js';
import { applyBtcTickToMarketCards } from '../src/lib/btcRealtime.js';
import { applyIndexTickToMarketCards } from '../src/lib/indexRealtime.js';

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
  assert.deepEqual(updated[3].intraday, [61800, 62000, 62521.14]);
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
  assert.equal(updated[1], cards[1]);
  assert.equal(updated[3], cards[3]);
});
