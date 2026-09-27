#!/usr/bin/env node
// Offline, read-only replay of captured public market data. No keys or network.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { buildVixRiskModel } from '../src/lib/vixRiskModel.js';
import { isVixComparisonSession } from '../src/lib/vixComparisonSession.js';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const equals = value.indexOf('=');
  return [value.slice(2, equals), value.slice(equals + 1)];
}));
if (!args.recent || !args.earlier || !args.output) {
  throw new Error('Usage: node scripts/vix-risk-replay.mjs --recent=<JSON> --earlier=<JSON> --output=<directory> [--holdout=1]');
}
const output = path.resolve(args.output);
fs.mkdirSync(output, { recursive: true });
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const read = filename => JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
const inputFiles = { recent: path.resolve(args.recent), earlier: path.resolve(args.earlier) };
const hashesBefore = Object.fromEntries(Object.entries(inputFiles).map(([key, name]) => [key, sha256(fs.readFileSync(name))]));
const inputs = { recent: read(args.recent), earlier: read(args.earlier) };
const selectedDates = [
  '2020-02-27','2020-03-04','2020-03-16',
  '2022-03-07','2022-06-13','2023-03-13',
  '2024-08-05','2024-08-07','2024-08-09','2024-12-18',
  '2025-04-03','2025-04-04','2025-04-07','2025-04-08','2025-04-23',
  '2026-03-20','2026-03-23','2026-03-27','2026-03-30','2026-04-02','2026-04-07','2026-04-08',
];
const sessions = (from, to) => {
  const result = [];
  for (const cursor = new Date(`${from}T00:00:00Z`); cursor.toISOString().slice(0, 10) <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    if (isVixComparisonSession(date)) result.push(date);
  }
  return result;
};
function evaluate(data, date, full = false) {
  const clip = rows => full ? rows : rows.filter(row => row.date <= date);
  return buildVixRiskModel({
    termStructure: { ...data.termStructure, rows: clip(data.termStructure.rows), asOfDate: date, expectedAsOfDate: date, stale: false, staleReason: '' },
    benchmarks: Object.fromEntries(['SPY', 'QQQ'].map(symbol => [symbol, clip(data.series[symbol].rows)])),
    expectedAsOfDate: date, stale: false,
  });
}
const countBy = (rows, accessor) => rows.reduce((counts, row) => {
  const key = accessor(row); counts[key] = (counts[key] ?? 0) + 1; return counts;
}, {});
const riskRank = { LOW_VOLATILITY: 0, NORMAL: 1, ELEVATED: 2, HIGH_STRESS: 3, EXTREME_STRESS: 4 };
function summarize(rows) {
  const reasonCounts = {};
  for (const row of rows) for (const issue of row.dataQuality.issues) {
    const key = `${issue.dimension}:${issue.code}`;
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
  }
  return {
    sessions: rows.length, ready: countBy(rows, row => String(row.ready)),
    currentRiskLevel: countBy(rows, row => row.currentRiskLevel),
    termStructure: countBy(rows, row => row.termStructure),
    riskDirection: countBy(rows, row => row.riskDirection),
    SPY: countBy(rows, row => row.priceAction.SPY.status), QQQ: countBy(rows, row => row.priceAction.QQQ.status),
    dataQuality: countBy(rows, row => row.dataQuality.status), reasonCounts,
    high25AndInverted: rows.filter(row => row.VIX > 25 && row.ratio >= 1).length,
    high30AndInverted: rows.filter(row => row.VIX >= 30 && row.ratio >= 1).length,
    high30NotInverted: rows.filter(row => row.VIX >= 30 && row.ratio < 1).length,
    unknownCurrent: rows.filter(row => row.currentRiskLevel === 'UNKNOWN').map(row => ({ date: row.date, reason: row.reason })),
    prolongedInversionDays: rows.filter(row => row.durationTags.includes('PROLONGED_INVERSION')).length,
    years: Object.fromEntries([...new Set(rows.map(row => row.date.slice(0, 4)))].map(year => [year, countBy(rows.filter(row => row.date.startsWith(year)), row => row.currentRiskLevel)])),
  };
}
const sets = [
  { id: 'regression-2020-h1', data: inputs.earlier, from: '2020-01-01', to: '2020-06-30' },
  { id: 'regression-2021-2026', data: inputs.recent, from: '2021-09-27', to: '2026-09-25' },
];
if (args.holdout === '1') sets.push({ id: 'holdout-2017-2019', data: inputs.earlier, from: '2017-01-01', to: '2019-12-31' });
const results = [];
let cutoffChecks = 0;
for (const set of sets) {
  const rows = [];
  for (const date of sessions(set.from, set.to)) {
    const model = evaluate(set.data, date);
    assert.deepEqual(evaluate(set.data, date, true), model, `${date}: full vs physically truncated history`);
    cutoffChecks += 1;
    const latest = model.latest;
    if (latest?.date === date) {
      assert.ok(Object.hasOwn(riskRank, model.currentRiskLevel), `${date}: valid pair has complete risk coverage`);
      if (latest.vix >= 30 && latest.ratio >= 1) assert.equal(model.currentRiskLevel, 'EXTREME_STRESS', `${date}: invariant 1`);
      if (latest.vix > 25 && latest.ratio >= 1) assert.ok(riskRank[model.currentRiskLevel] >= 3, `${date}: invariant 2`);
      if (latest.ratio < 1) assert.equal(model.currentInversionDays, 0, `${date}: inversion reset`);
      if (latest.vix > 25 && latest.ratio >= 1 && model.currentInversionDays < 15) assert.ok(riskRank[model.currentRiskLevel] >= 3, `${date}: invariant 4`);
    }
    for (const event of model.eventFlags) assert.ok(event.date <= date, `${date}: no future event`);
    for (const price of Object.values(model.priceAction)) assert.ok(!price.lowDate || price.lowDate <= date, `${date}: no future price reference`);
    rows.push({
      date, VIX: latest?.date === date ? latest.vix : null, VIX3M: latest?.date === date ? latest.vix3m : null,
      ratio: latest?.date === date ? latest.ratio : null,
      currentRiskLevel: model.currentRiskLevel, termStructure: model.termStructure, riskDirection: model.riskDirection,
      currentRiskDuration: model.currentRiskDuration, inversionDays: model.currentInversionDays,
      highStressDays: model.highStressDays, extremeStressDays: model.extremeStressDays,
      durationExact: model.durationExact, durationTags: model.durationTags,
      priceAction: model.priceAction, eventFlags: model.eventFlags,
      ready: model.ready, reason: model.reason, dataQuality: model.dataQuality,
      directionEvidence: model.facts.direction,
    });
  }
  fs.writeFileSync(path.join(output, `${set.id}.json`), JSON.stringify(rows, null, 2));
  const summary = summarize(rows);
  results.push({ id: set.id, from: set.from, to: set.to, summary, rows });
  console.log(JSON.stringify({ id: set.id, ...summary }));
}
const regression = results.filter(set => set.id.startsWith('regression')).flatMap(set => set.rows);
const selected = selectedDates.map(date => {
  const row = regression.find(row => row.date === date);
  assert.ok(row, `requested session ${date} is included`);
  return row;
});
const hashesAfter = Object.fromEntries(Object.entries(inputFiles).map(([key, name]) => [key, sha256(fs.readFileSync(name))]));
assert.deepEqual(hashesAfter, hashesBefore, 'input market captures are unchanged');
const summary = {
  generatedAt: new Date().toISOString(), schemaVersion: 2,
  rulesSha256: sha256(fs.readFileSync(new URL('../docs/vix-risk-model-v2.md', import.meta.url))),
  modelSha256: sha256(fs.readFileSync(new URL('../src/lib/vixRiskModel.js', import.meta.url))),
  inputFiles, inputSha256: hashesBefore,
  method: 'Each completed NYSE session is replayed with physically truncated data. Current revised historical series, not vintage availability. No future returns or prices used to calibrate rules. Mandatory ranges are previously exposed regression data. The 2017-2019 extra holdout is evaluated after rules freeze.',
  pointInTime: { wholeModelComparisons: cutoffChecks, passed: cutoffChecks },
  inputsUnchanged: true, sets: results.map(({ rows, ...set }) => set),
  combinedRegression: summarize(regression), combinedIncludingHoldout: summarize(results.flatMap(set => set.rows)),
};
fs.writeFileSync(path.join(output, 'selected-dates.json'), JSON.stringify(selected, null, 2));
fs.writeFileSync(path.join(output, 'replay-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ PASS: true, selected: selected.length, cutoffChecks, inputsUnchanged: true }));
