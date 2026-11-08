import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
const moduleFile=process.env.PGLITE_MODULE_FILE;
const prerequisites=['review_public_activity_20261108.sql','review_public_replies_20261108.sql','review_community_evaluations_20261108.sql','review_public_chronology_replies_20261108.sql','review_activity_notifications_20261108.sql','review_thread_interactions_20261108.sql','review_thread_preview_reply_20261108.sql','quote_assistant_foundation_20261108.sql','quote_assistant_proactive_20261109.sql'];
const migrations=await Promise.all(prerequisites.map(name=>readFile(new URL(`../supabase/${name}`,import.meta.url),'utf8')));
const sql=await readFile(new URL('../supabase/quote_assistant_account_access_20261109.sql',import.meta.url),'utf8');
const preflight=await readFile(new URL('../supabase/verification/quote_assistant_account_access_preflight.sql',import.meta.url),'utf8');
const postflight=await readFile(new URL('../supabase/verification/quote_assistant_account_access_postflight.sql',import.meta.url),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444',E='55555555-5555-4555-8555-555555555555',BOT='66666666-6666-4666-8666-666666666666';
let seq=0;const id=()=>`88888888-8888-4888-8888-${String(++seq).padStart(12,'0')}`;
const scopes=['report','trades','holdings'];
const account={version:1,kind:'account_snapshot',basis:'close',source:'pnl_report',asOfDate:'2026-11-05',recordDate:'2026-11-05',items:[{key:'cumulativeReturnPct',value:3.39,asOfDate:'2026-11-05',basis:'close',source:'pnl_report'}]};
const market={version:1,kind:'market_snapshot',basis:'close',asOfDate:'2026-11-05',recordDate:'2026-11-05',items:[{key:'vix',value:28.18}]};
test('account access SQL does not mutate source financial ledgers or infer consent from prose',()=>{
 assert.doesNotMatch(sql,/\b(?:insert into|update|delete from)\s+public\.(?:stock_trades|pnl_report_snapshots|pnl_report_symbol_snapshots|stock_trade_ledger_revisions)\b/i);
 assert.match(sql,/public analysis requires explicit confirmation/);
 assert.match(sql,/status='granted'/);
});
test('verified attachments and single-job consent enforce owner, expiry, scopes, source and publication in PostgreSQL',{skip:!moduleFile&&'Set PGLITE_MODULE_FILE for isolated SQL execution.'},async t=>{
 const {PGlite}=await import(pathToFileURL(moduleFile).href),db=await PGlite.create();
 const rows=async(q,args=[])=>(await db.query(q,args)).rows;
 async function as(who,q,args=[],role='authenticated'){
  await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who||'']);return await rows(q,args);}
  finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
 }
 const user=async(who,action,payload={})=>(await as(who,'select public.quote_assistant_user($1,$2,$3) value',[action,payload,who]))[0].value;
 const service=async(action,payload={})=>(await as(null,'select public.quote_assistant_service($1,$2) value',[action,payload],'service_role'))[0].value;
 const denied=(fn,code='42501')=>assert.rejects(fn,error=>error.code===code);
 const post=async(who=A,extra={})=>{const [r]=await as(who,"insert into public.review_logs(user_id,text,log_date,review_data) values($1,'@Quote 请分析账户','2026-11-05',$2) returning id",[who,{visibility:'public',...extra}]);return {id:r.id,postId:`log:${r.id}`,ownerId:who};};
 const comment=async(who,p,text='@Quote 请分析这份快照',extra={},replyTo=null)=>(await as(who,'select public.save_review_community_evaluation_v2($1,$2,0,$3,$4,$5) value',[p.postId,id(),{date:'2026-11-05',text,score:null,images:[],...extra},replyTo,who]))[0].value;
 const create=async(p,replyTo=null)=>user(p.ownerId,'create',{id:id(),kind:'reply',postId:p.postId,autoPublish:true,...(replyTo?{replyTo}:{})});
 const claim=job=>service('claim',{id:job.id});
 const context=c=>service('context',{id:c.job.id,leaseToken:c.leaseToken});
 const complete=(c,text='依据授权的历史记录进行客观分析。')=>service('complete',{id:c.job.id,leaseToken:c.leaseToken,text});
 const publish=j=>service('publish',{id:j.id,ownerId:j.ownerId||A,revision:j.revision});
 const request=c=>service('request-access',{id:c.job.id,leaseToken:c.leaseToken,scopes,rangeStart:'2026-11-02',rangeEnd:'2026-11-06',reason:'需要区间内正式收益、交易与持仓来验证问题。'});
 const grant=(r,extra={})=>user(r.ownerId,'access-grant',{id:r.id,scopes:r.scopes,rangeStart:r.rangeStart,rangeEnd:r.rangeEnd,publicAnalysisConfirmed:r.outputVisibility==='public',...extra});
 const pending=async(who=A)=>{const p=await post(who),j=await create(p),c=await claim(j);await context(c);const r=await request(c);return {p,j,c,r};};
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
  await db.exec(`create table public.stock_trade_ledger_revisions(user_id uuid primary key,revision bigint not null,last_mutated_at timestamptz);
 create table public.pnl_report_rebuild_state(user_id uuid primary key,dirty_from_date date,ledger_revision bigint,generation bigint);
 create table public.pnl_report_snapshots(id uuid default gen_random_uuid(),user_id uuid,snapshot_date date,currency text default 'USD',cash_usd numeric,market_value_usd numeric,total_assets_usd numeric,margin_debt_usd numeric,net_assets_usd numeric,cumulative_pnl_usd numeric,cumulative_pnl_pct numeric,daily_pnl_usd numeric,daily_pnl_pct numeric,source_version text default 'pnl_snapshot_v2',holding_count integer default 1,cash_basis text default 'event',cash_event_id bigint default 1,cash_effective_at timestamptz default '2026-01-01Z',margin_debt_basis text default 'event',margin_debt_event_id bigint default 1,margin_debt_effective_at timestamptz default '2026-01-01Z',locked_at timestamptz,updated_at timestamptz default now());
 create table public.pnl_report_symbol_snapshots(user_id uuid,snapshot_date date,symbol text,currency text default 'USD',held_shares numeric,avg_cost_usd numeric,market_value_usd numeric,unrealized_pnl_usd numeric,source_version text default 'pnl_snapshot_v2',updated_at timestamptz default now());
 create table public.stock_trades(id uuid default gen_random_uuid(),user_id uuid,trade_date date,symbol text,side text,price numeric,shares numeric,fee numeric,currency text,note text,created_at timestamptz default now());
 insert into public.stock_trade_ledger_revisions values('${A}',4,now()),('${B}',2,now());
 insert into public.pnl_report_snapshots(user_id,snapshot_date,cash_usd,market_value_usd,total_assets_usd,margin_debt_usd,net_assets_usd,cumulative_pnl_usd,cumulative_pnl_pct,daily_pnl_usd,daily_pnl_pct,locked_at) values
 ('${A}','2026-11-04',100,900,1000,null,null,33.9,0.0339,10,0.01,'2026-11-05T01:00:00Z'),
 ('${A}','2026-11-05',110,900,1010,100,910,40,0.04,20,0.02,'2026-11-06T01:00:00Z'),
 ('${A}','2026-11-06',120,900,1020,100,920,50,0.05,30,0.03,null),
 ('${B}','2026-11-05',777777,777777,1555554,0,1555554,777777,1,777777,1,'2026-11-06T01:00:00Z');
 insert into public.pnl_report_symbol_snapshots(user_id,snapshot_date,symbol,held_shares,avg_cost_usd,market_value_usd,unrealized_pnl_usd) values
 ('${A}','2026-11-04','MSFT',1,90,900,810),('${A}','2026-11-05','NVDA',2,100,900,700),('${B}','2026-11-05','SECRET_OTHER_HOLDING',7,7,7,7);
 insert into public.stock_trades(user_id,trade_date,symbol,side,price,shares,fee,currency,note) values
 ('${A}','2026-11-04','NVDA','buy',100,2,1,'USD','private-investment-note'),
 ('${A}','2026-11-05','MSFT','buy',90,1,0,'USD','[[quote:stock-trade:record-kind=historical_holding:v1]]'),
 ('${A}','2026-10-01','OUTSIDE_RANGE','buy',1,1,0,'USD','private'),
 ('${B}','2026-11-05','SECRET_OTHER_TRADE','buy',777777,7,0,'USD','private');`);
  for(const migration of migrations)await db.exec(migration);
  await service('configure',{authorId:BOT});
  await db.exec(preflight);await db.exec(sql);await db.exec(sql);
  const audited=await db.exec(postflight);assert.equal(audited.at(-1).rows[0].quote_assistant_account_access_postflight.businessUnchanged,true);
  await t.test('RPCs enforce role and same-owner identity; raw data and bypass aliases remain inaccessible',async()=>{
   for(const role of ['anon','authenticated','service_role'])await denied(()=>as(role==='authenticated'?A:null,'select * from public.quote_assistant_access_requests',[],role));
   for(const role of ['anon','authenticated','service_role']){
    await denied(()=>as(null,"select public.quote_assistant_service_before_access_20261109('due','{}')",[],role));
    await denied(()=>as(null,"select public.quote_assistant_user_before_access_20261109('state','{}',$1)",[A],role));
   }
   await denied(()=>as(A,"select public.quote_assistant_user('access-state','{}',$1)",[B]));
   await denied(()=>as(A,"select public.quote_assistant_service('request-access','{}')"));
  });
  await t.test('public comment snapshots are visible without a private grant and fingerprints bind them',async()=>{
   const p=await post(A,{account,market,trades:[{symbol:'PRIVATE_MAIN_TRADE'}]}),e=await comment(A,p,'@Quote 请分析附件',{account,market,trades:[{id:'public-trade',symbol:'MSFT',date:'2026-11-05',side:'buy',price:90,shares:1,note:'PRIVATE_EXTRA'}]});
   const c=await claim(await create(p,{kind:'community',id:e.id})),ctx=await context(c),item=ctx.comments.find(x=>x.id===e.id);
   assert.equal(item.account.items[0].value,3.39);assert.equal(item.market.items[0].value,28.18);assert.equal(item.trades[0].price,90);
   assert.equal(ctx.post.account,undefined);assert.equal(ctx.post.market.items[0].value,28.18);
   assert.doesNotMatch(JSON.stringify(ctx),/PRIVATE_MAIN_TRADE|PRIVATE_EXTRA|SECRET_OTHER|private-investment-note/);
   assert.equal(ctx.accountAccess,undefined);
   const fp=(await rows('select fingerprint from public.quote_assistant_comment_sources where job_id=$1 and comment_id=$2',[c.job.id,e.id]))[0].fingerprint;assert.ok(fp.startsWith('v2:'));
   const draft=await complete(c),done=await publish(draft);assert.equal(done.status,'published');
   await rows("update public.review_community_evaluations set payload=jsonb_set(payload,'{account,items,0,value}','4.39') where id=$1",[e.id]);
   assert.equal((await rows('select status from public.quote_assistant_jobs where id=$1',[c.job.id]))[0].status,'cancelled');
   assert.ok((await rows('select deleted_at from public.review_community_evaluations where id=$1',[done.postRef.commentId]))[0].deleted_at);
  });
  await t.test('pending request contains metadata only; grant is explicit, owned and cannot expand scope or dates',async()=>{
   const {r,c}=await pending();const ctx=await context(c);assert.equal(ctx.accountAccess.status,'pending');assert.equal(ctx.accountAccess.data,undefined);
   assert.deepEqual((await user(B,'access-state')).requests,[]);
   await denied(()=>user(B,'access-grant',{id:r.id,scopes,rangeStart:r.rangeStart,rangeEnd:r.rangeEnd,publicAnalysisConfirmed:true}),'P0002');
   await denied(()=>grant(r,{publicAnalysisConfirmed:false}));
   await denied(()=>grant(r,{rangeStart:'2026-10-01'}),'22023');
   await denied(()=>grant(r,{scopes:['report','report']}),'22023');
   await denied(()=>grant(r,{scopes:['secret']}),'22023');
   await denied(()=>grant(r,{rangeStart:'2026-2-01'}),'22023');
   const child=await grant(r,{scopes:['report'],rangeStart:'2026-11-04',rangeEnd:'2026-11-05',ownerId:B,data:{report:'forged'},outputVisibility:'private'});
   const again=await grant({...r,scopes:['report'],rangeStart:'2026-11-04',rangeEnd:'2026-11-05'});assert.equal(child.id,again.id);assert.equal(child.ownerId,A);assert.equal(child.autoPublish,true);
   const childCtx=await context(await claim(child));assert.equal(childCtx.accountAccess.status,'authorized');assert.equal(childCtx.accountAccess.analysisJobId,child.id);assert.deepEqual(Object.keys(childCtx.accountAccess.data),['report']);
   assert.doesNotMatch(JSON.stringify(childCtx.accountAccess),/forged|SECRET_OTHER/);
   await user(A,'access-revoke',{id:r.id});
  });
  await t.test('authorized data has bounded actual dates, percentage units, null debt, and historical holding provenance',async()=>{
   const {r}=await pending(),child=await grant(r),c=await claim(child),ctx=await context(c),data=ctx.accountAccess.data;
   assert.equal(data.report.rows.length,2);assert.equal(data.report.rows[0].cumulativeReturnPct,3.39);assert.equal(data.report.rows[0].dailyReturnPct,1);
   assert.equal(data.report.rows[0].netAssets,null);assert.equal(data.report.rows[0].marginDebt,null);assert.equal(data.report.coverage.status,'verified');
   assert.equal(data.trades.rows.length,2);assert.equal(data.trades.rows[1].recordType,'historical_holding');assert.equal(data.holdings.asOfDate,'2026-11-05');assert.equal(data.holdings.rows[0].symbol,'NVDA');
   assert.doesNotMatch(JSON.stringify(data),/SECRET_OTHER|OUTSIDE_RANGE|private-investment-note|777777/);
   const draft=await complete(c),done=await publish(draft);assert.equal(done.status,'published');assert.equal((await publish(draft)).postRef.commentId,done.postRef.commentId);
   assert.equal((await user(A,'access-state')).requests.find(x=>x.id===r.id).status,'consumed');
   await user(A,'access-revoke',{id:r.id});assert.ok((await rows('select deleted_at from public.review_community_evaluations where id=$1',[done.postRef.commentId]))[0].deleted_at);
  });
  await t.test('dirty report rows are excluded and revision mismatch fails closed while real trades remain readable',async()=>{
   await rows('insert into public.pnl_report_rebuild_state values($1,$2,4,1)',[A,'2026-11-05']);
   let {r}=await pending(),child=await grant(r),ctx=await context(await claim(child));
   assert.equal(ctx.accountAccess.data.report.coverage.status,'rebuilding');assert.equal(ctx.accountAccess.data.report.rows.length,1);assert.equal(ctx.accountAccess.data.holdings.asOfDate,'2026-11-04');await user(A,'access-revoke',{id:r.id});
   await rows('update public.pnl_report_rebuild_state set ledger_revision=3 where user_id=$1',[A]);
   ({r}=await pending());child=await grant(r);ctx=await context(await claim(child));assert.equal(ctx.accountAccess.data.report.coverage.status,'unverified');assert.deepEqual(ctx.accountAccess.data.report.rows,[]);assert.equal(ctx.accountAccess.data.holdings.status,'missing');assert.equal(ctx.accountAccess.data.trades.rows.length,2);
   await user(A,'access-revoke',{id:r.id});await rows('delete from public.pnl_report_rebuild_state where user_id=$1',[A]);
  });
  await t.test('missing cash provenance and absent or partial holdings are never presented as confirmed zero',async()=>{
   await rows("update public.pnl_report_snapshots set cash_basis=null where user_id=$1 and snapshot_date='2026-11-05'",[A]);
   await rows("delete from public.pnl_report_symbol_snapshots where user_id=$1 and snapshot_date='2026-11-05'",[A]);
   let {r}=await pending(),child=await grant(r),ctx=await context(await claim(child));
   assert.equal(ctx.accountAccess.data.report.rows[1].cash,null);assert.equal(ctx.accountAccess.data.report.rows[1].totalAssets,null);assert.equal(ctx.accountAccess.data.report.rows[1].netAssets,null);assert.equal(ctx.accountAccess.data.report.rows[1].cashVerified,false);
   assert.equal(ctx.accountAccess.data.holdings.status,'missing');assert.equal(ctx.accountAccess.data.holdings.complete,false);assert.equal(ctx.accountAccess.data.holdings.coverageStatus,'unverified');await user(A,'access-revoke',{id:r.id});
   await rows("insert into public.pnl_report_symbol_snapshots(user_id,snapshot_date,symbol,held_shares,avg_cost_usd,market_value_usd,unrealized_pnl_usd) values($1,'2026-11-05','NVDA',2,100,900,700)",[A]);
   await rows("update public.pnl_report_snapshots set cash_basis='event',holding_count=2 where user_id=$1 and snapshot_date='2026-11-05'",[A]);
   ({r}=await pending());child=await grant(r);ctx=await context(await claim(child));assert.equal(ctx.accountAccess.data.holdings.status,'available');assert.equal(ctx.accountAccess.data.holdings.complete,false);await user(A,'access-revoke',{id:r.id});
   await rows("update public.pnl_report_snapshots set holding_count=1 where user_id=$1 and snapshot_date='2026-11-05'",[A]);
  });
  await t.test('revocation, expiry and source withdrawal stop leased analysis and stale publication',async()=>{
   let {r}=await pending(),child=await grant(r),c=await claim(child);await context(c);await user(A,'access-revoke',{id:r.id});await denied(()=>complete(c));
   ({r}=await pending());child=await grant(r);c=await claim(child);await context(c);await rows("update public.quote_assistant_access_requests set expires_at=clock_timestamp()-interval '1 second' where id=$1",[r.id]);assert.equal((await complete(c)).status,'cancelled');assert.equal((await user(A,'access-state')).requests.find(x=>x.id===r.id).status,'expired');
   const next=await pending();child=await grant(next.r);c=await claim(child);await context(c);const draft=await complete(c);await as(A,"update public.review_logs set review_data=jsonb_set(review_data,'{visibility}','\"private\"') where id=$1",[next.p.id]);await denied(()=>publish(draft),'40001');
  });
  await t.test('ledger changes after context prevent stale analysis from being published',async()=>{
   const {r}=await pending(),child=await grant(r),c=await claim(child);await context(c);
   await rows("update public.stock_trades set shares=3 where user_id=$1 and symbol='NVDA'",[A]);
   assert.equal((await complete(c)).status,'cancelled');await rows("update public.stock_trades set shares=2 where user_id=$1 and symbol='NVDA'",[A]);
  });
  await t.test('private chat grant stays private, consumes once and idempotent completion does not cancel it',async()=>{
   const j=await user(B,'create',{id:id(),kind:'chat',prompt:'请查看我的账户表现'}),c=await claim(j),r=await request(c);assert.equal(r.outputVisibility,'private');
   const child=await grant(r),cc=await claim(child);assert.equal(child.autoPublish,false);assert.equal(child.sessionId,j.sessionId);const ctx=await context(cc);assert.equal(ctx.accountAccess.data.trades.rows[0].symbol,'SECRET_OTHER_TRADE');
   const draft=await complete(cc);assert.equal(draft.status,'draft');assert.equal((await complete(cc)).status,'draft');assert.equal((await claim(child)).leaseToken,null);
   await denied(()=>publish({...draft,ownerId:B}));
   await user(B,'access-revoke',{id:r.id});assert.equal((await rows('select text from public.quote_assistant_jobs where id=$1',[child.id]))[0].text,'');
  });
  await t.test('source identity cannot be forged, and cancelled original jobs revoke all derived output',async()=>{
   const p=await post(B),j=await user(A,'create',{id:id(),kind:'reply',postId:p.postId,prompt:'analyze',autoPublish:false}),c=await claim(j);
   await denied(()=>request(c));
   const own=await pending(),child=await grant(own.r),cc=await claim(child);await context(cc);const done=await publish(await complete(cc));
   const parent=(await rows('select revision from public.quote_assistant_jobs where id=$1',[own.j.id]))[0];await user(A,'cancel',{id:own.j.id,revision:parent.revision});
   assert.equal((await user(A,'access-state')).requests.find(x=>x.id===own.r.id).status,'revoked');assert.ok((await rows('select deleted_at from public.review_community_evaluations where id=$1',[done.postRef.commentId]))[0].deleted_at);
  });
  await t.test('stale lease cannot create consent and grants preserve a single child on bounded transient retry',async()=>{
   const {c,r}=await pending();await denied(()=>service('request-access',{id:c.job.id,leaseToken:id(),scopes,reason:'forged'}),'40001');
   const child=await grant(r),cc=await claim(child);await context(cc);await service('fail',{id:child.id,leaseToken:cc.leaseToken,errorCode:'ASSISTANT_TIMEOUT'});
   const retry=await grant(r);assert.equal(retry.id,child.id);assert.equal(retry.status,'pending');assert.ok((await claim(retry)).leaseToken);
   await user(A,'access-revoke',{id:r.id});assert.equal((await grant(r).catch(e=>({error:e.code}))).error,'40001');
  });
  await t.test('invalid service scopes and date ranges never create consent, and source edits close pending requests',async()=>{
   const j=await user(B,'create',{id:id(),kind:'chat',prompt:'核对授权边界'}),c=await claim(j);
   for(const extra of [{scopes:[]},{scopes:['report','report']},{rangeStart:'2025-01-01',rangeEnd:'2026-11-06'},{rangeStart:'2026-02-30',rangeEnd:'2026-11-06'}]){
    await denied(()=>service('request-access',{id:j.id,leaseToken:c.leaseToken,scopes:['report'],rangeStart:'2026-11-02',rangeEnd:'2026-11-06',reason:'需要核对',...extra}),'22023');
   }
   assert.equal((await rows('select count(*) n from public.quote_assistant_access_requests where job_id=$1',[j.id]))[0].n,0);
   const own=await pending(B);await as(B,"update public.review_logs set text='更改后的新问题' where id=$1",[own.p.id]);
   assert.equal((await user(B,'access-state')).requests.find(x=>x.id===own.r.id).status,'revoked');await denied(()=>grant(own.r),'40001');
  });
  await t.test('future or unrecognized close snapshots are not treated as verified report data',async()=>{
   await rows("update public.pnl_report_snapshots set locked_at=clock_timestamp()+interval '1 hour' where user_id=$1 and snapshot_date='2026-11-05'",[B]);
   const j=await user(B,'create',{id:id(),kind:'chat',prompt:'检查正式收盘数据'}),c=await claim(j),r=await request(c),child=await grant(r),ctx=await context(await claim(child));
   assert.equal(ctx.accountAccess.data.report.status,'missing');assert.equal(ctx.accountAccess.data.holdings.status,'missing');await user(B,'access-revoke',{id:r.id});
  });
  await t.test('proactive decision snapshots include the same sanitized attachments and invalidate on attachment edits',async()=>{
   const proactive=async(action,payload={})=>(await as(null,'select public.quote_assistant_proactive($1,$2) value',[action,payload],'service_role'))[0].value;
   await proactive('configure',{enabled:true,founderId:A,reviewAuthorIds:[B,C,D],dailyDecisionLimit:200,dailyReplyLimit:30,threadReplyLimit:3});
   const p=await post(E),e=await comment(E,p,'请分析这一份公开附件',{account});
   await rows("update public.quote_assistant_proactive_events set due_at=clock_timestamp()+interval '1 day'");
   await rows("update public.quote_assistant_proactive_events set due_at=clock_timestamp()-interval '1 second' where source_kind='community' and source_id=$1",[e.id]);
   const c=await proactive('claim');assert.equal(c.context.invocation.account.items[0].value,3.39);
   await rows("update public.review_community_evaluations set payload=jsonb_set(payload,'{account,items,0,value}','4.39') where id=$1",[e.id]);
   const decision=await proactive('decision',{id:c.event.id,leaseToken:c.leaseToken,decision:'reply',reason:'依据公开附件分析',questionKey:'attachment-analysis'});
   assert.notEqual(decision.status,'queued');assert.equal((await rows('select count(*) n from public.quote_assistant_jobs where post_id=$1',[p.postId]))[0].n,0);
   await proactive('configure',{enabled:false});
  });
 }finally{await db.close();}
});
