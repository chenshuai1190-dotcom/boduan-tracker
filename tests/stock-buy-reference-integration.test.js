import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockRsi } from '../server/quote/stockRsi.js';
import { buildEodhdStockDetail } from '../server/quote/stockDetail.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

function fixture() {
  const date = new Date('2025-01-02T00:00:00Z');
  return [...Array.from({ length: 320 }, (_, index) => 100 + index * 0.3), 192, 189, 186, 190, 193, 198]
    .map(close => {
      while ([0, 6].includes(date.getUTCDay()) || isRegularNyseHoliday(date.toISOString().slice(0, 10))) {
        date.setUTCDate(date.getUTCDate() + 1);
      }
      const key = date.toISOString().slice(0, 10);
      date.setUTCDate(date.getUTCDate() + 1);
      return { date: key, close, adjusted_close: close, high: close + 1, low: close - 1, volume: 1_000_000 };
    });
}

function calculate(rows, { cutoff = rows.at(-1).date, splits = [] } = {}) {
  const detail = buildEodhdStockDetail(rows, { asOfDate: cutoff, splitActions: splits });
  const signal = buildStockRsi(rows, {
    completedCutoffDate: cutoff, includeTrendMomentum: true, buyReferenceHistory: detail.history,
  });
  return { detail, signal, reference: signal.buyReference };
}

test('actual detail and existing Wilder pipeline produce an observed recovery with matching completed dates', () => {
  const rows = fixture();
  const observation = calculate(rows.slice(0, 321));
  assert.equal(observation.reference.state, 'watch');
  assert.equal(observation.reference.rsi, observation.signal.value);
  assert.ok(observation.reference.rsi <= 30);
  const recovery = calculate(rows.slice(0, 325));
  assert.equal(recovery.reference.state, 'triggered');
  assert.equal(recovery.reference.confirmationPrice, 190);
  assert.equal(recovery.reference.event.lowPrice, 186);
  assert.equal(recovery.reference.event.startedAt, rows[320].date);
  assert.equal(recovery.reference.event.triggeredAt, rows[324].date);
  assert.equal(recovery.reference.event.remainingTradingDays, 5);
  assert.equal(recovery.reference.close, recovery.detail.history.at(-1).close);
  assert.equal(recovery.reference.rsi, recovery.signal.value);
  assert.equal(recovery.reference.previousRsi, recovery.signal.previousValue);
  assert.equal(recovery.reference.asOfDate, recovery.detail.asOfDate);
  assert.equal(recovery.reference.asOfDate, recovery.signal.asOf);
});

test('opt-in adds exactly one field and preserves every existing RSI/trend result and input', () => {
  const rows = fixture();
  const before = structuredClone(rows);
  const cutoff = rows.at(-1).date;
  const { detail } = calculate(rows);
  for (const includeTrendMomentum of [false, true]) {
    const options = { completedCutoffDate: cutoff, includeTrendMomentum };
    const baseline = buildStockRsi(rows, options);
    assert.equal(Object.hasOwn(baseline, 'buyReference'), false);
    const { buyReference, ...withReference } = buildStockRsi(rows, { ...options, buyReferenceHistory: detail.history });
    assert.deepEqual(withReference, baseline);
    assert.equal(buyReference.rsi, baseline.value);
    assert.equal(Object.hasOwn(withReference, 'trendMomentum'), includeTrendMomentum);
  }
  assert.deepEqual(rows, before);
  assert.deepEqual(calculate(rows).detail, detail, 'reference construction must not alter any existing detail MA/history');
});

test('RSI warmup, missing split actions and an outdated completed date stay unavailable', () => {
  const rows = fixture();
  for (const size of [20, 59, 60, 199]) {
    assert.equal(calculate(rows.slice(0, size)).reference.state, 'unavailable');
  }
  for (const splits of [null, [{ date: rows[200].date, split: 'invalid' }]]) {
    const result = calculate(rows, { splits });
    assert.deepEqual(result.detail.history, []);
    assert.equal(result.reference.state, 'unavailable');
    assert.equal(result.reference.reason, 'missing_history');
    assert.ok(Number.isFinite(result.signal.value), 'missing split metadata must not change the separate RSI output');
  }
  const detailWithoutSplits = buildEodhdStockDetail(rows, { asOfDate: rows.at(-1).date });
  assert.deepEqual(detailWithoutSplits.history, []);
  const stale = calculate(rows.slice(0, -1), { cutoff: rows.at(-1).date });
  assert.equal(stale.reference.state, 'unavailable');
  assert.equal(stale.reference.reason, 'date_mismatch');
});

test('split adjustment applies once to reference prices while adjusted-close RSI remains unchanged', () => {
  const rows = fixture();
  const splitDate = rows[322].date;
  const splitRows = rows.map(row => row.date < splitDate
    ? { ...row, close: row.close * 4, high: row.high * 4, low: row.low * 4 }
    : { ...row });
  const baseline = calculate(rows);
  const split = calculate(splitRows, { splits: [{ date: splitDate, split: '4/1' }] });
  assert.equal(split.detail.priceBasis, 'split_adjusted_close');
  assert.equal(split.detail.splitActionCount, 1);
  assert.deepEqual(split.detail.history, baseline.detail.history);
  assert.deepEqual(split.reference, baseline.reference);
  assert.equal(split.signal.value, baseline.signal.value);
  assert.equal(split.signal.previousValue, baseline.signal.previousValue);
  assert.deepEqual(split.signal.trendMomentum, baseline.signal.trendMomentum);
  assert.equal(split.reference.confirmationPrice, 190);
  assert.equal(split.reference.event.lowPrice, 186);
});

test('dividend-adjusted RSI is reused without replacing split-adjusted reference price and MA units', () => {
  const rows = fixture();
  const adjusted = rows.map(row => ({ ...row, adjusted_close: row.adjusted_close * 0.5 }));
  const baseline = calculate(rows);
  const result = calculate(adjusted);
  assert.equal(result.signal.priceBasis, 'adjusted_close');
  assert.equal(result.detail.priceBasis, 'split_adjusted_close');
  assert.equal(result.reference.rsi, result.signal.value);
  assert.equal(result.signal.value, baseline.signal.value);
  assert.deepEqual(result.detail.history, baseline.detail.history);
  assert.deepEqual(result.reference, baseline.reference);
  assert.equal(result.reference.close, 198, 'RSI adjusted-close scale must not leak into price fields');
});

test('future provider rows cannot affect a completed reference through either input pipeline', () => {
  const rows = fixture();
  const cutoff = rows[324].date;
  const prefix = calculate(rows.slice(0, 325), { cutoff });
  const all = calculate(rows, { cutoff });
  assert.deepEqual(all, prefix);
  rows.at(-1).close = null;
  rows.at(-1).adjusted_close = null;
  assert.deepEqual(calculate(rows, { cutoff }), prefix);
});

test('a price row dropped by detail normalization cannot be bridged using RSI alone', () => {
  const rows = fixture();
  rows.at(-2).close = null;
  rows.at(-2).high = null;
  const result = calculate(rows);
  assert.equal(result.detail.history.length + 1, calculate(fixture()).detail.history.length);
  assert.equal(result.reference.state, 'unavailable');
  assert.equal(result.reference.reason, 'insufficient_indicator_history');
});
