import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewTimelineLoader } from '../src/lib/reviewTimelineDb.js';

const OWNER = 'timeline-owner';
const NOW = Date.parse('2026-11-07T05:00:00Z');
const state = extra => ({ user_id: OWNER, dirty_from_date: null, ledger_revision: 4, generation: 1, updated_at: '2026-11-06T23:00:00Z', ...extra });
const row = (date, extra = {}) => ({ id: `snapshot-${date}`, user_id: OWNER, snapshot_date: date,
  currency: 'USD', source_version: 'pnl_snapshot_v1', locked_at: `${date}T23:00:00Z`, updated_at: `${date}T23:00:00Z`,
  cumulative_pnl_pct: 0.1, cumulative_pnl_usd: 100, daily_pnl_pct: 0.01, daily_pnl_usd: 10, ...extra });

function mock({ snapshots = [], movements = [], states = [state(), state()], users = [OWNER, OWNER], errorTable, pageFactory } = {}) {
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
          const all = table === 'pnl_report_snapshots' ? snapshots : movements;
          const data = pageFactory ? pageFactory(table, call.range) : all.slice(call.range[0], call.range[1] + 1);
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
  assert.equal(calls.filter(call => call.op === 'auth').length, 2);
  assert.ok(calls.filter(call => call.table).every(call => call.filters.some(([field, value]) => field === 'user_id' && value === OWNER)));
  assert.deepEqual([...new Set(calls.filter(call => call.table).map(call => call.table))].sort(),
    ['available_cash_movements', 'pnl_report_rebuild_state', 'pnl_report_snapshots']);
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
  for (const errorTable of ['pnl_report_snapshots', 'available_cash_movements', 'pnl_report_rebuild_state']) {
    await assert.rejects(createReviewTimelineLoader(mock({ errorTable }).client)(OWNER), /database unavailable/);
  }
});

test('absent rebuild state is supported, but creation during reading is fenced', async () => {
  const clean = await createReviewTimelineLoader(mock({ snapshots: [row('2026-11-06')], states: [null, null] }).client, { now: () => NOW })(OWNER);
  assert.equal(clean.status, 'ready');
  const changed = await createReviewTimelineLoader(mock({ snapshots: [row('2026-11-06')], states: [null, state()] }).client, { now: () => NOW })(OWNER);
  assert.equal(changed.status, 'pending');
});
