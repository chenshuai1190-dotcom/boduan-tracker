import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockDecisionModel, STOCK_DECISION_RULES } from '../server/quote/stockDecisionModel.js';
import { buildStockRsi } from '../server/quote/stockRsi.js';

function history(closes, volumes = []) {
  const day = new Date('2025-01-02T00:00:00Z');
  return closes.map((close, index) => {
    while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 1);
    return { date, open: close, high: close + 1, low: close - 1, close, volume: volumes[index] ?? 100 };
  });
}

const wave = [100, 102, 105, 108, 110, 108, 105, 102];
const baseCloses = Array.from({ length: 144 }, (_, index) => wave[index % wave.length]);

function breakoutHistory(after = [115], afterVolumes = []) {
  const closes = [...baseCloses, 114, ...after];
  const volumes = closes.map(() => 100);
  volumes[baseCloses.length] = 800;
  for (let index = 0; index < afterVolumes.length; index += 1) volumes[baseCloses.length + 1 + index] = afterVolumes[index];
  return history(closes, volumes);
}

function calculate(rows, options = {}) {
  return buildStockDecisionModel({
    rows, asOf: rows.at(-1)?.date ?? '2026-01-01', ...options,
  });
}

test('volume compares a full day against the previous 20 days and keeps the extreme breakout anchor', () => {
  const rows = breakoutHistory();
  const result = calculate(rows);
  assert.equal(result.volume.state, 'continuation');
  assert.equal(result.volume.breakout.date, rows.at(-2).date);
  assert.equal(result.volume.breakout.ageBars, 1);
  assert.equal(result.volume.breakout.ratio, 8);
  assert.equal(result.volume.breakout.active, true);
  assert.ok(Math.abs(result.volume.ratio - 100 / 135) < 1e-12);
  assert.equal(result.volume.medianRatio, 1, 'ordinary volume is not misreported as abnormal because of one extreme day');
  assert.equal(result.reasons.includes('low_volume_rebound'), false);
});

test('a breakout requires a close across a previously confirmed area and actual volume expansion', () => {
  const rows = breakoutHistory([]);
  const breakout = calculate(rows);
  assert.equal(breakout.volume.state, 'breakout');
  assert.equal(breakout.volume.breakout.ageBars, 0);
  assert.ok(breakout.volume.breakout.upper < rows.at(-1).close);
  assert.ok(breakout.volume.breakout.upper >= rows.at(-2).close);
  const ordinary = rows.map(row => ({ ...row, volume: 100 }));
  assert.equal(calculate(ordinary).volume.breakout, null);
  const onlyAnIntradayPierce = rows.map(row => ({ ...row }));
  onlyAnIntradayPierce.at(-1).close = 110;
  onlyAnIntradayPierce.at(-1).open = 110;
  onlyAnIntradayPierce.at(-1).low = 109;
  assert.equal(calculate(onlyAnIntradayPierce).volume.breakout, null, 'a high above resistance is not a closing breakout');
});

test('a low-volume pullback is distinct from continuation and does not become a buy condition', () => {
  const result = calculate(breakoutHistory([113]));
  assert.equal(result.volume.state, 'pullback');
  assert.equal(result.volume.breakout.active, true);
  assert.notEqual(result.verdict, 'observe');
  assert.ok(result.reasons.includes('pullback_unconfirmed'));
});

test('a close below the frozen breakout area invalidates it and keeps the failed support visible', () => {
  const rows = breakoutHistory([115, 108], [100, 400]);
  const failed = calculate(rows);
  assert.equal(failed.volume.breakout.active, false);
  assert.equal(failed.volume.state, 'weakness');
  assert.equal(failed.position.state, 'support_broken');
  assert.equal(failed.verdict, 'pause');
  assert.ok(failed.reasons.includes('support_broken'));
  const lowerSupport = calculate(breakoutHistory([115, 108, 106, 104, 102, 104, 106, 108], [100, 400]));
  assert.deepEqual(lowerSupport.position.brokenSupport, failed.position.brokenSupport);
  assert.ok(lowerSupport.position.support.upper < lowerSupport.position.brokenSupport.lower);
  assert.equal(lowerSupport.position.state, 'support_broken', 'a new lower support cannot erase the failed old one');
  const reclaimed = calculate(breakoutHistory([115, 108, 106, 104, 102, 104, 106, 108, 114], [100, 400]));
  assert.equal(reclaimed.position.brokenSupport, null, 'a completed reclaim above the failed area clears that breakdown');
});

test('breakout memory lasts exactly 10 subsequent bars and frozen levels do not change with later ATR', () => {
  const initial = calculate(breakoutHistory([])).volume.breakout;
  const tenth = calculate(breakoutHistory(Array(10).fill(113.5))).volume.breakout;
  const eleventh = calculate(breakoutHistory(Array(11).fill(113.5))).volume.breakout;
  assert.equal(tenth.ageBars, 10);
  assert.equal(tenth.active, true);
  assert.equal(eleventh.ageBars, 11);
  assert.equal(eleventh.active, false);
  assert.equal(tenth.lower, initial.lower);
  assert.equal(tenth.upper, initial.upper);
  assert.equal(tenth.ratio, initial.ratio);
  const wideRange = breakoutHistory([115]);
  wideRange.at(-1).high = 160;
  wideRange.at(-1).low = 70;
  const changedAtr = calculate(wideRange);
  assert.equal(changedAtr.volume.breakout.lower, initial.lower);
  assert.equal(changedAtr.volume.breakout.upper, initial.upper);
});

test('three completed right-hand bars are required to confirm a structural pivot', () => {
  const rows = history([...Array(132).fill(100), 101, 102, 107, 105, 103, 104]);
  const before = rows.slice(0, -1);
  assert.equal(calculate(before).position.resistance, null);
  const confirmed = calculate(rows).position.resistance;
  assert.equal(confirmed.touches, 1);
  assert.equal(confirmed.pivots[0].date, rows.at(-4).date);
  assert.equal(confirmed.pivots[0].price, rows.at(-4).high);
  assert.equal(confirmed.pivots[0].confirmedAt, rows.at(-1).date);
  assert.deepEqual(calculate(rows, { asOf: before.at(-1).date }), calculate(before), 'future bars do not leak into the earlier assessment');
  const futureInvalid = [...before, { ...rows.at(-1), high: null, volume: null }];
  assert.deepEqual(calculate(futureInvalid, { asOf: before.at(-1).date }), calculate(before));
});

test('zones come from real pivot highs/lows; flat bars do not create invented support', () => {
  const rows = history(Array(144).fill(100));
  const flat = calculate(rows);
  assert.ok(Math.abs(flat.position.atr - 2) < 1e-12);
  assert.equal(flat.position.support, null);
  assert.equal(flat.position.resistance, null);
  assert.equal(flat.verdict, 'insufficient');
  const source = history(baseCloses);
  const result = calculate(source);
  for (const zone of [result.position.support, result.position.resistance].filter(Boolean)) {
    assert.ok(zone.lower > 0 && zone.lower <= zone.upper);
    assert.equal(zone.touches, zone.pivots.length);
    for (const pivot of zone.pivots) {
      const index = source.findIndex(row => row.date === pivot.date);
      const row = source[index];
      assert.ok(pivot.price === row.high || pivot.price === row.low);
      assert.equal(source[index + STOCK_DECISION_RULES.pivotSideBars].date, pivot.confirmedAt);
      assert.ok(zone.lower <= pivot.price && zone.upper >= pivot.price);
    }
  }
});

test('nearby pivots less than five trading bars apart do not count as separate touches', () => {
  const rows = history([...Array(132).fill(100), 100, 103, 106, 109, 106, 103, 106, 109.1, 106, 103, 104]);
  const zone = calculate(rows).position.resistance;
  assert.equal(zone.touches, 1);
  assert.equal(zone.pivots[0].price, 110);
  const expanded = history([...rows.map(row => row.close), 103, 106, 109.2, 106, 103, 104]);
  const later = calculate(expanded).position.resistance;
  assert.equal(later.touches, 2);
  const indices = later.pivots.map(pivot => expanded.findIndex(row => row.date === pivot.date));
  assert.ok(indices[1] - indices[0] >= STOCK_DECISION_RULES.independentTouchBars);
});

test('an all-time high may have no resistance without making the whole assessment unavailable', () => {
  const result = calculate(breakoutHistory([115]));
  assert.equal(result.position.resistance, null);
  assert.ok(result.position.support);
  assert.notEqual(result.trend.state, 'insufficient');
  assert.equal(result.verdict, 'observe');
  assert.equal(result.reasons.includes('insufficient_structure'), false);
});

test('known breakout continuation cannot override RSI risk, and missing volume cannot conceal established risk', () => {
  const rows = breakoutHistory([120, 130, 140, 150, 160, 170, 180]);
  const result = calculate(rows);
  assert.equal(result.volume.state, 'continuation');
  assert.ok(result.momentum.value >= 90);
  assert.equal(result.verdict, 'pause');
  assert.ok(result.reasons.includes('rsi_extreme'));
  const missingVolumeWithKnownRisk = calculate(rows.map(row => ({ ...row, volume: 0 })));
  assert.equal(missingVolumeWithKnownRisk.verdict, 'pause');
  assert.equal(missingVolumeWithKnownRisk.reasons[0], 'rsi_extreme');
  assert.ok(missingVolumeWithKnownRisk.reasons.includes('insufficient_volume'));
  const failedSupportWithMissingVolume = calculate(breakoutHistory([115, 90]).map(row => ({ ...row, volume: 0 })));
  assert.equal(failedSupportWithMissingVolume.verdict, 'pause');
  assert.equal(failedSupportWithMissingVolume.reasons[0], 'support_broken');
  assert.ok(failedSupportWithMissingVolume.reasons.includes('insufficient_volume'));
});

test('unused calendar inputs cannot change any of the four technical verdicts or leak into the result', () => {
  const scenarios = [
    [breakoutHistory(), 'observe'],
    [breakoutHistory([113]), 'wait'],
    [breakoutHistory([120, 130, 140, 150, 160, 170, 180]), 'pause'],
    [history(baseCloses.slice(0, 59)), 'insufficient'],
  ];
  const legacyInputs = [
    undefined,
    { status: 'unavailable' },
    { status: 'not_applicable' },
    { status: 'available', nextDate: '2025-08-01', referenceDate: '2025-08-01' },
    { status: 'available', nextDate: '2025-08-08', referenceDate: '2025-08-01' },
    { status: 'available', nextDate: null, referenceDate: 'invalid' },
  ];
  for (const [rows, verdict] of scenarios) {
    const baseline = calculate(rows);
    assert.equal(baseline.verdict, verdict);
    assert.equal(Object.hasOwn(baseline, 'events'), false);
    for (const earnings of legacyInputs) {
      assert.deepEqual(calculate(rows, { earnings }), baseline, 'calendar presence and absence do not affect technical assessment');
    }
  }
});

test('the decision model forwards adjusted intraday highs while preserving the exact daily RSI lifecycle', () => {
  const rows = history([...Array(130).fill(100), 110, 120, 115, 110, 116, 119, 121, 120.7, 120.5, 120.3]);
  const expected = buildStockRsi(rows.map(({ date, close, high }) => ({ date, close, high, adjusted_close: close })), { completedCutoffDate: rows.at(-1).date });
  const result = calculate(rows);
  assert.deepEqual(result.momentum, expected);
  assert.equal(result.momentum.divergenceState, 'FORMING');
  assert.equal(result.momentum.divergenceEvent.high2.price, rows.at(-4).high);
  assert.equal(Object.hasOwn(result.momentum, 'bearishDivergence'), false);
  const earlierWick = rows.map(row => ({ ...row }));
  earlierWick[131].high = 123;
  const changed = calculate(earlierWick);
  assert.equal(changed.momentum.value, result.momentum.value, 'RSI still uses completed closes');
  assert.equal(changed.momentum.divergenceState, 'NONE', 'a lower intraday high is not a new higher-high divergence');
});

test('RSI at least 80 with forming divergence pauses before a price drawdown confirms it', () => {
  const rows = history([...Array(130).fill(100), 110, 120, 119, 118, 118.5, 119.7, 121, 120.9, 120.8, 120.7]);
  const result = calculate(rows);
  assert.ok(result.momentum.value >= 80 && result.momentum.value < 90);
  assert.equal(result.momentum.divergenceState, 'FORMING');
  assert.equal(result.verdict, 'pause');
  assert.equal(result.reasons[0], 'overbought_divergence');
  assert.equal(result.reasons.includes('rsi_extreme'), false);
});

test('forming below 80 waits, confirmed weakness pauses even after RSI falls below 80', () => {
  const prefix = Array.from({ length: 130 }, (_, index) => 100 + [0, 0.1, 0, -0.1][index % 4]);
  const closes = [...prefix, 110, 120, 115, 110, 116, 119, 121, 120.7, 120.5, 120.3];
  const forming = calculate(history(closes));
  assert.equal(forming.momentum.divergenceState, 'FORMING');
  assert.ok(forming.momentum.value < 80);
  assert.equal(forming.verdict, 'wait');
  assert.ok(forming.reasons.includes('bearish_divergence_forming'));
  const confirmed = calculate(history([...closes, 117.2]));
  assert.equal(confirmed.momentum.divergenceState, 'CONFIRMED');
  assert.ok(confirmed.momentum.value < 80);
  assert.equal(confirmed.verdict, 'pause');
  assert.equal(confirmed.reasons[0], 'bearish_divergence_confirmed');
  assert.equal(confirmed.reasons.includes('overbought_divergence'), false);
});

test('realized and invalidated events stop contributing old divergence pause risks', () => {
  const prefix = Array.from({ length: 130 }, (_, index) => 100 + [0, 0.1, 0, -0.1][index % 4]);
  const closes = [...prefix, 110, 120, 115, 110, 116, 119, 121, 120.7, 120.5, 120.3];
  const realized = calculate(history([...closes, 117.2, 111]));
  assert.equal(realized.momentum.divergenceState, 'REALIZED');
  assert.equal(realized.verdict, 'wait');
  const invalidated = calculate(history([...closes, 500]));
  assert.equal(invalidated.momentum.divergenceState, 'INVALIDATED');
  assert.equal(invalidated.verdict, 'pause', 'independent extreme RSI still applies after invalidation');
  assert.ok(invalidated.reasons.includes('rsi_extreme'));
  for (const result of [realized, invalidated]) {
    assert.equal(result.reasons.includes('overbought_divergence'), false);
    assert.equal(result.reasons.includes('bearish_divergence_confirmed'), false);
    assert.equal(result.reasons.includes('bearish_divergence_forming'), false);
  }
});

test('price pivots older than the 120-bar observation window expire without invented replacement levels', () => {
  const result = calculate(history([...baseCloses, ...Array(130).fill(105)]));
  assert.equal(result.position.support, null);
  assert.equal(result.position.resistance, null);
  assert.equal(result.trend.state, 'insufficient');
  assert.equal(result.verdict, 'insufficient');
  assert.equal(result.history.length, 120);
});

test('missing, stale, zero-volume and short histories never produce observe', () => {
  for (const count of [0, 1, 13, 20, 59, 119, 131]) {
    assert.equal(calculate(history(baseCloses.slice(0, count))).verdict, 'insufficient');
  }
  const rows = breakoutHistory();
  const stale = calculate(rows, { asOf: '2026-01-01' });
  assert.equal(stale.verdict, 'insufficient');
  assert.ok(stale.reasons.includes('stale_history'));
  const noVolume = calculate(rows.map(row => ({ ...row, volume: 0 })));
  assert.equal(noVolume.volume.ratio, null);
  assert.equal(noVolume.volume.medianRatio, null);
  assert.equal(noVolume.verdict, 'insufficient');
  for (const value of [null, undefined, '100', NaN, -1, Infinity]) {
    const bad = rows.map(row => ({ ...row }));
    bad[80].volume = value;
    const result = calculate(bad);
    assert.equal(result.price, null);
    assert.equal(result.verdict, 'insufficient');
  }
});

test('malformed OHLC or dates fail closed and inputs are never mutated', () => {
  const rows = breakoutHistory();
  const original = JSON.stringify(rows);
  calculate(rows);
  assert.equal(JSON.stringify(rows), original);
  for (const patch of [{ low: 200 }, { high: 0 }, { open: null }, { close: -1 }, { date: '2025-02-30' }]) {
    const bad = rows.map(row => ({ ...row }));
    Object.assign(bad[80], patch);
    assert.equal(calculate(bad).verdict, 'insufficient');
    assert.equal(calculate(bad).price, null);
  }
  assert.equal(calculate([...rows].reverse(), { asOf: rows.at(-1).date }).price, null);
  assert.equal(calculate([...rows, { ...rows.at(-1) }]).price, null);
  assert.equal(buildStockDecisionModel().verdict, 'insufficient');
});

test('consistent price scaling preserves the decision while all prices and ATR scale together', () => {
  const rows = breakoutHistory();
  const original = calculate(rows);
  const scaled = calculate(rows.map(row => ({ ...row, open: row.open * 2, high: row.high * 2, low: row.low * 2, close: row.close * 2 })));
  assert.equal(scaled.verdict, original.verdict);
  assert.deepEqual(scaled.reasons, original.reasons);
  assert.equal(scaled.price, original.price * 2);
  assert.equal(scaled.position.atr, original.position.atr * 2);
  assert.equal(scaled.position.support.lower, original.position.support.lower * 2);
  assert.deepEqual(scaled.momentum, original.momentum);
  assert.deepEqual(scaled.volume.ratio, original.volume.ratio);
});
