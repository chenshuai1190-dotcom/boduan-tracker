import { useEffect, useRef, useState } from 'react';

// One bounded, visible-page poll. Account changes and direct inbox updates
// invalidate pending reads so a stale response cannot restore an old badge.
export default function useReviewNotificationCount({ db, userId, enabled = true }) {
  const [state, setState] = useState({ userId, count: null, error: false });
  const generation = useRef(0), owner = useRef(userId), updateRef = useRef(null);
  owner.current = userId;
  useEffect(() => {
    const version = ++generation.current;
    if (!userId || !enabled || typeof db.fetchReviewNotificationCount !== 'function') return undefined;
    let disposed = false, pending = null, timer, lastRead = 0;
    const visible = () => !disposed && document.visibilityState !== 'hidden';
    const schedule = () => {
      clearTimeout(timer);
      if (visible()) timer = setTimeout(() => { refresh().catch(() => {}).finally(schedule); }, 30000);
    };
    const refresh = () => {
      if (!visible()) return Promise.resolve();
      if (pending) return pending;
      if (Date.now() - lastRead < 1000) return Promise.resolve();
      lastRead = Date.now();
      const readVersion = generation.current;
      pending = Promise.resolve().then(() => db.fetchReviewNotificationCount(userId)).then(result => {
        if (!disposed && owner.current === userId && generation.current === readVersion) setState({ userId, count: result.unreadCount, error: false });
      }).catch(() => {
        if (!disposed && owner.current === userId && generation.current === readVersion) setState({ userId, count: null, error: true });
      }).finally(() => { pending = null; });
      return pending;
    };
    const resume = () => { clearTimeout(timer); if (visible()) refresh().finally(schedule); };
    updateRef.current = refresh;
    resume();
    for (const event of ['focus', 'pageshow', 'online']) window.addEventListener(event, resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true; clearTimeout(timer);
      if (generation.current === version) generation.current += 1;
      if (updateRef.current === refresh) updateRef.current = null;
      for (const event of ['focus', 'pageshow', 'online']) window.removeEventListener(event, resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [db, userId, enabled]);
  return {
    unreadCount: state.userId === userId ? state.count : null,
    error: state.userId === userId && state.error,
    refresh: () => updateRef.current?.(),
    update: count => { if (owner.current !== userId) return; generation.current += 1; setState({ userId, count, error: false }); },
  };
}
