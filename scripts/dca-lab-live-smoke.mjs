#!/usr/bin/env node
// Explicit bounded, read-only provider verification; never run by automated gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDcaHistory } from '../server/quote/investmentComparison.js';
import { buildDcaModel } from '../src/lib/dcaLabModel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const filename of [path.join(root, '.env.local'), path.join(process.env.HOME || '', '.config/boduan-tracker/eodhd.env')]) {
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}
const eodhdKey = String(process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
if (!eodhdKey) throw new Error('EODHD_API_KEY required; credentials are never printed');
const calls = [], raw = new Map();
const capture = async (input, options) => {
  const url = new URL(input);
  calls.push(url.pathname);
  const response = await fetch(input, options);
  if (response.ok && url.pathname.startsWith('/api/eod/')) raw.set(url.pathname.split('/').at(-1).replace(/\.US$/, ''), await response.clone().json());
  return response;
};
const close = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1, Math.abs(b)) * 1e-10);
const results = [];
for (const symbol of ['QQQ', 'NVDA']) {
  const data = await fetchDcaHistory(symbol, { eodhdKey, fetchImpl: capture });
  const providerRows = new Map(raw.get(symbol).map(row => [row.date, row]));
  const year = Number(data.expectedAsOfDate.slice(0, 4));
  for (const frequency of ['monthly', 'weekly']) {
    const plan = { symbol, startYear: 2020, endYear: year, initial: 10000, amount: 1000, frequency };
    const model = buildDcaModel({ data, plan });
    let invested = 0, units = 0, lastPeriod = '', count = 0;
    for (const [index, row] of model.rows.entries()) {
      const price = Number(providerRows.get(row.date)?.adjusted_close);
      assert.ok(Number.isFinite(price) && price > 0);
      close(row.price, price);
      const day = new Date(row.date + 'T00:00:00Z');
      const period = frequency === 'monthly' ? row.date.slice(0, 7)
        : Math.floor((day.getTime() / 86400000 + 3) / 7);
      const amount = (index === 0 ? plan.initial : 0) + (period !== lastPeriod ? plan.amount : 0);
      lastPeriod = period;
      if (amount > 0) { units += amount / price; invested += amount; count += 1; }
      close(row.contribution, amount);
      close(row.invested, invested);
      close(row.value, units * price);
      close(row.profit, units * price - invested);
      close(row.returnPct, (units * price / invested - 1) * 100);
    }
    close(model.summary.lumpValue, invested / Number(providerRows.get(model.startDate).adjusted_close) * Number(providerRows.get(model.endDate).adjusted_close));
    close(model.years.reduce((sum, item) => sum + item.profit, 0), model.summary.profit);
    assert.equal(count, model.summary.purchaseCount);
    const before = calls.length;
    await fetchDcaHistory(symbol, { eodhdKey, fetchImpl: capture });
    assert.equal(calls.length, before, 'same-close history must reuse provider cache');
    results.push({ symbol, frequency, startDate: model.startDate, endDate: model.endDate, expectedAsOfDate: data.expectedAsOfDate, stale: data.stale, points: model.rows.length, purchases: count, invested, value: model.summary.value, profit: model.summary.profit });
  }
}
assert.equal(calls.filter(value => value.startsWith('/api/eod/')).length, 2);
const report = { status: 'PASS', checkedAt: new Date().toISOString(), providerRequests: calls.length, results };
const output = process.argv.find(value => value.startsWith('--output='))?.slice('--output='.length);
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
