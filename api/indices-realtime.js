import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { authenticateAccessToken } from '../server/quote/auth.js';
import {
  extractRealtimeAccessToken,
  isAllowedRealtimeOrigin,
  selectRealtimeProtocol,
} from '../server/realtime/auth.js';
import { attachIndicesRealtimeClient } from '../server/realtime/indicesRelay.js';
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

const server = createServer((req, res) => {
  if (req.method === 'GET') {
    return writeHttpResponse(res, 426, {
      success: false,
      error: '请使用 WebSocket 连接 /api/indices-realtime',
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
  attachIndicesRealtimeClient(ws, { eodhdKey: context?.eodhdKey });
});

export default server;
