import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAreaPathFromPoints,
  buildChartDomain,
  buildChartRecordHighs,
  buildLinePoints,
  buildLinePathFromPoints,
  isRenderableChartValue,
  isExplicitUnknownNetAssetPoint,
  splitChartLineBySign,
  splitChartPointSegments,
} from '../src/lib/pnlReportChart.js';

function plottedNetAssetPoints(data) {
  return data.flatMap((point, index) => (
    point.netAssetUsd === null || point.netAssetUsd === undefined
      ? []
      : [{
          index,
          point,
          value: point.netAssetUsd,
          x: index * 10,
          y: 100 - point.netAssetUsd,
        }]
  ));
}

test('splits net-asset line and area paths at explicit unknown financing snapshots', () => {
  const data = [
    { date: '2026-07-01', totalAssetUsd: 100, netAssetUsd: 80 },
    { date: '2026-07-02', totalAssetUsd: 110, netAssetUsd: 90 },
    { date: '2026-07-03', totalAssetUsd: 120, netAssetUsd: null },
    { date: '2026-07-04', totalAssetUsd: null, netAssetUsd: null, benchmarkPct: 0.01 },
    { date: '2026-07-05', totalAssetUsd: 100, netAssetUsd: -20 },
    { date: '2026-07-06', totalAssetUsd: 115, netAssetUsd: 75 },
  ];
  const segments = splitChartPointSegments(
    data,
    plottedNetAssetPoints(data),
    isExplicitUnknownNetAssetPoint,
  );

  assert.deepEqual(segments.map((segment) => segment.map((point) => point.index)), [
    [0, 1],
    [4, 5],
  ]);
  assert.deepEqual(segments.map(buildLinePathFromPoints), [
    'M0.00 20.00 L10.00 10.00',
    'M40.00 120.00 L50.00 25.00',
  ]);
  assert.deepEqual(
    segments.map((segment) => buildAreaPathFromPoints(segment, 150, 10)),
    [
      'M0.00 20.00 L10.00 10.00 L10.00 140 L0.00 140 Z',
      'M40.00 120.00 L50.00 25.00 L50.00 140 L40.00 140 Z',
    ],
  );
});

test('benchmark-only dates do not split an otherwise known net-asset path', () => {
  const data = [
    { date: '2026-07-01', totalAssetUsd: 100, netAssetUsd: 80 },
    { date: '2026-07-02', totalAssetUsd: null, netAssetUsd: null, benchmarkPct: 0.01 },
    { date: '2026-07-03', totalAssetUsd: 120, netAssetUsd: 95 },
  ];
  const segments = splitChartPointSegments(
    data,
    plottedNetAssetPoints(data),
    isExplicitUnknownNetAssetPoint,
  );

  assert.deepEqual(segments.map((segment) => segment.map((point) => point.index)), [[0, 2]]);
  assert.equal(buildLinePathFromPoints(segments[0]), 'M0.00 20.00 L20.00 5.00');
});

test('zero financing and negative net assets remain renderable rather than becoming gaps', () => {
  assert.equal(isExplicitUnknownNetAssetPoint({ totalAssetUsd: 0, netAssetUsd: null }), true);
  assert.equal(isExplicitUnknownNetAssetPoint({ totalAssetUsd: 100, netAssetUsd: 100 }), false);
  assert.equal(isExplicitUnknownNetAssetPoint({ totalAssetUsd: 100, netAssetUsd: -20 }), false);
  assert.equal(isExplicitUnknownNetAssetPoint({ totalAssetUsd: null, netAssetUsd: null }), false);
});

test('portfolio and benchmark use the same dynamic percentage domain and map equal returns equally', () => {
  const data = [
    { pnlPct: -0.3, benchmarkPct: 0.4 },
    { pnlPct: 1.2, benchmarkPct: 1.2 },
    { pnlPct: null, benchmarkPct: 1.8 },
  ];
  const domain = buildChartDomain(data, ['pnlPct', 'benchmarkPct'], 'percentage');
  assert.ok(domain.min < -0.3 && domain.max > 1.8);
  const mine = buildLinePoints(data, 'pnlPct', domain);
  const benchmark = buildLinePoints(data, 'benchmarkPct', domain);
  assert.equal(mine[1].x, benchmark[1].x);
  assert.equal(mine[1].y, benchmark[1].y);
  assert.deepEqual(mine.map(point => point.value), [-0.3, 1.2]);
  assert.ok([...mine, ...benchmark].every(point => point.y >= 8 && point.y <= 202));
  const small = buildChartDomain([{ pnlPct: 0.01, benchmarkPct: 0.02 }], ['pnlPct', 'benchmarkPct']);
  assert.ok(small.max < 0.03, 'small actual returns must not inherit the old 78.48% hardcoded axis');
});

test('dynamic chart geometry keeps missing data absent and renders zero/negative/constant asset observations', () => {
  for (const value of [null, undefined, '', ' ', false, true, NaN, Infinity]) assert.equal(isRenderableChartValue(value), false);
  assert.equal(buildChartDomain([{ pnlPct: null }], ['pnlPct', 'benchmarkPct']), null);
  assert.deepEqual(buildLinePoints([{ pnlPct: null }], 'pnlPct', null), []);
  const data = [
    { totalAssetUsd: 100, netAssetUsd: -20 },
    { totalAssetUsd: 100, netAssetUsd: null },
    { totalAssetUsd: 100, netAssetUsd: 0 },
  ];
  const domain = buildChartDomain(data, ['netAssetUsd', 'totalAssetUsd'], 'assets');
  const points = buildLinePoints(data, 'netAssetUsd', domain);
  assert.deepEqual(points.map(point => point.value), [-20, 0]);
  assert.deepEqual(splitChartPointSegments(data, points, isExplicitUnknownNetAssetPoint).map(segment => segment.map(point => point.index)), [[0], [2]]);
  const constant = buildChartDomain([{ totalAssetUsd: 100 }], ['totalAssetUsd'], 'assets');
  assert.ok(constant.min < 100 && constant.max > 100);
  assert.equal(buildLinePoints([{ totalAssetUsd: 100 }], 'totalAssetUsd', constant)[0].x, 155);
});

test('record highs exclude the baseline and retests while preserving original plotted-point references', () => {
  const data = [5, 5, 4, 6, 6, 5, 7, 6].map((pnlPct, index) => Object.freeze({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, pnlPct }));
  const domain = buildChartDomain(data, ['pnlPct']);
  const points = Object.freeze(buildLinePoints(data, 'pnlPct', domain).map(Object.freeze));
  const before = JSON.stringify(points);
  const records = buildChartRecordHighs(points);
  assert.deepEqual(records.map(point => point.index), [3, 6]);
  assert.equal(records[0], points[3]);
  assert.equal(records[1], points[6]);
  assert.equal(records[0].point, data[3]);
  assert.equal(JSON.stringify(points), before);
  assert.deepEqual(buildChartRecordHighs(points.slice(0, 1)), []);
  assert.deepEqual(buildChartRecordHighs(points.slice(0, 3)), []);
  assert.deepEqual(buildChartRecordHighs(), []);
  assert.deepEqual(buildChartRecordHighs(null), []);
});

test('missing and invalid readings neither establish a zero baseline nor reset the existing peak', () => {
  const invalid = [null, undefined, '', ' ', false, true, NaN, Infinity, -Infinity, 'unknown'];
  const points = [
    ...invalid.map(value => ({ value })),
    { value: -5 }, { value: -3 },
    ...invalid.map(value => ({ value })),
    null, {}, { value: -4 }, { value: -3 }, { value: -2 },
  ];
  const records = buildChartRecordHighs(points);
  assert.deepEqual(records.map(point => point.value), [-3, -2]);
  assert.equal(records.at(-1), points.at(-1));
  assert.deepEqual(buildChartRecordHighs(invalid.map(value => ({ value }))), []);
});

test('record highs correctly advance through negative values and zero without marking a later drawdown', () => {
  const points = [-4, -8, -3, 0, 0, -1, 2, 1].map(value => ({ value }));
  assert.deepEqual(buildChartRecordHighs(points).map(point => point.value), [-3, 0, 2]);
  assert.equal(buildChartRecordHighs(points).at(-1), points[6], 'the latest record may precede the chart endpoint');
});

test('floating-point rounding does not create records but small real advances still do', () => {
  for (const values of [
    [0.3, 0.1 + 0.2, 0.3000000001],
    [1e12, 1e12 + 0.001, 1e12 + 0.01],
    [-0.3, -0.3 + Number.EPSILON, -0.2999999999],
    [-Number.EPSILON, 0, Number.EPSILON, 1e-12],
  ]) {
    const points = values.map(value => ({ value }));
    assert.deepEqual(buildChartRecordHighs(points), [points.at(-1)]);
  }
});

test('each selected interval and each curve keeps its own record-high baseline', () => {
  const data = [
    { pnlPct: 100, netAssetUsd: 40 },
    { pnlPct: 5, netAssetUsd: 60 },
    { pnlPct: 6, netAssetUsd: 50 },
    { pnlPct: 7, netAssetUsd: 70 },
  ];
  const domain = buildChartDomain(data, ['pnlPct', 'netAssetUsd']);
  const returns = buildLinePoints(data, 'pnlPct', domain);
  const assets = buildLinePoints(data, 'netAssetUsd', domain);
  assert.deepEqual(buildChartRecordHighs(returns), []);
  assert.deepEqual(buildChartRecordHighs(returns.slice(1)), [returns[2], returns[3]]);
  assert.deepEqual(buildChartRecordHighs(assets), [assets[1], assets[3]]);
});

function signedPoints(values) {
  return values.map((value, index) => ({ value, x: index * 10, y: 100 - value, index }));
}

test('signed drawing segments merge same-color edges including flat and zero-valued lines', () => {
  for (const { values, sign } of [
    { values: [2, 3, 1, 4], sign: 1 },
    { values: [-2, -3, -1, -4], sign: -1 },
    { values: [0, 0, 0], sign: 1 },
    { values: [4, 4, 4], sign: 1 },
    { values: [-4, -4, -4], sign: -1 },
    { values: [0, 3, 0, 2, 0], sign: 1 },
    { values: [0, -3, 0, -2, 0], sign: -1 },
  ]) {
    const points = signedPoints(values);
    assert.deepEqual(splitChartLineBySign(points), [{ sign, points }]);
  }
});

test('signed drawing segments meet at the interpolated zero without shifting the original line', () => {
  for (const values of [[-3, 1], [3, -1]]) {
    const points = signedPoints(values);
    const segments = splitChartLineBySign(points);
    assert.deepEqual(segments.map(segment => segment.sign), values.map(value => value < 0 ? -1 : 1));
    assert.equal(segments[0].points[0], points[0]);
    assert.equal(segments[1].points.at(-1), points[1]);
    const crossing = segments[0].points.at(-1);
    assert.deepEqual(crossing, { x: 7.5, y: 100, value: 0 });
    assert.equal(crossing, segments[1].points[0], 'both colors share exactly the same crossing');
    assert.deepEqual(segments.map(segment => buildLinePathFromPoints(segment.points)), values[0] < 0
      ? ['M0.00 103.00 L7.50 100.00', 'M7.50 100.00 L10.00 99.00']
      : ['M0.00 97.00 L7.50 100.00', 'M7.50 100.00 L10.00 101.00']);
  }
});

test('explicit zero crossings never give the nonzero part of an edge the opposite color', () => {
  for (const values of [[2, 0, -2], [-2, 0, 2]]) {
    const points = signedPoints(values);
    const segments = splitChartLineBySign(points);
    assert.deepEqual(segments.map(segment => segment.sign), [Math.sign(values[0]), Math.sign(values[2])]);
    assert.deepEqual(segments.map(segment => segment.points), [points.slice(0, 2), points.slice(1)]);
  }
  const points = signedPoints([-2, 0, 0, -2]);
  assert.deepEqual(splitChartLineBySign(points), [
    { sign: -1, points: points.slice(0, 2) },
    { sign: 1, points: points.slice(1, 3) },
    { sign: -1, points: points.slice(2) },
  ]);
});

test('repeated sign changes preserve every observed point with continuous drawing geometry', () => {
  const points = signedPoints([2, -2, 4, -4, 3]);
  const segments = splitChartLineBySign(points);
  assert.deepEqual(segments.map(segment => segment.sign), [1, -1, 1, -1, 1]);
  assert.equal(segments[0].points[0], points[0]);
  assert.equal(segments.at(-1).points.at(-1), points.at(-1));
  for (let index = 1; index < segments.length; index += 1) {
    assert.equal(segments[index - 1].points.at(-1), segments[index].points[0]);
  }
  for (const point of points) assert.ok(segments.some(segment => segment.points.includes(point)));
  for (const segment of segments) {
    assert.ok(segment.points.length >= 2);
    assert.ok(segment.points.some(point => point.x !== segment.points[0].x || point.y !== segment.points[0].y));
    assert.ok(segment.points.every(point => point.value === 0 || Math.sign(point.value) === segment.sign));
  }
});

test('empty, single-point, and duplicate-coordinate inputs produce no degenerate signed lines', () => {
  for (const input of [undefined, null, [], signedPoints([0]), signedPoints([-2])]) {
    assert.deepEqual(splitChartLineBySign(input), []);
  }
  const zero = { x: 0, y: 100, value: 0 };
  assert.deepEqual(splitChartLineBySign([zero, { ...zero }]), []);
  const negative = { x: 10, y: 102, value: -2 };
  assert.deepEqual(splitChartLineBySign([zero, { ...zero }, negative]), [
    { sign: -1, points: [zero, negative] },
  ]);
});

test('signed drawing geometry keeps filtered missing dates absent and never mutates observations', () => {
  const data = Object.freeze([
    Object.freeze({ date: '2026-09-20', pnlUsd: -3 }),
    Object.freeze({ date: '2026-09-21', pnlUsd: null }),
    Object.freeze({ date: '2026-09-22', pnlUsd: 1 }),
  ]);
  const points = Object.freeze(buildLinePoints(data, 'pnlUsd', { min: -4, max: 2 }).map(Object.freeze));
  const before = JSON.stringify({ data, points });
  const segments = splitChartLineBySign(points);
  assert.deepEqual(points.map(point => point.index), [0, 2]);
  assert.equal(segments[0].points[0], points[0]);
  assert.equal(segments[1].points.at(-1), points[1]);
  const crossing = segments[0].points.at(-1);
  assert.equal(crossing.x, 228.5, 'the existing line remains connected over a date without a snapshot');
  assert.equal(Object.hasOwn(crossing, 'point'), false);
  assert.equal(Object.hasOwn(crossing, 'index'), false);
  assert.equal(Object.hasOwn(crossing, 'date'), false);
  assert.equal(JSON.stringify({ data, points }), before);
});

test('signed crossings use raw values and keep large finite values from overflowing', () => {
  for (const values of [[-0.000003, 0.000001], [-3e307, 1e307], [-1e308, 1e308]]) {
    const points = [{ x: 0, y: 20, value: values[0] }, { x: 20, y: 0, value: values[1] }];
    const segments = splitChartLineBySign(points);
    const expectedX = values[0] === -1e308 ? 10 : 15;
    const crossing = segments[0].points.at(-1);
    assert.ok(Math.abs(crossing.x - expectedX) < 1e-12);
    assert.ok(Math.abs(crossing.y - (20 - expectedX)) < 1e-12);
    assert.equal(crossing.value, 0);
  }
});
