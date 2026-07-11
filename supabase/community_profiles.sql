-- Community profile public identity for future competition leaderboards.
-- Stores only nickname and preset avatar key; no email, portfolio, return, or ledger data.

begin;

create table if not exists public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  avatar_key text not null default 'gold',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_profiles_nickname_length_check
    check (char_length(btrim(nickname)) between 2 and 16),
  constraint community_profiles_nickname_no_control_check
    check (nickname !~ '[[:cntrl:]]'),
  constraint community_profiles_avatar_key_check
    check (avatar_key in ('gold', 'blue', 'purple', 'green', 'cyan', 'silver'))
);

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

alter table public.community_profiles enable row level security;

drop policy if exists "authenticated can read community profiles"
on public.community_profiles;

create policy "authenticated can read community profiles"
on public.community_profiles
for select
to authenticated
using (true);

drop policy if exists "users can insert own community profile"
on public.community_profiles;

create policy "users can insert own community profile"
on public.community_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own community profile"
on public.community_profiles;

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

commit;
