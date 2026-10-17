import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockBuyReferencePreview, BUY_REFERENCE_PREVIEW_STATES } from '../src/dev/stockBuyReferencePreview.js';

test('local demonstrations calculate each lifecycle state from prices with synchronized MA and RSI', () => {
  for (const state of BUY_REFERENCE_PREVIEW_STATES) {
    const detail = buildStockBuyReferencePreview(state);
    const reference = detail.stockRsi.buyReference;
    assert.equal(reference.state, state);
    assert.equal(reference.asOfDate, detail.asOfDate);
    assert.equal(detail.stockRsi.asOf, detail.asOfDate);
    assert.match(detail.previewLabel, /本地模拟/);
    if (state !== 'unavailable') {
      assert.equal(reference.close, detail.history.at(-1).close);
      assert.equal(reference.rsi, detail.stockRsi.value);
    }
  }
  assert.equal(buildStockBuyReferencePreview('unknown'), null);
});
