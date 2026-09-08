import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const trades = read('src/tabs/TradesTab.jsx');
const api = read('api/quote.js');

test('overlap is a lazy independent Trades tool using the existing summary, not a second ledger', () => {
  assert.ok(app.includes("lazy(() => import('./pages/PortfolioOverlapPage.jsx'))"));
  assert.ok(app.includes("activePage === 'portfolio-overlap'"));
  assert.ok(app.includes('|| isPortfolioOverlapPage ||'));
  assert.match(app, /<PortfolioOverlapPage key=\{user\?\.id \|\| ''\} ctx=\{\{ userId: user\?\.id \|\| '', language, investmentSummary, portfolioReady: stockHoldingsReady, portfolioError: stockHoldingsError, closePortfolioOverlap \}\}/);
  assert.ok(app.includes('setStockHoldingsReady(Array.isArray(cloudStockTrades))'));
  const callbacks = app.slice(app.indexOf('const openPortfolioOverlap ='), app.indexOf('const openInvestmentComparison ='));
  assert.equal((callbacks.match(/setActiveTab\('trades'\)/g) || []).length, 2);
  assert.doesNotMatch(callbacks, /db\.|save|insert|upsert|delete/);
});

test('all tools closes before entering overlap and no other destination changes', () => {
  const section = trades.slice(trades.indexOf('{showAllToolsModal && ('), trades.indexOf('{showTradeRecordsTool && ('));
  const handler = section.match(/onSelect=\{\(toolId\) => \{([\s\S]*?)\}\}\s*\/>/)[1];
  const calls = [];
  new Function('toolId', 'setShowAllToolsModal', 'setToolPanel', 'openPortfolioOverlap', handler)(
    'portfolio-overlap', value => calls.push(['sheet', value]), value => calls.push(['panel', value]), () => calls.push(['overlap']),
  );
  assert.deepEqual(calls, [['sheet', false], ['panel', ''], ['overlap']]);
  assert.equal((trades.match(/openPortfolioOverlap\?\.\(\)/g) || []).length, 1);
});

test('metadata route reuses authenticated API and sends only symbols to provider', () => {
  assert.ok(api.indexOf('await requireQuoteAuth(req, res)') < api.indexOf('if (portfolioOverlapRequested)'));
  const branch = api.slice(api.indexOf('if (portfolioOverlapRequested)'), api.indexOf('if (investmentComparisonRequested ||'));
  assert.match(branch, /private, no-store/);
  assert.match(branch, /Array\.isArray\(view\) \|\| Array\.isArray\(symbols\)/);
  assert.match(branch, /fetchPortfolioOverlap\(symbols, \{ eodhdKey \}\)/);
  assert.doesNotMatch(branch, /userId|user_id|holdings:|amount:|shares:|save|upsert|insert/);
});
