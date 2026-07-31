import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runCommunityCompetitionDailySnapshot,
  runCommunityCompetitionScheduledCatchUp,
} from '../server/communityCompetitionDailySnapshot.js';
import { computeCompetitionLedgerHash } from '../server/communityCompetitionSnapshotModel.js';

const ELIGIBLE_DATE = '2026-07-10';
const D1 = '2026-07-13';
const D2 = '2026-07-14';
const THURSDAY = '2026-07-16';
const LEGACY_INCIDENT_DATE = '2026-07-30';
const LEGACY_INCIDENT_NEXT_DATE = '2026-07-31';
const USER_ID = 'rebaseline-user';
const ENV_KEYS = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'EODHD_API_KEY',
];

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (body == null ? '' : JSON.stringify(body)),
  };
}

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

function makeTrade({ price = 100, shares = 10 } = {}) {
  return {
    id: 'formal-trade-1',
    user_id: USER_ID,
    symbol: 'NVDA',
    name: 'NVIDIA',
    side: 'buy',
    trade_date: '2026-07-01',
    price,
    shares,
    fee: 0,
    currency: 'USD',
    created_at: '2026-07-01T14:00:00Z',
    updated_at: '2026-07-01T14:00:00Z',
  };
}

function makeMismatchedMember(currentTrade) {
  return {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-10T19:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([
      { ...currentTrade, price: currentTrade.price - 1 },
    ], ELIGIBLE_DATE),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
}

function filterSnapshots(rows, href) {
  const search = new URL(href).searchParams;
  const filter = search.get('snapshot_date') || '';
  if (!filter) return [...rows];
  const boundary = filter.replace(/^(?:lt|lte|eq)\./, '');
  if (filter.startsWith('lt.')) {
    return rows.filter((row) => row.snapshot_date < boundary);
  }
  if (filter.startsWith('lte.')) {
    return rows.filter((row) => row.snapshot_date <= boundary);
  }
  if (filter.startsWith('eq.')) {
    return rows.filter((row) => row.snapshot_date === boundary);
  }
  return [...rows];
}

function filterEodRows(rows, href) {
  const search = new URL(href).searchParams;
  const from = search.get('from') || '0000-01-01';
  const to = search.get('to') || '9999-12-31';
  return rows.filter((row) => row.date >= from && row.date <= to);
}

function createHarness({
  member,
  trades,
  calendarRows = [
    { date: ELIGIBLE_DATE, adjusted_close: 600 },
    { date: D1, adjusted_close: 606 },
    { date: D2, adjusted_close: 612 },
  ],
  nvdaRows = [
    { date: ELIGIBLE_DATE, adjusted_close: 98, high: 101, low: 95 },
    { date: D1, adjusted_close: 100, high: 104, low: 96 },
    { date: D2, adjusted_close: 110, high: 113, low: 103 },
  ],
  ledgerState = {
    user_id: USER_ID,
    revision: 2,
    last_mutated_at: '2026-07-13T19:30:00Z',
  },
  snapshotInsertRace = false,
  snapshots = [],
  rankedRebaselineOutcome = null,
} = {}) {
  const state = {
    member: { ...member },
    trades: trades.map((trade) => ({ ...trade })),
    ledgerState: { ...ledgerState },
    snapshots: snapshots.map((snapshot) => ({ ...snapshot })),
    rpcBodies: [],
    rankedRpcBodies: [],
    rankingPatches: [],
    snapshotWrites: [],
    spyRequests: 0,
    nvdaRequests: 0,
    snapshotInsertRace,
  };

  const fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes(
      '/rest/v1/rpc/forward_rebaseline_ranked_community_competition_member'
    )) {
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      state.rankedRpcBodies.push(body);
      if (rankedRebaselineOutcome) return jsonResponse(rankedRebaselineOutcome);
      const matchesExpectedState = (
        body.p_user_id === state.member.user_id
        && body.p_expected_eligible_after_snapshot_date
          === state.member.eligible_after_snapshot_date
        && body.p_expected_eligible_ledger_hash === state.member.eligible_ledger_hash
        && body.p_expected_eligible_ledger_revision
          === state.member.eligible_ledger_revision
        && body.p_expected_ranking_start_snapshot_date
          === state.member.ranking_start_snapshot_date
        && body.p_expected_ranking_baseline_return_pct
          === state.member.ranking_baseline_return_pct
        && body.p_expected_current_ledger_revision === state.ledgerState.revision
        && state.member.status === 'active'
        && state.member.ranking_start_snapshot_date != null
        && state.member.ranking_baseline_return_pct != null
        && !state.snapshots.some((snapshot) => (
          snapshot.snapshot_date >= body.p_new_eligible_after_snapshot_date
        ))
      );
      if (!matchesExpectedState) return jsonResponse('stale_member');
      state.member.eligible_after_snapshot_date = body.p_new_eligible_after_snapshot_date;
      state.member.eligible_ledger_hash = body.p_new_eligible_ledger_hash;
      state.member.eligible_ledger_revision = state.ledgerState.revision;
      state.member.ranking_start_snapshot_date = null;
      state.member.ranking_baseline_return_pct = null;
      state.member.updated_at = `${body.p_new_eligible_after_snapshot_date}T21:00:00Z`;
      return jsonResponse('rebaselined');
    }
    if (href.includes('/rest/v1/rpc/rebaseline_community_competition_member')) {
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      state.rpcBodies.push(body);
      const matchesExpectedState = (
        body.p_user_id === state.member.user_id
        && body.p_expected_eligible_after_snapshot_date
          === state.member.eligible_after_snapshot_date
        && body.p_expected_eligible_ledger_hash === state.member.eligible_ledger_hash
        && body.p_expected_eligible_ledger_revision
          === state.member.eligible_ledger_revision
        && body.p_expected_current_ledger_revision === state.ledgerState.revision
        && state.member.status === 'active'
        && state.member.ranking_start_snapshot_date == null
        && state.member.ranking_baseline_return_pct == null
        && state.snapshots.length === 0
      );
      if (!matchesExpectedState) return jsonResponse('stale_member');
      state.member.eligible_after_snapshot_date = body.p_new_eligible_after_snapshot_date;
      state.member.eligible_ledger_hash = body.p_new_eligible_ledger_hash;
      state.member.eligible_ledger_revision = state.ledgerState.revision;
      state.member.updated_at = `${body.p_new_eligible_after_snapshot_date}T21:00:00Z`;
      return jsonResponse('rebaselined');
    }

    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      const patch = JSON.parse(options.body);
      state.rankingPatches.push(patch);
      state.member.ranking_start_snapshot_date = patch.ranking_start_snapshot_date;
      state.member.ranking_baseline_return_pct = patch.ranking_baseline_return_pct;
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{ ...state.member }]);
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) {
      return jsonResponse([{ ...state.ledgerState }]);
    }
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse(state.trades.map((trade) => ({ ...trade })));
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      const rows = JSON.parse(options.body);
      if (state.snapshotInsertRace) {
        state.snapshotInsertRace = false;
        state.ledgerState.revision += 1;
        state.ledgerState.last_mutated_at = '2026-07-14T20:30:00Z';
        return jsonResponse({ message: 'ledger revision changed before snapshot insert' }, 409);
      }
      rows.forEach((row) => {
        assert.ok(
          row.snapshot_date > state.member.eligible_after_snapshot_date,
          'a first snapshot must be later than the current eligibility baseline',
        );
        assert.equal(row.ledger_revision, state.ledgerState.revision);
      });
      state.snapshotWrites.push(...rows);
      state.snapshots.push(...rows);
      return jsonResponse(rows);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      return jsonResponse(filterSnapshots(state.snapshots, href));
    }

    if (href.includes('/api/eod/SPY.US')) {
      state.spyRequests += 1;
      return jsonResponse(filterEodRows(calendarRows, href));
    }
    if (href.includes('/api/eod/NVDA.US')) {
      state.nvdaRequests += 1;
      return jsonResponse(filterEodRows(nvdaRows, href));
    }

    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  return { state, fetch };
}

async function withHarness(harness, callback) {
  const env = snapshotEnv(ENV_KEYS);
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  globalThis.fetch = harness.fetch;
  try {
    return await callback(harness.state);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
}

test('scheduled D1 ledger mismatch only rebaselines through RPC and writes no snapshot', async () => {
  const trade = makeTrade();
  const harness = createHarness({ member: makeMismatchedMember(trade), trades: [trade] });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 1);
  assert.equal(result.deferredReasons.rebaseline_waiting_next_close, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.deepEqual(result.processedDates, []);
  assert.equal(harness.state.rpcBodies.length, 1);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.rankingPatches.length, 0);
  assert.equal(harness.state.member.eligible_after_snapshot_date, D1);
  assert.equal(
    harness.state.member.eligible_ledger_hash,
    computeCompetitionLedgerHash([trade], D1),
  );
  assert.equal(harness.state.member.ranking_start_snapshot_date, null);
});

test('a legitimate target-day buy before 16:00 ET follows the normal first-snapshot path', async () => {
  const targetDayTrade = {
    ...makeTrade({ price: 100, shares: 2 }),
    id: 'target-day-buy',
    trade_date: D1,
    created_at: '2026-07-13T19:30:00Z',
    updated_at: '2026-07-13T19:30:00Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-10T19:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([], ELIGIBLE_DATE),
    eligible_ledger_revision: 0,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const harness = createHarness({
    member,
    trades: [targetDayTrade],
    ledgerState: {
      user_id: USER_ID,
      revision: 1,
      last_mutated_at: '2026-07-13T19:30:00Z',
    },
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 0);
  assert.equal(result.writtenSnapshots, 1);
  assert.deepEqual(result.processedDates, [D1]);
  assert.equal(harness.state.rpcBodies.length, 0);
  assert.equal(harness.state.snapshotWrites[0].ledger_revision, 1);
  assert.equal(harness.state.member.ranking_start_snapshot_date, D1);
});

test('a target-day update before close rebaselines instead of using the insert fast path', async () => {
  const updatedTargetTrade = {
    ...makeTrade({ price: 100, shares: 3 }),
    id: 'target-day-updated-buy',
    trade_date: D1,
    created_at: '2026-07-13T19:00:00Z',
    updated_at: '2026-07-13T19:30:00Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-10T19:00:00Z',
    updated_at: '2026-07-10T19:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([], ELIGIBLE_DATE),
    eligible_ledger_revision: 0,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const harness = createHarness({
    member,
    trades: [updatedTargetTrade],
    ledgerState: {
      user_id: USER_ID,
      revision: 2,
      last_mutated_at: '2026-07-13T19:30:00Z',
    },
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.rebaselinedMembers, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(harness.state.rpcBodies.length, 1);
  assert.equal(harness.state.snapshotWrites.length, 0);
});

test('a 15:59 buy updated at 16:30 ET defers, then rebaselines on the next close', async () => {
  const targetDayTrade = {
    ...makeTrade({ price: 100, shares: 3 }),
    id: 'target-day-post-close-update',
    trade_date: D1,
    created_at: '2026-07-13T19:59:00Z',
    updated_at: '2026-07-13T20:30:00Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-10T19:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([], ELIGIBLE_DATE),
    eligible_ledger_revision: 0,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const harness = createHarness({
    member,
    trades: [targetDayTrade],
    ledgerState: {
      user_id: USER_ID,
      revision: 2,
      last_mutated_at: '2026-07-13T20:30:00Z',
    },
  });

  const { d1Result, d2Result } = await withHarness(harness, async () => ({
    d1Result: await runCommunityCompetitionScheduledCatchUp({
      targetDate: D1,
      now: new Date('2026-07-13T23:00:00Z'),
    }),
    d2Result: await runCommunityCompetitionScheduledCatchUp({
      targetDate: D2,
      now: new Date('2026-07-14T23:00:00Z'),
    }),
  }));

  assert.equal(d1Result.success, true);
  assert.equal(d1Result.rebaselinedMembers, 0);
  assert.equal(d1Result.writtenSnapshots, 0);
  assert.equal(d1Result.deferredReasons.ledger_mutated_after_target_close, 1);
  assert.equal(d2Result.rebaselinedMembers, 1);
  assert.equal(d2Result.writtenSnapshots, 0);
  assert.equal(d2Result.deferredReasons.rebaseline_waiting_next_close, 1);
  assert.equal(harness.state.rpcBodies.length, 1);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.rankingPatches.length, 0);
});

test('a Monday trade edited before Thursday close rebaselines Thursday with zero snapshot', async () => {
  const historicalTrade = {
    ...makeTrade({ price: 100, shares: 4 }),
    id: 'monday-trade-edited-thursday',
    trade_date: D1,
    created_at: '2026-07-13T19:00:00Z',
    updated_at: '2026-07-16T19:00:00Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-10T18:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([], ELIGIBLE_DATE),
    eligible_ledger_revision: 0,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const harness = createHarness({
    member,
    trades: [historicalTrade],
    ledgerState: {
      user_id: USER_ID,
      revision: 2,
      last_mutated_at: '2026-07-16T19:00:00Z',
    },
    calendarRows: [
      { date: ELIGIBLE_DATE, adjusted_close: 600 },
      { date: D1, adjusted_close: 606 },
      { date: THURSDAY, adjusted_close: 620 },
    ],
    nvdaRows: [
      { date: D1, adjusted_close: 100, high: 104, low: 96 },
      { date: THURSDAY, adjusted_close: 108, high: 111, low: 103 },
    ],
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: THURSDAY,
    now: new Date('2026-07-16T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.deferredReasons.rebaseline_waiting_next_close, 1);
  assert.equal(harness.state.rpcBodies.length, 1);
  assert.equal(harness.state.member.eligible_after_snapshot_date, THURSDAY);
  assert.equal(harness.state.snapshotWrites.length, 0);
});

test('deleting Monday then inserting Thursday cannot masquerade as a current-day-only ledger', async () => {
  const thursdayInsert = {
    ...makeTrade({ price: 108, shares: 2 }),
    id: 'thursday-insert-after-monday-delete',
    trade_date: THURSDAY,
    created_at: '2026-07-16T19:00:00Z',
    updated_at: '2026-07-16T19:00:00Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-10T18:00:00Z',
    updated_at: '2026-07-10T18:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([], ELIGIBLE_DATE),
    eligible_ledger_revision: 0,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const harness = createHarness({
    member,
    trades: [thursdayInsert],
    // Monday INSERT + Monday DELETE + Thursday INSERT.
    ledgerState: {
      user_id: USER_ID,
      revision: 3,
      last_mutated_at: '2026-07-16T19:00:00Z',
    },
    calendarRows: [
      { date: ELIGIBLE_DATE, adjusted_close: 600 },
      { date: THURSDAY, adjusted_close: 620 },
    ],
    nvdaRows: [
      { date: THURSDAY, adjusted_close: 108, high: 111, low: 103 },
    ],
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: THURSDAY,
    now: new Date('2026-07-16T23:00:00Z'),
  }));

  assert.equal(result.rebaselinedMembers, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(harness.state.rpcBodies.length, 1);
  assert.equal(harness.state.snapshotWrites.length, 0);
});

test('a migrated zero-snapshot member is forward-rebaselined instead of historically backfilled', async () => {
  const legacyTrade = makeTrade();
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-01T12:00:00Z',
    updated_at: '2026-07-01T12:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([legacyTrade], ELIGIBLE_DATE),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const harness = createHarness({
    member,
    trades: [legacyTrade],
    ledgerState: {
      user_id: USER_ID,
      revision: 1,
      last_mutated_at: '2026-07-14T15:00:00Z',
    },
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D2,
    now: new Date('2026-07-14T23:00:00Z'),
  }));

  assert.equal(result.rebaselinedMembers, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.deepEqual(result.processedDates, []);
  assert.equal(harness.state.member.eligible_after_snapshot_date, D2);
});

test('an explicit historical date defers when migration mutation time is after that close', async () => {
  const legacyTrade = makeTrade();
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-01T12:00:00Z',
    updated_at: '2026-07-01T12:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([legacyTrade], ELIGIBLE_DATE),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const harness = createHarness({
    member,
    trades: [legacyTrade],
    ledgerState: {
      user_id: USER_ID,
      revision: 1,
      last_mutated_at: '2026-07-14T15:00:00Z',
    },
  });

  const result = await withHarness(harness, () => runCommunityCompetitionDailySnapshot({
    targetDate: D1,
    now: new Date('2026-07-14T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.deferredReasons.ledger_mutated_after_target_close, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.rpcBodies.length, 0);
});

test('a legacy delta-zero target row rebaselines when mutation is newer than member baseline', async () => {
  const targetTrade = {
    ...makeTrade({ price: 100, shares: 2 }),
    id: 'legacy-target-row',
    trade_date: D1,
    created_at: '2026-07-13T19:30:00Z',
    updated_at: '2026-07-13T19:30:00Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-10T18:00:00Z',
    updated_at: '2026-07-10T18:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([], ELIGIBLE_DATE),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const harness = createHarness({
    member,
    trades: [targetTrade],
    ledgerState: {
      user_id: USER_ID,
      revision: 1,
      last_mutated_at: '2026-07-13T19:30:00Z',
    },
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.rebaselinedMembers, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(harness.state.rpcBodies.length, 1);
});

test('a target row already locked by a newer join baseline can use delta zero normally', async () => {
  const targetTrade = {
    ...makeTrade({ price: 100, shares: 2 }),
    id: 'pre-join-target-row',
    trade_date: D1,
    created_at: '2026-07-13T19:30:00Z',
    updated_at: '2026-07-13T19:30:00Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-13T19:45:00Z',
    updated_at: '2026-07-13T19:45:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([], ELIGIBLE_DATE),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const harness = createHarness({
    member,
    trades: [targetTrade],
    ledgerState: {
      user_id: USER_ID,
      revision: 1,
      last_mutated_at: '2026-07-13T19:30:00Z',
    },
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.rebaselinedMembers, 0);
  assert.equal(result.writtenSnapshots, 1);
  assert.equal(harness.state.rpcBodies.length, 0);
});

test('an unchanged D2 after D1 rebaseline writes the first snapshot and initializes ranking', async () => {
  const trade = makeTrade();
  const harness = createHarness({ member: makeMismatchedMember(trade), trades: [trade] });

  const { d1Result, d2Result } = await withHarness(harness, async () => {
    const d1Result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: D1,
      now: new Date('2026-07-13T23:00:00Z'),
    });
    const d2Result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: D2,
      now: new Date('2026-07-14T23:00:00Z'),
    });
    return { d1Result, d2Result };
  });

  assert.equal(d1Result.rebaselinedMembers, 1);
  assert.equal(d1Result.writtenSnapshots, 0);
  assert.equal(d2Result.success, true);
  assert.equal(d2Result.rebaselinedMembers, 0);
  assert.equal(d2Result.writtenSnapshots, 1);
  assert.equal(d2Result.initializedMembers, 1);
  assert.deepEqual(d2Result.processedDates, [D2]);
  assert.equal(harness.state.rpcBodies.length, 1);
  assert.equal(harness.state.snapshotWrites.length, 1);
  const snapshot = harness.state.snapshotWrites[0];
  assert.equal(snapshot.snapshot_date, D2);
  assert.equal(snapshot.ledger_revision, 2);
  assert.ok(Math.abs(snapshot.daily_return_pct - 0.1) < 1e-12);
  assert.ok(Math.abs(snapshot.cumulative_return_pct - 0.1) < 1e-12);
  assert.equal(snapshot.ledger_hash, computeCompetitionLedgerHash([trade], D2));
  assert.equal(harness.state.rankingPatches.length, 1);
  assert.equal(harness.state.member.ranking_start_snapshot_date, D2);
  assert.equal(harness.state.member.ranking_baseline_return_pct, 0);
});

test('a second ledger edit before D2 rebaselines again and still writes no snapshot', async () => {
  const originalTrade = makeTrade();
  const harness = createHarness({
    member: makeMismatchedMember(originalTrade),
    trades: [originalTrade],
  });

  const { d1Result, d2Result, editedTrade } = await withHarness(harness, async (state) => {
    const d1Result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: D1,
      now: new Date('2026-07-13T23:00:00Z'),
    });
    const editedTrade = { ...state.trades[0], shares: 12 };
    state.trades = [editedTrade];
    state.ledgerState.revision += 1;
    state.ledgerState.last_mutated_at = '2026-07-14T19:30:00Z';
    const d2Result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: D2,
      now: new Date('2026-07-14T23:00:00Z'),
    });
    return { d1Result, d2Result, editedTrade };
  });

  assert.equal(d1Result.rebaselinedMembers, 1);
  assert.equal(d2Result.success, true);
  assert.equal(d2Result.rebaselinedMembers, 1);
  assert.equal(d2Result.deferredReasons.rebaseline_waiting_next_close, 1);
  assert.equal(d2Result.writtenSnapshots, 0);
  assert.deepEqual(d2Result.processedDates, []);
  assert.equal(harness.state.rpcBodies.length, 2);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.rankingPatches.length, 0);
  assert.equal(harness.state.member.eligible_after_snapshot_date, D2);
  assert.equal(
    harness.state.member.eligible_ledger_hash,
    computeCompetitionLedgerHash([editedTrade], D2),
  );
});

test('a ledger mutation racing the snapshot insert is rejected by the database CAS guard', async () => {
  const trade = makeTrade();
  const harness = createHarness({
    member: makeMismatchedMember(trade),
    trades: [trade],
    snapshotInsertRace: true,
  });

  const { d2Result } = await withHarness(harness, async (state) => {
    const d1Result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: D1,
      now: new Date('2026-07-13T23:00:00Z'),
    });
    assert.equal(d1Result.rebaselinedMembers, 1);
    const d2Result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: D2,
      now: new Date('2026-07-14T23:00:00Z'),
    });
    assert.equal(state.ledgerState.revision, 3);
    return { d2Result };
  });

  assert.equal(d2Result.success, false);
  assert.equal(d2Result.writtenSnapshots, 0);
  assert.equal(d2Result.failedMembers, 1);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.rankingPatches.length, 0);
});

test('a post-close mutation also defers a later snapshot anchored to prior ledger revision', async () => {
  const originalTrade = makeTrade({ shares: 10 });
  const updatedTrade = { ...originalTrade, shares: 12 };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-10T19:00:00Z',
    eligible_after_snapshot_date: ELIGIBLE_DATE,
    eligible_ledger_hash: computeCompetitionLedgerHash([originalTrade], ELIGIBLE_DATE),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: D1,
    ranking_baseline_return_pct: 0,
  };
  const priorSnapshot = {
    user_id: USER_ID,
    snapshot_date: D1,
    daily_return_pct: 0,
    cumulative_return_pct: 0,
    locked_at: '2026-07-13T21:00:00Z',
    source_version: 'community_competition_snapshot_v1',
    ledger_hash: computeCompetitionLedgerHash([originalTrade], D1),
    ledger_revision: 1,
  };
  const harness = createHarness({
    member,
    trades: [updatedTrade],
    snapshots: [priorSnapshot],
    ledgerState: {
      user_id: USER_ID,
      revision: 2,
      last_mutated_at: '2026-07-14T20:30:00Z',
    },
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D2,
    now: new Date('2026-07-14T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.deferredReasons.ledger_mutated_after_target_close, 1);
  assert.deepEqual(result.processedDates, [D2]);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.rpcBodies.length, 0);
});

test('a missing SPY target close never rebaselines or writes a snapshot', async () => {
  const trade = makeTrade();
  const member = makeMismatchedMember(trade);
  const originalEligibleHash = member.eligible_ledger_hash;
  const harness = createHarness({
    member,
    trades: [trade],
    calendarRows: [{ date: ELIGIBLE_DATE, adjusted_close: 600 }],
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, false);
  assert.equal(result.retryableIncomplete, true);
  assert.equal(result.retryableIncompleteReasons.market_calendar_target_missing, 1);
  assert.equal(result.rebaselinedMembers, 0);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(harness.state.spyRequests, 3);
  assert.equal(harness.state.rpcBodies.length, 0);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.member.eligible_after_snapshot_date, ELIGIBLE_DATE);
  assert.equal(harness.state.member.eligible_ledger_hash, originalEligibleHash);
});

test('an old stock close never substitutes for the exact rebaseline target-date close', async () => {
  const trade = makeTrade();
  const member = makeMismatchedMember(trade);
  const originalEligibleHash = member.eligible_ledger_hash;
  const harness = createHarness({
    member,
    trades: [trade],
    nvdaRows: [
      { date: ELIGIBLE_DATE, adjusted_close: 98, high: 101, low: 95 },
    ],
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, false);
  assert.equal(result.retryableIncomplete, true);
  assert.equal(result.retryableIncompleteReasons.rebaseline_target_quote_unavailable, 1);
  assert.equal(result.rebaselinedMembers, 0);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(harness.state.spyRequests, 1);
  assert.equal(harness.state.nvdaRequests, 3);
  assert.equal(harness.state.rpcBodies.length, 0);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.member.eligible_after_snapshot_date, ELIGIBLE_DATE);
  assert.equal(harness.state.member.eligible_ledger_hash, originalEligibleHash);
});

test('a malformed formal-ledger row is rejected instead of filtered out and rebaselined', async () => {
  const invalidTrade = { ...makeTrade(), symbol: '', price: 0 };
  const member = {
    ...makeMismatchedMember(makeTrade()),
    eligible_ledger_hash: computeCompetitionLedgerHash([], ELIGIBLE_DATE),
  };
  const harness = createHarness({ member, trades: [invalidTrade] });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 0);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.authoritativeRejectionReasons.invalid_trade, 1);
  assert.equal(harness.state.rpcBodies.length, 0);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.spyRequests, 0);
  assert.equal(harness.state.member.eligible_after_snapshot_date, ELIGIBLE_DATE);
});

test('a target-day trade written after the New York close cannot be hidden by a rebaseline', async () => {
  const originalTrade = makeTrade();
  const lateTrade = {
    ...makeTrade({ price: 100, shares: 1 }),
    id: 'late-target-trade',
    trade_date: D1,
    created_at: '2026-07-13T20:30:00Z',
    updated_at: '2026-07-13T20:30:00Z',
  };
  const harness = createHarness({
    member: makeMismatchedMember(originalTrade),
    trades: [originalTrade, lateTrade],
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 0);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.authoritativeRejectionReasons.late_trade, 1);
  assert.equal(harness.state.rpcBodies.length, 0);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.member.eligible_after_snapshot_date, ELIGIBLE_DATE);
});

test('a ranked member with a pre-close New York date mismatch is forward-rebaselined', async () => {
  const originalTrade = makeTrade();
  const mismatchedTargetTrade = {
    ...makeTrade({ price: 100, shares: 1 }),
    id: 'timezone-mismatched-target-trade',
    trade_date: LEGACY_INCIDENT_DATE,
    // 07/29 20:12 New York / 07/30 08:12 Shanghai. This is the
    // production incident caused by the former device-calendar default.
    created_at: '2026-07-30T00:12:18Z',
    updated_at: '2026-07-30T00:12:18Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-09T12:00:00Z',
    eligible_after_snapshot_date: '2026-07-09',
    eligible_ledger_hash: computeCompetitionLedgerHash([originalTrade], '2026-07-09'),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: ELIGIBLE_DATE,
    ranking_baseline_return_pct: 0,
  };
  const priorSnapshot = {
    user_id: USER_ID,
    snapshot_date: ELIGIBLE_DATE,
    daily_return_pct: 0,
    cumulative_return_pct: 0,
    locked_at: '2026-07-10T21:00:00Z',
    source_version: 'community_competition_snapshot_v1',
    ledger_hash: computeCompetitionLedgerHash([originalTrade], ELIGIBLE_DATE),
    ledger_revision: 1,
  };
  const harness = createHarness({
    member,
    trades: [originalTrade, mismatchedTargetTrade],
    snapshots: [priorSnapshot],
    ledgerState: {
      user_id: USER_ID,
      revision: 2,
      last_mutated_at: '2026-07-30T17:00:55Z',
    },
    calendarRows: [
      { date: ELIGIBLE_DATE, adjusted_close: 600 },
      { date: LEGACY_INCIDENT_DATE, adjusted_close: 606 },
    ],
    nvdaRows: [
      { date: ELIGIBLE_DATE, adjusted_close: 98, high: 101, low: 95 },
      { date: LEGACY_INCIDENT_DATE, adjusted_close: 100, high: 104, low: 96 },
    ],
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: LEGACY_INCIDENT_DATE,
    now: new Date('2026-07-30T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 1);
  assert.equal(result.authoritativeRejectionReasons.late_trade, 1);
  assert.equal(result.deferredReasons.forward_rebaseline_waiting_next_close, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(harness.state.rankedRpcBodies.length, 1);
  assert.equal(harness.state.member.eligible_after_snapshot_date, LEGACY_INCIDENT_DATE);
  assert.equal(harness.state.member.ranking_start_snapshot_date, null);
  assert.equal(harness.state.member.ranking_baseline_return_pct, null);
  assert.deepEqual(
    harness.state.snapshots.map((snapshot) => snapshot.snapshot_date),
    [ELIGIBLE_DATE],
    'the rejected day must not receive a fabricated snapshot',
  );
});

test('the same local-date mismatch outside the one-time incident remains fail closed', async () => {
  const originalTrade = makeTrade();
  const futureDatedPattern = {
    ...makeTrade({ price: 100, shares: 1 }),
    id: 'non-incident-timezone-mismatch',
    trade_date: D1,
    created_at: '2026-07-13T00:30:00Z',
    updated_at: '2026-07-13T00:30:00Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-09T12:00:00Z',
    eligible_after_snapshot_date: '2026-07-09',
    eligible_ledger_hash: computeCompetitionLedgerHash([originalTrade], '2026-07-09'),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: ELIGIBLE_DATE,
    ranking_baseline_return_pct: 0,
  };
  const harness = createHarness({
    member,
    trades: [originalTrade, futureDatedPattern],
    snapshots: [{
      user_id: USER_ID,
      snapshot_date: ELIGIBLE_DATE,
      daily_return_pct: 0,
      cumulative_return_pct: 0,
      locked_at: '2026-07-10T21:00:00Z',
      source_version: 'community_competition_snapshot_v1',
      ledger_hash: computeCompetitionLedgerHash([originalTrade], ELIGIBLE_DATE),
      ledger_revision: 1,
    }],
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 0);
  assert.equal(result.authoritativeRejectionReasons.late_trade, 1);
  assert.equal(harness.state.rankedRpcBodies.length, 0);
  assert.equal(harness.state.member.ranking_start_snapshot_date, ELIGIBLE_DATE);
});

test('the first close after a ranked reset starts a new epoch and ignores older snapshots', async () => {
  const originalTrade = makeTrade();
  const mismatchedTargetTrade = {
    ...makeTrade({ price: 100, shares: 1 }),
    id: 'timezone-mismatched-target-trade',
    trade_date: LEGACY_INCIDENT_DATE,
    created_at: '2026-07-30T00:12:18Z',
    updated_at: '2026-07-30T00:12:18Z',
  };
  const member = {
    user_id: USER_ID,
    status: 'active',
    joined_at: '2026-07-09T12:00:00Z',
    eligible_after_snapshot_date: '2026-07-09',
    eligible_ledger_hash: computeCompetitionLedgerHash([originalTrade], '2026-07-09'),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: ELIGIBLE_DATE,
    ranking_baseline_return_pct: 0,
  };
  const harness = createHarness({
    member,
    trades: [originalTrade, mismatchedTargetTrade],
    snapshots: [{
      user_id: USER_ID,
      snapshot_date: ELIGIBLE_DATE,
      daily_return_pct: 0,
      cumulative_return_pct: 0.75,
      locked_at: '2026-07-10T21:00:00Z',
      source_version: 'community_competition_snapshot_v1',
      ledger_hash: computeCompetitionLedgerHash([originalTrade], ELIGIBLE_DATE),
      ledger_revision: 1,
    }],
    ledgerState: {
      user_id: USER_ID,
      revision: 2,
      last_mutated_at: '2026-07-30T17:00:55Z',
    },
    calendarRows: [
      { date: ELIGIBLE_DATE, adjusted_close: 600 },
      { date: LEGACY_INCIDENT_DATE, adjusted_close: 606 },
      { date: LEGACY_INCIDENT_NEXT_DATE, adjusted_close: 612 },
    ],
    nvdaRows: [
      { date: ELIGIBLE_DATE, adjusted_close: 98, high: 101, low: 95 },
      { date: LEGACY_INCIDENT_DATE, adjusted_close: 100, high: 104, low: 96 },
      { date: LEGACY_INCIDENT_NEXT_DATE, adjusted_close: 110, high: 113, low: 103 },
    ],
  });

  const [resetResult, nextCloseResult] = await withHarness(harness, async () => {
    const reset = await runCommunityCompetitionScheduledCatchUp({
      targetDate: LEGACY_INCIDENT_DATE,
      now: new Date('2026-07-30T23:00:00Z'),
    });
    const next = await runCommunityCompetitionScheduledCatchUp({
      targetDate: LEGACY_INCIDENT_NEXT_DATE,
      now: new Date('2026-07-31T23:00:00Z'),
    });
    return [reset, next];
  });

  assert.equal(resetResult.rebaselinedMembers, 1);
  assert.equal(nextCloseResult.success, true);
  assert.deepEqual(nextCloseResult.processedDates, [LEGACY_INCIDENT_NEXT_DATE]);
  assert.equal(nextCloseResult.writtenSnapshots, 1);
  assert.equal(harness.state.snapshotWrites.length, 1);
  assert.equal(harness.state.snapshotWrites[0].snapshot_date, LEGACY_INCIDENT_NEXT_DATE);
  assert.ok(
    Math.abs(Number(harness.state.snapshotWrites[0].cumulative_return_pct) - 0.1) < 1e-12
  );
  assert.equal(harness.state.member.ranking_start_snapshot_date, LEGACY_INCIDENT_NEXT_DATE);
  assert.equal(harness.state.member.ranking_baseline_return_pct, 0);
  assert.deepEqual(
    harness.state.snapshots.map((snapshot) => snapshot.snapshot_date),
    [ELIGIBLE_DATE, LEGACY_INCIDENT_NEXT_DATE],
    'the old epoch remains immutable while the new epoch starts after the reset',
  );
});

test('a forged pre-close created_at cannot hide an authoritative post-close mutation', async () => {
  const originalTrade = makeTrade();
  const forgedTrade = {
    ...makeTrade({ price: 100, shares: 1 }),
    id: 'forged-created-at-trade',
    trade_date: D1,
    created_at: '2026-07-13T19:30:00Z',
    updated_at: '2026-07-13T20:30:00Z',
  };
  const harness = createHarness({
    member: makeMismatchedMember(originalTrade),
    trades: [originalTrade, forgedTrade],
    ledgerState: {
      user_id: USER_ID,
      revision: 2,
      last_mutated_at: '2026-07-13T20:30:00Z',
    },
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 0);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.deferredReasons.ledger_mutated_after_target_close, 1);
  assert.equal(harness.state.rpcBodies.length, 0);
  assert.equal(harness.state.snapshotWrites.length, 0);
});

test('a target-day price outside raw high-low may rebaseline for the internal competition', async () => {
  const originalTrade = makeTrade();
  const outOfRangeTrade = {
    ...makeTrade({ price: 999999, shares: 1 }),
    id: 'out-of-range-target-trade',
    trade_date: D1,
    created_at: '2026-07-13T19:30:00Z',
    updated_at: '2026-07-13T19:30:00Z',
  };
  const harness = createHarness({
    member: makeMismatchedMember(originalTrade),
    trades: [originalTrade, outOfRangeTrade],
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 1);
  assert.equal(result.deferredReasons.rebaseline_waiting_next_close, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.authoritativeRejectionReasons.price_out_of_range, undefined);
  assert.equal(harness.state.rpcBodies.length, 1);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.member.eligible_after_snapshot_date, D1);
  assert.equal(
    harness.state.member.eligible_ledger_hash,
    computeCompetitionLedgerHash([originalTrade, outOfRangeTrade], D1),
  );
});

test('an empty formal-ledger currency is rejected instead of defaulting to USD during rebaseline', async () => {
  const originalTrade = makeTrade();
  const emptyCurrencyTrade = { ...originalTrade, currency: '' };
  const harness = createHarness({
    member: makeMismatchedMember(originalTrade),
    trades: [emptyCurrencyTrade],
  });

  const result = await withHarness(harness, () => runCommunityCompetitionScheduledCatchUp({
    targetDate: D1,
    now: new Date('2026-07-13T23:00:00Z'),
  }));

  assert.equal(result.success, true);
  assert.equal(result.rebaselinedMembers, 0);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.authoritativeRejectionReasons.unsupported_currency, 1);
  assert.equal(harness.state.rpcBodies.length, 0);
  assert.equal(harness.state.snapshotWrites.length, 0);
  assert.equal(harness.state.spyRequests, 0);
  assert.equal(harness.state.member.eligible_after_snapshot_date, ELIGIBLE_DATE);
});
