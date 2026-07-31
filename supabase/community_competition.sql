-- Privacy-safe storage for the voluntary community return competition.
-- Membership is written only by authenticated server endpoints using service_role.
-- Competition snapshots contain percentages plus a one-way ledger integrity hash only;
-- no assets, P&L amounts, holdings, symbols, trades, email addresses, or portfolio fields.

begin;

alter table public.community_profiles
add column if not exists profile_completed_at timestamptz;

create table if not exists public.community_competition_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  eligible_after_snapshot_date date not null,
  eligible_ledger_hash text,
  eligible_ledger_revision bigint not null default 0,
  ranking_start_snapshot_date date,
  ranking_baseline_return_pct numeric(18, 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_competition_members_status_check
    check (status in ('active', 'withdrawn')),
  constraint community_competition_members_eligible_ledger_hash_check
    check (eligible_ledger_hash is null or eligible_ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint community_competition_members_eligible_ledger_revision_check
    check (eligible_ledger_revision >= 0),
  constraint community_competition_members_ranking_baseline_pair_check
    check (
      (
        ranking_start_snapshot_date is null
        and ranking_baseline_return_pct is null
      )
      or
      (
        ranking_start_snapshot_date is not null
        and ranking_baseline_return_pct is not null
        and ranking_start_snapshot_date > eligible_after_snapshot_date
      )
    )
);

-- Incremental migration: this file may be rerun after the initial competition rollout.
alter table public.community_competition_members
add column if not exists eligible_ledger_hash text;

alter table public.community_competition_members
add column if not exists eligible_ledger_revision bigint;

-- Every member, including an empty-ledger member, owns a lockable revision row.
insert into public.stock_trade_ledger_revisions (
  user_id,
  revision,
  last_mutated_at
)
select user_id, 0, null
from public.community_competition_members
on conflict (user_id) do nothing;

update public.community_competition_members as member
set eligible_ledger_revision = revision.revision
from public.stock_trade_ledger_revisions as revision
where member.user_id = revision.user_id
  and member.eligible_ledger_revision is null;

alter table public.community_competition_members
alter column eligible_ledger_revision set default 0;

alter table public.community_competition_members
alter column eligible_ledger_revision set not null;

alter table public.community_competition_members
drop constraint if exists community_competition_members_eligible_ledger_hash_check;

alter table public.community_competition_members
add constraint community_competition_members_eligible_ledger_hash_check
check (eligible_ledger_hash is null or eligible_ledger_hash ~ '^[0-9a-f]{64}$');

alter table public.community_competition_members
drop constraint if exists community_competition_members_eligible_ledger_revision_check;

alter table public.community_competition_members
add constraint community_competition_members_eligible_ledger_revision_check
check (eligible_ledger_revision >= 0);

create or replace function public.guard_community_competition_member_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_ledger_revision bigint;
begin
  -- Empty-ledger members need a lockable zero revision row. If a concurrent
  -- stock_trades writer wins first, its nonzero revision makes this CAS fail.
  insert into public.stock_trade_ledger_revisions (
    user_id,
    revision,
    last_mutated_at
  )
  values (new.user_id, 0, null)
  on conflict (user_id) do nothing;

  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = new.user_id
  for update;

  if new.eligible_ledger_revision is distinct from current_ledger_revision then
    raise exception 'stale stock trade ledger revision'
      using errcode = '40001';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_community_competition_member_insert()
from public, anon, authenticated;

drop trigger if exists community_competition_members_guard_insert
on public.community_competition_members;

create trigger community_competition_members_guard_insert
before insert on public.community_competition_members
for each row
execute function public.guard_community_competition_member_insert();


create index if not exists community_competition_members_status_joined_idx
on public.community_competition_members (status, joined_at);

create table if not exists public.community_competition_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  daily_return_pct numeric(18, 10),
  cumulative_return_pct numeric(18, 10) not null,
  locked_at timestamptz not null,
  ledger_hash text not null,
  ledger_revision bigint not null,
  source_version text not null default 'community_competition_snapshot_v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_competition_snapshots_daily_return_check
    check (daily_return_pct is null or daily_return_pct >= -1),
  constraint community_competition_snapshots_cumulative_return_check
    check (cumulative_return_pct >= -1),
  constraint community_competition_snapshots_ledger_hash_check
    check (ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint community_competition_snapshots_ledger_revision_check
    check (ledger_revision >= 0),
  constraint community_competition_snapshots_source_version_check
    check (source_version = 'community_competition_snapshot_v1'),
  unique (user_id, snapshot_date)
);

-- Historical snapshots predate the authoritative revision sequence. Zero is a
-- truthful legacy sentinel; all new inserts must CAS the user's current row.
alter table public.community_competition_snapshots
add column if not exists ledger_revision bigint;

update public.community_competition_snapshots
set ledger_revision = 0
where ledger_revision is null;

alter table public.community_competition_snapshots
alter column ledger_revision set not null;

alter table public.community_competition_snapshots
drop constraint if exists community_competition_snapshots_ledger_revision_check;

alter table public.community_competition_snapshots
add constraint community_competition_snapshots_ledger_revision_check
check (ledger_revision >= 0);

create index if not exists community_competition_snapshots_date_user_idx
on public.community_competition_snapshots (snapshot_date desc, user_id);

create index if not exists community_competition_snapshots_user_date_idx
on public.community_competition_snapshots (user_id, snapshot_date desc);

-- Serialize a first competition snapshot against an eligibility rebaseline.
-- The row lock makes the two operations mutually exclusive; the date check
-- prevents a stale worker from inserting a snapshot on the newly rebased day.
create or replace function public.guard_community_competition_snapshot_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_ledger_revision bigint;
  member_eligible_after date;
begin
  -- All competition writers lock the revision row before the member row. A
  -- concurrent stock_trades mutation must commit before this CAS or wait until
  -- after the immutable snapshot has been accepted.
  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = new.user_id
  for update;

  if not found then
    raise exception 'stock trade ledger revision is required'
      using errcode = '23514';
  end if;

  select eligible_after_snapshot_date
  into member_eligible_after
  from public.community_competition_members
  where user_id = new.user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'active competition membership is required'
      using errcode = '23514';
  end if;

  if new.snapshot_date <= member_eligible_after then
    raise exception 'competition snapshot must follow eligibility baseline'
      using errcode = '23514';
  end if;

  if new.ledger_revision is distinct from current_ledger_revision then
    raise exception 'stale stock trade ledger revision'
      using errcode = '40001';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_community_competition_snapshot_insert()
from public, anon, authenticated;

drop trigger if exists community_competition_snapshots_guard_insert
on public.community_competition_snapshots;

create trigger community_competition_snapshots_guard_insert
before insert on public.community_competition_snapshots
for each row
execute function public.guard_community_competition_snapshot_insert();

-- Join/rejoin is a compare-and-set operation over the exact ledger revision
-- that the server hashed. The definer may create the otherwise service-read-
-- only zero row for a new user; callers never receive ledger contents.
create or replace function public.join_community_competition_member(
  p_user_id uuid,
  p_expected_ledger_revision bigint,
  p_eligible_after_snapshot_date date,
  p_eligible_ledger_hash text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_ledger_revision bigint;
  member_row public.community_competition_members%rowtype;
  member_exists boolean;
begin
  if p_user_id is null then
    return 'invalid_input';
  end if;
  if p_expected_ledger_revision is null
    or p_expected_ledger_revision < 0
    or p_eligible_after_snapshot_date is null
    or p_eligible_ledger_hash is null
    or p_eligible_ledger_hash !~ '^[0-9a-f]{64}$'
  then
    return 'invalid_ledger_state';
  end if;
  if not exists (
    select 1
    from auth.users
    where id = p_user_id
  ) then
    return 'invalid_input';
  end if;
  if not exists (
    select 1
    from public.community_profiles
    where user_id = p_user_id
      and profile_completed_at is not null
      and btrim(nickname) <> ''
      and btrim(avatar_key) <> ''
  ) then
    return 'profile_required';
  end if;

  insert into public.stock_trade_ledger_revisions (
    user_id,
    revision,
    last_mutated_at
  )
  values (p_user_id, 0, null)
  on conflict (user_id) do nothing;

  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  select *
  into member_row
  from public.community_competition_members
  where user_id = p_user_id
  for update;
  member_exists := found;

  if member_exists and member_row.status = 'active' then
    return 'already_active';
  end if;
  if current_ledger_revision is distinct from p_expected_ledger_revision then
    return 'stale_ledger';
  end if;
  if member_exists and (
    member_row.ranking_start_snapshot_date is not null
    or member_row.ranking_baseline_return_pct is not null
    or exists (
      select 1
      from public.community_competition_snapshots
      where user_id = p_user_id
    )
  ) then
    return 'member_conflict';
  end if;

  insert into public.community_competition_members (
    user_id,
    status,
    joined_at,
    eligible_after_snapshot_date,
    eligible_ledger_hash,
    eligible_ledger_revision,
    ranking_start_snapshot_date,
    ranking_baseline_return_pct,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    'active',
    clock_timestamp(),
    p_eligible_after_snapshot_date,
    p_eligible_ledger_hash,
    current_ledger_revision,
    null,
    null,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (user_id) do update
  set status = 'active',
      joined_at = excluded.joined_at,
      eligible_after_snapshot_date = excluded.eligible_after_snapshot_date,
      eligible_ledger_hash = excluded.eligible_ledger_hash,
      eligible_ledger_revision = excluded.eligible_ledger_revision,
      ranking_start_snapshot_date = null,
      ranking_baseline_return_pct = null,
      updated_at = clock_timestamp();

  return 'joined';
end;
$$;

revoke execute on function public.join_community_competition_member(
  uuid, bigint, date, text
)
from public, anon, authenticated;

grant execute on function public.join_community_competition_member(
  uuid, bigint, date, text
)
to service_role;

-- A member may receive a new forward-only eligibility baseline only before any
-- official competition snapshot exists. Expected values provide compare-and-set
-- protection for overlapping Cron retries. The function exposes no ledger data.
drop function if exists public.rebaseline_community_competition_member(
  uuid, date, text, date, text
);

create or replace function public.rebaseline_community_competition_member(
  p_user_id uuid,
  p_expected_eligible_after_snapshot_date date,
  p_expected_eligible_ledger_hash text,
  p_expected_eligible_ledger_revision bigint,
  p_expected_current_ledger_revision bigint,
  p_new_eligible_after_snapshot_date date,
  p_new_eligible_ledger_hash text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_ledger_revision bigint;
  member_row public.community_competition_members%rowtype;
begin
  if p_user_id is null
    or p_expected_eligible_ledger_revision is null
    or p_expected_eligible_ledger_revision < 0
    or p_expected_current_ledger_revision is null
    or p_expected_current_ledger_revision < 0
    or p_new_eligible_after_snapshot_date is null
    or p_new_eligible_ledger_hash is null
    or p_new_eligible_ledger_hash !~ '^[0-9a-f]{64}$'
  then
    return 'invalid_input';
  end if;

  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  if not found then
    return 'revision_missing';
  end if;

  select *
  into member_row
  from public.community_competition_members
  where user_id = p_user_id
  for update;

  if not found then
    return 'member_missing';
  end if;
  if member_row.status <> 'active' then
    return 'not_active';
  end if;
  if member_row.ranking_start_snapshot_date is not null
    or member_row.ranking_baseline_return_pct is not null
  then
    return 'ranking_started';
  end if;
  if exists (
    select 1
    from public.community_competition_snapshots
    where user_id = p_user_id
  ) then
    return 'snapshot_exists';
  end if;
  if current_ledger_revision
      is distinct from p_expected_current_ledger_revision
  then
    return 'stale_ledger';
  end if;
  if member_row.eligible_after_snapshot_date
      is distinct from p_expected_eligible_after_snapshot_date
    or member_row.eligible_ledger_hash
      is distinct from p_expected_eligible_ledger_hash
    or member_row.eligible_ledger_revision
      is distinct from p_expected_eligible_ledger_revision
  then
    return 'stale_member';
  end if;
  if p_new_eligible_after_snapshot_date <= member_row.eligible_after_snapshot_date then
    return 'date_regression';
  end if;

  update public.community_competition_members
  set eligible_after_snapshot_date = p_new_eligible_after_snapshot_date,
      eligible_ledger_hash = p_new_eligible_ledger_hash,
      eligible_ledger_revision = current_ledger_revision,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  return 'rebaselined';
end;
$$;

revoke execute on function public.rebaseline_community_competition_member(
  uuid, date, text, bigint, bigint, date, text
)
from public, anon, authenticated;

grant execute on function public.rebaseline_community_competition_member(
  uuid, date, text, bigint, bigint, date, text
)
to service_role;

create table if not exists public.community_competition_rebaseline_audit (
  operation_key text primary key,
  user_id uuid not null,
  old_eligible_after_snapshot_date date not null,
  new_eligible_after_snapshot_date date not null,
  old_eligible_ledger_hash text,
  new_eligible_ledger_hash text not null,
  old_eligible_ledger_revision bigint not null,
  new_eligible_ledger_revision bigint not null,
  old_ranking_start_snapshot_date date not null,
  old_ranking_baseline_return_pct numeric(18, 10) not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint community_competition_rebaseline_audit_old_hash_check
    check (
      old_eligible_ledger_hash is null
      or old_eligible_ledger_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint community_competition_rebaseline_audit_new_hash_check
    check (new_eligible_ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint community_competition_rebaseline_audit_revision_check
    check (
      old_eligible_ledger_revision >= 0
      and new_eligible_ledger_revision >= 0
    ),
  constraint community_competition_rebaseline_audit_incident_date_check
    check (new_eligible_after_snapshot_date = date '2026-07-30'),
  constraint community_competition_rebaseline_audit_reason_check
    check (reason = 'legacy_shanghai_new_york_trade_date_mismatch_2026-07-30')
);

alter table public.community_competition_rebaseline_audit enable row level security;
alter table public.community_competition_rebaseline_audit force row level security;

revoke all privileges on table public.community_competition_rebaseline_audit
from public, anon, authenticated, service_role;

grant select
on table public.community_competition_rebaseline_audit
to service_role;

create or replace function public.guard_community_competition_rebaseline_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'community competition rebaseline audit rows are immutable'
    using errcode = '55000';
end;
$$;

revoke execute on function public.guard_community_competition_rebaseline_audit_immutable()
from public, anon, authenticated;

drop trigger if exists community_competition_rebaseline_audit_immutable
on public.community_competition_rebaseline_audit;

create trigger community_competition_rebaseline_audit_immutable
before update or delete on public.community_competition_rebaseline_audit
for each row
execute function public.guard_community_competition_rebaseline_audit_immutable();

create or replace function public.forward_rebaseline_ranked_community_competition_member(
  p_user_id uuid,
  p_expected_eligible_after_snapshot_date date,
  p_expected_eligible_ledger_hash text,
  p_expected_eligible_ledger_revision bigint,
  p_expected_ranking_start_snapshot_date date,
  p_expected_ranking_baseline_return_pct numeric,
  p_expected_current_ledger_revision bigint,
  p_new_eligible_after_snapshot_date date,
  p_new_eligible_ledger_hash text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  incident_date constant date := date '2026-07-30';
  incident_prior_new_york_date constant date := date '2026-07-29';
  incident_close constant timestamptz :=
    make_timestamptz(2026, 7, 30, 16, 0, 0, 'America/New_York');
  incident_reason constant text :=
    'legacy_shanghai_new_york_trade_date_mismatch_2026-07-30';
  operation_key_value text :=
    format('ranked-forward-rebaseline:2026-07-30:%s', p_user_id::text);
  current_ledger_revision bigint;
  current_ledger_last_mutated_at timestamptz;
  member_row public.community_competition_members%rowtype;
begin
  if p_user_id is null
    or p_expected_eligible_ledger_revision is null
    or p_expected_eligible_ledger_revision < 0
    or p_expected_ranking_start_snapshot_date is null
    or p_expected_ranking_baseline_return_pct is null
    or p_expected_current_ledger_revision is null
    or p_expected_current_ledger_revision < 0
    or p_new_eligible_after_snapshot_date is distinct from incident_date
    or p_new_eligible_ledger_hash is null
    or p_new_eligible_ledger_hash !~ '^[0-9a-f]{64}$'
  then
    return 'invalid_input';
  end if;

  -- Match the snapshot INSERT trigger lock order: revision, then membership.
  select revision, last_mutated_at
  into current_ledger_revision, current_ledger_last_mutated_at
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  if not found then
    return 'revision_missing';
  end if;

  select *
  into member_row
  from public.community_competition_members
  where user_id = p_user_id
  for update;

  if not found then
    return 'member_missing';
  end if;
  if member_row.status <> 'active' then
    return 'not_active';
  end if;
  if current_ledger_revision is distinct from p_expected_current_ledger_revision then
    return 'stale_ledger';
  end if;

  -- A retry whose first response was lost is accepted only when the immutable
  -- audit record proves that this exact one-time repair already committed.
  if member_row.eligible_after_snapshot_date = incident_date
    and member_row.eligible_ledger_hash = p_new_eligible_ledger_hash
    and member_row.eligible_ledger_revision = current_ledger_revision
    and member_row.ranking_start_snapshot_date is null
    and member_row.ranking_baseline_return_pct is null
  then
    if exists (
      select 1
      from public.community_competition_rebaseline_audit as audit
      where audit.operation_key = operation_key_value
        and audit.user_id = p_user_id
        and audit.old_eligible_after_snapshot_date
          = p_expected_eligible_after_snapshot_date
        and audit.new_eligible_after_snapshot_date = incident_date
        and audit.old_eligible_ledger_hash
          is not distinct from p_expected_eligible_ledger_hash
        and audit.new_eligible_ledger_hash = p_new_eligible_ledger_hash
        and audit.old_eligible_ledger_revision
          = p_expected_eligible_ledger_revision
        and audit.new_eligible_ledger_revision = current_ledger_revision
        and audit.old_ranking_start_snapshot_date
          = p_expected_ranking_start_snapshot_date
        and audit.old_ranking_baseline_return_pct
          = p_expected_ranking_baseline_return_pct
        and audit.reason = incident_reason
    ) then
      return 'already_rebaselined';
    end if;
    return 'audit_conflict';
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
    return 'stale_member';
  end if;
  if member_row.ranking_start_snapshot_date is null
    or member_row.ranking_baseline_return_pct is null
  then
    return 'ranking_not_started';
  end if;
  if incident_date <= member_row.eligible_after_snapshot_date then
    return 'date_regression';
  end if;

  -- This RPC is incident-specific. It cannot turn a genuine after-close ledger
  -- mutation into a new competition epoch.
  if current_ledger_last_mutated_at is null
    or current_ledger_last_mutated_at > incident_close
  then
    return 'incident_not_matched';
  end if;

  -- At least one target-day trade must carry the exact legacy signature:
  -- Shanghai already read 07-30 while New York was still 07-29.
  if not exists (
    select 1
    from public.stock_trades as trade
    where trade.user_id = p_user_id
      and trade.trade_date = incident_date
      and (trade.created_at at time zone 'Asia/Shanghai')::date = incident_date
      and (trade.created_at at time zone 'America/New_York')::date
        = incident_prior_new_york_date
      and trade.created_at <= incident_close
  ) then
    return 'incident_not_matched';
  end if;

  -- Every target-day trade must have been written by the close. A trade whose
  -- New York creation date is not 07-30 is accepted only when it carries that
  -- same Shanghai-07-30/New-York-07-29 legacy signature.
  if exists (
    select 1
    from public.stock_trades as trade
    where trade.user_id = p_user_id
      and trade.trade_date = incident_date
      and (
        trade.created_at > incident_close
        or (
          (trade.created_at at time zone 'America/New_York')::date
            <> incident_date
          and not (
            (trade.created_at at time zone 'Asia/Shanghai')::date
              = incident_date
            and (trade.created_at at time zone 'America/New_York')::date
              = incident_prior_new_york_date
          )
        )
      )
  ) then
    return 'incident_not_matched';
  end if;

  -- Prior snapshots remain immutable. A target/future snapshot means another
  -- worker already advanced this epoch, so resetting it would erase continuity.
  if exists (
    select 1
    from public.community_competition_snapshots
    where user_id = p_user_id
      and snapshot_date >= incident_date
  ) then
    return 'snapshot_conflict';
  end if;

  insert into public.community_competition_rebaseline_audit (
    operation_key,
    user_id,
    old_eligible_after_snapshot_date,
    new_eligible_after_snapshot_date,
    old_eligible_ledger_hash,
    new_eligible_ledger_hash,
    old_eligible_ledger_revision,
    new_eligible_ledger_revision,
    old_ranking_start_snapshot_date,
    old_ranking_baseline_return_pct,
    reason
  )
  values (
    operation_key_value,
    p_user_id,
    member_row.eligible_after_snapshot_date,
    incident_date,
    member_row.eligible_ledger_hash,
    p_new_eligible_ledger_hash,
    member_row.eligible_ledger_revision,
    current_ledger_revision,
    member_row.ranking_start_snapshot_date,
    member_row.ranking_baseline_return_pct,
    incident_reason
  )
  on conflict (operation_key) do nothing;

  if not found then
    return 'audit_conflict';
  end if;

  update public.community_competition_members
  set eligible_after_snapshot_date = incident_date,
      eligible_ledger_hash = p_new_eligible_ledger_hash,
      eligible_ledger_revision = current_ledger_revision,
      ranking_start_snapshot_date = null,
      ranking_baseline_return_pct = null,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  return 'rebaselined';
end;
$$;

revoke execute on function public.forward_rebaseline_ranked_community_competition_member(
  uuid, date, text, bigint, date, numeric, bigint, date, text
)
from public, anon, authenticated;

grant execute on function public.forward_rebaseline_ranked_community_competition_member(
  uuid, date, text, bigint, date, numeric, bigint, date, text
)
to service_role;

create or replace function public.touch_community_competition_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.touch_community_competition_updated_at()
from public, anon, authenticated;

drop trigger if exists community_competition_members_touch_updated_at
on public.community_competition_members;

create trigger community_competition_members_touch_updated_at
before update on public.community_competition_members
for each row
execute function public.touch_community_competition_updated_at();

drop trigger if exists community_competition_snapshots_touch_updated_at
on public.community_competition_snapshots;

create trigger community_competition_snapshots_touch_updated_at
before update on public.community_competition_snapshots
for each row
execute function public.touch_community_competition_updated_at();

alter table public.community_competition_members enable row level security;
alter table public.community_competition_members force row level security;
alter table public.community_competition_snapshots enable row level security;
alter table public.community_competition_snapshots force row level security;

create table if not exists public.snapshot_publication_markers (
  channel text not null,
  snapshot_date date not null,
  version text not null,
  completed_at timestamptz not null,
  constraint snapshot_publication_markers_pkey primary key (channel, snapshot_date),
  constraint snapshot_publication_markers_channel_check check (channel = 'competition'),
  constraint snapshot_publication_markers_version_check
    check (version ~ '^[A-Za-z0-9_-]{16,128}$')
);

create index if not exists snapshot_publication_markers_latest_idx
on public.snapshot_publication_markers (channel, snapshot_date desc);

create or replace function public.set_snapshot_publication_marker_completed_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.completed_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.set_snapshot_publication_marker_completed_at()
from public, anon, authenticated, service_role;

drop trigger if exists set_snapshot_publication_marker_completed_at
on public.snapshot_publication_markers;

create trigger set_snapshot_publication_marker_completed_at
before insert or update on public.snapshot_publication_markers
for each row execute function public.set_snapshot_publication_marker_completed_at();

alter table public.snapshot_publication_markers enable row level security;
alter table public.snapshot_publication_markers force row level security;

drop policy if exists "users can read own community competition membership"
on public.community_competition_members;

create policy "users can read own community competition membership"
on public.community_competition_members
for select
to authenticated
using (auth.uid() = user_id);

revoke all privileges on table public.community_competition_members
from public, anon, authenticated;

grant select
on table public.community_competition_members
to authenticated;

grant select, insert, update, delete
on table public.community_competition_members
to service_role;

revoke all privileges on table public.community_competition_snapshots
from public, anon, authenticated;

revoke all privileges on table public.community_competition_snapshots
from service_role;

grant select, insert
on table public.community_competition_snapshots
to service_role;

revoke all privileges on table public.snapshot_publication_markers
from public, anon, authenticated, service_role;

grant select, insert, update
on table public.snapshot_publication_markers
to service_role;

notify pgrst, 'reload schema';

commit;
