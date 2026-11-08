import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReviewFeedUnreadPreview, REVIEW_FEED_PREVIEW_OWNER as owner } from '../src/dev/reviewFeedUnreadPreview.js';

test('local unread fixture shares the production contract and preserves arrivals beyond a captured boundary', async () => {
  const fixture = createReviewFeedUnreadPreview();
  const before = await fixture.db.fetchReviewFeedUnread(owner);
  assert.deepEqual(before, { unreadCount: 2, cursor: '2' });
  fixture.publish('insight:sample-fresh-post');
  const after = await fixture.db.markReviewFeedSeen(before.cursor, owner);
  assert.deepEqual(after, { unreadCount: 1, cursor: '3' });
  assert.deepEqual(await fixture.db.markReviewFeedSeen(after.cursor, owner), { unreadCount: 0, cursor: '3' });
  fixture.withdraw('insight:sample-fresh-post'); fixture.publish('insight:sample-fresh-post');
  assert.equal((await fixture.db.fetchReviewFeedUnread(owner)).unreadCount, 0, 'republication does not create duplicate arrival');
});

test('preview count excludes self/system posts, withdrawn posts, and another account', async () => {
  const fixture = createReviewFeedUnreadPreview();
  await fixture.db.markReviewFeedSeen('2', owner);
  fixture.publish('own', { authorId: owner }); fixture.publish('system', { system: true });
  assert.equal((await fixture.db.fetchReviewFeedUnread(owner)).unreadCount, 0);
  fixture.publish('new'); assert.equal((await fixture.db.fetchReviewFeedUnread(owner)).unreadCount, 1);
  fixture.withdraw('new'); assert.equal((await fixture.db.fetchReviewFeedUnread(owner)).unreadCount, 0);
  await assert.rejects(fixture.db.fetchReviewFeedUnread('other'), /预览账户不匹配/);
  await assert.rejects(fixture.db.markReviewFeedSeen('500', owner), /读取边界无效/);
});

test('DEV shell invokes the real unread hook with isolated API and the same solid badge', () => {
  const shell = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
  assert.match(shell,/useReviewFeedUnread\(\{ db: reviewFeedUnreadPreview\.db/);
  assert.match(shell,/enabled: reviewUnreadPreviewEnabled/);
  assert.match(shell,/reviewFeedUnread=\{reviewUnreadPreviewEnabled \? reviewFeedUnread : undefined\}/);
  assert.match(shell,/className="report-bottom-nav-new-posts"/);
  const fixture = readFileSync(new URL('../src/dev/reviewFeedUnreadPreview.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fixture,/fetch\(|localStorage|sessionStorage|supabase|process\.env|service_role/i);
});
