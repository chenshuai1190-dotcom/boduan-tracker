import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDrawdowns, buildInvestmentDrawdownModel } from '../src/lib/investmentDrawdownModel.js';

function rows(values, dates = []) {
  return values.map((close, index) => ({ date: dates[index] ?? `2020-01-${String(index + 1).padStart(2, '0')}`, close }));
}

function analyze(values, options = {}) {
  return analyzeDrawdowns(rows(values), { startDate: '2020-01-01', principal: 100, ...options });
}

function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be close to ${expected}`);
}

test('one observation and an increasing series have no drawdown or invented principal recovery', () => {
  for (const prices of [[100], [100, 110, 120, 120, 150]]) {
    const result = analyze(prices);
    assert.deepEqual(result.episodes, []);
    assert.equal(result.maxDrawdownEpisode, null);
    assert.equal(result.longestEpisode, null);
    assert.equal(result.currentEpisode, null);
    assert.equal(result.maxDrawdownPct, 0);
    assert.equal(result.currentDrawdownPct, 0);
    assert.equal(result.principalStats.everBelowPrincipal, false);
    assert.equal(result.principalStats.firstRecoveryDate, null);
    assert.equal(result.principalStats.maximumLossPct, 0);
  }
});

test('recovered drawdown measures peak-to-trough and trough-to-recovery in calendar days', () => {
  const result = analyzeDrawdowns(rows([100, 120, 90, 100, 125], [
    '2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07', '2020-01-10',
  ]), { startDate: '2020-01-01', principal: 1000 });
  const episode = result.maxDrawdownEpisode;
  assert.equal(episode.peakIndex, 1);
  assert.equal(episode.troughIndex, 2);
  assert.equal(episode.recoveryIndex, 4);
  assert.equal(episode.peakValue, 1200);
  assert.equal(episode.troughValue, 900);
  assert.equal(episode.drawdownPct, -25);
  assert.equal(episode.declineDays, 3);
  assert.equal(episode.reboundDays, 4);
  assert.equal(episode.underwaterDays, 7);
  assert.equal(episode.recovered, true);
  near(episode.recoveryGainPct, 100 / 3);
  assert.equal(result.currentEpisode, null);
  assert.equal(result.points.at(-1).value, 1250);
  assert.equal(result.points.at(-1).profit, 250);
  assert.equal(result.points.at(-1).returnPct, 25);
});

test('unrecovered episode ends at the observation boundary without inventing recovery', () => {
  const result = analyze([100, 120, 60, 90]);
  const episode = result.currentEpisode;
  assert.equal(episode.recoveryIndex, null);
  assert.equal(episode.recoveryDate, null);
  assert.equal(episode.reboundDays, null);
  assert.equal(episode.recovered, false);
  assert.equal(episode.underwaterDays, 2);
  assert.equal(episode.drawdownPct, -50);
  assert.equal(episode.recoveryGainPct, 100);
  assert.equal(result.currentDrawdownPct, -25);
});

test('an equal high recovers and the last equal high starts the next episode', () => {
  const result = analyze([100, 100, 80, 100, 100, 70, 100]);
  assert.equal(result.episodes.length, 2);
  assert.deepEqual(result.episodes.map(item => [item.peakIndex, item.troughIndex, item.recoveryIndex]), [[1, 2, 3], [4, 5, 6]]);
  assert.notEqual(result.episodes[0].id, result.episodes[1].id);
  assert.ok(result.episodes[0].recoveryIndex <= result.episodes[1].peakIndex);
});

test('deepest and longest episodes can be different', () => {
  const result = analyze([100, 50, 100, 95, 96, 97, 98, 100]);
  assert.equal(result.maxDrawdownEpisode.peakIndex, 0);
  assert.equal(result.maxDrawdownEpisode.drawdownPct, -50);
  assert.equal(result.longestEpisode.peakIndex, 2);
  assert.equal(result.longestEpisode.underwaterDays, 5);
});

test('principal recovery is distinct from prior-peak recovery', () => {
  const result = analyze([100, 150, 80, 100, 110]);
  assert.equal(result.principalStats.firstUnderwaterDate, '2020-01-03');
  assert.equal(result.principalStats.firstRecoveryDate, '2020-01-04');
  assert.equal(result.principalStats.currentlyBelowPrincipal, false);
  assert.equal(result.currentEpisode.recovered, false);
  near(result.principalStats.maximumLossPct, -20);
  assert.equal(result.principalStats.minimumValue, 80);
  assert.equal(result.principalStats.minimumDate, '2020-01-03');
});

test('a portfolio can draw down deeply without ever losing the starting principal', () => {
  const result = analyze([100, 300, 150, 200]);
  assert.equal(result.maxDrawdownPct, -50);
  assert.equal(result.principalStats.everBelowPrincipal, false);
  assert.equal(result.principalStats.firstUnderwaterDate, null);
  assert.equal(result.principalStats.firstRecoveryDate, null);
  assert.equal(result.principalStats.maximumLossPct, 0);
});

test('currently below principal and first principal recovery are independently retained', () => {
  const result = analyze([100, 80, 100, 60]);
  assert.equal(result.principalStats.firstRecoveryDate, '2020-01-03');
  assert.equal(result.principalStats.currentlyBelowPrincipal, true);
  assert.equal(result.principalStats.minimumValue, 60);
  assert.equal(result.principalStats.maximumLossPct, -40);
  const unrecovered = analyze([100, 90, 80]);
  assert.equal(unrecovered.principalStats.firstRecoveryDate, null);
});

test('minimum recovery follows the global principal minimum, independently of an earlier first recovery', () => {
  const result = analyzeDrawdowns(rows([100, 90, 100, 60, 80, 100, 110], [
    '2020-02-03', '2020-02-04', '2020-02-05', '2020-02-28', '2020-03-02', '2020-03-06', '2020-03-09',
  ]), { startDate: '2020-01-01', principal: 100 });
  assert.equal(result.principalStats.firstRecoveryDate, '2020-02-05');
  assert.equal(result.principalStats.minimumDate, '2020-02-28');
  assert.equal(result.principalStats.minimumRecoveryDate, '2020-03-06');
  assert.equal(result.principalStats.minimumRecoveryDays, 7);
});

test('minimum recovery remains null until it actually happens within the observation window', () => {
  const options = { asOfDate: '2020-01-05' };
  const result = analyze([100, 90, 100, 60, 80, 100], options);
  assert.equal(result.principalStats.firstRecoveryDate, '2020-01-03');
  assert.equal(result.principalStats.minimumDate, '2020-01-04');
  assert.equal(result.principalStats.minimumRecoveryDate, null);
  assert.equal(result.principalStats.minimumRecoveryDays, null);
});

test('no principal loss means no minimum recovery, even when an initial or later equal principal exists', () => {
  for (const prices of [[100], [100, 100, 120], [100, 200, 100, 150]]) {
    const result = analyze(prices);
    assert.equal(result.principalStats.everBelowPrincipal, false);
    assert.equal(result.principalStats.minimumRecoveryDate, null);
    assert.equal(result.principalStats.minimumRecoveryDays, null);
  }
});

test('as-of slice excludes future troughs/recovery and is identical to truncated input', () => {
  const data = rows([90, 100, 110, 80, 70, 120]);
  const options = { startDate: '2020-01-02', asOfDate: '2020-01-04', principal: 1000 };
  const result = analyzeDrawdowns(data, options);
  assert.deepEqual(result, analyzeDrawdowns(data.slice(0, 4), options));
  assert.equal(result.startDate, '2020-01-02');
  assert.equal(result.asOfDate, '2020-01-04');
  assert.equal(result.points[0].value, 1000);
  assert.equal(result.currentEpisode.troughDate, '2020-01-04');
  assert.equal(result.currentEpisode.recoveryDate, null);
});

test('non-trading-day boundaries resolve to actual observations; missing dates are not zero-filled', () => {
  const data = rows([100, 90, 100], ['2020-01-03', '2020-01-06', '2020-01-10']);
  const result = analyzeDrawdowns(data, { startDate: '2020-01-04', asOfDate: '2020-01-12' });
  assert.equal(result.startDate, '2020-01-06');
  assert.equal(result.asOfDate, '2020-01-10');
  assert.equal(result.points.length, 2);
  assert.equal(result.maxDrawdownPct, 0);
});

test('strict ISO dates reject impossible dates and accept leap days with UTC day durations', () => {
  const result = analyzeDrawdowns(rows([100, 80, 100], ['2020-02-28', '2020-02-29', '2020-03-02']), { startDate: '2020-02-01' });
  assert.equal(result.maxDrawdownEpisode.underwaterDays, 3);
  for (const date of ['2021-02-29', '2020-02-30', '2020-13-01', '2020-1-01', 'Jan 1 2020', '2020-01-01T00:00:00Z', null]) {
    assert.throws(() => analyzeDrawdowns([{ date, close: 100 }]), /valid YYYY-MM-DD/);
  }
  assert.throws(() => analyze([100], { startDate: '2020-02-30' }), /valid YYYY-MM-DD/);
  assert.throws(() => analyze([100], { asOfDate: '2020-02-30' }), /valid YYYY-MM-DD/);
});

test('invalid prices, principal, order, or empty data fail closed instead of displaying zero', () => {
  for (const close of [0, -1, NaN, Infinity, -Infinity, null, undefined, '100']) {
    assert.throws(() => analyze([100, close]), /finite positive number/);
  }
  for (const principal of [0, -1, NaN, Infinity, null, '100']) {
    assert.throws(() => analyze([100], { principal }), /finite positive number/);
  }
  assert.throws(() => analyzeDrawdowns([]), /at least one/);
  assert.throws(() => analyzeDrawdowns(null), /at least one/);
  assert.throws(() => analyzeDrawdowns([null]), /price record/);
  assert.throws(() => analyzeDrawdowns(rows([100, 90], ['2020-01-01', '2020-01-01'])), /strictly ascending/);
  assert.throws(() => analyzeDrawdowns(rows([100, 90], ['2020-01-02', '2020-01-01'])), /strictly ascending/);
  assert.throws(() => analyze([100], { asOfDate: '2019-12-31' }), /must not precede/);
  assert.throws(() => analyze([100], { startDate: '2021-01-01' }), /No observed prices/);
  assert.throws(() => analyze([Number.MIN_VALUE, Number.MAX_VALUE]), /numeric range/);
});

test('model does not mutate caller-owned rows or options', () => {
  const data = Object.freeze(rows([100, 90, 100]).map(Object.freeze));
  const options = Object.freeze({ startDate: '2020-01-01', principal: 1000 });
  assert.equal(analyzeDrawdowns(data, options).episodes.length, 1);
});

test('deterministic price paths match independent prefix-max drawdown and episode invariants', () => {
  let seed = 8675309;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let path = 0; path < 250; path += 1) {
    let close = 100;
    const observations = Array.from({ length: 150 }, (_, index) => {
      close *= 0.8 + random() * 0.45;
      return { date: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10), close };
    });
    const result = analyzeDrawdowns(observations, { startDate: '2020-01-01' });
    let expectedMaximum = 0;
    observations.forEach((row, index) => {
      const independentPeak = Math.max(...observations.slice(0, index + 1).map(point => point.close));
      const independentDrawdown = (row.close - independentPeak) / independentPeak * 100;
      expectedMaximum = Math.min(expectedMaximum, independentDrawdown);
      near(result.points[index].drawdownPct, independentDrawdown);
    });
    near(result.maxDrawdownPct, expectedMaximum);
    for (const [index, episode] of result.episodes.entries()) {
      assert.ok(episode.peakIndex < episode.troughIndex);
      assert.ok(episode.drawdownPct < 0);
      near(episode.recoveryGainPct, -episode.drawdownPct / (100 + episode.drawdownPct) * 100);
      if (episode.recovered) assert.ok(episode.troughIndex < episode.recoveryIndex);
      if (index > 0) assert.ok(result.episodes[index - 1].recoveryIndex <= episode.peakIndex);
    }
  }
});

function comparisonModel({ principal = 100, dateYear = 2020 } = {}) {
  const left = [100, 150, 80, 100, 160];
  const right = [100, 90, 50, 80, 95];
  const points = left.map((value, index) => ({
    date: `${dateYear}-01-${String(index + 2).padStart(2, '0')}`,
    values: { QQQ: value / 100 * principal, TQQQ: right[index] / 100 * principal },
  }));
  return { symbols: ['QQQ', 'TQQQ'], principal, points, actualStartDate: points[0].date, asOfDate: points.at(-1).date };
}

test('comparison adapter reuses aligned observations and the exact selected date window', () => {
  const source = comparisonModel({ dateYear: 2000 });
  const result = buildInvestmentDrawdownModel(source);
  assert.deepEqual(result.symbols, ['QQQ', 'TQQQ']);
  assert.equal(result.startDate, '2000-01-02');
  assert.equal(result.asOfDate, '2000-01-06');
  for (const symbol of source.symbols) {
    const analysis = result.analyses[symbol];
    assert.equal(analysis.startDate, source.actualStartDate);
    assert.equal(analysis.asOfDate, source.asOfDate);
    assert.deepEqual(analysis.points.map(point => point.date), source.points.map(point => point.date));
    analysis.points.forEach((point, index) => near(point.value, source.points[index].values[symbol]));
    assert.deepEqual(analysis, analyzeDrawdowns(
      source.points.map(point => ({ date: point.date, close: point.values[symbol] })),
      { principal: source.principal, startDate: source.actualStartDate, asOfDate: source.asOfDate },
    ));
  }
  assert.equal(result.analyses.QQQ.maxDrawdownEpisode.recovered, true);
  assert.equal(result.analyses.TQQQ.maxDrawdownEpisode.recovered, false);
});

test('principal scaling changes assets, not drawdown percentages or recovery dates', () => {
  const base = buildInvestmentDrawdownModel(comparisonModel());
  const scaled = buildInvestmentDrawdownModel(comparisonModel({ principal: 1_000_000 }));
  for (const symbol of base.symbols) {
    const a = base.analyses[symbol];
    const b = scaled.analyses[symbol];
    near(a.maxDrawdownPct, b.maxDrawdownPct);
    assert.equal(a.maxDrawdownEpisode.peakDate, b.maxDrawdownEpisode.peakDate);
    assert.equal(a.maxDrawdownEpisode.troughDate, b.maxDrawdownEpisode.troughDate);
    assert.equal(a.maxDrawdownEpisode.recoveryDate, b.maxDrawdownEpisode.recoveryDate);
    assert.equal(a.maxDrawdownEpisode.underwaterDays, b.maxDrawdownEpisode.underwaterDays);
    assert.equal(a.principalStats.minimumRecoveryDate, b.principalStats.minimumRecoveryDate);
    a.points.forEach((point, index) => {
      near(point.drawdownPct, b.points[index].drawdownPct);
      near(point.value * 10_000, b.points[index].value);
    });
  }
});

test('as-of adapter fails closed on future rows; a real truncated model cannot see later recovery', () => {
  const source = comparisonModel();
  source.asOfDate = source.points[3].date;
  assert.throws(() => buildInvestmentDrawdownModel(source), /date bounds/);
  source.points = source.points.slice(0, 4);
  const result = buildInvestmentDrawdownModel(source);
  assert.equal(result.analyses.QQQ.currentEpisode.recoveryDate, null);
  assert.equal(result.analyses.QQQ.currentEpisode.recoveryIndex, null);
  assert.equal(result.asOfDate, '2020-01-05');
  assert.equal(result.analyses.QQQ.points.length, 4);
  assert.equal(result.analyses.QQQ.points.at(-1).date, source.asOfDate);
});

test('comparison adapter rejects missing, invalid, misaligned, or non-normalized models', () => {
  for (const value of [null, undefined, [], {}, 'model']) {
    assert.throws(() => buildInvestmentDrawdownModel(value));
  }
  const invalidChanges = [
    model => { model.symbols = ['QQQ', 'QQQ']; },
    model => { model.symbols = ['qqq', 'TQQQ']; },
    model => { model.symbols = ['QQQ']; },
    model => { model.principal = 0; },
    model => { model.principal = 1_000_000_001; },
    model => { model.points = []; },
    model => { model.points = [model.points[0]]; },
    model => { model.points[2] = null; },
    model => { delete model.points[2].values.TQQQ; },
    model => { model.points[2].values.QQQ = 0; },
    model => { model.points[2].values.QQQ = NaN; },
    model => { model.points[2].values.QQQ = Infinity; },
    model => { model.points[2].values.QQQ = '80'; },
    model => { model.points[0].values.QQQ = 80; },
    model => { model.points[2].date = model.points[1].date; },
    model => { model.points[2].date = '2020-01-01'; },
    model => { model.points[2].date = '2020-01-07'; },
    model => { model.points[2].date = '2020-02-30'; },
    model => { model.actualStartDate = '2020-01-01'; },
    model => { model.asOfDate = '2020-01-07'; },
  ];
  for (const change of invalidChanges) {
    const source = comparisonModel();
    change(source);
    assert.throws(() => buildInvestmentDrawdownModel(source));
  }
});

test('comparison adapter does not mutate caller-owned data or reuse mutable input objects', () => {
  const source = comparisonModel();
  source.points.forEach(point => { Object.freeze(point.values); Object.freeze(point); });
  Object.freeze(source.points);
  Object.freeze(source.symbols);
  Object.freeze(source);
  const result = buildInvestmentDrawdownModel(source);
  assert.notEqual(result.symbols, source.symbols);
  assert.notEqual(result.analyses.QQQ.points[0], source.points[0]);
  assert.equal(source.points[0].values.QQQ, 100);
});
