export const COMMUNITY_PROFILE_TABLE = 'community_profiles';

export const COMMUNITY_AVATAR_OPTIONS = [
  { key: 'gold', labelZh: '金色', labelEn: 'Gold', src: '/community-avatars/avatar-gold.webp', accent: '#f6b54b' },
  { key: 'blue', labelZh: '蓝色', labelEn: 'Blue', src: '/community-avatars/avatar-blue.webp', accent: '#38bdf8' },
  { key: 'purple', labelZh: '紫色', labelEn: 'Purple', src: '/community-avatars/avatar-purple.webp', accent: '#a855f7' },
  { key: 'green', labelZh: '绿色', labelEn: 'Green', src: '/community-avatars/avatar-green.webp', accent: '#34d399' },
  { key: 'cyan', labelZh: '青色', labelEn: 'Cyan', src: '/community-avatars/avatar-cyan.webp', accent: '#22d3ee' },
  { key: 'silver', labelZh: '银色', labelEn: 'Silver', src: '/community-avatars/avatar-silver.webp', accent: '#d1d5db' },
];

export const DEFAULT_COMMUNITY_AVATAR_KEY = 'gold';
export const COMMUNITY_NICKNAME_MIN_LENGTH = 2;
export const COMMUNITY_NICKNAME_MAX_LENGTH = 16;

const AVATAR_KEY_SET = new Set(COMMUNITY_AVATAR_OPTIONS.map((item) => item.key));

export function hashCommunityProfileSeed(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeCommunityNickname(value) {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(normalized).slice(0, COMMUNITY_NICKNAME_MAX_LENGTH).join('');
}

export function validateCommunityNickname(value) {
  const nickname = normalizeCommunityNickname(value);
  const length = Array.from(nickname).length;
  return {
    nickname,
    valid: length >= COMMUNITY_NICKNAME_MIN_LENGTH && length <= COMMUNITY_NICKNAME_MAX_LENGTH,
    length,
  };
}

export function normalizeCommunityAvatarKey(value, fallback = DEFAULT_COMMUNITY_AVATAR_KEY) {
  const key = String(value || '').trim().toLowerCase();
  return AVATAR_KEY_SET.has(key) ? key : fallback;
}

export function getCommunityAvatarOption(value) {
  const key = normalizeCommunityAvatarKey(value);
  return COMMUNITY_AVATAR_OPTIONS.find((item) => item.key === key) || COMMUNITY_AVATAR_OPTIONS[0];
}

export function pickDefaultCommunityAvatarKey(userId) {
  const index = hashCommunityProfileSeed(userId) % COMMUNITY_AVATAR_OPTIONS.length;
  return COMMUNITY_AVATAR_OPTIONS[index]?.key || DEFAULT_COMMUNITY_AVATAR_KEY;
}

export function buildDefaultCommunityNickname(userId) {
  const suffix = String(hashCommunityProfileSeed(userId) % 10000).padStart(4, '0');
  return `波段玩家${suffix}`;
}

export function buildDefaultCommunityProfile(user) {
  const userId = user?.id || '';
  return {
    userId,
    nickname: buildDefaultCommunityNickname(userId),
    avatarKey: pickDefaultCommunityAvatarKey(userId),
    profileCompletedAt: null,
  };
}

export function isCommunityProfileCompleted(profile) {
  return Boolean(profile?.profileCompletedAt || profile?.profile_completed_at);
}

export function mapCommunityProfileRow(row, user = null) {
  const fallback = buildDefaultCommunityProfile(user || { id: row?.user_id || '' });
  return {
    userId: row?.user_id || fallback.userId,
    nickname: normalizeCommunityNickname(row?.nickname) || fallback.nickname,
    avatarKey: normalizeCommunityAvatarKey(row?.avatar_key, fallback.avatarKey),
    profileCompletedAt: row?.profile_completed_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}
