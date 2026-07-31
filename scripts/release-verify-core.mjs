const VALID_SCOPES = new Set(['docs', 'fast', 'full']);

function positiveInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function parseReleaseArgs(argv, env = process.env) {
  const [scope, sha, ...extra] = argv;
  if (!VALID_SCOPES.has(scope) || !/^[0-9a-f]{7,40}$/i.test(String(sha || '')) || extra.length > 0) {
    throw new Error('usage: npm run release:verify -- <docs|fast|full> <commit>');
  }
  return {
    scope,
    sha: String(sha).trim(),
    timeoutMs: positiveInteger(env.RELEASE_VERIFY_TIMEOUT_MS, 180_000, 15_000, 600_000),
    pollMs: positiveInteger(env.RELEASE_VERIFY_POLL_MS, 5_000, 1_000, 30_000),
  };
}

export function docsWorkflowApplies(changedPaths) {
  return changedPaths.some((file) => (
    file.endsWith('.md')
    || file === 'scripts/verify-docs-consistency.mjs'
    || file === 'scripts/run-gate.mjs'
    || file === '.github/workflows/docs.yml'
  ));
}

export function expectedWorkflows(scope, changedPaths) {
  if (scope === 'docs') return ['Docs'];
  return docsWorkflowApplies(changedPaths) ? ['CI', 'Docs'] : ['CI'];
}

function shaMatches(candidate, requested) {
  const left = String(candidate || '');
  const right = String(requested || '');
  return left.startsWith(right) || right.startsWith(left);
}

function describeRun(run) {
  if (!run) return 'missing';
  return run.status === 'completed'
    ? `${run.status}/${run.conclusion || 'unknown'}`
    : run.status || 'unknown';
}

export function inspectReleaseState({ scope, sha, changedPaths = [], runs = [], commitStatus = null }) {
  const expected = expectedWorkflows(scope, changedPaths);
  const workflowStates = {};
  const pending = [];
  const failures = [];

  for (const name of expected) {
    const run = runs.find((candidate) => candidate.name === name && shaMatches(candidate.headSha, sha));
    workflowStates[name] = describeRun(run);
    if (!run || run.status !== 'completed') {
      pending.push(`${name}:${describeRun(run)}`);
    } else if (run.conclusion !== 'success') {
      failures.push(`${name}:${describeRun(run)}`);
    }
  }

  let vercel = null;
  if (scope !== 'docs') {
    const statuses = Array.isArray(commitStatus?.statuses) ? commitStatus.statuses : [];
    vercel = statuses.find((item) => /vercel/i.test(String(item.context || ''))) || null;
    const state = String(vercel?.state || 'missing');
    if (['error', 'failure'].includes(state)) failures.push(`Vercel:${state}`);
    else if (state !== 'success') pending.push(`Vercel:${state}`);
  }

  return {
    ready: failures.length === 0 && pending.length === 0,
    pending,
    failures,
    workflowStates,
    vercelState: scope === 'docs' ? 'not-required' : String(vercel?.state || 'missing'),
    vercelTarget: vercel?.target_url || null,
  };
}

export function extractEntryAsset(html) {
  return String(html || '').match(/\/assets\/index-[^"'\s]+\.js/)?.[0] || null;
}
