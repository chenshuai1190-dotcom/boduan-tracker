-- Create the independent main stock trading ledger.
-- Apply this in the production Supabase SQL editor before deploying the app
-- version that reads/writes stock_trades.

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

begin;

drop policy if exists "users can manage own stock trades" on public.stock_trades;
create policy "users can manage own stock trades"
on public.stock_trades
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;

-- Install the current P&L-aware revision trigger without rewriting historical
-- migration definitions that static compatibility tests intentionally retain.
begin;

set local lock_timeout = '5s';

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

commit;
