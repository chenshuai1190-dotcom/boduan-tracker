import { INDEX_REALTIME_SYMBOLS } from './indices.js';
import { INDEX_QUOTE_TTL_MS, loadIndexQuotes } from './indexQuotes.js';

const CLIENT_HEARTBEAT_MS = 25_000;

function safeJsonSend(ws, payload) {
  if (ws.readyState !== 1) return false;
  try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
}

export function createIndicesRealtimeRelay({
  loadQuotes = loadIndexQuotes,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  const clients = new Set();
  let eodhdKey = '';
  let refreshTimer = null;
  let refreshInFlight = null;

  async function getSnapshot(options = {}) {
    const result = await loadQuotes({ eodhdKey: options.eodhdKey || eodhdKey, fetchImpl: options.fetchImpl });
    return { ...result, type: 'indices_snapshot' };
  }

  function refreshClients() {
    if (refreshInFlight || clients.size === 0) return refreshInFlight;
    const pending = getSnapshot().then(snapshot => {
      const status = { type: 'indices_status', status: snapshot.status, source: 'EODHD_REST', realtime: false, symbols: INDEX_REALTIME_SYMBOLS };
      for (const client of clients) {
        safeJsonSend(client, status);
        for (const tick of snapshot.ticks) safeJsonSend(client, tick);
      }
    }).catch(() => {
      for (const client of clients) safeJsonSend(client, { type: 'indices_status', status: 'unavailable', source: 'EODHD_REST', realtime: false });
    }).finally(() => {
      if (refreshInFlight === pending) refreshInFlight = null;
    });
    refreshInFlight = pending;
    return pending;
  }

  function attachClient(ws, options = {}) {
    if (options.eodhdKey) eodhdKey = options.eodhdKey;
    clients.add(ws);
    ws.isAlive = true;
    const heartbeat = setIntervalImpl(() => {
      if (ws.readyState !== 1) return;
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    }, CLIENT_HEARTBEAT_MS);
    heartbeat?.unref?.();
    const detach = () => {
      clients.delete(ws);
      clearIntervalImpl(heartbeat);
      if (clients.size === 0 && refreshTimer !== null) {
        clearIntervalImpl(refreshTimer);
        refreshTimer = null;
      }
    };
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', detach);
    ws.on('error', detach);
    safeJsonSend(ws, { type: 'indices_status', status: 'polling', source: 'EODHD_REST', realtime: false, symbols: INDEX_REALTIME_SYMBOLS });
    if (refreshTimer === null) {
      refreshTimer = setIntervalImpl(refreshClients, INDEX_QUOTE_TTL_MS);
      refreshTimer?.unref?.();
    }
    refreshClients();
    return detach;
  }

  return { getSnapshot, attachClient };
}

const relay = createIndicesRealtimeRelay();

export function getIndicesRealtimeSnapshot(options = {}) {
  return relay.getSnapshot(options);
}

/** Legacy clients retain the contract without an unsupported index upstream WS. */
export function attachIndicesRealtimeClient(ws, options = {}) {
  return relay.attachClient(ws, options);
}
