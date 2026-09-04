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

const foundation = source('../supabase/available_cash_movement_reversal_foundation_20260904.sql');
const contract = source('../supabase/available_cash_movement_reversal_contract_after_runtime_20260904.sql');
const canonicalRls = source('../supabase/rls.sql');
const canonicalSnapshots = source('../supabase/pnl_report_snapshots.sql');
const rlsProbe = source('../scripts/verify-rls-rest.mjs');

const reverseSignature = /public\.reverse_available_cash_movement\(\s*uuid\s*,\s*uuid\s*,\s*timestamptz\s*\)/iu;

test('cash reversal uses an independent staged readiness gate', () => {
  assert.match(foundation, /to_regprocedure\('public\.available_cash_write_contract_ready\(\)'\) is null/iu);
  assert.doesNotMatch(foundation, /if not public\.available_cash_write_contract_ready\(\)/iu);
  assert.match(foundation, /available_cash_reversal_contract_ready\(\)[\s\S]*?select false/iu);
  assert.match(contract, /available_cash_reversal_contract_ready\(\)[\s\S]*?select true/iu);
  assert.doesNotMatch(
    foundation,
    /grant execute on function public\.reverse_available_cash_movement[\s\S]{0,120}?to authenticated/iu,
  );
  assert.match(
    contract,
    new RegExp(`grant execute on function ${reverseSignature.source}[\\s\\S]{0,80}?to authenticated`, 'iu'),
  );
  assert.doesNotMatch(
    `${foundation}\n${contract}`,
    /create or replace function public\.available_cash_write_contract_ready\s*\(/iu,
    'reversal rollout must not change the existing cash-write readiness gate',
  );
});

test('reversal links are owner-bound, append-only, and unique per original movement', () => {
  assert.match(foundation, /add column if not exists reverses_movement_id uuid/iu);
  assert.match(
    foundation,
    /foreign key \(user_id, reverses_movement_id\)[\s\S]*?references public\.available_cash_movements \(user_id, id\)/iu,
  );
  assert.match(
    foundation,
    /create unique index if not exists available_cash_movements_one_reversal_idx[\s\S]*?where reverses_movement_id is not null/iu,
  );
  assert.match(foundation, /kind in \('transfer_in', 'transfer_out', 'balance_adjustment', 'reversal'\)/iu);
  assert.match(
    foundation,
    /kind = 'reversal'[\s\S]*?reverses_movement_id is not null[\s\S]*?kind <> 'reversal'[\s\S]*?reverses_movement_id is null/iu,
  );
  assert.match(
    foundation,
    /kind = 'reversal'[\s\S]*?input_currency = 'USD'[\s\S]*?usd_rate = 1[\s\S]*?input_amount = amount_usd/iu,
  );
  assert.match(foundation, /kind = 'reversal'[\s\S]*?amount_usd = abs\(delta_usd\)/iu);
  assert.match(foundation, /create trigger validate_available_cash_reversal_insert\s+before insert/iu);
  assert.match(contract, /tgname = 'available_cash_movements_immutable'[\s\S]*?tgtype = 27/iu);
});

test('reversal insert validation rejects fabricated fields and reversal-of-reversal', () => {
  const validate = functionBody(foundation, 'validate_available_cash_reversal_insert()');
  assert.match(validate, /movement\.user_id = new\.user_id[\s\S]*?movement\.id = new\.reverses_movement_id/iu);
  assert.match(validate, /original_movement\.kind = 'reversal'/iu);
  assert.match(validate, /available cash reversal rows cannot be reversed/iu);
  assert.match(validate, /original_movement\.delta_usd = 0[\s\S]*?zero-delta/iu);
  assert.doesNotMatch(validate, /not original_movement\.balance_was_set_before/iu);
  assert.match(validate, /new\.amount_usd is distinct from abs\(original_movement\.delta_usd\)/iu);
  assert.match(validate, /new\.delta_usd is distinct from -original_movement\.delta_usd/iu);
  assert.match(validate, /new\.balance_after_usd is distinct from original_movement\.balance_before_usd/iu);
  assert.match(validate, /event\.user_id = new\.user_id[\s\S]*?event\.effective_at = new\.occurred_at/iu);
});

test('reverse RPC is authenticated, idempotent, locked, and restores server-derived state', () => {
  assert.match(foundation, reverseSignature);
  const reverse = functionBody(foundation, 'reverse_available_cash_movement(');

  assert.match(reverse, /language plpgsql[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog, public/iu);
  assert.match(reverse, /current_user_id uuid := auth\.uid\(\)/iu);
  assert.match(reverse, /p_operation_key is null or p_movement_id is null/iu);
  assert.match(reverse, /pg_advisory_xact_lock/iu);

  const retryLookup = reverse.indexOf('into existing_reversal');
  const statusLock = reverse.indexOf('from public.available_cash_status as status');
  const staleCheck = reverse.indexOf('current_updated_at is distinct from p_expected_updated_at');
  assert.ok(retryLookup >= 0 && statusLock > retryLookup && staleCheck > statusLock);
  assert.match(reverse, /existing_reversal\.reverses_movement_id is distinct from p_movement_id/iu);
  assert.match(reverse, /current_cash_usd,[\s\S]*?current_updated_at,[\s\S]*?existing_reversal\.id/iu);
  assert.match(reverse, /for update/iu);
  assert.match(reverse, /using errcode = '40001'/iu);
  assert.match(reverse, /restored_cash_usd := target_movement\.balance_before_usd/iu);
  assert.match(reverse, /reversal_delta_usd := \(-target_movement\.delta_usd\)/iu);
  assert.match(reverse, /reversal_amount_usd := abs\(target_movement\.delta_usd\)/iu);
  assert.match(reverse, /'reversal',[\s\S]*?'USD',[\s\S]*?reversal_amount_usd,[\s\S]*?1,/iu);
  assert.match(reverse, /movement_reverses_movement_id uuid/iu);
});

test('server selects the latest eligible unreversed original by cash event for continuous LIFO', () => {
  const reverse = functionBody(foundation, 'reverse_available_cash_movement(');
  const targetStart = reverse.indexOf('into target_movement');
  const targetEnd = reverse.indexOf('if not found or target_movement.id', targetStart);
  const targetQuery = reverse.slice(targetStart, targetEnd);

  assert.match(targetQuery, /movement\.kind <> 'reversal'/iu);
  assert.match(targetQuery, /movement\.reverses_movement_id is null/iu);
  assert.match(targetQuery, /movement\.cash_event_id is not null/iu);
  assert.match(targetQuery, /movement\.delta_usd <> 0/iu);
  assert.match(
    targetQuery,
    /not exists[\s\S]*?reversal\.kind = 'reversal'[\s\S]*?reversal\.reverses_movement_id = movement\.id/iu,
  );
  assert.match(targetQuery, /order by movement\.cash_event_id desc[\s\S]*?limit 1[\s\S]*?for update/iu);
  assert.match(reverse, /target_movement\.id is distinct from p_movement_id/iu);
  assert.doesNotMatch(targetQuery, /order by movement\.(?:occurred_at|created_at)/iu);
});

test('first positive activation can restore numeric zero while zero-delta activation fails closed', () => {
  const reverse = functionBody(foundation, 'reverse_available_cash_movement(');
  assert.match(reverse, /target_movement\.delta_usd = 0[\s\S]*?zero-delta/iu);
  assert.doesNotMatch(reverse, /not target_movement\.balance_was_set_before/iu);
  assert.match(reverse, /restored_cash_usd := target_movement\.balance_before_usd/iu);
  assert.match(reverse, /set available_cash_usd = restored_cash_usd/iu);
  assert.doesNotMatch(reverse, /delete from public\.available_cash_status/iu);
});

test('reversal never mutates history and remains isolated from other ledgers', () => {
  const reverse = functionBody(foundation, 'reverse_available_cash_movement(');
  assert.doesNotMatch(reverse, /update public\.available_cash_movements/iu);
  assert.doesNotMatch(reverse, /delete from public\.available_cash_movements/iu);
  assert.match(reverse, /insert into public\.available_cash_movements/iu);
  assert.match(reverse, /current_cash_usd is distinct from target_movement\.balance_after_usd/iu);
  assert.match(reverse, /insufficient available cash to reverse/iu);
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
    assert.equal(reverse.includes(forbidden), false, `reversal RPC must not touch ${forbidden}`);
  }
});

test('contract, canonical SQL, and anonymous REST probes include reversal boundaries', () => {
  assert.match(contract, /available cash reversal constraints are missing or invalid/iu);
  assert.match(contract, /constraint_row\.conkey = array\[[\s\S]*?'user_id'[\s\S]*?'reverses_movement_id'/iu);
  assert.match(contract, /constraint_row\.confkey = array\[[\s\S]*?'user_id'[\s\S]*?'id'/iu);
  assert.match(contract, /constraint_row\.confdeltype = 'c'/iu);
  assert.match(contract, /available_cash_movements_one_reversal_idx/iu);
  assert.match(contract, /indnkeyatts = 1[\s\S]*?pg_get_indexdef\(pg_index\.indexrelid, 1, true\) = 'reverses_movement_id'/iu);
  assert.match(contract, /available_cash_movements_user_reversible_idx/iu);
  assert.match(
    contract,
    /indnkeyatts = 2[\s\S]*?pg_get_indexdef\(pg_index\.indexrelid, 1, true\) = 'user_id'[\s\S]*?pg_get_indexdef\(pg_index\.indexrelid, 2, true\) = 'cash_event_id'[\s\S]*?indoption\[1\]::integer & 1\) = 1/iu,
  );
  assert.doesNotMatch(
    contract,
    /pg_get_indexdef\(pg_index\.indexrelid, 2, true\)[\s\S]{0,80}?cash_event_id DESC/iu,
  );
  assert.match(contract, /grant select on table public\.available_cash_movements\s+to authenticated, service_role/iu);
  assert.doesNotMatch(contract, /grant\s+(?:insert|update|delete)[\s\S]{0,120}?available_cash_movements[\s\S]{0,120}?authenticated/iu);

  for (const [name, sql] of [
    ['rls.sql', canonicalRls],
    ['pnl_report_snapshots.sql', canonicalSnapshots],
  ]) {
    assert.ok(sql.includes(foundation.trim()), `${name} must contain the exact reversal foundation`);
    assert.ok(sql.includes(contract.trim()), `${name} must contain the exact reversal contract`);
  }

  assert.match(rlsProbe, /name: 'available_cash_reversal_contract_ready'/u);
  const probeStart = rlsProbe.indexOf("name: 'reverse_available_cash_movement'");
  assert.ok(probeStart >= 0);
  const probe = rlsProbe.slice(probeStart, probeStart + 500);
  assert.ok(probe.includes('p_operation_key'));
  assert.ok(probe.includes('p_movement_id'));
  assert.ok(probe.includes('p_expected_updated_at'));
});
