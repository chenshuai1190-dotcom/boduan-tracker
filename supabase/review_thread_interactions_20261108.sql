-- Additive threaded comments, per-comment reactions and new-public-post cursors.
-- Apply after review_activity_notifications_20261108.sql. No source content,
-- financial records, existing replies or notification read states are rewritten.
begin;

-- Timelines remain permanently private. Their owner may use the same comment
-- thread APIs, including reply writes; other accounts never receive a parent.
create or replace function public.review_community_parent(p_post_id text)
returns table(parent_author_id uuid,parent_public boolean)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_author uuid;v_public boolean;v_timeline boolean;
begin
 if p_post_id is null or length(p_post_id)>150 then return; end if;
 if left(p_post_id,4)='log:' then
  select user_id,review_data->>'visibility'='public',review_data ? 'timelineEvent' and review_data->'timelineEvent'<>'null'::jsonb
   into v_author,v_public,v_timeline from public.review_logs where id::text=substring(p_post_id from 5);
 elsif left(p_post_id,8)='insight:' then
  select user_id,review_data->>'visibility'='public',review_data ? 'timelineEvent' and review_data->'timelineEvent'<>'null'::jsonb
   into v_author,v_public,v_timeline from public.disciplines where id::text=substring(p_post_id from 9);
 else return; end if;
 if v_author is null then return; end if;
 return query select v_author,not coalesce(v_timeline,false) and coalesce(v_public,false)
  and exists(select 1 from public.review_public_posts where id=p_post_id and author_id=v_author);
end;
$$;
revoke all on function public.review_community_parent(text) from public,anon,authenticated;

create table if not exists public.review_evaluation_likes (
 post_id text not null check(post_id ~ '^(log|insight):[A-Za-z0-9_-]{1,100}$'),
 target_kind text not null check(target_kind in ('author','community')),
 target_id text not null check(length(target_id) between 1 and 100 and target_id !~ '[[:cntrl:]]'),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 primary key(post_id,target_kind,target_id,user_id)
);
alter table public.review_evaluation_likes enable row level security;
revoke all on public.review_evaluation_likes from public,anon,authenticated;

create or replace function public.cleanup_review_evaluation_likes()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if TG_TABLE_SCHEMA<>'public' or TG_TABLE_NAME not in ('review_logs','disciplines') then raise exception 'invalid comment source' using errcode='42501'; end if;
 if TG_OP='DELETE' or old.id is distinct from new.id or old.user_id is distinct from new.user_id then
  delete from public.review_evaluation_likes where post_id=(case TG_TABLE_NAME when 'review_logs' then 'log:' else 'insight:' end)||old.id::text;
 elsif TG_OP='UPDATE' then
  delete from public.review_evaluation_likes l where l.post_id=(case TG_TABLE_NAME when 'review_logs' then 'log:' else 'insight:' end)||new.id::text
   and l.target_kind='author' and public.review_community_reply_target(l.post_id,l.target_kind,l.target_id) is null;
 end if;
 return case when TG_OP='DELETE' then old else new end;
end;
$$;
revoke all on function public.cleanup_review_evaluation_likes() from public,anon,authenticated;
drop trigger if exists review_logs_cleanup_evaluation_likes on public.review_logs;
create trigger review_logs_cleanup_evaluation_likes after delete or update of id,user_id,review_data on public.review_logs for each row execute function public.cleanup_review_evaluation_likes();
drop trigger if exists disciplines_cleanup_evaluation_likes on public.disciplines;
create trigger disciplines_cleanup_evaluation_likes after delete or update of id,user_id,review_data on public.disciplines for each row execute function public.cleanup_review_evaluation_likes();

create or replace function public.review_comment_nodes(p_post_id text)
returns table(kind text,id text,parent_kind text,parent_id text,created_at timestamptz,deleted boolean,author_id uuid,payload jsonb)
language sql stable security definer set search_path=pg_catalog,public as $$
 with source as (
  select user_id,review_data,created_at from public.review_logs where p_post_id='log:'||id::text
  union all select user_id,review_data,created_at from public.disciplines where p_post_id='insight:'||id::text
 ), author_nodes as (
  select 'author'::text kind,item->>'id' id,null::text parent_kind,null::text parent_id,
   coalesce(case when item->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}T' then (item->>'createdAt')::timestamptz end,
    case when public.review_public_valid_date(item->>'date') then (item->>'date')::date::timestamp at time zone 'UTC' end,source.created_at) created_at,
   false deleted,source.user_id author_id,item payload
  from source cross join lateral jsonb_array_elements(public.review_public_project_replies(source.review_data->'replies',source.user_id)) item
 ), community_nodes as (
  select 'community'::text kind,e.id::text id,e.reply_to_kind parent_kind,e.reply_to_id parent_id,e.created_at,e.deleted_at is not null deleted,e.author_id,
   case when e.deleted_at is null then public.review_community_evaluation_json(e) else jsonb_build_object('revision',e.revision,'updatedAt',e.updated_at,
    'replyTo',case when e.reply_to_kind is null then null else jsonb_build_object('kind',e.reply_to_kind,'id',e.reply_to_id,'authorId',e.reply_to_author_id,'nickname','Quote 用户','available',false) end) end payload
  from public.review_community_evaluations e where e.post_id=p_post_id
 ), nodes as (select * from author_nodes union all select * from community_nodes)
 select * from nodes
 union all
 select child.parent_kind,child.parent_id,null::text,null::text,min(child.created_at),true,
  coalesce((select source.user_id from source limit 1),min(child.author_id::text)::uuid),'{}'::jsonb
 from nodes child where child.parent_kind is not null and not exists(select 1 from nodes parent where parent.kind=child.parent_kind and parent.id=child.parent_id)
 group by child.parent_kind,child.parent_id;
$$;
revoke all on function public.review_comment_nodes(text) from public,anon,authenticated;

create or replace function public.review_comment_tree(p_post_id text)
returns table(kind text,id text,parent_kind text,parent_id text,created_at timestamptz,deleted boolean,author_id uuid,payload jsonb,root_kind text,root_id text)
language sql stable security definer set search_path=pg_catalog,public as $$
 with recursive nodes as materialized (select * from public.review_comment_nodes(p_post_id)), tree as (
  select n.*,n.kind root_kind,n.id root_id,array[n.kind||':'||n.id] path from nodes n where n.parent_kind is null
  union all
  select n.*,t.root_kind,t.root_id,t.path||(n.kind||':'||n.id) from nodes n join tree t on n.parent_kind=t.kind and n.parent_id=t.id
   where not n.kind||':'||n.id=any(t.path)
 ) select kind,id,parent_kind,parent_id,created_at,deleted,author_id,payload,root_kind,root_id from tree;
$$;
revoke all on function public.review_comment_tree(text) from public,anon,authenticated;

create or replace function public.review_comment_json(p_post_id text,p_kind text,p_id text,p_created_at timestamptz,p_deleted boolean,p_author uuid,p_payload jsonb,p_viewer uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select p_payload||jsonb_build_object('id',p_id,'kind',p_kind,'source',p_kind,'postId',p_post_id,'sortCreatedAt',p_created_at,'createdAt',p_payload->'createdAt','deleted',p_deleted,'authorId',p_author,
  'author',jsonb_build_object('nickname',coalesce(profile.nickname,'Quote 用户'),'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_author::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
  'likeCount',case when p_deleted then 0 else (select count(*) from public.review_evaluation_likes where post_id=p_post_id and target_kind=p_kind and target_id=p_id) end,
  'liked',not p_deleted and exists(select 1 from public.review_evaluation_likes where post_id=p_post_id and target_kind=p_kind and target_id=p_id and user_id=p_viewer),
  'directReplyCount',(select count(*) from public.review_community_evaluations where post_id=p_post_id and reply_to_kind=p_kind and reply_to_id=p_id and deleted_at is null))
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_author;
$$;
revoke all on function public.review_comment_json(text,text,text,timestamptz,boolean,uuid,jsonb,uuid) from public,anon,authenticated;

create or replace function public.fetch_review_comment_threads(p_post_id text,p_limit integer default 20,p_cursor jsonb default null,p_locate jsonb default null,p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_parent record;v_items jsonb;v_rows jsonb;v_last jsonb;v_more boolean;v_total bigint;v_community bigint;v_root_kind text;v_root_id text;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'account mismatch' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid thread page size' using errcode='22023'; end if;
 select * into v_parent from public.review_community_parent(p_post_id);
 if not found or (not v_parent.parent_public and v_parent.parent_author_id<>v_user) then raise exception 'comment parent unavailable' using errcode='P0002'; end if;
 if p_cursor is not null and (jsonb_typeof(p_cursor) is distinct from 'object' or p_cursor->>'kind' not in ('author','community') or length(coalesce(p_cursor->>'id','')) not between 1 and 100 or not isfinite((p_cursor->>'createdAt')::timestamptz)) then raise exception 'invalid thread cursor' using errcode='22023'; end if;
 if p_locate is not null then
  select root_kind,root_id into v_root_kind,v_root_id from public.review_comment_tree(p_post_id) where kind=p_locate->>'kind' and id=p_locate->>'id';
  if not found then raise exception 'comment unavailable' using errcode='P0002'; end if;
 end if;
 with tree as materialized (select * from public.review_comment_tree(p_post_id)), roots as (
  select n.*,(select count(*) from tree c where c.root_kind=n.kind and c.root_id=n.id and not c.deleted and (c.kind,c.id)<>(n.kind,n.id)) reply_count
  from tree n where n.kind=n.root_kind and n.id=n.root_id
 ), selected as (
  select * from roots where (not deleted or reply_count>0)
   and (p_locate is null or (kind,id)=(v_root_kind,v_root_id))
   and (p_cursor is null or (created_at,kind,id)<((p_cursor->>'createdAt')::timestamptz,p_cursor->>'kind',p_cursor->>'id'))
  order by created_at desc,kind desc,id desc limit p_limit+1
 ) select coalesce(jsonb_agg(jsonb_build_object('root',public.review_comment_json(p_post_id,kind,id,created_at,deleted,author_id,payload,v_user),'replyCount',reply_count) order by created_at desc,kind desc,id desc),'[]'::jsonb) into v_rows from selected;
 v_more:=jsonb_array_length(v_rows)>p_limit;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality rows(item,ordinal) where ordinal<=p_limit;
 v_last:=v_items->(jsonb_array_length(v_items)-1)->'root';
 select count(*),count(*) filter(where kind='community') into v_total,v_community from public.review_comment_nodes(p_post_id) where not deleted;
 return jsonb_build_object('threads',v_items,'totalCount',v_total,'communityCount',v_community,'hasMore',v_more,'nextCursor',case when v_more then jsonb_build_object('kind',v_last->'kind','id',v_last->'id','createdAt',v_last->'sortCreatedAt') else null end);
end;
$$;
revoke all on function public.fetch_review_comment_threads(text,integer,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.fetch_review_comment_threads(text,integer,jsonb,jsonb,uuid) to authenticated;

create or replace function public.fetch_review_comment_thread_replies(p_post_id text,p_root jsonb,p_limit integer default 50,p_cursor jsonb default null,p_locate jsonb default null,p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_parent record;v_root record;v_locate record;v_locate_date timestamptz;v_locate_kind text;v_locate_id text;v_rows jsonb;v_items jsonb;v_last jsonb;v_more boolean;v_count bigint;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'account mismatch' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid reply page size' using errcode='22023'; end if;
 select * into v_parent from public.review_community_parent(p_post_id);
 if not found or (not v_parent.parent_public and v_parent.parent_author_id<>v_user) then raise exception 'comment parent unavailable' using errcode='P0002'; end if;
 select * into v_root from public.review_comment_tree(p_post_id) where kind=p_root->>'kind' and id=p_root->>'id' and kind=root_kind and id=root_id;
 if not found then raise exception 'thread unavailable' using errcode='P0002'; end if;
 if p_cursor is not null and (jsonb_typeof(p_cursor) is distinct from 'object' or p_cursor->>'kind' not in ('author','community') or length(coalesce(p_cursor->>'id','')) not between 1 and 100 or not isfinite((p_cursor->>'createdAt')::timestamptz)) then raise exception 'invalid reply cursor' using errcode='22023'; end if;
 if p_locate is not null then
  select * into v_locate from public.review_comment_tree(p_post_id) where kind=p_locate->>'kind' and id=p_locate->>'id' and root_kind=v_root.kind and root_id=v_root.id and (kind,id)<>(root_kind,root_id);
  if not found then raise exception 'reply unavailable' using errcode='P0002'; end if;
  v_locate_date:=v_locate.created_at;v_locate_kind:=v_locate.kind;v_locate_id:=v_locate.id;
 end if;
 with tree as materialized (select * from public.review_comment_tree(p_post_id)), selected as (
  select * from tree where root_kind=v_root.kind and root_id=v_root.id and (kind,id)<>(root_kind,root_id)
   and (p_cursor is null or (created_at,kind,id)>((p_cursor->>'createdAt')::timestamptz,p_cursor->>'kind',p_cursor->>'id'))
   and (p_locate is null or (created_at,kind,id)>=(v_locate_date,v_locate_kind,v_locate_id))
  order by created_at,kind,id limit p_limit+1
 ) select coalesce(jsonb_agg(public.review_comment_json(p_post_id,kind,id,created_at,deleted,author_id,payload,v_user) order by created_at,kind,id),'[]'::jsonb) into v_rows from selected;
 v_more:=jsonb_array_length(v_rows)>p_limit;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality rows(item,ordinal) where ordinal<=p_limit;
 v_last:=v_items->(jsonb_array_length(v_items)-1);
 select count(*) into v_count from public.review_comment_tree(p_post_id) where root_kind=v_root.kind and root_id=v_root.id and (kind,id)<>(root_kind,root_id) and not deleted;
 return jsonb_build_object('replies',v_items,'replyCount',v_count,'hasMore',v_more,'nextCursor',case when v_more then jsonb_build_object('kind',v_last->'kind','id',v_last->'id','createdAt',v_last->'sortCreatedAt') else null end);
end;
$$;
revoke all on function public.fetch_review_comment_thread_replies(text,jsonb,integer,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.fetch_review_comment_thread_replies(text,jsonb,integer,jsonb,jsonb,uuid) to authenticated;

create or replace function public.fetch_review_evaluation_likes(p_post_id text,p_targets jsonb,p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_parent record;v_target jsonb;v_result jsonb:='[]'::jsonb;v_count bigint;v_liked boolean;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'account mismatch' using errcode='42501'; end if;
 if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets)>100 then raise exception 'invalid like targets' using errcode='22023'; end if;
 select * into v_parent from public.review_community_parent(p_post_id);
 if not found or (not v_parent.parent_public and v_parent.parent_author_id<>v_user) then raise exception 'comment parent unavailable' using errcode='P0002'; end if;
 for v_target in select * from jsonb_array_elements(p_targets) loop
  if public.review_community_reply_target(p_post_id,v_target->>'kind',v_target->>'id') is null then raise exception 'comment unavailable' using errcode='P0002'; end if;
  select count(*),coalesce(bool_or(user_id=v_user),false) into v_count,v_liked from public.review_evaluation_likes where post_id=p_post_id and target_kind=v_target->>'kind' and target_id=v_target->>'id';
  v_result:=v_result||jsonb_build_array(jsonb_build_object('kind',v_target->'kind','id',v_target->'id','likeCount',v_count,'liked',v_liked));
 end loop;
 return jsonb_build_object('likes',v_result);
end;
$$;
revoke all on function public.fetch_review_evaluation_likes(text,jsonb,uuid) from public,anon;
grant execute on function public.fetch_review_evaluation_likes(text,jsonb,uuid) to authenticated;

create or replace function public.set_review_evaluation_like(p_post_id text,p_target jsonb,p_liked boolean,p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_parent record;v_count bigint;v_liked boolean;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'account mismatch' using errcode='42501'; end if;
 if p_liked is null or jsonb_typeof(p_target) is distinct from 'object' or p_target-array['kind','id']<>'{}'::jsonb then raise exception 'invalid like target' using errcode='22023'; end if;
 -- Serialize with privacy, source evaluation edits/deletes and other reactions.
 select * into v_parent from public.review_community_lock_parent(p_post_id);
 if not found or (not v_parent.parent_public and v_parent.parent_author_id<>v_user) then raise exception 'comment parent unavailable' using errcode='P0002'; end if;
 if public.review_community_reply_target(p_post_id,p_target->>'kind',p_target->>'id') is null then raise exception 'comment unavailable' using errcode='P0002'; end if;
 if p_liked then
  insert into public.review_evaluation_likes(post_id,target_kind,target_id,user_id) values(p_post_id,p_target->>'kind',p_target->>'id',v_user) on conflict do nothing;
 else delete from public.review_evaluation_likes where post_id=p_post_id and target_kind=p_target->>'kind' and target_id=p_target->>'id' and user_id=v_user; end if;
 select count(*),coalesce(bool_or(user_id=v_user),false) into v_count,v_liked from public.review_evaluation_likes where post_id=p_post_id and target_kind=p_target->>'kind' and target_id=p_target->>'id';
 return jsonb_build_object('kind',p_target->'kind','id',p_target->'id','likeCount',v_count,'liked',v_liked);
end;
$$;
revoke all on function public.set_review_evaluation_like(text,jsonb,boolean,uuid) from public,anon;
grant execute on function public.set_review_evaluation_like(text,jsonb,boolean,uuid) to authenticated;

-- A transactional counter, not sequence last_value / client clock: publication
-- and acknowledgement serialize so an uncommitted earlier event cannot be lost.
create table if not exists public.review_feed_clock(id boolean primary key default true check(id),cursor bigint not null default 0 check(cursor>=0));
insert into public.review_feed_clock(id,cursor) values(true,0) on conflict do nothing;
create table if not exists public.review_feed_publications(
 post_id text primary key,author_id uuid not null references auth.users(id) on delete cascade,
 cursor bigint not null check(cursor>=0),first_public_at timestamptz not null default clock_timestamp()
);
create index if not exists review_feed_publications_cursor_idx on public.review_feed_publications(cursor);
create table if not exists public.review_feed_read_state(
 user_id uuid primary key references auth.users(id) on delete cascade,seen_cursor bigint not null check(seen_cursor>=0),updated_at timestamptz not null default clock_timestamp()
);
alter table public.review_feed_clock enable row level security;
alter table public.review_feed_publications enable row level security;
alter table public.review_feed_read_state enable row level security;
revoke all on public.review_feed_clock,public.review_feed_publications,public.review_feed_read_state from public,anon,authenticated;
-- Existing publications are recorded as pre-launch baseline, never new events.
insert into public.review_feed_publications(post_id,author_id,cursor,first_public_at)
 select id,author_id,0,published_at from public.review_public_posts on conflict do nothing;

create or replace function public.record_review_feed_publication()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_cursor bigint;
begin
 if exists(select 1 from public.review_feed_publications where post_id=new.id) then return new; end if;
 update public.review_feed_clock set cursor=cursor+1 where id=true returning cursor into v_cursor;
 insert into public.review_feed_publications(post_id,author_id,cursor) values(new.id,new.author_id,v_cursor) on conflict do nothing;
 return new;
end;
$$;
revoke all on function public.record_review_feed_publication() from public,anon,authenticated;
drop trigger if exists review_feed_publication on public.review_public_posts;
create trigger review_feed_publication after insert on public.review_public_posts for each row execute function public.record_review_feed_publication();

create or replace function public.fetch_review_feed_unread(p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_cursor bigint;v_seen bigint;v_count bigint;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'account mismatch' using errcode='42501'; end if;
 select cursor into v_cursor from public.review_feed_clock where id=true for share;
 insert into public.review_feed_read_state(user_id,seen_cursor) values(v_user,v_cursor) on conflict do nothing;
 select seen_cursor into v_seen from public.review_feed_read_state where user_id=v_user;
 select count(*) into v_count from public.review_feed_publications publication join public.review_public_posts post on post.id=publication.post_id and post.author_id=publication.author_id
  where publication.cursor>v_seen and publication.cursor<=v_cursor and publication.author_id<>v_user;
 return jsonb_build_object('unreadCount',v_count,'cursor',v_cursor::text);
end;
$$;
revoke all on function public.fetch_review_feed_unread(uuid) from public,anon;
grant execute on function public.fetch_review_feed_unread(uuid) to authenticated;

create or replace function public.mark_review_feed_seen(p_cursor text,p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_current bigint;v_cursor bigint;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'account mismatch' using errcode='42501'; end if;
 if p_cursor is null or p_cursor !~ '^(0|[1-9][0-9]{0,18})$' then raise exception 'invalid seen cursor' using errcode='22023'; end if;
 v_cursor:=p_cursor::bigint;
 select cursor into v_current from public.review_feed_clock where id=true for share;
 if v_cursor>v_current then raise exception 'future seen cursor' using errcode='22023'; end if;
 insert into public.review_feed_read_state(user_id,seen_cursor) values(v_user,v_cursor)
  on conflict(user_id) do update set seen_cursor=greatest(review_feed_read_state.seen_cursor,excluded.seen_cursor),updated_at=clock_timestamp();
 return public.fetch_review_feed_unread(v_user);
end;
$$;
revoke all on function public.mark_review_feed_seen(text,uuid) from public,anon;
grant execute on function public.mark_review_feed_seen(text,uuid) to authenticated;
commit;
