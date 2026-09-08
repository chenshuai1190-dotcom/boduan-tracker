#!/usr/bin/env node
// Serves a captured public-market fixture locally; no credentials or network relay.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = process.argv.find(value => value.startsWith('--fixture='))?.slice('--fixture='.length);
if (!filename || !fs.existsSync(filename)) throw new Error('Pass --fixture=<verified live-smoke JSON file>');
const fixture = JSON.parse(fs.readFileSync(filename, 'utf8'));
if (fixture.source !== 'EODHD_EOD' || !Array.isArray(fixture.comparisons)) throw new Error('Invalid captured market fixture');
const body = JSON.stringify(fixture);
const vite = await createServer({
  root,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [{
    name: 'investment-public-fixture-preview',
    configureServer(server) {
      server.middlewares.use('/__investment-preview.json', (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
        const origin = req.headers.origin;
        if (origin && origin !== 'http://127.0.0.1:5173' && origin !== 'http://localhost:5173') { res.statusCode = 403; res.end(); return; }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      });
    },
  }],
});
await vite.listen();
vite.printUrls();
