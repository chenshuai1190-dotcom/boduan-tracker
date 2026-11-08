-- Additive, service-only participation queue. Apply after assistant foundation.
-- No backfill: only newly saved public content while enabled enters the queue.
begin;

create table if not exists public.quote_assistant_proactive_config (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 enabled_at timestamptz,
 founder_id uuid references auth.users(id),
 review_author_ids uuid[] not null default '{}',
 daily_decision_limit integer not null default 200 check(daily_decision_limit between 1 and 2000),
 daily_reply_limit integer not null default 30 check(daily_reply_limit between 1 and 500),
 thread_reply_limit integer not null default 3 check(thread_reply_limit between 1 and 20),
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp()
);
insert into public.quote_assistant_proactive_config(singleton) values(true) on conflict do nothing;
create table if not exists public.quote_assistant_proactive_events (
 id uuid primary key default gen_random_uuid(),
 post_id text not null,
 source_kind text not null check(source_kind in ('post','author','community')),
 source_id text not null check(length(source_id) between 1 and 150),
 author_id uuid not null references auth.users(id) on delete cascade,
 mode text not null check(mode in ('founder_post','review_author','general')),
 status text not null default 'pending' check(status in ('pending','running','waiting','skipped','queued','published','cancelled','failed')),
 due_at timestamptz not null default clock_timestamp()+interval '60 seconds',
 attempts integer not null default 0 check(attempts between 0 and 3),
 wait_count integer not null default 0 check(wait_count between 0 and 2),
 lease_token uuid,lease_expires_at timestamptz,
 source_fingerprint text,discussion_fingerprint text,
 decision_reason text not null default '' check(length(decision_reason)<=1000),
 question_key text not null default '' check(length(question_key)<=240),
 job_id uuid references public.quote_assistant_jobs(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(post_id,source_kind,source_id)
);
create index if not exists quote_assistant_proactive_due_idx on public.quote_assistant_proactive_events(status,due_at,lease_expires_at) where status in ('pending','running','waiting');
create unique index if not exists quote_assistant_proactive_job_idx on public.quote_assistant_proactive_events(job_id) where job_id is not null;
create table if not exists public.quote_assistant_proactive_daily_usage (
 day date primary key,decisions integer not null default 0 check(decisions>=0),replies integer not null default 0 check(replies>=0)
);
alter table public.quote_assistant_proactive_config enable row level security;
alter table public.quote_assistant_proactive_events enable row level security;
alter table public.quote_assistant_proactive_daily_usage enable row level security;
revoke all on public.quote_assistant_proactive_config,public.quote_assistant_proactive_events,public.quote_assistant_proactive_daily_usage from public,anon,authenticated;

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
 return md5(jsonb_build_array(v_source->>'authorId',v_source->>'text',v_source->'replyTo',
  public.quote_assistant_fingerprint(p_post,'public',null))::text);
end;
$$;
revoke all on function public.quote_assistant_proactive_source_fingerprint(text,text,text) from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_proactive_discussion(p_post text)
returns text language sql stable security definer set search_path=pg_catalog,public as $$
 select md5(coalesce(jsonb_agg(jsonb_build_array(kind,id,author_id,payload->>'text',parent_kind,parent_id) order by created_at,kind,id)::text,'[]'))
 from public.review_comment_nodes(p_post) where not deleted;
$$;
revoke all on function public.quote_assistant_proactive_discussion(text) from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_enqueue_participation(p_post text,p_kind text,p_id text,p_author uuid)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_config public.quote_assistant_proactive_config;v_bot uuid;v_parent record;
begin
 select * into v_config from public.quote_assistant_proactive_config where singleton;
 select author_id into v_bot from public.quote_assistant_identity;
 if not v_config.enabled or v_bot is null or p_author=v_bot then return;end if;
 select * into v_parent from public.review_community_parent(p_post);
 if not found or not v_parent.parent_public then return;end if;
 insert into public.quote_assistant_proactive_events(post_id,source_kind,source_id,author_id,mode)
 values(p_post,p_kind,p_id,p_author,case when p_kind='post' and p_author=v_config.founder_id then 'founder_post'
  when p_author=any(v_config.review_author_ids) then 'review_author' else 'general' end)
 on conflict(post_id,source_kind,source_id) do nothing;
end;
$$;
revoke all on function public.quote_assistant_enqueue_participation(text,text,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.quote_assistant_participation_saved()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_post text;v_reply jsonb;v_old jsonb;
begin
 if TG_TABLE_NAME='review_public_posts' then
  perform public.quote_assistant_enqueue_participation(new.id,'post',new.id,new.author_id);
 elsif TG_TABLE_NAME='review_community_evaluations' then
  if new.deleted_at is null then perform public.quote_assistant_enqueue_participation(new.post_id,'community',new.id::text,new.author_id);end if;
 elsif TG_TABLE_NAME in ('review_logs','disciplines') then
  v_post:=(case TG_TABLE_NAME when 'review_logs' then 'log:' else 'insight:' end)||new.id::text;
  v_old:=case when TG_OP='UPDATE' then public.review_public_project_replies(old.review_data->'replies',old.user_id) else '[]'::jsonb end;
  for v_reply in select value from jsonb_array_elements(public.review_public_project_replies(new.review_data->'replies',new.user_id)) loop
   if not exists(select 1 from jsonb_array_elements(v_old) prior where prior->>'id'=v_reply->>'id') then
    perform public.quote_assistant_enqueue_participation(v_post,'author',v_reply->>'id',new.user_id);
   end if;
  end loop;
 end if;
 return new;
end;
$$;
revoke all on function public.quote_assistant_participation_saved() from public,anon,authenticated,service_role;
drop trigger if exists quote_assistant_public_participation on public.review_public_posts;
create constraint trigger quote_assistant_public_participation after insert on public.review_public_posts deferrable initially deferred for each row execute function public.quote_assistant_participation_saved();
drop trigger if exists quote_assistant_community_participation on public.review_community_evaluations;
create constraint trigger quote_assistant_community_participation after insert on public.review_community_evaluations deferrable initially deferred for each row execute function public.quote_assistant_participation_saved();
drop trigger if exists quote_assistant_log_participation on public.review_logs;
create constraint trigger quote_assistant_log_participation after insert or update on public.review_logs deferrable initially deferred for each row execute function public.quote_assistant_participation_saved();
drop trigger if exists quote_assistant_insight_participation on public.disciplines;
create constraint trigger quote_assistant_insight_participation after insert or update on public.disciplines deferrable initially deferred for each row execute function public.quote_assistant_participation_saved();

create or replace function public.quote_assistant_proactive(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_config public.quote_assistant_proactive_config;v_event public.quote_assistant_proactive_events;v_job public.quote_assistant_jobs;
 v_post public.review_public_posts;v_parent record;v_source jsonb;v_node record;v_comments jsonb:='[]';v_recent jsonb:='[]';v_context jsonb;
 v_bot uuid;v_id uuid;v_token uuid;v_founder uuid;v_review uuid[];v_decision text;v_reason text;v_question text;v_job_id uuid;v_mode text;
 v_day date:=(clock_timestamp() at time zone 'UTC')::date;v_retry boolean:=false;v_usage public.quote_assistant_proactive_daily_usage;v_next_day timestamptz;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>20000 then raise exception 'invalid participation payload' using errcode='22023';end if;
 select * into v_config from public.quote_assistant_proactive_config where singleton;
 select author_id into v_bot from public.quote_assistant_identity;
 if p_action='state' then
  return jsonb_build_object('enabled',v_config.enabled,'enabledAt',v_config.enabled_at,'founderId',v_config.founder_id,'reviewAuthorIds',v_config.review_author_ids,
   'dailyDecisionLimit',v_config.daily_decision_limit,'dailyReplyLimit',v_config.daily_reply_limit,'threadReplyLimit',v_config.thread_reply_limit,'revision',v_config.revision,
   'counts',coalesce((select jsonb_object_agg(status,n) from (select status,count(*) n from public.quote_assistant_proactive_events group by status) c),'{}'::jsonb),
   'lastFailureCode',(select case when decision_reason ~ '^[A-Z][A-Z0-9_]{0,63}$' then decision_reason else 'ASSISTANT_FAILED' end from public.quote_assistant_proactive_events where status='failed' order by updated_at desc,id desc limit 1));
 end if;
 if p_action='configure' then
  perform pg_advisory_xact_lock(714294,1);
  select * into v_config from public.quote_assistant_proactive_config where singleton for update;
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'enabled is required' using errcode='22023';end if;
  begin
   v_founder:=coalesce((p_payload->>'founderId')::uuid,v_config.founder_id);
   if p_payload ? 'reviewAuthorIds' then
    if jsonb_typeof(p_payload->'reviewAuthorIds') is distinct from 'array' then raise exception 'invalid review authors';end if;
    select array_agg(value::uuid order by value) into v_review from jsonb_array_elements_text(p_payload->'reviewAuthorIds');
   else v_review:=v_config.review_author_ids;end if;
  exception when others then raise exception 'invalid participation identities' using errcode='22023';end;
  if (p_payload->>'enabled')::boolean and (v_bot is null or v_founder is null or cardinality(v_review) is distinct from 3
   or v_founder=v_bot or v_bot=any(v_review) or v_founder=any(v_review)
   or (select count(distinct x) from unnest(v_review) x)<>3
   or not exists(select 1 from auth.users where id=v_founder)
   or exists(select 1 from unnest(v_review) x where not exists(select 1 from auth.users where id=x))) then
   raise exception 'confirmed founder and three distinct review accounts required' using errcode='22023';end if;
  update public.quote_assistant_proactive_config set enabled=(p_payload->>'enabled')::boolean,
   enabled_at=case when not enabled and (p_payload->>'enabled')::boolean then clock_timestamp() else enabled_at end,
   founder_id=v_founder,review_author_ids=coalesce(v_review,'{}'),
   daily_decision_limit=coalesce((p_payload->>'dailyDecisionLimit')::integer,daily_decision_limit),
   daily_reply_limit=coalesce((p_payload->>'dailyReplyLimit')::integer,daily_reply_limit),
   thread_reply_limit=coalesce((p_payload->>'threadReplyLimit')::integer,thread_reply_limit),revision=revision+1,updated_at=clock_timestamp() where singleton;
  return public.quote_assistant_proactive('state');
 end if;
 if p_action='claim' then
  if not v_config.enabled or v_bot is null then return jsonb_build_object('event',null,'deferred',true,'reason','disabled');end if;
  select * into v_event from public.quote_assistant_proactive_events where
   (status in ('pending','waiting') and due_at<=clock_timestamp()) or (status='running' and lease_expires_at<=clock_timestamp())
   order by due_at,created_at,id limit 1;
  if not found then return jsonb_build_object('event',null);end if;
 else
  begin v_id:=(p_payload->>'id')::uuid;v_token:=(p_payload->>'leaseToken')::uuid;exception when others then raise exception 'invalid participation lease' using errcode='22023';end;
  select * into v_event from public.quote_assistant_proactive_events where id=v_id;
  if not found then raise exception 'participation event unavailable' using errcode='P0002';end if;
 end if;
 -- Explicit @ creation takes owner before parent. Use the same order so the
 -- two entry points cannot deadlock or reserve separate jobs for one source.
 perform pg_advisory_xact_lock(hashtextextended(v_event.author_id::text,714293));
 perform public.review_community_lock_parent(v_event.post_id);
 perform pg_advisory_xact_lock(714294,1);
 select * into v_config from public.quote_assistant_proactive_config where singleton;
 select * into v_event from public.quote_assistant_proactive_events where id=v_event.id for update;
 v_source:=public.quote_assistant_proactive_source(v_event.post_id,v_event.source_kind,v_event.source_id);
 if not v_config.enabled or v_event.created_at<v_config.enabled_at or v_source is null or (v_source->>'authorId')::uuid is distinct from v_event.author_id or v_event.author_id=v_bot then
  update public.quote_assistant_proactive_events set status='cancelled',decision_reason='SOURCE_OR_CONFIGURATION_CHANGED',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('event',null,'status','cancelled');
 end if;
 if p_action='claim' then
  if v_event.status='running' and v_event.lease_expires_at>clock_timestamp() or v_event.status not in ('pending','waiting','running') then return jsonb_build_object('event',null);end if;
  if v_event.attempts>=3 then
   update public.quote_assistant_proactive_events set status='failed',decision_reason='ATTEMPT_LIMIT',lease_token=null,lease_expires_at=null where id=v_event.id;
   return jsonb_build_object('event',null,'status','failed');
  end if;
  insert into public.quote_assistant_proactive_daily_usage(day) values(v_day) on conflict do nothing;
  select * into v_usage from public.quote_assistant_proactive_daily_usage where day=v_day for update;
  if v_usage.decisions>=v_config.daily_decision_limit then return jsonb_build_object('event',null,'deferred',true,'reason','daily_decision_limit');end if;
  v_mode:=case when v_event.source_kind='post' and v_event.author_id=v_config.founder_id then 'founder_post' when v_event.author_id=any(v_config.review_author_ids) then 'review_author' else 'general' end;
  if v_mode='founder_post' then
   insert into public.review_public_likes(post_id,user_id) values(v_event.post_id,v_bot) on conflict(post_id,user_id) do nothing;
  end if;
  -- If the explicit route already reserved this question, do not spend another
  -- model call. Founder post engagement is still liked exactly once above.
  select * into v_job from public.quote_assistant_jobs where owner_id=v_event.author_id and kind='reply' and post_id=v_event.post_id and auto_publish
   and reply_to_kind is not distinct from case when v_event.source_kind<>'post' then v_event.source_kind end
   and reply_to_id is not distinct from case when v_event.source_kind<>'post' then v_event.source_id end order by created_at limit 1;
  if found and not(v_job.id=v_event.job_id and v_job.status='cancelled' and v_job.error_code='PARTICIPATION_DISCUSSION_CHANGED' and v_job.result_comment_id is null and v_job.result_post_id is null
   and v_event.source_fingerprint=public.quote_assistant_proactive_source_fingerprint(v_event.post_id,v_event.source_kind,v_event.source_id)) then
   update public.quote_assistant_proactive_events set status=case when v_job.status='published' then 'published' else 'queued' end,job_id=v_job.id,decision_reason='EXISTING_INVOCATION',updated_at=clock_timestamp() where id=v_event.id;
   return jsonb_build_object('event',null,'status','deduplicated');
  end if;
  update public.quote_assistant_proactive_events set mode=v_mode,status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '180 seconds',
   source_fingerprint=public.quote_assistant_proactive_source_fingerprint(post_id,source_kind,source_id),discussion_fingerprint=public.quote_assistant_proactive_discussion(post_id),updated_at=clock_timestamp() where id=v_event.id returning * into v_event;
  update public.quote_assistant_proactive_daily_usage set decisions=decisions+1 where day=v_day;
  select * into v_post from public.review_public_posts where id=v_event.post_id;
  for v_node in select kind,id from public.review_comment_nodes(v_event.post_id) where not deleted order by created_at desc,kind,id limit 40 loop
   v_comments:=v_comments||jsonb_build_array(public.quote_assistant_proactive_source(v_event.post_id,v_node.kind,v_node.id));
  end loop;
  for v_node in select kind,id from public.review_comment_nodes(v_event.post_id) where not deleted and author_id=v_bot order by created_at desc,kind,id limit 20 loop
   v_recent:=v_recent||jsonb_build_array(public.quote_assistant_proactive_source(v_event.post_id,v_node.kind,v_node.id));
  end loop;
  return jsonb_build_object('event',jsonb_build_object('id',v_event.id,'postId',v_event.post_id,'sourceKind',v_event.source_kind,'sourceId',v_event.source_id,'authorId',v_event.author_id,'mode',v_mode,'attempts',v_event.attempts),
   'leaseToken',v_event.lease_token,'context',jsonb_build_object('post',public.quote_assistant_public_post(v_post)||jsonb_build_object('hasImages',jsonb_array_length(v_post.images)>0),'invocation',v_source,'comments',v_comments,'recentAssistantReplies',v_recent,
    'mode',v_mode,'assistant',jsonb_build_object('authorId',v_bot,'nickname','Quote','isAssistant',true)));
 end if;
 if v_event.status<>'running' or v_token is null or v_token is distinct from v_event.lease_token or v_event.lease_expires_at<=clock_timestamp() then raise exception 'participation lease expired' using errcode='40001';end if;
 if p_action='fail' then
  v_reason:=p_payload->>'errorCode';if v_reason is null or v_reason !~ '^[A-Z][A-Z0-9_]{0,63}$' then v_reason:='ASSISTANT_FAILED';end if;
  update public.quote_assistant_proactive_events set status=case when attempts<3 and v_reason in ('ASSISTANT_TIMEOUT','ASSISTANT_RATE_LIMITED','ASSISTANT_PARTICIPATION_UNAVAILABLE','ASSISTANT_PROVIDER_FAILED') then 'waiting' else 'failed' end,
   due_at=clock_timestamp()+interval '60 seconds',decision_reason=v_reason,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id returning * into v_event;
  return jsonb_build_object('status',v_event.status);
 end if;
 if p_action<>'decision' then raise exception 'unsupported participation action' using errcode='22023';end if;
 v_decision:=p_payload->>'decision';v_reason:=btrim(p_payload->>'reason');v_question:=lower(btrim(p_payload->>'questionKey'));
 if v_decision not in ('reply','skip','wait') or v_decision is null or length(coalesce(v_reason,'')) not between 1 and 1000 or length(coalesce(v_question,''))>240 then raise exception 'invalid participation decision' using errcode='22023';end if;
 if public.quote_assistant_proactive_source_fingerprint(v_event.post_id,v_event.source_kind,v_event.source_id) is distinct from v_event.source_fingerprint or public.quote_assistant_proactive_discussion(v_event.post_id) is distinct from v_event.discussion_fingerprint then
  update public.quote_assistant_proactive_events set status=case when attempts<3 then 'waiting' else 'failed' end,due_at=clock_timestamp()+interval '60 seconds',decision_reason=case when attempts<3 then 'DISCUSSION_CHANGED' else 'DISCUSSION_CHANGED_RETRY_LIMIT' end,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('status',case when v_event.attempts<3 then 'deferred' else 'failed' end,'reason',case when v_event.attempts<3 then 'discussion_changed' else 'discussion_changed_retry_limit' end);
 end if;
 if v_event.mode='founder_post' then v_decision:='reply';end if;
 if v_decision='wait' then
  update public.quote_assistant_proactive_events set status=case when wait_count<2 and attempts<3 then 'waiting' else 'skipped' end,
   due_at=clock_timestamp()+interval '60 seconds',wait_count=least(2,wait_count+1),decision_reason=v_reason,question_key=coalesce(v_question,''),lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id returning * into v_event;
  return jsonb_build_object('status',v_event.status);
 end if;
 if v_decision='skip' then
  update public.quote_assistant_proactive_events set status='skipped',decision_reason=v_reason,question_key=coalesce(v_question,''),lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('status','skipped');
 end if;
 if length(coalesce(v_question,''))=0 then raise exception 'reply question key required' using errcode='22023';end if;
 select * into v_job from public.quote_assistant_jobs where owner_id=v_event.author_id and kind='reply' and post_id=v_event.post_id and auto_publish
  and reply_to_kind is not distinct from case when v_event.source_kind<>'post' then v_event.source_kind end
  and reply_to_id is not distinct from case when v_event.source_kind<>'post' then v_event.source_id end order by created_at limit 1;
 if found then
  v_retry:=v_job.id=v_event.job_id and v_job.status='cancelled' and v_job.error_code='PARTICIPATION_DISCUSSION_CHANGED' and v_job.result_comment_id is null and v_job.result_post_id is null;
 end if;
 if found and not v_retry then
  update public.quote_assistant_proactive_events set status=case when v_job.status='published' then 'published' else 'queued' end,job_id=v_job.id,decision_reason='EXISTING_INVOCATION',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('status','deduplicated','job',public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id));
 end if;
 if v_event.mode<>'founder_post' and exists(select 1 from public.quote_assistant_proactive_events where post_id=v_event.post_id and id<>v_event.id and question_key=v_question and status in ('queued','published')) then
  update public.quote_assistant_proactive_events set status='skipped',decision_reason='DUPLICATE_QUESTION',question_key=v_question,lease_token=null,lease_expires_at=null where id=v_event.id;
  return jsonb_build_object('status','skipped','reason','duplicate_question');
 end if;
 insert into public.quote_assistant_proactive_daily_usage(day) values(v_day) on conflict do nothing;
 select * into v_usage from public.quote_assistant_proactive_daily_usage where day=v_day for update;
 if v_usage.replies>=v_config.daily_reply_limit or (select count(*) from public.quote_assistant_proactive_events where post_id=v_event.post_id and id<>v_event.id and job_id is not null and updated_at>=v_day::timestamp at time zone 'UTC')>=v_config.thread_reply_limit then
  v_next_day:=(v_day+1)::timestamp at time zone 'UTC';
  update public.quote_assistant_proactive_events set status='waiting',due_at=v_next_day,attempts=greatest(0,attempts-1),decision_reason='REPLY_BUDGET',lease_token=null,lease_expires_at=null where id=v_event.id;
  return jsonb_build_object('status','deferred','reason','reply_budget');
 end if;
 if v_retry then
  v_job_id:=v_job.id;
  delete from public.quote_assistant_sources where job_id=v_job_id;
  delete from public.quote_assistant_comment_sources where job_id=v_job_id;
  update public.quote_assistant_jobs set status='pending',text='',error_code=null,attempts=0,lease_token=null,lease_expires_at=null,revision=revision+1,updated_at=clock_timestamp(),
   request_payload=jsonb_build_object('proactiveEventId',v_event.id,'mode',v_event.mode,'reason',v_reason,'questionKey',v_question) where id=v_job_id returning * into v_job;
 else
  v_job_id:=gen_random_uuid();
  insert into public.quote_assistant_sessions(id,owner_id,kind,post_id) values(v_job_id,v_event.author_id,'reply',v_event.post_id);
  insert into public.quote_assistant_jobs(id,owner_id,session_id,kind,prompt,post_id,reply_to_kind,reply_to_id,auto_publish,request_payload)
  values(v_job_id,v_event.author_id,v_job_id,'reply','',v_event.post_id,case when v_event.source_kind<>'post' then v_event.source_kind end,
   case when v_event.source_kind<>'post' then v_event.source_id end,true,
   jsonb_build_object('proactiveEventId',v_event.id,'mode',v_event.mode,'reason',v_reason,'questionKey',v_question)) returning * into v_job;
 end if;
 perform public.quote_assistant_add_source(v_job,v_event.post_id,'public');
 update public.quote_assistant_proactive_events set status='queued',job_id=v_job_id,decision_reason=v_reason,question_key=v_question,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id;
 update public.quote_assistant_proactive_daily_usage set replies=replies+1 where day=v_day;
 return jsonb_build_object('status','queued','job',public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id));
end;
$$;
revoke all on function public.quote_assistant_proactive(text,jsonb) from public,anon,authenticated;
grant execute on function public.quote_assistant_proactive(text,jsonb) to service_role;

-- A user may cancel while an internal discussion recheck is waiting. That
-- explicit cancellation must override the internal retry marker permanently.
create or replace function public.quote_assistant_revoke_job(p_id uuid,p_code text default 'SOURCE_CHANGED')
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_job public.quote_assistant_jobs;
begin
 select * into v_job from public.quote_assistant_jobs where id=p_id for update;
 if not found then return;end if;
 if v_job.status='cancelled' then
  if p_code='CANCELLED_BY_USER' and v_job.error_code='PARTICIPATION_DISCUSSION_CHANGED' then
   update public.quote_assistant_jobs set error_code=p_code,revision=revision+1,updated_at=clock_timestamp() where id=p_id;
   update public.quote_assistant_proactive_events set status='cancelled',decision_reason=p_code,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where job_id=p_id;
  end if;
  return;
 end if;
 update public.quote_assistant_jobs set status='cancelled',text='',error_code=p_code,lease_token=null,lease_expires_at=null,revision=revision+1,updated_at=clock_timestamp() where id=p_id;
 if p_code='CANCELLED_BY_USER' then
  update public.quote_assistant_proactive_events set status='cancelled',decision_reason=p_code,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where job_id=p_id;
 end if;
 if v_job.result_comment_id is not null then
  update public.review_community_evaluations set payload='{}'::jsonb,deleted_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=v_job.result_comment_id and deleted_at is null;
 elsif v_job.result_post_id is not null then
  update public.review_logs set review_data=jsonb_set(review_data,'{visibility}','"private"'::jsonb) where 'log:'||id::text=v_job.result_post_id and review_data->>'visibility'='public';
 end if;
end;
$$;
revoke all on function public.quote_assistant_revoke_job(uuid,text) from public,anon,authenticated;

-- Preserve the foundation implementation without widening its grants. The
-- wrapper only adds proactive publication guards and trusted context metadata.
do $$begin
 if to_regprocedure('public.quote_assistant_service_foundation_20261108(text,jsonb)') is null then
  alter function public.quote_assistant_service(text,jsonb) rename to quote_assistant_service_foundation_20261108;
 end if;
end$$;
revoke all on function public.quote_assistant_service_foundation_20261108(text,jsonb) from public,anon,authenticated,service_role;
create or replace function public.quote_assistant_service(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_event public.quote_assistant_proactive_events;v_config public.quote_assistant_proactive_config;v_job public.quote_assistant_jobs;v_result jsonb;v_meta jsonb;v_recheck boolean;
begin
 if p_action='participation-skip' then
  select * into v_job from public.quote_assistant_jobs where id=(p_payload->>'id')::uuid;
  if not found then raise exception 'assistant job unavailable' using errcode='P0002';end if;
  if v_job.post_id is not null then perform public.review_community_lock_parent(v_job.post_id);end if;
  select * into v_job from public.quote_assistant_jobs where id=v_job.id for update;
  if v_job.kind<>'reply' or not v_job.auto_publish or v_job.status<>'running' or v_job.lease_token is null
   or v_job.lease_token::text is distinct from p_payload->>'leaseToken' or v_job.lease_expires_at<=clock_timestamp()
   or length(btrim(coalesce(p_payload->>'reason',''))) not between 1 and 1000 then
   raise exception 'participation skip requires an active reply lease' using errcode='40001';end if;
  if not(v_job.request_payload ? 'proactiveEventId') and not(v_job.reply_to_kind='community' and exists(
   select 1 from public.review_community_evaluations e where e.id::text=v_job.reply_to_id and e.post_id=v_job.post_id
    and e.author_id=v_job.owner_id and e.deleted_at is null
    and e.reply_to_author_id=(select author_id from public.quote_assistant_identity)
    and lower(coalesce(e.payload->>'text','')) !~ '@quote([^a-z0-9_]|$)')) then
   raise exception 'explicit invocation cannot be skipped' using errcode='42501';end if;
  perform public.quote_assistant_revoke_job(v_job.id,'NO_REPLY_NEEDED');
  update public.quote_assistant_jobs set request_payload=request_payload||jsonb_build_object('participationSkipReason',btrim(p_payload->>'reason')) where id=v_job.id returning * into v_job;
  update public.quote_assistant_proactive_events set status='skipped',decision_reason=btrim(p_payload->>'reason'),updated_at=clock_timestamp() where job_id=v_job.id;
  return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id);
 end if;
 if p_action in ('claim','context','complete','publish') and p_payload->>'id' is not null then
  select * into v_event from public.quote_assistant_proactive_events where job_id=(p_payload->>'id')::uuid;
  -- Explicit invocations may be recorded as deduplicated events, but are not
  -- governed by the proactive switch or its extra publication restrictions.
  if found and exists(select 1 from public.quote_assistant_jobs where id=v_event.job_id and request_payload ? 'proactiveEventId') then
   perform public.review_community_lock_parent(v_event.post_id);
   perform pg_advisory_xact_lock(714294,1);
   select * into v_config from public.quote_assistant_proactive_config where singleton;
   select * into v_job from public.quote_assistant_jobs where id=v_event.job_id;
   if v_job.status in ('pending','running','draft') and (not v_config.enabled or v_event.created_at<v_config.enabled_at
    or public.quote_assistant_proactive_source(v_event.post_id,v_event.source_kind,v_event.source_id) is null
    or public.quote_assistant_proactive_source_fingerprint(v_event.post_id,v_event.source_kind,v_event.source_id) is distinct from v_event.source_fingerprint
    or public.quote_assistant_proactive_discussion(v_event.post_id) is distinct from v_event.discussion_fingerprint) then
    v_recheck:=v_config.enabled and v_event.created_at>=v_config.enabled_at and v_job.status in ('pending','running','draft')
     and v_job.result_comment_id is null and v_job.result_post_id is null
     and public.quote_assistant_proactive_source_fingerprint(v_event.post_id,v_event.source_kind,v_event.source_id)=v_event.source_fingerprint;
    perform public.quote_assistant_revoke_job(v_job.id,case when v_recheck then 'PARTICIPATION_DISCUSSION_CHANGED' else 'PARTICIPATION_CHANGED' end);
    update public.quote_assistant_proactive_events set status=case when v_recheck and attempts<3 then 'waiting' when v_recheck then 'failed' else 'cancelled' end,
     due_at=clock_timestamp()+interval '60 seconds',decision_reason=case when v_recheck then 'DISCUSSION_CHANGED' else 'PARTICIPATION_CHANGED' end,
     lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id;
    select * into v_job from public.quote_assistant_jobs where id=v_job.id;
    if p_action='claim' then return jsonb_build_object('job',public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id),'leaseToken',null);end if;
    if p_action='context' then return jsonb_build_object('job',public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id),'post',null,'comments','[]'::jsonb,'publicPosts','[]'::jsonb,'history','[]'::jsonb,'memories','[]'::jsonb);end if;
    return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id);
   end if;
  else v_event:=null;end if;
 end if;
 v_result:=public.quote_assistant_service_foundation_20261108(p_action,p_payload);
 if v_event.id is not null then
  if p_action='context' then
   -- Proactive generation answers this thread only. The foundation's optional
   -- cross-post search material is not supplied or retained as a dependency.
   delete from public.quote_assistant_sources where job_id=v_event.job_id and post_id<>v_event.post_id;
   v_result:=v_result||jsonb_build_object('publicPosts','[]'::jsonb,'history','[]'::jsonb,
    'post',(v_result->'post')||jsonb_build_object('hasImages',coalesce((select jsonb_array_length(images)>0 from public.review_public_posts where id=v_event.post_id),false)));
   v_meta:=jsonb_build_object('mode',v_event.mode,'reason',v_event.decision_reason,'questionKey',v_event.question_key);
   v_result:=v_result||jsonb_build_object('proactive',v_meta,'job',(v_result->'job')||jsonb_build_object('proactive',v_meta));
  elsif p_action='publish' and v_result->>'status'='published' then
   update public.quote_assistant_proactive_events set status='published',updated_at=clock_timestamp() where id=v_event.id;
  end if;
 end if;
 return v_result;
end;
$$;
revoke all on function public.quote_assistant_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.quote_assistant_service(text,jsonb) to service_role;
commit;
