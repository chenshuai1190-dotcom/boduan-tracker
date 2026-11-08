// Executes only against an isolated in-process PostgreSQL fixture, never production.
// PGLITE_MODULE_FILE=/absolute/path/to/pglite/dist/index.js node --test tests/review-public-activity-migration.test.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/review_public_activity_20261108.sql', import.meta.url), 'utf8');
const repliesMigration = await readFile(new URL('../supabase/review_public_replies_20261108.sql', import.meta.url), 'utf8');
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', C='33333333-3333-4333-8333-333333333333';
const IMAGE='44444444-4444-4444-8444-444444444444.png', AVATAR='55555555-5555-4555-8555-555555555555.webp';
const moduleFile=process.env.PGLITE_MODULE_FILE;

test('public activity migration keeps source policies closed and uses bounded authenticated projections',()=>{
  assert.doesNotMatch(migration,/alter\s+table\s+(?:public\.)?(?:stock_trades|disciplines|review_logs)\s+(?:disable|force|enable)\s+row\s+level\s+security/i);
  assert.match(migration,/primary key \(post_id, user_id\)/);
  assert.match(migration,/for update;/);
  assert.match(migration,/limit v_limit\+1/);
  assert.match(migration,/revoke all on public\.review_public_posts, public\.review_public_likes from public, anon, authenticated/);
  assert.doesNotMatch(migration,/set\s+public\s*=\s*true/i);
});

test('public evaluation extension is forward-only and retains source and bucket privacy',()=>{
  assert.match(repliesMigration,/alter table public\.review_public_posts add column if not exists replies jsonb/);
  assert.doesNotMatch(repliesMigration,/alter\s+table\s+(?:public\.)?(?:stock_trades|disciplines|review_logs)/i);
  assert.doesNotMatch(repliesMigration,/update\s+public\.(?:disciplines|review_logs)\s/i);
  assert.doesNotMatch(repliesMigration,/set\s+public\s*=\s*true|grant\s+(?:all|insert|update|delete)\b/i);
  assert.match(repliesMigration,/source\.review_data->>'visibility'='public'/);
  assert.match(repliesMigration,/post\.replies is distinct from public\.review_public_project_replies/);
});

test('public posts and likes preserve private journals, exact assets and three-user isolation',{
  skip:!moduleFile&&'Set PGLITE_MODULE_FILE to a local PGlite install for isolated SQL execution.',
},async t=>{
  assert.ok(isAbsolute(moduleFile));
  const {PGlite}=await import(pathToFileURL(moduleFile).href), db=await PGlite.create();
  const rows=async(sql,params=[])=>(await db.query(sql,params)).rows;
  const denied=(fn,code='42501')=>assert.rejects(fn,error=>error.code===code);
  async function as(user,sql,params=[],role='authenticated'){
    await db.exec(`set role ${role}`);
    try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);return await rows(sql,params);}
    finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
  }
  const rawRpc=async(user,name,args=[])=>(await as(user,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args))[0].result;
  const accountBound=new Set(['fetch_review_public_feed','read_review_public_post','set_review_public_like']);
  const rpc=(user,name,args=[])=>rawRpc(user,name,[...args,...(accountBound.has(name)?[user]:[])]);
  const feed=(user=A,limit=20,cursor=null,query='',symbol='')=>rpc(user,'fetch_review_public_feed',[limit,cursor?.publishedAt||null,cursor?.id||null,query,symbol]);
  const metadata=(extra={})=>({version:1,date:'2026-11-06',stocks:['NVDA'],images:[],replies:[{text:'private evaluation',account:{netAssets:777777},images:[{path:`${A}/comment.png`}]}],...extra});
  const insert=async(user=A,type='log',data=metadata(),text='Sample activity')=>{
    const table=type==='log'?'review_logs':'disciplines';
    const dateColumn=type==='log'?',log_date':'', dateValue=type==='log'?',\'2026-11-06\'':'';
    const [record]=await as(user,`insert into public.${table}(user_id,text,review_data${dateColumn}) values($1,$2,$3${dateValue}) returning id`,[user,text,JSON.stringify(data)]);
    return {id:record.id,type,postId:`${type}:${record.id}`,table};
  };
  const update=(record,data,text='Edited activity')=>as(A,`update public.${record.table} set review_data=$2,text=$3 where id=$1`,[record.id,JSON.stringify(data),text]);
  try{
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users(id) values('${A}'),('${B}'),('${C}');
      create table public.disciplines(id bigint generated by default as identity primary key,user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',created_at timestamptz not null default now());
      create table public.review_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),text text not null,review_data jsonb not null default '{}',log_date date not null,created_at timestamptz not null default now());
      create table public.community_profiles(user_id uuid primary key references auth.users(id),nickname text,avatar_key text,avatar_path text,private_email text);
      alter table public.disciplines enable row level security; alter table public.review_logs enable row level security; alter table public.community_profiles enable row level security;
      create policy own_insights on public.disciplines for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_logs on public.review_logs for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy own_profiles on public.community_profiles for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      grant select,insert,update,delete on public.disciplines,public.review_logs,public.community_profiles to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
      insert into public.community_profiles values('${A}','Sample A','fox','${A}/${AVATAR}','private-a@example.invalid'),('${B}','Sample B','gold',null,'private-b@example.invalid');
      create schema storage; create table storage.buckets(id text primary key,public boolean not null default false);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      insert into storage.buckets values('review-journal-images',false),('community-avatars',false),('unrelated',false);
      insert into storage.objects(bucket_id,name) values('review-journal-images','${A}/${IMAGE}'),('review-journal-images','${B}/${IMAGE}'),('review-journal-images','${A}/comment.png'),('community-avatars','${A}/${AVATAR}'),('unrelated','${A}/${IMAGE}');
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy own_images on storage.objects for all to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);
    `);
    const legacy=await insert();
    await db.exec(migration);await db.exec(migration);
    let publicPost;
    await t.test('old and new posts default private, anonymous reads fail, raw private source remains owner-only',async()=>{
      assert.deepEqual((await feed()).posts,[]);
      const other=await insert(B,'insight');
      assert.deepEqual((await feed(C)).posts,[]);
      assert.equal((await as(A,'select * from public.review_logs')).length,1);
      assert.deepEqual(await as(B,'select * from public.review_logs'),[]);
      assert.deepEqual(await as(C,'select * from public.community_profiles'),[]);
      await denied(()=>as(null,'select public.fetch_review_public_feed()',[],'anon'));
      await denied(()=>rawRpc(null,'fetch_review_public_feed'));
      for(const table of ['review_public_posts','review_public_likes']){
        await denied(()=>as(A,`select * from public.${table}`));
        await denied(()=>as(A,`delete from public.${table}`));
      }
      assert.ok(other.id);assert.ok(legacy.id);
    });
    await t.test('explicit publish projects whitelisted content and own assets only',async()=>{
      const market={kind:'market_snapshot',basis:'close',asOfDate:'2026-11-05',recordDate:'2026-11-06',secret:'market-private',items:[{key:'vix',value:25,asOfDate:'2026-11-05',basis:'close',source:'CBOE',account:{cash:55}},{key:'ratio',value:1.1,vix:25,vix3m:25/1.1},{key:'fearGreed',value:20}]};
      publicPost=await insert(A,'log',metadata({visibility:'public',market,account:{netAssets:888},trades:[{price:123,shares:50}],images:[{path:`${A}/${IMAGE}`,name:'sample.png',mimeType:'image/png',size:128,private:'no'},{path:`${B}/${IMAGE}`,name:'foreign.png',mimeType:'image/png',size:128}]}));
      const page=await feed(B), post=page.posts[0];
      assert.equal(page.posts.length,1);assert.equal(page.hasMore,false);assert.equal(page.nextCursor,null);
      assert.deepEqual(Object.keys(post).sort(),['id','type','sourceId','authorId','author','text','date','stocks','images','market','publishedAt','updatedAt','likeCount','liked'].sort());
      assert.equal(post.id,publicPost.postId);assert.equal(post.author.nickname,'Sample A');assert.equal(post.author.avatarPath,`${A}/${AVATAR}`);
      assert.equal(post.images.length,1);assert.equal(post.images[0].path,`${A}/${IMAGE}`);
      assert.equal(post.market.items[1].vix3m,25/1.1);
      assert.doesNotMatch(JSON.stringify(post),/private evaluation|netAssets|shares|market-private|private_email|comment\.png|foreign\.png/);
      assert.deepEqual(await rpc(C,'read_review_public_post',[post.id]),{...post,liked:false});
      assert.equal(await rpc(C,'read_review_public_post',[`log:${legacy.id}`]),null);
      assert.deepEqual(await as(B,'select * from public.review_logs'),[]);
      assert.deepEqual((await as(C,'select bucket_id,name from storage.objects order by bucket_id')).map(row=>row.name).sort(),[`${A}/${IMAGE}`,`${A}/${AVATAR}`].sort());
      assert.equal(await rpc(B,'review_public_asset_visible',['review-journal-images',`${B}/${IMAGE}`]),false,'another owner cannot publish a foreign attachment');
      await denied(()=>as(C,"insert into storage.objects(bucket_id,name) values('review-journal-images',$1)",[`${A}/new.png`]));
    });
    await t.test('RPCs reject missing or switched account identity before returning content or writing likes',async()=>{
      const calls=[['fetch_review_public_feed',[20,null,null,'','']],['read_review_public_post',[publicPost.postId]],['set_review_public_like',[publicPost.postId,true]]];
      for(const actual of [A,B,C]){
        for(const [name,args] of calls){
          await denied(()=>rawRpc(actual,name,args));
          await denied(()=>rawRpc(actual,name,[...args,null]));
          for(const expected of [A,B,C].filter(user=>user!==actual)){
            await denied(()=>rawRpc(actual,name,[...args,expected]));
          }
        }
      }
      assert.equal((await rows('select count(*)::int as n from public.review_public_likes'))[0].n,0,'a request started as A must not write a like as B after account switch');
      const oldSignatures=['public.fetch_review_public_feed(integer,timestamptz,text,text,text)','public.read_review_public_post(text)','public.set_review_public_like(text,boolean)'];
      for(const signature of oldSignatures) assert.equal((await rows('select to_regprocedure($1) as value',[signature]))[0].value,null,'unbound overloads must not remain callable');
    });
    await t.test('likes are idempotent, author-scoped, retractable and cannot be written for private content',async()=>{
      const first=await rpc(B,'set_review_public_like',[publicPost.postId,true]);
      assert.deepEqual(first,{postId:publicPost.postId,likeCount:1,liked:true});
      assert.deepEqual(await rpc(B,'set_review_public_like',[publicPost.postId,true]),first);
      assert.equal((await rpc(C,'set_review_public_like',[publicPost.postId,true])).likeCount,2);
      assert.equal((await rpc(A,'read_review_public_post',[publicPost.postId])).liked,false);
      assert.equal((await rpc(B,'read_review_public_post',[publicPost.postId])).liked,true);
      assert.equal((await rpc(B,'set_review_public_like',[publicPost.postId,false])).likeCount,1);
      assert.equal((await rpc(B,'set_review_public_like',[publicPost.postId,false])).likeCount,1);
      assert.equal((await rpc(C,'read_review_public_post',[publicPost.postId])).liked,true);
      await denied(()=>as(A,'insert into public.review_public_likes(post_id,user_id) values($1,$2)',[publicPost.postId,B]));
      await denied(()=>rpc(B,'set_review_public_like',[`log:${legacy.id}`,true]),'P0002');
      await denied(()=>rpc(B,'set_review_public_like',[publicPost.postId,null]),'22023');
      assert.equal((await rows('select count(*)::int as n from public.review_public_likes'))[0].n,1);
    });
    await t.test('private evaluations never republish; edits retain publication date; retract removes detail, assets and likes atomically',async()=>{
      const before=await rpc(B,'read_review_public_post',[publicPost.postId]);
      await update(publicPost,metadata({visibility:'public',images:before.images}));
      const edited=await rpc(B,'read_review_public_post',[publicPost.postId]);
      assert.equal(edited.publishedAt,before.publishedAt);assert.equal(edited.text,'Edited activity');
      await update(publicPost,metadata({visibility:'public',images:before.images,replies:[{text:'A later private self-review',score:3}]}));
      assert.equal((await rpc(B,'read_review_public_post',[publicPost.postId])).updatedAt,edited.updatedAt,'private evaluations must not leak activity timestamps');
      await update(publicPost,metadata({visibility:'private'}));
      assert.equal(await rpc(B,'read_review_public_post',[publicPost.postId]),null);
      assert.deepEqual((await feed(B)).posts,[]);
      assert.deepEqual(await as(C,'select bucket_id,name from storage.objects'),[]);
      assert.equal((await rows('select count(*)::int as n from public.review_public_likes'))[0].n,0);
      await denied(()=>rpc(B,'set_review_public_like',[publicPost.postId,true]),'P0002');
      await update(publicPost,metadata({visibility:'public'}));
      const republished=await rpc(B,'read_review_public_post',[publicPost.postId]);
      assert.ok(Date.parse(republished.publishedAt)>=Date.parse(before.publishedAt));assert.equal(republished.likeCount,0);
      await update(publicPost,metadata({visibility:'public',timelineEvent:{id:'private-timeline'}}));
      assert.equal(await rpc(B,'read_review_public_post',[publicPost.postId]),null);
      const timeline=await insert(A,'log',metadata({visibility:'public',timelineEvent:{id:'another-private-timeline'}}));
      assert.equal(await rpc(B,'read_review_public_post',[timeline.postId]),null);
    });
    await t.test('keyset paging and filters are bounded and source deletion removes the public projection',async()=>{
      const one=await insert(A,'insight',metadata({visibility:'public'}),'First NVDA example');
      const two=await insert(B,'log',metadata({visibility:'public',stocks:['MSFT']}),'Second example');
      const page=await feed(C,1);assert.equal(page.posts.length,1);assert.equal(page.hasMore,true);
      const next=await feed(C,1,page.nextCursor);assert.equal(next.posts.length,1);assert.equal(next.hasMore,false);assert.notEqual(page.posts[0].id,next.posts[0].id);
      assert.deepEqual((await feed(C,20,null,'First')).posts.map(p=>p.id),[one.postId]);
      assert.deepEqual((await feed(C,20,null,'','msft')).posts.map(p=>p.id),[two.postId]);
      await denied(()=>rpc(C,'fetch_review_public_feed',[20,null,'orphan','','']),'22023');
      await as(A,`delete from public.${one.table} where id=$1`,[one.id]);
      assert.equal(await rpc(C,'read_review_public_post',[one.postId]),null);
      assert.equal((await feed(C)).posts.length,1);
      assert.deepEqual((await rows('select public from storage.buckets')).map(r=>r.public),[false,false,false]);
    });

    const REPLY_IMAGE='66666666-6666-4666-8666-666666666666.png', PRIVATE_IMAGE='77777777-7777-4777-8777-777777777777.webp';
    const richReply=(extra={})=>({
      id:'evaluation-1',date:'2026-11-07',createdAt:'2026-11-07T04:05:06.123456Z',text:'Explicitly shared evaluation',score:8,tags:['按计划执行','自定义标签'],mood:'冷静',stocks:['NVDA','MSFT'],
      images:[{path:`${A}/${REPLY_IMAGE}`,name:'evaluation.png',mimeType:'image/png',size:128,hidden:'image-internal-metadata'},
        {path:`${B}/${REPLY_IMAGE}`,name:'foreign.png',mimeType:'image/png',size:128}],
      market:{version:1,kind:'market_snapshot',basis:'close',asOfDate:'2026-11-06',recordDate:'2026-11-07',secret:'market-internal-metadata',items:[{key:'vix',value:25,asOfDate:'2026-11-06',basis:'close',source:'CBOE',secret:'market-item-internal'}]},
      account:{version:1,kind:'account_snapshot',basis:'close',source:'pnl_report',asOfDate:'2026-11-06',recordDate:'2026-10-06',sourceSnapshotId:'private-snapshot-id',sourceVersion:'pnl_snapshot_v2',capturedAt:'2026-11-07T04:00:00Z',cash:999999,items:[
        {key:'cumulativeReturnPct',value:3.4,asOfDate:'2026-11-06',basis:'close',source:'pnl_report',secret:'account-item-internal'},
        {key:'yearPeakReturnPct',value:36.9,asOfDate:'2026-11-06',basis:'close',source:'pnl_report',peakDate:'2026-10-06'},
        {key:'declineFromYearPeakPp',value:33.5,asOfDate:'2026-11-06',basis:'close',source:'pnl_report',peakDate:'2026-10-06'},
        {key:'dailyReturnPct',value:2.72,asOfDate:'2026-11-06',basis:'close',source:'pnl_report'},
        {key:'leverage',value:1.4,asOfDate:'2026-11-06',basis:'close',source:'pnl_report'}]},
      trades:[{id:17,symbol:'NVDA',date:'2026-10-06',side:'sell',price:240.2,shares:1000,broker:'trade-internal-metadata',accountId:'hidden-account-id'}],
      secret:'reply-internal-metadata',...extra,
    });
    let sharedEvaluationPost,privateEvaluationPost,backfilled;
    await t.test('forward migration backfills only already public evaluations and preserves private source rows, publication dates and likes',async()=>{
      await db.query("insert into storage.objects(bucket_id,name) values('review-journal-images',$1),('review-journal-images',$2),('review-journal-images',$3)",[`${A}/${REPLY_IMAGE}`,`${B}/${REPLY_IMAGE}`,`${A}/${PRIVATE_IMAGE}`]);
      sharedEvaluationPost=await insert(A,'log',metadata({visibility:'public',replies:[richReply()]}),'Shared parent');
      privateEvaluationPost=await insert(A,'insight',metadata({visibility:'private',replies:[richReply({id:'private-evaluation',text:'Private parent evaluation',images:[{path:`${A}/${PRIVATE_IMAGE}`,name:'private.webp',mimeType:'image/webp',size:128}]})]}),'Private parent');
      const before=await rpc(B,'read_review_public_post',[sharedEvaluationPost.postId]);
      assert.equal(before.replies,undefined,'deployed baseline did not expose evaluations');
      await rpc(C,'set_review_public_like',[sharedEvaluationPost.postId,true]);
      const sourceBefore=await rows('select id,text,review_data,created_at from public.review_logs order by id');
      await db.exec(repliesMigration);
      backfilled=await rpc(B,'read_review_public_post',[sharedEvaluationPost.postId]);
      assert.equal(backfilled.replies.length,1);assert.equal(backfilled.replies[0].text,'Explicitly shared evaluation');
      assert.equal(backfilled.publishedAt,before.publishedAt);assert.equal(backfilled.likeCount,1);
      assert.deepEqual(await rows('select id,text,review_data,created_at from public.review_logs order by id'),sourceBefore,'forward migration must not rewrite source journals');
      assert.equal(await rpc(B,'read_review_public_post',[privateEvaluationPost.postId]),null);
      assert.equal(await rpc(B,'read_review_public_post',[`log:${legacy.id}`]),null);
      await db.exec(repliesMigration);
      assert.deepEqual(await rpc(B,'read_review_public_post',[sharedEvaluationPost.postId]),backfilled,'reapplying must not republish or advance an unchanged timestamp');
    });
    await t.test('public evaluations share complete display snapshots while stripping unknown fields and foreign image paths',async()=>{
      const post=await rpc(C,'read_review_public_post',[sharedEvaluationPost.postId]),reply=post.replies[0];
      assert.deepEqual(Object.keys(reply).sort(),['id','date','createdAt','text','mood','score','tags','images','stocks','market','account','trades'].sort());
      assert.equal(reply.score,8);assert.deepEqual(reply.tags,['按计划执行','自定义标签']);assert.equal(reply.mood,'冷静');
      assert.equal(reply.account.items.length,5);assert.equal(reply.account.items[4].value,1.4);
      assert.equal(reply.account.recordDate,'2026-10-06','hindsight dates remain available');
      assert.equal(reply.account.items[1].peakDate,'2026-10-06');
      assert.deepEqual(reply.trades,[{id:'17',symbol:'NVDA',date:'2026-10-06',side:'sell',price:240.2,shares:1000}]);
      assert.deepEqual(reply.images,[{path:`${A}/${REPLY_IMAGE}`,name:'evaluation.png',mimeType:'image/png',size:128}]);
      assert.doesNotMatch(JSON.stringify(post),/internal-metadata|market-item-internal|account-item-internal|private-snapshot-id|hidden-account-id|sourceSnapshotId|sourceVersion|capturedAt|999999|foreign\.png/);
      assert.deepEqual((await as(C,"select name from storage.objects where bucket_id='review-journal-images' order by name")).map(r=>r.name),[`${A}/${REPLY_IMAGE}`]);
      assert.equal(await rpc(C,'review_public_asset_visible',['review-journal-images',`${B}/${REPLY_IMAGE}`]),false);
      assert.equal(await rpc(C,'review_public_asset_visible',['review-journal-images',`${A}/${PRIVATE_IMAGE}`]),false);
      const listPost=(await feed(C)).posts.find(item=>item.id===post.id);assert.deepEqual(listPost.replies,post.replies);
      await denied(()=>as(null,'select public.read_review_public_post($1,$2)',[post.id,B],'anon'));
      await denied(()=>rpc(C,'review_public_project_replies',[JSON.stringify([richReply()]),A]));
      await denied(()=>as(C,'update public.review_public_posts set replies=\'[]\'::jsonb where id=$1',[post.id]));
      assert.deepEqual(await as(B,'update public.review_logs set review_data=\'{}\'::jsonb where id=$1 returning id',[sharedEvaluationPost.id]),[]);
      assert.deepEqual((await rpc(C,'read_review_public_post',[post.id])).replies,post.replies,'another viewer cannot modify author evaluations');
    });
    await t.test('evaluation edits and removals update public detail without changing published_at and revoke removed image reads',async()=>{
      const original=await rpc(B,'read_review_public_post',[sharedEvaluationPost.postId]);
      await update(sharedEvaluationPost,metadata({visibility:'public',replies:[richReply({text:'Edited public evaluation',score:4,images:[]})]}),'Shared parent');
      const edited=await rpc(B,'read_review_public_post',[sharedEvaluationPost.postId]);
      assert.equal(edited.replies[0].text,'Edited public evaluation');assert.equal(edited.replies[0].score,4);
      assert.equal(edited.publishedAt,original.publishedAt);assert.notEqual(edited.updatedAt,original.updatedAt);
      assert.equal(await rpc(C,'review_public_asset_visible',['review-journal-images',`${A}/${REPLY_IMAGE}`]),false);
      await update(sharedEvaluationPost,metadata({visibility:'public',replies:[]}),'Shared parent');
      const removed=await rpc(B,'read_review_public_post',[sharedEvaluationPost.postId]);
      assert.deepEqual(removed.replies,[]);assert.notEqual(removed.updatedAt,edited.updatedAt);
      assert.equal(removed.likeCount,1,'editing author evaluations does not reset post likes');
    });
    await t.test('malformed historical evaluation fields degrade safely and cannot poison public reads or publish nested raw metadata',async()=>{
      const malformed=richReply({id:'legacy-safe',text:'Keep valid evaluation text',createdAt:'2026-11-07T99:00:00Z',score:99,tags:['','valid','valid'],stocks:['bad/path','msft'],images:[{path:`${B}/${REPLY_IMAGE}`,name:'foreign.png',mimeType:'image/png',size:128}],account:{kind:'account_snapshot',raw:'hidden-account-blob'},market:{raw:'hidden-market-blob'},trades:[{id:'bad',symbol:'NVDA',date:'2026-11-31',side:'buy',price:1,shares:1,raw:'hidden-trade-blob'}]});
      await update(sharedEvaluationPost,metadata({visibility:'public',replies:[null,{id:'bad-date',date:'2026-02-30',text:'invalid date'},malformed,{...malformed,text:'Duplicate id must not replace first'}]}),'Shared parent');
      const post=await rpc(C,'read_review_public_post',[sharedEvaluationPost.postId]),reply=post.replies[0];
      assert.equal(post.replies.length,1);assert.equal(reply.text,'Keep valid evaluation text');assert.equal(reply.createdAt,undefined);
      assert.equal(reply.score,null);assert.deepEqual(reply.tags,['valid']);assert.deepEqual(reply.stocks,['MSFT']);assert.deepEqual(reply.images,[]);
      assert.equal(reply.account,null);assert.equal(reply.market,null);assert.deepEqual(reply.trades,[]);
      assert.doesNotMatch(JSON.stringify(post),/hidden-account-blob|hidden-market-blob|hidden-trade-blob|Duplicate id/);
      const contradictory=richReply();contradictory.account.items[2].value=10;
      await update(sharedEvaluationPost,metadata({visibility:'public',replies:[contradictory]}),'Shared parent');
      const cleanAccount=(await rpc(C,'read_review_public_post',[sharedEvaluationPost.postId])).replies[0].account;
      assert.deepEqual(cleanAccount.items.map(item=>item.key),['cumulativeReturnPct','dailyReturnPct','leverage']);
    });
    await t.test('parent withdrawal and deletion revoke evaluations and their assets while timeline evaluations remain private',async()=>{
      await update(sharedEvaluationPost,metadata({visibility:'private',replies:[richReply()]}),'Shared parent');
      assert.equal(await rpc(B,'read_review_public_post',[sharedEvaluationPost.postId]),null);
      assert.equal((await feed(C)).posts.some(post=>post.id===sharedEvaluationPost.postId),false);
      assert.equal(await rpc(C,'review_public_asset_visible',['review-journal-images',`${A}/${REPLY_IMAGE}`]),false);
      assert.equal((await rows('select count(*)::int as n from public.review_public_likes where post_id=$1',[sharedEvaluationPost.postId]))[0].n,0);
      const timeline=await insert(A,'log',metadata({visibility:'public',timelineEvent:{id:'timeline-still-private'},replies:[richReply()]}));
      assert.equal(await rpc(C,'read_review_public_post',[timeline.postId]),null);
      assert.equal(await rpc(C,'review_public_asset_visible',['review-journal-images',`${A}/${REPLY_IMAGE}`]),false);
      await update(sharedEvaluationPost,metadata({visibility:'public',replies:[richReply()]}),'Shared parent');
      assert.equal((await rpc(C,'read_review_public_post',[sharedEvaluationPost.postId])).replies.length,1);
      await as(A,'delete from public.review_logs where id=$1',[sharedEvaluationPost.id]);
      assert.equal(await rpc(C,'read_review_public_post',[sharedEvaluationPost.postId]),null);
      assert.equal(await rpc(C,'review_public_asset_visible',['review-journal-images',`${A}/${REPLY_IMAGE}`]),false);
      assert.deepEqual((await rows('select public from storage.buckets')).map(r=>r.public),[false,false,false]);
    });
  }finally{await db.close();}
});
