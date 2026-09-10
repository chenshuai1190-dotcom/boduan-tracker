import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

// Structural contract checks only. These do not apply a migration or claim
// PostgreSQL execution / live RLS validation against any environment.
const sql = readFileSync(new URL('../supabase/sec_earnings_auto_coverage_20260909.sql', import.meta.url), 'utf8');
const executable = sql.replace(/^\s*--.*$/gm, '');
const tables = ['sec_earnings_watch_jobs', 'sec_earnings_requested_events', 'sec_earnings_shared_results'];
const rpcSignatures = {
  register_sec_earnings_requested_events: 'uuid, jsonb, text',
  claim_sec_earnings_watch_jobs: 'integer, integer',
  complete_sec_earnings_watch_job: 'text, uuid, text, text, text, integer, jsonb, jsonb',
};

function functionBody(name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = sql.indexOf('\n$$;', start);
  assert.ok(start >= 0 && end > start, `${name} must have a complete SQL body`);
  return sql.slice(start, end + 4);
}

function tableBody(name) {
  const start = sql.indexOf(`create table if not exists public.${name} (`);
  const end = sql.indexOf('\n);', start);
  assert.ok(start >= 0 && end > start, `${name} must have an independent table definition`);
  return sql.slice(start, end + 3);
}

test('SEC coverage is an explicitly unapplied additive foundation transaction', () => {
  assert.match(sql, /has NOT been applied to production/);
  assert.match(executable, /^\s*begin;/);
  assert.match(executable, /commit;\s*$/);
  assert.equal((sql.match(/create table if not exists/g) || []).length, 3);
  assert.doesNotMatch(executable, /\b(?:drop\s+table|truncate|create\s+trigger|alter\s+table\s+public\.watchlist)\b/i);
});

test('shared tables store public symbols and event/result identity without user membership', () => {
  for (const name of tables) {
    const body = tableBody(name);
    assert.match(body, /symbol text/);
    assert.match(body, /\^\[A-Z\]\[A-Z0-9\.\-\]\{0,14\}\$/);
    assert.doesNotMatch(body, /\b(?:user_id|owner_id|email|quantity|shares|cost|balance|access_token)\s/);
  }
  assert.match(tableBody(tables[1]), /primary key \(symbol, provider_fiscal_date, report_date, parser_version\)/);
  assert.match(tableBody(tables[2]), /primary key \(symbol, official_fiscal_date, accession, document_type, parser_version\)/);
});

test('every shared table has RLS and no anonymous/authenticated/direct-service mutation grants', () => {
  for (const name of tables) assert.ok(sql.includes(`alter table public.${name} enable row level security;`));
  assert.match(sql, /revoke all on table public\.sec_earnings_watch_jobs,[\s\S]*?from public, anon, authenticated, service_role;/);
  assert.match(sql, /grant select on table public\.sec_earnings_watch_jobs,[\s\S]*?to service_role;/);
  assert.doesNotMatch(executable, /grant\s+(?:all|insert|update|delete|truncate|references|trigger)\b/i);
  assert.doesNotMatch(executable, /create policy/i);
});

test('only three guarded service-role definer RPCs are externally executable', () => {
  for (const [name, signature] of Object.entries(rpcSignatures)) {
    const body = functionBody(name);
    assert.match(body, /language plpgsql\s+security definer\s+set search_path = pg_catalog, public/);
    assert.match(body, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
    assert.match(body, /raise exception 'service role required' using errcode = '42501'/);
    assert.ok(sql.includes(`revoke all on function public.${name}(${signature}) from public, anon, authenticated, service_role;`));
    assert.ok(sql.includes(`grant execute on function public.${name}(${signature}) to service_role;`));
    assert.ok(body.indexOf("'service role required'") < body.indexOf('public.sec_earnings_', body.indexOf('\nbegin')));
  }
  assert.equal((executable.match(/grant execute/g) || []).length, 3);
  assert.doesNotMatch(executable, /grant execute[\s\S]{0,200}\bto (?:public|anon|authenticated)\b/);
});

test('private event validator rejects extraneous keys, bad symbols and invalid event periods', () => {
  const body = functionBody('sec_earnings_normalize_event');
  assert.match(body, /jsonb_object_keys\(p_event\)/);
  assert.match(body, /p_symbol is not null and event_symbol <> p_symbol/);
  assert.match(body, /provider_date < date '2000-01-01'/);
  assert.match(body, /event_report_date < provider_date - 31 or event_report_date > provider_date \+ 180/);
  assert.match(body, /event_report_date > current_date \+ 45/);
  assert.match(body, /official_date > current_date/);
  assert.ok(sql.includes('revoke all on function public.sec_earnings_normalize_event(jsonb, text) from public, anon, authenticated, service_role;'));
  assert.doesNotMatch(sql, /grant execute on function public\.sec_earnings_normalize_event/);
});

test('registration requires a real current user watchlist match and returns counts only', () => {
  const body = functionBody('register_sec_earnings_requested_events');
  assert.match(body, /p_user_id is null/);
  assert.match(body, /jsonb_array_length\(p_events\) > 100/);
  assert.match(body, /from public\.watchlist as w\s+where w\.user_id = p_user_id/);
  assert.match(body, /w\.symbol[\s\S]{0,80}= event_row ->> 'symbol'/);
  assert.match(body, /then\s+continue;/);
  assert.match(body, /return jsonb_build_object\('registered', registered\)/);
  assert.doesNotMatch(body, /jsonb_build_object\([^;]*(?:'user_id'|'userId'|'members'|'watchlist')/);
  assert.doesNotMatch(body, /w\.(?:price|high|shares|cost|target_price_usd)/);
});

test('duplicate calendar reads do not continually reset retry backoff', () => {
  const body = functionBody('register_sec_earnings_requested_events');
  assert.match(body, /where excluded\.official_fiscal_date is not null\s+and saved\.official_fiscal_date is distinct from excluded\.official_fiscal_date/);
  assert.match(body, /get diagnostics changed = row_count/);
  assert.match(body, /if changed > 0 then[\s\S]*?next_scan_at = least\(job\.next_scan_at, excluded\.next_scan_at\)/);
  assert.match(body, /wake_revision = job\.wake_revision \+ 1/);
});

test('registration uses the same jobs-before-events lock order and stable symbol order as completion', () => {
  const body = functionBody('register_sec_earnings_requested_events');
  const lock = body.indexOf('for update;');
  const eventInsert = body.indexOf('insert into public.sec_earnings_requested_events');
  assert.ok(lock > 0 && eventInsert > lock);
  assert.match(body, /order by regexp_replace\(upper\(btrim\(value ->> 'symbol'\)\)/);
});

test('claim is bounded, seeds only distinct current symbols, and never reads financial columns', () => {
  const body = functionBody('claim_sec_earnings_watch_jobs');
  assert.match(body, /p_limit < 1 or p_limit > 12/);
  assert.match(body, /p_lease_seconds < 10 or p_lease_seconds > 90/);
  assert.match(body, /select distinct normalized\.symbol from public\.watchlist as w/);
  assert.match(body, /on conflict on constraint sec_earnings_watch_jobs_pkey do nothing/);
  assert.match(body, /and exists \(select 1 from public\.watchlist as w/);
  assert.doesNotMatch(body, /w\.(?:user_id|price|high|shares|cost|target_price_usd)/);
});

test('lease claims use row locking, expiry checks and fresh UUIDs without racing workers', () => {
  const body = functionBody('claim_sec_earnings_watch_jobs');
  assert.match(body, /job\.lease_until is null or job\.lease_until <= clock_timestamp\(\)/);
  assert.match(body, /for update of job skip locked\s+limit p_limit/);
  assert.match(body, /lease_token = gen_random_uuid\(\)/);
  assert.match(body, /lease_revision = job\.wake_revision/);
  assert.match(body, /attempt_count = least\(job\.attempt_count \+ 1, 1000000\)/);
  assert.match(body, /returning job\.symbol, job\.lease_token, job\.lease_until, job\.attempt_count, job\.last_checked_at/);
});

test('completion refuses stale/expired worker tokens before any result or event write', () => {
  const body = functionBody('complete_sec_earnings_watch_job');
  assert.match(body, /current_job\.symbol = normalized_symbol and current_job\.lease_token = p_lease_token\s+and current_job\.lease_until > clock_timestamp\(\) for update/);
  const stale = body.indexOf("'outcome', 'stale'");
  const write = body.indexOf('insert into public.sec_earnings_shared_results');
  assert.ok(stale > 0 && write > stale);
  assert.match(body, /if job\.lease_until <= clock_timestamp\(\) then\s+raise exception 'earnings lease expired before completion' using errcode = '40001'/);
  assert.doesNotMatch(body, /exception\s+when/i);
});

test('result completion is capped to two 1 MiB payloads with bounded retention and event batch', () => {
  const body = functionBody('complete_sec_earnings_watch_job');
  assert.match(body, /jsonb_array_length\(p_results\) > 2/);
  assert.match(body, /octet_length\(result_payload::text\) > 1048576/);
  assert.match(body, /jsonb_array_length\(p_events\) > 16/);
  assert.match(body, /p_next_delay_seconds < 60 or p_next_delay_seconds > 604800/);
  assert.match(body, /result_ttl < 60 or result_ttl > 604800/);
  assert.match(body, /result_date > current_date/);
  assert.match(body, /result_date - result_start < 70 or result_date - result_start > 105/);
});

test('shared results must agree on symbol, SEC issuer, accession, document, parser and actual period', () => {
  const body = functionBody('complete_sec_earnings_watch_job');
  for (const check of [
    "result_payload ->> 'symbol' is distinct from normalized_symbol",
    "result_payload ->> 'parserVersion' is distinct from p_parser_version",
    "result_payload #>> '{source,provider}' is distinct from 'SEC'",
    "result_payload #>> '{source,cik}' is distinct from result_row ->> 'cik'",
    "result_payload #>> '{source,accession}' is distinct from result_row ->> 'accession'",
    "result_payload #>> '{source,documentType}' is distinct from result_row ->> 'document_type'",
    "result_payload #>> '{period,end}' is distinct from result_date::text",
    "result_payload #>> '{period,fiscalDate}' is distinct from result_date::text",
    "result_payload #>> '{period,officialFiscalDate}' is distinct from result_date::text",
  ]) assert.ok(body.includes(check), `missing identity proof: ${check}`);
  assert.match(tableBody('sec_earnings_shared_results'), /cik text not null check/);
  assert.match(body, /\(symbol, official_fiscal_date, cik, accession, document_type, parser_version, payload, checked_at, expires_at\)/);
  assert.match(body, /saved\.cik = excluded\.cik/);
  assert.ok(body.includes("coalesce(result_payload #>> '{source,primaryDocumentUrl}', '') !~ '^https://www\\.sec\\.gov/Archives/edgar/data/"));
});

test('empty, unavailable and unverifiable results cannot replace a verified public result', () => {
  const body = functionBody('complete_sec_earnings_watch_job');
  assert.match(body, /result_payload ->> 'status', ''\) not in \('complete', 'partial'\)/);
  assert.match(body, /section\.value ->> 'status' = 'complete'/);
  assert.match(body, /jsonb_typeof\(item\.value -> 'revenue'\) = 'number'/);
  assert.match(body, /raise exception 'SEC result has no verified revenue items'/);
  assert.match(body, /saved\.payload ->> 'status' <> 'complete' or excluded\.payload ->> 'status' = 'complete'/);
  assert.match(body, /previous_section\.value ->> 'status' = 'complete'[\s\S]*?is distinct from 'complete'/);
});

test('payload has a fixed public response envelope and rejects nested identity/credential leakage', () => {
  const body = functionBody('complete_sec_earnings_watch_job');
  assert.match(body, /jsonb_object_keys\(result_payload\)/);
  assert.match(body, /jsonb_path_exists\(result_payload,/);
  for (const key of ['user_id', 'userId', 'email', 'access_token', 'refresh_token', 'authorization', 'api_key', 'holdings', 'quantity']) {
    assert.ok(body.includes(`@.key == "${key}"`), `nested ${key} must be rejected`);
  }
});

test('completion registers only same-symbol event metadata without reawakening its own completed work', () => {
  const body = functionBody('complete_sec_earnings_watch_job');
  assert.match(body, /public\.sec_earnings_normalize_event\(event_row, normalized_symbol\)/);
  assert.match(body, /last_attempt_at = excluded\.last_attempt_at/);
  assert.match(body, /status = excluded\.status, reason = excluded\.reason/);
  assert.doesNotMatch(body, /saved\.status = 'complete' and excluded\.status <> 'complete'/);
  assert.doesNotMatch(body, /wake_revision\s*=\s*[^;]*\+ 1/);
  assert.match(body, /current_job\.wake_revision > job\.lease_revision then clock_timestamp\(\)/);
  assert.match(body, /set lease_token = null, lease_until = null, lease_revision = null/);
});

test('a discovered newer accession expires older same-quarter results even when parsing failed', () => {
  const validator = functionBody('sec_earnings_normalize_event');
  const body = functionBody('complete_sec_earnings_watch_job');
  assert.ok(validator.includes("'expected_accession'"));
  assert.match(validator, /p_event ->> 'expected_accession' is not null[\s\S]*?p_event ->> 'official_fiscal_date' is null/);
  assert.ok(validator.includes("p_event ->> 'expected_accession' !~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'"));
  const start = body.indexOf("if event_row ->> 'expected_accession' is not null then");
  const end = body.indexOf('end if;', start);
  assert.ok(start > body.indexOf("'outcome', 'stale'") && end > start);
  const invalidate = body.slice(start, end);
  assert.match(invalidate, /set expires_at = least\(older_result\.expires_at, clock_timestamp\(\)\)/);
  assert.match(invalidate, /older_result\.symbol = normalized_symbol/);
  assert.match(invalidate, /older_result\.official_fiscal_date = \(event_row ->> 'official_fiscal_date'\)::date/);
  assert.match(invalidate, /older_result\.parser_version = p_parser_version/);
  assert.match(invalidate, /older_result\.accession <> event_row ->> 'expected_accession'/);
  assert.doesNotMatch(invalidate, /(?:payload|checked_at)\s*=|delete\s+from|status\s*=/i);
  assert.match(tableBody('sec_earnings_shared_results'), /check \(expires_at >= checked_at\)/);
  assert.ok(body.indexOf("'earnings lease expired before completion'", end) > end);
  assert.doesNotMatch(functionBody('register_sec_earnings_requested_events'), /update public\.sec_earnings_shared_results/);
});

test('foundation never mutates watchlist or any formal financial ledger', () => {
  const writes = [...executable.matchAll(/\b(?:insert\s+into|update|delete\s+from|alter\s+table)\s+public\.([a-z_0-9]+)/gi)].map((match) => match[1]);
  assert.ok(writes.length > 0);
  for (const target of writes) assert.ok(tables.includes(target), `out-of-scope write: ${target}`);
  for (const ledger of ['stock_trades', 'swing_waves', 'community_competition', 'pnl_report', 'available_cash']) {
    assert.equal(executable.includes(`public.${ledger}`), false);
  }
});

test('production anonymous probes cover SEC service-only tables, all write RPCs and the private validator', () => {
  const probeSource = readFileSync(new URL('../scripts/verify-rls-rest.mjs', import.meta.url), 'utf8');
  // Evaluate declarations only: never import this production-facing script or
  // run its network probes from local tests.
  const declarationEnd = probeSource.indexOf('\nfunction unique(');
  assert.ok(declarationEnd > 0);
  const { serviceTables, serviceRpcs } = JSON.parse(JSON.stringify(runInNewContext(
    `${probeSource.slice(0, declarationEnd)}\n({ serviceTables: SERVICE_ONLY_TABLES, serviceRpcs: SERVICE_ONLY_RPCS })`,
    {}, { timeout: 1000 },
  )));
  for (const table of tables) {
    const entries = serviceTables.filter((entry) => entry.table === table);
    assert.deepEqual(entries, [{ table, select: 'symbol' }]);
  }
  const names = [...Object.keys(rpcSignatures), 'sec_earnings_normalize_event'];
  for (const name of names) assert.equal(serviceRpcs.filter((entry) => entry.name === name).length, 1);
  const byName = Object.fromEntries(serviceRpcs.map((entry) => [entry.name, entry.body]));
  assert.equal(byName.register_sec_earnings_requested_events.p_user_id, null);
  assert.deepEqual(byName.register_sec_earnings_requested_events.p_events, []);
  assert.equal(byName.claim_sec_earnings_watch_jobs.p_limit, 0);
  assert.equal(byName.complete_sec_earnings_watch_job.p_lease_token, null);
  assert.deepEqual(byName.complete_sec_earnings_watch_job.p_results, []);
  assert.deepEqual(byName.complete_sec_earnings_watch_job.p_events, []);
  assert.deepEqual(byName.sec_earnings_normalize_event, {
    p_event: { symbol: 'RLS-PROBE', provider_fiscal_date: '2000-01-01', report_date: '2000-01-02' },
    p_symbol: 'RLS-PROBE',
  });
  assert.match(probeSource, /ok: res\.status === 401 \|\| res\.status === 403/);
  // Invalid write inputs must be rejected before even a regressed grant could
  // seed jobs, acquire a lease, or write shared results.
  for (const [name, invalidCheck, firstMutation] of [
    ['register_sec_earnings_requested_events', 'p_user_id is null', 'insert into public.sec_earnings_watch_jobs'],
    ['claim_sec_earnings_watch_jobs', 'p_limit < 1', 'insert into public.sec_earnings_watch_jobs'],
    ['complete_sec_earnings_watch_job', 'p_lease_token is null', 'select * into job'],
  ]) {
    const body = functionBody(name);
    assert.ok(body.indexOf(invalidCheck) > 0 && body.indexOf(invalidCheck) < body.indexOf(firstMutation));
  }
});
