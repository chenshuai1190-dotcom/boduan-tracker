import { isReviewJournalOperationId, reviewJournalError } from './reviewJournalModel.js';
import { isReviewPublicPostId } from './reviewPublicModel.js';
import { createReviewSessionGuard } from './reviewSessionGuard.js';
import { isReviewInteractionObject, normalizeReviewCommentTarget, normalizeReviewCommentCursor, normalizeReviewFeedCursor,
  mapReviewFeedUnread, mapReviewEvaluationLike, mapReviewEvaluationLikes, mapReviewCommentThreads, mapReviewCommentThreadReplies } from './reviewInteractionModel.js';
const invalid = () => { throw reviewJournalError('REVIEW_INTERACTION_INVALID_QUERY','评论操作参数无效，请重新打开。'); };
export function reviewInteractionError(error) {
  if (['42883','42P01','42703','PGRST202','PGRST204'].includes(error?.code)) return reviewJournalError('REVIEW_INTERACTION_NOT_CONFIGURED','评论互动功能暂不可用，请稍后重试。');
  if (['P0002','23503'].includes(error?.code)) return reviewJournalError('REVIEW_INTERACTION_NOT_FOUND','评论或动态已删除或不再可见。');
  if (error?.code==='42501') return reviewJournalError('REVIEW_INTERACTION_FORBIDDEN','当前账户无法访问这条评论。');
  return reviewJournalError('REVIEW_INTERACTION_REQUEST_FAILED','评论互动暂时无法读取，请重试。');
}
export function createReviewInteractionRepository(client) {
  const sessionGuard=createReviewSessionGuard(client,{isValidUserId:isReviewJournalOperationId,requestError:()=>reviewInteractionError(null)});
  async function rpc(name,args,userId) {
    const session=await sessionGuard.begin(userId);
    if (typeof client.rpc!=='function') throw reviewInteractionError({code:'PGRST202'});
    sessionGuard.assertCurrent(session);
    let result;try {result=await client.rpc(name,{...args,p_expected_user_id:userId});}catch{result={error:{code:'NETWORK_ERROR'}};}
    await sessionGuard.verify(session);
    if (!result||result.error) throw reviewInteractionError(result?.error);
    return result.data;
  }
  function options(value,maximum,defaultLimit) {
    if (!isReviewInteractionObject(value)||!isReviewPublicPostId(value.postId)) return invalid();
    const limit=value.limit??defaultLimit;
    if (!Number.isSafeInteger(limit)||limit<1||limit>maximum) return invalid();
    return {postId:value.postId,limit,cursor:normalizeReviewCommentCursor(value.cursor),locate:value.locate==null?null:normalizeReviewCommentTarget(value.locate)};
  }
  return {
    async fetchFeedUnread(userId) {return mapReviewFeedUnread(await rpc('fetch_review_feed_unread',{},userId));},
    async markFeedSeen(cursor,userId) {return mapReviewFeedUnread(await rpc('mark_review_feed_seen',{p_cursor:normalizeReviewFeedCursor(cursor)},userId));},
    async fetchCommentThreads(value,userId) {
      const query=options(value,20,20);
      return mapReviewCommentThreads(await rpc('fetch_review_comment_threads',{p_post_id:query.postId,p_limit:query.limit,p_cursor:query.cursor,p_locate:query.locate},userId),query.postId,query.limit);
    },
    async fetchCommentThreadReplies(value,userId) {
      const query=options(value,50,50),root=normalizeReviewCommentTarget(value.root);
      return mapReviewCommentThreadReplies(await rpc('fetch_review_comment_thread_replies',{p_post_id:query.postId,p_root:root,p_limit:query.limit,p_cursor:query.cursor,p_locate:query.locate},userId),query.postId,query.limit);
    },
    async fetchEvaluationLikes(value,userId) {
      if (!isReviewInteractionObject(value)||!isReviewPublicPostId(value.postId)||!Array.isArray(value.targets)||value.targets.length>100) return invalid();
      const targets=value.targets.map(normalizeReviewCommentTarget);
      return mapReviewEvaluationLikes(await rpc('fetch_review_evaluation_likes',{p_post_id:value.postId,p_targets:targets},userId),targets);
    },
    async setEvaluationLike(postId,value,liked,userId) {
      if (!isReviewPublicPostId(postId)||typeof liked!=='boolean') return invalid();
      const target=normalizeReviewCommentTarget(value);
      return mapReviewEvaluationLike(await rpc('set_review_evaluation_like',{p_post_id:postId,p_target:target,p_liked:liked},userId),target);
    },
  };
}
