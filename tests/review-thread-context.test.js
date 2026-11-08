import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewCommentPostsForDetail, reviewAuthorCommentForManagement, reviewCommunityPostAllowed } from '../src/lib/reviewThreadContext.js';

test('grouped timeline discussions address each original private container', () => {
  const sources = ['a', 'b', 'c'].map(id => ({ id, type: 'log', visibility: 'public', date: '2026-11-08', timelineEvent: { id: `event-${id}` }, replies: [{ id: 'same', text: id }] }));
  const posts = reviewCommentPostsForDetail({ timelineEvent: { id: 'group' }, timelineSourceEventIds: ['event-b', 'event-a'] }, sources, 'owner');
  assert.deepEqual(posts.map(post => post.id), ['log:a', 'log:b']);
  assert.ok(posts.every(post => post.visibility === 'private'));
  const selected = reviewAuthorCommentForManagement(posts[1], { kind: 'author', id: 'same', text: 'untrusted stale projection' });
  assert.equal(selected.text, 'b');
  assert.deepEqual(selected.timelineReplySource, { entryId: 'b', eventId: 'event-b' });
  assert.equal(reviewAuthorCommentForManagement(posts[0], { kind: 'community', id: 'same' }), null);
  assert.equal(reviewAuthorCommentForManagement(posts[0], { kind: 'author', id: 'removed' }), null);
});

test('unsaved timeline containers cannot be used for comment writes', () => {
  assert.deepEqual(reviewCommentPostsForDetail({ type: 'log', timelineEvent: { id: 'new' } }, [], 'owner'), []);
  assert.deepEqual(reviewCommentPostsForDetail(null, [], 'owner'), []);
  assert.deepEqual(reviewCommentPostsForDetail({ type: 'log', id: 'a' }, [], ''), []);
});

test('ordinary comments retain parent scope and only the current account view can mutate', () => {
  const entry = { id: 'one', type: 'insight', visibility: 'public', replies: [{ id: 'r', text: 'original' }] };
  const [post] = reviewCommentPostsForDetail(entry, [], 'owner');
  assert.equal(post.id, 'insight:one');
  assert.equal(post.visibility, 'public');
  assert.equal(reviewAuthorCommentForManagement(post, { kind: 'author', id: 'r' }), entry.replies[0]);
  const view = { userId: 'owner', postIds: ['insight:one', 'log:two'] };
  assert.equal(reviewCommunityPostAllowed(view, 'owner', 'log:two'), true);
  assert.equal(reviewCommunityPostAllowed(view, 'other', 'log:two'), false);
  assert.equal(reviewCommunityPostAllowed(view, 'owner', 'log:outside'), false);
  assert.equal(reviewCommunityPostAllowed(null, 'owner', 'log:two'), false);
});
