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

function completedBatch(snapshotDate, memberCount) {
  const members = Array.from({ length: memberCount }, (_, index) => ({
    user_id: `user-${index + 1}`,
    eligible_after_snapshot_date: '2026-07-10',
    ranking_start_snapshot_date: index === memberCount - 1 && memberCount === 9
      ? '2026-07-15'
      : '2026-07-13',
    ranking_baseline_return_pct: 0,
  }));
  const profiles = members.map((member, index) => ({
    user_id: member.user_id,
    profile_completed_at: '2026-07-10T12:00:00Z',
    nickname: `member-${index + 1}`,
    avatar_key: `avatar-${index + 1}`,
  }));
  const snapshots = members.map((member) => ({
    user_id: member.user_id,
    snapshot_date: snapshotDate,
    daily_return_pct: 0.01,
    cumulative_return_pct: 0.02,
    locked_at: `${snapshotDate}T22:00:00Z`,
    source_version: 'community_competition_snapshot_v1',
    ledger_hash: 'a'.repeat(64),
    ledger_revision: 1,
  }));
  return { members, profiles, snapshots };
}

function batchRowsForUrl(href, batch) {
  if (href.includes('/rest/v1/community_competition_members')) return batch.members;
  if (href.includes('/rest/v1/community_profiles')) return batch.profiles;
  if (href.includes('/rest/v1/community_competition_snapshots')) return batch.snapshots;
  return null;
}

test('publisher creates a service-only marker and keeps same-date no-op versions stable', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  const calls = [];
  let durable = null;
  const batch = completedBatch('2026-07-15', 2);
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    assert.equal(options.headers.Authorization, 'Bearer service-role-secret');
    const batchRows = batchRowsForUrl(href, batch);
    if (batchRows) return response(batchRows);
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
  const batch = completedBatch('2026-07-15', 2);
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const batchRows = batchRowsForUrl(href, batch);
    if (batchRows) return response(batchRows);
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

test('2026-07-14 marker retries at 7 of 8 and publishes only after the exact batch reaches 8 of 8', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  const batch = completedBatch('2026-07-14', 8);
  const missingSnapshot = batch.snapshots.at(-1);
  batch.snapshots = batch.snapshots.slice(0, 7);
  let durable = null;
  let publicationCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const batchRows = batchRowsForUrl(href, batch);
    if (batchRows) return response(batchRows);
    if (!options.method) return response(durable ? [durable] : []);
    publicationCalls += 1;
    durable = JSON.parse(options.body);
    return response([durable], 201);
  };
  try {
    await assert.rejects(
      publishCommunityCompetitionSnapshotMarker({
        snapshotDate: '2026-07-14',
      }),
      (error) => (
        error.code === 'competition_snapshot_batch_incomplete'
        && error.status === 503
        && error.retryable === true
        && error.expectedMembers === 8
        && error.completeSnapshots === 7
      ),
    );
    assert.equal(publicationCalls, 0);

    batch.snapshots.push(missingSnapshot);
    const published = await publishCommunityCompetitionSnapshotMarker({
      snapshotDate: '2026-07-14',
    });
    assert.equal(published.published, true);
    assert.equal(publicationCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('an epoch-reset member leaves the target cohort before the unchanged exact gate publishes', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  const batch = completedBatch('2026-07-30', 9);
  batch.snapshots.pop();
  let durable = null;
  let publicationCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const batchRows = batchRowsForUrl(href, batch);
    if (batchRows) return response(batchRows);
    if (!options.method) return response(durable ? [durable] : []);
    publicationCalls += 1;
    durable = JSON.parse(options.body);
    return response([durable], 201);
  };
  try {
    await assert.rejects(
      publishCommunityCompetitionSnapshotMarker({ snapshotDate: '2026-07-30' }),
      (error) => (
        error.code === 'competition_snapshot_batch_incomplete'
        && error.expectedMembers === 9
        && error.completeSnapshots === 8
      ),
    );
    assert.equal(publicationCalls, 0);

    const resetMember = batch.members.at(-1);
    resetMember.eligible_after_snapshot_date = '2026-07-30';
    resetMember.ranking_start_snapshot_date = null;
    resetMember.ranking_baseline_return_pct = null;
    const published = await publishCommunityCompetitionSnapshotMarker({
      snapshotDate: '2026-07-30',
    });
    assert.equal(published.published, true);
    assert.equal(publicationCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('marker treats a null ranked return as an incomplete exact snapshot', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  const batch = completedBatch('2026-07-14', 2);
  batch.snapshots[1].daily_return_pct = null;
  let publicationCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const batchRows = batchRowsForUrl(href, batch);
    if (batchRows) return response(batchRows);
    if (!options.method) return response([]);
    publicationCalls += 1;
    return response([], 201);
  };
  try {
    await assert.rejects(
      publishCommunityCompetitionSnapshotMarker({ snapshotDate: '2026-07-14' }),
      (error) => (
        error.code === 'competition_snapshot_batch_incomplete'
        && error.expectedMembers === 2
        && error.completeSnapshots === 1
      ),
    );
    assert.equal(publicationCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('an existing same-date marker cannot bypass an incomplete exact batch', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  const batch = completedBatch('2026-07-14', 8);
  const missingSnapshot = batch.snapshots.pop();
  const durable = {
    channel: 'competition',
    snapshot_date: '2026-07-14',
    version: 'legacy_partial_marker',
    completed_at: '2026-07-14T23:00:00Z',
  };
  let publicationCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const batchRows = batchRowsForUrl(href, batch);
    if (batchRows) return response(batchRows);
    if (!options.method) return response([durable]);
    publicationCalls += 1;
    return response([], 201);
  };
  try {
    await assert.rejects(
      publishCommunityCompetitionSnapshotMarker({ snapshotDate: '2026-07-14' }),
      (error) => (
        error.code === 'competition_snapshot_batch_incomplete'
        && error.expectedMembers === 8
        && error.completeSnapshots === 7
      ),
    );
    assert.equal(publicationCalls, 0);

    batch.snapshots.push(missingSnapshot);
    const verifiedNoOp = await publishCommunityCompetitionSnapshotMarker({
      snapshotDate: '2026-07-14',
    });
    assert.equal(verifiedNoOp.published, false);
    assert.equal(verifiedNoOp.version, durable.version);
    assert.equal(publicationCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test('2026-07-15 marker excludes later cohorts, retries at 8 of 9, and publishes at 9 of 9', async () => {
  const env = snapshotEnv();
  configureEnv();
  const originalFetch = globalThis.fetch;
  const batch = completedBatch('2026-07-15', 10);
  batch.members.at(-1).ranking_start_snapshot_date = '2026-07-16';
  const ninthExpectedSnapshot = batch.snapshots[8];
  batch.snapshots = batch.snapshots.slice(0, 8);
  let durable = null;
  let publicationCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const batchRows = batchRowsForUrl(href, batch);
    if (batchRows) return response(batchRows);
    if (!options.method) return response(durable ? [durable] : []);
    publicationCalls += 1;
    durable = JSON.parse(options.body);
    return response([durable], 201);
  };
  try {
    await assert.rejects(
      publishCommunityCompetitionSnapshotMarker({
        snapshotDate: '2026-07-15',
      }),
      (error) => (
        error.code === 'competition_snapshot_batch_incomplete'
        && error.expectedMembers === 9
        && error.completeSnapshots === 8
      ),
    );
    assert.equal(publicationCalls, 0);

    batch.snapshots.push(ninthExpectedSnapshot);
    const published = await publishCommunityCompetitionSnapshotMarker({
      snapshotDate: '2026-07-15',
    });
    assert.equal(published.published, true);
    assert.equal(publicationCalls, 1);
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

test('marker bootstrap publishes only the latest exact complete locked historical batch', () => {
  const bootstrap = readFileSync(
    new URL('../supabase/snapshot_publication_marker_bootstrap_20260716.sql', import.meta.url),
    'utf8',
  );
  assert.match(bootstrap, /lock table public\.snapshot_publication_markers in share row exclusive mode/i);
  assert.match(bootstrap, /lock table public\.community_profiles in share mode/i);
  assert.match(bootstrap, /lock table public\.community_competition_members in share mode/i);
  assert.match(bootstrap, /lock table public\.community_competition_snapshots in share mode/i);
  assert.match(bootstrap, /snapshot\.snapshot_date < date '2026-07-16'/i);
  assert.match(bootstrap, /where member\.status = 'active'/i);
  assert.match(bootstrap, /profile\.profile_completed_at is not null/i);
  assert.match(bootstrap, /btrim\(profile\.nickname\) <> ''/i);
  assert.match(bootstrap, /btrim\(profile\.avatar_key\) <> ''/i);
  assert.match(bootstrap, /member\.eligible_after_snapshot_date < candidate\.snapshot_date/i);
  assert.match(bootstrap, /member\.ranking_start_snapshot_date <= candidate\.snapshot_date/i);
  assert.match(bootstrap, /member\.ranking_baseline_return_pct is not null/i);
  assert.match(bootstrap, /snapshot\.locked_at is not null/i);
  assert.match(bootstrap, /snapshot\.ledger_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(bootstrap, /snapshot\.ledger_revision >= 0/i);
  assert.match(bootstrap, /not exists[\s\S]+not exists[\s\S]+not exists/i);
  assert.match(bootstrap, /if exists[\s\S]+snapshot_publication_markers[\s\S]+return;/i);
  assert.match(bootstrap, /max\(complete_dates\.snapshot_date\)/i);
  assert.match(bootstrap, /if complete_snapshot_date is null then[\s\S]+raise exception/i);
  assert.match(bootstrap, /on conflict \(channel, snapshot_date\) do nothing/i);
  assert.doesNotMatch(bootstrap, /insert into public\.community_competition_snapshots/i);
  assert.doesNotMatch(bootstrap, /update public\.community_competition_snapshots/i);
  assert.doesNotMatch(bootstrap, /delete from public\.community_competition_snapshots/i);
});
