import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
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

test('position clicks default to buy and trade records use ledger edit/delete flow', () => {
  assert.equal(tradesTabSource.includes("openTradeModal(position, 'sell')"), false, 'clicking a position row must not default to sell');
  assert.ok(tradesTabSource.includes("openTradeModal(position, 'buy')"), 'clicking a position row should open buy mode');
  assert.ok(tradesTabSource.includes("{ id: 'records', label: '交易记录', icon: ListChecks }"), 'stock settings tool should become trade records with a record icon');
  assert.ok(tradesTabSource.includes('const ledgerTradeRecords ='), 'trade records tool should render all stock_trades records');
  assert.ok(tradesTabSource.includes('setOrderActionTrade(trade)'), 'trade records should reuse the order action modal for edit/delete');
  assert.ok(tradesTabSource.includes('deleteStockTradeRecord(trade.id)'), 'trade records delete flow should still use the database-backed stock_trades delete path');
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
