import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const preview = read('src/DevVisualPreview.jsx');
const auth = read('src/AuthGate.jsx');
const pages = ['overview', 'rates', 'inflation', 'stress', 'liquidity', 'calendar', 'growth'];
const inflationTabs = ['energy', 'expectations', 'dollarGold'];
const states = ['ready', 'loading', 'error', 'empty', 'stale', 'partial'];
const initialTabBody = preview.match(/const \[activeTab, setActiveTab\] = React\.useState\(\(\) => \{([\s\S]*?)\n  \}\);/)?.[1];
const optionsBody = preview.match(/const macroPreview = React\.useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1];
assert.ok(initialTabBody && optionsBody, 'exercise the actual preview query readers');
const initialTab = new Function('window', 'initialTab', initialTabBody);
const options = new Function('window', optionsBody);
const windowFor = search => ({ location: { search } });
const macroElement = preview.match(/: activeTab === 'macro'\s*\? (<MacroPage\b[^\n]+\/>)/)?.[1];
assert.ok(macroElement, 'Macro is mounted within the existing standard preview shell');
const transformed = await transformWithOxc(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  export function MacroPage() { return null; }
  export function route(macroPreview, setActiveTab, window) { return (${macroElement}); }
`, 'MacroPreviewRoute.jsx', { jsx: { runtime: 'classic' } });
const { route, MacroPage } = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`);

test('Macro preview stays development-only while its production route retains authentication', () => {
  assert.match(preview, /const MacroPage = lazy\(\(\) => import\('\.\/pages\/MacroLivePage\.jsx'\)\)/);
  const gate = auth.match(/function isDevVisualPreviewRequested\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(gate);
  const requested = new Function('DEV', 'window', `${gate.replaceAll('import.meta.env.DEV', 'DEV')}; return isDevVisualPreviewRequested();`);
  const location = windowFor('?devPreview=1&tab=macro');
  assert.equal(requested(true, location), true);
  assert.equal(requested(false, location), false, 'the query never bypasses production authentication');
  assert.equal(requested(true, windowFor('?tab=macro')), false);
  assert.match(auth, /if \(import\.meta\.env\.DEV && \(!isSupabaseConfigured \|\| isDevVisualPreviewRequested\(\)\)\) \{[\s\S]*?lazy\(\(\) => import\('\.\/DevVisualPreview\.jsx'\)\)/);
  assert.match(read('src/App.jsx'), /const MacroPage = lazy\(\(\) => import\('\.\/pages\/MacroLivePage\.jsx'\)\)/);
  for (const file of ['src/components/HomeWatchlistReport.jsx', 'src/pages/WatchlistStockDetailPage.jsx',
    'server/quote/stockRsi.js', 'server/quote/stockDecisionModel.js']) {
    assert.doesNotMatch(read(file), /MacroPage|openMacro|closeMacro|macroPage|macroState|id: 'macro'/, file);
  }
});

test('all six Macro sections and Growth URLs pass their own initial view into the same module', () => {
  for (const page of pages) {
    const location = windowFor(`?devPreview=1&tab=macro&macroPage=${page}&visualWidth=390`);
    assert.equal(initialTab(location, ''), 'macro');
    const element = route(options(location), () => {}, location);
    assert.equal(element.type, MacroPage);
    assert.equal(element.props.initialPage, page);
    assert.equal(element.props.initialInflationTab, 'energy');
    assert.equal(element.props.previewState, 'ready');
    assert.deepEqual(Object.keys(element.props), ['initialPage', 'initialInflationTab', 'previewState', 'mock', 'onBack']);
  }
  assert.deepEqual(options(windowFor('?devPreview=1&tab=macro')), {
    initialPage: 'overview', initialInflationTab: 'energy', previewState: 'ready', mock: false,
  });
  assert.deepEqual(options(undefined), options(windowFor('')));
  assert.equal(initialTab(windowFor('?tab=unknown'), ''), 'analysis');
});

test('Inflation tabs and explicit mock states are query-controlled without account or provider inputs', () => {
  for (const tab of inflationTabs) {
    for (const state of states) {
      const location = windowFor(`?devPreview=1&tab=macro&macroPage=inflation&macroTab=${tab}&macroState=${state}`);
      assert.deepEqual(options(location), { initialPage: 'inflation', initialInflationTab: tab, previewState: state, mock: true });
    }
  }
  assert.doesNotMatch(`${optionsBody}\n${macroElement}`, /fetch|supabase|stockRsi|stockTrades|investmentSummary|quoteRows|db\./);
});

test('the preview preserves five navigation items and Macro returns to Trades without changing stock routes', () => {
  const nav = preview.match(/const nav = \[([\s\S]*?)\n  \];/)?.[1];
  assert.ok(nav);
  assert.deepEqual([...nav.matchAll(/id: '([^']+)'/g)].map(match => match[1]), ['home', 'trades', 'analysis', 'review', 'settings']);
  const activeExpression = preview.match(/const isActive = tab\.id === activeTab([\s\S]*?);/)?.[0];
  assert.ok(activeExpression);
  const isActive = new Function('activeTab', 'tab', `${activeExpression}; return isActive;`);
  assert.equal(isActive('macro', { id: 'trades' }), true);
  for (const id of ['home', 'analysis', 'review', 'settings']) assert.equal(isActive('macro', { id }), false);
  assert.equal(isActive('stock-decision', { id: 'trades' }), true);
  assert.equal(isActive('watchlist-stock-detail', { id: 'home' }), true);
  const calls = [];
  const element = route(options(windowFor('')), value => calls.push(['tab', value]), { scrollTo: (...args) => calls.push(['scroll', ...args]) });
  assert.ok(React.isValidElement(element));
  element.props.onBack();
  assert.deepEqual(calls, [['tab', 'trades'], ['scroll', 0, 0]]);
});

test('Macro uses the standard dark shell and owns its header safe area without adding a second bottom bar', () => {
  const shell = preview.slice(preview.indexOf('  const nav = ['));
  const classExpression = shell.match(/className=\{(`min-h-screen[^\n]+`)\}/)?.[1];
  const paddingExpression = shell.match(/paddingTop: ([^\n]+),/)?.[1];
  assert.ok(classExpression && paddingExpression);
  const readClass = new Function('activeTab', `return ${classExpression};`);
  const readPadding = new Function('activeTab', `return ${paddingExpression};`);
  assert.match(readClass('macro'), /bg-\[#08090b\]/);
  assert.match(readClass('macro'), /pb-24/);
  assert.match(readClass('macro'), /px-4/);
  assert.equal(readPadding('macro'), 0);
  assert.equal(readPadding('trades'), 'calc(1rem + env(safe-area-inset-top))');
  assert.equal((shell.match(/className="report-bottom-nav fixed/g) || []).length, 1);
  assert.match(shell, /paddingBottom: 'env\(safe-area-inset-bottom\)'/);
});

test('real observations are default; mock values require an explicit query', () => {
  assert.equal(options(windowFor('?devPreview=1&tab=macro')).mock, false);
  assert.equal(options(windowFor('?devPreview=1&tab=macro&macroData=mock')).mock, true);
  const live = read('src/pages/MacroLivePage.jsx');
  assert.match(live, /fetchMacroData/);
  assert.doesNotMatch(live, /MACRO_MOCK_SNAPSHOT/);
});
