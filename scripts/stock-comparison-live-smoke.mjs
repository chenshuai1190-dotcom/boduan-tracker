#!/usr/bin/env node
// Explicit read-only provider verification, never called by CI or production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchStockComparison } from '../server/quote/stockComparison.js';
import { normalizeStockComparisonData } from '../src/lib/stockComparison.js';
import { buildStockComparison, comparisonRangeStart } from '../src/lib/stockComparisonModel.js';
import { getInvestmentComparisonExpectedCloseDate } from '../src/lib/investmentComparison.js';
import { buildStockRsi } from '../server/quote/stockRsi.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const filename of [path.join(root, '.env.local'), path.join(process.env.HOME || '', '.config/boduan-tracker/eodhd.env')]) {
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}
const eodhdKey = String(process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
if (!eodhdKey) throw new Error('Missing EODHD server configuration; credentials are never printed.');
const now = Date.now();
const endDate = getInvestmentComparisonExpectedCloseDate(now);
const startDate = '2021-01-01';
const symbols = ['QQQ', 'TQQQ', 'NVDA', 'SMH'];
const captures = new Map();
let requestCount = 0;
const captureFetch = async (input, options) => {
  const url = new URL(input);
  requestCount += 1;
  const response = await fetch(input, options);
  if (response.ok && /^\/api\/(eod|splits)\//.test(url.pathname)) captures.set(url.pathname, await response.clone().json());
  return response;
};
const data = await fetchStockComparison(symbols, { from: startDate, to: endDate, eodhdKey, fetchImpl: captureFetch, now });
const normalized = normalizeStockComparisonData(data, { symbols, startDate, endDate, expectedAsOfDate: endDate, now });
assert.ok(normalized, 'Live server output must pass the production client contract');
const closeEnough = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-10);
const verification = [];
for (const symbol of symbols) {
  const raw = new Map(captures.get(`/api/eod/${symbol}.US`).map(row => [row.date, row]));
  const splits = captures.get(`/api/splits/${symbol}.US`);
  for (const row of normalized.series[symbol].rows) {
    const factor = splits.filter(action => action.date > row.date && action.date <= endDate).reduce((product, action) => {
      const [newShares, oldShares] = action.split.split('/').map(Number);
      return product * newShares / oldShares;
    }, 1);
    closeEnough(row.close, Number(raw.get(row.date).close) / factor);
  }
  const rows = normalized.series[symbol].rows;
  const rsiChecks = [rows[0], rows[Math.floor(rows.length / 2)], rows.at(-1)].map(row => {
    const from = new Date(Date.parse(`${row.date}T00:00:00Z`) - 380 * 86400000).toISOString().slice(0, 10);
    const input = [...raw.values()].filter(point => point.date >= from && point.date <= row.date).sort((a, b) => a.date.localeCompare(b.date));
    const reference = buildStockRsi(input, { completedCutoffDate: row.date });
    assert.equal(typeof row.rsi6, 'number', `${symbol} ${row.date} needs warmed historical RSI`);
    closeEnough(row.rsi6, reference.value);
    return { date: row.date, rsi6: row.rsi6 };
  });
  verification.push({ symbol, rows: rows.length, splitEvents: splits.length, firstDate: rows[0].date, lastDate: rows.at(-1).date, rsiChecks });
}
for (const selected of [symbols.slice(0, 2), symbols]) {
  const model = buildStockComparison({ series: normalized.series, symbols: selected, startDate: comparisonRangeStart('1y', endDate), endDate });
  assert.ok(!model.error && model.rows.length > 1);
  for (const symbol of selected) {
    const base = model.rows[0].prices[symbol];
    for (const row of model.rows) if (row.prices[symbol] !== null) closeEnough(row.returns[symbol], (row.prices[symbol] / base - 1) * 100);
  }
}
assert.ok(requestCount <= 12, 'Provider reads must stay bounded');
const output = process.argv.find(value => value.startsWith('--output='))?.slice('--output='.length);
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(data));
console.log(JSON.stringify({ status: 'PASS', source: data.source, priceBasis: data.priceBasis, expectedAsOfDate: endDate, asOfDate: data.asOfDate, requestCount, verification }, null, 2));

if (process.argv.includes('--preview')) {
  const { createServer } = await import('vite');
  const body = JSON.stringify(data);
  const vite = await createServer({
    root, server: { host: '127.0.0.1', port: 5173, strictPort: true },
    plugins: [{ name: 'stock-comparison-captured-preview', configureServer(server) {
      server.middlewares.use('/__stock-comparison-preview.json', (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
        if (!['127.0.0.1:5173', 'localhost:5173'].includes(req.headers.host)
          || (req.headers.origin && !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(req.headers.origin))
          || req.headers['sec-fetch-site'] === 'cross-site') { res.statusCode = 403; res.end(); return; }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      });
    } }],
  });
  await vite.listen();
  vite.printUrls();
}
