#!/usr/bin/env node
// Local-only acceptance host for the existing installed Quote Web App.
// Serve a production build, preserve real auth, and never log credentials/body.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRODUCTION_ORIGIN = 'https://boduan-tracker.vercel.app';
export const DEFAULT_PREVIEW_PORT = 4173;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WS_PATHS = new Set(['/api/btc-realtime', '/api/stocks-realtime']);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function plainResponse(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(message);
}

export function isLocalPreviewRequest(req, port = DEFAULT_PREVIEW_PORT) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!hosts.has(String(req.headers.host || ''))) return false;
  const origin = req.headers.origin;
  return !origin || [...hosts].some(host => origin === `http://${host}`);
}

export function isReadOnlyApiRequest(req, url) {
  if (!['GET', 'HEAD'].includes(req.method) || !url.pathname.startsWith('/api/')) return false;
  // Several cron routes write snapshots despite using GET; do not relay them.
  if (/schedule|register|invite-codes|daily-snapshot/.test(url.pathname)) return false;
  return url.searchParams.getAll('operation').every(operation => (
    ['', 'detail', 'growth', 'fund-composition', 'snapshot-status'].includes(operation)
  ));
}

export function productionRequestOptions(req, { upgrade = false } = {}) {
  const headers = { Accept: req.headers.accept || 'application/json' };
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  if (upgrade) {
    Object.assign(headers, {
      Connection: 'Upgrade', Upgrade: 'websocket', Origin: PRODUCTION_ORIGIN,
      'Sec-WebSocket-Key': req.headers['sec-websocket-key'],
      'Sec-WebSocket-Version': req.headers['sec-websocket-version'] || '13',
    });
    if (req.headers['sec-websocket-protocol']) headers['Sec-WebSocket-Protocol'] = req.headers['sec-websocket-protocol'];
    if (req.headers['sec-websocket-extensions']) headers['Sec-WebSocket-Extensions'] = req.headers['sec-websocket-extensions'];
  } else {
    headers['Cache-Control'] = 'no-cache';
  }
  return { method: req.method, headers };
}

export function productionTarget(requestUrl) {
  const source = new URL(requestUrl, 'http://localhost');
  const target = new URL(PRODUCTION_ORIGIN);
  // Never let an absolute-form request URL redirect bearer credentials elsewhere.
  target.pathname = source.pathname;
  target.search = source.search;
  return target;
}

function proxyHttp(req, res, requestUpstream) {
  const upstream = requestUpstream(productionTarget(req.url), productionRequestOptions(req), response => {
    res.statusCode = response.statusCode || 502;
    for (const key of ['content-type', 'content-length', 'content-encoding', 'vary']) {
      if (response.headers[key]) res.setHeader(key, response.headers[key]);
    }
    res.setHeader('Cache-Control', 'no-store');
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  upstream.setTimeout(60_000, () => upstream.destroy());
  upstream.on('error', () => {
    if (!res.headersSent && !res.destroyed) plainResponse(res, 502, 'Read-only upstream unavailable');
    else res.destroy();
  });
  res.on('close', () => upstream.destroy());
  upstream.end();
}

function serveStatic(req, res, url, distDir) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { plainResponse(res, 400, 'Invalid path'); return; }
  if (pathname.split('/').some(part => part.startsWith('.')) || pathname.includes('\\')) {
    plainResponse(res, 404, 'Not found');
    return;
  }
  let file = path.resolve(distDir, `.${pathname}`);
  if (file !== distDir && !file.startsWith(`${distDir}${path.sep}`)) {
    plainResponse(res, 404, 'Not found');
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (path.extname(pathname)) { plainResponse(res, 404, 'Not found'); return; }
    file = path.join(distDir, 'index.html');
  }
  if (!fs.existsSync(file)) { plainResponse(res, 503, 'Run npm run build first'); return; }
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME_TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

export function createIndicesPreviewHandler({
  indicesServer,
  distDir = path.join(ROOT, 'dist'),
  port = DEFAULT_PREVIEW_PORT,
  requestUpstream = https.request,
  logger = console.log,
  now = Date.now,
}) {
  let sequence = 0;
  return (req, res) => {
    if (!isLocalPreviewRequest(req, port)) { plainResponse(res, 403, 'Local preview only'); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { plainResponse(res, 405, 'Read-only preview'); return; }
    let url;
    try { url = new URL(req.url, `http://127.0.0.1:${port}`); } catch { plainResponse(res, 400, 'Invalid URL'); return; }
    if (url.pathname === '/api/indices-realtime') {
      const id = ++sequence;
      const started = now();
      let logged = false;
      const record = () => {
        if (logged) return;
        logged = true;
        logger(JSON.stringify({ request: id, at: new Date(started).toISOString(), status: res.writableEnded ? res.statusCode : 499, durationMs: now() - started }));
      };
      res.once('finish', record);
      res.once('close', record);
      indicesServer.emit('request', req, res);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (!isReadOnlyApiRequest(req, url)) { plainResponse(res, 405, 'Read-only API only'); return; }
      proxyHttp(req, res, requestUpstream);
      return;
    }
    serveStatic(req, res, url, path.resolve(distDir));
  };
}

export function createIndicesPreviewUpgrade({ port = DEFAULT_PREVIEW_PORT, requestUpstream = https.request } = {}) {
  return (req, socket, head) => {
    let url;
    try { url = new URL(req.url, `http://127.0.0.1:${port}`); } catch { socket.destroy(); return; }
    if (!isLocalPreviewRequest(req, port) || req.method !== 'GET' || !WS_PATHS.has(url.pathname)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const upstream = requestUpstream(productionTarget(req.url), productionRequestOptions(req, { upgrade: true }));
    upstream.setTimeout(15_000, () => upstream.destroy());
    upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
      upstreamSocket.setTimeout(0);
      const headers = Object.entries(response.headers).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join('\r\n')}\r\n\r\n`);
      if (head.length) upstreamSocket.write(head);
      if (upstreamHead.length) socket.write(upstreamHead);
      socket.on('error', () => upstreamSocket.destroy());
      upstreamSocket.on('error', () => socket.destroy());
      socket.on('close', () => upstreamSocket.destroy());
      upstreamSocket.on('close', () => socket.destroy());
      socket.pipe(upstreamSocket).pipe(socket);
    });
    upstream.on('response', response => { response.resume(); socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'); });
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.end();
  };
}

export function validatePreviewEnvironment(env) {
  if (String(env.QUOTE_API_AUTH_REQUIRED || '').trim().toLowerCase() === 'false') {
    throw new Error('Local PWA acceptance requires the existing API authentication to remain enabled');
  }
  if (!env.EODHD_API_KEY || !(env.SUPABASE_URL || env.VITE_SUPABASE_URL) || !(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error('Local PWA acceptance requires EODHD and Supabase configuration in .env.local');
  }
}

export async function startIndicesPwaPreview() {
  const envFile = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envFile)) throw new Error('Missing .env.local; use the existing local-env setup workflow');
  process.loadEnvFile(envFile);
  validatePreviewEnvironment(process.env);
  const port = Number(process.env.INDICES_PWA_PREVIEW_PORT || DEFAULT_PREVIEW_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local preview port');
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('Run npm run build first');
  const { default: indicesServer } = await import('../api/indices-realtime.js');
  const server = http.createServer(createIndicesPreviewHandler({ indicesServer, port }));
  server.on('upgrade', createIndicesPreviewUpgrade({ port }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  console.log(`Installed Quote PWA acceptance: http://127.0.0.1:${port}/ (real build, authenticated, read-only API forwarding)`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startIndicesPwaPreview().catch(() => {
    console.error('Local PWA acceptance server could not start; check local env, build output, and loopback port availability.');
    process.exitCode = 1;
  });
}
