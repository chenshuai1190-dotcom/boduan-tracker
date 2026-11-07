import { getInvestmentComparisonExpectedCloseDate } from './investmentComparison.js';
import { stockRsiTradeDateReason } from './stockRsiReference.js';
import { stockTrendRsiState } from './stockTrendRsiSignal.js';
import { getVixComparisonExpectedCloseDate } from './vixComparisonSession.js';

export const BUY_TRADE_DISCIPLINE_RULES = Object.freeze({ rsiMaximum: 20, vixRatioMinimum: 1 });

const emptyRsi = () => ({ ready: false, value: null, asOf: '', met: false, zone: null });
const emptyVix = () => ({ ready: false, value: null, asOf: '', met: false });
const inactive = (status, reason) => ({ applies: false, status, reason, rsi: emptyRsi(), vix: emptyVix() });
const isEditing = id => id !== null && id !== undefined && id !== '';

function rsiZone(value) {
  if (value <= 15) return 'panic-oversold';
  if (value <= BUY_TRADE_DISCIPLINE_RULES.rsiMaximum) return 'extremely-oversold';
  if (value <= 30) return 'oversold';
  const state = stockTrendRsiState(value);
  if (state === 'STRONGLY_OVERBOUGHT') return 'strongly-overbought';
  return state === 'OVERBOUGHT' ? 'overbought' : 'neutral';
}

// Consume only the existing authenticated, normalized modal references. Recheck
// their completed-session dates when confirmation opens, without fetching,
// rounding, mutating the draft, or deciding whether a ledger write is valid.
export function deriveBuyTradeDiscipline({
  tradeDate, side = 'buy', scope = 'ledger', editingId = null,
  rsiReference, vixReference, now = Date.now(),
} = {}) {
  if (scope !== 'ledger' || side !== 'buy') return inactive('not-applicable', 'outside-new-buy');
  if (isEditing(editingId)) return inactive('historical', 'editing-existing-trade');
  if (!(now instanceof Date || typeof now === 'number') || !Number.isFinite(new Date(now).getTime())) {
    return inactive('not-applicable', 'invalid-date');
  }
  const dateReason = stockRsiTradeDateReason(tradeDate, now);
  if (dateReason) return inactive(dateReason === 'historical-unavailable' ? 'historical' : 'not-applicable', dateReason);

  const observation = rsiReference?.observation;
  const rsiReady = rsiReference?.status === 'ready'
    && rsiReference.stale !== true
    && typeof observation?.value === 'number'
    && Number.isFinite(observation.value) && observation.value >= 0 && observation.value <= 100
    && observation.asOf === getInvestmentComparisonExpectedCloseDate(now)
    && observation.asOf < tradeDate;
  const rsi = rsiReady ? {
    ready: true, value: observation.value, asOf: observation.asOf,
    met: observation.value <= BUY_TRADE_DISCIPLINE_RULES.rsiMaximum,
    zone: rsiZone(observation.value),
  } : emptyRsi();

  const vixValue = vixReference?.vixRatioValue;
  const vixReady = vixReference?.vixRatioReady === true
    && vixReference.stale !== true
    && typeof vixValue === 'number' && Number.isFinite(vixValue) && vixValue > 0
    && vixReference.vixRatioDataDate === getVixComparisonExpectedCloseDate(now)
    && vixReference.vixRatioDataDate < tradeDate;
  const vix = vixReady ? {
    ready: true, value: vixValue, asOf: vixReference.vixRatioDataDate,
    met: vixValue > BUY_TRADE_DISCIPLINE_RULES.vixRatioMinimum,
  } : emptyVix();

  // One known qualifying condition is enough. A known non-qualifying condition
  // plus an unavailable condition is unknown, not evidence that both failed.
  const status = rsi.met || vix.met ? 'met' : rsi.ready && vix.ready ? 'unmet' : 'unknown';
  const reason = status === 'met'
    ? (rsi.met && vix.met ? 'both-conditions' : rsi.met ? 'rsi-extreme-oversold' : 'vix-inversion')
    : status === 'unmet' ? 'conditions-not-met' : 'data-unavailable';
  return { applies: true, status, reason, rsi, vix };
}
