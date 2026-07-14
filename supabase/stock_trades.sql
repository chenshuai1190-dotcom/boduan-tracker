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

-- Opaque, server-owned ledger version. Authenticated clients may edit their
-- own trades, but they can neither read nor forge this mutation sequence.
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
begin
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

begin;

drop policy if exists "users can manage own stock trades" on public.stock_trades;
create policy "users can manage own stock trades"
on public.stock_trades
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
