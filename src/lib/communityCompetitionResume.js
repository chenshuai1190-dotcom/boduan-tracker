import { COMMUNITY_COMPETITION_PUBLICATION_STORAGE_KEY_PREFIX } from './communityCompetitionCache.js';

export const COMMUNITY_COMPETITION_RESUME_DEDUPE_MS = 1200;
export const COMMUNITY_COMPETITION_VISIBLE_RETRY_MS = 120;
export const COMMUNITY_COMPETITION_VISIBLE_RETRY_MAX_MS = 6000;
export const COMMUNITY_COMPETITION_VISIBLE_HEARTBEAT_MS = 30_000;
export const COMMUNITY_COMPETITION_PUBLICATION_EVENT = 'bottomline:community-competition-publication';

function isVisible(documentTarget) {
  if (typeof documentTarget?.hidden === 'boolean') return !documentTarget.hidden;
  return documentTarget?.visibilityState !== 'hidden';
}

export function bindCommunityCompetitionResume({
  windowTarget = typeof window === 'undefined' ? null : window,
  documentTarget = typeof document === 'undefined' ? null : document,
  onVisibleRecheck,
  now = Date.now,
  setTimeoutFn = (callback, delay) => windowTarget?.setTimeout(callback, delay),
  clearTimeoutFn = (timerId) => windowTarget?.clearTimeout(timerId),
  setIntervalFn = (callback, delay) => windowTarget?.setInterval(callback, delay),
  clearIntervalFn = (timerId) => windowTarget?.clearInterval(timerId),
  dedupeMs = COMMUNITY_COMPETITION_RESUME_DEDUPE_MS,
  retryMs = COMMUNITY_COMPETITION_VISIBLE_RETRY_MS,
  retryMaxMs = COMMUNITY_COMPETITION_VISIBLE_RETRY_MAX_MS,
  heartbeatMs = COMMUNITY_COMPETITION_VISIBLE_HEARTBEAT_MS,
} = {}) {
  if (
    !windowTarget
    || !documentTarget
    || typeof windowTarget.addEventListener !== 'function'
    || typeof documentTarget.addEventListener !== 'function'
    || typeof onVisibleRecheck !== 'function'
  ) return () => {};

  let active = true;
  let visibilityRetryTimer = null;
  let visibilityRetryDeadline = 0;
  let heartbeatTimer = null;
  let lastRecheckAt = Number.NEGATIVE_INFINITY;

  const clearVisibilityRetry = () => {
    if (visibilityRetryTimer != null) clearTimeoutFn(visibilityRetryTimer);
    visibilityRetryTimer = null;
  };

  const stopVisibilityRetry = () => {
    clearVisibilityRetry();
    visibilityRetryDeadline = 0;
  };

  let requestVisibleRecheck;
  const queueVisibilityRetry = (trigger) => {
    if (!active || visibilityRetryTimer != null) return;
    const currentTime = Number(now());
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
        requestVisibleRecheck(trigger);
        return;
      }
      queueVisibilityRetry(trigger);
    }, Math.max(0, retryMs));
  };

  requestVisibleRecheck = (trigger = 'resume') => {
    if (!active) return false;
    if (!isVisible(documentTarget)) {
      queueVisibilityRetry(trigger);
      return false;
    }
    stopVisibilityRetry();
    const currentTime = Number(now());
    const publicationChanged = trigger === 'publication' || trigger === 'publication-storage';
    if (
      !publicationChanged
      && Number.isFinite(currentTime)
      && currentTime - lastRecheckAt < Math.max(0, dedupeMs)
    ) return false;
    lastRecheckAt = Number.isFinite(currentTime) ? currentTime : Date.now();
    onVisibleRecheck(trigger);
    return true;
  };

  const handleVisibilityChange = () => {
    if (isVisible(documentTarget)) requestVisibleRecheck('visibilitychange');
  };
  const handlePageHide = () => stopVisibilityRetry();
  const handlePageShow = () => requestVisibleRecheck('pageshow');
  const handleFocus = () => requestVisibleRecheck('focus');
  const handleOnline = () => requestVisibleRecheck('online');
  const handleInteraction = (event) => requestVisibleRecheck(event?.type || 'interaction');
  const handlePublication = () => requestVisibleRecheck('publication');
  const handleStorage = (event) => {
    const key = String(event?.key || '');
    if (key.startsWith(`${COMMUNITY_COMPETITION_PUBLICATION_STORAGE_KEY_PREFIX}__user_`)) {
      requestVisibleRecheck('publication-storage');
    }
  };

  documentTarget.addEventListener('visibilitychange', handleVisibilityChange);
  windowTarget.addEventListener('pagehide', handlePageHide);
  windowTarget.addEventListener('pageshow', handlePageShow);
  windowTarget.addEventListener('focus', handleFocus);
  windowTarget.addEventListener('online', handleOnline);
  windowTarget.addEventListener('pointerdown', handleInteraction, { passive: true });
  windowTarget.addEventListener('touchstart', handleInteraction, { passive: true });
  windowTarget.addEventListener(COMMUNITY_COMPETITION_PUBLICATION_EVENT, handlePublication);
  windowTarget.addEventListener('storage', handleStorage);

  if (Number.isFinite(Number(heartbeatMs)) && Number(heartbeatMs) > 0) {
    heartbeatTimer = setIntervalFn(
      () => {
        if (isVisible(documentTarget)) requestVisibleRecheck('visible-heartbeat');
      },
      Number(heartbeatMs),
    );
  }

  return () => {
    active = false;
    stopVisibilityRetry();
    if (heartbeatTimer != null) clearIntervalFn(heartbeatTimer);
    heartbeatTimer = null;
    documentTarget.removeEventListener('visibilitychange', handleVisibilityChange);
    windowTarget.removeEventListener('pagehide', handlePageHide);
    windowTarget.removeEventListener('pageshow', handlePageShow);
    windowTarget.removeEventListener('focus', handleFocus);
    windowTarget.removeEventListener('online', handleOnline);
    windowTarget.removeEventListener('pointerdown', handleInteraction);
    windowTarget.removeEventListener('touchstart', handleInteraction);
    windowTarget.removeEventListener(COMMUNITY_COMPETITION_PUBLICATION_EVENT, handlePublication);
    windowTarget.removeEventListener('storage', handleStorage);
  };
}
