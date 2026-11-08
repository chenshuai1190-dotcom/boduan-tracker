-- Run immediately AFTER the proactive migration in the preflight connection.
-- Repeatable and free of business writes. Any permission/schema check failure
-- raises an exception. Data differences are reported explicitly because live
-- user activity between snapshots must be distinguished from migration writes.
set statement_timeout = '90s';
do $$
begin
 if to_regclass('pg_temp.quote_assistant_proactive_audit_before') is null
  or to_regprocedure('pg_temp.quote_assistant_proactive_audit_data()') is null then
  raise exception 'Run preflight.sql first in this same connection';
 end if;
end;
$$;
create temporary table if not exists quote_assistant_proactive_audit_after (
 table_name text primary key,present boolean not null,row_count bigint,fingerprint text
);
truncate pg_temp.quote_assistant_proactive_audit_after;
insert into pg_temp.quote_assistant_proactive_audit_after select * from pg_temp.quote_assistant_proactive_audit_data();

create temporary table if not exists quote_assistant_proactive_audit_checks (
 category text not null,name text not null,passed boolean not null,details jsonb not null default '{}'
);
truncate pg_temp.quote_assistant_proactive_audit_checks;

with expected(name) as (values
 ('quote_assistant_proactive_config'),('quote_assistant_proactive_events'),('quote_assistant_proactive_daily_usage')
)
insert into pg_temp.quote_assistant_proactive_audit_checks
select 'table',e.name,
 c.oid is not null and c.relrowsecurity
 and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not exists(select 1 from pg_policy p where p.polrelid=c.oid),
 jsonb_build_object('present',c.oid is not null,'rls',c.relrowsecurity,
  'anonymousPrivilege',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'authenticatedPrivilege',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'policies',(select count(*) from pg_policy p where p.polrelid=c.oid))
from expected e left join pg_class c on c.oid=to_regclass('public.'||e.name);

with expected(signature,scope) as (values
 ('public.quote_assistant_proactive(text,jsonb)','service'),
 ('public.quote_assistant_service(text,jsonb)','service'),
 ('public.quote_assistant_service_foundation_20261108(text,jsonb)','private'),
 ('public.quote_assistant_proactive_source(text,text,text)','private'),
 ('public.quote_assistant_proactive_source_fingerprint(text,text,text)','private'),
 ('public.quote_assistant_proactive_discussion(text)','private'),
 ('public.quote_assistant_enqueue_participation(text,text,text,uuid)','private'),
 ('public.quote_assistant_participation_saved()','private')
)
insert into pg_temp.quote_assistant_proactive_audit_checks
select 'function',e.signature,
 p.oid is not null and p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public']
 and not has_function_privilege('anon',p.oid,'EXECUTE')
 and has_function_privilege('authenticated',p.oid,'EXECUTE')=(e.scope='user')
 and has_function_privilege('service_role',p.oid,'EXECUTE')=(e.scope='service'),
 jsonb_build_object('present',p.oid is not null,'scope',e.scope,'securityDefiner',p.prosecdef,'config',p.proconfig,
  'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
  'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE'))
from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature);

with expected(name,relation) as (values
 ('quote_assistant_public_participation','review_public_posts'),
 ('quote_assistant_community_participation','review_community_evaluations'),
 ('quote_assistant_log_participation','review_logs'),
 ('quote_assistant_insight_participation','disciplines')
)
insert into pg_temp.quote_assistant_proactive_audit_checks
select 'trigger',e.name,t.oid is not null and t.tgenabled in ('O','A') and t.tgdeferrable and t.tginitdeferred,
 jsonb_build_object('table',e.relation,'enabled',t.tgenabled)
from expected e left join pg_trigger t on t.tgname=e.name and t.tgrelid=to_regclass('public.'||e.relation);

with expected(name) as (values
 ('quote_assistant_proactive_due_idx'),('quote_assistant_proactive_job_idx')
)
insert into pg_temp.quote_assistant_proactive_audit_checks
select 'index',e.name,i.indexrelid is not null and i.indisvalid and i.indisready,
 jsonb_build_object('valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique)
from expected e left join pg_index i on i.indexrelid=to_regclass('public.'||e.name);

insert into pg_temp.quote_assistant_proactive_audit_checks
select 'constraint',c.conrelid::regclass::text||'.'||c.conname,c.convalidated,
 jsonb_build_object('type',c.contype,'validated',c.convalidated)
from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and t.relname in ('quote_assistant_proactive_config','quote_assistant_proactive_events','quote_assistant_proactive_daily_usage');

do $$
declare v_failed text;
begin
 select string_agg(category||':'||name,', ' order by category,name) into v_failed
  from pg_temp.quote_assistant_proactive_audit_checks where not passed;
 if v_failed is not null then raise exception 'Quote proactive postflight failed: %',v_failed;end if;
end;
$$;

select jsonb_build_object(
 'phase','postflight','databaseTime',clock_timestamp(),
 'schemaAndPermissionsOk',not exists(select 1 from pg_temp.quote_assistant_proactive_audit_checks where not passed),
 'businessUnchanged',not exists(select 1 from pg_temp.quote_assistant_proactive_audit_before b full join pg_temp.quote_assistant_proactive_audit_after a using(table_name)
  where (a.present,a.row_count,a.fingerprint) is distinct from (b.present,b.row_count,b.fingerprint)),
 'businessTables',(select jsonb_agg(jsonb_build_object('table',coalesce(a.table_name,b.table_name),'beforeCount',b.row_count,
  'afterCount',a.row_count,'beforeFingerprint',b.fingerprint,'afterFingerprint',a.fingerprint,
  'unchanged',(a.present,a.row_count,a.fingerprint) is not distinct from (b.present,b.row_count,b.fingerprint)) order by coalesce(a.table_name,b.table_name))
  from pg_temp.quote_assistant_proactive_audit_before b full join pg_temp.quote_assistant_proactive_audit_after a using(table_name)),
 'checks',(select jsonb_agg(to_jsonb(c) order by category,name) from pg_temp.quote_assistant_proactive_audit_checks c)
) as quote_assistant_proactive_postflight;
