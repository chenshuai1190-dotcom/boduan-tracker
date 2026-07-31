#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stableDir = path.join(os.homedir(), '.config', 'boduan-tracker');
const paths = {
  worktreeEnv: path.join(rootDir, '.env.local'),
  vercelProject: path.join(rootDir, '.vercel', 'project.json'),
  nodeModules: path.join(rootDir, 'node_modules'),
  dist: path.join(rootDir, 'dist'),
  stableLocalEnv: path.join(stableDir, 'local.env'),
  stableEodhdEnv: path.join(stableDir, 'eodhd.env'),
};

const FORBIDDEN_KEYS = [
  'VITE_EODHD_TOKEN',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_CRON_SECRET',
];

const failures = [];
const warnings = [];
const summary = [];

function run(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: options.timeout || 10000,
  });
}

function mode(file) {
  if (!fs.existsSync(file)) return null;
  return (fs.statSync(file).mode & 0o777).toString(8);
}

function displayPath(file) {
  return file.replace(os.homedir(), '~').replace(`${rootDir}/`, '');
}

function readEnvFile(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function presentKeys(env, keys) {
  return keys.filter((key) => String(env[key] || '').trim());
}

function checkIgnored(relativePath) {
  const result = run('git', ['check-ignore', '-q', relativePath]);
  return result.status === 0;
}

function checkTracked(relativePath) {
  const result = run('git', ['ls-files', '--error-unmatch', relativePath]);
  return result.status === 0;
}

function summarizeFile(file, label, options = {}) {
  if (!fs.existsSync(file)) {
    warnings.push(`${label}=missing${options.next ? `; ${options.next}` : ''}`);
    return false;
  }
  const actualMode = mode(file);
  summary.push(`${label}=${displayPath(file)}${actualMode ? ` mode=${actualMode}` : ''}`);
  if (options.privateFile && (fs.statSync(file).mode & 0o077) !== 0) {
    failures.push(`${label} should not be group/world-readable: ${displayPath(file)}`);
  }
  return true;
}

async function probeLocalUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok || response.status < 500 ? response.status : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const gitStatus = run('git', ['status', '-sb']);
if (gitStatus.status === 0) {
  summary.push(`git=${String(gitStatus.stdout || '').trim().replace(/\s+/g, ' ')}`);
} else {
  warnings.push('git status unavailable');
}

const trackedChanges = run('git', ['status', '--porcelain=v1', '--untracked-files=no']);
if (trackedChanges.status === 0 && String(trackedChanges.stdout || '').trim()) {
  warnings.push('tracked worktree changes present; inspect with git diff before switching tasks');
}

for (const relativePath of ['.env', '.env.local', '.vercel/project.json']) {
  if (checkTracked(relativePath)) {
    failures.push(`${relativePath} must not be tracked by Git`);
  }
}

if (!checkIgnored('.env.local')) {
  failures.push('.env.local should be ignored by Git');
}
if (!checkIgnored('.vercel/project.json')) {
  failures.push('.vercel/project.json should be ignored by Git');
}

summarizeFile(paths.stableLocalEnv, 'stableLocalEnv', {
  privateFile: true,
  next: 'create ~/.config/boduan-tracker/local.env or run the documented local setup',
});
summarizeFile(paths.stableEodhdEnv, 'stableEodhdEnv', {
  privateFile: true,
  next: 'create ~/.config/boduan-tracker/eodhd.env',
});

const hasWorktreeEnv = summarizeFile(paths.worktreeEnv, 'worktreeEnv', {
  privateFile: true,
  next: 'run: npm run setup:local-env',
});
if (hasWorktreeEnv) {
  const worktreeEnv = readEnvFile(paths.worktreeEnv);
  for (const key of FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(worktreeEnv, key)) {
      failures.push(`worktreeEnv must not define ${key}`);
    }
  }
  const publicKeys = presentKeys(worktreeEnv, ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
  const serverKeys = presentKeys(worktreeEnv, ['EODHD_API_KEY']);
  summary.push(`worktreeEnvPublicKeys=${publicKeys.length ? publicKeys.join(',') : 'missing'}`);
  summary.push(`worktreeEnvServerKeys=${serverKeys.length ? serverKeys.join(',') : 'missing'}`);
}

if (fs.existsSync(paths.nodeModules)) {
  summary.push('nodeModules=present');
} else {
  warnings.push('nodeModules=missing; run: npm ci before tests/build/dev server');
}

if (fs.existsSync(paths.dist)) {
  summary.push('dist=present');
} else {
  warnings.push('dist=missing; run: npm run build before preview/static bundle inspection');
}

const devStatus = await probeLocalUrl('http://127.0.0.1:5173/');
const previewStatus = await probeLocalUrl('http://127.0.0.1:4173/');
summary.push(`viteDev=${devStatus ? `http:${devStatus}` : 'not-running'}`);
summary.push(`vitePreview=${previewStatus ? `http:${previewStatus}` : 'not-running'}`);

if (failures.length > 0) {
  console.error('workspace doctor: FAIL');
  for (const item of summary) console.error(`- ${item}`);
  for (const item of warnings) console.error(`WARN: ${item}`);
  for (const item of failures) console.error(`ERROR: ${item}`);
  process.exit(1);
}

console.log('workspace doctor: PASS');
for (const item of summary) console.log(`- ${item}`);
for (const item of warnings) console.log(`WARN: ${item}`);
