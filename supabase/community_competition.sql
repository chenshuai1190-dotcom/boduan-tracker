-- Privacy-safe storage for the voluntary community return competition.
-- Membership is written only by authenticated server endpoints using service_role.
-- Competition snapshots contain percentages plus a one-way ledger integrity hash only;
-- no assets, P&L amounts, holdings, symbols, trades, email addresses, or portfolio fields.

begin;

alter table public.community_profiles
add column if not exists profile_completed_at timestamptz;

create table if not exists public.community_competition_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  eligible_after_snapshot_date date not null,
  eligible_ledger_hash text,
  ranking_start_snapshot_date date,
  ranking_baseline_return_pct numeric(18, 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_competition_members_status_check
    check (status in ('active', 'withdrawn')),
  constraint community_competition_members_eligible_ledger_hash_check
    check (eligible_ledger_hash is null or eligible_ledger_hash ~ '^[0-9a-f]{64}$'),
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

-- Incremental migration: this file may be rerun after the initial competition rollout.
alter table public.community_competition_members
add column if not exists eligible_ledger_hash text;

alter table public.community_competition_members
drop constraint if exists community_competition_members_eligible_ledger_hash_check;

alter table public.community_competition_members
add constraint community_competition_members_eligible_ledger_hash_check
check (eligible_ledger_hash is null or eligible_ledger_hash ~ '^[0-9a-f]{64}$');

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
  source_version text not null default 'community_competition_snapshot_v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_competition_snapshots_daily_return_check
    check (daily_return_pct is null or daily_return_pct >= -1),
  constraint community_competition_snapshots_cumulative_return_check
    check (cumulative_return_pct >= -1),
  constraint community_competition_snapshots_ledger_hash_check
    check (ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint community_competition_snapshots_source_version_check
    check (source_version = 'community_competition_snapshot_v1'),
  unique (user_id, snapshot_date)
);

create index if not exists community_competition_snapshots_date_user_idx
on public.community_competition_snapshots (snapshot_date desc, user_id);

create index if not exists community_competition_snapshots_user_date_idx
on public.community_competition_snapshots (user_id, snapshot_date desc);

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

alter table public.community_competition_members enable row level security;
alter table public.community_competition_members force row level security;
alter table public.community_competition_snapshots enable row level security;
alter table public.community_competition_snapshots force row level security;

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

commit;
