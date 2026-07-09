#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const files = {
  settings: 'src/tabs/SettingsTab.jsx',
  changelog: 'src/lib/settingsChangelog.js',
  handoff: 'docs/handoff.md',
  process: 'docs/development-process.md',
  log: 'docs/development-log.md',
  packageJson: 'package.json',
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function fail(message) {
  failures.push(message)
}

function unique(values) {
  return [...new Set(values)]
}

function versionWeight(version) {
  const parts = version.replace(/^v/, '').split('.').map((part) => Number(part) || 0)
  return parts.reduce((acc, part) => acc * 1000 + part, 0)
}

function maxVersion(text) {
  const versions = unique(text.match(/v\d+\.\d+\.\d+\.\d+/g) || [])
  return versions.sort((a, b) => versionWeight(b) - versionWeight(a))[0] || null
}

function firstMatch(text, regex) {
  return text.match(regex)?.[1] || null
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker)
  if (start < 0) return ''
  const end = text.indexOf(endMarker, start + startMarker.length)
  return text.slice(start, end < 0 ? undefined : end)
}

function latestLogEntry(text) {
  const first = text.indexOf('### ')
  if (first < 0) return ''
  const second = text.indexOf('\n### ', first + 1)
  return text.slice(first, second < 0 ? undefined : second)
}

const failures = []
const summary = []

const settings = read(files.settings)
const changelog = read(files.changelog)
const handoff = read(files.handoff)
const processDoc = read(files.process)
const developmentLog = read(files.log)
const packageJson = JSON.parse(read(files.packageJson))

const settingsVersion = maxVersion(settings)
const changelogVersion = firstMatch(changelog, /ver:\s*['"]([^'"]+)['"]/)
const handoffCurrent = between(handoff, '## 0. 给下一位同事的直接接手摘要', '## 2.')
const forwardable = between(handoff, '最新可直接转发:', '下面旧版转发块')
const handoffVersion = firstMatch(handoffCurrent, /设置页版本:\s*`([^`]+)`/)
const forwardableVersion = firstMatch(forwardable, /设置页版本:\s*`([^`]+)`/)
const latestEntry = latestLogEntry(developmentLog)
const latestTitle = firstMatch(latestEntry, /^###\s+(.+)$/m)
const latestTier = firstMatch(latestEntry, /Workflow tier:\s*`([^`]+)`/)

const versions = {
  SettingsTab: settingsVersion,
  settingsChangelog: changelogVersion,
  handoffCurrent: handoffVersion,
  handoffForwardable: forwardableVersion,
}

for (const [name, version] of Object.entries(versions)) {
  if (!version) fail(`missing ${name} version`)
}

if (settingsVersion && changelogVersion && settingsVersion !== changelogVersion) {
  fail(`SettingsTab version ${settingsVersion} != settingsChangelog latest ${changelogVersion}`)
}

if (settingsVersion && handoffVersion && settingsVersion !== handoffVersion) {
  fail(`SettingsTab version ${settingsVersion} != handoff current ${handoffVersion}`)
}

if (settingsVersion && forwardableVersion && settingsVersion !== forwardableVersion) {
  fail(`SettingsTab version ${settingsVersion} != handoff forwardable ${forwardableVersion}`)
}

if (!latestTitle) fail('missing latest development-log entry')
if (!latestTier) fail('latest development-log entry is missing Workflow tier')

const requiredProcessMarkers = [
  'Runtime deploy / 常规运行时代码改动',
  'Docs-only evidence / 纯文档和部署证据回填',
  'Sensitive change / 生产敏感改动',
  'npm run verify:docs-consistency',
]

for (const marker of requiredProcessMarkers) {
  if (!processDoc.includes(marker)) fail(`development-process missing marker: ${marker}`)
}

const requiredHandoffMarkers = [
  '每次改动先判定 workflow tier',
  '`runtime`',
  '`docs-only`',
  '`sensitive`',
  'npm run verify:docs-consistency',
]

for (const marker of requiredHandoffMarkers) {
  if (!handoff.includes(marker)) fail(`handoff missing marker: ${marker}`)
}

if (packageJson.scripts?.['verify:docs-consistency'] !== 'node scripts/verify-docs-consistency.mjs') {
  fail('package.json missing verify:docs-consistency script')
}

summary.push(`SettingsTab=${settingsVersion || 'missing'}`)
summary.push(`settingsChangelog=${changelogVersion || 'missing'}`)
summary.push(`handoffCurrent=${handoffVersion || 'missing'}`)
summary.push(`handoffForwardable=${forwardableVersion || 'missing'}`)
summary.push(`latestLog="${latestTitle || 'missing'}"`)
summary.push(`latestWorkflowTier=${latestTier || 'missing'}`)
summary.push('checkedRanges=handoff current summary, handoff forwardable block, latest development-log entry, process workflow section')

if (failures.length > 0) {
  console.error('docs consistency: FAIL')
  for (const item of summary) console.error(`- ${item}`)
  for (const item of failures) console.error(`ERROR: ${item}`)
  process.exit(1)
}

console.log('docs consistency: PASS')
for (const item of summary) console.log(`- ${item}`)
