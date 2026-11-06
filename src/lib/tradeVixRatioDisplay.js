export function formatTradeVixRatio(value) {
  if (!Number.isFinite(value) || value <= 0) return '--';
  const standard = value.toFixed(3);
  if (value === 1 || Number(standard) !== 1) return standard;
  for (let digits = 4; digits <= 6; digits += 1) {
    const precise = value.toFixed(digits);
    if (Number(precise) !== 1) return precise;
  }
  return `${value > 1 ? '>' : '<'}1.000000`;
}
