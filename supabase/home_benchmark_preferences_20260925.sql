-- Isolate the home benchmark from legacy user_settings upserts. Old browser
-- bundles can still write benchmark_symbol, but cannot touch this table.
-- Apply before deploying the runtime that reads home_benchmark_preferences.

begin;

set local lock_timeout = '5s';

create table if not exists public.home_benchmark_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  symbol text not null check (btrim(symbol) <> ''),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_benchmark_preferences enable row level security;

revoke all privileges on table public.home_benchmark_preferences
from public, anon, authenticated;

grant select, insert, update
on table public.home_benchmark_preferences
to authenticated;

drop policy if exists "users can read own home benchmark" on public.home_benchmark_preferences;
create policy "users can read own home benchmark"
on public.home_benchmark_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own home benchmark" on public.home_benchmark_preferences;
create policy "users can insert own home benchmark"
on public.home_benchmark_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own home benchmark" on public.home_benchmark_preferences;
create policy "users can update own home benchmark"
on public.home_benchmark_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- One-time seed only. Reapplying the migration never imports later writes to
-- user_settings over an already-authoritative preference. Match the existing
-- strict ticker normalizer: trim, uppercase, remove invisible characters and
-- a trailing .US suffix. Invalid legacy values abort the transaction instead
-- of silently replacing a user's preference with QQQ.
create temporary table _home_benchmark_seed_20260925 on commit drop as
with legacy as (
  select
    settings.user_id,
    upper(coalesce(
      nullif(btrim(settings.benchmark_symbol), ''),
      nullif(btrim(settings.data ->> 'benchmarkSymbol'), ''),
      'QQQ'
    )) as raw_symbol
  from public.user_settings as settings
  left join public.home_benchmark_preferences as preference
    on preference.user_id = settings.user_id
  where preference.user_id is null
), cleaned as (
  select
    user_id,
    replace(replace(replace(replace(raw_symbol,
      chr(8203), ''), chr(8204), ''), chr(8205), ''), chr(65279), '') as symbol
  from legacy
)
select
  user_id,
  case
    when right(symbol, 3) = '.US' then left(symbol, length(symbol) - 3)
    else symbol
  end as symbol
from cleaned;

do $$
declare
  invalid_count bigint;
begin
  select count(*) into invalid_count
  from pg_temp._home_benchmark_seed_20260925
  where symbol !~ '^[A-Z0-9._-]{1,15}$';
  if invalid_count > 0 then
    raise exception 'home benchmark seed has % invalid legacy symbols', invalid_count;
  end if;
end;
$$;

insert into public.home_benchmark_preferences (user_id, symbol, revision)
select user_id, symbol, 0
from pg_temp._home_benchmark_seed_20260925
where true
on conflict (user_id) do nothing;

comment on table public.home_benchmark_preferences is
'Authoritative user home benchmark, independent of legacy user_settings writes.';
comment on column public.home_benchmark_preferences.revision is
'Optimistic concurrency revision; compare before replacing a selection.';

notify pgrst, 'reload schema';

commit;
