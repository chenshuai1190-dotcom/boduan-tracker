import { currentNewYorkDate } from './pnlReportSnapshots.js';

// Read-only stock performance, independent of purchase cost, position size and FX.
// The caller supplies the same price already displayed in the holdings table.
export function deriveHoldingStockYtdPercent(quote, displayPrice, now = Date.now()) {
  const baseline = quote?.stockYtdBaseline;
  const year = Number(currentNewYorkDate(now).slice(0, 4));
  if (!baseline || baseline.year !== year || baseline.source !== 'eodhd-adjusted-close'
      || !new RegExp(`^${year - 1}-12-\\d{2}$`).test(baseline.date || '')
      || typeof baseline.close !== 'number' || !Number.isFinite(baseline.close) || baseline.close <= 0
      || typeof displayPrice !== 'number' || !Number.isFinite(displayPrice) || displayPrice <= 0) return null;
  const change = (displayPrice / baseline.close - 1) * 100;
  return Number.isFinite(change) ? change : null;
}
