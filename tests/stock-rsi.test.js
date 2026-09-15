import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockRsi } from '../server/quote/stockRsi.js';
import { buildEodhdStockDetail } from '../server/quote/stockDetail.js';
import { STOCK_RSI_RULES, STOCK_RSI_DIVERGENCE_VERSION, resolveStockRsiRules } from '../src/lib/stockRsiConfig.js';

function history(closes) {
  const day = new Date('2025-01-02T00:00:00Z');
  return closes.map(adjusted_close => {
    while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 1);
    return { date, adjusted_close };
  });
}

function calculate(rows, completedCutoffDate = rows.at(-1)?.date ?? '2026-01-01', config) {
  return buildStockRsi(rows, { completedCutoffDate, config });
}

const formingTail = [110, 120, 115, 110, 116, 119, 121, 120.7, 120.5, 120.3];
function formingCloses(baseLength = 130, alternate = false) {
  return [...Array.from({ length: baseLength }, (_, i) => 100 + (alternate ? i % 2 : 0)), ...formingTail];
}
function extend(closes, extra) { return calculate(history([...closes, ...extra])); }
function assertEmpty(result, state) {
  assert.equal(result.divergenceState, state);
  assert.equal(result.divergenceDate, null);
  assert.equal(result.divergenceConfirmationStrength, null);
  assert.equal(result.divergenceEvent, null);
}
function highRows(rows) {
  return rows.map(row => ({ ...row, close: row.adjusted_close, high: row.adjusted_close }));
}

test('daily RSI(6) preserves Wilder smoothing against an independent high-precision fixture', () => {
  const pattern = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
  const rows = history(Array.from({ length: 4 }, () => pattern).flat());
  const result = calculate(rows);
  assert.ok(Math.abs(result.value - 66.447601787113514813728652593810246392957523229706) < 1e-11);
  assert.equal(result.period, 6);
  assert.equal(result.priceBasis, 'adjusted_close');
  assert.equal(result.asOf, rows.at(-1).date);
  assert.equal(result.divergenceVersion, 'rsi6-lifecycle-v2');
  assert.equal(Object.hasOwn(result, 'bearishDivergence'), false);
});

test('60 completed closes warm up RSI, while an unknown divergence window never becomes NONE', () => {
  for (const size of [0, 6, 7, 59]) {
    const result = calculate(history(Array(size).fill(100)));
    assert.equal(result.value, null);
    assertEmpty(result, null);
  }
  assert.equal(calculate(history(Array(60).fill(100))).value, 50);
  assert.equal(calculate(history(Array.from({ length: 60 }, (_, i) => 100 + i))).value, 100);
  assert.equal(calculate(history(Array.from({ length: 60 }, (_, i) => 100 - i))).value, 0);
  const complete = STOCK_RSI_RULES.RSI_WARMUP_CLOSES + STOCK_RSI_RULES.MAX_PIVOT_DISTANCE
    + STOCK_RSI_RULES.PIVOT_WINDOW + Math.max(STOCK_RSI_RULES.REALIZED_DISPLAY_WINDOW, STOCK_RSI_RULES.INVALIDATED_DISPLAY_WINDOW);
  assertEmpty(calculate(history(Array(complete - 1).fill(100))), null);
  assertEmpty(calculate(history(Array(complete).fill(100))), 'NONE');
  assert.equal(calculate(history(formingCloses(60))).divergenceState, 'FORMING', 'observed evidence does not wait for full absence coverage');
});

test('only adjusted completed closes determine RSI, without raw-price fallback or input mutation', () => {
  const original = history(formingCloses());
  const numericStrings = original.map(row => ({ ...row, adjusted_close: String(row.adjusted_close) }));
  assert.deepEqual(calculate(numericStrings), calculate(original));
  const rawChanged = original.map(row => ({ ...row, close: 900000, low: 0.01 }));
  assert.deepEqual(calculate(rawChanged), calculate(original), 'raw prices without highs cannot affect a close-based signal');
  for (const invalid of [undefined, null, '', ' ', true, false, [], {}, NaN, Infinity, 0, -1, '120oops', '0x10']) {
    const rows = original.map(row => ({ ...row }));
    rows[65].adjusted_close = invalid;
    const result = calculate(rows);
    assert.equal(result.value, null);
    assert.equal(result.asOf, null);
    assertEmpty(result, null);
  }
  const frozen = Object.freeze(original.map(Object.freeze));
  assert.deepEqual(calculate(frozen), calculate(original));
});

test('completed invalid dates, malformed payloads and conflicting closes fail closed', () => {
  const rows = history(formingCloses());
  for (const invalidDate of [undefined, null, '', '2025-02-30', '2025-13-01', '2025-01-00', '2025-01-02T00:00:00Z']) {
    assert.equal(buildStockRsi(rows, { completedCutoffDate: invalidDate }).value, null);
    const malformed = rows.map(row => ({ ...row }));
    malformed[40].date = invalidDate;
    // A syntactically future date is excluded before completed-row validation.
    if (!(typeof invalidDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(invalidDate) && invalidDate.slice(0, 10) > rows.at(-1).date)) {
      assert.equal(calculate(malformed).value, null);
    }
  }
  for (const payload of [undefined, null, {}, [null]]) assert.equal(buildStockRsi(payload, { completedCutoffDate: '2026-01-01' }).value, null);
  assert.equal(calculate([...rows, { ...rows[65], adjusted_close: 1 }], rows.at(-1).date).value, null);
  assert.equal(calculate([...rows, { ...rows[65], adjusted_close: null }], rows.at(-1).date).value, null);
  assert.deepEqual(calculate([...rows, { ...rows[65], adjusted_close: String(rows[65].adjusted_close) }], rows.at(-1).date), calculate(rows));
  assert.deepEqual(calculate([...rows].reverse(), rows.at(-1).date), calculate(rows));
  const scrambled = [...rows];
  [scrambled[64], scrambled[65]] = [scrambled[65], scrambled[64]];
  assert.equal(calculate(scrambled).value, null);
});

test('three completed right-hand bars are required; future fields cannot confirm or invalidate a pivot', () => {
  const rows = history(formingCloses());
  const high2 = rows.length - 4;
  for (let right = 0; right < 3; right += 1) {
    const prefix = rows.slice(0, high2 + 1 + right);
    assertEmpty(calculate(prefix), 'NONE');
    assert.deepEqual(calculate(rows, prefix.at(-1).date), calculate(prefix));
  }
  const result = calculate(rows);
  assert.equal(result.divergenceState, 'FORMING');
  assert.equal(result.divergenceEvent.high2.date, rows[high2].date);
  assert.equal(result.divergenceEvent.formedAt, rows.at(-1).date);
  assert.equal(result.divergenceDate, rows.at(-1).date);
  const future = [...rows, { date: '2026-01-02', adjusted_close: null, high: -1 }, { date: '2026-02-30', adjusted_close: false }];
  assert.deepEqual(calculate(future, rows.at(-1).date), result);
});

test('a 0.5 percent higher high is inclusive, while a smaller price increase is insufficient', () => {
  for (const [peak, state] of [[120.599999, 'NONE'], [120.6, 'FORMING'], [120.600001, 'FORMING']]) {
    const tail = [110, 120, 115, 110, 116, 119, peak, peak - 0.1, peak - 0.2, peak - 0.3];
    assert.equal(calculate(history([...Array(130).fill(100), ...tail])).divergenceState, state);
  }
});

function secondPivotAtRsi(target) {
  let lower = 0;
  let upper = 2;
  const closes = dip => [...Array(130).fill(100), 110, 120, 120 - dip, 120 - 2 * dip, 120 - 1.5 * dip, 120.2, 121];
  for (let i = 0; i < 60; i += 1) {
    const midpoint = (lower + upper) / 2;
    if (calculate(history(closes(midpoint))).value > target) lower = midpoint;
    else upper = midpoint;
  }
  return [...closes((lower + upper) / 2), 120.99, 120.98, 120.97];
}

test('the five-point RSI difference is inclusive and a smaller divergence is rejected', () => {
  const exact = calculate(history(secondPivotAtRsi(95)));
  assert.equal(exact.divergenceState, 'FORMING');
  assert.ok(Math.abs(exact.divergenceEvent.high1.rsi - exact.divergenceEvent.high2.rsi - 5) < 1e-10);
  assertEmpty(calculate(history(secondPivotAtRsi(95.001))), 'NONE');
  assert.equal(calculate(history(secondPivotAtRsi(94.999))).divergenceState, 'FORMING');
});

test('a first-pivot RSI below 70 cannot form divergence even with valid higher and weaker highs', () => {
  const rows = highRows(history(Array.from({ length: 140 }, (_, i) => 100 + i % 2)));
  rows[131].high = 120;
  rows[136].high = 121;
  assertEmpty(calculate(rows), 'NONE');
  const relaxed = calculate(rows, rows.at(-1).date, { DIVERGENCE_MIN_RSI: 50 });
  assert.ok(relaxed.divergenceEvent.high1.rsi < 70);
  assert.ok(relaxed.divergenceEvent.high1.rsi - relaxed.divergenceEvent.high2.rsi >= 5);
});

test('forming confirms at three percent; basic and strong confirmation preserve their observation date', () => {
  const base = formingCloses();
  assert.equal(extend(base, [121 * 0.97 + 0.000001]).divergenceState, 'FORMING');
  const confirmed = extend(base, [121 * 0.97]);
  assert.equal(confirmed.divergenceState, 'CONFIRMED');
  assert.equal(confirmed.divergenceConfirmationStrength, 'BASIC');
  assert.equal(confirmed.divergenceEvent.confirmedAt, confirmed.asOf);
  assert.equal(confirmed.divergenceDate, confirmed.asOf);
  const strongCloses = [...Array(130).fill(200), 100, ...Array(13).fill(100), ...formingTail, 117.2];
  const strong = calculate(history(strongCloses));
  const ma30 = strongCloses.slice(-30).reduce((sum, close) => sum + close, 0) / 30;
  assert.ok(strongCloses.at(-1) < ma30);
  assert.equal(strong.divergenceState, 'CONFIRMED');
  assert.equal(strong.divergenceConfirmationStrength, 'STRONG');
  const recovered = extend(strongCloses, [140]);
  assert.equal(recovered.divergenceState, 'CONFIRMED');
  assert.equal(recovered.divergenceConfirmationStrength, 'STRONG');
  assert.equal(recovered.divergenceDate, strong.divergenceDate);
});

test('a BASIC confirmation only upgrades below MA30 while the three-percent drawdown still holds', () => {
  const closes = [...formingCloses(), 117.2, ...Array(20).fill(150), 120];
  const config = { REALIZED_RSI_THRESHOLD: 0, REALIZED_DRAWDOWN: 0.5 };
  const rows = history(closes);
  const rebound = calculate(rows, rows.at(-1).date, config);
  assert.ok(closes.at(-1) < closes.slice(-30).reduce((sum, close) => sum + close, 0) / 30);
  assert.ok(closes.at(-1) > rebound.divergenceEvent.high2.price * 0.97);
  assert.equal(rebound.divergenceState, 'CONFIRMED');
  assert.equal(rebound.divergenceConfirmationStrength, 'BASIC');
  for (const tail of [[117], [117, 120]]) {
    const extended = history([...closes, ...tail]);
    const result = calculate(extended, extended.at(-1).date, config);
    assert.equal(result.divergenceState, 'CONFIRMED');
    assert.equal(result.divergenceConfirmationStrength, 'STRONG');
    assert.equal(result.divergenceDate, rebound.divergenceDate, 'strength changes do not reset confirmation entry');
  }
});

test('confirmation can realize on the same day by exact eight-percent drawdown', () => {
  const base = formingCloses();
  for (const [close, state] of [[121 * 0.92 + 0.000001, 'CONFIRMED'], [121 * 0.92, 'REALIZED']]) {
    const rows = history([...base, close]);
    const result = calculate(rows, rows.at(-1).date, { REALIZED_RSI_THRESHOLD: 0 });
    assert.equal(result.divergenceState, state);
    if (state === 'REALIZED') {
      assert.ok(result.divergenceEvent.maxDrawdownPct >= 8);
      assert.equal(result.divergenceEvent.confirmedAt, result.divergenceEvent.realizedAt);
      assert.equal(result.divergenceDate, result.asOf);
    }
  }
});

test('a confirmed event realizes from current RSI at or below 40 even before eight-percent drawdown', () => {
  const result = extend(formingCloses(), [117.2, 116, 115, 114, 113]);
  assert.equal(result.divergenceState, 'REALIZED');
  assert.ok(result.value <= 40);
  assert.ok(result.divergenceEvent.maxDrawdownPct < 8);
  assert.ok(result.divergenceEvent.confirmedAt < result.divergenceEvent.realizedAt);
});

test('newly observable pivots can use the completed post-high path without backdating state entry', () => {
  const before = [...Array(130).fill(100), 110, 120, 115, 110, 116, 119, 121];
  for (const [path, state] of [[[117, 120, 120.2], 'CONFIRMED'], [[110, 120, 120.2], 'REALIZED']]) {
    const rows = history([...before, ...path]);
    const result = calculate(rows);
    assert.equal(result.divergenceState, state);
    assert.equal(result.divergenceDate, rows.at(-1).date);
    assert.equal(result.divergenceEvent.formedAt, result.divergenceDate);
    assert.equal(result.divergenceEvent.confirmedAt, result.divergenceDate);
    if (state === 'REALIZED') assert.equal(result.divergenceEvent.realizedAt, result.divergenceDate);
    assertEmpty(calculate(rows, rows.at(-2).date), 'NONE');
  }
  const oversold = extend(formingCloses(), [105]);
  assert.ok(oversold.value < 30);
  assert.equal(oversold.divergenceState, 'REALIZED', 'RSI 30 must not remain merely confirmed');
  assert.equal(oversold.divergenceConfirmationStrength, 'STRONG');
});

test('the High2 bar itself can confirm or realize a long upper wick before the right-hand bars recover', () => {
  for (const [fraction, state] of [[0.97, 'CONFIRMED'], [0.92, 'REALIZED']]) {
    const rows = highRows(history(formingCloses()));
    const pivot = rows.length - 4;
    rows[pivot].close = rows[pivot].adjusted_close = rows[pivot].high * fraction;
    const result = calculate(rows, rows.at(-1).date, { REALIZED_RSI_THRESHOLD: 0 });
    assert.ok(rows.slice(pivot + 1).every(row => row.close > rows[pivot].high * 0.97));
    assert.equal(result.divergenceState, state);
    assert.equal(result.divergenceEvent.high2.date, rows[pivot].date);
    assert.equal(result.divergenceEvent.formedAt, result.asOf);
    assert.equal(result.divergenceEvent.confirmedAt, result.asOf);
    assert.equal(result.divergenceDate, result.asOf);
    assert.equal(result.divergenceEvent.realizedAt, state === 'REALIZED' ? result.asOf : null);
    assert.ok(result.divergenceEvent.maxDrawdownPct >= (state === 'REALIZED' ? 8 : 3));
    assertEmpty(calculate(rows, rows.at(-2).date, { REALIZED_RSI_THRESHOLD: 0 }), 'NONE');
  }
});

test('forming invalidation needs both a new price high and recovered first-pivot RSI; confirmed events do not regress', () => {
  const base = formingCloses(130, true);
  const initial = calculate(history(base));
  assert.equal(extend(base, [121]).divergenceState, 'FORMING');
  const priceOnly = extend(base, [122]);
  assert.ok(priceOnly.value < initial.divergenceEvent.high1.rsi);
  assert.equal(priceOnly.divergenceState, 'FORMING');
  const invalidated = extend(base, [1000]);
  assert.equal(invalidated.divergenceState, 'INVALIDATED');
  assert.equal(invalidated.divergenceDate, invalidated.asOf);
  assert.equal(invalidated.divergenceConfirmationStrength, null);
  assert.equal(invalidated.divergenceEvent.confirmedAt, null);
  assert.equal(invalidated.divergenceEvent.invalidatedAt, invalidated.asOf);
  assert.equal(extend(base, [117.2, 1000]).divergenceState, 'CONFIRMED');
});

test('REALIZED displays on entry day through day four, then NONE without reviving the old pair', () => {
  for (const baseLength of [60, 130]) {
    const base = [...formingCloses(baseLength), 105];
    const entered = calculate(history(base));
    for (const age of [0, 1, 4, 5, 20]) {
      const result = extend(base, Array(age).fill(105));
      if (age < 5) {
        assert.equal(result.divergenceState, 'REALIZED');
        assert.equal(result.divergenceDate, entered.divergenceDate);
      } else {
        assertEmpty(result, 'NONE');
        assert.ok(result.value < 40, 'historical oversold RSI does not preserve an expired event');
      }
    }
  }
});

test('INVALIDATED displays on entry day through day two, then NONE without reviving the old pair', () => {
  const base = [...formingCloses(130, true), 1000];
  const entered = calculate(history(base));
  for (const age of [0, 1, 2, 3, 12]) {
    const result = extend(base, Array(age).fill(1000));
    if (age < 3) {
      assert.equal(result.divergenceState, 'INVALIDATED');
      assert.equal(result.divergenceDate, entered.divergenceDate);
    } else assertEmpty(result, 'NONE');
  }
});

test('multiple swings select the nearest qualifying previous high and a newly completed pair replaces the active event', () => {
  const base = formingCloses();
  const original = calculate(history(base));
  const rows = history([...base, 118, 116, 119, 121, 122, 121.6, 121.4, 121.2]);
  // Keep the original pair FORMING so a higher, newly completed pair may replace it.
  const nearest = calculate(rows, rows.at(-1).date, { CONFIRMATION_DRAWDOWN: 0.05 });
  assert.equal(nearest.divergenceState, 'FORMING');
  assert.equal(nearest.divergenceEvent.high1.date, original.divergenceEvent.high2.date);
  assert.equal(nearest.divergenceEvent.high2.price, 122);
  assert.ok(nearest.divergenceDate > original.divergenceDate);
  const olderQualifying = extend(base, [121, 122, 121.9, 121.8, 121.7]);
  assert.equal(olderQualifying.divergenceEvent.high1.date, original.divergenceEvent.high1.date,
    'a closer peak that fails the RSI difference cannot hide the nearest valid pair');
});

test('a lower rebound pair cannot replace active risk, but can start after the previous event ends', () => {
  const rows = highRows(history([...formingCloses(),
    117.2, 117.2, 117.2, 118, 117, 116, 116.5, 117, 116.5, 118.7, 118.5, 118.3]));
  rows[148].high = 119;
  const config = { DIVERGENCE_MIN_RSI: 0, REALIZED_RSI_THRESHOLD: 0 };
  for (const [extra, state] of [[{}, 'CONFIRMED'], [{ CONFIRMATION_DRAWDOWN: 0.05 }, 'FORMING']]) {
    const result = calculate(rows, rows.at(-1).date, { ...config, ...extra });
    assert.equal(result.divergenceState, state);
    assert.equal(result.divergenceEvent.high2.price, 121);
    assert.equal(result.divergenceEvent.formedAt, rows[139].date);
  }
  const afterTerminal = calculate(rows, rows.at(-1).date, { ...config, REALIZED_DRAWDOWN: 0.03 });
  assert.equal(afterTerminal.divergenceState, 'FORMING');
  assert.equal(afterTerminal.divergenceEvent.high1.price, 118);
  assert.equal(afterTerminal.divergenceEvent.high2.price, 119, 'the lower pair is valid, and eligible after the old event ends');
  assert.equal(afterTerminal.divergenceDate, rows.at(-1).date);
});

test('the existing event confirms on the candidate discovery day before replacement is considered', () => {
  const rows = highRows(history([...formingCloses(),
    117.8, 117.7, 117.6, 118, 117.7, 117.5, 117.6, 117.8, 117.5, 118.7, 118.5, 117.2]));
  rows[148].high = 119;
  const config = { DIVERGENCE_MIN_RSI: 0, REALIZED_RSI_THRESHOLD: 0 };
  assert.equal(calculate(rows, rows.at(-2).date, config).divergenceState, 'FORMING');
  const result = calculate(rows, rows.at(-1).date, config);
  assert.equal(result.divergenceState, 'CONFIRMED');
  assert.equal(result.divergenceEvent.high2.price, 121);
  assert.equal(result.divergenceEvent.confirmedAt, result.asOf);
  const terminalReplaced = calculate(rows, rows.at(-1).date, { ...config, REALIZED_DRAWDOWN: 0.03 });
  assert.equal(terminalReplaced.divergenceState, 'FORMING');
  assert.equal(terminalReplaced.divergenceEvent.high2.price, 119, 'a genuinely new pair can replace a terminal event');
});

test('even a higher candidate cannot downgrade an already CONFIRMED event to FORMING', () => {
  const base = formingCloses();
  const original = calculate(history(base));
  const rows = history([...base, 118, 116, 119, 121, 122, 121.6, 121.4, 121.2]);
  const result = calculate(rows);
  assert.equal(result.divergenceState, 'CONFIRMED');
  assert.equal(result.divergenceEvent.high2.price, 121);
  assert.equal(result.divergenceEvent.formedAt, original.divergenceDate);
  assert.equal(result.divergenceEvent.confirmedAt, rows[141].date);
});

test('flat highs and pivots outside the 5–60 trading-record distance do not qualify', () => {
  for (const tail of [
    [110, 120, 117, 114, 116, 119, 120, 119.7, 119.5, 119.3],
    [110, 120, 117, 114, 116, 121, 121, 120.7, 120.5, 120.3],
    [110, 120, 117, 114, 118, 121, 120.7, 120.5, 120.3],
    [110, 120, 117, 114, ...Array(58).fill(114), 119, 121, 120.7, 120.5, 120.3],
  ]) assertEmpty(calculate(history([...Array(130).fill(100), ...tail])), 'NONE');
});

test('adjusted highs unify split and dividend factors; any missing high switches the entire history to closes', () => {
  const closes = formingCloses();
  closes[136] = 120;
  const rows = highRows(history(closes));
  rows[136].high = 121.5;
  const original = calculate(rows);
  assert.equal(original.divergenceState, 'FORMING');
  assert.equal(original.divergenceEvent.high2.price, 121.5);
  const transformed = rows.map((row, index) => {
    const factor = index < 134 ? 0.5 * 0.9 : 0.9;
    return Object.freeze({ ...row, close: row.close / factor, high: row.high / factor });
  });
  const converted = calculate(Object.freeze(transformed));
  assert.equal(converted.divergenceState, original.divergenceState);
  assert.equal(converted.value, original.value);
  assert.ok(Math.abs(converted.divergenceEvent.high1.price - original.divergenceEvent.high1.price) < 1e-10);
  assert.ok(Math.abs(converted.divergenceEvent.high2.price - original.divergenceEvent.high2.price) < 1e-10);
  const partial = rows.map((row, index) => index === 0 ? { date: row.date, adjusted_close: row.adjusted_close } : row);
  assertEmpty(calculate(partial), 'NONE', 'mixed high/close pivots are not permitted');
});

test('bad supplied highs keep RSI available but make the lifecycle unknown instead of silently substituting closes', () => {
  const rows = highRows(history(formingCloses()));
  const expected = calculate(rows);
  for (const high of [0, -1, '', true, {}, NaN, Infinity, '120oops', 1]) {
    const bad = rows.map((row, index) => index === 65 ? { ...row, high } : row);
    const result = calculate(bad);
    assert.equal(result.value, expected.value);
    assert.equal(result.asOf, expected.asOf);
    assertEmpty(result, null);
  }
  const missingRaw = rows.map((row, index) => index === 65 ? { ...row, close: null } : row);
  assertEmpty(calculate(missingRaw), null);
  const duplicate = [...rows, { ...rows[65], high: rows[65].high + 1 }];
  assertEmpty(calculate(duplicate, rows.at(-1).date), null);
});

test('local confirmation MA30 neither mutates input prices nor changes stock-detail moving averages', () => {
  const rows = highRows(history([...formingCloses(), 117.2])).map(row => Object.freeze({
    ...row, close: row.close * 2, high: row.high * 2,
  }));
  const options = { asOfDate: rows.at(-1).date, splitActions: [] };
  const before = buildEodhdStockDetail(rows, options);
  const result = calculate(Object.freeze(rows));
  const after = buildEodhdStockDetail(rows, options);
  assert.equal(result.divergenceState, 'CONFIRMED');
  assert.deepEqual(after.history, before.history);
  assert.deepEqual(after.ma200DailyHistory, before.ma200DailyHistory);
  assert.deepEqual(after.weeklyHistory, before.weeklyHistory);
});

test('the shared lifecycle configuration is frozen and validated while RSI6 and its 60-close warmup stay fixed', () => {
  assert.equal(Object.isFrozen(STOCK_RSI_RULES), true);
  assert.equal(STOCK_RSI_DIVERGENCE_VERSION, 'rsi6-lifecycle-v2');
  assert.equal(STOCK_RSI_RULES.RSI_PERIOD, 6);
  assert.equal(STOCK_RSI_RULES.PIVOT_WINDOW, 3);
  assert.equal(resolveStockRsiRules({ PIVOT_WINDOW: 4 }).PIVOT_WINDOW, 4);
  const rows = history(formingCloses());
  for (const config of [null, [], { UNKNOWN: 3 }, { RSI_PERIOD: 14 }, { RSI_WARMUP_CLOSES: 59 },
    { PIVOT_WINDOW: 0 }, { MIN_PIVOT_DISTANCE: 61 }, { REALIZED_DISPLAY_WINDOW: 1.5 },
    { MIN_RSI_DIFFERENCE: NaN }, { RSI_OVERBOUGHT: 101 }, { CONFIRMATION_DRAWDOWN: 0.5 },
    { PRICE_HIGHER_HIGH_THRESHOLD: '0.005' }]) {
    assert.equal(resolveStockRsiRules(config), null);
    assertEmpty(calculate(rows, rows.at(-1).date, config), null);
  }
});
