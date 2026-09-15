// Fictional visual fixtures only. This helper is never used by production data.
export function rsiLifecyclePreview(value, asOf, state = 'NONE') {
  const dateBefore = days => new Date(Date.parse(`${asOf}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const confirmed = ['CONFIRMED', 'REALIZED'].includes(state);
  const event = state === 'NONE' ? null : {
    high1: { date: dateBefore(21), price: 170, rsi: 90 },
    high2: { date: dateBefore(10), price: 185, rsi: 78 },
    formedAt: dateBefore(5), confirmedAt: confirmed ? dateBefore(2) : null,
    realizedAt: state === 'REALIZED' ? dateBefore(1) : null,
    invalidatedAt: state === 'INVALIDATED' ? dateBefore(1) : null,
    maxDrawdownPct: state === 'REALIZED' ? 9 : confirmed ? 4 : 1,
  };
  return {
    period: 6, value, asOf, priceBasis: 'adjusted_close', divergenceVersion: 'rsi6-lifecycle-v2',
    divergenceState: state, divergenceEvent: event,
    divergenceConfirmationStrength: confirmed ? 'BASIC' : null,
    divergenceDate: state === 'NONE' ? null : state === 'FORMING' ? event.formedAt
      : state === 'CONFIRMED' ? event.confirmedAt : state === 'REALIZED' ? event.realizedAt : event.invalidatedAt,
  };
}
