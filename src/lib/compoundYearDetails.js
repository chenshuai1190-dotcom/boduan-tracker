function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildCompoundYearDetailRows(rows = [], { currentYear } = {}) {
  const normalizedCurrentYear = finiteNumber(currentYear) ?? new Date().getFullYear();

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const year = finiteNumber(row?.year);
    const startBalance = finiteNumber(row?.startBalance);
    const planTarget = finiteNumber(row?.planTarget);
    const actualGain = row?.actualGain === null || row?.actualGain === undefined
      ? null
      : finiteNumber(row.actualGain);
    const endBalance = finiteNumber(row?.endBalance);
    const hasActual = row?.isProjected !== true && actualGain !== null;
    const actualGrowthPct = hasActual && startBalance !== null && startBalance > 0
      ? (actualGain / startBalance) * 100
      : null;
    const completionPct = hasActual && planTarget !== null && planTarget > 0
      ? (actualGain / planTarget) * 100
      : null;
    const targetGap = hasActual && planTarget !== null ? planTarget - actualGain : null;
    const isCurrentYear = year === normalizedCurrentYear;
    const isFutureYear = year !== null && year > normalizedCurrentYear;
    const status = hasActual
      ? (targetGap !== null && targetGap <= 0 ? 'reached' : 'behind')
      : (isFutureYear ? 'notStarted' : 'pending');
    const assetLabel = isCurrentYear ? 'current' : hasActual ? 'actualEnd' : 'plannedEnd';

    return {
      ...row,
      year,
      startBalance,
      planTarget,
      actualGain,
      endBalance,
      hasActual,
      actualGrowthPct,
      completionPct,
      targetGap,
      targetEndBalance: startBalance !== null && planTarget !== null ? startBalance + planTarget : null,
      actualEndBalance: hasActual ? endBalance : null,
      isCurrentYear,
      isFutureYear,
      status,
      assetLabel,
    };
  });
}
