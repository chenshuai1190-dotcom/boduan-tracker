import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/lib/pnlReportDb.js', import.meta.url), 'utf8')
  .replace("import { supabase } from './supabase';", 'const supabase = null;')
  .replace("import { scopedDeleteByField } from './dbGuards';", 'const scopedDeleteByField = () => {};');
const pnlReportDb = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const makeSnapshotRows = (count, { userId = 'user-a', symbol = 'NVDA' } = {}) => Array.from(
  { length: count },
  (_, index) => ({
    id: `${userId}-${symbol}-${index}`,
    user_id: userId,
    symbol,
    name: symbol === 'NVDA' ? 'NVIDIA' : symbol,
    snapshot_date: new Date(Date.UTC(2026, 6, 13 - index)).toISOString().slice(0, 10),
    currency: 'USD',
    held_shares: String(index + 1),
    current_price_usd: String(100 + index),
    cumulative_pnl_usd: String(index * 10),
    is_open: true,
  }),
);

function createSupabaseStub({ userId = 'user-a', rows = [] } = {}) {
  const state = {
    authCalls: 0,
    fromCalls: 0,
    operations: [],
  };

  class Query {
    constructor(table) {
      this.operation = {
        table,
        filters: [],
        orders: [],
      };
    }

    select(columns) {
      this.operation.select = columns;
      return this;
    }

    eq(field, value) {
      this.operation.filters.push([field, value]);
      return this;
    }

    order(field, options) {
      this.operation.orders.push([field, options]);
      return this;
    }

    execute(from, to) {
      let selected = rows.filter((row) => this.operation.filters.every(
        ([field, value]) => row[field] === value,
      ));
      for (const [field, options] of [...this.operation.orders].reverse()) {
        const direction = options?.ascending === false ? -1 : 1;
        selected = [...selected].sort(
          (left, right) => String(left[field]).localeCompare(String(right[field])) * direction,
        );
      }
      return { data: selected.slice(from, to + 1), error: null };
    }

    async limit(count) {
      this.operation.limit = count;
      state.operations.push(this.operation);
      return this.execute(0, count - 1);
    }

    async range(from, to) {
      this.operation.range = [from, to];
      state.operations.push(this.operation);
      return this.execute(from, to);
    }
  }

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
        state.fromCalls += 1;
        return new Query(table);
      },
    },
  };
}

test('all symbol history reads every page in descending snapshot order and stays user scoped', async () => {
  const relevantRows = makeSnapshotRows(1001);
  const { client, state } = createSupabaseStub({
    rows: [
      ...relevantRows.slice().reverse(),
      ...makeSnapshotRows(4, { userId: 'user-b' }),
      ...makeSnapshotRows(4, { symbol: 'QQQ' }),
    ],
  });

  const result = await pnlReportDb.fetchPnlReportSymbolSnapshotHistory(
    ' nvda ',
    'all',
    { id: 'user-a' },
    client,
  );

  assert.equal(result.length, 1001);
  assert.deepEqual(state.operations.map((operation) => operation.range), [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
  assert.ok(state.operations.every((operation) => operation.table === 'pnl_report_symbol_snapshots'));
  assert.ok(state.operations.every((operation) => operation.filters.some(
    ([field, value]) => field === 'user_id' && value === 'user-a',
  )));
  assert.ok(state.operations.every((operation) => operation.filters.some(
    ([field, value]) => field === 'symbol' && value === 'NVDA',
  )));
  assert.ok(state.operations.every((operation) => operation.orders.some(
    ([field, options]) => field === 'snapshot_date' && options?.ascending === false,
  )));
  assert.equal(result[0].snapshotDate, relevantRows[0].snapshot_date);
  assert.equal(result.at(-1).snapshotDate, relevantRows.at(-1).snapshot_date);
  assert.equal(result[5].heldShares, 6);
  assert.equal(result[5].currentPriceUsd, 105);
  assert.equal(state.authCalls, 0);
});

test('null selects the same complete-history pagination path', async () => {
  const { client, state } = createSupabaseStub({ rows: makeSnapshotRows(1) });

  const result = await pnlReportDb.fetchPnlReportSymbolSnapshotHistory(
    'NVDA',
    null,
    { id: 'user-a' },
    client,
  );

  assert.equal(result.length, 1);
  assert.deepEqual(state.operations.map((operation) => operation.range), [[0, 499]]);
  assert.equal(state.operations[0].limit, undefined);
});

test('finite history limits remain single-query and preserve the default 370-row contract', async () => {
  const defaultStub = createSupabaseStub({ rows: makeSnapshotRows(400) });
  const defaultResult = await pnlReportDb.fetchPnlReportSymbolSnapshotHistory(
    'NVDA',
    undefined,
    { id: 'user-a' },
    defaultStub.client,
  );

  assert.equal(defaultResult.length, 370);
  assert.equal(defaultStub.state.operations.length, 1);
  assert.equal(defaultStub.state.operations[0].limit, 370);
  assert.equal(defaultStub.state.operations[0].range, undefined);

  const finiteStub = createSupabaseStub({ rows: makeSnapshotRows(10) });
  const finiteResult = await pnlReportDb.fetchPnlReportSymbolSnapshotHistory(
    'NVDA',
    3,
    { id: 'user-a' },
    finiteStub.client,
  );

  assert.equal(finiteResult.length, 3);
  assert.equal(finiteStub.state.operations[0].limit, 3);
});

test('history query returns no rows without an authenticated user or a symbol', async () => {
  const unauthenticated = createSupabaseStub({ userId: null, rows: makeSnapshotRows(3) });
  const withoutUser = await pnlReportDb.fetchPnlReportSymbolSnapshotHistory(
    'NVDA',
    'all',
    null,
    unauthenticated.client,
  );

  assert.deepEqual(withoutUser, []);
  assert.equal(unauthenticated.state.authCalls, 1);
  assert.equal(unauthenticated.state.fromCalls, 0);

  const emptySymbol = createSupabaseStub({ rows: makeSnapshotRows(3) });
  const withoutSymbol = await pnlReportDb.fetchPnlReportSymbolSnapshotHistory(
    '   ',
    'all',
    { id: 'user-a' },
    emptySymbol.client,
  );

  assert.deepEqual(withoutSymbol, []);
  assert.equal(emptySymbol.state.authCalls, 0);
  assert.equal(emptySymbol.state.fromCalls, 0);
});
