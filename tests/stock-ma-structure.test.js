import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStockMaStructure, deriveStockMaTrend, STOCK_MA_TREND_CONFIG } from '../src/lib/stockMaStructure.js';

const asOfDate = '2026-09-15';
const bullishRow = Object.freeze({ date: asOfDate, close: 120, ma30: 110, ma60: 100, ma200: 90 });

function derive(overrides = {}) {
  return deriveStockMaStructure({ ...bullishRow, ...overrides }, { asOfDate });
}

test('daily MA structure classifies complete same-date rows by their actual ordering', () => {
  for (const [status, values] of [
    ['bullish', { close: 120, ma30: 110, ma60: 100, ma200: 90 }],
    ['bearish', { close: 80, ma30: 90, ma60: 100, ma200: 110 }],
    ['long_term_up', { close: 120, ma30: 100, ma60: 110, ma200: 90 }],
    ['long_term_up', { close: 105, ma30: 100, ma60: 110, ma200: 90 }],
    ['long_term_up', { close: 100, ma30: 110, ma60: 120, ma200: 90 }],
    ['long_term_down', { close: 80, ma30: 110, ma60: 100, ma200: 90 }],
    ['long_term_up', { close: 105, ma30: 110, ma60: 100, ma200: 90 }],
    ['long_term_up', { close: 120, ma30: 110, ma60: 80, ma200: 90 }],
  ]) {
    assert.deepEqual(derive(values), { status, asOfDate });
  }
});

test('static structure describes long-term position without claiming repair or weakening', () => {
  assert.deepEqual(derive({ close: 95, ma30: 100, ma60: 110 }), {
    status: 'long_term_up', asOfDate,
  });
  assert.equal(derive({ close: 85, ma30: 100, ma60: 110 }).status, 'long_term_down');
});

test('equal short averages retain long-term position and exact MA200 equality is separate', () => {
  for (const values of [
    { close: 110 },
    { ma30: 100 },
    { ma60: 90 },
  ]) {
    assert.equal(derive(values).status, 'long_term_up');
  }
  assert.equal(derive({ close: 90 }).status, 'at_ma200');
  assert.equal(derive({ close: 100, ma30: 100, ma60: 100, ma200: 100 }).status, 'at_ma200');
  assert.equal(derive({ close: 89.999999 }).status, 'long_term_down');
  assert.equal(derive({ close: 110.000001 }).status, 'bullish');
  assert.equal(derive({ close: 100, ma30: 100, ma60: 110 }).status, 'long_term_up');
});

test('each close and daily MA must be a finite positive number even when another value signals risk', () => {
  for (const field of ['close', 'ma30', 'ma60', 'ma200']) {
    for (const value of [undefined, null, '', '100', false, true, 0, -1, NaN, Infinity, -Infinity]) {
      assert.deepEqual(derive({ close: 80, [field]: value }), { status: 'unavailable', asOfDate });
    }
  }
  assert.deepEqual(deriveStockMaStructure(null, { asOfDate }), { status: 'unavailable', asOfDate });
  assert.deepEqual(deriveStockMaStructure([bullishRow], { asOfDate }), { status: 'unavailable', asOfDate });
});

test('older and future rows cannot substitute for the requested completed trading date', () => {
  for (const date of ['2026-09-14', '2026-09-16', '', undefined, '2026-09-15T00:00:00Z']) {
    assert.deepEqual(derive({ date }), { status: 'unavailable', asOfDate });
  }
  assert.deepEqual(deriveStockMaStructure(bullishRow), { status: 'unavailable', asOfDate: '' });
});

test('calendar dates must be exact real dates on both sides of the comparison', () => {
  for (const date of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-9-15', 'invalid', null]) {
    assert.deepEqual(deriveStockMaStructure({ ...bullishRow, date }, { asOfDate: date }), {
      status: 'unavailable', asOfDate: '',
    });
  }
  assert.deepEqual(deriveStockMaStructure({ ...bullishRow, date: '2024-02-29' }, { asOfDate: '2024-02-29' }), {
    status: 'bullish', asOfDate: '2024-02-29',
  });
});

test('classification does not use quote, weekly, or older-row substitutes and leaves input unchanged', () => {
  const row = Object.freeze({
    ...bullishRow,
    ma60: null,
    price: 120,
    ma60Weekly: 100,
    previousRow: bullishRow,
  });
  assert.deepEqual(deriveStockMaStructure(row, { asOfDate }), { status: 'unavailable', asOfDate });
  assert.equal(row.ma60, null);
  assert.deepEqual(deriveStockMaStructure(bullishRow, { asOfDate }), { status: 'bullish', asOfDate });
});

function trendHistory(pairs, latest = {}) {
  const dates = [];
  const cursor = new Date(asOfDate + 'T00:00:00Z');
  while (dates.length < pairs.length) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return pairs.map(([ma30, ma60], index) => ({
    date: dates[index], ma30, ma60,
    ...(index === pairs.length - 1 ? { close: 1200, ma200: 900, ...latest } : {}),
  }));
}

function trend(pairs, latest, config) {
  return deriveStockMaTrend(trendHistory(pairs, latest), { asOfDate, config });
}

function linearPairs(first, last, count = 6) {
  return Array.from({ length: count }, (_, index) => first.map((value, field) => (
    value + (last[field] - value) * index / (count - 1)
  )));
}

function normalizedGapPairs(gaps, { ma60Start = 100, ma60Step = 1 } = {}) {
  return gaps.map((gap, index) => {
    const ma60 = ma60Start + ma60Step * index;
    return [ma60 * (1 + gap), ma60];
  });
}

test('a material MA30 decline weakens bulls without requiring persistent gap contraction', () => {
  const result = trend(linearPairs([120, 110], [115, 100]), { close: 130, ma200: 90 });
  assert.ok(result.ma30Slope < -STOCK_MA_TREND_CONFIG.slopeThreshold);
  assert.ok(result.gapChange > 0, 'the independent MA30-down path can coexist with an expanding gap');
  assert.equal(result.contractingDays, 0);
  assert.equal(result.contractionPersistent, false);
  assert.equal(result.status, 'bullish_weakening');
});

test('rising bullish averages weaken only after at least three meaningful adjacent contractions', () => {
  const result = trend(normalizedGapPairs([0.1, 0.1, 0.0996, 0.0992, 0.0988, 0.0988]), { close: 130, ma200: 90 });
  assert.ok(result.ma30Slope > 0 && result.ma60Slope > 0);
  assert.ok(result.gapChange < -STOCK_MA_TREND_CONFIG.gapChangeThreshold);
  assert.equal(result.contractingDays, 3);
  assert.equal(result.contractionPersistent, true);
  assert.equal(result.status, 'bullish_weakening');
});

test('only two meaningful contractions keep rising bullish averages stable', () => {
  const result = trend(normalizedGapPairs([0.1, 0.1, 0.1, 0.1, 0.0994, 0.0988]), { close: 130, ma200: 90 });
  assert.ok(result.ma30Slope > 0 && result.gapChange < -STOCK_MA_TREND_CONFIG.gapChangeThreshold);
  assert.equal(result.contractingDays, 2);
  assert.equal(result.contractionPersistent, false);
  assert.equal(result.status, 'stable');
});

test('daily contractions smaller than 0.02 percentage points do not accumulate persistence', () => {
  const result = trend(normalizedGapPairs([0.102, 0.1007, 0.1006, 0.1005, 0.1004, 0.1003]), { close: 130, ma200: 90 });
  assert.ok(result.ma30Slope > 0 && result.gapChange < -STOCK_MA_TREND_CONFIG.gapChangeThreshold);
  assert.equal(result.contractingDays, 0, 'an older large drop cannot substitute for four small recent changes');
  assert.equal(result.contractionPersistent, false);
  assert.equal(result.status, 'stable');
});

test('expanding bullish structure still strengthens without contraction evidence', () => {
  const result = trend(normalizedGapPairs([0.1, 0.1004, 0.1008, 0.1012, 0.1016, 0.102]), { close: 130, ma200: 90 });
  assert.equal(result.contractingDays, 0);
  assert.equal(result.contractionPersistent, false);
  assert.equal(result.status, 'bullish_strengthening');
});

test('the daily contraction threshold includes exact equality and excludes genuinely smaller changes', () => {
  for (const [thirdGap, expectedCount, status] of [
    [0.0994, 3, 'bullish_weakening'],
    [0.099400001, 2, 'stable'],
    [0.099399999, 3, 'bullish_weakening'],
  ]) {
    const pairs = normalizedGapPairs([0.101, 0.1, 0.0998, 0.0996, thirdGap, thirdGap]);
    for (const scale of [0.01, 1, 1e6]) {
      const result = trend(pairs.map(pair => pair.map(value => value * scale)), {
        close: 130 * scale, ma200: 90 * scale,
      });
      assert.equal(result.contractingDays, expectedCount);
      assert.equal(result.contractionPersistent, expectedCount >= 3);
      assert.equal(result.status, status);
    }
  }
});

test('five contraction records mean four adjacent comparisons, excluding the sixth-record boundary', () => {
  const pairs = normalizedGapPairs([0.101, 0.1005, 0.1005, 0.1005, 0.0999, 0.0993]);
  const result = trend(pairs, { close: 130, ma200: 90 });
  assert.equal(result.contractingDays, 2, 'counting the comparison from record six would incorrectly produce three');
  assert.equal(result.contractionPersistent, false);
  assert.equal(result.status, 'stable');
  const allFour = trend(normalizedGapPairs([0.102, 0.1, 0.0997, 0.0994, 0.0991, 0.0988]), { close: 130, ma200: 90 });
  assert.equal(allFour.contractingDays, 4);
  assert.equal(allFour.contractionPersistent, true);
  assert.equal(allFour.status, 'bullish_weakening');
});

test('recent crossings retain priority over contraction persistence and contrary MA30 slopes', () => {
  const up = trend(normalizedGapPairs([0.1, -0.01, 0.004, 0.0036, 0.0032, 0.0028], { ma60Step: 0 }), { close: 130, ma200: 90 });
  assert.ok(up.ma30Slope < 0 && up.gapChange < 0);
  assert.equal(up.contractingDays, 3);
  assert.equal(up.contractionPersistent, true);
  assert.equal(up.crossAge, 3);
  assert.equal(up.status, 'strengthening');
  const down = trend(normalizedGapPairs([0.01, 0.005, 0.002, 0.0005, -0.002, -0.003]), { close: 130, ma200: 90 });
  assert.equal(down.status, 'weakening');
  assert.equal(down.crossAge, 1);
});

test('contraction persistence does not filter non-bullish structural weakening or strengthening bears', () => {
  const gaps = [0.1, 0.1, 0.1, 0.1, 0.0994, 0.0988];
  const longTermUp = trend(normalizedGapPairs(gaps), { close: 150, ma200: 120 });
  assert.equal(longTermUp.contractingDays, 2);
  assert.equal(longTermUp.contractionPersistent, false);
  assert.equal(longTermUp.status, 'structural_weakening');
  const bearish = trend(normalizedGapPairs([-0.1, -0.1, -0.1, -0.1, -0.1006, -0.1012], { ma60Step: -1 }), { close: 80, ma200: 110 });
  assert.equal(bearish.contractingDays, 2);
  assert.equal(bearish.contractionPersistent, false);
  assert.equal(bearish.status, 'bearish_strengthening');
});

test('SNOW completed observations have three normalized contractions despite only two absolute-gap contractions', () => {
  const rows = [
    { date: '2026-09-04', close: 337.18, ma30: 319.07033333333345, ma60: 286.5861666666669, ma200: 218.947 },
    { date: '2026-09-08', close: 335.5, ma30: 321.15633333333346, ma60: 288.17133333333356, ma200: 219.35195 },
    { date: '2026-09-09', close: 331.48, ma30: 323.1936666666668, ma60: 289.81633333333355, ma200: 219.74445 },
    { date: '2026-09-10', close: 329.72, ma30: 324.7543333333334, ma60: 291.2986666666669, ma200: 220.16975 },
    { date: '2026-09-11', close: 328.99, ma30: 325.78400000000005, ma60: 292.80983333333364, ma200: 220.64454999999998 },
    { date: '2026-09-14', close: 332.35, ma30: 327.0863333333334, ma60: 294.4403333333336, ma200: 221.09634999999997 },
  ];
  const result = deriveStockMaTrend(rows, { asOfDate: '2026-09-14' });
  assert.ok(result.ma30Slope > 0 && result.ma60Slope > 0);
  const absoluteGap = row => row.ma30 - row.ma60;
  assert.ok(absoluteGap(rows.at(-1)) > absoluteGap(rows[0]));
  assert.equal(rows.slice(-4).filter((row, index) => absoluteGap(row) < absoluteGap(rows[index + 1])).length, 2);
  assert.equal(result.contractingDays, 3);
  assert.equal(result.contractionPersistent, true);
  assert.equal(result.status, 'bullish_weakening');
});

const contextualCases = [
  ['bullish_strengthening', [105, 100], [115, 102], { close: 130, ma200: 90 }],
  ['bullish_weakening', [125, 110], [115, 105], { close: 130, ma200: 90 }],
  ['bearish_strengthening', [110, 125], [100, 120], { close: 80, ma200: 130 }],
  ['bearish_weakening', [90, 115], [100, 120], { close: 80, ma200: 130 }],
  ['improving', [100, 120], [110, 122], { close: 150, ma200: 130 }],
  ['structural_weakening', [110, 122], [100, 120], { close: 150, ma200: 130 }],
  ['stable', [110, 100], [110, 100], { close: 120, ma200: 90 }],
];

test('seven contextual outcomes distinguish strengthening bears from strengthening bulls', () => {
  for (const [status, first, last, latest] of contextualCases) {
    const result = trend(linearPairs(first, last), latest);
    assert.equal(result.status, status);
    assert.equal(result.crossDate, '');
    assert.equal(result.crossDirection, null);
  }
});

test('identical user-supplied META latest structure can improve or weaken depending on normalized history', () => {
  const latest = { close: 665.60, ma200: 623.49 };
  const rising = trendHistory(linearPairs([580, 595], [590.39, 596.73]), latest);
  const falling = trendHistory([[611, 612], ...linearPairs([610, 610], [590.39, 596.73])], latest);
  assert.deepEqual(rising.at(-1), falling.at(-1));
  assert.equal(deriveStockMaStructure(rising.at(-1), { asOfDate }).status, 'long_term_up');
  assert.equal(deriveStockMaTrend(rising, { asOfDate }).status, 'improving');
  const result = deriveStockMaTrend(falling, { asOfDate });
  assert.equal(result.status, 'structural_weakening');
  assert.equal(result.comparisonDate, '2026-09-08');
  assert.ok(Math.abs(result.ma30Slope - (590.39 - 610) / 610) < 1e-12);
  assert.ok(Math.abs(result.ma60Slope - (596.73 - 610) / 610) < 1e-12);
  assert.ok(Math.abs(result.gapToday - (590.39 - 596.73) / 596.73) < 1e-12);
  assert.equal(result.gapAtComparison, 0);
  assert.equal(result.gapChange, result.gapToday);
  assert.equal(result.crossAge, null);
  assert.equal(result.crossDirection, null, 'the historical negative baseline prevents a false new down-cross after touching zero');
});

test('proportional price scaling preserves decisions, normalized diagnostics, and crossing thresholds', () => {
  const histories = [
    ...contextualCases.map(([, first, last, latest]) => trendHistory(linearPairs(first, last), latest)),
    trendHistory([[998, 1000], [998, 1000], [998, 1000], [998, 1000], [998, 1000], [1001, 1000]]),
  ];
  for (const history of histories) {
    const expected = deriveStockMaTrend(history, { asOfDate });
    for (const scale of [0.01, 0.1, 100, 1e6]) {
      const scaled = history.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key, ['close', 'ma30', 'ma60', 'ma200'].includes(key) ? value * scale : value,
      ])));
      const actual = deriveStockMaTrend(scaled, { asOfDate });
      assert.equal(actual.status, expected.status);
      assert.equal(actual.crossDate, expected.crossDate);
      assert.equal(actual.crossAge, expected.crossAge);
      assert.equal(actual.contractingDays, expected.contractingDays);
      assert.equal(actual.contractionPersistent, expected.contractionPersistent);
      for (const field of ['ma30Slope', 'ma60Slope', 'gapToday', 'gapAtComparison', 'gapChange']) {
        assert.ok(Math.abs(actual[field] - expected[field]) < 1e-12, field);
      }
    }
  }
});

test('ordinary decisions use strict ratio thresholds and the matching long-term structure', () => {
  assert.equal(trend(linearPairs([1000, 900], [1001, 900]), { ma200: 800 }).status, 'stable');
  assert.equal(trend(linearPairs([1000, 900], [1001.001, 900]), { ma200: 800 }).status, 'bullish_strengthening');
  assert.equal(trend(linearPairs([1100, 1000], [1101, 1000]), {}, { slopeThreshold: 0.0001 }).status, 'stable');
  assert.equal(trend(linearPairs([1100, 1000], [1101.001, 1000]), {}, { slopeThreshold: 0.0001 }).status, 'bullish_strengthening');
  assert.equal(trend(linearPairs([110, 100], [112, 99]), { close: 130, ma200: 90 }).status, 'stable',
    'a falling MA60 prevents bullish strengthening');
  assert.equal(trend(linearPairs([90, 100], [89, 105]), { close: 80, ma200: 110 }).status, 'stable',
    'a rising MA60 prevents bearish strengthening');
  for (const pairs of [linearPairs([110, 100], [112, 104]), linearPairs([110, 100], [108, 95])]) {
    assert.equal(trend(pairs, { close: 150, ma200: 130 }).status, 'structural_weakening', 'long-term up uses either weakening input');
    assert.equal(trend(pairs, { close: 120, ma200: 130 }).status, 'stable', 'long-term down requires both weakening inputs');
    assert.equal(trend(pairs, { close: 130, ma200: 130 }).status, 'stable');
  }
  assert.equal(trend(linearPairs([112, 104], [110, 104]), { close: 120, ma200: 130 }).status, 'structural_weakening');
});

test('confirmed crossings include both threshold boundaries and override contrary five-record slopes', () => {
  const up = trend([[1300, 1000], [1200, 1000], [1100, 1000], [998, 1000], [999.5, 1000], [1001, 1000]]);
  assert.equal(up.status, 'strengthening');
  assert.ok(up.ma30Slope < 0 && up.gapChange < 0);
  assert.equal(up.crossDate, asOfDate);
  assert.equal(up.crossAge, 0);
  const down = trend([[900, 1000], [950, 1000], [980, 1000], [1002, 1000], [1000.5, 1000], [999, 1000]]);
  assert.equal(down.status, 'weakening');
  assert.ok(down.ma30Slope > 0 && down.gapChange > 0);
  assert.equal(down.crossDirection, 'down');
  for (const [start, end] of [[998, 1000.999], [1002, 999.001]]) {
    const result = trend([[start, 1000], [start, 1000], [start, 1000], [start, 1000], [start, 1000], [end, 1000]]);
    assert.equal(result.crossDirection, null);
    assert.notEqual(result.status, 'strengthening');
    assert.notEqual(result.status, 'weakening');
  }
});

test('first records only initialize a side, while zero or small opposite baselines can later confirm a crossing', () => {
  for (const value of [1001, 999, 1000.5, 999.5]) {
    const result = trend(Array.from({ length: 6 }, () => [value, 1000]));
    assert.equal(result.crossDate, '');
    assert.equal(result.crossDirection, null);
  }
  for (const [start, end, status] of [
    [1000, 1001, 'strengthening'], [999.5, 1001, 'strengthening'],
    [1000, 999, 'weakening'], [1000.5, 999, 'weakening'],
  ]) {
    assert.equal(trend([[start, 1000], [start, 1000], [start, 1000], [start, 1000], [start, 1000], [end, 1000]]).status, status);
  }
  const sameSide = trend([[1000.5, 1000], [999.5, 1000], [1000, 1000], [999.5, 1000], [1000.5, 1000], [1001, 1000]]);
  assert.equal(sameSide.crossDirection, null, 'band-only zero crossings do not change the original side');
});

test('crossings are recent on trading-record ages zero through four and expire at age five', () => {
  for (let age = 0; age <= 5; age += 1) {
    for (const [before, after, status] of [[998, 1001, 'strengthening'], [1002, 999, 'weakening']]) {
      const pairs = [...Array.from({ length: 5 }, () => [before, 1000]), ...Array.from({ length: age + 1 }, () => [after, 1000])];
      const result = trend(pairs);
      assert.equal(result.crossAge, age);
      if (age < 5) assert.equal(result.status, status);
      else assert.equal(result.status, 'stable');
    }
  }
});

test('band oscillations neither display the old cross nor refresh its date when the confirmed side returns', () => {
  const pairs = [[998, 1000], [998, 1000], [998, 1000], [998, 1000], [998, 1000], [1001, 1000],
    [1000.5, 1000], [999.5, 1000], [1000.5, 1000], [999.5, 1000], [1001, 1000]];
  const rows = trendHistory(pairs);
  for (const length of [6, 7, 8, 11]) {
    const prefix = rows.slice(0, length).map((row, index) => index === length - 1 ? { ...row, close: 1200, ma200: 900 } : row);
    const result = deriveStockMaTrend(prefix, { asOfDate: prefix.at(-1).date });
    assert.equal(result.crossDate, rows[5].date);
    assert.equal(result.crossAge, length - 6);
    if (length === 6) assert.equal(result.status, 'strengthening');
    else assert.notEqual(result.status, 'strengthening');
  }
  const reentry = trend(pairs.slice(0, 8).concat([[1001, 1000]]));
  assert.equal(reentry.status, 'strengthening');
  assert.equal(reentry.crossAge, 3, 'in-band reentry uses the original confirmation date');
});

test('a later reverse cross always replaces the earlier event', () => {
  const result = trend([[998, 1000], [998, 1000], [998, 1000], [998, 1000], [998, 1000],
    [1001, 1000], [1000.5, 1000], [999, 1000], [999.5, 1000], [999, 1000]]);
  assert.equal(result.status, 'weakening');
  assert.equal(result.crossDirection, 'down');
  assert.equal(result.crossAge, 2);
});

test('historical gaps reset both crossing baseline and events without bridging the gap', () => {
  const valid = trendHistory([[998, 1000], [998, 1000], [1001, 1000], [1001, 1000],
    [1001, 1000], [1001, 1000], [1001, 1000], [1001, 1000]]);
  for (const missing of [{ ...valid[1], ma30: null }, { ...valid[1], date: 'bad' }, null]) {
    const result = deriveStockMaTrend([valid[0], missing, ...valid.slice(2)], { asOfDate, config: { crossLookback: 10 } });
    assert.equal(result.status, 'stable');
    assert.equal(result.crossDate, '');
    assert.equal(result.crossDirection, null);
  }
});

test('trend requires its current complete ordered window and never fills missing MAs from older records', () => {
  const valid = trendHistory(linearPairs([100, 120], [110, 120]));
  for (const rows of [
    null, [], valid.slice(1), [...valid].reverse(),
    valid.map((row, index) => index === 3 ? { ...row, date: valid[2].date } : row),
    valid.map((row, index) => index === 3 ? { ...row, date: '2026-09-09' } : row),
    valid.map((row, index) => index === 3 ? { ...row, date: '2026-02-30' } : row),
    valid.map((row, index) => index === 5 ? { ...row, date: '2026-09-16' } : row),
    valid.map((row, index) => index === 0 ? null : row),
  ]) {
    const result = deriveStockMaTrend(rows, { asOfDate });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.gapToday, null);
    assert.equal(result.ma30Slope, null);
  }
  const older = { date: '2026-09-04', ma30: 98, ma60: 120 };
  for (let index = 0; index < 6; index += 1) {
    for (const field of ['ma30', 'ma60']) {
      for (const value of [null, undefined, '', '100', 0, -1, true, NaN, Infinity]) {
        const rows = valid.map((row, i) => i === index ? { ...row, [field]: value } : row);
        assert.equal(deriveStockMaTrend([older, ...rows], { asOfDate }).status, 'unavailable');
      }
    }
  }
  for (const field of ['close', 'ma200']) {
    assert.equal(deriveStockMaTrend(valid.map((row, index) => index === 5 ? { ...row, [field]: null } : row), { asOfDate }).status, 'unavailable');
  }
  assert.equal(deriveStockMaTrend(valid, { asOfDate: '2026-09-16' }).status, 'unavailable');
  assert.equal(deriveStockMaTrend(valid).status, 'unavailable');
  const frozen = Object.freeze([Object.freeze({ date: '2026-09-04', ma30: null, ma60: null }), ...valid.map(Object.freeze)]);
  assert.equal(deriveStockMaTrend(frozen, { asOfDate }).status, 'improving');
  assert.equal(frozen[1].close, undefined);
  assert.equal(frozen[1].ma200, undefined);
});

test('frozen ratio configuration permits validated partial overrides without mutating the defaults', () => {
  assert.equal(Object.isFrozen(STOCK_MA_TREND_CONFIG), true);
  assert.deepEqual(STOCK_MA_TREND_CONFIG, {
    lookback: 5, crossLookback: 5, crossThreshold: 0.001, slopeThreshold: 0.001, gapChangeThreshold: 0.001,
    contractionLookback: 5, contractionMinDays: 3, dailyGapChangeMin: 0.0002,
  });
  const pairs = linearPairs([105, 100], [115, 102], 3);
  assert.equal(trend(pairs).status, 'unavailable');
  assert.equal(trend(pairs, { close: 130, ma200: 90 }, { lookback: 2 }).status, 'bullish_strengthening');
  assert.equal(trend(pairs, { close: 130, ma200: 90 }, { lookback: 2 }).contractingDays, null);
  assert.equal(trend(pairs, { close: 130, ma200: 90 }, { lookback: 2 }).contractionPersistent, null,
    'missing optional contraction history must not block independent strengthening');
  assert.equal(trend(pairs, { close: 130, ma200: 90 }, { lookback: 2, slopeThreshold: 0.2 }).status, 'stable');
  const cross = [[998, 1000], [998, 1000], [998, 1000], [998, 1000], [1001, 1000], [1001, 1000]];
  assert.equal(trend(cross, {}, { crossLookback: 1 }).status, 'bullish_strengthening');
  assert.equal(trend(cross, {}, { crossThreshold: 0.01 }).crossDirection, null);
  for (const config of [null, false, [], { unknown: 5 }, { lookback: 0 }, { lookback: 1.5 },
    { crossLookback: Infinity }, { crossLookback: -1 }, { slopeThreshold: '0.001' },
    { gapChangeThreshold: undefined }, { crossThreshold: 0 }, { crossThreshold: NaN },
    { contractionLookback: 1 }, { contractionLookback: 2.5 }, { contractionLookback: Infinity },
    { contractionMinDays: 0 }, { contractionMinDays: 5 }, { contractionMinDays: 1.5 },
    { dailyGapChangeMin: 0 }, { dailyGapChangeMin: -0.0002 }, { dailyGapChangeMin: '0.0002' }]) {
    assert.equal(trend(linearPairs([105, 100], [115, 102]), {}, config).status, 'unavailable');
  }
  assert.equal(STOCK_MA_TREND_CONFIG.lookback, 5);
});

test('missing contraction evidence stays unknown only when the bullish contraction path needs it', () => {
  const config = { contractionLookback: 7 };
  const latest = { close: 130, ma200: 90 };
  const converging = linearPairs([110, 100], [112, 104]);
  assert.equal(trend(converging, latest, config).status, 'unavailable');
  assert.equal(trend(linearPairs([115, 105], [110, 100]), latest, config).status, 'bullish_weakening',
    'direct MA30 decline never depends on contraction evidence');
  assert.equal(trend(linearPairs([110, 100], [110, 100]), latest, config).status, 'stable');
  assert.equal(trend(linearPairs([105, 100], [115, 102]), latest, config).status, 'bullish_strengthening');
  const rows = trendHistory(converging, latest);
  assert.equal(deriveStockMaTrend([{ date: '2026-09-07', ma30: null, ma60: null }, ...rows], {
    asOfDate, config,
  }).status, 'unavailable', 'missing data inside the longer contraction window cannot become stability');
});
