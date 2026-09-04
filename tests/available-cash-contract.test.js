import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const foundation = source('../supabase/available_cash_foundation_20260805.sql');
const contract = source('../supabase/available_cash_snapshot_contract_after_runtime_20260805.sql');
const canonicalSnapshots = source('../supabase/pnl_report_snapshots.sql');
const canonicalRls = source('../supabase/rls.sql');
const snapshotRuntime = source('../server/pnlReportDailySnapshot.js');
const rlsProbe = source('../scripts/verify-rls-rest.mjs');

function functionBody(sql, functionName) {
  const start = sql.indexOf(`create or replace function public.${functionName}`);
  assert.ok(start >= 0, `${functionName} must exist`);
  const end = sql.indexOf('\n$$;', sql.indexOf('as $$', start));
  assert.ok(end > start, `${functionName} must have a complete SQL body`);
  return sql.slice(start, end + 4);
}

test('available cash rollout keeps foundation, runtime, and owner-write contract phases separate', () => {
  assert.match(foundation, /apply this migration before deploying the available-cash runtime/i);
  assert.match(contract, /DO NOT apply this file before the available-cash runtime is deployed/i);
  assert.match(contract, /available_cash_foundation_20260805\.sql first/i);

  assert.match(foundation, /grant select on table public\.available_cash_status\s+to authenticated, service_role/iu);
  assert.match(foundation, /for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)/iu);
  assert.doesNotMatch(
    foundation,
    /grant\s+(?:insert|update|delete)[\s\S]{0,100}?to\s+authenticated/iu,
    'foundation may expose owner reads but must not activate browser writes before the runtime is live',
  );
  assert.match(contract, /grant select on table public\.available_cash_status\s+to authenticated, service_role/iu);
  assert.match(contract, /grant insert, update on table public\.available_cash_status\s+to authenticated/iu);
  assert.doesNotMatch(contract, /grant\s+delete\s+on table public\.available_cash_status/iu);
});

test('available cash is a nonnegative per-user state with immutable service-only event history', () => {
  for (const sql of [foundation, canonicalSnapshots, canonicalRls]) {
    assert.match(sql, /create table if not exists public\.available_cash_status/iu);
    assert.match(sql, /user_id uuid primary key references auth\.users\(id\) on delete cascade/iu);
    assert.match(sql, /available_cash_usd numeric\(18, 6\) not null/iu);
    assert.match(sql, /check \(\s*available_cash_usd >= 0\s+and available_cash_usd <> 'NaN'::numeric\s*\)/iu);
    assert.match(sql, /create table if not exists public\.available_cash_events/iu);
    assert.match(sql, /check \(\s*cash_usd >= 0\s+and cash_usd <> 'NaN'::numeric\s*\)/iu);
    assert.match(sql, /check \(source in \('status_activation', 'status_change'\)\)/iu);
    assert.match(sql, /alter table public\.available_cash_events force row level security/iu);
    assert.match(sql, /grant select on table public\.available_cash_events\s+to service_role/iu);
  }

  assert.doesNotMatch(contract, /grant[\s\S]{0,80}available_cash_events[\s\S]{0,80}authenticated/iu);
  assert.doesNotMatch(contract, /create policy[\s\S]{0,100}available_cash_events/iu);
  assert.match(contract, /revoke all privileges on sequence public\.available_cash_events_id_seq[\s\S]*?authenticated/iu);
});

test('cash writes use server time, preserve the stock-ledger revision, and dirty only personal P&L', () => {
  const normalize = functionBody(foundation, 'normalize_available_cash_status()');
  const capture = functionBody(foundation, 'capture_available_cash_event()');
  assert.match(normalize, /captured_at timestamptz := clock_timestamp\(\)/iu);
  assert.match(normalize, /auth\.uid\(\) <> new\.user_id/iu);
  assert.match(normalize, /new\.updated_at := captured_at/iu);
  assert.match(normalize, /new\.available_cash_usd = 'NaN'::numeric/iu);
  assert.match(capture, /captured_at timestamptz := new\.updated_at/iu);
  assert.match(capture, /tg_op = 'INSERT'[\s\S]*?'status_activation'/iu);
  assert.match(capture, /old\.available_cash_usd is distinct from new\.available_cash_usd/iu);
  assert.match(capture, /insert into public\.available_cash_events/iu);
  assert.match(capture, /values \(\s*new\.user_id,\s*0,\s*null\s*\)\s*on conflict \(user_id\) do nothing/iu);
  assert.match(capture, /select revision[\s\S]*?for update/iu);
  assert.match(capture, /captured_at at time zone 'America\/New_York'/iu);
  assert.match(capture, /'available_cash_changed'/iu);
  assert.match(capture, /generation = public\.pnl_report_rebuild_state\.generation \+ 1/iu);
  assert.doesNotMatch(capture, /update\s+public\.stock_trade_ledger_revisions/iu);
  assert.doesNotMatch(capture, /community_competition/iu);
  assert.match(foundation, /create trigger normalize_available_cash_status\s+before insert or update/iu);
  assert.match(foundation, /create trigger capture_available_cash_event\s+after insert or update/iu);
  assert.doesNotMatch(foundation, /create trigger capture_available_cash_event\s+before insert or update/iu);
});

test('historical cash resolves at the completed-close cutoff and unknown history stays explicit', () => {
  const resolver = functionBody(foundation, 'resolve_available_cash_snapshot_targets(\n  p_targets jsonb\n)');
  assert.match(resolver, /snapshot_date \+ time '17:00'/iu);
  assert.match(resolver, /at time zone 'America\/New_York'/iu);
  assert.match(resolver, /candidate\.effective_at <=/iu);
  assert.match(resolver, /order by candidate\.effective_at desc, candidate\.id desc/iu);
  assert.match(resolver, /coalesce\(resolved\.event_cash_usd, 0\)/iu);
  assert.match(resolver, /case when resolved\.event_id is null then null else 'event' end/iu);
  assert.match(resolver, /resolved\.event_id is not null/iu);
  assert.match(foundation, /grant execute on function public\.resolve_available_cash_snapshot_targets\(jsonb\)\s+to service_role/iu);
  assert.doesNotMatch(contract, /grant execute[\s\S]{0,100}resolve_available_cash_snapshot_targets[\s\S]{0,100}authenticated/iu);
});

test('snapshot cash is revalidated atomically and provenance is filled only by the database', () => {
  for (const sql of [foundation, canonicalSnapshots, canonicalRls]) {
    assert.match(sql, /add column if not exists cash_event_id bigint/iu);
    assert.match(sql, /add column if not exists cash_effective_at timestamptz/iu);
    assert.match(sql, /add column if not exists cash_basis text/iu);
    assert.match(sql, /constraint pnl_report_snapshots_cash_provenance_check/iu);
  }

  const enforce = functionBody(foundation, 'enforce_pnl_report_available_cash_snapshot()');
  assert.match(enforce, /resolve_available_cash_snapshot_targets/iu);
  assert.match(enforce, /new\.cash_usd is distinct from resolved\.cash_usd/iu);
  assert.match(enforce, /new\.total_assets_usd is distinct from \(\s*new\.market_value_usd \+ resolved\.cash_usd/iu);
  assert.match(enforce, /new\.cash_event_id := resolved\.cash_event_id/iu);
  assert.match(enforce, /new\.cash_effective_at := resolved\.cash_effective_at/iu);
  assert.match(enforce, /new\.cash_basis := resolved\.cash_basis/iu);

  const serializerStart = snapshotRuntime.indexOf('export function toPortfolioSnapshotRow');
  const serializerEnd = snapshotRuntime.indexOf('export function toSymbolSnapshotRow', serializerStart);
  const serializer = snapshotRuntime.slice(serializerStart, serializerEnd);
  assert.ok(serializer.includes('cash_usd: cashUsd'));
  assert.ok(serializer.includes('market_value_usd: marketValueUsd'));
  assert.ok(serializer.includes('snapshotAmountAtDatabaseScale(marketValueUsd + cashUsd)'));
  assert.equal(serializer.includes('cash_event_id'), false);
  assert.equal(serializer.includes('cash_effective_at'), false);
  assert.equal(serializer.includes('cash_basis'), false);
  assert.ok(serializer.includes("'pnl_snapshot_v2'"));
});

test('contract preflights the foundation and exposes only owner-scoped status rows', () => {
  assert.match(contract, /to_regclass\('public\.available_cash_status'\)/iu);
  assert.match(contract, /to_regprocedure\(\s*'public\.resolve_available_cash_snapshot_targets\(jsonb\)'/iu);
  assert.match(contract, /to_regprocedure\('public\.normalize_available_cash_status\(\)'\)/iu);
  assert.match(contract, /to_regprocedure\(\s*'public\.available_cash_write_contract_ready\(\)'/iu);
  assert.match(contract, /tgname = 'capture_available_cash_event'/iu);
  assert.match(contract, /tgname = 'normalize_available_cash_status'/iu);
  assert.match(contract, /tgname = 'enforce_pnl_report_available_cash_snapshot'/iu);
  assert.match(contract, /tgfoid = 'public\.capture_available_cash_event\(\)'::regprocedure[\s\S]*?tgtype = 21/iu);
  assert.match(contract, /tgfoid = 'public\.normalize_available_cash_status\(\)'::regprocedure[\s\S]*?tgtype = 23/iu);
  assert.match(contract, /tgfoid = 'public\.enforce_pnl_report_available_cash_snapshot\(\)'::regprocedure[\s\S]*?tgtype = 23/iu);
  assert.equal((contract.match(/tgenabled = 'O'/g) || []).length, 3);
  assert.match(contract, /relrowsecurity[\s\S]*?relforcerowsecurity/iu);
  assert.match(contract, /available cash snapshot provenance columns are missing/iu);
  for (const constraintName of [
    'available_cash_status_amount_check',
    'available_cash_status_logic_version_check',
    'available_cash_events_amount_check',
    'available_cash_events_source_check',
    'available_cash_events_logic_version_check',
    'pnl_report_snapshots_cash_provenance_check',
  ]) {
    assert.match(contract, new RegExp(`conname = '${constraintName}'`, 'iu'));
  }
  assert.equal((contract.match(/pg_get_constraintdef\(oid\) like '%NaN%'/g) || []).length, 3);
  assert.match(contract, /for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)/iu);
  assert.match(contract, /for insert\s+to authenticated\s+with check \(auth\.uid\(\) = user_id\)/iu);
  assert.match(contract, /for update\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)\s+with check \(auth\.uid\(\) = user_id\)/iu);
  assert.match(foundation, /function public\.available_cash_write_contract_ready\(\)[\s\S]*?select false/iu);
  assert.match(contract, /function public\.available_cash_write_contract_ready\(\)[\s\S]*?select true/iu);
});

test('the production RLS probe covers cash state, movement history, mutation, and the service resolver', () => {
  assert.match(rlsProbe, /'available_cash_status'/u);
  assert.match(rlsProbe, /'available_cash_movements'/u);
  assert.match(rlsProbe, /table: 'available_cash_events'/u);
  assert.match(rlsProbe, /name: 'resolve_available_cash_snapshot_targets'/u);
  assert.match(rlsProbe, /name: 'available_cash_write_contract_ready'/u);
  assert.match(rlsProbe, /name: 'mutate_available_cash'/u);
  for (const parameter of [
    'p_operation_key',
    'p_kind',
    'p_amount_usd',
    'p_expected_updated_at',
    'p_input_currency',
    'p_input_amount',
    'p_usd_rate',
    'p_note',
    'p_destination_label',
  ]) {
    assert.ok(rlsProbe.includes(parameter), `anonymous RPC probe must send ${parameter}`);
  }
});
