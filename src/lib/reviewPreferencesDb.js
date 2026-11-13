import { normalizeReviewPreferences, REVIEW_ALWAYS_PIN_KEYS, sameReviewPreferences } from './reviewPreferences.js';

const TABLE = 'review_display_preferences';
// Keep pin state separate from already installed clients' timeline-only cache.
const LEGACY_STORAGE_KEY = 'bottomline_review_display_preferences_v3';
const STORAGE_KEY = 'bottomline_review_display_preferences_v4';
const INDEPENDENT_TYPES = ['return_drawdown', 'annual_return_high', 'annual_return_low', 'annual_pnl_high', 'annual_pnl_low', 'stock_daily_record'];
const TIMELINE_COLUMNS = ['show_timeline', 'currency', 'event_types', ...INDEPENDENT_TYPES.map(type => `show_${type}`), 'revision', 'updated_at'].join(',');
const PIN_COLUMNS = { alwaysPinnedLogId: 'always_pinned_log_id', alwaysPinnedInsightId: 'always_pinned_insight_id' };
const SELECT_COLUMNS = [TIMELINE_COLUMNS, ...Object.values(PIN_COLUMNS)].join(',');
const MAX_CACHE_AGE = 30 * 86400000;
const MAX_REVISION = 2147483647;
const validOwner = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(value);
const fail = (code, message) => Object.assign(new Error(message), { code });
const clone = value => ({ ...value, preferences: { ...value.preferences, eventTypes: [...value.preferences.eventTypes] } });
function defaultStorage() { try { return globalThis.localStorage || null; } catch { return null; } }
const missingAlwaysPinColumn = error => ['42703', 'PGRST204'].includes(error?.code)
  && Object.values(PIN_COLUMNS).some(column => error.message?.includes(column));
function parseRow(row, alwaysPinSupported) {
  if (!row) return { preferences: normalizeReviewPreferences(null), revision: null, exists: false, updatedAt: null, alwaysPinSupported };
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
  const pins = alwaysPinSupported ? Object.fromEntries(REVIEW_ALWAYS_PIN_KEYS.map(key => [key, row[PIN_COLUMNS[key]]])) : {};
  return { preferences: normalizeReviewPreferences({ showTimeline: row.show_timeline, currency: row.currency, eventTypes, ...pins }, { strict: true }),
    revision: row.revision, exists: true, updatedAt: row.updated_at, alwaysPinSupported };
}

/** A dedicated owner row avoids legacy user_settings whole-document saves. */
export function createReviewPreferencesRepository({ supabase, storage = defaultStorage(), now = Date.now, eventTarget = globalThis.window } = {}) {
  const cache = new Map(), versions = new Map(), listeners = new Map();
  const version = owner => versions.get(owner) || 0;
  const rank = record => record?.revision ?? -1;
  const fresh = item => item && Number.isSafeInteger(item.savedAt) && item.savedAt <= now() && now() - item.savedAt <= MAX_CACHE_AGE;
  function parseCached(raw, owner, schemaVersion = 4) {
    try {
      if (!raw || raw.length > 4096) return null;
      const item = JSON.parse(raw);
      if (item?.version !== schemaVersion || item.ownerId !== owner || !fresh(item)) return null;
      const record = item.record;
      if (!record || (schemaVersion === 4 && typeof record.alwaysPinSupported !== 'boolean') || (record.exists !== true && record.exists !== false)
        || (record.exists ? !Number.isSafeInteger(record.revision) || record.revision < 0 || record.revision > MAX_REVISION : record.revision !== null)
        || (record.exists ? typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt)) : record.updatedAt !== null)) return null;
      const alwaysPinSupported = schemaVersion === 4 && record.alwaysPinSupported;
      const preferences = alwaysPinSupported ? record.preferences
        : { ...record.preferences, alwaysPinnedLogId: null, alwaysPinnedInsightId: null };
      const checked = { preferences: normalizeReviewPreferences(preferences, { strict: true }), revision: record.revision,
        exists: record.exists, updatedAt: record.updatedAt, alwaysPinSupported };
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
    const storedIsNewer = stored && (!known || rank(stored.record) > rank(known.record)
      || (rank(stored.record) === rank(known.record) && stored.record.alwaysPinSupported && !known.record.alwaysPinSupported));
    const selected = storedIsNewer ? stored : known;
    // An older app can still supply a cached timeline first paint, but can never
    // report confirmed pin choices or replace a preference record of this version.
    if (!selected) {
      try {
        const legacy = parseCached(storage?.getItem(LEGACY_STORAGE_KEY), owner, 3);
        return legacy ? clone(legacy.record) : null;
      } catch { return null; }
    }
    cacheLocally(owner, selected);
    return clone(selected.record);
  }
  function remember(owner, record) {
    const known = readCachedReviewPreferences(owner);
    // Out-of-order reads must not roll back a newer revision from any tab.
    if (known && rank(known) > rank(record)) return known;
    const value = clone(record), savedAt = now();
    cacheLocally(owner, { record: value, savedAt });
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 4, ownerId: owner, savedAt, record: value })); } catch { /* Optional cache; cloud save remains authoritative. */ }
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
    const read = columns => supabase.from(TABLE).select(columns).eq('user_id', owner).maybeSingle();
    let result = await read(SELECT_COLUMNS);
    const alwaysPinSupported = !missingAlwaysPinColumn(result.error);
    if (!alwaysPinSupported) {
      await assertOwner(owner);
      result = await read(TIMELINE_COLUMNS);
    }
    if (result.error) throw result.error;
    await assertOwner(owner);
    const record = parseRow(result.data, alwaysPinSupported);
    if (started !== version(owner)) return readCachedReviewPreferences(owner) || record;
    return remember(owner, record);
  }
  async function saveReviewPreferences(preferences, expectedRevision, owner, { alwaysPinKeys = [], pinOnly = false } = {}) {
    const normalized = normalizeReviewPreferences(preferences, { strict: true });
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= MAX_REVISION)) {
      throw fail('REVIEW_PREFERENCES_REVISION', '设置版本无效，请重新读取。');
    }
    if (!Array.isArray(alwaysPinKeys) || alwaysPinKeys.some(key => !REVIEW_ALWAYS_PIN_KEYS.includes(key) || !Object.hasOwn(preferences, key))) {
      throw fail('REVIEW_PREFERENCES_INVALID', '动态置顶设置格式无效，请重新选择。');
    }
    await assertOwner(owner);
    const payload = { revision: (expectedRevision ?? 0) + 1, updated_at: new Date(now()).toISOString() };
    if (!pinOnly || !alwaysPinKeys.length) {
      payload.show_timeline = normalized.showTimeline;
      payload.currency = normalized.currency;
      payload.event_types = normalized.eventTypes.filter(type => !INDEPENDENT_TYPES.includes(type));
      for (const type of INDEPENDENT_TYPES) payload[`show_${type}`] = normalized.eventTypes.includes(type);
    }
    const save = (columns, values) => {
      const request = expectedRevision === null
        ? supabase.from(TABLE).insert({ user_id: owner, ...values })
        : supabase.from(TABLE).update(values).eq('user_id', owner).eq('revision', expectedRevision);
      return request.select(columns).maybeSingle();
    };
    const pins = Object.fromEntries(alwaysPinKeys.map(key => [PIN_COLUMNS[key], normalized[key]]));
    let result = await save(SELECT_COLUMNS, { ...payload, ...pins });
    const alwaysPinSupported = !missingAlwaysPinColumn(result.error);
    if (!alwaysPinSupported) {
      if (alwaysPinKeys.length) throw fail('REVIEW_ALWAYS_PIN_UNAVAILABLE', '始终置顶暂不可用，请稍后重试。');
      // An undefined-column error rejects the whole statement. Retry only
      // ordinary display settings, with the original owner and revision guard.
      await assertOwner(owner);
      result = await save(TIMELINE_COLUMNS, payload);
    }
    const { data, error } = result;
    await assertOwner(owner);
    if (error && error.code !== '23505') throw error;
    if (!data || error) throw fail('REVIEW_PREFERENCES_CONFLICT', '动态设置已在其他页面修改。请重试以读取最新设置并保存本次选择。');
    versions.set(owner, version(owner) + 1);
    const saved = remember(owner, parseRow(data, alwaysPinSupported));
    for (const listener of listeners.get(owner) || []) {
      try { listener(clone(saved)); } catch { /* An observer cannot undo a confirmed cloud save. */ }
    }
    return saved;
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
        const sameRevision = known && rank(known.record) === rank(item.record);
        const learnedPinSupport = sameRevision && item.record.alwaysPinSupported && !known.record.alwaysPinSupported;
        if (known && (rank(known.record) > rank(item.record)
          || (sameRevision && !learnedPinSupport && (known.record.alwaysPinSupported !== item.record.alwaysPinSupported
            || !sameReviewPreferences(known.record.preferences, item.record.preferences))))) return;
        if (!known || rank(known.record) < rank(item.record) || learnedPinSupport) {
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
