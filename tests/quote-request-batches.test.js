import assert from 'node:assert/strict';
import test from 'node:test';

import { buildQuoteSymbolBatches, QUOTE_API_BATCH_SIZE } from '../src/lib/quoteRequestBatches.js';

test('quote requests keep up to 30 symbols in one batch', () => {
  const symbols = Array.from({ length: QUOTE_API_BATCH_SIZE }, (_, index) => `S${index}`);
  const batches = buildQuoteSymbolBatches(symbols);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], symbols);
});

test('quote requests split the 31st symbol into a second batch', () => {
  const symbols = Array.from({ length: QUOTE_API_BATCH_SIZE + 1 }, (_, index) => `S${index}`);
  const batches = buildQuoteSymbolBatches(symbols);
  assert.deepEqual(batches.map((batch) => batch.length), [30, 1]);
  assert.deepEqual(batches.flat(), symbols);
});

test('quote request batching preserves order and removes duplicates across larger sets', () => {
  const symbols = Array.from({ length: 65 }, (_, index) => `S${index}`);
  const batches = buildQuoteSymbolBatches([...symbols, 'S0', 'S31', '']);
  assert.deepEqual(batches.map((batch) => batch.length), [30, 30, 5]);
  assert.deepEqual(batches.flat(), symbols);
  assert.equal(batches.every((batch) => batch.length <= QUOTE_API_BATCH_SIZE), true);
});
