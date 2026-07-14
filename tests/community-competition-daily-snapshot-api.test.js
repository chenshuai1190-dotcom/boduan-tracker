import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import communityCompetitionHandler from '../api/community-competition.js';
import { runCommunityCompetitionScheduledCatchUp } from '../server/communityCompetitionDailySnapshot.js';
import { computeCompetitionLedgerHash } from '../server/communityCompetitionSnapshotModel.js';

const handler = (req, res) => communityCompetitionHandler({
  ...req,
  query: { ...(req.query || {}), operation: 'daily-snapshot' },
}, res);

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

test('competition cron without an explicit date uses the scheduled catch-up runner', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${href}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'scheduled_catch_up');
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.processedDates, []);
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
  let badAttempts = 0;

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
    if (href.includes('/api/eod/BAD.US')) {
      badAttempts += 1;
      return jsonResponse({ error: 'unavailable' }, 503);
    }
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

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.writtenSnapshots, 1);
  assert.equal(res.body.success, false);
  assert.equal(res.body.retryableIncomplete, true);
  assert.equal(res.body.retryableIncompleteMembers, 1);
  assert.equal(res.body.authoritativeRejectedMembers, 0);
  assert.equal(res.body.skippedMembers, 1);
  assert.equal(res.body.failedSymbolsCount, 1);
  assert.equal(res.body.skippedReasons.missing_close, 1);
  assert.equal(res.body.retryableIncompleteReasons.missing_close, 1);
  assert.equal(badAttempts, 3, 'transient provider errors must use the bounded three-attempt retry');
  assert.deepEqual(written.map((row) => row.user_id), ['user-a']);
});

test('competition EODHD retries network errors and a 200 response missing the target close', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const trade = { id: 'a-1', user_id: 'user-a', symbol: 'NVDA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };
  let providerAttempts = 0;
  const written = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'user-a', status: 'active', joined_at: '2026-07-08T10:00:00Z',
        eligible_after_snapshot_date: '2026-07-07',
        eligible_ledger_hash: computeCompetitionLedgerHash([trade], '2026-07-07'),
        ranking_start_snapshot_date: null, ranking_baseline_return_pct: null,
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([trade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && href.includes('snapshot_date=lt.')) {
      return jsonResponse([]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      providerAttempts += 1;
      if (providerAttempts === 1) throw new TypeError('network reset');
      if (providerAttempts === 2) {
        return jsonResponse([{ date: '2026-07-07', adjusted_close: 100 }]);
      }
      return jsonResponse([
        { date: '2026-07-07', adjusted_close: 100 },
        { date: '2026-07-08', adjusted_close: 110 },
      ]);
    }
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
  assert.equal(res.body.success, true);
  assert.equal(res.body.retryableIncomplete, false);
  assert.equal(providerAttempts, 3);
  assert.equal(written.length, 1);
});

test('scheduled competition catch-up follows real EOD trading dates from each locked anchor', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const trade = { id: 'a-1', user_id: 'user-a', symbol: 'NVDA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };
  const snapshots = [{
    user_id: 'user-a', snapshot_date: '2026-07-10', daily_return_pct: 0,
    cumulative_return_pct: 0, locked_at: '2026-07-10T22:45:00Z',
    source_version: 'community_competition_snapshot_v1',
    ledger_hash: computeCompetitionLedgerHash([trade], '2026-07-10'),
  }];
  const insertedDates = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      assert.equal(options.method, undefined);
      return jsonResponse([{
        user_id: 'user-a', status: 'active', joined_at: '2026-07-08T10:00:00Z',
        eligible_after_snapshot_date: '2026-07-10', eligible_ledger_hash: null,
        ranking_start_snapshot_date: '2026-07-10', ranking_baseline_return_pct: 0,
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([trade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      const row = JSON.parse(options.body)[0];
      insertedDates.push(row.snapshot_date);
      snapshots.push(row);
      return jsonResponse([row]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      const before = new URL(href).searchParams.get('snapshot_date')?.replace(/^lt\./, '') || '9999-12-31';
      return jsonResponse(snapshots
        .filter((row) => row.snapshot_date < before)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date)));
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-10', adjusted_close: 600 },
        { date: '2026-07-13', adjusted_close: 606 },
        { date: '2026-07-14', adjusted_close: 612 },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-10', adjusted_close: 100 },
        { date: '2026-07-13', adjusted_close: 110 },
        { date: '2026-07-14', adjusted_close: 121 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  let result;
  try {
    result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-14',
      now: new Date('2026-07-14T23:00:00Z'),
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(result.success, true);
  assert.equal(result.retryableIncomplete, false);
  assert.deepEqual(result.processedDates, ['2026-07-13', '2026-07-14']);
  assert.deepEqual(insertedDates, ['2026-07-13', '2026-07-14']);
  assert.equal(result.writtenSnapshots, 2);
  const july14 = snapshots.find((row) => row.snapshot_date === '2026-07-14');
  assert.ok(Math.abs(july14.daily_return_pct - 0.1) < 1e-12);
  assert.ok(Math.abs(july14.cumulative_return_pct - 0.21) < 1e-12);
});

test('scheduled catch-up advances an old anchor in bounded batches and resumes next run', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const trade = {
    id: 'old-anchor-1', user_id: 'old-anchor-user', symbol: 'NVDA', side: 'buy',
    trade_date: '2026-01-02', price: 100, shares: 10, fee: 0, currency: 'USD',
    created_at: '2026-01-02T14:00:00Z',
  };
  const tradingDates = [
    '2026-01-02',
    '2026-01-05',
    '2026-01-06',
    '2026-01-07',
    '2026-01-08',
    '2026-01-09',
    '2026-01-12',
    '2026-01-13',
    '2026-01-14',
    '2026-01-15',
    '2026-01-16',
    '2026-01-20',
    '2026-01-21',
    '2026-01-22',
    '2026-01-23',
    '2026-02-20',
  ];
  const snapshots = [{
    user_id: 'old-anchor-user', snapshot_date: '2026-01-02',
    daily_return_pct: 0, cumulative_return_pct: 0,
    locked_at: '2026-01-02T22:45:00Z',
    ledger_hash: computeCompetitionLedgerHash([trade], '2026-01-02'),
  }];
  const insertedDates = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'old-anchor-user', status: 'active', joined_at: '2026-01-01T10:00:00Z',
        eligible_after_snapshot_date: '2026-01-02', eligible_ledger_hash: null,
        ranking_start_snapshot_date: '2026-01-02', ranking_baseline_return_pct: 0,
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([trade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      const row = JSON.parse(options.body)[0];
      snapshots.push(row);
      insertedDates.push(row.snapshot_date);
      return jsonResponse([row]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      const dateFilter = new URL(href).searchParams.get('snapshot_date') || '';
      const boundary = dateFilter.replace(/^(?:lt|lte)\./, '');
      const inclusive = dateFilter.startsWith('lte.');
      return jsonResponse(snapshots.filter((row) => (
        inclusive ? row.snapshot_date <= boundary : row.snapshot_date < boundary
      )));
    }
    if (href.includes('/api/eod/SPY.US') || href.includes('/api/eod/NVDA.US')) {
      const search = new URL(href).searchParams;
      const from = search.get('from');
      const to = search.get('to');
      return jsonResponse(tradingDates
        .filter((date) => date >= from && date <= to)
        .map((date) => ({
          date,
          adjusted_close: 100 + tradingDates.indexOf(date),
        })));
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  let first;
  let second;
  try {
    first = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-02-20',
      now: new Date('2026-02-20T23:00:00Z'),
    });
    second = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-02-20',
      now: new Date('2026-02-20T23:05:00Z'),
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(first.success, true);
  assert.equal(first.retryableIncomplete, false);
  assert.equal(first.batchLimited, true);
  assert.equal(first.batchPendingMembers, 1);
  assert.equal(first.nextBatchFromDate, '2026-01-09');
  assert.deepEqual(first.processedDates, [
    '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
  ]);
  assert.equal(first.skippedReasons.catch_up_window_exceeded, undefined);
  assert.equal(second.success, true);
  assert.equal(second.retryableIncomplete, false);
  assert.equal(second.batchLimited, true);
  assert.equal(second.nextBatchFromDate, '2026-01-16');
  assert.deepEqual(second.processedDates, [
    '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16',
  ]);
  assert.deepEqual(insertedDates, [
    '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
    '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16',
  ]);
  assert.doesNotMatch(JSON.stringify(first), /old-anchor-user/);
  assert.doesNotMatch(JSON.stringify(second), /old-anchor-user/);
});

test('scheduled catch-up never lets one member skip a gap while unaffected members advance', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const badTrade = { id: 'a-1', user_id: 'user-a', symbol: 'NVDA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };
  const goodTrade = { id: 'b-1', user_id: 'user-b', symbol: 'MSFT', side: 'buy', trade_date: '2026-07-01', price: 200, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };
  const snapshots = [
    {
      user_id: 'user-a', snapshot_date: '2026-07-10', cumulative_return_pct: 0,
      locked_at: '2026-07-10T22:45:00Z',
      ledger_hash: computeCompetitionLedgerHash([badTrade], '2026-07-10'),
    },
    {
      user_id: 'user-b', snapshot_date: '2026-07-10', cumulative_return_pct: 0,
      locked_at: '2026-07-10T22:45:00Z',
      ledger_hash: computeCompetitionLedgerHash([goodTrade], '2026-07-10'),
    },
  ];
  const requestedNvdaTargets = [];
  const requestedMsftTargets = [];
  const written = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([
        {
          user_id: 'user-a', status: 'active', joined_at: '2026-07-08T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-10', eligible_ledger_hash: null,
          ranking_start_snapshot_date: '2026-07-10', ranking_baseline_return_pct: 0,
        },
        {
          user_id: 'user-b', status: 'active', joined_at: '2026-07-08T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-10', eligible_ledger_hash: null,
          ranking_start_snapshot_date: '2026-07-10', ranking_baseline_return_pct: 0,
        },
      ]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([badTrade, goodTrade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      const row = JSON.parse(options.body)[0];
      written.push(row);
      snapshots.push(row);
      return jsonResponse([row]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      const before = new URL(href).searchParams.get('snapshot_date')?.replace(/^lt\./, '') || '9999-12-31';
      return jsonResponse(snapshots
        .filter((row) => row.snapshot_date < before)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date)));
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-10', adjusted_close: 600 },
        { date: '2026-07-13', adjusted_close: 606 },
        { date: '2026-07-14', adjusted_close: 612 },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      requestedNvdaTargets.push(new URL(href).searchParams.get('to'));
      return jsonResponse([{ date: '2026-07-10', adjusted_close: 100 }]);
    }
    if (href.includes('/api/eod/MSFT.US')) {
      requestedMsftTargets.push(new URL(href).searchParams.get('to'));
      return jsonResponse([
        { date: '2026-07-10', adjusted_close: 200 },
        { date: '2026-07-13', adjusted_close: 210 },
        { date: '2026-07-14', adjusted_close: 220 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  let result;
  try {
    result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-14',
      now: new Date('2026-07-14T23:00:00Z'),
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(result.success, false);
  assert.equal(result.retryableIncomplete, true);
  assert.deepEqual(result.processedDates, ['2026-07-13', '2026-07-14']);
  assert.deepEqual(requestedNvdaTargets, [
    '2026-07-13',
    '2026-07-13',
    '2026-07-13',
  ]);
  assert.equal(requestedNvdaTargets.includes('2026-07-14'), false);
  assert.deepEqual(requestedMsftTargets, ['2026-07-13', '2026-07-14']);
  assert.deepEqual(written.map((row) => [row.user_id, row.snapshot_date]), [
    ['user-b', '2026-07-13'],
    ['user-b', '2026-07-14'],
  ]);
});

test('scheduled catch-up repairs ranking metadata from the earliest locked snapshot after PATCH failure', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const trade = {
    id: 'repair-1', user_id: 'repair-user', symbol: 'NVDA', side: 'buy',
    trade_date: '2026-07-01', price: 100, shares: 10, fee: 0, currency: 'USD',
    created_at: '2026-07-01T10:00:00Z',
  };
  const member = {
    user_id: 'repair-user', status: 'active', joined_at: '2026-07-07T10:00:00Z',
    eligible_after_snapshot_date: '2026-07-07',
    eligible_ledger_hash: computeCompetitionLedgerHash([trade], '2026-07-07'),
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const snapshots = [];
  const rankingPatches = [];
  let patchAttempts = 0;

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      patchAttempts += 1;
      const patch = JSON.parse(options.body);
      rankingPatches.push(patch);
      if (patchAttempts === 1) return jsonResponse({ message: 'temporary patch failure' }, 500);
      member.ranking_start_snapshot_date = patch.ranking_start_snapshot_date;
      member.ranking_baseline_return_pct = patch.ranking_baseline_return_pct;
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/community_competition_members')) return jsonResponse([member]);
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([trade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      const row = JSON.parse(options.body)[0];
      snapshots.push(row);
      return jsonResponse([row]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      const dateFilter = new URL(href).searchParams.get('snapshot_date') || '';
      const boundary = dateFilter.replace(/^(?:lt|lte)\./, '');
      const inclusive = dateFilter.startsWith('lte.');
      return jsonResponse(snapshots.filter((row) => (
        inclusive ? row.snapshot_date <= boundary : row.snapshot_date < boundary
      )));
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-07', adjusted_close: 100 },
        { date: '2026-07-08', adjusted_close: 110 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  const firstResponse = createResponse();
  let recovered;
  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-08' },
    }, firstResponse);
    recovered = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-08',
      now: new Date('2026-07-08T23:00:00Z'),
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(firstResponse.statusCode, 500);
  assert.equal(firstResponse.body.writtenSnapshots, 1);
  assert.equal(firstResponse.body.failedMembers, 1);
  assert.equal(snapshots.length, 1, 'recovery must never overwrite or duplicate the locked row');
  assert.equal(recovered.success, true);
  assert.equal(recovered.initializedMembers, 1);
  assert.deepEqual(recovered.processedDates, []);
  assert.equal(rankingPatches.length, 2);
  assert.equal(rankingPatches[1].ranking_start_snapshot_date, '2026-07-08');
  assert.equal(rankingPatches[1].ranking_baseline_return_pct, 0);
  assert.doesNotMatch(JSON.stringify(recovered), /repair-user/);
});

test('ranking recovery rejects ledger edits at either the earliest or latest locked snapshot', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const earliestMismatchTrade = {
    id: 'earliest-mismatch-1', user_id: 'earliest-mismatch-user', symbol: 'NVDA',
    side: 'buy', trade_date: '2026-07-01', price: 100, shares: 10, fee: 0,
    currency: 'USD', created_at: '2026-07-01T10:00:00Z',
  };
  const latestMismatchTrade = {
    id: 'latest-mismatch-1', user_id: 'latest-mismatch-user', symbol: 'MSFT',
    side: 'buy', trade_date: '2026-07-01', price: 200, shares: 10, fee: 0,
    currency: 'USD', created_at: '2026-07-01T10:00:00Z',
  };
  const members = [earliestMismatchTrade, latestMismatchTrade].map((trade) => ({
    user_id: trade.user_id,
    status: 'active',
    joined_at: '2026-07-07T10:00:00Z',
    eligible_after_snapshot_date: '2026-07-07',
    eligible_ledger_hash: computeCompetitionLedgerHash([trade], '2026-07-07'),
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  }));
  const snapshots = [
    {
      user_id: 'earliest-mismatch-user', snapshot_date: '2026-07-08',
      cumulative_return_pct: 0, locked_at: '2026-07-08T22:45:00Z',
      ledger_hash: computeCompetitionLedgerHash([
        { ...earliestMismatchTrade, price: 99 },
      ], '2026-07-08'),
    },
    {
      user_id: 'earliest-mismatch-user', snapshot_date: '2026-07-09',
      cumulative_return_pct: 0.01, locked_at: '2026-07-09T22:45:00Z',
      ledger_hash: computeCompetitionLedgerHash([earliestMismatchTrade], '2026-07-09'),
    },
    {
      user_id: 'latest-mismatch-user', snapshot_date: '2026-07-08',
      cumulative_return_pct: 0, locked_at: '2026-07-08T22:45:00Z',
      ledger_hash: computeCompetitionLedgerHash([latestMismatchTrade], '2026-07-08'),
    },
    {
      user_id: 'latest-mismatch-user', snapshot_date: '2026-07-09',
      cumulative_return_pct: 0.01, locked_at: '2026-07-09T22:45:00Z',
      ledger_hash: computeCompetitionLedgerHash([
        { ...latestMismatchTrade, price: 199 },
      ], '2026-07-09'),
    },
  ];
  let rankingPatchCalled = false;
  let providerOrSnapshotWriteCalled = false;

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      rankingPatchCalled = true;
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/community_competition_members')) return jsonResponse(members);
    if (href.includes('/rest/v1/stock_trades')) {
      return jsonResponse([earliestMismatchTrade, latestMismatchTrade]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && !options.method) {
      const search = new URL(href).searchParams;
      const dateFilter = search.get('snapshot_date') || '';
      const boundary = dateFilter.replace(/^(?:lt|lte)\./, '');
      const inclusive = dateFilter.startsWith('lte.');
      return jsonResponse(snapshots.filter((row) => (
        inclusive ? row.snapshot_date <= boundary : row.snapshot_date < boundary
      )));
    }
    providerOrSnapshotWriteCalled = true;
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  let result;
  try {
    result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-10',
      now: new Date('2026-07-10T23:00:00Z'),
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(result.success, true);
  assert.equal(result.retryableIncomplete, false);
  assert.equal(result.authoritativeRejectedMembers, 2);
  assert.equal(result.skippedMembers, 2);
  assert.equal(result.authoritativeRejectionReasons.ranking_recovery_ledger_hash_mismatch, 2);
  assert.equal(result.skippedReasons.ranking_recovery_ledger_hash_mismatch, 2);
  assert.equal(result.initializedMembers, 0);
  assert.deepEqual(result.processedDates, []);
  assert.equal(rankingPatchCalled, false);
  assert.equal(providerOrSnapshotWriteCalled, false);
  assert.doesNotMatch(JSON.stringify(result), /earliest-mismatch-user|latest-mismatch-user/);
});

test('scheduled catch-up skips empty days and starts only on the later first-buy date', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const trade = {
    id: 'later-buy-1', user_id: 'later-buy-user', symbol: 'NVDA', side: 'buy',
    trade_date: '2026-07-14', price: 100, shares: 10, fee: 0, currency: 'USD',
    created_at: '2026-07-14T14:00:00Z',
  };
  const member = {
    user_id: 'later-buy-user', status: 'active', joined_at: '2026-07-10T20:00:00Z',
    eligible_after_snapshot_date: '2026-07-10',
    eligible_ledger_hash: computeCompetitionLedgerHash([], '2026-07-10'),
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const snapshots = [];
  const rankingPatches = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      const patch = JSON.parse(options.body);
      rankingPatches.push(patch);
      member.ranking_start_snapshot_date = patch.ranking_start_snapshot_date;
      member.ranking_baseline_return_pct = patch.ranking_baseline_return_pct;
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/community_competition_members')) return jsonResponse([member]);
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([trade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      const row = JSON.parse(options.body)[0];
      snapshots.push(row);
      return jsonResponse([row]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      const dateFilter = new URL(href).searchParams.get('snapshot_date') || '';
      const boundary = dateFilter.replace(/^(?:lt|lte)\./, '');
      const inclusive = dateFilter.startsWith('lte.');
      return jsonResponse(snapshots.filter((row) => (
        inclusive ? row.snapshot_date <= boundary : row.snapshot_date < boundary
      )));
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-07-10', adjusted_close: 600 },
        { date: '2026-07-13', adjusted_close: 606 },
        { date: '2026-07-14', adjusted_close: 612 },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-13', adjusted_close: 95, high: 98, low: 92 },
        { date: '2026-07-14', adjusted_close: 105, high: 110, low: 90 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  let result;
  try {
    result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-14',
      now: new Date('2026-07-14T23:00:00Z'),
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(result.success, true);
  assert.equal(result.deferredMembers, 0);
  assert.equal(result.deferredReasons.not_started, undefined);
  assert.equal(result.skippedMembers, 0);
  assert.equal(result.retryableIncomplete, false);
  assert.deepEqual(result.processedDates, ['2026-07-14']);
  assert.deepEqual(snapshots.map((row) => row.snapshot_date), ['2026-07-14']);
  assert.equal(rankingPatches.length, 1);
  assert.equal(rankingPatches[0].ranking_start_snapshot_date, '2026-07-14');
  assert.equal(rankingPatches[0].ranking_baseline_return_pct, 0);
  assert.doesNotMatch(JSON.stringify(result), /later-buy-user/);
});

test('an empty member can remain idle beyond one batch and start on a later scheduled run', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const trades = [];
  const laterTrade = {
    id: 'cross-batch-buy-1', user_id: 'cross-batch-user', symbol: 'NVDA', side: 'buy',
    trade_date: '2026-02-20', price: 110, shares: 10, fee: 0, currency: 'USD',
    created_at: '2026-02-20T15:00:00Z',
  };
  const member = {
    user_id: 'cross-batch-user', status: 'active', joined_at: '2026-01-01T10:00:00Z',
    eligible_after_snapshot_date: '2026-01-02',
    eligible_ledger_hash: computeCompetitionLedgerHash([], '2026-01-02'),
    ranking_start_snapshot_date: null,
    ranking_baseline_return_pct: null,
  };
  const snapshots = [];
  const tradingDates = [
    '2026-01-02',
    '2026-01-05',
    '2026-01-06',
    '2026-01-07',
    '2026-01-08',
    '2026-01-09',
    '2026-01-12',
    '2026-02-19',
    '2026-02-20',
  ];
  const rankingPatches = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      const patchBody = JSON.parse(options.body);
      rankingPatches.push(patchBody);
      member.ranking_start_snapshot_date = patchBody.ranking_start_snapshot_date;
      member.ranking_baseline_return_pct = patchBody.ranking_baseline_return_pct;
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/community_competition_members')) return jsonResponse([member]);
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse(trades);
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      const row = JSON.parse(options.body)[0];
      snapshots.push(row);
      return jsonResponse([row]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      const dateFilter = new URL(href).searchParams.get('snapshot_date') || '';
      const boundary = dateFilter.replace(/^(?:lt|lte)\./, '');
      const inclusive = dateFilter.startsWith('lte.');
      return jsonResponse(snapshots.filter((row) => (
        inclusive ? row.snapshot_date <= boundary : row.snapshot_date < boundary
      )));
    }
    if (href.includes('/api/eod/SPY.US')) {
      const search = new URL(href).searchParams;
      const from = search.get('from');
      const to = search.get('to');
      return jsonResponse(tradingDates
        .filter((date) => date >= from && date <= to)
        .map((date) => ({ date, adjusted_close: 600 })));
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-02-20', adjusted_close: 112, high: 115, low: 105 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  let beforeBuy;
  let afterBuy;
  try {
    beforeBuy = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-02-19',
      now: new Date('2026-02-19T23:00:00Z'),
    });
    trades.push(laterTrade);
    afterBuy = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-02-20',
      now: new Date('2026-02-20T23:00:00Z'),
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(beforeBuy.success, true);
  assert.equal(beforeBuy.deferredMembers, 1);
  assert.equal(beforeBuy.deferredReasons.not_started, 1);
  assert.equal(beforeBuy.batchLimited, false);
  assert.deepEqual(beforeBuy.processedDates, []);
  assert.equal(afterBuy.success, true);
  assert.equal(afterBuy.deferredMembers, 0);
  assert.equal(afterBuy.retryableIncomplete, false);
  assert.deepEqual(afterBuy.processedDates, ['2026-02-20']);
  assert.deepEqual(snapshots.map((row) => row.snapshot_date), ['2026-02-20']);
  assert.equal(rankingPatches.length, 1);
  assert.equal(rankingPatches[0].ranking_start_snapshot_date, '2026-02-20');
  assert.doesNotMatch(JSON.stringify(beforeBuy), /cross-batch-user/);
  assert.doesNotMatch(JSON.stringify(afterBuy), /cross-batch-user/);
});

test('an old empty member never pins the calendar window for a newer active member', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const activeTrade = {
    id: 'newer-active-1', user_id: 'newer-active-user', symbol: 'MSFT', side: 'buy',
    trade_date: '2026-02-17', price: 200, shares: 10, fee: 0, currency: 'USD',
    created_at: '2026-02-17T15:00:00Z',
  };
  const members = [
    {
      user_id: 'old-empty-user', status: 'active', joined_at: '2026-01-01T10:00:00Z',
      eligible_after_snapshot_date: '2026-01-02',
      eligible_ledger_hash: computeCompetitionLedgerHash([], '2026-01-02'),
      ranking_start_snapshot_date: null, ranking_baseline_return_pct: null,
    },
    {
      user_id: 'newer-active-user', status: 'active', joined_at: '2026-02-18T10:00:00Z',
      eligible_after_snapshot_date: '2026-02-18',
      eligible_ledger_hash: computeCompetitionLedgerHash([activeTrade], '2026-02-18'),
      ranking_start_snapshot_date: null, ranking_baseline_return_pct: null,
    },
  ];
  const snapshots = [];
  const rankingPatches = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members') && options.method === 'PATCH') {
      const patchBody = JSON.parse(options.body);
      rankingPatches.push(patchBody);
      const activeMember = members.find((member) => member.user_id === 'newer-active-user');
      activeMember.ranking_start_snapshot_date = patchBody.ranking_start_snapshot_date;
      activeMember.ranking_baseline_return_pct = patchBody.ranking_baseline_return_pct;
      return jsonResponse(null);
    }
    if (href.includes('/rest/v1/community_competition_members')) return jsonResponse(members);
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([activeTrade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      const row = JSON.parse(options.body)[0];
      snapshots.push(row);
      return jsonResponse([row]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots')) {
      const dateFilter = new URL(href).searchParams.get('snapshot_date') || '';
      const boundary = dateFilter.replace(/^(?:lt|lte)\./, '');
      const inclusive = dateFilter.startsWith('lte.');
      return jsonResponse(snapshots.filter((row) => (
        inclusive ? row.snapshot_date <= boundary : row.snapshot_date < boundary
      )));
    }
    if (href.includes('/api/eod/SPY.US')) {
      return jsonResponse([
        { date: '2026-02-18', adjusted_close: 600 },
        { date: '2026-02-19', adjusted_close: 603 },
        { date: '2026-02-20', adjusted_close: 606 },
      ]);
    }
    if (href.includes('/api/eod/MSFT.US')) {
      return jsonResponse([
        { date: '2026-02-18', adjusted_close: 200 },
        { date: '2026-02-19', adjusted_close: 210 },
        { date: '2026-02-20', adjusted_close: 220 },
      ]);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  let result;
  try {
    result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-02-20',
      now: new Date('2026-02-20T23:00:00Z'),
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(result.success, true);
  assert.equal(result.catchUpFromDate, '2026-02-18');
  assert.equal(result.deferredMembers, 1);
  assert.equal(result.deferredReasons.not_started, 1);
  assert.deepEqual(result.processedDates, ['2026-02-19', '2026-02-20']);
  assert.deepEqual(snapshots.map((row) => [row.user_id, row.snapshot_date]), [
    ['newer-active-user', '2026-02-19'],
    ['newer-active-user', '2026-02-20'],
  ]);
  assert.equal(rankingPatches.length, 1);
  assert.equal(rankingPatches[0].ranking_start_snapshot_date, '2026-02-19');
  assert.doesNotMatch(JSON.stringify(result), /old-empty-user|newer-active-user/);
});

test('permanent EODHD 4xx is a non-retryable operational failure, not missing-close 503', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const trade = {
    id: 'permanent-1', user_id: 'permanent-user', symbol: 'BAD', side: 'buy',
    trade_date: '2026-07-01', price: 10, shares: 10, fee: 0, currency: 'USD',
    created_at: '2026-07-01T10:00:00Z',
  };
  let providerAttempts = 0;
  let writeCalled = false;

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'permanent-user', status: 'active', joined_at: '2026-07-07T10:00:00Z',
        eligible_after_snapshot_date: '2026-07-07',
        eligible_ledger_hash: computeCompetitionLedgerHash([trade], '2026-07-07'),
        ranking_start_snapshot_date: null, ranking_baseline_return_pct: null,
      }]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([trade]);
    if (href.includes('/rest/v1/community_competition_snapshots') && !options.method) {
      return jsonResponse([]);
    }
    if (href.includes('/api/eod/BAD.US')) {
      providerAttempts += 1;
      return jsonResponse({ error: 'not found' }, 404);
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      writeCalled = true;
      return jsonResponse(JSON.parse(options.body));
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

  assert.equal(res.statusCode, 500);
  assert.equal(res.headers['retry-after'], undefined);
  assert.equal(res.body.retryableIncomplete, false);
  assert.equal(res.body.failedMembers, 1);
  assert.equal(res.body.skippedMembers, 0);
  assert.equal(res.body.failedReasons.provider_nonretryable_failure, 1);
  assert.equal(res.body.skippedReasons.missing_close, undefined);
  assert.equal(providerAttempts, 1);
  assert.equal(writeCalled, false);
  assert.doesNotMatch(JSON.stringify(res.body), /permanent-user/);
});

test('permanent market-calendar 4xx is operational failure instead of retryable catch-up', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  let marketAttempts = 0;

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([{
        user_id: 'calendar-user', status: 'active', joined_at: '2026-07-08T10:00:00Z',
        eligible_after_snapshot_date: '2026-07-10', eligible_ledger_hash: null,
        ranking_start_snapshot_date: '2026-07-10', ranking_baseline_return_pct: 0,
      }]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && !options.method) {
      return jsonResponse([{
        user_id: 'calendar-user', snapshot_date: '2026-07-10', cumulative_return_pct: 0,
        locked_at: '2026-07-10T22:45:00Z', ledger_hash: 'a'.repeat(64),
      }]);
    }
    if (href.includes('/api/eod/SPY.US')) {
      marketAttempts += 1;
      return jsonResponse({ error: 'forbidden' }, 403);
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  let result;
  try {
    result = await runCommunityCompetitionScheduledCatchUp({
      targetDate: '2026-07-14',
      now: new Date('2026-07-14T23:00:00Z'),
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(result.success, false);
  assert.equal(result.retryableIncomplete, false);
  assert.equal(result.failedMembers, 1);
  assert.equal(result.failedReasons.market_calendar_nonretryable_failure, 1);
  assert.equal(result.retryableIncompleteReasons.market_calendar_unavailable, undefined);
  assert.equal(marketAttempts, 1);
  assert.doesNotMatch(JSON.stringify(result), /calendar-user/);
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
  assert.equal(res.body.success, true);
  assert.equal(res.body.retryableIncomplete, false);
  assert.equal(res.body.writtenSnapshots, 0);
  assert.equal(res.body.skippedMembers, 1);
  assert.equal(res.body.authoritativeRejectedMembers, 1);
  assert.equal(res.body.skippedReasons.prior_ledger_hash_mismatch, 1);
  assert.equal(res.body.authoritativeRejectionReasons.prior_ledger_hash_mismatch, 1);
  assert.equal(providerOrWriteCalled, false);
});

test('snapshot gaps and trades between snapshots are reported as retryable incomplete', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  const gapTrade = { id: 'g-1', user_id: 'user-gap', symbol: 'NVDA', side: 'buy', trade_date: '2026-07-01', price: 100, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' };
  const betweenTrades = [
    { id: 'b-1', user_id: 'user-between', symbol: 'MSFT', side: 'buy', trade_date: '2026-07-01', price: 200, shares: 10, fee: 0, currency: 'USD', created_at: '2026-07-01T10:00:00Z' },
    { id: 'b-2', user_id: 'user-between', symbol: 'MSFT', side: 'buy', trade_date: '2026-07-08', price: 210, shares: 1, fee: 0, currency: 'USD', created_at: '2026-07-08T10:00:00Z' },
  ];
  let writeCalled = false;

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members')) {
      return jsonResponse([
        {
          user_id: 'user-gap', status: 'active', joined_at: '2026-07-01T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-01', ranking_start_snapshot_date: '2026-07-07',
          ranking_baseline_return_pct: 0,
        },
        {
          user_id: 'user-between', status: 'active', joined_at: '2026-07-01T10:00:00Z',
          eligible_after_snapshot_date: '2026-07-01', ranking_start_snapshot_date: '2026-07-07',
          ranking_baseline_return_pct: 0,
        },
      ]);
    }
    if (href.includes('/rest/v1/stock_trades')) return jsonResponse([gapTrade, ...betweenTrades]);
    if (href.includes('/rest/v1/community_competition_snapshots') && href.includes('snapshot_date=lt.')) {
      return jsonResponse([
        {
          user_id: 'user-gap', snapshot_date: '2026-07-07', cumulative_return_pct: 0,
          locked_at: '2026-07-07T22:45:00Z',
          ledger_hash: computeCompetitionLedgerHash([gapTrade], '2026-07-07'),
        },
        {
          user_id: 'user-between', snapshot_date: '2026-07-07', cumulative_return_pct: 0,
          locked_at: '2026-07-07T22:45:00Z',
          ledger_hash: computeCompetitionLedgerHash(betweenTrades, '2026-07-07'),
        },
      ]);
    }
    if (href.includes('/api/eod/NVDA.US')) {
      return jsonResponse([
        { date: '2026-07-07', adjusted_close: 100 },
        { date: '2026-07-08', adjusted_close: 105 },
        { date: '2026-07-09', adjusted_close: 110 },
      ]);
    }
    if (href.includes('/api/eod/MSFT.US')) {
      return jsonResponse([
        { date: '2026-07-07', adjusted_close: 200 },
        { date: '2026-07-09', adjusted_close: 220 },
      ]);
    }
    if (href.includes('/rest/v1/community_competition_snapshots') && options.method === 'POST') {
      writeCalled = true;
      return jsonResponse(JSON.parse(options.body));
    }
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-09' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.body.success, false);
  assert.equal(res.body.retryableIncomplete, true);
  assert.equal(res.body.retryableIncompleteMembers, 2);
  assert.equal(res.body.retryableIncompleteReasons.snapshot_gap, 1);
  assert.equal(res.body.retryableIncompleteReasons.trade_between_snapshots, 1);
  assert.equal(res.body.authoritativeRejectedMembers, 0);
  assert.equal(writeCalled, false);
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

test('competition cron rejects a weekend trade before the first real trading-day snapshot', async () => {
  const env = snapshotEnv(ENV_KEYS);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  const originalFetch = globalThis.fetch;
  let providerWriteOrInitializationCalled = false;
  const weekendTrade = {
    id: 'weekend-buy-1', user_id: 'weekend-buy-user', symbol: 'NVDA', side: 'buy',
    trade_date: '2026-07-11', price: 100, shares: 10, fee: 0, currency: 'USD',
    created_at: '2026-07-11T14:00:00Z',
  };

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/community_competition_members') && !options.method) {
      return jsonResponse([{
        user_id: 'weekend-buy-user', status: 'active', joined_at: '2026-07-10T20:00:00Z',
        eligible_after_snapshot_date: '2026-07-10',
        eligible_ledger_hash: computeCompetitionLedgerHash([], '2026-07-10'),
        ranking_start_snapshot_date: null,
        ranking_baseline_return_pct: null,
      }]);
    }
    if (href.includes('/rest/v1/stock_trades') && !options.method) {
      return jsonResponse([weekendTrade]);
    }
    if (
      href.includes('/rest/v1/community_competition_snapshots')
      && href.includes('snapshot_date=lt.')
      && !options.method
    ) {
      return jsonResponse([]);
    }
    providerWriteOrInitializationCalled = true;
    throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
  };

  const res = createResponse();
  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-13' },
    }, res);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.writtenSnapshots, 0);
  assert.equal(res.body.existingSnapshots, 0);
  assert.equal(res.body.initializedMembers, 0);
  assert.equal(res.body.skippedMembers, 1);
  assert.equal(res.body.authoritativeRejectedMembers, 1);
  assert.equal(res.body.skippedReasons.trade_before_first_snapshot, 1);
  assert.equal(res.body.authoritativeRejectionReasons.trade_before_first_snapshot, 1);
  assert.equal(providerWriteOrInitializationCalled, false);
});

test('Vercel keeps P&L and competition snapshot jobs independent with separate retry hours', () => {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vercelConfig.rewrites.some((rewrite) => (
    rewrite.source === '/api/community-competition-daily-snapshot'
    && rewrite.destination === '/api/community-competition?operation=daily-snapshot'
  )));
  assert.ok(vercelConfig.rewrites.some((rewrite) => (
    rewrite.source === '/api/community-competition-daily-snapshot-retry'
    && rewrite.destination === '/api/community-competition?operation=daily-snapshot'
  )));
  assert.deepEqual(vercelConfig.crons, [
    { path: '/api/pnl-report-daily-snapshot', schedule: '0 0 * * 2-6' },
    { path: '/api/community-competition-daily-snapshot', schedule: '0 1 * * 2-6' },
    { path: '/api/pnl-report-daily-snapshot-retry', schedule: '0 2 * * 2-6' },
    { path: '/api/community-competition-daily-snapshot-retry', schedule: '0 3 * * 2-6' },
  ]);
});
