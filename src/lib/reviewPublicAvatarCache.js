// Avatars only: post images and comment attachments still recheck Storage access.
// Fresh server author metadata supplies an immutable path; never key by nickname
// or preset. Memory is viewer-scoped, bounded, and cleared on authentication changes.
export function createReviewPublicAvatarCache({ now = Date.now, ttl = 300000, maxEntries = 64, maxBytes = 16 * 1024 * 1024,
  createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url),
  makeImage = () => new Image(), timeout = setTimeout, cancelTimeout = clearTimeout } = {}) {
  let owner = null;
  const stores = new Map(), liveEntries = new Set();
  const entries = () => [...stores.values()].flatMap(store => [...store.values()]);
  const revoke = entry => { if (entry.url) { revokeUrl(entry.url); entry.url = ''; } };
  const discard = (entry, immediate = false) => {
    if (entry.store.get(entry.path) === entry) entry.store.delete(entry.path);
    if (!entry.store.size && stores.get(entry.db) === entry.store) stores.delete(entry.db);
    entry.disposed = true;
    entry.cancel?.();
    if (immediate) for (const listener of entry.listeners) listener();
    if (immediate || !entry.listeners.size) { revoke(entry); liveEntries.delete(entry); }
  };
  const prune = () => {
    for (const entry of entries()) if (entry.until <= now() && !(entry.pending && entry.listeners.size)) discard(entry);
    const all = entries().sort((a, b) => a.usedAt - b.usedAt);
    let bytes = all.reduce((sum, entry) => sum + entry.bytes, 0), count = all.length;
    for (const entry of all) {
      if (count <= maxEntries && bytes <= maxBytes) break;
      // Mounted cold avatars must finish even if a long list exceeds the cache
      // budget. Once decoded, only their live lease retains the evicted URL.
      if (entry.pending && entry.listeners.size) continue;
      bytes -= entry.bytes; count--; discard(entry);
    }
  };
  function clear() {
    owner = null;
    for (const entry of liveEntries) discard(entry, true);
    stores.clear();
  }
  function peek(db, userId, path) {
    const entry = owner === userId && stores.get(db)?.get(path);
    return entry && !entry.disposed && entry.until > now() ? entry.url : '';
  }
  function acquire(db, userId, path, onInvalidate = () => {}) {
    if (!userId || !path || typeof db?.downloadReviewPublicAvatar !== 'function') throw new Error('Avatar access is unavailable');
    if (owner !== userId) { clear(); owner = userId; }
    prune();
    let store = stores.get(db);
    if (!store) { store = new Map(); stores.set(db, store); }
    let entry = store.get(path);
    if (!entry) {
      entry = { db, store, path, url: '', bytes: 0, until: now() + ttl, usedAt: now(), listeners: new Set(), disposed: false, pending: true };
      store.set(path, entry); liveEntries.add(entry);
      entry.promise = new Promise((resolve, reject) => {
        let settled = false, image, pendingUrl = '';
        const finish = error => {
          if (settled) return;
          settled = true; entry.pending = false; cancelTimeout(timer);
          if (image) { image.onload = null; image.onerror = null; }
          entry.cancel = null;
          if (error || entry.disposed) {
            if (pendingUrl) revokeUrl(pendingUrl);
            discard(entry);
            reject(error || new Error('Avatar scope changed'));
          } else {
            entry.url = pendingUrl; entry.until = now() + ttl;
            resolve(entry.url); prune();
          }
        };
        const timer = timeout(() => finish(new Error('Avatar loading timed out')), 8000);
        entry.cancel = () => finish(new Error('Avatar scope changed'));
        Promise.resolve().then(() => db.downloadReviewPublicAvatar(path, userId)).then(blob => {
          if (settled || entry.disposed) return;
          if (!(blob instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size <= 0 || blob.size > 2 * 1024 * 1024) throw new Error('Invalid avatar image');
          entry.bytes = blob.size;
          pendingUrl = createUrl(blob); image = makeImage(); image.decoding = 'async';
          image.onload = () => { Promise.resolve().then(() => image.decode?.()).then(() => finish(), () => finish(new Error('Avatar decoding failed'))); };
          image.onerror = () => finish(new Error('Avatar decoding failed'));
          image.src = pendingUrl;
        }).catch(finish);
      });
      // A cancelled/unmounted subscriber need not await this shared request.
      entry.promise.catch(() => {});
    }
    entry.usedAt = now(); entry.listeners.add(onInvalidate); prune();
    let released = false;
    return { get url() { return entry.url; }, promise: entry.promise, release() {
      if (released) return;
      released = true; entry.listeners.delete(onInvalidate);
      if (entry.disposed && !entry.listeners.size) { revoke(entry); liveEntries.delete(entry); }
    } };
  }
  return { acquire, peek, clear };
}

export const reviewPublicAvatarCache = createReviewPublicAvatarCache();
