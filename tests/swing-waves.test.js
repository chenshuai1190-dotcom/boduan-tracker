import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildSwingWaveCreateRow,
  buildSwingWaveExitInput,
  buildSwingWaveUpdateRow,
  mapSwingWave,
} from '../src/lib/swingWavesModel.js';
import { createSwingWavesRepository } from '../src/lib/swingWavesRepository.js';
import {
  buildSwingWaveDashboard,
  calculateSwingWaveForecast,
  mergeSwingWaveQuoteRows,
  summarizeSwingWaveGroup,
  swingWaveInclusiveDays,
} from '../src/lib/swingWavesViewModel.js';

test('swing wave forecast is a read-only calculation based on USD unit prices', () => {
  const forecast = calculateSwingWaveForecast({
    buyPriceUsd: 355,
    currentPriceUsd: 385.12,
    shares: 100,
    targetPriceUsd: 420,
  });
  assert.equal(Number(forecast.currentPnlUsd.toFixed(2)), 3012);
  assert.equal(Number(forecast.currentReturnPct.toFixed(4)), 0.0848);
  assert.equal(forecast.forecastPnlUsd, 6500);
  assert.equal(Number(forecast.forecastReturnPct.toFixed(4)), 0.1831);
  assert.equal(Number(forecast.progressPct.toFixed(4)), 0.4634);

  const downForecast = calculateSwingWaveForecast({
    buyPriceUsd: 355,
    currentPriceUsd: 340,
    shares: 100,
    targetPriceUsd: 300,
  });
  assert.equal(downForecast.forecastPnlUsd, -5500);
  assert.equal(Number(downForecast.forecastReturnPct.toFixed(4)), -0.1549);
});

function createFakeSupabase({ userId = 'user-a', rows = [], exits = [], beforeUpdate = null } = {}) {
  const state = {
    rows: rows.map((row) => ({
      created_at: '2026-07-11T00:00:00.000Z',
      updated_at: '2026-07-11T00:00:00.000Z',
      ...row,
    })),
    exits: exits.map((row) => ({
      created_at: '2026-07-11T00:00:00.000Z',
      updated_at: '2026-07-11T00:00:00.000Z',
      ...row,
    })),
    calls: [],
    nextId: rows.length + 1,
    nextExitId: exits.length + 1,
  };

  const withNestedExits = (row) => ({
    ...row,
    swing_wave_exits: state.exits
      .filter((exit) => exit.wave_id === row.id)
      .map((exit) => ({ ...exit })),
  });

  class Query {
    constructor(table) {
      this.table = table;
      this.action = null;
      this.payload = null;
      this.filters = [];
      this.orders = [];
      this.returning = false;
    }

    record(method, ...args) {
      state.calls.push([this.table, method, ...args]);
      return this;
    }

    select(columns) {
      this.record('select', columns);
      if (!this.action) this.action = 'select';
      else this.returning = true;
      return this;
    }

    insert(payload) {
      this.record('insert', payload);
      this.action = 'insert';
      this.payload = payload;
      return this;
    }

    update(payload) {
      this.record('update', payload);
      this.action = 'update';
      this.payload = payload;
      return this;
    }

    delete() {
      this.record('delete');
      this.action = 'delete';
      return this;
    }

    eq(field, value) {
      this.record('eq', field, value);
      this.filters.push((row) => row[field] === value);
      return this;
    }

    is(field, value) {
      this.record('is', field, value);
      this.filters.push((row) => value == null ? row[field] == null : row[field] === value);
      return this;
    }

    order(field, options) {
      this.record('order', field, options);
      this.orders.push([field, options]);
      return this;
    }

    matches(row) {
      return this.filters.every((filter) => filter(row));
    }

    async execute(mode = 'many') {
      let selected = [];
      if (this.action === 'select') {
        selected = state.rows.filter((row) => this.matches(row));
        for (const [field, options] of [...this.orders].reverse()) {
          const direction = options?.ascending === false ? -1 : 1;
          selected.sort((left, right) => String(left[field]).localeCompare(String(right[field])) * direction);
        }
      } else if (this.action === 'insert') {
        const now = '2026-07-11T00:00:00.000Z';
        const row = {
          id: `wave-${state.nextId}`,
          sell_date: null,
          sell_price_usd: null,
          created_at: now,
          updated_at: now,
          ...this.payload,
        };
        state.nextId += 1;
        state.rows.push(row);
        selected = this.returning ? [row] : [];
      } else if (this.action === 'update') {
        if (beforeUpdate) beforeUpdate(state, this.payload);
        selected = state.rows.filter((row) => this.matches(row));
        for (const row of selected) Object.assign(row, this.payload, { updated_at: '2026-07-11T01:00:00.000Z' });
        if (!this.returning) selected = [];
      } else if (this.action === 'delete') {
        const deleted = state.rows.filter((row) => this.matches(row));
        state.rows = state.rows.filter((row) => !this.matches(row));
        selected = this.returning ? deleted : [];
      }

      if (mode === 'single') {
        if (selected.length !== 1) return { data: null, error: new Error('single row expected') };
        return { data: withNestedExits(selected[0]), error: null };
      }
      if (mode === 'maybeSingle') {
        if (selected.length > 1) return { data: null, error: new Error('at most one row expected') };
        return { data: selected[0] ? withNestedExits(selected[0]) : null, error: null };
      }
      return { data: selected.map(withNestedExits), error: null };
    }

    single() {
      return this.execute('single');
    }

    maybeSingle() {
      return this.execute('maybeSingle');
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    state,
    client: {
      auth: {
        async getUser() {
          return { data: { user: userId ? { id: userId } : null }, error: null };
        },
      },
      from(table) {
        assert.equal(table, 'swing_waves');
        return new Query(table);
      },
      async rpc(name, payload) {
        state.calls.push(['rpc', name, payload]);
        const wave = state.rows.find((row) => row.id === payload.p_wave_id && row.user_id === userId);
        if (!wave) return { data: null, error: new Error('波段不存在') };
        const childExits = state.exits.filter((exit) => exit.wave_id === wave.id);
        const legacyCompleted = wave.sell_date != null && wave.sell_price_usd != null;
        const touchWave = () => { wave.updated_at = '2026-07-11T02:00:00.000Z'; };

        if (name === 'record_swing_wave_exit') {
          const soldShares = legacyCompleted
            ? Number(wave.shares)
            : childExits.reduce((sum, exit) => sum + Number(exit.shares), 0);
          if (legacyCompleted || soldShares + Number(payload.p_sell_shares) > Number(wave.shares) + 1e-9) {
            return { data: null, error: new Error('卖出股数不能超过剩余股数') };
          }
          state.exits.push({
            id: `exit-${state.nextExitId}`,
            wave_id: wave.id,
            user_id: userId,
            shares: Number(payload.p_sell_shares),
            sell_date: payload.p_sell_date,
            sell_price_usd: Number(payload.p_sell_price_usd),
            created_at: `2026-07-11T0${state.nextExitId}:00:00.000Z`,
            updated_at: `2026-07-11T0${state.nextExitId}:00:00.000Z`,
          });
          state.nextExitId += 1;
          touchWave();
          return { data: { id: state.exits.at(-1).id }, error: null };
        }

        if (name === 'update_swing_wave_exit') {
          if (payload.p_exit_id == null) {
            if (!legacyCompleted) return { data: null, error: new Error('卖出记录不存在') };
            if (Number(payload.p_sell_shares) > Number(wave.shares) + 1e-9) {
              return { data: null, error: new Error('卖出股数不能超过剩余股数') };
            }
            if (Math.abs(Number(payload.p_sell_shares) - Number(wave.shares)) <= 1e-9) {
              wave.sell_date = payload.p_sell_date;
              wave.sell_price_usd = Number(payload.p_sell_price_usd);
            } else {
              wave.sell_date = null;
              wave.sell_price_usd = null;
              state.exits.push({
                id: `exit-${state.nextExitId}`,
                wave_id: wave.id,
                user_id: userId,
                shares: Number(payload.p_sell_shares),
                sell_date: payload.p_sell_date,
                sell_price_usd: Number(payload.p_sell_price_usd),
                created_at: '2026-07-11T02:00:00.000Z',
                updated_at: '2026-07-11T02:00:00.000Z',
              });
              state.nextExitId += 1;
            }
          } else {
            const exit = childExits.find((row) => row.id === payload.p_exit_id);
            if (!exit) return { data: null, error: new Error('卖出记录不存在') };
            const soldWithoutCurrent = childExits.reduce((sum, row) => (
              sum + (row.id === exit.id ? 0 : Number(row.shares))
            ), 0);
            if (soldWithoutCurrent + Number(payload.p_sell_shares) > Number(wave.shares) + 1e-9) {
              return { data: null, error: new Error('卖出股数不能超过剩余股数') };
            }
            Object.assign(exit, {
              shares: Number(payload.p_sell_shares),
              sell_date: payload.p_sell_date,
              sell_price_usd: Number(payload.p_sell_price_usd),
              updated_at: '2026-07-11T02:00:00.000Z',
            });
          }
          touchWave();
          return { data: true, error: null };
        }

        if (name === 'delete_swing_wave_exit') {
          if (payload.p_exit_id == null) {
            if (!legacyCompleted) return { data: null, error: new Error('卖出记录不存在') };
            wave.sell_date = null;
            wave.sell_price_usd = null;
          } else {
            const before = state.exits.length;
            state.exits = state.exits.filter((exit) => !(exit.wave_id === wave.id && exit.id === payload.p_exit_id));
            if (state.exits.length === before) return { data: null, error: new Error('卖出记录不存在') };
          }
          touchWave();
          return { data: true, error: null };
        }

        return { data: null, error: new Error(`unexpected RPC: ${name}`) };
      },
    },
  };
}

test('swing wave rows map child exits, remaining shares, and legacy full sells', () => {
  const partial = mapSwingWave({
    id: 'wave-1',
    symbol: 'nvda',
    name: 'NVIDIA',
    buy_date: '2026-04-21',
    buy_price_usd: '179.78',
    shares: '1000',
    sell_date: null,
    sell_price_usd: null,
    note: '',
    swing_wave_exits: [{
      id: 'exit-1',
      wave_id: 'wave-1',
      shares: '500',
      sell_date: '2026-07-11',
      sell_price_usd: '210.77',
    }],
  });
  assert.equal(partial.symbol, 'NVDA');
  assert.equal(partial.status, 'active');
  assert.equal(partial.buyPriceUsd, 179.78);
  assert.equal(partial.shares, 1000);
  assert.equal(partial.soldShares, 500);
  assert.equal(partial.remainingShares, 500);
  assert.deepEqual(partial.exits.map((exit) => [exit.id, exit.shares, exit.sellPriceUsd]), [
    ['exit-1', 500, 210.77],
  ]);

  const legacy = mapSwingWave({
    id: 'wave-2',
    symbol: 'NVDA',
    buy_date: '2026-04-21',
    buy_price_usd: '179.78',
    shares: '1000',
    sell_date: '2026-07-11',
    sell_price_usd: '210.77',
  });
  assert.equal(legacy.status, 'completed');
  assert.equal(legacy.soldShares, 1000);
  assert.equal(legacy.remainingShares, 0);
  assert.equal(legacy.exits[0].id, 'legacy:wave-2');
  assert.equal(legacy.exits[0].legacy, true);
  assert.equal(legacy.sellPriceUsd, 210.77);
  assert.equal(Object.hasOwn(legacy, 'currency'), false);
});

test('create validation only accepts a complete buy side with positive values', () => {
  assert.deepEqual(
    buildSwingWaveCreateRow({
      symbol: ' nvda.us ',
      name: ' NVIDIA ',
      buyDate: '2026-04-21',
      buyPriceUsd: '179.78',
      shares: '1000',
      note: ' core wave ',
    }, 'user-a'),
    {
      user_id: 'user-a',
      symbol: 'NVDA',
      name: 'NVIDIA',
      buy_date: '2026-04-21',
      buy_price_usd: 179.78,
      shares: 1000,
      note: 'core wave',
    },
  );

  assert.throws(
    () => buildSwingWaveCreateRow({ symbol: 'NVDA', buyDate: '2026-02-30', buyPriceUsd: 1, shares: 1 }, 'user-a'),
    /开始日期格式不正确/,
  );
  assert.throws(
    () => buildSwingWaveCreateRow({ symbol: 'NVDA', buyDate: '2026-04-21', buyPriceUsd: 0, shares: 1 }, 'user-a'),
    /买入价格必须大于 0/,
  );
  assert.throws(
    () => buildSwingWaveCreateRow({ symbol: 'NVDA', buyDate: '2026-04-21', buyPriceUsd: 1, shares: -1 }, 'user-a'),
    /买入股数必须大于 0/,
  );
  assert.throws(
    () => buildSwingWaveCreateRow({ symbol: '---', buyDate: '2026-04-21', buyPriceUsd: 1, shares: 1 }, 'user-a'),
    /股票代码格式不正确/,
  );
  assert.throws(
    () => buildSwingWaveCreateRow({ symbol: 'NVDA', buyDate: '2026-04-21', buyPriceUsd: true, shares: 1 }, 'user-a'),
    /买入价格格式不正确/,
  );
  assert.throws(
    () => buildSwingWaveCreateRow({ symbol: 'NVDA', buyDate: '2026-04-21', buyPriceUsd: '0x10', shares: 1 }, 'user-a'),
    /买入价格格式不正确/,
  );
  assert.throws(
    () => buildSwingWaveCreateRow({ symbol: 'NVDA', buyDate: '2026-04-21', buyPriceUsd: 1, shares: 1, sellPriceUsd: 2 }, 'user-a'),
    /sellPriceUsd/,
  );
  assert.throws(
    () => buildSwingWaveCreateRow({ symbol: 'NVDA', buyDate: '2026-04-21', buyPriceUsd: 1, shares: 1, user_id: 'user-b' }, 'user-a'),
    /user_id/,
  );
});

test('sell input accepts partial quantities and rejects invalid quantity or date', () => {
  const active = {
    id: 'wave-1',
    status: 'active',
    symbol: 'NVDA',
    name: 'NVIDIA',
    buyDate: '2026-04-21',
    buyPriceUsd: 179.78,
    shares: 1000,
    sellDate: null,
    sellPriceUsd: null,
    note: '',
  };
  assert.deepEqual(
    buildSwingWaveExitInput(active, { sellDate: '2026-07-11', sellPriceUsd: 210.77, sellShares: 500 }),
    { sellDate: '2026-07-11', sellPriceUsd: 210.77, sellShares: 500 },
  );
  assert.throws(
    () => buildSwingWaveExitInput(active, { sellDate: '2026-04-20', sellPriceUsd: 210.77, sellShares: 500 }),
    /卖出日期不能早于开始日期/,
  );
  assert.throws(
    () => buildSwingWaveExitInput(active, { sellDate: '2026-07-11', sellPriceUsd: 210.77, sellShares: 0 }),
    /卖出股数必须大于 0/,
  );
  assert.throws(
    () => buildSwingWaveExitInput(active, { sellDate: '2026-07-11', sellPriceUsd: 210.77, sellShares: -1 }),
    /卖出股数必须大于 0/,
  );
});

test('parent edits cannot reduce original shares below cumulative sells', () => {
  const partial = {
    id: 'wave-1',
    status: 'active',
    symbol: 'NVDA',
    name: 'NVIDIA',
    buyDate: '2026-04-21',
    buyPriceUsd: 179.78,
    shares: 1000,
    soldShares: 500,
    remainingShares: 500,
    exits: [{ id: 'exit-1', shares: 500, sellDate: '2026-07-11', sellPriceUsd: 210.77 }],
    sellDate: null,
    sellPriceUsd: null,
    note: '',
  };
  assert.deepEqual(
    buildSwingWaveUpdateRow(partial, { shares: 750 }),
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      buy_date: '2026-04-21',
      buy_price_usd: 179.78,
      shares: 750,
      note: '',
    },
  );
  assert.throws(
    () => buildSwingWaveUpdateRow(partial, { shares: 499.999 }),
    /买入股数不能小于累计已卖股数/,
  );
  assert.throws(
    () => buildSwingWaveUpdateRow(partial, { buyDate: '2026-07-12' }),
    /开始日期不能晚于已有卖出日期/,
  );
});

test('repository records repeated partial exits atomically and returns shares after exit edits or deletes', async () => {
  const { client, state } = createFakeSupabase();
  const repository = createSwingWavesRepository(client);
  const input = {
    symbol: 'NVDA',
    name: 'NVIDIA',
    buyDate: '2026-04-21',
    buyPriceUsd: 179.78,
    shares: 1000,
    note: '',
  };

  const wave = await repository.create(input);
  const afterFirst = await repository.sell(wave.id, {
    sellDate: '2026-07-11',
    sellPriceUsd: 210,
    sellShares: 500,
  });
  assert.equal(afterFirst.status, 'active');
  assert.equal(afterFirst.soldShares, 500);
  assert.equal(afterFirst.remainingShares, 500);

  const afterSecond = await repository.sell(wave.id, {
    sellDate: '2026-07-12',
    sellPriceUsd: 220,
    sellShares: 200,
  });
  assert.equal(afterSecond.soldShares, 700);
  assert.equal(afterSecond.remainingShares, 300);
  assert.deepEqual(afterSecond.exits.map((exit) => exit.shares), [500, 200]);

  await assert.rejects(
    repository.sell(wave.id, { sellDate: '2026-07-13', sellPriceUsd: 230, sellShares: 301 }),
    /卖出股数不能超过剩余股数/,
  );

  const afterEdit = await repository.updateExit(wave.id, afterSecond.exits[1].id, {
    sellDate: '2026-07-12',
    sellPriceUsd: 221,
    sellShares: 100,
  });
  assert.equal(afterEdit.soldShares, 600);
  assert.equal(afterEdit.remainingShares, 400, 'reducing an exit returns its shares to Active');

  const afterDelete = await repository.deleteExit(wave.id, afterEdit.exits[0].id);
  assert.equal(afterDelete.soldShares, 100);
  assert.equal(afterDelete.remainingShares, 900, 'deleting an exit returns all of that batch to Active');

  const fullySold = await repository.sell(wave.id, {
    sellDate: '2026-07-13',
    sellPriceUsd: 230,
    sellShares: 900,
  });
  assert.equal(fullySold.status, 'completed');
  assert.equal(fullySold.remainingShares, 0);
  assert.equal(fullySold.soldShares, 1000);

  const rpcNames = state.calls.filter((call) => call[0] === 'rpc').map((call) => call[1]);
  assert.deepEqual(rpcNames, [
    'record_swing_wave_exit',
    'record_swing_wave_exit',
    'update_swing_wave_exit',
    'delete_swing_wave_exit',
    'record_swing_wave_exit',
  ]);
  const recordRpc = state.calls.find((call) => call[0] === 'rpc' && call[1] === 'record_swing_wave_exit');
  const updateRpc = state.calls.find((call) => call[0] === 'rpc' && call[1] === 'update_swing_wave_exit');
  assert.ok(recordRpc[2].p_expected_wave_updated_at, 'record RPC must carry the parent optimistic-lock timestamp');
  assert.ok(updateRpc[2].p_expected_wave_updated_at && updateRpc[2].p_expected_exit_updated_at, 'exit edits must lock both parent and exit versions');
  assert.ok(state.calls.some((call) => call[0] === 'swing_waves' && call[1] === 'select' && call[2] === '*,swing_wave_exits(*)'));
});

test('repository edits and deletes legacy full-sell rows through the same atomic exit contract', async () => {
  const { client, state } = createFakeSupabase({
    rows: [{
      id: 'wave-legacy', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', buy_date: '2026-04-21',
      buy_price_usd: 100, shares: 1000, sell_date: '2026-07-11', sell_price_usd: 120, note: '',
    }],
  });
  const repository = createSwingWavesRepository(client);
  const [legacy] = await repository.list();
  assert.equal(legacy.exits[0].id, 'legacy:wave-legacy');

  const updated = await repository.updateExit(legacy.id, legacy.exits[0].id, {
    sellDate: '2026-07-12',
    sellPriceUsd: 121,
    sellShares: 1000,
  });
  assert.equal(updated.exits[0].sellDate, '2026-07-12');
  assert.equal(updated.exits[0].sellPriceUsd, 121);

  const converted = await repository.updateExit(legacy.id, updated.exits[0].id, {
    sellDate: '2026-07-12',
    sellPriceUsd: 121,
    sellShares: 500,
  });
  assert.equal(converted.status, 'active');
  assert.equal(converted.remainingShares, 500);
  assert.equal(converted.exits[0].legacy, false, 'reducing a legacy full sell must atomically convert it to a child exit');

  const reopened = await repository.deleteExit(legacy.id, converted.exits[0].id);
  assert.equal(reopened.status, 'active');
  assert.equal(reopened.remainingShares, 1000);
  assert.equal(reopened.exits.length, 0);

  const legacyRpcCalls = state.calls.filter((call) => call[0] === 'rpc');
  assert.equal(legacyRpcCalls[0][2].p_exit_id, null);
  assert.equal(legacyRpcCalls[1][2].p_exit_id, null);
  assert.ok(legacyRpcCalls[2][2].p_exit_id, 'the converted child exit must be deleted by its real id');
});

test('repository optimistic lock rejects a stale edit instead of overwriting another device', async () => {
  let changed = false;
  const { client, state } = createFakeSupabase({
    rows: [{
      id: 'wave-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', buy_date: '2026-04-21',
      buy_price_usd: 179.78, shares: 1000, sell_date: null, sell_price_usd: null, note: '',
    }],
    beforeUpdate(currentState) {
      if (changed) return;
      changed = true;
      currentState.rows[0].updated_at = '2026-07-11T00:30:00.000Z';
      currentState.rows[0].note = 'edited elsewhere';
    },
  });
  const repository = createSwingWavesRepository(client);

  await assert.rejects(repository.update('wave-a', { note: 'stale edit' }), /其他设备修改/);
  assert.equal(state.rows[0].note, 'edited elsewhere');
});

test('repository scopes every read, update, and delete to the authenticated user', async () => {
  const seed = [
    {
      id: 'wave-a', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', buy_date: '2026-04-21',
      buy_price_usd: 179.78, shares: 1000, sell_date: null, sell_price_usd: null, note: '',
    },
    {
      id: 'wave-b', user_id: 'user-b', symbol: 'MSFT', name: 'Microsoft', buy_date: '2026-04-21',
      buy_price_usd: 420, shares: 100, sell_date: null, sell_price_usd: null, note: '',
    },
  ];
  const { client, state } = createFakeSupabase({ rows: seed });
  const repository = createSwingWavesRepository(client);

  assert.deepEqual((await repository.list()).map((wave) => wave.id), ['wave-a']);
  await assert.rejects(repository.update('wave-b', { note: 'blocked' }), /波段不存在/);
  await repository.delete('wave-a');
  assert.deepEqual(state.rows.map((row) => row.id), ['wave-b']);
  assert.ok(state.calls.some((call) => call[1] === 'eq' && call[2] === 'updated_at'));

  const userScopes = state.calls.filter((call) => call[1] === 'eq' && call[2] === 'user_id');
  assert.ok(userScopes.length >= 3);
  assert.ok(userScopes.every((call) => call[3] === 'user-a'));
});

test('repository returns an empty list when signed out and rejects mutations', async () => {
  const { client } = createFakeSupabase({ userId: null });
  const repository = createSwingWavesRepository(client);
  assert.deepEqual(await repository.list(), []);
  await assert.rejects(
    repository.create({ symbol: 'NVDA', buyDate: '2026-04-21', buyPriceUsd: 1, shares: 1 }),
    /未登录/,
  );
  await assert.rejects(
    repository.sell('wave-a', { sellDate: '2026-07-11', sellPriceUsd: 2, sellShares: 1 }),
    /未登录/,
  );
});

test('partial exits become completed segments while the remainder stays active under one wave number', () => {
  const partial = mapSwingWave({
    id: 'nvda-1',
    user_id: 'user-a',
    symbol: 'NVDA',
    name: 'NVIDIA',
    buy_date: '2026-04-21',
    buy_price_usd: 100,
    shares: 1000,
    sell_date: null,
    sell_price_usd: null,
    swing_wave_exits: [
      { id: 'exit-b', wave_id: 'nvda-1', shares: 200, sell_date: '2026-07-12', sell_price_usd: 130, created_at: '2026-07-12T01:00:00Z' },
      { id: 'exit-a', wave_id: 'nvda-1', shares: 500, sell_date: '2026-07-11', sell_price_usd: 120, created_at: '2026-07-11T01:00:00Z' },
    ],
  });
  const dashboard = buildSwingWaveDashboard([partial], [{ symbol: 'NVDA', price: 110 }], { todayKey: '2026-07-13' });
  const group = dashboard.groups[0];

  assert.equal(dashboard.activeWaveCount, 1);
  assert.equal(dashboard.completedWaveCount, 2);
  assert.equal(dashboard.cumulativePnlUsd, 19_000, 'realized exits plus unrealized remainder must be counted once');
  assert.deepEqual(group.waves.map((wave) => ({
    id: wave.id,
    recordId: wave.recordId,
    status: wave.status,
    shares: wave.shares,
    sequence: wave.sequence,
    exitSequence: wave.exitSequence,
  })), [
    { id: 'nvda-1', recordId: 'nvda-1', status: 'active', shares: 300, sequence: 1, exitSequence: null },
    { id: 'exit-a', recordId: 'nvda-1', status: 'completed', shares: 500, sequence: 1, exitSequence: 1 },
    { id: 'exit-b', recordId: 'nvda-1', status: 'completed', shares: 200, sequence: 1, exitSequence: 2 },
  ]);

  const fullySold = mapSwingWave({
    id: 'nvda-2', symbol: 'NVDA', buy_date: '2026-05-01', buy_price_usd: 100, shares: 1000,
    sell_date: null, sell_price_usd: null,
    swing_wave_exits: [
      { id: 'exit-c', wave_id: 'nvda-2', shares: 500, sell_date: '2026-07-11', sell_price_usd: 120 },
      { id: 'exit-d', wave_id: 'nvda-2', shares: 500, sell_date: '2026-07-12', sell_price_usd: 130 },
    ],
  });
  const fullySoldSegments = buildSwingWaveDashboard([fullySold], [{ symbol: 'NVDA', price: 999 }], { todayKey: '2026-07-13' }).groups[0].waves;
  assert.equal(fullySoldSegments.some((wave) => wave.status === 'active'), false, 'zero remainder must leave the realtime quote universe');
  assert.deepEqual(fullySoldSegments.map((wave) => [wave.exitSequence, wave.shares]), [[1, 500], [2, 500]]);
});

test('view model keeps same-symbol active swings independent with stable numbering and weighted returns', () => {
  const waves = [
    { id: 'nvda-3', symbol: 'NVDA', name: 'NVIDIA', status: 'active', buyDate: '2026-05-19', buyPriceUsd: 179.1, shares: 700, createdAt: '2026-05-19T00:00:00Z' },
    { id: 'nvda-1', symbol: 'NVDA', name: 'NVIDIA', status: 'active', buyDate: '2026-04-21', buyPriceUsd: 176.2, shares: 600, createdAt: '2026-04-21T00:00:00Z' },
    { id: 'nvda-2', symbol: 'NVDA', name: 'NVIDIA', status: 'active', buyDate: '2026-05-05', buyPriceUsd: 182.5, shares: 700, createdAt: '2026-05-05T00:00:00Z' },
    { id: 'tsla-1', symbol: 'TSLA', name: 'Tesla', status: 'completed', buyDate: '2025-11-10', buyPriceUsd: 217.36, shares: 800, sellDate: '2026-02-10', sellPriceUsd: 265.21 },
  ];
  const dashboard = buildSwingWaveDashboard(waves, [
    { symbol: 'NVDA', price: 210.77 },
    { symbol: 'TSLA', price: 300 },
  ], { todayKey: '2026-07-11' });

  assert.equal(dashboard.activeStockCount, 1);
  assert.equal(dashboard.activeWaveCount, 3);
  assert.equal(dashboard.completedWaveCount, 1);
  const nvda = dashboard.groups.find((group) => group.symbol === 'NVDA');
  assert.deepEqual(nvda.waves.map((wave) => [wave.id, wave.sequence]), [
    ['nvda-1', 1],
    ['nvda-2', 2],
    ['nvda-3', 3],
  ]);
  assert.equal(nvda.waves[0].heldDays, 82);
  assert.equal(swingWaveInclusiveDays('2026-04-21', '2026-07-11'), 82);

  const summary = summarizeSwingWaveGroup(nvda, 'active', '2026-07-11');
  assert.equal(summary.shares, 2000);
  assert.equal(Math.round(summary.pnlUsd), 62700);
  assert.ok(Math.abs(summary.returnPct - (62700 / 358840)) < 1e-10, 'group return must be total P&L divided by total cost');
  assert.deepEqual(summary.visibleWaves.map((wave) => wave.sequence), [1, 2, 3]);

  const tsla = dashboard.groups.find((group) => group.symbol === 'TSLA').waves[0];
  assert.equal(tsla.exitPriceUsd, 265.21, 'completed swings must use their sell price instead of a live quote');
  assert.equal(tsla.heldDays, 92);
});

test('view model shows missing active quotes as unavailable instead of fake break-even values', () => {
  const dashboard = buildSwingWaveDashboard([
    { id: 'msft-1', symbol: 'MSFT', status: 'active', buyDate: '2026-03-15', buyPriceUsd: 420.49, shares: 1000 },
  ], [], { todayKey: '2026-07-11' });
  const wave = dashboard.groups[0].waves[0];
  const summary = summarizeSwingWaveGroup(dashboard.groups[0], 'all', '2026-07-11');
  assert.equal(wave.currentPriceUsd, null);
  assert.equal(wave.pnlUsd, null);
  assert.equal(wave.returnPct, null);
  assert.equal(summary.pnlUsd, null);
  assert.equal(dashboard.cumulativePnlUsd, null);
});

test('wave quote merging keeps the newest REST or realtime value without dropping other symbols', () => {
  const now = Date.now();
  const refreshed = mergeSwingWaveQuoteRows(
    [
      { symbol: 'NVDA', price: 190, clientReceivedAt: now - 20 * 60_000, previousClose: 188 },
      { symbol: 'MSFT', price: 400, clientReceivedAt: now - 20 * 60_000 },
    ],
    [{ symbol: 'nvda', price: 205, waveFetchedAt: now - 1_000, dailyBaselineClose: 198 }],
  );
  assert.equal(refreshed.find((row) => row.symbol === 'NVDA').price, 205);
  assert.equal(refreshed.find((row) => row.symbol === 'MSFT').price, 400);

  const realtime = mergeSwingWaveQuoteRows(
    refreshed,
    [{ symbol: 'NVDA', price: 211, realtime: true, clientReceivedAt: now }],
  );
  const nvda = realtime.find((row) => row.symbol === 'NVDA');
  assert.equal(nvda.price, 211);
  assert.equal(nvda.dailyBaselineClose, 198);

  const staleRest = mergeSwingWaveQuoteRows(
    realtime,
    [{ symbol: 'NVDA', price: 202, previousClose: 201, waveFetchedAt: now + 1_000 }],
  );
  const protectedSnapshot = staleRest.find((row) => row.symbol === 'NVDA');
  assert.equal(protectedSnapshot.price, 211, 'a slower full REST response must not replace a fresh realtime snapshot');
  assert.equal(protectedSnapshot.previousClose, 188, 'an existing baseline must remain stable when a slower REST response arrives');

  const restAfterSnapshot = mergeSwingWaveQuoteRows(
    [{
      symbol: 'META',
      type: 'stock_tick',
      price: 715,
      receivedAt: now,
      realtime: true,
      realtimeStatus: 'live',
    }],
    [{ symbol: 'META', price: 707, previousClose: 701, waveFetchedAt: now + 1_000 }],
  );
  assert.equal(restAfterSnapshot[0].price, 715, 'REST arriving after a snapshot must keep the realtime price');
  assert.equal(restAfterSnapshot[0].previousClose, 701, 'REST arriving after a snapshot may fill the missing baseline');

  const snapshotAfterRest = mergeSwingWaveQuoteRows(
    [{ symbol: 'GOOGL', price: 198, previousClose: 196, waveFetchedAt: now }],
    [{
      symbol: 'GOOGL',
      type: 'stock_tick',
      price: 203,
      receivedAt: now + 500,
      realtime: true,
      realtimeStatus: 'live',
    }],
  );
  assert.equal(snapshotAfterRest[0].price, 203, 'a realtime snapshot arriving after REST must become the visible price');
  assert.equal(snapshotAfterRest[0].previousClose, 196, 'snapshot merging must retain the REST baseline');

  const newerWebSocket = mergeSwingWaveQuoteRows(
    snapshotAfterRest,
    [{ symbol: 'GOOGL', price: 206, realtime: true, clientReceivedAt: now + 1_000 }],
  );
  assert.equal(newerWebSocket[0].price, 206, 'a newer WebSocket tick must replace the snapshot');
  const lateOlderSnapshot = mergeSwingWaveQuoteRows(
    newerWebSocket,
    [{ symbol: 'GOOGL', price: 204, realtime: true, receivedAt: now + 700 }],
  );
  assert.equal(lateOlderSnapshot[0].price, 206, 'a late older snapshot must not replace a newer WebSocket tick');
});

test('swing wave SQL and data layer preserve the independent-tool boundary', () => {
  const sql = readFileSync(new URL('../supabase/swing_waves.sql', import.meta.url), 'utf8');
  const aggregateRls = readFileSync(new URL('../supabase/rls.sql', import.meta.url), 'utf8');
  const partialExitMigration = readFileSync(new URL('../supabase/swing_wave_partial_exits_20260805.sql', import.meta.url), 'utf8');
  const repositorySource = readFileSync(new URL('../src/lib/swingWavesRepository.js', import.meta.url), 'utf8');
  const wrapperSource = readFileSync(new URL('../src/lib/swingWavesDb.js', import.meta.url), 'utf8');
  const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
  const rlsProbeSource = readFileSync(new URL('../scripts/verify-rls-rest.mjs', import.meta.url), 'utf8');
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const tradesTabSource = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
  const homeTabSource = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
  const pageSource = readFileSync(new URL('../src/pages/WaveTrackerPage.jsx', import.meta.url), 'utf8');

  const tableBlock = sql.match(/create table if not exists public\.swing_waves[\s\S]*?\n\);/)?.[0] || '';
  const aggregateTableBlock = aggregateRls.match(/create table if not exists public\.swing_waves[\s\S]*?\n\);/)?.[0] || '';
  assert.ok(tableBlock);
  assert.equal(aggregateTableBlock, tableBlock, 'standalone and aggregate swing_waves schemas must stay identical');
  assert.match(tableBlock, /buy_price_usd numeric\(18, 6\) not null check \(buy_price_usd > 0\)/);
  assert.match(tableBlock, /shares numeric\(18, 6\) not null check \(shares > 0\)/);
  assert.match(tableBlock, /sell_date is null and sell_price_usd is null/);
  assert.match(tableBlock, /sell_date >= buy_date/);
  assert.equal(/\bstatus\b/.test(tableBlock), false, 'status must be derived instead of redundantly stored');
  assert.equal(/sell_shares|fee|commission|current_price|profit|currency/.test(tableBlock), false);
  assert.equal(/unique\s*\(\s*user_id\s*,\s*symbol/i.test(sql), false, 'same-symbol active waves must remain allowed');
  assert.match(sql, /alter table public\.swing_waves enable row level security/);
  assert.match(sql, /to authenticated\s+using \(auth\.uid\(\) = user_id\)\s+with check \(auth\.uid\(\) = user_id\)/);
  assert.match(sql, /revoke all privileges on table public\.swing_waves from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete\s+on table public\.swing_waves\s+to authenticated/);
  assert.equal(/\b(delete\s+from|truncate|drop\s+table)\s+(?:public\.)?trades\b/i.test(sql), false, 'migration must not clear legacy waves');
  assert.match(rlsProbeSource, /'swing_waves'/);

  const childTableBlock = sql.match(/create table if not exists public\.swing_wave_exits[\s\S]*?\n\);/)?.[0] || '';
  const aggregateChildTableBlock = aggregateRls.match(/create table if not exists public\.swing_wave_exits[\s\S]*?\n\);/)?.[0] || '';
  const migrationChildTableBlock = partialExitMigration.match(/create table if not exists public\.swing_wave_exits[\s\S]*?\n\);/)?.[0] || '';
  assert.ok(childTableBlock, 'standalone schema should include independently stored partial exits');
  assert.equal(aggregateChildTableBlock, childTableBlock, 'aggregate and standalone child schemas must stay identical');
  assert.equal(migrationChildTableBlock, childTableBlock, 'forward migration and canonical child schemas must stay identical');
  assert.match(childTableBlock, /foreign key \(wave_id, user_id\)[\s\S]*?references public\.swing_waves \(id, user_id\)[\s\S]*?on delete cascade/);
  assert.match(childTableBlock, /sell_price_usd numeric\(18, 6\) not null check \(sell_price_usd > 0\)/);
  assert.match(childTableBlock, /shares numeric\(18, 6\) not null check \(shares > 0\)/);
  assert.equal(/fee|commission|current_price|profit|currency/.test(childTableBlock), false, 'exit ledger must remain minimal and USD-unit based');
  for (const source of [sql, aggregateRls, partialExitMigration]) {
    assert.match(source, /alter table public\.swing_wave_exits enable row level security/);
    assert.match(source, /create policy "users can read own swing wave exits"[\s\S]*?for select[\s\S]*?using \(auth\.uid\(\) = user_id\)/);
    assert.match(source, /revoke all privileges on table public\.swing_wave_exits[\s\S]*?from public, anon, authenticated/);
    assert.match(source, /grant select[\s\S]*?on table public\.swing_wave_exits[\s\S]*?to authenticated/);
    assert.equal(/grant\s+(?:insert|update|delete|all)[\s\S]{0,100}public\.swing_wave_exits[\s\S]{0,80}authenticated/i.test(source), false, 'browser clients must not write exits directly');
    for (const rpc of ['record_swing_wave_exit', 'update_swing_wave_exit', 'delete_swing_wave_exit']) {
      assert.ok(source.includes(`function public.${rpc}`), `${rpc} must exist in every canonical schema`);
    }
    assert.match(source, /security definer[\s\S]*?auth\.uid\(\)[\s\S]*?for update/);
    assert.match(source, /already_sold \+ p_sell_shares > wave_row\.shares|other_sold \+ p_sell_shares > wave_row\.shares/);
  }
  assert.match(rlsProbeSource, /'swing_wave_exits'/);
  for (const rpc of ['record_swing_wave_exit', 'update_swing_wave_exit', 'delete_swing_wave_exit']) {
    assert.ok(rlsProbeSource.includes(`name: '${rpc}'`), `anonymous RLS probe must cover ${rpc}`);
  }
  assert.ok(rlsProbeSource.includes('p_expected_wave_updated_at') && rlsProbeSource.includes('p_expected_exit_updated_at'), 'anonymous RPC probes must match the optimistic-lock signatures');
  for (const forbidden of ['stock_trades', 'cost_basis_trades', 'pnl_report_snapshots', 'community_competition_snapshots']) {
    assert.equal(partialExitMigration.includes(forbidden), false, `partial-exit migration must not touch ${forbidden}`);
  }

  assert.match(repositorySource, /const TABLE = 'swing_waves'/);
  assert.match(repositorySource, /const WAVE_SELECT = '\*,swing_wave_exits\(\*\)'/);
  for (const rpc of ['record_swing_wave_exit', 'update_swing_wave_exit', 'delete_swing_wave_exit']) {
    assert.ok(repositorySource.includes(`.rpc('${rpc}'`), `repository must use atomic ${rpc}`);
  }
  assert.ok(repositorySource.includes('p_expected_wave_updated_at') && repositorySource.includes('p_expected_exit_updated_at'), 'exit mutations must preserve optimistic concurrency');
  for (const forbidden of ['stock_trades', 'cost_basis_trades', 'balance_snapshots', 'pnl_report', 'markPnlReportDirty']) {
    assert.equal(repositorySource.includes(forbidden), false, `repository must not touch ${forbidden}`);
  }
  assert.match(wrapperSource, /createSwingWavesRepository\(supabase\)/);
  for (const api of ['listSwingWaves', 'createSwingWave', 'updateSwingWave', 'sellSwingWave', 'updateSwingWaveExit', 'deleteSwingWaveExit', 'deleteSwingWave']) {
    assert.ok(dbSource.includes(api), `db.js must re-export ${api}`);
  }

  const fetchAllStart = dbSource.indexOf('export const fetchAllUserData');
  const fetchAllEnd = dbSource.indexOf('\n};', fetchAllStart);
  const fetchAllBlock = dbSource.slice(fetchAllStart, fetchAllEnd);
  assert.equal(fetchAllBlock.includes('swing_waves'), false, 'independent wave page must not add swing_waves to global startup fetches');
  assert.ok(appSource.includes("const WaveTrackerPage = lazy(() => import('./pages/WaveTrackerPage.jsx'))"));
  assert.ok(
    appSource.includes("activePage === 'wave-tracker'")
      && appSource.includes('<WaveTrackerPage ctx={tabCtx} fetchSwingWaveRealtimeSnapshot={fetchSwingWaveRealtimeSnapshot} />'),
    'the fast snapshot helper must be passed only to the independent wave page',
  );
  assert.ok(appSource.includes("fetchRealtimeSnapshot('/api/stocks-realtime'"), 'wave first-price acceleration must reuse the authenticated stock snapshot endpoint');
  assert.ok(pageSource.includes('refreshRealtimeSnapshot(activeSymbols)'), 'only active wave symbols should request the fast snapshot');
  assert.ok(pageSource.includes('mergeSwingWaveQuoteRows(current, result.data)'), 'snapshot ticks should only update the wave page local quote layer');
  assert.equal(homeTabSource.includes('fetchSwingWaveRealtimeSnapshot'), false, 'Home must not consume the wave-only snapshot helper');
  assert.equal(tradesTabSource.includes('fetchSwingWaveRealtimeSnapshot'), false, 'Trades must not consume the wave-only snapshot helper');
  assert.ok(tradesTabSource.includes('openWaveTracker?.()'), 'trade toolbox should open the independent wave page');
  for (const api of ['listSwingWaves', 'createSwingWave', 'updateSwingWave', 'sellSwingWave', 'updateSwingWaveExit', 'deleteSwingWaveExit', 'deleteSwingWave']) {
    assert.ok(pageSource.includes(`db.${api}`), `production wave page should call ${api}`);
  }
  assert.equal(pageSource.includes('db.completeSwingWave'), false, 'production partial-sell UI must not use the legacy full-sell mutation');
  for (const forbidden of ['insertTrade', 'insertStockTrade', 'cost_basis_trades', 'markPnlReportDirty', 'pnl_report_snapshots']) {
    assert.equal(pageSource.includes(forbidden), false, `production wave page must not touch ${forbidden}`);
  }
  assert.equal(pageSource.includes('WaveTrackerPrototype'), false, 'production page must not import development fixtures');
});
