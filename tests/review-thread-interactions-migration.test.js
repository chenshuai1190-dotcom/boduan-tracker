import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { mapReviewFeedUnread,mapReviewCommentThreads,mapReviewCommentThreadReplies,mapReviewEvaluationLike } from '../src/lib/reviewInteractionModel.js';
const moduleFile=process.env.PGLITE_MODULE_FILE;
const files=['review_public_activity_20261108.sql','review_public_replies_20261108.sql','review_community_evaluations_20261108.sql','review_public_chronology_replies_20261108.sql','review_activity_notifications_20261108.sql','review_thread_interactions_20261108.sql'];
const migrations=await Promise.all(files.map(file=>readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8')));
const migration=migrations.at(-1);
const previewMigration=await readFile(new URL('../supabase/review_thread_preview_reply_20261108.sql',import.meta.url),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444',E='55555555-5555-4555-8555-555555555555';
let nextId=0;const id=()=>`88888888-8888-4888-8888-${String(++nextId).padStart(12,'0')}`;
test('thread foundation keeps source data intact and serialized unread cursor separate from original chronology',()=>{
 assert.doesNotMatch(migration,/update\s+public\.(review_logs|disciplines|review_public_posts|review_community_evaluations|review_activity_notifications)\s/i);
 assert.match(migration,/update public.review_feed_clock set cursor=cursor\+1/);
 assert.match(migration,/for share/);
 assert.match(migration,/greatest\(review_feed_read_state.seen_cursor,excluded.seen_cursor\)/);
 assert.match(migration,/not coalesce\(v_timeline,false\)/);
});
test('preview migration only extends the existing roots RPC and uses the same tree and projection',()=>{
 assert.equal((previewMigration.match(/create or replace function/g)||[]).length,1);
 assert.match(previewMigration,/create or replace function public\.fetch_review_comment_threads\(/);
 assert.doesNotMatch(previewMigration,/\b(?:update|delete from|insert into|alter table|create policy|drop|truncate)\s+public\./i);
 assert.match(previewMigration,/tree as materialized/);
 assert.match(previewMigration,/not c\.deleted and \(c\.kind,c\.id\)<>\(s\.kind,s\.id\)/);
 assert.match(previewMigration,/order by c\.created_at asc,c\.kind asc,c\.id asc limit 1/);
 assert.match(previewMigration,/'previewReply',preview_reply/);
 assert.match(previewMigration,/p_expected_user_id is distinct from v_user/);
 assert.match(previewMigration,/not v_parent\.parent_public and v_parent\.parent_author_id<>v_user/);
});
test('thread reactions, paginated reply trees, private timeline access and unread acknowledgements execute in PostgreSQL',{
 skip:!moduleFile&&'Set PGLITE_MODULE_FILE to a local PGlite install for isolated SQL execution.',
},async t=>{
 const {PGlite}=await import(pathToFileURL(moduleFile).href);const db=await PGlite.create();
 const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
 async function as(user,sql,args=[],role='authenticated'){
  await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);return await rows(sql,args);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
 }
 const rawRpc=async(user,name,args)=>(await as(user,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args))[0].value;
 const rpc=(user,name,args=[])=>rawRpc(user,name,[...args,user]);
 const denied=(fn,code='42501')=>assert.rejects(fn,error=>error.code===code);
 const insert=async(user=A,visibility='public',replies=[],extra={})=>{
  const [row]=await as(user,"insert into public.review_logs(user_id,text,review_data,log_date) values($1,'A sample post',$2,'2026-11-08') returning id",[user,JSON.stringify({visibility,replies,...extra})]);
  return {id:row.id,postId:`log:${row.id}`,user};
 };
 const save=async(user,source,replyTo=null,text='A comment')=>rpc(user,'save_review_community_evaluation_v2',[source.postId,id(),0,JSON.stringify({date:'2026-11-08',text,score:null,images:[]}),replyTo]);
 const visibility=(source,value)=>as(source.user,"update public.review_logs set review_data=jsonb_set(review_data,'{visibility}',to_jsonb($2::text)) where id=$1",[source.id,value]);
 const threads=async(user,source,limit=20,cursor=null,locate=null)=>mapReviewCommentThreads(await rpc(user,'fetch_review_comment_threads',[source.postId,limit,cursor,locate]),source.postId,limit);
 const replies=async(user,source,root,limit=50,cursor=null,locate=null)=>mapReviewCommentThreadReplies(await rpc(user,'fetch_review_comment_thread_replies',[source.postId,root,limit,cursor,locate]),source.postId,limit);
 const like=async(user,source,target,desired=true)=>mapReviewEvaluationLike(await rpc(user,'set_review_evaluation_like',[source.postId,target,desired]),target);
 const unread=async user=>mapReviewFeedUnread(await rpc(user,'fetch_review_feed_unread'));
 const seen=async(user,cursor)=>mapReviewFeedUnread(await rpc(user,'mark_review_feed_seen',[cursor]));
 try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values('${A}'),('${B}'),('${C}'),('${D}'),('${E}');
      create table public.disciplines(id bigint generated by default as identity primary key,user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',created_at timestamptz default now());
      create table public.review_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',log_date date not null,created_at timestamptz default now());
      create table public.community_profiles(user_id uuid primary key references auth.users(id),nickname text,avatar_key text,avatar_path text,private_email text);
      alter table public.disciplines enable row level security; alter table public.review_logs enable row level security; alter table public.community_profiles enable row level security;
      create policy own_insights on public.disciplines for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_logs on public.review_logs for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_profiles on public.community_profiles for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      grant select,insert,update,delete on public.disciplines,public.review_logs,public.community_profiles to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
      insert into public.community_profiles values('${A}','Post Author','fox',null,'secret-a'),('${B}','Reviewer B','gold',null,'secret-b'),('${C}','Reviewer C','gold',null,'secret-c'),('${D}','Liker D','gold',null,'secret-d'),('${E}','Recipient E','gold',null,'secret-e');
      create schema storage; create table storage.buckets(id text primary key,public boolean not null default false);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      insert into storage.buckets values('review-journal-images',false),('community-avatars',false);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy own_images on storage.objects for all to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);
    `);

  for(const prior of migrations.slice(0,-1))await db.exec(prior);
  const legacy=await insert();
  const fingerprint=async()=>(await rows("select md5(string_agg(to_jsonb(r)::text,'' order by id)) fingerprint from public.review_logs r"))[0].fingerprint;
  const before=await fingerprint();await db.exec(migration);await db.exec(migration);assert.equal(await fingerprint(),before);
  const repliesDefinition=(await rows("select pg_get_functiondef('public.fetch_review_comment_thread_replies(text,jsonb,integer,jsonb,jsonb,uuid)'::regprocedure) definition"))[0].definition;
  await db.exec(previewMigration);await db.exec(previewMigration);assert.equal(await fingerprint(),before);
  assert.equal((await rows("select pg_get_functiondef('public.fetch_review_comment_thread_replies(text,jsonb,integer,jsonb,jsonb,uuid)'::regprocedure) definition"))[0].definition,repliesDefinition,'preview migration leaves expanded paging untouched');
  await t.test('first enable baselines existing posts, then only new other-author public posts count',async()=>{
   assert.deepEqual(await unread(B),{unreadCount:0,cursor:'0'});
   const source=await insert(A);const first=await unread(B);assert.equal(first.unreadCount,1);
   await insert(B);assert.equal((await unread(B)).unreadCount,1);
   const privatePost=await insert(A,'private');assert.equal((await unread(B)).unreadCount,1);
   await visibility(privatePost,'public');assert.equal((await unread(B)).unreadCount,2);
   await as(A,"update public.review_logs set text='Edited' where id=$1",[source.id]);assert.equal((await unread(B)).unreadCount,2);
   await visibility(source,'private');assert.equal((await unread(B)).unreadCount,1);
   await visibility(source,'public');assert.equal((await unread(B)).unreadCount,2);
   const oldBoundary=first.cursor;await seen(B,oldBoundary);assert.equal((await unread(B)).unreadCount,1,'later arrivals survive prior boundary');
   const latest=await unread(B);await seen(B,latest.cursor);assert.equal((await unread(B)).unreadCount,0);
   await seen(B,oldBoundary);assert.equal((await unread(B)).unreadCount,0,'out of order acknowledgement never rolls backwards');
   await visibility(source,'private');await visibility(source,'public');assert.equal((await unread(B)).unreadCount,0,'republishing already seen source is not a new event');
   await visibility(legacy,'private');await visibility(legacy,'public');assert.equal((await unread(B)).unreadCount,0,'legacy prelaunch source never becomes new');
   await denied(()=>seen(B,'9223372036854775807'),'22023');
   await denied(()=>rawRpc(B,'fetch_review_feed_unread',[A]));
  });
  await t.test('only target likes change, desired state retries are idempotent and private state revokes others',async()=>{
   const source=await insert(A,'public',[{id:'author-note',date:'2026-11-08',text:'Own review',score:8}]);
   const evaluation=await save(B,source),authorTarget={kind:'author',id:'author-note'},communityTarget={kind:'community',id:evaluation.id};
   assert.equal((await like(C,source,authorTarget)).likeCount,1);assert.equal((await like(C,source,authorTarget)).likeCount,1);
   assert.equal((await like(B,source,authorTarget)).likeCount,2);assert.equal((await like(C,source,communityTarget)).likeCount,1);
   assert.equal((await like(C,source,authorTarget,false)).likeCount,1);assert.equal((await like(C,source,authorTarget,false)).likeCount,1);
   const state=await rpc(C,'fetch_review_evaluation_likes',[source.postId,[authorTarget,communityTarget]]);assert.equal(state.likes[0].liked,false);assert.equal(state.likes[1].liked,true);
   const other=await insert(A);await denied(()=>like(C,other,communityTarget),'P0002');
   await visibility(source,'private');await denied(()=>like(B,source,communityTarget),'P0002');await denied(()=>threads(B,source),'P0002');
   assert.equal((await threads(A,source)).totalCount,2);
   const authorNode=(await threads(A,source)).threads.find(t=>t.root.kind==='author').root;assert.equal(authorNode.createdAt,null);assert.ok(authorNode.sortCreatedAt);
   await rpc(B,'delete_review_community_evaluation',[other.postId,evaluation.id,evaluation.revision]).then(()=>assert.fail('cross post delete succeeded'),()=>{});
   await visibility(source,'public');await rpc(B,'delete_review_community_evaluation',[source.postId,evaluation.id,evaluation.revision]);
   await denied(()=>like(C,source,communityTarget),'P0002');
   await as(A,"update public.review_logs set review_data=jsonb_set(review_data,'{replies}','[]'::jsonb) where id=$1",[source.id]);
   await as(A,"update public.review_logs set review_data=jsonb_set(review_data,'{replies}',$2::jsonb) where id=$1",[source.id,JSON.stringify([{id:'author-note',date:'2026-11-08',text:'Reused ID'}])]);
   const reused=await rpc(C,'fetch_review_evaluation_likes',[source.postId,[authorTarget]]);assert.equal(reused.likes[0].likeCount,0,'removed inline comment cannot transfer likes to reused ID');
   await denied(()=>as(C,'select * from public.review_evaluation_likes'));
   await denied(()=>rawRpc(C,'set_review_evaluation_like',[source.postId,authorTarget,true,B]));
  });
  await t.test('roots page independently, nested replies flatten and locate reaches beyond first page',async()=>{
   const source=await insert(A,'public',[{id:'author-root',date:'2026-11-08',text:'Root author comment'}]);
   const root={kind:'author',id:'author-root'};let target=root;const chain=[];
   for(let i=0;i<7;i++){const item=await save(i%2?C:B,source,target,`Reply ${i}`);chain.push(item);target={kind:'community',id:item.id};}
   for(let i=0;i<4;i++)await save(B,source,null,`Root ${i}`);
   const page=await threads(C,source,2);assert.equal(page.threads.length,2);assert.equal(page.hasMore,true);assert.equal(page.totalCount,12);assert.equal(page.communityCount,11);
   const next=await threads(C,source,2,page.nextCursor);assert.equal(next.threads.length,2);assert.notEqual(page.threads[0].root.id,next.threads[0].root.id);
   const located=await threads(C,source,20,null,{kind:'community',id:chain[6].id});assert.equal(located.threads[0].root.id,root.id);assert.equal(located.threads[0].replyCount,7);
   assert.equal(located.threads[0].previewReply.id,chain[0].id);
   const initial=await replies(C,source,root,3);assert.equal(initial.replies.length,3);assert.equal(initial.replies[0].directReplyCount,1);assert.equal(initial.hasMore,true);
   const later=await replies(C,source,root,3,initial.nextCursor);assert.equal(later.replies.length,3);assert.notEqual(later.replies[0].id,initial.replies[0].id);
   const exact=await replies(C,source,root,3,null,{kind:'community',id:chain[6].id});assert.equal(exact.replies[0].id,chain[6].id);
   await as(A,"update public.review_logs set review_data=jsonb_set(review_data,'{replies}','[]'::jsonb) where id=$1",[source.id]);
   const missing=await threads(C,source,20,null,{kind:'community',id:chain[6].id});assert.equal(missing.threads[0].root.deleted,true);assert.equal(missing.threads[0].root.text,'');assert.equal(missing.threads[0].replyCount,7);
   assert.equal(missing.threads[0].previewReply.id,chain[0].id);
   await rpc(B,'delete_review_community_evaluation',[source.postId,chain[2].id,chain[2].revision]);
   const afterDelete=await replies(C,source,root);assert.equal(afterDelete.replyCount,6);assert.equal(afterDelete.replies.find(r=>r.id===chain[2].id).deleted,true);assert.equal(afterDelete.replies.length,7);
  });
  await t.test('preview is the earliest nondeleted descendant with stable ties and current parent visibility',async()=>{
   const source=await insert(A,'public',[{id:'preview-root',date:'2026-11-08',text:'Root'},{id:'empty-root',date:'2026-11-08',text:'No replies'}]);
   const root={kind:'author',id:'preview-root'};
   const first=await save(B,source,root,'Earliest reply');
   const nested=await save(C,source,{kind:'community',id:first.id},'Nested reply');
   const later=await save(B,source,root,'Other direct reply');
   await rows("update public.review_community_evaluations set created_at='2026-11-08T01:00:00.123456Z' where id=any($1::uuid[])",[[first.id,nested.id,later.id]]);
   await like(C,source,{kind:'community',id:first.id});
   const raw=await rpc(C,'fetch_review_comment_threads',[source.postId,20,null,null]);
   assert.ok(raw.threads.every(item=>Object.hasOwn(item,'previewReply')));
   assert.doesNotMatch(JSON.stringify(raw),/private_email|secret-[a-e]/);
   const page=mapReviewCommentThreads(raw,source.postId);
   assert.equal(page.threads.find(item=>item.root.id==='empty-root').previewReply,null);
   const thread=page.threads.find(item=>item.root.id===root.id);
   assert.equal(thread.replyCount,3);assert.equal(thread.previewReply.id,first.id,'ties use kind/id ASC, matching expanded order');assert.equal(thread.previewReply.liked,true);
   assert.equal((await replies(C,source,root,1)).replies[0].id,thread.previewReply.id);
   await rpc(B,'delete_review_community_evaluation',[source.postId,first.id,first.revision]);
   const remaining=(await threads(C,source,20,null,root)).threads[0];
   assert.equal(remaining.replyCount,2);assert.equal(remaining.previewReply.id,nested.id,'deleted first reply is skipped, valid nested descendant retained');assert.equal(remaining.previewReply.deleted,false);
   await visibility(source,'private');await denied(()=>threads(C,source),'P0002');
   assert.equal((await threads(A,source,20,null,root)).threads[0].previewReply.id,nested.id);
   await denied(()=>rawRpc(A,'fetch_review_comment_threads',[source.postId,20,null,null,B]));
   await denied(()=>as(null,'select public.fetch_review_comment_threads($1,20,null,null,null)',[source.postId],'anon'));
  });
  await t.test('timeline thread and reactions remain owner only even if source has public flag',async()=>{
   const source=await insert(A,'public',[{id:'timeline-review',date:'2026-11-08',text:'Private snapshot discussion'}],{timelineEvent:{id:'system-event'}});
   const target={kind:'author',id:'timeline-review'};
   assert.equal((await rows('select count(*)::integer n from public.review_public_posts where id=$1',[source.postId]))[0].n,0);
   const reply=await save(A,source,target,'Owner replies to timeline');assert.equal((await threads(A,source)).totalCount,2);
   assert.equal((await threads(A,source)).threads[0].previewReply.id,reply.id);
   assert.equal((await like(A,source,target)).likeCount,1);await denied(()=>threads(B,source),'P0002');await denied(()=>save(B,source,target),'P0002');await denied(()=>like(B,source,target),'P0002');
   assert.equal((await replies(A,source,target)).replies[0].id,reply.id);
  });
  await t.test('all new tables and private helpers deny raw client access; no anonymous RPC execution',async()=>{
   for(const table of ['review_evaluation_likes','review_feed_clock','review_feed_publications','review_feed_read_state'])await denied(()=>as(B,`select * from public.${table}`));
   await denied(()=>as(null,'select public.fetch_review_feed_unread(null)',[],'anon'));
   await denied(()=>as(B,"select * from public.review_comment_tree('log:anything')"));
   const policies=await rows("select relname,relrowsecurity from pg_class where relname=any($1)",[['review_evaluation_likes','review_feed_clock','review_feed_publications','review_feed_read_state']]);assert.equal(policies.length,4);assert.ok(policies.every(row=>row.relrowsecurity));
  });
 }finally{await db.close();}
});
