import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeStrictUserStockSymbol, normalizeUserStockSymbol } from '../src/lib/symbols.js';

test('normalizeUserStockSymbol repairs short legacy ticker whitespace', () => {
  assert.equal(normalizeUserStockSymbol('N VDA'), 'NVDA');
  assert.equal(normalizeUserStockSymbol(' ms ft.us '), 'MSFT');
  assert.equal(normalizeUserStockSymbol('BRK.B'), 'BRK.B');
});

test('normalizeUserStockSymbol rejects unsafe symbol text', () => {
  assert.equal(normalizeUserStockSymbol('DROP TABLE'), '');
  assert.equal(normalizeUserStockSymbol('<script>'), '');
  assert.equal(normalizeUserStockSymbol(''), '');
});

test('normalizeStrictUserStockSymbol rejects whitespace instead of repairing input', () => {
  assert.equal(normalizeStrictUserStockSymbol('NVDA'), 'NVDA');
  assert.equal(normalizeStrictUserStockSymbol('nvda.us'), 'NVDA');
  assert.equal(normalizeStrictUserStockSymbol('N VDA'), '');
  assert.equal(normalizeStrictUserStockSymbol('DROP TABLE'), '');
});
