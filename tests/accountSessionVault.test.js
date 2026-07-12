import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRememberedAccountSession,
  listRememberedAccounts,
  rememberAccountSession,
  removeRememberedAccount,
  VAULT_STORAGE_KEY,
} from '../src/lib/accountSessionVault.js';
import { userScopedStorageKey } from '../src/lib/userScopedStorage.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function session(userId, email, suffix) {
  return {
    user: { id: userId, email },
    access_token: `access-${suffix}`,
    refresh_token: `refresh-${suffix}`,
    expires_at: 12345,
  };
}

test('account list never exposes session tokens', () => {
  const storage = createStorage();
  assert.equal(rememberAccountSession(session('u1', 'ONE@EXAMPLE.COM', 'one'), storage), true);
  assert.deepEqual(listRememberedAccounts(storage), [{ userId: 'u1', email: 'one@example.com', lastUsedAt: listRememberedAccounts(storage)[0].lastUsedAt }]);
  assert.equal(JSON.stringify(listRememberedAccounts(storage)).includes('access-one'), false);
  assert.equal(JSON.stringify(listRememberedAccounts(storage)).includes('refresh-one'), false);
  assert.equal(getRememberedAccountSession('u1', storage).refreshToken, 'refresh-one');
});

test('vault updates an account and keeps at most five recent sessions', () => {
  const storage = createStorage();
  for (let index = 1; index <= 6; index += 1) {
    rememberAccountSession(session(`u${index}`, `u${index}@example.com`, index), storage);
  }
  assert.equal(listRememberedAccounts(storage).length, 5);
  assert.equal(listRememberedAccounts(storage).some((item) => item.userId === 'u1'), false);
  rememberAccountSession(session('u6', 'new@example.com', 'new'), storage);
  assert.equal(getRememberedAccountSession('u6', storage).email, 'new@example.com');
  assert.equal(getRememberedAccountSession('u6', storage).accessToken, 'access-new');
});

test('remove deletes only the requested remembered account', () => {
  const storage = createStorage();
  rememberAccountSession(session('u1', 'one@example.com', 'one'), storage);
  rememberAccountSession(session('u2', 'two@example.com', 'two'), storage);
  assert.equal(removeRememberedAccount('u1', storage), true);
  assert.equal(getRememberedAccountSession('u1', storage), null);
  assert.equal(getRememberedAccountSession('u2', storage).email, 'two@example.com');
  assert.ok(storage.getItem(VAULT_STORAGE_KEY));
});

test('user-scoped keys never collide with legacy or other-account caches', () => {
  assert.equal(userScopedStorageKey('bottomline_cache_trades', 'user-a'), 'bottomline_cache_trades__user_user-a');
  assert.notEqual(userScopedStorageKey('bottomline_cache_trades', 'user-a'), userScopedStorageKey('bottomline_cache_trades', 'user-b'));
  assert.notEqual(userScopedStorageKey('bottomline_cache_trades', 'user-a'), 'bottomline_cache_trades');
  assert.equal(userScopedStorageKey('bottomline_cache_trades', ''), '');
});
