import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPnlReportViewModel } from '../src/lib/pnlReportViewModel.js';

const source = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const fixtureSource = source.slice(source.indexOf('const mockPnlPortfolioSnapshotRows = ['), source.indexOf('const mockPnlBenchmarkRows = ['));
const buildSnapshots = new Function(`${fixtureSource}; return buildMockPnlPortfolioSnapshots;`)();

test('local financing demo provides dated snapshots through the production view model without changing default fixtures', () => {
  const snapshots = buildSnapshots('financing_daily');
  assert.equal(snapshots.length, 21);
  assert.equal(new Set(snapshots.map(row => row.snapshotDate)).size, 21);
  assert.equal(snapshots.some(row => row.snapshotDate === '2026-06-19'), false);
  snapshots.forEach(row => {
    assert.ok(![0, 6].includes(new Date(`${row.snapshotDate}T00:00:00Z`).getUTCDay()));
    assert.equal(row.netAssetsUsd, row.totalAssetsUsd - row.marginDebtUsd);
    assert.equal(row.totalAssetsUsd, row.marketValueUsd + row.cashUsd);
    assert.ok(row.marginDebtEventId.startsWith('dev_'));
  });
  const report = buildPnlReportViewModel({
    portfolioSnapshots: snapshots, range: 'all', benchmarkRows: [],
    now: new Date('2026-07-01T22:00:00Z'),
  });
  assert.equal(report.trend.length, snapshots.length);
  assert.deepEqual(report.trend.map(point => [point.date, point.marginDebtUsd]), snapshots.map(row => [row.snapshotDate, row.marginDebtUsd]));
  assert.equal(report.trend.at(-1).cashUsd, 120000);
  assert.equal(buildSnapshots('known').length, 8);
  assert.equal(buildSnapshots('unknown').find(row => row.snapshotDate === '2026-04-22').marginDebtUsd, null);
});
