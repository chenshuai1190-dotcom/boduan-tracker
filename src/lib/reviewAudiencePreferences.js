const KINDS = ['feedScope', 'publishVisibility'];
const isAudience = value => value === 'public' || value === 'private';
const preferenceKey = userId => typeof userId === 'string' && userId.trim()
  ? `quote:review-audience:v1:${encodeURIComponent(userId)}` : null;

function storedPreferences(storage, key) {
  const raw = storage.getItem(key);
  let value;
  try { value = JSON.parse(raw || 'null'); }
  catch { return {}; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(KINDS.filter(kind => isAudience(value[kind])).map(kind => [kind, value[kind]]));
}

/** Device-local preferences only. Callers restore saved records/drafts first;
 * only an explicit audience selection should write a new preference. */
export function readReviewAudiencePreference(userId, kind, storage) {
  const key = preferenceKey(userId);
  if (!key || !KINDS.includes(kind)) return 'public';
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    return storedPreferences(target, key)[kind] || 'public';
  } catch {
    // Storage can be unavailable or contain an older/invalid value.
    return 'public';
  }
}

export function writeReviewAudiencePreference(userId, kind, value, storage) {
  const key = preferenceKey(userId);
  if (!key || !KINDS.includes(kind) || !isAudience(value)) return false;
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    // If reading fails, skip persistence rather than overwrite the other
    // audience with an invented default. Corrupt JSON can safely be repaired.
    const current = storedPreferences(target, key);
    target.setItem(key, JSON.stringify({ ...current, [kind]: value }));
    return true;
  } catch {
    // Selection still takes effect in the UI even when it cannot be remembered.
    return false;
  }
}
