import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVixComparisonGeometry, buildVixComparisonModel, formatVixComparisonAxisValue, formatVixComparisonChangePercent, nearestVixComparisonIndex, normalizeVixComparisonRows } from '../src/lib/vixComparisonChart.js';

test('comparison normalizes positive closes and rejects invalid calendar dates without inventing values', () => {
  assert.deepEqual(normalizeVixComparisonRows([
    { date: '2026-02-30', close: 12 }, { date: '2026-03-02', close: null },
    { date: '2026-03-03', close: '' }, { date: '2026-03-04', close: 0 },
    { date: '2026-03-05', close: -1 }, { date: '2026-03-06', close: '19.2' },
    { date: '2026-03-06', close: 20 }, { date: '2026-03-01', close: 18 },
    { date: '2026-03-07', close: true }, { date: '2026-03-08', close: [22] },
  ]), [{ date: '2026-03-01', close: 18 }, { date: '2026-03-06', close: 20 }]);
});

test('comparison only joins common dates and computes ETF change from the shared endpoints', () => {
  const model = buildVixComparisonModel({
    vixRows: [{ date: '2026-09-01', close: 20 }, { date: '2026-09-02', close: 40 }, { date: '2026-09-03', close: 15 }],
    benchmarkRows: [{ date: '2026-08-31', close: 50 }, { date: '2026-09-01', close: 100 }, { date: '2026-09-03', close: 110 }, { date: '2026-09-04', close: 150 }],
  });
  assert.deepEqual(model.rows, [
    { date: '2026-09-01', vix: 20, price: 100, priceDayChangePct: null, vixDayChangePct: null },
    { date: '2026-09-03', vix: 15, price: 110, priceDayChangePct: null, vixDayChangePct: null },
  ]);
  assert.ok(Math.abs(model.priceChangePct - 10) < 1e-9);
  assert.equal(model.to, '2026-09-03');
  assert.equal(model.vixHigh, 20);
  assert.equal(model.vixLow, 15);
});

test('calendar month ranges clamp month ends and anchor to the latest common close', () => {
  const rows = [{ date: '2026-02-27', close: 15 }, { date: '2026-02-28', close: 16 }, { date: '2026-03-31', close: 17 }];
  const model = buildVixComparisonModel({ vixRows: rows, benchmarkRows: rows, range: '1m' });
  assert.equal(model.requestedFrom, '2026-02-28');
  assert.deepEqual(model.rows.map(row => row.date), ['2026-02-28', '2026-03-31']);
  assert.equal(buildVixComparisonModel({ vixRows: rows, benchmarkRows: rows, range: 'bad' }).requestedFrom, '2025-03-31');
});

test('zero or one common close is insufficient for a return or a drawn comparison', () => {
  const empty = buildVixComparisonModel();
  assert.equal(empty.priceChangePct, null);
  assert.equal(empty.vixLow, null);
  assert.equal(buildVixComparisonGeometry(empty.rows), null);
  const single = buildVixComparisonModel({ vixRows: [{ date: '2026-09-01', close: 20 }], benchmarkRows: [{ date: '2026-09-01', close: 600 }] });
  assert.equal(single.hasComparison, false);
  assert.equal(single.priceChangePct, null);
  assert.equal(buildVixComparisonGeometry(single.rows), null);
});

test('dual axes independently retain true direction with shared dates and finite constant-series scales', () => {
  const geometry = buildVixComparisonGeometry([{ date: '2026-09-01', vix: 20, price: 600 }, { date: '2026-09-02', vix: 30, price: 550 }]);
  assert.ok(geometry.points[1].vixY < geometry.points[0].vixY);
  assert.ok(geometry.points[1].priceY > geometry.points[0].priceY);
  assert.ok(geometry.vixAxis.max < geometry.priceAxis.min);
  assert.equal(geometry.points[0].x, geometry.left);
  assert.equal(geometry.points[1].x, geometry.right);
  const flat = buildVixComparisonGeometry([{ date: '2026-09-01', vix: 20, price: 600 }, { date: '2026-09-02', vix: 20, price: 600 }]);
  assert.ok(flat.points.every(point => Number.isFinite(point.vixY) && Number.isFinite(point.priceY)));
  assert.equal(nearestVixComparisonIndex(flat.points, -100), 0);
  assert.equal(nearestVixComparisonIndex(flat.points, 900), 1);
  assert.equal(nearestVixComparisonIndex([], 0), null);
});

test('narrow VIX and four-digit ETF axes keep distinct fractional tick labels', () => {
  const geometry = buildVixComparisonGeometry([{ date: '2026-09-01', vix: 17, price: 1000 }, { date: '2026-09-02', vix: 18, price: 1020 }]);
  for (const axis of [geometry.vixAxis, geometry.priceAxis]) {
    const labels = axis.ticks.map(formatVixComparisonAxisValue);
    assert.equal(new Set(labels).size, axis.ticks.length);
  }
  assert.equal(formatVixComparisonAxisValue(17.5), '17.5');
  assert.equal(formatVixComparisonAxisValue(17.75), '17.75');
  assert.equal(formatVixComparisonAxisValue(1000), '1,000');
});

function dailyModel(dates, prices, vix, range = '1y') {
  return buildVixComparisonModel({
    vixRows: dates.map((date, index) => ({ date, close: vix[index] })),
    benchmarkRows: dates.map((date, index) => ({ date, close: prices[index] })),
    range,
  });
}

test('daily comparison uses percent units and first historical close has no invented prior close', () => {
  const model = dailyModel(['2026-09-01', '2026-09-02', '2026-09-03'], [100, 105, 105], [20, 18, 18]);
  assert.equal(model.first.priceDayChangePct, null);
  assert.equal(model.first.vixDayChangePct, null);
  assert.equal(model.rows[1].priceDayChangePct, 5);
  assert.equal(model.rows[1].vixDayChangePct, -10);
  assert.equal(model.last.priceDayChangePct, 0);
  assert.equal(model.last.vixDayChangePct, 0);
});

test('daily comparison bridges weekends and Labor Day using the immediately prior US session', () => {
  const weekend = dailyModel(['2026-08-28', '2026-08-31'], [100, 103], [20, 21]);
  assert.equal(weekend.last.priceDayChangePct, 3);
  assert.equal(weekend.last.vixDayChangePct, 5);
  const laborDay = dailyModel(['2026-09-04', '2026-09-08'], [100, 98], [20, 23]);
  assert.equal(laborDay.last.priceDayChangePct, -2);
  assert.equal(laborDay.last.vixDayChangePct, 15);
});

test('missing normal trading days and holiday rows never receive a multi-day move labeled daily', () => {
  const missing = dailyModel(['2026-09-01', '2026-09-03'], [100, 110], [20, 25]);
  assert.equal(missing.last.priceDayChangePct, null);
  assert.equal(missing.last.vixDayChangePct, null);
  assert.ok(Math.abs(missing.priceChangePct - 10) < 1e-9, 'a valid interval return remains available');
  const holiday = dailyModel(['2026-09-04', '2026-09-07', '2026-09-08'], [100, 103, 104], [20, 21, 22]);
  assert.equal(holiday.rows[1].priceDayChangePct, null);
  assert.equal(holiday.rows[1].vixDayChangePct, null);
  assert.equal(holiday.last.priceDayChangePct, null, 'a non-session row cannot become the previous-close baseline');
});

test('the first visible range row retains the daily change from a preceding off-screen session', () => {
  const model = dailyModel(['2026-08-07', '2026-08-10', '2026-09-10'], [100, 104, 110], [20, 19, 22], '1m');
  assert.equal(model.requestedFrom, '2026-08-10');
  assert.equal(model.first.date, '2026-08-10');
  assert.equal(model.first.priceDayChangePct, 4);
  assert.equal(model.first.vixDayChangePct, -5);
  assert.equal(model.last.priceDayChangePct, null, 'a gap later in the range still remains unknown');
});

test('day-change formatter preserves signed percent units and normalizes rounded zero', () => {
  assert.equal(formatVixComparisonChangePercent(5), '+5.00%');
  assert.equal(formatVixComparisonChangePercent(-1.236), '-1.24%');
  assert.equal(formatVixComparisonChangePercent(0), '0.00%');
  assert.equal(formatVixComparisonChangePercent(-0), '0.00%');
  assert.equal(formatVixComparisonChangePercent(-0.001), '0.00%');
  assert.equal(formatVixComparisonChangePercent(0.001), '0.00%');
  for (const value of [null, undefined, NaN, Infinity, '5']) assert.equal(formatVixComparisonChangePercent(value), '—');
});
