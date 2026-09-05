import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMonthlyAssetCategoryReport } from '../src/lib/monthlyAssetCategoryReport.js';

function snapshot(accountId, month, balance, suffix = '') {
  return { id: `${accountId}-${month}${suffix}`, accountId, month, balance };
}

test('monthly category report aggregates currencies and sorts by signed gain descending', () => {
  const accounts = [
    { id: 'bank-cny', owner: '我', type: '银行', currency: 'CNY' },
    { id: 'bank-hkd', owner: '老婆', type: '银行', currency: 'HKD' },
    { id: 'broker-usd', owner: '我', type: '证券', currency: 'USD' },
    { id: 'cash', owner: '我', type: '现金', currency: 'CNY' },
    { id: 'wechat', owner: '老婆', type: '微信', currency: 'CNY' },
  ];
  const snapshots = [
    snapshot('bank-cny', '2026-07', 100), snapshot('bank-cny', '2026-08', 130),
    snapshot('bank-hkd', '2026-07', 100), snapshot('bank-hkd', '2026-08', 110),
    snapshot('broker-usd', '2026-07', 100), snapshot('broker-usd', '2026-08', 120),
    snapshot('cash', '2026-07', 100), snapshot('cash', '2026-08', 100),
    snapshot('wechat', '2026-07', 100), snapshot('wechat', '2026-08', 90),
  ];
  const conversions = [];
  const toCNY = (balance, currency) => {
    conversions.push({ balance, currency });
    if (currency === 'USD') return balance * 7;
    if (currency === 'HKD') return balance * 0.8;
    return balance;
  };

  const report = buildMonthlyAssetCategoryReport({ accounts, snapshots, month: '2026-08', toCNY });

  assert.equal(report.previousMonth, '2026-07');
  assert.deepEqual(report.categories.map(row => row.category), ['证券', '银行', '现金', '微信']);
  assert.deepEqual(report.categories.map(row => row.changeAmount), [140, 38, 0, -10]);
  assert.equal(report.categories[1].previousBalance, 180);
  assert.equal(report.categories[1].currentBalance, 218);
  assert.equal(report.categories[1].changePct, (38 / 180) * 100);
  assert.equal(report.currentTotal, 1248);
  assert.equal(report.previousTotal, 1080);
  assert.equal(report.netChange, 168);
  assert.equal(report.netChangePct, (168 / 1080) * 100);
  assert.equal(report.increaseTotal, 178);
  assert.equal(report.decreaseTotal, -10);
  assert.equal(report.maxGainCategory.category, '证券');
  assert.equal(report.maxAbsChange, 140);
  assert.equal(report.isComplete, true);
  assert.equal(conversions.length, 10);
  assert.deepEqual(new Set(conversions.map(row => row.currency)), new Set(['CNY', 'HKD', 'USD']));
});

test('one-sided snapshots make the whole category incomparable without manufacturing zero', () => {
  const accounts = [
    { id: 'bank-complete', type: '银行', currency: 'CNY' },
    { id: 'bank-current-only', type: '银行', currency: 'CNY' },
    { id: 'broker', type: '证券', currency: 'CNY' },
    { id: 'unused-new-account', type: '证券', currency: 'CNY' },
  ];
  const snapshots = [
    snapshot('bank-complete', '2026-07', 100),
    snapshot('bank-complete', '2026-08', 120),
    snapshot('bank-current-only', '2026-08', 50),
    snapshot('broker', '2026-07', 200),
    snapshot('broker', '2026-08', 180),
  ];

  const report = buildMonthlyAssetCategoryReport({ accounts, snapshots, month: '2026-08' });

  assert.deepEqual(report.categories.map(row => row.category), ['证券', '银行']);
  assert.equal(report.categories[0].changeAmount, -20);
  assert.equal(report.categories[1].isComparable, false);
  assert.equal(report.categories[1].changeAmount, null);
  assert.equal(report.categories[1].changePct, null);
  assert.equal(report.categories[1].currentBalance, 170);
  assert.equal(report.categories[1].previousBalance, 100);
  assert.equal(report.accountCount, 3);
  assert.equal(report.comparableAccountCount, 2);
  assert.equal(report.incompleteAccountCount, 1);
  assert.equal(report.isComplete, false);
  assert.equal(report.netChange, null);
  assert.equal(report.netChangePct, null);
  assert.equal(report.increaseTotal, null);
  assert.equal(report.decreaseTotal, null);
});

test('report uses the exact previous calendar month and maps unknown types to other', () => {
  const accounts = [{ id: 'legacy', type: '未分类', currency: 'CNY' }];
  const snapshots = [
    snapshot('legacy', '2025-11', 10),
    snapshot('legacy', '2025-12', 80),
    snapshot('legacy', '2026-01', 100),
  ];

  const report = buildMonthlyAssetCategoryReport({ accounts, snapshots, month: '2026-01' });

  assert.equal(report.previousMonth, '2025-12');
  assert.equal(report.categories.length, 1);
  assert.equal(report.categories[0].category, '其他');
  assert.equal(report.categories[0].previousBalance, 80);
  assert.equal(report.categories[0].changeAmount, 20);
});

test('zero rows are absent while fully conflicted duplicate snapshots fail closed', () => {
  const accounts = [
    { id: 'zero-only', type: '银行', currency: 'CNY' },
    { id: 'duplicate', type: '证券', currency: 'CNY' },
  ];
  const snapshots = [
    snapshot('zero-only', '2026-07', 0),
    snapshot('zero-only', '2026-08', 0),
    snapshot('duplicate', '2026-07', 100, '-a'),
    snapshot('duplicate', '2026-07', 105, '-b'),
    snapshot('duplicate', '2026-08', 110, '-a'),
    snapshot('duplicate', '2026-08', 115, '-b'),
  ];

  const report = buildMonthlyAssetCategoryReport({ accounts, snapshots, month: '2026-08' });

  assert.deepEqual(report.categories.map(row => row.category), ['证券']);
  assert.equal(report.categories[0].isComparable, false);
  assert.equal(report.categories[0].changeAmount, null);
  assert.equal(report.accountCount, 1);
  assert.equal(report.incompleteAccountCount, 1);
});

test('invalid month returns an empty report without mutating inputs', () => {
  const accounts = [{ id: 'bank', type: '银行', currency: 'CNY' }];
  const snapshots = [snapshot('bank', '2026-08', 100)];
  const originalAccounts = structuredClone(accounts);
  const originalSnapshots = structuredClone(snapshots);

  const report = buildMonthlyAssetCategoryReport({ accounts, snapshots, month: '2026-13' });

  assert.equal(report.previousMonth, '');
  assert.deepEqual(report.categories, []);
  assert.equal(report.netChange, null);
  assert.deepEqual(accounts, originalAccounts);
  assert.deepEqual(snapshots, originalSnapshots);
});
