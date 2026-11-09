import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const moduleFile=process.env.PGLITE_MODULE_FILE;
const read=name=>readFile(new URL(`../supabase/${name}`,import.meta.url),'utf8');
const [stock,cash,movement,reversal,foundation,contract]=await Promise.all(['stock_trades.sql','available_cash_foundation_20260805.sql','available_cash_movements_foundation_20260904.sql','available_cash_movement_reversal_foundation_20260904.sql','stock_trade_cash_foundation_20261109.sql','stock_trade_cash_contract_after_runtime_20261109.sql'].map(read));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';

test('trade cash cutover keeps direct writes closed and private helpers unexecutable',()=>{
 assert.match(foundation,/hashtextextended\('available_cash:'\|\|owner_id::text,0\)/);
 assert.doesNotMatch(foundation,/grant execute on function public.stock_trade_cash\(text,jsonb,uuid\) to authenticated/);
 assert.match(contract,/revoke insert,update,delete on public.stock_trades from authenticated/);
 assert.match(foundation,/2026-10-31 16:00:00\+00/);
 assert.match(foundation,/actor_kind text not null default case when session_user/);
});

test('PostgreSQL atomic settlement, repair, historical snapshots, isolation and replay', {skip:!moduleFile&&'Set PGLITE_MODULE_FILE to run local PostgreSQL'},async()=>{
 const {PGlite}=await import(pathToFileURL(moduleFile).href);const db=await PGlite.create();
 const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const one=async(sql,args=[])=>(await rows(sql,args))[0];
 async function as(owner,sql,args=[],role='authenticated'){
  await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner||'']);return await rows(sql,args);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
 }
 const rpc=async(owner,action,payload={},expected=owner)=>(await as(owner,'select public.stock_trade_cash($1,$2,$3) value',[action,payload,expected]))[0].value;
 let dates;
 const buy=(overrides={})=>({symbol:'MSFT',name:'Microsoft',side:'buy',date:dates.today,price:540.58,shares:295,fee:0,currency:'USD',note:'',recordKind:'trade',...overrides});
 const create=(owner,trade)=>rpc(owner,'create',{operationKey:randomUUID(),trade});
 async function fund(owner,amount=2000000){
  await db.query('insert into public.available_cash_status(user_id,available_cash_usd) values($1,$2)',[owner,amount]);
  // Fixed past opening is test setup, not part of the production migration.
  await db.query("update public.available_cash_events set effective_at=((current_date-3)+time '08:00') at time zone 'America/New_York' where user_id=$1",[owner]);
 }
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
   create schema auth;create table auth.users(id uuid primary key,created_at timestamptz not null);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
   create table public.margin_status(user_id uuid primary key,current_margin numeric);
   create table public.pnl_report_snapshots(id bigint generated always as identity primary key,user_id uuid,snapshot_date date,cash_usd numeric,market_value_usd numeric,total_assets_usd numeric);
   create table public.pnl_report_rebuild_state(user_id uuid primary key,dirty_from_date date,ledger_revision bigint,generation bigint,reason text,source_trade_id uuid,updated_at timestamptz);
   grant usage on schema public to anon,authenticated,service_role;`);
  await db.query("insert into auth.users values($1,'2026-11-08'),($2,'2026-10-01'),($3,'2026-11-08')",[A,B,C]);
  await db.exec(stock);await db.exec('grant select,insert,update,delete on public.stock_trades to authenticated');await db.exec(cash);await db.exec(movement);await db.exec(reversal);
  await db.exec(foundation);await db.exec(foundation);
  assert.equal((await as(A,'select public.stock_trade_cash_contract_ready() ready'))[0].ready,false);
  await assert.rejects(rpc(A,'state'),{code:'42501'});
  await fund(A);await fund(B);await fund(C);
  dates=await one("select to_char((clock_timestamp() at time zone 'America/New_York')::date,'YYYY-MM-DD') today,to_char(current_date-1,'YYYY-MM-DD') yesterday,to_char(current_date-2,'YYYY-MM-DD') earlier");
  await db.exec(contract);await db.exec(contract);
  assert.equal((await as(A,'select public.stock_trade_cash_contract_ready() ready'))[0].ready,true);
  await assert.rejects(as(A,"insert into public.stock_trades(user_id,symbol,side,trade_date,price,shares) values($1,'MSFT','buy',current_date,1,1)",[A]),{code:'42501'});
  for(const helper of ['stock_trade_cash_state(uuid)','stock_trade_cash_preview(uuid,text,bigint)','stock_trade_cash_projection(uuid,bigint,boolean)','stock_trade_cash_apply(uuid,date)','stock_trade_cash_dirty(uuid,date,boolean)']){
   assert.equal((await one('select has_function_privilege($1,$2,$3) ok',['authenticated',helper,'EXECUTE'])).ok,false);
  }
  await assert.rejects(rpc(A,'state',{},C),{code:'42501'});
  for(const table of ['stock_trade_cash_accounts','stock_trade_cash_entries','stock_trade_cash_operations','stock_trade_cash_release']) await assert.rejects(as(A,`select * from public.${table}`),{code:'42501'});
  const payload={operationKey:randomUUID(),trade:buy()};let result=await rpc(A,'create',payload);
  assert.equal(result.settlement.mode,'auto');assert.equal(result.cashStatus.availableCashUsd,1840528.9);
  assert.equal(result.trade.record_kind,'trade');assert.equal((await one('select count(*)::int n from public.available_cash_movements where user_id=$1',[A])).n,0);
  const id=result.tradeId;let version=result.trade.updated_at;
  const retry=await rpc(A,'create',payload);assert.equal(retry.tradeId,id);assert.equal(retry.cashStatus.availableCashUsd,1840528.9);
  await assert.rejects(rpc(A,'create',{...payload,trade:buy({shares:1})}),{code:'22023'});
  await assert.rejects(create(A,buy({shares:1000000})),/stock_cash_insufficient_at_date/);
  assert.equal((await one('select count(*)::int n from public.stock_trades where user_id=$1',[A])).n,1);
  await assert.rejects(rpc(C,'delete',{operationKey:randomUUID(),tradeId:id,expectedUpdatedAt:version}),{code:'42501'});
  await assert.rejects(rpc(A,'update',{operationKey:randomUUID(),tradeId:id,expectedUpdatedAt:'2020-01-01Z',trade:buy({shares:1})}),{code:'40001'});
  result=await rpc(A,'update',{operationKey:randomUUID(),tradeId:id,expectedUpdatedAt:version,trade:buy({date:dates.yesterday,price:500,shares:100,fee:2})});
  assert.equal(result.cashStatus.availableCashUsd,1949998);version=result.trade.updated_at;
  let resolved=await one('select * from public.resolve_available_cash_snapshot_targets($1)',[[{user_id:A,snapshot_date:dates.yesterday}]]);
  assert.equal(Number(resolved.cash_usd),1949998);assert.ok(resolved.cash_event_id);
  await db.query('insert into public.pnl_report_snapshots(user_id,snapshot_date,cash_usd,market_value_usd,total_assets_usd) values($1,$2,$3,50000,$4)',[A,dates.yesterday,1949998,1999998]);
  const snap=await one('select * from public.pnl_report_snapshots where user_id=$1',[A]);assert.equal(Number(snap.cash_settlement_trade_delta_usd),-50002);assert.ok(snap.cash_settlement_baseline_event_id);
  const sale=await create(A,buy({side:'sell',date:dates.today,price:600,shares:10,fee:1}));assert.equal(sale.cashStatus.availableCashUsd,1955997);
  await assert.rejects(rpc(A,'delete',{operationKey:randomUUID(),tradeId:id,expectedUpdatedAt:version}),/stock_cash_oversell/);
  await rpc(A,'delete',{operationKey:randomUUID(),tradeId:sale.tradeId,expectedUpdatedAt:sale.trade.updated_at});
  result=await rpc(A,'delete',{operationKey:randomUUID(),tradeId:id,expectedUpdatedAt:version});assert.equal(result.cashStatus.availableCashUsd,2000000);
  resolved=await one('select * from public.resolve_available_cash_snapshot_targets($1)',[[{user_id:A,snapshot_date:dates.yesterday}]]);assert.equal(Number(resolved.cash_usd),2000000);
  const holding=await create(A,buy({price:100,shares:20,recordKind:'historical_holding'}));assert.equal(holding.cashStatus.availableCashUsd,2000000);
  const legacy=await create(B,buy({shares:1}));assert.equal(legacy.settlement.mode,'manual');assert.equal(legacy.cashStatus.availableCashUsd,2000000);
  // Eligible existing November account: apply only an explicit reviewed opening repair.
  await db.query("insert into public.stock_trades(user_id,symbol,side,trade_date,price,shares) values($1,'MSFT','buy',$2,540.58,295)",[C,dates.today]);
  const before=await rpc(C,'state');assert.equal(before.settlement.eligibleNewAccount,true);assert.equal(before.cashStatus.availableCashUsd,2000000);
  const opening=before.openingCandidates[0].eventId;
  const preview=await rpc(C,'preview_repair',{openingEventId:opening});assert.equal(preview.plan.afterCashUsd,1840528.9);assert.equal(preview.plan.affectedTradeCount,1);
  await assert.rejects(rpc(C,'repair',{operationKey:randomUUID(),openingEventId:opening,planToken:'stale'}),{code:'40001'});
  const repairPayload={operationKey:randomUUID(),openingEventId:opening,planToken:preview.plan.token};const repaired=await rpc(C,'repair',repairPayload);assert.equal(repaired.cashStatus.availableCashUsd,1840528.9);assert.equal(repaired.settlement.mode,'auto');
  assert.equal((await rpc(C,'repair',repairPayload)).cashStatus.availableCashUsd,1840528.9);
  const operation=await one('select actor_kind from public.stock_trade_cash_operations where user_id=$1 and operation_key=$2',[C,repairPayload.operationKey]);assert.equal(operation.actor_kind,'database_admin');
  // Legacy enable uses the reconciled current balance and never debits its old entries.
  const enablePreview=await rpc(B,'preview_enable');assert.equal(enablePreview.plan.affectedTradeCount,0);
  await rpc(B,'enable',{operationKey:randomUUID(),planToken:enablePreview.plan.token});
  result=await create(B,buy({shares:1,price:10}));assert.equal(result.cashStatus.availableCashUsd,1999990);
  // Existing manual transfer/reversal RPCs share the cash lock and still work.
  await db.exec('grant execute on function public.mutate_available_cash(uuid,text,numeric,timestamptz,text,numeric,numeric,text,text) to authenticated;grant execute on function public.reverse_available_cash_movement(uuid,uuid,timestamptz) to authenticated');
  const state=await rpc(A,'state');
  const moved=(await as(A,"select * from public.mutate_available_cash($1,'transfer_in',100,$2,'USD',100,1,'','')",[randomUUID(),state.cashStatus.updatedAt]))[0];
  assert.equal(Number(moved.status_available_cash_usd),2000100);
  const reversed=(await as(A,'select * from public.reverse_available_cash_movement($1,$2,$3)',[randomUUID(),moved.movement_id,moved.status_updated_at]))[0];assert.equal(Number(reversed.status_available_cash_usd),2000000);
  assert.equal((await create(A,buy({shares:1,price:10}))).cashStatus.availableCashUsd,1999990);
  // No cash or unreconciled November history must never silently use manual mode.
  const D=randomUUID(),E=randomUUID(),F=randomUUID(),G=randomUUID(),H=randomUUID(),I=randomUUID();
  await db.query("insert into auth.users values($1,'2026-11-08'),($2,'2026-11-08'),($3,'2026-11-08'),($4,'2026-11-08'),($5,'2026-11-08'),($6,'2026-10-01')",[D,E,F,G,H,I]);
  await assert.rejects(create(D,buy({shares:1})),/stock_cash_reconciliation_required/);
  assert.equal((await one('select count(*)::int n from public.stock_trades where user_id=$1',[D])).n,0);
  const openingHolding=await create(E,buy({price:100,shares:20,recordKind:'historical_holding'}));assert.equal(openingHolding.settlement.mode,'manual');
  await fund(E);assert.equal((await create(E,buy({shares:1,price:10}))).cashStatus.availableCashUsd,1999990);
  await fund(F);await db.query("insert into public.stock_trades(user_id,symbol,side,trade_date,price,shares) values($1,'MSFT','buy',$2,10,1)",[F,dates.today]);
  await assert.rejects(create(F,buy({shares:1})),/stock_cash_reconciliation_required/);
  await assert.rejects(create(A,buy({price:'Infinity'})),/stock_cash_trade_invalid/);
  await assert.rejects(create(A,buy({fee:'NaN'})),/stock_cash_trade_invalid/);
  await fund(G);await db.query("insert into public.stock_trades(user_id,symbol,side,trade_date,price,shares) values($1,'MSFT','sell',$2,10,1)",[G,dates.today]);
  const gstate=await rpc(G,'state');await assert.rejects(rpc(G,'preview_repair',{openingEventId:gstate.openingCandidates[0].eventId}),/stock_cash_oversell/);
  await assert.rejects(rpc(G,'preview_enable'),/stock_cash_oversell/);
  // Entry time after the close must still deduct cash in the same date-only
  // closing position snapshot. The fixture modifies server time only as admin.
  await fund(H);await db.exec('alter table public.stock_trades disable trigger stock_trades_enforce_server_timestamps');
  await db.query("insert into public.stock_trades(user_id,symbol,side,trade_date,price,shares,created_at,updated_at) values($1,'MSFT','buy',$2,10,10,($2::date+time '18:00') at time zone 'America/New_York',clock_timestamp())",[H,dates.yesterday]);
  await db.exec('alter table public.stock_trades enable trigger stock_trades_enforce_server_timestamps');
  const hs=await rpc(H,'state'),hp=await rpc(H,'preview_repair',{openingEventId:hs.openingCandidates[0].eventId});
  await rpc(H,'repair',{operationKey:randomUUID(),openingEventId:hs.openingCandidates[0].eventId,planToken:hp.plan.token});
  const hclose=await one('select * from public.resolve_available_cash_snapshot_targets($1)',[[{user_id:H,snapshot_date:dates.yesterday}]]);assert.equal(Number(hclose.cash_usd),1999900);
  const hstate=await rpc(H,'state'),htrade=await one('select * from public.stock_trades where user_id=$1',[H]);
  await as(H,"select * from public.mutate_available_cash($1,'balance_adjustment',1900000,$2,'USD',1900000,1,'','')",[randomUUID(),hstate.cashStatus.updatedAt]);
  await assert.rejects(rpc(H,'update',{operationKey:randomUUID(),tradeId:htrade.id,expectedUpdatedAt:htrade.updated_at,trade:buy({date:dates.yesterday,price:10,shares:20})}),/stock_cash_manual_anchor_conflict/);
  await assert.rejects(rpc(H,'delete',{operationKey:randomUUID(),tradeId:htrade.id,expectedUpdatedAt:htrade.updated_at}),/stock_cash_manual_anchor_conflict/);
  assert.equal((await rpc(H,'state')).cashStatus.availableCashUsd,1900000);
  assert.equal(Number((await one('select shares from public.stock_trades where user_id=$1',[H])).shares),10);
  await fund(I);await db.query('insert into public.margin_status values($1,1000)',[I]);const financed=await create(I,buy({shares:1}));assert.equal(financed.settlement.mode,'manual');assert.equal(financed.cashStatus.availableCashUsd,2000000);
  const fs=await rpc(F,'state'),fp=await rpc(F,'preview_repair',{openingEventId:fs.openingCandidates[0].eventId});
  await as(F,"select * from public.mutate_available_cash($1,'transfer_in',100,$2,'USD',100,1,'','')",[randomUUID(),fs.cashStatus.updatedAt]);
  await assert.rejects(rpc(F,'repair',{operationKey:randomUUID(),openingEventId:fs.openingCandidates[0].eventId,planToken:fp.plan.token}),/stock_cash_plan_stale/);
  const fresh=await rpc(F,'preview_repair',{openingEventId:fs.openingCandidates[0].eventId});assert.equal(fresh.plan.afterCashUsd,2000090);
  await assert.rejects(as(null,"select public.stock_trade_cash('state','{}',$1)",[A],'anon'),{code:'42501'});
  // Execute the release read-only review and the strictly parameterized admin
  // template against an isolated, synthetic customer. No production is contacted.
  const J=randomUUID();await db.query("insert into auth.users values($1,'2026-11-08')",[J]);await fund(J);
  await db.query("insert into public.stock_trades(user_id,symbol,side,trade_date,price,shares) values($1,'MSFT','buy',$2,10,10)",[J,dates.today]);
  await db.exec('alter table auth.users add column email text');await db.query("update auth.users set email='target@example.test' where id=$1",[J]);
  await db.query("select set_config('quote.review_target_email','target@example.test',false)");
  const review=await read('stock_trade_cash_release_review_20261109.sql');const reports=await db.exec(review);const reviewedPlan=reports.flatMap(r=>r.rows||[]).find(r=>r.named_account_review_plan)?.named_account_review_plan;assert.equal(reviewedPlan.afterCashUsd,1999900);
  const openingJ=await one('select * from public.available_cash_events where user_id=$1',[J]),tradeJ=await one('select * from public.stock_trades where user_id=$1',[J]);
  const expected={beforeCashUsd:2000000,afterCashUsd:1999900,openingEventId:Number(openingJ.id),openingCashUsd:2000000,openingEffectiveAt:openingJ.effective_at,trade:{id:tradeJ.id,symbol:'MSFT',side:'buy',date:dates.today,price:10,shares:10,fee:0,currency:'USD'}};
  await db.query("select set_config('quote.review_expected_state',$1,false)",[JSON.stringify(expected)]);
  const applyTemplate=review.slice(review.indexOf('/*\n')+3,review.lastIndexOf('*/')).replace('REVIEWED_PLAN_TOKEN',reviewedPlan.token);
  await db.exec(applyTemplate);assert.equal((await rpc(J,'state')).cashStatus.availableCashUsd,1999900);
 }finally{await db.close();}
});
