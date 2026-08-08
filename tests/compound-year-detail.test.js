import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCompoundYearDetailRows } from '../src/lib/compoundYearDetails.js';

test('builds historical and current actual metrics from the carried annual balances', () => {
  const [historical, current] = buildCompoundYearDetailRows([
    {
      year: 2025,
      startBalance: 1000,
      planTarget: 200,
      actualGain: 250,
      endBalance: 1260,
      isProjected: false,
    },
    {
      year: 2026,
      startBalance: 1260,
      planTarget: 252,
      actualGain: 126,
      endBalance: 1386,
      isProjected: false,
    },
  ], { currentYear: 2026 });

  assert.equal(historical.actualGrowthPct, 25);
  assert.equal(historical.completionPct, 125);
  assert.equal(historical.actualEndBalance, 1260, 'the entered end balance remains the annual carry value');
  assert.equal(historical.targetEndBalance, 1200);
  assert.equal(historical.status, 'reached');
  assert.equal(historical.assetLabel, 'actualEnd');

  assert.equal(current.actualGrowthPct, 10);
  assert.equal(current.completionPct, 50);
  assert.equal(current.actualEndBalance, 1386);
  assert.equal(current.status, 'behind');
  assert.equal(current.assetLabel, 'current');
});

test('fails closed for projected rows instead of presenting predictions as actual data', () => {
  const [future, historicalMissing] = buildCompoundYearDetailRows([
    {
      year: 2027,
      startBalance: 1386,
      planTarget: 277,
      actualGain: null,
      endBalance: 1663,
      isProjected: true,
    },
    {
      year: 2024,
      startBalance: 800,
      planTarget: 160,
      actualGain: null,
      endBalance: 960,
      isProjected: true,
    },
  ], { currentYear: 2026 });

  assert.equal(future.hasActual, false);
  assert.equal(future.actualGrowthPct, null);
  assert.equal(future.completionPct, null);
  assert.equal(future.actualEndBalance, null);
  assert.equal(future.status, 'notStarted');
  assert.equal(future.assetLabel, 'plannedEnd');

  assert.equal(historicalMissing.status, 'pending');
  assert.equal(historicalMissing.actualEndBalance, null);
});

test('preserves an explicit zero actual and fails closed when percentage denominators are unavailable', () => {
  const [zeroActual, zeroStart] = buildCompoundYearDetailRows([
    {
      year: 2026,
      startBalance: 1000,
      planTarget: 200,
      actualGain: 0,
      endBalance: 1000,
      isProjected: false,
    },
    {
      year: 2025,
      startBalance: 0,
      planTarget: 0,
      actualGain: 100,
      endBalance: 100,
      isProjected: false,
    },
  ], { currentYear: 2026 });

  assert.equal(zeroActual.hasActual, true);
  assert.equal(zeroActual.actualGrowthPct, 0);
  assert.equal(zeroActual.completionPct, 0);
  assert.equal(zeroActual.actualEndBalance, 1000);

  assert.equal(zeroStart.actualGrowthPct, null);
  assert.equal(zeroStart.completionPct, null);
});
