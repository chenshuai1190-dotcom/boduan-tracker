-- Create the independent swing-wave ledger.
-- Apply this in the production Supabase SQL editor before wiring the live UI.
-- One parent row represents the original buy; child exits support one or more partial sells.
-- Existing parent sell fields remain a synthetic legacy full exit without a mandatory backfill.

begin;

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

alter table public.swing_waves enable row level security;

drop policy if exists "users can manage own swing waves"
on public.swing_waves;

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

-- The redundant owner key lets every child exit prove that its owner is also
-- the owner of the parent wave. The primary key already makes each pair unique.
create unique index if not exists swing_waves_id_user_unique_idx
on public.swing_waves (id, user_id);

create table if not exists public.swing_wave_exits (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  sell_date date not null,
  sell_price_usd numeric(18, 6) not null check (sell_price_usd > 0),
  shares numeric(18, 6) not null check (shares > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint swing_wave_exits_wave_owner_fk
    foreign key (wave_id, user_id)
    references public.swing_waves (id, user_id)
    on delete cascade
);

create index if not exists swing_wave_exits_wave_date_idx
on public.swing_wave_exits (wave_id, sell_date, created_at, id);

create index if not exists swing_wave_exits_user_date_idx
on public.swing_wave_exits (user_id, sell_date desc, created_at desc);

create or replace function public.enforce_swing_wave_exit_server_fields()
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

  if new.id is distinct from old.id
    or new.wave_id is distinct from old.wave_id
    or new.user_id is distinct from old.user_id
  then
    raise exception 'swing wave exit identity is immutable'
      using errcode = '22023';
  end if;

  new.created_at = old.created_at;
  new.updated_at = server_now;
  return new;
end;
$$;

revoke execute on function public.enforce_swing_wave_exit_server_fields()
from public, anon, authenticated;

drop trigger if exists swing_wave_exits_enforce_server_fields
on public.swing_wave_exits;

create trigger swing_wave_exits_enforce_server_fields
before insert or update on public.swing_wave_exits
for each row
execute function public.enforce_swing_wave_exit_server_fields();

-- Parent buy-side edits remain direct user-scoped writes, so enforce the two
-- cross-table invariants at the database boundary as well as in the client.
create or replace function public.enforce_swing_wave_partial_exit_integrity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  sold_shares numeric(18, 6);
  earliest_sell_date date;
begin
  select
    coalesce(sum(exit_row.shares), 0),
    min(exit_row.sell_date)
  into sold_shares, earliest_sell_date
  from public.swing_wave_exits as exit_row
  where exit_row.wave_id = old.id
    and exit_row.user_id = old.user_id;

  if new.user_id is distinct from old.user_id then
    raise exception 'swing wave owner is immutable'
      using errcode = '22023';
  end if;

  if new.shares < sold_shares then
    raise exception 'swing wave shares cannot be lower than sold shares'
      using errcode = '22023';
  end if;

  if earliest_sell_date is not null and new.buy_date > earliest_sell_date then
    raise exception 'swing wave buy date cannot be later than an exit date'
      using errcode = '22023';
  end if;

  if sold_shares > 0
    and (new.sell_date is not null or new.sell_price_usd is not null)
  then
    raise exception 'legacy completion fields cannot coexist with partial exits'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_swing_wave_partial_exit_integrity()
from public, anon, authenticated;

drop trigger if exists swing_waves_enforce_partial_exit_integrity
on public.swing_waves;

create trigger swing_waves_enforce_partial_exit_integrity
before update on public.swing_waves
for each row
execute function public.enforce_swing_wave_partial_exit_integrity();

create or replace function public.record_swing_wave_exit(
  p_wave_id uuid,
  p_sell_date date,
  p_sell_price_usd numeric,
  p_sell_shares numeric,
  p_expected_wave_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  wave_row public.swing_waves%rowtype;
  already_sold numeric(18, 6);
  inserted_exit_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_sell_date is null or p_sell_price_usd is null or p_sell_price_usd <= 0
    or p_sell_shares is null or p_sell_shares <= 0
  then
    raise exception 'invalid swing wave exit' using errcode = '22023';
  end if;

  select wave.*
  into wave_row
  from public.swing_waves as wave
  where wave.id = p_wave_id
    and wave.user_id = caller_id
  for update;

  if not found then
    raise exception 'swing wave not found' using errcode = 'P0002';
  end if;
  if wave_row.updated_at is distinct from p_expected_wave_updated_at then
    raise exception 'stale swing wave' using errcode = '40001';
  end if;
  if p_sell_date < wave_row.buy_date then
    raise exception 'exit date cannot be earlier than buy date' using errcode = '22023';
  end if;
  if wave_row.sell_date is not null or wave_row.sell_price_usd is not null then
    raise exception 'legacy swing wave is already fully sold' using errcode = '22023';
  end if;

  select coalesce(sum(exit_row.shares), 0)
  into already_sold
  from public.swing_wave_exits as exit_row
  where exit_row.wave_id = wave_row.id
    and exit_row.user_id = caller_id;

  if already_sold + p_sell_shares > wave_row.shares then
    raise exception 'exit shares exceed remaining shares' using errcode = '22023';
  end if;

  insert into public.swing_wave_exits (
    wave_id,
    user_id,
    sell_date,
    sell_price_usd,
    shares
  )
  values (
    wave_row.id,
    caller_id,
    p_sell_date,
    p_sell_price_usd,
    p_sell_shares
  )
  returning id into inserted_exit_id;

  update public.swing_waves
  set updated_at = clock_timestamp()
  where id = wave_row.id
    and user_id = caller_id;

  return inserted_exit_id;
end;
$$;

create or replace function public.update_swing_wave_exit(
  p_wave_id uuid,
  p_exit_id uuid,
  p_sell_date date,
  p_sell_price_usd numeric,
  p_sell_shares numeric,
  p_expected_wave_updated_at timestamptz,
  p_expected_exit_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  wave_row public.swing_waves%rowtype;
  exit_row public.swing_wave_exits%rowtype;
  other_sold numeric(18, 6);
  converted_exit_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_sell_date is null or p_sell_price_usd is null or p_sell_price_usd <= 0
    or p_sell_shares is null or p_sell_shares <= 0
  then
    raise exception 'invalid swing wave exit' using errcode = '22023';
  end if;

  select wave.*
  into wave_row
  from public.swing_waves as wave
  where wave.id = p_wave_id
    and wave.user_id = caller_id
  for update;

  if not found then
    raise exception 'swing wave not found' using errcode = 'P0002';
  end if;
  if wave_row.updated_at is distinct from p_expected_wave_updated_at then
    raise exception 'stale swing wave' using errcode = '40001';
  end if;
  if p_sell_date < wave_row.buy_date then
    raise exception 'exit date cannot be earlier than buy date' using errcode = '22023';
  end if;

  -- A null exit id is the synthetic exit represented by the legacy parent
  -- sell fields. Reducing its quantity atomically converts it into a child.
  if p_exit_id is null then
    if wave_row.sell_date is null or wave_row.sell_price_usd is null then
      raise exception 'legacy swing wave exit not found' using errcode = 'P0002';
    end if;
    if wave_row.updated_at is distinct from p_expected_exit_updated_at then
      raise exception 'stale swing wave exit' using errcode = '40001';
    end if;
    if p_sell_shares > wave_row.shares then
      raise exception 'exit shares exceed original shares' using errcode = '22023';
    end if;

    if p_sell_shares = wave_row.shares then
      update public.swing_waves
      set sell_date = p_sell_date,
          sell_price_usd = p_sell_price_usd,
          updated_at = clock_timestamp()
      where id = wave_row.id
        and user_id = caller_id;
      return null;
    end if;

    update public.swing_waves
    set sell_date = null,
        sell_price_usd = null,
        updated_at = clock_timestamp()
    where id = wave_row.id
      and user_id = caller_id;

    insert into public.swing_wave_exits (
      wave_id,
      user_id,
      sell_date,
      sell_price_usd,
      shares
    )
    values (
      wave_row.id,
      caller_id,
      p_sell_date,
      p_sell_price_usd,
      p_sell_shares
    )
    returning id into converted_exit_id;

    return converted_exit_id;
  end if;

  select exit_record.*
  into exit_row
  from public.swing_wave_exits as exit_record
  where exit_record.id = p_exit_id
    and exit_record.wave_id = wave_row.id
    and exit_record.user_id = caller_id
  for update;

  if not found then
    raise exception 'swing wave exit not found' using errcode = 'P0002';
  end if;
  if exit_row.updated_at is distinct from p_expected_exit_updated_at then
    raise exception 'stale swing wave exit' using errcode = '40001';
  end if;

  select coalesce(sum(other_exit.shares), 0)
  into other_sold
  from public.swing_wave_exits as other_exit
  where other_exit.wave_id = wave_row.id
    and other_exit.user_id = caller_id
    and other_exit.id <> exit_row.id;

  if other_sold + p_sell_shares > wave_row.shares then
    raise exception 'exit shares exceed remaining shares' using errcode = '22023';
  end if;

  update public.swing_wave_exits
  set sell_date = p_sell_date,
      sell_price_usd = p_sell_price_usd,
      shares = p_sell_shares
  where id = exit_row.id
    and wave_id = wave_row.id
    and user_id = caller_id;

  update public.swing_waves
  set updated_at = clock_timestamp()
  where id = wave_row.id
    and user_id = caller_id;

  return exit_row.id;
end;
$$;

create or replace function public.delete_swing_wave_exit(
  p_wave_id uuid,
  p_exit_id uuid,
  p_expected_wave_updated_at timestamptz,
  p_expected_exit_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  wave_row public.swing_waves%rowtype;
  deleted_exit_id uuid;
  exit_updated_at timestamptz;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select wave.*
  into wave_row
  from public.swing_waves as wave
  where wave.id = p_wave_id
    and wave.user_id = caller_id
  for update;

  if not found then
    raise exception 'swing wave not found' using errcode = 'P0002';
  end if;
  if wave_row.updated_at is distinct from p_expected_wave_updated_at then
    raise exception 'stale swing wave' using errcode = '40001';
  end if;

  if p_exit_id is null then
    if wave_row.sell_date is null or wave_row.sell_price_usd is null then
      raise exception 'legacy swing wave exit not found' using errcode = 'P0002';
    end if;
    if wave_row.updated_at is distinct from p_expected_exit_updated_at then
      raise exception 'stale swing wave exit' using errcode = '40001';
    end if;

    update public.swing_waves
    set sell_date = null,
        sell_price_usd = null,
        updated_at = clock_timestamp()
    where id = wave_row.id
      and user_id = caller_id;

    return null;
  end if;

  select exit_record.updated_at
  into exit_updated_at
  from public.swing_wave_exits as exit_record
  where exit_record.id = p_exit_id
    and exit_record.wave_id = wave_row.id
    and exit_record.user_id = caller_id
  for update;

  if not found then
    raise exception 'swing wave exit not found' using errcode = 'P0002';
  end if;
  if exit_updated_at is distinct from p_expected_exit_updated_at then
    raise exception 'stale swing wave exit' using errcode = '40001';
  end if;

  delete from public.swing_wave_exits
  where id = p_exit_id
    and wave_id = wave_row.id
    and user_id = caller_id
  returning id into deleted_exit_id;

  update public.swing_waves
  set updated_at = clock_timestamp()
  where id = wave_row.id
    and user_id = caller_id;

  return deleted_exit_id;
end;
$$;

revoke all on function public.record_swing_wave_exit(uuid, date, numeric, numeric, timestamptz)
from public, anon, authenticated;
revoke all on function public.update_swing_wave_exit(uuid, uuid, date, numeric, numeric, timestamptz, timestamptz)
from public, anon, authenticated;
revoke all on function public.delete_swing_wave_exit(uuid, uuid, timestamptz, timestamptz)
from public, anon, authenticated;

grant execute on function public.record_swing_wave_exit(uuid, date, numeric, numeric, timestamptz)
to authenticated;
grant execute on function public.update_swing_wave_exit(uuid, uuid, date, numeric, numeric, timestamptz, timestamptz)
to authenticated;
grant execute on function public.delete_swing_wave_exit(uuid, uuid, timestamptz, timestamptz)
to authenticated;

alter table public.swing_wave_exits enable row level security;

drop policy if exists "users can read own swing wave exits"
on public.swing_wave_exits;

create policy "users can read own swing wave exits"
on public.swing_wave_exits
for select
to authenticated
using (auth.uid() = user_id);

revoke all privileges on table public.swing_wave_exits
from public, anon, authenticated;

grant select
on table public.swing_wave_exits
to authenticated;

commit;
