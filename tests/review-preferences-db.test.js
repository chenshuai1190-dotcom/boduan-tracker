import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeReviewPreferences } from '../src/lib/reviewPreferences.js';
import { createReviewPreferencesRepository } from '../src/lib/reviewPreferencesDb.js';
const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const now=Date.parse('2026-11-07T00:00:00Z');
const pref=patch=>({...normalizeReviewPreferences(null),...patch});
const row=(patch={})=>({user_id:OWNER,show_timeline:true,currency:'USD',event_types:pref().eventTypes,revision:1,updated_at:new Date(now).toISOString(),...patch});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture(initial=row(),{eventTarget=null}={}){
 const calls=[],disk=new Map();let data=initial,owner=OWNER,nextRead=null,afterRequest=null,writeFailure=null;
 const storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)};
 const supabase={auth:{getUser:async()=>({data:{user:owner?{id:owner}:null}})},from(table){assert.equal(table,'review_display_preferences');let op='read',payload,filters={};return{
  select(){return this;},eq(k,v){filters[k]=v;return this;},insert(p){op='insert';payload=p;return this;},update(p){op='update';payload=p;return this;},async maybeSingle(){
   calls.push({op,payload,filters});let result;
   if(op==='read'){const snapshot=data?structuredClone(data):null,pending=nextRead;nextRead=null;result=pending?await pending.promise:{data:snapshot,error:null};}
   else if(op==='insert'){if(data)result={data:null,error:{code:'23505'}};else{data={...payload};result={data:structuredClone(data),error:null};}}
   else if(!data||data.user_id!==filters.user_id||data.revision!==filters.revision)result={data:null,error:null};
   else{data={...data,...payload};result={data:structuredClone(data),error:null};}
   if(op!=='read'&&writeFailure)result={data:null,error:writeFailure};
   afterRequest?.();return result;
  }
 };}};
 const repo=createReviewPreferencesRepository({supabase,storage,now:()=>now,eventTarget});
 return{repo,calls,disk,storage,supabase,get row(){return data;},set row(v){data=v;},set owner(v){owner=v;},set pendingRead(v){nextRead=v;},set after(v){afterRequest=v;},set writeFailure(v){writeFailure=v;}};
}

test('dedicated repository reads defaults without creating a row',async()=>{
 const f=fixture(null);const r=await f.repo.fetchReviewPreferences(OWNER);
 assert.equal(r.exists,false);assert.equal(r.revision,null);assert.deepEqual(r.preferences,pref());
 assert.deepEqual(f.calls.map(c=>c.op),['read']);assert.equal(f.repo.readCachedReviewPreferences(OTHER),null);
});

test('initial insert and existing update bind owner and use revision CAS',async()=>{
 const f=fixture(null);const created=await f.repo.saveReviewPreferences(pref({currency:'CNY'}),null,OWNER);
 assert.equal(created.revision,1);assert.equal(f.calls[0].payload.user_id,OWNER);
 const saved=await f.repo.saveReviewPreferences(pref({currency:'CNY',eventTypes:['drawdown']}),1,OWNER);
 assert.equal(saved.revision,2);assert.deepEqual(f.calls[1].filters,{user_id:OWNER,revision:1});
 assert.equal(f.calls[1].payload.user_id,undefined);assert.deepEqual(f.repo.readCachedReviewPreferences(OWNER),saved);
});

test('conflicting revisions never overwrite the other selection',async()=>{
 const f=fixture(row({revision:5,event_types:['drawdown']}));
 await assert.rejects(f.repo.saveReviewPreferences(pref(),4,OWNER),{code:'REVIEW_PREFERENCES_CONFLICT'});
 await assert.rejects(f.repo.saveReviewPreferences(pref(),null,OWNER),{code:'REVIEW_PREFERENCES_CONFLICT'});
 assert.equal(f.row.revision,5);assert.deepEqual(f.row.event_types,['drawdown']);
});

test('simultaneous first saves create exactly one row and surface the losing insert conflict',async()=>{
 const f=fixture(null);
 const outcomes=await Promise.allSettled([
  f.repo.saveReviewPreferences(pref({currency:'CNY'}),null,OWNER),
  f.repo.saveReviewPreferences(pref({showTimeline:false}),null,OWNER),
 ]);
 assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(outcomes.find(result=>result.status==='rejected').reason.code,'REVIEW_PREFERENCES_CONFLICT');
 assert.equal(f.row.revision,1);assert.equal(f.row.currency,'CNY');assert.equal(f.row.show_timeline,true);
});

test('owner mismatch rejects before requests and after requests without leaking into cache',async()=>{
 const f=fixture();f.owner=OTHER;
 await assert.rejects(f.repo.fetchReviewPreferences(OWNER),{code:'REVIEW_PREFERENCES_OWNER'});
 await assert.rejects(f.repo.saveReviewPreferences(pref(),1,OWNER),{code:'REVIEW_PREFERENCES_OWNER'});assert.equal(f.calls.length,0);
 f.owner=OWNER;f.after=()=>{f.owner=OTHER;};
 await assert.rejects(f.repo.fetchReviewPreferences(OWNER),{code:'REVIEW_PREFERENCES_OWNER'});
 assert.equal(f.repo.readCachedReviewPreferences(OWNER),null);
});

test('a save response after an account switch cannot populate or notify the new account',async()=>{
 const f=fixture();let notifications=0;f.repo.subscribeReviewPreferences(OWNER,()=>notifications++);
 f.after=()=>{f.owner=OTHER;};
 await assert.rejects(f.repo.saveReviewPreferences(pref({currency:'CNY'}),1,OWNER),{code:'REVIEW_PREFERENCES_OWNER'});
 assert.equal(f.repo.readCachedReviewPreferences(OWNER),null);assert.equal(f.repo.readCachedReviewPreferences(OTHER),null);assert.equal(notifications,0);
 assert.equal(f.row.user_id,OWNER);
});

test('cloud validation rejects malformed data rather than showing enabled defaults',async()=>{
 const f=fixture(row({event_types:['mystery']}));
 await assert.rejects(f.repo.fetchReviewPreferences(OWNER),{code:'REVIEW_PREFERENCES_INVALID'});
 assert.equal(f.repo.readCachedReviewPreferences(OWNER),null);
 await assert.rejects(f.repo.saveReviewPreferences({...pref(),currency:'JPY'},1,OWNER),{code:'REVIEW_PREFERENCES_INVALID'});
 f.row=row({revision:2147483648});await assert.rejects(f.repo.fetchReviewPreferences(OWNER),{code:'REVIEW_PREFERENCES_INVALID'});
 f.row=row({updated_at:2026});await assert.rejects(f.repo.fetchReviewPreferences(OWNER),{code:'REVIEW_PREFERENCES_INVALID'});
});

test('stale reads cannot replace a newer successful save or its cache',async()=>{
 const f=fixture();await f.repo.fetchReviewPreferences(OWNER);
 const pending=deferred();f.pendingRead=pending;const oldRead=f.repo.fetchReviewPreferences(OWNER);
 await new Promise(resolve=>setImmediate(resolve));
 const saved=await f.repo.saveReviewPreferences(pref({showTimeline:false}),1,OWNER);
 pending.resolve({data:row(),error:null});const result=await oldRead;
 assert.equal(result.preferences.showTimeline,false);assert.deepEqual(f.repo.readCachedReviewPreferences(OWNER),saved);
});

test('out-of-order cloud reads retain the highest confirmed revision',async()=>{
 const f=fixture(),pending=deferred();f.pendingRead=pending;const oldRead=f.repo.fetchReviewPreferences(OWNER);
 await new Promise(resolve=>setImmediate(resolve));f.row=row({revision:4,show_timeline:false});
 await f.repo.fetchReviewPreferences(OWNER);pending.resolve({data:row(),error:null});
 assert.equal((await oldRead).revision,4);assert.equal(f.repo.readCachedReviewPreferences(OWNER).preferences.showTimeline,false);
});

test('cross-tab events and later remounts cannot regress the cached revision',async()=>{
 const handlers=new Set(),eventTarget={addEventListener:(_type,fn)=>handlers.add(fn),removeEventListener:(_type,fn)=>handlers.delete(fn)};
 const f=fixture(row({revision:4,show_timeline:false}),{eventTarget});await f.repo.fetchReviewPreferences(OWNER);
 const key=[...f.disk.keys()][0],updates=[];
 const unsubscribe=f.repo.subscribeReviewPreferences(OWNER,value=>updates.push(value.revision));
 const envelope=(revision,showTimeline)=>JSON.stringify({version:1,ownerId:OWNER,savedAt:now,record:{preferences:pref({showTimeline}),revision,exists:true,updatedAt:new Date(now).toISOString()}});
 const dispatch=raw=>{f.disk.set(key,raw);for(const handler of handlers)handler({key,newValue:raw});};
 dispatch(envelope(2,true));assert.deepEqual(updates,[]);assert.equal(f.repo.readCachedReviewPreferences(OWNER).revision,4);
 dispatch('not-json');assert.equal(f.repo.readCachedReviewPreferences(OWNER).revision,4);
 dispatch(envelope(5,true));assert.deepEqual(updates,[5]);assert.equal(f.repo.readCachedReviewPreferences(OWNER).revision,5);
 unsubscribe();f.disk.set(key,envelope(6,false));
 assert.equal(f.repo.readCachedReviewPreferences(OWNER).revision,6);assert.equal(f.repo.readCachedReviewPreferences(OWNER).preferences.showTimeline,false);
});

test('cache is owner bound, bounded, and has an expiration',async()=>{
 const f=fixture();await f.repo.fetchReviewPreferences(OWNER);
 const next=createReviewPreferencesRepository({supabase:f.supabase,storage:f.storage,now:()=>now,eventTarget:null});
 assert.equal(next.readCachedReviewPreferences(OWNER).preferences.currency,'USD');assert.equal(next.readCachedReviewPreferences(OTHER),null);
 const expired=createReviewPreferencesRepository({supabase:f.supabase,storage:f.storage,now:()=>now+31*86400000,eventTarget:null});assert.equal(expired.readCachedReviewPreferences(OWNER),null);
 const key=[...f.disk.keys()][0];f.disk.set(key,'x'.repeat(5000));
 const bad=createReviewPreferencesRepository({supabase:f.supabase,storage:f.storage,now:()=>now,eventTarget:null});assert.equal(bad.readCachedReviewPreferences(OWNER),null);
});

test('save failures leave confirmed cache intact and successful saves notify the same owner only',async()=>{
 const f=fixture();await f.repo.fetchReviewPreferences(OWNER);let notified=0;
 f.repo.subscribeReviewPreferences(OWNER,()=>notified++);f.repo.subscribeReviewPreferences(OTHER,()=>assert.fail('wrong owner notification'));
 f.writeFailure={message:'network error'};await assert.rejects(f.repo.saveReviewPreferences(pref({currency:'CNY'}),1,OWNER));
 assert.equal(f.repo.readCachedReviewPreferences(OWNER).preferences.currency,'USD');assert.equal(notified,0);
 f.writeFailure=null;await f.repo.saveReviewPreferences(pref({currency:'CNY'}),2,OWNER);assert.equal(notified,1);
});

test('an observer failure cannot turn a committed preference save into a failure',async()=>{
 const f=fixture();let notified=0;
 f.repo.subscribeReviewPreferences(OWNER,()=>{throw new Error('unmounted observer');});
 f.repo.subscribeReviewPreferences(OWNER,()=>notified++);
 const saved=await f.repo.saveReviewPreferences(pref({currency:'CNY'}),1,OWNER);
 assert.equal(saved.preferences.currency,'CNY');assert.equal(f.repo.readCachedReviewPreferences(OWNER).preferences.currency,'CNY');assert.equal(notified,1);
});

test('migration is additive with owner read/insert/update only and no business data writes',()=>{
 const sql=readFileSync(new URL('../supabase/review_display_preferences_20261107.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/i);assert.match(sql,/grant select, insert, update/i);
 assert.equal((sql.match(/auth\.uid\(\) = user_id/g)||[]).length,4);
 assert.doesNotMatch(sql,/grant[^;]*\bdelete\b/i);assert.doesNotMatch(sql,/(insert into|update|delete from) public\.(review_logs|stock_trades|user_settings|pnl_report_snapshots)/i);
 assert.match(sql,/notify pgrst, 'reload schema'/);assert.match(sql,/anonymous_can_read/);
 assert.match(sql,/matching_columns <> 7/);assert.match(sql,/conkey = array\[owner_column\]/);assert.match(sql,/confrelid = 'auth.users'::regclass/);
 assert.match(sql,/attacl is not null/);assert.match(sql,/unexpected policies/);assert.match(sql,/coalesce\(array_ndims\(event_types\), 1\) = 1/);
});
