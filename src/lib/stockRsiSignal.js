import { STOCK_RSI_DIVERGENCE_VERSION, STOCK_RSI_RULES } from './stockRsiConfig.js';

export function validStockRsiDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

const rsiNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

export function hasStockRsiValue(signal) {
  return signal?.period === STOCK_RSI_RULES.RSI_PERIOD && signal?.priceBasis === 'adjusted_close'
    && rsiNumber(signal.value) && validStockRsiDate(signal.asOf);
}

/** Validate the lifecycle contract without reconstructing trading dates or signals in the browser. */
export function isStockRsiLifecycleSignal(signal, { asOf } = {}) {
  if (!signal || signal.period !== STOCK_RSI_RULES.RSI_PERIOD || signal.priceBasis !== 'adjusted_close'
    || signal.divergenceVersion !== STOCK_RSI_DIVERGENCE_VERSION
    || (signal.value !== null && !hasStockRsiValue(signal))
    || (signal.asOf !== null && !validStockRsiDate(signal.asOf))
    || (asOf !== undefined && signal.value !== null && signal.asOf !== asOf)) return false;
  const state = signal.divergenceState;
  const event = signal.divergenceEvent;
  const strength = signal.divergenceConfirmationStrength;
  if (state === null || state === 'NONE') {
    return (state === null || hasStockRsiValue(signal))
      && signal.divergenceDate === null && event === null && strength === null;
  }
  if (!['FORMING', 'CONFIRMED', 'REALIZED', 'INVALIDATED'].includes(state)
    || !hasStockRsiValue(signal) || !event || !validStockRsiDate(signal.divergenceDate)) return false;
  for (const high of [event.high1, event.high2]) {
    if (!high || !validStockRsiDate(high.date) || typeof high.price !== 'number'
      || !Number.isFinite(high.price) || high.price <= 0 || !rsiNumber(high.rsi)) return false;
  }
  if (!(event.high1.date < event.high2.date && event.high1.price < event.high2.price && event.high1.rsi > event.high2.rsi)
    || !validStockRsiDate(event.formedAt) || event.formedAt <= event.high2.date || event.formedAt > signal.asOf
    || typeof event.maxDrawdownPct !== 'number' || !Number.isFinite(event.maxDrawdownPct)
    || event.maxDrawdownPct < 0 || event.maxDrawdownPct > 100) return false;
  for (const key of ['confirmedAt', 'realizedAt', 'invalidatedAt']) {
    if (event[key] !== null && (!validStockRsiDate(event[key]) || event[key] < event.formedAt || event[key] > signal.asOf)) return false;
  }
  if (state === 'FORMING') return signal.divergenceDate === event.formedAt
    && event.confirmedAt === null && event.realizedAt === null && event.invalidatedAt === null && strength === null;
  if (state === 'INVALIDATED') return signal.divergenceDate === event.invalidatedAt
    && event.confirmedAt === null && event.realizedAt === null && strength === null;
  if (!['BASIC', 'STRONG'].includes(strength) || event.confirmedAt === null || event.invalidatedAt !== null) return false;
  if (state === 'CONFIRMED') return signal.divergenceDate === event.confirmedAt && event.realizedAt === null;
  return event.realizedAt !== null && event.realizedAt >= event.confirmedAt && signal.divergenceDate === event.realizedAt;
}
