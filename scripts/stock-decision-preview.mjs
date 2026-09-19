#!/usr/bin/env node
// Optional loopback-only developer server. Never deployed as a quote/auth route.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { fetchStockDecision } from '../server/quote/stockDecision.js';
import { getStockValuation } from '../server/quote/stockDecisionValuation.js';
import { fetchMacroSnapshot } from '../server/macro/MacroDataService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const filename of [path.join(root, '.env.local'), path.join(process.env.HOME || '', '.config/boduan-tracker/eodhd.env')]) {
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}
const eodhdKey = String(process.env.EODHD_API_KEY || '').trim();
if (!eodhdKey) throw new Error('EODHD server configuration is missing.');
const origins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
const localReferer = value => {
  if (!value) return true;
  try { return origins.has(new URL(value).origin); } catch { return false; }
};
const vite = await createServer({
  root,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [{
    name: 'stock-decision-local-preview',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1:5173');
        if (!['/__stock-decision-preview', '/__stock-valuation-preview', '/__macro-preview'].includes(url.pathname)) return next();
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'GET') { res.statusCode = 405; res.end('{}'); return; }
        if (!['127.0.0.1:5173', 'localhost:5173'].includes(req.headers.host)
          || (req.headers.origin && !origins.has(req.headers.origin))
          || !localReferer(req.headers.referer)
          || req.headers['sec-fetch-site'] === 'cross-site') { res.statusCode = 403; res.end('{}'); return; }
        if (url.pathname === '/__macro-preview') {
          if ([...url.searchParams.keys()].length) { res.statusCode = 400; res.end('{}'); return; }
          try {
            res.end(JSON.stringify({ success: true, data: await fetchMacroSnapshot({ eodhdKey }) }));
          } catch {
            res.statusCode = 502; res.end(JSON.stringify({ success: false, code: 'MACRO_UNAVAILABLE' }));
          }
          return;
        }
        if (url.searchParams.getAll('symbol').length !== 1 || [...url.searchParams.keys()].some(key => key !== 'symbol')) { res.statusCode = 400; res.end('{}'); return; }
        try {
          const data = url.pathname === '/__stock-valuation-preview'
            ? await getStockValuation({ symbol: url.searchParams.get('symbol') })
            : await fetchStockDecision(url.searchParams.get('symbol'), { eodhdKey });
          res.end(JSON.stringify({ success: true, data }));
        } catch (error) {
          res.statusCode = Number.isInteger(error.status) ? error.status : 502;
          res.end(JSON.stringify({ success: false, code: error.code || 'PROVIDER_UNAVAILABLE' }));
        }
      });
    },
  }],
});
await vite.listen();
vite.printUrls();
