import { normalizeReviewPreferences, sameReviewPreferences } from './reviewPreferences.js';

const TABLE = 'review_display_preferences';
// Old caches cannot distinguish a missing new category from an explicit off
// selection. Wait for the authoritative nullable-column default once instead.
const STORAGE_KEY = 'bottomline_review_display_preferences_v3';
const INDEPENDENT_TYPES = ['return_drawdown', 'annual_return_high', 'annual_return_low', 'annual_pnl_high', 'annual_pnl_low', 'stock_daily_record'];
const SELECT_COLUMNS = ['show_timeline', 'currency', 'event_types', ...INDEPENDENT_TYPES.map(type => `show_${type}`), 'revision', 'updated_at'].join(',');
const MAX_CACHE_AGE = 30 * 86400000;
const MAX_REVISION = 2147483647;
const validOwner = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(value);
const fail = (code, message) => Object.assign(new Error(message), { code });
const clone = value => ({ ...value, preferences: { ...value.preferences, eventTypes: [...value.preferences.eventTypes] } });
function defaultStorage() { try { return globalThis.localStorage || null; } catch { return null; } }
function parseRow(row) {
  if (!row) return { preferences: normalizeReviewPreferences(null), revision: null, exists: false, updatedAt: null };
  if (!Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision > MAX_REVISION || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) {
    throw fail('REVIEW_PREFERENCES_INVALID', '云端动态设置格式无效，请稍后重试。');
  }
  if (!Array.isArray(row.event_types) || row.event_types.some(type => INDEPENDENT_TYPES.includes(type))
    || INDEPENDENT_TYPES.some(type => row[`show_${type}`] !== null && typeof row[`show_${type}`] !== 'boolean')) {
    throw fail('REVIEW_PREFERENCES_INVALID', '云端动态设置格式无效，请稍后重试。');
  }
  // NULL is the old shared setting. An explicit false must remain independent
  // even while net-asset drawdowns are enabled.
  const showReturnDrawdown = row.show_return_drawdown ?? row.event_types.includes('drawdown');
  const eventTypes = [...row.event_types, ...(showReturnDrawdown ? ['return_drawdown'] : []),
    ...INDEPENDENT_TYPES.filter(type => type !== 'return_drawdown' && (row[`show_${type}`] ?? true))];
  return { preferences: normalizeReviewPreferences({ showTimeline: row.show_timeline, currency: row.currency, eventTypes }, { strict: true }),
    revision: row.revision, exists: true, updatedAt: row.updated_at };
}

/** A dedicated owner row avoids legacy user_settings whole-document saves. */
export function createReviewPreferencesRepository({ supabase, storage = defaultStorage(), now = Date.now, eventTarget = globalThis.window } = {}) {
  const cache = new Map(), versions = new Map(), listeners = new Map();
  const version = owner => versions.get(owner) || 0;
  const rank = record => record?.revision ?? -1;
  const fresh = item => item && Number.isSafeInteger(item.savedAt) && item.savedAt <= now() && now() - item.savedAt <= MAX_CACHE_AGE;
  function parseCached(raw, owner) {
    try {
      if (!raw || raw.length > 4096) return null;
      const item = JSON.parse(raw);
      if (item?.version !== 3 || item.ownerId !== owner || !fresh(item)) return null;
      const record = item.record;
      if (!record || (record.exists !== true && record.exists !== false)
        || (record.exists ? !Number.isSafeInteger(record.revision) || record.revision < 0 || record.revision > MAX_REVISION : record.revision !== null)
        || (record.exists ? typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt)) : record.updatedAt !== null)) return null;
      const checked = { preferences: normalizeReviewPreferences(record.preferences, { strict: true }), revision: record.revision, exists: record.exists, updatedAt: record.updatedAt };
      return { record: checked, savedAt: item.savedAt };
    } catch { return null; }
  }
  function cacheLocally(owner, item) {
    cache.set(owner, item);
    while (cache.size > 8) cache.delete(cache.keys().next().value);
  }
  function readCachedReviewPreferences(owner) {
    if (!validOwner(owner)) return null;
    const known = fresh(cache.get(owner)) ? cache.get(owner) : null;
    let stored = null;
    try { stored = parseCached(storage?.getItem(STORAGE_KEY), owner); } catch { /* Optional cache. */ }
    // Another tab may have saved while this page had no mounted subscriber.
    const selected = stored && (!known || rank(stored.record) > rank(known.record)) ? stored : known;
    if (!selected) return null;
    cacheLocally(owner, selected);
    return clone(selected.record);
  }
  function remember(owner, record) {
    const known = readCachedReviewPreferences(owner);
    // Out-of-order reads must not roll back a newer revision from any tab.
    if (known && rank(known) > rank(record)) return known;
    const value = clone(record), savedAt = now();
    cacheLocally(owner, { record: value, savedAt });
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 3, ownerId: owner, savedAt, record: value })); } catch { /* Optional cache; cloud save remains authoritative. */ }
    return clone(value);
  }
  async function assertOwner(expectedOwner) {
    if (!validOwner(expectedOwner)) throw fail('REVIEW_PREFERENCES_OWNER', '请先登录后设置动态显示。');
    const result = await supabase.auth.getUser();
    if (result.error || result.data?.user?.id !== expectedOwner) throw fail('REVIEW_PREFERENCES_OWNER', '账号已切换，请重新打开动态设置。');
    return expectedOwner;
  }
  async function fetchReviewPreferences(owner) {
    await assertOwner(owner);
    const started = version(owner);
    const { data, error } = await supabase.from(TABLE).select(SELECT_COLUMNS).eq('user_id', owner).maybeSingle();
    if (error) throw error;
    await assertOwner(owner);
    if (started !== version(owner)) return readCachedReviewPreferences(owner) || parseRow(data);
    return remember(owner, parseRow(data));
  }
  async function saveReviewPreferences(preferences, expectedRevision, owner) {
    const normalized = normalizeReviewPreferences(preferences, { strict: true });
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= MAX_REVISION)) {
      throw fail('REVIEW_PREFERENCES_REVISION', '设置版本无效，请重新读取。');
    }
    await assertOwner(owner);
    const payload = { show_timeline: normalized.showTimeline, currency: normalized.currency,
      event_types: normalized.eventTypes.filter(type => !INDEPENDENT_TYPES.includes(type)),
      ...Object.fromEntries(INDEPENDENT_TYPES.map(type => [`show_${type}`, normalized.eventTypes.includes(type)])),
      revision: (expectedRevision ?? 0) + 1, updated_at: new Date(now()).toISOString() };
    const request = expectedRevision === null
      ? supabase.from(TABLE).insert({ user_id: owner, ...payload })
      : supabase.from(TABLE).update(payload).eq('user_id', owner).eq('revision', expectedRevision);
    const { data, error } = await request.select(SELECT_COLUMNS).maybeSingle();
    await assertOwner(owner);
    if (error && error.code !== '23505') throw error;
    if (!data || error) throw fail('REVIEW_PREFERENCES_CONFLICT', '动态设置已在其他页面修改。请重试以读取最新设置并保存本次选择。');
    versions.set(owner, version(owner) + 1);
    const result = remember(owner, parseRow(data));
    for (const listener of listeners.get(owner) || []) {
      try { listener(clone(result)); } catch { /* An observer cannot undo a confirmed cloud save. */ }
    }
    return result;
  }
  function subscribeReviewPreferences(owner, listener) {
    if (!validOwner(owner) || typeof listener !== 'function') return () => {};
    const group = listeners.get(owner) || new Set(); group.add(listener); listeners.set(owner, group);
    const onStorage = event => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const item = parseCached(event.newValue, owner);
        if (!item) return;
        const known = fresh(cache.get(owner)) ? cache.get(owner) : null;
        if (known && (rank(known.record) > rank(item.record)
          || (rank(known.record) === rank(item.record) && !sameReviewPreferences(known.record.preferences, item.record.preferences)))) return;
        if (!known || rank(known.record) < rank(item.record)) {
          cacheLocally(owner, item);
          versions.set(owner, version(owner) + 1);
        }
        listener(clone(item.record));
      } catch { /* Ignore malformed cross-tab storage. */ }
    };
    eventTarget?.addEventListener?.('storage', onStorage);
    return () => { group.delete(listener); if (!group.size) listeners.delete(owner); eventTarget?.removeEventListener?.('storage', onStorage); };
  }
  return { readCachedReviewPreferences, fetchReviewPreferences, saveReviewPreferences, subscribeReviewPreferences };
}
