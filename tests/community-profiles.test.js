import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildDefaultCommunityProfile,
  isCommunityProfileCompleted,
  mapCommunityProfileRow,
} from '../src/lib/communityProfile.js';
import { createCommunityProfilesRepository } from '../src/lib/communityProfilesRepository.js';

const competitionSql = readFileSync(
  new URL('../supabase/community_competition.sql', import.meta.url),
  'utf8',
);
const communityProfilesSql = readFileSync(
  new URL('../supabase/community_profiles.sql', import.meta.url),
  'utf8',
);
const aggregateRlsSql = readFileSync(new URL('../supabase/rls.sql', import.meta.url), 'utf8');

function createSupabaseStub({ maybeSingleResults = [], singleResults = [] } = {}) {
  const operations = [];
  const maybeQueue = [...maybeSingleResults];
  const singleQueue = [...singleResults];

  return {
    operations,
    from(table) {
      const operation = { table };
      const query = {
        select(columns) {
          operation.select = columns;
          return query;
        },
        eq(column, value) {
          operation.eq = [column, value];
          return query;
        },
        insert(payload) {
          operation.kind = 'insert';
          operation.payload = payload;
          operations.push(operation);
          return query;
        },
        upsert(payload, options) {
          operation.kind = 'upsert';
          operation.payload = payload;
          operation.options = options;
          operations.push(operation);
          return query;
        },
        async maybeSingle() {
          operation.kind = operation.kind || 'fetch';
          operations.push(operation);
          return maybeQueue.shift() || { data: null, error: null };
        },
        async single() {
          const queued = singleQueue.shift();
          if (queued) return queued;
          return {
            data: {
              ...operation.payload,
              created_at: '2026-07-12T00:00:00.000Z',
              updated_at: '2026-07-12T00:00:00.000Z',
            },
            error: null,
          };
        },
      };
      return query;
    },
  };
}

test('default community profiles remain unconfirmed until an explicit save', () => {
  const profile = buildDefaultCommunityProfile({ id: 'user-default' });
  assert.equal(profile.profileCompletedAt, null);
  assert.equal(isCommunityProfileCompleted(profile), false);

  const mapped = mapCommunityProfileRow({
    user_id: 'user-default',
    nickname: profile.nickname,
    avatar_key: profile.avatarKey,
    profile_completed_at: null,
  });
  assert.equal(mapped.profileCompletedAt, null);
  assert.equal(isCommunityProfileCompleted(mapped), false);
});

test('ensure inserts a default profile with a null completion marker', async () => {
  const client = createSupabaseStub();
  const repository = createCommunityProfilesRepository(client);

  const profile = await repository.ensure({ id: 'user-ensure' });
  const insert = client.operations.find((operation) => operation.kind === 'insert');

  assert.ok(insert);
  assert.equal(insert.table, 'community_profiles');
  assert.equal(insert.payload.user_id, 'user-ensure');
  assert.equal(insert.payload.profile_completed_at, null);
  assert.equal(profile.profileCompletedAt, null);
  assert.equal(isCommunityProfileCompleted(profile), false);
  assert.equal(client.operations.some((operation) => operation.kind === 'upsert'), false);
});

test('explicit save writes a completion timestamp and maps it back to the caller', async () => {
  const client = createSupabaseStub();
  const repository = createCommunityProfilesRepository(client);

  const profile = await repository.upsert(
    { id: 'user-save' },
    { nickname: '真实昵称', avatarKey: 'green' },
  );
  const upsert = client.operations.find((operation) => operation.kind === 'upsert');

  assert.ok(upsert);
  assert.equal(upsert.payload.user_id, 'user-save');
  assert.equal(upsert.payload.nickname, '真实昵称');
  assert.equal(upsert.payload.avatar_key, 'green');
  assert.ok(Number.isFinite(Date.parse(upsert.payload.profile_completed_at)));
  assert.equal(profile.profileCompletedAt, upsert.payload.profile_completed_at);
  assert.equal(isCommunityProfileCompleted(profile), true);
});

test('ensure does not overwrite an existing completed profile', async () => {
  const completedAt = '2026-07-12T08:00:00.000Z';
  const client = createSupabaseStub({
    maybeSingleResults: [{
      data: {
        user_id: 'user-existing',
        nickname: '已确认用户',
        avatar_key: 'blue',
        profile_completed_at: completedAt,
        created_at: '2026-07-11T08:00:00.000Z',
        updated_at: completedAt,
      },
      error: null,
    }],
  });
  const repository = createCommunityProfilesRepository(client);

  const profile = await repository.ensure({ id: 'user-existing' });

  assert.equal(profile.profileCompletedAt, completedAt);
  assert.equal(isCommunityProfileCompleted(profile), true);
  assert.equal(client.operations.some((operation) => operation.kind === 'insert'), false);
  assert.equal(client.operations.some((operation) => operation.kind === 'upsert'), false);
});

test('competition membership is server-written and client-readable only for its owner', () => {
  const membersTable = competitionSql.match(
    /create table if not exists public\.community_competition_members[\s\S]*?\n\);/,
  )?.[0] || '';

  assert.match(membersTable, /eligible_after_snapshot_date date not null/);
  assert.match(membersTable, /eligible_ledger_hash text/);
  assert.match(
    membersTable,
    /eligible_ledger_hash is null or eligible_ledger_hash ~ '\^\[0-9a-f\]\{64\}\$'/,
  );
  assert.match(membersTable, /ranking_start_snapshot_date date/);
  assert.match(membersTable, /ranking_baseline_return_pct numeric\(18, 10\)/);
  assert.match(
    membersTable,
    /ranking_start_snapshot_date > eligible_after_snapshot_date/,
  );
  assert.match(
    competitionSql,
    /for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)/,
  );
  assert.match(
    competitionSql,
    /revoke all privileges on table public\.community_competition_members\s+from public, anon, authenticated/,
  );
  assert.match(
    competitionSql,
    /grant select\s+on table public\.community_competition_members\s+to authenticated/,
  );
  assert.equal(
    /create policy[\s\S]*?community_competition_members[\s\S]*?for (insert|update|delete|all)\s+to authenticated/i.test(competitionSql),
    false,
  );
  for (const sql of [competitionSql, aggregateRlsSql]) {
    assert.match(
      sql,
      /alter table public\.community_competition_members\s+add column if not exists eligible_ledger_hash text/,
    );
  }
});

test('authenticated clients can read only their own community profile', () => {
  for (const sql of [communityProfilesSql, aggregateRlsSql]) {
    assert.match(
      sql,
      /on public\.community_profiles\s+for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)/,
    );
    assert.equal(
      /on public\.community_profiles\s+for select\s+to authenticated\s+using \(true\)/.test(sql),
      false,
    );
    assert.match(
      sql,
      /grant select\s+on table public\.community_profiles\s+to service_role/,
    );
  }
});

test('competition snapshots are service-role-only percentage records', () => {
  const snapshotsTable = competitionSql.match(
    /create table if not exists public\.community_competition_snapshots[\s\S]*?\n\);/,
  )?.[0] || '';

  assert.match(snapshotsTable, /daily_return_pct numeric\(18, 10\)/);
  assert.match(snapshotsTable, /cumulative_return_pct numeric\(18, 10\) not null/);
  assert.match(snapshotsTable, /daily_return_pct is null or daily_return_pct >= -1/);
  assert.match(snapshotsTable, /cumulative_return_pct >= -1/);
  assert.match(snapshotsTable, /locked_at timestamptz not null/);
  assert.match(snapshotsTable, /ledger_hash text not null/);
  assert.match(snapshotsTable, /check \(ledger_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(
    snapshotsTable,
    /source_version text not null default 'community_competition_snapshot_v1'/,
  );
  assert.match(
    snapshotsTable,
    /check \(source_version = 'community_competition_snapshot_v1'\)/,
  );
  assert.equal(
    /amount|assets|cash|holding|shares|symbol|price|trade|email|pnl_usd/i.test(snapshotsTable),
    false,
  );
  assert.match(
    competitionSql,
    /revoke all privileges on table public\.community_competition_snapshots\s+from public, anon, authenticated/,
  );
  assert.match(
    competitionSql,
    /revoke all privileges on table public\.community_competition_snapshots\s+from service_role/,
  );
  assert.match(
    competitionSql,
    /grant select, insert\s+on table public\.community_competition_snapshots\s+to service_role/,
  );
  assert.equal(
    /grant[^;]*(update|delete)[^;]*community_competition_snapshots/i.test(competitionSql),
    false,
  );
  assert.equal(
    /create policy[^;]+on public\.community_competition_snapshots/i.test(competitionSql),
    false,
  );
});

test('standalone competition SQL stays aligned with the aggregate RLS schema', () => {
  for (const table of ['community_competition_members', 'community_competition_snapshots']) {
    const pattern = new RegExp(`create table if not exists public\\.${table}[\\s\\S]*?\\n\\);`);
    assert.equal(
      aggregateRlsSql.match(pattern)?.[0],
      competitionSql.match(pattern)?.[0],
      `${table} definitions must stay identical`,
    );
  }
});
