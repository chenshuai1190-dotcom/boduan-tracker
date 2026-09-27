#!/usr/bin/env node
// One bounded, public-market readback. Not run by gates. Never print credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchVixComparison } from '../server/quote/vixComparison.js';
import { normalizeVixComparison } from '../src/lib/vixComparison.js';
import { buildVixRiskModel } from '../src/lib/vixRiskModel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const filename of [path.join(root, '.env.local'), path.join(process.env.HOME || '', '.config/boduan-tracker/eodhd.env')]) {
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}
const eodhdKey = String(process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
if (!eodhdKey) throw new Error('EODHD server configuration is required.');
const now = Date.now();
const calls = [];
const capture = async (input, options) => {
  const url = new URL(input);
  calls.push(`${url.hostname}${url.pathname}`);
  return fetch(input, options);
};
try {
  const raw = await fetchVixComparison({ eodhdKey, fetchImpl: capture, now });
  const data = normalizeVixComparison(raw, { now });
  assert.ok(data, 'real server response must pass the client contract');
  assert.equal(data.stale, false, 'market closes must reach the latest completed session');
  assert.equal(data.termStructure.stale, false, 'official volatility pair must reach the latest completed session');
  assert.equal(data.termStructure.asOfDate, data.asOfDate);
  for (const row of data.termStructure.rows) {
    assert.ok(Math.abs(row.ratio - row.vix / row.vix3m) < 1e-8);
  }
  const risks = Object.fromEntries(['SPY', 'QQQ'].map(symbol => [symbol, buildVixRiskModel({
    termStructure: data.termStructure, benchmarkRows: data.series[symbol].rows,
    expectedAsOfDate: data.expectedAsOfDate, stale: data.stale,
  })]));
  assert.equal(risks.SPY.phase, risks.QQQ.phase, 'benchmark selection cannot change the volatility phase');
  assert.equal(risks.SPY.ready, true, 'actual latest history supports a risk assessment');
  const before = calls.length;
  await fetchVixComparison({ eodhdKey, fetchImpl: capture, now });
  assert.equal(calls.length, before, 'same completed version must be cached');
  assert.equal(calls.filter(value => value.includes('eodhd.com/api/eod/')).length, 2);
  assert.equal(calls.filter(value => value.includes('cboe.com/')).length, 2);
  const output = process.argv.find(value => value.startsWith('--output='))?.slice(9);
  if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(data));
  console.log(JSON.stringify({ status: 'PASS', checkedAt: new Date(now).toISOString(), providerRequests: calls.length,
    asOfDate: data.asOfDate, marketPoints: data.pointCount, termPoints: data.termStructure.rows.length,
    latest: data.termStructure.rows.at(-1), phase: risks.SPY.phase,
    priceConfirmation: Object.fromEntries(Object.entries(risks).map(([symbol, risk]) => [symbol, risk.priceConfirmation.status])),
  }, null, 2));
} catch {
  console.error('VIX live smoke: FAIL. Provider availability, completed dates or the verified data contract did not pass. No credentials are logged.');
  process.exitCode = 1;
}
