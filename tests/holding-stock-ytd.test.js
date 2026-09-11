import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHoldingStockYtdPercent } from '../src/lib/holdingStockYtd.js';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';
import { resolveHoldingDisplayPrice } from '../src/lib/homeMarketDisplay.js';
import { buildLedgerQuoteUniverse } from '../src/lib/stockUniverse.js';
import { mergeQuoteBaselineRows } from '../src/lib/quoteRefreshPolicy.js';
import { mergeStockTicksIntoQuoteRows } from '../src/lib/stockRealtime.js';

const now = Date.parse('2026-09-11T15:00:00Z');
const baseline = { year: 2026, date: '2025-12-31', close: 100, source: 'eodhd-adjusted-close' };

test('stock YTD preserves missing, zero, positive and negative results', () => {
  for (const [price, expected] of [[125, 25], [75, -25], [100, 0]]) {
    assert.equal(deriveHoldingStockYtdPercent({ stockYtdBaseline: baseline }, price, now), expected);
  }
  for (const quote of [{}, { ytdChangePercent: 0 }, { stockYtdBaseline: null },
    { stockYtdBaseline: { ...baseline, close: 0 } },
    { stockYtdBaseline: { ...baseline, close: NaN } },
    { stockYtdBaseline: { ...baseline, source: 'fallback' } },
    { stockYtdBaseline: { ...baseline, date: '2026-01-02' } },
    { stockYtdBaseline: { ...baseline, year: 2025 } }]) {
    assert.equal(deriveHoldingStockYtdPercent(quote, 125, now), null);
  }
  for (const price of [null, undefined, '', 0, -1, Infinity, NaN]) {
    assert.equal(deriveHoldingStockYtdPercent({ stockYtdBaseline: baseline }, price, now), null);
  }
});

test('YTD switches years on New York time and does not reuse the previous-year baseline', () => {
  const quote = { stockYtdBaseline: baseline };
  assert.equal(deriveHoldingStockYtdPercent(quote, 125, Date.parse('2027-01-01T01:00:00Z')), 25);
  assert.equal(deriveHoldingStockYtdPercent(quote, 125, Date.parse('2027-01-01T05:00:00Z')), null);
});

test('existing quote merge and universe preserve YTD metadata through real-time updates without changing account totals', () => {
  const trades = [{ id: 1, symbol: 'NVDA', side: 'buy', date: '2026-08-01', shares: 10, price: 150 }];
  const refreshed = { symbol: 'NVDA', price: 120, previousClose: 110, dailyBaselineClose: 110,
    dailyBaselineDate: '2026-09-10', stockYtdBaseline: baseline };
  const cached = mergeQuoteBaselineRows([], [refreshed]);
  const updated = mergeStockTicksIntoQuoteRows(cached, [{ symbol: 'NVDA', price: 125, timestamp: now, source: 'EODHD_WS' }], 'live', cached, { now });
  const { allRows } = buildLedgerQuoteUniverse(trades, [], updated);
  const summary = deriveInvestmentSummary({ stockTrades: trades, watchlist: allRows });
  const position = summary.activePositions[0];
  assert.equal(resolveHoldingDisplayPrice(position), 125);
  assert.equal(deriveHoldingStockYtdPercent(allRows[0], resolveHoldingDisplayPrice(position), now), 25);
  assert.equal(position.holdingPnl, -250, 'personal return retains the purchase-cost basis');
  const withoutYtd = allRows.map(({ stockYtdBaseline, ...row }) => row);
  assert.deepEqual(summary, deriveInvestmentSummary({ stockTrades: trades, watchlist: withoutYtd }));
  const locked = { ...allRows[0], price: 160, dailyPnlLocked: true, dailyPnlPrice: 125 };
  const lockedPosition = deriveInvestmentSummary({ stockTrades: trades, watchlist: [locked] }).activePositions[0];
  assert.equal(deriveHoldingStockYtdPercent(locked, resolveHoldingDisplayPrice(lockedPosition), now), 25);
});
