// A persistent display snapshot contains image bytes, never private signatures.
export function createReviewIdentityCache({ load, now = Date.now, ttl = 86400000, storage }) {
  let owner, entry = null, pending = null, generation = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener());
  const matches = userId => Boolean(userId && userId === owner);
  const setOwner = userId => {
    const next = userId || null;
    if (next === owner) return;
    if (owner || !next) storage?.clear();
    owner = next; entry = next ? storage?.read(next) || null : null;
    if (entry?.identity?.avatarPath && !entry.identity.avatarDataUrl) entry.freshUntil = 0;
    pending = null; generation += 1; notify();
  };
  const invalidate = () => {
    generation += 1; pending = null;
    if (entry) { entry = { ...entry, freshUntil: 0 }; storage?.write(owner, entry); }
    notify();
  };
  const peek = userId => {
    const identity = matches(userId) ? entry?.identity || null : null;
    return !identity?.avatarDataUrl && identity?.avatarExpiresAt && identity.avatarExpiresAt <= now()
      ? { ...identity, avatarUrl: '' } : identity;
  };
  const fetch = userId => {
    if (!matches(userId)) return Promise.reject(new Error('账户已更新，请重试。'));
    if (pending) return pending;
    if (entry && entry.freshUntil > now()) return Promise.resolve(entry.identity);
    const epoch = generation;
    const operation = Promise.resolve().then(() => {
      if (epoch !== generation || !matches(userId)) throw new Error('账户资料已更新，请重试。');
      return load(userId, peek(userId));
    }).then(identity => {
      if (epoch !== generation || !matches(userId)) throw new Error('账户资料已更新，请重试。');
      const freshUntil = identity?.avatarPath
        ? identity.avatarDataUrl ? now() + ttl : identity.avatarUrl ? Math.min(now() + ttl, identity.avatarExpiresAt || now()) : 0
        : now() + ttl;
      entry = { identity, freshUntil, savedAt: now() };
      if (identity) storage?.write(userId, entry); else storage?.remove(userId);
      return identity;
    });
    pending = operation;
    operation.finally(() => { if (pending === operation) pending = null; }).catch(() => {});
    return operation;
  };
  return { setOwner, invalidate, peek, fetch,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getOwner: () => owner,
  };
}
