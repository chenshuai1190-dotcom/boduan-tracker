import { COMMUNITY_AVATAR_BUCKET, normalizeCommunityAvatarPath, validateCommunityAvatarFile, isCommunityAvatarSignedUrl } from './communityAvatarModel.js';
import { mapCommunityProfileRow, normalizeCommunityAvatarKey, validateCommunityNickname } from './communityProfile.js';
const fault = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const schemaMissing = error => ['42703', 'PGRST204'].includes(error?.code) || /avatar_path.*(?:column|schema)|(?:column|schema).*avatar_path/i.test(error?.message || '');
export function createCommunityAvatarRepository(client, { randomUUID = () => crypto.randomUUID(), now = () => new Date().toISOString(), supabaseUrl = '' } = {}) {
  async function authenticate(expectedUserId) {
    if (!expectedUserId || !client?.auth?.getUser) throw fault('AVATAR_AUTH_REQUIRED', '请重新登录后设置头像。');
    const { data, error } = await client.auth.getUser();
    if (error || data?.user?.id !== expectedUserId) throw fault('AVATAR_ACCOUNT_CHANGED', '账户已切换，请重新打开头像设置。');
    return data.user;
  }
  async function read(userId) {
    await authenticate(userId);
    const result = await client.from('community_profiles').select('user_id,avatar_path').eq('user_id', userId).maybeSingle();
    await authenticate(userId);
    if (schemaMissing(result.error)) return { path: null, configured: false };
    if (result.error) throw result.error;
    if (result.data && result.data.user_id !== userId) throw fault('AVATAR_ACCOUNT_CHANGED', '头像账户不匹配。');
    return { path: normalizeCommunityAvatarPath(result.data?.avatar_path, userId), configured: true };
  }
  async function resolve(path, userId) {
    await authenticate(userId);
    if (!normalizeCommunityAvatarPath(path, userId)) throw fault('AVATAR_INVALID_PATH', '头像路径无效。');
    const { data, error } = await client.storage.from(COMMUNITY_AVATAR_BUCKET).createSignedUrl(path, 600);
    await authenticate(userId);
    if (error) throw error;
    if (!isCommunityAvatarSignedUrl(data?.signedUrl, { supabaseUrl, path })) throw fault('AVATAR_INVALID_URL', '头像链接无效。');
    return data.signedUrl;
  }
  async function upload(file, userId) {
    await authenticate(userId); const { extension } = validateCommunityAvatarFile(file);
    const path = `${userId}/${randomUUID().toLowerCase()}.${extension}`;
    if (!normalizeCommunityAvatarPath(path, userId)) throw fault('AVATAR_INVALID_PATH', '无法创建头像路径。');
    const { error } = await client.storage.from(COMMUNITY_AVATAR_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (error) throw fault('AVATAR_UPLOAD_FAILED', /bucket.*not found/i.test(error.message || '') ? '头像存储尚未配置，请稍后重试。' : '头像上传失败，请重试。');
    await authenticate(userId); return { path };
  }
  async function save(profile, userId) {
    await authenticate(userId);
    const nickname = validateCommunityNickname(profile.nickname);
    if (!nickname.valid) throw fault('AVATAR_NICKNAME', '昵称需为 2–16 个字符。');
    const path = profile.avatarPath === null ? null : normalizeCommunityAvatarPath(profile.avatarPath, userId);
    const expected = profile.expectedAvatarPath === null ? null : normalizeCommunityAvatarPath(profile.expectedAvatarPath, userId);
    if (profile.avatarPath !== null && !path || profile.expectedAvatarPath !== null && !expected) throw fault('AVATAR_INVALID_PATH', '头像路径无效。');
    const payload = { nickname: nickname.nickname, avatar_key: normalizeCommunityAvatarKey(profile.avatarKey), avatar_path: path, updated_at: now(), profile_completed_at: now() };
    let query = client.from('community_profiles').update(payload).eq('user_id', userId);
    query = expected === null ? query.is('avatar_path', null) : query.eq('avatar_path', expected);
    let result;
    try { result = await query.select('user_id,nickname,avatar_key,avatar_path,profile_completed_at,created_at,updated_at').maybeSingle(); }
    catch { throw fault('AVATAR_WRITE_UNCONFIRMED', '头像保存结果尚未确认，请重新打开资料检查。', { avatarWriteUncertain: true }); }
    if (schemaMissing(result.error)) throw fault('AVATAR_NOT_CONFIGURED', '自定义头像存储尚未配置，请稍后重试。');
    if (result.error) throw fault('AVATAR_WRITE_UNCONFIRMED', '头像保存结果尚未确认，请重新打开资料检查。', { avatarWriteUncertain: true });
    if (!result.data) throw fault('AVATAR_CONFLICT', '头像已在其他窗口更新，请重新打开资料。');
    try { await authenticate(userId); } catch (error) { error.avatarWriteUncertain = true; throw error; }
    if (result.data.user_id !== userId || result.data.avatar_path !== path) throw fault('AVATAR_WRITE_UNCONFIRMED', '头像保存结果不匹配，请重新打开资料检查。', { avatarWriteUncertain: true });
    return { ...mapCommunityProfileRow(result.data, { id: userId }), avatarPath: path };
  }
  async function remove(path, userId) {
    await authenticate(userId);
    if (!normalizeCommunityAvatarPath(path, userId)) throw fault('AVATAR_INVALID_PATH', '头像路径无效。');
    const { error } = await client.storage.from(COMMUNITY_AVATAR_BUCKET).remove([path]); if (error) throw error;
    await authenticate(userId);
  }
  return { authenticate, read, resolve, upload, save, remove };
}
