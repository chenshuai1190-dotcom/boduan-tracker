import { supabase } from './supabase';
import { createReviewPublicRepository } from './reviewPublicRepository.js';
import { reviewPublicAvatarCache } from './reviewPublicAvatarCache.js';

let avatarViewer;
supabase?.auth?.onAuthStateChange?.((event, session) => {
  const next = session?.user?.id || null;
  if (event === 'SIGNED_OUT' || next !== avatarViewer) reviewPublicAvatarCache.clear();
  avatarViewer = next;
});

const repository = createReviewPublicRepository(supabase);
export const fetchReviewPublicFeed = (options, userId) => repository.fetchFeed(options, userId);
export const fetchReviewPublicPost = (id, userId) => repository.fetchPost(id, userId);
export const setReviewPublicLike = (id, liked, userId) => repository.setLike(id, liked, userId);
export const downloadReviewPublicImage = (path, userId) => repository.downloadImage(path, userId);
export const downloadReviewPublicAvatar = (path, userId) => repository.downloadAvatar(path, userId);
export const fetchReviewCommunityEvaluations = (options, userId) => repository.fetchEvaluations(options, userId);
export const saveReviewCommunityEvaluation = (postId, reply, userId) => repository.saveEvaluation(postId, reply, userId);
export const deleteReviewCommunityEvaluation = (postId, reply, userId) => repository.deleteEvaluation(postId, reply, userId);
