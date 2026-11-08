import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReviewPublicPreview } from '../src/dev/reviewPublicPreview.js';
import { normalizeCommunityAvatarPath } from '../src/lib/communityAvatarModel.js';

const ownerId = 'local-review-journal-preview', postId = 'insight:sample-reader';
const base = { ownerId, getEntries: () => [], getImage: () => null, market: null, threaded: true };
function fixture() {
  const waits = [], assets = [], updates = [];
  const db = createReviewPublicPreview({ ...base, avatarCache: {
    onRequest: state => updates.push(state), wait: async ms => waits.push(ms),
    loadBlob: async asset => {
      assets.push(asset);
      return new Blob([await readFile(new URL(`../public${asset}`, import.meta.url))], { type: 'image/jpeg' });
    },
  } });
  return { db, waits, assets, updates };
}

test('custom avatar scenario requires an explicit DEV option and keeps ordinary fixtures unchanged', async () => {
  const db = createReviewPublicPreview(base);
  assert.equal(db.changeReviewAvatarPreview, undefined);
  assert.equal((await db.fetchReviewPublicPost(postId, ownerId)).author.avatarPath, null);
  assert.equal((await db.fetchReviewCommentThreads({ postId }, ownerId)).threads.length, 0);
  await assert.rejects(db.downloadReviewPublicAvatar('anything', ownerId), /不包含此自定义头像/);
});

test('post and same-author comment share one valid custom path; downloads expose real local image blobs and counts', async () => {
  const { db, waits, assets, updates } = fixture();
  const post = await db.fetchReviewPublicPost(postId, ownerId);
  const root = (await db.fetchReviewCommentThreads({ postId }, ownerId)).threads[0].root;
  assert.equal(normalizeCommunityAvatarPath(post.author.avatarPath), post.author.avatarPath);
  assert.equal(root.authorId, post.authorId);
  assert.equal(root.author.avatarPath, post.author.avatarPath);
  const image = await db.downloadReviewPublicAvatar(post.author.avatarPath, ownerId);
  assert.equal(image.type, 'image/jpeg');
  assert.ok(image.size > 0 && image.size < 2 * 1024 * 1024);
  assert.deepEqual(waits, [300]);
  assert.deepEqual(assets, ['/community-avatars/avatar-animal-fox.jpg']);
  assert.equal(updates.at(-1).total, 1);
  assert.equal(db.readReviewAvatarPreviewStats().requests[post.author.avatarPath], 1);
});

test('changing an avatar updates fresh metadata without mutating the old image path or accepting unrelated downloads', async () => {
  const { db, assets } = fixture();
  const original = await db.fetchReviewPublicPost(postId, ownerId);
  const changed = db.changeReviewAvatarPreview();
  assert.notEqual(changed.path, original.author.avatarPath);
  assert.equal(changed.total, 0, 'metadata changes alone do not pretend to download an image');
  const fresh = await db.fetchReviewPublicPost(postId, ownerId);
  const root = (await db.fetchReviewCommentThreads({ postId }, ownerId)).threads[0].root;
  assert.equal(fresh.author.avatarPath, changed.path);
  assert.equal(root.author.avatarPath, changed.path);
  await db.downloadReviewPublicAvatar(changed.path, ownerId);
  await db.downloadReviewPublicAvatar(original.author.avatarPath, ownerId);
  assert.deepEqual(assets, ['/community-avatars/avatar-animal-panda.jpg', '/community-avatars/avatar-animal-fox.jpg']);
  await assert.rejects(db.downloadReviewPublicAvatar(changed.path, 'wrong-viewer'), /账户不匹配/);
  await assert.rejects(db.downloadReviewPublicAvatar('https://example.com/avatar.jpg', ownerId), /不包含此自定义头像/);
  assert.equal(db.readReviewAvatarPreviewStats().total, 2);
});
