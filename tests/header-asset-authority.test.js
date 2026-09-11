import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  HOME_MARGIN_LOGIC_VERSION,
  homeMarginLogicUpdatedAt,
  isLegacyHomeMarginStatus,
  normalizeMarginDebtUsd,
} from '../src/lib/homeMarginRisk.js';
import { normalizeStrictUserStockSymbol, normalizeUserStockSymbol } from '../src/lib/symbols.js';
import { userScopedStorageKey } from '../src/lib/userScopedStorage.js';

// Execute the real database module with isolated Supabase/storage dependencies.
// Only ESM declarations are removed; all fetch, mapping and fallback bodies run.
const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8')
  .replace(/^import\b[\s\S]*?;\n/gm, '')
  .replace(/^export\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
const readFunctions = ['fetchAllUserData', 'fetchStockTrades', 'fetchMarginStatus', 'fetchAvailableCashStatus'];
const user = { id: 'header-authority-user' };
const updatedAt = '2026-09-11T00:00:00.000Z';
const allConfirmed = { holdings: true, margin: true, cash: true };
const allUnconfirmed = { holdings: false, margin: false, cash: false };
const headerTables = ['stock_trades', 'margin_status', 'available_cash_status'];

function populatedTables() {
  return {
    stock_trades: [{ id: 'trade-1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-09-10', price: '180.12', shares: '2', fee: '0.25', currency: 'USD', note: '' }],
    margin_status: { current_margin: '125.50', margin_limit: 0, logic_version: HOME_MARGIN_LOGIC_VERSION, updated_at: updatedAt },
    available_cash_status: { available_cash_usd: '42.75', logic_version: 1, updated_at: updatedAt },
  };
}

function createHarness({ tables = {}, authenticated = true } = {}) {
  const state = { tables, failures: {}, rpcs: {}, calls: [], storage: new Map(), authenticated };
  class Query {
    constructor(table) { this.table = table; this.single = false; }
    select(columns) { state.calls.push(['select', this.table, columns]); return this; }
    eq(field, value) { state.calls.push(['eq', this.table, field, value]); return this; }
    order() { return this; }
    maybeSingle() { this.single = true; return this; }
    async execute() {
      const failure = state.failures[this.table];
      if (failure === 'throw') throw new Error(`${this.table} network rejected`);
      if (failure) return { data: null, error: new Error(`${this.table} unavailable`) };
      return { data: state.tables[this.table] ?? (this.single ? null : []), error: null };
    }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }
  const dependencies = {
    supabase: {
      auth: { async getUser() { return { data: { user: state.authenticated ? user : null } }; } },
      from(table) { return new Query(table); },
      async rpc(name) { return state.rpcs[name] || { data: true, error: null }; },
    },
    localStorage: {
      getItem(key) { return state.storage.get(key) ?? null; },
      setItem(key, value) { state.storage.set(key, value); },
    },
    console: { error() {}, warn() {}, info() {} },
    HOME_MARGIN_LOGIC_VERSION,
    homeMarginLogicUpdatedAt,
    isLegacyHomeMarginStatus,
    normalizeMarginDebtUsd,
    normalizeStrictUserStockSymbol,
    normalizeUserStockSymbol,
    userScopedStorageKey,
  };
  const createModule = new Function(...Object.keys(dependencies), `${dbSource}\nreturn { ${readFunctions.join(', ')} };`);
  return { state, db: createModule(...Object.values(dependencies)) };
}

function assertUnrelatedEmptyData(result) {
  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.watchlist, []);
  assert.deepEqual(result.waveNotes, {});
  assert.equal(result.settings, null);
  assert.deepEqual(result.accounts, []);
  assert.deepEqual(result.snapshots, []);
  assert.equal(result.investmentPlan, null);
  assert.deepEqual(result.disciplines, []);
  assert.deepEqual(result.reviewLogs, []);
  assert.deepEqual(result.yearlyActuals, []);
}

test('cloud-confirmed header data retains the existing mapped return shapes', async () => {
  const { db, state } = createHarness({ tables: populatedTables() });
  const result = await db.fetchAllUserData();
  assert.deepEqual(result._headerAssetAuthority, allConfirmed);
  assert.deepEqual(result.stockTrades, [{ id: 'trade-1', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', date: '2026-09-10', price: 180.12, shares: 2, fee: 0.25, currency: 'USD', note: '' }]);
  assert.deepEqual(result.marginStatus, { currentMargin: 125.5, marginLimit: 0, logicVersion: HOME_MARGIN_LOGIC_VERSION, updatedAt });
  assert.deepEqual(result.availableCashStatus, { availableCashUsd: 42.75, isSet: true, updatedAt, writeReady: true, reversalReady: true });
  assert.deepEqual(result._failedTables, []);
  assertUnrelatedEmptyData(result);
  for (const [method, table, field, value] of state.calls.filter(call => call[0] === 'eq')) {
    assert.deepEqual([method, field, value], ['eq', 'user_id', user.id], table);
  }
  for (const [name, expected] of [
    ['fetchStockTrades', result.stockTrades],
    ['fetchMarginStatus', result.marginStatus],
    ['fetchAvailableCashStatus', result.availableCashStatus],
  ]) {
    assert.deepEqual(await db[name](user), expected, `${name} without options keeps its return value`);
    const sources = [];
    assert.deepEqual(await db[name](user, { onReadSource: source => sources.push(source) }), expected);
    assert.equal(sources.at(-1), true);
  }
});

test('a successfully read empty formal ledger is authoritative without changing empty-state semantics', async () => {
  const { db, state } = createHarness();
  state.rpcs.available_cash_write_contract_ready = { data: false, error: null };
  state.rpcs.available_cash_reversal_contract_ready = { data: false, error: null };
  const result = await db.fetchAllUserData();
  assert.deepEqual(result._headerAssetAuthority, allConfirmed);
  assert.deepEqual(result.stockTrades, []);
  assert.deepEqual(result.marginStatus, { currentMargin: 0, marginLimit: 0, logicVersion: HOME_MARGIN_LOGIC_VERSION, updatedAt: null });
  assert.deepEqual(result.availableCashStatus, { availableCashUsd: 0, isSet: false, updatedAt: null, writeReady: false, reversalReady: false });
  assert.deepEqual(result._failedTables, []);
});

test('local cache fallback preserves old values but cannot authorize any header component', async () => {
  const { db, state } = createHarness({ tables: populatedTables() });
  const before = await db.fetchAllUserData();
  for (const table of headerTables) state.failures[table] = 'error';
  const fallback = await db.fetchAllUserData();
  assert.deepEqual(fallback._headerAssetAuthority, allUnconfirmed);
  assert.deepEqual(fallback.stockTrades, before.stockTrades);
  assert.deepEqual(fallback.marginStatus, before.marginStatus);
  assert.deepEqual(fallback.availableCashStatus, { ...before.availableCashStatus, writeReady: false, reversalReady: false });
  assert.deepEqual(fallback._failedTables, [], 'a fulfilled cache fallback must keep existing failed-table behavior');
  assertUnrelatedEmptyData(fallback);
  for (const name of readFunctions.slice(1)) {
    const sources = [];
    await db[name](user, { onReadSource: source => sources.push(source) });
    assert.deepEqual(sources, [false], name);
  }

  delete state.failures.stock_trades;
  state.tables.stock_trades = [];
  const partialRecovery = await db.fetchAllUserData();
  assert.deepEqual(partialRecovery._headerAssetAuthority, { holdings: true, margin: false, cash: false });
  assert.deepEqual(partialRecovery.stockTrades, []);
});

test('query errors and rejected requests remain failed reads even with a populated offline cache', async () => {
  for (const failure of ['error', 'throw']) {
    const { db, state } = createHarness({ tables: populatedTables() });
    if (failure === 'throw') await db.fetchAllUserData();
    for (const table of headerTables) state.failures[table] = failure;
    const result = await db.fetchAllUserData();
    assert.deepEqual(result._headerAssetAuthority, allUnconfirmed);
    assert.equal(result.stockTrades, null);
    assert.equal(result.marginStatus, null);
    assert.equal(result.availableCashStatus, null);
    assert.deepEqual(result._failedTables, ['stockTrades', 'marginStatus', 'availableCashStatus']);
    assertUnrelatedEmptyData(result);
  }
});

test('cash authority is independent of write-contract readiness and rejects invalid cloud amounts', async () => {
  const { db, state } = createHarness({ tables: populatedTables() });
  state.rpcs.available_cash_write_contract_ready = { data: null, error: new Error('write contract unavailable') };
  const readOnly = await db.fetchAllUserData();
  assert.deepEqual(readOnly._headerAssetAuthority, allConfirmed);
  assert.equal(readOnly.availableCashStatus.availableCashUsd, 42.75);
  assert.equal(readOnly.availableCashStatus.writeReady, false);
  assert.equal(readOnly.availableCashStatus.reversalReady, true);

  state.tables.available_cash_status.available_cash_usd = 'invalid';
  const invalid = await db.fetchAllUserData();
  assert.deepEqual(invalid._headerAssetAuthority, { holdings: true, margin: true, cash: false });
  assert.equal(invalid.availableCashStatus, null);
  assert.deepEqual(invalid._failedTables, ['availableCashStatus']);
});

test('no signed-in user never confers header authority or changes existing null return fields', async () => {
  const { db, state } = createHarness({ authenticated: false });
  const result = await db.fetchAllUserData();
  assert.deepEqual(result._headerAssetAuthority, allUnconfirmed);
  assert.deepEqual(result._failedTables, []);
  for (const [key, value] of Object.entries(result)) {
    if (!key.startsWith('_')) assert.equal(value, null, key);
  }
  assert.deepEqual(state.calls, []);
  for (const name of readFunctions.slice(1)) {
    const sources = [];
    const value = await db[name](null, { onReadSource: source => sources.push(source) });
    assert.deepEqual(value, name === 'fetchStockTrades' ? [] : null);
    assert.deepEqual(sources, [false]);
  }
});
