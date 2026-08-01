import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  runCommunityCompetitionDailySnapshot,
  runCommunityCompetitionScheduledCatchUp,
} from '../server/communityCompetitionDailySnapshot.js';
import { computeCompetitionLedgerHash } from '../server/communityCompetitionSnapshotModel.js';
import { publishCommunityCompetitionSnapshotMarker } from '../server/snapshotPublicationMarker.js';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
    json: async () => body,
  };
}

const ENV_KEYS = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'EODHD_API_KEY',
];

function configureEnv() {
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
}

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(env) {
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

function trade(overrides = {}) {
  return {
    id: 'trade-a',
    user_id: 'user-a',
    symbol: 'NVDA',
    name: 'NVIDIA',
    side: 'buy',
    trade_date: '2026-07-04',
    price: 80,
    shares: 10,
    fee: 0,
    currency: 'USD',
    note: '',
    created_at: '2026-08-01T03:00:00.000Z',
    updated_at: '2026-08-01T03:00:00.000Z',
    ...overrides,
  };
}

function member(overrides = {}) {
  return {
    user_id: 'user-a',
    status: 'active',
    joined_at: '2026-07-02T22:00:00.000Z',
    eligible_after_snapshot_date: '2026-07-02',
    eligible_ledger_hash: computeCompetitionLedgerHash([], '2026-07-02'),
    eligible_ledger_revision: 0,
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
    created_at: '2026-07-02T22:00:00.000Z',
    updated_at: '2026-07-02T22:00:00.000Z',
    ...overrides,
  };
}

async function runScenario({
  targetDate,
  currentMember = member(),
  trades = [trade()],
  ledgerRevision = 1,
  priorSnapshots = [],
  rpcOutcome = 'inserted',
  closeRows = [
    { date: '2026-07-02', close: 100, adjusted_close: 100 },
    { date: '2026-07-06', close: 110, adjusted_close: 110 },
    { date: '2026-07-07', close: 121, adjusted_close: 121 },
  ],
} = {}) {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureEnv();
  let storedTarget = null;
  const rpcBodies = [];
  const patchBodies = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      if (options.method === 'PATCH') {
        patchBodies.push(JSON.parse(options.body));
        return response([]);
      }
      return response([currentMember]);
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) {
      return response([{
        user_id: 'user-a',
        revision: ledgerRevision,
        last_mutated_at: '2026-08-01T03:00:00.000Z',
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return response(trades);
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      if (href.includes('snapshot_date=lt.')) return response(priorSnapshots);
      if (href.includes('snapshot_date=eq.')) return response(storedTarget ? [storedTarget] : []);
      return response([]);
    }
    if (href.includes('/rest/v1/rpc/upsert_unpublished_community_competition_member_snapshot')) {
      const body = JSON.parse(options.body);
      rpcBodies.push(body);
      if (['inserted', 'replaced_unpublished', 'already_current'].includes(rpcOutcome)) {
        storedTarget = {
          user_id: body.p_user_id,
          snapshot_date: body.p_target_snapshot_date,
          daily_return_pct: body.p_daily_return_pct,
          cumulative_return_pct: body.p_cumulative_return_pct,
          locked_at: body.p_locked_at,
          source_version: body.p_source_version,
          ledger_hash: body.p_ledger_hash,
          ledger_revision: body.p_expected_ledger_revision,
        };
      }
      return response({
        outcome: rpcOutcome,
        snapshotDate: body.p_target_snapshot_date,
        ledgerRevision,
        rankingInitialized: currentMember.ranking_start_snapshot_date == null
          && ['inserted', 'replaced_unpublished', 'already_current'].includes(rpcOutcome),
      });
    }
    if (href.includes('eodhd.com/api/eod/NVDA.US')) return response(closeRows);
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };
  try {
    const result = await runCommunityCompetitionDailySnapshot({
      targetDate,
      now: new Date(`${targetDate}T23:00:00.000Z`),
    });
    return { result, rpcBodies, patchBodies, storedTarget };
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
}

test('weekend first trade is mapped to Monday close despite a later created_at', async () => {
  const { result, rpcBodies, patchBodies, storedTarget } = await runScenario({
    targetDate: '2026-07-06',
  });
  assert.equal(result.success, true);
  assert.equal(result.writtenSnapshots, 1);
  assert.equal(result.initializedMembers, 1);
  assert.equal(rpcBodies.length, 1);
  assert.equal(rpcBodies[0].p_expected_ledger_revision, 1);
  assert.equal(rpcBodies[0].p_initialize_ranking_baseline_return_pct, 0);
  assert.ok(Math.abs(rpcBodies[0].p_daily_return_pct - 0.375) < 1e-12);
  assert.ok(Math.abs(storedTarget.cumulative_return_pct - 0.375) < 1e-12);
  assert.equal(patchBodies.length, 0);
});

test('weekend round trip still fetches Monday close and is valued as interval cash flow', async () => {
  const { result, rpcBodies } = await runScenario({
    targetDate: '2026-07-06',
    trades: [
      trade({ id: 'trade-buy', price: 80 }),
      trade({ id: 'trade-sell', side: 'sell', price: 90 }),
    ],
    ledgerRevision: 2,
  });
  assert.equal(result.success, true);
  assert.equal(result.writtenSnapshots, 1);
  assert.ok(Math.abs(rpcBodies[0].p_daily_return_pct - 0.125) < 1e-12);
});

test('rerun replaces a stale unpublished snapshot with the current ledger revision', async () => {
  const trades = [trade()];
  const priorHash = computeCompetitionLedgerHash(trades, '2026-07-06');
  const { result, rpcBodies, patchBodies } = await runScenario({
    targetDate: '2026-07-07',
    trades,
    ledgerRevision: 2,
    currentMember: member({
      eligible_ledger_revision: 1,
      ranking_start_snapshot_date: '2026-07-06',
      ranking_baseline_return_pct: 0,
    }),
    priorSnapshots: [{
      user_id: 'user-a',
      snapshot_date: '2026-07-06',
      cumulative_return_pct: 0.375,
      locked_at: '2026-07-06T23:00:00Z',
      ledger_hash: priorHash,
      ledger_revision: 1,
    }],
    rpcOutcome: 'replaced_unpublished',
  });
  assert.equal(result.success, true);
  assert.equal(result.writtenSnapshots, 1);
  assert.equal(result.existingSnapshots, 0);
  assert.equal(rpcBodies[0].p_expected_ledger_revision, 2);
  assert.ok(Math.abs(rpcBodies[0].p_daily_return_pct - 0.1) < 1e-12);
  assert.ok(Math.abs(rpcBodies[0].p_cumulative_return_pct - 0.5125) < 1e-12);
  assert.equal(patchBodies.length, 0);
});

test('ledger mutation racing the unpublished snapshot RPC fails closed and remains retryable', async () => {
  const { result, rpcBodies, storedTarget } = await runScenario({
    targetDate: '2026-07-06',
    rpcOutcome: 'stale_ledger',
  });
  assert.equal(rpcBodies.length, 1);
  assert.equal(storedTarget, null);
  assert.equal(result.success, false);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.retryableIncomplete, true);
  assert.equal(result.retryableIncompleteMembers, 1);
  assert.equal(result.retryableIncompleteReasons.snapshot_storage_temporarily_unavailable, 1);
});

test('failed historical rebuild cannot let cron clear dirty state or write a newer target', async () => {
  const { result, rpcBodies, storedTarget } = await runScenario({
    targetDate: '2026-07-06',
    rpcOutcome: 'historical_dirty',
  });
  assert.equal(rpcBodies.length, 1);
  assert.equal(storedTarget, null);
  assert.equal(result.success, false);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.retryableIncomplete, true);
  assert.equal(result.retryableIncompleteReasons.snapshot_storage_temporarily_unavailable, 1);
});

test('rank-null member with old snapshots stays pending instead of using the removed PATCH recovery', async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureEnv();
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_rebuild_state')) return response([]);
    if (href.includes('/rest/v1/community_competition_members')) return response([member()]);
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      return response([{
        user_id: 'user-a',
        snapshot_date: '2026-07-06',
        cumulative_return_pct: 0.1,
        locked_at: '2026-07-06T23:00:00Z',
        ledger_hash: 'a'.repeat(64),
        ledger_revision: 1,
      }]);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  try {
    const result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-07',
      now: new Date('2026-07-07T23:00:00Z'),
    });
    assert.equal(result.success, false);
    assert.equal(result.retryableIncomplete, true);
    assert.equal(result.retryableIncompleteMembers, 1);
    assert.equal(result.retryableIncompleteReasons.ranking_rebuild_pending, 1);
    assert.deepEqual(result.processedDates, []);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('snapshot then mutation blocks publication, rerun replaces it, and atomic publication succeeds', async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureEnv();
  const currentMember = member();
  let currentTrade = trade();
  let revision = 1;
  let dirty = null;
  let storedTarget = null;
  let durableMarker = null;
  const writeOutcomes = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      if (options.method === 'PATCH') {
        Object.assign(currentMember, JSON.parse(options.body));
        return response([]);
      }
      return response([currentMember]);
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) {
      return response([{ user_id: 'user-a', revision, last_mutated_at: '2026-08-01T03:00:00Z' }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return response([currentTrade]);
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      if (href.includes('snapshot_date=lt.')) return response([]);
      return response(storedTarget ? [storedTarget] : []);
    }
    if (href.includes('/rest/v1/rpc/upsert_unpublished_community_competition_member_snapshot')) {
      const body = JSON.parse(options.body);
      const outcome = storedTarget ? 'replaced_unpublished' : 'inserted';
      writeOutcomes.push(outcome);
      storedTarget = {
        user_id: body.p_user_id,
        snapshot_date: body.p_target_snapshot_date,
        daily_return_pct: body.p_daily_return_pct,
        cumulative_return_pct: body.p_cumulative_return_pct,
        locked_at: body.p_locked_at,
        source_version: body.p_source_version,
        ledger_hash: body.p_ledger_hash,
        ledger_revision: body.p_expected_ledger_revision,
      };
      dirty = null;
      return response({
        outcome,
        snapshotDate: body.p_target_snapshot_date,
        ledgerRevision: revision,
        rankingInitialized: currentMember.ranking_start_snapshot_date == null,
      });
    }
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      return response(durableMarker ? [durableMarker] : []);
    }
    if (href.includes('/rest/v1/rpc/publish_community_competition_snapshot_marker')) {
      const body = JSON.parse(options.body);
      if (dirty || storedTarget?.ledger_revision !== revision) {
        return response({
          outcome: 'incomplete',
          snapshotDate: '2026-07-06',
          version: null,
          completedAt: null,
          expectedMembers: 1,
          completeSnapshots: 0,
        });
      }
      durableMarker = {
        channel: 'competition',
        snapshot_date: '2026-07-06',
        version: body.p_new_version,
        completed_at: '2026-07-06T23:05:00Z',
      };
      return response({
        outcome: 'published',
        snapshotDate: durableMarker.snapshot_date,
        version: durableMarker.version,
        completedAt: durableMarker.completed_at,
        expectedMembers: 1,
        completeSnapshots: 1,
      });
    }
    if (href.includes('eodhd.com/api/eod/NVDA.US')) {
      return response([
        { date: '2026-07-02', close: 100, adjusted_close: 100 },
        { date: '2026-07-06', close: 110, adjusted_close: 110 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };
  try {
    const first = await runCommunityCompetitionDailySnapshot({
      targetDate: '2026-07-06',
      now: new Date('2026-07-06T23:00:00Z'),
    });
    assert.equal(first.writtenSnapshots, 1);
    assert.equal(storedTarget.ledger_revision, 1);

    currentTrade = trade({ price: 90, updated_at: '2026-08-01T04:00:00Z' });
    revision = 2;
    dirty = { dirty_from_date: '2026-07-04', ledger_revision: 2 };
    await assert.rejects(
      publishCommunityCompetitionSnapshotMarker({ snapshotDate: '2026-07-06' }),
      (error) => error?.code === 'competition_snapshot_batch_incomplete',
    );
    assert.equal(durableMarker, null);

    const repaired = await runCommunityCompetitionDailySnapshot({
      targetDate: '2026-07-06',
      now: new Date('2026-07-06T23:04:00Z'),
    });
    assert.equal(repaired.writtenSnapshots, 1);
    assert.equal(storedTarget.ledger_revision, 2);
    assert.equal(dirty, null);

    const published = await publishCommunityCompetitionSnapshotMarker({
      snapshotDate: '2026-07-06',
    });
    assert.equal(published.published, true);
    assert.equal(durableMarker.snapshot_date, '2026-07-06');
    assert.deepEqual(writeOutcomes, ['inserted', 'replaced_unpublished']);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('daily snapshot source contains no write-time cutoff or direct snapshot insert fallback', () => {
  const source = readFileSync(
    new URL('../server/communityCompetitionDailySnapshot.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /rpc\/upsert_unpublished_community_competition_member_snapshot/);
  assert.match(source, /p_initialize_ranking_baseline_return_pct/);
  assert.doesNotMatch(source, /ledgerStateWasLockedByTargetClose|isProvableCurrentTargetInsert/);
  assert.doesNotMatch(source, /resolution=ignore-duplicates,return=representation/);
  assert.doesNotMatch(source, /async function initializeMemberRanking|method:\s*'PATCH'/);
});
