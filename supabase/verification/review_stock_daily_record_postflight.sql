-- Run after review_stock_daily_record_20261109.sql in the preflight connection.
-- Schema/privilege failures raise; concurrent user writes are reported as
-- aggregate differences for review instead of silently attributed to migration.
set statement_timeout = '90s';
do $$
begin
  if to_regclass('pg_temp.review_stock_daily_record_audit_before') is null
    or to_regprocedure('pg_temp.review_stock_daily_record_audit()') is null then
    raise exception 'Run the stock daily record preflight in this connection first';
  end if;
end;
$$;
create temporary table if not exists review_stock_daily_record_audit_after (
  category text not null,name text not null,value jsonb not null,primary key(category,name)
);
truncate pg_temp.review_stock_daily_record_audit_after;
insert into pg_temp.review_stock_daily_record_audit_after select * from pg_temp.review_stock_daily_record_audit();

do $audit$
declare
  v_before text;
  v_after text;
begin
  if not exists(select 1 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.review_display_preferences'::regclass and a.attname='show_stock_daily_record'
      and a.atttypid='boolean'::regtype and not a.attnotnull and not a.attisdropped and a.attacl is null
      and (d.oid is null or pg_get_expr(d.adbin,d.adrelid)='NULL::boolean')) then
    raise exception 'Invalid held-stock record preference column';
  end if;
  if exists(select 1 from pg_temp.review_stock_daily_record_audit_before b full join pg_temp.review_stock_daily_record_audit_after a using(category,name)
    where coalesce(b.category,a.category)='security' and b.value is distinct from a.value) then
    raise exception 'Permissions, policies, constraints or function security changed unexpectedly';
  end if;
  select value#>>'{}' into v_before from pg_temp.review_stock_daily_record_audit_before where category='function' and name='fingerprint';
  select value#>>'{}' into v_after from pg_temp.review_stock_daily_record_audit_after where category='function' and name='fingerprint';
  if v_after is distinct from replace(v_before,
    $before$'net_assets','cumulative_return','cumulative_pnl','annual_return','annual_pnl','daily_return','period_return'$before$,
    $after$'net_assets','cumulative_return','cumulative_pnl','annual_return','annual_pnl','daily_return','stock_daily_return','period_return'$after$) then
    raise exception 'Quote fingerprint changed beyond the supported metric list';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.review_display_preferences'::regclass)
    or has_table_privilege('anon','public.review_display_preferences','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.review_display_preferences','DELETE')
    or has_function_privilege('anon','public.quote_assistant_fingerprint(text,text,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.quote_assistant_fingerprint(text,text,uuid)','EXECUTE') then
    raise exception 'Owner-only preference or private assistant helper boundary failed';
  end if;
end;
$audit$;

select jsonb_build_object('phase','postflight','databaseTime',clock_timestamp(),'schemaAndPermissionsOk',true,
  'businessUnchanged',not exists(select 1 from pg_temp.review_stock_daily_record_audit_before b full join pg_temp.review_stock_daily_record_audit_after a using(category,name)
    where coalesce(b.category,a.category)='business' and b.value is distinct from a.value),
  'changes',coalesce((select jsonb_agg(jsonb_build_object('table',coalesce(b.name,a.name),'before',b.value,'after',a.value) order by coalesce(b.name,a.name))
    from pg_temp.review_stock_daily_record_audit_before b full join pg_temp.review_stock_daily_record_audit_after a using(category,name)
    where coalesce(b.category,a.category)='business' and b.value is distinct from a.value),'[]'::jsonb)) as review_stock_daily_record_postflight;
