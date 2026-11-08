-- Additive public activity layer. Existing journal/profile/ledger RLS stays owner-only.
-- Apply after review-journal.sql and community-profile-avatar.sql. No legacy posts
-- are published by this migration; only an explicit future visibility=public save
-- creates a projection. Public means authenticated Quote users, never anonymous.
begin;

create table if not exists public.review_public_posts (
  id text primary key,
  type text not null check (type in ('log', 'insight')),
  source_id text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  record_date date not null,
  stocks jsonb not null default '[]'::jsonb check (jsonb_typeof(stocks) = 'array'),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  market jsonb,
  published_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (type, source_id),
  check (id = type || ':' || source_id)
);
create index if not exists review_public_posts_published_idx on public.review_public_posts (published_at desc, id desc);
create index if not exists review_public_posts_author_idx on public.review_public_posts (author_id);

create table if not exists public.review_public_likes (
  post_id text not null references public.review_public_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (post_id, user_id)
);
create index if not exists review_public_likes_user_idx on public.review_public_likes (user_id, post_id);
alter table public.review_public_posts enable row level security;
alter table public.review_public_likes enable row level security;
-- Consumers use the bounded RPCs below; no client may mutate projections or likes
-- directly, even if another deployment previously granted schema-wide defaults.
revoke all on public.review_public_posts, public.review_public_likes from public, anon, authenticated;

create or replace function public.review_public_project_market(p_market jsonb)
returns jsonb language plpgsql immutable security invoker
set search_path = pg_catalog, public as $$
declare v_items jsonb;
begin
  if jsonb_typeof(p_market) is distinct from 'object'
     or p_market->>'kind' is distinct from 'market_snapshot'
     or p_market->>'basis' is distinct from 'close'
     or coalesce(p_market->>'asOfDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_market->>'recordDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or jsonb_typeof(p_market->'items') is distinct from 'array' then return null; end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'key', item->>'key', 'value', item->'value',
    'asOfDate', p_market->>'asOfDate', 'basis', 'close',
    'source', case when item->>'key' = 'fearGreed' then 'CNN' else 'CBOE' end,
    'vix', case when item->>'key' = 'ratio' and jsonb_typeof(item->'vix') = 'number' then item->'vix' end,
    'vix3m', case when item->>'key' = 'ratio' and jsonb_typeof(item->'vix3m') = 'number' then item->'vix3m' end,
    'stateCode', case when item->>'stateCode' in ('LOW_VOLATILITY','NORMAL','ELEVATED','HIGH_STRESS','EXTREME_STRESS','CLOSE','NORMAL_TERM_STRUCTURE','NEAR_FLAT','INVERTED','DEEP_INVERTED') then item->>'stateCode' else 'CLOSE' end
  )) order by ordinal), '[]'::jsonb) into v_items
  from jsonb_array_elements(p_market->'items') with ordinality as items(item, ordinal)
  where ordinal <= 3 and jsonb_typeof(item) = 'object'
    and item->>'key' in ('vix','ratio','fearGreed') and jsonb_typeof(item->'value') = 'number';
  if jsonb_array_length(v_items) = 0 then return null; end if;
  return jsonb_build_object('version', 1, 'kind', 'market_snapshot', 'basis', 'close',
    'asOfDate', p_market->>'asOfDate', 'recordDate', p_market->>'recordDate', 'items', v_items);
end;
$$;
revoke all on function public.review_public_project_market(jsonb) from public, anon, authenticated;

create or replace function public.sync_review_public_post()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_row jsonb; v_data jsonb; v_type text; v_id text; v_author uuid;
  v_stocks jsonb; v_images jsonb; v_date date;
begin
  if TG_TABLE_SCHEMA <> 'public' or TG_TABLE_NAME not in ('disciplines', 'review_logs') then
    raise exception 'unsupported public activity source' using errcode = '42501';
  end if;
  v_type := case TG_TABLE_NAME when 'disciplines' then 'insight' else 'log' end;
  v_row := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id := v_type || ':' || (v_row->>'id');
  if TG_OP = 'UPDATE' and (old.id is distinct from new.id or old.user_id is distinct from new.user_id) then
    delete from public.review_public_posts where id = v_type || ':' || old.id::text;
  end if;
  v_data := coalesce(v_row->'review_data', '{}'::jsonb);
  if TG_OP = 'DELETE' or v_data->>'visibility' is distinct from 'public'
    or (v_data ? 'timelineEvent' and v_data->'timelineEvent' <> 'null'::jsonb) then
    delete from public.review_public_posts where id = v_id;
    return case when TG_OP = 'DELETE' then old else new end;
  end if;
  v_author := (v_row->>'user_id')::uuid;
  v_date := coalesce(v_row->>'log_date', v_data->>'date', substring(v_row->>'created_at' from 1 for 10))::date;
  select coalesce(jsonb_agg(symbol order by ordinal), '[]'::jsonb) into v_stocks
    from jsonb_array_elements(case when jsonb_typeof(v_data->'stocks') = 'array' then v_data->'stocks' else '[]'::jsonb end) with ordinality as stock(symbol, ordinal)
    where ordinal <= 20 and jsonb_typeof(symbol) = 'string' and symbol #>> '{}' ~ '^[A-Z0-9^][A-Z0-9.^=-]{0,19}$';
  select coalesce(jsonb_agg(jsonb_build_object(
    'path', item->>'path', 'mimeType', item->>'mimeType', 'size', item->'size', 'name', left(coalesce(item->>'name','图片'),255)
  ) order by ordinal), '[]'::jsonb) into v_images
    from jsonb_array_elements(case when jsonb_typeof(v_data->'images') = 'array' then v_data->'images' else '[]'::jsonb end) with ordinality as image(item, ordinal)
    where ordinal <= 4 and jsonb_typeof(item) = 'object'
      and item->>'path' ~ ('^' || v_author::text || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[.](jpg|jpeg|png|webp)$')
      and ((item->>'mimeType'='image/jpeg' and item->>'path' ~ '[.](jpg|jpeg)$')
        or (item->>'mimeType'='image/png' and item->>'path' ~ '[.]png$')
        or (item->>'mimeType'='image/webp' and item->>'path' ~ '[.]webp$'))
      and jsonb_typeof(item->'size') = 'number'
      and (case when jsonb_typeof(item->'size') = 'number' then (item->>'size')::numeric between 1 and 10485760
        and trunc((item->>'size')::numeric)=(item->>'size')::numeric else false end);
  insert into public.review_public_posts(id,type,source_id,author_id,text,record_date,stocks,images,market)
    values(v_id,v_type,v_row->>'id',v_author,left(coalesce(v_row->>'text',''),50000),v_date,v_stocks,v_images,public.review_public_project_market(v_data->'market'))
    on conflict(id) do update set author_id=excluded.author_id,text=excluded.text,record_date=excluded.record_date,
      stocks=excluded.stocks,images=excluded.images,market=excluded.market,updated_at=clock_timestamp()
      -- A private evaluation/score edit must not reveal an update timestamp on
      -- the public post. Only the public projection can change this timestamp.
      where (review_public_posts.author_id,review_public_posts.text,review_public_posts.record_date,review_public_posts.stocks,review_public_posts.images,review_public_posts.market)
        is distinct from (excluded.author_id,excluded.text,excluded.record_date,excluded.stocks,excluded.images,excluded.market);
  return new;
end;
$$;
revoke all on function public.sync_review_public_post() from public, anon, authenticated;
drop trigger if exists disciplines_sync_public_post on public.disciplines;
create trigger disciplines_sync_public_post after insert or update or delete on public.disciplines for each row execute function public.sync_review_public_post();
drop trigger if exists review_logs_sync_public_post on public.review_logs;
create trigger review_logs_sync_public_post after insert or update or delete on public.review_logs for each row execute function public.sync_review_public_post();

-- Private helper, called only by authenticated RPCs. Identity is limited to the
-- already public author's nickname and avatar; no profile row or ledger leaks.
create or replace function public.review_public_post_json(p_post public.review_public_posts, p_viewer uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select jsonb_build_object('id',p_post.id,'type',p_post.type,'sourceId',p_post.source_id,'authorId',p_post.author_id,
    'author',jsonb_build_object('nickname',coalesce(profile.nickname,'Quote 用户'),'avatarKey',coalesce(profile.avatar_key,'gold'),
      'avatarPath',case when profile.avatar_path ~ ('^' || p_post.author_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
    'text',p_post.text,'date',p_post.record_date,'stocks',p_post.stocks,'images',p_post.images,'market',p_post.market,
    'publishedAt',p_post.published_at,'updatedAt',p_post.updated_at,
    'likeCount',(select count(*) from public.review_public_likes where post_id=p_post.id),
    'liked',exists(select 1 from public.review_public_likes where post_id=p_post.id and user_id=p_viewer))
  from (select 1) as one left join public.community_profiles profile on profile.user_id=p_post.author_id;
$$;
revoke all on function public.review_public_post_json(public.review_public_posts, uuid) from public, anon, authenticated;

-- Remove earlier unbound signatures as well: a defaulted new argument must not
-- leave an older overload available that can act as the newly signed-in user.
drop function if exists public.fetch_review_public_feed(integer,timestamptz,text,text,text);
drop function if exists public.read_review_public_post(text);
drop function if exists public.set_review_public_like(text,boolean);

create or replace function public.fetch_review_public_feed(p_limit integer default 20, p_before timestamptz default null,
  p_before_id text default null, p_query text default '', p_symbol text default '', p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_user uuid := auth.uid(); v_limit integer; v_candidates jsonb; v_posts jsonb; v_last jsonb; v_more boolean;
begin
  if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
  v_limit := greatest(1,least(coalesce(p_limit,20),50));
  if (p_before is null) <> (p_before_id is null) or length(coalesce(p_before_id,'')) > 150
     or length(coalesce(p_query,'')) > 200 or length(coalesce(p_symbol,'')) > 20 then
    raise exception 'invalid public feed cursor or filter' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(public.review_public_post_json(post,v_user) order by post.published_at desc, post.id desc),'[]'::jsonb)
    into v_candidates from (
      select * from public.review_public_posts
      where (p_before is null or (published_at,id) < (p_before,p_before_id))
        and (coalesce(p_symbol,'')='' or stocks @> jsonb_build_array(upper(p_symbol)))
        and (coalesce(p_query,'')='' or position(lower(p_query) in lower(text || ' ' || stocks::text || ' ' || record_date::text)) > 0)
      order by published_at desc,id desc limit v_limit+1
    ) post;
  v_more := jsonb_array_length(v_candidates)>v_limit;
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into v_posts
    from jsonb_array_elements(v_candidates) with ordinality as candidate(item,ordinal) where ordinal<=v_limit;
  v_last := v_posts->(jsonb_array_length(v_posts)-1);
  return jsonb_build_object('posts',v_posts,'hasMore',v_more,'nextCursor',case when v_more then jsonb_build_object('publishedAt',v_last->'publishedAt','id',v_last->'id') else null end);
end;
$$;
revoke all on function public.fetch_review_public_feed(integer,timestamptz,text,text,text,uuid) from public, anon;
grant execute on function public.fetch_review_public_feed(integer,timestamptz,text,text,text,uuid) to authenticated;

create or replace function public.read_review_public_post(p_post_id text,p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_user uuid:=auth.uid(); v_post public.review_public_posts;
begin
  if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
  if p_post_id is null or length(p_post_id)>150 then raise exception 'invalid post id' using errcode='22023'; end if;
  select * into v_post from public.review_public_posts where id=p_post_id;
  if not found then return null; end if;
  return public.review_public_post_json(v_post,v_user);
end;
$$;
revoke all on function public.read_review_public_post(text,uuid) from public, anon;
grant execute on function public.read_review_public_post(text,uuid) to authenticated;

create or replace function public.set_review_public_like(p_post_id text,p_liked boolean,p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_user uuid:=auth.uid(); v_count bigint;
begin
  if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
  if p_post_id is null or length(p_post_id)>150 or p_liked is null then raise exception 'invalid like request' using errcode='22023'; end if;
  -- Serialise like writes with retraction/deletion and with other likes on the
  -- same post. A revoked post cannot receive an orphan like after this check.
  perform 1 from public.review_public_posts where id=p_post_id for update;
  if not found then raise exception 'public post unavailable' using errcode='P0002'; end if;
  if p_liked then
    insert into public.review_public_likes(post_id,user_id) values(p_post_id,v_user) on conflict(post_id,user_id) do nothing;
  else delete from public.review_public_likes where post_id=p_post_id and user_id=v_user; end if;
  select count(*) into v_count from public.review_public_likes where post_id=p_post_id;
  return jsonb_build_object('postId',p_post_id,'likeCount',v_count,'liked',p_liked);
end;
$$;
revoke all on function public.set_review_public_like(text,boolean,uuid) from public, anon;
grant execute on function public.set_review_public_like(text,boolean,uuid) to authenticated;

create or replace function public.review_public_asset_visible(p_bucket text,p_path text)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or p_path is null or length(p_path)>200 then return false; end if;
  if p_bucket='review-journal-images' then
    return exists(select 1 from public.review_public_posts post, jsonb_array_elements(post.images) image
      where image->>'path'=p_path and split_part(p_path,'/',1)=post.author_id::text);
  elsif p_bucket='community-avatars' then
    return exists(select 1 from public.community_profiles profile
      where profile.avatar_path=p_path and split_part(p_path,'/',1)=profile.user_id::text
        and p_path ~ ('^' || profile.user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$')
        and exists(select 1 from public.review_public_posts post where post.author_id=profile.user_id));
  end if;
  return false;
end;
$$;
revoke all on function public.review_public_asset_visible(text,text) from public, anon;
grant execute on function public.review_public_asset_visible(text,text) to authenticated;
drop policy if exists "public activity referenced images read" on storage.objects;
create policy "public activity referenced images read" on storage.objects for select to authenticated
  using (bucket_id='review-journal-images' and public.review_public_asset_visible(bucket_id,name));
drop policy if exists "public activity author avatars read" on storage.objects;
create policy "public activity author avatars read" on storage.objects for select to authenticated
  using (bucket_id='community-avatars' and public.review_public_asset_visible(bucket_id,name));

commit;
