-- Verified public attachments and explicit, one-job private account access.
-- Apply after quote_assistant_proactive_20261109.sql. No grants/backfill from text.
begin;
create table if not exists public.quote_assistant_access_requests (
 id uuid primary key default gen_random_uuid(),job_id uuid not null unique references public.quote_assistant_jobs(id),
 owner_id uuid not null references auth.users(id) on delete cascade,
 scopes text[] not null check(cardinality(scopes) between 1 and 3 and scopes<@array['report','trades','holdings']::text[]),
 range_start date not null,range_end date not null check(range_end>=range_start and range_end-range_start<=365),
 reason text not null check(length(reason) between 1 and 1000),
 output_visibility text not null check(output_visibility in ('public','private')),
 public_analysis_confirmed boolean not null default false,
 status text not null default 'pending' check(status in ('pending','granted','consumed','revoked','expired')),
 expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
 analysis_job_id uuid unique references public.quote_assistant_jobs(id),
 source_fingerprint text,data_fingerprint text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index if not exists quote_assistant_access_owner_idx on public.quote_assistant_access_requests(owner_id,created_at desc);
alter table public.quote_assistant_access_requests enable row level security;
revoke all on public.quote_assistant_access_requests from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_public_attachments(p_value jsonb)
returns jsonb language sql immutable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('account',public.review_public_reply_account(p_value->'account'),
  'trades',public.review_public_reply_trades(p_value->'trades'),'market',public.review_public_project_market(p_value->'market'));
$$;
revoke all on function public.quote_assistant_public_attachments(jsonb) from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_comment_fingerprint(p_post text,p_kind text,p_id text,p_legacy boolean default false)
returns text language sql stable security definer set search_path=pg_catalog,public as $$
 select case when p_legacy then md5(jsonb_build_array(author_id,payload->>'text',parent_kind,parent_id)::text)
  else 'v2:'||md5(jsonb_build_array(author_id,payload->>'text',parent_kind,parent_id,public.quote_assistant_public_attachments(payload))::text) end
 from public.review_comment_nodes(p_post) where kind=p_kind and id=p_id and not deleted;
$$;
revoke all on function public.quote_assistant_comment_fingerprint(text,text,text,boolean) from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_sources_valid(p_job public.quote_assistant_jobs)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_source record;
begin
 for v_source in select * from public.quote_assistant_sources where job_id=p_job.id loop
  if public.quote_assistant_fingerprint(v_source.post_id,v_source.scope,p_job.owner_id) is distinct from v_source.fingerprint then return false;end if;
 end loop;
 for v_source in select * from public.quote_assistant_comment_sources where job_id=p_job.id loop
  if public.quote_assistant_comment_fingerprint(v_source.post_id,v_source.kind,v_source.comment_id,left(v_source.fingerprint,3)<>'v2:') is distinct from v_source.fingerprint then return false;end if;
 end loop;
 return true;
end;
$$;
revoke all on function public.quote_assistant_sources_valid(public.quote_assistant_jobs) from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_comment_changed()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_job record;
begin
 if TG_OP='UPDATE' and (old.payload,old.deleted_at,old.reply_to_kind,old.reply_to_id,old.author_id) is not distinct from (new.payload,new.deleted_at,new.reply_to_kind,new.reply_to_id,new.author_id) then return new;end if;
 for v_job in select j.id,s.fingerprint,s.post_id,s.kind,s.comment_id from public.quote_assistant_jobs j join public.quote_assistant_comment_sources s on s.job_id=j.id
  where s.kind='community' and s.comment_id=old.id::text and j.status<>'cancelled' order by j.id loop
  if public.quote_assistant_comment_fingerprint(v_job.post_id,v_job.kind,v_job.comment_id,left(v_job.fingerprint,3)<>'v2:') is distinct from v_job.fingerprint then perform public.quote_assistant_revoke_job(v_job.id,'SOURCE_CHANGED');end if;
 end loop;
 return case when TG_OP='DELETE' then old else new end;
end;
$$;
revoke all on function public.quote_assistant_comment_changed() from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_access_source(p_job public.quote_assistant_jobs)
returns text language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_source jsonb;
begin
 if p_job.kind='chat' then return md5(jsonb_build_array(p_job.owner_id,p_job.session_id,p_job.prompt)::text);end if;
 if p_job.kind<>'reply' then return null;end if;
 v_source:=public.quote_assistant_proactive_source(p_job.post_id,coalesce(p_job.reply_to_kind,'post'),coalesce(p_job.reply_to_id,p_job.post_id));
 if v_source is null or v_source->>'authorId' is distinct from p_job.owner_id::text then return null;end if;
 return public.quote_assistant_proactive_source_fingerprint(p_job.post_id,coalesce(p_job.reply_to_kind,'post'),coalesce(p_job.reply_to_id,p_job.post_id));
end;
$$;
revoke all on function public.quote_assistant_access_source(public.quote_assistant_jobs) from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_access_json(p_request public.quote_assistant_access_requests)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_request.id,'ownerId',p_request.owner_id,'jobId',p_request.job_id,'analysisJobId',p_request.analysis_job_id,
  'postId',j.post_id,'replyTo',case when j.reply_to_kind is not null then jsonb_build_object('kind',j.reply_to_kind,'id',j.reply_to_id) end,
  'publishedId',j.result_comment_id,'analysisJobStatus',(select status from public.quote_assistant_jobs where id=p_request.analysis_job_id),'status',case when p_request.status in ('pending','granted') and (j.status in ('failed','cancelled') or public.quote_assistant_access_source(j) is distinct from p_request.source_fingerprint) then 'revoked' when p_request.status in ('pending','granted') and p_request.expires_at<=clock_timestamp() then 'expired' else p_request.status end,
  'scopes',p_request.scopes,'rangeStart',p_request.range_start,'rangeEnd',p_request.range_end,'reason',p_request.reason,
  'outputVisibility',p_request.output_visibility,'publicAnalysisConfirmed',p_request.public_analysis_confirmed,'expiresAt',p_request.expires_at)
 from public.quote_assistant_jobs j where j.id=p_request.job_id;
$$;
revoke all on function public.quote_assistant_access_json(public.quote_assistant_access_requests) from public,anon,authenticated,service_role;

-- Formal cash/debt history must exist before exposing derived account values.
create or replace function public.quote_assistant_account_financial_fields(p_value jsonb)
returns jsonb language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare v_cash boolean;v_debt boolean;v_cutoff timestamptz;v_total boolean;
begin
 v_cutoff:=((p_value->>'snapshot_date')::date+time '17:00') at time zone 'America/New_York';
 v_cash:=coalesce(public.review_public_number(p_value->'cash_usd') is not null and p_value->>'cash_basis'='event' and public.review_public_number(p_value->'cash_event_id')>0 and (p_value->>'cash_effective_at')::timestamptz<=v_cutoff,false);
 v_debt:=coalesce(public.review_public_number(p_value->'margin_debt_usd')>=0 and ((p_value->>'margin_debt_basis'='default_zero' and public.review_public_number(p_value->'margin_debt_usd')=0)
  or (p_value->>'margin_debt_basis'='event' and public.review_public_number(p_value->'margin_debt_event_id')>0 and (p_value->>'margin_debt_effective_at')::timestamptz<=v_cutoff)),false);
 v_total:=v_cash and abs(public.review_public_number(p_value->'total_assets_usd')-public.review_public_number(p_value->'market_value_usd')-public.review_public_number(p_value->'cash_usd'))<=0.000002;
 return jsonb_build_object('cash',case when v_cash then p_value->'cash_usd' end,'totalAssets',case when v_total then p_value->'total_assets_usd' end,
  'marginDebt',case when v_debt then p_value->'margin_debt_usd' end,'netAssets',case when v_total and v_debt and abs(public.review_public_number(p_value->'net_assets_usd')-public.review_public_number(p_value->'total_assets_usd')+public.review_public_number(p_value->'margin_debt_usd'))<=0.000002 then p_value->'net_assets_usd' end,
  'cashVerified',v_cash,'marginDebtVerified',v_debt);
end;
$$;
revoke all on function public.quote_assistant_account_financial_fields(jsonb) from public,anon,authenticated,service_role;

-- Whitelist formal rows only. A missing snapshot is not a zero-value account.
-- Holdings are a historical close snapshot, never claimed to be live positions.
create or replace function public.quote_assistant_access_data(p_request public.quote_assistant_access_requests)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_result jsonb:='{}';v_rows jsonb;v_count bigint;v_date date;v_first date;v_last date;v_dirty date;v_revision bigint;v_state_revision bigint;v_valid boolean;v_expected_count integer;v_expected_value numeric;v_symbol_value numeric;v_complete boolean;
begin
 select revision into v_revision from public.stock_trade_ledger_revisions where user_id=p_request.owner_id;
 select dirty_from_date,ledger_revision into v_dirty,v_state_revision from public.pnl_report_rebuild_state where user_id=p_request.owner_id;
 v_valid:=v_revision is not null and (v_state_revision is null or v_state_revision=v_revision);
 if 'report'=any(p_request.scopes) then
  select coalesce(jsonb_agg(jsonb_build_object('asOfDate',s.snapshot_date,'netAssets',to_jsonb(s)->'net_assets_usd','totalAssets',s.total_assets_usd,
   'marginDebt',to_jsonb(s)->'margin_debt_usd','cash',s.cash_usd,'marketValue',s.market_value_usd,'cumulativePnl',s.cumulative_pnl_usd,
   'cumulativeReturnPct',s.cumulative_pnl_pct*100,'dailyPnl',s.daily_pnl_usd,'dailyReturnPct',s.daily_pnl_pct*100,'sourceVersion',s.source_version,'lockedAt',s.locked_at,'sourceUpdatedAt',s.updated_at)||public.quote_assistant_account_financial_fields(to_jsonb(s)) order by s.snapshot_date),'[]'),
   count(*),min(s.snapshot_date),max(s.snapshot_date) into v_rows,v_count,v_first,v_last
   from public.pnl_report_snapshots s where s.user_id=p_request.owner_id and s.snapshot_date between p_request.range_start and p_request.range_end and s.locked_at is not null and s.currency='USD' and s.source_version='pnl_snapshot_v2' and s.locked_at<=clock_timestamp() and s.updated_at<=clock_timestamp() and s.locked_at>=((s.snapshot_date+time '17:00') at time zone 'America/New_York') and extract(isodow from s.snapshot_date)<6 and v_valid and (v_dirty is null or s.snapshot_date<v_dirty);
  v_result:=v_result||jsonb_build_object('report',jsonb_build_object('status',case when v_count>0 then 'available' else 'missing' end,'source','pnl_report_snapshots','currency','USD','rows',v_rows,
   'coverage',jsonb_build_object('requestedStart',p_request.range_start,'requestedEnd',p_request.range_end,'firstAvailable',v_first,'lastAvailable',v_last,'rowCount',v_count,'basis','locked_close','status',case when not v_valid then 'unverified' when v_dirty<=p_request.range_end then 'rebuilding' else 'verified' end)));
 end if;
 if 'trades'=any(p_request.scopes) then
  select count(*) into v_count from public.stock_trades where user_id=p_request.owner_id and trade_date between p_request.range_start and p_request.range_end;
  select coalesce(jsonb_agg(jsonb_build_object('date',trade_date,'symbol',symbol,'side',side,'price',price,'shares',shares,'fee',fee,'currency',currency,
   'recordType',case when coalesce(note,'') ~ '(^|\r?\n)\[\[quote:stock-trade:record-kind=historical_holding:v1\]\](\r?\n|$)' then 'historical_holding' else 'trade' end) order by trade_date,created_at,id),'[]') into v_rows
   from (select * from public.stock_trades where user_id=p_request.owner_id and trade_date between p_request.range_start and p_request.range_end order by trade_date,created_at,id limit 500) t;
  v_result:=v_result||jsonb_build_object('trades',jsonb_build_object('status',case when v_count>0 then 'available' else 'empty' end,'source','stock_trades','rows',v_rows,'truncated',v_count>500));
 end if;
 if 'holdings'=any(p_request.scopes) then
  select max(s.snapshot_date) into v_date from public.pnl_report_snapshots s where s.user_id=p_request.owner_id and s.snapshot_date between p_request.range_start and p_request.range_end and s.locked_at is not null and s.currency='USD' and s.source_version='pnl_snapshot_v2' and s.locked_at<=clock_timestamp() and s.updated_at<=clock_timestamp() and s.locked_at>=((s.snapshot_date+time '17:00') at time zone 'America/New_York') and extract(isodow from s.snapshot_date)<6 and v_valid and (v_dirty is null or s.snapshot_date<v_dirty);
  select (to_jsonb(s)->>'holding_count')::integer,s.market_value_usd into v_expected_count,v_expected_value from public.pnl_report_snapshots s where user_id=p_request.owner_id and snapshot_date=v_date;
  select count(*),coalesce(sum(market_value_usd),0) into v_count,v_symbol_value from public.pnl_report_symbol_snapshots where user_id=p_request.owner_id and snapshot_date=v_date and held_shares>0 and currency='USD' and source_version='pnl_snapshot_v2' and updated_at<=clock_timestamp();
  v_complete:=coalesce(v_count=v_expected_count and abs(v_symbol_value-v_expected_value)<=0.000002 and v_count<=200,false);
  select coalesce(jsonb_agg(jsonb_build_object('symbol',symbol,'shares',held_shares,'averageCost',avg_cost_usd,'marketValue',market_value_usd,'unrealizedPnl',unrealized_pnl_usd) order by symbol),'[]') into v_rows
   from (select * from public.pnl_report_symbol_snapshots where user_id=p_request.owner_id and snapshot_date=v_date and held_shares>0 and currency='USD' and source_version='pnl_snapshot_v2' and updated_at<=clock_timestamp() order by symbol limit 200) s;
  v_result:=v_result||jsonb_build_object('holdings',jsonb_build_object('status',case when v_date is null then 'missing' when v_count>0 then 'available' when v_complete then 'empty' else 'missing' end,
   'source','pnl_report_symbol_snapshots','asOfDate',v_date,'currency','USD','rows',v_rows,'truncated',v_count>200,'complete',v_complete,'basis','locked_close','coverageStatus',case when not v_valid or not v_complete then 'unverified' when v_dirty<=p_request.range_end then 'rebuilding' else 'verified' end));
 end if;
 return v_result;
end;
$$;
revoke all on function public.quote_assistant_access_data(public.quote_assistant_access_requests) from public,anon,authenticated,service_role;

-- Preserve prior entry points; only canonical wrappers are externally callable.
do $$begin
 if to_regprocedure('public.quote_assistant_user_before_access_20261109(text,jsonb,uuid)') is null then alter function public.quote_assistant_user(text,jsonb,uuid) rename to quote_assistant_user_before_access_20261109;end if;
 if to_regprocedure('public.quote_assistant_service_before_access_20261109(text,jsonb)') is null then alter function public.quote_assistant_service(text,jsonb) rename to quote_assistant_service_before_access_20261109;end if;
end$$;
revoke all on function public.quote_assistant_user_before_access_20261109(text,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.quote_assistant_service_before_access_20261109(text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_user(p_action text,p_payload jsonb default '{}'::jsonb,p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_request public.quote_assistant_access_requests;v_parent public.quote_assistant_jobs;v_job public.quote_assistant_jobs;
 v_scopes text[];v_start date;v_end date;v_id uuid;v_child uuid;v_confirm boolean;v_result jsonb;
begin
 if p_action not in ('access-state','access-grant','access-revoke') then return public.quote_assistant_user_before_access_20261109(p_action,p_payload,p_expected_user_id);end if;
 if v_user is null or v_user is distinct from p_expected_user_id then raise exception 'authenticated account does not match request' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>20000 then raise exception 'invalid access payload' using errcode='22023';end if;
 if p_action='access-state' then
  return jsonb_build_object('requests',coalesce((select jsonb_agg(public.quote_assistant_access_json(r) order by r.created_at desc) from
   (select r.* from public.quote_assistant_access_requests r join public.quote_assistant_jobs j on j.id=r.job_id
    where r.owner_id=v_user and (p_payload->>'postId' is null or j.post_id=p_payload->>'postId') order by r.created_at desc limit 50) r),'[]'::jsonb));
 end if;
 v_id:=(p_payload->>'id')::uuid;
 select * into v_request from public.quote_assistant_access_requests where id=v_id and owner_id=v_user;
 if not found then raise exception 'account access request unavailable' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,714293));
 select * into v_parent from public.quote_assistant_jobs where id=v_request.job_id;
 if v_parent.post_id is not null then perform public.review_community_lock_parent(v_parent.post_id);end if;
 select * into v_request from public.quote_assistant_access_requests where id=v_id for update;
 if p_action='access-revoke' then
  update public.quote_assistant_access_requests set status='revoked',updated_at=clock_timestamp() where id=v_id returning * into v_request;
  if v_request.analysis_job_id is not null then perform public.quote_assistant_revoke_job(v_request.analysis_job_id,'ACCOUNT_ACCESS_REVOKED');end if;
  return public.quote_assistant_access_json(v_request);
 end if;
 begin
  select array_agg(value order by value) into v_scopes from jsonb_array_elements_text(p_payload->'scopes');
  if not public.review_public_valid_date(p_payload->>'rangeStart') or not public.review_public_valid_date(p_payload->>'rangeEnd') then raise exception 'invalid date';end if;
  v_start:=(p_payload->>'rangeStart')::date;v_end:=(p_payload->>'rangeEnd')::date;
 exception when others then raise exception 'invalid access scopes or dates' using errcode='22023';end;
 if cardinality(v_scopes) not between 1 and 3 or cardinality(v_scopes) is null or (select count(distinct x) from unnest(v_scopes) x)<>cardinality(v_scopes)
  or not v_scopes<@v_request.scopes or v_start is null or v_end is null or v_start<v_request.range_start or v_end>v_request.range_end or v_end<v_start or v_end-v_start>365 then raise exception 'access grant exceeds requested scope' using errcode='22023';end if;
 v_confirm:=p_payload->'publicAnalysisConfirmed'='true'::jsonb;
 if v_request.output_visibility='public' and not coalesce(v_confirm,false) then raise exception 'public analysis requires explicit confirmation' using errcode='42501';end if;
 if v_request.status in ('granted','consumed') and v_request.analysis_job_id is not null then
  if v_scopes<>v_request.scopes or v_start<>v_request.range_start or v_end<>v_request.range_end then raise exception 'access grant identity reused' using errcode='40001';end if;
  select * into v_job from public.quote_assistant_jobs where id=v_request.analysis_job_id;
  if v_job.status='failed' and v_job.attempts<3 and v_request.status='granted' and v_request.expires_at>clock_timestamp()
   and v_parent.status not in ('failed','cancelled') and public.quote_assistant_access_source(v_parent)=v_request.source_fingerprint
   and v_job.error_code in ('ASSISTANT_TIMEOUT','ASSISTANT_RATE_LIMITED','ASSISTANT_PROVIDER_FAILED','ASSISTANT_UNAVAILABLE') then
   update public.quote_assistant_jobs set status='pending',error_code=null,lease_token=null,lease_expires_at=null,revision=revision+1,updated_at=clock_timestamp() where id=v_job.id returning * into v_job;
  end if;
  return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id,'accountAccessId',v_id);
 end if;
 if v_request.status<>'pending' or v_request.expires_at<=clock_timestamp() or v_parent.status in ('failed','cancelled')
  or public.quote_assistant_access_source(v_parent) is null or public.quote_assistant_access_source(v_parent) is distinct from v_request.source_fingerprint then raise exception 'account access request expired or withdrawn' using errcode='40001';end if;
 if (select count(*) from public.quote_assistant_jobs where owner_id=v_user and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')>=30 then raise exception 'daily assistant limit reached' using errcode='54000';end if;
 if (select count(*) from public.quote_assistant_jobs where owner_id=v_user and status in ('pending','running'))>=20 then raise exception 'active assistant limit reached' using errcode='54000';end if;
 v_child:=gen_random_uuid();
 if v_parent.kind<>'chat' then insert into public.quote_assistant_sessions(id,owner_id,kind,post_id) values(v_child,v_user,v_parent.kind,v_parent.post_id);end if;
 insert into public.quote_assistant_jobs(id,owner_id,session_id,kind,prompt,post_id,reply_to_kind,reply_to_id,auto_publish,request_payload)
 values(v_child,v_user,case when v_parent.kind='chat' then v_parent.session_id else v_child end,v_parent.kind,v_parent.prompt,v_parent.post_id,v_parent.reply_to_kind,v_parent.reply_to_id,v_request.output_visibility='public',jsonb_build_object('accountAccessId',v_id)) returning * into v_job;
 if v_parent.post_id is not null then perform public.quote_assistant_add_source(v_job,v_parent.post_id,'public');end if;
 update public.quote_assistant_access_requests set status='granted',analysis_job_id=v_child,scopes=v_scopes,range_start=v_start,range_end=v_end,public_analysis_confirmed=coalesce(v_confirm,false),expires_at=clock_timestamp()+interval '24 hours',updated_at=clock_timestamp() where id=v_id;
 return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_user,'accountAccessId',v_id);
end;
$$;
revoke all on function public.quote_assistant_user(text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.quote_assistant_user(text,jsonb,uuid) to authenticated;

create or replace function public.quote_assistant_service(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_job public.quote_assistant_jobs;v_parent public.quote_assistant_jobs;v_request public.quote_assistant_access_requests;
 v_id uuid;v_scopes text[];v_start date;v_end date;v_reason text;v_result jsonb;v_data jsonb;v_comments jsonb;v_source record;v_meta jsonb;
begin
 if p_payload->>'id' is not null then select * into v_job from public.quote_assistant_jobs where id=(p_payload->>'id')::uuid;end if;
 if p_action='context' then
  for v_source in select post_id from public.quote_assistant_sources where job_id=v_job.id union select v_job.post_id where v_job.post_id is not null order by post_id loop perform public.review_community_lock_parent(v_source.post_id);end loop;
 end if;
 if p_action='request-access' then
  if v_job.id is null or v_job.kind not in ('reply','chat') or v_job.request_payload ? 'accountAccessId' then raise exception 'account access request requires original reply or chat' using errcode='42501';end if;
  for v_source in select post_id from public.quote_assistant_sources where job_id=v_job.id union select v_job.post_id where v_job.post_id is not null order by post_id loop perform public.review_community_lock_parent(v_source.post_id);end loop;
  select * into v_job from public.quote_assistant_jobs where id=v_job.id for update;
  if v_job.status<>'running' or v_job.lease_token is null or v_job.lease_token::text is distinct from p_payload->>'leaseToken' or v_job.lease_expires_at<=clock_timestamp() then raise exception 'account request lease expired' using errcode='40001';end if;
  if public.quote_assistant_access_source(v_job) is null then raise exception 'account source owner mismatch' using errcode='42501';end if;
  select * into v_request from public.quote_assistant_access_requests where job_id=v_job.id;
  if found then return public.quote_assistant_access_json(v_request);end if;
  begin
   select array_agg(value order by value) into v_scopes from jsonb_array_elements_text(p_payload->'scopes');
   if (p_payload->>'rangeStart' is not null and not public.review_public_valid_date(p_payload->>'rangeStart')) or (p_payload->>'rangeEnd' is not null and not public.review_public_valid_date(p_payload->>'rangeEnd')) then raise exception 'invalid date';end if;
   v_end:=coalesce((p_payload->>'rangeEnd')::date,(clock_timestamp() at time zone 'UTC')::date);v_start:=coalesce((p_payload->>'rangeStart')::date,v_end-30);
  exception when others then raise exception 'invalid access request scopes or dates' using errcode='22023';end;
  v_reason:=btrim(p_payload->>'reason');
  if cardinality(v_scopes) not between 1 and 3 or cardinality(v_scopes) is null or (select count(distinct x) from unnest(v_scopes) x)<>cardinality(v_scopes) or not v_scopes<@array['report','trades','holdings']::text[]
   or v_start is null or v_end is null or v_end<v_start or v_end-v_start>365 or v_end>(clock_timestamp() at time zone 'UTC')::date+1 or length(coalesce(v_reason,'')) not between 1 and 1000 then raise exception 'invalid account access request' using errcode='22023';end if;
  insert into public.quote_assistant_access_requests(job_id,owner_id,scopes,range_start,range_end,reason,output_visibility,source_fingerprint)
   values(v_job.id,v_job.owner_id,v_scopes,v_start,v_end,v_reason,case when v_job.kind='reply' then 'public' else 'private' end,public.quote_assistant_access_source(v_job)) returning * into v_request;
  return public.quote_assistant_access_json(v_request);
 end if;
 if v_job.request_payload ? 'accountAccessId' and p_action in ('claim','context','complete','publish') then
  for v_source in select post_id from public.quote_assistant_sources where job_id=v_job.id union select v_job.post_id where v_job.post_id is not null order by post_id loop perform public.review_community_lock_parent(v_source.post_id);end loop;
  select * into v_request from public.quote_assistant_access_requests where id=(v_job.request_payload->>'accountAccessId')::uuid for update;
  select * into v_parent from public.quote_assistant_jobs where id=v_request.job_id;
  -- Formal report writers and ledger revisions serialize on this same per-user row.
  -- Keep the shared lock through fingerprint validation and publication.
  perform 1 from public.stock_trade_ledger_revisions where user_id=v_job.owner_id for share;
  if (v_job.status in ('pending','running') or v_job.status='draft' and v_job.kind<>'chat') and (v_request.id is null or v_request.owner_id<>v_job.owner_id or v_request.analysis_job_id<>v_job.id or v_request.status<>'granted'
   or v_request.expires_at<=clock_timestamp() or v_request.output_visibility='public' and not v_request.public_analysis_confirmed
   or v_parent.status='cancelled' or public.quote_assistant_access_source(v_parent) is null or public.quote_assistant_access_source(v_parent) is distinct from v_request.source_fingerprint
   or v_request.data_fingerprint is not null and v_request.data_fingerprint is distinct from md5(public.quote_assistant_access_data(v_request)::text)) then
   perform public.quote_assistant_revoke_job(v_job.id,'ACCOUNT_ACCESS_UNAVAILABLE');
   update public.quote_assistant_access_requests set status=case when expires_at<=clock_timestamp() then 'expired' else 'revoked' end,updated_at=clock_timestamp() where id=v_request.id;
   select * into v_job from public.quote_assistant_jobs where id=v_job.id;
   if p_action='claim' then return jsonb_build_object('job',public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id),'leaseToken',null);end if;
   if p_action='context' then return jsonb_build_object('job',public.quote_assistant_job_json(v_job),'post',null,'comments','[]'::jsonb,'publicPosts','[]'::jsonb,'history','[]'::jsonb,'memories','[]'::jsonb);end if;
   return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id);
  end if;
 end if;
 v_result:=public.quote_assistant_service_before_access_20261109(p_action,p_payload);
 if p_action='context' and v_result->'job'->>'status'='running' then
  if v_job.request_payload ? 'accountAccessId' then
   delete from public.quote_assistant_sources where job_id=v_job.id and post_id is distinct from v_job.post_id;
   v_result:=v_result||jsonb_build_object('publicPosts','[]'::jsonb,'history','[]'::jsonb);
  end if;
  -- Upgrade only the exact comments supplied by the verified context. Legacy
  -- jobs retain their old text-only hashes until they actually read attachments.
  select coalesce(jsonb_agg(c.value||public.quote_assistant_public_attachments(n.payload) order by c.ordinal),'[]') into v_comments
   from jsonb_array_elements(v_result->'comments') with ordinality c(value,ordinal)
   join lateral (select payload from public.review_comment_nodes(v_job.post_id) where kind=c.value->>'kind' and id=c.value->>'id' and not deleted) n on true;
  v_result:=v_result||jsonb_build_object('comments',v_comments);
  update public.quote_assistant_comment_sources s set fingerprint=public.quote_assistant_comment_fingerprint(s.post_id,s.kind,s.comment_id,false) where s.job_id=v_job.id;
  select * into v_request from public.quote_assistant_access_requests where analysis_job_id=v_job.id or job_id=v_job.id order by (analysis_job_id=v_job.id) desc limit 1;
  if found then
   v_meta:=public.quote_assistant_access_json(v_request);
   if v_request.analysis_job_id=v_job.id and v_request.status='granted' then
    v_data:=public.quote_assistant_access_data(v_request);
    update public.quote_assistant_access_requests set data_fingerprint=md5(v_data::text) where id=v_request.id;
    v_meta:=v_meta||jsonb_build_object('status','authorized','data',v_data);
   end if;
   v_result:=v_result||jsonb_build_object('accountAccess',v_meta);
  end if;
 end if;
 if v_job.request_payload ? 'accountAccessId' and ((p_action='complete' and v_job.kind='chat' and v_result->>'status'='draft') or (p_action='publish' and v_result->>'status'='published')) then
  update public.quote_assistant_access_requests set status='consumed',updated_at=clock_timestamp() where analysis_job_id=v_job.id and status='granted';
 end if;
 return v_result;
end;
$$;
revoke all on function public.quote_assistant_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.quote_assistant_service(text,jsonb) to service_role;

create or replace function public.quote_assistant_proactive_source(p_post text,p_kind text,p_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_post public.review_public_posts;v_node record;v_bot uuid;
begin
 select * into v_post from public.review_public_posts where id=p_post;
 if not found then return null;end if;
 select author_id into v_bot from public.quote_assistant_identity;
 if p_kind='post' and p_id=p_post then
  return public.quote_assistant_public_post(v_post)||jsonb_build_object('kind','post','postId',p_post,'createdAt',v_post.published_at,'hasImages',jsonb_array_length(v_post.images)>0,
   'author',jsonb_build_object('nickname',coalesce((select nickname from public.community_profiles where user_id=v_post.author_id),'Quote 用户'),'isAssistant',v_post.author_id=v_bot));
 end if;
 if p_kind not in ('author','community') then return null;end if;
 select * into v_node from public.review_comment_nodes(p_post) where kind=p_kind and id=p_id and not deleted;
 if not found then return null;end if;
 return jsonb_build_object('id',v_node.id,'kind',v_node.kind,'postId',p_post,'authorId',v_node.author_id,
  'text',left(coalesce(v_node.payload->>'text',''),12000),'createdAt',v_node.created_at,
  'account',public.review_public_reply_account(v_node.payload->'account'),'trades',public.review_public_reply_trades(v_node.payload->'trades'),'market',public.review_public_project_market(v_node.payload->'market'),
  'author',jsonb_build_object('nickname',case when v_node.author_id=v_bot then 'Quote' else coalesce((select nickname from public.community_profiles where user_id=v_node.author_id),'Quote 用户') end,'isAssistant',v_node.author_id=v_bot),
  'replyTo',case when v_node.parent_kind is not null then jsonb_build_object('kind',v_node.parent_kind,'id',v_node.parent_id) end);
end;
$$;
revoke all on function public.quote_assistant_proactive_source(text,text,text) from public,anon,authenticated,service_role;


create or replace function public.quote_assistant_proactive_source_fingerprint(p_post text,p_kind text,p_id text)
returns text language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_source jsonb;
begin
 v_source:=public.quote_assistant_proactive_source(p_post,p_kind,p_id);
 if v_source is null then return null;end if;
 -- Public profile presentation and interaction counts cannot invalidate facts.
 return md5(jsonb_build_array(v_source->>'authorId',v_source->>'text',v_source->'replyTo',public.quote_assistant_public_attachments(v_source),
  public.quote_assistant_fingerprint(p_post,'public',null))::text);
end;
$$;
revoke all on function public.quote_assistant_proactive_source_fingerprint(text,text,text) from public,anon,authenticated,service_role;


create or replace function public.quote_assistant_proactive_discussion(p_post text)
returns text language sql stable security definer set search_path=pg_catalog,public as $$
 select md5(coalesce(jsonb_agg(jsonb_build_array(kind,id,author_id,payload->>'text',parent_kind,parent_id,public.quote_assistant_public_attachments(payload)) order by created_at,kind,id)::text,'[]'))
 from public.review_comment_nodes(p_post) where not deleted;
$$;
revoke all on function public.quote_assistant_proactive_discussion(text) from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_access_parent_cancelled()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_request record;
begin
 if new.status='cancelled' and old.status is distinct from new.status then
  for v_request in update public.quote_assistant_access_requests set status='revoked',updated_at=clock_timestamp()
   where job_id=new.id and status<>'revoked' returning analysis_job_id loop
   if v_request.analysis_job_id is not null then perform public.quote_assistant_revoke_job(v_request.analysis_job_id,'ACCOUNT_ACCESS_REVOKED');end if;
  end loop;
 end if;
 return new;
end;
$$;
revoke all on function public.quote_assistant_access_parent_cancelled() from public,anon,authenticated,service_role;
drop trigger if exists quote_assistant_access_parent_cancelled on public.quote_assistant_jobs;
create trigger quote_assistant_access_parent_cancelled after update of status on public.quote_assistant_jobs for each row execute function public.quote_assistant_access_parent_cancelled();
commit;
