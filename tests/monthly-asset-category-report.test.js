import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMonthlyAssetAccountReport,
  buildMonthlyAssetCategoryReport,
} from '../src/lib/monthlyAssetCategoryReport.js';

function snapshot(accountId, month, balance, suffix = '') {
  return { id: `${accountId}-${month}${suffix}`, accountId, month, balance };
}

test('monthly account report keeps owner groups and sorts signed gains within each owner', () => {
  const accounts = [
    { id: 'me-bank', owner: '我', name: '招商银行', type: '银行', currency: 'CNY', sortOrder: 0 },
    { id: 'me-ibkr', owner: '我', name: 'IBKR', type: '证券', currency: 'USD', sortOrder: 1 },
    { id: 'wife-ibkr', owner: '老婆', name: 'IBKR', type: '证券', currency: 'USD', sortOrder: 0 },
    { id: 'wife-hkd', owner: '老婆', name: '招商永隆', type: '银行', currency: 'HKD', sortOrder: 1 },
  ];
  const snapshots = [
    snapshot('me-bank', '2026-07', 100), snapshot('me-bank', '2026-08', 130),
    snapshot('me-ibkr', '2026-07', 100), snapshot('me-ibkr', '2026-08', 120),
    snapshot('wife-ibkr', '2026-07', 200), snapshot('wife-ibkr', '2026-08', 190),
    snapshot('wife-hkd', '2026-07', 100), snapshot('wife-hkd', '2026-08', 110),
  ];
  const toCNY = (balance, currency) => {
    if (currency === 'USD') return balance * 7;
    if (currency === 'HKD') return balance * 0.8;
    return balance;
  };

  const report = buildMonthlyAssetAccountReport({ accounts, snapshots, month: '2026-08', toCNY });

  assert.equal(report.previousMonth, '2026-07');
  assert.deepEqual(report.ownerGroups.map(group => group.owner), ['我', '老婆']);
  assert.deepEqual(report.ownerGroups[0].accounts.map(row => row.accountId), ['me-ibkr', 'me-bank']);
  assert.deepEqual(report.ownerGroups[0].accounts.map(row => row.changeAmount), [140, 30]);
  assert.deepEqual(report.ownerGroups[1].accounts.map(row => row.accountId), ['wife-hkd', 'wife-ibkr']);
  assert.deepEqual(report.ownerGroups[1].accounts.map(row => row.changeAmount), [8, -70]);
  assert.equal(report.currentTotal, 2388);
  assert.equal(report.previousTotal, 2280);
  assert.equal(report.netChange, 108);
  assert.equal(report.netChangePct, (108 / 2280) * 100);
  assert.equal(report.increaseTotal, 178);
  assert.equal(report.decreaseTotal, -70);
  assert.equal(report.maxGainAccount.accountId, 'me-ibkr');
  assert.equal(report.maxAbsChange, 140);
  assert.equal(report.isComplete, true);
});

test('missing snapshots are zero: new and zeroed accounts remain comparable while double-zero accounts stay hidden', () => {
  const accounts = [
    { id: 'new', owner: '我', name: '新账户', type: '证券', currency: 'CNY', sortOrder: 0 },
    { id: 'normal', owner: '我', name: '普通账户', type: '银行', currency: 'CNY', sortOrder: 1 },
    { id: 'zeroed', owner: '我', name: '归零账户', type: '证券', currency: 'CNY', sortOrder: 2 },
    { id: 'explicit-zero', owner: '老婆', name: '零账户', type: '现金', currency: 'CNY', sortOrder: 0 },
    { id: 'absent', owner: '老婆', name: '空账户', type: '现金', currency: 'CNY', sortOrder: 1 },
  ];
  const snapshots = [
    snapshot('new', '2026-08', 50),
    snapshot('normal', '2026-07', 100), snapshot('normal', '2026-08', 120),
    snapshot('zeroed', '2026-07', 200),
    snapshot('explicit-zero', '2026-07', 0), snapshot('explicit-zero', '2026-08', 0),
  ];

  const report = buildMonthlyAssetAccountReport({ accounts, snapshots, month: '2026-08' });
  const rows = report.ownerGroups[0].accounts;

  assert.deepEqual(report.ownerGroups.map(group => group.owner), ['我']);
  assert.deepEqual(rows.map(row => row.accountId), ['new', 'normal', 'zeroed']);
  assert.equal(rows[0].status, 'new');
  assert.equal(rows[0].previousBalance, 0);
  assert.equal(rows[0].changeAmount, 50);
  assert.equal(rows[0].changePct, null);
  assert.equal(rows[2].status, 'zeroed');
  assert.equal(rows[2].currentBalance, 0);
  assert.equal(rows[2].changeAmount, -200);
  assert.equal(rows[2].changePct, -100);
  assert.equal(report.currentTotal, 170);
  assert.equal(report.previousTotal, 300);
  assert.equal(report.netChange, -130);
  assert.equal(report.increaseTotal, 70);
  assert.equal(report.decreaseTotal, -200);
  assert.equal(report.accountCount, 3);
  assert.equal(report.incompleteAccountCount, 0);
  assert.equal(report.isComplete, true);
});

test('uses the exact previous calendar month and keeps unknown owners after the standard owner groups', () => {
  const accounts = [
    { id: 'other', owner: '家庭', name: '家庭账户', type: '其他', currency: 'CNY' },
    { id: 'wife', owner: '老婆', name: '老婆账户', type: '银行', currency: 'CNY' },
    { id: 'me', owner: '我', name: '我的账户', type: '银行', currency: 'CNY' },
  ];
  const snapshots = accounts.flatMap(account => [
    snapshot(account.id, '2025-11', 10),
    snapshot(account.id, '2025-12', 80),
    snapshot(account.id, '2026-01', 100),
  ]);

  const report = buildMonthlyAssetAccountReport({ accounts, snapshots, month: '2026-01' });

  assert.equal(report.previousMonth, '2025-12');
  assert.deepEqual(report.ownerGroups.map(group => group.owner), ['我', '老婆', '家庭']);
  assert.deepEqual(report.accounts.map(row => row.previousBalance), [80, 80, 80]);
  assert.deepEqual(report.accounts.map(row => row.changeAmount), [20, 20, 20]);
});

test('malformed and duplicate exact-month rows fail closed without hiding valid accounts', () => {
  const accounts = [
    { id: 'valid', owner: '我', name: '正常', type: '银行', currency: 'CNY', sortOrder: 2 },
    { id: 'duplicate', owner: '我', name: '重复', type: '证券', currency: 'CNY', sortOrder: 0 },
    { id: 'negative', owner: '我', name: '负数', type: '现金', currency: 'CNY', sortOrder: 1 },
  ];
  const snapshots = [
    snapshot('valid', '2026-07', 10), snapshot('valid', '2026-08', 20),
    snapshot('duplicate', '2026-07', 100, '-a'), snapshot('duplicate', '2026-07', 105, '-b'),
    snapshot('duplicate', '2026-08', 110),
    snapshot('negative', '2026-07', 30), snapshot('negative', '2026-08', -2),
  ];

  const report = buildMonthlyAssetAccountReport({ accounts, snapshots, month: '2026-08' });
  const rows = report.ownerGroups[0].accounts;

  assert.deepEqual(rows.map(row => row.accountId), ['valid', 'duplicate', 'negative']);
  assert.equal(rows[0].status, 'up');
  assert.equal(rows[1].status, 'invalid');
  assert.equal(rows[1].issue, 'duplicate_snapshot');
  assert.equal(rows[2].status, 'invalid');
  assert.equal(rows[2].issue, 'invalid_balance');
  assert.equal(report.accountCount, 3);
  assert.equal(report.comparableAccountCount, 1);
  assert.equal(report.invalidAccountCount, 2);
  assert.equal(report.isComplete, false);
  assert.equal(report.netChange, null);
  assert.equal(report.increaseTotal, null);
  assert.equal(report.decreaseTotal, null);
});

test('invalid conversion fails closed and the compatibility export uses account semantics', () => {
  const accounts = [
    { id: 'usd', owner: '我', name: '美元账户', type: '证券', currency: 'USD' },
  ];
  const snapshots = [snapshot('usd', '2026-07', 10), snapshot('usd', '2026-08', 20)];
  const toCNY = () => Number.NaN;

  const report = buildMonthlyAssetCategoryReport({ accounts, snapshots, month: '2026-08', toCNY });

  assert.equal(report.ownerGroups[0].accounts[0].status, 'invalid');
  assert.equal(report.ownerGroups[0].accounts[0].issue, 'invalid_conversion');
  assert.equal(report.categories, undefined);
  assert.equal(report.isComplete, false);
});

test('invalid month returns an empty account report without mutating inputs', () => {
  const accounts = [{ id: 'bank', owner: '我', name: '银行', type: '银行', currency: 'CNY' }];
  const snapshots = [snapshot('bank', '2026-08', 100)];
  const originalAccounts = structuredClone(accounts);
  const originalSnapshots = structuredClone(snapshots);

  const report = buildMonthlyAssetAccountReport({ accounts, snapshots, month: '2026-13' });

  assert.equal(report.previousMonth, '');
  assert.deepEqual(report.ownerGroups, []);
  assert.deepEqual(report.accounts, []);
  assert.equal(report.netChange, null);
  assert.deepEqual(accounts, originalAccounts);
  assert.deepEqual(snapshots, originalSnapshots);
});
