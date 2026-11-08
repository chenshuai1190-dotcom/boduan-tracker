import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewThreadPreview } from '../src/dev/reviewThreadPreview.js';

const owner='owner';
const parent={id:'1',type:'log',timelineEvent:{id:'sample-event'},replies:[{id:'a',text:'original review',date:'2026-11-08',createdAt:'2026-11-08T00:00:00Z'}]};
const rows=[
 {id:'b',postId:'log:1',authorId:'guest',author:{nickname:'访客'},createdAt:'2026-11-08T00:01:00Z',date:'2026-11-08',text:'first reply',replyTo:{kind:'author',id:'a',authorId:owner,nickname:'主人',available:true}},
 {id:'c',postId:'log:1',authorId:owner,author:{nickname:'主人'},createdAt:'2026-11-08T00:02:00Z',date:'2026-11-08',text:'nested reply',replyTo:{kind:'community',id:'b',authorId:'guest',nickname:'访客',available:true}},
];
const setup=()=>createReviewThreadPreview({ownerId:owner,getEntries:()=>[parent],getCommunityRows:()=>rows,getDeletedRows:()=>[],sourceParent:()=>null,assertParent:()=>{throw new Error('forbidden');},assertOwner:id=>{if(id!==owner)throw new Error('account mismatch');}});

test('DEV thread adapter groups owner timeline replies and preserves direct count and flattened descendants', async()=>{
 const api=setup(),result=await api.fetchReviewCommentThreads({postId:'log:1'},owner);
 assert.equal(result.threads.length,1);assert.equal(result.threads[0].root.kind,'author');assert.equal(result.threads[0].replyCount,2);assert.equal(result.totalCount,3);assert.equal(result.communityCount,2);
 const list=await api.fetchReviewCommentThreadReplies({postId:'log:1',root:{kind:'author',id:'a'}},owner);
 assert.deepEqual(list.replies.map(row=>row.id),['b','c']);assert.equal(list.replies[0].directReplyCount,1);
 const located=await api.fetchReviewCommentThreads({postId:'log:1',locate:{kind:'community',id:'c'}},owner);assert.equal(located.threads[0].root.id,'a');
});

test('DEV like mutation is idempotent, read back and account scoped', async()=>{
 const api=setup(),target={kind:'community',id:'b'};
 assert.deepEqual(await api.setReviewEvaluationLike('log:1',target,true,owner),{...target,liked:true,likeCount:1});
 assert.equal((await api.setReviewEvaluationLike('log:1',target,true,owner)).likeCount,1);
 assert.equal((await api.fetchReviewEvaluationLikes({postId:'log:1',targets:[target]},owner)).likes[0].liked,true);
 assert.equal((await api.setReviewEvaluationLike('log:1',target,false,owner)).likeCount,0);
 await assert.rejects(api.fetchReviewCommentThreads({postId:'log:1'},'other'),/account mismatch/);
});

test('DEV reply pagination and notification window preserve chronological cursor semantics',async()=>{
 const api=setup(),first=await api.fetchReviewCommentThreadReplies({postId:'log:1',root:{kind:'author',id:'a'},limit:1},owner);
 assert.equal(first.hasMore,true);assert.equal(first.replies[0].id,'b');
 const next=await api.fetchReviewCommentThreadReplies({postId:'log:1',root:{kind:'author',id:'a'},limit:1,cursor:first.nextCursor},owner);
 assert.equal(next.hasMore,false);assert.equal(next.replies[0].id,'c');
 const located=await api.fetchReviewCommentThreadReplies({postId:'log:1',root:{kind:'author',id:'a'},locate:{kind:'community',id:'c'}},owner);
 assert.deepEqual(located.replies.map(row=>row.id),['c']);
});
