import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStockTradeMarketReference } from '../src/lib/stockTradeMarketReference.js';

test('market reference follows the selected instrument and uses the completed-close price outside the live session', () => {
  const result = deriveStockTradeMarketReference({ symbol: 'NVDA', quote: {
    symbol: 'NVDA', price: 180, dailyPnlPrice: 190, week52High: 200,
  }, vix: 18.6, vixDataDate: '2026-10-02' });
  assert.equal(result.stockReady, true);
  assert.ok(Math.abs(result.stockDistanceFromHigh + 0.05) < 1e-12);
  assert.equal(result.vixValue, 18.6);
});

test('missing, mismatched, failed and stale quotes never become zero distance or use a day high', () => {
  for (const quote of [null, { symbol: 'QQQ', price: 100, week52High: 100 },
    { symbol: 'NVDA', price: 100, high: 100 }, { symbol: 'NVDA', price: 0, week52High: 100 },
    { symbol: 'NVDA', price: 100, dailyPnlPrice: 100, week52High: 100, stale: true },
    { symbol: 'NVDA', price: 100, dailyPnlPrice: 100, week52High: 100, error: 'unavailable' }]) {
    const result = deriveStockTradeMarketReference({ symbol: 'NVDA', quote });
    assert.equal(result.stockReady, false);
    assert.equal(result.stockDistanceFromHigh, null);
    assert.equal(result.vixValue, null);
  }
  assert.equal(deriveStockTradeMarketReference({ symbol: 'NVDA', quote: {
    symbol: 'NVDA', price: 100, dailyPnlPrice: 100, week52High: 100,
  } }).stockDistanceFromHigh, 0);
});
