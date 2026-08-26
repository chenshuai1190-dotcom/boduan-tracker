import {
  COMMUNITY_AVATAR_OPTIONS,
  validateCommunityNickname,
} from './communityProfile.js';

const BIDI_CONTROL_PATTERN = /[\u202a-\u202e\u2066-\u2069]/g;
const DEFAULT_AVATAR_LOAD_TIMEOUT_MS = 8000;

function strictAvatarOption(value) {
  const key = String(value || '').trim().toLowerCase();
  return COMMUNITY_AVATAR_OPTIONS.find((option) => option.key === key) || null;
}

export function sanitizePnlShareNickname(value) {
  const nickname = String(value || '').replace(BIDI_CONTROL_PATTERN, '');
  const result = validateCommunityNickname(nickname);
  return result.valid ? result.nickname : '';
}

export function createPnlShareIdentity(profile = null) {
  const nickname = sanitizePnlShareNickname(profile?.nickname);
  const avatar = strictAvatarOption(profile?.avatarKey || profile?.avatar_key);
  if (!nickname || !avatar) return null;
  return Object.freeze({ nickname, avatarKey: avatar.key });
}

export function pnlShareAvatarSource(avatarKey) {
  return strictAvatarOption(avatarKey)?.src || '';
}

export function loadPnlShareAvatarImage(avatarKey, {
  ImageCtor = typeof Image === 'function' ? Image : null,
  timeoutMs = DEFAULT_AVATAR_LOAD_TIMEOUT_MS,
} = {}) {
  const src = pnlShareAvatarSource(avatarKey);
  if (!src) return Promise.reject(new Error('P&L share avatar is not allowlisted'));
  if (typeof ImageCtor !== 'function') return Promise.reject(new Error('Image loading is unavailable'));

  return new Promise((resolve, reject) => {
    const image = new ImageCtor();
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timerId) clearTimeout(timerId);
      image.onload = null;
      image.onerror = null;
      callback(value);
    };
    const timerId = setTimeout(() => {
      finish(reject, new Error('P&L share avatar loading timed out'));
    }, Math.max(1000, Number(timeoutMs) || DEFAULT_AVATAR_LOAD_TIMEOUT_MS));

    image.decoding = 'async';
    image.onload = () => finish(resolve, image);
    image.onerror = () => finish(reject, new Error('P&L share avatar failed to load'));
    image.src = src;
  });
}
