import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const tradesTabSource = readFileSync(new URL('../src/tabs/TradesTab.jsx', import.meta.url), 'utf8');

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
