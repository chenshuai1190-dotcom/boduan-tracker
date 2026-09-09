#!/usr/bin/env node
// Explicit bounded, read-only provider verification. Never run from CI/gates.
// Capture only public prices; never persist credential-bearing provider URLs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDcaHistory } from '../server/quote/investmentComparison.js';
import { deriveObservation, getSamePeriodReturn } from '../src/lib/drawdownObservationModel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SYMBOLS = ['SPY', 'QQQ', 'NVDA'];
const DAY_MS = 86_400_000;
const requestedPaths = new Set(SYMBOLS.flatMap(symbol => [`/api/search/${symbol}`, `/api/eod/${symbol}.US`]));
const closeEnough = (actual, expected, label) => assert.ok(
  typeof actual === 'number' && Number.isFinite(actual)
    && Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-10,
  label,
);

async function main() {
  for (const filename of [path.join(root, '.env.local'), path.join(process.env.HOME || '', '.config/boduan-tracker/eodhd.env')]) {
    if (fs.existsSync(filename)) process.loadEnvFile(filename);
  }
  const eodhdKey = String(process.env.EODHD_API_KEY || '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!eodhdKey) throw new Error('EODHD_API_KEY required; credentials are never printed');

  const calls = [];
  const raw = new Map();
  const captureFetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://eodhd.com', 'only the existing EODHD provider is in scope');
    assert.ok(requestedPaths.has(url.pathname), 'unexpected provider request');
    assert.ok(!calls.includes(url.pathname), 'at most one identity and history request per symbol');
    assert.ok(calls.length < SYMBOLS.length * 2, 'bounded provider request budget');
    calls.push(url.pathname);
    const response = await fetch(input, options);
    if (response.ok && url.pathname.startsWith('/api/eod/')) {
      raw.set(url.pathname.split('/').at(-1).replace(/\.US$/, ''), await response.clone().json());
    }
    return response;
  };

  const histories = {};
  const results = [];
  const rawAdjustedClose = {};
  for (const symbol of SYMBOLS) {
    const data = await fetchDcaHistory(symbol, { eodhdKey, fetchImpl: captureFetch });
    assert.equal(data.source, 'EODHD_EOD');
    assert.equal(data.priceBasis, 'adjusted_close');
    assert.ok(Array.isArray(raw.get(symbol)), 'raw provider history was captured');
    // Independent oracle: no production helper chooses the high, low, or closes.
    const providerRows = raw.get(symbol)
      .filter(row => row.date >= '2000-01-01' && row.date <= data.asOfDate)
      .map(row => ({ date: row.date, adjusted_close: Number(row.adjusted_close) }))
      .sort((left, right) => left.date.localeCompare(right.date));
    assert.ok(providerRows.every(row => Number.isFinite(row.adjusted_close) && row.adjusted_close > 0), 'raw adjusted prices must exist');
    const byDate = new Map(providerRows.map(row => [row.date, row.adjusted_close]));
    assert.equal(byDate.size, providerRows.length, 'provider dates must be unique');
    assert.equal(data.rows.length, providerRows.length, 'wire history must preserve all eligible provider dates');
    for (const row of data.rows) closeEnough(row.close, byDate.get(row.date), `${symbol}: wire adjusted price differs`);

    const windowStart = new Date(Date.parse(`${data.asOfDate}T00:00:00Z`) - 364 * DAY_MS).toISOString().slice(0, 10);
    const windowRows = providerRows.filter(row => row.date >= windowStart);
    const high = Math.max(...windowRows.map(row => row.adjusted_close));
    const highDate = windowRows.filter(row => row.adjusted_close === high).at(-1).date;
    const latest = providerRows.at(-1);
    const previous = providerRows.at(-2);
    const instrument = { symbol, name: data.name, kind: data.type === 'ETF' ? 'etf' : 'stock', points: data.rows };
    const row = deriveObservation(instrument, data.asOfDate);
    closeEnough(row.price, latest.adjusted_close, `${symbol}: latest adjusted close differs`);
    closeEnough(row.previousClose, previous.adjusted_close, `${symbol}: previous adjusted close differs`);
    closeEnough(row.high, high, `${symbol}: rolling 52-week highest adjusted close differs`);
    assert.equal(row.highDate, highDate, `${symbol}: latest equal high date differs`);
    closeEnough(row.todayPct, (latest.adjusted_close / previous.adjusted_close - 1) * 100, `${symbol}: daily return differs`);
    closeEnough(row.drawdownPct, (latest.adjusted_close / high - 1) * 100, `${symbol}: current drawdown differs`);
    closeEnough(row.recoveryPct, (high / latest.adjusted_close - 1) * 100, `${symbol}: required gain to high differs`);
    closeEnough(row.elapsedDays, (Date.parse(data.asOfDate) - Date.parse(highDate)) / DAY_MS, `${symbol}: elapsed calendar days differ`);
    assert.equal(row.historySufficient, providerRows[0].date <= windowStart);

    const afterHigh = providerRows.filter(point => point.date > highDate);
    if (afterHigh.length) {
      const trough = Math.min(...afterHigh.map(point => point.adjusted_close));
      closeEnough(row.trough, trough, `${symbol}: subsequent trough differs`);
      assert.equal(row.troughDate, afterHigh.filter(point => point.adjusted_close === trough).at(-1).date);
      closeEnough(row.reboundPct, (latest.adjusted_close / trough - 1) * 100, `${symbol}: rebound from trough differs`);
    } else {
      assert.equal(row.trough, null);
      assert.equal(row.troughDate, null);
      assert.equal(row.reboundPct, null);
    }
    assert.equal(row.pointsSinceHigh.length, afterHigh.length + 1, 'chart starts exactly at the reference high');
    assert.equal(row.pointsSinceHigh[0].date, highDate);
    assert.equal(row.pointsSinceHigh.at(-1).date, data.asOfDate);
    for (const point of row.pointsSinceHigh) {
      assert.ok(point.date >= highDate && point.date <= data.asOfDate, 'chart date stays inside reference-high interval');
      assert.ok(point.drawdownPct >= -100 && point.drawdownPct <= 1e-10, 'chart cannot exceed high or lose more than 100%');
      closeEnough(point.close, byDate.get(point.date), `${symbol}: chart price differs from provider`);
      closeEnough(point.drawdownPct, (byDate.get(point.date) / high - 1) * 100, `${symbol}: chart drawdown differs from provider`);
    }
    const before = calls.length;
    const cached = await fetchDcaHistory(symbol, { eodhdKey, fetchImpl: captureFetch });
    assert.equal(calls.length, before, 'same-close page revisit must reuse identity and history caches');
    assert.deepEqual(cached.rows, data.rows);
    histories[symbol] = data;
    rawAdjustedClose[symbol] = providerRows;
    results.push({
      symbol, asOfDate: data.asOfDate, expectedAsOfDate: data.expectedAsOfDate,
      stale: data.stale, staleReason: data.staleReason, rows: data.rows.length,
      windowStart, highDate, high, price: row.price, dailyPct: row.todayPct,
      drawdownPct: row.drawdownPct, recoveryPct: row.recoveryPct,
      troughDate: row.troughDate, reboundPct: row.reboundPct,
      chartPoints: row.pointsSinceHigh.length, cachedProviderRequests: calls.length - before,
    });
  }
  for (const result of results) {
    result.samePeriod = {};
    for (const symbol of SYMBOLS) {
      const data = histories[symbol];
      const start = rawAdjustedClose[symbol].find(point => point.date === result.highDate)?.adjusted_close;
      const end = rawAdjustedClose[symbol].find(point => point.date === result.asOfDate)?.adjusted_close;
      const actual = getSamePeriodReturn({ points: data.rows }, result.highDate, result.asOfDate);
      if (start === undefined || end === undefined) assert.equal(actual, null, 'missing exact endpoint stays unavailable');
      else closeEnough(actual, (end / start - 1) * 100, 'same-period comparison uses exact shared dates');
      result.samePeriod[symbol] = actual;
    }
  }
  assert.equal(calls.filter(value => value.startsWith('/api/eod/')).length, SYMBOLS.length);
  assert.ok(calls.length <= SYMBOLS.length * 2);
  const report = { status: 'PASS', checkedAt: new Date().toISOString(), providerRequests: calls.length, results };
  const output = process.argv.find(value => value.startsWith('--output='))?.slice('--output='.length);
  if (output) {
    const destination = path.resolve(output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify({ ...report, source: 'EODHD_EOD', histories, rawAdjustedClose }, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch(cause => {
  // Do not dump fetch errors/stacks that could contain credential-bearing URLs.
  const message = cause?.code || (cause instanceof assert.AssertionError ? cause.message : 'READ_ONLY_PROVIDER_VERIFICATION_FAILED');
  console.error(JSON.stringify({ status: 'FAIL', reason: message }));
  process.exitCode = 1;
});
