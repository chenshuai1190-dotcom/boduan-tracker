-- General, forward-only competition epoch rollover after an authoritative
-- financial-ledger change. Prior snapshots remain immutable history; the
-- changed ledger becomes the anchor for a later, newly ranked epoch.

begin;

-- Fail instead of building an unbounded queue behind an active ledger writer.
set local lock_timeout = '5s';

-- Replace the revision function while formal-ledger writes are paused. Inserts
-- and deletes always advance the sequence; updates do so only when a canonical
-- financial field changes. Display-only name/note edits keep the revision.
lock table public.stock_trades in share row exclusive mode;

create or replace function public.bump_stock_trade_ledger_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  affected_user_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  -- Display-only metadata is outside the canonical competition ledger. Keep
  -- its revision stable so a name/note edit cannot start a new ranking epoch.
  if tg_op = 'UPDATE' then
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

-- The epoch schema change does not need to retain the formal-ledger writer lock.
begin;

create table if not exists public.community_competition_epoch_resets (
  operation_key text primary key,
  user_id uuid not null,
  old_eligible_after_snapshot_date date not null,
  new_eligible_after_snapshot_date date not null,
  old_eligible_ledger_hash text,
  new_eligible_ledger_hash text not null,
  old_eligible_ledger_revision bigint not null,
  new_eligible_ledger_revision bigint not null,
  old_ranking_start_snapshot_date date,
  old_ranking_baseline_return_pct numeric(18, 10),
  market_close_at timestamptz not null,
  ledger_last_mutated_at timestamptz not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint community_competition_epoch_resets_operation_key_check
    check (
      char_length(operation_key) between 32 and 200
      and operation_key ~ '^competition-epoch-rollover:'
    ),
  constraint community_competition_epoch_resets_date_check
    check (new_eligible_after_snapshot_date > old_eligible_after_snapshot_date),
  constraint community_competition_epoch_resets_old_hash_check
    check (
      old_eligible_ledger_hash is null
      or old_eligible_ledger_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint community_competition_epoch_resets_new_hash_check
    check (new_eligible_ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint community_competition_epoch_resets_revision_check
    check (
      old_eligible_ledger_revision >= 0
      and new_eligible_ledger_revision > old_eligible_ledger_revision
    ),
  constraint community_competition_epoch_resets_ranking_pair_check
    check (
      (
        old_ranking_start_snapshot_date is null
        and old_ranking_baseline_return_pct is null
      )
      or
      (
        old_ranking_start_snapshot_date is not null
        and old_ranking_baseline_return_pct is not null
      )
    ),
  constraint community_competition_epoch_resets_market_close_check
    check (ledger_last_mutated_at <= market_close_at),
  constraint community_competition_epoch_resets_reason_check
    check (
      reason in (
        'prior_ledger_hash_mismatch',
        'eligible_ledger_hash_mismatch',
        'trade_before_first_snapshot',
        'trade_between_snapshots',
        'post_close_ledger_change',
        'late_trade'
      )
    )
);

alter table public.community_competition_epoch_resets enable row level security;
alter table public.community_competition_epoch_resets force row level security;

revoke all privileges on table public.community_competition_epoch_resets
from public, anon, authenticated, service_role;

grant select
on table public.community_competition_epoch_resets
to service_role;

create or replace function public.guard_community_competition_epoch_reset_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'community competition epoch reset rows are immutable'
    using errcode = '55000';
end;
$$;

revoke execute on function public.guard_community_competition_epoch_reset_immutable()
from public, anon, authenticated, service_role;

drop trigger if exists community_competition_epoch_resets_immutable
on public.community_competition_epoch_resets;

create trigger community_competition_epoch_resets_immutable
before update or delete on public.community_competition_epoch_resets
for each row
execute function public.guard_community_competition_epoch_reset_immutable();

create or replace function public.rollover_community_competition_member_epoch(
  p_user_id uuid,
  p_operation_key text,
  p_expected_eligible_after_snapshot_date date,
  p_expected_eligible_ledger_hash text,
  p_expected_eligible_ledger_revision bigint,
  p_expected_ranking_start_snapshot_date date,
  p_expected_ranking_baseline_return_pct numeric,
  p_expected_current_ledger_revision bigint,
  p_new_eligible_after_snapshot_date date,
  p_new_eligible_ledger_hash text,
  p_market_close_at timestamptz,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_operation_key text;
  expected_market_close_at timestamptz;
  current_ledger_revision bigint;
  current_ledger_last_mutated_at timestamptz;
  member_row public.community_competition_members%rowtype;
  audit_row public.community_competition_epoch_resets%rowtype;
begin
  expected_operation_key := format(
    'competition-epoch-rollover:%s:%s:%s',
    p_user_id::text,
    p_new_eligible_after_snapshot_date::text,
    p_expected_current_ledger_revision::text
  );
  expected_market_close_at := (
    p_new_eligible_after_snapshot_date + time '16:00'
  ) at time zone 'America/New_York';

  if p_user_id is null
    or p_operation_key is null
    or p_operation_key is distinct from expected_operation_key
    or p_expected_eligible_after_snapshot_date is null
    or p_expected_eligible_ledger_revision is null
    or p_expected_eligible_ledger_revision < 0
    or (
      (p_expected_ranking_start_snapshot_date is null)
      <> (p_expected_ranking_baseline_return_pct is null)
    )
    or p_expected_current_ledger_revision is null
    or p_expected_current_ledger_revision < 0
    or p_new_eligible_after_snapshot_date is null
    or extract(isodow from p_new_eligible_after_snapshot_date) in (6, 7)
    or p_new_eligible_ledger_hash is null
    or p_new_eligible_ledger_hash !~ '^[0-9a-f]{64}$'
    or p_market_close_at is null
    or p_market_close_at is distinct from expected_market_close_at
    or p_reason is null
    or p_reason not in (
      'prior_ledger_hash_mismatch',
      'eligible_ledger_hash_mismatch',
      'trade_before_first_snapshot',
      'trade_between_snapshots',
      'post_close_ledger_change',
      'late_trade'
    )
  then
    return 'invalid_input';
  end if;

  -- Match the immutable snapshot INSERT lock order: ledger revision, then
  -- membership. This serializes edits, rollovers, and new snapshot writes.
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
  if current_ledger_revision
      is distinct from p_expected_current_ledger_revision
  then
    return 'stale_ledger';
  end if;

  -- A lost-response retry is accepted only when the immutable audit row proves
  -- that this exact operation already committed. A reused key with any changed
  -- field is a hard conflict.
  select *
  into audit_row
  from public.community_competition_epoch_resets
  where operation_key = p_operation_key;

  if found then
    if audit_row.user_id = p_user_id
      and audit_row.old_eligible_after_snapshot_date
        = p_expected_eligible_after_snapshot_date
      and audit_row.new_eligible_after_snapshot_date
        = p_new_eligible_after_snapshot_date
      and audit_row.old_eligible_ledger_hash
        is not distinct from p_expected_eligible_ledger_hash
      and audit_row.new_eligible_ledger_hash = p_new_eligible_ledger_hash
      and audit_row.old_eligible_ledger_revision
        = p_expected_eligible_ledger_revision
      and audit_row.new_eligible_ledger_revision
        = p_expected_current_ledger_revision
      and audit_row.old_ranking_start_snapshot_date
        is not distinct from p_expected_ranking_start_snapshot_date
      and audit_row.old_ranking_baseline_return_pct
        is not distinct from p_expected_ranking_baseline_return_pct
      and audit_row.market_close_at = p_market_close_at
      and audit_row.reason = p_reason
    then
      return 'already_rolled_over';
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

  -- A ranked member must point at a real old snapshot. A member already waiting
  -- may roll again when any immutable old snapshot exists, including the orphan
  -- first snapshot left by a failed ranking PATCH. The conflict check below
  -- requires the new anchor to be strictly later than every such snapshot.
  if member_row.ranking_start_snapshot_date is not null then
    if not exists (
      select 1
      from public.community_competition_snapshots
      where user_id = p_user_id
        and snapshot_date = member_row.ranking_start_snapshot_date
    ) then
      return 'ranking_snapshot_missing';
    end if;
  elsif not exists (
    select 1
    from public.community_competition_snapshots
    where user_id = p_user_id
  ) then
    return 'pending_history_missing';
  end if;

  if p_new_eligible_after_snapshot_date
      <= member_row.eligible_after_snapshot_date
  then
    return 'date_regression';
  end if;
  if current_ledger_revision <= member_row.eligible_ledger_revision then
    return 'ledger_unchanged';
  end if;
  if p_market_close_at > clock_timestamp() then
    return 'market_close_not_reached';
  end if;
  if current_ledger_last_mutated_at is null then
    return 'ledger_mutation_missing';
  end if;
  if current_ledger_last_mutated_at > p_market_close_at then
    return 'ledger_mutated_after_close';
  end if;

  -- A target/future snapshot means another worker already advanced this member.
  -- Earlier snapshots are deliberately retained as immutable prior epochs.
  if exists (
    select 1
    from public.community_competition_snapshots
    where user_id = p_user_id
      and snapshot_date >= p_new_eligible_after_snapshot_date
  ) then
    return 'snapshot_conflict';
  end if;

  insert into public.community_competition_epoch_resets (
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
    market_close_at,
    ledger_last_mutated_at,
    reason
  )
  values (
    p_operation_key,
    p_user_id,
    member_row.eligible_after_snapshot_date,
    p_new_eligible_after_snapshot_date,
    member_row.eligible_ledger_hash,
    p_new_eligible_ledger_hash,
    member_row.eligible_ledger_revision,
    current_ledger_revision,
    member_row.ranking_start_snapshot_date,
    member_row.ranking_baseline_return_pct,
    p_market_close_at,
    current_ledger_last_mutated_at,
    p_reason
  )
  on conflict (operation_key) do nothing;

  if not found then
    return 'audit_conflict';
  end if;

  update public.community_competition_members
  set eligible_after_snapshot_date = p_new_eligible_after_snapshot_date,
      eligible_ledger_hash = p_new_eligible_ledger_hash,
      eligible_ledger_revision = current_ledger_revision,
      ranking_start_snapshot_date = null,
      ranking_baseline_return_pct = null,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  return 'rolled_over';
end;
$$;

revoke execute on function public.rollover_community_competition_member_epoch(
  uuid, text, date, text, bigint, date, numeric, bigint, date, text, timestamptz, text
)
from public, anon, authenticated, service_role;

grant execute on function public.rollover_community_competition_member_epoch(
  uuid, text, date, text, bigint, date, numeric, bigint, date, text, timestamptz, text
)
to service_role;

notify pgrst, 'reload schema';

commit;
