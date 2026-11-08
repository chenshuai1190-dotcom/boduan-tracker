-- Forward-only extension of review_public_activity_20261108.sql.
-- Explicitly public ordinary posts now share their complete author evaluations.
-- Existing private source RLS and owner-only evaluation writes are unchanged.
-- Backfill only already-published projections; never publish legacy/private rows.
begin;

alter table public.review_public_posts add column if not exists replies jsonb not null default '[]'::jsonb;
alter table public.review_public_posts drop constraint if exists review_public_posts_replies_check;
alter table public.review_public_posts add constraint review_public_posts_replies_check
  check (jsonb_typeof(replies)='array' and jsonb_array_length(replies)<=500);

create or replace function public.review_public_valid_date(p_value text)
returns boolean language plpgsql immutable security invoker
set search_path=pg_catalog,public as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' or left(p_value,4)='0000' then return false; end if;
  return to_char(p_value::date,'YYYY-MM-DD')=p_value;
exception when others then return false;
end;
$$;
revoke all on function public.review_public_valid_date(text) from public,anon,authenticated;

create or replace function public.review_public_number(p_value jsonb)
returns numeric language plpgsql immutable security invoker
set search_path=pg_catalog,public as $$
declare v_number numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'number' then return null; end if;
  v_number:=(p_value#>>'{}')::numeric;
  if abs(v_number)>1.7976931348623157e308 then return null; end if;
  return v_number;
exception when others then return null;
end;
$$;
revoke all on function public.review_public_number(jsonb) from public,anon,authenticated;

create or replace function public.review_public_reply_images(p_value jsonb,p_author uuid)
returns jsonb language sql immutable security invoker
set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('path',item->>'path','name',left(coalesce(item->>'name','图片'),255),'mimeType',item->>'mimeType','size',item->'size') order by ordinal),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(p_value)='array' then p_value else '[]'::jsonb end) with ordinality as images(item,ordinal)
 where ordinal<=4 and jsonb_typeof(item)='object'
  and item->>'path' ~ ('^'||p_author::text||'/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[.](jpg|jpeg|png|webp)$')
  and ((item->>'mimeType'='image/jpeg' and item->>'path' ~ '[.](jpg|jpeg)$') or (item->>'mimeType'='image/png' and item->>'path' ~ '[.]png$') or (item->>'mimeType'='image/webp' and item->>'path' ~ '[.]webp$'))
  and public.review_public_number(item->'size') between 1 and 10485760
  and trunc(public.review_public_number(item->'size'))=public.review_public_number(item->'size');
$$;
revoke all on function public.review_public_reply_images(jsonb,uuid) from public,anon,authenticated;

create or replace function public.review_public_reply_account(p_value jsonb)
returns jsonb language plpgsql immutable security invoker
set search_path=pg_catalog,public as $$
declare v_item jsonb; v_items jsonb:='[]'::jsonb; v_seen text[]:='{}'; v_key text; v_num numeric;
 v_current numeric; v_peak numeric; v_decline numeric; v_peak_date text; v_decline_date text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or p_value->'version' is distinct from '1'::jsonb
  or p_value->>'kind' is distinct from 'account_snapshot' or p_value->>'basis' is distinct from 'close' or p_value->>'source' is distinct from 'pnl_report'
  or not public.review_public_valid_date(p_value->>'asOfDate') or not public.review_public_valid_date(p_value->>'recordDate')
  or jsonb_typeof(p_value->'items') is distinct from 'array' then return null; end if;
 if jsonb_array_length(p_value->'items') not between 1 and 5 then return null; end if;
 for v_item in select value from jsonb_array_elements(p_value->'items') loop
  v_key:=v_item->>'key';v_num:=public.review_public_number(v_item->'value');
  if jsonb_typeof(v_item) is distinct from 'object' or v_key is null or v_key<>all(array['cumulativeReturnPct','yearPeakReturnPct','declineFromYearPeakPp','dailyReturnPct','leverage'])
   or v_key=any(v_seen) or v_num is null or v_item->>'asOfDate' is distinct from p_value->>'asOfDate' or v_item->>'basis' is distinct from 'close' or v_item->>'source' is distinct from 'pnl_report'
   or (v_key='leverage' and v_num<=0) or (v_key='declineFromYearPeakPp' and v_num<0) then continue; end if;
  if v_key=any(array['yearPeakReturnPct','declineFromYearPeakPp']) and (not public.review_public_valid_date(v_item->>'peakDate') or v_item->>'peakDate'>p_value->>'asOfDate' or left(v_item->>'peakDate',4)<>left(p_value->>'asOfDate',4)) then continue; end if;
  v_seen:=array_append(v_seen,v_key);
  v_items:=v_items||jsonb_build_array(jsonb_build_object('key',v_key,'value',v_num,'asOfDate',p_value->>'asOfDate','basis','close','source','pnl_report')
   ||case when v_key=any(array['yearPeakReturnPct','declineFromYearPeakPp']) then jsonb_build_object('peakDate',v_item->>'peakDate') else '{}'::jsonb end);
  if v_key='cumulativeReturnPct' then v_current:=v_num; elsif v_key='yearPeakReturnPct' then v_peak:=v_num;v_peak_date:=v_item->>'peakDate'; elsif v_key='declineFromYearPeakPp' then v_decline:=v_num;v_decline_date:=v_item->>'peakDate'; end if;
 end loop;
 if (v_peak is not null and v_decline is not null and v_peak_date<>v_decline_date)
  or (v_current is not null and v_peak is not null and v_peak+0.00000001<v_current)
  or (v_current is not null and v_peak is not null and v_decline is not null and abs(v_peak-v_current-v_decline)>0.00000001) then
  select coalesce(jsonb_agg(item),'[]'::jsonb) into v_items from jsonb_array_elements(v_items) item where item->>'key' not in ('yearPeakReturnPct','declineFromYearPeakPp');
 end if;
 if jsonb_array_length(v_items)=0 then return null; end if;
 select jsonb_agg(item order by array_position(array['cumulativeReturnPct','yearPeakReturnPct','declineFromYearPeakPp','dailyReturnPct','leverage'],item->>'key')) into v_items from jsonb_array_elements(v_items) item;
 return jsonb_build_object('version',1,'kind','account_snapshot','asOfDate',p_value->>'asOfDate','recordDate',p_value->>'recordDate','basis','close','source','pnl_report','items',v_items);
end;
$$;
revoke all on function public.review_public_reply_account(jsonb) from public,anon,authenticated;

create or replace function public.review_public_reply_trades(p_value jsonb)
returns jsonb language plpgsql immutable security invoker
set search_path=pg_catalog,public as $$
declare v_item jsonb;v_result jsonb:='[]'::jsonb;v_seen text[]:='{}';v_id text;v_symbol text;v_price numeric;v_shares numeric;
begin
 if jsonb_typeof(p_value) is distinct from 'array' then return v_result; end if;
 for v_item in select value from jsonb_array_elements(p_value) limit 20 loop
  v_id:=case when jsonb_typeof(v_item->'id')='string' then btrim(v_item->>'id')
   when public.review_public_number(v_item->'id') between 1 and 9007199254740991 and trunc(public.review_public_number(v_item->'id'))=public.review_public_number(v_item->'id') then v_item->>'id' else null end;
  v_symbol:=upper(btrim(v_item->>'symbol'));v_price:=public.review_public_number(v_item->'price');v_shares:=public.review_public_number(v_item->'shares');
  if jsonb_typeof(v_item) is distinct from 'object' or v_id is null or length(v_id) not between 1 and 100 or v_id ~ '[[:cntrl:]]' or v_id=any(v_seen)
   or v_symbol is null or v_symbol !~ '^[A-Z0-9^][A-Z0-9.^=-]{0,19}$' or not public.review_public_valid_date(v_item->>'date')
   or v_item->>'side' is null or v_item->>'side' not in ('buy','sell') or v_price is null or v_price<=0 or v_shares is null or v_shares<=0 then continue; end if;
  v_seen:=array_append(v_seen,v_id);
  v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id,'symbol',v_symbol,'date',v_item->>'date','side',v_item->>'side','price',v_price,'shares',v_shares));
 end loop;
 return v_result;
end;
$$;
revoke all on function public.review_public_reply_trades(jsonb) from public,anon,authenticated;

create or replace function public.review_public_project_replies(p_value jsonb,p_author uuid)
returns jsonb language plpgsql immutable security invoker
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
  v_result:=v_result||jsonb_build_array(v_clean);
 end loop;
 return v_result;
end;
$$;
revoke all on function public.review_public_project_replies(jsonb,uuid) from public,anon,authenticated;

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
  insert into public.review_public_posts(id,type,source_id,author_id,text,record_date,stocks,images,market,replies)
    values(v_id,v_type,v_row->>'id',v_author,left(coalesce(v_row->>'text',''),50000),v_date,v_stocks,v_images,public.review_public_project_market(v_data->'market'),public.review_public_project_replies(v_data->'replies',v_author))
    on conflict(id) do update set author_id=excluded.author_id,text=excluded.text,record_date=excluded.record_date,
      stocks=excluded.stocks,images=excluded.images,market=excluded.market,replies=excluded.replies,updated_at=clock_timestamp()
      -- Public author evaluations are part of this projection. Visible reply
      -- edits advance updated_at without changing the original published_at.
      where (review_public_posts.author_id,review_public_posts.text,review_public_posts.record_date,review_public_posts.stocks,review_public_posts.images,review_public_posts.market,review_public_posts.replies)
        is distinct from (excluded.author_id,excluded.text,excluded.record_date,excluded.stocks,excluded.images,excluded.market,excluded.replies);
  return new;
end;
$$;
revoke all on function public.sync_review_public_post() from public, anon, authenticated;

create or replace function public.review_public_post_json(p_post public.review_public_posts, p_viewer uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select jsonb_build_object('id',p_post.id,'type',p_post.type,'sourceId',p_post.source_id,'authorId',p_post.author_id,
    'author',jsonb_build_object('nickname',coalesce(profile.nickname,'Quote 用户'),'avatarKey',coalesce(profile.avatar_key,'gold'),
      'avatarPath',case when profile.avatar_path ~ ('^' || p_post.author_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
    'text',p_post.text,'date',p_post.record_date,'stocks',p_post.stocks,'images',p_post.images,'market',p_post.market,'replies',p_post.replies,
    'publishedAt',p_post.published_at,'updatedAt',p_post.updated_at,
    'likeCount',(select count(*) from public.review_public_likes where post_id=p_post.id),
    'liked',exists(select 1 from public.review_public_likes where post_id=p_post.id and user_id=p_viewer))
  from (select 1) as one left join public.community_profiles profile on profile.user_id=p_post.author_id;
$$;
revoke all on function public.review_public_post_json(public.review_public_posts, uuid) from public, anon, authenticated;


create or replace function public.review_public_asset_visible(p_bucket text,p_path text)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or p_path is null or length(p_path)>200 then return false; end if;
  if p_bucket='review-journal-images' then
    return exists(select 1 from public.review_public_posts post where split_part(p_path,'/',1)=post.author_id::text
      and (post.images @> jsonb_build_array(jsonb_build_object('path',p_path))
        or exists(select 1 from jsonb_array_elements(post.replies) reply
          where reply->'images' @> jsonb_build_array(jsonb_build_object('path',p_path)))));
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

-- Only refresh projections that were already explicitly public before this
-- migration. Do not touch source rows, revisions, likes or published_at.
update public.review_public_posts post set replies=public.review_public_project_replies(source.review_data->'replies',post.author_id),updated_at=clock_timestamp()
from (
 select 'log:'||id::text as id,user_id,review_data from public.review_logs
 union all select 'insight:'||id::text,user_id,review_data from public.disciplines
) source
where source.id=post.id and source.user_id=post.author_id and source.review_data->>'visibility'='public'
 and not (source.review_data ? 'timelineEvent' and source.review_data->'timelineEvent'<>'null'::jsonb)
 and post.replies is distinct from public.review_public_project_replies(source.review_data->'replies',post.author_id);

commit;
