import { shiftMonthKey } from './calendarMonth.js';

export const DEFAULT_ASSET_CATEGORY_ORDER = Object.freeze([
  '银行',
  '证券',
  '支付宝',
  '微信',
  '定期',
  '现金',
  '公积金',
  '其他',
]);

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function emptyReport(month, previousMonth = '') {
  return {
    month,
    previousMonth,
    categories: [],
    currentTotal: null,
    previousTotal: null,
    comparableCurrentTotal: null,
    comparablePreviousTotal: null,
    netChange: null,
    netChangePct: null,
    increaseTotal: null,
    decreaseTotal: null,
    maxGainCategory: null,
    maxAbsChange: 0,
    accountCount: 0,
    comparableAccountCount: 0,
    incompleteAccountCount: 0,
    isComplete: false,
  };
}

/**
 * Builds a display-only month-over-month category report from exact account
 * snapshots. A category is comparable only when every account observed in
 * either exact month has a positive snapshot in both months. Accounts absent
 * from both months are ignored; one-sided gaps are never interpreted as zero or
 * bridged from an older month.
 */
export function buildMonthlyAssetCategoryReport({
  accounts = [],
  snapshots = [],
  month = '',
  toCNY = value => Number(value),
  categoryOrder = DEFAULT_ASSET_CATEGORY_ORDER,
} = {}) {
  const previousMonth = shiftMonthKey(month, -1);
  if (!previousMonth) return emptyReport(month);

  const normalizedAccounts = Array.isArray(accounts)
    ? accounts.filter(account => account?.id)
    : [];
  const normalizedOrder = Array.isArray(categoryOrder) && categoryOrder.length > 0
    ? [...new Set(categoryOrder.filter(Boolean))]
    : [...DEFAULT_ASSET_CATEGORY_ORDER];
  if (!normalizedOrder.includes('其他')) normalizedOrder.push('其他');
  const categorySet = new Set(normalizedOrder);
  const categoryIndex = new Map(normalizedOrder.map((category, index) => [category, index]));

  const snapshotsByKey = new Map();
  (Array.isArray(snapshots) ? snapshots : []).forEach((snapshot) => {
    if (!snapshot?.accountId || !snapshot?.month) return;
    const key = `${snapshot.accountId}::${snapshot.month}`;
    if (!snapshotsByKey.has(key)) snapshotsByKey.set(key, []);
    snapshotsByKey.get(key).push(snapshot.balance);
  });

  const groups = new Map(normalizedOrder.map(category => [category, {
    category,
    accountCount: 0,
    comparableAccountCount: 0,
    currentRecordedCount: 0,
    previousRecordedCount: 0,
    currentKnownTotal: 0,
    previousKnownTotal: 0,
  }]));

  const snapshotState = (account, targetMonth) => {
    const rawRows = snapshotsByKey.get(`${account.id}::${targetMonth}`) || [];
    const nonZeroRows = rawRows.filter(balance => Number(balance) !== 0);
    const positiveRows = nonZeroRows.map(finitePositive).filter(value => value !== null);
    if (nonZeroRows.length === 0) return { observed: false, value: null };
    if (nonZeroRows.length !== 1 || positiveRows.length !== 1) return { observed: true, value: null };
    const rawBalance = positiveRows[0];
    const converted = Number(toCNY(rawBalance, account.currency));
    return {
      observed: true,
      value: Number.isFinite(converted) && converted > 0 ? converted : null,
    };
  };

  normalizedAccounts.forEach((account) => {
    const category = categorySet.has(account.type) ? account.type : '其他';
    const group = groups.get(category);
    const current = snapshotState(account, month);
    const previous = snapshotState(account, previousMonth);
    if (!current.observed && !previous.observed) return;

    group.accountCount += 1;
    if (current.value !== null) {
      group.currentRecordedCount += 1;
      group.currentKnownTotal += current.value;
    }
    if (previous.value !== null) {
      group.previousRecordedCount += 1;
      group.previousKnownTotal += previous.value;
    }
    if (current.value !== null && previous.value !== null) {
      group.comparableAccountCount += 1;
    }
  });

  const categories = normalizedOrder
    .map((category) => {
      const group = groups.get(category);
      const hasAnySnapshot = group.accountCount > 0;
      const isComparable = group.accountCount > 0
        && group.comparableAccountCount === group.accountCount;
      const currentBalance = group.currentRecordedCount > 0 ? group.currentKnownTotal : null;
      const previousBalance = group.previousRecordedCount > 0 ? group.previousKnownTotal : null;
      const changeAmount = isComparable ? currentBalance - previousBalance : null;
      const changePct = isComparable && previousBalance > 0
        ? (changeAmount / previousBalance) * 100
        : null;

      return {
        category,
        accountCount: group.accountCount,
        comparableAccountCount: group.comparableAccountCount,
        missingAccountCount: group.accountCount - group.comparableAccountCount,
        currentBalance,
        previousBalance,
        changeAmount,
        changePct,
        isComparable,
        hasAnySnapshot,
        trend: !isComparable
          ? 'incomplete'
          : changeAmount > 0
            ? 'up'
            : changeAmount < 0
              ? 'down'
              : 'flat',
      };
    })
    .filter(category => category.hasAnySnapshot)
    .sort((left, right) => {
      if (left.isComparable !== right.isComparable) return left.isComparable ? -1 : 1;
      if (left.isComparable && left.changeAmount !== right.changeAmount) {
        return right.changeAmount - left.changeAmount;
      }
      return (categoryIndex.get(left.category) ?? Number.MAX_SAFE_INTEGER)
        - (categoryIndex.get(right.category) ?? Number.MAX_SAFE_INTEGER);
    });

  const completeCategories = categories.filter(category => category.isComparable);
  const comparableAccountCount = categories.reduce(
    (sum, category) => sum + category.comparableAccountCount,
    0,
  );
  const accountCount = categories.reduce((sum, category) => sum + category.accountCount, 0);
  const incompleteAccountCount = accountCount - comparableAccountCount;
  const currentRecordedAccountCount = [...groups.values()].reduce(
    (sum, group) => sum + group.currentRecordedCount,
    0,
  );
  const previousRecordedAccountCount = [...groups.values()].reduce(
    (sum, group) => sum + group.previousRecordedCount,
    0,
  );
  const currentTotalValue = [...groups.values()].reduce(
    (sum, group) => sum + group.currentKnownTotal,
    0,
  );
  const previousTotalValue = [...groups.values()].reduce(
    (sum, group) => sum + group.previousKnownTotal,
    0,
  );
  const comparableCurrentTotal = completeCategories.reduce(
    (sum, category) => sum + category.currentBalance,
    0,
  );
  const comparablePreviousTotal = completeCategories.reduce(
    (sum, category) => sum + category.previousBalance,
    0,
  );
  const isComplete = accountCount > 0 && incompleteAccountCount === 0;
  const netChange = isComplete
    ? currentTotalValue - previousTotalValue
    : null;
  const netChangePct = netChange !== null && previousTotalValue > 0
    ? (netChange / previousTotalValue) * 100
    : null;
  const increaseTotal = isComplete
    ? completeCategories.reduce((sum, category) => sum + Math.max(category.changeAmount, 0), 0)
    : null;
  const decreaseTotal = isComplete
    ? completeCategories.reduce((sum, category) => sum + Math.min(category.changeAmount, 0), 0)
    : null;
  const maxGainCategory = completeCategories.find(category => category.changeAmount > 0) || null;
  const maxAbsChange = completeCategories.reduce(
    (maximum, category) => Math.max(maximum, Math.abs(category.changeAmount)),
    0,
  );

  return {
    month,
    previousMonth,
    categories,
    currentTotal: currentRecordedAccountCount > 0 ? currentTotalValue : null,
    previousTotal: previousRecordedAccountCount > 0 ? previousTotalValue : null,
    comparableCurrentTotal: completeCategories.length > 0 ? comparableCurrentTotal : null,
    comparablePreviousTotal: completeCategories.length > 0 ? comparablePreviousTotal : null,
    netChange,
    netChangePct,
    increaseTotal,
    decreaseTotal,
    maxGainCategory,
    maxAbsChange,
    accountCount,
    comparableAccountCount,
    incompleteAccountCount,
    isComplete,
  };
}
