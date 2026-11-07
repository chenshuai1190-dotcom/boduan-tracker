import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewAccountSnapshotLoader } from '../src/lib/reviewAccountSnapshot.js';
import { isRegularNyseHoliday } from '../src/lib/quoteRefreshPolicy.js';

const DATE = '2026-11-05';
const NOW = Date.parse('2026-11-06T10:00:00Z');
const USER = 'user-a';
const PEAK_KEYS = ['yearPeakReturnPct', 'declineFromYearPeakPp'];
const row = (patch = {}) => ({ id: 'snapshot-a', user_id: USER, snapshot_date: DATE, currency: 'USD',
  cumulative_pnl_pct: 0.125, daily_pnl_pct: -0.0125,
  market_value_usd: 1200, total_assets_usd: 1250, net_assets_usd: 1000,
  cash_usd: 50, cash_event_id: '15', cash_effective_at: `${DATE}T21:00:00Z`, cash_basis: 'event',
  margin_debt_usd: 250, margin_debt_event_id: '22', margin_debt_effective_at: `${DATE}T22:00:00Z`, margin_debt_basis: 'event',
  source_version: 'pnl_snapshot_v2', locked_at: `${DATE}T22:05:00Z`, updated_at: `${DATE}T22:05:00Z`, ...patch });
const state = (patch = {}) => ({ user_id: USER, dirty_from_date: '2026-11-06', ledger_revision: 4, generation: 2,
  updated_at: '2026-11-06T09:00:00Z', ...patch });

function harness({ snapshot = row(), history = [], states = [null, null], users = [USER, USER], queryError = null,
  historyError = null, now = NOW } = {}) {
  const calls = []; let authCount = 0, stateCount = 0;
  const client = {
    auth: { getUser: async () => { const id = users[Math.min(authCount++, users.length - 1)]; return { data: { user: id ? { id } : null }, error: null }; } },
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      const query = {
        select(fields) { call.fields = fields; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        gte(key, value) { call.start = [key, value]; return query; },
        lte(key, value) { call.end = [key, value]; return query; },
        order(key, options) { call.order = [key, options]; return query; },
        limit(value) { call.limit = value; return query; },
        abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return query; },
        async maybeSingle() {
          return { data: table === 'pnl_report_snapshots' ? snapshot : states[stateCount++], error: queryError };
        },
        then(resolve, reject) { return Promise.resolve({ data: history, error: historyError || queryError }).then(resolve, reject); },
      };
      return query;
    },
  };
  return { calls, authCount: () => authCount, load: createReviewAccountSnapshotLoader(client, { now: () => now }) };
}
const values = result => Object.fromEntries(result.snapshot?.items.map(item => [item.key, item.value]) || []);

test('reads the exact user/date and freezes source values independently of missing year history', async () => {
  const source = row(); const h = harness({ snapshot: source });
  const result = await h.load(DATE, USER);
  assert.equal(result.status, 'ready');
  assert.deepEqual(values(result), { cumulativeReturnPct: 12.5, dailyReturnPct: -1.25, leverage: 1.25 });
  assert.deepEqual(result.missingKeys, PEAK_KEYS);
  assert.equal(result.snapshot.asOfDate, DATE);
  assert.equal(result.snapshot.recordDate, DATE);
  assert.equal(result.snapshot.sourceSnapshotId, source.id);
  assert.equal(result.snapshot.sourceVersion, 'pnl_snapshot_v2');
  assert.equal(result.snapshot.sourceUpdatedAt, source.updated_at);
  assert.equal(result.snapshot.lockedAt, source.locked_at);
  assert.equal(result.snapshot.capturedAt, new Date(NOW).toISOString());
  assert.deepEqual(h.calls.map(call => call.table), ['pnl_report_rebuild_state', 'pnl_report_snapshots', 'pnl_report_snapshots', 'pnl_report_rebuild_state']);
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
  assert.deepEqual(dailyMissing.missingKeys, ['dailyReturnPct', ...PEAK_KEYS]);
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
    assert.deepEqual(result.missingKeys, ['leverage', ...PEAK_KEYS]);
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

const closeRow = (date, patch = {}) => row({ id: `snapshot-${date}`, snapshot_date: date,
  cash_effective_at: `${date}T16:00:00Z`, margin_debt_effective_at: `${date}T16:00:00Z`,
  locked_at: `${date}T22:05:00Z`, updated_at: `${date}T22:05:00Z`, ...patch });

function completeHistory(selected, returns = {}) {
  const end = Date.parse(`${selected.snapshot_date}T00:00:00Z`);
  const rows = [];
  for (const day = new Date(`${selected.snapshot_date.slice(0, 4)}-01-01T00:00:00Z`); day.getTime() <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    if ([0, 6].includes(day.getUTCDay()) || isRegularNyseHoliday(date)) continue;
    rows.push(date === selected.snapshot_date ? { ...selected }
      : closeRow(date, { cumulative_pnl_pct: returns[date] ?? selected.cumulative_pnl_pct }));
  }
  return rows;
}

test('complete closes produce the year peak and a positive percentage-point decline, not a compounded drawdown', async () => {
  const date = '2026-01-08';
  const selected = closeRow(date, { cumulative_pnl_pct: 0.15 });
  const history = completeHistory(selected, { '2026-01-02': 0.25, '2026-01-06': 0.25 });
  const h = harness({ snapshot: selected, history: history.reverse() });
  const result = await h.load(date, USER);
  assert.equal(result.status, 'ready');
  assert.equal(values(result).yearPeakReturnPct, 25);
  assert.equal(values(result).declineFromYearPeakPp, 10);
  assert.deepEqual(result.missingKeys, []);
  for (const key of PEAK_KEYS) {
    const item = result.snapshot.items.find(item => item.key === key);
    assert.equal(item.peakDate, '2026-01-06', 'the latest equal peak is selected regardless of response ordering');
    assert.equal(item.asOfDate, date);
    assert.equal(item.basis, 'close');
    assert.equal(item.source, 'pnl_report');
  }
  assert.equal(h.authCount(), 2);
  history[0].cumulative_pnl_pct = 50;
  assert.equal(values(result).yearPeakReturnPct, 25, 'the saved peak is independent of a later source mutation');
});

test('history is bounded to the selected year and date, even for an old post', async () => {
  const date = '2024-01-05';
  const selected = closeRow(date);
  const h = harness({ snapshot: selected, history: completeHistory(selected, { '2024-01-03': 0.2 }) });
  const result = await h.load(date, USER);
  assert.equal(values(result).yearPeakReturnPct, 20);
  const query = h.calls.find(call => call.start);
  assert.deepEqual(query.filters, [['user_id', USER]]);
  assert.deepEqual(query.start, ['snapshot_date', '2024-01-01']);
  assert.deepEqual(query.end, ['snapshot_date', '2024-01-05']);
  assert.deepEqual(query.order, ['snapshot_date', { ascending: true }]);
  assert.equal(query.limit, 370);
  assert.equal(h.calls.at(-1).table, 'pnl_report_rebuild_state', 'the final state read encloses both snapshot queries');
});

test('the first session of the year can be its own peak without inventing a zero baseline', async () => {
  const date = '2026-01-02';
  for (const rate of [-0.2, 0, 0.3]) {
    const selected = closeRow(date, { cumulative_pnl_pct: rate });
    const result = await harness({ snapshot: selected, history: [selected] }).load(date, USER);
    assert.equal(values(result).yearPeakReturnPct, rate * 100);
    assert.equal(values(result).declineFromYearPeakPp, 0);
    assert.equal(result.snapshot.items.find(item => item.key === 'yearPeakReturnPct').peakDate, date);
  }
});

test('negative and zero peaks keep their sign and use the same percentage-point subtraction', async () => {
  const date = '2026-01-06';
  for (const [peak, selectedRate, expectedPeak, expectedDecline] of [
    [-0.05, -0.2, -5, 15], [0, -0.1, 0, 10], [0, 0, 0, 0], [0.1, 0.2, 20, 0],
  ]) {
    const selected = closeRow(date, { cumulative_pnl_pct: String(selectedRate) });
    const history = completeHistory(selected, { '2026-01-02': String(peak), '2026-01-05': String(peak) });
    const result = await harness({ snapshot: selected, history }).load(date, USER);
    assert.equal(values(result).yearPeakReturnPct, expectedPeak);
    assert.ok(Math.abs(values(result).declineFromYearPeakPp - expectedDecline) < 1e-10);
  }
});

test('weekends and known holidays do not create gaps, while a missing year-start or middle session does', async () => {
  const date = '2026-01-20';
  const selected = closeRow(date);
  const history = completeHistory(selected, { '2026-01-16': 0.25 });
  assert.equal(history.some(item => item.snapshot_date === '2026-01-01'), false);
  assert.equal(history.some(item => item.snapshot_date === '2026-01-19'), false);
  assert.equal(values(await harness({ snapshot: selected, history }).load(date, USER)).yearPeakReturnPct, 25);
  for (const missingDate of ['2026-01-02', '2026-01-07', date]) {
    const result = await harness({ snapshot: selected,
      history: history.filter(item => item.snapshot_date !== missingDate) }).load(date, USER);
    assert.equal(result.status, 'ready');
    assert.deepEqual(values(result), { cumulativeReturnPct: 12.5, dailyReturnPct: -1.25, leverage: 1.25 });
    assert.deepEqual(result.missingKeys, PEAK_KEYS, `missing ${missingDate} must not become a partial-year peak`);
  }
});

test('a complete leap year remains bounded and February 29 is required when it is a session', async () => {
  const date = '2024-12-31';
  const selected = closeRow(date);
  const history = completeHistory(selected, { '2024-02-29': 0.3 });
  assert.ok(history.length < 370);
  const result = await harness({ snapshot: selected, history }).load(date, USER);
  assert.equal(values(result).yearPeakReturnPct, 30);
  assert.equal(result.snapshot.items.find(item => item.key === 'yearPeakReturnPct').peakDate, '2024-02-29');
  const missing = await harness({ snapshot: selected,
    history: history.filter(item => item.snapshot_date !== '2024-02-29') }).load(date, USER);
  assert.deepEqual(missing.missingKeys, PEAK_KEYS);
});

test('out-of-range, duplicate, non-session and oversized history responses cannot set a year peak', async () => {
  const date = '2026-01-06';
  const selected = closeRow(date);
  const history = completeHistory(selected);
  for (const extra of [closeRow('2025-12-31', { cumulative_pnl_pct: 99 }),
    closeRow('2026-01-07', { cumulative_pnl_pct: 99 }), closeRow('2026-01-01'), closeRow('2026-01-03'), { ...history[0] }]) {
    const result = await harness({ snapshot: selected, history: [...history, extra] }).load(date, USER);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.missingKeys, PEAK_KEYS);
  }
  const oversized = await harness({ snapshot: selected, history: Array.from({ length: 371 }, () => selected) }).load(date, USER);
  assert.deepEqual(oversized.missingKeys, PEAK_KEYS);
});

test('every historical rate needs a verified locked close, while unrelated old leverage fields may be absent', async () => {
  const date = '2026-01-06';
  const selected = closeRow(date);
  const history = completeHistory(selected);
  for (const patch of [{ id: '' }, { currency: 'CNY' }, { source_version: 'pnl_snapshot_v1' },
    { snapshot_date: '2026-02-30' }, { locked_at: null }, { locked_at: '2026-01-02T21:59:59Z' },
    { locked_at: '2026-11-07T22:00:00Z' }, { updated_at: null }, { updated_at: '2026-11-07T22:00:00Z' },
    { cumulative_pnl_pct: null }, { cumulative_pnl_pct: '' }, { cumulative_pnl_pct: 'NaN' },
    { cumulative_pnl_pct: Infinity }, { cumulative_pnl_pct: 1e307 }]) {
    const result = await harness({ snapshot: selected, history: [{ ...history[0], ...patch }, ...history.slice(1)] }).load(date, USER);
    assert.equal(result.status, 'ready', JSON.stringify(patch));
    assert.deepEqual(result.missingKeys, PEAK_KEYS, JSON.stringify(patch));
  }
  const noLeverage = history.map(item => item.snapshot_date === date ? item : { ...item, cash_basis: null, net_assets_usd: null });
  assert.equal(values(await harness({ snapshot: selected, history: noLeverage }).load(date, USER)).yearPeakReturnPct, 12.5);
});

test('a disagreement between the exact snapshot and its historical row cannot be frozen as a peak', async () => {
  const date = '2026-01-06';
  const selected = closeRow(date);
  for (const patch of [{ cumulative_pnl_pct: 0.5 }, { id: 'different-source' },
    { updated_at: `${date}T22:10:00Z` }, { locked_at: `${date}T22:10:00Z` }]) {
    const history = completeHistory(selected).map(item => item.snapshot_date === date ? { ...item, ...patch } : item);
    const result = await harness({ snapshot: selected, history }).load(date, USER);
    assert.equal(values(result).cumulativeReturnPct, 12.5);
    assert.deepEqual(result.missingKeys, PEAK_KEYS);
  }
});

test('overflowing peak differences never enter a saved account snapshot', async () => {
  const date = '2026-01-06';
  const selected = closeRow(date, { cumulative_pnl_pct: -1e306 });
  const result = await harness({ snapshot: selected,
    history: completeHistory(selected, { '2026-01-02': 1e306 }) }).load(date, USER);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.missingKeys, PEAK_KEYS);
  assert.ok(result.snapshot.items.every(item => Number.isFinite(item.value)));
});

test('historical rows remain account-scoped and query failures are not treated as a complete year', async () => {
  const date = '2026-01-06';
  const selected = closeRow(date);
  const history = completeHistory(selected);
  await assert.rejects(harness({ snapshot: selected, history: [{ ...history[0], user_id: 'user-b' }, ...history.slice(1)] })
    .load(date, USER), { code: 'REVIEW_ACCOUNT_CHANGED' });
  const error = new Error('history unavailable');
  await assert.rejects(harness({ snapshot: selected, historyError: error }).load(date, USER), error);
});

test('a rebuild race enclosing an otherwise complete year discards all combined metrics', async () => {
  const date = '2026-01-06';
  const selected = closeRow(date);
  const history = completeHistory(selected, { '2026-01-02': 0.3 });
  for (const states of [[null, state({ dirty_from_date: '2026-01-02' })],
    [state(), state({ generation: 3 })], [state(), state({ ledger_revision: 5 })]]) {
    const result = await harness({ snapshot: selected, history, states }).load(date, USER);
    assert.equal(result.status, 'pending');
    assert.equal(result.reason, 'rebuilding');
    assert.equal(result.snapshot, null);
  }
  const cleanForDate = state({ dirty_from_date: '2026-01-07' });
  const result = await harness({ snapshot: selected, history, states: [cleanForDate, { ...cleanForDate }] }).load(date, USER);
  assert.equal(result.status, 'ready');
  assert.equal(values(result).yearPeakReturnPct, 30);
});
