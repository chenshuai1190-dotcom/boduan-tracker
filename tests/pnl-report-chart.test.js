import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAreaPathFromPoints,
  buildChartDomain,
  buildLinePoints,
  buildLinePathFromPoints,
  isRenderableChartValue,
  isExplicitUnknownNetAssetPoint,
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
