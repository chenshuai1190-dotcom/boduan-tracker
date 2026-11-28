-- Publication metadata is optional. Old rows are deliberately not backfilled.
begin;

alter table public.review_public_posts add column if not exists activity_time_zone text;

-- Test named IANA zones directly. Avoid scanning pg_timezone_names for every
-- reply, and exclude abbreviations and numeric/POSIX timezone expressions.
create or replace function public.review_activity_zone_field(p_zone text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
begin
 if p_zone is null or length(p_zone)>100 or p_zone !~ '^(UTC|GMT|(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc|US|Canada|Brazil|Chile|Mexico)/[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)?)$' then
  return '{}'::jsonb;
 end if;
 perform timezone(p_zone, timestamp '2000-01-01');
 return jsonb_build_object('activityTimeZone',p_zone);
exception when invalid_parameter_value then return '{}'::jsonb;
end;
$$;
revoke all on function public.review_activity_zone_field(text) from public,anon,authenticated;

-- Old clients replace the JSON document when editing. Keep the original zone
-- (including its absence) for a post and for each surviving author reply ID.
create or replace function public.preserve_review_activity_zones()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 previous_replies jsonb := '[]'::jsonb;
 previous_zones jsonb;
 preserved_replies jsonb;
begin
 if tg_op='UPDATE' then
  if new.review_data is not distinct from old.review_data then return new; end if;
  new.review_data := (new.review_data - 'activityTimeZone') || public.review_activity_zone_field(old.review_data->>'activityTimeZone');
  if new.review_data->'replies' is not distinct from old.review_data->'replies' then return new; end if;
  if jsonb_typeof(old.review_data->'replies')='array' then previous_replies := old.review_data->'replies'; end if;
 else
  new.review_data := (new.review_data - 'activityTimeZone') || public.review_activity_zone_field(new.review_data->>'activityTimeZone');
 end if;
 if jsonb_typeof(new.review_data->'replies') is distinct from 'array' or new.review_data->'replies'='[]'::jsonb then return new; end if;
 select coalesce(jsonb_object_agg(r->>'id', public.review_activity_zone_field(r->>'activityTimeZone')), '{}'::jsonb)
 into previous_zones from jsonb_array_elements(previous_replies) r where jsonb_typeof(r->'id')='string';
 select jsonb_agg(case when jsonb_typeof(r)='object' then (r - 'activityTimeZone') ||
  coalesce(previous_zones->(r->>'id'),public.review_activity_zone_field(r->>'activityTimeZone')) else r end order by n)
 into preserved_replies from jsonb_array_elements(new.review_data->'replies') with ordinality as replies(r,n);
 new.review_data := jsonb_set(new.review_data,'{replies}',preserved_replies);
 return new;
end;
$$;
revoke all on function public.preserve_review_activity_zones() from public,anon,authenticated;

drop trigger if exists review_logs_activity_zone on public.review_logs;
create trigger review_logs_activity_zone before insert or update of review_data on public.review_logs
 for each row execute function public.preserve_review_activity_zones();
drop trigger if exists disciplines_activity_zone on public.disciplines;
create trigger disciplines_activity_zone before insert or update of review_data on public.disciplines
 for each row execute function public.preserve_review_activity_zones();

create or replace function public.review_public_project_replies(p_value jsonb,p_author uuid)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public as $$
declare v_reply jsonb;v_result jsonb:='[]'::jsonb;v_seen text[]:='{}';v_id text;v_date text;v_text text;v_mood text;v_score numeric;
 v_images jsonb;v_stocks jsonb;v_tags jsonb;v_market jsonb;v_account jsonb;v_trades jsonb;v_clean jsonb;
begin
 if jsonb_typeof(p_value) is distinct from 'array' or p_author is null then return v_result; end if;
 for v_reply in select value from jsonb_array_elements(p_value) limit 500 loop
  v_id:=case when jsonb_typeof(v_reply->'id')='string' then btrim(v_reply->>'id') end;
  v_date:=case when public.review_public_valid_date(v_reply->>'date') then v_reply->>'date'
   when jsonb_typeof(v_reply->'createdAt')='string' and public.review_public_valid_date(left(v_reply->>'createdAt',10)) then left(v_reply->>'createdAt',10) end;
  if jsonb_typeof(v_reply) is distinct from 'object' or v_id is null or length(v_id) not between 1 and 100 or v_id ~ '[[:cntrl:]]' or v_id=any(v_seen) or v_date is null then continue; end if;
  v_text:=case when jsonb_typeof(v_reply->'text')='string' then left(btrim(v_reply->>'text'),50000) else '' end;
  v_mood:=case when jsonb_typeof(v_reply->'mood')='string' then left(btrim(v_reply->>'mood'),100) else '' end;
  v_score:=public.review_public_number(v_reply->'score');
  if v_score is null or v_score not between 1 and 10 or trunc(v_score)<>v_score then v_score:=null; end if;
  v_images:=public.review_public_reply_images(v_reply->'images',p_author);
  v_market:=public.review_public_project_market(v_reply->'market');
  v_account:=public.review_public_reply_account(v_reply->'account');
  v_trades:=public.review_public_reply_trades(v_reply->'trades');
  select coalesce(jsonb_agg(symbol order by first_ordinal),'[]'::jsonb) into v_stocks from (
   select upper(btrim(item#>>'{}')) as symbol,min(ordinal) as first_ordinal
   from jsonb_array_elements(case when jsonb_typeof(v_reply->'stocks')='array' then v_reply->'stocks' else '[]'::jsonb end) with ordinality stock(item,ordinal)
   where ordinal<=20 and jsonb_typeof(item)='string' and upper(btrim(item#>>'{}')) ~ '^[A-Z0-9^][A-Z0-9.^=-]{0,19}$' group by 1) symbols;
  select coalesce(jsonb_agg(tag order by ordinal),'[]'::jsonb) into v_tags from (
   select distinct on (lower(tag)) tag,ordinal from (
    select regexp_replace(btrim(item#>>'{}'),'[[:space:]]+',' ','g') as tag,ordinal
    from jsonb_array_elements(case when jsonb_typeof(v_reply->'tags')='array' then v_reply->'tags' else '[]'::jsonb end) with ordinality tags(item,ordinal) where jsonb_typeof(item)='string'
   ) valid_tags where length(tag) between 1 and 12 and tag !~ '[[:cntrl:]]' order by lower(tag),ordinal
  ) distinct_tags where ordinal<=8;
  if v_text='' and v_mood='' and v_score is null and jsonb_array_length(v_images)=0 and jsonb_array_length(v_stocks)=0 and jsonb_array_length(v_tags)=0 and v_market is null and v_account is null and jsonb_array_length(v_trades)=0 then continue; end if;
  v_seen:=array_append(v_seen,v_id);
  v_clean:=jsonb_build_object('id',v_id,'date',v_date,'text',v_text,'mood',v_mood,'score',v_score,'tags',v_tags,'images',v_images,'stocks',v_stocks,'market',v_market,'account',v_account,'trades',v_trades);
  if jsonb_typeof(v_reply->'createdAt')='string' and v_reply->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d+)?(Z|[+-]\d{2}:\d{2})$' and public.review_public_valid_date(left(v_reply->>'createdAt',10)) then
   begin
    perform (v_reply->>'createdAt')::timestamptz;
    v_clean:=v_clean||jsonb_build_object('createdAt',v_reply->>'createdAt');
   exception when others then null;
   end;
  end if;
  v_result:=v_result||jsonb_build_array(v_clean||public.review_activity_zone_field(v_reply->>'activityTimeZone'));
 end loop;
 return v_result;
end;
$$;

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
 insert into public.review_public_posts(id,type,source_id,author_id,text,record_date,stocks,images,market,replies,published_at,activity_time_zone)
  values(v_id,v_type,v_row->>'id',v_author,left(coalesce(v_row->>'text',''),50000),v_date,v_stocks,v_images,
   public.review_public_project_market(v_data->'market'),public.review_public_project_replies(v_data->'replies',v_author),v_created,public.review_activity_zone_field(v_data->>'activityTimeZone')->>'activityTimeZone')
  on conflict(id) do update set author_id=excluded.author_id,text=excluded.text,record_date=excluded.record_date,
   stocks=excluded.stocks,images=excluded.images,market=excluded.market,replies=excluded.replies,published_at=excluded.published_at,activity_time_zone=excluded.activity_time_zone,updated_at=clock_timestamp()
  where (review_public_posts.author_id,review_public_posts.text,review_public_posts.record_date,review_public_posts.stocks,review_public_posts.images,review_public_posts.market,review_public_posts.replies,review_public_posts.published_at,review_public_posts.activity_time_zone)
   is distinct from (excluded.author_id,excluded.text,excluded.record_date,excluded.stocks,excluded.images,excluded.market,excluded.replies,excluded.published_at,excluded.activity_time_zone);
 return new;
end;
$$;

create or replace function public.review_public_post_json(p_post public.review_public_posts,p_viewer uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_post.id,'type',p_post.type,'sourceId',p_post.source_id,'authorId',p_post.author_id,
  'author',jsonb_build_object('isAssistant',exists(select 1 from public.quote_assistant_identity where author_id=p_post.author_id),'nickname',case when exists(select 1 from public.quote_assistant_identity where author_id=p_post.author_id) then 'Quote' else coalesce(profile.nickname,'Quote 用户') end,'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_post.author_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
  'text',p_post.text,'date',p_post.record_date,'stocks',p_post.stocks,'images',p_post.images,'market',p_post.market,'replies',p_post.replies,
  'commentCount',jsonb_array_length(p_post.replies)+(select count(*) from public.review_community_evaluations where post_id=p_post.id and deleted_at is null),
  'publishedAt',p_post.published_at,'updatedAt',p_post.updated_at,
  'likeCount',(select count(*) from public.review_public_likes where post_id=p_post.id),
  'liked',exists(select 1 from public.review_public_likes where post_id=p_post.id and user_id=p_viewer)) ||
  case when p_post.activity_time_zone is null then '{}'::jsonb else jsonb_build_object('activityTimeZone',p_post.activity_time_zone) end
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_post.author_id;
$$;

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
  -- Merge immutable publication metadata before CAS and idempotent-retry comparisons.
  v_clean:=(v_clean-'activityTimeZone')||public.review_activity_zone_field(v_existing.payload->>'activityTimeZone');
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

commit;
