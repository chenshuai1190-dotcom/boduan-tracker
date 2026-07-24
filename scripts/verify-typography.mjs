#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

export const MINIMUM_TEXT_PX = 10

const SOURCE_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.ts', '.tsx'])
const SIZE_PATTERNS = [
  {
    label: 'Tailwind arbitrary text size',
    regex: /text-\[\s*(\d+(?:\.\d+)?)px\s*\]/g,
  },
  {
    label: 'CSS font-size',
    regex: /font-size\s*:\s*(\d+(?:\.\d+)?)px\b/gi,
  },
  {
    label: 'inline fontSize string',
    regex: /fontSize\s*:\s*['"`](\d+(?:\.\d+)?)px['"`]/g,
  },
  {
    label: 'inline fontSize number',
    regex: /fontSize\s*:\s*(\d+(?:\.\d+)?)(?![\w.])/g,
  },
]

function listSourceFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(absolutePath))
      continue
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolutePath)
  }
  return files
}

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length
}

export function findTypographyFloorViolations(root = process.cwd()) {
  const sourceRoot = path.join(root, 'src')
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`missing source directory: ${sourceRoot}`)
  }

  const violations = []
  for (const absolutePath of listSourceFiles(sourceRoot)) {
    const source = fs.readFileSync(absolutePath, 'utf8')
    for (const pattern of SIZE_PATTERNS) {
      pattern.regex.lastIndex = 0
      for (const match of source.matchAll(pattern.regex)) {
        const size = Number(match[1])
        if (!Number.isFinite(size) || size >= MINIMUM_TEXT_PX) continue
        violations.push({
          file: path.relative(root, absolutePath),
          line: lineNumberAt(source, match.index),
          size,
          label: pattern.label,
        })
      }
    }
  }
  return violations
}

export function verifyTypographyFloor(root = process.cwd()) {
  const violations = findTypographyFloorViolations(root)
  if (violations.length) {
    console.error(`Typography floor failed: visible text must be at least ${MINIMUM_TEXT_PX}px.`)
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} ${violation.size}px (${violation.label})`)
    }
    return false
  }
  console.log(`Typography floor PASS: no source text is smaller than ${MINIMUM_TEXT_PX}px.`)
  return true
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)

if (invokedDirectly && !verifyTypographyFloor()) process.exitCode = 1
