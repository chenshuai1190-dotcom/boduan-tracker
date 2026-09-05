function amountInCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

export function resolveAnnualGoalStatus(actualGain, planTarget) {
  const actualCents = amountInCents(actualGain);
  const targetCents = amountInCents(planTarget);
  if (actualCents === null || targetCents === null) return null;
  if (actualCents > targetCents) return 'exceeded';
  if (actualCents === targetCents) return 'reached';
  return 'behind';
}
