import { STOCK_RSI_RULES } from './stockRsiConfig.js';
import { hasStockRsiValue, isStockRsiLifecycleSignal } from './stockRsiSignal.js';

const ZONE_COLORS = {
  overbought: '#d5ad72',
  oversold: '#68b8a5',
  neutral: '#e4e4e7',
};

/** Shared display contract for completed daily RSI(6), without recalculating signals. */
export function stockRsiPresentation(signal, english = false) {
  const available = hasStockRsiValue(signal);
  if (!available) return { available: false, momentumAvailable: false, zone: null, zoneLabel: null, divergence: 'unknown', momentumLabel: '—', color: '#85858d' };
  const zone = signal.value >= STOCK_RSI_RULES.RSI_OVERBOUGHT ? 'overbought'
    : signal.value <= STOCK_RSI_RULES.RSI_OVERSOLD ? 'oversold' : 'neutral';
  const labels = english
    ? { overbought: 'Overbought', oversold: 'Oversold', neutral: 'Neutral' }
    : { overbought: '超买', oversold: '超卖', neutral: '中性' };
  const momentumAvailable = isStockRsiLifecycleSignal(signal) && signal.divergenceState !== null;
  const divergence = momentumAvailable ? signal.divergenceState.toLowerCase() : 'unknown';
  const momentumLabels = english
    ? { none: 'Normal momentum', forming: 'Divergence forming', confirmed: 'Divergence confirmed', realized: 'Divergence realized', invalidated: 'Divergence invalidated' }
    : { none: '动量正常', forming: '顶背离形成', confirmed: '顶背离确认', realized: '顶背离已兑现', invalidated: '顶背离失效' };
  return { available: true, momentumAvailable, zone, zoneLabel: labels[zone], divergence,
    momentumLabel: momentumLabels[divergence] || '—', color: ZONE_COLORS[zone] };
}
