import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildDefaultCommunityProfile,
  COMMUNITY_AVATAR_OPTIONS,
  isCommunityProfileCompleted,
  mapCommunityProfileRow,
  normalizeCommunityAvatarKey,
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
const stockTradesSql = readFileSync(new URL('../supabase/stock_trades.sql', import.meta.url), 'utf8');
const competitionRebaselineMigrationSql = readFileSync(
  new URL('../supabase/community_competition_rebaseline_20260714.sql', import.meta.url),
  'utf8',
);
const rankedForwardRebaselineMigrationSql = readFileSync(
  new URL(
    '../supabase/community_competition_ranked_forward_rebaseline_20260731.sql',
    import.meta.url,
  ),
  'utf8',
);

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

test('community avatar catalog exposes eighteen presets and keeps legacy keys valid', () => {
  assert.equal(COMMUNITY_AVATAR_OPTIONS.length, 18);
  assert.equal(new Set(COMMUNITY_AVATAR_OPTIONS.map((avatar) => avatar.key)).size, 18);
  for (const legacyKey of ['gold', 'blue', 'purple', 'green', 'cyan', 'silver']) {
    assert.equal(normalizeCommunityAvatarKey(legacyKey), legacyKey);
  }
  for (const newKey of ['wolf', 'fox', 'tiger', 'cat', 'eagle', 'panda', 'cyber-cyan', 'cyber-magenta', 'cyber-void', 'cyber-red', 'cyber-visor', 'cyber-crystal']) {
    assert.equal(normalizeCommunityAvatarKey(newKey), newKey);
  }
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
  assert.match(membersTable, /eligible_ledger_revision bigint not null default 0/);
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
      /grant select, insert\s+on table public\.community_profiles\s+to service_role/,
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
  assert.match(snapshotsTable, /ledger_revision bigint not null/);
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

test('formal stock ledger timestamps and mutation revisions are database-authoritative', () => {
  for (const sql of [stockTradesSql, aggregateRlsSql, competitionRebaselineMigrationSql]) {
    const lockIndex = sql.indexOf('lock table public.stock_trades in share row exclusive mode;');
    const lockTimeoutIndex = sql.indexOf("set local lock_timeout = '5s';");
    const seedIndex = sql.indexOf('insert into public.stock_trade_ledger_revisions');
    const timestampTriggerIndex = sql.indexOf('create trigger stock_trades_enforce_server_timestamps');
    const triggerIndex = sql.indexOf('create trigger stock_trades_bump_ledger_revision');
    const firstCommitIndex = sql.indexOf('commit;', triggerIndex);
    const secondBeginIndex = sql.indexOf('begin;', firstCommitIndex + 'commit;'.length);
    const finalCommitIndex = sql.lastIndexOf('commit;');
    assert.match(sql, /\bbegin;/);
    assert.ok(lockTimeoutIndex >= 0, 'writer lock must have a fail-fast timeout');
    assert.ok(lockTimeoutIndex < lockIndex, 'lock timeout must be set before stock_trades lock');
    assert.ok(lockIndex >= 0, 'migration must lock stock_trades before revision seed');
    assert.ok(lockIndex < seedIndex, 'stock_trades lock must precede revision seed');
    assert.ok(seedIndex < timestampTriggerIndex, 'timestamp trigger must be installed after seed');
    assert.ok(timestampTriggerIndex < triggerIndex, 'both ledger triggers must install under one lock');
    assert.ok(seedIndex < triggerIndex, 'revision trigger must be installed after seed');
    assert.ok(triggerIndex < firstCommitIndex, 'writer lock must remain held through trigger install');
    assert.ok(firstCommitIndex < secondBeginIndex, 'writer lock transaction must commit immediately');
    assert.ok(secondBeginIndex < finalCommitIndex, 'remaining schema work must use a new transaction');

    const timestampFunction = sql.match(
      /create or replace function public\.enforce_stock_trade_server_timestamps\(\)[\s\S]*?\n\$\$;/,
    )?.[0] || '';
    assert.match(timestampFunction, /server_now timestamptz := clock_timestamp\(\)/);
    assert.match(timestampFunction, /new\.created_at = server_now/);
    assert.match(timestampFunction, /new\.created_at = old\.created_at/);
    assert.match(timestampFunction, /new\.updated_at = server_now/);
    assert.match(timestampFunction, /new\.user_id is distinct from old\.user_id/);
    assert.match(
      sql,
      /create trigger stock_trades_enforce_server_timestamps[\s\S]*?before insert or update on public\.stock_trades/,
    );

    const revisionFunction = sql.match(
      /create or replace function public\.bump_stock_trade_ledger_revision\(\)[\s\S]*?\n\$\$;/,
    )?.[0] || '';
    assert.match(revisionFunction, /security definer/);
    assert.match(revisionFunction, /on conflict \(user_id\) do update/);
    assert.match(revisionFunction, /stock_trade_ledger_revisions\.revision \+ 1/);
    assert.match(revisionFunction, /last_mutated_at = excluded\.last_mutated_at/);
    assert.match(revisionFunction, /clock_timestamp\(\)/);
    assert.match(
      sql,
      /create trigger stock_trades_bump_ledger_revision[\s\S]*?after insert or update or delete on public\.stock_trades/,
    );
    assert.match(sql, /alter table public\.stock_trade_ledger_revisions force row level security/);
    assert.match(
      sql,
      /revoke all privileges on table public\.stock_trade_ledger_revisions\s+from public, anon, authenticated, service_role/,
    );
    assert.match(
      sql,
      /grant select\s+on table public\.stock_trade_ledger_revisions\s+to service_role/,
    );
  }
});

test('competition eligibility rebaseline is forward-only, zero-snapshot, and service-role-only', () => {
  for (const sql of [
    competitionSql,
    aggregateRlsSql,
    competitionRebaselineMigrationSql,
  ]) {
    const rebaselineFunction = sql.match(
      /create or replace function public\.rebaseline_community_competition_member\([\s\S]*?\n\$\$;/,
    )?.[0] || '';
    assert.match(rebaselineFunction, /security definer/);
    assert.match(rebaselineFunction, /set search_path = pg_catalog, public/);
    assert.match(rebaselineFunction, /from public\.community_competition_members[\s\S]*?for update/);
    assert.match(
      rebaselineFunction,
      /not exists|if exists \([\s\S]*?from public\.community_competition_snapshots/,
    );
    assert.match(rebaselineFunction, /ranking_start_snapshot_date is not null/);
    assert.match(rebaselineFunction, /ranking_baseline_return_pct is not null/);
    assert.match(rebaselineFunction, /is distinct from p_expected_eligible_after_snapshot_date/);
    assert.match(rebaselineFunction, /is distinct from p_expected_eligible_ledger_hash/);
    assert.match(rebaselineFunction, /is distinct from p_expected_eligible_ledger_revision/);
    assert.match(rebaselineFunction, /is distinct from p_expected_current_ledger_revision/);
    assert.ok(
      rebaselineFunction.indexOf('from public.stock_trade_ledger_revisions')
        < rebaselineFunction.indexOf('from public.community_competition_members'),
      'rebaseline must lock revision before member',
    );
    assert.match(
      rebaselineFunction,
      /p_new_eligible_after_snapshot_date <= member_row\.eligible_after_snapshot_date/,
    );
    assert.match(
      sql,
      /revoke execute on function public\.rebaseline_community_competition_member\([\s\S]*?from public, anon, authenticated/,
    );
    assert.match(
      sql,
      /grant execute on function public\.rebaseline_community_competition_member\([\s\S]*?to service_role/,
    );

    const memberInsertGuard = sql.match(
      /create or replace function public\.guard_community_competition_member_insert\(\)[\s\S]*?\n\$\$;/,
    )?.[0] || '';
    assert.match(memberInsertGuard, /security definer/);
    assert.match(memberInsertGuard, /set search_path = pg_catalog, public/);
    assert.match(
      memberInsertGuard,
      /insert into public\.stock_trade_ledger_revisions[\s\S]*?values \(new\.user_id, 0, null\)[\s\S]*?on conflict \(user_id\) do nothing/,
    );
    assert.match(
      memberInsertGuard,
      /from public\.stock_trade_ledger_revisions[\s\S]*?where user_id = new\.user_id[\s\S]*?for update/,
    );
    assert.match(
      memberInsertGuard,
      /new\.eligible_ledger_revision is distinct from current_ledger_revision/,
    );
    assert.match(memberInsertGuard, /using errcode = '40001'/);
    assert.match(
      sql,
      /revoke execute on function public\.guard_community_competition_member_insert\(\)[\s\S]*?from public, anon, authenticated/,
    );
    assert.match(
      sql,
      /create trigger community_competition_members_guard_insert\s+before insert on public\.community_competition_members/,
    );
    assert.doesNotMatch(
      sql,
      /create trigger community_competition_members_guard_insert\s+before insert or update on public\.community_competition_members/,
    );

    const insertGuard = sql.match(
      /create or replace function public\.guard_community_competition_snapshot_insert\(\)[\s\S]*?\n\$\$;/,
    )?.[0] || '';
    assert.match(insertGuard, /security definer/);
    assert.match(insertGuard, /set search_path = pg_catalog, public/);
    assert.match(insertGuard, /from public\.community_competition_members[\s\S]*?for update/);
    assert.match(insertGuard, /new\.snapshot_date <= member_eligible_after/);
    assert.match(insertGuard, /new\.ledger_revision is distinct from current_ledger_revision/);
    assert.ok(
      insertGuard.indexOf('from public.stock_trade_ledger_revisions')
        < insertGuard.indexOf('from public.community_competition_members'),
      'snapshot guard must lock revision before member',
    );
    assert.match(
      sql,
      /create trigger community_competition_snapshots_guard_insert[\s\S]*?before insert on public\.community_competition_snapshots/,
    );

    const joinFunction = sql.match(
      /create or replace function public\.join_community_competition_member\([\s\S]*?\n\$\$;/,
    )?.[0] || '';
    assert.match(joinFunction, /security definer/);
    assert.match(joinFunction, /return 'joined'/);
    assert.match(joinFunction, /return 'already_active'/);
    assert.match(joinFunction, /return 'stale_ledger'/);
    assert.match(joinFunction, /return 'invalid_ledger_state'/);
    assert.match(joinFunction, /eligible_ledger_revision/);
    assert.ok(
      joinFunction.indexOf('from public.stock_trade_ledger_revisions')
        < joinFunction.indexOf('from public.community_competition_members'),
      'join must lock revision before member',
    );
    assert.match(
      sql,
      /revoke execute on function public\.join_community_competition_member\([\s\S]*?from public, anon, authenticated/,
    );
    assert.match(
      sql,
      /grant execute on function public\.join_community_competition_member\([\s\S]*?to service_role/,
    );
  }
});

test('ranked competition forward rebaseline is a service-only audited repair for the 2026-07-30 legacy timezone incident', () => {
  for (const sql of [
    competitionSql,
    aggregateRlsSql,
    rankedForwardRebaselineMigrationSql,
  ]) {
    const forwardFunction = sql.match(
      /create or replace function public\.forward_rebaseline_ranked_community_competition_member\([\s\S]*?\n\$\$;/,
    )?.[0] || '';
    assert.match(forwardFunction, /security definer/);
    assert.match(forwardFunction, /set search_path = pg_catalog, public/);
    assert.match(
      forwardFunction,
      /incident_date constant date := date '2026-07-30'/,
    );
    assert.match(
      forwardFunction,
      /p_new_eligible_after_snapshot_date is distinct from incident_date/,
    );
    assert.match(
      forwardFunction,
      /make_timestamptz\(2026, 7, 30, 16, 0, 0, 'America\/New_York'\)/,
    );
    assert.match(
      forwardFunction,
      /select revision, last_mutated_at[\s\S]*?for update/,
    );
    assert.ok(
      forwardFunction.indexOf('from public.stock_trade_ledger_revisions')
        < forwardFunction.indexOf('from public.community_competition_members'),
      'ranked forward rebaseline must lock revision before member',
    );
    assert.match(forwardFunction, /is distinct from p_expected_eligible_after_snapshot_date/);
    assert.match(forwardFunction, /is distinct from p_expected_eligible_ledger_hash/);
    assert.match(forwardFunction, /is distinct from p_expected_eligible_ledger_revision/);
    assert.match(forwardFunction, /is distinct from p_expected_ranking_start_snapshot_date/);
    assert.match(forwardFunction, /is distinct from p_expected_ranking_baseline_return_pct/);
    assert.match(forwardFunction, /is distinct from p_expected_current_ledger_revision/);
    assert.match(forwardFunction, /return 'already_rebaselined'/);
    assert.match(
      forwardFunction,
      /current_ledger_last_mutated_at > incident_close[\s\S]*?return 'incident_not_matched'/,
    );
    assert.match(
      forwardFunction,
      /trade\.trade_date = incident_date[\s\S]*?at time zone 'Asia\/Shanghai'\)::date = incident_date[\s\S]*?at time zone 'America\/New_York'\)::date[\s\S]*?= incident_prior_new_york_date/,
    );
    assert.match(
      forwardFunction,
      /trade\.created_at > incident_close[\s\S]*?at time zone 'America\/New_York'\)::date[\s\S]*?<> incident_date[\s\S]*?at time zone 'Asia\/Shanghai'\)::date[\s\S]*?= incident_date/,
    );
    assert.match(
      forwardFunction,
      /from public\.community_competition_snapshots[\s\S]*?snapshot_date >= incident_date/,
    );
    assert.match(
      forwardFunction,
      /insert into public\.community_competition_rebaseline_audit[\s\S]*?on conflict \(operation_key\) do nothing/,
    );
    assert.ok(
      forwardFunction.indexOf('insert into public.community_competition_rebaseline_audit')
        < forwardFunction.indexOf('update public.community_competition_members'),
      'audit insertion and member reset must commit in one function transaction',
    );
    assert.match(forwardFunction, /ranking_start_snapshot_date = null/);
    assert.match(forwardFunction, /ranking_baseline_return_pct = null/);
    assert.doesNotMatch(forwardFunction, /delete from public\.community_competition_snapshots/);

    const auditTable = sql.match(
      /create table if not exists public\.community_competition_rebaseline_audit \([\s\S]*?\n\);/,
    )?.[0] || '';
    assert.match(auditTable, /operation_key text primary key/);
    assert.match(auditTable, /user_id uuid not null/);
    assert.match(auditTable, /old_eligible_after_snapshot_date date not null/);
    assert.match(auditTable, /new_eligible_after_snapshot_date date not null/);
    assert.match(auditTable, /old_eligible_ledger_hash text/);
    assert.match(auditTable, /new_eligible_ledger_hash text not null/);
    assert.match(auditTable, /old_eligible_ledger_revision bigint not null/);
    assert.match(auditTable, /new_eligible_ledger_revision bigint not null/);
    assert.match(auditTable, /old_ranking_start_snapshot_date date not null/);
    assert.match(auditTable, /old_ranking_baseline_return_pct numeric\(18, 10\) not null/);
    assert.match(
      auditTable,
      /reason = 'legacy_shanghai_new_york_trade_date_mismatch_2026-07-30'/,
    );
    assert.match(auditTable, /created_at timestamptz not null default clock_timestamp\(\)/);
    assert.match(
      sql,
      /alter table public\.community_competition_rebaseline_audit enable row level security/,
    );
    assert.match(
      sql,
      /alter table public\.community_competition_rebaseline_audit force row level security/,
    );
    assert.match(
      sql,
      /revoke all privileges on table public\.community_competition_rebaseline_audit[\s\S]*?from public, anon, authenticated, service_role/,
    );
    assert.match(
      sql,
      /grant select[\s\S]*?on table public\.community_competition_rebaseline_audit[\s\S]*?to service_role/,
    );
    assert.match(
      sql,
      /create trigger community_competition_rebaseline_audit_immutable[\s\S]*?before update or delete on public\.community_competition_rebaseline_audit/,
    );
    assert.match(
      sql,
      /revoke execute on function public\.forward_rebaseline_ranked_community_competition_member\([\s\S]*?from public, anon, authenticated/,
    );
    assert.match(
      sql,
      /grant execute on function public\.forward_rebaseline_ranked_community_competition_member\([\s\S]*?to service_role/,
    );
  }
});

test('standalone competition SQL stays aligned with the aggregate RLS schema', () => {
  for (const table of [
    'community_competition_members',
    'community_competition_snapshots',
    'community_competition_rebaseline_audit',
  ]) {
    const pattern = new RegExp(`create table if not exists public\\.${table}[\\s\\S]*?\\n\\);`);
    assert.equal(
      aggregateRlsSql.match(pattern)?.[0],
      competitionSql.match(pattern)?.[0],
      `${table} definitions must stay identical`,
    );
  }
  for (const functionName of [
    'guard_community_competition_member_insert',
    'guard_community_competition_snapshot_insert',
    'join_community_competition_member',
    'rebaseline_community_competition_member',
    'guard_community_competition_rebaseline_audit_immutable',
    'forward_rebaseline_ranked_community_competition_member',
  ]) {
    const pattern = new RegExp(
      `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
    );
    assert.equal(
      aggregateRlsSql.match(pattern)?.[0],
      competitionSql.match(pattern)?.[0],
      `${functionName} definitions must stay identical`,
    );
  }

  for (const pattern of [
    /create table if not exists public\.community_competition_rebaseline_audit \([\s\S]*?\n\);/,
    /create or replace function public\.guard_community_competition_rebaseline_audit_immutable\(\)[\s\S]*?\n\$\$;/,
    /create or replace function public\.forward_rebaseline_ranked_community_competition_member\([\s\S]*?\n\$\$;/,
  ]) {
    assert.equal(
      rankedForwardRebaselineMigrationSql.match(pattern)?.[0],
      competitionSql.match(pattern)?.[0],
      'incident migration and canonical competition SQL must stay identical',
    );
  }
});
