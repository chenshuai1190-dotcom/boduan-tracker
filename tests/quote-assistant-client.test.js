import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteAssistantRepository } from '../src/lib/quoteAssistantRepository.js';
import { createQuoteAssistantSaveBridge } from '../src/lib/quoteAssistantTriggers.js';
import { createQuoteAssistantPreview } from '../src/dev/quoteAssistantPreview.js';
import { hasQuoteMention, quoteAssistantSourceHref } from '../src/lib/quoteAssistantModel.js';

function client() {
  let userId = 'owner', listener;
  return { auth: { onAuthStateChange(fn) { listener=fn;return{data:{subscription:{unsubscribe(){}}}}; },
    async getSession() { return {data:{session:{user:{id:userId},access_token:'test-only-token'}}}; } },
    switchUser(id) { userId=id;listener?.('SIGNED_IN',{user:{id}}); },
  };
}
const response = data => ({ok:true,json:async()=>({success:true,data})});
const empty = {configured:true,memories:[],jobs:[],posts:[],milestones:[]};

test('assistant client sends authenticated POST with authoritative action and expected account',async()=>{
  const auth=client(),calls=[];
  const api=createQuoteAssistantRepository(auth,{fetchImpl:async(...args)=>{calls.push(args);return response(empty);}});
  await api.state('owner');
  assert.equal(calls[0][0],'/api/quote-assistant');assert.equal(calls[0][1].method,'POST');assert.equal(calls[0][1].cache,'no-store');
  assert.equal(calls[0][1].headers.Authorization,'Bearer test-only-token');
  await api.run({action:'configure',expectedUserId:'other',requestId:'same'},'owner');
  assert.deepEqual(JSON.parse(calls[1][1].body),{action:'run',expectedUserId:'owner',requestId:'same'});
});

test('a late response after account switch is rejected before caller can render it',async()=>{
  const auth=client();let resolve,start;
  const started=new Promise(r=>start=r);
  const api=createQuoteAssistantRepository(auth,{fetchImpl:()=>{start();return new Promise(r=>resolve=r);}});
  const request=api.state('owner');await started;auth.switchUser('other');resolve(response({...empty,memories:[{text:'private owner data'}]}));
  await assert.rejects(request,error=>error.code==='REVIEW_ACCOUNT_CHANGED');
});

test('missing configuration is returned as an error and retry preserves request id',async()=>{
  const auth=client(),calls=[];
  const api=createQuoteAssistantRepository(auth,{fetchImpl:async(_,options)=>{calls.push(JSON.parse(options.body));return{ok:false,json:async()=>({success:false,code:'ASSISTANT_NOT_CONFIGURED',error:'AI服务未配置'})};}});
  for(let i=0;i<2;i++)await assert.rejects(api.run({kind:'chat',requestId:'same'},'owner'),/AI服务未配置/);
  assert.equal(calls[0].requestId,calls[1].requestId);
});

test('save bridge triggers only confirmed new public sources, never private data or edits',async()=>{
  const requests=[];
  const db={saveReviewJournalEntry:async entry=>entry,appendReviewJournalReply:async(entry,reply)=>({...entry,replies:[reply]}),saveReviewCommunityEvaluation:async(postId,reply)=>({...reply,postId,authorId:'owner'})};
  const bridge=createQuoteAssistantSaveBridge(db,{userId:'owner',request:payload=>requests.push(payload)});
  const entry={id:'post-id',type:'log',visibility:'private',revision:0,text:'@Quote hello'};
  await bridge.saveReviewJournalEntry(entry,'owner');assert.equal(requests.length,0);
  await bridge.saveReviewJournalEntry({...entry,visibility:'public',revision:2},'owner');assert.equal(requests.length,0);
  const publicEntry={...entry,visibility:'public'};await bridge.saveReviewJournalEntry(publicEntry,'owner');
  assert.match(requests[0].requestId,/^[a-f0-9-]{36}$/i);
  assert.deepEqual({...requests[0],requestId:'request-id'},{kind:'reply',requestId:'request-id',postId:'log:post-id',autoPublish:true});
  await bridge.appendReviewJournalReply(publicEntry,{id:'reply-id',text:'@Quote 继续'},'owner');
  assert.deepEqual(requests[1].replyTo,{kind:'author',id:'reply-id'});
  await bridge.appendCommunityReply({visibility:'public',communityPostId:'log:p',communityReplyTo:{kind:'community',id:'bot-comment',isAssistant:true}},{id:'new-comment',text:'继续'},'owner');
  assert.deepEqual(requests[2].replyTo,{kind:'community',id:'new-comment'});
  await bridge.appendCommunityReply({visibility:'public',communityPostId:'log:p',communityReplyTo:{kind:'community',id:'fake',nickname:'Quote'}},{id:'no',text:'继续'},'owner');
  assert.equal(requests.length,3,'a nickname never proves bot identity');
});

test('AI failures cannot undo a confirmed save, and failed saves never trigger AI',async()=>{
  const entry={id:'id',type:'log',visibility:'public',text:'@Quote help'},requests=[];
  const bridge=createQuoteAssistantSaveBridge({saveReviewJournalEntry:async()=>entry},{userId:'owner',request:()=>{throw new Error('AI down');}});
  assert.deepEqual(await bridge.saveReviewJournalEntry(entry,'owner'),entry);
  const failed=createQuoteAssistantSaveBridge({saveReviewJournalEntry:async()=>{throw new Error('save failed');}},{userId:'owner',request:value=>requests.push(value)});
  await assert.rejects(failed.saveReviewJournalEntry(entry,'owner'),/save failed/);assert.equal(requests.length,0);
});

test('local assistant is explicitly fixed-example, owner-isolated and idempotent',async()=>{
  const api=createQuoteAssistantPreview({userId:'owner'});
  const first=await api.run({requestId:'one',kind:'chat',prompt:'test',sessionId:'session'},'owner');
  assert.match(first.text,/固定样例/);assert.equal((await api.state('owner')).mode,'example');
  await api.run({requestId:'one',kind:'chat'},'owner');assert.equal((await api.state('owner')).jobs.length,1);
  assert.equal((await api.state('owner')).memories.length,1,'local automatic memory is clearly marked example');
  await assert.rejects(api.state('other'),/账户已变化/);await assert.rejects(api.publish({id:first.id,revision:first.revision},'owner'),/草稿已变化/);
  await api.memoryPreferences({enabled:false},'owner');await api.deleteMemory({id:(await api.state('owner')).memories[0].id},'owner');
  await api.run({requestId:'two',kind:'chat'},'owner');assert.equal((await api.state('owner')).memories.length,0);
});

test('source links reject executable protocols and mentions do not match unrelated handles',()=>{
  assert.equal(quoteAssistantSourceHref('javascript:alert(1)'),null);
  assert.equal(quoteAssistantSourceHref('https://example.com/report'),'https://example.com/report');
  assert.equal(hasQuoteMention('请@Quote看看'),true);assert.equal(hasQuoteMention('@quote hello'),true);assert.equal(hasQuoteMention('@QuoteFake'),false);
});

test('a saved insight with a numeric source id uses a UUID request key while preserving its real post identity',async()=>{
 const requests=[];const bridge=createQuoteAssistantSaveBridge({saveReviewJournalEntry:async entry=>entry},{userId:'owner',request:value=>requests.push(value)});
 await bridge.saveReviewJournalEntry({id:42,type:'insight',revision:0,visibility:'public',text:'@Quote 看看这条心得'},'owner');
 assert.equal(requests.length,1);assert.equal(requests[0].postId,'insight:42');assert.match(requests[0].requestId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
});
