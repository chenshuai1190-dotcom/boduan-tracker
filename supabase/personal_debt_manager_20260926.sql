-- Independent personal debt ledger. Apply before the runtime that opens this tool.
-- No preview data is imported, and no asset, investment or trading table is touched.

begin;

set local lock_timeout = '5s';

create table if not exists public.personal_debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  creditor text not null default '',
  original_amount numeric(15, 2) not null check (original_amount > 0),
  debt_date date not null,
  due_date date check (due_date is null or due_date >= debt_date),
  repayment_cycle text not null default 'NONE'
    check (repayment_cycle in ('NONE', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM')),
  planned_payment numeric(15, 2) check (planned_payment is null or planned_payment > 0),
  custom_interval_days integer,
  interest_rate numeric(12, 6) check (interest_rate is null or interest_rate >= 0),
  note text not null default '',
  currency text not null default 'CNY' check (currency = 'CNY'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_debts_custom_cycle_check check (
    (repayment_cycle = 'CUSTOM' and custom_interval_days is not null and custom_interval_days > 0)
    or (repayment_cycle <> 'CUSTOM' and custom_interval_days is null)
  )
);

-- The redundant owner key makes the child FK prove parent/child ownership.
create unique index if not exists personal_debts_id_user_unique_idx
on public.personal_debts (id, user_id);

create index if not exists personal_debts_user_due_idx
on public.personal_debts (user_id, due_date, created_at, id);

create table if not exists public.personal_debt_repayments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null,
  amount numeric(15, 2) not null check (amount > 0),
  repayment_date date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_debt_repayments_parent_owner_fk
    foreign key (debt_id, user_id)
    references public.personal_debts (id, user_id)
    on delete cascade
);

create index if not exists personal_debt_repayments_user_debt_date_idx
on public.personal_debt_repayments
(user_id, debt_id, repayment_date desc, created_at desc, id);

create or replace function public.touch_personal_debt_updated_at()
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

revoke execute on function public.touch_personal_debt_updated_at()
from public, anon, authenticated;

-- A repayment locks its parent. This also serializes repayment writes with
-- changes to the parent's debt_date, so concurrent edits cannot bypass the
-- date ordering rule.
create or replace function public.check_personal_debt_repayment_date()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  parent_date date;
begin
  select debt_date into parent_date
  from public.personal_debts
  where id = new.debt_id and user_id = new.user_id
  for update;

  if parent_date is null then
    raise exception 'Debt does not exist for this owner' using errcode = '23503';
  end if;
  if new.repayment_date < parent_date then
    raise exception 'Repayment date cannot precede debt date' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_personal_debt_repayment_date()
from public, anon, authenticated;

create or replace function public.check_personal_debt_origin_date()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.debt_date is distinct from old.debt_date and exists (
    select 1 from public.personal_debt_repayments
    where debt_id = old.id and user_id = old.user_id
      and repayment_date < new.debt_date
  ) then
    raise exception 'Debt date cannot follow an existing repayment' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_personal_debt_origin_date()
from public, anon, authenticated;

drop trigger if exists personal_debts_check_origin_date on public.personal_debts;
create trigger personal_debts_check_origin_date
before update on public.personal_debts
for each row execute function public.check_personal_debt_origin_date();

drop trigger if exists personal_debts_touch_updated_at on public.personal_debts;
create trigger personal_debts_touch_updated_at
before update on public.personal_debts
for each row execute function public.touch_personal_debt_updated_at();

drop trigger if exists personal_debt_repayments_check_date on public.personal_debt_repayments;
create trigger personal_debt_repayments_check_date
before insert or update on public.personal_debt_repayments
for each row execute function public.check_personal_debt_repayment_date();

drop trigger if exists personal_debt_repayments_touch_updated_at on public.personal_debt_repayments;
create trigger personal_debt_repayments_touch_updated_at
before update on public.personal_debt_repayments
for each row execute function public.touch_personal_debt_updated_at();

alter table public.personal_debts enable row level security;
alter table public.personal_debt_repayments enable row level security;

revoke all privileges on table public.personal_debts,
  public.personal_debt_repayments from public, anon, authenticated;

grant select, insert, update, delete on table public.personal_debts,
  public.personal_debt_repayments to authenticated;

drop policy if exists "users manage own personal debts" on public.personal_debts;
create policy "users manage own personal debts"
on public.personal_debts
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users manage own personal debt repayments" on public.personal_debt_repayments;
create policy "users manage own personal debt repayments"
on public.personal_debt_repayments
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- The UI must never mistake a PostgREST row limit for a complete ledger.
-- A STABLE, invoker-rights RPC reads both tables with one statement snapshot
-- and returns one JSON object regardless of the number of repayment rows.
create or replace function public.read_personal_debt_ledger()
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  debts_rows jsonb;
  repayment_rows jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(debt) - 'user_id'
      order by debt.debt_date desc, debt.created_at desc, debt.id),
    '[]'::jsonb
  ) into debts_rows
  from public.personal_debts as debt
  where debt.user_id = caller_id;

  select coalesce(
    jsonb_agg(to_jsonb(repayment) - 'user_id'
      order by repayment.repayment_date desc, repayment.created_at desc, repayment.id),
    '[]'::jsonb
  ) into repayment_rows
  from public.personal_debt_repayments as repayment
  where repayment.user_id = caller_id;

  return jsonb_build_object(
    'user_id', caller_id,
    'debts', debts_rows,
    'repayments', repayment_rows
  );
end;
$$;

revoke execute on function public.read_personal_debt_ledger()
from public, anon, authenticated;

grant execute on function public.read_personal_debt_ledger()
to authenticated;

comment on table public.personal_debts is
'Independent personal debt tool. Balances are derived from child repayments and excluded from assets/net worth.';

comment on table public.personal_debt_repayments is
'Individual repayments for the independent personal debt tool; deletion of a debt cascades its records.';

notify pgrst, 'reload schema';

commit;
