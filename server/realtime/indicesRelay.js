import { WebSocket } from 'ws';
import { INDEX_REALTIME_SYMBOLS, normalizeIndexTick } from './indices.js';
import { sanitizeEodhdKey } from './btc.js';

const UPSTREAM_URL = 'wss://ws.eodhistoricaldata.com/ws/us';
const BROADCAST_MIN_INTERVAL_MS = 1000;
const CLIENT_HEARTBEAT_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

const state = {
  clients: new Set(),
  upstream: null,
  upstreamStatus: 'idle',
  reconnectDelayMs: 1000,
  reconnectTimer: null,
  lastTicks: new Map(),
  lastBroadcastAtBySymbol: new Map(),
  pendingTickBySymbol: new Map(),
  pendingBroadcastTimerBySymbol: new Map(),
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

function clearPendingBroadcasts() {
  for (const timer of state.pendingBroadcastTimerBySymbol.values()) {
    clearTimeout(timer);
  }
  state.pendingBroadcastTimerBySymbol.clear();
  state.pendingTickBySymbol.clear();
}

function closeUpstreamIfUnused() {
  if (state.clients.size > 0) return;
  clearReconnectTimer();
  clearPendingBroadcasts();
  if (state.upstream) {
    try {
      state.upstream.close();
    } catch {}
  }
  state.upstream = null;
  state.upstreamStatus = 'idle';
}

function emitTick(tick) {
  state.lastTicks.set(tick.symbol, tick);
  const now = Date.now();
  const lastBroadcastAt = state.lastBroadcastAtBySymbol.get(tick.symbol) || 0;
  const elapsed = now - lastBroadcastAt;

  if (elapsed >= BROADCAST_MIN_INTERVAL_MS) {
    state.lastBroadcastAtBySymbol.set(tick.symbol, now);
    state.pendingTickBySymbol.delete(tick.symbol);
    broadcast(tick);
    return;
  }

  state.pendingTickBySymbol.set(tick.symbol, tick);
  if (state.pendingBroadcastTimerBySymbol.has(tick.symbol)) return;
  const timer = setTimeout(() => {
    state.pendingBroadcastTimerBySymbol.delete(tick.symbol);
    const pending = state.pendingTickBySymbol.get(tick.symbol);
    if (!pending) return;
    state.lastBroadcastAtBySymbol.set(tick.symbol, Date.now());
    state.pendingTickBySymbol.delete(tick.symbol);
    broadcast(pending);
  }, BROADCAST_MIN_INTERVAL_MS - elapsed);
  state.pendingBroadcastTimerBySymbol.set(tick.symbol, timer);
}

function scheduleReconnect() {
  clearReconnectTimer();
  if (state.clients.size === 0 || !state.eodhdKey) return;
  const delay = state.reconnectDelayMs;
  state.reconnectDelayMs = Math.min(state.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  state.reconnectTimer = setTimeout(() => connectUpstream(), delay);
  broadcast({ type: 'indices_status', status: 'reconnecting', retryInMs: delay, source: 'EODHD_WS' });
}

function connectUpstream() {
  if (state.clients.size === 0) return;
  if (!state.eodhdKey) {
    broadcast({ type: 'indices_status', status: 'error', error: 'EODHD_API_KEY 未配置', source: 'EODHD_WS' });
    return;
  }
  if (
    state.upstream
    && (state.upstream.readyState === WebSocket.OPEN || state.upstream.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  state.upstreamStatus = 'connecting';
  broadcast({ type: 'indices_status', status: 'connecting', source: 'EODHD_WS' });

  const upstream = new WebSocket(`${UPSTREAM_URL}?api_token=${encodeURIComponent(state.eodhdKey)}`);
  state.upstream = upstream;

  upstream.on('open', () => {
    state.upstreamStatus = 'live';
    state.reconnectDelayMs = 1000;
    safeJsonSend(upstream, { action: 'subscribe', symbols: INDEX_REALTIME_SYMBOLS });
    broadcast({ type: 'indices_status', status: 'live', symbols: INDEX_REALTIME_SYMBOLS, source: 'EODHD_WS' });
    for (const tick of state.lastTicks.values()) {
      broadcast(tick);
    }
  });

  upstream.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    const tick = normalizeIndexTick(text);
    if (tick) emitTick(tick);
  });

  upstream.on('error', (error) => {
    state.upstreamStatus = 'error';
    broadcast({
      type: 'indices_status',
      status: 'error',
      error: error?.message || 'EODHD 指数 WebSocket 连接失败',
      source: 'EODHD_WS',
    });
  });

  upstream.on('close', () => {
    if (state.upstream === upstream) state.upstream = null;
    state.upstreamStatus = state.clients.size > 0 ? 'reconnecting' : 'idle';
    scheduleReconnect();
  });
}

export function attachIndicesRealtimeClient(ws, { eodhdKey }) {
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
    type: 'indices_status',
    status: state.upstreamStatus,
    symbols: INDEX_REALTIME_SYMBOLS,
    source: 'EODHD_WS',
  });
  for (const tick of state.lastTicks.values()) {
    safeJsonSend(ws, tick);
  }
  connectUpstream();
}
