import { supabase } from './supabase';
import { createCommunityProfilesRepository } from './communityProfilesRepository.js';
import { fetchCommunityAvatar } from './communityAvatarDb.js';

const repository = createCommunityProfilesRepository(supabase);

export async function fetchCommunityProfile(preUser = null) {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return null;
  return repository.ensure(user);
}

export async function fetchPnlShareIdentity(preUser = null) {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return null;
  const [identity, avatar] = await Promise.all([
    repository.fetchShareIdentity(user),
    fetchCommunityAvatar(user.id).catch(() => null),
  ]);
  return identity && avatar?.path && avatar?.url
    ? { ...identity, avatarPath: avatar.path, avatarUrl: avatar.url }
    : identity;
}

export async function upsertCommunityProfile(profile, preUser = null) {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('未登录');
  return repository.upsert(user, profile);
}
