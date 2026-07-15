const DEFAULT_MONTH_COUNT = 12;
const MAX_MONTH_COUNT = 120;

function parseMonthKey(value) {
  const match = typeof value === 'string' && /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1,
  };
}

function formatMonthKey(year, monthIndex) {
  const absoluteMonth = year * 12 + monthIndex;
  const normalizedYear = Math.floor(absoluteMonth / 12);
  const normalizedMonth = absoluteMonth - normalizedYear * 12;
  return `${String(normalizedYear).padStart(4, '0')}-${String(normalizedMonth + 1).padStart(2, '0')}`;
}

function shiftMonthKey(month, offset) {
  const parsed = parseMonthKey(month);
  if (!parsed) return null;
  return formatMonthKey(parsed.year, parsed.monthIndex + offset);
}

function normalizeMonthCount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_MONTH_COUNT) return DEFAULT_MONTH_COUNT;
  return parsed;
}

function finiteBalance(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value === 0 ? 0 : value;
}

function snapshotPoint(month, balance) {
  return { month, balance };
}

/**
 * Builds a fixed calendar-month trend for one exact account.
 *
 * Missing snapshots remain missing. Conflicting duplicate rows invalidate that
 * month instead of choosing an arbitrary value. The exact end month is the only
 * month eligible to become `latest`; this model never falls back to an older row.
 */
export function buildAccountAssetTrend({
  accountId,
  snapshots = [],
  endMonth,
  monthCount = DEFAULT_MONTH_COUNT,
} = {}) {
  const normalizedCount = normalizeMonthCount(monthCount);
  const parsedEndMonth = parseMonthKey(endMonth);
  const hasAccountId = accountId !== null && accountId !== undefined && accountId !== '';
  const normalizedEndMonth = parsedEndMonth ? endMonth : null;
  const months = normalizedEndMonth
    ? Array.from(
      { length: normalizedCount },
      (_, index) => shiftMonthKey(normalizedEndMonth, index - normalizedCount + 1),
    )
    : [];

  const balancesByMonth = new Map();
  const conflictedMonths = new Set();
  let invalidCount = 0;
  let duplicateCount = 0;

  if (hasAccountId && Array.isArray(snapshots)) {
    snapshots.forEach((row) => {
      if (!row || row.accountId !== accountId) return;

      const month = parseMonthKey(row.month) ? row.month : null;
      const balance = finiteBalance(row.balance);
      if (!month || balance === null) {
        invalidCount += 1;
        return;
      }

      if (conflictedMonths.has(month)) {
        duplicateCount += 1;
        return;
      }

      if (!balancesByMonth.has(month)) {
        balancesByMonth.set(month, balance);
        return;
      }

      duplicateCount += 1;
      if (balancesByMonth.get(month) !== balance) {
        balancesByMonth.delete(month);
        conflictedMonths.add(month);
      }
    });
  }

  const slots = months.map((month) => {
    const hasData = balancesByMonth.has(month);
    const balance = hasData ? balancesByMonth.get(month) : null;
    const previousMonth = shiftMonthKey(month, -1);
    const hasPreviousMonth = hasData && balancesByMonth.has(previousMonth);
    const previousBalance = hasPreviousMonth ? balancesByMonth.get(previousMonth) : null;
    const changeAmount = hasPreviousMonth ? balance - previousBalance : null;
    const changePct = hasPreviousMonth && previousBalance > 0
      ? ((balance - previousBalance) / previousBalance) * 100
      : null;

    return {
      month,
      balance,
      hasData,
      previousMonth,
      previousBalance,
      hasPreviousMonth,
      changeAmount,
      changePct,
    };
  });

  const startMonth = months[0] || null;
  const startBalance = startMonth && balancesByMonth.has(startMonth)
    ? balancesByMonth.get(startMonth)
    : null;
  const endBalance = normalizedEndMonth && balancesByMonth.has(normalizedEndMonth)
    ? balancesByMonth.get(normalizedEndMonth)
    : null;
  const startSnapshot = startBalance === null ? null : snapshotPoint(startMonth, startBalance);
  const endSnapshot = endBalance === null ? null : snapshotPoint(normalizedEndMonth, endBalance);
  const cumulativeChangeAmount = startSnapshot && endSnapshot
    ? endSnapshot.balance - startSnapshot.balance
    : null;
  const cumulativeGrowthPct = startSnapshot && endSnapshot && startSnapshot.balance > 0
    ? ((endSnapshot.balance - startSnapshot.balance) / startSnapshot.balance) * 100
    : null;

  const dataPoints = slots
    .filter((slot) => slot.hasData)
    .map((slot) => snapshotPoint(slot.month, slot.balance));
  const minPoint = dataPoints.reduce(
    (minimum, point) => (!minimum || point.balance < minimum.balance ? point : minimum),
    null,
  );
  const maxPoint = dataPoints.reduce(
    (maximum, point) => (!maximum || point.balance > maximum.balance ? point : maximum),
    null,
  );

  return {
    accountId,
    startMonth,
    endMonth: normalizedEndMonth,
    monthCount: normalizedCount,
    slots,
    startSnapshot,
    endSnapshot,
    latest: endSnapshot ? { ...endSnapshot } : null,
    cumulativeChangeAmount,
    cumulativeGrowthPct,
    minPoint: minPoint ? { ...minPoint } : null,
    maxPoint: maxPoint ? { ...maxPoint } : null,
    invalidCount,
    duplicateCount,
    hasConflict: conflictedMonths.size > 0,
  };
}
