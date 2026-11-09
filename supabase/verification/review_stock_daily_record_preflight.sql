-- Administrative read-only audit. Keep this SQL connection through migration
-- and postflight. Results contain aggregate hashes, never private text or IDs.
set statement_timeout = '90s';
do $$
begin
  if to_regclass('public.review_display_preferences') is null
    or to_regprocedure('public.quote_assistant_fingerprint(text,text,uuid)') is null then
    raise exception 'Review preferences and Quote foundation must exist first';
  end if;
end;
$$;

create temporary table if not exists review_stock_daily_record_audit_before (
  category text not null, name text not null, value jsonb not null, primary key(category,name)
);
truncate pg_temp.review_stock_daily_record_audit_before;

create or replace function pg_temp.review_stock_daily_record_audit()
returns table(category text,name text,value jsonb) language plpgsql as $$
declare v_table text; v_count bigint; v_hash text;
begin
  foreach v_table in array array[
    'review_display_preferences','review_logs','disciplines','stock_trades',
    'stock_trade_ledger_revisions','pnl_report_rebuild_state','pnl_report_snapshots',
    'pnl_report_symbol_snapshots','quote_assistant_jobs','quote_assistant_sources',
    'quote_assistant_comment_sources','quote_assistant_access_requests',
    'quote_assistant_proactive_config','quote_assistant_proactive_events'
  ] loop
    category:='business';name:=v_table;
    if to_regclass('public.'||v_table) is null then value:=jsonb_build_object('present',false);
    else
      -- Normalize an absent new column to JSON null. Existing explicit values
      -- still participate, so repeat migration audits detect flag resets too.
      execute format('select count(*),md5(coalesce(string_agg(h,'''' order by h),'''')) from (select md5((to_jsonb(t)||jsonb_build_object(''show_stock_daily_record'',to_jsonb(t)->''show_stock_daily_record''))::text) h from public.%I t) hashes',v_table)
        into v_count,v_hash;
      value:=jsonb_build_object('present',true,'count',v_count,'fingerprint',v_hash);
    end if;
    return next;
  end loop;
  return query select 'security'::text,'preferences'::text,
    jsonb_build_object('owner',c.relowner,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl,
      'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'roles',p.polroles,'command',p.polcmd,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid),
      'constraints',(select jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'valid',k.convalidated) order by k.conname) from pg_constraint k where k.conrelid=c.oid))
    from pg_class c where c.oid='public.review_display_preferences'::regclass;
  return query select 'security'::text,'fingerprint'::text,
    jsonb_build_object('oid',p.oid,'owner',p.proowner,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl)
    from pg_proc p where p.oid='public.quote_assistant_fingerprint(text,text,uuid)'::regprocedure;
  return query select 'function'::text,'fingerprint'::text,to_jsonb(pg_get_functiondef('public.quote_assistant_fingerprint(text,text,uuid)'::regprocedure));
end;
$$;
insert into pg_temp.review_stock_daily_record_audit_before select * from pg_temp.review_stock_daily_record_audit();

select jsonb_build_object('phase','preflight','databaseTime',clock_timestamp(),
  'columnAlreadyPresent',exists(select 1 from pg_attribute where attrelid='public.review_display_preferences'::regclass and attname='show_stock_daily_record' and not attisdropped),
  'businessTables',(select jsonb_agg(jsonb_build_object('table',name,'value',value) order by name) from pg_temp.review_stock_daily_record_audit_before where category='business')) as review_stock_daily_record_preflight;
