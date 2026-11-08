import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReviewPublicPreview } from '../src/dev/reviewPublicPreview.js';
import { createReviewNotificationPreview } from '../src/dev/reviewNotificationPreview.js';

const ownerId = 'sample-owner';
const preview = (notifications = false) => createReviewPublicPreview({ ownerId, getEntries: () => [], getImage: () => null, market: null, notifications });

test('adapter notification fixtures default off and the isolated DEV journal explicitly enables them', async () => {
  const ordinary = preview();
  for (const method of ['fetchReviewNotifications', 'fetchReviewNotificationCount', 'markReviewNotificationsRead', 'readReviewNotificationTarget']) assert.equal(ordinary[method], undefined);
  assert.ok(!(await ordinary.fetchReviewPublicFeed({}, ownerId)).posts.some(post => post.id === 'log:notification-example'));
  const enabled = preview(true);
  assert.ok((await enabled.fetchReviewPublicFeed({}, ownerId)).posts.some(post => post.id === 'log:notification-example'));
  const previewSource = readFileSync(new URL('../src/dev/ReviewJournalPreview.jsx', import.meta.url), 'utf8');
  assert.match(previewSource, /notifications:true/);
  assert.match(previewSource, /Only imported by DevVisualPreview/);
});

test('preview supplies four matching kinds, independent category pages and exact comment targets', async () => {
  const db = preview(true);
  assert.deepEqual(await db.fetchReviewNotificationCount(ownerId), { unreadCount: 3 });
  const first = await db.fetchReviewNotifications({ limit: 2 }, ownerId);
  assert.deepEqual(first.notifications.map(row => row.kind), ['reply', 'comment']); assert.equal(first.hasMore, true);
  assert.deepEqual(first.nextCursor, { createdAt: first.notifications[1].createdAt, id: first.notifications[1].id });
  const second = await db.fetchReviewNotifications({ limit: 2, cursor: first.nextCursor }, ownerId);
  assert.deepEqual(second.notifications.map(row => row.kind), ['like', 'rating']); assert.equal(second.hasMore, false);
  for (const [filter, kinds] of [['comments', ['reply', 'comment']], ['likes', ['like']], ['ratings', ['rating']]]) {
    assert.deepEqual((await db.fetchReviewNotifications({ filter }, ownerId)).notifications.map(row => row.kind), kinds);
  }
  for (const row of [...first.notifications, ...second.notifications]) {
    const target = await db.readReviewNotificationTarget(row.id, ownerId);
    assert.equal(target.notificationId, row.id); assert.equal(target.postId, row.postId); assert.equal(target.commentId, row.commentId);
    if (row.commentId) {
      assert.equal(target.evaluation.id, row.commentId); assert.equal(target.evaluation.postId, row.postId);
      assert.equal(target.evaluation.authorId, row.actorId); assert.equal(target.evaluation.score, row.score);
      assert.equal(target.evaluation.text, row.excerpt);
    } else assert.equal(target.evaluation, null);
  }
});

test('preview read receipts are idempotent and boundary-all-read excludes newer notifications', async () => {
  const db = preview(true), rows = (await db.fetchReviewNotifications({}, ownerId)).notifications;
  assert.deepEqual(await db.markReviewNotificationsRead({ before: { createdAt: rows[1].createdAt, id: rows[1].id } }, ownerId), { unreadCount: 1 });
  let after = (await db.fetchReviewNotifications({}, ownerId)).notifications;
  assert.equal(after[0].readAt, null); assert.ok(after.slice(1).every(row => row.readAt));
  const firstReadAt = after[1].readAt;
  assert.deepEqual(await db.markReviewNotificationsRead({ ids: [rows[1].id] }, ownerId), { unreadCount: 1 });
  after = (await db.fetchReviewNotifications({}, ownerId)).notifications; assert.equal(after[1].readAt, firstReadAt);
  assert.deepEqual(await db.markReviewNotificationsRead({ ids: [rows[0].id] }, ownerId), { unreadCount: 0 });
});

test('withdrawing a sample public post removes messages, count and targets without erasing read receipts', async () => {
  const db = preview(true), row = (await db.fetchReviewNotifications({}, ownerId)).notifications[0];
  await db.markReviewNotificationsRead({ ids: [row.id] }, ownerId);
  db.setReviewCommunityPreviewVisibility(row.postId, 'private');
  assert.deepEqual((await db.fetchReviewNotifications({}, ownerId)).notifications, []);
  assert.deepEqual(await db.fetchReviewNotificationCount(ownerId), { unreadCount: 0 });
  await assert.rejects(db.readReviewNotificationTarget(row.id, ownerId), { code: 'REVIEW_NOTIFICATION_NOT_FOUND' });
  db.setReviewCommunityPreviewVisibility(row.postId, 'public');
  assert.deepEqual(await db.fetchReviewNotificationCount(ownerId), { unreadCount: 2 });
  assert.ok((await db.fetchReviewNotifications({}, ownerId)).notifications[0].readAt);
});

test('deleted target comment cannot be resolved, counted or included in preview notifications', async () => {
  const samples = [], evaluations = new Map();
  const db = createReviewNotificationPreview({ ownerId, samples, evaluations, posts: () => samples, readEvaluation: row => ({ ...row }), assertOwner: id => assert.equal(id, ownerId) });
  const row = (await db.fetchReviewNotifications({ filter: 'comments' }, ownerId)).notifications[0];
  evaluations.delete(row.commentId);
  assert.ok(!(await db.fetchReviewNotifications({}, ownerId)).notifications.some(value => value.id === row.id));
  assert.deepEqual(await db.fetchReviewNotificationCount(ownerId), { unreadCount: 2 });
  await assert.rejects(db.readReviewNotificationTarget(row.id, ownerId), { code: 'REVIEW_NOTIFICATION_NOT_FOUND' });
});

test('all preview notification operations enforce the isolated owner account', async () => {
  const db = preview(true), row = (await db.fetchReviewNotifications({}, ownerId)).notifications[0];
  for (const request of [
    () => db.fetchReviewNotifications({}, 'other'), () => db.fetchReviewNotificationCount('other'),
    () => db.markReviewNotificationsRead({ ids: [row.id] }, 'other'), () => db.readReviewNotificationTarget(row.id, 'other'),
  ]) await assert.rejects(request(), /预览账户不匹配/);
  assert.deepEqual(await db.fetchReviewNotificationCount(ownerId), { unreadCount: 3 });
});
