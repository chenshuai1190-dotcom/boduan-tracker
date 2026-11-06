import {
  COMMUNITY_AVATAR_OPTIONS,
  validateCommunityNickname,
} from './communityProfile.js';
import { isCommunityAvatarSignedUrl, normalizeCommunityAvatarPath } from './communityAvatarModel.js';

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

export function createPnlShareIdentity(profile = null, { supabaseUrl = import.meta.env?.VITE_SUPABASE_URL } = {}) {
  const nickname = sanitizePnlShareNickname(profile?.nickname);
  const avatar = strictAvatarOption(profile?.avatarKey || profile?.avatar_key);
  if (!nickname || !avatar) return null;
  const path = normalizeCommunityAvatarPath(profile?.avatarPath);
  const custom = path && isCommunityAvatarSignedUrl(profile?.avatarUrl, { supabaseUrl, path });
  return Object.freeze({ nickname, avatarKey: avatar.key,
    ...(custom ? { avatarPath: path, avatarUrl: profile.avatarUrl } : {}) });
}

export function pnlShareAvatarSource(avatar, { supabaseUrl = import.meta.env?.VITE_SUPABASE_URL } = {}) {
  if (avatar && typeof avatar === 'object') {
    const path = normalizeCommunityAvatarPath(avatar.avatarPath);
    if (path && isCommunityAvatarSignedUrl(avatar.avatarUrl, { supabaseUrl, path })) return avatar.avatarUrl;
    return strictAvatarOption(avatar.avatarKey)?.src || '';
  }
  return strictAvatarOption(avatar)?.src || '';
}

export function loadPnlShareAvatarImage(avatar, {
  ImageCtor = typeof Image === 'function' ? Image : null,
  timeoutMs = DEFAULT_AVATAR_LOAD_TIMEOUT_MS,
  supabaseUrl = import.meta.env?.VITE_SUPABASE_URL,
} = {}) {
  const src = pnlShareAvatarSource(avatar, { supabaseUrl });
  const fallback = strictAvatarOption(typeof avatar === 'object' ? avatar?.avatarKey : avatar)?.src;
  if (!src) return Promise.reject(new Error('P&L share avatar is not allowlisted'));
  if (typeof ImageCtor !== 'function') return Promise.reject(new Error('Image loading is unavailable'));

  const load = source => new Promise((resolve, reject) => {
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
    if (source !== fallback) image.crossOrigin = 'anonymous';
    image.pnlShareCropScale = source === fallback ? 1.15 : 1;
    image.onload = () => finish(resolve, image);
    image.onerror = () => finish(reject, new Error('P&L share avatar failed to load'));
    image.src = source;
  });
  return load(src).catch(error => src !== fallback && fallback ? load(fallback) : Promise.reject(error));
}
