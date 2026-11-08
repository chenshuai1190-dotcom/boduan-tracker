import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const moduleFile=process.env.PGLITE_MODULE_FILE;
const prerequisites=['review_public_activity_20261108.sql','review_public_replies_20261108.sql','review_community_evaluations_20261108.sql','review_public_chronology_replies_20261108.sql','review_activity_notifications_20261108.sql','review_thread_interactions_20261108.sql','review_thread_preview_reply_20261108.sql','quote_assistant_foundation_20261108.sql'];
const sql=await readFile(new URL('../supabase/quote_assistant_proactive_20261109.sql',import.meta.url),'utf8');
const preflight=await readFile(new URL('../supabase/verification/quote_assistant_proactive_preflight.sql',import.meta.url),'utf8');
const postflight=await readFile(new URL('../supabase/verification/quote_assistant_proactive_postflight.sql',import.meta.url),'utf8');
const migrations=await Promise.all(prerequisites.map(name=>readFile(new URL(`../supabase/${name}`,import.meta.url),'utf8')));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444',E='55555555-5555-4555-8555-555555555555',BOT='66666666-6666-4666-8666-666666666666';
let seq=0;const id=()=>`99999999-9999-4999-8999-${String(++seq).padStart(12,'0')}`;

test('proactive migration is additive, service-only and never imports historical content or private ledger',()=>{
 assert.match(sql,/grant execute on function public.quote_assistant_proactive\(text,jsonb\) to service_role/);
 assert.match(sql,/revoke all on function public.quote_assistant_proactive\(text,jsonb\) from public,anon,authenticated/);
 assert.doesNotMatch(sql,/\b(?:insert into|update|delete from)\s+(?:auth\.users|public\.(?:stock_trades|pnl_report_snapshots|community_competition_snapshots))/i);
 assert.match(sql,/source_kind='post' and v_event.author_id=v_config.founder_id/);
});

test('proactive public participation enforces eligibility, budget, leases and exact-once publication in PostgreSQL',{skip:!moduleFile&&'Set PGLITE_MODULE_FILE for isolated SQL execution.'},async t=>{
 const {PGlite}=await import(pathToFileURL(moduleFile).href),db=await PGlite.create();
 const rows=async(q,args=[])=>(await db.query(q,args)).rows;
 async function as(who,q,args=[],role='authenticated'){
  await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who||'']);return await rows(q,args);}
  finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
 }
 const proactive=async(action,payload={})=>(await as(null,'select public.quote_assistant_proactive($1,$2) value',[action,payload],'service_role'))[0].value;
 const service=async(action,payload={})=>(await as(null,'select public.quote_assistant_service($1,$2) value',[action,payload],'service_role'))[0].value;
 const user=async(who,action,payload={})=>(await as(who,'select public.quote_assistant_user($1,$2,$3) value',[action,payload,who]))[0].value;
 const insert=async(who=E,visibility='public',text='请解释这个决策',extra={})=>{const [r]=await as(who,"insert into public.review_logs(user_id,text,log_date,review_data) values($1,$2,'2026-11-09',$3) returning id",[who,text,{visibility,...extra}]);return {id:r.id,postId:`log:${r.id}`,authorId:who};};
 const comment=async(who,post,text='请问何时需要修正判断？',replyTo=null)=>(await as(who,'select public.save_review_community_evaluation_v2($1,$2,0,$3,$4,$5) value',[post.postId,id(),{date:'2026-11-09',text,score:null,images:[]},replyTo,who]))[0].value;
 const eventFor=async(post,kind='post',sourceId=post.postId)=>(await rows('select * from public.quote_assistant_proactive_events where post_id=$1 and source_kind=$2 and source_id=$3',[post.postId,kind,sourceId]))[0];
 const claimFor=async(post,kind='post',sourceId=post.postId)=>{
  await rows("update public.quote_assistant_proactive_events set due_at=clock_timestamp()+interval '1 day' where status in ('pending','waiting')");
  await rows("update public.quote_assistant_proactive_events set due_at=clock_timestamp()-interval '1 second' where post_id=$1 and source_kind=$2 and source_id=$3",[post.postId,kind,sourceId]);
  return proactive('claim');
 };
 const decide=(claim,decision='reply',questionKey='unique-'+id())=>proactive('decision',{id:claim.event.id,leaseToken:claim.leaseToken,decision,reason:'可补充新的推理依据',questionKey});
 const finish=async job=>{const c=await service('claim',{id:job.id});assert.ok(c.leaseToken);const ctx=await service('context',{id:job.id,leaseToken:c.leaseToken});const draft=await service('complete',{id:job.id,leaseToken:c.leaseToken,text:'决策依据需要与风险约束一起核对。'});return {ctx,draft};};
 const publish=job=>service('publish',{id:job.id,ownerId:job.ownerId,revision:job.revision});
 const denied=(fn,code='42501')=>assert.rejects(fn,error=>error.code===code);
 const config={enabled:true,founderId:A,reviewAuthorIds:[B,C,D],dailyDecisionLimit:200,dailyReplyLimit:30,threadReplyLimit:3};
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
   insert into auth.users values('${A}'),('${B}'),('${C}'),('${D}'),('${E}'),('${BOT}');
   create table public.disciplines(id bigint generated by default as identity primary key,user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',created_at timestamptz not null default now());
   create table public.review_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',log_date date not null,created_at timestamptz not null default now());
   create table public.community_profiles(user_id uuid primary key references auth.users(id),nickname text,avatar_key text,avatar_path text,private_email text);
   alter table public.disciplines enable row level security;alter table public.review_logs enable row level security;alter table public.community_profiles enable row level security;
   create policy own_insights on public.disciplines for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
   create policy own_logs on public.review_logs for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
   create policy own_profiles on public.community_profiles for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
   grant select,insert,update,delete on public.disciplines,public.review_logs,public.community_profiles to authenticated;grant usage,select on all sequences in schema public to authenticated;
   insert into public.community_profiles values('${A}','Founder','gold',null,'secret-a'),('${B}','Northstar','gold',null,'secret-b'),('${C}','Grok','gold',null,'secret-c'),('${D}','Sentinel','gold',null,'secret-d'),('${E}','团团','gold',null,'secret-e'),('${BOT}','Quote','gold',null,'secret-bot');
   create schema storage;create table storage.buckets(id text primary key,public boolean not null default false);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
   insert into storage.buckets values('review-journal-images',false),('community-avatars',false);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
   create policy own_images on storage.objects for all to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);`);
  for(const migration of migrations)await db.exec(migration);
  await service('configure',{authorId:BOT});
  const historical=await insert(A),privatePost=await insert(A,'private','SECRET_PRIVATE');
  await db.exec(preflight);await db.exec(sql);await db.exec(sql);
  const audited=await db.exec(postflight);assert.equal(audited.at(-1).rows[0].quote_assistant_proactive_postflight.businessUnchanged,true);await db.exec(postflight);
  await t.test('default-off and repeated migration do not enqueue or mutate existing records',async()=>{
   assert.equal((await proactive('state')).enabled,false);assert.equal((await rows('select count(*) n from public.quote_assistant_proactive_events'))[0].n,0);
   assert.equal((await rows('select text from public.review_logs where id=$1',[privatePost.id]))[0].text,'SECRET_PRIVATE');
   await insert(E);assert.equal((await rows('select count(*) n from public.quote_assistant_proactive_events'))[0].n,0);
   assert.equal((await proactive('claim')).reason,'disabled');
  });
  await t.test('only service role configures fixed identities and consumes protected queue',async()=>{
   for(const role of ['anon','authenticated'])await denied(()=>as(role==='anon'?null:E,"select public.quote_assistant_proactive('state','{}')",[],role));
   for(const table of ['config','events','daily_usage'])await denied(()=>as(E,`select * from public.quote_assistant_proactive_${table}`));
   await denied(()=>proactive('configure',{...config,reviewAuthorIds:[B,B,C]}),'22023');
   await denied(()=>proactive('configure',{...config,founderId:BOT}),'22023');
   await proactive('configure',config);
   assert.equal(await eventFor(historical),undefined);
  });
  await t.test('new public content alone queues, waits 60 seconds and trusts IDs rather than nicknames',async()=>{
   const post=await insert(E),hidden=await insert(E,'private'),botPost=await insert(BOT);
   assert.equal((await eventFor(post)).mode,'general');assert.equal(await eventFor(hidden),undefined);assert.equal(await eventFor(botPost),undefined);
   const event=await eventFor(post);assert.ok(Date.parse(event.due_at)-Date.parse(event.created_at)>=59000);
   const reply=await comment(E,post),botReply=await comment(BOT,post);
   assert.ok(await eventFor(post,'community',reply.id));assert.equal(await eventFor(post,'community',botReply.id),undefined);
   const claim=await claimFor(post);assert.equal(claim.context.invocation.authorId,E);assert.equal(claim.context.assistant.authorId,BOT);assert.equal(claim.context.mode,'general');
   assert.doesNotMatch(JSON.stringify(claim.context),/SECRET_PRIVATE|secret-[a-z]/);
   assert.equal((await proactive('claim')).event,null,'active lease cannot be taken twice');await decide(claim,'skip');
  });
  await t.test('founder post is liked and replied once, including trusted generation metadata',async()=>{
   const post=await insert(A);const c=await claimFor(post);assert.equal(c.event.mode,'founder_post');
   assert.equal((await rows('select count(*) n from public.review_public_likes where post_id=$1 and user_id=$2',[post.postId,BOT]))[0].n,1);
   const decision=await decide(c,'skip','founder-first');assert.equal(decision.status,'queued','founder participation is mandatory but not agreement');
   const {ctx,draft}=await finish(decision.job);assert.equal(ctx.proactive.mode,'founder_post');assert.deepEqual(ctx.publicPosts,[]);assert.deepEqual(ctx.memories,[]);
   const done=await publish(draft);assert.equal(done.status,'published');assert.equal((await publish(draft)).postRef.commentId,done.postRef.commentId);
   assert.equal((await rows('select count(*) n from public.review_community_evaluations where post_id=$1 and author_id=$2',[post.postId,BOT]))[0].n,1);
   assert.equal((await eventFor(post)).status,'published');
   const founderReply=await comment(A,post,'谢谢');const cr=await claimFor(post,'community',founderReply.id);assert.equal(cr.event.mode,'general');assert.equal((await decide(cr,'skip')).status,'skipped');
  });
  await t.test('all three configured review authors receive the same review role',async()=>{
   for(const author of [B,C,D]){const post=await insert(author);const c=await claimFor(post);assert.equal(c.context.mode,'review_author');await decide(c,'skip');}
  });
  await t.test('explicit invocation before or after proactive reservation shares the exact same job',async()=>{
   const first=await insert(E,'public','@Quote 说明分散风险');const explicit=await user(E,'create',{id:id(),kind:'reply',postId:first.postId,autoPublish:true});
   assert.equal((await claimFor(first)).status,'deduplicated');assert.equal((await eventFor(first)).job_id,explicit.id);
   const second=await insert(E,'public','@Quote 回撤是如何计算');const c=await claimFor(second);const proactiveJob=(await decide(c)).job;
   const repeated=await user(E,'create',{id:id(),kind:'reply',postId:second.postId,autoPublish:true});assert.equal(repeated.id,proactiveJob.id);
   assert.equal((await rows('select count(*) n from public.quote_assistant_jobs where post_id=$1',[second.postId]))[0].n,1);
  });
  await t.test('skipped source does not suppress a later explicit invocation',async()=>{
   const post=await insert(E,'public','@Quote 一个简单问题');const c=await claimFor(post);await decide(c,'skip');
   const explicit=await user(E,'create',{id:id(),kind:'reply',postId:post.postId,autoPublish:true});assert.equal(explicit.status,'pending');
  });
  await t.test('same semantic question key in a thread is not answered twice',async()=>{
   const post=await insert(E);const c=await claimFor(post);const first=(await decide(c,'reply','same-risk-question')).job;const {draft}=await finish(first);await publish(draft);
   const reply=await comment(B,post,'把同一个问题换个说法');const second=await claimFor(post,'community',reply.id);
   assert.equal((await decide(second,'reply','same-risk-question')).reason,'duplicate_question');
  });
  await t.test('new human or assistant answers invalidate in-flight decisions and generated drafts',async()=>{
   const post=await insert(E),c=await claimFor(post);await comment(B,post,'我已经给出了充分解释');
   assert.equal((await decide(c)).reason,'discussion_changed');
   const fresh=await claimFor(post);const job=(await decide(fresh)).job;const {draft}=await finish(job);
   await comment(BOT,post,'另一条已完成的 Quote 回答');assert.equal((await publish(draft)).status,'cancelled');
  });
  await t.test('source privacy and disable switch prevent queued publication without suppressing explicit jobs',async()=>{
   const post=await insert(E);const job=(await decide(await claimFor(post))).job;const {draft}=await finish(job);
   await proactive('configure',{enabled:false});assert.equal((await publish(draft)).status,'cancelled');assert.equal((await proactive('claim')).reason,'disabled');
   const explicitPost=await insert(E,'public','@Quote 开关关闭仍需回答');const explicit=await user(E,'create',{id:id(),kind:'reply',postId:explicitPost.postId,autoPublish:true});
   const complete=await finish(explicit);assert.equal((await publish(complete.draft)).status,'published');
   await proactive('configure',config);
   const hidden=await insert(E);const hc=await claimFor(hidden);await as(E,"update public.review_logs set review_data=jsonb_set(review_data,'{visibility}','\"private\"') where id=$1",[hidden.id]);
   assert.equal((await decide(hc)).status,'cancelled');
  });
  await t.test('daily reply limits defer founder engagement instead of discarding it',async()=>{
   const day=(await rows("select (clock_timestamp() at time zone 'UTC')::date::text as today"))[0].today;
   await proactive('configure',{enabled:true,dailyReplyLimit:1});await rows('update public.quote_assistant_proactive_daily_usage set replies=1 where day=$1',[day]);
   const post=await insert(A);const result=await decide(await claimFor(post));assert.equal(result.reason,'reply_budget');
   const event=await eventFor(post);assert.equal(event.status,'waiting');assert.ok(Date.parse(event.due_at)>Date.now());
   await proactive('configure',config);
  });
  await t.test('discussion-only changes are re-evaluated with the same job, never duplicated or endlessly retried',async()=>{
   const post=await insert(A);let decision=await decide(await claimFor(post));const originalId=decision.job.id;
   for(let attempt=1;attempt<=3;attempt++){
    const {draft}=await finish(decision.job);await comment(B,post,`新增需要核对的信息 ${attempt}`);
    assert.equal((await publish(draft)).status,'cancelled');
    const event=await eventFor(post);assert.equal(event.status,attempt<3?'waiting':'failed');
    assert.equal((await service('claim',{id:originalId})).leaseToken,null,'retry of cancelled job must not destroy pending re-evaluation');
    assert.equal((await eventFor(post)).status,event.status);
    if(attempt<3){decision=await decide(await claimFor(post));assert.equal(decision.job.id,originalId);assert.equal(decision.job.status,'pending');}
   }
   assert.equal((await rows('select count(*) n from public.quote_assistant_jobs where post_id=$1',[post.postId]))[0].n,1);
   assert.equal((await rows('select count(*) n from public.review_community_evaluations where post_id=$1 and author_id=$2',[post.postId,BOT]))[0].n,0);
  });
  await t.test('source edits and user cancellation cannot be revived by the bounded discussion retry',async()=>{
   const post=await insert(A);const job=(await decide(await claimFor(post))).job;const {draft}=await finish(job);await comment(B,post,'新增信息');await publish(draft);
   await as(A,'update public.review_logs set text=$2 where id=$1',[post.id,'已经改写原始内容']);
   const c=await claimFor(post);assert.equal(c.event,null);assert.equal((await rows('select status from public.quote_assistant_jobs where id=$1',[job.id]))[0].status,'cancelled');
   const userPost=await insert(A);const userJob=(await decide(await claimFor(userPost))).job;const generated=await finish(userJob);await comment(B,userPost,'新信息');await publish(generated.draft);
   const cancelled=(await rows('select revision from public.quote_assistant_jobs where id=$1',[userJob.id]))[0];
   await user(A,'cancel',{id:userJob.id,revision:cancelled.revision});
   assert.equal((await eventFor(userPost)).status,'cancelled');assert.equal((await rows('select error_code from public.quote_assistant_jobs where id=$1',[userJob.id]))[0].error_code,'CANCELLED_BY_USER');
  });
  await t.test('likes and nickname changes do not invalidate content while image presence is trusted',async()=>{
   const post=await insert(A,'public','',{images:[{path:`${A}/${id()}.jpg`,mimeType:'image/jpeg',size:20}]});
   const c=await claimFor(post);assert.equal(c.context.post.hasImages,true);assert.equal(c.context.invocation.hasImages,true);
   await as(A,'update public.community_profiles set nickname=$2 where user_id=$1',[A,'改名后的创始人']);
   await rows('insert into public.review_public_likes(post_id,user_id) values($1,$2)',[post.postId,B]);
   const decision=await decide(c);assert.equal(decision.status,'queued');const {ctx,draft}=await finish(decision.job);assert.equal(ctx.post.hasImages,true);assert.equal((await publish(draft)).status,'published');
  });
  await t.test('new author evaluations queue once while editing existing evaluations does not',async()=>{
   const post=await insert(E);const evaluation={id:id(),date:'2026-11-09',text:'请分析这次判断',score:null,tags:[],images:[]};
   await as(E,"update public.review_logs set review_data=review_data||jsonb_build_object('replies',$2::jsonb) where id=$1",[post.id,[evaluation]]);
   assert.ok(await eventFor(post,'author',evaluation.id));
   await as(E,"update public.review_logs set review_data=review_data||jsonb_build_object('replies',$2::jsonb) where id=$1",[post.id,[{...evaluation,text:'已修改判断'}]]);
   assert.equal((await rows("select count(*) n from public.quote_assistant_proactive_events where post_id=$1 and source_kind='author'",[post.postId]))[0].n,1);
  });
  await t.test('direct replies containing only thanks may stop with no publication; explicit mentions cannot',async()=>{
   const post=await insert(E);const botReply=await comment(BOT,post,'先前的解释');
   for(const text of ['谢谢','谢谢 @QuoteX','谢谢 @Quote_abc']){
    const reply=await comment(E,post,text,{kind:'community',id:botReply.id});
    const job=await user(E,'create',{id:id(),kind:'reply',postId:post.postId,replyTo:{kind:'community',id:reply.id},autoPublish:true});
    const c=await service('claim',{id:job.id});
    const skipped=await service('participation-skip',{id:job.id,leaseToken:c.leaseToken,reason:'只有感谢，没有新问题'});
    assert.equal(skipped.status,'cancelled');assert.equal(skipped.errorCode,'NO_REPLY_NEEDED');assert.equal(skipped.text,'');assert.equal(skipped.postRef,null);
   }
   for(const text of ['@Quote 请继续','@Quote继续解释']){
    const reply=await comment(E,post,text,{kind:'community',id:botReply.id});
    const job=await user(E,'create',{id:id(),kind:'reply',postId:post.postId,replyTo:{kind:'community',id:reply.id},autoPublish:true});const c=await service('claim',{id:job.id});
    await denied(()=>service('participation-skip',{id:job.id,leaseToken:c.leaseToken,reason:'不能跳过明确召唤'}));
    await denied(()=>service('participation-skip',{id:job.id,leaseToken:id(),reason:'旧租约'}),'40001');
   }
   await denied(()=>as(null,"select public.quote_assistant_service_foundation_20261108('identity','{}')",[],'service_role'));
  });
  await t.test('failed and stale leases cannot change an already processed event',async()=>{
   const post=await insert(E),c=await claimFor(post);assert.equal((await proactive('fail',{id:c.event.id,leaseToken:c.leaseToken,errorCode:'ASSISTANT_TIMEOUT'})).status,'waiting');
   await denied(()=>decide(c),'40001');
   for(let attempt=2;attempt<=3;attempt++){const next=await claimFor(post);assert.equal((await proactive('fail',{id:next.event.id,leaseToken:next.leaseToken,errorCode:'ASSISTANT_TIMEOUT'})).status,attempt<3?'waiting':'failed');}
   assert.equal((await eventFor(post)).status,'failed');const state=await proactive('state');assert.ok(state.counts.failed>0);assert.equal(state.lastFailureCode,'ASSISTANT_TIMEOUT');assert.doesNotMatch(JSON.stringify(state),/SECRET_PRIVATE|决策依据/);
  });
 }finally{await db.close();}
});
