import { buildRsiTechnicalExplanation } from './rsiTechnicalExplanation.js';
import { buildMaTechnicalExplanation } from './maTechnicalExplanation.js';

// Presentation only: consume the same completed-day snapshot as the metric.
export function buildTechnicalExplanation(input) {
  if (input?.indicatorType === 'rsi') return buildRsiTechnicalExplanation(input);
  if (['maStructure', 'trendChange'].includes(input?.indicatorType)) return buildMaTechnicalExplanation(input);
  return null;
}
