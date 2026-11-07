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

test('fresh data moves a continuing event forward without changing its ID or original start', () => {
  assert.equal(reviewTimelineFeedDate(high), '2026-10-06');
  assert.equal(reviewTimelineFeedDate(drawdown), '2026-11-06');
  assert.equal(reviewTimelineFeedDate({ ...drawdown, status: 'recovered', date: '2026-12-01' }), '2026-12-01');
  const post = { type: 'log', id: 'journal', date: '2026-11-01', text: '耐心' };
  const before = { ...drawdown, date: '2026-10-20' };
  assert.deepEqual(mergeReviewTimelineFeed([post], [high, before], DEFAULT_REVIEW_PREFERENCES).map(row => row.id), ['journal', drawdown.id, high.id]);
  const result = mergeReviewTimelineFeed([post], [high, before, drawdown], DEFAULT_REVIEW_PREFERENCES);
  assert.deepEqual(result.map(row => row.id), [drawdown.id, 'journal', high.id]);
  assert.equal(result[0].event, drawdown); assert.equal(result[1], post);
  assert.equal(result[0].date, drawdown.date);
  assert.equal(result[0].id, before.id);
  assert.equal(result[0].event.startDate, before.startDate);
  assert.equal(result[0].event.trigger, before.trigger);
});

test('feed dates prefer valid actual data dates and fall back through end and original start dates', () => {
  assert.equal(reviewTimelineFeedDate({ ...drawdown, endDate: '2026-12-01' }), drawdown.date);
  for (const invalid of [undefined, null, '', 'not-a-date', '2026-02-30']) {
    assert.equal(reviewTimelineFeedDate({ ...drawdown, date: invalid, endDate: '2026-11-04' }), '2026-11-04');
    assert.equal(reviewTimelineFeedDate({ ...drawdown, date: invalid, endDate: '2026-02-30' }), drawdown.trigger.date);
    assert.equal(reviewTimelineFeedDate({ ...high, date: invalid, endDate: 'invalid' }), high.startDate);
  }
  const withoutDate = { ...drawdown, date: '', endDate: '', trigger: { date: '2026-02-30' }, nodes: [{ key: 'trigger', point: { date: '2026-10-09' } }] };
  assert.equal(reviewTimelineFeedDate(withoutDate), '2026-10-09');
  const invalid = { ...withoutDate, nodes: [] };
  assert.equal(reviewTimelineFeedDate(invalid), '', 'the prior peak is not a substitute for an unknown drawdown date');
  assert.equal(reviewTimelineFeedDate({ ...high, date: '', endDate: '', startDate: 'invalid' }), '');
  assert.deepEqual(mergeReviewTimelineFeed([], [invalid], DEFAULT_REVIEW_PREFERENCES), []);
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
  assert.equal(mergeReviewTimelineFeed([], [high], DEFAULT_REVIEW_PREFERENCES, { query: '2026-10-06' })[0].event, high);
});

test('each new-high family displays the latest data date even when its original start date is older', () => {
  const latest = ['net_assets', 'cumulative_return', 'cumulative_pnl'].map(metric => ({
    ...high, id: `high:${metric}:latest`, metric, startDate: '2026-07-01', date: '2026-11-06',
  }));
  const older = latest.map(event => ({ ...event, id: `${event.id}:older`, startDate: '2026-10-01', date: '2026-10-30' }));
  for (const input of [[...older, ...latest], [...latest, ...older].reverse()]) {
    const result = mergeReviewTimelineFeed([], input, DEFAULT_REVIEW_PREFERENCES);
    assert.equal(result.length, 3);
    for (const event of latest) {
      const row = result.find(item => reviewTimelineCategory(item.event) === reviewTimelineCategory(event));
      assert.equal(row.event, event);
      assert.equal(row.date, '2026-11-06');
      assert.equal(row.event.startDate, '2026-07-01', 'the underlying high still retains its original start');
    }
  }
});

test('only the latest drawdown cycle appears and updates or recovery keep its original identity', () => {
  const olderCycle = { ...drawdown, id: 'drawdown:older', date: '2026-10-20', status: 'recovered' };
  const active = { ...drawdown, id: 'drawdown:latest', startDate: '2026-10-25', trigger: { date: '2026-11-02' }, date: '2026-11-05' };
  const recovered = { ...active, date: '2026-11-06', status: 'recovered' };
  for (const input of [[olderCycle, active, recovered], [recovered, olderCycle, active]]) {
    const result = mergeReviewTimelineFeed([], input, DEFAULT_REVIEW_PREFERENCES);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, active.id);
    assert.equal(result[0].event, recovered);
    assert.equal(result[0].date, recovered.date);
    assert.equal(result[0].event.trigger, active.trigger);
  }
});

test('daily best and worst records each retain their latest event while legacy directionless records remain separate', () => {
  const daily = events.find(event => event.id === 'daily');
  const best = { ...daily, id: 'daily:best:new', recordDirection: 'best', date: '2026-11-05', value: 3 };
  const worst = { ...daily, id: 'daily:worst:new', recordDirection: 'worst', date: '2026-11-06', value: -3 };
  const bestOld = { ...best, id: 'daily:best:old', date: '2026-09-01', value: 20 };
  const worstOld = { ...worst, id: 'daily:worst:old', date: '2026-09-02', value: -20 };
  const legacy = { ...daily, id: 'daily:legacy:new', date: '2026-11-04' };
  const result = mergeReviewTimelineFeed([], [bestOld, worst, daily, best, worstOld, legacy], DEFAULT_REVIEW_PREFERENCES);
  assert.deepEqual(result.map(row => row.event), [worst, best, legacy]);
  assert.deepEqual(mergeReviewTimelineFeed([], [daily], DEFAULT_REVIEW_PREFERENCES).map(row => row.event), [daily]);
  const onlyDaily = { ...DEFAULT_REVIEW_PREFERENCES, eventTypes: ['daily_record'] };
  assert.deepEqual(mergeReviewTimelineFeed([], [high, bestOld, best, worstOld, worst], onlyDaily).map(row => row.event), [worst, best]);
  assert.deepEqual(mergeReviewTimelineFeed([], [best, worst], { ...onlyDaily, eventTypes: [] }), []);
});

test('daily branches retain their direction for archived IDs and older value-only events', () => {
  const daily = events.find(event => event.id === 'daily');
  const best = { ...daily, id: 'record:2026-11-05:best', date: '2026-11-05', recordDirection: 'best', value: 5 };
  const archive = { ...daily, id: 'record:2026-11-06:best', date: '2026-11-06', status: 'archived', value: null };
  const worst = { ...daily, id: 'legacy-negative', date: '2026-11-04', value: -5 };
  const oldBest = { ...daily, id: 'legacy-positive', date: '2026-11-03', value: 3 };
  assert.deepEqual(mergeReviewTimelineFeed([], [archive, worst, oldBest, best], DEFAULT_REVIEW_PREFERENCES).map(row => row.event), [best, worst]);
  assert.deepEqual(mergeReviewTimelineFeed([], [archive], DEFAULT_REVIEW_PREFERENCES).map(row => row.event), [archive]);
});

test('month quarter and year each show only the latest completed period', () => {
  const latest = ['month', 'quarter', 'year'].map(type => ({ ...period(type), id: `period:${type}:new`, date: '2026-10-30', value: -2 }));
  const older = latest.map(event => ({ ...event, id: `${event.id}:old`, date: '2026-09-30', value: 20 }));
  const result = mergeReviewTimelineFeed([], [...older, ...latest], DEFAULT_REVIEW_PREFERENCES);
  assert.equal(result.length, 3);
  for (const event of latest) assert.equal(result.find(row => reviewTimelineCategory(row.event) === event.periodType)?.event, event);
});

test('live records win both identity deduplication and branch selection, with archives used only as fallback', () => {
  const live = { ...high, id: 'high:live', date: '2026-10-20' };
  const sameIdArchive = { ...live, date: '2026-12-30', status: 'archived', title: '过时副本' };
  const otherArchive = { ...live, id: 'high:other-archive', date: '2026-12-31', status: 'archived' };
  const oldLive = { ...live, id: 'high:older-live', date: '2026-10-10' };
  const archive = { ...period('month'), id: 'period:month:archive', status: 'archived', date: '2026-11-01' };
  const oldArchive = { ...archive, id: 'period:month:older-archive', date: '2026-10-01' };
  const input = [sameIdArchive, oldLive, archive, otherArchive, live, oldArchive];
  for (const order of [input, [...input].reverse()]) {
    const result = mergeReviewTimelineFeed([], order, DEFAULT_REVIEW_PREFERENCES);
    assert.equal(result.length, 2);
    assert.equal(result.find(row => reviewTimelineCategory(row.event) === 'net_assets_high').event, live);
    assert.equal(result.find(row => reviewTimelineCategory(row.event) === 'month').event, archive);
  }
});

test('search filters already selected branches and never revives an older matching system card', () => {
  const older = { ...high, title: '仅旧卡匹配', date: '2026-10-06' };
  const latest = { ...high, id: 'high:latest', title: '最新净资产高点', date: '2026-11-06' };
  const post = { type: 'log', id: 'post', date: '2026-10-06', text: '仅旧卡匹配', replies: [] };
  assert.deepEqual(mergeReviewTimelineFeed([post], [older, latest], DEFAULT_REVIEW_PREFERENCES, { query: '仅旧卡匹配' }), [post]);
  assert.deepEqual(mergeReviewTimelineFeed([], [older, latest], DEFAULT_REVIEW_PREFERENCES, { query: '2026-10-06' }), []);
  assert.equal(mergeReviewTimelineFeed([], [older, latest], DEFAULT_REVIEW_PREFERENCES, { query: '最新净资产' })[0].event, latest);
});

test('same-day branch selection is deterministic by start or trigger date then event ID', () => {
  const highEarly = { ...high, id: 'high:z-early', date: '2026-11-06', startDate: '2026-09-01' };
  const highA = { ...highEarly, id: 'high:a', startDate: '2026-10-01' };
  const highZ = { ...highA, id: 'high:z' };
  const cycleEarly = { ...drawdown, id: 'drawdown:z-early', startDate: '2026-10-20', trigger: { date: '2026-10-21' } };
  const cycleA = { ...cycleEarly, id: 'drawdown:a', startDate: '2026-10-01', trigger: { date: '2026-10-22' } };
  const cycleZ = { ...cycleA, id: 'drawdown:z' };
  const source = [highA, cycleZ, highEarly, cycleA, highZ, cycleEarly];
  const expected = [cycleZ.id, highZ.id];
  for (let offset = 0; offset < source.length; offset++) {
    const order = [...source.slice(offset), ...source.slice(0, offset)];
    for (const input of [order, [...order].reverse()]) {
      assert.deepEqual(mergeReviewTimelineFeed([], input, DEFAULT_REVIEW_PREFERENCES).map(row => row.id), expected);
    }
  }
});

test('branch projection and settings never mutate saved events or move their comment references', () => {
  const older = Object.freeze({ ...high });
  const latest = Object.freeze({ ...high, id: 'high:latest', date: '2026-11-06' });
  const replies = Object.freeze([Object.freeze({ id: 'reply', text: '保持纪律' })]);
  const reflection = Object.freeze({ type: 'log', id: 'reflection', date: high.date, timelineEvent: older, replies });
  const post = Object.freeze({ type: 'log', id: 'post', date: '2026-11-01', text: '观察', replies });
  const entries = Object.freeze([reflection, post]), source = Object.freeze([older, latest]);
  const before = JSON.stringify({ entries, source });
  const result = mergeReviewTimelineFeed(entries, source, DEFAULT_REVIEW_PREFERENCES);
  assert.equal(result.find(row => row.type === 'timeline').event, latest);
  assert.equal(result.find(row => row.type === 'log'), post);
  assert.equal(reflection.timelineEvent, older);
  assert.equal(reflection.replies, replies);
  assert.equal(post.replies, replies);
  assert.deepEqual(mergeReviewTimelineFeed(entries, source, { ...DEFAULT_REVIEW_PREFERENCES, showTimeline: false }), [post]);
  assert.deepEqual(mergeReviewTimelineFeed(entries, source, { ...DEFAULT_REVIEW_PREFERENCES, eventTypes: ['drawdown'] }), [post]);
  assert.equal(JSON.stringify({ entries, source }), before);
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
