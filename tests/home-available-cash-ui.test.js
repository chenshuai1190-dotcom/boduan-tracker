import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const appSource = source('../src/App.jsx');
const cashEditorSource = source('../src/components/AvailableCashEditor.jsx');
const dbSource = source('../src/lib/db.js');
const devPreviewSource = source('../src/DevVisualPreview.jsx');
const homeSource = source('../src/tabs/HomeTab.jsx');
const marginRiskSource = source('../src/pages/HomeMarginRiskPage.jsx');
const i18nSource = source('../src/lib/i18n.js');
const tradesSource = source('../src/tabs/TradesTab.jsx');

function translationCount(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (i18nSource.match(new RegExp(`['"]${escaped}['"]\\s*:`, 'g')) || []).length;
}

test('available cash status and movements load independently while writes stay RPC-only', () => {
  const fetchStart = dbSource.indexOf('export const fetchAvailableCashStatus');
  const movementStart = dbSource.indexOf('export const fetchAvailableCashMovements');
  const mutateStart = dbSource.indexOf('export const mutateAvailableCash');
  const end = dbSource.indexOf('// ============ DISCIPLINES', mutateStart);
  assert.ok(fetchStart >= 0 && movementStart > fetchStart && mutateStart > movementStart && end > mutateStart);

  const fetchBlock = dbSource.slice(fetchStart, movementStart);
  const movementBlock = dbSource.slice(movementStart, mutateStart);
  const mutateBlock = dbSource.slice(mutateStart, end);
  assert.ok(fetchBlock.includes(".from('available_cash_status')"));
  assert.ok(fetchBlock.includes("supabase.rpc('available_cash_write_contract_ready')"));
  assert.ok(fetchBlock.includes(".eq('user_id', user.id)"));
  assert.ok(fetchBlock.includes('mapAvailableCashStatus(data, { writeReady })'));
  assert.ok(fetchBlock.includes('emptyAvailableCashStatus(writeReady)'));
  assert.ok(fetchBlock.includes('writeContractResult?.data === true'));
  assert.ok(fetchBlock.includes('validCachedAvailableCashStatus'));
  assert.ok(dbSource.includes('isSet: false'));
  assert.ok(dbSource.includes('isSet: true'));
  assert.ok(dbSource.includes('writeReady: Boolean(writeReady)'));
  assert.ok(dbSource.includes('writeReady: false'));
  assert.ok(fetchBlock.includes('AVAILABLE_CASH_CACHE_KEY'));
  assert.ok(dbSource.includes('value.isSet !== true'), 'an old cached absence must not masquerade as an authoritative zero balance');

  assert.ok(movementBlock.includes(".from('available_cash_movements')"));
  assert.ok(movementBlock.includes(".eq('user_id', user.id)"));
  assert.ok(movementBlock.includes(".order('occurred_at', { ascending: false })"));
  assert.ok(movementBlock.includes('.limit(normalizedLimit + 1)'));
  assert.equal(movementBlock.includes('.insert('), false);
  assert.equal(movementBlock.includes('.update('), false);
  assert.equal(movementBlock.includes('.delete('), false);

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
    assert.ok(mutateBlock.includes(parameter), `cash RPC must send ${parameter}`);
  }
  assert.equal(mutateBlock.includes(".from('available_cash_status')"), false);
  assert.equal(mutateBlock.includes('.upsert('), false);
  assert.ok(mutateBlock.includes('const persistedStatus = mapAvailableCashStatus'));
  const errorIndex = mutateBlock.indexOf('if (error) throw error');
  const cacheIndex = mutateBlock.indexOf('cacheSet(user.id, AVAILABLE_CASH_CACHE_KEY');
  assert.ok(errorIndex >= 0 && cacheIndex > errorIndex, 'the user cache must update only after persistence succeeds');

  const fetchAllStart = dbSource.indexOf('export const fetchAllUserData');
  const fetchAllEnd = dbSource.indexOf('// ============ ACCOUNTS', fetchAllStart);
  const fetchAllBlock = dbSource.slice(fetchAllStart, fetchAllEnd);
  assert.ok(fetchAllBlock.includes('fetchAvailableCashStatus(user)'));
  assert.ok(fetchAllBlock.includes('availableCashStatus: getValue(12)'));
});

test('Home assets consume available cash only after its authority state is ready', () => {
  assert.ok(appSource.includes('const [availableCashStatus, setAvailableCashStatus]'));
  assert.ok(appSource.includes('const [availableCashStatusReady, setAvailableCashStatusReady] = useState(false)'));
  assert.match(
    appSource,
    /if \(cloudAvailableCash !== null && cloudAvailableCash !== undefined\) \{[\s\S]{0,240}?setAvailableCashStatus\(cloudAvailableCash\);[\s\S]{0,160}?setAvailableCashStatusReady\(true\);/,
  );
  assert.match(
    appSource,
    /else \{[\s\S]{0,420}?setAvailableCashStatus\(current => \(\{ \.\.\.current, writeReady: false \}\)\);[\s\S]{0,160}?setAvailableCashStatusReady\(false\);/,
  );
  assert.ok(appSource.includes('cashUsd: availableCashStatusReady ? Number(availableCashStatus?.availableCashUsd) || 0 : 0'));

  const mutateStart = appSource.indexOf('const mutateAvailableCash = useCallback');
  const mutateEnd = appSource.indexOf('// === 持仓冷静室', mutateStart);
  const mutateBlock = appSource.slice(mutateStart, mutateEnd);
  const persistenceIndex = mutateBlock.indexOf('await db.mutateAvailableCash');
  const stateIndex = mutateBlock.indexOf('setAvailableCashStatus(result.status)');
  assert.ok(persistenceIndex >= 0 && stateIndex > persistenceIndex, 'cash must persist before changing visible state');
  assert.ok(mutateBlock.includes('expectedUpdatedAt: availableCashStatus?.isSet'));
  assert.ok(mutateBlock.includes('setAvailableCashStatusReady(true)'));
  assert.ok(mutateBlock.includes('await db.fetchAvailableCashStatus()'), 'a failed/unknown mutation should reconcile from the authoritative status');
  assert.equal(mutateBlock.includes('db.upsertAvailableCashStatus'), false);
  assert.equal(mutateBlock.includes('markPnlReportDirty'), false);
  assert.equal(mutateBlock.includes('recalculatePnlReportAfterLedgerMutation'), false);
  assert.equal(mutateBlock.includes('recalculateCompetitionAfterLedgerMutation'), false);
  assert.ok(mutateBlock.includes('!availableCashStatus?.writeReady'));
  assert.ok(appSource.includes('db.fetchAvailableCashMovements({ limit })'));
});

test('Home adds a compact same-row cash entry without changing its financial ledger boundary', () => {
  const totalAssetsStart = homeSource.indexOf('data-home-total-assets="true"');
  const metricGridStart = homeSource.indexOf('grid-cols-[1fr_1.12fr_0.96fr]', totalAssetsStart);
  const rowBlock = homeSource.slice(totalAssetsStart, metricGridStart);
  assert.ok(totalAssetsStart >= 0 && metricGridStart > totalAssetsStart);
  assert.ok(rowBlock.includes('data-home-available-cash-trigger="true"'));
  assert.ok(rowBlock.includes("t(language, 'home.cash', '现金')"));
  assert.ok(rowBlock.includes('fmtCurrency(displayAvailableCash, displayCurrency, availableCashIsSet ? 2 : 0)'));
  assert.equal(rowBlock.includes("t(language, 'home.availableCashSet', '设置')"), false);
  assert.ok(rowBlock.includes('availableCashIsSet ? 2 : 0'), 'an unset balance should render as a compact currency zero');
  assert.match(
    homeSource,
    /grid-cols-\[1fr_1\.12fr_0\.96fr\][^\n]*data-home-total-assets="true"[\s\S]{0,1200}?data-home-available-cash-trigger="true"/,
    'cash should use the same third-column start as the margin block below',
  );
  assert.ok(rowBlock.includes('col-start-3 flex min-w-0 justify-end') && rowBlock.includes('pl-3'));
  assert.ok(rowBlock.includes('w-max min-w-full max-w-none shrink-0'));
  assert.ok(rowBlock.includes('shrink-0 whitespace-nowrap'));
  assert.equal(rowBlock.includes('max-w-[118px] truncate'), false, 'long Home cash amounts should expand left instead of truncating');
  assert.ok(rowBlock.includes('text-[12px]'), 'the cash amount should match the total-assets amount size');
  assert.ok(homeSource.includes('assetStatusReady = marginStatusReady && availableCashStatusReady'));
  assert.ok(homeSource.includes('availableCashWriteReady = availableCashStatusReady && availableCashStatus?.writeReady === true'));
  assert.ok(homeSource.includes('disabled={!availableCashWriteReady}'));
  assert.ok(tradesSource.includes('assetStatusReady = marginStatusReady && availableCashStatusReady'));
  assert.ok(marginRiskSource.includes('availableCashStatusReady = false'));
  assert.ok(marginRiskSource.includes('assetStatusReady = marginStatusReady && availableCashStatusReady'));
  assert.ok(marginRiskSource.includes('disabled={!assetStatusReady}'));
  assert.ok(marginRiskSource.includes("value: assetStatusReady ? formatCompactMoneyFromUsd(overview.totalAssetsUsd"));
  assert.ok(marginRiskSource.includes("showLeverageGuide && assetStatusReady"));
  assert.ok(marginRiskSource.includes("panel === 'editor' && assetStatusReady"));
  assert.ok(homeSource.includes('<AvailableCashEditor'));
  assert.equal(cashEditorSource.includes('stock_trades'), false);
  assert.equal(cashEditorSource.includes('pnl_report'), false);
  assert.equal(cashEditorSource.includes('community_competition'), false);
});

test('Trades mirrors the Home available-cash display and editor through the shared App state', () => {
  const totalAssetsStart = tradesSource.indexOf('data-trades-total-assets="true"');
  const metricGridStart = tradesSource.indexOf('grid-cols-[1fr_1.12fr_0.96fr] border-t border-white/[0.07] pt-4', totalAssetsStart);
  const rowBlock = tradesSource.slice(totalAssetsStart, metricGridStart);
  assert.ok(totalAssetsStart >= 0 && metricGridStart > totalAssetsStart);
  assert.ok(tradesSource.includes("import AvailableCashEditor from '../components/AvailableCashEditor.jsx'"));
  assert.ok(tradesSource.includes('availableCashStatus,'));
  assert.ok(tradesSource.includes('availableCashStatusReady = false'));
  assert.ok(tradesSource.includes('loadAvailableCashMovements,'));
  assert.ok(tradesSource.includes('mutateAvailableCash,'));
  assert.ok(tradesSource.includes('const [showAvailableCashEditor, setShowAvailableCashEditor] = React.useState(false)'));
  assert.ok(tradesSource.includes('availableCashWriteReady = availableCashStatusReady && availableCashStatus?.writeReady === true'));
  assert.ok(rowBlock.includes('data-trades-available-cash-trigger="true"'));
  assert.ok(rowBlock.includes('disabled={!availableCashWriteReady}'));
  assert.ok(rowBlock.includes("tt('home.cash', '现金')"));
  assert.ok(rowBlock.includes('col-start-3 flex min-w-0 justify-end') && rowBlock.includes('pl-3'));
  assert.ok(rowBlock.includes('w-max min-w-full max-w-none shrink-0'));
  assert.ok(rowBlock.includes('shrink-0 whitespace-nowrap'));
  assert.equal(rowBlock.includes('max-w-[118px] truncate'), false, 'long Trades cash amounts should expand left instead of truncating');
  assert.ok(rowBlock.includes('availableCashIsSet ? 2 : 0'));
  assert.equal(rowBlock.includes("tt('home.availableCashSet', '设置')"), false);
  assert.ok(tradesSource.includes('<AvailableCashEditor'));
  assert.ok(tradesSource.includes('onLoadCashMovements={loadAvailableCashMovements}'));
  assert.ok(tradesSource.includes('onMutateCash={availableCashWriteReady ? mutateAvailableCash : null}'));
  assert.ok(tradesSource.includes('usdRate={rate}'));
  assert.ok(appSource.includes('availableCashStatus,'));
  assert.ok(appSource.includes('loadAvailableCashMovements,'));
  assert.ok(appSource.includes('mutateAvailableCash,'));
  assert.equal(tradesSource.includes('summary.totalAssetsUsd + availableCash'), false, 'Trades must not add cash to the already-complete asset total twice');
  assert.ok(devPreviewSource.includes('availableCashStatus: previewAvailableCashStatus'));
  assert.ok(devPreviewSource.includes('setPreviewAvailableCashStatus(nextStatus)'));
  assert.ok(devPreviewSource.includes('loadAvailableCashMovements: loadPreviewAvailableCashMovements'));
  assert.ok(devPreviewSource.includes('mutateAvailableCash: mutatePreviewAvailableCash'));
});

test('available cash editor keeps currency, RPC-first mutation, explicit zero, retry, and iOS keyboard behavior', () => {
  assert.ok(cashEditorSource.includes("currency !== 'CNY'"));
  assert.ok(cashEditorSource.includes('numericAmount / rate'));
  assert.ok(cashEditorSource.includes("isSet && actionKind === 'balance_adjustment'"), 'an unset balance may be explicitly adjusted to zero');
  assert.ok(cashEditorSource.includes('await onMutateCash({'));
  assert.ok(cashEditorSource.includes('await loadCashMovementRows({ limit })'));
  assert.ok(cashEditorSource.includes('mutationRequestIdRef.current = requestId'));
  assert.ok(cashEditorSource.includes("typeof crypto.randomUUID === 'function'"));
  assert.ok(cashEditorSource.includes("typeof crypto.getRandomValues === 'function'"));
  assert.ok(cashEditorSource.includes("if (!requestId) throw new Error('cash_request_id_unavailable')"));
  assert.match(
    cashEditorSource,
    /actionKind === 'transfer_out'[\s\S]{0,160}?\{ destinationLabel: 'bank_card' \}[\s\S]{0,120}?\{ destinationLabel: '' \}/u,
    'only a transfer out may record a bank-card destination',
  );
  assert.ok(cashEditorSource.includes('inputAmount: allOut && rate ? amountUsd * rate : Number(draftCash)'));
  assert.equal(cashEditorSource.includes('error?.message'), false, 'save failures must use the localized system message');
  assert.ok(cashEditorSource.includes("nextValue === '' || /^\\d*(?:\\.\\d*)?$/.test(nextValue)"));
  assert.ok(cashEditorSource.includes('window.visualViewport'));
  assert.ok(cashEditorSource.includes('max-h-full') && cashEditorSource.includes('overflow-y-auto'));
  assert.ok(cashEditorSource.includes("scrollPaddingBottom: '112px'"));
  assert.ok(cashEditorSource.includes('data-home-available-cash-editor="true"'));
  assert.ok(cashEditorSource.includes('data-cash-mode="transfer_in"'));
  assert.ok(cashEditorSource.includes('data-cash-mode="transfer_out"'));
  assert.ok(cashEditorSource.includes('data-cash-mode="balance_adjustment"'));
  assert.ok(cashEditorSource.includes('data-available-cash-mutate="true"'));
  assert.ok(cashEditorSource.includes('data-home-available-cash-save="true"'));
});

test('available cash UI and report compatibility labels are bilingual', () => {
  for (const key of [
    'home.cash',
    'home.availableCashSet',
    'home.availableCashBalance',
    'home.closeAvailableCash',
    'home.availableCashSubtitle',
    'home.availableCashLabel',
    'home.availableCashSetZero',
    'home.availableCashInvalid',
    'home.availableCashBoundary',
    'home.availableCashSave',
    'home.availableCashSaving',
    'home.availableCashSaveFailed',
    'pnlReport.tooltip.availableCash',
    'pnlReport.tooltip.cashNotIncluded',
    'pnlReport.cashHistoryNotice',
  ]) {
    assert.equal(translationCount(key), 2, `${key} must exist once in each language dictionary`);
  }
  const editorCashKeys = [...new Set(
    [...cashEditorSource.matchAll(/t\(language,\s*['"]([^'"]+)['"]/g)]
      .map(match => match[1])
      .filter(key => key.startsWith('home.cash')),
  )];
  assert.ok(editorCashKeys.length >= 20, 'cash movement UI should expose explicit copy for all three modes and history');
  for (const key of editorCashKeys) {
    assert.equal(translationCount(key), 2, `${key} must exist once in each language dictionary`);
  }
  assert.ok(devPreviewSource.includes("homeAvailableCashPreview === 'unset'"));
  assert.ok(devPreviewSource.includes("homeAvailableCashPreview === 'zero'"));
  assert.ok(devPreviewSource.includes('availableCashStatusReady: true'));
});
