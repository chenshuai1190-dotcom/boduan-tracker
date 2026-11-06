import { supabase } from './supabase';
import { createCommunityProfilesRepository } from './communityProfilesRepository.js';
import { fetchCommunityAvatar, invalidateCommunityAvatar } from './communityAvatarDb.js';

const repository = createCommunityProfilesRepository(supabase);

export async function fetchCommunityProfile(preUser = null) {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return null;
  return repository.ensure(user);
}

export async function fetchPnlShareIdentity(preUser = null, { forceAvatar = false, strictAvatar = false } = {}) {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return null;
  const [identity, avatar] = await Promise.all([
    repository.fetchShareIdentity(user),
    fetchCommunityAvatar(user.id, { force: forceAvatar }).catch(error => { if (strictAvatar) throw error; return null; }),
  ]);
  return identity && avatar
    ? { ...identity, avatarPath: avatar.path, avatarUrl: avatar.url, avatarExpiresAt: avatar.expiresAt }
    : identity;
}

export async function upsertCommunityProfile(profile, preUser = null) {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('未登录');
  const saved = await repository.upsert(user, profile);
  invalidateCommunityAvatar(user.id);
  return saved;
}
