import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/community-competition.js';

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
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'POST') {
      insertedMember = JSON.parse(options.body);
      return jsonResponse([insertedMember]);
    }
    if (href.includes('/rest/v1/community_competition_members')) return jsonResponse([]);
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
  assert.equal(insertedMember.user_id, 'authenticated-user');
  assert.notEqual(insertedMember.user_id, 'attacker-selected-user');
  assert.equal(insertedMember.status, 'active');
  assert.match(insertedMember.eligible_ledger_hash, /^[a-f0-9]{64}$/);
  assert.equal(insertedMember.ranking_start_snapshot_date, null);
  assert.match(res.body.eligibleAfterSnapshotDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('ready leaderboard is same-date, close-snapshot based, benchmarked by real QQQ EOD, and privacy-safe', async () => {
  const env = snapshotEnv(ENV_KEYS);
  configureEnv();
  const originalFetch = globalThis.fetch;
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
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      if (href.includes('select=snapshot_date')) {
        assert.match(href, /snapshot_date=lte\.\d{4}-\d{2}-\d{2}/);
        return jsonResponse([{ snapshot_date: '2026-07-08' }]);
      }
      return jsonResponse([
        { user_id: 'user-a', snapshot_date: '2026-07-08', daily_return_pct: 0.02, cumulative_return_pct: 0.12, locked_at: '2026-07-08T22:45:00Z' },
        { user_id: 'user-b', snapshot_date: '2026-07-08', daily_return_pct: 0.04, cumulative_return_pct: 0.24, locked_at: '2026-07-08T22:45:00Z' },
      ]);
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
  assert.ok(Math.abs(res.body.benchmarkReturnPct - 0.01) < 1e-12);
  assert.equal(res.body.self.nickname, 'Alpha');
  assert.equal(res.body.self.rank, 2);
  assert.deepEqual(res.body.leaders.map((row) => row.nickname), ['Beta', 'Alpha']);
  assert.deepEqual(res.body.trend.self, [{ date: '2026-07-08', value: 0.02 }]);
  const serialized = JSON.stringify(res.body);
  assert.doesNotMatch(serialized, /user-a|user-b|private@example\.com|service-role-secret|eodhd-secret|holding|position|trade|_usd/i);
});
