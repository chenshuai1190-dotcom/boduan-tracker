import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const functionStart = dbSource.indexOf('export const deleteSnapshot = async (accountId, month) => {');
const functionEnd = dbSource.indexOf('\n// ============ INVESTMENT_PLAN', functionStart);

assert.notEqual(functionStart, -1, 'deleteSnapshot must be exported from db.js');
assert.notEqual(functionEnd, -1, 'deleteSnapshot must remain in the balance snapshot section');

const functionSource = dbSource
  .slice(functionStart, functionEnd)
  .replace(
    'export const deleteSnapshot = async (accountId, month) => {',
    'export const createDeleteSnapshot = (supabase) => async (accountId, month) => {',
  )
  .replace("const cached = cacheGet(user.id, 'snapshots');", "const cached = null;");
const { createDeleteSnapshot } = await import(
  `data:text/javascript;base64,${Buffer.from(functionSource).toString('base64')}`
);

function createSupabaseStub({ userId = 'user-a', deleteError = null } = {}) {
  const state = {
    authCalls: 0,
    fromCalls: [],
    deleteCalls: 0,
    filters: [],
  };

  const query = {
    delete() {
      state.deleteCalls += 1;
      return this;
    },
    eq(field, value) {
      state.filters.push([field, value]);
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve({ error: deleteError }).then(resolve, reject);
    },
  };

  return {
    state,
    client: {
      auth: {
        async getUser() {
          state.authCalls += 1;
          return { data: { user: userId ? { id: userId } : null } };
        },
      },
      from(table) {
        state.fromCalls.push(table);
        return query;
      },
    },
  };
}

test('deleteSnapshot scopes deletion to the current user, account, and month', async () => {
  const { client, state } = createSupabaseStub();
  const deleteSnapshot = createDeleteSnapshot(client);

  await deleteSnapshot('account-a', '2026-07');

  assert.equal(state.authCalls, 1);
  assert.deepEqual(state.fromCalls, ['balance_snapshots']);
  assert.equal(state.deleteCalls, 1);
  assert.deepEqual(state.filters, [
    ['account_id', 'account-a'],
    ['month', '2026-07'],
    ['user_id', 'user-a'],
  ]);
});

test('deleteSnapshot rejects unauthenticated deletion before opening a table query', async () => {
  const { client, state } = createSupabaseStub({ userId: null });
  const deleteSnapshot = createDeleteSnapshot(client);

  await assert.rejects(deleteSnapshot('account-a', '2026-07'), /\u672a\u767b\u5f55/);
  assert.equal(state.authCalls, 1);
  assert.deepEqual(state.fromCalls, []);
  assert.equal(state.deleteCalls, 0);
  assert.deepEqual(state.filters, []);
});

test('deleteSnapshot propagates database deletion errors', async () => {
  const deleteError = new Error('delete failed');
  const { client, state } = createSupabaseStub({ deleteError });
  const deleteSnapshot = createDeleteSnapshot(client);

  await assert.rejects(deleteSnapshot('account-a', '2026-07'), (error) => error === deleteError);
  assert.deepEqual(state.filters, [
    ['account_id', 'account-a'],
    ['month', '2026-07'],
    ['user_id', 'user-a'],
  ]);
});

test('deleteSnapshot rejects an invalid month before authentication or database access', async () => {
  const { client, state } = createSupabaseStub();
  const deleteSnapshot = createDeleteSnapshot(client);

  await assert.rejects(deleteSnapshot('account-a', '2026-13'), /快照参数无效/);
  assert.equal(state.authCalls, 0);
  assert.deepEqual(state.fromCalls, []);
  assert.equal(state.deleteCalls, 0);
});
