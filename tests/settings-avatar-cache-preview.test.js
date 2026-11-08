import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsAvatarCachePreview, SETTINGS_AVATAR_PREVIEW_OWNER as owner } from '../src/dev/settingsAvatarCachePreview.js';

test('settings acceptance reuses the actual owner identity cache across readers and re-entry', async () => {
  let loads = 0, release;
  const db = createSettingsAvatarCachePreview({ loadImage: () => { loads++; return new Promise(resolve => { release = resolve; }); } });
  assert.equal(db.readCachedReviewIdentity(owner), null);
  const identity = db.fetchReviewIdentity(owner), avatar = db.fetchCommunityAvatar(owner);
  await Promise.resolve();
  assert.equal(loads, 1);
  release('data:image/jpeg;base64,/9j/2Q==');
  const ready = await identity;
  assert.equal((await avatar).url, ready.avatarDataUrl);
  assert.equal(db.readCachedReviewIdentity(owner), ready);
  assert.equal(await db.fetchReviewIdentity(owner), ready);
  assert.equal(loads, 1, 're-entry must not redownload the sample image');
  assert.equal(db.readCachedReviewIdentity('other'), null);
  await assert.rejects(db.fetchReviewIdentity('other'), /账户已更新/);
  await assert.rejects(db.fetchCommunityAvatar('other'), /预览账户不匹配/);
  await assert.rejects(db.saveCommunityAvatarProfile({}, owner), /只读示例/);
});
