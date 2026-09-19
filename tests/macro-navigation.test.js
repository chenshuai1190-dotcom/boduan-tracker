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
assert.ok(handler, 'execute the actual All Tools selection handler');
const callbacks = app.slice(app.indexOf('const openMacro ='), app.indexOf('const openPortfolioOverlap ='));
const tabDestructure = trades.slice(trades.indexOf('  const {', trades.indexOf('export default function TradesTab(')), trades.indexOf('  } = ctx;') + '  } = ctx;'.length);
const flags = app.slice(app.indexOf('  const isPnlReportPage ='), app.indexOf('  const ActiveTab ='));

test('Macro immediately follows stock decision in the real Chinese and English tool catalog', () => {
  for (const [language, title, description] of [
    ['zh', '宏观环境', '国债收益率、通胀与流动性'],
    ['en', 'Macro', 'Treasury yields, inflation and liquidity.'],
  ]) {
    const buttons = nodesOfType(renderCatalog({ language, onSelect() {} }), 'button');
    const ids = buttons.map(button => button.props['data-tool-id']);
    const index = ids.indexOf('macro');
    assert.ok(index > 0);
    assert.deepEqual(ids.slice(index - 1, index + 1), ['stock-decision', 'macro']);
    assert.equal(ids.filter(id => id === 'macro').length, 1);
    const markup = renderToStaticMarkup(buttons[index]);
    assert.ok(markup.includes(title));
    assert.ok(markup.includes(description));
    assert.match(markup, /lucide-activity/);
    assert.match(markup, /stroke-width="1.7"/);
  }
});

test('clicking the real Macro catalog entry closes the sheet, clears its panel, then invokes openMacro', () => {
  const calls = [];
  const openMacro = () => calls.push(['macro']);
  const suppliedCallback = new Function('ctx', `${tabDestructure}; return openMacro;`)({ openMacro });
  assert.equal(suppliedCallback, openMacro);
  const tabCtx = app.slice(app.indexOf('  const tabCtx = {'), app.indexOf('  const activeTabCtx ='));
  assert.match(tabCtx, /^\s*openMacro,$/m, 'App passes the production callback into Trades');
  const select = new Function('toolId', 'setShowAllToolsModal', 'setToolPanel', 'openMacro', handler);
  const tree = renderCatalog({ onSelect: toolId => select(
    toolId, value => calls.push(['sheet', value]), value => calls.push(['panel', value]), suppliedCallback,
  ) });
  assert.deepEqual(calls, [], 'rendering does not navigate');
  nodesOfType(tree, 'button').find(button => button.props['data-tool-id'] === 'macro').props.onClick();
  assert.deepEqual(calls, [['sheet', false], ['panel', ''], ['macro']]);
  assert.equal((trades.match(/openMacro\?\.\(\)/g) || []).length, 1, 'Macro is only added to All Tools');
  assert.doesNotThrow(() => select('macro', () => {}, () => {}, undefined));
});

test('production Macro open and close callbacks only change the Trades tab and standalone page', () => {
  const calls = [];
  const navigation = new Function('useCallback', 'setActiveTab', 'setActivePage', `${callbacks}; return { openMacro, closeMacro };`)(
    callback => callback, value => calls.push(['tab', value]), value => calls.push(['page', value]),
  );
  assert.deepEqual(calls, []);
  navigation.openMacro();
  navigation.closeMacro();
  assert.deepEqual(calls, [['tab', 'trades'], ['page', 'macro'], ['tab', 'trades'], ['page', null]]);
  assert.doesNotMatch(`${callbacks}\n${handler}`, /\b(?:db|supabase|localStorage|sessionStorage)\b|stock_trades|cost_basis_trades|\b(?:fetch|save|insert|upsert|update|delete|reset|refresh)\s*\(/);
});

test('production Macro lazy loads with identity-based remounting and only read-only navigation context', async () => {
  assert.match(app, /const MacroPage = lazy\(\(\) => import\('\.\/pages\/MacroLivePage\.jsx'\)\)/);
  const pageElement = app.match(/: isMacroPage\s*\? (<MacroPage\b[^\n]+\/>)/)?.[1];
  assert.ok(pageElement, 'execute the real production route element');
  const result = await transformWithOxc(`
    import React from ${JSON.stringify(import.meta.resolve('react'))};
    export function MacroPage() { return null; }
    export function route(user, closeMacro) { return (${pageElement}); }
  `, 'macro-route.jsx', { jsx: { runtime: 'classic' } });
  const { route, MacroPage } = await import(dataUrl(result.code));
  const closeMacro = () => {};
  const first = route({ id: 'first-user' }, closeMacro);
  const second = route({ id: 'second-user' }, closeMacro);
  const signedOut = route(null, closeMacro);
  assert.equal(first.type, MacroPage);
  assert.equal(first.key, 'first-user');
  assert.equal(second.key, 'second-user');
  assert.notEqual(first.key, second.key, 'switching accounts remounts the page');
  assert.deepEqual(first.props.ctx, { userId: 'first-user', closeMacro });
  assert.deepEqual(second.props.ctx, { userId: 'second-user', closeMacro });
  assert.equal(signedOut.key, '');
  assert.deepEqual(signedOut.props.ctx, { userId: '', closeMacro });
  assert.deepEqual(Object.keys(first.props), ['ctx'], 'no mock, provider key, ledger, refresh or mutation props enter the production route');
});

test('Macro owns its standalone top safe area and retains the dark shell with space for bottom navigation', () => {
  const classExpression = app.match(/className=\{(`min-h-screen[^\n]+`)\}/)?.[1];
  const paddingExpression = app.match(/style=\{\{ paddingTop: (isStandalonePage[^\n]+) \}\}/)?.[1];
  assert.ok(classExpression && paddingExpression);
  const shell = new Function('activePage', 'darkShell', `${flags}; return { isStandalonePage, isFullBleedPage, hideBottomNavigation, className: ${classExpression}, paddingTop: ${paddingExpression} };`);
  for (const darkShell of [true, false]) {
    const macro = shell('macro', darkShell);
    assert.equal(macro.isStandalonePage, true);
    assert.equal(macro.isFullBleedPage, false);
    assert.equal(macro.hideBottomNavigation, false);
    assert.equal(macro.paddingTop, 0, 'the Macro header owns the top safe area');
    assert.ok(macro.className.includes('bg-[#08090b]'));
    assert.ok(macro.className.includes('pb-24'));
  }
  assert.equal(shell(null, true).isStandalonePage, false);
  const headerRule = read('src/pages/MacroPage.css').match(/\.macro-header\s*\{([^}]+)\}/)?.[1];
  assert.match(headerRule || '', /padding:\s*calc\(env\(safe-area-inset-top\)\s*\+/);
});

test('Macro renders all five real bottom tabs, highlights Trades and preserves their navigation callbacks', async () => {
  const start = app.indexOf('{!hideBottomNavigation && (');
  const end = app.indexOf('\n      </div>', start);
  assert.ok(start >= 0 && end > start);
  const bottomNavigation = app.slice(start, end);
  const result = await transformWithOxc(`
    import React from ${JSON.stringify(import.meta.resolve('react'))};
    import { t } from ${JSON.stringify(new URL('../src/lib/i18n.js', import.meta.url).href)};
    const Home = () => null, ListChecks = Home, Wallet = Home, Target = Home, Settings = Home, WifiOff = Home;
    function ReportBottomNavIcon() { return null; }
    export function renderBottomNavigation(activePage, activeTab, language, handleBottomTabClick) {
      const darkShell = true, showQuoteFetchError = false, fetchError = '';
      ${flags}
      return <>${bottomNavigation}</>;
    }
  `, 'macro-bottom-navigation.jsx', { jsx: { runtime: 'classic' } });
  const { renderBottomNavigation } = await import(dataUrl(result.code));
  for (const language of ['zh', 'en']) {
    const clicks = [];
    const tree = renderBottomNavigation('macro', 'trades', language, tabId => clicks.push(tabId));
    const buttons = nodesOfType(tree, 'button');
    const ids = ['home', 'trades', 'analysis', 'review', 'settings'];
    assert.equal(buttons.length, 5);
    assert.deepEqual(buttons.map(button => button.props['aria-current']), [undefined, 'page', undefined, undefined, undefined]);
    assert.deepEqual(clicks, []);
    buttons.forEach(button => button.props.onClick());
    assert.deepEqual(clicks, ids, 'execute each callback from the real bottom-navigation JSX');
    const nav = nodesOfType(tree, 'div').find(node => node.props.className?.includes('report-bottom-nav fixed'));
    assert.equal(nav.props.style.paddingBottom, 'env(safe-area-inset-bottom)');
    assert.ok(nodesOfType(tree, 'div').some(node => node.props.className?.includes('grid-cols-5')));
  }
});
