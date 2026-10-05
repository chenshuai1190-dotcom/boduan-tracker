import { isRegularNyseHoliday } from './quoteRefreshPolicy.js';
import { validStockRsiDate } from './stockRsiSignal.js';

const isRsiValue = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

function isRegularSession(dateKey) {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isRegularNyseHoliday(dateKey);
}

function areConsecutiveSessions(previousAsOf, asOf) {
  if (!validStockRsiDate(previousAsOf) || previousAsOf >= asOf || !isRegularSession(asOf)) return false;
  const cursor = new Date(`${asOf}T00:00:00Z`);
  do {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } while (!isRegularSession(cursor.toISOString().slice(0, 10)));
  return cursor.toISOString().slice(0, 10) === previousAsOf;
}

// Validate supplied close observations without recalculating or rounding RSI.
// Freshness and trade-date eligibility remain the authenticated adapter's job.
export function normalizeRsiReferenceObservation(observation) {
  if (!isRsiValue(observation?.value) || !validStockRsiDate(observation?.asOf)) {
    return { value: null, asOf: null, previousValue: null, previousAsOf: null, crossing: null };
  }
  const { value, asOf } = observation;
  const hasPrevious = isRsiValue(observation.previousValue)
    && areConsecutiveSessions(observation.previousAsOf, asOf);
  const previousValue = hasPrevious ? observation.previousValue : null;
  return {
    value, asOf, previousValue,
    previousAsOf: hasPrevious ? observation.previousAsOf : null,
    crossing: hasPrevious && previousValue <= 30 && value > 30
      ? 'above-30'
      : hasPrevious && previousValue >= 70 && value < 70 ? 'below-70' : null,
  };
}
