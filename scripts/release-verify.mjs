#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  extractEntryAsset,
  inspectReleaseState,
  parseReleaseArgs,
} from './release-verify-core.mjs';

const repo = 'chenshuai1190-dotcom/boduan-tracker';
const productionUrl = 'https://boduan-tracker.vercel.app';

function run(command, args = [], timeout = 30_000) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    timeout,
  });
}

function firstLine(value) {
  return String(value || '').trim().split(/\r?\n/).find(Boolean) || '';
}

function readJson(command, args, label) {
  const result = run(command, args);
  if (result.error || result.status !== 0) {
    return { error: `${label}: ${firstLine(result.stderr || result.stdout || result.error?.message)}` };
  }
  try {
    return { value: JSON.parse(result.stdout) };
  } catch (error) {
    return { error: `${label}: invalid JSON (${error.message})` };
  }
}

function changedPaths(sha) {
  const result = run('git', ['show', '--format=', '--name-only', sha]);
  if (result.error || result.status !== 0) {
    throw new Error(`cannot read changed paths for ${sha}: ${firstLine(result.stderr || result.stdout)}`);
  }
  return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function resolveFullSha(sha) {
  const result = run('git', ['rev-parse', `${sha}^{commit}`]);
  if (result.error || result.status !== 0) {
    throw new Error(`cannot resolve commit ${sha}: ${firstLine(result.stderr || result.stdout)}`);
  }
  return firstLine(result.stdout);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchProductionEntry() {
  const response = await fetch(productionUrl, {
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`production homepage returned HTTP ${response.status}`);
  const entry = extractEntryAsset(await response.text());
  if (!entry) throw new Error('production entry asset not found');
  return entry;
}

async function main() {
  let options;
  try {
    options = parseReleaseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`release verify: FAIL\nERROR: ${error.message}`);
    process.exit(1);
  }

  let paths;
  try {
    options.sha = resolveFullSha(options.sha);
    paths = changedPaths(options.sha);
  } catch (error) {
    console.error(`release verify: FAIL\nERROR: ${error.message}`);
    process.exit(1);
  }

  if (options.scope === 'docs' && paths.some((file) => !file.endsWith('.md'))) {
    console.error('release verify: FAIL');
    console.error('ERROR: docs scope only accepts Markdown-only commits; classify this release as fast or full');
    process.exit(1);
  }

  const startedAt = Date.now();
  let lastFingerprint = '';
  let lastQueryError = '';
  let state = null;

  while (Date.now() - startedAt <= options.timeoutMs) {
    const [statusResult, runsResult] = [
      options.scope === 'docs'
        ? { value: null }
        : readJson('gh', ['api', `repos/${repo}/commits/${options.sha}/status`], 'GitHub commit status'),
      readJson('gh', [
        'run', 'list', '--repo', repo, '--commit', options.sha, '--limit', '20', '--json',
        'databaseId,headSha,name,status,conclusion,displayTitle,url',
      ], 'GitHub Actions runs'),
    ];

    if (statusResult.error || runsResult.error) {
      lastQueryError = statusResult.error || runsResult.error;
    } else {
      lastQueryError = '';
      state = inspectReleaseState({
        scope: options.scope,
        sha: options.sha,
        changedPaths: paths,
        runs: runsResult.value,
        commitStatus: statusResult.value,
      });

      if (state.failures.length > 0) {
        console.error('release verify: FAIL');
        for (const failure of state.failures) console.error(`ERROR: ${failure}`);
        process.exit(1);
      }
      if (state.ready) break;

      const fingerprint = state.pending.join(',');
      if (fingerprint !== lastFingerprint) {
        console.log(`release verify: WAIT ${fingerprint}`);
        lastFingerprint = fingerprint;
      }
    }

    await delay(options.pollMs);
  }

  if (!state?.ready) {
    console.error('release verify: FAIL');
    console.error(`ERROR: timed out after ${options.timeoutMs}ms${lastQueryError ? `; ${lastQueryError}` : ''}`);
    process.exit(1);
  }

  let productionEntry = null;
  if (options.scope !== 'docs') {
    try {
      productionEntry = await fetchProductionEntry();
    } catch (error) {
      console.error('release verify: FAIL');
      console.error(`ERROR: ${error.message}`);
      process.exit(1);
    }
  }

  console.log('release verify: PASS');
  console.log(`- scope=${options.scope}`);
  console.log(`- commit=${options.sha}`);
  for (const [name, value] of Object.entries(state.workflowStates)) console.log(`- ${name}=${value}`);
  console.log(`- Vercel=${state.vercelState}`);
  if (state.vercelTarget) console.log(`- vercelTarget=${state.vercelTarget}`);
  if (productionEntry) console.log(`- productionEntry=${productionEntry}`);
}

await main();
