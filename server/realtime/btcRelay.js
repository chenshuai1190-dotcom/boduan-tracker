import { WebSocket } from 'ws';
import {
  BTC_REALTIME_SYMBOL,
  BTC_REST_TICKER,
  normalizeBtcRestQuote,
  normalizeBtcTick,
  parseEodhdProviderStatus,
  sanitizeEodhdKey,
} from './btc.js';

const UPSTREAM_URL = 'wss://ws.eodhistoricaldata.com/ws/crypto';
const REST_URL = `https://eodhd.com/api/real-time/${BTC_REST_TICKER}`;
const BROADCAST_MIN_INTERVAL_MS = 1000;
const CLIENT_HEARTBEAT_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const SNAPSHOT_HOLD_MS = 45_000;
const SNAPSHOT_WAIT_MS = 1_800;
const REST_TIMEOUT_MS = 5_000;
export const BTC_WS_SNAPSHOT_MAX_AGE_MS = 15_000;
export const BTC_REST_FALLBACK_TTL_MS = 15_000;

const state = {
  clients: new Set(),
  upstream: null,
  upstreamStatus: 'idle',
  reconnectDelayMs: 1000,
  reconnectTimer: null,
  lastTick: null,
  lastBroadcastAt: 0,
  pendingTick: null,
  pendingBroadcastTimer: null,
  eodhdKey: '',
  snapshotHoldUntil: 0,
  snapshotHoldTimer: null,
};

function safeJsonSend(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function broadcast(payload) {
  for (const client of state.clients) {
    safeJsonSend(client, payload);
  }
}

function clearPendingBroadcast() {
  if (state.pendingBroadcastTimer) {
    clearTimeout(state.pendingBroadcastTimer);
    state.pendingBroadcastTimer = null;
  }
  state.pendingTick = null;
}

function formatProviderStatusError(providerStatus) {
  const statusCode = Number(providerStatus?.statusCode) || 500;
  return `EODHD WebSocket 服务异常 (${statusCode})`;
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function hasActiveConsumers() {
  return state.clients.size > 0 || Date.now() < state.snapshotHoldUntil;
}

function closeUpstreamIfUnused() {
  if (hasActiveConsumers()) return;
  clearReconnectTimer();
  clearPendingBroadcast();
  if (state.upstream) {
    try {
      state.upstream.close();
    } catch {}
  }
  state.upstream = null;
  state.upstreamStatus = 'idle';
}

function scheduleSnapshotHoldCleanup() {
  if (state.snapshotHoldTimer) clearTimeout(state.snapshotHoldTimer);
  const delay = Math.max(0, state.snapshotHoldUntil - Date.now() + 50);
  state.snapshotHoldTimer = setTimeout(() => {
    state.snapshotHoldTimer = null;
    closeUpstreamIfUnused();
  }, delay);
}

function emitTick(tick) {
  state.lastTick = tick;
  const now = Date.now();
  const elapsed = now - state.lastBroadcastAt;

  if (elapsed >= BROADCAST_MIN_INTERVAL_MS) {
    state.lastBroadcastAt = now;
    state.pendingTick = null;
    broadcast(tick);
    return;
  }

  state.pendingTick = tick;
  if (state.pendingBroadcastTimer) return;
  state.pendingBroadcastTimer = setTimeout(() => {
    state.pendingBroadcastTimer = null;
    if (!state.pendingTick) return;
    state.lastBroadcastAt = Date.now();
    const pending = state.pendingTick;
    state.pendingTick = null;
    broadcast(pending);
  }, BROADCAST_MIN_INTERVAL_MS - elapsed);
}

function scheduleReconnect() {
  clearReconnectTimer();
  if (!hasActiveConsumers() || !state.eodhdKey) return;
  const delay = state.reconnectDelayMs;
  state.reconnectDelayMs = Math.min(state.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  state.reconnectTimer = setTimeout(() => connectUpstream(), delay);
  broadcast({ type: 'btc_status', status: 'reconnecting', retryInMs: delay, source: 'EODHD_WS' });
}

function handleUpstreamMessage(upstream, rawMessage) {
  const providerStatus = parseEodhdProviderStatus(rawMessage);
  if (providerStatus?.isError) {
    clearPendingBroadcast();
    state.upstreamStatus = 'error';
    broadcast({
      type: 'btc_status',
      status: 'error',
      error: formatProviderStatusError(providerStatus),
      source: 'EODHD_WS',
    });
    try {
      upstream.close(1011, 'provider error');
    } catch {
      if (state.upstream === upstream) state.upstream = null;
      scheduleReconnect();
    }
    return;
  }

  const tick = normalizeBtcTick(rawMessage);
  if (!tick) return;

  const isFirstValidTick = state.upstreamStatus !== 'live';
  state.upstreamStatus = 'live';
  state.reconnectDelayMs = 1000;
  if (isFirstValidTick) {
    broadcast({
      type: 'btc_status',
      status: 'live',
      symbol: BTC_REALTIME_SYMBOL,
      source: 'EODHD_WS',
    });
  }
  emitTick(tick);
}

function connectUpstream() {
  if (!hasActiveConsumers()) return;
  if (!state.eodhdKey) {
    broadcast({ type: 'btc_status', status: 'error', error: 'EODHD_API_KEY 未配置', source: 'EODHD_WS' });
    return;
  }
  if (
    state.upstream
    && (state.upstream.readyState === WebSocket.OPEN || state.upstream.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  state.upstreamStatus = 'connecting';
  broadcast({ type: 'btc_status', status: 'connecting', source: 'EODHD_WS' });

  const upstream = new WebSocket(`${UPSTREAM_URL}?api_token=${encodeURIComponent(state.eodhdKey)}`);
  state.upstream = upstream;

  upstream.on('open', () => {
    safeJsonSend(upstream, { action: 'subscribe', symbols: BTC_REALTIME_SYMBOL });
  });

  upstream.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    handleUpstreamMessage(upstream, text);
  });

  upstream.on('error', () => {
    clearPendingBroadcast();
    state.upstreamStatus = 'error';
    broadcast({
      type: 'btc_status',
      status: 'error',
      error: 'EODHD WebSocket 连接失败',
      source: 'EODHD_WS',
    });
  });

  upstream.on('close', () => {
    if (state.upstream !== upstream) return;
    clearPendingBroadcast();
    state.upstream = null;
    state.upstreamStatus = hasActiveConsumers() ? 'reconnecting' : 'idle';
    scheduleReconnect();
  });
}

export function isEligibleBtcWsSnapshotTick(
  tick,
  { upstreamStatus = 'idle', now = Date.now() } = {},
) {
  if (upstreamStatus !== 'live') return false;
  const receivedAt = Number(tick?.receivedAt || 0);
  const ageMs = now - receivedAt;
  return Boolean(
    receivedAt
    && ageMs >= 0
    && ageMs <= BTC_WS_SNAPSHOT_MAX_AGE_MS
  );
}

export function resolveBtcClientStatus({
  upstreamStatus = 'idle',
  lastTick = null,
  now = Date.now(),
} = {}) {
  if (
    upstreamStatus === 'live'
    && !isEligibleBtcWsSnapshotTick(lastTick, { upstreamStatus, now })
  ) {
    return 'stale';
  }
  return upstreamStatus;
}

function waitForFreshBtcTick(waitMs = SNAPSHOT_WAIT_MS) {
  if (isEligibleBtcWsSnapshotTick(state.lastTick, { upstreamStatus: state.upstreamStatus })) {
    return Promise.resolve(state.lastTick);
  }
  return new Promise((resolve) => {
    const deadline = Date.now() + waitMs;
    const poll = () => {
      if (isEligibleBtcWsSnapshotTick(state.lastTick, { upstreamStatus: state.upstreamStatus })) {
        resolve(state.lastTick);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

export async function fetchBtcRestTick({
  eodhdKey,
  fetchImpl = globalThis.fetch,
  receivedAt = Date.now(),
  timeoutMs = REST_TIMEOUT_MS,
} = {}) {
  const cleanKey = sanitizeEodhdKey(eodhdKey);
  if (!cleanKey) throw new Error('EODHD_API_KEY 未配置');
  if (typeof fetchImpl !== 'function') throw new Error('EODHD BTC REST 请求不可用');

  const url = new URL(REST_URL);
  url.searchParams.set('api_token', cleanKey);
  url.searchParams.set('fmt', 'json');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('EODHD BTC REST 请求超时');
    throw new Error('EODHD BTC REST 请求失败');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response?.ok) {
    const status = Number(response?.status) || 502;
    throw new Error(`EODHD BTC REST 请求失败: HTTP ${status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('EODHD BTC REST 返回格式无效');
  }

  const providerStatus = parseEodhdProviderStatus(payload);
  if (providerStatus?.isError) {
    throw new Error(`EODHD BTC REST 服务异常: HTTP ${providerStatus.statusCode}`);
  }

  const tick = normalizeBtcRestQuote(payload, { receivedAt });
  if (!tick) throw new Error('EODHD BTC REST 返回无有效行情');
  return tick;
}

export function createBtcRestFallbackLoader({
  ttlMs = BTC_REST_FALLBACK_TTL_MS,
  fetchTick = fetchBtcRestTick,
  now = () => Date.now(),
} = {}) {
  let cachedTick = null;
  let cachedAt = 0;
  let inFlight = null;

  return async function loadBtcRestFallback(options = {}) {
    const currentTime = now();
    if (cachedTick && currentTime - cachedAt < ttlMs) return cachedTick;
    if (inFlight) return inFlight;

    const pending = Promise.resolve()
      .then(() => fetchTick(options))
      .then((tick) => {
        cachedTick = tick;
        cachedAt = now();
        return tick;
      })
      .finally(() => {
        if (inFlight === pending) inFlight = null;
      });
    inFlight = pending;
    return pending;
  };
}

export function buildBtcRealtimeSnapshot({
  wsTick = null,
  restTick = null,
  upstreamStatus = 'idle',
  receivedAt = Date.now(),
} = {}) {
  if (isEligibleBtcWsSnapshotTick(wsTick, { upstreamStatus, now: receivedAt })) {
    return {
      type: 'btc_snapshot',
      status: 'live',
      source: 'EODHD_WS',
      tick: wsTick,
      receivedAt,
    };
  }
  if (restTick) {
    return {
      type: 'btc_snapshot',
      status: 'fallback',
      source: 'EODHD_REST',
      tick: restTick,
      receivedAt,
    };
  }
  return {
    type: 'btc_snapshot',
    status: upstreamStatus,
    source: 'EODHD_WS',
    tick: null,
    receivedAt,
  };
}

const loadBtcRestFallback = createBtcRestFallbackLoader();

export async function getBtcRealtimeSnapshot({
  eodhdKey,
  waitMs = SNAPSHOT_WAIT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const cleanKey = sanitizeEodhdKey(eodhdKey);
  if (cleanKey) state.eodhdKey = cleanKey;
  state.snapshotHoldUntil = Date.now() + SNAPSHOT_HOLD_MS;
  scheduleSnapshotHoldCleanup();
  connectUpstream();
  const wsTick = await waitForFreshBtcTick(waitMs);
  if (wsTick) {
    return buildBtcRealtimeSnapshot({
      wsTick,
      upstreamStatus: state.upstreamStatus,
    });
  }

  let restTick = null;
  let fallbackError = '';
  try {
    restTick = await loadBtcRestFallback({
      eodhdKey: cleanKey,
      fetchImpl,
    });
  } catch (error) {
    fallbackError = String(error?.message || 'EODHD BTC REST 请求失败');
  }

  const latestWsTick = isEligibleBtcWsSnapshotTick(state.lastTick, {
    upstreamStatus: state.upstreamStatus,
  }) ? state.lastTick : null;
  const snapshot = buildBtcRealtimeSnapshot({
    wsTick: latestWsTick,
    restTick,
    upstreamStatus: state.upstreamStatus,
  });
  return fallbackError && !snapshot.tick
    ? { ...snapshot, fallbackError }
    : snapshot;
}

export function attachBtcRealtimeClient(ws, { eodhdKey }) {
  state.eodhdKey = sanitizeEodhdKey(eodhdKey) || state.eodhdKey;
  state.clients.add(ws);

  let heartbeatId = null;
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('close', () => {
    state.clients.delete(ws);
    if (heartbeatId) clearInterval(heartbeatId);
    closeUpstreamIfUnused();
  });
  ws.on('error', () => {
    state.clients.delete(ws);
    if (heartbeatId) clearInterval(heartbeatId);
    closeUpstreamIfUnused();
  });

  heartbeatId = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  }, CLIENT_HEARTBEAT_MS);

  safeJsonSend(ws, {
    type: 'btc_status',
    status: resolveBtcClientStatus({
      upstreamStatus: state.upstreamStatus,
      lastTick: state.lastTick,
    }),
    symbol: BTC_REALTIME_SYMBOL,
    source: 'EODHD_WS',
  });
  if (isEligibleBtcWsSnapshotTick(state.lastTick, {
    upstreamStatus: state.upstreamStatus,
  })) {
    safeJsonSend(ws, state.lastTick);
  }
  connectUpstream();
}
