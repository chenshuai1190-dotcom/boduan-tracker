import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAccountAssetTrend } from '../src/lib/accountAssetTrend.js';

function monthlyRows(accountId, values) {
  return Object.entries(values).map(([month, balance]) => ({ accountId, month, balance }));
}

test('trend isolates the exact account and treats a zero balance as a removed snapshot', () => {
  const result = buildAccountAssetTrend({
    accountId: 'bank-hk-1',
    endMonth: '2026-04',
    monthCount: 4,
    snapshots: [
      ...monthlyRows('bank-hk-1', {
        '2026-01': 100,
        '2026-03': 0,
        '2026-04': 130,
      }),
      ...monthlyRows('bank-hk-2', {
        '2026-01': 900,
        '2026-02': 950,
        '2026-03': 975,
        '2026-04': 990,
      }),
    ],
  });

  assert.deepEqual(result.slots.map(({ month, balance, hasData }) => ({ month, balance, hasData })), [
    { month: '2026-01', balance: 100, hasData: true },
    { month: '2026-02', balance: null, hasData: false },
    { month: '2026-03', balance: null, hasData: false },
    { month: '2026-04', balance: 130, hasData: true },
  ]);
  assert.deepEqual(result.minPoint, { month: '2026-01', balance: 100 });
  assert.deepEqual(result.maxPoint, { month: '2026-04', balance: 130 });
  assert.equal(result.invalidCount, 0);
});

test('month-over-month comparison requires the exact immediately preceding calendar snapshot', () => {
  const result = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-03',
    monthCount: 3,
    snapshots: monthlyRows('bank-1', {
      '2025-12': 80,
      '2026-01': 100,
      '2026-03': 120,
    }),
  });

  assert.equal(result.slots[0].previousMonth, '2025-12');
  assert.equal(result.slots[0].previousBalance, 80);
  assert.equal(result.slots[0].changeAmount, 20);
  assert.equal(result.slots[0].changePct, 25);

  assert.equal(result.slots[2].previousMonth, '2026-02');
  assert.equal(result.slots[2].hasPreviousMonth, false);
  assert.equal(result.slots[2].previousBalance, null);
  assert.equal(result.slots[2].changeAmount, null);
  assert.equal(result.slots[2].changePct, null);
});

test('a zero month is absent and cannot become the previous month for comparison', () => {
  const result = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-03',
    monthCount: 3,
    snapshots: monthlyRows('bank-1', {
      '2026-01': 100,
      '2026-02': 0,
      '2026-03': 120,
    }),
  });

  assert.equal(result.slots[1].hasData, false);
  assert.equal(result.slots[1].balance, null);
  assert.equal(result.slots[2].hasPreviousMonth, false);
  assert.equal(result.slots[2].previousBalance, null);
  assert.equal(result.slots[2].changeAmount, null);
  assert.equal(result.slots[2].changePct, null);
  assert.equal(result.invalidCount, 0);
});

test('window growth starts at the first real snapshot and still requires the exact end snapshot', () => {
  const complete = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-12',
    snapshots: monthlyRows('bank-1', {
      '2026-01': 100,
      '2026-12': 125,
    }),
  });
  assert.deepEqual(complete.startSnapshot, { month: '2026-01', balance: 100 });
  assert.deepEqual(complete.endSnapshot, { month: '2026-12', balance: 125 });
  assert.deepEqual(complete.latest, { month: '2026-12', balance: 125 });
  assert.equal(complete.cumulativeChangeAmount, 25);
  assert.equal(complete.cumulativeGrowthPct, 25);

  const missingStart = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-12',
    snapshots: monthlyRows('bank-1', {
      '2026-02': 100,
      '2026-12': 125,
    }),
  });
  assert.equal(missingStart.startMonth, '2026-01');
  assert.deepEqual(missingStart.startSnapshot, { month: '2026-02', balance: 100 });
  assert.equal(missingStart.cumulativeChangeAmount, 25);
  assert.equal(missingStart.cumulativeGrowthPct, 25);

  const onlyEnd = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-12',
    snapshots: monthlyRows('bank-1', {
      '2026-12': 125,
    }),
  });
  assert.deepEqual(onlyEnd.startSnapshot, { month: '2026-12', balance: 125 });
  assert.equal(onlyEnd.cumulativeChangeAmount, 0);
  assert.equal(onlyEnd.cumulativeGrowthPct, 0);

  const zeroStart = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-12',
    snapshots: monthlyRows('bank-1', {
      '2026-01': 0,
      '2026-12': 125,
    }),
  });
  assert.deepEqual(zeroStart.startSnapshot, { month: '2026-12', balance: 125 });
  assert.deepEqual(zeroStart.minPoint, { month: '2026-12', balance: 125 });
  assert.equal(zeroStart.cumulativeChangeAmount, 0);
  assert.equal(zeroStart.cumulativeGrowthPct, 0);

  const missingEnd = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-12',
    snapshots: monthlyRows('bank-1', {
      '2026-02': 100,
      '2026-11': 125,
    }),
  });
  assert.deepEqual(missingEnd.startSnapshot, { month: '2026-02', balance: 100 });
  assert.equal(missingEnd.endSnapshot, null);
  assert.equal(missingEnd.cumulativeChangeAmount, null);
  assert.equal(missingEnd.cumulativeGrowthPct, null);
});

test('deleted leading snapshots restart growth and extrema at the first remaining balance', () => {
  const result = buildAccountAssetTrend({
    accountId: 'cmb-cny',
    endMonth: '2026-07',
    monthCount: 12,
    snapshots: monthlyRows('cmb-cny', {
      '2025-08': 0,
      '2025-09': 0,
      '2025-10': 0,
      '2025-11': 0,
      '2025-12': 0,
      '2026-01': 0,
      '2026-02': 0,
      '2026-03': 0,
      '2026-04': 490000,
      '2026-07': 80001,
    }),
  });

  assert.deepEqual(result.startSnapshot, { month: '2026-04', balance: 490000 });
  assert.deepEqual(result.endSnapshot, { month: '2026-07', balance: 80001 });
  assert.deepEqual(result.minPoint, { month: '2026-07', balance: 80001 });
  assert.deepEqual(result.maxPoint, { month: '2026-04', balance: 490000 });
  assert.equal(result.cumulativeChangeAmount, -409999);
  assert.ok(Math.abs(result.cumulativeGrowthPct - (-409999 / 490000) * 100) < 1e-10);
  assert.equal(result.invalidCount, 0);
});

test('all-zero history is indistinguishable from no account snapshot history', () => {
  const result = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-07',
    monthCount: 3,
    snapshots: monthlyRows('bank-1', {
      '2026-05': 0,
      '2026-06': 0,
      '2026-07': 0,
    }),
  });

  assert.equal(result.startSnapshot, null);
  assert.equal(result.endSnapshot, null);
  assert.equal(result.latest, null);
  assert.equal(result.minPoint, null);
  assert.equal(result.maxPoint, null);
  assert.equal(result.cumulativeChangeAmount, null);
  assert.equal(result.cumulativeGrowthPct, null);
});

test('legacy zero rows are ignored when a positive duplicate exists in either order', () => {
  for (const snapshots of [
    monthlyRows('bank-1', { '2026-07': 0 }).concat(monthlyRows('bank-1', { '2026-07': 125 })),
    monthlyRows('bank-1', { '2026-07': 125 }).concat(monthlyRows('bank-1', { '2026-07': 0 })),
  ]) {
    const result = buildAccountAssetTrend({
      accountId: 'bank-1',
      endMonth: '2026-07',
      monthCount: 1,
      snapshots,
    });
    assert.deepEqual(result.startSnapshot, { month: '2026-07', balance: 125 });
    assert.deepEqual(result.endSnapshot, { month: '2026-07', balance: 125 });
    assert.equal(result.invalidCount, 0);
  }
});

test('latest is tied to the exact end month and does not fall back to an older snapshot', () => {
  const result = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-04',
    monthCount: 4,
    snapshots: monthlyRows('bank-1', {
      '2026-01': 100,
      '2026-03': 120,
    }),
  });

  assert.equal(result.endSnapshot, null);
  assert.equal(result.latest, null);
  assert.equal(result.slots.at(-1).month, '2026-04');
  assert.equal(result.slots.at(-1).hasData, false);
  assert.equal(result.slots.at(-1).balance, null);
});

test('malformed rows are ignored, conflicting duplicates are unavailable, and inputs are not mutated', () => {
  const snapshots = [
    { accountId: 'bank-1', month: '2026-01', balance: 100 },
    { accountId: 'bank-1', month: '2026-01', balance: 100 },
    { accountId: 'bank-1', month: '2026-02', balance: 110 },
    { accountId: 'bank-1', month: '2026-02', balance: 111 },
    { accountId: 'bank-1', month: '2026-03', balance: '120' },
    { accountId: 'bank-1', month: '2026-13', balance: 130 },
    { accountId: 'bank-1', month: '2025-12', balance: -1 },
    { accountId: 'other-account', month: 'bad-month', balance: 'bad-balance' },
  ];
  const original = structuredClone(snapshots);

  const result = buildAccountAssetTrend({
    accountId: 'bank-1',
    endMonth: '2026-03',
    monthCount: 3,
    snapshots,
  });

  assert.deepEqual(snapshots, original);
  assert.equal(result.slots[0].balance, 100);
  assert.equal(result.slots[1].balance, null);
  assert.equal(result.slots[2].balance, null);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.invalidCount, 3);
  assert.equal(result.hasConflict, true);
});
