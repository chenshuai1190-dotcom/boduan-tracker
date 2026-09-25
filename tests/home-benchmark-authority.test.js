import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeStrictUserStockSymbol } from '../src/lib/symbols.js';

const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const begin = dbSource.indexOf("const HOME_BENCHMARK_TABLE = 'home_benchmark_preferences';");
const end = dbSource.indexOf('// Legacy compatibility only.', begin);
assert.ok(begin >= 0 && end > begin);
const preferenceCode = dbSource.slice(begin, end).replaceAll('export const ', 'const ');
const makePreferenceFunctions = new Function('deps', `
  const { supabase, normalizeStrictUserStockSymbol } = deps;
  ${preferenceCode}
  return { fetchBenchmarkPreference, saveBenchmarkPreference };
`);

function fixture(initialRow = null, {
  userId = 'user-1', readError = null, switchUserDuringUpdate = false,
} = {}) {
  const state = {
    userId,
    home: initialRow ? structuredClone(initialRow) : null,
    legacy: { user_id: userId, benchmark_symbol: 'GOOGL' },
    writes: [],
    authCalls: 0,
    readError,
  };
  const supabase = {
    auth: {
      async getUser() {
        state.authCalls += 1;
        return { data: { user: { id: state.userId } } };
      },
    },
    from(table) {
      assert.equal(table, 'home_benchmark_preferences', 'new runtime must not write the legacy settings row');
      const query = {
        operation: 'read', payload: null, filters: {},
        select() { return this; },
        eq(column, value) { this.filters[column] = value; return this; },
        update(payload) { this.operation = 'update'; this.payload = payload; return this; },
        insert(payload) { this.operation = 'insert'; this.payload = payload; return this; },
        async maybeSingle() {
          if (this.operation === 'read') {
            if (state.readError) return { data: null, error: state.readError };
            return { data: state.home ? structuredClone(state.home) : null, error: null };
          }
          state.writes.push({ kind: 'update', payload: structuredClone(this.payload), filters: { ...this.filters } });
          if (switchUserDuringUpdate) state.userId = 'user-2';
          if (!state.home || this.filters.user_id !== state.home.user_id
            || this.filters.revision !== state.home.revision) {
            return { data: null, error: null };
          }
          state.home = { ...state.home, ...structuredClone(this.payload) };
          return { data: structuredClone(state.home), error: null };
        },
        async single() {
          state.writes.push({ kind: 'insert', payload: structuredClone(this.payload) });
          if (state.home) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          state.home = structuredClone(this.payload);
          return { data: structuredClone(state.home), error: null };
        },
      };
      return query;
    },
  };
  return {
    state,
    ...makePreferenceFunctions({ supabase, normalizeStrictUserStockSymbol }),
  };
}

test('old whole-settings writes cannot replace the independent authoritative benchmark', async () => {
  const db = fixture({ user_id: 'user-1', symbol: 'QQQ', revision: 4 });
  assert.deepEqual(await db.fetchBenchmarkPreference(), { symbol: 'QQQ', revision: 4, exists: true });

  // Simulate a still-open old bundle repeatedly upserting user_settings.
  db.state.legacy = { user_id: 'user-1', benchmark_symbol: 'GOOGL', data: { benchmarkSymbol: 'GOOGL' } };
  assert.deepEqual(await db.fetchBenchmarkPreference(), { symbol: 'QQQ', revision: 4, exists: true });
  const saved = await db.saveBenchmarkPreference('META', 4, 'user-1');
  assert.deepEqual(saved, { symbol: 'META', revision: 5, exists: true });
  db.state.legacy.benchmark_symbol = 'GOOGL';
  assert.equal((await db.fetchBenchmarkPreference()).symbol, 'META');
  assert.deepEqual(db.state.writes.map((write) => write.kind), ['update']);
});

test('missing preference is an explicit QQQ default; first selection inserts its own row', async () => {
  const db = fixture();
  assert.deepEqual(await db.fetchBenchmarkPreference(), { symbol: 'QQQ', revision: null, exists: false });
  const saved = await db.saveBenchmarkPreference('SPY', null, 'user-1');
  assert.deepEqual(saved, { symbol: 'SPY', revision: 1, exists: true });
  assert.equal(db.state.home.symbol, 'SPY');
  assert.equal(db.state.legacy.benchmark_symbol, 'GOOGL');
});

test('stale revision cannot overwrite a newer choice and returns the current cloud value', async () => {
  const db = fixture({ user_id: 'user-1', symbol: 'QQQ', revision: 2 });
  await db.saveBenchmarkPreference('META', 2, 'user-1');
  await assert.rejects(
    db.saveBenchmarkPreference('GOOGL', 2, 'user-1'),
    (error) => {
      assert.equal(error.code, 'BENCHMARK_PREFERENCE_CONFLICT');
      assert.deepEqual(error.current, { symbol: 'META', revision: 3, exists: true });
      return true;
    },
  );
  assert.equal(db.state.home.symbol, 'META');
});

test('simultaneous first inserts report a revision conflict instead of replacing the existing row', async () => {
  const db = fixture({ user_id: 'user-1', symbol: 'QQQ', revision: 1 });
  await assert.rejects(
    db.saveBenchmarkPreference('GOOGL', null, 'user-1'),
    (error) => error.code === 'BENCHMARK_PREFERENCE_CONFLICT'
      && error.current.symbol === 'QQQ'
      && error.current.revision === 1,
  );
  assert.equal(db.state.home.symbol, 'QQQ');
});

test('a failed authoritative read never falls back to stale user_settings', async () => {
  const db = fixture(null, { readError: { message: 'network unavailable' } });
  await assert.rejects(db.fetchBenchmarkPreference(), (error) => error.message === 'network unavailable');
  assert.equal(db.state.legacy.benchmark_symbol, 'GOOGL');
});

test('save rejects an account switch before issuing a write', async () => {
  const db = fixture({ user_id: 'user-2', symbol: 'QQQ', revision: 1 }, { userId: 'user-2' });
  await assert.rejects(db.saveBenchmarkPreference('META', 1, 'user-1'), /账号已切换/);
  assert.deepEqual(db.state.writes, []);
});

test('account switch during a zero-row CAS is not mistaken for a version conflict', async () => {
  const db = fixture({ user_id: 'user-1', symbol: 'QQQ', revision: 2 }, { switchUserDuringUpdate: true });
  await assert.rejects(db.saveBenchmarkPreference('META', 1, 'user-1'), /账号已切换/);
  assert.equal(db.state.home.symbol, 'QQQ');
});

test('read with a pre-fetched user avoids another auth request', async () => {
  const db = fixture({ user_id: 'user-1', symbol: 'QQQ', revision: 0 });
  const value = await db.fetchBenchmarkPreference({ id: 'user-1' });
  assert.equal(value.revision, 0);
  assert.equal(db.state.authCalls, 0);
});

test('direct preference read rejects after the active account changes', async () => {
  const db = fixture({ user_id: 'user-2', symbol: 'QQQ', revision: 1 }, { userId: 'user-2' });
  await assert.rejects(db.fetchBenchmarkPreference(null, 'user-1'), /账号已切换/);
  assert.equal(db.state.authCalls, 1);
});

test('foundation backfill is one-time and old settings writes cannot target the new table', () => {
  const sql = readFileSync(new URL('../supabase/home_benchmark_preferences_20260925.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.home_benchmark_preferences/);
  assert.match(sql, /from public\.user_settings as settings/);
  assert.match(sql, /from pg_temp\._home_benchmark_seed_20260925\s+where true\s+on conflict \(user_id\) do nothing/i);
  assert.match(sql, /invalid legacy symbols/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all privileges on table public\.home_benchmark_preferences\s+from public, anon, authenticated/);
  assert.match(sql, /using \(auth\.uid\(\) = user_id\)/);
  assert.doesNotMatch(sql, /create trigger|on public\.user_settings\s+for (insert|update)/i);
});
