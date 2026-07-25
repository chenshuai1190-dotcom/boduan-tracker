-- Repair a user-confirmed pre-migration financing balance from its persisted
-- Home record time. The explicit manifest is the authorization boundary:
-- no other user or earlier date is inferred from today's mutable balance.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regclass('public.margin_debt_events') is null
    or to_regclass('public.margin_debt_history_meta') is null
    or to_regclass('public.pnl_report_snapshots') is null
  then
    raise exception 'net-assets v1 foundation must exist before verified backfill';
  end if;

  if not exists (
    select 1
    from public.margin_debt_history_meta
    where version = 'v1'
      and seed_completed_at is not null
  ) then
    raise exception 'completed margin debt seed is required before verified backfill';
  end if;
end;
$$;

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

create temporary table margin_debt_verified_backfills (
  email text primary key,
  effective_at timestamptz not null,
  history_started_at timestamptz not null
) on commit drop;

insert into margin_debt_verified_backfills (
  email,
  effective_at,
  history_started_at
)
values (
  'chenshuai1190@gmail.com',
  timestamptz '2026-07-23T15:28:49.797Z',
  timestamptz '2026-07-25T14:04:35.791941Z'
);

do $$
begin
  if exists (
    select 1
    from margin_debt_verified_backfills as manifest
    where (
      select count(*)
      from auth.users as users
      where lower(users.email) = lower(manifest.email)
    ) <> 1
  ) then
    raise exception 'verified margin backfill account must resolve exactly once';
  end if;

  if exists (
    select 1
    from margin_debt_verified_backfills as manifest
    where (
      select count(*)
      from public.margin_debt_history_meta as meta
      where meta.version = 'v1'
        and meta.seed_completed_at is not null
        and meta.history_started_at = manifest.history_started_at
    ) <> 1
  ) then
    raise exception 'verified margin backfill must match the audited history boundary';
  end if;

  if exists (
    select 1
    from margin_debt_verified_backfills as manifest
    where (
      select count(*)
      from auth.users as users
      join public.margin_debt_events as seed
        on seed.user_id = users.id
       and seed.source = 'migration_seed_v1'
       and seed.source_updated_at = manifest.effective_at
       and seed.effective_at = manifest.history_started_at
       and seed.margin_debt_usd > 0
      where lower(users.email) = lower(manifest.email)
    ) <> 1
  ) then
    raise exception 'verified margin backfill must match one positive migration seed';
  end if;
end;
$$;

create temporary table margin_debt_verified_targets (
  user_id uuid primary key,
  email text not null unique,
  margin_debt_usd numeric(18, 6) not null check (margin_debt_usd > 0),
  effective_at timestamptz not null,
  history_started_at timestamptz not null
) on commit drop;

insert into margin_debt_verified_targets (
  user_id,
  email,
  margin_debt_usd,
  effective_at,
  history_started_at
)
select
  users.id,
  manifest.email,
  seed.margin_debt_usd,
  manifest.effective_at,
  manifest.history_started_at
from margin_debt_verified_backfills as manifest
join auth.users as users
  on lower(users.email) = lower(manifest.email)
join public.margin_debt_events as seed
  on seed.user_id = users.id
 and seed.source = 'migration_seed_v1'
 and seed.source_updated_at = manifest.effective_at
 and seed.effective_at = manifest.history_started_at
 and seed.margin_debt_usd > 0;

do $$
begin
  if (
    select count(*)
    from margin_debt_verified_targets
  ) <> (
    select count(*)
    from margin_debt_verified_backfills
  ) then
    raise exception 'verified margin backfill target set must match the manifest exactly';
  end if;
end;
$$;

insert into public.margin_debt_events (
  user_id,
  margin_debt_usd,
  effective_at,
  source,
  logic_version,
  source_updated_at
)
select
  target.user_id,
  target.margin_debt_usd,
  target.effective_at,
  'verified_backfill_v1',
  2,
  target.effective_at
from margin_debt_verified_targets as target
on conflict (user_id, source, effective_at)
where source = 'verified_backfill_v1'
do nothing;

do $$
begin
  if exists (
    select 1
    from margin_debt_verified_targets as target
    where (
      select count(*)
      from public.margin_debt_events as verified
      where verified.user_id = target.user_id
        and verified.source = 'verified_backfill_v1'
        and verified.margin_debt_usd = target.margin_debt_usd
        and verified.effective_at = target.effective_at
        and verified.source_updated_at = target.effective_at
        and verified.logic_version = 2
    ) <> 1
  ) then
    raise exception 'verified margin backfill must create exactly one matching event';
  end if;

  if exists (
    select 1
    from public.margin_debt_events as verified
    left join margin_debt_verified_targets as target
      on target.user_id = verified.user_id
     and target.margin_debt_usd = verified.margin_debt_usd
     and target.effective_at = verified.effective_at
     and target.effective_at = verified.source_updated_at
    where verified.source = 'verified_backfill_v1'
      and (
        target.user_id is null
        or verified.logic_version <> 2
      )
  ) then
    raise exception 'verified margin event falls outside the authorized manifest';
  end if;
end;
$$;

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
      (
        targets.snapshot_date + time '17:00'
      ) at time zone 'America/New_York' as cutoff_at,
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
    end as margin_debt_usd,
    case
      when not resolved.is_known then null
      else resolved.event_id
    end as margin_debt_event_id,
    case
      when not resolved.is_known then null
      else resolved.event_effective_at
    end as margin_debt_effective_at,
    case
      when not resolved.is_known then null
      when resolved.event_id is null then 'default_zero'
      else 'event'
    end as margin_debt_basis,
    resolved.is_known as known
  from resolved
  order by resolved.user_id, resolved.snapshot_date;
$$;

revoke all on function public.resolve_margin_debt_snapshot_targets(jsonb)
from public, anon, authenticated;

grant execute on function public.resolve_margin_debt_snapshot_targets(jsonb)
to service_role;

with backfill_candidates as (
  select
    snapshot.id as snapshot_id,
    event.id as event_id,
    event.margin_debt_usd,
    event.effective_at
  from public.pnl_report_snapshots as snapshot
  join margin_debt_verified_targets as target
    on target.user_id = snapshot.user_id
  join public.margin_debt_history_meta as meta
    on meta.version = 'v1'
   and meta.seed_completed_at is not null
   and meta.history_started_at = target.history_started_at
  cross join lateral (
    select
      candidate.id,
      candidate.margin_debt_usd,
      candidate.effective_at
    from public.margin_debt_events as candidate
    where candidate.user_id = snapshot.user_id
      and candidate.source = 'verified_backfill_v1'
      and candidate.margin_debt_usd = target.margin_debt_usd
      and candidate.effective_at = target.effective_at
      and candidate.source_updated_at = target.effective_at
      and candidate.logic_version = 2
    order by candidate.effective_at desc, candidate.id desc
    limit 1
  ) as event
  where (
      snapshot.snapshot_date + time '17:00'
    ) at time zone 'America/New_York' >= target.effective_at
    and (
      snapshot.snapshot_date + time '17:00'
    ) at time zone 'America/New_York' < target.history_started_at
    and snapshot.margin_debt_usd is null
    and snapshot.margin_debt_event_id is null
    and snapshot.margin_debt_effective_at is null
    and snapshot.margin_debt_basis is null
)
update public.pnl_report_snapshots as snapshot
set
  margin_debt_usd = candidate.margin_debt_usd,
  margin_debt_event_id = candidate.event_id,
  margin_debt_effective_at = candidate.effective_at,
  margin_debt_basis = 'event',
  source_version = 'pnl_snapshot_v2',
  updated_at = clock_timestamp()
from backfill_candidates as candidate
where snapshot.id = candidate.snapshot_id;

do $$
begin
  if exists (
    select 1
    from public.pnl_report_snapshots as snapshot
    join margin_debt_verified_targets as target
      on target.user_id = snapshot.user_id
    cross join lateral (
      select
        candidate.id,
        candidate.margin_debt_usd,
        candidate.effective_at
      from public.margin_debt_events as candidate
      where candidate.user_id = snapshot.user_id
        and candidate.source = 'verified_backfill_v1'
        and candidate.margin_debt_usd = target.margin_debt_usd
        and candidate.effective_at = target.effective_at
        and candidate.source_updated_at = target.effective_at
        and candidate.logic_version = 2
      order by candidate.effective_at desc, candidate.id desc
      limit 1
    ) as event
    where (
        snapshot.snapshot_date + time '17:00'
      ) at time zone 'America/New_York' >= target.effective_at
      and (
        snapshot.snapshot_date + time '17:00'
      ) at time zone 'America/New_York' < target.history_started_at
      and (
        snapshot.margin_debt_usd is distinct from event.margin_debt_usd
        or snapshot.margin_debt_event_id is distinct from event.id
        or snapshot.margin_debt_effective_at is distinct from event.effective_at
        or snapshot.margin_debt_basis is distinct from 'event'
        or snapshot.net_assets_usd is distinct from (
          snapshot.total_assets_usd - event.margin_debt_usd
        )
        or snapshot.source_version is distinct from 'pnl_snapshot_v2'
      )
  ) then
    raise exception 'eligible verified snapshot remains incomplete';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
