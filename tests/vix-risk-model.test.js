import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVixRiskModel, VIX_RISK_THRESHOLDS } from '../src/lib/vixRiskModel.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

function sessions(count, start = '2026-08-03') {
  const result = [];
  const date = new Date(`${start}T00:00:00Z`);
  while (result.length < count) {
    const key = date.toISOString().slice(0, 10);
    if (![0, 6].includes(date.getUTCDay()) && !isRegularNyseHoliday(key)) result.push(key);
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return result;
}

function row(date, vix = 18, ratio = 0.95) {
  return { date, vix, vix3m: vix / ratio, ratio };
}

function input(values, { start, closes } = {}) {
  const dates = sessions(values.length, start);
  const rows = values.map(([vix, ratio], index) => row(dates[index], vix, ratio));
  const asOfDate = dates.at(-1);
  return {
    expectedAsOfDate: asOfDate,
    termStructure: { source: 'CBOE', asOfDate, expectedAsOfDate: asOfDate, stale: false, staleReason: '', rows },
    benchmarkRows: dates.map((date, index) => ({ date, close: closes?.[index] ?? 100 + index })),
  };
}

const neutral = (count = 8) => Array.from({ length: count }, () => [18, 0.95]);
const model = (values, options) => buildVixRiskModel(input(values, options));

test('VIX and term-ratio boundaries distinguish calm, caution and uncovered combinations', () => {
  assert.equal(model(neutral()).duration, 8, 'history warmup does not shorten the observed state duration');
  for (const [vix, ratio, phase] of [
    [15.99, 0.899, 'calm'], [16, 0.90, 'caution'], [22, 1, 'caution'],
    [15.99, 0.90, 'mixed'], [16, 0.899, 'mixed'], [22.01, 0.95, 'mixed'],
    [25, 0.95, 'mixed'], [18, 1.001, 'mixed'],
  ]) {
    const result = model([...neutral(), [vix, ratio]]);
    assert.equal(result.phase, phase, `${vix} / ${ratio}`);
    assert.equal(result.ready, true);
  }
});

test('acute stress requires both observed upcrossings within three completed sessions', () => {
  const initial = [...neutral(), [25, 1], [26, 1.04]];
  const first = model(initial);
  assert.equal(first.phase, 'stress');
  assert.equal(first.invertedDays, 1);
  assert.equal(first.stressDates.ratioCrossedAt, first.asOfDate);
  assert.equal(first.stressDates.vixCrossedAt, first.asOfDate);
  assert.equal(model([...initial, [27, 1.03], [28, 1.02]]).phase, 'stress');
  assert.equal(model([...initial, [27, 1.03], [28, 1.02], [28, 1.02]]).phase, 'mixed');
  assert.equal(model([...neutral(), [26, 0.98], [26, 0.98], [26, 0.98], [27, 1.02]]).phase, 'mixed');
  assert.equal(model([...initial, [24, 1.03]]).phase, 'mixed', 'a VIX reversal cancels acute classification');
  assert.equal(model([...initial, [26, 0.99]]).phase, 'mixed', 'a ratio reversal cancels acute classification');
});

test('persistent pressure starts at 15 consecutive inverted sessions and resets at equality', () => {
  const fourteen = [...neutral(), ...Array.from({ length: 14 }, () => [26, 1.05])];
  assert.equal(model(fourteen).phase, 'mixed');
  const persistent = model([...fourteen, [24, 1.05]]);
  assert.equal(persistent.phase, 'persistent');
  assert.equal(persistent.invertedDays, 15);
  assert.equal(persistent.duration, 1);
  assert.equal(persistent.facts.invertedDaysExact, true);
  const reset = model([...fourteen, [20, 1], [26, 1.04]]);
  assert.equal(reset.invertedDays, 1);
  assert.equal(reset.phase, 'stress');
});

test('a recovery needs its own 1.10 peak and two consecutive below-1 closes', () => {
  const prefix = [...neutral(), [26, 1.10]];
  assert.notEqual(model([...prefix, [20, 0.97]]).phase, 'recovery');
  const recovery = model([...prefix, [20, 0.97], [19, 0.96]]);
  assert.equal(recovery.phase, 'recovery', 'recovery takes priority over the simultaneously satisfied caution bucket');
  assert.equal(recovery.ratioBelowDays, 2);
  assert.equal(recovery.episodePeakRatio, 1.10);
  assert.equal(recovery.facts.recoveryWindowDay, 1);
  assert.equal(model([...neutral(), [26, 1.099], [20, 0.97], [19, 0.96]]).phase, 'caution');
  const longPressure = [...neutral(), ...Array.from({ length: 15 }, () => [29, 1.12])];
  assert.equal(model(longPressure).phase, 'persistent');
  assert.equal(model([...longPressure, [20, 0.98], [19, 0.96]]).phase, 'recovery');
});

test('recovery confirmation lasts exactly five sessions and does not resurrect an old peak', () => {
  const prefix = [...neutral(), [27, 1.12]];
  const sixBelow = [...prefix, ...Array.from({ length: 6 }, () => [19, 0.96])];
  const lastRecoveryDay = model(sixBelow);
  assert.equal(lastRecoveryDay.phase, 'recovery');
  assert.equal(lastRecoveryDay.facts.recoveryWindowDay, 5);
  const expired = model([...sixBelow, [19, 0.95]]);
  assert.equal(expired.phase, 'caution');
  assert.equal(expired.episodePeakRatio, null);
  assert.equal(expired.facts.recoveryConfirmedAt, null);
  const newMildEpisode = model([...sixBelow, [19, 0.95], [26, 1.04], [19, 0.97], [19, 0.96]]);
  assert.equal(newMildEpisode.phase, 'caution');
  assert.equal(newMildEpisode.episodePeakRatio, 1.04);
});

test('rebounding to equality or inversion invalidates recovery and binds a new episode', () => {
  const recovered = [...neutral(), [27, 1.15], [21, 0.98], [20, 0.97]];
  assert.equal(model(recovered).phase, 'recovery');
  for (const rebound of [[20, 1], [27, 1.04]]) {
    const result = model([...recovered, rebound, [20, 0.98], [19, 0.97]]);
    assert.equal(result.phase, 'caution');
    assert.notEqual(result.episodePeakRatio, 1.15);
  }
  assert.equal(model([...recovered, [28, 1.11], [20, 0.98], [19, 0.97]]).phase, 'recovery');
});

test('price stabilization uses the event low, requires three subsequent sessions and an uptick', () => {
  const values = [...neutral(), [27, 1.14], [26, 1.06], [24, 1.02], [20, 0.98], [19, 0.96]];
  const closes = [...neutral().map(() => 120), 100, 90, 92, 91, 94];
  const result = model(values, { closes });
  assert.equal(result.phase, 'recovery');
  assert.equal(result.priceConfirmation.status, 'confirmed');
  assert.equal(result.priceConfirmation.daysSinceLow, 3);
  assert.equal(result.priceConfirmation.lowClose, 90);
  assert.equal(result.priceConfirmation.lowDate, sessions(values.length)[9]);
  assert.equal(model(values.slice(0, -1), { closes: closes.slice(0, -1) }).priceConfirmation.status, 'pending');
  const fallingLatest = model(values, { closes: [...closes.slice(0, -1), 90.5] });
  assert.equal(fallingLatest.priceConfirmation.status, 'pending');
  const freshLow = model(values, { closes: [...closes.slice(0, -1), 89] });
  assert.equal(freshLow.priceConfirmation.daysSinceLow, 0);
  assert.equal(freshLow.priceConfirmation.lowClose, 89);
  assert.equal(freshLow.phase, 'recovery', 'price confirmation is independent of the volatility classification');
});

test('missing benchmark sessions cannot manufacture a confirmed low or affect volatility classification', () => {
  const options = input([...neutral(), [27, 1.14], [26, 1.06], [24, 1.02], [20, 0.98], [19, 0.96]]);
  options.benchmarkRows.splice(9, 1);
  const result = buildVixRiskModel(options);
  assert.equal(result.phase, 'recovery');
  assert.deepEqual(result.priceConfirmation, { status: 'unavailable', reason: 'benchmark_gap', daysSinceLow: null, lowDate: null, lowClose: null });
  assert.equal(buildVixRiskModel({ ...options, benchmarkRows: [] }).priceConfirmation.reason, 'missing_benchmark');
});

test('missing term sessions neither compress inversion streaks nor create crossings across a gap', () => {
  const options = input([...neutral(), ...Array.from({ length: 16 }, () => [27, 1.13])]);
  options.termStructure.rows.splice(12, 1);
  const result = buildVixRiskModel(options);
  assert.equal(result.phase, 'mixed');
  assert.equal(result.invertedDays, 11);
  assert.equal(result.facts.invertedDaysExact, false);
  assert.equal(result.facts.gapDetected, true);
  const crossing = input([...neutral(), [18, 0.95], [27, 1.13]]);
  crossing.termStructure.rows.splice(8, 1);
  const recent = buildVixRiskModel(crossing);
  assert.equal(recent.phase, 'mixed');
  assert.equal(recent.reason, 'insufficient_history');
  assert.equal(recent.ready, false);
  assert.deepEqual(recent.stressDates, { ratioCrossedAt: null, vixCrossedAt: null });
});

test('ordinary weekends and exchange holidays do not interrupt valid consecutive sessions', () => {
  const result = model([...neutral(), ...Array.from({ length: 15 }, () => [27, 1.12])], { start: '2026-08-17' });
  assert.equal(result.phase, 'persistent');
  assert.equal(result.invertedDays, 15);
  assert.equal(result.facts.gapDetected, false);
});

test('unknown recent history is mixed and an unknown old episode cannot supply a recovery peak', () => {
  const short = model(neutral(6));
  assert.equal(short.phase, 'mixed');
  assert.equal(short.reason, 'insufficient_history');
  assert.equal(short.duration, null);
  const unknownEpisode = model([...Array.from({ length: 8 }, () => [27, 1.12]), [20, 0.98], [19, 0.97]]);
  assert.equal(unknownEpisode.phase, 'mixed');
  assert.equal(unknownEpisode.reason, 'insufficient_history');
  assert.equal(unknownEpisode.priceConfirmation.status, 'unavailable');
});

test('missing, stale, malformed, conflicting and uncompleted data never turn into zero readings', () => {
  assert.equal(buildVixRiskModel().reason, 'missing_data');
  assert.equal(buildVixRiskModel().latest, null);
  const options = input(neutral());
  for (const mutate of [
    (value) => { value.termStructure.rows.at(-1).vix = 0; },
    (value) => { value.termStructure.rows.at(-1).vix3m = null; },
    (value) => { value.termStructure.rows.at(-1).ratio = 1.2; },
    (value) => { value.termStructure.rows.at(-1).ratio = '0.95'; },
    (value) => { value.termStructure.rows.at(-1).vix = Number.MAX_VALUE; value.termStructure.rows.at(-1).vix3m = Number.MIN_VALUE; },
    (value) => { value.termStructure.rows.at(-1).vix = Number.MIN_VALUE; value.termStructure.rows.at(-1).vix3m = Number.MAX_VALUE; },
    (value) => { value.termStructure.rows.at(-1).date = '2026-02-30'; },
    (value) => { value.termStructure.rows.push({ ...value.termStructure.rows.at(-1) }); },
    (value) => { value.termStructure.source = 'SYNTHETIC'; },
    (value) => { value.termStructure.asOfDate = '2026-08-03'; },
  ]) {
    const value = structuredClone(options);
    mutate(value);
    const result = buildVixRiskModel(value);
    assert.equal(result.phase, 'unavailable');
    assert.equal(result.reason, 'invalid_data');
    assert.equal(result.invertedDays, null);
  }
  const missing = structuredClone(options);
  missing.termStructure.rows.pop();
  assert.equal(buildVixRiskModel(missing).reason, 'missing_latest');
  assert.equal(buildVixRiskModel({ ...options, stale: true }).reason, 'stale_data');
  options.termStructure.stale = true;
  assert.equal(buildVixRiskModel(options).reason, 'stale_data');
});

test('point-in-time outputs and input arrays are unchanged by future market data', () => {
  const options = input([...neutral(), [27, 1.12], [20, 0.98], [19, 0.97]]);
  const original = structuredClone(options);
  const before = buildVixRiskModel(options);
  assert.deepEqual(options, original);
  const futureDate = sessions(options.termStructure.rows.length + 1).at(-1);
  options.termStructure.asOfDate = futureDate;
  options.termStructure.rows.push({ date: futureDate, vix: 100, vix3m: 0, ratio: 500 });
  options.benchmarkRows.push({ date: futureDate, close: 0 });
  assert.deepEqual(buildVixRiskModel(options), before, 'future row values are irrelevant, even when invalid');
  options.termStructure.rows.at(-1).vix = 1;
  options.termStructure.rows.at(-1).ratio = 0.01;
  assert.deepEqual(buildVixRiskModel(options), before);
});

test('the exported contract makes confirmation windows and persistent thresholds explicit', () => {
  assert.equal(VIX_RISK_THRESHOLDS.recentCrossingSessions, 3);
  assert.equal(VIX_RISK_THRESHOLDS.persistentSessions, 15);
  assert.equal(VIX_RISK_THRESHOLDS.recoveryBelowSessions, 2);
  assert.equal(VIX_RISK_THRESHOLDS.recoveryWindowSessions, 5);
  assert.equal(VIX_RISK_THRESHOLDS.priceStabilizationSessions, 3);
  assert.equal(Object.isFrozen(VIX_RISK_THRESHOLDS), true);
});
