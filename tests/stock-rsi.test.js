import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockRsi } from '../server/quote/stockRsi.js';

function history(closes) {
  const day = new Date('2025-01-02T00:00:00Z');
  return closes.map(adjusted_close => {
    while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 1);
    return { date, adjusted_close };
  });
}

function calculate(rows, completedCutoffDate = rows.at(-1)?.date ?? '2026-01-01') {
  return buildStockRsi(rows, { completedCutoffDate });
}

function divergenceHistory(baseLength = 130) {
  // First high: RSI 100; second, higher high: RSI about 75.14.
  return history([...Array(baseLength).fill(100), 110, 120, 115, 110, 116, 119, 121, 118, 116]);
}

test('daily RSI(6) follows Wilder smoothing against an independent high-precision fixture', () => {
  const pattern = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
  const rows = history(Array.from({ length: 4 }, () => pattern).flat());
  const result = calculate(rows);
  // Calculated independently with 50-digit decimal arithmetic.
  assert.ok(Math.abs(result.value - 66.447601787113514813728652593810246392957523229706) < 1e-11);
  assert.equal(result.period, 6);
  assert.equal(result.priceBasis, 'adjusted_close');
  assert.equal(result.asOf, rows.at(-1).date);
});

test('60 completed closes warm up RSI; missing history does not become zero or neutral', () => {
  for (const size of [0, 6, 7, 59]) {
    const result = calculate(history(Array(size).fill(100)));
    assert.equal(result.value, null);
    assert.equal(result.bearishDivergence, 'insufficient_data');
  }
  assert.equal(calculate(history(Array(60).fill(100))).value, 50);
  assert.equal(calculate(history(Array.from({ length: 60 }, (_, i) => 100 + i))).value, 100);
  assert.equal(calculate(history(Array.from({ length: 60 }, (_, i) => 100 - i))).value, 0);
});

test('only adjusted completed closes participate, with no fallback to raw prices', () => {
  const original = divergenceHistory();
  const rawChanged = original.map(row => ({ ...row, close: 900_000, high: 1, low: 0.01 }));
  assert.deepEqual(calculate(rawChanged), calculate(original));
  const numericStrings = original.map(row => ({ ...row, adjusted_close: String(row.adjusted_close) }));
  assert.deepEqual(calculate(numericStrings), calculate(original));
  for (const invalid of [undefined, null, '', ' ', true, false, [], {}, NaN, Infinity, 0, -1, '120oops', '0x10']) {
    const rows = rawChanged.map(row => ({ ...row }));
    rows[65].adjusted_close = invalid;
    const result = calculate(rows);
    assert.equal(result.value, null);
    assert.equal(result.asOf, null);
    assert.equal(result.bearishDivergence, 'insufficient_data');
  }
});

test('invalid dates, malformed payloads and conflicting duplicate facts fail closed', () => {
  const rows = divergenceHistory();
  for (const invalidDate of [undefined, null, '', '2025-02-30', '2025-13-01', '2025-01-00', '2025-01-02T00:00:00Z']) {
    assert.equal(buildStockRsi(rows, { completedCutoffDate: invalidDate }).value, null);
    const malformed = rows.map(row => ({ ...row }));
    malformed[40].date = invalidDate;
    assert.equal(calculate(malformed).value, null);
  }
  for (const payload of [undefined, null, {}, [null]]) {
    assert.equal(buildStockRsi(payload, { completedCutoffDate: '2026-01-01' }).value, null);
  }
  assert.equal(calculate([...rows, { ...rows[65], adjusted_close: 1 }]).value, null);
  assert.equal(calculate([...rows, { ...rows[65], adjusted_close: null }]).value, null);
  assert.deepEqual(calculate([...rows, { ...rows[65], adjusted_close: String(rows[65].adjusted_close) }], rows.at(-1).date), calculate(rows));
});

test('chronological and reverse order agree without mutating inputs; scrambled history is rejected', () => {
  const rows = divergenceHistory();
  const original = JSON.stringify(rows);
  assert.deepEqual(calculate([...rows].reverse(), rows.at(-1).date), calculate(rows));
  assert.equal(JSON.stringify(rows), original);
  const scrambled = [...rows];
  [scrambled[64], scrambled[65]] = [scrambled[65], scrambled[64]];
  assert.equal(calculate(scrambled).value, null);
});

test('future or in-progress daily bars cannot affect current RSI or confirm divergence', () => {
  const rows = divergenceHistory();
  const beforeConfirmation = rows.slice(0, -1);
  const cutoff = beforeConfirmation.at(-1).date;
  assert.deepEqual(calculate(rows, cutoff), calculate(beforeConfirmation));
  const futureInvalid = [...beforeConfirmation, { ...rows.at(-1), adjusted_close: null }];
  assert.deepEqual(calculate(futureInvalid, cutoff), calculate(beforeConfirmation));
  assert.equal(calculate(beforeConfirmation).bearishDivergence, 'none');
  assert.equal(calculate(rows).bearishDivergence, 'confirmed');
});

test('a higher price and lower RSI become divergence only after two completed right-hand bars', () => {
  const rows = divergenceHistory();
  const secondHigh = rows.length - 3;
  assert.ok(calculate(rows.slice(0, secondHigh + 1)).value < 80, 'divergence is independent of the overbought zone');
  assert.equal(calculate(rows.slice(0, secondHigh + 1)).bearishDivergence, 'none');
  assert.equal(calculate(rows.slice(0, secondHigh + 2)).bearishDivergence, 'none');
  const confirmed = calculate(rows);
  assert.equal(confirmed.bearishDivergence, 'confirmed');
  assert.equal(confirmed.divergenceDate, rows.at(-1).date, 'date is confirmation, never backdated to the price high');
  assert.ok(confirmed.value < 80, 'falling below 80 does not remove a valid divergence');
});

test('confirmed divergence remains active through 10 subsequent completed trading bars, then expires', () => {
  const base = divergenceHistory();
  const closes = base.map(row => row.adjusted_close);
  const tenth = history([...closes, ...Array(10).fill(115)]);
  const eleventh = history([...closes, ...Array(11).fill(115)]);
  assert.equal(calculate(tenth).bearishDivergence, 'confirmed');
  assert.equal(calculate(tenth).divergenceDate, base.at(-1).date);
  assert.equal(calculate(eleventh).bearishDivergence, 'none');
  assert.equal(calculate(eleventh).divergenceDate, null);
});

test('a later close above the second high invalidates the active signal immediately', () => {
  const closes = divergenceHistory().map(row => row.adjusted_close);
  assert.equal(calculate(history([...closes, 121])).bearishDivergence, 'confirmed');
  const result = calculate(history([...closes, 121.01]));
  assert.equal(result.bearishDivergence, 'none');
  assert.equal(result.divergenceDate, null);
});

test('equal/plateau highs, peaks less than 5 bars apart and peaks over 60 bars apart do not qualify', () => {
  const flat = Array(130).fill(100);
  for (const tail of [
    [110, 120, 117, 114, 116, 119, 120, 118, 116],
    [110, 120, 117, 114, 116, 121, 121, 118, 116],
    [110, 120, 117, 114, 118, 121, 118, 116],
    [110, 120, 117, 114, ...Array(57).fill(114), 119, 121, 118, 116],
  ]) {
    assert.equal(calculate(history([...flat, ...tail])).bearishDivergence, 'none');
  }
});

test('no-divergence requires the full active/lookback window; earlier confirmed evidence can still be shown', () => {
  assert.equal(calculate(history(Array(131).fill(100))).bearishDivergence, 'insufficient_data');
  assert.equal(calculate(history(Array(132).fill(100))).bearishDivergence, 'none');
  const shorter = divergenceHistory(60);
  assert.equal(calculate(shorter).bearishDivergence, 'confirmed');
  assert.equal(calculate(shorter).divergenceDate, shorter.at(-1).date);
});
