-- Forward-only community evaluations. Apply after review_public_replies_20261108.sql.
-- Viewers never write another user's private journal row. Parent visibility is
-- authoritative; withdrawal retains evaluations privately and deletion removes them.
begin;

create table if not exists public.review_community_evaluations (
  id uuid primary key,
  post_id text not null check (length(post_id) between 5 and 150 and post_id ~ '^(log|insight):[^:]+$'),
  author_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<524288),
  revision integer not null default 1 check (revision between 1 and 2147483647),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  check (deleted_at is null or payload='{}'::jsonb)
);
create index if not exists review_community_evaluations_post_idx on public.review_community_evaluations(post_id,created_at desc,id desc) where deleted_at is null;
create index if not exists review_community_evaluations_author_idx on public.review_community_evaluations(author_id,post_id) where deleted_at is null;
alter table public.review_community_evaluations enable row level security;
revoke all on public.review_community_evaluations from public,anon,authenticated;

-- Source IDs deliberately stay textual here: existing insight IDs and log IDs
-- need not have the same SQL type. No private source fields leave these helpers.
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
 if v_author is null or coalesce(v_timeline,false) then return; end if;
 return query select v_author,coalesce(v_public,false) and exists(select 1 from public.review_public_posts where id=p_post_id and author_id=v_author);
end;
$$;
revoke all on function public.review_community_parent(text) from public,anon,authenticated;

-- All writes take the source row first. Parent privacy changes/deletion already
-- lock that row, so an evaluation cannot commit on the other side of withdrawal.
create or replace function public.review_community_lock_parent(p_post_id text)
returns table(parent_author_id uuid,parent_public boolean)
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 if p_post_id is null or length(p_post_id)>150 then return; end if;
 if left(p_post_id,4)='log:' then
  perform 1 from public.review_logs where id::text=substring(p_post_id from 5) for update;
 elsif left(p_post_id,8)='insight:' then
  perform 1 from public.disciplines where id::text=substring(p_post_id from 9) for update;
 else return; end if;
 return query select * from public.review_community_parent(p_post_id);
end;
$$;
revoke all on function public.review_community_lock_parent(text) from public,anon,authenticated;

create or replace function public.cleanup_review_community_evaluations()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_type text;
begin
 if TG_TABLE_SCHEMA<>'public' or TG_TABLE_NAME not in ('disciplines','review_logs') then
  raise exception 'unsupported community evaluation source' using errcode='42501';
 end if;
 if TG_OP='DELETE' or old.id is distinct from new.id or old.user_id is distinct from new.user_id then
  v_type:=case TG_TABLE_NAME when 'disciplines' then 'insight' else 'log' end;
  delete from public.review_community_evaluations where post_id=v_type||':'||old.id::text;
 end if;
 return case when TG_OP='DELETE' then old else new end;
end;
$$;
revoke all on function public.cleanup_review_community_evaluations() from public,anon,authenticated;
drop trigger if exists disciplines_cleanup_community_evaluations on public.disciplines;
create trigger disciplines_cleanup_community_evaluations after delete or update of id,user_id on public.disciplines for each row execute function public.cleanup_review_community_evaluations();
drop trigger if exists review_logs_cleanup_community_evaluations on public.review_logs;
create trigger review_logs_cleanup_community_evaluations after delete or update of id,user_id on public.review_logs for each row execute function public.cleanup_review_community_evaluations();

create or replace function public.review_community_evaluation_json(p_evaluation public.review_community_evaluations)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select p_evaluation.payload||jsonb_build_object('id',p_evaluation.id,'postId',p_evaluation.post_id,'authorId',p_evaluation.author_id,
  'revision',p_evaluation.revision,'createdAt',p_evaluation.created_at,'updatedAt',p_evaluation.updated_at,
  'author',jsonb_build_object('nickname',coalesce(profile.nickname,'Quote 用户'),'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_evaluation.author_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end))
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_evaluation.author_id;
$$;
revoke all on function public.review_community_evaluation_json(public.review_community_evaluations) from public,anon,authenticated;

create or replace function public.fetch_review_community_evaluations(p_post_id text,p_limit integer default 20,
 p_before timestamptz default null,p_before_id uuid default null,p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_parent record;v_limit integer;v_candidates jsonb;v_items jsonb;v_last jsonb;v_more boolean;v_count bigint;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 if (p_before is null)<>(p_before_id is null) then raise exception 'invalid evaluation cursor' using errcode='22023'; end if;
 select * into v_parent from public.review_community_parent(p_post_id);
 if not found or (not v_parent.parent_public and v_parent.parent_author_id<>v_user) then raise exception 'evaluation parent unavailable' using errcode='P0002'; end if;
 v_limit:=greatest(1,least(coalesce(p_limit,20),20));
 select coalesce(jsonb_agg(public.review_community_evaluation_json(item) order by item.created_at desc,item.id desc),'[]'::jsonb)
  into v_candidates from (select * from public.review_community_evaluations where post_id=p_post_id and deleted_at is null
   and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit v_limit+1) item;
 v_more:=jsonb_array_length(v_candidates)>v_limit;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into v_items
  from jsonb_array_elements(v_candidates) with ordinality candidates(item,ordinal) where ordinal<=v_limit;
 v_last:=v_items->(jsonb_array_length(v_items)-1);
 select count(*) into v_count from public.review_community_evaluations where post_id=p_post_id and deleted_at is null;
 return jsonb_build_object('evaluations',v_items,'totalCount',v_count,'hasMore',v_more,
  'nextCursor',case when v_more then jsonb_build_object('createdAt',v_last->'createdAt','id',v_last->'id') else null end);
end;
$$;
revoke all on function public.fetch_review_community_evaluations(text,integer,timestamptz,uuid,uuid) from public,anon;
grant execute on function public.fetch_review_community_evaluations(text,integer,timestamptz,uuid,uuid) to authenticated;

create or replace function public.save_review_community_evaluation(p_post_id text,p_evaluation_id uuid,p_expected_revision bigint,
 p_evaluation jsonb,p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_parent record;v_existing public.review_community_evaluations;v_clean jsonb;v_score numeric;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 if p_evaluation_id is null or p_expected_revision is null or p_expected_revision not between 0 and 2147483646
  or jsonb_typeof(p_evaluation) is distinct from 'object' or octet_length(p_evaluation::text)>=524288 then
  raise exception 'invalid evaluation payload or revision' using errcode='22023'; end if;
 if (p_evaluation ? 'authorId' and p_evaluation->>'authorId' is distinct from v_user::text)
  or (p_evaluation ? 'author_id' and p_evaluation->>'author_id' is distinct from v_user::text) then
  raise exception 'evaluation author does not match account' using errcode='42501'; end if;
 if (p_evaluation ? 'id' and p_evaluation->>'id' is distinct from p_evaluation_id::text)
  or (p_evaluation ? 'postId' and p_evaluation->>'postId' is distinct from p_post_id)
  or not public.review_public_valid_date(p_evaluation->>'date')
  or (p_evaluation ? 'text' and (jsonb_typeof(p_evaluation->'text') is distinct from 'string' or length(p_evaluation->>'text')>50000)) then
  raise exception 'invalid evaluation identity, date or text' using errcode='22023'; end if;
 v_score:=public.review_public_number(p_evaluation->'score');
 if p_evaluation ? 'score' and p_evaluation->'score'<>'null'::jsonb and (v_score is null or v_score not between 1 and 10 or trunc(v_score)<>v_score) then
  raise exception 'score must be an integer from 1 to 10' using errcode='22023'; end if;
 v_clean:=(public.review_public_project_replies(jsonb_build_array(p_evaluation||jsonb_build_object('id',p_evaluation_id::text)),v_user)->0)-'createdAt';
 if v_clean is null then raise exception 'evaluation cannot be empty' using errcode='22023'; end if;
 if p_evaluation ? 'images' and (jsonb_typeof(p_evaluation->'images') is distinct from 'array'
  or jsonb_array_length(v_clean->'images')<>jsonb_array_length(p_evaluation->'images')) then
  raise exception 'invalid evaluation image reference' using errcode='22023'; end if;
 select * into v_parent from public.review_community_lock_parent(p_post_id);
 if not found or (not v_parent.parent_public and v_parent.parent_author_id<>v_user) then raise exception 'evaluation parent unavailable' using errcode='P0002'; end if;
 select * into v_existing from public.review_community_evaluations where id=p_evaluation_id for update;
 if found then
  if v_existing.author_id<>v_user or v_existing.post_id<>p_post_id then raise exception 'evaluation belongs to another author or post' using errcode='42501'; end if;
  if v_existing.deleted_at is not null then raise exception 'evaluation no longer exists' using errcode='P0002'; end if;
  if v_existing.revision<>p_expected_revision then
   if v_existing.revision=p_expected_revision+1 and v_existing.payload=v_clean then return public.review_community_evaluation_json(v_existing); end if;
   raise exception 'evaluation changed; reload before saving' using errcode='40001';
  end if;
  if v_existing.payload=v_clean then return public.review_community_evaluation_json(v_existing); end if;
  update public.review_community_evaluations set payload=v_clean,revision=revision+1,updated_at=clock_timestamp()
   where id=p_evaluation_id returning * into v_existing;
 else
  if p_expected_revision<>0 then raise exception 'evaluation no longer exists' using errcode='P0002'; end if;
  insert into public.review_community_evaluations(id,post_id,author_id,payload) values(p_evaluation_id,p_post_id,v_user,v_clean)
   on conflict(id) do nothing returning * into v_existing;
  if not found then raise exception 'evaluation identity is already in use' using errcode='42501'; end if;
 end if;
 -- Comment edits must invalidate public detail data without moving the post in
 -- the feed or changing the private source/revision. No-op retries return above.
 update public.review_public_posts set updated_at=clock_timestamp() where id=p_post_id;
 return public.review_community_evaluation_json(v_existing);
end;
$$;
revoke all on function public.save_review_community_evaluation(text,uuid,bigint,jsonb,uuid) from public,anon;
grant execute on function public.save_review_community_evaluation(text,uuid,bigint,jsonb,uuid) to authenticated;

create or replace function public.delete_review_community_evaluation(p_post_id text,p_evaluation_id uuid,p_expected_revision bigint,p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_parent record;v_existing public.review_community_evaluations;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 if p_evaluation_id is null or p_expected_revision is null or p_expected_revision not between 1 and 2147483646 then raise exception 'invalid evaluation revision' using errcode='22023'; end if;
 select * into v_parent from public.review_community_lock_parent(p_post_id);
 if not found or (not v_parent.parent_public and v_parent.parent_author_id<>v_user) then raise exception 'evaluation parent unavailable' using errcode='P0002'; end if;
 select * into v_existing from public.review_community_evaluations where id=p_evaluation_id for update;
 if not found then raise exception 'evaluation no longer exists' using errcode='P0002'; end if;
 if v_existing.author_id<>v_user or v_existing.post_id<>p_post_id then raise exception 'evaluation belongs to another author or post' using errcode='42501'; end if;
 if v_existing.deleted_at is not null then
  if v_existing.revision<>p_expected_revision+1 then raise exception 'evaluation revision changed' using errcode='40001'; end if;
 elsif v_existing.revision<>p_expected_revision then raise exception 'evaluation changed; reload before deleting' using errcode='40001';
 else
  update public.review_community_evaluations set payload='{}'::jsonb,revision=revision+1,updated_at=clock_timestamp(),deleted_at=clock_timestamp() where id=p_evaluation_id;
  update public.review_public_posts set updated_at=clock_timestamp() where id=p_post_id;
 end if;
 return jsonb_build_object('id',p_evaluation_id,'postId',p_post_id,'deleted',true);
end;
$$;
revoke all on function public.delete_review_community_evaluation(text,uuid,bigint,uuid) from public,anon;
grant execute on function public.delete_review_community_evaluation(text,uuid,bigint,uuid) to authenticated;

-- Keep the established author self-evaluation projection unchanged. Community
-- evaluations are paginated separately; the shared action count includes both.
create or replace function public.review_public_post_json(p_post public.review_public_posts,p_viewer uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_post.id,'type',p_post.type,'sourceId',p_post.source_id,'authorId',p_post.author_id,
  'author',jsonb_build_object('nickname',coalesce(profile.nickname,'Quote 用户'),'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_post.author_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
  'text',p_post.text,'date',p_post.record_date,'stocks',p_post.stocks,'images',p_post.images,'market',p_post.market,'replies',p_post.replies,
  'commentCount',jsonb_array_length(p_post.replies)+(select count(*) from public.review_community_evaluations where post_id=p_post.id and deleted_at is null),
  'publishedAt',p_post.published_at,'updatedAt',p_post.updated_at,
  'likeCount',(select count(*) from public.review_public_likes where post_id=p_post.id),
  'liked',exists(select 1 from public.review_public_likes where post_id=p_post.id and user_id=p_viewer))
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_post.author_id;
$$;
revoke all on function public.review_public_post_json(public.review_public_posts,uuid) from public,anon,authenticated;

create or replace function public.review_public_asset_visible(p_bucket text,p_path text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or p_path is null or length(p_path)>200 then return false; end if;
 if p_bucket='review-journal-images' then
  return exists(select 1 from public.review_public_posts post where split_part(p_path,'/',1)=post.author_id::text
   and (post.images @> jsonb_build_array(jsonb_build_object('path',p_path)) or exists(select 1 from jsonb_array_elements(post.replies) reply where reply->'images' @> jsonb_build_array(jsonb_build_object('path',p_path)))))
   or exists(select 1 from public.review_community_evaluations evaluation cross join lateral public.review_community_parent(evaluation.post_id) parent
    where evaluation.deleted_at is null and split_part(p_path,'/',1)=evaluation.author_id::text
     and evaluation.payload->'images' @> jsonb_build_array(jsonb_build_object('path',p_path))
     and (parent.parent_public or parent.parent_author_id=v_user));
 elsif p_bucket='community-avatars' then
  return exists(select 1 from public.community_profiles profile where profile.avatar_path=p_path and split_part(p_path,'/',1)=profile.user_id::text
   and p_path ~ ('^'||profile.user_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$')
   and (exists(select 1 from public.review_public_posts post where post.author_id=profile.user_id)
    or exists(select 1 from public.review_community_evaluations evaluation cross join lateral public.review_community_parent(evaluation.post_id) parent
     where evaluation.author_id=profile.user_id and evaluation.deleted_at is null and (parent.parent_public or parent.parent_author_id=v_user))));
 end if;
 return false;
end;
$$;
revoke all on function public.review_public_asset_visible(text,text) from public,anon;
grant execute on function public.review_public_asset_visible(text,text) to authenticated;

commit;
