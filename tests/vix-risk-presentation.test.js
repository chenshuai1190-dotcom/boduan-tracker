import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVixHistoricalRiskLevels } from '../src/lib/vixRiskPresentation.js';
import { buildVixRiskModel } from '../src/lib/vixRiskModel.js';

const row = (date, vix, vix3m) => ({ date, vix, vix3m, ratio: vix / vix3m });

test('historical color levels agree with the production model at each daily cutoff', () => {
  const rows = [row('2025-05-01', 15, 18), row('2025-05-02', 30, 28), row('2025-05-05', 34, 35), row('2025-05-06', 26, 25)];
  const levels = buildVixHistoricalRiskLevels(rows);
  for (const current of rows) {
    const model = buildVixRiskModel({ termStructure: { source: 'CBOE', asOfDate: current.date, rows }, expectedAsOfDate: current.date });
    assert.equal(levels.get(current.date), model.currentRiskLevel);
  }
  assert.equal(levels.get('2025-05-02'), 'EXTREME_STRESS');
  assert.equal(levels.get('2025-05-05'), 'ELEVATED', 'VIX above 30 without inversion is not extreme');
});

test('historical colors use raw quotients and reject missing, duplicate, or inconsistent pairs', () => {
  const rows = [row('2025-05-01', 30, 30.00001),
    { ...row('2025-05-02', 31, 28), vix3m: null },
    row('2025-05-05', 32, 30), row('2025-05-05', 32, 30),
    { ...row('2025-05-06', 34, 30), ratio: 1.9 },
    row('2025-05-10', 40, 30), row('invalid', 40, 30)];
  rows[0].ratio = 1; // a rounded value must not turn the actual quotient into inversion
  const levels = buildVixHistoricalRiskLevels(rows);
  assert.equal(levels.get('2025-05-01'), 'ELEVATED');
  for (const date of ['2025-05-02', '2025-05-05', '2025-05-06']) assert.equal(levels.get(date), 'UNKNOWN');
  assert.equal(levels.has('2025-05-07'), false, 'a missing date has no inferred risk');
  assert.equal(levels.has('2025-05-10'), false, 'non-session observations cannot supply chart colors');
  assert.equal(levels.has('invalid'), false);
});

test('future observations never affect historical colors or the cutoff map', () => {
  const rows = [row('2025-05-01', 20, 23), row('2025-05-02', 26, 25)];
  const baseline = structuredClone(rows);
  const options = { throughDate: '2025-05-02' };
  assert.deepEqual(buildVixHistoricalRiskLevels([...rows, row('2025-05-05', 60, 35)], options), buildVixHistoricalRiskLevels(rows, options));
  assert.deepEqual(rows, baseline);
});
