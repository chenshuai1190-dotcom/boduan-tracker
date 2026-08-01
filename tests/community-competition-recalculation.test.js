import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/community-competition.js';
import {
  isCompetitionRecalculationRetryable,
  recalculateCommunityCompetitionMember,
} from '../server/communityCompetitionRecalculation.js';
import {
  CompetitionSnapshotValidationError,
  computeCompetitionLedgerHash,
} from '../server/communityCompetitionSnapshotModel.js';
import {
  fetchCommunityCompetitionEodhdHistories,
  fetchCommunityCompetitionEodhdHistory,
  resetCommunityCompetitionEodhdStateForTests,
} from '../server/communityCompetitionEodhd.js';

function jsonResponse(body, status = 200) {
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
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'EODHD_API_KEY',
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

function configureEnv() {
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.VITE_SUPABASE_ANON_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
}

function marker() {
  return {
    channel: 'competition',
    snapshot_date: '2026-07-31',
    version: 'published-version-20260731',
    completed_at: '2026-08-01T00:10:00.000Z',
  };
}

function member(overrides = {}) {
  return {
    user_id: 'user-a',
    status: 'active',
    joined_at: '2026-07-29T10:00:00.000Z',
    eligible_after_snapshot_date: '2026-07-29',
    eligible_ledger_hash: 'a'.repeat(64),
    eligible_ledger_revision: 1,
    ranking_start_snapshot_date: '2026-07-30',
    ranking_baseline_return_pct: 0,
    ...overrides,
  };
}

function trade(overrides = {}) {
  return {
    id: 'trade-a',
    user_id: 'user-a',
    symbol: 'NVDA',
    side: 'buy',
    trade_date: '2026-07-30',
    price: 100,
    shares: 10,
    fee: 0,
    currency: 'USD',
    // Historical correction intentionally ignores this later write timestamp.
    created_at: '2026-08-01T03:00:00.000Z',
    updated_at: '2026-08-01T03:00:00.000Z',
    ...overrides,
  };
}

function routeBaseFetch({
  currentMember = member(),
  dirty = { user_id: 'user-a', dirty_from_date: '2026-07-30', ledger_revision: 2 },
  currentMarker = marker(),
  snapshots = [],
  epochAudits = [],
  rebaselineAudits = [],
  trades = [trade()],
  rpcOutcomes = [{
    outcome: 'recalculated',
    snapshotDate: '2026-07-31',
    version: 'recalculated-version-20260731',
    completedAt: '2026-08-01T04:00:00.000Z',
  }],
  eodStatus = 200,
  ledgerRevision = 2,
  spyRows = [
    { date: '2026-07-29', close: 630, adjusted_close: 630 },
    { date: '2026-07-30', close: 631, adjusted_close: 631 },
    { date: '2026-07-31', close: 632, adjusted_close: 632 },
  ],
  symbolRows = [
    { date: '2026-07-29', close: 90, adjusted_close: 90 },
    { date: '2026-07-30', close: 100, adjusted_close: 100 },
    { date: '2026-07-31', close: 110, adjusted_close: 110 },
  ],
} = {}) {
  const calls = [];
  const rpcBodies = [];
  let rpcIndex = 0;
  const fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'user-a' });
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse(currentMember ? [currentMember] : []);
    }
    if (href.includes('/rest/v1/community_competition_rebuild_state')) {
      return jsonResponse(dirty ? [dirty] : []);
    }
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      return jsonResponse(currentMarker ? [currentMarker] : []);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      return jsonResponse(snapshots);
    }
    if (href.includes('/rest/v1/community_competition_epoch_resets')) {
      return jsonResponse(epochAudits);
    }
    if (href.includes('/rest/v1/community_competition_rebaseline_audit')) {
      return jsonResponse(rebaselineAudits);
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) {
      return jsonResponse([{
        user_id: 'user-a',
        revision: ledgerRevision,
        last_mutated_at: '2026-08-01T03:00:00Z',
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse(trades);
    if (href.includes('/rest/v1/rpc/replace_community_competition_member_snapshots')) {
      rpcBodies.push(JSON.parse(options.body));
      const outcome = rpcOutcomes[Math.min(rpcIndex, rpcOutcomes.length - 1)];
      rpcIndex += 1;
      return jsonResponse(outcome);
    }
    if (href.includes('eodhd.com/api/eod/SPY.US')) {
      if (eodStatus !== 200) return jsonResponse({ error: 'quota' }, eodStatus);
      return jsonResponse(spyRows);
    }
    if (href.includes('eodhd.com/api/eod/NVDA.US')) {
      return jsonResponse(symbolRows);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  return { fetch, calls, rpcBodies };
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() { return this; },
  };
}

async function withFetch(mock, run) {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureEnv();
  resetCommunityCompetitionEodhdStateForTests();
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    resetCommunityCompetitionEodhdStateForTests();
    restoreEnv(env);
  }
}

test('dirty ranked member is rebuilt from EODHD closes and stale CAS retries only once', async () => {
  const routed = routeBaseFetch({
    rpcOutcomes: [
      { outcome: 'stale_publication' },
      {
        outcome: 'recalculated',
        snapshotDate: '2026-07-31',
        version: 'recalculated-version-20260731',
        completedAt: '2026-08-01T04:00:00.000Z',
      },
    ],
  });
  const result = await withFetch(routed.fetch, () => recalculateCommunityCompetitionMember({
    userId: 'user-a',
    now: new Date('2026-08-01T04:00:00.000Z'),
  }));

  assert.deepEqual(result, {
    success: true,
    state: 'recalculated',
    snapshotDate: '2026-07-31',
    version: 'recalculated-version-20260731',
    completedAt: '2026-08-01T04:00:00.000Z',
  });
  assert.equal(routed.rpcBodies.length, 2);
  assert.equal(routed.rpcBodies[0].p_operation_key, 'competition-ledger-rebuild:user-a:2:2026-07-31');
  assert.equal(routed.rpcBodies[0].p_new_eligible_after_snapshot_date, '2026-07-29');
  assert.deepEqual(routed.rpcBodies[0].p_snapshots.map((row) => row.snapshot_date), [
    '2026-07-30',
    '2026-07-31',
  ]);
  assert.ok(Math.abs(routed.rpcBodies[0].p_snapshots[1].cumulative_return_pct - 0.1) < 1e-12);
  const eodCalls = routed.calls.filter(({ href }) => href.includes('eodhd.com/api/eod/'));
  assert.equal(eodCalls.filter(({ href }) => href.includes('/SPY.US')).length, 1);
  assert.equal(eodCalls.filter(({ href }) => href.includes('/NVDA.US')).length, 1);
});

test('a later first-buy member can edit the ledger and rebuild the full ranked range', async () => {
  const originalTrade = trade({
    trade_date: '2026-07-08',
    price: 100,
    created_at: '2026-07-08T15:00:00.000Z',
    updated_at: '2026-07-08T15:00:00.000Z',
  });
  const editedTrade = {
    ...originalTrade,
    price: 90,
    updated_at: '2026-08-01T03:00:00.000Z',
  };
  const oldHash = computeCompetitionLedgerHash([originalTrade], '2026-07-09');
  const routed = routeBaseFetch({
    currentMember: member({
      joined_at: '2026-07-01T10:00:00.000Z',
      eligible_after_snapshot_date: '2026-07-01',
      eligible_ledger_hash: computeCompetitionLedgerHash([], '2026-07-01'),
      eligible_ledger_revision: 0,
      ranking_start_snapshot_date: '2026-07-08',
      ranking_baseline_return_pct: 0,
    }),
    currentMarker: {
      channel: 'competition',
      snapshot_date: '2026-07-09',
      version: 'published-version-20260709',
      completed_at: '2026-07-10T00:10:00.000Z',
    },
    dirty: { user_id: 'user-a', dirty_from_date: '2026-07-08', ledger_revision: 2 },
    ledgerRevision: 2,
    trades: [editedTrade],
    snapshots: [
      {
        user_id: 'user-a',
        snapshot_date: '2026-07-08',
        daily_return_pct: 0.1,
        cumulative_return_pct: 0.1,
        locked_at: '2026-07-09T00:00:00.000Z',
        ledger_hash: oldHash,
        ledger_revision: 1,
      },
      {
        user_id: 'user-a',
        snapshot_date: '2026-07-09',
        daily_return_pct: 0.1,
        cumulative_return_pct: 0.21,
        locked_at: '2026-07-10T00:00:00.000Z',
        ledger_hash: oldHash,
        ledger_revision: 1,
      },
    ],
    spyRows: [
      { date: '2026-07-01', close: 630, adjusted_close: 630 },
      { date: '2026-07-02', close: 631, adjusted_close: 631 },
      { date: '2026-07-03', close: 632, adjusted_close: 632 },
      { date: '2026-07-06', close: 633, adjusted_close: 633 },
      { date: '2026-07-07', close: 634, adjusted_close: 634 },
      { date: '2026-07-08', close: 635, adjusted_close: 635 },
      { date: '2026-07-09', close: 636, adjusted_close: 636 },
    ],
    // No 7/1 or 7/7 NVDA close is needed for the first target-only buy. The
    // second rebuilt day still depends strictly on the 7/8 adjacent close.
    symbolRows: [
      { date: '2026-07-08', close: 110, adjusted_close: 110 },
      { date: '2026-07-09', close: 121, adjusted_close: 121 },
    ],
    rpcOutcomes: [{
      outcome: 'recalculated',
      snapshotDate: '2026-07-09',
      version: 'recalculated-version-20260709',
      completedAt: '2026-07-10T04:00:00.000Z',
    }],
  });
  const result = await withFetch(routed.fetch, () => recalculateCommunityCompetitionMember({
    userId: 'user-a',
    now: new Date('2026-07-10T04:00:00.000Z'),
  }));

  assert.equal(result.state, 'recalculated');
  assert.equal(routed.rpcBodies.length, 1);
  const body = routed.rpcBodies[0];
  assert.equal(body.p_new_eligible_after_snapshot_date, '2026-07-01');
  assert.equal(body.p_new_ranking_start_snapshot_date, '2026-07-08');
  assert.deepEqual(body.p_snapshots.map((row) => row.snapshot_date), [
    '2026-07-08',
    '2026-07-09',
  ]);
  assert.deepEqual(body.p_snapshots.map((row) => row.ledger_revision), [2, 2]);
  assert.ok(Math.abs(body.p_snapshots[0].daily_return_pct - (2 / 9)) < 1e-12);
  assert.ok(Math.abs(body.p_snapshots[1].daily_return_pct - 0.1) < 1e-12);
  assert.ok(Math.abs(body.p_snapshots[1].cumulative_return_pct - (31 / 90)) < 1e-12);
});

test('recalculate-self trusts only the authenticated token user and ignores body identity', async () => {
  const routed = routeBaseFetch();
  const res = createResponse();
  await withFetch(routed.fetch, () => handler({
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      authorization: 'Bearer access-token',
    },
    query: { operation: 'recalculate-self' },
    body: { userId: 'attacker-user' },
  }, res));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, 'recalculated');
  assert.equal(routed.rpcBodies[0].p_user_id, 'user-a');
  assert.equal(JSON.stringify(routed.rpcBodies[0]).includes('attacker-user'), false);
});

test('rank-null member restores the original epoch-reset range before rebuilding', async () => {
  const routed = routeBaseFetch({
    currentMember: member({
      eligible_after_snapshot_date: '2026-07-31',
      ranking_start_snapshot_date: null,
      ranking_baseline_return_pct: null,
    }),
    snapshots: [{
      user_id: 'user-a',
      snapshot_date: '2026-07-30',
      daily_return_pct: 0,
      cumulative_return_pct: 0,
      locked_at: '2026-07-31T00:00:00Z',
      ledger_hash: 'b'.repeat(64),
      ledger_revision: 1,
    }],
    epochAudits: [{
      old_eligible_after_snapshot_date: '2026-07-29',
      old_ranking_start_snapshot_date: '2026-07-30',
      old_ranking_baseline_return_pct: 0.05,
      created_at: '2026-07-31T20:00:00Z',
    }],
  });
  const result = await withFetch(routed.fetch, () => recalculateCommunityCompetitionMember({
    userId: 'user-a',
    now: new Date('2026-08-01T04:00:00.000Z'),
  }));
  assert.equal(result.state, 'recalculated');
  assert.equal(routed.rpcBodies[0].p_new_eligible_after_snapshot_date, '2026-07-29');
  assert.equal(routed.rpcBodies[0].p_new_ranking_start_snapshot_date, '2026-07-30');
  assert.equal(routed.rpcBodies[0].p_new_ranking_baseline_return_pct, 0.05);
  assert.equal(
    routed.calls.some(({ href }) => href.includes('/community_competition_rebaseline_audit')),
    false,
  );
});

test('genuine first-join dirty state is CAS-cleared without snapshots or marker rotation', async () => {
  const routed = routeBaseFetch({
    currentMember: member({
      ranking_start_snapshot_date: null,
      ranking_baseline_return_pct: null,
    }),
    snapshots: [],
    rpcOutcomes: [{ outcome: 'waiting_snapshot' }],
  });
  const result = await withFetch(routed.fetch, () => recalculateCommunityCompetitionMember({
    userId: 'user-a',
    now: new Date('2026-08-01T04:00:00.000Z'),
  }));
  assert.deepEqual(result, {
    success: true,
    state: 'waiting_snapshot',
    snapshotDate: null,
    version: null,
    completedAt: null,
  });
  assert.equal(routed.rpcBodies.length, 1);
  assert.deepEqual(routed.rpcBodies[0].p_snapshots, []);
  assert.equal(routed.rpcBodies[0].p_new_marker_version, null);
  assert.equal(routed.rpcBodies[0].p_new_ranking_start_snapshot_date, null);
  assert.equal(routed.calls.some(({ href }) => href.includes('eodhd.com')), false);
});

test('clean and non-member no-ops never call EODHD or replacement RPC', async () => {
  for (const scenario of [
    {
      options: { dirty: null },
      expected: {
        success: true,
        state: 'already_current',
        snapshotDate: '2026-07-31',
        version: 'published-version-20260731',
        completedAt: '2026-08-01T00:10:00.000Z',
      },
    },
    {
      options: { currentMember: null },
      expected: {
        success: true,
        state: 'not_joined',
        snapshotDate: null,
        version: null,
        completedAt: null,
      },
    },
  ]) {
    const routed = routeBaseFetch(scenario.options);
    const result = await withFetch(routed.fetch, () => recalculateCommunityCompetitionMember({
      userId: 'user-a',
      now: new Date('2026-08-01T04:00:00.000Z'),
    }));
    assert.deepEqual(result, scenario.expected);
    assert.equal(routed.rpcBodies.length, 0);
    assert.equal(routed.calls.some(({ href }) => href.includes('eodhd.com')), false);
  }
});

test('EODHD 402 opens the in-instance breaker and preserves the old leaderboard', async () => {
  const routed = routeBaseFetch({ eodStatus: 402 });
  await withFetch(routed.fetch, async () => {
    await assert.rejects(
      recalculateCommunityCompetitionMember({
        userId: 'user-a',
        now: new Date('2026-08-01T04:00:00.000Z'),
      }),
      (error) => error?.code === 'EODHD_DAILY_QUOTA_EXHAUSTED' && error?.retryable === true,
    );
    await assert.rejects(
      recalculateCommunityCompetitionMember({
        userId: 'user-a',
        now: new Date('2026-08-01T04:01:00.000Z'),
      }),
      (error) => error?.code === 'EODHD_DAILY_QUOTA_EXHAUSTED',
    );
  });
  assert.equal(
    routed.calls.filter(({ href }) => href.includes('eodhd.com/api/eod/SPY.US')).length,
    1,
  );
  assert.equal(routed.rpcBodies.length, 0);
});

test('public EODHD history coalesces concurrent QQQ reads and slices the cached range', async () => {
  let providerCalls = 0;
  await withFetch(async (url) => {
    assert.match(String(url), /eodhd\.com\/api\/eod\/QQQ\.US/);
    providerCalls += 1;
    await Promise.resolve();
    return jsonResponse([
      { date: '2026-07-01', close: 550, adjusted_close: 550 },
      { date: '2026-07-15', close: 560, adjusted_close: 560 },
      { date: '2026-07-31', close: 570, adjusted_close: 570 },
    ]);
  }, async () => {
    const [wide, same] = await Promise.all([
      fetchCommunityCompetitionEodhdHistory({
        symbol: 'QQQ',
        fromDate: '2026-07-01',
        throughDate: '2026-07-31',
      }),
      fetchCommunityCompetitionEodhdHistory({
        symbol: 'QQQ',
        fromDate: '2026-07-01',
        throughDate: '2026-07-31',
      }),
    ]);
    const narrow = await fetchCommunityCompetitionEodhdHistory({
      symbol: 'QQQ',
      fromDate: '2026-07-15',
      throughDate: '2026-07-31',
    });
    assert.deepEqual(same, wide);
    assert.deepEqual(narrow.map((row) => row.date), ['2026-07-15', '2026-07-31']);
  });
  assert.equal(providerCalls, 1);
});

test('same symbol and completed date share one provider read across different required closes', async () => {
  let providerCalls = 0;
  await withFetch(async () => {
    providerCalls += 1;
    await Promise.resolve();
    return jsonResponse([
      { date: '2026-07-01', close: 100, adjusted_close: 100 },
      { date: '2026-07-15', close: 105, adjusted_close: 105 },
      { date: '2026-07-31', close: 110, adjusted_close: 110 },
    ]);
  }, async () => {
    const [closedPositionHistory, activePositionHistory] = await Promise.all([
      fetchCommunityCompetitionEodhdHistory({
        symbol: 'NVDA',
        fromDate: '2026-07-01',
        throughDate: '2026-07-31',
        requiredThroughDate: '2026-07-15',
      }),
      fetchCommunityCompetitionEodhdHistory({
        symbol: 'NVDA',
        fromDate: '2026-07-01',
        throughDate: '2026-07-31',
        requiredThroughDate: '2026-07-31',
      }),
    ]);
    assert.equal(closedPositionHistory.at(-1).date, '2026-07-31');
    assert.equal(activePositionHistory.at(-1).date, '2026-07-31');
  });
  assert.equal(providerCalls, 1);
});

test('short-first burst serializes one widening read and the long result covers every caller', async () => {
  const requestedFromDates = [];
  let activeProviderReads = 0;
  let maximumActiveProviderReads = 0;
  let releaseInitialRead;
  const initialReadGate = new Promise((resolve) => { releaseInitialRead = resolve; });
  const allRows = [
    { date: '2026-07-01', close: 100, adjusted_close: 100 },
    { date: '2026-07-10', close: 101, adjusted_close: 101 },
    { date: '2026-07-15', close: 102, adjusted_close: 102 },
    { date: '2026-07-31', close: 103, adjusted_close: 103 },
  ];
  await withFetch(async (url) => {
    const fromDate = new URL(String(url)).searchParams.get('from');
    requestedFromDates.push(fromDate);
    activeProviderReads += 1;
    maximumActiveProviderReads = Math.max(maximumActiveProviderReads, activeProviderReads);
    if (requestedFromDates.length === 1) await initialReadGate;
    activeProviderReads -= 1;
    return jsonResponse(allRows.filter((row) => row.date >= fromDate));
  }, async () => {
    const short = fetchCommunityCompetitionEodhdHistory({
      symbol: 'NVDA',
      fromDate: '2026-07-15',
      throughDate: '2026-07-31',
    });
    const medium = fetchCommunityCompetitionEodhdHistory({
      symbol: 'NVDA',
      fromDate: '2026-07-10',
      throughDate: '2026-07-31',
    });
    const long = fetchCommunityCompetitionEodhdHistory({
      symbol: 'NVDA',
      fromDate: '2026-07-01',
      throughDate: '2026-07-31',
    });
    releaseInitialRead();
    const [shortRows, mediumRows, longRows] = await Promise.all([short, medium, long]);
    assert.equal(shortRows[0].date, '2026-07-15');
    assert.equal(mediumRows[0].date, '2026-07-10');
    assert.equal(longRows[0].date, '2026-07-01');

    const cachedShortRows = await fetchCommunityCompetitionEodhdHistory({
      symbol: 'NVDA',
      fromDate: '2026-07-15',
      throughDate: '2026-07-31',
    });
    assert.equal(cachedShortRows[0].date, '2026-07-15');
  });
  assert.deepEqual(requestedFromDates, ['2026-07-15', '2026-07-01']);
  assert.equal(maximumActiveProviderReads, 1);
});

test('70-symbol multi-batch history stays cached when users require different closes', async () => {
  const symbols = Array.from({ length: 70 }, (_, index) => `S${String(index).padStart(2, '0')}`);
  const olderRequirements = Object.fromEntries(symbols.map((symbol) => [symbol, '2026-07-15']));
  const latestRequirements = Object.fromEntries(symbols.map((symbol) => [symbol, '2026-07-31']));
  let providerCalls = 0;
  await withFetch(async () => {
    providerCalls += 1;
    return jsonResponse([
      { date: '2026-07-15', close: 100, adjusted_close: 100 },
      { date: '2026-07-31', close: 101, adjusted_close: 101 },
    ]);
  }, async () => {
    await Promise.all([
      fetchCommunityCompetitionEodhdHistories({
        symbols,
        fromDate: '2026-07-01',
        throughDate: '2026-07-31',
        requiredThroughDates: olderRequirements,
      }),
      fetchCommunityCompetitionEodhdHistories({
        symbols,
        fromDate: '2026-07-01',
        throughDate: '2026-07-31',
        requiredThroughDates: latestRequirements,
      }),
    ]);
    await fetchCommunityCompetitionEodhdHistories({
      symbols,
      fromDate: '2026-07-15',
      throughDate: '2026-07-31',
      requiredThroughDates: latestRequirements,
    });
  });
  assert.equal(providerCalls, 70);
});

test('shared flight validates each caller required close independently', async () => {
  let providerCalls = 0;
  await withFetch(async () => {
    providerCalls += 1;
    return jsonResponse([
      { date: '2026-07-15', close: 100, adjusted_close: 100 },
    ]);
  }, async () => {
    const [olderClose, missingLatestClose] = await Promise.allSettled([
      fetchCommunityCompetitionEodhdHistory({
        symbol: 'NVDA',
        fromDate: '2026-07-01',
        throughDate: '2026-07-31',
        requiredThroughDate: '2026-07-15',
      }),
      fetchCommunityCompetitionEodhdHistory({
        symbol: 'NVDA',
        fromDate: '2026-07-01',
        throughDate: '2026-07-31',
        requiredThroughDate: '2026-07-31',
      }),
    ]);
    assert.equal(olderClose.status, 'fulfilled');
    assert.equal(missingLatestClose.status, 'rejected');
    assert.equal(missingLatestClose.reason?.code, 'missing_target_close');
    assert.equal(missingLatestClose.reason?.rows?.at(-1)?.date, '2026-07-15');
  });
  assert.equal(providerCalls, 3);
});

test('a 200 range missing the required close is never cached and a later retry can recover', async () => {
  let providerCalls = 0;
  await withFetch(async () => {
    providerCalls += 1;
    return providerCalls <= 3
      ? jsonResponse([{ date: '2026-07-30', close: 100, adjusted_close: 100 }])
      : jsonResponse([
          { date: '2026-07-30', close: 100, adjusted_close: 100 },
          { date: '2026-07-31', close: 101, adjusted_close: 101 },
        ]);
  }, async () => {
    await assert.rejects(fetchCommunityCompetitionEodhdHistory({
      symbol: 'NVDA',
      fromDate: '2026-07-30',
      throughDate: '2026-07-31',
      requiredThroughDate: '2026-07-31',
    }), (error) => error?.code === 'missing_target_close');
    const recovered = await fetchCommunityCompetitionEodhdHistory({
      symbol: 'NVDA',
      fromDate: '2026-07-30',
      throughDate: '2026-07-31',
      requiredThroughDate: '2026-07-31',
    });
    assert.equal(recovered.at(-1).date, '2026-07-31');
  });
  assert.equal(providerCalls, 4);
});

test('fresh-close validation is retryable while invalid ledger structure is not', () => {
  const missingClose = new CompetitionSnapshotValidationError('missing_close', 'missing close');
  missingClose.retryable = true;
  const oversell = new CompetitionSnapshotValidationError('oversell', 'oversell');
  assert.equal(isCompetitionRecalculationRetryable(missingClose), true);
  assert.equal(isCompetitionRecalculationRetryable(oversell), false);
});
