import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const tabSource = read('src/components/InvestmentAnalysisTabs.jsx');
const pageSource = read('src/pages/InvestmentComparisonPage.jsx');
const transformedTabs = await transformWithOxc(tabSource, 'InvestmentAnalysisTabs.jsx', { jsx: { runtime: 'classic' } });
const tabUrl = dataUrl(transformedTabs.code.replace(/from (["'])react\1/g, `from ${JSON.stringify(import.meta.resolve('react'))}`));
const { default: InvestmentAnalysisTabs } = await import(tabUrl);

function findAll(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => findAll(child, predicate))];
}

test('analysis tabs render the two bilingual choices with one active keyboard stop', () => {
  for (const englishMode of [false, true]) {
    for (const value of ['growth', 'drawdown']) {
      const tree = InvestmentAnalysisTabs({ value, englishMode, onChange() {} });
      const tabs = findAll(tree, node => node.props.role === 'tab');
      assert.equal(tree.props.role, 'tablist');
      assert.equal(tabs.length, 2);
      assert.deepEqual(tabs.map(node => node.props.children), englishMode ? ['Asset growth', 'Drawdown & recovery'] : ['资产增长', '回撤与修复']);
      assert.equal(tabs.filter(node => node.props['aria-selected']).length, 1);
      assert.equal(tabs.filter(node => node.props.tabIndex === 0).length, 1);
      for (const tab of tabs) {
        assert.equal(tab.props['aria-selected'], tab.props.id === `ic-tab-${value}`);
        assert.equal(tab.props['aria-controls'], 'ic-analysis-panel');
        assert.equal(tab.props.type, 'button');
      }
      const html = renderToStaticMarkup(tree);
      assert.match(html, englishMode ? /Investment analysis/ : /投资分析/);
      assert.doesNotMatch(html, /href=|localhost|127\.0\.0\.1|target=/);
    }
  }
});

test('analysis tabs click and keyboard actions select the view and move keyboard focus', () => {
  const selected = [], focused = [];
  const tabs = findAll(InvestmentAnalysisTabs({ value: 'growth', onChange: value => selected.push(value) }), node => node.props.role === 'tab');
  tabs[1].props.onClick();
  tabs[0].props.onClick();
  assert.deepEqual(selected, ['drawdown', 'growth']);
  const focusTargets = [0, 1].map(index => ({ focus: () => focused.push(index) }));
  let prevented = 0;
  for (const [index, key, expected] of [[0, 'ArrowRight', 1], [1, 'ArrowRight', 0], [0, 'ArrowLeft', 1], [1, 'ArrowLeft', 0], [1, 'Home', 0], [0, 'End', 1]]) {
    tabs[index].props.onKeyDown({ key, preventDefault: () => { prevented += 1; }, currentTarget: { parentElement: { querySelectorAll: () => focusTargets } } });
    assert.equal(selected.at(-1), expected === 0 ? 'growth' : 'drawdown');
    assert.equal(focused.at(-1), expected);
  }
  tabs[0].props.onKeyDown({ key: 'Tab', preventDefault: () => assert.fail('Tab must preserve normal navigation') });
  assert.equal(prevented, 6);
});

// Execute the production page and its loading effect with an in-memory provider.
// Persistent memo/ref/effect slots let a real tab event demonstrate that switching
// analysis does not start another history request or recreate the shared model.
const hookUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  let slots = [], cursor = 0, effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  export function reset() { for (const slot of slots) slot?.cleanup?.(); slots = []; cursor = 0; effects = []; }
  export function render(Component, props) { cursor = 0; return Component(props); }
  export async function flush() { const pending = effects; effects = []; for (const effect of pending) effect(); await Promise.resolve(); await Promise.resolve(); }
  function useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; const slot = slots[index]; return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; }
  function useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; }
  function useMemo(callback, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback(), deps }; return slots[index].value; }
  function useEffect(callback, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) { const prior = slots[index]; slots[index] = { deps }; effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = callback(); }); } }
  export default { ...React, useState, useRef, useMemo, useEffect, useLayoutEffect: useEffect, useCallback: (callback, deps) => useMemo(() => callback, deps), useId: () => 'analysis-test' };
`);
const hooks = await import(hookUrl);
const sourceUrl = dataUrl(`
  let fixture;
  export const calls = [];
  export function configure(data) { fixture = data; calls.length = 0; }
  export function getInvestmentComparisonExpectedCloseDate() { return '2026-09-04'; }
  export async function loadInvestmentComparison(options) { calls.push(options); return typeof fixture === 'function' ? fixture(options) : fixture; }
  export async function searchInvestmentSymbols() { throw new Error('Search should not run during analysis switching'); }
`);
const source = await import(sourceUrl);
const chartUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  export default function Chart() { return React.createElement('div', { 'data-test-growth-chart': true }); }
  export const formatInvestmentAmount = value => String(value);
  export const formatInvestmentPercent = value => String(value);
  export const investmentChangeColor = () => '#fff';
  export const investmentRank = () => 'tied';
  export const investmentRankColor = () => '#fff';
`);
const drawdownUrl = dataUrl(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  export default function Drawdown() { return React.createElement('div', { 'data-test-drawdown-view': true }); }
`);
const presetsUrl = dataUrl('export default function Presets() { return null; }');
let pageCode = (await transformWithOxc(pageSource, 'InvestmentComparisonPage.jsx', { jsx: { runtime: 'classic' } })).code;
const imports = new Map([
  ['react', hookUrl], ['react-dom', import.meta.resolve('react-dom')], ['lucide-react', import.meta.resolve('lucide-react')],
  ['../components/InvestmentAnalysisTabs.jsx', tabUrl], ['../components/InvestmentComparisonChart.jsx', chartUrl],
  ['../components/InvestmentDrawdownView.jsx', drawdownUrl], ['../components/InvestmentSymbolPresets.jsx', presetsUrl],
  ['../lib/investmentComparison.js', sourceUrl], ['../lib/investmentComparisonModel.js', new URL('../src/lib/investmentComparisonModel.js', import.meta.url).href],
]);
pageCode = pageCode.replace(/from (["'])([^"']+)\1/g, (match, _quote, path) => imports.has(path) ? `from ${JSON.stringify(imports.get(path))}` : match)
  .replace(/import ["'][^"']+\.css["'];?/g, '').replaceAll('import.meta.env.DEV', 'false');
const { default: InvestmentComparisonPage } = await import(dataUrl(pageCode));

function fixture() {
  const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  return {
    version: 1, source: 'EODHD_EOD', priceBasis: 'adjusted_close', currency: 'USD', symbols: ['QQQ', 'TQQQ'],
    expectedAsOfDate: dates.at(-1), asOfDate: dates.at(-1), availableFromDate: dates[0], fetchedAt: '2026-09-08T12:00:00Z', stale: false, staleReason: '',
    series: Object.fromEntries(['QQQ', 'TQQQ'].map((symbol, offset) => [symbol, { symbol, name: `${symbol} synthetic fixture`, type: 'ETF', currency: 'USD', priceBasis: 'adjusted_close', rows: dates.map((date, index) => ({ date, close: 100 + index * (offset + 1) })) }])),
  };
}

test('production analysis switching retains shared settings and model without another provider load', async () => {
  hooks.reset();
  source.configure(fixture());
  const props = { ctx: { userId: 'synthetic-owner', language: 'en' } };
  const render = () => hooks.render(InvestmentComparisonPage, props);
  render(); await hooks.flush(); render(); await hooks.flush();
  let tree = render();
  const tab = () => findAll(tree, node => node.type === InvestmentAnalysisTabs)[0];
  const shared = () => {
    assert.equal(findAll(tree, node => node.type === 'header' && node.props.className === 'ic-header').length, 1);
    assert.equal(findAll(tree, node => node.props.className === 'ic-settings').length, 1);
    assert.equal(findAll(tree, node => node.type === 'input' && node.props['aria-label'] === 'Principal per investment in US dollars').length, 1);
    const panel = findAll(tree, node => node.props.role === 'tabpanel')[0];
    assert.equal(panel.props['aria-labelledby'], `ic-tab-${tab().props.value}`);
    assert.equal(panel.props.id, 'ic-analysis-panel');
  };
  shared();
  assert.equal(tab().props.value, 'growth');
  const growthChart = findAll(tree, node => typeof node.type === 'function' && node.props.snapshot && node.props.model)[0];
  const originalModel = growthChart.props.model;
  assert.equal(source.calls.length, 1);
  tab().props.onChange('drawdown'); tree = render(); await hooks.flush(); tree = render();
  shared();
  assert.equal(tab().props.value, 'drawdown');
  const drawdown = findAll(tree, node => typeof node.type === 'function' && node.props.model && !node.props.snapshot)[0];
  assert.strictEqual(drawdown.props.model, originalModel);
  assert.equal(drawdown.props.englishMode, true);
  assert.equal(source.calls.length, 1, 'view changes must reuse the authenticated history load');
  const principalInput = findAll(tree, node => node.type === 'input' && node.props.type === 'number')[0];
  principalInput.props.onChange({ target: { value: '2000000' } }); tree = render(); await hooks.flush(); tree = render();
  assert.equal(findAll(tree, node => typeof node.type === 'function' && node.props.model && !node.props.snapshot)[0].props.model.principal, 2000000);
  assert.equal(source.calls.length, 1, 'changing principal recalculates locally');
  tab().props.onChange('growth'); tree = render(); await hooks.flush(); tree = render();
  shared();
  assert.equal(findAll(tree, node => node.type === 'input' && node.props.type === 'number')[0].props.value, '2000000');
  assert.equal(source.calls.length, 1);
  hooks.reset();
});

test('production tabs do not depend on preview routes or cross-port navigation', () => {
  assert.doesNotMatch(tabSource, /import\.meta\.env|window\.location|location\.(?:href|assign|replace)|https?:\/\/|localhost|127\.0\.0\.1|target=/);
  assert.match(pageSource, /<InvestmentAnalysisTabs\b/);
  assert.match(pageSource, /analysisView === 'drawdown' \? <InvestmentDrawdownView\b/);
});

test('switching tabs while history is pending keeps the original request and renders its result in the selected view', async () => {
  hooks.reset();
  let resolveHistory;
  source.configure(new Promise(resolve => { resolveHistory = resolve; }));
  const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-pending-owner', language: 'zh' } });
  let tree = render(); await hooks.flush(); tree = render();
  findAll(tree, node => node.type === InvestmentAnalysisTabs)[0].props.onChange('drawdown');
  tree = render(); await hooks.flush(); tree = render();
  assert.equal(source.calls.length, 1);
  assert.equal(source.calls[0].signal.aborted, false);
  assert.equal(findAll(tree, node => node.props.className === 'ic-loading').length, 1);
  resolveHistory(fixture()); await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  assert.equal(findAll(tree, node => node.type === InvestmentAnalysisTabs)[0].props.value, 'drawdown');
  assert.equal(findAll(tree, node => typeof node.type === 'function' && node.props.model && !node.props.snapshot).length, 1);
  assert.equal(findAll(tree, node => node.props.className === 'ic-loading').length, 0);
  assert.equal(source.calls.length, 1);
  hooks.reset();
});

test('changing the starting year requests its range and prevents old-year responses from replacing it', async () => {
  hooks.reset();
  const pending = new Map();
  source.configure(({ startYear }) => new Promise(resolve => pending.set(startYear, resolve)));
  const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-year-owner', language: 'zh' } });
  let tree = render(); await hooks.flush(); tree = render();
  assert.equal(source.calls[0].startYear, 2011);
  findAll(tree, node => node.type === 'select' && node.props['aria-label'] === '起始年份')[0].props.onChange({ target: { value: '2020' } });
  tree = render(); await hooks.flush(); tree = render();
  assert.deepEqual(source.calls.map(call => call.startYear), [2011, 2020]);
  assert.equal(source.calls[0].signal.aborted, true);
  assert.equal(source.calls[1].signal.aborted, false);
  pending.get(2020)({ ...fixture(), startYear: 2020 });
  await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  const selectedModel = findAll(tree, node => typeof node.type === 'function' && node.props.snapshot && node.props.model)[0].props.model;
  assert.equal(selectedModel.startYear, 2020);
  pending.get(2011)({ ...fixture(), startYear: 2011 });
  await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  assert.strictEqual(findAll(tree, node => typeof node.type === 'function' && node.props.snapshot && node.props.model)[0].props.model, selectedModel);
  assert.equal(findAll(tree, node => node.props.role === 'alert').length, 0);
  hooks.reset();
});

test('an old-year error cannot hide a completed request for the selected year', async () => {
  hooks.reset();
  let rejectOld;
  source.configure(({ startYear }) => startYear === 2011 ? new Promise((_resolve, reject) => { rejectOld = reject; }) : { ...fixture(), startYear });
  const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-year-error-owner', language: 'zh' } });
  let tree = render(); await hooks.flush(); tree = render();
  findAll(tree, node => node.type === 'select' && node.props['aria-label'] === '起始年份')[0].props.onChange({ target: { value: '2020' } });
  tree = render(); await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  rejectOld(Object.assign(new Error('old unavailable range'), { code: 'INVALID_DATA' }));
  await hooks.flush(); tree = render(); await hooks.flush(); tree = render();
  assert.equal(findAll(tree, node => node.props.role === 'alert').length, 0);
  assert.equal(findAll(tree, node => typeof node.type === 'function' && node.props.snapshot && node.props.model)[0].props.model.startYear, 2020);
  hooks.reset();
});

test('range errors preserve their code in production-page messages instead of becoming a network error', async () => {
  const text = node => !React.isValidElement(node) ? (typeof node === 'string' ? node : '') : React.Children.toArray(node.props.children).map(text).join(' ');
  for (const [code, expected] of [
    ['INVALID_DATA', '所选区间历史数据存在缺失或冲突，暂时无法对比。'],
    ['INSUFFICIENT_HISTORY', '所选标的在该起始年份后暂无足够的共同历史数据。'],
    ['INVALID_START_YEAR', '请选择已完成收盘年份范围内的起始年份。'],
  ]) {
    hooks.reset();
    source.configure(() => { throw Object.assign(new Error('test range error'), { code }); });
    const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-invalid-owner', language: 'zh' } });
    render(); await hooks.flush(); render(); await hooks.flush();
    const tree = render();
    const alert = findAll(tree, node => node.props.role === 'alert')[0];
    assert.ok(alert);
    assert.ok(text(alert).includes(expected));
    assert.ok(!text(alert).includes('历史数据暂时无法读取'));
    assert.equal(findAll(tree, node => typeof node.type === 'function' && node.props.model).length, 0);
  }
  hooks.reset();
});

test('invalid normalized history uses the same range diagnostic as an API INVALID_DATA error', async () => {
  hooks.reset();
  const invalid = fixture();
  invalid.series.QQQ.rows[0].close = null;
  source.configure(invalid);
  const render = () => hooks.render(InvestmentComparisonPage, { ctx: { userId: 'synthetic-model-error-owner', language: 'zh' } });
  render(); await hooks.flush(); render(); await hooks.flush();
  const tree = render();
  assert.equal(findAll(tree, node => node.props.role === 'status' && node.props.children === '所选区间历史数据存在缺失或冲突，暂时无法对比。').length, 1);
  hooks.reset();
});
