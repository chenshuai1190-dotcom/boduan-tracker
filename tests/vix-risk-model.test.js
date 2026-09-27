import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVixRiskModel, buildRiskDirection, buildPriceAction,
  classifyCurrentRiskLevel, classifyTermStructure, VIX_RISK_THRESHOLDS,
} from '../src/lib/vixRiskModel.js';
import { isVixComparisonSession, nextVixComparisonSession } from '../src/lib/vixComparisonSession.js';

function sessions(count, start = '2026-08-03') {
  const dates = [];
  let date = start;
  if (!isVixComparisonSession(date)) date = nextVixComparisonSession(date);
  while (dates.length < count) { dates.push(date); date = nextVixComparisonSession(date); }
  return dates;
}
function row(date, vix = 18, ratio = 0.95) {
  const vix3m = vix / ratio;
  return { date, vix, vix3m, ratio: vix / vix3m };
}
const flat = (count = 30, vix = 18, ratio = 0.95) => Array.from({ length: count }, () => [vix, ratio]);
function fixture(values = flat(), { start, spy, qqq } = {}) {
  const dates = sessions(values.length, start);
  const rows = values.map(([vix, ratio], index) => row(dates[index], vix, ratio));
  const date = dates.at(-1);
  return { termStructure: { source: 'CBOE', asOfDate: date, expectedAsOfDate: date, stale: false, rows },
    benchmarks: {
      SPY: dates.map((date, index) => ({ date, close: spy?.[index] ?? 100 + index })),
      QQQ: dates.map((date, index) => ({ date, close: qqq?.[index] ?? 200 + index })),
    }, expectedAsOfDate: date };
}
const model = (values, options) => buildVixRiskModel(fixture(values, options));
function price(closes) {
  const dates = sessions(closes.length);
  return buildPriceAction({ rows: dates.map((date, i) => ({ date, close: closes[i] })), expectedAsOfDate: dates.at(-1) });
}
const direction = (values) => buildRiskDirection(fixture(values).termStructure.rows);
function cutoff(input, index) {
  const date = input.termStructure.rows[index].date;
  return { ...input, expectedAsOfDate: date,
    termStructure: { ...input.termStructure, asOfDate: date, expectedAsOfDate: date, rows: input.termStructure.rows.slice(0, index + 1) },
    benchmarks: Object.fromEntries(Object.entries(input.benchmarks).map(([symbol, rows]) => [symbol, rows.filter(row => row.date <= date)])) };
}

test('boundary grid covers all risk and term combinations without timing gaps', () => {
  const levels = [15.999, 16, 22, 22.001, 25, 25.001, 29.999, 30, 80];
  const ratios = [0.899999, 0.90, 0.999999, 1, 1.099999, 1.10, 1.8];
  for (const vix of levels) for (const ratio of ratios) {
    const expected = vix >= 30 && ratio >= 1 ? 'EXTREME_STRESS'
      : vix > 25 && ratio >= 1 ? 'HIGH_STRESS'
        : vix > 22 || ratio >= 1 ? 'ELEVATED'
          : vix < 16 && ratio < 0.90 ? 'LOW_VOLATILITY' : 'NORMAL';
    assert.equal(classifyCurrentRiskLevel({ vix, ratio }), expected, `${vix}/${ratio}`);
    const term = ratio >= 1.10 ? 'DEEP_INVERTED' : ratio >= 1 ? 'INVERTED' : ratio >= 0.90 ? 'NEAR_FLAT' : 'NORMAL_TERM_STRUCTURE';
    assert.equal(classifyTermStructure(ratio), term);
  }
  assert.equal(classifyCurrentRiskLevel({ vix: 0, ratio: 1 }), 'UNKNOWN');
  assert.equal(classifyTermStructure(NaN), 'UNKNOWN');
});

test('raw quotient immediately below a boundary is not snapped or rounded into inversion', () => {
  const options = fixture();
  options.termStructure.rows.at(-1).vix = 34.02;
  options.termStructure.rows.at(-1).vix3m = 34.0201;
  options.termStructure.rows.at(-1).ratio = 34.02 / 34.0201;
  const result = buildVixRiskModel(options);
  assert.equal(result.latest.ratio.toFixed(3), '1.000');
  assert.equal(result.currentRiskLevel, 'ELEVATED');
  assert.equal(result.termStructure, 'NEAR_FLAT');
  assert.equal(result.currentInversionDays, 0);
  const machineNear = fixture();
  machineNear.termStructure.rows[machineNear.termStructure.rows.length - 1] = { date: machineNear.expectedAsOfDate, vix: 30, vix3m: 30 + Number.EPSILON * 16, ratio: 30 / (30 + Number.EPSILON * 16) };
  assert.ok(buildVixRiskModel(machineNear).latest.ratio < 1);
  assert.equal(buildVixRiskModel(machineNear).currentRiskLevel, 'ELEVATED');
});

test('invariant 1: crossing expiry cannot reduce a still high or extreme current level', () => {
  for (const [vix, level] of [[26, 'HIGH_STRESS'], [31, 'EXTREME_STRESS']]) {
    const input = fixture([...flat(10), ...flat(19, vix, 1.12)]);
    for (let i = 10; i < input.termStructure.rows.length; i += 1) {
      const result = buildVixRiskModel(cutoff(input, i));
      assert.equal(result.currentRiskLevel, level);
      if (i >= 13) assert.ok(!result.eventFlags.some(event => event.type === 'VIX_CROSS_25'));
    }
    const prolonged = buildVixRiskModel(input);
    assert.deepEqual(prolonged.durationTags, ['PROLONGED_INVERSION']);
    assert.equal(prolonged.currentRiskLevel, level);
  }
});

test('invariant 2: valid latest pairing survives insufficient or broken history', () => {
  const first = model([[40, 1.2]]);
  assert.equal(first.currentRiskLevel, 'EXTREME_STRESS');
  assert.equal(first.termStructure, 'DEEP_INVERTED');
  assert.equal(first.ready, false);
  assert.equal(first.riskDirection, 'UNKNOWN');
  assert.equal(first.currentRiskDuration, 1);
  assert.equal(first.durationExact.currentRisk, false);
  const input = fixture(flat(30, 35, 1.05));
  const missingDate = input.termStructure.rows.at(-3).date;
  input.termStructure.rows.splice(-3, 1);
  const broken = buildVixRiskModel(input);
  assert.equal(broken.currentRiskLevel, 'EXTREME_STRESS');
  assert.equal(broken.ready, false);
  assert.equal(broken.currentInversionDays, 2);
  assert.equal(broken.durationExact.inversion, false);
  assert.ok(broken.dataQuality.missingSessions.includes(missingDate));
  assert.ok(broken.dataQuality.issues.some(item => item.code === 'provider_missing' && item.dimension === 'volatility'));
});

test('invariant 3: un-inversion alone is an event, not evidence of easing', () => {
  const input = fixture([...flat(10, 32, 1.1), [32, 0.99], [32, 0.97], [32, 0.95]]);
  const result = buildVixRiskModel(input);
  assert.equal(result.currentRiskLevel, 'ELEVATED');
  assert.equal(result.currentInversionDays, 0);
  assert.equal(result.riskDirection, 'HIGH_HOLD');
  assert.ok(result.eventFlags.some(flag => flag.type === 'TERM_STRUCTURE_NORMALIZED'));
  assert.equal(result.facts.direction.easingCandidate, false);
});

test('direction requires two candidates and reports its three-session evidence', () => {
  const prefix = [...flat(7, 20, 0.96), [23, 1.02]];
  const first = direction(prefix);
  assert.equal(first.status, 'STABLE');
  assert.equal(first.evidence.risingStreak, 1);
  const second = direction([...prefix, [24, 1.03]]);
  assert.equal(second.status, 'RISING');
  assert.equal(second.evidence.risingStreak, 2);
  assert.equal(second.evidence.basis, 'two_day_confirmation');
  assert.ok(second.evidence.vixChange3Pct > 19.99);
  const strong = direction([...flat(7, 20, 1.05), [25, 1.04], [26, 1.04]]);
  assert.equal(strong.status, 'RISING', 'strong VIX rise can qualify with a limited ratio decline');
  const reversed = direction([...prefix, [22, 1.04]]);
  assert.notEqual(reversed.status, 'RISING', 'each candidate also requires a non-falling VIX');
});

test('direction hysteresis lasts at most two agreeing sessions, then falls back', () => {
  const rising = [...flat(7, 20, 0.96), [23, 1.02], [24, 1.03], [25, 1.04]];
  const heldOnce = direction([...rising, [25.1, 1.045]]);
  assert.equal(heldOnce.status, 'RISING');
  assert.equal(heldOnce.evidence.carriedSessions, 1);
  const heldTwice = direction([...rising, [25.1, 1.045], [25.2, 1.05]]);
  assert.equal(heldTwice.status, 'RISING');
  assert.equal(heldTwice.evidence.carriedSessions, 2);
  assert.equal(direction([...rising, [25.1, 1.045], [25.2, 1.05], [25.3, 1.055]]).status, 'HIGH_HOLD');
  assert.equal(direction([...rising, [24.9, 1.05]]).status, 'HIGH_HOLD', 'VIX reversal cancels carry immediately');
  assert.equal(direction([...rising, [25.1, 0.95]]).status, 'HIGH_HOLD', 'a counter-direction three-day ratio cancels carry');
  const easing = [...flat(7, 30, 1.1), [26.5, 1.06], [25, 1.03], [24, 1]];
  assert.equal(direction(easing).status, 'EASING');
  assert.equal(direction([...easing, [23.9, 0.995]]).status, 'EASING');
  assert.equal(direction([...easing, [23.9, 0.995], [23.9, 0.99]]).status, 'EASING', 'a flat daily VIX does not reverse a carried easing direction');
  assert.equal(direction([...easing, [24.1, 0.995]]).status, 'STABLE', 'a daily VIX rise cancels carried easing');
  assert.equal(direction([...easing, [23.9, 0.995], [23.9, 0.99], [23.9, 0.985]]).status, 'STABLE');
});

test('invariant 4: duration and fifteenth-day event distinguish exact runs from lower bounds', () => {
  const unknown = model(flat(15, 32, 1.05));
  assert.equal(unknown.currentInversionDays, 15);
  assert.equal(unknown.durationExact.inversion, false);
  assert.deepEqual(unknown.durationTags, ['PROLONGED_INVERSION']);
  assert.ok(!unknown.eventFlags.some(flag => flag.type === 'INVERSION_15D'));
  const known = model([...flat(2), ...flat(15, 32, 1.05)]);
  assert.equal(known.durationExact.inversion, true);
  assert.ok(known.eventFlags.some(flag => flag.type === 'INVERSION_15D' && flag.sessionsAgo === 0));
  const equality = model([...flat(2), ...flat(14, 32, 1.05), [30, 1]]);
  assert.equal(equality.currentInversionDays, 15, 'ratio equality is inverted in V2');
  const normalized = model([...flat(2), ...flat(15, 32, 1.05), [30, 0.9999]]);
  assert.equal(normalized.currentInversionDays, 0);
  assert.deepEqual(normalized.durationTags, []);
  assert.equal(normalized.highStressDays, 0);
  assert.equal(normalized.extremeStressDays, 0);
});

test('invariant 5: SPY and QQQ price windows do not depend on volatility, each other or crossings', () => {
  const input = fixture(flat(), { spy: Array.from({ length: 30 }, (_, i) => 100 + i), qqq: Array.from({ length: 30 }, (_, i) => 200 - i) });
  const original = buildVixRiskModel(input);
  assert.equal(original.priceAction.SPY.status, 'RECOVERY');
  assert.equal(original.priceAction.QQQ.status, 'NEW_LOW');
  const changedVolatility = structuredClone(input);
  changedVolatility.termStructure.rows = changedVolatility.termStructure.rows.map((r, i) => row(r.date, i % 2 ? 60 : 10, i % 2 ? 1.5 : 0.8));
  assert.deepEqual(buildVixRiskModel(changedVolatility).priceAction, original.priceAction);
  const brokenSpy = structuredClone(input);
  brokenSpy.benchmarks.SPY.splice(-4, 1);
  const changed = buildVixRiskModel(brokenSpy);
  assert.equal(changed.priceAction.SPY.status, 'UNKNOWN');
  assert.deepEqual(changed.priceAction.QQQ, original.priceAction.QQQ);
  assert.equal(changed.currentRiskLevel, original.currentRiskLevel);
  assert.equal(changed.riskDirection, original.riskDirection);
});

test('price rules preserve priority, tied lows, the 20-session window and two MA checks', () => {
  const early = [...Array(16).fill(110), 90, 94, 93, 95];
  assert.equal(price(early).status, 'EARLY_STABILIZATION');
  assert.equal(price(early).daysSinceLow, 3);
  assert.equal(price([...early.slice(0, -1), 89]).status, 'NEW_LOW');
  const tied = price([...early.slice(0, -1), 90]);
  assert.equal(tied.status, 'NO_STABILIZATION');
  assert.equal(tied.daysSinceLow, 0);
  const recovery = [...Array(14).fill(110), 90, 92, 94, 96, 98, 100];
  assert.equal(price(recovery).status, 'RECOVERY');
  assert.equal(price(recovery).daysSinceLow, 5);
  assert.equal(price([...Array(14).fill(110), 90, 130, 120, 110, 100, 120]).status, 'EARLY_STABILIZATION');
  assert.equal(price(Array(20).fill(100)).status, 'NO_STABILIZATION');
  assert.equal(price(Array(19).fill(100)).status, 'INSUFFICIENT_DATA');
  const withOldLow = price([1, ...recovery]);
  assert.equal(withOldLow.lowClose, 90, 'a low outside the current 20 observations must not participate');
});

test('invariant 6: missing and invalid sessions cannot reduce required direction or price windows', () => {
  const input = fixture(flat(30, 32, 1.05));
  const missing = input.termStructure.rows[23].date;
  input.termStructure.rows.splice(23, 1);
  input.benchmarks.SPY.splice(10, 1);
  const result = buildVixRiskModel(input);
  assert.equal(result.facts.contiguousSessions, 6);
  assert.equal(result.riskDirection, 'UNKNOWN');
  assert.equal(result.priceAction.SPY.status, 'UNKNOWN');
  assert.equal(result.priceAction.QQQ.ready, true);
  assert.ok(result.dataQuality.missingSessions.includes(missing));
  const recover = fixture(flat(30, 32, 1.05));
  recover.termStructure.rows.splice(22, 1);
  recover.benchmarks.SPY.splice(9, 1);
  const recovered = buildVixRiskModel(recover);
  assert.equal(recovered.ready, true, 'seven actual contiguous volatility sessions recover direction');
  assert.equal(recovered.priceAction.SPY.ready, true, 'twenty actual contiguous closes recover price');
  assert.equal(recovered.dataQuality.status, 'partial', 'earlier gaps remain diagnostic');
  assert.equal(recovered.durationExact.inversion, false);
  const invalid = fixture(flat(30, 32, 1.05));
  invalid.termStructure.rows.at(-2).vix3m = 0;
  invalid.benchmarks.QQQ.at(-2).close = NaN;
  const failed = buildVixRiskModel(invalid);
  assert.equal(failed.currentRiskLevel, 'EXTREME_STRESS');
  assert.equal(failed.facts.contiguousSessions, 1);
  assert.equal(failed.riskDirection, 'UNKNOWN');
  assert.equal(failed.priceAction.QQQ.reason, 'invalid_data');
});

test('official exceptional closures are diagnostics, not provider gaps or counted sessions', () => {
  for (const [start, closure] of [['2025-01-02', '2025-01-09'], ['2018-11-20', '2018-12-05']]) {
    const result = model(flat(25, 32, 1.05), { start });
    assert.equal(result.ready, true);
    assert.equal(result.priceAction.SPY.ready, true);
    assert.equal(result.currentInversionDays, 25);
    assert.deepEqual(result.dataQuality.missingSessions, []);
    assert.ok(result.dataQuality.officialClosures.some(item => item.date === closure));
  }
});

test('invariant 7: future rows, future metadata, and future invalid values cannot change any output', () => {
  const emptyDate = '2026-08-03';
  const noPrices = buildPriceAction({ rows: [], expectedAsOfDate: emptyDate });
  assert.deepEqual(buildPriceAction({ rows: [{ date: '2026-08-04', close: 100 }], expectedAsOfDate: emptyDate }), noPrices);
  assert.deepEqual(buildPriceAction({ rows: [{ date: '2026-08-04', close: NaN }], expectedAsOfDate: emptyDate }), noPrices);
  const invalidBeforeCutoff = buildPriceAction({ rows: [{ date: emptyDate, close: NaN }], expectedAsOfDate: emptyDate });
  assert.equal(invalidBeforeCutoff.reason, 'invalid_data');
  const emptyInput = { termStructure: { source: 'CBOE', asOfDate: emptyDate, rows: [] }, benchmarks: { SPY: [], QQQ: [] }, expectedAsOfDate: emptyDate };
  const futureOnly = structuredClone(emptyInput);
  futureOnly.termStructure.rows.push(row('2026-08-04', 40, 1.1));
  futureOnly.benchmarks.SPY.push({ date: '2026-08-04', close: 100 });
  assert.deepEqual(buildVixRiskModel(futureOnly), buildVixRiskModel(emptyInput));
  const input = fixture([...flat(15), ...flat(15, 32, 1.15)]);
  for (const index of [0, 5, 6, 18, 19, 20, 26]) {
    const truncated = cutoff(input, index);
    const expected = buildVixRiskModel(truncated);
    const full = structuredClone(input);
    full.expectedAsOfDate = truncated.expectedAsOfDate;
    assert.deepEqual(buildVixRiskModel(full), expected);
    for (const r of full.termStructure.rows) if (r.date > truncated.expectedAsOfDate) { r.vix = 0; r.ratio = Infinity; }
    for (const r of full.benchmarks.SPY) if (r.date > truncated.expectedAsOfDate) r.close = NaN;
    full.termStructure.rows.push({ date: '2099-02-30', vix: 0, vix3m: null, ratio: 0 });
    assert.deepEqual(buildVixRiskModel(full), expected);
  }
});

test('invariant 8: stale or missing dimensions never become zero, and stale flags are scoped', () => {
  const input = fixture(flat(30, 32, 1.05));
  const oldVolatility = buildVixRiskModel({ ...input, stale: true });
  assert.equal(oldVolatility.currentRiskLevel, 'UNKNOWN');
  assert.equal(oldVolatility.currentInversionDays, null);
  assert.equal(oldVolatility.priceAction.SPY.ready, true);
  const oldBenchmarks = buildVixRiskModel({ ...input, benchmarkStale: true });
  assert.equal(oldBenchmarks.currentRiskLevel, 'EXTREME_STRESS');
  assert.equal(oldBenchmarks.priceAction.SPY.status, 'UNKNOWN');
  assert.equal(oldBenchmarks.priceAction.QQQ.reason, 'stale_data');
  assert.equal(oldBenchmarks.priceAction.SPY.daysSinceLow, null);
  const empty = buildVixRiskModel();
  assert.equal(empty.currentRiskLevel, 'UNKNOWN');
  assert.equal(empty.latest, null);
  assert.equal(empty.currentRiskDuration, null);
  const missing = structuredClone(input);
  missing.termStructure.rows.pop();
  const result = buildVixRiskModel(missing);
  assert.equal(result.currentRiskLevel, 'UNKNOWN');
  assert.equal(result.termStructure, 'UNKNOWN');
  assert.equal(result.priceAction.SPY.ready, true);
  assert.ok(result.latest.date < input.expectedAsOfDate);
});

test('malformed latest values and duplicate closes are rejected without changing valid dimensions', () => {
  for (const mutate of [
    r => { r.vix = 0; }, r => { r.vix3m = null; }, r => { r.ratio = 1.2; },
    r => { r.ratio = '0.95'; }, r => { r.vix = Number.MAX_VALUE; r.vix3m = Number.MIN_VALUE; },
  ]) {
    const input = fixture(); mutate(input.termStructure.rows.at(-1));
    const result = buildVixRiskModel(input);
    assert.equal(result.currentRiskLevel, 'UNKNOWN');
    assert.equal(result.reason, 'invalid_data');
    assert.equal(result.priceAction.QQQ.ready, true);
  }
  const duplicate = fixture(); duplicate.termStructure.rows.push({ ...duplicate.termStructure.rows.at(-1) });
  assert.equal(buildVixRiskModel(duplicate).reason, 'invalid_data');
  const input = fixture(); const original = structuredClone(input); buildVixRiskModel(input);
  assert.deepEqual(input, original);
});

test('legacy benchmarkRows feeds only SPY and never returns the old confirmed label', () => {
  const input = fixture();
  const result = buildVixRiskModel({ ...input, benchmarks: undefined, benchmarkRows: input.benchmarks.SPY });
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.priceAction.SPY.status, 'RECOVERY');
  assert.equal(result.priceAction.QQQ.status, 'UNKNOWN');
  assert.equal(result.priceConfirmation.status, 'early_stabilization');
  assert.equal(result.priceConfirmation.deprecated, true);
  assert.equal(Object.isFrozen(VIX_RISK_THRESHOLDS), true);
});
