import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCompoundPathModel } from '../src/lib/compoundPathModel.js';

const plan = {
  startCapital: 1000,
  startYear: 2025,
  totalYears: 10,
  targetAnnualRate: 0.2,
  currentYear: 2026,
  yearRows: [],
};

const empty = { points: [], simulationRows: [], latestActualIndex: null };

test('aligns the principal and ten year-end points with the ten simulation rows', () => {
  const model = buildCompoundPathModel(plan);

  assert.equal(model.points.length, 11);
  assert.equal(model.simulationRows.length, 10);
  assert.deepEqual(model.points[0], {
    index: 0, year: null, kind: 'start', plannedValue: 1000, actualValue: null,
  });
  assert.deepEqual(model.points[1], {
    index: 1, year: 2025, kind: 'year', plannedValue: 1200, actualValue: null,
  });
  assert.deepEqual(model.points[10], {
    index: 10, year: 2034, kind: 'year', plannedValue: 6192, actualValue: null,
  });
  for (const row of model.simulationRows) {
    assert.equal(model.points[row.index].year, row.year);
    assert.equal(model.points[row.index].plannedValue, row.endBalance);
  }
  assert.equal(model.latestActualIndex, null);
});

test('preserves simulation rounding from the raw initial principal and rounded year ends', () => {
  const model = buildCompoundPathModel({ ...plan, startCapital: 100.5, targetAnnualRate: 0.1, totalYears: 3 });

  assert.deepEqual(model.simulationRows, [
    { index: 1, year: 2025, annualGain: 11, endBalance: 111 },
    { index: 2, year: 2026, annualGain: 11, endBalance: 122 },
    { index: 3, year: 2027, annualGain: 12, endBalance: 134 },
  ]);
  assert.equal(model.points[0].plannedValue, 100.5);
});

test('keeps missing records as gaps and retains explicit zero actual gains and balances', () => {
  const model = buildCompoundPathModel({
    ...plan,
    currentYear: 2030,
    yearRows: [
      { year: 2025, actualGain: 0, endBalance: 0, isProjected: false },
      { year: 2026, actualGain: null, endBalance: 1200, isProjected: false },
      { year: 2027, actualGain: 300, endBalance: 1300, isProjected: false },
      { year: 2028, actualGain: 200, endBalance: null, isProjected: false },
      { year: 2029, actualGain: '', endBalance: 1400, isProjected: false },
      { year: 2030, actualGain: 0, endBalance: '', isProjected: false },
    ],
  });

  assert.deepEqual(model.points.map((point) => point.actualValue), [null, 0, null, 1300, null, null, null, null, null, null, null]);
  assert.equal(model.latestActualIndex, 3);
});

test('uses the latest recorded plan year, excludes future records, and ignores input order', () => {
  const model = buildCompoundPathModel({
    ...plan,
    currentYear: 2031,
    yearRows: [
      { year: 2032, actualGain: 1000, endBalance: 6000, isProjected: false },
      { year: 2028, actualGain: 100, endBalance: 1800, isProjected: false },
      { year: 2025, actualGain: 50, endBalance: 1050, isProjected: false },
      { year: 2024, actualGain: 200, endBalance: 1200, isProjected: false },
    ],
  });

  assert.equal(model.latestActualIndex, 4);
  assert.equal(model.points[4].year, 2028);
  assert.equal(model.points[4].actualValue, 1800);
  assert.equal(model.points[7].actualValue, null, 'the clock year does not create an actual point');
  assert.equal(model.points[8].actualValue, null, 'future recorded data is excluded');
});

test('requires an explicitly nonprojected record and finite recorded values', () => {
  const model = buildCompoundPathModel({
    ...plan,
    currentYear: 2034,
    yearRows: [
      { year: 2025, actualGain: 200, endBalance: 1200, isProjected: true },
      { year: 2026, actualGain: 200, endBalance: 1200 },
      { year: 2027, actualGain: Infinity, endBalance: 1200, isProjected: false },
      { year: 2028, actualGain: 200, endBalance: NaN, isProjected: false },
      { year: 2029, endBalance: 1200, isProjected: false },
      { year: 2030, actualGain: 200, isProjected: false },
    ],
  });

  assert.ok(model.points.every((point) => point.actualValue === null));
  assert.equal(model.latestActualIndex, null);
});

test('rejects missing or invalid numeric inputs without treating them as zero', () => {
  assert.deepEqual(buildCompoundPathModel(), empty);
  for (const key of ['startCapital', 'startYear', 'totalYears', 'targetAnnualRate', 'currentYear']) {
    for (const value of [undefined, null, '', ' ', NaN, Infinity, 'invalid', false, [], {}]) {
      assert.deepEqual(buildCompoundPathModel({ ...plan, [key]: value }), empty, `${key}: ${String(value)}`);
    }
  }
  assert.deepEqual(buildCompoundPathModel({ ...plan, startYear: 2025.5 }), empty);
  assert.deepEqual(buildCompoundPathModel({ ...plan, currentYear: 2026.5 }), empty);
});

test('accepts explicit zero principal and zero rate without inventing actual balances', () => {
  const model = buildCompoundPathModel({ ...plan, startCapital: 0, targetAnnualRate: 0, totalYears: 1 });

  assert.deepEqual(model.simulationRows, [{ index: 1, year: 2025, annualGain: 0, endBalance: 0 }]);
  assert.deepEqual(model.points.map((point) => point.actualValue), [null, null]);
  assert.equal(model.latestActualIndex, null);
});

test('supports small and large balances, negative balances, and negative growth', () => {
  const small = buildCompoundPathModel({ ...plan, startCapital: 0.2, totalYears: 3 });
  assert.deepEqual(small.points.map((point) => point.plannedValue), [0.2, 0, 0, 0]);

  const large = buildCompoundPathModel({ ...plan, startCapital: 1e14, totalYears: 2 });
  assert.deepEqual(large.points.map((point) => point.plannedValue), [1e14, 1.2e14, 1.44e14]);

  const negative = buildCompoundPathModel({
    ...plan,
    startCapital: -100,
    targetAnnualRate: 0.1,
    totalYears: 2,
    yearRows: [{ year: 2025, actualGain: -20, endBalance: -120, isProjected: false }],
  });
  assert.deepEqual(negative.points.map((point) => point.plannedValue), [-100, -110, -121]);
  assert.equal(negative.points[1].actualValue, -120);

  const declining = buildCompoundPathModel({ ...plan, targetAnnualRate: -0.25, totalYears: 3 });
  assert.deepEqual(declining.simulationRows, [
    { index: 1, year: 2025, annualGain: -250, endBalance: 750 },
    { index: 2, year: 2026, annualGain: -187, endBalance: 563 },
    { index: 3, year: 2027, annualGain: -141, endBalance: 422 },
  ]);
});

test('rejects unsupported horizons and overflow instead of displaying a different plan', () => {
  for (const totalYears of [0, -2, 2.9, 101, 1e9]) {
    assert.deepEqual(buildCompoundPathModel({ ...plan, totalYears }), empty);
  }
  assert.equal(buildCompoundPathModel({ ...plan, totalYears: 100, targetAnnualRate: 0 }).simulationRows.length, 100);
  assert.deepEqual(buildCompoundPathModel({ ...plan, startCapital: Number.MAX_VALUE }), empty);
  assert.deepEqual(buildCompoundPathModel({ ...plan, startYear: Number.MAX_SAFE_INTEGER }), empty);
});

test('normalizes numeric strings without mutating the supplied plan or annual records', () => {
  const record = Object.freeze({ year: '2025', actualGain: '0', endBalance: '1200.5', isProjected: false });
  const input = Object.freeze({
    startCapital: '1000', startYear: '2025', totalYears: '1', targetAnnualRate: '0.2',
    currentYear: '2026', yearRows: Object.freeze([record]),
  });
  const model = buildCompoundPathModel(input);

  assert.deepEqual(model.points[1], { index: 1, year: 2025, kind: 'year', plannedValue: 1200, actualValue: 1200.5 });
  assert.equal(model.latestActualIndex, 1);
  assert.equal(record.endBalance, '1200.5');
  assert.equal(input.totalYears, '1');
});
