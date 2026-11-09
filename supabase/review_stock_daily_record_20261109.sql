-- Apply after the existing independent review preferences and Quote foundation.
-- Run verification/review_stock_daily_record_preflight.sql in this connection
-- first, and the matching postflight after commit. No business rows are written.
begin;
set local lock_timeout = '5s';

alter table public.review_display_preferences
  add column if not exists show_stock_daily_record boolean default null;

do $migration$
declare
  v_definition text;
  v_before text := $before$'net_assets','cumulative_return','cumulative_pnl','annual_return','annual_pnl','daily_return','period_return'$before$;
  v_after text := $after$'net_assets','cumulative_return','cumulative_pnl','annual_return','annual_pnl','daily_return','stock_daily_return','period_return'$after$;
begin
  if not exists (
    select 1 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.review_display_preferences'::regclass
      and a.attname='show_stock_daily_record' and a.atttypid='boolean'::regtype
      and not a.attnotnull and not a.attisdropped and a.attacl is null
      and (d.oid is null or pg_get_expr(d.adbin,d.adrelid)='NULL::boolean')
  ) then raise exception 'show_stock_daily_record must be a nullable boolean with NULL default and no column grants'; end if;

  if to_regprocedure('public.quote_assistant_fingerprint(text,text,uuid)') is null then
    raise exception 'Quote fingerprint prerequisite is missing';
  end if;
  select pg_get_functiondef(p.oid) into v_definition from pg_proc p
    where p.oid='public.quote_assistant_fingerprint(text,text,uuid)'::regprocedure
      and p.prosecdef and p.provolatile='s'
      and p.proconfig @> array['search_path=pg_catalog, public']
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE');
  if v_definition is null then raise exception 'Quote fingerprint security contract differs; inspect before migrating'; end if;
  -- Change exactly one known metric list; preserve the live public branch,
  -- owner guards, attachment behavior, function identity, owner and ACL.
  if strpos(v_definition,v_after)>0 then
    if (length(v_definition)-length(replace(v_definition,v_after,'')))/length(v_after)<>1 then
      raise exception 'Quote fingerprint updated metric list is ambiguous';
    end if;
  elsif (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)=1 then
    execute replace(v_definition,v_before,v_after);
  else
    raise exception 'Quote fingerprint metric contract differs; inspect before migrating';
  end if;
end;
$migration$;

comment on column public.review_display_preferences.show_stock_daily_record is
  'NULL enables held-stock yearly daily loss records by default; explicit true/false survives older clients that omit this column. This is separate from account daily return records.';

-- Keep the legacy event_types constraint, revisions, policies and grants intact.
notify pgrst, 'reload schema';
commit;
