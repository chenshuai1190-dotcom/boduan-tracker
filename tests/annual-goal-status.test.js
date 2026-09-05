import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAnnualGoalStatus } from '../src/lib/annualGoalStatus.js';

test('annual goal status distinguishes behind, reached, and exceeded at display precision', () => {
  assert.equal(resolveAnnualGoalStatus(99.99, 100), 'behind');
  assert.equal(resolveAnnualGoalStatus(100, 100), 'reached');
  assert.equal(resolveAnnualGoalStatus(100.01, 100), 'exceeded');
  assert.equal(resolveAnnualGoalStatus(100.00000000001, 100), 'reached');
});

test('annual goal status stays unavailable until both amounts are valid', () => {
  assert.equal(resolveAnnualGoalStatus(null, 100), null);
  assert.equal(resolveAnnualGoalStatus(100, undefined), null);
  assert.equal(resolveAnnualGoalStatus('invalid', 100), null);
});
