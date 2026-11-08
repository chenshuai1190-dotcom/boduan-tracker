-- Additive Quote AI workspace, explicit memory and guarded publication.
-- Apply after review_thread_preview_reply_20261108.sql. No historical posts are
-- made public, no ledger is read or changed, no Auth user is fabricated here.
begin;

create table if not exists public.quote_assistant_identity (
 singleton boolean primary key default true check(singleton),
 author_id uuid not null unique references auth.users(id),
 created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.quote_assistant_preferences (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 memory_enabled boolean not null default true,memory_epoch bigint not null default 0 check(memory_epoch>=0)
);
alter table public.quote_assistant_preferences enable row level security;
revoke all on public.quote_assistant_preferences from public,anon,authenticated;
create table if not exists public.quote_assistant_memories (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 text text not null check(length(btrim(text)) between 1 and 1000),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index if not exists quote_assistant_memories_owner_idx on public.quote_assistant_memories(owner_id,updated_at desc);
create table if not exists public.quote_assistant_sessions (
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('chat','reply','daily-review','followup','weekly-digest','milestone')),
 post_id text,created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.quote_assistant_subscriptions (
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('daily-review','weekly-digest')),
 recurrence text not null check(recurrence in ('daily','weekly')),
 prompt text not null default '',due_at timestamptz not null,active boolean not null default true,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default clock_timestamp(),
 check((kind='daily-review' and recurrence='daily') or (kind='weekly-digest' and recurrence='weekly'))
);
create table if not exists public.quote_assistant_jobs (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references public.quote_assistant_sessions(id) on delete cascade,
 subscription_id uuid references public.quote_assistant_subscriptions(id) on delete set null,recurrence text,
 kind text not null check(kind in ('chat','reply','daily-review','followup','weekly-digest','milestone')),
 prompt text not null default '' check(length(prompt)<=6000),
 post_id text,reply_to_kind text,reply_to_id text,due_at timestamptz,
 record_date date,range_start date,range_end date,auto_publish boolean not null default false,
 request_payload jsonb not null check(jsonb_typeof(request_payload)='object'),
 status text not null default 'pending' check(status in ('pending','running','draft','published','failed','cancelled')),
 revision integer not null default 1 check(revision>0),attempts integer not null default 0 check(attempts between 0 and 3),
 lease_token uuid,lease_expires_at timestamptz,
 text text not null default '' check(length(text)<=12000),error_code text,
 result_post_id text,result_comment_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((reply_to_kind is null and reply_to_id is null) or (reply_to_kind in ('author','community') and reply_to_id is not null)),
 check(kind<>'chat' or (post_id is null and not auto_publish and result_post_id is null and result_comment_id is null))
);
create unique index if not exists quote_assistant_jobs_occurrence_idx on public.quote_assistant_jobs(subscription_id,due_at) where subscription_id is not null;
create index if not exists quote_assistant_jobs_owner_idx on public.quote_assistant_jobs(owner_id,created_at desc,id desc);
create index if not exists quote_assistant_jobs_due_idx on public.quote_assistant_jobs(status,due_at,lease_expires_at) where status in ('pending','running');
create table if not exists public.quote_assistant_sources (
 job_id uuid not null references public.quote_assistant_jobs(id) on delete cascade,
 post_id text not null,scope text not null check(scope in ('public','milestone')),
 fingerprint text not null,title text not null,date date not null,
 primary key(job_id,post_id)
);
create index if not exists quote_assistant_sources_post_idx on public.quote_assistant_sources(post_id);

alter table public.quote_assistant_identity enable row level security;
alter table public.quote_assistant_memories enable row level security;
alter table public.quote_assistant_sessions enable row level security;
alter table public.quote_assistant_jobs enable row level security;
alter table public.quote_assistant_sources enable row level security;
alter table public.quote_assistant_subscriptions enable row level security;
revoke all on public.quote_assistant_subscriptions from public,anon,authenticated;
revoke all on public.quote_assistant_identity,public.quote_assistant_memories,public.quote_assistant_sessions,public.quote_assistant_jobs,public.quote_assistant_sources from public,anon,authenticated;

create or replace function public.quote_assistant_author_id()
returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
 select author_id from public.quote_assistant_identity where auth.uid() is not null;
$$;
revoke all on function public.quote_assistant_author_id() from public,anon;
grant execute on function public.quote_assistant_author_id() to authenticated;

create or replace function public.quote_assistant_fingerprint(p_post_id text,p_scope text,p_owner uuid)
returns text language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_event jsonb;
begin
 if p_scope='public' then
  return (select md5(jsonb_build_array(author_id,text,record_date,stocks,images,market,published_at)::text)
   from public.review_public_posts where id=p_post_id);
 end if;
 if p_scope<>'milestone' or left(p_post_id,4)<>'log:' then return null; end if;
 select review_data->'timelineEvent' into v_event from public.review_logs where id::text=substring(p_post_id from 5) and user_id=p_owner;
 if jsonb_typeof(v_event) is distinct from 'object' or v_event->>'version' is distinct from '1'
  or coalesce(v_event->>'kind','') not in ('high','low','drawdown','record','period')
  or coalesce(v_event->>'metric','') not in ('net_assets','cumulative_return','cumulative_pnl','annual_return','annual_pnl','daily_return','period_return')
  or not public.review_public_valid_date(v_event->>'date')
  or coalesce(v_event->>'id','') !~ '^[a-zA-Z0-9_:\-.]{1,160}$'
  or length(coalesce(v_event->>'title','')) not between 1 and 120 then return null; end if;
 return md5(jsonb_build_array(v_event->>'id',v_event->>'kind',v_event->>'metric',v_event->>'date',v_event->>'title')::text);
end;
$$;
revoke all on function public.quote_assistant_fingerprint(text,text,uuid) from public,anon,authenticated;

create or replace function public.quote_assistant_job_json(p_job public.quote_assistant_jobs)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_job.id,'kind',p_job.kind,'status',p_job.status,'prompt',p_job.prompt,
 'sessionId',p_job.session_id,'subscriptionId',p_job.subscription_id,'recurrence',p_job.recurrence,'postId',p_job.post_id,'replyTo',case when p_job.reply_to_kind is not null then jsonb_build_object('kind',p_job.reply_to_kind,'id',p_job.reply_to_id) end,
 'dueAt',p_job.due_at,'date',p_job.record_date,'rangeStart',p_job.range_start,'rangeEnd',p_job.range_end,
 'text',p_job.text,'revision',p_job.revision,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at,
 'autoPublish',p_job.auto_publish,'errorCode',p_job.error_code,
 'sources',coalesce((select jsonb_agg(jsonb_build_object('postId',s.post_id,'title',s.title,'date',s.date,'scope',s.scope) order by s.post_id) from public.quote_assistant_sources s where s.job_id=p_job.id and p_job.status<>'cancelled'),'[]'::jsonb),
 'postRef',case when p_job.result_post_id is not null then jsonb_build_object('postId',p_job.result_post_id,'commentId',p_job.result_comment_id) end,
 'canPublish',p_job.status='draft' and p_job.kind<>'chat');
$$;
revoke all on function public.quote_assistant_job_json(public.quote_assistant_jobs) from public,anon,authenticated;

create or replace function public.quote_assistant_revoke_job(p_id uuid,p_code text default 'SOURCE_CHANGED')
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_job public.quote_assistant_jobs;
begin
 select * into v_job from public.quote_assistant_jobs where id=p_id for update;
 if not found or v_job.status='cancelled' then return; end if;
 update public.quote_assistant_jobs set status='cancelled',text='',error_code=p_code,
  lease_token=null,lease_expires_at=null,revision=revision+1,updated_at=clock_timestamp() where id=p_id;
 if v_job.result_comment_id is not null then
  update public.review_community_evaluations set payload='{}'::jsonb,deleted_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
   where id=v_job.result_comment_id and deleted_at is null;
 elsif v_job.result_post_id is not null then
  update public.review_logs set review_data=jsonb_set(review_data,'{visibility}','"private"'::jsonb)
   where 'log:'||id::text=v_job.result_post_id and review_data->>'visibility'='public';
 end if;
end;
$$;
revoke all on function public.quote_assistant_revoke_job(uuid,text) from public,anon,authenticated;

create or replace function public.quote_assistant_source_changed()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_post text;v_job record;
begin
 if TG_TABLE_NAME='review_public_posts' then v_post:=old.id;
 elsif TG_TABLE_NAME='review_logs' then
  if TG_OP='UPDATE' and old.review_data->'timelineEvent' is not distinct from new.review_data->'timelineEvent' then return new; end if;
  v_post:='log:'||old.id::text;
 else raise exception 'unsupported assistant source' using errcode='42501'; end if;
 for v_job in select j.id from public.quote_assistant_jobs j join public.quote_assistant_sources s on s.job_id=j.id
  where s.post_id=v_post and j.status<>'cancelled'
   and (public.quote_assistant_fingerprint(s.post_id,s.scope,j.owner_id) is distinct from s.fingerprint
    or not public.quote_assistant_sources_valid(j))
  order by j.id loop
  perform public.quote_assistant_revoke_job(v_job.id,'SOURCE_CHANGED');
 end loop;
 return case when TG_OP='DELETE' then old else new end;
end;
$$;
revoke all on function public.quote_assistant_source_changed() from public,anon,authenticated;
drop trigger if exists quote_assistant_public_source_changed on public.review_public_posts;
create trigger quote_assistant_public_source_changed after update or delete on public.review_public_posts for each row execute function public.quote_assistant_source_changed();
drop trigger if exists quote_assistant_milestone_source_changed on public.review_logs;
create trigger quote_assistant_milestone_source_changed after update or delete on public.review_logs for each row execute function public.quote_assistant_source_changed();

create or replace function public.quote_assistant_add_source(p_job public.quote_assistant_jobs,p_post text,p_scope text)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_fingerprint text;v_title text;v_date date;
begin
 v_fingerprint:=public.quote_assistant_fingerprint(p_post,p_scope,p_job.owner_id);
 if v_fingerprint is null then raise exception 'assistant source unavailable' using errcode='P0002'; end if;
 if p_scope='public' then select left(text,120),record_date into v_title,v_date from public.review_public_posts where id=p_post;
 else select review_data->'timelineEvent'->>'title',(review_data->'timelineEvent'->>'date')::date into v_title,v_date from public.review_logs where 'log:'||id::text=p_post and user_id=p_job.owner_id; end if;
 insert into public.quote_assistant_sources(job_id,post_id,scope,fingerprint,title,date) values(p_job.id,p_post,p_scope,v_fingerprint,v_title,v_date)
  on conflict(job_id,post_id) do nothing;
end;
$$;
revoke all on function public.quote_assistant_add_source(public.quote_assistant_jobs,text,text) from public,anon,authenticated;

create or replace function public.quote_assistant_public_post(p_post public.review_public_posts)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_post.id,'text',left(p_post.text,12000),'date',p_post.record_date,'publishedAt',p_post.published_at,'authorId',p_post.author_id,
  'author',jsonb_build_object('nickname',coalesce((select nickname from public.community_profiles where user_id=p_post.author_id),'Quote 用户')),
  'stocks',p_post.stocks,'market',p_post.market);
$$;
revoke all on function public.quote_assistant_public_post(public.review_public_posts) from public,anon,authenticated;

create or replace function public.quote_assistant_user(p_action text,p_payload jsonb default '{}'::jsonb,p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_id uuid;v_session uuid;v_session_row public.quote_assistant_sessions;
 v_bot uuid;v_job public.quote_assistant_jobs;v_memory public.quote_assistant_memories;v_kind text;v_prompt text;v_post text;v_reply_kind text;v_reply_id text;
 v_parent record;v_target uuid;v_comment jsonb;v_due timestamptz;v_date date;v_start date;v_end date;v_auto boolean:=false;v_request jsonb;
 v_jobs jsonb;v_memories jsonb;v_posts jsonb;v_milestones jsonb;v_revision integer;v_text text;v_recurrence text;v_subscription public.quote_assistant_subscriptions;
begin
 if v_user is null or v_user is distinct from p_expected_user_id then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>20000 then raise exception 'invalid assistant payload' using errcode='22023'; end if;
 select author_id into v_bot from public.quote_assistant_identity;
 if v_user=v_bot then raise exception 'assistant cannot trigger itself' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,714293));
 insert into public.quote_assistant_preferences(owner_id) values(v_user) on conflict(owner_id) do nothing;
 if p_action='memory-preferences' then
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'invalid memory preference' using errcode='22023'; end if;
  update public.quote_assistant_preferences set memory_enabled=(p_payload->>'enabled')::boolean,memory_epoch=memory_epoch+1 where owner_id=v_user;
  return (select jsonb_build_object('enabled',memory_enabled,'memoryEpoch',memory_epoch) from public.quote_assistant_preferences where owner_id=v_user);
 end if;
 if p_action='state' then
  select coalesce(jsonb_agg(public.quote_assistant_job_json(j) order by j.created_at desc,j.id desc),'[]'::jsonb) into v_jobs
   from (select * from public.quote_assistant_jobs where owner_id=v_user order by created_at desc,id desc limit 50) j;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',text,'revision',revision,'createdAt',created_at,'updatedAt',updated_at) order by updated_at desc),'[]'::jsonb)
   into v_memories from public.quote_assistant_memories where owner_id=v_user;
  select coalesce(jsonb_agg(public.quote_assistant_public_post(p) order by p.published_at desc,p.id desc),'[]'::jsonb) into v_posts
   from (select * from public.review_public_posts order by published_at desc,id desc limit 30) p;
  select coalesce(jsonb_agg(jsonb_build_object('postId','log:'||id::text,'title',review_data->'timelineEvent'->>'title','date',review_data->'timelineEvent'->>'date',
   'event',jsonb_build_object('version',1,'id',review_data->'timelineEvent'->>'id','kind',review_data->'timelineEvent'->>'kind','metric',review_data->'timelineEvent'->>'metric',
   'date',review_data->'timelineEvent'->>'date','title',review_data->'timelineEvent'->>'title')) order by created_at desc),'[]'::jsonb) into v_milestones
   from (select * from public.review_logs where user_id=v_user and public.quote_assistant_fingerprint('log:'||id::text,'milestone',v_user) is not null order by created_at desc limit 30) t;
  return jsonb_build_object('assistant',case when v_bot is not null then jsonb_build_object('authorId',v_bot,'nickname','Quote','isAssistant',true) end,
   'memoryEnabled',(select memory_enabled from public.quote_assistant_preferences where owner_id=v_user),'memories',v_memories,'jobs',v_jobs,'posts',v_posts,'milestones',v_milestones,
   'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'recurrence',recurrence,'dueAt',due_at,'active',active,'revision',revision) order by created_at desc) from public.quote_assistant_subscriptions where owner_id=v_user),'[]'::jsonb));
 end if;
 begin v_id:=(p_payload->>'id')::uuid; exception when invalid_text_representation then raise exception 'invalid assistant identifier' using errcode='22023'; end;
 if v_id is null then raise exception 'assistant identifier required' using errcode='22023'; end if;
 if p_action='cancel-subscription' then
  select * into v_subscription from public.quote_assistant_subscriptions where id=v_id and owner_id=v_user for update;
  if not found then raise exception 'subscription unavailable' using errcode='P0002'; end if;
  if p_payload->>'revision' is distinct from v_subscription.revision::text then raise exception 'subscription changed' using errcode='40001'; end if;
  update public.quote_assistant_subscriptions set active=false,revision=revision+1 where id=v_id;
  update public.quote_assistant_jobs set status='cancelled',error_code='SUBSCRIPTION_CANCELLED',lease_token=null,lease_expires_at=null,revision=revision+1,updated_at=clock_timestamp()
   where subscription_id=v_id and status in ('pending','running');
  return jsonb_build_object('id',v_id,'active',false,'revision',v_subscription.revision+1);
 end if;
 if p_action in ('save-memory','delete-memory') then
  begin v_revision:=(p_payload->>'revision')::integer; exception when others then raise exception 'invalid memory revision' using errcode='22023'; end;
  if v_revision is null or v_revision<0 or v_revision>=2147483647 then raise exception 'invalid memory revision' using errcode='22023'; end if;
  select * into v_memory from public.quote_assistant_memories where id=v_id for update;
  if found and v_memory.owner_id<>v_user then raise exception 'memory belongs to another user' using errcode='42501'; end if;
  if p_action='delete-memory' then
   if v_memory.id is null then return jsonb_build_object('deleted',true,'id',v_id); end if;
   if v_memory.revision<>v_revision then raise exception 'memory changed' using errcode='40001'; end if;
   delete from public.quote_assistant_memories where id=v_id and owner_id=v_user;
   update public.quote_assistant_preferences set memory_epoch=memory_epoch+1 where owner_id=v_user;
   return jsonb_build_object('deleted',true,'id',v_id);
  end if;
  v_text:=btrim(p_payload->>'text');
  if jsonb_typeof(p_payload->'text') is distinct from 'string' or length(v_text) not between 1 and 1000 then raise exception 'invalid memory text' using errcode='22023'; end if;
  if v_memory.id is null then
   if v_revision<>0 then raise exception 'memory unavailable' using errcode='P0002'; end if;
   if (select count(*) from public.quote_assistant_memories where owner_id=v_user)>=50 then raise exception 'memory limit reached' using errcode='54000'; end if;
   insert into public.quote_assistant_memories(id,owner_id,text) values(v_id,v_user,v_text) returning * into v_memory;
  elsif v_memory.revision<>v_revision then
   if not(v_memory.revision=v_revision+1 and v_memory.text=v_text) then raise exception 'memory changed' using errcode='40001'; end if;
  elsif v_memory.text<>v_text then
   update public.quote_assistant_memories set text=v_text,revision=revision+1,updated_at=clock_timestamp() where id=v_id returning * into v_memory;
  end if;
  update public.quote_assistant_preferences set memory_epoch=memory_epoch+1 where owner_id=v_user;
  return jsonb_build_object('id',v_memory.id,'text',v_memory.text,'revision',v_memory.revision,'createdAt',v_memory.created_at,'updatedAt',v_memory.updated_at);
 end if;
 if p_action in ('cancel','retry') then
  select * into v_job from public.quote_assistant_jobs where id=v_id for update;
  if not found or v_job.owner_id<>v_user then raise exception 'assistant job unavailable' using errcode='P0002'; end if;
  if p_payload->>'revision' is null or p_payload->>'revision'<>v_job.revision::text then raise exception 'assistant job changed' using errcode='40001'; end if;
  if p_action='cancel' then perform public.quote_assistant_revoke_job(v_id,'CANCELLED_BY_USER');
  else
   if v_job.status<>'failed' or v_job.attempts>=3 then raise exception 'assistant job cannot retry' using errcode='22023'; end if;
   if (select count(*) from public.quote_assistant_jobs where owner_id=v_user and status in ('pending','running'))>=20 then raise exception 'active assistant limit reached' using errcode='54000'; end if;
   update public.quote_assistant_jobs set status='pending',error_code=null,lease_token=null,lease_expires_at=null,revision=revision+1,updated_at=clock_timestamp() where id=v_id;
  end if;
  select * into v_job from public.quote_assistant_jobs where id=v_id;
  return public.quote_assistant_job_json(v_job);
 end if;
 if p_action<>'create' then raise exception 'unsupported assistant action' using errcode='22023'; end if;
 v_recurrence:=nullif(p_payload->>'recurrence','');
 v_kind:=p_payload->>'kind';v_prompt:=coalesce(p_payload->>'prompt','');v_post:=nullif(p_payload->>'postId','');
 if v_kind not in ('chat','reply','daily-review','followup','weekly-digest','milestone') or v_kind is null
  or length(v_prompt)>6000 or (v_kind='chat' and length(btrim(v_prompt))=0)
  or (v_post is not null and v_post !~ '^(log|insight):[A-Za-z0-9_-]{1,100}$') then raise exception 'invalid assistant request' using errcode='22023'; end if;
 begin
  v_session:=coalesce((p_payload->>'sessionId')::uuid,v_id);
  v_due:=(p_payload->>'dueAt')::timestamptz;v_date:=(p_payload->>'date')::date;v_start:=(p_payload->>'rangeStart')::date;v_end:=(p_payload->>'rangeEnd')::date;
 exception when others then raise exception 'invalid assistant date or session' using errcode='22023'; end;
 if (v_date is not null and (not isfinite(v_date) or v_date>current_date))
  or (v_start is not null and not isfinite(v_start)) or (v_end is not null and not isfinite(v_end))
  or (v_due is not null and not isfinite(v_due)) then raise exception 'invalid assistant date' using errcode='22023'; end if;
 if v_kind='chat' and v_post is not null then raise exception 'private chat cannot bind a public post' using errcode='22023'; end if;
 if v_kind in ('reply','followup','milestone') and v_post is null then raise exception 'source post required' using errcode='22023'; end if;
 if v_kind not in ('reply','followup','milestone') and v_post is not null then raise exception 'unexpected source post' using errcode='22023'; end if;
 if v_kind='weekly-digest' and (v_start is null or v_end is null or v_end<v_start or v_end-v_start>30 or v_end>current_date) then raise exception 'invalid weekly range' using errcode='22023'; end if;
 if v_kind='daily-review' and v_date is null then raise exception 'review date required' using errcode='22023'; end if;
 if v_recurrence is not null and not ((v_kind='daily-review' and v_recurrence='daily') or (v_kind='weekly-digest' and v_recurrence='weekly')) then raise exception 'invalid recurrence' using errcode='22023'; end if;
 if v_kind<>'followup' and v_due is not null and v_recurrence is null then raise exception 'unexpected schedule' using errcode='22023'; end if;
 if p_payload->'replyTo' is not null and p_payload->'replyTo'<>'null'::jsonb then
  if v_kind<>'reply' or jsonb_typeof(p_payload->'replyTo') is distinct from 'object' or (p_payload->'replyTo')-array['kind','id']<>'{}'::jsonb then raise exception 'invalid reply target' using errcode='22023'; end if;
  v_reply_kind:=p_payload->'replyTo'->>'kind';v_reply_id:=p_payload->'replyTo'->>'id';
  if v_reply_kind not in ('author','community') or length(coalesce(v_reply_id,'')) not between 1 and 100 then raise exception 'invalid reply target' using errcode='22023'; end if;
 end if;
 v_request:=jsonb_build_object('kind',v_kind,'prompt',v_prompt,'sessionId',v_session,'postId',v_post,'replyTo',p_payload->'replyTo','dueAt',v_due,
  'date',v_date,'rangeStart',v_start,'rangeEnd',v_end,'recurrence',v_recurrence,'autoPublish',coalesce(p_payload->'autoPublish','false'::jsonb),'shareConfirmed',coalesce(p_payload->'shareConfirmed','false'::jsonb));
 select * into v_job from public.quote_assistant_jobs where id=v_id;
 if found then
  if v_job.owner_id<>v_user then raise exception 'assistant request belongs to another user' using errcode='42501'; end if;
  if v_job.request_payload<>v_request then raise exception 'assistant request identity reused' using errcode='40001'; end if;
  return public.quote_assistant_job_json(v_job);
 end if;
 if v_kind='followup' and (v_due is null or v_due<=clock_timestamp() or v_due>clock_timestamp()+interval '366 days') then raise exception 'followup must be in the future' using errcode='22023'; end if;
 if v_recurrence is not null and v_due is not null and (v_due<=clock_timestamp() or v_due>clock_timestamp()+interval '366 days') then raise exception 'invalid recurring due date' using errcode='22023'; end if;
 if v_kind<>'chat' and v_bot is null then raise exception 'assistant identity is not configured' using errcode='55000'; end if;
 if v_post is not null and v_kind<>'milestone' then
  select * into v_parent from public.review_community_lock_parent(v_post);
  if not found or not v_parent.parent_public then raise exception 'public source unavailable' using errcode='P0002'; end if;
  if v_kind='followup' and v_parent.parent_author_id<>v_user then raise exception 'followup requires own post' using errcode='42501'; end if;
  if v_reply_kind is not null then
   v_target:=public.review_community_reply_target(v_post,v_reply_kind,v_reply_id);
   if v_target is null then raise exception 'reply target unavailable' using errcode='P0002'; end if;
  end if;
 end if;
 if p_payload->'autoPublish'='true'::jsonb then
  if v_kind<>'reply' then raise exception 'automatic reply requires saved invocation' using errcode='42501'; end if;
  if v_reply_kind is null then
   if v_parent.parent_author_id<>v_user or not exists(select 1 from public.review_public_posts where id=v_post and position('@quote' in lower(text))>0) then
    raise exception 'automatic reply requires own saved invocation' using errcode='42501'; end if;
  else
   if v_target is distinct from v_user then raise exception 'automatic reply requires own saved comment' using errcode='42501'; end if;
   select payload into v_comment from public.review_comment_nodes(v_post) where kind=v_reply_kind and id=v_reply_id and not deleted;
   if position('@quote' in lower(coalesce(v_comment->>'text','')))=0
    and not(v_reply_kind='community' and v_bot is not null and exists(select 1 from public.review_community_evaluations where id::text=v_reply_id and reply_to_author_id=v_bot)) then
    raise exception 'comment does not invoke Quote' using errcode='22023'; end if;
  end if;
  v_auto:=true;
  select * into v_job from public.quote_assistant_jobs where owner_id=v_user and kind='reply' and post_id=v_post
   and reply_to_kind is not distinct from v_reply_kind and reply_to_id is not distinct from v_reply_id and auto_publish order by created_at limit 1;
  if found then return public.quote_assistant_job_json(v_job); end if;
 end if;
 if v_kind='followup' then
  if (select count(*) from public.quote_assistant_jobs where owner_id=v_user and kind='followup' and status in ('pending','running','draft'))>=10 then raise exception 'followup limit reached' using errcode='54000'; end if;
  v_auto:=true;
 end if;
 if v_kind='milestone' then
  if p_payload->'shareConfirmed' is distinct from 'true'::jsonb then raise exception 'explicit milestone sharing required' using errcode='42501'; end if;
  if public.quote_assistant_fingerprint(v_post,'milestone',v_user) is null then raise exception 'own timeline source unavailable' using errcode='P0002'; end if;
 end if;
 if (select count(*) from public.quote_assistant_jobs where owner_id=v_user and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')>=30 then raise exception 'daily assistant limit reached' using errcode='54000'; end if;
 if (select count(*) from public.quote_assistant_jobs where owner_id=v_user and status in ('pending','running'))>=20 then raise exception 'active assistant limit reached' using errcode='54000'; end if;
 select * into v_session_row from public.quote_assistant_sessions where id=v_session;
 if found then
  if v_session_row.owner_id<>v_user or v_session_row.kind<>v_kind or v_session_row.post_id is distinct from v_post then raise exception 'assistant session scope mismatch' using errcode='42501'; end if;
 else insert into public.quote_assistant_sessions(id,owner_id,kind,post_id) values(v_session,v_user,v_kind,v_post); end if;
 if v_recurrence is not null then
  if (select count(*) from public.quote_assistant_subscriptions where owner_id=v_user and active)>=5 then raise exception 'subscription limit reached' using errcode='54000'; end if;
  insert into public.quote_assistant_subscriptions(id,owner_id,kind,recurrence,prompt,due_at) values(v_id,v_user,v_kind,v_recurrence,v_prompt,coalesce(v_due,clock_timestamp()));
 end if;
 insert into public.quote_assistant_jobs(id,owner_id,session_id,subscription_id,recurrence,kind,prompt,post_id,reply_to_kind,reply_to_id,due_at,record_date,range_start,range_end,auto_publish,request_payload)
  values(v_id,v_user,v_session,case when v_recurrence is not null then v_id end,v_recurrence,v_kind,v_prompt,v_post,v_reply_kind,v_reply_id,v_due,v_date,v_start,v_end,v_auto,v_request) returning * into v_job;
 if v_post is not null then perform public.quote_assistant_add_source(v_job,v_post,case when v_kind='milestone' then 'milestone' else 'public' end); end if;
 return public.quote_assistant_job_json(v_job);
end;
$$;
revoke all on function public.quote_assistant_user(text,jsonb,uuid) from public,anon;
grant execute on function public.quote_assistant_user(text,jsonb,uuid) to authenticated;

create table if not exists public.quote_assistant_comment_sources (
 job_id uuid not null references public.quote_assistant_jobs(id) on delete cascade,
 post_id text not null,kind text not null check(kind in ('author','community')),comment_id text not null,fingerprint text not null,
 primary key(job_id,kind,comment_id)
);
alter table public.quote_assistant_comment_sources enable row level security;
revoke all on public.quote_assistant_comment_sources from public,anon,authenticated;

create or replace function public.quote_assistant_comment_changed()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_job record;v_fingerprint text;
begin
 if TG_OP='UPDATE' and (old.payload,old.deleted_at,old.reply_to_kind,old.reply_to_id,old.author_id) is not distinct from (new.payload,new.deleted_at,new.reply_to_kind,new.reply_to_id,new.author_id) then return new; end if;
 if TG_OP<>'DELETE' and new.deleted_at is null then v_fingerprint:=md5(jsonb_build_array(new.author_id,new.payload->>'text',new.reply_to_kind,new.reply_to_id)::text); end if;
 for v_job in select j.id from public.quote_assistant_jobs j join public.quote_assistant_comment_sources s on s.job_id=j.id
  where s.kind='community' and s.comment_id=old.id::text and j.status<>'cancelled' and s.fingerprint is distinct from v_fingerprint order by j.id loop
  perform public.quote_assistant_revoke_job(v_job.id,'SOURCE_CHANGED');
 end loop;
 return case when TG_OP='DELETE' then old else new end;
end;
$$;
revoke all on function public.quote_assistant_comment_changed() from public,anon,authenticated;
drop trigger if exists quote_assistant_comment_source_changed on public.review_community_evaluations;
create trigger quote_assistant_comment_source_changed after update or delete on public.review_community_evaluations for each row execute function public.quote_assistant_comment_changed();

create or replace function public.quote_assistant_sources_valid(p_job public.quote_assistant_jobs)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_source record;v_current text;
begin
 for v_source in select * from public.quote_assistant_sources where job_id=p_job.id loop
  if public.quote_assistant_fingerprint(v_source.post_id,v_source.scope,p_job.owner_id) is distinct from v_source.fingerprint then return false; end if;
 end loop;
 for v_source in select * from public.quote_assistant_comment_sources where job_id=p_job.id loop
  select md5(jsonb_build_array(n.author_id,n.payload->>'text',n.parent_kind,n.parent_id)::text) into v_current from public.review_comment_nodes(v_source.post_id) n
   where n.kind=v_source.kind and n.id=v_source.comment_id and not n.deleted;
  if v_current is distinct from v_source.fingerprint then return false; end if;
 end loop;
 return true;
end;
$$;
revoke all on function public.quote_assistant_sources_valid(public.quote_assistant_jobs) from public,anon,authenticated;

create or replace function public.quote_assistant_next_occurrence(p_job public.quote_assistant_jobs,p_next_due timestamptz default null)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_sub public.quote_assistant_subscriptions;v_due timestamptz;v_interval interval;v_id uuid;v_day date;
begin
 if p_job.subscription_id is null then return; end if;
 select * into v_sub from public.quote_assistant_subscriptions where id=p_job.subscription_id for update;
 if not found or not v_sub.active then return; end if;
 -- The parent job schedules exactly one following occurrence. Retried complete
 -- requests return the existing draft before reaching this helper.
 v_interval:=case when v_sub.recurrence='daily' then interval '1 day' else interval '7 days' end;
 v_due:=coalesce(p_next_due,v_sub.due_at+v_interval);
 while v_due<=clock_timestamp() loop v_due:=v_due+v_interval;end loop;
 v_day:=(v_due at time zone 'UTC')::date;v_id:=gen_random_uuid();
 insert into public.quote_assistant_sessions(id,owner_id,kind) values(v_id,v_sub.owner_id,v_sub.kind);
 insert into public.quote_assistant_jobs(id,owner_id,session_id,subscription_id,recurrence,kind,prompt,due_at,record_date,range_start,range_end,request_payload)
  values(v_id,v_sub.owner_id,v_id,v_sub.id,v_sub.recurrence,v_sub.kind,v_sub.prompt,v_due,
   case when v_sub.kind='daily-review' then v_day end,case when v_sub.kind='weekly-digest' then v_day-7 end,case when v_sub.kind='weekly-digest' then v_day-1 end,
   jsonb_build_object('subscriptionId',v_sub.id,'dueAt',v_due)) on conflict(subscription_id,due_at) where subscription_id is not null do nothing;
 update public.quote_assistant_subscriptions set due_at=v_due,revision=revision+1 where id=v_sub.id;
end;
$$;
revoke all on function public.quote_assistant_next_occurrence(public.quote_assistant_jobs,timestamptz) from public,anon,authenticated;

create or replace function public.quote_assistant_service(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_id uuid;v_bot uuid;v_existing uuid;v_job public.quote_assistant_jobs;v_token uuid;v_owner uuid;v_text text;v_code text;
 v_post public.review_public_posts;v_source record;v_node record;v_parent record;v_target uuid;
 v_posts jsonb:='[]'::jsonb;v_comments jsonb:='[]'::jsonb;v_history jsonb;v_memories jsonb;v_milestone jsonb;v_post_json jsonb;
 v_comment_id uuid;v_log_id uuid;v_result text;v_limit integer;v_patch jsonb;v_memory public.quote_assistant_memories;v_epoch bigint;v_enabled boolean;v_memory_id uuid;v_memory_revision integer;v_market_date date;v_next_due timestamptz;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>100000 then raise exception 'invalid assistant service payload' using errcode='22023'; end if;
 select author_id into v_bot from public.quote_assistant_identity;
 if p_action='identity' then return case when v_bot is not null then jsonb_build_object('authorId',v_bot) else null end; end if;
 if p_action='configure' then
  begin v_id:=(p_payload->>'authorId')::uuid;exception when others then raise exception 'invalid assistant author' using errcode='22023';end;
  if v_id is null or not exists(select 1 from auth.users where id=v_id) then raise exception 'assistant auth user required' using errcode='22023'; end if;
  insert into public.quote_assistant_identity(singleton,author_id) values(true,v_id) on conflict(singleton) do nothing;
  select author_id into v_existing from public.quote_assistant_identity;
  if v_existing<>v_id then raise exception 'assistant identity is already configured' using errcode='40001'; end if;
  return jsonb_build_object('authorId',v_existing);
 end if;
 if p_action='due' then
  update public.quote_assistant_jobs set status='failed',error_code='RETRY_LIMIT',lease_token=null,lease_expires_at=null,revision=revision+1,updated_at=clock_timestamp()
   where status='running' and lease_expires_at<=clock_timestamp() and attempts>=3;
  begin v_limit:=coalesce((p_payload->>'limit')::integer,5);exception when others then raise exception 'invalid due limit' using errcode='22023';end;
  if v_limit not between 1 and 20 then raise exception 'invalid due limit' using errcode='22023'; end if;
  return jsonb_build_object('jobs',coalesce((select jsonb_agg(public.quote_assistant_job_json(j)||jsonb_build_object('ownerId',j.owner_id) order by j.created_at,j.id)
   from (select * from public.quote_assistant_jobs where (status='draft' and auto_publish)
    or (attempts<3 and (due_at is null or due_at<=clock_timestamp())
    and (status='pending' or (status='running' and lease_expires_at<clock_timestamp()))) order by created_at,id limit v_limit) j),'[]'::jsonb));
 end if;
 begin v_id:=(p_payload->>'id')::uuid;v_token:=(p_payload->>'leaseToken')::uuid;exception when others then raise exception 'invalid assistant job or lease' using errcode='22023';end;
 if v_id is null then raise exception 'assistant job required' using errcode='22023'; end if;
 -- Lock parent source rows in deterministic order before the job: withdrawal
 -- holds those source rows first. Never invert this order while publishing.
 if p_action in ('complete','publish') then
  for v_source in select post_id from public.quote_assistant_sources where job_id=v_id order by post_id loop
   perform public.review_community_lock_parent(v_source.post_id);
  end loop;
 end if;
 if p_action='complete' then
  perform 1 from public.quote_assistant_subscriptions where id=(select subscription_id from public.quote_assistant_jobs where id=v_id) for update;
 end if;
 if p_action='apply-memories' then
  select owner_id into v_owner from public.quote_assistant_jobs where id=v_id;
  if v_owner is not null then perform pg_advisory_xact_lock(hashtextextended(v_owner::text,714293)); end if;
 end if;
 select * into v_job from public.quote_assistant_jobs where id=v_id for update;
 if not found then raise exception 'assistant job unavailable' using errcode='P0002'; end if;
 if p_action='claim' then
  if v_job.status='running' and v_job.lease_expires_at<=clock_timestamp() and v_job.attempts>=3 then
   update public.quote_assistant_jobs set status='failed',error_code='RETRY_LIMIT',lease_token=null,lease_expires_at=null,revision=revision+1,updated_at=clock_timestamp() where id=v_id returning * into v_job;
  end if;
  if v_job.status not in ('pending','running') or (v_job.due_at is not null and v_job.due_at>clock_timestamp())
   or (v_job.status='running' and v_job.lease_expires_at>clock_timestamp()) or v_job.attempts>=3 then
   return jsonb_build_object('job',public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id),'leaseToken',null);
  end if;
  if not public.quote_assistant_sources_valid(v_job) then
   perform public.quote_assistant_revoke_job(v_id,'SOURCE_CHANGED');select * into v_job from public.quote_assistant_jobs where id=v_id;
   return jsonb_build_object('job',public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id),'leaseToken',null);
  end if;
  update public.quote_assistant_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '180 seconds',error_code=null,
   revision=revision+1,updated_at=clock_timestamp() where id=v_id returning * into v_job;
  return jsonb_build_object('job',public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id),'leaseToken',v_job.lease_token);
 end if;
 if p_action='publish' then
  begin v_owner:=(p_payload->>'ownerId')::uuid;exception when others then raise exception 'invalid publish owner' using errcode='22023';end;
  if v_owner is distinct from v_job.owner_id then raise exception 'publication owner mismatch' using errcode='42501'; end if;
  if v_job.kind='chat' then raise exception 'private chat cannot be published' using errcode='42501'; end if;
  if v_job.status='published' then return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id); end if;
  if v_job.status<>'draft' or p_payload->>'revision' is distinct from v_job.revision::text then raise exception 'assistant draft changed' using errcode='40001'; end if;
  if v_bot is null then raise exception 'assistant identity not configured' using errcode='55000'; end if;
  if not public.quote_assistant_sources_valid(v_job) then
   perform public.quote_assistant_revoke_job(v_id,'SOURCE_CHANGED');select * into v_job from public.quote_assistant_jobs where id=v_id;
   return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id);
  end if;
  if v_job.kind in ('reply','followup') then
   select * into v_parent from public.review_community_parent(v_job.post_id);
   if not found or not v_parent.parent_public then raise exception 'public parent unavailable' using errcode='P0002'; end if;
   if v_job.reply_to_kind is not null then
    v_target:=public.review_community_reply_target(v_job.post_id,v_job.reply_to_kind,v_job.reply_to_id);
    if v_target is null then raise exception 'reply target unavailable' using errcode='P0002'; end if;
   end if;
   v_comment_id:=gen_random_uuid();
   insert into public.review_community_evaluations(id,post_id,author_id,payload,reply_to_kind,reply_to_id,reply_to_author_id)
    values(v_comment_id,v_job.post_id,v_bot,jsonb_build_object('id',v_comment_id,'date',(clock_timestamp() at time zone 'UTC')::date,'text',v_job.text,
    'score',null,'tags','[]'::jsonb,'images','[]'::jsonb,'stocks','[]'::jsonb,'trades','[]'::jsonb,'market',null,'account',null,'mood',''),
    v_job.reply_to_kind,v_job.reply_to_id,v_target);
   update public.review_public_posts set updated_at=clock_timestamp() where id=v_job.post_id;
   v_result:=v_job.post_id;
  else
   v_log_id:=gen_random_uuid();v_result:='log:'||v_log_id::text;
   insert into public.review_logs(id,user_id,text,log_date,review_data)
    values(v_log_id,v_bot,v_job.text,(clock_timestamp() at time zone 'UTC')::date,
     jsonb_build_object('version',1,'visibility','public','operationId',v_job.id,'date',(clock_timestamp() at time zone 'UTC')::date,
     'stocks','[]'::jsonb,'images','[]'::jsonb,'replies','[]'::jsonb));
  end if;
  update public.quote_assistant_jobs set status='published',result_post_id=v_result,result_comment_id=v_comment_id,
   revision=revision+1,updated_at=clock_timestamp() where id=v_id returning * into v_job;
  return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id);
 end if;
 if v_token is null or v_token is distinct from v_job.lease_token then raise exception 'assistant lease mismatch' using errcode='42501'; end if;
 if p_action='complete' and v_job.status in ('draft','published') and p_payload->>'text'=v_job.text then
  return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id);
 end if;
 if v_job.status<>'running' or v_job.lease_expires_at<=clock_timestamp() then raise exception 'assistant lease expired' using errcode='40001'; end if;
 if p_action='apply-memories' then
  if v_job.kind<>'chat' then raise exception 'public jobs cannot change personal memory' using errcode='42501'; end if;
  select memory_enabled,memory_epoch into v_enabled,v_epoch from public.quote_assistant_preferences where owner_id=v_job.owner_id for update;
  if not coalesce(v_enabled,true) then return jsonb_build_object('applied',false,'reason','MEMORY_PAUSED'); end if;
  if p_payload->>'memoryEpoch' is distinct from coalesce(v_epoch,0)::text then return jsonb_build_object('applied',false,'reason','MEMORY_CHANGED'); end if;
  if jsonb_typeof(coalesce(p_payload->'upserts','[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_payload->'deletes','[]'::jsonb))<>'array'
   or jsonb_array_length(coalesce(p_payload->'upserts','[]'::jsonb))+jsonb_array_length(coalesce(p_payload->'deletes','[]'::jsonb))>5 then raise exception 'invalid memory patch' using errcode='22023'; end if;
  for v_patch in select value from jsonb_array_elements(coalesce(p_payload->'deletes','[]'::jsonb)) loop
   begin v_memory_id:=(v_patch->>'id')::uuid;v_memory_revision:=(v_patch->>'revision')::integer;exception when others then raise exception 'invalid memory patch identity' using errcode='22023';end;
   select * into v_memory from public.quote_assistant_memories where id=v_memory_id for update;
   if not found or v_memory.owner_id<>v_job.owner_id then raise exception 'memory owner mismatch' using errcode='42501'; end if;
   if v_memory_revision is distinct from v_memory.revision then raise exception 'memory changed' using errcode='40001'; end if;
   delete from public.quote_assistant_memories where id=v_memory_id;
  end loop;
  for v_patch in select value from jsonb_array_elements(coalesce(p_payload->'upserts','[]'::jsonb)) loop
   begin v_memory_id:=(v_patch->>'id')::uuid;v_memory_revision:=(v_patch->>'revision')::integer;exception when others then raise exception 'invalid memory patch identity' using errcode='22023';end;
   v_text:=btrim(v_patch->>'text');
   if v_memory_id is null or v_memory_revision is null or v_memory_revision<0 or length(coalesce(v_text,'')) not between 1 and 1000 then raise exception 'invalid memory patch text' using errcode='22023'; end if;
   select * into v_memory from public.quote_assistant_memories where id=v_memory_id for update;
   if found then
    if v_memory.owner_id<>v_job.owner_id then raise exception 'memory owner mismatch' using errcode='42501'; end if;
    if v_memory_revision<>v_memory.revision then raise exception 'memory changed' using errcode='40001'; end if;
    update public.quote_assistant_memories set text=v_text,revision=revision+1,updated_at=clock_timestamp() where id=v_memory_id;
   else
    if v_memory_revision<>0 then raise exception 'memory unavailable' using errcode='P0002'; end if;
    insert into public.quote_assistant_memories(id,owner_id,text) values(v_memory_id,v_job.owner_id,v_text);
   end if;
  end loop;
  if (select count(*) from public.quote_assistant_memories where owner_id=v_job.owner_id)>50 then raise exception 'memory limit reached' using errcode='54000'; end if;
  update public.quote_assistant_preferences set memory_epoch=memory_epoch+1 where owner_id=v_job.owner_id;
  return jsonb_build_object('applied',true,'memoryEpoch',coalesce(v_epoch,0)+1);
 end if;
 if p_action='fail' then
  v_code:=p_payload->>'errorCode';
  if v_code is null or v_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then v_code:='ASSISTANT_FAILED'; end if;
  update public.quote_assistant_jobs set status='failed',error_code=v_code,lease_token=null,lease_expires_at=null,revision=revision+1,updated_at=clock_timestamp() where id=v_id returning * into v_job;
  return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id);
 end if;
 if not public.quote_assistant_sources_valid(v_job) then
  perform public.quote_assistant_revoke_job(v_id,'SOURCE_CHANGED');select * into v_job from public.quote_assistant_jobs where id=v_id;
  return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id);
 end if;
 if p_action='complete' then
  v_text:=btrim(p_payload->>'text');
  if jsonb_typeof(p_payload->'text') is distinct from 'string' or length(v_text) not between 1 and 12000 then raise exception 'invalid assistant output' using errcode='22023'; end if;
  if v_job.kind='daily-review' then
   begin v_market_date:=(p_payload->>'marketDate')::date;v_next_due:=(p_payload->>'nextDueAt')::timestamptz;
   exception when others then raise exception 'invalid verified market date' using errcode='22023';end;
   if v_job.recurrence='daily' then
    if v_market_date is null or not isfinite(v_market_date) or v_market_date>current_date or v_market_date<current_date-8
     or v_next_due is null or not isfinite(v_next_due) or v_next_due<=clock_timestamp() or v_next_due>clock_timestamp()+interval '8 days' then
     raise exception 'recurring review requires verified market day and next trading session' using errcode='22023'; end if;
   elsif v_market_date is not null and v_market_date is distinct from v_job.record_date then raise exception 'market date does not match review' using errcode='22023'; end if;
  end if;
  update public.quote_assistant_jobs set record_date=coalesce(v_market_date,record_date),status='draft',text=v_text,error_code=null,revision=revision+1,updated_at=clock_timestamp() where id=v_id returning * into v_job;
  perform public.quote_assistant_next_occurrence(v_job,v_next_due);
  return public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id);
 end if;
 if p_action<>'context' then raise exception 'unsupported assistant service action' using errcode='22023'; end if;
 if v_job.post_id is not null and v_job.kind<>'milestone' then
  select * into v_post from public.review_public_posts where id=v_job.post_id;
  if not found then raise exception 'public context unavailable' using errcode='P0002'; end if;
  v_post_json:=public.quote_assistant_public_post(v_post);
  for v_node in
   with recursive nodes as materialized (select * from public.review_comment_nodes(v_job.post_id)),
   chain as (
    select n.*,0 depth,array[n.kind||':'||n.id] path from nodes n where n.kind=v_job.reply_to_kind and n.id=v_job.reply_to_id
    union all select n.*,c.depth+1,c.path||(n.kind||':'||n.id) from nodes n join chain c on n.kind=c.parent_kind and n.id=c.parent_id
     where c.depth<7 and not n.kind||':'||n.id=any(c.path)
   ), chosen as (
    select n.*,true targeted from nodes n where exists(select 1 from chain c where c.kind=n.kind and c.id=n.id)
    union all select n.*,false targeted from nodes n where not exists(select 1 from chain c where c.kind=n.kind and c.id=n.id)
   ) select * from chosen where not deleted order by targeted desc,created_at desc,kind,id limit 40 loop
   v_comments:=v_comments||jsonb_build_array(jsonb_build_object('kind',v_node.kind,'id',v_node.id,'authorId',v_node.author_id,
    'nickname',case when v_node.author_id=v_bot then 'Quote' else coalesce((select nickname from public.community_profiles where user_id=v_node.author_id),'Quote 用户') end,
    'text',left(coalesce(v_node.payload->>'text',''),4000),'replyTo',case when v_node.parent_kind is not null then jsonb_build_object('kind',v_node.parent_kind,'id',v_node.parent_id) end));
   insert into public.quote_assistant_comment_sources(job_id,post_id,kind,comment_id,fingerprint)
    values(v_job.id,v_job.post_id,v_node.kind,v_node.id,md5(jsonb_build_array(v_node.author_id,v_node.payload->>'text',v_node.parent_kind,v_node.parent_id)::text))
    on conflict(job_id,kind,comment_id) do nothing;
  end loop;
 end if;
 if v_job.kind='milestone' then
  select jsonb_build_object('postId',v_job.post_id,'title',review_data->'timelineEvent'->>'title','date',review_data->'timelineEvent'->>'date',
   'event',jsonb_build_object('version',1,'id',review_data->'timelineEvent'->>'id','kind',review_data->'timelineEvent'->>'kind','metric',review_data->'timelineEvent'->>'metric',
   'date',review_data->'timelineEvent'->>'date','title',review_data->'timelineEvent'->>'title'),'basis','timeline_reference_only') into v_milestone
   from public.review_logs where 'log:'||id::text=v_job.post_id and user_id=v_job.owner_id;
 end if;
 -- Only published post projections are offered to public search. No private
 -- source text, account ledger, attachment or profile-private fields enter it.
 if v_job.kind in ('chat','reply','weekly-digest') then
  for v_post in select * from public.review_public_posts where
   (v_job.kind<>'weekly-digest' or (published_at>=v_job.range_start::timestamp at time zone 'UTC' and published_at<(v_job.range_end+1)::timestamp at time zone 'UTC'))
   order by published_at desc,id desc limit (case when v_job.kind='weekly-digest' then 50 else 20 end) loop
   perform public.quote_assistant_add_source(v_job,v_post.id,'public');
   v_posts:=v_posts||jsonb_build_array(public.quote_assistant_public_post(v_post));
  end loop;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('prompt',h.prompt,'text',h.text) order by h.created_at,h.id),'[]'::jsonb) into v_history
  from (select * from public.quote_assistant_jobs where owner_id=v_job.owner_id and session_id=v_job.session_id and id<>v_job.id
   and kind=v_job.kind and post_id is not distinct from v_job.post_id and status in ('draft','published') and text<>'' order by created_at desc,id desc limit 10) h;
 insert into public.quote_assistant_sources(job_id,post_id,scope,fingerprint,title,date)
  select v_job.id,s.post_id,s.scope,s.fingerprint,s.title,s.date from public.quote_assistant_sources s join
   (select id from public.quote_assistant_jobs where owner_id=v_job.owner_id and session_id=v_job.session_id and id<>v_job.id
    and kind=v_job.kind and post_id is not distinct from v_job.post_id and status in ('draft','published') and text<>'' order by created_at desc,id desc limit 10) h on h.id=s.job_id
  on conflict(job_id,post_id) do nothing;
 insert into public.quote_assistant_comment_sources(job_id,post_id,kind,comment_id,fingerprint)
  select v_job.id,s.post_id,s.kind,s.comment_id,s.fingerprint from public.quote_assistant_comment_sources s join
   (select id from public.quote_assistant_jobs where owner_id=v_job.owner_id and session_id=v_job.session_id and id<>v_job.id
    and kind=v_job.kind and post_id is not distinct from v_job.post_id and status in ('draft','published') and text<>'' order by created_at desc,id desc limit 10) h on h.id=s.job_id
  on conflict(job_id,kind,comment_id) do nothing;
 select memory_enabled,memory_epoch into v_enabled,v_epoch from public.quote_assistant_preferences where owner_id=v_job.owner_id;
 if v_job.kind='chat' and coalesce(v_enabled,true) then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',text,'revision',revision) order by created_at),'[]'::jsonb) into v_memories from public.quote_assistant_memories where owner_id=v_job.owner_id;
 else v_memories:='[]'::jsonb;end if;
 return jsonb_build_object('job',public.quote_assistant_job_json(v_job)||jsonb_build_object('ownerId',v_job.owner_id),'assistant',case when v_bot is not null then jsonb_build_object('authorId',v_bot,'nickname','Quote','isAssistant',true) end,
  'memoryEnabled',v_job.kind='chat' and coalesce(v_enabled,true),'memoryEpoch',coalesce(v_epoch,0),'memories',v_memories,'history',v_history,'post',v_post_json,'comments',v_comments,'publicPosts',v_posts,'milestone',v_milestone);
end;
$$;
revoke all on function public.quote_assistant_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.quote_assistant_service(text,jsonb) to service_role;

-- Trusted assistant badges; existing payload projections and grants stay intact.
create or replace function public.review_public_post_json(p_post public.review_public_posts,p_viewer uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_post.id,'type',p_post.type,'sourceId',p_post.source_id,'authorId',p_post.author_id,
  'author',jsonb_build_object('isAssistant',exists(select 1 from public.quote_assistant_identity where author_id=p_post.author_id),'nickname',case when exists(select 1 from public.quote_assistant_identity where author_id=p_post.author_id) then 'Quote' else coalesce(profile.nickname,'Quote 用户') end,'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_post.author_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
  'text',p_post.text,'date',p_post.record_date,'stocks',p_post.stocks,'images',p_post.images,'market',p_post.market,'replies',p_post.replies,
  'commentCount',jsonb_array_length(p_post.replies)+(select count(*) from public.review_community_evaluations where post_id=p_post.id and deleted_at is null),
  'publishedAt',p_post.published_at,'updatedAt',p_post.updated_at,
  'likeCount',(select count(*) from public.review_public_likes where post_id=p_post.id),
  'liked',exists(select 1 from public.review_public_likes where post_id=p_post.id and user_id=p_viewer))
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_post.author_id;
$$;
create or replace function public.review_community_evaluation_json(p_evaluation public.review_community_evaluations)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select p_evaluation.payload||jsonb_build_object('id',p_evaluation.id,'postId',p_evaluation.post_id,'authorId',p_evaluation.author_id,
  'revision',p_evaluation.revision,'createdAt',p_evaluation.created_at,'updatedAt',p_evaluation.updated_at,
  'author',jsonb_build_object('isAssistant',exists(select 1 from public.quote_assistant_identity where author_id=p_evaluation.author_id),'nickname',case when exists(select 1 from public.quote_assistant_identity where author_id=p_evaluation.author_id) then 'Quote' else coalesce(profile.nickname,'Quote 用户') end,'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_evaluation.author_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
  'replyTo',case when p_evaluation.reply_to_kind is not null then jsonb_build_object('kind',p_evaluation.reply_to_kind,'id',p_evaluation.reply_to_id,
   'authorId',p_evaluation.reply_to_author_id,'nickname',coalesce(target_profile.nickname,'Quote 用户'),
   'available',coalesce(public.review_community_reply_target(p_evaluation.post_id,p_evaluation.reply_to_kind,p_evaluation.reply_to_id)=p_evaluation.reply_to_author_id,false)) else null end)
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_evaluation.author_id
  left join public.community_profiles target_profile on target_profile.user_id=p_evaluation.reply_to_author_id;
$$;
create or replace function public.review_comment_json(p_post_id text,p_kind text,p_id text,p_created_at timestamptz,p_deleted boolean,p_author uuid,p_payload jsonb,p_viewer uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select p_payload||jsonb_build_object('id',p_id,'kind',p_kind,'source',p_kind,'postId',p_post_id,'sortCreatedAt',p_created_at,'createdAt',p_payload->'createdAt','deleted',p_deleted,'authorId',p_author,
  'author',jsonb_build_object('isAssistant',exists(select 1 from public.quote_assistant_identity where author_id=p_author),'nickname',case when exists(select 1 from public.quote_assistant_identity where author_id=p_author) then 'Quote' else coalesce(profile.nickname,'Quote 用户') end,'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_author::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
  'likeCount',case when p_deleted then 0 else (select count(*) from public.review_evaluation_likes where post_id=p_post_id and target_kind=p_kind and target_id=p_id) end,
  'liked',not p_deleted and exists(select 1 from public.review_evaluation_likes where post_id=p_post_id and target_kind=p_kind and target_id=p_id and user_id=p_viewer),
  'directReplyCount',(select count(*) from public.review_community_evaluations where post_id=p_post_id and reply_to_kind=p_kind and reply_to_id=p_id and deleted_at is null))
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_author;
$$;
create or replace function public.review_activity_notification_json(p_notification public.review_activity_notifications)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_notification.id,'kind',public.review_activity_notification_kind(p_notification),
  'postId',p_notification.post_id,'commentId',p_notification.evaluation_id,'actorId',p_notification.actor_id,
  'actor',jsonb_build_object('isAssistant',exists(select 1 from public.quote_assistant_identity where author_id=p_notification.actor_id),'nickname',case when exists(select 1 from public.quote_assistant_identity where author_id=p_notification.actor_id) then 'Quote' else coalesce(profile.nickname,'Quote 用户') end,'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_notification.actor_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
  'createdAt',p_notification.created_at,'readAt',p_notification.read_at,
  'score',case when p_notification.event_type='evaluation' then public.review_public_number(e.payload->'score') else null end,
  'excerpt',case when p_notification.event_type='evaluation' then left(coalesce(e.payload->>'text',''),160) else '' end,
  'postExcerpt',left(coalesce(post.text,''),160))
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_notification.actor_id
  left join public.review_community_evaluations e on e.id=p_notification.evaluation_id
  left join public.review_public_posts post on post.id=p_notification.post_id;
$$;

commit;
