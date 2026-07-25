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

create temporary table margin_debt_verified_expected_snapshots (
  user_id uuid not null,
  snapshot_date date not null,
  should_repair boolean not null,
  primary key (user_id, snapshot_date)
) on commit drop;

insert into margin_debt_verified_expected_snapshots (
  user_id,
  snapshot_date,
  should_repair
)
select
  target.user_id,
  expected.snapshot_date,
  expected.should_repair
from margin_debt_verified_targets as target
cross join (
  values
    (date '2026-07-22', false),
    (date '2026-07-23', true),
    (date '2026-07-24', true)
) as expected(snapshot_date, should_repair);

create temporary table margin_debt_verified_deploy_state (
  was_already_applied boolean not null,
  other_legacy_row_count bigint not null,
  target_total_assets_signature text not null
) on commit drop;

do $$
declare
  expected_row_count integer;
  verified_event_count integer;
  exact_verified_event_count integer;
  unknown_row_count integer;
  null_repair_row_count integer;
  exact_repair_row_count integer;
  other_legacy_row_count bigint;
  target_total_assets_signature text;
begin
  select count(*)
  into expected_row_count
  from margin_debt_verified_expected_snapshots as expected
  join public.pnl_report_snapshots as snapshot
    on snapshot.user_id = expected.user_id
   and snapshot.snapshot_date = expected.snapshot_date;

  if expected_row_count <> 3 then
    raise exception 'verified margin backfill requires exactly three audited snapshots';
  end if;

  select count(*)
  into verified_event_count
  from public.margin_debt_events
  where source = 'verified_backfill_v1';

  select count(*)
  into exact_verified_event_count
  from public.margin_debt_events as verified
  join margin_debt_verified_targets as target
    on target.user_id = verified.user_id
   and target.margin_debt_usd = verified.margin_debt_usd
   and target.effective_at = verified.effective_at
   and target.effective_at = verified.source_updated_at
  where verified.source = 'verified_backfill_v1'
    and verified.logic_version = 2;

  select count(*)
  into unknown_row_count
  from margin_debt_verified_expected_snapshots as expected
  join public.pnl_report_snapshots as snapshot
    on snapshot.user_id = expected.user_id
   and snapshot.snapshot_date = expected.snapshot_date
  where not expected.should_repair
    and snapshot.margin_debt_usd is null
    and snapshot.margin_debt_event_id is null
    and snapshot.margin_debt_effective_at is null
    and snapshot.margin_debt_basis is null
    and snapshot.net_assets_usd is null
    and snapshot.source_version = 'pnl_snapshot_v1';

  if unknown_row_count <> 1 then
    raise exception 'verified margin backfill requires the pre-anchor snapshot to remain unknown';
  end if;

  select count(*)
  into null_repair_row_count
  from margin_debt_verified_expected_snapshots as expected
  join public.pnl_report_snapshots as snapshot
    on snapshot.user_id = expected.user_id
   and snapshot.snapshot_date = expected.snapshot_date
  where expected.should_repair
    and snapshot.margin_debt_usd is null
    and snapshot.margin_debt_event_id is null
    and snapshot.margin_debt_effective_at is null
    and snapshot.margin_debt_basis is null
    and snapshot.net_assets_usd is null
    and snapshot.source_version = 'pnl_snapshot_v1';

  select count(*)
  into exact_repair_row_count
  from margin_debt_verified_expected_snapshots as expected
  join public.pnl_report_snapshots as snapshot
    on snapshot.user_id = expected.user_id
   and snapshot.snapshot_date = expected.snapshot_date
  join public.margin_debt_events as verified
    on verified.user_id = expected.user_id
   and verified.source = 'verified_backfill_v1'
   and verified.margin_debt_usd = snapshot.margin_debt_usd
   and verified.id = snapshot.margin_debt_event_id
   and verified.effective_at = snapshot.margin_debt_effective_at
   and snapshot.margin_debt_basis = 'event'
   and snapshot.net_assets_usd = (
     snapshot.total_assets_usd - verified.margin_debt_usd
   )
   and snapshot.source_version = 'pnl_snapshot_v2'
  where expected.should_repair;

  if not (
    (
      verified_event_count = 0
      and exact_verified_event_count = 0
      and null_repair_row_count = 2
      and exact_repair_row_count = 0
    )
    or
    (
      verified_event_count = 1
      and exact_verified_event_count = 1
      and null_repair_row_count = 0
      and exact_repair_row_count = 2
    )
  ) then
    raise exception 'verified margin backfill snapshots must be wholly pending or wholly applied';
  end if;

  select count(*)
  into other_legacy_row_count
  from public.pnl_report_snapshots as snapshot
  where not exists (
      select 1
      from margin_debt_verified_targets as target
      where target.user_id = snapshot.user_id
    )
    and (
      snapshot.snapshot_date + time '17:00'
    ) at time zone 'America/New_York' < (
      select min(target.history_started_at)
      from margin_debt_verified_targets as target
    );

  select md5(string_agg(
    snapshot.id::text || ':' || snapshot.total_assets_usd::text,
    ','
    order by snapshot.id
  ))
  into target_total_assets_signature
  from margin_debt_verified_expected_snapshots as expected
  join public.pnl_report_snapshots as snapshot
    on snapshot.user_id = expected.user_id
   and snapshot.snapshot_date = expected.snapshot_date;

  insert into margin_debt_verified_deploy_state (
    was_already_applied,
    other_legacy_row_count,
    target_total_assets_signature
  )
  values (
    verified_event_count = 1,
    other_legacy_row_count,
    target_total_assets_signature
  );
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
declare
  was_already_applied boolean;
  other_legacy_row_count_before bigint;
  other_legacy_row_count_after bigint;
  target_total_assets_signature_before text;
  target_total_assets_signature_after text;
  target_changed_by_transaction integer;
  other_changed_by_transaction integer;
begin
  select
    state.was_already_applied,
    state.other_legacy_row_count,
    state.target_total_assets_signature
  into
    was_already_applied,
    other_legacy_row_count_before,
    target_total_assets_signature_before
  from margin_debt_verified_deploy_state as state;

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

  if (
    select count(*)
    from margin_debt_verified_expected_snapshots as expected
    join public.pnl_report_snapshots as snapshot
      on snapshot.user_id = expected.user_id
     and snapshot.snapshot_date = expected.snapshot_date
    where not expected.should_repair
      and snapshot.margin_debt_usd is null
      and snapshot.margin_debt_event_id is null
      and snapshot.margin_debt_effective_at is null
      and snapshot.margin_debt_basis is null
      and snapshot.net_assets_usd is null
      and snapshot.source_version = 'pnl_snapshot_v1'
      and snapshot.xmin <> pg_current_xact_id()::xid
  ) <> 1 then
    raise exception 'verified margin backfill changed the pre-anchor snapshot';
  end if;

  if (
    select count(*)
    from margin_debt_verified_expected_snapshots as expected
    join public.pnl_report_snapshots as snapshot
      on snapshot.user_id = expected.user_id
     and snapshot.snapshot_date = expected.snapshot_date
    join public.margin_debt_events as verified
      on verified.user_id = expected.user_id
     and verified.source = 'verified_backfill_v1'
     and verified.margin_debt_usd = snapshot.margin_debt_usd
     and verified.id = snapshot.margin_debt_event_id
     and verified.effective_at = snapshot.margin_debt_effective_at
     and snapshot.margin_debt_basis = 'event'
     and snapshot.net_assets_usd = (
       snapshot.total_assets_usd - verified.margin_debt_usd
     )
     and snapshot.source_version = 'pnl_snapshot_v2'
    where expected.should_repair
  ) <> 2 then
    raise exception 'verified margin backfill must complete exactly two snapshots';
  end if;

  select count(*)
  into target_changed_by_transaction
  from margin_debt_verified_expected_snapshots as expected
  join public.pnl_report_snapshots as snapshot
    on snapshot.user_id = expected.user_id
   and snapshot.snapshot_date = expected.snapshot_date
  where expected.should_repair
    and snapshot.xmin = pg_current_xact_id()::xid;

  if target_changed_by_transaction <> (
    case when was_already_applied then 0 else 2 end
  ) then
    raise exception 'verified margin backfill changed an unexpected number of target snapshots';
  end if;

  select count(*)
  into other_legacy_row_count_after
  from public.pnl_report_snapshots as snapshot
  where not exists (
      select 1
      from margin_debt_verified_targets as target
      where target.user_id = snapshot.user_id
    )
    and (
      snapshot.snapshot_date + time '17:00'
    ) at time zone 'America/New_York' < (
      select min(target.history_started_at)
      from margin_debt_verified_targets as target
    );

  select count(*)
  into other_changed_by_transaction
  from public.pnl_report_snapshots as snapshot
  where not exists (
      select 1
      from margin_debt_verified_targets as target
      where target.user_id = snapshot.user_id
    )
    and (
      snapshot.snapshot_date + time '17:00'
    ) at time zone 'America/New_York' < (
      select min(target.history_started_at)
      from margin_debt_verified_targets as target
    )
    and snapshot.xmin = pg_current_xact_id()::xid;

  if other_legacy_row_count_after <> other_legacy_row_count_before
    or other_changed_by_transaction <> 0
  then
    raise exception 'verified margin backfill changed another account snapshot';
  end if;

  select md5(string_agg(
    snapshot.id::text || ':' || snapshot.total_assets_usd::text,
    ','
    order by snapshot.id
  ))
  into target_total_assets_signature_after
  from margin_debt_verified_expected_snapshots as expected
  join public.pnl_report_snapshots as snapshot
    on snapshot.user_id = expected.user_id
   and snapshot.snapshot_date = expected.snapshot_date;

  if target_total_assets_signature_after is distinct from
    target_total_assets_signature_before
  then
    raise exception 'verified margin backfill changed target total assets';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
