import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildQuoteBaselineRows,
  getQuoteBaselineRefreshDelay,
  getQuoteBaselineRefreshInterval,
  QUOTE_BASELINE_REFRESH_INTERVAL_MS,
  selectQuoteBaselineSymbols,
  shouldRunQuoteBaselineRefresh,
} from '../src/lib/quoteRefreshPolicy.js';

test('full REST baseline uses 15/30/60 minute market-session intervals', () => {
  assert.equal(getQuoteBaselineRefreshInterval('regular'), 15 * 60 * 1000);
  assert.equal(getQuoteBaselineRefreshInterval('premarket'), 30 * 60 * 1000);
  assert.equal(getQuoteBaselineRefreshInterval('postmarket'), 30 * 60 * 1000);
  assert.equal(getQuoteBaselineRefreshInterval('closed'), 60 * 60 * 1000);
  assert.equal(getQuoteBaselineRefreshInterval('unknown'), QUOTE_BASELINE_REFRESH_INTERVAL_MS.closed);
});

test('automatic focus-style refreshes run only when the baseline is due', () => {
  const now = Date.UTC(2026, 6, 31, 15, 0, 0);
  const interval = getQuoteBaselineRefreshInterval('regular');

  assert.equal(shouldRunQuoteBaselineRefresh({ session: 'regular', now }), true);
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now,
    lastSuccessAt: now - interval + 1,
  }), false);
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now,
    lastSuccessAt: now - interval,
  }), true);
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now,
    lastSuccessAt: now - interval * 2,
    lastAttemptAt: now - 1000,
  }), false, 'a failed attempt also gets one interval of provider-protection cooldown');
  assert.equal(shouldRunQuoteBaselineRefresh({
    session: 'regular',
    now,
    lastSuccessAt: now - 1000,
    lastAttemptAt: now - 1000,
    force: true,
  }), true, 'manual refresh bypasses the automatic cadence gate');
  assert.equal(getQuoteBaselineRefreshDelay({
    session: 'regular',
    now,
    lastSuccessAt: now - (10 * 60 * 1000),
  }), 5 * 60 * 1000, 'rescheduling keeps the original due time instead of postponing another full interval');
});

test('baseline symbols contain only live holdings, watchlist, and active swing rows', () => {
  const symbols = selectQuoteBaselineSymbols({
    stockTrades: [
      { id: 1, symbol: 'NVDA', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
      { id: 2, symbol: 'NVDA', side: 'sell', date: '2026-01-02', price: 120, shares: 2 },
      { id: 3, symbol: 'MSFT', side: 'buy', date: '2026-01-01', price: 300, shares: 5 },
      { id: 4, symbol: 'MSFT', side: 'sell', date: '2026-01-02', price: 320, shares: 5 },
    ],
    watchlist: [{ symbol: 'AAPL', name: 'Apple' }],
    activeSwingRows: [
      { symbol: 'SOXL', status: 'active' },
      { symbol: 'NOK', status: 'completed' },
      { symbol: 'T S M' },
    ],
  });

  assert.deepEqual(symbols.sort(), ['AAPL', 'NVDA', 'SOXL', 'TSM']);
});

test('baseline rows drop closed ledgers and old tool-only symbols while preserving cached values', () => {
  const stockTrades = [
    { id: 1, symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-01-01', price: 100, shares: 10 },
    { id: 2, symbol: 'MSFT', name: 'Microsoft', side: 'buy', date: '2026-01-01', price: 300, shares: 5 },
    { id: 3, symbol: 'MSFT', name: 'Microsoft', side: 'sell', date: '2026-01-02', price: 320, shares: 5 },
  ];
  const watchlist = [{ symbol: 'AAPL', name: 'Apple', price: 190 }];
  const activeSwingRows = [{ symbol: 'SOXL', name: '3x Semiconductor', price: 45 }];
  const rows = buildQuoteBaselineRows({
    stockTrades,
    watchlist,
    activeSwingRows,
    candidateRows: [
      { symbol: 'NVDA', name: 'NVIDIA', price: 210, previousClose: 205 },
      { symbol: 'MSFT', name: 'Microsoft', price: 400 },
      { symbol: 'AAPL', name: 'Apple', price: 195, previousClose: 194 },
      { symbol: 'SOXL', name: '3x Semiconductor', price: 46 },
      { symbol: 'IBKR', name: 'old cost tool', price: 80 },
    ],
  });

  assert.deepEqual(rows.map((row) => row.symbol).sort(), ['AAPL', 'NVDA', 'SOXL']);
  assert.equal(rows.find((row) => row.symbol === 'AAPL').price, 195, 'merged quote cache wins over the raw watchlist fallback');
  assert.equal(rows.find((row) => row.symbol === 'NVDA').previousClose, 205);
});

test('App wires the low-frequency gate without replacing iOS snapshot bursts or stock WebSocket ticks', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

  assert.match(source, /getQuoteBaselineRefreshDelay\(\{/);
  assert.match(source, /shouldRunQuoteBaselineRefresh\(\{/);
  assert.match(source, /quoteBaselineRowsRef\.current\.length > 0/);
  assert.match(source, /const coreSymbols = \['QQQ', 'TQQQ'\]/);
  assert.match(source, /iosPwaRealtimeSnapshotBurstRef\.current\(nextTrigger, \{ resetFreshness \}\)/);
  assert.match(source, /requestQuickQuoteRefresh\(quoteBaselineRowsRef\.current, \{/);
  assert.match(source, /forceBaseline: true/);
  assert.equal(
    source.match(/forceBaseline: true/g)?.length,
    2,
    'only the two manual refresh entry points may bypass the baseline gate',
  );
  assert.doesNotMatch(source, /const getMarketRefreshInterval =/);
});
