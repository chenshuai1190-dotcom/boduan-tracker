import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  normalizeStrictUserStockSymbol,
  normalizeUserStockSymbol,
} from '../src/lib/symbols.js';

const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../supabase/watchlist_target_price.sql', import.meta.url), 'utf8');

const fetchStart = dbSource.indexOf('export const fetchWatchlist = async (preUser = null) => {');
const fetchEnd = dbSource.indexOf('\n// 单个股票字段更新', fetchStart);
assert.notEqual(fetchStart, -1, 'fetchWatchlist must remain exported from db.js');
assert.notEqual(fetchEnd, -1, 'fetchWatchlist must remain inside the watchlist section');

const updateStart = dbSource.indexOf('export const updateWatchlistTargetPrice = async (symbolInput, targetPriceUsd) => {');
const updateEnd = dbSource.indexOf('\n// 精确删除单条', updateStart);
assert.notEqual(updateStart, -1, 'updateWatchlistTargetPrice must be exported from db.js');
assert.notEqual(updateEnd, -1, 'target-price update must remain inside the watchlist section');

const fetchFunctionSource = dbSource
  .slice(fetchStart, fetchEnd)
  .replace(
    'export const fetchWatchlist = async (preUser = null) => {',
    'export const createFetchWatchlist = (supabase, cacheGet, cacheSet, normalizeUserStockSymbol) => async (preUser = null) => {',
  );
const updateFunctionSource = dbSource
  .slice(updateStart, updateEnd)
  .replace(
    'export const updateWatchlistTargetPrice = async (symbolInput, targetPriceUsd) => {',
    'export const createUpdateWatchlistTargetPrice = (supabase, normalizeStrictUserStockSymbol, normalizeUserStockSymbol) => async (symbolInput, targetPriceUsd) => {',
  );
const extractedModule = await import(
  `data:text/javascript;base64,${Buffer.from(`${fetchFunctionSource}\n${updateFunctionSource}`).toString('base64')}`
);

function createSupabaseStub({
  userId = 'user-a',
  rows = [],
  selectError = null,
  updateError = null,
  updateResult = undefined,
} = {}) {
  const state = {
    authCalls: 0,
    fromCalls: [],
    action: null,
    filters: [],
    orders: [],
    selectColumns: [],
    updatePayload: null,
    upsertCalls: 0,
    maybeSingleCalls: 0,
  };

  const query = {
    select(columns) {
      state.selectColumns.push(columns);
      if (!state.action) state.action = 'select';
      return this;
    },
    update(payload) {
      state.action = 'update';
      state.updatePayload = payload;
      return this;
    },
    upsert() {
      state.upsertCalls += 1;
      state.action = 'upsert';
      return this;
    },
    eq(field, value) {
      state.filters.push([field, value]);
      return this;
    },
    order(field, options) {
      state.orders.push([field, options]);
      return this;
    },
    maybeSingle() {
      state.maybeSingleCalls += 1;
      if (updateError) return Promise.resolve({ data: null, error: updateError });
      const data = updateResult === undefined
        ? {
            symbol: state.filters.find(([field]) => field === 'symbol')?.[1] || '',
            target_price_usd: state.updatePayload?.target_price_usd,
          }
        : updateResult;
      return Promise.resolve({ data, error: null });
    },
    then(resolve, reject) {
      return Promise.resolve({ data: rows, error: selectError }).then(resolve, reject);
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

function createFetch(client, cacheGet = () => null, cacheSet = () => {}) {
  return extractedModule.createFetchWatchlist(client, cacheGet, cacheSet, normalizeUserStockSymbol);
}

function createUpdate(client) {
  return extractedModule.createUpdateWatchlistTargetPrice(
    client,
    normalizeStrictUserStockSymbol,
    normalizeUserStockSymbol,
  );
}

test('fetchWatchlist maps nullable canonical USD target prices and stays user scoped', async () => {
  const cachedWrites = [];
  const { client, state } = createSupabaseStub({
    rows: [
      { symbol: 'NVDA', name: 'NVIDIA', price: '202.81', high: '235.88', cost: '195.30', shares: '500', target_price_usd: '250.125' },
      { symbol: 'MSFT', name: 'Microsoft', price: '510', high: '520', cost: '0', shares: '0', target_price_usd: null },
    ],
  });
  const fetchWatchlist = createFetch(client, () => null, (...args) => cachedWrites.push(args));

  const result = await fetchWatchlist();

  assert.equal(result[0].targetPriceUsd, 250.125);
  assert.equal(result[1].targetPriceUsd, null);
  assert.deepEqual(state.fromCalls, ['watchlist']);
  assert.deepEqual(state.filters, [['user_id', 'user-a']]);
  assert.deepEqual(state.orders, [['id', { ascending: true }]]);
  assert.deepEqual(cachedWrites, [['user-a', 'watchlist', result]]);
});

test('updateWatchlistTargetPrice updates only the owned symbol and returns canonical USD', async () => {
  const { client, state } = createSupabaseStub();
  const updateWatchlistTargetPrice = createUpdate(client);

  const result = await updateWatchlistTargetPrice(' nvda.us ', '250.125');

  assert.deepEqual(result, { symbol: 'NVDA', targetPriceUsd: 250.125 });
  assert.equal(state.authCalls, 1);
  assert.deepEqual(state.fromCalls, ['watchlist']);
  assert.equal(state.updatePayload.target_price_usd, 250.125);
  assert.match(state.updatePayload.updated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(state.filters, [
    ['user_id', 'user-a'],
    ['symbol', 'NVDA'],
  ]);
  assert.deepEqual(state.selectColumns, ['symbol,target_price_usd']);
  assert.equal(state.maybeSingleCalls, 1);
  assert.equal(state.upsertCalls, 0);
});

test('target-price update rejects invalid symbols and non-positive values before database access', async () => {
  for (const [symbol, price] of [
    ['NV DA', 250],
    ['NVDA', 0],
    ['NVDA', -1],
    ['NVDA', ''],
    ['NVDA', true],
    ['NVDA', 'not-a-number'],
    ['NVDA', Number.POSITIVE_INFINITY],
  ]) {
    const { client, state } = createSupabaseStub();
    const updateWatchlistTargetPrice = createUpdate(client);
    await assert.rejects(updateWatchlistTargetPrice(symbol, price), /股票代码格式不正确|目标价必须是大于 0 的数字/);
    assert.equal(state.authCalls, 0);
    assert.deepEqual(state.fromCalls, []);
  }
});

test('target-price update fails closed for unauthenticated, missing, and database-error cases', async () => {
  {
    const { client, state } = createSupabaseStub({ userId: null });
    await assert.rejects(createUpdate(client)('NVDA', 250), /未登录/);
    assert.deepEqual(state.fromCalls, []);
  }
  {
    const { client, state } = createSupabaseStub({ updateResult: null });
    await assert.rejects(createUpdate(client)('NVDA', 250), /自选股票不存在或已被删除/);
    assert.deepEqual(state.filters, [['user_id', 'user-a'], ['symbol', 'NVDA']]);
  }
  {
    const databaseError = new Error('update failed');
    const { client } = createSupabaseStub({ updateError: databaseError });
    await assert.rejects(createUpdate(client)('NVDA', 250), (error) => error === databaseError);
  }
});

test('target-price persistence stays out of generic watchlist upserts and financial ledgers', () => {
  const genericUpsertStart = dbSource.indexOf('export const upsertWatchlistItem = async');
  const genericUpsertEnd = dbSource.indexOf('export const updateWatchlistTargetPrice = async', genericUpsertStart);
  const genericUpsertBlock = dbSource.slice(genericUpsertStart, genericUpsertEnd);
  const targetUpdateBlock = dbSource.slice(updateStart, updateEnd);

  assert.equal(genericUpsertBlock.includes('target_price_usd'), false, 'quote/watchlist sync must not overwrite the user target');
  assert.equal(targetUpdateBlock.includes('.upsert('), false, 'target save must not create phantom watchlist rows');
  for (const forbidden of ['stock_trades', 'markPnlReportDirty', 'community_competition']) {
    assert.equal(targetUpdateBlock.includes(forbidden), false, `target save must not touch ${forbidden}`);
  }
});

test('watchlist target migration is nullable, positive, and reuses existing owner RLS', () => {
  assert.match(migrationSource, /add column if not exists target_price_usd numeric\(18, 6\)/i);
  assert.match(migrationSource, /check \(target_price_usd is null or target_price_usd > 0\)/i);
  assert.equal(/create policy|drop policy|stock_trades|community_competition|user_settings/i.test(migrationSource), false);
  assert.equal(/insert\s+into|update\s+public|delete\s+from/i.test(migrationSource), false, 'migration must not rewrite production rows');
});
