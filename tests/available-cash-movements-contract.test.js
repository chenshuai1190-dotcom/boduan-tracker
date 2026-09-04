import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function functionBody(sql, functionName) {
  const start = sql.indexOf(`create or replace function public.${functionName}`);
  assert.ok(start >= 0, `${functionName} must exist`);
  const bodyStart = sql.indexOf('as $$', start);
  const end = sql.indexOf('\n$$;', bodyStart);
  assert.ok(bodyStart > start && end > bodyStart, `${functionName} must have a complete body`);
  return sql.slice(start, end + 4);
}

const foundation = source('../supabase/available_cash_movements_foundation_20260904.sql');
const contract = source('../supabase/available_cash_movements_contract_after_runtime_20260904.sql');
const canonicalRls = source('../supabase/rls.sql');
const canonicalSnapshots = source('../supabase/pnl_report_snapshots.sql');

const rpcSignature = /public\.mutate_available_cash\(\s*uuid\s*,\s*text\s*,\s*numeric\s*,\s*timestamptz\s*,\s*text\s*,\s*numeric\s*,\s*numeric\s*,\s*text\s*,\s*text\s*\)/iu;

test('available cash movement rollout stages the RPC before closing legacy status writes', () => {
  assert.match(foundation, /apply this migration before deploying the movement-aware runtime/iu);
  assert.match(contract, /DO NOT apply this file before the movement-aware runtime is deployed/iu);
  assert.match(contract, /available_cash_movements_foundation_20260904\.sql first/iu);
  assert.match(foundation, /available_cash_write_contract_ready\(\)[\s\S]*?select false/iu);
  assert.match(contract, /available_cash_write_contract_ready\(\)[\s\S]*?select true/iu);

  assert.doesNotMatch(
    foundation,
    /revoke all privileges on table public\.available_cash_status/iu,
    'foundation must not revoke the still-deployed direct-write runtime',
  );
  assert.doesNotMatch(
    foundation,
    /grant execute on function public\.mutate_available_cash[\s\S]{0,240}?to authenticated/iu,
    'foundation must not expose the RPC before its runtime is live',
  );
  assert.match(contract, /revoke all privileges on table public\.available_cash_status[\s\S]*?from public, anon, authenticated, service_role/iu);
  assert.match(contract, /grant select on table public\.available_cash_status\s+to authenticated, service_role/iu);
  assert.doesNotMatch(contract, /grant insert, update on table public\.available_cash_status\s+to authenticated/iu);
  assert.match(contract, /drop policy if exists "users can insert own available cash status"/iu);
  assert.match(contract, /drop policy if exists "users can update own available cash status"/iu);
  assert.match(contract, new RegExp(`grant execute on function ${rpcSignature.source}[\\s\\S]{0,80}?to authenticated`, 'iu'));
});

test('available cash movement schema is owner-readable and immutable with exact arithmetic provenance', () => {
  for (const sql of [foundation, canonicalRls, canonicalSnapshots]) {
    assert.match(sql, /create table if not exists public\.available_cash_movements/iu);
    assert.match(sql, /operation_key uuid not null/iu);
    assert.match(sql, /kind text not null/iu);
    assert.match(sql, /amount_usd numeric\(18, 6\) not null/iu);
    assert.match(sql, /delta_usd numeric\(18, 6\) not null/iu);
    assert.match(sql, /balance_before_usd numeric\(18, 6\) not null/iu);
    assert.match(sql, /balance_after_usd numeric\(18, 6\) not null/iu);
    assert.match(sql, /balance_was_set_before boolean not null/iu);
    assert.match(sql, /input_currency text not null/iu);
    assert.match(sql, /input_amount numeric\(18, 6\) not null/iu);
    assert.match(sql, /usd_rate numeric\(18, 6\) not null/iu);
    assert.match(sql, /cash_event_id bigint\s+references public\.available_cash_events\(id\) on delete cascade/iu);
    assert.match(sql, /occurred_at timestamptz not null/iu);
    assert.match(sql, /unique \(user_id, operation_key\)/iu);
    assert.match(sql, /unique \(cash_event_id\)/iu);
    assert.match(sql, /kind in \('transfer_in', 'transfer_out', 'balance_adjustment'\)/iu);
    assert.match(sql, /balance_after_usd = balance_before_usd \+ delta_usd/iu);
    assert.match(sql, /kind = 'balance_adjustment'[\s\S]*?balance_after_usd = amount_usd/iu);
    assert.match(sql, /input_currency in \('USD', 'CNY'\)/iu);
    assert.match(
      sql,
      /kind = 'transfer_out'\s+and destination_label = 'bank_card'\s*\)\s*or\s*\(\s*kind <> 'transfer_out'\s+and destination_label = ''/iu,
      'every transfer out must be explicitly marked as a bank-card destination',
    );
    assert.match(sql, /available_cash_movements_user_occurred_idx/iu);
    assert.match(sql, /alter table public\.available_cash_movements enable row level security/iu);
    assert.match(sql, /alter table public\.available_cash_movements force row level security/iu);
    assert.match(sql, /create policy "users can read own available cash movements"[\s\S]*?using \(auth\.uid\(\) = user_id\)/iu);
    assert.match(sql, /create trigger available_cash_movements_immutable\s+before update or delete/iu);
  }

  const guard = functionBody(foundation, 'guard_available_cash_movement_immutable()');
  assert.match(guard, /auth\.users/iu, 'account deletion must remain the only destructive exception');
  assert.match(guard, /raise exception 'available cash movement rows are immutable'/iu);
  assert.doesNotMatch(foundation, /grant\s+(?:insert|update|delete)[\s\S]{0,120}?available_cash_movements[\s\S]{0,120}?authenticated/iu);
});

test('mutate_available_cash serializes, validates, and records one atomic owner operation', () => {
  assert.match(foundation, rpcSignature);
  const mutate = functionBody(foundation, 'mutate_available_cash(');

  assert.match(mutate, /language plpgsql[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog, public/iu);
  assert.match(mutate, /current_user_id uuid := auth\.uid\(\)/iu);
  assert.match(mutate, /p_operation_key is null/iu);
  assert.match(mutate, /normalized_kind not in \('transfer_in', 'transfer_out', 'balance_adjustment'\)/iu);
  assert.match(mutate, /normalized_currency not in \('USD', 'CNY'\)/iu);
  assert.match(
    mutate,
    /normalized_kind = 'transfer_out'\s+and normalized_destination <> 'bank_card'/iu,
  );
  assert.match(
    mutate,
    /normalized_kind <> 'transfer_out'\s+and normalized_destination <> ''/iu,
  );
  assert.match(mutate, /pg_advisory_xact_lock/iu, 'the first operation must serialize before a status row exists');

  const retryLookup = mutate.indexOf('from public.available_cash_movements as movement');
  const statusLock = mutate.indexOf('from public.available_cash_status as status');
  const staleCheck = mutate.indexOf('current_updated_at is distinct from p_expected_updated_at');
  assert.ok(retryLookup >= 0 && statusLock > retryLookup && staleCheck > statusLock);
  assert.match(mutate, /operation key was reused for a different request/iu);
  assert.match(mutate, /for update/iu);
  assert.match(mutate, /using errcode = '40001'/iu);
  assert.match(mutate, /before_cash_usd \+ normalized_amount_usd/iu);
  assert.match(mutate, /before_cash_usd - normalized_amount_usd/iu);
  assert.match(mutate, /after_cash_usd := normalized_amount_usd/iu);
  assert.match(mutate, /insufficient available cash/iu);

  const statusUpdate = mutate.indexOf('update public.available_cash_status');
  const cashEventLookup = mutate.indexOf('from public.available_cash_events as event');
  const movementInsert = mutate.indexOf('insert into public.available_cash_movements');
  assert.ok(statusUpdate >= 0 && cashEventLookup > statusUpdate && movementInsert > cashEventLookup);
  assert.match(mutate, /event\.source_updated_at = current_updated_at/iu);
  assert.match(mutate, /event\.cash_usd = after_cash_usd/iu);
  assert.match(mutate, /inserted_movement\.occurred_at/iu);

  for (const forbidden of [
    'stock_trades',
    'trades',
    'swing_waves',
    'swing_wave_exits',
    'cost_basis_trades',
    'community_competition',
    'accounts',
    'balance_snapshots',
    'margin_status',
    'pnl_report_snapshots',
  ]) {
    assert.equal(mutate.includes(forbidden), false, `cash RPC must not touch ${forbidden}`);
  }
});

test('idempotent retry returns the original movement with the latest authoritative status', () => {
  const mutate = functionBody(foundation, 'mutate_available_cash(');
  const existingBranch = mutate.slice(
    mutate.indexOf('if found then'),
    mutate.indexOf("select status.available_cash_usd, status.updated_at", mutate.indexOf('if found then')) + 2400,
  );
  assert.match(existingBranch, /existing_movement\.kind is distinct from normalized_kind/iu);
  assert.match(existingBranch, /select status\.available_cash_usd, status\.updated_at[\s\S]*?for update/iu);
  assert.match(existingBranch, /current_cash_usd,[\s\S]*?current_updated_at,[\s\S]*?existing_movement\.id/iu);
  assert.doesNotMatch(existingBranch, /existing_movement\.balance_after_usd,\s*existing_movement\.effective_at/iu);
  assert.ok(
    existingBranch.indexOf('return query') < existingBranch.indexOf('current_updated_at is distinct from p_expected_updated_at')
      || !existingBranch.includes('current_updated_at is distinct from p_expected_updated_at'),
    'an exact retry must return before optimistic-lock validation',
  );
});

test('after-runtime contract preflights the immutable RPC and keeps old event and competition boundaries', () => {
  assert.match(contract, /to_regclass\('public\.available_cash_movements'\)/iu);
  assert.match(contract, /to_regprocedure\([\s\S]*?'public\.mutate_available_cash\(uuid,text,numeric,timestamp with time zone,text,numeric,numeric,text,text\)'/iu);
  assert.match(contract, /tgname = 'available_cash_movements_immutable'[\s\S]*?tgtype = 27/iu);
  assert.match(contract, /relrowsecurity[\s\S]*?relforcerowsecurity/iu);
  assert.match(contract, /available cash movement owner-read policy is missing/iu);
  assert.match(contract, /available cash movements expose an unexpected write policy/iu);
  assert.match(contract, /available cash mutation RPC security contract is invalid/iu);
  assert.match(contract, /available cash movement constraints are missing or invalid/iu);
  assert.match(contract, /grant select on table public\.available_cash_events\s+to service_role/iu);
  assert.doesNotMatch(contract, /grant select on table public\.available_cash_events\s+to authenticated/iu);
  assert.doesNotMatch(functionBody(foundation, 'mutate_available_cash('), /community_competition/iu);
});

test('canonical SQL files embed the exact dated movement foundation and contract', () => {
  const trimmedFoundation = foundation.trim();
  const trimmedContract = contract.trim();
  for (const [name, sql] of [
    ['rls.sql', canonicalRls],
    ['pnl_report_snapshots.sql', canonicalSnapshots],
  ]) {
    assert.ok(sql.includes(trimmedFoundation), `${name} must contain the exact movement foundation`);
    assert.ok(sql.includes(trimmedContract), `${name} must contain the exact movement contract`);
  }
});
