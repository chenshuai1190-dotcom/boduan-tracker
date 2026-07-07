import { WebSocket } from 'ws';
import { BTC_REALTIME_SYMBOL, normalizeBtcTick, sanitizeEodhdKey } from './btc.js';

const UPSTREAM_URL = 'wss://ws.eodhistoricaldata.com/ws/crypto';
const BROADCAST_MIN_INTERVAL_MS = 1000;
const CLIENT_HEARTBEAT_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const SNAPSHOT_HOLD_MS = 45_000;
const SNAPSHOT_WAIT_MS = 1_800;
const SNAPSHOT_TICK_MAX_AGE_MS = 120_000;

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
  if (state.pendingBroadcastTimer) {
    clearTimeout(state.pendingBroadcastTimer);
    state.pendingBroadcastTimer = null;
  }
  state.pendingTick = null;
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
    state.upstreamStatus = 'live';
    state.reconnectDelayMs = 1000;
    safeJsonSend(upstream, { action: 'subscribe', symbols: BTC_REALTIME_SYMBOL });
    broadcast({ type: 'btc_status', status: 'live', symbol: BTC_REALTIME_SYMBOL, source: 'EODHD_WS' });
    if (state.lastTick) broadcast(state.lastTick);
  });

  upstream.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    const tick = normalizeBtcTick(text);
    if (tick) emitTick(tick);
  });

  upstream.on('error', (error) => {
    state.upstreamStatus = 'error';
    broadcast({
      type: 'btc_status',
      status: 'error',
      error: error?.message || 'EODHD WebSocket 连接失败',
      source: 'EODHD_WS',
    });
  });

  upstream.on('close', () => {
    if (state.upstream === upstream) state.upstream = null;
    state.upstreamStatus = hasActiveConsumers() ? 'reconnecting' : 'idle';
    scheduleReconnect();
  });
}

function isFreshTick(tick, now = Date.now()) {
  const receivedAt = Number(tick?.receivedAt || 0);
  return Boolean(receivedAt && now - receivedAt <= SNAPSHOT_TICK_MAX_AGE_MS);
}

function waitForFreshBtcTick(startedAt, waitMs = SNAPSHOT_WAIT_MS) {
  if (state.lastTick && isFreshTick(state.lastTick) && Number(state.lastTick.receivedAt || 0) >= startedAt) {
    return Promise.resolve(state.lastTick);
  }
  return new Promise((resolve) => {
    const deadline = Date.now() + waitMs;
    const poll = () => {
      if (state.lastTick && isFreshTick(state.lastTick) && Number(state.lastTick.receivedAt || 0) >= startedAt) {
        resolve(state.lastTick);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(isFreshTick(state.lastTick) ? state.lastTick : null);
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

export async function getBtcRealtimeSnapshot({ eodhdKey, waitMs = SNAPSHOT_WAIT_MS } = {}) {
  const cleanKey = sanitizeEodhdKey(eodhdKey);
  if (cleanKey) state.eodhdKey = cleanKey;
  state.snapshotHoldUntil = Date.now() + SNAPSHOT_HOLD_MS;
  scheduleSnapshotHoldCleanup();
  const startedAt = Date.now();
  connectUpstream();
  const tick = await waitForFreshBtcTick(startedAt, waitMs);
  return {
    type: 'btc_snapshot',
    status: state.upstreamStatus,
    source: 'EODHD_WS',
    tick,
    receivedAt: Date.now(),
  };
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
    status: state.upstreamStatus,
    symbol: BTC_REALTIME_SYMBOL,
    source: 'EODHD_WS',
  });
  if (state.lastTick) safeJsonSend(ws, state.lastTick);
  connectUpstream();
}
