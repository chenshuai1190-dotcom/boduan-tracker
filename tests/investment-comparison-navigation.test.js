import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const trades = read('src/tabs/TradesTab.jsx');
const catalog = read('src/components/TradeToolsCatalog.jsx');

test('investment comparison is a lazy standalone utility with only identity and navigation context', () => {
  assert.ok(app.includes("lazy(() => import('./pages/InvestmentComparisonPage.jsx'))"));
  assert.ok(app.includes("activePage === 'investment-comparison'"));
  assert.ok(app.includes('|| isInvestmentComparisonPage ||'));
  assert.ok(app.includes("<InvestmentComparisonPage ctx={{ userId: user?.id || '', language, closeInvestmentComparison }} />"));
  const callbacks = app.slice(app.indexOf('const openInvestmentComparison ='), app.indexOf('const openStockDetail ='));
  assert.equal((callbacks.match(/setActiveTab\('trades'\)/g) || []).length, 2);
  assert.ok(callbacks.includes("setActivePage('investment-comparison')"));
  assert.ok(callbacks.includes('setActivePage(null)'));
  assert.doesNotMatch(callbacks, /db\.|stock_trades|upsert|insert|save/);
});

test('entry exists only in Trades All Tools and closes the sheet before navigation', () => {
  const tools = trades.slice(trades.indexOf('{showAllToolsModal && ('), trades.indexOf('{showTradeRecordsTool && ('));
  assert.ok(tools.includes('<ActionModalCard') && tools.includes('<TradeToolsCatalog'));
  assert.match(catalog, /id: 'investment-comparison', titleKey: 'trades.investmentTimeMachine'/);
  assert.match(tools, /setShowAllToolsModal\(false\);[\s\S]*if \(toolId === 'investment-comparison'\) openInvestmentComparison\?\.\(\)/);
  assert.equal((trades.match(/openInvestmentComparison\?\.\(\)/g) || []).length, 1);
  assert.equal((read('src/lib/i18n.js').match(/'trades.investmentComparison':/g) || []).length, 2);
  assert.equal((read('src/lib/i18n.js').match(/'trades.investmentTimeMachine':/g) || []).length, 2);
});

test('catalog selections preserve the five existing tool destinations and close the sheet first', () => {
  const tools = trades.slice(trades.indexOf('{showAllToolsModal && ('), trades.indexOf('{showTradeRecordsTool && ('));
  const handler = tools.match(/onSelect=\{\(toolId\) => \{([\s\S]*?)\}\}\s*\/>/);
  assert.ok(handler, 'the catalog should delegate to a controlled parent navigation handler');
  const select = new Function('toolId', 'setShowAllToolsModal', 'setToolPanel', 'openInvestmentComparison', 'openWaveTracker', 'openCommunityCompetition', handler[1]);
  const destinations = {
    cost: [['sheet', false], ['panel', 'cost']],
    records: [['sheet', false], ['panel', 'records']],
    waves: [['sheet', false], ['panel', ''], ['open', 'waves']],
    competition: [['sheet', false], ['panel', ''], ['open', 'competition']],
    'investment-comparison': [['sheet', false], ['panel', ''], ['open', 'investment-comparison']],
  };
  for (const [toolId, expected] of Object.entries(destinations)) {
    const calls = [];
    select(toolId, value => calls.push(['sheet', value]), value => calls.push(['panel', value]), () => calls.push(['open', 'investment-comparison']), () => calls.push(['open', 'waves']), () => calls.push(['open', 'competition']));
    assert.deepEqual(calls, expected, toolId);
  }
  assert.doesNotMatch(handler[1], /db\.|stock_trades|upsert|insert|save/);
});
