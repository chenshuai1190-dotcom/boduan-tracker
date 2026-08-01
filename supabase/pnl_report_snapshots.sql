-- P&L report snapshot foundation.
-- Apply in the Supabase SQL editor after verifying this is the production project.
-- The report system is independent from the live trading display, but stock_trades remains the source of truth.

begin;

set local lock_timeout = '5s';

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
  dirty_from_date date not null,
  ledger_revision bigint not null default 0,
  generation bigint not null default 1,
  reason text not null default 'stock_trade_changed',
  source_trade_id uuid,
  updated_at timestamptz not null default now(),

  constraint pnl_report_rebuild_state_ledger_revision_check
    check (ledger_revision >= 0),
  constraint pnl_report_rebuild_state_generation_check
    check (generation > 0)
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
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_user_id uuid := auth.uid();
  current_ledger_revision bigint;
begin
  if caller_user_id is null then
    raise exception 'not authenticated'
      using errcode = '28000';
  end if;

  if p_dirty_from_date is null then
    raise exception 'dirty_from_date is required'
      using errcode = '22023';
  end if;

  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = caller_user_id
  for update;

  if not found then
    return;
  end if;

  update public.pnl_report_rebuild_state
  set dirty_from_date = least(
        coalesce(dirty_from_date, p_dirty_from_date),
        p_dirty_from_date
      ),
      reason = coalesce(nullif(btrim(p_reason), ''), reason),
      source_trade_id = coalesce(p_source_trade_id, source_trade_id),
      updated_at = clock_timestamp()
  where user_id = caller_user_id
    and ledger_revision = current_ledger_revision
    and dirty_from_date is not null;
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

alter table public.margin_debt_events enable row level security;
alter table public.margin_debt_events force row level security;
alter table public.margin_debt_history_meta enable row level security;
alter table public.margin_debt_history_meta force row level security;
alter table public.pnl_report_snapshots enable row level security;
alter table public.pnl_report_symbol_snapshots enable row level security;
alter table public.pnl_report_rebuild_state enable row level security;

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
drop policy if exists "users can read own pnl report snapshots" on public.pnl_report_snapshots;
create policy "users can read own pnl report snapshots"
on public.pnl_report_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can manage own pnl report symbol snapshots" on public.pnl_report_symbol_snapshots;
drop policy if exists "users can read own pnl report symbol snapshots" on public.pnl_report_symbol_snapshots;
create policy "users can read own pnl report symbol snapshots"
on public.pnl_report_symbol_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can manage own pnl report rebuild state" on public.pnl_report_rebuild_state;
drop policy if exists "users can read own pnl report rebuild state" on public.pnl_report_rebuild_state;
create policy "users can read own pnl report rebuild state"
on public.pnl_report_rebuild_state
for select
to authenticated
using (auth.uid() = user_id);

-- Canonical expand-only immediate rebuild contract. Keep this block aligned
-- with pnl_report_immediate_rebuild_20260801.sql.
lock table public.stock_trades in share row exclusive mode;

alter table public.pnl_report_rebuild_state
add column if not exists ledger_revision bigint;

alter table public.pnl_report_rebuild_state
add column if not exists generation bigint;

-- A rebuild-state row is a pending-work marker, not a durable clean-state row.
-- Remove legacy null markers before making that invariant explicit.
delete from public.pnl_report_rebuild_state
where dirty_from_date is null;

alter table public.pnl_report_rebuild_state
alter column dirty_from_date set not null;

insert into public.stock_trade_ledger_revisions (
  user_id,
  revision,
  last_mutated_at
)
select
  state.user_id,
  case
    when exists (
      select 1
      from public.stock_trades as trade
      where trade.user_id = state.user_id
    ) then 1
    else 0
  end,
  clock_timestamp()
from public.pnl_report_rebuild_state as state
on conflict (user_id) do nothing;

update public.pnl_report_rebuild_state as state
set ledger_revision = revision.revision,
    generation = greatest(coalesce(state.generation, 1), 1)
from public.stock_trade_ledger_revisions as revision
where revision.user_id = state.user_id
  and (
    state.ledger_revision is distinct from revision.revision
    or state.generation is null
    or state.generation < 1
  );

alter table public.pnl_report_rebuild_state
alter column ledger_revision set default 0;

alter table public.pnl_report_rebuild_state
alter column ledger_revision set not null;

alter table public.pnl_report_rebuild_state
alter column generation set default 1;

alter table public.pnl_report_rebuild_state
alter column generation set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pnl_report_rebuild_state_ledger_revision_check'
      and conrelid = 'public.pnl_report_rebuild_state'::regclass
  ) then
    alter table public.pnl_report_rebuild_state
    add constraint pnl_report_rebuild_state_ledger_revision_check
    check (ledger_revision >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pnl_report_rebuild_state_generation_check'
      and conrelid = 'public.pnl_report_rebuild_state'::regclass
  ) then
    alter table public.pnl_report_rebuild_state
    add constraint pnl_report_rebuild_state_generation_check
    check (generation > 0);
  end if;
end;
$$;

create table if not exists public.pnl_report_rebuild_jobs (
  operation_key text primary key,
  payload_hash text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_revision bigint not null,
  generation bigint not null,
  dirty_from_date date not null,
  through_date date,
  clear_all boolean not null,
  expected_portfolio_count integer not null,
  expected_symbol_count integer not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),

  constraint pnl_report_rebuild_jobs_operation_key_check
    check (char_length(operation_key) between 1 and 240),
  constraint pnl_report_rebuild_jobs_payload_hash_check
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint pnl_report_rebuild_jobs_revision_check
    check (ledger_revision >= 0),
  constraint pnl_report_rebuild_jobs_generation_check
    check (generation > 0),
  constraint pnl_report_rebuild_jobs_counts_check
    check (
      expected_portfolio_count between 0 and 10000
      and expected_symbol_count between 0 and 500000
    ),
  constraint pnl_report_rebuild_jobs_mode_check
    check (
      (
        clear_all
        and through_date is null
        and expected_portfolio_count = 0
        and expected_symbol_count = 0
      )
      or
      (
        not clear_all
        and through_date is not null
        and through_date >= dirty_from_date
        and expected_portfolio_count > 0
      )
    ),
  constraint pnl_report_rebuild_jobs_expiry_check
    check (expires_at > created_at),
  unique (operation_key, user_id, ledger_revision, generation)
);

create index if not exists pnl_report_rebuild_jobs_expiry_idx
on public.pnl_report_rebuild_jobs (expires_at);

create index if not exists pnl_report_rebuild_jobs_user_idx
on public.pnl_report_rebuild_jobs (user_id, updated_at desc);

create table if not exists public.pnl_report_rebuild_portfolio_stage (
  operation_key text not null,
  user_id uuid not null,
  ledger_revision bigint not null,
  generation bigint not null,
  snapshot_date date not null,
  row_data jsonb not null,
  staged_at timestamptz not null default clock_timestamp(),

  primary key (operation_key, snapshot_date),
  foreign key (operation_key, user_id, ledger_revision, generation)
    references public.pnl_report_rebuild_jobs (
      operation_key,
      user_id,
      ledger_revision,
      generation
    )
    on delete cascade,
  constraint pnl_report_rebuild_portfolio_stage_row_check
    check (jsonb_typeof(row_data) = 'object')
);

create table if not exists public.pnl_report_rebuild_symbol_stage (
  operation_key text not null,
  user_id uuid not null,
  ledger_revision bigint not null,
  generation bigint not null,
  snapshot_date date not null,
  symbol text not null,
  row_data jsonb not null,
  staged_at timestamptz not null default clock_timestamp(),

  primary key (operation_key, snapshot_date, symbol),
  foreign key (operation_key, user_id, ledger_revision, generation)
    references public.pnl_report_rebuild_jobs (
      operation_key,
      user_id,
      ledger_revision,
      generation
    )
    on delete cascade,
  constraint pnl_report_rebuild_symbol_stage_symbol_check
    check (
      symbol = upper(btrim(symbol))
      and symbol ~ '^[A-Z0-9._-]{1,15}$'
    ),
  constraint pnl_report_rebuild_symbol_stage_row_check
    check (jsonb_typeof(row_data) = 'object')
);

create index if not exists pnl_report_rebuild_portfolio_stage_user_idx
on public.pnl_report_rebuild_portfolio_stage (user_id, snapshot_date);

create index if not exists pnl_report_rebuild_symbol_stage_user_idx
on public.pnl_report_rebuild_symbol_stage (user_id, snapshot_date, symbol);

create table if not exists public.pnl_report_rebuild_audit (
  operation_key text primary key,
  operation_kind text not null,
  user_id uuid not null,
  ledger_revision bigint not null,
  generation bigint,
  dirty_from_date date,
  through_date date,
  snapshot_date date,
  portfolio_count integer not null,
  symbol_count integer not null,
  outcome text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint pnl_report_rebuild_audit_kind_check
    check (operation_kind in ('range_replace', 'range_clear', 'daily_write')),
  constraint pnl_report_rebuild_audit_revision_check
    check (ledger_revision >= 0),
  constraint pnl_report_rebuild_audit_generation_check
    check (generation is null or generation > 0),
  constraint pnl_report_rebuild_audit_counts_check
    check (portfolio_count >= 0 and symbol_count >= 0),
  constraint pnl_report_rebuild_audit_outcome_check
    check (outcome in ('recalculated', 'cleared', 'written'))
);

create index if not exists pnl_report_rebuild_audit_user_idx
on public.pnl_report_rebuild_audit (user_id, created_at desc);

alter table public.pnl_report_rebuild_jobs enable row level security;
alter table public.pnl_report_rebuild_jobs force row level security;
alter table public.pnl_report_rebuild_portfolio_stage enable row level security;
alter table public.pnl_report_rebuild_portfolio_stage force row level security;
alter table public.pnl_report_rebuild_symbol_stage enable row level security;
alter table public.pnl_report_rebuild_symbol_stage force row level security;
alter table public.pnl_report_rebuild_audit enable row level security;
alter table public.pnl_report_rebuild_audit force row level security;

revoke all privileges on table public.pnl_report_rebuild_jobs
from public, anon, authenticated, service_role;

revoke all privileges on table public.pnl_report_rebuild_portfolio_stage
from public, anon, authenticated, service_role;

revoke all privileges on table public.pnl_report_rebuild_symbol_stage
from public, anon, authenticated, service_role;

revoke all privileges on table public.pnl_report_rebuild_audit
from public, anon, authenticated, service_role;

grant select on table public.pnl_report_rebuild_jobs
to service_role;

grant select on table public.pnl_report_rebuild_portfolio_stage
to service_role;

grant select on table public.pnl_report_rebuild_symbol_stage
to service_role;

grant select on table public.pnl_report_rebuild_audit
to service_role;

create or replace function public.guard_pnl_report_rebuild_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'P&L report rebuild audit rows are immutable'
    using errcode = '55000';
end;
$$;

revoke execute on function public.guard_pnl_report_rebuild_audit_immutable()
from public, anon, authenticated, service_role;

drop trigger if exists pnl_report_rebuild_audit_immutable
on public.pnl_report_rebuild_audit;

create trigger pnl_report_rebuild_audit_immutable
before update or delete on public.pnl_report_rebuild_audit
for each row
execute function public.guard_pnl_report_rebuild_audit_immutable();

-- Legacy clients call this after the stock_trades statement has already fired
-- the authoritative trigger. Keep the call compatible, but do not trust any
-- browser-supplied date, reason or trade id: the trigger row is already the
-- complete source of truth. This also makes old metadata-only calls harmless.
create or replace function public.mark_pnl_report_dirty(
  p_dirty_from_date date,
  p_reason text default 'stock_trade_changed',
  p_source_trade_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if caller_user_id is null then
    raise exception 'not authenticated'
      using errcode = '28000';
  end if;

  if p_dirty_from_date is null then
    raise exception 'dirty_from_date is required'
      using errcode = '22023';
  end if;

  -- Intentionally no-op. The stock_trades trigger committed the authoritative
  -- dirty boundary in the same transaction as the ledger mutation.
  return;
end;
$$;

revoke execute on function public.mark_pnl_report_dirty(date, text, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.mark_pnl_report_dirty(date, text, uuid)
to authenticated;

-- This later definition is the active stock ledger trigger body. Earlier
-- dated competition migrations remain immutable; canonical files repeat this
-- override after their historical compatibility definition.
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
  affected_trade_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  next_revision bigint;
begin
  if tg_op = 'UPDATE' then
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

  if to_regclass('public.pnl_report_rebuild_state') is not null
    and exists (
      select 1
      from pg_attribute
      where attrelid = to_regclass('public.pnl_report_rebuild_state')
        and attname = 'ledger_revision'
        and not attisdropped
    )
    and exists (
      select 1
      from pg_attribute
      where attrelid = to_regclass('public.pnl_report_rebuild_state')
        and attname = 'generation'
        and not attisdropped
    )
  then
    insert into public.pnl_report_rebuild_state (
      user_id,
      dirty_from_date,
      ledger_revision,
      generation,
      reason,
      source_trade_id,
      updated_at
    )
    values (
      affected_user_id,
      affected_from_date,
      next_revision,
      1,
      case tg_op
        when 'INSERT' then 'stock_trade_inserted'
        when 'UPDATE' then 'stock_trade_updated'
        else 'stock_trade_deleted'
      end,
      affected_trade_id,
      clock_timestamp()
    )
    on conflict (user_id) do update
    set dirty_from_date = least(
          coalesce(public.pnl_report_rebuild_state.dirty_from_date, excluded.dirty_from_date),
          excluded.dirty_from_date
        ),
        ledger_revision = excluded.ledger_revision,
        generation = case
          when public.pnl_report_rebuild_state.ledger_revision
            is distinct from excluded.ledger_revision
          then public.pnl_report_rebuild_state.generation + 1
          else public.pnl_report_rebuild_state.generation
        end,
        reason = excluded.reason,
        source_trade_id = excluded.source_trade_id,
        updated_at = excluded.updated_at;
  end if;

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

create or replace function public.validate_pnl_report_portfolio_rows(
  p_user_id uuid,
  p_rows jsonb,
  p_from_date date,
  p_through_date date,
  p_allow_empty boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  row_count_value integer;
begin
  if p_user_id is null
    or p_from_date is null
    or p_through_date is null
    or p_through_date < p_from_date
  then
    raise exception 'invalid P&L portfolio validation range'
      using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'portfolio_rows must be a JSON array'
      using errcode = '22023';
  end if;

  row_count_value := jsonb_array_length(p_rows);
  if row_count_value > 250 then
    raise exception 'portfolio staging chunk exceeds 250 rows'
      using errcode = '22023';
  end if;
  if not p_allow_empty and row_count_value = 0 then
    raise exception 'portfolio_rows must not be empty'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception 'every portfolio row must be a JSON object'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    cross join lateral jsonb_object_keys(item.value) as field(key)
    where not (field.key = any (array[
      'user_id', 'snapshot_date', 'currency', 'cash_usd',
      'market_value_usd', 'total_assets_usd', 'margin_debt_usd',
      'margin_debt_event_id', 'margin_debt_effective_at',
      'margin_debt_basis', 'realized_pnl_usd', 'unrealized_pnl_usd',
      'cumulative_pnl_usd', 'cumulative_pnl_pct', 'daily_pnl_usd',
      'daily_pnl_pct', 'total_buy_cost_usd', 'sell_proceeds_usd',
      'trade_count', 'holding_count', 'source_version', 'locked_at',
      'updated_at'
    ]::text[]))
  ) then
    raise exception 'portfolio row contains an unknown or server-owned field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where not (
      item.value ?& array[
        'user_id', 'snapshot_date', 'currency', 'cash_usd',
        'market_value_usd', 'total_assets_usd', 'margin_debt_usd',
        'margin_debt_event_id', 'margin_debt_effective_at',
        'margin_debt_basis', 'realized_pnl_usd', 'unrealized_pnl_usd',
        'cumulative_pnl_usd', 'cumulative_pnl_pct', 'daily_pnl_usd',
        'daily_pnl_pct', 'total_buy_cost_usd', 'sell_proceeds_usd',
        'trade_count', 'holding_count', 'source_version', 'locked_at'
      ]::text[]
    )
  ) then
    raise exception 'portfolio row is missing required fields'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    cross join lateral jsonb_each(item.value) as field(key, value)
    where field.key = any (array[
      'cash_usd', 'market_value_usd', 'total_assets_usd',
      'realized_pnl_usd', 'unrealized_pnl_usd', 'cumulative_pnl_usd',
      'cumulative_pnl_pct', 'total_buy_cost_usd', 'sell_proceeds_usd',
      'trade_count', 'holding_count'
    ]::text[])
      and jsonb_typeof(field.value) <> 'number'
  ) then
    raise exception 'portfolio non-null numeric fields must be JSON numbers'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    cross join lateral jsonb_each(item.value) as field(key, value)
    where field.key = any (array[
      'margin_debt_usd', 'daily_pnl_usd', 'daily_pnl_pct'
    ]::text[])
      and jsonb_typeof(field.value) not in ('number', 'null')
  ) then
    raise exception 'portfolio nullable numeric fields must be JSON numbers or null'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where jsonb_typeof(item.value->'user_id') <> 'string'
      or jsonb_typeof(item.value->'snapshot_date') <> 'string'
      or jsonb_typeof(item.value->'currency') <> 'string'
      or jsonb_typeof(item.value->'source_version') <> 'string'
      or jsonb_typeof(item.value->'margin_debt_event_id')
        not in ('number', 'string', 'null')
      or jsonb_typeof(item.value->'margin_debt_effective_at') not in ('string', 'null')
      or jsonb_typeof(item.value->'margin_debt_basis') not in ('string', 'null')
      or jsonb_typeof(item.value->'locked_at') not in ('string', 'null')
      or (
        item.value ? 'updated_at'
        and jsonb_typeof(item.value->'updated_at') not in ('string', 'null')
      )
  ) then
    raise exception 'portfolio text/timestamp fields have invalid JSON types'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where (item.value->>'user_id')::uuid is distinct from p_user_id
      or (item.value->>'snapshot_date')::date < p_from_date
      or (item.value->>'snapshot_date')::date > p_through_date
      or item.value->>'currency' <> 'USD'
      or item.value->>'source_version' <> 'pnl_snapshot_v2'
      or (item.value->>'trade_count')::numeric < 0
      or (item.value->>'trade_count')::numeric
        <> trunc((item.value->>'trade_count')::numeric)
      or (item.value->>'holding_count')::numeric < 0
      or (item.value->>'holding_count')::numeric
        <> trunc((item.value->>'holding_count')::numeric)
      or (
        jsonb_typeof(item.value->'margin_debt_event_id') = 'number'
        and (
          (item.value->>'margin_debt_event_id')::numeric <= 0
          or (item.value->>'margin_debt_event_id')::numeric
            <> trunc((item.value->>'margin_debt_event_id')::numeric)
        )
      )
      or (
        jsonb_typeof(item.value->'margin_debt_event_id') = 'string'
        and item.value->>'margin_debt_event_id' !~ '^[1-9][0-9]*$'
      )
  ) then
    raise exception 'portfolio row user/date/source/count values are invalid'
      using errcode = '22023';
  end if;

  -- Force canonical casts during staging so invalid timestamps or oversized
  -- identity values fail before any live snapshot transaction starts.
  perform
    (item.value->>'margin_debt_event_id')::bigint,
    (item.value->>'margin_debt_effective_at')::timestamptz,
    (item.value->>'locked_at')::timestamptz
  from jsonb_array_elements(p_rows) as item(value);

  if exists (
    select parsed.snapshot_date
    from jsonb_to_recordset(p_rows) as parsed(snapshot_date date)
    group by parsed.snapshot_date
    having count(*) > 1
  ) then
    raise exception 'portfolio_rows contains duplicate snapshot dates'
      using errcode = '22023';
  end if;
end;
$$;

create or replace function public.validate_pnl_report_symbol_rows(
  p_user_id uuid,
  p_rows jsonb,
  p_from_date date,
  p_through_date date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  row_count_value integer;
begin
  if p_user_id is null
    or p_from_date is null
    or p_through_date is null
    or p_through_date < p_from_date
  then
    raise exception 'invalid P&L symbol validation range'
      using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'symbol_rows must be a JSON array'
      using errcode = '22023';
  end if;

  row_count_value := jsonb_array_length(p_rows);
  if row_count_value > 5000 then
    raise exception 'symbol staging chunk exceeds 5000 rows'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception 'every symbol row must be a JSON object'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    cross join lateral jsonb_object_keys(item.value) as field(key)
    where not (field.key = any (array[
      'user_id', 'snapshot_date', 'symbol', 'name', 'currency',
      'held_shares', 'avg_cost_usd', 'remaining_cost_usd',
      'current_price_usd', 'previous_close_usd', 'market_value_usd',
      'realized_pnl_usd', 'unrealized_pnl_usd', 'cumulative_pnl_usd',
      'daily_pnl_usd', 'daily_pnl_pct', 'total_buy_cost_usd',
      'sell_proceeds_usd', 'sold_cost_usd', 'total_buy_shares',
      'total_sell_shares', 'is_open', 'source_version', 'updated_at'
    ]::text[]))
  ) then
    raise exception 'symbol row contains an unknown or server-owned field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where not (
      item.value ?& array[
        'user_id', 'snapshot_date', 'symbol', 'name', 'currency',
        'held_shares', 'avg_cost_usd', 'remaining_cost_usd',
        'current_price_usd', 'previous_close_usd', 'market_value_usd',
        'realized_pnl_usd', 'unrealized_pnl_usd', 'cumulative_pnl_usd',
        'daily_pnl_usd', 'daily_pnl_pct', 'total_buy_cost_usd',
        'sell_proceeds_usd', 'sold_cost_usd', 'total_buy_shares',
        'total_sell_shares', 'is_open', 'source_version'
      ]::text[]
    )
  ) then
    raise exception 'symbol row is missing required fields'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    cross join lateral jsonb_each(item.value) as field(key, value)
    where field.key = any (array[
      'held_shares', 'avg_cost_usd', 'remaining_cost_usd',
      'current_price_usd', 'previous_close_usd', 'market_value_usd',
      'realized_pnl_usd', 'unrealized_pnl_usd', 'cumulative_pnl_usd',
      'total_buy_cost_usd', 'sell_proceeds_usd', 'sold_cost_usd',
      'total_buy_shares', 'total_sell_shares'
    ]::text[])
      and jsonb_typeof(field.value) <> 'number'
  ) then
    raise exception 'symbol non-null numeric fields must be JSON numbers'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    cross join lateral jsonb_each(item.value) as field(key, value)
    where field.key = any (array['daily_pnl_usd', 'daily_pnl_pct']::text[])
      and jsonb_typeof(field.value) not in ('number', 'null')
  ) then
    raise exception 'symbol nullable numeric fields must be JSON numbers or null'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where jsonb_typeof(item.value->'user_id') <> 'string'
      or jsonb_typeof(item.value->'snapshot_date') <> 'string'
      or jsonb_typeof(item.value->'symbol') <> 'string'
      or jsonb_typeof(item.value->'name') <> 'string'
      or jsonb_typeof(item.value->'currency') <> 'string'
      or jsonb_typeof(item.value->'is_open') <> 'boolean'
      or jsonb_typeof(item.value->'source_version') <> 'string'
      or (
        item.value ? 'updated_at'
        and jsonb_typeof(item.value->'updated_at') not in ('string', 'null')
      )
  ) then
    raise exception 'symbol text/boolean fields have invalid JSON types'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where (item.value->>'user_id')::uuid is distinct from p_user_id
      or (item.value->>'snapshot_date')::date < p_from_date
      or (item.value->>'snapshot_date')::date > p_through_date
      or item.value->>'symbol' <> upper(btrim(item.value->>'symbol'))
      or item.value->>'symbol' !~ '^[A-Z0-9._-]{1,15}$'
      or item.value->>'currency' <> 'USD'
      or item.value->>'source_version' <> 'pnl_snapshot_v2'
      or (item.value->>'current_price_usd')::numeric < 0
      or (item.value->>'previous_close_usd')::numeric < 0
      or (
        (item.value->>'is_open')::boolean
        and (
          (item.value->>'held_shares')::numeric <= 0
          or (item.value->>'remaining_cost_usd')::numeric <= 0
          or (item.value->>'current_price_usd')::numeric <= 0
        )
      )
      or (
        not (item.value->>'is_open')::boolean
        and (
          (item.value->>'held_shares')::numeric <> 0
          or (item.value->>'remaining_cost_usd')::numeric <> 0
          or (item.value->>'market_value_usd')::numeric <> 0
          or (item.value->>'unrealized_pnl_usd')::numeric <> 0
        )
      )
      or (item.value->>'held_shares')::numeric < 0
      or (item.value->>'avg_cost_usd')::numeric < 0
      or (item.value->>'remaining_cost_usd')::numeric < 0
      or (item.value->>'market_value_usd')::numeric < 0
      or (item.value->>'total_buy_cost_usd')::numeric < 0
      or (item.value->>'sell_proceeds_usd')::numeric < 0
      or (item.value->>'sold_cost_usd')::numeric < 0
      or (item.value->>'total_buy_shares')::numeric < 0
      or (item.value->>'total_sell_shares')::numeric < 0
  ) then
    raise exception 'symbol row user/date/source/price values are invalid'
      using errcode = '22023';
  end if;

  if exists (
    select
      parsed.snapshot_date,
      upper(btrim(parsed.symbol))
    from jsonb_to_recordset(p_rows) as parsed(snapshot_date date, symbol text)
    group by parsed.snapshot_date, upper(btrim(parsed.symbol))
    having count(*) > 1
  ) then
    raise exception 'symbol_rows contains duplicate normalized symbols'
      using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.validate_pnl_report_portfolio_rows(
  uuid, jsonb, date, date, boolean
)
from public, anon, authenticated, service_role;

revoke execute on function public.validate_pnl_report_symbol_rows(
  uuid, jsonb, date, date
)
from public, anon, authenticated, service_role;

create or replace function public.cleanup_pnl_report_rebuild_jobs(
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'cleanup limit must be between 1 and 5000'
      using errcode = '22023';
  end if;

  with expired as (
    select operation_key
    from public.pnl_report_rebuild_jobs
    where expires_at <= clock_timestamp()
    order by expires_at, operation_key
    for update skip locked
    limit p_limit
  )
  delete from public.pnl_report_rebuild_jobs as job
  using expired
  where job.operation_key = expired.operation_key;

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'outcome', 'cleaned',
    'deletedJobs', deleted_count
  );
end;
$$;

create or replace function public.rotate_pnl_report_rebuild_attempt(
  p_user_id uuid,
  p_expected_ledger_revision bigint,
  p_expected_generation bigint,
  p_expected_dirty_from_date date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_ledger_revision bigint;
  state_row public.pnl_report_rebuild_state%rowtype;
  state_found boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  if p_user_id is null
    or p_expected_ledger_revision is null
    or p_expected_ledger_revision < 0
    or p_expected_generation is null
    or p_expected_generation < 1
    or p_expected_dirty_from_date is null
  then
    raise exception 'invalid P&L rebuild rotation metadata'
      using errcode = '22023';
  end if;

  -- Preserve the shared per-user lock order used by the ledger trigger and
  -- finalize RPC. This operation changes scheduling order only.
  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  if current_ledger_revision is distinct from p_expected_ledger_revision then
    return jsonb_build_object('outcome', 'stale');
  end if;

  select *
  into state_row
  from public.pnl_report_rebuild_state
  where user_id = p_user_id
  for update;
  state_found := found;

  if not state_found then
    return jsonb_build_object('outcome', 'already_current');
  end if;

  if state_row.ledger_revision is distinct from p_expected_ledger_revision
    or state_row.generation is distinct from p_expected_generation
    or state_row.dirty_from_date is distinct from p_expected_dirty_from_date
  then
    return jsonb_build_object('outcome', 'stale');
  end if;

  update public.pnl_report_rebuild_state
  set updated_at = clock_timestamp()
  where user_id = p_user_id;

  return jsonb_build_object(
    'outcome', 'rotated',
    'fromDate', p_expected_dirty_from_date,
    'ledgerRevision', p_expected_ledger_revision,
    'generation', p_expected_generation
  );
end;
$$;

create or replace function public.begin_pnl_report_dirty_range(
  p_user_id uuid,
  p_operation_key text,
  p_payload_hash text,
  p_expected_ledger_revision bigint,
  p_expected_generation bigint,
  p_expected_dirty_from_date date,
  p_through_date date,
  p_expected_portfolio_count integer,
  p_expected_symbol_count integer,
  p_clear_all boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_operation_key text;
  current_ledger_revision bigint;
  state_row public.pnl_report_rebuild_state%rowtype;
  state_found boolean := false;
  job_row public.pnl_report_rebuild_jobs%rowtype;
  job_found boolean := false;
  portfolio_count_value integer := 0;
  symbol_count_value integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  if p_user_id is null
    or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_expected_ledger_revision is null
    or p_expected_ledger_revision < 0
    or p_expected_generation is null
    or p_expected_generation < 1
    or p_expected_dirty_from_date is null
    or p_clear_all is null
    or p_expected_portfolio_count is null
    or p_expected_symbol_count is null
    or p_expected_portfolio_count < 0
    or p_expected_portfolio_count > 10000
    or p_expected_symbol_count < 0
    or p_expected_symbol_count > 500000
  then
    raise exception 'invalid P&L rebuild job metadata'
      using errcode = '22023';
  end if;

  if p_clear_all then
    if p_through_date is not null
      or p_expected_portfolio_count <> 0
      or p_expected_symbol_count <> 0
    then
      raise exception 'clear-all jobs require null through date and zero row counts'
        using errcode = '22023';
    end if;
  elsif p_through_date is null
    or p_through_date < p_expected_dirty_from_date
    or p_expected_portfolio_count = 0
  then
    raise exception 'range jobs require a valid through date and portfolio rows'
      using errcode = '22023';
  end if;

  expected_operation_key := format(
    'pnl-ledger-rebuild:%s:%s:%s:%s:%s',
    p_user_id,
    p_expected_ledger_revision,
    p_expected_generation,
    case when p_clear_all then 'clear' else p_through_date::text end,
    p_payload_hash
  );
  if p_operation_key is distinct from expected_operation_key then
    raise exception 'invalid P&L rebuild operation key'
      using errcode = '22023';
  end if;

  -- Runtime lock order starts with the per-user canonical revision row.
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
  into state_row
  from public.pnl_report_rebuild_state
  where user_id = p_user_id
  for update;
  state_found := found;

  if current_ledger_revision is distinct from p_expected_ledger_revision then
    return jsonb_build_object(
      'outcome', 'stale',
      'fromDate', case when state_found then state_row.dirty_from_date else p_expected_dirty_from_date end,
      'throughDate', p_through_date,
      'ledgerRevision', current_ledger_revision,
      'generation', case when state_found then state_row.generation else p_expected_generation end,
      'stagedPortfolio', 0,
      'stagedSymbols', 0
    );
  end if;

  if not state_found then
    delete from public.pnl_report_rebuild_jobs
    where operation_key = p_operation_key;

    return jsonb_build_object(
      'outcome', 'already_current',
      'fromDate', p_expected_dirty_from_date,
      'throughDate', p_through_date,
      'ledgerRevision', current_ledger_revision,
      'generation', p_expected_generation,
      'stagedPortfolio', 0,
      'stagedSymbols', 0
    );
  end if;

  if state_row.dirty_from_date is distinct from p_expected_dirty_from_date
    or state_row.ledger_revision is distinct from p_expected_ledger_revision
    or state_row.generation is distinct from p_expected_generation
  then
    return jsonb_build_object(
      'outcome', 'stale',
      'fromDate', state_row.dirty_from_date,
      'throughDate', p_through_date,
      'ledgerRevision', current_ledger_revision,
      'generation', state_row.generation,
      'stagedPortfolio', 0,
      'stagedSymbols', 0
    );
  end if;

  select *
  into job_row
  from public.pnl_report_rebuild_jobs
  where operation_key = p_operation_key
  for update;
  job_found := found;

  if job_found and job_row.expires_at <= clock_timestamp() then
    delete from public.pnl_report_rebuild_jobs
    where operation_key = p_operation_key;
    job_found := false;
  end if;

  if not job_found then
    insert into public.pnl_report_rebuild_jobs (
      operation_key,
      payload_hash,
      user_id,
      ledger_revision,
      generation,
      dirty_from_date,
      through_date,
      clear_all,
      expected_portfolio_count,
      expected_symbol_count,
      created_at,
      updated_at,
      expires_at
    )
    values (
      p_operation_key,
      p_payload_hash,
      p_user_id,
      p_expected_ledger_revision,
      p_expected_generation,
      p_expected_dirty_from_date,
      p_through_date,
      p_clear_all,
      p_expected_portfolio_count,
      p_expected_symbol_count,
      clock_timestamp(),
      clock_timestamp(),
      clock_timestamp() + interval '24 hours'
    );
  elsif job_row.payload_hash is distinct from p_payload_hash
    or job_row.user_id is distinct from p_user_id
    or job_row.ledger_revision is distinct from p_expected_ledger_revision
    or job_row.generation is distinct from p_expected_generation
    or job_row.dirty_from_date is distinct from p_expected_dirty_from_date
    or job_row.through_date is distinct from p_through_date
    or job_row.clear_all is distinct from p_clear_all
    or job_row.expected_portfolio_count is distinct from p_expected_portfolio_count
    or job_row.expected_symbol_count is distinct from p_expected_symbol_count
  then
    raise exception 'operation key is already bound to different rebuild metadata'
      using errcode = '23505';
  else
    update public.pnl_report_rebuild_jobs
    set updated_at = clock_timestamp(),
        expires_at = clock_timestamp() + interval '24 hours'
    where operation_key = p_operation_key;
  end if;

  select count(*)
  into portfolio_count_value
  from public.pnl_report_rebuild_portfolio_stage
  where operation_key = p_operation_key;

  select count(*)
  into symbol_count_value
  from public.pnl_report_rebuild_symbol_stage
  where operation_key = p_operation_key;

  return jsonb_build_object(
    'outcome', 'ready',
    'fromDate', p_expected_dirty_from_date,
    'throughDate', p_through_date,
    'ledgerRevision', p_expected_ledger_revision,
    'generation', p_expected_generation,
    'stagedPortfolio', portfolio_count_value,
    'stagedSymbols', symbol_count_value
  );
end;
$$;

create or replace function public.stage_pnl_report_dirty_range(
  p_user_id uuid,
  p_operation_key text,
  p_payload_hash text,
  p_expected_ledger_revision bigint,
  p_expected_generation bigint,
  p_portfolio_rows jsonb,
  p_symbol_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_row public.pnl_report_rebuild_jobs%rowtype;
  current_ledger_revision bigint;
  state_row public.pnl_report_rebuild_state%rowtype;
  state_found boolean := false;
  audit_row public.pnl_report_rebuild_audit%rowtype;
  audit_found boolean := false;
  portfolio_count_value integer := 0;
  symbol_count_value integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  if p_user_id is null
    or p_operation_key is null
    or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_expected_ledger_revision is null
    or p_expected_generation is null
  then
    raise exception 'invalid P&L staging metadata'
      using errcode = '22023';
  end if;
  if cardinality(string_to_array(p_operation_key, ':')) <> 6
    or split_part(p_operation_key, ':', 1) <> 'pnl-ledger-rebuild'
    or split_part(p_operation_key, ':', 2) <> p_user_id::text
    or split_part(p_operation_key, ':', 3) <> p_expected_ledger_revision::text
    or split_part(p_operation_key, ':', 4) <> p_expected_generation::text
    or split_part(p_operation_key, ':', 6) <> p_payload_hash
  then
    raise exception 'invalid P&L staging operation key'
      using errcode = '22023';
  end if;
  if p_portfolio_rows is null or jsonb_typeof(p_portfolio_rows) <> 'array' then
    raise exception 'portfolio_rows must be a JSON array'
      using errcode = '22023';
  end if;
  if p_symbol_rows is null or jsonb_typeof(p_symbol_rows) <> 'array' then
    raise exception 'symbol_rows must be a JSON array'
      using errcode = '22023';
  end if;

  select *
  into job_row
  from public.pnl_report_rebuild_jobs
  where operation_key = p_operation_key
  for update;

  if not found then
    select revision
    into current_ledger_revision
    from public.stock_trade_ledger_revisions
    where user_id = p_user_id
    for update;

    select *
    into state_row
    from public.pnl_report_rebuild_state
    where user_id = p_user_id
    for update;
    state_found := found;

    select *
    into audit_row
    from public.pnl_report_rebuild_audit
    where operation_key = p_operation_key
      and user_id = p_user_id
      and ledger_revision = p_expected_ledger_revision
      and generation = p_expected_generation;
    audit_found := found;

    if audit_found
      and current_ledger_revision is not distinct from p_expected_ledger_revision
      and not state_found
    then
      return jsonb_build_object(
        'outcome', 'already_current',
        'fromDate', audit_row.dirty_from_date,
        'throughDate', audit_row.through_date,
        'ledgerRevision', current_ledger_revision,
        'generation', p_expected_generation,
        'stagedPortfolio', audit_row.portfolio_count,
        'stagedSymbols', audit_row.symbol_count
      );
    end if;

    return jsonb_build_object(
      'outcome', 'stale',
      'fromDate', case
        when state_found then state_row.dirty_from_date
        when audit_found then audit_row.dirty_from_date
        else null
      end,
      'throughDate', case when audit_found then audit_row.through_date else null end,
      'ledgerRevision', current_ledger_revision,
      'generation', case when state_found then state_row.generation else p_expected_generation end,
      'stagedPortfolio', 0,
      'stagedSymbols', 0
    );
  end if;

  if job_row.expires_at <= clock_timestamp() then
    delete from public.pnl_report_rebuild_jobs
    where operation_key = p_operation_key;
    return jsonb_build_object(
      'outcome', 'stale',
      'fromDate', job_row.dirty_from_date,
      'throughDate', job_row.through_date,
      'ledgerRevision', job_row.ledger_revision,
      'generation', job_row.generation,
      'stagedPortfolio', 0,
      'stagedSymbols', 0
    );
  end if;

  if job_row.payload_hash is distinct from p_payload_hash
    or job_row.user_id is distinct from p_user_id
    or job_row.ledger_revision is distinct from p_expected_ledger_revision
    or job_row.generation is distinct from p_expected_generation
  then
    raise exception 'P&L staging metadata does not match its job'
      using errcode = '22023';
  end if;

  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id;

  select *
  into state_row
  from public.pnl_report_rebuild_state
  where user_id = p_user_id;
  state_found := found;

  if current_ledger_revision is distinct from p_expected_ledger_revision
    or (
      state_found
      and (
        state_row.dirty_from_date is distinct from job_row.dirty_from_date
        or state_row.ledger_revision is distinct from p_expected_ledger_revision
        or state_row.generation is distinct from p_expected_generation
      )
    )
  then
    return jsonb_build_object(
      'outcome', 'stale',
      'fromDate', case when state_found then state_row.dirty_from_date else job_row.dirty_from_date end,
      'throughDate', job_row.through_date,
      'ledgerRevision', current_ledger_revision,
      'generation', case when state_found then state_row.generation else job_row.generation end,
      'stagedPortfolio', 0,
      'stagedSymbols', 0
    );
  end if;

  if not state_found then
    return jsonb_build_object(
      'outcome', 'already_current',
      'fromDate', job_row.dirty_from_date,
      'throughDate', job_row.through_date,
      'ledgerRevision', current_ledger_revision,
      'generation', job_row.generation,
      'stagedPortfolio', 0,
      'stagedSymbols', 0
    );
  end if;

  if job_row.clear_all then
    if jsonb_array_length(p_portfolio_rows) <> 0
      or jsonb_array_length(p_symbol_rows) <> 0
    then
      raise exception 'clear-all jobs cannot stage snapshot rows'
        using errcode = '22023';
    end if;
  else
    perform public.validate_pnl_report_portfolio_rows(
      p_user_id,
      p_portfolio_rows,
      job_row.dirty_from_date,
      job_row.through_date,
      true
    );
    perform public.validate_pnl_report_symbol_rows(
      p_user_id,
      p_symbol_rows,
      job_row.dirty_from_date,
      job_row.through_date
    );
  end if;

  insert into public.pnl_report_rebuild_portfolio_stage (
    operation_key,
    user_id,
    ledger_revision,
    generation,
    snapshot_date,
    row_data,
    staged_at
  )
  select
    p_operation_key,
    p_user_id,
    p_expected_ledger_revision,
    p_expected_generation,
    (item.value->>'snapshot_date')::date,
    item.value,
    clock_timestamp()
  from jsonb_array_elements(p_portfolio_rows) as item(value)
  on conflict (operation_key, snapshot_date) do update
  set row_data = excluded.row_data,
      staged_at = excluded.staged_at;

  insert into public.pnl_report_rebuild_symbol_stage (
    operation_key,
    user_id,
    ledger_revision,
    generation,
    snapshot_date,
    symbol,
    row_data,
    staged_at
  )
  select
    p_operation_key,
    p_user_id,
    p_expected_ledger_revision,
    p_expected_generation,
    (item.value->>'snapshot_date')::date,
    upper(btrim(item.value->>'symbol')),
    item.value,
    clock_timestamp()
  from jsonb_array_elements(p_symbol_rows) as item(value)
  on conflict (operation_key, snapshot_date, symbol) do update
  set row_data = excluded.row_data,
      staged_at = excluded.staged_at;

  select count(*)
  into portfolio_count_value
  from public.pnl_report_rebuild_portfolio_stage
  where operation_key = p_operation_key;

  select count(*)
  into symbol_count_value
  from public.pnl_report_rebuild_symbol_stage
  where operation_key = p_operation_key;

  if portfolio_count_value > job_row.expected_portfolio_count
    or symbol_count_value > job_row.expected_symbol_count
  then
    raise exception 'staged P&L rows exceed the job expected counts'
      using errcode = '22023';
  end if;

  update public.pnl_report_rebuild_jobs
  set updated_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '24 hours'
  where operation_key = p_operation_key;

  return jsonb_build_object(
    'outcome', 'staged',
    'fromDate', job_row.dirty_from_date,
    'throughDate', job_row.through_date,
    'ledgerRevision', job_row.ledger_revision,
    'generation', job_row.generation,
    'stagedPortfolio', portfolio_count_value,
    'stagedSymbols', symbol_count_value
  );
end;
$$;

revoke execute on function public.cleanup_pnl_report_rebuild_jobs(integer)
from public, anon, authenticated, service_role;

grant execute on function public.cleanup_pnl_report_rebuild_jobs(integer)
to service_role;

revoke execute on function public.rotate_pnl_report_rebuild_attempt(
  uuid, bigint, bigint, date
)
from public, anon, authenticated, service_role;

grant execute on function public.rotate_pnl_report_rebuild_attempt(
  uuid, bigint, bigint, date
)
to service_role;

revoke execute on function public.begin_pnl_report_dirty_range(
  uuid, text, text, bigint, bigint, date, date, integer, integer, boolean
)
from public, anon, authenticated, service_role;

grant execute on function public.begin_pnl_report_dirty_range(
  uuid, text, text, bigint, bigint, date, date, integer, integer, boolean
)
to service_role;

revoke execute on function public.stage_pnl_report_dirty_range(
  uuid, text, text, bigint, bigint, jsonb, jsonb
)
from public, anon, authenticated, service_role;

grant execute on function public.stage_pnl_report_dirty_range(
  uuid, text, text, bigint, bigint, jsonb, jsonb
)
to service_role;

create or replace function public.replace_pnl_report_dirty_range(
  p_user_id uuid,
  p_operation_key text,
  p_payload_hash text,
  p_expected_ledger_revision bigint,
  p_expected_generation bigint,
  p_expected_dirty_from_date date,
  p_through_date date,
  p_portfolio_rows jsonb,
  p_symbol_rows jsonb,
  p_clear_all boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_operation_key text;
  current_ledger_revision bigint;
  state_row public.pnl_report_rebuild_state%rowtype;
  state_found boolean := false;
  job_row public.pnl_report_rebuild_jobs%rowtype;
  job_found boolean := false;
  audit_row public.pnl_report_rebuild_audit%rowtype;
  audit_found boolean := false;
  stage_result jsonb;
  portfolio_count_value integer := 0;
  symbol_count_value integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  if p_user_id is null
    or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_expected_ledger_revision is null
    or p_expected_ledger_revision < 0
    or p_expected_generation is null
    or p_expected_generation < 1
    or p_expected_dirty_from_date is null
    or p_clear_all is null
  then
    raise exception 'invalid P&L finalize metadata'
      using errcode = '22023';
  end if;
  if p_portfolio_rows is null or jsonb_typeof(p_portfolio_rows) <> 'array' then
    raise exception 'portfolio_rows must be a JSON array'
      using errcode = '22023';
  end if;
  if p_symbol_rows is null or jsonb_typeof(p_symbol_rows) <> 'array' then
    raise exception 'symbol_rows must be a JSON array'
      using errcode = '22023';
  end if;

  if p_clear_all then
    if p_through_date is not null
      or jsonb_array_length(p_portfolio_rows) <> 0
      or jsonb_array_length(p_symbol_rows) <> 0
    then
      raise exception 'clear-all finalize requires null through date and empty payloads'
        using errcode = '22023';
    end if;
  elsif p_through_date is null
    or p_through_date < p_expected_dirty_from_date
  then
    raise exception 'range finalize requires a valid through date'
      using errcode = '22023';
  end if;

  expected_operation_key := format(
    'pnl-ledger-rebuild:%s:%s:%s:%s:%s',
    p_user_id,
    p_expected_ledger_revision,
    p_expected_generation,
    case when p_clear_all then 'clear' else p_through_date::text end,
    p_payload_hash
  );
  if p_operation_key is distinct from expected_operation_key then
    raise exception 'invalid P&L rebuild operation key'
      using errcode = '22023';
  end if;

  insert into public.stock_trade_ledger_revisions (
    user_id,
    revision,
    last_mutated_at
  )
  values (p_user_id, 0, null)
  on conflict (user_id) do nothing;

  -- Fixed runtime lock order: revision -> dirty state -> destination rows.
  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  select *
  into state_row
  from public.pnl_report_rebuild_state
  where user_id = p_user_id
  for update;
  state_found := found;

  if current_ledger_revision is distinct from p_expected_ledger_revision then
    return jsonb_build_object(
      'outcome', 'stale',
      'fromDate', case when state_found then state_row.dirty_from_date else p_expected_dirty_from_date end,
      'throughDate', p_through_date,
      'ledgerRevision', current_ledger_revision,
      'generation', case when state_found then state_row.generation else p_expected_generation end,
      'replacedPortfolio', 0,
      'replacedSymbols', 0
    );
  end if;

  if not state_found then
    select *
    into audit_row
    from public.pnl_report_rebuild_audit
    where operation_key = p_operation_key;
    audit_found := found;

    delete from public.pnl_report_rebuild_jobs
    where operation_key = p_operation_key;

    return jsonb_build_object(
      'outcome', 'already_current',
      'fromDate', p_expected_dirty_from_date,
      'throughDate', p_through_date,
      'ledgerRevision', current_ledger_revision,
      'generation', p_expected_generation,
      'replacedPortfolio', case when audit_found then audit_row.portfolio_count else 0 end,
      'replacedSymbols', case when audit_found then audit_row.symbol_count else 0 end
    );
  end if;

  if state_row.dirty_from_date is distinct from p_expected_dirty_from_date
    or state_row.ledger_revision is distinct from p_expected_ledger_revision
    or state_row.generation is distinct from p_expected_generation
  then
    return jsonb_build_object(
      'outcome', 'stale',
      'fromDate', state_row.dirty_from_date,
      'throughDate', p_through_date,
      'ledgerRevision', current_ledger_revision,
      'generation', state_row.generation,
      'replacedPortfolio', 0,
      'replacedSymbols', 0
    );
  end if;

  if p_clear_all then
    perform 1
    from public.pnl_report_snapshots
    where user_id = p_user_id
    order by snapshot_date, id
    for update;

    perform 1
    from public.pnl_report_symbol_snapshots
    where user_id = p_user_id
    order by snapshot_date, symbol, id
    for update;
  else
    perform 1
    from public.pnl_report_snapshots
    where user_id = p_user_id
      and snapshot_date >= p_expected_dirty_from_date
    order by snapshot_date, id
    for update;

    perform 1
    from public.pnl_report_symbol_snapshots
    where user_id = p_user_id
      and snapshot_date >= p_expected_dirty_from_date
    order by snapshot_date, symbol, id
    for update;
  end if;

  select *
  into job_row
  from public.pnl_report_rebuild_jobs
  where operation_key = p_operation_key
  for update;
  job_found := found;

  if not job_found or job_row.expires_at <= clock_timestamp() then
    raise exception 'P&L rebuild job does not exist or has expired'
      using errcode = '55000';
  end if;

  if job_row.payload_hash is distinct from p_payload_hash
    or job_row.user_id is distinct from p_user_id
    or job_row.ledger_revision is distinct from p_expected_ledger_revision
    or job_row.generation is distinct from p_expected_generation
    or job_row.dirty_from_date is distinct from p_expected_dirty_from_date
    or job_row.through_date is distinct from p_through_date
    or job_row.clear_all is distinct from p_clear_all
  then
    raise exception 'P&L finalize metadata does not match its staging job'
      using errcode = '22023';
  end if;

  -- The agreed finalize signature can carry one last bounded chunk. Normal
  -- callers pass []/[] after all chunks have already been staged.
  stage_result := public.stage_pnl_report_dirty_range(
    p_user_id,
    p_operation_key,
    p_payload_hash,
    p_expected_ledger_revision,
    p_expected_generation,
    p_portfolio_rows,
    p_symbol_rows
  );
  if stage_result->>'outcome' <> 'staged' then
    raise exception 'P&L staging state changed during finalize'
      using errcode = '40001';
  end if;

  select count(*)
  into portfolio_count_value
  from public.pnl_report_rebuild_portfolio_stage
  where operation_key = p_operation_key;

  select count(*)
  into symbol_count_value
  from public.pnl_report_rebuild_symbol_stage
  where operation_key = p_operation_key;

  if portfolio_count_value <> job_row.expected_portfolio_count
    or symbol_count_value <> job_row.expected_symbol_count
  then
    raise exception 'staged P&L row counts are incomplete'
      using errcode = '22023';
  end if;

  if p_clear_all then
    if portfolio_count_value <> 0 or symbol_count_value <> 0 then
      raise exception 'clear-all job contains staged rows'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.stock_trades
      where user_id = p_user_id
    ) then
      raise exception 'cannot clear P&L history while the formal ledger is non-empty'
        using errcode = '22023';
    end if;

    delete from public.pnl_report_symbol_snapshots
    where user_id = p_user_id;
    get diagnostics symbol_count_value = row_count;

    delete from public.pnl_report_snapshots
    where user_id = p_user_id;
    get diagnostics portfolio_count_value = row_count;
  else
    if not exists (
      select 1
      from public.pnl_report_rebuild_portfolio_stage
      where operation_key = p_operation_key
        and snapshot_date = p_through_date
    ) then
      raise exception 'staged portfolio rows do not reach through_date'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.pnl_report_rebuild_symbol_stage as symbol_stage
      where symbol_stage.operation_key = p_operation_key
        and not exists (
          select 1
          from public.pnl_report_rebuild_portfolio_stage as portfolio_stage
          where portfolio_stage.operation_key = p_operation_key
            and portfolio_stage.snapshot_date = symbol_stage.snapshot_date
        )
    ) then
      raise exception 'staged symbol row has no portfolio row for its date'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.pnl_report_snapshots
      where user_id = p_user_id
        and snapshot_date > p_through_date
    ) or exists (
      select 1
      from public.pnl_report_symbol_snapshots
      where user_id = p_user_id
        and snapshot_date > p_through_date
    ) then
      raise exception 'live P&L history extends beyond through_date'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.pnl_report_snapshots as live
      where live.user_id = p_user_id
        and live.snapshot_date between p_expected_dirty_from_date and p_through_date
        and not exists (
          select 1
          from public.pnl_report_rebuild_portfolio_stage as staged
          where staged.operation_key = p_operation_key
            and staged.snapshot_date = live.snapshot_date
        )
    ) or exists (
      select 1
      from public.pnl_report_symbol_snapshots as live
      where live.user_id = p_user_id
        and live.snapshot_date between p_expected_dirty_from_date and p_through_date
        and not exists (
          select 1
          from public.pnl_report_rebuild_portfolio_stage as staged
          where staged.operation_key = p_operation_key
            and staged.snapshot_date = live.snapshot_date
        )
    ) then
      raise exception 'staged portfolio rows do not cover the existing dirty range'
        using errcode = '22023';
    end if;

    if exists (
      with target_payload as (
        select jsonb_agg(jsonb_build_object(
          'user_id', p_user_id,
          'snapshot_date', stage.snapshot_date
        )) as targets
        from public.pnl_report_rebuild_portfolio_stage as stage
        where stage.operation_key = p_operation_key
      ), resolved as (
        select resolved_target.*
        from target_payload
        cross join lateral public.resolve_margin_debt_snapshot_targets(
          coalesce(target_payload.targets, '[]'::jsonb)
        ) as resolved_target
      )
      select 1
      from public.pnl_report_rebuild_portfolio_stage as stage
      left join resolved
        on resolved.user_id = stage.user_id
       and resolved.snapshot_date = stage.snapshot_date
      where stage.operation_key = p_operation_key
        and (
          resolved.user_id is null
          or (stage.row_data->>'margin_debt_usd')::numeric
            is distinct from resolved.margin_debt_usd
          or (stage.row_data->>'margin_debt_event_id')::bigint
            is distinct from resolved.margin_debt_event_id
          or (stage.row_data->>'margin_debt_effective_at')::timestamptz
            is distinct from resolved.margin_debt_effective_at
          or stage.row_data->>'margin_debt_basis'
            is distinct from resolved.margin_debt_basis
        )
    ) then
      raise exception 'staged margin debt provenance is not authoritative'
        using errcode = '22023';
    end if;

    delete from public.pnl_report_symbol_snapshots
    where user_id = p_user_id
      and snapshot_date between p_expected_dirty_from_date and p_through_date;

    delete from public.pnl_report_snapshots
    where user_id = p_user_id
      and snapshot_date between p_expected_dirty_from_date and p_through_date;

    insert into public.pnl_report_symbol_snapshots (
      user_id,
      snapshot_date,
      symbol,
      name,
      currency,
      held_shares,
      avg_cost_usd,
      remaining_cost_usd,
      current_price_usd,
      previous_close_usd,
      market_value_usd,
      realized_pnl_usd,
      unrealized_pnl_usd,
      cumulative_pnl_usd,
      daily_pnl_usd,
      daily_pnl_pct,
      total_buy_cost_usd,
      sell_proceeds_usd,
      sold_cost_usd,
      total_buy_shares,
      total_sell_shares,
      is_open,
      source_version,
      created_at,
      updated_at
    )
    select
      p_user_id,
      stage.snapshot_date,
      stage.symbol,
      stage.row_data->>'name',
      stage.row_data->>'currency',
      (stage.row_data->>'held_shares')::numeric,
      (stage.row_data->>'avg_cost_usd')::numeric,
      (stage.row_data->>'remaining_cost_usd')::numeric,
      (stage.row_data->>'current_price_usd')::numeric,
      (stage.row_data->>'previous_close_usd')::numeric,
      (stage.row_data->>'market_value_usd')::numeric,
      (stage.row_data->>'realized_pnl_usd')::numeric,
      (stage.row_data->>'unrealized_pnl_usd')::numeric,
      (stage.row_data->>'cumulative_pnl_usd')::numeric,
      (stage.row_data->>'daily_pnl_usd')::numeric,
      (stage.row_data->>'daily_pnl_pct')::numeric,
      (stage.row_data->>'total_buy_cost_usd')::numeric,
      (stage.row_data->>'sell_proceeds_usd')::numeric,
      (stage.row_data->>'sold_cost_usd')::numeric,
      (stage.row_data->>'total_buy_shares')::numeric,
      (stage.row_data->>'total_sell_shares')::numeric,
      (stage.row_data->>'is_open')::boolean,
      stage.row_data->>'source_version',
      clock_timestamp(),
      clock_timestamp()
    from public.pnl_report_rebuild_symbol_stage as stage
    where stage.operation_key = p_operation_key
    order by stage.snapshot_date, stage.symbol;

    insert into public.pnl_report_snapshots (
      user_id,
      snapshot_date,
      currency,
      cash_usd,
      market_value_usd,
      total_assets_usd,
      margin_debt_usd,
      margin_debt_event_id,
      margin_debt_effective_at,
      margin_debt_basis,
      realized_pnl_usd,
      unrealized_pnl_usd,
      cumulative_pnl_usd,
      cumulative_pnl_pct,
      daily_pnl_usd,
      daily_pnl_pct,
      total_buy_cost_usd,
      sell_proceeds_usd,
      trade_count,
      holding_count,
      source_version,
      locked_at,
      created_at,
      updated_at
    )
    select
      p_user_id,
      stage.snapshot_date,
      stage.row_data->>'currency',
      (stage.row_data->>'cash_usd')::numeric,
      (stage.row_data->>'market_value_usd')::numeric,
      (stage.row_data->>'total_assets_usd')::numeric,
      (stage.row_data->>'margin_debt_usd')::numeric,
      (stage.row_data->>'margin_debt_event_id')::bigint,
      (stage.row_data->>'margin_debt_effective_at')::timestamptz,
      stage.row_data->>'margin_debt_basis',
      (stage.row_data->>'realized_pnl_usd')::numeric,
      (stage.row_data->>'unrealized_pnl_usd')::numeric,
      (stage.row_data->>'cumulative_pnl_usd')::numeric,
      (stage.row_data->>'cumulative_pnl_pct')::numeric,
      (stage.row_data->>'daily_pnl_usd')::numeric,
      (stage.row_data->>'daily_pnl_pct')::numeric,
      (stage.row_data->>'total_buy_cost_usd')::numeric,
      (stage.row_data->>'sell_proceeds_usd')::numeric,
      (stage.row_data->>'trade_count')::integer,
      (stage.row_data->>'holding_count')::integer,
      stage.row_data->>'source_version',
      (stage.row_data->>'locked_at')::timestamptz,
      clock_timestamp(),
      clock_timestamp()
    from public.pnl_report_rebuild_portfolio_stage as stage
    where stage.operation_key = p_operation_key
    order by stage.snapshot_date;

    portfolio_count_value := job_row.expected_portfolio_count;
    symbol_count_value := job_row.expected_symbol_count;
  end if;

  delete from public.pnl_report_rebuild_state
  where user_id = p_user_id
    and dirty_from_date = p_expected_dirty_from_date
    and ledger_revision = p_expected_ledger_revision
    and generation = p_expected_generation;

  if not found then
    raise exception 'P&L rebuild dirty state changed concurrently'
      using errcode = '40001';
  end if;

  insert into public.pnl_report_rebuild_audit (
    operation_key,
    operation_kind,
    user_id,
    ledger_revision,
    generation,
    dirty_from_date,
    through_date,
    snapshot_date,
    portfolio_count,
    symbol_count,
    outcome,
    created_at
  )
  values (
    p_operation_key,
    case when p_clear_all then 'range_clear' else 'range_replace' end,
    p_user_id,
    p_expected_ledger_revision,
    p_expected_generation,
    p_expected_dirty_from_date,
    p_through_date,
    null,
    portfolio_count_value,
    symbol_count_value,
    case when p_clear_all then 'cleared' else 'recalculated' end,
    clock_timestamp()
  );

  delete from public.pnl_report_rebuild_jobs
  where operation_key = p_operation_key;

  return jsonb_build_object(
    'outcome', case when p_clear_all then 'cleared' else 'recalculated' end,
    'fromDate', p_expected_dirty_from_date,
    'throughDate', p_through_date,
    'ledgerRevision', p_expected_ledger_revision,
    'generation', p_expected_generation,
    'replacedPortfolio', portfolio_count_value,
    'replacedSymbols', symbol_count_value
  );
end;
$$;

revoke execute on function public.replace_pnl_report_dirty_range(
  uuid, text, text, bigint, bigint, date, date, jsonb, jsonb, boolean
)
from public, anon, authenticated, service_role;

grant execute on function public.replace_pnl_report_dirty_range(
  uuid, text, text, bigint, bigint, date, date, jsonb, jsonb, boolean
)
to service_role;

create or replace function public.write_pnl_report_snapshot_if_current(
  p_user_id uuid,
  p_operation_key text,
  p_expected_ledger_revision bigint,
  p_snapshot_date date,
  p_portfolio_row jsonb,
  p_symbol_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_operation_key text;
  current_ledger_revision bigint;
  state_row public.pnl_report_rebuild_state%rowtype;
  state_found boolean := false;
  audit_row public.pnl_report_rebuild_audit%rowtype;
  audit_found boolean := false;
  resolved_margin record;
  symbol_count_value integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  if p_user_id is null
    or p_expected_ledger_revision is null
    or p_expected_ledger_revision < 0
    or p_snapshot_date is null
    or p_portfolio_row is null
    or jsonb_typeof(p_portfolio_row) <> 'object'
  then
    raise exception 'invalid daily P&L snapshot metadata'
      using errcode = '22023';
  end if;
  if p_symbol_rows is null or jsonb_typeof(p_symbol_rows) <> 'array' then
    raise exception 'symbol_rows must be a JSON array'
      using errcode = '22023';
  end if;

  expected_operation_key := format(
    'pnl-daily-snapshot:%s:%s:%s',
    p_user_id,
    p_expected_ledger_revision,
    p_snapshot_date
  );
  if p_operation_key is distinct from expected_operation_key then
    raise exception 'invalid daily P&L snapshot operation key'
      using errcode = '22023';
  end if;

  perform public.validate_pnl_report_portfolio_rows(
    p_user_id,
    jsonb_build_array(p_portfolio_row),
    p_snapshot_date,
    p_snapshot_date,
    false
  );
  perform public.validate_pnl_report_symbol_rows(
    p_user_id,
    p_symbol_rows,
    p_snapshot_date,
    p_snapshot_date
  );

  insert into public.stock_trade_ledger_revisions (
    user_id,
    revision,
    last_mutated_at
  )
  values (p_user_id, 0, null)
  on conflict (user_id) do nothing;

  -- Scheduled and immediate writers serialize on the same revision -> dirty
  -- -> destination order. A dirty range always wins over a daily append.
  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  select *
  into state_row
  from public.pnl_report_rebuild_state
  where user_id = p_user_id
  for update;
  state_found := found;

  if current_ledger_revision is distinct from p_expected_ledger_revision then
    return jsonb_build_object(
      'outcome', 'stale',
      'snapshotDate', p_snapshot_date,
      'ledgerRevision', current_ledger_revision,
      'replacedPortfolio', 0,
      'replacedSymbols', 0
    );
  end if;

  if state_found and state_row.dirty_from_date is not null then
    return jsonb_build_object(
      'outcome', 'dirty_pending',
      'snapshotDate', p_snapshot_date,
      'ledgerRevision', current_ledger_revision,
      'replacedPortfolio', 0,
      'replacedSymbols', 0
    );
  end if;

  select *
  into audit_row
  from public.pnl_report_rebuild_audit
  where operation_key = p_operation_key;
  audit_found := found;

  if audit_found then
    return jsonb_build_object(
      'outcome', 'already_current',
      'snapshotDate', p_snapshot_date,
      'ledgerRevision', current_ledger_revision,
      'replacedPortfolio', audit_row.portfolio_count,
      'replacedSymbols', audit_row.symbol_count
    );
  end if;

  perform 1
  from public.pnl_report_snapshots
  where user_id = p_user_id
    and snapshot_date = p_snapshot_date
  order by id
  for update;

  perform 1
  from public.pnl_report_symbol_snapshots
  where user_id = p_user_id
    and snapshot_date = p_snapshot_date
  order by symbol, id
  for update;

  select resolved.*
  into resolved_margin
  from public.resolve_margin_debt_snapshot_targets(
    jsonb_build_array(jsonb_build_object(
      'user_id', p_user_id,
      'snapshot_date', p_snapshot_date
    ))
  ) as resolved
  where resolved.user_id = p_user_id
    and resolved.snapshot_date = p_snapshot_date;

  if not found
    or (p_portfolio_row->>'margin_debt_usd')::numeric
      is distinct from resolved_margin.margin_debt_usd
    or (p_portfolio_row->>'margin_debt_event_id')::bigint
      is distinct from resolved_margin.margin_debt_event_id
    or (p_portfolio_row->>'margin_debt_effective_at')::timestamptz
      is distinct from resolved_margin.margin_debt_effective_at
    or p_portfolio_row->>'margin_debt_basis'
      is distinct from resolved_margin.margin_debt_basis
  then
    raise exception 'daily margin debt provenance is not authoritative'
      using errcode = '22023';
  end if;

  delete from public.pnl_report_symbol_snapshots
  where user_id = p_user_id
    and snapshot_date = p_snapshot_date;

  delete from public.pnl_report_snapshots
  where user_id = p_user_id
    and snapshot_date = p_snapshot_date;

  insert into public.pnl_report_symbol_snapshots (
    user_id,
    snapshot_date,
    symbol,
    name,
    currency,
    held_shares,
    avg_cost_usd,
    remaining_cost_usd,
    current_price_usd,
    previous_close_usd,
    market_value_usd,
    realized_pnl_usd,
    unrealized_pnl_usd,
    cumulative_pnl_usd,
    daily_pnl_usd,
    daily_pnl_pct,
    total_buy_cost_usd,
    sell_proceeds_usd,
    sold_cost_usd,
    total_buy_shares,
    total_sell_shares,
    is_open,
    source_version,
    created_at,
    updated_at
  )
  select
    p_user_id,
    (item.value->>'snapshot_date')::date,
    upper(btrim(item.value->>'symbol')),
    item.value->>'name',
    item.value->>'currency',
    (item.value->>'held_shares')::numeric,
    (item.value->>'avg_cost_usd')::numeric,
    (item.value->>'remaining_cost_usd')::numeric,
    (item.value->>'current_price_usd')::numeric,
    (item.value->>'previous_close_usd')::numeric,
    (item.value->>'market_value_usd')::numeric,
    (item.value->>'realized_pnl_usd')::numeric,
    (item.value->>'unrealized_pnl_usd')::numeric,
    (item.value->>'cumulative_pnl_usd')::numeric,
    (item.value->>'daily_pnl_usd')::numeric,
    (item.value->>'daily_pnl_pct')::numeric,
    (item.value->>'total_buy_cost_usd')::numeric,
    (item.value->>'sell_proceeds_usd')::numeric,
    (item.value->>'sold_cost_usd')::numeric,
    (item.value->>'total_buy_shares')::numeric,
    (item.value->>'total_sell_shares')::numeric,
    (item.value->>'is_open')::boolean,
    item.value->>'source_version',
    clock_timestamp(),
    clock_timestamp()
  from jsonb_array_elements(p_symbol_rows) as item(value)
  order by (item.value->>'symbol');

  symbol_count_value := jsonb_array_length(p_symbol_rows);

  insert into public.pnl_report_snapshots (
    user_id,
    snapshot_date,
    currency,
    cash_usd,
    market_value_usd,
    total_assets_usd,
    margin_debt_usd,
    margin_debt_event_id,
    margin_debt_effective_at,
    margin_debt_basis,
    realized_pnl_usd,
    unrealized_pnl_usd,
    cumulative_pnl_usd,
    cumulative_pnl_pct,
    daily_pnl_usd,
    daily_pnl_pct,
    total_buy_cost_usd,
    sell_proceeds_usd,
    trade_count,
    holding_count,
    source_version,
    locked_at,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_snapshot_date,
    p_portfolio_row->>'currency',
    (p_portfolio_row->>'cash_usd')::numeric,
    (p_portfolio_row->>'market_value_usd')::numeric,
    (p_portfolio_row->>'total_assets_usd')::numeric,
    (p_portfolio_row->>'margin_debt_usd')::numeric,
    (p_portfolio_row->>'margin_debt_event_id')::bigint,
    (p_portfolio_row->>'margin_debt_effective_at')::timestamptz,
    p_portfolio_row->>'margin_debt_basis',
    (p_portfolio_row->>'realized_pnl_usd')::numeric,
    (p_portfolio_row->>'unrealized_pnl_usd')::numeric,
    (p_portfolio_row->>'cumulative_pnl_usd')::numeric,
    (p_portfolio_row->>'cumulative_pnl_pct')::numeric,
    (p_portfolio_row->>'daily_pnl_usd')::numeric,
    (p_portfolio_row->>'daily_pnl_pct')::numeric,
    (p_portfolio_row->>'total_buy_cost_usd')::numeric,
    (p_portfolio_row->>'sell_proceeds_usd')::numeric,
    (p_portfolio_row->>'trade_count')::integer,
    (p_portfolio_row->>'holding_count')::integer,
    p_portfolio_row->>'source_version',
    (p_portfolio_row->>'locked_at')::timestamptz,
    clock_timestamp(),
    clock_timestamp()
  );

  insert into public.pnl_report_rebuild_audit (
    operation_key,
    operation_kind,
    user_id,
    ledger_revision,
    generation,
    dirty_from_date,
    through_date,
    snapshot_date,
    portfolio_count,
    symbol_count,
    outcome,
    created_at
  )
  values (
    p_operation_key,
    'daily_write',
    p_user_id,
    p_expected_ledger_revision,
    null,
    null,
    null,
    p_snapshot_date,
    1,
    symbol_count_value,
    'written',
    clock_timestamp()
  );

  return jsonb_build_object(
    'outcome', 'written',
    'snapshotDate', p_snapshot_date,
    'ledgerRevision', p_expected_ledger_revision,
    'replacedPortfolio', 1,
    'replacedSymbols', symbol_count_value
  );
end;
$$;

revoke execute on function public.write_pnl_report_snapshot_if_current(
  uuid, text, bigint, date, jsonb, jsonb
)
from public, anon, authenticated, service_role;

grant execute on function public.write_pnl_report_snapshot_if_current(
  uuid, text, bigint, date, jsonb, jsonb
)
to service_role;

-- Contract the three live P&L destinations to owner-scoped reads. Browser and
-- service writers must now use the guarded SECURITY DEFINER RPCs above.
revoke all privileges on table public.pnl_report_snapshots
from public, anon, authenticated, service_role;

revoke all privileges on table public.pnl_report_symbol_snapshots
from public, anon, authenticated, service_role;

revoke all privileges on table public.pnl_report_rebuild_state
from public, anon, authenticated, service_role;

grant select on table public.pnl_report_snapshots
to authenticated, service_role;

grant select on table public.pnl_report_symbol_snapshots
to authenticated, service_role;

grant select on table public.pnl_report_rebuild_state
to authenticated, service_role;

drop policy if exists "users can manage own pnl report snapshots"
on public.pnl_report_snapshots;
drop policy if exists "users can read own pnl report snapshots"
on public.pnl_report_snapshots;
create policy "users can read own pnl report snapshots"
on public.pnl_report_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can manage own pnl report symbol snapshots"
on public.pnl_report_symbol_snapshots;
drop policy if exists "users can read own pnl report symbol snapshots"
on public.pnl_report_symbol_snapshots;
create policy "users can read own pnl report symbol snapshots"
on public.pnl_report_symbol_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can manage own pnl report rebuild state"
on public.pnl_report_rebuild_state;
drop policy if exists "users can read own pnl report rebuild state"
on public.pnl_report_rebuild_state;
create policy "users can read own pnl report rebuild state"
on public.pnl_report_rebuild_state
for select
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
