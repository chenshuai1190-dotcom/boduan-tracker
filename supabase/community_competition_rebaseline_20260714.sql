-- Forward-only repair for members whose ledger changed before their first
-- official competition snapshot. Apply before the runtime deployment.

begin;

-- Fail instead of building an unbounded queue behind an active ledger writer.
set local lock_timeout = '5s';

create table if not exists public.stock_trade_ledger_revisions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  last_mutated_at timestamptz,

  constraint stock_trade_ledger_revisions_revision_check
    check (revision >= 0)
);

alter table public.stock_trade_ledger_revisions enable row level security;
alter table public.stock_trade_ledger_revisions force row level security;

revoke all privileges on table public.stock_trade_ledger_revisions
from public, anon, authenticated, service_role;

grant select
on table public.stock_trade_ledger_revisions
to service_role;

-- Prevent an INSERT/UPDATE/DELETE from landing between the initial revision
-- seed and trigger installation. The lock is released immediately after both
-- stock_trades triggers are installed; SELECT remains available throughout.
lock table public.stock_trades in share row exclusive mode;

insert into public.stock_trade_ledger_revisions (
  user_id,
  revision,
  last_mutated_at
)
select
  user_id,
  1,
  clock_timestamp()
from (
  select distinct user_id
  from public.stock_trades
) as existing_ledgers
on conflict (user_id) do nothing;

create or replace function public.enforce_stock_trade_server_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  server_now timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    new.created_at = server_now;
    new.updated_at = server_now;
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'stock trade owner is immutable'
      using errcode = '23514';
  end if;

  new.created_at = old.created_at;
  new.updated_at = server_now;
  return new;
end;
$$;

revoke execute on function public.enforce_stock_trade_server_timestamps()
from public, anon, authenticated;

drop trigger if exists stock_trades_enforce_server_timestamps
on public.stock_trades;

create trigger stock_trades_enforce_server_timestamps
before insert or update on public.stock_trades
for each row
execute function public.enforce_stock_trade_server_timestamps();

create or replace function public.bump_stock_trade_ledger_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  affected_user_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
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
  values (affected_user_id, 1, clock_timestamp())
  on conflict (user_id) do update
  set revision = public.stock_trade_ledger_revisions.revision + 1,
      last_mutated_at = excluded.last_mutated_at;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.bump_stock_trade_ledger_revision()
from public, anon, authenticated;

drop trigger if exists stock_trades_bump_ledger_revision
on public.stock_trades;

create trigger stock_trades_bump_ledger_revision
after insert or update or delete on public.stock_trades
for each row
execute function public.bump_stock_trade_ledger_revision();

commit;

-- The remaining idempotent schema/RPC work must not hold the ledger writer lock.
begin;

alter table public.community_competition_members
add column if not exists eligible_ledger_revision bigint;

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
  if not exists (select 1 from auth.users where id = p_user_id) then
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

  insert into public.stock_trade_ledger_revisions (user_id, revision, last_mutated_at)
  values (p_user_id, 0, null)
  on conflict (user_id) do nothing;

  select revision into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  select * into member_row
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
      select 1 from public.community_competition_snapshots where user_id = p_user_id
    )
  ) then
    return 'member_conflict';
  end if;

  insert into public.community_competition_members (
    user_id, status, joined_at, eligible_after_snapshot_date,
    eligible_ledger_hash, eligible_ledger_revision,
    ranking_start_snapshot_date, ranking_baseline_return_pct,
    created_at, updated_at
  ) values (
    p_user_id, 'active', clock_timestamp(), p_eligible_after_snapshot_date,
    p_eligible_ledger_hash, current_ledger_revision,
    null, null, clock_timestamp(), clock_timestamp()
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

notify pgrst, 'reload schema';

commit;
