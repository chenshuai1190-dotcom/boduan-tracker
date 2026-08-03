import { WebSocket } from 'ws';
import { parseStockUpstreamMessage } from './stocks.js';
import { sanitizeEodhdKey } from './btc.js';

const TRADE_UPSTREAM_URL = 'wss://ws.eodhistoricaldata.com/ws/us';
const QUOTE_UPSTREAM_URL = 'wss://ws.eodhistoricaldata.com/ws/us-quote';
const BROADCAST_MIN_INTERVAL_MS = 1000;
const CLIENT_HEARTBEAT_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const QUOTE_FALLBACK_AFTER_TRADE_MS = 15_000;
const REPLAY_TICK_MAX_AGE_MS = 120_000;
const SNAPSHOT_HOLD_MS = 45_000;
const SNAPSHOT_WAIT_MS = 1_800;
const PROVIDER_AUTH_GRACE_MS = 350;
const SNAPSHOT_TARGET_COVERAGE_RATIO = 0.8;
const SNAPSHOT_POLL_MS = 50;

const STREAMS = {
  trade: {
    url: TRADE_UPSTREAM_URL,
    upstreamKey: 'upstream',
    statusKey: 'upstreamStatus',
    reconnectDelayKey: 'reconnectDelayMs',
    reconnectTimerKey: 'reconnectTimer',
    authFallbackTimerKey: 'authFallbackTimer',
    providerReadyKey: 'upstreamReady',
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
    authFallbackTimerKey: 'quoteAuthFallbackTimer',
    providerReadyKey: 'quoteUpstreamReady',
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
  authFallbackTimer: null,
  quoteAuthFallbackTimer: null,
  upstreamReady: false,
  quoteUpstreamReady: false,
  lastTicks: new Map(),
  lastBroadcastAtBySymbol: new Map(),
  pendingTickBySymbol: new Map(),
  pendingBroadcastTimerBySymbol: new Map(),
  subscribedSymbols: new Set(),
  quoteSubscribedSymbols: new Set(),
  eodhdKey: '',
  snapshotSymbols: new Set(),
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

function currentSymbols() {
  const symbols = new Set();
  for (const client of state.clients.values()) {
    for (const symbol of client.symbols) symbols.add(symbol);
  }
  if (Date.now() < state.snapshotHoldUntil) {
    for (const symbol of state.snapshotSymbols) symbols.add(symbol);
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

function clearAuthFallbackTimer(kind) {
  const stream = STREAMS[kind];
  const timerKey = stream.authFallbackTimerKey;
  if (state[timerKey]) {
    clearTimeout(state[timerKey]);
    state[timerKey] = null;
  }
}

function clearAllReconnectTimers() {
  clearReconnectTimer('trade');
  clearReconnectTimer('quote');
}

function clearAllAuthFallbackTimers() {
  clearAuthFallbackTimer('trade');
  clearAuthFallbackTimer('quote');
}

function hasActiveConsumers() {
  return state.clients.size > 0 || Date.now() < state.snapshotHoldUntil;
}

function clearPendingBroadcasts() {
  for (const timer of state.pendingBroadcastTimerBySymbol.values()) {
    clearTimeout(timer);
  }
  state.pendingBroadcastTimerBySymbol.clear();
  state.pendingTickBySymbol.clear();
}

function closeUpstreamIfUnused() {
  if (hasActiveConsumers()) return;
  clearAllReconnectTimers();
  clearAllAuthFallbackTimers();
  clearPendingBroadcasts();
  state.lastTicks.clear();
  state.lastBroadcastAtBySymbol.clear();
  state.subscribedSymbols.clear();
  state.quoteSubscribedSymbols.clear();
  state.snapshotSymbols.clear();
  for (const stream of Object.values(STREAMS)) {
    const upstream = state[stream.upstreamKey];
    if (upstream) {
      try {
        upstream.close();
      } catch {}
    }
    state[stream.upstreamKey] = null;
    state[stream.statusKey] = 'idle';
    state[stream.providerReadyKey] = false;
  }
}

function scheduleSnapshotHoldCleanup() {
  if (state.snapshotHoldTimer) clearTimeout(state.snapshotHoldTimer);
  const delay = Math.max(0, state.snapshotHoldUntil - Date.now() + 50);
  state.snapshotHoldTimer = setTimeout(() => {
    state.snapshotHoldTimer = null;
    closeUpstreamIfUnused();
  }, delay);
}

function sendSubscription(kind, action, symbols) {
  const stream = STREAMS[kind];
  if (!symbols.length) return;
  const upstream = state[stream.upstreamKey];
  if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
  safeJsonSend(upstream, { action, symbols: symbols.join(',') });
}

function reconcileSubscriptions(kind, { allowUnconfirmed = false } = {}) {
  const stream = STREAMS[kind];
  const wanted = currentSymbols();
  const upstream = state[stream.upstreamKey];
  if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
  if (!state[stream.providerReadyKey] && !allowUnconfirmed) return;

  const subscribedSymbolsKey = stream.subscribedSymbolsKey;
  const subscribedSymbols = state[subscribedSymbolsKey];
  const added = [...wanted].filter((symbol) => !subscribedSymbols.has(symbol));
  const removed = [...subscribedSymbols].filter((symbol) => !wanted.has(symbol));
  sendSubscription(kind, 'subscribe', added);
  sendSubscription(kind, 'unsubscribe', removed);
  // The compatibility subscription sent before an explicit provider-ready
  // frame is only provisional. Do not record it as confirmed, so a later
  // authorization frame always re-sends the wanted symbols.
  if (allowUnconfirmed) return;
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
  if (!state[stream.providerReadyKey]) return;
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

function confirmProviderReady(kind, upstream) {
  const stream = STREAMS[kind];
  if (state[stream.upstreamKey] !== upstream) return;
  const wasLive = state[stream.statusKey] === 'live';
  clearAuthFallbackTimer(kind);
  state[stream.providerReadyKey] = true;
  state[stream.statusKey] = 'live';
  state[stream.reconnectDelayKey] = 1000;
  reconcileSubscriptions(kind);
  if (wasLive) return;

  broadcastCombinedStatus();
  pruneStaleTicks();
  for (const tick of state.lastTicks.values()) {
    if (isFreshReplayTick(tick)) broadcastTick(tick);
  }
}

function scheduleStatuslessSubscription(kind, upstream) {
  const stream = STREAMS[kind];
  clearAuthFallbackTimer(kind);
  state[stream.authFallbackTimerKey] = setTimeout(() => {
    state[stream.authFallbackTimerKey] = null;
    if (state[stream.upstreamKey] !== upstream) return;
    if (upstream.readyState !== WebSocket.OPEN || state[stream.providerReadyKey]) return;
    // Retry the provisional subscription for gateways that omit the explicit
    // 200 status frame. The first provisional send happens immediately on open.
    reconcileSubscriptions(kind, { allowUnconfirmed: true });
  }, PROVIDER_AUTH_GRACE_MS);
}

function handleUpstreamMessage(kind, upstream, rawMessage) {
  const stream = STREAMS[kind];
  if (state[stream.upstreamKey] !== upstream) return;
  const parsed = parseStockUpstreamMessage(rawMessage, {
    symbols: currentSymbols(),
    source: stream.source,
    priceType: stream.priceType,
    defaultMarketStatus: stream.defaultMarketStatus,
  });

  if (parsed.kind === 'status') {
    if (parsed.status.isError) {
      clearAuthFallbackTimer(kind);
      state[stream.providerReadyKey] = false;
      state[stream.statusKey] = 'error';
      broadcastCombinedStatus({
        error: `EODHD 股票实时服务异常 (${parsed.status.statusCode})`,
      });
      try {
        upstream.close(1011, 'provider error');
      } catch {
        if (state[stream.upstreamKey] === upstream) state[stream.upstreamKey] = null;
        scheduleReconnect(kind);
      }
      return;
    }
    if (parsed.status.authorized) confirmProviderReady(kind, upstream);
    return;
  }

  if (parsed.kind !== 'tick') return;
  // A valid tick is also sufficient proof for gateways that do not emit a
  // status frame. This keeps those feeds compatible without reporting "live"
  // merely because the transport socket opened.
  if (!state[stream.providerReadyKey]) confirmProviderReady(kind, upstream);
  emitTick(parsed.tick);
}

function scheduleReconnect(kind) {
  const stream = STREAMS[kind];
  clearReconnectTimer(kind);
  if (!hasActiveConsumers() || !state.eodhdKey) return;
  const delayKey = stream.reconnectDelayKey;
  const delay = state[delayKey];
  state[delayKey] = Math.min(state[delayKey] * 2, MAX_RECONNECT_DELAY_MS);
  state[stream.reconnectTimerKey] = setTimeout(() => connectUpstream(kind), delay);
  state[stream.statusKey] = 'reconnecting';
  broadcastCombinedStatus({ retryInMs: delay });
}

function connectUpstream(kind) {
  const stream = STREAMS[kind];
  if (!hasActiveConsumers()) return;
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
    state[stream.statusKey] = 'connecting';
    state[stream.providerReadyKey] = false;
    state[stream.subscribedSymbolsKey].clear();
    broadcastCombinedStatus();
    // Stable realtime v10: send immediately like the proven v382 path, while
    // retaining the current authorization state machine and retry protection.
    reconcileSubscriptions(kind, { allowUnconfirmed: true });
    scheduleStatuslessSubscription(kind, nextUpstream);
  });

  nextUpstream.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    handleUpstreamMessage(kind, nextUpstream, text);
  });

  nextUpstream.on('error', () => {
    if (state[stream.upstreamKey] !== nextUpstream) return;
    clearAuthFallbackTimer(kind);
    state[stream.providerReadyKey] = false;
    state[stream.statusKey] = 'error';
    broadcastCombinedStatus({
      error: stream.errorMessage,
    });
  });

  nextUpstream.on('close', () => {
    if (state[stream.upstreamKey] !== nextUpstream) return;
    clearAuthFallbackTimer(kind);
    state[stream.upstreamKey] = null;
    state[stream.subscribedSymbolsKey].clear();
    state[stream.providerReadyKey] = false;
    state[stream.statusKey] = hasActiveConsumers() ? 'reconnecting' : 'idle';
    scheduleReconnect(kind);
  });
}

function connectUpstreams() {
  // Stable realtime v10: start both EODHD streams together. Quote remains only
  // a sparse-session fallback and cannot replace a recent trade tick.
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

function getFreshSnapshotTicks(symbolSet) {
  pruneStaleTicks();
  const ticks = [];
  for (const symbol of symbolSet) {
    const tick = state.lastTicks.get(symbol);
    if (tick && isFreshReplayTick(tick)) ticks.push(tick);
  }
  return ticks;
}

function snapshotCoverageTarget(symbolCount, targetRatio = SNAPSHOT_TARGET_COVERAGE_RATIO) {
  if (symbolCount <= 0) return 0;
  const ratio = Number.isFinite(Number(targetRatio))
    ? Math.min(1, Math.max(0, Number(targetRatio)))
    : SNAPSHOT_TARGET_COVERAGE_RATIO;
  return Math.max(1, Math.ceil(symbolCount * ratio));
}

export function buildStocksSnapshotMetadata({
  symbols = [],
  ticks = [],
  receivedAt = Date.now(),
  startedAt = 0,
  targetRatio = SNAPSHOT_TARGET_COVERAGE_RATIO,
} = {}) {
  const requestedSymbols = [...new Set(symbols || [])];
  const tickBySymbol = new Map(
    (ticks || [])
      .filter((tick) => tick?.symbol)
      .map((tick) => [tick.symbol, tick]),
  );
  const symbolMeta = {};
  let coveredCount = 0;
  let freshSinceRequestCount = 0;
  const missingSymbols = [];

  for (const symbol of requestedSymbols) {
    const tick = tickBySymbol.get(symbol) || null;
    const tickReceivedAt = Number(tick?.receivedAt || 0);
    const covered = Boolean(tick);
    const freshSinceRequest = Boolean(
      covered
      && tickReceivedAt > 0
      && tickReceivedAt >= Number(startedAt || 0),
    );
    if (covered) coveredCount += 1;
    else missingSymbols.push(symbol);
    if (freshSinceRequest) freshSinceRequestCount += 1;
    symbolMeta[symbol] = {
      covered,
      missing: !covered,
      ageMs: covered && tickReceivedAt > 0
        ? Math.max(0, Number(receivedAt) - tickReceivedAt)
        : null,
      receivedAt: tickReceivedAt || null,
      freshSinceRequest,
      source: tick?.source || null,
    };
  }

  const requestedCount = requestedSymbols.length;
  const targetCount = snapshotCoverageTarget(requestedCount, targetRatio);
  return {
    symbolMeta,
    coverage: {
      requestedCount,
      coveredCount,
      missingCount: missingSymbols.length,
      freshSinceRequestCount,
      targetCount,
      ratio: requestedCount > 0 ? coveredCount / requestedCount : 1,
      complete: coveredCount === requestedCount,
      missingSymbols,
    },
  };
}

export function evaluateStocksSnapshotWait({
  symbols = [],
  ticks = [],
  startedAt,
  deadline,
  now = Date.now(),
  targetRatio = SNAPSHOT_TARGET_COVERAGE_RATIO,
} = {}) {
  const metadata = buildStocksSnapshotMetadata({
    symbols,
    ticks,
    receivedAt: now,
    startedAt,
    targetRatio,
  });
  const freshReceivedTimes = Object.values(metadata.symbolMeta)
    .filter((item) => item.freshSinceRequest)
    .map((item) => item.receivedAt);
  const firstFreshAt = freshReceivedTimes.length > 0
    ? Math.min(...freshReceivedTimes)
    : null;

  if (firstFreshAt !== null) {
    return { resolve: true, reason: 'first-fresh-tick', firstFreshAt, ...metadata };
  }
  if (now >= Number(deadline || 0)) {
    return { resolve: true, reason: 'hard-timeout', firstFreshAt, ...metadata };
  }
  return { resolve: false, reason: 'collecting', firstFreshAt, ...metadata };
}

function waitForFreshStockTicks(symbolSet, startedAt, waitMs = SNAPSHOT_WAIT_MS) {
  return new Promise((resolve) => {
    const deadline = startedAt + Math.max(0, Number(waitMs) || 0);
    const poll = () => {
      const ticks = getFreshSnapshotTicks(symbolSet);
      const now = Date.now();
      const decision = evaluateStocksSnapshotWait({
        symbols: [...symbolSet],
        ticks,
        startedAt,
        deadline,
        now,
      });
      if (decision.resolve) {
        resolve({
          ticks,
          reason: decision.reason,
          waitedMs: Math.max(0, now - startedAt),
        });
        return;
      }
      setTimeout(poll, Math.min(SNAPSHOT_POLL_MS, Math.max(1, deadline - now)));
    };
    poll();
  });
}

export async function getStocksRealtimeSnapshot({ eodhdKey, symbols, waitMs = SNAPSHOT_WAIT_MS } = {}) {
  state.eodhdKey = sanitizeEodhdKey(eodhdKey) || state.eodhdKey;
  const symbolSet = new Set(symbols || []);
  state.snapshotSymbols = symbolSet;
  state.snapshotHoldUntil = Date.now() + SNAPSHOT_HOLD_MS;
  scheduleSnapshotHoldCleanup();
  const startedAt = Date.now();
  connectUpstreams();
  resubscribeAllSubscriptions();
  const waitResult = await waitForFreshStockTicks(symbolSet, startedAt, waitMs);
  const receivedAt = Date.now();
  const metadata = buildStocksSnapshotMetadata({
    symbols: [...symbolSet],
    ticks: waitResult.ticks,
    receivedAt,
    startedAt,
  });
  return {
    type: 'stocks_snapshot',
    status: combinedUpstreamStatus(),
    tradeStatus: state.upstreamStatus,
    quoteStatus: state.quoteUpstreamStatus,
    source: 'EODHD_WS',
    symbols: [...symbolSet],
    ticks: waitResult.ticks,
    symbolMeta: metadata.symbolMeta,
    coverage: {
      ...metadata.coverage,
      waitReason: waitResult.reason,
      waitedMs: waitResult.waitedMs,
    },
    receivedAt,
  };
}
