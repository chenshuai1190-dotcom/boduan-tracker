-- Apply in the Supabase SQL editor after verifying these are the production tables.
-- Every user-owned table must have a user_id column containing auth.uid().

begin;

-- Fail instead of building an unbounded queue behind an active ledger writer.
set local lock_timeout = '5s';

create table if not exists public.stock_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  name text not null default '',
  side text not null check (side in ('buy', 'sell')),
  trade_date date not null,
  price numeric(18, 6) not null check (price > 0),
  shares numeric(18, 6) not null check (shares > 0),
  fee numeric(18, 6) not null default 0 check (fee >= 0),
  currency text not null default 'USD',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_trades_user_date_idx
on public.stock_trades (user_id, trade_date, created_at);

create index if not exists stock_trades_user_symbol_idx
on public.stock_trades (user_id, symbol);

-- Opaque, server-owned canonical financial-ledger version. Authenticated
-- clients may edit their own trades, but cannot read or forge this sequence.
create table if not exists public.stock_trade_ledger_revisions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  last_mutated_at timestamptz,

  constraint stock_trade_ledger_revisions_revision_check
    check (revision >= 0)
);

alter table public.stock_trades enable row level security;
alter table public.stock_trade_ledger_revisions enable row level security;
alter table public.stock_trade_ledger_revisions force row level security;

revoke all privileges on table public.stock_trade_ledger_revisions
from public, anon, authenticated, service_role;

grant select
on table public.stock_trade_ledger_revisions
to service_role;

-- Hold writers until the existing ledger is seeded and the mutation trigger is
-- installed. The lock is released immediately after both triggers exist;
-- ACCESS SHARE remains compatible, so read-only traffic continues.
lock table public.stock_trades in share row exclusive mode;

-- Existing ledgers start at one opaque pre-trigger revision. The exact number
-- is deliberately not a trade count; only equality and monotonicity matter.
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

drop trigger if exists stock_trades_bump_ledger_revision
on public.stock_trades;

create trigger stock_trades_bump_ledger_revision
after insert or update or delete on public.stock_trades
for each row
execute function public.bump_stock_trade_ledger_revision();

commit;

-- The aggregate rebuild can continue without holding the formal-ledger writer lock.
begin;

set local lock_timeout = '5s';

create table if not exists public.swing_waves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  name text not null default '',
  buy_date date not null,
  buy_price_usd numeric(18, 6) not null check (buy_price_usd > 0),
  shares numeric(18, 6) not null check (shares > 0),
  sell_date date,
  sell_price_usd numeric(18, 6),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint swing_waves_symbol_format_check
    check (
      symbol = upper(btrim(symbol))
      and symbol ~ '^[A-Z0-9._-]{1,15}$'
      and symbol ~ '[A-Z0-9]'
    ),

  constraint swing_waves_completion_check
    check (
      (sell_date is null and sell_price_usd is null)
      or
      (
        sell_date is not null
        and sell_price_usd is not null
        and sell_price_usd > 0
        and sell_date >= buy_date
      )
    )
);

create index if not exists swing_waves_user_date_idx
on public.swing_waves (user_id, buy_date desc, created_at desc);

create index if not exists swing_waves_user_symbol_date_idx
on public.swing_waves (user_id, symbol, buy_date desc, created_at desc);

create or replace function public.touch_swing_waves_updated_at()
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

revoke execute on function public.touch_swing_waves_updated_at()
from public, anon, authenticated;

drop trigger if exists swing_waves_touch_updated_at
on public.swing_waves;

create trigger swing_waves_touch_updated_at
before update on public.swing_waves
for each row
execute function public.touch_swing_waves_updated_at();

create table if not exists public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  avatar_key text not null default 'gold',
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_profiles_nickname_length_check
    check (char_length(btrim(nickname)) between 2 and 16),
  constraint community_profiles_nickname_no_control_check
    check (nickname !~ '[[:cntrl:]]'),
  constraint community_profiles_avatar_key_check
    check (avatar_key in (
      'gold', 'blue', 'purple', 'green', 'cyan', 'silver',
      'wolf', 'fox', 'tiger', 'cat', 'eagle', 'panda',
      'cyber-cyan', 'cyber-magenta', 'cyber-void', 'cyber-red', 'cyber-visor', 'cyber-crystal'
    ))
);

alter table public.community_profiles
add column if not exists profile_completed_at timestamptz;

alter table public.community_profiles
drop constraint if exists community_profiles_avatar_key_check;

alter table public.community_profiles
add constraint community_profiles_avatar_key_check
check (avatar_key in (
  'gold', 'blue', 'purple', 'green', 'cyan', 'silver',
  'wolf', 'fox', 'tiger', 'cat', 'eagle', 'panda',
  'cyber-cyan', 'cyber-magenta', 'cyber-void', 'cyber-red', 'cyber-visor', 'cyber-crystal'
));

create index if not exists community_profiles_updated_at_idx
on public.community_profiles (updated_at desc);

create or replace function public.touch_community_profiles_updated_at()
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

revoke execute on function public.touch_community_profiles_updated_at()
from public, anon, authenticated;

drop trigger if exists community_profiles_touch_updated_at
on public.community_profiles;

create trigger community_profiles_touch_updated_at
before update on public.community_profiles
for each row
execute function public.touch_community_profiles_updated_at();

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

-- Server-only completion marker. It is deliberately separate from the
-- per-user rows: the first written member row must never publish a partial
-- leaderboard. No user identifiers or portfolio data are stored here.
create table if not exists public.snapshot_publication_markers (
  channel text not null,
  snapshot_date date not null,
  version text not null,
  completed_at timestamptz not null,

  constraint snapshot_publication_markers_pkey
    primary key (channel, snapshot_date),
  constraint snapshot_publication_markers_channel_check
    check (channel = 'competition'),
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

create table if not exists public.community_competition_epoch_resets (
  operation_key text primary key,
  user_id uuid not null,
  old_eligible_after_snapshot_date date not null,
  new_eligible_after_snapshot_date date not null,
  old_eligible_ledger_hash text,
  new_eligible_ledger_hash text not null,
  old_eligible_ledger_revision bigint not null,
  new_eligible_ledger_revision bigint not null,
  old_ranking_start_snapshot_date date,
  old_ranking_baseline_return_pct numeric(18, 10),
  market_close_at timestamptz not null,
  ledger_last_mutated_at timestamptz not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint community_competition_epoch_resets_operation_key_check
    check (
      char_length(operation_key) between 32 and 200
      and operation_key ~ '^competition-epoch-rollover:'
    ),
  constraint community_competition_epoch_resets_date_check
    check (new_eligible_after_snapshot_date > old_eligible_after_snapshot_date),
  constraint community_competition_epoch_resets_old_hash_check
    check (
      old_eligible_ledger_hash is null
      or old_eligible_ledger_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint community_competition_epoch_resets_new_hash_check
    check (new_eligible_ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint community_competition_epoch_resets_revision_check
    check (
      old_eligible_ledger_revision >= 0
      and new_eligible_ledger_revision > old_eligible_ledger_revision
    ),
  constraint community_competition_epoch_resets_ranking_pair_check
    check (
      (
        old_ranking_start_snapshot_date is null
        and old_ranking_baseline_return_pct is null
      )
      or
      (
        old_ranking_start_snapshot_date is not null
        and old_ranking_baseline_return_pct is not null
      )
    ),
  constraint community_competition_epoch_resets_market_close_check
    check (ledger_last_mutated_at <= market_close_at),
  constraint community_competition_epoch_resets_reason_check
    check (
      reason in (
        'prior_ledger_hash_mismatch',
        'eligible_ledger_hash_mismatch',
        'trade_before_first_snapshot',
        'trade_between_snapshots',
        'post_close_ledger_change',
        'late_trade'
      )
    )
);

alter table public.community_competition_epoch_resets enable row level security;
alter table public.community_competition_epoch_resets force row level security;

revoke all privileges on table public.community_competition_epoch_resets
from public, anon, authenticated, service_role;

grant select
on table public.community_competition_epoch_resets
to service_role;

create or replace function public.guard_community_competition_epoch_reset_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'community competition epoch reset rows are immutable'
    using errcode = '55000';
end;
$$;

revoke execute on function public.guard_community_competition_epoch_reset_immutable()
from public, anon, authenticated, service_role;

drop trigger if exists community_competition_epoch_resets_immutable
on public.community_competition_epoch_resets;

create trigger community_competition_epoch_resets_immutable
before update or delete on public.community_competition_epoch_resets
for each row
execute function public.guard_community_competition_epoch_reset_immutable();

create or replace function public.rollover_community_competition_member_epoch(
  p_user_id uuid,
  p_operation_key text,
  p_expected_eligible_after_snapshot_date date,
  p_expected_eligible_ledger_hash text,
  p_expected_eligible_ledger_revision bigint,
  p_expected_ranking_start_snapshot_date date,
  p_expected_ranking_baseline_return_pct numeric,
  p_expected_current_ledger_revision bigint,
  p_new_eligible_after_snapshot_date date,
  p_new_eligible_ledger_hash text,
  p_market_close_at timestamptz,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_operation_key text;
  expected_market_close_at timestamptz;
  current_ledger_revision bigint;
  current_ledger_last_mutated_at timestamptz;
  member_row public.community_competition_members%rowtype;
  audit_row public.community_competition_epoch_resets%rowtype;
begin
  expected_operation_key := format(
    'competition-epoch-rollover:%s:%s:%s',
    p_user_id::text,
    p_new_eligible_after_snapshot_date::text,
    p_expected_current_ledger_revision::text
  );
  expected_market_close_at := (
    p_new_eligible_after_snapshot_date + time '16:00'
  ) at time zone 'America/New_York';

  if p_user_id is null
    or p_operation_key is null
    or p_operation_key is distinct from expected_operation_key
    or p_expected_eligible_after_snapshot_date is null
    or p_expected_eligible_ledger_revision is null
    or p_expected_eligible_ledger_revision < 0
    or (
      (p_expected_ranking_start_snapshot_date is null)
      <> (p_expected_ranking_baseline_return_pct is null)
    )
    or p_expected_current_ledger_revision is null
    or p_expected_current_ledger_revision < 0
    or p_new_eligible_after_snapshot_date is null
    or extract(isodow from p_new_eligible_after_snapshot_date) in (6, 7)
    or p_new_eligible_ledger_hash is null
    or p_new_eligible_ledger_hash !~ '^[0-9a-f]{64}$'
    or p_market_close_at is null
    or p_market_close_at is distinct from expected_market_close_at
    or p_reason is null
    or p_reason not in (
      'prior_ledger_hash_mismatch',
      'eligible_ledger_hash_mismatch',
      'trade_before_first_snapshot',
      'trade_between_snapshots',
      'post_close_ledger_change',
      'late_trade'
    )
  then
    return 'invalid_input';
  end if;

  -- Match the immutable snapshot INSERT lock order: ledger revision, then
  -- membership. This serializes edits, rollovers, and new snapshot writes.
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
  if current_ledger_revision
      is distinct from p_expected_current_ledger_revision
  then
    return 'stale_ledger';
  end if;

  -- A lost-response retry is accepted only when the immutable audit row proves
  -- that this exact operation already committed. A reused key with any changed
  -- field is a hard conflict.
  select *
  into audit_row
  from public.community_competition_epoch_resets
  where operation_key = p_operation_key;

  if found then
    if audit_row.user_id = p_user_id
      and audit_row.old_eligible_after_snapshot_date
        = p_expected_eligible_after_snapshot_date
      and audit_row.new_eligible_after_snapshot_date
        = p_new_eligible_after_snapshot_date
      and audit_row.old_eligible_ledger_hash
        is not distinct from p_expected_eligible_ledger_hash
      and audit_row.new_eligible_ledger_hash = p_new_eligible_ledger_hash
      and audit_row.old_eligible_ledger_revision
        = p_expected_eligible_ledger_revision
      and audit_row.new_eligible_ledger_revision
        = p_expected_current_ledger_revision
      and audit_row.old_ranking_start_snapshot_date
        is not distinct from p_expected_ranking_start_snapshot_date
      and audit_row.old_ranking_baseline_return_pct
        is not distinct from p_expected_ranking_baseline_return_pct
      and audit_row.market_close_at = p_market_close_at
      and audit_row.reason = p_reason
    then
      return 'already_rolled_over';
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

  -- A ranked member must point at a real old snapshot. A member already waiting
  -- may roll again when any immutable old snapshot exists, including the orphan
  -- first snapshot left by a failed ranking PATCH. The conflict check below
  -- requires the new anchor to be strictly later than every such snapshot.
  if member_row.ranking_start_snapshot_date is not null then
    if not exists (
      select 1
      from public.community_competition_snapshots
      where user_id = p_user_id
        and snapshot_date = member_row.ranking_start_snapshot_date
    ) then
      return 'ranking_snapshot_missing';
    end if;
  elsif not exists (
    select 1
    from public.community_competition_snapshots
    where user_id = p_user_id
  ) then
    return 'pending_history_missing';
  end if;

  if p_new_eligible_after_snapshot_date
      <= member_row.eligible_after_snapshot_date
  then
    return 'date_regression';
  end if;
  if current_ledger_revision <= member_row.eligible_ledger_revision then
    return 'ledger_unchanged';
  end if;
  if p_market_close_at > clock_timestamp() then
    return 'market_close_not_reached';
  end if;
  if current_ledger_last_mutated_at is null then
    return 'ledger_mutation_missing';
  end if;
  if current_ledger_last_mutated_at > p_market_close_at then
    return 'ledger_mutated_after_close';
  end if;

  -- A target/future snapshot means another worker already advanced this member.
  -- Earlier snapshots are deliberately retained as immutable prior epochs.
  if exists (
    select 1
    from public.community_competition_snapshots
    where user_id = p_user_id
      and snapshot_date >= p_new_eligible_after_snapshot_date
  ) then
    return 'snapshot_conflict';
  end if;

  insert into public.community_competition_epoch_resets (
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
    market_close_at,
    ledger_last_mutated_at,
    reason
  )
  values (
    p_operation_key,
    p_user_id,
    member_row.eligible_after_snapshot_date,
    p_new_eligible_after_snapshot_date,
    member_row.eligible_ledger_hash,
    p_new_eligible_ledger_hash,
    member_row.eligible_ledger_revision,
    current_ledger_revision,
    member_row.ranking_start_snapshot_date,
    member_row.ranking_baseline_return_pct,
    p_market_close_at,
    current_ledger_last_mutated_at,
    p_reason
  )
  on conflict (operation_key) do nothing;

  if not found then
    return 'audit_conflict';
  end if;

  update public.community_competition_members
  set eligible_after_snapshot_date = p_new_eligible_after_snapshot_date,
      eligible_ledger_hash = p_new_eligible_ledger_hash,
      eligible_ledger_revision = current_ledger_revision,
      ranking_start_snapshot_date = null,
      ranking_baseline_return_pct = null,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  return 'rolled_over';
end;
$$;

revoke execute on function public.rollover_community_competition_member_epoch(
  uuid, text, date, text, bigint, date, numeric, bigint, date, text, timestamptz, text
)
from public, anon, authenticated, service_role;

grant execute on function public.rollover_community_competition_member_epoch(
  uuid, text, date, text, bigint, date, numeric, bigint, date, text, timestamptz, text
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

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'used', 'revoked')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text not null default '',
  used_by uuid references auth.users(id) on delete set null,
  used_by_email text not null default '',
  note text not null default '',
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invite_codes_status_created_idx
on public.invite_codes (status, created_at desc);

create index if not exists invite_codes_used_by_idx
on public.invite_codes (used_by);

alter table public.margin_status
add column if not exists logic_version integer;

create table if not exists public.margin_debt_history_meta (
  version text primary key,
  history_started_at timestamptz not null,
  seed_completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),

  constraint margin_debt_history_meta_version_check
    check (version = 'v1'),
  constraint margin_debt_history_meta_seed_order_check
    check (seed_completed_at is null or seed_completed_at >= history_started_at)
);

alter table public.margin_debt_history_meta
add column if not exists seed_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'margin_debt_history_meta_version_check'
      and conrelid = 'public.margin_debt_history_meta'::regclass
  ) then
    alter table public.margin_debt_history_meta
    add constraint margin_debt_history_meta_version_check
    check (version = 'v1');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'margin_debt_history_meta_seed_order_check'
      and conrelid = 'public.margin_debt_history_meta'::regclass
  ) then
    alter table public.margin_debt_history_meta
    add constraint margin_debt_history_meta_seed_order_check
    check (seed_completed_at is null or seed_completed_at >= history_started_at);
  end if;
end;
$$;

create table if not exists public.margin_debt_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  margin_debt_usd numeric(18, 6) not null check (margin_debt_usd >= 0),
  effective_at timestamptz not null default clock_timestamp(),
  source text not null check (
    source in (
      'migration_seed_v1',
      'verified_backfill_v1',
      'status_activation',
      'status_change'
    )
  ),
  logic_version integer not null default 2 check (logic_version = 2),
  source_updated_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists margin_debt_events_user_effective_idx
on public.margin_debt_events (user_id, effective_at desc, id desc);

create table if not exists public.pnl_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  currency text not null default 'USD',
  cash_usd numeric(18, 6) not null default 0,
  market_value_usd numeric(18, 6) not null default 0,
  total_assets_usd numeric(18, 6) not null default 0,
  margin_debt_usd numeric(18, 6),
  margin_debt_event_id bigint,
  margin_debt_effective_at timestamptz,
  margin_debt_basis text,
  net_assets_usd numeric(18, 6) generated always as (
    case
      when margin_debt_usd is null then null
      else total_assets_usd - margin_debt_usd
    end
  ) stored,
  realized_pnl_usd numeric(18, 6) not null default 0,
  unrealized_pnl_usd numeric(18, 6) not null default 0,
  cumulative_pnl_usd numeric(18, 6) not null default 0,
  cumulative_pnl_pct numeric(18, 10) not null default 0,
  daily_pnl_usd numeric(18, 6),
  daily_pnl_pct numeric(18, 10),
  total_buy_cost_usd numeric(18, 6) not null default 0,
  sell_proceeds_usd numeric(18, 6) not null default 0,
  trade_count integer not null default 0,
  holding_count integer not null default 0,
  source_version text not null default 'pnl_snapshot_v2',
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pnl_report_snapshots_margin_debt_nonnegative_check
    check (margin_debt_usd is null or margin_debt_usd >= 0),
  constraint pnl_report_snapshots_margin_provenance_check check (
    (
      margin_debt_usd is null
      and margin_debt_event_id is null
      and margin_debt_effective_at is null
      and margin_debt_basis is null
    )
    or
    (
      margin_debt_usd = 0
      and margin_debt_event_id is null
      and margin_debt_effective_at is null
      and margin_debt_basis = 'default_zero'
    )
    or
    (
      margin_debt_usd is not null
      and margin_debt_event_id is not null
      and margin_debt_effective_at is not null
      and margin_debt_basis = 'event'
    )
  ),
  unique (user_id, snapshot_date)
);

create index if not exists pnl_report_snapshots_user_date_idx
on public.pnl_report_snapshots (user_id, snapshot_date desc);

create table if not exists public.pnl_report_symbol_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  symbol text not null,
  name text not null default '',
  currency text not null default 'USD',
  held_shares numeric(18, 6) not null default 0,
  avg_cost_usd numeric(18, 6) not null default 0,
  remaining_cost_usd numeric(18, 6) not null default 0,
  current_price_usd numeric(18, 6) not null default 0,
  previous_close_usd numeric(18, 6) not null default 0,
  market_value_usd numeric(18, 6) not null default 0,
  realized_pnl_usd numeric(18, 6) not null default 0,
  unrealized_pnl_usd numeric(18, 6) not null default 0,
  cumulative_pnl_usd numeric(18, 6) not null default 0,
  daily_pnl_usd numeric(18, 6),
  daily_pnl_pct numeric(18, 10),
  total_buy_cost_usd numeric(18, 6) not null default 0,
  sell_proceeds_usd numeric(18, 6) not null default 0,
  sold_cost_usd numeric(18, 6) not null default 0,
  total_buy_shares numeric(18, 6) not null default 0,
  total_sell_shares numeric(18, 6) not null default 0,
  is_open boolean not null default false,
  source_version text not null default 'pnl_snapshot_v2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, snapshot_date, symbol)
);

create index if not exists pnl_report_symbol_snapshots_user_date_idx
on public.pnl_report_symbol_snapshots (user_id, snapshot_date desc);

create index if not exists pnl_report_symbol_snapshots_user_symbol_date_idx
on public.pnl_report_symbol_snapshots (user_id, symbol, snapshot_date desc);

create table if not exists public.pnl_report_rebuild_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dirty_from_date date,
  reason text not null default 'stock_trade_changed',
  source_trade_id uuid,
  updated_at timestamptz not null default now()
);

alter table public.pnl_report_snapshots
add column if not exists margin_debt_usd numeric(18, 6);

alter table public.pnl_report_snapshots
add column if not exists margin_debt_event_id bigint;

alter table public.pnl_report_snapshots
add column if not exists margin_debt_effective_at timestamptz;

alter table public.pnl_report_snapshots
add column if not exists margin_debt_basis text;

alter table public.pnl_report_snapshots
add column if not exists net_assets_usd numeric(18, 6)
generated always as (
  case
    when margin_debt_usd is null then null
    else total_assets_usd - margin_debt_usd
  end
) stored;

alter table public.pnl_report_snapshots
alter column source_version set default 'pnl_snapshot_v2';

alter table public.pnl_report_symbol_snapshots
alter column source_version set default 'pnl_snapshot_v2';

do $$
begin
  if exists (
    select 1
    from public.margin_debt_history_meta
    where version = 'v1'
      and seed_completed_at is null
  ) then
    raise exception 'margin debt history metadata exists without a completed seed';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pnl_report_snapshots_margin_debt_nonnegative_check'
      and conrelid = 'public.pnl_report_snapshots'::regclass
  ) then
    alter table public.pnl_report_snapshots
    add constraint pnl_report_snapshots_margin_debt_nonnegative_check
    check (margin_debt_usd is null or margin_debt_usd >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pnl_report_snapshots_margin_provenance_check'
      and conrelid = 'public.pnl_report_snapshots'::regclass
  ) then
    alter table public.pnl_report_snapshots
    add constraint pnl_report_snapshots_margin_provenance_check
    check (
      (
        margin_debt_usd is null
        and margin_debt_event_id is null
        and margin_debt_effective_at is null
        and margin_debt_basis is null
      )
      or
      (
        margin_debt_usd = 0
        and margin_debt_event_id is null
        and margin_debt_effective_at is null
        and margin_debt_basis = 'default_zero'
      )
      or
      (
        margin_debt_usd is not null
        and margin_debt_usd >= 0
        and margin_debt_event_id is not null
        and margin_debt_effective_at is not null
        and margin_debt_basis = 'event'
      )
    );
  end if;
end;
$$;

do $$
declare
  started_at timestamptz;
begin
  if exists (
    select 1
    from public.margin_status
    where (
        coalesce(logic_version, 0) = 2
        or updated_at > timestamptz '2026-07-21T20:35:57.000Z'
      )
      and (current_margin is null or current_margin < 0)
  ) then
    raise exception 'current-model margin rows must have a non-negative balance';
  end if;

  insert into public.margin_debt_history_meta (version, history_started_at)
  values ('v1', clock_timestamp())
  on conflict (version) do nothing
  returning history_started_at into started_at;

  if started_at is not null then
    with relevant_users as (
      select user_id from public.margin_status
      union
      select user_id from public.stock_trades
      union
      select user_id from public.pnl_report_snapshots
    )
    insert into public.margin_debt_events (
      user_id,
      margin_debt_usd,
      effective_at,
      source,
      logic_version,
      source_updated_at
    )
    select
      relevant_users.user_id,
      case
        when (
            coalesce(status.logic_version, 0) = 2
            or status.updated_at > timestamptz '2026-07-21T20:35:57.000Z'
          )
          and status.current_margin is not null
          and status.current_margin >= 0
        then status.current_margin
        else 0
      end,
      started_at,
      'migration_seed_v1',
      2,
      status.updated_at
    from relevant_users
    left join public.margin_status as status
      on status.user_id = relevant_users.user_id;

    update public.margin_debt_history_meta
    set seed_completed_at = clock_timestamp()
    where version = 'v1'
      and seed_completed_at is null;
  end if;
end;
$$;

update public.margin_status
set logic_version = 2
where (
    coalesce(logic_version, 0) = 2
    or updated_at > timestamptz '2026-07-21T20:35:57.000Z'
  )
  and current_margin is not null
  and current_margin >= 0
  and logic_version is distinct from 2;

create or replace function public.mark_pnl_report_dirty(
  p_dirty_from_date date,
  p_reason text default 'stock_trade_changed',
  p_source_trade_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_dirty_from_date is null then
    raise exception 'dirty_from_date is required';
  end if;

  insert into public.pnl_report_rebuild_state (
    user_id,
    dirty_from_date,
    reason,
    source_trade_id,
    updated_at
  )
  values (
    auth.uid(),
    p_dirty_from_date,
    coalesce(nullif(p_reason, ''), 'stock_trade_changed'),
    p_source_trade_id,
    now()
  )
  on conflict (user_id) do update
  set
    dirty_from_date = least(
      coalesce(public.pnl_report_rebuild_state.dirty_from_date, excluded.dirty_from_date),
      excluded.dirty_from_date
    ),
    reason = excluded.reason,
    source_trade_id = excluded.source_trade_id,
    updated_at = now();
end;
$$;

create or replace function public.capture_margin_debt_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  captured_at timestamptz := clock_timestamp();
  was_current boolean := false;
  becomes_current boolean := false;
  event_source text;
begin
  if new.current_margin is null or new.current_margin < 0 then
    raise exception 'margin debt must be a non-negative amount';
  end if;
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'margin debt owner mismatch';
  end if;
  if tg_op = 'UPDATE' then
    was_current := coalesce(old.logic_version, 0) = 2
      or old.updated_at > timestamptz '2026-07-21T20:35:57.000Z';
  end if;
  becomes_current := coalesce(new.logic_version, 0) = 2
    or new.updated_at > timestamptz '2026-07-21T20:35:57.000Z';
  if becomes_current then
    new.logic_version := 2;
  end if;
  if not becomes_current then
    return new;
  end if;
  if not was_current then
    event_source := 'status_activation';
  elsif old.current_margin is distinct from new.current_margin then
    event_source := 'status_change';
  else
    return new;
  end if;
  insert into public.margin_debt_events (
    user_id,
    margin_debt_usd,
    effective_at,
    source,
    logic_version,
    source_updated_at
  )
  values (
    new.user_id,
    new.current_margin,
    captured_at,
    event_source,
    2,
    new.updated_at
  );
  return new;
end;
$$;

revoke all on function public.capture_margin_debt_event()
from public, anon, authenticated, service_role;

drop trigger if exists capture_margin_debt_event
on public.margin_status;

create trigger capture_margin_debt_event
before insert or update on public.margin_status
for each row execute function public.capture_margin_debt_event();

create or replace function public.protect_pnl_report_margin_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin')
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.margin_debt_usd := null;
    new.margin_debt_event_id := null;
    new.margin_debt_effective_at := null;
    new.margin_debt_basis := null;
  else
    new.margin_debt_usd := old.margin_debt_usd;
    new.margin_debt_event_id := old.margin_debt_event_id;
    new.margin_debt_effective_at := old.margin_debt_effective_at;
    new.margin_debt_basis := old.margin_debt_basis;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_pnl_report_margin_snapshot()
from public, anon, authenticated, service_role;

drop trigger if exists protect_pnl_report_margin_snapshot
on public.pnl_report_snapshots;

create trigger protect_pnl_report_margin_snapshot
before insert or update of
  margin_debt_usd,
  margin_debt_event_id,
  margin_debt_effective_at,
  margin_debt_basis
on public.pnl_report_snapshots
for each row execute function public.protect_pnl_report_margin_snapshot();

alter table public.margin_debt_events
drop constraint if exists margin_debt_events_source_check;

alter table public.margin_debt_events
add constraint margin_debt_events_source_check
check (
  source in (
    'migration_seed_v1',
    'verified_backfill_v1',
    'status_activation',
    'status_change'
  )
);

create unique index if not exists margin_debt_events_verified_backfill_unique_idx
on public.margin_debt_events (user_id, source, effective_at)
where source = 'verified_backfill_v1';

create or replace function public.resolve_margin_debt_snapshot_targets(
  p_targets jsonb
)
returns table (
  user_id uuid,
  snapshot_date date,
  margin_debt_usd numeric,
  margin_debt_event_id bigint,
  margin_debt_effective_at timestamptz,
  margin_debt_basis text,
  known boolean
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  with targets as (
    select distinct parsed.user_id, parsed.snapshot_date
    from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb))
      as parsed(user_id uuid, snapshot_date date)
    where parsed.user_id is not null
      and parsed.snapshot_date is not null
  ),
  bounded as (
    select
      targets.user_id,
      targets.snapshot_date,
      (targets.snapshot_date + time '17:00')
        at time zone 'America/New_York' as cutoff_at,
      meta.history_started_at
    from targets
    cross join public.margin_debt_history_meta as meta
    where meta.version = 'v1'
      and meta.seed_completed_at is not null
  ),
  resolved as (
    select
      bounded.*,
      event.id as event_id,
      event.margin_debt_usd as event_margin_debt_usd,
      event.effective_at as event_effective_at,
      (
        bounded.cutoff_at >= bounded.history_started_at
        or coalesce(event.source = 'verified_backfill_v1', false)
      ) as is_known
    from bounded
    left join lateral (
      select
        candidate.id,
        candidate.margin_debt_usd,
        candidate.effective_at,
        candidate.source
      from public.margin_debt_events as candidate
      where candidate.user_id = bounded.user_id
        and candidate.effective_at <= bounded.cutoff_at
      order by candidate.effective_at desc, candidate.id desc
      limit 1
    ) as event on true
  )
  select
    resolved.user_id,
    resolved.snapshot_date,
    case
      when not resolved.is_known then null
      when resolved.event_id is null then 0
      else resolved.event_margin_debt_usd
    end,
    case
      when not resolved.is_known then null
      else resolved.event_id
    end,
    case
      when not resolved.is_known then null
      else resolved.event_effective_at
    end,
    case
      when not resolved.is_known then null
      when resolved.event_id is null then 'default_zero'
      else 'event'
    end,
    resolved.is_known
  from resolved
  order by resolved.user_id, resolved.snapshot_date;
$$;

revoke all on function public.resolve_margin_debt_snapshot_targets(jsonb)
from public, anon, authenticated;

grant execute on function public.resolve_margin_debt_snapshot_targets(jsonb)
to service_role;

alter table public.trades enable row level security;
alter table public.swing_waves enable row level security;
alter table public.community_profiles enable row level security;
alter table public.community_competition_members enable row level security;
alter table public.community_competition_members force row level security;
alter table public.community_competition_snapshots enable row level security;
alter table public.community_competition_snapshots force row level security;
alter table public.snapshot_publication_markers enable row level security;
alter table public.snapshot_publication_markers force row level security;
alter table public.invite_codes enable row level security;
alter table public.margin_debt_events enable row level security;
alter table public.margin_debt_events force row level security;
alter table public.margin_debt_history_meta enable row level security;
alter table public.margin_debt_history_meta force row level security;
alter table public.pnl_report_snapshots enable row level security;
alter table public.pnl_report_symbol_snapshots enable row level security;
alter table public.pnl_report_rebuild_state enable row level security;
alter table public.watchlist enable row level security;
alter table public.wave_notes enable row level security;
alter table public.user_settings enable row level security;
alter table public.accounts enable row level security;
alter table public.balance_snapshots enable row level security;
alter table public.investment_plan enable row level security;
alter table public.margin_status enable row level security;
alter table public.disciplines enable row level security;
alter table public.review_logs enable row level security;
alter table public.yearly_actuals enable row level security;
alter table public.cost_basis_trades enable row level security;

drop policy if exists "users can manage own trades" on public.trades;
create policy "users can manage own trades"
on public.trades
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own stock trades" on public.stock_trades;
create policy "users can manage own stock trades"
on public.stock_trades
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own swing waves" on public.swing_waves;
create policy "users can manage own swing waves"
on public.swing_waves
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all privileges on table public.swing_waves from public, anon, authenticated;
grant select, insert, update, delete
on table public.swing_waves
to authenticated;

drop policy if exists "authenticated can read community profiles" on public.community_profiles;
create policy "authenticated can read community profiles"
on public.community_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own community profile" on public.community_profiles;
create policy "users can insert own community profile"
on public.community_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own community profile" on public.community_profiles;
create policy "users can update own community profile"
on public.community_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all privileges on table public.community_profiles from public, anon, authenticated;
grant select, insert, update
on table public.community_profiles
to authenticated;

grant select, insert
on table public.community_profiles
to service_role;

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

-- Canonical immediate-rebuild schema; production applies the dated forward
-- migration while this aggregate file remains suitable for a fresh install.
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

drop policy if exists "invite admin can read invite codes" on public.invite_codes;
create policy "invite admin can read invite codes"
on public.invite_codes
for select
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'chenshuai1190@gmail.com');

revoke all privileges on table public.margin_debt_events
from public, anon, authenticated, service_role;

revoke all privileges on table public.margin_debt_history_meta
from public, anon, authenticated, service_role;

grant select on table public.margin_debt_events
to service_role;

grant select on table public.margin_debt_history_meta
to service_role;

revoke all privileges on sequence public.margin_debt_events_id_seq
from public, anon, authenticated, service_role;

drop policy if exists "users can manage own pnl report snapshots" on public.pnl_report_snapshots;
create policy "users can manage own pnl report snapshots"
on public.pnl_report_snapshots
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own pnl report symbol snapshots" on public.pnl_report_symbol_snapshots;
create policy "users can manage own pnl report symbol snapshots"
on public.pnl_report_symbol_snapshots
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own pnl report rebuild state" on public.pnl_report_rebuild_state;
create policy "users can manage own pnl report rebuild state"
on public.pnl_report_rebuild_state
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own watchlist" on public.watchlist;
create policy "users can manage own watchlist"
on public.watchlist
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own wave notes" on public.wave_notes;
create policy "users can manage own wave notes"
on public.wave_notes
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own settings" on public.user_settings;
create policy "users can manage own settings"
on public.user_settings
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own accounts" on public.accounts;
create policy "users can manage own accounts"
on public.accounts
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own balance snapshots" on public.balance_snapshots;
create policy "users can manage own balance snapshots"
on public.balance_snapshots
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own investment plan" on public.investment_plan;
create policy "users can manage own investment plan"
on public.investment_plan
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own margin status" on public.margin_status;
create policy "users can manage own margin status"
on public.margin_status
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own disciplines" on public.disciplines;
create policy "users can manage own disciplines"
on public.disciplines
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own review logs" on public.review_logs;
create policy "users can manage own review logs"
on public.review_logs
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own yearly actuals" on public.yearly_actuals;
create policy "users can manage own yearly actuals"
on public.yearly_actuals
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can manage own cost basis trades" on public.cost_basis_trades;
create policy "users can manage own cost basis trades"
on public.cost_basis_trades
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
