import { WebSocket } from 'ws';
import { normalizeStockTick } from './stocks.js';
import { sanitizeEodhdKey } from './btc.js';

const TRADE_UPSTREAM_URL = 'wss://ws.eodhistoricaldata.com/ws/us';
const QUOTE_UPSTREAM_URL = 'wss://ws.eodhistoricaldata.com/ws/us-quote';
const BROADCAST_MIN_INTERVAL_MS = 1000;
const CLIENT_HEARTBEAT_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const QUOTE_FALLBACK_AFTER_TRADE_MS = 15_000;
const REPLAY_TICK_MAX_AGE_MS = 120_000;

const STREAMS = {
  trade: {
    url: TRADE_UPSTREAM_URL,
    upstreamKey: 'upstream',
    statusKey: 'upstreamStatus',
    reconnectDelayKey: 'reconnectDelayMs',
    reconnectTimerKey: 'reconnectTimer',
    subscribedSymbolsKey: 'subscribedSymbols',
    source: 'EODHD_WS',
    priceType: 'trade',
    defaultMarketStatus: null,
    errorMessage: 'EODHD 股票成交 WebSocket 连接失败',
  },
  quote: {
    url: QUOTE_UPSTREAM_URL,
    upstreamKey: 'quoteUpstream',
    statusKey: 'quoteUpstreamStatus',
    reconnectDelayKey: 'quoteReconnectDelayMs',
    reconnectTimerKey: 'quoteReconnectTimer',
    subscribedSymbolsKey: 'quoteSubscribedSymbols',
    source: 'EODHD_WS_QUOTE',
    priceType: 'quote-midpoint',
    defaultMarketStatus: 'quote',
    errorMessage: 'EODHD 股票盘口 WebSocket 连接失败',
  },
};

const state = {
  clients: new Map(),
  upstream: null,
  quoteUpstream: null,
  upstreamStatus: 'idle',
  quoteUpstreamStatus: 'idle',
  reconnectDelayMs: 1000,
  quoteReconnectDelayMs: 1000,
  reconnectTimer: null,
  quoteReconnectTimer: null,
  lastTicks: new Map(),
  lastBroadcastAtBySymbol: new Map(),
  pendingTickBySymbol: new Map(),
  pendingBroadcastTimerBySymbol: new Map(),
  subscribedSymbols: new Set(),
  quoteSubscribedSymbols: new Set(),
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

function combinedUpstreamStatus() {
  const statuses = [state.upstreamStatus, state.quoteUpstreamStatus];
  if (statuses.includes('live')) return 'live';
  if (statuses.includes('connecting')) return 'connecting';
  if (statuses.includes('reconnecting')) return 'reconnecting';
  if (statuses.includes('error')) return 'error';
  return state.clients.size > 0 ? 'idle' : 'idle';
}

function broadcastCombinedStatus(payload = {}) {
  broadcastStatus({
    type: 'stocks_status',
    status: combinedUpstreamStatus(),
    tradeStatus: state.upstreamStatus,
    quoteStatus: state.quoteUpstreamStatus,
    source: 'EODHD_WS',
    ...payload,
  });
}

function broadcastTick(tick) {
  for (const [client, context] of state.clients.entries()) {
    if (!context.symbols.has(tick.symbol)) continue;
    safeJsonSend(client, tick);
  }
}

function clearReconnectTimer(kind) {
  const stream = STREAMS[kind];
  const timerKey = stream.reconnectTimerKey;
  if (state[timerKey]) {
    clearTimeout(state[timerKey]);
    state[timerKey] = null;
  }
}

function clearAllReconnectTimers() {
  clearReconnectTimer('trade');
  clearReconnectTimer('quote');
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
  clearAllReconnectTimers();
  clearPendingBroadcasts();
  state.lastTicks.clear();
  state.lastBroadcastAtBySymbol.clear();
  state.subscribedSymbols.clear();
  state.quoteSubscribedSymbols.clear();
  for (const stream of Object.values(STREAMS)) {
    const upstream = state[stream.upstreamKey];
    if (upstream) {
      try {
        upstream.close();
      } catch {}
    }
    state[stream.upstreamKey] = null;
    state[stream.statusKey] = 'idle';
  }
}

function sendSubscription(kind, action, symbols) {
  const stream = STREAMS[kind];
  if (!symbols.length) return;
  const upstream = state[stream.upstreamKey];
  if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
  safeJsonSend(upstream, { action, symbols: symbols.join(',') });
}

function reconcileSubscriptions(kind) {
  const stream = STREAMS[kind];
  const wanted = currentSymbols();
  const upstream = state[stream.upstreamKey];
  if (!upstream || upstream.readyState !== WebSocket.OPEN) return;

  const subscribedSymbolsKey = stream.subscribedSymbolsKey;
  const subscribedSymbols = state[subscribedSymbolsKey];
  const added = [...wanted].filter((symbol) => !subscribedSymbols.has(symbol));
  const removed = [...subscribedSymbols].filter((symbol) => !wanted.has(symbol));
  sendSubscription(kind, 'subscribe', added);
  sendSubscription(kind, 'unsubscribe', removed);
  state[subscribedSymbolsKey] = wanted;
}

function reconcileAllSubscriptions() {
  reconcileSubscriptions('trade');
  reconcileSubscriptions('quote');
}

function resubscribeAll(kind) {
  const stream = STREAMS[kind];
  const upstream = state[stream.upstreamKey];
  if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
  const wanted = currentSymbols();
  const wantedSymbols = [...wanted];
  sendSubscription(kind, 'subscribe', wantedSymbols);
  state[stream.subscribedSymbolsKey] = wanted;
}

function resubscribeAllSubscriptions() {
  resubscribeAll('trade');
  resubscribeAll('quote');
}

function tickTimestamp(tick) {
  const timestamp = Number(tick?.timestamp || tick?.receivedAt || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function tickReceivedAt(tick) {
  const receivedAt = Number(tick?.receivedAt || 0);
  return Number.isFinite(receivedAt) && receivedAt > 0 ? receivedAt : 0;
}

function isFreshReplayTick(tick, now = Date.now()) {
  const receivedAt = tickReceivedAt(tick);
  return Boolean(receivedAt && now - receivedAt <= REPLAY_TICK_MAX_AGE_MS);
}

function pruneStaleTicks(now = Date.now()) {
  for (const [symbol, tick] of state.lastTicks.entries()) {
    if (!isFreshReplayTick(tick, now)) state.lastTicks.delete(symbol);
  }
}

function isTradeTick(tick) {
  return tick?.priceType === 'trade' || tick?.source === 'EODHD_WS';
}

function isQuoteFallbackTick(tick) {
  return tick?.priceType === 'quote-midpoint' || tick?.source === 'EODHD_WS_QUOTE';
}

function shouldAcceptTick(tick) {
  const existing = state.lastTicks.get(tick.symbol);
  if (!existing) return true;
  if (isQuoteFallbackTick(tick) && isTradeTick(existing)) {
    const existingTime = tickTimestamp(existing);
    const nextTime = tickTimestamp(tick);
    if (nextTime - existingTime <= QUOTE_FALLBACK_AFTER_TRADE_MS) return false;
  }
  return true;
}

function emitTick(tick) {
  if (!shouldAcceptTick(tick)) return;
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

function scheduleReconnect(kind) {
  const stream = STREAMS[kind];
  clearReconnectTimer(kind);
  if (state.clients.size === 0 || !state.eodhdKey) return;
  const delayKey = stream.reconnectDelayKey;
  const delay = state[delayKey];
  state[delayKey] = Math.min(state[delayKey] * 2, MAX_RECONNECT_DELAY_MS);
  state[stream.reconnectTimerKey] = setTimeout(() => connectUpstream(kind), delay);
  state[stream.statusKey] = 'reconnecting';
  broadcastCombinedStatus({ retryInMs: delay });
}

function connectUpstream(kind) {
  const stream = STREAMS[kind];
  if (state.clients.size === 0) return;
  if (!state.eodhdKey) {
    state[stream.statusKey] = 'error';
    broadcastCombinedStatus({ error: 'EODHD_API_KEY 未配置' });
    return;
  }
  const upstream = state[stream.upstreamKey];
  if (
    upstream
    && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)
  ) {
    reconcileSubscriptions(kind);
    return;
  }

  state[stream.statusKey] = 'connecting';
  broadcastCombinedStatus();

  const nextUpstream = new WebSocket(`${stream.url}?api_token=${encodeURIComponent(state.eodhdKey)}`);
  state[stream.upstreamKey] = nextUpstream;

  nextUpstream.on('open', () => {
    state[stream.statusKey] = 'live';
    state[stream.reconnectDelayKey] = 1000;
    state[stream.subscribedSymbolsKey].clear();
    reconcileSubscriptions(kind);
    broadcastCombinedStatus();
    pruneStaleTicks();
    for (const tick of state.lastTicks.values()) {
      if (isFreshReplayTick(tick)) broadcastTick(tick);
    }
  });

  nextUpstream.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    const tick = normalizeStockTick(text, {
      symbols: currentSymbols(),
      source: stream.source,
      priceType: stream.priceType,
      defaultMarketStatus: stream.defaultMarketStatus,
    });
    if (tick) emitTick(tick);
  });

  nextUpstream.on('error', (error) => {
    state[stream.statusKey] = 'error';
    broadcastCombinedStatus({
      error: error?.message || stream.errorMessage,
    });
  });

  nextUpstream.on('close', () => {
    if (state[stream.upstreamKey] === nextUpstream) state[stream.upstreamKey] = null;
    state[stream.subscribedSymbolsKey].clear();
    state[stream.statusKey] = state.clients.size > 0 ? 'reconnecting' : 'idle';
    scheduleReconnect(kind);
  });
}

function connectUpstreams() {
  connectUpstream('trade');
  connectUpstream('quote');
}

export function attachStocksRealtimeClient(ws, { eodhdKey, symbols }) {
  state.eodhdKey = sanitizeEodhdKey(eodhdKey) || state.eodhdKey;
  const symbolSet = new Set(symbols || []);
  state.clients.set(ws, { symbols: symbolSet });
  pruneStaleTicks();

  let heartbeatId = null;
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('close', () => {
    state.clients.delete(ws);
    if (heartbeatId) clearInterval(heartbeatId);
    reconcileAllSubscriptions();
    closeUpstreamIfUnused();
  });
  ws.on('error', () => {
    state.clients.delete(ws);
    if (heartbeatId) clearInterval(heartbeatId);
    reconcileAllSubscriptions();
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
    status: combinedUpstreamStatus(),
    tradeStatus: state.upstreamStatus,
    quoteStatus: state.quoteUpstreamStatus,
    symbols: [...symbolSet],
    source: 'EODHD_WS',
  });
  for (const symbol of symbolSet) {
    const tick = state.lastTicks.get(symbol);
    if (tick && isFreshReplayTick(tick)) safeJsonSend(ws, tick);
  }
  connectUpstreams();
  resubscribeAllSubscriptions();
}
