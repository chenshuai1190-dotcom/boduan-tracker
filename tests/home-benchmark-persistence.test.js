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

function makeSelectionHarness(writeBenchmark, {
  preference = { symbol: 'QQQ', revision: 4, exists: true, loaded: true },
  readPreference = async () => ({ symbol: 'QQQ', revision: 4, exists: true }),
  sharedPending = new Map(),
  createSelectionId = null,
} = {}) {
  const start = appSource.indexOf('const selectHomeBenchmark = useCallback(');
  const end = appSource.indexOf('useEffect(() => {\n    if (!initialPendingBenchmark', start);
  assert.ok(start >= 0 && end > start, 'the production selection handler must be available');
  const makeSelectionHandler = new Function('deps', `
    const {
      useCallback, normalizeStrictUserStockSymbol, benchmarkMutationSerialRef,
      benchmarkPendingRef, benchmarkSaveQueueRef, writePendingHomeBenchmark,
      clearPendingHomeBenchmark, setBenchmarkSymbol, setBenchmarkSaveStatus,
      benchmarkPreferenceRef, createHomeBenchmarkSelectionId, db, user, console,
    } = deps;
    ${appSource.slice(start, end)}
    return selectHomeBenchmark;
  `);
  const pending = sharedPending;
  const state = { symbol: 'QQQ', status: 'loading' };
  let selectionCount = 0;
  const benchmarkMutationSerialRef = { current: 0 };
  const benchmarkPendingRef = { current: null };
  const benchmarkPreferenceRef = { current: { ...preference } };
  const selectHomeBenchmark = makeSelectionHandler({
    useCallback: (callback) => callback,
    normalizeStrictUserStockSymbol: (value) => String(value || '').trim().toUpperCase(),
    benchmarkMutationSerialRef,
    benchmarkPendingRef,
    benchmarkPreferenceRef,
    benchmarkSaveQueueRef: { current: Promise.resolve() },
    createHomeBenchmarkSelectionId: createSelectionId || (() => `selection-${++selectionCount}`),
    writePendingHomeBenchmark: (_userId, selection, expectedId = null) => {
      if (expectedId && pending.get('user-1')?.id !== expectedId) return false;
      pending.set('user-1', selection);
      return true;
    },
    clearPendingHomeBenchmark: (_userId, selectionId) => {
      if (pending.get('user-1')?.id === selectionId) pending.delete('user-1');
    },
    setBenchmarkSymbol: (symbol) => { state.symbol = symbol; },
    setBenchmarkSaveStatus: (status) => { state.status = status; },
    db: { fetchBenchmarkPreference: readPreference, saveBenchmarkPreference: writeBenchmark },
    user: { id: 'user-1' },
    console: { error() {} },
  });
  return {
    selectHomeBenchmark, pending, state, benchmarkMutationSerialRef,
    benchmarkPendingRef, benchmarkPreferenceRef,
  };
}

test('META to QQQ to SPY serializes cloud writes, skips the superseded choice, and clears pending only at final success', async () => {
  const calls = [];
  const resolvers = [];
  const { selectHomeBenchmark, pending, state } = makeSelectionHarness((symbol, revision) => {
    calls.push({ symbol, revision });
    return new Promise((resolve) => resolvers.push(resolve));
  });

  const first = selectHomeBenchmark('META');
  await Promise.resolve(); // META has started its cloud request.
  const superseded = selectHomeBenchmark('QQQ');
  const latest = selectHomeBenchmark('SPY');
  await Promise.resolve();
  assert.deepEqual(calls, [{ symbol: 'META', revision: 4 }], 'SPY waits until the older request completes');
  assert.equal(state.symbol, 'SPY');
  assert.equal(pending.get('user-1').symbol, 'SPY');
  assert.equal(pending.get('user-1').revision, 4);
  assert.equal(pending.get('user-1').id, 'selection-3',
    'the latest queued intent replaces the old pending record immediately');

  resolvers[0]({ symbol: 'META', revision: 5, exists: true });
  await first;
  const skippedResult = await superseded;
  assert.equal(skippedResult.superseded, true);
  assert.equal(pending.get('user-1').symbol, 'SPY', 'older success cannot restore the superseded pending selection');
  await Promise.resolve();
  assert.deepEqual(calls, [
    { symbol: 'META', revision: 4 }, { symbol: 'SPY', revision: 5 },
  ], 'superseded QQQ never reaches the cloud and the final write uses the new revision');
  assert.equal(state.status, 'saving');
  assert.equal(pending.get('user-1').symbol, 'SPY');
  assert.equal(pending.get('user-1').revision, 5);
  assert.equal(pending.get('user-1').id, 'selection-3');
  resolvers[1]({ symbol: 'SPY', revision: 6, exists: true });
  await latest;
  assert.equal(calls.at(-1).symbol, 'SPY');
  assert.equal(state.symbol, 'SPY');
  assert.equal(state.status, 'idle');
  assert.equal(pending.has('user-1'), false);
});

test('Tab A cannot rewrite Tab B pending after its delayed authority read', async () => {
  const sharedPending = new Map();
  let id = 0;
  const createSelectionId = () => `shared-${++id}`;
  let resolveReadA;
  let tabAWrites = 0;
  const tabA = makeSelectionHarness(async () => {
    tabAWrites += 1;
    return { symbol: 'META', revision: 5, exists: true };
  }, {
    preference: { symbol: 'QQQ', revision: null, exists: false, loaded: false },
    readPreference: () => new Promise((resolve) => { resolveReadA = resolve; }),
    sharedPending, createSelectionId,
  });
  const saveA = tabA.selectHomeBenchmark('META');
  await Promise.resolve();
  assert.equal(typeof resolveReadA, 'function');
  assert.equal(sharedPending.get('user-1').id, 'shared-1');

  let resolveWriteB;
  const tabB = makeSelectionHarness(
    () => new Promise((resolve) => { resolveWriteB = resolve; }),
    { sharedPending, createSelectionId },
  );
  const saveB = tabB.selectHomeBenchmark('SPY');
  await Promise.resolve();
  assert.equal(sharedPending.get('user-1').id, 'shared-2');
  resolveReadA({ symbol: 'QQQ', revision: 4, exists: true });
  const resultA = await saveA;
  assert.equal(resultA.superseded, true);
  assert.equal(tabAWrites, 0);
  assert.deepEqual(sharedPending.get('user-1'), {
    id: 'shared-2', symbol: 'SPY', revision: 4,
  });

  resolveWriteB({ symbol: 'SPY', revision: 5, exists: true });
  await saveB;
  assert.equal(sharedPending.has('user-1'), false);
});

test('Tab A cannot clear Tab B pending when its older cloud write finally succeeds', async () => {
  const sharedPending = new Map();
  let id = 0;
  const createSelectionId = () => `shared-${++id}`;
  let resolveWriteA;
  const tabA = makeSelectionHarness(
    () => new Promise((resolve) => { resolveWriteA = resolve; }),
    { sharedPending, createSelectionId },
  );
  const saveA = tabA.selectHomeBenchmark('META');
  await Promise.resolve();
  assert.equal(typeof resolveWriteA, 'function');

  let resolveWriteB;
  const tabB = makeSelectionHarness(
    () => new Promise((resolve) => { resolveWriteB = resolve; }),
    { sharedPending, createSelectionId },
  );
  const saveB = tabB.selectHomeBenchmark('SPY');
  await Promise.resolve();
  assert.equal(sharedPending.get('user-1').id, 'shared-2');
  resolveWriteA({ symbol: 'META', revision: 5, exists: true });
  await saveA;
  assert.equal(sharedPending.get('user-1').id, 'shared-2');
  assert.equal(sharedPending.get('user-1').symbol, 'SPY');

  resolveWriteB({ symbol: 'SPY', revision: 5, exists: true });
  await saveB;
  assert.equal(sharedPending.has('user-1'), false);
});

test('closing amid rapid choices keeps the last intent, then a changed cloud revision blocks replay', async () => {
  const sharedPending = new Map();
  let resolveFirstWrite;
  const original = makeSelectionHarness(
    () => new Promise((resolve) => { resolveFirstWrite = resolve; }),
    { sharedPending },
  );
  const first = original.selectHomeBenchmark('META');
  await Promise.resolve();
  const last = original.selectHomeBenchmark('SPY');
  const persistedAtClose = structuredClone(sharedPending.get('user-1'));
  assert.deepEqual(persistedAtClose, { id: 'selection-2', symbol: 'SPY', revision: 4 });

  let restartWrites = 0;
  const restart = makeSelectionHarness(async () => {
    restartWrites += 1;
    return { symbol: 'SPY', revision: 6, exists: true };
  }, {
    preference: { symbol: 'QQQ', revision: null, exists: false, loaded: false },
    readPreference: async () => ({ symbol: 'META', revision: 5, exists: true }),
    sharedPending,
  });
  const resumed = await restart.selectHomeBenchmark(persistedAtClose.symbol, {
    retryRevision: persistedAtClose.revision,
    retrySelectionId: persistedAtClose.id,
  });
  assert.deepEqual(resumed, { success: false, conflict: true });
  assert.equal(restartWrites, 0);
  assert.equal(restart.state.symbol, 'SPY');
  assert.equal(restart.state.status, 'conflict');
  assert.deepEqual(sharedPending.get('user-1'), persistedAtClose);

  // Simulate the old page disappearing before its queued final write starts.
  original.benchmarkMutationSerialRef.current += 1;
  resolveFirstWrite({ symbol: 'META', revision: 5, exists: true });
  await first;
  assert.equal((await last).superseded, true);
  assert.deepEqual(sharedPending.get('user-1'), persistedAtClose);
});

test('cold start marks benchmark as loading until authority is available', () => {
  assert.match(appSource, /\[benchmarkSaveStatus, setBenchmarkSaveStatus\]\s*=\s*useState\(initialPendingBenchmark\s*\?\s*'pending'\s*:\s*'loading'\)/);
});

test('direct benchmark read passes the active account ID for switch protection', async () => {
  const readCalls = [];
  const harness = makeSelectionHarness(async (symbol, revision) => ({
    symbol, revision: revision + 1, exists: true,
  }), {
    preference: { symbol: 'QQQ', revision: null, exists: false, loaded: false },
    readPreference: async (...args) => {
      readCalls.push(args);
      return { symbol: 'QQQ', revision: 4, exists: true };
    },
  });
  await harness.selectHomeBenchmark('META');
  assert.deepEqual(readCalls, [[null, 'user-1']]);
});

test('failed authoritative write retains a versioned pending choice for safe retry', async () => {
  const { selectHomeBenchmark, pending, state } = makeSelectionHarness(async () => {
    throw new Error('network unavailable');
  });

  const result = await selectHomeBenchmark('META');
  assert.equal(result.success, false);
  assert.equal(result.error, 'network unavailable');
  assert.equal(state.symbol, 'META');
  assert.equal(state.status, 'error');
  assert.deepEqual(pending.get('user-1'), { id: 'selection-1', symbol: 'META', revision: 4 });
});

test('another new tab winning CAS preserves the unsynced choice without replaying it', async () => {
  const conflict = new Error('基准股票已在其他页面更新');
  conflict.code = 'BENCHMARK_PREFERENCE_CONFLICT';
  conflict.current = { symbol: 'GOOGL', revision: 5, exists: true };
  let writeCount = 0;
  const { selectHomeBenchmark, pending, state, benchmarkPreferenceRef } = makeSelectionHarness(async () => {
    writeCount += 1;
    throw conflict;
  });

  const result = await selectHomeBenchmark('META');
  assert.deepEqual(result, { success: false, conflict: true });
  assert.equal(writeCount, 1);
  assert.equal(state.symbol, 'META');
  assert.equal(state.status, 'conflict');
  assert.deepEqual(pending.get('user-1'), { id: 'selection-1', symbol: 'META', revision: 4 });
  assert.equal(benchmarkPreferenceRef.current.revision, 5);
  assert.equal(benchmarkPreferenceRef.current.symbol, 'GOOGL');
});

test('v2 pending retry with an obsolete revision does not issue a write', async () => {
  let writeCount = 0;
  const { selectHomeBenchmark, pending, state } = makeSelectionHarness(async () => {
    writeCount += 1;
    return { symbol: 'QQQ', revision: 7, exists: true };
  }, { preference: { symbol: 'GOOGL', revision: 6, exists: true, loaded: true } });

  const result = await selectHomeBenchmark('QQQ', { retryRevision: 4 });
  assert.deepEqual(result, { success: false, conflict: true });
  assert.equal(writeCount, 0);
  assert.equal(state.symbol, 'QQQ');
  assert.equal(state.status, 'conflict');
  assert.deepEqual(pending.get('user-1'), { id: 'selection-1', symbol: 'QQQ', revision: 4 });
});

test('failed first authoritative read keeps an unknown-base intent that cannot overwrite cloud on restart', async () => {
  let writeCount = 0;
  const { selectHomeBenchmark, pending, state } = makeSelectionHarness(async () => {
    writeCount += 1;
    return { symbol: 'META', revision: 1, exists: true };
  }, {
    preference: { symbol: 'QQQ', revision: null, exists: false, loaded: false },
    readPreference: async () => { throw new Error('cloud read unavailable'); },
  });

  const result = await selectHomeBenchmark('META');
  assert.equal(result.success, false);
  assert.equal(result.error, 'cloud read unavailable');
  assert.equal(state.status, 'error');
  assert.equal(writeCount, 0);
  assert.deepEqual(pending.get('user-1'), { id: 'selection-1', symbol: 'META', revision: 'unknown' });

  const parserStart = appSource.indexOf('function readPendingHomeBenchmark(userId) {');
  const parserEnd = appSource.indexOf('function writePendingHomeBenchmark(', parserStart);
  assert.ok(parserStart >= 0 && parserEnd > parserStart);
  const parsePending = new Function('deps', `
    const {
      localStorage, userScopedStorageKey, normalizeStrictUserStockSymbol,
      PENDING_HOME_BENCHMARK_STORAGE_KEY,
    } = deps;
    ${appSource.slice(parserStart, parserEnd)}
    return readPendingHomeBenchmark;
  `)({
    localStorage: { getItem: () => JSON.stringify(pending.get('user-1')) },
    userScopedStorageKey: () => 'test-key',
    normalizeStrictUserStockSymbol: (symbol) => symbol,
    PENDING_HOME_BENCHMARK_STORAGE_KEY: 'pending-test-key',
  });
  assert.deepEqual(parsePending('user-1'), { id: 'selection-1', symbol: 'META', revision: 'unknown' });

  const restart = makeSelectionHarness(async () => {
    writeCount += 1;
    return { symbol: 'META', revision: 5, exists: true };
  }, {
    preference: { symbol: 'QQQ', revision: null, exists: false, loaded: false },
    readPreference: async () => ({ symbol: 'QQQ', revision: 4, exists: true }),
    sharedPending: pending,
  });
  const restarted = await restart.selectHomeBenchmark('META', {
    retryRevision: 'unknown', retrySelectionId: 'selection-1',
  });
  assert.deepEqual(restarted, { success: false, conflict: true });
  assert.equal(writeCount, 0, 'unknown base may be compared but must never write');
  assert.equal(restart.state.symbol, 'META');
  assert.equal(restart.state.status, 'conflict');
  assert.deepEqual(pending.get('user-1'), { id: 'selection-1', symbol: 'META', revision: 'unknown' });
});

test('cloud read begun after selection but before save completion cannot restore the old UI symbol', async () => {
  const applyStart = appSource.indexOf('const applyCloudUserData = useCallback');
  const branchStart = appSource.indexOf('if (benchmarkMutationAtStart === benchmarkMutationSerialRef.current)', applyStart);
  const branchEnd = appSource.indexOf('if (settings) {', branchStart);
  assert.ok(applyStart >= 0 && branchStart > applyStart && branchEnd > branchStart);
  const applyBenchmarkBranch = new Function('deps', `
    const {
      benchmarkPreference, benchmarkMutationAtStart, benchmarkMutationSerialRef,
      benchmarkPendingRef, setBenchmarkSymbol, normalizeStrictUserStockSymbol,
      benchmarkPreferenceRef, setBenchmarkSaveStatus,
    } = deps;
    ${appSource.slice(branchStart, branchEnd)}
  `);
  let resolveWrite;
  const { selectHomeBenchmark, state, benchmarkMutationSerialRef, benchmarkPendingRef, benchmarkPreferenceRef } = makeSelectionHarness(
    () => new Promise((resolve) => { resolveWrite = resolve; }),
  );

  const save = selectHomeBenchmark('SPY');
  await Promise.resolve();
  assert.equal(typeof resolveWrite, 'function', 'the explicit cloud write has started');
  const benchmarkMutationAtStart = benchmarkMutationSerialRef.current;
  const oldCloudPreference = { symbol: 'QQQ', revision: 4, exists: true };

  resolveWrite({ symbol: 'SPY', revision: 5, exists: true });
  await save;
  assert.equal(benchmarkPendingRef.current, null, 'the save completed before the old read returns');
  applyBenchmarkBranch({
    benchmarkPreference: oldCloudPreference,
    benchmarkMutationAtStart,
    benchmarkMutationSerialRef,
    benchmarkPendingRef,
    benchmarkPreferenceRef,
    setBenchmarkSymbol: (symbol) => { state.symbol = symbol; },
    setBenchmarkSaveStatus: (status) => { state.status = status; },
    normalizeStrictUserStockSymbol: (symbol) => symbol,
  });
  assert.equal(state.symbol, 'SPY');
});

test('a late lower-revision read or missing row cannot replace a newer loaded benchmark', () => {
  const applyStart = appSource.indexOf('const applyCloudUserData = useCallback');
  const branchStart = appSource.indexOf('if (benchmarkMutationAtStart === benchmarkMutationSerialRef.current)', applyStart);
  const branchEnd = appSource.indexOf('if (settings) {', branchStart);
  assert.ok(applyStart >= 0 && branchStart > applyStart && branchEnd > branchStart);
  const applyBenchmarkBranch = new Function('deps', `
    const {
      benchmarkPreference, benchmarkMutationAtStart, benchmarkMutationSerialRef,
      benchmarkPendingRef, benchmarkPreferenceRef, setBenchmarkSymbol,
      setBenchmarkSaveStatus, normalizeStrictUserStockSymbol,
    } = deps;
    ${appSource.slice(branchStart, branchEnd)}
  `);
  const preferenceRef = { current: { symbol: 'QQQ', revision: 5, exists: true, loaded: true } };
  const state = { symbol: 'QQQ', status: 'idle' };
  const apply = (benchmarkPreference) => applyBenchmarkBranch({
    benchmarkPreference,
    benchmarkMutationAtStart: 0,
    benchmarkMutationSerialRef: { current: 0 },
    benchmarkPendingRef: { current: null },
    benchmarkPreferenceRef: preferenceRef,
    setBenchmarkSymbol: (symbol) => { state.symbol = symbol; },
    setBenchmarkSaveStatus: (status) => { state.status = status; },
    normalizeStrictUserStockSymbol: (symbol) => symbol,
  });

  apply({ symbol: 'GOOGL', revision: 4, exists: true });
  assert.equal(state.symbol, 'QQQ');
  assert.equal(preferenceRef.current.symbol, 'QQQ');
  assert.equal(preferenceRef.current.revision, 5);

  apply({ symbol: 'QQQ', revision: null, exists: false });
  assert.equal(state.symbol, 'QQQ');
  assert.equal(preferenceRef.current.exists, true);
  assert.equal(preferenceRef.current.revision, 5);
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
  const makeDeps = ({ initialPendingBenchmark, mutationSerial, pendingSelection }) => ({
    useEffect: (callback) => callback(),
    initialPendingBenchmark,
    cloudLoading: false,
    benchmarkPendingRetryStartedRef: { current: false },
    benchmarkMutationSerialRef: { current: mutationSerial },
    benchmarkPendingRef: { current: pendingSelection },
    selectHomeBenchmark: (symbol, options) => {
      calls.push({ symbol, revision: options?.retryRevision, selectionId: options?.retrySelectionId });
      return Promise.resolve({ success: true });
    },
  });

  const normalClick = makeDeps({
    initialPendingBenchmark: null, mutationSerial: 1,
    pendingSelection: { id: 'normal-1', symbol: 'SPY', revision: 4 },
  });
  runRetryEffect(normalClick);
  assert.deepEqual(calls, [], 'a first-session click already has its own save and must not be replayed');

  const restoredPending = makeDeps({
    initialPendingBenchmark: { id: 'restored-1', symbol: 'META', revision: 4 }, mutationSerial: 0,
    pendingSelection: { id: 'restored-1', symbol: 'META', revision: 4 },
  });
  runRetryEffect(restoredPending);
  runRetryEffect(restoredPending);
  assert.deepEqual(calls, [{ symbol: 'META', revision: 4, selectionId: 'restored-1' }],
    'a restored pending choice retries with its original identity and revision exactly once');
  assert.equal(restoredPending.benchmarkPendingRetryStartedRef.current, true);

  const replacedPending = makeDeps({
    initialPendingBenchmark: { id: 'old-1', symbol: 'QQQ', revision: 3 }, mutationSerial: 1,
    pendingSelection: { id: 'new-1', symbol: 'SPY', revision: 4 },
  });
  runRetryEffect(replacedPending);
  assert.deepEqual(calls, [{ symbol: 'META', revision: 4, selectionId: 'restored-1' }],
    'a new user selection supersedes the restored pending choice');
});

test('cloud reads started before a benchmark change cannot restore the previous selection', () => {
  const applyStart = appSource.indexOf('const applyCloudUserData = useCallback');
  const applyEnd = appSource.indexOf('// 启动时从 Supabase 拉取所有数据', applyStart);
  assert.ok(applyStart >= 0 && applyEnd > applyStart);
  const apply = appSource.slice(applyStart, applyEnd);
  assert.match(apply, /benchmarkMutationAtStart === benchmarkMutationSerialRef\.current/);
  assert.match(apply, /benchmarkPreferenceRef\.current = \{ \.\.\.benchmarkPreference, loaded: true \}/);
  assert.doesNotMatch(apply, /settings\.benchmarkSymbol/);
  assert.match(appSource, /const benchmarkMutationAtStart = benchmarkMutationSerialRef\.current;\s*const result = await db\.fetchAllUserData\(\)/);
  assert.match(appSource, /applyCloudUserData\(result, '\[云端加载\]', orderMutationAtStart, benchmarkMutationAtStart\)/);
});
