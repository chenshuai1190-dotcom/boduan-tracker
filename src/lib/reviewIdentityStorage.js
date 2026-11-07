import { normalizeCommunityAvatarKey, validateCommunityNickname } from './communityProfile.js';
import { COMMUNITY_AVATAR_MAX_BYTES, isCommunityAvatarOwner, normalizeCommunityAvatarPath } from './communityAvatarModel.js';

// One private, owner-bound snapshot. Never persist a bearer URL or credentials.
const STORAGE_KEY = 'bottomline_review_identity_v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 30 * DAY_MS;
const MAX_BASE64_LENGTH = Math.ceil(COMMUNITY_AVATAR_MAX_BYTES / 3) * 4;
const MAX_RECORD_LENGTH = MAX_BASE64_LENGTH + 2048;
const timestamp = value => Number.isSafeInteger(value) && value >= 0;

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function isReviewAvatarDataUrl(value) {
  if (typeof value !== 'string') return false;
  const match = /^data:image\/(jpeg|png|webp);base64,/.exec(value);
  if (!match) return false;
  const encoded = value.slice(match[0].length);
  if (!encoded || encoded.length > MAX_BASE64_LENGTH || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const bytes = encoded.length / 4 * 3 - padding;
  if (bytes <= 0 || bytes > COMMUNITY_AVATAR_MAX_BYTES) return false;
  try {
    // Only decode the bounded header; the browser still validates the full image.
    const header = atob(encoded.slice(0, 16));
    if (match[1] === 'jpeg') return bytes >= 4 && header.charCodeAt(0) === 0xff && header.charCodeAt(1) === 0xd8 && header.charCodeAt(2) === 0xff;
    if (match[1] === 'png') return bytes >= 8 && header.slice(0, 8) === '\x89PNG\r\n\x1a\n';
    return bytes >= 12 && header.slice(0, 4) === 'RIFF' && header.slice(8, 12) === 'WEBP';
  } catch { return false; }
}

function normalizeEntry(userId, entry, currentTime) {
  if (!isCommunityAvatarOwner(userId) || !entry || typeof entry !== 'object' || !timestamp(currentTime)) return null;
  const savedAt = entry.savedAt;
  if (!timestamp(savedAt) || savedAt > currentTime || currentTime - savedAt > MAX_AGE_MS) return null;
  const freshUntil = entry.freshUntil;
  if (!timestamp(freshUntil) || freshUntil !== 0 && (freshUntil < savedAt || freshUntil > savedAt + DAY_MS)) return null;
  const candidate = entry.identity;
  if (!candidate || typeof candidate.nickname !== 'string' || typeof candidate.avatarKey !== 'string') return null;
  const nickname = validateCommunityNickname(candidate.nickname);
  const avatarKey = normalizeCommunityAvatarKey(candidate.avatarKey, '');
  if (!nickname.valid || !avatarKey) return null;
  // An unknown custom-image state is not an explicit selection of a preset.
  const avatarPath = candidate.avatarPath === null ? null : normalizeCommunityAvatarPath(candidate.avatarPath, userId);
  if (candidate.avatarPath !== null && !avatarPath) return null;
  const identity = { nickname: nickname.nickname, avatarKey, avatarPath };
  if (candidate.avatarDataUrl) {
    if (!avatarPath || !isReviewAvatarDataUrl(candidate.avatarDataUrl)) return null;
    identity.avatarDataUrl = candidate.avatarDataUrl;
  }
  return { identity, freshUntil, savedAt };
}

export function createReviewIdentityStorage({ storage = defaultStorage(), now = Date.now } = {}) {
  function read(userId) {
    if (!isCommunityAvatarOwner(userId)) return null;
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (typeof raw !== 'string' || raw.length > MAX_RECORD_LENGTH) return null;
      const record = JSON.parse(raw);
      if (record?.version !== 1 || record.ownerId !== userId) return null;
      return normalizeEntry(userId, record, now());
    } catch { return null; }
  }
  function write(userId, entry) {
    try {
      const currentTime = now();
      const normalized = normalizeEntry(userId, { ...entry, savedAt: entry?.savedAt ?? currentTime }, currentTime);
      if (!normalized || !storage?.setItem) return false;
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ownerId: userId, ...normalized }));
      return true;
    } catch { return false; }
  }
  function remove(userId) {
    if (!isCommunityAvatarOwner(userId)) return;
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (typeof raw === 'string' && raw.length <= MAX_RECORD_LENGTH && JSON.parse(raw)?.ownerId === userId) storage?.removeItem(STORAGE_KEY);
    } catch { /* Storage is optional; memory/account boundaries still apply. */ }
  }
  function clear() {
    try { storage?.removeItem(STORAGE_KEY); } catch { /* Keep signout usable. */ }
  }
  return { read, write, remove, clear };
}
