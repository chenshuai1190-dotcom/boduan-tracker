import { loadStockComparison } from './stockComparison.js';

const MAX_REQUESTS = 32;
const fail = (code, message) => Object.assign(new Error(message), { code });
const identityFailure = error => ['AUTH_REQUIRED', 'REVIEW_AUTH_REQUIRED', 'REVIEW_ACCOUNT_CHANGED', 'REQUEST_SUPERSEDED'].includes(error?.code);

// The existing authenticated EODHD endpoint accepts 2–4 instruments. The extra
// benchmark for a singleton is never used as the stock's price or holding proof.
export function reviewStockDailyHistoryRequests(ranges) {
  const symbols = new Map();
  for (const range of ranges) {
    const previous = symbols.get(range.symbol);
    symbols.set(range.symbol, previous ? { symbol: range.symbol,
      startDate: previous.startDate < range.startDate ? previous.startDate : range.startDate,
      endDate: previous.endDate > range.endDate ? previous.endDate : range.endDate } : { ...range });
  }
  const ordered = [...symbols.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.symbol.localeCompare(b.symbol));
  const requests = [];
  for (let index = 0; index < ordered.length; index += 4) {
    const group = ordered.slice(index, index + 4);
    const selected = group.map(item => item.symbol);
    if (selected.length === 1) selected.push(selected[0] === 'QQQ' ? 'SPY' : 'QQQ');
    requests.push({ symbols: selected, startDate: group.map(item => item.startDate).sort()[0],
      endDate: group.map(item => item.endDate).sort().at(-1) });
  }
  if (requests.length > MAX_REQUESTS) throw fail('REVIEW_STOCK_HISTORY_LIMIT', '持仓历史较多，本次未能完整核对个股纪录。');
  return requests;
}

/** Bounded, read-only market requests. A failed group never becomes empty history. */
export async function loadReviewStockDailyHistory({ ranges, userId, signal, getSession, now,
  loadHistory = loadStockComparison } = {}) {
  const requests = reviewStockDailyHistoryRequests(ranges), histories = [];
  let next = 0, failures = 0;
  async function worker() {
    while (next < requests.length) {
      if (signal?.aborted) throw fail('REQUEST_ABORTED', '个股纪录读取已取消。');
      const request = requests[next++];
      try {
        const history = await loadHistory({ ...request, userId, signal, getSession, now });
        if (signal?.aborted) throw fail('REQUEST_ABORTED', '个股纪录读取已取消。');
        histories.push(history);
      } catch (error) {
        if (identityFailure(error) || signal?.aborted || error?.code === 'REQUEST_ABORTED') throw error;
        failures += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, requests.length) }, worker));
  return { histories, failures };
}
