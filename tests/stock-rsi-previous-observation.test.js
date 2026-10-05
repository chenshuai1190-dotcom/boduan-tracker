import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockRsi } from '../server/quote/stockRsi.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';
import { STOCK_RSI_RULES } from '../src/lib/stockRsiConfig.js';

function history(closes, lastDate = '2026-10-02') {
  const date = new Date(`${lastDate}T00:00:00Z`);
  return [...closes].reverse().map(adjusted_close => {
    while ([0, 6].includes(date.getUTCDay()) || isRegularNyseHoliday(date.toISOString().slice(0, 10))) {
      date.setUTCDate(date.getUTCDate() - 1);
    }
    const row = { date: date.toISOString().slice(0, 10), adjusted_close };
    date.setUTCDate(date.getUTCDate() - 1);
    return row;
  }).reverse();
}

const pattern = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
const closes = [...Array.from({ length: 4 }, () => pattern).flat(), 45.75, 46.12, 45.4];
const calculate = (rows, completedCutoffDate = rows?.at(-1)?.date ?? '2026-10-02') => buildStockRsi(rows, { completedCutoffDate });
function assertPreviousUnavailable(result) {
  assert.equal(result.previousValue, null);
  assert.equal(result.previousAsOf, null);
}

test('previous RSI is the preceding point of the same adjusted-close Wilder6 recurrence', () => {
  const rows = history(closes);
  const result = calculate(rows);
  const prefix = calculate(rows.slice(0, -1));
  assert.equal(result.previousValue, prefix.value);
  assert.equal(result.previousAsOf, prefix.asOf);
  assert.equal(result.previousAsOf, '2026-10-01');
  assert.equal(result.asOf, '2026-10-02');

  // Independently propagate the published 60-close fixture's gain/loss state
  // from the initial arithmetic mean, rather than restarting RSI at the end.
  const changes = closes.slice(1).map((value, index) => value - closes[index]);
  let gain = changes.slice(0, 6).reduce((sum, change) => sum + Math.max(change, 0), 0) / 6;
  let loss = changes.slice(0, 6).reduce((sum, change) => sum + Math.max(-change, 0), 0) / 6;
  for (const change of changes.slice(6, -1)) {
    gain = (gain * 5 + Math.max(change, 0)) / 6;
    loss = (loss * 5 + Math.max(-change, 0)) / 6;
  }
  assert.ok(Math.abs(result.previousValue - (100 - 100 / (1 + gain / loss))) < 1e-11);
  assert.deepEqual(calculate(rows.map(row => ({ ...row, close: row.adjusted_close * 50 }))), result, 'raw close cannot replace adjusted_close');
  assert.equal(STOCK_RSI_RULES.RSI_OVERSOLD, 20);
  assert.equal(STOCK_RSI_RULES.RSI_OVERBOUGHT, 80);
});

test('previous RSI requires its own 60 completed closes and preserves zero and one hundred', () => {
  for (const count of [0, 6, 7, 59, 60]) {
    const result = calculate(history(Array(count).fill(100)));
    assertPreviousUnavailable(result);
    assert.equal(result.value, count === 60 ? 50 : null);
  }
  for (const [series, expected] of [
    [Array(61).fill(100), 50],
    [Array.from({ length: 61 }, (_, index) => 100 + index), 100],
    [Array.from({ length: 61 }, (_, index) => 100 - index), 0],
  ]) {
    const result = calculate(history(series));
    assert.equal(result.previousValue, expected);
    assert.equal(result.previousAsOf, '2026-10-01');
  }
});

test('cutoff, reverse order and identical duplicates preserve the same completed current and previous pair', () => {
  const rows = history(closes);
  const cutoff = rows.at(-2).date;
  const expected = calculate(rows.slice(0, -1));
  assert.deepEqual(calculate(rows, cutoff), expected);
  assert.deepEqual(calculate([...rows].reverse(), cutoff), expected);
  assert.deepEqual(calculate([...rows, { ...rows.at(-2) }], cutoff), expected);
  assert.deepEqual(calculate([...rows, { date: '2026-10-05', adjusted_close: null }], cutoff), expected);
  assert.equal(expected.previousAsOf, rows.at(-3).date);
});

test('a missing immediately previous trading day leaves both previous fields unknown', () => {
  const rows = history(closes);
  const gap = rows.filter((_, index) => index !== rows.length - 2);
  const result = calculate(gap);
  assert.equal(result.asOf, '2026-10-02');
  assert.ok(Number.isFinite(result.value), 'the existing current RSI behavior is preserved');
  assertPreviousUnavailable(result);
});

test('weekends and regular exchange holidays are skipped when finding the previous session', () => {
  for (const [lastDate, previousAsOf] of [
    ['2026-10-05', '2026-10-02'],
    ['2026-09-08', '2026-09-04'],
    ['2026-04-06', '2026-04-02'],
  ]) {
    const rows = history(closes, lastDate);
    const result = calculate(rows);
    assert.equal(result.asOf, lastDate);
    assert.equal(result.previousAsOf, previousAsOf);
    assert.equal(result.previousValue, calculate(rows.slice(0, -1)).value);
  }
});

test('non-session current or previous rows cannot create a comparable pair', () => {
  const rows = history(closes);
  const weekend = [...rows.slice(0, -1), { ...rows.at(-1), date: '2026-10-03' }];
  assertPreviousUnavailable(calculate(weekend));
  const holiday = history(closes, '2026-09-08');
  holiday[holiday.length - 2] = { ...holiday.at(-2), date: '2026-09-07' };
  assertPreviousUnavailable(calculate(holiday));
});

test('invalid input keeps the additive previous fields explicitly null', () => {
  const rows = history(closes);
  const malformed = rows.map((row, index) => index === 30 ? { ...row, adjusted_close: null } : row);
  for (const result of [
    calculate(malformed),
    buildStockRsi(rows, { completedCutoffDate: '2026-02-30' }),
    buildStockRsi(rows, { completedCutoffDate: rows.at(-1).date, config: { RSI_PERIOD: 14 } }),
    calculate(null),
  ]) {
    assert.equal(result.value, null);
    assertPreviousUnavailable(result);
  }
});
