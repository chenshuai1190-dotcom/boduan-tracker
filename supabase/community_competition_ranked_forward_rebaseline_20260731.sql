-- One-time, forward-only repair for the 2026-07-30 legacy client timezone
-- mismatch. The rejected day receives no return snapshot; prior locked
-- snapshots remain immutable history.

begin;

create table if not exists public.community_competition_rebaseline_audit (
  operation_key text primary key,
  user_id uuid not null,
  old_eligible_after_snapshot_date date not null,
  new_eligible_after_snapshot_date date not null,
  old_eligible_ledger_hash text,
  new_eligible_ledger_hash text not null,
  old_eligible_ledger_revision bigint not null,
  new_eligible_ledger_revision bigint not null,
  old_ranking_start_snapshot_date date not null,
  old_ranking_baseline_return_pct numeric(18, 10) not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint community_competition_rebaseline_audit_old_hash_check
    check (
      old_eligible_ledger_hash is null
      or old_eligible_ledger_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint community_competition_rebaseline_audit_new_hash_check
    check (new_eligible_ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint community_competition_rebaseline_audit_revision_check
    check (
      old_eligible_ledger_revision >= 0
      and new_eligible_ledger_revision >= 0
    ),
  constraint community_competition_rebaseline_audit_incident_date_check
    check (new_eligible_after_snapshot_date = date '2026-07-30'),
  constraint community_competition_rebaseline_audit_reason_check
    check (reason = 'legacy_shanghai_new_york_trade_date_mismatch_2026-07-30')
);

alter table public.community_competition_rebaseline_audit enable row level security;
alter table public.community_competition_rebaseline_audit force row level security;

revoke all privileges on table public.community_competition_rebaseline_audit
from public, anon, authenticated, service_role;

grant select
on table public.community_competition_rebaseline_audit
to service_role;

create or replace function public.guard_community_competition_rebaseline_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'community competition rebaseline audit rows are immutable'
    using errcode = '55000';
end;
$$;

revoke execute on function public.guard_community_competition_rebaseline_audit_immutable()
from public, anon, authenticated;

drop trigger if exists community_competition_rebaseline_audit_immutable
on public.community_competition_rebaseline_audit;

create trigger community_competition_rebaseline_audit_immutable
before update or delete on public.community_competition_rebaseline_audit
for each row
execute function public.guard_community_competition_rebaseline_audit_immutable();

create or replace function public.forward_rebaseline_ranked_community_competition_member(
  p_user_id uuid,
  p_expected_eligible_after_snapshot_date date,
  p_expected_eligible_ledger_hash text,
  p_expected_eligible_ledger_revision bigint,
  p_expected_ranking_start_snapshot_date date,
  p_expected_ranking_baseline_return_pct numeric,
  p_expected_current_ledger_revision bigint,
  p_new_eligible_after_snapshot_date date,
  p_new_eligible_ledger_hash text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  incident_date constant date := date '2026-07-30';
  incident_prior_new_york_date constant date := date '2026-07-29';
  incident_close constant timestamptz :=
    make_timestamptz(2026, 7, 30, 16, 0, 0, 'America/New_York');
  incident_reason constant text :=
    'legacy_shanghai_new_york_trade_date_mismatch_2026-07-30';
  operation_key_value text :=
    format('ranked-forward-rebaseline:2026-07-30:%s', p_user_id::text);
  current_ledger_revision bigint;
  current_ledger_last_mutated_at timestamptz;
  member_row public.community_competition_members%rowtype;
begin
  if p_user_id is null
    or p_expected_eligible_ledger_revision is null
    or p_expected_eligible_ledger_revision < 0
    or p_expected_ranking_start_snapshot_date is null
    or p_expected_ranking_baseline_return_pct is null
    or p_expected_current_ledger_revision is null
    or p_expected_current_ledger_revision < 0
    or p_new_eligible_after_snapshot_date is distinct from incident_date
    or p_new_eligible_ledger_hash is null
    or p_new_eligible_ledger_hash !~ '^[0-9a-f]{64}$'
  then
    return 'invalid_input';
  end if;

  -- Match the snapshot INSERT trigger lock order: revision, then membership.
  select revision, last_mutated_at
  into current_ledger_revision, current_ledger_last_mutated_at
  from public.stock_trade_ledger_revisions
  where user_id = p_user_id
  for update;

  if not found then
    return 'revision_missing';
  end if;

  select *
  into member_row
  from public.community_competition_members
  where user_id = p_user_id
  for update;

  if not found then
    return 'member_missing';
  end if;
  if member_row.status <> 'active' then
    return 'not_active';
  end if;
  if current_ledger_revision is distinct from p_expected_current_ledger_revision then
    return 'stale_ledger';
  end if;

  -- A retry whose first response was lost is accepted only when the immutable
  -- audit record proves that this exact one-time repair already committed.
  if member_row.eligible_after_snapshot_date = incident_date
    and member_row.eligible_ledger_hash = p_new_eligible_ledger_hash
    and member_row.eligible_ledger_revision = current_ledger_revision
    and member_row.ranking_start_snapshot_date is null
    and member_row.ranking_baseline_return_pct is null
  then
    if exists (
      select 1
      from public.community_competition_rebaseline_audit as audit
      where audit.operation_key = operation_key_value
        and audit.user_id = p_user_id
        and audit.old_eligible_after_snapshot_date
          = p_expected_eligible_after_snapshot_date
        and audit.new_eligible_after_snapshot_date = incident_date
        and audit.old_eligible_ledger_hash
          is not distinct from p_expected_eligible_ledger_hash
        and audit.new_eligible_ledger_hash = p_new_eligible_ledger_hash
        and audit.old_eligible_ledger_revision
          = p_expected_eligible_ledger_revision
        and audit.new_eligible_ledger_revision = current_ledger_revision
        and audit.old_ranking_start_snapshot_date
          = p_expected_ranking_start_snapshot_date
        and audit.old_ranking_baseline_return_pct
          = p_expected_ranking_baseline_return_pct
        and audit.reason = incident_reason
    ) then
      return 'already_rebaselined';
    end if;
    return 'audit_conflict';
  end if;

  if member_row.eligible_after_snapshot_date
      is distinct from p_expected_eligible_after_snapshot_date
    or member_row.eligible_ledger_hash
      is distinct from p_expected_eligible_ledger_hash
    or member_row.eligible_ledger_revision
      is distinct from p_expected_eligible_ledger_revision
    or member_row.ranking_start_snapshot_date
      is distinct from p_expected_ranking_start_snapshot_date
    or member_row.ranking_baseline_return_pct
      is distinct from p_expected_ranking_baseline_return_pct
  then
    return 'stale_member';
  end if;
  if member_row.ranking_start_snapshot_date is null
    or member_row.ranking_baseline_return_pct is null
  then
    return 'ranking_not_started';
  end if;
  if incident_date <= member_row.eligible_after_snapshot_date then
    return 'date_regression';
  end if;

  -- This RPC is incident-specific. It cannot turn a genuine after-close ledger
  -- mutation into a new competition epoch.
  if current_ledger_last_mutated_at is null
    or current_ledger_last_mutated_at > incident_close
  then
    return 'incident_not_matched';
  end if;

  -- At least one target-day trade must carry the exact legacy signature:
  -- Shanghai already read 07-30 while New York was still 07-29.
  if not exists (
    select 1
    from public.stock_trades as trade
    where trade.user_id = p_user_id
      and trade.trade_date = incident_date
      and (trade.created_at at time zone 'Asia/Shanghai')::date = incident_date
      and (trade.created_at at time zone 'America/New_York')::date
        = incident_prior_new_york_date
      and trade.created_at <= incident_close
  ) then
    return 'incident_not_matched';
  end if;

  -- Every target-day trade must have been written by the close. A trade whose
  -- New York creation date is not 07-30 is accepted only when it carries that
  -- same Shanghai-07-30/New-York-07-29 legacy signature.
  if exists (
    select 1
    from public.stock_trades as trade
    where trade.user_id = p_user_id
      and trade.trade_date = incident_date
      and (
        trade.created_at > incident_close
        or (
          (trade.created_at at time zone 'America/New_York')::date
            <> incident_date
          and not (
            (trade.created_at at time zone 'Asia/Shanghai')::date
              = incident_date
            and (trade.created_at at time zone 'America/New_York')::date
              = incident_prior_new_york_date
          )
        )
      )
  ) then
    return 'incident_not_matched';
  end if;

  -- Prior snapshots remain immutable. A target/future snapshot means another
  -- worker already advanced this epoch, so resetting it would erase continuity.
  if exists (
    select 1
    from public.community_competition_snapshots
    where user_id = p_user_id
      and snapshot_date >= incident_date
  ) then
    return 'snapshot_conflict';
  end if;

  insert into public.community_competition_rebaseline_audit (
    operation_key,
    user_id,
    old_eligible_after_snapshot_date,
    new_eligible_after_snapshot_date,
    old_eligible_ledger_hash,
    new_eligible_ledger_hash,
    old_eligible_ledger_revision,
    new_eligible_ledger_revision,
    old_ranking_start_snapshot_date,
    old_ranking_baseline_return_pct,
    reason
  )
  values (
    operation_key_value,
    p_user_id,
    member_row.eligible_after_snapshot_date,
    incident_date,
    member_row.eligible_ledger_hash,
    p_new_eligible_ledger_hash,
    member_row.eligible_ledger_revision,
    current_ledger_revision,
    member_row.ranking_start_snapshot_date,
    member_row.ranking_baseline_return_pct,
    incident_reason
  )
  on conflict (operation_key) do nothing;

  if not found then
    return 'audit_conflict';
  end if;

  update public.community_competition_members
  set eligible_after_snapshot_date = incident_date,
      eligible_ledger_hash = p_new_eligible_ledger_hash,
      eligible_ledger_revision = current_ledger_revision,
      ranking_start_snapshot_date = null,
      ranking_baseline_return_pct = null,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  return 'rebaselined';
end;
$$;

revoke execute on function public.forward_rebaseline_ranked_community_competition_member(
  uuid, date, text, bigint, date, numeric, bigint, date, text
)
from public, anon, authenticated;

grant execute on function public.forward_rebaseline_ranked_community_competition_member(
  uuid, date, text, bigint, date, numeric, bigint, date, text
)
to service_role;

notify pgrst, 'reload schema';

commit;
