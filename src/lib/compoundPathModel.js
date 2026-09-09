const MAX_PRESENTATION_YEARS = 100;

function finiteNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function emptyModel() {
  return { points: [], simulationRows: [], latestActualIndex: null };
}

/**
 * Build a read-only view of the compound plan and its recorded annual balances.
 * All amounts remain in the plan's source currency; this does not update the plan.
 *
 * Returns:
 * - points: the starting principal at index 0 ({ year: null, kind: 'start',
 *   plannedValue, actualValue: null }), followed by N year-end points at indexes
 *   1..N ({ year, kind: 'year', plannedValue, actualValue }). Unrecorded actual
 *   values stay null, including gaps between recorded years.
 * - simulationRows: N rows ({ index, year, annualGain, endBalance }) using the
 *   existing simulation's rounded year-end balances and annual gain arithmetic.
 * - latestActualIndex: the last point with a recorded actual value, or null.
 *
 * Numeric inputs may be finite numbers or nonempty numeric strings. Missing or
 * invalid plan/clock inputs and nonfinite calculated balances return an empty
 * model. Duration must be an integer in 1..100; an unsupported duration returns
 * an empty model rather than displaying a different horizon. This guard does
 * not modify saved inputs or the parent plan calculations.
 */
export function buildCompoundPathModel({
  startCapital,
  startYear,
  totalYears,
  targetAnnualRate,
  yearRows,
  currentYear,
} = {}) {
  const principal = finiteNumber(startCapital);
  const firstYear = finiteNumber(startYear);
  const duration = finiteNumber(totalYears);
  const annualRate = finiteNumber(targetAnnualRate);
  const clockYear = finiteNumber(currentYear);

  if (
    principal === null
    || !Number.isSafeInteger(firstYear)
    || !Number.isInteger(duration)
    || duration < 1
    || duration > MAX_PRESENTATION_YEARS
    || annualRate === null
    || !Number.isSafeInteger(clockYear)
  ) return emptyModel();

  const yearCount = duration;
  if (!Number.isSafeInteger(firstYear + yearCount - 1)) return emptyModel();

  const actualByYear = new Map();
  for (const row of Array.isArray(yearRows) ? yearRows : []) {
    const year = finiteNumber(row?.year);
    const actualGain = finiteNumber(row?.actualGain);
    const endBalance = finiteNumber(row?.endBalance);
    if (
      row?.isProjected === false
      && Number.isSafeInteger(year)
      && year <= clockYear
      && actualGain !== null
      && endBalance !== null
      && !actualByYear.has(year)
    ) actualByYear.set(year, endBalance);
  }

  const points = [{ index: 0, year: null, kind: 'start', plannedValue: principal, actualValue: null }];
  const simulationRows = [];
  let previousEndBalance = principal;
  let latestActualIndex = null;

  for (let offset = 0; offset < yearCount; offset += 1) {
    const index = offset + 1;
    const year = firstYear + offset;
    const endBalance = Math.round(principal * Math.pow(1 + annualRate, index));
    const annualGain = Math.round(endBalance - previousEndBalance);
    if (!Number.isFinite(endBalance) || !Number.isFinite(annualGain)) return emptyModel();

    const actualValue = actualByYear.get(year) ?? null;
    points.push({ index, year, kind: 'year', plannedValue: endBalance, actualValue });
    simulationRows.push({ index, year, annualGain, endBalance });
    if (actualValue !== null) latestActualIndex = index;
    previousEndBalance = endBalance;
  }

  return { points, simulationRows, latestActualIndex };
}
