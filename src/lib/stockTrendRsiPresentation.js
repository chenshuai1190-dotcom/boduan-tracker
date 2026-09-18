import { hasStockRsiValue } from './stockRsiSignal.js';
import { hasStockTrendRsiSignal, stockTrendRsiState } from './stockTrendRsiSignal.js';

/** Trend-page display only. Legacy lifecycle fields never supply these states. */
export function stockTrendRsiPresentation(signal, english = false) {
  if (!hasStockRsiValue(signal)) return {
    available: false, momentumAvailable: false, zone: null, zoneLabel: null,
    rsiState: null, divergence: 'unknown', momentumLabel: '—',
    divergenceDate: null, chaseBuyBlocked: null, color: '#85858d',
  };
  const rsiState = stockTrendRsiState(signal.value);
  const zone = rsiState === 'NORMAL' ? 'neutral' : 'overbought';
  const zoneLabels = english
    ? { NORMAL: 'Normal', OVERBOUGHT: 'Overbought', STRONGLY_OVERBOUGHT: 'Strongly overbought' }
    : { NORMAL: '正常', OVERBOUGHT: '超买', STRONGLY_OVERBOUGHT: '强超买' };
  const momentumAvailable = hasStockTrendRsiSignal(signal) && signal.trendMomentum.divergenceState !== null;
  const momentum = momentumAvailable ? signal.trendMomentum : null;
  const divergence = momentum?.divergenceState.toLowerCase() || 'unknown';
  const momentumLabels = english
    ? { none: 'No divergence', watch: 'Divergence watch', potential: 'Potential bearish divergence', confirmed: 'Bearish divergence confirmed', unknown: 'Divergence unknown' }
    : { none: '无背离', watch: '背离观察', potential: '潜在顶背离', confirmed: '顶背离确认', unknown: '背离未知' };
  return {
    available: true, momentumAvailable, zone, zoneLabel: zoneLabels[rsiState], rsiState,
    divergence, momentumLabel: momentumLabels[divergence], divergenceDate: momentum?.divergenceDate ?? null,
    chaseBuyBlocked: momentum?.chaseBuyBlocked ?? null,
    color: zone === 'overbought' ? '#d5ad72' : '#e4e4e7',
  };
}
