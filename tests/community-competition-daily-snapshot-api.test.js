import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  authorizeCommunityCompetitionDailySnapshot,
  resolveCommunityCompetitionSnapshotDate,
} from '../server/communityCompetitionDailySnapshot.js';
import { handleCommunityCompetitionDailySnapshot } from '../api/community-competition.js';
import { resetCommunityCompetitionEodhdStateForTests } from '../server/communityCompetitionEodhd.js';

test.beforeEach(() => resetCommunityCompetitionEodhdStateForTests());
test.afterEach(() => resetCommunityCompetitionEodhdStateForTests());

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

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
    json: async () => body,
  };
}

const ENV_KEYS = [
  'CRON_SECRET',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'EODHD_API_KEY',
];

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
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  process.env.EODHD_API_KEY = 'eodhd-secret';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
}

test('competition snapshot cron requires the exact bearer CRON_SECRET', () => {
  const env = snapshotEnv();
  delete process.env.CRON_SECRET;
  try {
    assert.deepEqual(authorizeCommunityCompetitionDailySnapshot({ headers: {} }), {
      ok: false,
      status: 500,
      error: '收益比赛自动快照未配置: 缺少 CRON_SECRET',
    });
    process.env.CRON_SECRET = 'cron-secret';
    assert.equal(authorizeCommunityCompetitionDailySnapshot({
      headers: { authorization: 'Bearer wrong' },
    }).status, 401);
    assert.deepEqual(authorizeCommunityCompetitionDailySnapshot({
      headers: { authorization: 'Bearer cron-secret' },
    }), { ok: true });
  } finally {
    restoreEnv(env);
  }
});

test('scheduled request before 17:00 New York defers without provider or database access', async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureEnv();
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('should not fetch');
  };
  const res = createResponse();
  try {
    await handleCommunityCompetitionDailySnapshot({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: {},
    }, res, { now: new Date('2026-07-15T20:30:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'scheduled_deferred');
  assert.equal(res.body.reason, 'before_new_york_snapshot_window');
  assert.equal(fetchCalled, false);
});

test('explicit target validation rejects malformed, future, and pre-window today dates', () => {
  assert.throws(
    () => resolveCommunityCompetitionSnapshotDate({ query: { date: 'not-a-date' } }, new Date('2026-07-15T22:00:00Z')),
    (error) => error.status === 400,
  );
  assert.throws(
    () => resolveCommunityCompetitionSnapshotDate({ query: { date: '2026-07-16' } }, new Date('2026-07-15T22:00:00Z')),
    (error) => error.status === 400 && /不能晚于/.test(error.message),
  );
  assert.throws(
    () => resolveCommunityCompetitionSnapshotDate({ query: { date: '2026-07-15' } }, new Date('2026-07-15T20:30:00Z')),
    (error) => error.status === 400 && /17:00/.test(error.message),
  );
});

test('explicit completed close with no eligible members publishes through the injected atomic marker path', async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureEnv();
  const calls = [];
  let publication = null;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    if (href.includes('eodhd.com/api/eod/SPY.US')) {
      return response([{ date: '2026-07-15', close: 630, adjusted_close: 630 }]);
    }
    if (href.includes('/rest/v1/community_competition_members')) return response([]);
    throw new Error(`unexpected fetch: ${href}`);
  };
  const res = createResponse();
  try {
    await handleCommunityCompetitionDailySnapshot({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-15' },
    }, res, {
      now: new Date('2026-07-16T22:00:00Z'),
      publishSnapshotMarker: async (input) => { publication = input; },
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.eligibleMembers, 0);
  assert.deepEqual(publication, { snapshotDate: '2026-07-15', republish: false });
  assert.equal(calls.some(({ href }) => href.includes('/stock_trades')), false);
});

test('permanent SPY provider failure is non-retryable and never reads competition storage', async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureEnv();
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return response({ error: 'bad request' }, 404);
  };
  const res = createResponse();
  try {
    await handleCommunityCompetitionDailySnapshot({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { date: '2026-07-15' },
    }, res, { now: new Date('2026-07-16T22:00:00Z') });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
  assert.equal(res.statusCode, 500);
  assert.equal(calls.length, 1);
  assert.equal(calls.some((href) => href.includes('supabase.test')), false);
});

test('daily snapshot endpoint is GET-only and sets no-store headers', async () => {
  const res = createResponse();
  await handleCommunityCompetitionDailySnapshot({ method: 'POST', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0, must-revalidate');
});

test('Vercel keeps P&L and competition storage behind one scheduler without direct marker writes', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const cronPaths = vercel.crons.map((entry) => entry.path);
  assert.ok(cronPaths.some((path) => path.includes('close-snapshot-schedule')));
  assert.ok(vercel.rewrites.some((entry) => (
    entry.source === '/api/community-competition-daily-snapshot'
    && entry.destination.includes('operation=daily-snapshot')
  )));
  const dailySource = readFileSync(
    new URL('../server/communityCompetitionDailySnapshot.js', import.meta.url),
    'utf8',
  );
  const markerSource = readFileSync(new URL('../server/snapshotPublicationMarker.js', import.meta.url), 'utf8');
  assert.match(dailySource, /upsert_unpublished_community_competition_member_snapshot/);
  assert.match(markerSource, /publish_community_competition_snapshot_marker/);
  assert.doesNotMatch(markerSource, /resolution=merge-duplicates|resolution=ignore-duplicates/);
});
