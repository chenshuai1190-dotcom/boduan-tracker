import { createReviewIdentityCache } from '../lib/reviewIdentityCache.js';

export const SETTINGS_AVATAR_PREVIEW_OWNER = '10000000-0000-4000-8000-000000000001';
const avatarPath = `${SETTINGS_AVATAR_PREVIEW_OWNER}/20000000-0000-4000-8000-000000000001.jpg`;

async function loadSampleAvatar() {
  const response = await fetch('/community-avatars/avatar-animal-fox.jpg');
  if (!response.ok) throw new Error('示例头像读取失败');
  const blob = await response.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result); reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const image = new Image(); image.src = dataUrl;
  await image.decode();
  return dataUrl;
}

// Actual owner display-cache semantics with one local sample image. No account,
// profile, storage or production requests; every write is explicitly rejected.
export function createSettingsAvatarCachePreview({ loadImage = loadSampleAvatar } = {}) {
  const profile = { userId: SETTINGS_AVATAR_PREVIEW_OWNER, nickname: '头像缓存示例', avatarKey: 'gold', avatarPath, profileCompletedAt: '2026-11-08T00:00:00Z' };
  const cache = createReviewIdentityCache({ load: async () => ({ ...profile, avatarDataUrl: await loadImage() }) });
  cache.setOwner(SETTINGS_AVATAR_PREVIEW_OWNER);
  const assertOwner = userId => { if (userId !== SETTINGS_AVATAR_PREVIEW_OWNER) throw new Error('预览账户不匹配'); };
  const readOnly = async () => { throw new Error('本地头像缓存验收为只读示例'); };
  return {
    readCachedReviewIdentity: userId => cache.peek(userId),
    fetchReviewIdentity: userId => cache.fetch(userId),
    subscribeReviewIdentity: (_userId, listener) => cache.subscribe(listener),
    async fetchCommunityProfile(user) { assertOwner(user.id); return profile; },
    async fetchCommunityAvatar(userId) {
      assertOwner(userId); const identity = await cache.fetch(userId);
      return { path: avatarPath, url: identity.avatarDataUrl, configured: true };
    },
    upsertCommunityProfile: readOnly, uploadCommunityAvatar: readOnly,
    saveCommunityAvatarProfile: readOnly, removeCommunityAvatarImage: readOnly,
  };
}
