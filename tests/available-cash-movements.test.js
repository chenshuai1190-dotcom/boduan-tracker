import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function translationCount(i18nSource, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (i18nSource.match(new RegExp(`['"]${escaped}['"]\\s*:`, 'g')) || []).length;
}

const appSource = source('../src/App.jsx');
const cashEditorSource = source('../src/components/AvailableCashEditor.jsx');
const dbSource = source('../src/lib/db.js');
const i18nSource = source('../src/lib/i18n.js');
const rlsProbeSource = source('../scripts/verify-rls-rest.mjs');
const movementFoundationSource = source('../supabase/available_cash_movements_foundation_20260904.sql');
const movementContractSource = source('../supabase/available_cash_movements_contract_after_runtime_20260904.sql');

test('browser data access uses the RPC and never falls back to a direct status upsert', () => {
  const mutateStart = dbSource.indexOf('export const mutateAvailableCash');
  const fetchStart = dbSource.indexOf('export const fetchAvailableCashMovements');
  assert.ok(mutateStart >= 0, 'db must expose mutateAvailableCash');
  assert.ok(fetchStart >= 0, 'db must expose fetchAvailableCashMovements');

  const mutateEndCandidates = [
    dbSource.indexOf('\nexport const ', mutateStart + 1),
    dbSource.indexOf('\n// ============', mutateStart + 1),
  ].filter((index) => index > mutateStart);
  const mutateBlock = dbSource.slice(mutateStart, Math.min(...mutateEndCandidates));
  assert.ok(mutateBlock.includes("supabase.rpc('mutate_available_cash'"));
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
    assert.ok(mutateBlock.includes(parameter), `RPC call must send ${parameter}`);
  }
  assert.equal(mutateBlock.includes(".from('available_cash_status')"), false);
  assert.equal(mutateBlock.includes('upsertAvailableCashStatus'), false);
  const errorIndex = mutateBlock.indexOf('if (error) throw error');
  const cacheIndex = mutateBlock.indexOf('cacheSet(');
  assert.ok(errorIndex >= 0 && cacheIndex > errorIndex, 'cash cache must update only after the RPC commits');

  const fetchEndCandidates = [
    dbSource.indexOf('\nexport const ', fetchStart + 1),
    dbSource.indexOf('\n// ============', fetchStart + 1),
  ].filter((index) => index > fetchStart);
  const fetchBlock = dbSource.slice(fetchStart, Math.min(...fetchEndCandidates));
  assert.ok(fetchBlock.includes(".from('available_cash_movements')"));
  assert.ok(fetchBlock.includes(".eq('user_id', user.id)"));
  assert.ok(fetchBlock.includes(".order('occurred_at', { ascending: false })"));
});

test('App persists every cash mode before visible state and keeps recalculation isolated', () => {
  const saveStart = appSource.indexOf('const mutateAvailableCash = useCallback');
  const saveEnd = appSource.indexOf('// === 持仓冷静室', saveStart);
  const saveBlock = appSource.slice(saveStart, saveEnd);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);
  assert.ok(saveBlock.includes('await db.mutateAvailableCash'));
  assert.equal(saveBlock.includes('db.upsertAvailableCashStatus'), false);
  assert.ok(saveBlock.indexOf('await db.mutateAvailableCash') < saveBlock.indexOf('setAvailableCashStatus('));
  assert.ok(saveBlock.includes('expectedUpdatedAt') || saveBlock.includes('expected_updated_at'));
  for (const forbidden of [
    'markPnlReportDirty',
    'recalculatePnlReportAfterLedgerMutation',
    'recalculateCompetitionAfterLedgerMutation',
    'insertStockTrade',
    'upsertYearlyActual',
    'upsertSnapshot',
  ]) {
    assert.equal(saveBlock.includes(forbidden), false, `cash save must not call ${forbidden}`);
  }
});

test('cash editor exposes three explicit modes with bank-card-only transfer metadata', () => {
  assert.ok(cashEditorSource.includes('data-home-available-cash-editor="true"'));
  assert.ok(cashEditorSource.includes('data-cash-mode'));
  assert.ok(cashEditorSource.includes('data-available-cash-mutate'));
  for (const kind of ['transfer_in', 'transfer_out', 'balance_adjustment']) {
    assert.ok(cashEditorSource.includes(`'${kind}'`), `cash editor must expose ${kind}`);
  }
  assert.match(
    cashEditorSource,
    /actionKind === 'transfer_out'[\s\S]{0,160}?\{ destinationLabel: 'bank_card' \}[\s\S]{0,120}?\{ destinationLabel: '' \}/u,
  );
  assert.ok(cashEditorSource.includes("inputAmount: allOut && rate ? amountUsd * rate : Number(draftCash)"));
  assert.ok(cashEditorSource.includes('mutationRequestIdRef.current = requestId'));
  assert.ok(cashEditorSource.includes("typeof crypto.randomUUID === 'function'"));
  assert.ok(cashEditorSource.includes("typeof crypto.getRandomValues === 'function'"));
  assert.ok(cashEditorSource.includes("if (!requestId) throw new Error('cash_request_id_unavailable')"));
  assert.match(cashEditorSource, /transfer_(?:in|out)[\s\S]*?>\s*0|amount[\s\S]*?>\s*0/iu);
  assert.ok(cashEditorSource.includes("isSet && actionKind === 'balance_adjustment'"), 'an unset balance may still be explicitly adjusted to zero');
  assert.ok(cashEditorSource.includes('availableCashUsd'));
  assert.ok(cashEditorSource.includes('inputCurrency') || cashEditorSource.includes('input_currency'));
  assert.ok(cashEditorSource.includes('inputAmount') || cashEditorSource.includes('input_amount'));
  assert.ok(cashEditorSource.includes('usdRate') || cashEditorSource.includes('usd_rate'));
  assert.equal(cashEditorSource.includes('stock_trades'), false);
  assert.equal(cashEditorSource.includes('community_competition'), false);
  assert.equal(cashEditorSource.includes('balance_snapshots'), false);
});

test('new cash-movement copy and production probes cover both languages and REST boundaries', () => {
  const editorKeys = [...cashEditorSource.matchAll(/t\(language,\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((key) => key.startsWith('home.cash'));
  const newKeys = [...new Set(editorKeys)];
  assert.ok(newKeys.length >= 20, 'the three-mode editor needs explicit bilingual labels, validation, confirmation, and history copy');
  for (const key of newKeys) {
    assert.equal(translationCount(i18nSource, key), 2, `${key} must exist once in each language dictionary`);
  }

  assert.match(rlsProbeSource, /'available_cash_movements'/u);
  const rpcProbeStart = rlsProbeSource.indexOf("name: 'mutate_available_cash'");
  assert.ok(rpcProbeStart >= 0, 'anonymous REST probes must cover mutate_available_cash');
  const rpcProbe = rlsProbeSource.slice(rpcProbeStart, rpcProbeStart + 900);
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
    assert.ok(rpcProbe.includes(parameter), `REST probe must match ${parameter}`);
  }

  assert.match(
    movementFoundationSource,
    /create policy "users can read own available cash movements"[\s\S]*?to authenticated[\s\S]*?using \(auth\.uid\(\) = user_id\)/iu,
    'authenticated users may read only their own movement rows',
  );
  assert.match(
    movementFoundationSource,
    /revoke all privileges on table public\.available_cash_movements[\s\S]*?from public, anon, authenticated, service_role[\s\S]*?grant select on table public\.available_cash_movements[\s\S]*?to authenticated, service_role/iu,
    'movement rows must stay anonymous-inaccessible and owner-readable',
  );
  assert.match(
    movementFoundationSource,
    /kind = 'transfer_out'\s+and destination_label = 'bank_card'\s*\)\s*or\s*\(\s*kind <> 'transfer_out'\s+and destination_label = ''/iu,
    'the database constraint must require a bank-card destination for every transfer out',
  );
  assert.match(
    movementFoundationSource,
    /normalized_kind = 'transfer_out'\s+and normalized_destination <> 'bank_card'[\s\S]*?normalized_kind <> 'transfer_out'\s+and normalized_destination <> ''/iu,
    'the mutation RPC must reject a missing transfer-out destination before it writes status',
  );
  assert.match(
    movementContractSource,
    /revoke all privileges on table public\.available_cash_status[\s\S]*?from public, anon, authenticated, service_role[\s\S]*?grant select on table public\.available_cash_status[\s\S]*?to authenticated, service_role/iu,
    'the after-runtime contract must revoke direct status writes',
  );
  assert.doesNotMatch(
    movementContractSource,
    /grant\s+(?:insert|update|delete)[\s\S]{0,120}?public\.available_cash_status[\s\S]{0,120}?to authenticated/iu,
  );
  assert.match(
    movementContractSource,
    /grant execute on function public\.mutate_available_cash\([\s\S]*?\)\s*to authenticated/iu,
    'authenticated cash writes must use the RPC',
  );
});
