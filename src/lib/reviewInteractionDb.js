import { supabase } from './supabase';
import { createReviewInteractionRepository } from './reviewInteractionRepository.js';
const repository = createReviewInteractionRepository(supabase);
export const fetchReviewFeedUnread = userId => repository.fetchFeedUnread(userId);
export const markReviewFeedSeen = (cursor,userId) => repository.markFeedSeen(cursor,userId);
export const fetchReviewCommentThreads = (options,userId) => repository.fetchCommentThreads(options,userId);
export const fetchReviewCommentThreadReplies = (options,userId) => repository.fetchCommentThreadReplies(options,userId);
export const fetchReviewEvaluationLikes = (options,userId) => repository.fetchEvaluationLikes(options,userId);
export const setReviewEvaluationLike = (postId,target,liked,userId) => repository.setEvaluationLike(postId,target,liked,userId);
