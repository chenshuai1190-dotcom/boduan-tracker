import { supabase } from './supabase';
import { subscribeCommunityAvatar } from './communityAvatarDb.js';
import { createReviewIdentityCache } from './reviewIdentityCache.js';
import { createReviewIdentityLoader } from './reviewIdentityLoader.js';
import { createReviewIdentityStorage } from './reviewIdentityStorage.js';

const cache = createReviewIdentityCache({
  storage: createReviewIdentityStorage(),
  load: createReviewIdentityLoader(supabase, { supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '' }),
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
  // The authenticated session listener owns the display cache. Warm reads do
  // not make a network auth request; actual refreshes authenticate in load.
  if (cache.getOwner() === undefined) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id || data.user.id !== userId) throw new Error('账户已更新，请重新打开复盘。');
    if (cache.getOwner() === undefined) setOwner(userId);
  }
  return cache.fetch(userId);
}
