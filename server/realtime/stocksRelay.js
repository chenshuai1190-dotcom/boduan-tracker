import { WebSocket } from 'ws';
import { normalizeStockTick } from './stocks.js';
import { sanitizeEodhdKey } from './btc.js';

const UPSTREAM_URL = 'wss://ws.eodhistoricaldata.com/ws/us';
const BROADCAST_MIN_INTERVAL_MS = 1000;
const CLIENT_HEARTBEAT_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

const state = {
  clients: new Map(),
  upstream: null,
  upstreamStatus: 'idle',
  reconnectDelayMs: 1000,
  reconnectTimer: null,
  lastTicks: new Map(),
  lastBroadcastAtBySymbol: new Map(),
  pendingTickBySymbol: new Map(),
  pendingBroadcastTimerBySymbol: new Map(),
  subscribedSymbols: new Set(),
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

function currentSymbols() {
  const symbols = new Set();
  for (const client of state.clients.values()) {
    for (const symbol of client.symbols) symbols.add(symbol);
  }
  return symbols;
}

function broadcastStatus(payload) {
  for (const [client, context] of state.clients.entries()) {
    safeJsonSend(client, {
      ...payload,
      symbols: [...context.symbols],
    });
  }
}

function broadcastTick(tick) {
  for (const [client, context] of state.clients.entries()) {
    if (!context.symbols.has(tick.symbol)) continue;
    safeJsonSend(client, tick);
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
  state.subscribedSymbols.clear();
  if (state.upstream) {
    try {
      state.upstream.close();
    } catch {}
  }
  state.upstream = null;
  state.upstreamStatus = 'idle';
}

function sendSubscription(action, symbols) {
  if (!symbols.length) return;
  if (!state.upstream || state.upstream.readyState !== WebSocket.OPEN) return;
  safeJsonSend(state.upstream, { action, symbols: symbols.join(',') });
}

function reconcileSubscriptions() {
  const wanted = currentSymbols();
  if (!state.upstream || state.upstream.readyState !== WebSocket.OPEN) return;

  const added = [...wanted].filter((symbol) => !state.subscribedSymbols.has(symbol));
  const removed = [...state.subscribedSymbols].filter((symbol) => !wanted.has(symbol));
  sendSubscription('subscribe', added);
  sendSubscription('unsubscribe', removed);
  state.subscribedSymbols = wanted;
}

function emitTick(tick) {
  state.lastTicks.set(tick.symbol, tick);
  const now = Date.now();
  const lastBroadcastAt = state.lastBroadcastAtBySymbol.get(tick.symbol) || 0;
  const elapsed = now - lastBroadcastAt;

  if (elapsed >= BROADCAST_MIN_INTERVAL_MS) {
    state.lastBroadcastAtBySymbol.set(tick.symbol, now);
    state.pendingTickBySymbol.delete(tick.symbol);
    broadcastTick(tick);
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
    broadcastTick(pending);
  }, BROADCAST_MIN_INTERVAL_MS - elapsed);
  state.pendingBroadcastTimerBySymbol.set(tick.symbol, timer);
}

function scheduleReconnect() {
  clearReconnectTimer();
  if (state.clients.size === 0 || !state.eodhdKey) return;
  const delay = state.reconnectDelayMs;
  state.reconnectDelayMs = Math.min(state.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  state.reconnectTimer = setTimeout(() => connectUpstream(), delay);
  broadcastStatus({ type: 'stocks_status', status: 'reconnecting', retryInMs: delay, source: 'EODHD_WS' });
}

function connectUpstream() {
  if (state.clients.size === 0) return;
  if (!state.eodhdKey) {
    broadcastStatus({ type: 'stocks_status', status: 'error', error: 'EODHD_API_KEY 未配置', source: 'EODHD_WS' });
    return;
  }
  if (
    state.upstream
    && (state.upstream.readyState === WebSocket.OPEN || state.upstream.readyState === WebSocket.CONNECTING)
  ) {
    reconcileSubscriptions();
    return;
  }

  state.upstreamStatus = 'connecting';
  broadcastStatus({ type: 'stocks_status', status: 'connecting', source: 'EODHD_WS' });

  const upstream = new WebSocket(`${UPSTREAM_URL}?api_token=${encodeURIComponent(state.eodhdKey)}`);
  state.upstream = upstream;

  upstream.on('open', () => {
    state.upstreamStatus = 'live';
    state.reconnectDelayMs = 1000;
    state.subscribedSymbols.clear();
    reconcileSubscriptions();
    broadcastStatus({ type: 'stocks_status', status: 'live', source: 'EODHD_WS' });
    for (const tick of state.lastTicks.values()) {
      broadcastTick(tick);
    }
  });

  upstream.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    const tick = normalizeStockTick(text, { symbols: currentSymbols() });
    if (tick) emitTick(tick);
  });

  upstream.on('error', (error) => {
    state.upstreamStatus = 'error';
    broadcastStatus({
      type: 'stocks_status',
      status: 'error',
      error: error?.message || 'EODHD 股票 WebSocket 连接失败',
      source: 'EODHD_WS',
    });
  });

  upstream.on('close', () => {
    if (state.upstream === upstream) state.upstream = null;
    state.subscribedSymbols.clear();
    state.upstreamStatus = state.clients.size > 0 ? 'reconnecting' : 'idle';
    scheduleReconnect();
  });
}

export function attachStocksRealtimeClient(ws, { eodhdKey, symbols }) {
  state.eodhdKey = sanitizeEodhdKey(eodhdKey) || state.eodhdKey;
  const symbolSet = new Set(symbols || []);
  state.clients.set(ws, { symbols: symbolSet });

  let heartbeatId = null;
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('close', () => {
    state.clients.delete(ws);
    if (heartbeatId) clearInterval(heartbeatId);
    reconcileSubscriptions();
    closeUpstreamIfUnused();
  });
  ws.on('error', () => {
    state.clients.delete(ws);
    if (heartbeatId) clearInterval(heartbeatId);
    reconcileSubscriptions();
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
    type: 'stocks_status',
    status: state.upstreamStatus,
    symbols: [...symbolSet],
    source: 'EODHD_WS',
  });
  for (const symbol of symbolSet) {
    const tick = state.lastTicks.get(symbol);
    if (tick) safeJsonSend(ws, tick);
  }
  connectUpstream();
}
