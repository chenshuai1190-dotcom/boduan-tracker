-- Forward-only in-app interaction notifications. Apply after chronology/replies.
-- No historical interaction backfill. Rows contain identities and revisions,
-- never copied journal/evaluation bodies, scores, financial snapshots or images.
begin;

create table if not exists public.review_activity_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 post_id text not null check (length(post_id) between 5 and 150 and post_id ~ '^(log|insight):[^:]+$'),
 event_type text not null check (event_type in ('like','evaluation')),
 event_key text not null check (length(event_key) between 1 and 230),
 evaluation_id uuid,
 event_revision integer not null check (event_revision between 1 and 2147483647),
 created_at timestamptz not null default clock_timestamp(),
 read_at timestamptz,
 unique(recipient_id,event_key),
 check (recipient_id<>actor_id),
 check ((event_type='like' and evaluation_id is null and event_key='like:'||post_id||':'||actor_id::text)
  or (event_type='evaluation' and evaluation_id is not null and event_key='evaluation:'||evaluation_id::text))
);
create index if not exists review_activity_notifications_recipient_idx on public.review_activity_notifications(recipient_id,created_at desc,id desc);
create index if not exists review_activity_notifications_unread_idx on public.review_activity_notifications(recipient_id,created_at desc,id desc) where read_at is null;
create index if not exists review_activity_notifications_post_idx on public.review_activity_notifications(post_id);
alter table public.review_activity_notifications enable row level security;
revoke all on public.review_activity_notifications from public,anon,authenticated;

create or replace function public.review_activity_notification_visible(p_notification public.review_activity_notifications,p_viewer uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_parent record;v_evaluation public.review_community_evaluations;
begin
 if p_viewer is null or p_notification.recipient_id is distinct from p_viewer or p_notification.actor_id=p_viewer then return false; end if;
 select * into v_parent from public.review_community_parent(p_notification.post_id);
 if not found or not v_parent.parent_public then return false; end if;
 if p_notification.event_type='like' then
  return v_parent.parent_author_id=p_viewer and exists(select 1 from public.review_public_likes where post_id=p_notification.post_id and user_id=p_notification.actor_id);
 end if;
 select * into v_evaluation from public.review_community_evaluations where id=p_notification.evaluation_id
  and post_id=p_notification.post_id and author_id=p_notification.actor_id and deleted_at is null;
 if not found then return false; end if;
 if v_evaluation.reply_to_kind is not null then
  return v_evaluation.reply_to_author_id=p_viewer
   and coalesce(public.review_community_reply_target(v_evaluation.post_id,v_evaluation.reply_to_kind,v_evaluation.reply_to_id)=p_viewer,false);
 end if;
 return v_parent.parent_author_id=p_viewer;
end;
$$;
revoke all on function public.review_activity_notification_visible(public.review_activity_notifications,uuid) from public,anon,authenticated;

create or replace function public.review_activity_notification_kind(p_notification public.review_activity_notifications)
returns text language sql stable security definer set search_path=pg_catalog,public as $$
 select case when p_notification.event_type='like' then 'like'
  when e.reply_to_kind is not null then 'reply'
  when public.review_public_number(e.payload->'score') is not null then 'rating' else 'comment' end
 from (select 1) one left join public.review_community_evaluations e on e.id=p_notification.evaluation_id;
$$;
revoke all on function public.review_activity_notification_kind(public.review_activity_notifications) from public,anon,authenticated;

create or replace function public.review_activity_notification_json(p_notification public.review_activity_notifications)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_notification.id,'kind',public.review_activity_notification_kind(p_notification),
  'postId',p_notification.post_id,'commentId',p_notification.evaluation_id,'actorId',p_notification.actor_id,
  'actor',jsonb_build_object('nickname',coalesce(profile.nickname,'Quote 用户'),'avatarKey',coalesce(profile.avatar_key,'gold'),
   'avatarPath',case when profile.avatar_path ~ ('^'||p_notification.actor_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$') then profile.avatar_path else null end),
  'createdAt',p_notification.created_at,'readAt',p_notification.read_at,
  'score',case when p_notification.event_type='evaluation' then public.review_public_number(e.payload->'score') else null end,
  'excerpt',case when p_notification.event_type='evaluation' then left(coalesce(e.payload->>'text',''),160) else '' end,
  'postExcerpt',left(coalesce(post.text,''),160))
 from (select 1) one left join public.community_profiles profile on profile.user_id=p_notification.actor_id
  left join public.review_community_evaluations e on e.id=p_notification.evaluation_id
  left join public.review_public_posts post on post.id=p_notification.post_id;
$$;
revoke all on function public.review_activity_notification_json(public.review_activity_notifications) from public,anon,authenticated;

-- Deferred triggers observe the committed transaction's final business rows.
-- In particular, v2 first inserts via the v1 CAS writer, then attaches replyTo.
-- An immediate INSERT-only trigger would incorrectly notify the parent author.
create or replace function public.record_review_activity_like_notification()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_post text;v_actor uuid;v_parent record;v_key text;
begin
 v_post:=case when TG_OP='DELETE' then old.post_id else new.post_id end;
 v_actor:=case when TG_OP='DELETE' then old.user_id else new.user_id end;
 v_key:='like:'||v_post||':'||v_actor::text;
 if TG_OP='INSERT' and exists(select 1 from public.review_public_likes where post_id=v_post and user_id=v_actor) then
  select * into v_parent from public.review_community_parent(v_post);
  if found and v_parent.parent_public and v_parent.parent_author_id<>v_actor then
   insert into public.review_activity_notifications(recipient_id,actor_id,post_id,event_type,event_key,event_revision)
    values(v_parent.parent_author_id,v_actor,v_post,'like',v_key,1) on conflict(recipient_id,event_key) do nothing;
  end if;
 end if;
 -- Retain a dedupe tombstone when withdrawn. A later like restores the same
 -- already-read item rather than manufacturing another unread notification.
 update public.review_activity_notifications notification set read_at=coalesce(notification.read_at,clock_timestamp())
  where notification.post_id=v_post and notification.event_key=v_key and notification.read_at is null
   and not public.review_activity_notification_visible(notification,notification.recipient_id);
 return null;
end;
$$;
revoke all on function public.record_review_activity_like_notification() from public,anon,authenticated;
drop trigger if exists review_activity_like_notification on public.review_public_likes;
create constraint trigger review_activity_like_notification after insert or delete on public.review_public_likes
 deferrable initially deferred for each row execute function public.record_review_activity_like_notification();

create or replace function public.record_review_activity_evaluation_notification()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;v_post text;v_evaluation public.review_community_evaluations;v_parent record;v_recipient uuid;v_key text;
begin
 v_id:=case when TG_OP='DELETE' then old.id else new.id end;
 v_post:=case when TG_OP='DELETE' then old.post_id else new.post_id end;
 v_key:='evaluation:'||v_id::text;
 select * into v_evaluation from public.review_community_evaluations where id=v_id and deleted_at is null;
 if found then
  select * into v_parent from public.review_community_parent(v_evaluation.post_id);
  if found and v_parent.parent_public then
   v_recipient:=case when v_evaluation.reply_to_kind is not null then
    public.review_community_reply_target(v_evaluation.post_id,v_evaluation.reply_to_kind,v_evaluation.reply_to_id) else v_parent.parent_author_id end;
   if v_recipient is not null and v_recipient<>v_evaluation.author_id
    and (v_evaluation.reply_to_kind is null or v_recipient=v_evaluation.reply_to_author_id) then
    if TG_OP='INSERT' then
     insert into public.review_activity_notifications(recipient_id,actor_id,post_id,event_type,event_key,evaluation_id,event_revision)
      values(v_recipient,v_evaluation.author_id,v_evaluation.post_id,'evaluation',v_key,v_evaluation.id,v_evaluation.revision)
      on conflict(recipient_id,event_key) do nothing;
    end if;
    -- UPDATE cannot backfill a pre-launch interaction, and edits never reset
    -- the original notification date or read state. Kind/text/score are live.
    update public.review_activity_notifications set event_revision=v_evaluation.revision
     where recipient_id=v_recipient and event_key=v_key and event_revision<v_evaluation.revision;
   end if;
  end if;
 end if;
 -- Removing a target also hides notifications about replies to that target.
 update public.review_activity_notifications notification set read_at=coalesce(notification.read_at,clock_timestamp())
  where notification.post_id=v_post and notification.read_at is null
   and not public.review_activity_notification_visible(notification,notification.recipient_id);
 return null;
end;
$$;
revoke all on function public.record_review_activity_evaluation_notification() from public,anon,authenticated;
drop trigger if exists review_activity_evaluation_notification on public.review_community_evaluations;
create constraint trigger review_activity_evaluation_notification after insert or update or delete on public.review_community_evaluations
 deferrable initially deferred for each row execute function public.record_review_activity_evaluation_notification();

create or replace function public.retract_review_activity_notifications()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_post text;
begin
 if TG_TABLE_SCHEMA<>'public' or TG_TABLE_NAME not in ('disciplines','review_logs') then raise exception 'unsupported notification source' using errcode='42501'; end if;
 v_post:=(case TG_TABLE_NAME when 'disciplines' then 'insight' else 'log' end)||':'||old.id::text;
 update public.review_activity_notifications notification set read_at=coalesce(notification.read_at,clock_timestamp())
  where notification.post_id=v_post and notification.read_at is null
   and not public.review_activity_notification_visible(notification,notification.recipient_id);
 return null;
end;
$$;
revoke all on function public.retract_review_activity_notifications() from public,anon,authenticated;
drop trigger if exists disciplines_retract_activity_notifications on public.disciplines;
create constraint trigger disciplines_retract_activity_notifications after update or delete on public.disciplines
 deferrable initially deferred for each row execute function public.retract_review_activity_notifications();
drop trigger if exists review_logs_retract_activity_notifications on public.review_logs;
create constraint trigger review_logs_retract_activity_notifications after update or delete on public.review_logs
 deferrable initially deferred for each row execute function public.retract_review_activity_notifications();

create or replace function public.fetch_review_activity_notifications(p_limit integer default 20,p_before timestamptz default null,
 p_before_id uuid default null,p_filter text default 'all',p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_limit integer;v_candidates jsonb;v_items jsonb;v_last jsonb;v_more boolean;v_unread bigint;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 if (p_before is null)<>(p_before_id is null) or (p_before is not null and not isfinite(p_before))
  or p_filter is null or p_filter not in ('all','comments','likes','ratings') then raise exception 'invalid notification filter or cursor' using errcode='22023'; end if;
 v_limit:=greatest(1,least(coalesce(p_limit,20),20));
 select coalesce(jsonb_agg(public.review_activity_notification_json(item) order by item.created_at desc,item.id desc),'[]'::jsonb)
  into v_candidates from (select * from public.review_activity_notifications n where n.recipient_id=v_user
   and public.review_activity_notification_visible(n,v_user) and (p_before is null or (n.created_at,n.id)<(p_before,p_before_id))
   and (p_filter='all' or (p_filter='likes' and n.event_type='like')
    or (p_filter='comments' and public.review_activity_notification_kind(n) in ('comment','reply'))
    or (p_filter='ratings' and public.review_activity_notification_kind(n)='rating'))
   order by n.created_at desc,n.id desc limit v_limit+1) item;
 v_more:=jsonb_array_length(v_candidates)>v_limit;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into v_items
  from jsonb_array_elements(v_candidates) with ordinality candidates(item,ordinal) where ordinal<=v_limit;
 v_last:=v_items->(jsonb_array_length(v_items)-1);
 select count(*) into v_unread from public.review_activity_notifications n where n.recipient_id=v_user and n.read_at is null and public.review_activity_notification_visible(n,v_user);
 return jsonb_build_object('notifications',v_items,'hasMore',v_more,'nextCursor',case when v_more then jsonb_build_object('createdAt',v_last->'createdAt','id',v_last->'id') else null end,'unreadCount',v_unread);
end;
$$;
revoke all on function public.fetch_review_activity_notifications(integer,timestamptz,uuid,text,uuid) from public,anon;
grant execute on function public.fetch_review_activity_notifications(integer,timestamptz,uuid,text,uuid) to authenticated;

create or replace function public.fetch_review_activity_notification_count(p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_unread bigint;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 select count(*) into v_unread from public.review_activity_notifications n where n.recipient_id=v_user and n.read_at is null and public.review_activity_notification_visible(n,v_user);
 return jsonb_build_object('unreadCount',v_unread);
end;
$$;
revoke all on function public.fetch_review_activity_notification_count(uuid) from public,anon;
grant execute on function public.fetch_review_activity_notification_count(uuid) to authenticated;

create or replace function public.mark_review_activity_notifications_read(p_ids uuid[] default null,p_before timestamptz default null,
 p_before_id uuid default null,p_expected_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_unread bigint;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 if p_ids is not null then
  if cardinality(p_ids) not between 1 and 100 or array_ndims(p_ids) is distinct from 1 then raise exception 'invalid notification identifiers' using errcode='22023'; end if;
  if array_position(p_ids,null) is not null or p_before is not null or p_before_id is not null then raise exception 'invalid notification identifiers' using errcode='22023'; end if;
 else
  if p_before is null or not isfinite(p_before) or p_before_id is null
   or not exists(select 1 from public.review_activity_notifications where id=p_before_id and recipient_id=v_user and created_at=p_before) then
   raise exception 'mark-all requires an observed notification boundary' using errcode='22023'; end if;
 end if;
 update public.review_activity_notifications n set read_at=clock_timestamp()
  where n.recipient_id=v_user and n.read_at is null and public.review_activity_notification_visible(n,v_user)
   and ((p_ids is not null and n.id=any(p_ids)) or (p_ids is null and (n.created_at,n.id)<=(p_before,p_before_id)));
 select count(*) into v_unread from public.review_activity_notifications n where n.recipient_id=v_user and n.read_at is null and public.review_activity_notification_visible(n,v_user);
 return jsonb_build_object('unreadCount',v_unread);
end;
$$;
revoke all on function public.mark_review_activity_notifications_read(uuid[],timestamptz,uuid,uuid) from public,anon;
grant execute on function public.mark_review_activity_notifications_read(uuid[],timestamptz,uuid,uuid) to authenticated;

create or replace function public.read_review_activity_notification_target(p_notification_id uuid,p_expected_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();v_notification public.review_activity_notifications;v_evaluation public.review_community_evaluations;
begin
 if v_user is null or p_expected_user_id is distinct from v_user then raise exception 'authenticated account does not match request' using errcode='42501'; end if;
 select * into v_notification from public.review_activity_notifications where id=p_notification_id and recipient_id=v_user;
 if not found or not public.review_activity_notification_visible(v_notification,v_user) then return null; end if;
 if v_notification.evaluation_id is not null then select * into v_evaluation from public.review_community_evaluations where id=v_notification.evaluation_id; end if;
 return jsonb_build_object('notificationId',v_notification.id,'postId',v_notification.post_id,'commentId',v_notification.evaluation_id,
  'evaluation',case when v_notification.evaluation_id is not null then public.review_community_evaluation_json(v_evaluation) else null end);
end;
$$;
revoke all on function public.read_review_activity_notification_target(uuid,uuid) from public,anon;
grant execute on function public.read_review_activity_notification_target(uuid,uuid) to authenticated;

-- Like actors may have no public post or evaluation of their own. Their current
-- avatar can be read only by a recipient with a currently visible notification.
create or replace function public.review_activity_notification_avatar_visible(p_path text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or p_path is null or length(p_path)>200 then return false; end if;
 return exists(select 1 from public.community_profiles profile where profile.avatar_path=p_path
  and p_path ~ ('^'||profile.user_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg|jpeg|png)$')
  and exists(select 1 from public.review_activity_notifications n where n.recipient_id=v_user and n.actor_id=profile.user_id and public.review_activity_notification_visible(n,v_user)));
end;
$$;
revoke all on function public.review_activity_notification_avatar_visible(text) from public,anon;
grant execute on function public.review_activity_notification_avatar_visible(text) to authenticated;
drop policy if exists "activity notification actor avatar read" on storage.objects;
create policy "activity notification actor avatar read" on storage.objects for select to authenticated
 using (bucket_id='community-avatars' and public.review_activity_notification_avatar_visible(name));

commit;
