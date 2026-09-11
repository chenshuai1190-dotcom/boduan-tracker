import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFearGreedChart, nearestFearGreedTimestamp } from '../src/lib/fearGreedChart.js';

const DAY = 86_400_000;
const LATEST = Date.parse('2004-06-01T20:00:00Z');
const rawPoints = series => series.points.map(({ timestamp, value }) => ({ timestamp, value }));

function assertFiniteGeometry(chart) {
  assert.ok(Number.isFinite(chart.width) && chart.width > 0);
  assert.ok(Number.isFinite(chart.height) && chart.height > 0);
  assert.ok(chart.domain.every(Number.isFinite));
  assert.ok(chart.domain[0] < chart.domain[1]);
  for (const series of chart.series) {
    assert.equal(typeof series.path, 'string');
    assert.doesNotMatch(series.path, /NaN|Infinity/);
    for (const point of series.points) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= 0 && point.x <= chart.width);
      assert.ok(point.y >= 0 && point.y <= chart.height);
    }
  }
}

test('range windows use the snapshot latest valid observation rather than the wall clock', () => {
  const ages = [366, 365, 91, 90, 31, 30, 0];
  const points = ages.map((age, index) => ({ timestamp: LATEST - age * DAY, value: index }));
  const input = [{ id: 'score', points: [...points, { timestamp: LATEST + 1000 * DAY, value: null }] }];
  for (const [range, days] of [['1m', 30], ['3m', 90], ['1y', 365]]) {
    const chart = buildFearGreedChart(input, { range });
    assert.equal(chart.latestTimestamp, LATEST, range);
    assert.deepEqual(rawPoints(chart.series[0]), points.filter(point => point.timestamp >= LATEST - days * DAY), range);
    assert.deepEqual(chart.timestamps, chart.series[0].points.map(point => point.timestamp), range);
    assert.equal(chart.startTimestamp, chart.timestamps[0], range);
    assert.equal(chart.endTimestamp, LATEST, range);
    assertFiniteGeometry(chart);
  }
  assert.deepEqual(buildFearGreedChart(input).timestamps, buildFearGreedChart(input, { range: '1y' }).timestamps);
});

test('only finite numeric observations are plotted while genuine zero and negative values remain', () => {
  const valid = [
    { timestamp: LATEST - 3 * DAY, value: -18.5 },
    { timestamp: LATEST - 2 * DAY, value: 0 },
    { timestamp: LATEST, value: 7.25 },
  ];
  const invalid = [
    ...[null, undefined, NaN, Infinity, -Infinity, '12', true].map(value => ({ timestamp: LATEST - DAY, value })),
    ...[null, undefined, 0, -1, NaN, Infinity, -Infinity, String(LATEST), true].map(timestamp => ({ timestamp, value: 99 })),
  ];
  const chart = buildFearGreedChart([{ id: 'breadth', points: [valid[2], ...invalid, valid[0], valid[1]] }]);
  assert.deepEqual(rawPoints(chart.series[0]), valid);
  assert.deepEqual(chart.timestamps, valid.map(point => point.timestamp));
  assert.ok(chart.domain[0] <= -18.5 && chart.domain[1] >= 7.25);
  assertFiniteGeometry(chart);
});

test('multiple raw series retain their own values and gaps on a shared real timestamp axis', () => {
  const first = [
    { timestamp: LATEST - 2 * DAY, value: -50 },
    { timestamp: LATEST, value: 21 },
  ];
  const second = [
    { timestamp: LATEST - 2 * DAY, value: 4200 },
    { timestamp: LATEST - DAY, value: 4300 },
    { timestamp: LATEST, value: 4400 },
  ];
  const input = [{ id: 'indicator', points: first }, { id: 'benchmark', points: second }];
  const before = structuredClone(input);
  const chart = buildFearGreedChart(input);
  assert.deepEqual(chart.series.map(series => series.id), ['indicator', 'benchmark']);
  assert.deepEqual(rawPoints(chart.series[0]), first);
  assert.deepEqual(rawPoints(chart.series[1]), second);
  assert.deepEqual(chart.timestamps, [LATEST - 2 * DAY, LATEST - DAY, LATEST]);
  assert.equal(chart.series[0].points[0].x, chart.series[1].points[0].x);
  assert.notEqual(chart.series[0].points[0].y, chart.series[1].points[0].y);
  assert.ok(chart.domain[0] <= -50 && chart.domain[1] >= 4400, 'raw metrics must not be squeezed into a score domain');
  assert.deepEqual(input, before, 'building the chart must preserve its source observations');
  assertFiniteGeometry(chart);
});

test('an explicit score domain stays at zero to one hundred', () => {
  const chart = buildFearGreedChart([{ id: 'score', points: [
    { timestamp: LATEST - 2 * DAY, value: 0 },
    { timestamp: LATEST - DAY, value: 42 },
    { timestamp: LATEST, value: 100 },
  ] }], { fixedDomain: [0, 100] });
  assert.deepEqual(chart.domain, [0, 100]);
  assert.deepEqual(chart.series[0].points.map(point => point.value), [0, 42, 100]);
  assertFiniteGeometry(chart);
});

test('single observations and constant series have finite coordinates and a nonzero domain', () => {
  for (const points of [
    [{ timestamp: LATEST, value: 0 }],
    [{ timestamp: LATEST - DAY, value: -12 }, { timestamp: LATEST, value: -12 }],
  ]) {
    const chart = buildFearGreedChart([{ id: 'constant', points }]);
    assert.deepEqual(rawPoints(chart.series[0]), points);
    assert.equal(chart.latestTimestamp, LATEST);
    assert.ok(chart.domain[0] < points[0].value && chart.domain[1] > points[0].value);
    assertFiniteGeometry(chart);
  }
});

test('empty and wholly invalid series remain empty without synthetic observations', () => {
  for (const input of [[], [{ id: 'empty', points: [] }, { id: 'invalid', points: [{ timestamp: LATEST, value: null }] }]]) {
    const chart = buildFearGreedChart(input);
    assert.deepEqual(chart.timestamps, []);
    assert.equal(chart.latestTimestamp, null);
    assert.equal(chart.startTimestamp, null);
    assert.equal(chart.endTimestamp, null);
    assert.deepEqual(chart.series.map(series => series.id), input.map(series => series.id));
    for (const series of chart.series) {
      assert.deepEqual(series.points, []);
      assert.equal(series.path, '');
    }
    assertFiniteGeometry(chart);
  }
});

test('nearest selection follows elapsed time instead of assuming equally spaced samples', () => {
  const timestamps = [LATEST - 10 * DAY, LATEST - 9 * DAY, LATEST];
  assert.equal(nearestFearGreedTimestamp(timestamps, 0.2), LATEST - 9 * DAY);
  assert.equal(nearestFearGreedTimestamp(timestamps, 0.49), LATEST - 9 * DAY);
  assert.equal(nearestFearGreedTimestamp(timestamps, 0.6), LATEST);
  assert.equal(nearestFearGreedTimestamp(timestamps, -4), timestamps[0]);
  assert.equal(nearestFearGreedTimestamp(timestamps, 0), timestamps[0]);
  assert.equal(nearestFearGreedTimestamp(timestamps, 1), LATEST);
  assert.equal(nearestFearGreedTimestamp(timestamps, 4), LATEST);
  assert.equal(nearestFearGreedTimestamp([LATEST], 0.37), LATEST);
});

test('nearest selection returns null for absent observations or invalid ratios', () => {
  assert.equal(nearestFearGreedTimestamp([], 0.5), null);
  assert.equal(nearestFearGreedTimestamp(null, 0.5), null);
  for (const ratio of [null, undefined, NaN, Infinity, -Infinity, '0.5', true]) {
    assert.equal(nearestFearGreedTimestamp([LATEST], ratio), null);
  }
});
