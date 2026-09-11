import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveHoldingStockYtdPercent } from '../src/lib/holdingStockYtd.js';
import { deriveInvestmentSummary } from '../src/lib/investmentSummary.js';
import { resolveHoldingDisplayPrice } from '../src/lib/homeMarketDisplay.js';
import { buildLedgerQuoteUniverse } from '../src/lib/stockUniverse.js';
import { mergeQuoteBaselineRows } from '../src/lib/quoteRefreshPolicy.js';
import { mergeFreshStockRealtimeRows, mergeStockTicksIntoQuoteRows } from '../src/lib/stockRealtime.js';

const now = Date.parse('2026-09-11T15:00:00Z');
const baseline = { year: 2026, date: '2025-12-31', close: 100, source: 'eodhd-adjusted-close' };

// Run the actual App REST projection before the downstream merge. Starting at
// mergeQuoteBaselineRows alone misses fields omitted by App's explicit mapping.
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const projectionStart = appSource.indexOf('const updatedQuotes = rowsForQuote.map(s => {');
const projectionEnd = appSource.indexOf('setQuoteCache((current) => {', projectionStart);
assert.ok(projectionStart >= 0 && projectionEnd > projectionStart);
const projectRestRows = new Function('rowsForQuote', 'resultBySymbol', 'normalizeExternalLogoUrl',
  `${appSource.slice(projectionStart, projectionEnd)}\nreturn updatedQuotes;`);

function refreshAppCache(current, responses, rowsForQuote = current) {
  const updatedQuotes = projectRestRows(rowsForQuote,
    new Map(responses.map(row => [String(row.symbol).toUpperCase(), row])), value => value);
  const merged = mergeQuoteBaselineRows(current, updatedQuotes);
  return mergeFreshStockRealtimeRows(merged, current, { now });
}

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

test('the actual App REST projection carries YTD through quoteCache, universe and live updates without changing account totals', () => {
  const trades = [{ id: 1, symbol: 'NVDA', side: 'buy', date: '2026-08-01', shares: 10, price: 150 }];
  const refreshed = { symbol: 'NVDA', price: 120, previousClose: 110, dailyBaselineClose: 110,
    dailyBaselineDate: '2026-09-10', stockYtdBaseline: baseline };
  const cached = refreshAppCache([], [refreshed], [{ symbol: 'NVDA', price: 90 }]);
  assert.deepEqual(cached[0].stockYtdBaseline, baseline, 'App must copy the new REST field before cache merging');
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

test('a newer realtime price with a missing YTD baseline does not discard a valid REST baseline', () => {
  const current = { symbol: 'NVDA', price: 125, previousClose: 110, dailyBaselineClose: 110,
    dailyBaselineDate: '2026-09-10', realtime: true, realtimeAt: now, clientReceivedAt: now,
    source: 'EODHD_WS', stockYtdBaseline: null };
  const [merged] = refreshAppCache([current], [{ ...current, price: 120, stockYtdBaseline: baseline }]);
  assert.equal(merged.price, 125, 'existing fresh realtime price precedence is unchanged');
  assert.deepEqual(merged.stockYtdBaseline, baseline);
  assert.equal(deriveHoldingStockYtdPercent(merged, merged.price, now), 25);
});

test('missing fresh YTD metadata clears an older baseline while retaining the original quote and asset values', () => {
  const trades = [{ id: 1, symbol: 'NVDA', side: 'buy', date: '2026-08-01', shares: 10, price: 150 }];
  const current = { symbol: 'NVDA', price: 125, previousClose: 110, dailyBaselineClose: 110,
    dailyBaselineDate: '2026-09-10', realtime: true, realtimeAt: now, clientReceivedAt: now,
    source: 'EODHD_WS', stockYtdBaseline: baseline };
  for (const freshBaseline of [null, undefined]) {
    const responses = [{ ...current, price: 120, stockYtdBaseline: freshBaseline }];
    const [merged] = refreshAppCache([current], responses);
    assert.equal(merged.stockYtdBaseline, null, 'a successful response with no baseline cannot reuse the old year-start observation');
    assert.equal(merged.price, 125);
    assert.equal(merged.previousClose, 110);
    const { allRows } = buildLedgerQuoteUniverse(trades, [], [merged]);
    const summary = deriveInvestmentSummary({ stockTrades: trades, watchlist: allRows });
    const displayPrice = resolveHoldingDisplayPrice(summary.activePositions[0]);
    assert.equal(displayPrice, 125);
    assert.equal(deriveHoldingStockYtdPercent(allRows[0], displayPrice, now), null);
    const noYtdRows = allRows.map(({ stockYtdBaseline, ...row }) => row);
    assert.deepEqual(summary, deriveInvestmentSummary({ stockTrades: trades, watchlist: noYtdRows }),
      'the additional YTD metadata does not gate or alter the existing financial summary');
  }
});
