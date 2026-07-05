import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const authGateSource = readFileSync(new URL('../src/AuthGate.jsx', import.meta.url), 'utf8');
const analysisTabSource = readFileSync(new URL('../src/tabs/AnalysisTab.jsx', import.meta.url), 'utf8');
const devVisualPreviewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const homeTabSource = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
const settingsTabSource = readFileSync(new URL('../src/tabs/SettingsTab.jsx', import.meta.url), 'utf8');
const tradesTabSource = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');
const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');

test('wave record entry writes legacy trades before main ledger stock_trades', () => {
  const waveBranch = appSource.indexOf("tradeEntryScope === 'wave'");
  const waveInsert = appSource.indexOf('await db.insertTrade', waveBranch);
  const ledgerInsert = appSource.indexOf('await db.insertStockTrade', waveBranch);

  assert.ok(waveBranch > -1, 'missing explicit wave entry scope branch');
  assert.ok(waveInsert > waveBranch, 'wave branch must insert into legacy trades');
  assert.ok(ledgerInsert > waveInsert, 'main stock_trades insert must stay outside the wave branch');
  assert.ok(tradesTabSource.includes("setTradeEntryScope('wave')"), 'wave quick-add must open the modal in wave scope');
  assert.ok(tradesTabSource.includes("setTradeEntryScope('ledger')"), 'main ledger entries must open the modal in ledger scope');
});

test('tool submissions require confirmation and duplicate-submit guards', () => {
  assert.ok(appSource.includes('confirmSubmittingRef'), 'global confirmation modal needs a submit guard');
  assert.ok(appSource.includes('costBasisSubmittingRef'), 'cost-basis submissions need a submit guard');
  assert.ok(appSource.includes('tradeSubmittingRef'), 'trade submissions need a submit guard');
  assert.ok(tradesTabSource.includes('确认保存到波段记录?'), 'wave submissions must show a confirmation dialog');
  assert.ok(appSource.includes('确认保存摊薄成本记录?'), 'cost-basis submissions must show a confirmation dialog');
  assert.ok(appSource.includes('不会进入正式持仓、当日订单或波段记录'), 'cost-basis confirmation must state its ledger boundary');
  assert.ok(tradesTabSource.includes('不会进入正式持仓、当日订单或总资产计算'), 'wave confirmation must state its ledger boundary');
});

test('trade and wave form validation avoids native alert dialogs', () => {
  const addTradeStart = appSource.indexOf('const addTrade = async () =>');
  const nextToolStart = appSource.indexOf('const confirmCostBasisTradeSubmit =', addTradeStart);
  const addTradeBlock = appSource.slice(addTradeStart, nextToolStart);

  assert.ok(addTradeStart > -1, 'missing addTrade implementation');
  assert.ok(nextToolStart > addTradeStart, 'missing boundary after addTrade implementation');
  assert.equal(addTradeBlock.includes('alert('), false, 'trade/wave submit path must not use native alert');
  assert.ok(appSource.includes('showCancel: opts.showCancel !== false'), 'custom notice modal must support hiding cancel button');
  assert.ok(tradesTabSource.includes('showTradeFormNotice'), 'trade tab must intercept invalid form state before submit');
});

test('cost basis tool uses dark custom UI without legacy title icon or native alerts', () => {
  const costSubmitStart = appSource.indexOf('const confirmCostBasisTradeSubmit =');
  const costSubmitEnd = appSource.indexOf('const deleteStockTradeRecord =', costSubmitStart);
  const costSubmitBlock = appSource.slice(costSubmitStart, costSubmitEnd);

  assert.ok(costSubmitStart > -1, 'missing cost-basis submit implementation');
  assert.ok(costSubmitEnd > costSubmitStart, 'missing boundary after cost-basis submit implementation');
  assert.equal(costSubmitBlock.includes('alert('), false, 'cost-basis submit path must not use native alert');
  assert.ok(tradesTabSource.includes('bg-[#0b0f14]'), 'cost-basis tool should use the dark card surface');
  assert.ok(tradesTabSource.includes('Database'), 'cost-basis stats should use the existing line icon system');
  assert.ok(tradesTabSource.includes('TrendingUp'), 'cost-basis realized PnL should use the existing line icon system');
  assert.equal(tradesTabSource.includes('💼 摊薄成本'), false, 'cost-basis title must not keep the legacy briefcase icon');
  assert.equal(tradesTabSource.includes('aria-label="新增摊薄股票"'), false, 'cost-basis stock tabs must not keep a redundant trailing plus button');
  assert.ok(tradesTabSource.includes('pnlClass(stats.realizedPnl, marketColorMode)'), 'cost-basis realized PnL should use the same color class as the header cards');
  assert.ok(tradesTabSource.includes('pnlClass(profit, marketColorMode)'), 'cost-basis expanded profit should use the same color class as the header cards');
  assert.ok(appSource.includes('新增摊薄股票'), 'cost-basis add stock modal should be custom in-app UI');
  assert.ok(appSource.includes('添加摊薄交易'), 'cost-basis add trade modal should be custom in-app UI');
  assert.ok(appSource.includes('flex items-center justify-center bg-black/70 px-4'), 'cost-basis modals must stay centered on mobile');
  assert.equal(appSource.includes('items-end justify-center bg-black/70'), false, 'cost-basis modals must not use bottom-drawer layout');
  assert.equal(appSource.includes('text-white/42'), false, 'cost-basis modals must not use unsupported opacity classes');
  assert.equal(appSource.includes('text-white/72'), false, 'cost-basis cancel buttons must use visible supported text colors');
  assert.ok(appSource.includes('costBasisModalLabelClass'), 'cost-basis labels need shared explicit dark-theme colors');
  assert.ok(appSource.includes('costBasisModalInputClass'), 'cost-basis inputs need shared explicit dark-theme colors');
  assert.ok(appSource.includes('text-[#f5f7fb]'), 'cost-basis input text should stay visible on iOS keyboards');
  assert.ok(appSource.includes('placeholder:text-[#707a89]'), 'cost-basis placeholders should stay visible on iOS keyboards');
  assert.ok(appSource.includes("style={{ colorScheme: 'dark' }}"), 'cost-basis date input must force dark color scheme');
});

test('cost basis tool filters empty symbols before rendering or saving', () => {
  assert.ok(appSource.includes('sanitizeCostBasisData'), 'cost-basis state should sanitize stale local/cloud records');
  assert.ok(appSource.includes('normalizeCostBasisSymbol(costBasisNewSymbol)'), 'new cost-basis symbols must be normalized before saving');
  assert.ok(tradesTabSource.includes('Object.keys(costBasisData).map(sym => normalizeCostBasisSymbol(sym)).filter(Boolean)'), 'cost-basis tabs must filter blank symbols before rendering');
  assert.ok(dbSource.includes('if (!sym) continue;'), 'cost-basis cloud fetch must ignore invalid blank symbols');
  assert.ok(dbSource.includes("if (!normalizedSymbol) throw new Error('缺少有效股票代码');"), 'cost-basis cloud writes must reject blank symbols');
});

test('realtime quote refresh avoids duplicate requests and hides raw Safari network errors', () => {
  assert.ok(appSource.includes('quoteFetchInFlightRef'), 'quote refresh should guard overlapping auto and pull-refresh requests');
  assert.ok(appSource.includes('formatRealtimeFetchError'), 'quote refresh should normalize browser network errors');
  assert.ok(appSource.includes('行情网络请求失败,已保留现有数据'), 'raw Load failed text should become a user-facing Chinese message');
  assert.ok(appSource.includes('setTimeout(() => setFetchError(null), 4200)'), 'quote refresh errors should clear automatically');
  assert.ok(appSource.includes('行情拉取失败:{fetchError}'), 'bottom toast should identify quote refresh failures specifically');
});

test('global pull refresh checks for a new deployed app shell before data refresh', () => {
  const refreshStart = appSource.indexOf('const runGlobalPullRefresh = async () =>');
  const appShellCheck = appSource.indexOf('await checkForAppShellUpdate()', refreshStart);
  const cloudFetch = appSource.indexOf('await db.fetchAllUserData()', refreshStart);

  assert.ok(refreshStart > -1, 'missing global pull-refresh implementation');
  assert.ok(appShellCheck > refreshStart, 'pull-refresh should check the deployed app shell');
  assert.ok(cloudFetch > appShellCheck, 'app shell check should run before cloud data refresh');
  assert.ok(appSource.includes('extractAppShellAssetsFromHtml'), 'refresh should compare deployed asset fingerprints');
  assert.ok(appSource.includes('getCurrentAppShellAssets'), 'refresh should read the currently loaded asset fingerprints');
  assert.ok(appSource.includes("cache: 'no-store'"), 'refresh should bypass browser cache when checking index HTML');
  assert.ok(appSource.includes('clearAppShellCaches'), 'refresh should clear stale app caches before reload');
  assert.ok(appSource.includes('window.location.replace'), 'refresh should reload the app without requiring the user to reopen it');
  assert.ok(appSource.includes('发现新版本,正在更新'), 'refresh should tell the user when it is switching to a new version');
});

test('global pull refresh only starts from the page top outside internal scrollers', () => {
  assert.ok(appSource.includes('PULL_REFRESH_ACTIVATION_DISTANCE'), 'pull-refresh should require a deliberate pull before showing UI');
  assert.ok(appSource.includes('touchStartedAtRootTop = getScrollTop() <= PULL_REFRESH_ROOT_TOP_TOLERANCE'), 'pull-refresh eligibility must be captured at touch start');
  assert.ok(appSource.includes('if (!touchStartedAtRootTop) return false;'), 'pull-refresh must not start after a gesture reaches the top mid-scroll');
  assert.ok(appSource.includes('touchStartedInBlockedRegion = isBlockedPullTarget(startTarget)'), 'pull-refresh should remember blocked start targets');
  assert.ok(appSource.includes('if (touchStartedInBlockedRegion) return false;'), 'pull-refresh must ignore gestures from internal scrollers');
  assert.ok(appSource.includes('target.closest(\'[data-pull-refresh-block="true"]\')'), 'pull-refresh should support explicit blocked scroll regions');
  assert.ok(appSource.includes('isInternalScrollable'), 'pull-refresh should detect generic nested scroll containers');
  assert.ok(tradesTabSource.includes('data-pull-refresh-block="true"'), 'trade records list should not trigger global pull-refresh while scrolling records');
});

test('position clicks default to buy and trade records use ledger edit/delete flow', () => {
  assert.equal(tradesTabSource.includes("openTradeModal(position, 'sell')"), false, 'clicking a position row must not default to sell');
  assert.ok(tradesTabSource.includes("openTradeModal(position, 'buy')"), 'clicking a position row should open buy mode');
  assert.ok(tradesTabSource.includes("{ id: 'records', label: '交易记录', icon: ListChecks }"), 'stock settings tool should become trade records with a record icon');
  assert.ok(tradesTabSource.includes('const ledgerTradeRecords ='), 'trade records tool should render all stock_trades records');
  assert.ok(tradesTabSource.includes('setOrderActionTrade(trade)'), 'trade records should reuse the order action modal for edit/delete');
  assert.ok(tradesTabSource.includes('deleteStockTradeRecord(trade.id)'), 'trade records delete flow should still use the database-backed stock_trades delete path');
});

test('stock Chinese names are shared by home positions and trade records', () => {
  assert.ok(appSource.includes('stockTrades: localizedStockTrades'), 'investment summary should derive positions from localized stock trades');
  assert.ok(appSource.includes('displayStockName,'), 'tabs should receive the shared stock-name display helper');
  assert.ok(homeTabSource.includes('displayName: stockDisplayName(symbol, row?.name || quote?.name)'), 'home watchlist edit rows should use shared stock-name fallback');
  assert.ok(homeTabSource.includes('{item.displayName}'), 'home watchlist/positions table should render the localized display name');
  assert.ok(tradesTabSource.includes('stockDisplayName(position.symbol, position.name)'), 'trade positions should render localized stock names');
  assert.ok(tradesTabSource.includes('stockDisplayName(trade.symbol, trade.name)'), 'trade records and today orders should render localized stock names');
  assert.ok(tradesTabSource.includes('stockDisplayName(orderActionTrade.symbol, orderActionTrade.name)'), 'order action modal should render localized stock names');
});

test('QQQ and TQQQ stay English in the shared stock-name fallback', () => {
  assert.ok(appSource.includes("QQQ: 'QQQ'"), 'QQQ should display as the English code');
  assert.ok(appSource.includes("TQQQ: 'TQQQ'"), 'TQQQ should display as the English code');
  assert.equal(appSource.includes("QQQ: '纳斯达克100'"), false, 'QQQ must not be remapped to the old Chinese display name');
  assert.equal(appSource.includes("TQQQ: '3倍纳指'"), false, 'TQQQ must not be remapped to the old Chinese display name');
  assert.ok(appSource.includes("{ symbol: 'QQQ', name: 'QQQ' }"), 'QQQ benchmark option should also display in English');
});

test('asset module redesign keeps database logic while removing legacy controls', () => {
  assert.ok(analysisTabSource.includes('ASSET_GOLD'), 'asset page should use the redesigned dark/gold theme tokens');
  assert.ok(analysisTabSource.includes('ASSET_PINK'), 'asset page should keep the pink accent for positive values and spouse assets');
  assert.ok(analysisTabSource.includes('ACCOUNT_TYPE_OPTIONS'), 'asset accounts should use the custom line-icon type grid');
  assert.ok(analysisTabSource.includes('Landmark'), 'bank accounts should use lucide line icons rather than emoji');
  assert.ok(analysisTabSource.includes('WalletCards'), 'payment accounts should use lucide line icons rather than emoji');
  assert.ok(analysisTabSource.includes('bg-black/[0.72]'), 'asset modals should use centered dark in-app overlays');
  assert.ok(analysisTabSource.includes('text-[#f5f7fb]'), 'asset modal inputs should force visible dark-theme text');
  assert.ok(analysisTabSource.includes('placeholder:text-[#6f7887]'), 'asset modal placeholders should stay visible on iOS keyboards');
  assert.ok(analysisTabSource.includes('db.insertAccount'), 'add account must keep the existing account insert path');
  assert.ok(analysisTabSource.includes('db.upsertSnapshot'), 'monthly balance saves must keep the existing snapshot upsert path');
  assert.ok(analysisTabSource.includes('db.deleteAccount'), 'account delete must keep the existing database-backed delete path');
  assert.ok(analysisTabSource.includes("if (currency === 'USD') return value * usdRate;"), 'USD balances must still convert with the existing daily fx rate');
  assert.ok(analysisTabSource.includes("if (currency === 'HKD') return value * hkdRate;"), 'HKD balances must still convert with the existing daily fx rate');
  assert.equal(analysisTabSource.includes('美元汇率'), false, 'manual USD rate control should not remain visible');
  assert.equal(analysisTabSource.includes('港币汇率'), false, 'manual HKD rate control should not remain visible');
  assert.equal(analysisTabSource.includes('setUsdRate'), false, 'asset tab should not expose manual USD rate editing');
  assert.equal(analysisTabSource.includes('setHkdRate'), false, 'asset tab should not expose manual HKD rate editing');
  assert.equal(analysisTabSource.includes('alert('), false, 'asset tab validation should not use native alert dialogs');
  assert.ok(settingsTabSource.includes('v10.7.9.107'), 'settings version should reflect the asset visual fix');
  assert.ok(settingsTabSource.includes('资产模块 UI 深色重设计'), 'settings changelog should describe the asset module redesign');
});

test('asset page visual shell and local preview stay debuggable', () => {
  assert.ok(appSource.includes("activeTab === 'analysis'"), 'asset tab must use the same dark shell as home and trades');
  assert.ok(authGateSource.includes("!isSupabaseConfigured && import.meta.env.DEV"), 'local missing-env mode must be development-only');
  assert.ok(authGateSource.includes('<DevVisualPreview />'), 'development missing-env mode should render the asset visual preview');
  assert.ok(devVisualPreviewSource.includes('makeSnapshots(baseAccounts)'), 'asset visual preview should provide deterministic local mock snapshots');
  assert.ok(devVisualPreviewSource.includes("deleteAccount: async () => ({})"), 'asset visual preview must not perform real database deletes');
  assert.ok(analysisTabSource.includes('assetDrawLine'), 'asset chart should keep the line drawing animation');
  assert.ok(analysisTabSource.includes('assetAreaFadeIn'), 'asset chart area should keep the fade-in animation');
  assert.ok(analysisTabSource.includes('assetDotPop'), 'asset chart points should keep the pop animation');
  assert.ok(analysisTabSource.includes("className=\"flex min-h-[46px] min-w-0 items-center justify-center"), 'asset action buttons should stay compact and readable');
  assert.equal(analysisTabSource.includes('text-[48px]'), false, 'asset header number should not return to the oversized mobile font');
  assert.ok(settingsTabSource.includes('修复资产页深色视觉和本地预览'), 'settings changelog should document the asset visual fix');
});

test('order action modal stays compact like the current trade record reference', () => {
  assert.ok(tradesTabSource.includes('w-[calc(100vw-72px)] max-w-[360px]'), 'order action modal should use the narrower centered reference width');
  assert.ok(tradesTabSource.includes('rounded-[22px]'), 'order action modal should keep a compact rounded panel');
  assert.ok(tradesTabSource.includes('min-h-[48px]'), 'order action edit/delete buttons should not return to oversized cards');
  assert.ok(tradesTabSource.includes('min-h-[42px]'), 'order action cancel button should stay compact');
  assert.ok(tradesTabSource.includes('px-4 pb-4 pt-3'), 'order action button area should use compact vertical padding');
});

test('wave records keep editable notes and completed waves remain reachable', () => {
  assert.ok(tradesTabSource.includes('波段备注/计划'), 'wave add modal must keep a note/plan field');
  assert.ok(tradesTabSource.includes('completedWaveGroups'), 'completed waves need their own grouped data source');
  assert.ok(tradesTabSource.includes("setWaveView('completed')"), 'completed summary must switch into a completed-only view');
  assert.ok(tradesTabSource.includes("waveView === 'completed' ?"), 'completed waves must render as a separate category view');
  assert.ok(tradesTabSource.includes('key={`completed-${group.symbol}`}'), 'completed category must group rows by stock symbol');
  assert.ok(tradesTabSource.includes('saveWaveNote'), 'wave notes need a shared save helper');
  assert.ok(tradesTabSource.includes('清除'), 'wave note UI must provide an obvious clear action');
  assert.ok(appSource.includes('targetWaveId'), 'wave add path must attach notes to the computed wave id');
  assert.ok(appSource.includes('db.upsertWaveNote(targetWaveId, noteValue)'), 'wave add path must persist note/plan text');
});
