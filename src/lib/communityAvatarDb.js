import { supabase } from './supabase';
import { createCommunityAvatarRepository } from './communityAvatarRepository.js';
const repository = createCommunityAvatarRepository(supabase, { supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '' });
const profileCache = new Map(), signedCache = new Map(), inFlight = new Map(), listeners = new Map();
let generation = 0;
function notify(userId) { for (const [id, set] of listeners) if (!userId || id === userId) for (const listener of set) listener(); }
function invalidate(userId) {
  generation += 1;
  if (userId) { profileCache.delete(userId); for (const key of signedCache.keys()) if (key.startsWith(`${userId}:`)) signedCache.delete(key); }
  else { profileCache.clear(); signedCache.clear(); }
  inFlight.clear(); notify(userId);
}
let lastIdentity;
supabase?.auth?.onAuthStateChange?.((_event, session) => {
  const next = session?.user?.id || null;
  if (lastIdentity === undefined) { lastIdentity = next; return; }
  if (lastIdentity !== next) { lastIdentity = next; invalidate(); }
});
export function subscribeCommunityAvatar(userId, listener) {
  if (!listeners.has(userId)) listeners.set(userId, new Set()); listeners.get(userId).add(listener);
  return () => { listeners.get(userId)?.delete(listener); if (!listeners.get(userId)?.size) listeners.delete(userId); };
}
export function fetchCommunityAvatar(userId, { force = false, path } = {}) {
  const key = `${userId}:${path === undefined ? 'profile' : path || 'default'}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const epoch = generation;
  const operation = (async () => {
    await repository.authenticate(userId);
    let metadata = path === undefined ? profileCache.get(userId) : { path, configured: true, until: Date.now() + 480000 };
    if (path === undefined && (force || !metadata || metadata.until <= Date.now())) { metadata = { ...(await repository.read(userId)), until: Date.now() + 480000 }; }
    let url = '', imageUnavailable = false, expiresAt = 0;
    if (metadata.path) {
      const signatureKey = `${userId}:${metadata.path}`, cached = signedCache.get(signatureKey);
      try {
        url = !force && cached?.until > Date.now() ? cached.url : await repository.resolve(metadata.path, userId);
        expiresAt = !force && cached?.until > Date.now() ? cached.until : Date.now() + 480000;
        if (epoch === generation) signedCache.set(signatureKey, { url, until: expiresAt });
      } catch (error) {
        if (error?.code === 'AVATAR_ACCOUNT_CHANGED' || error?.code === 'AVATAR_AUTH_REQUIRED') throw error;
        // A missing image/signature is not a missing profile: keep the trusted
        // path so its owner can replace it or return to a preset.
        imageUnavailable = true;
      }
    }
    await repository.authenticate(userId);
    if (epoch !== generation) throw new Error('头像账户状态已更新，请重试。');
    if (path === undefined) profileCache.set(userId, metadata);
    while (profileCache.size > 8) profileCache.delete(profileCache.keys().next().value);
    while (signedCache.size > 32) signedCache.delete(signedCache.keys().next().value);
    return { path: metadata.path, url, configured: metadata.configured, imageUnavailable, expiresAt };
  })();
  inFlight.set(key, operation); operation.finally(() => { if (inFlight.get(key) === operation) inFlight.delete(key); }).catch(() => {});
  return operation;
}
export const uploadCommunityAvatar = (file, userId) => repository.upload(file, userId);
export const invalidateCommunityAvatar = userId => invalidate(userId);
export const removeCommunityAvatarImage = (path, userId) => repository.remove(path, userId);
export async function saveCommunityAvatarProfile(profile, userId) { const result = await repository.save(profile, userId); invalidate(userId); return result; }
