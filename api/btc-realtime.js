import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { authenticateAccessToken } from '../server/quote/auth.js';
import {
  extractRealtimeAccessToken,
  isAllowedRealtimeOrigin,
  selectRealtimeProtocol,
} from '../server/realtime/auth.js';
import { attachBtcRealtimeClient, getBtcRealtimeSnapshot } from '../server/realtime/btcRelay.js';
import { sanitizeEodhdKey } from '../server/realtime/btc.js';

function writeHttpResponse(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

function rejectUpgrade(socket, statusCode, message) {
  const payload = JSON.stringify({ success: false, error: message });
  socket.write([
    `HTTP/1.1 ${statusCode} ${message}`,
    'Connection: close',
    'Content-Type: application/json; charset=utf-8',
    'Cache-Control: no-store',
    `Content-Length: ${Buffer.byteLength(payload)}`,
    '',
    payload,
  ].join('\r\n'));
  socket.destroy();
}

function isSnapshotRequest(req) {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    return url.searchParams.get('snapshot') === '1';
  } catch {
    return false;
  }
}

async function handleSnapshotRequest(req, res) {
  const eodhdKey = sanitizeEodhdKey(process.env.EODHD_API_KEY);
  if (!eodhdKey) {
    return writeHttpResponse(res, 500, { success: false, error: 'EODHD_API_KEY Missing' });
  }

  if (process.env.QUOTE_API_AUTH_REQUIRED !== 'false') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
    const auth = await authenticateAccessToken(token);
    if (!auth.ok) {
      return writeHttpResponse(res, auth.status || 401, { success: false, error: auth.error || 'Unauthorized' });
    }
  }

  const snapshot = await getBtcRealtimeSnapshot({ eodhdKey });
  return writeHttpResponse(res, 200, { success: true, data: snapshot });
}

const server = createServer((req, res) => {
  if (req.method === 'GET') {
    if (isSnapshotRequest(req)) {
      handleSnapshotRequest(req, res).catch((error) => {
        writeHttpResponse(res, 500, { success: false, error: error?.message || 'BTC snapshot failed' });
      });
      return;
    }
    return writeHttpResponse(res, 426, {
      success: false,
      error: '请使用 WebSocket 连接 /api/btc-realtime',
    });
  }
  res.setHeader('Allow', 'GET');
  return writeHttpResponse(res, 405, { success: false, error: 'Method Not Allowed' });
});

const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: selectRealtimeProtocol,
});

server.on('upgrade', async (req, socket, head) => {
  if (!isAllowedRealtimeOrigin(req)) {
    rejectUpgrade(socket, 403, 'Forbidden');
    return;
  }

  const eodhdKey = sanitizeEodhdKey(process.env.EODHD_API_KEY);
  if (!eodhdKey) {
    rejectUpgrade(socket, 500, 'EODHD_API_KEY Missing');
    return;
  }

  if (process.env.QUOTE_API_AUTH_REQUIRED !== 'false') {
    const token = extractRealtimeAccessToken(req);
    const auth = await authenticateAccessToken(token);
    if (!auth.ok) {
      rejectUpgrade(socket, auth.status || 401, 'Unauthorized');
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, { eodhdKey });
  });
});

wss.on('connection', (ws, _req, context) => {
  attachBtcRealtimeClient(ws, { eodhdKey: context?.eodhdKey });
});

export default server;
