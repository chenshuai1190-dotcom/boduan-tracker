import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const moduleFile = process.env.PGLITE_MODULE_FILE;
const read = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const [base, flags, foundation, sql, preflight, postflight] = await Promise.all([
  read('review_display_preferences_20261107.sql'), read('review_display_preferences_return_drawdown_20261107.sql'),
  read('quote_assistant_foundation_20261108.sql'), read('review_stock_daily_record_20261109.sql'),
  read('verification/review_stock_daily_record_preflight.sql'), read('verification/review_stock_daily_record_postflight.sql'),
]);
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';

test('stock record migration does not expand privileges or rewrite financial and review rows', () => {
  const statements=sql.replace(/--.*$/gm,'');
  assert.match(sql,/add column if not exists show_stock_daily_record boolean default null/);
  assert.doesNotMatch(statements,/\b(?:insert into|update|delete from)\s+public\./i);
  assert.doesNotMatch(statements,/\b(?:grant|revoke|create policy|drop policy|drop constraint|alter column)\b/i);
  assert.match(sql,/execute replace\(v_definition,v_before,v_after\)/);
  assert.match(sql,/fingerprint security contract differs/);
  assert.match(postflight,/Permissions, policies, constraints or function security changed unexpectedly/);
  assert.match(postflight,/fingerprint changed beyond the supported metric list/);
});

test('stock record migration preserves old clients, row isolation, private helper and replay idempotency in PostgreSQL', {
  skip: !moduleFile && 'Set PGLITE_MODULE_FILE for isolated PostgreSQL execution; no server is contacted.',
}, async () => {
  const { PGlite }=await import(pathToFileURL(moduleFile).href), db=await PGlite.create();
  const rows=async(query,args=[])=>(await db.query(query,args)).rows;
  async function as(owner, query, args=[], role='authenticated') {
    await db.exec(`set role ${role}`);
    try { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner||'']);return await rows(query,args); }
    finally { await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)"); }
  }
  const fingerprint=async(id,scope='milestone',owner=A)=>(await rows('select public.quote_assistant_fingerprint($1,$2,$3) value',[id,scope,owner]))[0].value;
  const reference=(metric='stock_daily_return')=>({version:1,id:'record:stock_daily_return:NVDA:2026',kind:'record',metric,date:'2026-11-06',title:'NVDA · 年内最大单日跌幅'});
  async function audits() {
    await db.exec(preflight);await db.exec(sql);await db.exec(sql);
    const result=await db.exec(postflight), report=result.flatMap(item=>item.rows||[]).find(item=>item.review_stock_daily_record_postflight)?.review_stock_daily_record_postflight;
    assert.equal(report?.schemaAndPermissionsOk,true);
    assert.equal(report?.businessUnchanged,true);
    assert.deepEqual(report?.changes,[]);
  }
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create table public.review_logs(id bigint primary key,user_id uuid,review_data jsonb);
      create table public.review_public_posts(id text primary key,author_id uuid,text text,record_date date,stocks jsonb,images jsonb,market jsonb,published_at timestamptz);
      create table public.stock_trades(id bigint primary key,user_id uuid,symbol text,shares numeric);
      create table public.pnl_report_snapshots(id bigint primary key,user_id uuid,snapshot_date date,net_assets_usd numeric);
      create table public.pnl_report_symbol_snapshots(id bigint primary key,user_id uuid,snapshot_date date,symbol text,held_shares numeric);
      create function public.review_public_valid_date(value text) returns boolean language sql immutable as $$select value~'^\\d{4}-\\d{2}-\\d{2}$'$$;`);
    await db.query('insert into auth.users values($1),($2)',[A,B]);
    await db.exec(base);await db.exec(flags);
    const helper=foundation.match(/create or replace function public\.quote_assistant_fingerprint\([\s\S]+?revoke all on function public\.quote_assistant_fingerprint\(text,text,uuid\) from public,anon,authenticated;/)?.[0];
    assert.ok(helper);await db.exec(helper);
    await as(A,"insert into public.review_display_preferences(user_id,event_types,revision) values($1,array['daily_record'],7)",[A]);
    await as(B,"insert into public.review_display_preferences(user_id,event_types,revision) values($1,array['drawdown'],3)",[B]);
    await db.query('insert into public.review_logs values(1,$1,$2)',[A,{timelineEvent:reference()}]);
    await db.query("insert into public.stock_trades values(1,$1,'NVDA',10)",[A]);
    await db.query("insert into public.pnl_report_snapshots values(1,$1,'2026-11-06',1200)",[A]);
    await db.query("insert into public.pnl_report_symbol_snapshots values(1,$1,'2026-11-06','NVDA',10)",[A]);
    await db.query("insert into public.review_public_posts values('log:public',$1,'public post','2026-11-06','[]','[]','null','2026-11-06T20:00:00Z')",[A]);
    assert.equal(await fingerprint('log:1'),null);
    const publicBefore=await fingerprint('log:public','public');assert.ok(publicBefore);
    await audits();
    assert.match(await fingerprint('log:1'),/^[a-f0-9]{32}$/);
    assert.equal(await fingerprint('log:1','milestone',B),null);
    assert.equal(await fingerprint('log:1','unsupported',A),null);
    assert.equal(await fingerprint('log:public','public'),publicBefore);
    await assert.rejects(as(A,"select public.quote_assistant_fingerprint('log:1','milestone',$1)",[A]),{code:'42501'});
    await assert.rejects(as(null,'select * from public.review_display_preferences',[],'anon'),{code:'42501'});
    const own=await as(A,'select user_id,event_types,show_stock_daily_record,revision from public.review_display_preferences');
    assert.equal(own.length,1);assert.equal(own[0].user_id,A);assert.equal(own[0].revision,7);assert.equal(own[0].show_stock_daily_record,null);
    await as(A,'update public.review_display_preferences set show_stock_daily_record=false,revision=8 where user_id=$1',[A]);
    const forbidden=await as(B,'update public.review_display_preferences set show_stock_daily_record=true where user_id=$1 returning user_id',[A]);
    assert.deepEqual(forbidden,[]);
    // An older client omits the new column and keeps both its payload and CAS.
    await as(A,"update public.review_display_preferences set currency='CNY',event_types=array['daily_record'],revision=9 where user_id=$1 and revision=8",[A]);
    assert.equal((await as(A,'select show_stock_daily_record from public.review_display_preferences'))[0].show_stock_daily_record,false);
    await audits();
    assert.equal((await as(A,'select show_stock_daily_record from public.review_display_preferences'))[0].show_stock_daily_record,false);
    for(const metric of ['net_assets','cumulative_return','cumulative_pnl','annual_return','annual_pnl','daily_return','period_return']) {
      await db.query('update public.review_logs set review_data=$1 where id=1',[{timelineEvent:reference(metric)}]);
      assert.ok(await fingerprint('log:1'),`legacy metric ${metric}`);
    }
    await db.query('update public.review_logs set review_data=$1 where id=1',[{timelineEvent:reference('unknown')}]);
    assert.equal(await fingerprint('log:1'),null);
  } finally { await db.close(); }
});
