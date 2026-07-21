import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const appSource = source('../src/App.jsx');
const dbSource = source('../src/lib/db.js');
const homeTabSource = source('../src/tabs/HomeTab.jsx');
const marginSheetSource = source('../src/components/HomeMarginRiskSheet.jsx');
const i18nSource = source('../src/lib/i18n.js');
const rlsSource = source('../supabase/rls.sql');
const rlsProbeSource = source('../scripts/verify-rls-rest.mjs');

const isolatedSources = [
  ['investment summary', source('../src/lib/investmentSummary.js')],
  ['P&L report page', source('../src/pages/PnlReportPage.jsx')],
  ['P&L snapshot model', source('../src/lib/pnlReportSnapshots.js')],
  ['P&L view model', source('../src/lib/pnlReportViewModel.js')],
  ['P&L snapshot server', source('../server/pnlReportDailySnapshot.js')],
  ['competition page', source('../src/pages/CommunityCompetitionPage.jsx')],
  ['competition client', source('../src/lib/communityCompetitionApi.js')],
  ['competition server', source('../server/communityCompetition.js')],
  ['competition daily snapshot server', source('../server/communityCompetitionDailySnapshot.js')],
  ['competition snapshot model', source('../server/communityCompetitionSnapshotModel.js')],
  ['Trades tab', source('../src/tabs/TradesTab.jsx')],
];

function countTranslationKey(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (i18nSource.match(new RegExp(`['"]${escaped}['"]\\s*:`, 'g')) || []).length;
}

test('Home financing UI exposes stable semantic markers without replacing the card shell', () => {
  const combined = `${homeTabSource}\n${marginSheetSource}`;
  for (const marker of [
    'data-home-net-assets-card="true"',
    'data-home-margin-trigger="true"',
    'data-home-margin-risk-sheet="true"',
    'data-home-margin-scenario-slider="true"',
    'data-home-margin-balance-editor="true"',
    'data-home-margin-save="true"',
  ]) {
    assert.ok(combined.includes(marker), `missing stable Home margin marker: ${marker}`);
  }

  const cardStart = homeTabSource.indexOf('data-home-net-assets-card="true"');
  const nextSection = homeTabSource.indexOf('<section', cardStart + 1);
  assert.ok(cardStart >= 0 && nextSection > cardStart, 'net-assets card must remain a bounded Home section');
  const cardBlock = homeTabSource.slice(cardStart, nextSection);
  assert.ok(cardBlock.includes("t(language, 'home.netAssets'"));
  assert.ok(cardBlock.includes("t(language, 'home.totalAssets'"));
  assert.ok(cardBlock.includes("t(language, 'home.marginDebt'"));
  assert.ok(cardBlock.includes("t(language, 'home.leverage'"));
  assert.equal(cardBlock.includes("t(language, 'home.positions'"), false, 'only the Home header third metric should stop showing position count');
  assert.ok(homeTabSource.includes('rounded-2xl border border-white/10 bg-[#0b0f14] p-4'), 'the existing Home header shell must stay intact');
});

test('Home margin labels are present in both Chinese and English dictionaries', () => {
  for (const key of [
    'home.netAssets',
    'home.totalAssets',
    'home.marginDebt',
    'home.leverage',
    'home.marginRisk',
    'home.setMarginBalance',
    'home.stockPortfolioMove',
    'home.marginIncrease',
    'home.marginDecrease',
    'home.marginUnchanged',
    'home.marginDownsideFloor',
    'home.marginScenarioReset',
    'home.marginUpsideCeiling',
    'home.marginBalance',
  ]) {
    assert.equal(countTranslationKey(key), 2, `${key} must exist once in each language dictionary`);
  }

  for (const key of [
    'home.marginRisk',
    'home.setMarginBalance',
    'home.stockPortfolioMove',
    'home.marginIncrease',
    'home.marginDecrease',
    'home.marginUnchanged',
    'home.marginDownsideFloor',
    'home.marginScenarioReset',
    'home.marginUpsideCeiling',
    'home.marginBalance',
  ]) {
    assert.ok(marginSheetSource.includes(`'${key}'`), `the production sheet must use ${key}`);
  }
});

test('margin scenario keeps six signed presets on one row and uses a symmetric bounded slider', () => {
  assert.match(
    marginSheetSource,
    /const\s+SCENARIO_PRESETS\s*=\s*\[\s*-40\s*,\s*-20\s*,\s*-10\s*,\s*10\s*,\s*20\s*,\s*40\s*,?\s*\]/,
    'the approved negative and positive presets must stay fixed and ordered',
  );
  assert.ok(marginSheetSource.includes('grid-cols-6'), 'all six scenario presets must remain on one row');
  assert.match(marginSheetSource, /initialScenarioPct\s*=\s*0/, 'a newly opened scenario sheet must default to zero');
  assert.ok(marginSheetSource.includes('data-home-margin-scenario-slider="true"'), 'the custom scenario slider needs a stable visual-test marker');
  assert.ok(marginSheetSource.includes('role="spinbutton"'), 'the custom control must expose spinbutton semantics');
  assert.match(marginSheetSource, /aria-valuemin=\{-100\}/, 'the scenario lower bound must be minus 100 percent');
  assert.match(marginSheetSource, /aria-valuemax=\{100\}/, 'the scenario upper bound must be plus 100 percent');
  assert.ok(marginSheetSource.includes('left: `${thumbPercent}%`'), 'the thumb must retain a visible position that follows the current scenario');
  assert.ok(marginSheetSource.includes('marginScenarioToTrackRatio(session.currentValue)'), 'pointer travel must advance from the last bounded scenario without edge lag');
  assert.ok(marginSheetSource.includes('session.lastX = event.clientX'), 'dragging must use incremental pointer travel so reversing at minus 100 responds immediately');

  for (const handler of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel']) {
    assert.ok(marginSheetSource.includes(handler), `the relative slider must implement ${handler}`);
  }
  assert.ok(marginSheetSource.includes('clientX'), 'scenario changes must derive from relative horizontal pointer travel');
  assert.ok(marginSheetSource.includes('setPointerCapture'), 'horizontal dragging must retain the active pointer');
  assert.ok(marginSheetSource.includes('releasePointerCapture'), 'pointer capture must be released when dragging finishes');
  assert.match(marginSheetSource, /touchAction:\s*['"]pan-y['"]/, 'vertical page gestures must stay available on the slider');
  assert.ok(marginSheetSource.includes('onKeyDown'), 'the custom slider must remain keyboard operable');
  assert.ok(marginSheetSource.includes("'ArrowLeft'") && marginSheetSource.includes("'ArrowRight'"), 'arrow keys must adjust the scenario');

  assert.equal(marginSheetSource.includes('type="range"'), false, 'the bounded native range control must not return');
  assert.equal(marginSheetSource.includes('max="50"'), false, 'the old positive 50 percent ceiling must not return');
  assert.equal(marginSheetSource.includes('marketTextClass(-1'), false, 'scenario colors must not stay fixed to a decline');
  assert.equal(marginSheetSource.includes('marketHexColor(-1'), false, 'scenario accents must follow the signed result');
  assert.match(marginSheetSource, /marketTextClass\([^)]*(?:scenario|assetChange)/, 'text color must consume a signed scenario value');
  assert.match(marginSheetSource, /marketHexColor\([^)]*(?:scenario|assetChange)/, 'accent color must consume a signed scenario value');
});

test('margin balance save persists before updating UI state and refreshes the user-scoped fallback cache', () => {
  const uiSources = `${homeTabSource}\n${marginSheetSource}`;
  assert.match(appSource, /await\s+db\.upsertMarginStatus\([\s\S]{0,1600}?setMarginStatus\(/);
  assert.ok(appSource.includes('marginLimit: 0'), 'the retired margin-limit field must stay cleared under the new model');
  assert.ok(appSource.includes('saveMarginDebt,'), 'Home must receive the isolated margin save callback');
  assert.ok(marginSheetSource.includes('await onSaveDebtUsd(nextDebtUsd)'), 'the editor must wait for the owner callback before closing');
  assert.equal(uiSources.includes('markPnlReportDirty'), false, 'personal financing must not dirty the P&L report');

  const saveStart = dbSource.indexOf('export const upsertMarginStatus');
  const saveEnd = dbSource.indexOf('// ============ DISCIPLINES', saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart, 'margin persistence must remain an isolated db function');
  const saveBlock = dbSource.slice(saveStart, saveEnd);
  assert.ok(saveBlock.includes(".from('margin_status')"));
  assert.ok(saveBlock.includes('user_id: user.id'));
  assert.match(saveBlock, /current_margin:\s*[A-Za-z_$][\w$]*\.currentMargin/);
  assert.match(saveBlock, /margin_limit:\s*0/);
  assert.ok(saveBlock.includes('logicVersion: HOME_MARGIN_LOGIC_VERSION'), 'the fallback cache must identify new-model values');
  assert.ok(saveBlock.includes("{ onConflict: 'user_id' }"));
  const errorGuardIndex = saveBlock.search(/if\s*\(error\)\s*throw error/);
  const cacheWriteIndex = saveBlock.search(/cacheSet\(user\.id,\s*'margin_status',/);
  assert.ok(errorGuardIndex >= 0 && cacheWriteIndex > errorGuardIndex, 'cache must update only after the cloud write succeeds');

  assert.ok(appSource.includes('marginStatus,'));
  assert.ok(appSource.includes('setMarginStatus,'));
});

test('margin loading clears only legacy current-user rows and rejects legacy cache fallback', () => {
  const fetchStart = dbSource.indexOf('export const fetchMarginStatus');
  const fetchEnd = dbSource.indexOf('export const upsertMarginStatus', fetchStart);
  assert.ok(fetchStart >= 0 && fetchEnd > fetchStart, 'margin loading must remain an isolated db function');
  const fetchBlock = dbSource.slice(fetchStart, fetchEnd);

  assert.ok(fetchBlock.includes('emptyHomeMarginStatus()'), 'a successful query with no row must resolve to a loaded zero balance');
  assert.ok(fetchBlock.includes('isLegacyHomeMarginStatus(data)'), 'legacy detection must use the fixed new-model epoch');
  assert.ok(fetchBlock.includes('await resetLegacyHomeMarginStatus(user, data)'), 'a legacy row must be cleared before it reaches Home');

  const errorStart = fetchBlock.indexOf('if (error)');
  const statusStart = fetchBlock.indexOf('const status =', errorStart);
  assert.ok(errorStart >= 0 && statusStart > errorStart, 'the fetch error branch must finish before successful-row mapping');
  const errorBlock = fetchBlock.slice(errorStart, statusStart);
  const cacheReadIndex = errorBlock.search(/cacheGet\(user\.id,\s*'margin_status'\)/);
  const cacheVersionIndex = errorBlock.indexOf('cachedStatus?.logicVersion === HOME_MARGIN_LOGIC_VERSION');
  const cacheReturnIndex = errorBlock.indexOf('return cachedStatus', cacheVersionIndex);
  const throwIndex = errorBlock.indexOf('throw error');
  assert.ok(cacheReadIndex >= 0, 'a failed request should consult the current user cache');
  assert.ok(cacheVersionIndex > cacheReadIndex, 'an unversioned legacy cache must not be accepted');
  assert.ok(cacheReturnIndex > cacheVersionIndex, 'only a current-version user cache may be returned');
  assert.ok(throwIndex > cacheReturnIndex, 'a failed request without a current-version cache must remain failed');
  assert.match(fetchBlock, /cacheSet\(user\.id,\s*'margin_status',\s*status\)[\s\S]*return status/);

  const resetStart = dbSource.indexOf('const resetLegacyHomeMarginStatus');
  assert.ok(resetStart >= 0 && resetStart < fetchStart, 'the legacy reset must be an isolated helper');
  const resetBlock = dbSource.slice(resetStart, fetchStart);
  assert.ok(resetBlock.includes(".from('margin_status')"));
  assert.ok(resetBlock.includes(".eq('user_id', user.id)"), 'legacy clearing must target only the authenticated user');
  assert.ok(
    resetBlock.includes("resetQuery.eq('updated_at', legacyRow.updated_at)")
      && resetBlock.includes("resetQuery.is('updated_at', null)"),
    'legacy clearing must compare the exact row version it originally read',
  );
  assert.ok(resetBlock.includes("current_margin: 0") && resetBlock.includes("margin_limit: 0"));
  assert.ok(resetBlock.includes(".select('*')") && resetBlock.includes('.maybeSingle()'), 'the reset must detect a zero-row concurrency conflict');
  assert.ok(resetBlock.includes('if (!isLegacyHomeMarginStatus(latestRow)) return mapHomeMarginStatus(latestRow)'), 'a concurrent new-model save must win over legacy clearing');
  assert.ok(resetBlock.includes('retryCount >= 1'), 'legacy clearing must use a bounded retry');
  assert.equal(resetBlock.includes('.delete('), false, 'legacy clearing must retain the existing row and table');

  const guardedReady = /if\s*\(cloudMargin\s*!==\s*null\s*&&\s*cloudMargin\s*!==\s*undefined\)\s*\{[\s\S]{0,400}?setMarginStatus\(cloudMargin\);[\s\S]{0,200}?setMarginStatusReady\(true\);[\s\S]{0,100}?\}/;
  assert.match(appSource, guardedReady, 'only a resolved margin result may unlock the editor');
  assert.equal(
    (appSource.match(/setMarginStatusReady\(true\)/g) || []).length,
    1,
    'margin readiness must not also be set unconditionally after a failed load',
  );
});

test('margin editor keeps iOS keyboard actions reachable and rejects signed input without changing its meaning', () => {
  assert.ok(marginSheetSource.includes('window.visualViewport'), 'the editor must follow the real iOS visual viewport when the keyboard opens');
  assert.ok(marginSheetSource.includes('max-h-full') && marginSheetSource.includes('overflow-y-auto'), 'the editor must stay scrollable inside the keyboard-reduced viewport');
  assert.ok(marginSheetSource.includes("scrollPaddingBottom: '96px'"), 'the editor must reserve scroll room for its save actions');
  assert.equal(marginSheetSource.includes("replace(/[^0-9.]/g, '')"), false, 'a pasted negative balance must not be silently converted into a positive amount');
  assert.ok(marginSheetSource.includes("nextValue === '' || /^\\d*(?:\\.\\d*)?$/.test(nextValue)"), 'the editor must accept only complete non-negative decimal input');
});

test('margin status remains private to the authenticated user', () => {
  assert.ok(rlsSource.includes('alter table public.margin_status enable row level security'));
  const policyStart = rlsSource.indexOf('create policy "users can manage own margin status"');
  const policyEnd = rlsSource.indexOf('drop policy if exists "users can manage own disciplines"', policyStart);
  assert.ok(policyStart >= 0 && policyEnd > policyStart, 'margin policy must stay distinct from adjacent user tables');
  const policyBlock = rlsSource.slice(policyStart, policyEnd);
  assert.ok(policyBlock.includes('auth.uid() = user_id'));
  assert.match(rlsProbeSource, /['"]margin_status['"]/);
});

test('personal financing stays out of investment summary, reports, competition, and Trades', () => {
  const forbidden = /\b(?:marginStatus|currentMargin|margin_status)\b/;
  for (const [name, fileSource] of isolatedSources) {
    assert.equal(forbidden.test(fileSource), false, `${name} must not consume personal financing state`);
  }

  const tradesSource = isolatedSources.find(([name]) => name === 'Trades tab')[1];
  assert.ok(tradesSource.includes("tt('trades.totalAssets', '总资产')"));
  assert.ok(tradesSource.includes("tt('trades.positions', '持仓数量')"));
});
