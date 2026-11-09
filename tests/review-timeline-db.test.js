import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewTimelineLoader } from '../src/lib/reviewTimelineDb.js';

const OWNER = 'timeline-owner';
const NOW = Date.parse('2026-11-07T05:00:00Z');
const state = extra => ({ user_id: OWNER, dirty_from_date: null, ledger_revision: 4, generation: 1, updated_at: '2026-11-06T23:00:00Z', ...extra });
const row = (date, extra = {}) => ({ id: `snapshot-${date}`, user_id: OWNER, snapshot_date: date,
  currency: 'USD', source_version: 'pnl_snapshot_v1', locked_at: `${date}T23:00:00Z`, updated_at: `${date}T23:00:00Z`,
  cumulative_pnl_pct: 0.1, cumulative_pnl_usd: 100, daily_pnl_pct: 0.01, daily_pnl_usd: 10, ...extra });

function mock({ snapshots = [], movements = [], trades = [], symbolSnapshots = [], states = [state(), state()], users = [OWNER, OWNER], errorTable, pageFactory } = {}) {
  const calls = []; let stateIndex = 0, authIndex = 0;
  const client = {
    auth: { getUser: async () => {
      calls.push({ op: 'auth' });
      const userId = users[Math.min(authIndex++, users.length - 1)];
      return { data: { user: userId ? { id: userId } : null }, error: null };
    } },
    from(table) {
      const call = { table, filters: [], orders: [] }; calls.push(call);
      const query = {
        select(fields) { call.fields = fields; return query; },
        eq(field, value) { call.filters.push([field, value]); return query; },
        order(field, options) { call.orders.push([field, options]); return query; },
        range(start, end) { call.range = [start, end]; return query; },
        abortSignal(signal) { call.signal = signal; return query; },
        async maybeSingle() {
          if (table === errorTable) return { error: new Error('database unavailable') };
          return { data: states[Math.min(stateIndex++, states.length - 1)], error: null };
        },
        then(resolve, reject) {
          if (table === errorTable) return Promise.resolve({ data: null, error: new Error('database unavailable') }).then(resolve, reject);
          const all = table === 'pnl_report_snapshots' ? snapshots : table === 'stock_trades' ? trades
            : table === 'pnl_report_symbol_snapshots' ? symbolSnapshots : movements;
          const data = pageFactory && table !== 'stock_trades' ? pageFactory(table, call.range) : all.slice(call.range[0], call.range[1] + 1);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { client, calls };
}

test('authenticates before and after; all table reads include explicit user scope and never write', async () => {
  const { client, calls } = mock({ snapshots: [row('2026-11-06')] });
  const result = await createReviewTimelineLoader(client, { now: () => NOW })(OWNER);
  assert.equal(result.status, 'ready');
  assert.equal(result.coverage.snapshotCount, 1);
  assert.equal(calls[0].op, 'auth');
  assert.equal(calls.at(-1).op, 'auth');
  assert.equal(calls.filter(call => call.op === 'auth').length, 3);
  assert.ok(calls.filter(call => call.table).every(call => call.filters.some(([field, value]) => field === 'user_id' && value === OWNER)));
  assert.deepEqual([...new Set(calls.filter(call => call.table).map(call => call.table))].sort(),
    ['available_cash_movements', 'pnl_report_rebuild_state', 'pnl_report_snapshots', 'pnl_report_symbol_snapshots', 'stock_trades']);
  const fields = calls.find(call => call.table === 'pnl_report_snapshots').fields.split(',');
  assert.ok(fields.includes('cash_settlement_baseline_event_id'));
  assert.ok(fields.includes('cash_settlement_trade_delta_usd'));
});

test('no snapshots is empty; missing authentication and switched accounts are errors', async () => {
  assert.equal((await createReviewTimelineLoader(mock().client, { now: () => NOW })(OWNER)).status, 'empty');
  await assert.rejects(createReviewTimelineLoader(mock({ users: [null] }).client)(OWNER), { code: 'REVIEW_AUTH_REQUIRED' });
  await assert.rejects(createReviewTimelineLoader(mock({ users: [OWNER, 'other'] }).client)(OWNER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  await assert.rejects(createReviewTimelineLoader(mock().client)(''), { code: 'REVIEW_AUTH_REQUIRED' });
});

test('cross-owner snapshot, cash movement and rebuild state are rejected despite query filters', async () => {
  await assert.rejects(createReviewTimelineLoader(mock({ snapshots: [row('2026-11-06', { user_id: 'other' })] }).client)(OWNER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  await assert.rejects(createReviewTimelineLoader(mock({ movements: [{ id: 'movement', user_id: 'other' }] }).client)(OWNER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  await assert.rejects(createReviewTimelineLoader(mock({ states: [state({ user_id: 'other' })] }).client)(OWNER), { code: 'REVIEW_ACCOUNT_CHANGED' });
});

test('dirty, changing and invalid rebuild state do not publish partially rebuilt history', async () => {
  for (const states of [[state({ dirty_from_date: '2026-11-01' })],
    [state(), state({ generation: 2 })], [state(), state({ dirty_from_date: '2026-11-06' })],
    [state({ ledger_revision: NaN })]]) {
    const { client, calls } = mock({ snapshots: [row('2026-11-06')], states });
    const result = await createReviewTimelineLoader(client, { now: () => NOW })(OWNER);
    assert.equal(result.status, 'pending');
    assert.deepEqual(result.events, []);
    assert.equal(calls.at(-1).op, 'auth');
  }
});

test('reads past 500 rows and checks every row before model building', async () => {
  const snapshots = Array.from({ length: 501 }, (_, index) => {
    const date = new Date(Date.parse('2024-01-01T00:00:00Z') + index * 86400000).toISOString().slice(0, 10);
    return row(date);
  });
  const { client, calls } = mock({ snapshots });
  const result = await createReviewTimelineLoader(client, { now: () => NOW })(OWNER);
  assert.equal(result.status, 'ready');
  assert.deepEqual(calls.filter(call => call.table === 'pnl_report_snapshots').map(call => call.range), [[0, 499], [500, 999]]);
  const mixed = [...snapshots]; mixed[500] = { ...mixed[500], user_id: 'other' };
  await assert.rejects(createReviewTimelineLoader(mock({ snapshots: mixed }).client)(OWNER), { code: 'REVIEW_ACCOUNT_CHANGED' });
});

test('at safety cap it fails closed instead of calling a truncated dataset complete', async () => {
  const { client } = mock({ pageFactory: (table, [start, end]) => table === 'available_cash_movements' ? []
    : Array.from({ length: end - start + 1 }, (_, index) => ({ id: `row-${start + index}`, user_id: OWNER })) });
  await assert.rejects(createReviewTimelineLoader(client)(OWNER), { code: 'REVIEW_HISTORY_LIMIT' });
});

test('duplicate page rows and query failures are not successful empty histories', async () => {
  await assert.rejects(createReviewTimelineLoader(mock({ snapshots: [row('2026-11-06'), row('2026-11-06')] }).client)(OWNER), { code: 'REVIEW_HISTORY_CHANGED' });
  for (const errorTable of ['pnl_report_snapshots', 'available_cash_movements', 'pnl_report_rebuild_state', 'stock_trades']) {
    await assert.rejects(createReviewTimelineLoader(mock({ errorTable }).client)(OWNER), /database unavailable/);
  }
});

test('annual records use the owned first trade inside the report revision fence', async () => {
  const snapshots = [row('2026-11-05'), row('2026-11-06', { cumulative_pnl_pct: .2, cumulative_pnl_usd: 200 })];
  const trades = [{ id: 'trade-1', user_id: OWNER, trade_date: '2026-01-02' }];
  const { client, calls } = mock({ snapshots, trades });
  const result = await createReviewTimelineLoader(client, { now: () => NOW })(OWNER);
  assert.equal(result.events.find(event => event.kind === 'high' && event.metric === 'annual_return')?.value, 20);
  assert.equal(result.events.find(event => event.kind === 'high' && event.metric === 'annual_pnl')?.value, 200);
  const read = calls.find(call => call.table === 'stock_trades');
  assert.deepEqual(read.range, [0, 0]);
  assert.deepEqual(read.orders, [['trade_date', { ascending: true }], ['id', { ascending: true }]]);
  assert.deepEqual(read.filters, [['user_id', OWNER]]);
  assert.equal(read.fields, 'id,user_id,trade_date');
  const pending = await createReviewTimelineLoader(mock({ snapshots, trades, states: [state(), state({ generation: 2 })] }).client, { now: () => NOW })(OWNER);
  assert.equal(pending.status, 'pending');
  assert.deepEqual(pending.events, []);
  for (const trade of [{ ...trades[0], user_id: 'other' }, { ...trades[0], trade_date: '2026-02-30' }]) {
    await assert.rejects(createReviewTimelineLoader(mock({ snapshots, trades: [trade] }).client, { now: () => NOW })(OWNER),
      { code: trade.user_id === 'other' ? 'REVIEW_ACCOUNT_CHANGED' : 'REVIEW_HISTORY_INVALID' });
  }
});

test('absent rebuild state is supported, but creation during reading is fenced', async () => {
  const clean = await createReviewTimelineLoader(mock({ snapshots: [row('2026-11-06')], states: [null, null] }).client, { now: () => NOW })(OWNER);
  assert.equal(clean.status, 'ready');
  const changed = await createReviewTimelineLoader(mock({ snapshots: [row('2026-11-06')], states: [null, state()] }).client, { now: () => NOW })(OWNER);
  assert.equal(changed.status, 'pending');
});

const STOCK_NOW = Date.parse('2026-01-06T05:00:00Z');
const stockRows = () => ['2026-01-02', '2026-01-05'].map((date, index) => row(date, { source_version: 'pnl_snapshot_v2',
  cumulative_pnl_pct: .1 + index * .1, cumulative_pnl_usd: 100 + index * 100 }));
const heldRows = () => ['2026-01-02', '2026-01-05'].map(date => ({ id: `held-${date}`, user_id: OWNER,
  snapshot_date: date, symbol: 'NVDA', name: 'NVIDIA', currency: 'USD', held_shares: 10,
  source_version: 'pnl_snapshot_v2', updated_at: `${date}T23:00:00Z` }));
function marketHistory(request) {
  return { version: 1, source: 'EODHD_EOD_SPLITS', priceBasis: 'split_adjusted_close', currency: 'USD',
    symbols: request.symbols, requestedStartDate: request.startDate, requestedEndDate: request.endDate,
    expectedAsOfDate: '2026-01-05', splitBasisDate: '2026-01-05', asOfDate: '2026-01-05',
    fetchedAt: '2026-01-06T04:00:00Z', series: Object.fromEntries(request.symbols.map(symbol => [symbol,
      { symbol, name: symbol, type: 'Common Stock', rows: [
        { date: '2025-12-31', close: 100 }, { date: '2026-01-02', close: 95 }, { date: '2026-01-05', close: 85.5 },
      ] }])) };
}

test('account events arrive before slow stock prices; only verified held stock is added', async () => {
  let release, started;
  const called = new Promise(resolve => { started = resolve; });
  const market = new Promise(resolve => { release = resolve; });
  const progress = [], requests = [];
  const { client } = mock({ snapshots: stockRows(), symbolSnapshots: heldRows() });
  const resultPromise = createReviewTimelineLoader(client, { now: () => STOCK_NOW,
    loadHistory: async request => { requests.push(request); started(); await market; return marketHistory(request); } })(OWNER,
  { onProgress: value => progress.push(value) });
  await called;
  assert.equal(progress.length, 1);
  assert.equal(progress[0].status, 'ready');
  assert.equal(progress[0].stockRecordStatus, 'loading');
  assert.ok(progress[0].events.every(event => event.metric !== 'stock_daily_return'));
  release();
  const result = await resultPromise;
  assert.equal(result.stockRecordStatus, 'ready');
  const stocks = result.events.filter(event => event.metric === 'stock_daily_return');
  assert.equal(stocks.length, 1);
  assert.equal(stocks[0].symbol, 'NVDA');
  assert.equal(stocks[0].date, '2026-01-05');
  assert.ok(Math.abs(stocks[0].value + 10) < 1e-8);
  assert.deepEqual(requests[0].symbols, ['NVDA', 'QQQ']);
  assert.equal(requests[0].startDate, '2025-12-31');
});

test('price failure is explicitly unavailable and does not hide account events', async () => {
  const { client } = mock({ snapshots: stockRows(), symbolSnapshots: heldRows() });
  const result = await createReviewTimelineLoader(client, { now: () => STOCK_NOW,
    loadHistory: async () => { throw new Error('provider failure'); } })(OWNER);
  assert.equal(result.status, 'ready');
  assert.equal(result.stockRecordStatus, 'error');
  assert.ok(result.stockRecordWarning);
  assert.ok(result.events.every(event => event.metric !== 'stock_daily_return'));
  assert.ok(result.events.length > 0);
});

test('stock evidence, end-of-market revision and account switch are checked before delivery', async () => {
  const make = extra => mock({ snapshots: stockRows(), symbolSnapshots: heldRows(), ...extra }).client;
  const options = { now: () => STOCK_NOW, loadHistory: async request => marketHistory(request) };
  const changed = await createReviewTimelineLoader(make({ states: [state(), state(), state({ ledger_revision: 5 })] }), options)(OWNER);
  assert.equal(changed.status, 'pending');
  assert.deepEqual(changed.events, []);
  await assert.rejects(createReviewTimelineLoader(make({ users: [OWNER, OWNER, 'other'] }), options)(OWNER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  await assert.rejects(createReviewTimelineLoader(make({ symbolSnapshots: [{ ...heldRows()[0], user_id: 'other' }] }), options)(OWNER), { code: 'REVIEW_ACCOUNT_CHANGED' });
});

test('unmount abort cancels market work and prevents final delivery', async () => {
  const controller = new AbortController();
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const { client } = mock({ snapshots: stockRows(), symbolSnapshots: heldRows() });
  const promise = createReviewTimelineLoader(client, { now: () => STOCK_NOW,
    loadHistory: async request => { began(); await new Promise(resolve => request.signal.addEventListener('abort', resolve, { once: true }));
      return marketHistory(request); } })(OWNER, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(promise, { code: 'REQUEST_ABORTED' });
});

test('supported session guards reject sign-out and sign-in ABA during market requests', async () => {
  const { client } = mock({ snapshots: stockRows(), symbolSnapshots: heldRows() });
  let observer;
  const session = { user: { id: OWNER }, access_token: 'test-only' };
  client.auth.getSession = async () => ({ data: { session } });
  client.auth.onAuthStateChange = callback => { observer = callback; return { data: { subscription: { unsubscribe() {} } } }; };
  await assert.rejects(createReviewTimelineLoader(client, { now: () => STOCK_NOW,
    loadHistory: async request => { observer('SIGNED_OUT', null); observer('SIGNED_IN', session); return marketHistory(request); } })(OWNER),
  { code: 'REVIEW_ACCOUNT_CHANGED' });
});
