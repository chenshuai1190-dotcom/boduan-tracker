#!/usr/bin/env node
// Loopback-only captured public data. No credentials, account data or API relay.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { normalizeVixComparison } from '../src/lib/vixComparison.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = process.argv.find(value => value.startsWith('--fixture='))?.slice(10);
if (!filename || !fs.existsSync(filename)) throw new Error('Pass --fixture=<captured VIX public data JSON>.');
const fixture = normalizeVixComparison(JSON.parse(fs.readFileSync(filename, 'utf8')));
if (!fixture) throw new Error('Captured VIX data does not meet the production contract.');
const body = JSON.stringify(fixture);
const port = 4181;
const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
const vite = await createServer({
  root, server: { host: '127.0.0.1', port, strictPort: true },
  plugins: [{ name: 'vix-captured-public-preview', configureServer(server) {
    server.middlewares.use('/__vix-comparison-preview.json', (req, res) => {
      if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
      let refererAllowed = !req.headers.referer;
      try { if (req.headers.referer) refererAllowed = origins.has(new URL(req.headers.referer).origin); } catch { refererAllowed = false; }
      if (!origins.has(`http://${req.headers.host}`) || (req.headers.origin && !origins.has(req.headers.origin))
        || !refererAllowed || req.headers['sec-fetch-site'] === 'cross-site') { res.statusCode = 403; res.end(); return; }
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(body);
    });
  } }],
});
await vite.listen();
vite.printUrls();
