const DEFAULT_COLLAPSED_MONTH_COUNT = 6;

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function makePoint(month, balance, index) {
  return { month, balance, index };
}

/**
 * Builds the display-only model for the aggregate monthly asset trend.
 *
 * Values are already converted and aggregated by AnalysisTab. This helper does
 * not change that financial meaning: a non-positive aggregate is unavailable,
 * comparisons require the exact adjacent month, and the current month never
 * falls back to an older balance.
 */
export function buildMonthlyAssetTrend({ months = [], values = [] } = {}) {
  const normalizedMonths = Array.isArray(months) ? months : [];
  const slots = normalizedMonths.map((month, index) => {
    const balance = finitePositive(values?.[index]);
    const previousBalance = index > 0 ? finitePositive(values?.[index - 1]) : null;
    const hasData = balance !== null;
    const hasPreviousMonth = hasData && previousBalance !== null;
    const changeAmount = hasPreviousMonth ? balance - previousBalance : null;
    const changePct = hasPreviousMonth && previousBalance > 0
      ? ((balance - previousBalance) / previousBalance) * 100
      : null;

    return {
      month,
      balance,
      hasData,
      previousMonth: index > 0 ? normalizedMonths[index - 1] : null,
      previousBalance: hasPreviousMonth ? previousBalance : null,
      hasPreviousMonth,
      changeAmount,
      changePct,
      index,
    };
  });

  const points = slots
    .filter(slot => slot.hasData)
    .map(slot => makePoint(slot.month, slot.balance, slot.index));
  const currentSlot = slots.at(-1) || null;
  const firstSlot = slots[0] || null;
  const maxPoint = points.reduce(
    (maximum, point) => (!maximum || point.balance > maximum.balance ? point : maximum),
    null,
  );
  const windowChangeAmount = firstSlot?.hasData && currentSlot?.hasData
    ? currentSlot.balance - firstSlot.balance
    : null;
  const windowChangePct = firstSlot?.hasData && currentSlot?.hasData && firstSlot.balance > 0
    ? ((currentSlot.balance - firstSlot.balance) / firstSlot.balance) * 100
    : null;

  const segments = [];
  let currentSegment = [];
  slots.forEach((slot) => {
    if (slot.hasData) {
      currentSegment.push(makePoint(slot.month, slot.balance, slot.index));
      return;
    }
    if (currentSegment.length > 0) segments.push(currentSegment);
    currentSegment = [];
  });
  if (currentSegment.length > 0) segments.push(currentSegment);

  return {
    slots,
    points,
    segments,
    currentSlot: currentSlot?.hasData ? currentSlot : null,
    maxPoint,
    windowChangeAmount,
    windowChangePct,
  };
}

export function visibleMonthlyAssetTrendSlots(
  slots,
  expanded,
  collapsedMonthCount = DEFAULT_COLLAPSED_MONTH_COUNT,
) {
  const normalizedSlots = Array.isArray(slots) ? slots : [];
  if (expanded) return [...normalizedSlots].reverse();
  return normalizedSlots.slice(-collapsedMonthCount).reverse();
}

export { DEFAULT_COLLAPSED_MONTH_COUNT };
