import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { inspectReleaseState } from '../scripts/release-verify-core.mjs';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const vercel = JSON.parse(read('vercel.json'));

function runConfiguredBuild(t, { auditExit = 0, buildExit = 0 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'boduan-security-build-gate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const callLog = path.join(directory, 'npm-calls.log');
  fs.writeFileSync(path.join(directory, 'npm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$SECURITY_GATE_CALL_LOG"
case "$*" in
  'run audit') exit "$SECURITY_GATE_AUDIT_EXIT" ;;
  'run build') exit "$SECURITY_GATE_BUILD_EXIT" ;;
  *) exit 97 ;;
esac
`, { mode: 0o755 });

  // Execute the actual repository deployment command with bounded local stubs.
  // No network, dependency install or production build is performed here.
  const result = spawnSync('/bin/sh', ['-c', vercel.buildCommand], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: `${directory}${path.delimiter}${process.env.PATH || ''}`,
      SECURITY_GATE_CALL_LOG: callLog,
      SECURITY_GATE_AUDIT_EXIT: String(auditExit),
      SECURITY_GATE_BUILD_EXIT: String(buildExit),
    },
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(result.error, undefined);
  const calls = fs.existsSync(callLog) ? fs.readFileSync(callLog, 'utf8').trim().split('\n') : [];
  return { status: result.status, calls };
}

test('Vercel rejects an audit failure before any production build starts', t => {
  assert.equal(vercel.buildCommand, 'npm run audit && npm run build');
  for (const auditExit of [1, 2]) {
    const result = runConfiguredBuild(t, { auditExit });
    assert.equal(result.status, auditExit, 'audit vulnerabilities or audit-service failure must fail deployment');
    assert.deepEqual(result.calls, ['run audit'], 'a failed audit must not execute the build');
  }
});

test('Vercel builds only after a successful audit and propagates build failure', t => {
  assert.deepEqual(runConfiguredBuild(t), { status: 0, calls: ['run audit', 'run build'] });
  assert.deepEqual(runConfiguredBuild(t, { buildExit: 3 }), { status: 3, calls: ['run audit', 'run build'] });
});

test('CI audits installed dependencies before preserving the original full gate', () => {
  const workflow = read('.github/workflows/ci.yml');
  const steps = workflow.split(/^      - name: /m).slice(1);
  const installIndex = steps.findIndex(step => step.startsWith('Install\n'));
  const auditIndex = steps.findIndex(step => step.startsWith('Audit\n'));
  const fullIndex = steps.findIndex(step => step.startsWith('Final FULL gate\n'));

  assert.ok(installIndex >= 0 && installIndex < auditIndex && auditIndex < fullIndex);
  assert.match(steps[installIndex], /^        run: npm ci$/m);
  assert.match(steps[auditIndex], /^        run: npm run audit$/m);
  assert.match(steps[fullIndex], /^        run: npm run check:full$/m);
  assert.match(steps[fullIndex], /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/);
  assert.doesNotMatch(workflow, /continue-on-error|if:\s*\$?\{?\{?\s*(?:always|failure)\(/);

  const { scripts } = JSON.parse(read('package.json'));
  assert.equal(scripts.audit, 'npm audit --audit-level=high', 'high/critical issues in the full dependency tree, including dev dependencies, must block release');
});

test('release verification cannot report success when either audit-bearing pipeline fails', () => {
  const sha = 'abcdef1234567890';
  for (const [ciConclusion, vercelState, failure] of [
    ['failure', 'success', 'CI:completed/failure'],
    ['success', 'failure', 'Vercel:failure'],
  ]) {
    const state = inspectReleaseState({
      scope: 'full', sha, changedPaths: ['package-lock.json', 'vercel.json'],
      runs: [{ name: 'CI', headSha: sha, status: 'completed', conclusion: ciConclusion }],
      commitStatus: { statuses: [{ context: 'Vercel', state: vercelState }] },
    });
    assert.equal(state.ready, false);
    assert.deepEqual(state.failures, [failure]);
  }
});
