export function compareNumbers(left, right) {
  const tolerance = Number.EPSILON * 8 * Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= tolerance ? 0 : left > right ? 1 : -1;
}

// Called only once all right-hand observations are available.
export function confirmedPivot(rows, index, rules) {
  if (index < rules.RSI_WARMUP_CLOSES - 1 || index < rules.PIVOT_WINDOW
    || index + rules.PIVOT_WINDOW >= rows.length) return false;
  for (let offset = 1; offset <= rules.PIVOT_WINDOW; offset += 1) {
    // Equal/plateau highs are not distinct confirmed swing highs.
    if (compareNumbers(rows[index].high, rows[index - offset].high) <= 0
      || compareNumbers(rows[index].high, rows[index + offset].high) <= 0) return false;
  }
  return true;
}
