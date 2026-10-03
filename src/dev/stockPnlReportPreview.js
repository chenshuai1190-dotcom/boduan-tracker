import { isRegularNyseHoliday } from '../lib/quoteRefreshPolicy.js';

// Old non-ledger snapshots predate the first formal trade and must be excluded
// from the report. Amounts are synthetic and never persisted.
const anchors = [
  ['2026-05-01', 100],
  ['2026-05-29', 400],
  ['2026-06-30', 250],
  ['2026-07-31', 280],
  ['2026-08-31', 180],
  ['2026-09-30', 430],
  ['2026-10-02', 450],
].map(([date, pnl]) => ({ date, pnl, time: Date.parse(`${date}T00:00:00Z`) }));

const snapshots = [];
const date = new Date(`${anchors[0].date}T00:00:00Z`);
while (date.getTime() <= anchors.at(-1).time) {
  const snapshotDate = date.toISOString().slice(0, 10);
  if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !isRegularNyseHoliday(snapshotDate)) {
    const endIndex = Math.max(1, anchors.findIndex((anchor) => anchor.time >= date.getTime()));
    const start = anchors[endIndex - 1];
    const end = anchors[endIndex];
    const progress = (date.getTime() - start.time) / (end.time - start.time);
    const cumulativePnlUsd = Number((start.pnl + (end.pnl - start.pnl) * progress
      + Math.sin(progress * Math.PI * 4) * 12).toFixed(2));
    const realizedPnlUsd = 0;
    const unrealizedPnlUsd = Number((cumulativePnlUsd - realizedPnlUsd).toFixed(2));
    const marketValueUsd = 1000 + unrealizedPnlUsd;
    snapshots.push({
      snapshotDate,
      symbol: 'NVDA',
      name: 'NVIDIA',
      heldShares: 10,
      avgCostUsd: 100,
      currentPriceUsd: marketValueUsd / 10,
      marketValueUsd,
      realizedPnlUsd,
      unrealizedPnlUsd,
      cumulativePnlUsd,
      totalBuyCostUsd: 1000,
      remainingCostUsd: 1000,
    });
  }
  date.setUTCDate(date.getUTCDate() + 1);
}

export const legacyStockPnlReportPreview = {
  trades: [{
    id: 'dev_legacy_stock_pnl_buy',
    symbol: 'NVDA',
    name: 'NVIDIA',
    side: 'buy',
    trade_date: '2026-07-01',
    price: 100,
    shares: 10,
  }],
  snapshots,
  stockPriceRows: snapshots.map((row) => ({
    date: row.snapshotDate,
    close: row.currentPriceUsd,
    rawClose: row.currentPriceUsd,
    adjustedClose: row.currentPriceUsd,
  })),
  benchmarkRows: snapshots.map((row, index) => ({
    date: row.snapshotDate,
    close: 500 + index,
    rawClose: 500 + index,
    adjustedClose: 500 + index,
  })),
};
