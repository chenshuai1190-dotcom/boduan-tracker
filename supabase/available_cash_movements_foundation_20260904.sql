-- Forward-only available-cash movement foundation.
--
-- Apply this migration before deploying the movement-aware runtime. The
-- existing readiness function is set to false during the rollout, the new RPC
-- is installed without authenticated EXECUTE, and existing status write grants
-- remain in place until the after-runtime contract performs the atomic cutover.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.available_cash_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_key uuid not null,
  kind text not null,
  amount_usd numeric(18, 6) not null,
  delta_usd numeric(18, 6) not null,
  balance_before_usd numeric(18, 6) not null,
  balance_after_usd numeric(18, 6) not null,
  balance_was_set_before boolean not null,
  input_currency text not null,
  input_amount numeric(18, 6) not null,
  usd_rate numeric(18, 6) not null,
  note text not null default '',
  destination_label text not null default '',
  cash_event_id bigint
    references public.available_cash_events(id) on delete cascade,
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  logic_version integer not null default 1,

  constraint available_cash_movements_user_operation_key
    unique (user_id, operation_key),
  constraint available_cash_movements_cash_event_key
    unique (cash_event_id),
  constraint available_cash_movements_kind_check
    check (kind in ('transfer_in', 'transfer_out', 'balance_adjustment')),
  constraint available_cash_movements_amounts_check
    check (
      amount_usd >= 0
      and amount_usd <> 'NaN'::numeric
      and delta_usd <> 'NaN'::numeric
      and balance_before_usd >= 0
      and balance_before_usd <> 'NaN'::numeric
      and balance_after_usd >= 0
      and balance_after_usd <> 'NaN'::numeric
      and input_amount >= 0
      and input_amount <> 'NaN'::numeric
      and usd_rate > 0
      and usd_rate <> 'NaN'::numeric
    ),
  constraint available_cash_movements_arithmetic_check
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
      )
    ),
  constraint available_cash_movements_input_check
    check (
      input_currency in ('USD', 'CNY')
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
    ),
  constraint available_cash_movements_note_check
    check (char_length(note) <= 500),
  constraint available_cash_movements_destination_check
    check (
      (
        kind = 'transfer_out'
        and destination_label = 'bank_card'
      )
      or
      (
        kind <> 'transfer_out'
        and destination_label = ''
      )
    ),
  constraint available_cash_movements_logic_version_check
    check (logic_version = 1)
);

create index if not exists available_cash_movements_user_occurred_idx
on public.available_cash_movements (user_id, occurred_at desc, created_at desc);

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

create or replace function public.guard_available_cash_movement_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Account deletion is the only destructive exception. The auth.users row is
  -- already absent while its ON DELETE CASCADE removes private user history.
  if tg_op = 'DELETE' and not exists (
    select 1
    from auth.users
    where id = old.user_id
  ) then
    return old;
  end if;

  raise exception 'available cash movement rows are immutable'
    using errcode = '55000';
end;
$$;

revoke execute on function public.guard_available_cash_movement_immutable()
from public, anon, authenticated, service_role;

drop trigger if exists available_cash_movements_immutable
on public.available_cash_movements;

create trigger available_cash_movements_immutable
before update or delete on public.available_cash_movements
for each row
execute function public.guard_available_cash_movement_immutable();

create or replace function public.mutate_available_cash(
  p_operation_key uuid,
  p_kind text,
  p_amount_usd numeric,
  p_expected_updated_at timestamptz,
  p_input_currency text,
  p_input_amount numeric,
  p_usd_rate numeric,
  p_note text default '',
  p_destination_label text default ''
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
  normalized_kind text := lower(btrim(coalesce(p_kind, '')));
  normalized_currency text := upper(btrim(coalesce(p_input_currency, '')));
  normalized_note text := btrim(coalesce(p_note, ''));
  normalized_destination text := lower(btrim(coalesce(p_destination_label, '')));
  normalized_amount_usd numeric(18, 6);
  normalized_input_amount numeric(18, 6);
  normalized_usd_rate numeric(18, 6);
  current_cash_usd numeric(18, 6);
  current_updated_at timestamptz;
  before_cash_usd numeric(18, 6);
  after_cash_usd numeric(18, 6);
  signed_delta_usd numeric(18, 6);
  was_set_before boolean;
  linked_cash_event_id bigint;
  linked_effective_at timestamptz;
  existing_movement public.available_cash_movements%rowtype;
  inserted_movement public.available_cash_movements%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if p_operation_key is null then
    raise exception 'available cash operation key is required'
      using errcode = '22023';
  end if;

  if normalized_kind not in ('transfer_in', 'transfer_out', 'balance_adjustment') then
    raise exception 'unsupported available cash movement kind'
      using errcode = '22023';
  end if;

  if p_amount_usd is null or p_amount_usd = 'NaN'::numeric
    or p_input_amount is null or p_input_amount = 'NaN'::numeric
    or p_usd_rate is null or p_usd_rate = 'NaN'::numeric
    or p_amount_usd < 0
    or p_input_amount < 0
    or p_usd_rate <= 0
  then
    raise exception 'available cash movement amounts are invalid'
      using errcode = '22023';
  end if;

  normalized_amount_usd := round(p_amount_usd, 6)::numeric(18, 6);
  normalized_input_amount := round(p_input_amount, 6)::numeric(18, 6);
  normalized_usd_rate := round(p_usd_rate, 6)::numeric(18, 6);

  if normalized_kind in ('transfer_in', 'transfer_out')
    and (normalized_amount_usd <= 0 or normalized_input_amount <= 0)
  then
    raise exception 'available cash transfer amount must be positive'
      using errcode = '22023';
  end if;

  if normalized_currency not in ('USD', 'CNY') then
    raise exception 'available cash input currency must be USD or CNY'
      using errcode = '22023';
  end if;

  if normalized_currency = 'USD' then
    if normalized_usd_rate <> 1
      or normalized_input_amount is distinct from normalized_amount_usd
    then
      raise exception 'USD available cash input must use rate 1'
        using errcode = '22023';
    end if;
  elsif round(normalized_input_amount / normalized_usd_rate, 6)
    is distinct from normalized_amount_usd
  then
    raise exception 'CNY available cash input does not match its USD amount'
      using errcode = '22023';
  end if;

  if char_length(normalized_note) > 500 then
    raise exception 'available cash movement note is too long'
      using errcode = '22023';
  end if;

  if (
    normalized_kind = 'transfer_out'
    and normalized_destination <> 'bank_card'
  ) or (
    normalized_kind <> 'transfer_out'
    and normalized_destination <> ''
  )
  then
    raise exception 'available cash movement destination is invalid'
      using errcode = '22023';
  end if;

  -- Serialize all cash operations for one owner, including the first operation
  -- before a status row exists. The status row is also locked below so service
  -- maintenance cannot race the read/modify/write sequence.
  perform pg_advisory_xact_lock(
    hashtextextended('available_cash:' || current_user_id::text, 0)
  );

  select movement.*
  into existing_movement
  from public.available_cash_movements as movement
  where movement.user_id = current_user_id
    and movement.operation_key = p_operation_key;

  if found then
    if existing_movement.kind is distinct from normalized_kind
      or existing_movement.amount_usd is distinct from normalized_amount_usd
      or existing_movement.input_currency is distinct from normalized_currency
      or existing_movement.input_amount is distinct from normalized_input_amount
      or existing_movement.usd_rate is distinct from normalized_usd_rate
      or existing_movement.note is distinct from normalized_note
      or existing_movement.destination_label is distinct from normalized_destination
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
      raise exception 'available cash status is missing for an existing movement'
        using errcode = '55000';
    end if;

    -- A lost-response retry returns the original immutable movement together
    -- with the latest status. It must never roll a newer visible balance back.
    return query
    select
      current_cash_usd,
      current_updated_at,
      existing_movement.id,
      existing_movement.operation_key,
      existing_movement.kind,
      existing_movement.amount_usd,
      existing_movement.delta_usd,
      existing_movement.balance_before_usd,
      existing_movement.balance_after_usd,
      existing_movement.balance_was_set_before,
      existing_movement.input_currency,
      existing_movement.input_amount,
      existing_movement.usd_rate,
      existing_movement.note,
      existing_movement.destination_label,
      existing_movement.cash_event_id,
      existing_movement.occurred_at,
      existing_movement.created_at;
    return;
  end if;

  select status.available_cash_usd, status.updated_at
  into current_cash_usd, current_updated_at
  from public.available_cash_status as status
  where status.user_id = current_user_id
  for update;

  was_set_before := found;
  before_cash_usd := case when was_set_before then current_cash_usd else 0 end;

  if was_set_before then
    if p_expected_updated_at is null
      or current_updated_at is distinct from p_expected_updated_at
    then
      raise exception 'stale available cash status'
        using errcode = '40001';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception 'stale available cash status'
      using errcode = '40001';
  end if;

  if normalized_kind = 'transfer_in' then
    after_cash_usd := (before_cash_usd + normalized_amount_usd)::numeric(18, 6);
  elsif normalized_kind = 'transfer_out' then
    if not was_set_before then
      raise exception 'available cash must be set before a transfer out'
        using errcode = '22023';
    end if;
    if normalized_amount_usd > before_cash_usd then
      raise exception 'insufficient available cash for transfer out'
        using errcode = '22023';
    end if;
    after_cash_usd := (before_cash_usd - normalized_amount_usd)::numeric(18, 6);
  else
    after_cash_usd := normalized_amount_usd;
  end if;

  signed_delta_usd := (after_cash_usd - before_cash_usd)::numeric(18, 6);
  if was_set_before and signed_delta_usd = 0 then
    raise exception 'available cash balance is unchanged'
      using errcode = '22023';
  end if;

  if was_set_before then
    update public.available_cash_status
    set available_cash_usd = after_cash_usd,
        logic_version = 1
    where user_id = current_user_id
    returning available_cash_usd, updated_at
    into current_cash_usd, current_updated_at;
  else
    insert into public.available_cash_status (
      user_id,
      available_cash_usd,
      logic_version
    )
    values (
      current_user_id,
      after_cash_usd,
      1
    )
    returning available_cash_usd, updated_at
    into current_cash_usd, current_updated_at;
  end if;

  select event.id, event.effective_at
  into linked_cash_event_id, linked_effective_at
  from public.available_cash_events as event
  where event.user_id = current_user_id
    and event.source_updated_at = current_updated_at
    and event.cash_usd = after_cash_usd
  order by event.id desc
  limit 1;

  if linked_cash_event_id is null or linked_effective_at is null then
    raise exception 'available cash event was not captured'
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
    logic_version
  )
  values (
    current_user_id,
    p_operation_key,
    normalized_kind,
    normalized_amount_usd,
    signed_delta_usd,
    before_cash_usd,
    after_cash_usd,
    was_set_before,
    normalized_currency,
    normalized_input_amount,
    normalized_usd_rate,
    normalized_note,
    normalized_destination,
    linked_cash_event_id,
    linked_effective_at,
    1
  )
  returning *
  into inserted_movement;

  return query
  select
    current_cash_usd,
    current_updated_at,
    inserted_movement.id,
    inserted_movement.operation_key,
    inserted_movement.kind,
    inserted_movement.amount_usd,
    inserted_movement.delta_usd,
    inserted_movement.balance_before_usd,
    inserted_movement.balance_after_usd,
    inserted_movement.balance_was_set_before,
    inserted_movement.input_currency,
    inserted_movement.input_amount,
    inserted_movement.usd_rate,
    inserted_movement.note,
    inserted_movement.destination_label,
    inserted_movement.cash_event_id,
    inserted_movement.occurred_at,
    inserted_movement.created_at;
end;
$$;

revoke execute on function public.mutate_available_cash(
  uuid, text, numeric, timestamptz, text, numeric, numeric, text, text
)
from public, anon, authenticated, service_role;

-- Reuse the existing runtime gate. Old and new clients both fail closed until
-- the movement-aware runtime is deployed and the contract migration succeeds.
create or replace function public.available_cash_write_contract_ready()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select false;
$$;

revoke execute on function public.available_cash_write_contract_ready()
from public, anon, authenticated, service_role;

grant execute on function public.available_cash_write_contract_ready()
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
