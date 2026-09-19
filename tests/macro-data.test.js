import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MACRO_MOCK_SNAPSHOT as snapshot } from '../src/macro/macroMockData.js';
import { formatMacroValue, formatMacroChange, formatMacroEventTime, formatMacroCountdown, sliceMacroHistory } from '../src/macro/macroFormat.js';

test('macro fixtures remain explicitly simulated, deterministic, and free of network or engine dependencies', () => {
  assert.equal(snapshot.now, '2026-09-21T15:00:00Z');
  assert.equal(snapshot.simulated, true);
  const groupIds = Object.values(snapshot.groups).flat();
  assert.equal(new Set(groupIds).size, groupIds.length);
  assert.deepEqual([...groupIds].sort(), Object.keys(snapshot.metrics).sort());
  for (const metric of Object.values(snapshot.metrics)) {
    assert.equal(metric.source, '模拟数据');
    assert.equal(metric.simulated, true);
    assert.ok(metric.history.length > 1250);
    assert.equal(metric.history.at(-1).date, metric.observationAsOf, 'chart observation dates are separate from the latest simulated release');
    assert.equal(metric.observationAsOf, snapshot.asOf);
    assert.ok(metric.asOf <= metric.observationAsOf);
    assert.equal(metric.history.at(-1).value, metric.value);
    const dates = metric.history.map(point => point.date);
    assert.equal(new Set(dates).size, dates.length);
    assert.deepEqual(dates, [...dates].sort());
    assert.ok(metric.history.every(point => Number.isFinite(point.value) && ![0, 6].includes(new Date(`${point.date}T00:00:00Z`).getUTCDay())));
  }
  for (const file of ['macroMockData.js', 'macroFormat.js']) {
    const source = readFileSync(new URL(`../src/macro/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|process\.env|supabase|https?:\/\/|from\s+['"]/);
  }
});

test('four authored contributions total 62 without invoking a macro scoring engine', () => {
  assert.deepEqual(snapshot.growth.factors.map(factor => [factor.id, factor.weight, factor.contribution]), [
    ['rates', 35, 28], ['inflation', 25, 16], ['stress', 25, 10], ['liquidity', 15, 8],
  ]);
  assert.equal(snapshot.growth.factors.reduce((sum, factor) => sum + factor.contribution, 0), snapshot.growth.score);
  assert.equal(snapshot.growth.factors.reduce((sum, factor) => sum + factor.weight, 0), 100);
});

test('liquidity balances use USD billions and preserve the Net = Fed - TGA - RRP identity throughout history', () => {
  const { fedBalance, tga, rrp, netLiquidity, sofr, effr } = snapshot.metrics;
  for (const metric of [fedBalance, tga, rrp, netLiquidity]) assert.equal(metric.unit, 'usdBn');
  assert.equal(sofr.unit, 'percent');
  assert.equal(effr.unit, 'percent');
  assert.equal(netLiquidity.derived, true);
  assert.equal(netLiquidity.status, '中性');
  assert.equal(fedBalance.asOf, '2026-09-16');
  assert.equal(fedBalance.observationAsOf, '2026-09-18');
  assert.ok(fedBalance.history.filter(point => point.date >= fedBalance.asOf).every(point => point.value === fedBalance.value));
  assert.equal(netLiquidity.value, fedBalance.value - tga.value - rrp.value);
  for (let index = 0; index < netLiquidity.history.length; index += 1) {
    assert.equal(netLiquidity.history[index].value, fedBalance.history[index].value - tga.history[index].value - rrp.history[index].value);
    if (index > 0 && new Date(`${fedBalance.history[index].date}T00:00:00Z`).getUTCDay() !== 3) {
      assert.equal(fedBalance.history[index].value, fedBalance.history[index - 1].value, 'weekly simulated releases carry forward without fabricated daily updates');
    }
  }
});

test('mock narrative agrees with rising yields and energy while stress remains near its authored midpoint', () => {
  assert.equal(snapshot.regime.label, '偏紧');
  assert.equal(snapshot.metrics.us10y.value, 4.31);
  assert.equal(snapshot.metrics.us10y.change1d, 8);
  assert.equal(snapshot.metrics.real10y.value, 2.07);
  assert.equal(snapshot.metrics.wti.value, 71.24);
  assert.equal(snapshot.metrics.wti.change1d, 2.8);
  for (const id of snapshot.groups.stress) {
    assert.equal(snapshot.metrics[id].status, '正常');
    assert.ok(snapshot.metrics[id].change1d < 0);
    assert.ok(snapshot.metrics[id].percentile20d >= 35 && snapshot.metrics[id].percentile20d <= 50);
  }
  const { us2y, us10y, spread10y2y, real10y, be10y } = snapshot.metrics;
  assert.ok(Math.abs((us10y.value - us2y.value) * 100 - spread10y2y.value) < 1e-10);
  assert.ok(Math.abs(us10y.value - real10y.value - be10y.value) < 1e-10);
  for (const key of ['change1d', 'change5d', 'change20d']) {
    assert.equal(us10y[key] - us2y[key], spread10y2y[key]);
    assert.equal(us10y[key] - real10y[key], be10y[key]);
  }
});

test('yield changes represent basis points while market-price changes represent percent returns', () => {
  for (const metric of Object.values(snapshot.metrics)) {
    for (const [offset, key] of [[1, 'change1d'], [5, 'change5d'], [20, 'change20d']]) {
      const prior = metric.history.at(-offset - 1).value;
      const delta = metric.changeUnit === 'percent' ? (metric.value / prior - 1) * 100
        : metric.changeUnit === 'bp' && metric.unit === 'percent' ? (metric.value - prior) * 100
          : metric.value - prior;
      assert.ok(Math.abs(delta - metric[key]) < 0.00001, `${metric.id} ${key}`);
    }
  }
  assert.equal(formatMacroValue(4.21, 'percent'), '4.21%');
  assert.equal(formatMacroChange(5, 'bp'), '+5 bp');
  assert.equal(formatMacroChange(-1.25, 'percent'), '−1.25%');
  assert.equal(formatMacroValue(5580, 'usdBn'), '$5,580.0B');
  assert.equal(formatMacroValue(null, 'percent'), '—');
  assert.equal(formatMacroChange(undefined, 'bp'), '—');
  assert.equal(formatMacroChange(0, 'bp'), '0 bp');
});

test('event times use New York daylight saving rules and show the separate local date and time', () => {
  assert.deepEqual(formatMacroEventTime('2026-09-22T12:30:00Z'), {
    date: '2026-09-22', time: '08:30', zone: 'ET', etAbbreviation: 'EDT', localDate: '2026-09-22', localTime: '20:30', localZone: 'Asia/Shanghai',
  });
  assert.equal(formatMacroEventTime('2026-01-22T13:30:00Z').time, '08:30');
  assert.equal(formatMacroEventTime('2026-01-22T13:30:00Z').etAbbreviation, 'EST');
  assert.equal(formatMacroEventTime('2026-03-08T06:59:00Z').time, '01:59');
  assert.equal(formatMacroEventTime('2026-03-08T07:00:00Z').time, '03:00');
  assert.equal(formatMacroEventTime('2026-11-01T05:30:00Z').etAbbreviation, 'EDT');
  assert.equal(formatMacroEventTime('2026-11-01T06:30:00Z').etAbbreviation, 'EST');
  assert.equal(formatMacroEventTime('2026-09-23T18:00:00Z').localDate, '2026-09-24');
  assert.equal(formatMacroEventTime('not-a-date').time, '—');
  assert.equal(formatMacroEventTime(null).time, '—');
});

test('countdown uses supplied time and simulated event names stay within the phase-one whitelist', () => {
  assert.equal(formatMacroCountdown('2026-09-22T12:30:00Z', snapshot.now), '21小时30分');
  assert.equal(formatMacroCountdown('2026-09-18T12:30:00Z', snapshot.now), '已公布');
  assert.equal(formatMacroCountdown('2026-09-21T15:00:30Z', snapshot.now), '不足1分钟');
  assert.equal(formatMacroCountdown('bad', snapshot.now), '—');
  assert.equal(formatMacroCountdown(null, snapshot.now), '—');
  const whitelist = ['CPI', 'Core CPI', 'PCE', 'Core PCE', 'NFP', 'Unemployment', 'Initial Claims', 'ISM', 'Retail Sales', 'GDP', 'FOMC'];
  assert.deepEqual(snapshot.events.map(event => event.code).sort(), [...whitelist].sort());
  for (const event of snapshot.events) {
    assert.equal(event.simulated, true);
    assert.equal(event.source, '演示日程');
  }
  const nextHigh = snapshot.events.find(event => event.importance === 'high' && event.time > snapshot.now);
  assert.equal(nextHigh.code, 'CPI');
  assert.equal(nextHigh.time, '2026-09-22T12:30:00Z');
});

test('history ranges clip calendar boundaries without future points or mutation and clamp month-end dates', () => {
  const history = snapshot.metrics.us10y.history;
  const original = JSON.stringify(history);
  const counts = ['1w', '1m', '3m', '1y', '5y'].map(range => sliceMacroHistory(history, range).length);
  assert.equal(counts[0], 5);
  for (let index = 1; index < counts.length; index += 1) assert.ok(counts[index] > counts[index - 1]);
  const partial = sliceMacroHistory(history, '1m', '2026-08-31');
  assert.ok(partial.every(point => point.date <= '2026-08-31' && point.date > '2026-07-31'));
  assert.deepEqual(sliceMacroHistory([{ date: '2024-02-29', value: 1 }, { date: '2024-03-01', value: 2 }, { date: '2024-03-31', value: 3 }], '1m', '2024-03-31').map(point => point.date), ['2024-03-01', '2024-03-31']);
  assert.deepEqual(sliceMacroHistory(history, 'invalid'), []);
  assert.equal(JSON.stringify(history), original);
});
