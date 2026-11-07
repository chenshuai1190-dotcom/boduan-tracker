import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewAccountSnapshotLoader } from '../src/lib/reviewAccountSnapshot.js';

const DATE = '2026-11-05';
const NOW = Date.parse('2026-11-06T10:00:00Z');
const USER = 'user-a';
const row = (patch = {}) => ({ id: 'snapshot-a', user_id: USER, snapshot_date: DATE, currency: 'USD',
  cumulative_pnl_pct: 0.125, daily_pnl_pct: -0.0125,
  market_value_usd: 1200, total_assets_usd: 1250, net_assets_usd: 1000,
  cash_usd: 50, cash_event_id: '15', cash_effective_at: `${DATE}T21:00:00Z`, cash_basis: 'event',
  margin_debt_usd: 250, margin_debt_event_id: '22', margin_debt_effective_at: `${DATE}T22:00:00Z`, margin_debt_basis: 'event',
  source_version: 'pnl_snapshot_v2', locked_at: `${DATE}T22:05:00Z`, updated_at: `${DATE}T22:05:00Z`, ...patch });
const state = (patch = {}) => ({ user_id: USER, dirty_from_date: '2026-11-06', ledger_revision: 4, generation: 2,
  updated_at: '2026-11-06T09:00:00Z', ...patch });

function harness({ snapshot = row(), states = [null, null], users = [USER, USER], queryError = null, now = NOW } = {}) {
  const calls = []; let authCount = 0, stateCount = 0;
  const client = {
    auth: { getUser: async () => { const id = users[Math.min(authCount++, users.length - 1)]; return { data: { user: id ? { id } : null }, error: null }; } },
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      const query = {
        select(fields) { call.fields = fields; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return query; },
        async maybeSingle() {
          return { data: table === 'pnl_report_snapshots' ? snapshot : states[stateCount++], error: queryError };
        },
      };
      return query;
    },
  };
  return { calls, authCount: () => authCount, load: createReviewAccountSnapshotLoader(client, { now: () => now }) };
}
const values = result => Object.fromEntries(result.snapshot?.items.map(item => [item.key, item.value]) || []);

test('reads only the exact user/date and freezes raw source values with percent-point units', async () => {
  const source = row(); const h = harness({ snapshot: source });
  const result = await h.load(DATE, USER);
  assert.equal(result.status, 'ready');
  assert.deepEqual(values(result), { cumulativeReturnPct: 12.5, dailyReturnPct: -1.25, leverage: 1.25 });
  assert.deepEqual(result.missingKeys, []);
  assert.equal(result.snapshot.asOfDate, DATE);
  assert.equal(result.snapshot.recordDate, DATE);
  assert.equal(result.snapshot.sourceSnapshotId, source.id);
  assert.equal(result.snapshot.sourceVersion, 'pnl_snapshot_v2');
  assert.equal(result.snapshot.sourceUpdatedAt, source.updated_at);
  assert.equal(result.snapshot.lockedAt, source.locked_at);
  assert.equal(result.snapshot.capturedAt, new Date(NOW).toISOString());
  assert.deepEqual(h.calls.map(call => call.table), ['pnl_report_rebuild_state', 'pnl_report_snapshots', 'pnl_report_rebuild_state']);
  assert.deepEqual(h.calls[1].filters, [['user_id', USER], ['snapshot_date', DATE]]);
  assert.ok(h.calls.every(call => call.filters[0][0] === 'user_id' && call.filters[0][1] === USER));
  assert.equal(h.authCount(), 2);
  source.cumulative_pnl_pct = 9;
  assert.equal(values(result).cumulativeReturnPct, 12.5, 'saved reference is independent of later source changes');
});

test('true zero and decimal strings remain values; missing values never become zero', async () => {
  const h = harness({ snapshot: row({ cumulative_pnl_pct: '0', daily_pnl_pct: '-0.0125',
    market_value_usd: '1200', total_assets_usd: '1250', net_assets_usd: '1000', cash_usd: '50', margin_debt_usd: '250' }) });
  assert.deepEqual(values(await h.load(DATE, USER)), { cumulativeReturnPct: 0, dailyReturnPct: -1.25, leverage: 1.25 });
  for (const absent of [null, undefined, '', ' ', false, 'NaN', Infinity, '0x10']) {
    const result = await harness({ snapshot: row({ cumulative_pnl_pct: absent, daily_pnl_pct: absent, cash_basis: null }) }).load(DATE, USER);
    assert.equal(result.status, 'missing', `not a financial number: ${String(absent)}`);
    assert.equal(result.snapshot, null);
  }
});

test('one missing metric does not discard other independent valid metrics', async () => {
  const dailyMissing = await harness({ snapshot: row({ daily_pnl_pct: null }) }).load(DATE, USER);
  assert.deepEqual(values(dailyMissing), { cumulativeReturnPct: 12.5, leverage: 1.25 });
  assert.deepEqual(dailyMissing.missingKeys, ['dailyReturnPct']);
  const onlyLeverage = await harness({ snapshot: row({ daily_pnl_pct: null, cumulative_pnl_pct: null }) }).load(DATE, USER);
  assert.deepEqual(values(onlyLeverage), { leverage: 1.25 });
});

test('leverage requires historical cash and debt provenance and matching asset arithmetic', async () => {
  const patches = [
    { cash_basis: null }, { cash_event_id: null }, { cash_effective_at: null }, { cash_usd: null },
    { margin_debt_basis: null }, { margin_debt_event_id: null }, { margin_debt_effective_at: null }, { margin_debt_usd: null },
    { total_assets_usd: 1251 }, { net_assets_usd: 1001 }, { market_value_usd: -1 }, { net_assets_usd: 0 },
    { net_assets_usd: -1 }, { margin_debt_usd: -1 }, { cash_usd: -1 },
    { cash_effective_at: `${DATE}T22:00:00.001Z` }, { margin_debt_effective_at: '2026-11-06T00:00:00Z' },
  ];
  for (const patch of patches) {
    const result = await harness({ snapshot: row(patch) }).load(DATE, USER);
    assert.equal(result.status, 'ready');
    assert.deepEqual(values(result), { cumulativeReturnPct: 12.5, dailyReturnPct: -1.25 }, JSON.stringify(patch));
    assert.deepEqual(result.missingKeys, ['leverage']);
  }
});

test('an explicit historical default-zero debt permits leverage 1, while contradictory zero provenance does not', async () => {
  const zero = { margin_debt_usd: 0, margin_debt_basis: 'default_zero', margin_debt_event_id: null,
    margin_debt_effective_at: null, net_assets_usd: 1250 };
  assert.equal(values(await harness({ snapshot: row(zero) }).load(DATE, USER)).leverage, 1);
  assert.equal(values(await harness({ snapshot: row({ ...zero, margin_debt_event_id: '1' }) }).load(DATE, USER)).leverage, undefined);
});

test('malformed, holiday and unfinished-date requests never query account data', async () => {
  for (const [date, expected] of [['2026-02-30', 'invalid_date'], ['0000-01-01', 'invalid_date'],
    ['2026-11-07', 'not_session'], ['2026-07-03', 'not_session'], ['2026-11-06', 'pending'], ['2026-12-01', 'pending']]) {
    const h = harness(); const result = await h.load(date, USER);
    assert.equal(result.status, expected, date);
    assert.equal(result.snapshot, null);
    assert.equal(h.calls.length, 0);
  }
});

test('the 17:00 New York completion boundary follows daylight saving time', async () => {
  for (const [date, before, after] of [
    ['2026-10-30', '2026-10-30T20:59:59Z', '2026-10-30T21:00:00Z'],
    ['2026-11-02', '2026-11-02T21:59:59Z', '2026-11-02T22:00:00Z'],
  ]) {
    const early = harness({ now: Date.parse(before) });
    assert.equal((await early.load(date, USER)).status, 'pending');
    const source = row({ snapshot_date: date, locked_at: after, updated_at: after,
      cash_effective_at: before, margin_debt_effective_at: before });
    assert.equal((await harness({ now: Date.parse(after), snapshot: source }).load(date, USER)).status, 'ready');
  }
});

test('missing exact date and unverified or incomplete snapshots do not fall back', async () => {
  assert.equal((await harness({ snapshot: null }).load(DATE, USER)).status, 'missing');
  for (const patch of [{ snapshot_date: '2026-11-04' }, { currency: 'CNY' }, { source_version: 'pnl_snapshot_v1' },
    { source_version: null }, { locked_at: null }, { locked_at: `${DATE}T21:59:59Z` },
    { locked_at: '2026-11-07T22:00:00Z' }, { updated_at: null }, { updated_at: '2026-11-07T22:00:00Z' }, { id: '' }]) {
    const result = await harness({ snapshot: row(patch) }).load(DATE, USER);
    assert.equal(result.status, 'unavailable', JSON.stringify(patch));
    assert.equal(result.snapshot, null);
  }
});

test('dirty selected dates remain pending without reading or rebuilding snapshots', async () => {
  for (const date of [DATE, '2026-11-04']) {
    const h = harness({ states: [state({ dirty_from_date: date })] });
    const result = await h.load(DATE, USER);
    assert.equal(result.status, 'pending');
    assert.equal(result.reason, 'rebuilding');
    assert.equal(h.calls.length, 1);
    assert.equal(h.authCount(), 2);
  }
});

test('a stable dirty range after the selected date leaves its earlier snapshot usable', async () => {
  const unchanged = state();
  const result = await harness({ states: [unchanged, { ...unchanged }] }).load(DATE, USER);
  assert.equal(result.status, 'ready');
});

test('rebuild generation or dirty-state races prevent freezing a mixed result', async () => {
  for (const states of [[null, state()], [state(), null],
    [state(), state({ generation: 3 })], [state(), state({ ledger_revision: 5 })],
    [null, state({ dirty_from_date: DATE })], [state(), state({ updated_at: '2026-11-06T09:01:00Z' })]]) {
    const result = await harness({ states }).load(DATE, USER);
    assert.equal(result.status, 'pending');
    assert.equal(result.snapshot, null);
  }
});

test('invalid rebuild-state fields cannot be mistaken for a clean ledger', async () => {
  for (const states of [[state({ generation: null })], [null, state({ dirty_from_date: 'invalid' })]]) {
    const result = await harness({ states }).load(DATE, USER);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.snapshot, null);
  }
});

test('authentication and returned-row identity are checked before and after reading', async () => {
  await assert.rejects(harness({ users: [null] }).load(DATE, USER), { code: 'REVIEW_AUTH_REQUIRED' });
  await assert.rejects(harness({ users: ['user-b'] }).load(DATE, USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  await assert.rejects(harness({ users: [USER, 'user-b'] }).load(DATE, USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  await assert.rejects(harness({ snapshot: row({ user_id: 'user-b' }) }).load(DATE, USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  await assert.rejects(harness({ states: [state({ user_id: 'user-b' })] }).load(DATE, USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
});

test('query errors remain errors and do not produce fabricated historical metrics', async () => {
  const error = new Error('network unavailable');
  await assert.rejects(harness({ queryError: error }).load(DATE, USER), error);
});
