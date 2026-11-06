import { supabase } from './supabase';
import { fetchPnlShareIdentity } from './communityProfilesDb.js';
import { subscribeCommunityAvatar } from './communityAvatarDb.js';
import { createReviewIdentityCache } from './reviewIdentityCache.js';

const cache = createReviewIdentityCache({
  // A fresh signature outlives the five-minute identity cache. Reusing an old
  // avatar signature here would inadvertently extend its display-cache TTL.
  load: userId => fetchPnlShareIdentity({ id: userId }, { forceAvatar: true, strictAvatar: true }),
});
let unsubscribeAvatar;
function setOwner(userId) {
  const next = userId || null;
  if (cache.getOwner() === next) return;
  unsubscribeAvatar?.();
  cache.setOwner(next);
  unsubscribeAvatar = next ? subscribeCommunityAvatar(next, () => cache.invalidate()) : undefined;
}
supabase?.auth?.onAuthStateChange?.((_event, session) => setOwner(session?.user?.id));

export const readCachedReviewIdentity = userId => cache.peek(userId);
export const subscribeReviewIdentity = (_userId, listener) => cache.subscribe(listener);
export async function fetchReviewIdentity(userId) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id || data.user.id !== userId) throw new Error('账户已更新，请重新打开复盘。');
  // Initial auth notification can arrive after the first page request.
  if (cache.getOwner() === undefined) setOwner(userId);
  return cache.fetch(userId);
}
