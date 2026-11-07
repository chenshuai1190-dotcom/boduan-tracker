import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewTimeline } from '../src/lib/reviewTimelineModel.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

const OWNER = 'timeline-owner';
const NOW = Date.parse('2026-11-07T05:00:00Z');
const row = (date, net, extra = {}) => ({
  id: `snapshot-${date}`, user_id: OWNER, snapshot_date: date, currency: 'USD',
  source_version: 'pnl_snapshot_v2', locked_at: `${date}T23:00:00Z`, updated_at: `${date}T23:00:00Z`,
  market_value_usd: Math.max(0, net - 10), cash_usd: 10,
  total_assets_usd: Math.max(10, net), net_assets_usd: net, margin_debt_usd: Math.max(0, 10 - net),
  cash_basis: 'event', cash_event_id: '1', cash_effective_at: '2025-01-01T12:00:00Z',
  margin_debt_basis: 'default_zero', margin_debt_event_id: null, margin_debt_effective_at: null,
  cumulative_pnl_pct: 0.1, cumulative_pnl_usd: 100, daily_pnl_pct: 0, daily_pnl_usd: 0,
  ...extra,
});
const build = (snapshots, movements = [], options = {}) => buildReviewTimeline({ snapshots, movements, now: NOW, expectedUserId: OWNER, ...options });
const cycles = result => result.events.filter(event => event.kind === 'drawdown');
const flow = (date, kind, delta, extra = {}) => ({ id: `flow-${date}`, user_id: OWNER, kind, delta_usd: delta,
  cash_event_id: '2', occurred_at: `${date}T16:00:00Z`, ...extra });
const sessions = (start, end) => {
  const result = [];
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= Date.parse(`${end}T00:00:00Z`); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (![0, 6].includes(new Date(time).getUTCDay()) && !isRegularNyseHoliday(date)) result.push(date);
  }
  return result;
};

test('10% starts a single stable cycle; rebound does not finish until the former peak', () => {
  const dates = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02'];
  const rows = dates.map((date, index) => row(date, [100, 90, 78, 95, 100, 89][index]));
  const active = cycles(build(rows.slice(0, 4)));
  assert.equal(active.length, 1);
  assert.equal(active[0].status, 'active');
  assert.equal(active[0].id, 'drawdown:net_assets:2026-10-26');
  assert.equal(active[0].trigger.date, dates[1]);
  assert.equal(active[0].trough.date, dates[2]);
  assert.ok(Math.abs(active[0].drawdownPct + 5) < 1e-8);
  assert.ok(Math.abs(active[0].maxDrawdownPct + 22) < 1e-8);
  const complete = cycles(build(rows));
  assert.equal(complete.length, 2);
  const first = complete.find(event => event.id === active[0].id);
  assert.equal(first.status, 'recovered');
  assert.equal(first.endDate, dates[4]);
  assert.equal(first.drawdownPct, 0);
  assert.equal(first.durationDays, 4);
  assert.deepEqual(first.points.map(point => point.date), dates.slice(0, 5));
  assert.equal(complete[0].status, 'active');
  assert.equal(complete[0].peak.date, dates[4]);
});

test('below threshold is not a drawdown event, initial observation is not a high', () => {
  const result = build([row('2026-11-02', 100), row('2026-11-03', 90.01)]);
  assert.equal(cycles(result).length, 0);
  assert.equal(result.events.filter(event => event.metric === 'net_assets').length, 0);
  assert.equal(result.coverage.fullHistory, false);
});

test('consecutive highs merge using the first record date, and input order is immaterial', () => {
  const rows = [row('2026-11-02', 100, { cumulative_pnl_pct: 0 }),
    row('2026-11-03', 101, { cumulative_pnl_pct: 0.01 }), row('2026-11-04', 102, { cumulative_pnl_pct: 0.02 }),
    row('2026-11-05', 102, { cumulative_pnl_pct: 0.02 }), row('2026-11-06', 103, { cumulative_pnl_pct: 0.03 })];
  const result = build(rows);
  const highs = result.events.filter(event => event.metric === 'net_assets');
  assert.equal(highs.length, 2);
  assert.equal(highs[1].id, 'high:net_assets:2026-11-03');
  assert.equal(highs[1].value, 102);
  assert.equal(highs[1].endDate, '2026-11-04');
  assert.deepEqual(result, build([...rows].reverse()));
});

test('deposit interrupts a cycle instead of calling recovery; new segment can form a new cycle', () => {
  const rows = [row('2026-11-02', 100), row('2026-11-03', 80), row('2026-11-04', 150, { cash_event_id: '2', cash_effective_at: '2026-11-04T16:00:00Z' }),
    row('2026-11-05', 130, { cash_event_id: '2', cash_effective_at: '2026-11-04T16:00:00Z' })];
  const result = build(rows, [flow('2026-11-04', 'transfer_in', 70)]);
  const old = cycles(result).find(event => event.peak.date === '2026-11-02');
  assert.equal(old.status, 'interrupted');
  assert.equal(old.endDate, '2026-11-03');
  assert.equal(old.interruptedAt, '2026-11-04');
  assert.equal(old.interruptionReason, 'external_cash_flow');
  assert.equal(old.cashFlowSummary.deltaUsd, 70);
  assert.equal(cycles(result)[0].comparisonScope, '资金变化后重新计起');
  assert.match(result.warnings.join(''), /入金不算恢复/);
});

test('withdrawal is not a loss; balance adjustment and reversal are new interruptions', () => {
  for (const [kind, delta] of [['transfer_out', -40], ['balance_adjustment', -40], ['reversal', -40]]) {
    const result = build([row('2026-11-02', 100), row('2026-11-03', 60)], [flow('2026-11-03', kind, delta)]);
    assert.equal(cycles(result).length, 0, kind);
    assert.equal(result.coverage.interruptionCount, 1, kind);
  }
});

test('cash source change without movement provenance fails closed; same balance cannot hide it', () => {
  const result = build([row('2026-11-02', 100), row('2026-11-03', 80), row('2026-11-04', 120, { cash_event_id: '3' })]);
  assert.equal(cycles(result)[0].status, 'interrupted');
  assert.equal(cycles(result)[0].interruptionReason, 'cash_source_changed');
  assert.equal(result.events.some(event => event.metric === 'net_assets' && event.kind === 'high'), false);
});

test('movement after the 17 ET cutoff affects the following close, not the already completed close', () => {
  const result = build([row('2026-11-02', 100), row('2026-11-03', 80), row('2026-11-04', 120)],
    [flow('2026-11-03', 'transfer_in', 40, { occurred_at: '2026-11-03T22:01:00Z' })]);
  const cycle = cycles(result)[0];
  assert.equal(cycle.trigger.date, '2026-11-03');
  assert.equal(cycle.interruptedAt, '2026-11-04');
  assert.equal(cycle.status, 'interrupted');
});

test('cash movement at 17:00:00.001 ET belongs to the following close, preserving subsecond cutoff', () => {
  const rows = [row('2026-11-02', 100), row('2026-11-03', 80), row('2026-11-04', 120)];
  const after = cycles(build(rows, [flow('2026-11-03', 'transfer_in', 40, { occurred_at: '2026-11-03T22:00:00.001Z' })]));
  assert.equal(after[0].trigger.date, '2026-11-03');
  assert.equal(after[0].interruptedAt, '2026-11-04');
  const at = build(rows, [flow('2026-11-03', 'transfer_in', 40, { occurred_at: '2026-11-03T22:00:00.000Z' })]);
  assert.equal(cycles(at).length, 0);
  assert.equal(at.coverage.interruptions[0].date, '2026-11-03');
});

test('missing trading sessions interrupt, while weekends and exchange holidays do not', () => {
  const missing = build([row('2026-11-02', 100), row('2026-11-03', 80), row('2026-11-05', 120)]);
  assert.equal(cycles(missing)[0].status, 'interrupted');
  assert.equal(cycles(missing)[0].interruptionReason, 'missing_session');
  const holiday = build([row('2026-09-04', 100), row('2026-09-08', 90)]);
  assert.equal(holiday.coverage.interruptionCount, 0);
  assert.equal(cycles(holiday).length, 1);
});

test('invalid net evidence interrupts but does not discard valid report returns or turn null into zero', () => {
  const result = build([row('2026-11-02', 100, { cumulative_pnl_pct: 0 }), row('2026-11-03', 80, { cumulative_pnl_pct: null }),
    row('2026-11-04', 200, { source_version: 'pnl_snapshot_v1', cumulative_pnl_pct: 0.25 }),
    row('2026-11-05', 210, { cumulative_pnl_pct: 0.26 })]);
  assert.equal(result.coverage.netAssetCount, 3);
  assert.equal(cycles(result)[0].status, 'interrupted');
  const high = result.events.find(event => event.metric === 'cumulative_return');
  assert.equal(high.value, 26);
  assert.equal(high.points[1].netAssetsUsd, null);
  assert.equal(high.points[0].cumulativeReturnPct, 0);
  assert.equal(result.events.some(event => event.metric === 'net_assets' && event.date === '2026-11-04'), false);
});

test('net assets can reach zero or be negative without zero-filling missing values', () => {
  const result = build([row('2026-11-02', 100), row('2026-11-03', 0, {
    margin_debt_basis: 'event', margin_debt_event_id: '1', margin_debt_effective_at: '2026-11-01T12:00:00Z',
  }), row('2026-11-04', -20, {
    margin_debt_basis: 'event', margin_debt_event_id: '2', margin_debt_effective_at: '2026-11-01T12:00:00Z',
  })]);
  assert.equal(cycles(result)[0].maxDrawdownPct, -120);
});

test('current incomplete close and invalid lock timestamp are excluded at the 17 ET boundary', () => {
  const rows = [row('2026-11-06', 100, { locked_at: '2026-11-06T22:00:00Z', updated_at: '2026-11-06T22:00:00Z' })];
  assert.equal(build(rows, [], { now: Date.parse('2026-11-06T21:59:59Z') }).coverage.snapshotCount, 0);
  assert.equal(build(rows, [], { now: Date.parse('2026-11-06T22:00:00Z') }).coverage.snapshotCount, 1);
  const invalid = build([row('2026-11-06', 100, { locked_at: 'bad' })]);
  assert.equal(invalid.coverage.snapshotCount, 0);
  const earlyLock = build([row('2026-11-06', 100, { locked_at: '2026-11-06T21:01:00Z' })]);
  assert.equal(earlyLock.coverage.netAssetCount, 0);
});

test('complete periods use report cumulative differences, with a previous-period baseline', () => {
  const dates = sessions('2026-09-30', '2026-11-06');
  const rows = dates.map((date, index) => row(date, 100 + index * 10, {
    cumulative_pnl_pct: 0.2 + index * 0.001, cumulative_pnl_usd: 100 + index * 3,
    daily_pnl_pct: 0.3, daily_pnl_usd: 20,
  }));
  const result = build(rows);
  const periods = result.events.filter(event => event.kind === 'period');
  assert.equal(periods.length, 1);
  assert.equal(periods[0].periodType, 'month');
  assert.equal(periods[0].periodStartDate, '2026-10-01');
  const endIndex = dates.indexOf('2026-10-30');
  assert.ok(Math.abs(periods[0].value - endIndex * 0.1) < 1e-10);
  assert.equal(periods[0].periodPnlUsd, endIndex * 3);
  assert.equal(periods[0].basis, 'pnl_report_period_difference');
  assert.equal(build(rows.filter(item => item.snapshot_date !== '2026-10-12')).events.filter(event => event.kind === 'period').length, 0);
  assert.equal(build(rows.slice(1)).events.filter(event => event.kind === 'period').length, 0);
});

test('quarter and year close only when every expected report observation is present', () => {
  const dates = sessions('2024-12-31', '2025-12-31');
  const rows = dates.map((date, index) => row(date, 100, { cumulative_pnl_pct: index / 1000, cumulative_pnl_usd: index,
    cash_effective_at: '2024-12-01T12:00:00Z' }));
  const periods = build(rows).events.filter(event => event.kind === 'period');
  assert.equal(periods.filter(event => event.periodType === 'year').length, 1);
  assert.equal(periods.filter(event => event.periodType === 'quarter').length, 4);
  const beforeYearClose = build(rows, [], { now: Date.parse('2025-12-31T16:00:00Z') });
  assert.equal(beforeYearClose.events.some(event => event.periodType === 'year'), false);
});

test('daily record titles are bounded to the year and require a prior observation', () => {
  const rows = [row('2026-11-02', 100, { daily_pnl_pct: 0.01 }), row('2026-11-03', 100, { daily_pnl_pct: -0.05 }),
    row('2026-11-04', 100, { daily_pnl_pct: -0.02 }), row('2026-11-05', 100, { daily_pnl_pct: 0.04 })];
  const records = build(rows).events.filter(event => event.kind === 'record');
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(event => event.value), [4, -5]);
  assert.ok(records.every(event => event.comparisonScope === '2026 年已记录交易日'));
});

test('cross-account, malformed cash movements, and duplicate dates fail closed', () => {
  assert.throws(() => build([row('2026-11-02', 100, { user_id: 'other' })]), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.throws(() => build([row('2026-11-02', 100)], [flow('2026-11-03', 'transfer_in', 5, { user_id: 'other' })]), { code: 'REVIEW_ACCOUNT_CHANGED' });
  assert.throws(() => build([row('2026-11-02', 100)], [flow('2026-11-03', 'transfer_in', -5)]), { code: 'REVIEW_CASH_HISTORY_INVALID' });
  assert.throws(() => build([row('2026-11-02', 100), row('2026-11-02', 120)]), { code: 'REVIEW_HISTORY_DUPLICATE' });
  assert.throws(() => build([], [], { now: NaN }), { code: 'REVIEW_CLOCK_INVALID' });
});
