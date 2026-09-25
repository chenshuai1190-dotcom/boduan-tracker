import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

// Execute the production settings functions with a small Supabase stand-in.
// Importing db.js directly would initialize the real client and its other tables.
const settingsStart = dbSource.indexOf('const benchmarkPreferenceVersionByUser = new Map();');
const settingsEnd = dbSource.indexOf('// ============ 一次性拉取所有数据', settingsStart);
const allStart = dbSource.indexOf('export const fetchAllUserData = async');
const allEnd = dbSource.indexOf('// ============ ACCOUNTS', allStart);
assert.ok(settingsStart >= 0 && settingsEnd > settingsStart && allStart >= 0 && allEnd > allStart);
const settingsCode = `${dbSource.slice(settingsStart, settingsEnd)}\n${dbSource.slice(allStart, allEnd)}`
  .replaceAll('export const ', 'const ');
const makeSettingsFunctions = new Function('deps', `
  const {
    supabase, cacheGet, cacheSet, repairCurrentUserStockSymbols,
    fetchTrades, fetchStockTrades, fetchWatchlist, fetchWaveNotes,
    fetchAccounts, fetchSnapshots, fetchInvestmentPlan, fetchMarginStatus,
    fetchDisciplines, fetchReviewLogs, fetchYearlyActuals, fetchAvailableCashStatus,
    console,
  } = deps;
  ${settingsCode}
  return { fetchSettings, upsertSettings, upsertWatchlistOrder, fetchAllUserData };
`);

function fixture(initialRow, { readError = null, missingOrderColumn = false, cachedSettings = null } = {}) {
  const state = { row: initialRow ? structuredClone(initialRow) : null, writes: [], cache: new Map() };
  if (cachedSettings) state.cache.set('settings', structuredClone(cachedSettings));
  const supabase = {
    auth: { async getUser() { return { data: { user: { id: 'user-1' } } }; } },
    from(table) {
      assert.equal(table, 'user_settings');
      const query = {
        operation: 'read', payload: null,
        select() {
          if (this.operation === 'update') {
            state.writes.push({ kind: 'update', payload: this.payload });
            if (missingOrderColumn && Object.hasOwn(this.payload, 'watchlist_order')) {
              return Promise.resolve({ data: null, error: {
                code: 'PGRST204',
                message: "Could not find the 'watchlist_order' column of 'user_settings' in the schema cache",
              } });
            }
            if (!state.row) return Promise.resolve({ data: [], error: null });
            state.row = { ...state.row, ...this.payload };
            return Promise.resolve({ data: [{ user_id: state.row.user_id }], error: null });
          }
          return this;
        },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: state.row && structuredClone(state.row), error: readError }); },
        update(payload) { this.operation = 'update'; this.payload = payload; return this; },
        insert(payload) {
          state.writes.push({ kind: 'insert', payload });
          if (missingOrderColumn && Object.hasOwn(payload, 'watchlist_order')) return Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'watchlist_order' column" } });
          state.row = structuredClone(payload);
          return Promise.resolve({ error: null });
        },
        upsert(payload) {
          state.writes.push({ kind: 'upsert', payload });
          state.row = { ...(state.row || {}), ...structuredClone(payload) };
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
  };
  const noRows = async () => [];
  const functions = makeSettingsFunctions({
    supabase,
    cacheGet: (_userId, key) => state.cache.get(key) ?? null,
    cacheSet: (_userId, key, value) => state.cache.set(key, structuredClone(value)),
    repairCurrentUserStockSymbols: async () => ({ repaired: 0, tables: [] }),
    fetchTrades: noRows, fetchStockTrades: noRows, fetchWatchlist: noRows, fetchWaveNotes: noRows,
    fetchAccounts: noRows, fetchSnapshots: noRows, fetchInvestmentPlan: noRows,
    fetchMarginStatus: noRows, fetchDisciplines: noRows, fetchReviewLogs: noRows,
    fetchYearlyActuals: noRows, fetchAvailableCashStatus: noRows,
    console: { error() {}, warn() {}, info() {} },
  });
  return { ...functions, state };
}

test('dedicated cloud order wins over stale legacy JSON and survives later generic settings saves', async () => {
  const db = fixture({
    user_id: 'user-1', benchmark_symbol: 'SPY',
    data: { theme: 'dark', watchlistOrder: ['AAA', 'BBB'] },
    watchlist_order: ['BBB', 'AAA'],
  });
  assert.deepEqual((await db.fetchSettings()).watchlistOrder, ['BBB', 'AAA']);
  assert.deepEqual(db.state.cache.get('settings').watchlistOrder, ['BBB', 'AAA']);

  await db.upsertSettings({ benchmarkSymbol: 'QQQ', theme: 'dark', watchlistOrder: ['AAA', 'BBB'] });
  assert.deepEqual(db.state.row.watchlist_order, ['BBB', 'AAA']);
  assert.deepEqual((await db.fetchSettings()).watchlistOrder, ['BBB', 'AAA']);
});

test('failed settings read can show cached order but remains untrusted for automatic cloud writes', async () => {
  const db = fixture(null, {
    readError: { message: 'network unavailable' },
    cachedSettings: { benchmarkSymbol: 'SPY', watchlistOrder: ['BBB', 'AAA'] },
  });
  const result = await db.fetchAllUserData();
  assert.deepEqual(result.settings.watchlistOrder, ['BBB', 'AAA']);
  assert.equal(result._settingsCloudReady, false);
  assert.ok(result._failedTables.includes('settings'));
  assert.equal(db.state.writes.length, 0);

  const autoSave = appSource.indexOf('db.upsertSettings(buildSettingsPayload())');
  assert.ok(autoSave >= 0, 'automatic settings save must remain identifiable');
  assert.match(appSource.slice(autoSave - 400, autoSave), /if\s*\(\s*cloudLoading\s*\|\|\s*!settingsCloudReady\s*\)\s*return/);
});

test('saving drag order changes only the dedicated column, not other settings fields', async () => {
  const oldData = { fgi: { value: 42 }, theme: 'dark', watchlistOrder: ['AAA', 'BBB'] };
  const db = fixture({ user_id: 'user-1', benchmark_symbol: 'SPY', data: oldData, watchlist_order: ['AAA', 'BBB'] });
  await db.upsertWatchlistOrder(['BBB', 'AAA'], { benchmarkSymbol: 'QQQ', theme: 'light' });
  assert.deepEqual(db.state.row.watchlist_order, ['BBB', 'AAA']);
  assert.deepEqual(db.state.row.data, oldData);
  assert.equal(db.state.row.benchmark_symbol, 'SPY');
  assert.deepEqual(db.state.cache.get('settings').watchlistOrder, ['BBB', 'AAA']);
  assert.deepEqual(db.state.writes.map(write => write.kind), ['update']);
  assert.equal(Object.hasOwn(db.state.writes[0].payload, 'data'), false);
});

test('a missing settings row is initialized with the new order and retains other initial settings', async () => {
  const db = fixture(null);
  await db.upsertWatchlistOrder(['BBB', 'AAA'], { benchmarkSymbol: 'SPY', theme: 'dark' });
  assert.deepEqual(db.state.row.watchlist_order, ['BBB', 'AAA']);
  assert.equal(db.state.row.benchmark_symbol, 'SPY');
  assert.equal(db.state.row.data.theme, 'dark');
  assert.deepEqual(db.state.writes.map(write => write.kind), ['update', 'insert']);
});

test('before the schema migration, dedicated-order writes retain the legacy order as a fallback', async () => {
  const db = fixture({
    user_id: 'user-1', benchmark_symbol: 'SPY', data: { theme: 'dark', watchlistOrder: ['AAA', 'BBB'] },
  }, { missingOrderColumn: true });
  await db.upsertWatchlistOrder(['BBB', 'AAA'], { benchmarkSymbol: 'SPY', theme: 'dark' });
  assert.deepEqual(db.state.row.data.watchlistOrder, ['BBB', 'AAA']);
  assert.equal(db.state.row.data.theme, 'dark');
  assert.deepEqual((await db.fetchSettings()).watchlistOrder, ['BBB', 'AAA']);
});

test('home drag writes the explicit order and generic settings autosave is gated by cloud readiness', () => {
  const reorderStart = appSource.indexOf('const reorderWatchlist = async');
  const reorderEnd = appSource.indexOf('const deleteWatchlistItem = async', reorderStart);
  assert.ok(reorderStart >= 0 && reorderEnd > reorderStart);
  assert.match(appSource.slice(reorderStart, reorderEnd), /db\.upsertWatchlistOrder\(nextOrder/);
  assert.match(appSource, /_settingsCloudReady/);
  const applyStart = appSource.indexOf('const applyCloudUserData = useCallback');
  const applyEnd = appSource.indexOf('// 保存设置到云端', applyStart);
  const cloudApply = appSource.slice(applyStart, applyEnd);
  assert.match(cloudApply, /orderMutationAtStart !== watchlistOrderMutationSerialRef\.current/);
  assert.match(cloudApply, /const orderMutationAtStart = watchlistOrderMutationSerialRef\.current;\s*const benchmarkMutationAtStart = benchmarkMutationSerialRef\.current;\s*const result = await db\.fetchAllUserData\(\)/);
  assert.match(cloudApply, /applyCloudUserData\(result, '\[云端加载\]', orderMutationAtStart, benchmarkMutationAtStart\)/);
});
