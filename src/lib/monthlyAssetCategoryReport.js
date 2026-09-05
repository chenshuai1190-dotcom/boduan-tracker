import { shiftMonthKey } from './calendarMonth.js';

export const DEFAULT_ASSET_OWNER_ORDER = Object.freeze(['我', '老婆']);

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function emptyReport(month, previousMonth = '') {
  return {
    month,
    previousMonth,
    ownerGroups: [],
    accounts: [],
    currentTotal: null,
    previousTotal: null,
    netChange: null,
    netChangePct: null,
    increaseTotal: null,
    decreaseTotal: null,
    maxGainAccount: null,
    maxAbsChange: 0,
    accountCount: 0,
    comparableAccountCount: 0,
    incompleteAccountCount: 0,
    invalidAccountCount: 0,
    isComplete: false,
  };
}

function summarizeRows(rows) {
  const currentTotal = rows.reduce(
    (sum, row) => sum + (Number.isFinite(row.currentBalance) ? row.currentBalance : 0),
    0,
  );
  const previousTotal = rows.reduce(
    (sum, row) => sum + (Number.isFinite(row.previousBalance) ? row.previousBalance : 0),
    0,
  );
  const invalidAccountCount = rows.filter(row => !row.isComparable).length;
  const isComplete = rows.length > 0 && invalidAccountCount === 0;
  const netChange = isComplete ? currentTotal - previousTotal : null;
  const netChangePct = isComplete && previousTotal > 0
    ? (netChange / previousTotal) * 100
    : null;
  const increaseTotal = isComplete
    ? rows.reduce((sum, row) => sum + Math.max(row.changeAmount, 0), 0)
    : null;
  const decreaseTotal = isComplete
    ? rows.reduce((sum, row) => sum + Math.min(row.changeAmount, 0), 0)
    : null;

  return {
    currentTotal,
    previousTotal,
    netChange,
    netChangePct,
    increaseTotal,
    decreaseTotal,
    invalidAccountCount,
    isComplete,
  };
}

/**
 * Builds a display-only month-over-month report for each current asset account.
 * A missing or explicit zero snapshot means that account held zero in the exact
 * month, matching the parent asset total. Only malformed or conflicting rows
 * fail closed. Accounts at zero in both exact months are omitted.
 */
export function buildMonthlyAssetAccountReport({
  accounts = [],
  snapshots = [],
  month = '',
  toCNY = value => Number(value),
  ownerOrder = DEFAULT_ASSET_OWNER_ORDER,
} = {}) {
  const previousMonth = shiftMonthKey(month, -1);
  if (!previousMonth) return emptyReport(month);

  const normalizedAccounts = Array.isArray(accounts)
    ? accounts
      .map((account, sourceIndex) => ({ ...account, sourceIndex }))
      .filter(account => account?.id)
    : [];
  const normalizedOwnerOrder = Array.isArray(ownerOrder)
    ? [...new Set(ownerOrder.map(owner => String(owner || '').trim()).filter(Boolean))]
    : [...DEFAULT_ASSET_OWNER_ORDER];

  const snapshotsByKey = new Map();
  (Array.isArray(snapshots) ? snapshots : []).forEach((snapshot) => {
    if (!snapshot?.accountId || !snapshot?.month) return;
    const key = `${snapshot.accountId}::${snapshot.month}`;
    if (!snapshotsByKey.has(key)) snapshotsByKey.set(key, []);
    snapshotsByKey.get(key).push(snapshot);
  });

  const snapshotState = (account, targetMonth) => {
    const rawRows = snapshotsByKey.get(`${account.id}::${targetMonth}`) || [];
    if (rawRows.length === 0) {
      return { observed: false, valid: true, value: 0, issue: null };
    }
    if (rawRows.length !== 1) {
      return { observed: true, valid: false, value: null, issue: 'duplicate_snapshot' };
    }

    const rawBalance = finiteNonNegative(rawRows[0].balance);
    if (rawBalance === null) {
      return { observed: true, valid: false, value: null, issue: 'invalid_balance' };
    }

    try {
      const converted = Number(toCNY(rawBalance, account.currency));
      if (!Number.isFinite(converted) || converted < 0) {
        return { observed: true, valid: false, value: null, issue: 'invalid_conversion' };
      }
      return { observed: true, valid: true, value: converted, issue: null };
    } catch {
      return { observed: true, valid: false, value: null, issue: 'invalid_conversion' };
    }
  };

  const reportRows = normalizedAccounts.flatMap((account) => {
    const owner = String(account.owner || '').trim() || '其他';
    const current = snapshotState(account, month);
    const previous = snapshotState(account, previousMonth);
    if (current.valid && previous.valid && current.value === 0 && previous.value === 0) return [];

    const isComparable = current.valid && previous.valid;
    const changeAmount = isComparable ? current.value - previous.value : null;
    let status = 'invalid';
    let changePct = null;

    if (isComparable) {
      if (previous.value === 0 && current.value > 0) {
        status = 'new';
      } else if (previous.value > 0 && current.value === 0) {
        status = 'zeroed';
        changePct = -100;
      } else if (changeAmount > 0) {
        status = 'up';
        changePct = (changeAmount / previous.value) * 100;
      } else if (changeAmount < 0) {
        status = 'down';
        changePct = (changeAmount / previous.value) * 100;
      } else {
        status = 'flat';
        changePct = previous.value > 0 ? 0 : null;
      }
    }

    const numericSortOrder = Number(account.sortOrder);
    return [{
      accountId: account.id,
      owner,
      name: String(account.name || '').trim() || '未命名账户',
      type: String(account.type || '').trim() || '其他',
      currency: String(account.currency || '').trim() || 'CNY',
      sortOrder: Number.isFinite(numericSortOrder) ? numericSortOrder : account.sourceIndex,
      sourceIndex: account.sourceIndex,
      previousBalance: previous.valid ? previous.value : null,
      currentBalance: current.valid ? current.value : null,
      changeAmount,
      changePct,
      status,
      isComparable,
      issue: current.issue || previous.issue,
    }];
  });

  const compareRows = (left, right) => {
    if (left.isComparable !== right.isComparable) return left.isComparable ? -1 : 1;
    if (left.isComparable && left.changeAmount !== right.changeAmount) {
      return right.changeAmount - left.changeAmount;
    }
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    if (left.sourceIndex !== right.sourceIndex) return left.sourceIndex - right.sourceIndex;
    return String(left.accountId).localeCompare(String(right.accountId));
  };

  const ownerRank = new Map(normalizedOwnerOrder.map((owner, index) => [owner, index]));
  const grouped = new Map();
  reportRows.forEach((row) => {
    if (!grouped.has(row.owner)) grouped.set(row.owner, []);
    grouped.get(row.owner).push(row);
  });

  const ownerGroups = [...grouped.entries()]
    .map(([owner, rows]) => {
      const sortedRows = [...rows].sort(compareRows);
      const groupSummary = summarizeRows(sortedRows);
      return {
        owner,
        accounts: sortedRows,
        accountCount: sortedRows.length,
        sourceIndex: Math.min(...sortedRows.map(row => row.sourceIndex)),
        ...groupSummary,
        changeAmount: groupSummary.netChange,
        changePct: groupSummary.netChangePct,
      };
    })
    .sort((left, right) => {
      const leftRank = ownerRank.get(left.owner);
      const rightRank = ownerRank.get(right.owner);
      if (leftRank !== undefined || rightRank !== undefined) {
        if (leftRank === undefined) return 1;
        if (rightRank === undefined) return -1;
        if (leftRank !== rightRank) return leftRank - rightRank;
      }
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ sourceIndex, ...group }) => group);

  const sortedAccounts = ownerGroups.flatMap(group => group.accounts);
  if (sortedAccounts.length === 0) return emptyReport(month, previousMonth);

  const summary = summarizeRows(sortedAccounts);
  const comparableAccounts = sortedAccounts.filter(row => row.isComparable);
  const maxGainAccount = comparableAccounts
    .filter(row => row.changeAmount > 0)
    .sort(compareRows)[0] || null;
  const maxAbsChange = comparableAccounts.reduce(
    (maximum, row) => Math.max(maximum, Math.abs(row.changeAmount)),
    0,
  );

  return {
    month,
    previousMonth,
    ownerGroups,
    accounts: sortedAccounts,
    ...summary,
    maxGainAccount,
    maxAbsChange,
    accountCount: sortedAccounts.length,
    comparableAccountCount: comparableAccounts.length,
    incompleteAccountCount: summary.invalidAccountCount,
  };
}

// Temporary compatibility export while the approved prototype keeps the
// existing file boundary used by the asset page.
export const buildMonthlyAssetCategoryReport = buildMonthlyAssetAccountReport;
