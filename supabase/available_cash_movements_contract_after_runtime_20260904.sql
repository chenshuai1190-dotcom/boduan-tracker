-- Contract phase for the available-cash movement rollout.
--
-- DO NOT apply this file before the movement-aware runtime is deployed and
-- verified. Apply available_cash_movements_foundation_20260904.sql first.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
    or to_regprocedure('public.guard_available_cash_movement_immutable()') is null
    or to_regprocedure('public.available_cash_write_contract_ready()') is null
  then
    raise exception 'available cash movement foundation functions are missing';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.available_cash_movements'::regclass
      and tgname = 'available_cash_movements_immutable'
      and tgfoid = 'public.guard_available_cash_movement_immutable()'::regprocedure
      and tgenabled = 'O'
      and tgtype = 27
      and not tgisinternal
  ) or not exists (
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
  ) then
    raise exception 'available cash movement triggers are missing or invalid';
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
  ) or not exists (
    select 1
    from pg_class
    where oid = 'public.available_cash_movements'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'available cash movement RLS foundation is incomplete';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.mutate_available_cash(uuid,text,numeric,timestamp with time zone,text,numeric,numeric,text,text)'::regprocedure
      and prosecdef
      and proconfig @> array['search_path=pg_catalog, public']::text[]
  ) then
    raise exception 'available cash mutation RPC security contract is invalid';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'available_cash_movements'
      and policyname = 'users can read own available cash movements'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%auth.uid()%user_id%'
  ) then
    raise exception 'available cash movement owner-read policy is missing';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'available_cash_movements'
      and cmd <> 'SELECT'
  ) then
    raise exception 'available cash movements expose an unexpected write policy';
  end if;

  if (
    select count(*)
    from pg_constraint
    where conrelid = 'public.available_cash_movements'::regclass
      and conname = any (array[
        'available_cash_movements_user_operation_key',
        'available_cash_movements_cash_event_key',
        'available_cash_movements_kind_check',
        'available_cash_movements_amounts_check',
        'available_cash_movements_arithmetic_check',
        'available_cash_movements_input_check',
        'available_cash_movements_note_check',
        'available_cash_movements_destination_check',
        'available_cash_movements_logic_version_check'
      ]::text[])
      and convalidated
  ) <> 9 then
    raise exception 'available cash movement constraints are missing or invalid';
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

revoke all privileges on table public.available_cash_movements
from public, anon, authenticated, service_role;

grant select on table public.available_cash_status
to authenticated, service_role;

grant select on table public.available_cash_events
to service_role;

grant select on table public.available_cash_movements
to authenticated, service_role;

revoke all privileges on sequence public.available_cash_events_id_seq
from public, anon, authenticated, service_role;

revoke execute on function public.resolve_available_cash_snapshot_targets(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.resolve_available_cash_snapshot_targets(jsonb)
to service_role;

revoke execute on function public.mutate_available_cash(
  uuid, text, numeric, timestamptz, text, numeric, numeric, text, text
)
from public, anon, authenticated, service_role;

grant execute on function public.mutate_available_cash(
  uuid, text, numeric, timestamptz, text, numeric, numeric, text, text
)
to authenticated;

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

drop policy if exists "users can read own available cash movements"
on public.available_cash_movements;

create policy "users can read own available cash movements"
on public.available_cash_movements
for select
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
