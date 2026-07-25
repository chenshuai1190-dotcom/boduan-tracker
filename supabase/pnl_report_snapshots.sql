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

notify pgrst, 'reload schema';

commit;
