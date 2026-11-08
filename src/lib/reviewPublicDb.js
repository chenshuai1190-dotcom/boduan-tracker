import { supabase } from './supabase';
import { createReviewPublicRepository } from './reviewPublicRepository.js';

const repository = createReviewPublicRepository(supabase);
export const fetchReviewPublicFeed = (options, userId) => repository.fetchFeed(options, userId);
export const fetchReviewPublicPost = (id, userId) => repository.fetchPost(id, userId);
export const setReviewPublicLike = (id, liked, userId) => repository.setLike(id, liked, userId);
export const downloadReviewPublicImage = (path, userId) => repository.downloadImage(path, userId);
export const downloadReviewPublicAvatar = (path, userId) => repository.downloadAvatar(path, userId);
