import { useCallback, useEffect, useRef, useState } from 'react';

// Feed arrivals and interaction notifications are separate streams. A feed view
// captures a server-owned boundary before loading, then acknowledges only that
// exact boundary after its unfiltered public content is actually visible.
export default function useReviewFeedUnread({ db, userId, enabled = true }) {
  const [state, setState] = useState({ userId, count: null, error: false });
  const owner = useRef(userId), runtime = useRef(null);
  owner.current = userId;
  useEffect(() => {
    if (!userId || !enabled || typeof db?.fetchReviewFeedUnread !== 'function' || typeof db?.markReviewFeedSeen !== 'function') return undefined;
    const scope = {};
    let disposed = false, pendingRead = null, timer, lastRead = 0, lastSnapshot = null;
    let revision = 0, pendingWrites = 0, latestMark = null;
    const current = () => !disposed && owner.current === userId;
    const visible = () => current() && document.visibilityState !== 'hidden';
    const apply = result => {
      lastSnapshot = result;
      setState({ userId, count: result.unreadCount, error: false });
    };
    const fail = () => setState(old => ({ userId, count: old.userId === userId ? old.count : null, error: true }));
    const schedule = () => {
      clearTimeout(timer);
      if (visible()) timer = setTimeout(() => { read().finally(schedule); }, 30000);
    };
    const read = (force = false) => {
      if (!visible()) return Promise.resolve(null);
      if (pendingWrites) return Promise.resolve(null);
      if (pendingRead) return pendingRead;
      if (!force && Date.now() - lastRead < 1000) return Promise.resolve(lastSnapshot);
      lastRead = Date.now();
      const readRevision = revision;
      pendingRead = Promise.resolve().then(() => db.fetchReviewFeedUnread(userId)).then(result => {
        if (!current() || readRevision !== revision) return null;
        apply(result); return result;
      }).catch(() => {
        if (current() && readRevision === revision) fail();
        return null;
      }).finally(() => { pendingRead = null; });
      return pendingRead;
    };
    const captureBoundary = async () => {
      if (!visible() || pendingWrites) return null;
      // A confirmed boundary from this account scope already predates the feed
      // request. Copy it now instead of blocking the feed on another RPC; newer
      // arrivals remain unread. The first view still waits for its first boundary.
      const result = lastSnapshot || await read(true);
      return current() && result ? { userId, cursor: result.cursor, scope } : null;
    };
    const markSeen = token => {
      if (!visible() || !token || token.userId !== userId || token.scope !== scope) return Promise.resolve(null);
      // A delayed older view must not supersede a newer acknowledgement.
      // The decimal string is kept exact; the backend validates the cursor.
      if (latestMark && BigInt(token.cursor) <= BigInt(latestMark.cursor)) return latestMark.promise;
      const writeRevision = ++revision;
      pendingWrites += 1;
      clearTimeout(timer);
      const promise = Promise.resolve().then(() => db.markReviewFeedSeen(token.cursor, userId)).then(result => {
        if (!current() || writeRevision !== revision) return null;
        apply(result); return result;
      }).catch(() => {
        if (current() && writeRevision === revision) fail();
        return null;
      }).finally(() => {
        pendingWrites -= 1;
        if (latestMark?.promise === promise) latestMark = null;
        if (!pendingWrites) schedule();
      });
      latestMark = { cursor: token.cursor, promise };
      return promise;
    };
    const resume = () => { clearTimeout(timer); if (visible()) read().finally(schedule); };
    const controls = { captureBoundary, markSeen, refresh: () => read(true) };
    runtime.current = controls;
    resume();
    for (const event of ['focus', 'pageshow', 'online']) window.addEventListener(event, resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true; revision += 1; clearTimeout(timer);
      if (runtime.current === controls) runtime.current = null;
      for (const event of ['focus', 'pageshow', 'online']) window.removeEventListener(event, resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [db, userId, enabled]);
  // Stable callbacks let the feed request depend on them without refetching every
  // time the count changes. Tokens also reject a leave-and-return account race.
  const captureBoundary = useCallback(() => runtime.current?.captureBoundary() ?? Promise.resolve(null), []);
  const markSeen = useCallback(token => runtime.current?.markSeen(token) ?? Promise.resolve(null), []);
  const refresh = useCallback(() => runtime.current?.refresh() ?? Promise.resolve(null), []);
  return { unreadCount: enabled && state.userId === userId ? state.count : null,
    error: enabled && state.userId === userId && state.error, captureBoundary, markSeen, refresh };
}
