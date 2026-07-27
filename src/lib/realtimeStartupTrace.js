import { userScopedStorageKey } from './userScopedStorage.js';

export const REALTIME_STARTUP_TRACE_STORAGE_KEY = 'xmoney_realtime_startup_trace_v1';
export const REALTIME_STARTUP_TRACE_VERSION = 1;
export const REALTIME_STARTUP_TRACE_MAX_ENTRIES = 64;

export const REALTIME_STARTUP_TRACE_MARKS = Object.freeze([
  'session_start',
  'auth_start',
  'auth_done',
  'socket_connect_start',
  'socket_open',
  'relay_status',
  'provider_authorized',
  'subscription_sent',
  'first_tick',
  'snapshot_start',
  'snapshot_first_tick',
  'snapshot_done',
  'coverage_reached',
  'prices_applied',
  'first_render',
  'fallback_start',
  'fallback_done',
  'startup_complete',
  'startup_timeout',
]);

const ALLOWED_MARKS = new Set(REALTIME_STARTUP_TRACE_MARKS);
const ALLOWED_NUMBER_FIELDS = new Set([
  'ageMs',
  'attempt',
  'count',
  'coveredCount',
  'durationMs',
  'missingCount',
  'ratio',
  'requestedCount',
  'retryInMs',
  'statusCode',
  'waitedMs',
]);
const ALLOWED_BOOLEAN_FIELDS = new Set([
  'cached',
  'cold',
  'complete',
  'fallback',
  'forced',
  'fresh',
  'online',
  'standalone',
  'success',
  'visible',
  'warm',
]);
const ALLOWED_ENUM_FIELDS = Object.freeze({
  marketSession: new Set(['premarket', 'regular', 'postmarket', 'closed', 'unknown']),
  phase: new Set(['client', 'auth', 'relay', 'provider', 'subscription', 'snapshot', 'render']),
  reason: new Set([
    'collection_window',
    'coverage',
    'first_tick_timeout',
    'hard_timeout',
    'manual',
    'network',
    'resume',
    'stale',
    'startup',
    'unknown',
  ]),
  runtime: new Set(['ios_standalone', 'safari', 'browser', 'server']),
  source: new Set(['cache', 'client', 'eodhd_rest', 'eodhd_ws', 'eodhd_ws_quote', 'server']),
  status: new Set([
    'authorized',
    'complete',
    'connecting',
    'disabled',
    'error',
    'idle',
    'live',
    'paused',
    'polling',
    'reconnecting',
    'stale',
    'timeout',
    'waiting',
    'warming',
  ]),
  stream: new Set(['stock', 'trade', 'quote', 'snapshot']),
  transport: new Set(['cache', 'none', 'rest', 'snapshot', 'websocket']),
  trigger: new Set([
    'focus',
    'heartbeat',
    'manual',
    'online',
    'pageshow',
    'poll',
    'resume',
    'startup',
    'visibility',
    'watchdog',
  ]),
  waitReason: new Set(['collection_window', 'coverage', 'hard_timeout', 'none']),
});

let traceSequence = 0;

function resolveDefaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function resolveDefaultPerformanceNow() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch {}
  return 0;
}

function readFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readClock(clock, fallback = 0) {
  try {
    const value = readFiniteNumber(clock?.());
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function sanitizeFields(fields) {
  if (fields === undefined) return {};
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;

  const entries = Object.entries(fields);
  if (entries.length > 12) return null;

  const sanitized = {};
  for (const [field, value] of entries) {
    if (ALLOWED_NUMBER_FIELDS.has(field)) {
      const number = readFiniteNumber(value);
      if (number === null) return null;
      sanitized[field] = number;
      continue;
    }
    if (ALLOWED_BOOLEAN_FIELDS.has(field)) {
      if (typeof value !== 'boolean') return null;
      sanitized[field] = value;
      continue;
    }
    const allowedValues = ALLOWED_ENUM_FIELDS[field];
    if (allowedValues) {
      if (typeof value !== 'string' || !allowedValues.has(value)) return null;
      sanitized[field] = value;
      continue;
    }
    return null;
  }
  return sanitized;
}

function createTraceId(startedAt, startedPerformanceAt) {
  traceSequence = (traceSequence + 1) % 1_000_000;
  const wallPart = Math.max(0, Math.round(startedAt)).toString(36);
  const performancePart = Math.max(0, Math.round(startedPerformanceAt * 1000)).toString(36);
  return `rt_${wallPart}_${performancePart}_${traceSequence.toString(36)}`;
}

function cloneTrace(trace) {
  if (!trace) return null;
  return {
    ...trace,
    entries: trace.entries.map((entry) => ({
      ...entry,
      fields: { ...entry.fields },
    })),
  };
}

function sanitizeStoredEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (!ALLOWED_MARKS.has(entry.name)) return null;
  const at = readFiniteNumber(entry.at);
  const elapsedMs = readFiniteNumber(entry.elapsedMs);
  const fields = sanitizeFields(entry.fields);
  if (at === null || elapsedMs === null || elapsedMs < 0 || fields === null) return null;
  return {
    name: entry.name,
    at,
    elapsedMs,
    fields,
  };
}

function sanitizeStoredTrace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.version !== REALTIME_STARTUP_TRACE_VERSION) return null;
  if (!/^rt_[a-z0-9_]{3,80}$/.test(String(value.traceId || ''))) return null;
  const startedAt = readFiniteNumber(value.startedAt);
  if (startedAt === null || !Array.isArray(value.entries) || value.entries.length === 0) return null;

  const entries = value.entries.map(sanitizeStoredEntry);
  if (entries.some((entry) => entry === null) || entries[0]?.name !== 'session_start') return null;
  const boundedEntries = entries.length <= REALTIME_STARTUP_TRACE_MAX_ENTRIES
    ? entries
    : [entries[0], ...entries.slice(-(REALTIME_STARTUP_TRACE_MAX_ENTRIES - 1))];
  return {
    version: REALTIME_STARTUP_TRACE_VERSION,
    traceId: String(value.traceId),
    startedAt,
    entries: boundedEntries,
  };
}

export function createRealtimeStartupTrace({
  userId,
  storage,
  now = Date.now,
  performanceNow = resolveDefaultPerformanceNow,
} = {}) {
  const storageKey = userScopedStorageKey(REALTIME_STARTUP_TRACE_STORAGE_KEY, userId);
  const resolvedStorage = storage === undefined ? resolveDefaultStorage() : storage;
  let activeTrace = null;
  let startedPerformanceAt = 0;

  const persist = () => {
    if (!storageKey || !resolvedStorage || !activeTrace) return false;
    try {
      resolvedStorage.setItem(storageKey, JSON.stringify(activeTrace));
      return true;
    } catch {
      return false;
    }
  };

  const startSession = (fields = {}) => {
    if (!storageKey) return null;
    const safeFields = sanitizeFields(fields);
    if (safeFields === null) return null;
    const startedAt = readClock(now);
    startedPerformanceAt = readClock(performanceNow);
    activeTrace = {
      version: REALTIME_STARTUP_TRACE_VERSION,
      traceId: createTraceId(startedAt, startedPerformanceAt),
      startedAt,
      entries: [{
        name: 'session_start',
        at: startedAt,
        elapsedMs: 0,
        fields: safeFields,
      }],
    };
    persist();
    return cloneTrace(activeTrace);
  };

  const mark = (name, fields = {}) => {
    if (!activeTrace || !ALLOWED_MARKS.has(name) || name === 'session_start') return null;
    const safeFields = sanitizeFields(fields);
    if (safeFields === null) return null;
    const at = readClock(now, activeTrace.startedAt);
    const performanceAt = readClock(performanceNow, startedPerformanceAt);
    const entry = {
      name,
      at,
      elapsedMs: Math.max(0, performanceAt - startedPerformanceAt),
      fields: safeFields,
    };
    const nextEntries = [...activeTrace.entries, entry];
    activeTrace.entries = nextEntries.length <= REALTIME_STARTUP_TRACE_MAX_ENTRIES
      ? nextEntries
      : [nextEntries[0], ...nextEntries.slice(-(REALTIME_STARTUP_TRACE_MAX_ENTRIES - 1))];
    persist();
    return {
      ...entry,
      fields: { ...entry.fields },
    };
  };

  const readLatest = () => {
    if (!storageKey) return null;
    if (resolvedStorage) {
      try {
        const raw = resolvedStorage.getItem(storageKey);
        if (raw !== null) {
          const storedTrace = sanitizeStoredTrace(JSON.parse(raw));
          if (storedTrace) return cloneTrace(storedTrace);
        }
      } catch {}
    }
    return cloneTrace(activeTrace);
  };

  return {
    mark,
    readLatest,
    startSession,
  };
}
