import test from 'node:test';
import assert from 'node:assert/strict';
import { groupReviewTimelineEvents } from '../src/lib/reviewTimelineGroups.js';

function record(id, metric, start, date, { kind = 'high', amount = 120, rate = 12, priorDate = start, priorAmount = 100, priorRate = 10 } = {}) {
  const annual = metric.startsWith('annual_'), moneyField = annual ? 'annualPnlUsd' : 'cumulativePnlUsd';
  const returnField = annual ? 'annualReturnPct' : 'cumulativeReturnPct';
  const prior = { date: priorDate, [moneyField]: priorAmount, [returnField]: priorRate };
  const current = { date, [moneyField]: amount, [returnField]: rate };
  return { id, kind, metric, title: `${metric} ${kind}`, date, startDate: start, endDate: date,
    value: metric.endsWith('_pnl') ? amount : rate, current, points: [prior, current],
    nodes: [{ key: 'start', label: kind === 'high' ? '此前高点' : '此前低点', point: prior },
      { key: 'current', label: kind === 'high' ? '新高' : '新低', point: current }] };
}
const group = events => groupReviewTimelineEvents(events, { dedupeScopes: false });

test('overlapping runs merge by transitive closure and keep every original comment authority', () => {
  const a = record('amount-first', 'annual_pnl', '2026-11-02', '2026-11-03', { amount: 110, rate: 11, priorDate: '2026-10-30' });
  const b = record('return-middle', 'annual_return', '2026-11-03', '2026-11-05', { amount: 130, rate: 13 });
  const c = record('amount-latest', 'annual_pnl', '2026-11-05', '2026-11-06', { amount: 140, rate: 12 });
  const sources = [a, b, c], before = JSON.stringify(sources);
  const [combined] = group(sources);
  assert.equal(group(sources).length, 1);
  assert.equal(combined.id, a.id);
  assert.equal(combined.anchorEvent, a);
  assert.equal(combined.title, '年内收益新高');
  assert.equal(combined.metric, 'annual_pnl');
  assert.equal(combined.value, 140); assert.equal(combined.returnValue, 12);
  assert.equal(combined.returnField, 'annualReturnPct');
  assert.equal(combined.date, c.date); assert.equal(combined.startDate, a.startDate);
  assert.deepEqual(combined.recordMetrics, ['amount'], 'only the latest actual record is highlighted');
  assert.deepEqual(combined.sourceEventIds, sources.map(event => event.id));
  combined.sourceEvents.forEach((source, index) => assert.equal(source, sources[index]));
  assert.deepEqual(combined.nodes.map(node => node.point.date), ['2026-10-30', '2026-11-03', '2026-11-05', '2026-11-06']);
  assert.equal(combined.points.find(point => point.date === '2026-11-03').annualPnlUsd, 110, 'real current close wins over older start metadata');
  for (const input of [[c, a, b], [b, c, a], [c, b, a]]) assert.deepEqual(group(input), [combined]);
  assert.equal(JSON.stringify(sources), before);
});

test('continuous updates keep the earliest source ID and tied starts prefer the amount event', () => {
  const amount = record('z-amount', 'annual_pnl', '2026-11-02', '2026-11-03');
  const rate = record('a-return', 'annual_return', '2026-11-02', '2026-11-03');
  const first = group([rate, amount])[0];
  const extended = { ...rate, date: '2026-11-06', endDate: '2026-11-06',
    current: { date: '2026-11-06', annualPnlUsd: 115, annualReturnPct: 14 } };
  const next = group([extended, amount])[0];
  assert.equal(first.id, amount.id); assert.equal(next.id, first.id);
  assert.equal(next.anchorEvent, amount);
  assert.deepEqual(first.recordMetrics, ['amount', 'return']);
  assert.deepEqual(next.recordMetrics, ['return']);
  assert.equal(next.value, 115); assert.equal(next.returnValue, 14);
  assert.equal(next.date, '2026-11-06');
});

test('nonoverlapping intervals, years, scopes and directions stay separate', () => {
  const events = [record('one', 'annual_pnl', '2026-11-02', '2026-11-03'),
    record('two', 'annual_return', '2026-11-04', '2026-11-05'),
    record('old-year', 'annual_pnl', '2025-11-02', '2025-11-03'),
    record('low', 'annual_pnl', '2026-11-02', '2026-11-03', { kind: 'low' }),
    record('cumulative', 'cumulative_pnl', '2026-11-02', '2026-11-03')];
  const result = group(events);
  assert.equal(result.length, 5);
  assert.ok(result.every(event => event.sourceEvents.length === 1));
  assert.equal(result.find(event => event.id === 'low').title, '年内收益新低');
  assert.equal(result.find(event => event.id === 'cumulative').title, '累计收益新高');
});

test('single return records project same-day money without replacing missing data with zero or another date', () => {
  const rate = record('rate-only', 'annual_return', '2026-11-02', '2026-11-03', { amount: null, rate: 12 });
  const result = group([rate])[0];
  assert.equal(result.metric, 'annual_pnl'); assert.equal(result.valueType, 'money');
  assert.equal(result.value, null); assert.equal(result.returnValue, 12);
  assert.deepEqual(result.recordMetrics, ['return']);
  assert.equal(result.points.find(point => point.date === '2026-11-03').annualPnlUsd, null);
  assert.equal(result.anchorEvent, rate); assert.equal(rate.metric, 'annual_return');
  const missingCurrent = { ...rate, current: undefined, points: [rate.points[0]], nodes: [], value: 99 };
  assert.equal(group([missingCurrent])[0].returnValue, null, 'raw value is not invented as a missing close');
  assert.equal(group([missingCurrent])[0].value, null);
  assert.equal(group([record('zero', 'annual_pnl', '2026-11-02', '2026-11-03', { amount: 0, rate: 0 })])[0].value, 0);
});

test('group settings use OR membership before grouping without mutating persisted raw switches', () => {
  const earnings = [record('pnl', 'annual_pnl', '2026-11-02', '2026-11-03'),
    record('rate', 'annual_return', '2026-11-02', '2026-11-03')];
  for (const selected of [['annual_pnl_high'], ['annual_return_high'], ['annual_return_high', 'annual_pnl_high']]) {
    const eventTypes = Object.freeze(selected), result = groupReviewTimelineEvents(earnings, { eventTypes });
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].sourceEventIds, ['pnl', 'rate']);
    assert.deepEqual(eventTypes, selected);
  }
  assert.deepEqual(groupReviewTimelineEvents(earnings, { eventTypes: [] }), []);
  assert.deepEqual(groupReviewTimelineEvents(earnings, { eventTypes: ['annual_pnl_low'] }), []);
  const drawdown = { id: 'drawdown', kind: 'drawdown', metric: 'net_assets', date: '2026-11-06' };
  assert.equal(groupReviewTimelineEvents([...earnings, drawdown], { eventTypes: ['drawdown'] })[0], drawdown);
  assert.equal(groupReviewTimelineEvents([...earnings, drawdown]).length, 2);
});

test('same-date identical annual and cumulative records merge under the annual anchor only for matching record metrics', () => {
  const events = ['annual_pnl', 'annual_return', 'cumulative_pnl', 'cumulative_return']
    .map(metric => record(metric, metric, '2026-11-02', '2026-11-06'));
  const [combined] = groupReviewTimelineEvents(events);
  assert.equal(groupReviewTimelineEvents(events).length, 1);
  assert.equal(combined.id, 'annual_pnl'); assert.equal(combined.anchorEvent, events[0]);
  assert.equal(combined.title, '年内·累计收益新高');
  assert.deepEqual(combined.scopeKeys, ['annual', 'cumulative']);
  assert.deepEqual(combined.scopeRecordMetrics, { annual: ['amount', 'return'], cumulative: ['amount', 'return'] });
  assert.deepEqual(combined.nodes.map(node => node.label), ['此前高点', '新高']);
  assert.ok(combined.nodes.every(node => node.sourceNodes.length === 2));
  assert.deepEqual(new Set(combined.sourceEventIds), new Set(events.map(event => event.id)));
  assert.deepEqual(groupReviewTimelineEvents([...events].reverse()), [combined]);
  const mismatch = [events[0], events[3]];
  assert.equal(groupReviewTimelineEvents(mismatch).length, 2, 'different record metrics cannot imply both scopes broke the same records');
});

test('cross-scope deduplication rejects display-rounding matches, missing readings, different days and low events', () => {
  const annual = record('annual', 'annual_pnl', '2026-11-02', '2026-11-06');
  for (const options of [{ amount: 120.001 }, { rate: 12.001 }, { amount: null }, { rate: null }, { amount: NaN }, { amount: '120' }]) {
    const cumulative = record('cumulative', 'cumulative_pnl', '2026-11-02', '2026-11-06', options);
    assert.equal(groupReviewTimelineEvents([annual, cumulative]).length, 2);
  }
  const earlier = record('earlier', 'cumulative_pnl', '2026-11-02', '2026-11-05');
  assert.equal(groupReviewTimelineEvents([annual, earlier]).length, 2);
  const low = { ...annual, kind: 'low' };
  assert.equal(groupReviewTimelineEvents([low, { ...earlier, date: annual.date }]).length, 2);
  const floatNoise = record('noise', 'cumulative_pnl', '2026-11-02', '2026-11-06', { amount: 120 + Number.EPSILON * 120, rate: 12 + Number.EPSILON * 12 });
  assert.equal(groupReviewTimelineEvents([annual, floatNoise]).length, 1);
});

test('cross-scope history preserves unique nodes and never draws cumulative history as annual data', () => {
  const annual = record('annual', 'annual_pnl', '2026-11-02', '2026-11-06', { priorDate: '2026-10-30', priorAmount: 80, priorRate: 8 });
  const cumulative = record('cumulative', 'cumulative_pnl', '2026-11-02', '2026-11-06', { priorDate: '2026-10-29', priorAmount: 110, priorRate: 11 });
  const [combined] = groupReviewTimelineEvents([annual, cumulative]);
  assert.deepEqual(combined.points.map(point => point.date), ['2026-10-29', '2026-10-30', '2026-11-06']);
  const priorCumulative = combined.points[0];
  assert.equal(priorCumulative.cumulativePnlUsd, 110);
  assert.equal(priorCumulative.annualPnlUsd, null); assert.equal(priorCumulative.annualReturnPct, null);
  const cumulativeNode = combined.nodes.find(node => node.point.date === '2026-10-29');
  assert.deepEqual(cumulativeNode.scopeKeys, ['cumulative']);
  assert.match(cumulativeNode.label, /累计/);
  assert.equal(cumulativeNode.sourceNodes[0].point.cumulativePnlUsd, 110);
  assert.equal(combined.points[1].annualPnlUsd, 80);
  assert.equal(combined.sourceEvents.find(event => event.id === cumulative.id), cumulative);
});

test('archive pointers keep independent original containers and live copies win duplicate source IDs', () => {
  const live = record('same-id', 'annual_pnl', '2026-11-02', '2026-11-03');
  const archived = { id: live.id, kind: 'high', metric: 'annual_pnl', date: '2026-12-01', status: 'archived' };
  const otherArchive = { ...archived, id: 'old-comment-container' };
  for (const input of [[archived, live, otherArchive], [otherArchive, live, archived]]) {
    const result = groupReviewTimelineEvents(input);
    assert.equal(result.length, 2);
    assert.equal(result.find(event => event.id === otherArchive.id), otherArchive);
    assert.equal(result.find(event => event.id === live.id).anchorEvent, live);
    assert.deepEqual(result.find(event => event.id === live.id).sourceEventIds, [live.id]);
  }
});
