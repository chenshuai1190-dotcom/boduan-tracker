import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const preview = read('src/DevVisualPreview.jsx');
const trades = read('src/tabs/TradesTab.jsx');
const auth = read('src/AuthGate.jsx');
const catalogSource = read('src/components/TradeToolsCatalog.jsx');
const transformedCatalog = await transformWithOxc(catalogSource, 'TradeToolsCatalog.jsx', { jsx: { runtime: 'classic' } });
const compiledCatalog = transformedCatalog.code
  .replace(/import\s*(['"])\.\/TradeToolsCatalog\.css\1;?/g, '')
  .replace(/from (["'])(react|lucide-react)\1/g, (_, quote, module) => `from ${JSON.stringify(import.meta.resolve(module))}`)
  .replace(/from (["'])\.\.\/lib\/i18n\.js\1/g, `from ${JSON.stringify(new URL('../src/lib/i18n.js', import.meta.url).href)}`);
const { default: TradeToolsCatalog } = await import(`data:text/javascript;base64,${Buffer.from(compiledCatalog).toString('base64')}`);
const initialTabBody = preview.match(/const \[activeTab, setActiveTab\] = React\.useState\(\(\) => \{([\s\S]*?)\n  \}\);/)?.[1];
const debtElement = preview.match(/: activeTab === 'debt-manager'\s*\? (<DebtManagerPage\b[^\n]+\/>)/)?.[1];
const openBody = preview.match(/openDebtManager: \(\) => \{([^}]+)\}/)?.[1];
const handlerBody = trades.match(/<TradeToolsCatalog\b[^>]*onSelect=\{\(toolId\) => \{([\s\S]*?)\n\s*\}\} \/>/)?.[1];
const enabledExpression = trades.match(/<TradeToolsCatalog\b[^>]*enableDebtManager=\{([^}]+)\}/)?.[1];
assert.ok(initialTabBody && debtElement && openBody && handlerBody && enabledExpression, 'exercise the actual preview and Trades navigation');
const initialTab = new Function('window', 'initialTab', initialTabBody);
const openDebtManager = new Function('setActiveTab', 'window', openBody);
const selectTool = new Function('toolId', 'setShowAllToolsModal', 'setToolPanel', 'openDebtManager', handlerBody);
const isEnabled = new Function('openDebtManager', `return ${enabledExpression};`);
const transformedRoute = await transformWithOxc(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  export function DebtManagerPage() { return null; }
  export function route(setActiveTab, window) { return (${debtElement}); }
`, 'DebtManagerPreviewRoute.jsx', { jsx: { runtime: 'classic' } });
const { route, DebtManagerPage } = await import(`data:text/javascript;base64,${Buffer.from(transformedRoute.code).toString('base64')}`);

function nodesOfType(node, type) {
  if (!React.isValidElement(node)) return [];
  return [...(node.type === type ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodesOfType(child, type))];
}

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
}

function renderCatalog(props = {}) {
  let tree;
  function Capture() {
    tree = TradeToolsCatalog(props);
    return tree;
  }
  const html = renderToStaticMarkup(React.createElement(Capture));
  return { tree, html };
}

test('catalog keeps eight entries unless its parent supplies a working debt opener', () => {
  for (const opener of [undefined, null, false, 'debt-manager']) {
    assert.equal(isEnabled(opener), false);
    const { tree } = renderCatalog({ enableDebtManager: isEnabled(opener) });
    assert.equal(nodesOfType(tree, 'button').length, 8);
    assert.equal(nodesOfType(tree, 'section').length, 3);
    assert.equal(nodesOfType(tree, 'button').some(button => button.props['data-tool-id'] === 'debt-manager'), false);
  }
  assert.equal(nodesOfType(renderCatalog().tree, 'button').length, 8, 'omitting the opt-in also preserves production defaults');
  assert.equal(isEnabled(() => {}), true);
});

test('preview catalog adds one personal tool with Chinese and English text and a real icon', () => {
  for (const [language, title, description, groupTitle] of [
    ['zh', '资产负债', '记录欠款与还款', '个人工具'],
    ['en', 'Assets & Liabilities', 'Track debts and repayments', 'Personal tools'],
  ]) {
    const selected = [];
    const { tree, html } = renderCatalog({ language, enableDebtManager: true, onSelect: id => selected.push(id) });
    const groups = nodesOfType(tree, 'section');
    const buttons = nodesOfType(tree, 'button');
    assert.equal(groups.length, 4);
    assert.equal(buttons.length, 9);
    assert.equal(textContent(nodesOfType(groups.at(-1), 'h3')[0]), groupTitle);
    const debt = buttons.find(button => button.props['data-tool-id'] === 'debt-manager');
    assert.ok(debt);
    assert.equal(debt.props.className, 'trade-tool-card');
    assert.ok(textContent(debt).includes(title));
    assert.ok(textContent(debt).includes(description));
    assert.equal((renderToStaticMarkup(debt).match(/<svg\b/g) || []).length, 2);
    assert.doesNotMatch(html, /trades\.debtManager|trades\.toolsPersonal/);
    assert.deepEqual(selected, []);
    debt.props.onClick();
    assert.deepEqual(selected, ['debt-manager']);
  }
});

test('selecting the actual catalog entry closes the catalog and opens the preview page, whose back action returns to Trades', () => {
  const calls = [];
  const setActiveTab = value => calls.push(['tab', value]);
  const window = { scrollTo: (...args) => calls.push(['scroll', ...args]) };
  selectTool('debt-manager', value => calls.push(['catalog', value]), value => calls.push(['panel', value]), () => openDebtManager(setActiveTab, window));
  assert.deepEqual(calls, [['catalog', false], ['panel', ''], ['tab', 'debt-manager'], ['scroll', 0, 0]]);
  const element = route(setActiveTab, window);
  assert.equal(element.type, DebtManagerPage);
  assert.deepEqual(Object.keys(element.props), ['preview', 'onBack'], 'the preview receives only its explicit demo flag and back action');
  calls.length = 0;
  element.props.onBack();
  assert.deepEqual(calls, [['tab', 'trades'], ['scroll', 0, 0]]);
});

test('the debt preview URL remains guarded by DEV and separate from the production route', () => {
  const location = { location: { search: '?devPreview=1&tab=debt-manager&visualWidth=390' } };
  assert.equal(initialTab(location, ''), 'debt-manager');
  assert.equal(initialTab(undefined, 'debt-manager'), 'debt-manager');
  assert.match(preview, /const DebtManagerPage = lazy\(\(\) => import\('\.\/pages\/DebtManagerPage\.jsx'\)\)/);
  const gate = auth.match(/function isDevVisualPreviewRequested\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(gate);
  const requested = new Function('DEV', 'window', `${gate.replaceAll('import.meta.env.DEV', 'DEV')}; return isDevVisualPreviewRequested();`);
  assert.equal(requested(true, location), true);
  assert.equal(requested(false, location), false);
  assert.equal(requested(true, { location: { search: '?tab=debt-manager' } }), false);
  assert.match(auth, /if \(import\.meta\.env\.DEV && \(!isSupabaseConfigured \|\| isDevVisualPreviewRequested\(\)\)\) \{[\s\S]*?lazy\(\(\) => import\('\.\/DevVisualPreview\.jsx'\)\)/);
  for (const file of ['src/tabs/AnalysisTab.jsx', 'api/quote.js']) {
    assert.doesNotMatch(read(file), /DebtManager|debt-manager|openDebtManager/, file);
  }
  assert.doesNotMatch(`${debtElement}\n${openBody}\n${catalogSource}`, /\bfetch\s*\(|supabase|localStorage|sessionStorage|stock_trades|cost_basis_trades|swing_waves|asset_accounts|investmentSummary/);
});

test('production catalog opens an account-scoped debt page and back returns to Trades', async () => {
  const openBody = app.match(/const openDebtManager = useCallback\(\(\) => \{([^}]+)\}, \[\]\);/)?.[1];
  const closeBody = app.match(/const closeDebtManager = useCallback\(\(\) => \{([^}]+)\}, \[\]\);/)?.[1];
  const pageElement = app.match(/: isDebtManagerPage\s*\? (<DebtManagerPage\b[^\n]+\/>)/)?.[1];
  assert.ok(openBody && closeBody && pageElement);
  assert.match(app, /const DebtManagerPage = lazy\(\(\) => import\('\.\/pages\/DebtManagerPage\.jsx'\)\)/);
  const tabCtx = app.slice(app.indexOf('const tabCtx = {'), app.indexOf('const activeTabCtx ='));
  assert.match(tabCtx, /\bopenDebtManager,/);
  const calls = [];
  const setActiveTab = value => calls.push(['tab', value]);
  const setActivePage = value => calls.push(['page', value]);
  const open = new Function('setActiveTab', 'setActivePage', openBody);
  const close = new Function('setActiveTab', 'setActivePage', closeBody);
  const selected = [];
  selectTool('debt-manager', value => calls.push(['catalog', value]), value => calls.push(['panel', value]), () => {
    selected.push('debt-manager');
    open(setActiveTab, setActivePage);
  });
  assert.deepEqual(selected, ['debt-manager']);
  assert.deepEqual(calls, [['catalog', false], ['panel', ''], ['tab', 'trades'], ['page', 'debt-manager']]);
  const transformed = await transformWithOxc(`
    import React from ${JSON.stringify(import.meta.resolve('react'))};
    export function DebtManagerPage() { return null; }
    export function route(user, supabase, closeDebtManager, language) { return (${pageElement}); }
  `, 'DebtManagerProductionRoute.jsx', { jsx: { runtime: 'classic' } });
  const { route, DebtManagerPage: Page } = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`);
  const user = { id: 'user-a' };
  const client = { from() { throw new Error('route must not query until page mounts'); } };
  const element = route(user, client, () => close(setActiveTab, setActivePage), 'en');
  assert.equal(element.type, Page);
  assert.equal(element.key, user.id, 'switching accounts remounts the debt page');
  assert.deepEqual(Object.keys(element.props).sort(), ['language', 'onBack', 'supabase', 'userId']);
  assert.equal(element.props.language, 'en');
  assert.equal(element.props.supabase, client);
  assert.equal(element.props.userId, user.id);
  calls.length = 0;
  element.props.onBack();
  assert.deepEqual(calls, [['tab', 'trades'], ['page', null]]);
});

test('production debt page owns full-bleed dark layout with no bottom navigation', () => {
  const debtFlag = app.match(/const isDebtManagerPage = ([^;]+);/)?.[1];
  const standalone = app.match(/const isStandalonePage = ([^;]+);/)?.[1];
  const fullBleed = app.match(/const isFullBleedPage = ([^;]+);/)?.[1];
  const hideNav = app.match(/const hideBottomNavigation = ([^;]+);/)?.[1];
  assert.ok(debtFlag && standalone && fullBleed && hideNav);
  assert.equal(new Function('activePage', `return ${debtFlag};`)('debt-manager'), true);
  assert.match(standalone, /\|\| isDebtManagerPage$/);
  assert.match(fullBleed, /\|\| isDebtManagerPage$/);
  assert.match(hideNav, /\|\| isDebtManagerPage$/);
  assert.match(app, /paddingTop: isStandalonePage \? 0 :/);
  assert.match(app, /isMacroPage \|\| isDebtManagerPage \? 'bg-\[#08090b\]'/);
});

test('the debt page is edge to edge and owns its return navigation without a global bottom bar', () => {
  const shell = preview.slice(preview.indexOf('  const nav = ['));
  const classExpression = shell.match(/className=\{(`min-h-screen[^\n]+`)\}/)?.[1];
  const paddingExpression = shell.match(/paddingTop: ([^\n]+),/)?.[1];
  const navGuard = shell.match(/\{(activeTab !== 'pnl-report'[^\n]+) && \(\n\s*<div className="report-bottom-nav/)?.[1];
  assert.ok(classExpression && paddingExpression && navGuard);
  const readClass = new Function('activeTab', `return ${classExpression};`);
  const readPadding = new Function('activeTab', `return ${paddingExpression};`);
  const showNav = new Function('activeTab', `return ${navGuard};`);
  assert.match(readClass('debt-manager'), /\bpx-0\b/);
  assert.match(readClass('debt-manager'), /\bpb-0\b/);
  assert.equal(readPadding('debt-manager'), 0);
  assert.equal(showNav('debt-manager'), false);
  assert.equal(showNav('trades'), true);
  assert.equal(showNav('macro'), true);
  assert.match(readClass('trades'), /\bpx-4\b/);
  const nav = preview.match(/const nav = \[([\s\S]*?)\n  \];/)?.[1];
  assert.ok(nav);
  assert.deepEqual([...nav.matchAll(/id: '([^']+)'/g)].map(match => match[1]), ['home', 'trades', 'analysis', 'review', 'settings']);
});
