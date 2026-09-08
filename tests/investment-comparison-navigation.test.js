import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const trades = read('src/tabs/TradesTab.jsx');

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
  assert.ok(tools.includes("key: 'investment-comparison'"));
  assert.ok(tools.includes("tt('trades.investmentComparison', '投资对比')"));
  assert.match(tools, /key: 'investment-comparison'[\s\S]*setShowAllToolsModal\(false\);[\s\S]*openInvestmentComparison\?\.\(\)/);
  assert.equal((trades.match(/openInvestmentComparison\?\.\(\)/g) || []).length, 1);
  assert.equal((read('src/lib/i18n.js').match(/'trades.investmentComparison':/g) || []).length, 2);
});
