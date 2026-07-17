#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const summary = []

const files = {
  readme: 'README.md',
  process: 'docs/development-process.md',
  handoff: 'docs/handoff.md',
  settings: 'src/tabs/SettingsTab.jsx',
  changelog: 'src/lib/settingsChangelog.js',
  packageJson: 'package.json',
}

const retiredDocs = [
  'docs/development-log.md',
  'docs/security-hardening.md',
  'docs/architecture-security-audit.md',
]

function absolute(relativePath) {
  return path.join(root, relativePath)
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8')
}

function fail(message) {
  failures.push(message)
}

function firstMatch(text, regex) {
  return text.match(regex)?.[1] || null
}

function maxVersion(text) {
  const versions = [...new Set(text.match(/v\d+\.\d+\.\d+\.\d+/g) || [])]
  const weight = (version) => version
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number(part) || 0)
    .reduce((total, part) => total * 1000 + part, 0)
  return versions.sort((a, b) => weight(b) - weight(a))[0] || null
}

function requireMarkers(name, text, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) fail(`${name} missing marker: ${marker}`)
  }
}

function lineCount(text) {
  return text.split(/\r?\n/).length
}

for (const relativePath of Object.values(files)) {
  if (!fs.existsSync(absolute(relativePath))) fail(`missing required file: ${relativePath}`)
}

for (const relativePath of retiredDocs) {
  if (fs.existsSync(absolute(relativePath))) fail(`retired core doc must stay removed: ${relativePath}`)
}

if (failures.length === 0) {
  const readme = read(files.readme)
  const processDoc = read(files.process)
  const handoff = read(files.handoff)
  const settings = read(files.settings)
  const changelog = read(files.changelog)
  const packageJson = JSON.parse(read(files.packageJson))

  const settingsVersion = maxVersion(settings)
  const changelogVersion = firstMatch(changelog, /ver:\s*['"]([^'"]+)['"]/)
  const handoffVersion = firstMatch(handoff, /设置页版本\s*\|\s*`([^`]+)`/)

  if (!settingsVersion) fail('missing SettingsTab version')
  if (!changelogVersion) fail('missing settingsChangelog latest version')
  if (!handoffVersion) fail('missing handoff current version')
  if (settingsVersion && changelogVersion && settingsVersion !== changelogVersion) {
    fail(`SettingsTab version ${settingsVersion} != settingsChangelog ${changelogVersion}`)
  }
  requireMarkers('README', readme, [
    '## 三份权威文档',
    '`docs/development-process.md`',
    '`docs/handoff.md`',
    '## 永久安全规则',
    '## 金融与比赛不变量',
  ])

  requireMarkers('development-process', processDoc, [
    '## FAST：默认快速通道',
    '## FULL：必须完整验证',
    'npm run check:docs',
    'npm run check:fast',
    'npm run check:full',
    'npm run verify:deploy-status',
  ])

  requireMarkers('handoff', handoff, [
    '验证时间：',
    '## 当前生产基准',
    '## 收益比赛当前状态',
    '## 当前风险与下一步',
  ])

  const requiredScripts = {
    'verify:docs-consistency': 'node scripts/verify-docs-consistency.mjs',
    'check:docs': 'npm run verify:docs-consistency && git diff HEAD --check',
    'check:fast': 'npm run build && git diff HEAD --check',
    'check:full': 'npm test && npm run build && git diff HEAD --check',
    'verify:deploy-status': 'node scripts/verify-deploy-status.mjs',
  }
  for (const [scriptName, expected] of Object.entries(requiredScripts)) {
    const actual = packageJson.scripts?.[scriptName]
    if (actual !== expected) fail(`package.json script ${scriptName} mismatch: ${actual || 'missing'}`)
  }

  const budgets = {
    README: [readme, 220],
    process: [processDoc, 220],
    handoff: [handoff, 180],
  }
  for (const [name, [text, maximum]] of Object.entries(budgets)) {
    const lines = lineCount(text)
    if (lines > maximum) fail(`${name} exceeds ${maximum}-line core-doc budget: ${lines}`)
    summary.push(`${name}Lines=${lines}/${maximum}`)
  }

  summary.unshift(`handoffVersion=${handoffVersion || 'missing'}`)
  summary.unshift(`settingsChangelog=${changelogVersion || 'missing'}`)
  summary.unshift(`SettingsTab=${settingsVersion || 'missing'}`)
}

if (failures.length > 0) {
  console.error('docs consistency: FAIL')
  for (const item of summary) console.error(`- ${item}`)
  for (const item of failures) console.error(`ERROR: ${item}`)
  process.exit(1)
}

console.log('docs consistency: PASS')
for (const item of summary) console.log(`- ${item}`)
console.log('- coreDocs=README.md, docs/development-process.md, docs/handoff.md')
