import test from 'node:test';
import assert from 'node:assert/strict';
import { collectReviewReplayTrades, buildReviewStockReplay, reviewReplayRequestRange, reviewReplayVisibleRows } from '../src/lib/reviewStockReplayModel.js';
const trade = (date, side = 'buy', extra = {}) => ({ id: date, symbol: 'NVDA', date, side, price: 125, shares: 2, currency: 'USD', ...extra });
const rows = [{ date: '2026-10-02', close: 122 }, { date: '2026-10-05', close: 123 }, { date: '2026-10-06', close: 126 }];
const history = { source: 'EODHD_EOD_SPLITS', priceBasis: 'split_adjusted_close', series: { NVDA: { rows } } };
const base = { symbol: 'NVDA', userId: 'a', endDate: '2026-10-06', history };
test('empty ledger remains empty and valid history is still usable', () => {
  const result = buildReviewStockReplay(base); assert.equal(result.validHistory, true); assert.deepEqual(result.trades, []);
});
test('non-trading and missing dates never move to a nearby daily close', () => {
  const result = buildReviewStockReplay({ ...base, stockTrades: [trade('2026-10-03'), trade('2026-10-01'), trade('2026-10-05')] });
  assert.deepEqual(result.trades.map(t => t.markerDate), [null, null, '2026-10-05']);
  assert.deepEqual(result.trades.map(t => t.close), [null, null, 123]);
  assert.equal(result.trades[2].price, 125);
});
test('same-day buy and sell remain separate with stable input order and actual execution prices', () => {
  const result = buildReviewStockReplay({ ...base, stockTrades: [trade('2026-10-05', 'sell', { id: 'b', price: 127 }), trade('2026-10-02'), trade('2026-10-05', 'buy', { id: 'c' })] });
  assert.deepEqual(result.trades.map(t => t.id), ['2026-10-02', 'b', 'c']);
  assert.deepEqual(result.trades.slice(1).map(t => [t.sameDayOrder, t.sameDayCount, t.rowIndex]), [[1, 2, 1], [2, 2, 1]]);
  assert.equal(result.trades[1].price, 127); assert.equal(result.trades[1].close, 123);
});
test('owner mismatch, other symbols and non-ledger scope are excluded', () => {
  const stockTrades = [trade('2026-10-05', 'buy', { user_id: 'b' }), trade('2026-10-05', 'buy', { userId: 'b' }), trade('2026-10-05', 'buy', { scope: 'swing' }), trade('2026-10-05', 'buy', { symbol: 'TSM' }), trade('2026-10-05', 'buy', { user_id: 'a' })];
  assert.equal(collectReviewReplayTrades({ ...base, stockTrades }).length, 1);
  assert.deepEqual(collectReviewReplayTrades({ ...base, userId: '', stockTrades }), []);
});
test('invalid, unsorted, future and weekend history fail closed', () => {
  for (const prices of [[...rows].reverse(), [...rows, { date: '2026-10-07', close: 120 }], [{ date: '2026-10-03', close: 120 }], [{ date: '2026-10-05', close: 0 }]]) {
    assert.equal(buildReviewStockReplay({ ...base, history: { ...history, series: { NVDA: { rows: prices } } } }).validHistory, false);
  }
});
test('dividend-adjusted data and unapproved synthetic history cannot masquerade as split-adjusted prices', () => {
  assert.equal(buildReviewStockReplay({ ...base, history: { ...history, priceBasis: 'adjusted_close' } }).validHistory, false);
  assert.equal(buildReviewStockReplay({ ...base, history: { ...history, synthetic: true } }).validHistory, false);
  assert.equal(buildReviewStockReplay({ ...base, allowSynthetic: true, history: { ...history, synthetic: true } }).validHistory, true);
});
test('request range is bounded by completed close; local ranges do not invent trade-day rows', () => {
  const range = reviewReplayRequestRange([trade('2026-10-05'), trade('2027-01-01')], '2026-10-06');
  assert.equal(range.endDate, '2026-10-06'); assert.ok(range.startDate < '2026-10-05');
  assert.equal(reviewReplayVisibleRows(rows, '2026-10-03').some(r => r.date === '2026-10-03'), false);
});

test('chart flags missing sessions while retaining ordinary weekend continuity', () => {
  const normal = buildReviewStockReplay(base);
  assert.equal(normal.rows[1].gapBefore, false);
  const gap = buildReviewStockReplay({ ...base, history: { ...history, series: { NVDA: { rows: [rows[0], rows[2]] } } } });
  assert.equal(gap.rows[1].gapBefore, true);
});
