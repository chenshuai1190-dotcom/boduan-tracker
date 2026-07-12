const VAULT_STORAGE_KEY = 'boduan_account_session_vault_v1';
const MAX_REMEMBERED_ACCOUNTS = 5;

const getStorage = (storage) => storage || (typeof localStorage === 'undefined' ? null : localStorage);
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeId = (value) => String(value || '').trim();
const normalizeTimestamp = (value, fallback = Date.now()) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function readVault(storage) {
  const target = getStorage(storage);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(VAULT_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => (
      normalizeId(entry?.userId)
      && normalizeEmail(entry?.email)
      && normalizeId(entry?.accessToken)
      && normalizeId(entry?.refreshToken)
    ));
  } catch {
    return [];
  }
}

function writeVault(entries, storage) {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    target.setItem(VAULT_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

export function rememberAccountSession(session, storage) {
  const userId = normalizeId(session?.user?.id);
  const email = normalizeEmail(session?.user?.email);
  const accessToken = normalizeId(session?.access_token);
  const refreshToken = normalizeId(session?.refresh_token);
  if (!userId || !email || !accessToken || !refreshToken) return false;

  const now = Date.now();
  const nextEntry = {
    userId,
    email,
    accessToken,
    refreshToken,
    expiresAt: normalizeTimestamp(session?.expires_at, 0),
    lastUsedAt: now,
  };
  const next = [nextEntry, ...readVault(storage).filter((entry) => entry.userId !== userId)]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_REMEMBERED_ACCOUNTS);
  return writeVault(next, storage);
}

export function listRememberedAccounts(storage) {
  return readVault(storage)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .map(({ userId, email, lastUsedAt }) => ({ userId, email, lastUsedAt }));
}

export function getRememberedAccountSession(userId, storage) {
  const normalizedUserId = normalizeId(userId);
  const match = readVault(storage).find((entry) => entry.userId === normalizedUserId);
  if (!match) return null;
  return {
    userId: match.userId,
    email: match.email,
    accessToken: match.accessToken,
    refreshToken: match.refreshToken,
  };
}

export function removeRememberedAccount(userId, storage) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return false;
  return writeVault(readVault(storage).filter((entry) => entry.userId !== normalizedUserId), storage);
}

export { MAX_REMEMBERED_ACCOUNTS, VAULT_STORAGE_KEY };
