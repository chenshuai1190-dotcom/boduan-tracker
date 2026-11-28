import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReviewActivityTimeZone, deviceReviewActivityTimeZone } from '../src/lib/reviewActivityZone.js';
import { buildReviewJournalWrite, mapReviewJournalRow } from '../src/lib/reviewJournalModel.js';
import { restoreReviewDraft } from '../src/lib/reviewJournalFeed.js';

test('optional activity timezone accepts named zones and ignores malformed or unavailable metadata', () => {
  for (const zone of ['Asia/Shanghai', 'Asia/Seoul', 'America/Argentina/Buenos_Aires', 'Etc/GMT+5', 'UTC']) {
    assert.equal(normalizeReviewActivityTimeZone(' ' + zone + ' '), zone);
  }
  for (const invalid of [null, undefined, 123, {}, '', '+08:00', 'CST', 'America/Imaginary', 'America/'.padEnd(101, 'x')]) {
    assert.equal(normalizeReviewActivityTimeZone(invalid), undefined);
  }
  assert.equal(deviceReviewActivityTimeZone(), normalizeReviewActivityTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));
});

test('private records retain independent post and reply publication zones including restored submission drafts', () => {
  const entry = { type: 'log', date: '2026-11-01', text: 'post', activityTimeZone: 'America/New_York',
    replies: [{ id: 'reply', date: '2026-11-03', text: 'reply', activityTimeZone: 'Europe/London' }] };
  const createdAt = '2026-11-02T03:45:12.345Z';
  const payload = buildReviewJournalWrite(entry, 'owner');
  const mapped = mapReviewJournalRow({ ...payload, created_at: createdAt }, 'log', 'owner');
  assert.equal(mapped.createdAt, createdAt);
  assert.equal(mapped.activityTimeZone, entry.activityTimeZone);
  assert.equal(mapped.replies[0].activityTimeZone, 'Europe/London');
  assert.equal(restoreReviewDraft(entry, 'owner').activityTimeZone, entry.activityTimeZone);
  const legacy = buildReviewJournalWrite({ ...entry, activityTimeZone: null, replies: [] }, 'owner');
  assert.ok(!Object.hasOwn(legacy.review_data, 'activityTimeZone'));
  assert.ok(!Object.hasOwn(mapReviewJournalRow(legacy, 'log'), 'activityTimeZone'));
});
