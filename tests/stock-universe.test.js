import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLedgerQuoteUniverse } from '../src/lib/stockUniverse.js';

test('ledger quote universe exposes stock trade symbols for the home watch list', () => {
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
  assert.equal(universe.ledgerRows.find((row) => row.symbol === 'NVDA').price, 194.44);
  assert.equal(universe.ledgerRows.find((row) => row.symbol === 'MSFT').price, 200);
  assert.equal(universe.allRows.some((row) => row.symbol === 'AAPL'), true);
});

test('ledger quote universe falls back to watchlist when no ledger exists', () => {
  const universe = buildLedgerQuoteUniverse([], [
    { symbol: 'QQQ', name: 'Invesco QQQ', price: 714.22, high: 747.82 },
  ]);

  assert.equal(universe.ledgerRows.length, 1);
  assert.equal(universe.ledgerRows[0].symbol, 'QQQ');
});
