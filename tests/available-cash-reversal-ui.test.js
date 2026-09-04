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
const devPreviewSource = source('../src/DevVisualPreview.jsx');
const homeSource = source('../src/tabs/HomeTab.jsx');
const i18nSource = source('../src/lib/i18n.js');
const tradesSource = source('../src/tabs/TradesTab.jsx');

test('cash reversal readiness is independent from normal cash write readiness', () => {
  const fetchStart = dbSource.indexOf('export const fetchAvailableCashStatus');
  const fetchEnd = dbSource.indexOf('const roundAvailableCashAmount', fetchStart);
  const fetchBlock = dbSource.slice(fetchStart, fetchEnd);
  assert.ok(fetchStart >= 0 && fetchEnd > fetchStart);
  assert.ok(fetchBlock.includes("supabase.rpc('available_cash_write_contract_ready')"));
  assert.ok(fetchBlock.includes("supabase.rpc('available_cash_reversal_contract_ready')"));
  assert.ok(fetchBlock.includes('writeReady, reversalReady'));
  assert.ok(dbSource.includes('writeReady: false,\n    reversalReady: false'));

  assert.ok(homeSource.includes('availableCashReversalReady = availableCashWriteReady'));
  assert.ok(tradesSource.includes('availableCashReversalReady = availableCashWriteReady'));
  assert.ok(homeSource.includes('onReverseCashMovement={availableCashReversalReady ? reverseAvailableCashMovement : null}'));
  assert.ok(tradesSource.includes('onReverseCashMovement={availableCashReversalReady ? reverseAvailableCashMovement : null}'));
  assert.ok(appSource.includes('!availableCashStatus?.reversalReady'));

  const refreshStart = dbSource.indexOf('export const fetchAvailableCashReversalReady');
  const refreshEnd = dbSource.indexOf('const roundAvailableCashAmount', refreshStart);
  const refreshBlock = dbSource.slice(refreshStart, refreshEnd);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  assert.ok(refreshBlock.includes("supabase.rpc('available_cash_reversal_contract_ready')"));
  assert.ok(refreshBlock.includes('if (error)'));
  assert.ok(refreshBlock.includes('throw error'));
  assert.ok(refreshBlock.includes('return data === true'));
  assert.equal(refreshBlock.includes('cacheSet('), false);
});

test('opening the cash ledger refreshes stale reversal capability without hiding readable movements', () => {
  const loadStart = appSource.indexOf('const loadAvailableCashMovements = useCallback');
  const loadEnd = appSource.indexOf('const mutateAvailableCash = useCallback', loadStart);
  const loadBlock = appSource.slice(loadStart, loadEnd);
  assert.ok(loadStart >= 0 && loadEnd > loadStart);
  assert.ok(loadBlock.includes('Promise.allSettled(['));
  assert.ok(loadBlock.includes('db.fetchAvailableCashMovements({ limit })'));
  assert.ok(loadBlock.includes('db.fetchAvailableCashReversalReady()'));
  assert.ok(loadBlock.includes('availableCashCapabilityRequestRef.current === capabilityRequestId'));
  assert.ok(loadBlock.includes('reversalReady: current.writeReady === true'));
  assert.ok(loadBlock.includes('&& reversalReadyResult.value === true'));
  assert.equal(/\bwriteReady\s*:/u.test(loadBlock), false);
  assert.ok(loadBlock.includes('({ ...current, reversalReady: false })'));
  assert.equal(loadBlock.includes('setAvailableCashStatus(refreshedStatus)'), false);
  assert.equal(loadBlock.includes('setAvailableCashStatusReady(true)'), false);
  assert.ok(loadBlock.includes("movementResult.status === 'rejected'"));
  assert.ok(loadBlock.includes('throw movementResult.reason'));
  assert.ok(loadBlock.includes('return movementResult.value'));

  const statusIndex = loadBlock.indexOf('reversalReadyResult.status');
  const movementErrorIndex = loadBlock.indexOf("movementResult.status === 'rejected'");
  assert.ok(statusIndex >= 0 && movementErrorIndex > statusIndex);
  assert.ok(homeSource.includes('onLoadCashMovements={loadAvailableCashMovements}'));
  assert.ok(tradesSource.includes('onLoadCashMovements={loadAvailableCashMovements}'));
  assert.ok(cashEditorSource.includes('void loadMovements(RECENT_MOVEMENT_FETCH_LIMIT)'));
  assert.ok(cashEditorSource.includes('}, [isOpen, loadMovements]);'));
});

test('cash reversal data access is append-only, LIFO ordered, and RPC-only', () => {
  assert.ok(dbSource.includes('reversesMovementId: row?.reverses_movement_id ?? row?.movement_reverses_movement_id ?? null'));
  const fetchStart = dbSource.indexOf('export const fetchAvailableCashMovements');
  const reverseStart = dbSource.indexOf('export const reverseAvailableCashMovement');
  const reverseEnd = dbSource.indexOf('// ============ DISCIPLINES', reverseStart);
  const fetchBlock = dbSource.slice(fetchStart, dbSource.indexOf('export const mutateAvailableCash', fetchStart));
  const reverseBlock = dbSource.slice(reverseStart, reverseEnd);
  assert.ok(fetchBlock.includes('reverses_movement_id'));
  assert.ok(fetchBlock.includes(".order('cash_event_id', { ascending: false, nullsFirst: false })"));
  assert.ok(fetchBlock.indexOf(".order('cash_event_id'") < fetchBlock.indexOf(".order('created_at'"));
  assert.ok(reverseBlock.includes("supabase.rpc('reverse_available_cash_movement'"));
  for (const parameter of ['p_operation_key', 'p_movement_id', 'p_expected_updated_at']) {
    assert.ok(reverseBlock.includes(parameter), `reversal RPC must send ${parameter}`);
  }
  assert.equal(reverseBlock.includes(".from('available_cash_status')"), false);
  assert.equal(reverseBlock.includes('.update('), false);
  assert.equal(reverseBlock.includes('.delete('), false);
  const errorIndex = reverseBlock.indexOf('if (error) throw error');
  const cacheIndex = reverseBlock.indexOf('cacheSet(user.id, AVAILABLE_CASH_CACHE_KEY');
  assert.ok(errorIndex >= 0 && cacheIndex > errorIndex, 'the visible balance may update only after the reversal RPC commits');
});

test('App supplies the optimistic timestamp, reconciles errors, and keeps reversal outside every trading ledger', () => {
  const reverseStart = appSource.indexOf('const reverseAvailableCashMovement = useCallback');
  const reverseEnd = appSource.indexOf('// === 持仓冷静室', reverseStart);
  const reverseBlock = appSource.slice(reverseStart, reverseEnd);
  assert.ok(reverseStart >= 0 && reverseEnd > reverseStart);
  const persistenceIndex = reverseBlock.indexOf('await db.reverseAvailableCashMovement');
  const stateIndex = reverseBlock.indexOf('setAvailableCashStatus(result.status)');
  assert.ok(persistenceIndex >= 0 && stateIndex > persistenceIndex);
  assert.ok(reverseBlock.includes('expectedUpdatedAt: availableCashStatus?.updatedAt || null'));
  assert.ok(reverseBlock.includes('await db.fetchAvailableCashStatus()'));
  assert.ok(reverseBlock.includes('availableCashStatus?.reversalReady'));
  for (const forbidden of [
    'stock_trades',
    'swing_waves',
    'cost_basis_trades',
    'community_competition',
    'recalculatePnlReportAfterLedgerMutation',
    'recalculateCompetitionAfterLedgerMutation',
  ]) {
    assert.equal(reverseBlock.includes(forbidden), false, `cash reversal must not call ${forbidden}`);
  }
  assert.ok(appSource.includes('reverseAvailableCashMovement,'));
});

test('cash UI exposes one neutral LIFO undo while hiding reversed display pairs', () => {
  assert.ok(cashEditorSource.includes("if (rawKind === 'reversal') return 'reversal'"));
  assert.ok(cashEditorSource.includes('const latestEligibleMovement = movements.find'));
  assert.ok(cashEditorSource.includes("movementKind(movement) !== 'reversal'"));
  assert.ok(cashEditorSource.includes('deltaUsd !== 0'));
  assert.ok(cashEditorSource.includes('movementCashEventId(movement) !== null'));
  assert.ok(cashEditorSource.includes('!reversalsByOriginalId.has(candidateId)'));
  assert.ok(cashEditorSource.includes('RECENT_MOVEMENT_FETCH_LIMIT = ALL_MOVEMENT_LIMIT'));
  assert.equal((cashEditorSource.match(/visibleCashMovementGroups\(/g) || []).length, 3);
  assert.ok(cashEditorSource.includes('recentMovementGroups.push(reversibleMovementGroup)'));
  assert.ok(cashEditorSource.includes('const reversedOriginalIds = new Set('));
  assert.ok(cashEditorSource.includes("if (movementKind(movement) === 'reversal') return false;"));
  assert.ok(cashEditorSource.includes('return !rowId || !reversedOriginalIds.has(rowId);'));
  assert.ok(cashEditorSource.includes('.map((movement) => ({ movement }))'));
  assert.ok(cashEditorSource.includes('data-cash-reverse-movement={rowId}'));
  assert.ok(cashEditorSource.includes('data-cash-reverse-confirm="true"'));
  assert.equal(cashEditorSource.includes('data-cash-reversal-row="true"'), false);
  assert.equal(cashEditorSource.includes("t(language, 'home.cashReversed', '已撤销')"), false);
  assert.equal(cashEditorSource.includes("t(language, 'home.cashReversalRecord', '撤销记录')"), false);
  assert.ok(cashEditorSource.includes("t(language, 'home.cashUndoExplanation', '撤销会从现在起恢复撤销前余额，并保留历史记录。')"));
  assert.ok(cashEditorSource.includes('const reverseAfterCashUsd = movementBalanceBeforeUsd(reverseTarget)'));
  assert.ok(cashEditorSource.includes('reversalRequestIdRef.current = requestId'));
  assert.ok(cashEditorSource.includes('await onReverseCashMovement({'));
  assert.ok(cashEditorSource.includes('await loadMovements(showAllMovements ? ALL_MOVEMENT_LIMIT : RECENT_MOVEMENT_FETCH_LIMIT)'));

  const undoButtonStart = cashEditorSource.indexOf('data-cash-reverse-movement={rowId}');
  const undoButtonBlock = cashEditorSource.slice(undoButtonStart - 300, undoButtonStart + 500);
  assert.ok(undoButtonBlock.includes('text-white/42'));
  assert.doesNotMatch(undoButtonBlock, /(?:rose|red|green|emerald|amber|#f6b54b)/iu);
  assert.doesNotMatch(cashEditorSource, /text-\[(?:[0-9]|0?\.[0-9]+)px\]/u, 'visible reversal copy must not fall below 10px');
  assert.equal(cashEditorSource.includes('deleteCashMovement'), false);
});

test('cash reversal copy is bilingual and the deterministic preview uses linked reversal rows', () => {
  for (const key of [
    'home.cashUndo',
    'home.cashReversed',
    'home.cashReversalRecord',
    'home.cashUndoTitle',
    'home.cashUndoExplanation',
    'home.cashUndoOriginalMovement',
    'home.cashBalanceAfterUndo',
    'home.cashUndoHistoryHint',
    'home.cashConfirmUndo',
    'home.cashUndoing',
    'home.cashUndoUnavailable',
    'home.cashUndoFailed',
  ]) {
    assert.equal(translationCount(i18nSource, key), 2, `${key} must exist once in each language dictionary`);
  }
  assert.ok(devPreviewSource.includes("kind: 'reversal'"));
  assert.ok(devPreviewSource.includes('reversesMovementId: target.id'));
  assert.ok(devPreviewSource.includes('previewAvailableCashMovements.find'));
  assert.ok(devPreviewSource.includes("movement.kind !== 'reversal'"));
  assert.ok(devPreviewSource.includes('Number(movement.deltaUsd) !== 0'));
  assert.ok(devPreviewSource.includes('movement.cashEventId !== null'));
  assert.ok(devPreviewSource.includes('!reversedMovementIds.has(movement.id)'));
  assert.ok(devPreviewSource.includes('Math.abs(previewAvailableCashUsd - targetBalanceAfterUsd) > 0.000001'));
  assert.equal(devPreviewSource.includes('previewAvailableCashMovements[0]'), false);
  assert.equal(devPreviewSource.includes('target.balanceWasSetBefore !== true'), false);
  assert.ok(devPreviewSource.includes('reverseAvailableCashMovement: reversePreviewAvailableCashMovement'));
});
