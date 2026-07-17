import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_SIGNAL_ET_OPEN_TIME,
  buildHomeSignalBenchmarkRows,
  nextHomeSignalBenchmarkSortDirection,
  resolveHomeSignalBenchmarkMarketState,
  sortHomeSignalBenchmarkRows,
} from '../src/lib/homeSignalBenchmark.js';
import { getUsEquityRealtimeSession } from '../src/lib/stockRealtime.js';

const liveOptions = [
  { symbol: 'META', name: 'Meta', price: 92.7, high: 100, dailyPnlSession: 'regular', dailyPnlLocked: false },
  { symbol: 'AAPL', name: '苹果', price: 99.7, high: 100, dailyPnlSession: 'regular', dailyPnlLocked: false },
  { symbol: 'NVDA', name: '英伟达', price: 97.6, high: 100, dailyPnlSession: 'regular', dailyPnlLocked: false },
  { symbol: 'MSFT', name: '微软', price: 99.2, high: 100, dailyPnlSession: 'regular', dailyPnlLocked: false },
];

test('builds signal benchmark rows in fixed source order without mutating input', () => {
  const source = structuredClone(liveOptions);
  const rows = buildHomeSignalBenchmarkRows(source, { selectedSymbol: 'AAPL' });

  assert.deepEqual(rows.map((row) => row.symbol), ['META', 'AAPL', 'NVDA', 'MSFT']);
  assert.ok(Math.abs(rows.find((row) => row.symbol === 'META').drawdown + 0.073) < 1e-12);
  assert.equal(rows.find((row) => row.symbol === 'AAPL').selected, true);
  assert.deepEqual(source, liveOptions);
});

test('uses locked close price and fails closed when locked close is missing', () => {
  const rows = buildHomeSignalBenchmarkRows([
    { symbol: 'AAPL', price: 105, dailyPnlPrice: 90, high: 100, dailyPnlSession: 'post', dailyPnlLocked: true },
    { symbol: 'MSFT', price: 99, high: 100, dailyPnlSession: 'closed', dailyPnlLocked: true },
  ]);

  assert.equal(rows[0].price, 90);
  assert.equal(rows[0].drawdown, -0.1);
  assert.equal(rows[1].price, null);
  assert.equal(rows[1].drawdown, null);
});

test('sorts deepest-to-shallowest and shallowest-to-deepest with missing values last', () => {
  const rows = buildHomeSignalBenchmarkRows([
    ...liveOptions,
    { symbol: 'TSM', price: 0, high: 100, dailyPnlSession: 'regular', dailyPnlLocked: false },
  ]);

  assert.deepEqual(sortHomeSignalBenchmarkRows(rows).map((row) => row.symbol), ['META', 'AAPL', 'NVDA', 'MSFT', 'TSM']);
  assert.deepEqual(sortHomeSignalBenchmarkRows(rows, 'desc').map((row) => row.symbol), ['META', 'NVDA', 'MSFT', 'AAPL', 'TSM']);
  assert.deepEqual(sortHomeSignalBenchmarkRows(rows, 'asc').map((row) => row.symbol), ['AAPL', 'MSFT', 'NVDA', 'META', 'TSM']);
  assert.deepEqual(rows.map((row) => row.symbol), ['META', 'AAPL', 'NVDA', 'MSFT', 'TSM']);
});

test('distinguishes reliable live sessions from close-locked or unknown rows', () => {
  assert.equal(resolveHomeSignalBenchmarkMarketState({ dailyPnlSession: 'pre', dailyPnlLocked: false }), 'live');
  assert.equal(resolveHomeSignalBenchmarkMarketState({ dailyPnlSession: 'regular', dailyPnlLocked: false }), 'live');
  assert.equal(resolveHomeSignalBenchmarkMarketState({ dailyPnlSession: 'post', dailyPnlLocked: true, realtime: true }), 'locked');
  assert.equal(resolveHomeSignalBenchmarkMarketState({ realtime: true }), 'locked');
  assert.equal(HOME_SIGNAL_ET_OPEN_TIME, '09:30:00');
});

test('toggles drawdown sort direction without adding a third implicit order', () => {
  assert.equal(nextHomeSignalBenchmarkSortDirection(null), 'desc');
  assert.equal(nextHomeSignalBenchmarkSortDirection('desc'), 'asc');
  assert.equal(nextHomeSignalBenchmarkSortDirection('asc'), 'desc');
});

test('resolves quote-only QQQ ticks from the New York session across the close boundary', () => {
  assert.equal(getUsEquityRealtimeSession({ marketStatus: 'quote' }, Date.parse('2026-07-17T14:00:00Z')), 'regular');
  assert.equal(getUsEquityRealtimeSession({ marketStatus: 'quote' }, Date.parse('2026-07-17T21:00:00Z')), 'post');
  assert.equal(getUsEquityRealtimeSession({ marketStatus: 'closed' }, Date.parse('2026-07-17T14:00:00Z')), 'closed');
});
