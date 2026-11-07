import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeReviewTimelineFeed, reviewTimelineCategory, reviewTimelineFeedDate } from '../src/lib/reviewTimelineFeed.js';
import { convertReviewMoney, formatReviewMoney, reviewCurrencyNotice, reviewDisplayCurrency } from '../src/lib/reviewDisplayCurrency.js';
import { DEFAULT_REVIEW_PREFERENCES, REVIEW_TIMELINE_TYPES } from '../src/lib/reviewPreferences.js';

const high = { id: 'high:net_assets:2026-10-01', kind: 'high', metric: 'net_assets', title: '净资产创新高', startDate: '2026-10-01', date: '2026-10-06' };
const drawdown = { id: 'drawdown:net_assets:2026-10-06', kind: 'drawdown', metric: 'net_assets', title: '净资产回落', startDate: '2026-10-06', trigger: { date: '2026-10-08' }, date: '2026-11-06', status: 'active' };
const period = type => ({ id: `period:${type}:2026-01-01`, kind: 'period', metric: 'period_return', date: '2026-09-30', periodType: type });
const events = [high, { ...high, id: 'return', metric: 'cumulative_return' }, { ...high, id: 'profit', metric: 'cumulative_pnl' }, drawdown,
  { id: 'daily', kind: 'record', metric: 'daily_return', date: '2026-10-03' }, ...['month', 'quarter', 'year'].map(period)];

test('every setting category maps to exactly its existing timeline event family', () => {
  assert.deepEqual(events.map(reviewTimelineCategory), REVIEW_TIMELINE_TYPES.map(type => type.id));
  for (const [index, type] of REVIEW_TIMELINE_TYPES.entries()) {
    const result = mergeReviewTimelineFeed([], events, { ...DEFAULT_REVIEW_PREFERENCES, eventTypes: [type.id] });
    assert.deepEqual(result.map(row => row.event), [events[index]]);
  }
  assert.equal(reviewTimelineCategory({ ...period('month'), periodType: undefined }), 'month');
  assert.equal(reviewTimelineCategory({ kind: 'period', metric: 'period_return', periodType: 'day' }), null);
  assert.equal(reviewTimelineCategory({ kind: 'high', metric: 'missing' }), null);
});

test('daily refreshes never bump a continuing high or drawdown in the all feed', () => {
  assert.equal(reviewTimelineFeedDate(high), '2026-10-01');
  assert.equal(reviewTimelineFeedDate(drawdown), '2026-10-08');
  assert.equal(reviewTimelineFeedDate({ ...drawdown, status: 'recovered', date: '2026-12-01' }), '2026-10-08');
  assert.equal(reviewTimelineFeedDate({ ...drawdown, trigger: null, nodes: [{ key: 'trigger', point: { date: '2026-10-08' } }] }), '2026-10-08');
  assert.equal(reviewTimelineFeedDate({ ...high, startDate: '2026-02-30' }), '2026-10-06');
  const post = { type: 'log', id: 'journal', date: '2026-10-08', text: '耐心' };
  const result = mergeReviewTimelineFeed([post], [high, drawdown], DEFAULT_REVIEW_PREFERENCES);
  assert.deepEqual(result.map(row => row.id), ['journal', drawdown.id, high.id]);
  assert.equal(result[0], post); assert.equal(result[1].event, drawdown);
});

test('one event produces one projection and preserves the live event over archived references', () => {
  const older = { ...drawdown, date: '2026-10-20' };
  const archived = { ...drawdown, date: '2026-12-01', status: 'archived', title: '过时标题' };
  for (const order of [[older, drawdown, archived], [archived, drawdown, older]]) {
    const result = mergeReviewTimelineFeed([], order, DEFAULT_REVIEW_PREFERENCES);
    assert.equal(result.length, 1); assert.equal(result[0].event, drawdown);
  }
  assert.equal(mergeReviewTimelineFeed([], [archived, drawdown], DEFAULT_REVIEW_PREFERENCES, { query: '过时标题' }).length, 0);
});

test('visibility is presentation only and the same query searches posts and system events', () => {
  const post = Object.freeze({ type: 'log', id: 'post', date: '2026-10-06', text: '耐心', stocks: ['NVDA'], replies: [{ text: '坚持' }] });
  const evaluation = Object.freeze({ type: 'log', id: 'saved-reflection', date: '2026-10-06', timelineEvent: high });
  const frozenEvent = Object.freeze({ ...high });
  assert.deepEqual(mergeReviewTimelineFeed([post, evaluation], [frozenEvent], { ...DEFAULT_REVIEW_PREFERENCES, showTimeline: false }), [post]);
  assert.deepEqual(mergeReviewTimelineFeed([post], [frozenEvent], { ...DEFAULT_REVIEW_PREFERENCES, eventTypes: [] }), [post]);
  assert.deepEqual(mergeReviewTimelineFeed([post], [frozenEvent], undefined), [post]);
  assert.equal(mergeReviewTimelineFeed([post], events, DEFAULT_REVIEW_PREFERENCES, { query: 'nvda' })[0], post);
  assert.equal(mergeReviewTimelineFeed([post], events, DEFAULT_REVIEW_PREFERENCES, { query: '坚持' })[0], post);
  assert.equal(mergeReviewTimelineFeed([post], [drawdown], DEFAULT_REVIEW_PREFERENCES, { query: '恢复中' })[0].event, drawdown);
  assert.equal(mergeReviewTimelineFeed([post], [high], DEFAULT_REVIEW_PREFERENCES, { query: '2026-10-01' })[0].event, high);
});

test('currency conversion changes displayed USD account balances only with a verified positive numeric rate', () => {
  assert.equal(formatReviewMoney(1250), '$1,250.00');
  assert.equal(formatReviewMoney(1250.456), '$1,250.46');
  assert.equal(formatReviewMoney(0), '$0.00');
  const currency = { displayCurrency: 'CNY', usdCny: 7.2, fxDate: '2026-11-07T08:03:00Z' };
  assert.equal(convertReviewMoney(1250, currency), 9000);
  assert.equal(formatReviewMoney(1250, currency), '¥9,000.00');
  assert.equal(formatReviewMoney(1250.456, currency), '¥9,003.28');
  assert.equal(formatReviewMoney(-1250, { ...currency, signed: true }), '-¥9,000.00');
  assert.equal(formatReviewMoney(1250, { ...currency, signed: true }), '+¥9,000.00');
  assert.equal(formatReviewMoney(0, currency), '¥0.00');
  assert.equal(reviewDisplayCurrency(currency).date, '2026-11-07');
  assert.match(reviewCurrencyNotice(currency), /汇率更新于 2026-11-07.*美元报表口径/);
  assert.equal(reviewCurrencyNotice(), '');
});

test('unavailable/invalid FX and missing/overflow balances never masquerade as CNY values', () => {
  for (const usdCny of [undefined, null, 0, -1, '7.2', NaN, Infinity]) {
    const options = { displayCurrency: 'CNY', usdCny };
    assert.equal(convertReviewMoney(100, options), null);
    assert.equal(formatReviewMoney(100, options), '—');
    assert.equal(reviewDisplayCurrency(options).available, false);
    assert.match(reviewCurrencyNotice(options), /汇率暂不可用/);
  }
  for (const amount of [undefined, null, NaN, Infinity, '100']) assert.equal(formatReviewMoney(amount), '—');
  assert.equal(formatReviewMoney(Number.MAX_VALUE, { displayCurrency: 'CNY', usdCny: 100 }), '—');
  assert.equal(reviewDisplayCurrency({ displayCurrency: 'JPY', usdCny: 7.2 }).currency, 'USD');
});
