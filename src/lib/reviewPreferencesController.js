import { normalizeReviewPreferences, patchReviewPreferences, REVIEW_ALWAYS_PIN_KEYS, sameReviewPreferences } from './reviewPreferences.js';

/** Owner-bound preference state; only confirmed cloud values enter the cache. */
export function createReviewPreferencesController({ db, userId, preview = false, previewPreferences } = {}) {
  let confirmed = preview
    ? { preferences: normalizeReviewPreferences(previewPreferences), revision: 0, exists: true, updatedAt: null, alwaysPinSupported: true }
    : db?.readCachedReviewPreferences?.(userId) || null;
  let disposed = false, working = false, cloudReady = preview, generation = 0, pendingPatch = null;
  const listeners = new Set();
  let state = { preferences: confirmed?.preferences || normalizeReviewPreferences(null), ready: Boolean(confirmed),
    loading: !preview, canEdit: preview, alwaysPinSupported: preview, saving: false, error: '' };
  const publish = changes => { if (disposed) return; state = { ...state, ...changes }; for (const listener of listeners) listener(state); };
  const getSnapshot = () => state;
  async function load() {
    if (disposed || working || preview) return preview;
    const token = ++generation; working = true;
    publish({ loading: true, canEdit: false, error: '' });
    try {
      const record = await db.fetchReviewPreferences(userId);
      if (disposed || token !== generation) return false;
      confirmed = record; cloudReady = true;
      publish({ preferences: record.preferences, ready: true, alwaysPinSupported: record.alwaysPinSupported === true, error: '' });
      return true;
    } catch {
      if (!disposed && token === generation) {
        cloudReady = false;
        publish({ alwaysPinSupported: false, error: '动态设置暂时无法读取，请重试。' });
      }
      return false;
    } finally {
      if (!disposed && token === generation) { working = false; publish({ loading: false, canEdit: cloudReady }); }
    }
  }
  async function updatePreferences(patch) {
    if (disposed || working || !cloudReady || !confirmed) return false;
    let next;
    try { next = patchReviewPreferences(confirmed.preferences, patch); }
    catch (error) { publish({ error: error.message }); return false; }
    const keys = Object.keys(patch);
    const alwaysPinKeys = keys.filter(key => REVIEW_ALWAYS_PIN_KEYS.includes(key));
    if (alwaysPinKeys.length && !state.alwaysPinSupported) {
      publish({ error: '始终置顶暂不可用，请稍后重试。' });
      return false;
    }
    if (sameReviewPreferences(next, confirmed.preferences)) { pendingPatch = null; publish({ error: '' }); return true; }
    // A retried clear must not remove a different pin saved by another tab.
    pendingPatch = alwaysPinKeys.length ? null : { ...patch, ...(patch.eventTypes ? { eventTypes: [...patch.eventTypes] } : {}) };
    if (preview) {
      confirmed = { preferences: next, revision: confirmed.revision + 1, exists: true, updatedAt: null, alwaysPinSupported: true };
      pendingPatch = null; publish({ preferences: next, error: '' }); return true;
    }
    const token = ++generation; working = true;
    publish({ preferences: alwaysPinKeys.length ? confirmed.preferences : next, saving: true, canEdit: false, error: '' });
    try {
      const record = alwaysPinKeys.length
        ? await db.saveReviewPreferences(next, confirmed.revision, userId, { alwaysPinKeys, pinOnly: alwaysPinKeys.length === keys.length })
        : await db.saveReviewPreferences(next, confirmed.revision, userId);
      if (disposed || token !== generation) return false;
      confirmed = record; pendingPatch = null;
      publish({ preferences: record.preferences, ready: true, alwaysPinSupported: record.alwaysPinSupported === true, error: '' });
      return true;
    } catch (error) {
      if (!disposed && token === generation) {
        const unavailable = error?.code === 'REVIEW_ALWAYS_PIN_UNAVAILABLE';
        if (error?.code === 'REVIEW_PREFERENCES_OWNER') cloudReady = false;
        publish({ preferences: confirmed.preferences, alwaysPinSupported: cloudReady && state.alwaysPinSupported && !unavailable,
          error: unavailable ? error.message : error?.code === 'REVIEW_PREFERENCES_CONFLICT'
            ? '设置已在其他页面修改，本次选择尚未保存。点击重试重新核对。'
            : '设置未保存，已保留原来的选择。请重试。' });
      }
      return false;
    } finally {
      if (!disposed && token === generation) { working = false; publish({ saving: false, canEdit: cloudReady }); }
    }
  }
  async function retry() {
    if (disposed || working) return false;
    const patch = pendingPatch;
    if (!await load()) return false;
    return patch ? updatePreferences(patch) : true;
  }
  function receive(record) {
    if (disposed || working || !record) return;
    if (confirmed && (record.revision ?? -1) < (confirmed.revision ?? -1)) return;
    confirmed = record; cloudReady = true;
    publish({ preferences: record.preferences, ready: true, canEdit: true,
      alwaysPinSupported: record.alwaysPinSupported === true, error: pendingPatch ? state.error : '' });
  }
  return { getSnapshot, load, updatePreferences, retry, receive,
    activate() { disposed = false; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { disposed = true; working = false; generation++; listeners.clear(); } };
}
