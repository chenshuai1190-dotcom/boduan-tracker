import {
  readUserScopedJson,
  userScopedStorageKey,
  writeUserScopedJson,
} from './userScopedStorage.js';

export const COMMUNITY_COMPETITION_CACHE_VERSION = 1;
// The server snapshot gate opens at 17:00 New York time. Read ten minutes later
// so the first cron can lock rows; the only retry follows the final daily cron.
export const COMMUNITY_COMPETITION_PRIMARY_REFRESH_MINUTES = 17 * 60 + 10;
export const COMMUNITY_COMPETITION_RETRY_REFRESH_MINUTES = 19 * 60 + 10;

const CACHE_KEY_PREFIX = 'bottomline_community_competition_cache_v1';
const PERIODS = new Set(['day', 'week', 'month', 'year']);
const VALID_STATES = new Set(['profile_required', 'join_required', 'waiting_snapshot', 'ready']);
const CACHEABLE_STATES = new Set(['waiting_snapshot', 'ready']);
const RETRY_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_REFRESH_ATTEMPTS = 2;
const inFlightRequests = new Map();
const userCacheGenerations = new Map();

function normalizePeriod(period) {
  const normalized = String(period || '').trim().toLowerCase();
  return PERIODS.has(normalized) ? normalized : null;
}

function normalizeUserId(userId) {
  return String(userId || '').trim();
}

function normalizeNowMs(now = Date.now()) {
  const value = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOfDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? -1 : date.getUTCDay();
}

function isWeekday(dateKey) {
  const weekday = weekdayOfDateKey(dateKey);
  return weekday >= 1 && weekday <= 5;
}

function previousWeekday(dateKey) {
  let cursor = shiftDate(dateKey, -1);
  while (cursor && !isWeekday(cursor)) cursor = shiftDate(cursor, -1);
  return cursor;
}

function nextWeekday(dateKey) {
  let cursor = shiftDate(dateKey, 1);
  while (cursor && !isWeekday(cursor)) cursor = shiftDate(cursor, 1);
  return cursor;
}

function getNewYorkDateParts(nowMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(nowMs));
    const part = (type) => parts.find((item) => item.type === type)?.value || '';
    const dateKey = `${part('year')}-${part('month')}-${part('day')}`;
    const hour = Number(part('hour'));
    const minute = Number(part('minute'));
    const second = Number(part('second'));
    if (!isDateKey(dateKey) || !Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error('invalid clock');
    return {
      dateKey,
      minutes: hour * 60 + minute,
      seconds: Number.isFinite(second) ? second : 0,
    };
  } catch {
    const fallback = new Date(nowMs);
    return {
      dateKey: fallback.toISOString().slice(0, 10),
      minutes: fallback.getUTCHours() * 60 + fallback.getUTCMinutes(),
      seconds: fallback.getUTCSeconds(),
    };
  }
}

function newYorkOffsetMinutes(dateKey) {
  try {
    const noonUtc = new Date(`${dateKey}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'longOffset',
    }).formatToParts(noonUtc);
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value || '';
    const match = offset.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (match) {
      const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
      return match[1] === '-' ? -minutes : minutes;
    }
    const zonedParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(noonUtc);
    const value = (type) => Number(zonedParts.find((part) => part.type === type)?.value);
    const zonedAsUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour'),
      value('minute'),
      value('second'),
    );
    return Number.isFinite(zonedAsUtc) ? Math.round((zonedAsUtc - noonUtc.getTime()) / 60_000) : null;
  } catch {
    return null;
  }
}

function newYorkTimestamp(dateKey, minutesAfterMidnight) {
  if (!isDateKey(dateKey)) return null;
  const offsetMinutes = newYorkOffsetMinutes(dateKey);
  if (!Number.isFinite(offsetMinutes)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const hour = Math.floor(minutesAfterMidnight / 60);
  const minute = minutesAfterMidnight % 60;
  return Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60 * 1000;
}

export function resolveCommunityCompetitionRefreshWindow(now = Date.now()) {
  const nowMs = normalizeNowMs(now);
  const parts = getNewYorkDateParts(nowMs);
  const todayPrimaryAt = newYorkTimestamp(parts.dateKey, COMMUNITY_COMPETITION_PRIMARY_REFRESH_MINUTES);
  const targetDate = isWeekday(parts.dateKey) && Number.isFinite(todayPrimaryAt) && nowMs >= todayPrimaryAt
    ? parts.dateKey
    : previousWeekday(parts.dateKey);
  const primaryAt = newYorkTimestamp(targetDate, COMMUNITY_COMPETITION_PRIMARY_REFRESH_MINUTES);
  const retryAt = newYorkTimestamp(targetDate, COMMUNITY_COMPETITION_RETRY_REFRESH_MINUTES);
  return {
    nowMs,
    targetDate,
    primaryAt,
    retryAt,
    stage: Number.isFinite(retryAt) && nowMs >= retryAt ? 2 : 1,
  };
}

export function nextCommunityCompetitionPrimaryRefreshAt(now = Date.now()) {
  const nowMs = normalizeNowMs(now);
  const parts = getNewYorkDateParts(nowMs);
  const todayPrimaryAt = newYorkTimestamp(parts.dateKey, COMMUNITY_COMPETITION_PRIMARY_REFRESH_MINUTES);
  if (isWeekday(parts.dateKey) && Number.isFinite(todayPrimaryAt) && nowMs < todayPrimaryAt) {
    return todayPrimaryAt;
  }
  const nextDate = nextWeekday(parts.dateKey);
  return newYorkTimestamp(nextDate, COMMUNITY_COMPETITION_PRIMARY_REFRESH_MINUTES);
}

function cacheBaseKey(period) {
  const normalizedPeriod = normalizePeriod(period);
  return normalizedPeriod ? `${CACHE_KEY_PREFIX}_${normalizedPeriod}` : '';
}

function normalizeData(data, period) {
  const normalizedPeriod = normalizePeriod(period);
  const state = String(data?.state || '');
  if (!normalizedPeriod || !VALID_STATES.has(state)) return null;
  if (data?.period && normalizePeriod(data.period) !== normalizedPeriod) return null;
  if (state === 'ready' && !isDateKey(data?.asOfDate)) return null;
  return { ...data, period: normalizedPeriod };
}

function normalizeRefreshMeta(refresh) {
  if (!refresh || !isDateKey(refresh.targetDate)) return null;
  const attempts = Math.trunc(Number(refresh.attempts));
  const lastAttemptAt = Number(refresh.lastAttemptAt);
  if (!Number.isFinite(attempts) || attempts < 1 || !Number.isFinite(lastAttemptAt)) return null;
  return {
    targetDate: refresh.targetDate,
    attempts: Math.min(MAX_REFRESH_ATTEMPTS, attempts),
    lastAttemptAt,
  };
}

function normalizeEntry(entry, period) {
  const normalizedPeriod = normalizePeriod(period);
  const data = normalizeData(entry?.data, normalizedPeriod);
  const savedAt = Number(entry?.savedAt);
  if (
    entry?.version !== COMMUNITY_COMPETITION_CACHE_VERSION
    || entry?.period !== normalizedPeriod
    || !CACHEABLE_STATES.has(data?.state)
    || !Number.isFinite(savedAt)
  ) return null;
  return {
    version: COMMUNITY_COMPETITION_CACHE_VERSION,
    period: normalizedPeriod,
    savedAt,
    data,
    refresh: normalizeRefreshMeta(entry.refresh),
  };
}

export function readCommunityCompetitionCache({ userId, period } = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const baseKey = cacheBaseKey(period);
  if (!normalizedUserId || !baseKey) return null;
  return normalizeEntry(readUserScopedJson(baseKey, normalizedUserId, null), period);
}

function removeCommunityCompetitionPeriodCache(userId, period) {
  const normalizedUserId = normalizeUserId(userId);
  const baseKey = cacheBaseKey(period);
  if (!normalizedUserId || !baseKey || typeof localStorage === 'undefined') return false;
  const storageKey = userScopedStorageKey(baseKey, normalizedUserId);
  if (!storageKey) return false;
  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

function buildAttemptMarker(now = Date.now()) {
  const window = resolveCommunityCompetitionRefreshWindow(now);
  return {
    targetDate: window.targetDate,
    stage: window.stage,
    lastAttemptAt: window.nowMs,
  };
}

function mergeAttemptMeta(currentRefresh, marker) {
  if (!marker || !isDateKey(marker.targetDate)) return normalizeRefreshMeta(currentRefresh);
  const previous = normalizeRefreshMeta(currentRefresh);
  const sameTarget = previous?.targetDate === marker.targetDate;
  const attempts = sameTarget
    ? Math.min(MAX_REFRESH_ATTEMPTS, Math.max(Number(marker.stage) || 1, previous.attempts + 1))
    : Math.min(MAX_REFRESH_ATTEMPTS, Math.max(1, Number(marker.stage) || 1));
  return {
    targetDate: marker.targetDate,
    attempts,
    lastAttemptAt: Number(marker.lastAttemptAt),
  };
}

function recordCommunityCompetitionAttempt({ userId, period, marker } = {}) {
  const current = readCommunityCompetitionCache({ userId, period });
  if (!current) return null;
  const next = { ...current, refresh: mergeAttemptMeta(current.refresh, marker) };
  writeUserScopedJson(cacheBaseKey(period), normalizeUserId(userId), next);
  return next;
}

export function writeCommunityCompetitionCache({ userId, period, data, now = Date.now(), marker = null } = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPeriod = normalizePeriod(period);
  const normalizedData = normalizeData(data, normalizedPeriod);
  if (!normalizedUserId || !normalizedPeriod || !normalizedData) return null;
  if (!CACHEABLE_STATES.has(normalizedData.state)) {
    removeCommunityCompetitionPeriodCache(normalizedUserId, normalizedPeriod);
    return null;
  }
  const current = readCommunityCompetitionCache({ userId: normalizedUserId, period: normalizedPeriod });
  if (
    current?.data?.state === 'ready'
    && normalizedData.state === 'ready'
    && String(normalizedData.asOfDate) < String(current.data.asOfDate)
  ) {
    const preserved = {
      ...current,
      refresh: mergeAttemptMeta(current.refresh, marker || buildAttemptMarker(now)),
    };
    writeUserScopedJson(cacheBaseKey(normalizedPeriod), normalizedUserId, preserved);
    return preserved;
  }
  const nowMs = normalizeNowMs(now);
  const next = {
    version: COMMUNITY_COMPETITION_CACHE_VERSION,
    period: normalizedPeriod,
    savedAt: nowMs,
    data: normalizedData,
    refresh: mergeAttemptMeta(current?.refresh, marker || buildAttemptMarker(nowMs)),
  };
  writeUserScopedJson(cacheBaseKey(normalizedPeriod), normalizedUserId, next);
  return next;
}

export function clearCommunityCompetitionCache(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;
  userCacheGenerations.set(normalizedUserId, (userCacheGenerations.get(normalizedUserId) || 0) + 1);
  let removed = false;
  PERIODS.forEach((period) => {
    removed = removeCommunityCompetitionPeriodCache(normalizedUserId, period) || removed;
  });
  return removed;
}

export function getCommunityCompetitionRefreshDecision({ entry, now = Date.now() } = {}) {
  const nowMs = normalizeNowMs(now);
  if (!entry) {
    return { shouldRefresh: true, reason: 'missing_cache', nextCheckAt: nowMs };
  }
  const normalized = normalizeEntry(entry, entry.period);
  if (!normalized) {
    return { shouldRefresh: true, reason: 'invalid_cache', nextCheckAt: nowMs };
  }
  const window = resolveCommunityCompetitionRefreshWindow(nowMs);
  if (normalized.data.state === 'waiting_snapshot') {
    const eligibleAfterDate = isDateKey(normalized.data.eligibleAfterSnapshotDate)
      ? normalized.data.eligibleAfterSnapshotDate
      : null;
    const rankingStartDate = isDateKey(normalized.data.rankingStartSnapshotDate)
      ? normalized.data.rankingStartSnapshotDate
      : null;
    if (
      (eligibleAfterDate && window.targetDate <= eligibleAfterDate)
      || (rankingStartDate && window.targetDate < rankingStartDate)
    ) {
      return {
        shouldRefresh: false,
        reason: 'waiting_for_eligible_close',
        nextCheckAt: nextCommunityCompetitionPrimaryRefreshAt(nowMs),
        targetDate: window.targetDate,
      };
    }
  }
  const snapshotCurrent = normalized.data.state === 'ready'
    && isDateKey(normalized.data.asOfDate)
    && normalized.data.asOfDate >= window.targetDate;
  if (snapshotCurrent) {
    return {
      shouldRefresh: false,
      reason: 'snapshot_current',
      nextCheckAt: nextCommunityCompetitionPrimaryRefreshAt(nowMs),
      targetDate: window.targetDate,
    };
  }
  const refresh = normalized.refresh;
  if (!refresh || refresh.targetDate !== window.targetDate) {
    return { shouldRefresh: true, reason: 'new_refresh_window', nextCheckAt: nowMs, targetDate: window.targetDate };
  }
  if (refresh.attempts >= MAX_REFRESH_ATTEMPTS) {
    return {
      shouldRefresh: false,
      reason: 'attempt_limit',
      nextCheckAt: nextCommunityCompetitionPrimaryRefreshAt(nowMs),
      targetDate: window.targetDate,
    };
  }
  const retryDueAt = Math.max(window.retryAt || nowMs, refresh.lastAttemptAt + RETRY_COOLDOWN_MS);
  if (nowMs >= retryDueAt) {
    return { shouldRefresh: true, reason: 'bounded_retry', nextCheckAt: nowMs, targetDate: window.targetDate };
  }
  return { shouldRefresh: false, reason: 'retry_wait', nextCheckAt: retryDueAt, targetDate: window.targetDate };
}

function requestKey(userId, period, generation) {
  return `${normalizeUserId(userId)}:${normalizePeriod(period) || ''}:${generation}`;
}

export function requestCommunityCompetitionRefresh({ userId, period, now = Date.now(), fetcher } = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPeriod = normalizePeriod(period);
  if (!normalizedUserId || !normalizedPeriod || typeof fetcher !== 'function') {
    return Promise.reject(new Error('INVALID_COMPETITION_REFRESH_REQUEST'));
  }
  const requestNow = normalizeNowMs(now);
  const marker = buildAttemptMarker(requestNow);
  const generation = userCacheGenerations.get(normalizedUserId) || 0;
  const key = requestKey(normalizedUserId, normalizedPeriod, generation);
  if (inFlightRequests.has(key)) return inFlightRequests.get(key);
  const request = Promise.resolve()
    .then(() => fetcher())
    .then((data) => {
      if ((userCacheGenerations.get(normalizedUserId) || 0) !== generation) {
        const error = new Error('COMPETITION_CACHE_INVALIDATED');
        error.code = 'COMPETITION_CACHE_INVALIDATED';
        throw error;
      }
      const normalizedData = normalizeData(data, normalizedPeriod);
      if (!normalizedData) throw new Error('INVALID_COMPETITION_STATE');
      const entry = writeCommunityCompetitionCache({
        userId: normalizedUserId,
        period: normalizedPeriod,
        data: normalizedData,
        now: requestNow,
        marker,
      });
      return { data: entry?.data || normalizedData, entry };
    })
    .catch((error) => {
      if ((userCacheGenerations.get(normalizedUserId) || 0) === generation) {
        recordCommunityCompetitionAttempt({ userId: normalizedUserId, period: normalizedPeriod, marker });
      }
      throw error;
    })
    .finally(() => {
      if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
    });
  inFlightRequests.set(key, request);
  return request;
}
