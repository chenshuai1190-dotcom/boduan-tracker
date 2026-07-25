#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchStockQuote } from '../server/quote/providers/eodhd.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4175;
const host = cleanEnv(process.env.MA200_PREVIEW_HOST) || '127.0.0.1';

loadLocalEnv(path.join(rootDir, '.env.local'));
if (process.env.HOME) {
  loadLocalEnv(path.join(process.env.HOME, '.config', 'boduan-tracker', 'eodhd.env'));
}

const eodhdKey = cleanEnv(process.env.EODHD_API_KEY);
if (!eodhdKey) {
  console.error('MA200 preview server: EODHD_API_KEY is missing.');
  process.exit(2);
}

const detailCache = new Map();

function cleanEnv(value) {
  return String(value || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
}

function loadLocalEnv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function corsHeaders(origin) {
  const allowedOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):5173$/.test(origin)
    ? origin
    : 'http://localhost:5173';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

async function loadStockDetail(symbol) {
  const cached = detailCache.get(symbol);
  if (cached?.data) return cached.data;
  if (cached?.promise) return cached.promise;

  const promise = fetchStockQuote(symbol, {
    eodhdKey,
    includeStockDetail: true,
  }).then((quote) => {
    if (quote?.error || !quote?.stockDetail) {
      throw new Error(quote?.error || 'stock detail unavailable');
    }
    const data = {
      symbol,
      fetchedAt: new Date().toISOString(),
      stockDetail: quote.stockDetail,
    };
    detailCache.set(symbol, { data });
    return data;
  }).catch((error) => {
    detailCache.delete(symbol);
    throw error;
  });

  detailCache.set(symbol, { promise });
  return promise;
}

const server = http.createServer(async (request, response) => {
  const origin = String(request.headers.origin || '');
  const headers = corsHeaders(origin);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  const url = new URL(request.url || '/', `http://${host}:${port}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/stock-detail') {
    const symbol = String(url.searchParams.get('symbol') || 'NVDA').trim().toUpperCase();
    if (!/^[A-Z]{1,8}$/.test(symbol)) {
      response.writeHead(400, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, error: 'invalid symbol' }));
      return;
    }
    try {
      const payload = await loadStockDetail(symbol);
      response.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, ...payload }));
    } catch (error) {
      response.writeHead(502, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, error: error?.message || 'provider unavailable' }));
    }
    return;
  }

  response.writeHead(404, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(port, host, () => {
  console.log(`MA200 preview server listening on http://${host}:${port}`);
  loadStockDetail('NVDA')
    .then((payload) => {
      const analysis = payload.stockDetail?.ma200RetestHistory;
      console.log(`NVDA real EOD ready: asOf=${analysis?.asOfDate || payload.stockDetail?.asOfDate || 'unknown'} status=${analysis?.status || 'unknown'} resolved=${analysis?.summary?.resolvedSampleSize ?? 0}`);
    })
    .catch((error) => {
      console.error(`NVDA real EOD preload failed: ${error?.message || error}`);
    });
});
