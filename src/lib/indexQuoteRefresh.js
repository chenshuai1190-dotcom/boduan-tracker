const DEFAULT_INTERVAL_MS = 60_000;
const MAX_INTERVAL_CHECK_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 12_000;
const CANCELLED = Symbol('cancelled-index-quote-request');

function positiveDelay(value, fallback) {
  const delay = Number(value);
  return Number.isFinite(delay) && delay > 0 ? delay : fallback;
}

/**
 * A per-instance index-only refresh loop. The caller owns fetching/validation and
 * its last good snapshot; this scheduler never writes an empty replacement.
 * The complete fetchSnapshot promise (including auth and response parsing) is
 * bounded, even when an underlying operation does not observe AbortSignal.
 */
export function createIndexQuotePoller({
  fetchSnapshot,
  onSnapshot,
  onError,
  isVisible = () => typeof document === 'undefined' || !document.hidden,
  getIntervalMs = () => DEFAULT_INTERVAL_MS,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let active = false;
  let disposed = false;
  let scheduled = null;
  let pending = null;
  // null, not zero: fake clocks and real attempt timestamps can start at zero.
  let lastAttemptAt = null;
  const requestTimeoutMs = positiveDelay(timeoutMs, DEFAULT_TIMEOUT_MS);

  const intervalMs = () => positiveDelay(getIntervalMs(), DEFAULT_INTERVAL_MS);
  const ownsRequest = (request) => !disposed && active && pending === request;

  function clearScheduled() {
    if (scheduled) clearTimer(scheduled.timer);
    scheduled = null;
  }

  function reportError(error) {
    // A consumer notification must not break request cleanup or future polls.
    try { onError?.(error); } catch { /* The caller owns error presentation. */ }
  }

  function schedule() {
    if (disposed || !active || pending) return;
    if (!isVisible()) {
      pause();
      return;
    }
    const currentTime = now();
    const remaining = lastAttemptAt === null ? 0 : Math.max(0, lastAttemptAt + intervalMs() - currentTime);
    const delay = Math.min(remaining, MAX_INTERVAL_CHECK_MS);
    const at = currentTime + delay;
    // Repeated focus/pageshow/online events must not postpone a due check.
    if (scheduled && scheduled.at <= at) return;
    clearScheduled();
    const next = { at, timer: null };
    scheduled = next;
    next.timer = setTimer(() => {
      if (scheduled !== next) return;
      scheduled = null;
      check();
    }, delay);
  }

  function beginRequest() {
    clearScheduled();
    const request = { controller: new AbortController(), timeout: null, cancel: null };
    pending = request;
    lastAttemptAt = now();
    const cancelled = new Promise((resolve) => { request.cancel = () => resolve(CANCELLED); });
    const timeout = new Promise((_, reject) => {
      request.timeout = setTimer(() => {
        if (!ownsRequest(request)) return;
        const error = new Error('Index quote refresh timed out');
        error.name = 'TimeoutError';
        error.code = 'INDEX_QUOTE_TIMEOUT';
        // Reject first so a synchronous abort rejection cannot hide the timeout.
        reject(error);
        request.controller.abort();
      }, requestTimeoutMs);
    });
    const work = Promise.resolve().then(() => {
      if (!ownsRequest(request)) return CANCELLED;
      return fetchSnapshot({ signal: request.controller.signal });
    });

    async function settle() {
      try {
        const snapshot = await Promise.race([work, timeout, cancelled]);
        if (snapshot !== CANCELLED && ownsRequest(request) && isVisible()) onSnapshot(snapshot);
      } catch (error) {
        if (ownsRequest(request) && isVisible()) reportError(error);
      } finally {
        clearTimer(request.timeout);
        if (pending === request) {
          pending = null;
          schedule();
        }
      }
    }
    // All work/cancellation/timeout rejections are consumed inside settle.
    void settle();
  }

  function check() {
    if (disposed || !active) return;
    if (!isVisible()) {
      pause();
      return;
    }
    if (pending) return;
    if (lastAttemptAt === null || now() >= lastAttemptAt + intervalMs()) beginRequest();
    else schedule();
  }

  function pause() {
    active = false;
    clearScheduled();
    const request = pending;
    pending = null;
    if (request) {
      clearTimer(request.timeout);
      request.cancel();
      request.controller.abort();
    }
  }

  function resume() {
    if (disposed) return;
    active = true;
    check();
  }

  function dispose() {
    disposed = true;
    pause();
  }

  return { start: resume, resume, pause, dispose };
}
