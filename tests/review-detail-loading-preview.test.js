import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPublicPreview } from '../src/dev/reviewPublicPreview.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const postId = 'insight:sample-reader';
function fixture() {
  let release, reject, calls = 0;
  const db = createReviewPublicPreview({ ownerId, getEntries: () => [], threaded: true,
    beforeReadPost: () => { calls++; return new Promise((resolve, fail) => { release = resolve; reject = fail; }); } });
  return { db, release: () => release(), reject: () => reject(new Error('offline')), calls: () => calls };
}

test('isolated detail acceptance holds only detail while list and threaded comments remain readable', async () => {
  const h = fixture();
  const feed = await h.db.fetchReviewPublicFeed({}, ownerId);
  assert.ok(feed.posts.find(post => post.id === postId)?.text);
  let finished = false;
  const detail = h.db.fetchReviewPublicPost(postId, ownerId).then(post => { finished = true; return post; });
  const comments = await h.db.fetchReviewCommentThreads({ postId }, ownerId);
  assert.ok(Array.isArray(comments.threads));
  assert.equal(finished, false);
  h.release();
  assert.equal((await detail).id, postId);
});

test('isolated detail acceptance observes withdrawal at completion and preserves network failure', async () => {
  const h = fixture(), detail = h.db.fetchReviewPublicPost(postId, ownerId);
  h.db.setReviewCommunityPreviewVisibility(postId, 'private');
  await assert.rejects(h.db.fetchReviewCommentThreads({ postId }, ownerId), { code: 'REVIEW_PUBLIC_NOT_FOUND' });
  h.release();
  assert.equal(await detail, null);
  h.db.setReviewCommunityPreviewVisibility(postId, 'public');
  const failed = h.db.fetchReviewPublicPost(postId, ownerId);
  h.reject();
  await assert.rejects(failed, /offline/);
});

test('isolated detail gate cannot run for another account', async () => {
  const h = fixture();
  await assert.rejects(h.db.fetchReviewPublicPost(postId, 'other'), /预览账户不匹配/);
  assert.equal(h.calls(), 0);
});
