import { createCommunityProfilesRepository } from './communityProfilesRepository.js';
import { createCommunityAvatarRepository } from './communityAvatarRepository.js';
import { COMMUNITY_AVATAR_MAX_BYTES, isCommunityAvatarSignedUrl } from './communityAvatarModel.js';
import { isReviewAvatarDataUrl } from './reviewIdentityStorage.js';

// Download once per immutable avatar path; the signed URL stays in this call.
export async function downloadReviewAvatar(url, { path, supabaseUrl }) {
  if (!isCommunityAvatarSignedUrl(url, { path, supabaseUrl })) throw new Error('头像链接无效。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error('头像读取失败，请重试。');
    const length = Number(response.headers.get('content-length'));
    if (length > COMMUNITY_AVATAR_MAX_BYTES) throw new Error('头像文件过大。');
    const blob = await response.blob();
    if (!blob.size || blob.size > COMMUNITY_AVATAR_MAX_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('头像格式无效。');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('头像读取失败，请重试。'));
      reader.readAsDataURL(blob);
    });
    if (!isReviewAvatarDataUrl(dataUrl)) throw new Error('头像格式无效。');
    // Commit a replacement only after decoding, so a broken download cannot
    // replace the last good photo for the next 24 hours.
    await new Promise((resolve, reject) => {
      const image = new Image();
      const finish = error => {
        clearTimeout(decodeTimer); image.onload = null; image.onerror = null;
        if (error) reject(error); else resolve();
      };
      const decodeTimer = setTimeout(() => finish(new Error('头像读取超时，请重试。')), 8000);
      image.onload = () => finish();
      image.onerror = () => finish(new Error('头像图片无效。'));
      image.src = dataUrl;
    });
    return dataUrl;
  } finally { clearTimeout(timer); }
}

export function createReviewIdentityLoader(client, { supabaseUrl = '', download = downloadReviewAvatar } = {}) {
  const profiles = createCommunityProfilesRepository(client);
  const avatars = createCommunityAvatarRepository(client, { supabaseUrl });
  return async (userId, previous) => {
    await avatars.authenticate(userId);
    const [identity, avatar] = await Promise.all([
      profiles.fetchShareIdentity({ id: userId }),
      avatars.read(userId),
    ]);
    if (!identity) { await avatars.authenticate(userId); return null; }
    let avatarDataUrl = '';
    if (avatar.path) {
      avatarDataUrl = previous?.avatarPath === avatar.path && isReviewAvatarDataUrl(previous.avatarDataUrl)
        ? previous.avatarDataUrl
        : await download(await avatars.resolve(avatar.path, userId), { path: avatar.path, supabaseUrl });
      if (!isReviewAvatarDataUrl(avatarDataUrl)) throw new Error('头像格式无效。');
    }
    await avatars.authenticate(userId);
    return { ...identity, avatarPath: avatar.path, avatarDataUrl };
  };
}
