#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repo = 'chenshuai1190-dotcom/boduan-tracker'
const repoSsh = `git@github.com:${repo}.git`
const projectKey = path.join(os.homedir(), '.ssh', 'boduan_tracker_github')

const failures = []
const summary = []

function run(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    timeout: options.timeout || 20000,
  })
}

function firstLine(value) {
  return String(value || '').trim().split(/\r?\n/).find(Boolean) || ''
}

function commandVersion(command, args = ['--version']) {
  const result = run(command, args, { timeout: 10000 })
  if (result.error || result.status !== 0) {
    failures.push(`${command} missing or not runnable`)
    return null
  }
  return firstLine(result.stdout || result.stderr)
}

function parseNodeVersion(version) {
  const match = String(version || '').match(/v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function nodeVersionOk(version) {
  const parsed = parseNodeVersion(version)
  if (!parsed) return false
  if (parsed.major > 22) return true
  if (parsed.major === 22) return parsed.minor > 12 || (parsed.minor === 12 && parsed.patch >= 0)
  if (parsed.major === 20) return parsed.minor > 19 || (parsed.minor === 19 && parsed.patch >= 0)
  return false
}

const requiredCommands = [
  ['node', ['--version']],
  ['npm', ['--version']],
  ['npx', ['--version']],
  ['git', ['--version']],
  ['ssh', ['-V']],
  ['curl', ['--version']],
  ['rg', ['--version']],
  ['jq', ['--version']],
  ['gh', ['--version']],
]

for (const [command, args] of requiredCommands) {
  const version = commandVersion(command, args)
  if (version) summary.push(`${command}=${version}`)
}

const nodeVersion = run('node', ['--version'], { timeout: 10000 })
const nodeVersionText = firstLine(nodeVersion.stdout || nodeVersion.stderr)
if (nodeVersionText && !nodeVersionOk(nodeVersionText)) {
  failures.push(`node ${nodeVersionText} does not satisfy package engines (^20.19.0 || >=22.12.0)`)
}

if (!fs.existsSync(projectKey)) {
  failures.push(`missing project SSH key: ${projectKey}`)
} else {
  const mode = fs.statSync(projectKey).mode & 0o777
  summary.push(`projectSshKey=${projectKey} mode=${mode.toString(8)}`)
  if ((mode & 0o077) !== 0) {
    failures.push(`project SSH key should not be group/world-readable: ${projectKey}`)
  }
}

const ghUser = run('gh', ['api', 'user', '--jq', '.login'], { timeout: 20000 })
if (ghUser.error || ghUser.status !== 0) {
  failures.push('gh is not authenticated; run: gh auth login --hostname github.com --git-protocol ssh --web --scopes repo,workflow --skip-ssh-key')
} else {
  summary.push(`ghUser=${firstLine(ghUser.stdout)}`)
}

if (fs.existsSync(projectKey)) {
  const lsRemote = run('git', ['ls-remote', '--heads', repoSsh, 'main'], {
    timeout: 20000,
    env: {
      GIT_SSH_COMMAND: `ssh -i ${projectKey} -o IdentitiesOnly=yes`,
    },
  })
  if (lsRemote.error || lsRemote.status !== 0 || !lsRemote.stdout.includes('refs/heads/main')) {
    failures.push(`cannot read ${repoSsh} main with project SSH key`)
  } else {
    summary.push(`githubSshRead=${repoSsh} main ok`)
  }
}

if (failures.length > 0) {
  console.error('toolchain doctor: FAIL')
  for (const item of summary) console.error(`- ${item}`)
  for (const item of failures) console.error(`ERROR: ${item}`)
  process.exit(1)
}

console.log('toolchain doctor: PASS')
for (const item of summary) console.log(`- ${item}`)
