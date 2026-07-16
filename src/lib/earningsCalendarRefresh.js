import {
  classifyEarningsResult,
  dateKey,
  EARNINGS_PUBLISHED_RETENTION_DAYS,
  isEarningsPublished,
  normalizeEarningsSession,
  normalizeEarningsSymbol,
} from './earningsCalendarModel.js';

export const EARNINGS_CALENDAR_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const EARNINGS_CALENDAR_RESUME_DEDUPE_MS = 1200;
export const EARNINGS_CALENDAR_VISIBLE_RETRY_MS = 120;
export const EARNINGS_CALENDAR_VISIBLE_RETRY_MAX_MS = 6000;
export const EARNINGS_CALENDAR_MAX_VISIBLE_POLLS = 12;

const NEW_YORK_TIME_ZONE = 'America/New_York';
const UNKNOWN_SESSION_REFRESH_MINUTE = 6 * 60;
const POST_SESSION_REFRESH_MINUTE = 16 * 60;
const MARKET_CLOSE_REFRESH_MINUTE = 16 * 60;
const refreshRequestsByKey = new Map();
const refreshAttemptsByBatch = new Map();

const newYorkDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function resolveNowMs(now = Date.now) {
  const value = typeof now === 'function' ? now() : now;
  const numeric = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(numeric) ? numeric : Date.now();
}

function addUtcDays(value, days) {
  const key = dateKey(value);
  if (!key) return '';
  const result = new Date(`${key}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + Number(days || 0));
  return result.toISOString().slice(0, 10);
}

function isWeekend(value) {
  const key = dateKey(value);
  if (!key) return false;
  const day = new Date(`${key}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function nextPossibleWeekday(value, { includeCurrent = false } = {}) {
  let result = dateKey(value);
  if (!result) return '';
  if (!includeCurrent) result = addUtcDays(result, 1);
  while (isWeekend(result)) result = addUtcDays(result, 1);
  return result;
}

function addPossibleWeekdays(value, days) {
  let result = dateKey(value);
  let remaining = Math.max(0, Math.trunc(Number(days) || 0));
  while (result && remaining > 0) {
    result = addUtcDays(result, 1);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
}

export function getNewYorkEarningsClock(now = Date.now) {
  const parts = Object.fromEntries(
    newYorkDateTimeFormatter
      .formatToParts(new Date(resolveNowMs(now)))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const hour = Math.min(23, Math.max(0, Number(parts.hour) || 0));
  const minute = Math.min(59, Math.max(0, Number(parts.minute) || 0));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute,
    second: Math.min(59, Math.max(0, Number(parts.second) || 0)),
    minuteOfDay: hour * 60 + minute,
  };
}

function isDueOnReportDate(event, clock) {
  const session = normalizeEarningsSession(event?.session ?? event?.before_after_market ?? event?.beforeAfterMarket);
  if (session === 'post') return clock.minuteOfDay >= POST_SESSION_REFRESH_MINUTE;
  if (session === 'unknown') return clock.minuteOfDay >= UNKNOWN_SESSION_REFRESH_MINUTE;
  return true;
}

function hasMarketReaction(event) {
  const value = event?.marketReactionPercent;
  return value !== null
    && value !== undefined
    && String(value).trim() !== ''
    && Number.isFinite(Number(value));
}

function hasActualRevenue(event) {
  return [event?.revenueActualUsd, event?.revenueActual].some((value) => (
    value !== null
    && value !== undefined
    && String(value).trim() !== ''
    && Number.isFinite(Number(value))
  ));
}

function isPublishedRevenueRefreshDue(event, reportDate, clock) {
  if (hasActualRevenue(event)) return false;
  if (clock.date > addUtcDays(reportDate, EARNINGS_PUBLISHED_RETENTION_DAYS)) return false;
  if (clock.date === reportDate && !isDueOnReportDate(event, clock)) return false;
  return true;
}

function getMarketReactionCloseDate(event, reportDate) {
  const session = normalizeEarningsSession(event?.session ?? event?.before_after_market ?? event?.beforeAfterMarket);
  if (session === 'post') return nextPossibleWeekday(reportDate);
  return nextPossibleWeekday(reportDate, { includeCurrent: true });
}

function isMarketReactionRefreshDue(event, reportDate, clock) {
  if (hasMarketReaction(event)) return false;
  const closeDate = getMarketReactionCloseDate(event, reportDate);
  if (!closeDate || clock.date < closeDate) return false;
  if (clock.date === closeDate && clock.minuteOfDay < MARKET_CLOSE_REFRESH_MINUTE) return false;
  return clock.date <= addPossibleWeekdays(closeDate, EARNINGS_PUBLISHED_RETENTION_DAYS);
}

export function getEarningsRefreshCandidates(events = [], now = Date.now) {
  const clock = getNewYorkEarningsClock(now);
  const oldestDate = addUtcDays(clock.date, -EARNINGS_PUBLISHED_RETENTION_DAYS);
  const candidates = [];
  const seen = new Set();

  for (const event of Array.isArray(events) ? events : []) {
    if (!event) continue;
    const reportDate = dateKey(event.reportDate || event.report_date || event.date);
    const symbol = normalizeEarningsSymbol(event.symbol || event.code || event.ticker);
    if (!reportDate || !symbol || reportDate > clock.date) continue;
    if (isEarningsPublished(event)) {
      const needsRevenue = isPublishedRevenueRefreshDue(event, reportDate, clock);
      const needsMarketReaction = isMarketReactionRefreshDue(event, reportDate, clock);
      if (!needsRevenue && !needsMarketReaction) continue;
    } else {
      if (reportDate < oldestDate) continue;
      if (reportDate === clock.date && !isDueOnReportDate(event, clock)) continue;
    }
    const key = `${symbol}|${reportDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(event);
  }

  return candidates;
}

export function buildEarningsRefreshBatch(events = [], now = Date.now) {
  const candidates = getEarningsRefreshCandidates(events, now);
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((left, right) => {
    const leftDate = dateKey(left?.reportDate || left?.report_date || left?.date);
    const rightDate = dateKey(right?.reportDate || right?.report_date || right?.date);
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return normalizeEarningsSymbol(left?.symbol || left?.code).localeCompare(normalizeEarningsSymbol(right?.symbol || right?.code));
  });
  const symbols = Array.from(new Set(sorted.map((event) => normalizeEarningsSymbol(event?.symbol || event?.code)).filter(Boolean)));
  const dates = sorted.map((event) => dateKey(event?.reportDate || event?.report_date || event?.date)).filter(Boolean);
  return {
    events: sorted,
    symbols,
    from: dates[0],
    to: dates[dates.length - 1],
    key: sorted.map((event) => [
      normalizeEarningsSymbol(event?.symbol || event?.code),
      dateKey(event?.reportDate || event?.report_date || event?.date),
      normalizeEarningsSession(event?.session ?? event?.before_after_market ?? event?.beforeAfterMarket),
    ].join(':')).join(','),
  };
}

function earningsEventKey(event) {
  const symbol = normalizeEarningsSymbol(event?.symbol || event?.code || event?.ticker);
  const reportDate = dateKey(event?.reportDate || event?.report_date || event?.date);
  return symbol && reportDate ? `${symbol}|${reportDate}` : '';
}

function isMissingActualFieldValue(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function isActualResultField(key) {
  return (key.startsWith('epsActual') && key !== 'epsActualYoyPercent')
    || (key.startsWith('revenueActual') && !/(Yoy|Surprise)/i.test(key))
    || key.startsWith('revenuePreviousYear')
    || key.startsWith('marketReaction');
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateDifference(actualValue, estimateValue) {
  const actual = numericOrNull(actualValue);
  const estimate = numericOrNull(estimateValue);
  return actual === null || estimate === null ? null : actual - estimate;
}

function calculateSurprisePercent(actualValue, estimateValue) {
  const actual = numericOrNull(actualValue);
  const estimate = numericOrNull(estimateValue);
  if (actual === null || estimate === null || estimate === 0) return null;
  return ((actual - estimate) / Math.abs(estimate)) * 100;
}

function calculateYearOverYearPercent(currentValue, previousValue) {
  const current = numericOrNull(currentValue);
  const previous = numericOrNull(previousValue);
  if (current === null || !(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}

function recalculateEarningsDerivedFields(event) {
  const recalculated = {
    ...event,
    epsDifference: calculateDifference(event?.epsActual, event?.epsEstimate),
    surprisePercent: calculateSurprisePercent(event?.epsActual, event?.epsEstimate),
    epsActualYoyPercent: calculateYearOverYearPercent(event?.epsActual, event?.epsPreviousYear),
    epsEstimateYoyPercent: calculateYearOverYearPercent(event?.epsEstimate, event?.epsPreviousYear),
    revenueSurprisePercent: calculateSurprisePercent(event?.revenueActualUsd, event?.revenueEstimateUsd),
    revenueActualYoyPercent: calculateYearOverYearPercent(event?.revenueActualUsd, event?.revenuePreviousYearUsd),
    revenueEstimateYoyPercent: calculateYearOverYearPercent(event?.revenueEstimateUsd, event?.revenuePreviousYearUsd),
  };
  recalculated.earningsResult = classifyEarningsResult({
    ...recalculated,
    earningsResult: null,
    resultStatus: null,
    epsSurprisePercent: null,
    percent: null,
    actual: null,
    estimate: null,
  });
  return recalculated;
}

function mergeEarningsEventPreservingActuals(current, incoming) {
  const merged = { ...current, ...incoming };
  for (const [key, currentValue] of Object.entries(current || {})) {
    if (!isActualResultField(key) || isMissingActualFieldValue(currentValue)) continue;
    if (isMissingActualFieldValue(incoming?.[key])) merged[key] = currentValue;
  }
  if (isEarningsPublished(current)) {
    merged.earningsPublished = true;
    if (isMissingActualFieldValue(incoming?.publishedUntil) && !isMissingActualFieldValue(current?.publishedUntil)) {
      merged.publishedUntil = current.publishedUntil;
    }
    if (isMissingActualFieldValue(incoming?.earningsResult) && !isMissingActualFieldValue(current?.earningsResult)) {
      merged.earningsResult = current.earningsResult;
    }
  }
  return recalculateEarningsDerivedFields(merged);
}

export function mergeEarningsRefreshEvents(currentEvents = [], refreshedEvents = []) {
  const result = Array.isArray(currentEvents) ? currentEvents.map((event) => ({ ...event })) : [];
  const indexes = new Map();
  result.forEach((event, index) => {
    const key = earningsEventKey(event);
    if (key) indexes.set(key, index);
  });

  for (const refreshed of Array.isArray(refreshedEvents) ? refreshedEvents : []) {
    const key = earningsEventKey(refreshed);
    if (!key) continue;
    const index = indexes.get(key);
    if (index === undefined) {
      indexes.set(key, result.length);
      result.push({ ...refreshed });
      continue;
    }
    const current = result[index];
    result[index] = mergeEarningsEventPreservingActuals(current, refreshed);
  }
  return result;
}

export function preservePublishedEarningsEvents(currentEvents = [], incomingEvents = []) {
  const currentByKey = new Map(
    (Array.isArray(currentEvents) ? currentEvents : [])
      .map((event) => [earningsEventKey(event), event])
      .filter(([key]) => key),
  );
  return (Array.isArray(incomingEvents) ? incomingEvents : []).map((incoming) => {
    const current = currentByKey.get(earningsEventKey(incoming));
    return current ? mergeEarningsEventPreservingActuals(current, incoming) : incoming;
  });
}

export async function fetchEarningsCalendarEvents({
  token,
  symbols,
  from,
  to,
  includePreviousPublished = false,
  forceRefresh = false,
  refreshBucket = null,
  fetchFn = typeof fetch === 'function' ? fetch : null,
} = {}) {
  if (typeof fetchFn !== 'function') throw new Error('fetch unavailable');
  const params = new URLSearchParams({
    symbols: (Array.isArray(symbols) ? symbols : []).join(','),
    from: from || '',
    to: to || '',
    includePreviousPublished: includePreviousPublished ? '1' : '0',
  });
  if (forceRefresh) {
    params.set('refresh', '1');
    params.set('refreshBucket', String(refreshBucket ?? Math.floor(Date.now() / EARNINGS_CALENDAR_REFRESH_INTERVAL_MS)));
  }
  const response = await fetchFn(`/api/earnings-calendar?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    ...(forceRefresh ? { cache: 'no-store' } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) throw new Error(body?.error || response.statusText || 'request failed');
  return body?.events || [];
}

function pruneRefreshRequests(currentBucket, nowMs) {
  for (const [key, entry] of refreshRequestsByKey) {
    if (entry.bucket < currentBucket - 1) refreshRequestsByKey.delete(key);
  }
  for (const [key, entry] of refreshAttemptsByBatch) {
    if (entry.at < nowMs - EARNINGS_CALENDAR_REFRESH_INTERVAL_MS * 2) refreshAttemptsByBatch.delete(key);
  }
  while (refreshRequestsByKey.size > 128) {
    refreshRequestsByKey.delete(refreshRequestsByKey.keys().next().value);
  }
  while (refreshAttemptsByBatch.size > 128) {
    refreshAttemptsByBatch.delete(refreshAttemptsByBatch.keys().next().value);
  }
}

export function requestDueEarningsRefresh({
  baseCacheKey,
  events,
  token,
  now = Date.now,
  requestFn = fetchEarningsCalendarEvents,
} = {}) {
  const nowMs = resolveNowMs(now);
  const batch = buildEarningsRefreshBatch(events, nowMs);
  if (!batch || !baseCacheKey || !token || typeof requestFn !== 'function') {
    return Promise.resolve({ requested: false, reason: 'not-due', events: [], batch });
  }
  const bucket = Math.floor(nowMs / EARNINGS_CALENDAR_REFRESH_INTERVAL_MS);
  pruneRefreshRequests(bucket, nowMs);
  const batchThrottleKey = `${baseCacheKey}|${batch.key}`;
  const recentAttempt = refreshAttemptsByBatch.get(batchThrottleKey);
  if (recentAttempt && nowMs - recentAttempt.at < EARNINGS_CALENDAR_REFRESH_INTERVAL_MS) {
    return recentAttempt.promise;
  }
  const requestKey = `${baseCacheKey}|${bucket}|${batch.key}`;
  const existing = refreshRequestsByKey.get(requestKey);
  if (existing) return existing.promise;

  const promise = Promise.resolve()
    .then(() => requestFn({
      token,
      symbols: batch.symbols,
      from: batch.from,
      to: batch.to,
      includePreviousPublished: false,
      forceRefresh: true,
      refreshBucket: bucket,
    }))
    .then((refreshedEvents) => ({
      requested: true,
      reason: 'refreshed',
      events: Array.isArray(refreshedEvents) ? refreshedEvents : [],
      batch,
      bucket,
    }));
  refreshRequestsByKey.set(requestKey, { bucket, promise });
  refreshAttemptsByBatch.set(batchThrottleKey, { at: nowMs, promise });
  return promise;
}

export function resetEarningsRefreshRequestsForTests() {
  refreshRequestsByKey.clear();
  refreshAttemptsByBatch.clear();
}

function isVisible(documentTarget) {
  if (typeof documentTarget?.hidden === 'boolean') return !documentTarget.hidden;
  return documentTarget?.visibilityState !== 'hidden';
}

function isOnline(windowTarget) {
  return windowTarget?.navigator?.onLine !== false;
}

function emptyRefreshBinding() {
  return { request: () => false, cleanup: () => {} };
}

export function bindEarningsCalendarRefresh({
  windowTarget = typeof window === 'undefined' ? null : window,
  documentTarget = typeof document === 'undefined' ? null : document,
  shouldRefresh,
  onVisibleRefresh,
  now = Date.now,
  setTimeoutFn = (callback, delay) => windowTarget?.setTimeout(callback, delay),
  clearTimeoutFn = (timerId) => windowTarget?.clearTimeout(timerId),
  setIntervalFn = (callback, delay) => windowTarget?.setInterval(callback, delay),
  clearIntervalFn = (timerId) => windowTarget?.clearInterval(timerId),
  dedupeMs = EARNINGS_CALENDAR_RESUME_DEDUPE_MS,
  retryMs = EARNINGS_CALENDAR_VISIBLE_RETRY_MS,
  retryMaxMs = EARNINGS_CALENDAR_VISIBLE_RETRY_MAX_MS,
  intervalMs = EARNINGS_CALENDAR_REFRESH_INTERVAL_MS,
  maxVisiblePolls = EARNINGS_CALENDAR_MAX_VISIBLE_POLLS,
} = {}) {
  if (
    !windowTarget
    || !documentTarget
    || typeof windowTarget.addEventListener !== 'function'
    || typeof documentTarget.addEventListener !== 'function'
    || typeof shouldRefresh !== 'function'
    || typeof onVisibleRefresh !== 'function'
  ) return emptyRefreshBinding();

  let active = true;
  let visibilityRetryTimer = null;
  let visibilityRetryDeadline = 0;
  let intervalTimer = null;
  let lastRecheckAt = Number.NEGATIVE_INFINITY;
  let visiblePollCount = 0;

  const clearVisibilityRetry = () => {
    if (visibilityRetryTimer != null) clearTimeoutFn(visibilityRetryTimer);
    visibilityRetryTimer = null;
  };
  const stopVisibilityRetry = () => {
    clearVisibilityRetry();
    visibilityRetryDeadline = 0;
  };

  let requestVisibleRefresh;
  const queueVisibilityRetry = (trigger) => {
    if (!active || visibilityRetryTimer != null) return;
    const currentTime = resolveNowMs(now);
    if (!visibilityRetryDeadline) visibilityRetryDeadline = currentTime + Math.max(0, retryMaxMs);
    if (currentTime > visibilityRetryDeadline) {
      stopVisibilityRetry();
      return;
    }
    visibilityRetryTimer = setTimeoutFn(() => {
      visibilityRetryTimer = null;
      if (!active) return;
      if (isVisible(documentTarget)) {
        visibilityRetryDeadline = 0;
        requestVisibleRefresh(trigger);
        return;
      }
      queueVisibilityRetry(trigger);
    }, Math.max(0, retryMs));
  };

  requestVisibleRefresh = (trigger = 'resume') => {
    if (!active) return false;
    if (!isVisible(documentTarget)) {
      queueVisibilityRetry(trigger);
      return false;
    }
    stopVisibilityRetry();
    if (!isOnline(windowTarget) || !shouldRefresh()) return false;
    const currentTime = resolveNowMs(now);
    if (currentTime - lastRecheckAt < Math.max(0, dedupeMs)) return false;
    lastRecheckAt = currentTime;
    onVisibleRefresh(trigger);
    return true;
  };

  const handleVisibilityChange = () => {
    if (isVisible(documentTarget)) requestVisibleRefresh('visibilitychange');
  };
  const handlePageHide = () => stopVisibilityRetry();
  const handlePageShow = () => requestVisibleRefresh('pageshow');
  const handleFocus = () => requestVisibleRefresh('focus');
  const handleOnline = () => requestVisibleRefresh('online');

  documentTarget.addEventListener('visibilitychange', handleVisibilityChange);
  windowTarget.addEventListener('pagehide', handlePageHide);
  windowTarget.addEventListener('pageshow', handlePageShow);
  windowTarget.addEventListener('focus', handleFocus);
  windowTarget.addEventListener('online', handleOnline);
  intervalTimer = setIntervalFn(() => {
    if (!isVisible(documentTarget) || visiblePollCount >= Math.max(0, Number(maxVisiblePolls) || 0)) return;
    if (requestVisibleRefresh('visible-poll')) visiblePollCount += 1;
  }, Math.max(1000, Number(intervalMs) || EARNINGS_CALENDAR_REFRESH_INTERVAL_MS));

  return {
    request: requestVisibleRefresh,
    cleanup: () => {
      active = false;
      stopVisibilityRetry();
      if (intervalTimer != null) clearIntervalFn(intervalTimer);
      intervalTimer = null;
      documentTarget.removeEventListener('visibilitychange', handleVisibilityChange);
      windowTarget.removeEventListener('pagehide', handlePageHide);
      windowTarget.removeEventListener('pageshow', handlePageShow);
      windowTarget.removeEventListener('focus', handleFocus);
      windowTarget.removeEventListener('online', handleOnline);
    },
  };
}
