import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const authGateSource = readFileSync(new URL('../src/AuthGate.jsx', import.meta.url), 'utf8');
const amountDisplaySource = readFileSync(new URL('../src/lib/amountDisplay.js', import.meta.url), 'utf8');
const analysisTabSource = readFileSync(new URL('../src/tabs/AnalysisTab.jsx', import.meta.url), 'utf8');
const devVisualPreviewSource = readFileSync(new URL('../src/DevVisualPreview.jsx', import.meta.url), 'utf8');
const homeTabSource = readFileSync(new URL('../src/tabs/HomeTab.jsx', import.meta.url), 'utf8');
const reviewTabSource = readFileSync(new URL('../src/tabs/ReviewTab.jsx', import.meta.url), 'utf8');
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
  assert.ok(appSource.includes("const QUOTE_ERROR_VISIBLE_TABS = ['home', 'trades'];"), 'quote refresh errors should only surface on quote-consuming tabs');
  assert.ok(appSource.includes('const showQuoteFetchError = Boolean(fetchError) && QUOTE_ERROR_VISIBLE_TABS.includes(activeTab)'), 'target/asset/settings tabs should not inherit quote refresh toasts');
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
  assert.ok(analysisTabSource.includes('db.updateAccount'), 'account edits must use the database-backed update path');
  assert.ok(dbSource.includes('export const updateAccount = async'), 'account metadata updates need a shared database helper');
  assert.ok(analysisTabSource.includes("if (currency === 'USD') return value * usdRate;"), 'USD balances must still convert with the existing daily fx rate');
  assert.ok(analysisTabSource.includes("if (currency === 'HKD') return value * hkdRate;"), 'HKD balances must still convert with the existing daily fx rate');
  assert.equal(analysisTabSource.includes('美元汇率'), false, 'manual USD rate control should not remain visible');
  assert.equal(analysisTabSource.includes('港币汇率'), false, 'manual HKD rate control should not remain visible');
  assert.equal(analysisTabSource.includes('setUsdRate'), false, 'asset tab should not expose manual USD rate editing');
  assert.equal(analysisTabSource.includes('setHkdRate'), false, 'asset tab should not expose manual HKD rate editing');
  assert.equal(analysisTabSource.includes('alert('), false, 'asset tab validation should not use native alert dialogs');
  assert.ok(settingsTabSource.includes('v10.7.9.109'), 'settings version should reflect the latest asset account behavior');
  assert.ok(settingsTabSource.includes('优化资产账户显示和操作'), 'settings changelog should describe the asset account behavior update');
  assert.ok(settingsTabSource.includes('资产模块 UI 深色重设计'), 'settings changelog should describe the asset module redesign');
});

test('asset page visual shell and local preview stay debuggable', () => {
  assert.ok(appSource.includes("activeTab === 'analysis'"), 'asset tab must use the same dark shell as home and trades');
  assert.ok(authGateSource.includes("!isSupabaseConfigured && import.meta.env.DEV"), 'local missing-env mode must be development-only');
  assert.ok(authGateSource.includes('<DevVisualPreview />'), 'development missing-env mode should render the asset visual preview');
  assert.ok(devVisualPreviewSource.includes('makeSnapshots(baseAccounts)'), 'asset visual preview should provide deterministic local mock snapshots');
  assert.ok(devVisualPreviewSource.includes('updateAccount: async'), 'asset visual preview should support account edit smoke checks');
  assert.ok(devVisualPreviewSource.includes("deleteAccount: async () => ({})"), 'asset visual preview must not perform real database deletes');
  assert.ok(analysisTabSource.includes('assetDrawLine'), 'asset chart should keep the line drawing animation');
  assert.ok(analysisTabSource.includes('assetAreaFadeIn'), 'asset chart area should keep the fade-in animation');
  assert.ok(analysisTabSource.includes('assetDotPop'), 'asset chart points should keep the pop animation');
  assert.ok(analysisTabSource.includes('selectedChartChangePct'), 'asset chart point tooltip should include the month-over-month percentage');
  assert.ok(analysisTabSource.includes('chartLabelIndices'), 'asset chart x-axis should include a middle month label');
  assert.ok(analysisTabSource.includes('const chartLeft = 64'), 'asset chart first point should stay clear of y-axis labels');
  assert.ok(analysisTabSource.includes("className=\"flex min-h-[46px] min-w-0 items-center justify-center"), 'asset action buttons should stay compact and readable');
  assert.equal(analysisTabSource.includes('text-[48px]'), false, 'asset header number should not return to the oversized mobile font');
  assert.ok(settingsTabSource.includes('对齐资产页字号和走势图细节'), 'settings changelog should document the asset typography and chart fix');
});

test('asset account list hides zero-balance rows and uses action modal for edit/delete', () => {
  assert.ok(appSource.includes("type: ''"), 'new account state should not preselect bank type');
  assert.ok(analysisTabSource.includes("setNewAccount({ owner: '我', type: '', name: '', currency: 'CNY', icon: '', balance: '' })"), 'opening add account should reset to no selected type');
  assert.ok(analysisTabSource.includes('请选择账户类型'), 'add/edit account should require the user to choose a type');
  assert.ok(analysisTabSource.includes('const currentVisibleAccounts = (items) =>'), 'asset owner lists need a current-month visibility filter');
  assert.ok(analysisTabSource.includes('items.filter(acc => balanceAtMonthCNY(acc.id, currentMonth) !== 0)'), 'only zero current-month accounts should be hidden from owner lists');
  assert.ok(analysisTabSource.includes('visibleOwnerAccs.length'), 'owner account counts should reflect only visible current-month accounts');
  assert.ok(analysisTabSource.includes('setAccountActionId(acc.id)'), 'clicking an account row should open the action modal');
  assert.ok(analysisTabSource.includes('账户操作'), 'asset account action modal should be present');
  assert.ok(analysisTabSource.includes('修改账户'), 'asset account action modal should offer editing');
  assert.ok(analysisTabSource.includes('删除账户'), 'asset account action modal should offer deletion');
  assert.ok(analysisTabSource.includes('保存修改'), 'asset account edit modal should save changes');
  assert.equal(analysisTabSource.includes('title="删除"'), false, 'owner account rows must not keep a direct trailing delete button');
});

test('primary asset totals split decimal suffixes consistently', () => {
  assert.ok(amountDisplaySource.includes('splitCurrencyAmount'), 'shared amount helper should split integer and decimal parts');
  assert.ok(amountDisplaySource.includes("if (currency === 'CNY') return '¥'"), 'shared amount helper should preserve CNY prefix');
  assert.ok(homeTabSource.includes("import { splitCurrencyAmount } from '../lib/amountDisplay.js';"), 'home tab should use the shared split amount helper');
  assert.ok(homeTabSource.includes('const displayAssetMoney = splitCurrencyAmount(displayAssets, displayCurrency, 2)'), 'home total assets should split the decimal suffix');
  assert.ok(homeTabSource.includes('displayAssetMoney.decimal'), 'home total assets should render the decimal suffix separately');
  assert.ok(tradesTabSource.includes("import { splitCurrencyAmount } from '../lib/amountDisplay.js';"), 'trades tab should use the shared split amount helper');
  assert.ok(tradesTabSource.includes('const displayAssetMoney = splitCurrencyAmount(displayAssets, displayCurrency, 2)'), 'trades total assets should split the decimal suffix');
  assert.ok(tradesTabSource.includes('displayAssetMoney.decimal'), 'trades total assets should render the decimal suffix separately');
  assert.ok(analysisTabSource.includes("import { splitCurrencyAmount } from '../lib/amountDisplay.js';"), 'asset tab should use the shared split amount helper');
  assert.ok(analysisTabSource.includes("const totalNowMoney = splitCurrencyAmount(totalNow, 'CNY', 2)"), 'family total assets should split the decimal suffix');
  assert.ok(analysisTabSource.includes('totalNowMoney.decimal'), 'family total assets should render the decimal suffix separately');
  assert.ok(homeTabSource.includes('text-[20px] font-normal leading-none text-[#ffd18a]/90'), 'home decimal suffix should be smaller and normal weight');
  assert.ok(tradesTabSource.includes('text-[20px] font-normal leading-none text-[#ffd18a]/90'), 'trades decimal suffix should be smaller and normal weight');
  assert.ok(analysisTabSource.includes('text-[20px] font-normal leading-none text-[#ffd37d]/90'), 'family asset decimal suffix should be smaller and normal weight');
});

test('review target page uses dark mobile cards and click action modals', () => {
  assert.ok(appSource.includes("activeTab === 'review'"), 'review tab must use the same dark shell as home and assets');
  assert.ok(reviewTabSource.includes("const REVIEW_CARD = '#0b0f14'"), 'review page should share the dark card surface');
  assert.ok(reviewTabSource.includes('年度目标操作'), 'year cards should open an action panel');
  assert.ok(reviewTabSource.includes('修改年度数据'), 'year action panel should offer editing instead of a trailing edit icon');
  assert.ok(reviewTabSource.includes('SF Pro Display'), 'review money should use the same system number font as the home header');
  assert.ok(reviewTabSource.includes('fmtMoney(value, digits = 0)'), 'review money should render full comma-separated amounts without dense decimals');
  assert.equal(reviewTabSource.includes('fmtWan'), false, 'review money must not return to wan shorthand');
  assert.ok(reviewTabSource.includes('const splitMoney = (usdValue, digits = 2)'), 'north-star headline should split the decimal part for small-type rendering');
  assert.ok(reviewTabSource.includes('headlineGoalMoney = splitMoney(ageGoalAmountExact, 2)'), 'only the north-star headline should restore two decimals');
  assert.ok(reviewTabSource.includes('headlineGoalMoney.decimal'), 'north-star headline should render the decimal suffix separately');
  assert.ok(reviewTabSource.includes('text-[20px] font-normal leading-none text-[#ffd18a]/90'), 'north-star headline decimal suffix should be visually smaller and normal weight');
  assert.equal(reviewTabSource.includes('money(ageGoalAmount, 2)'), false, 'other target amount surfaces should not return to two decimals');
  assert.ok(reviewTabSource.includes('h-[244px]'), 'north-star header card should stay more compact on mobile');
  assert.ok(reviewTabSource.includes('mb-1.5 mt-auto flex items-center justify-between gap-3'), 'north-star motto row should stay at the natural bottom position');
  assert.ok(reviewTabSource.includes('shrink-0 -translate-y-2 rounded-xl border border-white/10 bg-white/[0.045]'), 'north-star settings button should stay lifted with neutral styling');
  assert.ok(reviewTabSource.includes('relative z-10 mt-2 text-[12px] text-white/55'), 'north-star target subtitle should stay visually quieter');
  assert.ok(reviewTabSource.includes('mt-3 text-[12px] text-white/50'), 'north-star remaining-years line should match the smaller subtitle size');
  assert.ok(reviewTabSource.includes('text-[15px] font-semibold text-white">年度目标进度'), 'annual target section title should be slightly smaller');
  assert.ok(reviewTabSource.includes('text-[28px] font-semibold leading-none text-[#ffd18a]'), 'current annual year should use a lighter weight');
  assert.ok(reviewTabSource.includes('text-[22px] font-semibold leading-none text-white/55'), 'future annual years should use a lighter weight');
  assert.ok(reviewTabSource.includes('<div className="text-[11px] text-white/38">起点</div>'), 'future year start label should omit the parenthesized year');
  assert.ok(reviewTabSource.includes('<div className="text-[11px] text-white/38">目标</div>'), 'future year target label should omit the parenthesized year');
  assert.equal(reviewTabSource.includes('起点 ({yearItem.year - 1}目标)'), false, 'future year start label should not include the old year suffix');
  assert.equal(reviewTabSource.includes('目标 ({yearItem.year})'), false, 'future year target label should not include the old year suffix');
  assert.ok(reviewTabSource.includes('mt-1 text-[12px] font-normal text-white/35 tabular-nums'), 'future year start and target amounts should use neutral gray');
  assert.ok(reviewTabSource.includes('border-dashed border-white/25'), 'future year growth target guide line should be gray');
  assert.ok(reviewTabSource.includes('h-7 rounded-full px-2.5 text-[11px] font-normal'), 'review currency switch should match the home header size');
  assert.ok(reviewTabSource.includes('rounded-2xl border border-white/10 bg-[#0b0f14] p-4 shadow-'), 'north-star card should use the same weak border/shadow style as the home header');
  assert.ok(reviewTabSource.includes('rounded-[20px] border border-white/10 bg-[#0b0f14] p-4 text-left shadow-'), 'current year card should use the same weak border color as the north-star card');
  assert.equal(reviewTabSource.includes('border-[#f6b54b]/65'), false, 'current year card should not keep the bright yellow outline');
  assert.equal(reviewTabSource.includes('bottom-[-78px] h-48 w-48'), false, 'north-star card should not keep the lower-right semicircle decoration');
  assert.ok(reviewTabSource.includes('mt-5 -mx-2'), 'annual target section should expand wider than the page padding');
  assert.ok(reviewTabSource.includes('marketTextClass'), 'review pink/green amount colors should share the home market color helper');
  assert.equal(reviewTabSource.includes('rocket-particle rocket-particle'), false, 'review header should not render loose moving particle strips');
  assert.ok(appSource.includes('.progress-shine { position: relative; overflow: hidden; }'), 'progress shine must stay clipped inside the progress bar');
  assert.ok(reviewTabSource.includes('.progress-shine {'), 'review local preview should carry its own clipped progress shine styles');
  assert.ok(reviewTabSource.includes('targetGap'), 'current year card should show target gap/lag information');
  assert.ok(reviewTabSource.includes('plannedStartBalance'), 'future year cards should show the prior planned target start');
  assert.ok(reviewTabSource.includes('border-dashed border-[#f6b54b]/35'), 'annual goal list expand button should keep its reference accent');
  assert.ok(reviewTabSource.includes('mb-4 flex min-h-10 items-center justify-between gap-4'), 'discipline section title row should align with the add button');
  assert.ok(reviewTabSource.includes('text-[19px] font-semibold leading-none tracking-normal text-white">投资戒律'), 'discipline section title should use the smaller heading size');
  assert.ok(reviewTabSource.includes('h-5 w-1 shrink-0 rounded-full bg-[#f6a524]'), 'discipline section should use a shorter vertical accent bar');
  assert.equal(reviewTabSource.includes('{disciplines.length} 条'), false, 'discipline section should not show a duplicate count under the title');
  assert.ok(reviewTabSource.includes('flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035]'), 'discipline add button should use a smaller low-color pill style');
  assert.ok(reviewTabSource.includes("dotColor: '#18d66b'"), 'discipline level metadata should use colored dots instead of icons');
  assert.ok(reviewTabSource.includes('mb-4 flex gap-2.5 overflow-x-auto'), 'discipline filters should stay compact enough for the mobile reference row');
  assert.ok(reviewTabSource.includes('flex h-9 min-w-[54px] shrink-0 items-center justify-center gap-2'), 'discipline level filter pills should remain compact on 390px mobile');
  assert.ok(reviewTabSource.includes('className="h-2 w-2 rounded-full" style={{ backgroundColor: item.dotColor'), 'discipline filters should render compact colored dots');
  assert.ok(reviewTabSource.includes('style={{ backgroundColor: meta.ringColor, borderColor: meta.ringBorder }}'), 'discipline rows should render muted color rings');
  assert.ok(reviewTabSource.includes('className="block w-full rounded-[22px] border border-white/[0.06] bg-[#0b1119] px-4 py-3.5'), 'discipline rows should use the tightened card surface');
  assert.ok(reviewTabSource.includes('text-[14px] font-normal leading-[1.52] text-white/80'), 'discipline text should use the tightened body size');
  assert.ok(reviewTabSource.includes('rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-0.5 text-[11px] text-white/42'), 'discipline pinned badge should be muted and smaller');
  assert.ok(reviewTabSource.includes('inline-flex items-center gap-1 text-white/38'), 'discipline expand action should be muted gray');
  assert.equal(reviewTabSource.includes('<span className="text-[15px]">{discipline.level}</span>'), false, 'discipline rows should not render legacy emoji level icons');
  assert.ok(appSource.includes('style={{ backgroundColor: l.ringColor, borderColor: l.ringBorder }}'), 'discipline edit modal should use colored dots for level choices');
  assert.equal(appSource.includes('<span className="text-base">{l.level}</span>'), false, 'discipline edit modal should not render emoji level icons');
  assert.ok(reviewTabSource.includes('function DisciplineDetailModal'), 'discipline rows should open a record detail modal');
  assert.ok(reviewTabSource.includes('记录详情'), 'discipline detail modal should use the record detail title');
  assert.ok(reviewTabSource.includes('min-h-[168px]'), 'discipline detail modal should reserve enough space for short content');
  assert.ok(reviewTabSource.includes('formatDisciplineDetailText(discipline.text)'), 'discipline detail modal should render the full text body');
  assert.ok(reviewTabSource.includes("discipline.pinned ? '取消置顶' : '置顶'"), 'discipline detail modal must keep pin/unpin');
  assert.ok(reviewTabSource.includes('grid grid-cols-3 gap-2'), 'discipline detail actions should use compact three-button layout');
  assert.ok(reviewTabSource.includes('flex h-9 items-center justify-center gap-1.5 rounded-full'), 'discipline detail action buttons should be compact pills');
  assert.equal(reviewTabSource.includes('删除戒律'), false, 'discipline detail modal should not keep the large legacy delete label');
  assert.equal(reviewTabSource.includes('修改戒律'), false, 'discipline detail modal should not keep the large legacy edit label');
  assert.ok(reviewTabSource.includes('role="button"'), 'discipline rows should avoid nested native buttons while remaining clickable');
  assert.equal(reviewTabSource.includes('融资杠杆监控'), false, 'leverage monitor card should be removed from the review page UI');
  assert.equal(reviewTabSource.includes('setShowEditMargin'), false, 'review page should not keep a leverage edit entry point');
  assert.equal(reviewTabSource.includes('1 USD = {fxRate.toFixed(2)} RMB'), false, 'review header should not show the fx rate helper text');
  assert.ok(devVisualPreviewSource.includes("get('tab') === 'review'"), 'local visual preview should support opening review tab directly');
  assert.ok(devVisualPreviewSource.includes('<ReviewTab ctx={reviewCtx} />'), 'local visual preview should render the review page mock');
  assert.ok(settingsTabSource.includes('v10.7.9.123'), 'settings version should document the discipline detail modal tune');
  assert.ok(settingsTabSource.includes('投资戒律记录详情弹窗'), 'settings changelog should describe the discipline detail modal tune');
});

test('review edit modals use in-app validation instead of native alerts', () => {
  const disciplineStart = appSource.indexOf('function DisciplineModal');
  const disciplineEnd = appSource.indexOf('// 添加/编辑日志 Modal', disciplineStart);
  const disciplineBlock = appSource.slice(disciplineStart, disciplineEnd);
  const logStart = appSource.indexOf('function LogModal');
  const logEnd = appSource.indexOf('// 编辑年度实际数据 Modal', logStart);
  const logBlock = appSource.slice(logStart, logEnd);

  assert.ok(disciplineStart > -1 && disciplineEnd > disciplineStart, 'missing discipline modal boundary');
  assert.ok(logStart > -1 && logEnd > logStart, 'missing review log modal boundary');
  assert.equal(disciplineBlock.includes('alert('), false, 'discipline modal validation should not use native alert');
  assert.equal(logBlock.includes('alert('), false, 'review log modal validation should not use native alert');
  assert.ok(disciplineBlock.includes("setError('请输入内容')"), 'discipline modal should show an in-app validation message');
  assert.ok(logBlock.includes("setError('请输入内容')"), 'review log modal should show an in-app validation message');
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
