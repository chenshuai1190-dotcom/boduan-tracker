export const COMMUNITY_AVATAR_BUCKET = 'community-avatars';
export const COMMUNITY_AVATAR_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const COMMUNITY_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const COMMUNITY_AVATAR_PIXELS = 512;
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const PATH = new RegExp(`^(${UUID})/(${UUID})\\.(webp|jpg|jpeg|png)$`);
const USER = new RegExp(`^${UUID}$`);
export const isCommunityAvatarOwner = value => typeof value === 'string' && USER.test(value);
export function normalizeCommunityAvatarPath(path, userId) {
  if (typeof path !== 'string' || !PATH.test(path) || userId != null && path.split('/')[0] !== userId) return null;
  return path;
}
export function isCommunityAvatarSignedUrl(value, { supabaseUrl, path } = {}) {
  try {
    if (typeof value !== 'string' || !supabaseUrl) return false;
    const url = new URL(value), origin = new URL(supabaseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin.origin || url.username || url.password || !url.searchParams.get('token')) return false;
    const prefix = `/storage/v1/object/sign/${COMMUNITY_AVATAR_BUCKET}/`;
    if (!url.pathname.startsWith(prefix)) return false;
    const decoded = decodeURIComponent(url.pathname.slice(prefix.length));
    return Boolean(normalizeCommunityAvatarPath(decoded) && (path == null || decoded === path));
  } catch { return false; }
}
export function validateCommunityAvatarFile(file, { source = false } = {}) {
  const max = source ? COMMUNITY_AVATAR_MAX_SOURCE_BYTES : COMMUNITY_AVATAR_MAX_BYTES;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  if (!Number.isSafeInteger(file?.size) || file.size <= 0 || file.size > max) throw new Error(source ? '请选择 10 MB 以内的图片。' : '头像压缩后需在 2 MB 以内。');
  return { type: file.type, extension: file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1] };
}
export function communityAvatarCropRect({ width, height, zoom = 1, x = .5, y = .5 }) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('无法读取图片尺寸。');
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const side = Math.min(width, height) / clamp(Number.isFinite(zoom) ? zoom : 1, 1, 4);
  const centerX = clamp((Number.isFinite(x) ? x : .5) * width, side / 2, width - side / 2);
  const centerY = clamp((Number.isFinite(y) ? y : .5) * height, side / 2, height - side / 2);
  return { x: centerX - side / 2, y: centerY - side / 2, width: side, height: side };
}
