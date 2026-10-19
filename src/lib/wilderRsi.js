// Callers validate and order completed adjusted closes before using this pure
// recurrence. Keep the operation order shared with the quote RSI calculation.
function rsiValue(gain, loss) {
  if (gain === 0 && loss === 0) return 50;
  if (loss === 0) return 100;
  if (gain === 0) return 0;
  return 100 - 100 / (1 + gain / loss);
}

export function wilderRsiSeries(rows, period) {
  const values = Array(rows.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const change = rows[i].close - rows[i - 1].close;
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);
    if (i <= period) {
      gain += up / period;
      loss += down / period;
    } else {
      gain = gain * ((period - 1) / period) + up / period;
      loss = loss * ((period - 1) / period) + down / period;
    }
    if (i >= period) values[i] = rsiValue(gain, loss);
  }
  return values;
}
