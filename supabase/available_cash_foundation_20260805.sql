-- Forward-only available-cash foundation.
--
-- Apply this migration before deploying the available-cash runtime. It is
-- deliberately additive and grants authenticated clients owner-scoped reads
-- only. Insert/update access belongs to the after-runtime contract, so the
-- feature cannot write before its runtime is live while asset cards stay
-- available during the staged rollout.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.available_cash_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available_cash_usd numeric(18, 6) not null,
  logic_version integer not null default 1,
  updated_at timestamptz not null default clock_timestamp(),

  constraint available_cash_status_amount_check
    check (
      available_cash_usd >= 0
      and available_cash_usd <> 'NaN'::numeric
    ),
  constraint available_cash_status_logic_version_check
    check (logic_version = 1)
);

create table if not exists public.available_cash_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cash_usd numeric(18, 6) not null,
  effective_at timestamptz not null default clock_timestamp(),
  source text not null,
  logic_version integer not null default 1,
  source_updated_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),

  constraint available_cash_events_amount_check
    check (
      cash_usd >= 0
      and cash_usd <> 'NaN'::numeric
    ),
  constraint available_cash_events_source_check
    check (source in ('status_activation', 'status_change')),
  constraint available_cash_events_logic_version_check
    check (logic_version = 1)
);

create index if not exists available_cash_events_user_effective_idx
on public.available_cash_events (user_id, effective_at desc, id desc);

alter table public.pnl_report_snapshots
add column if not exists cash_event_id bigint;

alter table public.pnl_report_snapshots
add column if not exists cash_effective_at timestamptz;

alter table public.pnl_report_snapshots
add column if not exists cash_basis text;

do $$
begin
  if exists (
    select 1
    from public.pnl_report_snapshots
    where cash_usd <> 0
  ) then
    raise exception 'existing P&L snapshots contain unsupported non-zero cash values';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pnl_report_snapshots_cash_provenance_check'
      and conrelid = 'public.pnl_report_snapshots'::regclass
  ) then
    alter table public.pnl_report_snapshots
    add constraint pnl_report_snapshots_cash_provenance_check
    check (
      (
        cash_usd = 0
        and cash_event_id is null
        and cash_effective_at is null
        and cash_basis is null
      )
      or
      (
        cash_usd >= 0
        and cash_usd <> 'NaN'::numeric
        and cash_event_id is not null
        and cash_effective_at is not null
        and cash_basis = 'event'
      )
    );
  end if;
end;
$$;

create or replace function public.normalize_available_cash_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  captured_at timestamptz := clock_timestamp();
begin
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'available cash owner mismatch'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'available cash owner cannot be changed'
        using errcode = '22023';
    end if;
  end if;

  if new.available_cash_usd is null
    or new.available_cash_usd = 'NaN'::numeric
    or new.available_cash_usd < 0
  then
    raise exception 'available cash must be a non-negative amount'
      using errcode = '22023';
  end if;

  if new.logic_version is distinct from 1 then
    raise exception 'unsupported available cash logic version'
      using errcode = '22023';
  end if;

  new.logic_version := 1;
  new.updated_at := captured_at;

  return new;
end;
$$;

revoke execute on function public.normalize_available_cash_status()
from public, anon, authenticated, service_role;

drop trigger if exists normalize_available_cash_status
on public.available_cash_status;

create trigger normalize_available_cash_status
before insert or update on public.available_cash_status
for each row execute function public.normalize_available_cash_status();

create or replace function public.capture_available_cash_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  captured_at timestamptz := new.updated_at;
  event_source text;
  current_ledger_revision bigint;
  dirty_date date;
begin
  if captured_at is null then
    raise exception 'available cash server timestamp is required'
      using errcode = '22023';
  end if;

  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'available cash owner mismatch'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    event_source := 'status_activation';
  elsif old.available_cash_usd is distinct from new.available_cash_usd then
    event_source := 'status_change';
  else
    return new;
  end if;

  insert into public.available_cash_events (
    user_id,
    cash_usd,
    effective_at,
    source,
    logic_version,
    source_updated_at,
    created_at
  )
  values (
    new.user_id,
    new.available_cash_usd,
    captured_at,
    event_source,
    1,
    captured_at,
    captured_at
  );

  -- Cash changes invalidate the P&L read model but are not stock-ledger
  -- mutations. Ensure a revision row exists, preserve its current revision,
  -- and never touch the independent competition rebuild state.
  insert into public.stock_trade_ledger_revisions (
    user_id,
    revision,
    last_mutated_at
  )
  values (
    new.user_id,
    0,
    null
  )
  on conflict (user_id) do nothing;

  select revision
  into current_ledger_revision
  from public.stock_trade_ledger_revisions
  where user_id = new.user_id
  for update;

  dirty_date := (captured_at at time zone 'America/New_York')::date;

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
    new.user_id,
    dirty_date,
    current_ledger_revision,
    1,
    'available_cash_changed',
    null,
    captured_at
  )
  on conflict (user_id) do update
  set dirty_from_date = least(
        public.pnl_report_rebuild_state.dirty_from_date,
        excluded.dirty_from_date
      ),
      ledger_revision = excluded.ledger_revision,
      generation = public.pnl_report_rebuild_state.generation + 1,
      reason = excluded.reason,
      source_trade_id = null,
      updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke execute on function public.capture_available_cash_event()
from public, anon, authenticated, service_role;

drop trigger if exists capture_available_cash_event
on public.available_cash_status;

create trigger capture_available_cash_event
after insert or update on public.available_cash_status
for each row execute function public.capture_available_cash_event();

create or replace function public.resolve_available_cash_snapshot_targets(
  p_targets jsonb
)
returns table (
  user_id uuid,
  snapshot_date date,
  cash_usd numeric,
  cash_event_id bigint,
  cash_effective_at timestamptz,
  cash_basis text,
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
  resolved as (
    select
      targets.user_id,
      targets.snapshot_date,
      event.id as event_id,
      event.cash_usd as event_cash_usd,
      event.effective_at as event_effective_at
    from targets
    left join lateral (
      select
        candidate.id,
        candidate.cash_usd,
        candidate.effective_at
      from public.available_cash_events as candidate
      where candidate.user_id = targets.user_id
        and candidate.effective_at <= (
          (targets.snapshot_date + time '17:00')
            at time zone 'America/New_York'
        )
      order by candidate.effective_at desc, candidate.id desc
      limit 1
    ) as event on true
  )
  select
    resolved.user_id,
    resolved.snapshot_date,
    coalesce(resolved.event_cash_usd, 0),
    resolved.event_id,
    resolved.event_effective_at,
    case when resolved.event_id is null then null else 'event' end,
    resolved.event_id is not null
  from resolved
  order by resolved.user_id, resolved.snapshot_date;
$$;

revoke execute on function public.resolve_available_cash_snapshot_targets(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.resolve_available_cash_snapshot_targets(jsonb)
to service_role;

create or replace function public.enforce_pnl_report_available_cash_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  resolved record;
begin
  select target.*
  into strict resolved
  from public.resolve_available_cash_snapshot_targets(
    jsonb_build_array(
      jsonb_build_object(
        'user_id', new.user_id,
        'snapshot_date', new.snapshot_date
      )
    )
  ) as target;

  if new.cash_usd is distinct from resolved.cash_usd then
    raise exception 'P&L snapshot cash does not match authoritative cash history'
      using errcode = '23514';
  end if;

  if new.total_assets_usd is distinct from (
    new.market_value_usd + resolved.cash_usd
  ) then
    raise exception 'P&L snapshot total assets must equal market value plus cash'
      using errcode = '23514';
  end if;

  new.cash_event_id := resolved.cash_event_id;
  new.cash_effective_at := resolved.cash_effective_at;
  new.cash_basis := resolved.cash_basis;

  return new;
end;
$$;

revoke execute on function public.enforce_pnl_report_available_cash_snapshot()
from public, anon, authenticated, service_role;

drop trigger if exists enforce_pnl_report_available_cash_snapshot
on public.pnl_report_snapshots;

create trigger enforce_pnl_report_available_cash_snapshot
before insert or update on public.pnl_report_snapshots
for each row execute function public.enforce_pnl_report_available_cash_snapshot();

-- The runtime can read authoritative cash during the rollout, but it must not
-- offer a write action until the after-runtime contract activates it.
create or replace function public.available_cash_write_contract_ready()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select false;
$$;

revoke execute on function public.available_cash_write_contract_ready()
from public, anon, authenticated, service_role;

grant execute on function public.available_cash_write_contract_ready()
to authenticated, service_role;

alter table public.available_cash_status enable row level security;
alter table public.available_cash_status force row level security;
alter table public.available_cash_events enable row level security;
alter table public.available_cash_events force row level security;

revoke all privileges on table public.available_cash_status
from public, anon, authenticated, service_role;

revoke all privileges on table public.available_cash_events
from public, anon, authenticated, service_role;

grant select on table public.available_cash_status
to authenticated, service_role;

grant select on table public.available_cash_events
to service_role;

revoke all privileges on sequence public.available_cash_events_id_seq
from public, anon, authenticated, service_role;

drop policy if exists "users can read own available cash status"
on public.available_cash_status;

create policy "users can read own available cash status"
on public.available_cash_status
for select
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
