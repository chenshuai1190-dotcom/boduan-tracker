-- Forward-only available-cash movement reversal foundation.
--
-- Apply this migration after the base available-cash movement foundation and
-- before deploying the movement/reversal-aware runtime. The base and reversal
-- readiness gates remain independent, and the dedicated reversal RPC stays
-- unexecutable until the after-runtime reversal contract completes its cutover.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if to_regclass('public.available_cash_status') is null
    or to_regclass('public.available_cash_events') is null
    or to_regclass('public.available_cash_movements') is null
  then
    raise exception 'available cash movement foundation tables are missing';
  end if;

  if to_regprocedure(
    'public.mutate_available_cash(uuid,text,numeric,timestamp with time zone,text,numeric,numeric,text,text)'
  ) is null
    or to_regprocedure('public.capture_available_cash_event()') is null
    or to_regprocedure('public.normalize_available_cash_status()') is null
    or to_regprocedure('public.available_cash_write_contract_ready()') is null
  then
    raise exception 'available cash movement foundation functions are missing';
  end if;

  if to_regprocedure(
    'public.reverse_available_cash_movement(uuid,uuid,timestamp with time zone)'
  ) is not null
    or to_regprocedure('public.available_cash_reversal_contract_ready()') is not null
    or exists (
      select 1
      from pg_attribute
      where attrelid = 'public.available_cash_movements'::regclass
        and attname = 'reverses_movement_id'
        and not attisdropped
    )
  then
    raise exception 'available cash reversal foundation was already staged';
  end if;

end;
$$;

alter table public.available_cash_movements
add column if not exists reverses_movement_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_movements'::regclass
      and conname = 'available_cash_movements_user_id_id_key'
  ) then
    alter table public.available_cash_movements
    add constraint available_cash_movements_user_id_id_key
    unique (user_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_movements'::regclass
      and conname = 'available_cash_movements_reversal_owner_fkey'
  ) then
    alter table public.available_cash_movements
    add constraint available_cash_movements_reversal_owner_fkey
    foreign key (user_id, reverses_movement_id)
    references public.available_cash_movements (user_id, id)
    on delete cascade;
  end if;
end;
$$;

create unique index if not exists available_cash_movements_one_reversal_idx
on public.available_cash_movements (reverses_movement_id)
where reverses_movement_id is not null;

alter table public.available_cash_movements
drop constraint if exists available_cash_movements_kind_check;

alter table public.available_cash_movements
add constraint available_cash_movements_kind_check
check (
  kind in ('transfer_in', 'transfer_out', 'balance_adjustment', 'reversal')
);

alter table public.available_cash_movements
drop constraint if exists available_cash_movements_arithmetic_check;

alter table public.available_cash_movements
add constraint available_cash_movements_arithmetic_check
check (
  balance_after_usd = balance_before_usd + delta_usd
  and (
    (
      kind = 'transfer_in'
      and amount_usd > 0
      and delta_usd = amount_usd
    )
    or
    (
      kind = 'transfer_out'
      and amount_usd > 0
      and delta_usd = -amount_usd
    )
    or
    (
      kind = 'balance_adjustment'
      and balance_after_usd = amount_usd
      and (delta_usd <> 0 or not balance_was_set_before)
    )
    or
    (
      kind = 'reversal'
      and balance_was_set_before
      and amount_usd > 0
      and delta_usd <> 0
      and amount_usd = abs(delta_usd)
    )
  )
);

alter table public.available_cash_movements
drop constraint if exists available_cash_movements_input_check;

alter table public.available_cash_movements
add constraint available_cash_movements_input_check
check (
  (
    kind = 'reversal'
    and input_currency = 'USD'
    and usd_rate = 1
    and input_amount = amount_usd
  )
  or
  (
    kind <> 'reversal'
    and input_currency in ('USD', 'CNY')
    and (
      (
        input_currency = 'USD'
        and usd_rate = 1
        and input_amount = amount_usd
      )
      or
      (
        input_currency = 'CNY'
        and amount_usd = round(input_amount / usd_rate, 6)
      )
    )
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_movements'::regclass
      and conname = 'available_cash_movements_reversal_link_check'
  ) then
    alter table public.available_cash_movements
    add constraint available_cash_movements_reversal_link_check
    check (
      (
        kind = 'reversal'
        and reverses_movement_id is not null
      )
      or
      (
        kind <> 'reversal'
        and reverses_movement_id is null
      )
    );
  end if;
end;
$$;

create index if not exists available_cash_movements_user_reversible_idx
on public.available_cash_movements (user_id, cash_event_id desc)
where kind <> 'reversal'
  and reverses_movement_id is null
  and cash_event_id is not null
  and delta_usd <> 0;

alter table public.available_cash_movements enable row level security;
alter table public.available_cash_movements force row level security;

revoke all privileges on table public.available_cash_movements
from public, anon, authenticated, service_role;

grant select on table public.available_cash_movements
to authenticated, service_role;

drop policy if exists "users can read own available cash movements"
on public.available_cash_movements;

create policy "users can read own available cash movements"
on public.available_cash_movements
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.validate_available_cash_reversal_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  original_movement public.available_cash_movements%rowtype;
begin
  if new.kind <> 'reversal' then
    if new.reverses_movement_id is not null then
      raise exception 'non-reversal movement cannot reference a reversed movement'
        using errcode = '22023';
    end if;
    return new;
  end if;

  select movement.*
  into original_movement
  from public.available_cash_movements as movement
  where movement.user_id = new.user_id
    and movement.id = new.reverses_movement_id;

  if not found then
    raise exception 'available cash reversal original movement is missing'
      using errcode = '22023';
  end if;

  if original_movement.kind = 'reversal'
    or original_movement.reverses_movement_id is not null
  then
    raise exception 'available cash reversal rows cannot be reversed'
      using errcode = '22023';
  end if;

  if original_movement.delta_usd = 0 then
    raise exception 'a zero-delta available cash movement cannot be reversed'
      using errcode = '22023';
  end if;

  if new.amount_usd is distinct from abs(original_movement.delta_usd)
    or new.delta_usd is distinct from -original_movement.delta_usd
    or new.balance_before_usd is distinct from original_movement.balance_after_usd
    or new.balance_after_usd is distinct from original_movement.balance_before_usd
    or new.balance_was_set_before is distinct from true
    or new.input_currency is distinct from 'USD'
    or new.input_amount is distinct from abs(original_movement.delta_usd)
    or new.usd_rate is distinct from 1
    or new.note is distinct from ''
    or new.destination_label is distinct from ''
  then
    raise exception 'available cash reversal fields do not restore the original balance'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.available_cash_events as event
    where event.id = new.cash_event_id
      and event.user_id = new.user_id
      and event.cash_usd = new.balance_after_usd
      and event.effective_at = new.occurred_at
  ) then
    raise exception 'available cash reversal event provenance is invalid'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_available_cash_reversal_insert()
from public, anon, authenticated, service_role;

drop trigger if exists validate_available_cash_reversal_insert
on public.available_cash_movements;

create trigger validate_available_cash_reversal_insert
before insert on public.available_cash_movements
for each row
execute function public.validate_available_cash_reversal_insert();

create or replace function public.reverse_available_cash_movement(
  p_operation_key uuid,
  p_movement_id uuid,
  p_expected_updated_at timestamptz
)
returns table (
  status_available_cash_usd numeric,
  status_updated_at timestamptz,
  movement_id uuid,
  movement_operation_key uuid,
  movement_kind text,
  movement_amount_usd numeric,
  movement_delta_usd numeric,
  movement_balance_before_usd numeric,
  movement_balance_after_usd numeric,
  movement_balance_was_set_before boolean,
  movement_input_currency text,
  movement_input_amount numeric,
  movement_usd_rate numeric,
  movement_note text,
  movement_destination_label text,
  movement_reverses_movement_id uuid,
  movement_cash_event_id bigint,
  movement_occurred_at timestamptz,
  movement_created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  current_cash_usd numeric(18, 6);
  current_updated_at timestamptz;
  reversal_amount_usd numeric(18, 6);
  reversal_delta_usd numeric(18, 6);
  restored_cash_usd numeric(18, 6);
  linked_cash_event_id bigint;
  linked_effective_at timestamptz;
  target_movement public.available_cash_movements%rowtype;
  existing_reversal public.available_cash_movements%rowtype;
  inserted_reversal public.available_cash_movements%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if p_operation_key is null or p_movement_id is null then
    raise exception 'available cash reversal identifiers are required'
      using errcode = '22023';
  end if;

  -- Use the same owner-scoped lock as mutate_available_cash so ordinary cash
  -- writes and reversals cannot pass each other before the status row is read.
  perform pg_advisory_xact_lock(
    hashtextextended('available_cash:' || current_user_id::text, 0)
  );

  select movement.*
  into existing_reversal
  from public.available_cash_movements as movement
  where movement.user_id = current_user_id
    and movement.operation_key = p_operation_key;

  if found then
    if existing_reversal.kind is distinct from 'reversal'
      or existing_reversal.reverses_movement_id is distinct from p_movement_id
    then
      raise exception 'available cash operation key was reused for a different request'
        using errcode = '22023';
    end if;

    select status.available_cash_usd, status.updated_at
    into current_cash_usd, current_updated_at
    from public.available_cash_status as status
    where status.user_id = current_user_id
    for update;

    if not found then
      raise exception 'available cash status is missing for an existing reversal'
        using errcode = '55000';
    end if;

    -- Return the immutable reversal with the current status. A lost-response
    -- retry must never roll a later visible status back.
    return query
    select
      current_cash_usd,
      current_updated_at,
      existing_reversal.id,
      existing_reversal.operation_key,
      existing_reversal.kind,
      existing_reversal.amount_usd,
      existing_reversal.delta_usd,
      existing_reversal.balance_before_usd,
      existing_reversal.balance_after_usd,
      existing_reversal.balance_was_set_before,
      existing_reversal.input_currency,
      existing_reversal.input_amount,
      existing_reversal.usd_rate,
      existing_reversal.note,
      existing_reversal.destination_label,
      existing_reversal.reverses_movement_id,
      existing_reversal.cash_event_id,
      existing_reversal.occurred_at,
      existing_reversal.created_at;
    return;
  end if;

  select status.available_cash_usd, status.updated_at
  into current_cash_usd, current_updated_at
  from public.available_cash_status as status
  where status.user_id = current_user_id
  for update;

  if not found then
    raise exception 'available cash status is missing'
      using errcode = '22023';
  end if;

  if p_expected_updated_at is null
    or current_updated_at is distinct from p_expected_updated_at
  then
    raise exception 'stale available cash status'
      using errcode = '40001';
  end if;

  select movement.*
  into target_movement
  from public.available_cash_movements as movement
  where movement.user_id = current_user_id
    and movement.kind <> 'reversal'
    and movement.reverses_movement_id is null
    and movement.cash_event_id is not null
    and movement.delta_usd <> 0
    and not exists (
      select 1
      from public.available_cash_movements as reversal
      where reversal.user_id = current_user_id
        and reversal.kind = 'reversal'
        and reversal.reverses_movement_id = movement.id
    )
  order by movement.cash_event_id desc
  limit 1
  for update;

  if not found or target_movement.id is distinct from p_movement_id then
    raise exception 'only the latest unreversed available cash movement can be reversed'
      using errcode = '40001';
  end if;

  if target_movement.kind = 'reversal'
    or target_movement.reverses_movement_id is not null
  then
    raise exception 'available cash reversal rows cannot be reversed'
      using errcode = '22023';
  end if;

  if target_movement.delta_usd = 0 then
    raise exception 'a zero-delta available cash movement cannot be reversed'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.available_cash_movements as reversal
    where reversal.user_id = current_user_id
      and reversal.reverses_movement_id = target_movement.id
  ) then
    raise exception 'available cash movement was already reversed'
      using errcode = '22023';
  end if;

  if target_movement.cash_event_id is null then
    raise exception 'available cash movement event provenance is missing'
      using errcode = '55000';
  end if;

  if target_movement.delta_usd > 0
    and current_cash_usd < target_movement.delta_usd
  then
    raise exception 'insufficient available cash to reverse the latest movement'
      using errcode = '22023';
  end if;

  if current_cash_usd is distinct from target_movement.balance_after_usd then
    raise exception 'available cash status changed after the latest movement'
      using errcode = '40001';
  end if;

  reversal_amount_usd := abs(target_movement.delta_usd)::numeric(18, 6);
  reversal_delta_usd := (-target_movement.delta_usd)::numeric(18, 6);
  restored_cash_usd := target_movement.balance_before_usd;

  if reversal_amount_usd <= 0
    or restored_cash_usd <> current_cash_usd + reversal_delta_usd
  then
    raise exception 'available cash reversal arithmetic is invalid'
      using errcode = '55000';
  end if;

  update public.available_cash_status
  set available_cash_usd = restored_cash_usd,
      logic_version = 1
  where user_id = current_user_id
  returning available_cash_usd, updated_at
  into current_cash_usd, current_updated_at;

  select event.id, event.effective_at
  into linked_cash_event_id, linked_effective_at
  from public.available_cash_events as event
  where event.user_id = current_user_id
    and event.source_updated_at = current_updated_at
    and event.cash_usd = restored_cash_usd
  order by event.id desc
  limit 1;

  if linked_cash_event_id is null or linked_effective_at is null then
    raise exception 'available cash reversal event was not captured'
      using errcode = '55000';
  end if;

  insert into public.available_cash_movements (
    user_id,
    operation_key,
    kind,
    amount_usd,
    delta_usd,
    balance_before_usd,
    balance_after_usd,
    balance_was_set_before,
    input_currency,
    input_amount,
    usd_rate,
    note,
    destination_label,
    cash_event_id,
    occurred_at,
    logic_version,
    reverses_movement_id
  )
  values (
    current_user_id,
    p_operation_key,
    'reversal',
    reversal_amount_usd,
    reversal_delta_usd,
    target_movement.balance_after_usd,
    restored_cash_usd,
    true,
    'USD',
    reversal_amount_usd,
    1,
    '',
    '',
    linked_cash_event_id,
    linked_effective_at,
    1,
    target_movement.id
  )
  returning *
  into inserted_reversal;

  return query
  select
    current_cash_usd,
    current_updated_at,
    inserted_reversal.id,
    inserted_reversal.operation_key,
    inserted_reversal.kind,
    inserted_reversal.amount_usd,
    inserted_reversal.delta_usd,
    inserted_reversal.balance_before_usd,
    inserted_reversal.balance_after_usd,
    inserted_reversal.balance_was_set_before,
    inserted_reversal.input_currency,
    inserted_reversal.input_amount,
    inserted_reversal.usd_rate,
    inserted_reversal.note,
    inserted_reversal.destination_label,
    inserted_reversal.reverses_movement_id,
    inserted_reversal.cash_event_id,
    inserted_reversal.occurred_at,
    inserted_reversal.created_at;
end;
$$;

revoke execute on function public.reverse_available_cash_movement(
  uuid, uuid, timestamptz
)
from public, anon, authenticated, service_role;

create or replace function public.available_cash_reversal_contract_ready()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select false;
$$;

revoke execute on function public.available_cash_reversal_contract_ready()
from public, anon, authenticated, service_role;

grant execute on function public.available_cash_reversal_contract_ready()
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
