import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import handler from '../api/community-competition-daily-snapshot.js';
import { computeCompetitionLedgerHash } from '../server/communityCompetitionSnapshotModel.js';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
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
      return this;
    },
    end() {
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
  'CRON_SECRET',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'EODHD_API_KEY',
];

test('competition snapshot cron requires its bearer CRON_SECRET', async () => {
  const env = snapshotEnv(ENV_KEYS);
  delete process.env.CRON_SECRET;
  const res = createResponse();
  try {
    await handler({ method: 'GET', headers: {}, query: { date: '2026-07-08' } }, res);
  } finally {
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /CRON_SECRET/);
});

test('competition snapshot cron rejects an invalid bearer secret', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'expected-secret';
  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer wrong-secret' },
      query: { date: '2026-07-08' },
    }, res);
  } finally {
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /未授权/);
});

test('competition cron reads active members and stock ledger but writes only independent competition tables', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const calls = [];
  const snapshotWrites = [];
  const memberPatches = [];
  const userATrade = { id: 'a-1', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };
  const userBTrade = { id: 'b-1', user_id: 'user-b', symbol: 'MSFT', name: 'Microsoft', side: 'buy', trade_date: '2026-07-01', price: 200, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    if (href.includes('/rest/v1/community_competition_members') && !options.method) {
      assert.equal(options.headers.Authorization, 'Bearer service-role-secret');
      return jsonResponse([
        {
          user_id: 'user-a',
          status: 'active',
          joined_at: '2026-07-08T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-07',
          eligible_ledger_hash: computeCompetitionLedgerHash([userATrade], '2026-07-07'),
          ranking_start_snapshot_date: null,
          ranking_baseline_return_pct: null,
        },
        {
          user_id: 'user-b',
          status: 'active',
          joined_at: '2026-07-08T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-08',
          eligible_ledger_hash: computeCompetitionLedgerHash([userBTrade], '2026-07-08'),
          ranking_start_snapshot_date: null,
          ranking_baseline_return_pct: null,
        },
      ]);
    }
    if (href.includes('/rest/v1/stock_trades')) {
      assert.equal(options.method, undefined);
      return jsonResponse([userATrade, userBTrade]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && href.includes('snapshot_date=lt.')) {
      return jsonResponse([]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-07', adjusted_close: 110 },
        { date: '2026-07-08', adjusted_close: 120 },
      ]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
      const rows = JSON.parse(options.body);
      snapshotWrites.push(...rows);
      return jsonResponse(rows);
    }
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      memberPatches.push(JSON.parse(options.body));
      return jsonResponse(null);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.activeMembers, 2);
  assert.equal(res.body.eligibleMembers, 1);
  assert.equal(res.body.writtenSnapshots, 1);
  assert.equal(res.body.initializedMembers, 1);
  assert.equal(snapshotWrites.length, 1);
  assert.equal(snapshotWrites[0].user_id, 'user-a');
  assert.equal(snapshotWrites[0].snapshot_date, '2026-07-08');
  assert.ok(Math.abs(snapshotWrites[0].daily_return_pct - (100 / 1100)) < 1e-12);
  assert.ok(Math.abs(snapshotWrites[0].cumulative_return_pct - (100 / 1100)) < 1e-12);
  assert.match(snapshotWrites[0].ledger_hash, /^[a-f0-9]{64}$/);
  assert.equal(memberPatches.length, 1);
  assert.equal(memberPatches[0].ranking_start_snapshot_date, '2026-07-08');
  assert.equal(memberPatches[0].ranking_baseline_return_pct, 0);
  assert.equal(calls.some((call) => call.href.includes('/api/eod/MSFT.US')), false);
  assert.equal(calls.some((call) => (
    call.options.method && call.href.includes('/rest/v1/stock_trades')
  )), false);
  assert.equal(calls.some((call) => call.href.includes('/rest/v1/pnl_report_')), false);
  assert.doesNotMatch(JSON.stringify(res.body), /user-a|user-b|service-role-secret|eodhd-secret|cron-secret/);
});

test('one failed EODHD symbol skips only affected members and does not block valid snapshots', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const goodTrade = { id: 'a-1', user_id: 'user-a', symbol: 'NVDA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };
  const badTrade = { id: 'b-1', user_id: 'user-b', symbol: 'BAD', side: 'buy', trade_date: '2026-07-01', price: 10, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };
  const written = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([
        {
          user_id: 'user-a', status: 'active', joined_at: '2026-07-08T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-07',
          eligible_ledger_hash: computeCompetitionLedgerHash([goodTrade], '2026-07-07'),
          ranking_start_snapshot_date: null, ranking_baseline_return_pct: null,
        },
        {
          user_id: 'user-b', status: 'active', joined_at: '2026-07-08T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-07',
          eligible_ledger_hash: computeCompetitionLedgerHash([badTrade], '2026-07-07'),
          ranking_start_snapshot_date: null, ranking_baseline_return_pct: null,
        },
      ]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([goodTrade, badTrade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && href.includes('snapshot_date=lt.')) {
      return jsonResponse([]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-07', adjusted_close: 100 },
        { date: '2026-07-08', adjusted_close: 110 },
      ]);
    }
    if (href.includes('/api/eod/BAD.US')) return jsonResponse({ error: 'unavailable' }, 503);
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      const rows = JSON.parse(options.body);
      written.push(...rows);
      return jsonResponse(rows);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.writtenSnapshots, 1);
  assert.equal(res.body.skippedMembers, 1);
  assert.equal(res.body.failedSymbolsCount, 1);
  assert.equal(res.body.skippedReasons.missing_close, 1);
  assert.deepEqual(written.map((row) => row.user_id), ['user-a']);
});

test('competition cron never overwrites a locked user/date snapshot and initializes from the stored row', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  delete process.env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  let attemptedInsert = null;
  let memberPatch = null;
  const userATrade = { id: 'a-1', user_id: 'user-a', symbol: 'NVDA', name: 'NVIDIA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      memberPatch = JSON.parse(options.body);
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'user-a',
        status: 'active',
        joined_at: '2026-07-08T10:00:00Z',
        eligible_after_snapshot_date: '2026-07-07',
        eligible_ledger_hash: computeCompetitionLedgerHash([userATrade], '2026-07-07'),
        ranking_start_snapshot_date: null,
        ranking_baseline_return_pct: null,
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([userATrade]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && href.includes('snapshot_date=lt.')) {
      return jsonResponse([]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-07', adjusted_close: 110 },
        { date: '2026-07-08', adjusted_close: 120 },
      ]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
      attemptedInsert = JSON.parse(options.body)[0];
      return jsonResponse([]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      return jsonResponse([{
        user_id: 'user-a',
        snapshot_date: '2026-07-08',
        daily_return_pct: 0.01,
        cumulative_return_pct: 0.03,
        locked_at: '2026-07-08T22:45:00Z',
        source_version: 'community_competition_snapshot_v1',
        ledger_hash: attemptedInsert.ledger_hash,
      }]);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.writtenSnapshots, 0);
  assert.equal(res.body.existingSnapshots, 1);
  assert.ok(Math.abs(attemptedInsert.cumulative_return_pct - (100 / 1100)) < 1e-12, 'rerun should compute but not overwrite');
  assert.equal(memberPatch.ranking_start_snapshot_date, '2026-07-08');
  assert.equal(memberPatch.ranking_baseline_return_pct, 0, 'first snapshot baseline must start before the first locked close');
});

test('competition cron skips a member when locked historical ledger hash changes', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const currentTrade = { id: 'a-1', user_id: 'user-a', symbol: 'NVDA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T14:00:00Z' };
  const priorHash = computeCompetitionLedgerHash([{ ...currentTrade, price: 99 }], '2026-07-07');
  let providerOrWriteCalled = false;

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'user-a', status: 'active', joined_at: '2026-07-01T10:00:00Z',
        eligible_after_snapshot_date: '2026-07-01', ranking_start_snapshot_date: '2026-07-07',
        ranking_baseline_return_pct: 0,
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([currentTrade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && href.includes('snapshot_date=lt.')) {
      return jsonResponse([{
        user_id: 'user-a', snapshot_date: '2026-07-07', cumulative_return_pct: 0.1,
        locked_at: '2026-07-07T22:45:00Z', ledger_hash: priorHash,
      }]);
    }
    providerOrWriteCalled = true;
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  const res = createResponse();
  try {
    await handler({ method: 'GET', headers: { authorization: 'Bearer cron-secret' }, query: { date: '2026-07-08' } }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.writtenSnapshots, 0);
  assert.equal(res.body.skippedMembers, 1);
  assert.equal(res.body.skippedReasons.prior_ledger_hash_mismatch, 1);
  assert.equal(providerOrWriteCalled, false);
});

test('competition cron rejects any eligible-date ledger edit before the first snapshot', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  let providerOrWriteCalled = false;
  const currentTrade = {
    id: 'a-1', user_id: 'user-a', symbol: 'NVDA', side: 'buy', trade_date: '2026-07-07',
    price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-07T13:00:00Z',
  };
  const joinedLedgerHash = computeCompetitionLedgerHash([
    { ...currentTrade, price: 99 },
  ], '2026-07-07');

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'user-a', status: 'active', joined_at: '2026-07-08T12:00:00Z',
        eligible_after_snapshot_date: '2026-07-07', eligible_ledger_hash: joinedLedgerHash,
        ranking_start_snapshot_date: null,
        ranking_baseline_return_pct: null,
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([currentTrade]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && href.includes('snapshot_date=lt.')) {
      return jsonResponse([]);
    }
    providerOrWriteCalled = true;
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  const res = createResponse();
  try {
    await handler({ method: 'GET', headers: { authorization: 'Bearer cron-secret' }, query: { date: '2026-07-08' } }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.writtenSnapshots, 0);
  assert.equal(res.body.skippedMembers, 1);
  assert.equal(res.body.skippedReasons.eligible_ledger_hash_mismatch, 1);
  assert.equal(providerOrWriteCalled, false);
});

test('Vercel keeps the existing P&L cron and adds an independent competition cron', () => {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercelConfig.crons, [
    { path: '/api/pnl-report-daily-snapshot', schedule: '30 22 * * 1-5' },
    { path: '/api/community-competition-daily-snapshot', schedule: '45 22 * * 1-5' },
  ]);
});
