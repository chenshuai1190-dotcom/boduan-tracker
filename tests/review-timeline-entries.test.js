import test from 'node:test';
import assert from 'node:assert/strict';
import { findReviewEntryByKey, projectReviewTimelineEntry, resolveReviewReplySource, resolveReviewTimelineEvent,
  reviewTimelineAnchorEntry, reviewTimelineReplyKey } from '../src/lib/reviewTimelineEntries.js';

const event = (metric, date = '2026-10-06') => ({ id: `high:${metric}:${date}`, kind: 'high', metric,
  date, startDate: date, title: `${metric} new high`, points: [], nodes: [] });
const reply = (id, date, text, createdAt) => ({ id, date, text, ...(createdAt ? { createdAt } : {}) });
const container = (id, source, replies = []) => ({ id, type: 'log', date: source.startDate,
  text: source.title, revision: 3, replies, timelineEvent: { version: 1, id: source.id,
    kind: source.kind, metric: source.metric, date: source.startDate, title: source.title } });
const group = sources => ({ ...sources[0], title: '收益新高', anchorEvent: sources[0],
  sourceEventIds: sources.map(source => source.id), sourceEvents: sources });

test('group replies retain original containers, distinct duplicate IDs and chronological order', () => {
  const amount = event('cumulative_pnl'), rate = event('cumulative_return');
  const sources = [container('amount-container', amount, [reply('same', '2026-11-07', 'amount', '2026-11-07T11:00:00Z')]),
    container('rate-container', rate, [reply('same', '2026-11-07', 'rate', '2026-11-07T10:00:00Z'), reply('older', '2026-11-06', 'older')])];
  const before = structuredClone(sources);
  const projection = projectReviewTimelineEntry(group([amount, rate]), sources);
  assert.deepEqual(projection.replies.map(item => item.text), ['older', 'rate', 'amount']);
  assert.equal(new Set(projection.replies.map(reviewTimelineReplyKey)).size, 3);
  for (const projected of projection.replies) {
    const source = resolveReviewReplySource(projection, projected, sources);
    assert.equal(source.entry, sources.find(item => item.id === projected.timelineReplySource.entryId));
    assert.deepEqual(source.reply, source.entry.replies.find(item => item.id === projected.id));
    assert.equal(source.reply.timelineReplySource, undefined, 'display provenance never enters a stored reply');
  }
  assert.deepEqual(sources, before);
});

test('append resolves only the original anchor container and never receives grouped replies', () => {
  const amount = event('cumulative_pnl'), rate = event('cumulative_return'), grouped = group([amount, rate]);
  const stored = [container('amount', amount, [reply('a', amount.date, 'amount')]), container('rate', rate, [reply('r', rate.date, 'rate')])];
  const projection = projectReviewTimelineEntry(grouped, stored);
  const writable = reviewTimelineAnchorEntry(grouped, stored);
  assert.equal(projection.replies.length, 2);
  assert.equal(writable, stored[0]);
  assert.deepEqual(writable.replies.map(item => item.id), ['a']);
  assert.equal(writable.timelineEvent.title, amount.title);
  const fresh = reviewTimelineAnchorEntry(grouped, stored.slice(1));
  assert.equal(fresh.id, undefined);
  assert.deepEqual(fresh.replies, []);
  assert.equal(fresh.timelineEvent.id, amount.id);
  assert.equal(fresh.timelineEvent.metric, 'cumulative_pnl');
  assert.equal(fresh.timelineEvent.title, amount.title);
  assert.equal(fresh.timelineEvent.date, amount.startDate);
});

test('every member route resolves the full group independent of the enabled feed scope', () => {
  const amount = event('cumulative_pnl'), annual = event('annual_pnl'), grouped = group([amount, annual]);
  const projected = projectReviewTimelineEntry(grouped);
  for (const source of [amount, annual]) {
    assert.equal(resolveReviewTimelineEvent([grouped], source.id), grouped);
    assert.equal(findReviewEntryByKey([projected], `timeline:${source.id}`), projected);
  }
  assert.equal(findReviewEntryByKey([projected], 'timeline:missing'), null);
  assert.equal(findReviewEntryByKey([projected], null), null);
});

test('splitting a previous cross-scope group retains each original reply without moving data', () => {
  const total = event('cumulative_pnl'), annual = event('annual_pnl');
  const stored = [container('total', total, [reply('same', total.date, 'total')]), container('annual', annual, [reply('same', annual.date, 'annual')])];
  const combined = projectReviewTimelineEntry(group([total, annual]), stored);
  const split = [projectReviewTimelineEntry(total, stored), projectReviewTimelineEntry(annual, stored)];
  assert.deepEqual(split.map(item => item.replies.map(row => row.text)), [['total'], ['annual']]);
  const annualReply = combined.replies.find(item => item.text === 'annual');
  assert.equal(resolveReviewReplySource(split[0], annualReply, stored), null);
  assert.equal(resolveReviewReplySource(split[1], annualReply, stored).entry, stored[1]);
  assert.equal(findReviewEntryByKey(split, `timeline:${annual.id}`), split[1]);
});

test('continuous event extension preserves comment sources and the original reference date', () => {
  const source = event('annual_pnl');
  const stored = [container('stored', source, [reply('one', source.date, 'original')])];
  const extended = { ...source, date: '2026-10-09', endDate: '2026-10-09' };
  assert.equal(reviewTimelineAnchorEntry(group([extended]), stored), stored[0]);
  const projection = projectReviewTimelineEntry(group([extended]), stored);
  assert.equal(projection.timelineEvent.date, '2026-10-06');
  assert.equal(resolveReviewReplySource(projection, projection.replies[0], stored).entry, stored[0]);
});

test('archived references preserve original financial identity and their comments', () => {
  const source = { ...event('cumulative_return'), status: 'archived', value: null };
  const stored = [container('archive', source, [reply('one', source.date, 'keep')])];
  const projection = projectReviewTimelineEntry(source, stored);
  assert.equal(projection.replies.length, 1);
  assert.equal(reviewTimelineAnchorEntry(source, stored).timelineEvent, stored[0].timelineEvent);
  assert.deepEqual(resolveReviewReplySource(projection, projection.replies[0], stored).reply, stored[0].replies[0]);
});

test('missing or replaced source containers and replies fail closed', () => {
  const source = event('cumulative_pnl');
  const original = container('original', source, [reply('same', source.date, 'original')]);
  const replacement = container('replacement', source, [reply('same', source.date, 'replacement')]);
  const projection = projectReviewTimelineEntry(source, [original]);
  const projected = projection.replies[0];
  assert.equal(resolveReviewReplySource(projection, projected, [replacement]), null);
  assert.equal(resolveReviewReplySource(projection, projected, [{ ...original, replies: [] }]), null);
  assert.equal(resolveReviewReplySource(projection, { id: 'same' }, [original]), null);
});

test('ordinary journal routing retains its existing entry and reply references', () => {
  const entry = { id: 'plain', type: 'log', replies: [reply('one', '2026-11-07', 'plain')] };
  assert.equal(findReviewEntryByKey([entry], 'log:plain'), entry);
  assert.equal(resolveReviewReplySource(entry, entry.replies[0]).entry, entry);
  assert.equal(resolveReviewReplySource(entry, entry.replies[0]).reply, entry.replies[0]);
  assert.equal(reviewTimelineReplyKey(entry.replies[0]), 'one');
});

test('concurrent local refresh cannot replace the original reply used by repository conflict checks', () => {
  const source = event('annual_pnl');
  const original = container('source', source, [reply('one', source.date, 'the text the user saw')]);
  const projection = projectReviewTimelineEntry(source, [original]);
  const updated = { ...original, revision: 4, replies: [{ ...original.replies[0], text: 'another device changed this' }] };
  const resolved = resolveReviewReplySource(projection, projection.replies[0], [updated]);
  assert.equal(resolved.entry, updated, 'the correct latest container can still be read');
  assert.deepEqual(resolved.reply, original.replies[0], 'the original expected payload must not silently advance');
  assert.notDeepEqual(resolved.reply, updated.replies[0], 'repository CAS will reject the concurrent edit');
  assert.equal(resolved.reply.timelineReplySource, undefined);
  const plain = { id: 'plain', type: 'log', replies: original.replies };
  assert.equal(resolveReviewReplySource({ ...plain, replies: updated.replies }, plain.replies[0]).reply, plain.replies[0]);
});
