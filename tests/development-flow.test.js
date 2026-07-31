import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { GATE_MATRIX } from '../scripts/run-gate.mjs';
import {
  expectedWorkflows,
  extractEntryAsset,
  inspectReleaseState,
  parseReleaseArgs,
} from '../scripts/release-verify-core.mjs';
import { CURRENT_RELEASE } from '../src/lib/releaseMeta.js';
import { settingsChangelog } from '../src/lib/settingsChangelog.js';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('development gates expose one explicit docs, FAST, or FULL path', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.deepEqual(GATE_MATRIX.docs, ['docs-consistency', 'whitespace']);
  assert.deepEqual(GATE_MATRIX.fast, ['targeted-tests-if-provided', 'typography', 'build', 'docs-consistency-if-applicable', 'whitespace']);
  assert.deepEqual(GATE_MATRIX.full, ['full-tests-including-typography', 'build', 'docs-consistency-if-applicable', 'whitespace']);
  assert.equal(packageJson.scripts['check:docs'], 'node scripts/run-gate.mjs docs');
  assert.equal(packageJson.scripts['check:fast'], 'node scripts/run-gate.mjs fast');
  assert.equal(packageJson.scripts['check:full'], 'node scripts/run-gate.mjs full');
  assert.equal(packageJson.scripts['release:verify'], 'node scripts/release-verify.mjs');

  for (const retired of [
    'check',
    'verify:docs-consistency',
    'verify:deploy-status',
    'verify:frontend-smoke',
    'verify:workspace-state',
    'verify:toolchain',
    'verify:local-env',
    'bootstrap:vercel-link',
  ]) {
    assert.equal(packageJson.scripts[retired], undefined, `${retired} must stay retired`);
  }
});

test('release verifier waits for the exact workflows and Vercel without treating pending as failure', () => {
  const sha = 'abcdef1234567890';
  const changedPaths = ['src/App.jsx', 'docs/development-process.md'];
  assert.deepEqual(expectedWorkflows('full', changedPaths), ['CI', 'Docs']);

  const pending = inspectReleaseState({
    scope: 'full',
    sha,
    changedPaths,
    runs: [{ name: 'CI', headSha: sha, status: 'in_progress', conclusion: null }],
    commitStatus: { statuses: [{ context: 'Vercel', state: 'pending' }] },
  });
  assert.equal(pending.ready, false);
  assert.deepEqual(pending.failures, []);
  assert.ok(pending.pending.includes('CI:in_progress'));
  assert.ok(pending.pending.includes('Docs:missing'));
  assert.ok(pending.pending.includes('Vercel:pending'));

  const ready = inspectReleaseState({
    scope: 'full',
    sha,
    changedPaths,
    runs: [
      { name: 'CI', headSha: sha, status: 'completed', conclusion: 'success' },
      { name: 'Docs', headSha: sha, status: 'completed', conclusion: 'success' },
    ],
    commitStatus: { statuses: [{ context: 'Vercel', state: 'success', target_url: 'https://vercel.test' }] },
  });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.pending, []);
  assert.deepEqual(ready.failures, []);
});

test('docs release scope skips Vercel and release arguments stay bounded', () => {
  const parsed = parseReleaseArgs(['docs', 'abc1234'], {
    RELEASE_VERIFY_TIMEOUT_MS: '9999999',
    RELEASE_VERIFY_POLL_MS: '1',
  });
  assert.equal(parsed.timeoutMs, 600_000);
  assert.equal(parsed.pollMs, 1_000);

  const state = inspectReleaseState({
    scope: 'docs',
    sha: 'abc1234',
    changedPaths: ['README.md'],
    runs: [{ name: 'Docs', headSha: 'abc1234ffff', status: 'completed', conclusion: 'success' }],
    commitStatus: null,
  });
  assert.equal(state.ready, true);
  assert.equal(state.vercelState, 'not-required');
  assert.equal(extractEntryAsset('<script src="/assets/index-AbCd123.js"></script>'), '/assets/index-AbCd123.js');
});

test('settings version has one source and changelog history is structurally valid', () => {
  const settingsSource = read('src/tabs/SettingsTab.jsx');
  const versions = settingsChangelog.map((entry) => entry.ver);
  const latestEntries = settingsChangelog.filter((entry) => entry.latest === true);

  assert.match(CURRENT_RELEASE.version, /^v\d+\.\d+\.\d+\.\d+$/);
  assert.match(CURRENT_RELEASE.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(settingsChangelog[0].ver, CURRENT_RELEASE.version);
  assert.equal(settingsChangelog[0].date, CURRENT_RELEASE.date);
  assert.equal(latestEntries.length, 1);
  assert.equal(latestEntries[0], settingsChangelog[0]);
  assert.equal(new Set(versions).size, versions.length);
  assert.ok(settingsChangelog.every((entry) => Array.isArray(entry.items) && entry.items.length > 0));
  assert.ok(Array.isArray(settingsChangelog[0].itemsEn) && settingsChangelog[0].itemsEn.length > 0);
  assert.ok(settingsSource.includes("import { SETTINGS_VERSION } from '../lib/releaseMeta.js'"));
  assert.equal(/const SETTINGS_VERSION\s*=\s*['"]v/.test(settingsSource), false);
});
