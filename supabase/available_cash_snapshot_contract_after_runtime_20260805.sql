-- Contract phase for the available-cash rollout.
--
-- DO NOT apply this file before the available-cash runtime is deployed and
-- verified. Apply available_cash_foundation_20260805.sql first.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regclass('public.available_cash_status') is null
    or to_regclass('public.available_cash_events') is null
  then
    raise exception 'available cash foundation tables are missing';
  end if;

  if to_regprocedure(
    'public.resolve_available_cash_snapshot_targets(jsonb)'
  ) is null
    or to_regprocedure(
      'public.enforce_pnl_report_available_cash_snapshot()'
    ) is null
    or to_regprocedure('public.capture_available_cash_event()') is null
    or to_regprocedure('public.normalize_available_cash_status()') is null
    or to_regprocedure(
      'public.available_cash_write_contract_ready()'
    ) is null
  then
    raise exception 'available cash foundation functions are missing';
  end if;

  -- pg_trigger.tgtype is a bitmask: ROW=1, BEFORE=2, INSERT=4,
  -- UPDATE=16. Therefore the required AFTER trigger is 21 and each required
  -- BEFORE trigger is 23.
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.available_cash_status'::regclass
      and tgname = 'capture_available_cash_event'
      and tgfoid = 'public.capture_available_cash_event()'::regprocedure
      and tgenabled = 'O'
      and tgtype = 21
      and not tgisinternal
  ) or not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.available_cash_status'::regclass
      and tgname = 'normalize_available_cash_status'
      and tgfoid = 'public.normalize_available_cash_status()'::regprocedure
      and tgenabled = 'O'
      and tgtype = 23
      and not tgisinternal
  ) or not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.pnl_report_snapshots'::regclass
      and tgname = 'enforce_pnl_report_available_cash_snapshot'
      and tgfoid = 'public.enforce_pnl_report_available_cash_snapshot()'::regprocedure
      and tgenabled = 'O'
      and tgtype = 23
      and not tgisinternal
  ) then
    raise exception 'available cash foundation triggers are missing or invalid';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.available_cash_status'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) or not exists (
    select 1
    from pg_class
    where oid = 'public.available_cash_events'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'available cash RLS foundation is incomplete';
  end if;

  if (
    select count(*)
    from pg_attribute
    where attrelid = 'public.pnl_report_snapshots'::regclass
      and attname::text = any (array[
        'cash_event_id',
        'cash_effective_at',
        'cash_basis'
      ]::text[])
      and not attisdropped
  ) <> 3 then
    raise exception 'available cash snapshot provenance columns are missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_status'::regclass
      and conname = 'available_cash_status_amount_check'
      and contype = 'c'
      and convalidated
      and pg_get_constraintdef(oid) like '%NaN%'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_status'::regclass
      and conname = 'available_cash_status_logic_version_check'
      and contype = 'c'
      and convalidated
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_events'::regclass
      and conname = 'available_cash_events_amount_check'
      and contype = 'c'
      and convalidated
      and pg_get_constraintdef(oid) like '%NaN%'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_events'::regclass
      and conname = 'available_cash_events_source_check'
      and contype = 'c'
      and convalidated
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_events'::regclass
      and conname = 'available_cash_events_logic_version_check'
      and contype = 'c'
      and convalidated
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pnl_report_snapshots'::regclass
      and conname = 'pnl_report_snapshots_cash_provenance_check'
      and contype = 'c'
      and convalidated
      and pg_get_constraintdef(oid) like '%NaN%'
  ) then
    raise exception 'available cash foundation constraints are missing or invalid';
  end if;
end;
$$;

create or replace function public.available_cash_write_contract_ready()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select true;
$$;

revoke execute on function public.available_cash_write_contract_ready()
from public, anon, authenticated, service_role;

grant execute on function public.available_cash_write_contract_ready()
to authenticated, service_role;

revoke all privileges on table public.available_cash_status
from public, anon, authenticated, service_role;

revoke all privileges on table public.available_cash_events
from public, anon, authenticated, service_role;

grant select on table public.available_cash_status
to authenticated, service_role;

grant insert, update on table public.available_cash_status
to authenticated;

grant select on table public.available_cash_events
to service_role;

revoke all privileges on sequence public.available_cash_events_id_seq
from public, anon, authenticated, service_role;

revoke execute on function public.resolve_available_cash_snapshot_targets(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.resolve_available_cash_snapshot_targets(jsonb)
to service_role;

drop policy if exists "users can read own available cash status"
on public.available_cash_status;
drop policy if exists "users can insert own available cash status"
on public.available_cash_status;
drop policy if exists "users can update own available cash status"
on public.available_cash_status;

create policy "users can read own available cash status"
on public.available_cash_status
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert own available cash status"
on public.available_cash_status
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can update own available cash status"
on public.available_cash_status
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
