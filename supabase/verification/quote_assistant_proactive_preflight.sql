-- Run with an administrative SQL connection BEFORE the proactive migration.
-- Emits only table counts and opaque fingerprints; no account data or text.
-- Keep this connection open through migration and postflight for an automatic
-- baseline comparison. All audit objects are connection-local temporary data.
set statement_timeout = '90s';
create temporary table if not exists quote_assistant_proactive_audit_before (
 table_name text primary key,present boolean not null,row_count bigint,fingerprint text
);
truncate pg_temp.quote_assistant_proactive_audit_before;

create or replace function pg_temp.quote_assistant_proactive_audit_data()
returns table(table_name text,present boolean,row_count bigint,fingerprint text)
language plpgsql as $$
declare v_table text;
begin
 foreach v_table in array array[
  'quote_assistant_identity','quote_assistant_preferences','quote_assistant_jobs','quote_assistant_sessions',
  'quote_assistant_memories','quote_assistant_sources','quote_assistant_comment_sources','quote_assistant_subscriptions',
  'review_logs','disciplines','review_public_posts','review_public_likes',
  'review_community_evaluations','review_evaluation_likes','review_activity_notifications',
  'review_feed_clock','review_feed_publications','review_feed_read_state',
  'review_display_preferences','community_profiles','user_settings','accounts',
  'trades','stock_trades','stock_trade_ledger_revisions','balance_snapshots',
  'available_cash_status','available_cash_movements','available_cash_events',
  'margin_status','margin_debt_events','yearly_actuals','pnl_report_snapshots',
  'pnl_report_symbol_snapshots','community_competition_members','community_competition_snapshots'
 ] loop
  table_name:=v_table;present:=to_regclass('public.'||v_table) is not null;
  row_count:=null;fingerprint:=null;
  if present then
   execute format('select count(*),md5(coalesce(string_agg(h,'''' order by h),'''')) from (select md5(to_jsonb(t)::text) h from public.%I t) hashes',v_table)
    into row_count,fingerprint;
  end if;
  return next;
 end loop;
end;
$$;
insert into pg_temp.quote_assistant_proactive_audit_before select * from pg_temp.quote_assistant_proactive_audit_data();

do $$
declare v_signature text;
begin
 foreach v_signature in array array[
  'public.quote_assistant_service(text,jsonb)',
  'public.quote_assistant_user(text,jsonb,uuid)',
  'public.quote_assistant_revoke_job(uuid,text)',
  'public.review_public_valid_date(text)',
  'public.review_community_lock_parent(text)',
  'public.review_community_reply_target(text,text,text)',
  'public.review_comment_nodes(text)','public.review_comment_tree(text)',
  'public.review_public_post_json(public.review_public_posts,uuid)',
  'public.review_community_evaluation_json(public.review_community_evaluations)',
  'public.review_comment_json(text,text,text,timestamp with time zone,boolean,uuid,jsonb,uuid)',
  'public.review_activity_notification_json(public.review_activity_notifications)'
 ] loop
  if to_regprocedure(v_signature) is null then raise exception 'Missing prerequisite: %',v_signature;end if;
 end loop;
end;
$$;

select jsonb_build_object(
 'phase','preflight','databaseTime',clock_timestamp(),'prerequisitesOk',true,
 'proactiveAlreadyPresent',to_regclass('public.quote_assistant_proactive_events') is not null,
 'businessTables',(select jsonb_agg(to_jsonb(b) order by table_name) from pg_temp.quote_assistant_proactive_audit_before b)
) as quote_assistant_proactive_preflight;
