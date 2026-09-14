import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const trades = read('src/tabs/TradesTab.jsx');
const catalog = read('src/components/TradeToolsCatalog.jsx');
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const transformed = await transformWithOxc(catalog, 'TradeToolsCatalog.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code
  .replace(/import\s*(['"])\.\/TradeToolsCatalog\.css\1;?/g, '')
  .replace(/from (["'])(react|lucide-react)\1/g, (_, quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`)
  .replace(/from (["'])\.\.\/lib\/i18n\.js\1/g, `from ${JSON.stringify(new URL('../src/lib/i18n.js', import.meta.url).href)}`);
const { default: TradeToolsCatalog } = await import(dataUrl(compiled));

function nodesOfType(node, type) {
  if (!React.isValidElement(node)) return [];
  return [...(node.type === type ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodesOfType(child, type))];
}

function renderCatalog(props) {
  let tree;
  function Capture() {
    tree = TradeToolsCatalog(props);
    return tree;
  }
  renderToStaticMarkup(React.createElement(Capture));
  return tree;
}

const modal = trades.slice(trades.indexOf('{showAllToolsModal && ('), trades.indexOf('{showTradeRecordsTool && ('));
const handler = modal.match(/onSelect=\{\(toolId\) => \{([\s\S]*?)\}\}\s*\/>/)?.[1];
assert.ok(handler, 'read the actual All Tools event handler');
const callbacks = app.slice(app.indexOf('const openStockDecision ='), app.indexOf('const openDcaLab ='));
const tabDestructure = trades.slice(trades.indexOf('  const {', trades.indexOf('export default function TradesTab(')), trades.indexOf('  } = ctx;') + '  } = ctx;'.length);

test('stock decision is between overlap and averaging with a translated line icon', () => {
  for (const [language, title, description] of [
    ['zh', '股票决策', '趋势、位置与量价观察'],
    ['en', 'Stock decision', 'Observe trends, price levels and volume.'],
  ]) {
    const buttons = nodesOfType(renderCatalog({ language, onSelect() {} }), 'button');
    const ids = buttons.map(button => button.props['data-tool-id']);
    const index = ids.indexOf('stock-decision');
    assert.ok(index > 0);
    assert.deepEqual(ids.slice(index - 1, index + 2), ['portfolio-overlap', 'stock-decision', 'cost']);
    assert.equal(ids.filter(id => id === 'stock-decision').length, 1);
    const markup = renderToStaticMarkup(buttons[index]);
    assert.ok(markup.includes(title));
    assert.ok(markup.includes(description));
    assert.match(markup, /lucide-crosshair/);
    assert.match(markup, /stroke-width="1.7"/);
  }
});

test('the real catalog click closes the sheet and clears its panel before invoking the supplied callback', () => {
  const calls = [];
  const openStockDecision = () => calls.push(['decision']);
  const suppliedCallback = new Function('ctx', `${tabDestructure}; return openStockDecision;`)({ openStockDecision });
  assert.equal(suppliedCallback, openStockDecision, 'Trades receives the callback from its real ctx destructuring');
  const tabCtx = app.slice(app.indexOf('  const tabCtx = {'), app.indexOf('  const activeTabCtx ='));
  assert.match(tabCtx, /^\s*openStockDecision,$/m, 'the App passes its production callback to Trades');
  const select = new Function('toolId', 'setShowAllToolsModal', 'setToolPanel', 'openStockDecision', handler);
  const tree = renderCatalog({ onSelect: toolId => select(
    toolId, value => calls.push(['sheet', value]), value => calls.push(['panel', value]), suppliedCallback,
  ) });
  assert.deepEqual(calls, [], 'rendering the catalog must not navigate');
  nodesOfType(tree, 'button').find(button => button.props['data-tool-id'] === 'stock-decision').props.onClick();
  assert.deepEqual(calls, [['sheet', false], ['panel', ''], ['decision']]);
  assert.equal((trades.match(/openStockDecision\?\.\(\)/g) || []).length, 1, 'the tool is added only to All Tools');
  assert.doesNotThrow(() => select('stock-decision', () => {}, () => {}, undefined), 'an absent callback is safe');
});

test('production open and close callbacks only navigate within Trades', () => {
  const calls = [];
  const navigation = new Function('useCallback', 'setActiveTab', 'setActivePage', `${callbacks}; return { openStockDecision, closeStockDecision };`)(
    callback => callback, value => calls.push(['tab', value]), value => calls.push(['page', value]),
  );
  assert.deepEqual(calls, []);
  navigation.openStockDecision();
  navigation.closeStockDecision();
  assert.deepEqual(calls, [['tab', 'trades'], ['page', 'stock-decision'], ['tab', 'trades'], ['page', null]]);
  assert.doesNotMatch(`${callbacks}\n${handler}`, /\b(?:db|supabase|localStorage|sessionStorage)\b|stock_trades|cost_basis_trades|\b(?:fetch|save|insert|upsert|update|delete|reset|refresh)\s*\(/);
});

test('production route lazy loads an identity-keyed page with only its read-only context', async () => {
  assert.match(app, /const StockDecisionPage = lazy\(\(\) => import\('\.\/pages\/StockDecisionPage\.jsx'\)\)/);
  const pageElement = app.match(/: isStockDecisionPage\s*\? (<StockDecisionPage\b[^\n]+\/>)/)?.[1];
  assert.ok(pageElement, 'the standalone branch must render the production page');
  const fixture = `import React from ${JSON.stringify(import.meta.resolve('react'))};
    export function StockDecisionPage() { return null; }
    export function route(user, language, marketColorMode, closeStockDecision) { return (${pageElement}); }`;
  const result = await transformWithOxc(fixture, 'stock-decision-route.jsx', { jsx: { runtime: 'classic' } });
  const { route, StockDecisionPage } = await import(dataUrl(result.code));
  const closeStockDecision = () => {};
  const first = route({ id: 'first-user' }, 'zh', 'red-up', closeStockDecision);
  const second = route({ id: 'second-user' }, 'en', 'green-up', closeStockDecision);
  const signedOut = route(null, 'zh', 'green-up', closeStockDecision);
  assert.equal(first.type, StockDecisionPage);
  assert.equal(first.key, 'first-user');
  assert.equal(second.key, 'second-user');
  assert.notEqual(first.key, second.key, 'account changes must remount the page');
  assert.deepEqual(first.props.ctx, { userId: 'first-user', language: 'zh', marketColorMode: 'red-up', closeStockDecision });
  assert.deepEqual(second.props.ctx, { userId: 'second-user', language: 'en', marketColorMode: 'green-up', closeStockDecision });
  assert.equal(signedOut.key, '');
  assert.equal(signedOut.props.ctx.userId, '');
  assert.deepEqual(Object.keys(first.props), ['ctx'], 'the page receives no ledger, quote-refresh, or mutation props');
});

test('stock decision uses the standalone safe-area contract and its matching dark shell', () => {
  const flags = app.slice(app.indexOf('  const isPnlReportPage ='), app.indexOf('  const ActiveTab ='));
  const classExpression = app.match(/className=\{(`min-h-screen[^\n]+`)\}/)?.[1];
  const paddingExpression = app.match(/style=\{\{ paddingTop: (isStandalonePage[^\n]+) \}\}/)?.[1];
  assert.ok(classExpression);
  assert.ok(paddingExpression);
  const shell = new Function('activePage', 'darkShell', `${flags}; return { isStandalonePage, isFullBleedPage, hideBottomNavigation, className: ${classExpression}, paddingTop: ${paddingExpression} };`);
  const decision = shell('stock-decision', true);
  const dca = shell('dca-lab', true);
  assert.equal(decision.isStandalonePage, true);
  assert.equal(decision.isFullBleedPage, dca.isFullBleedPage);
  assert.equal(decision.hideBottomNavigation, dca.hideBottomNavigation);
  assert.equal(decision.paddingTop, 0, 'the page owns its standalone header safe area');
  assert.ok(decision.className.includes('bg-[#08090b]'));
  assert.equal(shell(null, true).isStandalonePage, false);
});
