#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { docsWorkflowApplies } from './release-verify-core.mjs';

export const GATE_MATRIX = Object.freeze({
  docs: ['docs-consistency', 'whitespace'],
  fast: ['targeted-tests-if-provided', 'typography', 'build', 'docs-consistency-if-applicable', 'whitespace'],
  full: ['full-tests-including-typography', 'build', 'docs-consistency-if-applicable', 'whitespace'],
});

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
  const hasBase = gitObjectExists(base);
  let result;
  if (hasBase) {
    result = spawnSync('git', ['diff', '--name-only', base, head], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
  } else {
    result = spawnSync('git', ['status', '--porcelain=v1'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
  }
  if (result.error || result.status !== 0) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (hasBase) return line;
      const pathText = line.slice(2).trim();
      return pathText.includes(' -> ') ? pathText.split(' -> ').at(-1) : pathText;
    });
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

  if (scope === 'docs') {
    run('node', ['scripts/verify-docs-consistency.mjs'], 'docs-consistency');
  }
  if (scope === 'fast') {
    if (targetedTests.length > 0) run('node', ['--test', ...targetedTests], 'targeted-tests');
    run('node', ['scripts/verify-typography.mjs'], 'typography');
    run('npm', ['run', 'build'], 'build');
  }
  if (scope === 'full') {
    run('npm', ['test'], 'full-tests-including-typography');
    run('npm', ['run', 'build'], 'build');
  }

  if (!process.env.CI && scope !== 'docs' && docsWorkflowApplies(changedPathsForGate())) {
    run('node', ['scripts/verify-docs-consistency.mjs'], 'docs-consistency');
  }

  runWhitespace(scope);
  console.log(`gate: PASS ${scope} (${Math.round(performance.now() - totalStartedAt)}ms)`);
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) main();
