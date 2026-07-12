const normalizeUserId = (userId) => String(userId || '').trim();

export function userScopedStorageKey(baseKey, userId) {
  const normalizedBase = String(baseKey || '').trim();
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedBase || !normalizedUserId) return '';
  return `${normalizedBase}__user_${encodeURIComponent(normalizedUserId)}`;
}

export function readUserScopedJson(baseKey, userId, fallback) {
  const key = userScopedStorageKey(baseKey, userId);
  if (!key || typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeUserScopedJson(baseKey, userId, value) {
  const key = userScopedStorageKey(baseKey, userId);
  if (!key || typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
