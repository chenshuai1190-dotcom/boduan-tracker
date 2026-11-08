-- Forward-only original-post chronology and community reply targets.
-- Apply after review_community_evaluations_20261108.sql. Old RPC signatures stay
-- callable during rollout. No original journal, author evaluation or like moves.
begin;

create index if not exists review_public_posts_record_date_idx on public.review_public_posts(record_date desc,published_at desc,id desc);

create or replace function public.sync_review_public_post()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row jsonb;v_data jsonb;v_type text;v_id text;v_author uuid;v_stocks jsonb;v_images jsonb;v_date date;v_created timestamptz;
begin
 if TG_TABLE_SCHEMA<>'public' or TG_TABLE_NAME not in ('disciplines','review_logs') then raise exception 'unsupported public activity source' using errcode='42501'; end if;
 v_type:=case TG_TABLE_NAME when 'disciplines' then 'insight' else 'log' end;
 v_row:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 v_id:=v_type||':'||(v_row->>'id');
 if TG_OP='UPDATE' and (old.id is distinct from new.id or old.user_id is distinct from new.user_id) then
  delete from public.review_public_posts where id=v_type||':'||old.id::text;
 end if;
 v_data:=coalesce(v_row->'review_data','{}'::jsonb);
 if TG_OP='DELETE' or v_data->>'visibility' is distinct from 'public'
  or (v_data ? 'timelineEvent' and v_data->'timelineEvent'<>'null'::jsonb) then
  delete from public.review_public_posts where id=v_id;
  return case when TG_OP='DELETE' then old else new end;
 end if;
 v_author:=(v_row->>'user_id')::uuid;
 v_date:=coalesce(v_row->>'log_date',v_data->>'date',substring(v_row->>'created_at' from 1 for 10))::date;
 v_created:=(v_row->>'created_at')::timestamptz;
 if v_created is null or not isfinite(v_created) then raise exception 'original post creation time unavailable' using errcode='22023'; end if;
 select coalesce(jsonb_agg(symbol order by ordinal),'[]'::jsonb) into v_stocks
  from jsonb_array_elements(case when jsonb_typeof(v_data->'stocks')='array' then v_data->'stocks' else '[]'::jsonb end) with ordinality stock(symbol,ordinal)
  where ordinal<=20 and jsonb_typeof(symbol)='string' and symbol#>>'{}' ~ '^[A-Z0-9^][A-Z0-9.^=-]{0,19}$';
 v_images:=public.review_public_reply_images(v_data->'images',v_author);
 insert into public.review_public_posts(id,type,source_id,author_id,text,record_date,stocks,images,market,replies,published_at)
  values(v_id,v_type,v_row->>'id',v_author,left(coalesce(v_row->>'text',''),50000),v_date,v_stocks,v_images,
   public.review_public_project_market(v_data->'market'),public.review_public_project_replies(v_data->'replies',v_author),v_created)
  on conflict(id) do update set author_id=excluded.author_id,text=excluded.text,record_date=excluded.record_date,
   stocks=excluded.stocks,images=excluded.images,market=excluded.market,replies=excluded.replies,published_at=excluded.published_at,updated_at=clock_timestamp()
  where (review_public_posts.author_id,review_public_posts.text,review_public_posts.record_date,review_public_posts.stocks,review_public_posts.images,review_public_posts.market,review_public_posts.replies,review_public_posts.published_at)
   is distinct from (excluded.author_id,excluded.text,excluded.record_date,excluded.stocks,excluded.images,excluded.market,excluded.replies,excluded.published_at);
 return new;
end;
$$;
revoke all on function public.sync_review_public_post() from public,anon,authenticated;

-- Repair only the time fields of projections that are already explicitly public.
-- Missing source timestamps are left intact for diagnosis, never replaced by now.
update public.review_public_posts post set published_at=source.created_at,updated_at=clock_timestamp()
from (
 select 'log:'||id::text as id,user_id,created_at,review_data from public.review_logs
 union all select 'insight:'||id::text,user_id,created_at,review_data from public.disciplines
) source
where source.id=post.id and source.user_id=post.author_id and source.review_data->>'visibility'='public'
 and not (source.review_data ? 'timelineEvent' and source.review_data->'timelineEvent'<>'null'::jsonb)
 and source.created_at is not null and isfinite(source.created_at) and post.published_at is distinct from source.created_at;

create or replace function public.fetch_review_public_feed_v2(p_limit integer default 20,p_before_date date default null,
 p_before timestamptz default null,p_before_id text default null,p_query text default '',p_symbol text default '',p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_limit integer;v_candidates jsonb;v_posts jsonb;v_last jsonb;v_more boolean;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 if ((p_before_date is null or p_before is null or p_before_id is null) and not (p_before_date is null and p_before is null and p_before_id is null))
  or (p_before_date is not null and not isfinite(p_before_date)) or (p_before is not null and not isfinite(p_before))
  or length(coalesce(p_before_id,''))>150 or length(coalesce(p_query,''))>200 or length(coalesce(p_symbol,''))>20 then
  raise exception 'invalid public feed cursor or filter' using errcode='22023'; end if;
 v_limit:=greatest(1,least(coalesce(p_limit,20),50));
 select coalesce(jsonb_agg(public.review_public_post_json(post,v_user) order by post.record_date desc,post.published_at desc,post.id desc),'[]'::jsonb)
  into v_candidates from (select * from public.review_public_posts
   where (p_before_date is null or (record_date,published_at,id)<(p_before_date,p_before,p_before_id))
    and (coalesce(p_symbol,'')='' or stocks @> jsonb_build_array(upper(p_symbol)))
    and (coalesce(p_query,'')='' or position(lower(p_query) in lower(text||' '||stocks::text||' '||record_date::text))>0)
   order by record_date desc,published_at desc,id desc limit v_limit+1) post;
 v_more:=jsonb_array_length(v_candidates)>v_limit;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into v_posts
  from jsonb_array_elements(v_candidates) with ordinality candidates(item,ordinal) where ordinal<=v_limit;
 v_last:=v_posts->(jsonb_array_length(v_posts)-1);
 return jsonb_build_object('posts',v_posts,'hasMore',v_more,'nextCursor',case when v_more then
  jsonb_build_object('recordDate',v_last->'date','publishedAt',v_last->'publishedAt','id',v_last->'id') else null end);
end;
$$;
revoke all on function public.fetch_review_public_feed_v2(integer,date,timestamptz,text,text,text,uuid) from public,anon;
grant execute on function public.fetch_review_public_feed_v2(integer,date,timestamptz,text,text,text,uuid) to authenticated;

alter table public.review_community_evaluations add column if not exists reply_to_kind text,
 add column if not exists reply_to_id text,add column if not exists reply_to_author_id uuid;
alter table public.review_community_evaluations drop constraint if exists review_community_evaluations_reply_target_check;
alter table public.review_community_evaluations add constraint review_community_evaluations_reply_target_check check (
 (reply_to_kind is null and reply_to_id is null and reply_to_author_id is null)
 or (reply_to_kind is not null and reply_to_kind in ('author','community') and reply_to_id is not null and reply_to_author_id is not null
  and length(reply_to_id) between 1 and 100 and reply_to_id !~ '[[:cntrl:]]')
);

-- Target identities are resolved only within the same original parent. The
-- pointer stores identity, never a copy of the target text, score or attachments.
create or replace function public.review_community_reply_target(p_post_id text,p_kind text,p_id text)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_author uuid;v_replies jsonb;
begin
 if p_kind='community' then
  if p_id is null or p_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return null; end if;
  select author_id into v_author from public.review_community_evaluations where id=p_id::uuid and post_id=p_post_id and deleted_at is null;
  return v_author;
 elsif p_kind<>'author' or p_kind is null or p_post_id is null or length(p_post_id)>150 then return null; end if;
 if left(p_post_id,4)='log:' then
  select user_id,review_data->'replies' into v_author,v_replies from public.review_logs where id::text=substring(p_post_id from 5);
 elsif left(p_post_id,8)='insight:' then
  select user_id,review_data->'replies' into v_author,v_replies from public.disciplines where id::text=substring(p_post_id from 9);
 else return null; end if;
 if v_author is not null and exists(select 1 from jsonb_array_elements(public.review_public_project_replies(v_replies,v_author)) reply where reply->>'id'=p_id) then return v_author; end if;
 return null;
end;
$$;
revoke all on function public.review_community_reply_target(text,text,text) from public,anon,authenticated;

create or replace function public.review_community_evaluation_json(p_evaluation public.review_community_evaluations)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select p_evaluation.payload||jsonb_build_object('id',p_evaluation.id,'postId',p_evaluation.post_id,'authorId',p_evaluation.author_id,
  'revision',p_evaluation.revision,'createdAt',p_evaluation.created_at,'updatedAt',p_evaluation.updated_at,
  'author',jsonb_build_object('nickname',coalesce(profile.nickname,'Quote 用户'),'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_evaluation.author_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
  'replyTo',case when p_evaluation.reply_to_kind is not null then jsonb_build_object('kind',p_evaluation.reply_to_kind,'id',p_evaluation.reply_to_id,
   'authorId',p_evaluation.reply_to_author_id,'nickname',coalesce(target_profile.nickname,'Quote 用户'),
   'available',coalesce(public.review_community_reply_target(p_evaluation.post_id,p_evaluation.reply_to_kind,p_evaluation.reply_to_id)=p_evaluation.reply_to_author_id,false)) else null end)
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_evaluation.author_id
  left join public.community_profiles target_profile on target_profile.user_id=p_evaluation.reply_to_author_id;
$$;
revoke all on function public.review_community_evaluation_json(public.review_community_evaluations) from public,anon,authenticated;

create or replace function public.save_review_community_evaluation_v2(p_post_id text,p_evaluation_id uuid,p_expected_revision bigint,
 p_evaluation jsonb,p_reply_to jsonb default null,p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_parent record;v_existing public.review_community_evaluations;v_exists boolean;v_kind text;v_id text;v_target_author uuid;v_result jsonb;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 if p_reply_to is not null and p_reply_to<>'null'::jsonb then
  if jsonb_typeof(p_reply_to) is distinct from 'object' or jsonb_typeof(p_reply_to->'kind') is distinct from 'string'
   or jsonb_typeof(p_reply_to->'id') is distinct from 'string' then raise exception 'invalid reply target' using errcode='22023'; end if;
  v_kind:=p_reply_to->>'kind';v_id:=btrim(p_reply_to->>'id');
  if v_kind not in ('author','community') or length(v_id) not between 1 and 100 or v_id ~ '[[:cntrl:]]'
   or p_reply_to-array['kind','id']<>'{}'::jsonb then
   raise exception 'invalid reply target' using errcode='22023'; end if;
  if v_kind='community' then
   if v_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'invalid community reply target' using errcode='22023'; end if;
   v_id:=v_id::uuid::text;
  end if;
 end if;
 select * into v_parent from public.review_community_lock_parent(p_post_id);
 if not found or (not v_parent.parent_public and v_parent.parent_author_id<>v_user) then raise exception 'evaluation parent unavailable' using errcode='P0002'; end if;
 select * into v_existing from public.review_community_evaluations where id=p_evaluation_id for update;
 v_exists:=found;
 if v_exists then
  if v_existing.author_id<>v_user or v_existing.post_id<>p_post_id then raise exception 'evaluation belongs to another author or post' using errcode='42501'; end if;
  if v_kind is not null and (v_existing.reply_to_kind is distinct from v_kind or v_existing.reply_to_id is distinct from v_id) then
   raise exception 'reply target cannot change after creation' using errcode='22023'; end if;
 elsif v_kind is not null then
  v_target_author:=public.review_community_reply_target(p_post_id,v_kind,v_id);
  if v_target_author is null then raise exception 'reply target no longer exists in this post' using errcode='P0002'; end if;
 end if;
 -- The original CAS writer preserves the new columns for old clients too.
 -- Future notification outbox writes must happen after final target attachment,
 -- once per actual mutation in this transaction. A v1/INSERT-only hook would
 -- miss the reply recipient at this point; idempotent retries must emit nothing.
 v_result:=public.save_review_community_evaluation(p_post_id,p_evaluation_id,p_expected_revision,p_evaluation,p_expected_user_id);
 if not v_exists and v_kind is not null then
  update public.review_community_evaluations set reply_to_kind=v_kind,reply_to_id=v_id,reply_to_author_id=v_target_author
   where id=p_evaluation_id returning * into v_existing;
  return public.review_community_evaluation_json(v_existing);
 end if;
 return v_result;
end;
$$;
revoke all on function public.save_review_community_evaluation_v2(text,uuid,bigint,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.save_review_community_evaluation_v2(text,uuid,bigint,jsonb,jsonb,uuid) to authenticated;

commit;
