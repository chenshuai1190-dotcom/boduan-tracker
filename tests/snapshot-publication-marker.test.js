import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getLatestCommunityCompetitionSnapshotMarker,
  publishCommunityCompetitionSnapshotMarker,
} from '../server/snapshotPublicationMarker.js';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
  };
}

const ENV_KEYS = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
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
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
}

async function withFetch(mock, run) {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureEnv();
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
}

test('publisher creates a marker only through the atomic service RPC', async () => {
  const calls = [];
  const result = await withFetch(async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    assert.equal(options.headers.Authorization, 'Bearer service-role-secret');
    if (href.includes('/rest/v1/snapshot_publication_markers')) return response([]);
    if (href.includes('/rest/v1/rpc/publish_community_competition_snapshot_marker')) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_snapshot_date, '2026-07-15');
      assert.equal(body.p_expected_version, null);
      assert.equal(body.p_republish, false);
      assert.match(body.p_new_version, /^[a-f0-9]{32}$/);
      return response({
        outcome: 'published',
        snapshotDate: '2026-07-15',
        version: body.p_new_version,
        completedAt: '2026-07-15T22:03:04.123456Z',
        expectedMembers: 2,
        completeSnapshots: 2,
      });
    }
    throw new Error(`unexpected fetch: ${href}`);
  }, () => publishCommunityCompetitionSnapshotMarker({ snapshotDate: '2026-07-15' }));

  assert.equal(result.published, true);
  assert.equal(result.snapshotDate, '2026-07-15');
  assert.equal(result.completedAt, '2026-07-15T22:03:04.123456Z');
  assert.equal(calls.some(({ href }) => href.includes('/community_competition_members')), false);
  assert.equal(calls.filter(({ options }) => options.method === 'POST').length, 1);
});

test('material repair CASes the existing version and rotates it atomically', async () => {
  const existing = {
    channel: 'competition',
    snapshot_date: '2026-07-15',
    version: 'existing_snapshot_version',
    completed_at: '2026-07-15T22:00:00Z',
  };
  const result = await withFetch(async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/snapshot_publication_markers')) return response([existing]);
    if (href.includes('/rest/v1/rpc/publish_community_competition_snapshot_marker')) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_expected_version, existing.version);
      assert.equal(body.p_republish, true);
      assert.notEqual(body.p_new_version, existing.version);
      return response({
        outcome: 'republished',
        snapshotDate: '2026-07-15',
        version: body.p_new_version,
        completedAt: '2026-07-15T23:00:00Z',
        expectedMembers: 2,
        completeSnapshots: 2,
      });
    }
    throw new Error(`unexpected fetch: ${href}`);
  }, () => publishCommunityCompetitionSnapshotMarker({
    snapshotDate: '2026-07-15',
    republish: true,
  }));
  assert.equal(result.published, true);
  assert.notEqual(result.version, existing.version);
});

test('atomic publisher reports incomplete or concurrently changed cohorts as retryable', async () => {
  for (const rpcResult of [
    {
      outcome: 'incomplete',
      snapshotDate: '2026-07-15',
      version: null,
      completedAt: null,
      expectedMembers: 8,
      completeSnapshots: 7,
    },
    {
      outcome: 'stale_publication',
      snapshotDate: '2026-07-15',
      version: 'concurrent-version',
      completedAt: '2026-07-15T22:00:00Z',
      expectedMembers: 8,
      completeSnapshots: 8,
    },
  ]) {
    await assert.rejects(
      withFetch(async (url, options = {}) => {
        const href = String(url);
        if (href.includes('/rest/v1/snapshot_publication_markers')) return response([]);
        if (href.includes('/rest/v1/rpc/publish_community_competition_snapshot_marker')) {
          return response(rpcResult);
        }
        throw new Error(`unexpected fetch: ${href} ${options.method || 'GET'}`);
      }, () => publishCommunityCompetitionSnapshotMarker({ snapshotDate: '2026-07-15' })),
      (error) => {
        if (rpcResult.outcome === 'incomplete') {
          return error.code === 'competition_snapshot_batch_incomplete'
            && error.expectedMembers === 8
            && error.completeSnapshots === 7
            && error.retryable === true;
        }
        return error.code === 'stale_publication' && error.retryable === true;
      },
    );
  }
});

test('latest marker reads preserve database microseconds and use a bounded date', async () => {
  const latest = await withFetch(async (url) => {
    const href = String(url);
    assert.match(href, /snapshot_date=lte\.2026-07-15/);
    return response([{
      channel: 'competition',
      snapshot_date: '2026-07-15',
      version: 'snapshot_microseconds_v1',
      completed_at: '2026-07-15T22:00:00.123456+00:00',
    }]);
  }, () => getLatestCommunityCompetitionSnapshotMarker({ throughDate: '2026-07-15' }));
  assert.equal(latest.completedAt, '2026-07-15T22:00:00.123456Z');
});

test('aggregate SQL exposes only atomic publication and revokes direct marker writes', () => {
  const aggregate = readFileSync(new URL('../supabase/community_competition.sql', import.meta.url), 'utf8');
  assert.match(aggregate, /create or replace function public\.publish_community_competition_snapshot_marker\s*\(/i);
  assert.match(aggregate, /upsert_unpublished_community_competition_member_snapshot/i);
  assert.match(aggregate, /lock table public\.snapshot_publication_markers in share row exclusive mode/i);
  assert.match(aggregate, /grant select\s+on table public\.snapshot_publication_markers\s+to service_role/i);
  assert.doesNotMatch(
    aggregate.slice(aggregate.lastIndexOf('revoke insert, update')),
    /grant select, insert, update\s+on table public\.snapshot_publication_markers\s+to service_role/i,
  );
});
