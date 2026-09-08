#!/usr/bin/env node
// Explicit, bounded read-only provider verification. Never part of CI/gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchInvestmentComparison } from '../server/quote/investmentComparison.js';
import { buildInvestmentComparisonModel, getInvestmentComparisonSnapshot } from '../src/lib/investmentComparisonModel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const filename of [path.join(root, '.env.local'), path.join(process.env.HOME || '', '.config/boduan-tracker/eodhd.env')]) {
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}
const eodhdKey = String(process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
if (!eodhdKey) throw new Error('EODHD_API_KEY is required; credentials are never printed.');

const rawSeries = new Map();
const calls = [];
const captureFetch = async (input, options) => {
  const url = new URL(input);
  calls.push(url.pathname); // Path only: never retain credential-bearing URLs.
  const response = await fetch(input, options);
  if (response.ok && url.pathname.startsWith('/api/eod/')) {
    const symbol = decodeURIComponent(url.pathname.split('/').at(-1)).replace(/\.US$/, '');
    rawSeries.set(symbol, await response.clone().json());
  }
  return response;
};
const closeEnough = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1, Math.abs(b)) * 1e-10);
const comparisons = [];
const verification = [];
for (const symbols of [['QQQ', 'TQQQ'], ['QQQ', 'NVDA'], ['QQQ', 'SPY']]) {
  const data = await fetchInvestmentComparison(symbols, { eodhdKey, fetchImpl: captureFetch });
  assert.equal(data.source, 'EODHD_EOD');
  assert.equal(data.priceBasis, 'adjusted_close');
  const model = buildInvestmentComparisonModel({ data, symbols, startYear: 2011, principal: 1000000 });
  const snapshot = getInvestmentComparisonSnapshot(model, model.points.length - 1);
  const result = { symbols, from: model.actualStartDate, asOfDate: data.asOfDate, expectedAsOfDate: data.expectedAsOfDate, stale: data.stale, points: model.points.length, series: [] };
  for (const symbol of symbols) {
    const rows = new Map(rawSeries.get(symbol).map(row => [row.date, row]));
    const base = Number(rows.get(model.actualStartDate).adjusted_close);
    for (const point of model.points) {
      const raw = rows.get(point.date);
      assert.ok(raw && Number(raw.adjusted_close) > 0);
      closeEnough(point.values[symbol], 1000000 * Number(raw.adjusted_close) / base);
      closeEnough(point.profits[symbol], point.values[symbol] - 1000000);
      closeEnough(point.returns[symbol], (Number(raw.adjusted_close) / base - 1) * 100);
    }
    let prior = rows.get(model.actualStartDate);
    for (const annual of snapshot.annualRows) {
      const end = rows.get(annual.throughDate);
      closeEnough(annual.bySymbol[symbol].returnPct, (Number(end.adjusted_close) / Number(prior.adjusted_close) - 1) * 100);
      prior = end;
    }
    const last = rows.get(data.asOfDate);
    const last2024 = [...rows.values()].filter(row => row.date.startsWith('2024-')).at(-1);
    const last2025 = [...rows.values()].filter(row => row.date.startsWith('2025-')).at(-1);
    result.series.push({ symbol, rawLatestClose: last.close, adjustedLatestClose: last.adjusted_close, rawStartClose: rows.get(model.actualStartDate).close, adjustedStartClose: base, calendar2025ReturnPct: last2024 && last2025 ? (Number(last2025.adjusted_close) / Number(last2024.adjusted_close) - 1) * 100 : null });
  }
  comparisons.push(data);
  verification.push(result);
}
assert.ok(calls.filter(value => value.startsWith('/api/eod/')).length <= 4, 'same-close history cache must avoid duplicate EOD reads');
const artifact = { capturedAt: new Date().toISOString(), source: 'EODHD_EOD', comparisons, verification, providerRequestCount: calls.length };
const output = process.argv.find(value => value.startsWith('--output='))?.slice('--output='.length);
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(artifact));
console.log(JSON.stringify({ status: 'PASS', providerRequestCount: calls.length, verification }, null, 2));
