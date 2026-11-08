import { supabase } from './supabase';
import { createReviewNotificationRepository } from './reviewNotificationRepository.js';

const repository = createReviewNotificationRepository(supabase);
export const fetchReviewNotifications = (options, userId) => repository.fetchNotifications(options, userId);
export const fetchReviewNotificationCount = userId => repository.fetchCount(userId);
export const markReviewNotificationsRead = (options, userId) => repository.markRead(options, userId);
export const readReviewNotificationTarget = (id, userId) => repository.readTarget(id, userId);
