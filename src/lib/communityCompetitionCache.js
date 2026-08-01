import {
  readUserScopedJson,
  userScopedStorageKey,
  writeUserScopedJson,
} from './userScopedStorage.js';

export const COMMUNITY_COMPETITION_CACHE_VERSION = 5;
// The server snapshot gate opens at 17:00 New York time. Read ten minutes later
// so the first cron can lock rows; the only full-read retry follows the final
// daily cron. While a visible page is stale, only the four-field completion
// status is polled; the full leaderboard remains marker-driven.
export const COMMUNITY_COMPETITION_PRIMARY_REFRESH_MINUTES = 17 * 60 + 10;
export const COMMUNITY_COMPETITION_RETRY_REFRESH_MINUTES = 19 * 60 + 10;
export const COMMUNITY_COMPETITION_STATUS_POLL_MS = 60_000;

const CACHE_KEY_PREFIX = 'bottomline_community_competition_cache_v1';
const REFRESH_META_KEY_PREFIX = 'bottomline_community_competition_refresh_v1';
const STATUS_CHECK_META_KEY = 'bottomline_community_competition_status_check_v1';
const PUBLICATION_META_KEY = 'bottomline_community_competition_publication_v1';
const INVALIDATION_META_KEY = 'bottomline_community_competition_invalidation_v1';
const CACHE_WRITE_LOCK = 'bottomline-community-competition-cache-v5';
const PERIODS = new Set(['day', 'week', 'month', 'year']);
const VALID_STATES = new Set(['profile_required', 'join_required', 'waiting_snapshot', 'ready']);
const CACHEABLE_STATES = new Set(['waiting_snapshot', 'ready']);
const RETRY_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_REFRESH_ATTEMPTS = 2;
const inFlightRequests = new Map();
const userCacheGenerations = new Map();
let cacheCommitQueue = Promise.resolve();

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

function isTimestamp(value) {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

function isOpaqueVersion(value) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(String(value || ''));
}

function publicationFromData(data) {
  if (data?.state === 'ready') {
    if (!isDateKey(data.asOfDate) || !isOpaqueVersion(data.snapshotVersion) || !isTimestamp(data.snapshotUpdatedAt)) {
      return null;
    }
    return {
      snapshotDate: data.asOfDate,
      version: String(data.snapshotVersion),
      completedAt: data.snapshotUpdatedAt,
    };
  }
  if (data?.state === 'waiting_snapshot') {
    if (
      !isDateKey(data.publishedSnapshotDate)
      || !isOpaqueVersion(data.snapshotVersion)
      || !isTimestamp(data.snapshotUpdatedAt)
    ) return null;
    return {
      snapshotDate: data.publishedSnapshotDate,
      version: String(data.snapshotVersion),
      completedAt: data.snapshotUpdatedAt,
    };
  }
  return null;
}

function normalizePublication(publication) {
  if (
    !isDateKey(publication?.snapshotDate)
    || !isOpaqueVersion(publication?.version)
    || !isTimestamp(publication?.completedAt)
  ) return null;
  return {
    snapshotDate: publication.snapshotDate,
    version: String(publication.version),
    completedAt: publication.completedAt,
  };
}

function timestampFraction(value) {
  const match = String(value || '').match(/:\d{2}(?:\.(\d+))?(?:Z|[+-]\d{2}:?\d{2})$/i);
  return String(match?.[1] || '').padEnd(9, '0').slice(0, 9);
}

// Returns null only for the theoretically ambiguous case where two different
// opaque versions share the exact same database timestamp.
function comparePublications(left, right) {
  const a = normalizePublication(left);
  const b = normalizePublication(right);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a.snapshotDate !== b.snapshotDate) return a.snapshotDate > b.snapshotDate ? 1 : -1;
  const aTime = Date.parse(a.completedAt);
  const bTime = Date.parse(b.completedAt);
  if (aTime !== bTime) return aTime > bTime ? 1 : -1;
  const aFraction = timestampFraction(a.completedAt);
  const bFraction = timestampFraction(b.completedAt);
  if (aFraction !== bFraction) return aFraction > bFraction ? 1 : -1;
  if (a.version === b.version) return 0;
  return null;
}

function samePublication(left, right) {
  const a = normalizePublication(left);
  const b = normalizePublication(right);
  return Boolean(
    a && b
    && a.snapshotDate === b.snapshotDate
    && a.version === b.version
  );
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
  if (state === 'ready' && (
    !isDateKey(data?.asOfDate)
    || !isTimestamp(data?.snapshotUpdatedAt)
    || !isOpaqueVersion(data?.snapshotVersion)
  )) return null;
  if (state === 'waiting_snapshot') {
    const markerValues = [
      data?.publishedSnapshotDate,
      data?.snapshotVersion,
      data?.snapshotUpdatedAt,
    ];
    const hasAnyMarkerValue = markerValues.some((value) => value != null && String(value).trim() !== '');
    if (hasAnyMarkerValue && !publicationFromData({ ...data, state })) return null;
  }
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

function normalizeStatusCheckMeta(statusCheck) {
  if (!statusCheck || !isDateKey(statusCheck.targetDate)) return null;
  const lastCheckedAt = Number(statusCheck.lastCheckedAt);
  if (!Number.isFinite(lastCheckedAt)) return null;
  return { targetDate: statusCheck.targetDate, lastCheckedAt };
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
    statusCheck: normalizeStatusCheckMeta(entry.statusCheck),
    observedPublication: normalizePublication(entry.observedPublication),
  };
}

function refreshMetaBaseKey(period) {
  const normalizedPeriod = normalizePeriod(period);
  return normalizedPeriod ? `${REFRESH_META_KEY_PREFIX}_${normalizedPeriod}` : '';
}

function readRawCommunityCompetitionCache(userId, period) {
  const normalizedUserId = normalizeUserId(userId);
  const baseKey = cacheBaseKey(period);
  if (!normalizedUserId || !baseKey) return null;
  return normalizeEntry(readUserScopedJson(baseKey, normalizedUserId, null), period);
}

function selectLatestPublication(current, candidate) {
  const normalizedCurrent = normalizePublication(current);
  const normalizedCandidate = normalizePublication(candidate);
  if (!normalizedCurrent) return normalizedCandidate;
  if (!normalizedCandidate) return normalizedCurrent;
  const order = comparePublications(normalizedCandidate, normalizedCurrent);
  return order === 1 ? normalizedCandidate : normalizedCurrent;
}

function readLatestObservedPublication(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  let latest = normalizePublication(readUserScopedJson(PUBLICATION_META_KEY, normalizedUserId, null));
  PERIODS.forEach((candidatePeriod) => {
    const entry = readRawCommunityCompetitionCache(normalizedUserId, candidatePeriod);
    latest = selectLatestPublication(latest, publicationFromData(entry?.data));
  });
  return latest;
}

function writeObservedPublicationSync(userId, publication) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPublication = normalizePublication(publication);
  if (!normalizedUserId || !normalizedPublication) return readLatestObservedPublication(normalizedUserId);
  const current = readLatestObservedPublication(normalizedUserId);
  const order = comparePublications(normalizedPublication, current);
  if (current && (order === -1 || order === null)) return current;
  writeUserScopedJson(PUBLICATION_META_KEY, normalizedUserId, normalizedPublication);
  return normalizedPublication;
}

function readRefreshMeta(userId, period) {
  return normalizeRefreshMeta(readUserScopedJson(
    refreshMetaBaseKey(period),
    normalizeUserId(userId),
    null,
  ));
}

function readStatusCheckMeta(userId) {
  return normalizeStatusCheckMeta(readUserScopedJson(
    STATUS_CHECK_META_KEY,
    normalizeUserId(userId),
    null,
  ));
}

export function readCommunityCompetitionCache({ userId, period } = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPeriod = normalizePeriod(period);
  if (!normalizedUserId || !normalizedPeriod) return null;
  const entry = readRawCommunityCompetitionCache(normalizedUserId, normalizedPeriod);
  if (!entry) return null;
  return {
    ...entry,
    refresh: readRefreshMeta(normalizedUserId, normalizedPeriod) || entry.refresh,
    statusCheck: readStatusCheckMeta(normalizedUserId) || entry.statusCheck,
    observedPublication: readLatestObservedPublication(normalizedUserId),
  };
}

function removeUserScopedKey(baseKey, userId) {
  const storageKey = userScopedStorageKey(baseKey, normalizeUserId(userId));
  if (!storageKey || typeof localStorage === 'undefined') return false;
  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
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
  const refresh = mergeAttemptMeta(current.refresh, marker);
  writeUserScopedJson(refreshMetaBaseKey(period), normalizeUserId(userId), refresh);
  return { ...current, refresh };
}

export function recordCommunityCompetitionStatusCheck({ userId, period, now = Date.now() } = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPeriod = normalizePeriod(period);
  if (!normalizedUserId || !normalizedPeriod) return null;
  const window = resolveCommunityCompetitionRefreshWindow(now);
  const statusCheck = {
    targetDate: window.targetDate,
    lastCheckedAt: window.nowMs,
  };
  // Status timing is user-global because the publication marker is shared by
  // every period. Keep it outside leaderboard entries so a metadata write can
  // never overwrite newer ranking data from another tab.
  writeUserScopedJson(STATUS_CHECK_META_KEY, normalizedUserId, statusCheck);
  return readCommunityCompetitionCache({ userId: normalizedUserId, period: normalizedPeriod });
}

export function getCommunityCompetitionSnapshotStatusDecision({ entry, status } = {}) {
  const normalized = normalizeEntry(entry, entry?.period);
  if (!normalized) return { shouldRefresh: false, reason: 'missing_cache' };
  if (status?.state !== 'snapshot_status' || status?.channel !== 'competition') {
    return { shouldRefresh: false, reason: 'invalid_status' };
  }
  const snapshotDate = isDateKey(status.snapshotDate) ? status.snapshotDate : null;
  const version = isOpaqueVersion(status.version) ? String(status.version) : null;
  const completedAt = isTimestamp(status.completedAt) ? status.completedAt : null;
  if (!snapshotDate || !version || !completedAt) {
    return { shouldRefresh: false, reason: 'not_published' };
  }

  const statusPublication = { snapshotDate, version, completedAt };
  const cachedPublication = publicationFromData(normalized.data);
  const publicationOrder = comparePublications(statusPublication, cachedPublication);

  if (samePublication(statusPublication, cachedPublication)) {
    return {
      shouldRefresh: false,
      reason: normalized.data.state === 'ready' ? 'snapshot_current' : 'waiting_status_current',
      snapshotDate,
      version,
    };
  }
  if (cachedPublication && (publicationOrder === -1 || publicationOrder === null)) {
    return { shouldRefresh: false, reason: 'stale_snapshot_status', snapshotDate, version };
  }

  if (normalized.data.state === 'ready') {
    return {
      shouldRefresh: publicationOrder === 1,
      reason: snapshotDate > normalized.data.asOfDate ? 'new_snapshot_date' : 'snapshot_republished',
      snapshotDate,
      version,
    };
  }

  const eligibleAfterDate = isDateKey(normalized.data.eligibleAfterSnapshotDate)
    ? normalized.data.eligibleAfterSnapshotDate
    : null;
  const rankingStartDate = isDateKey(normalized.data.rankingStartSnapshotDate)
    ? normalized.data.rankingStartSnapshotDate
    : null;
  if (eligibleAfterDate && snapshotDate <= eligibleAfterDate) {
    return { shouldRefresh: false, reason: 'waiting_for_eligible_close', snapshotDate, version };
  }
  if (rankingStartDate && snapshotDate < rankingStartDate) {
    return { shouldRefresh: false, reason: 'waiting_for_ranking_start', snapshotDate, version };
  }
  return { shouldRefresh: true, reason: 'waiting_snapshot_published', snapshotDate, version };
}

export function shouldRecordCommunityCompetitionRefreshFailure(error) {
  const code = String(error?.code || '').trim().toUpperCase();
  const name = String(error?.name || '').trim();
  const status = Number(error?.status);
  if (
    code === 'AUTH_REQUIRED'
    || code === 'COMPETITION_CACHE_INVALIDATED'
    || code === 'COMPETITION_CACHE_SUPERSEDED'
  ) return false;
  if (name === 'AbortError') return false;
  if (status === 401 || status === 403) return false;
  if (error instanceof TypeError && !Number.isFinite(status)) return false;
  return true;
}

function writeCommunityCompetitionCacheResult({
  userId,
  period,
  data,
  now = Date.now(),
  marker = null,
  allowUnpublishedWaiting = false,
} = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPeriod = normalizePeriod(period);
  const normalizedData = normalizeData(data, normalizedPeriod);
  if (!normalizedUserId || !normalizedPeriod || !normalizedData) {
    return { entry: null, accepted: false, reason: 'invalid' };
  }
  if (!CACHEABLE_STATES.has(normalizedData.state)) {
    removeCommunityCompetitionPeriodCache(normalizedUserId, normalizedPeriod);
    return { entry: null, accepted: false, reason: 'not_cacheable' };
  }
  const current = readCommunityCompetitionCache({ userId: normalizedUserId, period: normalizedPeriod });
  const incomingPublication = publicationFromData(normalizedData);
  const currentPublication = publicationFromData(current?.data);
  const latestObservedPublication = readLatestObservedPublication(normalizedUserId);
  const incomingVsLatest = comparePublications(incomingPublication, latestObservedPublication);
  const incomingVsCurrent = comparePublications(incomingPublication, currentPublication);
  const staleAgainstAnyPeriod = Boolean(
    latestObservedPublication
    && (!incomingPublication
      ? !(allowUnpublishedWaiting && normalizedData.state === 'waiting_snapshot')
      : incomingVsLatest === -1 || incomingVsLatest === null)
  );
  const staleAgainstCurrent = Boolean(
    currentPublication
    && (!incomingPublication || incomingVsCurrent === -1 || incomingVsCurrent === null)
  );
  const sameCurrentPublication = samePublication(incomingPublication, currentPublication);
  const wouldRegressReady = Boolean(
    current?.data?.state === 'ready'
    && normalizedData.state === 'waiting_snapshot'
    && (sameCurrentPublication || incomingVsCurrent !== 1)
  );
  if (staleAgainstAnyPeriod || staleAgainstCurrent || wouldRegressReady) {
    const refresh = mergeAttemptMeta(current?.refresh, marker || buildAttemptMarker(now));
    if (current) writeUserScopedJson(refreshMetaBaseKey(normalizedPeriod), normalizedUserId, refresh);
    return {
      entry: current ? { ...current, refresh } : null,
      accepted: false,
      reason: 'superseded',
    };
  }
  const nowMs = normalizeNowMs(now);
  const refresh = mergeAttemptMeta(current?.refresh, marker || buildAttemptMarker(nowMs));
  const next = {
    version: COMMUNITY_COMPETITION_CACHE_VERSION,
    period: normalizedPeriod,
    savedAt: nowMs,
    data: normalizedData,
  };
  writeUserScopedJson(cacheBaseKey(normalizedPeriod), normalizedUserId, next);
  writeUserScopedJson(refreshMetaBaseKey(normalizedPeriod), normalizedUserId, refresh);
  if (incomingPublication) writeObservedPublicationSync(normalizedUserId, incomingPublication);
  return {
    entry: readCommunityCompetitionCache({ userId: normalizedUserId, period: normalizedPeriod }),
    accepted: true,
    reason: 'written',
  };
}

export function writeCommunityCompetitionCache(options = {}) {
  return writeCommunityCompetitionCacheResult(options).entry;
}

function withCommunityCompetitionCacheLock(task) {
  const webLocks = globalThis.navigator?.locks;
  if (typeof webLocks?.request === 'function') {
    return webLocks.request(CACHE_WRITE_LOCK, { mode: 'exclusive' }, task);
  }
  const queued = cacheCommitQueue.then(task, task);
  cacheCommitQueue = queued.catch(() => undefined);
  return queued;
}

export function getCommunityCompetitionCacheGeneration(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return '';
  return String(readUserScopedJson(INVALIDATION_META_KEY, normalizedUserId, null)?.token || '');
}

export async function commitCommunityCompetitionCache({ expectedGeneration, ...options } = {}) {
  const normalizedUserId = normalizeUserId(options.userId);
  if (!normalizedUserId) return { entry: null, accepted: false, reason: 'invalid' };
  return withCommunityCompetitionCacheLock(() => {
    if (
      expectedGeneration !== undefined
      && getCommunityCompetitionCacheGeneration(normalizedUserId) !== String(expectedGeneration || '')
    ) {
      return {
        entry: readCommunityCompetitionCache({ userId: normalizedUserId, period: options.period }),
        accepted: false,
        reason: 'invalidated',
      };
    }
    return writeCommunityCompetitionCacheResult({ ...options, userId: normalizedUserId });
  });
}

export async function recordCommunityCompetitionObservedPublication({ userId, publication } = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedPublication = normalizePublication(publication);
  if (!normalizedUserId || !normalizedPublication) return null;
  return withCommunityCompetitionCacheLock(() => (
    writeObservedPublicationSync(normalizedUserId, normalizedPublication)
  ));
}

function clearCommunityCompetitionCacheSync(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;
  invalidateCommunityCompetitionRequests(normalizedUserId);
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  writeUserScopedJson(INVALIDATION_META_KEY, normalizedUserId, { token });
  let removed = false;
  PERIODS.forEach((period) => {
    removed = removeCommunityCompetitionPeriodCache(normalizedUserId, period) || removed;
    removed = removeUserScopedKey(refreshMetaBaseKey(period), normalizedUserId) || removed;
  });
  removed = removeUserScopedKey(STATUS_CHECK_META_KEY, normalizedUserId) || removed;
  return removed;
}

export async function clearCommunityCompetitionCache(userId) {
  return withCommunityCompetitionCacheLock(() => clearCommunityCompetitionCacheSync(userId));
}

export function invalidateCommunityCompetitionRequests(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;
  userCacheGenerations.set(normalizedUserId, (userCacheGenerations.get(normalizedUserId) || 0) + 1);
  return true;
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
  const cachedPublication = publicationFromData(normalized.data);
  const observedPublication = normalizePublication(normalized.observedPublication);
  const observedOrder = comparePublications(observedPublication, cachedPublication);
  let observedPublicationCanRefresh = true;
  if (normalized.data.state === 'waiting_snapshot') {
    const eligibleAfterDate = isDateKey(normalized.data.eligibleAfterSnapshotDate)
      ? normalized.data.eligibleAfterSnapshotDate
      : null;
    const rankingStartDate = isDateKey(normalized.data.rankingStartSnapshotDate)
      ? normalized.data.rankingStartSnapshotDate
      : null;
    const observedStrictlyAhead = Boolean(
      observedPublication
      && !samePublication(observedPublication, cachedPublication)
      && (observedOrder === 1 || observedOrder === null)
    );
    const candidateSnapshotDate = observedStrictlyAhead
      && observedPublication.snapshotDate > window.targetDate
      ? observedPublication.snapshotDate
      : window.targetDate;
    observedPublicationCanRefresh = Boolean(
      observedStrictlyAhead
      && (!eligibleAfterDate || observedPublication.snapshotDate > eligibleAfterDate)
      && (!rankingStartDate || observedPublication.snapshotDate >= rankingStartDate)
    );
    if (
      (eligibleAfterDate && candidateSnapshotDate <= eligibleAfterDate)
      || (rankingStartDate && candidateSnapshotDate < rankingStartDate)
    ) {
      return {
        shouldRefresh: false,
        reason: 'waiting_for_eligible_close',
        nextCheckAt: nextCommunityCompetitionPrimaryRefreshAt(nowMs),
        targetDate: window.targetDate,
      };
    }
  }
  if (
    observedPublicationCanRefresh
    &&
    observedPublication
    && !samePublication(observedPublication, cachedPublication)
    && (observedOrder === 1 || observedOrder === null)
  ) {
    return {
      shouldRefresh: true,
      reason: 'observed_publication_advanced',
      nextCheckAt: nowMs,
      targetDate: window.targetDate,
      snapshotDate: observedPublication.snapshotDate,
      version: observedPublication.version,
    };
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
  const statusCheck = normalized.statusCheck;
  // A waiting entry can exhaust its two full-read attempts before a durable
  // marker is published. It must still start the lightweight status poll;
  // otherwise a marker written later leaves a visible PWA asleep until the
  // next New York close window. Eligibility/ranking gates above continue to
  // prevent an ineligible member from triggering a full leaderboard read.
  if (
    normalized.data.state === 'waiting_snapshot'
    && normalized.refresh?.targetDate === window.targetDate
    && normalized.refresh.attempts >= MAX_REFRESH_ATTEMPTS
    && (!statusCheck || statusCheck.targetDate !== window.targetDate)
  ) {
    return {
      shouldRefresh: true,
      reason: 'status_poll_uninitialized',
      nextCheckAt: nowMs,
      targetDate: window.targetDate,
    };
  }
  if (statusCheck?.targetDate === window.targetDate) {
    const nextStatusCheckAt = statusCheck.lastCheckedAt + COMMUNITY_COMPETITION_STATUS_POLL_MS;
    if (nowMs < nextStatusCheckAt) {
      return {
        shouldRefresh: false,
        reason: 'status_poll_wait',
        nextCheckAt: nextStatusCheckAt,
        targetDate: window.targetDate,
      };
    }
    return {
      shouldRefresh: true,
      reason: 'status_poll_due',
      nextCheckAt: nowMs,
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
  const persistentGeneration = getCommunityCompetitionCacheGeneration(normalizedUserId);
  const key = requestKey(normalizedUserId, normalizedPeriod, generation);
  if (inFlightRequests.has(key)) return inFlightRequests.get(key);
  const request = Promise.resolve()
    .then(() => fetcher())
    .then(async (data) => {
      if ((userCacheGenerations.get(normalizedUserId) || 0) !== generation) {
        const error = new Error('COMPETITION_CACHE_INVALIDATED');
        error.code = 'COMPETITION_CACHE_INVALIDATED';
        throw error;
      }
      const normalizedData = normalizeData(data, normalizedPeriod);
      if (!normalizedData) throw new Error('INVALID_COMPETITION_STATE');
      const committed = await commitCommunityCompetitionCache({
        userId: normalizedUserId,
        period: normalizedPeriod,
        data: normalizedData,
        now: requestNow,
        marker,
        expectedGeneration: persistentGeneration,
      });
      if (!committed.entry) {
        const error = new Error('COMPETITION_CACHE_SUPERSEDED');
        error.code = committed.reason === 'invalidated'
          ? 'COMPETITION_CACHE_INVALIDATED'
          : 'COMPETITION_CACHE_SUPERSEDED';
        throw error;
      }
      return {
        data: committed.entry.data,
        entry: committed.entry,
        accepted: committed.accepted,
      };
    })
    .catch((error) => {
      if (
        (userCacheGenerations.get(normalizedUserId) || 0) === generation
        && shouldRecordCommunityCompetitionRefreshFailure(error)
      ) {
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
