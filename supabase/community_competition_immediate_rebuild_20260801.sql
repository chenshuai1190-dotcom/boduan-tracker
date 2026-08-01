-- Forward-only migration: immediately rebuild a ranked member's published
-- competition history after a canonical formal-trade mutation.
--
-- The browser can still edit only its own stock_trades rows. The trigger below
-- records an opaque dirty boundary for every active member mutation. The
-- runtime decides whether it requires a historical rebuild or can be consumed
-- by a later unpublished snapshot. Only service_role can inspect the state or
-- invoke the atomic RPCs.

begin;

set local lock_timeout = '5s';

create table if not exists public.community_competition_rebuild_state (
  user_id uuid primary key
    references public.community_competition_members(user_id) on delete cascade,
  dirty_from_date date not null,
  ledger_revision bigint not null,
  requested_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint community_competition_rebuild_state_revision_check
    check (ledger_revision >= 0),
  constraint community_competition_rebuild_state_timestamp_check
    check (updated_at >= requested_at)
);

alter table public.community_competition_rebuild_state enable row level security;
alter table public.community_competition_rebuild_state force row level security;

revoke all privileges on table public.community_competition_rebuild_state
from public, anon, authenticated, service_role;

grant select
on table public.community_competition_rebuild_state
to service_role;

create table if not exists public.community_competition_rebuild_audit (
  operation_key text primary key,
  user_id uuid not null,
  ledger_revision bigint not null,
  dirty_from_date date not null,
  old_eligible_after_snapshot_date date not null,
  new_eligible_after_snapshot_date date not null,
  old_eligible_ledger_hash text,
  new_eligible_ledger_hash text not null,
  old_eligible_ledger_revision bigint not null,
  new_eligible_ledger_revision bigint not null,
  old_ranking_start_snapshot_date date,
  new_ranking_start_snapshot_date date,
  old_ranking_baseline_return_pct numeric(18, 10),
  new_ranking_baseline_return_pct numeric(18, 10),
  snapshot_date date not null,
  old_marker_version text not null,
  new_marker_version text,
  replaced_snapshot_count integer not null,
  outcome text not null,
  recovery_source text not null,
  completed_at timestamptz not null default clock_timestamp(),

  constraint community_competition_rebuild_audit_operation_key_check
    check (
      char_length(operation_key) between 48 and 220
      and operation_key ~ '^competition-ledger-rebuild:'
    ),
  constraint community_competition_rebuild_audit_revision_check
    check (
      ledger_revision >= 0
      and old_eligible_ledger_revision >= 0
      and new_eligible_ledger_revision = ledger_revision
    ),
  constraint community_competition_rebuild_audit_old_hash_check
    check (
      old_eligible_ledger_hash is null
      or old_eligible_ledger_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint community_competition_rebuild_audit_new_hash_check
    check (new_eligible_ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint community_competition_rebuild_audit_old_ranking_pair_check
    check (
      (old_ranking_start_snapshot_date is null)
      = (old_ranking_baseline_return_pct is null)
    ),
  constraint community_competition_rebuild_audit_new_ranking_pair_check
    check (
      (new_ranking_start_snapshot_date is null)
      = (new_ranking_baseline_return_pct is null)
      and (
        new_ranking_start_snapshot_date is null
        or (
          new_ranking_start_snapshot_date > new_eligible_after_snapshot_date
          and new_ranking_baseline_return_pct >= -1
        )
      )
    ),
  constraint community_competition_rebuild_audit_marker_version_check
    check (
      old_marker_version ~ '^[A-Za-z0-9_-]{16,128}$'
      and (
        (
          outcome = 'recalculated'
          and new_marker_version ~ '^[A-Za-z0-9_-]{16,128}$'
          and new_marker_version <> old_marker_version
        )
        or (outcome = 'waiting_snapshot' and new_marker_version is null)
      )
    ),
  constraint community_competition_rebuild_audit_snapshot_count_check
    check (
      (outcome = 'recalculated' and replaced_snapshot_count > 0)
      or (outcome = 'waiting_snapshot' and replaced_snapshot_count = 0)
    ),
  constraint community_competition_rebuild_audit_outcome_check
    check (outcome in ('recalculated', 'waiting_snapshot')),
  constraint community_competition_rebuild_audit_recovery_source_check
    check (
      recovery_source in (
        'ranking_unchanged',
        'epoch_reset_audit',
        'ranked_rebaseline_audit',
        'earliest_snapshot_fallback',
        'waiting_for_first_snapshot'
      )
    )
);

alter table public.community_competition_rebuild_audit enable row level security;
alter table public.community_competition_rebuild_audit force row level security;

revoke all privileges on table public.community_competition_rebuild_audit
from public, anon, authenticated, service_role;

grant select
on table public.community_competition_rebuild_audit
to service_role;

create or replace function public.guard_community_competition_rebuild_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'community competition rebuild audit rows are immutable'
    using errcode = '55000';
end;
$$;

revoke execute on function public.guard_community_competition_rebuild_audit_immutable()
from public, anon, authenticated, service_role;

drop trigger if exists community_competition_rebuild_audit_immutable
on public.community_competition_rebuild_audit;

create trigger community_competition_rebuild_audit_immutable
before update or delete on public.community_competition_rebuild_audit
for each row
execute function public.guard_community_competition_rebuild_audit_immutable();

-- Serialize installation against formal-ledger writers. Readers remain
-- compatible with SHARE ROW EXCLUSIVE, and the lock is released at commit.
lock table public.stock_trades in share row exclusive mode;

create or replace function public.bump_stock_trade_ledger_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  affected_user_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  affected_from_date date := case
    when tg_op = 'INSERT' then new.trade_date
    when tg_op = 'DELETE' then old.trade_date
    else least(old.trade_date, new.trade_date)
  end;
  next_revision bigint;
begin
  -- Display-only metadata is outside the canonical competition ledger. Keep
  -- both the revision and competition dirty state stable for name/note edits.
  if tg_op = 'UPDATE' then
    -- Moving a canonical trade between owners would require atomically bumping
    -- and dirtying both ledgers. The product never supports that operation, so
    -- fail closed even for a privileged maintenance client.
    if new.user_id is distinct from old.user_id then
      raise exception 'stock trade owner cannot be changed'
        using errcode = '22023';
    end if;

    if new.id is not distinct from old.id
      and new.symbol is not distinct from old.symbol
      and new.side is not distinct from old.side
      and new.trade_date is not distinct from old.trade_date
      and new.price is not distinct from old.price
      and new.shares is not distinct from old.shares
      and new.fee is not distinct from old.fee
      and new.currency is not distinct from old.currency
    then
      return new;
    end if;
  end if;

  -- An auth.users cascade is deleting the whole account, so there is no ledger
  -- left to version and recreating its revision row would violate the FK.
  if not exists (
    select 1
    from auth.users
    where id = affected_user_id
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  insert into public.stock_trade_ledger_revisions (
    user_id,
    revision,
    last_mutated_at
  )
  values (
    affected_user_id,
    1,
    clock_timestamp()
  )
  on conflict (user_id) do update
  set revision = public.stock_trade_ledger_revisions.revision + 1,
      last_mutated_at = excluded.last_mutated_at
  returning revision into next_revision;

  -- Every canonical mutation of an active member records dirty state. A future
  -- trade is harmless to the current as-of calculation, but carrying the new
  -- revision through the rebuilt row closes the snapshot-before-publication
  -- race and lets the ordinary target-date job include it later.
  if to_regclass('public.community_competition_rebuild_state') is not null
    and to_regclass('public.community_competition_members') is not null
  then
    if exists (
      select 1
      from public.community_competition_members as member
      where member.user_id = affected_user_id
        and member.status = 'active'
    )
    then
      insert into public.community_competition_rebuild_state (
        user_id,
        dirty_from_date,
        ledger_revision,
        requested_at,
        updated_at
      )
      values (
        affected_user_id,
        affected_from_date,
        next_revision,
        clock_timestamp(),
        clock_timestamp()
      )
      on conflict (user_id) do update
      set dirty_from_date = least(
            public.community_competition_rebuild_state.dirty_from_date,
            excluded.dirty_from_date
          ),
          ledger_revision = greatest(
            public.community_competition_rebuild_state.ledger_revision,
            excluded.ledger_revision
          ),
          updated_at = excluded.updated_at;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.bump_stock_trade_ledger_revision()
from public, anon, authenticated, service_role;

-- Capture drift that predates this trigger installation. This is deliberately
-- conservative: the runtime rebuilds the full current ranking interval, so an
-- earlier dirty boundary is safe and avoids attempting to infer a deleted
-- trade's former date. It also recovers v403 members whose rollover cleared the
-- ranking pair while immutable historical snapshots remain.
with latest_marker as (
  select marker.snapshot_date
  from public.snapshot_publication_markers as marker
  where marker.channel = 'competition'
  order by marker.snapshot_date desc
  limit 1
), rebuild_candidates as (
  select
    member.user_id,
    least(
      marker.snapshot_date,
      coalesce(member.ranking_start_snapshot_date, marker.snapshot_date),
      coalesce(snapshot.first_snapshot_date, marker.snapshot_date),
      coalesce(trade.first_trade_date, marker.snapshot_date)
    ) as dirty_from_date,
    revision.revision as ledger_revision
  from public.community_competition_members as member
  join public.stock_trade_ledger_revisions as revision
    on revision.user_id = member.user_id
  cross join latest_marker as marker
  left join lateral (
    select min(snapshot_date) as first_snapshot_date
    from public.community_competition_snapshots
    where user_id = member.user_id
      and snapshot_date <= marker.snapshot_date
  ) as snapshot on true
  left join lateral (
    select ledger_revision
    from public.community_competition_snapshots
    where user_id = member.user_id
      and snapshot_date = marker.snapshot_date
    limit 1
  ) as published_snapshot on true
  left join lateral (
    select min(trade_date) as first_trade_date
    from public.stock_trades
    where user_id = member.user_id
      and trade_date <= marker.snapshot_date
  ) as trade on true
  where member.status = 'active'
    and (
      (
        member.ranking_start_snapshot_date is not null
        and member.ranking_start_snapshot_date <= marker.snapshot_date
        and published_snapshot.ledger_revision
          is distinct from revision.revision
      )
      or (
        member.ranking_start_snapshot_date is null
        and snapshot.first_snapshot_date is not null
      )
      or (
        member.ranking_start_snapshot_date is null
        and snapshot.first_snapshot_date is null
        and revision.revision > member.eligible_ledger_revision
      )
    )
)
insert into public.community_competition_rebuild_state (
  user_id,
  dirty_from_date,
  ledger_revision,
  requested_at,
  updated_at
)
select
  candidate.user_id,
  candidate.dirty_from_date,
  candidate.ledger_revision,
  clock_timestamp(),
  clock_timestamp()
from rebuild_candidates as candidate
on conflict (user_id) do update
set dirty_from_date = least(
      public.community_competition_rebuild_state.dirty_from_date,
      excluded.dirty_from_date
    ),
    ledger_revision = greatest(
      public.community_competition_rebuild_state.ledger_revision,
      excluded.ledger_revision
    ),
    updated_at = excluded.updated_at;

create or replace function public.upsert_unpublished_community_competition_member_snapshot(
  p_user_id uuid,
  p_target_snapshot_date date,
  p_expected_ledger_revision bigint,
  p_expected_eligible_after_snapshot_date date,
  p_expected_eligible_ledger_hash text,
  p_expected_eligible_ledger_revision bigint,
  p_expected_ranking_start_snapshot_date date,
  p_expected_ranking_baseline_return_pct numeric,
  p_initialize_ranking_baseline_return_pct numeric,
  p_daily_return_pct numeric,
  p_cumulative_return_pct numeric,
  p_locked_at timestamptz,
  p_ledger_hash text,
  p_source_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_ledger_revision bigint;
  member_row public.community_competition_members%rowtype;
  dirty_row public.community_competition_rebuild_state%rowtype;
  existing_row public.community_competition_snapshots%rowtype;
  latest_marker_date date;
  outcome_value text;
  ranking_initialized boolean := false;
begin
  if p_user_id is null
    or p_target_snapshot_date is null
    or p_expected_ledger_revision is null
    or p_expected_ledger_revision < 0
    or p_expected_eligible_after_snapshot_date is null
    or p_expected_eligible_ledger_revision is null
    or p_expected_eligible_ledger_revision < 0
    or (
      (p_expected_ranking_start_snapshot_date is null)
      <> (p_expected_ranking_baseline_return_pct is null)
    )
    or (
      (p_expected_ranking_start_snapshot_date is null)
      <> (p_initialize_ranking_baseline_return_pct is not null)
    )
    or (
      p_initialize_ranking_baseline_return_pct is not null
      and p_initialize_ranking_baseline_return_pct < -1
    )
    or p_daily_return_pct is null
    or p_daily_return_pct < -1
    or p_cumulative_return_pct is null
    or p_cumulative_return_pct < -1
    or p_locked_at is null
    or p_locked_at > clock_timestamp()
    or p_ledger_hash is null
    or p_ledger_hash !~ '^[0-9a-f]{64}$'
    or p_source_version is distinct from 'community_competition_snapshot_v1'
  then
    raise exception 'invalid unpublished competition snapshot input'
      using errcode = '22023';
  end if;

  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  if not found
    or current_ledger_revision is distinct from p_expected_ledger_revision
  then
    return jsonb_build_object(
      'outcome', 'stale_ledger',
      'snapshotDate', p_target_snapshot_date,
      'ledgerRevision', current_ledger_revision
    );
  end if;

  select *
  into member_row
  from public.community_competition_members
  where user_id = p_user_id
  for update;

  if not found
    or member_row.status <> 'active'
    or member_row.eligible_after_snapshot_date
      is distinct from p_expected_eligible_after_snapshot_date
    or member_row.eligible_ledger_hash
      is distinct from p_expected_eligible_ledger_hash
    or member_row.eligible_ledger_revision
      is distinct from p_expected_eligible_ledger_revision
    or member_row.ranking_start_snapshot_date
      is distinct from p_expected_ranking_start_snapshot_date
    or member_row.ranking_baseline_return_pct
      is distinct from p_expected_ranking_baseline_return_pct
    or p_target_snapshot_date <= member_row.eligible_after_snapshot_date
    or (
      member_row.ranking_start_snapshot_date is not null
      and p_target_snapshot_date < member_row.ranking_start_snapshot_date
    )
  then
    return jsonb_build_object(
      'outcome', 'stale_member',
      'snapshotDate', p_target_snapshot_date,
      'ledgerRevision', current_ledger_revision
    );
  end if;

  -- Preserve the global lock order even when no dirty row currently exists.
  select *
  into dirty_row
  from public.community_competition_rebuild_state
  where user_id = p_user_id
  for update;

  lock table public.snapshot_publication_markers in share row exclusive mode;

  select max(snapshot_date)
  into latest_marker_date
  from public.snapshot_publication_markers
  where channel = 'competition';

  if dirty_row.user_id is not null
    and dirty_row.ledger_revision is distinct from p_expected_ledger_revision
  then
    return jsonb_build_object(
      'outcome', 'stale_ledger',
      'snapshotDate', p_target_snapshot_date,
      'ledgerRevision', current_ledger_revision,
      'rankingInitialized', false
    );
  end if;

  -- A normal day append may consume only dirty state that starts after the
  -- latest durable publication. Earlier dirty dates require a full interval
  -- rebuild; writing one target from the old cumulative chain would corrupt
  -- history and must never clear that signal.
  if dirty_row.user_id is not null
    and latest_marker_date is not null
    and dirty_row.dirty_from_date <= latest_marker_date
  then
    return jsonb_build_object(
      'outcome', 'historical_dirty',
      'snapshotDate', p_target_snapshot_date,
      'ledgerRevision', current_ledger_revision,
      'rankingInitialized', false
    );
  end if;

  if latest_marker_date is not null
    and latest_marker_date >= p_target_snapshot_date
  then
    return jsonb_build_object(
      'outcome', 'published',
      'snapshotDate', p_target_snapshot_date,
      'ledgerRevision', current_ledger_revision,
      'rankingInitialized', false
    );
  end if;

  -- The first ranking pair and its first snapshot become visible atomically
  -- under the same marker-table lock. This prevents publication from excluding
  -- a rank-null member between a snapshot write and a later membership PATCH.
  if member_row.ranking_start_snapshot_date is null then
    update public.community_competition_members
    set ranking_start_snapshot_date = p_target_snapshot_date,
        ranking_baseline_return_pct = p_initialize_ranking_baseline_return_pct,
        updated_at = clock_timestamp()
    where user_id = p_user_id
      and status = 'active'
      and ranking_start_snapshot_date is null
      and ranking_baseline_return_pct is null;

    if not found then
      return jsonb_build_object(
        'outcome', 'stale_member',
        'snapshotDate', p_target_snapshot_date,
        'ledgerRevision', current_ledger_revision,
        'rankingInitialized', false
      );
    end if;
    ranking_initialized := true;
  end if;

  select *
  into existing_row
  from public.community_competition_snapshots
  where user_id = p_user_id
    and snapshot_date = p_target_snapshot_date
  for update;

  if existing_row.id is not null
    and existing_row.daily_return_pct is not distinct from p_daily_return_pct
    and existing_row.cumulative_return_pct
      is not distinct from p_cumulative_return_pct
    and existing_row.locked_at is not distinct from p_locked_at
    and existing_row.ledger_hash is not distinct from p_ledger_hash
    and existing_row.ledger_revision
      is not distinct from p_expected_ledger_revision
    and existing_row.source_version is not distinct from p_source_version
  then
    outcome_value := 'already_current';
  else
    delete from public.community_competition_snapshots
    where user_id = p_user_id
      and snapshot_date = p_target_snapshot_date;

    insert into public.community_competition_snapshots (
      user_id,
      snapshot_date,
      daily_return_pct,
      cumulative_return_pct,
      locked_at,
      ledger_hash,
      ledger_revision,
      source_version,
      created_at,
      updated_at
    )
    values (
      p_user_id,
      p_target_snapshot_date,
      p_daily_return_pct,
      p_cumulative_return_pct,
      p_locked_at,
      p_ledger_hash,
      p_expected_ledger_revision,
      p_source_version,
      p_locked_at,
      p_locked_at
    );

    outcome_value := case
      when existing_row.id is null then 'inserted'
      else 'replaced_unpublished'
    end;
  end if;

  delete from public.community_competition_rebuild_state
  where user_id = p_user_id
    and ledger_revision = p_expected_ledger_revision;

  return jsonb_build_object(
    'outcome', outcome_value,
    'snapshotDate', p_target_snapshot_date,
    'ledgerRevision', p_expected_ledger_revision,
    'rankingInitialized', ranking_initialized
  );
end;
$$;

revoke execute on function public.upsert_unpublished_community_competition_member_snapshot(
  uuid, date, bigint, date, text, bigint, date, numeric, numeric,
  numeric, numeric, timestamptz, text, text
)
from public, anon, authenticated, service_role;

grant execute on function public.upsert_unpublished_community_competition_member_snapshot(
  uuid, date, bigint, date, text, bigint, date, numeric, numeric,
  numeric, numeric, timestamptz, text, text
)
to service_role;

create or replace function public.publish_community_competition_snapshot_marker(
  p_snapshot_date date,
  p_expected_version text,
  p_new_version text,
  p_republish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_members_count integer := 0;
  complete_snapshots_count integer := 0;
  locked_user_id uuid;
  locked_user_ids uuid[] := array[]::uuid[];
  locked_profile_id uuid;
  locked_profile_ids uuid[] := array[]::uuid[];
  existing_marker public.snapshot_publication_markers%rowtype;
  latest_marker_date date;
  completed_at_value timestamptz;
  outcome_value text;
begin
  if p_snapshot_date is null
    or p_new_version is null
    or p_new_version !~ '^[A-Za-z0-9_-]{16,128}$'
    or (
      p_expected_version is not null
      and p_expected_version !~ '^[A-Za-z0-9_-]{16,128}$'
    )
    or p_republish is null
  then
    raise exception 'invalid competition publication input'
      using errcode = '22023';
  end if;

  -- Lock every active member that is date-eligible, including rank-null and
  -- profile-incomplete rows, in stable user order. A first-snapshot RPC can
  -- otherwise turn a rank-null row into an expected member between this scan
  -- and the marker lock. Keeping the wider revision set locked also prevents a
  -- newly expected member's ledger from changing after completeness is counted.
  for locked_user_id in
  select revision.user_id
  from public.community_competition_members as member
  join public.stock_trade_ledger_revisions as revision
    on revision.user_id = member.user_id
  where member.status = 'active'
    and member.eligible_after_snapshot_date < p_snapshot_date
  order by revision.user_id
  for update of revision
  loop
    locked_user_ids := array_append(locked_user_ids, locked_user_id);
  end loop;

  perform member.user_id
  from public.community_competition_members as member
  where member.status = 'active'
    and member.eligible_after_snapshot_date < p_snapshot_date
  order by member.user_id
  for update of member;

  -- Profile completion/nickname/avatar are also publication-cohort inputs.
  -- Lock every existing profile for the wider active/date-eligible set before
  -- dirty state and the marker, so a browser profile save cannot create a
  -- completeness phantom during this transaction.
  for locked_profile_id in
  select profile.user_id
  from public.community_profiles as profile
  join public.community_competition_members as member
    on member.user_id = profile.user_id
  where member.status = 'active'
    and member.eligible_after_snapshot_date < p_snapshot_date
  order by profile.user_id
  for update of profile
  loop
    locked_profile_ids := array_append(locked_profile_ids, locked_profile_id);
  end loop;

  perform dirty.user_id
  from public.community_competition_rebuild_state as dirty
  join public.community_competition_members as member
    on member.user_id = dirty.user_id
  where member.status = 'active'
    and member.eligible_after_snapshot_date < p_snapshot_date
  order by dirty.user_id
  for update of dirty;

  lock table public.snapshot_publication_markers in share row exclusive mode;

  select count(*)
  into expected_members_count
  from public.community_competition_members as member
  join public.community_profiles as profile
    on profile.user_id = member.user_id
  where member.status = 'active'
    and member.eligible_after_snapshot_date < p_snapshot_date
    and member.ranking_start_snapshot_date <= p_snapshot_date
    and member.ranking_baseline_return_pct is not null
    and profile.profile_completed_at is not null
    and btrim(profile.nickname) <> ''
    and btrim(profile.avatar_key) <> '';

  -- Inserts or privileged membership changes can still create a row after the
  -- initial scans because row locks do not provide a predicate lock at READ
  -- COMMITTED. Never publish when the current expected cohort contains an ID
  -- whose revision was not included in the stable pre-marker lock set.
  if exists (
    select 1
    from public.community_competition_members as member
    join public.community_profiles as profile
      on profile.user_id = member.user_id
    where member.status = 'active'
      and member.eligible_after_snapshot_date < p_snapshot_date
      and member.ranking_start_snapshot_date <= p_snapshot_date
      and member.ranking_baseline_return_pct is not null
      and profile.profile_completed_at is not null
      and btrim(profile.nickname) <> ''
      and btrim(profile.avatar_key) <> ''
      and (
        not (member.user_id = any(locked_user_ids))
        or not (profile.user_id = any(locked_profile_ids))
      )
  ) then
    return jsonb_build_object(
      'outcome', 'incomplete',
      'snapshotDate', p_snapshot_date,
      'version', null,
      'completedAt', null,
      'expectedMembers', expected_members_count,
      'completeSnapshots', 0,
      'reason', 'cohort_changed'
    );
  end if;

  select count(*)
  into complete_snapshots_count
  from public.community_competition_members as member
  join public.community_profiles as profile
    on profile.user_id = member.user_id
  join public.stock_trade_ledger_revisions as revision
    on revision.user_id = member.user_id
  join public.community_competition_snapshots as snapshot
    on snapshot.user_id = member.user_id
    and snapshot.snapshot_date = p_snapshot_date
  where member.status = 'active'
    and member.eligible_after_snapshot_date < p_snapshot_date
    and member.ranking_start_snapshot_date <= p_snapshot_date
    and member.ranking_baseline_return_pct is not null
    and profile.profile_completed_at is not null
    and btrim(profile.nickname) <> ''
    and btrim(profile.avatar_key) <> ''
    and snapshot.daily_return_pct is not null
    and snapshot.daily_return_pct >= -1
    and snapshot.cumulative_return_pct >= -1
    and snapshot.locked_at <= clock_timestamp()
    and snapshot.source_version = 'community_competition_snapshot_v1'
    and snapshot.ledger_hash ~ '^[0-9a-f]{64}$'
    and snapshot.ledger_revision = revision.revision
    and not exists (
      select 1
      from public.community_competition_rebuild_state as dirty
      where dirty.user_id = member.user_id
        and dirty.dirty_from_date <= p_snapshot_date
    );

  if complete_snapshots_count <> expected_members_count then
    return jsonb_build_object(
      'outcome', 'incomplete',
      'snapshotDate', p_snapshot_date,
      'version', null,
      'completedAt', null,
      'expectedMembers', expected_members_count,
      'completeSnapshots', complete_snapshots_count
    );
  end if;

  select max(snapshot_date)
  into latest_marker_date
  from public.snapshot_publication_markers
  where channel = 'competition';

  if latest_marker_date is not null and latest_marker_date > p_snapshot_date then
    return jsonb_build_object(
      'outcome', 'stale_publication',
      'snapshotDate', latest_marker_date,
      'version', null,
      'completedAt', null,
      'expectedMembers', expected_members_count,
      'completeSnapshots', complete_snapshots_count
    );
  end if;

  select *
  into existing_marker
  from public.snapshot_publication_markers
  where channel = 'competition'
    and snapshot_date = p_snapshot_date
  for update;

  if existing_marker.channel is not null then
    if not p_republish then
      return jsonb_build_object(
        'outcome', 'already_published',
        'snapshotDate', existing_marker.snapshot_date,
        'version', existing_marker.version,
        'completedAt', existing_marker.completed_at,
        'expectedMembers', expected_members_count,
        'completeSnapshots', complete_snapshots_count
      );
    end if;
    if p_expected_version is null
      or existing_marker.version is distinct from p_expected_version
      or p_new_version = existing_marker.version
    then
      return jsonb_build_object(
        'outcome', 'stale_publication',
        'snapshotDate', existing_marker.snapshot_date,
        'version', existing_marker.version,
        'completedAt', existing_marker.completed_at,
        'expectedMembers', expected_members_count,
        'completeSnapshots', complete_snapshots_count
      );
    end if;

    update public.snapshot_publication_markers
    set version = p_new_version,
        completed_at = clock_timestamp()
    where channel = 'competition'
      and snapshot_date = p_snapshot_date
      and version = p_expected_version
    returning completed_at into completed_at_value;
    outcome_value := 'republished';
  else
    if p_republish or p_expected_version is not null then
      return jsonb_build_object(
        'outcome', 'stale_publication',
        'snapshotDate', p_snapshot_date,
        'version', null,
        'completedAt', null,
        'expectedMembers', expected_members_count,
        'completeSnapshots', complete_snapshots_count
      );
    end if;

    insert into public.snapshot_publication_markers (
      channel,
      snapshot_date,
      version,
      completed_at
    )
    values (
      'competition',
      p_snapshot_date,
      p_new_version,
      clock_timestamp()
    )
    returning completed_at into completed_at_value;
    outcome_value := 'published';
  end if;

  return jsonb_build_object(
    'outcome', outcome_value,
    'snapshotDate', p_snapshot_date,
    'version', p_new_version,
    'completedAt', completed_at_value,
    'expectedMembers', expected_members_count,
    'completeSnapshots', complete_snapshots_count
  );
end;
$$;

revoke execute on function public.publish_community_competition_snapshot_marker(
  date, text, text, boolean
)
from public, anon, authenticated, service_role;

grant execute on function public.publish_community_competition_snapshot_marker(
  date, text, text, boolean
)
to service_role;

create or replace function public.replace_community_competition_member_snapshots(
  p_user_id uuid,
  p_operation_key text,
  p_expected_ledger_revision bigint,
  p_expected_dirty_from_date date,
  p_expected_eligible_after_snapshot_date date,
  p_expected_eligible_ledger_hash text,
  p_expected_eligible_ledger_revision bigint,
  p_expected_ranking_start_snapshot_date date,
  p_expected_ranking_baseline_return_pct numeric,
  p_expected_marker_snapshot_date date,
  p_expected_marker_version text,
  p_new_marker_version text,
  p_new_eligible_after_snapshot_date date,
  p_new_eligible_ledger_hash text,
  p_new_ranking_start_snapshot_date date,
  p_new_ranking_baseline_return_pct numeric,
  p_snapshots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_operation_key text;
  current_ledger_revision bigint;
  member_row public.community_competition_members%rowtype;
  dirty_row public.community_competition_rebuild_state%rowtype;
  marker_row public.snapshot_publication_markers%rowtype;
  latest_marker_row public.snapshot_publication_markers%rowtype;
  audit_row public.community_competition_rebuild_audit%rowtype;
  snapshot_row record;
  first_snapshot_date date;
  last_snapshot_date date;
  previous_snapshot_date date;
  earliest_existing_snapshot_date date;
  payload_count integer := 0;
  distinct_payload_count integer := 0;
  recovery_source_value text;
  completed_at_value timestamptz;
begin
  expected_operation_key := format(
    'competition-ledger-rebuild:%s:%s:%s',
    p_user_id::text,
    p_expected_ledger_revision::text,
    p_expected_marker_snapshot_date::text
  );

  if p_user_id is null
    or p_operation_key is null
    or p_operation_key is distinct from expected_operation_key
    or p_expected_ledger_revision is null
    or p_expected_ledger_revision < 0
    or p_expected_dirty_from_date is null
    or p_expected_eligible_after_snapshot_date is null
    or p_expected_eligible_ledger_revision is null
    or p_expected_eligible_ledger_revision < 0
    or (
      (p_expected_ranking_start_snapshot_date is null)
      <> (p_expected_ranking_baseline_return_pct is null)
    )
    or p_expected_marker_snapshot_date is null
    or p_expected_marker_version is null
    or p_expected_marker_version !~ '^[A-Za-z0-9_-]{16,128}$'
    or (
      p_new_marker_version is not null
      and p_new_marker_version !~ '^[A-Za-z0-9_-]{16,128}$'
    )
    or p_new_eligible_after_snapshot_date is null
    or p_new_eligible_after_snapshot_date > p_expected_eligible_after_snapshot_date
    or p_new_eligible_ledger_hash is null
    or p_new_eligible_ledger_hash !~ '^[0-9a-f]{64}$'
    or (
      (p_new_ranking_start_snapshot_date is null)
      <> (p_new_ranking_baseline_return_pct is null)
    )
    or (
      p_new_ranking_start_snapshot_date is not null
      and (
        p_new_ranking_baseline_return_pct < -1
        or p_new_ranking_start_snapshot_date <= p_new_eligible_after_snapshot_date
      )
    )
    or jsonb_typeof(p_snapshots) is distinct from 'array'
    or (
      jsonb_array_length(p_snapshots) > 0
      and (
        p_new_marker_version is null
        or p_new_marker_version = p_expected_marker_version
      )
    )
  then
    raise exception 'invalid community competition rebuild input'
      using errcode = '22023';
  end if;

  -- Global lock order shared with snapshot INSERT and ledger writers:
  -- ledger revision -> member -> dirty state -> publication marker.
  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  if not found
    or current_ledger_revision is distinct from p_expected_ledger_revision
  then
    return jsonb_build_object(
      'outcome', 'stale_ledger',
      'snapshotDate', null,
      'version', null,
      'completedAt', null,
      'replacedSnapshots', 0
    );
  end if;

  select *
  into member_row
  from public.community_competition_members
  where user_id = p_user_id
  for update;

  if not found or member_row.status <> 'active' then
    return jsonb_build_object(
      'outcome', 'not_joined',
      'snapshotDate', null,
      'version', null,
      'completedAt', null,
      'replacedSnapshots', 0
    );
  end if;

  select *
  into dirty_row
  from public.community_competition_rebuild_state
  where user_id = p_user_id
  for update;

  -- Block concurrent marker insert/update operations while the exact expected
  -- publication is checked and rotated. This lock is deliberately acquired
  -- after revision, member, and dirty-state row locks.
  lock table public.snapshot_publication_markers in share row exclusive mode;

  select *
  into latest_marker_row
  from public.snapshot_publication_markers
  where channel = 'competition'
  order by snapshot_date desc
  limit 1
  for update;

  select *
  into audit_row
  from public.community_competition_rebuild_audit
  where operation_key = p_operation_key;

  if audit_row.operation_key is not null then
    if audit_row.user_id = p_user_id
      and audit_row.ledger_revision = p_expected_ledger_revision
      and audit_row.dirty_from_date = p_expected_dirty_from_date
      and audit_row.old_eligible_after_snapshot_date
        = p_expected_eligible_after_snapshot_date
      and audit_row.old_eligible_ledger_hash
        is not distinct from p_expected_eligible_ledger_hash
      and audit_row.old_eligible_ledger_revision
        = p_expected_eligible_ledger_revision
      and audit_row.old_ranking_start_snapshot_date
        is not distinct from p_expected_ranking_start_snapshot_date
      and audit_row.old_ranking_baseline_return_pct
        is not distinct from p_expected_ranking_baseline_return_pct
      and audit_row.new_eligible_after_snapshot_date
        = p_new_eligible_after_snapshot_date
      and audit_row.new_eligible_ledger_hash = p_new_eligible_ledger_hash
      and audit_row.new_ranking_start_snapshot_date
        is not distinct from p_new_ranking_start_snapshot_date
      and audit_row.new_ranking_baseline_return_pct
        is not distinct from p_new_ranking_baseline_return_pct
      and audit_row.snapshot_date = p_expected_marker_snapshot_date
      and audit_row.old_marker_version = p_expected_marker_version
      and (
        (
          audit_row.outcome = 'recalculated'
          and audit_row.new_marker_version = p_new_marker_version
        )
        or (
          audit_row.outcome = 'waiting_snapshot'
          and jsonb_array_length(p_snapshots) = 0
        )
      )
    then
      if audit_row.outcome = 'waiting_snapshot' then
        return jsonb_build_object(
          'outcome', 'waiting_snapshot',
          'snapshotDate', null,
          'version', null,
          'completedAt', null,
          'replacedSnapshots', 0
        );
      end if;
      return jsonb_build_object(
        'outcome', 'already_current',
        'snapshotDate', latest_marker_row.snapshot_date,
        'version', latest_marker_row.version,
        'completedAt', latest_marker_row.completed_at,
        'replacedSnapshots', audit_row.replaced_snapshot_count
      );
    end if;
    return jsonb_build_object(
      'outcome', 'stale_member',
      'snapshotDate', null,
      'version', null,
      'completedAt', null,
      'replacedSnapshots', 0
    );
  end if;

  if member_row.eligible_after_snapshot_date
      is distinct from p_expected_eligible_after_snapshot_date
    or member_row.eligible_ledger_hash
      is distinct from p_expected_eligible_ledger_hash
    or member_row.eligible_ledger_revision
      is distinct from p_expected_eligible_ledger_revision
    or member_row.ranking_start_snapshot_date
      is distinct from p_expected_ranking_start_snapshot_date
    or member_row.ranking_baseline_return_pct
      is distinct from p_expected_ranking_baseline_return_pct
  then
    return jsonb_build_object(
      'outcome', 'stale_member',
      'snapshotDate', null,
      'version', null,
      'completedAt', null,
      'replacedSnapshots', 0
    );
  end if;

  if dirty_row.user_id is null
    or dirty_row.ledger_revision is distinct from p_expected_ledger_revision
    or dirty_row.dirty_from_date is distinct from p_expected_dirty_from_date
  then
    return jsonb_build_object(
      'outcome', 'stale_ledger',
      'snapshotDate', null,
      'version', null,
      'completedAt', null,
      'replacedSnapshots', 0
    );
  end if;

  marker_row := latest_marker_row;
  if marker_row.channel is distinct from 'competition'
    or marker_row.snapshot_date is distinct from p_expected_marker_snapshot_date
    or marker_row.version is distinct from p_expected_marker_version
  then
    return jsonb_build_object(
      'outcome', 'stale_publication',
      'snapshotDate', marker_row.snapshot_date,
      'version', marker_row.version,
      'completedAt', marker_row.completed_at,
      'replacedSnapshots', 0
    );
  end if;

  -- A genuine first-join member has no prior ranking interval to rebuild.
  -- Advance only its opaque eligibility hash/revision, clear the consumed dirty
  -- state, and keep both snapshots and the global publication untouched.
  if p_expected_ranking_start_snapshot_date is null
    and p_new_ranking_start_snapshot_date is null
    and jsonb_array_length(p_snapshots) = 0
  then
    if p_new_eligible_after_snapshot_date
        is distinct from p_expected_eligible_after_snapshot_date
      or exists (
        select 1
        from public.community_competition_snapshots
        where user_id = p_user_id
      )
    then
      return jsonb_build_object(
        'outcome', 'stale_member',
        'snapshotDate', null,
        'version', null,
        'completedAt', null,
        'replacedSnapshots', 0
      );
    end if;

    update public.community_competition_members
    set eligible_ledger_hash = p_new_eligible_ledger_hash,
        eligible_ledger_revision = p_expected_ledger_revision,
        updated_at = clock_timestamp()
    where user_id = p_user_id;

    delete from public.community_competition_rebuild_state
    where user_id = p_user_id
      and ledger_revision = p_expected_ledger_revision
      and dirty_from_date = p_expected_dirty_from_date;

    if not found then
      raise exception 'community competition rebuild dirty state changed concurrently'
        using errcode = '40001';
    end if;

    insert into public.community_competition_rebuild_audit (
      operation_key,
      user_id,
      ledger_revision,
      dirty_from_date,
      old_eligible_after_snapshot_date,
      new_eligible_after_snapshot_date,
      old_eligible_ledger_hash,
      new_eligible_ledger_hash,
      old_eligible_ledger_revision,
      new_eligible_ledger_revision,
      old_ranking_start_snapshot_date,
      new_ranking_start_snapshot_date,
      old_ranking_baseline_return_pct,
      new_ranking_baseline_return_pct,
      snapshot_date,
      old_marker_version,
      new_marker_version,
      replaced_snapshot_count,
      outcome,
      recovery_source
    )
    values (
      p_operation_key,
      p_user_id,
      p_expected_ledger_revision,
      p_expected_dirty_from_date,
      member_row.eligible_after_snapshot_date,
      p_new_eligible_after_snapshot_date,
      member_row.eligible_ledger_hash,
      p_new_eligible_ledger_hash,
      member_row.eligible_ledger_revision,
      p_expected_ledger_revision,
      member_row.ranking_start_snapshot_date,
      null,
      member_row.ranking_baseline_return_pct,
      null,
      p_expected_marker_snapshot_date,
      p_expected_marker_version,
      null,
      0,
      'waiting_snapshot',
      'waiting_for_first_snapshot'
    );

    return jsonb_build_object(
      'outcome', 'waiting_snapshot',
      'snapshotDate', null,
      'version', null,
      'completedAt', null,
      'replacedSnapshots', 0
    );
  end if;

  if p_expected_ranking_start_snapshot_date is not null then
    if p_new_eligible_after_snapshot_date
        is distinct from p_expected_eligible_after_snapshot_date
      or p_new_ranking_start_snapshot_date
        is distinct from p_expected_ranking_start_snapshot_date
      or p_new_ranking_baseline_return_pct
        is distinct from p_expected_ranking_baseline_return_pct
    then
      return jsonb_build_object(
        'outcome', 'stale_member',
        'snapshotDate', null,
        'version', null,
        'completedAt', null,
        'replacedSnapshots', 0
      );
    end if;
    recovery_source_value := 'ranking_unchanged';
  else
    -- Restore a v403 pending member's original ranking interval. Prefer the
    -- immutable reset audit; only fall back to the earliest existing snapshot
    -- when no historical reset audit can prove the prior pair.
    if exists (
      select 1
      from public.community_competition_epoch_resets as reset
      where reset.user_id = p_user_id
        and reset.old_eligible_after_snapshot_date
          = p_new_eligible_after_snapshot_date
        and reset.old_ranking_start_snapshot_date
          = p_new_ranking_start_snapshot_date
        and reset.old_ranking_baseline_return_pct
          = p_new_ranking_baseline_return_pct
    ) then
      recovery_source_value := 'epoch_reset_audit';
    elsif exists (
      select 1
      from public.community_competition_rebaseline_audit as rebaseline
      where rebaseline.user_id = p_user_id
        and rebaseline.old_eligible_after_snapshot_date
          = p_new_eligible_after_snapshot_date
        and rebaseline.old_ranking_start_snapshot_date
          = p_new_ranking_start_snapshot_date
        and rebaseline.old_ranking_baseline_return_pct
          = p_new_ranking_baseline_return_pct
    ) then
      recovery_source_value := 'ranked_rebaseline_audit';
    else
      select min(snapshot_date)
      into earliest_existing_snapshot_date
      from public.community_competition_snapshots
      where user_id = p_user_id
        and locked_at is not null;

      if earliest_existing_snapshot_date is null then
        return jsonb_build_object(
          'outcome', 'waiting_snapshot',
          'snapshotDate', marker_row.snapshot_date,
          'version', marker_row.version,
          'completedAt', marker_row.completed_at,
          'replacedSnapshots', 0
        );
      end if;
      if p_new_ranking_start_snapshot_date
          is distinct from earliest_existing_snapshot_date
        or p_new_ranking_baseline_return_pct <> 0
      then
        return jsonb_build_object(
          'outcome', 'stale_member',
          'snapshotDate', null,
          'version', null,
          'completedAt', null,
          'replacedSnapshots', 0
        );
      end if;
      recovery_source_value := 'earliest_snapshot_fallback';
    end if;
  end if;

  if p_new_ranking_start_snapshot_date > p_expected_marker_snapshot_date then
    return jsonb_build_object(
      'outcome', 'waiting_snapshot',
      'snapshotDate', marker_row.snapshot_date,
      'version', marker_row.version,
      'completedAt', marker_row.completed_at,
      'replacedSnapshots', 0
    );
  end if;

  select count(*), count(distinct (item ->> 'snapshot_date'))
  into payload_count, distinct_payload_count
  from jsonb_array_elements(p_snapshots) as payload(item);

  if payload_count <> distinct_payload_count then
    raise exception 'community competition rebuild snapshots contain duplicate dates'
      using errcode = '22023';
  end if;

  for snapshot_row in
    select *
    from jsonb_to_recordset(p_snapshots) as payload(
      snapshot_date date,
      daily_return_pct numeric,
      cumulative_return_pct numeric,
      locked_at timestamptz,
      ledger_hash text,
      ledger_revision bigint,
      source_version text
    )
    order by snapshot_date asc
  loop
    if snapshot_row.snapshot_date is null
      or snapshot_row.daily_return_pct is null
      or snapshot_row.daily_return_pct < -1
      or snapshot_row.cumulative_return_pct is null
      or snapshot_row.cumulative_return_pct < -1
      or snapshot_row.locked_at is null
      or snapshot_row.locked_at > clock_timestamp()
      or snapshot_row.ledger_hash is null
      or snapshot_row.ledger_hash !~ '^[0-9a-f]{64}$'
      or snapshot_row.ledger_revision
        is distinct from p_expected_ledger_revision
      or snapshot_row.source_version
        is distinct from 'community_competition_snapshot_v1'
      or snapshot_row.snapshot_date <= p_new_eligible_after_snapshot_date
      or snapshot_row.snapshot_date > p_expected_marker_snapshot_date
      or (
        previous_snapshot_date is not null
        and snapshot_row.snapshot_date <= previous_snapshot_date
      )
    then
      raise exception 'invalid community competition rebuild snapshot row'
        using errcode = '22023';
    end if;
    if first_snapshot_date is null then
      first_snapshot_date := snapshot_row.snapshot_date;
    end if;
    last_snapshot_date := snapshot_row.snapshot_date;
    previous_snapshot_date := snapshot_row.snapshot_date;
  end loop;

  if payload_count = 0
    or first_snapshot_date
      is distinct from p_new_ranking_start_snapshot_date
    or last_snapshot_date
      is distinct from p_expected_marker_snapshot_date
  then
    raise exception 'community competition rebuild snapshot range is incomplete'
      using errcode = '22023';
  end if;

  -- The member and revision rows stay locked across delete/insert/update. Any
  -- exception below aborts the entire RPC transaction, preserving old
  -- snapshots, membership, dirty state, audit, and marker together.
  -- Restore a v403 pending member's earlier eligibility before reinserting its
  -- original ranking interval; the INSERT guard reads this same locked row.
  update public.community_competition_members
  set eligible_after_snapshot_date = p_new_eligible_after_snapshot_date,
      eligible_ledger_hash = p_new_eligible_ledger_hash,
      eligible_ledger_revision = p_expected_ledger_revision,
      ranking_start_snapshot_date = p_new_ranking_start_snapshot_date,
      ranking_baseline_return_pct = p_new_ranking_baseline_return_pct,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  delete from public.community_competition_snapshots
  where user_id = p_user_id
    and snapshot_date >= p_new_ranking_start_snapshot_date;

  insert into public.community_competition_snapshots (
    user_id,
    snapshot_date,
    daily_return_pct,
    cumulative_return_pct,
    locked_at,
    ledger_hash,
    ledger_revision,
    source_version,
    created_at,
    updated_at
  )
  select
    p_user_id,
    payload.snapshot_date,
    payload.daily_return_pct,
    payload.cumulative_return_pct,
    payload.locked_at,
    payload.ledger_hash,
    payload.ledger_revision,
    payload.source_version,
    payload.locked_at,
    payload.locked_at
  from jsonb_to_recordset(p_snapshots) as payload(
    snapshot_date date,
    daily_return_pct numeric,
    cumulative_return_pct numeric,
    locked_at timestamptz,
    ledger_hash text,
    ledger_revision bigint,
    source_version text
  )
  order by payload.snapshot_date asc;

  delete from public.community_competition_rebuild_state
  where user_id = p_user_id
    and ledger_revision = p_expected_ledger_revision
    and dirty_from_date = p_expected_dirty_from_date;

  if not found then
    raise exception 'community competition rebuild dirty state changed concurrently'
      using errcode = '40001';
  end if;

  insert into public.community_competition_rebuild_audit (
    operation_key,
    user_id,
    ledger_revision,
    dirty_from_date,
    old_eligible_after_snapshot_date,
    new_eligible_after_snapshot_date,
    old_eligible_ledger_hash,
    new_eligible_ledger_hash,
    old_eligible_ledger_revision,
    new_eligible_ledger_revision,
    old_ranking_start_snapshot_date,
    new_ranking_start_snapshot_date,
    old_ranking_baseline_return_pct,
    new_ranking_baseline_return_pct,
    snapshot_date,
    old_marker_version,
    new_marker_version,
    replaced_snapshot_count,
    outcome,
    recovery_source
  )
  values (
    p_operation_key,
    p_user_id,
    p_expected_ledger_revision,
    p_expected_dirty_from_date,
    member_row.eligible_after_snapshot_date,
    p_new_eligible_after_snapshot_date,
    member_row.eligible_ledger_hash,
    p_new_eligible_ledger_hash,
    member_row.eligible_ledger_revision,
    p_expected_ledger_revision,
    member_row.ranking_start_snapshot_date,
    p_new_ranking_start_snapshot_date,
    member_row.ranking_baseline_return_pct,
    p_new_ranking_baseline_return_pct,
    p_expected_marker_snapshot_date,
    p_expected_marker_version,
    p_new_marker_version,
    payload_count,
    'recalculated',
    recovery_source_value
  );

  update public.snapshot_publication_markers
  set version = p_new_marker_version,
      completed_at = clock_timestamp()
  where channel = 'competition'
    and snapshot_date = p_expected_marker_snapshot_date
    and version = p_expected_marker_version
  returning completed_at into completed_at_value;

  if not found then
    raise exception 'community competition publication changed concurrently'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'outcome', 'recalculated',
    'snapshotDate', p_expected_marker_snapshot_date,
    'version', p_new_marker_version,
    'completedAt', completed_at_value,
    'replacedSnapshots', payload_count
  );
end;
$$;

revoke execute on function public.replace_community_competition_member_snapshots(
  uuid, text, bigint, date, date, text, bigint, date, numeric,
  date, text, text, date, text, date, numeric, jsonb
)
from public, anon, authenticated, service_role;

grant execute on function public.replace_community_competition_member_snapshots(
  uuid, text, bigint, date, date, text, bigint, date, numeric,
  date, text, text, date, text, date, numeric, jsonb
)
to service_role;

-- Marker writes must pass the in-transaction cohort revision/dirty gate above.
-- service_role retains read access for status endpoints but cannot bypass the
-- publication RPC with a direct REST insert or update.
revoke insert, update
on table public.snapshot_publication_markers
from service_role;

grant select
on table public.snapshot_publication_markers
to service_role;

notify pgrst, 'reload schema';

commit;
