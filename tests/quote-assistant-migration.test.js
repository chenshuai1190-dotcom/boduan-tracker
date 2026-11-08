import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const moduleFile = process.env.PGLITE_MODULE_FILE;
const files = ['review_public_activity_20261108.sql','review_public_replies_20261108.sql','review_community_evaluations_20261108.sql','review_public_chronology_replies_20261108.sql','review_activity_notifications_20261108.sql','review_thread_interactions_20261108.sql','review_thread_preview_reply_20261108.sql'];
const migrations = await Promise.all(files.map(file => readFile(new URL(`../supabase/${file}`, import.meta.url),'utf8')));
const sql = await readFile(new URL('../supabase/quote_assistant_foundation_20261108.sql',import.meta.url),'utf8');
const preflight = await readFile(new URL('../supabase/verification/quote_assistant_preflight.sql',import.meta.url),'utf8');
const postflight = await readFile(new URL('../supabase/verification/quote_assistant_postflight.sql',import.meta.url),'utf8');
const restProbes = await readFile(new URL('../scripts/verify-rls-rest.mjs',import.meta.url),'utf8');
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', C='33333333-3333-4333-8333-333333333333', BOT='44444444-4444-4444-8444-444444444444';
let sequence=0; const id=()=>`88888888-8888-4888-8888-${String(++sequence).padStart(12,'0')}`;

test('assistant service has explicit role grants and never creates an Auth user or rewrites the ledger',()=>{
 assert.match(sql,/grant execute on function public.quote_assistant_service\(text,jsonb\) to service_role/);
 assert.match(sql,/revoke all on function public.quote_assistant_service\(text,jsonb\) from public,anon,authenticated/);
 assert.doesNotMatch(sql,/\b(?:insert into|update|delete from)\s+(?:auth\.users|public\.(?:stock_trades|pnl_report_snapshots|community_competition_snapshots))/i);
});

test('anonymous REST probes include all assistant raw tables and RPC boundaries without mutation',async()=>{
 const end=restProbes.indexOf('\nfunction unique(');assert.ok(end>0);
 const declarations=JSON.parse(JSON.stringify(runInNewContext(`${restProbes.slice(0,end)}\n({tables:SERVICE_ONLY_TABLES,rpcs:[...SERVICE_ONLY_RPCS,...AUTHENTICATED_USER_RPCS]})`,{}, {timeout:1000})));
 for(const [table,select] of [['identity','author_id'],['preferences','owner_id'],['memories','owner_id'],['sessions','owner_id'],['subscriptions','owner_id'],['jobs','owner_id'],['sources','job_id'],['comment_sources','job_id']])
  assert.deepEqual(declarations.tables.filter(x=>x.table===`quote_assistant_${table}`),[{table:`quote_assistant_${table}`,select}]);
 const expected=[['quote_assistant_service',{p_action:'identity',p_payload:{}}],['quote_assistant_user',{p_action:'state',p_payload:{},p_expected_user_id:null}],['quote_assistant_author_id',{}],['quote_assistant_fingerprint',{p_post_id:null,p_scope:'public',p_owner:null}]];
 for(const [name,body]of expected)assert.deepEqual(declarations.rpcs.filter(x=>x.name===name),[{name,body}]);
 const start=restProbes.indexOf('async function probeAnonymousRpc('),stop=restProbes.indexOf('\nconst config =',start);let status;
 const probe=runInNewContext(`${restProbes.slice(start,stop)}\nprobeAnonymousRpc`,{fetch:async()=>({status})},{timeout:1000});
 for(status of [200,400,401,403,404,500])for(const [name,body]of expected)
  assert.equal((await probe({supabaseUrl:'https://example.invalid',anonKey:'synthetic'},{name,body})).ok,[401,403].includes(status));
});

test('Quote assistant executes isolated memory, guarded jobs, source revocation and official publication in PostgreSQL', {
 skip: !moduleFile && 'Set PGLITE_MODULE_FILE for isolated SQL execution.',
}, async t => {
 const { PGlite } = await import(pathToFileURL(moduleFile).href), db = await PGlite.create();
 const rows=async(q,args=[])=>(await db.query(q,args)).rows;
 async function as(user,q,args=[],role='authenticated') {
  await db.exec(`set role ${role}`);
  try { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']); return await rows(q,args); }
  finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); }
 }
 const user=async(who,action,payload={},expected=who)=>(await as(who,'select public.quote_assistant_user($1,$2,$3) value',[action,payload,expected]))[0].value;
 const service=async(action,payload={})=>(await as(null,'select public.quote_assistant_service($1,$2) value',[action,payload],'service_role'))[0].value;
 const rpc=async(who,name,args=[])=>(await as(who,`select public.${name}(${[...args,who].map((_,i)=>`$${i+1}`).join(',')}) value`,[...args,who]))[0].value;
 const denied=(fn,code='42501')=>assert.rejects(fn,e=>e.code===code);
 const create=(who,kind,extra={})=>user(who,'create',{id:id(),kind,prompt:'请根据当前信息回答',...extra});
 const insert=async(who=A,visibility='public',text='Public source',extra={})=>{
  const [row]=await as(who,"insert into public.review_logs(user_id,text,log_date,review_data) values($1,$2,'2020-01-02',$3) returning id",[who,text,{visibility,...extra}]);
  return {id:row.id,postId:`log:${row.id}`,user:who};
 };
 const privacy=(post,visibility)=>as(post.user,"update public.review_logs set review_data=jsonb_set(review_data,'{visibility}',to_jsonb($2::text)) where id=$1",[post.id,visibility]);
 const saveComment=(who,post,text='@Quote 请帮我梳理',replyTo=null)=>rpc(who,'save_review_community_evaluation_v2',[post.postId,id(),0,{date:'2020-01-02',text,score:null,images:[]},replyTo]);
 const claim=job=>service('claim',{id:job.id});
 const context=(job,token)=>service('context',{id:job.id,leaseToken:token});
 const complete=(job,token,text='依据这段公开讨论整理的回答。')=>service('complete',{id:job.id,leaseToken:token,text});
 const publish=(job,owner=A)=>service('publish',{id:job.id,ownerId:owner,revision:job.revision});
 async function finish(job,text) { const c=await claim(job); assert.ok(c.leaseToken); await context(job,c.leaseToken); return complete(job,c.leaseToken,text); }
 try {
  await db.exec(`
   create role anon nologin;create role authenticated nologin;create role service_role nologin;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
   insert into auth.users values('${A}'),('${B}'),('${C}'),('${BOT}');
   create table public.disciplines(id bigint generated by default as identity primary key,user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',created_at timestamptz not null default now());
   create table public.review_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',log_date date not null,created_at timestamptz not null default now());
   create table public.community_profiles(user_id uuid primary key references auth.users(id),nickname text,avatar_key text,avatar_path text,private_email text);
   alter table public.disciplines enable row level security;alter table public.review_logs enable row level security;alter table public.community_profiles enable row level security;
   create policy own_insights on public.disciplines for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
   create policy own_logs on public.review_logs for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
   create policy own_profiles on public.community_profiles for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
   grant select,insert,update,delete on public.disciplines,public.review_logs,public.community_profiles to authenticated;
   grant usage,select on all sequences in schema public to authenticated;
   insert into public.community_profiles values('${A}','Author','gold',null,'secret-a'),('${B}','Quote','gold',null,'secret-b'),('${C}','Third','gold',null,'secret-c'),('${BOT}','Internal bot','gold',null,'secret-bot');
   create schema storage;create table storage.buckets(id text primary key,public boolean not null default false);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
   insert into storage.buckets values('review-journal-images',false),('community-avatars',false);
   alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;
   grant select,insert,update,delete on storage.objects to anon,authenticated;
   create policy own_images on storage.objects for all to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);
  `);
  for(const migration of migrations) await db.exec(migration);
  const legacy=await insert(A,'private','Never expose this private text');
  const fingerprint=async()=>(await rows("select md5(string_agg(to_jsonb(t)::text,'' order by id)) value from public.review_logs t"))[0].value;
  const before=await fingerprint();await db.exec(preflight);await db.exec(sql);await db.exec(sql);assert.equal(await fingerprint(),before);
  const audit=await db.exec(postflight);assert.equal(audit.at(-1).rows[0].quote_assistant_postflight.businessUnchanged,true);
  await db.exec(postflight);
  await t.test('bootstrap is service only, stable and a human named Quote is not the assistant',async()=>{
   assert.equal(await service('identity'),null);
   await denied(()=>create(A,'daily-review',{date:'2020-01-02'}),'55000');
   await denied(()=>as(A,"select public.quote_assistant_service('configure',$1)",[{authorId:A}]));
   await denied(()=>service('configure',{authorId:id()}),'22023');
   assert.deepEqual(await service('configure',{authorId:BOT}),{authorId:BOT});
   assert.deepEqual(await service('configure',{authorId:BOT}),{authorId:BOT});
   await denied(()=>service('configure',{authorId:A}),'40001');
   assert.equal((await user(A,'state')).assistant.authorId,BOT);
   const pretend=await insert(B);const post=await rpc(A,'read_review_public_post',[pretend.postId]);
   assert.equal(post.author.nickname,'Quote');assert.equal(post.author.isAssistant,false);
   await denied(()=>user(BOT,'create',{id:id(),kind:'chat',prompt:'loop'}));
  });
  await t.test('owner memory CRUD is CAS guarded and has no raw table or cross-user access',async()=>{
   const memory=await user(A,'save-memory',{id:id(),text:'希望复盘时检查交易纪律',revision:0});
   assert.equal(memory.revision,1);
   assert.equal((await user(B,'state')).memories.length,0);
   await denied(()=>user(B,'save-memory',{id:memory.id,text:'attack',revision:1}));
   await denied(()=>user(B,'delete-memory',{id:memory.id,revision:1}));
   await denied(()=>user(A,'state',{},B));
   const edited=await user(A,'save-memory',{id:memory.id,text:'回答简短，并关注计划执行',revision:1});
   assert.equal(edited.revision,2);
   await denied(()=>user(A,'save-memory',{id:memory.id,text:'stale',revision:1}),'40001');
   assert.equal((await user(A,'save-memory',{id:memory.id,text:edited.text,revision:1})).revision,2);
   for(const table of ['identity','memories','sessions','jobs','sources','comment_sources','subscriptions','preferences']) await denied(()=>as(A,`select * from public.quote_assistant_${table}`));
   await denied(()=>as(null,"select public.quote_assistant_user('state','{}',null)",[],'anon'));
   await denied(()=>as(A,"select public.quote_assistant_fingerprint($1,'public',$2)",[legacy.postId,A]));
  });
  await t.test('chat has scoped history, enabled personal memory and can never publish',async()=>{
   const job=await create(A,'chat'),c=await claim(job),ctx=await context(job,c.leaseToken);
   assert.equal(ctx.memoryEnabled,true);assert.equal(ctx.memories.length,1);assert.doesNotMatch(JSON.stringify(ctx),/secret-a|Never expose/);
   assert.deepEqual((await claim(job)).leaseToken,null);
   const draft=await complete(job,c.leaseToken,'这是私密回答。');assert.equal(draft.canPublish,false);
   await denied(()=>publish(draft),'42501');
   const follow=await create(A,'chat',{sessionId:job.sessionId,prompt:'接着刚才说'}),followClaim=await claim(follow),followCtx=await context(follow,followClaim.leaseToken);
   assert.equal(followCtx.history.length,1);assert.equal(followCtx.history[0].text,'这是私密回答。');
   await denied(()=>create(B,'chat',{sessionId:job.sessionId}));
   await denied(()=>create(A,'reply',{sessionId:job.sessionId,postId:legacy.postId}),'P0002');
   const payload={id:id(),kind:'chat',prompt:'Retry same exact request'};
   assert.equal((await user(A,'create',payload)).id,(await user(A,'create',payload)).id);
   await denied(()=>user(A,'create',{...payload,prompt:'Reused differently'}),'40001');
   await denied(()=>user(B,'create',payload));
  });
  await t.test('model memory learning is lease/owner/epoch scoped; delete and pause defeat stale model writes',async()=>{
   const j=await create(A,'chat',{prompt:'我喜欢用简短中文交流'}),c=await claim(j),ctx=await context(j,c.leaseToken),memoryId=id();
   const learned=await service('apply-memories',{id:j.id,leaseToken:c.leaseToken,memoryEpoch:ctx.memoryEpoch,upserts:[{id:memoryId,text:'喜欢简短中文回答',revision:0}]});
   assert.equal(learned.applied,true);
   const late=await create(A,'chat'),lc=await claim(late),lctx=await context(late,lc.leaseToken);
   await user(A,'delete-memory',{id:memoryId,revision:1});
   assert.equal((await service('apply-memories',{id:late.id,leaseToken:lc.leaseToken,memoryEpoch:lctx.memoryEpoch,upserts:[{id:id(),text:'喜欢简短中文回答',revision:0}]})).reason,'MEMORY_CHANGED');
   await user(A,'memory-preferences',{enabled:false});
   const paused=await create(A,'chat'),pc=await claim(paused),pctx=await context(paused,pc.leaseToken);
   assert.equal(pctx.memoryEnabled,false);assert.deepEqual(pctx.memories,[]);
   assert.equal((await service('apply-memories',{id:paused.id,leaseToken:pc.leaseToken,memoryEpoch:pctx.memoryEpoch,upserts:[]})).reason,'MEMORY_PAUSED');
   await user(A,'memory-preferences',{enabled:true});
   const otherMemory=await user(B,'save-memory',{id:id(),text:'B secret preference',revision:0});
   const safe=await create(A,'chat'),sc=await claim(safe),sctx=await context(safe,sc.leaseToken);
   await denied(()=>service('apply-memories',{id:safe.id,leaseToken:sc.leaseToken,memoryEpoch:sctx.memoryEpoch,upserts:[{id:otherMemory.id,text:'overwrite',revision:1}]}));
   assert.equal((await user(B,'state')).memories[0].text,'B secret preference');
  });
  await t.test('automatic @ replies are real invocations, idempotent and use the existing notification chain',async()=>{
   const post=await insert(A,'public','Discuss this'),comment=await saveComment(B,post),target={kind:'community',id:comment.id};
   await denied(()=>create(A,'reply',{postId:post.postId,replyTo:target,autoPublish:true}));
   const job=await create(B,'reply',{postId:post.postId,replyTo:target,autoPublish:true}),c=await claim(job),ctx=await context(job,c.leaseToken);
   assert.deepEqual(ctx.memories,[]);assert.equal(ctx.memoryEnabled,false);
   await denied(()=>service('apply-memories',{id:job.id,leaseToken:c.leaseToken,memoryEpoch:ctx.memoryEpoch,upserts:[]}));
   assert.equal((await create(B,'reply',{postId:post.postId,replyTo:target,autoPublish:true})).id,job.id);
   const draft=await complete(job,c.leaseToken),published=await publish(draft,B),again=await publish(draft,B);
   assert.equal(published.status,'published');assert.deepEqual(again.postRef,published.postRef);
   const comments=await rpc(A,'fetch_review_comment_threads',[post.postId,20,null,null]);
   assert.equal(comments.totalCount,2);assert.equal(comments.threads[0].previewReply.authorId,BOT);assert.equal(comments.threads[0].previewReply.author.isAssistant,true);
   const notifications=await rpc(B,'fetch_review_activity_notifications',[20,null,null,'all']);
   const botNotes=notifications.notifications.filter(n=>n.actorId===BOT);assert.equal(botNotes.length,1);assert.equal(botNotes[0].kind,'reply');assert.equal(botNotes[0].actor.isAssistant,true);
   await denied(()=>publish(draft,A));
   await privacy(post,'private');
   const state=await user(B,'state'),gone=state.jobs.find(j=>j.id===job.id);assert.equal(gone.status,'cancelled');assert.equal(gone.text,'');assert.deepEqual(gone.sources,[]);
   assert.equal((await rpc(B,'fetch_review_activity_notification_count')).unreadCount,0);
   await denied(()=>rpc(B,'fetch_review_comment_threads',[post.postId,20,null,null]),'P0002');
   await privacy(post,'public');assert.equal((await user(B,'state')).jobs.find(j=>j.id===job.id).status,'cancelled');
   const selfPost=await insert(A,'public','@Quote 你怎么看？'),auto=await create(A,'reply',{postId:selfPost.postId,autoPublish:true});
   assert.equal(auto.autoPublish,true);assert.equal((await create(A,'reply',{postId:selfPost.postId,autoPublish:true})).id,auto.id);
  });
  await t.test('source edits/retraction clear drafts and hide derived standalone publications',async()=>{
   const post=await insert(A,'public','This is a quoteable public idea');
   const date=(await rows('select current_date::text date'))[0].date;
   const j=await create(B,'weekly-digest',{rangeStart:date,rangeEnd:date}),c=await claim(j),ctx=await context(j,c.leaseToken);
   assert.ok(ctx.publicPosts.some(p=>p.id===post.postId),'uses actual publish time even though record_date is 2020');
   assert.ok(!ctx.publicPosts.some(p=>p.id===legacy.postId));
   const draft=await complete(j,c.leaseToken),published=await publish(draft,B);
   const botPost=await rpc(A,'read_review_public_post',[published.postRef.postId]);assert.equal(botPost.author.isAssistant,true);
   await privacy(post,'private');
   assert.equal(await rpc(A,'read_review_public_post',[published.postRef.postId]),null);
   assert.equal((await user(B,'state')).jobs.find(i=>i.id===j.id).text,'');
   const editPost=await insert(A),editJob=await create(B,'reply',{postId:editPost.postId}),ec=await claim(editJob);await context(editJob,ec.leaseToken);
   await as(A,"update public.review_logs set text='Changed after model request' where id=$1",[editPost.id]);
   await denied(()=>complete(editJob,ec.leaseToken),'42501');
   const commentPost=await insert(A),target=await saveComment(B,commentPost,'Old public comment');
   const cj=await create(A,'reply',{postId:commentPost.postId}),cc=await claim(cj);await context(cj,cc.leaseToken);
   await rpc(B,'delete_review_community_evaluation',[commentPost.postId,target.id,target.revision]);
   assert.equal((await user(A,'state')).jobs.find(i=>i.id===cj.id).status,'cancelled');
  });
  await t.test('new or unquoted author comments preserve an answer; editing or removing an actual quoted comment withdraws it',async()=>{
   const old={id:'quoted-author-comment',date:'2020-01-02',text:'Original author note'};
   const post=await insert(A,'public','Discussion with author comments',{replies:[old]});
   const j=await create(B,'reply',{postId:post.postId}),c=await claim(j),ctx=await context(j,c.leaseToken);
   assert.ok(ctx.comments.some(n=>n.id===old.id&&n.kind==='author'));
   const published=await publish(await complete(j,c.leaseToken),B);
   const newer={id:'new-author-comment',date:'2020-01-02',text:'Added after the assistant answer'};
   const put=replies=>as(A,"update public.review_logs set review_data=jsonb_set(review_data,'{replies}',$2) where id=$1",[post.id,replies]);
   await put([old,newer]);assert.equal((await user(B,'state')).jobs.find(i=>i.id===j.id).status,'published');
   await put([old,{...newer,text:'Changed, but not used by the existing answer'}]);
   assert.equal((await user(B,'state')).jobs.find(i=>i.id===j.id).status,'published');
   await put([{...old,text:'Changed the factual premise'},newer]);
   assert.equal((await user(B,'state')).jobs.find(i=>i.id===j.id).status,'cancelled');
   assert.equal((await rows('select deleted_at is not null gone from public.review_community_evaluations where id=$1',[published.postRef.commentId]))[0].gone,true);
   const next=await create(B,'reply',{postId:post.postId}),nc=await claim(next);await context(next,nc.leaseToken);await complete(next,nc.leaseToken);
   await put([newer]);assert.equal((await user(B,'state')).jobs.find(i=>i.id===next.id).status,'cancelled');
  });
  await t.test('milestone requires explicit own existing timeline reference and never accepts client account amounts',async()=>{
   const event={version:1,id:'annual_return:2020-01-02',kind:'high',metric:'annual_return',date:'2020-01-02',title:'年内收益新高'};
   const source=await insert(A,'private','PRIVATE FINANCIAL CONTENT',{timelineEvent:event});
   await denied(()=>create(A,'milestone',{postId:source.postId}));
   await denied(()=>create(B,'milestone',{postId:source.postId,shareConfirmed:true}),'P0002');
   const j=await create(A,'milestone',{postId:source.postId,shareConfirmed:true,amount:999999}),c=await claim(j),ctx=await context(j,c.leaseToken);
   assert.equal(ctx.milestone.basis,'timeline_reference_only');assert.equal(ctx.milestone.event.metric,'annual_return');
   assert.doesNotMatch(JSON.stringify(ctx),/999999|PRIVATE FINANCIAL CONTENT/);assert.equal(ctx.post,null);
   const published=await publish(await complete(j,c.leaseToken,'用户主动分享了年内收益新高这一事件。'));
   assert.equal((await rpc(B,'read_review_public_post',[published.postRef.postId])).authorId,BOT);
   assert.equal((await rows('select count(*)::int n from public.review_public_posts where id=$1',[source.postId]))[0].n,0,'source timeline stays private');
   await as(A,'delete from public.review_logs where id=$1',[source.id]);
   assert.equal(await rpc(B,'read_review_public_post',[published.postRef.postId]),null);
  });
  await t.test('followup waits until due; cancelled work and stale leases cannot publish',async()=>{
   const post=await insert(A),dueAt=new Date(Date.now()+3600000).toISOString();
   await denied(()=>create(B,'followup',{postId:post.postId,dueAt}));
   const follow=await create(A,'followup',{postId:post.postId,dueAt});assert.equal((await claim(follow)).leaseToken,null);
   await rows("update public.quote_assistant_jobs set due_at=clock_timestamp()-interval '1 second' where id=$1",[follow.id]);
   assert.ok((await service('due',{limit:20})).jobs.some(j=>j.id===follow.id));
   const c=await claim(follow);await context(follow,c.leaseToken);
   await rows("update public.quote_assistant_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[follow.id]);
   const second=await claim(follow);assert.notEqual(second.leaseToken,c.leaseToken);
   await denied(()=>complete(follow,c.leaseToken));
   const draft=await complete(follow,second.leaseToken);
   await rows('update public.quote_assistant_jobs set attempts=3 where id=$1',[follow.id]);
   assert.ok((await service('due',{limit:20})).jobs.some(j=>j.id===follow.id),'completed automatic reply survives a publish network failure even on the third generation attempt');
   assert.equal((await claim(draft)).leaseToken,null,'publish recovery does not regenerate the answer');
   const published=await publish(draft);assert.equal(published.postRef.postId,post.postId);
   const cancel=await create(A,'chat'),cancelled=await user(A,'cancel',{id:cancel.id,revision:cancel.revision});assert.equal(cancelled.status,'cancelled');assert.equal((await claim(cancelled)).leaseToken,null);
  });
  await t.test('recurring opt-in creates one future draft task and cancellation stops future work',async()=>{
   const first=await create(B,'daily-review',{date:'2020-01-02',recurrence:'daily'}),c=await claim(first);await context(first,c.leaseToken);
   const actualDate=(await rows('select current_date::text d'))[0].d;const verified={id:first.id,leaseToken:c.leaseToken,text:'历史盘后草稿',marketDate:actualDate,nextDueAt:new Date(Date.now()+86400000).toISOString()};
   const draft=await service('complete',verified);assert.equal(draft.status,'draft');assert.equal(draft.autoPublish,false);
   await service('complete',verified);
   const [count]=await rows('select count(*)::int n from public.quote_assistant_jobs where subscription_id=$1',[first.id]);assert.equal(count.n,2);
   let state=await user(B,'state'),subscription=state.subscriptions.find(s=>s.id===first.id);assert.equal(subscription.active,true);
   await denied(()=>user(A,'cancel-subscription',{id:first.id,revision:subscription.revision}),'P0002');
   await user(B,'cancel-subscription',{id:first.id,revision:subscription.revision});state=await user(B,'state');
   assert.equal(state.jobs.filter(j=>j.subscriptionId===first.id&&j.status==='pending').length,0);
   assert.equal(state.jobs.find(j=>j.id===first.id).status,'draft');
  });
  await t.test('old reply target and its ancestors survive the bounded latest-comment window',async()=>{
   const post=await insert(A),root=await saveComment(B,post,'Old root argument');
   const target=await saveComment(A,post,'Old exact follow-up',{kind:'community',id:root.id});
   for(let i=0;i<45;i++)await saveComment(B,post,`Recent unrelated comment ${i}`);
   const j=await create(A,'reply',{postId:post.postId,replyTo:{kind:'community',id:target.id}}),c=await claim(j),ctx=await context(j,c.leaseToken);
   assert.equal(ctx.comments.length,40);assert.ok(ctx.comments.some(item=>item.id===target.id));assert.ok(ctx.comments.some(item=>item.id===root.id));
   assert.equal(ctx.comments.find(item=>item.id===target.id).nickname,'Author');
   const other=await insert(A);await denied(()=>create(A,'reply',{postId:other.postId,sessionId:j.sessionId}));
   await denied(()=>create(A,'reply',{postId:other.postId,replyTo:{kind:'community',id:target.id}}),'P0002');
  });
  await t.test('an exhausted crashed lease becomes a visible failure instead of running forever',async()=>{
   const j=await create(A,'chat');let c;
   for(let i=0;i<3;i++) { c=await claim(j);assert.ok(c.leaseToken);await rows("update public.quote_assistant_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[j.id]); }
   await service('due',{limit:20});const exhausted=(await user(A,'state')).jobs.find(x=>x.id===j.id);
   assert.equal(exhausted.status,'failed');assert.equal(exhausted.errorCode,'RETRY_LIMIT');assert.equal((await claim(j)).leaseToken,null);
   await denied(()=>user(A,'retry',{id:j.id,revision:exhausted.revision}),'22023');
  });
  await t.test('explicit owner withdrawal hides an already published Quote draft',async()=>{
   const j=await create(B,'daily-review',{date:'2020-01-02'}),draft=await finish(j,'User requested historical market summary'),published=await publish(draft,B);
   await denied(()=>user(A,'cancel',{id:j.id,revision:published.revision}),'P0002');
   const revoked=await user(B,'cancel',{id:j.id,revision:published.revision});assert.equal(revoked.status,'cancelled');assert.equal(revoked.text,'');
   assert.equal(await rpc(A,'read_review_public_post',[published.postRef.postId]),null);
  });
  await t.test('malformed timeline metadata and raw client financial numbers never create a shareable source',async()=>{
   const malformed=await insert(A,'private','private',{timelineEvent:{version:1,id:'bad:source',date:'2020-01-02',title:'Missing kind and metric'}});
   assert.ok(!(await user(A,'state')).milestones.some(item=>item.postId===malformed.postId));
   await denied(()=>create(A,'milestone',{postId:malformed.postId,shareConfirmed:true,amount:123456}),'P0002');
  });
  await t.test('daily rate limit is enforced and failures expose only a safe error code',async()=>{
   const pending=[];for(let i=0;i<20;i++)pending.push(await create(C,'chat',{prompt:`Question ${i}`}));
   await denied(()=>create(C,'chat'),'54000');
   for(const job of pending)await user(C,'cancel',{id:job.id,revision:job.revision});
   for(let i=20;i<30;i++)await create(C,'chat',{prompt:`Question ${i}`});
   await denied(()=>create(C,'chat'),'54000');
   const state=await user(C,'state'),job=state.jobs[0],c=await claim(job);
   const failed=await service('fail',{id:job.id,leaseToken:c.leaseToken,errorCode:'secret token should not be stored'});
   assert.equal(failed.status,'failed');assert.equal(failed.errorCode,'ASSISTANT_FAILED');
   const retried=await user(C,'retry',{id:job.id,revision:failed.revision});assert.equal(retried.status,'pending');
   await denied(()=>user(A,'retry',{id:job.id,revision:retried.revision}),'P0002');
  });
 } finally { await db.close(); }
});
