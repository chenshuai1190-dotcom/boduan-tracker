import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAreaPathFromPoints,
  buildLinePathFromPoints,
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
