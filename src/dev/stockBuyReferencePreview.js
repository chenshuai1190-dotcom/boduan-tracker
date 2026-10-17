import { buildEodhdStockDetail } from '../../server/quote/stockDetail.js';
import { buildStockRsi } from '../../server/quote/stockRsi.js';
import { isRegularNyseHoliday } from '../lib/quoteRefreshPolicy.js';

export const BUY_REFERENCE_PREVIEW_STATES = ['watch', 'triggered', 'invalidated', 'expired', 'paused', 'unavailable', 'idle'];

// Entirely fictional closes. The production MA, RSI and reference functions
// evaluate them together; no displayed indicator or verdict is hand-entered.
export function buildStockBuyReferencePreview(state) {
  if (!BUY_REFERENCE_PREVIEW_STATES.includes(state)) return null;
  const base = Array.from({ length: 420 }, (_, index) => 120 + index * 0.32 + Math.sin(index * 0.8) * 0.3);
  const pullback = [252, 249, 246, 243, 240];
  const recovery = [...pullback, 242, 245];
  const tails = {
    watch: pullback,
    triggered: recovery,
    invalidated: [...recovery, 239],
    expired: [...recovery, 246, 247, 248, 249, 250],
    paused: [...pullback, 180],
    unavailable: recovery,
    idle: [255, 256, 257],
  };
  const closes = [...base, ...tails[state]];
  const dates = [];
  for (const date = new Date('2026-10-16T00:00:00Z'); dates.length < closes.length; date.setUTCDate(date.getUTCDate() - 1)) {
    const key = date.toISOString().slice(0, 10);
    if (![0, 6].includes(date.getUTCDay()) && !isRegularNyseHoliday(key)) dates.unshift(key);
  }
  const rows = closes.map((close, index) => ({ date: dates[index], close, adjusted_close: close, high: close + 0.5, low: close - 0.5 }));
  const asOfDate = dates.at(-1);
  const detail = buildEodhdStockDetail(rows, { asOfDate, splitActions: [] });
  const stockRsi = buildStockRsi(rows, {
    completedCutoffDate: asOfDate,
    includeTrendMomentum: true,
    buyReferenceHistory: state === 'unavailable' ? [] : detail.history,
  });
  return { ...detail, stockRsi, previewLabel: '本地模拟 · 非真实行情' };
}
