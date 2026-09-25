import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const settingsStart = dbSource.indexOf('const benchmarkPreferenceVersionByUser = new Map();');
const settingsEnd = dbSource.indexOf('// ============ 一次性拉取所有数据', settingsStart);
assert.ok(settingsStart >= 0 && settingsEnd > settingsStart);

// Exercise the actual production settings functions without initializing the
// Supabase client or unrelated financial tables in db.js.
const settingsCode = dbSource.slice(settingsStart, settingsEnd).replaceAll('export const ', 'const ');
const makeSettingsFunctions = new Function('deps', `
  const { supabase, cacheGet, cacheSet, console } = deps;
  ${settingsCode}
  return { fetchSettings, upsertSettings, upsertBenchmarkSymbol };
`);

function fixture(initialRow, {
  conflictOnFirstInsert = false,
  deferredRead = false,
  deferredBenchmarkWrite = false,
  authUserId = 'user-1',
} = {}) {
  const state = {
    row: initialRow ? structuredClone(initialRow) : null,
    writes: [],
    cache: new Map(),
    conflictUsed: false,
    readResolvers: [],
    writeResolvers: [],
  };
  const supabase = {
    auth: { async getUser() { return { data: { user: { id: authUserId } } }; } },
    from(table) {
      assert.equal(table, 'user_settings');
      const query = {
        operation: 'read', payload: null,
        select() {
          if (this.operation !== 'update') return this;
          state.writes.push({ kind: 'update', payload: structuredClone(this.payload) });
          const applyUpdate = () => {
            if (!state.row) return { data: [], error: null };
            state.row = { ...state.row, ...structuredClone(this.payload) };
            return { data: [{ user_id: state.row.user_id }], error: null };
          };
          if (deferredBenchmarkWrite && Object.hasOwn(this.payload, 'benchmark_symbol')) {
            return new Promise((resolve) => {
              state.writeResolvers.push(() => resolve(applyUpdate()));
            });
          }
          return Promise.resolve(applyUpdate());
        },
        eq() { return this; },
        maybeSingle() {
          const data = state.row ? structuredClone(state.row) : null;
          if (!deferredRead) return Promise.resolve({ data, error: null });
          return new Promise((resolve) => {
            state.readResolvers.push(() => resolve({ data, error: null }));
          });
        },
        update(payload) { this.operation = 'update'; this.payload = payload; return this; },
        insert(payload) {
          state.writes.push({ kind: 'insert', payload: structuredClone(payload) });
          if (conflictOnFirstInsert && !state.conflictUsed) {
            state.conflictUsed = true;
            // A concurrent request created the missing settings row first.
            state.row = {
              user_id: 'user-1', benchmark_symbol: 'QQQ', data: { theme: 'cloud' },
              watchlist_order: ['NVDA', 'META'],
            };
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
          }
          state.row = structuredClone(payload);
          return Promise.resolve({ error: null });
        },
        upsert(payload) {
          state.writes.push({ kind: 'upsert', payload: structuredClone(payload) });
          state.row = { ...(state.row || {}), ...structuredClone(payload) };
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
  };
  const functions = makeSettingsFunctions({
    supabase,
    cacheGet: (_userId, key) => state.cache.get(key) ?? null,
    cacheSet: (_userId, key, value) => state.cache.set(key, structuredClone(value)),
    console: { error() {}, warn() {} },
  });
  return { ...functions, state };
}

test('dedicated cloud benchmark wins over stale JSON and is cached as the selected symbol', async () => {
  const db = fixture({
    user_id: 'user-1', benchmark_symbol: 'SPY',
    data: { benchmarkSymbol: 'QQQ', theme: 'dark' },
    watchlist_order: ['META', 'NVDA'],
  });

  const settings = await db.fetchSettings();
  assert.equal(settings.benchmarkSymbol, 'SPY');
  assert.equal(settings.theme, 'dark');
  assert.equal(db.state.cache.get('settings').benchmarkSymbol, 'SPY');
});

test('generic settings save never replaces a benchmark selected in its dedicated column', async () => {
  const db = fixture({
    user_id: 'user-1', benchmark_symbol: 'SPY',
    data: { theme: 'dark', benchmarkSymbol: 'QQQ' },
    watchlist_order: ['META', 'NVDA'],
  });

  await db.upsertSettings({ benchmarkSymbol: 'QQQ', theme: 'light' });
  assert.equal(db.state.row.benchmark_symbol, 'SPY');
  assert.deepEqual(db.state.row.watchlist_order, ['META', 'NVDA']);
  assert.equal(db.state.row.data.theme, 'light');
  assert.equal((await db.fetchSettings()).benchmarkSymbol, 'SPY');
  assert.ok(db.state.writes.every(({ payload }) => !Object.hasOwn(payload, 'benchmark_symbol')));
});

test('explicit benchmark selection updates only the cloud column and the user cache', async () => {
  const originalData = { theme: 'dark', fgi: 42 };
  const db = fixture({
    user_id: 'user-1', benchmark_symbol: 'QQQ', data: originalData,
    watchlist_order: ['META', 'NVDA'],
  });

  await db.upsertBenchmarkSymbol('SPY', { benchmarkSymbol: 'QQQ', theme: 'light' });
  assert.equal(db.state.row.benchmark_symbol, 'SPY');
  assert.deepEqual(db.state.row.data, originalData);
  assert.deepEqual(db.state.row.watchlist_order, ['META', 'NVDA']);
  assert.equal(db.state.cache.get('settings').benchmarkSymbol, 'SPY');
  assert.deepEqual(db.state.writes.map(({ kind }) => kind), ['update']);
  assert.equal(Object.hasOwn(db.state.writes[0].payload, 'data'), false);
});

test('explicit benchmark selection creates a missing settings row using initial settings', async () => {
  const db = fixture(null);

  await db.upsertBenchmarkSymbol('SPY', { benchmarkSymbol: 'QQQ', theme: 'dark' });
  assert.equal(db.state.row.user_id, 'user-1');
  assert.equal(db.state.row.benchmark_symbol, 'SPY');
  assert.equal(db.state.row.data.theme, 'dark');
  assert.equal(db.state.cache.get('settings').benchmarkSymbol, 'SPY');
  assert.deepEqual(db.state.writes.map(({ kind }) => kind), ['update', 'insert']);
});

test('missing-row insert conflict retries a column-only update without replacing concurrent settings', async () => {
  const db = fixture(null, { conflictOnFirstInsert: true });

  await db.upsertBenchmarkSymbol('SPY', { benchmarkSymbol: 'QQQ', theme: 'local' });
  assert.deepEqual(db.state.writes.map(({ kind }) => kind), ['update', 'insert', 'update']);
  assert.equal(db.state.row.benchmark_symbol, 'SPY');
  assert.deepEqual(db.state.row.data, { theme: 'cloud' });
  assert.deepEqual(db.state.row.watchlist_order, ['NVDA', 'META']);
  assert.equal(Object.hasOwn(db.state.writes[2].payload, 'data'), false);
});

async function waitForDeferredRead(state) {
  for (let attempt = 0; attempt < 10 && state.readResolvers.length === 0; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(state.readResolvers.length, 1, 'old cloud read has begun');
}

async function waitForDeferredWrite(state) {
  for (let attempt = 0; attempt < 10 && state.writeResolvers.length === 0; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(state.writeResolvers.length, 1, 'explicit benchmark write has begun');
}

test('an old cloud read cannot replace the cached benchmark after a newer explicit write', async () => {
  const db = fixture({
    user_id: 'user-1', benchmark_symbol: 'QQQ', data: { theme: 'dark' },
  }, { deferredRead: true });

  const oldRead = db.fetchSettings();
  await waitForDeferredRead(db.state);
  await db.upsertBenchmarkSymbol('SPY', { theme: 'dark' });
  assert.equal(db.state.cache.get('settings').benchmarkSymbol, 'SPY');
  db.state.readResolvers.shift()();

  assert.equal((await oldRead).benchmarkSymbol, 'QQQ', 'the in-flight response retains its old snapshot');
  assert.equal(db.state.cache.get('settings').benchmarkSymbol, 'SPY', 'newer local fallback must survive');
  assert.equal(db.state.row.benchmark_symbol, 'SPY');
});

test('cloud read started during an in-flight benchmark write cannot later replace its successful cache', async () => {
  const db = fixture({
    user_id: 'user-1', benchmark_symbol: 'QQQ', data: { theme: 'dark' },
  }, { deferredRead: true, deferredBenchmarkWrite: true });

  const write = db.upsertBenchmarkSymbol('SPY', { theme: 'dark' });
  await waitForDeferredWrite(db.state);
  const oldRead = db.fetchSettings();
  await waitForDeferredRead(db.state);

  db.state.writeResolvers.shift()();
  await write;
  assert.equal(db.state.cache.get('settings').benchmarkSymbol, 'SPY');
  db.state.readResolvers.shift()();
  assert.equal((await oldRead).benchmarkSymbol, 'QQQ');
  assert.equal(db.state.cache.get('settings').benchmarkSymbol, 'SPY');
});

test('old account benchmark save rejects after auth switches users and writes nothing', async () => {
  const db = fixture({
    user_id: 'user-2', benchmark_symbol: 'QQQ', data: { theme: 'dark' },
  }, { authUserId: 'user-2' });

  await assert.rejects(db.upsertBenchmarkSymbol('SPY', { theme: 'dark' }, 'user-1'));
  assert.deepEqual(db.state.writes, []);
  assert.equal(db.state.row.benchmark_symbol, 'QQQ');
  assert.equal(db.state.cache.size, 0);
});

test('an old no-row cloud read cannot clear the cache after the benchmark creates its first row', async () => {
  const db = fixture(null, { deferredRead: true });

  const oldRead = db.fetchSettings();
  await waitForDeferredRead(db.state);
  await db.upsertBenchmarkSymbol('META', { theme: 'dark' });
  db.state.readResolvers.shift()();

  assert.equal(await oldRead, null);
  assert.equal(db.state.cache.get('settings').benchmarkSymbol, 'META');
  assert.equal(db.state.row.benchmark_symbol, 'META');
});

function makeSelectionHarness(writeBenchmark) {
  const start = appSource.indexOf('const selectHomeBenchmark = useCallback(');
  const end = appSource.indexOf('useEffect(() => {\n    if (!initialPendingBenchmark', start);
  assert.ok(start >= 0 && end > start, 'the production selection handler must be available');
  const makeSelectionHandler = new Function('deps', `
    const {
      useCallback, normalizeStrictUserStockSymbol, benchmarkMutationSerialRef,
      benchmarkPendingRef, benchmarkSaveQueueRef, writePendingHomeBenchmark,
      clearPendingHomeBenchmark, setBenchmarkSymbol, setBenchmarkSaveStatus,
      db, buildSettingsPayload, user, console,
    } = deps;
    ${appSource.slice(start, end)}
    return selectHomeBenchmark;
  `);
  const pending = new Map();
  const state = { symbol: 'QQQ', status: 'idle' };
  const benchmarkMutationSerialRef = { current: 0 };
  const benchmarkPendingRef = { current: null };
  const selectHomeBenchmark = makeSelectionHandler({
    useCallback: (callback) => callback,
    normalizeStrictUserStockSymbol: (value) => String(value || '').trim().toUpperCase(),
    benchmarkMutationSerialRef,
    benchmarkPendingRef,
    benchmarkSaveQueueRef: { current: Promise.resolve() },
    writePendingHomeBenchmark: (_userId, symbol) => pending.set('user-1', symbol),
    clearPendingHomeBenchmark: (_userId, symbol) => {
      if (pending.get('user-1') === symbol) pending.delete('user-1');
    },
    setBenchmarkSymbol: (symbol) => { state.symbol = symbol; },
    setBenchmarkSaveStatus: (status) => { state.status = status; },
    db: { upsertBenchmarkSymbol: writeBenchmark },
    buildSettingsPayload: (overrides) => ({ benchmarkSymbol: overrides.benchmarkSymbol }),
    user: { id: 'user-1' },
    console: { error() {} },
  });
  return { selectHomeBenchmark, pending, state, benchmarkMutationSerialRef, benchmarkPendingRef };
}

test('META to QQQ to SPY serializes cloud writes, skips the superseded choice, and clears pending only at final success', async () => {
  const calls = [];
  const resolvers = [];
  const { selectHomeBenchmark, pending, state } = makeSelectionHarness((symbol) => {
    calls.push(symbol);
    return new Promise((resolve) => resolvers.push(resolve));
  });

  const first = selectHomeBenchmark('META');
  await Promise.resolve(); // META has started its cloud request.
  const superseded = selectHomeBenchmark('QQQ');
  const latest = selectHomeBenchmark('SPY');
  await Promise.resolve();
  assert.deepEqual(calls, ['META'], 'SPY waits until the older request completes');
  assert.equal(state.symbol, 'SPY');
  assert.equal(pending.get('user-1'), 'SPY');

  resolvers[0]();
  await first;
  const skippedResult = await superseded;
  assert.equal(skippedResult.superseded, true);
  assert.equal(pending.get('user-1'), 'SPY', 'older success cannot clear the latest pending selection');
  await Promise.resolve();
  assert.deepEqual(calls, ['META', 'SPY'], 'superseded QQQ never reaches the cloud');
  assert.equal(state.status, 'saving');
  resolvers[1]();
  await latest;
  assert.equal(calls.at(-1), 'SPY');
  assert.equal(state.symbol, 'SPY');
  assert.equal(state.status, 'idle');
  assert.equal(pending.has('user-1'), false);
});

test('failed benchmark write retains the pending choice and exposes an error for retry', async () => {
  const { selectHomeBenchmark, pending, state } = makeSelectionHarness(async () => {
    throw new Error('network unavailable');
  });

  const result = await selectHomeBenchmark('META');
  assert.equal(result.success, false);
  assert.equal(result.error, 'network unavailable');
  assert.equal(state.symbol, 'META');
  assert.equal(state.status, 'error');
  assert.equal(pending.get('user-1'), 'META');
});

test('cloud read begun after selection but before save completion cannot restore the old UI symbol', async () => {
  const applyStart = appSource.indexOf('const applyCloudUserData = useCallback');
  const branchStart = appSource.indexOf('if (settings.benchmarkSymbol', applyStart);
  const branchEnd = appSource.indexOf('if (typeof settings.fgi', branchStart);
  assert.ok(applyStart >= 0 && branchStart > applyStart && branchEnd > branchStart);
  const applyBenchmarkBranch = new Function('deps', `
    const {
      settings, benchmarkMutationAtStart, benchmarkMutationSerialRef,
      benchmarkPendingRef, setBenchmarkSymbol, normalizeStrictUserStockSymbol,
    } = deps;
    ${appSource.slice(branchStart, branchEnd)}
  `);
  let resolveWrite;
  const { selectHomeBenchmark, state, benchmarkMutationSerialRef, benchmarkPendingRef } = makeSelectionHarness(
    () => new Promise((resolve) => { resolveWrite = resolve; }),
  );

  const save = selectHomeBenchmark('SPY');
  await Promise.resolve();
  assert.equal(typeof resolveWrite, 'function', 'the explicit cloud write has started');
  const benchmarkMutationAtStart = benchmarkMutationSerialRef.current;
  const oldCloudSettings = { benchmarkSymbol: 'QQQ' };

  resolveWrite();
  await save;
  assert.equal(benchmarkPendingRef.current, null, 'the save completed before the old read returns');
  applyBenchmarkBranch({
    settings: oldCloudSettings,
    benchmarkMutationAtStart,
    benchmarkMutationSerialRef,
    benchmarkPendingRef,
    setBenchmarkSymbol: (symbol) => { state.symbol = symbol; },
    normalizeStrictUserStockSymbol: (symbol) => symbol,
  });
  assert.equal(state.symbol, 'SPY');
});

test('startup retry only replays a pending choice restored at mount, not a normal first click', () => {
  const start = appSource.indexOf('useEffect(() => {\n    if (!initialPendingBenchmark');
  const marker = '}, [cloudLoading, initialPendingBenchmark, selectHomeBenchmark]);';
  const end = appSource.indexOf(marker, start);
  assert.ok(start >= 0 && end > start, 'the production startup retry effect must be available');
  const runRetryEffect = new Function('deps', `
    const {
      useEffect, initialPendingBenchmark, cloudLoading,
      benchmarkPendingRetryStartedRef, benchmarkMutationSerialRef,
      benchmarkPendingRef, selectHomeBenchmark,
    } = deps;
    ${appSource.slice(start, end + marker.length)}
  `);
  const calls = [];
  const makeDeps = ({ initialPendingBenchmark, mutationSerial, pendingSymbol }) => ({
    useEffect: (callback) => callback(),
    initialPendingBenchmark,
    cloudLoading: false,
    benchmarkPendingRetryStartedRef: { current: false },
    benchmarkMutationSerialRef: { current: mutationSerial },
    benchmarkPendingRef: { current: pendingSymbol },
    selectHomeBenchmark: (symbol) => { calls.push(symbol); return Promise.resolve({ success: true }); },
  });

  const normalClick = makeDeps({ initialPendingBenchmark: null, mutationSerial: 1, pendingSymbol: 'SPY' });
  runRetryEffect(normalClick);
  assert.deepEqual(calls, [], 'a first-session click already has its own save and must not be replayed');

  const restoredPending = makeDeps({ initialPendingBenchmark: 'META', mutationSerial: 0, pendingSymbol: 'META' });
  runRetryEffect(restoredPending);
  runRetryEffect(restoredPending);
  assert.deepEqual(calls, ['META'], 'a restored pending choice retries exactly once');
  assert.equal(restoredPending.benchmarkPendingRetryStartedRef.current, true);

  const replacedPending = makeDeps({ initialPendingBenchmark: 'QQQ', mutationSerial: 1, pendingSymbol: 'SPY' });
  runRetryEffect(replacedPending);
  assert.deepEqual(calls, ['META'], 'a new user selection supersedes the restored pending choice');
});

test('cloud reads started before a benchmark change cannot restore the previous selection', () => {
  const applyStart = appSource.indexOf('const applyCloudUserData = useCallback');
  const applyEnd = appSource.indexOf('// 启动时从 Supabase 拉取所有数据', applyStart);
  assert.ok(applyStart >= 0 && applyEnd > applyStart);
  const apply = appSource.slice(applyStart, applyEnd);
  assert.match(apply, /benchmarkMutationAtStart === benchmarkMutationSerialRef\.current\s*&& !benchmarkPendingRef\.current/);
  assert.match(appSource, /const benchmarkMutationAtStart = benchmarkMutationSerialRef\.current;\s*const result = await db\.fetchAllUserData\(\)/);
  assert.match(appSource, /applyCloudUserData\(result, '\[云端加载\]', orderMutationAtStart, benchmarkMutationAtStart\)/);
});
