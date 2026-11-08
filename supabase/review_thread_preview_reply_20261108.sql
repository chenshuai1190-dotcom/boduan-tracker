-- Additive read contract. Apply after review_thread_interactions_20261108.sql.
-- Reuses the existing visible comment tree and projection; no source data,
-- access policy, or full-thread reply pagination changes.
begin;

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
 ), enriched as (
  select s.*,(select public.review_comment_json(p_post_id,c.kind,c.id,c.created_at,c.deleted,c.author_id,c.payload,v_user)
   from tree c where c.root_kind=s.kind and c.root_id=s.id and not c.deleted and (c.kind,c.id)<>(s.kind,s.id)
   order by c.created_at asc,c.kind asc,c.id asc limit 1) preview_reply
  from selected s
 ) select coalesce(jsonb_agg(jsonb_build_object('root',public.review_comment_json(p_post_id,kind,id,created_at,deleted,author_id,payload,v_user),'replyCount',reply_count,'previewReply',preview_reply) order by created_at desc,kind desc,id desc),'[]'::jsonb) into v_rows from enriched;
 v_more:=jsonb_array_length(v_rows)>p_limit;
 select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality rows(item,ordinal) where ordinal<=p_limit;
 v_last:=v_items->(jsonb_array_length(v_items)-1)->'root';
 select count(*),count(*) filter(where kind='community') into v_total,v_community from public.review_comment_nodes(p_post_id) where not deleted;
 return jsonb_build_object('threads',v_items,'totalCount',v_total,'communityCount',v_community,'hasMore',v_more,'nextCursor',case when v_more then jsonb_build_object('kind',v_last->'kind','id',v_last->'id','createdAt',v_last->'sortCreatedAt') else null end);
end;
$$;
revoke all on function public.fetch_review_comment_threads(text,integer,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.fetch_review_comment_threads(text,integer,jsonb,jsonb,uuid) to authenticated;

commit;
