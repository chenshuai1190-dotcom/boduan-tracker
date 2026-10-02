import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChartDomain,
  buildLinePoints,
  buildStepLinePathFromPoints,
  isRenderableChartValue,
  splitChartPointSegments,
} from '../src/lib/pnlReportChart.js';

function financingGeometry(data) {
  const domain = buildChartDomain(data, ['netAssetUsd', 'totalAssetUsd', 'marginDebtUsd'], 'assets');
  const points = buildLinePoints(data, 'marginDebtUsd', domain);
  const segments = splitChartPointSegments(
    data,
    points,
    point => !isRenderableChartValue(point?.marginDebtUsd),
  );
  return { domain, points, segments, paths: segments.map(buildStepLinePathFromPoints) };
}

test('financing steps change at the next observation, never halfway or ahead of its date', () => {
  const points = [
    { x: 8, y: 150, value: 0 },
    { x: 100, y: 100, value: 50 },
    { x: 200, y: 75, value: 75 },
    { x: 302, y: 150, value: 0 },
  ];
  assert.equal(buildStepLinePathFromPoints(points),
    'M8.00 150.00 H100.00 V100.00 H200.00 V75.00 H302.00 V150.00');
  assert.equal(buildStepLinePathFromPoints(points.slice(0, 2)), 'M8.00 150.00 H100.00 V100.00',
    'the prior balance remains level all the way to the new balance date');
});

test('constant financing remains level and genuine zero balances remain observations', () => {
  const data = [0, 50, 50, 20, 0, 0].map(marginDebtUsd => ({ marginDebtUsd, totalAssetUsd: 100, netAssetUsd: 100 - marginDebtUsd }));
  const { points, segments, paths } = financingGeometry(data);
  assert.deepEqual(points.map(point => point.value), [0, 50, 50, 20, 0, 0]);
  assert.equal(segments.length, 1);
  assert.equal(points[1].y, points[2].y);
  assert.equal(points[0].y, points[4].y);
  assert.equal(points[4].y, points[5].y);
  assert.equal(paths[0], 'M8.00 185.83 H66.80 V105.00 H125.60 V105.00 H184.40 V153.50 H243.20 V185.83 H302.00 V185.83');
});

test('empty and single-observation financing paths do not invent another date', () => {
  assert.equal(buildStepLinePathFromPoints(), '');
  assert.equal(buildStepLinePathFromPoints([]), '');
  assert.equal(buildStepLinePathFromPoints(null), '');
  assert.equal(buildStepLinePathFromPoints([{ x: 15.125, y: 8.999 }]), 'M15.13 9.00');
  assert.deepEqual(financingGeometry([{ marginDebtUsd: null }, {}]).paths, []);
  const { points, paths } = financingGeometry([{ marginDebtUsd: 0 }]);
  assert.equal(points.length, 1);
  assert.equal(points[0].x, 155);
  assert.deepEqual(paths, ['M155.00 105.00']);
});

test('unknown financing breaks the curve without joining across missing null or undefined values', () => {
  const data = [
    { marginDebtUsd: 10 },
    { marginDebtUsd: 20 },
    { marginDebtUsd: null },
    { marginDebtUsd: 30 },
    {},
    { marginDebtUsd: 0 },
    { marginDebtUsd: undefined },
    { marginDebtUsd: 40 },
    { marginDebtUsd: 50 },
  ];
  const { points, segments, paths } = financingGeometry(data);
  assert.deepEqual(points.map(point => point.index), [0, 1, 3, 5, 7, 8]);
  assert.deepEqual(segments.map(segment => segment.map(point => point.index)), [[0, 1], [3], [5], [7, 8]]);
  assert.equal(paths.length, 4);
  assert.ok(paths[1].startsWith('M118.25 '));
  assert.ok(paths[2].startsWith('M191.75 '), 'the known zero must begin a separate segment after a missing record');
  assert.ok(paths[3].startsWith('M265.25 '));
  for (const invalid of ['', ' ', false, true, NaN, Infinity, 'unknown']) {
    const result = financingGeometry([{ marginDebtUsd: 10 }, { marginDebtUsd: invalid }, { marginDebtUsd: 20 }]);
    assert.deepEqual(result.segments.map(segment => segment.map(point => point.index)), [[0], [2]]);
  }
});

test('financing shares the asset currency domain including debt above assets and zero debt', () => {
  const data = [
    { totalAssetUsd: 100, netAssetUsd: -50, marginDebtUsd: 150 },
    { totalAssetUsd: 100, netAssetUsd: 100, marginDebtUsd: 0 },
    { totalAssetUsd: 100, netAssetUsd: 50, marginDebtUsd: 50 },
  ];
  const { domain, points } = financingGeometry(data);
  assert.ok(domain.min < -50 && domain.max > 150);
  const assets = buildLinePoints(data, 'totalAssetUsd', domain);
  const netAssets = buildLinePoints(data, 'netAssetUsd', domain);
  assert.equal(points[2].y, netAssets[2].y, 'equal currency amounts must plot at the same height');
  assert.ok(points[0].y < assets[0].y, 'debt exceeding assets must fit in the shared axis');
  assert.ok([...points, ...assets, ...netAssets].every(point => point.y >= 8 && point.y <= 202));
});

test('financing geometry preserves original values dates indices and input references', () => {
  const data = Object.freeze([
    Object.freeze({ date: '2026-09-28', marginDebtUsd: 12.3456789, totalAssetUsd: 100, netAssetUsd: 87.6543211 }),
    Object.freeze({ date: '2026-09-29', marginDebtUsd: null, totalAssetUsd: 110, netAssetUsd: null }),
    Object.freeze({ date: '2026-09-30', marginDebtUsd: 0, totalAssetUsd: 120, netAssetUsd: 120 }),
  ]);
  const before = JSON.stringify(data);
  const { points, segments } = financingGeometry(data);
  const frozenPoints = Object.freeze(points.map(Object.freeze));
  const pointsBefore = JSON.stringify(frozenPoints);
  buildStepLinePathFromPoints(frozenPoints);
  assert.equal(JSON.stringify(data), before);
  assert.equal(JSON.stringify(frozenPoints), pointsBefore);
  assert.equal(points[0].value, 12.3456789, 'only drawing coordinates are rounded');
  assert.equal(points[0].point, data[0]);
  assert.equal(points[1].point, data[2]);
  assert.equal(segments[0][0], points[0]);
  assert.deepEqual(points.map(point => point.index), [0, 2]);
});
