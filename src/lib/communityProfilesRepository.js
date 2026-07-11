import {
  buildDefaultCommunityProfile,
  COMMUNITY_PROFILE_TABLE,
  mapCommunityProfileRow,
  normalizeCommunityAvatarKey,
  validateCommunityNickname,
} from './communityProfile.js';

const SELECT_COLUMNS = 'user_id,nickname,avatar_key,created_at,updated_at';

export function createCommunityProfilesRepository(client) {
  if (!client?.from) throw new Error('Supabase client is required');

  const map = (row, user) => mapCommunityProfileRow(row, user);

  const fetch = async (user) => {
    if (!user?.id) return null;
    const { data, error } = await client
      .from(COMMUNITY_PROFILE_TABLE)
      .select(SELECT_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? map(data, user) : null;
  };

  const upsert = async (user, profile = {}) => {
    if (!user?.id) throw new Error('未登录');

    const fallback = buildDefaultCommunityProfile(user);
    const nicknameResult = validateCommunityNickname(profile.nickname || fallback.nickname);
    if (!nicknameResult.valid) {
      throw new Error('昵称需为 2-16 个字符');
    }

    const avatarKey = normalizeCommunityAvatarKey(profile.avatarKey || profile.avatar_key, fallback.avatarKey);
    const { data, error } = await client
      .from(COMMUNITY_PROFILE_TABLE)
      .upsert({
        user_id: user.id,
        nickname: nicknameResult.nickname,
        avatar_key: avatarKey,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return map(data, user);
  };

  const ensure = async (user) => {
    if (!user?.id) return null;
    const existing = await fetch(user);
    if (existing) return existing;
    return upsert(user, buildDefaultCommunityProfile(user));
  };

  return {
    fetch,
    ensure,
    upsert,
  };
}
