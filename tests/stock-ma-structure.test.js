import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStockMaStructure, deriveStockMaTrend, STOCK_MA_STABILITY_PRICE_RATIO } from '../src/lib/stockMaStructure.js';

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

const tradingDates = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', asOfDate];

function trendHistory(pairs, latest = {}) {
  return pairs.map(([ma30, ma60], index) => ({
    date: tradingDates[index], ma30, ma60,
    ...(index === 5 ? { close: 1000, ma200: 900, ...latest } : {}),
  }));
}

function trend(pairs, latest) {
  return deriveStockMaTrend(trendHistory(pairs, latest), { asOfDate });
}

test('identical user-supplied META latest structure can be repairing or deteriorating depending on its actual history', () => {
  const today = { close: 665.60, ma200: 623.49 };
  const rising = trendHistory([[580, 595], [582, 595.4], [584, 595.8], [586, 596.2], [588, 596.5], [590.39, 596.73]], today);
  const falling = trendHistory([[610, 610], [605, 607], [600, 603], [596, 600], [593, 598], [590.39, 596.73]], today);
  assert.deepEqual(rising.at(-1), falling.at(-1));
  assert.deepEqual(deriveStockMaStructure(rising.at(-1), { asOfDate }), { status: 'long_term_up', asOfDate });
  assert.deepEqual(deriveStockMaStructure(falling.at(-1), { asOfDate }), { status: 'long_term_up', asOfDate });
  assert.equal(deriveStockMaTrend(rising, { asOfDate }).status, 'repairing');
  const decline = deriveStockMaTrend(falling, { asOfDate });
  assert.equal(decline.status, 'deteriorating');
  assert.equal(decline.comparisonDate, '2026-09-08', 'five trading sessions include the intervening weekend');
  assert.deepEqual([decline.ma30Slope, decline.ma60Slope, decline.gapToday, decline.gap5dAgo, decline.gapChange].map(value => Number(value.toFixed(2))), [-19.61, -13.27, -6.34, 0, -6.34]);
});

test('the latest strict crossover overrides opposite five-session slopes and gap movement', () => {
  const strengthening = trend([[130, 100], [120, 105], [115, 108], [108, 110], [110, 110], [111, 110]]);
  assert.equal(strengthening.status, 'strengthening');
  assert.ok(strengthening.ma30Slope < 0 && strengthening.gapChange < 0);
  const weakening = trend([[90, 110], [95, 110], [100, 110], [105, 110], [110, 110], [109, 110]]);
  assert.equal(weakening.status, 'weakening');
  assert.ok(weakening.ma30Slope > 0 && weakening.gapChange > 0);
  assert.equal(trend([[100, 100], [100, 100], [100, 100], [100, 100], [100, 100], [100.1, 100]]).status, 'strengthening');
  assert.equal(trend([[110, 100], [108, 100], [106, 100], [104, 100], [102, 100], [100, 100]]).status, 'deteriorating',
    'touching zero today is not a strict crossover');
});

test('stable uses the named close-scaled tolerance with matching rising, falling, or flat directions', () => {
  assert.equal(STOCK_MA_STABILITY_PRICE_RATIO, 0.001);
  for (const pairs of [
    [[110, 100], [112, 102], [114, 104], [116, 106], [118, 108], [120, 110]],
    [[120, 110], [118, 108], [116, 106], [114, 104], [112, 102], [110, 100]],
    [[110, 100], [110, 100], [110, 100], [110, 100], [110, 100], [110, 100]],
    [[110, 100], [112, 102], [114, 104], [116, 106], [118, 108], [120, 109]],
    [[110, 100], [110, 100], [110, 100], [110, 100], [110, 100], [111, 100]],
  ]) {
    const result = trend(pairs);
    assert.equal(result.stabilityThreshold, 1);
    assert.equal(result.status, 'stable');
  }
  assert.equal(trend([[110, 100], [112, 102], [114, 104], [116, 106], [118, 108], [120, 108.99]]).status, 'improving');
  assert.equal(trend([[110, 100], [110, 100], [110, 100], [110, 100], [110, 100], [111.5, 100.75]]).status, 'improving',
    'one rising MA and one flat MA are not stable even inside the gap tolerance');
});

test('repair needs a negative gap and price above MA200; mixed evidence remains direction unclear', () => {
  const improvingBelow = [[100, 120], [102, 120], [104, 120], [106, 120], [108, 120], [110, 120]];
  assert.equal(trend(improvingBelow).status, 'repairing');
  assert.equal(trend(improvingBelow, { close: 800 }).status, 'improving');
  assert.equal(trend(improvingBelow, { close: 900 }).status, 'improving');
  assert.equal(trend([[110, 100], [112, 100], [114, 100], [116, 100], [118, 100], [120, 100]]).status, 'improving');
  assert.equal(trend([[120, 100], [118, 100], [116, 100], [114, 100], [112, 100], [110, 100]]).status, 'deteriorating');
  assert.equal(trend([[110, 100], [110, 101], [110, 102], [110, 103], [110, 104], [110, 105]]).status, 'direction_unclear');
  assert.equal(trend([[110, 100], [111, 102], [112, 104], [113, 106], [114, 108], [115, 110]]).status, 'direction_unclear');
});

test('trend needs six ordered records with the exact latest date, without sorting or duplicate removal', () => {
  const valid = trendHistory([[100, 120], [102, 120], [104, 120], [106, 120], [108, 120], [110, 120]]);
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
  assert.equal(deriveStockMaTrend(valid, { asOfDate: '2026-09-16' }).status, 'unavailable');
  assert.equal(deriveStockMaTrend(valid).status, 'unavailable');
});

test('missing MAs inside the six-record window cannot be replaced with older values or missing-as-zero', () => {
  const valid = trendHistory([[100, 120], [102, 120], [104, 120], [106, 120], [108, 120], [110, 120]]);
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
});

test('historical close and MA200 are unnecessary, and valid earlier warmup rows are not part of the trend window', () => {
  const valid = trendHistory([[100, 120], [102, 120], [104, 120], [106, 120], [108, 120], [110, 120]]);
  const history = Object.freeze([
    Object.freeze({ date: '2026-09-04', ma30: null, ma60: null }),
    ...valid.map(Object.freeze),
  ]);
  assert.equal(deriveStockMaTrend(history, { asOfDate }).status, 'repairing');
  assert.equal(history[1].close, undefined);
  assert.equal(history[1].ma200, undefined);
  assert.equal(history.length, 7);
});
