import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { localMonthKey, shiftMonthKey } from '../src/lib/calendarMonth.js';

const modulePath = fileURLToPath(new URL('../src/lib/calendarMonth.js', import.meta.url));
const analysisSource = readFileSync(new URL('../src/tabs/AnalysisTab.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

function localMonthInTimeZone(isoDate, timeZone) {
  const script = `import { localMonthKey } from ${JSON.stringify(modulePath)}; process.stdout.write(localMonthKey(new Date(${JSON.stringify(isoDate)})));`;
  return execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
    env: { ...process.env, TZ: timeZone },
  });
}

test('localMonthKey follows the device calendar month instead of UTC', () => {
  assert.equal(localMonthInTimeZone('2026-08-31T23:30:00.000Z', 'Europe/London'), '2026-09');
  assert.equal(localMonthInTimeZone('2026-07-31T17:00:00.000Z', 'Asia/Shanghai'), '2026-08');
});

test('localMonthKey formats a local date-like value safely', () => {
  assert.equal(localMonthKey({ getFullYear: () => 2026, getMonth: () => 0 }), '2026-01');
  assert.equal(localMonthKey({}), '');
});

test('shiftMonthKey crosses year boundaries without UTC date parsing', () => {
  assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
  assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
  assert.equal(shiftMonthKey('2026-13', 1), '');
  assert.equal(shiftMonthKey('2026-07', 0.5), '');
});

test('snapshot entry reads and pins the local month at every mutation boundary', () => {
  assert.match(appSource, /useState\(\(\) => localMonthKey\(\)\)/);
  assert.equal((analysisSource.match(/setFillMonth\(localMonthKey\(\)\)/g) || []).length, 1);
  assert.doesNotMatch(analysisSource, /setFillMonth\(month\);/);
  assert.match(analysisSource, /setSelectedAssetCategoryMonth\(month\);/);
  assert.doesNotMatch(analysisSource, /setFillMonth\(currentMonth\)/);
  assert.match(analysisSource, /const editMonth = localMonthKey\(\);/);
  assert.match(analysisSource, /month: editMonth,/);
  assert.match(analysisSource, /const snapshotMonth = accountEditDraft\.month \|\| localMonthKey\(\);/);
  assert.equal((analysisSource.match(/const snapshotMonth = localMonthKey\(\);/g) || []).length, 1);
  assert.doesNotMatch(analysisSource, /upsertSnapshot\(saved\.id, currentMonth/);
});
