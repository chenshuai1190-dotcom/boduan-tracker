import { supabase } from './supabase';
import { createCommunityProfilesRepository } from './communityProfilesRepository.js';

const repository = createCommunityProfilesRepository(supabase);

export async function fetchCommunityProfile(preUser = null) {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) return null;
  return repository.ensure(user);
}

export async function upsertCommunityProfile(profile, preUser = null) {
  const user = preUser || (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('未登录');
  return repository.upsert(user, profile);
}
