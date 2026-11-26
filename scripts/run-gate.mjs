#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { docsWorkflowApplies } from './release-verify-core.mjs';
import { CURRENT_RELEASE } from '../src/lib/releaseMeta.js';
import { settingsChangelog } from '../src/lib/settingsChangelog.js';

export const GATE_MATRIX = Object.freeze({
  docs: ['docs-consistency', 'whitespace'],
  fast: ['release-notes', 'targeted-and-related-tests', 'typography', 'build', 'docs-consistency-if-applicable', 'whitespace'],
  full: ['release-notes', 'full-tests-including-typography', 'build', 'docs-consistency-if-applicable', 'whitespace'],
});

const RELEASE_META = 'src/lib/releaseMeta.js';
const CHANGELOG = 'src/lib/settingsChangelog.js';

function productPaths(paths) {
  return paths.filter(file => file !== RELEASE_META && file !== CHANGELOG
    && !/\.md$/i.test(file) && !/^src\/(?:dev\/|DevVisualPreview\.jsx$)/.test(file)
    && /^(?:(?:src|public|api|server|supabase)\/|index\.html$|vercel\.json$)/.test(file));
}

export function verifyReleaseNotes({ paths, previousVersion, release, changelog, internalReasons = [] }) {
  if (!paths.includes(RELEASE_META) && !productPaths(paths).length) return;
  if (!paths.includes(RELEASE_META) && !paths.includes(CHANGELOG)
    && internalReasons.length && internalReasons.every(reason => reason.trim())) return;
  if (!paths.includes(RELEASE_META) || !paths.includes(CHANGELOG)) {
    throw new Error('User-visible releases must update src/lib/releaseMeta.js and src/lib/settingsChangelog.js together. For a behavior-preserving internal change, see docs/development-process.md.');
  }
  const latest = changelog[0];
  if (!previousVersion || release.version.localeCompare(previousVersion, 'en', { numeric: true }) <= 0
    || !changelog.slice(1).some(entry => entry.ver === previousVersion)
    || latest?.ver !== release.version || latest.date !== release.date || !latest.latest
    || ![latest.items, latest.itemsEn].every(items => Array.isArray(items) && items.some(text => typeof text === 'string' && text.trim()))) {
    throw new Error('Advance the app version, retain the preceding release, and add dated Chinese and English notes for the new release.');
  }
}

function gitText(args) {
  const git = spawnSync('git', args, { encoding: 'utf8' });
  if (git.status !== 0) throw new Error(git.stderr?.trim() || 'Cannot read the release diff');
  return git.stdout;
}

function checkReleaseNotes(paths) {
  const runtime = productPaths(paths);
  if (!runtime.length && !paths.includes(RELEASE_META)) return;
  const base = process.env.BASE_SHA || 'HEAD';
  const head = process.env.GITHUB_SHA || 'HEAD';
  let internalReasons = [];
  if (base !== 'HEAD' && runtime.length && !paths.includes(CHANGELOG) && !paths.includes(RELEASE_META)) {
    // A reason on an unrelated commit must not exempt a product change.
    const log = gitText(['log', '--format=%H%x09%(trailers:key=Release-Internal,valueonly,separator=%x20)', `${base}..${head}`, '--', ...runtime]);
    internalReasons = log.trimEnd().split('\n').filter(Boolean).map(line => line.split('\t')[1] || '');
  }
  const previousVersion = gitText(['show', `${base}:${RELEASE_META}`]).match(/\bversion:\s*['"](v[\d.]+)['"]/)?.[1];
  verifyReleaseNotes({ paths, previousVersion, release: CURRENT_RELEASE, changelog: settingsChangelog, internalReasons });
  console.log('gate step: PASS release-notes');
}

const WATCHLIST_PALETTE_INPUTS = new Set([
  'src/tabs/HomeTab.jsx',
  'src/tabs/HomeTab.css',
  'src/tabs/HomeWatchlistDialogs.css',
  'src/components/StockReportModal.jsx',
  'src/components/StockReportModal.css',
  'tests/home-watchlist-dialogs.test.js',
  'tests/home-watchlist-report-ui.test.js',
  'tests/home-report-ui.test.js',
  'tests/module-palette-boundaries.test.js',
]);

export function resolveFastTests(targetedTests, changedPaths, testSources = {}) {
  const selected = new Set(targetedTests);
  if ([...targetedTests, ...changedPaths].some((file) => WATCHLIST_PALETTE_INPUTS.has(file))) {
    selected.add('tests/module-palette-boundaries.test.js');
  }
  const sourcePaths = changedPaths.filter((file) => /^(src|scripts)\//.test(file));
  for (const [testFile, source] of Object.entries(testSources)) {
    if (!/^tests\/[^/]+\.test\.js$/.test(testFile)) continue;
    if (changedPaths.includes(testFile) || sourcePaths.some((file) => source.includes(file))) {
      selected.add(testFile);
    }
  }
  return [...selected];
}

function readTestSources() {
  return Object.fromEntries(readdirSync('tests', { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => `tests/${entry.name}`)
    .sort()
    .map((file) => [file, readFileSync(file, 'utf8')]));
}

function run(command, args, label) {
  const startedAt = performance.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (result.error || result.status !== 0) {
    console.error(`gate step: FAIL ${label} (${elapsedMs}ms)`);
    process.exit(result.status || 1);
  }
  console.log(`gate step: PASS ${label} (${elapsedMs}ms)`);
}

function validateTargetedTests(paths) {
  for (const file of paths) {
    if (!/^tests\/.+\.test\.js$/.test(file)) {
      throw new Error(`FAST targeted test must match tests/*.test.js: ${file}`);
    }
  }
}

function gitObjectExists(value) {
  if (!value || /^0+$/.test(value)) return false;
  const result = spawnSync('git', ['cat-file', '-e', `${value}^{commit}`], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  return result.status === 0;
}

function whitespaceArgs(scope) {
  const base = process.env.BASE_SHA;
  const head = process.env.GITHUB_SHA || 'HEAD';
  const markdownOnly = scope === 'docs' ? ['--', '*.md'] : [];
  if (gitObjectExists(base)) return ['diff', '--check', base, head, ...markdownOnly];
  if (process.env.CI) return ['show', '--check', '--oneline', head, ...markdownOnly];
  return ['diff', 'HEAD', '--check', ...markdownOnly];
}

function runWhitespace(scope) {
  const startedAt = performance.now();
  const tracked = spawnSync('git', whitespaceArgs(scope), {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (tracked.error || tracked.status !== 0) {
    console.error(`gate step: FAIL whitespace (${Math.round(performance.now() - startedAt)}ms)`);
    process.exit(tracked.status || 1);
  }

  if (!process.env.CI) {
    const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    if (untracked.error || untracked.status !== 0) {
      console.error(`gate step: FAIL whitespace (${Math.round(performance.now() - startedAt)}ms)`);
      process.exit(untracked.status || 1);
    }
    for (const file of String(untracked.stdout || '').split(/\r?\n/).filter(Boolean)) {
      if (scope === 'docs' && !file.endsWith('.md')) continue;
      const check = spawnSync('git', ['diff', '--no-index', '--check', '/dev/null', file], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      const warning = `${check.stdout || ''}${check.stderr || ''}`.trim();
      if (check.error || warning) {
        if (warning) console.error(warning);
        console.error(`gate step: FAIL whitespace (${Math.round(performance.now() - startedAt)}ms)`);
        process.exit(1);
      }
    }
  }

  console.log(`gate step: PASS whitespace (${Math.round(performance.now() - startedAt)}ms)`);
}

function changedPathsForGate() {
  const base = process.env.BASE_SHA;
  const head = process.env.GITHUB_SHA || 'HEAD';
  if ((base || process.env.CI) && !gitObjectExists(base)) {
    throw new Error('A valid BASE_SHA is required to check the committed release range.');
  }
  const range = base ? [base, head] : ['HEAD'];
  const tracked = gitText(['diff', '--no-renames', '--name-only', '-z', ...range, '--']);
  const untracked = base ? '' : gitText(['ls-files', '--others', '--exclude-standard', '-z']);
  return (tracked + untracked).split('\0').filter(Boolean);
}

function usage() {
  return 'usage: node scripts/run-gate.mjs <docs|fast|full> [tests/<name>.test.js ...]';
}

function main(argv = process.argv.slice(2)) {
  const [scope, ...targetedTests] = argv;

  if (!Object.hasOwn(GATE_MATRIX, scope)) {
    console.error(usage());
    process.exit(1);
  }
  if (scope !== 'fast' && targetedTests.length > 0) {
    console.error(`${scope.toUpperCase()} does not accept targeted test arguments`);
    process.exit(1);
  }

  try {
    validateTargetedTests(targetedTests);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const totalStartedAt = performance.now();
  let changedPaths;
  try {
    changedPaths = changedPathsForGate();
    if (scope !== 'docs') checkReleaseNotes(changedPaths);
  } catch (error) {
    console.error(`gate step: FAIL release diff — ${error.message}`);
    process.exit(1);
  }
  if (scope === 'docs') {
    run('node', ['scripts/verify-docs-consistency.mjs'], 'docs-consistency');
  }
  if (scope === 'fast') {
    const fastTests = resolveFastTests(targetedTests, changedPaths, readTestSources());
    if (fastTests.length > 0) console.log(`gate targeted-tests: ${fastTests.join(', ')}`);
    if (fastTests.length > 0) run('node', ['--test', ...fastTests], 'targeted-tests');
    run('node', ['scripts/verify-typography.mjs'], 'typography');
    run('npm', ['run', 'build'], 'build');
  }
  if (scope === 'full') {
    run('npm', ['test'], 'full-tests-including-typography');
    run('npm', ['run', 'build'], 'build');
  }

  if (!process.env.CI && scope !== 'docs' && docsWorkflowApplies(changedPaths)) {
    run('node', ['scripts/verify-docs-consistency.mjs'], 'docs-consistency');
  }

  runWhitespace(scope);
  console.log(`gate: PASS ${scope} (${Math.round(performance.now() - totalStartedAt)}ms)`);
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) main();
