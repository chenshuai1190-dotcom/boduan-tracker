import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLedgerQuoteUniverse } from '../src/lib/stockUniverse.js';

test('quote universe separates user watchlist rows from stock trade rows', () => {
  const universe = buildLedgerQuoteUniverse(
    [
      { symbol: 'nvda', name: '英伟达', side: 'buy', date: '2026-07-04', price: 100, shares: 10 },
      { symbol: 'MSFT', name: '微软', side: 'buy', date: '2026-07-04', price: 200, shares: 3 },
    ],
    [
      { symbol: 'NVDA', name: 'NVIDIA', price: 194.44, high: 210, previousClose: 195, changePercent: -0.2 },
      { symbol: 'AAPL', name: 'Apple', price: 308.45, high: 320 },
    ],
  );

  assert.deepEqual([...universe.ledgerSymbols].sort(), ['MSFT', 'NVDA']);
  assert.deepEqual(universe.ledgerRows.map((row) => row.symbol).sort(), ['MSFT', 'NVDA']);
  assert.deepEqual(universe.watchlistRows.map((row) => row.symbol).sort(), ['AAPL', 'NVDA']);
  assert.equal(universe.ledgerRows.find((row) => row.symbol === 'NVDA').price, 194.44);
  assert.equal(universe.ledgerRows.find((row) => row.symbol === 'MSFT').price, 200);
  assert.equal(universe.allRows.some((row) => row.symbol === 'AAPL'), true);
});

test('quote universe keeps new user watchlist empty even with ledger trades', () => {
  const universe = buildLedgerQuoteUniverse([
    { symbol: 'IBKR', name: 'IBKR', side: 'buy', date: '2026-07-04', price: 91.65, shares: 2 },
  ], [], [
    { symbol: 'IBKR', price: 96.12, high: 101, previousClose: 95, changePercent: 1.2 },
  ]);

  assert.equal(universe.watchlistRows.length, 0);
  assert.deepEqual(universe.ledgerRows.map((row) => row.symbol), ['IBKR']);
  assert.deepEqual(universe.allRows.map((row) => row.symbol), ['IBKR']);
  assert.equal(universe.ledgerRows[0].price, 96.12);
});

test('quote universe exposes watchlist when no ledger exists', () => {
  const universe = buildLedgerQuoteUniverse([], [
    { symbol: 'QQQ', name: 'Invesco QQQ', price: 714.22, high: 747.82 },
  ]);

  assert.equal(universe.ledgerRows.length, 0);
  assert.equal(universe.watchlistRows.length, 1);
  assert.equal(universe.watchlistRows[0].symbol, 'QQQ');
});

test('quote universe includes tool-only symbols without polluting watchlist or ledger rows', () => {
  const universe = buildLedgerQuoteUniverse([], [], [
    { symbol: 'HOOD', price: 98.76, high: 101.23, previousClose: 97, changePercent: 1.81 },
  ], [
    { symbol: 'hood', name: 'Robinhood' },
    { symbol: 'tsm', name: '台积电' },
  ]);

  assert.deepEqual([...universe.toolSymbols].sort(), ['HOOD', 'TSM']);
  assert.deepEqual(universe.toolRows.map((row) => row.symbol).sort(), ['HOOD', 'TSM']);
  assert.equal(universe.watchlistRows.length, 0);
  assert.equal(universe.ledgerRows.length, 0);
  assert.equal(universe.allRows.find((row) => row.symbol === 'HOOD').price, 98.76);
  assert.equal(universe.allRows.find((row) => row.symbol === 'TSM').price, 0);
});

test('quote universe recomputes daily change fields when fresh quote rows only carry price', () => {
  const universe = buildLedgerQuoteUniverse(
    [
      { symbol: 'MSFT', name: '微软', side: 'buy', date: '2026-07-04', price: 412.07, shares: 2300 },
    ],
    [
      { symbol: 'MSFT', name: '微软', price: 390.507, previousClose: 390.507, change: 0, changePercent: 0 },
    ],
    [
      { symbol: 'MSFT', name: '微软', price: 390.83, previousClose: 0, change: 0, changePercent: 0 },
    ],
  );

  const row = universe.ledgerRows[0];
  assert.equal(row.price, 390.83);
  assert.equal(row.previousClose, 390.507);
  assert.equal(Number(row.change.toFixed(3)), 0.323);
  assert.equal(Number(row.changePercent.toFixed(4)), 0.0827);
});
