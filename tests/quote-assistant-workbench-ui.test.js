import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { createQuoteAssistantPreview } from '../src/dev/quoteAssistantPreview.js';
import { createQuoteAssistantRepository } from '../src/lib/quoteAssistantRepository.js';
import { getVixComparisonExpectedCloseDate } from '../src/lib/vixComparisonSession.js';

const source=readFileSync(new URL('../src/components/QuoteAssistantWorkbench.jsx',import.meta.url),'utf8');
const walk=value=>!React.isValidElement(value)?Array.isArray(value)?value.flatMap(walk):[]:[value,...walk(value.props.children)];
const text=value=>!React.isValidElement(value)?Array.isArray(value)?value.map(text).join(''):String(value??''):text(value.props.children);
const button=(tree,name)=>walk(tree).find(node=>node.type==='button'&&(node.props['aria-label']===name||text(node)===name));
const field=(tree,label)=>walk(tree).find(node=>node.type==='label'&&text(node).startsWith(label));
const input=(tree,label)=>walk(field(tree,label)).find(node=>['input','select','textarea'].includes(node.type));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let count=0;
async function harness(options={}){
 let cursor=0,effects=[];const slots=[],calls=[];
 const fake=createQuoteAssistantPreview({userId:'owner'});
 const api=Object.fromEntries(Object.entries(fake).map(([name,fn])=>[name,async(...args)=>{calls.push({name,args});return fn(...args);} ]));
 Object.assign(api,options.api);
 const fixture={useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useRef(initial){return slots[cursor++]??={current:initial};},useEffect(effect,deps){const i=cursor++,previous=slots[i];if(previous&&deps.every((v,n)=>Object.is(v,previous.deps[n])))return;previous?.cleanup?.();const slot={deps};slots[i]=slot;effects.push(()=>{slot.cleanup=effect();});}};
 const key=`__qaWorkbench${++count}`;globalThis[key]=fixture;
 let Component;
 try{const result=await transformWithOxc(`
 import React from ${JSON.stringify(import.meta.resolve('react'))};
 import {ArrowRight,Check,Clock3,Loader2,Plus,RefreshCw,Send,Trash2} from ${JSON.stringify(import.meta.resolve('lucide-react'))};
 import {QUOTE_ASSISTANT_MODES,QUOTE_ASSISTANT_STATUSES,mergeQuoteAssistantJob,quoteAssistantPostTitle,quoteAssistantSourceHref} from ${JSON.stringify(new URL('../src/lib/quoteAssistantModel.js',import.meta.url).href)};
 import { getVixComparisonExpectedCloseDate } from ${JSON.stringify(new URL('../src/lib/vixComparisonSession.js',import.meta.url).href)};
 const {useEffect,useRef,useState}=globalThis[${JSON.stringify(key)}];
 const ReviewSystemAvatar=()=>null,ReviewSystemName=()=>null;
 ${source.slice(source.indexOf('const today'))}
 `,'QuoteAssistantWorkbenchTest.jsx',{jsx:{runtime:'classic'}});Component=(await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`)).default;}finally{delete globalThis[key];}
 const db={saveReviewCommunityEvaluation:async(postId,reply,userId)=>{calls.push({name:'save-comment',args:[postId,reply,userId]});return{...reply,postId,authorId:userId};},...options.db};
 const props={api,db,userId:'owner',preview:true,...options.props};
 const render=()=>{cursor=0;effects=[];const tree=Component(props);effects.forEach(effect=>effect());return tree;};
 return {api,db,calls,render,async load(){render();await flush();return render();},unmount(){slots.forEach(slot=>slot?.cleanup?.());}};
}

test('workbench exposes five scenarios, separate private chat and explicit fixed-example identity',async()=>{
 const h=await harness();const tree=await h.load();
 for(const name of ['聊一聊','@Quote 回复','盘后复盘','观点回访','社区周报','公开里程碑'])assert.ok(button(tree,name));
 assert.match(text(tree),/固定样例回答/);assert.match(text(tree),/仅自己可见/);assert.match(text(tree),/自动记忆开启/);
 assert.deepEqual(h.calls.map(c=>c.name),['state'],'mounting never generates content');h.unmount();
});

test('unconfigured real API cannot generate or silently enter sample mode',async()=>{
 const h=await harness({props:{preview:false},api:{state:async()=>({configured:false,enabled:true,memories:[],jobs:[],posts:[],milestones:[]})}});let tree=await h.load();
 input(tree,'想和 Quote 说什么').props.onChange({target:{value:'你好'}});tree=h.render();
 assert.equal(button(tree,'发送').props.disabled,true);assert.match(text(tree),/AI 服务待配置/);assert.doesNotMatch(text(tree),/固定样例|示例模式/);h.unmount();
});

test('continuous chat keeps its session and refreshes automatic memory, which can be corrected and paused',async()=>{
 const h=await harness();let tree=await h.load();
 for(const message of ['帮我复盘','继续看执行']){input(tree,'想和 Quote 说什么').props.onChange({target:{value:message}});tree=h.render();button(tree,'发送').props.onClick();await flush();tree=h.render();}
 const runs=h.calls.filter(c=>c.name==='run');assert.equal(runs.length,2);assert.equal(runs[0].args[0].sessionId,runs[1].args[0].sessionId);assert.notEqual(runs[0].args[0].requestId,runs[1].args[0].requestId);
 assert.match(text(tree),/示例记忆/);button(tree,'纠正').props.onClick();tree=h.render();input(tree,'纠正这条记忆').props.onChange({target:{value:'我关注执行纪律'}});tree=h.render();button(tree,'保存修改').props.onClick();await flush();tree=h.render();assert.match(text(tree),/我关注执行纪律/);
 button(tree,'自动记忆').props.onClick();await flush();tree=h.render();assert.equal(button(tree,'自动记忆').props['aria-checked'],false);
 h.unmount();
});

test('public reply saves the actual question before invoking AI with its confirmed id',async()=>{
 const h=await harness();let tree=await h.load();button(tree,'@Quote 回复').props.onClick();tree=h.render();
 input(tree,'公开原帖').props.onChange({target:{value:'log:local-quote-ai-source'}});input(tree,'想和 Quote 说什么').props.onChange({target:{value:'如何验证？'}});tree=h.render();button(tree,'发表评论并请 Quote 回复').props.onClick();await flush();tree=h.render();
 const saved=h.calls.find(c=>c.name==='save-comment'),run=h.calls.find(c=>c.name==='run');assert.ok(saved);assert.ok(run);assert.ok(h.calls.indexOf(saved)<h.calls.indexOf(run));
 assert.deepEqual(run.args[0].replyTo,{kind:'community',id:saved.args[1].id});assert.equal(run.args[0].autoPublish,true);assert.equal(run.args[0].prompt,undefined,'the server reads the real saved comment');h.unmount();
});

test('failed AI reply retries without creating a second public comment',async()=>{
 let attempts=0;
 const h=await harness({api:{run:async payload=>{attempts++;if(attempts===1)throw new Error('模型暂不可用');return{id:payload.requestId,kind:'reply',status:'published',text:'已完成',revision:1};}}});let tree=await h.load();button(tree,'@Quote 回复').props.onClick();tree=h.render();
 input(tree,'公开原帖').props.onChange({target:{value:'log:local-quote-ai-source'}});input(tree,'想和 Quote 说什么').props.onChange({target:{value:'请帮助复盘'}});tree=h.render();button(tree,'发表评论并请 Quote 回复').props.onClick();await flush();tree=h.render();
 assert.match(text(tree),/评论已保存/);button(tree,'评论已保存，重试小助手回复').props.onClick();await flush();tree=h.render();assert.equal(h.calls.filter(c=>c.name==='save-comment').length,1);assert.equal(attempts,2);h.unmount();
});

test('generated daily draft needs separate publish confirmation and scheduled weekly drafts stay private until confirmed',async()=>{
 const h=await harness();let tree=await h.load();button(tree,'盘后复盘').props.onClick();tree=h.render();button(tree,'生成草稿').props.onClick();await flush();tree=h.render();
 assert.equal(h.calls.filter(c=>c.name==='publish').length,0);button(tree,'检查并发布').props.onClick();tree=h.render();assert.ok(walk(tree).find(n=>n.props.role==='dialog'));button(tree,'确认公开发布').props.onClick();await flush();tree=h.render();assert.equal(h.calls.filter(c=>c.name==='publish').length,1);
 button(tree,'社区周报').props.onClick();tree=h.render();input(tree,'自动生成每周草稿').props.onChange({target:{checked:true}});tree=h.render();input(tree,'首次生成时间').props.onChange({target:{value:'2099-01-01T12:00'}});tree=h.render();button(tree,'开启自动草稿').props.onClick();await flush();tree=h.render();
 const schedule=h.calls.find(c=>c.name==='schedule');assert.equal(schedule.args[0].recurrence,'weekly');assert.equal(schedule.args[0].kind,'weekly-digest');assert.equal(schedule.args[0].autoPublish,undefined);h.unmount();
});

test('milestone sharing requires a selected existing node and explicit scope confirmation',async()=>{
 const h=await harness();let tree=await h.load();button(tree,'公开里程碑').props.onClick();tree=h.render();assert.equal(button(tree,'生成草稿').props.disabled,true);
 input(tree,'选择自己的时间线记录').props.onChange({target:{value:'log:local-quote-ai-milestone'}});tree=h.render();assert.equal(button(tree,'生成草稿').props.disabled,true);
 input(tree,'允许用这个节点').props.onChange({target:{checked:true}});tree=h.render();button(tree,'生成草稿').props.onClick();await flush();tree=h.render();
 const run=h.calls.find(c=>c.name==='run');assert.equal(run.args[0].shareConfirmed,true);assert.equal(run.args[0].postId,'log:local-quote-ai-milestone');assert.equal(run.args[0].milestone,undefined);h.unmount();
});

test('unmount discards an in-flight answer before updating visible state',async()=>{
 let resolve;
 const h=await harness({api:{run:()=>new Promise(r=>resolve=r)}});let tree=await h.load();input(tree,'想和 Quote 说什么').props.onChange({target:{value:'private question'}});tree=h.render();button(tree,'发送').props.onClick();await flush();h.unmount();resolve({id:'late',kind:'chat',status:'draft',text:'secret late answer'});await flush();tree=h.render();assert.doesNotMatch(text(tree),/secret late answer/);
});

test('reopening private chat resumes a persisted session and lets the user switch conversations',async()=>{
 const state={configured:true,enabled:true,memories:[],posts:[],milestones:[],subscriptions:[],jobs:[
  {id:'newest',kind:'chat',sessionId:'session-new',prompt:'新会话问题',text:'最近的回答',status:'completed'},
  {id:'older',kind:'chat',sessionId:'session-old',prompt:'旧会话问题',text:'之前的回答',status:'completed'}]};
 const h=await harness({api:{state:async()=>state}});let tree=await h.load();
 assert.match(text(tree),/最近的回答/);assert.doesNotMatch(text(tree),/之前的回答/);
 input(tree,'历史对话').props.onChange({target:{value:'session-old'}});tree=h.render();
 assert.match(text(tree),/之前的回答/);assert.doesNotMatch(text(tree),/最近的回答/);h.unmount();
});

test('uncertain manual memory save retries the same id rather than duplicating a remembered fact',async()=>{
 const requests=[];
 const h=await harness({api:{saveMemory:async payload=>{requests.push(payload);throw new Error('网络暂不可用');}}});let tree=await h.load();
 input(tree,'补充一条记忆').props.onChange({target:{value:'我喜欢简短复盘'}});tree=h.render();
 button(tree,'补充记忆').props.onClick();await flush();tree=h.render();button(tree,'补充记忆').props.onClick();await flush();
 assert.equal(requests.length,2);assert.equal(requests[0].id,requests[1].id);h.unmount();
});

test('known failed jobs use the revision-checked retry operation rather than creating a new task',async()=>{
 const failed={id:'failed-job',kind:'daily-review',status:'failed',revision:3,text:'',prompt:'核对当天'};
 const state={configured:true,enabled:true,memories:[],posts:[],milestones:[],subscriptions:[],jobs:[failed]};
 const retries=[];const h=await harness({api:{state:async()=>state,retry:async value=>{retries.push(value);return{...failed,status:'draft',revision:4,text:'新的草稿'};}}});let tree=await h.load();
 button(tree,'任务记录1').props.onClick();tree=h.render();button(tree,'重试任务').props.onClick();await flush();tree=h.render();
 assert.deepEqual(retries,[{id:'failed-job',revision:3}]);assert.equal(h.calls.filter(c=>c.name==='run').length,0);h.unmount();
});

test('switching out of private chat sends independent sessions through the real HTTP client for all public modes',async()=>{
 const sent=[];const fixtures=await createQuoteAssistantPreview({userId:'owner'}).state('owner');
 const client={auth:{onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}};},async getSession(){return{data:{session:{user:{id:'owner'},access_token:'test-token'}}};}}};
 const api=createQuoteAssistantRepository(client,{fetchImpl:async(_,options)=>{const payload=JSON.parse(options.body);sent.push(payload);return{ok:true,json:async()=>({success:true,data:payload.action==='state'?fixtures:{id:payload.requestId,kind:payload.kind,status:'draft',revision:1,text:'测试'}})};}});
 const h=await harness({api});let tree=await h.load();
 input(tree,'想和 Quote 说什么').props.onChange({target:{value:'我的私密会话'}});tree=h.render();button(tree,'发送').props.onClick();await flush();tree=h.render();
 const chat=sent.find(p=>p.action==='run'&&p.kind==='chat');assert.ok(chat.sessionId);
 button(tree,'盘后复盘').props.onClick();tree=h.render();assert.equal(input(tree,'复盘日期').props.value,getVixComparisonExpectedCloseDate());button(tree,'生成草稿').props.onClick();await flush();tree=h.render();
 button(tree,'社区周报').props.onClick();tree=h.render();button(tree,'生成草稿').props.onClick();await flush();tree=h.render();
 button(tree,'公开里程碑').props.onClick();tree=h.render();input(tree,'选择自己的时间线记录').props.onChange({target:{value:'log:local-quote-ai-milestone'}});tree=h.render();input(tree,'允许用这个节点').props.onChange({target:{checked:true}});tree=h.render();button(tree,'生成草稿').props.onClick();await flush();tree=h.render();
 button(tree,'观点回访').props.onClick();tree=h.render();input(tree,'自己的公开原帖').props.onChange({target:{value:'log:local-quote-ai-source'}});input(tree,'到时候想验证什么').props.onChange({target:{value:'检查执行'}});input(tree,'回访时间').props.onChange({target:{value:'2099-01-01T12:00'}});tree=h.render();button(tree,'设置回访').props.onClick();await flush();tree=h.render();
 button(tree,'@Quote 回复').props.onClick();tree=h.render();input(tree,'公开原帖').props.onChange({target:{value:'log:local-quote-ai-source'}});input(tree,'想和 Quote 说什么').props.onChange({target:{value:'继续讨论'}});tree=h.render();button(tree,'发表评论并请 Quote 回复').props.onClick();await flush();
 const publicRequests=sent.filter(p=>['run','schedule'].includes(p.action)&&p.kind!=='chat');assert.deepEqual(publicRequests.map(p=>p.kind),['daily-review','weekly-digest','milestone','followup','reply']);
 for(const payload of publicRequests)assert.equal(payload.sessionId,undefined,`${payload.kind} must not reuse the private chat session`);
 assert.equal(new Set(sent.filter(p=>p.action==='run'||p.action==='schedule').map(p=>p.requestId)).size,6);h.unmount();
});
