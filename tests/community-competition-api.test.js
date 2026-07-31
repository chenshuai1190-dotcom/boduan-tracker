import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/community-competition.js';
import { computeCompetitionLedgerHash } from '../server/communityCompetitionSnapshotModel.js';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    ended: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

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

const ENV_KEYS = [
  'QUOTE_API_AUTH_REQUIRED',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'EODHD_API_KEY',
];

function configureEnv() {
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.VITE_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
}

test('competition API always requires a bearer token even when quote auth bypass is disabled', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.QUOTE_API_AUTH_REQUIRED = 'false';
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('should not fetch');
  };
  const res = createResponse();
  try {
    await handler({ method: 'GET', headers: { host: 'localhost:3000' }, query: {} }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 401);
  assert.equal(fetchCalled, false);
  assert.deepEqual(res.body, { success: false, error: '未授权: 请先登录' });
  assert.equal(res.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
});

test('competition API preserves invalid leaderboard periods as a client error', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'user-a' });
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'quarter' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { success: false, error: '榜单周期不合法' });
  assert.equal(res.headers['retry-after'], undefined);
  assert.equal(calls.length, 1);
});

test('competition API returns profile_required before exposing membership or ranking data', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'user-a', email: 'secret@example.com' });
    if (href.includes('/rest/v1/community_profiles')) {
      assert.equal(options.headers.Authorization, 'Bearer service-role-secret');
      return jsonResponse([{ user_id: 'user-a', nickname: 'Alpha', avatar_key: 'avatar-gold', profile_completed_at: null }]);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'day' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, state: 'profile_required', period: 'day' });
  assert.equal(calls.some((call) => call.href.includes('community_competition_members')), false);
});

test('competition join is idempotent by authenticated user and ignores body user_id', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  let insertedMember = null;
  let joined = false;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'authenticated-user' });
    if (href.includes('/rest/v1/community_profiles')) {
      return jsonResponse([{
        user_id: 'authenticated-user',
        nickname: '真实用户',
        avatar_key: 'avatar-blue',
        profile_completed_at: '2026-07-08T01:00:00Z',
      }]);
    }
    if (href.includes('/rest/v1/rpc/join_community_competition_member')) {
      insertedMember = JSON.parse(options.body);
      joined = true;
      return jsonResponse('joined');
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse(joined ? [{
        user_id: 'authenticated-user',
        status: 'active',
        joined_at: '2026-07-14T10:00:00Z',
        eligible_after_snapshot_date: insertedMember.p_eligible_after_snapshot_date,
        eligible_ledger_hash: insertedMember.p_eligible_ledger_hash,
        eligible_ledger_revision: 0,
        ranking_start_snapshot_date: null,
        ranking_baseline_return_pct: null,
      }] : []);
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) {
      return jsonResponse([]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handler({
      method: 'POST',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      body: { user_id: 'attacker-selected-user' },
      query: {},
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, 'waiting_snapshot');
  assert.equal(insertedMember.p_user_id, 'authenticated-user');
  assert.notEqual(insertedMember.p_user_id, 'attacker-selected-user');
  assert.equal(insertedMember.p_expected_ledger_revision, 0);
  assert.match(insertedMember.p_eligible_ledger_hash, /^[a-f0-9]{64}$/);
  assert.match(res.body.eligibleAfterSnapshotDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('competition join retries once when an update/delete advances the ledger revision', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  let revisionReads = 0;
  let rpcCalls = 0;
  let joined = false;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'race-user' });
    if (href.includes('/rest/v1/community_profiles')) {
      return jsonResponse([{
        user_id: 'race-user', nickname: 'Race', avatar_key: 'avatar-blue',
        profile_completed_at: '2026-07-01T00:00:00Z',
      }]);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse(joined ? [{
        user_id: 'race-user', status: 'active', joined_at: '2026-07-14T10:00:00Z',
        eligible_after_snapshot_date: '2026-07-13', eligible_ledger_hash: 'a'.repeat(64),
        eligible_ledger_revision: 2, ranking_start_snapshot_date: null,
        ranking_baseline_return_pct: null,
      }] : []);
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) {
      revisionReads += 1;
      return jsonResponse([{
        user_id: 'race-user',
        revision: revisionReads === 1 ? 1 : 2,
        last_mutated_at: '2026-07-13T19:00:00Z',
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([]);
    if (href.includes('/rest/v1/rpc/join_community_competition_member')) {
      rpcCalls += 1;
      const body = JSON.parse(options.body);
      if (body.p_expected_ledger_revision === 1) return jsonResponse('stale_ledger');
      assert.equal(body.p_expected_ledger_revision, 2);
      joined = true;
      return jsonResponse('joined');
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handler({
      method: 'POST',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      body: {},
      query: {},
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 200);
  assert.equal(revisionReads, 2);
  assert.equal(rpcCalls, 2);
});

test('an active no-trade member fails closed when its authoritative revision row is missing', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  let rpcCalled = false;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'missing-state-user' });
    if (href.includes('/rest/v1/community_profiles')) {
      return jsonResponse([{
        user_id: 'missing-state-user', nickname: 'No State', avatar_key: 'avatar-blue',
        profile_completed_at: '2026-07-01T00:00:00Z',
      }]);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'missing-state-user', status: 'active', joined_at: '2026-07-01T00:00:00Z',
        eligible_after_snapshot_date: '2026-07-01', eligible_ledger_hash: 'a'.repeat(64),
        eligible_ledger_revision: 0, ranking_start_snapshot_date: null,
        ranking_baseline_return_pct: null,
      }]);
    }
    if (href.includes('/rest/v1/stock_trade_ledger_revisions')) return jsonResponse([]);
    if (href.includes('/rpc/join_community_competition_member')) rpcCalled = true;
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handler({
      method: 'POST',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      body: {}, query: {},
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.state, 'ledger_state_unavailable');
  assert.equal(rpcCalled, false);
});

test('a forward-rebaselined member can read the published public leaderboard while its new epoch awaits a snapshot', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  const emptyLedgerHash = computeCompetitionLedgerHash([], '2026-07-30');
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'reset-viewer' });
    if (href.includes('/api/eod/QQQ.US')) {
      return jsonResponse([
        { date: '2026-07-29', adjusted_close: 700 },
        { date: '2026-07-30', adjusted_close: 707 },
      ]);
    }
    if (href.includes('/rest/v1/community_profiles')) {
      if (href.includes('user_id=eq.reset-viewer')) {
        return jsonResponse([{
          user_id: 'reset-viewer',
          nickname: 'Reset Viewer',
          avatar_key: 'avatar-gold',
          profile_completed_at: '2026-07-01T00:00:00Z',
        }]);
      }
      return jsonResponse([
        {
          user_id: 'reset-viewer',
          nickname: 'Reset Viewer',
          avatar_key: 'avatar-gold',
          profile_completed_at: '2026-07-01T00:00:00Z',
        },
        {
          user_id: 'ranked-member',
          nickname: 'Ranked Member',
          avatar_key: 'avatar-blue',
          profile_completed_at: '2026-07-01T00:00:00Z',
        },
      ]);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      if (href.includes('user_id=eq.reset-viewer')) {
        return jsonResponse([{
          user_id: 'reset-viewer',
          status: 'active',
          joined_at: '2026-07-01T00:00:00Z',
          eligible_after_snapshot_date: '2026-07-30',
          ranking_start_snapshot_date: null,
          ranking_baseline_return_pct: null,
        }]);
      }
      return jsonResponse([
        {
          user_id: 'reset-viewer',
          status: 'active',
          ranking_start_snapshot_date: null,
          ranking_baseline_return_pct: null,
        },
        {
          user_id: 'ranked-member',
          status: 'active',
          ranking_start_snapshot_date: '2026-07-30',
          ranking_baseline_return_pct: 0,
        },
      ]);
    }
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      return jsonResponse([{
        channel: 'competition',
        snapshot_date: '2026-07-30',
        version: 'snapshot_20260730_v1',
        completed_at: '2026-07-30T23:05:00Z',
      }]);
    }
    if (
      href.includes('/rest/v1/community_competition_snapshots')
      && href.includes('user_id=eq.reset-viewer')
      && href.includes('snapshot_date=lt.2026-07-30')
    ) {
      return jsonResponse([{ snapshot_date: '2026-07-29' }]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      return jsonResponse([
        {
          user_id: 'reset-viewer',
          snapshot_date: '2026-07-29',
          daily_return_pct: 0.01,
          cumulative_return_pct: 0.01,
          locked_at: '2026-07-29T22:45:00Z',
          ledger_hash: computeCompetitionLedgerHash([], '2026-07-29'),
        },
        {
          user_id: 'ranked-member',
          snapshot_date: '2026-07-30',
          daily_return_pct: 0.02,
          cumulative_return_pct: 0.02,
          locked_at: '2026-07-30T22:45:00Z',
          ledger_hash: emptyLedgerHash,
        },
      ]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'day' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, 'ready');
  assert.equal(res.body.asOfDate, '2026-07-30');
  assert.equal(res.body.self, null);
  assert.equal(res.body.selfRankingPending, true);
  assert.deepEqual(res.body.viewerProfile, {
    nickname: 'Reset Viewer',
    avatarKey: 'avatar-gold',
  });
  assert.deepEqual(res.body.leaders.map((row) => row.nickname), ['Ranked Member']);
  assert.equal(res.body.stats.joinedParticipants, 2);
  assert.equal(res.body.stats.rankedParticipants, 1);
  assert.doesNotMatch(JSON.stringify(res.body), /reset-viewer|ranked-member/);
});

test('a first-time member without an older locked snapshot still waits for its first ranking snapshot', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  let leaderboardRead = false;
  let benchmarkRead = false;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'first-time-member' });
    if (href.includes('/rest/v1/community_profiles')) {
      return jsonResponse([{
        user_id: 'first-time-member',
        nickname: 'First Time',
        avatar_key: 'avatar-blue',
        profile_completed_at: '2026-07-30T00:00:00Z',
      }]);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      if (!href.includes('user_id=eq.first-time-member')) leaderboardRead = true;
      return jsonResponse([{
        user_id: 'first-time-member',
        status: 'active',
        joined_at: '2026-07-30T00:00:00Z',
        eligible_after_snapshot_date: '2026-07-30',
        ranking_start_snapshot_date: null,
        ranking_baseline_return_pct: null,
      }]);
    }
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      return jsonResponse([{
        channel: 'competition',
        snapshot_date: '2026-07-30',
        version: 'snapshot_20260730_v1',
        completed_at: '2026-07-30T23:05:00Z',
      }]);
    }
    if (
      href.includes('/rest/v1/community_competition_snapshots')
      && href.includes('user_id=eq.first-time-member')
      && href.includes('snapshot_date=lt.2026-07-30')
    ) {
      return jsonResponse([]);
    }
    if (href.includes('/api/eod/QQQ.US')) benchmarkRead = true;
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'day' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, 'waiting_snapshot');
  assert.equal(res.body.publishedSnapshotDate, '2026-07-30');
  assert.equal(res.body.rankingStartSnapshotDate, null);
  assert.equal(leaderboardRead, false);
  assert.equal(benchmarkRead, false);
});

test('an existing production-shaped cohort becomes ready after the bootstrap marker appears', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  let markerPublished = false;
  const profiles = Array.from({ length: 9 }, (_, index) => ({
    user_id: `member-${index}`,
    nickname: `Member ${index}`,
    avatar_key: 'avatar-blue',
    profile_completed_at: '2026-07-01T00:00:00Z',
  }));
  const members = Array.from({ length: 9 }, (_, index) => ({
    user_id: `member-${index}`,
    status: 'active',
    joined_at: index < 8 ? '2026-07-10T10:00:00Z' : '2026-07-14T10:00:00Z',
    eligible_after_snapshot_date: index < 8 ? '2026-07-10' : '2026-07-14',
    ranking_start_snapshot_date: index < 8 ? '2026-07-13' : '2026-07-15',
    ranking_baseline_return_pct: 0,
  }));
  const emptyLedgerHash = computeCompetitionLedgerHash([], '2026-07-13');
  const snapshots = Array.from({ length: 8 }, (_, index) => ({
    user_id: `member-${index}`,
    snapshot_date: '2026-07-13',
    daily_return_pct: (index + 1) / 1000,
    cumulative_return_pct: (index + 1) / 1000,
    locked_at: '2026-07-13T22:45:00Z',
    ledger_hash: emptyLedgerHash,
  }));

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'member-0' });
    if (href.includes('/api/eod/QQQ.US')) {
      return jsonResponse([
        { date: '2026-07-10', adjusted_close: 725.51 },
        { date: '2026-07-13', adjusted_close: 711.74 },
      ]);
    }
    if (href.includes('/rest/v1/community_profiles')) {
      return jsonResponse(href.includes('user_id=eq.member-0') ? [profiles[0]] : profiles);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse(href.includes('user_id=eq.member-0') ? [members[0]] : members);
    }
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      return jsonResponse(markerPublished ? [{
        channel: 'competition',
        snapshot_date: '2026-07-13',
        version: 'verified_bootstrap_20260716',
        completed_at: '2026-07-16T08:53:59.961312Z',
      }] : []);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) return jsonResponse(snapshots);
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${href}`);
  };

  try {
    const before = createResponse();
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'day' },
    }, before);
    assert.equal(before.statusCode, 200);
    assert.equal(before.body.state, 'waiting_snapshot');
    assert.equal(before.body.publishedSnapshotDate, null);

    markerPublished = true;
    const after = createResponse();
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'day' },
    }, after);
    assert.equal(after.statusCode, 200);
    assert.equal(after.body.state, 'ready');
    assert.equal(after.body.asOfDate, '2026-07-13');
    assert.equal(after.body.snapshotVersion, 'verified_bootstrap_20260716');
    assert.equal(after.body.publicationCompletedAt, '2026-07-16T08:53:59.961312Z');
    assert.equal(after.body.snapshotUpdatedAt, after.body.publicationCompletedAt);
    assert.equal(after.body.stats.joinedParticipants, 9);
    assert.equal(after.body.stats.rankedParticipants, 8);
    assert.equal(after.body.stats.participants, 9);
    assert.equal(after.body.leaders.length, 8);
    assert.equal(after.body.self.nickname, 'Member 0');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('ready leaderboard is bounded by the completed publication marker, benchmarked by real QQQ EOD, and privacy-safe', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  const userATrades = [{
    id: 'trade-a', user_id: 'user-a', symbol: 'NVDA', side: 'buy', trade_date: '2026-07-07',
    price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-07T14:00:00Z',
  }];
  const userBTrades = [
    {
      id: 'trade-b1', user_id: 'user-b', symbol: 'MSFT', side: 'buy', trade_date: '2026-07-07',
      price: 200, shares: 5, fee: 0, currency: 'USD', created_at: '2026-07-07T14:00:00Z',
    },
    {
      id: 'trade-b2', user_id: 'user-b', symbol: 'QQQ', side: 'buy', trade_date: '2026-07-08',
      price: 500, shares: 2, fee: 0, currency: 'USD', created_at: '2026-07-08T15:00:00Z',
    },
  ];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'user-a', email: 'private@example.com' });
    if (href.includes('/api/eod/QQQ.US')) {
      assert.match(href, /api_token=eodhd-secret/);
      return jsonResponse([
        { date: '2026-07-07', adjusted_close: 500 },
        { date: '2026-07-08', adjusted_close: 505 },
      ]);
    }
    if (href.includes('/rest/v1/community_profiles')) {
      if (href.includes('user_id=eq.user-a')) {
        return jsonResponse([{ user_id: 'user-a', nickname: 'Alpha', avatar_key: 'avatar-gold', profile_completed_at: '2026-07-01T00:00:00Z' }]);
      }
      return jsonResponse([
        { user_id: 'user-a', nickname: 'Alpha', avatar_key: 'avatar-gold', profile_completed_at: '2026-07-01T00:00:00Z' },
        { user_id: 'user-b', nickname: 'Beta', avatar_key: 'avatar-blue', profile_completed_at: '2026-07-01T00:00:00Z' },
      ]);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      if (href.includes('user_id=eq.user-a')) {
        return jsonResponse([{
          user_id: 'user-a', status: 'active', joined_at: '2026-07-07T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-07', ranking_start_snapshot_date: '2026-07-08',
          ranking_baseline_return_pct: 0.1,
        }]);
      }
      return jsonResponse([
        { user_id: 'user-a', status: 'active', ranking_start_snapshot_date: '2026-07-08', ranking_baseline_return_pct: 0.1 },
        { user_id: 'user-b', status: 'active', ranking_start_snapshot_date: '2026-07-08', ranking_baseline_return_pct: 0.2 },
      ]);
    }
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      assert.match(href, /channel=eq\.competition/);
      return jsonResponse([{
        channel: 'competition',
        snapshot_date: '2026-07-08',
        version: 'snapshot_20260708_v1',
        completed_at: '2026-07-08T23:05:00.000Z',
      }]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      assert.match(href, /snapshot_date=lte\.2026-07-08/);
      assert.doesNotMatch(href, /snapshot_date=lte\.2026-07-09/);
      return jsonResponse([
        { user_id: 'stale-user', snapshot_date: '2026-07-07', daily_return_pct: 0.01, cumulative_return_pct: 0.1, locked_at: '2026-07-09T23:59:59Z', ledger_hash: 'f'.repeat(64) },
        { user_id: 'user-a', snapshot_date: '2026-07-08', daily_return_pct: 0.02, cumulative_return_pct: 0.12, locked_at: '2026-07-08T22:45:00Z', ledger_hash: computeCompetitionLedgerHash(userATrades, '2026-07-08') },
        { user_id: 'user-b', snapshot_date: '2026-07-08', daily_return_pct: 0.04, cumulative_return_pct: 0.24, locked_at: '2026-07-08T19:02:03-04:00', ledger_hash: computeCompetitionLedgerHash(userBTrades, '2026-07-08') },
      ]);
    }
    if (href.includes('/rest/v1/stock_trades')) {
      if (href.includes('user_id=eq.user-a')) return jsonResponse(userATrades);
      if (href.includes('user_id=eq.user-b')) return jsonResponse(userBTrades);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'day' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, 'ready');
  assert.equal(res.body.asOfDate, '2026-07-08');
  assert.equal(res.body.snapshotVersion, 'snapshot_20260708_v1');
  assert.equal(res.body.publicationCompletedAt, '2026-07-08T23:05:00.000Z');
  assert.equal(res.body.snapshotUpdatedAt, '2026-07-08T23:05:00.000Z');
  assert.ok(Math.abs(res.body.benchmarkReturnPct - 0.01) < 1e-12);
  assert.equal(res.body.self.nickname, 'Alpha');
  assert.equal(res.body.self.rank, 2);
  assert.deepEqual(res.body.leaders.map((row) => row.nickname), ['Beta', 'Alpha']);
  assert.deepEqual(res.body.self.holdingSymbols, ['NVDA']);
  assert.deepEqual(res.body.leaders[0].holdingSymbols, ['MSFT', 'QQQ']);
  assert.deepEqual(res.body.trend.self, [{ date: '2026-07-08', value: 0.02 }]);
  const serialized = JSON.stringify(res.body);
  assert.doesNotMatch(serialized, /user-a|user-b|private@example\.com|service-role-secret|eodhd-secret|position|shares|price|amount|trade|_usd/i);
});

test('a mid-period newcomer enters the annual leaderboard without resetting personal starts and ranks by QQQ outperformance', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  const emptyLedgerHash = computeCompetitionLedgerHash([], '2026-07-15');
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'newcomer' });
    if (href.includes('/api/eod/QQQ.US')) {
      return jsonResponse([
        { date: '2026-07-10', adjusted_close: 100 },
        { date: '2026-07-13', adjusted_close: 98 },
        { date: '2026-07-15', adjusted_close: 99 },
      ]);
    }
    if (href.includes('/rest/v1/community_profiles')) {
      if (href.includes('user_id=eq.newcomer')) {
        return jsonResponse([{
          user_id: 'newcomer', nickname: 'Newcomer', avatar_key: 'avatar-blue',
          profile_completed_at: '2026-07-15T00:00:00Z',
        }]);
      }
      return jsonResponse([
        { user_id: 'veteran', nickname: 'Veteran', avatar_key: 'avatar-gold', profile_completed_at: '2026-07-01T00:00:00Z' },
        { user_id: 'newcomer', nickname: 'Newcomer', avatar_key: 'avatar-blue', profile_completed_at: '2026-07-15T00:00:00Z' },
      ]);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      if (href.includes('user_id=eq.newcomer')) {
        return jsonResponse([{
          user_id: 'newcomer', status: 'active', joined_at: '2026-07-15T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-14', ranking_start_snapshot_date: '2026-07-15',
          ranking_baseline_return_pct: 0,
        }]);
      }
      return jsonResponse([
        { user_id: 'veteran', status: 'active', ranking_start_snapshot_date: '2026-07-13', ranking_baseline_return_pct: 0 },
        { user_id: 'newcomer', status: 'active', ranking_start_snapshot_date: '2026-07-15', ranking_baseline_return_pct: 0 },
      ]);
    }
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      return jsonResponse([{
        channel: 'competition', snapshot_date: '2026-07-15',
        version: 'snapshot_20260715_v2', completed_at: '2026-07-15T23:05:00Z',
      }]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      return jsonResponse([
        { user_id: 'veteran', snapshot_date: '2026-07-13', daily_return_pct: 0.005, cumulative_return_pct: 0.005, locked_at: '2026-07-13T22:45:00Z', ledger_hash: emptyLedgerHash },
        { user_id: 'veteran', snapshot_date: '2026-07-15', daily_return_pct: 0.005, cumulative_return_pct: 0.01, locked_at: '2026-07-15T22:45:00Z', ledger_hash: emptyLedgerHash },
        { user_id: 'newcomer', snapshot_date: '2026-07-15', daily_return_pct: 0.015, cumulative_return_pct: 0.015, locked_at: '2026-07-15T22:45:00Z', ledger_hash: emptyLedgerHash },
      ]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'year' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, 'ready');
  assert.equal(res.body.calculationStartDate, '2026-07-15');
  assert.ok(Math.abs(res.body.benchmarkReturnPct - (99 / 98 - 1)) < 1e-12);
  assert.deepEqual(res.body.leaders.map((row) => row.nickname), ['Veteran', 'Newcomer']);
  assert.ok(res.body.leaders[0].returnPct < res.body.leaders[1].returnPct, 'absolute return must not decide the ranking');
  assert.ok(Math.abs(res.body.leaders[0].outperformancePct - 0.02) < 1e-12);
  assert.ok(Math.abs(res.body.leaders[1].outperformancePct - (0.015 - (99 / 98 - 1))) < 1e-12);
  assert.equal(res.body.stats.participants, 2);
  assert.equal(res.body.self.rank, 2);
  assert.equal(res.body.trend.self[0].date, '2026-07-15');
  assert.ok(Math.abs(res.body.trend.self[0].value - 0.015) < 1e-12);
  assert.deepEqual(res.body.trend.benchmark.map((point) => point.date), ['2026-07-15']);
  assert.doesNotMatch(JSON.stringify(res.body), /user_id|newcomer@|service-role|eodhd-secret/i);
});

test('a completed marker never makes an incomplete QQQ benchmark cacheable as ready', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'user-a' });
    if (href.includes('/rest/v1/community_profiles')) {
      return jsonResponse([{
        user_id: 'user-a', nickname: 'Alpha', avatar_key: 'avatar-gold',
        profile_completed_at: '2026-07-01T00:00:00Z',
      }]);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'user-a', status: 'active', joined_at: '2026-07-01T00:00:00Z',
        eligible_after_snapshot_date: '2026-07-01',
        ranking_start_snapshot_date: '2026-07-08', ranking_baseline_return_pct: 0,
      }]);
    }
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      return jsonResponse([{
        channel: 'competition', snapshot_date: '2026-07-08',
        version: 'snapshot_20260708_v1', completed_at: '2026-07-08T23:05:00Z',
      }]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      return jsonResponse([{
        user_id: 'user-a', snapshot_date: '2026-07-08', daily_return_pct: 0.02,
        cumulative_return_pct: 0.02, locked_at: '2026-07-08T22:45:00Z',
        ledger_hash: 'a'.repeat(64),
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([]);
    if (href.includes('/api/eod/QQQ.US')) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'day' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, '收益比赛读取暂不可用');
  assert.equal(res.body.state, undefined);
});

test('snapshot-status requires normal bearer auth and exposes only the completion marker', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'user-a', email: 'private@example.com' });
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      assert.equal(options.headers.Authorization, 'Bearer service-role-secret');
      return jsonResponse([{
        channel: 'competition',
        snapshot_date: '2026-07-15',
        version: 'snapshot_20260715_v1',
        completed_at: '2026-07-15T22:04:05Z',
      }]);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { operation: 'snapshot-status' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    state: 'snapshot_status',
    channel: 'competition',
    snapshotDate: '2026-07-15',
    version: 'snapshot_20260715_v1',
    completedAt: '2026-07-15T22:04:05.000Z',
  });
  assert.doesNotMatch(JSON.stringify(res.body), /user-a|private@example\.com/);
});

test('snapshot-status sanitizes private database errors', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'user-a' });
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      return jsonResponse({ message: 'private schema and service-role detail' }, 503);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { operation: 'snapshot-status' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['retry-after'], '60');
  assert.equal(res.body.error, '收益比赛快照状态暂不可用');
  assert.doesNotMatch(JSON.stringify(res.body), /private schema|service-role/i);
});

test('leaderboard reads also sanitize publication-marker database errors', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return jsonResponse({ id: 'user-a' });
    if (href.includes('/rest/v1/community_profiles')) {
      return jsonResponse([{
        user_id: 'user-a', nickname: 'Alpha', avatar_key: 'avatar-gold',
        profile_completed_at: '2026-07-01T00:00:00Z',
      }]);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'user-a', status: 'active', joined_at: '2026-07-01T00:00:00Z',
        eligible_after_snapshot_date: '2026-07-01',
        ranking_start_snapshot_date: '2026-07-02',
      }]);
    }
    if (href.includes('/rest/v1/snapshot_publication_markers')) {
      return jsonResponse({ message: 'private marker schema detail' }, 503);
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { host: 'localhost:3000', authorization: 'Bearer access-token' },
      query: { period: 'day' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['retry-after'], '60');
  assert.equal(res.body.error, '收益比赛读取暂不可用');
  assert.doesNotMatch(JSON.stringify(res.body), /private marker|schema detail/i);
});
