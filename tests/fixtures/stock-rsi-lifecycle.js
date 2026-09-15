export function lifecycleSignal(state = 'NONE', overrides = {}) {
  const entered = { FORMING: '2026-09-08', CONFIRMED: '2026-09-09', REALIZED: '2026-09-10', INVALIDATED: '2026-09-09' };
  const confirmed = ['CONFIRMED', 'REALIZED'].includes(state);
  return {
    period: 6, value: 82.6, asOf: '2026-09-11', priceBasis: 'adjusted_close',
    divergenceVersion: 'rsi6-lifecycle-v2', divergenceState: state,
    divergenceDate: entered[state] || null,
    divergenceConfirmationStrength: confirmed ? 'BASIC' : null,
    divergenceEvent: entered[state] ? {
      high1: { date: '2026-08-20', price: 200, rsi: 88 },
      high2: { date: '2026-09-02', price: 220, rsi: 74 },
      formedAt: '2026-09-08', confirmedAt: confirmed ? '2026-09-09' : null,
      realizedAt: state === 'REALIZED' ? '2026-09-10' : null,
      invalidatedAt: state === 'INVALIDATED' ? '2026-09-09' : null,
      maxDrawdownPct: state === 'REALIZED' ? 8 : confirmed ? 4 : 1,
    } : null,
    ...overrides,
  };
}
