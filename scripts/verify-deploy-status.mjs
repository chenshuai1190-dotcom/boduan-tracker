#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const repo = 'chenshuai1190-dotcom/boduan-tracker'
const productionUrl = 'https://boduan-tracker.vercel.app'

function run(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    timeout: options.timeout || 30000,
  })
}

function fail(message) {
  failures.push(message)
}

function firstLine(value) {
  return String(value || '').trim().split(/\r?\n/).find(Boolean) || ''
}

function readJson(command, args, label) {
  const result = run(command, args)
  if (result.error || result.status !== 0) {
    fail(`${label} failed: ${firstLine(result.stderr || result.stdout || result.error?.message)}`)
    return null
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    fail(`${label} returned invalid JSON: ${error.message}`)
    return null
  }
}

function getHeadSha() {
  const result = run('git', ['rev-parse', 'HEAD'])
  if (result.error || result.status !== 0) {
    fail(`git rev-parse HEAD failed: ${firstLine(result.stderr || result.stdout)}`)
    return null
  }
  return firstLine(result.stdout)
}

function statusEmoji(status, conclusion) {
  if (status === 'completed' && conclusion === 'success') return 'success'
  if (status === 'completed') return conclusion || 'completed'
  return status || 'unknown'
}

const failures = []
const summary = []
const requestedSha = process.argv[2] || getHeadSha()
const sha = requestedSha ? requestedSha.trim() : null

if (!sha) {
  fail('missing commit sha')
} else {
  summary.push(`commit=${sha}`)
}

let vercelTarget = null
if (sha) {
  const status = readJson('gh', ['api', `repos/${repo}/commits/${sha}/status`], 'gh commit status')
  if (status) {
    summary.push(`githubCombinedStatus=${status.state || 'unknown'}`)
    const statuses = Array.isArray(status.statuses) ? status.statuses : []
    for (const item of statuses) {
      const context = item.context || 'unknown'
      const state = item.state || 'unknown'
      const target = item.target_url || ''
      summary.push(`status:${context}=${state}${target ? ` ${target}` : ''}`)
      if (context === 'Vercel' && target) vercelTarget = target
    }
    if (status.state !== 'success') fail(`GitHub combined status is ${status.state || 'unknown'}`)
  }

  const runs = readJson(
    'gh',
    [
      'run',
      'list',
      '--repo',
      repo,
      '--branch',
      'main',
      '--limit',
      '20',
      '--json',
      'databaseId,headSha,name,status,conclusion,displayTitle,event,createdAt,url',
    ],
    'gh run list',
  )
  if (Array.isArray(runs)) {
    const runForSha = runs.find((run) => String(run.headSha || '').startsWith(sha))
      || runs.find((run) => sha.startsWith(String(run.headSha || '')))
    if (!runForSha) {
      fail(`no GitHub Actions run found for ${sha.slice(0, 12)} on main`)
    } else {
      summary.push(`actionsRun=${runForSha.databaseId} ${statusEmoji(runForSha.status, runForSha.conclusion)} ${runForSha.displayTitle || runForSha.name}`)
      summary.push(`actionsUrl=${runForSha.url}`)
      if (!(runForSha.status === 'completed' && runForSha.conclusion === 'success')) {
        fail(`GitHub Actions run ${runForSha.databaseId} is ${runForSha.status}/${runForSha.conclusion || ''}`)
      }
    }
  }
}

const home = run('curl', ['-sS', productionUrl], { timeout: 30000 })
if (home.error || home.status !== 0) {
  fail(`production homepage fetch failed: ${firstLine(home.stderr || home.stdout || home.error?.message)}`)
} else {
  const entry = home.stdout.match(/\/assets\/index-[^"'\s]+\.js/)?.[0] || null
  if (!entry) {
    fail('production entry asset not found')
  } else {
    summary.push(`productionEntry=${entry}`)
  }
}

for (const [label, url] of [
  ['quote401', `${productionUrl}/api/quote?symbols=VIX`],
  ['earnings401', `${productionUrl}/api/earnings-calendar?symbols=NVDA`],
]) {
  const result = run('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', url], { timeout: 30000 })
  if (result.error || result.status !== 0) {
    fail(`${label} smoke failed: ${firstLine(result.stderr || result.stdout || result.error?.message)}`)
  } else {
    const code = firstLine(result.stdout)
    summary.push(`${label}=${code}`)
    if (code !== '401') fail(`${label} expected 401, got ${code}`)
  }
}

if (vercelTarget) summary.push(`vercelTarget=${vercelTarget}`)

if (failures.length > 0) {
  console.error('deploy status: FAIL')
  for (const item of summary) console.error(`- ${item}`)
  for (const item of failures) console.error(`ERROR: ${item}`)
  process.exit(1)
}

console.log('deploy status: PASS')
for (const item of summary) console.log(`- ${item}`)
