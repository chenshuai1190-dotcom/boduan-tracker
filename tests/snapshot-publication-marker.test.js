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

const ENV_KEYS = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'];

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

test('publisher creates a service-only marker and keeps same-date no-op versions stable', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  const calls = [];
  let durable = null;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    assert.equal(options.headers.Authorization, 'Bearer service-role-secret');
    if (!options.method) return response(durable ? [durable] : []);
    assert.equal(options.method, 'POST');
    assert.match(options.headers.Prefer, /resolution=ignore-duplicates/);
    durable = JSON.parse(options.body);
    return response([durable], 201);
  };
  try {
    const first = await publishCommunityCompetitionSnapshotMarker({
      snapshotDate: '2026-07-15',
      completedAt: '2026-07-15T22:03:04Z',
    });
    const second = await publishCommunityCompetitionSnapshotMarker({
      snapshotDate: '2026-07-15',
      completedAt: '2026-07-15T23:03:04Z',
    });
    assert.equal(first.published, true);
    assert.equal(second.published, false);
    assert.equal(second.version, first.version);
    assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1);
    assert.deepEqual(Object.keys(durable).sort(), ['channel', 'completed_at', 'snapshot_date', 'version']);
    assert.equal(JSON.stringify(durable).includes('user'), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('material repair rotates the opaque version and latest reads use a bounded date', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  let durable = {
    channel: 'competition',
    snapshot_date: '2026-07-15',
    version: 'existing_snapshot_version',
    completed_at: '2026-07-15T22:00:00Z',
  };
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (!options.method) {
      if (!href.includes('snapshot_date=eq.')) assert.match(href, /snapshot_date=lte\.2026-07-15/);
      return response([durable]);
    }
    assert.match(options.headers.Prefer, /resolution=merge-duplicates/);
    durable = JSON.parse(options.body);
    return response([durable], 201);
  };
  try {
    const repaired = await publishCommunityCompetitionSnapshotMarker({
      snapshotDate: '2026-07-15',
      republish: true,
    });
    assert.notEqual(repaired.version, 'existing_snapshot_version');
    const latest = await getLatestCommunityCompetitionSnapshotMarker({ throughDate: '2026-07-15' });
    assert.equal(latest.version, repaired.version);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('marker reads preserve database microseconds for same-day publication ordering', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response([{
    channel: 'competition',
    snapshot_date: '2026-07-15',
    version: 'snapshot_microseconds_v1',
    completed_at: '2026-07-15T22:00:00.123456+00:00',
  }]);
  try {
    const latest = await getLatestCommunityCompetitionSnapshotMarker({ throughDate: '2026-07-15' });
    assert.equal(latest.completedAt, '2026-07-15T22:00:00.123456Z');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('marker REST failures are classified without exposing data through a browser role', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response({ message: 'internal schema detail' }, 503);
  try {
    await assert.rejects(
      publishCommunityCompetitionSnapshotMarker({ snapshotDate: '2026-07-15' }),
      (error) => error.status === 503 && error.retryable === true,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('marker SQL is FORCE RLS and service-role only', () => {
  const migration = readFileSync(
    new URL('../supabase/snapshot_publication_markers_20260716.sql', import.meta.url),
    'utf8',
  );
  const aggregate = readFileSync(new URL('../supabase/rls.sql', import.meta.url), 'utf8');
  [migration, aggregate].forEach((sql) => {
    assert.match(sql, /snapshot_publication_markers force row level security/i);
    assert.match(sql, /set_snapshot_publication_marker_completed_at[\s\S]+new\.completed_at\s*:=\s*clock_timestamp\(\)/i);
    assert.match(sql, /before insert or update on public\.snapshot_publication_markers/i);
    assert.match(sql, /revoke all on function public\.set_snapshot_publication_marker_completed_at\(\)\s+from public, anon, authenticated, service_role/i);
    assert.match(sql, /revoke all privileges on table public\.snapshot_publication_markers\s+from public, anon, authenticated, service_role/i);
    assert.match(sql, /grant select, insert, update\s+on table public\.snapshot_publication_markers\s+to service_role/i);
    assert.doesNotMatch(sql, /grant\s+select[^;]+snapshot_publication_markers[^;]+to authenticated/is);
  });
});
