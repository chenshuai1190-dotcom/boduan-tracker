import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildSwingWaveCompletionRow,
  buildSwingWaveCreateRow,
  buildSwingWaveUpdateRow,
  mapSwingWave,
} from '../src/lib/swingWavesModel.js';
import { createSwingWavesRepository } from '../src/lib/swingWavesRepository.js';
import {
  buildSwingWaveDashboard,
  mergeSwingWaveQuoteRows,
  summarizeSwingWaveGroup,
  swingWaveInclusiveDays,
} from '../src/lib/swingWavesViewModel.js';

function createFakeSupabase({ userId = 'user-a', rows = [], beforeUpdate = null } = {}) {
  const state = {
    rows: rows.map((row) => ({
      created_at: '2026-07-11T00:00:00.000Z',
      updated_at: '2026-07-11T00:00:00.000Z',
      ...row,
    })),
    calls: [],
    nextId: rows.length + 1,
  };

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
        return { data: { ...selected[0] }, error: null };
      }
      if (mode === 'maybeSingle') {
        if (selected.length > 1) return { data: null, error: new Error('at most one row expected') };
        return { data: selected[0] ? { ...selected[0] } : null, error: null };
      }
      return { data: selected.map((row) => ({ ...row })), error: null };
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
    },
  };
}

test('swing wave rows use canonical USD unit prices and derive status from sell fields', () => {
  const active = mapSwingWave({
    id: 'wave-1',
    symbol: 'nvda',
    name: 'NVIDIA',
    buy_date: '2026-04-21',
    buy_price_usd: '179.78',
    shares: '1000',
    sell_date: null,
    sell_price_usd: null,
    note: '',
  });
  assert.equal(active.symbol, 'NVDA');
  assert.equal(active.status, 'active');
  assert.equal(active.buyPriceUsd, 179.78);
  assert.equal(active.sellPriceUsd, null);

  const completed = mapSwingWave({
    id: 'wave-2',
    symbol: 'NVDA',
    buy_date: '2026-04-21',
    buy_price_usd: '179.78',
    shares: '1000',
    sell_date: '2026-07-11',
    sell_price_usd: '210.77',
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.sellPriceUsd, 210.77);
  assert.equal(Object.hasOwn(completed, 'currency'), false);
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

test('active waves can only be completed through the full-sell operation', () => {
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
  assert.throws(
    () => buildSwingWaveUpdateRow(active, { sellDate: '2026-07-11', sellPriceUsd: 210.77 }),
    /必须通过完整卖出/,
  );
  assert.deepEqual(
    buildSwingWaveCompletionRow(active, { sellDate: '2026-07-11', sellPriceUsd: 210.77 }),
    { sell_date: '2026-07-11', sell_price_usd: 210.77 },
  );
  assert.throws(
    () => buildSwingWaveCompletionRow(active, { sellDate: '2026-04-20', sellPriceUsd: 210.77 }),
    /结束日期不能早于开始日期/,
  );
  assert.throws(
    () => buildSwingWaveCompletionRow(active, { sellDate: '2026-07-11', sellPriceUsd: 210.77, shares: 500 }),
    /shares/,
  );
});

test('completed wave edits preserve completion and cannot reopen the wave', () => {
  const completed = {
    id: 'wave-1',
    status: 'completed',
    symbol: 'NVDA',
    name: 'NVIDIA',
    buyDate: '2026-04-21',
    buyPriceUsd: 179.78,
    shares: 1000,
    sellDate: '2026-07-11',
    sellPriceUsd: 210.77,
    note: '',
  };
  assert.deepEqual(
    buildSwingWaveUpdateRow(completed, { sellPriceUsd: 211.5 }),
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      buy_date: '2026-04-21',
      buy_price_usd: 179.78,
      shares: 1000,
      note: '',
      sell_date: '2026-07-11',
      sell_price_usd: 211.5,
    },
  );
  assert.throws(
    () => buildSwingWaveUpdateRow(completed, { sellDate: null, sellPriceUsd: null }),
    /结束日期格式不正确/,
  );
  assert.throws(
    () => buildSwingWaveUpdateRow(completed, { status: 'active' }),
    /status/,
  );
});

test('repository supports multiple active waves for one stock and completes only the selected wave', async () => {
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

  const first = await repository.create(input);
  const second = await repository.create({ ...input, buyDate: '2026-05-05', shares: 500 });
  const third = await repository.create({ ...input, buyDate: '2026-05-19', shares: 700 });
  assert.equal((await repository.list()).length, 3);
  assert.equal(new Set([first.id, second.id, third.id]).size, 3);

  const completed = await repository.complete(second.id, {
    sellDate: '2026-07-11',
    sellPriceUsd: 250,
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.shares, 500);

  const rows = state.rows.filter((row) => row.symbol === 'NVDA');
  assert.equal(rows.filter((row) => row.sell_date == null).length, 2);
  assert.equal(rows.filter((row) => row.sell_date != null).length, 1);

  const completionUpdate = state.calls.find((call) => call[1] === 'update' && call[2]?.sell_price_usd === 250);
  assert.ok(completionUpdate, 'complete should issue one sell-side update');
  assert.equal(Object.hasOwn(completionUpdate[2], 'shares'), false, 'complete must never accept or rewrite shares');
  assert.equal(Object.hasOwn(completionUpdate[2], 'fee'), false, 'v1 must not write fees');
  assert.ok(state.calls.some((call) => call[1] === 'is' && call[2] === 'sell_date' && call[3] === null));
  assert.ok(state.calls.some((call) => call[1] === 'is' && call[2] === 'sell_price_usd' && call[3] === null));
  assert.ok(state.calls.some((call) => call[1] === 'eq' && call[2] === 'updated_at'));

  await assert.rejects(
    repository.complete(second.id, { sellDate: '2026-07-12', sellPriceUsd: 260 }),
    /已经完成/,
  );
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
    [{ symbol: 'NVDA', price: 202, waveFetchedAt: now + 1_000 }],
  );
  assert.equal(staleRest.find((row) => row.symbol === 'NVDA').price, 211);
});

test('swing wave SQL and data layer preserve the independent-tool boundary', () => {
  const sql = readFileSync(new URL('../supabase/swing_waves.sql', import.meta.url), 'utf8');
  const aggregateRls = readFileSync(new URL('../supabase/rls.sql', import.meta.url), 'utf8');
  const repositorySource = readFileSync(new URL('../src/lib/swingWavesRepository.js', import.meta.url), 'utf8');
  const wrapperSource = readFileSync(new URL('../src/lib/swingWavesDb.js', import.meta.url), 'utf8');
  const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
  const rlsProbeSource = readFileSync(new URL('../scripts/verify-rls-rest.mjs', import.meta.url), 'utf8');
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const tradesTabSource = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
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

  assert.match(repositorySource, /const TABLE = 'swing_waves'/);
  for (const forbidden of ['stock_trades', 'cost_basis_trades', 'balance_snapshots', 'pnl_report', 'markPnlReportDirty']) {
    assert.equal(repositorySource.includes(forbidden), false, `repository must not touch ${forbidden}`);
  }
  assert.match(wrapperSource, /createSwingWavesRepository\(supabase\)/);
  for (const api of ['listSwingWaves', 'createSwingWave', 'updateSwingWave', 'completeSwingWave', 'deleteSwingWave']) {
    assert.ok(dbSource.includes(api), `db.js must re-export ${api}`);
  }

  const fetchAllStart = dbSource.indexOf('export const fetchAllUserData');
  const fetchAllEnd = dbSource.indexOf('\n};', fetchAllStart);
  const fetchAllBlock = dbSource.slice(fetchAllStart, fetchAllEnd);
  assert.equal(fetchAllBlock.includes('swing_waves'), false, 'independent wave page must not add swing_waves to global startup fetches');
  assert.ok(appSource.includes("const WaveTrackerPage = lazy(() => import('./pages/WaveTrackerPage.jsx'))"));
  assert.ok(appSource.includes("activePage === 'wave-tracker'") && appSource.includes('<WaveTrackerPage ctx={tabCtx} />'));
  assert.ok(tradesTabSource.includes('openWaveTracker?.()'), 'trade toolbox should open the independent wave page');
  for (const api of ['listSwingWaves', 'createSwingWave', 'updateSwingWave', 'completeSwingWave', 'deleteSwingWave']) {
    assert.ok(pageSource.includes(`db.${api}`), `production wave page should call ${api}`);
  }
  for (const forbidden of ['insertTrade', 'insertStockTrade', 'cost_basis_trades', 'markPnlReportDirty', 'pnl_report_snapshots']) {
    assert.equal(pageSource.includes(forbidden), false, `production wave page must not touch ${forbidden}`);
  }
  assert.equal(pageSource.includes('WaveTrackerPrototype'), false, 'production page must not import development fixtures');
});
