import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

import { GATE_MATRIX, resolveFastTests, verifyReleaseNotes } from '../scripts/run-gate.mjs';
import {
  expectedWorkflows,
  extractEntryAsset,
  inspectReleaseState,
  parseReleaseArgs,
} from '../scripts/release-verify-core.mjs';
import { CURRENT_RELEASE } from '../src/lib/releaseMeta.js';
import { settingsChangelog } from '../src/lib/settingsChangelog.js';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('FAST includes the shared palette contract when watchlist dialog inputs change', () => {
  const paletteTest = 'tests/module-palette-boundaries.test.js';
  for (const file of [
    'src/tabs/HomeTab.jsx',
    'src/tabs/HomeTab.css',
    'src/tabs/HomeWatchlistDialogs.css',
    'src/components/StockReportModal.jsx',
    'src/components/StockReportModal.css',
  ]) {
    assert.deepEqual(resolveFastTests([], [file]), [paletteTest], file);
  }
  const watchlistTest = 'tests/home-watchlist-dialogs.test.js';
  assert.deepEqual(resolveFastTests([watchlistTest], []), [watchlistTest, paletteTest]);
  assert.deepEqual(resolveFastTests([watchlistTest, paletteTest], ['src/tabs/HomeTab.jsx']), [watchlistTest, paletteTest]);
  assert.deepEqual(resolveFastTests([], ['src/pages/DcaLabPage.jsx', 'README.md']), []);
  assert.deepEqual(resolveFastTests(['tests/watchlist-reorder.test.js'], []), ['tests/watchlist-reorder.test.js']);
});

test('FAST selects direct cross-module source references and changed tests without running unrelated tests', () => {
  const changedFile = 'src/pages/HomeMarginRiskPage.jsx';
  const cashTest = 'tests/home-available-cash-ui.test.js';
  const marginTest = 'tests/home-margin-report-ui.test.js';
  const sources = {
    [cashTest]: read(cashTest),
    [marginTest]: read(marginTest),
    'tests/development-flow.test.js': "import { GATE_MATRIX } from '../scripts/run-gate.mjs';",
    'tests/unrelated.test.js': "read('src/pages/DcaLabPage.jsx');",
    'tests/new-display.test.js': "test('new presentation', () => {});",
  };
  assert.deepEqual(resolveFastTests([marginTest], [changedFile], sources), [marginTest, cashTest]);
  assert.deepEqual(resolveFastTests([], ['tests/new-display.test.js'], sources), ['tests/new-display.test.js']);
  assert.deepEqual(resolveFastTests([], ['scripts/run-gate.mjs'], sources), ['tests/development-flow.test.js']);
  assert.deepEqual(resolveFastTests([], ['README.md'], sources), []);
  assert.deepEqual(resolveFastTests([], ['tests/deleted.test.js'], sources), []);
  assert.deepEqual(resolveFastTests([cashTest], [changedFile], sources), [cashTest, marginTest]);
  assert.ok(read('scripts/run-gate.mjs').includes('resolveFastTests(targetedTests, changedPaths, readTestSources())'),
    'the real FAST entry must load repository tests into the resolver');
  assert.ok(read('scripts/run-gate.mjs').includes("['ls-files', '--others', '--exclude-standard', '-z']"),
    'new source directories must expose individual untracked file paths');
  assert.ok(read('scripts/run-gate.mjs').includes('gate targeted-tests:'), 'print selected tests so the scope is auditable');
});

test('development gates expose one explicit docs, FAST, or FULL path', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.deepEqual(GATE_MATRIX.docs, ['docs-consistency', 'whitespace']);
  assert.deepEqual(GATE_MATRIX.fast, ['release-notes', 'targeted-and-related-tests', 'typography', 'build', 'docs-consistency-if-applicable', 'whitespace']);
  assert.deepEqual(GATE_MATRIX.full, ['release-notes', 'full-tests-including-typography', 'build', 'docs-consistency-if-applicable', 'whitespace']);
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

test('a production change requires a version bump and bilingual release notes that retain the previous version', () => {
  const previousVersion = 'v10.7.9.99';
  const release = { version: 'v10.7.9.100', date: '2026-11-26' };
  const latest = { ver: release.version, date: release.date, latest: true, items: ['修复持仓估值'], itemsEn: ['Fixed portfolio valuation'] };
  const changelog = [latest, { ver: previousVersion }];
  const paths = ['src/lib/releaseMeta.js', 'src/lib/settingsChangelog.js'];
  const check = (overrides = {}) => verifyReleaseNotes({ paths, release, previousVersion, changelog, ...overrides });
  for (const path of ['src/App.jsx', 'src/tabs/HomeTab.css', 'server/quote/providers/eodhd.js', 'api/quote.js']) {
    for (const updates of [[], [paths[0]], [paths[1]]]) {
      assert.throws(() => check({ paths: [path, ...updates] }), /update.*together/);
    }
    assert.doesNotThrow(() => check({ paths: [path, ...paths] }));
  }
  assert.throws(() => check({ previousVersion: release.version }), /Advance the app version/);
  assert.throws(() => check({ changelog: [latest] }), /retain the preceding release/);
  assert.throws(() => check({ changelog: [{ ...latest, itemsEn: [] }, ...changelog.slice(1)] }), /Chinese and English/);
  assert.doesNotThrow(() => check({ paths: ['docs/handoff.md', 'tests/foo.test.js', 'src/dev/Fixture.jsx', 'scripts/run-gate.mjs'] }));
  const internal = { paths: ['src/lib/investmentSummary.js'], internalReasons: ['Extract unchanged valuation calculation'] };
  assert.doesNotThrow(() => check(internal));
  assert.throws(() => check({ ...internal, internalReasons: ['', ...internal.internalReasons] }), /update.*together/);
});

test('CI fails closed when the release range cannot be read', () => {
  for (const [base, head] of [['', 'HEAD'], ['0'.repeat(40), 'HEAD'], ['invalid-release-base', 'HEAD'], ['HEAD', 'invalid-release-head']]) {
    const result = spawnSync(process.execPath, ['scripts/run-gate.mjs', 'fast'], {
      encoding: 'utf8', env: { ...process.env, CI: 'true', BASE_SHA: base, GITHUB_SHA: head },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAIL release diff/);
    assert.doesNotMatch(result.stdout, /gate: PASS/);
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
