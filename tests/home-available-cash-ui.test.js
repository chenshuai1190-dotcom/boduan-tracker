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

test('available cash loads independently and preserves unset versus explicit zero', () => {
  const fetchStart = dbSource.indexOf('export const fetchAvailableCashStatus');
  const saveStart = dbSource.indexOf('export const upsertAvailableCashStatus');
  const end = dbSource.indexOf('// ============ DISCIPLINES', saveStart);
  assert.ok(fetchStart >= 0 && saveStart > fetchStart && end > saveStart);

  const fetchBlock = dbSource.slice(fetchStart, saveStart);
  const saveBlock = dbSource.slice(saveStart, end);
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

  assert.ok(saveBlock.includes(".from('available_cash_status')"));
  assert.ok(saveBlock.includes('available_cash_usd: availableCashUsd'));
  assert.ok(saveBlock.includes('logic_version: AVAILABLE_CASH_LOGIC_VERSION'));
  assert.ok(saveBlock.includes("{ onConflict: 'user_id' }"));
  assert.ok(saveBlock.includes(".select('available_cash_usd,logic_version,updated_at')"));
  assert.ok(saveBlock.includes('const persistedStatus = mapAvailableCashStatus(data, { writeReady: true })'));
  assert.equal(saveBlock.includes('.delete('), false);
  const errorIndex = saveBlock.indexOf('if (error) throw error');
  const cacheIndex = saveBlock.indexOf('cacheSet(user.id, AVAILABLE_CASH_CACHE_KEY');
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

  const saveStart = appSource.indexOf('const saveAvailableCash = useCallback');
  const saveEnd = appSource.indexOf('// === 持仓冷静室', saveStart);
  const saveBlock = appSource.slice(saveStart, saveEnd);
  const persistenceIndex = saveBlock.indexOf('await db.upsertAvailableCashStatus');
  const stateIndex = saveBlock.indexOf('setAvailableCashStatus(persistedStatus)');
  assert.ok(persistenceIndex >= 0 && stateIndex > persistenceIndex, 'cash must persist before changing visible state');
  assert.ok(saveBlock.includes('setAvailableCashStatusReady(true)'));
  assert.equal(saveBlock.includes('markPnlReportDirty'), false);
  assert.equal(saveBlock.includes('recalculatePnlReportAfterLedgerMutation'), false);
  assert.equal(saveBlock.includes('recalculateCompetitionAfterLedgerMutation'), false);
  assert.ok(saveBlock.includes('!availableCashStatus?.writeReady'));
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
    /grid-cols-\[1fr_1\.12fr_0\.96fr\][^\n]*data-home-total-assets="true"[\s\S]{0,900}?data-home-available-cash-trigger="true"/,
    'cash should use the same third-column start as the margin block below',
  );
  assert.ok(rowBlock.includes('col-start-3') && rowBlock.includes('pl-3'));
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

test('available cash editor keeps currency, persist-first, zero, failure, and iOS keyboard behavior', () => {
  assert.ok(cashEditorSource.includes("currency !== 'CNY'"));
  assert.ok(cashEditorSource.includes('numericAmount / rate'));
  assert.ok(cashEditorSource.includes("setDraftCash('0')"));
  assert.ok(cashEditorSource.includes('await onSave(nextCashUsd)'));
  assert.equal(cashEditorSource.includes('error?.message'), false, 'save failures must use the localized system message');
  assert.ok(cashEditorSource.includes("nextValue === '' || /^\\d*(?:\\.\\d*)?$/.test(nextValue)"));
  assert.ok(cashEditorSource.includes('window.visualViewport'));
  assert.ok(cashEditorSource.includes('max-h-full') && cashEditorSource.includes('overflow-y-auto'));
  assert.ok(cashEditorSource.includes("scrollPaddingBottom: '96px'"));
  assert.ok(cashEditorSource.includes('data-home-available-cash-editor="true"'));
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
  assert.ok(devPreviewSource.includes("homeAvailableCashPreview === 'unset'"));
  assert.ok(devPreviewSource.includes("homeAvailableCashPreview === 'zero'"));
  assert.ok(devPreviewSource.includes('availableCashStatusReady: true'));
});
