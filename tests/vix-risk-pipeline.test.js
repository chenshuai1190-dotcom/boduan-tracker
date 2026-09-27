import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVixComparisonData } from '../server/quote/vixComparison.js';
import { normalizeVixComparison } from '../src/lib/vixComparison.js';
import { buildVixRiskModel } from '../src/lib/vixRiskModel.js';
import { isVixComparisonSession } from '../src/lib/vixComparisonSession.js';

const cutoff = '2025-02-06';
const now = Date.parse(`${cutoff}T22:00:00Z`);
function rawFixture({ vix = 34, vix3m = 32 } = {}) {
  const dates = [];
  const cursor = new Date('2025-01-02T00:00:00Z');
  while (cursor.toISOString().slice(0, 10) <= cutoff) {
    const date = cursor.toISOString().slice(0, 10);
    if (isVixComparisonSession(date)) dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Object.fromEntries(['VIX', 'VIX3M', 'SPY', 'QQQ'].map(symbol => [symbol, dates.map((date, i) => ({
    date, close: symbol === 'VIX' ? vix : symbol === 'VIX3M' ? vix3m : 9999,
    adjusted_close: symbol === 'SPY' ? 100 + i : symbol === 'QQQ' ? 200 - i : 9999,
  }))]));
}
function pipeline(raw) {
  const original = structuredClone(raw);
  const wire = buildVixComparisonData(raw, { expectedAsOfDate: cutoff, now });
  const client = normalizeVixComparison(wire, { now });
  assert.ok(client, 'wire contract survives new calendar');
  assert.deepEqual(raw, original, 'market input is never changed');
  const risk = buildVixRiskModel({
    termStructure: client.termStructure,
    benchmarks: Object.fromEntries(['SPY', 'QQQ'].map(symbol => [symbol, client.series[symbol].rows])),
    expectedAsOfDate: client.expectedAsOfDate, stale: client.termStructure.stale,
  });
  return { wire, client, risk };
}

test('provider to client to model preserves raw ratio precision and independent adjusted ETF prices', () => {
  const { risk, client } = pipeline(rawFixture({ vix: 34.02, vix3m: 34.0201 }));
  assert.equal(risk.latest.ratio.toFixed(3), '1.000');
  assert.ok(risk.latest.ratio < 1);
  assert.equal(risk.currentRiskLevel, 'ELEVATED');
  assert.equal(risk.termStructure, 'NEAR_FLAT');
  assert.equal(risk.currentInversionDays, 0);
  assert.equal(risk.ready, true);
  assert.equal(risk.priceAction.SPY.status, 'RECOVERY');
  assert.equal(risk.priceAction.QQQ.status, 'NEW_LOW');
  assert.ok(client.series.SPY.rows.every(row => row.close < 200));
  assert.equal(risk.dataQuality.missingSessions.length, 0, 'official Jan 9 closure does not create a provider gap');
});

test('unpaired latest Cboe date cannot create a ratio from two dates; complete ETF prices remain available', () => {
  const raw = rawFixture(); raw.VIX3M.pop();
  const { risk, client } = pipeline(raw);
  assert.equal(client.termStructure.stale, true);
  assert.notEqual(client.termStructure.asOfDate, cutoff);
  assert.equal(risk.currentRiskLevel, 'UNKNOWN');
  assert.equal(risk.termStructure, 'UNKNOWN');
  assert.equal(risk.priceAction.SPY.ready, true);
  assert.equal(risk.priceAction.QQQ.ready, true);
});

test('legacy common-date API may truncate ETFs, but cannot suppress a complete current volatility pair', () => {
  const raw = rawFixture(); raw.SPY.pop();
  const { risk, client } = pipeline(raw);
  assert.equal(client.stale, true);
  assert.equal(client.termStructure.stale, false);
  assert.equal(risk.currentRiskLevel, 'EXTREME_STRESS');
  assert.equal(risk.ready, true);
  assert.equal(risk.priceAction.SPY.ready, false);
  assert.equal(risk.priceAction.QQQ.ready, false, 'existing wire contract keeps ETF dates common; absent closes stay unknown');
  assert.ok(risk.dataQuality.issues.some(issue => issue.dimension === 'SPY' && issue.code === 'provider_missing'));
});
