import { buildReviewTimeline } from '../lib/reviewTimelineModel.js';
import { isRegularNyseHoliday } from '../lib/quoteRefreshPolicy.js';

// Synthetic, DEV-only report rows. Never imported by the formal timeline loader.
const anchors = [
  ['2026-04-30', 840000], ['2026-05-01', 850000], ['2026-05-22', 765000],
  ['2026-06-05', 697000], ['2026-08-18', 850000], ['2026-08-31', 870000],
  ['2026-09-30', 974400], ['2026-10-06', 1000000], ['2026-10-20', 900000],
  ['2026-10-28', 820000], ['2026-11-06', 950000],
].map(([date, value]) => ({ date, time: Date.parse(`${date}T00:00:00Z`), value }));

export function createReviewTimelinePreview(owner) {
  const snapshots = [];
  for (let time = anchors[0].time; time <= anchors.at(-1).time; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if ([0, 6].includes(new Date(time).getUTCDay()) || isRegularNyseHoliday(date)) continue;
    const end = anchors.findIndex(anchor => anchor.time >= time);
    const a = anchors[Math.max(0, end - 1)], b = anchors[end];
    const net = Math.round(a.value + (b.value - a.value) * (time - a.time) / Math.max(1, b.time - a.time));
    const previous = snapshots.at(-1)?.net_assets_usd ?? net;
    snapshots.push({
      id: `example-${date}`, user_id: owner, snapshot_date: date, currency: 'USD',
      source_version: 'pnl_snapshot_v2', locked_at: `${date}T23:00:00Z`, updated_at: `${date}T23:00:00Z`,
      market_value_usd: net - 10000, cash_usd: 10000, total_assets_usd: net, net_assets_usd: net,
      margin_debt_usd: 0, cash_basis: 'event', cash_event_id: '1', cash_effective_at: '2026-01-01T12:00:00Z',
      margin_debt_basis: 'default_zero', margin_debt_event_id: null, margin_debt_effective_at: null,
      cumulative_pnl_usd: net - 800000, cumulative_pnl_pct: (net - 800000) / 800000,
      daily_pnl_usd: net - previous, daily_pnl_pct: (net - previous) / (previous - 10000),
    });
  }
  const timeline = buildReviewTimeline({ snapshots, movements: [], firstTradeDate: '2026-01-02', expectedUserId: owner, now: Date.parse('2026-11-07T05:00:00Z') });
  // Explicit fixture-only prices; this preview never enters the formal loader.
  const points = [
    { date: '2026-04-02', stockCloseUsd: 93.70, previousCloseUsd: 100, stockDailyReturnPct: -6.30, previousRecordPct: -4.20, previousRecordDate: '2026-02-04' },
    { date: '2026-11-05', stockCloseUsd: 137.22, previousCloseUsd: 150, stockDailyReturnPct: -8.52, previousRecordPct: -6.30, previousRecordDate: '2026-04-02' },
  ];
  const stockEvent = { id: 'record:stock_daily_return:NVDA:2026', kind: 'record', metric: 'stock_daily_return', symbol: 'NVDA', year: 2026, name: 'NVIDIA', title: 'NVDA · 年内最大单日跌幅',
    value: -8.52, valueType: 'percent', date: points[1].date, startDate: points[0].date, endDate: points[1].date, previousRecordPct: -6.30, previousRecordDate: '2026-04-02',
    current: points[1], points, nodes: points.map(point => ({ key: point.date, label: point.date, point })) };
  return { status: 'ready', ...timeline, stockRecordStatus: 'ready', events: [...timeline.events, stockEvent].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)) };
}
