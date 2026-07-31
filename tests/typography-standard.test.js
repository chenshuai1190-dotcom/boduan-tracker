import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { GATE_MATRIX } from '../scripts/run-gate.mjs'
import { findTypographyFloorViolations, MINIMUM_TEXT_PX } from '../scripts/verify-typography.mjs'

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')

test('visible source typography never falls below the 10px floor', () => {
  assert.equal(MINIMUM_TEXT_PX, 10)
  assert.deepEqual(findTypographyFloorViolations(), [])
})

test('typography floor is documented and enforced by both code gates', () => {
  const packageJson = JSON.parse(read('package.json'))
  const readme = read('README.md')
  const processDoc = read('docs/development-process.md')

  assert.equal(packageJson.scripts['verify:typography'], 'node scripts/verify-typography.mjs')
  assert.ok(GATE_MATRIX.fast.includes('typography'))
  assert.ok(GATE_MATRIX.full.includes('full-tests-including-typography'))
  assert.ok(readme.includes('任何可见文字不得小于 `10px`'))
  assert.ok(processDoc.includes('字号门禁'))
})
