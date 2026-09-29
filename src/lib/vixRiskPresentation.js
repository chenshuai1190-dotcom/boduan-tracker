import { classifyCurrentRiskLevel } from './vixRiskModel.js';
import { isVixComparisonSession } from './vixComparisonSession.js';

// Historical chart colors reuse the model's current-level classifier. The map
// only reads each day's paired closes, never the selected ETF or today's level.
export function buildVixHistoricalRiskLevels(termRows, { throughDate } = {}) {
  const levels = new Map();
  const seen = new Set();
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  for (const row of Array.isArray(termRows) ? termRows : []) {
    if (typeof row?.date !== 'string' || !isVixComparisonSession(row.date)
      || (throughDate && row.date > throughDate)) continue;
    if (seen.has(row.date)) { levels.set(row.date, 'UNKNOWN'); continue; }
    seen.add(row.date);
    const valid = positive(row.vix) && positive(row.vix3m) && positive(row.ratio)
      && Math.abs(row.ratio - row.vix / row.vix3m) <= 0.000001;
    levels.set(row.date, valid
      ? classifyCurrentRiskLevel({ vix: row.vix, ratio: row.vix / row.vix3m }) : 'UNKNOWN');
  }
  return levels;
}
