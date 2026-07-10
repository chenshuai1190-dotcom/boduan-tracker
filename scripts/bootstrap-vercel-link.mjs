#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercelProject = path.join(rootDir, '.vercel', 'project.json');
const scope = 'chenshuai1190-7580s-projects';
const project = 'boduan-tracker';
const force = process.argv.includes('--force');

const failures = [];
const summary = [];

function run(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    timeout: options.timeout || 30000,
  });
}

function firstLine(value) {
  return String(value || '').trim().split(/\r?\n/).find(Boolean) || '';
}

function projectJsonLooksValid() {
  if (!fs.existsSync(vercelProject)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(vercelProject, 'utf8'));
    return Boolean(parsed.projectId && parsed.orgId);
  } catch {
    return false;
  }
}

function checkIgnored(relativePath) {
  const result = run('git', ['check-ignore', '-q', relativePath], { timeout: 10000 });
  return result.status === 0;
}

if (!checkIgnored('.vercel/project.json')) {
  failures.push('.vercel/project.json should be ignored by Git before linking');
}

const whoami = run('vercel', ['whoami'], { timeout: 20000 });
if (whoami.error || whoami.status !== 0) {
  failures.push('vercel CLI is not authenticated; run: vercel login');
} else {
  summary.push(`vercelUser=${firstLine(whoami.stdout || whoami.stderr)}`);
}

if (projectJsonLooksValid() && !force) {
  summary.push('vercelLink=present');
} else if (failures.length === 0) {
  const result = run('vercel', [
    'link',
    '--yes',
    '--scope',
    scope,
    '--project',
    project,
    '--non-interactive',
  ], { timeout: 60000 });

  if (result.error || result.status !== 0) {
    failures.push(`vercel link failed: ${firstLine(result.stderr || result.stdout || result.error?.message)}`);
  } else if (!projectJsonLooksValid()) {
    failures.push('vercel link completed but .vercel/project.json is missing or invalid');
  } else {
    summary.push(`vercelLink=created scope=${scope} project=${project}`);
  }
}

if (failures.length > 0) {
  console.error('bootstrap vercel link: FAIL');
  for (const item of summary) console.error(`- ${item}`);
  for (const item of failures) console.error(`ERROR: ${item}`);
  process.exit(1);
}

console.log('bootstrap vercel link: PASS');
for (const item of summary) console.log(`- ${item}`);
