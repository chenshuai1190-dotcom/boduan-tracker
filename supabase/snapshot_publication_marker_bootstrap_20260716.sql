-- Bootstrap the durable competition publication boundary from an already
-- locked historical batch after the marker table was introduced.
--
-- This migration is intentionally fail-closed:
-- - it runs only while no competition marker exists;
-- - a candidate date must contain exactly every currently active member whose
--   eligibility and ranking start both require a snapshot on that date;
-- - no unexpected user snapshot may be present in that batch;
-- - all rows must retain the immutable ledger proof required by the formal
--   competition snapshot table.
--
-- It publishes no return value and creates no competition snapshot. It only
-- makes a previously complete, real, locked batch visible to the existing API.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Freeze every input used by the completeness proof. The marker is locked
-- last so an already-running formal publisher can finish without deadlocking.
lock table public.community_profiles in share mode;
lock table public.community_competition_members in share mode;
lock table public.community_competition_snapshots in share mode;
lock table public.snapshot_publication_markers in share row exclusive mode;

do $bootstrap$
declare
  complete_snapshot_date date;
  bootstrap_now timestamptz := clock_timestamp();
begin
  -- A normal scheduler publication always wins. This migration is only the
  -- one-time compatibility bridge for an empty marker table.
  if exists (
    select 1
    from public.snapshot_publication_markers
    where channel = 'competition'
  ) then
    return;
  end if;

  with candidate_dates as (
    select distinct snapshot.snapshot_date
    from public.community_competition_snapshots as snapshot
    where snapshot.locked_at is not null
      and snapshot.locked_at <= bootstrap_now
      -- This is an upgrade bridge for batches created before the publication
      -- marker rollout, never a second publisher for future close jobs.
      and snapshot.snapshot_date < date '2026-07-16'
  ),
  complete_dates as (
    select candidate.snapshot_date
    from candidate_dates as candidate
    where exists (
      select 1
      from public.community_competition_members as member
      join public.community_profiles as profile
        on profile.user_id = member.user_id
       and profile.profile_completed_at is not null
       and btrim(profile.nickname) <> ''
       and btrim(profile.avatar_key) <> ''
      where member.status = 'active'
        and member.ranking_start_snapshot_date is not null
        and member.ranking_baseline_return_pct is not null
        and member.eligible_after_snapshot_date < candidate.snapshot_date
        and member.ranking_start_snapshot_date <= candidate.snapshot_date
    )
    and not exists (
      select 1
      from public.community_competition_members as member
      join public.community_profiles as profile
        on profile.user_id = member.user_id
       and profile.profile_completed_at is not null
       and btrim(profile.nickname) <> ''
       and btrim(profile.avatar_key) <> ''
      where member.status = 'active'
        and member.ranking_start_snapshot_date is not null
        and member.ranking_baseline_return_pct is not null
        and member.eligible_after_snapshot_date < candidate.snapshot_date
        and member.ranking_start_snapshot_date <= candidate.snapshot_date
        and not exists (
          select 1
          from public.community_competition_snapshots as snapshot
          where snapshot.user_id = member.user_id
            and snapshot.snapshot_date = candidate.snapshot_date
            and snapshot.locked_at is not null
            and snapshot.locked_at <= bootstrap_now
            and snapshot.ledger_hash ~ '^[0-9a-f]{64}$'
            and snapshot.ledger_revision >= 0
        )
    )
    and not exists (
      select 1
      from public.community_competition_snapshots as snapshot
      where snapshot.snapshot_date = candidate.snapshot_date
        and not exists (
          select 1
          from public.community_competition_members as member
          where member.user_id = snapshot.user_id
            and member.status = 'active'
            and member.ranking_start_snapshot_date is not null
            and member.ranking_baseline_return_pct is not null
            and member.eligible_after_snapshot_date < candidate.snapshot_date
            and member.ranking_start_snapshot_date <= candidate.snapshot_date
            and exists (
              select 1
              from public.community_profiles as profile
              where profile.user_id = member.user_id
                and profile.profile_completed_at is not null
                and btrim(profile.nickname) <> ''
                and btrim(profile.avatar_key) <> ''
            )
        )
    )
  )
  select max(complete_dates.snapshot_date)
  into complete_snapshot_date
  from complete_dates;

  if complete_snapshot_date is null then
    raise exception 'no complete historical competition snapshot batch is available';
  end if;

  insert into public.snapshot_publication_markers (
    channel,
    snapshot_date,
    version,
    completed_at
  ) values (
    'competition',
    complete_snapshot_date,
    'verified_bootstrap_20260716',
    bootstrap_now
  )
  on conflict (channel, snapshot_date) do nothing;
end;
$bootstrap$;

commit;
