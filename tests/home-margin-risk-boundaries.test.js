import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const appSource = source('../src/App.jsx');
const devPreviewSource = source('../src/DevVisualPreview.jsx');
const dbSource = source('../src/lib/db.js');
const homeTabSource = source('../src/tabs/HomeTab.jsx');
const tradesTabSource = source('../src/tabs/TradesTab.jsx');
const marginPageSource = source('../src/pages/HomeMarginRiskPage.jsx');
const accountLeverageBadgeSource = source('../src/components/AccountLeverageBadge.jsx');
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
];

function countTranslationKey(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (i18nSource.match(new RegExp(`['"]${escaped}['"]\\s*:`, 'g')) || []).length;
}

test('Home financing UI exposes a stable standalone page without replacing the card shell', () => {
  const combined = `${homeTabSource}\n${marginPageSource}`;
  for (const marker of [
    'data-home-net-assets-card="true"',
    'data-home-margin-trigger="true"',
    'data-home-margin-risk-page="true"',
    'data-home-margin-scenario-slider="true"',
    'data-home-margin-leverage-info-trigger="true"',
    'data-home-margin-leverage-info-sheet="true"',
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
  assert.ok(cardBlock.includes('<AccountLeverageBadge'));
  assert.equal(cardBlock.includes('data-home-margin-leverage-info-trigger'), false, 'Home should not expose the leverage guide');
  assert.equal(cardBlock.includes("t(language, 'home.positions'"), false, 'only the Home header third metric should stop showing position count');
  assert.ok(homeTabSource.includes('rounded-2xl border border-white/10 bg-[#0b0f14] p-4'), 'the existing Home header shell must stay intact');
});

test('Home margin risk uses a standalone page while keeping the bottom navigation', () => {
  assert.ok(appSource.includes("lazy(() => import('./pages/HomeMarginRiskPage.jsx'))"));
  assert.ok(appSource.includes("setActivePage('home-margin-risk')"), 'Home must open the margin experience through page-level navigation');
  assert.ok(appSource.includes("activePage === 'home-margin-risk'"));
  assert.ok(appSource.includes('<HomeMarginRiskPage ctx={tabCtx} />'));
  assert.ok(appSource.includes('isStandalonePage = isPnlReportPage || isHomeMarginRiskPage'), 'the page must receive the standalone safe-area shell');
  assert.ok(appSource.includes('hideBottomNavigation = isPnlReportPage;'), 'only the P&L report should hide the bottom tabs');
  assert.equal(appSource.includes('hideBottomNavigation = isPnlReportPage || isHomeMarginRiskPage'), false, 'the margin page must keep the bottom navigation');
  assert.ok(appSource.includes("hideBottomNavigation ? 'pb-0' : 'pb-24'"));
  assert.ok(appSource.includes('{!hideBottomNavigation && ('), 'the hidden-tab rule must drive the real bottom navigation');
  assert.ok(devPreviewSource.includes("activeTab === 'home-margin-risk' && tab.id === 'home'"), 'the local preview should highlight Home while the margin page is open');
  assert.ok(homeTabSource.includes('openHomeMarginRisk,'));
  assert.ok(homeTabSource.includes('onClick={openHomeMarginRisk}'));
  assert.equal(homeTabSource.includes('showMarginRisk'), false, 'Home must not keep a local modal state for an independent page');
  assert.equal(homeTabSource.includes('HomeMarginRiskSheet'), false, 'Home must not mount the retired risk sheet');

  assert.ok(marginPageSource.includes('<main'));
  assert.ok(marginPageSource.includes('data-home-margin-risk-page="true"'));
  assert.ok(marginPageSource.includes('sticky top-0'));
  assert.ok(marginPageSource.includes('<ArrowLeft'));
  assert.ok(marginPageSource.includes('data-home-margin-leverage-info-trigger="true"'));
  assert.ok(marginPageSource.includes('data-home-margin-leverage-info-sheet="true"'));
  assert.ok(marginPageSource.includes("useState(homeMarginPreview === 'leverage')"), 'DEV preview should be able to open the leverage guide for Simulator evidence');
  assert.equal(marginPageSource.includes('<ChevronRight'), false, 'the leverage area should remain clickable without a separate explanation icon');
  assert.ok(marginPageSource.includes('bg-[#0d131b]'), 'the leverage guide should keep an opaque dark sheet background');
  assert.ok(marginPageSource.includes("backgroundImage: 'radial-gradient("), 'the leverage guide accent gradient should remain a valid background image');
  assert.equal(marginPageSource.includes('bg-[radial-gradient(circle_at_76%_-12%'), false, 'the sheet must not encode a background color inside an invalid Tailwind image utility');
  assert.ok(marginPageSource.includes("paddingBottom: 'max(8px, env(safe-area-inset-bottom))'"), 'the leverage guide should clear the iOS home indicator');
  assert.ok(marginPageSource.includes('aria-haspopup="dialog"'));
  assert.equal(homeTabSource.includes('data-home-margin-leverage-info-trigger'), false, 'the leverage guide trigger belongs only to the standalone page');
  assert.ok(marginPageSource.includes("pb-[calc(env(safe-area-inset-bottom)+28px)]"));
  assert.equal(marginPageSource.includes('data-home-margin-risk-sheet'), false, 'the main scenario surface must no longer present itself as a sheet');
});

test('the standalone margin page stays isolated from reports, competitions, and formal trades', () => {
  for (const forbidden of [
    'stock_trades',
    'pnl_report_snapshots',
    'community_competition',
    'markPnlReportDirty',
    'deleteStockTrade',
    'insertStockTrade',
  ]) {
    assert.equal(marginPageSource.includes(forbidden), false, `standalone margin page must not consume ${forbidden}`);
  }
});

test('Home margin labels are present in both Chinese and English dictionaries', () => {
  for (const key of [
    'home.netAssets',
    'home.totalAssets',
    'home.marginDebt',
    'home.leverage',
    'home.leverageInfoTitle',
    'home.leverageInfoSubtitle',
    'home.leverageInfoOpen',
    'home.currentLeverage',
    'home.marginShare',
    'home.leverageRange',
    'home.leverageState',
    'home.leverageDescription',
    'home.leverageTier.none',
    'home.leverageTier.low',
    'home.leverageTier.moderate',
    'home.leverageTier.elevated',
    'home.leverageTier.high',
    'home.leverageTier.critical',
    'home.leverageTier.insufficient',
    'home.leverageTier.noneDesc',
    'home.leverageTier.lowDesc',
    'home.leverageTier.moderateDesc',
    'home.leverageTier.elevatedDesc',
    'home.leverageTier.highDesc',
    'home.leverageTier.criticalDesc',
    'home.leverageFormula',
    'home.leverageFormulaValue',
    'home.marginShareFormula',
    'home.marginShareFormulaValue',
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

  assert.ok(i18nSource.includes("'home.leverage': '账户杠杆'"));
  assert.ok(i18nSource.includes("'home.leverage': 'Account Leverage'"));
  assert.ok(accountLeverageBadgeSource.includes("'home.leverageTier.moderate'"));

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
    assert.ok(marginPageSource.includes(`'${key}'`), `the production page must use ${key}`);
  }
});

test('margin scenario keeps six signed presets on one row and uses a symmetric bounded slider', () => {
  assert.match(
    marginPageSource,
    /const\s+SCENARIO_PRESETS\s*=\s*\[\s*-40\s*,\s*-20\s*,\s*-10\s*,\s*10\s*,\s*20\s*,\s*40\s*,?\s*\]/,
    'the approved negative and positive presets must stay fixed and ordered',
  );
  assert.ok(marginPageSource.includes('grid-cols-6'), 'all six scenario presets must remain on one row');
  assert.match(marginPageSource, /initialScenarioPct\s*=\s*Number\.isFinite/, 'a newly opened scenario page must normalize its optional preview scenario');
  assert.ok(marginPageSource.includes(" : 0;"), 'a newly opened scenario page must default to zero');
  assert.ok(marginPageSource.includes('data-home-margin-scenario-slider="true"'), 'the custom scenario slider needs a stable visual-test marker');
  assert.ok(marginPageSource.includes('role="spinbutton"'), 'the custom control must expose spinbutton semantics');
  assert.match(marginPageSource, /aria-valuemin=\{-100\}/, 'the scenario lower bound must be minus 100 percent');
  assert.match(marginPageSource, /aria-valuemax=\{100\}/, 'the scenario upper bound must be plus 100 percent');
  assert.ok(marginPageSource.includes('left: `${thumbPercent}%`'), 'the thumb must retain a visible position that follows the current scenario');
  assert.ok(marginPageSource.includes('marginScenarioToTrackRatio(session.currentValue)'), 'pointer travel must advance from the last bounded scenario without edge lag');
  assert.ok(marginPageSource.includes('session.lastX = event.clientX'), 'dragging must use incremental pointer travel so reversing at minus 100 responds immediately');

  for (const handler of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel']) {
    assert.ok(marginPageSource.includes(handler), `the relative slider must implement ${handler}`);
  }
  assert.ok(marginPageSource.includes('clientX'), 'scenario changes must derive from relative horizontal pointer travel');
  assert.ok(marginPageSource.includes('setPointerCapture'), 'horizontal dragging must retain the active pointer');
  assert.ok(marginPageSource.includes('releasePointerCapture'), 'pointer capture must be released when dragging finishes');
  assert.match(marginPageSource, /touchAction:\s*['"]pan-y['"]/, 'vertical page gestures must stay available on the slider');
  assert.ok(marginPageSource.includes('onKeyDown'), 'the custom slider must remain keyboard operable');
  assert.ok(marginPageSource.includes("'ArrowLeft'") && marginPageSource.includes("'ArrowRight'"), 'arrow keys must adjust the scenario');

  assert.equal(marginPageSource.includes('type="range"'), false, 'the bounded native range control must not return');
  assert.equal(marginPageSource.includes('max="50"'), false, 'the old positive 50 percent ceiling must not return');
  assert.equal(marginPageSource.includes('marketTextClass(-1'), false, 'scenario colors must not stay fixed to a decline');
  assert.equal(marginPageSource.includes('marketHexColor(-1'), false, 'scenario accents must follow the signed result');
  assert.match(marginPageSource, /marketTextClass\([^)]*(?:scenario|assetChange)/, 'text color must consume a signed scenario value');
  assert.match(marginPageSource, /marketHexColor\([^)]*(?:scenario|assetChange)/, 'accent color must consume a signed scenario value');
});

test('margin balance save persists before updating UI state and refreshes the user-scoped fallback cache', () => {
  const uiSources = `${homeTabSource}\n${marginPageSource}`;
  assert.match(appSource, /await\s+db\.upsertMarginStatus\([\s\S]{0,1600}?setMarginStatus\(/);
  assert.ok(appSource.includes('marginLimit: 0'), 'the retired margin-limit field must stay cleared under the new model');
  assert.ok(appSource.includes('saveMarginDebt,'), 'Home must receive the isolated margin save callback');
  assert.ok(marginPageSource.includes('await onSaveDebtUsd(nextDebtUsd)'), 'the editor must wait for the owner callback before closing');
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
  assert.ok(marginPageSource.includes('window.visualViewport'), 'the editor must follow the real iOS visual viewport when the keyboard opens');
  assert.ok(marginPageSource.includes('max-h-full') && marginPageSource.includes('overflow-y-auto'), 'the editor must stay scrollable inside the keyboard-reduced viewport');
  assert.ok(marginPageSource.includes("scrollPaddingBottom: '96px'"), 'the editor must reserve scroll room for its save actions');
  assert.equal(marginPageSource.includes("replace(/[^0-9.]/g, '')"), false, 'a pasted negative balance must not be silently converted into a positive amount');
  assert.ok(marginPageSource.includes("nextValue === '' || /^\\d*(?:\\.\\d*)?$/.test(nextValue)"), 'the editor must accept only complete non-negative decimal input');
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

test('personal financing stays out of calculations, reports, and competition while Trades mirrors the read-only Home header', () => {
  const forbidden = /\b(?:marginStatus|currentMargin|margin_status)\b/;
  for (const [name, fileSource] of isolatedSources) {
    assert.equal(forbidden.test(fileSource), false, `${name} must not consume personal financing state`);
  }

  assert.ok(tradesTabSource.includes('marginStatus,'), 'Trades may read the private margin status for the mirrored header');
  assert.ok(tradesTabSource.includes('deriveHomeMarginOverview({'));
  assert.ok(tradesTabSource.includes('data-trades-net-assets-card="true"'));
  assert.ok(tradesTabSource.includes('data-trades-margin-trigger="true"'));
  assert.ok(tradesTabSource.includes("tt('home.netAssets', '净资产')"));
  assert.ok(tradesTabSource.includes("tt('trades.totalAssets', '总资产')"));
  assert.ok(tradesTabSource.includes("tt('home.marginDebt', '融资负债')"));
  assert.ok(tradesTabSource.includes("tt('home.leverage', '账户杠杆')"));
  for (const forbiddenWrite of ['saveMarginDebt', 'setMarginStatus', 'upsertMarginStatus', 'margin_status']) {
    assert.equal(tradesTabSource.includes(forbiddenWrite), false, `Trades must not write through ${forbiddenWrite}`);
  }
});
