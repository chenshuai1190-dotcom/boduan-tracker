import assert from 'node:assert/strict';
import test from 'node:test';
import {createReviewInteractionRepository} from '../src/lib/reviewInteractionRepository.js';
import {mapReviewFeedUnread,normalizeReviewFeedCursor,mapReviewThreadComment,mapReviewCommentThreads} from '../src/lib/reviewInteractionModel.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const postId='log:88888888-8888-4888-8888-888888888888';
const target={kind:'author',id:'own-comment'};
const rootComment=()=>({...target,postId,authorId:A,author:{nickname:'Author',avatarKey:'gold'},date:'2026-11-08',text:'Root',createdAt:null,sortCreatedAt:'2026-11-08T00:00:00Z',deleted:false,directReplyCount:1,likeCount:0,liked:false});
const previewComment=()=>({kind:'community',id:B,postId,authorId:B,author:{nickname:'Reviewer',avatarKey:'gold',private_email:'not projected'},date:'2026-11-08',text:'First visible reply',revision:1,createdAt:'2026-11-08T01:00:00.123456Z',updatedAt:'2026-11-08T01:00:00.123456Z',sortCreatedAt:'2026-11-08T01:00:00.123456Z',deleted:false,directReplyCount:0,likeCount:1,liked:true,replyTo:{...target,authorId:A,nickname:'Author',available:true}});
const threadPage=(previewReply=previewComment(),replyCount=1)=>({threads:[{root:rootComment(),replyCount,previewReply}],totalCount:replyCount+1,communityCount:replyCount,hasMore:false,nextCursor:null});
function client(value={unreadCount:2,cursor:'9007199254740993'}){
 const calls=[];let owner=A;return{calls,setOwner:user=>{owner=user;},auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:async(name,args)=>{calls.push({name,args});return{data:typeof value==='function'?await value(name,args):value};}};}
test('feed cursor is lossless opaque bigint text and invalid / unsafe representations are rejected',()=>{
 assert.equal(normalizeReviewFeedCursor('9007199254740993'),'9007199254740993');
 for(const value of [null,4,1.5,'01','-1','1e5','9223372036854775808',''])assert.throws(()=>normalizeReviewFeedCursor(value));
 assert.deepEqual(mapReviewFeedUnread({unreadCount:4,cursor:'11'}),{unreadCount:4,cursor:'11'});
 assert.throws(()=>mapReviewFeedUnread({unreadCount:-1,cursor:'11'}));
});
test('unread acknowledgement sends the captured boundary exactly with expected account',async()=>{
 const db=client();const repo=createReviewInteractionRepository(db);
 const first=await repo.fetchFeedUnread(A);await repo.markFeedSeen(first.cursor,A);
 assert.deepEqual(db.calls,[{name:'fetch_review_feed_unread',args:{p_expected_user_id:A}},{name:'mark_review_feed_seen',args:{p_cursor:'9007199254740993',p_expected_user_id:A}}]);
});
test('account switch before and during RPC never exposes former-account data or acknowledges another account',async()=>{
 const before=client();before.setOwner(B);await assert.rejects(()=>createReviewInteractionRepository(before).fetchFeedUnread(A),{code:'REVIEW_ACCOUNT_CHANGED'});assert.equal(before.calls.length,0);
 let during;during=client(()=>{during.setOwner(B);return{unreadCount:22,cursor:'33'};});
 await assert.rejects(()=>createReviewInteractionRepository(during).fetchFeedUnread(A),{code:'REVIEW_ACCOUNT_CHANGED'});
 assert.equal(during.calls[0].args.p_expected_user_id,A);
});
test('desired reaction state is explicit, target metadata is narrowed and mismatched server target rejected',async()=>{
 const db=client({...target,likeCount:1,liked:true}),repo=createReviewInteractionRepository(db);
 assert.deepEqual(await repo.setEvaluationLike(postId,{...target,authorId:B,text:'not transmitted'},true,A),{...target,likeCount:1,liked:true});
 assert.deepEqual(db.calls[0].args,{p_post_id:postId,p_target:target,p_liked:true,p_expected_user_id:A});
 await assert.rejects(()=>repo.setEvaluationLike(postId,target,'yes',A));
 const other=client({...target,id:'different',likeCount:1,liked:true});await assert.rejects(()=>createReviewInteractionRepository(other).setEvaluationLike(postId,target,true,A),{code:'REVIEW_INTERACTION_INVALID_DATA'});
});
test('thread paging carries microseconds without conversion and validates page bounds before any network',async()=>{
 const db=client({threads:[],totalCount:0,communityCount:0,hasMore:false,nextCursor:null}),repo=createReviewInteractionRepository(db);
 const cursor={kind:'community',id:B,createdAt:'2026-11-08T04:00:00.123456+00:00'};
 await repo.fetchCommentThreads({postId,limit:20,cursor,locate:target},A);
 assert.deepEqual(db.calls[0].args,{p_post_id:postId,p_limit:20,p_cursor:cursor,p_locate:target,p_expected_user_id:A});
 const count=db.calls.length;for(const bad of [{postId,limit:21},{postId:'log:bad:target'},{postId,limit:1.3}])await assert.rejects(()=>repo.fetchCommentThreads(bad,A));assert.equal(db.calls.length,count);
});
test('deleted comment mapper never preserves deleted body or attachments',()=>{
 const deleted=mapReviewThreadComment({...target,postId,authorId:A,author:{nickname:'Author',avatarKey:'gold'},createdAt:null,sortCreatedAt:'2026-11-08T00:00:00Z',deleted:true,directReplyCount:1,likeCount:0,liked:false,text:'deleted secret',images:[{path:'deleted'}]},postId);
 assert.equal(deleted.text,'');assert.deepEqual(deleted.images,[]);assert.equal(deleted.deleted,true);assert.equal(deleted.directReplyCount,1);
 assert.throws(()=>mapReviewCommentThreads({threads:[{root:deleted,replyCount:1}],totalCount:1,communityCount:0,hasMore:true,nextCursor:null},postId));
});
test('network failure stays error rather than zero unread or empty comments',async()=>{
 const db=client();db.rpc=async()=>{throw new Error('network');};await assert.rejects(()=>createReviewInteractionRepository(db).fetchFeedUnread(A),{code:'REVIEW_INTERACTION_REQUEST_FAILED'});
});
test('thread preview is returned by the existing single authenticated roots request without child queries',async()=>{
 const db=client(threadPage()),repo=createReviewInteractionRepository(db);
 const result=await repo.fetchCommentThreads({postId},A);
 assert.equal(db.calls.length,1);assert.equal(db.calls[0].name,'fetch_review_comment_threads');assert.equal(db.calls[0].args.p_expected_user_id,A);
 assert.equal(result.threads[0].previewReply.id,B);assert.equal(result.threads[0].previewReply.text,'First visible reply');
 assert.equal(result.threads[0].previewReply.sortCreatedAt,'2026-11-08T01:00:00.123456Z');
 assert.equal(result.threads[0].previewReply.author.private_email,undefined);assert.equal(result.threads[0].previewReply.liked,true);
});
test('old thread responses without preview remain compatible and nested descendants are accepted',()=>{
 const legacy=threadPage();delete legacy.threads[0].previewReply;
 assert.equal(mapReviewCommentThreads(legacy,postId).threads[0].previewReply,null);
 assert.equal(mapReviewCommentThreads(threadPage(null,0),postId).threads[0].previewReply,null);
 const nested={...previewComment(),replyTo:{kind:'community',id:A,authorId:A,nickname:'Intermediate reviewer',available:false}};
 assert.equal(mapReviewCommentThreads(threadPage(nested),postId).threads[0].previewReply.replyTo.id,A);
});
test('thread preview rejects cross-post, deleted, self and zero-count payloads',()=>{
 for(const [preview,count] of [[{...previewComment(),postId:'log:99999999-9999-4999-8999-999999999999'},1],[{...previewComment(),deleted:true},1],[rootComment(),1],[previewComment(),0]]){
  assert.throws(()=>mapReviewCommentThreads(threadPage(preview,count),postId),{code:'REVIEW_INTERACTION_INVALID_DATA'});
 }
});
test('thread previews retain account-switch and denied-access rejection before delivery',async()=>{
 let switched;switched=client(()=>{switched.setOwner(B);return threadPage();});
 await assert.rejects(()=>createReviewInteractionRepository(switched).fetchCommentThreads({postId},A),{code:'REVIEW_ACCOUNT_CHANGED'});
 const hidden=client();hidden.rpc=async()=>({error:{code:'P0002',message:'comment parent unavailable'}});
 await assert.rejects(()=>createReviewInteractionRepository(hidden).fetchCommentThreads({postId},A),{code:'REVIEW_INTERACTION_NOT_FOUND'});
});
