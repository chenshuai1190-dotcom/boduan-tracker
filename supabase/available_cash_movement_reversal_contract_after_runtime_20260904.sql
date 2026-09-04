-- Contract phase for the available-cash movement reversal rollout.
--
-- DO NOT apply this file before the reversal-aware runtime is deployed and
-- verified. Apply available_cash_movement_reversal_foundation_20260904.sql
-- first, and activate the base available-cash movement contract before this
-- contract. This contract does not alter the existing cash-write readiness gate.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regclass('public.available_cash_status') is null
    or to_regclass('public.available_cash_events') is null
    or to_regclass('public.available_cash_movements') is null
  then
    raise exception 'available cash reversal foundation tables are missing';
  end if;

  if to_regprocedure(
    'public.reverse_available_cash_movement(uuid,uuid,timestamp with time zone)'
  ) is null
    or to_regprocedure('public.validate_available_cash_reversal_insert()') is null
    or to_regprocedure('public.available_cash_reversal_contract_ready()') is null
    or to_regprocedure('public.available_cash_write_contract_ready()') is null
    or to_regprocedure(
      'public.mutate_available_cash(uuid,text,numeric,timestamp with time zone,text,numeric,numeric,text,text)'
    ) is null
  then
    raise exception 'available cash reversal foundation functions are missing';
  end if;

  if not public.available_cash_write_contract_ready()
    or public.available_cash_reversal_contract_ready()
  then
    raise exception 'available cash reversal readiness staging is invalid';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.available_cash_movements'::regclass
      and attname = 'reverses_movement_id'
      and atttypid = 'uuid'::regtype
      and not attnotnull
      and not attisdropped
  ) then
    raise exception 'available cash reversal link column is missing or invalid';
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
        'available_cash_movements_logic_version_check',
        'available_cash_movements_user_id_id_key',
        'available_cash_movements_reversal_owner_fkey',
        'available_cash_movements_reversal_link_check'
      ]::text[])
      and convalidated
  ) <> 12 then
    raise exception 'available cash reversal constraints are missing or invalid';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_movements'::regclass
      and conname = 'available_cash_movements_kind_check'
      and pg_get_constraintdef(oid) like '%reversal%'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_movements'::regclass
      and conname = 'available_cash_movements_arithmetic_check'
      and pg_get_constraintdef(oid) like '%abs(delta_usd)%'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_movements'::regclass
      and conname = 'available_cash_movements_input_check'
      and pg_get_constraintdef(oid) like '%kind = ''reversal''%'
  ) or not exists (
    select 1
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.available_cash_movements'::regclass
      and constraint_row.conname = 'available_cash_movements_reversal_owner_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.available_cash_movements'::regclass
      and constraint_row.conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.available_cash_movements'::regclass
            and attname = 'user_id'
            and not attisdropped
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.available_cash_movements'::regclass
            and attname = 'reverses_movement_id'
            and not attisdropped
        )
      ]::smallint[]
      and constraint_row.confkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.available_cash_movements'::regclass
            and attname = 'user_id'
            and not attisdropped
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.available_cash_movements'::regclass
            and attname = 'id'
            and not attisdropped
        )
      ]::smallint[]
      and constraint_row.confdeltype = 'c'
  ) or not exists (
    select 1
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.available_cash_movements'::regclass
      and constraint_row.conname = 'available_cash_movements_user_id_id_key'
      and constraint_row.contype = 'u'
      and constraint_row.conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.available_cash_movements'::regclass
            and attname = 'user_id'
            and not attisdropped
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.available_cash_movements'::regclass
            and attname = 'id'
            and not attisdropped
        )
      ]::smallint[]
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.available_cash_movements'::regclass
      and conname = 'available_cash_movements_reversal_link_check'
      and pg_get_constraintdef(oid) like '%reverses_movement_id IS NOT NULL%'
      and pg_get_constraintdef(oid) like '%reverses_movement_id IS NULL%'
  ) then
    raise exception 'available cash reversal constraint definitions are invalid';
  end if;

  if not exists (
    select 1
    from pg_index
    join pg_class as index_relation
      on index_relation.oid = pg_index.indexrelid
    where pg_index.indrelid = 'public.available_cash_movements'::regclass
      and index_relation.relname = 'available_cash_movements_one_reversal_idx'
      and pg_index.indisunique
      and pg_index.indisvalid
      and pg_index.indisready
      and pg_index.indnkeyatts = 1
      and pg_get_indexdef(pg_index.indexrelid, 1, true) = 'reverses_movement_id'
      and pg_get_expr(pg_index.indpred, pg_index.indrelid)
        like '%reverses_movement_id IS NOT NULL%'
  ) or not exists (
    select 1
    from pg_index
    join pg_class as index_relation
      on index_relation.oid = pg_index.indexrelid
    where pg_index.indrelid = 'public.available_cash_movements'::regclass
      and index_relation.relname = 'available_cash_movements_user_reversible_idx'
      and pg_index.indisvalid
      and pg_index.indisready
      and not pg_index.indisunique
      and pg_index.indnkeyatts = 2
      and pg_get_indexdef(pg_index.indexrelid, 1, true) = 'user_id'
      and pg_get_indexdef(pg_index.indexrelid, 2, true)
        like 'cash_event_id DESC%'
      and pg_get_expr(pg_index.indpred, pg_index.indrelid)
        like '%kind <> ''reversal''%'
      and pg_get_expr(pg_index.indpred, pg_index.indrelid)
        like '%reverses_movement_id IS NULL%'
      and pg_get_expr(pg_index.indpred, pg_index.indrelid)
        like '%cash_event_id IS NOT NULL%'
      and pg_get_expr(pg_index.indpred, pg_index.indrelid)
        like '%delta_usd <>%'
  ) then
    raise exception 'available cash reversal indexes are missing or invalid';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.available_cash_movements'::regclass
      and tgname = 'validate_available_cash_reversal_insert'
      and tgfoid = 'public.validate_available_cash_reversal_insert()'::regprocedure
      and tgenabled = 'O'
      and tgtype = 7
      and not tgisinternal
  ) or not exists (
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
    raise exception 'available cash reversal triggers are missing or invalid';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.available_cash_movements'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'available cash reversal RLS foundation is incomplete';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.reverse_available_cash_movement(uuid,uuid,timestamp with time zone)'::regprocedure
      and prosecdef
      and proconfig @> array['search_path=pg_catalog, public']::text[]
  ) or not exists (
    select 1
    from pg_proc
    where oid = 'public.validate_available_cash_reversal_insert()'::regprocedure
      and prosecdef
      and proconfig @> array['search_path=pg_catalog, public']::text[]
  ) then
    raise exception 'available cash reversal function security is invalid';
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
  ) or exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'available_cash_movements'
      and cmd <> 'SELECT'
  ) then
    raise exception 'available cash reversal owner-read policy is invalid';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.mutate_available_cash(uuid,text,numeric,timestamp with time zone,text,numeric,numeric,text,text)',
    'EXECUTE'
  ) then
    raise exception 'existing available cash mutation RPC is not active';
  end if;

  if has_function_privilege(
    'anon',
    'public.reverse_available_cash_movement(uuid,uuid,timestamp with time zone)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.reverse_available_cash_movement(uuid,uuid,timestamp with time zone)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.reverse_available_cash_movement(uuid,uuid,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'available cash reversal RPC was exposed before contract';
  end if;

  if has_table_privilege(
    'authenticated', 'public.available_cash_movements', 'INSERT'
  ) or has_table_privilege(
    'authenticated', 'public.available_cash_movements', 'UPDATE'
  ) or has_table_privilege(
    'authenticated', 'public.available_cash_movements', 'DELETE'
  ) then
    raise exception 'available cash movement history exposes direct writes';
  end if;
end;
$$;

create or replace function public.available_cash_reversal_contract_ready()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select true;
$$;

revoke execute on function public.available_cash_reversal_contract_ready()
from public, anon, authenticated, service_role;

grant execute on function public.available_cash_reversal_contract_ready()
to authenticated, service_role;

revoke all privileges on table public.available_cash_movements
from public, anon, authenticated, service_role;

grant select on table public.available_cash_movements
to authenticated, service_role;

revoke execute on function public.validate_available_cash_reversal_insert()
from public, anon, authenticated, service_role;

revoke execute on function public.reverse_available_cash_movement(
  uuid, uuid, timestamptz
)
from public, anon, authenticated, service_role;

grant execute on function public.reverse_available_cash_movement(
  uuid, uuid, timestamptz
)
to authenticated;

drop policy if exists "users can read own available cash movements"
on public.available_cash_movements;

create policy "users can read own available cash movements"
on public.available_cash_movements
for select
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
