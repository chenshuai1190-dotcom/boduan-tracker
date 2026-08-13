import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMonthlyAssetTrend,
  visibleMonthlyAssetTrendSlots,
} from '../src/lib/monthlyAssetTrend.js';

test('aggregate monthly trend keeps the exact current month and adjacent-month comparisons', () => {
  const result = buildMonthlyAssetTrend({
    months: ['2026-04', '2026-05', '2026-06', '2026-07'],
    values: [100, 0, 140, 154],
  });

  assert.equal(result.slots[1].hasData, false);
  assert.equal(result.slots[1].balance, null);
  assert.equal(result.slots[2].hasPreviousMonth, false);
  assert.equal(result.slots[2].changeAmount, null);
  assert.equal(result.slots[2].changePct, null);
  assert.equal(result.slots[3].changeAmount, 14);
  assert.equal(result.slots[3].changePct, 10);
  assert.equal(result.currentSlot.month, '2026-07');
  assert.equal(result.currentSlot.balance, 154);
});

test('aggregate monthly trend does not bridge a missing month in the chart', () => {
  const result = buildMonthlyAssetTrend({
    months: ['2026-04', '2026-05', '2026-06', '2026-07'],
    values: [100, 0, 140, 154],
  });

  assert.deepEqual(result.segments.map(segment => segment.map(point => point.month)), [
    ['2026-04'],
    ['2026-06', '2026-07'],
  ]);
});

test('aggregate monthly trend never substitutes an older month for a missing current month', () => {
  const result = buildMonthlyAssetTrend({
    months: ['2026-04', '2026-05', '2026-06'],
    values: [100, 125, 0],
  });

  assert.equal(result.currentSlot, null);
  assert.equal(result.windowChangeAmount, null);
  assert.equal(result.windowChangePct, null);
  assert.deepEqual(result.maxPoint, { month: '2026-05', balance: 125, index: 1 });
});

test('window asset change requires both exact window endpoints', () => {
  const complete = buildMonthlyAssetTrend({
    months: ['2026-04', '2026-05', '2026-06'],
    values: [100, 125, 150],
  });
  assert.equal(complete.windowChangeAmount, 50);
  assert.equal(complete.windowChangePct, 50);

  const missingStart = buildMonthlyAssetTrend({
    months: ['2026-04', '2026-05', '2026-06'],
    values: [0, 125, 150],
  });
  assert.equal(missingStart.windowChangeAmount, null);
  assert.equal(missingStart.windowChangePct, null);
});

test('monthly detail defaults to the newest six slots and expands to the full window', () => {
  const slots = Array.from({ length: 12 }, (_, index) => ({ month: `month-${index + 1}` }));
  assert.deepEqual(
    visibleMonthlyAssetTrendSlots(slots, false).map(slot => slot.month),
    ['month-12', 'month-11', 'month-10', 'month-9', 'month-8', 'month-7'],
  );
  assert.deepEqual(
    visibleMonthlyAssetTrendSlots(slots, true).map(slot => slot.month),
    [...slots].reverse().map(slot => slot.month),
  );
});
