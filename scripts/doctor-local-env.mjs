#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const stableDir = path.join(os.homedir(), '.config', 'boduan-tracker');
const stableLocalEnv = path.join(stableDir, 'local.env');
const stableEodhdEnv = path.join(stableDir, 'eodhd.env');
const worktreeEnv = path.join(rootDir, '.env.local');

const REQUIRED_STABLE_LOCAL_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];
const REQUIRED_WORKTREE_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'EODHD_API_KEY',
];
const FORBIDDEN_KEYS = [
  'VITE_EODHD_TOKEN',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_CRON_SECRET',
];
const SENSITIVE_OPTIONAL_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
];

const failures = [];
const warnings = [];
const summary = [];

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

function mode(file) {
  if (!fs.existsSync(file)) return null;
  return (fs.statSync(file).mode & 0o777).toString(8);
}

function checkPrivatePath(file, label, expectedMode) {
  if (!fs.existsSync(file)) {
    failures.push(`${label} missing: ${displayPath(file)}`);
    return;
  }
  const actualMode = mode(file);
  summary.push(`${label}=${displayPath(file)} mode=${actualMode}`);
  if (actualMode !== expectedMode) {
    failures.push(`${label} should be mode ${expectedMode}: ${displayPath(file)}`);
  }
}

function displayPath(file) {
  return file.replace(os.homedir(), '~');
}

function presentKeys(env, keys) {
  return keys.filter((key) => String(env[key] || '').trim());
}

function missingKeys(env, keys) {
  return keys.filter((key) => !String(env[key] || '').trim());
}

function checkForbiddenKeys(env, label) {
  for (const key of FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      failures.push(`${label} must not define ${key}`);
    }
  }
}

checkPrivatePath(stableDir, 'stableConfigDir', '700');
checkPrivatePath(stableLocalEnv, 'stableLocalEnv', '600');
checkPrivatePath(stableEodhdEnv, 'stableEodhdEnv', '600');

const stableLocal = readEnvFile(stableLocalEnv);
const stableEodhd = readEnvFile(stableEodhdEnv);
const worktree = readEnvFile(worktreeEnv);

checkForbiddenKeys(stableLocal, 'stableLocalEnv');
checkForbiddenKeys(stableEodhd, 'stableEodhdEnv');
checkForbiddenKeys(worktree, 'worktreeEnv');

const missingStableLocal = missingKeys(stableLocal, REQUIRED_STABLE_LOCAL_KEYS);
if (missingStableLocal.length > 0) {
  failures.push(`stableLocalEnv missing required keys: ${missingStableLocal.join(', ')}`);
} else {
  summary.push(`stableLocalEnvKeys=${presentKeys(stableLocal, REQUIRED_STABLE_LOCAL_KEYS).join(',')}`);
}

if (!String(stableEodhd.EODHD_API_KEY || '').trim()) {
  failures.push('stableEodhdEnv missing required key: EODHD_API_KEY');
} else {
  summary.push('stableEodhdKey=present');
}

if (!fs.existsSync(worktreeEnv)) {
  warnings.push('worktree .env.local missing; run: npm run setup:local-env');
} else {
  const worktreeMode = mode(worktreeEnv);
  summary.push(`worktreeEnv=.env.local mode=${worktreeMode}`);
  if ((fs.statSync(worktreeEnv).mode & 0o077) !== 0) {
    failures.push('worktree .env.local should not be group/world-readable');
  }
  const missingWorktree = missingKeys(worktree, REQUIRED_WORKTREE_KEYS);
  if (missingWorktree.length > 0) {
    warnings.push(`worktree .env.local missing keys: ${missingWorktree.join(', ')}; run: npm run setup:local-env`);
  } else {
    summary.push(`worktreeEnvKeys=${presentKeys(worktree, REQUIRED_WORKTREE_KEYS).join(',')}`);
  }
}

const sensitivePresent = presentKeys(worktree, SENSITIVE_OPTIONAL_KEYS);
if (sensitivePresent.length > 0) {
  warnings.push(`worktree .env.local contains high-privilege optional keys: ${sensitivePresent.join(', ')}; keep local-only and never print values`);
}

if (failures.length > 0) {
  console.error('local env doctor: FAIL');
  for (const item of summary) console.error(`- ${item}`);
  for (const item of warnings) console.error(`WARN: ${item}`);
  for (const item of failures) console.error(`ERROR: ${item}`);
  process.exit(1);
}

console.log('local env doctor: PASS');
for (const item of summary) console.log(`- ${item}`);
for (const item of warnings) console.log(`WARN: ${item}`);
