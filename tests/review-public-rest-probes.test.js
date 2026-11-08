import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/verify-rls-rest.mjs', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/review_public_activity_20261108.sql', import.meta.url), 'utf8');
const declarationEnd = source.indexOf('\nfunction unique(');
assert.ok(declarationEnd > 0);
// Evaluate static declarations and mocked probe functions only. Never import
// the production-facing script or allow a real network request in these tests.
const declarations = JSON.parse(JSON.stringify(runInNewContext(
  `${source.slice(0, declarationEnd)}\n({ tables: SERVICE_ONLY_TABLES, rpcs: AUTHENTICATED_USER_RPCS })`,
  {}, { timeout: 1000 },
)));
const rpcNames = ['fetch_review_public_feed', 'read_review_public_post', 'set_review_public_like'];
const probes = declarations.rpcs.filter(entry => rpcNames.includes(entry.name));

test('anonymous REST probes cover both public projection tables and all account-bound public RPCs', () => {
  for (const [table, select] of [['review_public_posts', 'author_id'], ['review_public_likes', 'user_id']]) {
    assert.deepEqual(declarations.tables.filter(entry => entry.table === table), [{ table, select }]);
  }
  for (const name of rpcNames) assert.equal(probes.filter(entry => entry.name === name).length, 1);
  for (const probe of probes) assert.equal(probe.body.p_expected_user_id, null);
  assert.deepEqual(probes.find(entry => entry.name === 'fetch_review_public_feed').body, {
    p_limit: 1, p_before: null, p_before_id: null, p_query: '', p_symbol: '', p_expected_user_id: null,
  });
  assert.deepEqual(probes.find(entry => entry.name === 'read_review_public_post').body, { p_post_id: null, p_expected_user_id: null });
  assert.deepEqual(probes.find(entry => entry.name === 'set_review_public_like').body, { p_post_id: null, p_liked: null, p_expected_user_id: null });
});

test('public like probe cannot lock or mutate any row even if an anonymous execute grant regresses', () => {
  const start = migration.indexOf('create or replace function public.set_review_public_like(');
  const end = migration.indexOf('\n$$;', start);
  assert.ok(start >= 0 && end > start);
  const body = migration.slice(start, end);
  const authGuard = body.indexOf('if v_user is null or p_expected_user_id is distinct from v_user');
  const inputGuard = body.indexOf('if p_post_id is null');
  const firstLock = body.indexOf('perform 1 from public.review_public_posts');
  const firstMutation = body.indexOf('insert into public.review_public_likes');
  assert.ok(authGuard > 0 && authGuard < inputGuard && inputGuard < firstLock && firstLock < firstMutation);
  assert.match(body.slice(authGuard, inputGuard), /errcode='42501'/);
  assert.match(body.slice(inputGuard, firstLock), /p_liked is null/);
});

test('public RPC probes accept only anonymous permission denial, not empty data, validation or missing migration', async () => {
  const start = source.indexOf('async function probeAnonymousRpc(');
  const end = source.indexOf('\nconst config =', start);
  assert.ok(start >= 0 && end > start);
  const calls = []; let status = 403;
  const probe = runInNewContext(`${source.slice(start, end)}\nprobeAnonymousRpc`, {
    fetch: async (url, options) => { calls.push({ url, options }); return { status }; },
  }, { timeout: 1000 });
  const config = { supabaseUrl: 'https://example.invalid', anonKey: 'synthetic-anon-key' };
  for (const value of [200, 400, 401, 403, 404, 500]) {
    status = value;
    for (const entry of probes) {
      const result = await probe(config, entry);
      assert.equal(result.rpc, entry.name);
      assert.equal(result.status, value);
      assert.equal(result.ok, value === 401 || value === 403);
    }
  }
  assert.equal(calls.length, 18);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith('https://example.invalid/rest/v1/rpc/'));
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-anon-key');
    assert.equal(JSON.parse(options.body).p_expected_user_id, null);
  }
});
