export const COMMUNITY_PROFILE_TABLE = 'community_profiles';

export const COMMUNITY_AVATAR_OPTIONS = [
  { key: 'blue', labelZh: '蓝色少年', labelEn: 'Blue Youth', src: '/community-avatars/avatar-human-blue.jpg', accent: '#38bdf8' },
  { key: 'purple', labelZh: '紫色女士', labelEn: 'Purple Woman', src: '/community-avatars/avatar-human-purple.jpg', accent: '#a855f7' },
  { key: 'green', labelZh: '绿色运动', labelEn: 'Green Athlete', src: '/community-avatars/avatar-human-green.jpg', accent: '#84cc16' },
  { key: 'silver', labelZh: '粉色画家', labelEn: 'Pink Artist', src: '/community-avatars/avatar-human-pink.jpg', accent: '#ec4899' },
  { key: 'cyan', labelZh: '青色程序员', labelEn: 'Cyan Coder', src: '/community-avatars/avatar-human-cyan.jpg', accent: '#22d3ee' },
  { key: 'gold', labelZh: '金色青年', labelEn: 'Gold Youth', src: '/community-avatars/avatar-human-gold.jpg', accent: '#f6b54b' },
  { key: 'wolf', labelZh: '蓝狼', labelEn: 'Blue Wolf', src: '/community-avatars/avatar-animal-wolf.jpg', accent: '#38bdf8' },
  { key: 'fox', labelZh: '赤狐', labelEn: 'Red Fox', src: '/community-avatars/avatar-animal-fox.jpg', accent: '#f97316' },
  { key: 'tiger', labelZh: '紫虎', labelEn: 'Purple Tiger', src: '/community-avatars/avatar-animal-tiger.jpg', accent: '#a855f7' },
  { key: 'cat', labelZh: '粉猫', labelEn: 'Pink Cat', src: '/community-avatars/avatar-animal-cat.jpg', accent: '#ec4899' },
  { key: 'eagle', labelZh: '金鹰', labelEn: 'Gold Eagle', src: '/community-avatars/avatar-animal-eagle.jpg', accent: '#eab308' },
  { key: 'panda', labelZh: '熊猫', labelEn: 'Panda', src: '/community-avatars/avatar-animal-panda.jpg', accent: '#84cc16' },
  { key: 'cyber-cyan', labelZh: '青色夜行者', labelEn: 'Cyan Hood', src: '/community-avatars/avatar-cyber-cyan.jpg', accent: '#22d3ee' },
  { key: 'cyber-magenta', labelZh: '紫色夜行者', labelEn: 'Magenta Hood', src: '/community-avatars/avatar-cyber-magenta.jpg', accent: '#d946ef' },
  { key: 'cyber-void', labelZh: '虚空夜行者', labelEn: 'Void Hood', src: '/community-avatars/avatar-cyber-void.jpg', accent: '#34d399' },
  { key: 'cyber-red', labelZh: '赤色夜行者', labelEn: 'Red Hood', src: '/community-avatars/avatar-cyber-red.jpg', accent: '#ef4444' },
  { key: 'cyber-visor', labelZh: '青色面甲', labelEn: 'Cyan Visor', src: '/community-avatars/avatar-cyber-visor.jpg', accent: '#06b6d4' },
  { key: 'cyber-crystal', labelZh: '紫晶夜行者', labelEn: 'Crystal Hood', src: '/community-avatars/avatar-cyber-crystal.jpg', accent: '#8b5cf6' },
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
