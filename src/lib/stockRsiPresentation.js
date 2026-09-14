const ZONE_COLORS = {
  'severe-overbought': '#ef8267',
  overbought: '#d5ad72',
  oversold: '#68b8a5',
  neutral: '#e4e4e7',
};

function validSignalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** Shared display contract for completed daily RSI(6), without recalculating signals. */
export function stockRsiPresentation(signal, english = false) {
  const available = signal?.period === 6 && signal?.priceBasis === 'adjusted_close'
    && typeof signal.value === 'number' && Number.isFinite(signal.value)
    && signal.value >= 0 && signal.value <= 100 && validSignalDate(signal.asOf);
  if (!available) return { available: false, zone: null, zoneLabel: null, divergence: 'unknown', color: '#85858d' };
  const zone = signal.value >= 90 ? 'severe-overbought'
    : signal.value >= 80 ? 'overbought' : signal.value <= 20 ? 'oversold' : 'neutral';
  const labels = english
    ? { 'severe-overbought': 'Very overbought', overbought: 'Overbought', oversold: 'Oversold', neutral: 'Neutral' }
    : { 'severe-overbought': '严重超买', overbought: '超买', oversold: '超卖', neutral: '中性' };
  const divergence = signal.bearishDivergence === 'none' ? 'none'
    : signal.bearishDivergence === 'confirmed' && validSignalDate(signal.divergenceDate) && signal.divergenceDate <= signal.asOf
      ? 'confirmed' : 'unknown';
  return { available: true, zone, zoneLabel: labels[zone], divergence, color: ZONE_COLORS[zone] };
}
