import { WebSocket } from 'ws';
import { BTC_REALTIME_SYMBOL, normalizeBtcTick, sanitizeEodhdKey } from './btc.js';

const UPSTREAM_URL = 'wss://ws.eodhistoricaldata.com/ws/crypto';
const BROADCAST_MIN_INTERVAL_MS = 1000;
const CLIENT_HEARTBEAT_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

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

function closeUpstreamIfUnused() {
  if (state.clients.size > 0) return;
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
  if (state.clients.size === 0 || !state.eodhdKey) return;
  const delay = state.reconnectDelayMs;
  state.reconnectDelayMs = Math.min(state.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  state.reconnectTimer = setTimeout(() => connectUpstream(), delay);
  broadcast({ type: 'btc_status', status: 'reconnecting', retryInMs: delay, source: 'EODHD_WS' });
}

function connectUpstream() {
  if (state.clients.size === 0) return;
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
    state.upstreamStatus = state.clients.size > 0 ? 'reconnecting' : 'idle';
    scheduleReconnect();
  });
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
