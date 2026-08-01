import test from 'node:test';
import assert from 'node:assert/strict';

import { runCommunityCompetitionScheduledCatchUp } from '../server/communityCompetitionDailySnapshot.js';
import { resetCommunityCompetitionEodhdStateForTests } from '../server/communityCompetitionEodhd.js';
import { computeCompetitionLedgerHash } from '../server/communityCompetitionSnapshotModel.js';
import {
  getLatestCommunityCompetitionSnapshotMarker,
  publishCommunityCompetitionSnapshotMarker,
} from '../server/snapshotPublicationMarker.js';

const SOURCE_VERSION = 'community_competition_snapshot_v1';
const ENV_KEYS = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'EODHD_API_KEY',
];

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
    json: async () => body,
  };
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

function configureEnv() {
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
}

function member(userId, {
  eligibleDate = '2026-06-30',
  rankingStartDate = '2026-07-01',
  revision = 0,
  eligibleTrades = [],
} = {}) {
  return {
    user_id: userId,
    status: 'active',
    joined_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-07-01T23:00:00.000Z',
    eligible_after_snapshot_date: eligibleDate,
    eligible_ledger_hash: computeCompetitionLedgerHash(eligibleTrades, eligibleDate),
    eligible_ledger_revision: revision,
    ranking_start_snapshot_date: rankingStartDate,
    ranking_baseline_return_pct: 0,
  };
}

function trade(userId, symbol, overrides = {}) {
  return {
    id: `${userId}-${symbol}-buy`,
    user_id: userId,
    symbol,
    name: symbol,
    side: 'buy',
    trade_date: '2026-07-02',
    price: 100,
    shares: 1,
    fee: 0,
    currency: 'USD',
    note: '',
    created_at: '2026-07-02T15:00:00.000Z',
    updated_at: '2026-07-02T15:00:00.000Z',
    ...overrides,
  };
}

function snapshot(userId, snapshotDate, trades = [], revision = 0) {
  return {
    user_id: userId,
    snapshot_date: snapshotDate,
    daily_return_pct: 0,
    cumulative_return_pct: 0,
    locked_at: `${snapshotDate}T23:00:00.000Z`,
    source_version: SOURCE_VERSION,
    ledger_hash: computeCompetitionLedgerHash(trades, snapshotDate),
    ledger_revision: revision,
  };
}

function marketRows(dates, start = 600) {
  return dates.map((date, index) => ({
    date,
    close: start + index,
    adjusted_close: start + index,
  }));
}

function selectedUserIds(params) {
  const filter = params.get('user_id');
  if (!filter) return null;
  if (filter.startsWith('eq.')) return new Set([filter.slice(3)]);
  if (filter.startsWith('in.(') && filter.endsWith(')')) {
    return new Set(filter.slice(4, -1).split(',').filter(Boolean));
  }
  return null;
}

function filterBySelectedUsers(rows, params) {
  const ids = selectedUserIds(params);
  return ids ? rows.filter((row) => ids.has(String(row.user_id))) : rows;
}

function filterSnapshots(rows, params) {
  const selected = filterBySelectedUsers(rows, params);
  const dateFilter = params.get('snapshot_date');
  if (!dateFilter) return selected;
  if (dateFilter.startsWith('eq.')) {
    const date = dateFilter.slice(3);
    return selected.filter((row) => row.snapshot_date === date);
  }
  if (dateFilter.startsWith('lt.')) {
    const date = dateFilter.slice(3);
    return selected.filter((row) => row.snapshot_date < date);
  }
  if (dateFilter.startsWith('lte.')) {
    const date = dateFilter.slice(4);
    return selected.filter((row) => row.snapshot_date <= date);
  }
  return selected;
}

function createHarness({
  members,
  trades = [],
  revisions = {},
  snapshots = [],
  marker = null,
  eodhd,
}) {
  const state = {
    members: members.map((row) => ({ ...row })),
    trades: trades.map((row) => ({ ...row })),
    revisions: new Map(Object.entries(revisions)),
    snapshots: new Map(snapshots.map((row) => [
      `${row.user_id}:${row.snapshot_date}`,
      { ...row },
    ])),
    marker: marker ? { ...marker } : null,
    writeCounts: new Map(),
    eodhdCalls: new Map(),
    publicationCalls: 0,
  };

  const fetch = async (input, options = {}) => {
    const href = String(input);
    const providerMatch = href.match(/eodhd\.com\/api\/eod\/([^/?]+)\.US(?:\?|$)/);
    if (providerMatch) {
      const symbol = decodeURIComponent(providerMatch[1]);
      const count = (state.eodhdCalls.get(symbol) || 0) + 1;
      state.eodhdCalls.set(symbol, count);
      return eodhd({ symbol, count, href, state });
    }

    const url = new URL(href);
    const { pathname, searchParams } = url;
    if (pathname === '/rest/v1/community_competition_rebuild_state') return response([]);
    if (pathname === '/rest/v1/community_competition_members') {
      return response(filterBySelectedUsers(state.members, searchParams));
    }
    if (pathname === '/rest/v1/stock_trade_ledger_revisions') {
      const rows = state.members.map((row) => {
        const revision = Number(state.revisions.get(row.user_id) ?? row.eligible_ledger_revision ?? 0);
        return {
          user_id: row.user_id,
          revision,
          last_mutated_at: revision > 0 ? '2026-07-02T15:00:00.000Z' : null,
        };
      });
      return response(filterBySelectedUsers(rows, searchParams));
    }
    if (pathname === '/rest/v1/stock_trades') {
      return response(filterBySelectedUsers(state.trades, searchParams));
    }
    if (pathname === '/rest/v1/community_competition_snapshots') {
      return response(filterSnapshots([...state.snapshots.values()], searchParams));
    }
    if (pathname === '/rest/v1/rpc/upsert_unpublished_community_competition_member_snapshot') {
      const body = JSON.parse(options.body);
      const key = `${body.p_user_id}:${body.p_target_snapshot_date}`;
      const existing = state.snapshots.get(key);
      const rankingMember = state.members.find((row) => row.user_id === body.p_user_id);
      const rankingInitialized = Boolean(rankingMember && !rankingMember.ranking_start_snapshot_date);
      const outcome = existing
        ? existing.ledger_revision === body.p_expected_ledger_revision
          && existing.ledger_hash === body.p_ledger_hash
          ? 'already_current'
          : 'replaced_unpublished'
        : 'inserted';
      state.writeCounts.set(key, (state.writeCounts.get(key) || 0) + 1);
      state.snapshots.set(key, {
        user_id: body.p_user_id,
        snapshot_date: body.p_target_snapshot_date,
        daily_return_pct: body.p_daily_return_pct,
        cumulative_return_pct: body.p_cumulative_return_pct,
        locked_at: body.p_locked_at,
        source_version: body.p_source_version,
        ledger_hash: body.p_ledger_hash,
        ledger_revision: body.p_expected_ledger_revision,
      });
      if (rankingInitialized) {
        rankingMember.ranking_start_snapshot_date = body.p_target_snapshot_date;
        rankingMember.ranking_baseline_return_pct = body.p_initialize_ranking_baseline_return_pct;
      }
      return response({
        outcome,
        snapshotDate: body.p_target_snapshot_date,
        ledgerRevision: body.p_expected_ledger_revision,
        rankingInitialized,
      });
    }
    if (pathname === '/rest/v1/snapshot_publication_markers') {
      const dateFilter = searchParams.get('snapshot_date');
      if (!state.marker) return response([]);
      if (dateFilter?.startsWith('eq.') && state.marker.snapshot_date !== dateFilter.slice(3)) {
        return response([]);
      }
      if (dateFilter?.startsWith('lte.') && state.marker.snapshot_date > dateFilter.slice(4)) {
        return response([]);
      }
      return response([state.marker]);
    }
    if (pathname === '/rest/v1/rpc/publish_community_competition_snapshot_marker') {
      state.publicationCalls += 1;
      const body = JSON.parse(options.body);
      const targetDate = body.p_snapshot_date;
      const expected = state.members.filter((row) => (
        row.status === 'active'
        && row.eligible_after_snapshot_date < targetDate
        && row.ranking_start_snapshot_date
        && row.ranking_start_snapshot_date <= targetDate
      ));
      const complete = expected.filter((row) => (
        state.snapshots.has(`${row.user_id}:${targetDate}`)
      ));
      if (complete.length !== expected.length) {
        return response({
          outcome: 'incomplete',
          snapshotDate: targetDate,
          version: null,
          completedAt: null,
          expectedMembers: expected.length,
          completeSnapshots: complete.length,
        });
      }
      state.marker = {
        channel: 'competition',
        snapshot_date: targetDate,
        version: body.p_new_version,
        completed_at: '2026-07-08T00:05:00.000Z',
      };
      return response({
        outcome: 'published',
        snapshotDate: state.marker.snapshot_date,
        version: state.marker.version,
        completedAt: state.marker.completed_at,
        expectedMembers: expected.length,
        completeSnapshots: complete.length,
      });
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  return { state, fetch };
}

async function withHarness(config, callback) {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  resetCommunityCompetitionEodhdStateForTests();
  configureEnv();
  const harness = createHarness(config);
  globalThis.fetch = harness.fetch;
  try {
    return await callback(harness);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
    resetCommunityCompetitionEodhdStateForTests();
  }
}

test('scheduled catch-up follows real SPY closes sequentially and never fabricates weekend or holiday snapshots', async () => {
  const userId = 'calendar-user';
  const dates = ['2026-07-02', '2026-07-06', '2026-07-07', '2026-07-08'];
  await withHarness({
    members: [member(userId, { rankingStartDate: '2026-07-02' })],
    snapshots: [snapshot(userId, '2026-07-02')],
    eodhd: async ({ symbol }) => {
      assert.equal(symbol, 'SPY');
      return response(marketRows(dates));
    },
  }, async ({ state }) => {
    const result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-08',
      now: new Date('2026-07-09T00:00:00.000Z'),
    });
    assert.equal(result.success, true);
    assert.deepEqual(result.processedDates, ['2026-07-06', '2026-07-07', '2026-07-08']);
    assert.equal(result.writtenSnapshots, 3);
    assert.deepEqual(
      [...state.snapshots.values()].map((row) => row.snapshot_date).sort(),
      dates,
    );
    assert.equal(state.snapshots.has(`${userId}:2026-07-03`), false);
    assert.equal(state.snapshots.has(`${userId}:2026-07-04`), false);
    assert.equal(state.snapshots.has(`${userId}:2026-07-05`), false);
  });
});

test('scheduled catch-up applies five-close and 250 member-day batch boundaries, then resumes from persisted anchors idempotently', async () => {
  const userId = 'five-day-user';
  const dates = [
    '2026-07-01',
    '2026-07-02',
    '2026-07-03',
    '2026-07-06',
    '2026-07-07',
    '2026-07-08',
    '2026-07-09',
    '2026-07-10',
  ];
  await withHarness({
    members: [member(userId)],
    snapshots: [snapshot(userId, '2026-07-01')],
    eodhd: async () => response(marketRows(dates)),
  }, async ({ state }) => {
    const first = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-10',
      now: new Date('2026-07-11T00:00:00.000Z'),
    });
    assert.deepEqual(first.processedDates, [
      '2026-07-02',
      '2026-07-03',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
    ]);
    assert.equal(first.batchLimited, true);
    assert.equal(first.nextBatchFromDate, '2026-07-08');
    assert.equal(first.attemptedMemberDays, 5);

    const second = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-10',
      now: new Date('2026-07-11T00:01:00.000Z'),
    });
    assert.deepEqual(second.processedDates, ['2026-07-09', '2026-07-10']);
    assert.equal(second.batchLimited, false);
    dates.slice(1).forEach((date) => {
      assert.equal(state.writeCounts.get(`${userId}:${date}`), 1);
    });
  });

  const manyMembers = Array.from({ length: 126 }, (_, index) => member(`budget-${index + 1}`));
  await withHarness({
    members: manyMembers,
    snapshots: manyMembers.map((row) => snapshot(row.user_id, '2026-07-01')),
    eodhd: async () => response(marketRows(['2026-07-01', '2026-07-02', '2026-07-03'])),
  }, async () => {
    const result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-03',
      now: new Date('2026-07-04T00:00:00.000Z'),
    });
    assert.deepEqual(result.processedDates, ['2026-07-02']);
    assert.equal(result.attemptedMemberDays, 126);
    assert.equal(result.batchLimited, true);
    assert.equal(result.batchPendingMembers, 126);
    assert.equal(result.nextBatchFromDate, '2026-07-02');
  });
});

test('never-traded first joins stay not_started, then begin on a later first-buy close while ranked empty ledgers still carry', async () => {
  const userId = 'later-first-buy-user';
  await withHarness({
    members: [member(userId, {
      eligibleDate: '2026-07-01',
      rankingStartDate: null,
    })],
    eodhd: async ({ symbol }) => {
      if (symbol === 'SPY') {
        return response(marketRows([
          '2026-07-01',
          '2026-07-02',
          '2026-07-03',
          '2026-07-06',
          '2026-07-07',
          '2026-07-08',
        ]));
      }
      assert.equal(symbol, 'NVDA');
      return response(marketRows(['2026-07-08'], 110));
    },
  }, async ({ state }) => {
    const waiting = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-03',
      now: new Date('2026-07-04T00:00:00.000Z'),
    });
    assert.equal(waiting.success, true);
    assert.deepEqual(waiting.processedDates, []);
    assert.equal(waiting.deferredReasons.not_started, 1);
    assert.equal(state.snapshots.size, 0);
    assert.equal(state.members[0].ranking_start_snapshot_date, null);
    assert.equal(state.eodhdCalls.get('SPY'), undefined);

    state.trades.push(trade(userId, 'NVDA', {
      trade_date: '2026-07-08',
      created_at: '2026-07-08T15:00:00.000Z',
      updated_at: '2026-07-08T15:00:00.000Z',
    }));
    state.revisions.set(userId, 1);
    const started = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-08',
      now: new Date('2026-07-09T00:00:00.000Z'),
    });
    assert.equal(started.success, true);
    assert.deepEqual(started.processedDates, ['2026-07-08']);
    assert.equal(started.writtenSnapshots, 1);
    assert.equal(state.snapshots.size, 1);
    assert.equal(state.snapshots.has(`${userId}:2026-07-08`), true);
    assert.equal(state.members[0].ranking_start_snapshot_date, '2026-07-08');
  });

  const rankedUserId = 'ranked-empty-user';
  await withHarness({
    members: [member(rankedUserId, {
      rankingStartDate: '2026-07-07',
      revision: 2,
    })],
    revisions: { [rankedUserId]: 2 },
    snapshots: [snapshot(rankedUserId, '2026-07-07', [], 2)],
    eodhd: async () => response(marketRows(['2026-07-07', '2026-07-08'])),
  }, async ({ state }) => {
    const carried = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-08',
      now: new Date('2026-07-09T00:00:00.000Z'),
    });
    assert.equal(carried.success, true);
    assert.equal(carried.writtenSnapshots, 1);
    assert.equal(state.snapshots.get(`${rankedUserId}:2026-07-08`).cumulative_return_pct, 0);
  });
});

test('one missing member symbol is isolated, publication fails closed, and recovery fills only that member', async () => {
  const nvdaTrade = trade('provider-a', 'NVDA');
  const msftTrade = trade('provider-b', 'MSFT');
  let providerRecovered = false;
  const oldMarker = {
    channel: 'competition',
    snapshot_date: '2026-07-06',
    version: 'oldversion1234567890',
    completed_at: '2026-07-06T23:05:00.000Z',
  };
  await withHarness({
    members: [
      member('provider-a', { rankingStartDate: '2026-07-06', revision: 1 }),
      member('provider-b', { rankingStartDate: '2026-07-06', revision: 1 }),
    ],
    trades: [nvdaTrade, msftTrade],
    revisions: { 'provider-a': 1, 'provider-b': 1 },
    snapshots: [
      snapshot('provider-a', '2026-07-06', [nvdaTrade], 1),
      snapshot('provider-b', '2026-07-06', [msftTrade], 1),
    ],
    marker: oldMarker,
    eodhd: async ({ symbol }) => {
      if (symbol === 'SPY') {
        return response(marketRows(['2026-07-06', '2026-07-07']));
      }
      if (symbol === 'MSFT' || providerRecovered) {
        return response(marketRows(['2026-07-06', '2026-07-07'], 100));
      }
      assert.equal(symbol, 'NVDA');
      return response(marketRows(['2026-07-06'], 100));
    },
  }, async ({ state }) => {
    const first = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-07',
      now: new Date('2026-07-08T00:00:00.000Z'),
    });
    assert.equal(first.retryableIncomplete, true);
    assert.equal(first.writtenSnapshots, 1);
    assert.equal(state.snapshots.has('provider-a:2026-07-07'), false);
    assert.equal(state.snapshots.has('provider-b:2026-07-07'), true);
    await assert.rejects(
      publishCommunityCompetitionSnapshotMarker({
        snapshotDate: '2026-07-07',
        completedAt: '2026-07-08T00:01:00.000Z',
      }),
      (error) => error.code === 'competition_snapshot_batch_incomplete',
    );
    assert.deepEqual(state.marker, oldMarker);

    providerRecovered = true;
    const second = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-07',
      now: new Date('2026-07-08T00:02:00.000Z'),
    });
    assert.equal(second.success, true);
    assert.equal(second.writtenSnapshots, 1);
    assert.equal(state.writeCounts.get('provider-a:2026-07-07'), 1);
    assert.equal(state.writeCounts.get('provider-b:2026-07-07'), 1);

    const published = await publishCommunityCompetitionSnapshotMarker({
      snapshotDate: '2026-07-07',
      completedAt: '2026-07-08T00:03:00.000Z',
    });
    assert.equal(published.snapshotDate, '2026-07-07');
    assert.equal(state.marker.snapshot_date, '2026-07-07');
  });
});

test('normal Cron retries transient SPY network failures within the bounded attempt limit', async () => {
  const userId = 'network-user';
  await withHarness({
    members: [member(userId)],
    snapshots: [snapshot(userId, '2026-07-01')],
    eodhd: async ({ count }) => {
      if (count < 3) throw new TypeError('temporary network failure');
      return response(marketRows(['2026-07-01', '2026-07-02']));
    },
  }, async ({ state }) => {
    const result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-02',
      now: new Date('2026-07-03T00:00:00.000Z'),
    });
    assert.equal(result.success, true);
    assert.equal(state.eodhdCalls.get('SPY'), 3);
    assert.equal(state.snapshots.has(`${userId}:2026-07-02`), true);
  });
});

test('normal Cron does not cache a 200 response missing the target close and catches up after recovery', async () => {
  const userId = 'missing-target-user';
  await withHarness({
    members: [member(userId)],
    snapshots: [snapshot(userId, '2026-07-01')],
    eodhd: async ({ count }) => response(marketRows(
      count <= 3
        ? ['2026-07-01', '2026-07-02']
        : ['2026-07-01', '2026-07-02', '2026-07-03'],
    )),
  }, async ({ state }) => {
    const first = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-03',
      now: new Date('2026-07-04T00:00:00.000Z'),
    });
    assert.equal(first.success, false);
    assert.equal(first.retryableIncomplete, true);
    assert.deepEqual(first.processedDates, ['2026-07-02']);
    assert.equal(state.eodhdCalls.get('SPY'), 3);

    const second = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-03',
      now: new Date('2026-07-04T00:01:00.000Z'),
    });
    assert.equal(second.success, true);
    assert.deepEqual(second.processedDates, ['2026-07-03']);
    assert.equal(state.eodhdCalls.get('SPY'), 4);
    assert.equal(state.writeCounts.get(`${userId}:2026-07-02`), 1);
    assert.equal(state.writeCounts.get(`${userId}:2026-07-03`), 1);
  });
});

test('normal Cron classifies permanent SPY 4xx as non-retryable after one attempt', async () => {
  const userId = 'permanent-user';
  await withHarness({
    members: [member(userId)],
    snapshots: [snapshot(userId, '2026-07-01')],
    eodhd: async () => response({ error: 'bad symbol' }, 404),
  }, async ({ state }) => {
    const result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-02',
      now: new Date('2026-07-03T00:00:00.000Z'),
    });
    assert.equal(result.success, false);
    assert.equal(result.retryableIncomplete, false);
    assert.equal(result.failedReasons.market_calendar_nonretryable_failure, 1);
    assert.equal(state.eodhdCalls.get('SPY'), 1);
    assert.equal(state.snapshots.has(`${userId}:2026-07-02`), false);
  });
});

test('normal Cron opens the EODHD 402 breaker and preserves the last published board', async () => {
  const userId = 'quota-user';
  const oldMarker = {
    channel: 'competition',
    snapshot_date: '2026-07-01',
    version: 'oldversion1234567890',
    completed_at: '2026-07-01T23:05:00.000Z',
  };
  await withHarness({
    members: [member(userId)],
    snapshots: [snapshot(userId, '2026-07-01')],
    marker: oldMarker,
    eodhd: async () => response({ error: 'quota exceeded' }, 402),
  }, async ({ state }) => {
    const first = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-02',
      now: new Date('2026-07-03T00:00:00.000Z'),
    });
    const second = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-02',
      now: new Date('2026-07-03T00:01:00.000Z'),
    });
    assert.equal(first.retryableIncomplete, true);
    assert.equal(second.retryableIncomplete, true);
    assert.equal(state.eodhdCalls.get('SPY'), 1);
    assert.equal(state.publicationCalls, 0);
    const latest = await getLatestCommunityCompetitionSnapshotMarker({
      throughDate: '2026-07-02',
      now: new Date('2026-07-03T00:02:00.000Z'),
    });
    assert.equal(latest.snapshotDate, '2026-07-01');
    assert.deepEqual(state.marker, oldMarker);
  });
});
